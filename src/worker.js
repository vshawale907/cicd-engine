const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs');
const os = require('os');
const yaml = require('js-yaml');
require('dotenv').config();

const pipelineQueue = require('./queue');
const db = require('./db');
const { runStep } = require('./docker-runner');
const { publishLog } = require('./pubsub');
const { notifySlack } = require('./notifications');

// Process up to 2 jobs at the same time
pipelineQueue.process(2, async (job) => {
  const { runId, pipelineId, repoUrl, branch, commitSha } = job.data;
  const triggeredBy = job.data.triggeredBy || 'unknown';
  const tmpDir = path.join(os.tmpdir(), `cicd-run-${runId}`);
  const startTime = Date.now(); // ← Feature 3: track start time

  console.log(`\n🚀 Processing run ${runId} for ${repoUrl}`);

  let finalStatus = 'failed'; // default; overwritten on success

  try {
    // 1. Mark run as running
    await db.query(`UPDATE runs SET status = 'running' WHERE id = $1`, [runId]);
    publishLog(runId, `🚀 Pipeline started for commit ${commitSha}`);

    // 2. Clone the repo
    publishLog(runId, `📦 Cloning ${repoUrl} (branch: ${branch})...`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const git = simpleGit();
    await git.clone(repoUrl, tmpDir, ['--branch', branch, '--depth', '1']);
    publishLog(runId, `✅ Repository cloned`);

    // ─── Feature 2: YAML config support ───────────────────────────────────────
    // Priority: .pipeline.yml → .pipeline.yaml → .pipeline.json
    let config;
    const ymlPath  = path.join(tmpDir, '.pipeline.yml');
    const yamlPath = path.join(tmpDir, '.pipeline.yaml');
    const jsonPath = path.join(tmpDir, '.pipeline.json');

    if (fs.existsSync(ymlPath)) {
      config = yaml.load(fs.readFileSync(ymlPath, 'utf8'));
      publishLog(runId, `📋 Using config from .pipeline.yml`);
    } else if (fs.existsSync(yamlPath)) {
      config = yaml.load(fs.readFileSync(yamlPath, 'utf8'));
      publishLog(runId, `📋 Using config from .pipeline.yaml`);
    } else if (fs.existsSync(jsonPath)) {
      config = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      publishLog(runId, `📋 Using config from .pipeline.json`);
    } else {
      throw new Error(
        'No pipeline config found. Add one of: .pipeline.yml, .pipeline.yaml, .pipeline.json'
      );
    }
    // ──────────────────────────────────────────────────────────────────────────

    const steps = config.steps || [];
    publishLog(runId, `📋 Found ${steps.length} step(s) to run`);

    // 4. Run each step one by one
    let allPassed = true;

    for (const step of steps) {
      // ─── Feature 1: per-step Docker image ───────────────────────────────────
      const image = step.image || 'node:18-alpine';
      publishLog(runId, `\n▶️ Step: ${step.name}  [${image}]`);
      publishLog(runId, `   Command: ${step.command}`);
      // ────────────────────────────────────────────────────────────────────────

      // Insert step record
      const stepRes = await db.query(
        `INSERT INTO steps (run_id, name, command, status, started_at)
         VALUES ($1, $2, $3, 'running', NOW()) RETURNING id`,
        [runId, step.name, step.command]
      );
      const stepId = stepRes.rows[0].id;

      try {
        const { exitCode } = await runStep(tmpDir, step.command, (line) => {
          publishLog(runId, `  ${line}`);
          // Save every log line to DB for history
          db.query(
            `INSERT INTO logs (run_id, step_id, line) VALUES ($1, $2, $3)`,
            [runId, stepId, line]
          );
        }, image); // ← Feature 1: pass image to docker-runner

        const stepStatus = exitCode === 0 ? 'success' : 'failed';
        await db.query(
          `UPDATE steps SET status = $1, exit_code = $2, completed_at = NOW() WHERE id = $3`,
          [stepStatus, exitCode, stepId]
        );

        if (exitCode === 0) {
          publishLog(runId, `✅ "${step.name}" passed`);
        } else {
          publishLog(runId, `❌ "${step.name}" failed (exit code: ${exitCode})`);
          allPassed = false;
          break; // Stop on first failure
        }

      } catch (stepErr) {
        await db.query(
          `UPDATE steps SET status = 'failed', completed_at = NOW() WHERE id = $1`,
          [stepId]
        );
        publishLog(runId, `❌ "${step.name}" errored: ${stepErr.message}`);
        allPassed = false;
        break;
      }
    }

    // 5. Final status
    finalStatus = allPassed ? 'success' : 'failed';
    await db.query(
      `UPDATE runs SET status = $1, completed_at = NOW() WHERE id = $2`,
      [finalStatus, runId]
    );

    publishLog(runId, `\n${allPassed ? '🎉 Pipeline PASSED' : '💥 Pipeline FAILED'}`);
    publishLog(runId, `__PIPELINE_DONE__`); // Signal to frontend: stop streaming

    // ─── Feature 3: Slack notification ────────────────────────────────────────
    try {
      // Fetch repo name for the notification message
      const pipelineRow = await db.query(
        `SELECT repo_name, branch FROM pipelines WHERE id = $1`,
        [pipelineId]
      );
      const repoName = pipelineRow.rows[0]?.repo_name || repoUrl;
      const pipelineBranch = pipelineRow.rows[0]?.branch || branch;

      await notifySlack({
        status: finalStatus,
        runId,
        pipelineId,
        repoName,
        branch: pipelineBranch,
        commitSha,
        triggeredBy,
        durationSeconds: Math.round((Date.now() - startTime) / 1000),
      });
    } catch (slackErr) {
      // Slack errors must never affect pipeline result
      console.warn(`⚠️  Slack notification wrapper error: ${slackErr.message}`);
    }
    // ──────────────────────────────────────────────────────────────────────────

    return { status: finalStatus };

  } catch (err) {
    console.error(`❌ Run ${runId} crashed:`, err);
    await db.query(
      `UPDATE runs SET status = 'failed', completed_at = NOW() WHERE id = $1`,
      [runId]
    );
    publishLog(runId, `❌ Fatal error: ${err.message}`);
    publishLog(runId, `__PIPELINE_DONE__`);

    // Still try to notify Slack on a crash-level failure
    try {
      const pipelineRow = await db.query(
        `SELECT repo_name, branch FROM pipelines WHERE id = $1`,
        [pipelineId]
      );
      await notifySlack({
        status: 'failed',
        runId,
        pipelineId,
        repoName: pipelineRow.rows[0]?.repo_name || repoUrl,
        branch:   pipelineRow.rows[0]?.branch    || branch,
        commitSha,
        triggeredBy,
        durationSeconds: Math.round((Date.now() - startTime) / 1000),
      });
    } catch (slackErr) {
      console.warn(`⚠️  Slack notification wrapper error (crash path): ${slackErr.message}`);
    }

    throw err; // Bull marks job as failed, will retry

  } finally {
    // Always clean up temp files
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {}
  }
});

// On restart: re-queue any runs that were stuck in 'running' state
// This handles the case where the worker crashed mid-job
async function recoverStuckJobs() {
  const result = await db.query(`
    SELECT r.id as run_id, r.pipeline_id, r.commit_sha, p.repo_url, p.branch
    FROM runs r
    JOIN pipelines p ON r.pipeline_id = p.id
    WHERE r.status = 'running'
  `);

  if (result.rows.length > 0) {
    console.log(`🔄 Recovering ${result.rows.length} stuck job(s)...`);
    for (const row of result.rows) {
      await db.query(`UPDATE runs SET status = 'pending' WHERE id = $1`, [row.run_id]);
      await pipelineQueue.add({
        runId: row.run_id,
        pipelineId: row.pipeline_id,
        repoUrl: row.repo_url,
        branch: row.branch,
        commitSha: row.commit_sha || 'unknown',
      });
    }
  }
}

recoverStuckJobs().catch(console.error);
console.log('👷 Worker started, listening for jobs...');
