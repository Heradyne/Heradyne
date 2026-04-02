"""
underwrite-platform — app/api/v1/endpoints/underwriting.py

UnderwriteOS Underwriting Endpoints
=====================================
Returns the UnderwriteOS-enriched fields from a deal's risk report.
These fields are computed by uw_engines.py during analyze_deal_task
and stored alongside Heradyne's 5 engine outputs in deal_risk_reports.

DISCLAIMER: All outputs are informational only.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User, UserRole
from app.models.deal import Deal, DealRiskReport
from app.services.audit import audit_service

router = APIRouter()

DISCLAIMER = (
    "DISCLAIMER: UnderwriteOS outputs are informational only and do not "
    "constitute lending, guarantee, insurance, or investment decisions."
)


def _check_deal_access(deal_id: int, current_user: User, db: Session) -> Deal:
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    if current_user.role == UserRole.BORROWER and deal.borrower_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return deal


def _latest_report(deal_id: int, db: Session) -> DealRiskReport:
    report = db.query(DealRiskReport).filter(
        DealRiskReport.deal_id == deal_id
    ).order_by(DealRiskReport.version.desc()).first()
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No risk report found. Submit the deal for analysis first."
        )
    return report


@router.get("/deals/{deal_id}/health-score")
def get_health_score(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get UnderwriteOS Health Score for a deal (0–100, 5 subscores)."""
    deal = _check_deal_access(deal_id, current_user, db)
    report = _latest_report(deal_id, db)

    audit_service.log(db=db, action="health_score_viewed", entity_type="deal",
                      entity_id=deal_id, user_id=current_user.id)

    return {
        "deal_id": deal_id,
        "deal_name": deal.name,
        "report_version": report.version,
        "health_score": report.health_score,
        "subscores": {
            "cashflow":  report.health_score_cashflow,
            "stability": report.health_score_stability,
            "growth":    report.health_score_growth,
            "liquidity": report.health_score_liquidity,
            "distress":  report.health_score_distress,
        },
        "cash_runway_months": report.cash_runway_months,
        "disclaimer": DISCLAIMER,
    }


