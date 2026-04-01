# Heradyne Security Documentation

## Overview

This document outlines the security considerations, threat model, and mitigations implemented in the Heradyne MVP.

**Note**: This is an MVP. Production deployment requires additional hardening.

---

## Threat Model

### Assets to Protect

| Asset | Sensitivity | Impact if Compromised |
|-------|-------------|----------------------|
| User credentials | High | Account takeover |
| Deal financial data | High | Competitive intelligence, fraud |
| Uploaded documents | High | Confidential business info |
| Lender/Insurer policies | Medium | Competitive intelligence |
| Risk reports | Medium | Decision manipulation |
| Audit logs | Medium | Evidence tampering |

### Threat Actors

1. **External attackers**: Unauthorized access attempts
2. **Malicious users**: Abuse of legitimate access
3. **Competitors**: Industrial espionage
4. **Insiders**: Unauthorized data access

---

## Authentication Security

### Password Security

**Implementation:**
- Passwords hashed with bcrypt (work factor 12)
- Minimum password length: 8 characters
- Passwords never logged or stored in plaintext

**Code:**
```python
from passlib.context import CryptContext
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)
```

### JWT Token Security

**Implementation:**
- HS256 algorithm
- Configurable expiration (default: 60 minutes)
- Tokens include user ID and role

**Configuration:**
```python
SECRET_KEY = "your-secret-key"  # Change in production!
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
```

### MVP Limitations & Production Recommendations

| Area | MVP Status | Production Recommendation |
|------|------------|--------------------------|
| Token refresh | Not implemented | Add refresh tokens |
| Token revocation | Not implemented | Add token blacklist (Redis) |
| Rate limiting | Not implemented | Add rate limiting (100 req/min) |
| Account lockout | Not implemented | Lock after 5 failed attempts |
| MFA | Not implemented | Add TOTP/WebAuthn |
| Password policy | Basic | Add complexity requirements |

---

## Authorization (RBAC)

### Role Permissions

| Action | Borrower | Lender | Insurer | Admin |
|--------|----------|--------|---------|-------|
| Create deals | ✓ | ✗ | ✗ | ✓ |
| View own deals | ✓ | ✓* | ✓* | ✓ |
| Edit own deals | ✓ | ✗ | ✗ | ✓ |
| Upload documents | ✓ | ✗ | ✗ | ✓ |
| Create lender policy | ✗ | ✓ | ✗ | ✓ |
| Create insurer policy | ✗ | ✗ | ✓ | ✓ |
| View matched deals | ✗ | ✓ | ✓ | ✓ |
| Make decisions | ✗ | ✓ | ✓ | ✓ |
| Manage assumptions | ✗ | ✗ | ✗ | ✓ |
| View all audit logs | ✗ | ✗ | ✗ | ✓ |

*Lenders/Insurers only see deals in analyzed+ status

### Implementation

```python
class RoleChecker:
    def __init__(self, allowed_roles: List[UserRole]):
        self.allowed_roles = allowed_roles
    
    def __call__(self, user: User = Depends(get_current_active_user)) -> User:
        if user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"User role '{user.role.value}' not authorized"
            )
        return user

# Usage
require_admin = RoleChecker([UserRole.ADMIN])
require_borrower = RoleChecker([UserRole.BORROWER, UserRole.ADMIN])
```

### Data Isolation

- Borrowers: Can only access their own deals
- Lenders: Can only access deals matched to their policies
- Insurers: Can only access deals matched to their policies
- Admins: Full access

---

## Input Validation

### Pydantic Validation

All API inputs validated with Pydantic schemas:

```python
class DealCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    loan_amount_requested: float = Field(..., gt=0)
    owner_credit_score: Optional[int] = Field(None, ge=300, le=850)
```

### File Upload Security

**Implemented:**
```python
# Size limit
MAX_UPLOAD_SIZE_MB = 50

# Extension whitelist
ALLOWED_EXTENSIONS = ["pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "png", "jpg", "jpeg"]

# Validation
if len(content) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
    raise HTTPException(status_code=413, detail="File too large")

ext = file.filename.split(".")[-1].lower()
if ext not in settings.ALLOWED_EXTENSIONS:
    raise HTTPException(status_code=400, detail="File type not allowed")
```

**MVP Limitations:**
- No virus scanning
- No content-type verification (magic bytes)
- No file content validation

