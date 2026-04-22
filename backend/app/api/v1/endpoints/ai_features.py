"""
underwrite-platform — app/api/v1/endpoints/ai_features.py

AI-powered features:
  POST /ai-features/deals/{deal_id}/banker-memo        — Generate SBA credit memo
  POST /ai-features/sba-qa                             — SBA SOP compliance Q&A
  POST /ai-features/deals/{deal_id}/recommendations    — Borrower recommendation engine
  POST /ai-features/deals/{deal_id}/covenant-check     — Covenant monitoring
  POST /ai-features/normalize-document                 — Financial document normalization
  POST /ai-features/portfolio-insights                 — Lender portfolio AI insights
"""

import asyncio
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User, UserRole
from app.models.deal import Deal, DealRiskReport
from app.models.executed_loan import ExecutedLoan
from app.services.claude_ai import (
    claude_generate_banker_memo,
    claude_sba_qa,
    claude_borrower_recommendations,
    claude_covenant_monitoring,
    claude_normalize_financials,
    claude_portfolio_insights,
    claude_draft_sba_form,
)
from app.services.audit import audit_service

router = APIRouter()

LENDER_ROLES = {UserRole.LENDER, UserRole.LOAN_OFFICER, UserRole.CREDIT_COMMITTEE}


# ── Banker Memo ───────────────────────────────────────────────────────────────

