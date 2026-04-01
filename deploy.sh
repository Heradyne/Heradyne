#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# UnderwriteOS + Heradyne — Railway Deploy Script (Windows/Git Bash)
#
# Avoids CLI auth timeouts by having you set up the project in the dashboard
# first, then uses the CLI only for the fast parts (env vars + deploy trigger).
#
# Usage: bash deploy.sh
# ─────────────────────────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${BLUE}▶${NC} $1"; }
success() { echo -e "${GREEN}✔${NC} $1"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $1"; }
error()   { echo -e "${RED}✖${NC} $1"; exit 1; }
divider() { echo -e "\n${BLUE}────────────────────────────────────────${NC}\n"; }
pause()   { echo -e "${YELLOW}  → Press Enter when done...${NC}"; read -r; }

divider
echo -e "${BOLD}  UnderwriteOS + Heradyne — Railway Deploy${NC}"
divider

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 1 — You do this in the Railway dashboard (browser)
# ─────────────────────────────────────────────────────────────────────────────
echo -e "${BOLD}PHASE 1 — Set up in Railway dashboard${NC}"
echo ""
echo "We'll use the dashboard to avoid login timeouts."
echo "Follow each step, then press Enter to continue."

divider
echo -e "${BOLD}Step 1 — Delete old failed projects${NC}"
echo ""
echo "  1. Go to https://railway.app/dashboard"
echo "  2. Delete any old 'underwrite-platform' projects from failed attempts"
echo "     (click project → Settings → Danger Zone → Delete Project)"
echo ""
pause

divider
echo -e "${BOLD}Step 2 — Create a fresh project${NC}"
echo ""
echo "  1. Click '+ New Project'"
echo "  2. Select 'Empty Project'"
echo "  3. Name it: underwrite-platform"
echo ""
pause

divider
echo -e "${BOLD}Step 3 — Add PostgreSQL${NC}"
echo ""
echo "  1. Inside your project, click '+ New'"
echo "  2. Select 'Database' → 'PostgreSQL'"
echo "  3. Wait for it to show as Active (green)"
echo ""
pause

divider
echo -e "${BOLD}Step 4 — Add Redis${NC}"
echo ""
echo "  1. Click '+ New' again"
echo "  2. Select 'Database' → 'Redis'"
echo "  3. Wait for it to show as Active (green)"
echo ""
pause

divider
echo -e "${BOLD}Step 5 — Copy your DATABASE_URL${NC}"
echo ""
echo "  1. Click the PostgreSQL service tile"
echo "  2. Click the 'Data' tab"
echo "  3. Find 'Connection URL' — click the copy icon"
echo ""
read -rp "  Paste DATABASE_URL here: " DATABASE_URL
[ -z "$DATABASE_URL" ] && error "DATABASE_URL is required"
success "DATABASE_URL saved"

divider
echo -e "${BOLD}Step 6 — Copy your REDIS_URL${NC}"
echo ""
echo "  1. Click the Redis service tile"
echo "  2. Click the 'Data' tab"
echo "  3. Find 'Redis URL' or 'Connection URL' — click the copy icon"
echo ""
read -rp "  Paste REDIS_URL here: " REDIS_URL
[ -z "$REDIS_URL" ] && error "REDIS_URL is required"
success "REDIS_URL saved"

divider
echo -e "${BOLD}Step 7 — Anthropic API Key${NC}"
echo ""
echo "  1. Go to https://console.anthropic.com"
echo "  2. Click 'API Keys' → 'Create Key' → name it 'heradyne'"
echo "  3. Copy the key (starts with sk-ant-)"
echo "  Note: nothing will appear as you type/paste — that's normal"
echo ""
read -rsp "  Paste ANTHROPIC_API_KEY: " ANTHROPIC_API_KEY
echo ""
if [ -z "$ANTHROPIC_API_KEY" ]; then
  warn "No API key entered — AI features will use rules engine fallback"
  ANTHROPIC_API_KEY="not-set"
else
  success "API key saved"
fi

# Generate secret key
SECRET_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null \
  || python3 -c "import secrets; print(secrets.token_hex(32))" 2>/dev/null \
  || echo "heradyne-secret-$(date +%s)-change-before-real-users")
success "SECRET_KEY generated"

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 2 — Automated (CLI does the rest)
# ─────────────────────────────────────────────────────────────────────────────
divider
echo -e "${BOLD}PHASE 2 — Automated deployment${NC}"
echo ""
echo "From here the script handles everything. Keep this window open."
echo ""

# Login
info "Logging into Railway..."
railway login
success "Logged in"

# Link project
divider
info "Linking to your Railway project..."
echo ""
echo "Use arrow keys to select 'underwrite-platform', then press Enter."
echo ""
railway link
success "Project linked"

# Push to GitHub
divider
info "Pushing code to GitHub..."
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
  git add .
  git commit -m "Deploy: $(date '+%Y-%m-%d %H:%M')"
