# ⚡ CI/CD Engine

A self-hosted, distributed CI/CD pipeline engine. Push to GitHub → pipeline runs inside isolated Docker containers → logs stream live to the dashboard.

> Built to demonstrate distributed systems, real-time communication, Docker-based execution, and production-grade backend architecture.

---

## Screenshots

| Login | Pipeline Dashboard | Live Logs | Metrics |
|---|---|---|---|
| *(screenshot)* | *(screenshot)* | *(screenshot)* | *(screenshot)* |

---

## Project Overview

When a developer pushes a commit to GitHub, a webhook fires. The server validates the HMAC signature, creates a run record in PostgreSQL, and drops a job onto a Redis-backed Bull queue. A separate worker process picks it up, clones the repo, parses a `.pipeline.yml` / `.pipeline.json` config, and executes each step inside its own Docker container. Every log line is published to a Redis channel and relayed in real time over WebSocket to anyone watching the dashboard. Slack gets notified on failure.

The server and worker are **separate processes** — the server stays responsive while the worker executes pipelines, and you can scale workers independently.

---

## Features

- **GitHub Webhook Integration** — Auto-trigger on `push` events with HMAC-SHA256 verification
- **Docker-Isolated Execution** — Each step runs in its own ephemeral container (`--rm`)
- **Per-Step Docker Images** — Each step can use a different image (e.g., `node:20-alpine`, `python:3.11-alpine`)
- **Parallel Step Execution** — Steps in a `parallel` group run concurrently via `Promise.all`
- **Multi-Format Pipeline Config** — Supports `.pipeline.yml` → `.pipeline.yaml` → `.pipeline.json` (priority order)
- **Live Log Streaming** — Real-time logs via WebSocket, backed by Redis pub/sub
- **Persistent Log History** — Every log line saved to PostgreSQL; completed runs can replay at any time
- **Metrics Dashboard** — Runs per day, duration trend, success rate, top pipelines
- **Role-Based Access Control** — `admin` (can trigger) and `viewer` (read-only)
- **JWT Authentication** — Stateless 7-day tokens; WebSocket connections are also token-verified
- **Manual Pipeline Trigger** — Admins can trigger any pipeline from the dashboard
- **Slack Failure Notifications** — Block Kit messages with repo, branch, commit, duration, and log link
- **Crash Recovery** — Runs stuck in `running` on worker restart are automatically re-queued
- **Automatic Job Retries** — Bull retries failed jobs up to 3 times with 5s backoff
- **Multi-Environment Config** — `.env.development` / `.env.production` / `.env.test` loaded by `NODE_ENV`

---

## Tech Stack

| Technology | Why |
|---|---|
| **Node.js + Express** | Non-blocking I/O suits the server's need to handle webhooks, API requests, and WebSocket connections concurrently |
| **Bull** | Redis-backed job queue — persistence, retries, backoff, and concurrency control out of the box |
| **ioredis** | Dual-use: Bull's store + Redis pub/sub for cross-process log streaming. Two separate connections are required (Redis limitation for subscribe mode) |
| **PostgreSQL (pg)** | Relational model fits the pipeline → runs → steps → logs parent/child hierarchy naturally |
| **jsonwebtoken + bcryptjs** | Stateless JWT auth + per-password bcrypt salting |
| **simple-git** | Shallow-clones (`--depth 1`) the target repo before execution |
| **js-yaml** | Parses `.pipeline.yml` / `.pipeline.yaml` configs |
| **ws** | Native WebSocket server — lighter than Socket.IO for the simple subscribe-and-stream use case |
| **React 18 + Vite** | Frontend. Vite's dev proxy eliminates CORS friction in development |
| **React Router v6** | Client-side routing for pipelines, run history, and log viewer |
| **Recharts** | Composable charting for the metrics dashboard |
| **TailwindCSS** | Utility-first CSS for the dark-mode UI |
| **Docker** | Steps run as `docker run --rm` sibling containers via the host Docker socket |
| **Nginx** | Serves the React build in production; reverse-proxies `/api/`, `/ws`, and `/webhook/` to Node |
| **Jest + Supertest** | Unit + integration tests for auth, webhook verification, and worker execution flow |

---

## System Architecture

