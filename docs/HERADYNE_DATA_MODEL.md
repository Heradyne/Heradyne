# Heradyne Data Model

## Entity Relationship Diagram (Conceptual)

```
┌─────────────┐       ┌─────────────┐       ┌─────────────────┐
│    Users    │───────│    Deals    │───────│  DealDocuments  │
│             │  1:N  │             │  1:N  │                 │
└─────────────┘       └──────┬──────┘       └─────────────────┘
      │                      │
      │                      │ 1:N
      │               ┌──────┴──────┐
      │               │ DealRiskRpts│
      │               └─────────────┘
      │
      │ 1:N           ┌─────────────┐       ┌─────────────────┐
      ├───────────────│LenderPolicy │───────│   DealMatches   │
      │               └─────────────┘  1:N  │                 │
      │                                     └────────┬────────┘
      │ 1:N           ┌─────────────┐            N:1 │
      ├───────────────│InsurerPolicy│────────────────┘
      │               └─────────────┘
      │
      │ 1:N
      └───────────────┌─────────────┐
                      │  AuditLogs  │
                      └─────────────┘

┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│MonthlyCashflows │   │   FeeLedger     │   │SystemAssumptions│
│  (Deal 1:N)     │   │   (Deal 1:N)    │   │   (Standalone)  │
└─────────────────┘   └─────────────────┘   └─────────────────┘
```

## Table Definitions

### users

Primary user table for all roles.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Primary key |
| email | VARCHAR(255) | NO | Unique email address |
| hashed_password | VARCHAR(255) | NO | Bcrypt hashed password |
| full_name | VARCHAR(255) | NO | User's full name |
| company_name | VARCHAR(255) | YES | Company/organization name |
| role | ENUM | NO | borrower, lender, insurer, admin |
| is_active | BOOLEAN | NO | Account active status |
| created_at | DATETIME | NO | Creation timestamp |
| updated_at | DATETIME | NO | Last update timestamp |

**Indexes**: `ix_users_email` (unique), `ix_users_id`

### deals

Core deal/loan request entity.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Primary key |
| borrower_id | INTEGER | NO | FK to users |
| name | VARCHAR(255) | NO | Deal name |
| deal_type | ENUM | NO | acquisition, growth |
| status | ENUM | NO | draft, submitted, analyzing, analyzed, matched, pending_lender, pending_insurer, approved, funded, rejected, closed |
| industry | VARCHAR(100) | NO | Business industry |
| business_description | TEXT | YES | Business description |
| loan_amount_requested | FLOAT | NO | Requested loan amount |
| loan_term_months | INTEGER | NO | Loan term in months |
| annual_revenue | FLOAT | NO | Annual revenue |
| gross_profit | FLOAT | YES | Gross profit |
| ebitda | FLOAT | NO | EBITDA |
| capex | FLOAT | YES | Capital expenditures |
| debt_service | FLOAT | YES | Existing debt service |
| addbacks | JSON | YES | Array of {description, amount} |
| purchase_price | FLOAT | YES | For acquisitions |
| equity_injection | FLOAT | YES | Buyer equity |
| business_assets | JSON | YES | Array of {type, value, description} |
| personal_assets | JSON | YES | Array of {type, value, description} |
| owner_credit_score | INTEGER | YES | Owner's credit score |
| owner_experience_years | INTEGER | YES | Years of industry experience |
| created_at | DATETIME | NO | Creation timestamp |
| updated_at | DATETIME | NO | Last update timestamp |

**Relationships**: 
- `borrower_id` → `users.id`
- Has many: `deal_documents`, `deal_risk_reports`, `deal_matches`, `monthly_cashflows`, `fee_ledger`

### deal_documents

File uploads associated with deals (data room).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Primary key |
| deal_id | INTEGER | NO | FK to deals |
| filename | VARCHAR(255) | NO | Stored filename |
| original_filename | VARCHAR(255) | NO | Original upload name |
| file_path | VARCHAR(500) | NO | Server file path |
| file_size | INTEGER | NO | Size in bytes |
| mime_type | VARCHAR(100) | YES | MIME type |
| document_type | VARCHAR(100) | YES | tax_return, financial_statement, etc. |
| created_at | DATETIME | NO | Upload timestamp |
| updated_at | DATETIME | NO | Last update timestamp |

