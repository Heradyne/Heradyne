"""
Employee Ownership KPI Module

Owner (borrower) endpoints:
POST /employee-kpi/invite                  — Invite an employee
GET  /employee-kpi/employees               — List my employees
POST /employee-kpi/business-kpis           — Create a business KPI
GET  /employee-kpi/business-kpis           — List my business KPIs
POST /employee-kpi/employee-kpis           — Assign KPI to employee
GET  /employee-kpi/review-queue            — Submissions awaiting review
POST /employee-kpi/contributions/{id}/review — Review a submission
GET  /employee-kpi/dashboard               — Owner aggregate dashboard

Employee endpoints:
GET  /employee-kpi/my-kpis                 — My assigned KPIs
POST /employee-kpi/contributions           — Submit a contribution
GET  /employee-kpi/my-contributions        — My submission history
POST /employee-kpi/contributions/{id}/withdraw — Withdraw a submission
POST /employee-kpi/contributions/{id}/discuss  — Add to discussion thread
GET  /employee-kpi/business-snapshot       — Curated business health view
"""

import asyncio
import secrets
from datetime import date, datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, Float, Boolean, Text, JSON, Date, DateTime, ForeignKey
from pydantic import BaseModel, EmailStr

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User, UserRole
from app.models.deal import Deal, DealRiskReport
from app.models.base import Base as _Base
from app.services.claude_ai import claude_evaluate_contribution
from app.services.audit import audit_service

router = APIRouter()

OWNER_ROLES = {UserRole.BORROWER, UserRole.ADMIN}
EMPLOYEE_ROLE = "employee"  # stored as string, no enum change needed


# ── Inline models ─────────────────────────────────────────────────────────────

from app.models.base import Base as _Base