```mermaid
graph TB
    subgraph "Client"
        Browser["🌐 React App"]
    end
    subgraph "Gateway"
        Nginx["🔀 Nginx"]
    end
    subgraph "Backend"
        Server["🚀 Express + WebSocket"]
        Worker["👷 Pipeline Worker"]
    end
    subgraph "Infrastructure"
        Redis["⚡ Redis (Queue + Pub/Sub)"]
        Postgres["🗄️ PostgreSQL"]
    end
    subgraph "Execution"
        Docker["🐳 Docker Containers (per step)"]
    end
    subgraph "External"
        GitHub["🐙 GitHub Webhooks"]
        Slack["💬 Slack"]
    end

    GitHub -->|"HMAC-verified POST"| Nginx --> Server
    Browser -->|"HTTP + WebSocket"| Nginx
    Server -->|"queue.add()"| Redis
    Worker -->|"process job"| Redis
    Worker --> GitHub
    Worker --> Docker
    Worker -->|"publishLog()"| Redis -->|"subscriber"| Server -->|"ws.send()"| Browser
    Server <--> Postgres
    Worker <--> Postgres
    Worker -->|"on failure"| Slack
```

---

## Project Structure

```
cicd-engine/
├── src/
│   ├── server.js               # Express + WebSocket server
│   ├── worker.js               # Bull consumer — pipeline execution engine
│   ├── queue.js                # Bull queue (Redis-backed)
│   ├── pubsub.js               # Redis pub/sub (two ioredis connections)
│   ├── docker-runner.js        # Spawns docker run --rm per step
│   ├── webhook.js              # GitHub webhook handler + HMAC verification
│   ├── auth.js                 # bcrypt + JWT utilities
│   ├── db.js                   # pg connection pool
│   ├── notifications.js        # Slack webhook integration
│   ├── middleware/auth.js      # requireAuth + requireAdmin
│   ├── routes/
│   │   ├── auth.js             # /register, /login, /me
│   │   ├── pipelines.js        # /pipelines + /trigger
│   │   ├── runs.js             # /runs + /logs
│   │   └── metrics.js          # /metrics (aggregated stats)
│   └── __tests__/              # Jest test suite
├── frontend/
│   └── src/
│       ├── App.jsx             # Root + auth gate + navigation
│       ├── context/AuthContext.jsx   # JWT in React state (not localStorage)
│       ├── utils/api.js        # fetch() wrapper with Authorization header
│       └── components/
│           ├── LoginPage.jsx
│           ├── SignUpPage.jsx       # + password strength meter
│           ├── PipelineList.jsx     # Polls every 5s; admin trigger button
│           ├── RunHistory.jsx       # Polls every 3s
│           ├── LogViewer.jsx        # Live WebSocket + history replay
│           └── MetricsDashboard.jsx # Recharts + summary cards
├── db/
│   ├── schema.sql              # Table definitions
│   ├── migrate.js              # Applies schema to DB
│   └── seed-admin.js           # Creates first admin user
├── docs/
│   ├── deploy.md               # Railway guide
│   ├── deploy-vps.md           # Linux VPS / Docker Compose guide
│   └── deploy-gcp.md           # GCP guide
├── Dockerfile.server           # Node 18 Alpine
├── Dockerfile.worker           # Node 18 Alpine + docker-cli
├── Dockerfile.frontend         # Multi-stage: Vite build → Nginx
├── nginx.conf                  # Reverse proxy + WebSocket upgrade
├── docker-compose.yml          # Local dev (Postgres + Redis only)
├── docker-compose.prod.yml     # Full production stack (5 services)
├── docker-compose.worker.yml   # Worker-only (against remote infra)
└── .env.example
```

---

## Request Flow

```mermaid
sequenceDiagram
    participant GH as GitHub
    participant Server
    participant Queue as Bull / Redis
    participant Worker
    participant Docker
    participant PubSub as Redis Pub/Sub
    participant Browser

    GH->>Server: POST /webhook/github (HMAC signed)
    Server->>Server: Verify HMAC-SHA256 (timingSafeEqual)
    Server->>Server: Find/create pipeline, INSERT run
    Server->>Queue: queue.add({ runId, repoUrl, branch... })
    Server-->>GH: 202 Accepted

    Queue->>Worker: Dequeue (concurrency: 2)
    Worker->>Server: UPDATE run status='running'
    Worker->>GH: git clone --depth 1
    Worker->>Worker: Parse .pipeline.yml / .pipeline.json

    loop Each step (sequential or parallel)
        Worker->>Docker: docker run --rm -v repo:/app {image} sh -c {cmd}
        Docker-->>Worker: stdout/stderr
        Worker->>PubSub: publishLog(runId, line)
        PubSub-->>Server: message event
        Server-->>Browser: ws.send(logLine)
        Worker->>Worker: INSERT log to DB
    end

    Worker->>Server: UPDATE run status='success|failed'
    Worker->>PubSub: publish "__PIPELINE_DONE__"
    Worker->>Worker: fs.rmSync(tmpDir)
```