### deal_risk_reports

Versioned underwriting analysis results.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Primary key |
| deal_id | INTEGER | NO | FK to deals |
| version | INTEGER | NO | Report version number |
| normalized_ebitda | FLOAT | YES | Calculated normalized EBITDA |
| post_debt_fcf | FLOAT | YES | Post-debt free cash flow |
| dscr_base | FLOAT | YES | Base DSCR |
| dscr_stress | FLOAT | YES | Stressed DSCR |
| sba_anchor_pd | FLOAT | YES | SBA anchor PD used |
| industry_multiplier | FLOAT | YES | Industry multiplier used |
| leverage_multiplier | FLOAT | YES | Leverage multiplier used |
| volatility_multiplier | FLOAT | YES | Volatility multiplier used |
| annual_pd | FLOAT | YES | Calculated annual PD |
| ev_low | FLOAT | YES | Low EV estimate |
| ev_mid | FLOAT | YES | Mid EV estimate |
| ev_high | FLOAT | YES | High EV estimate |
| durability_score | FLOAT | YES | Business durability score (0-100) |
| business_nolv | FLOAT | YES | Business assets NOLV |
| personal_nolv | FLOAT | YES | Personal assets NOLV |
| total_nolv | FLOAT | YES | Total NOLV |
| collateral_coverage | FLOAT | YES | NOLV / Loan ratio |
| recommended_guarantee_pct | FLOAT | YES | Recommended guarantee % |
| recommended_escrow_pct | FLOAT | YES | Recommended escrow % |
| recommended_alignment | JSON | YES | Alignment requirements |
| verification_status | VARCHAR(50) | YES | verified, flagged, pending |
| verification_confidence | FLOAT | YES | Confidence score 0-100 |
| verification_flags | JSON | YES | List of discrepancy details |
| documents_verified | INTEGER | YES | Count of documents analyzed |
| report_data | JSON | YES | Full report data |
| created_at | DATETIME | NO | Creation timestamp |
| updated_at | DATETIME | NO | Last update timestamp |

**Verification Flags JSON Structure:**
```json
[
  {
    "field": "Annual Revenue",
    "reported": 2500000,
    "extracted": 2150000,
    "difference_pct": 14.0,
    "severity": "medium",
    "notes": "Document shows value 14% lower than reported"
  }
]
```

### lender_policies

Lender lending criteria/constraints.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Primary key |
| lender_id | INTEGER | NO | FK to users |
| name | VARCHAR(255) | NO | Policy name |
| is_active | BOOLEAN | NO | Active for matching |
| min_loan_size | FLOAT | YES | Minimum loan amount |
| max_loan_size | FLOAT | YES | Maximum loan amount |
| min_dscr | FLOAT | YES | Minimum DSCR required |
| max_pd | FLOAT | YES | Maximum PD allowed |
| max_leverage | FLOAT | YES | Max debt/EBITDA |
| min_collateral_coverage | FLOAT | YES | Min collateral/loan |
| allowed_industries | JSON | YES | List of allowed industries |
| excluded_industries | JSON | YES | List of excluded industries |
| min_term_months | INTEGER | YES | Minimum loan term |
| max_term_months | INTEGER | YES | Maximum loan term |
| target_rate_min | FLOAT | YES | Target rate floor |
| target_rate_max | FLOAT | YES | Target rate ceiling |
| allowed_deal_types | JSON | YES | acquisition, growth |
| auto_accept_threshold | FLOAT | YES | Auto-accept if match score >= % |
| auto_reject_threshold | FLOAT | YES | Auto-reject if match score <= % |
| counter_offer_min | FLOAT | YES | Counter-offer if score >= % |
| counter_offer_max | FLOAT | YES | Counter-offer if score < auto_accept |
| auto_decision_enabled | BOOLEAN | YES | Enable auto-decisions |
| notes | TEXT | YES | Internal notes |
| created_at | DATETIME | NO | Creation timestamp |
| updated_at | DATETIME | NO | Last update timestamp |

