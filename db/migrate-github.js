/**
 * db/migrate-github.js
 * Incremental migration -- adds GitHub OAuth tables to an existing database.
 * Safe to run multiple times (idempotent).
 */

const path = require('path');

const envFile =
  process.env.NODE_ENV === 'production' ? '.env.production' :
  process.env.NODE_ENV === 'test'       ? '.env.test' :
                                          '.env.development';

require('dotenv').config({ path: path.resolve(process.cwd(), envFile) });
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Add user_id to pipelines (nullable, safe for existing rows)
    await client.query(`
      ALTER TABLE pipelines
        ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
    `);
    console.log('OK  pipelines.user_id column ensured');

    // 2. Create github_integrations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS github_integrations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        github_user_id BIGINT UNIQUE NOT NULL,
        github_login TEXT NOT NULL,
        github_name TEXT,
        github_avatar_url TEXT,
        access_token TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('OK  github_integrations table ensured');

    // 3. Create github_repositories table
    await client.query(`
      CREATE TABLE IF NOT EXISTS github_repositories (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        github_integration_id INTEGER REFERENCES github_integrations(id) ON DELETE CASCADE,
        github_repo_id BIGINT NOT NULL,
        owner TEXT NOT NULL,
        name TEXT NOT NULL,
        full_name TEXT NOT NULL,
        clone_url TEXT NOT NULL,
        default_branch TEXT NOT NULL DEFAULT 'main',
        private BOOLEAN DEFAULT false,
        webhook_id BIGINT,
        webhook_secret TEXT NOT NULL,
        pipeline_id INTEGER REFERENCES pipelines(id),
        connected_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, github_repo_id)
      );
    `);
    console.log('OK  github_repositories table ensured');

    await client.query('COMMIT');
    console.log('✅ GitHub migration complete!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed -- rolled back:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