---

## Backend Architecture

| Module | Role |
|---|---|
| `server.js` | Express + native `ws` WebSocket server on the same HTTP server. Routes secured per-method with `requireAuth` / `requireAdmin` |
| `worker.js` | Bull consumer (concurrency: 2). Clones repo → parses config → executes steps → publishes logs → updates DB → notifies Slack |
| `queue.js` | Bull queue with TLS support for Upstash Redis. Events logged to stdout |
| `pubsub.js` | Two separate `ioredis` connections (publish + subscribe). Channel: `run:{runId}:logs` |
| `docker-runner.js` | `docker run --rm -v {repo}:/app -w /app {image} sh -c "{cmd}"` with 5-min timeout, streamed stdout/stderr |
| `webhook.js` | Validates `x-hub-signature-256` with `crypto.timingSafeEqual`. Ignores all non-`push` events |
| `notifications.js` | Slack Block Kit POST on failure only. Uses Node 18 `fetch`. Errors are non-fatal |
| `recoverStuckJobs()` | Runs on worker startup — resets any `running` rows to `pending` and re-queues them |

---

## Frontend Architecture

| Component | Behavior |
|---|---|
| `AuthContext` | JWT stored in React state only — cleared on tab close, never touches storage |
| `api.js` | `apiFetch()` injects `Authorization: Bearer` header automatically |
| `PipelineList` | Polls `/api/pipelines` every 5s; shows admin trigger button conditionally |
| `RunHistory` | Polls `/api/runs` every 3s; supports `?pipelineId=` filter |
| `LogViewer` | Live: opens WebSocket, subscribes to run, auto-scrolls. Completed: fetches from `/api/runs/:id/logs` |
| `MetricsDashboard` | Polls `/api/metrics` every 30s; renders summary cards, bar chart, line chart, top-pipelines table |

---

## Database Design

```mermaid
erDiagram
    users {
        int id
        text email
        text password_hash
        text role
    }
    pipelines {
        int id
        text repo_url
        text repo_name
        text branch
    }
    runs {
        int id
        int pipeline_id
        text commit_sha
        text status
        text triggered_by
        timestamp triggered_at
        timestamp completed_at
    }
    steps {
        int id
        int run_id
        text name
        text command
        text status
        int exit_code
    }
    logs {
        int id
        int run_id
        int step_id
        text line
    }

    pipelines ||--o{ runs : ""
    runs ||--o{ steps : ""
    runs ||--o{ logs : ""
    steps ||--o{ logs : ""
```

Pipelines are identified by `repo_url + branch` (find-or-create on each push). `runs.triggered_by` is the GitHub pusher name or `'manual'`.

---

## API Reference

### Auth (public)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register. Default role: `viewer` |
| `POST` | `/api/auth/login` | Login → `{ token, user }` |
| `GET` | `/api/auth/me` | Auth required. Returns current user |

### Pipelines (`requireAuth` / `requireAdmin`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/pipelines` | Auth | List all with run counts + last status |
| `GET` | `/api/pipelines/:id` | Auth | Single pipeline |
| `POST` | `/api/pipelines/:id/trigger` | Admin | Manual run trigger |

### Runs (`requireAuth`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/runs` | List runs. Supports `?pipelineId`, `?limit`, `?offset` |
| `GET` | `/api/runs/:id` | Run details + step records |
| `GET` | `/api/runs/:id/logs` | Stored log lines (completed runs) |

### Metrics + Webhook
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/metrics` | Auth | Aggregated stats (30-day) |
| `POST` | `/webhook/github` | HMAC | GitHub push event receiver |

### WebSocket
Connect: `ws://{host}/ws?token={jwt}`  
Subscribe: `{ "type": "subscribe", "runId": 42 }`  
Stream ends when: `{ "line": "__PIPELINE_DONE__" }` is received.

---

## Authentication Flow

1. `POST /api/auth/login` → bcrypt compare → `jwt.sign({ id, email, role }, JWT_SECRET, { expiresIn: '7d' })`
2. Token stored in React state (in-memory only)
3. All API calls: `Authorization: Bearer <token>`
4. Middleware: `jwt.verify(token)` → `req.user = { id, email, role }`
5. WebSocket: token passed as `?token=` query param, verified on connect (closes `1008` on failure)
6. Admin-only endpoints return `403` for viewer role

