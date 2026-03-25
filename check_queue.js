const Bull = require('bull');
require('dotenv').config();

const queue = new Bull('pipeline-jobs', process.env.REDIS_URL);
async function check() {
  const failed = await queue.getFailed(0, 5);
  failed.forEach(job => {
    console.log(`Job ${job.id} failed with reason:`, job.failedReason);
  });
  process.exit(0);
}
check();
