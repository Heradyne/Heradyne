from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel, Field


# Listing Schemas
class SecondaryListingCreate(BaseModel):
    listing_type: str  # loan_participation, whole_loan, risk_transfer
    loan_id: int
    title: str
    description: Optional[str] = None
    participation_percentage: Optional[float] = None
    principal_amount: Optional[float] = None
    risk_percentage: Optional[float] = None
    premium_share: Optional[float] = None
    asking_price: float
    minimum_price: Optional[float] = None
    implied_yield: Optional[float] = None
    remaining_term_months: Optional[int] = None
    expiry_date: Optional[date] = None


class SecondaryListingUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    asking_price: Optional[float] = None
    minimum_price: Optional[float] = None
    status: Optional[str] = None
    expiry_date: Optional[date] = None


class SecondaryListingResponse(BaseModel):
    id: int
    seller_id: int
    listing_type: str
    loan_id: Optional[int]
    title: str
    description: Optional[str]
    participation_percentage: Optional[float]
    principal_amount: Optional[float]
    risk_percentage: Optional[float]
    premium_share: Optional[float]
    asking_price: float
    implied_yield: Optional[float]
    remaining_term_months: Optional[int]
    status: str
    listed_date: datetime
    expiry_date: Optional[date]
    sold_date: Optional[datetime]
    buyer_id: Optional[int]
    final_price: Optional[float]
    created_at: datetime
    
    # Enriched fields
    seller_name: Optional[str] = None
    buyer_name: Optional[str] = None
    loan_number: Optional[str] = None
    loan_industry: Optional[str] = None
    loan_state: Optional[str] = None
    original_principal: Optional[float] = None
    current_balance: Optional[float] = None
    interest_rate: Optional[float] = None
    offer_count: int = 0
    
    class Config:
        from_attributes = True


# Offer Schemas
class SecondaryOfferCreate(BaseModel):
    listing_id: int
    offer_price: float
    message: Optional[str] = None
    expiry_date: Optional[date] = None


class SecondaryOfferResponse(BaseModel):
    id: int
    listing_id: int
    buyer_id: int
    offer_price: float
    message: Optional[str]
    status: str
    offer_date: datetime
    expiry_date: Optional[date]
    response_date: Optional[datetime]
    seller_message: Optional[str]
    created_at: datetime
    
    # Enriched fields
    buyer_name: Optional[str] = None
    listing_title: Optional[str] = None
    
    class Config:
        from_attributes = True


class OfferResponseAction(BaseModel):
    action: str  # accept, reject
    message: Optional[str] = None


# Participation Record Schemas
class ParticipationRecordResponse(BaseModel):
    id: int
    loan_id: int
    owner_id: int
    ownership_percentage: float
    principal_owned: float
    purchase_price: float
    purchase_date: datetime
    is_original_lender: bool
    is_active: bool
    
    # Enriched fields
    owner_name: Optional[str] = None
    loan_number: Optional[str] = None
    
    class Config:
        from_attributes = True


# Risk Transfer Record Schemas
class RiskTransferRecordResponse(BaseModel):
    id: int
    loan_id: int
    insurer_id: int
    risk_percentage: float
    premium_share: float
    transfer_price: float
    transfer_date: datetime
    is_original_insurer: bool
    is_active: bool
    
    # Enriched fields
    insurer_name: Optional[str] = None
    loan_number: Optional[str] = None
    
    class Config:
        from_attributes = True


# Market Stats
class SecondaryMarketStats(BaseModel):
    # Loan participations
    total_loan_listings: int
    active_loan_listings: int
    total_loan_volume: float  # Total principal available
    avg_loan_asking_price: float
    avg_loan_yield: float
    
    # Risk transfers
    total_risk_listings: int
    active_risk_listings: int
    total_risk_volume: float
    avg_risk_asking_price: float
    
    # Recent activity
    listings_last_30_days: int
    sales_last_30_days: int
    total_sales_volume_30_days: float