@router.post("/deals/{deal_id}/banker-memo")
async def generate_banker_memo(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Generate an AI-powered SBA credit memo for loan committee review."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    # Lenders, credit committee, admins, and the borrower can generate
    if current_user.role == UserRole.BORROWER and deal.borrower_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    rpt = db.query(DealRiskReport).filter(
        DealRiskReport.deal_id == deal_id
    ).order_by(DealRiskReport.version.desc()).first()

    deal_data = {
        "name": deal.name,
        "industry": deal.industry,
        "purchase_price": deal.purchase_price,
        "loan_amount_requested": deal.loan_amount_requested,
        "equity_injection": deal.equity_injection,
        "annual_revenue": deal.annual_revenue,
        "ebitda": deal.ebitda,
        "owner_credit_score": deal.owner_credit_score,
        "owner_experience_years": deal.owner_experience_years,
        "years_in_business": deal.owner_experience_years,
        "business_age_years": None,
        "state": deal.state,
        "deal_type": deal.deal_type,
    }

    risk_report = {}
    uw_data = {}
    if rpt:
        risk_report = {
            "dscr_base": rpt.dscr_base,
            "annual_pd": rpt.annual_pd,
            "collateral_coverage": rpt.collateral_coverage,
            "nolv": rpt.total_nolv,
            "ev_mid": rpt.ev_mid,
        }
        uw_data = {
            "health_score": {"score": rpt.health_score, "cashflow": rpt.health_score_cashflow,
                             "stability": rpt.health_score_stability, "growth": rpt.health_score_growth,
                             "liquidity": rpt.health_score_liquidity},
            "dscr_pdscr": {"dscr_base": rpt.dscr_base, "pdscr": rpt.pdscr,
                           "dscr_stress_20": rpt.dscr_stress,
                           "owner_draw_annual": rpt.owner_draw_annual,
                           "premium_capacity_monthly": rpt.premium_capacity_monthly},
            "deal_killer": {"verdict": rpt.deal_killer_verdict or "unknown",
                            "confidence_score": rpt.deal_confidence_score,
                            "max_supportable_price": getattr(rpt, "max_supportable_price", None)},
            "sba_eligibility": {"eligible": rpt.sba_eligible,
                                "failed_checks": rpt.sba_eligibility_checklist or []},
            "valuation": {"equity_value_mid": rpt.equity_value_mid,
                          "equity_value_low": rpt.equity_value_low,
                          "equity_value_high": rpt.equity_value_high},
        }

    result = claude_generate_banker_memo(deal_data, risk_report, uw_data)
    if not result:
        raise HTTPException(status_code=503, detail="AI service unavailable. Check ANTHROPIC_API_KEY.")

    audit_service.log(db=db, action="banker_memo_generated", entity_type="deal",
                      entity_id=deal_id, user_id=current_user.id)
    return result


# ── SBA SOP Q&A ───────────────────────────────────────────────────────────────

class SBAQARequest(BaseModel):
    question: str
    deal_id: Optional[int] = None


@router.post("/sba-qa")
async def sba_compliance_qa(
    request: SBAQARequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Conversational SBA SOP compliance Q&A. Cite specific SOP sections."""
    deal_context = None
    if request.deal_id:
        deal = db.query(Deal).filter(Deal.id == request.deal_id).first()
        if deal:
            rpt = db.query(DealRiskReport).filter(
                DealRiskReport.deal_id == request.deal_id
            ).order_by(DealRiskReport.version.desc()).first()
            deal_context = {
                "name": deal.name,
                "industry": deal.industry,
                "loan_amount_requested": deal.loan_amount_requested,
                "purchase_price": deal.purchase_price,
                "equity_injection": deal.equity_injection,
                "owner_experience_years": deal.owner_experience_years,
                "dscr": rpt.dscr_base if rpt else None,
            }

    loop = asyncio.get_event_loop()
    answer = await loop.run_in_executor(None, lambda: claude_sba_qa(request.question, deal_context))
    if not answer:
        raise HTTPException(status_code=503, detail="AI service unavailable. Check ANTHROPIC_API_KEY.")

    audit_service.log(db=db, action="sba_qa_asked", entity_type="sba_qa",
                      entity_id=request.deal_id or 0, user_id=current_user.id,
                      details={"question": request.question[:200]})

    return {"answer": answer, "question": request.question, "_powered_by": "claude"}


# ── Borrower Recommendations ──────────────────────────────────────────────────

@router.post("/deals/{deal_id}/recommendations")
async def get_borrower_recommendations(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """AI-powered borrower recommendation engine. Personalized approval-maximizing advice."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    if current_user.role == UserRole.BORROWER and deal.borrower_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    rpt = db.query(DealRiskReport).filter(
        DealRiskReport.deal_id == deal_id
    ).order_by(DealRiskReport.version.desc()).first()

    if not rpt:
        raise HTTPException(status_code=400, detail="Deal must be analyzed first. Submit the deal to run analysis.")

    deal_data = {
        "name": deal.name, "industry": deal.industry,
        "purchase_price": deal.purchase_price, "loan_amount_requested": deal.loan_amount_requested,
        "equity_injection": deal.equity_injection, "annual_revenue": deal.annual_revenue,
        "ebitda": deal.ebitda, "owner_credit_score": deal.owner_credit_score,
        "owner_experience_years": deal.owner_experience_years,
    }
    uw_data = {
        "health_score": {"score": rpt.health_score},
        "dscr_pdscr": {"dscr_base": rpt.dscr_base, "pdscr": rpt.pdscr, "dscr_stress_20": rpt.dscr_stress},
        "deal_killer": {"verdict": rpt.deal_killer_verdict, "confidence_score": rpt.deal_confidence_score,
                        "max_supportable_price": rpt.max_supportable_price},
        "sba_eligibility": {"eligible": rpt.sba_eligible, "failed_checks": rpt.sba_eligibility_checklist or []},
        "valuation": {"equity_value_mid": rpt.equity_value_mid},
        "playbooks": rpt.playbooks or [],
    }
    risk_report = {
        "dscr_base": rpt.dscr_base, "annual_pd": rpt.annual_pd,
        "collateral_coverage": rpt.collateral_coverage,
    }

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, lambda: claude_borrower_recommendations(deal_data, uw_data, risk_report))
    if not result:
        raise HTTPException(status_code=503, detail="AI service unavailable. Check ANTHROPIC_API_KEY.")

    audit_service.log(db=db, action="borrower_recommendations_generated", entity_type="deal",
                      entity_id=deal_id, user_id=current_user.id)
    return result


