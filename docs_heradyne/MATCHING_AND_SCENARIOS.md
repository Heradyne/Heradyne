# Heradyne Matching Engine & Scenarios

## Overview

The matching engine compares analyzed deals against lender and insurer policies, calculates match scores, generates "approve-if" restructuring scenarios for near-miss deals, and supports automated decisions including counter-offers.

**DISCLAIMER**: All matches and scenarios are informational recommendations only.

---

## Auto-Decision System (NEW)

Lenders and insurers can configure automatic decision rules based on match score thresholds:

### Threshold Configuration

Each policy can define four thresholds (in match score %):

| Threshold | Action | Example |
|-----------|--------|---------|
| Auto-Reject | Automatically reject if score ≤ threshold | ≤30% |
| Counter-Offer Min | Generate counter-offer if score ≥ threshold | ≥50% |
| Counter-Offer Max | Counter-offer if score < auto-accept | <90% |
| Auto-Accept | Automatically accept if score ≥ threshold | ≥90% |

### Score Ranges

```
0%        30%         50%         90%        100%
|----------|-----------|-----------|----------|
  Auto-     Manual      Counter-    Auto-
  Reject    Review      Offer       Accept
```

### Counter-Offer Generation

When a deal falls in the counter-offer range:

1. System analyzes failed constraints
2. Generates proposed modifications to meet policy requirements
3. Creates counter-offer with:
   - Original vs. proposed values
   - Specific adjustments needed
   - Expected new match score
   - 7-day expiration

### Counter-Offer Types

| Failed Constraint | Counter-Offer Action |
|-------------------|---------------------|
| max_loan_size | Propose reduced loan amount |
| min_loan_size | Propose increased loan amount |
| max_term_months | Propose shorter term |
| min_term_months | Propose longer term |

### Borrower Response Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   SYSTEM    │    │  BORROWER   │    │   SYSTEM    │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │
       │ Counter-offer    │                  │
       │ generated        │                  │
       │─────────────────>│                  │
       │                  │                  │
       │                  │ Review offer     │
       │                  │ (7 days)         │
       │                  │                  │
       │    [Accept]      │                  │
       │<─────────────────│                  │
       │                  │                  │
       │ Update deal with │                  │
       │ proposed values  │                  │
       │──────────────────│─────────────────>│
       │                  │                  │
       │                  │    Deal updated, │
       │                  │    Match accepted│
       │                  │                  │
       │    [Reject]      │                  │
       │<─────────────────│                  │
       │                  │                  │
       │ Mark counter-    │                  │
       │ offer rejected   │                  │
```

---

## Matching Process

### Flow

```
1. Get Deal + Latest Risk Report
         │
         ▼
2. Load All Active Policies
         │
    ┌────┴────┐
    ▼         ▼
3a. Match    3b. Match
   Lender       Insurer
   Policies     Policies
    │         │
    └────┬────┘
         │
         ▼
4. Calculate Match Scores
         │
         ▼
5. Generate Scenarios (if near-miss)
         │
         ▼
6. Save Matches to Database
         │
         ▼
7. Update Deal Status → MATCHED
```

---

## Lender Policy Constraints

### Constraint Checks

| Constraint | Logic | Example |
|------------|-------|---------|
| min_loan_size | `loan_amount >= policy.min_loan_size` | Loan $2.5M ≥ min $500K ✓ |
| max_loan_size | `loan_amount <= policy.max_loan_size` | Loan $2.5M ≤ max $5M ✓ |
| min_dscr | `dscr_base >= policy.min_dscr` | DSCR 1.42x ≥ min 1.25x ✓ |
| max_pd | `annual_pd <= policy.max_pd` | PD 3.9% ≤ max 5% ✓ |
| max_leverage | `debt/EBITDA <= policy.max_leverage` | 2.86x ≤ max 4.0x ✓ |
| min_collateral_coverage | `NOLV/loan >= policy.min_collateral` | 64.8% ≥ min 50% ✓ |
| allowed_industries | `deal.industry IN policy.allowed` | manufacturing ∈ [manufacturing, healthcare] ✓ |
| excluded_industries | `deal.industry NOT IN policy.excluded` | manufacturing ∉ [restaurants] ✓ |
| min_term_months | `term >= policy.min_term` | 84 months ≥ min 36 ✓ |
| max_term_months | `term <= policy.max_term` | 84 months ≤ max 120 ✓ |
| allowed_deal_types | `deal.type IN policy.allowed_types` | acquisition ∈ [acquisition, growth] ✓ |

### Constraint Result Structure

```json
{
  "constraint": "min_dscr",
  "required": 1.25,
  "actual": 1.42,
  "met": true,
  "reason": "DSCR 1.42x vs min 1.25x"
}
```

---

## Insurer Policy Constraints

### Additional Calculations

**Expected Loss:**
```
Expected Loss = Annual PD × LGD
Where LGD = 40% (assumed)
```

**Coverage Amount:**
```
Coverage Amount = Loan Amount × Guarantee %
```

### Constraint Checks

| Constraint | Logic |
|------------|-------|
| max_expected_loss | `PD × LGD <= policy.max_el` |
| min_coverage_amount | `coverage >= policy.min_coverage` |
| max_coverage_amount | `coverage <= policy.max_coverage` |
| allowed_industries | Same as lender |
| excluded_industries | Same as lender |
| allowed_deal_types | Same as lender |

---

## Match Score Calculation

```python
match_score = constraints_met / (constraints_met + constraints_failed)
```

### Classification

| Score | Classification |
|-------|----------------|
| 100% | Full Match |
| 50-99% | Near Miss (scenarios generated) |
| < 50% | Poor Match |

---

## Approve-If Scenarios

### Purpose

For near-miss deals (score ≥ 50%), generate restructuring scenarios that would satisfy failed constraints.

### Scenario Types

#### 1. Loan Size Reduction

**Trigger:** `max_loan_size` constraint failed

**Logic:**
```python
if required_reduction <= loan_amount * 0.15:  # Max 15% reduction
    new_amount = policy.max_loan_size
    scenario = {
        "description": f"Reduce loan to ${new_amount:,}",
        "adjustments": {
            "loan_amount": {"from": current, "to": new_amount}
        },
        "feasibility_score": 0.8
    }
