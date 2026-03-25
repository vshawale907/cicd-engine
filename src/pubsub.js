const Redis = require('ioredis');
require('dotenv').config();

// IMPORTANT: You need TWO separate Redis connections for pub/sub
// A single connection cannot both publish and subscribe — Redis limitation
const publisher = new Redis(process.env.REDIS_URL);
const subscriber = new Redis(process.env.REDIS_URL);

publisher.on('connect', () => console.log('✅ Redis publisher connected'));
subscriber.on('connect', () => console.log('✅ Redis subscriber connected'));

// Worker calls this → pushes log line to Redis channel
function publishLog(runId, line) {
  const channel = `run:${runId}:logs`;
  publisher.publish(channel, JSON.stringify({
    runId,
    line,
    timestamp: new Date().toISOString()
  }));
}

// Server calls this → listens on Redis channel, fires callback per line
function subscribeToRun(runId, callback) {
  const channel = `run:${runId}:logs`;
  subscriber.subscribe(channel);
  subscriber.on('message', (ch, message) => {
    if (ch === channel) {
      callback(JSON.parse(message));
    }
  });
}

function unsubscribeFromRun(runId) {
  subscriber.unsubscribe(`run:${runId}:logs`);
}

module.exports = { publishLog, subscribeToRun, unsubscribeFromRun };
