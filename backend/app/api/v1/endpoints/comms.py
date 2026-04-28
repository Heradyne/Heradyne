"""
Borrower Communication Hub

GET  /comms/{deal_id}/threads              — Get all threads for a deal
POST /comms/{deal_id}/threads              — Create a new thread
GET  /comms/threads/{thread_id}/messages   — Get messages in thread
POST /comms/threads/{thread_id}/messages   — Send a message
PUT  /comms/threads/{thread_id}/resolve    — Mark thread resolved
POST /comms/{deal_id}/doc-request          — Create document checklist
GET  /comms/{deal_id}/doc-request          — Get document checklist
PUT  /comms/doc-request/{req_id}/item      — Mark item complete
"""
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, Boolean, Text, JSON, DateTime, ForeignKey
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User
from app.models.deal import Deal
from app.models.base import Base

router = APIRouter()


class DealThread(Base):
    __tablename__ = "deal_threads"
    id = Column(Integer, primary_key=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    subject = Column(String(255), nullable=False)
    thread_type = Column(String(50), default='general')
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_resolved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class ThreadMessage(Base):
    __tablename__ = "thread_messages"
    id = Column(Integer, primary_key=True)
    thread_id = Column(Integer, ForeignKey("deal_threads.id"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    body = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class DocRequest(Base):
    __tablename__ = "doc_requests"
    id = Column(Integer, primary_key=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    lender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    items = Column(JSON, nullable=True)
    due_date = Column(DateTime, nullable=True)
    reminder_sent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class CreateThread(BaseModel):
    subject: str
    thread_type: str = 'general'
    initial_message: Optional[str] = None


class SendMessage(BaseModel):
    body: str


class CreateDocRequest(BaseModel):
    items: List[dict]  # [{name, description, required}]
    due_date: Optional[str] = None


class UpdateDocItem(BaseModel):
    item_index: int
    completed: bool


DEFAULT_DOC_CHECKLIST = [
    {"name": "3 Years Business Tax Returns", "description": "Federal business tax returns (Form 1120/1120S/1065)", "required": True, "completed": False},
    {"name": "3 Years Personal Tax Returns", "description": "Personal returns for all owners with 20%+ stake", "required": True, "completed": False},
    {"name": "YTD P&L Statement", "description": "Profit & loss statement through last month", "required": True, "completed": False},
    {"name": "YTD Balance Sheet", "description": "Balance sheet dated within 60 days", "required": True, "completed": False},
    {"name": "12 Months Bank Statements", "description": "All business checking and savings accounts", "required": True, "completed": False},
    {"name": "Business Debt Schedule", "description": "All existing business debts with terms", "required": True, "completed": False},
    {"name": "Business Plan / Executive Summary", "description": "Description of business, market, and use of proceeds", "required": False, "completed": False},
    {"name": "A/R and A/P Aging", "description": "Accounts receivable and payable aging reports", "required": False, "completed": False},
    {"name": "Copy of Business Lease", "description": "Current lease agreement for business location", "required": False, "completed": False},
    {"name": "Articles of Incorporation", "description": "Business formation documents", "required": False, "completed": False},
    {"name": "Owner's Resume/Bio", "description": "Background of owners/operators", "required": False, "completed": False},
    {"name": "SBA Form 413 (Personal Financial Statement)", "description": "Personal financial statement for each owner", "required": True, "completed": False},
    {"name": "SBA Form 1919 (Borrower Information)", "description": "Completed SBA borrower information form", "required": True, "completed": False},
    {"name": "Environmental Questionnaire", "description": "Phase I/II environmental if real estate involved", "required": False, "completed": False},
]


@router.get("/{deal_id}/threads")
async def get_threads(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    threads = db.query(DealThread).filter(DealThread.deal_id == deal_id).order_by(DealThread.created_at.desc()).all()
    result = []
    for t in threads:
        msgs = db.query(ThreadMessage).filter(ThreadMessage.thread_id == t.id).all()
        unread = sum(1 for m in msgs if not m.is_read and m.sender_id != current_user.id)
        creator = db.query(User).filter(User.id == t.created_by).first()
        result.append({
            "id": t.id,
            "subject": t.subject,
            "thread_type": t.thread_type,
            "is_resolved": t.is_resolved,
            "message_count": len(msgs),
            "unread_count": unread,
            "created_by": creator.full_name or creator.email if creator else "Unknown",
            "created_at": t.created_at.isoformat(),
            "last_message_at": msgs[-1].created_at.isoformat() if msgs else t.created_at.isoformat(),
        })
    return {"threads": result, "total_unread": sum(t["unread_count"] for t in result)}


@router.post("/{deal_id}/threads")
async def create_thread(
    deal_id: int,
    data: CreateThread,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    thread = DealThread(
        deal_id=deal_id,
        subject=data.subject,
        thread_type=data.thread_type,
        created_by=current_user.id,
    )
    db.add(thread)
    db.flush()

    if data.initial_message:
        msg = ThreadMessage(
            thread_id=thread.id,
            sender_id=current_user.id,
            body=data.initial_message,
        )
        db.add(msg)

    db.commit()
    db.refresh(thread)
    return {"thread_id": thread.id, "subject": thread.subject}


@router.get("/threads/{thread_id}/messages")
async def get_messages(
    thread_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    thread = db.query(DealThread).filter(DealThread.id == thread_id).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    msgs = db.query(ThreadMessage).filter(ThreadMessage.thread_id == thread_id).order_by(ThreadMessage.created_at).all()

    result = []
    for m in msgs:
        sender = db.query(User).filter(User.id == m.sender_id).first()
        # Mark as read
        if m.sender_id != current_user.id and not m.is_read:
            m.is_read = True
        result.append({
            "id": m.id,
            "body": m.body,
            "sender_id": m.sender_id,
            "sender_name": sender.full_name or sender.email if sender else "Unknown",
            "sender_role": sender.role if sender else "unknown",
            "is_mine": m.sender_id == current_user.id,
            "created_at": m.created_at.isoformat(),
        })

    db.commit()
    return {"messages": result, "thread": {"id": thread.id, "subject": thread.subject, "is_resolved": thread.is_resolved}}


@router.post("/threads/{thread_id}/messages")
async def send_message(
    thread_id: int,
    data: SendMessage,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    thread = db.query(DealThread).filter(DealThread.id == thread_id).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    msg = ThreadMessage(
        thread_id=thread_id,
        sender_id=current_user.id,
        body=data.body,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    # Create notification for deal participants
    from app.models.deal import Deal
    deal = db.query(Deal).filter(Deal.id == thread.deal_id).first()
    if deal:
        from app.api.v1.endpoints.notifications import create_notification
        # Notify borrower if lender sent, and vice versa
        notify_id = deal.borrower_id if current_user.id != deal.borrower_id else None
        if notify_id:
            create_notification(db, notify_id, "message_received",
                f"New message: {thread.subject}",
                f"{current_user.full_name or current_user.email} sent a message on {deal.name}",
                link=f"/dashboard/deals/{deal.id}?tab=messages")

    return {"message_id": msg.id, "created_at": msg.created_at.isoformat()}


@router.put("/threads/{thread_id}/resolve")
async def resolve_thread(
    thread_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    thread = db.query(DealThread).filter(DealThread.id == thread_id).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    thread.is_resolved = True
    db.commit()
    return {"success": True}


@router.post("/{deal_id}/doc-request")
async def create_doc_request(
    deal_id: int,
    data: CreateDocRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    items = data.items or DEFAULT_DOC_CHECKLIST
    # Ensure all items have required fields
    for item in items:
        item.setdefault("completed", False)
        item.setdefault("completed_at", None)
        item.setdefault("required", True)

    req = DocRequest(
        deal_id=deal_id,
        lender_id=current_user.id,
        items=items,
        due_date=datetime.fromisoformat(data.due_date) if data.due_date else None,
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    # Notify borrower
    from app.api.v1.endpoints.notifications import create_notification
    create_notification(db, deal.borrower_id, "doc_request",
        f"Document checklist sent for {deal.name}",
        f"{len([i for i in items if i.get('required')])} required documents requested",
        link=f"/dashboard/deals/{deal_id}?tab=documents")

    return {"request_id": req.id, "item_count": len(items)}


@router.get("/{deal_id}/doc-request")
async def get_doc_request(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    req = db.query(DocRequest).filter(DocRequest.deal_id == deal_id).order_by(DocRequest.created_at.desc()).first()
    if not req:
        return {"exists": False, "default_checklist": DEFAULT_DOC_CHECKLIST}

    items = req.items or []
    completed = sum(1 for i in items if i.get("completed"))
    required = sum(1 for i in items if i.get("required"))
    required_done = sum(1 for i in items if i.get("required") and i.get("completed"))

    return {
        "exists": True,
        "request_id": req.id,
        "items": items,
        "total": len(items),
        "completed": completed,
        "required_total": required,
        "required_completed": required_done,
        "pct_complete": round(completed / max(len(items), 1) * 100),
        "due_date": req.due_date.isoformat() if req.due_date else None,
        "created_at": req.created_at.isoformat(),
    }


@router.put("/doc-request/{req_id}/item")
async def update_doc_item(
    req_id: int,
    data: UpdateDocItem,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    req = db.query(DocRequest).filter(DocRequest.id == req_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    items = req.items or []
    if data.item_index >= len(items):
        raise HTTPException(status_code=400, detail="Invalid item index")

    items[data.item_index]["completed"] = data.completed
    items[data.item_index]["completed_at"] = datetime.utcnow().isoformat() if data.completed else None
    req.items = items
    req.updated_at = datetime.utcnow()
    db.commit()

    completed = sum(1 for i in items if i.get("completed"))
    return {"success": True, "completed": completed, "total": len(items)}


@router.get("/{deal_id}/doc-request/default")
async def get_default_checklist(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Return the standard SBA document checklist pre-populated from deal data."""
    return {"checklist": DEFAULT_DOC_CHECKLIST}
