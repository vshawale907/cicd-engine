const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
require('dotenv').config();

const { router: webhookRouter } = require('./webhook');
const pipelinesRouter = require('./routes/pipelines');
const runsRouter = require('./routes/runs');
const authRouter = require('./routes/auth');
const metricsRouter = require('./routes/metrics');
const { subscribeToRun, unsubscribeFromRun } = require('./pubsub');
const { requireAuth, requireAdmin } = require('./middleware/auth');
const { verifyToken } = require('./auth');
require('./db'); // Initialize DB connection on startup

const app = express();
const server = http.createServer(app);

// WebSocket server shares the same HTTP server, different path
const wss = new WebSocket.Server({ server, path: '/ws' });

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());

// ─── Public routes (no auth) ───────────────────────────────────────────────────
// Webhook MUST stay unauthenticated — GitHub sends HMAC, not JWT tokens
app.use('/webhook', webhookRouter);
// Auth endpoints (register / login) are public by definition
app.use('/api/auth', authRouter);
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ─── Protected API routes ─────────────────────────────────────────────────────

app.use('/api/metrics', requireAuth, metricsRouter);

// ─── Pipelines — apply per-method auth at router level ────────────────────────
const securePipelinesRouter = express.Router();
// GET /api/pipelines and GET /api/pipelines/:id → any authenticated user
securePipelinesRouter.get('/', requireAuth, (req, res, next) => pipelinesRouter(req, res, next));
securePipelinesRouter.get('/:id', requireAuth, (req, res, next) => pipelinesRouter(req, res, next));
// POST /api/pipelines/:id/trigger → admin only
securePipelinesRouter.post('/:id/trigger', requireAdmin, (req, res, next) => pipelinesRouter(req, res, next));
app.use('/api/pipelines', securePipelinesRouter);

// ─── Runs — all endpoints require auth ────────────────────────────────────────
app.use('/api/runs', requireAuth, runsRouter);

// ─── WebSocket: verify token from query param ?token=xxx ──────────────────────
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');

  if (!token) {
    ws.close(1008, 'Missing token');
    return;
  }

  try {
    verifyToken(token);
  } catch {
    ws.close(1008, 'Invalid or expired token');
    return;
  }

  console.log('🔌 WebSocket client connected');
  let currentRunId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'subscribe') {
        if (currentRunId) unsubscribeFromRun(currentRunId);
        currentRunId = data.runId;
        console.log(`📡 Client subscribed to run ${currentRunId}`);

        // Redis pub/sub → WebSocket: every log line gets forwarded
        subscribeToRun(currentRunId, (logData) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(logData));
          }
        });

        ws.send(JSON.stringify({ type: 'subscribed', runId: currentRunId }));
      }
    } catch (err) {
      console.error('WS parse error:', err);
    }
  });

  ws.on('close', () => {
    console.log('🔌 Client disconnected');
    if (currentRunId) unsubscribeFromRun(currentRunId);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 WebSocket on ws://localhost:${PORT}/ws`);
  console.log(`❤️  Health: http://localhost:${PORT}/health\n`);
});
