from typing import List, Optional, Dict, Any
from datetime import datetime, date
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
import uuid

from app.models.executed_loan import ExecutedLoan, LoanStatus, LoanPayment, InsuranceClaim
from app.models.user import User, UserRole
from app.schemas.financial import (
    LenderDashboardStats, InsurerDashboardStats, AdminDashboardStats,
    GeographicConcentration, IndustryConcentration
)


class FinancialService:
    """Service for financial dashboard calculations."""
    
    @staticmethod
    def generate_loan_number() -> str:
        """Generate a unique loan number."""
        return f"LN-{datetime.now().strftime('%Y%m')}-{uuid.uuid4().hex[:8].upper()}"
    
    @staticmethod
    def generate_claim_number() -> str:
        """Generate a unique claim number."""
        return f"CLM-{datetime.now().strftime('%Y%m')}-{uuid.uuid4().hex[:8].upper()}"
    
    @staticmethod
    def get_lender_dashboard_stats(db: Session, lender_id: int) -> LenderDashboardStats:
        """Calculate dashboard statistics for a lender."""
        
        # Get all loans for this lender
        loans = db.query(ExecutedLoan).filter(ExecutedLoan.lender_id == lender_id).all()
        
        if not loans:
            return LenderDashboardStats(
                total_loans=0,
                total_principal_outstanding=0,
                total_principal_originated=0,
                average_interest_rate=0,
                weighted_average_interest_rate=0,
                average_loan_size=0,
                average_term_months=0,
                monthly_principal_payments=0,
                monthly_interest_income=0,
                monthly_total_payments=0,
                active_loans=0,
                paid_off_loans=0,
                defaulted_loans=0,
                default_rate=0,
                total_past_due=0,
                loans_past_due_30=0,
                loans_past_due_60=0,
                loans_past_due_90=0,
                geographic_concentration=[],
                industry_concentration=[],
                insured_principal=0,
                uninsured_principal=0,
                average_guarantee_percentage=0
            )
        
        # Basic counts
        total_loans = len(loans)
        active_loans = len([l for l in loans if l.status == LoanStatus.ACTIVE])
        paid_off_loans = len([l for l in loans if l.status == LoanStatus.PAID_OFF])
        defaulted_loans = len([l for l in loans if l.status in [LoanStatus.DEFAULT, LoanStatus.CHARGED_OFF]])
        
        # Principal calculations
        total_principal_originated = sum(l.principal_amount for l in loans)
        total_principal_outstanding = sum(l.current_principal_balance for l in loans if l.status == LoanStatus.ACTIVE)
        
        # Average calculations
        average_loan_size = total_principal_originated / total_loans if total_loans > 0 else 0
        average_interest_rate = sum(l.interest_rate for l in loans) / total_loans if total_loans > 0 else 0
        average_term_months = sum(l.term_months for l in loans) / total_loans if total_loans > 0 else 0
        
        # Weighted average interest rate
        if total_principal_originated > 0:
            weighted_avg_rate = sum(l.interest_rate * l.principal_amount for l in loans) / total_principal_originated
        else:
            weighted_avg_rate = 0
        
        # Monthly payments (from active loans)
        active_loan_list = [l for l in loans if l.status == LoanStatus.ACTIVE]
        monthly_total = sum(l.monthly_payment for l in active_loan_list)
        
        # Estimate principal vs interest split (simplified amortization estimate)
        monthly_interest = sum(l.current_principal_balance * (l.interest_rate / 12) for l in active_loan_list)
        monthly_principal = monthly_total - monthly_interest
        
        # Default rate
        default_rate = (defaulted_loans / total_loans * 100) if total_loans > 0 else 0
        
        # Past due calculations
        loans_past_due_30 = len([l for l in loans if l.days_past_due >= 30 and l.days_past_due < 60])
        loans_past_due_60 = len([l for l in loans if l.days_past_due >= 60 and l.days_past_due < 90])
        loans_past_due_90 = len([l for l in loans if l.days_past_due >= 90])
        total_past_due = sum(l.current_principal_balance for l in loans if l.days_past_due > 0)
        
        # Geographic concentration
        geo_data = {}
        for loan in loans:
            state = loan.state or "Unknown"
            if state not in geo_data:
                geo_data[state] = {"count": 0, "principal": 0}
            geo_data[state]["count"] += 1
            geo_data[state]["principal"] += loan.principal_amount
        
        geographic_concentration = [
            GeographicConcentration(
                state=state,
                loan_count=data["count"],
                total_principal=data["principal"],
                percentage=(data["principal"] / total_principal_originated * 100) if total_principal_originated > 0 else 0
            )
            for state, data in sorted(geo_data.items(), key=lambda x: x[1]["principal"], reverse=True)
        ]
        
        # Industry concentration
        ind_data = {}
        for loan in loans:
            industry = loan.industry or "Unknown"
            if industry not in ind_data:
                ind_data[industry] = {"count": 0, "principal": 0}
            ind_data[industry]["count"] += 1
            ind_data[industry]["principal"] += loan.principal_amount
        
        industry_concentration = [
            IndustryConcentration(
                industry=industry,
                loan_count=data["count"],
                total_principal=data["principal"],
                percentage=(data["principal"] / total_principal_originated * 100) if total_principal_originated > 0 else 0
            )
            for industry, data in sorted(ind_data.items(), key=lambda x: x[1]["principal"], reverse=True)
        ]
        
        # Insurance coverage
        insured_loans = [l for l in loans if l.insurer_id is not None]
        insured_principal = sum(l.principal_amount * (l.guarantee_percentage or 0) for l in insured_loans)
        uninsured_principal = total_principal_originated - insured_principal
        
        avg_guarantee = (sum(l.guarantee_percentage or 0 for l in insured_loans) / len(insured_loans)) if insured_loans else 0
        
        return LenderDashboardStats(
            total_loans=total_loans,
            total_principal_outstanding=total_principal_outstanding,
            total_principal_originated=total_principal_originated,
            average_interest_rate=average_interest_rate,
            weighted_average_interest_rate=weighted_avg_rate,
            average_loan_size=average_loan_size,
            average_term_months=average_term_months,
            monthly_principal_payments=monthly_principal,
            monthly_interest_income=monthly_interest,
            monthly_total_payments=monthly_total,
            active_loans=active_loans,
            paid_off_loans=paid_off_loans,
            defaulted_loans=defaulted_loans,
            default_rate=default_rate,
            total_past_due=total_past_due,
            loans_past_due_30=loans_past_due_30,
            loans_past_due_60=loans_past_due_60,
            loans_past_due_90=loans_past_due_90,
            geographic_concentration=geographic_concentration,
            industry_concentration=industry_concentration,
            insured_principal=insured_principal,
            uninsured_principal=uninsured_principal,
            average_guarantee_percentage=avg_guarantee
        )
    
    @staticmethod
    def get_insurer_dashboard_stats(db: Session, insurer_id: int) -> InsurerDashboardStats:
        """Calculate dashboard statistics for an insurer."""
        
        # Get all loans insured by this insurer
        loans = db.query(ExecutedLoan).filter(ExecutedLoan.insurer_id == insurer_id).all()
        
        # Get claims
        claims = db.query(InsuranceClaim).filter(InsuranceClaim.insurer_id == insurer_id).all()
        
        if not loans:
            return InsurerDashboardStats(
                total_policies=0,
                total_insured_principal=0,
                total_premium_received=0,
                average_premium_rate=0,
                average_guarantee_percentage=0,
                monthly_premium_income=0,
                total_exposure=0,
                current_claims=0,
                total_claims_paid=0,
                loss_ratio=0,
                active_policies=0,
                policies_in_default=0,
                expected_loss=0,
                geographic_concentration=[],
                industry_concentration=[],
                lender_concentration=[]
            )
        
        # Basic counts
        total_policies = len(loans)
        active_policies = len([l for l in loans if l.status == LoanStatus.ACTIVE])
        policies_in_default = len([l for l in loans if l.status in [LoanStatus.DEFAULT, LoanStatus.CHARGED_OFF]])
        
        # Premium calculations
        total_premium_received = sum(l.premium_paid for l in loans)
        avg_premium_rate = sum(l.premium_rate or 0 for l in loans) / total_policies if total_policies > 0 else 0
        avg_guarantee = sum(l.guarantee_percentage or 0 for l in loans) / total_policies if total_policies > 0 else 0
        
        # Exposure calculations
        total_insured_principal = sum(l.principal_amount * (l.guarantee_percentage or 0) for l in loans)
        total_exposure = sum(l.current_principal_balance * (l.guarantee_percentage or 0) for l in loans if l.status == LoanStatus.ACTIVE)
        
        # Monthly premium (annualized rate / 12 * current balance)
        monthly_premium = sum(
            l.current_principal_balance * (l.premium_rate or 0) / 12 
            for l in loans if l.status == LoanStatus.ACTIVE
        )
        
        # Claims
        current_claims = len([c for c in claims if c.status == "pending"])
        total_claims_paid = sum(c.paid_amount or 0 for c in claims)
        
        # Loss ratio
        loss_ratio = (total_claims_paid / total_premium_received * 100) if total_premium_received > 0 else 0
        
        # Expected loss (simplified - use 3% default rate * guarantee amount)
        expected_loss = total_exposure * 0.03  # Simplified calculation
        
        # Geographic concentration
        geo_data = {}
        for loan in loans:
            state = loan.state or "Unknown"
            if state not in geo_data:
                geo_data[state] = {"count": 0, "principal": 0}
            geo_data[state]["count"] += 1
            geo_data[state]["principal"] += loan.principal_amount * (loan.guarantee_percentage or 0)
        
        geographic_concentration = [
            GeographicConcentration(
                state=state,
                loan_count=data["count"],
                total_principal=data["principal"],
                percentage=(data["principal"] / total_insured_principal * 100) if total_insured_principal > 0 else 0
            )
            for state, data in sorted(geo_data.items(), key=lambda x: x[1]["principal"], reverse=True)
        ]
        
        # Industry concentration
        ind_data = {}
        for loan in loans:
            industry = loan.industry or "Unknown"
            if industry not in ind_data:
                ind_data[industry] = {"count": 0, "principal": 0}
            ind_data[industry]["count"] += 1
            ind_data[industry]["principal"] += loan.principal_amount * (loan.guarantee_percentage or 0)
        
        industry_concentration = [
            IndustryConcentration(
                industry=industry,
                loan_count=data["count"],
                total_principal=data["principal"],
                percentage=(data["principal"] / total_insured_principal * 100) if total_insured_principal > 0 else 0
            )
            for industry, data in sorted(ind_data.items(), key=lambda x: x[1]["principal"], reverse=True)
        ]
        
        # Lender concentration
        lender_data = {}
        for loan in loans:
            lender_id = loan.lender_id
            if lender_id not in lender_data:
                lender = db.query(User).filter(User.id == lender_id).first()
                lender_data[lender_id] = {
                    "lender_id": lender_id,
                    "lender_name": lender.full_name if lender else "Unknown",
                    "count": 0,
                    "exposure": 0
                }
            lender_data[lender_id]["count"] += 1
            lender_data[lender_id]["exposure"] += loan.current_principal_balance * (loan.guarantee_percentage or 0)
        
        lender_concentration = sorted(lender_data.values(), key=lambda x: x["exposure"], reverse=True)
        
        return InsurerDashboardStats(
            total_policies=total_policies,
            total_insured_principal=total_insured_principal,
            total_premium_received=total_premium_received,
            average_premium_rate=avg_premium_rate,
            average_guarantee_percentage=avg_guarantee,
            monthly_premium_income=monthly_premium,
            total_exposure=total_exposure,
            current_claims=current_claims,
            total_claims_paid=total_claims_paid,
            loss_ratio=loss_ratio,
            active_policies=active_policies,
            policies_in_default=policies_in_default,
            expected_loss=expected_loss,
            geographic_concentration=geographic_concentration,
            industry_concentration=industry_concentration,
            lender_concentration=lender_concentration
        )
    
    @staticmethod
    def get_admin_dashboard_stats(db: Session) -> AdminDashboardStats:
        """Calculate platform-wide dashboard statistics for admin."""
        
        # Get all loans
        loans = db.query(ExecutedLoan).all()
        
        # Get all lenders and insurers
        lenders = db.query(User).filter(User.role == UserRole.LENDER).all()
        insurers = db.query(User).filter(User.role == UserRole.INSURER).all()
        
        if not loans:
            return AdminDashboardStats(
                total_loans=0,
                total_principal_outstanding=0,
                total_principal_originated=0,
                total_lenders=len(lenders),
                active_lenders=0,
                average_portfolio_size=0,
                total_insurers=len(insurers),
                active_insurers=0,
                total_insured_amount=0,
                total_premium_collected=0,
                platform_default_rate=0,
                total_defaults=0,
                total_losses=0,
                total_recoveries=0,
                lender_stats=[],
                insurer_stats=[],
                geographic_concentration=[],
                industry_concentration=[]
            )
        
        # Platform totals
        total_loans = len(loans)
        total_principal_originated = sum(l.principal_amount for l in loans)
        total_principal_outstanding = sum(l.current_principal_balance for l in loans if l.status == LoanStatus.ACTIVE)
        
        # Defaults and losses
        defaulted_loans = [l for l in loans if l.status in [LoanStatus.DEFAULT, LoanStatus.CHARGED_OFF]]
        total_defaults = len(defaulted_loans)
        total_losses = sum(l.loss_amount or 0 for l in defaulted_loans)
        total_recoveries = sum(l.recovery_amount or 0 for l in defaulted_loans)
        platform_default_rate = (total_defaults / total_loans * 100) if total_loans > 0 else 0
        
        # Lender stats
        active_lender_ids = set(l.lender_id for l in loans)
        active_lenders = len(active_lender_ids)
        average_portfolio_size = total_principal_originated / active_lenders if active_lenders > 0 else 0
        
        lender_stats = []
        for lender in lenders:
            lender_loans = [l for l in loans if l.lender_id == lender.id]
            if lender_loans:
                lender_stats.append({
                    "lender_id": lender.id,
                    "lender_name": lender.full_name,
                    "loan_count": len(lender_loans),
                    "total_principal": sum(l.principal_amount for l in lender_loans),
                    "outstanding_principal": sum(l.current_principal_balance for l in lender_loans if l.status == LoanStatus.ACTIVE),
                    "default_count": len([l for l in lender_loans if l.status in [LoanStatus.DEFAULT, LoanStatus.CHARGED_OFF]])
                })
        
        # Insurer stats
        active_insurer_ids = set(l.insurer_id for l in loans if l.insurer_id)
        active_insurers = len(active_insurer_ids)
        total_insured_amount = sum(l.principal_amount * (l.guarantee_percentage or 0) for l in loans if l.insurer_id)
        total_premium_collected = sum(l.premium_paid for l in loans)
        
        insurer_stats = []
        for insurer in insurers:
            insurer_loans = [l for l in loans if l.insurer_id == insurer.id]
            if insurer_loans:
                insurer_stats.append({
                    "insurer_id": insurer.id,
                    "insurer_name": insurer.full_name,
                    "policy_count": len(insurer_loans),
                    "total_exposure": sum(l.principal_amount * (l.guarantee_percentage or 0) for l in insurer_loans),
                    "premium_collected": sum(l.premium_paid for l in insurer_loans),
                    "default_count": len([l for l in insurer_loans if l.status in [LoanStatus.DEFAULT, LoanStatus.CHARGED_OFF]])
                })
        
        # Geographic concentration
        geo_data = {}
        for loan in loans:
            state = loan.state or "Unknown"
            if state not in geo_data:
                geo_data[state] = {"count": 0, "principal": 0}
            geo_data[state]["count"] += 1
            geo_data[state]["principal"] += loan.principal_amount
        
        geographic_concentration = [
            GeographicConcentration(
                state=state,
                loan_count=data["count"],
                total_principal=data["principal"],
                percentage=(data["principal"] / total_principal_originated * 100) if total_principal_originated > 0 else 0
            )
            for state, data in sorted(geo_data.items(), key=lambda x: x[1]["principal"], reverse=True)
        ]
        
        # Industry concentration
        ind_data = {}
        for loan in loans:
            industry = loan.industry or "Unknown"
            if industry not in ind_data:
                ind_data[industry] = {"count": 0, "principal": 0}
            ind_data[industry]["count"] += 1
            ind_data[industry]["principal"] += loan.principal_amount
        
        industry_concentration = [
            IndustryConcentration(
                industry=industry,
                loan_count=data["count"],
                total_principal=data["principal"],
                percentage=(data["principal"] / total_principal_originated * 100) if total_principal_originated > 0 else 0
            )
            for industry, data in sorted(ind_data.items(), key=lambda x: x[1]["principal"], reverse=True)
        ]
        
        return AdminDashboardStats(
            total_loans=total_loans,
            total_principal_outstanding=total_principal_outstanding,
            total_principal_originated=total_principal_originated,
            total_lenders=len(lenders),
            active_lenders=active_lenders,
            average_portfolio_size=average_portfolio_size,
            total_insurers=len(insurers),
            active_insurers=active_insurers,
            total_insured_amount=total_insured_amount,
            total_premium_collected=total_premium_collected,
            platform_default_rate=platform_default_rate,
            total_defaults=total_defaults,
            total_losses=total_losses,
            total_recoveries=total_recoveries,
            lender_stats=lender_stats,
            insurer_stats=insurer_stats,
            geographic_concentration=geographic_concentration,
            industry_concentration=industry_concentration
        )


financial_service = FinancialService()
