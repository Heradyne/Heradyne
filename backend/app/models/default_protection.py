import enum
from sqlalchemy import Column, Integer, String, Float, Boolean, Enum, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from datetime import datetime

from app.models.base import Base, TimestampMixin


class ProtectionTier(str, enum.Enum):
    TIER_1 = "tier_1"  # Business premiums + business assets
    TIER_2 = "tier_2"  # Personal protection fee
    TIER_3 = "tier_3"  # Personal assets at risk


class DefaultProtectionStatus(str, enum.Enum):
    ACTIVE = "active"           # Protection is active, loan in good standing
    WARNING = "warning"         # Missed payments, at risk
    TIER_1_TRIGGERED = "tier_1_triggered"  # Business assets being used
    TIER_2_ACTIVE = "tier_2_active"        # Personal protection active
    TIER_2_TRIGGERED = "tier_2_triggered"  # Personal protection being used
    TIER_3_TRIGGERED = "tier_3_triggered"  # Personal assets at risk
    RESOLVED = "resolved"       # Default resolved
    DEFAULTED = "defaulted"     # Full default, all tiers exhausted


class BorrowerProtection(Base, TimestampMixin):
    """Tracks borrower's tiered default protection status for each loan."""
    __tablename__ = "borrower_protections"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Links
    borrower_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    loan_id = Column(Integer, ForeignKey("executed_loans.id"), nullable=False)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    
    # Current status
    status = Column(Enum(DefaultProtectionStatus, native_enum=False), default=DefaultProtectionStatus.ACTIVE)
    current_tier = Column(Enum(ProtectionTier, native_enum=False), default=ProtectionTier.TIER_1)
    
    # Tier 1: Business Protection (premiums paid + business assets)
    total_premiums_paid = Column(Float, default=0.0)  # Total guarantee premiums paid
    business_assets_value = Column(Float, default=0.0)  # Value of business assets (collateral)
    tier_1_coverage = Column(Float, default=0.0)  # Total Tier 1 coverage amount
    tier_1_used = Column(Float, default=0.0)  # Amount of Tier 1 used in default
    
    # Tier 2: Personal Protection (optional monthly fee)
    tier_2_enrolled = Column(Boolean, default=False)  # Has borrower opted into Tier 2?
    tier_2_monthly_fee = Column(Float, default=0.0)  # Monthly fee for personal protection
    tier_2_total_paid = Column(Float, default=0.0)  # Total Tier 2 fees paid
    tier_2_coverage_multiplier = Column(Float, default=2.0)  # Coverage = fees paid * multiplier
    tier_2_coverage = Column(Float, default=0.0)  # Calculated Tier 2 coverage
    tier_2_used = Column(Float, default=0.0)  # Amount of Tier 2 used
    tier_2_start_date = Column(DateTime, nullable=True)
    
    # Tier 3: Personal Assets at Risk
    personal_assets_value = Column(Float, default=0.0)  # Value of personal assets
    tier_3_exposure = Column(Float, default=0.0)  # Amount of personal assets at risk
    tier_3_seized = Column(Float, default=0.0)  # Amount seized from personal assets
    
    # Loan details for calculations
    original_loan_amount = Column(Float, default=0.0)
    outstanding_balance = Column(Float, default=0.0)
    guarantee_percentage = Column(Float, default=0.0)  # e.g., 50%
    guaranteed_amount = Column(Float, default=0.0)  # Loan amount covered by guarantee
    
    # Payment tracking
    months_current = Column(Integer, default=0)  # Consecutive months of on-time payments
    months_delinquent = Column(Integer, default=0)  # Consecutive months missed
    total_missed_payments = Column(Float, default=0.0)  # Total amount of missed payments
    
    # Timestamps for status changes
    last_payment_date = Column(DateTime, nullable=True)
    tier_1_triggered_at = Column(DateTime, nullable=True)
    tier_2_triggered_at = Column(DateTime, nullable=True)
    tier_3_triggered_at = Column(DateTime, nullable=True)
    
    # Relationships
    borrower = relationship("User", foreign_keys=[borrower_id], backref="protections")
    loan = relationship("ExecutedLoan", backref="protection")
    deal = relationship("Deal", backref="protection")
    
    def __repr__(self):
        return f"<BorrowerProtection {self.id}: Loan {self.loan_id} - {self.status.value}>"
    
    @property
    def tier_1_remaining(self) -> float:
        """Remaining Tier 1 coverage."""
        return max(0, self.tier_1_coverage - self.tier_1_used)
    
    @property
    def tier_2_remaining(self) -> float:
        """Remaining Tier 2 coverage."""
        if not self.tier_2_enrolled:
            return 0
        return max(0, self.tier_2_coverage - self.tier_2_used)
    
    @property
    def tier_3_remaining(self) -> float:
        """Personal assets not yet seized."""
        return max(0, self.personal_assets_value - self.tier_3_seized)
    
    @property
    def total_protection(self) -> float:
        """Total protection across all tiers."""
        return self.tier_1_coverage + self.tier_2_coverage + self.personal_assets_value
    
    @property
    def total_used(self) -> float:
        """Total protection used across all tiers."""
        return self.tier_1_used + self.tier_2_used + self.tier_3_seized
    
    @property
    def protection_health_score(self) -> int:
        """Score from 0-100 indicating protection health."""
        if self.status == DefaultProtectionStatus.DEFAULTED:
            return 0
        if self.status == DefaultProtectionStatus.TIER_3_TRIGGERED:
            return 10
        if self.status == DefaultProtectionStatus.TIER_2_TRIGGERED:
            return 30
        if self.status == DefaultProtectionStatus.TIER_1_TRIGGERED:
            return 50
        if self.status == DefaultProtectionStatus.WARNING:
            return 70
        # Active status - score based on coverage ratio
        if self.outstanding_balance > 0:
            coverage_ratio = self.total_protection / self.outstanding_balance
            return min(100, int(70 + (coverage_ratio * 30)))
        return 100


class ProtectionPayment(Base, TimestampMixin):
    """Tracks Tier 2 personal protection fee payments."""
    __tablename__ = "protection_payments"
    
    id = Column(Integer, primary_key=True, index=True)
    protection_id = Column(Integer, ForeignKey("borrower_protections.id"), nullable=False)
    borrower_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    amount = Column(Float, nullable=False)
    payment_date = Column(DateTime, default=datetime.utcnow)
    payment_method = Column(String(50), nullable=True)  # card, bank, etc.
    
    # Coverage this payment provides
    coverage_added = Column(Float, default=0.0)  # amount * multiplier
    
    # Status
    status = Column(String(50), default="completed")  # completed, pending, failed
    
    # Relationships
    protection = relationship("BorrowerProtection", backref="tier_2_payments")
    borrower = relationship("User", backref="protection_payments")


class ProtectionEvent(Base, TimestampMixin):
    """Audit log for protection status changes and tier triggers."""
    __tablename__ = "protection_events"
    
    id = Column(Integer, primary_key=True, index=True)
    protection_id = Column(Integer, ForeignKey("borrower_protections.id"), nullable=False)
    
    event_type = Column(String(100), nullable=False)  # tier_triggered, payment_missed, etc.
    previous_status = Column(String(50), nullable=True)
    new_status = Column(String(50), nullable=True)
    previous_tier = Column(String(20), nullable=True)
    new_tier = Column(String(20), nullable=True)
    
    amount_involved = Column(Float, nullable=True)  # Amount of coverage used/added
    description = Column(Text, nullable=True)
    
    # Relationships
    protection = relationship("BorrowerProtection", backref="events")
