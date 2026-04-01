from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class MonthlyCashflowBase(BaseModel):
    month: int = Field(..., ge=1, le=12)
    year: int = Field(..., ge=2020, le=2100)
    revenue: float = Field(..., ge=0)
    ebitda: float
    debt_service: Optional[float] = Field(default=0)


class MonthlyCashflowCreate(MonthlyCashflowBase):
    pass


class MonthlyCashflowResponse(MonthlyCashflowBase):
    id: int
    deal_id: int
    post_debt_fcf: Optional[float]
    created_at: datetime
    
    class Config:
        from_attributes = True


class FeeLedgerResponse(BaseModel):
    id: int
    deal_id: int
    month: int
    year: int
    post_debt_fcf: float
    fee_rate: float
    calculated_fee: float
    created_at: datetime
    
    class Config:
        from_attributes = True


class FeeLedgerSummary(BaseModel):
    deal_id: int
    total_fees: float
    entries: List[FeeLedgerResponse]


class BulkCashflowCreate(BaseModel):
    cashflows: List[MonthlyCashflowCreate]
