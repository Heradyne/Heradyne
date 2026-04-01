from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User, UserRole
from app.models.deal import Deal, DealMatch
from app.models.executed_loan import ExecutedLoan
from app.models.default_protection import (
    BorrowerProtection, ProtectionPayment, ProtectionEvent,
    ProtectionTier, DefaultProtectionStatus
)
from app.services.audit import audit_service

router = APIRouter()


# Schemas
class AssetDetail(BaseModel):
    type: str
    description: Optional[str] = None
    estimated_value: float


class TierStatus(BaseModel):
    tier: str
    name: str
    description: str
    coverage: float
    used: float
    remaining: float
    percentage_used: float
    is_active: bool
    triggered_at: Optional[datetime] = None
    assets: List[AssetDetail] = []  # Detailed asset breakdown


class ProtectionSummary(BaseModel):
    id: Optional[int] = None  # None for preview
    loan_id: Optional[int] = None
    deal_id: int
    deal_name: str
    loan_number: Optional[str] = None
    status: str
    current_tier: str
    health_score: int
    is_preview: bool = False  # True if loan not yet funded
    
    # Loan info
    original_loan_amount: float
    outstanding_balance: float
    guarantee_percentage: float
    guaranteed_amount: float
    
    # Tier summaries
    tier_1: TierStatus
    tier_2: TierStatus
    tier_3: TierStatus
    
    # Totals
    total_protection: float
    total_used: float
    total_remaining: float
    
    # Payment status
    months_current: int
    months_delinquent: int
    total_missed_payments: float
    last_payment_date: Optional[datetime] = None
    
    # Tier 2 enrollment
    tier_2_enrolled: bool
    tier_2_monthly_fee: float
    
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class EnrollTier2Request(BaseModel):
    monthly_fee: float  # Amount borrower wants to pay monthly


class Tier2PaymentRequest(BaseModel):
    amount: float
    payment_method: Optional[str] = "card"


class ProtectionEventResponse(BaseModel):
    id: int
    event_type: str
    previous_status: Optional[str]
    new_status: Optional[str]
    previous_tier: Optional[str]
    new_tier: Optional[str]
    amount_involved: Optional[float]
    description: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class SimulateDefaultRequest(BaseModel):
    missed_amount: float  # Amount of default to simulate


# Helper functions
def extract_assets_value(assets_json) -> tuple[float, List[AssetDetail]]:
    """Extract total value and details from assets JSON."""
    total = 0.0
    details = []
    
    if not assets_json:
        return total, details
    
    for asset in assets_json:
        # Handle different possible field names
        value = asset.get('estimated_value') or asset.get('value') or asset.get('amount') or 0
        asset_type = asset.get('type') or asset.get('asset_type') or 'Other'
        description = asset.get('description') or asset.get('name') or ''
        
        try:
            value = float(value)
        except (ValueError, TypeError):
            value = 0
            
        total += value
        details.append(AssetDetail(
            type=asset_type,
            description=description,
            estimated_value=value
        ))
    
    return total, details


def calculate_tier_2_fee(loan_amount: float, outstanding_balance: float) -> float:
    """Calculate suggested Tier 2 monthly fee based on loan amount."""
    # Base fee is 0.5% of outstanding balance per month, min $50, max $500
    suggested_fee = outstanding_balance * 0.005
    return max(50, min(500, suggested_fee))


