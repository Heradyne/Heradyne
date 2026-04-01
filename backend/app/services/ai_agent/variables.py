"""
Heradyne AI Agent - Variable Definitions
62 underwriting variables + 18 monitoring variables
"""
from enum import Enum
from typing import Dict, List, Optional, Any
from dataclasses import dataclass


class VariableCategory(str, Enum):
    STRUCTURAL = "structural"
    GEOGRAPHIC = "geographic"
    FINANCIAL = "financial"
    OPERATOR = "operator"
    ASSET = "asset"
    MONITORING = "monitoring"


class Weight(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


@dataclass
class Variable:
    id: str
    name: str
    category: VariableCategory
    weight: Weight
    optimal_range: str
    caution_range: str
    reject_threshold: Optional[str]
    description: str
    max_points: float
    phase: str = "mvp"


# STRUCTURAL VARIABLES (11) - 25% weight
STRUCTURAL_VARIABLES: List[Variable] = [
    Variable("loan_size", "Loan Size", VariableCategory.STRUCTURAL, Weight.CRITICAL, ">$500K", "$350K-$500K", "<$500K", "Sub-$150K defaults 10× rate of >$2M", 3.0),
    Variable("loan_purpose", "Loan Purpose", VariableCategory.STRUCTURAL, Weight.HIGH, "Change of Ownership", "Working capital", None, "Acquisitions default 40% less", 2.5),
    Variable("naics_industry", "NAICS Industry Code", VariableCategory.STRUCTURAL, Weight.HIGH, "Tier 1 sector", "Tier 2-3", "Tier 4", "5× spread across industries", 2.5),
    Variable("business_age", "Target Business Age", VariableCategory.STRUCTURAL, Weight.HIGH, ">10 years", "3-10 years", "<3 years", "13.6% risk reduction/year", 2.0),
    Variable("loan_term", "Loan Term", VariableCategory.STRUCTURAL, Weight.MEDIUM, "10-25 years", "<10 years", None, "10+ yr: 4% vs <10yr: 20%", 1.5),
    Variable("equity_injection", "Down Payment / Equity", VariableCategory.STRUCTURAL, Weight.HIGH, "≥20%", "10-20%", "<10%", "18% reduction per 5% above min", 2.5),
    Variable("sba_guarantee_pct", "SBA Guarantee %", VariableCategory.STRUCTURAL, Weight.MEDIUM, "75% standard", "50% Express", None, "Express higher default", 1.0),
    Variable("purchase_multiple_sde", "Purchase Multiple (SDE)", VariableCategory.STRUCTURAL, Weight.HIGH, "≤3.0×", "3.0-4.5×", ">4.5×", "Valuation risk", 2.0),
    Variable("purchase_multiple_ebitda", "Purchase Multiple (EBITDA)", VariableCategory.STRUCTURAL, Weight.HIGH, "≤4.0×", "4.0-6.0×", ">6.0×", "Flag aggressive multiples", 2.0),
    Variable("seller_note", "Seller Note / Earnout", VariableCategory.STRUCTURAL, Weight.MEDIUM, "≥10%", "<10%", None, "Seller conviction signal", 1.5),
    Variable("seller_transition", "Seller Transition Period", VariableCategory.STRUCTURAL, Weight.MEDIUM, "6-12 months", "<6 months", "No plan", "#1 acquisition risk", 1.5),
]

# GEOGRAPHIC VARIABLES (11) - 15% weight
GEOGRAPHIC_VARIABLES: List[Variable] = [
    Variable("county_default_rate", "County Default Rate", VariableCategory.GEOGRAPHIC, Weight.HIGH, "<1.9%", "1.9-4.2%", ">4.2%", "Miami-Dade 9.55% vs 0%", 2.0),
    Variable("fema_flood_zone", "FEMA Flood Zone", VariableCategory.GEOGRAPHIC, Weight.MEDIUM, "Zone X", "Zone B/C", "Zone A/V", "Flood risk", 1.5),
    Variable("fema_disaster_history", "FEMA Disaster History (5yr)", VariableCategory.GEOGRAPHIC, Weight.MEDIUM, "<2 declarations", "2-3", "≥4", "Recent disasters", 1.0),
    Variable("wildfire_risk", "Wildfire Risk Score", VariableCategory.GEOGRAPHIC, Weight.LOW, "Low/Moderate", "High", "Extreme", "Fire risk", 1.0),
    Variable("hurricane_exposure", "Hurricane/Wind Exposure", VariableCategory.GEOGRAPHIC, Weight.MEDIUM, "Inland", "Moderate coastal", "High coastal", "Wind risk", 1.0),
    Variable("earthquake_zone", "Earthquake Zone", VariableCategory.GEOGRAPHIC, Weight.LOW, "Low seismicity", "Moderate", "High (CA, PNW)", "Seismic risk", 0.5),
    Variable("climate_risk_index", "Climate Risk Index", VariableCategory.GEOGRAPHIC, Weight.MEDIUM, "Low", "Moderate", "High", "Aggregate risk", 1.5),
    Variable("market_saturation", "Local Market Saturation", VariableCategory.GEOGRAPHIC, Weight.MEDIUM, "Low density", "Moderate", "Oversaturated", "Competition", 1.0, "phase2"),
    Variable("local_economic_health", "Local Economic Health", VariableCategory.GEOGRAPHIC, Weight.MEDIUM, "Growing", "Average", "Declining", "Employment+pop trends", 1.5),
    Variable("urban_rural", "Urban vs Rural", VariableCategory.GEOGRAPHIC, Weight.LOW, "Context-dependent", "Very rural", None, "Informational", 0.5),
    Variable("state_regulatory", "State Regulatory Burden", VariableCategory.GEOGRAPHIC, Weight.LOW, "Business-friendly", "Moderate", "Heavy", "Regulatory risk", 0.5),
]

# FINANCIAL VARIABLES (14) - 30% weight
FINANCIAL_VARIABLES: List[Variable] = [
    Variable("dscr", "Debt Service Coverage (DSCR)", VariableCategory.FINANCIAL, Weight.CRITICAL, "≥1.50×", "1.20-1.49×", "<1.20×", "#1 financial metric", 5.0),
    Variable("revenue_trend_3yr", "Revenue Trend (3-Year)", VariableCategory.FINANCIAL, Weight.HIGH, "Growing ≥5%/yr", "Flat ±2%", "Declining >5%", "Business trajectory", 2.0),
    Variable("revenue_trend_12mo", "Revenue Trend (12-Month)", VariableCategory.FINANCIAL, Weight.HIGH, "Stable/growing", "Seasonal dip", "Declining", "Current momentum", 2.0),
    Variable("gross_margin", "Gross Margin", VariableCategory.FINANCIAL, Weight.MEDIUM, "≥40%", "25-39%", "<25%", "Pricing power", 1.5),
    Variable("ebitda_margin", "EBITDA Margin", VariableCategory.FINANCIAL, Weight.MEDIUM, "≥15%", "8-14%", "<8%", "Operating efficiency", 1.5),
    Variable("owner_compensation", "Owner Compensation (SDE)", VariableCategory.FINANCIAL, Weight.MEDIUM, "Sustainable", "Aggressive adds", "Negative", "Earnings quality", 1.5),
    Variable("working_capital", "Working Capital", VariableCategory.FINANCIAL, Weight.MEDIUM, "≥3 months OpEx", "1-3 months", "Negative", "Liquidity buffer", 1.5),
    Variable("borrower_credit_score", "Borrower Credit Score", VariableCategory.FINANCIAL, Weight.HIGH, "≥720", "660-719", "<660", "Personal credit", 2.5),
    Variable("borrower_dti", "Borrower Debt-to-Income", VariableCategory.FINANCIAL, Weight.MEDIUM, "<35%", "35-45%", ">45%", "Owner leverage", 1.5),
    Variable("customer_concentration", "Customer Concentration", VariableCategory.FINANCIAL, Weight.HIGH, "No client >10%", "10-25%", ">25%", "Single point failure", 2.0),
    Variable("ar_aging", "A/R Aging Quality", VariableCategory.FINANCIAL, Weight.LOW, ">90% current", "70-90%", "<70%", "Collection quality", 1.0),
    Variable("total_debt_load", "Total Debt Load (All)", VariableCategory.FINANCIAL, Weight.MEDIUM, "DSCR ≥1.25×", "1.10-1.24×", "<1.10×", "All obligations", 1.5),
    Variable("revenue_seasonality", "Revenue Seasonality", VariableCategory.FINANCIAL, Weight.LOW, "<20% var", "20-40%", ">40%", "Seasonal risk", 1.0),
    Variable("cash_reserves_closing", "Cash Reserves at Closing", VariableCategory.FINANCIAL, Weight.MEDIUM, "≥6 months", "3-6 months", "<3 months", "Deal fragility", 1.5),
]

# OPERATOR VARIABLES (12) - 15% weight
OPERATOR_VARIABLES: List[Variable] = [
    Variable("buyer_industry_exp", "Buyer Industry Experience", VariableCategory.OPERATOR, Weight.HIGH, "10+ years", "3-10 years", "<3 years", "53% better outcomes", 2.0),
    Variable("buyer_management_exp", "Buyer Management Experience", VariableCategory.OPERATOR, Weight.HIGH, "Prior owner/C-suite", "Management", "First-time", "P&L experience", 2.0),
    Variable("buyer_education", "Buyer Education", VariableCategory.OPERATOR, Weight.LOW, "Relevant degree+certs", "General", "None", "Bonus factor", 0.5),
    Variable("seller_tenure", "Seller Tenure", VariableCategory.OPERATOR, Weight.MEDIUM, "10+ years", "5-10 years", "<3 years", "Why selling?", 1.0),
    Variable("employee_count", "Number of Employees", VariableCategory.OPERATOR, Weight.MEDIUM, "5-50", "<3 or >100", None, "Complexity/key-person", 1.0),
    Variable("key_employee_dependency", "Key Employee Dependency", VariableCategory.OPERATOR, Weight.HIGH, "No single >20%", "20-30%", ">30%", "Fragility risk", 1.5),
    Variable("key_employee_retention", "Key Employee Retention", VariableCategory.OPERATOR, Weight.MEDIUM, "Signed agreements", "Verbal", "None", "Retention plan", 1.0),
    Variable("employee_turnover", "Employee Turnover", VariableCategory.OPERATOR, Weight.MEDIUM, "<15%", "15-30%", ">30%", "Culture signal", 1.0),
    Variable("owner_burn_rate", "Owner Personal Burn Rate", VariableCategory.OPERATOR, Weight.LOW, "Low fixed costs", "Moderate", "High", "Cash extraction", 0.5),
    Variable("ownership_structure", "Ownership Structure", VariableCategory.OPERATOR, Weight.LOW, "Single/clear majority", "Multiple clear", "50/50 split", "Governance", 0.5),
    Variable("buyer_reserves", "Buyer Personal Reserves", VariableCategory.OPERATOR, Weight.MEDIUM, "6+ months", "3-6 months", "<3 months", "Safety net", 1.0),
    Variable("buyer_commitment", "Buyer Commitment (Full-Time)", VariableCategory.OPERATOR, Weight.HIGH, "Full-time operator", "Transitioning", "Absentee", "Attention", 1.5),
]

# ASSET VARIABLES (14) - 15% weight
ASSET_VARIABLES: List[Variable] = [
    Variable("tangible_assets", "Total Tangible Assets", VariableCategory.ASSET, Weight.HIGH, "≥75% of loan", "40-75%", "<40%", "Asset coverage", 2.0),
    Variable("real_estate_owned", "Real Estate Owned", VariableCategory.ASSET, Weight.MEDIUM, "Business owns RE", "Favorable lease", "Leased only", "Hard collateral", 1.5),
    Variable("equipment_value", "Equipment & FF&E Value", VariableCategory.ASSET, Weight.MEDIUM, "Modern/marketable", "Average", "Specialized", "Liquidation value", 1.5),
    Variable("inventory_quality", "Inventory Quality", VariableCategory.ASSET, Weight.LOW, "Low perishability", "Moderate", "Perishable", "Turnover/shelf life", 0.5),
    Variable("ip_brand", "IP / Brand", VariableCategory.ASSET, Weight.LOW, "Regional brand", "Some presence", "Generic", "Resale premium", 0.5),
    Variable("personal_guarantee", "Personal Guarantee", VariableCategory.ASSET, Weight.MEDIUM, "Full PG ≥$500K NW", "Moderate NW", "Limited/low", "Guarantor strength", 1.5),
    Variable("lease_terms", "Lease Terms", VariableCategory.ASSET, Weight.MEDIUM, "5+ years favorable", "2-5 years", "<2 years", "Displacement risk", 1.5),
    Variable("business_insurance", "Business Insurance", VariableCategory.ASSET, Weight.MEDIUM, "Full BOP+liability", "Basic", "Gaps", "Coverage", 1.0),
    Variable("franchise_license", "Franchise/License Status", VariableCategory.ASSET, Weight.MEDIUM, "Good standing", "Minor issues", "Disputes", "License risk", 1.0),
    Variable("customer_durability", "Customer Base Durability", VariableCategory.ASSET, Weight.MEDIUM, "Recurring/contracts", "Mixed", "Walk-in only", "CF predictability", 1.5),
    Variable("competitor_concentration", "Competitor Concentration", VariableCategory.ASSET, Weight.MEDIUM, "Differentiated", "Moderate", "Saturated", "Margin pressure", 1.0, "phase2"),
    Variable("supplier_concentration", "Supplier Concentration", VariableCategory.ASSET, Weight.LOW, "Multiple suppliers", "2-3 key", "Single critical", "Supply risk", 0.5),
    Variable("online_presence", "Online Presence", VariableCategory.ASSET, Weight.LOW, "≥4.0 stars", "3.5-4.0", "<3.5", "Customer satisfaction", 0.5, "phase2"),
    Variable("revenue_diversity", "Revenue Diversity", VariableCategory.ASSET, Weight.LOW, "Multiple streams", "2-3 lines", "Single", "Resilience", 0.5),
]

# MONITORING VARIABLES (18) - Post-policy early warning
MONITORING_VARIABLES: List[Variable] = [
    Variable("mon_revenue_vs_projection", "Revenue vs. Projection", VariableCategory.MONITORING, Weight.HIGH, "On plan", "5-15% below", "≥15% below 2mo", "6-12mo lead", 0, "phase2"),
    Variable("mon_dscr_rolling", "DSCR (Rolling 12-Month)", VariableCategory.MONITORING, Weight.CRITICAL, "≥1.35×", "1.20-1.35×", "<1.20×", "6-9mo lead", 0, "phase2"),
    Variable("mon_bank_balance", "Bank Balance Trend", VariableCategory.MONITORING, Weight.MEDIUM, "Stable/growing", "2 weeks decline", "3+ weeks decline", "3-6mo lead", 0, "phase2"),
    Variable("mon_sba_payment_status", "SBA Loan Payment Status", VariableCategory.MONITORING, Weight.CRITICAL, "Current", "10-30 days late", "Missed", "0-3mo lead", 0),
    Variable("mon_all_debt_timeliness", "All-Debt Payment", VariableCategory.MONITORING, Weight.HIGH, "All current", "1-29 days late", ">30 days late", "3-6mo lead", 0, "phase2"),
    Variable("mon_tax_deposits", "Tax Deposit Regularity", VariableCategory.MONITORING, Weight.MEDIUM, "Regular", "Irregular", "Missed quarterly", "3-9mo lead", 0, "phase2"),
    Variable("mon_payroll_consistency", "Payroll Consistency", VariableCategory.MONITORING, Weight.HIGH, "On-time", "1 delay", "Missed/delayed", "3-6mo lead", 0, "phase2"),
    Variable("mon_employee_count", "Employee Count Change", VariableCategory.MONITORING, Weight.HIGH, "Stable/growing", "10-20% decline", ">20% decline", "3-6mo lead", 0, "phase2"),
    Variable("mon_seasonal_deviation", "Seasonal Pattern Deviation", VariableCategory.MONITORING, Weight.MEDIUM, "Within range", "10-20% below", ">20% below PY", "6-12mo lead", 0, "phase2"),
    Variable("mon_customer_concentration", "Customer Concentration Shift", VariableCategory.MONITORING, Weight.MEDIUM, "Top <20%", "Top 20-30%", "Top >30%", "6-12mo lead", 0, "phase2"),
    Variable("mon_owner_draws", "Owner Draw Changes", VariableCategory.MONITORING, Weight.MEDIUM, "Stable", "Up 10-20%", "Up >20% + flat rev", "3-6mo lead", 0, "phase2"),
    Variable("mon_new_liens", "New Liens or Judgments", VariableCategory.MONITORING, Weight.HIGH, "No new liens", None, "Any new lien", "1-3mo lead", 0, "phase2"),
    Variable("mon_insurance_lapse", "Insurance Lapse", VariableCategory.MONITORING, Weight.CRITICAL, "All active", None, "Coverage lapsed", "Immediate", 0),
    Variable("mon_key_personnel", "Key Personnel Change", VariableCategory.MONITORING, Weight.HIGH, "Team intact", "Supporting left", "Key person left", "3-6mo lead", 0, "phase2"),
    Variable("mon_online_reviews", "Online Review Trend", VariableCategory.MONITORING, Weight.LOW, "Stable/improving", "0.3-0.5 drop", ">0.5 star drop", "6-12mo lead", 0, "phase2"),
    Variable("mon_local_economy", "Local Economic Deterioration", VariableCategory.MONITORING, Weight.LOW, "Stable", "+1-2% unemployment", "+2% in 6mo", "6-12mo lead", 0),
    Variable("mon_natural_disaster", "Natural Disaster Event", VariableCategory.MONITORING, Weight.HIGH, "No disasters", None, "Declaration 25mi", "Immediate", 0),
    Variable("mon_competitor_entry", "Competitor Entry/Market Shift", VariableCategory.MONITORING, Weight.LOW, "Stable market", "New competitor", "Major competitor", "12+mo lead", 0, "phase2"),
]


# INDUSTRY RISK TIERS
INDUSTRY_RISK_TIERS = {
    "tier_1": {"naics_prefixes": ["62", "54", "31", "32", "33"], "default_rate_range": (0.012, 0.020), "description": "Health Care, Prof Services, Manufacturing"},
    "tier_2": {"naics_prefixes": ["52", "53", "51"], "default_rate_range": (0.020, 0.030), "description": "Finance, Real Estate, Information"},
    "tier_3": {"naics_prefixes": ["44", "45", "72", "81"], "default_rate_range": (0.030, 0.045), "description": "Retail, Accommodation, Other Services"},
    "tier_4": {"naics_prefixes": ["48", "49", "71", "11"], "default_rate_range": (0.045, 0.060), "description": "Transportation, Arts, Agriculture"},
}


# RISK TIER THRESHOLDS
RISK_TIERS = {
    "preferred": {"score_range": (80, 100), "premium_range": (0.0200, 0.0225), "expected_default": 0.003, "monitoring_frequency": "quarterly", "decision": "auto_approve", "portfolio_target": (0.25, 0.35)},
    "standard": {"score_range": (60, 79), "premium_range": (0.0250, 0.0250), "expected_default": 0.0075, "monitoring_frequency": "quarterly", "decision": "auto_approve", "portfolio_target": (0.35, 0.45)},
    "elevated": {"score_range": (40, 59), "premium_range": (0.0275, 0.0300), "expected_default": 0.015, "monitoring_frequency": "monthly", "decision": "manual_review", "portfolio_target": (0.15, 0.20)},
    "high_risk": {"score_range": (20, 39), "premium_range": (0.0300, 0.0350), "expected_default": 0.030, "monitoring_frequency": "monthly", "decision": "exception_only", "portfolio_target": (0.05, 0.10)},
    "decline": {"score_range": (0, 19), "premium_range": None, "expected_default": 0.03, "monitoring_frequency": None, "decision": "auto_decline", "portfolio_target": (0.05, 0.10)},
}


# CATEGORY WEIGHTS
CATEGORY_WEIGHTS = {
    VariableCategory.STRUCTURAL: 0.25,
    VariableCategory.GEOGRAPHIC: 0.15,
    VariableCategory.FINANCIAL: 0.30,
    VariableCategory.OPERATOR: 0.15,
    VariableCategory.ASSET: 0.15,
}


def get_all_underwriting_variables() -> List[Variable]:
    return STRUCTURAL_VARIABLES + GEOGRAPHIC_VARIABLES + FINANCIAL_VARIABLES + OPERATOR_VARIABLES + ASSET_VARIABLES


def get_category_max_points() -> Dict[VariableCategory, float]:
    result = {}
    for cat in [VariableCategory.STRUCTURAL, VariableCategory.GEOGRAPHIC, VariableCategory.FINANCIAL, VariableCategory.OPERATOR, VariableCategory.ASSET]:
        variables = [v for v in get_all_underwriting_variables() if v.category == cat]
        result[cat] = sum(v.max_points for v in variables)
    return result