```

#### 2. Term Extension

**Trigger:** `min_dscr` constraint failed

**Logic:**
```python
# Longer term = lower monthly payment = higher DSCR
if current_term < 120:  # Max 10 years
    new_term = min(120, estimated_term_for_required_dscr)
    scenario = {
        "description": f"Extend term to {new_term} months",
        "adjustments": {
            "loan_term_months": {"from": current, "to": new_term}
        },
        "feasibility_score": 0.7
    }
```

#### 3. Escrow Increase

**Trigger:** `max_pd` constraint failed

**Logic:**
```python
new_escrow = min(0.07, current_escrow + 0.02)
scenario = {
    "description": f"Increase escrow to {new_escrow:.0%}",
    "adjustments": {
        "escrow_pct": {"from": current, "to": new_escrow}
    },
    "feasibility_score": 0.75
}
```

#### 4. Additional Collateral

**Trigger:** `min_collateral_coverage` constraint failed

**Logic:**
```python
shortfall = (required_coverage - actual_coverage) * loan_amount
scenario = {
    "description": f"Provide ${shortfall:,} additional collateral",
    "adjustments": {
        "additional_collateral_needed": shortfall
    },
    "feasibility_score": 0.5
}
```

#### 5. Term Adjustment

**Trigger:** `min_term_months` or `max_term_months` failed

**Logic:**
```python
scenario = {
    "description": f"Adjust term to {required_term} months",
    "adjustments": {
        "loan_term_months": {"from": current, "to": required}
    },
    "feasibility_score": 0.9
}
```

### Scenario Output Structure

```json
{
  "scenario_id": 1,
  "description": "Reduce loan to $4,500,000 to meet max loan size",
  "adjustments": {
    "loan_amount": {
      "from": 5000000,
      "to": 4500000,
      "change_pct": -0.10
    }
  },
  "new_constraints_met": ["max_loan_size"],
  "constraints_still_failed": ["min_collateral_coverage"],
  "feasibility_score": 0.8
}
```

### Feasibility Scores

| Adjustment Type | Base Score | Rationale |
|-----------------|------------|-----------|
| Term adjustment | 0.9 | Simple contract change |
| Loan reduction (≤10%) | 0.8 | Moderate impact |
| Escrow increase | 0.75 | Acceptable to most borrowers |
| Term extension for DSCR | 0.7 | May affect deal economics |
| Loan reduction (>10%) | 0.6 | Significant impact |
| Additional collateral | 0.5 | May not be available |

---

## Matching API Response

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
      "match_score": 0.875,
      "is_full_match": false,
      "constraints_met": [
        {"constraint": "min_loan_size", "met": true, "reason": "..."},
        {"constraint": "max_loan_size", "met": true, "reason": "..."},
        {"constraint": "min_dscr", "met": true, "reason": "..."},
        {"constraint": "max_pd", "met": true, "reason": "..."},
        {"constraint": "max_leverage", "met": true, "reason": "..."},
        {"constraint": "allowed_industries", "met": true, "reason": "..."},
        {"constraint": "max_term_months", "met": true, "reason": "..."}
      ],
      "constraints_failed": [
        {
          "constraint": "min_collateral_coverage",
          "required": 0.8,
          "actual": 0.648,
          "met": false,
          "reason": "Coverage 64.8% vs min 80.0%"
        }
      ]
    }
  ],
  "insurer_matches": [...],
  "approve_if_scenarios": [
    {
      "scenario_id": 1,
      "description": "Provide $380,000 additional collateral",
      "adjustments": {
        "additional_collateral_needed": 380000
      },
      "new_constraints_met": ["min_collateral_coverage"],
      "constraints_still_failed": [],
      "feasibility_score": 0.5
    }
  ],
  "disclaimer": "INFORMATIONAL ONLY..."
}
```

