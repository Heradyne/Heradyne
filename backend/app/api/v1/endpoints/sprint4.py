"""
Sprint 4 Endpoints

Lender:
POST /sprint4/guaranty/{deal_id}/generate     — Generate guaranty purchase package
GET  /sprint4/guaranty/{deal_id}              — Get package for a deal
PUT  /sprint4/guaranty/{package_id}/tab       — Mark a tab complete
POST /sprint4/committee/{deal_id}/generate    — Generate committee presentation
GET  /sprint4/committee/{deal_id}             — Get presentation for a deal
PUT  /sprint4/committee/{pres_id}/decision    — Record committee decision

Borrower:
POST /sprint4/qbr/{deal_id}/generate          — Generate quarterly business review
GET  /sprint4/qbr/{deal_id}                   — List QBRs for a deal
POST /sprint4/crisis/{deal_id}/report         — Report a crisis and get response plan
GET  /sprint4/crisis/{deal_id}                — List crisis events for a deal
PUT  /sprint4/crisis/{crisis_id}/resolve      — Mark crisis resolved
"""

import asyncio
from datetime import date, datetime
from typing import Optional
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
    claude_generate_guaranty_package,
    claude_generate_committee_presentation,
    claude_generate_qbr,
    claude_crisis_response,
)
from app.services.audit import audit_service

router = APIRouter()
LENDER_ROLES = {UserRole.LENDER, UserRole.LOAN_OFFICER, UserRole.CREDIT_COMMITTEE}


# ── Inline models ─────────────────────────────────────────────────────────────

class GuarantyPackage(Base, TimestampMixin):
    __tablename__ = "guaranty_packages"
    id = Column(Integer, primary_key=True)
    loan_id = Column(Integer, ForeignKey("executed_loans.id"), nullable=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    lender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String(50), nullable=False, default="draft")
    default_date = Column(Date, nullable=True)
    default_reason = Column(Text, nullable=True)
    ai_package = Column(JSON, nullable=True)
    tabs_complete = Column(JSON, nullable=True)
    estimated_recovery = Column(Float, nullable=True)
    sba_loan_number = Column(String(100), nullable=True)
    submitted_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)


