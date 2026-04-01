from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, JSON, Text
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin


class LenderPolicy(Base, TimestampMixin):
    __tablename__ = "lender_policies"
    
    id = Column(Integer, primary_key=True, index=True)
    lender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    name = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    
    # Loan size constraints
    min_loan_size = Column(Float, nullable=True)
    max_loan_size = Column(Float, nullable=True)
    
    # Risk constraints
    min_dscr = Column(Float, nullable=True)  # Minimum debt service coverage ratio
    max_pd = Column(Float, nullable=True)  # Maximum probability of default
    max_leverage = Column(Float, nullable=True)  # Max debt/EBITDA
    min_collateral_coverage = Column(Float, nullable=True)  # Min collateral/loan
    
    # Industry constraints
    allowed_industries = Column(JSON, nullable=True)  # List of allowed industries
    excluded_industries = Column(JSON, nullable=True)  # List of excluded industries
    
    # Term constraints
    min_term_months = Column(Integer, nullable=True)
    max_term_months = Column(Integer, nullable=True)
    
    # Rate expectations
    target_rate_min = Column(Float, nullable=True)  # Minimum interest rate
    target_rate_max = Column(Float, nullable=True)  # Maximum interest rate
    
    # Deal type preferences
    allowed_deal_types = Column(JSON, nullable=True)  # acquisition, growth
    
    # Auto-decision thresholds (match score ranges 0-100)
    auto_accept_threshold = Column(Float, nullable=True)  # Auto-accept if match >= this %
    auto_reject_threshold = Column(Float, nullable=True)  # Auto-reject if match <= this %
    counter_offer_min = Column(Float, nullable=True)  # Counter-offer if match >= this %
    counter_offer_max = Column(Float, nullable=True)  # Counter-offer if match < auto_accept
    auto_decision_enabled = Column(Boolean, default=False)  # Enable/disable auto-decisions
    
    # Notes

    # ── UnderwriteOS filter fields ──────────────────────────────────────────
    min_health_score = Column(Float, nullable=True)
    min_pdscr = Column(Float, nullable=True)
    require_sba_eligible = Column(Boolean, nullable=True)
    min_deal_confidence_score = Column(Float, nullable=True)
    # ───────────────────────────────────────────────────────────────────────
    notes = Column(Text, nullable=True)
    
    lender = relationship("User", back_populates="lender_policies")
    matches = relationship("DealMatch", back_populates="lender_policy")
    
    def __repr__(self):
        return f"<LenderPolicy {self.name}>"


class InsurerPolicy(Base, TimestampMixin):
    __tablename__ = "insurer_policies"
    
    id = Column(Integer, primary_key=True, index=True)
    insurer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    name = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    
    # Risk constraints
    max_expected_loss = Column(Float, nullable=True)  # Max PD * LGD
    min_attachment_point = Column(Float, nullable=True)  # Min first-loss %
    max_attachment_point = Column(Float, nullable=True)
    
    # Premium expectations
    target_premium_min = Column(Float, nullable=True)  # As % of coverage
    target_premium_max = Column(Float, nullable=True)
    
    # Coverage constraints
    min_coverage_amount = Column(Float, nullable=True)
    max_coverage_amount = Column(Float, nullable=True)
    
    # Industry constraints
    allowed_industries = Column(JSON, nullable=True)
    excluded_industries = Column(JSON, nullable=True)
    
    # Deal type preferences
    allowed_deal_types = Column(JSON, nullable=True)
    
    # Auto-decision thresholds (match score ranges 0-100)
    auto_accept_threshold = Column(Float, nullable=True)  # Auto-accept if match >= this %
    auto_reject_threshold = Column(Float, nullable=True)  # Auto-reject if match <= this %
    counter_offer_min = Column(Float, nullable=True)  # Counter-offer if match >= this %
    counter_offer_max = Column(Float, nullable=True)  # Counter-offer if match < auto_accept
    auto_decision_enabled = Column(Boolean, default=False)  # Enable/disable auto-decisions
    
    # Notes
    notes = Column(Text, nullable=True)
    

    # ── UnderwriteOS indication fields ─────────────────────────────────────
    min_health_score = Column(Float, nullable=True)
    max_pdscr_floor = Column(Float, nullable=True)
    pg_support_pct_of_loan = Column(Float, nullable=True)
    lender_support_pct_of_loan = Column(Float, nullable=True)
    # ───────────────────────────────────────────────────────────────────────
    insurer = relationship("User", back_populates="insurer_policies")
    matches = relationship("DealMatch", back_populates="insurer_policy")
    
    def __repr__(self):
        return f"<InsurerPolicy {self.name}>"
