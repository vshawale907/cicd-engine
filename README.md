# ⚡ CI/CD Engine

A self-hosted, distributed CI/CD pipeline engine built from scratch. Push to GitHub, watch your pipeline execute inside isolated Docker containers, and stream logs live to a React dashboard — all without relying on any existing CI platform.

> Built to demonstrate distributed systems, real-time communication, Docker-based execution, and production-grade backend architecture.

---

## Screenshots

| Login Page | Pipeline Dashboard | Live Log Viewer | Metrics Dashboard |
|---|---|---|---|
| *(screenshot)* | *(screenshot)* | *(screenshot)* | *(screenshot)* |

---

## Project Overview

Most CI/CD tools are black boxes. This project builds one from the ground up.

When a developer pushes a commit to GitHub, a webhook fires. The server validates the HMAC signature, creates a run record in PostgreSQL, and drops a job onto a Redis-backed Bull queue. A separate worker process picks it up, clones the repository, parses a `.pipeline.yml` / `.pipeline.json` config, and executes each step inside its own Docker container. Every log line is published to a Redis channel and relayed in real time over WebSocket to anyone watching in the dashboard. When it's done, Slack gets a notification if it failed.

The server and worker are intentionally separate processes — the server stays responsive while the worker does the heavy lifting, and you can scale workers independently.

---

## Features

- **GitHub Webhook Integration** — Automatic pipeline triggering on `push` events with HMAC-SHA256 signature verification
- **Docker-Isolated Execution** — Each pipeline step runs in its own ephemeral Docker container, with the repo mounted as a volume
- **Per-Step Docker Images** — Each step can specify its own image (e.g., `node:20-alpine`, `python:3.11-alpine`), enabling multi-language pipelines
- **Parallel Step Execution** — Steps grouped under a `parallel` key run concurrently via `Promise.all`
- **Multi-Format Pipeline Config** — Supports `.pipeline.yml`, `.pipeline.yaml`, and `.pipeline.json` (priority in that order)
- **Live Log Streaming** — Real-time log output streamed to the browser via WebSocket, backed by Redis pub/sub
- **Persistent Log History** — Every log line is saved to PostgreSQL; completed runs can replay their full log at any time
- **Metrics Dashboard** — Charts for runs per day, average duration trends, success rate, and top pipelines by run count
- **Role-Based Access Control** — Two roles: `admin` (can trigger pipelines) and `viewer` (read-only)
- **JWT Authentication** — Stateless auth with 7-day tokens; WebSocket connections are also token-verified
- **Manual Pipeline Trigger** — Admins can trigger any pipeline directly from the dashboard, without a GitHub push
- **Slack Failure Notifications** — Rich Slack block-kit messages with repo, branch, commit, duration, and a direct link to the logs
- **Crash Recovery** — On worker restart, any run stuck in `running` state is automatically re-queued
- **Automatic Job Retries** — Bull retries failed jobs up to 3 times with a 5-second backoff
- **Multi-Environment Config** — Separate `.env.development`, `.env.production`, and `.env.test` files loaded automatically based on `NODE_ENV`
- **Full Docker Compose Stack** — Separate Compose files for local development, production (all services), and worker-only deployment

---

## Tech Stack

| Technology | Why It's Used |
|---|---|
| **Node.js + Express** | Non-blocking I/O makes it well-suited for the server which needs to handle concurrent webhook events and API requests while maintaining WebSocket connections |
| **Bull** | Job queue library backed by Redis. Gives you persistence (jobs survive restarts), automatic retries with backoff, concurrency control, and job state tracking — all without writing queue infrastructure yourself |
| **ioredis** | Redis client used for two purposes: Bull's backing store, and the pub/sub channel that carries log lines from the worker to the server. Two separate connections are required because Redis doesn't allow a connection in subscribe mode to also publish |
| **PostgreSQL (pg)** | Relational database for pipelines, runs, steps, logs, and users. The parent/child relationships between these tables (pipeline → runs → steps → logs) are a natural fit for a relational model |
| **jsonwebtoken + bcryptjs** | JWT for stateless, scalable authentication. bcrypt for proper password hashing with per-password salts. Both are battle-tested libraries with no dependency footprint concerns |
| **simple-git** | Thin Node.js wrapper around the `git` CLI. Used to shallow-clone (`--depth 1`) the target repository into a temp directory before pipeline execution |
| **js-yaml** | Parses `.pipeline.yml` / `.pipeline.yaml` config files. JSON is also supported natively |
| **ws** | Native WebSocket server library. Chosen over Socket.IO because the protocol requirements here are simple — subscribe to a run, receive log lines — and the lighter footprint is appropriate |
| **React 18 + Vite** | Frontend framework. Vite's dev server proxies `/api` and `/ws` to the backend, so there's no CORS friction in development |
| **React Router v6** | Client-side routing for the pipeline list, run history, and log viewer pages |
| **Recharts** | Composable charting library for the metrics dashboard's bar charts and line charts |
| **TailwindCSS** | Utility-first CSS. The dark-mode design (`slate-900` base) is built entirely with Tailwind utilities |
| **Docker** | Pipeline steps execute inside `docker run --rm` containers. The container is deleted after each step. The worker container mounts the host Docker socket (`/var/run/docker.sock`) to spawn sibling containers |
| **Nginx** | Serves the compiled React app in production and reverse-proxies `/api/`, `/ws`, and `/webhook/` to the Node server. Also handles WebSocket upgrade headers |
| **Jest + Supertest** | Unit and integration tests covering auth logic, webhook signature verification, and the full worker execution pipeline using mocks |