def build_protection_summary(
    protection: Optional[BorrowerProtection], 
    deal: Deal, 
    loan: Optional[ExecutedLoan] = None,
    is_preview: bool = False
) -> ProtectionSummary:
    """Build a complete protection summary response."""
    
    # Extract asset details
    business_value, business_assets = extract_assets_value(deal.business_assets)
    personal_value, personal_assets = extract_assets_value(deal.personal_assets)
    
    if protection:
        # Real protection record exists
        tier_1_coverage = protection.tier_1_coverage
        tier_1_used = protection.tier_1_used
        tier_2_coverage = protection.tier_2_coverage
        tier_2_used = protection.tier_2_used
        tier_2_enrolled = protection.tier_2_enrolled
        tier_2_monthly_fee = protection.tier_2_monthly_fee
        tier_3_seized = protection.tier_3_seized
        
        original_loan = protection.original_loan_amount
        outstanding = protection.outstanding_balance
        
        # Get guarantee from protection record, or from loan if available
        # Protection stores as percentage (50), loan stores as decimal (0.50)
        if protection.guarantee_percentage and protection.guarantee_percentage > 0:
            guarantee_pct = protection.guarantee_percentage
            guaranteed_amt = protection.guaranteed_amount
        elif loan and loan.guarantee_percentage:
            # Loan stores as decimal, convert to percentage
            guarantee_pct = loan.guarantee_percentage * 100 if loan.guarantee_percentage < 1 else loan.guarantee_percentage
            guaranteed_amt = original_loan * (guarantee_pct / 100)
        else:
            guarantee_pct = 0
            guaranteed_amt = 0
        
        current_status = protection.status.value
        current_tier = protection.current_tier.value
        
        tier_1_triggered = protection.tier_1_triggered_at
        tier_2_triggered = protection.tier_2_triggered_at
        tier_3_triggered = protection.tier_3_triggered_at
        
        months_current = protection.months_current
        months_delinquent = protection.months_delinquent
        total_missed = protection.total_missed_payments
        last_payment = protection.last_payment_date
    else:
        # Preview mode - use deal data
        tier_1_coverage = business_value  # Premiums start at 0
        tier_1_used = 0
        tier_2_coverage = 0
        tier_2_used = 0
        tier_2_enrolled = False
        tier_2_monthly_fee = 0
        tier_3_seized = 0
        
        original_loan = deal.loan_amount_requested or 0
        outstanding = original_loan
        
        # Estimate guarantee from matched insurer if available
        insurer_match = None
        for match in deal.matches:
            if match.insurer_policy_id and match.status in ['accepted', 'counter_accepted']:
                insurer_match = match
                break
        
        if insurer_match and insurer_match.insurer_policy:
            guarantee_pct = insurer_match.insurer_policy.max_attachment_point or 50
        else:
            guarantee_pct = 50  # Default estimate
        guaranteed_amt = original_loan * (guarantee_pct / 100)
        
        current_status = "preview"
        current_tier = "tier_1"
        
        tier_1_triggered = None
        tier_2_triggered = None
        tier_3_triggered = None
        
        months_current = 0
        months_delinquent = 0
        total_missed = 0
        last_payment = None
    
    # Calculate tier statuses
    tier_1_remaining = max(0, tier_1_coverage - tier_1_used)
    tier_1_pct = (tier_1_used / tier_1_coverage * 100) if tier_1_coverage > 0 else 0
    
    tier_2_remaining = max(0, tier_2_coverage - tier_2_used) if tier_2_enrolled else 0
    tier_2_pct = (tier_2_used / tier_2_coverage * 100) if tier_2_coverage > 0 else 0
    
    tier_3_remaining = max(0, personal_value - tier_3_seized)
    tier_3_pct = (tier_3_seized / personal_value * 100) if personal_value > 0 else 0
    
    total_protection = tier_1_coverage + tier_2_coverage + personal_value
    total_used = tier_1_used + tier_2_used + tier_3_seized
    
    # Determine which tiers are active
    tier_1_active = current_tier == "tier_1"
    tier_2_active = current_tier == "tier_2" and tier_2_enrolled
    tier_3_active = current_tier == "tier_3"
    
    # Calculate health score
    if current_status == "defaulted":
        health_score = 0
    elif current_status == "tier_3_triggered":
        health_score = 10
    elif current_status == "tier_2_triggered":
        health_score = 30
    elif current_status == "tier_1_triggered":
        health_score = 50
    elif current_status == "warning":
        health_score = 70
    else:
        # Active or preview - score based on coverage ratio
        if outstanding > 0:
            coverage_ratio = total_protection / outstanding
            health_score = min(100, int(70 + (coverage_ratio * 30)))
        else:
            health_score = 100
    
    return ProtectionSummary(
        id=protection.id if protection else None,
        loan_id=protection.loan_id if protection else (loan.id if loan else None),
        deal_id=deal.id,
        deal_name=deal.name,
        loan_number=loan.loan_number if loan else None,
        status=current_status,
        current_tier=current_tier,
        health_score=health_score,
        is_preview=is_preview,
        original_loan_amount=original_loan,
        outstanding_balance=outstanding,
        guarantee_percentage=guarantee_pct,
        guaranteed_amount=guaranteed_amt,
        tier_1=TierStatus(
            tier="tier_1",
            name="Business Protection",
            description="Business assets pledged as collateral",
            coverage=tier_1_coverage,
            used=tier_1_used,
            remaining=tier_1_remaining,
            percentage_used=tier_1_pct,
            is_active=tier_1_active,
            triggered_at=tier_1_triggered,
            assets=business_assets
        ),
        tier_2=TierStatus(
            tier="tier_2",
            name="Personal Protection",
            description="Monthly fee protects personal assets",
            coverage=tier_2_coverage,
            used=tier_2_used,
            remaining=tier_2_remaining,
            percentage_used=tier_2_pct,
            is_active=tier_2_active,
            triggered_at=tier_2_triggered,
            assets=[]
        ),
        tier_3=TierStatus(
            tier="tier_3",
            name="Personal Assets at Risk",
            description="Personal assets that could be seized if other tiers exhausted",
            coverage=personal_value,
            used=tier_3_seized,
            remaining=tier_3_remaining,
            percentage_used=tier_3_pct,
            is_active=tier_3_active,
            triggered_at=tier_3_triggered,
            assets=personal_assets
        ),
        total_protection=total_protection,
        total_used=total_used,
        total_remaining=total_protection - total_used,
        months_current=months_current,
        months_delinquent=months_delinquent,
        total_missed_payments=total_missed,
        last_payment_date=last_payment,
        tier_2_enrolled=tier_2_enrolled,
        tier_2_monthly_fee=tier_2_monthly_fee,
        created_at=protection.created_at if protection else None,
        updated_at=protection.updated_at if protection else None
    )