### insurer_policies

Insurer/fund risk parameters.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Primary key |
| insurer_id | INTEGER | NO | FK to users |
| name | VARCHAR(255) | NO | Policy name |
| is_active | BOOLEAN | NO | Active for matching |
| max_expected_loss | FLOAT | YES | Max PD × LGD |
| min_attachment_point | FLOAT | YES | Min first-loss % |
| max_attachment_point | FLOAT | YES | Max attachment |
| target_premium_min | FLOAT | YES | Min premium % |
| target_premium_max | FLOAT | YES | Max premium % |
| min_coverage_amount | FLOAT | YES | Min coverage $ |
| max_coverage_amount | FLOAT | YES | Max coverage $ |
| allowed_industries | JSON | YES | List of allowed industries |
| excluded_industries | JSON | YES | List of excluded industries |
| allowed_deal_types | JSON | YES | acquisition, growth |
| auto_accept_threshold | FLOAT | YES | Auto-accept if match score >= % |
| auto_reject_threshold | FLOAT | YES | Auto-reject if match score <= % |
| counter_offer_min | FLOAT | YES | Counter-offer if score >= % |
| counter_offer_max | FLOAT | YES | Counter-offer if score < auto_accept |
| auto_decision_enabled | BOOLEAN | YES | Enable auto-decisions |
| notes | TEXT | YES | Internal notes |
| created_at | DATETIME | NO | Creation timestamp |
| updated_at | DATETIME | NO | Last update timestamp |

### deal_matches

Match results between deals and policies.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Primary key |
| deal_id | INTEGER | NO | FK to deals |
| lender_policy_id | INTEGER | YES | FK to lender_policies |
| insurer_policy_id | INTEGER | YES | FK to insurer_policies |
| match_score | FLOAT | YES | 0-1 match score |
| match_reasons | JSON | YES | List of match reasons |
| constraints_met | JSON | YES | Satisfied constraints |
| constraints_failed | JSON | YES | Failed constraints |
| status | VARCHAR(50) | NO | pending, accepted, rejected, info_requested, counter_offered, counter_accepted, counter_rejected |
| decision_notes | TEXT | YES | Lender/insurer notes |
| decision_at | DATETIME | YES | Decision timestamp |
| auto_decision | BOOLEAN | YES | Was this auto-decided? |
| auto_decision_reason | VARCHAR(100) | YES | Reason for auto-decision |
| counter_offer | JSON | YES | Counter-offer details |
| counter_offer_at | DATETIME | YES | When counter-offer was made |
| counter_offer_expires_at | DATETIME | YES | Counter-offer expiration |
| borrower_response | VARCHAR(50) | YES | accepted, rejected, expired |
| borrower_response_at | DATETIME | YES | When borrower responded |
| borrower_response_notes | TEXT | YES | Borrower's response notes |
| scenarios | JSON | YES | Approve-if scenarios |
| created_at | DATETIME | NO | Creation timestamp |
| updated_at | DATETIME | NO | Last update timestamp |

**Note**: Either `lender_policy_id` OR `insurer_policy_id` is set, not both.

**Counter-Offer JSON Structure:**
```json
{
  "original_values": {
    "loan_amount_requested": 3000000
  },
  "proposed_values": {
    "loan_amount_requested": 2500000
  },
  "adjustments": [
    {
      "field": "Loan Amount",
      "original": 3000000,
      "proposed": 2500000,
      "change": -500000,
      "reason": "Reduce loan from $3,000,000 to $2,500,000 to meet max loan size"
    }
  ],
  "reason": "Counter-offer to address 1 constraint(s)",
  "expected_match_score": 95.0,
  "expires_in_days": 7
}
```

**Match Status Values:**
| Status | Description |
|--------|-------------|
| pending | Awaiting lender/insurer review |
| accepted | Manually or auto-accepted |
| rejected | Manually or auto-rejected |
| info_requested | Additional info requested from borrower |
| counter_offered | Counter-offer sent to borrower |
| counter_accepted | Borrower accepted counter-offer |
| counter_rejected | Borrower rejected counter-offer |

### monthly_cashflows