---

## System Architecture

```mermaid
graph TB
    subgraph "Client"
        Browser["🌐 React App<br/>(Vite + TailwindCSS)"]
    end

    subgraph "Gateway (Production)"
        Nginx["🔀 Nginx<br/>Reverse Proxy"]
    end

    subgraph "Backend Services"
        Server["🚀 Express Server<br/>+ WebSocket (ws)"]
        Worker["👷 Pipeline Worker<br/>(Bull Consumer)"]
    end

    subgraph "Infrastructure"
        Redis["⚡ Redis<br/>Queue + Pub/Sub"]
        Postgres["🗄️ PostgreSQL<br/>Pipelines, Runs, Logs"]
    end

    subgraph "Execution"
        Docker["🐳 Docker Containers<br/>(per step, --rm)"]
    end

    subgraph "External"
        GitHub["🐙 GitHub<br/>Webhook (push events)"]
        Slack["💬 Slack<br/>Failure Alerts"]
    end

    GitHub -->|"POST /webhook/github<br/>(HMAC verified)"| Nginx
    Browser -->|"HTTP + WebSocket"| Nginx
    Nginx -->|"proxy_pass"| Server

    Server -->|"Add job"| Redis
    Worker -->|"Process job (concurrency: 2)"| Redis

    Worker -->|"Clone repo"| GitHub
    Worker -->|"docker run --rm"| Docker
    Worker -->|"publishLog()"| Redis
    Server -->|"subscribeToRun()"| Redis
    Server -->|"ws.send(logLine)"| Browser

    Server <-->|"Pool queries"| Postgres
    Worker <-->|"Pool queries"| Postgres

    Worker -->|"On failure"| Slack
```

---

## Project Structure

```
cicd-engine/
│
├── src/                        # Backend source
│   ├── server.js               # Express app + WebSocket server entrypoint
│   ├── worker.js               # Bull job processor — the pipeline execution engine
│   ├── queue.js                # Bull queue instance (backed by Redis)
│   ├── pubsub.js               # Redis pub/sub (two separate ioredis connections)
│   ├── docker-runner.js        # Spawns `docker run --rm` for each step
│   ├── webhook.js              # GitHub webhook handler + HMAC verification
│   ├── auth.js                 # bcrypt + JWT utilities
│   ├── db.js                   # pg connection pool
│   ├── notifications.js        # Slack webhook integration
│   ├── middleware/
│   │   └── auth.js             # requireAuth + requireAdmin Express middleware
│   ├── routes/
│   │   ├── auth.js             # POST /register, POST /login, GET /me
│   │   ├── pipelines.js        # GET /pipelines, GET /pipelines/:id, POST /trigger
│   │   ├── runs.js             # GET /runs, GET /runs/:id, GET /runs/:id/logs
│   │   └── metrics.js          # GET /metrics (aggregated pipeline statistics)
│   └── __tests__/
│       ├── auth.test.js        # bcrypt and JWT unit tests
│       ├── webhook.test.js     # HMAC signature verification tests
│       ├── worker.test.js      # Full pipeline execution flow tests (mocked)
│       └── routes.auth.test.js # Auth API integration tests
│
├── frontend/                   # React frontend (Vite)
│   ├── src/
│   │   ├── App.jsx             # Root component, navigation, auth gate
│   │   ├── context/
│   │   │   └── AuthContext.jsx # JWT state (React state only — not localStorage)
│   │   ├── utils/
│   │   │   └── api.js          # fetch() wrapper that injects Authorization header
│   │   └── components/
│   │       ├── LoginPage.jsx       # Login form
│   │       ├── SignUpPage.jsx      # Registration form + password strength meter
│   │       ├── PipelineList.jsx    # Pipeline cards with status + manual trigger
│   │       ├── RunHistory.jsx      # Paginated run list, auto-refreshes every 3s
│   │       ├── LogViewer.jsx       # Live log terminal (WebSocket) + history replay
│   │       └── MetricsDashboard.jsx # Bar chart, line chart, summary cards, top pipelines
│   ├── vite.config.js          # Dev proxy: /api, /ws, /webhook → localhost:3000
│   └── vercel.json             # SPA rewrites + security headers (CSP, X-Frame-Options)
│
├── db/
│   ├── schema.sql              # Table definitions (pipelines, runs, steps, logs, users)
│   ├── migrate.js              # Applies schema.sql to the target database
│   └── seed-admin.js           # Creates/upserts the first admin user
│
├── docs/
│   ├── deploy.md               # Railway deployment guide
│   ├── deploy-vps.md           # VPS / Docker Compose deployment guide
│   └── deploy-gcp.md           # Google Cloud Platform deployment guide
│
├── Dockerfile.server           # Node 18 Alpine — API server
├── Dockerfile.worker           # Node 18 Alpine + docker-cli — pipeline worker
├── Dockerfile.frontend         # Multi-stage: Vite build → Nginx serve
├── nginx.conf                  # Reverse proxy config (API, WebSocket, SPA fallback)
├── docker-compose.yml          # Local dev infra (Postgres + Redis only)
├── docker-compose.prod.yml     # Full production stack (all 5 services)
├── docker-compose.worker.yml   # Worker-only (for running locally against cloud infra)
├── .env.example                # Environment variable template
└── .pipeline.json              # Example pipeline config used by this repo itself
```

