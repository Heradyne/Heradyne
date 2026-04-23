# Heradyne Architecture

## Overview

Heradyne is a capital-light deal structuring platform that connects borrowers with lenders and insurers through automated underwriting analysis and policy matching.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                       │
│                    React + TypeScript + Tailwind                 │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ HTTP/REST
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend API (FastAPI)                       │
│                   Python + SQLAlchemy + Pydantic                 │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │    Auth     │  │   Deals     │  │       Policies          │  │
│  │   (JWT)     │  │   CRUD      │  │    Lender/Insurer       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Matching   │  │  Cashflow   │  │     Assumptions         │  │
│  │   Engine    │  │   & Fees    │  │       (Config)          │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│  ┌─────────────┐  ┌─────────────────────────────────────────┐   │
│  │ Verification│  │           Audit Logging                 │   │
│  │   Engine    │  │                                         │   │
│  └─────────────┘  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
        │                    │                    │
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│   PostgreSQL  │    │    Redis      │    │   Celery      │
│   (Database)  │    │   (Queue)     │    │   (Workers)   │
└───────────────┘    └───────────────┘    └───────────────┘
```

## Component Descriptions

### Frontend (Next.js 14)

- **App Router**: Uses Next.js 14 app router for file-based routing
- **Authentication**: JWT token stored in localStorage, managed via Zustand
- **API Client**: Axios-based client with automatic token injection
- **Styling**: Tailwind CSS for utility-first styling
- **Notification System**: Real-time info request alerts for borrowers

#### Frontend Pages

| Page | Path | Description |
|------|------|-------------|
| Landing | `/` | Marketing page with role selection |
| Login | `/login` | User authentication |
| Register | `/register` | New user registration |
| Dashboard | `/dashboard` | Role-specific overview with stats and alerts |
| Deals List | `/dashboard/deals` | Borrower's deal list with info request badges |
| Deal Detail | `/dashboard/deals/[id]` | Full deal view with risk report, matches, documents |
| New Deal | `/dashboard/deals/new` | Multi-step deal creation wizard |
| Policies | `/dashboard/policies` | Lender/Insurer policy management |
| Matches | `/dashboard/matches` | Review matched deals with verification flags |
| Origination | `/dashboard/origination` | Loan origination (lenders) / Guarantee issuance (insurers) |
| Financials | `/dashboard/financials` | Portfolio analytics, loan tracking, concentration analysis |
| Secondary Market | `/dashboard/secondary-market` | Buy/sell loan participations (lenders) and risk transfers (insurers) - role-filtered views |
| Assumptions | `/dashboard/assumptions` | Admin system configuration |
| Audit Logs | `/dashboard/audit` | Admin activity log viewer |

### Backend (FastAPI)

- **API Layer**: RESTful endpoints organized by domain
- **Service Layer**: Business logic separated from HTTP handlers
- **Data Layer**: SQLAlchemy ORM with Pydantic schemas

### Underwriting Engines

Five rules-based engines analyze deals:

1. **Cash Flow Engine**: Normalizes EBITDA, calculates DSCR
2. **PD Engine**: Probability of default using SBA-anchored multipliers
3. **Valuation Engine**: Enterprise value range using industry multiples
4. **Collateral Engine**: NOLV calculation with haircut tables
5. **Structuring Engine**: Recommends guarantee %, escrow %, alignment

### Document Verification Engine (NEW)

Compares uploaded documents against borrower-reported values:

- **Extraction**: Parses financial data from uploaded documents
- **Comparison**: Checks reported vs. extracted values
- **Flagging**: Marks discrepancies by severity (Low/Medium/High/Critical)
- **Confidence Score**: 0-100 based on document authority and match quality

Severity thresholds:
- **Low**: 5-15% variance
- **Medium**: 15-30% variance  
- **High**: 30-50% variance
- **Critical**: >50% variance

### Matching Engine

- Compares deals against lender/insurer policy constraints
- Generates match scores and reasons
- Produces "approve-if" restructuring scenarios
- Supports auto-accept/reject based on policy thresholds
- Generates counter-offers for near-miss deals

### Async Processing (Celery)

- `analyze_deal`: Runs underwriting pipeline
- `match_deal`: Matches to policies
- `calculate_fees`: Computes monthly fee ledger

**Synchronous Fallback**: When Celery is unavailable, analysis can run synchronously via `/deals/{id}/analyze-sync`

## Data Flow

### Deal Submission Flow

```
1. Borrower creates deal (DRAFT)
2. Borrower uploads documents
3. Borrower submits deal → Status: SUBMITTED
4. Celery task: analyze_deal (or sync fallback)
   └─ Runs 5 underwriting engines
   └─ Creates DealRiskReport
   └─ Status: ANALYZED
