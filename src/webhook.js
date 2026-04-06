const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('./db');
const pipelineQueue = require('./queue');

// Verify that the request actually came from GitHub (not a random attacker)
function verifySignature(req) {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return false;

  const expected = `sha256=${crypto
    .createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex')}`;

  // timingSafeEqual prevents timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// POST /webhook/github
router.post('/github', async (req, res) => {
  if (!verifySignature(req)) {
    console.warn('⚠️ Invalid webhook signature — rejected');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.headers['x-github-event'];
  if (event !== 'push') {
    return res.status(200).json({ message: `Ignored event: ${event}` });
  }

  const { repository, ref, after: commitSha, pusher } = req.body;
  const branch = ref.replace('refs/heads/', '');
  const repoUrl = repository.clone_url;
  const repoName = repository.full_name;

  console.log(`📨 Push to ${repoName}/${branch} by ${pusher?.name}`);

  try {
    // Find or create a pipeline for this repo + branch combo
    let result = await db.query(
      `SELECT id FROM pipelines WHERE repo_url = $1 AND branch = $2`,
      [repoUrl, branch]
    );

    let pipelineId;
    if (result.rows.length === 0) {
      const newPipeline = await db.query(
        `INSERT INTO pipelines (repo_url, repo_name, branch) VALUES ($1, $2, $3) RETURNING id`,
        [repoUrl, repoName, branch]
      );
      pipelineId = newPipeline.rows[0].id;
    } else {
      pipelineId = result.rows[0].id;
    }

    // Create run record
    const run = await db.query(
      `INSERT INTO runs (pipeline_id, commit_sha, status, triggered_by)
       VALUES ($1, $2, 'pending', $3) RETURNING id`,
      [pipelineId, commitSha, pusher?.name || 'unknown']
    );
    const runId = run.rows[0].id;

    // Add job to queue
    await pipelineQueue.add(
      { runId, pipelineId, repoUrl, branch, commitSha },
      { attempts: 3, backoff: 5000 } // retry 3 times, 5s apart
    );

    console.log(`✅ Queued run ${runId}`);

    // Must respond to GitHub within 10 seconds
    res.status(202).json({ message: 'Pipeline queued', runId, pipelineId });

  } catch (err) {
    console.error('❌ Webhook error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = { router, verifySignature };
