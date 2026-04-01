"""
Verification Flag Model

Loan officers can flag discrepancies and track verification status on deals.
"""
import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, Enum, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin


class FlagSeverity(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class FlagStatus(str, enum.Enum):
    PENDING = "pending"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


class DealVerificationStatus(str, enum.Enum):
    PENDING_REVIEW = "pending_review"
    IN_REVIEW = "in_review"
    VERIFIED = "verified"
    FLAGGED = "flagged"
    INFO_REQUESTED = "info_requested"


class VerificationFlag(Base, TimestampMixin):
    """Individual flag raised by loan officer on a deal field."""
    __tablename__ = "verification_flags"
    
    id = Column(Integer, primary_key=True, index=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    match_id = Column(Integer, ForeignKey("deal_matches.id"), nullable=True)
    flagged_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Flag details
    field_name = Column(String(100), nullable=False)  # e.g., "annual_revenue", "ebitda"
    reported_value = Column(String(255), nullable=True)  # Value shown in deal
    expected_value = Column(String(255), nullable=True)  # What loan officer expected
    difference_description = Column(Text, nullable=True)  # Explain the discrepancy
    
    severity = Column(Enum(FlagSeverity, native_enum=False), default=FlagSeverity.MEDIUM)
    status = Column(Enum(FlagStatus, native_enum=False), default=FlagStatus.PENDING)
    notes = Column(Text, nullable=True)
    
    # Resolution
    resolved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    resolution_notes = Column(Text, nullable=True)
    
    # Relationships
    deal = relationship("Deal", back_populates="verification_flags")
    flagged_by = relationship("User", foreign_keys=[flagged_by_id])
    resolved_by = relationship("User", foreign_keys=[resolved_by_id])


class DealVerification(Base, TimestampMixin):
    """Overall verification status for a deal from a lender's perspective."""
    __tablename__ = "deal_verifications"
    
    id = Column(Integer, primary_key=True, index=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    match_id = Column(Integer, ForeignKey("deal_matches.id"), nullable=True)
    lender_id = Column(Integer, ForeignKey("users.id"), nullable=False)  # The org/lender
    
    status = Column(Enum(DealVerificationStatus, native_enum=False), default=DealVerificationStatus.PENDING_REVIEW)
    
    # Verification tracking
    assigned_to_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Loan officer assigned
    verified_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Who verified
    verified_at = Column(DateTime, nullable=True)
    
    # Checklist items
    financials_verified = Column(Boolean, default=False)
    documents_reviewed = Column(Boolean, default=False)
    collateral_verified = Column(Boolean, default=False)
    references_checked = Column(Boolean, default=False)
    
    # Notes
    verification_notes = Column(Text, nullable=True)
    ready_for_committee = Column(Boolean, default=False)
    
    # Relationships
    deal = relationship("Deal")
    lender = relationship("User", foreign_keys=[lender_id])
    assigned_to = relationship("User", foreign_keys=[assigned_to_id])
    verified_by = relationship("User", foreign_keys=[verified_by_id])
