const Bull = require('bull');
require('dotenv').config();

const redisUrl = process.env.REDIS_URL;
const isTls = redisUrl && redisUrl.startsWith('rediss://');

// Bull gives us: job persistence, retries, delayed jobs, job states
// All stored in Redis automatically
const redisOpts = {
  family: 0,
  connectTimeout: 30000,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  keepAlive: 30000
};
if (isTls) redisOpts.tls = { rejectUnauthorized: false };

const pipelineQueue = new Bull('pipeline-jobs', redisUrl, { redis: redisOpts });

pipelineQueue.on('error', (err) => {
  console.error('❌ Queue error:', err.message);
});

pipelineQueue.on('waiting', (jobId) => {
  console.log(`📋 Job ${jobId} waiting in queue`);
});

pipelineQueue.on('active', (job) => {
  console.log(`🚀 Job ${job.id} started`);
});

pipelineQueue.on('completed', (job) => {
  console.log(`✅ Job ${job.id} completed`);
});

pipelineQueue.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} failed:`, err.message);
});

module.exports = pipelineQueue;