Post-close monthly cash flow data entered by borrower.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Primary key |
| deal_id | INTEGER | NO | FK to deals |
| month | INTEGER | NO | Month (1-12) |
| year | INTEGER | NO | Year |
| revenue | FLOAT | NO | Monthly revenue |
| ebitda | FLOAT | NO | Monthly EBITDA |
| debt_service | FLOAT | YES | Monthly debt service |
| post_debt_fcf | FLOAT | YES | Calculated post-debt FCF |
| created_at | DATETIME | NO | Creation timestamp |
| updated_at | DATETIME | NO | Last update timestamp |

### fee_ledger

Calculated fees based on cash flow (2% cap).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Primary key |
| deal_id | INTEGER | NO | FK to deals |
| month | INTEGER | NO | Month (1-12) |
| year | INTEGER | NO | Year |
| post_debt_fcf | FLOAT | NO | FCF used for calculation |
| fee_rate | FLOAT | NO | Fee rate (typically 0.02) |
| calculated_fee | FLOAT | NO | Calculated fee amount |
| created_at | DATETIME | NO | Creation timestamp |
| updated_at | DATETIME | NO | Last update timestamp |

### system_assumptions

Configurable parameters for underwriting engines. Supports both system-wide defaults and user-specific overrides.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Primary key |
| user_id | INTEGER | YES | FK to users (null = system default, set = user override) |
| category | VARCHAR(100) | NO | Category (pd_engine, valuation_engine, etc.) |
| key | VARCHAR(100) | NO | Key name |
| value | JSON | NO | Value (can be scalar or object) |
| description | TEXT | YES | Human description |
| created_at | DATETIME | NO | Creation timestamp |
| updated_at | DATETIME | NO | Last update timestamp |

**Indexes**: `ix_system_assumptions_category`, `ix_system_assumptions_key`, `ix_system_assumptions_user_id`

**Unique Constraint**: `uq_user_category_key` on (user_id, category, key)

**Assumption Inheritance:**
- If `user_id` is NULL, the assumption is a system-wide default
- If `user_id` is set, it's a user-specific override that takes precedence
- When fetching effective assumptions, user overrides are merged with system defaults

**Example:**
```
System Default:  user_id=NULL, category=pd_engine, key=sba_anchor_pd, value=0.03
User Override:   user_id=5,    category=pd_engine, key=sba_anchor_pd, value=0.025
```
User 5 will use 0.025, all other users will use 0.03.

**Origination Settings (category=origination):**
| Key | Type | Description |
|-----|------|-------------|
| `require_dual_acceptance` | boolean | If true, both lender AND insurer must accept before loan origination |
| `require_insurer_for_origination` | boolean | If true, an insurer must accept before origination (superseded by dual acceptance) |

### audit_logs

Comprehensive action logging.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Primary key |
| user_id | INTEGER | YES | FK to users (null for system) |
| action | VARCHAR(100) | NO | Action name |
| entity_type | VARCHAR(100) | NO | Entity type affected |
| entity_id | INTEGER | YES | Entity ID |
| details | JSON | YES | Additional details |
| ip_address | VARCHAR(50) | YES | Client IP |
| user_agent | VARCHAR(500) | YES | Client user agent |
| created_at | DATETIME | NO | Action timestamp |
| updated_at | DATETIME | NO | Last update timestamp |

**Indexes**: `ix_audit_logs_action`, `ix_audit_logs_entity_type`

## JSON Schema Examples

### addbacks

```json
[
  {"description": "Owner salary above market", "amount": 75000},
  {"description": "One-time legal fees", "amount": 25000}
]
```

### business_assets / personal_assets

```json
[
  {"type": "equipment", "value": 800000, "description": "CNC machines"},
  {"type": "inventory", "value": 400000, "description": "Raw materials"}
]
```

### constraints_met / constraints_failed

```json
[
  {
    "constraint": "min_dscr",
    "required": 1.25,
    "actual": 1.42,
    "met": true,
    "reason": "DSCR 1.42x vs min 1.25x"
  }
]
```

### scenarios (approve-if)

