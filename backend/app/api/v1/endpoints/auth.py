from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.database import get_db
from app.core.security import (
    verify_password, get_password_hash, create_access_token,
    decode_access_token, blacklist_token, validate_password_strength,
    check_password_breached, record_failed_login, clear_failed_logins,
    is_account_locked, generate_totp_secret, get_totp_uri,
    generate_qr_code_base64, verify_totp,
)
from app.core.config import settings
from app.core.deps import get_current_active_user
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserResponse, UserLogin, Token
from app.services.audit import audit_service

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _set_auth_cookie(response: Response, token: str) -> None:
    """Set the JWT as an httpOnly, SameSite=Strict cookie."""
    response.set_cookie(
        key="heradyne_token",
        value=token,
        httponly=True,
        secure=settings.ENVIRONMENT == "production",
        samesite="lax",  # lax allows redirects; strict breaks some OAuth flows
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )


class TokenWithFlags(BaseModel):
    token_type: str = "cookie"
    must_change_password: bool = False
    mfa_required: bool = False
    mfa_token: Optional[str] = None  # short-lived token for MFA step


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class MFAVerifyRequest(BaseModel):
    mfa_token: str
    code: str


class MFAEnrollRequest(BaseModel):
    code: str  # First verification after scanning QR


# ── Register ──────────────────────────────────────────────────────────────────

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.RATE_LIMIT_REGISTER)
def register(request: Request, user_data: UserCreate, db: Session = Depends(get_db)):
    if user_data.role != UserRole.BORROWER:
        raise HTTPException(status_code=403, detail="Only borrowers can self-register")

    if db.query(User).filter(User.email == user_data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Password strength validation
    errors = validate_password_strength(user_data.password)
    if errors:
        raise HTTPException(status_code=400, detail="; ".join(errors))

    # Check against breached password database (non-blocking)
    if check_password_breached(user_data.password):
        raise HTTPException(
            status_code=400,
            detail="This password has appeared in known data breaches. Please choose a different password."
        )

    user = User(
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        full_name=user_data.full_name,
        company_name=user_data.company_name,
        role=user_data.role,
        must_change_password=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    audit_service.log(
        db=db, action="user_registered", entity_type="user",
        entity_id=user.id, details={"role": user.role.value},
        ip_address=_get_client_ip(request),
        user_agent=request.headers.get("User-Agent", "")[:500],
    )
    return user


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login")
@limiter.limit(settings.RATE_LIMIT_LOGIN)
def login(request: Request, credentials: UserLogin, db: Session = Depends(get_db)):
    ip = _get_client_ip(request)

    # Check lockout before querying user (prevents user enumeration timing)
    if is_account_locked(credentials.email):
        raise HTTPException(
            status_code=429,
            detail="Account temporarily locked due to too many failed attempts. Try again in 15 minutes."
        )

    user = db.query(User).filter(User.email == credentials.email).first()

    if not user or not verify_password(credentials.password, user.hashed_password):
        count = record_failed_login(credentials.email)
        remaining = max(0, settings.LOCKOUT_MAX_ATTEMPTS - count) if hasattr(settings, 'LOCKOUT_MAX_ATTEMPTS') else 0
        audit_service.log(
            db=db, action="login_failed", entity_type="user",
            entity_id=user.id if user else None,
            details={"email": credentials.email, "reason": "bad_credentials"},
            ip_address=ip, user_agent=request.headers.get("User-Agent", "")[:500],
        )
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    clear_failed_logins(credentials.email)

    # Check if MFA is required and enrolled
    mfa_required_roles = settings.MFA_REQUIRED_ROLES
    if user.role.value in mfa_required_roles and user.totp_secret and user.mfa_enabled:
        # Issue short-lived MFA challenge token (5 min)
        mfa_token = create_access_token(
            data={"sub": str(user.id), "role": user.role.value, "mfa_challenge": True},
            expires_delta=timedelta(minutes=5)
        )
        return JSONResponse({
            "mfa_required": True,
            "mfa_token": mfa_token,
            "must_change_password": False,
        })

    # Issue full token
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role.value},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    audit_service.log(
        db=db, action="user_login", entity_type="user", entity_id=user.id,
        ip_address=ip, user_agent=request.headers.get("User-Agent", "")[:500],
    )

    response = JSONResponse({
        "token_type": "cookie",
        "must_change_password": user.must_change_password or False,
        "mfa_required": False,
        # Also return token in body for API clients / legacy support
        "access_token": access_token,
    })
    _set_auth_cookie(response, access_token)
    return response


# ── MFA verify (complete login) ───────────────────────────────────────────────

@router.post("/mfa/verify")
@limiter.limit("10/minute")
def mfa_verify(request: Request, body: MFAVerifyRequest, db: Session = Depends(get_db)):
    payload = decode_access_token(body.mfa_token)
    if not payload or not payload.get("mfa_challenge"):
        raise HTTPException(status_code=401, detail="Invalid or expired MFA token")

    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    if not verify_totp(user.totp_secret, body.code):
        audit_service.log(
            db=db, action="mfa_failed", entity_type="user", entity_id=user.id,
            ip_address=_get_client_ip(request),
        )
        raise HTTPException(status_code=401, detail="Invalid MFA code")

    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role.value},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    audit_service.log(
        db=db, action="mfa_verified", entity_type="user", entity_id=user.id,
        ip_address=_get_client_ip(request),
    )
    response = JSONResponse({
        "token_type": "cookie",
        "must_change_password": user.must_change_password or False,
        "access_token": access_token,
    })
    _set_auth_cookie(response, access_token)
    return response


