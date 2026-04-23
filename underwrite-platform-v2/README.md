# underwrite-platform

**UnderwriteOS + Heradyne — Combined SMB Acquisition & Capital Platform**

---

## Quick Start

```bash
git clone <repo>
cd underwrite-platform
cp backend/.env.example backend/.env   # edit ANTHROPIC_API_KEY
docker compose up --build
```

- Frontend: http://localhost:3000
- API: http://localhost:8000
- API Docs: http://localhost:8000/docs

Default users (seeded):

| Email | Password | Role |
|-------|----------|------|
| borrower@example.com | password123 | Borrower |
| lender1@example.com | password123 | Lender |
| lender2@example.com | password123 | Lender |
| insurer@example.com | password123 | Insurer |
| admin@example.com | password123 | Admin |

---

## What Changed From Heradyne

Heradyne is the base. UnderwriteOS engines are injected additively. No Heradyne file is deleted.

### Files modified (5)

| File | Change |
|------|--------|
| `backend/app/models/deal.py` | Added 27 UW columns to `DealRiskReport` (all nullable) |
| `backend/app/models/policy.py` | Added 4 UW filter columns to `LenderPolicy`, 4 to `InsurerPolicy` |
| `backend/app/tasks/__init__.py` | Injected `run_uw_engines()` call in `analyze_deal_task` after Heradyne engines |
| `backend/app/services/matching.py` | Added `_check_uw_constraints()` method for health score / PDSCR / SBA eligibility filtering |
| `backend/app/api/v1/__init__.py` | Registered 6 new UW routers |

### Files added (7)

| File | What it does |
|------|-------------|
| `backend/app/services/uw_engines.py` | All 7 UnderwriteOS engines (health score, DSCR+PDSCR, valuation, SBA, deal killer, cash flow, playbooks) |
| `backend/app/api/v1/endpoints/underwriting.py` | REST endpoints for UW results: `/deals/{id}/health-score`, `/full-underwriting`, `/deal-killer`, `/playbooks`, `/sba-eligibility` |
| `backend/app/api/v1/endpoints/predeal.py` | Pre-deal funnel: `POST /predeal/cases` (Quick Screen $99, Full Eval $399) |
| `backend/app/api/v1/endpoints/portfolio_reserve.py` | Reserve dashboard, tier status, deployment requests |
| `backend/app/api/v1/endpoints/sba_diligence.py` | SBA diligence package, banker memo, vault, share link |
| `backend/app/api/v1/endpoints/support_indication.py` | Non-binding investment + PG + lender support indications |
| `backend/app/api/v1/endpoints/qsbs_eval.py` | QSBS §1202 evaluator (OBBBA 2025 rules) |
| `backend/alembic/versions/002_underwriteos.py` | Additive migration — no existing tables altered |

### Frontend

Heradyne's Next.js frontend is unchanged. UnderwriteOS data is returned in the enriched
`/deals/{id}` and `/matching/deals/{id}/run` responses — existing deal detail and match pages
will display UW fields if the frontend is extended to render them.

---

## How the Integration Works

When a deal is submitted for analysis (`POST /deals/{id}/submit`), Heradyne's Celery task fires:

```
analyze_deal_task(deal_id)
  │
  ├── Heradyne CashFlowEngine.analyze(deal)          → normalized_ebitda, DSCR
  ├── Heradyne PDEngine.analyze(deal)                → annual_pd
  ├── Heradyne ValuationEngine.analyze(deal)         → ev_low/mid/high
  ├── Heradyne CollateralEngine.analyze(deal)        → NOLV, collateral_coverage
  ├── Heradyne StructuringEngine.analyze(deal)       → guarantee_pct, escrow_pct
  │
  ├── run_uw_engines(deal, heradyne_report_data)     ← NEW (never blocks)
  │     ├── compute_health_score(...)                → 0–100, 5 subscores
  │     ├── compute_dscr_pdscr(...)                  → PDSCR, 5 stress scenarios
  │     ├── compute_valuation_5method(...)            → SDE/EBITDA/DCF/Revenue/Asset + equity bridge
  │     ├── compute_sba_eligibility(...)              → 14-point checklist
  │     ├── compute_deal_killer(...)                  → Buy/No Buy, max price, breakpoints
  │     ├── compute_cashflow_forecast(...)            → 18-month forecast, runway countdown
  │     └── generate_playbooks(...)                   → dollar-quantified action steps
  │
  └── DealRiskReport created with ALL fields (Heradyne + UW)
```

If `run_uw_engines()` raises any exception, it logs the error and returns `{}` — the Heradyne
pipeline is never blocked.

---

## New API Endpoints

All mounted at `/api/v1/`:

```
GET  /underwriting/deals/{id}/health-score
GET  /underwriting/deals/{id}/full-underwriting
GET  /underwriting/deals/{id}/deal-killer
GET  /underwriting/deals/{id}/playbooks
GET  /underwriting/deals/{id}/sba-eligibility

POST /predeal/cases
POST /predeal/cases/{id}/submit-for-investment-review

GET  /portfolio-reserve/dashboard
GET  /portfolio-reserve/deals/{id}/tier-status
POST /portfolio-reserve/deployments

GET  /sba-diligence/deals/{id}
POST /sba-diligence/deals/{id}/share-link

GET  /support-indication/deals/{id}

POST /qsbs/evaluate
GET  /qsbs/deals/{id}
```

---

## Database Migration

Two migrations run in order:

1. `001_initial.py` — Heradyne's full schema (unchanged)
2. `002_underwriteos.py` — Additive UW columns + policy filter fields

The migration is additive only. No existing columns are altered or dropped.

---

## Production Deployment (AWS)

See `infra/terraform/` for the full AWS security stack:

- **Auth**: Cognito MFA (replaces Heradyne's JWT-in-localStorage)
- **Database**: Aurora PostgreSQL (encrypted at rest, AES-256 KMS)
- **Secrets**: AWS Secrets Manager (Anthropic API key, DB credentials — never in env vars)
- **TLS**: CloudFront + API Gateway, TLS 1.2+ enforced, HTTP → HTTPS redirect
- **WAF**: AWS WAF on CloudFront + API Gateway
- **Monitoring**: GuardDuty, CloudTrail, AWS Config compliance rules

Deploy with:
```bash
cd infra/terraform
cp variables.tf.example terraform.tfvars  # fill in your values
terraform init && terraform apply
```

---

## DISCLAIMER

All UnderwriteOS and Heradyne outputs are informational only and do not constitute lending,
guarantee, insurance, or investment decisions. QSBS outputs are not legal or tax advice.
Pre-deal evaluation outputs are not appraisals or professional financial advice.
