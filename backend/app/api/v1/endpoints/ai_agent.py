"""
Heradyne AI Agent API Endpoints
"""
from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User, UserRole
from app.models.deal import Deal, DealRiskReport
from app.models.executed_loan import ExecutedLoan
from app.services.ai_agent.scoring import RiskScoringEngine
from app.services.claude_ai import claude_score_deal, claude_monitor_loan  # AI-powered
from app.services.ai_agent.monitoring import MonitoringEngine, AlertLevel
from app.services.ai_agent.alerts import AlertEngine
from app.services.ai_agent.variables import (
    STRUCTURAL_VARIABLES, GEOGRAPHIC_VARIABLES, FINANCIAL_VARIABLES,
    OPERATOR_VARIABLES, ASSET_VARIABLES, MONITORING_VARIABLES,
    RISK_TIERS, INDUSTRY_RISK_TIERS, CATEGORY_WEIGHTS
)

router = APIRouter()


class DealScoringRequest(BaseModel):
    loan_amount: float = Field(..., description="Loan amount in dollars")
    loan_purpose: str = Field(..., description="acquisition, expansion, working_capital")
    naics_industry: str = Field(..., description="NAICS code")
    business_age: int = Field(..., description="Years in business")
    loan_term: int = Field(120, description="Loan term in months")
    equity_injection: float = Field(..., description="Equity injection percentage")
    dscr: float = Field(..., description="Debt service coverage ratio")
    borrower_credit_score: int = Field(..., description="Borrower personal credit score")
    purchase_multiple_sde: Optional[float] = None
    purchase_multiple_ebitda: Optional[float] = None
    seller_note: Optional[float] = None
    seller_transition: Optional[int] = None
    county_default_rate: Optional[float] = None
    fema_flood_zone: Optional[str] = None
    revenue_trend_3yr: Optional[float] = None
    gross_margin: Optional[float] = None
    ebitda_margin: Optional[float] = None
    borrower_dti: Optional[float] = None
    customer_concentration: Optional[float] = None
    working_capital: Optional[float] = None
    cash_reserves_closing: Optional[int] = None
    buyer_industry_exp: Optional[int] = None
    buyer_commitment: Optional[str] = None
    employee_count: Optional[int] = None
    tangible_assets: Optional[float] = None
    lease_terms: Optional[int] = None


class MonitoringDataRequest(BaseModel):
    loan_id: int
    dscr_current: Optional[float] = None
    sba_payment_status: Optional[str] = None
    revenue_actual: Optional[float] = None
    revenue_projected: Optional[float] = None
    revenue_change_pct: Optional[float] = None
    employee_count_change_pct: Optional[float] = None
    new_liens: Optional[int] = None
    insurance_status: Optional[str] = None
    bank_balance_weeks_declining: Optional[int] = None


class VariableInfo(BaseModel):
    id: str
    name: str
    category: str
    weight: str
    optimal_range: str
    caution_range: str
    reject_threshold: Optional[str]
    description: str
    phase: str


