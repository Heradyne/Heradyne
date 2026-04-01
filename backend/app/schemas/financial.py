from datetime import datetime, date
from typing import Any, Optional, List
from pydantic import BaseModel, Field


# Executed Loan Schemas
class ExecutedLoanCreate(BaseModel):
    deal_id: int
    match_id: Optional[int] = None
    borrower_id: int
    lender_id: int
    insurer_id: Optional[int] = None
    principal_amount: float
    interest_rate: float
    term_months: int
    monthly_payment: float
    origination_date: date
    maturity_date: date
    guarantee_percentage: Optional[float] = None
    premium_rate: Optional[float] = None
    state: Optional[str] = None
    city: Optional[str] = None
    zip_code: Optional[str] = None
    industry: str
    notes: Optional[str] = None


class ExecutedLoanUpdate(BaseModel):
    status: Optional[str] = None
    current_principal_balance: Optional[float] = None
    days_past_due: Optional[int] = None
    last_payment_date: Optional[date] = None
    default_date: Optional[date] = None
    default_amount: Optional[float] = None
    recovery_amount: Optional[float] = None
    loss_amount: Optional[float] = None
    notes: Optional[str] = None


class ExecutedLoanResponse(BaseModel):
    id: int
    deal_id: int
    match_id: Optional[int]
    borrower_id: int
    lender_id: int
    insurer_id: Optional[int]
    loan_number: str
    principal_amount: float
    interest_rate: float
    term_months: int
    monthly_payment: float
    origination_date: date
    maturity_date: date
    status: str
    current_principal_balance: float
    guarantee_percentage: Optional[float]
    premium_rate: Optional[float]
    premium_paid: float
    state: Optional[str]
    city: Optional[str]
    zip_code: Optional[str]
    industry: str
    days_past_due: int
    last_payment_date: Optional[date]
    total_payments_made: int
    total_principal_paid: float
    total_interest_paid: float
    default_date: Optional[date]
    default_amount: Optional[float]
    recovery_amount: Optional[float]
    loss_amount: Optional[float]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    
    # Computed fields for display
    borrower_name: Optional[str] = None
    lender_name: Optional[str] = None
    insurer_name: Optional[str] = None
    deal_name: Optional[str] = None
    
    class Config:
        from_attributes = True


class LoanPaymentCreate(BaseModel):
    loan_id: int
    payment_date: date
    payment_number: int
    scheduled_payment: float
    actual_payment: float
    principal_portion: float
    interest_portion: float
    principal_balance_after: float
    is_late: bool = False
    days_late: int = 0


class LoanPaymentResponse(BaseModel):
    id: int
    loan_id: int
    payment_date: date
    payment_number: int
    scheduled_payment: float
    actual_payment: float
    principal_portion: float
    interest_portion: float
    principal_balance_after: float
    is_late: bool
    days_late: int
    created_at: datetime
    
    class Config:
        from_attributes = True


# Financial Dashboard Schemas
class GeographicConcentration(BaseModel):
    state: str
    loan_count: int
    total_principal: float
    percentage: float


class IndustryConcentration(BaseModel):
    industry: str
    loan_count: int
    total_principal: float
    percentage: float


class LenderDashboardStats(BaseModel):
    # Portfolio summary
    total_loans: int
    total_principal_outstanding: float
    total_principal_originated: float
    average_interest_rate: float
    weighted_average_interest_rate: float
    average_loan_size: float
    average_term_months: float
    
    # Monthly metrics
    monthly_principal_payments: float
    monthly_interest_income: float
    monthly_total_payments: float
    
    # Performance
    active_loans: int
    paid_off_loans: int
    defaulted_loans: int
    default_rate: float  # Percentage
    
    # Risk metrics
    total_past_due: float
    loans_past_due_30: int
    loans_past_due_60: int
    loans_past_due_90: int
    
    # Concentrations
    geographic_concentration: List[GeographicConcentration]
    industry_concentration: List[IndustryConcentration]
    
    # Insurance coverage
    insured_principal: float
    uninsured_principal: float
    average_guarantee_percentage: float


class InsurerDashboardStats(BaseModel):
    # Portfolio summary
    total_policies: int
    total_insured_principal: float
    total_premium_received: float
    average_premium_rate: float
    average_guarantee_percentage: float
    
    # Monthly metrics
    monthly_premium_income: float
    
    # Risk metrics
    total_exposure: float  # Max potential payout
    current_claims: int
    total_claims_paid: float
    loss_ratio: float  # Claims paid / Premium received
    
    # Portfolio health
    active_policies: int
    policies_in_default: int
    expected_loss: float  # Based on PD calculations
    
    # Concentrations
    geographic_concentration: List[GeographicConcentration]
    industry_concentration: List[IndustryConcentration]
    
    # Lender concentration
    lender_concentration: List[dict]  # Exposure by lender


class AdminDashboardStats(BaseModel):
    # Platform totals
    total_loans: int
    total_principal_outstanding: float
    total_principal_originated: float
    
    # Lender metrics
    total_lenders: int
    active_lenders: int
    average_portfolio_size: float
    
    # Insurer metrics
    total_insurers: int
    active_insurers: int
    total_insured_amount: float
    total_premium_collected: float
    
    # Performance
    platform_default_rate: float
    total_defaults: int
    total_losses: float
    total_recoveries: float
    
    # By lender breakdown
    lender_stats: List[dict]
    
    # By insurer breakdown
    insurer_stats: List[dict]
    
    # Concentrations
    geographic_concentration: List[GeographicConcentration]
    industry_concentration: List[IndustryConcentration]


class InsuranceClaimCreate(BaseModel):
    loan_id: int
    insurer_id: int
    claim_date: date
    claim_amount: float
    notes: Optional[str] = None


class InsuranceClaimResponse(BaseModel):
    id: int
    loan_id: int
    insurer_id: int
    claim_number: str
    claim_date: date
    claim_amount: float
    approved_amount: Optional[float]
    paid_amount: Optional[float]
    status: str
    approved_date: Optional[date]
    paid_date: Optional[date]
    notes: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True
