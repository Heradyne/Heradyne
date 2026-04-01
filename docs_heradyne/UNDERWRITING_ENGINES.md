# Heradyne Underwriting Engines

## Overview

Heradyne uses five rules-based underwriting engines to analyze deals. These engines are designed with clear interfaces to allow future ML model integration.

**DISCLAIMER**: All outputs are informational only. Heradyne does not make lending, guarantee, or insurance decisions.

---

## 1. Cash Flow Engine

### Purpose
Normalizes EBITDA and calculates debt service coverage metrics.

### Formulas

**Normalized EBITDA:**
```
Normalized EBITDA = Reported EBITDA + Sum(Qualifying Addbacks)
```

**Annual Debt Service:**
```
Annual Debt Service = Existing Debt Service + New Loan Debt Service

New Loan Debt Service = Loan Amount × PMT Factor
PMT Factor = (r × (1+r)^n) / ((1+r)^n - 1)
Where: r = estimated rate (8%), n = term in years
```

**Post-Debt Free Cash Flow:**
```
Post-Debt FCF = Normalized EBITDA - CapEx - Annual Debt Service
```

**DSCR (Base and Stress):**
```
DSCR Base = Normalized EBITDA / Annual Debt Service
DSCR Stress = Stressed EBITDA / Annual Debt Service
```

### Stress Test Parameters
| Parameter | Default | Description |
|-----------|---------|-------------|
| Revenue Decline | 20% | Revenue reduction in stress scenario |
| Margin Compression | 5% | EBITDA margin reduction |

---

## 2. PD Engine (Probability of Default)

### Purpose
Calculates annual probability of default anchored to SBA charge-off rates.

### Formula
```
Annual PD = SBA Anchor × Industry Multiplier × Leverage Multiplier × Volatility Multiplier
```

### SBA Anchor PD
Default: **3%** (based on historical SBA 7(a) charge-off rates)

### Industry Multipliers
| Industry | Multiplier | Rationale |
|----------|------------|-----------|
| Healthcare | 0.9 | Recession-resistant |
| Professional Services | 0.95 | Stable demand |
| Manufacturing | 1.0 | Baseline |
| Wholesale | 1.1 | Moderate cyclicality |
| Services | 1.1 | Variable |
| Retail | 1.2 | Consumer-dependent |
| Transportation | 1.2 | Cyclical |
| Technology | 1.3 | High variance |
| Construction | 1.4 | Highly cyclical |
| Hospitality | 1.4 | Discretionary spending |
| Restaurants | 1.5 | High failure rate |

### Leverage Multipliers
| Debt/EBITDA | Multiplier |
|-------------|------------|
| ≤ 2.0x | 0.8 |
| ≤ 3.0x | 1.0 |
| ≤ 4.0x | 1.3 |
| ≤ 5.0x | 1.6 |
| > 5.0x | 2.0 |

### Volatility Multipliers
| Category | Multiplier | Industries |
|----------|------------|------------|
| Low | 0.9 | Healthcare, Professional Services |
| Medium | 1.0 | Manufacturing, Retail, Services |
| High | 1.3 | Technology, Restaurants, Hospitality, Construction |

### Example Calculation
```
Deal: Manufacturing company, 3.5x leverage, medium volatility

Annual PD = 0.03 × 1.0 × 1.3 × 1.0
         = 0.039 (3.9%)
```

### PD Bounds
- Minimum: 0.1%
- Maximum: 50%

---

## 3. Valuation Engine

### Purpose
Calculates enterprise value range using industry-specific EV/EBITDA multiples.

### Formula
```
EV = Normalized EBITDA × Industry Multiple
```

### EV/EBITDA Multiples by Industry
| Industry | Low | Mid | High |
|----------|-----|-----|------|
| Restaurants | 2.0x | 3.0x | 4.5x |
| Retail | 2.5x | 3.5x | 5.0x |
| Construction | 2.5x | 3.5x | 5.0x |
| Wholesale | 2.5x | 3.5x | 5.0x |
| Manufacturing | 3.0x | 4.5x | 6.0x |
| Transportation | 3.0x | 4.0x | 5.5x |
| Hospitality | 3.0x | 4.5x | 6.5x |
| Services | 3.5x | 5.0x | 7.0x |
| Healthcare | 4.0x | 6.0x | 9.0x |
| Professional Services | 4.0x | 6.0x | 8.0x |
| Technology | 5.0x | 8.0x | 12.0x |

### Durability Score (0-100)

Assesses business sustainability based on four factors:

**Revenue Size (25 points max)**
| Revenue | Score |
|---------|-------|
| ≥ $10M | 25 |
| ≥ $5M | 20 |
| ≥ $2M | 15 |
| < $2M | 10 |

