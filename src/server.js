const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
require('dotenv').config();

const webhookRouter = require('./webhook');
const pipelinesRouter = require('./routes/pipelines');
const runsRouter = require('./routes/runs');
const authRouter = require('./routes/auth');
const { subscribeToRun, unsubscribeFromRun } = require('./pubsub');
const { requireAuth, requireAdmin } = require('./middleware/auth');
const { verifyToken } = require('./auth');
require('./db'); // Initialize DB connection on startup

const app = express();
const server = http.createServer(app);

// WebSocket server shares the same HTTP server, different path
const wss = new WebSocket.Server({ server, path: '/ws' });

app.use(cors());
app.use(express.json());

// ─── Public routes ────────────────────────────────────────────────────────────
// Webhook MUST stay unauthenticated — GitHub cannot send JWT tokens
app.use('/webhook', webhookRouter);
app.use('/api/auth', authRouter);
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ─── Protected API routes ─────────────────────────────────────────────────────
// GET /api/pipelines — any authenticated user
app.get('/api/pipelines', requireAuth, (req, res, next) => {
  pipelinesRouter(req, res, next);
});

// POST /api/pipelines/:id/trigger — admin only
app.post('/api/pipelines/:id/trigger', requireAdmin, (req, res, next) => {
  pipelinesRouter(req, res, next);
});

// Mount full pipelines router (handles /api/pipelines/:id GET etc.) — requireAuth
app.use('/api/pipelines', requireAuth, pipelinesRouter);

// All runs routes — requireAuth
app.use('/api/runs', requireAuth, runsRouter);

// ─── WebSocket: verify token from query param ?token=xxx ──────────────────────
wss.on('connection', (ws, req) => {
  // Extract token from query string: ws://host/ws?token=xxx
  const url = new URL(req.url, `http://localhost`);
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