---

## Request Flow

Here's what happens from the moment a developer pushes a commit until logs appear in the browser:

```mermaid
sequenceDiagram
    participant GH as GitHub
    participant Server as Express Server
    participant Queue as Bull Queue (Redis)
    participant Worker as Pipeline Worker
    participant Docker as Docker (host)
    participant PubSub as Redis Pub/Sub
    participant Browser as Browser (WebSocket)
    participant DB as PostgreSQL

    GH->>Server: POST /webhook/github (HMAC signed)
    Server->>Server: Verify HMAC-SHA256 signature
    Server->>DB: Find or create pipeline (repo_url + branch)
    Server->>DB: INSERT run (status='pending')
    Server->>Queue: queue.add({ runId, repoUrl, branch, commitSha })
    Server-->>GH: 202 Accepted

    Queue->>Worker: Job dequeued (concurrency: 2)
    Worker->>DB: UPDATE run SET status='running'
    Worker->>GH: git clone --depth 1 → /tmp/cicd-run-{runId}
    Worker->>Worker: Parse .pipeline.yml / .pipeline.yaml / .pipeline.json

    loop For each step (sequential) or step group (parallel)
        Worker->>DB: INSERT step (status='running')
        Worker->>Docker: docker run --rm -v /tmp/cicd-run-{runId}:/app {image} sh -c "{command}"
        Docker-->>Worker: stdout / stderr lines
        Worker->>PubSub: publish("run:{runId}:logs", logLine)
        PubSub-->>Server: message event
        Server-->>Browser: ws.send(JSON.stringify(logLine))
        Worker->>DB: INSERT log (line)
        Worker->>DB: UPDATE step SET status, exit_code
    end

    Worker->>DB: UPDATE run SET status='success'|'failed'
    Worker->>PubSub: publish "__PIPELINE_DONE__"
    Worker->>Slack: POST (only on failure)
    Worker->>Worker: fs.rmSync(tmpDir, { recursive: true })

    Browser->>Browser: Receive __PIPELINE_DONE__ → stop streaming, reload run status
```

---

## Backend Architecture

### Server (`src/server.js`)

The Express server and WebSocket server share the same underlying `http.Server` instance, mounted on different paths (`/api/*` vs `/ws`). This avoids needing a second port.

Route security is applied at mount time with two middleware layers:
- `requireAuth` — verifies the `Authorization: Bearer <token>` header and attaches `req.user`
- `requireAdmin` — calls `requireAuth` first, then checks `req.user.role === 'admin'`

The GitHub webhook endpoint is intentionally kept unauthenticated. It doesn't use JWT — GitHub authenticates using HMAC-SHA256.

### Worker (`src/worker.js`)

The worker is a completely separate Node.js process. It connects to the same Redis and PostgreSQL instances as the server.

**Execution flow for each job:**
1. Mark run as `running` in the DB
2. Shallow-clone the repository into `/tmp/cicd-run-{runId}`
3. Detect pipeline config: `.pipeline.yml` → `.pipeline.yaml` → `.pipeline.json`
4. Iterate over steps. Each step can be sequential or a `parallel` group
5. For each step, insert a `steps` record, call `runStep()`, save each log line to the `logs` table and publish it to Redis
6. Mark the step and ultimately the run as `success` or `failed`
7. Notify Slack if failed (errors from Slack never propagate back to affect the result)
8. Clean up the temp directory in `finally {}` — always runs even if a step throws

**Crash recovery:** On startup, the worker queries for any runs stuck in `running` state. These are runs where the worker died mid-execution. It resets them to `pending` and re-queues them so they will be retried.

**Concurrency:** `pipelineQueue.process(2, ...)` — the worker handles up to 2 jobs simultaneously.

### Queue (`src/queue.js`)

Bull wraps Redis to provide job persistence, retries, and state management. Jobs are configured with `attempts: 3` and `backoff: 5000` (5-second delay between retries). Bull's queue events (`waiting`, `active`, `completed`, `failed`) are logged to stdout.

The queue implementation handles both plain Redis (`redis://`) and TLS Redis (`rediss://` or Upstash) by conditionally setting `tls` options.

### Pub/Sub (`src/pubsub.js`)

Redis pub/sub is used to bridge the worker process (publisher) and the server process (subscriber). A Redis connection in `SUBSCRIBE` mode cannot issue other commands, so two separate `ioredis` connections are maintained: one for publishing, one for subscribing.

The channel naming convention is `run:{runId}:logs`. When a WebSocket client subscribes to a run, the server subscribes to that channel. Every message received from Redis is forwarded directly to the WebSocket.

### Docker Runner (`src/docker-runner.js`)

Executes a single step by running:

```bash
docker run --rm -v "{repoPath}:/app" -w /app {image} sh -c "{command}"
```

