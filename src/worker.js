const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs');
const os = require('os');
require('dotenv').config();

const pipelineQueue = require('./queue');
const db = require('./db');
const { runStep } = require('./docker-runner');
const { publishLog } = require('./pubsub');

// Process up to 2 jobs at the same time
pipelineQueue.process(2, async (job) => {
  const { runId, pipelineId, repoUrl, branch, commitSha } = job.data;
  const tmpDir = path.join(os.tmpdir(), `cicd-run-${runId}`);

  console.log(`\n🚀 Processing run ${runId} for ${repoUrl}`);

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

    // 3. Read .pipeline.json from the repo root
    const configPath = path.join(tmpDir, '.pipeline.json');
    if (!fs.existsSync(configPath)) {
      throw new Error('.pipeline.json not found in repository root');
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const steps = config.steps || [];
    publishLog(runId, `📋 Found ${steps.length} step(s) to run`);

    // 4. Run each step one by one
    let allPassed = true;

    for (const step of steps) {
      publishLog(runId, `\n▶️ Step: ${step.name}`);
      publishLog(runId, `   Command: ${step.command}`);

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
        });

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
    const finalStatus = allPassed ? 'success' : 'failed';
    await db.query(
      `UPDATE runs SET status = $1, completed_at = NOW() WHERE id = $2`,
      [finalStatus, runId]
    );

    publishLog(runId, `\n${allPassed ? '🎉 Pipeline PASSED' : '💥 Pipeline FAILED'}`);
    publishLog(runId, `__PIPELINE_DONE__`); // Signal to frontend: stop streaming

    return { status: finalStatus };

  } catch (err) {
    console.error(`❌ Run ${runId} crashed:`, err);
    await db.query(
      `UPDATE runs SET status = 'failed', completed_at = NOW() WHERE id = $1`,
      [runId]
    );
    publishLog(runId, `❌ Fatal error: ${err.message}`);
    publishLog(runId, `__PIPELINE_DONE__`);
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
