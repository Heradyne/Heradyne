"""
Pipeline CRM

GET  /pipeline/                    — Get all pipeline deals for lender
POST /pipeline/{deal_id}/stage     — Move deal to new stage
PUT  /pipeline/{deal_id}/reminder  — Set next action reminder
GET  /pipeline/stats               — Pipeline statistics
"""
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, Float, Boolean, Text, JSON, DateTime, ForeignKey
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User
from app.models.deal import Deal, DealStatus
from app.models.base import Base
from app.services.audit import audit_service

router = APIRouter()

STAGES = ['prospect', 'application', 'underwriting', 'approved', 'closed', 'servicing', 'rejected']

STAGE_COLORS = {
    'prospect':    '#6366f1',
    'application': '#f59e0b',
    'underwriting':'#3b82f6',
    'approved':    '#10b981',
    'closed':      '#059669',
    'servicing':   '#8b5cf6',
    'rejected':    '#ef4444',
}

# Map existing deal statuses to pipeline stages
STATUS_TO_STAGE = {
    'draft':           'prospect',
    'submitted':       'application',
    'analyzing':       'application',
    'analyzed':        'underwriting',
    'matched':         'underwriting',
    'pending_lender':  'underwriting',
    'pending_insurer': 'underwriting',
    'approved':        'approved',
    'funded':          'closed',
    'closed':          'closed',
    'rejected':        'rejected',
}