```json
[
  {
    "scenario_id": 1,
    "description": "Reduce loan to $2,200,000 to meet leverage requirement",
    "adjustments": {"loan_amount": {"from": 2500000, "to": 2200000}},
    "new_constraints_met": ["max_leverage"],
    "constraints_still_failed": [],
    "feasibility_score": 0.85
  }
]
```

---

## Executed Loans Tables

### executed_loans

Tracks loans that have been funded and are being serviced.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Primary key |
| deal_id | INTEGER | NO | FK to deals |
| match_id | INTEGER | YES | FK to deal_matches |
| borrower_id | INTEGER | NO | FK to users |
| lender_id | INTEGER | NO | FK to users |
| insurer_id | INTEGER | YES | FK to users (if insured) |
| loan_number | VARCHAR(50) | NO | Unique loan identifier |
| principal_amount | FLOAT | NO | Original loan amount |
| interest_rate | FLOAT | NO | Annual interest rate (decimal) |
| term_months | INTEGER | NO | Loan term in months |
| monthly_payment | FLOAT | NO | Monthly payment amount |
| origination_date | DATE | NO | Loan funding date |
| maturity_date | DATE | NO | Loan maturity date |
| status | VARCHAR(50) | NO | active, paid_off, default, workout, charged_off |
| current_principal_balance | FLOAT | NO | Current outstanding principal |
| guarantee_percentage | FLOAT | YES | Insurance guarantee % |
| premium_rate | FLOAT | YES | Annual premium rate |
| premium_paid | FLOAT | NO | Total premium paid to date |
| state | VARCHAR(2) | YES | Business state |
| city | VARCHAR(100) | YES | Business city |
| zip_code | VARCHAR(10) | YES | Business zip |
| industry | VARCHAR(100) | NO | Industry (for reporting) |
| days_past_due | INTEGER | NO | Current days past due |
| last_payment_date | DATE | YES | Date of last payment |
| total_payments_made | INTEGER | NO | Count of payments made |
| total_principal_paid | FLOAT | NO | Total principal repaid |
| total_interest_paid | FLOAT | NO | Total interest paid |
| default_date | DATE | YES | Date of default (if applicable) |
| default_amount | FLOAT | YES | Balance at default |
| recovery_amount | FLOAT | YES | Amount recovered |
| loss_amount | FLOAT | YES | Net loss amount |
| notes | TEXT | YES | Additional notes |
| created_at | DATETIME | NO | Creation timestamp |
| updated_at | DATETIME | NO | Last update timestamp |

**Indexes**: `ix_executed_loans_loan_number` (unique), `ix_executed_loans_state`, `ix_executed_loans_industry`

### loan_payments

Individual payment records for loan servicing.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Primary key |
| loan_id | INTEGER | NO | FK to executed_loans |
| payment_date | DATE | NO | Payment date |
| payment_number | INTEGER | NO | Sequential payment number |
| scheduled_payment | FLOAT | NO | Amount due |
| actual_payment | FLOAT | NO | Amount received |
| principal_portion | FLOAT | NO | Principal portion |
| interest_portion | FLOAT | NO | Interest portion |
| principal_balance_after | FLOAT | NO | Balance after payment |
| is_late | BOOLEAN | NO | Was payment late |
| days_late | INTEGER | NO | Days late (0 if on time) |
| created_at | DATETIME | NO | Creation timestamp |
| updated_at | DATETIME | NO | Last update timestamp |

### insurance_claims

Claims filed against loan insurance/guarantees.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Primary key |
| loan_id | INTEGER | NO | FK to executed_loans |
| insurer_id | INTEGER | NO | FK to users |
| claim_number | VARCHAR(50) | NO | Unique claim identifier |
| claim_date | DATE | NO | Date claim filed |
| claim_amount | FLOAT | NO | Amount claimed |
| approved_amount | FLOAT | YES | Amount approved |
| paid_amount | FLOAT | YES | Amount paid |
| status | VARCHAR(50) | NO | pending, approved, denied, paid |
| approved_date | DATE | YES | Approval date |
| paid_date | DATE | YES | Payment date |
| notes | TEXT | YES | Claim notes |
| created_at | DATETIME | NO | Creation timestamp |
| updated_at | DATETIME | NO | Last update timestamp |

---

