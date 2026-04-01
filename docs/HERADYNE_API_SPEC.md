# Heradyne API Specification

## Base URL

```
http://localhost:8000/api/v1
```

## Authentication

All endpoints except `/auth/register` and `/auth/login` require JWT authentication.

Include the token in the Authorization header:
```
Authorization: Bearer <token>
```

---

## Authentication Endpoints

### Register User

```http
POST /auth/register
```

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123",
  "full_name": "John Doe",
  "company_name": "Acme Inc.",
  "role": "borrower"
}
```

**Response (201):**
```json
{
  "id": 1,
  "email": "user@example.com",
  "full_name": "John Doe",
  "company_name": "Acme Inc.",
  "role": "borrower",
  "is_active": true,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

### Login

```http
POST /auth/login
```

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer"
}
```

---

## Deal Endpoints

### Create Deal

```http
POST /deals/
```

**Request:**
```json
{
  "name": "ABC Manufacturing Acquisition",
  "deal_type": "acquisition",
  "industry": "manufacturing",
  "business_description": "Precision manufacturing company",
  "loan_amount_requested": 2500000,
  "loan_term_months": 84,
  "annual_revenue": 5000000,
  "gross_profit": 2000000,
  "ebitda": 800000,
  "capex": 100000,
  "debt_service": 50000,
  "addbacks": [
    {"description": "Owner salary above market", "amount": 75000}
  ],
  "purchase_price": 3000000,
  "equity_injection": 500000,
  "business_assets": [
    {"type": "equipment", "value": 800000, "description": "CNC machines"}
  ],
  "personal_assets": [
    {"type": "primary_residence", "value": 500000}
  ],
  "owner_credit_score": 740,
  "owner_experience_years": 12
}
```

**Response (201):**
```json
{
  "id": 1,
  "borrower_id": 1,
  "name": "ABC Manufacturing Acquisition",
  "deal_type": "acquisition",
  "status": "draft",
  "industry": "manufacturing",
  "loan_amount_requested": 2500000,
  "ebitda": 800000,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

### List Deals

```http
GET /deals/?status=draft&skip=0&limit=100
```

**Response (200):**
```json
[
  {
    "id": 1,
    "name": "ABC Manufacturing Acquisition",
    "deal_type": "acquisition",
    "status": "draft",
    "industry": "manufacturing",
    "loan_amount_requested": 2500000,
    "annual_revenue": 5000000,
    "ebitda": 800000,
    "created_at": "2024-01-15T10:30:00Z"
  }
]
```

### Get Deal Detail

```http
GET /deals/{deal_id}
```

**Response (200):**
```json
{
  "id": 1,
  "borrower_id": 1,
  "name": "ABC Manufacturing Acquisition",
  "deal_type": "acquisition",
  "status": "analyzed",
  "industry": "manufacturing",
  "loan_amount_requested": 2500000,
  "annual_revenue": 5000000,
  "ebitda": 800000,
  "documents": [],
  "risk_reports": [
    {
      "id": 1,
      "version": 1,
      "normalized_ebitda": 875000,
      "dscr_base": 1.42,
      "annual_pd": 0.039,
      "created_at": "2024-01-15T11:00:00Z"
    }
  ],
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T11:00:00Z"
}
```

### Submit Deal for Analysis

```http
POST /deals/{deal_id}/submit
```

**Response (200):**
```json
{
  "deal_id": 1,
  "status": "submitted",
  "message": "Deal submitted for analysis. DISCLAIMER: Heradyne is an informational platform only..."
}
```

### Upload Document

```http
POST /deals/{deal_id}/documents
Content-Type: multipart/form-data
```

**Form Data:**
- `file`: The file to upload
- `document_type`: (optional) tax_return, financial_statement, etc.

**Response (201):**
```json
{
  "id": 1,
  "filename": "abc123_tax_return_2023.pdf",
  "original_filename": "tax_return_2023.pdf",
  "file_size": 245678,
  "mime_type": "application/pdf",
  "document_type": "tax_return",
  "created_at": "2024-01-15T10:35:00Z"
}
```

### Download Document

```http
GET /deals/{deal_id}/documents/{document_id}/download
```

Downloads a document from a deal's data room.

**Access Control:**
| Role | Access |
|------|--------|
| Borrower | Own deals only |
| Lender | Deals with matching lender policies |
| Insurer | Deals with matching insurer policies |
| Admin | All deals |

**Response (200):** Binary file download with appropriate headers:
- `Content-Type`: Based on file mime type (e.g., `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`)
- `Content-Disposition`: `attachment; filename="original_filename.ext"`
- `Access-Control-Allow-Origin`: CORS header for cross-origin requests

**Error Responses:**
- `401 Unauthorized`: Missing or invalid authentication token
- `403 Forbidden`: User doesn't have access to this deal's documents
- `404 Not Found`: Deal, document, or file not found
- `500 Internal Server Error`: File read error

**Example:**
```bash
curl -H "Authorization: Bearer <token>" \
  -O -J \
  http://localhost:8000/api/v1/deals/1/documents/5/download
```

**Frontend Usage:**
```typescript
// Using the API client
await api.downloadDocument(dealId, documentId, filename);
```

### Get Latest Risk Report

```http
GET /deals/{deal_id}/risk-reports/latest
```

**Response (200):**
```json
{
  "id": 1,
  "deal_id": 1,
  "version": 1,
  "normalized_ebitda": 875000,
  "post_debt_fcf": 420000,
  "dscr_base": 1.42,
  "dscr_stress": 0.98,
  "sba_anchor_pd": 0.03,
  "industry_multiplier": 1.0,
  "leverage_multiplier": 1.3,
  "volatility_multiplier": 1.0,
  "annual_pd": 0.039,
  "ev_low": 2625000,
  "ev_mid": 3937500,
  "ev_high": 5250000,
  "durability_score": 75,
  "business_nolv": 1260000,
  "personal_nolv": 400000,
  "total_nolv": 1660000,
  "collateral_coverage": 0.664,
  "recommended_guarantee_pct": 0.60,
  "recommended_escrow_pct": 0.05,
  "recommended_alignment": {
    "personal_guarantee": true,
    "monthly_reporting": true
  },
  "report_data": { },
  "created_at": "2024-01-15T11:00:00Z"
}
```

---

## Policy Endpoints

### Create Lender Policy

```http
POST /policies/lender
```

**Request:**
```json
{
  "name": "Conservative SMB Lending",
  "is_active": true,
  "min_loan_size": 500000,
  "max_loan_size": 5000000,
  "min_dscr": 1.25,
  "max_pd": 0.05,
  "max_leverage": 4.0,
  "min_collateral_coverage": 0.8,
  "allowed_industries": ["manufacturing", "healthcare"],
  "excluded_industries": ["restaurants"],
  "min_term_months": 36,
  "max_term_months": 120,
  "allowed_deal_types": ["acquisition", "growth"]
}
```

**Response (201):**
```json
{
  "id": 1,
  "lender_id": 2,
  "name": "Conservative SMB Lending",
  "is_active": true,
  "min_dscr": 1.25,
  "max_pd": 0.05,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

### Create Insurer Policy

```http
POST /policies/insurer
```

**Request:**
```json
{
  "name": "SMB Credit Enhancement",
  "is_active": true,
  "max_expected_loss": 0.03,
  "min_attachment_point": 0.10,
  "max_attachment_point": 0.30,
  "target_premium_min": 0.02,
  "target_premium_max": 0.05,
  "min_coverage_amount": 250000,
  "max_coverage_amount": 2000000,
  "allowed_industries": ["manufacturing", "technology"]
}
```

---

## Matching Endpoints

### Run Matching

```http
POST /matching/deals/{deal_id}/run
```

**Request:**
```json
{
  "generate_scenarios": true
}
```

**Response (200):**
```json
{
  "deal_id": 1,
  "deal_name": "ABC Manufacturing Acquisition",
  "total_lender_matches": 2,
  "total_insurer_matches": 1,
  "lender_matches": [
    {
      "policy_id": 1,
      "policy_name": "Conservative SMB Lending",
      "policy_type": "lender",
      "match_score": 1.0,
      "is_full_match": true,
      "constraints_met": [
        {
          "constraint": "min_dscr",
          "required": 1.25,
          "actual": 1.42,
          "met": true,
          "reason": "DSCR 1.42x vs min 1.25x"
        }
      ],
      "constraints_failed": []
    }
  ],
  "insurer_matches": [],
  "approve_if_scenarios": [
    {
      "scenario_id": 1,
      "description": "Extend term to 96 months to improve DSCR",
      "adjustments": {
        "loan_term_months": {"from": 84, "to": 96}
      },
      "new_constraints_met": ["min_dscr"],
      "constraints_still_failed": [],
      "feasibility_score": 0.85
    }
  ],
  "disclaimer": "INFORMATIONAL ONLY: Heradyne does not lend, guarantee, or insure..."
}
```

### Get My Matches (Lender/Insurer)

```http
GET /matching/my-matches
```

**Response (200):**
```json
[
  {
    "id": 1,
    "deal_id": 1,
    "lender_policy_id": 1,
    "match_score": 1.0,
    "status": "pending",
    "created_at": "2024-01-15T12:00:00Z"
  }
]
```

### Make Decision on Match

```http
PUT /matching/matches/{match_id}/decision
```

**Request:**
```json
{
  "status": "accepted",
  "decision_notes": "Approved with standard terms"
}
```

**Response (200):**
```json
{
  "id": 1,
  "deal_id": 1,
  "lender_policy_id": 1,
  "status": "accepted",
  "decision_notes": "Approved with standard terms",
  "decision_at": "2024-01-15T14:00:00Z"
}
```

---

## Cash Flow & Fees Endpoints

### Add Monthly Cash Flow

```http
POST /cashflow/deals/{deal_id}/monthly
```

**Request:**
```json
{
  "month": 1,
  "year": 2024,
  "revenue": 400000,
  "ebitda": 65000,
  "debt_service": 35000
}
```

### Calculate Fees

```http
POST /cashflow/deals/{deal_id}/calculate-fees
```

**Response (200):**
```json
{
  "deal_id": 1,
  "total_fees": 7200,
  "entries": [
    {
      "id": 1,
      "month": 1,
      "year": 2024,
      "post_debt_fcf": 30000,
      "fee_rate": 0.02,
      "calculated_fee": 600
    }
  ]
}
```

### Export Fee Ledger CSV

```http
GET /cashflow/deals/{deal_id}/fee-ledger/export
```

**Response:** CSV file download

---

## Assumptions Endpoints (Admin)

### List Assumptions

```http
GET /assumptions/?category=pd_engine&user_id=0
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| category | string | Filter by category (optional) |
| user_id | int | Filter by user ID. Use `0` for system defaults only (optional) |
| include_user_overrides | bool | Include user-specific overrides (default: false) |

**Response (200):**
```json
[
  {
    "id": 1,
    "user_id": null,
    "category": "pd_engine",
    "key": "sba_anchor_pd",
    "value": 0.03,
    "description": "Base annual probability of default",
    "created_at": "2024-01-15T10:00:00Z",
    "updated_at": "2024-01-15T10:00:00Z"
  }
]
```

### Get Effective Assumptions for User

```http
GET /assumptions/effective?user_id=5&category=pd_engine
```

Returns merged assumptions for a user: system defaults with user-specific overrides applied.

**Response (200):** Same as List Assumptions

### List Users with Overrides

```http
GET /assumptions/users
```

**Access:** Admin only

**Response (200):**
```json
[
  {
    "id": 5,
    "email": "lender@example.com",
    "full_name": "John Lender",
    "role": "lender",
    "override_count": 3
  }
]
```

### Get User Overrides

```http
GET /assumptions/users/{user_id}/overrides
```

**Access:** Admin or the user themselves

**Response (200):** List of assumptions that are user-specific overrides

### Create/Update User Override

```http
POST /assumptions/users/{user_id}/override
```

**Access:** Admin only

**Request:**
```json
{
  "user_id": 5,
  "category": "pd_engine",
  "key": "industry_multipliers",
  "value": {
    "manufacturing": 0.9,
    "retail": 1.1
  },
  "description": "Custom industry multipliers for this lender"
}
```

**Response (200):**
```json
{
  "id": 15,
  "user_id": 5,
  "category": "pd_engine",
  "key": "industry_multipliers",
  "value": {...},
  "description": "Custom industry multipliers for this lender",
  "created_at": "2024-01-15T10:00:00Z",
  "updated_at": "2024-01-15T14:30:00Z"
}
```

### Copy System Defaults to User

```http
POST /assumptions/users/{user_id}/copy-defaults?categories=pd_engine&categories=valuation_engine
```

Copies all system default assumptions as user overrides (for customization starting point).

**Access:** Admin only

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| categories | array | Specific categories to copy (optional, copies all if not specified) |

**Response (200):** List of created assumption overrides

### Update Assumption

```http
PUT /assumptions/{category}/{key}?user_id=5
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| user_id | int | Update user-specific override (optional, updates system default if not specified) |

**Request:**
```json
{
  "value": 0.035,
  "description": "Updated SBA anchor PD"
}
```

### Delete Assumption

```http
DELETE /assumptions/{category}/{key}?user_id=5
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| user_id | int | Delete user-specific override (optional) |

### Delete All User Overrides

```http
DELETE /assumptions/users/{user_id}/overrides
```

Removes all assumption overrides for a user, reverting them to system defaults.

**Access:** Admin only

---

## Audit Endpoints

### List Audit Logs

```http
GET /audit/?entity_type=deal&action=deal_submitted&skip=0&limit=100
```

**Response (200):**
```json
{
  "total": 42,
  "items": [
    {
      "id": 1,
      "user_id": 1,
      "action": "deal_submitted",
      "entity_type": "deal",
      "entity_id": 1,
      "details": {},
      "created_at": "2024-01-15T10:35:00Z"
    }
  ]
}
```

---

## Error Responses

### 400 Bad Request

```json
{
  "detail": "Invalid input data"
}
```

### 401 Unauthorized

```json
{
  "detail": "Invalid or expired token"
}
```

### 403 Forbidden

```json
{
  "detail": "User role 'borrower' not authorized for this action"
}
```

### 404 Not Found

```json
{
  "detail": "Deal not found"
}
```

### 422 Validation Error

```json
{
  "detail": [
    {
      "loc": ["body", "loan_amount_requested"],
      "msg": "value is not a valid float",
      "type": "type_error.float"
    }
  ]
}
```

---

## Rate Limits

MVP does not implement rate limiting. Production should add:
- 100 requests/minute for authenticated users
- 10 requests/minute for unauthenticated endpoints

---

## Document Verification Endpoints

### Get Verification Status

```http
GET /deals/{deal_id}/verification
```

Returns document verification status comparing uploaded documents against borrower-reported values.

**Access:** Deal owner, lenders/insurers (for analyzed+ deals), admins

**Response (200):**
```json
{
  "deal_id": 1,
  "status": "flagged",
  "flag_count": 2,
  "confidence_score": 65.0,
  "documents_analyzed": ["tax_return_2023.pdf", "bank_statement.pdf"],
  "discrepancies": [
    {
      "field": "Annual Revenue",
      "reported": 2500000,
      "extracted": 2150000,
      "difference_pct": 14.0,
      "severity": "medium",
      "source": "tax_return_2023.pdf",
      "notes": "⚡ MEDIUM: Document shows Annual Revenue of $2,150,000, which is 14.0% lower than reported $2,500,000"
    }
  ],
  "critical_count": 0,
  "high_count": 0,
  "warnings": [],
  "disclaimer": "Document verification is automated and may not catch all discrepancies. Manual review recommended."
}
```

### Run Document Verification

```http
POST /deals/{deal_id}/verify-documents
```

Triggers document verification and updates the latest risk report with results.

**Access:** Deal owner, admins

**Response (200):** Same as GET verification status

---

## Synchronous Analysis Endpoint

### Analyze Deal Synchronously

```http
POST /deals/{deal_id}/analyze-sync
```

Runs underwriting analysis synchronously (useful when Celery is unavailable or for testing).

**Access:** Deal owner, admins

**Response (200):**
```json
{
  "deal_id": 1,
  "status": "analyzed",
  "message": "Analysis complete. DISCLAIMER: Heradyne is an informational platform only..."
}
```

---

## Counter-Offer Endpoints

### Respond to Counter-Offer

```http
PUT /matching/matches/{match_id}/counter-offer-response
```

Allows borrower to accept or reject a counter-offer.

**Access:** Borrower (deal owner only)

**Request:**
```json
{
  "response": "accepted",
  "notes": "Agreed to reduced loan amount"
}
```

**Response values:** `accepted` or `rejected`

**Response (200):**
```json
{
  "id": 1,
  "deal_id": 1,
  "lender_policy_id": 1,
  "match_score": 0.75,
  "status": "counter_accepted",
  "auto_decision": true,
  "auto_decision_reason": "Counter-offer generated: match score 75.0% in counter-offer range",
  "counter_offer": {
    "original_values": {"loan_amount_requested": 3000000},
    "proposed_values": {"loan_amount_requested": 2500000},
    "adjustments": [...],
    "reason": "Counter-offer to address 1 constraint(s)",
    "expected_match_score": 95,
    "expires_in_days": 7
  },
  "borrower_response": "accepted",
  "borrower_response_at": "2024-01-15T14:30:00Z"
}
```

**Effects of Accepting:**
- Deal is updated with proposed values (e.g., loan_amount_requested changed)
- Match status changes to `counter_accepted`
- Deal status updated appropriately

### Get Counter-Offer Details

```http
GET /matching/matches/{match_id}/counter-offer
```

Retrieves full details of a counter-offer.

**Access:** Borrower (deal owner), policy owner (lender/insurer), admins

**Response (200):**
```json
{
  "match_id": 1,
  "deal_id": 1,
  "deal_name": "ABC Manufacturing Acquisition",
  "status": "counter_offered",
  "counter_offer": {
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
    "expected_match_score": 95,
    "expires_in_days": 7
  },
  "counter_offer_at": "2024-01-15T10:00:00Z",
  "expires_at": "2024-01-22T10:00:00Z",
  "is_expired": false,
  "borrower_response": null,
  "borrower_response_at": null,
  "borrower_response_notes": null
}
```

---

## Financial Dashboard Endpoints

### Get Lender Dashboard

```http
GET /financial/dashboard/lender?lender_id=5
```

**Access:** Lenders (own dashboard only), Admins (any lender)

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| lender_id | int | Lender ID (admin can specify, lenders see own) |

**Response (200):**
```json
{
  "total_loans": 25,
  "total_principal_outstanding": 15000000,
  "total_principal_originated": 20000000,
  "average_interest_rate": 0.085,
  "weighted_average_interest_rate": 0.082,
  "average_loan_size": 800000,
  "average_term_months": 84,
  "monthly_principal_payments": 150000,
  "monthly_interest_income": 100000,
  "monthly_total_payments": 250000,
  "active_loans": 20,
  "paid_off_loans": 3,
  "defaulted_loans": 2,
  "default_rate": 8.0,
  "total_past_due": 500000,
  "loans_past_due_30": 2,
  "loans_past_due_60": 1,
  "loans_past_due_90": 1,
  "geographic_concentration": [
    {"state": "CA", "loan_count": 8, "total_principal": 6000000, "percentage": 30.0}
  ],
  "industry_concentration": [
    {"industry": "manufacturing", "loan_count": 10, "total_principal": 8000000, "percentage": 40.0}
  ],
  "insured_principal": 10000000,
  "uninsured_principal": 5000000,
  "average_guarantee_percentage": 0.55
}
```

### Get Insurer Dashboard

```http
GET /financial/dashboard/insurer?insurer_id=5
```

**Access:** Insurers (own dashboard only), Admins (any insurer)

**Response (200):**
```json
{
  "total_policies": 15,
  "total_insured_principal": 10000000,
  "total_premium_received": 250000,
  "average_premium_rate": 0.025,
  "average_guarantee_percentage": 0.55,
  "monthly_premium_income": 20000,
  "total_exposure": 8000000,
  "current_claims": 1,
  "total_claims_paid": 100000,
  "loss_ratio": 40.0,
  "active_policies": 12,
  "policies_in_default": 2,
  "expected_loss": 240000,
  "geographic_concentration": [...],
  "industry_concentration": [...],
  "lender_concentration": [
    {"lender_id": 1, "lender_name": "ABC Lender", "count": 8, "exposure": 4000000}
  ]
}
```

### Get Admin Dashboard

```http
GET /financial/dashboard/admin
```

**Access:** Admins only

**Response (200):**
```json
{
  "total_loans": 100,
  "total_principal_outstanding": 50000000,
  "total_principal_originated": 75000000,
  "total_lenders": 10,
  "active_lenders": 8,
  "average_portfolio_size": 6250000,
  "total_insurers": 5,
  "active_insurers": 4,
  "total_insured_amount": 30000000,
  "total_premium_collected": 750000,
  "platform_default_rate": 5.0,
  "total_defaults": 5,
  "total_losses": 1000000,
  "total_recoveries": 200000,
  "lender_stats": [...],
  "insurer_stats": [...],
  "geographic_concentration": [...],
  "industry_concentration": [...]
}
```

### List Executed Loans

```http
GET /financial/loans?lender_id=5&status=active&state=CA&industry=manufacturing
```

**Access:** Role-based (lenders see own loans, insurers see insured loans, admins see all)

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| lender_id | int | Filter by lender (admin only) |
| insurer_id | int | Filter by insurer (admin only) |
| status | string | Filter by status (active, paid_off, default, etc.) |
| state | string | Filter by state |
| industry | string | Filter by industry |

**Response (200):** Array of ExecutedLoan objects

### Get Loan Details

```http
GET /financial/loans/{loan_id}
```

**Response (200):**
```json
{
  "id": 1,
  "loan_number": "LN-202401-ABC12345",
  "deal_id": 1,
  "borrower_id": 1,
  "lender_id": 2,
  "insurer_id": 3,
  "principal_amount": 1000000,
  "interest_rate": 0.08,
  "term_months": 84,
  "monthly_payment": 15000,
  "origination_date": "2024-01-15",
  "maturity_date": "2031-01-15",
  "status": "active",
  "current_principal_balance": 950000,
  "guarantee_percentage": 0.50,
  "premium_rate": 0.025,
  "premium_paid": 12500,
  "state": "CA",
  "city": "Los Angeles",
  "industry": "manufacturing",
  "days_past_due": 0,
  "total_payments_made": 6,
  "total_principal_paid": 50000,
  "total_interest_paid": 40000,
  "borrower_name": "John Smith",
  "lender_name": "ABC Lender",
  "insurer_name": "XYZ Insurance",
  "deal_name": "ABC Manufacturing Acquisition"
}
```

### Get Loans Grouped by Lender (Admin)

```http
GET /financial/loans/by-lender
```

**Response (200):** Array of lender summaries with loan details

### Get Loans Grouped by Insurer (Admin)

```http
GET /financial/loans/by-insurer
```

**Response (200):** Array of insurer summaries with policy details

### Record Loan Payment (Admin)

```http
POST /financial/loans/{loan_id}/payments
```

**Request:**
```json
{
  "payment_date": "2024-02-15",
  "payment_number": 7,
  "scheduled_payment": 15000,
  "actual_payment": 15000,
  "principal_portion": 8500,
  "interest_portion": 6500,
  "principal_balance_after": 941500,
  "is_late": false,
  "days_late": 0
}
```

### Create Insurance Claim (Admin)

```http
POST /financial/claims
```

**Request:**
```json
{
  "loan_id": 1,
  "insurer_id": 3,
  "claim_date": "2024-02-01",
  "claim_amount": 500000,
  "notes": "Borrower default after 90 days"
}
```

---

## Secondary Market Endpoints

The secondary market allows lenders to sell loan participations and insurers to transfer risk positions.

> **Role-Based Access:**
> - **Lenders** can view and make offers on loan participations and whole loans
> - **Insurers** can view and make offers on risk transfers
> - **Admins** can view all listing types
> 
> The frontend filters listings by role automatically. The backend enforces role restrictions when making offers.

### List Listings

```http
GET /secondary-market/listings?listing_type=loan_participation&status=active&my_listings=false
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| listing_type | string | Filter by type: loan_participation, whole_loan, risk_transfer |
| status_filter | string | Filter by status: active, pending, sold, cancelled |
| min_price | float | Minimum asking price |
| max_price | float | Maximum asking price |
| industry | string | Filter by loan industry |
| state | string | Filter by loan state |
| my_listings | boolean | Show only current user's listings |

**Response (200):** Array of SecondaryListing objects with enriched loan data

### Get Listing Details

```http
GET /secondary-market/listings/{listing_id}
```

**Response (200):**
```json
{
  "id": 1,
  "seller_id": 5,
  "listing_type": "loan_participation",
  "loan_id": 10,
  "title": "LN-202401-ABC12345 - 25% Participation",
  "description": "Strong performing loan in manufacturing sector",
  "participation_percentage": 0.25,
  "principal_amount": 250000,
  "asking_price": 240000,
  "implied_yield": 0.085,
  "remaining_term_months": 60,
  "status": "active",
  "listed_date": "2024-02-01T10:00:00Z",
  "seller_name": "ABC Lender",
  "loan_number": "LN-202401-ABC12345",
  "loan_industry": "manufacturing",
  "loan_state": "CA",
  "original_principal": 1000000,
  "current_balance": 950000,
  "interest_rate": 0.08,
  "offer_count": 2
}
```

### Create Listing

```http
POST /secondary-market/listings
```

**Access:** Lenders (loan participations), Insurers (risk transfers)

**Request:**
```json
{
  "listing_type": "loan_participation",
  "loan_id": 10,
  "title": "25% Participation in Manufacturing Loan",
  "description": "Optional description",
  "participation_percentage": 0.25,
  "principal_amount": 250000,
  "asking_price": 240000,
  "minimum_price": 230000,
  "implied_yield": 0.085,
  "expiry_date": "2024-03-01"
}
```

### Cancel Listing

```http
DELETE /secondary-market/listings/{listing_id}
```

Cancels a listing and rejects all pending offers.

### List Offers on Listing

```http
GET /secondary-market/listings/{listing_id}/offers
```

**Access:** Seller only (or admin)

**Response (200):** Array of offers with buyer details

### Create Offer

```http
POST /secondary-market/listings/{listing_id}/offers
```

**Access:** Lenders can offer on loan listings, Insurers on risk transfers

**Request:**
```json
{
  "listing_id": 1,
  "offer_price": 235000,
  "message": "Interested in this participation",
  "expiry_date": "2024-02-15"
}
```

### Respond to Offer

```http
POST /secondary-market/offers/{offer_id}/respond
```

**Access:** Seller only

**Request:**
```json
{
  "action": "accept",
  "message": "Thank you for your offer"
}
```

Accepting an offer:
- Marks listing as sold
- Creates participation/risk transfer record for buyer
- Rejects all other pending offers
- Updates ownership records

### Withdraw Offer

```http
DELETE /secondary-market/offers/{offer_id}
```

**Access:** Buyer only (for pending offers)

### Get My Offers

```http
GET /secondary-market/my/offers?status_filter=pending
```

Returns all offers made by the current user.

### Get My Participations

```http
GET /secondary-market/my/participations
```

**Access:** Lenders only

Returns loan participation records owned by the current user.

### Get My Risk Positions

```http
GET /secondary-market/my/risk-positions
```

**Access:** Insurers only

Returns risk transfer records owned by the current user.

### Get Market Statistics

```http
GET /secondary-market/stats
```

**Response (200):**
```json
{
  "total_loan_listings": 50,
  "active_loan_listings": 25,
  "total_loan_volume": 5000000,
  "avg_loan_asking_price": 200000,
  "avg_loan_yield": 8.5,
  "total_risk_listings": 20,
  "active_risk_listings": 10,
  "total_risk_volume": 2000000,
  "avg_risk_asking_price": 100000,
  "listings_last_30_days": 15,
  "sales_last_30_days": 8,
  "total_sales_volume_30_days": 1500000
}
```

---

## Loan Origination Endpoints

These endpoints allow lenders to originate loans and insurers to issue guarantee contracts.

### Get Originatable Matches (Lenders)

```http
GET /origination/originatable-matches
```

**Access:** Lenders only

Returns accepted matches that can be originated into loans.

**Response (200):**
```json
[
  {
    "match_id": 15,
    "deal_id": 10,
    "deal_name": "ABC Manufacturing Expansion",
    "borrower_name": "John Smith",
    "requested_amount": 500000,
    "industry": "manufacturing",
    "state": null,
    "match_score": 85.5,
    "status": "accepted",
    "accepted_at": "2024-02-01T10:30:00Z"
  }
]
```

### Originate Loan

```http
POST /origination/originate-loan
```

**Access:** Lenders only

Creates a new executed loan from an accepted match.

**Request:**
```json
{
  "match_id": 15,
  "principal_amount": 500000,
  "interest_rate": 0.08,
  "term_months": 60,
  "origination_date": "2024-02-15",
  "notes": "Standard terms"
}
```

**Response (201):** ExecutedLoan object with full details

**Side Effects:**
- Creates ExecutedLoan record
- Updates Deal status to "funded"
- Logs to audit trail

> **Note:** Location fields (state, city, zip_code) will be null on the created loan as they are not captured during deal creation. Participation and risk transfer records are not automatically created in the current version.

### Get Guaranteeable Matches (Insurers)

```http
GET /origination/guaranteeable-matches
```

**Access:** Insurers only

Returns accepted matches that can receive guarantee contracts.

**Response (200):**
```json
[
  {
    "match_id": 20,
    "deal_id": 10,
    "deal_name": "ABC Manufacturing Expansion",
    "borrower_name": "John Smith",
    "loan_amount": 500000,
    "industry": "manufacturing",
    "state": null,
    "match_score": 90.0,
    "status": "accepted",
    "has_loan": true,
    "loan_number": "LN-202402-ABC12345",
    "loan_principal": 500000
  }
]
```

### Issue Guarantee

```http
POST /origination/issue-guarantee
```

**Access:** Insurers only

Issues a guarantee contract for an accepted match.

**Request:**
```json
{
  "match_id": 20,
  "guarantee_percentage": 50,
  "premium_rate": 2,
  "effective_date": "2024-02-15",
  "notes": "Standard guarantee terms"
}
```

**Response (200):**
```json
{
  "guarantee_number": "GC-202402-XYZ78901",
  "deal_id": 10,
  "match_id": 20,
  "insurer_id": 5,
  "guarantee_percentage": 50,
  "premium_rate": 2,
  "effective_date": "2024-02-15",
  "status": "active",
  "loan_id": 8,
  "loan_number": "LN-202402-ABC12345",
  "covered_amount": 250000
}
```

### Get My Originated Loans

```http
GET /origination/my-originated-loans?status_filter=active
```

**Access:** Lenders only

Returns all loans originated by the current lender.

### Get My Guaranteed Loans

```http
GET /origination/my-guaranteed-loans?status_filter=active
```

**Access:** Insurers only

Returns all loans guaranteed by the current insurer.

### Get Origination Settings (Admin)

```http
GET /origination/settings
```

**Access:** Admins only

Returns current origination settings.

**Response (200):**
```json
{
  "require_dual_acceptance": true,
  "require_insurer_for_origination": false
}
```

### Update Origination Settings (Admin)

```http
PUT /origination/settings
```

**Access:** Admins only

Updates origination settings.

**Request:**
```json
{
  "require_dual_acceptance": true,
  "require_insurer_for_origination": false
}
```

**Response (200):**
```json
{
  "require_dual_acceptance": true,
  "require_insurer_for_origination": false
}
```

**Setting Descriptions:**

| Setting | Description |
|---------|-------------|
| `require_dual_acceptance` | If true, both lender AND insurer must accept a deal before origination |
| `require_insurer_for_origination` | If true, an insurer must accept before origination (superseded by dual acceptance) |

---

## Pre-Qualified Collateral Endpoints

### Get Asset Categories

```http
GET /collateral/categories
```

**Access:** All authenticated users

Returns all asset categories with haircut percentages.

**Response (200):**
```json
[
  {
    "value": "real_estate",
    "label": "Real Estate",
    "type": "personal",
    "haircut": 0.20,
    "description": "Personal residence, rental property, land"
  },
  {
    "value": "equipment",
    "label": "Equipment",
    "type": "business",
    "haircut": 0.35,
    "description": "Machinery, tools, technology"
  }
]
```

### Get My Assets

```http
GET /collateral/my-assets?asset_type=personal&active_only=true
```

**Access:** Borrowers only

**Query Parameters:**
- `asset_type` (optional): Filter by "personal" or "business"
- `active_only` (optional, default: true): Only return active assets

**Response (200):**
```json
[
  {
    "id": 1,
    "borrower_id": 5,
    "asset_type": "personal",
    "category": "real_estate",
    "name": "Primary Residence",
    "description": "3BR house in Austin",
    "stated_value": 500000,
    "estimated_value": 475000,
    "forced_sale_value": 332500,
    "collateral_value": 380000,
    "valuation_confidence": 0.75,
    "valuation_method": "comp_analysis_psf",
    "valuation_notes": "Based on $200/sqft for single_family, age factor 0.95",
    "has_lien": true,
    "lien_amount": 200000,
    "lien_holder": "Wells Fargo",
    "net_equity": 275000,
    "verification_status": "pending",
    "is_active": true
  }
]
```

### Get Collateral Summary

```http
GET /collateral/summary
```

**Access:** Borrowers only

**Response (200):**
```json
{
  "total_assets": 5,
  "total_stated_value": 750000,
  "total_estimated_value": 700000,
  "total_collateral_value": 525000,
  "total_forced_sale_value": 420000,
  "personal_assets_count": 3,
  "personal_assets_value": 400000,
  "business_assets_count": 2,
  "business_assets_value": 125000,
  "pending_verification": 4,
  "verified": 1
}
```

### Create Asset

```http
POST /collateral/
```

**Access:** Borrowers only

**Request:**
```json
{
  "asset_type": "personal",
  "category": "real_estate",
  "name": "Primary Residence",
  "description": "3BR house in Austin",
  "stated_value": 500000,
  "address": "123 Main St, Austin, TX 78701",
  "property_type": "single_family",
  "square_feet": 2000,
  "year_built": 1995,
  "has_lien": true,
  "lien_amount": 200000,
  "lien_holder": "Wells Fargo"
}
```

**Response (201):** Full asset object with pricing engine valuation

### Update Asset

```http
PUT /collateral/{asset_id}
```

**Access:** Asset owner only

Re-runs pricing engine if value-affecting fields change.

### Delete Asset

```http
DELETE /collateral/{asset_id}
```

**Access:** Asset owner only

Soft deletes (deactivates) the asset.

### Revalue Asset

```http
POST /collateral/{asset_id}/revalue
```

**Access:** Asset owner or admin

Re-runs the pricing engine with current data.

### Apply Assets to Deal

```http
POST /collateral/apply-to-deal/{deal_id}
```

**Access:** Borrowers only

**Request:**
```json
[1, 2, 3]
```

(Array of asset IDs to apply)

**Response (200):**
```json
{
  "message": "Assets applied to deal successfully",
  "deal_id": 10,
  "personal_assets_applied": 2,
  "business_assets_applied": 1,
  "total_personal_collateral": 380000,
  "total_business_collateral": 75000
}
```

---

## Default Protection Endpoints

### Get My Protections

```http
GET /protection/my-protections
```

**Access:** Borrowers only

Returns all protection records including previews for unfunded deals.

**Response (200):**
```json
[
  {
    "id": 1,
    "loan_id": 5,
    "deal_id": 10,
    "deal_name": "ABC Corp Acquisition",
    "loan_number": "LN-202401-A1B2C3D4",
    "status": "active",
    "current_tier": "tier_1",
    "health_score": 85,
    "is_preview": false,
    "original_loan_amount": 500000,
    "outstanding_balance": 480000,
    "guarantee_percentage": 50,
    "guaranteed_amount": 250000,
    "tier_1": {
      "tier": "tier_1",
      "name": "Business Protection",
      "description": "Business assets pledged as collateral",
      "coverage": 150000,
      "used": 0,
      "remaining": 150000,
      "percentage_used": 0,
      "is_active": true,
      "assets": [
        {"type": "equipment", "description": "CNC Machine", "estimated_value": 75000},
        {"type": "inventory", "description": "Raw materials", "estimated_value": 75000}
      ]
    },
    "tier_2": {
      "tier": "tier_2",
      "name": "Personal Protection",
      "coverage": 0,
      "used": 0,
      "remaining": 0,
      "percentage_used": 0,
      "is_active": false,
      "assets": []
    },
    "tier_3": {
      "tier": "tier_3",
      "name": "Personal Assets at Risk",
      "coverage": 300000,
      "used": 0,
      "remaining": 300000,
      "percentage_used": 0,
      "is_active": false,
      "assets": [
        {"type": "real_estate", "description": "Primary residence", "estimated_value": 300000}
      ]
    },
    "total_protection": 450000,
    "total_used": 0,
    "total_remaining": 450000,
    "tier_2_enrolled": false,
    "tier_2_monthly_fee": 0
  }
]
```

### Get Protection Preview for Deal

```http
GET /protection/deal/{deal_id}/preview
```

**Access:** Borrower (deal owner) or admin

Returns protection preview based on deal assets before loan funding.

### Enroll in Tier 2 Protection

```http
POST /protection/{protection_id}/enroll-tier-2
```

**Access:** Protection owner only

**Request:**
```json
{
  "monthly_fee": 100
}
```

**Response (200):** Updated protection summary

### Make Tier 2 Payment

```http
POST /protection/{protection_id}/tier-2-payment
```

**Access:** Protection owner only

**Request:**
```json
{
  "amount": 100,
  "payment_method": "card"
}
```

**Response (200):** Updated protection summary (coverage increased by amount × 2)

### Get Protection Events

```http
GET /protection/{protection_id}/events
```

**Access:** Protection owner or admin

Returns event history for the protection.

**Response (200):**
```json
[
  {
    "id": 1,
    "event_type": "protection_created",
    "previous_status": null,
    "new_status": "active",
    "amount_involved": null,
    "description": "Default protection created for loan LN-202401-A1B2C3D4 with 50% guarantee",
    "created_at": "2024-01-15T10:30:00Z"
  },
  {
    "id": 2,
    "event_type": "tier_2_enrolled",
    "description": "Enrolled in Tier 2 protection with $100/month fee",
    "created_at": "2024-01-16T14:00:00Z"
  }
]
```

### Simulate Default (Admin)

```http
POST /protection/{protection_id}/simulate-default
```

**Access:** Admins only

**Request:**
```json
{
  "missed_amount": 50000
}
```

Simulates a default scenario to test tier progression.

---

## Loan Officer Verification Endpoints

### Get Deals for Verification

```http
GET /verification/my-deals?status_filter=pending
```

**Access:** Loan Officers and Lenders only

Returns deals matched to the user's organization's policies with verification status.

**Query Parameters:**
- `status_filter` (optional): Filter by match status

**Response (200):**
```json
[
  {
    "match_id": 1,
    "deal_id": 5,
    "deal_name": "ABC Manufacturing Acquisition",
    "borrower_name": "John Smith",
    "industry": "manufacturing",
    "loan_amount_requested": 2500000,
    "match_score": 0.85,
    "match_status": "pending",
    "constraints_met": ["loan_size", "dscr", "industry"],
    "constraints_failed": ["leverage"],
    "verification_status": "pending_review",
    "flag_count": 0,
    "pending_flag_count": 0,
    "ready_for_committee": false,
    "risk_metrics": {
      "dscr_base": 1.45,
      "dscr_stress": 1.12,
      "annual_pd": 0.032,
      "ev_mid": 4500000,
      "collateral_coverage": 0.85,
      "leverage": 3.2,
      "durability_score": 72
    },
    "created_at": "2024-01-15T10:30:00Z"
  }
]
```

### Create Verification Flag

```http
POST /verification/flags
```

**Access:** Loan Officers and Lenders only

Create a flag on a deal field to document a discrepancy or concern.

**Request:**
```json
{
  "deal_id": 5,
  "match_id": 1,
  "field_name": "annual_revenue",
  "reported_value": "$5,000,000",
  "expected_value": "$4,200,000",
  "difference_description": "Tax returns show lower revenue",
  "severity": "high",
  "notes": "2023 tax return shows $4.2M, borrower reported $5M"
}
```

**Severity Options:** `low`, `medium`, `high`, `critical`

**Response (201):**
```json
{
  "id": 1,
  "deal_id": 5,
  "match_id": 1,
  "field_name": "annual_revenue",
  "reported_value": "$5,000,000",
  "expected_value": "$4,200,000",
  "difference_description": "Tax returns show lower revenue",
  "severity": "high",
  "status": "pending",
  "notes": "2023 tax return shows $4.2M, borrower reported $5M",
  "flagged_by_name": "Tom Verifier",
  "resolved_by_name": null,
  "resolved_at": null,
  "resolution_notes": null,
  "created_at": "2024-01-15T14:00:00Z"
}
```

### Get Flags for Deal

```http
GET /verification/flags/{deal_id}
```

**Access:** Any lender role or admin

Returns all verification flags for a specific deal.

**Response (200):** Array of flag objects

### Resolve Flag

```http
PUT /verification/flags/{flag_id}/resolve
```

**Access:** Any lender role or admin

**Request:**
```json
{
  "status": "resolved",
  "resolution_notes": "Borrower provided updated financials, discrepancy explained"
}
```

**Status Options:** `resolved`, `dismissed`

### Mark Deal as Verified

```http
POST /verification/mark-verified
```

**Access:** Loan Officers and Lenders only

Marks a deal as verified and ready for Credit Committee review.

**Request:**
```json
{
  "match_id": 1,
  "verification_notes": "All documents reviewed, financials confirmed against tax returns"
}
```

**Response (200):**
```json
{
  "message": "Deal verified and ready for Credit Committee review",
  "deal_id": 5,
  "match_id": 1,
  "verified_by": "Tom Verifier",
  "verified_at": "2024-01-15T15:30:00Z"
}
```

### Update Verification Checklist

```http
PUT /verification/checklist/{deal_id}
```

**Access:** Loan Officers and Lenders only

Update the verification checklist for a deal.

**Request:**
```json
{
  "financials_verified": true,
  "documents_reviewed": true,
  "collateral_verified": false,
  "references_checked": false,
  "verification_notes": "Financials match, waiting on collateral appraisal"
}
```

### Get Verification Status

```http
GET /verification/status/{deal_id}
```

**Access:** Any lender role or admin

Get the current verification status for a deal from this lender's perspective.

**Response (200):**
```json
{
  "status": "in_review",
  "financials_verified": true,
  "documents_reviewed": true,
  "collateral_verified": false,
  "references_checked": false,
  "ready_for_committee": false,
  "verification_notes": "Financials match, waiting on collateral appraisal",
  "flag_count": 2,
  "pending_flag_count": 1,
  "verified_by": null,
  "verified_at": null
}
```

**Status Values:**
- `pending_review` - Not yet reviewed
- `in_review` - Loan officer is reviewing
- `verified` - Verified and ready for Credit Committee
- `flagged` - Has unresolved flags
- `info_requested` - Waiting for borrower info

---

## OpenAPI Documentation

Full interactive documentation available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- OpenAPI JSON: `http://localhost:8000/openapi.json`
