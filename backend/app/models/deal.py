import enum
from sqlalchemy import Column, Integer, String, Float, Boolean, Enum, DateTime, ForeignKey, Text, JSON, event
from sqlalchemy.orm import relationship
from sqlalchemy.ext.hybrid import hybrid_property

from app.models.base import Base, TimestampMixin


def _get_fernet():
    """Lazy-loaded Fernet instance for field encryption."""
    try:
        import base64
        from cryptography.fernet import Fernet
        from app.core.config import settings
        if 'INSECURE' in settings.FIELD_ENCRYPTION_KEY:
            return None
        raw = settings.FIELD_ENCRYPTION_KEY.encode()
        key = base64.urlsafe_b64encode(raw[:32].ljust(32, b'\x00'))
        return Fernet(key)
    except Exception:
        return None


def _encrypt_json(value) -> str:
    """Encrypt a JSON-serializable value to a string."""
    import json
    if value is None:
        return None
    f = _get_fernet()
    if f is None:
        return json.dumps(value)  # no-op if encryption not configured
    return f.encrypt(json.dumps(value).encode()).decode()


def _decrypt_json(value) -> object:
    """Decrypt an encrypted JSON string."""
    import json
    if value is None:
        return None
    f = _get_fernet()
    if f is None:
        # Try to parse as plain JSON (unencrypted)
        try:
            return json.loads(value) if isinstance(value, str) else value
        except Exception:
            return value
    try:
        decrypted = f.decrypt(value.encode() if isinstance(value, str) else value)
        return json.loads(decrypted)
    except Exception:
        # Backward compat: return as-is if not encrypted
        try:
            return json.loads(value) if isinstance(value, str) else value
        except Exception:
            return value


class DealType(str, enum.Enum):
    ACQUISITION = "acquisition"
    GROWTH = "growth"