**Production Recommendations:**
- Add ClamAV scanning
- Verify magic bytes match extension
- Process files in isolated sandbox
- Store files in separate storage service (S3)

---

## SQL Injection Prevention

### SQLAlchemy ORM

All database queries use SQLAlchemy ORM, which parameterizes queries:

```python
# Safe - parameterized
deal = db.query(Deal).filter(Deal.id == deal_id).first()

# Never do this
# db.execute(f"SELECT * FROM deals WHERE id = {deal_id}")
```

---

## XSS Prevention

### API-Only Backend

- Backend returns JSON only
- No HTML rendering
- Frontend responsible for output encoding

### Frontend Recommendations

- React automatically escapes output
- Use `dangerouslySetInnerHTML` only with sanitized content
- Validate and sanitize any user-generated content displayed

---

## CORS Configuration

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,  # Whitelist
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Production Recommendations:**
- Restrict `allow_origins` to specific domains
- Review `allow_methods` and `allow_headers`

---

## Audit Logging

### What's Logged

| Action | Entity | Details |
|--------|--------|---------|
| user_registered | user | role |
| user_login | user | - |
| deal_created | deal | deal_type |
| deal_submitted | deal | - |
| deal_analyzed | deal | version |
| deal_matched | deal | match counts |
| document_uploaded | deal_document | filename |
| match_accepted/rejected | deal_match | notes |
| assumption_updated | system_assumption | category, key |

### Log Structure

```json
{
  "id": 1,
  "user_id": 1,
  "action": "deal_submitted",
  "entity_type": "deal",
  "entity_id": 1,
  "details": {},
  "ip_address": null,
  "created_at": "2024-01-15T10:30:00Z"
}
```

### MVP Limitations

- IP address not captured (add via middleware)
- No log integrity verification
- Logs stored in same database

### Production Recommendations

- Capture client IP and user agent
- Write logs to immutable storage
- Add log checksums/signatures
- Implement log retention policy
- Set up alerting on suspicious patterns

---

## Secrets Management

### MVP Status

Secrets in environment variables:

```bash
SECRET_KEY=change-this-to-a-secure-random-string
DATABASE_URL=postgresql://user:pass@host/db
```

### Production Recommendations

- Use AWS Secrets Manager / HashiCorp Vault
- Rotate secrets regularly
- Never commit secrets to version control
- Use different secrets per environment

---

## Network Security

### MVP Status

- HTTP only (no TLS configured)
- No network isolation

### Production Recommendations

```
Internet → CloudFlare (WAF) → Load Balancer (TLS) → Application
                                                          │
                                                    Private VPC
                                                    │    │    │
                                                  App  DB  Redis
```

- TLS 1.3 everywhere
- WAF rules (CloudFlare, AWS WAF)
- VPC with private subnets
- Security groups (minimal ports)
- Database not publicly accessible

---

## Dependency Security

### Current Dependencies

Check `requirements.txt` for versions. Key security-relevant packages:
- `python-jose[cryptography]` - JWT handling
- `passlib[bcrypt]` - Password hashing
- `pydantic` - Input validation

### Recommendations

- Regular dependency updates
- Use `pip-audit` or `safety` for vulnerability scanning
- Pin exact versions
- Review changelogs before updates

---

## Security Checklist for Production

### Before Launch

- [ ] Change all default secrets
- [ ] Enable TLS everywhere
- [ ] Configure production CORS origins
- [ ] Set up WAF
- [ ] Enable database encryption at rest
- [ ] Configure backup encryption
- [ ] Set up intrusion detection
- [ ] Penetration testing
- [ ] Security audit

### Ongoing

- [ ] Regular dependency updates
- [ ] Log monitoring and alerting
- [ ] Access review (quarterly)
- [ ] Backup testing
- [ ] Incident response plan
- [ ] Security training for team

---

## Incident Response

### Contact

Security issues should be reported to the development team immediately.

### Response Steps

1. **Identify**: Confirm the security issue
2. **Contain**: Isolate affected systems
3. **Eradicate**: Remove threat
4. **Recover**: Restore normal operations
5. **Learn**: Post-incident review

---

## Compliance Considerations

### Financial Data

Heradyne handles sensitive financial data. Consider:
- SOC 2 Type II certification
- Data residency requirements
- Right to deletion (GDPR/CCPA)

### Disclaimer

Heradyne is informational only. It does not:
- Make lending decisions
- Store payment information
- Process financial transactions

This limits certain compliance requirements but security best practices still apply.