---

## Pipeline Config

```yaml
# .pipeline.yml
steps:
  - name: Install
    command: npm ci
    image: node:20-alpine

  - parallel:
      - name: Tests
        command: npm test
        image: node:20-alpine
      - name: Lint
        command: npm run lint
        image: node:20-alpine

  - name: Build
    command: npm run build
    image: node:20-alpine
```

Sequential step failure stops execution. Parallel group failure skips remaining steps.

---

## Queue & Worker Architecture

- **Queue:** Bull on Redis. `attempts: 3`, `backoff: 5000ms`. Supports plain and TLS Redis.
- **Concurrency:** 2 jobs processed simultaneously per worker process
- **Crash recovery:** `recoverStuckJobs()` on startup re-queues any `running` DB rows
- **Docker-out-of-Docker:** Worker mounts `/var/run/docker.sock` to spawn pipeline containers as siblings on the host

---

## Real-Time Logs

**Live run:** Worker → `publisher.publish("run:{id}:logs", line)` → `subscriber.on('message')` in server → `ws.send(line)` to browser  
**Completed run:** `GET /api/runs/:id/logs` fetches stored lines from PostgreSQL — no WebSocket needed  
**Sentinel:** Worker publishes `__PIPELINE_DONE__` → frontend stops streaming and reloads run status

---

## Error Handling

| Scenario | Handling |
|---|---|
| Step exit code ≠ 0 | Step + run marked `failed`, remaining steps skipped, `__PIPELINE_DONE__` published |
| Worker crash | `recoverStuckJobs()` on restart + Bull auto-retry (3× with 5s backoff) |
| Slack error | Caught, logged as warning — never affects pipeline result |
| Webhook HMAC mismatch | `401` returned |
| Invalid/expired JWT | `401` from middleware, `1008` close for WebSocket |
| Duplicate email | PostgreSQL `23505` caught → `409 Conflict` |
| Missing pipeline config | Worker throws descriptive error, run marked `failed` |

---

## Security

| Concern | Implementation |
|---|---|
| Passwords | bcrypt, 10 salt rounds |
| JWT | Signed with `JWT_SECRET`, 7-day expiry, in-memory only on frontend |
| WebSocket | Token verified on connect |
| Webhook | HMAC-SHA256 with `crypto.timingSafeEqual` (timing-attack safe) |
| Role enforcement | Backend middleware is source of truth; frontend UI is cosmetic only |
| SQL injection | Parameterized queries throughout (`$1, $2, ...`) |
| CORS | Restricted to `FRONTEND_URL` in production |
| Security headers | CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` (via `vercel.json`) |
| Container isolation | `--rm` containers, deleted after each step |

---

## Performance

| Optimization | Implementation |
|---|---|
| Shallow clone | `git clone --depth 1` — fetches only branch tip |
| Worker concurrency | 2 parallel jobs per process without multiple processes |
| Redis pub/sub | Logs bypass HTTP entirely — pushed directly across processes |
| Temp cleanup | `fs.rmSync()` in `finally {}` — prevents disk exhaustion |
| Metrics polling | 30s interval to reduce DB load |

---

## Installation

### Prerequisites
- Docker + Docker Compose
- Node.js 18+
- ngrok (for local webhook testing)

### Setup

```bash
# 1. Clone
git clone https://github.com/your-username/cicd-engine.git && cd cicd-engine

# 2. Environment
cp .env.example .env.development
# Fill in: JWT_SECRET, GITHUB_WEBHOOK_SECRET, FRONTEND_URL

# 3. Start Postgres + Redis
docker-compose up -d

# 4. Migrate DB
npm run migrate

# 5. Create admin
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=secret npm run seed:admin

# 6. Start server (terminal 1)
npm run dev

# 7. Start worker (terminal 2)
npm run dev:worker

# 8. Start frontend (terminal 3)
cd frontend && npm install && npm run dev
# → http://localhost:5173

