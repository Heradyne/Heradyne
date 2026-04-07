import enum
from sqlalchemy import Column, Integer, String, Boolean, Enum, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin


class UserRole(str, enum.Enum):
    BORROWER = "borrower"
    LENDER = "lender"  # Legacy - full access (backwards compatibility)
    LOAN_OFFICER = "loan_officer"  # Sources deals, verifies docs, requests info
    CREDIT_COMMITTEE = "credit_committee"  # Accepts/rejects, originates loans
    INSURER = "insurer"
    ADMIN = "admin"


# Role groupings for permission checks
LENDER_ROLES = {UserRole.LENDER, UserRole.LOAN_OFFICER, UserRole.CREDIT_COMMITTEE}
LENDER_VERIFICATION_ROLES = {UserRole.LENDER, UserRole.LOAN_OFFICER}  # Can verify docs, request info
LENDER_DECISION_ROLES = {UserRole.LENDER, UserRole.CREDIT_COMMITTEE}  # Can accept/reject, originate


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    company_name = Column(String(255), nullable=True)
    role = Column(Enum(UserRole, native_enum=False), nullable=False, default=UserRole.BORROWER)
    is_active = Column(Boolean, default=True)
    must_change_password = Column(Boolean, default=False)

    # MFA
    totp_secret = Column(String(64), nullable=True)
    mfa_enabled = Column(Boolean, default=False)

    # Security tracking
    failed_login_count = Column(Integer, default=0)
    last_failed_login = Column(DateTime, nullable=True)
    last_login_at = Column(DateTime, nullable=True)
    last_login_ip = Column(String(50), nullable=True)

    # Soft delete / PII
    deleted_at = Column(DateTime, nullable=True)
    pii_redacted_at = Column(DateTime, nullable=True)

    # Organization linking
    organization_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Relationships
    deals = relationship("Deal", back_populates="borrower", foreign_keys="Deal.borrower_id")
    lender_policies = relationship("LenderPolicy", back_populates="lender")
    insurer_policies = relationship("InsurerPolicy", back_populates="insurer")
    audit_logs = relationship("AuditLog", back_populates="user")
    assumptions = relationship("SystemAssumption", back_populates="user")
    
    # Organization members (for lender orgs)
    organization = relationship("User", remote_side=[id], backref="members")
    
    def __repr__(self):
        return f"<User {self.email} ({self.role.value})>"
    
    @property
    def is_lender_role(self) -> bool:
        """Check if user has any lender-related role."""
        return self.role in LENDER_ROLES
    
    @property
    def can_verify_documents(self) -> bool:
        """Check if user can verify documents and request info."""
        return self.role in LENDER_VERIFICATION_ROLES or self.role == UserRole.ADMIN
    
    @property
    def can_make_decisions(self) -> bool:
        """Check if user can accept/reject deals and originate loans."""
        return self.role in LENDER_DECISION_ROLES or self.role == UserRole.ADMIN
    
    @property
    def effective_lender_id(self) -> int:
        """Get the lender ID for policy/match lookups (org head or self)."""
        if self.role in {UserRole.LOAN_OFFICER, UserRole.CREDIT_COMMITTEE} and self.organization_id:
            return self.organization_id
        return self.id
