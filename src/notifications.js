/**
 * notifications.js — Slack failure notifications
 *
 * Uses Node's built-in fetch (Node 18+). No extra packages needed.
 * If SLACK_WEBHOOK_URL is not set, all calls are silently skipped.
 * Errors from Slack never affect pipeline results.
 */

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * Send a Slack notification. Only fires when status === 'failed'.
 *
 * @param {object} opts
 * @param {string} opts.status          - 'success' | 'failed'
 * @param {number} opts.runId
 * @param {number} opts.pipelineId
 * @param {string} opts.repoName
 * @param {string} opts.branch
 * @param {string} opts.commitSha
 * @param {string} opts.triggeredBy
 * @param {number} opts.durationSeconds
 */
async function notifySlack({ status, runId, pipelineId, repoName, branch, commitSha, triggeredBy, durationSeconds }) {
  // Only notify on failure
  if (status !== 'failed') return;

  // Silently skip if Slack isn't configured
  if (!SLACK_WEBHOOK_URL) {
    console.log('ℹ️  SLACK_WEBHOOK_URL not set — skipping Slack notification');
    return;
  }

  const shortSha = (commitSha || 'unknown').slice(0, 7);
  const logsUrl  = `${FRONTEND_URL}/runs/${runId}`;

  const payload = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '❌ Pipeline Failed',
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Repo:*\n${repoName}` },
          { type: 'mrkdwn', text: `*Branch:*\n${branch}` },
          { type: 'mrkdwn', text: `*Commit:*\n\`${shortSha}\`` },
          { type: 'mrkdwn', text: `*Triggered by:*\n${triggeredBy}` },
          { type: 'mrkdwn', text: `*Run ID:*\n#${runId}` },
          { type: 'mrkdwn', text: `*Duration:*\n${durationSeconds}s` },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '🔍 View Logs', emoji: true },
            url: logsUrl,
            style: 'danger',
          },
        ],
      },
      {
        type: 'divider',
      },
    ],
  };

  try {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.warn(`⚠️  Slack notification failed: HTTP ${res.status}`);
    } else {
      console.log(`📣 Slack notified: run #${runId} failed`);
    }
  } catch (err) {
    // Slack being down must NEVER affect the pipeline result
    console.warn(`⚠️  Slack notification error (non-fatal): ${err.message}`);
  }
}

module.exports = { notifySlack };