**EBITDA Margin (25 points max)**
| Margin | Score |
|--------|-------|
| ≥ 20% | 25 |
| ≥ 15% | 20 |
| ≥ 10% | 15 |
| < 10% | 10 |

**Owner Experience (25 points max)**
| Years | Score |
|-------|-------|
| ≥ 10 | 25 |
| ≥ 5 | 20 |
| ≥ 2 | 15 |
| < 2 | 10 |

**Industry Stability (25 points max)**
| Category | Score | Industries |
|----------|-------|------------|
| Stable | 25 | Healthcare, Professional Services, Manufacturing |
| Other | 15 | All others |

---

## 4. Collateral Engine

### Purpose
Calculates Net Orderly Liquidation Value (NOLV) using haircut tables.

### Formula
```
Asset NOLV = Gross Value × (1 - Haircut %)
Total NOLV = Sum of all Asset NOLVs
Collateral Coverage = Total NOLV / Loan Amount
```

### Business Asset Haircuts
| Asset Type | Haircut | NOLV Recovery |
|------------|---------|---------------|
| Accounts Receivable | 20% | 80% |
| Vehicles | 25% | 75% |
| Equipment | 30% | 70% |
| Inventory | 40% | 60% |
| Real Estate | 15% | 85% |
| Intellectual Property | 70% | 30% |
| Goodwill | 100% | 0% |

### Personal Asset Haircuts
| Asset Type | Haircut | NOLV Recovery |
|------------|---------|---------------|
| Cash | 0% | 100% |
| Brokerage Accounts | 10% | 90% |
| Primary Residence | 20% | 80% |
| Investment Property | 25% | 75% |
| Vehicles | 25% | 75% |
| Retirement Accounts | 30% | 70% |

### Example Calculation
```
Business Assets:
  Equipment: $800,000 × (1 - 0.30) = $560,000
  A/R: $600,000 × (1 - 0.20) = $480,000
  Business NOLV: $1,040,000

Personal Assets:
  Residence: $500,000 × (1 - 0.20) = $400,000
  Brokerage: $200,000 × (1 - 0.10) = $180,000
  Personal NOLV: $580,000

Total NOLV: $1,620,000
Loan Amount: $2,500,000
Collateral Coverage: 64.8%
```

---

## 5. Structuring Engine

### Purpose
Recommends guarantee percentage, escrow percentage, and alignment requirements.

### Guarantee Percentage (50-70%)

**Base:** 60%

**PD Adjustments:**
| PD Range | Adjustment |
|----------|------------|
| > 6% | +5% |
| > 4% | +2% |
| < 2% | -3% |

**DSCR Adjustments:**
| DSCR Range | Adjustment |
|------------|------------|
| < 1.10 | +5% |
| < 1.25 | +2% |
| > 1.50 | -3% |

### Escrow Percentage (3-7%)

**Base:** 5%

**Collateral Coverage Adjustments:**
| Coverage | Adjustment |
|----------|------------|
| < 50% | +2% |
| > 100% | -1% |

### Alignment Requirements

Automatically determined based on loan size:

| Requirement | Threshold |
|-------------|-----------|
| Personal Guarantee | Always |
| Monthly Reporting | Always |
| Key Person Life Insurance | Loan > $1M |
| Annual Audit | Loan > $2M |
| Board Seat | Loan > $5M |

### Financial Covenants
- Minimum DSCR: 1.15x
- Maximum Leverage: 4.5x

---

## Configuration

All engine parameters are stored in the `system_assumptions` table and can be modified by admins without code changes.

### Categories
- `pd_engine`: SBA anchor, industry/leverage/volatility multipliers
- `valuation_engine`: EV multiples by industry
- `collateral_engine`: Business and personal asset haircuts
- `structuring_engine`: Guarantee and escrow bands
- `cashflow_engine`: Stress test parameters
- `fees`: Borrower fee cap (2%)

---

## Future ML Integration Points

Each engine has a clear interface that can be replaced with ML models:

```python
# Current: Rules-based
class PDEngine:
    def analyze(self, deal, normalized_ebitda) -> PDResult:
        # Rules-based calculation
        ...

# Future: ML model
class PDEngineML(PDEngine):
    def analyze(self, deal, normalized_ebitda) -> PDResult:
        features = self.extract_features(deal)
        pd = self.model.predict(features)
        return PDResult(annual_pd=pd, ...)
```

### Recommended ML Enhancements
1. **PD Model**: Train on historical default data
2. **Valuation Model**: Comparable transactions ML
3. **Cash Flow Forecasting**: Time series prediction
4. **Document Extraction**: NLP for financial statements

---

## Audit Trail

All engine outputs are stored in `deal_risk_reports` with:
- Version number (increments on re-analysis)
- All calculated metrics
- Full `report_data` JSON with intermediate values
- Timestamp and audit log entry
