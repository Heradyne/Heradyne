import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, Enum, DateTime, ForeignKey, Text, JSON, Date
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin


class LoanStatus(str, enum.Enum):
    ACTIVE = "active"
    PAID_OFF = "paid_off"
    DEFAULT = "default"
    WORKOUT = "workout"  # In workout/restructuring
    CHARGED_OFF = "charged_off"


class ExecutedLoan(Base, TimestampMixin):
    """
    Represents a loan that has been executed/funded.
    Tracks the actual loan terms and ongoing performance.
    """
    __tablename__ = "executed_loans"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Link to original deal and match
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    match_id = Column(Integer, ForeignKey("deal_matches.id"), nullable=True)
    
    # Parties involved
    borrower_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    lender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    insurer_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # May not have insurance
    
    # Loan identification
    loan_number = Column(String(50), unique=True, nullable=False, index=True)
    
    # Loan terms
    principal_amount = Column(Float, nullable=False)
    interest_rate = Column(Float, nullable=False)  # Annual rate as decimal (e.g., 0.08 for 8%)
    term_months = Column(Integer, nullable=False)
    monthly_payment = Column(Float, nullable=False)
    origination_date = Column(Date, nullable=False)
    maturity_date = Column(Date, nullable=False)
    
    # Current status
    status = Column(Enum(LoanStatus, native_enum=False), default=LoanStatus.ACTIVE)
    current_principal_balance = Column(Float, nullable=False)
    
    # Insurance/guarantee details
    guarantee_percentage = Column(Float, nullable=True)  # e.g., 0.50 for 50%
    premium_rate = Column(Float, nullable=True)  # Annual premium as decimal
    premium_paid = Column(Float, default=0)  # Total premium paid to date
    
    # Geographic info
    state = Column(String(2), nullable=True, index=True)
    city = Column(String(100), nullable=True)
    zip_code = Column(String(10), nullable=True)
    
    # Industry (copied from deal for easy reporting)
    industry = Column(String(100), nullable=False, index=True)
    
    # Performance tracking
    days_past_due = Column(Integer, default=0)
    last_payment_date = Column(Date, nullable=True)
    total_payments_made = Column(Integer, default=0)
    total_principal_paid = Column(Float, default=0)
    total_interest_paid = Column(Float, default=0)
    
    # Default info (if applicable)
    default_date = Column(Date, nullable=True)
    default_amount = Column(Float, nullable=True)  # Amount at default
    recovery_amount = Column(Float, nullable=True)
    loss_amount = Column(Float, nullable=True)
    
    # Notes
    notes = Column(Text, nullable=True)
    
    # Relationships
    deal = relationship("Deal")
    match = relationship("DealMatch")
    borrower = relationship("User", foreign_keys=[borrower_id])
    lender = relationship("User", foreign_keys=[lender_id])
    insurer = relationship("User", foreign_keys=[insurer_id])
    payments = relationship("LoanPayment", back_populates="loan", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<ExecutedLoan {self.loan_number} ({self.status.value})>"


class LoanPayment(Base, TimestampMixin):
    """
    Individual payment records for executed loans.
    """
    __tablename__ = "loan_payments"
    
    id = Column(Integer, primary_key=True, index=True)
    loan_id = Column(Integer, ForeignKey("executed_loans.id"), nullable=False)
    
    payment_date = Column(Date, nullable=False)
    payment_number = Column(Integer, nullable=False)
    
    # Payment breakdown
    scheduled_payment = Column(Float, nullable=False)
    actual_payment = Column(Float, nullable=False)
    principal_portion = Column(Float, nullable=False)
    interest_portion = Column(Float, nullable=False)
    
    # Balance after payment
    principal_balance_after = Column(Float, nullable=False)
    
    # Status
    is_late = Column(Boolean, default=False)
    days_late = Column(Integer, default=0)
    
    # Relationship
    loan = relationship("ExecutedLoan", back_populates="payments")
    
    def __repr__(self):
        return f"<LoanPayment {self.loan_id}-{self.payment_number}>"


class InsuranceClaim(Base, TimestampMixin):
    """
    Insurance claims for defaulted loans.
    """
    __tablename__ = "insurance_claims"
    
    id = Column(Integer, primary_key=True, index=True)
    loan_id = Column(Integer, ForeignKey("executed_loans.id"), nullable=False)
    insurer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    claim_number = Column(String(50), unique=True, nullable=False)
    claim_date = Column(Date, nullable=False)
    
    # Claim details
    claim_amount = Column(Float, nullable=False)  # Amount claimed
    approved_amount = Column(Float, nullable=True)  # Amount approved
    paid_amount = Column(Float, nullable=True)  # Amount actually paid
    
    status = Column(String(50), default="pending")  # pending, approved, denied, paid
    
    # Dates
    approved_date = Column(Date, nullable=True)
    paid_date = Column(Date, nullable=True)
    
    notes = Column(Text, nullable=True)
    
    # Relationships
    loan = relationship("ExecutedLoan")
    insurer = relationship("User")
    
    def __repr__(self):
        return f"<InsuranceClaim {self.claim_number} ({self.status})>"
