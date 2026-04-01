from typing import Generator, Optional, List

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User, UserRole, LENDER_ROLES, LENDER_DECISION_ROLES, LENDER_VERIFICATION_ROLES

security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """Get the current authenticated user."""
    token = credentials.credentials
    payload = decode_access_token(token)
    
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled"
        )
    
    return user


def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """Ensure the current user is active."""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )
    return current_user


class RoleChecker:
    """Dependency for checking user roles."""
    
    def __init__(self, allowed_roles: List[UserRole]):
        self.allowed_roles = allowed_roles
    
    def __call__(self, user: User = Depends(get_current_active_user)) -> User:
        if user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"User role '{user.role.value}' not authorized for this action"
            )
        return user


# Role-based dependencies
require_admin = RoleChecker([UserRole.ADMIN])
require_borrower = RoleChecker([UserRole.BORROWER, UserRole.ADMIN])

# Lender roles - includes all lender-related roles
require_lender = RoleChecker([UserRole.LENDER, UserRole.LOAN_OFFICER, UserRole.CREDIT_COMMITTEE, UserRole.ADMIN])

# Lender roles that can make decisions (accept/reject/originate)
require_lender_decision = RoleChecker([UserRole.LENDER, UserRole.CREDIT_COMMITTEE, UserRole.ADMIN])

# Lender roles that can verify and request info
require_lender_verification = RoleChecker([UserRole.LENDER, UserRole.LOAN_OFFICER, UserRole.ADMIN])

require_insurer = RoleChecker([UserRole.INSURER, UserRole.ADMIN])

# Any lender role or insurer
require_lender_or_insurer = RoleChecker([
    UserRole.LENDER, UserRole.LOAN_OFFICER, UserRole.CREDIT_COMMITTEE, 
    UserRole.INSURER, UserRole.ADMIN
])
