# Heradyne — Security Incident Response Runbook

**Last updated:** April 2026  
**Owner:** Platform Engineering  
**Review cadence:** Quarterly  
**Activate this runbook when:** any suspected or confirmed security incident occurs

---

## Severity definitions

| Severity | Definition | Response time |
|----------|-----------|--------------|
| P1 — Critical | Active breach, data exfiltration, ransomware, service down | Immediate (< 15 min) |
| P2 — High | Suspected unauthorized access, credential compromise, bulk data access | < 1 hour |
| P3 — Medium | Failed attack attempts (threshold exceeded), anomalous behavior | < 4 hours |
| P4 — Low | Policy violation, minor misconfiguration | Next business day |

---

## Phase 1: Detect & triage (first 15 minutes)

**Signals that trigger this runbook:**
- Security alerting webhook fires (see `SECURITY_WEBHOOK_URL`)
- Railway logs show repeated 401s, 403s, or unusual 500 spikes
- User reports unauthorized access to their account
- Audit log shows bulk data export or mass erasure
- GitHub Actions / Dependabot flags a critical CVE

**Triage steps:**
1. Check Railway backend logs: filter for `ERROR` level and `login_failed` audit actions
2. Query audit logs via admin account: `GET /api/v1/audit/?action=login_failed&limit=100`
3. Check for anomalous IP addresses: look for single IP hitting multiple accounts
4. Determine: is this active/ongoing or historical?

---

## Phase 2: Contain (first 30 minutes)

### Suspected credential compromise (single account)
```bash
# 1. Force-disable the account via admin panel or directly in DB
# Railway → Postgres → Query:
UPDATE users SET is_active = false WHERE email = 'compromised@example.com';

# 2. Blacklist their current tokens — get their user_id first, then
# flush all Redis keys for that user (manual approach):
# Railway → Redis → CLI:
# KEYS failedlogin:compromised@example.com
# DEL failedlogin:compromised@example.com
```

### Active breach / mass data access suspected
```bash
# NUCLEAR OPTION: invalidate ALL active sessions immediately
# This logs out every user on the platform
# Railway → Redis service → CLI:
FLUSHDB

# Then immediately rotate SECRET_KEY in Railway Variables
# This invalidates all existing JWTs even if Redis is restored
```

### Revoke specific user's sessions
```bash
# Set account lockout via Redis (15 min):
SET failedlogin:<email> 10 EX 900

# Or permanently disable in Postgres:
UPDATE users SET is_active = false WHERE id = <user_id>;
```

### Suspected API abuse (rate limiting bypass)
```bash
# Block an IP manually via Railway environment — add to blocklist
# Or scale down the service temporarily while investigating
```

---

## Phase 3: Investigate

**Audit log queries (as admin):**
```
GET /api/v1/audit/?action=document_downloaded&limit=200
GET /api/v1/audit/?action=user_login&limit=200
GET /api/v1/audit/?action=deal_soft_deleted
GET /api/v1/audit/?entity_type=user&action=password_changed
```

**What to document:**
- Timeline: when did it start, when detected, when contained
- Scope: which users, which data, which actions
- Attack vector: how did they get in
- Indicators of compromise: IPs, user agents, patterns

---

## Phase 4: Notify

### Internal notification (all incidents)
- Document in `#security-incidents` Slack channel (or equivalent)
- Include: timeline, scope, containment status, action plan

### User notification — when required
**Trigger:** Any confirmed unauthorized access to user account or personal data

**Timeline obligations:**
- GDPR: notify supervisory authority within **72 hours** of becoming aware
- CCPA: notify affected California residents in "expedient time"
- GLBA: notify banking regulators per your institution's requirements

**Notification template:**
```
Subject: Important security notice regarding your Heradyne account

We are writing to inform you of a security incident that may have 
affected your account. On [DATE], we detected [BRIEF DESCRIPTION].

What happened: [DESCRIPTION]
What information was involved: [DATA TYPES]
What we are doing: [CONTAINMENT + REMEDIATION]
What you should do: [RECOMMENDED USER ACTIONS — change password, etc.]

We take the security of your information seriously. If you have 
questions, please contact [CONTACT].
```

---

## Phase 5: Remediate & recover

1. **Patch the vulnerability** — deploy fix via git push, verify with CI/CD
2. **Restore from backup if needed** — see `BACKUP_AND_DR.md`
3. **Re-enable affected users** — after confirming they've reset credentials
4. **Rotate secrets if compromised:**
   - `SECRET_KEY` → all JWTs invalidated
   - `FIELD_ENCRYPTION_KEY` → **CRITICAL**: encrypted data becomes unreadable; only rotate if key is confirmed compromised AND you have a migration plan
   - `ANTHROPIC_API_KEY` → rotate in Anthropic console

---

## Phase 6: Post-incident review (within 5 business days)

Document in a post-mortem:
1. **Timeline** — when it started, when detected, when contained, when resolved
2. **Root cause** — what vulnerability or mistake allowed this
3. **Impact** — users affected, data exposed, downtime
4. **What worked** — detection methods, response speed
5. **What didn't** — gaps in monitoring, response delays
6. **Action items** — specific fixes with owners and due dates

---

## Quick reference: key actions by scenario

| Scenario | Action |
|----------|--------|
| Brute force on single account | Account already auto-locked after 5 attempts — monitor |
| Credential stuffing across accounts | FLUSHDB + rotate SECRET_KEY |
| Stolen JWT in the wild | Blacklist JTI via Redis: `SET blacklist:jti:<jti> 1 EX <remaining_seconds>` |
| Compromised admin account | Disable account in DB + FLUSHDB + rotate SECRET_KEY |
| Exposed FIELD_ENCRYPTION_KEY | Contact legal immediately before rotating — data migration required |
| Malicious file upload | Check /app/uploads for recently uploaded files; MIME validation should have blocked it |
| SQL injection attempt | SQLAlchemy ORM prevents this; check logs for 500s with DB errors |
| Data exfiltration via API | Review audit logs for bulk document downloads; disable affected user |

---

## Contacts & escalation

| Role | Responsibility |
|------|---------------|
| Platform lead | Incident commander — coordinates all response |
| On-call engineer | First responder — executes containment steps |
| Legal/compliance | Notified for any data breach; owns regulatory notification |
| CISO / security advisor | Consulted for P1/P2 incidents |
