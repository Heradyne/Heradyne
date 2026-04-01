from typing import List, Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_active_user, require_admin
from app.models.user import User, UserRole
from app.models.executed_loan import ExecutedLoan, LoanStatus, LoanPayment, InsuranceClaim
from app.schemas.financial import (
    ExecutedLoanCreate, ExecutedLoanUpdate, ExecutedLoanResponse,
    LoanPaymentCreate, LoanPaymentResponse,
    LenderDashboardStats, InsurerDashboardStats, AdminDashboardStats,
    InsuranceClaimCreate, InsuranceClaimResponse
)
from app.services.financial import financial_service
from app.services.audit import audit_service

router = APIRouter()


# ============ Dashboard Endpoints ============

@router.get("/dashboard/lender", response_model=LenderDashboardStats)
def get_lender_dashboard(
    lender_id: Optional[int] = Query(None, description="Lender ID (admin can view any, lenders see own)"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get financial dashboard statistics for a lender."""
    
    # Determine which lender to show
    if current_user.role == UserRole.ADMIN:
        target_lender_id = lender_id or current_user.id
    elif current_user.role == UserRole.LENDER:
        if lender_id and lender_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Can only view own dashboard")
        target_lender_id = current_user.id
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    return financial_service.get_lender_dashboard_stats(db, target_lender_id)


@router.get("/dashboard/insurer", response_model=InsurerDashboardStats)
def get_insurer_dashboard(
    insurer_id: Optional[int] = Query(None, description="Insurer ID (admin can view any, insurers see own)"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get financial dashboard statistics for an insurer."""
    
    # Determine which insurer to show
    if current_user.role == UserRole.ADMIN:
        target_insurer_id = insurer_id or current_user.id
    elif current_user.role == UserRole.INSURER:
        if insurer_id and insurer_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Can only view own dashboard")
        target_insurer_id = current_user.id
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    return financial_service.get_insurer_dashboard_stats(db, target_insurer_id)


@router.get("/dashboard/admin", response_model=AdminDashboardStats)
def get_admin_dashboard(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Get platform-wide financial dashboard statistics (admin only)."""
    return financial_service.get_admin_dashboard_stats(db)


# ============ Executed Loan Endpoints ============

@router.get("/loans", response_model=List[ExecutedLoanResponse])
def list_executed_loans(
    lender_id: Optional[int] = Query(None),
    insurer_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    industry: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """List executed loans with optional filters."""
    
    query = db.query(ExecutedLoan)
    
    # Access control
    if current_user.role == UserRole.LENDER:
        query = query.filter(ExecutedLoan.lender_id == current_user.id)
    elif current_user.role == UserRole.INSURER:
        query = query.filter(ExecutedLoan.insurer_id == current_user.id)
    elif current_user.role == UserRole.BORROWER:
        query = query.filter(ExecutedLoan.borrower_id == current_user.id)
    # Admin sees all
    
    # Apply filters
    if lender_id and current_user.role == UserRole.ADMIN:
        query = query.filter(ExecutedLoan.lender_id == lender_id)
    if insurer_id and current_user.role == UserRole.ADMIN:
        query = query.filter(ExecutedLoan.insurer_id == insurer_id)
    if status_filter:
        query = query.filter(ExecutedLoan.status == status_filter)
    if state:
        query = query.filter(ExecutedLoan.state == state)
    if industry:
        query = query.filter(ExecutedLoan.industry == industry)
    
    loans = query.order_by(ExecutedLoan.origination_date.desc()).offset(skip).limit(limit).all()
    
    # Enrich with names
    result = []
    for loan in loans:
        loan_dict = ExecutedLoanResponse.model_validate(loan).model_dump()
        
        # Add related names
        borrower = db.query(User).filter(User.id == loan.borrower_id).first()
        lender = db.query(User).filter(User.id == loan.lender_id).first()
        insurer = db.query(User).filter(User.id == loan.insurer_id).first() if loan.insurer_id else None
        
        loan_dict["borrower_name"] = borrower.full_name if borrower else None
        loan_dict["lender_name"] = lender.full_name if lender else None
        loan_dict["insurer_name"] = insurer.full_name if insurer else None
        
        if loan.deal:
            loan_dict["deal_name"] = loan.deal.name
        
        result.append(ExecutedLoanResponse(**loan_dict))
    
    return result


@router.get("/loans/{loan_id}", response_model=ExecutedLoanResponse)
def get_executed_loan(
    loan_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get details of a specific executed loan."""
    
    loan = db.query(ExecutedLoan).filter(ExecutedLoan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Loan not found")
    
    # Access control
    if current_user.role == UserRole.LENDER and loan.lender_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if current_user.role == UserRole.INSURER and loan.insurer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if current_user.role == UserRole.BORROWER and loan.borrower_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    # Enrich with names
    loan_dict = ExecutedLoanResponse.model_validate(loan).model_dump()
    
    borrower = db.query(User).filter(User.id == loan.borrower_id).first()
    lender = db.query(User).filter(User.id == loan.lender_id).first()
    insurer = db.query(User).filter(User.id == loan.insurer_id).first() if loan.insurer_id else None
    
    loan_dict["borrower_name"] = borrower.full_name if borrower else None
    loan_dict["lender_name"] = lender.full_name if lender else None
    loan_dict["insurer_name"] = insurer.full_name if insurer else None
    
    if loan.deal:
        loan_dict["deal_name"] = loan.deal.name
    
    return ExecutedLoanResponse(**loan_dict)


@router.post("/loans", response_model=ExecutedLoanResponse, status_code=status.HTTP_201_CREATED)
def create_executed_loan(
    loan_data: ExecutedLoanCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Create an executed loan record (admin only - typically from deal acceptance)."""
    
    loan = ExecutedLoan(
        **loan_data.model_dump(),
        loan_number=financial_service.generate_loan_number(),
        current_principal_balance=loan_data.principal_amount,
        status=LoanStatus.ACTIVE
    )
    
    db.add(loan)
    db.commit()
    db.refresh(loan)
    
    audit_service.log(
        db=db, action="loan_created", entity_type="executed_loan",
        entity_id=loan.id, user_id=current_user.id,
        details={"loan_number": loan.loan_number, "principal": loan.principal_amount}
    )
    
    return loan


@router.put("/loans/{loan_id}", response_model=ExecutedLoanResponse)
def update_executed_loan(
    loan_id: int,
    loan_update: ExecutedLoanUpdate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Update an executed loan (admin only)."""
    
    loan = db.query(ExecutedLoan).filter(ExecutedLoan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Loan not found")
    
    update_data = loan_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(loan, field, value)
    
    db.commit()
    db.refresh(loan)
    
    audit_service.log(
        db=db, action="loan_updated", entity_type="executed_loan",
        entity_id=loan.id, user_id=current_user.id,
        details=update_data
    )
    
    return loan


# ============ Loan Payment Endpoints ============

@router.get("/loans/{loan_id}/payments", response_model=List[LoanPaymentResponse])
def get_loan_payments(
    loan_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get payment history for a loan."""
    
    loan = db.query(ExecutedLoan).filter(ExecutedLoan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Loan not found")
    
    # Access control
    if current_user.role == UserRole.LENDER and loan.lender_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if current_user.role == UserRole.INSURER and loan.insurer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if current_user.role == UserRole.BORROWER and loan.borrower_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    payments = db.query(LoanPayment).filter(
        LoanPayment.loan_id == loan_id
    ).order_by(LoanPayment.payment_number).all()
    
    return payments


@router.post("/loans/{loan_id}/payments", response_model=LoanPaymentResponse, status_code=status.HTTP_201_CREATED)
def record_loan_payment(
    loan_id: int,
    payment_data: LoanPaymentCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Record a payment for a loan (admin only)."""
    
    loan = db.query(ExecutedLoan).filter(ExecutedLoan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Loan not found")
    
    payment = LoanPayment(**payment_data.model_dump())
    db.add(payment)
    
    # Update loan record
    loan.current_principal_balance = payment_data.principal_balance_after
    loan.last_payment_date = payment_data.payment_date
    loan.total_payments_made += 1
    loan.total_principal_paid += payment_data.principal_portion
    loan.total_interest_paid += payment_data.interest_portion
    
    if payment_data.is_late:
        loan.days_past_due = payment_data.days_late
    else:
        loan.days_past_due = 0
    
    # Check if paid off
    if loan.current_principal_balance <= 0:
        loan.status = LoanStatus.PAID_OFF
    
    db.commit()
    db.refresh(payment)
    
    audit_service.log(
        db=db, action="payment_recorded", entity_type="loan_payment",
        entity_id=payment.id, user_id=current_user.id,
        details={"loan_id": loan_id, "amount": payment_data.actual_payment}
    )
    
    return payment


# ============ Insurance Claim Endpoints ============

@router.get("/claims", response_model=List[InsuranceClaimResponse])
def list_insurance_claims(
    insurer_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """List insurance claims."""
    
    query = db.query(InsuranceClaim)
    
    # Access control
    if current_user.role == UserRole.INSURER:
        query = query.filter(InsuranceClaim.insurer_id == current_user.id)
    elif current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    if insurer_id and current_user.role == UserRole.ADMIN:
        query = query.filter(InsuranceClaim.insurer_id == insurer_id)
    if status_filter:
        query = query.filter(InsuranceClaim.status == status_filter)
    
    return query.order_by(InsuranceClaim.claim_date.desc()).all()


@router.post("/claims", response_model=InsuranceClaimResponse, status_code=status.HTTP_201_CREATED)
def create_insurance_claim(
    claim_data: InsuranceClaimCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Create an insurance claim (admin only)."""
    
    # Verify loan exists and is in default
    loan = db.query(ExecutedLoan).filter(ExecutedLoan.id == claim_data.loan_id).first()
    if not loan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Loan not found")
    
    claim = InsuranceClaim(
        **claim_data.model_dump(),
        claim_number=financial_service.generate_claim_number(),
        status="pending"
    )
    
    db.add(claim)
    db.commit()
    db.refresh(claim)
    
    audit_service.log(
        db=db, action="claim_created", entity_type="insurance_claim",
        entity_id=claim.id, user_id=current_user.id,
        details={"claim_number": claim.claim_number, "amount": claim.claim_amount}
    )
    
    return claim


@router.put("/claims/{claim_id}", response_model=InsuranceClaimResponse)
def update_insurance_claim(
    claim_id: int,
    approved_amount: Optional[float] = None,
    paid_amount: Optional[float] = None,
    new_status: Optional[str] = None,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Update an insurance claim (admin only)."""
    
    claim = db.query(InsuranceClaim).filter(InsuranceClaim.id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim not found")
    
    if approved_amount is not None:
        claim.approved_amount = approved_amount
        claim.approved_date = date.today()
    
    if paid_amount is not None:
        claim.paid_amount = paid_amount
        claim.paid_date = date.today()
    
    if new_status:
        claim.status = new_status
    
    db.commit()
    db.refresh(claim)
    
    audit_service.log(
        db=db, action="claim_updated", entity_type="insurance_claim",
        entity_id=claim.id, user_id=current_user.id,
        details={"status": claim.status}
    )
    
    return claim


# ============ Aggregation Endpoints ============

@router.get("/loans/by-lender")
def get_loans_grouped_by_lender(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Get loans grouped by lender (admin only)."""
    
    lenders = db.query(User).filter(User.role == UserRole.LENDER).all()
    
    result = []
    for lender in lenders:
        loans = db.query(ExecutedLoan).filter(ExecutedLoan.lender_id == lender.id).all()
        if loans:
            result.append({
                "lender_id": lender.id,
                "lender_name": lender.full_name,
                "lender_email": lender.email,
                "total_loans": len(loans),
                "total_principal": sum(l.principal_amount for l in loans),
                "outstanding_principal": sum(l.current_principal_balance for l in loans if l.status == LoanStatus.ACTIVE),
                "active_loans": len([l for l in loans if l.status == LoanStatus.ACTIVE]),
                "defaulted_loans": len([l for l in loans if l.status in [LoanStatus.DEFAULT, LoanStatus.CHARGED_OFF]]),
                "average_rate": sum(l.interest_rate for l in loans) / len(loans) if loans else 0,
                "loans": [
                    {
                        "id": l.id,
                        "loan_number": l.loan_number,
                        "principal_amount": l.principal_amount,
                        "interest_rate": l.interest_rate,
                        "status": l.status.value,
                        "industry": l.industry,
                        "state": l.state
                    }
                    for l in loans
                ]
            })
    
    return sorted(result, key=lambda x: x["total_principal"], reverse=True)


@router.get("/loans/by-insurer")
def get_loans_grouped_by_insurer(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Get loans grouped by insurer (admin only)."""
    
    insurers = db.query(User).filter(User.role == UserRole.INSURER).all()
    
    result = []
    for insurer in insurers:
        loans = db.query(ExecutedLoan).filter(ExecutedLoan.insurer_id == insurer.id).all()
        if loans:
            result.append({
                "insurer_id": insurer.id,
                "insurer_name": insurer.full_name,
                "insurer_email": insurer.email,
                "total_policies": len(loans),
                "total_insured": sum(l.principal_amount * (l.guarantee_percentage or 0) for l in loans),
                "total_premium": sum(l.premium_paid for l in loans),
                "active_policies": len([l for l in loans if l.status == LoanStatus.ACTIVE]),
                "policies_in_default": len([l for l in loans if l.status in [LoanStatus.DEFAULT, LoanStatus.CHARGED_OFF]]),
                "loans": [
                    {
                        "id": l.id,
                        "loan_number": l.loan_number,
                        "principal_amount": l.principal_amount,
                        "guarantee_percentage": l.guarantee_percentage,
                        "premium_rate": l.premium_rate,
                        "status": l.status.value,
                        "industry": l.industry
                    }
                    for l in loans
                ]
            })
    
    return sorted(result, key=lambda x: x["total_insured"], reverse=True)
