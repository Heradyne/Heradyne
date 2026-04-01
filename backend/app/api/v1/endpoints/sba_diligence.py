"""
underwrite-platform — app/api/v1/endpoints/sba_diligence.py
SBA Diligence Packager endpoints.
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
    "This document is prepared using buyer-provided information and system-generated models. "
    "It does not constitute an offer to lend, SBA program approval, or commitment to lend. "
    "Lenders should conduct independent underwriting."
)

VAULT_FOLDERS = [
    {"name": "Borrower Documents", "required": ["SBA Form 413 — Personal Financial Statement", "Personal tax returns (3 years)", "Government ID", "Buyer resume/bio"]},
    {"name": "Business Financials", "required": ["P&L statement (TTM)", "Balance sheet", "Cash flow statement", "AR aging report", "Payroll summary"]},
    {"name": "Tax Returns", "required": ["Business tax returns — 2023", "Business tax returns — 2022", "Business tax returns — 2021"]},
    {"name": "Bank Statements", "required": ["Business bank statements (12 months)", "Prior year bank statements"]},
    {"name": "Transaction Documents", "required": ["Letter of Intent (LOI) or Purchase Agreement"]},
    {"name": "Collateral", "required": ["Equipment appraisal or schedule", "AR schedule", "Personal real estate schedule"]},
    {"name": "Projections", "required": []},
    {"name": "Underwriting Outputs", "required": []},
]


@router.get("/deals/{deal_id}")
def get_sba_diligence_package(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get SBA diligence package readiness and banker memo data for a deal."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    if current_user.role == UserRole.BORROWER and deal.borrower_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    rpt = db.query(DealRiskReport).filter(
        DealRiskReport.deal_id == deal_id
    ).order_by(DealRiskReport.version.desc()).first()

    docs = [d.document_type for d in deal.documents] if deal.documents else []
    items_present = []
    items_missing = []

    for folder in VAULT_FOLDERS:
        for item in folder["required"]:
            if any(item.lower()[:8] in (d or "").lower() for d in docs):
                items_present.append(item)
            else:
                items_missing.append({"item": item, "folder": folder["name"], "required_for_sba": True})

    readiness = round(len(items_present) / max(1, len(items_present) + len(items_missing)) * 100, 1)

    audit_service.log(db=db, action="sba_package_viewed", entity_type="deal",
                      entity_id=deal_id, user_id=current_user.id)

    return {
        "deal_id": deal_id,
        "deal_name": deal.name,
        "readiness_score": readiness,
        "items_present": len(items_present),
        "items_missing": len(items_missing),
        "missing_items": items_missing,
        "banker_memo": {
            "transaction_summary": {
                "purchase_price": deal.purchase_price,
                "loan_requested": deal.loan_amount_requested,
                "equity_injection": deal.equity_injection,
                "ltv": round(deal.loan_amount_requested / deal.purchase_price, 3) if deal.purchase_price else None,
                "sde_multiple": rpt.sde_multiple_implied if rpt else None,
            },
            "normalized_cashflow": {
                "normalized_ebitda": rpt.normalized_ebitda if rpt else None,
                "normalized_sde": rpt.normalized_sde if rpt else None,
                "dscr_base": rpt.dscr_base if rpt else None,
                "pdscr": rpt.pdscr if rpt else None,
                "passes_sba_floor": (rpt.dscr_base or 0) >= 1.25 if rpt else None,
            },
            "valuation_range": {
                "equity_low": rpt.equity_value_low if rpt else None,
                "equity_mid": rpt.equity_value_mid if rpt else None,
                "equity_high": rpt.equity_value_high if rpt else None,
            },
            "sba_eligibility": {
                "eligible": rpt.sba_eligible if rpt else None,
                "max_loan": rpt.sba_max_loan if rpt else None,
            },
            "disclaimer": DISCLAIMER,
        },
        "diligence_vault": {
            "folders": VAULT_FOLDERS,
            "total_required_items": sum(len(f["required"]) for f in VAULT_FOLDERS),
            "share_link_available": True,
        },
    }


@router.post("/deals/{deal_id}/share-link")
def generate_share_link(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Generate a secure banker share link for the diligence vault."""
    import secrets
    from datetime import datetime, timedelta
    token = secrets.token_urlsafe(24)
    expires = (datetime.utcnow() + timedelta(days=30)).isoformat()

    audit_service.log(db=db, action="diligence_vault_shared", entity_type="deal",
                      entity_id=deal_id, user_id=current_user.id,
                      details={"expires": expires})

    return {
        "share_link": f"/vault/{deal_id}/{token}",
        "expires_at": expires,
        "permissions": "read-only",
        "includes": ["banker memo", "document index", "file previews"],
        "note": "Link expires in 30 days and can be revoked at any time from the diligence vault page.",
    }