class CommitteePresentation(Base, TimestampMixin):
    __tablename__ = "committee_presentations"
    id = Column(Integer, primary_key=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    lender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    presentation_type = Column(String(50), nullable=False, default="credit_committee")
    ai_content = Column(JSON, nullable=True)
    status = Column(String(50), nullable=False, default="draft")
    committee_date = Column(Date, nullable=True)
    decision = Column(String(50), nullable=True)
    decision_notes = Column(Text, nullable=True)


class QuarterlyReview(Base):
    __tablename__ = "quarterly_reviews"
    id = Column(Integer, primary_key=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    borrower_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    quarter = Column(Integer, nullable=False)
    year = Column(Integer, nullable=False)
    ai_review = Column(JSON, nullable=True)
    owner_notes = Column(Text, nullable=True)
    status = Column(String(50), nullable=False, default="draft")
    created_at = Column(DateTime, default=datetime.utcnow)


class CrisisEvent(Base, TimestampMixin):
    __tablename__ = "crisis_events"
    id = Column(Integer, primary_key=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    borrower_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    crisis_type = Column(String(100), nullable=False)
    description = Column(Text, nullable=False)
    severity = Column(String(20), nullable=False, default="high")
    ai_response = Column(JSON, nullable=True)
    status = Column(String(50), nullable=False, default="active")
    resolved_at = Column(DateTime, nullable=True)
    resolution_notes = Column(Text, nullable=True)


# ── Request schemas ───────────────────────────────────────────────────────────

class GuarantyRequest(BaseModel):
    default_date: date
    default_reason: str
    sba_loan_number: Optional[str] = None
    notes: Optional[str] = None


class TabUpdate(BaseModel):
    tab_number: int
    complete: bool


class CommitteeRequest(BaseModel):
    committee_date: Optional[date] = None
    presentation_type: str = "credit_committee"
    lender_context: Optional[dict] = None


class CommitteeDecision(BaseModel):
    decision: str  # approved, declined, deferred, conditions
    notes: Optional[str] = None


class QBRRequest(BaseModel):
    quarter: int
    year: int


class CrisisReport(BaseModel):
    crisis_type: str
    description: str
    severity: str = "high"


class CrisisResolve(BaseModel):
    resolution_notes: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_deal_context(deal_id: int, db: Session):
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
        "purchase_price": deal.purchase_price,
        "loan_amount_requested": deal.loan_amount_requested,
        "equity_injection": deal.equity_injection,
        "owner_credit_score": deal.owner_credit_score,
        "owner_experience_years": deal.owner_experience_years,
    }

    risk_report = {}
    uw_data = {}
    if rpt:
        risk_report = {
            "dscr_base": rpt.dscr_base, "annual_pd": rpt.annual_pd,
            "collateral_coverage": rpt.collateral_coverage, "total_nolv": rpt.total_nolv,
            "ev_mid": rpt.ev_mid, "ev_low": rpt.ev_low, "ev_high": rpt.ev_high,
            "sba_eligible": rpt.sba_eligible,
            "health_score": rpt.health_score,
            "health_score_cashflow": rpt.health_score_cashflow,
            "health_score_stability": rpt.health_score_stability,
            "health_score_growth": rpt.health_score_growth,
            "health_score_liquidity": rpt.health_score_liquidity,
        }
        uw_data = {
            "health_score": {"score": rpt.health_score},
            "deal_killer": {
                "verdict": rpt.deal_killer_verdict or "unknown",
                "max_supportable_price": rpt.max_supportable_price,
            },
            "sba_eligibility": {
                "eligible": rpt.sba_eligible,
                "failed_checks": rpt.sba_eligibility_checklist or [],
            },
        }

    loan_data = {}
    payments = []
    cashflows = []
    if loan:
        loan_data = {
            "loan_number": loan.loan_number,
            "principal_amount": loan.principal_amount,
            "current_principal_balance": loan.current_principal_balance,
            "guarantee_percentage": loan.guarantee_percentage or 0.75,
            "days_past_due": loan.days_past_due or 0,
            "total_payments_made": loan.total_payments_made or 0,
            "origination_date": str(loan.origination_date) if loan.origination_date else None,
        }
        payments_q = db.query(LoanPayment).filter(
            LoanPayment.loan_id == loan.id
        ).order_by(LoanPayment.payment_date.desc()).limit(24).all()
        payments = [{
            "payment_number": p.payment_number,
            "payment_date": str(p.payment_date),
            "actual_payment": p.actual_payment,
            "is_late": p.is_late, "days_late": p.days_late or 0,
        } for p in payments_q]
        cashflows = [{
            "principal_portion": p.principal_portion,
            "interest_portion": p.interest_portion,
            "payment_date": str(p.payment_date),
        } for p in payments_q[:12]]

    return deal, deal_data, loan, loan_data, risk_report, uw_data, payments, cashflows


# ── Lender: Guaranty Purchase Package ────────────────────────────────────────

@router.post("/guaranty/{deal_id}/generate")
async def generate_guaranty_package(
    deal_id: int,
    data: GuarantyRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in LENDER_ROLES and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Lender access required")

    deal, deal_data, loan, loan_data, risk_report, uw_data, payments, _ = _get_deal_context(deal_id, db)

    # Get documents
    docs = [d.document_type or d.original_filename for d in deal.documents] if deal.documents else []

    # Get covenant status from Sprint 1 tables
    covenant_status = []
    try:
        from app.api.v1.endpoints.servicing import LoanCovenant, CovenantCheck
        covenants = db.query(LoanCovenant).filter(LoanCovenant.deal_id == deal_id).all()
        for c in covenants:
            latest = db.query(CovenantCheck).filter(
                CovenantCheck.covenant_id == c.id
            ).order_by(CovenantCheck.check_date.desc()).first()
            covenant_status.append({
                "name": c.name, "status": latest.status if latest else "not_checked",
                "actual": latest.actual_value if latest else None,
            })
    except Exception:
        pass

    loop = asyncio.get_running_loop()
    pkg = await loop.run_in_executor(None, lambda: claude_generate_guaranty_package(
        deal_data=deal_data, loan_data=loan_data, risk_report=risk_report,
        payment_history=payments, covenant_status=covenant_status, documents=docs,
        default_date=str(data.default_date), default_reason=data.default_reason,
    ))

    if not pkg:
        raise HTTPException(status_code=503, detail="AI service unavailable.")

    rec = GuarantyPackage(
        deal_id=deal_id, loan_id=loan.id if loan else None,
        lender_id=current_user.id, status="draft",
        default_date=data.default_date, default_reason=data.default_reason,
        sba_loan_number=data.sba_loan_number or (loan.loan_number if loan else None),
        ai_package=pkg, notes=data.notes,
        estimated_recovery=pkg.get("estimated_recovery", {}).get("net_recovery"),
        tabs_complete={str(t["tab_number"]): False for t in pkg.get("tabs", [])},
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)

    audit_service.log(db=db, action="guaranty_package_generated", entity_type="deal",
                      entity_id=deal_id, user_id=current_user.id)
    return {"package_id": rec.id, "deal_id": deal_id, **pkg}


@router.get("/guaranty/{deal_id}")
async def get_guaranty_package(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    pkg = db.query(GuarantyPackage).filter(
        GuarantyPackage.deal_id == deal_id,
        GuarantyPackage.lender_id == current_user.id,
    ).order_by(GuarantyPackage.created_at.desc()).first()

    if not pkg:
        return {"deal_id": deal_id, "exists": False}

    return {
        "package_id": pkg.id, "deal_id": deal_id, "exists": True,
        "status": pkg.status, "tabs_complete": pkg.tabs_complete,
        "estimated_recovery": pkg.estimated_recovery,
        **(pkg.ai_package or {}),
    }


@router.put("/guaranty/{package_id}/tab")
async def update_tab_status(
    package_id: int,
    data: TabUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    pkg = db.query(GuarantyPackage).filter(
        GuarantyPackage.id == package_id,
        GuarantyPackage.lender_id == current_user.id,
    ).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")

    tabs = pkg.tabs_complete or {}
    tabs[str(data.tab_number)] = data.complete
    pkg.tabs_complete = tabs

    # Auto-update status
    total = len(tabs)
    complete = sum(1 for v in tabs.values() if v)
    if complete == total:
        pkg.status = "ready"
    elif complete > 0:
        pkg.status = "in_progress"

    db.commit()
    return {"package_id": package_id, "tab": data.tab_number, "complete": data.complete,
            "total_complete": complete, "total_tabs": total}


# ── Lender: Credit Committee Presentation ────────────────────────────────────

@router.post("/committee/{deal_id}/generate")
async def generate_committee_presentation(
    deal_id: int,
    data: CommitteeRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in LENDER_ROLES and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Lender access required")

    deal, deal_data, loan, loan_data, risk_report, uw_data, _, _ = _get_deal_context(deal_id, db)

    lender_context = data.lender_context or {
        "lender_name": current_user.company_name or current_user.full_name,
        "loan_officer": current_user.full_name,
    }

    loop = asyncio.get_running_loop()
    presentation = await loop.run_in_executor(None, lambda: claude_generate_committee_presentation(
        deal_data=deal_data, risk_report=risk_report,
        uw_data=uw_data, lender_context=lender_context,
    ))

    if not presentation:
        raise HTTPException(status_code=503, detail="AI service unavailable.")

    rec = CommitteePresentation(
        deal_id=deal_id, lender_id=current_user.id,
        presentation_type=data.presentation_type,
        committee_date=data.committee_date,
        ai_content=presentation, status="draft",
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)

    audit_service.log(db=db, action="committee_presentation_generated", entity_type="deal",
                      entity_id=deal_id, user_id=current_user.id)
    return {"presentation_id": rec.id, "deal_id": deal_id, **presentation}


@router.get("/committee/{deal_id}")
async def get_committee_presentation(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    pres = db.query(CommitteePresentation).filter(
        CommitteePresentation.deal_id == deal_id,
        CommitteePresentation.lender_id == current_user.id,
    ).order_by(CommitteePresentation.created_at.desc()).first()

    if not pres:
        return {"deal_id": deal_id, "exists": False}

    return {
        "presentation_id": pres.id, "deal_id": deal_id, "exists": True,
        "status": pres.status, "committee_date": str(pres.committee_date) if pres.committee_date else None,
        "decision": pres.decision, "decision_notes": pres.decision_notes,
        **(pres.ai_content or {}),
    }


@router.put("/committee/{presentation_id}/decision")
async def record_committee_decision(
    presentation_id: int,
    data: CommitteeDecision,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    pres = db.query(CommitteePresentation).filter(
        CommitteePresentation.id == presentation_id,
        CommitteePresentation.lender_id == current_user.id,
    ).first()
    if not pres:
        raise HTTPException(status_code=404, detail="Presentation not found")

    pres.decision = data.decision
    pres.decision_notes = data.notes
    pres.status = "decided"
    db.commit()

    audit_service.log(db=db, action="committee_decision_recorded", entity_type="presentation",
                      entity_id=presentation_id, user_id=current_user.id,
                      details={"decision": data.decision})
    return {"presentation_id": presentation_id, "decision": data.decision}


# ── Borrower: Quarterly Business Review ──────────────────────────────────────

@router.post("/qbr/{deal_id}/generate")
async def generate_qbr(
    deal_id: int,
    data: QBRRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    deal, deal_data, loan, loan_data, risk_report, _, _, cashflows = _get_deal_context(deal_id, db)

    # Verify access — borrower owns the deal
    if current_user.role == UserRole.BORROWER and deal.borrower_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    loop = asyncio.get_running_loop()
    review = await loop.run_in_executor(None, lambda: claude_generate_qbr(
        deal_data=deal_data, loan_data=loan_data, risk_report=risk_report,
        cashflows=cashflows, quarter=data.quarter, year=data.year,
    ))

    if not review:
        raise HTTPException(status_code=503, detail="AI service unavailable.")

    rec = QuarterlyReview(
        deal_id=deal_id,
        borrower_id=current_user.id,
        quarter=data.quarter, year=data.year,
        ai_review=review, status="complete",
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)

    audit_service.log(db=db, action="qbr_generated", entity_type="deal",
                      entity_id=deal_id, user_id=current_user.id,
                      details={"quarter": data.quarter, "year": data.year})
    return {"review_id": rec.id, "deal_id": deal_id, "quarter": data.quarter, "year": data.year, **review}


@router.get("/qbr/{deal_id}")
async def list_qbrs(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    reviews = db.query(QuarterlyReview).filter(
        QuarterlyReview.deal_id == deal_id,
    ).order_by(QuarterlyReview.year.desc(), QuarterlyReview.quarter.desc()).all()

    return {"deal_id": deal_id, "reviews": [{
        "id": r.id, "quarter": r.quarter, "year": r.year,
        "quarter_label": f"Q{r.quarter} {r.year}",
        "headline": r.ai_review.get("headline") if r.ai_review else None,
        "overall_rating": r.ai_review.get("overall_rating") if r.ai_review else None,
        "status": r.status,
        "created_at": r.created_at.isoformat(),
    } for r in reviews]}


# ── Borrower: Crisis Response ─────────────────────────────────────────────────

@router.post("/crisis/{deal_id}/report")
async def report_crisis(
    deal_id: int,
    data: CrisisReport,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    deal, deal_data, loan, loan_data, risk_report, _, _, _ = _get_deal_context(deal_id, db)

    if current_user.role == UserRole.BORROWER and deal.borrower_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    loop = asyncio.get_running_loop()
    response = await loop.run_in_executor(None, lambda: claude_crisis_response(
        crisis_type=data.crisis_type, description=data.description,
        deal_data=deal_data, loan_data=loan_data, risk_report=risk_report,
    ))

    if not response:
        raise HTTPException(status_code=503, detail="AI service unavailable.")

    event = CrisisEvent(
        deal_id=deal_id, borrower_id=current_user.id,
        crisis_type=data.crisis_type, description=data.description,
        severity=data.severity, ai_response=response, status="active",
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    audit_service.log(db=db, action="crisis_reported", entity_type="deal",
                      entity_id=deal_id, user_id=current_user.id,
                      details={"crisis_type": data.crisis_type, "severity": data.severity})
    return {"event_id": event.id, "deal_id": deal_id, **response}


@router.get("/crisis/{deal_id}")
async def list_crises(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    events = db.query(CrisisEvent).filter(
        CrisisEvent.deal_id == deal_id,
    ).order_by(CrisisEvent.created_at.desc()).all()

    return {"deal_id": deal_id, "events": [{
        "id": e.id, "crisis_type": e.crisis_type,
        "severity": e.severity, "status": e.status,
        "headline": e.ai_response.get("headline") if e.ai_response else None,
        "notify_lender": e.ai_response.get("notify_lender") if e.ai_response else False,
        "created_at": e.created_at.isoformat(),
        "resolved_at": e.resolved_at.isoformat() if e.resolved_at else None,
    } for e in events]}


@router.put("/crisis/{crisis_id}/resolve")
async def resolve_crisis(
    crisis_id: int,
    data: CrisisResolve,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    event = db.query(CrisisEvent).filter(
        CrisisEvent.id == crisis_id,
        CrisisEvent.borrower_id == current_user.id,
    ).first()
    if not event:
        raise HTTPException(status_code=404, detail="Crisis event not found")

    event.status = "resolved"
    event.resolved_at = datetime.utcnow()
    event.resolution_notes = data.resolution_notes
    db.commit()

    return {"crisis_id": crisis_id, "status": "resolved"}