5. Celery task: match_deal (manual or automatic)
   └─ Matches against all policies
   └─ Applies auto-decision rules
   └─ Generates scenarios and counter-offers
   └─ Status: MATCHED
6. Lender/Insurer reviews and decides (or auto-decided)
   └─ Accept/Reject/Request Info/Counter-Offer
   └─ Audit log created
7. If Info Requested:
   └─ Borrower notified via dashboard
   └─ Borrower uploads additional documents
   └─ Review continues
8. If Counter-Offer:
   └─ Borrower sees counter-offer details
   └─ Borrower accepts or declines
   └─ If accepted, deal updated automatically
9. Loan Origination (Lenders):
   └─ Lender originates loan from accepted match
   └─ Configure principal, rate, term
   └─ ExecutedLoan created
   └─ Deal status → FUNDED
10. Guarantee Issuance (Insurers):
    └─ Insurer issues guarantee contract
    └─ Configure coverage % and premium rate
    └─ Loan updated with guarantee info
```

### Loan Origination Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    LOAN ORIGINATION                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ADMIN SETTINGS (Assumptions > Origination Settings):           │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ • require_dual_acceptance: true/false                       ││
│  │ • require_insurer_for_origination: true/false               ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  LENDER:                                                        │
│  ┌─────────────────┐                                            │
│  │ View Accepted   │                                            │
│  │ Matches         │ → Only shows matches not yet originated    │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ├── Each deal shows insurer acceptance status:        │
│           │   • "Insurer Accepted" (green) - ready to originate │
│           │   • "No Insurer" (yellow) - may be blocked          │
│           │                                                      │
│           ├── IF dual_acceptance enabled AND no insurer:        │
│           │   └── Show "Awaiting Insurer/Fund Acceptance"       │
│           │       (Origination blocked)                         │
│           │                                                      │
│           ├── IF allowed to originate:                          │
│           │   ├── Configure loan terms:                         │
│           │   │   • Principal amount                            │
│           │   │   • Interest rate (annual %)                    │
│           │   │   • Term (months)                               │
│           │   │                                                  │
│           │   ├── System calculates monthly payment             │
│           │   │                                                  │
│           │   └── Create ExecutedLoan                           │
│           │       • Loan number generated (LN-YYYYMM-XXXXXXXX)  │
│           │       • Deal status → FUNDED                        │
│           │       • Audit log created                           │
│                                                                  │
│  INSURER:                                                       │
│  ┌─────────────────┐                                            │
│  │ View Accepted   │                                            │
│  │ Matches         │ → Shows all accepted insurer matches       │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ├── Select match to guarantee                         │
│           │                                                      │
│           ├── Configure guarantee terms:                        │
│           │   • Guarantee percentage (e.g., 50%)                │
│           │   • Premium rate (annual %)                         │
│           │                                                      │
│           └── Issue Guarantee Contract                          │
│               • Contract number generated (GC-YYYYMM-XXXXXXXX)  │
│               • If loan exists: Update loan with guarantee info │
│               • If no loan yet: Commitment recorded             │
│               • Audit log created                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Auto-Decision Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                       MATCHING ENGINE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Deal matches policy → Calculate match score (0-100%)            │
│                                                                  │
│  ┌─────────────────┐                                            │
│  │ Check Thresholds│                                            │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ├── Score ≤ Auto-Reject → STATUS: rejected (auto)     │
│           │                                                      │
│           ├── Score in Counter-Offer Range → Generate Counter   │
│           │   └── STATUS: counter_offered (auto)                │
│           │                                                      │
│           ├── Score ≥ Auto-Accept → STATUS: accepted (auto)     │
│           │                                                      │
│           └── Otherwise → STATUS: pending (manual review)       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Counter-Offer Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   SYSTEM    │    │  BORROWER   │    │   RESULT    │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │
       │ Analyze failed   │                  │
       │ constraints      │                  │
       │                  │                  │
       │ Generate         │                  │
       │ proposed changes │                  │
       │ (loan amount,    │                  │
       │ term, etc.)      │                  │
       │                  │                  │
       │─────────────────>│                  │
       │ Counter-offer    │                  │
       │ sent             │                  │
       │                  │                  │
       │                  │ Review proposed  │
       │                  │ changes          │
       │                  │                  │
       │    [ACCEPT]      │                  │
       │<─────────────────│                  │
       │                  │                  │
       │ Update deal with │                  │
       │ proposed values  │─────────────────>│
       │                  │                  │ Deal updated
       │                  │                  │ Match accepted
       │                  │                  │
       │    [DECLINE]     │                  │
       │<─────────────────│                  │
       │                  │─────────────────>│
       │                  │                  │ Counter rejected
       │                  │                  │ Deal unchanged
       │                  │                  │
       │    [EXPIRE]      │                  │
       │ (7 days)         │─────────────────>│
       │                  │                  │ Counter expired
       │                  │                  │ Deal unchanged
```

