"""
Notification system

Notifications are created by backend events and read by the frontend.
Types: covenant_breach, collateral_expiry, proposal_received, contract_ready,
       ai_evaluation_complete, qbr_ready, crisis_update, review_decision,
       system, general

GET  /notifications/          — Get my unread + recent notifications
POST /notifications/read/{id} — Mark one read
POST /notifications/read-all  — Mark all read
POST /notifications/          — Create (internal use / admin)
"""
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, Boolean, Text, JSON, DateTime, ForeignKey
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User
from app.models.base import Base

router = APIRouter()


class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    type = Column(String(100), nullable=False)       # covenant_breach, proposal_received, etc.
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    link = Column(String(500), nullable=True)        # deep link to relevant page
    data = Column(JSON, nullable=True)               # extra context
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class NotificationCreate(BaseModel):
    user_id: int
    type: str
    title: str
    message: str
    link: Optional[str] = None
    data: Optional[dict] = None


def create_notification(db: Session, user_id: int, type: str, title: str, message: str,
                        link: str = None, data: dict = None) -> Notification:
    """Helper called by other endpoints to create notifications."""
    n = Notification(user_id=user_id, type=type, title=title,
                     message=message, link=link, data=data)
    db.add(n)
    db.flush()  # Don't commit — caller controls transaction
    return n


@router.get("/")
async def get_notifications(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    notifications = db.query(Notification).filter(
        Notification.user_id == current_user.id
    ).order_by(Notification.created_at.desc()).limit(50).all()

    unread = sum(1 for n in notifications if not n.is_read)

    return {
        "unread_count": unread,
        "notifications": [{
            "id": n.id, "type": n.type, "title": n.title,
            "message": n.message, "link": n.link, "data": n.data,
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat(),
            "time_ago": _time_ago(n.created_at),
        } for n in notifications]
    }


@router.post("/read/{notification_id}")
async def mark_read(
    notification_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    n = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id,
    ).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.is_read = True
    db.commit()
    return {"id": notification_id, "is_read": True}


@router.post("/read-all")
async def mark_all_read(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False,
    ).update({"is_read": True})
    db.commit()
    return {"message": "All notifications marked as read"}


def _time_ago(dt: datetime) -> str:
    diff = datetime.utcnow() - dt
    seconds = diff.total_seconds()
    if seconds < 60: return "Just now"
    if seconds < 3600: return f"{int(seconds // 60)}m ago"
    if seconds < 86400: return f"{int(seconds // 3600)}h ago"
    return f"{int(seconds // 86400)}d ago"
