"""
Sprint 2 Compliance Endpoints

POST /compliance/1502/generate          — Generate SBA 1502 monthly report
GET  /compliance/1502/                  — List 1502 reports for lender
GET  /compliance/1502/{report_id}       — Get specific report
PUT  /compliance/1502/{report_id}/submit — Mark as submitted

GET  /compliance/audit/{deal_id}        — Get audit file for a deal
POST /compliance/audit/{deal_id}/generate — Generate AI audit package
PUT  /compliance/audit/{deal_id}/checklist — Update checklist item

GET  /compliance/collateral/monitoring  — Portfolio-wide collateral alerts
POST /compliance/collateral/{asset_id}/ucc — Update UCC filing info
POST /compliance/collateral/{asset_id}/insurance — Update insurance info
POST /compliance/collateral/{asset_id}/appraisal — Update appraisal info
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
from app.models.collateral import PreQualifiedAsset
from app.models.base import Base, TimestampMixin
from app.services.claude_ai import (
    claude_generate_1502,
    claude_generate_audit_package,
    claude_monitor_collateral,
)
from app.services.audit import audit_service

router = APIRouter()
LENDER_ROLES = {UserRole.LENDER, UserRole.LOAN_OFFICER, UserRole.CREDIT_COMMITTEE}


# ── Inline models ─────────────────────────────────────────────────────────────

class SBA1502Report(Base, TimestampMixin):
    __tablename__ = "sba_1502_reports"
    id = Column(Integer, primary_key=True)
    lender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    reporting_month = Column(Integer, nullable=False)
    reporting_year = Column(Integer, nullable=False)
    status = Column(String(50), nullable=False, default="draft")
    loan_count = Column(Integer, nullable=True)
    total_guaranteed_balance = Column(Float, nullable=True)
    report_data = Column(JSON, nullable=True)
    validation_errors = Column(JSON, nullable=True)
    generated_at = Column(DateTime, nullable=True)
    submitted_at = Column(DateTime, nullable=True)


class SBAAuditFile(Base, TimestampMixin):
    __tablename__ = "sba_audit_files"
    id = Column(Integer, primary_key=True)
    loan_id = Column(Integer, ForeignKey("executed_loans.id"), nullable=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    lender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    audit_readiness_score = Column(Integer, nullable=True)
    checklist = Column(JSON, nullable=True)
    missing_items = Column(JSON, nullable=True)
    ai_package = Column(JSON, nullable=True)
    last_reviewed_at = Column(DateTime, nullable=True)
    package_generated_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)


# ── Request schemas ───────────────────────────────────────────────────────────

class Generate1502Request(BaseModel):
    reporting_month: int
    reporting_year: int


class UCCUpdate(BaseModel):
    ucc_filing_number: Optional[str] = None
    ucc_filing_date: Optional[date] = None
    ucc_expiration_date: Optional[date] = None
    ucc_filing_state: Optional[str] = None
    ucc_continuation_due: Optional[date] = None


class InsuranceUpdate(BaseModel):
    insurance_carrier: Optional[str] = None
    insurance_policy_number: Optional[str] = None
    insurance_expiration: Optional[date] = None
    insurance_coverage_amount: Optional[float] = None
    insurance_verified_date: Optional[date] = None


class AppraisalUpdate(BaseModel):
    appraisal_date: Optional[date] = None
    appraisal_value: Optional[float] = None
    appraisal_firm: Optional[str] = None
    appraisal_next_due: Optional[date] = None


class ChecklistUpdate(BaseModel):
    tab_number: int
    item: str
    completed: bool
    notes: Optional[str] = None


# ── SBA 1502 Reporting ────────────────────────────────────────────────────────

@router.post("/1502/generate")
async def generate_1502_report(
    data: Generate1502Request,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Generate SBA Form 1502 monthly report for all active loans."""
    if current_user.role not in LENDER_ROLES and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Lender access required")

    # Get all active loans for this lender
    loans_q = db.query(ExecutedLoan).filter(ExecutedLoan.lender_id == current_user.id)
    loans = loans_q.all()

    if not loans:
        raise HTTPException(status_code=400, detail="No active loans found for this lender.")

    # Build loan data for Claude
    loans_data = []
    for loan in loans:
        # Get latest payment
        last_payment = db.query(LoanPayment).filter(
            LoanPayment.loan_id == loan.id
        ).order_by(LoanPayment.payment_date.desc()).first()

        # Calculate interest accrued (simple: balance × rate / 12)
        interest_this_period = round(
            (loan.current_principal_balance or 0) * (loan.interest_rate or 0) / 12, 2
        )

        loans_data.append({
            "sba_loan_number": loan.loan_number,
            "borrower_name": f"Loan #{loan.loan_number}",
            "original_amount": loan.principal_amount,
            "current_balance": loan.current_principal_balance,
            "guarantee_pct": (loan.guarantee_percentage or 0.75),
            "guaranteed_balance": round((loan.current_principal_balance or 0) * (loan.guarantee_percentage or 0.75), 2),
            "interest_rate": loan.interest_rate,
            "days_past_due": loan.days_past_due or 0,
            "status": loan.status.value if loan.status else "active",
            "maturity_date": str(loan.maturity_date) if loan.maturity_date else None,
            "last_payment_date": str(last_payment.payment_date) if last_payment else None,
            "principal_paid_last_period": last_payment.principal_portion if last_payment else 0,
            "interest_accrued_this_period": interest_this_period,
            "industry": loan.industry,
        })

    loop = asyncio.get_running_loop()
    report = await loop.run_in_executor(None, lambda: claude_generate_1502(
        loans=loans_data,
        month=data.reporting_month,
        year=data.reporting_year,
        lender_name=current_user.company_name or current_user.full_name,
    ))

    if not report:
        raise HTTPException(status_code=503, detail="AI service unavailable.")

    # Save report record
    rec = SBA1502Report(
        lender_id=current_user.id,
        reporting_month=data.reporting_month,
        reporting_year=data.reporting_year,
        status="draft",
        loan_count=len(loans),
        total_guaranteed_balance=report.get("summary", {}).get("total_guaranteed_balance"),
        report_data=report,
        validation_errors=report.get("validation_errors", []),
        generated_at=datetime.utcnow(),
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)

    audit_service.log(db=db, action="1502_generated", entity_type="1502_report",
                      entity_id=rec.id, user_id=current_user.id,
                      details={"month": data.reporting_month, "year": data.reporting_year})

    return {"report_id": rec.id, "status": "draft", **report}