# Endpoints

@router.get("/my-protections", response_model=List[ProtectionSummary])
def get_my_protections(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all protection records for the current borrower, including previews for unfunded deals."""
    if current_user.role != UserRole.BORROWER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only borrowers can view their protections"
        )
    
    result = []
    
    # Get existing protections for funded loans
    protections = db.query(BorrowerProtection).filter(
        BorrowerProtection.borrower_id == current_user.id
    ).all()
    
    funded_deal_ids = set()
    for protection in protections:
        deal = db.query(Deal).filter(Deal.id == protection.deal_id).first()
        loan = db.query(ExecutedLoan).filter(ExecutedLoan.id == protection.loan_id).first()
        if deal and loan:
            result.append(build_protection_summary(protection, deal, loan, is_preview=False))
            funded_deal_ids.add(deal.id)
    
    # Get deals that have been submitted/matched but not yet funded (for preview)
    preview_deals = db.query(Deal).filter(
        Deal.borrower_id == current_user.id,
        Deal.id.notin_(funded_deal_ids) if funded_deal_ids else True,
        Deal.status.in_(['submitted', 'analyzing', 'analyzed', 'matched', 'pending_lender', 'pending_insurer', 'approved'])
    ).all()
    
    for deal in preview_deals:
        # Only show preview if they have some assets entered
        has_assets = (deal.business_assets and len(deal.business_assets) > 0) or \
                     (deal.personal_assets and len(deal.personal_assets) > 0)
        if has_assets:
            result.append(build_protection_summary(None, deal, None, is_preview=True))
    
    return result


@router.get("/deal/{deal_id}/preview", response_model=ProtectionSummary)
def get_deal_protection_preview(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get protection preview for a specific deal (before loan funding)."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    
    if current_user.role != UserRole.ADMIN and deal.borrower_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    # Check if there's already a real protection
    existing = db.query(BorrowerProtection).filter(BorrowerProtection.deal_id == deal_id).first()
    if existing:
        loan = db.query(ExecutedLoan).filter(ExecutedLoan.id == existing.loan_id).first()
        return build_protection_summary(existing, deal, loan, is_preview=False)
    
    return build_protection_summary(None, deal, None, is_preview=True)


@router.get("/{protection_id}", response_model=ProtectionSummary)
def get_protection(
    protection_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get a specific protection record."""
    protection = db.query(BorrowerProtection).filter(
        BorrowerProtection.id == protection_id
    ).first()
    
    if not protection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Protection not found"
        )
    
    # Only borrower or admin can view
    if current_user.role != UserRole.ADMIN and protection.borrower_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this protection"
        )
    
    deal = db.query(Deal).filter(Deal.id == protection.deal_id).first()
    loan = db.query(ExecutedLoan).filter(ExecutedLoan.id == protection.loan_id).first()
    
    return build_protection_summary(protection, deal, loan)