class DealStatus(str, enum.Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    ANALYZING = "analyzing"
    ANALYZED = "analyzed"
    MATCHED = "matched"
    PENDING_LENDER = "pending_lender"
    PENDING_INSURER = "pending_insurer"
    APPROVED = "approved"
    FUNDED = "funded"
    REJECTED = "rejected"
    CLOSED = "closed"


class Deal(Base, TimestampMixin):
    __tablename__ = "deals"
    
    id = Column(Integer, primary_key=True, index=True)
    borrower_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Basic info
    name = Column(String(255), nullable=False)
    deal_type = Column(Enum(DealType, native_enum=False), nullable=False)
    status = Column(Enum(DealStatus, native_enum=False), default=DealStatus.DRAFT)
    industry = Column(String(100), nullable=False)
    business_description = Column(Text, nullable=True)
    
    # Loan request
    loan_amount_requested = Column(Float, nullable=False)
    loan_term_months = Column(Integer, nullable=False, default=84)  # 7 years default
    
    # Financial metrics (provided by borrower)
    annual_revenue = Column(Float, nullable=False)
    gross_profit = Column(Float, nullable=True)
    ebitda = Column(Float, nullable=False)
    capex = Column(Float, nullable=True, default=0)
    debt_service = Column(Float, nullable=True, default=0)
    
    # Addbacks and adjustments
    addbacks = Column(JSON, nullable=True)  # List of {description, amount}
    
    # For acquisitions
    purchase_price = Column(Float, nullable=True)
    equity_injection = Column(Float, nullable=True)
    
    # Collateral info — stored encrypted at rest
    _business_assets_enc = Column("business_assets", Text, nullable=True)
    _personal_assets_enc = Column("personal_assets", Text, nullable=True)

    @hybrid_property
    def business_assets(self):
        return _decrypt_json(self._business_assets_enc)

    @business_assets.setter
    def business_assets(self, value):
        self._business_assets_enc = _encrypt_json(value)

    @hybrid_property
    def personal_assets(self):
        return _decrypt_json(self._personal_assets_enc)

    @personal_assets.setter
    def personal_assets(self, value):
        self._personal_assets_enc = _encrypt_json(value)

    # Owner info
    owner_credit_score = Column(Integer, nullable=True)  # numeric — not PII encrypted
    owner_experience_years = Column(Integer, nullable=True)
    
    # Relationships
    borrower = relationship("User", back_populates="deals", foreign_keys=[borrower_id])
    documents = relationship("DealDocument", back_populates="deal", cascade="all, delete-orphan")
    risk_reports = relationship("DealRiskReport", back_populates="deal", cascade="all, delete-orphan")
    matches = relationship("DealMatch", back_populates="deal", cascade="all, delete-orphan")
    monthly_cashflows = relationship("MonthlyCashflow", back_populates="deal", cascade="all, delete-orphan")
    fee_ledger = relationship("FeeLedger", back_populates="deal", cascade="all, delete-orphan")
    verification_flags = relationship("VerificationFlag", back_populates="deal", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Deal {self.name} ({self.status.value})>"


class DealDocument(Base, TimestampMixin):
    __tablename__ = "deal_documents"
    
    id = Column(Integer, primary_key=True, index=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    
    filename = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=False)
    mime_type = Column(String(100), nullable=True)
    document_type = Column(String(100), nullable=True)  # tax_return, financial_statement, etc.
    
    deal = relationship("Deal", back_populates="documents")
    
    def __repr__(self):
        return f"<DealDocument {self.original_filename}>"


class DealRiskReport(Base, TimestampMixin):
    __tablename__ = "deal_risk_reports"
    
    id = Column(Integer, primary_key=True, index=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    version = Column(Integer, nullable=False, default=1)
    
    # Cash flow analysis
    normalized_ebitda = Column(Float, nullable=True)
    post_debt_fcf = Column(Float, nullable=True)
    dscr_base = Column(Float, nullable=True)
    dscr_stress = Column(Float, nullable=True)
    
    # PD analysis
    sba_anchor_pd = Column(Float, nullable=True)
    industry_multiplier = Column(Float, nullable=True)
    leverage_multiplier = Column(Float, nullable=True)
    volatility_multiplier = Column(Float, nullable=True)
    annual_pd = Column(Float, nullable=True)
    
    # Valuation
    ev_low = Column(Float, nullable=True)
    ev_mid = Column(Float, nullable=True)
    ev_high = Column(Float, nullable=True)
    durability_score = Column(Float, nullable=True)
    
    # Collateral
    business_nolv = Column(Float, nullable=True)
    personal_nolv = Column(Float, nullable=True)
    total_nolv = Column(Float, nullable=True)
    collateral_coverage = Column(Float, nullable=True)
    
    # Structuring recommendations
    recommended_guarantee_pct = Column(Float, nullable=True)
    recommended_escrow_pct = Column(Float, nullable=True)
    recommended_alignment = Column(JSON, nullable=True)
    
    # Document verification results
    verification_status = Column(String(50), nullable=True)  # verified, flagged, pending
    verification_confidence = Column(Float, nullable=True)  # 0-100
    verification_flags = Column(JSON, nullable=True)  # List of discrepancies
    documents_verified = Column(Integer, nullable=True, default=0)
    
    # Full report data
    report_data = Column(JSON, nullable=True)
    

    # ── UnderwriteOS extended fields ──────────────────────────────────────────
    health_score = Column(Float, nullable=True)
    health_score_cashflow = Column(Float, nullable=True)
    health_score_stability = Column(Float, nullable=True)
    health_score_growth = Column(Float, nullable=True)
    health_score_liquidity = Column(Float, nullable=True)
    health_score_distress = Column(Float, nullable=True)
    pdscr = Column(Float, nullable=True)
    owner_draw_annual = Column(Float, nullable=True)
    premium_capacity_monthly = Column(Float, nullable=True)
    normalized_sde = Column(Float, nullable=True)
    sde_multiple_implied = Column(Float, nullable=True)
    equity_value_low = Column(Float, nullable=True)
    equity_value_mid = Column(Float, nullable=True)
    equity_value_high = Column(Float, nullable=True)
    net_debt = Column(Float, nullable=True)
    valuation_method_weights = Column(JSON, nullable=True)
    sba_eligible = Column(Boolean, nullable=True)
    sba_eligibility_checklist = Column(JSON, nullable=True)
    sba_max_loan = Column(Float, nullable=True)
    sba_ltv = Column(Float, nullable=True)
    deal_killer_verdict = Column(String(20), nullable=True)
    deal_confidence_score = Column(Float, nullable=True)
    max_supportable_price = Column(Float, nullable=True)
    breakpoint_scenarios = Column(JSON, nullable=True)
    cash_runway_months = Column(Float, nullable=True)
    cash_forecast_18m = Column(JSON, nullable=True)
    playbooks = Column(JSON, nullable=True)
    # ──────────────────────────────────────────────────────────────────────────
    deal = relationship("Deal", back_populates="risk_reports")
    
    def __repr__(self):
        return f"<DealRiskReport Deal:{self.deal_id} v{self.version}>"


class DealMatch(Base, TimestampMixin):
    __tablename__ = "deal_matches"
    
    id = Column(Integer, primary_key=True, index=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    
    # Can match to lender OR insurer
    lender_policy_id = Column(Integer, ForeignKey("lender_policies.id"), nullable=True)
    insurer_policy_id = Column(Integer, ForeignKey("insurer_policies.id"), nullable=True)
    
    match_score = Column(Float, nullable=True)
    match_reasons = Column(JSON, nullable=True)  # List of reasons for match
    constraints_met = Column(JSON, nullable=True)  # Which constraints are satisfied
    constraints_failed = Column(JSON, nullable=True)  # Which constraints failed
    
    # Status: pending, accepted, rejected, info_requested, counter_offered, counter_accepted, counter_rejected
    status = Column(String(50), default="pending")
    decision_notes = Column(Text, nullable=True)
    decision_at = Column(DateTime, nullable=True)
    
    # Auto-decision tracking
    auto_decision = Column(Boolean, default=False)  # Was this an automatic decision?
    auto_decision_reason = Column(String(100), nullable=True)  # Why auto-decided
    
    # Counter-offer fields
    counter_offer = Column(JSON, nullable=True)  # Proposed deal modifications
    counter_offer_at = Column(DateTime, nullable=True)
    counter_offer_expires_at = Column(DateTime, nullable=True)
    borrower_response = Column(String(50), nullable=True)  # accepted, rejected, expired
    borrower_response_at = Column(DateTime, nullable=True)
    borrower_response_notes = Column(Text, nullable=True)
    
    # Approve-if scenarios
    scenarios = Column(JSON, nullable=True)  # List of restructuring scenarios
    
    deal = relationship("Deal", back_populates="matches")
    lender_policy = relationship("LenderPolicy", back_populates="matches")
    insurer_policy = relationship("InsurerPolicy", back_populates="matches")
    
    def __repr__(self):
        return f"<DealMatch Deal:{self.deal_id} Status:{self.status}>"


class MonthlyCashflow(Base, TimestampMixin):
    __tablename__ = "monthly_cashflows"
    
    id = Column(Integer, primary_key=True, index=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    
    month = Column(Integer, nullable=False)  # 1-based month number from close
    year = Column(Integer, nullable=False)
    
    revenue = Column(Float, nullable=False)
    ebitda = Column(Float, nullable=False)
    debt_service = Column(Float, nullable=True, default=0)
    post_debt_fcf = Column(Float, nullable=True)
    
    deal = relationship("Deal", back_populates="monthly_cashflows")
    
    def __repr__(self):
        return f"<MonthlyCashflow Deal:{self.deal_id} {self.year}-{self.month:02d}>"


class FeeLedger(Base, TimestampMixin):
    __tablename__ = "fee_ledger"
    
    id = Column(Integer, primary_key=True, index=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    
    month = Column(Integer, nullable=False)
    year = Column(Integer, nullable=False)
    
    post_debt_fcf = Column(Float, nullable=False)
    fee_rate = Column(Float, nullable=False, default=0.02)  # 2% cap
    calculated_fee = Column(Float, nullable=False)
    
    deal = relationship("Deal", back_populates="fee_ledger")
    
    def __repr__(self):
        return f"<FeeLedger Deal:{self.deal_id} {self.year}-{self.month:02d} ${self.calculated_fee:.2f}>"
