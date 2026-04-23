"""
Sprint 1 Servicing Endpoints

POST /servicing/deals/{deal_id}/covenants              — Add covenant to a deal
GET  /servicing/deals/{deal_id}/covenants              — List covenants for a deal
POST /servicing/covenants/{covenant_id}/check          — Log a covenant check
POST /servicing/covenants/{covenant_id}/generate-letter — Generate AI letter
GET  /servicing/lender/covenant-dashboard              — All covenant alerts across portfolio
POST /servicing/deals/{deal_id}/annual-review          — Generate annual review
GET  /servicing/deals/{deal_id}/annual-reviews         — List reviews for a deal
POST /servicing/deals/{deal_id}/site-visit-prep        — Generate site visit prep
POST /servicing/annual-reviews/{review_id}/submit-financials — Borrower submits financials
"""

import asyncio
from datetime import date, datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, Float, Boolean, Text, JSON, Date, DateTime, ForeignKey
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User, UserRole
from app.models.deal import Deal, DealRiskReport
from app.models.executed_loan import ExecutedLoan, LoanPayment
from app.models.base import Base, TimestampMixin
from app.services.claude_ai import (
    claude_generate_covenant_letter,
    claude_generate_annual_review,
    claude_prepare_site_visit,
)
from app.services.audit import audit_service

router = APIRouter()

LENDER_ROLES = {UserRole.LENDER, UserRole.LOAN_OFFICER, UserRole.CREDIT_COMMITTEE}


# ── Inline models (no separate file needed) ───────────────────────────────────

class LoanCovenant(Base, TimestampMixin):
    __tablename__ = "loan_covenants"
    id = Column(Integer, primary_key=True)
    loan_id = Column(Integer, ForeignKey("executed_loans.id"), nullable=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=True)
    name = Column(String(255), nullable=False)
    covenant_type = Column(String(50), nullable=False)
    required_value = Column(Float, nullable=True)
    required_text = Column(Text, nullable=True)
    measurement_date = Column(Date, nullable=True)
    frequency = Column(String(50), nullable=False, default="annual")
    is_active = Column(Boolean, default=True)
    notes = Column(Text, nullable=True)


class CovenantCheck(Base):
    __tablename__ = "covenant_checks"
    id = Column(Integer, primary_key=True)
    covenant_id = Column(Integer, ForeignKey("loan_covenants.id"), nullable=False)
    check_date = Column(Date, nullable=False)
    actual_value = Column(Float, nullable=True)
    actual_text = Column(Text, nullable=True)
    status = Column(String(50), nullable=False, default="compliant")
    ai_analysis = Column(JSON, nullable=True)
    letter_generated = Column(Boolean, default=False)
    letter_content = Column(Text, nullable=True)
    letter_sent_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    checked_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class AnnualReview(Base, TimestampMixin):
    __tablename__ = "annual_reviews"
    id = Column(Integer, primary_key=True)
    loan_id = Column(Integer, ForeignKey("executed_loans.id"), nullable=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    review_year = Column(Integer, nullable=False)
    review_type = Column(String(50), nullable=False, default="annual")
    status = Column(String(50), nullable=False, default="pending")
    scheduled_date = Column(Date, nullable=True)
    completed_date = Column(Date, nullable=True)
    ai_report = Column(JSON, nullable=True)
    site_visit_prep = Column(JSON, nullable=True)
    site_visit_notes = Column(Text, nullable=True)
    lender_notes = Column(Text, nullable=True)
    financial_data_submitted = Column(Boolean, default=False)
    financial_data = Column(JSON, nullable=True)
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)


# ── Request schemas ───────────────────────────────────────────────────────────

class CovenantCreate(BaseModel):
    name: str
    covenant_type: str  # dscr, reporting, insurance, financial, other
    required_value: Optional[float] = None
    required_text: Optional[str] = None
    frequency: str = "annual"
    notes: Optional[str] = None


