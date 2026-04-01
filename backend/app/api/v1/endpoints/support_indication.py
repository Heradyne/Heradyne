"""
underwrite-platform — app/api/v1/endpoints/support_indication.py
Non-binding investment + PG + lender support indication engine.
DISCLAIMER: All indications are NON-BINDING. Subject to formal committee approval.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User, UserRole
from app.models.deal import Deal, DealRiskReport
from app.services.audit import audit_service

router = APIRouter()
DISCLAIMER = (
    "ALL FIGURES ARE NON-BINDING INDICATIONS ONLY. Final investment, PG support, and lender "
    "support are subject to formal committee approval, legal structuring, program availability, "
    "and payment of applicable fees/premiums. These figures do not constitute any commitment."
)


@router.get("/deals/{deal_id}")
def get_support_indication(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Get non-binding investment + PG + lender support indications for a deal.
    Only generated for deals meeting internal Tier A/B criteria.
    """
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    if current_user.role == UserRole.BORROWER and deal.borrower_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    rpt = db.query(DealRiskReport).filter(
        DealRiskReport.deal_id == deal_id
    ).order_by(DealRiskReport.version.desc()).first()
    if not rpt:
        raise HTTPException(status_code=404, detail="No risk report found. Analyze deal first.")

    score = rpt.deal_confidence_score or 0
    dscr  = rpt.dscr_base or 0
    sde   = rpt.normalized_sde or 0
    loan  = deal.loan_amount_requested or 0
    eq    = deal.equity_injection or 0

    # Tier A: score ≥ 75, DSCR ≥ 1.30, SDE ≥ 300K
    tier_a = score >= 75 and dscr >= 1.30 and sde >= 300_000
    # Tier B: score ≥ 60, DSCR ≥ 1.15
    tier_b = score >= 60 and dscr >= 1.15
    eligible = tier_a or tier_b

    if not eligible:
        return {
            "deal_id": deal_id,
            "eligible": False,
            "reason": f"Deal score {score:.0f}/100 and DSCR {dscr:.2f} do not meet internal investment thresholds (score ≥ 60, DSCR ≥ 1.15).",
            "disclaimer": DISCLAIMER,
        }

    # Internal co-investment: up to 25% of equity injection (Tier A), 15% (Tier B)
    invest_pct = 0.25 if tier_a else 0.15
    indicative_investment = round(eq * invest_pct / 10_000) * 10_000  # round to nearest 10K

    # Borrower PG support: up to 30% of loan (Tier A), 20% (Tier B)
    pg_pct = 0.30 if tier_a else 0.20
    indicative_pg = round(loan * pg_pct / 10_000) * 10_000

    # Lender-facing support: up to 15% of loan (collateral enhancement)
    lender_pct = 0.15 if tier_a else 0.10
    indicative_lender = round(loan * lender_pct / 10_000) * 10_000

    # Premium capacity check for PG
    premium_cap = rpt.premium_capacity_monthly or 0
    est_premium = loan * 0.035 / 12  # ~3.5% annual premium, monthly
    pg_affordable = premium_cap >= est_premium

    audit_service.log(
        db=db, action="support_indication_generated", entity_type="deal",
        entity_id=deal_id, user_id=current_user.id,
        details={"tier": "A" if tier_a else "B", "investment": indicative_investment, "pg": indicative_pg}
    )

    return {
        "deal_id": deal_id,
        "eligible": True,
        "internal_tier": "A" if tier_a else "B",
        "is_binding": False,
        "disclaimer": DISCLAIMER,

        "internal_investment": {
            "eligible": True,
            "indicative_amount": indicative_investment,
            "as_pct_of_equity_injection": invest_pct,
            "structure_note": "Preferred equity or subordinated loan alongside buyer's equity injection",
            "buyer_cash_in_reduced_to": round(eq - indicative_investment),
            "conditions": [
                "Formal investment committee approval required",
                "Full legal documentation required",
                "Does not constitute an offer to invest",
            ],
        },

        "borrower_pg_support": {
            "eligible": True,
            "indicative_amount": indicative_pg,
            "as_pct_of_loan": pg_pct,
            "trigger": "PG called on formal SBA loan default",
            "premium_affordable": pg_affordable,
            "estimated_monthly_premium": round(est_premium),
            "conditions": [
                "Final underwriting and legal structure required",
                "Premium payment required",
                "Business must maintain health score ≥ 60 and monthly reporting",
                "No coverage for owner fraud or willful default",
                "Program availability subject to change",
            ],
        },

        "lender_support": {
            "eligible": True,
            "indicative_amount": indicative_lender,
            "as_pct_of_loan": lender_pct,
            "structure_note": "Subordinated second-lien or co-guarantee to facilitate lender approval",
            "trigger": "Lender request — not automatic",
            "conditions": [
                "Lender must accept the support structure",
                "Subordinate to SBA guarantee",
                "Internal approval and legal documentation required",
                "Does not constitute an SBA guarantee",
            ],
        },

        "combined_summary": {
            "total_indicative_support": indicative_investment + indicative_pg + indicative_lender,
            "buyer_equity_reduced_to": round(eq - indicative_investment),
            "loan_effective_coverage": round((loan + indicative_lender) / deal.purchase_price, 3) if deal.purchase_price else None,
        },
    }