fi
git push -u origin main 2>/dev/null || git push -u origin master 2>/dev/null
REPO_URL=$(git remote get-url origin)
success "Code pushed: $REPO_URL"

# ── Backend ───────────────────────────────────────────────────────────────────
divider
echo -e "${BOLD}Add Backend service in the dashboard${NC}"
echo ""
echo "  1. In your Railway project, click '+ New' → 'GitHub Repo'"
echo "  2. Select your repo"
echo "  3. When asked for root directory, type: backend"
echo "  4. Click Deploy — it will start building (that's fine)"
echo ""
pause

info "Setting backend environment variables..."
railway variables set \
  DATABASE_URL="$DATABASE_URL" \
  REDIS_URL="$REDIS_URL" \
  SECRET_KEY="$SECRET_KEY" \
  ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  ENVIRONMENT="production" \
  UPLOAD_DIR="/app/uploads" \
  CORS_ORIGINS="*" \
  --service backend
success "Backend variables set"

info "Setting backend start command..."
railway service update \
  --start-command "alembic upgrade head && python -m app.seed && uvicorn app.main:app --host 0.0.0.0 --port \$PORT" \
  --service backend 2>/dev/null \
  && success "Start command set" \
  || warn "Set start command manually in dashboard → backend → Settings → Deploy → Start Command:
     alembic upgrade head && python -m app.seed && uvicorn app.main:app --host 0.0.0.0 --port \$PORT"

info "Generating backend public URL..."
railway domain generate --service backend 2>/dev/null || true
sleep 5
BACKEND_URL=$(railway domain --service backend 2>/dev/null | tail -1 || echo "")
if [ -z "$BACKEND_URL" ]; then
  echo ""
  echo "  In dashboard: backend service → Settings → Networking → Generate Domain"
  read -rp "  Paste backend domain (no https://): " BACKEND_URL
fi
success "Backend URL: https://$BACKEND_URL"

# ── Frontend ──────────────────────────────────────────────────────────────────
divider
echo -e "${BOLD}Add Frontend service in the dashboard${NC}"
echo ""
echo "  1. Click '+ New' → 'GitHub Repo'"
echo "  2. Select your repo"
echo "  3. Root directory: frontend"
echo "  4. Click Deploy"
echo ""
pause

info "Setting frontend environment variables..."
railway variables set \
  NEXT_PUBLIC_API_URL="https://$BACKEND_URL" \
  --service frontend
success "Frontend variables set"

info "Generating frontend public URL..."
railway domain generate --service frontend 2>/dev/null || true
sleep 5
FRONTEND_URL=$(railway domain --service frontend 2>/dev/null | tail -1 || echo "")
if [ -z "$FRONTEND_URL" ]; then
  echo ""
  echo "  In dashboard: frontend service → Settings → Networking → Generate Domain"
  read -rp "  Paste frontend domain (no https://): " FRONTEND_URL
fi
success "Frontend URL: https://$FRONTEND_URL"

# Update CORS with real frontend URL
railway variables set CORS_ORIGINS="https://$FRONTEND_URL" --service backend 2>/dev/null || true

# ── Celery ────────────────────────────────────────────────────────────────────
divider
echo -e "${BOLD}Add Celery Worker in the dashboard${NC}"
echo ""
echo "  1. Click '+ New' → 'GitHub Repo'"
echo "  2. Select your repo"
echo "  3. Root directory: backend  (same code as the API)"
echo "  4. Click Deploy"
echo ""
pause

info "Setting Celery environment variables..."
railway variables set \
  DATABASE_URL="$DATABASE_URL" \
  REDIS_URL="$REDIS_URL" \
  SECRET_KEY="$SECRET_KEY" \
  ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  ENVIRONMENT="production" \
  UPLOAD_DIR="/app/uploads" \
  --service celery-worker 2>/dev/null \
  || warn "Could not find service named 'celery-worker' — rename it in the dashboard and re-run, or set variables manually"

railway service update \
  --start-command "celery -A app.tasks.celery_app worker --loglevel=info --concurrency=2" \
  --service celery-worker 2>/dev/null \
  || warn "Set Celery start command manually:
     celery -A app.tasks.celery_app worker --loglevel=info --concurrency=2"

# ─────────────────────────────────────────────────────────────────────────────
divider
echo -e "${BOLD}${GREEN}  All done!${NC}"
divider
echo ""
echo -e "  ${BOLD}Frontend:${NC}  https://$FRONTEND_URL"
echo -e "  ${BOLD}Backend:${NC}   https://$BACKEND_URL"
echo -e "  ${BOLD}API docs:${NC}  https://$BACKEND_URL/docs"
echo ""
echo -e "  ${BOLD}Login credentials:${NC}"
echo "    borrower@example.com  /  password123"
echo "    lender1@example.com   /  password123"
echo "    admin@example.com     /  password123"
echo ""
echo -e "${YELLOW}  Backend takes 2-3 minutes to finish migrations + seeding.${NC}"
echo -e "${YELLOW}  If you see a DB connection error, click Redeploy on the backend.${NC}"
divider