- `--rm` — container is deleted immediately after the step exits
- `-v` — the cloned repository is bind-mounted into `/app` inside the container
- `-w /app` — working directory is set to `/app`
- `{image}` — configurable per step in the pipeline config (default: `node:18-alpine`)

`stdout` and `stderr` are streamed line by line via the `onLog` callback. There's a hard 5-minute timeout per step.

The worker Docker container mounts the host Docker socket (`/var/run/docker.sock`) so that `docker run` commands spawn sibling containers on the host, not nested containers.

### Notifications (`src/notifications.js`)

Sends a Slack Block Kit message on pipeline failure. Uses Node's built-in `fetch` (Node 18+) — no extra dependency. If `SLACK_WEBHOOK_URL` is not set, the function returns early. Any error from Slack is caught and logged as a warning; it never affects the pipeline result.

---

## Frontend Architecture

### Routing & Auth Gate

`App.jsx` acts as the auth gate. If `user` is `null` in `AuthContext`, the login or sign-up page is rendered. Once authenticated, the main nav and routes are shown. React Router v6 handles three routes: `/` (pipelines), `/runs` (run history), `/runs/:runId` (log viewer).

### State Management

Global state is minimal. `AuthContext` holds the `user` object and JWT token in React component state — deliberately not in `localStorage` or `sessionStorage`. The reasoning is that tokens in storage are accessible to any JavaScript on the page; in-memory state is cleared on tab close. The token is synced to the `api.js` module via `setToken()` so the fetch wrapper can inject it without prop-drilling.

### API Communication (`src/utils/api.js`)

`apiFetch` is a thin wrapper around `fetch()` that automatically sets `Authorization: Bearer <token>`. The base URL comes from `VITE_API_URL` (empty in production where Nginx handles proxying, set to the backend URL in dev).

### Components

| Component | Key Behavior |
|---|---|
| `LoginPage` | Form → `AuthContext.login()` → JWT stored in state |
| `SignUpPage` | Form + live password strength meter (length, digit, letter checks) + confirm-match validation |
| `PipelineList` | Polls `/api/pipelines` every 5 seconds. Admins see a "▶ Run" button; viewers see history only |
| `RunHistory` | Polls `/api/runs` every 3 seconds. Supports `?pipelineId=` filter |
| `LogViewer` | Opens a WebSocket connection, subscribes to the run, appends log lines. If the run is already finished, skips WebSocket and fetches logs from the API. Auto-scrolls to the bottom as lines arrive |
| `MetricsDashboard` | Fetches `/api/metrics` on mount and every 30 seconds. Renders summary cards, a stacked bar chart (Recharts), a line chart, and a top-pipelines table |

---

## Database Design

```mermaid
erDiagram
    users {
        int id PK
        text email UK
        text password_hash
        text role
        timestamp created_at
    }

    pipelines {
        int id PK
        text repo_url
        text repo_name
        text branch
        timestamp created_at
    }

    runs {
        int id PK
        int pipeline_id FK
        text commit_sha
        text status
        text triggered_by
        timestamp triggered_at
        timestamp completed_at
    }

    steps {
        int id PK
        int run_id FK
        text name
        text command
        text status
        int exit_code
        timestamp started_at
        timestamp completed_at
    }

    logs {
        int id PK
        int run_id FK
        int step_id FK
        text line
        timestamp logged_at
    }

    pipelines ||--o{ runs : "has many"
    runs ||--o{ steps : "has many"
    runs ||--o{ logs : "has many"
    steps ||--o{ logs : "produces"
```

**Notes:**
- `pipelines` are uniquely identified by the `repo_url + branch` combination. The webhook handler does a find-or-create on each push.
- `runs.status` transitions: `pending` → `running` → `success` | `failed`
- `runs.triggered_by` is set to the GitHub pusher's name (from webhook payload) or `'manual'` for dashboard-triggered runs
- Logs are dual-keyed on both `run_id` and `step_id`, so they can be queried by either

---

## API Documentation

### Authentication

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register a new user. Default role: `viewer` |
| `POST` | `/api/auth/login` | Public | Login, returns `{ token, user }` |
| `GET` | `/api/auth/me` | `requireAuth` | Returns the authenticated user's profile |

**Request body (register / login):**
```json
{ "email": "user@example.com", "password": "yourpassword" }
```

**Response (login / register):**
```json
{
  "token": "<jwt>",
  "user": { "id": 1, "email": "user@example.com", "role": "viewer" }
}
```

---

### Pipelines

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/pipelines` | `requireAuth` | List all pipelines with run counts and last status |
| `GET` | `/api/pipelines/:id` | `requireAuth` | Get a single pipeline |
| `POST` | `/api/pipelines/:id/trigger` | `requireAdmin` | Manually trigger a new run |

**Response (`GET /api/pipelines`):**
```json
[
  {
    "id": 1,
    "repo_name": "owner/repo",
    "branch": "main",
    "total_runs": "12",
    "last_status": "success",
    "last_run_at": "2024-01-15T10:30:00.000Z"
  }
]
```

---

### Runs

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/runs` | `requireAuth` | List runs. Supports `?pipelineId=`, `?limit=`, `?offset=` |
| `GET` | `/api/runs/:id` | `requireAuth` | Get run details including step records |
| `GET` | `/api/runs/:id/logs` | `requireAuth` | Get stored log lines for a completed run |

