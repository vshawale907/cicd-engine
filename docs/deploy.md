---
# Deploying to Railway

## 1. Prerequisites
- Railway account at railway.app (free tier works)
- Railway CLI: `npm install -g @railway/cli`
- `railway login`

## 2. Create a new Railway project
`railway init`

## 3. Add managed services
In the Railway dashboard:
- Click "+ New" → Database → PostgreSQL → Add
- Click "+ New" → Database → Redis → Add

Railway auto-sets `DATABASE_URL` and `REDIS_URL` as environment variables in your project. Copy these for reference.

## 4. Deploy the server service
`railway up --dockerfile Dockerfile.server --service server`

Set environment variables for the server service in Railway dashboard:
  `NODE_ENV=production`
  `PORT=3000`
  `JWT_SECRET=<your 64-char random string>`
  `GITHUB_WEBHOOK_SECRET=<your webhook secret>`
  `SLACK_WEBHOOK_URL=<your slack webhook — optional>`
  `FRONTEND_URL=<your frontend Railway URL — fill in after frontend deploy>`
  `DATABASE_URL=<auto-set by Railway PostgreSQL plugin>`
  `REDIS_URL=<auto-set by Railway Redis plugin>`

## 5. Deploy the worker service
`railway up --dockerfile Dockerfile.worker --service worker`

Set the same environment variables as the server service.

**IMPORTANT — Docker-in-Docker for the worker:**
The worker runs `docker run` to execute pipeline steps.
In Railway, enable this by going to:
  Worker service → Settings → Enable "Privileged Mode"
This mounts the host Docker socket inside the container.

## 6. Deploy the frontend service
`railway up --dockerfile Dockerfile.frontend --service frontend`

Set environment variables:
  `VITE_API_URL=`   ← leave empty (nginx proxies /api to server)
  `VITE_WS_URL=`    ← leave empty (uses window.location.host)

## 7. Add a custom domain
In Railway dashboard → your frontend service → Settings → Domains:
- Add a custom domain or use the generated `.railway.app` subdomain
- Railway provisions SSL automatically — no configuration needed

## 8. Run database migration
`railway run --service server npm run migrate`

## 9. Create the first admin user
`railway run --service server \
  ADMIN_EMAIL=you@example.com \
  ADMIN_PASSWORD=your-secure-password \
  npm run seed:admin`

## 10. Update GitHub webhook
Go to your GitHub repo → Settings → Webhooks → edit your webhook:
Update the Payload URL to:
  `https://your-server-service.railway.app/webhook/github`

## 11. Update FRONTEND_URL
Now that both services are deployed, go to the server service environment variables and update:
  `FRONTEND_URL=https://your-frontend-service.railway.app`

This makes Slack notification links point to the correct URL.

## Verify deployment
- Open your frontend Railway URL in a browser
- Log in with your admin credentials
- Push a commit to a connected GitHub repo
- Watch the pipeline run live in the dashboard
---