# ── MFA enroll ────────────────────────────────────────────────────────────────

@router.post("/mfa/enroll")
def mfa_enroll(
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Begin MFA enrollment — returns QR code and secret."""
    if current_user.mfa_enabled:
        raise HTTPException(status_code=400, detail="MFA already enabled")

    secret = generate_totp_secret()
    uri = get_totp_uri(secret, current_user.email)
    qr_b64 = generate_qr_code_base64(uri)

    # Store secret temporarily (not activated until verified)
    current_user.totp_secret = secret
    current_user.mfa_enabled = False  # Not active until first verify
    db.commit()

    return {
        "secret": secret,
        "qr_code": f"data:image/png;base64,{qr_b64}",
        "uri": uri,
    }


@router.post("/mfa/confirm")
def mfa_confirm(
    request: Request,
    body: MFAEnrollRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Confirm MFA enrollment by verifying first TOTP code."""
    if not current_user.totp_secret:
        raise HTTPException(status_code=400, detail="MFA enrollment not started")
    if current_user.mfa_enabled:
        raise HTTPException(status_code=400, detail="MFA already enabled")

    if not verify_totp(current_user.totp_secret, body.code):
        raise HTTPException(status_code=400, detail="Invalid code. Please try again.")

    current_user.mfa_enabled = True
    db.commit()

    audit_service.log(
        db=db, action="mfa_enrolled", entity_type="user",
        entity_id=current_user.id, ip_address=_get_client_ip(request),
    )
    return {"message": "MFA enabled successfully"}


@router.delete("/mfa/disable")
def mfa_disable(
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Disable MFA (admin or self)."""
    current_user.totp_secret = None
    current_user.mfa_enabled = False
    db.commit()
    audit_service.log(
        db=db, action="mfa_disabled", entity_type="user",
        entity_id=current_user.id, ip_address=_get_client_ip(request),
    )
    return {"message": "MFA disabled"}


# ── Logout ────────────────────────────────────────────────────────────────────

@router.post("/logout")
def logout(
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Revoke token and clear auth cookie."""
    # Blacklist the current token's JTI
    token = request.cookies.get("heradyne_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]

    if token:
        payload = decode_access_token(token)
        if payload and payload.get("jti"):
            remaining = int((payload.get("exp", 0) - __import__("time").time()))
            blacklist_token(payload["jti"], max(remaining, 1))

    audit_service.log(
        db=db, action="user_logout", entity_type="user",
        entity_id=current_user.id, ip_address=_get_client_ip(request),
    )
    response = JSONResponse({"message": "Logged out"})
    response.delete_cookie("heradyne_token", path="/")
    return response


# ── Change password ───────────────────────────────────────────────────────────

@router.post("/change-password")
def change_password(
    request: Request,
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    errors = validate_password_strength(body.new_password)
    if errors:
        raise HTTPException(status_code=400, detail="; ".join(errors))

    if body.new_password == body.current_password:
        raise HTTPException(status_code=400, detail="New password must differ from current password")

    if check_password_breached(body.new_password):
        raise HTTPException(
            status_code=400,
            detail="This password has appeared in known data breaches. Please choose a different one."
        )

    current_user.hashed_password = get_password_hash(body.new_password)
    current_user.must_change_password = False
    db.commit()

    audit_service.log(
        db=db, action="password_changed", entity_type="user",
        entity_id=current_user.id, user_id=current_user.id,
        ip_address=_get_client_ip(request),
    )
    return {"message": "Password changed successfully"}


# ── Me ────────────────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_active_user)):
    return current_user
