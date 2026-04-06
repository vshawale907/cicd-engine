const { exec } = require('child_process');

/**
 * Runs a single step command inside a Docker container.
 *
 * @param {string}   repoPath - Local folder where repo was cloned
 * @param {string}   command  - Shell command to run e.g. "npm test"
 * @param {function} onLog    - Called with each log line as it streams
 * @param {string}   [image]  - Docker image to use (default: node:18-alpine)
 * @returns {Promise<{exitCode: number}>}
 */
function runStep(repoPath, command, onLog, image = 'node:18-alpine') {
  return new Promise((resolve, reject) => {
    // --rm    → delete container after it exits
    // -v      → mount local repo folder as /app inside container
    // -w /app → set working directory to /app
    // image   → configurable per-step (default: node:18-alpine)
    const dockerCmd = `docker run --rm -v "${repoPath}:/app" -w /app ${image} sh -c "${command}"`;

    console.log(`🐳 Docker: ${command}`);

    const child = exec(dockerCmd, { timeout: 5 * 60 * 1000 }); // 5 min max

    child.stdout.on('data', (data) => {
      data.toString().split('\n')
        .filter(l => l.trim())
        .forEach(line => onLog(`[stdout] ${line}`));
    });

    child.stderr.on('data', (data) => {
      data.toString().split('\n')
        .filter(l => l.trim())
        .forEach(line => onLog(`[stderr] ${line}`));
    });

    child.on('close', (code) => resolve({ exitCode: code }));
    child.on('error', (err) => reject(err));
  });
}

module.exports = { runStep };