class CovenantCheckCreate(BaseModel):
    actual_value: Optional[float] = None
    actual_text: Optional[str] = None
    notes: Optional[str] = None


class AnnualReviewCreate(BaseModel):
    review_year: int
    review_type: str = "annual"  # annual, site_visit, interim
    scheduled_date: Optional[date] = None
    financial_data: Optional[dict] = None


class FinancialSubmission(BaseModel):
    financial_data: dict
    notes: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_deal_context(deal_id: int, db: Session):
    """Get deal, loan, risk report, and UW data for a deal."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    rpt = db.query(DealRiskReport).filter(
        DealRiskReport.deal_id == deal_id
    ).order_by(DealRiskReport.version.desc()).first()

    loan = db.query(ExecutedLoan).filter(ExecutedLoan.deal_id == deal_id).first()

    deal_data = {
        "name": deal.name, "industry": deal.industry,
        "annual_revenue": deal.annual_revenue, "ebitda": deal.ebitda,
        "purchase_price": deal.purchase_price, "loan_amount_requested": deal.loan_amount_requested,
        "equity_injection": deal.equity_injection, "owner_credit_score": deal.owner_credit_score,
        "owner_experience_years": deal.owner_experience_years,
    }

    risk_report = {}
    uw_data = {}
    if rpt:
        risk_report = {
            "dscr_base": rpt.dscr_base, "annual_pd": rpt.annual_pd,
            "collateral_coverage": rpt.collateral_coverage, "total_nolv": rpt.total_nolv,
            "origination_dscr": rpt.dscr_base,
        }
        uw_data = {
            "health_score": {"score": rpt.health_score},
            "deal_killer": {"verdict": rpt.deal_killer_verdict or "unknown"},
            "sba_eligibility": {"eligible": rpt.sba_eligible},
        }

    loan_data = {}
    payments = []
    if loan:
        loan_data = {
            "loan_number": loan.loan_number,
            "principal_amount": loan.principal_amount,
            "current_principal_balance": loan.current_principal_balance,
            "days_past_due": loan.days_past_due or 0,
            "total_payments_made": loan.total_payments_made or 0,
            "status": loan.status.value if loan.status else "active",
        }
        payments = db.query(LoanPayment).filter(
            LoanPayment.loan_id == loan.id
        ).order_by(LoanPayment.payment_date.desc()).limit(24).all()
        payments = [{
            "payment_number": p.payment_number, "payment_date": str(p.payment_date),
            "actual_payment": p.actual_payment, "is_late": p.is_late, "days_late": p.days_late or 0,
        } for p in payments]

    return deal, deal_data, loan, loan_data, risk_report, uw_data, payments


# ── Covenant endpoints ────────────────────────────────────────────────────────

@router.post("/deals/{deal_id}/covenants")
async def add_covenant(
    deal_id: int,
    data: CovenantCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Add a covenant to track for a deal."""
    if current_user.role not in LENDER_ROLES and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Lender access required")

    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    loan = db.query(ExecutedLoan).filter(ExecutedLoan.deal_id == deal_id).first()

    covenant = LoanCovenant(
        deal_id=deal_id,
        loan_id=loan.id if loan else None,
        name=data.name,
        covenant_type=data.covenant_type,
        required_value=data.required_value,
        required_text=data.required_text,
        frequency=data.frequency,
        notes=data.notes,
    )
    db.add(covenant)
    db.commit()
    db.refresh(covenant)

    audit_service.log(db=db, action="covenant_added", entity_type="deal",
                      entity_id=deal_id, user_id=current_user.id,
                      details={"covenant": data.name})
    return {"id": covenant.id, "name": covenant.name, "deal_id": deal_id,
            "covenant_type": covenant.covenant_type, "required_value": covenant.required_value,
            "frequency": covenant.frequency}