### Information Request Flow

```
1. Lender/Insurer clicks "Request Info" on a match
2. Enters description of required information
3. Match status changes to "info_requested"
4. Borrower sees notification on:
   └─ Dashboard (alert banner with messages)
   └─ Deals list (badge next to deal name)
   └─ Deal detail page (prominent alert box)
5. Borrower uploads requested documents
6. Lender/Insurer reviews and makes final decision
```

### Document Verification Flow (NEW)

```
1. Borrower uploads documents to deal
2. On analysis or manual trigger:
   └─ Verification service extracts data from documents
   └─ Compares against deal fields (revenue, EBITDA, etc.)
   └─ Flags discrepancies by severity
3. Results stored in risk report:
   └─ verification_status: verified/flagged
   └─ verification_confidence: 0-100
   └─ verification_flags: list of discrepancies
4. Lenders/Insurers see flags on matched deals:
   └─ Badge showing flag count and severity
   └─ Detailed discrepancy list with values
```

### Matching Flow

```
1. Get deal + latest risk report
2. For each active lender policy:
   └─ Check each constraint (loan size, DSCR, PD, etc.)
   └─ Calculate match score
   └─ Record met/failed constraints
3. For each active insurer policy:
   └─ Check constraints (expected loss, coverage, etc.)
   └─ Calculate match score
4. For near-misses (score > 50%):
   └─ Generate up to 3 restructuring scenarios
5. Save matches to database
```

## Security Boundaries

### Authentication

- JWT tokens with configurable expiration
- Passwords hashed with bcrypt
- Token required for all API endpoints except /auth

### Authorization (RBAC)

| Role | Permissions |
|------|-------------|
| Borrower | Create/edit own deals, upload docs, view own matches |
| Lender | CRUD own policies, view matched deals, make decisions, download matched deal documents |
| Insurer | CRUD own policies, view matched deals, make decisions, download matched deal documents |
| Admin | All permissions, manage assumptions, view audit logs, download any documents |

### Data Isolation

- Borrowers only see their own deals
- Lenders/Insurers only see deals matched to their policies
- Policies are private to their owner (except active ones for matching)

