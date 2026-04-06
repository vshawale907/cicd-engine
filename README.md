# ⚡ CI/CD Engine

A self-hosted, production-grade Continuous Integration & Deployment engine built from scratch — a mini GitHub Actions / Jenkins clone with real-time log streaming, Docker-isolated step execution, and a live React dashboard.

> **Live Demo:** [your-app.railway.app](https://your-app.railway.app) &nbsp;·&nbsp; **[Watch a pipeline run →](#demo)**

---

## Demo

> _Replace the placeholder below with a screen recording GIF (use [Kap](https://getkap.co/) on macOS or [OBS](https://obsproject.com/) on Windows/Linux — record a `git push` triggering a live pipeline run with streaming logs)_

![CI/CD Engine Demo](./docs/demo.gif)

---

## CI/CD Engine

![Deployed on Railway](https://img.shields.io/badge/deployed-railway-purple)

A lightweight, custom-built CI/CD engine designed to automatically run on every GitHub push, execute pipeline steps inside ephemeral Docker containers, and stream logs live to a web dashboard.

## Features

- **GitHub Webhook Integration**: Listens for push events
- **Docker Isolation**: Each step runs in an isolated `node:18-alpine` (or customized) Docker container
- **Pub/Sub Logging**: Streams logs via Redis from the worker process to the web dashboard in real time
- **Queue-based Processing**: Uses Bull to queue and process multiple concurrent jobs robustly
- **Metrics Dashboard**: Recharts-powered graphs and stats of pipelines.
- **Role-based Authentication**: JWT integration for viewers and admins.
- **Slack Notifications**: Pipeline failure alerts integrated with Slack Block Kit.

## Deployment

Refer to the complete Railway deployment guide at [`docs/deploy.md`](docs/deploy.md).
- **Docker-isolated** — every pipeline step runs in a fresh container so nothing pollutes your host machine
- **Live log streaming** — logs appear in the browser in real time via WebSocket + Redis Pub/Sub
- **Persistent history** — every run, step, and log line is stored in PostgreSQL

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express.js |
| Real-time | WebSocket (`ws`), Redis Pub/Sub |
| Job queue | Bull + Redis |
| Database | PostgreSQL |
| Step runner | Docker (`node:18-alpine`) |
| Frontend | React 18, Vite, Tailwind CSS |
| Infrastructure | Docker Compose |
| Deployment | Railway |

---

## Architecture

```
GitHub (git push)
       │
       ▼  HMAC-signed HTTP POST
 ┌─────────────────────────────────────┐
 │           Express Server            │  ← src/server.js  (port 3000)
 │        + WebSocket server           │
 └──────┬──────────────┬───────────────┘
        │              │
        ▼              ▼
  PostgreSQL        Redis Queue (Bull)
  (runs, logs,      (pending jobs)
   steps, pipelines)    │
        │              ▼
        │         Worker Process       ← src/worker.js
        │         ├─ clone repo
        │         ├─ read .pipeline.json
        │         └─ run steps in Docker
        │              │
        │              ▼
        │         Redis Pub/Sub
        │         (broadcasts log lines)
        │              │
        ▼              ▼
 ┌─────────────────────────────────────┐
 │         React Frontend (Vite)       │
 │  Pipelines · Run history · Live logs│
 │  Connected via WebSocket            │
 └─────────────────────────────────────┘
```

**Full request lifecycle:**
1. Developer runs `git push origin main`
2. GitHub sends a signed `POST /webhook/github`
3. Server verifies the HMAC signature, creates a `Run` record in PostgreSQL, enqueues a job in Redis
4. Worker picks up the job, clones the repo, reads `.pipeline.json`, runs each step inside Docker
5. Every log line is published to a Redis channel → forwarded by the server → sent to the browser via WebSocket
6. React frontend displays logs live; final status (success/failed) updates when the pipeline completes

---

## Pipeline Configuration

Pipelines are defined by a configuration file in the root of your repository. The CI/CD engine supports YAML (`.pipeline.yml` or `.pipeline.yaml`) and JSON (`.pipeline.json`).

The engine will look for files in this priority order:
1. `.pipeline.yml`
2. `.pipeline.yaml`
3. `.pipeline.json`

### Example: `.pipeline.yml` (Recommended)

```yaml
name: Node.js CI
steps:
  - name: Install
    command: npm install
    image: node:20-alpine
  - name: Test
    command: npm test
  - name: Build
    command: npm run build --if-present
```

### Example: `.pipeline.json`

```json
{
  "name": "Node.js CI",
  "steps": [
    {
      "name": "Install",
      "command": "npm install"
    },
    {
      "name": "Test",
      "command": "npm test"
    }
  ]
}
```

### Configuration Fields

- **name** (optional): The name of your pipeline.
- **steps** (required): An array of steps to execute sequentially.
  - **name** (required): The name of the step (e.g., "Run Tests").
  - **command** (required): The shell command to execute inside the Docker container.
  - **image** (optional): The Docker image to use for this specific step. Defaults to `node:18-alpine` if not provided. You can specify any public Docker Hub image (e.g., `python:3.11-alpine`, `golang:1.21-alpine`). If any step fails (non-zero exit code), subsequent steps are skipped and the run is marked `failed`.

---

## Features

- [x] GitHub webhook receiver with HMAC signature verification
- [x] Automatic pipeline creation — push to any branch and a pipeline is auto-registered
- [x] Redis-backed job queue with retry logic (3 attempts, 5s backoff)
- [x] Docker-isolated step execution — clean environment per step
- [x] Real-time log streaming via WebSocket + Redis Pub/Sub
- [x] Full run history with per-step status and exit codes
- [x] Crash recovery — stuck `running` jobs are re-queued on worker restart
- [x] React dashboard — pipeline list, run history, live log viewer
- [x] Health check endpoint (`GET /health`)
- [x] SQL injection protection via parameterised queries throughout

---

## Local setup

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for PostgreSQL, Redis, and step execution)
- A [GitHub account](https://github.com) to test webhooks (or use [ngrok](https://ngrok.com) for local testing)

### 1. Clone the repo

```bash
git clone https://github.com/your-username/cicd-engine.git
cd cicd-engine
```

### 2. Install dependencies

```bash
# Backend
npm install

# Frontend
cd frontend && npm install && cd ..
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://cicd_user:cicd_pass@localhost:5432/cicd_db
GITHUB_WEBHOOK_SECRET=your_secret_here
```

### 4. Start infrastructure (PostgreSQL + Redis)

```bash
docker-compose up -d
```

This starts:
- PostgreSQL on port `5432` and automatically runs `db/schema.sql`
- Redis on port `6379`

### 5. Seed a test pipeline (optional)

```bash
node seed.js
```

### 6. Start the backend server

```bash
npm start
# → Server running on http://localhost:3000
```

### 7. Start the worker (separate terminal)

```bash
npm run worker
# → Worker listening for jobs...
```

### 8. Start the frontend

```bash
cd frontend
npm run dev
# → http://localhost:5173
```

### 9. Expose locally for GitHub webhooks (optional)

```bash
ngrok http 3000
# Copy the https URL → use as your GitHub webhook URL
```

---

## GitHub webhook setup

1. Go to your GitHub repo → **Settings → Webhooks → Add webhook**
2. Set **Payload URL** to `https://your-domain.com/webhook/github`
3. Set **Content type** to `application/json`
4. Set **Secret** to match `GITHUB_WEBHOOK_SECRET` in your `.env`
5. Select **Just the push event**
6. Click **Add webhook**

Any `git push` to that repo will now trigger a pipeline run.

---

## Project structure

```
cicd-engine/
├── .env.example          ← Environment variable template
├── .pipeline.json        ← Pipeline config for this repo itself
├── docker-compose.yml    ← PostgreSQL + Redis for local dev
├── package.json
├── seed.js               ← Seed a test pipeline
│
├── db/
│   └── schema.sql        ← Creates pipelines, runs, steps, logs tables
│
├── src/
│   ├── server.js         ← Express + WebSocket server
│   ├── worker.js         ← Job processor (clone → run steps)
│   ├── docker-runner.js  ← Executes a command inside Docker
│   ├── webhook.js        ← GitHub webhook receiver
│   ├── db.js             ← PostgreSQL connection
│   ├── queue.js          ← Bull/Redis job queue
│   ├── pubsub.js         ← Redis Pub/Sub for log broadcasting
│   └── routes/
│       ├── pipelines.js  ← GET /api/pipelines, POST trigger
│       └── runs.js       ← GET /api/runs, GET /api/runs/:id/logs
│
└── frontend/
    ├── vite.config.js
    └── src/
        ├── App.jsx
        └── components/
            ├── PipelineList.jsx   ← All pipelines
            ├── RunHistory.jsx     ← All runs for a pipeline
            └── LogViewer.jsx      ← Live log streaming
```

---

## API reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/webhook/github` | GitHub push event receiver |
| `GET` | `/api/pipelines` | List all pipelines |
| `POST` | `/api/pipelines/:id/trigger` | Manually trigger a pipeline |
| `GET` | `/api/runs` | List all runs (filterable by pipeline) |
| `GET` | `/api/runs/:id` | Get a single run with steps |
| `GET` | `/api/runs/:id/logs` | Get stored logs for a completed run |

WebSocket: connect to `ws://your-host/ws` and send `{ "type": "subscribe", "runId": 42 }` to stream logs for run 42.

---

## Database schema

```
pipelines         runs                steps               logs
─────────         ────                ─────               ────
id                id                  id                  id
repo_url          pipeline_id ──→     run_id ──→          run_id
repo_name         commit_sha          name                step_id
branch            status              command             line
created_at        triggered_at        status              created_at
                  completed_at        exit_code
                  triggered_by        started_at
                                      completed_at
```

---

## Deployment (Railway)

Full deployment guide coming in `docs/deploy.md`.

**Quick overview:**
1. Create a Railway project with 3 services: `server`, `worker`, `frontend`
2. Add managed **PostgreSQL** and **Redis** plugins
3. Set environment variables in each service's Railway dashboard
4. Connect your GitHub repo — Railway auto-deploys on every push
5. Add a custom domain — Railway provisions SSL automatically

---

## Roadmap

- [ ] JWT authentication + role-based access (admin / viewer)
- [ ] GitHub OAuth login
- [ ] Per-step Docker image configuration (`"image": "python:3.11"`)
- [ ] YAML pipeline config support (`.pipeline.yml`)
- [ ] Slack / email failure notifications
- [ ] Metrics dashboard — success rate, avg run duration, runs per day
- [ ] Parallel step execution
- [ ] Build artifact storage + download
- [ ] Unit + integration tests (Jest)

---

## Key concepts demonstrated

| Concept | Where |
|---|---|
| HMAC webhook signature verification | `src/webhook.js` → `verifySignature()` |
| Parameterised SQL (SQL injection prevention) | All `db.query()` calls |
| Redis job queue with retry logic | `src/queue.js`, `src/worker.js` |
| Redis Pub/Sub for real-time broadcasting | `src/pubsub.js` |
| WebSocket server sharing an HTTP port | `src/server.js` |
| Docker container execution + stdout streaming | `src/docker-runner.js` |
| React real-time UI with WebSocket | `frontend/src/components/LogViewer.jsx` |
| Crash recovery for in-progress jobs | `recoverStuckJobs()` in `src/worker.js` |
| Timing-safe string comparison | `crypto.timingSafeEqual()` in `webhook.js` |

---

## Contributing

Pull requests are welcome. For major changes, open an issue first to discuss what you'd like to change.

---

<!-- Email: admin@example.com
Password: supersecret -->

## License

[MIT](LICENSE)