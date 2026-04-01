"""
underwrite-platform — app/api/v1/endpoints/qsbs_eval.py
QSBS / Section 1202 Evaluator — updated for OBBBA (July 4, 2025).
DISCLAIMER: Not legal or tax advice. Verify with qualified tax attorney before any transaction.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User
from app.models.deal import Deal, DealRiskReport
from app.services.audit import audit_service

router = APIRouter()

DISCLAIMER = (
    "This QSBS evaluation is an educational screening tool based on IRC §1202 as amended by "
    "the One Big Beautiful Bill Act (OBBBA, P.L. 119-21, signed July 4, 2025). It does not "
    "constitute legal or tax advice. QSBS eligibility is highly fact-specific and must be "
    "reviewed by a qualified tax attorney or CPA before any transaction."
)

# SBA-excluded industries (also QSBS-excluded professional services)
_QSBS_EXCLUDED = {
    "financial services", "banking", "insurance", "investment",
    "law", "legal", "accounting", "consulting", "athletics",
    "performing arts", "medical practice", "clinical", "dental",
    "farming", "agriculture", "hotel", "restaurant", "hospitality",
}


class QSBSInput(BaseModel):
    entity_type: str = "c-corp"          # c-corp, s-corp, llc-ccorp, llc-pass, partnership
    industry: str = "services"
    gross_assets_at_issuance: float      # cash + adjusted basis of property at issuance
    issue_date_bucket: str = "post-2010" # post-obbba | post-2010 | post-2009 | pre-2009
    holding_years: float = 5.0
    basis: float = 0.0                   # adjusted basis (original investment)
    expected_gain: float = 0.0
    cg_rate: float = 0.238               # combined CG + NIIT rate (max 23.8%)
    # Checkbox requirements
    is_domestic: bool = True
    is_original_issuance: bool = True
    is_exchange_for_cash_or_services: bool = True
    active_business_80pct: bool = True
    no_redemptions: bool = True
    is_noncorporate_shareholder: bool = True
    is_us_resident: bool = True
    held_continuously: bool = True
    no_related_party_redemptions: bool = True
    state_conforms: bool = False          # default False — many states don't conform


def _run_qsbs(inp: QSBSInput) -> dict:
    ind = inp.industry.lower()
    industry_excluded = any(ex in ind for ex in _QSBS_EXCLUDED)

    # Asset threshold
    if inp.issue_date_bucket == "post-obbba":
        asset_threshold = 75_000_000
    else:
        asset_threshold = 50_000_000
    asset_ok = inp.gross_assets_at_issuance <= asset_threshold

    # Entity eligibility
    entity_ok = inp.entity_type in ("c-corp", "llc-ccorp")
    entity_convertible = inp.entity_type in ("s-corp", "llc-pass", "partnership")

    # Holding period & exclusion %
    if inp.issue_date_bucket == "post-obbba":
        min_hold = 3.0
        if inp.holding_years >= 5:   excl_pct = 1.00
        elif inp.holding_years >= 4: excl_pct = 0.75
        elif inp.holding_years >= 3: excl_pct = 0.50
        else:                        excl_pct = 0.0
    else:
        min_hold = 5.0
        if inp.holding_years >= 5:
            excl_pct = 1.00 if inp.issue_date_bucket == "post-2010" else (0.75 if inp.issue_date_bucket == "post-2009" else 0.50)
        else:
            excl_pct = 0.0
    hold_ok = inp.holding_years >= min_hold

    # Per-issuer cap
    if inp.issue_date_bucket == "post-obbba":
        cap_dollar = 15_000_000
    else:
        cap_dollar = 10_000_000
    per_issuer_cap = max(cap_dollar, inp.basis * 10)
    eligible_gain = min(inp.expected_gain, per_issuer_cap)
    excluded_gain = eligible_gain * excl_pct

    # Hard fails checklist
    checks = [
        {"criterion": "Domestic C Corporation", "pass": entity_ok, "note": "S-Corps and pass-through LLCs cannot issue QSBS" if not entity_ok else "Qualifies"},
        {"criterion": f"Eligible industry (not excluded by §1202)", "pass": not industry_excluded, "note": "Industry excluded from QSBS" if industry_excluded else "Industry eligible"},
        {"criterion": f"Gross assets ≤ ${asset_threshold/1e6:.0f}M at issuance", "pass": asset_ok, "note": f"${inp.gross_assets_at_issuance/1e6:.1f}M vs ${asset_threshold/1e6:.0f}M limit"},
        {"criterion": f"Holding period ≥ {min_hold:.0f} years", "pass": hold_ok, "note": f"{inp.holding_years:.1f} years held"},
        {"criterion": "Domestic US corporation", "pass": inp.is_domestic, "note": "Must be US domestic"},
        {"criterion": "Stock acquired at original issuance", "pass": inp.is_original_issuance, "note": "Cannot be purchased from another shareholder"},
        {"criterion": "Acquired for cash, property, or services", "pass": inp.is_exchange_for_cash_or_services, "note": "Gifted stock may not qualify"},
        {"criterion": "≥80% assets in active qualified business (continuous)", "pass": inp.active_business_80pct, "note": "Must be maintained for substantially all holding period"},
        {"criterion": "No disqualifying stock redemptions", "pass": inp.no_redemptions, "note": "Look-back window: 2 years around issuance date"},
        {"criterion": "Non-corporate shareholder", "pass": inp.is_noncorporate_shareholder, "note": "C-corps cannot claim the exclusion"},
        {"criterion": "US resident / citizen", "pass": inp.is_us_resident, "note": "Non-US residents may not qualify"},
        {"criterion": "Stock held continuously since issuance", "pass": inp.held_continuously, "note": "Must not have been sold and repurchased"},
        {"criterion": "No related-party redemptions (4-yr window)", "pass": inp.no_related_party_redemptions, "note": "2 years before, 2 years after issuance"},
        {"criterion": "State of residence conforms to §1202", "pass": inp.state_conforms, "note": "CA, NY, MA, AL, MS, PA do NOT conform — state tax still due on excluded gain"},
    ]

    hard_fails = [c["criterion"] for c in checks if not c["pass"] and c["criterion"] in [
        "Domestic C Corporation", f"Eligible industry (not excluded by §1202)",
        f"Gross assets ≤ ${asset_threshold/1e6:.0f}M at issuance",
        "Stock acquired at original issuance", "Non-corporate shareholder",
        "Stock held continuously since issuance",
    ]]
    warnings = [c["criterion"] for c in checks if not c["pass"] and c["criterion"] not in hard_fails]

    eligible = len(hard_fails) == 0 and hold_ok
    conditional = len(hard_fails) == 0 and not hold_ok  # structure passes but hold not met

    tax_saved = excluded_gain * inp.cg_rate if eligible else 0
    tax_without = inp.expected_gain * inp.cg_rate
    tax_with = max(0, (inp.expected_gain - excluded_gain) * inp.cg_rate) if eligible else tax_without
    effective_rate = (tax_with / inp.expected_gain) if inp.expected_gain else 0

    return {
        "eligible": eligible,
        "conditional": conditional,
        "entity_convertible": entity_convertible,
        "issue_date_bucket": inp.issue_date_bucket,
        "exclusion_pct": excl_pct,
        "min_hold_years": min_hold,
        "holding_years": inp.holding_years,
        "per_issuer_cap": per_issuer_cap,
        "eligible_gain": round(eligible_gain),
        "excluded_gain": round(excluded_gain),
        "estimated_tax_saved": round(tax_saved),
        "tax_without_1202": round(tax_without),
        "tax_with_1202": round(tax_with),
        "effective_rate_post_1202": round(effective_rate, 4),
        "hard_fails": hard_fails,
        "warnings": warnings,
        "checklist": checks,
        "disclaimer": DISCLAIMER,
    }


@router.post("/evaluate")
def evaluate_qsbs(
    inp: QSBSInput,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Run QSBS §1202 eligibility screen (standalone — any authenticated user)."""
    result = _run_qsbs(inp)
    audit_service.log(db=db, action="qsbs_screen_run", entity_type="qsbs",
                      user_id=current_user.id,
                      details={"eligible": result["eligible"], "tax_saved": result["estimated_tax_saved"]})
    return result