class PipelineStage(Base):
    __tablename__ = "pipeline_stages"
    id = Column(Integer, primary_key=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    lender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    stage = Column(String(50), nullable=False, default='prospect')
    stage_entered_at = Column(DateTime, default=datetime.utcnow)
    days_in_stage = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    next_action = Column(Text, nullable=True)
    next_action_date = Column(DateTime, nullable=True)
    priority = Column(String(20), default='normal')
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class StageUpdate(BaseModel):
    stage: str
    notes: Optional[str] = None
    next_action: Optional[str] = None
    next_action_date: Optional[str] = None
    priority: Optional[str] = 'normal'


class ReminderUpdate(BaseModel):
    next_action: str
    next_action_date: str
    notes: Optional[str] = None


def _get_or_create_pipeline(db, deal_id, lender_id, deal):
    ps = db.query(PipelineStage).filter(
        PipelineStage.deal_id == deal_id,
        PipelineStage.lender_id == lender_id
    ).first()
    if not ps:
        stage = STATUS_TO_STAGE.get(deal.status.value if hasattr(deal.status, 'value') else str(deal.status), 'prospect')
        ps = PipelineStage(deal_id=deal_id, lender_id=lender_id, stage=stage)
        db.add(ps)
        db.commit()
        db.refresh(ps)
    return ps


def _days_in_stage(ps):
    if ps.stage_entered_at:
        return (datetime.utcnow() - ps.stage_entered_at).days
    return 0


@router.get("/")
async def get_pipeline(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get all deals in the pipeline for this lender, organized by stage."""
    from app.models.deal import DealMatch
    from app.models.user import User as UserModel

    # Get all matches for this lender
    matches = db.query(DealMatch).filter(
        DealMatch.lender_id == current_user.id,
        DealMatch.status.notin_(['rejected'])
    ).all()

    deal_ids = [m.deal_id for m in matches]
    deals = db.query(Deal).filter(Deal.id.in_(deal_ids)).all() if deal_ids else []

    pipeline = {stage: [] for stage in STAGES}

    for deal in deals:
        ps = _get_or_create_pipeline(db, deal.id, current_user.id, deal)
        days = _days_in_stage(ps)

        # Update days_in_stage
        ps.days_in_stage = days
        db.commit()

        entry = {
            "deal_id": deal.id,
            "deal_name": deal.name,
            "business_name": deal.business_name or deal.name,
            "industry": deal.industry,
            "loan_amount": deal.loan_amount_requested,
            "status": deal.status.value if hasattr(deal.status, 'value') else str(deal.status),
            "stage": ps.stage,
            "stage_color": STAGE_COLORS.get(ps.stage, '#6b7280'),
            "days_in_stage": days,
            "priority": ps.priority,
            "notes": ps.notes,
            "next_action": ps.next_action,
            "next_action_date": ps.next_action_date.isoformat() if ps.next_action_date else None,
            "stage_entered_at": ps.stage_entered_at.isoformat() if ps.stage_entered_at else None,
            "pipeline_id": ps.id,
            # Flag overdue
            "is_overdue": ps.next_action_date and ps.next_action_date < datetime.utcnow() if ps.next_action_date else False,
            # Flag stuck (in stage > 14 days)
            "is_stuck": days > 14 and ps.stage not in ('closed', 'servicing', 'rejected'),
        }
        pipeline[ps.stage].append(entry)

    # Sort each stage by priority then days_in_stage
    priority_order = {'urgent': 0, 'high': 1, 'normal': 2, 'low': 3}
    for stage in STAGES:
        pipeline[stage].sort(key=lambda x: (priority_order.get(x['priority'], 2), -x['days_in_stage']))

    stats = {
        "total": sum(len(v) for v in pipeline.values()),
        "by_stage": {s: len(v) for s, v in pipeline.items()},
        "overdue_reminders": sum(1 for v in pipeline.values() for d in v if d['is_overdue']),
        "stuck_deals": sum(1 for v in pipeline.values() for d in v if d['is_stuck']),
    }

    return {"pipeline": pipeline, "stages": STAGES, "stage_colors": STAGE_COLORS, "stats": stats}


@router.post("/{deal_id}/stage")
async def update_stage(
    deal_id: int,
    data: StageUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    if data.stage not in STAGES:
        raise HTTPException(status_code=400, detail=f"Invalid stage. Must be one of: {STAGES}")

    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    ps = _get_or_create_pipeline(db, deal_id, current_user.id, deal)

    old_stage = ps.stage
    ps.stage = data.stage
    ps.stage_entered_at = datetime.utcnow()
    ps.days_in_stage = 0
    ps.notes = data.notes or ps.notes
    ps.priority = data.priority or ps.priority
    ps.updated_at = datetime.utcnow()

    if data.next_action:
        ps.next_action = data.next_action
    if data.next_action_date:
        ps.next_action_date = datetime.fromisoformat(data.next_action_date)

    db.commit()

    audit_service.log(
        db=db, action="pipeline_stage_change",
        entity_type="deal", entity_id=deal_id,
        user_id=current_user.id,
        details={"from": old_stage, "to": data.stage}
    )

    return {"success": True, "pipeline_id": ps.id, "stage": ps.stage, "deal_id": deal_id}


@router.put("/{deal_id}/reminder")
async def set_reminder(
    deal_id: int,
    data: ReminderUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    ps = _get_or_create_pipeline(db, deal_id, current_user.id, deal)
    ps.next_action = data.next_action
    ps.next_action_date = datetime.fromisoformat(data.next_action_date)
    if data.notes:
        ps.notes = data.notes
    ps.updated_at = datetime.utcnow()
    db.commit()

    return {"success": True, "next_action": ps.next_action, "next_action_date": ps.next_action_date.isoformat()}


@router.get("/stats")
async def pipeline_stats(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    stages = db.query(PipelineStage).filter(
        PipelineStage.lender_id == current_user.id
    ).all()

    total_value = 0
    by_stage = {s: {"count": 0, "value": 0} for s in STAGES}

    for ps in stages:
        deal = db.query(Deal).filter(Deal.id == ps.deal_id).first()
        if deal:
            amt = deal.loan_amount_requested or 0
            total_value += amt
            by_stage[ps.stage]["count"] += 1
            by_stage[ps.stage]["value"] += amt

    return {
        "total_deals": len(stages),
        "total_pipeline_value": total_value,
        "by_stage": by_stage,
        "avg_days_in_stage": {
            s: round(sum(p.days_in_stage or 0 for p in stages if p.stage == s) /
                     max(1, sum(1 for p in stages if p.stage == s)), 1)
            for s in STAGES
        }
    }