---

## Decision Workflow

### States

```
PENDING → ACCEPTED
        → REJECTED
        → INFO_REQUESTED
```

### Decision Actions

**Accept:**
- Updates match status to "accepted"
- If lender accepts → Deal status: PENDING_INSURER
- If insurer accepts → Deal status: APPROVED

**Reject:**
- Updates match status to "rejected"
- If all matches rejected → Deal status: REJECTED

**Request Info:**
- Updates match status to "info_requested"
- Borrower receives notification with details of what's needed
- Borrower can upload additional documents
- Match remains in review queue

### Information Request Workflow

The information request feature enables lenders/insurers to request additional documentation or clarification from borrowers:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  LENDER/INSURER │    │    PLATFORM     │    │    BORROWER     │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         │                      │                      │
         │ Click "Request Info" │                      │
         │ + Enter Message      │                      │
         │─────────────────────>│                      │
         │                      │                      │
         │                      │ Update Match Status  │
         │                      │ to "info_requested"  │
         │                      │                      │
         │                      │ Notify Borrower      │
         │                      │─────────────────────>│
         │                      │                      │
         │                      │    See Notification: │
         │                      │    - Dashboard alert │
         │                      │    - Deals list badge│
         │                      │    - Deal detail msg │
         │                      │                      │
         │                      │    Upload Documents  │
         │                      │<─────────────────────│
         │                      │                      │
         │ Review New Documents │                      │
         │<─────────────────────│                      │
         │                      │                      │
         │ Make Final Decision  │                      │
         │─────────────────────>│                      │
         │                      │─────────────────────>│
```

**Borrower Notifications:**

1. **Dashboard**: Prominent amber alert banner showing:
   - Number of pending requests
   - Which deals have requests
   - Actual message from reviewer

2. **Deals List**: 
   - Amber row highlighting
   - Badge with request count next to deal name

3. **Deal Detail Page**:
   - Alert box at top of page
   - Full message from reviewer
   - Highlighted upload button
   - Timeline entry showing "Info requested"

**API Endpoints:**

```http
# Request information (lender/insurer)
PUT /matching/matches/{match_id}/decision
{
  "status": "info_requested",
  "notes": "Please provide last 3 months of bank statements"
}

# Get matches for a deal (borrower can see info requests)
GET /matching/deals/{deal_id}/matches
→ Returns matches including those with status "info_requested"
```

### Audit Trail

Every decision creates an audit log:
```json
{
  "action": "match_accepted",
  "entity_type": "deal_match",
  "entity_id": 1,
  "user_id": 2,
  "details": {
    "deal_id": 1,
    "notes": "Approved with standard terms"
  }
}
```

---

## Document Verification in Matching

When lenders/insurers review matched deals, they see verification status:

### Verification Badges

| Badge | Meaning | Color |
|-------|---------|-------|
| 🛡️ Verified | All values match documents | Green |
| ⚠️ X Flags | Minor discrepancies (5-30%) | Yellow |
| 🚨 X Flags | Critical discrepancies (>30%) | Red |

### Discrepancy Details

Each flag shows:
- **Field**: Which value differs (e.g., "Annual Revenue")
- **Reported**: What borrower entered
- **Extracted**: What document shows
- **Difference %**: Percentage variance
- **Severity**: Low/Medium/High/Critical
- **Source**: Which document the value came from

### Recommended Actions

| Severity | Recommendation |
|----------|----------------|
| Low (<5%) | Acceptable variance, proceed |
| Medium (5-15%) | Note for file, may proceed |
| High (15-30%) | Request clarification |
| Critical (>30%) | Request documentation before proceeding |

---

## Configuration

### Matching Parameters

| Parameter | Location | Default |
|-----------|----------|---------|
| Near-miss threshold | Code | 50% |
| Max scenarios | Code | 3 |
| Max loan reduction | Code | 15% |
| Max term extension | Code | 120 months |
| Assumed LGD | Code | 40% |

### Verification Thresholds

| Severity | Threshold | Configurable |
|----------|-----------|--------------|
| Low | 5-15% | Future |
| Medium | 15-30% | Future |
| High | 30-50% | Future |
| Critical | >50% | Future |

### Future Enhancements

1. **Configurable thresholds** in system_assumptions
2. **Weighted constraint scoring** (some constraints more important)
3. **Multi-constraint scenarios** (combine adjustments)
4. **ML-based scenario optimization**
5. **Lender/insurer preferences** for scenario generation
6. **Email notifications** for info requests
7. **Document comparison history** (track changes across uploads)