@router.get("/deals/{deal_id}/covenants")
async def get_covenants(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get all covenants for a deal."""
    covenants = db.query(LoanCovenant).filter(
        LoanCovenant.deal_id == deal_id,
        LoanCovenant.is_active == True
    ).all()

    result = []
    for c in covenants:
        # Get latest check
        latest = db.query(CovenantCheck).filter(
            CovenantCheck.covenant_id == c.id
        ).order_by(CovenantCheck.check_date.desc()).first()

        result.append({
            "id": c.id, "name": c.name, "covenant_type": c.covenant_type,
            "required_value": c.required_value, "required_text": c.required_text,
            "frequency": c.frequency, "notes": c.notes,
            "latest_check": {
                "date": str(latest.check_date), "status": latest.status,
                "actual_value": latest.actual_value, "letter_generated": latest.letter_generated,
            } if latest else None,
        })

    return {"deal_id": deal_id, "covenants": result}


@router.post("/covenants/{covenant_id}/check")
async def log_covenant_check(
    covenant_id: int,
    data: CovenantCheckCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Log a covenant compliance check with actual values."""
    if current_user.role not in LENDER_ROLES and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Lender access required")

    covenant = db.query(LoanCovenant).filter(LoanCovenant.id == covenant_id).first()
    if not covenant:
        raise HTTPException(status_code=404, detail="Covenant not found")

    # Auto-determine status
    status = "compliant"
    if data.actual_value is not None and covenant.required_value is not None:
        ratio = data.actual_value / covenant.required_value
        if ratio < 0.9:
            status = "breach"
        elif ratio < 1.0:
            status = "watch"

    check = CovenantCheck(
        covenant_id=covenant_id,
        check_date=date.today(),
        actual_value=data.actual_value,
        actual_text=data.actual_text,
        status=status,
        notes=data.notes,
        checked_by_id=current_user.id,
    )
    db.add(check)
    db.commit()
    db.refresh(check)

    audit_service.log(db=db, action="covenant_checked", entity_type="covenant",
                      entity_id=covenant_id, user_id=current_user.id,
                      details={"status": status, "actual": data.actual_value})

    return {"id": check.id, "covenant_id": covenant_id, "status": status,
            "actual_value": data.actual_value, "check_date": str(check.check_date)}


@router.post("/covenants/{covenant_id}/generate-letter")
async def generate_covenant_letter(
    covenant_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Generate an AI covenant compliance letter for the latest check."""
    if current_user.role not in LENDER_ROLES and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Lender access required")

    covenant = db.query(LoanCovenant).filter(LoanCovenant.id == covenant_id).first()
    if not covenant:
        raise HTTPException(status_code=404, detail="Covenant not found")

    latest_check = db.query(CovenantCheck).filter(
        CovenantCheck.covenant_id == covenant_id
    ).order_by(CovenantCheck.check_date.desc()).first()

    if not latest_check:
        raise HTTPException(status_code=400, detail="No covenant check on file. Log a check first.")

    deal = db.query(Deal).filter(Deal.id == covenant.deal_id).first()
    loan = db.query(ExecutedLoan).filter(ExecutedLoan.deal_id == covenant.deal_id).first()

    loan_data = {
        "loan_number": loan.loan_number if loan else "N/A",
        "balance": loan.current_principal_balance if loan else 0,
        "industry": deal.industry if deal else "unknown",
    }

    loop = asyncio.get_running_loop()
    letter = await loop.run_in_executor(None, lambda: claude_generate_covenant_letter(
        covenant_name=covenant.name,
        status=latest_check.status,
        required_value=covenant.required_value or 0,
        actual_value=latest_check.actual_value or 0,
        borrower_name=deal.name if deal else "Borrower",
        loan_number=loan.loan_number if loan else "N/A",
        lender_name=current_user.company_name or current_user.full_name,
        loan_data=loan_data,
    ))

    if not letter:
        raise HTTPException(status_code=503, detail="AI service unavailable.")

    # Save letter to check record
    latest_check.letter_generated = True
    latest_check.letter_content = str(letter)
    latest_check.ai_analysis = letter
    db.commit()

    audit_service.log(db=db, action="covenant_letter_generated", entity_type="covenant",
                      entity_id=covenant_id, user_id=current_user.id)
    return letter


@router.get("/lender/covenant-dashboard")
async def covenant_dashboard(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get all covenant alerts across the lender's portfolio."""
    if current_user.role not in LENDER_ROLES and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Lender access required")

    # Get all deals this lender has matches on
    from app.models.deal import DealMatch
    from app.models.policy import LenderPolicy
    policy_ids = [p.id for p in db.query(LenderPolicy).filter(
        LenderPolicy.lender_id == current_user.id
    ).all()]
    deal_ids = [m.deal_id for m in db.query(DealMatch).filter(
        DealMatch.lender_policy_id.in_(policy_ids)
    ).all()]

    covenants = db.query(LoanCovenant).filter(
        LoanCovenant.deal_id.in_(deal_ids),
        LoanCovenant.is_active == True
    ).all()

    alerts = []
    for c in covenants:
        latest = db.query(CovenantCheck).filter(
            CovenantCheck.covenant_id == c.id
        ).order_by(CovenantCheck.check_date.desc()).first()

        if latest and latest.status in ("breach", "watch"):
            deal = db.query(Deal).filter(Deal.id == c.deal_id).first()
            alerts.append({
                "covenant_id": c.id, "covenant_name": c.name,
                "deal_id": c.deal_id, "deal_name": deal.name if deal else "Unknown",
                "status": latest.status, "actual_value": latest.actual_value,
                "required_value": c.required_value, "check_date": str(latest.check_date),
                "letter_generated": latest.letter_generated,
            })

    return {
        "total_covenants": len(covenants),
        "breaches": len([a for a in alerts if a["status"] == "breach"]),
        "watches": len([a for a in alerts if a["status"] == "watch"]),
        "alerts": sorted(alerts, key=lambda x: x["status"] == "breach", reverse=True),
    }


# ── Annual Review endpoints ───────────────────────────────────────────────────

@router.post("/deals/{deal_id}/annual-review")
async def generate_annual_review(
    deal_id: int,
    data: AnnualReviewCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Generate an AI annual review for a deal."""
    if current_user.role not in LENDER_ROLES and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Lender access required")

    deal, deal_data, loan, loan_data, risk_report, uw_data, payments = _get_deal_context(deal_id, db)

    # Get covenants
    covenants = db.query(LoanCovenant).filter(
        LoanCovenant.deal_id == deal_id, LoanCovenant.is_active == True
    ).all()
    covenant_status = []
    for c in covenants:
        latest = db.query(CovenantCheck).filter(
            CovenantCheck.covenant_id == c.id
        ).order_by(CovenantCheck.check_date.desc()).first()
        covenant_status.append({
            "name": c.name, "required": c.required_value,
            "actual": latest.actual_value if latest else None,
            "status": latest.status if latest else "not_checked",
        })

    # Create review record
    review = AnnualReview(
        deal_id=deal_id,
        loan_id=loan.id if loan else None,
        review_year=data.review_year,
        review_type=data.review_type,
        scheduled_date=data.scheduled_date,
        status="in_progress",
        financial_data=data.financial_data,
        financial_data_submitted=bool(data.financial_data),
        reviewed_by_id=current_user.id,
    )
    db.add(review)
    db.commit()
    db.refresh(review)

    loop = asyncio.get_running_loop()
    ai_report = await loop.run_in_executor(None, lambda: claude_generate_annual_review(
        deal_data=deal_data,
        loan_data=loan_data,
        risk_report=risk_report,
        uw_data=uw_data,
        financial_data=data.financial_data or {},
        payment_history=payments,
        covenant_status=covenant_status,
        review_year=data.review_year,
    ))

    if not ai_report:
        raise HTTPException(status_code=503, detail="AI service unavailable.")

    review.ai_report = ai_report
    review.status = "complete"
    review.completed_date = date.today()
    db.commit()

    audit_service.log(db=db, action="annual_review_generated", entity_type="deal",
                      entity_id=deal_id, user_id=current_user.id,
                      details={"year": data.review_year, "type": data.review_type})

    return {"review_id": review.id, "deal_id": deal_id, "review_year": data.review_year,
            "status": "complete", "ai_report": ai_report}


@router.get("/deals/{deal_id}/annual-reviews")
async def list_annual_reviews(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """List all annual reviews for a deal."""
    reviews = db.query(AnnualReview).filter(
        AnnualReview.deal_id == deal_id
    ).order_by(AnnualReview.review_year.desc()).all()

    return {"deal_id": deal_id, "reviews": [{
        "id": r.id, "review_year": r.review_year, "review_type": r.review_type,
        "status": r.status, "completed_date": str(r.completed_date) if r.completed_date else None,
        "risk_rating": r.ai_report.get("risk_rating") if r.ai_report else None,
        "recommendation": r.ai_report.get("recommendation") if r.ai_report else None,
    } for r in reviews]}


@router.post("/annual-reviews/{review_id}/submit-financials")
async def submit_financials(
    review_id: int,
    data: FinancialSubmission,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Borrower submits annual financial statements for review."""
    review = db.query(AnnualReview).filter(AnnualReview.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    review.financial_data = data.financial_data
    review.financial_data_submitted = True
    if data.notes:
        review.lender_notes = data.notes
    db.commit()

    audit_service.log(db=db, action="financials_submitted", entity_type="annual_review",
                      entity_id=review_id, user_id=current_user.id)
    return {"review_id": review_id, "financial_data_submitted": True}


# ── Site Visit endpoints ──────────────────────────────────────────────────────

@router.post("/deals/{deal_id}/site-visit-prep")
async def generate_site_visit_prep(
    deal_id: int,
    visit_type: str = "annual_review",
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Generate AI site visit preparation package."""
    if current_user.role not in LENDER_ROLES and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Lender access required")

    deal, deal_data, loan, loan_data, risk_report, uw_data, payments = _get_deal_context(deal_id, db)

    covenants = db.query(LoanCovenant).filter(
        LoanCovenant.deal_id == deal_id, LoanCovenant.is_active == True
    ).all()
    covenant_status = []
    for c in covenants:
        latest = db.query(CovenantCheck).filter(
            CovenantCheck.covenant_id == c.id
        ).order_by(CovenantCheck.check_date.desc()).first()
        covenant_status.append({
            "name": c.name, "status": latest.status if latest else "not_checked",
            "actual": latest.actual_value if latest else None, "required": c.required_value,
        })

    loop = asyncio.get_running_loop()
    prep = await loop.run_in_executor(None, lambda: claude_prepare_site_visit(
        deal_data=deal_data,
        loan_data=loan_data,
        risk_report=risk_report,
        uw_data=uw_data,
        covenant_status=covenant_status,
        monitoring_alerts=[],
        visit_type=visit_type,
    ))

    if not prep:
        raise HTTPException(status_code=503, detail="AI service unavailable.")

    # Save to most recent open review if one exists
    open_review = db.query(AnnualReview).filter(
        AnnualReview.deal_id == deal_id,
        AnnualReview.status.in_(["pending", "in_progress"])
    ).order_by(AnnualReview.review_year.desc()).first()

    if open_review:
        open_review.site_visit_prep = prep
        db.commit()

    audit_service.log(db=db, action="site_visit_prep_generated", entity_type="deal",
                      entity_id=deal_id, user_id=current_user.id)
    return prep


@router.put("/annual-reviews/{review_id}/site-visit-notes")
async def save_site_visit_notes(
    review_id: int,
    notes: dict,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Save post-visit notes to the review record."""
    review = db.query(AnnualReview).filter(AnnualReview.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    review.site_visit_notes = str(notes.get("notes", ""))
    review.lender_notes = notes.get("lender_notes", review.lender_notes)
    if notes.get("mark_complete"):
        review.status = "complete"
        review.completed_date = date.today()
    db.commit()

    return {"review_id": review_id, "saved": True}
