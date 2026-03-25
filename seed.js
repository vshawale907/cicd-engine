const db = require('./src/db');
require('dotenv').config();

async function seed() {
  try {
    const branchName = 'master'; // git init creates master by default on most windows setups
    await db.query(`INSERT INTO pipelines (repo_url, repo_name, branch) VALUES ($1, $2, $3)`, 
      ['c:/Users/Rushikesh/OneDrive/Desktop/cicd-engine', 'my-local-test-repo', branchName]
    );
    console.log('✅ Local test repository added to database!');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
seed();
