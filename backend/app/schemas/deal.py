from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, Field

from app.models.deal import DealType, DealStatus


class AddbackItem(BaseModel):
    description: str
    amount: float


class AssetItem(BaseModel):
    type: str
    value: float
    description: Optional[str] = None


class DealBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    deal_type: DealType
    industry: str = Field(..., min_length=1, max_length=100)
    business_description: Optional[str] = None
    
    loan_amount_requested: float = Field(..., gt=0)
    loan_term_months: int = Field(default=84, ge=12, le=180)
    
    annual_revenue: float = Field(..., gt=0)
    gross_profit: Optional[float] = None
    ebitda: float = Field(...)
    capex: Optional[float] = Field(default=0)
    debt_service: Optional[float] = Field(default=0)
    
    addbacks: Optional[List[AddbackItem]] = None
    
    purchase_price: Optional[float] = None
    equity_injection: Optional[float] = None
    
    business_assets: Optional[List[AssetItem]] = None
    personal_assets: Optional[List[AssetItem]] = None
    
    owner_credit_score: Optional[int] = Field(None, ge=300, le=850)
    owner_experience_years: Optional[int] = Field(None, ge=0)


class DealCreate(DealBase):
    pass


class DealUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    deal_type: Optional[DealType] = None
    industry: Optional[str] = Field(None, max_length=100)
    business_description: Optional[str] = None
    
    loan_amount_requested: Optional[float] = Field(None, gt=0)
    loan_term_months: Optional[int] = Field(None, ge=12, le=180)
    
    annual_revenue: Optional[float] = Field(None, gt=0)
    gross_profit: Optional[float] = None
    ebitda: Optional[float] = None
    capex: Optional[float] = None
    debt_service: Optional[float] = None
    
    addbacks: Optional[List[AddbackItem]] = None
    
    purchase_price: Optional[float] = None
    equity_injection: Optional[float] = None
    
    business_assets: Optional[List[AssetItem]] = None
    personal_assets: Optional[List[AssetItem]] = None
    
    owner_credit_score: Optional[int] = Field(None, ge=300, le=850)
    owner_experience_years: Optional[int] = Field(None, ge=0)


class DealResponse(DealBase):
    id: int
    borrower_id: int
    status: DealStatus
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class DealListResponse(BaseModel):
    id: int
    name: str
    deal_type: DealType
    status: DealStatus
    industry: str
    loan_amount_requested: float
    annual_revenue: float
    ebitda: float
    created_at: datetime
    
    class Config:
        from_attributes = True


class DealDocumentResponse(BaseModel):
    id: int
    filename: str
    original_filename: str
    file_size: int
    mime_type: Optional[str]
    document_type: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True


class DealRiskReportResponse(BaseModel):
    id: int
    deal_id: int
    version: int
    
    normalized_ebitda: Optional[float]
    post_debt_fcf: Optional[float]
    dscr_base: Optional[float]
    dscr_stress: Optional[float]
    
    sba_anchor_pd: Optional[float]
    industry_multiplier: Optional[float]
    leverage_multiplier: Optional[float]
    volatility_multiplier: Optional[float]
    annual_pd: Optional[float]
    
    ev_low: Optional[float]
    ev_mid: Optional[float]
    ev_high: Optional[float]
    durability_score: Optional[float]
    
    business_nolv: Optional[float]
    personal_nolv: Optional[float]
    total_nolv: Optional[float]
    collateral_coverage: Optional[float]
    
    recommended_guarantee_pct: Optional[float]
    recommended_escrow_pct: Optional[float]
    recommended_alignment: Optional[Any]
    
    report_data: Optional[Any]
    
    created_at: datetime
    
    class Config:
        from_attributes = True


class DealSubmitResponse(BaseModel):
    deal_id: int
    status: DealStatus
    message: str


class DealDetailResponse(DealResponse):
    documents: List[DealDocumentResponse] = []
    risk_reports: List[DealRiskReportResponse] = []
    
    class Config:
        from_attributes = True