@router.get("/deals/{deal_id}")
def evaluate_qsbs_for_deal(
    deal_id: int,
    holding_years: float = 5.0,
    basis: float = 0.0,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Run QSBS screen using deal data — auto-populates from deal and risk report."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    if current_user.role.value == "borrower" and deal.borrower_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    rpt = db.query(DealRiskReport).filter(
        DealRiskReport.deal_id == deal_id
    ).order_by(DealRiskReport.version.desc()).first()

    # Estimate gross assets from deal data
    biz_assets = sum(a.get("value", 0) for a in (deal.business_assets or []) if isinstance(a, dict))
    gross_assets = biz_assets or deal.annual_revenue * 0.30  # rough proxy

    # Expected gain = equity value mid - basis
    eq_mid = (rpt.equity_value_mid if rpt else None) or deal.purchase_price or 0
    expected_gain = max(0, eq_mid - basis)

    inp = QSBSInput(
        entity_type="c-corp",       # assume — verify at origination
        industry=deal.industry or "services",
        gross_assets_at_issuance=gross_assets,
        issue_date_bucket="post-2010",
        holding_years=holding_years,
        basis=basis or (deal.equity_injection or 0),
        expected_gain=expected_gain,
        cg_rate=0.238,
    )
    result = _run_qsbs(inp)
    result["deal_id"] = deal_id
    result["deal_name"] = deal.name
    result["auto_populated"] = True
    result["note"] = "Gross assets estimated from deal data. Verify actual gross assets at issuance with tax advisor."

    audit_service.log(db=db, action="qsbs_screen_run", entity_type="deal",
                      entity_id=deal_id, user_id=current_user.id,
                      details={"eligible": result["eligible"]})
    return result
