from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_active_user, require_admin
from app.models.user import User, UserRole
from app.models.audit import AuditLog
from app.schemas.audit import AuditLogResponse, AuditLogListResponse

router = APIRouter()


@router.get("/", response_model=AuditLogListResponse)
def list_audit_logs(
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[int] = Query(None),
    action: Optional[str] = Query(None),
    user_id: Optional[int] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    List audit logs.
    
    - Admins can see all logs
    - Other users can see logs for their own actions
    """
    query = db.query(AuditLog)
    
    # Non-admins can only see their own logs
    if current_user.role != UserRole.ADMIN:
        query = query.filter(AuditLog.user_id == current_user.id)
    else:
        if user_id:
            query = query.filter(AuditLog.user_id == user_id)
    
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.filter(AuditLog.entity_id == entity_id)
    if action:
        query = query.filter(AuditLog.action == action)
    
    total = query.count()
    items = query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit).all()
    
    return AuditLogListResponse(total=total, items=items)


@router.get("/entity/{entity_type}/{entity_id}", response_model=AuditLogListResponse)
def get_entity_audit_logs(
    entity_type: str,
    entity_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get audit logs for a specific entity."""
    query = db.query(AuditLog).filter(
        AuditLog.entity_type == entity_type,
        AuditLog.entity_id == entity_id
    )
    
    # Non-admins can only see their own logs
    if current_user.role != UserRole.ADMIN:
        query = query.filter(AuditLog.user_id == current_user.id)
    
    total = query.count()
    items = query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit).all()
    
    return AuditLogListResponse(total=total, items=items)


@router.get("/actions")
def list_action_types(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """List all unique action types (admin only)."""
    actions = db.query(AuditLog.action).distinct().all()
    return [a[0] for a in actions]


@router.get("/entity-types")
def list_entity_types(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """List all unique entity types (admin only)."""
    types = db.query(AuditLog.entity_type).distinct().all()
    return [t[0] for t in types]
