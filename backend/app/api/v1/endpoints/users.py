from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_active_user, require_admin
from app.core.security import get_password_hash
from app.models.user import User, UserRole, LENDER_ROLES
from app.schemas.user import UserResponse, UserUpdate
from app.services.audit import audit_service

router = APIRouter()


class AdminCreateUserRequest(BaseModel):
    email: EmailStr
    full_name: str
    company_name: Optional[str] = None
    role: UserRole
    temporary_password: str
    organization_id: Optional[int] = None  # For loan_officer/credit_committee, link to parent lender
    skip_password_change: bool = False  # For test accounts


class AdminCreateUserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    company_name: Optional[str]
    role: str
    is_active: bool
    must_change_password: bool
    organization_id: Optional[int]
    message: str

    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    id: int
    email: str
    full_name: str
    company_name: Optional[str]
    role: str
    is_active: bool
    must_change_password: bool
    organization_id: Optional[int]
    created_at: str

    class Config:
        from_attributes = True


@router.get("/me", response_model=UserResponse)
def get_current_user_info(current_user: User = Depends(get_current_active_user)):
    """Get current user information."""
    return current_user


@router.put("/me", response_model=UserResponse)
def update_current_user(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update current user information."""
    if user_update.full_name is not None:
        current_user.full_name = user_update.full_name
    if user_update.company_name is not None:
        current_user.company_name = user_update.company_name
    
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/", response_model=List[UserListResponse])
def list_users(
    skip: int = 0,
    limit: int = 100,
    role: Optional[str] = None,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """List all users (admin only). Optionally filter by role."""
    query = db.query(User)
    if role:
        try:
            role_enum = UserRole(role)
            query = query.filter(User.role == role_enum)
        except ValueError:
            pass
    users = query.offset(skip).limit(limit).all()
    return [
        UserListResponse(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            company_name=u.company_name,
            role=u.role.value,
            is_active=u.is_active,
            must_change_password=u.must_change_password,
            organization_id=u.organization_id,
            created_at=u.created_at.isoformat()
        ) for u in users
    ]


@router.get("/lender-organizations")
def get_lender_organizations(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Get list of lender organizations (for assigning loan officers/credit committee)."""
    lenders = db.query(User).filter(User.role == UserRole.LENDER).all()
    return [
        {"id": l.id, "name": l.full_name, "company": l.company_name, "email": l.email}
        for l in lenders
    ]


@router.post("/", response_model=AdminCreateUserResponse, status_code=status.HTTP_201_CREATED)
def admin_create_user(
    user_data: AdminCreateUserRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Create a new user account (admin only).
    
    Supported roles:
    - lender: Full lender access (can verify, decide, originate)
    - loan_officer: Can verify docs and request info (must be linked to a lender org)
    - credit_committee: Can make decisions and originate (must be linked to a lender org)
    - insurer: Insurance/guarantee provider
    - borrower: Business seeking financing
    - admin: Platform administrator
    
    For loan_officer and credit_committee, provide organization_id to link to parent lender.
    """
    # Check if email already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Validate temporary password
    if len(user_data.temporary_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Temporary password must be at least 6 characters"
        )
    
    # Validate organization_id for loan_officer and credit_committee
    organization_id = None
    if user_data.role in [UserRole.LOAN_OFFICER, UserRole.CREDIT_COMMITTEE]:
        if user_data.organization_id:
            org = db.query(User).filter(
                User.id == user_data.organization_id,
                User.role == UserRole.LENDER
            ).first()
            if not org:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="organization_id must reference a valid lender account"
                )
            organization_id = user_data.organization_id
    
    # Create user
    user = User(
        email=user_data.email,
        hashed_password=get_password_hash(user_data.temporary_password),
        full_name=user_data.full_name,
        company_name=user_data.company_name,
        role=user_data.role,
        is_active=True,
        must_change_password=not user_data.skip_password_change,
        organization_id=organization_id
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    # Audit log
    audit_service.log(
        db=db,
        action="admin_created_user",
        entity_type="user",
        entity_id=user.id,
        user_id=current_user.id,
        details={
            "role": user.role.value, 
            "created_by": current_user.email,
            "organization_id": organization_id
        }
    )
    
    role_desc = {
        UserRole.LENDER: "Full lender access",
        UserRole.LOAN_OFFICER: "Loan officer (verification only)",
        UserRole.CREDIT_COMMITTEE: "Credit committee (decision authority)",
        UserRole.INSURER: "Insurer/Fund",
        UserRole.BORROWER: "Borrower",
        UserRole.ADMIN: "Administrator"
    }
    
    return AdminCreateUserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        company_name=user.company_name,
        role=user.role.value,
        is_active=user.is_active,
        must_change_password=user.must_change_password,
        organization_id=user.organization_id,
        message=f"User created successfully as {role_desc.get(user.role, user.role.value)}. {'Password change required on first login.' if user.must_change_password else 'Test account - no password change required.'}"
    )


@router.put("/{user_id}/set-organization")
def set_user_organization(
    user_id: int,
    organization_id: Optional[int] = None,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Set or update a user's organization (for loan officers/credit committee)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    if user.role not in [UserRole.LOAN_OFFICER, UserRole.CREDIT_COMMITTEE]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization can only be set for loan_officer or credit_committee roles"
        )
    
    if organization_id:
        org = db.query(User).filter(User.id == organization_id, User.role == UserRole.LENDER).first()
        if not org:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="organization_id must reference a valid lender account"
            )
    
    user.organization_id = organization_id
    db.commit()
    
    return {"message": f"Organization updated for user {user.email}", "organization_id": organization_id}


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Get a specific user (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return user


@router.put("/{user_id}/activate", response_model=UserResponse)
def activate_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Activate a user (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    user.is_active = True
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}/deactivate", response_model=UserResponse)
def deactivate_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Deactivate a user (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate yourself"
        )
    
    user.is_active = False
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}/reset-password", response_model=UserResponse)
def reset_user_password(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Reset a user's password to a temporary one (admin only).
    
    The user will be required to change their password on next login.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Generate a simple temporary password (in production, this should be random)
    temp_password = "TempPass123!"
    user.hashed_password = get_password_hash(temp_password)
    user.must_change_password = True
    db.commit()
    db.refresh(user)
    
    # Audit log
    audit_service.log(
        db=db,
        action="admin_reset_password",
        entity_type="user",
        entity_id=user.id,
        user_id=current_user.id,
        details={"reset_by": current_user.email}
    )
    
    return user