@router.get("/deals/{deal_id}/full-underwriting")
def get_full_underwriting(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Get full UnderwriteOS underwriting result for a deal:
    Health Score + DSCR/PDSCR + Valuation (5-method) + SBA Eligibility +
    Deal Killer verdict + Cash Flow Forecast + Playbooks.
    """
    deal = _check_deal_access(deal_id, current_user, db)
    report = _latest_report(deal_id, db)

    audit_service.log(db=db, action="uw_full_report_viewed", entity_type="deal",
                      entity_id=deal_id, user_id=current_user.id)

    return {
        "deal_id": deal_id,
        "deal_name": deal.name,
        "report_version": report.version,

        "health_score": {
            "score":      report.health_score,
            "cashflow":   report.health_score_cashflow,
            "stability":  report.health_score_stability,
            "growth":     report.health_score_growth,
            "liquidity":  report.health_score_liquidity,
            "distress":   report.health_score_distress,
        },

        "dscr_pdscr": {
            "dscr_base":   report.dscr_base,
            "dscr_stress": report.dscr_stress,
            "pdscr":       report.pdscr,
            "owner_draw_annual": report.owner_draw_annual,
            "premium_capacity_monthly": report.premium_capacity_monthly,
            "passes_sba_floor": (report.dscr_base or 0) >= 1.25,
        },

        "valuation": {
            "normalized_sde":     report.normalized_sde,
            "sde_multiple_implied": report.sde_multiple_implied,
            "ev_low":    report.ev_low,
            "ev_mid":    report.ev_mid,
            "ev_high":   report.ev_high,
            "net_debt":  report.net_debt,
            "equity_value_low":  report.equity_value_low,
            "equity_value_mid":  report.equity_value_mid,
            "equity_value_high": report.equity_value_high,
            "method_weights":    report.valuation_method_weights,
        },

        "sba_eligibility": {
            "eligible":   report.sba_eligible,
            "checklist":  report.sba_eligibility_checklist,
            "max_loan":   report.sba_max_loan,
            "ltv":        report.sba_ltv,
        },

        "deal_killer": {
            "verdict":               report.deal_killer_verdict,
            "confidence_score":      report.deal_confidence_score,
            "max_supportable_price": report.max_supportable_price,
            "breakpoint_scenarios":  report.breakpoint_scenarios,
        },

        "cash_flow_forecast": {
            "runway_months": report.cash_runway_months,
            "forecast_18m":  report.cash_forecast_18m,
        },

        "playbooks": report.playbooks,
        "disclaimer": DISCLAIMER,
    }


@router.get("/deals/{deal_id}/master-analysis")
def get_master_analysis(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Get Claude's master synthesis of all engine outputs.
    Returns executive summary, top factors, next steps, and lender talking points.
    """
    deal = _check_deal_access(deal_id, current_user, db)
    report = _latest_report(deal_id, db)

    from app.services.claude_ai import claude_analyze_deal

    deal_data = {
        "name": deal.name,
        "industry": deal.industry,
        "annual_revenue": deal.annual_revenue,
        "ebitda": deal.ebitda,
        "purchase_price": deal.purchase_price,
        "loan_amount_requested": deal.loan_amount_requested,
        "equity_injection": deal.equity_injection,
        "owner_credit_score": deal.owner_credit_score,
        "owner_experience_years": deal.owner_experience_years,
    }

    uw_results = {
        "health_score": {
            "score": report.health_score, "cashflow": report.health_score_cashflow,
            "stability": report.health_score_stability, "growth": report.health_score_growth,
            "liquidity": report.health_score_liquidity,
        },
        "dscr_pdscr": {
            "dscr_base": report.dscr_base, "dscr_stress": report.dscr_stress,
            "pdscr": report.pdscr, "dscr_stress_20": report.dscr_stress,
        },
        "valuation": {
            "normalized_sde": report.normalized_sde, "equity_value_low": report.equity_value_low,
            "equity_value_mid": report.equity_value_mid, "equity_value_high": report.equity_value_high,
        },
        "deal_killer": {
            "verdict": report.deal_killer_verdict, "confidence_score": report.deal_confidence_score,
            "max_supportable_price": report.max_supportable_price,
        },
        "cash_flow_forecast": {"runway_months": report.cash_runway_months},
        "sba_eligibility": {"eligible": report.sba_eligible, "max_loan": report.sba_max_loan},
        "playbooks": report.playbooks or [],
    }

    analysis = claude_analyze_deal(deal_data, uw_results)

    audit_service.log(db=db, action="master_analysis_viewed", entity_type="deal",
                      entity_id=deal_id, user_id=current_user.id)

    if analysis:
        return {"deal_id": deal_id, "deal_name": deal.name, **analysis}
    return {"deal_id": deal_id, "error": "AI analysis unavailable — check ANTHROPIC_API_KEY"}


@router.get("/deals/{deal_id}/deal-killer")
def get_deal_killer(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get Deal Killer verdict — Buy / Renegotiate / Pass with breakpoints."""
    _check_deal_access(deal_id, current_user, db)
    report = _latest_report(deal_id, db)
    return {
        "deal_id": deal_id,
        "verdict": report.deal_killer_verdict,
        "confidence_score": report.deal_confidence_score,
        "max_supportable_price": report.max_supportable_price,
        "breakpoint_scenarios": report.breakpoint_scenarios,
        "disclaimer": DISCLAIMER,
    }


@router.get("/deals/{deal_id}/playbooks")
def get_playbooks(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get UnderwriteOS actionable playbooks for a deal."""
    _check_deal_access(deal_id, current_user, db)
    report = _latest_report(deal_id, db)
    return {
        "deal_id": deal_id,
        "playbooks": report.playbooks or [],
        "disclaimer": DISCLAIMER,
    }


@router.get("/deals/{deal_id}/sba-eligibility")
def get_sba_eligibility(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get SBA 7(a) 14-point eligibility check result."""
    _check_deal_access(deal_id, current_user, db)
    report = _latest_report(deal_id, db)
    audit_service.log(db=db, action="sba_eligibility_viewed", entity_type="deal",
                      entity_id=deal_id, user_id=current_user.id)
    return {
        "deal_id": deal_id,
        "sba_eligible": report.sba_eligible,
        "checklist": report.sba_eligibility_checklist,
        "max_loan": report.sba_max_loan,
        "ltv": report.sba_ltv,
        "disclaimer": DISCLAIMER,
    }


@router.post("/deals/{deal_id}/analyze")
def run_analysis_sync(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Run UnderwriteOS engines synchronously and save results immediately.
    Used by the pre-deal funnel for instant results without waiting for Celery.
    """
    deal = _check_deal_access(deal_id, current_user, db)

    try:
        from app.services.uw_engines import run_uw_engines
        result = run_uw_engines(deal, {})  # empty heradyne_report_data — uses deal fields directly

        # Save to risk report
        report = _latest_report_or_create(deal_id, db)
        for key, value in result.items():
            if hasattr(report, key):
                setattr(report, key, value)
        db.commit()
        db.refresh(report)

        audit_service.log(db=db, action="uw_analysis_sync", entity_type="deal",
                          entity_id=deal_id, user_id=current_user.id)
        return {"status": "complete", "deal_id": deal_id, "health_score": result.get("health_score")}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def _latest_report_or_create(deal_id: int, db):
    """Get latest report or create a new one."""
    report = db.query(DealRiskReport).filter(
        DealRiskReport.deal_id == deal_id
    ).order_by(DealRiskReport.version.desc()).first()
    if not report:
        report = DealRiskReport(deal_id=deal_id, version=1)
        db.add(report)
        db.flush()
    return report