## Secondary Market Tables

> **Note:** These tables are created by the initial migration. If you're upgrading from an earlier version, you'll need to run a fresh migration:
> ```bash
> docker-compose down -v
> docker-compose up --build
> ```

### secondary_listings

Listings for selling loan participations or transferring risk.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Primary key |
| seller_id | INTEGER | NO | FK to users |
| listing_type | VARCHAR(50) | NO | loan_participation, whole_loan, risk_transfer |
| loan_id | INTEGER | YES | FK to executed_loans |
| title | VARCHAR(255) | NO | Listing title |
| description | TEXT | YES | Listing description |
| participation_percentage | FLOAT | YES | % of loan being sold |
| principal_amount | FLOAT | YES | Dollar amount being sold |
| risk_percentage | FLOAT | YES | % of risk being transferred |
| premium_share | FLOAT | YES | Share of premium to transfer |
| asking_price | FLOAT | NO | Asking price |
| minimum_price | FLOAT | YES | Minimum acceptable (hidden) |
| implied_yield | FLOAT | YES | Expected yield for buyer |
| remaining_term_months | INTEGER | YES | Remaining loan term |
| status | VARCHAR(50) | NO | active, pending, sold, cancelled, expired |
| listed_date | DATETIME | YES | When listed |
| expiry_date | DATE | YES | Listing expiry |
| sold_date | DATETIME | YES | When sold |
| buyer_id | INTEGER | YES | FK to users (buyer) |
| final_price | FLOAT | YES | Final sale price |
| created_at | DATETIME | NO | Creation timestamp |
| updated_at | DATETIME | NO | Last update timestamp |

### secondary_offers

Offers made on secondary market listings.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Primary key |
| listing_id | INTEGER | NO | FK to secondary_listings |
| buyer_id | INTEGER | NO | FK to users |
| offer_price | FLOAT | NO | Offered price |
| message | TEXT | YES | Message to seller |
| status | VARCHAR(50) | NO | pending, accepted, rejected, withdrawn, expired |
| offer_date | DATETIME | YES | When offered |
| expiry_date | DATE | YES | Offer expiry |
| response_date | DATETIME | YES | When seller responded |
| seller_message | TEXT | YES | Seller's response message |
| created_at | DATETIME | NO | Creation timestamp |
| updated_at | DATETIME | NO | Last update timestamp |

### participation_records

Records ownership stakes in loans after secondary market transactions.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Primary key |
| loan_id | INTEGER | NO | FK to executed_loans |
| owner_id | INTEGER | NO | FK to users |
| ownership_percentage | FLOAT | NO | % ownership of loan |
| principal_owned | FLOAT | NO | Dollar amount owned |
| purchase_price | FLOAT | NO | Price paid |
| purchase_date | DATETIME | YES | When purchased |
| source_listing_id | INTEGER | YES | FK to secondary_listings |
| is_original_lender | BOOLEAN | NO | True if original lender |
| is_active | BOOLEAN | NO | False if sold |
| created_at | DATETIME | NO | Creation timestamp |
| updated_at | DATETIME | NO | Last update timestamp |

### risk_transfer_records

Records risk/insurance transfers after secondary market transactions.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Primary key |
| loan_id | INTEGER | NO | FK to executed_loans |
| insurer_id | INTEGER | NO | FK to users |
| risk_percentage | FLOAT | NO | % of guarantee held |
| premium_share | FLOAT | NO | Share of premium received |
| transfer_price | FLOAT | NO | Price paid for transfer |
| transfer_date | DATETIME | YES | When transferred |
| source_listing_id | INTEGER | YES | FK to secondary_listings |
| is_original_insurer | BOOLEAN | NO | True if original insurer |
| is_active | BOOLEAN | NO | False if transferred |
| created_at | DATETIME | NO | Creation timestamp |
| updated_at | DATETIME | NO | Last update timestamp |

## Migration Notes

All migrations are managed with Alembic in `/backend/alembic/versions/`.

Initial migration creates all tables with appropriate indexes and foreign keys.

To run migrations:
```bash
alembic upgrade head
```

To create a new migration:
```bash
alembic revision --autogenerate -m "description"
```
