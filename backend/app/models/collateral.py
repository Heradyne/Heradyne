import enum
from sqlalchemy import Column, Integer, String, Float, Boolean, Enum, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from datetime import datetime

from app.models.base import Base, TimestampMixin


class AssetCategory(str, enum.Enum):
    # Personal Assets
    REAL_ESTATE = "real_estate"
    VEHICLE = "vehicle"
    INVESTMENT_ACCOUNT = "investment_account"
    RETIREMENT_ACCOUNT = "retirement_account"
    CASH_SAVINGS = "cash_savings"
    JEWELRY = "jewelry"
    COLLECTIBLES = "collectibles"
    OTHER_PERSONAL = "other_personal"
    
    # Business Assets
    EQUIPMENT = "equipment"
    INVENTORY = "inventory"
    ACCOUNTS_RECEIVABLE = "accounts_receivable"
    REAL_PROPERTY = "real_property"
    INTELLECTUAL_PROPERTY = "intellectual_property"
    VEHICLES_FLEET = "vehicles_fleet"
    FURNITURE_FIXTURES = "furniture_fixtures"
    OTHER_BUSINESS = "other_business"


class AssetType(str, enum.Enum):
    PERSONAL = "personal"
    BUSINESS = "business"


class VerificationStatus(str, enum.Enum):
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"
    NEEDS_INFO = "needs_info"


class PreQualifiedAsset(Base, TimestampMixin):
    """
    Pre-qualified collateral assets that borrowers can use across multiple deals.
    These are valued by the collateral pricing engine and automatically populate deals.
    """
    __tablename__ = "prequalified_assets"
    
    id = Column(Integer, primary_key=True, index=True)
    borrower_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Asset classification
    asset_type = Column(Enum(AssetType, native_enum=False), nullable=False)
    category = Column(Enum(AssetCategory, native_enum=False), nullable=False)
    
    # Asset details
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    # For real estate
    address = Column(String(500), nullable=True)
    property_type = Column(String(100), nullable=True)  # single_family, commercial, land, etc.
    square_feet = Column(Integer, nullable=True)
    year_built = Column(Integer, nullable=True)
    
    # For vehicles
    make = Column(String(100), nullable=True)
    model = Column(String(100), nullable=True)
    year = Column(Integer, nullable=True)
    vin = Column(String(50), nullable=True)
    mileage = Column(Integer, nullable=True)
    
    # For equipment/inventory
    condition = Column(String(50), nullable=True)  # excellent, good, fair, poor
    age_years = Column(Integer, nullable=True)
    
    # Valuation
    stated_value = Column(Float, nullable=False)  # What borrower claims it's worth
    estimated_value = Column(Float, nullable=True)  # Our pricing engine estimate
    forced_sale_value = Column(Float, nullable=True)  # Quick liquidation value (usually 60-80% of estimated)
    collateral_value = Column(Float, nullable=True)  # Value we'll accept as collateral (with haircut)
    
    # Pricing engine results
    valuation_confidence = Column(Float, nullable=True)  # 0-1 confidence score
    valuation_method = Column(String(100), nullable=True)  # comp_analysis, book_value, etc.
    valuation_notes = Column(Text, nullable=True)
    last_valued_at = Column(DateTime, nullable=True)
    
    # Liens and encumbrances
    has_lien = Column(Boolean, default=False)
    lien_amount = Column(Float, nullable=True)
    lien_holder = Column(String(255), nullable=True)
    net_equity = Column(Float, nullable=True)  # estimated_value - lien_amount
    
    # Verification
    verification_status = Column(Enum(VerificationStatus, native_enum=False), default=VerificationStatus.PENDING)
    verified_at = Column(DateTime, nullable=True)
    verified_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    verification_notes = Column(Text, nullable=True)
    
    # Documentation
    documents = Column(JSON, nullable=True)  # List of {filename, upload_date, type}
    
    # Usage tracking
    is_active = Column(Boolean, default=True)
    times_used_as_collateral = Column(Integer, default=0)
    
    # Relationships
    borrower = relationship("User", foreign_keys=[borrower_id], backref="prequalified_assets")
    verified_by = relationship("User", foreign_keys=[verified_by_id])
    
    def __repr__(self):
        return f"<PreQualifiedAsset {self.id}: {self.name} ({self.category.value})>"


# Pricing factors for the collateral engine
COLLATERAL_HAIRCUTS = {
    # Personal assets - generally higher haircuts due to liquidation difficulty
    AssetCategory.REAL_ESTATE: 0.20,  # 20% haircut (use 80% of value)
    AssetCategory.VEHICLE: 0.30,  # 30% haircut
    AssetCategory.INVESTMENT_ACCOUNT: 0.15,  # 15% haircut (liquid)
    AssetCategory.RETIREMENT_ACCOUNT: 0.40,  # 40% haircut (penalties, restrictions)
    AssetCategory.CASH_SAVINGS: 0.05,  # 5% haircut (very liquid)
    AssetCategory.JEWELRY: 0.50,  # 50% haircut (hard to value/liquidate)
    AssetCategory.COLLECTIBLES: 0.60,  # 60% haircut
    AssetCategory.OTHER_PERSONAL: 0.50,
    
    # Business assets
    AssetCategory.EQUIPMENT: 0.35,
    AssetCategory.INVENTORY: 0.40,  # Can be obsolete/perishable
    AssetCategory.ACCOUNTS_RECEIVABLE: 0.25,  # Depends on quality
    AssetCategory.REAL_PROPERTY: 0.20,
    AssetCategory.INTELLECTUAL_PROPERTY: 0.70,  # Very hard to value/liquidate
    AssetCategory.VEHICLES_FLEET: 0.30,
    AssetCategory.FURNITURE_FIXTURES: 0.50,
    AssetCategory.OTHER_BUSINESS: 0.50,
}

# Depreciation rates for equipment/vehicles (annual)
DEPRECIATION_RATES = {
    AssetCategory.VEHICLE: 0.15,  # 15% per year
    AssetCategory.VEHICLES_FLEET: 0.15,
    AssetCategory.EQUIPMENT: 0.10,
    AssetCategory.FURNITURE_FIXTURES: 0.10,
}