# ── Covenant Monitoring ───────────────────────────────────────────────────────

class CovenantCheckRequest(BaseModel):
    financial_data: dict
    covenants: Optional[List[dict]] = None


@router.post("/deals/{deal_id}/covenant-check")
async def check_covenants(
    deal_id: int,
    request: CovenantCheckRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """AI covenant monitoring with plain-English explanations for borrowers."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    if current_user.role == UserRole.BORROWER and deal.borrower_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    rpt = db.query(DealRiskReport).filter(
        DealRiskReport.deal_id == deal_id
    ).order_by(DealRiskReport.version.desc()).first()

    loan_data = {
        "borrower_name": deal.name,
        "industry": deal.industry,
        "principal_amount": deal.loan_amount_requested,
        "origination_dscr": rpt.dscr_base if rpt else None,
    }

    # Default SBA covenants if none provided
    default_covenants = request.covenants or [
        {"name": "Minimum DSCR", "required": 1.25, "metric": "dscr"},
        {"name": "Maximum Leverage", "required": 4.0, "metric": "debt_ebitda"},
        {"name": "Minimum Liquidity", "required": 0.10, "metric": "current_ratio"},
        {"name": "Annual Financial Reporting", "required": "within 120 days of fiscal year end", "metric": "reporting"},
    ]

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, lambda: claude_covenant_monitoring(loan_data, request.financial_data, default_covenants))
    if not result:
        raise HTTPException(status_code=503, detail="AI service unavailable. Check ANTHROPIC_API_KEY.")

    audit_service.log(db=db, action="covenant_check_run", entity_type="deal",
                      entity_id=deal_id, user_id=current_user.id)
    return result


# ── Financial Document Normalization ─────────────────────────────────────────

class NormalizeDocumentRequest(BaseModel):
    document_text: str
    document_type: str  # p_and_l, tax_return, balance_sheet, bank_statement
    business_name: str
    deal_id: Optional[int] = None


@router.post("/normalize-document")
async def normalize_financial_document(
    request: NormalizeDocumentRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Extract and normalize financial data from uploaded documents for SBA underwriting."""
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, lambda: claude_normalize_financials(request.document_text, request.document_type, request.business_name))
    if not result:
        raise HTTPException(status_code=503, detail="AI service unavailable. Check ANTHROPIC_API_KEY.")

    audit_service.log(db=db, action="document_normalized", entity_type="document",
                      entity_id=request.deal_id or 0, user_id=current_user.id,
                      details={"doc_type": request.document_type, "business": request.business_name})
    return result


# ── Portfolio Insights ────────────────────────────────────────────────────────

@router.post("/portfolio-insights")
async def get_portfolio_insights(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """AI-powered portfolio insights for lenders: concentration risk, early warnings, benchmarks."""
    if current_user.role not in LENDER_ROLES and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Lender access required")

    loans = db.query(ExecutedLoan).filter(
        ExecutedLoan.lender_id == current_user.id
    ).all()

    loans_data = [{
        "id": l.id,
        "borrower_name": f"Loan #{l.loan_number}",
        "deal_name": f"Loan #{l.loan_number}",
        "principal_amount": l.principal_amount,
        "current_principal_balance": l.current_principal_balance,
        "industry": l.industry or "unknown",
        "loan_status": l.status.value if l.status else "active",
        "origination_dscr": None,
        "health_score": None,
        "originated_at": l.origination_date.isoformat() if l.origination_date else None,
        "days_past_due": l.days_past_due or 0,
    } for l in loans]

    total_exposure = sum(l.get("current_principal_balance") or l.get("principal_amount", 0) for l in loans_data)
    portfolio_data = {
        "lender_id": current_user.id,
        "total_loans": len(loans_data),
        "total_exposure": total_exposure,
        "avg_loan_size": total_exposure / len(loans_data) if loans_data else 0,
    }

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, lambda: claude_portfolio_insights(portfolio_data, loans_data))
    if not result:
        raise HTTPException(status_code=503, detail="AI service unavailable. Check ANTHROPIC_API_KEY.")

    audit_service.log(db=db, action="portfolio_insights_generated", entity_type="portfolio",
                      entity_id=current_user.id, user_id=current_user.id)
    return result