@router.get("/{protection_id}/events", response_model=List[ProtectionEventResponse])
def get_protection_events(
    protection_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get event history for a protection record."""
    protection = db.query(BorrowerProtection).filter(
        BorrowerProtection.id == protection_id
    ).first()
    
    if not protection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Protection not found"
        )
    
    if current_user.role != UserRole.ADMIN and protection.borrower_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this protection"
        )
    
    events = db.query(ProtectionEvent).filter(
        ProtectionEvent.protection_id == protection_id
    ).order_by(ProtectionEvent.created_at.desc()).all()
    
    return events


@router.post("/{protection_id}/enroll-tier-2", response_model=ProtectionSummary)
def enroll_tier_2(
    protection_id: int,
    request: EnrollTier2Request,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Enroll in Tier 2 personal protection."""
    protection = db.query(BorrowerProtection).filter(
        BorrowerProtection.id == protection_id
    ).first()
    
    if not protection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Protection not found"
        )
    
    if protection.borrower_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only enroll in your own protection"
        )
    
    if protection.tier_2_enrolled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Already enrolled in Tier 2 protection"
        )
    
    # Validate monthly fee (min $50)
    if request.monthly_fee < 50:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Minimum monthly fee is $50"
        )
    
    # Enroll in Tier 2
    protection.tier_2_enrolled = True
    protection.tier_2_monthly_fee = request.monthly_fee
    protection.tier_2_start_date = datetime.utcnow()
    
    db.commit()
    db.refresh(protection)
    
    # Log event
    event = ProtectionEvent(
        protection_id=protection.id,
        event_type="tier_2_enrolled",
        description=f"Enrolled in Tier 2 protection with ${request.monthly_fee}/month fee"
    )
    db.add(event)
    db.commit()
    
    deal = db.query(Deal).filter(Deal.id == protection.deal_id).first()
    loan = db.query(ExecutedLoan).filter(ExecutedLoan.id == protection.loan_id).first()
    
    return build_protection_summary(protection, deal, loan)


