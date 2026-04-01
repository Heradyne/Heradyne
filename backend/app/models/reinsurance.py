"""
Reinsurance Models

Allows insurers to pool insured deals and offer them to reinsurers.
"""
import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, Enum, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin


class ReinsurancePoolStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    OFFERED = "offered"
    SOLD = "sold"
    EXPIRED = "expired"


class ReinsuranceOfferStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    COUNTERED = "countered"
    WITHDRAWN = "withdrawn"


class ReinsurancePool(Base, TimestampMixin):
    """A group of insured deals pooled for reinsurance."""
    __tablename__ = "reinsurance_pools"
    
    id = Column(Integer, primary_key=True, index=True)
    insurer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(Enum(ReinsurancePoolStatus, native_enum=False), default=ReinsurancePoolStatus.DRAFT)
    
    # Pool composition (list of executed_loan IDs that have guarantees)
    deal_ids = Column(JSON, nullable=False, default=list)
    
    # Cession terms
    cession_percentage = Column(Float, default=50.0)  # % of risk to cede
    asking_price = Column(Float, nullable=True)  # Price to sell the pool
    
    # Calculated analytics (cached for performance)
    total_exposure = Column(Float, default=0)
    total_premium = Column(Float, default=0)
    weighted_pd = Column(Float, default=0)
    expected_loss = Column(Float, default=0)
    industry_distribution = Column(JSON, nullable=True)
    geographic_distribution = Column(JSON, nullable=True)
    
    # Offer tracking
    offered_at = Column(DateTime, nullable=True)
    sold_at = Column(DateTime, nullable=True)
    sold_to_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    sale_price = Column(Float, nullable=True)
    
    # Relationships
    insurer = relationship("User", foreign_keys=[insurer_id])
    sold_to = relationship("User", foreign_keys=[sold_to_id])
    offers = relationship("ReinsuranceOffer", back_populates="pool", cascade="all, delete-orphan")


class ReinsuranceOffer(Base, TimestampMixin):
    """An offer from a reinsurer to buy a pool."""
    __tablename__ = "reinsurance_offers"
    
    id = Column(Integer, primary_key=True, index=True)
    pool_id = Column(Integer, ForeignKey("reinsurance_pools.id"), nullable=False)
    reinsurer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    status = Column(Enum(ReinsuranceOfferStatus, native_enum=False), default=ReinsuranceOfferStatus.PENDING)
    
    # Offer terms
    offered_price = Column(Float, nullable=False)
    offered_cession_pct = Column(Float, nullable=True)  # Can propose different cession
    notes = Column(Text, nullable=True)
    
    # Response
    response_notes = Column(Text, nullable=True)
    responded_at = Column(DateTime, nullable=True)
    
    # Relationships
    pool = relationship("ReinsurancePool", back_populates="offers")
    reinsurer = relationship("User", foreign_keys=[reinsurer_id])
