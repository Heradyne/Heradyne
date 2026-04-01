from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import verify_password, get_password_hash, create_access_token
from app.core.config import settings
from app.core.deps import get_current_active_user
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserResponse, UserLogin, Token
from app.services.audit import audit_service

router = APIRouter()


class TokenWithPasswordFlag(BaseModel):
    access_token: str
    token_type: str = "bearer"
    must_change_password: bool = False


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """
    Register a new borrower account.
    
    Only borrowers can self-register. Lenders and insurers must be created by an admin.
    """
    # Only allow borrower registration
    if user_data.role != UserRole.BORROWER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only borrowers can self-register. Lenders and insurers must be created by an admin."
        )
    
    # Check if email already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create user
    user = User(
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        full_name=user_data.full_name,
        company_name=user_data.company_name,
        role=user_data.role,
        must_change_password=False
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    # Audit log
    audit_service.log(
        db=db,
        action="user_registered",
        entity_type="user",
        entity_id=user.id,
        details={"role": user.role.value}
    )
    
    return user


@router.post("/login", response_model=TokenWithPasswordFlag)
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    """
    Login and get access token.
    
    If must_change_password is true, the user should be redirected to change their password.
    """
    user = db.query(User).filter(User.email == credentials.email).first()
    
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled"
        )
    
    # Create access token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role.value},
        expires_delta=access_token_expires
    )
    
    # Audit log
    audit_service.log(
        db=db,
        action="user_login",
        entity_type="user",
        entity_id=user.id
    )
    
    return TokenWithPasswordFlag(
        access_token=access_token,
        must_change_password=user.must_change_password or False
    )


@router.post("/change-password")
def change_password(
    request: ChangePasswordRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Change password. Required for admin-created accounts on first login.
    """
    # Verify current password
    if not verify_password(request.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )
    
    # Validate new password
    if len(request.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 6 characters"
        )
    
    if request.new_password == request.current_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from current password"
        )
    
    # Update password
    current_user.hashed_password = get_password_hash(request.new_password)
    current_user.must_change_password = False
    db.commit()
    
    # Audit log
    audit_service.log(
        db=db,
        action="password_changed",
        entity_type="user",
        entity_id=current_user.id,
        user_id=current_user.id
    )
    
    return {"message": "Password changed successfully"}
