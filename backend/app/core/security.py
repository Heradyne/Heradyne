from datetime import datetime, timedelta
from typing import Optional
import secrets
import uuid

from jose import jwt, JWTError
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ── Password helpers ──────────────────────────────────────────────────────────

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def validate_password_strength(password: str) -> list[str]:
    """Return list of errors; empty list = password is strong enough."""
    errors = []
    if len(password) < 12:
        errors.append("Password must be at least 12 characters")
    if not any(c.isupper() for c in password):
        errors.append("Password must contain at least one uppercase letter")
    if not any(c.islower() for c in password):
        errors.append("Password must contain at least one lowercase letter")
    if not any(c.isdigit() for c in password):
        errors.append("Password must contain at least one number")
    if not any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password):
        errors.append("Password must contain at least one special character")
    return errors

def check_password_breached(password: str) -> bool:
    """Check HaveIBeenPwned using k-anonymity model. Returns True if password is known-breached."""
    import hashlib, urllib.request
    sha1 = hashlib.sha1(password.encode()).hexdigest().upper()
    prefix, suffix = sha1[:5], sha1[5:]
    try:
        url = f"https://api.pwnedpasswords.com/range/{prefix}"
        req = urllib.request.urlopen(url, timeout=3)
        hashes = req.read().decode()
        for line in hashes.splitlines():
            h, count = line.split(":")
            if h == suffix:
                return True
    except Exception:
        pass  # Network error — don't block registration
    return False

# ── JWT ───────────────────────────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    jti = str(uuid.uuid4())  # unique token ID for revocation
    to_encode.update({"exp": expire, "jti": jti, "iat": datetime.utcnow()})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None

# ── Token blacklist (Redis) ───────────────────────────────────────────────────

def _get_redis():
    import redis as redis_lib
    from app.core.config import settings
    return redis_lib.from_url(settings.REDIS_URL, decode_responses=True)

def blacklist_token(jti: str, expires_in_seconds: int) -> None:
    """Add a JTI to the Redis blacklist."""
    try:
        r = _get_redis()
        r.setex(f"blacklist:jti:{jti}", expires_in_seconds, "1")
    except Exception:
        pass  # Redis down — degrade gracefully (token expires naturally)

def is_token_blacklisted(jti: str) -> bool:
    """Check if a JTI has been blacklisted."""
    try:
        r = _get_redis()
        return r.exists(f"blacklist:jti:{jti}") == 1
    except Exception:
        return False  # Redis down — allow token

# ── Failed login tracking (Redis) ─────────────────────────────────────────────

LOCKOUT_MAX_ATTEMPTS = 5
LOCKOUT_DURATION_SECONDS = 900  # 15 minutes

def record_failed_login(email: str) -> int:
    """Record a failed login attempt. Returns current fail count."""
    try:
        r = _get_redis()
        key = f"failedlogin:{email.lower()}"
        count = r.incr(key)
        if count == 1:
            r.expire(key, LOCKOUT_DURATION_SECONDS)
        return count
    except Exception:
        return 0

def clear_failed_logins(email: str) -> None:
    try:
        r = _get_redis()
        r.delete(f"failedlogin:{email.lower()}")
    except Exception:
        pass

def is_account_locked(email: str) -> bool:
    try:
        r = _get_redis()
        key = f"failedlogin:{email.lower()}"
        count = r.get(key)
        return count is not None and int(count) >= LOCKOUT_MAX_ATTEMPTS
    except Exception:
        return False

# ── MFA / TOTP ────────────────────────────────────────────────────────────────

def generate_totp_secret() -> str:
    import pyotp
    return pyotp.random_base32()

def get_totp_uri(secret: str, email: str) -> str:
    import pyotp
    return pyotp.totp.TOTP(secret).provisioning_uri(
        name=email, issuer_name="Heradyne"
    )

def verify_totp(secret: str, code: str) -> bool:
    import pyotp
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)

def generate_qr_code_base64(uri: str) -> str:
    import qrcode, io, base64
    qr = qrcode.make(uri)
    buf = io.BytesIO()
    qr.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()

# ── Field-level encryption ────────────────────────────────────────────────────

def _get_encryption_key() -> bytes:
    import base64
    key = settings.FIELD_ENCRYPTION_KEY
    # Fernet requires 32-byte URL-safe base64 key
    return base64.urlsafe_b64encode(key.encode()[:32].ljust(32, b'0'))

def encrypt_field(value: str) -> str:
    """Encrypt a string field for storage."""
    if not value:
        return value
    try:
        from cryptography.fernet import Fernet
        f = Fernet(_get_encryption_key())
        return f.encrypt(value.encode()).decode()
    except Exception:
        return value

def decrypt_field(value: str) -> str:
    """Decrypt an encrypted field."""
    if not value:
        return value
    try:
        from cryptography.fernet import Fernet
        f = Fernet(_get_encryption_key())
        return f.decrypt(value.encode()).decode()
    except Exception:
        return value
