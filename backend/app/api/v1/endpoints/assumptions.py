from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_active_user, require_admin
from app.models.user import User, UserRole
from app.models.assumption import SystemAssumption
from app.schemas.assumption import (
    AssumptionCreate, AssumptionUpdate, AssumptionResponse,
    AssumptionWithUserResponse, UserAssumptionOverride, BulkAssignAssumptions
)
from app.services.audit import audit_service
from app.services.assumptions import assumption_service

router = APIRouter()


@router.get("/", response_model=List[AssumptionResponse])
def list_assumptions(
    category: str = Query(None),
    user_id: int = Query(None, description="Filter by user ID (null for system defaults)"),
    include_user_overrides: bool = Query(False, description="Include user-specific overrides"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """List assumptions. Can filter by category and/or user."""
    query = db.query(SystemAssumption)
    
    if category:
        query = query.filter(SystemAssumption.category == category)
    
    if user_id is not None:
        # Get specific user's assumptions (or system defaults if user_id=0)
        if user_id == 0:
            query = query.filter(SystemAssumption.user_id.is_(None))
        else:
            query = query.filter(SystemAssumption.user_id == user_id)
    elif not include_user_overrides:
        # By default, only show system defaults
        query = query.filter(SystemAssumption.user_id.is_(None))
    
    return query.order_by(SystemAssumption.category, SystemAssumption.key).all()


@router.get("/effective", response_model=List[AssumptionResponse])
def get_effective_assumptions(
    user_id: int = Query(..., description="User ID to get effective assumptions for"),
    category: str = Query(None),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get effective assumptions for a user.
    Returns user-specific overrides where they exist, otherwise system defaults.
    """
    # Get system defaults
    system_query = db.query(SystemAssumption).filter(SystemAssumption.user_id.is_(None))
    if category:
        system_query = system_query.filter(SystemAssumption.category == category)
    system_assumptions = {(a.category, a.key): a for a in system_query.all()}
    
    # Get user overrides
    user_query = db.query(SystemAssumption).filter(SystemAssumption.user_id == user_id)
    if category:
        user_query = user_query.filter(SystemAssumption.category == category)
    user_overrides = {(a.category, a.key): a for a in user_query.all()}
    
    # Merge: user overrides take precedence
    effective = {**system_assumptions, **user_overrides}
    
    return sorted(effective.values(), key=lambda a: (a.category, a.key))


@router.get("/users", response_model=List[dict])
def list_users_with_overrides(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """List all users who have assumption overrides (admin only)."""
    # Get users with overrides
    users_with_overrides = db.query(
        User.id, User.email, User.full_name, User.role
    ).join(
        SystemAssumption, SystemAssumption.user_id == User.id
    ).distinct().all()
    
    result = []
    for user in users_with_overrides:
        override_count = db.query(SystemAssumption).filter(
            SystemAssumption.user_id == user.id
        ).count()
        result.append({
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "override_count": override_count
        })
    
    return result


@router.get("/users/{user_id}/overrides", response_model=List[AssumptionResponse])
def get_user_overrides(
    user_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all assumption overrides for a specific user."""
    # Non-admins can only see their own overrides
    if current_user.role != UserRole.ADMIN and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    return db.query(SystemAssumption).filter(
        SystemAssumption.user_id == user_id
    ).order_by(SystemAssumption.category, SystemAssumption.key).all()


@router.get("/categories")
def list_categories(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """List all assumption categories."""
    categories = db.query(SystemAssumption.category).distinct().all()
    return [c[0] for c in categories]


@router.get("/{category}/{key}", response_model=AssumptionResponse)
def get_assumption(
    category: str,
    key: str,
    user_id: int = Query(None, description="Get user-specific override"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get a specific assumption. Optionally get user-specific override."""
    query = db.query(SystemAssumption).filter(
        SystemAssumption.category == category,
        SystemAssumption.key == key
    )
    
    if user_id is not None:
        query = query.filter(SystemAssumption.user_id == user_id)
    else:
        query = query.filter(SystemAssumption.user_id.is_(None))
    
    assumption = query.first()
    
    if not assumption:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assumption not found")
    
    return assumption


@router.post("/", response_model=AssumptionResponse, status_code=status.HTTP_201_CREATED)
def create_assumption(
    assumption_data: AssumptionCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Create a new assumption (admin only). Can be system-wide or user-specific."""
    existing = db.query(SystemAssumption).filter(
        SystemAssumption.category == assumption_data.category,
        SystemAssumption.key == assumption_data.key,
        SystemAssumption.user_id == assumption_data.user_id if assumption_data.user_id else SystemAssumption.user_id.is_(None)
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assumption already exists. Use PUT to update."
        )
    
    assumption = SystemAssumption(
        user_id=assumption_data.user_id,
        category=assumption_data.category,
        key=assumption_data.key,
        value=assumption_data.value,
        description=assumption_data.description
    )
    db.add(assumption)
    db.commit()
    db.refresh(assumption)
    
    # Clear cache
    assumption_service.clear_cache()
    
    audit_service.log(
        db=db, action="assumption_created", entity_type="system_assumption",
        entity_id=assumption.id, user_id=current_user.id,
        details={"category": assumption.category, "key": assumption.key, "for_user": assumption_data.user_id}
    )
    
    return assumption


@router.post("/users/{user_id}/override", response_model=AssumptionResponse)
def create_user_override(
    user_id: int,
    override: UserAssumptionOverride,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Create or update a user-specific assumption override (admin only)."""
    # Verify user exists
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    # Check if override already exists
    existing = db.query(SystemAssumption).filter(
        SystemAssumption.user_id == user_id,
        SystemAssumption.category == override.category,
        SystemAssumption.key == override.key
    ).first()
    
    if existing:
        # Update existing
        existing.value = override.value
        if override.description:
            existing.description = override.description
        db.commit()
        db.refresh(existing)
        assumption = existing
        action = "assumption_override_updated"
    else:
        # Create new
        assumption = SystemAssumption(
            user_id=user_id,
            category=override.category,
            key=override.key,
            value=override.value,
            description=override.description
        )
        db.add(assumption)
        db.commit()
        db.refresh(assumption)
        action = "assumption_override_created"
    
    # Clear cache
    assumption_service.clear_cache()
    
    audit_service.log(
        db=db, action=action, entity_type="system_assumption",
        entity_id=assumption.id, user_id=current_user.id,
        details={"category": override.category, "key": override.key, "for_user": user_id}
    )
    
    return assumption


@router.post("/users/{user_id}/copy-defaults", response_model=List[AssumptionResponse])
def copy_defaults_to_user(
    user_id: int,
    categories: List[str] = Query(None, description="Categories to copy (all if not specified)"),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Copy all system defaults as user overrides (admin only)."""
    # Verify user exists
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    # Get system defaults
    query = db.query(SystemAssumption).filter(SystemAssumption.user_id.is_(None))
    if categories:
        query = query.filter(SystemAssumption.category.in_(categories))
    system_defaults = query.all()
    
    created = []
    for default in system_defaults:
        # Check if override already exists
        existing = db.query(SystemAssumption).filter(
            SystemAssumption.user_id == user_id,
            SystemAssumption.category == default.category,
            SystemAssumption.key == default.key
        ).first()
        
        if not existing:
            override = SystemAssumption(
                user_id=user_id,
                category=default.category,
                key=default.key,
                value=default.value,
                description=default.description
            )
            db.add(override)
            created.append(override)
    
    db.commit()
    
    # Clear cache
    assumption_service.clear_cache()
    
    audit_service.log(
        db=db, action="assumption_defaults_copied", entity_type="user",
        entity_id=user_id, user_id=current_user.id,
        details={"count": len(created), "categories": categories}
    )
    
    return created


@router.put("/{category}/{key}", response_model=AssumptionResponse)
def update_assumption(
    category: str,
    key: str,
    assumption_update: AssumptionUpdate,
    user_id: int = Query(None, description="Update user-specific override"),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Update an assumption (admin only)."""
    query = db.query(SystemAssumption).filter(
        SystemAssumption.category == category,
        SystemAssumption.key == key
    )
    
    if user_id is not None:
        query = query.filter(SystemAssumption.user_id == user_id)
    else:
        query = query.filter(SystemAssumption.user_id.is_(None))
    
    assumption = query.first()
    
    if not assumption:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assumption not found")
    
    assumption.value = assumption_update.value
    if assumption_update.description is not None:
        assumption.description = assumption_update.description
    
    db.commit()
    db.refresh(assumption)
    
    # Clear cache
    assumption_service.clear_cache()
    
    audit_service.log(
        db=db, action="assumption_updated", entity_type="system_assumption",
        entity_id=assumption.id, user_id=current_user.id,
        details={"category": category, "key": key, "for_user": user_id}
    )
    
    return assumption


@router.delete("/{category}/{key}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assumption(
    category: str,
    key: str,
    user_id: int = Query(None, description="Delete user-specific override"),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Delete an assumption (admin only)."""
    query = db.query(SystemAssumption).filter(
        SystemAssumption.category == category,
        SystemAssumption.key == key
    )
    
    if user_id is not None:
        query = query.filter(SystemAssumption.user_id == user_id)
    else:
        query = query.filter(SystemAssumption.user_id.is_(None))
    
    assumption = query.first()
    
    if not assumption:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assumption not found")
    
    assumption_id = assumption.id
    db.delete(assumption)
    db.commit()
    
    # Clear cache
    assumption_service.clear_cache()
    
    audit_service.log(
        db=db, action="assumption_deleted", entity_type="system_assumption",
        entity_id=assumption_id, user_id=current_user.id,
        details={"category": category, "key": key, "for_user": user_id}
    )


@router.delete("/users/{user_id}/overrides", status_code=status.HTTP_204_NO_CONTENT)
def delete_all_user_overrides(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Delete all assumption overrides for a user (admin only)."""
    count = db.query(SystemAssumption).filter(
        SystemAssumption.user_id == user_id
    ).delete()
    db.commit()
    
    # Clear cache
    assumption_service.clear_cache()
    
    audit_service.log(
        db=db, action="assumption_overrides_cleared", entity_type="user",
        entity_id=user_id, user_id=current_user.id,
        details={"count": count}
    )
