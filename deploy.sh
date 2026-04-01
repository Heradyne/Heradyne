#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# UnderwriteOS + Heradyne — Railway Deployment Script
# ─────────────────────────────────────────────────────────────────────────────
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh
#
# Prerequisites:
#   - Node.js installed (for Railway CLI)
#   - Git installed
#   - A Railway account (railway.app)
#   - A GitHub account
#   - An Anthropic API key (console.anthropic.com)
# ─────────────────────────────────────────────────────────────────────────────

set -e  # exit on any error

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # no color

# ── Helpers ──────────────────────────────────────────────────────────────────
info()    { echo -e "${BLUE}▶${NC} $1"; }
success() { echo -e "${GREEN}✔${NC} $1"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $1"; }
error()   { echo -e "${RED}✖${NC} $1"; exit 1; }
prompt()  { echo -e "${BOLD}$1${NC}"; }
divider() { echo -e "\n${BLUE}────────────────────────────────────────${NC}\n"; }

# ─────────────────────────────────────────────────────────────────────────────
divider
echo -e "${BOLD}  UnderwriteOS + Heradyne — Railway Deploy${NC}"
echo -e "  This script takes ~10 minutes end to end."
divider

# ── Step 0: Check prerequisites ──────────────────────────────────────────────
info "Checking prerequisites..."

if ! command -v git &> /dev/null; then
  error "Git not found. Install from https://git-scm.com"
fi
success "Git found"

if ! command -v node &> /dev/null; then
  error "Node.js not found. Install from https://nodejs.org (needed for Railway CLI)"
fi
success "Node.js found"

# Install Railway CLI if not present
if ! command -v railway &> /dev/null; then
  info "Installing Railway CLI..."
  npm install -g @railway/cli
  success "Railway CLI installed"
else
  success "Railway CLI found"
fi

# ── Step 1: GitHub setup ─────────────────────────────────────────────────────
divider
echo -e "${BOLD}Step 1 — Push to GitHub${NC}"
echo ""

# Check if already a git repo
if [ ! -d ".git" ]; then
  info "Initializing git repository..."
  git init
  git add .
  git commit -m "Initial commit: UnderwriteOS + Heradyne platform"
  success "Git repo initialized"
else
  info "Git repo already exists, checking for uncommitted changes..."
  if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    git add .
    git commit -m "Deploy: $(date '+%Y-%m-%d %H:%M')"
    success "Changes committed"
  else
    success "No uncommitted changes"
  fi
fi

# Check for remote
REPO_URL=""
if git remote get-url origin &>/dev/null; then
  REPO_URL=$(git remote get-url origin)
  success "GitHub remote already set: $REPO_URL"
else
  echo ""
  prompt "Enter your GitHub repo URL (create a new EMPTY repo at github.com first):"
  prompt "Example: https://github.com/yourname/underwrite-platform.git"
  echo ""
  read -r REPO_URL

  if [ -z "$REPO_URL" ]; then
    error "GitHub URL is required"
  fi

  git remote add origin "$REPO_URL"
fi

info "Pushing to GitHub..."
git branch -M main
git push -u origin main
success "Code pushed to GitHub"

# ── Step 2: Railway login ────────────────────────────────────────────────────
divider
echo -e "${BOLD}Step 2 — Log in to Railway${NC}"
echo ""
info "Opening Railway login (browser will open)..."
railway login
success "Logged in to Railway"

# ── Step 3: Collect secrets ──────────────────────────────────────────────────
divider
echo -e "${BOLD}Step 3 — Collect your secrets${NC}"
echo ""
warn "These will be set as Railway environment variables and never saved locally."
echo ""

prompt "Anthropic API key (get one at console.anthropic.com):"
read -rs ANTHROPIC_API_KEY
echo ""
if [ -z "$ANTHROPIC_API_KEY" ]; then
  warn "No Anthropic key entered — AI features will fall back to rules engine (that's OK for now)"
  ANTHROPIC_API_KEY="not-set"
fi

# Generate a secret key
SECRET_KEY=$(openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))")
success "SECRET_KEY generated: ${SECRET_KEY:0:8}..."

# ── Step 4: Create Railway project ───────────────────────────────────────────
divider
echo -e "${BOLD}Step 4 — Create Railway project${NC}"
echo ""
info "Creating new Railway project..."
railway init --name "underwrite-platform"
success "Railway project created"

# ── Step 5: Provision databases ──────────────────────────────────────────────
divider
echo -e "${BOLD}Step 5 — Provision databases${NC}"
echo ""
info "Adding PostgreSQL..."
railway add --database postgres
success "PostgreSQL added"

info "Adding Redis..."
railway add --database redis
success "Redis added"

info "Waiting 15 seconds for databases to initialize..."
sleep 15

# Get connection URLs from Railway
info "Fetching database connection strings..."

DATABASE_URL=$(railway variables --service postgres 2>/dev/null | grep DATABASE_URL | awk '{print $2}' || echo "")
REDIS_URL=$(railway variables --service redis 2>/dev/null | grep REDIS_URL | awk '{print $2}' || echo "")

if [ -z "$DATABASE_URL" ]; then
  echo ""
  warn "Could not auto-fetch DATABASE_URL."
  prompt "Please paste the DATABASE_URL from Railway dashboard (Postgres service → Connect tab):"
  read -r DATABASE_URL
fi

