# Railway Deployment Guide

The root cause of the failed deploy: `railway up` from the project root sees
a monorepo and Railpack can't auto-detect it. Railway needs each service
deployed from its own subdirectory with an explicit Dockerfile.

## The Right Way to Deploy on Railway

Railway requires **4 separate services** — you cannot deploy the whole
docker-compose.yml in one shot. But Railway provides managed Postgres and
Redis plugins that replace those containers, so you only need to deploy 3
of your own services.

---

## Step 1 — Create the Railway project (do this once)

Go to railway.app → New Project → Empty Project.
Name it `underwrite-platform`.

---

## Step 2 — Add managed Postgres and Redis (do this in the dashboard)

In your Railway project dashboard:

**Add Postgres:**
- Click `+ New` → `Database` → `PostgreSQL`
- Railway creates it instantly and gives you a `DATABASE_URL` variable

**Add Redis:**
- Click `+ New` → `Database` → `Redis`
- Railway creates it instantly and gives you a `REDIS_URL` variable

Note both URLs — you'll need them in Step 4.

---

## Step 3 — Deploy backend (from the backend/ subdirectory)

```bash
cd underwrite-platform-v2/backend
railway link          # links this folder to your project
railway up            # deploys using backend/Dockerfile and backend/railway.json
```

Railway will find `backend/railway.json` and use the Dockerfile. It runs:
`alembic upgrade head && python -m app.seed && uvicorn app.main:app`

---

## Step 4 — Set backend environment variables (in Railway dashboard)

After deploy, go to your backend service in the Railway dashboard → Variables → add:

```
DATABASE_URL        = (paste from the Postgres plugin — starts with postgresql://)
REDIS_URL           = (paste from the Redis plugin — starts with redis://)
SECRET_KEY          = any-long-random-string-32-chars-minimum
ANTHROPIC_API_KEY   = sk-ant-your-key-here
ENVIRONMENT         = production
CORS_ORIGINS        = https://your-frontend-url.railway.app
UPLOAD_DIR          = /app/uploads
```

You'll get the frontend URL in Step 5 — come back and update CORS_ORIGINS after.

---

## Step 5 — Deploy frontend (from the frontend/ subdirectory)

```bash
cd ../frontend
railway link          # link to same project
railway up            # deploys using frontend/Dockerfile
```

Set frontend environment variable:
```
NEXT_PUBLIC_API_URL = https://your-backend-url.railway.app
```

You get the backend URL from Step 3 — it appears in the Railway dashboard
under the backend service → Settings → Networking → Public Domain.

---

## Step 6 — Deploy Celery worker (from the backend/ subdirectory)

The Celery worker runs the same code as the backend but with a different start command.
In Railway, add a **new service** pointing to the same source:

In the Railway dashboard → `+ New` → `GitHub Repo` (or `Empty Service`) →
set Root Directory to `backend` → set the start command to:

```
celery -A app.tasks.celery_app worker --loglevel=info --concurrency=2
```

Set the same DATABASE_URL, REDIS_URL, SECRET_KEY, and ANTHROPIC_API_KEY
environment variables on this service.

---

## Step 7 — Verify

1. Open the frontend Railway URL
2. Log in: `borrower@example.com` / `password123`
3. Click `Acme Plumbing LLC — Acquisition`
4. Scroll past the Heradyne risk report
5. You should see: Deal Verdict banner, Health Score (78/100), Valuation table,
   AI Chat panel, Playbooks, Breakpoint Scenarios, SBA 14-point checklist

---

## Troubleshooting

**"alembic upgrade head" fails on first deploy:**
The database exists but tables don't. This usually means the DATABASE_URL
wasn't set before the first deploy. Set it in the dashboard, then trigger
a redeploy (Railway dashboard → Deploy → Redeploy).

**Frontend shows blank page or API errors:**
CORS_ORIGINS on the backend doesn't match the frontend URL, or
NEXT_PUBLIC_API_URL on the frontend doesn't match the backend URL.
Both URLs appear in Railway dashboard → your service → Settings → Networking.

**Celery worker keeps restarting:**
Usually a missing environment variable. Check that DATABASE_URL and REDIS_URL
are set on the Celery service, not just the backend service.

**AI chat returns "unavailable" message:**
ANTHROPIC_API_KEY is not set or is incorrect. Set it on the backend service.
The UnderwriteOS math panels (health score, valuation, etc.) all work without
it — only the chat, AI scoring, and actuarial pricing need it.

---

## Quick Reference — All Environment Variables

| Variable | Service | Value |
|----------|---------|-------|
| DATABASE_URL | backend, celery | From Railway Postgres plugin |
| REDIS_URL | backend, celery | From Railway Redis plugin |
| SECRET_KEY | backend, celery | Random 32+ char string |
| ANTHROPIC_API_KEY | backend, celery | sk-ant-... |
| ENVIRONMENT | backend | production |
| CORS_ORIGINS | backend | https://your-frontend.railway.app |
| UPLOAD_DIR | backend | /app/uploads |
| NEXT_PUBLIC_API_URL | frontend | https://your-backend.railway.app |