---

### Metrics

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/metrics` | `requireAuth` | Aggregated stats: summary, runs per day (30d), duration trend, top pipelines |

**Response (`GET /api/metrics`):**
```json
{
  "summary": {
    "totalRuns": 47,
    "successCount": 39,
    "failedCount": 8,
    "pendingCount": 0,
    "successRate": 83.0,
    "avgDurationSeconds": 42
  },
  "runsPerDay": [{ "date": "2024-01-01", "total": 3, "success": 2, "failed": 1 }],
  "durationTrend": [{ "date": "2024-01-01", "avgSeconds": 38 }],
  "topPipelines": [{ "pipelineId": 1, "repoName": "owner/repo", "branch": "main", "totalRuns": 22, "successRate": 90.9 }]
}
```

---

### Webhook

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/webhook/github` | HMAC-SHA256 | Receives GitHub push events and queues a pipeline run |

---

### WebSocket

Connect to `ws://{host}/ws?token={jwt}`. The token is verified on connection; invalid tokens result in a `1008` close.

**Subscribe to a run's live logs:**
```json
{ "type": "subscribe", "runId": 42 }
```

**Incoming messages:**
```json
{ "runId": 42, "line": "✅ \"Run Tests\" passed", "timestamp": "2024-01-15T10:30:05.123Z" }
```

**Stream termination sentinel:**
```json
{ "runId": 42, "line": "__PIPELINE_DONE__", "timestamp": "..." }
```

---

## Authentication Flow

```mermaid
sequenceDiagram
    participant UI as React App
    participant API as Express Server
    participant DB as PostgreSQL

    UI->>API: POST /api/auth/login { email, password }
    API->>DB: SELECT user WHERE email = ?
    DB-->>API: { id, email, password_hash, role }
    API->>API: bcrypt.compare(password, hash)
    API->>API: jwt.sign({ id, email, role }, JWT_SECRET, { expiresIn: '7d' })
    API-->>UI: { token, user }
    UI->>UI: setToken(token) — stored in React state only
    
    Note over UI: Subsequent API calls
    UI->>API: GET /api/pipelines (Authorization: Bearer <token>)
    API->>API: jwt.verify(token, JWT_SECRET)
    API->>API: req.user = { id, email, role }
    API-->>UI: Pipeline data

    Note over UI: WebSocket connection
    UI->>API: WebSocket ws://host/ws?token=<jwt>
    API->>API: jwt.verify(token) on connect
    API-->>UI: Connection accepted (or 1008 close)
```

**Role enforcement:**
- `requireAuth` — any logged-in user (viewer or admin)
- `requireAdmin` — admin only; returns `403` for viewers. Applied to `POST /api/pipelines/:id/trigger`

---

## Pipeline Configuration

Add a `.pipeline.yml`, `.pipeline.yaml`, or `.pipeline.json` file to the root of your repository. The worker searches in that priority order.

**Sequential steps:**
```yaml
steps:
  - name: Install dependencies
    command: npm ci
    image: node:20-alpine

  - name: Run tests
    command: npm test
    image: node:20-alpine
```

**Parallel step group:**
```yaml
steps:
  - name: Environment Check
    command: node --version
    image: node:20-alpine

  - parallel:
      - name: Unit Tests
        command: npm test
        image: node:20-alpine
      - name: Lint
        command: npm run lint
        image: node:20-alpine
      - name: Type Check
        command: npx tsc --noEmit
        image: node:20-alpine

  - name: Build
    command: npm run build
    image: node:20-alpine
```

If a sequential step fails, all subsequent steps are skipped. If any step within a parallel group fails, the group is marked failed and subsequent sequential steps are skipped.

---

## Queue & Worker Architecture

```mermaid
graph LR
    subgraph "Server Process"
        WH["Webhook Handler"]
        API["API Routes"]
    end

    subgraph "Redis"
        Q["Bull Queue<br/>pipeline-jobs"]
        PS["Pub/Sub Channels<br/>run:{id}:logs"]
    end

    subgraph "Worker Process (concurrency: 2)"
        W1["Job Slot 1"]
        W2["Job Slot 2"]
    end

    WH -->|"queue.add(jobData, { attempts:3, backoff:5000 })"| Q
    API -->|"queue.add() — manual trigger"| Q
    Q -->|"Dequeue"| W1
    Q -->|"Dequeue"| W2
    W1 -->|"publishLog(runId, line)"| PS
    W2 -->|"publishLog(runId, line)"| PS
    PS -->|"subscriber.on('message')"| API
```

Bull stores job state in Redis (waiting, active, completed, failed). If the worker crashes while processing a job, Bull will re-queue it on the next restart (handled additionally by the `recoverStuckJobs()` function which resets any `running` DB rows to `pending`).

---

## Docker Execution Architecture