# ── SBA Document Drafts ───────────────────────────────────────────────────────

SBA_FORMS = {
    "form_1919": "SBA Form 1919 — Borrower Information Form",
    "form_1920": "SBA Form 1920 — Lender's Application for Guaranty",
    "form_912": "SBA Form 912 — Statement of Personal History",
    "form_413": "SBA Form 413 — Personal Financial Statement",
    "form_4506t": "IRS Form 4506-T — Request for Transcript of Tax Return",
    "form_147": "SBA Form 147 — Note",
    "credit_memo": "Credit Memorandum",
    "equity_injection_cert": "Equity Injection Certification",
    "credit_elsewhere": "Credit Elsewhere Certification",
}


class DraftFormRequest(BaseModel):
    form_type: str  # key from SBA_FORMS
    lender_data: Optional[dict] = None


@router.post("/deals/{deal_id}/draft-sba-form")
async def draft_sba_form(
    deal_id: int,
    request: DraftFormRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Generate a pre-filled draft of an SBA form with flagged missing fields."""
    if current_user.role not in LENDER_ROLES and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Lender access required")

    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    if request.form_type not in SBA_FORMS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown form type. Valid options: {list(SBA_FORMS.keys())}"
        )

    rpt = db.query(DealRiskReport).filter(
        DealRiskReport.deal_id == deal_id
    ).order_by(DealRiskReport.version.desc()).first()

    deal_data = {
        "name": deal.name,
        "industry": deal.industry,
        "state": deal.state,
        "deal_type": str(deal.deal_type.value) if deal.deal_type else "acquisition",
        "purchase_price": deal.purchase_price,
        "loan_amount_requested": deal.loan_amount_requested,
        "equity_injection": deal.equity_injection,
        "annual_revenue": deal.annual_revenue,
        "ebitda": deal.ebitda,
        "owner_credit_score": deal.owner_credit_score,
        "owner_experience_years": deal.owner_experience_years,
        "years_in_business": deal.owner_experience_years,
        "business_description": deal.business_description,
        "addbacks": deal.addbacks,
        "business_assets": deal.business_assets,
        "personal_assets": deal.personal_assets,
    }

    risk_report = {}
    if rpt:
        risk_report = {
            "dscr_base": rpt.dscr_base,
            "annual_pd": rpt.annual_pd,
            "collateral_coverage": rpt.collateral_coverage,
            "nolv": rpt.total_nolv,
            "sba_eligible": rpt.sba_eligible,
            "sba_failed_checks": rpt.sba_eligibility_checklist or [],
            "health_score": rpt.health_score,
            "deal_verdict": rpt.deal_killer_verdict,
        }

    form_name = SBA_FORMS[request.form_type]
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, lambda: claude_draft_sba_form(form_name, deal_data, risk_report, request.lender_data or {}))
    if result is None:
        raise HTTPException(
            status_code=503,
            detail="AI service unavailable — no response from Claude. Verify ANTHROPIC_API_KEY is set correctly in Railway environment variables."
        )

    result["form_type"] = request.form_type
    result["deal_id"] = deal_id
    result["deal_name"] = deal.name
    result["available_forms"] = SBA_FORMS

    audit_service.log(db=db, action="sba_form_drafted", entity_type="deal",
                      entity_id=deal_id, user_id=current_user.id,
                      details={"form_type": request.form_type})
    return result


@router.get("/sba-forms")
async def list_sba_forms(current_user: User = Depends(get_current_active_user)):
    """List available SBA forms that can be drafted."""
    return {"forms": SBA_FORMS}
