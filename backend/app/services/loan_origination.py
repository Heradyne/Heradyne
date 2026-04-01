from typing import Optional, Dict, Any
from datetime import datetime, date, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func
import uuid

from app.models.executed_loan import ExecutedLoan, LoanStatus
from app.models.deal import Deal, DealMatch, DealStatus
from app.models.policy import LenderPolicy, InsurerPolicy
from app.models.user import User, UserRole
from app.models.assumption import SystemAssumption
from app.models.default_protection import (
    BorrowerProtection, ProtectionEvent, ProtectionTier, DefaultProtectionStatus
)
from app.services.audit import audit_service


def add_months(source_date: date, months: int) -> date:
    """Add months to a date, handling month boundaries."""
    month = source_date.month - 1 + months
    year = source_date.year + month // 12
    month = month % 12 + 1
    day = min(source_date.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28,
                                 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
    return date(year, month, day)


def get_origination_setting(db: Session, key: str, default: Any = None) -> Any:
    """Get an origination setting from system assumptions."""
    assumption = db.query(SystemAssumption).filter(
        SystemAssumption.category == "origination",
        SystemAssumption.key == key,
        SystemAssumption.user_id.is_(None)  # System-wide setting
    ).first()
    return assumption.value if assumption else default


class LoanOriginationService:
    """Service for originating loans and issuing guarantee contracts."""
    
    @staticmethod
    def generate_loan_number() -> str:
        """Generate a unique loan number."""
        return f"LN-{datetime.now().strftime('%Y%m')}-{uuid.uuid4().hex[:8].upper()}"
    
    @staticmethod
    def generate_guarantee_number() -> str:
        """Generate a unique guarantee contract number."""
        return f"GC-{datetime.now().strftime('%Y%m')}-{uuid.uuid4().hex[:8].upper()}"
    
    @staticmethod
    def calculate_monthly_payment(principal: float, annual_rate: float, term_months: int) -> float:
        """Calculate monthly payment for an amortizing loan."""
        if annual_rate == 0:
            return principal / term_months
        
        monthly_rate = annual_rate / 12
        payment = principal * (monthly_rate * (1 + monthly_rate) ** term_months) / \
                  ((1 + monthly_rate) ** term_months - 1)
        return round(payment, 2)
    
    @staticmethod
    def originate_loan(
        db: Session,
        match_id: int,
        lender_id: int,
        principal_amount: float,
        interest_rate: float,
        term_months: int,
        origination_date: Optional[date] = None,
        notes: Optional[str] = None
    ) -> ExecutedLoan:
        """
        Originate a loan from an accepted match.
        
        Args:
            db: Database session
            match_id: The DealMatch ID
            lender_id: The lender originating the loan
            principal_amount: Loan principal
            interest_rate: Annual interest rate as decimal (e.g., 0.08 for 8%)
            term_months: Loan term in months
            origination_date: Date of origination (defaults to today)
            notes: Optional notes
            
        Returns:
            ExecutedLoan: The created loan
        """
        # Get the match
        match = db.query(DealMatch).filter(DealMatch.id == match_id).first()
        if not match:
            raise ValueError("Match not found")
        
        # Verify match status
        if match.status not in ['accepted', 'counter_accepted']:
            raise ValueError(f"Match must be accepted to originate loan. Current status: {match.status}")
        
        # Verify lender owns the policy
        if match.lender_policy_id:
            policy = db.query(LenderPolicy).filter(LenderPolicy.id == match.lender_policy_id).first()
            if policy.lender_id != lender_id:
                raise ValueError("Lender does not own this policy")
        else:
            raise ValueError("Match has no lender policy")
        
        # Get the deal
        deal = db.query(Deal).filter(Deal.id == match.deal_id).first()
        if not deal:
            raise ValueError("Deal not found")
        
        # Check origination settings
        require_dual_acceptance = get_origination_setting(db, "require_dual_acceptance", False)
        require_insurer = get_origination_setting(db, "require_insurer_for_origination", False)
        
        # Check for insurer acceptance if required
        if require_dual_acceptance or require_insurer:
            insurer_match = db.query(DealMatch).filter(
                DealMatch.deal_id == deal.id,
                DealMatch.insurer_policy_id.isnot(None),
                DealMatch.status.in_(['accepted', 'counter_accepted'])
            ).first()
            
            if not insurer_match:
                if require_dual_acceptance:
                    raise ValueError("Dual acceptance required: No insurer/fund has accepted this deal yet. Both lender and insurer must accept before origination.")
                elif require_insurer:
                    raise ValueError("Insurer acceptance required: An insurer/fund must accept this deal before origination.")
        
        # Check if loan already exists for this match
        existing = db.query(ExecutedLoan).filter(ExecutedLoan.match_id == match_id).first()
        if existing:
            raise ValueError(f"Loan already exists for this match: {existing.loan_number}")
        
        # Calculate dates
        orig_date = origination_date or date.today()
        maturity = add_months(orig_date, term_months)
        
        # Calculate monthly payment
        monthly_payment = LoanOriginationService.calculate_monthly_payment(
            principal_amount, interest_rate, term_months
        )
        
        # Find insurer match if any
        insurer_id = None
        guarantee_percentage = None
        premium_rate = None
        
        insurer_match = db.query(DealMatch).filter(
            DealMatch.deal_id == deal.id,
            DealMatch.insurer_policy_id.isnot(None),
            DealMatch.status.in_(['accepted', 'counter_accepted'])
        ).first()
        
        if insurer_match and insurer_match.insurer_policy:
            insurer_policy = insurer_match.insurer_policy
            insurer_id = insurer_policy.insurer_id
            # Use attachment point as guarantee percentage, and target premium as rate
            # These are approximations - actual values should be set during guarantee issuance
            guarantee_percentage = insurer_policy.max_attachment_point if insurer_policy.max_attachment_point else 0.5  # Default 50%
            premium_rate = insurer_policy.target_premium_min if insurer_policy.target_premium_min else 0.02  # Default 2%
        
        # Create the loan
        loan = ExecutedLoan(
            deal_id=deal.id,
            match_id=match_id,
            borrower_id=deal.borrower_id,
            lender_id=lender_id,
            insurer_id=insurer_id,
            loan_number=LoanOriginationService.generate_loan_number(),
            principal_amount=principal_amount,
            interest_rate=interest_rate,
            term_months=term_months,
            monthly_payment=monthly_payment,
            origination_date=orig_date,
            maturity_date=maturity,
            status=LoanStatus.ACTIVE,
            current_principal_balance=principal_amount,
            guarantee_percentage=guarantee_percentage,
            premium_rate=premium_rate,
            state=None,  # Deal doesn't have location fields
            city=None,
            zip_code=None,
            industry=deal.industry,
            notes=notes
        )
        
        db.add(loan)
        
        # Update deal status
        deal.status = DealStatus.FUNDED
        
        # Note: Participation and risk records can be created separately via secondary market
        # or added here when those tables are properly set up
        
        db.commit()
        db.refresh(loan)
        
        # Audit log
        audit_service.log(
            db=db, action="loan_originated", entity_type="executed_loan",
            entity_id=loan.id, user_id=lender_id,
            details={
                "loan_number": loan.loan_number,
                "principal": principal_amount,
                "rate": interest_rate,
                "term_months": term_months,
                "deal_id": deal.id,
                "match_id": match_id
            }
        )
        
        return loan
    
    @staticmethod
    def issue_guarantee(
        db: Session,
        match_id: int,
        insurer_id: int,
        guarantee_percentage: float,
        premium_rate: float,
        effective_date: Optional[date] = None,
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Issue a guarantee contract for an accepted match.
        
        This can be called:
        1. Before loan origination - to commit to guaranteeing a future loan
        2. After loan origination - to add a guarantee to an existing loan
        
        Args:
            db: Database session
            match_id: The DealMatch ID (insurer match)
            insurer_id: The insurer issuing the guarantee
            guarantee_percentage: Percentage of loan to guarantee (e.g., 50 for 50%)
            premium_rate: Annual premium rate as percentage (e.g., 2 for 2%)
            effective_date: When guarantee becomes effective
            notes: Optional notes
            
        Returns:
            Dict with guarantee details
        """
        # Get the match
        match = db.query(DealMatch).filter(DealMatch.id == match_id).first()
        if not match:
            raise ValueError("Match not found")
        
        # Verify match status
        if match.status not in ['accepted', 'counter_accepted']:
            raise ValueError(f"Match must be accepted to issue guarantee. Current status: {match.status}")
        
        # Verify insurer owns the policy
        if match.insurer_policy_id:
            policy = db.query(InsurerPolicy).filter(InsurerPolicy.id == match.insurer_policy_id).first()
            if policy.insurer_id != insurer_id:
                raise ValueError("Insurer does not own this policy")
        else:
            raise ValueError("Match has no insurer policy")
        
        # Get the deal
        deal = db.query(Deal).filter(Deal.id == match.deal_id).first()
        if not deal:
            raise ValueError("Deal not found")
        
        # Check if there's already a funded loan for this deal
        existing_loan = db.query(ExecutedLoan).filter(ExecutedLoan.deal_id == deal.id).first()
        
        guarantee_number = LoanOriginationService.generate_guarantee_number()
        eff_date = effective_date or date.today()
        
        result = {
            "guarantee_number": guarantee_number,
            "deal_id": deal.id,
            "match_id": match_id,
            "insurer_id": insurer_id,
            "guarantee_percentage": guarantee_percentage,
            "premium_rate": premium_rate,
            "effective_date": eff_date.isoformat(),
            "status": "active"
        }
        
        if existing_loan:
            # Update the existing loan with guarantee info
            existing_loan.insurer_id = insurer_id
            existing_loan.guarantee_percentage = guarantee_percentage / 100
            existing_loan.premium_rate = premium_rate / 100
            
            result["loan_id"] = existing_loan.id
            result["loan_number"] = existing_loan.loan_number
            result["covered_amount"] = existing_loan.principal_amount * (guarantee_percentage / 100)
            
            # Create protection record for the borrower
            existing_protection = db.query(BorrowerProtection).filter(
                BorrowerProtection.loan_id == existing_loan.id
            ).first()
            
            if not existing_protection:
                # Get business assets from deal
                business_assets = 0.0
                if deal.business_assets:
                    for asset in deal.business_assets:
                        business_assets += asset.get('estimated_value', 0)
                
                # Get personal assets from deal
                personal_assets = 0.0
                if deal.personal_assets:
                    for asset in deal.personal_assets:
                        personal_assets += asset.get('estimated_value', 0)
                
                guaranteed_amount = existing_loan.principal_amount * (guarantee_percentage / 100)
                tier_1_coverage = business_assets  # Premiums start at 0
                
                protection = BorrowerProtection(
                    borrower_id=deal.borrower_id,
                    loan_id=existing_loan.id,
                    deal_id=deal.id,
                    status=DefaultProtectionStatus.ACTIVE,
                    current_tier=ProtectionTier.TIER_1,
                    total_premiums_paid=0.0,
                    business_assets_value=business_assets,
                    tier_1_coverage=tier_1_coverage,
                    tier_1_used=0.0,
                    tier_2_enrolled=False,
                    tier_2_monthly_fee=0.0,
                    tier_2_total_paid=0.0,
                    tier_2_coverage_multiplier=2.0,
                    tier_2_coverage=0.0,
                    tier_2_used=0.0,
                    personal_assets_value=personal_assets,
                    tier_3_exposure=0.0,
                    tier_3_seized=0.0,
                    original_loan_amount=existing_loan.principal_amount,
                    outstanding_balance=existing_loan.principal_amount,
                    guarantee_percentage=guarantee_percentage,
                    guaranteed_amount=guaranteed_amount,
                    months_current=0,
                    months_delinquent=0,
                    total_missed_payments=0.0
                )
                db.add(protection)
                db.flush()  # Get the ID
                
                # Log event
                event = ProtectionEvent(
                    protection_id=protection.id,
                    event_type="protection_created",
                    new_status=protection.status.value,
                    new_tier=protection.current_tier.value,
                    description=f"Default protection created for loan {existing_loan.loan_number} with {guarantee_percentage}% guarantee"
                )
                db.add(event)
                
                result["protection_created"] = True
                result["protection_id"] = protection.id
        else:
            # No loan yet - just record the commitment
            result["loan_id"] = None
            result["loan_number"] = None
            result["covered_amount"] = deal.loan_amount_requested * (guarantee_percentage / 100) if deal.loan_amount_requested else None
            result["note"] = "Guarantee commitment recorded. Will be applied when loan is originated."
        
        db.commit()
        
        # Audit log
        audit_service.log(
            db=db, action="guarantee_issued", entity_type="guarantee_contract",
            entity_id=match_id, user_id=insurer_id,
            details={
                "guarantee_number": guarantee_number,
                "guarantee_percentage": guarantee_percentage,
                "premium_rate": premium_rate,
                "deal_id": deal.id,
                "loan_id": result.get("loan_id")
            }
        )
        
        return result
    
    @staticmethod
    def get_originatable_matches(db: Session, lender_id: int) -> list:
        """Get matches that can be originated by this lender."""
        # Get lender's policies
        policy_ids = [p.id for p in db.query(LenderPolicy).filter(
            LenderPolicy.lender_id == lender_id
        ).all()]
        
        if not policy_ids:
            return []
        
        # Get accepted matches for these policies that haven't been originated
        matches = db.query(DealMatch).filter(
            DealMatch.lender_policy_id.in_(policy_ids),
            DealMatch.status.in_(['accepted', 'counter_accepted'])
        ).all()
        
        # Filter out already originated
        result = []
        for match in matches:
            existing = db.query(ExecutedLoan).filter(ExecutedLoan.match_id == match.id).first()
            if not existing:
                result.append(match)
        
        return result
    
    @staticmethod
    def get_guaranteeable_matches(db: Session, insurer_id: int) -> list:
        """Get matches that can receive guarantees from this insurer."""
        # Get insurer's policies
        policy_ids = [p.id for p in db.query(InsurerPolicy).filter(
            InsurerPolicy.insurer_id == insurer_id
        ).all()]
        
        if not policy_ids:
            return []
        
        # Get accepted matches for these policies
        matches = db.query(DealMatch).filter(
            DealMatch.insurer_policy_id.in_(policy_ids),
            DealMatch.status.in_(['accepted', 'counter_accepted'])
        ).all()
        
        return matches


loan_origination_service = LoanOriginationService()
