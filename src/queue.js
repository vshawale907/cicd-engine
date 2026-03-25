const Bull = require('bull');
require('dotenv').config();

// Bull gives us: job persistence, retries, delayed jobs, job states
// All stored in Redis automatically
const pipelineQueue = new Bull('pipeline-jobs', process.env.REDIS_URL);

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