@router.post("/{protection_id}/tier-2-payment", response_model=ProtectionSummary)
def make_tier_2_payment(
    protection_id: int,
    request: Tier2PaymentRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Make a Tier 2 protection payment."""
    protection = db.query(BorrowerProtection).filter(
        BorrowerProtection.id == protection_id
    ).first()
    
    if not protection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Protection not found"
        )
    
    if protection.borrower_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only pay for your own protection"
        )
    
    if not protection.tier_2_enrolled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Not enrolled in Tier 2 protection"
        )
    
    # Calculate coverage added (amount * multiplier)
    coverage_added = request.amount * protection.tier_2_coverage_multiplier
    
    # Create payment record
    payment = ProtectionPayment(
        protection_id=protection.id,
        borrower_id=current_user.id,
        amount=request.amount,
        payment_date=datetime.utcnow(),
        payment_method=request.payment_method,
        coverage_added=coverage_added,
        status="completed"
    )
    db.add(payment)
    
    # Update protection
    protection.tier_2_total_paid += request.amount
    protection.tier_2_coverage += coverage_added
    
    db.commit()
    db.refresh(protection)
    
    # Log event
    event = ProtectionEvent(
        protection_id=protection.id,
        event_type="tier_2_payment",
        amount_involved=request.amount,
        description=f"Tier 2 payment of ${request.amount} adds ${coverage_added} coverage"
    )
    db.add(event)
    db.commit()
    
    deal = db.query(Deal).filter(Deal.id == protection.deal_id).first()
    loan = db.query(ExecutedLoan).filter(ExecutedLoan.id == protection.loan_id).first()
    
    return build_protection_summary(protection, deal, loan)


@router.post("/{protection_id}/add-premium", response_model=ProtectionSummary)
def add_premium_payment(
    protection_id: int,
    amount: float,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Record a premium payment (increases Tier 1 coverage). Admin/system use."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can record premium payments"
        )
    
    protection = db.query(BorrowerProtection).filter(
        BorrowerProtection.id == protection_id
    ).first()
    
    if not protection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Protection not found"
        )
    
    # Add premium to Tier 1
    protection.total_premiums_paid += amount
    protection.tier_1_coverage = protection.total_premiums_paid + protection.business_assets_value
    
    db.commit()
    db.refresh(protection)
    
    # Log event
    event = ProtectionEvent(
        protection_id=protection.id,
        event_type="premium_paid",
        amount_involved=amount,
        description=f"Premium payment of ${amount} added to Tier 1 coverage"
    )
    db.add(event)
    db.commit()
    
    deal = db.query(Deal).filter(Deal.id == protection.deal_id).first()
    loan = db.query(ExecutedLoan).filter(ExecutedLoan.id == protection.loan_id).first()
    
    return build_protection_summary(protection, deal, loan)


@router.post("/{protection_id}/simulate-default", response_model=ProtectionSummary)
def simulate_default(
    protection_id: int,
    request: SimulateDefaultRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Simulate a default scenario to see tier progression. Admin only."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can simulate defaults"
        )
    
    protection = db.query(BorrowerProtection).filter(
        BorrowerProtection.id == protection_id
    ).first()
    
    if not protection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Protection not found"
        )
    
    remaining_default = request.missed_amount
    old_status = protection.status
    old_tier = protection.current_tier
    
    # Process through tiers
    # Tier 1: Business protection
    if remaining_default > 0 and protection.tier_1_coverage > protection.tier_1_used:
        tier_1_available = protection.tier_1_coverage - protection.tier_1_used
        tier_1_use = min(tier_1_available, remaining_default)
        protection.tier_1_used += tier_1_use
        remaining_default -= tier_1_use
        
        if protection.status == DefaultProtectionStatus.ACTIVE:
            protection.status = DefaultProtectionStatus.TIER_1_TRIGGERED
            protection.tier_1_triggered_at = datetime.utcnow()
            protection.current_tier = ProtectionTier.TIER_1
    
    # Tier 2: Personal protection (if enrolled)
    if remaining_default > 0 and protection.tier_2_enrolled and protection.tier_2_coverage > protection.tier_2_used:
        tier_2_available = protection.tier_2_coverage - protection.tier_2_used
        tier_2_use = min(tier_2_available, remaining_default)
        protection.tier_2_used += tier_2_use
        remaining_default -= tier_2_use
        
        if protection.status in [DefaultProtectionStatus.ACTIVE, DefaultProtectionStatus.TIER_1_TRIGGERED]:
            protection.status = DefaultProtectionStatus.TIER_2_TRIGGERED
            protection.tier_2_triggered_at = datetime.utcnow()
            protection.current_tier = ProtectionTier.TIER_2
    
    # Tier 3: Personal assets
    if remaining_default > 0 and protection.personal_assets_value > protection.tier_3_seized:
        tier_3_available = protection.personal_assets_value - protection.tier_3_seized
        tier_3_use = min(tier_3_available, remaining_default)
        protection.tier_3_seized += tier_3_use
        protection.tier_3_exposure = tier_3_use
        remaining_default -= tier_3_use
        
        protection.status = DefaultProtectionStatus.TIER_3_TRIGGERED
        protection.tier_3_triggered_at = datetime.utcnow()
        protection.current_tier = ProtectionTier.TIER_3
    
    # If still remaining, full default
    if remaining_default > 0:
        protection.status = DefaultProtectionStatus.DEFAULTED
    
    protection.total_missed_payments += request.missed_amount
    protection.months_delinquent += 1
    
    db.commit()
    db.refresh(protection)
    
    # Log event
    event = ProtectionEvent(
        protection_id=protection.id,
        event_type="default_simulated",
        previous_status=old_status.value,
        new_status=protection.status.value,
        previous_tier=old_tier.value,
        new_tier=protection.current_tier.value,
        amount_involved=request.missed_amount,
        description=f"Simulated default of ${request.missed_amount}"
    )
    db.add(event)
    db.commit()
    
    deal = db.query(Deal).filter(Deal.id == protection.deal_id).first()
    loan = db.query(ExecutedLoan).filter(ExecutedLoan.id == protection.loan_id).first()
    
    return build_protection_summary(protection, deal, loan)


@router.get("/suggested-tier-2-fee/{loan_id}")
def get_suggested_tier_2_fee(
    loan_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get suggested Tier 2 monthly fee for a loan."""
    loan = db.query(ExecutedLoan).filter(ExecutedLoan.id == loan_id).first()
    if not loan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Loan not found"
        )
    
    suggested_fee = calculate_tier_2_fee(loan.principal_amount, loan.principal_amount)
    
    return {
        "loan_id": loan_id,
        "loan_amount": loan.principal_amount,
        "suggested_monthly_fee": round(suggested_fee, 2),
        "minimum_fee": 50.0,
        "coverage_multiplier": 2.0,
        "description": "Each dollar paid provides $2 of personal asset protection"
    }