class BusinessKPI(_Base):
    __tablename__ = "business_kpis"
    id = Column(Integer, primary_key=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(50), nullable=False)
    target_value = Column(Float, nullable=True)
    unit = Column(String(50), nullable=True)
    period = Column(String(50), nullable=False, default="annual")
    weight = Column(Integer, nullable=False, default=1)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class EmployeeKPI(_Base):
    __tablename__ = "employee_kpis"
    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    business_kpi_id = Column(Integer, ForeignKey("business_kpis.id"), nullable=False)
    personal_target = Column(Float, nullable=True)
    measurement_method = Column(Text, nullable=True)
    role_description = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Contribution(_Base):
    __tablename__ = "contributions"
    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=True)
    type = Column(String(50), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String(50), nullable=False)
    status = Column(String(50), nullable=False, default="pending")
    evidence = Column(Text, nullable=True)
    action_date = Column(Date, nullable=True)
    final_value = Column(Float, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    withdrawn_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class AIEvaluation(_Base):
    __tablename__ = "ai_evaluations"
    id = Column(Integer, primary_key=True)
    contribution_id = Column(Integer, ForeignKey("contributions.id"), nullable=False)
    value_low = Column(Float, nullable=True)
    value_mid = Column(Float, nullable=True)
    value_high = Column(Float, nullable=True)
    value_unit = Column(String(50), nullable=True)
    reasoning = Column(JSON, nullable=True)
    linked_kpis = Column(JSON, nullable=True)
    confidence = Column(String(20), nullable=True)
    confidence_reason = Column(Text, nullable=True)
    clarifying_questions = Column(JSON, nullable=True)
    is_intangible = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class ManagerReview(_Base):
    __tablename__ = "manager_reviews"
    id = Column(Integer, primary_key=True)
    contribution_id = Column(Integer, ForeignKey("contributions.id"), nullable=False)
    manager_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    decision = Column(String(20), nullable=False)
    adjusted_value = Column(Float, nullable=True)
    notes = Column(Text, nullable=False)
    reviewed_at = Column(DateTime, default=datetime.utcnow)


class Discussion(_Base):
    __tablename__ = "contribution_discussions"
    id = Column(Integer, primary_key=True)
    contribution_id = Column(Integer, ForeignKey("contributions.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class EmployeeInvite(_Base):
    __tablename__ = "employee_invites"
    id = Column(Integer, primary_key=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    email = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    job_title = Column(String(255), nullable=True)
    token = Column(String(64), unique=True, nullable=False)
    accepted_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


# ── Request schemas ───────────────────────────────────────────────────────────

class InviteEmployee(BaseModel):
    email: str
    full_name: str
    job_title: Optional[str] = None


class BusinessKPICreate(BaseModel):
    name: str
    description: Optional[str] = None
    category: str  # revenue, cost_savings, risk_reduction, culture
    target_value: Optional[float] = None
    unit: Optional[str] = None
    period: str = "annual"
    weight: int = 1
    deal_id: Optional[int] = None


class EmployeeKPICreate(BaseModel):
    employee_id: int
    business_kpi_id: int
    personal_target: Optional[float] = None
    measurement_method: Optional[str] = None
    role_description: Optional[str] = None


class ContributionCreate(BaseModel):
    type: str  # suggestion, above_beyond
    title: str
    description: str
    category: str  # revenue, cost_savings, risk_reduction, culture, other
    evidence: Optional[str] = None
    action_date: Optional[date] = None


class ReviewCreate(BaseModel):
    decision: str  # agree, adjust, decline
    notes: str
    adjusted_value: Optional[float] = None


class DiscussionMessage(BaseModel):
    message: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_owner(user: User) -> bool:
    return user.role in OWNER_ROLES or user.role == UserRole.ADMIN

def _is_employee(user: User) -> bool:
    return str(user.role) == EMPLOYEE_ROLE or (
        user.role == UserRole.BORROWER and user.organization_id is not None
    )

def _get_owner_id(user: User) -> int:
    """Get the owner (borrower) this user belongs to."""
    if user.organization_id:
        return user.organization_id
    return user.id

def _serialize_contribution(c: Contribution, eval: AIEvaluation = None, review: ManagerReview = None, msgs: list = None) -> dict:
    return {
        "id": c.id, "type": c.type, "title": c.title, "description": c.description,
        "category": c.category, "status": c.status, "evidence": c.evidence,
        "action_date": str(c.action_date) if c.action_date else None,
        "final_value": c.final_value, "created_at": c.created_at.isoformat(),
        "ai_evaluation": {
            "value_low": eval.value_low, "value_mid": eval.value_mid, "value_high": eval.value_high,
            "value_unit": eval.value_unit, "is_intangible": eval.is_intangible,
            "confidence": eval.confidence, "confidence_reason": eval.confidence_reason,
            "reasoning": eval.reasoning, "linked_kpis": eval.linked_kpis,
            "clarifying_questions": eval.clarifying_questions, "summary": (eval.reasoning or [{}])[0].get("detail", "") if eval.reasoning else "",
        } if eval else None,
        "manager_review": {
            "decision": review.decision, "notes": review.notes,
            "adjusted_value": review.adjusted_value,
            "reviewed_at": review.reviewed_at.isoformat(),
        } if review else None,
        "discussion": [{"user_id": m.user_id, "message": m.message, "created_at": m.created_at.isoformat()} for m in (msgs or [])],
    }


# ── Owner: Invite employees ───────────────────────────────────────────────────

@router.post("/invite")
async def invite_employee(
    data: InviteEmployee,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    if not _is_owner(current_user):
        raise HTTPException(status_code=403, detail="Owner access required")

    token = secrets.token_urlsafe(32)
    invite = EmployeeInvite(
        owner_id=current_user.id,
        email=data.email,
        full_name=data.full_name,
        job_title=data.job_title,
        token=token,
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    db.add(invite)
    db.commit()

    # In production: send email. For now return the token/link directly.
    frontend_url = "https://considerate-expression-production-cc9f.up.railway.app"
    invite_link = f"{frontend_url}/accept-invite?token={token}"

    return {
        "invite_id": invite.id, "email": data.email, "token": token,
        "invite_link": invite_link, "expires_at": invite.expires_at.isoformat(),
        "message": f"Share this link with {data.full_name}: {invite_link}"
    }


@router.post("/accept-invite")
async def accept_invite(
    token: str,
    password: str,
    db: Session = Depends(get_db),
):
    """Accept an employee invite and create the employee account."""
    invite = db.query(EmployeeInvite).filter(
        EmployeeInvite.token == token,
        EmployeeInvite.accepted_at == None,
        EmployeeInvite.expires_at > datetime.utcnow(),
    ).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invalid or expired invite link")

    # Check email not already taken
    existing = db.query(User).filter(User.email == invite.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

    employee = User(
        email=invite.email,
        full_name=invite.full_name,
        hashed_password=pwd_context.hash(password),
        role=UserRole.BORROWER,  # Use BORROWER role — scoped by organization_id
        organization_id=invite.owner_id,  # Links to owner
        company_name=None,
        is_active=True,
    )
    # Store job title
    if hasattr(employee, 'job_title'):
        employee.job_title = invite.job_title

    db.add(employee)
    invite.accepted_at = datetime.utcnow()
    db.commit()
    db.refresh(employee)

    return {"message": "Account created", "email": employee.email, "id": employee.id}


@router.get("/employees")
async def list_employees(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """List all employees for this owner."""
    if not _is_owner(current_user):
        raise HTTPException(status_code=403, detail="Owner access required")

    employees = db.query(User).filter(
        User.organization_id == current_user.id,
        User.deleted_at == None,
    ).all()

    result = []
    for emp in employees:
        # Count contributions
        count = db.query(Contribution).filter(Contribution.employee_id == emp.id).count()
        pending = db.query(Contribution).filter(
            Contribution.employee_id == emp.id,
            Contribution.status == "pending"
        ).count()
        total_value = db.query(Contribution).filter(
            Contribution.employee_id == emp.id,
            Contribution.final_value != None,
        ).all()
        result.append({
            "id": emp.id, "full_name": emp.full_name, "email": emp.email,
            "job_title": getattr(emp, "job_title", None),
            "contribution_count": count, "pending_review": pending,
            "total_approved_value": sum(c.final_value or 0 for c in total_value),
        })
    return {"employees": result}


# ── Owner: Business KPIs ──────────────────────────────────────────────────────

@router.post("/business-kpis")
async def create_business_kpi(
    data: BusinessKPICreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    if not _is_owner(current_user):
        raise HTTPException(status_code=403, detail="Owner access required")

    kpi = BusinessKPI(
        owner_id=current_user.id,
        deal_id=data.deal_id,
        name=data.name, description=data.description, category=data.category,
        target_value=data.target_value, unit=data.unit, period=data.period,
        weight=data.weight,
    )
    db.add(kpi)
    db.commit()
    db.refresh(kpi)
    return {"id": kpi.id, "name": kpi.name, "category": kpi.category}


@router.get("/business-kpis")
async def list_business_kpis(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    owner_id = _get_owner_id(current_user)
    kpis = db.query(BusinessKPI).filter(
        BusinessKPI.owner_id == owner_id, BusinessKPI.is_active == True
    ).all()
    return {"kpis": [{
        "id": k.id, "name": k.name, "description": k.description,
        "category": k.category, "target_value": k.target_value, "unit": k.unit,
        "period": k.period, "weight": k.weight,
    } for k in kpis]}


@router.post("/employee-kpis")
async def assign_employee_kpi(
    data: EmployeeKPICreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    if not _is_owner(current_user):
        raise HTTPException(status_code=403, detail="Owner access required")

    ekpi = EmployeeKPI(**data.dict())
    db.add(ekpi)
    db.commit()
    db.refresh(ekpi)
    return {"id": ekpi.id, "employee_id": ekpi.employee_id, "business_kpi_id": ekpi.business_kpi_id}


# ── Owner: Review queue ───────────────────────────────────────────────────────

@router.get("/review-queue")
async def get_review_queue(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    if not _is_owner(current_user):
        raise HTTPException(status_code=403, detail="Owner access required")

    pending = db.query(Contribution).filter(
        Contribution.owner_id == current_user.id,
        Contribution.status.in_(["pending", "under_review"]),
        Contribution.withdrawn_at == None,
    ).order_by(Contribution.created_at.desc()).all()

    result = []
    for c in pending:
        emp = db.query(User).filter(User.id == c.employee_id).first()
        ev = db.query(AIEvaluation).filter(AIEvaluation.contribution_id == c.id).first()
        result.append({
            **_serialize_contribution(c, ev),
            "employee_name": emp.full_name if emp else "Unknown",
            "employee_email": emp.email if emp else "",
        })
    return {"pending_count": len(result), "contributions": result}


@router.post("/contributions/{contribution_id}/review")
async def review_contribution(
    contribution_id: int,
    data: ReviewCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    if not _is_owner(current_user):
        raise HTTPException(status_code=403, detail="Owner access required")

    if not data.notes:
        raise HTTPException(status_code=400, detail="Notes are required when reviewing a contribution")

    c = db.query(Contribution).filter(
        Contribution.id == contribution_id,
        Contribution.owner_id == current_user.id,
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contribution not found")

    review = ManagerReview(
        contribution_id=contribution_id,
        manager_id=current_user.id,
        decision=data.decision,
        notes=data.notes,
        adjusted_value=data.adjusted_value,
    )
    db.add(review)

    # Update contribution status and final value
    if data.decision == "agree":
        ev = db.query(AIEvaluation).filter(AIEvaluation.contribution_id == contribution_id).first()
        c.final_value = ev.value_mid if ev else None
        c.status = "accepted"
        c.approved_at = datetime.utcnow()
    elif data.decision == "adjust":
        c.final_value = data.adjusted_value
        c.status = "accepted"
        c.approved_at = datetime.utcnow()
    elif data.decision == "decline":
        c.status = "declined"

    db.commit()
    audit_service.log(db=db, action="contribution_reviewed", entity_type="contribution",
                      entity_id=contribution_id, user_id=current_user.id,
                      details={"decision": data.decision})
    return {"contribution_id": contribution_id, "decision": data.decision, "status": c.status}


@router.get("/dashboard")
async def owner_dashboard(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    if not _is_owner(current_user):
        raise HTTPException(status_code=403, detail="Owner access required")

    all_contributions = db.query(Contribution).filter(
        Contribution.owner_id == current_user.id,
        Contribution.withdrawn_at == None,
    ).all()

    accepted = [c for c in all_contributions if c.status in ("accepted", "implemented")]
    pending = [c for c in all_contributions if c.status in ("pending", "under_review")]

    total_value = sum(c.final_value or 0 for c in accepted)

    by_category: dict = {}
    for c in accepted:
        by_category[c.category] = by_category.get(c.category, 0) + (c.final_value or 0)

    by_type = {
        "suggestion": len([c for c in accepted if c.type == "suggestion"]),
        "above_beyond": len([c for c in accepted if c.type == "above_beyond"]),
    }

    employees = db.query(User).filter(User.organization_id == current_user.id).all()
    top_contributors = []
    for emp in employees:
        emp_value = sum(c.final_value or 0 for c in accepted if c.employee_id == emp.id)
        if emp_value > 0:
            top_contributors.append({"name": emp.full_name, "value": emp_value,
                                     "count": len([c for c in accepted if c.employee_id == emp.id])})
    top_contributors.sort(key=lambda x: x["value"], reverse=True)

    return {
        "total_employees": len(employees),
        "total_contributions": len(all_contributions),
        "pending_review": len(pending),
        "total_approved_value": total_value,
        "value_by_category": by_category,
        "value_by_type": by_type,
        "top_contributors": top_contributors[:5],
        "recent_accepted": [_serialize_contribution(c) for c in sorted(accepted, key=lambda x: x.created_at, reverse=True)[:5]],
    }


# ── Employee: Submit & manage contributions ───────────────────────────────────

@router.post("/contributions")
async def submit_contribution(
    data: ContributionCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    if not current_user.organization_id:
        raise HTTPException(status_code=403, detail="Employee access required — no owner linked to your account")

    owner_id = current_user.organization_id

    # Get owner's deal for context
    owner_deal = db.query(Deal).filter(Deal.borrower_id == owner_id).first()

    c = Contribution(
        employee_id=current_user.id,
        owner_id=owner_id,
        deal_id=owner_deal.id if owner_deal else None,
        type=data.type, title=data.title, description=data.description,
        category=data.category, evidence=data.evidence, action_date=data.action_date,
        status="pending",
    )
    db.add(c)
    db.commit()
    db.refresh(c)

    # Run AI evaluation asynchronously
    owner = db.query(User).filter(User.id == owner_id).first()
    risk_report = db.query(DealRiskReport).filter(
        DealRiskReport.deal_id == owner_deal.id
    ).order_by(DealRiskReport.version.desc()).first() if owner_deal else None

    company_context = {
        "industry": owner_deal.industry if owner_deal else "small business",
        "annual_revenue": owner_deal.annual_revenue if owner_deal else 0,
    }

    emp_kpis = db.query(EmployeeKPI).filter(
        EmployeeKPI.employee_id == current_user.id, EmployeeKPI.is_active == True
    ).all()
    biz_kpi_ids = [k.business_kpi_id for k in emp_kpis]
    biz_kpis = db.query(BusinessKPI).filter(BusinessKPI.id.in_(biz_kpi_ids)).all()
    kpi_list = [{"name": k.name, "category": k.category, "target": k.target_value, "unit": k.unit} for k in biz_kpis]

    loop = asyncio.get_running_loop()
    eval_result = await loop.run_in_executor(None, lambda: claude_evaluate_contribution(
        title=data.title, description=data.description, category=data.category,
        contribution_type=data.type, evidence=data.evidence or "",
        employee_kpis=kpi_list, company_context=company_context,
        employee_role=getattr(current_user, "job_title", None) or "Employee",
    ))

    if eval_result:
        ev = AIEvaluation(
            contribution_id=c.id,
            value_low=eval_result.get("value_low"),
            value_mid=eval_result.get("value_mid"),
            value_high=eval_result.get("value_high"),
            value_unit=eval_result.get("value_unit", "$"),
            reasoning=eval_result.get("reasoning"),
            linked_kpis=eval_result.get("linked_kpis"),
            confidence=eval_result.get("confidence"),
            confidence_reason=eval_result.get("confidence_reason"),
            clarifying_questions=eval_result.get("clarifying_questions"),
            is_intangible=eval_result.get("is_intangible", False),
        )
        db.add(ev)
        c.status = "under_review"
        db.commit()

    return _serialize_contribution(c, ev if eval_result else None)


@router.get("/my-contributions")
async def my_contributions(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    contributions = db.query(Contribution).filter(
        Contribution.employee_id == current_user.id,
        Contribution.withdrawn_at == None,
    ).order_by(Contribution.created_at.desc()).all()

    result = []
    for c in contributions:
        ev = db.query(AIEvaluation).filter(AIEvaluation.contribution_id == c.id).first()
        review = db.query(ManagerReview).filter(ManagerReview.contribution_id == c.id).first()
        msgs = db.query(Discussion).filter(Discussion.contribution_id == c.id).order_by(Discussion.created_at).all()
        result.append(_serialize_contribution(c, ev, review, msgs))

    total_accepted = sum((c.get("final_value") or 0) for c in result if c["status"] in ("accepted", "implemented"))
    return {
        "contributions": result,
        "stats": {
            "total": len(result),
            "pending": len([c for c in result if c["status"] == "pending"]),
            "under_review": len([c for c in result if c["status"] == "under_review"]),
            "accepted": len([c for c in result if c["status"] in ("accepted", "implemented")]),
            "declined": len([c for c in result if c["status"] == "declined"]),
            "total_approved_value": total_accepted,
        },
    }


@router.get("/my-kpis")
async def my_kpis(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    emp_kpis = db.query(EmployeeKPI).filter(
        EmployeeKPI.employee_id == current_user.id, EmployeeKPI.is_active == True
    ).all()

    result = []
    for ek in emp_kpis:
        bkpi = db.query(BusinessKPI).filter(BusinessKPI.id == ek.business_kpi_id).first()
        if bkpi:
            # Count accepted contributions toward this KPI
            linked_contributions = db.query(Contribution).filter(
                Contribution.employee_id == current_user.id,
                Contribution.status.in_(["accepted", "implemented"]),
            ).all()
            value_toward_kpi = sum(c.final_value or 0 for c in linked_contributions)

            result.append({
                "employee_kpi_id": ek.id,
                "business_kpi": {"id": bkpi.id, "name": bkpi.name, "category": bkpi.category,
                                  "target_value": bkpi.target_value, "unit": bkpi.unit, "period": bkpi.period},
                "personal_target": ek.personal_target,
                "measurement_method": ek.measurement_method,
                "role_description": ek.role_description,
                "value_contributed": value_toward_kpi,
                "progress_pct": round(value_toward_kpi / ek.personal_target * 100, 1) if ek.personal_target else None,
            })
    return {"kpis": result}


@router.post("/contributions/{contribution_id}/withdraw")
async def withdraw_contribution(
    contribution_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    c = db.query(Contribution).filter(
        Contribution.id == contribution_id,
        Contribution.employee_id == current_user.id,
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contribution not found")
    if c.status not in ("pending", "under_review"):
        raise HTTPException(status_code=400, detail="Can only withdraw pending submissions")

    c.withdrawn_at = datetime.utcnow()
    c.status = "withdrawn"
    db.commit()
    return {"contribution_id": contribution_id, "status": "withdrawn"}


@router.post("/contributions/{contribution_id}/discuss")
async def add_discussion(
    contribution_id: int,
    data: DiscussionMessage,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    c = db.query(Contribution).filter(Contribution.id == contribution_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contribution not found")

    # Only employee or owner can discuss
    if c.employee_id != current_user.id and c.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    msg = Discussion(contribution_id=contribution_id, user_id=current_user.id, message=data.message)
    db.add(msg)

    # If employee responds to a decline, move back to under_review
    if c.status == "declined" and c.employee_id == current_user.id:
        c.status = "under_review"
        c.updated_at = datetime.utcnow()

    db.commit()
    return {"message_id": msg.id, "contribution_id": contribution_id, "status": c.status}


# ── Employee: Business snapshot ───────────────────────────────────────────────

@router.get("/business-snapshot")
async def business_snapshot(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Curated business health view for employees — no sensitive financial details."""
    if not current_user.organization_id:
        raise HTTPException(status_code=403, detail="Employee access required")

    owner_id = current_user.organization_id
    owner = db.query(User).filter(User.id == owner_id).first()
    deal = db.query(Deal).filter(Deal.borrower_id == owner_id).first()

    if not deal:
        return {"message": "Business data not yet available", "has_data": False}

    rpt = db.query(DealRiskReport).filter(
        DealRiskReport.deal_id == deal.id
    ).order_by(DealRiskReport.version.desc()).first()

    # Curated snapshot — meaningful but not sensitive
    snapshot = {
        "has_data": True,
        "business_name": deal.name,
        "industry": deal.industry,
        "health_score": rpt.health_score if rpt else None,
        "health_breakdown": {
            "cashflow": rpt.health_score_cashflow,
            "stability": rpt.health_score_stability,
            "growth": rpt.health_score_growth,
            "liquidity": rpt.health_score_liquidity,
        } if rpt else {},
        # Show valuation range but not precise numbers
        "business_value_range": {
            "low": rpt.equity_value_low, "mid": rpt.equity_value_mid, "high": rpt.equity_value_high,
        } if rpt and rpt.equity_value_mid else None,
        "dscr": rpt.dscr_base if rpt else None,
        "sba_eligible": rpt.sba_eligible if rpt else None,
        # What matters to employees: is the business healthy?
        "status_message": (
            "Business is performing well" if rpt and (rpt.health_score or 0) >= 70
            else "Business needs attention in some areas" if rpt and (rpt.health_score or 0) >= 50
            else "Business is facing challenges"
        ) if rpt else "Health data not yet available",
        # Contribution stats for this employee
        "my_total_value_contributed": sum(
            c.final_value or 0 for c in db.query(Contribution).filter(
                Contribution.employee_id == current_user.id,
                Contribution.status.in_(["accepted", "implemented"]),
            ).all()
        ),
    }
    return snapshot
