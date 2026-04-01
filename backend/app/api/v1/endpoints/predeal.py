"""
underwrite-platform — app/api/v1/endpoints/predeal.py

Pre-Deal Funnel Endpoints (UnderwriteOS Segment 1)
=====================================================
Pricing: Quick Screen $99 | Full Evaluation $399 | Investment Review $1,500

All endpoints are public (no auth required for basic screen).
Investment review submission requires auth.

DISCLAIMER: All outputs informational only.
"""

from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User
from app.services.uw_engines import (
    compute_health_score, compute_dscr_pdscr, compute_valuation_5method,
    compute_sba_eligibility, compute_deal_killer, compute_cashflow_forecast,
    generate_playbooks, _annual_ds
)
from app.services.audit import audit_service

router = APIRouter()
DISCLAIMER = "DISCLAIMER: Pre-deal evaluation is informational only. Not lending, guarantee, or investment advice."


class QuickScreenInput(BaseModel):
    business_name: str
    industry: str = "services"
    state: str = "SC"
    years_in_business: int = 5
    asking_price: float
    equity_injection: float
    annual_revenue: float
    net_income: float
    addbacks: float = 0
    owner_compensation: float = 0
    cash_balance: float = 0
    existing_debt: float = 0
    pricing_sku: str = "quick_screen"  # quick_screen | full_eval | investment_review


@router.post("/cases")
def create_predeal_case(
    inp: QuickScreenInput,
    db: Session = Depends(get_db),
):
    """
    Create and immediately run a pre-deal evaluation.
    Returns quick screen result (Buy/Renegotiate/Pass, score, top flags).
    Full evaluation returns additional DSCR stress, SBA check, playbooks.
    Investment review triggers internal team notification.
    """
    loan_amount = inp.asking_price - inp.equity_injection
    sde = inp.net_income + inp.addbacks + inp.owner_compensation
    ebitda = inp.net_income + inp.addbacks
    gp = inp.annual_revenue * 0.50  # rough proxy without GP input

    # Run core engines (always)
    hs  = compute_health_score(inp.annual_revenue, ebitda, gp, inp.cash_balance, loan_amount, 0.085, 120, inp.years_in_business)
    dc  = compute_dscr_pdscr(ebitda, inp.annual_revenue, loan_amount, 0.085, 120, 0, inp.owner_compensation * 0.85, sde)
    val = compute_valuation_5method(sde, ebitda, inp.annual_revenue, inp.cash_balance, inp.existing_debt, 0, 0, inp.industry, inp.asking_price)
    dk  = compute_deal_killer(sde, inp.asking_price, inp.equity_injection, loan_amount, 0.085, 120, dc["dscr_base"], val["ev_low"], val["ev_high"], val["ask_vs_equity"], inp.annual_revenue)
    cf  = compute_cashflow_forecast(inp.annual_revenue, ebitda, inp.cash_balance)

    # Internal tier classification
    score = dk["deal_confidence_score"]
    if score >= 75 and dc["dscr_base"] >= 1.30:
        internal_tier = "A"
    elif score >= 60 and dc["dscr_base"] >= 1.15:
        internal_tier = "B"
    elif score >= 45:
        internal_tier = "C"
    else:
        internal_tier = "DNP"

    result = {
        "case_id": f"PRE-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
        "pricing_sku": inp.pricing_sku,
        "business_name": inp.business_name,
        "verdict": dk["deal_killer_verdict"],
        "deal_score": score,
        "internal_tier": internal_tier,  # internal only
        "normalized_sde": val["normalized_sde"],
        "valuation_range": {"low": val["equity_value_low"], "high": val["equity_value_high"]},
        "dscr_estimated": dc["dscr_base"],
        "cash_runway_months": hs["cash_runway_months"],
        "max_supportable_price": dk["max_supportable_price"],
        "investment_review_eligible": internal_tier in ["A", "B"],
        "fee_waived": internal_tier == "A",
        "disclaimer": DISCLAIMER,
    }

    # Full evaluation adds more detail
    if inp.pricing_sku in ("full_eval", "investment_review"):
        sba = compute_sba_eligibility(inp.annual_revenue, loan_amount, inp.asking_price, inp.equity_injection,
                                       ebitda, 0, inp.industry, inp.years_in_business, inp.years_in_business)
        pbs = generate_playbooks(inp.annual_revenue, ebitda, gp, inp.cash_balance, inp.annual_revenue / 12 * 0.85,
                                  dc.get("dscr_stress_20", dc["dscr_base"]), hs["cash_runway_months"])
        result["dscr_stress_scenarios"] = {
            "mild_10pct":     dc["dscr_stress_10"],
            "moderate_20pct": dc["dscr_stress_20"],
            "severe_30pct":   dc["dscr_stress_30"],
        }
        result["sba_eligible"] = sba["sba_eligible"]
        result["sba_checklist"] = sba["sba_eligibility_checklist"]
        result["breakpoint_scenarios"] = dk["breakpoint_scenarios"]
        result["playbooks"] = pbs
        result["cash_forecast_18m"] = cf["cash_forecast_18m"]

    return result


@router.post("/cases/{case_id}/submit-for-investment-review")
def submit_investment_review(
    case_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Submit a pre-deal case for internal investment review."""
    audit_service.log(
        db=db, action="investment_review_submitted", entity_type="predeal_case",
        user_id=current_user.id,
        details={"case_id": case_id}
    )
    return {
        "case_id": case_id,
        "status": "submitted",
        "message": "Your deal has been submitted for internal investment review. Our team will respond within 2 business days.",
        "next_steps": [
            "Our underwriting team will review your evaluation",
            "If the deal meets our investment criteria, we will contact you about co-investment",
            "Investment review fee is waived for Tier A deals",
            "The $399 Full Evaluation fee is credited to deal costs at close"
        ],
        "disclaimer": DISCLAIMER,
    }


class PurchaseRequest(BaseModel):
    deal_id: int
    tier: str  # 'valuation' or 'diligence'
    amount: float


@router.post("/purchase")
def record_purchase(
    request: PurchaseRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Record a pre-deal package purchase (payment processing handled externally)."""
    audit_service.log(
        db=db, action="predeal_purchase", entity_type="deal",
        entity_id=request.deal_id, user_id=current_user.id,
        details={"tier": request.tier, "amount": request.amount}
    )
    return {
        "status": "recorded",
        "tier": request.tier,
        "amount": request.amount,
        "deal_id": request.deal_id,
        "message": f"{request.tier.title()} package purchased for deal {request.deal_id}"
    }
