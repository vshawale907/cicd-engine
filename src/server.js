const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
require('dotenv').config();

const webhookRouter = require('./webhook');
const pipelinesRouter = require('./routes/pipelines');
const runsRouter = require('./routes/runs');
const { subscribeToRun, unsubscribeFromRun } = require('./pubsub');
require('./db'); // Initialize DB connection on startup

const app = express();
const server = http.createServer(app);

// WebSocket server shares the same HTTP server, different path
const wss = new WebSocket.Server({ server, path: '/ws' });

app.use(cors());
app.use(express.json());

app.use('/webhook', webhookRouter);
app.use('/api/pipelines', pipelinesRouter);
app.use('/api/runs', runsRouter);
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// WebSocket: browser connects here to receive live logs
wss.on('connection', (ws) => {
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