if [ -z "$REDIS_URL" ]; then
  echo ""
  warn "Could not auto-fetch REDIS_URL."
  prompt "Please paste the REDIS_URL from Railway dashboard (Redis service → Connect tab):"
  read -r REDIS_URL
fi

success "Database URLs collected"

# ── Step 6: Deploy backend API ───────────────────────────────────────────────
divider
echo -e "${BOLD}Step 6 — Deploy Backend API${NC}"
echo ""

info "Creating backend service from GitHub repo..."
railway add --service github \
  --source "$REPO_URL" \
  --name "backend" \
  --root-directory backend

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

info "Setting backend start command..."
railway service update \
  --start-command "alembic upgrade head && python -m app.seed && uvicorn app.main:app --host 0.0.0.0 --port \$PORT" \
  --service backend 2>/dev/null || \
  warn "Could not set start command via CLI — set it manually in Railway dashboard (see below)"

info "Deploying backend (this runs migrations + seeds demo data)..."
railway up --service backend --detach
success "Backend deploy triggered"

# Wait and get backend URL
info "Waiting 30 seconds for backend to start..."
sleep 30
BACKEND_URL=$(railway domain --service backend 2>/dev/null || echo "")
if [ -z "$BACKEND_URL" ]; then
  info "Generating backend public domain..."
  railway domain generate --service backend 2>/dev/null || true
  sleep 5
  BACKEND_URL=$(railway domain --service backend 2>/dev/null || echo "your-backend.railway.app")
fi
success "Backend URL: https://$BACKEND_URL"

# ── Step 7: Deploy frontend ──────────────────────────────────────────────────
divider
echo -e "${BOLD}Step 7 — Deploy Frontend${NC}"
echo ""

info "Creating frontend service..."
railway add --service github \
  --source "$REPO_URL" \
  --name "frontend" \
  --root-directory frontend

info "Setting frontend environment variables..."
railway variables set \
  NEXT_PUBLIC_API_URL="https://$BACKEND_URL" \
  --service frontend

info "Deploying frontend..."
railway up --service frontend --detach
success "Frontend deploy triggered"

# Get frontend URL
info "Generating frontend public domain..."
railway domain generate --service frontend 2>/dev/null || true
sleep 5
FRONTEND_URL=$(railway domain --service frontend 2>/dev/null || echo "your-frontend.railway.app")
success "Frontend URL: https://$FRONTEND_URL"

# Update CORS with real frontend URL
info "Updating CORS to allow frontend origin..."
railway variables set \
  CORS_ORIGINS="https://$FRONTEND_URL" \
  --service backend 2>/dev/null || true

# ── Step 8: Deploy Celery worker ─────────────────────────────────────────────
divider
echo -e "${BOLD}Step 8 — Deploy Celery Worker${NC}"
echo ""

info "Creating Celery worker service..."
railway add --service github \
  --source "$REPO_URL" \
  --name "celery-worker" \
  --root-directory backend

info "Setting Celery environment variables..."
railway variables set \
  DATABASE_URL="$DATABASE_URL" \
  REDIS_URL="$REDIS_URL" \
  SECRET_KEY="$SECRET_KEY" \
  ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  ENVIRONMENT="production" \
  UPLOAD_DIR="/app/uploads" \
  --service celery-worker

railway service update \
  --start-command "celery -A app.tasks.celery_app worker --loglevel=info --concurrency=2" \
  --service celery-worker 2>/dev/null || \
  warn "Could not set Celery start command via CLI — set it manually (see below)"

info "Deploying Celery worker..."
railway up --service celery-worker --detach
success "Celery worker deploy triggered"

# ── Done ─────────────────────────────────────────────────────────────────────
divider
echo -e "${BOLD}${GREEN}  Deploy complete!${NC}"
divider

echo -e "${BOLD}Your app:${NC}"
echo -e "  Frontend:  ${GREEN}https://$FRONTEND_URL${NC}"
echo -e "  Backend:   ${GREEN}https://$BACKEND_URL${NC}"
echo -e "  API docs:  ${GREEN}https://$BACKEND_URL/docs${NC}"
echo ""
echo -e "${BOLD}Login credentials:${NC}"
echo -e "  borrower@example.com   / password123"
echo -e "  lender1@example.com    / password123"
echo -e "  admin@example.com      / password123"
echo ""
echo -e "${BOLD}What to do if something failed:${NC}"
echo ""
echo -e "  1. Open ${BLUE}https://railway.app/dashboard${NC}"
echo -e "  2. Click the failing service → ${BOLD}Deployments${NC} tab → view logs"
echo ""
echo -e "  ${BOLD}Backend migration error?${NC} Click Redeploy — Postgres wasn't ready yet."
echo ""
echo -e "  ${BOLD}Frontend can't reach API?${NC} Check that NEXT_PUBLIC_API_URL is set to:"
echo -e "     https://$BACKEND_URL"
echo ""
echo -e "  ${BOLD}AI features not working?${NC} Make sure ANTHROPIC_API_KEY is set on the"
echo -e "  backend service in Railway dashboard → Variables."
echo ""
echo -e "  ${BOLD}Celery start command not set?${NC} Go to Railway dashboard →"
echo -e "  celery-worker service → Settings → Deploy → Start Command → paste:"
echo -e "     celery -A app.tasks.celery_app worker --loglevel=info --concurrency=2"
echo ""
divider