@router.post("/score", response_model=Dict[str, Any])
async def score_deal(
    request: DealScoringRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Score a deal using the 62-variable underwriting model."""
    engine = RiskScoringEngine()
    result = engine.score_deal(request.dict())
    
    return {
        "composite_score": result.composite_score,
        "tier": result.tier,
        "tier_display": result.tier_display,
        "recommended_premium": result.recommended_premium,
        "premium_range": result.premium_range,
        "expected_annual_default_rate": result.expected_annual_default_rate,
        "foia_benchmark_rate": result.foia_benchmark_rate,
        "decision": result.decision,
        "monitoring_frequency": result.monitoring_frequency,
        "category_scores": {
            cat: {
                "category": score.category.value,
                "weight": score.weight,
                "raw_score": score.raw_score,
                "max_score": score.max_score,
                "weighted_score": score.weighted_score,
                "percentage": score.percentage,
                "flags": score.flags,
            }
            for cat, score in result.category_scores.items()
        },
        "hard_declines": result.hard_declines,
        "risk_flags": result.risk_flags,
        "positive_factors": result.positive_factors,
        "segment_comparison": {"avg_score": result.segment_avg_score, "percentile": result.percentile_in_segment},
        "variables_evaluated": result.variables_evaluated,
        "variables_missing": result.variables_missing,
        "scored_at": result.scored_at,
    }


@router.post("/score/deal/{deal_id}", response_model=Dict[str, Any])
async def score_existing_deal(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Score an existing deal from the database. Only for lenders, insurers, and admins."""
    # Restrict to non-borrower roles
    if current_user.role == UserRole.BORROWER:
        raise HTTPException(status_code=403, detail="AI analysis is not available for borrowers")
    
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    # Calculate equity injection percentage if we have purchase price
    equity_pct = 10  # Default
    if deal.equity_injection and deal.purchase_price and deal.purchase_price > 0:
        equity_pct = (deal.equity_injection / deal.purchase_price) * 100
    
    deal_data = {
        "name": deal.name,
        "loan_amount": deal.loan_amount_requested,
        "loan_purpose": "acquisition" if deal.deal_type and "acquisition" in str(deal.deal_type).lower() else "expansion",
        "industry": deal.industry or "services",
        "naics_industry": deal.industry or "services",
        "business_age": deal.owner_experience_years or 5,
        "equity_injection": equity_pct,
        "dscr": 1.35,
        "borrower_credit_score": deal.owner_credit_score or 700,
        "annual_revenue": deal.annual_revenue or 0,
        "ebitda": deal.ebitda or 0,
        "gross_profit": deal.gross_profit or 0,
        "asking_price": deal.purchase_price or 0,
        "purchase_price": deal.purchase_price or 0,
        "equity_injection_dollars": deal.equity_injection or 0,
        "loan_term_months": deal.loan_term_months or 120,
        "owner_experience_years": deal.owner_experience_years or 5,
        "addbacks": deal.addbacks or [],
        "business_description": deal.business_description or "",
    }

    # Enrich with risk report data if available
    risk_report = db.query(DealRiskReport).filter(DealRiskReport.deal_id == deal_id).order_by(DealRiskReport.version.desc()).first()
    if risk_report:
        if risk_report.dscr_base: deal_data["dscr"] = risk_report.dscr_base
        if risk_report.dscr_stress: deal_data["dscr_stress"] = risk_report.dscr_stress
        if risk_report.annual_pd: deal_data["annual_pd"] = risk_report.annual_pd
        if risk_report.ev_mid: deal_data["enterprise_value"] = risk_report.ev_mid
        if risk_report.collateral_coverage: deal_data["collateral_coverage"] = risk_report.collateral_coverage
        if risk_report.normalized_sde: deal_data["normalized_sde"] = risk_report.normalized_sde
        if risk_report.sde_multiple_implied: deal_data["sde_multiple"] = risk_report.sde_multiple_implied
        if risk_report.health_score: deal_data["health_score"] = risk_report.health_score
        if risk_report.pdscr: deal_data["pdscr"] = risk_report.pdscr
    
    # Try Claude-powered scoring first; fall back to rules engine
    claude_result = claude_score_deal(deal_data)
    if claude_result:
        return {"deal_id": deal_id, "deal_name": deal.name, **claude_result}

    # Rules-engine fallback
    engine = RiskScoringEngine()
    result = engine.score_deal(deal_data)
    return {
        "deal_id": deal_id, "deal_name": deal.name,
        "composite_score": result.composite_score, "tier": result.tier,
        "tier_display": result.tier_display, "recommended_premium": result.recommended_premium,
        "expected_annual_default_rate": result.expected_annual_default_rate,
        "foia_benchmark_rate": result.foia_benchmark_rate, "decision": result.decision,
        "monitoring_frequency": result.monitoring_frequency, "risk_flags": result.risk_flags,
        "positive_factors": result.positive_factors, "scored_at": result.scored_at,
        "_powered_by": "rules_engine",
    }


@router.post("/monitor", response_model=Dict[str, Any])
async def assess_loan_monitoring(
    request: MonitoringDataRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Assess a loan using the 18-variable monitoring system."""
    loan = db.query(ExecutedLoan).filter(ExecutedLoan.id == request.loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    borrower = db.query(User).filter(User.id == loan.borrower_id).first()
    loan_data = {
        "loan_id": loan.id,
        "loan_number": loan.loan_number,
        "borrower_name": borrower.full_name if borrower else "Unknown",
        "origination_date": loan.origination_date.isoformat() if loan.origination_date else None,
    }
    
    engine = MonitoringEngine()
    result = engine.assess_loan(loan_data, request.dict(exclude={"loan_id"}))
    
    return {
        "loan_id": result.loan_id,
        "loan_number": result.loan_number,
        "borrower_name": result.borrower_name,
        "health_score": result.health_score,
        "alert_level": result.alert_level.value,
        "alert_level_display": result.alert_level_display,
        "active_alerts": [
            {"variable_id": a.variable_id, "variable_name": a.variable_name, "alert_level": a.alert_level.value,
             "severity": a.severity.value, "message": a.message, "recommended_action": a.recommended_action}
            for a in result.active_alerts
        ],
        "alert_counts": {"watch": result.watch_count, "advisory": result.advisory_count, "escalation": result.escalation_count, "pre_claim": result.pre_claim_count},
        "detected_patterns": [{"pattern_name": p.pattern_name, "intervention": p.intervention, "urgency": p.urgency} for p in result.detected_patterns],
        "recommended_frequency": result.recommended_frequency,
        "next_review_date": result.next_review_date,
        "required_actions": result.required_actions,
        "last_updated": result.last_updated,
    }


@router.get("/dashboard/alerts", response_model=Dict[str, Any])
async def get_alert_dashboard(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get alert dashboard summary for the portfolio."""
    query = db.query(ExecutedLoan).filter(ExecutedLoan.status.in_(['active', 'current']))
    
    if current_user.role == UserRole.LENDER:
        query = query.filter(ExecutedLoan.lender_id == current_user.id)
    elif current_user.role == UserRole.INSURER:
        query = query.filter(ExecutedLoan.insurer_id == current_user.id)
    
    loans = query.all()
    monitoring_results = []
    engine = MonitoringEngine()
    
    for loan in loans:
        borrower = db.query(User).filter(User.id == loan.borrower_id).first()
        loan_data = {"loan_id": loan.id, "loan_number": loan.loan_number, "borrower_name": borrower.full_name if borrower else "Unknown"}
        monitoring_data = {"dscr_current": 1.35, "sba_payment_status": "current"}
        result = engine.assess_loan(loan_data, monitoring_data)
        monitoring_results.append(result)
    
    alert_engine = AlertEngine()
    dashboard = alert_engine.generate_dashboard(monitoring_results)
    
    return {
        "total_loans": dashboard.total_loans,
        "loans_at_watch": dashboard.loans_at_watch,
        "loans_at_advisory": dashboard.loans_at_advisory,
        "loans_at_escalation": dashboard.loans_at_escalation,
        "loans_at_pre_claim": dashboard.loans_at_pre_claim,
        "alerts_requiring_action": dashboard.alerts_requiring_action,
        "top_alerts": dashboard.top_alerts,
        "generated_at": dashboard.generated_at,
    }


@router.get("/variables", response_model=Dict[str, List[VariableInfo]])
async def get_variables(category: Optional[str] = Query(None), current_user: User = Depends(get_current_active_user)):
    """Get all scoring variables grouped by category."""
    all_vars = {
        "structural": STRUCTURAL_VARIABLES, "geographic": GEOGRAPHIC_VARIABLES,
        "financial": FINANCIAL_VARIABLES, "operator": OPERATOR_VARIABLES,
        "asset": ASSET_VARIABLES, "monitoring": MONITORING_VARIABLES,
    }
    
    if category and category not in all_vars:
        raise HTTPException(status_code=400, detail=f"Invalid category: {category}")
    
    vars_to_return = {category: all_vars[category]} if category else all_vars
    
    return {
        cat: [VariableInfo(id=v.id, name=v.name, category=v.category.value, weight=v.weight.value,
                          optimal_range=v.optimal_range, caution_range=v.caution_range,
                          reject_threshold=v.reject_threshold, description=v.description, phase=v.phase)
              for v in vars_list]
        for cat, vars_list in vars_to_return.items()
    }


@router.get("/tiers", response_model=Dict[str, Any])
async def get_risk_tiers(current_user: User = Depends(get_current_active_user)):
    """Get risk tier definitions and thresholds."""
    return {
        "tiers": {name: {k: v for k, v in info.items()} for name, info in RISK_TIERS.items()},
        "industry_tiers": INDUSTRY_RISK_TIERS,
        "category_weights": {k.value: v for k, v in CATEGORY_WEIGHTS.items()},
    }
