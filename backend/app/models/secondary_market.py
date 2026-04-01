import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, Enum, DateTime, ForeignKey, Text, Date
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin


class ListingStatus(str, enum.Enum):
    ACTIVE = "active"
    PENDING = "pending"  # Has offers being reviewed
    SOLD = "sold"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class ListingType(str, enum.Enum):
    LOAN_PARTICIPATION = "loan_participation"  # Lender selling portion of loan
    WHOLE_LOAN = "whole_loan"  # Lender selling entire loan
    RISK_TRANSFER = "risk_transfer"  # Insurer selling/transferring risk


class OfferStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"
    EXPIRED = "expired"


class SecondaryListing(Base, TimestampMixin):
    """
    A listing on the secondary market for selling loan participations or transferring risk.
    """
    __tablename__ = "secondary_listings"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Seller info
    seller_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    listing_type = Column(Enum(ListingType, native_enum=False), nullable=False)
    
    # What's being sold
    loan_id = Column(Integer, ForeignKey("executed_loans.id"), nullable=True)  # For loan sales
    
    # Listing details
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    # For loan participations
    participation_percentage = Column(Float, nullable=True)  # e.g., 0.25 for 25%
    principal_amount = Column(Float, nullable=True)  # Dollar amount being sold
    
    # For risk transfers (insurance)
    risk_percentage = Column(Float, nullable=True)  # Percentage of risk being transferred
    premium_share = Column(Float, nullable=True)  # Share of premium to transfer
    
    # Pricing
    asking_price = Column(Float, nullable=False)  # Asking price
    minimum_price = Column(Float, nullable=True)  # Minimum acceptable (hidden from buyers)
    
    # Yield/return info for buyers
    implied_yield = Column(Float, nullable=True)  # Expected yield for buyer
    remaining_term_months = Column(Integer, nullable=True)
    
    # Status
    status = Column(Enum(ListingStatus, native_enum=False), default=ListingStatus.ACTIVE)
    
    # Dates
    listed_date = Column(DateTime, default=datetime.utcnow)
    expiry_date = Column(Date, nullable=True)
    sold_date = Column(DateTime, nullable=True)
    
    # Sale info (filled when sold)
    buyer_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    final_price = Column(Float, nullable=True)
    
    # Relationships
    seller = relationship("User", foreign_keys=[seller_id])
    buyer = relationship("User", foreign_keys=[buyer_id])
    loan = relationship("ExecutedLoan")
    offers = relationship("SecondaryOffer", back_populates="listing", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<SecondaryListing {self.id}: {self.title} ({self.status.value})>"


class SecondaryOffer(Base, TimestampMixin):
    """
    An offer made on a secondary market listing.
    """
    __tablename__ = "secondary_offers"
    
    id = Column(Integer, primary_key=True, index=True)
    
    listing_id = Column(Integer, ForeignKey("secondary_listings.id"), nullable=False)
    buyer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Offer details
    offer_price = Column(Float, nullable=False)
    message = Column(Text, nullable=True)  # Optional message to seller
    
    # Status
    status = Column(Enum(OfferStatus, native_enum=False), default=OfferStatus.PENDING)
    
    # Dates
    offer_date = Column(DateTime, default=datetime.utcnow)
    expiry_date = Column(Date, nullable=True)
    response_date = Column(DateTime, nullable=True)
    
    # Seller response
    seller_message = Column(Text, nullable=True)
    
    # Relationships
    listing = relationship("SecondaryListing", back_populates="offers")
    buyer = relationship("User")
    
    def __repr__(self):
        return f"<SecondaryOffer {self.id}: ${self.offer_price} on listing {self.listing_id}>"


class ParticipationRecord(Base, TimestampMixin):
    """
    Records ownership stakes in loans after secondary market transactions.
    """
    __tablename__ = "participation_records"
    
    id = Column(Integer, primary_key=True, index=True)
    
    loan_id = Column(Integer, ForeignKey("executed_loans.id"), nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Ownership details
    ownership_percentage = Column(Float, nullable=False)  # e.g., 0.25 for 25%
    principal_owned = Column(Float, nullable=False)  # Dollar amount owned
    
    # Purchase info
    purchase_price = Column(Float, nullable=False)
    purchase_date = Column(DateTime, default=datetime.utcnow)
    source_listing_id = Column(Integer, ForeignKey("secondary_listings.id"), nullable=True)
    
    # Is this the original lender's stake?
    is_original_lender = Column(Boolean, default=False)
    
    # Status
    is_active = Column(Boolean, default=True)  # False if sold
    
    # Relationships
    loan = relationship("ExecutedLoan")
    owner = relationship("User")
    source_listing = relationship("SecondaryListing")
    
    def __repr__(self):
        return f"<ParticipationRecord {self.id}: {self.ownership_percentage*100}% of loan {self.loan_id}>"


class RiskTransferRecord(Base, TimestampMixin):
    """
    Records risk/insurance transfers after secondary market transactions.
    """
    __tablename__ = "risk_transfer_records"
    
    id = Column(Integer, primary_key=True, index=True)
    
    loan_id = Column(Integer, ForeignKey("executed_loans.id"), nullable=False)
    insurer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Risk details
    risk_percentage = Column(Float, nullable=False)  # Percentage of guarantee held
    premium_share = Column(Float, nullable=False)  # Share of premium received
    
    # Purchase info
    transfer_price = Column(Float, nullable=False)  # Price paid for risk transfer
    transfer_date = Column(DateTime, default=datetime.utcnow)
    source_listing_id = Column(Integer, ForeignKey("secondary_listings.id"), nullable=True)
    
    # Is this the original insurer's stake?
    is_original_insurer = Column(Boolean, default=False)
    
    # Status
    is_active = Column(Boolean, default=True)
    
    # Relationships
    loan = relationship("ExecutedLoan")
    insurer = relationship("User")
    source_listing = relationship("SecondaryListing")
    
    def __repr__(self):
        return f"<RiskTransferRecord {self.id}: {self.risk_percentage*100}% risk on loan {self.loan_id}>"