```mermaid
graph TB
    Host["Host Machine<br/>(Docker Daemon)"]
    
    subgraph "Containers on Host"
        WC["cicd_worker<br/>(Node + docker-cli)<br/>docker.sock mounted"]
        PC["Pipeline Container<br/>(e.g., node:20-alpine)<br/>--rm flag"]
    end

    WC -->|"docker run --rm<br/>-v /tmp/cicd-run-{id}:/app<br/>-w /app {image} sh -c {cmd}"| Host
    Host -->|"Spawn sibling container"| PC
    PC -->|"stdout/stderr"| WC
    WC -->|"Temp dir cleanup<br/>fs.rmSync()"| Host
```

The worker itself runs in a container. By mounting `/var/run/docker.sock` into the worker container, the worker's `docker` CLI talks to the host Docker daemon, spawning pipeline containers as siblings (not children). This is sometimes called "Docker-out-of-Docker" (DooD).

Each step container:
- Uses `--rm` — automatically removed after exit
- Has the repository mounted at `/app` via bind mount
- Has a 5-minute execution timeout (hard limit in `child_process.exec`)
- Runs as whatever user the Docker image defaults to

---

## Real-Time Logs

The log streaming system has two paths depending on the run's state:

**Live run (status: `running` or `pending`):**
1. Frontend opens a WebSocket to `/ws?token=<jwt>`
2. On open, sends `{ type: "subscribe", runId: <id> }`
3. Server subscribes to Redis channel `run:{runId}:logs`
4. Worker publishes each log line to that channel as it's produced
5. Server forwards each message to the WebSocket client
6. When the worker publishes `__PIPELINE_DONE__`, the frontend stops streaming and reloads the run status

**Completed run (status: `success` or `failed`):**
1. Frontend detects `status !== 'running'`
2. Fetches `GET /api/runs/:id/logs` to retrieve all stored log lines from PostgreSQL
3. Renders them directly, no WebSocket needed

Log line coloring in the terminal UI:
- `❌` or `[stderr]` → red
- `✅` or `PASSED` → green
- `🚀` or `▶️` → blue
- `📦` or `📋` → yellow
- Everything else → slate

---

## Error Handling

- **Worker step failure** — Step is marked `failed`, run is marked `failed`, remaining steps are skipped. The pipeline result is still cleanly written to the DB and `__PIPELINE_DONE__` is published. Job is re-thrown so Bull records it as failed (enabling retry logic).
- **Worker crash / process kill** — On next worker startup, `recoverStuckJobs()` detects rows with `status = 'running'` and re-queues them. Bull also retries the job automatically (up to 3 times) if the process throws.
- **Slack errors** — Wrapped in `try/catch`. A Slack outage never changes the pipeline result.
- **Webhook signature mismatch** — Returns `401`. Logged with a warning.
- **Invalid/expired JWT** — `requireAuth` returns `401`. WebSocket connections are closed with code `1008`.
- **Duplicate email on register** — PostgreSQL `unique_violation` (error code `23505`) is caught and returns `409 Conflict`.
- **Missing pipeline config** — Worker throws a descriptive error: `"No pipeline config found. Add one of: .pipeline.yml, .pipeline.yaml, .pipeline.json"`. The run is marked `failed`.

---

## Security

| Concern | Implementation |
|---|---|
| **Password storage** | `bcryptjs` with 10 salt rounds. Passwords are never stored or logged in plaintext |
| **JWT signing** | `jsonwebtoken` with `JWT_SECRET` from environment. Tokens expire in 7 days |
| **JWT storage (frontend)** | In-memory React state only. Not stored in `localStorage` or `sessionStorage`. Clears on page close |
| **WebSocket auth** | Token passed as `?token=` query param, verified with `jwt.verify()` before any data flows |
| **GitHub webhook verification** | HMAC-SHA256 with `crypto.timingSafeEqual()` — prevents both payload tampering and timing attacks |
| **Role enforcement** | Admin-only endpoints (`POST /trigger`) are protected with `requireAdmin` middleware. The frontend also hides trigger buttons for viewers, but the backend is the source of truth |
| **SQL injection** | All queries use parameterized queries via `pg`'s `pool.query($1, $2, ...)` — no string concatenation |
| **CORS** | Configured with `FRONTEND_URL` in production; denies other origins |
| **Content Security Policy** | Set in `vercel.json` for the frontend deployment — restricts script, style, and connection sources |
| **Security headers** | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` |
| **Container isolation** | Each pipeline step runs in an ephemeral, isolated Docker container that is automatically removed (`--rm`) after execution |

---

## Performance Optimizations

**Implemented:**
- **Shallow git clone** (`--depth 1`) — only fetches the tip of the branch, not full history. Significantly faster for large repos
- **Worker concurrency** — Processes 2 jobs in parallel without running multiple worker processes
- **Metrics polling interval** — Dashboard polls every 30 seconds (not every second), reducing DB load
- **Pipeline list polling** — 5-second interval; run history is 3 seconds (more time-sensitive)
- **Redis pub/sub for log streaming** — Logs don't go through the HTTP layer; they're pushed directly from worker to server via in-memory Redis messaging
- **Temp directory cleanup** — Repo clones are deleted after each run, preventing disk exhaustion
- **Production-only SSL in pg pool** — SSL overhead is skipped in development and test environments

**Future improvements:**
- Worker horizontal scaling — Run multiple worker instances against the same Redis queue. Bull handles job distribution automatically
- Log pagination — The `GET /runs/:id/logs` endpoint returns all log lines; for very long pipelines, pagination or streaming would reduce payload size
- Database connection pooling tuning — The pg pool size is not explicitly configured; for high concurrency it should be tuned
- Docker image pre-pulling — Worker could pre-pull common images on startup to reduce cold-start time for the first job
- Redis TTL on log channels — Published log messages have no TTL; they're ephemeral by nature, but setting a max memory policy on Redis would be prudent

---

## Scalability Considerations

The architecture has clear horizontal scaling points built in:

| Component | Scaling Strategy |
|---|---|
| **API Server** | Stateless (JWT auth, no session). Run multiple instances behind a load balancer |
| **Worker** | Add more worker containers/processes. Bull distributes jobs via Redis; no coordination needed between workers |
| **Redis** | Currently a single instance. For high availability: Redis Sentinel or Redis Cluster |
| **PostgreSQL** | Single instance with connection pooling (pg Pool). Read-heavy workloads could add a read replica |
| **WebSocket** | Currently each server manages its own subscriber connections. Multi-instance WebSocket requires a shared Redis adapter (e.g., `socket.io-redis`) or sticky sessions at the load balancer |

The runner itself (Docker-out-of-Docker) is the primary throughput bottleneck — each host machine has finite Docker capacity. The intended scaling path is to add more worker-host pairs.

---

## Installation

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- Node.js 18+
- [ngrok](https://ngrok.com) (for local GitHub webhook testing)

### 1. Clone the repository

```bash
git clone https://github.com/your-username/cicd-engine.git
cd cicd-engine
```

### 2. Configure environment variables

```bash
cp .env.example .env.development
```

Edit `.env.development`:

```env
NODE_ENV=development
PORT=3000