# 9. Expose for GitHub webhooks
ngrok http 3000
# Webhook URL: https://<ngrok-url>/webhook/github
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | Yes | `development` / `production` / `test` |
| `PORT` | No | API server port (default: `3000`) |
| `DATABASE_URL` | Yes | `postgresql://user:pass@host:5432/db` |
| `REDIS_URL` | Yes | `redis://host:6379` or `rediss://...` for TLS |
| `JWT_SECRET` | Yes | Random string, min 32 chars |
| `GITHUB_WEBHOOK_SECRET` | Yes | Matches the secret set in GitHub webhook settings |
| `SLACK_WEBHOOK_URL` | No | Slack Incoming Webhook URL (skipped if unset) |
| `FRONTEND_URL` | No | Used in Slack notification links (default: `http://localhost:5173`) |
| `ADMIN_EMAIL` | Seed only | For `npm run seed:admin` |
| `ADMIN_PASSWORD` | Seed only | For `npm run seed:admin` |

**Frontend (`.env.development` in `/frontend`):**

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend URL (leave empty in prod — Nginx proxies `/api`) |
| `VITE_WS_URL` | WebSocket URL (leave empty to use `window.location.host`) |

---

## Development Commands

```bash
npm run dev              # Server with hot reload
npm run dev:worker       # Worker with hot reload
npm test                 # Run all tests
npm run test:coverage    # Tests + coverage report
npm run migrate          # Apply schema.sql
npm run seed:admin       # Create/update admin user
```

---

## Deployment

See [`docs/`](./docs/) for platform-specific guides:

| Guide | Platform |
|---|---|
| [`deploy.md`](./docs/deploy.md) | Railway (PaaS) |
| [`deploy-vps.md`](./docs/deploy-vps.md) | Any Linux VPS (AWS, DigitalOcean, Hetzner, Oracle Cloud) |
| [`deploy-gcp.md`](./docs/deploy-gcp.md) | Google Cloud Platform |

**Quick production start (VPS):**
```bash
cp .env.example .env && nano .env
docker-compose -f docker-compose.prod.yml up -d --build
docker exec cicd_server_prod npm run migrate
docker exec -e ADMIN_EMAIL=admin@example.com -e ADMIN_PASSWORD=secret cicd_server_prod npm run seed:admin
```

> **Worker note:** The worker must have access to the Docker socket. In `docker-compose.prod.yml` this is the `/var/run/docker.sock` volume mount. On Railway, enable **Privileged Mode** on the worker service.

---

## Scalability

| Component | Scaling Path |
|---|---|
| API Server | Stateless (JWT) — run multiple instances behind a load balancer |
| Worker | Add more worker containers; Bull distributes jobs via Redis automatically |
| Redis | Single instance → Redis Sentinel or Redis Cluster for HA |
| PostgreSQL | Add read replica for metrics/log queries |
| WebSocket | Multi-server requires a Redis adapter or sticky sessions at LB |

---

## Future Improvements

- Branch filtering (trigger only on `main`, `release/*`, etc.)
- Pull Request webhook support
- Run cancellation (kill the Docker container, mark `cancelled`)
- Environment variable injection per pipeline (secrets as `--env` flags)
- GitHub Commit Status Checks API integration
- Docker image pre-pull on worker startup
- Email notifications alongside Slack

---

## Learning Outcomes

This project demonstrates from implementation, not theory:

- **Distributed systems** — Server and worker communicate only through shared infrastructure (Redis queue, DB, pub/sub)
- **Job queues** — Bull: persistence, retries, backoff, concurrency
- **Redis pub/sub** — Cross-process message bus; two connections required by Redis protocol
- **Docker-out-of-Docker** — Containerized worker spawning sibling containers via socket mount
- **Real-time streaming** — Redis → WebSocket pipeline for live log delivery
- **Stateless auth** — JWT without DB lookups enables horizontal scaling
- **HMAC verification** — Timing-safe webhook payload authentication
- **Crash recovery** — Detecting and re-queuing stuck jobs on restart
- **Multi-stage Docker builds** — Vite build artifact served from minimal Nginx image

---

## Why This Project Stands Out

Most portfolio CI/CD projects call an existing cloud API. This one **builds the pipeline engine itself**.

The architecture solves real distributed systems problems: the server never blocks on Docker execution, log lines cross three process boundaries in real time (Docker → Worker → Redis → Server → WebSocket → Browser), and a worker crash doesn't lose a run. Security is layered correctly at each boundary — HMAC for webhooks, JWT for API, RBAC for authorization, and timing-safe comparisons throughout.

---

## Contributing

1. Fork → `git checkout -b feature/your-feature`
2. `npm test` — all tests must pass
3. Open a pull request

---

## License

MIT

---

## Author

**Vaibhav Hawale**

Built as a demonstration of distributed systems, real-time communication, and production backend engineering.