### Document Access Control

Documents are protected with role-based access:

| Role | Document Access |
|------|-----------------|
| Borrower | Own deals only |
| Lender | Deals where lender has a policy match |
| Insurer | Deals where insurer has a policy match |
| Admin | All documents |

Document downloads are logged to the audit trail with:
- User ID
- Document ID
- Deal ID
- Filename
- Timestamp

## File Storage

MVP uses local filesystem with interface designed for S3:

```python
# Current: Local filesystem
UPLOAD_DIR = "./uploads"
file_path = f"{UPLOAD_DIR}/{deal_id}/{filename}"

# Future: S3 adapter
# s3.upload(bucket, key, file)
```

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| DATABASE_URL | PostgreSQL connection string |
| REDIS_URL | Redis connection for Celery |
| SECRET_KEY | JWT signing key |
| CORS_ORIGINS | Allowed frontend origins |
| UPLOAD_DIR | File upload directory |

### System Assumptions

Stored in `system_assumptions` table, loaded by engines:

- `pd_engine.sba_anchor_pd`: Base PD (default 3%)
- `pd_engine.industry_multipliers`: Industry-specific multipliers
- `collateral_engine.business_asset_haircuts`: Asset haircut tables
- `structuring_engine.guarantee_bands`: Min/max/default guarantee %

**User-Specific Overrides:**

The assumption system supports per-user customization:

```
┌─────────────────────────────────────────────────────────────┐
│                    ASSUMPTION LOOKUP                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Request: get_assumption(category, key, user_id=5)          │
│                                                              │
│  1. Check for user override (user_id=5, category, key)      │
│     └── If found: return user value                         │
│                                                              │
│  2. Fall back to system default (user_id=NULL, category, key)│
│     └── Return system value                                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Cache Strategy:**
- Assumptions are cached in-memory with keys like `{user_id}.{category}.{key}`
- Cache is cleared when any assumption is updated
- Production: Replace with Redis for distributed caching

## Scalability Considerations

### Current MVP Limitations

1. Single Celery worker
2. Local file storage
3. In-memory assumption caching
4. No rate limiting

### Production Recommendations

1. Multiple Celery workers with task routing
2. S3 for file storage with CDN
3. Redis caching for assumptions
4. API rate limiting per user/role
5. Database read replicas
6. Connection pooling (pgbouncer)

## Monitoring & Observability

### Audit Logging

Every significant action logged to `audit_logs` table:
- User ID
- Action (e.g., "deal_submitted", "match_accepted")
- Entity type and ID
- Details (JSON)
- Timestamp

### Health Checks

- `/health`: Basic API health
- PostgreSQL connection check
- Redis connection check (via Celery)

## Deployment Architecture

### Docker Compose (Development)

```yaml
services:
  postgres:     # Database
  redis:        # Task queue broker
  backend:      # FastAPI server
  celery_worker: # Async task processor
  frontend:     # Next.js dev server
```

### Production Recommendations

```
                    ┌─────────────┐
                    │   CDN/LB    │
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
   ┌──────────┐     ┌──────────┐     ┌──────────┐
   │ Frontend │     │ Backend  │     │ Backend  │
   │  (Vercel)│     │   Pod 1  │     │   Pod 2  │
   └──────────┘     └────┬─────┘     └────┬─────┘
                         │                │
         ┌───────────────┴────────────────┘
         │
   ┌─────┴─────┐
   │ PgBouncer │
   └─────┬─────┘
         │
   ┌─────┴─────┐     ┌──────────────┐
   │ PostgreSQL│     │    Redis     │
   │  (RDS)    │     │ (ElastiCache)│
   └───────────┘     └──────────────┘
```

## Important Disclaimers

**Heradyne is an informational platform only.**

It does NOT:
- Lend money
- Provide loan guarantees
- Issue insurance policies
- Make binding commitments

All outputs are recommendations for informational purposes. Final terms require direct engagement between parties.
