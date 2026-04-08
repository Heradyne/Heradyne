from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, model_validator


class LenderPolicyBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    is_active: bool = True
    
    min_loan_size: Optional[float] = Field(None, ge=0)
    max_loan_size: Optional[float] = Field(None, ge=0)
    
    min_dscr: Optional[float] = Field(None, ge=0)
    max_pd: Optional[float] = Field(None, ge=0, le=1)
    max_leverage: Optional[float] = Field(None, ge=0)
    min_collateral_coverage: Optional[float] = Field(None, ge=0)
    
    allowed_industries: Optional[List[str]] = None
    excluded_industries: Optional[List[str]] = None
    
    min_term_months: Optional[int] = Field(None, ge=1)
    max_term_months: Optional[int] = Field(None, ge=1)
    
    target_rate_min: Optional[float] = Field(None, ge=0)
    target_rate_max: Optional[float] = Field(None, ge=0)
    
    allowed_deal_types: Optional[List[str]] = None
    
    # Auto-decision thresholds (0-100 percentage)
    auto_accept_threshold: Optional[float] = Field(None, ge=0, le=100)
    auto_reject_threshold: Optional[float] = Field(None, ge=0, le=100)
    counter_offer_min: Optional[float] = Field(None, ge=0, le=100)
    counter_offer_max: Optional[float] = Field(None, ge=0, le=100)
    auto_decision_enabled: bool = False
    
    notes: Optional[str] = Field(None, max_length=5000)
    
    @model_validator(mode='after')
    def validate_thresholds(self):
        if self.auto_decision_enabled:
            # Validate threshold ordering: reject < counter_min < counter_max < accept
            if self.auto_reject_threshold and self.counter_offer_min:
                if self.auto_reject_threshold >= self.counter_offer_min:
                    raise ValueError('auto_reject_threshold must be less than counter_offer_min')
            if self.counter_offer_min and self.counter_offer_max:
                if self.counter_offer_min >= self.counter_offer_max:
                    raise ValueError('counter_offer_min must be less than counter_offer_max')
            if self.counter_offer_max and self.auto_accept_threshold:
                if self.counter_offer_max >= self.auto_accept_threshold:
                    raise ValueError('counter_offer_max must be less than auto_accept_threshold')
        return self


class LenderPolicyCreate(LenderPolicyBase):
    pass


class LenderPolicyUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    is_active: Optional[bool] = None
    
    min_loan_size: Optional[float] = Field(None, ge=0)
    max_loan_size: Optional[float] = Field(None, ge=0)
    
    min_dscr: Optional[float] = Field(None, ge=0)
    max_pd: Optional[float] = Field(None, ge=0, le=1)
    max_leverage: Optional[float] = Field(None, ge=0)
    min_collateral_coverage: Optional[float] = Field(None, ge=0)
    
    allowed_industries: Optional[List[str]] = None
    excluded_industries: Optional[List[str]] = None
    
    min_term_months: Optional[int] = Field(None, ge=1)
    max_term_months: Optional[int] = Field(None, ge=1)
    
    target_rate_min: Optional[float] = Field(None, ge=0)
    target_rate_max: Optional[float] = Field(None, ge=0)
    
    allowed_deal_types: Optional[List[str]] = None
    
    # Auto-decision thresholds
    auto_accept_threshold: Optional[float] = Field(None, ge=0, le=100)
    auto_reject_threshold: Optional[float] = Field(None, ge=0, le=100)
    counter_offer_min: Optional[float] = Field(None, ge=0, le=100)
    counter_offer_max: Optional[float] = Field(None, ge=0, le=100)
    auto_decision_enabled: Optional[bool] = None
    
    notes: Optional[str] = Field(None, max_length=5000)


class LenderPolicyResponse(LenderPolicyBase):
    id: int
    lender_id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class InsurerPolicyBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    is_active: bool = True
    
    max_expected_loss: Optional[float] = Field(None, ge=0, le=1)
    min_attachment_point: Optional[float] = Field(None, ge=0, le=1)
    max_attachment_point: Optional[float] = Field(None, ge=0, le=1)
    
    target_premium_min: Optional[float] = Field(None, ge=0)
    target_premium_max: Optional[float] = Field(None, ge=0)
    
    min_coverage_amount: Optional[float] = Field(None, ge=0)
    max_coverage_amount: Optional[float] = Field(None, ge=0)
    
    allowed_industries: Optional[List[str]] = None
    excluded_industries: Optional[List[str]] = None
    
    allowed_deal_types: Optional[List[str]] = None
    
    # Auto-decision thresholds (0-100 percentage)
    auto_accept_threshold: Optional[float] = Field(None, ge=0, le=100)
    auto_reject_threshold: Optional[float] = Field(None, ge=0, le=100)
    counter_offer_min: Optional[float] = Field(None, ge=0, le=100)
    counter_offer_max: Optional[float] = Field(None, ge=0, le=100)
    auto_decision_enabled: bool = False
    
    notes: Optional[str] = Field(None, max_length=5000)
    
    @model_validator(mode='after')
    def validate_thresholds(self):
        if self.auto_decision_enabled:
            if self.auto_reject_threshold and self.counter_offer_min:
                if self.auto_reject_threshold >= self.counter_offer_min:
                    raise ValueError('auto_reject_threshold must be less than counter_offer_min')
            if self.counter_offer_min and self.counter_offer_max:
                if self.counter_offer_min >= self.counter_offer_max:
                    raise ValueError('counter_offer_min must be less than counter_offer_max')
            if self.counter_offer_max and self.auto_accept_threshold:
                if self.counter_offer_max >= self.auto_accept_threshold:
                    raise ValueError('counter_offer_max must be less than auto_accept_threshold')
        return self


class InsurerPolicyCreate(InsurerPolicyBase):
    pass


class InsurerPolicyUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    is_active: Optional[bool] = None
    
    max_expected_loss: Optional[float] = Field(None, ge=0, le=1)
    min_attachment_point: Optional[float] = Field(None, ge=0, le=1)
    max_attachment_point: Optional[float] = Field(None, ge=0, le=1)
    
    target_premium_min: Optional[float] = Field(None, ge=0)
    target_premium_max: Optional[float] = Field(None, ge=0)
    
    min_coverage_amount: Optional[float] = Field(None, ge=0)
    max_coverage_amount: Optional[float] = Field(None, ge=0)
    
    allowed_industries: Optional[List[str]] = None
    excluded_industries: Optional[List[str]] = None
    
    allowed_deal_types: Optional[List[str]] = None
    
    # Auto-decision thresholds
    auto_accept_threshold: Optional[float] = Field(None, ge=0, le=100)
    auto_reject_threshold: Optional[float] = Field(None, ge=0, le=100)
    counter_offer_min: Optional[float] = Field(None, ge=0, le=100)
    counter_offer_max: Optional[float] = Field(None, ge=0, le=100)
    auto_decision_enabled: Optional[bool] = None
    
    notes: Optional[str] = Field(None, max_length=5000)


class InsurerPolicyResponse(InsurerPolicyBase):
    id: int
    insurer_id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
