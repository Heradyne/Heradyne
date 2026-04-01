"""
underwrite-platform — app/api/v1/endpoints/portfolio_reserve.py
Portfolio Reserve Engine endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.deps import get_current_active_user, require_admin
from app.models.user import User, UserRole
from app.models.deal import Deal, DealRiskReport
from app.services.audit import audit_service

router = APIRouter()
DISCLAIMER = "Portfolio reserve outputs are informational. Reserve deployments require formal manager approval."


@router.get("/dashboard")
def get_reserve_dashboard(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Portfolio-level reserve dashboard — admin only."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    # Query all funded deals (Heradyne DealStatus.FUNDED)
    from app.models.deal import DealStatus
    funded_deals = db.query(Deal).filter(Deal.status == DealStatus.FUNDED).all()
    total_equity = sum((d.equity_injection or 0) for d in funded_deals)

    # Get health scores from risk reports
    tier_counts = {"0": 0, "1": 0, "2": 0, "3": 0}
    for deal in funded_deals:
        rpt = db.query(DealRiskReport).filter(DealRiskReport.deal_id == deal.id).order_by(DealRiskReport.version.desc()).first()
        if rpt and rpt.health_score is not None:
            hs = rpt.health_score
            if hs >= 70:   tier_counts["0"] += 1
            elif hs >= 55: tier_counts["1"] += 1
            elif hs >= 40: tier_counts["2"] += 1
            else:          tier_counts["3"] += 1

    # Reserve balance (25% of manager distributions — simplified placeholder)
    reserve_balance = total_equity * 0.132  # est. 13.2% ratio
    floor = total_equity * 0.10
    target = total_equity * 0.15

    return {
        "reserve_balance": round(reserve_balance),
        "total_deployed_equity": round(total_equity),
        "reserve_ratio": round(reserve_balance / total_equity, 3) if total_equity else 0,
        "floor_10pct": round(floor),
        "target_15pct": round(target),
        "floor_intact": reserve_balance >= floor,
        "funded_deals": len(funded_deals),
        "tier_distribution": tier_counts,
        "new_deployments_blocked": reserve_balance < floor,
        "disclaimer": DISCLAIMER,
    }


class DeploymentRequest(BaseModel):
    deal_id: int
    trigger_tier: int
    approved_amount: float
    approved_use: str
    decision_memo: str
    expected_outcome: str


@router.post("/deployments")
def create_deployment(
    req: DeploymentRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Create a reserve deployment request (manager approval required)."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    # Validate prohibited uses
    prohibited = ["owner_distributions", "bonuses", "non_essential_capex",
                  "speculative_marketing", "unrelated_acquisitions"]
    if req.approved_use in prohibited:
        raise HTTPException(status_code=400, detail=f"Prohibited use: {req.approved_use}")

    audit_service.log(
        db=db, action="reserve_deployment_created", entity_type="deal",
        entity_id=req.deal_id, user_id=current_user.id,
        details={
            "trigger_tier": req.trigger_tier,
            "amount": req.approved_amount,
            "approved_use": req.approved_use,
        }
    )
    return {
        "status": "created",
        "deal_id": req.deal_id,
        "amount": req.approved_amount,
        "approved_use": req.approved_use,
        "interest_rate": 0.06,
        "message": "Deployment created. Reserve loan at 6% p.a., capitalized monthly. Repayment before equity distributions.",
        "disclaimer": DISCLAIMER,
    }


@router.get("/deals/{deal_id}/tier-status")
def get_deal_tier_status(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get portfolio reserve tier status for a funded deal."""
    rpt = db.query(DealRiskReport).filter(
        DealRiskReport.deal_id == deal_id
    ).order_by(DealRiskReport.version.desc()).first()
    if not rpt:
        raise HTTPException(status_code=404, detail="No risk report found")

    hs = rpt.health_score or 0
    dscr = rpt.dscr_base or 0
    runway = rpt.cash_runway_months or 12

    if hs >= 70 and dscr >= 1.25 and runway >= 6:
        tier, label = 0, "Healthy"
    elif dscr < 1.0 or runway <= 2:
        tier, label = 3, "Distress"
    elif dscr < 1.25 and runway <= 6:
        tier, label = 2, "Stabilization"
    elif hs < 70 or dscr < 1.25:
        tier, label = 1, "Early Warning"
    else:
        tier, label = 0, "Healthy"

    return {
        "deal_id": deal_id,
        "tier": tier,
        "tier_label": label,
        "health_score": hs,
        "dscr_base": dscr,
        "cash_runway_months": runway,
        "owner_draws_frozen": tier >= 2,
        "equity_distributions_frozen": tier >= 2,
        "weekly_reporting_required": tier >= 2,
        "consulting_engagement_required": tier >= 3,
        "disclaimer": DISCLAIMER,
    }