@router.get("/1502/")
async def list_1502_reports(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """List all 1502 reports for this lender."""
    if current_user.role not in LENDER_ROLES and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Lender access required")

    reports = db.query(SBA1502Report).filter(
        SBA1502Report.lender_id == current_user.id
    ).order_by(SBA1502Report.reporting_year.desc(), SBA1502Report.reporting_month.desc()).all()

    return {"reports": [{
        "id": r.id, "month": r.reporting_month, "year": r.reporting_year,
        "status": r.status, "loan_count": r.loan_count,
        "total_guaranteed_balance": r.total_guaranteed_balance,
        "ready_to_submit": r.report_data.get("ready_to_submit") if r.report_data else False,
        "validation_errors": len(r.validation_errors or []),
        "generated_at": r.generated_at.isoformat() if r.generated_at else None,
        "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
    } for r in reports]}


@router.get("/1502/{report_id}")
async def get_1502_report(
    report_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get a specific 1502 report."""
    report = db.query(SBA1502Report).filter(
        SBA1502Report.id == report_id,
        SBA1502Report.lender_id == current_user.id,
    ).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return {"report_id": report.id, "status": report.status, **(report.report_data or {})}


@router.put("/1502/{report_id}/submit")
async def submit_1502_report(
    report_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Mark a 1502 report as submitted to SBA."""
    report = db.query(SBA1502Report).filter(
        SBA1502Report.id == report_id,
        SBA1502Report.lender_id == current_user.id,
    ).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    report.status = "submitted"
    report.submitted_at = datetime.utcnow()
    db.commit()

    audit_service.log(db=db, action="1502_submitted", entity_type="1502_report",
                      entity_id=report_id, user_id=current_user.id)
    return {"report_id": report_id, "status": "submitted", "submitted_at": report.submitted_at.isoformat()}


# ── SBA Audit Preparation ─────────────────────────────────────────────────────

@router.get("/audit/{deal_id}")
async def get_audit_file(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get the audit file for a deal."""
    audit_file = db.query(SBAAuditFile).filter(
        SBAAuditFile.deal_id == deal_id,
        SBAAuditFile.lender_id == current_user.id,
    ).first()

    if not audit_file:
        return {"deal_id": deal_id, "exists": False, "readiness_score": None, "ai_package": None}

    return {
        "deal_id": deal_id, "exists": True,
        "audit_file_id": audit_file.id,
        "readiness_score": audit_file.audit_readiness_score,
        "checklist": audit_file.checklist,
        "missing_items": audit_file.missing_items,
        "ai_package": audit_file.ai_package,
        "last_reviewed_at": audit_file.last_reviewed_at.isoformat() if audit_file.last_reviewed_at else None,
        "package_generated_at": audit_file.package_generated_at.isoformat() if audit_file.package_generated_at else None,
    }


@router.post("/audit/{deal_id}/generate")
async def generate_audit_package(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Generate or refresh the AI audit readiness package for a deal."""
    if current_user.role not in LENDER_ROLES and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Lender access required")

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
            "origination_date": str(loan.origination_date) if loan.origination_date else None,
        }
        payments_q = db.query(LoanPayment).filter(
            LoanPayment.loan_id == loan.id
        ).order_by(LoanPayment.payment_date.desc()).limit(24).all()
        payments = [{"is_late": p.is_late, "days_late": p.days_late or 0} for p in payments_q]

    risk_report = {}
    if rpt:
        risk_report = {
            "dscr_base": rpt.dscr_base, "sba_eligible": rpt.sba_eligible,
            "health_score": rpt.health_score, "collateral_coverage": rpt.collateral_coverage,
        }

    # Get documents
    documents = [{"document_type": d.document_type, "filename": d.original_filename}
                 for d in deal.documents] if deal.documents else []

    # Get covenants and reviews from Sprint 1 tables (if they exist)
    try:
        from app.api.v1.endpoints.servicing import LoanCovenant, CovenantCheck, AnnualReview
        covenants = db.query(LoanCovenant).filter(LoanCovenant.deal_id == deal_id).all()
        covenant_status = [{"name": c.name, "type": c.covenant_type} for c in covenants]
        reviews = db.query(AnnualReview).filter(AnnualReview.deal_id == deal_id).all()
        annual_reviews = [{"review_year": r.review_year, "status": r.status,
                           "risk_rating": r.ai_report.get("risk_rating") if r.ai_report else None}
                          for r in reviews]
    except Exception:
        covenant_status = []
        annual_reviews = []

    loop = asyncio.get_running_loop()
    package = await loop.run_in_executor(None, lambda: claude_generate_audit_package(
        deal_data=deal_data,
        loan_data=loan_data,
        risk_report=risk_report,
        documents=documents,
        payment_history=payments,
        covenant_status=covenant_status,
        annual_reviews=annual_reviews,
    ))

    if not package:
        raise HTTPException(status_code=503, detail="AI service unavailable.")

    # Save or update audit file
    audit_file = db.query(SBAAuditFile).filter(
        SBAAuditFile.deal_id == deal_id,
        SBAAuditFile.lender_id == current_user.id,
    ).first()

    if not audit_file:
        audit_file = SBAAuditFile(
            deal_id=deal_id,
            loan_id=loan.id if loan else None,
            lender_id=current_user.id,
        )
        db.add(audit_file)

    audit_file.audit_readiness_score = package.get("readiness_score")
    audit_file.ai_package = package
    audit_file.missing_items = package.get("critical_gaps", [])
    audit_file.last_reviewed_at = datetime.utcnow()
    audit_file.package_generated_at = datetime.utcnow()
    db.commit()
    db.refresh(audit_file)

    audit_service.log(db=db, action="audit_package_generated", entity_type="deal",
                      entity_id=deal_id, user_id=current_user.id)
    return {"audit_file_id": audit_file.id, "deal_id": deal_id, **package}


@router.put("/audit/{deal_id}/checklist")
async def update_checklist(
    deal_id: int,
    update: ChecklistUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Mark a checklist item as complete/incomplete."""
    audit_file = db.query(SBAAuditFile).filter(
        SBAAuditFile.deal_id == deal_id,
        SBAAuditFile.lender_id == current_user.id,
    ).first()
    if not audit_file:
        raise HTTPException(status_code=404, detail="Audit file not found. Generate a package first.")

    checklist = audit_file.checklist or {}
    tab_key = str(update.tab_number)
    if tab_key not in checklist:
        checklist[tab_key] = {}
    checklist[tab_key][update.item] = {"completed": update.completed, "notes": update.notes}
    audit_file.checklist = checklist
    db.commit()
    return {"updated": True, "tab": update.tab_number, "item": update.item, "completed": update.completed}


# ── Collateral Monitoring ─────────────────────────────────────────────────────

@router.get("/collateral/monitoring")
async def get_collateral_monitoring(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get portfolio-wide collateral monitoring alerts."""
    assets = db.query(PreQualifiedAsset).filter(
        PreQualifiedAsset.borrower_id == current_user.id,
        PreQualifiedAsset.is_active == True,
    ).all()

    if not assets:
        return {"portfolio_health": "healthy", "alerts": [], "total_collateral_value": 0,
                "message": "No collateral assets on file."}

    assets_data = [{
        "id": a.id, "name": a.name, "category": a.category.value if a.category else "other",
        "estimated_value": a.estimated_value, "collateral_value": a.collateral_value,
        "ucc_filing_number": getattr(a, "ucc_filing_number", None),
        "ucc_expiration_date": str(getattr(a, "ucc_expiration_date", None) or ""),
        "ucc_continuation_due": str(getattr(a, "ucc_continuation_due", None) or ""),
        "insurance_expiration": str(getattr(a, "insurance_expiration", None) or ""),
        "insurance_carrier": getattr(a, "insurance_carrier", None),
        "appraisal_date": str(getattr(a, "appraisal_date", None) or ""),
        "appraisal_next_due": str(getattr(a, "appraisal_next_due", None) or ""),
        "last_inspection_date": str(getattr(a, "last_inspection_date", None) or ""),
    } for a in assets]

    import datetime
    today_str = datetime.date.today().isoformat()

    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(None, lambda: claude_monitor_collateral(assets_data, today_str))

    if not result:
        # Fallback: basic date checks without AI
        alerts = []
        today = datetime.date.today()
        for a in assets:
            exp = getattr(a, "ucc_expiration_date", None)
            if exp and (exp - today).days <= 90:
                alerts.append({"asset_name": a.name, "alert_type": "ucc_expiring",
                                "severity": "critical" if (exp - today).days <= 30 else "high",
                                "due_date": str(exp), "message": f"UCC filing expires {exp}"})
            ins = getattr(a, "insurance_expiration", None)
            if ins and (ins - today).days <= 60:
                alerts.append({"asset_name": a.name, "alert_type": "insurance_expiring",
                                "severity": "critical" if (ins - today).days <= 14 else "high",
                                "due_date": str(ins), "message": f"Insurance expires {ins}"})
        return {"portfolio_health": "critical" if alerts else "healthy", "alerts": alerts,
                "total_collateral_value": sum(a.collateral_value or 0 for a in assets)}

    return result


@router.post("/collateral/{asset_id}/ucc")
async def update_ucc_info(
    asset_id: int,
    data: UCCUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Update UCC filing information for a collateral asset."""
    asset = db.query(PreQualifiedAsset).filter(
        PreQualifiedAsset.id == asset_id,
        PreQualifiedAsset.borrower_id == current_user.id,
    ).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    for field, value in data.dict(exclude_none=True).items():
        if hasattr(asset, field):
            setattr(asset, field, value)
    db.commit()

    audit_service.log(db=db, action="ucc_updated", entity_type="asset",
                      entity_id=asset_id, user_id=current_user.id)
    return {"asset_id": asset_id, "updated": True}


@router.post("/collateral/{asset_id}/insurance")
async def update_insurance_info(
    asset_id: int,
    data: InsuranceUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Update insurance information for a collateral asset."""
    asset = db.query(PreQualifiedAsset).filter(
        PreQualifiedAsset.id == asset_id,
        PreQualifiedAsset.borrower_id == current_user.id,
    ).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    for field, value in data.dict(exclude_none=True).items():
        if hasattr(asset, field):
            setattr(asset, field, value)
    db.commit()

    audit_service.log(db=db, action="insurance_updated", entity_type="asset",
                      entity_id=asset_id, user_id=current_user.id)
    return {"asset_id": asset_id, "updated": True}


@router.post("/collateral/{asset_id}/appraisal")
async def update_appraisal_info(
    asset_id: int,
    data: AppraisalUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Update appraisal information for a collateral asset."""
    asset = db.query(PreQualifiedAsset).filter(
        PreQualifiedAsset.id == asset_id,
        PreQualifiedAsset.borrower_id == current_user.id,
    ).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    for field, value in data.dict(exclude_none=True).items():
        if hasattr(asset, field):
            setattr(asset, field, value)
    db.commit()

    audit_service.log(db=db, action="appraisal_updated", entity_type="asset",
                      entity_id=asset_id, user_id=current_user.id)
    return {"asset_id": asset_id, "updated": True}
