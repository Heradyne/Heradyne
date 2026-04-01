from sqlalchemy import Column, Integer, String, Float, JSON, Text, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin


class SystemAssumption(Base, TimestampMixin):
    __tablename__ = "system_assumptions"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Optional user_id - if null, it's a system-wide default
    # If set, it's a user-specific override
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    
    category = Column(String(100), nullable=False, index=True)
    key = Column(String(100), nullable=False, index=True)
    value = Column(JSON, nullable=False)
    description = Column(Text, nullable=True)
    
    # Relationship
    user = relationship("User", back_populates="assumptions")
    
    # Ensure unique combination of user_id + category + key
    __table_args__ = (
        UniqueConstraint('user_id', 'category', 'key', name='uq_user_category_key'),
    )
    
    def __repr__(self):
        user_str = f"user={self.user_id}" if self.user_id else "system"
        return f"<SystemAssumption {self.category}.{self.key} ({user_str})>"


# Default assumptions to seed
DEFAULT_ASSUMPTIONS = [
    # SBA Anchor PD
    {
        "category": "pd_engine",
        "key": "sba_anchor_pd",
        "value": 0.03,  # 3% base annual PD
        "description": "Base annual probability of default anchored to SBA charge-off rates"
    },
    
    # Industry multipliers
    {
        "category": "pd_engine",
        "key": "industry_multipliers",
        "value": {
            "manufacturing": 1.0,
            "retail": 1.2,
            "services": 1.1,
            "technology": 1.3,
            "healthcare": 0.9,
            "construction": 1.4,
            "restaurants": 1.5,
            "hospitality": 1.4,
            "transportation": 1.2,
            "wholesale": 1.1,
            "professional_services": 0.95,
            "default": 1.0
        },
        "description": "Industry-specific PD multipliers"
    },
    
    # Leverage multipliers
    {
        "category": "pd_engine",
        "key": "leverage_multipliers",
        "value": {
            "ranges": [
                {"max_leverage": 2.0, "multiplier": 0.8},
                {"max_leverage": 3.0, "multiplier": 1.0},
                {"max_leverage": 4.0, "multiplier": 1.3},
                {"max_leverage": 5.0, "multiplier": 1.6},
                {"max_leverage": 999, "multiplier": 2.0}
            ]
        },
        "description": "Leverage-based PD multipliers (debt/EBITDA)"
    },
    
    # Volatility multipliers
    {
        "category": "pd_engine",
        "key": "volatility_multipliers",
        "value": {
            "low": 0.9,
            "medium": 1.0,
            "high": 1.3
        },
        "description": "Revenue/EBITDA volatility PD multipliers"
    },
    
    # Valuation multiples by industry
    {
        "category": "valuation_engine",
        "key": "ev_multiples",
        "value": {
            "manufacturing": {"low": 3.0, "mid": 4.5, "high": 6.0},
            "retail": {"low": 2.5, "mid": 3.5, "high": 5.0},
            "services": {"low": 3.5, "mid": 5.0, "high": 7.0},
            "technology": {"low": 5.0, "mid": 8.0, "high": 12.0},
            "healthcare": {"low": 4.0, "mid": 6.0, "high": 9.0},
            "construction": {"low": 2.5, "mid": 3.5, "high": 5.0},
            "restaurants": {"low": 2.0, "mid": 3.0, "high": 4.5},
            "hospitality": {"low": 3.0, "mid": 4.5, "high": 6.5},
            "transportation": {"low": 3.0, "mid": 4.0, "high": 5.5},
            "wholesale": {"low": 2.5, "mid": 3.5, "high": 5.0},
            "professional_services": {"low": 4.0, "mid": 6.0, "high": 8.0},
            "default": {"low": 3.0, "mid": 4.5, "high": 6.0}
        },
        "description": "EV/EBITDA multiples by industry (low/mid/high)"
    },
    
    # Collateral haircut tables
    {
        "category": "collateral_engine",
        "key": "business_asset_haircuts",
        "value": {
            "accounts_receivable": 0.20,
            "inventory": 0.40,
            "equipment": 0.30,
            "vehicles": 0.25,
            "real_estate": 0.15,
            "intellectual_property": 0.70,
            "goodwill": 1.0,  # No value for NOLV
            "default": 0.50
        },
        "description": "Haircut percentages for business asset NOLV calculation"
    },
    {
        "category": "collateral_engine",
        "key": "personal_asset_haircuts",
        "value": {
            "primary_residence": 0.20,
            "investment_property": 0.25,
            "brokerage_accounts": 0.10,
            "retirement_accounts": 0.30,
            "vehicles": 0.25,
            "cash": 0.0,
            "default": 0.40
        },
        "description": "Haircut percentages for personal asset NOLV calculation"
    },
    
    # Structuring parameters
    {
        "category": "structuring_engine",
        "key": "guarantee_bands",
        "value": {
            "min_pct": 0.50,
            "max_pct": 0.70,
            "default_pct": 0.60
        },
        "description": "Guarantee percentage bands (50-70%)"
    },
    {
        "category": "structuring_engine",
        "key": "escrow_bands",
        "value": {
            "min_pct": 0.03,
            "max_pct": 0.07,
            "default_pct": 0.05
        },
        "description": "Escrow percentage bands (3-7%)"
    },
    
    # Stress test parameters
    {
        "category": "cashflow_engine",
        "key": "stress_scenarios",
        "value": {
            "revenue_decline": 0.20,  # 20% revenue decline
            "margin_compression": 0.05  # 5% margin compression
        },
        "description": "Stress scenario parameters for DSCR stress testing"
    },
    
    # Fee parameters
    {
        "category": "fees",
        "key": "borrower_fee_cap",
        "value": 0.02,  # 2% of post-debt FCF
        "description": "Maximum borrower cash-flow fee as percentage of post-debt FCF"
    },
    
    # Origination settings
    {
        "category": "origination",
        "key": "require_dual_acceptance",
        "value": False,
        "description": "Require both lender AND insurer/fund acceptance before loan can be originated"
    },
    {
        "category": "origination",
        "key": "require_insurer_for_origination",
        "value": False,
        "description": "Require an insurer/fund guarantee before loan can be originated"
    }
]
