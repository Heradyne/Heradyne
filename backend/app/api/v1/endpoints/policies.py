from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_active_user, require_lender, require_insurer, require_admin
from app.models.user import User, UserRole
from app.models.policy import LenderPolicy, InsurerPolicy
from app.schemas.policy import (
    LenderPolicyCreate, LenderPolicyUpdate, LenderPolicyResponse,
    InsurerPolicyCreate, InsurerPolicyUpdate, InsurerPolicyResponse
)
from app.services.audit import audit_service

router = APIRouter()


# ============== Lender Policies ==============

@router.post("/lender", response_model=LenderPolicyResponse, status_code=status.HTTP_201_CREATED)
def create_lender_policy(
    policy_data: LenderPolicyCreate,
    current_user: User = Depends(require_lender),
    db: Session = Depends(get_db)
):
    """Create a new lender policy."""
    policy = LenderPolicy(
        lender_id=current_user.id,
        name=policy_data.name,
        is_active=policy_data.is_active,
        min_loan_size=policy_data.min_loan_size,
        max_loan_size=policy_data.max_loan_size,
        min_dscr=policy_data.min_dscr,
        max_pd=policy_data.max_pd,
        max_leverage=policy_data.max_leverage,
        min_collateral_coverage=policy_data.min_collateral_coverage,
        allowed_industries=policy_data.allowed_industries,
        excluded_industries=policy_data.excluded_industries,
        min_term_months=policy_data.min_term_months,
        max_term_months=policy_data.max_term_months,
        target_rate_min=policy_data.target_rate_min,
        target_rate_max=policy_data.target_rate_max,
        allowed_deal_types=policy_data.allowed_deal_types,
        notes=policy_data.notes,
        custom_criteria=policy_data.custom_criteria,
    )
    db.add(policy)
    db.commit()
    db.refresh(policy)
    
    audit_service.log(
        db=db, action="lender_policy_created", entity_type="lender_policy",
        entity_id=policy.id, user_id=current_user.id
    )
    return policy


@router.get("/lender", response_model=List[LenderPolicyResponse])
def list_lender_policies(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """List lender policies. Lenders see only their own, admins see all."""
    query = db.query(LenderPolicy)
    
    if current_user.role == UserRole.LENDER:
        query = query.filter(LenderPolicy.lender_id == current_user.id)
    elif current_user.role not in [UserRole.ADMIN]:
        # Other roles can see active policies for matching info
        query = query.filter(LenderPolicy.is_active == True)
    
    return query.all()


@router.get("/lender/{policy_id}", response_model=LenderPolicyResponse)
def get_lender_policy(
    policy_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get a specific lender policy."""
    policy = db.query(LenderPolicy).filter(LenderPolicy.id == policy_id).first()
    if not policy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found")
    
    if current_user.role == UserRole.LENDER and policy.lender_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    return policy


@router.put("/lender/{policy_id}", response_model=LenderPolicyResponse)
def update_lender_policy(
    policy_id: int,
    policy_update: LenderPolicyUpdate,
    current_user: User = Depends(require_lender),
    db: Session = Depends(get_db)
):
    """Update a lender policy."""
    policy = db.query(LenderPolicy).filter(LenderPolicy.id == policy_id).first()
    if not policy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found")
    
    if policy.lender_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    update_data = policy_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(policy, field, value)
    
    db.commit()
    db.refresh(policy)
    
    audit_service.log(
        db=db, action="lender_policy_updated", entity_type="lender_policy",
        entity_id=policy.id, user_id=current_user.id
    )
    return policy


@router.delete("/lender/{policy_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lender_policy(
    policy_id: int,
    current_user: User = Depends(require_lender),
    db: Session = Depends(get_db)
):
    """Delete a lender policy."""
    policy = db.query(LenderPolicy).filter(LenderPolicy.id == policy_id).first()
    if not policy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found")
    
    if policy.lender_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    db.delete(policy)
    db.commit()
    
    audit_service.log(
        db=db, action="lender_policy_deleted", entity_type="lender_policy",
        entity_id=policy_id, user_id=current_user.id
    )


# ============== Insurer Policies ==============

@router.post("/insurer", response_model=InsurerPolicyResponse, status_code=status.HTTP_201_CREATED)
def create_insurer_policy(
    policy_data: InsurerPolicyCreate,
    current_user: User = Depends(require_insurer),
    db: Session = Depends(get_db)
):
    """Create a new insurer policy."""
    policy = InsurerPolicy(
        insurer_id=current_user.id,
        name=policy_data.name,
        is_active=policy_data.is_active,
        max_expected_loss=policy_data.max_expected_loss,
        min_attachment_point=policy_data.min_attachment_point,
        max_attachment_point=policy_data.max_attachment_point,
        target_premium_min=policy_data.target_premium_min,
        target_premium_max=policy_data.target_premium_max,
        min_coverage_amount=policy_data.min_coverage_amount,
        max_coverage_amount=policy_data.max_coverage_amount,
        allowed_industries=policy_data.allowed_industries,
        excluded_industries=policy_data.excluded_industries,
        allowed_deal_types=policy_data.allowed_deal_types,
        notes=policy_data.notes,
        custom_criteria=policy_data.custom_criteria,
    )
    db.add(policy)
    db.commit()
    db.refresh(policy)
    
    audit_service.log(
        db=db, action="insurer_policy_created", entity_type="insurer_policy",
        entity_id=policy.id, user_id=current_user.id
    )
    return policy


@router.get("/insurer", response_model=List[InsurerPolicyResponse])
def list_insurer_policies(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """List insurer policies. Insurers see only their own, admins see all."""
    query = db.query(InsurerPolicy)
    
    if current_user.role == UserRole.INSURER:
        query = query.filter(InsurerPolicy.insurer_id == current_user.id)
    elif current_user.role not in [UserRole.ADMIN]:
        query = query.filter(InsurerPolicy.is_active == True)
    
    return query.all()


@router.get("/insurer/{policy_id}", response_model=InsurerPolicyResponse)
def get_insurer_policy(
    policy_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get a specific insurer policy."""
    policy = db.query(InsurerPolicy).filter(InsurerPolicy.id == policy_id).first()
    if not policy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found")
    
    if current_user.role == UserRole.INSURER and policy.insurer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    return policy


@router.put("/insurer/{policy_id}", response_model=InsurerPolicyResponse)
def update_insurer_policy(
    policy_id: int,
    policy_update: InsurerPolicyUpdate,
    current_user: User = Depends(require_insurer),
    db: Session = Depends(get_db)
):
    """Update an insurer policy."""
    policy = db.query(InsurerPolicy).filter(InsurerPolicy.id == policy_id).first()
    if not policy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found")
    
    if policy.insurer_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    update_data = policy_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(policy, field, value)
    
    db.commit()
    db.refresh(policy)
    
    audit_service.log(
        db=db, action="insurer_policy_updated", entity_type="insurer_policy",
        entity_id=policy.id, user_id=current_user.id
    )
    return policy


@router.delete("/insurer/{policy_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_insurer_policy(
    policy_id: int,
    current_user: User = Depends(require_insurer),
    db: Session = Depends(get_db)
):
    """Delete an insurer policy."""
    policy = db.query(InsurerPolicy).filter(InsurerPolicy.id == policy_id).first()
    if not policy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found")
    
    if policy.insurer_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    db.delete(policy)
    db.commit()
    
    audit_service.log(
        db=db, action="insurer_policy_deleted", entity_type="insurer_policy",
        entity_id=policy_id, user_id=current_user.id
    )