DATABASE_URL=postgresql://cicd_user:cicd_pass@localhost:5432/cicd_db
REDIS_URL=redis://localhost:6379

GITHUB_WEBHOOK_SECRET=your_webhook_secret_here
JWT_SECRET=a_random_string_at_least_32_characters_long

SLACK_WEBHOOK_URL=           # optional
FRONTEND_URL=http://localhost:5173
```

### 3. Start infrastructure

```bash
docker-compose up -d
```

This starts PostgreSQL on `5432` and Redis on `6379`.

### 4. Apply the database schema

```bash
npm run migrate
```

### 5. Create an admin user

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=yourpassword npm run seed:admin
```

### 6. Start the backend server

```bash
npm run dev
```

### 7. Start the pipeline worker

In a new terminal:

```bash
npm run dev:worker
```

### 8. Start the frontend

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

The app is now running at [http://localhost:5173](http://localhost:5173).

### 9. Connect GitHub (for webhook testing)

Expose your local server with ngrok:

```bash
ngrok http 3000
```

Go to your GitHub repository → Settings → Webhooks → Add webhook:
- **Payload URL:** `https://your-ngrok-url.ngrok.io/webhook/github`
- **Content type:** `application/json`
- **Secret:** same value as `GITHUB_WEBHOOK_SECRET` in your `.env.development`
- **Events:** Just the `push` event

### 10. Add a pipeline config to your target repo

```json
{
  "steps": [
    {
      "name": "Install",
      "command": "npm ci",
      "image": "node:20-alpine"
    },
    {
      "name": "Test",
      "command": "npm test",
      "image": "node:20-alpine"
    }
  ]
}
```

Push a commit. The pipeline will trigger automatically.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | Yes | `development`, `production`, or `test` |
| `PORT` | No | API server port. Default: `3000` |
| `DATABASE_URL` | Yes | PostgreSQL connection string. Format: `postgresql://user:pass@host:5432/db` |
| `REDIS_URL` | Yes | Redis connection string. Format: `redis://host:6379` or `rediss://...` for TLS |
| `JWT_SECRET` | Yes | Secret key for signing JWTs. Use a random string of at least 32 characters |
| `GITHUB_WEBHOOK_SECRET` | Yes | Secret configured in GitHub webhook settings. Used for HMAC-SHA256 payload verification |
| `SLACK_WEBHOOK_URL` | No | Incoming Webhook URL from Slack. If not set, notifications are silently skipped |
| `FRONTEND_URL` | No | Base URL of the frontend. Used to construct log links in Slack notifications. Default: `http://localhost:5173` |
| `ADMIN_EMAIL` | Seed only | Email for the initial admin user (used by `npm run seed:admin`) |
| `ADMIN_PASSWORD` | Seed only | Password for the initial admin user |

**Frontend variables (in `frontend/.env.development`):**

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend base URL. Leave empty in production (Nginx proxies `/api`). Example: `http://localhost:3000` for local without Vite proxy |
| `VITE_WS_URL` | WebSocket URL. Leave empty to use `window.location.host`. Example: `ws://localhost:3000` |

---

## Development Workflow

```bash
# Backend (with hot reload)
npm run dev

# Worker (with hot reload)
npm run dev:worker

# Frontend (Vite dev server with HMR)
cd frontend && npm run dev

# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Apply schema changes
npm run migrate

# Create/update admin user
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=secret npm run seed:admin
```

**Test suite:**
- `auth.test.js` — bcrypt hash/compare, JWT generate/verify/expire/tamper
- `webhook.test.js` — HMAC signature validation (valid, wrong secret, missing header, empty body)
- `worker.test.js` — Step success/failure, early exit on failure, log publishing, temp directory cleanup
- `routes.auth.test.js` — Integration tests for register, login, and `/me` endpoints

---

## Deployment

Three deployment guides are in the [`docs/`](./docs/) directory:

| Guide | Target |
|---|---|
| [`docs/deploy.md`](./docs/deploy.md) | Railway (PaaS — easiest option) |
| [`docs/deploy-vps.md`](./docs/deploy-vps.md) | Any Linux VPS (AWS EC2, DigitalOcean, Hetzner, Oracle Cloud) |
| [`docs/deploy-gcp.md`](./docs/deploy-gcp.md) | Google Cloud Platform (Compute Engine) |

### Production with Docker Compose (VPS)

```bash
# Copy and fill in secrets
cp .env.example .env
nano .env

# Start all services (Postgres, Redis, server, worker, frontend/nginx)
docker-compose -f docker-compose.prod.yml up -d --build

# Apply schema
docker exec cicd_server_prod npm run migrate

# Create first admin
docker exec -e ADMIN_EMAIL=admin@example.com -e ADMIN_PASSWORD=secret cicd_server_prod npm run seed:admin
```

**Important for the worker:** The worker must have access to the Docker daemon. In `docker-compose.prod.yml` this is handled by the volume mount:
```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```
On some managed platforms (Railway), you need to enable "Privileged Mode" on the worker service for this to work.

---

## Future Improvements

Features that are architecturally straightforward given the current design but not yet implemented:

- **Branch filtering** — Allow pipelines to only trigger on specific branches (e.g., only `main` and `release/*`)
- **Pull Request support** — Respond to `pull_request` webhook events in addition to `push`
- **Pipeline YAML editor in the UI** — Let admins edit pipeline config from the dashboard
- **Run cancellation** — Kill an in-progress Docker container and mark the run as `cancelled`
- **Build artifacts** — Allow steps to produce output files that can be downloaded from the UI
- **Environment variable injection** — Per-pipeline secret variables injected as Docker `--env` flags
- **Email notifications** — In addition to Slack, send email on failure via SMTP or SendGrid
- **Audit log** — Track who triggered what and when for compliance purposes
- **GitHub status checks** — Post build status back to the GitHub commit via the Checks API
- **Worker-side Docker image caching** — Pre-pull frequently used images to reduce startup time
- **WebSocket multi-server support** — Redis adapter for broadcasting across multiple server instances

---

## Learning Outcomes

This project demonstrates the following software engineering concepts from implementation, not theory:

- **Distributed systems** — Server and worker are independent processes that communicate only through shared infrastructure (Redis queue, PostgreSQL, Redis pub/sub). Either can restart independently without the other noticing
- **Job queues** — Bull's producer/consumer model with persistence, retries, backoff, and concurrency control
- **Redis pub/sub** — Using Redis as a real-time message broker to cross process boundaries, including why two separate connections are required
- **Container isolation** — Docker-out-of-Docker: mounting the host socket to let a containerized process spawn sibling containers
- **Real-time streaming** — Bridging Redis pub/sub to WebSocket to deliver a continuous stream of log lines to multiple browser clients simultaneously
- **Stateless authentication** — JWT-based auth where the server verifies tokens without database lookups, enabling horizontal scaling of the API layer
- **RBAC** — Role-based middleware that checks `req.user.role` after authentication
- **HMAC signature verification** — Timing-safe comparison to authenticate incoming webhook payloads
- **Crash recovery** — Detecting and re-queuing stuck jobs on restart to prevent lost work
- **Environment-aware configuration** — Separate config files per environment, loaded based on `NODE_ENV`
- **Multi-stage Docker builds** — Building the React app in a Node container, then serving only the `dist/` output from a minimal Nginx container
- **Reverse proxy** — Nginx routing traffic to the right service based on URL prefix, including WebSocket upgrade header handling

---

## Why This Project Stands Out

Most portfolio CI/CD projects call an existing cloud API. This one **builds the pipeline engine itself**.

The architecture solves real distributed systems problems:
- **Process isolation:** The server never blocks waiting for a Docker container to finish. The worker runs independently, picks up jobs from a persistent queue, and the server stays responsive.
- **Cross-process log streaming:** Log lines produced inside a Docker container inside a worker process appear in a browser WebSocket in real time. This crosses three process boundaries (Docker → Node worker → Redis → Node server → WebSocket → Browser) without any polling.
- **Failure resilience:** A worker crash doesn't lose a run. Stuck jobs are detected and re-queued on restart. Failed jobs are automatically retried by Bull. Slack errors never affect the pipeline result.
- **Security layering:** Webhook authentication (HMAC), API authentication (JWT), role authorization (admin/viewer), and WebSocket authentication are all implemented correctly and separately.

The code is organized the way a professional backend would be organized — separate concerns, environment-aware config, test coverage for the critical paths, and deployment documentation for three different hosting targets.

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Run the test suite: `npm test`
4. Commit your changes: `git commit -m 'feat: description'`
5. Push and open a pull request

---

## License

MIT

---

## Author

**Rushikesh Vashawale**

Built as a demonstration of distributed systems, real-time communication, and production backend engineering.