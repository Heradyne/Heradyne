"""
Actuarial Pricing API Endpoints

"Actuary-in-a-Box" for insurers:
- Deal-level pricing with decision guidance
- Cohort analysis and credibility
- Structure optimization
- Portfolio metrics
"""

from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User, UserRole
from app.models.deal import Deal, DealRiskReport
from app.services.claude_ai import claude_actuarial_price  # AI-powered
from app.services.actuarial_pricing import (
    ActuarialPricingEngine, 
    PricingResult, 
    StructureScenario,
    PortfolioMetrics,
    RiskDecision,
    DataSufficiency,
)

router = APIRouter()


class CollateralItem(BaseModel):
    """Individual collateral asset"""
    asset_type: str = Field(..., description="Type: real_estate, equipment, inventory, receivables, vehicles, other")
    description: str = Field("", description="Asset description")
    estimated_value: float = Field(..., description="Estimated market value")
    liquidation_value: Optional[float] = Field(None, description="Forced sale value (typically 50-80% of market)")


class SubmissionRequest(BaseModel):
    """Loan submission for pricing"""
    loan_amount: float = Field(..., description="Loan amount in dollars")
    naics_code: str = Field(..., description="NAICS industry code")
    state: str = Field("US", description="State/geography")
    vintage_year: int = Field(2024, description="Origination year")
    term_months: int = Field(120, description="Loan term in months")
    dscr: float = Field(..., description="Debt service coverage ratio")
    credit_score: int = Field(..., description="Borrower credit score")
    collateral_type: str = Field("mixed", description="Primary collateral type")
    sba_guaranty_pct: float = Field(0.75, description="SBA guarantee percentage")
    equity_injection_pct: float = Field(0.10, description="Equity injection percentage")
    business_age_years: int = Field(5, description="Years in business")
    lender_id: Optional[int] = None
    
    # NEW: Collateral details
    collateral_items: Optional[List[CollateralItem]] = Field(None, description="Itemized collateral assets")
    total_collateral_value: Optional[float] = Field(None, description="Total collateral market value")
    
    # NEW: Borrower's premium budget
    max_monthly_premium: Optional[float] = Field(None, description="Maximum monthly premium borrower is willing to pay")
    target_monthly_premium: Optional[float] = Field(None, description="Borrower's target/preferred monthly premium")


class PolicyTermsRequest(BaseModel):
    """Policy structure terms"""
    attachment_point: float = Field(0, description="First loss percentage")
    limit: Optional[float] = Field(None, description="Coverage limit")
    coinsurance: float = Field(1.0, description="Coinsurance percentage")
    waiting_period_days: int = Field(90, description="Waiting period")


class PricingResponse(BaseModel):
    """Complete pricing response"""
    # Core pricing
    pure_premium: float
    risk_load: float
    expense_load: float
    profit_margin: float
    indicated_rate: float
    indicated_rate_low: float
    indicated_rate_high: float
    pricing_floor: float
    
    # As dollar amounts for this loan
    annual_premium_dollars: float
    monthly_premium_dollars: float
    expected_loss_dollars: float
    
    # Collateral analysis
    collateral_value: float
    collateral_coverage_ratio: float  # Collateral / Loan Amount
    collateral_adjusted_lgd: float  # LGD after collateral recovery
    collateral_discount: float  # Premium discount from collateral
    
    # Premium budget analysis
    budget_monthly_premium: Optional[float]  # What borrower wants to pay
    budget_feasible: bool  # Can we meet the budget?
    budget_gap: Optional[float]  # Difference between indicated and budget
    budget_adjusted_coverage: Optional[float]  # Coverage level to meet budget
    
    # Data quality
    data_sufficiency: str
    credibility_factor: float
    cohort_loan_count: int
    cohort_name: str
    
    # Risk metrics
    expected_loss_ratio: float
    default_probability: float
    loss_given_default: float
    pml_99: float
    tvar_99: float
    capital_required: float
    
    # Decision
    decision: str
    decision_rationale: str
    required_conditions: List[str]
    
    # Loss drivers
    loss_drivers: List[Dict[str, Any]]
    
    # Audit
    model_version: str
    dataset_version: str
    assumptions: Dict[str, Any]
    calculated_at: str


