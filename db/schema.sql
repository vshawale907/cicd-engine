CREATE TABLE IF NOT EXISTS pipelines (
  id SERIAL PRIMARY KEY,
  repo_url TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT 'main',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS runs (
  id SERIAL PRIMARY KEY,
  pipeline_id INTEGER REFERENCES pipelines(id),
  commit_sha TEXT,
  status TEXT DEFAULT 'pending',
  triggered_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  triggered_by TEXT
);

CREATE TABLE IF NOT EXISTS steps (
  id SERIAL PRIMARY KEY,
  run_id INTEGER REFERENCES runs(id),
  name TEXT NOT NULL,
  command TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  exit_code INTEGER,
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS logs (
  id SERIAL PRIMARY KEY,
  run_id INTEGER REFERENCES runs(id),
  step_id INTEGER REFERENCES steps(id),
  line TEXT NOT NULL,
  logged_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',  -- 'admin' or 'viewer'
  created_at TIMESTAMP DEFAULT NOW()
);
