# underwrite-platform — Railway Deployment

## Railway deploys each service separately. Do NOT use `railway up` from the root.

## Step-by-step

### 1. Create a Railway project at railway.app

### 2. Add Postgres (click "+ New" → Database → PostgreSQL)
Copy the `DATABASE_URL` from its Variables tab — you'll need it.

### 3. Add Redis (click "+ New" → Database → Redis)  
Copy the `REDIS_URL` from its Variables tab.

### 4. Deploy the Backend

```bash
cd backend
railway link          # link to your project
railway up            # deploys using backend/railway.toml + backend/Dockerfile
```

Set these environment variables in the Railway dashboard for the backend service:
```
DATABASE_URL        = <from step 2>
REDIS_URL           = <from step 3>
SECRET_KEY          = <any long random string>
ANTHROPIC_API_KEY   = <your key from console.anthropic.com>
CORS_ORIGINS        = https://<your-frontend-url>.railway.app
ENVIRONMENT         = production
UPLOAD_DIR          = /app/uploads
```

### 5. Deploy the Celery Worker

```bash
cd backend           # same folder as backend
railway up --service celery-worker
```

In Railway dashboard, create a NEW service from the same backend repo,
but change the Start Command to:
```
celery -A app.tasks.celery_app worker --loglevel=info --concurrency=2
```
Give it the same environment variables as the backend (no PORT needed).

### 6. Deploy the Frontend

```bash
cd frontend
railway link          # link to same project
railway up            # deploys using frontend/railway.toml + frontend/Dockerfile
```

Set this environment variable for the frontend service:
```
NEXT_PUBLIC_API_URL = https://<your-backend-url>.railway.app
```

### 7. Test

- Frontend URL → log in as borrower@example.com / password123
- Click Acme Plumbing LLC → scroll down → see UnderwriteOS panels
- AI chat panel at bottom → type "What's the biggest risk in this deal?"

## Fastest alternative: deploy backend only first

The frontend can be tested locally pointing at the Railway backend:
```bash
cd frontend
NEXT_PUBLIC_API_URL=https://your-backend.railway.app npm run dev
```