class StructureScenarioRequest(BaseModel):
    """Structure scenario for what-if analysis"""
    attachment_point: float = 0
    limit: Optional[float] = None
    coinsurance: float = 1.0


class CohortAnalysisRequest(BaseModel):
    """Cohort filter request"""
    naics_prefix: Optional[str] = None
    state: Optional[str] = None
    vintage_start: Optional[int] = None
    vintage_end: Optional[int] = None
    loan_size_min: Optional[float] = None
    loan_size_max: Optional[float] = None
    term_bucket: Optional[str] = None


class PricingRequest(BaseModel):
    """Combined pricing request"""
    submission: SubmissionRequest
    policy_terms: PolicyTermsRequest


def require_insurer(current_user: User):
    """Verify user is an insurer or admin"""
    if current_user.role not in [UserRole.INSURER, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Insurer access required")
    return current_user


@router.post("/price", response_model=PricingResponse)
async def price_submission(
    request: PricingRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Price a loan submission with full actuarial analysis.
    
    Returns:
    - Indicated premium rate with confidence band
    - Decision (accept/decline/refer) with rationale
    - Loss drivers ranked by impact
    - Comparable cohort statistics
    - Capital and PML metrics
    """
    require_insurer(current_user)
    
    submission = request.submission
    policy_terms = request.policy_terms
    
    engine = ActuarialPricingEngine()
    
    # Build submission dict
    submission_dict = submission.dict()
    policy_dict = policy_terms.dict()
    
    # Set limit if not provided
    if policy_dict.get("limit") is None:
        policy_dict["limit"] = submission_dict["loan_amount"] * 0.75
    
    result = engine.price_submission(submission_dict, policy_dict)
    
    # Calculate dollar amounts
    insured_exposure = min(
        submission.loan_amount - policy_terms.attachment_point,
        policy_dict["limit"]
    ) * policy_terms.coinsurance
    
    annual_premium = result.indicated_rate * insured_exposure
    monthly_premium = annual_premium / 12
    expected_loss = result.pure_premium * insured_exposure
    
    return PricingResponse(
        pure_premium=result.pure_premium,
        risk_load=result.risk_load,
        expense_load=result.expense_load,
        profit_margin=result.profit_margin,
        indicated_rate=result.indicated_rate,
        indicated_rate_low=result.indicated_rate_low,
        indicated_rate_high=result.indicated_rate_high,
        pricing_floor=result.pricing_floor,
        annual_premium_dollars=annual_premium,
        monthly_premium_dollars=monthly_premium,
        expected_loss_dollars=expected_loss,
        collateral_value=result.collateral_value,
        collateral_coverage_ratio=result.collateral_coverage_ratio,
        collateral_adjusted_lgd=result.collateral_adjusted_lgd,
        collateral_discount=result.collateral_discount,
        budget_monthly_premium=result.budget_monthly_premium,
        budget_feasible=result.budget_feasible,
        budget_gap=result.budget_gap,
        budget_adjusted_coverage=result.budget_adjusted_coverage,
        data_sufficiency=result.data_sufficiency.value,
        credibility_factor=result.credibility_factor,
        cohort_loan_count=result.cohort_loan_count,
        cohort_name=result.cohort_match.cohort_name,
        expected_loss_ratio=result.expected_loss_ratio,
        default_probability=result.default_probability,
        loss_given_default=result.loss_given_default,
        pml_99=result.pml_99,
        tvar_99=result.tvar_99,
        capital_required=result.capital_required,
        decision=result.decision.value,
        decision_rationale=result.decision_rationale,
        required_conditions=result.required_conditions,
        loss_drivers=[
            {
                "factor": d.factor,
                "impact": d.impact,
                "description": d.description,
                "vs_benchmark": d.vs_benchmark,
            }
            for d in result.loss_drivers
        ],
        model_version=result.model_version,
        dataset_version=result.dataset_version,
        assumptions=result.assumptions,
        calculated_at=result.calculated_at,
    )


@router.post("/price/deal/{deal_id}", response_model=PricingResponse)
async def price_deal(
    deal_id: int,
    policy_terms: PolicyTermsRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Price an existing deal from the database"""
    require_insurer(current_user)
    
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    # Get risk report for DSCR
    risk_report = db.query(DealRiskReport).filter(
        DealRiskReport.deal_id == deal_id
    ).order_by(DealRiskReport.version.desc()).first()
    
    # Build submission from deal
    submission = SubmissionRequest(
        loan_amount=deal.loan_amount_requested,
        naics_code=deal.industry or "99",
        dscr=risk_report.dscr_base if risk_report else 1.25,
        credit_score=deal.owner_credit_score or 700,
        business_age_years=deal.owner_experience_years or 5,
        equity_injection_pct=(deal.equity_injection / deal.purchase_price) if deal.purchase_price and deal.equity_injection else 0.10,
    )
    
    # Create combined request
    request = PricingRequest(submission=submission, policy_terms=policy_terms)
    return await price_submission(request, current_user, db)


class StructureOptimizerRequest(BaseModel):
    """Combined structure optimizer request"""
    submission: SubmissionRequest
    policy_terms: PolicyTermsRequest = PolicyTermsRequest()
    scenarios: List[StructureScenarioRequest]


@router.post("/structure-optimizer")
async def optimize_structure(
    request: StructureOptimizerRequest,
    current_user: User = Depends(get_current_active_user),
):
    """
    Run what-if scenarios for different policy structures.
    
    Compare attachment points, limits, and coinsurance options.
    Returns indicated rate, expected loss, PML, and ROI for each scenario.
    """
    require_insurer(current_user)
    
    engine = ActuarialPricingEngine()
    submission_dict = request.submission.dict()
    
    # Convert scenarios
    scenario_dicts = []
    for s in request.scenarios:
        scenario_dict = s.dict()
        if scenario_dict.get("limit") is None:
            scenario_dict["limit"] = request.submission.loan_amount * 0.75
        scenario_dicts.append(scenario_dict)
    
    results = engine.run_structure_scenarios(submission_dict, scenario_dicts)
    
    return {
        "submission": request.submission.dict(),
        "scenarios": [
            {
                "attachment_point": r.attachment_point,
                "limit": r.limit,
                "coinsurance": r.coinsurance,
                "expected_loss_rate": r.expected_loss,
                "pml_99": r.pml_99,
                "indicated_rate": r.indicated_rate,
                "capital_load": r.capital_load,
                "roi": r.roi,
                "premium_dollars": r.indicated_rate * r.limit * r.coinsurance,
            }
            for r in results
        ],
    }


@router.get("/cohort-analysis")
async def get_cohort_analysis(
    naics_prefix: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    vintage_start: Optional[int] = Query(None),
    vintage_end: Optional[int] = Query(None),
    loan_size_bucket: Optional[str] = Query(None),
    current_user: User = Depends(get_current_active_user),
):
    """
    Get cohort analysis with loss triangles and rate indications.
    
    This is the "Actuarial Workbench" data view.
    """
    require_insurer(current_user)
    
    # In production, this queries the actual loan database
    # Here we return simulated cohort data
    
    from app.services.actuarial_pricing import NAICS_DEFAULT_RATES
    
    # Build cohort based on filters
    base_rate = 0.025
    if naics_prefix and naics_prefix in NAICS_DEFAULT_RATES:
        base_rate = NAICS_DEFAULT_RATES[naics_prefix]
    
    # Simulate cohort stats
    import random
    loan_count = random.randint(150, 500)
    
    # Loss triangle (simplified)
    development_months = [12, 24, 36, 48, 60]
    cumulative_defaults = [0.3, 0.55, 0.75, 0.88, 0.95]  # % of ultimate
    
    loss_triangle = []
    for i, month in enumerate(development_months):
        loss_triangle.append({
            "development_month": month,
            "cumulative_default_pct": base_rate * cumulative_defaults[i],
            "incremental_default_pct": base_rate * (cumulative_defaults[i] - (cumulative_defaults[i-1] if i > 0 else 0)),
        })
    
    # Rate indications by segment
    rate_indications = []
    for naics, rate in list(NAICS_DEFAULT_RATES.items())[:10]:
        lgd = 0.42
        pure_premium = rate * lgd
        indicated_rate = pure_premium * 1.8  # Rough load
        
        rate_indications.append({
            "naics_prefix": naics,
            "loan_count": random.randint(50, 300),
            "default_rate": rate,
            "lgd": lgd,
            "pure_premium": pure_premium,
            "indicated_rate": indicated_rate,
            "credibility": min(1.0, random.randint(50, 300) / 500),
        })
    
    return {
        "filters_applied": {
            "naics_prefix": naics_prefix,
            "state": state,
            "vintage_range": f"{vintage_start or 'any'}-{vintage_end or 'any'}",
            "loan_size_bucket": loan_size_bucket,
        },
        "cohort_summary": {
            "loan_count": loan_count,
            "total_exposure": loan_count * 1200000,  # Avg loan size
            "avg_default_rate": base_rate,
            "avg_lgd": 0.42,
            "avg_loss_ratio": base_rate * 0.42,
            "data_sufficiency": "high" if loan_count > 200 else "moderate",
        },
        "loss_triangle": loss_triangle,
        "rate_indications": rate_indications,
        "vintage_analysis": [
            {"vintage": 2020, "default_rate": base_rate * 1.35, "status": "mature"},
            {"vintage": 2021, "default_rate": base_rate * 1.20, "status": "mature"},
            {"vintage": 2022, "default_rate": base_rate * 1.10, "status": "developing"},
            {"vintage": 2023, "default_rate": base_rate * 0.80, "status": "early"},
            {"vintage": 2024, "default_rate": base_rate * 0.40, "status": "very_early"},
        ],
    }


class StressTestRequest(BaseModel):
    """Combined stress test request"""
    submission: SubmissionRequest
    policy_terms: PolicyTermsRequest
    stress_scenarios: List[Dict[str, Any]]


@router.post("/stress-test")
async def run_stress_test(
    request: StressTestRequest,
    current_user: User = Depends(get_current_active_user),
):
    """
    Run stress test scenarios on a submission.
    
    Stress scenarios can include:
    - default_multiplier: 1.5 = 50% increase in defaults
    - recovery_haircut: 0.2 = 20% reduction in recoveries
    - correlation_shock: increase in loss correlation
    """
    require_insurer(current_user)
    
    engine = ActuarialPricingEngine()
    
    # Base case
    base_result = engine.price_submission(request.submission.dict(), request.policy_terms.dict())
    
    results = [{
        "scenario": "Base Case",
        "default_probability": base_result.default_probability,
        "loss_given_default": base_result.loss_given_default,
        "expected_loss": base_result.pure_premium,
        "indicated_rate": base_result.indicated_rate,
        "pml_99": base_result.pml_99,
    }]
    
    for scenario in request.stress_scenarios:
        scenario_name = scenario.get("name", "Stress")
        default_mult = scenario.get("default_multiplier", 1.0)
        recovery_haircut = scenario.get("recovery_haircut", 0.0)
        
        # Adjust parameters
        stressed_pd = base_result.default_probability * default_mult
        stressed_lgd = min(1.0, base_result.loss_given_default * (1 + recovery_haircut))
        stressed_el = stressed_pd * stressed_lgd
        
        # Simplified stressed rate calculation
        stressed_rate = stressed_el * 1.8 + base_result.expense_load
        stressed_pml = base_result.pml_99 * default_mult * (1 + recovery_haircut * 0.5)
        
        results.append({
            "scenario": scenario_name,
            "default_probability": stressed_pd,
            "loss_given_default": stressed_lgd,
            "expected_loss": stressed_el,
            "indicated_rate": stressed_rate,
            "pml_99": stressed_pml,
        })
    
    return {
        "submission": request.submission.dict(),
        "policy_terms": request.policy_terms.dict(),
        "stress_results": results,
    }


@router.get("/portfolio-metrics")
async def get_portfolio_metrics(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get aggregate portfolio metrics for the insurer.
    
    Returns:
    - Total exposure and premium
    - Expected loss ratio
    - PML and capital usage
    - Concentration flags
    """
    require_insurer(current_user)
    
    # In production, aggregate from executed loans with this insurer
    # Here we return simulated portfolio metrics
    
    return {
        "as_of_date": "2024-12-01",
        "portfolio_summary": {
            "total_loans": 127,
            "total_exposure": 156000000,
            "total_premium": 4680000,
            "expected_loss": 2808000,
            "expected_loss_ratio": 0.60,
            "actual_loss_ytd": 1950000,
            "actual_loss_ratio_ytd": 0.42,
        },
        "capital_metrics": {
            "pml_99": 8500000,
            "tvar_99": 10200000,
            "capital_required": 2125000,
            "capital_deployed": 3000000,
            "capital_utilization": 0.71,
        },
        "concentration": {
            "top_naics": [
                {"naics": "72", "exposure": 31200000, "pct": 0.20, "limit": 0.20, "status": "at_limit"},
                {"naics": "62", "exposure": 23400000, "pct": 0.15, "limit": 0.20, "status": "ok"},
                {"naics": "54", "exposure": 18720000, "pct": 0.12, "limit": 0.20, "status": "ok"},
            ],
            "top_states": [
                {"state": "CA", "exposure": 28080000, "pct": 0.18, "limit": 0.25, "status": "ok"},
                {"state": "TX", "exposure": 21840000, "pct": 0.14, "limit": 0.25, "status": "ok"},
                {"state": "FL", "exposure": 17160000, "pct": 0.11, "limit": 0.25, "status": "ok"},
            ],
            "top_lenders": [
                {"lender": "ABC Bank", "exposure": 23400000, "pct": 0.15, "limit": 0.15, "status": "at_limit"},
                {"lender": "XYZ Credit", "exposure": 18720000, "pct": 0.12, "limit": 0.15, "status": "ok"},
            ],
            "flags": [
                "NAICS 72 (Accommodation/Food) at 20% concentration limit",
                "ABC Bank at 15% lender concentration limit",
            ],
        },
        "reinsurance": {
            "quota_share_pct": 0.25,
            "xs_attachment": 5000000,
            "xs_limit": 10000000,
            "net_retention": 117000000,
            "ceded_premium": 1170000,
        },
        "performance_vs_plan": {
            "premium_actual": 4680000,
            "premium_plan": 5000000,
            "premium_variance_pct": -0.064,
            "loss_ratio_actual": 0.42,
            "loss_ratio_plan": 0.55,
            "loss_ratio_variance": -0.13,
        },
    }


@router.get("/model-governance")
async def get_model_governance(
    current_user: User = Depends(get_current_active_user),
):
    """
    Get model governance and risk management information.
    
    Required for regulatory compliance and model validation.
    """
    require_insurer(current_user)
    
    return {
        "model_inventory": {
            "model_name": "SBA 7(a) Actuarial Pricing Engine",
            "model_id": "ACT-001",
            "version": "1.0.0",
            "last_validation": "2024-06-15",
            "next_validation_due": "2025-06-15",
            "model_owner": "Chief Actuary",
            "model_tier": "Tier 1 - Material",
        },
        "data_sources": {
            "primary": {
                "name": "Proprietary SBA 7(a) Loan Database",
                "records": 1600000,
                "date_range": "2000-2025",
                "last_update": "2024-11-30",
                "update_frequency": "Weekly",
            },
            "secondary": [
                {"name": "FOIA Public Data", "purpose": "Validation"},
                {"name": "BLS Economic Indicators", "purpose": "Macro factors"},
                {"name": "FEMA Disaster Data", "purpose": "Geography risk"},
            ],
        },
        "assumptions": {
            "expense_ratio": {"value": 0.20, "last_reviewed": "2024-09-01"},
            "profit_margin": {"value": 0.10, "last_reviewed": "2024-09-01"},
            "recovery_lag_months": {"value": 18, "last_reviewed": "2024-06-01"},
            "lgd_floor": {"value": 0.15, "last_reviewed": "2024-06-01"},
            "lgd_cap": {"value": 0.85, "last_reviewed": "2024-06-01"},
            "credibility_standard": {"value": 500, "last_reviewed": "2024-06-01"},
        },
        "validation_results": {
            "last_backtest": {
                "date": "2024-06-15",
                "actual_vs_expected": 0.95,
                "lift_score": 2.3,
                "calibration": "Within tolerance",
                "result": "PASS",
            },
            "stability_monitoring": {
                "psi_score": 0.08,
                "threshold": 0.10,
                "status": "Stable",
            },
        },
        "change_log": [
            {"date": "2024-06-15", "change": "Annual recalibration", "approver": "Model Committee"},
            {"date": "2024-03-01", "change": "Added COVID vintage adjustment", "approver": "Chief Actuary"},
            {"date": "2023-12-01", "change": "Initial model deployment", "approver": "Model Committee"},
        ],
    }
