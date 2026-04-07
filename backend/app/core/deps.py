from typing import Generator, Optional, List
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status, Request, Cookie
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token, is_token_blacklisted
from app.models.user import User, UserRole, LENDER_ROLES, LENDER_DECISION_ROLES, LENDER_VERIFICATION_ROLES

security = HTTPBearer(auto_error=False)


def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """Get the current authenticated user from Bearer token OR httpOnly cookie."""
    token = None

    # 1. Try Authorization header (API clients, mobile)
    if credentials:
        token = credentials.credentials

    # 2. Fall back to httpOnly cookie (browser)
    if not token:
        token = request.cookies.get("heradyne_token")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check token blacklist
    jti = payload.get("jti")
    if jti and is_token_blacklisted(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    return user


def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")
    return current_user


class RoleChecker:
    def __init__(self, allowed_roles: List[UserRole]):
        self.allowed_roles = allowed_roles

    def __call__(self, user: User = Depends(get_current_active_user)) -> User:
        if user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user.role.value}' not authorized",
            )
        return user


require_admin = RoleChecker([UserRole.ADMIN])
require_borrower = RoleChecker([UserRole.BORROWER, UserRole.ADMIN])
require_lender = RoleChecker([UserRole.LENDER, UserRole.LOAN_OFFICER, UserRole.CREDIT_COMMITTEE, UserRole.ADMIN])
require_lender_decision = RoleChecker([UserRole.LENDER, UserRole.CREDIT_COMMITTEE, UserRole.ADMIN])
require_lender_verification = RoleChecker([UserRole.LENDER, UserRole.LOAN_OFFICER, UserRole.ADMIN])
require_insurer = RoleChecker([UserRole.INSURER, UserRole.ADMIN])
require_lender_or_insurer = RoleChecker([
    UserRole.LENDER, UserRole.LOAN_OFFICER, UserRole.CREDIT_COMMITTEE,
    UserRole.INSURER, UserRole.ADMIN
])
