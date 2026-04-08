# Heradyne — Backup & Disaster Recovery Runbook

**Last updated:** April 2026  
**Owner:** Platform Engineering  
**Review cadence:** Quarterly

---

## Recovery objectives

| Metric | Target | Notes |
|--------|--------|-------|
| RPO (Recovery Point Objective) | 24 hours | Max acceptable data loss |
| RTO (Recovery Time Objective) | 4 hours | Max acceptable downtime |
| Backup retention — hot | 7 days | Railway automated backups |
| Backup retention — archive | 90 days | Manual export to external storage |

---

## Current backup configuration (Railway)

Railway Postgres automatically creates daily snapshots. Verify this is enabled:

1. Go to **railway.app** → project → **Postgres** service
2. Click **Backups** tab
3. Confirm daily backups are listed and retention shows ≥7 days

**Important:** Railway free/hobby plans may not include backups. Confirm your plan includes them or enable the Postgres add-on.

---

## Manual backup procedure

Run before any major deployment or schema migration:

```bash
# From your local machine with DATABASE_URL set
pg_dump "$DATABASE_URL" \
  --no-owner \
  --no-acl \
  --format=custom \
  --file="heradyne_backup_$(date +%Y%m%d_%H%M%S).dump"
```

Store the `.dump` file in a secure location (encrypted S3, local encrypted drive). Never commit to git.

---

## Restore procedure

### Scenario 1: Partial data loss (single table corruption)

```bash
# Restore a single table from a dump
pg_restore \
  --dbname="$DATABASE_URL" \
  --table=deals \
  --data-only \
  heradyne_backup_YYYYMMDD.dump
```

### Scenario 2: Full database restore

```bash
# 1. Create a fresh database (Railway: delete and recreate Postgres service)
# 2. Run migrations to create schema
cd backend && alembic upgrade head

# 3. Restore data from dump
pg_restore \
  --dbname="$DATABASE_URL" \
  --no-owner \
  --no-acl \
  heradyne_backup_YYYYMMDD.dump

# 4. Verify row counts
psql "$DATABASE_URL" -c "
  SELECT
    (SELECT COUNT(*) FROM users) AS users,
    (SELECT COUNT(*) FROM deals) AS deals,
    (SELECT COUNT(*) FROM deal_matches) AS matches,
    (SELECT COUNT(*) FROM executed_loans) AS loans,
    (SELECT COUNT(*) FROM audit_logs) AS audit_logs;
"

# 5. Run seed only if users table is empty (fresh environment)
# python -m app.seed
```

### Scenario 3: Railway service completely down

1. Export database from Railway dashboard (Backups → Download)
2. Provision new Railway project
3. Set all environment variables (see Environment Variables section below)
4. Push code: `git push railway main`
5. Follow full restore procedure above

---

## Environment variables (required for restore)

These must be re-set on any new Railway service:

```
DATABASE_URL          # Provided by Railway Postgres
REDIS_URL             # Provided by Railway Redis
SECRET_KEY            # Generate: python3 -c "import secrets; print(secrets.token_hex(32))"
FIELD_ENCRYPTION_KEY  # CRITICAL: must match original or encrypted data is unreadable
ANTHROPIC_API_KEY     # From Anthropic console
CORS_ORIGINS          # Frontend URL
ENVIRONMENT           # production
RESEED_SECRET         # heradyne-reseed-2024
```

**CRITICAL:** `FIELD_ENCRYPTION_KEY` must be the same value as the original deployment. If this key is lost, all encrypted fields (personal_assets, business_assets in deals) are permanently unreadable. Store this key separately from the codebase in a password manager.

---

## File upload recovery

Uploaded documents are stored in `/app/uploads` inside the Railway container. This directory is **ephemeral** — it is lost on redeploy.

**Current status:** Documents are encrypted at rest but stored in ephemeral container storage. This is a known gap.

**Recommended remediation (Phase 5):**
- Migrate file storage to AWS S3 or Railway Volumes
- Enable S3 versioning for point-in-time file recovery
- Estimated effort: 1–2 days

---

## Monthly restore test procedure

Run on the first Monday of each month:

```bash
# 1. Download latest Railway backup
# 2. Spin up local Postgres
docker run -d --name heradyne_test \
  -e POSTGRES_PASSWORD=test \
  -p 5433:5432 postgres:15

# 3. Restore
pg_restore \
  --dbname="postgresql://postgres:test@localhost:5433/postgres" \
  heradyne_backup_latest.dump

# 4. Run smoke tests
psql "postgresql://postgres:test@localhost:5433/postgres" -c "
  SELECT COUNT(*) FROM users WHERE is_active = true;
  SELECT COUNT(*) FROM deals WHERE status != 'draft';
"

# 5. Document result in #platform-ops Slack channel
# 6. Tear down
docker rm -f heradyne_test
```

---

## Incident response

### Data breach suspected

1. Immediately rotate `SECRET_KEY` and `FIELD_ENCRYPTION_KEY` in Railway Variables
2. Force-logout all sessions: Redis → `FLUSHDB` (this clears all tokens — use with caution)
3. Notify users per Privacy Policy within 72 hours (GDPR requirement)
4. Review audit logs: `GET /api/v1/audit/` for suspicious actions
5. Document in incident log

### Database corruption detected

1. Stop the backend service (Railway → Heradyne → Settings → Pause)
2. Take immediate manual backup of current state (for forensics)
3. Restore from last known good backup
4. Resume service
5. Verify data integrity with row count checks

---

## Contacts

| Role | Responsibility |
|------|---------------|
| Platform lead | Owns this runbook, approves restore operations |
| On-call engineer | First responder for incidents, follows runbook |
| Legal/compliance | Notified for any data breach or erasure request |
