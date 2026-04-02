from typing import List, Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_active_user, require_lender_decision
from app.models.user import User, UserRole, LENDER_ROLES, LENDER_DECISION_ROLES
from app.models.deal import Deal, DealMatch
from app.models.executed_loan import ExecutedLoan
from app.models.policy import LenderPolicy, InsurerPolicy
from app.models.assumption import SystemAssumption
from app.services.loan_origination import loan_origination_service, get_origination_setting
from app.schemas.financial import ExecutedLoanResponse

router = APIRouter()


# Request schemas
class OriginateLoanRequest(BaseModel):
    match_id: int
    principal_amount: float
    interest_rate: float  # As decimal, e.g., 0.08 for 8%
    term_months: int
    origination_date: Optional[date] = None
    notes: Optional[str] = None


class IssueGuaranteeRequest(BaseModel):
    match_id: int
    guarantee_percentage: float  # As percentage, e.g., 50 for 50%
    premium_rate: float  # As percentage, e.g., 2 for 2%
    effective_date: Optional[date] = None
    notes: Optional[str] = None


class OriginationSettingsUpdate(BaseModel):
    require_dual_acceptance: Optional[bool] = None
    require_insurer_for_origination: Optional[bool] = None


class OriginationSettingsResponse(BaseModel):
    require_dual_acceptance: bool
    require_insurer_for_origination: bool


# Response schemas
class OriginatableMatch(BaseModel):
    match_id: int
    deal_id: int
    deal_name: str
    borrower_name: str
    requested_amount: float
    industry: str
    state: Optional[str]
    match_score: Optional[float]
    status: str
    accepted_at: Optional[str]
    has_insurer_acceptance: bool = False  # Whether an insurer has accepted
    can_originate: bool = True  # Whether origination is allowed based on settings

    class Config:
        from_attributes = True


class GuaranteeableMatch(BaseModel):
    match_id: int
    deal_id: int
    deal_name: str
    borrower_name: str
    loan_amount: Optional[float]
    industry: str
    state: Optional[str]
    match_score: Optional[float]
    status: str
    has_loan: bool
    loan_number: Optional[str]
    loan_principal: Optional[float]

    class Config:
        from_attributes = True


class GuaranteeResponse(BaseModel):
    guarantee_number: str
    deal_id: int
    match_id: int
    insurer_id: int
    guarantee_percentage: float
    premium_rate: float
    effective_date: str
    status: str
    loan_id: Optional[int]
    loan_number: Optional[str]
    covered_amount: Optional[float]
    note: Optional[str] = None


# Endpoints

@router.get("/originatable-matches", response_model=List[OriginatableMatch])
def get_originatable_matches(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get accepted matches that can be originated into loans.
    
    Only Credit Committee and full Lender roles can originate.
    Loan Officers can view but not originate.
    """
    try:
        if current_user.role not in LENDER_ROLES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only lender roles can access origination"
            )
        
        # Get origination settings
        require_dual_acceptance = get_origination_setting(db, "require_dual_acceptance", False)
        require_insurer = get_origination_setting(db, "require_insurer_for_origination", False)
        
        # Use effective lender ID for org members
        lender_id = current_user.effective_lender_id
        matches = loan_origination_service.get_originatable_matches(db, lender_id)
        
        result = []
        for match in matches:
            deal = db.query(Deal).filter(Deal.id == match.deal_id).first()
            borrower = db.query(User).filter(User.id == deal.borrower_id).first() if deal else None
            
            # Check if insurer has accepted this deal
            insurer_match = db.query(DealMatch).filter(
                DealMatch.deal_id == deal.id,
                DealMatch.insurer_policy_id.isnot(None),
                DealMatch.status.in_(['accepted', 'counter_accepted'])
            ).first() if deal else None
            
            has_insurer_acceptance = insurer_match is not None
            
            # Determine if origination is allowed
            can_originate = True
            if require_dual_acceptance and not has_insurer_acceptance:
                can_originate = False
            elif require_insurer and not has_insurer_acceptance:
                can_originate = False
            
            result.append(OriginatableMatch(
                match_id=match.id,
                deal_id=match.deal_id,
                deal_name=deal.name if deal else "Unknown",
                borrower_name=borrower.full_name if borrower else "Unknown",
                requested_amount=deal.loan_amount_requested if deal and deal.loan_amount_requested else 0,
                industry=deal.industry if deal else "Unknown",
                state=None,  # Deal doesn't have state field
                match_score=match.match_score,
                status=match.status,
                accepted_at=match.decision_at.isoformat() if match.decision_at else None,
                has_insurer_acceptance=has_insurer_acceptance,
                can_originate=can_originate
            ))
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in get_originatable_matches: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/originate-loan", response_model=ExecutedLoanResponse)
def originate_loan(
    request: OriginateLoanRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Originate a loan from an accepted match.
    
    Only Credit Committee and full Lender roles can originate loans.
    Loan Officers cannot originate - they can only review and verify.
    """
    if current_user.role not in LENDER_DECISION_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Credit Committee or Lender roles can originate loans. Loan Officers must escalate to Credit Committee."
        )
    
    # Use effective lender ID for the loan
    lender_id = current_user.effective_lender_id
    
    try:
        loan = loan_origination_service.originate_loan(
            db=db,
            match_id=request.match_id,
            lender_id=lender_id,
            principal_amount=request.principal_amount,
            interest_rate=request.interest_rate,
            term_months=request.term_months,
            origination_date=request.origination_date,
            notes=request.notes
        )
        
        # Build response
        borrower = db.query(User).filter(User.id == loan.borrower_id).first()
        lender = db.query(User).filter(User.id == loan.lender_id).first()
        insurer = db.query(User).filter(User.id == loan.insurer_id).first() if loan.insurer_id else None
        deal = db.query(Deal).filter(Deal.id == loan.deal_id).first()
        
        return ExecutedLoanResponse(
            id=loan.id,
            deal_id=loan.deal_id,
            match_id=loan.match_id,
            borrower_id=loan.borrower_id,
            lender_id=loan.lender_id,
            insurer_id=loan.insurer_id,
            loan_number=loan.loan_number,
            principal_amount=loan.principal_amount,
            interest_rate=loan.interest_rate,
            term_months=loan.term_months,
            monthly_payment=loan.monthly_payment,
            origination_date=loan.origination_date,
            maturity_date=loan.maturity_date,
            status=loan.status.value,
            current_principal_balance=loan.current_principal_balance,
            guarantee_percentage=loan.guarantee_percentage,
            premium_rate=loan.premium_rate,
            premium_paid=loan.premium_paid or 0,
            state=loan.state,
            city=loan.city,
            zip_code=loan.zip_code,
            industry=loan.industry,
            days_past_due=loan.days_past_due or 0,
            last_payment_date=loan.last_payment_date,
            total_payments_made=loan.total_payments_made or 0,
            total_principal_paid=loan.total_principal_paid or 0,
            total_interest_paid=loan.total_interest_paid or 0,
            default_date=loan.default_date,
            default_amount=loan.default_amount,
            recovery_amount=loan.recovery_amount,
            loss_amount=loan.loss_amount,
            notes=loan.notes,
            created_at=loan.created_at,
            updated_at=loan.updated_at,
            borrower_name=borrower.full_name if borrower else None,
            lender_name=lender.full_name if lender else None,
            insurer_name=insurer.full_name if insurer else None,
            deal_name=deal.name if deal else None
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/guaranteeable-matches", response_model=List[GuaranteeableMatch])
def get_guaranteeable_matches(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get accepted matches that can receive guarantees."""
    if current_user.role != UserRole.INSURER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only insurers can issue guarantees"
        )
    
    matches = loan_origination_service.get_guaranteeable_matches(db, current_user.id)
    
    result = []
    for match in matches:
        deal = db.query(Deal).filter(Deal.id == match.deal_id).first()
        borrower = db.query(User).filter(User.id == deal.borrower_id).first() if deal else None
        
        # Check if loan exists
        loan = db.query(ExecutedLoan).filter(ExecutedLoan.deal_id == deal.id).first() if deal else None
        
        result.append(GuaranteeableMatch(
            match_id=match.id,
            deal_id=match.deal_id,
            deal_name=deal.name if deal else "Unknown",
            borrower_name=borrower.full_name if borrower else "Unknown",
            loan_amount=deal.loan_amount_requested if deal else None,
            industry=deal.industry if deal else "Unknown",
            state=None,  # Deal doesn't have state field
            match_score=match.match_score,
            status=match.status,
            has_loan=loan is not None,
            loan_number=loan.loan_number if loan else None,
            loan_principal=loan.principal_amount if loan else None
        ))
    
    return result


@router.post("/issue-guarantee", response_model=GuaranteeResponse)
def issue_guarantee(
    request: IssueGuaranteeRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Issue a guarantee contract for an accepted match."""
    if current_user.role != UserRole.INSURER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only insurers can issue guarantees"
        )
    
    try:
        result = loan_origination_service.issue_guarantee(
            db=db,
            match_id=request.match_id,
            insurer_id=current_user.id,
            guarantee_percentage=request.guarantee_percentage,
            premium_rate=request.premium_rate,
            effective_date=request.effective_date,
            notes=request.notes
        )
        
        return GuaranteeResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/my-originated-loans", response_model=List[ExecutedLoanResponse])
def get_my_originated_loans(
    status_filter: Optional[str] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get loans originated by the current lender."""
    if current_user.role != UserRole.LENDER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only lenders can view originated loans"
        )
    
    query = db.query(ExecutedLoan).filter(ExecutedLoan.lender_id == current_user.id)
    
    if status_filter:
        query = query.filter(ExecutedLoan.status == status_filter)
    
    loans = query.order_by(ExecutedLoan.origination_date.desc()).all()
    
    result = []
    for loan in loans:
        borrower = db.query(User).filter(User.id == loan.borrower_id).first()
        lender = db.query(User).filter(User.id == loan.lender_id).first()
        insurer = db.query(User).filter(User.id == loan.insurer_id).first() if loan.insurer_id else None
        deal = db.query(Deal).filter(Deal.id == loan.deal_id).first()
        
        result.append(ExecutedLoanResponse(
            id=loan.id,
            deal_id=loan.deal_id,
            match_id=loan.match_id,
            borrower_id=loan.borrower_id,
            lender_id=loan.lender_id,
            insurer_id=loan.insurer_id,
            loan_number=loan.loan_number,
            principal_amount=loan.principal_amount,
            interest_rate=loan.interest_rate,
            term_months=loan.term_months,
            monthly_payment=loan.monthly_payment,
            origination_date=loan.origination_date,
            maturity_date=loan.maturity_date,
            status=loan.status.value,
            current_principal_balance=loan.current_principal_balance,
            guarantee_percentage=loan.guarantee_percentage,
            premium_rate=loan.premium_rate,
            premium_paid=loan.premium_paid or 0,
            state=loan.state,
            city=loan.city,
            zip_code=loan.zip_code,
            industry=loan.industry,
            days_past_due=loan.days_past_due or 0,
            last_payment_date=loan.last_payment_date,
            total_payments_made=loan.total_payments_made or 0,
            total_principal_paid=loan.total_principal_paid or 0,
            total_interest_paid=loan.total_interest_paid or 0,
            default_date=loan.default_date,
            default_amount=loan.default_amount,
            recovery_amount=loan.recovery_amount,
            loss_amount=loan.loss_amount,
            notes=loan.notes,
            created_at=loan.created_at,
            updated_at=loan.updated_at,
            borrower_name=borrower.full_name if borrower else None,
            lender_name=lender.full_name if lender else None,
            insurer_name=insurer.full_name if insurer else None,
            deal_name=deal.name if deal else None
        ))
    
    return result


@router.get("/my-guaranteed-loans", response_model=List[ExecutedLoanResponse])
def get_my_guaranteed_loans(
    status_filter: Optional[str] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get loans guaranteed by the current insurer."""
    if current_user.role != UserRole.INSURER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only insurers can view guaranteed loans"
        )
    
    query = db.query(ExecutedLoan).filter(ExecutedLoan.insurer_id == current_user.id)
    
    if status_filter:
        query = query.filter(ExecutedLoan.status == status_filter)
    
    loans = query.order_by(ExecutedLoan.origination_date.desc()).all()
    
    result = []
    for loan in loans:
        borrower = db.query(User).filter(User.id == loan.borrower_id).first()
        lender = db.query(User).filter(User.id == loan.lender_id).first()
        insurer = db.query(User).filter(User.id == loan.insurer_id).first() if loan.insurer_id else None
        deal = db.query(Deal).filter(Deal.id == loan.deal_id).first()
        
        result.append(ExecutedLoanResponse(
            id=loan.id,
            deal_id=loan.deal_id,
            match_id=loan.match_id,
            borrower_id=loan.borrower_id,
            lender_id=loan.lender_id,
            insurer_id=loan.insurer_id,
            loan_number=loan.loan_number,
            principal_amount=loan.principal_amount,
            interest_rate=loan.interest_rate,
            term_months=loan.term_months,
            monthly_payment=loan.monthly_payment,
            origination_date=loan.origination_date,
            maturity_date=loan.maturity_date,
            status=loan.status.value,
            current_principal_balance=loan.current_principal_balance,
            guarantee_percentage=loan.guarantee_percentage,
            premium_rate=loan.premium_rate,
            premium_paid=loan.premium_paid or 0,
            state=loan.state,
            city=loan.city,
            zip_code=loan.zip_code,
            industry=loan.industry,
            days_past_due=loan.days_past_due or 0,
            last_payment_date=loan.last_payment_date,
            total_payments_made=loan.total_payments_made or 0,
            total_principal_paid=loan.total_principal_paid or 0,
            total_interest_paid=loan.total_interest_paid or 0,
            default_date=loan.default_date,
            default_amount=loan.default_amount,
            recovery_amount=loan.recovery_amount,
            loss_amount=loan.loss_amount,
            notes=loan.notes,
            created_at=loan.created_at,
            updated_at=loan.updated_at,
            borrower_name=borrower.full_name if borrower else None,
            lender_name=lender.full_name if lender else None,
            insurer_name=insurer.full_name if insurer else None,
            deal_name=deal.name if deal else None
        ))
    
    return result



# Admin endpoints for origination settings

@router.get("/settings", response_model=OriginationSettingsResponse)
def get_origination_settings(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get origination settings (admin only)."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can view origination settings"
        )
    
    return OriginationSettingsResponse(
        require_dual_acceptance=get_origination_setting(db, "require_dual_acceptance", False),
        require_insurer_for_origination=get_origination_setting(db, "require_insurer_for_origination", False)
    )


@router.put("/settings", response_model=OriginationSettingsResponse)
def update_origination_settings(
    settings: OriginationSettingsUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update origination settings (admin only)."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can update origination settings"
        )
    
    # Update require_dual_acceptance if provided
    if settings.require_dual_acceptance is not None:
        assumption = db.query(SystemAssumption).filter(
            SystemAssumption.category == "origination",
            SystemAssumption.key == "require_dual_acceptance",
            SystemAssumption.user_id.is_(None)
        ).first()
        
        if assumption:
            assumption.value = settings.require_dual_acceptance
        else:
            assumption = SystemAssumption(
                category="origination",
                key="require_dual_acceptance",
                value=settings.require_dual_acceptance,
                description="Require both lender AND insurer/fund acceptance before loan can be originated"
            )
            db.add(assumption)
    
    # Update require_insurer_for_origination if provided
    if settings.require_insurer_for_origination is not None:
        assumption = db.query(SystemAssumption).filter(
            SystemAssumption.category == "origination",
            SystemAssumption.key == "require_insurer_for_origination",
            SystemAssumption.user_id.is_(None)
        ).first()
        
        if assumption:
            assumption.value = settings.require_insurer_for_origination
        else:
            assumption = SystemAssumption(
                category="origination",
                key="require_insurer_for_origination",
                value=settings.require_insurer_for_origination,
                description="Require an insurer/fund guarantee before loan can be originated"
            )
            db.add(assumption)
    
    db.commit()
    
    return OriginationSettingsResponse(
        require_dual_acceptance=get_origination_setting(db, "require_dual_acceptance", False),
        require_insurer_for_origination=get_origination_setting(db, "require_insurer_for_origination", False)
    )



# ── Term Sheet endpoints ──────────────────────────────────────────────────────

from pydantic import BaseModel as PydanticBase
from typing import Optional as Opt
import json as _json

class TermSheetCreate(PydanticBase):
    match_id: int
    deal_id: int
    loan_amount: float
    interest_rate: float
    term_months: int
    sba_loan: bool = True
    sba_guarantee_pct: float = 75.0
    origination_fee_pct: float = 2.0
    prepayment_penalty: bool = True
    covenants: str = ""
    conditions: str = ""
    expiry_days: int = 30
    notes: str = ""

class TermSheetUpdate(PydanticBase):
    loan_amount: Opt[float] = None
    interest_rate: Opt[float] = None
    term_months: Opt[int] = None
    sba_loan: Opt[bool] = None
    sba_guarantee_pct: Opt[float] = None
    origination_fee_pct: Opt[float] = None
    prepayment_penalty: Opt[bool] = None
    covenants: Opt[str] = None
    conditions: Opt[str] = None
    expiry_days: Opt[int] = None
    notes: Opt[str] = None
    status: Opt[str] = None  # draft, submitted, accepted, rejected

class TermSheetSubmitRequest(PydanticBase):
    match_id: int


@router.get("/term-sheets")
def list_term_sheets(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get all term sheets created by this lender."""
    from app.models.deal import DealMatch
    # Fetch from match extra_data JSON store
    matches = db.query(DealMatch).filter(
        DealMatch.lender_id == current_user.company_id or
        DealMatch.lender_policy_id.isnot(None)
    ).all()

    sheets = []
    for match in matches:
    extra = dict(match.counter_offer or {})
    if extra.get("term_sheet"):
        ts = extra["term_sheet"]
            ts["match_id"] = match.id
            ts["deal_id"] = match.deal_id
            ts["match_status"] = match.status
            sheets.append(ts)
    return sheets


@router.get("/term-sheets/accepted-matches")
def get_accepted_matches_for_term_sheets(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get accepted matches that need or have term sheets."""
    from app.models.deal import DealMatch, Deal, DealRiskReport
    if current_user.role.value not in ["lender","credit_committee","admin"]:
        raise HTTPException(status_code=403, detail="Lenders only")

    matches = db.query(DealMatch).filter(
        DealMatch.status == "accepted"
    ).order_by(DealMatch.updated_at.desc()).all()

    results = []
    for match in matches:
        deal = db.query(Deal).filter(Deal.id == match.deal_id).first()
        if not deal:
            continue
        report = db.query(DealRiskReport).filter(
            DealRiskReport.deal_id == match.deal_id
        ).order_by(DealRiskReport.version.desc()).first()

        extra = dict(match.counter_offer or {})
        ts = extra.get("term_sheet")

        # Build AI-suggested terms from UW report
        suggested = {}
        if report:
            loan = deal.loan_amount_requested or 0
            rate = 10.75
            term = deal.loan_term_months or 120
            if report.dscr_base and report.dscr_base < 1.30:
                rate += 0.50  # higher rate for tighter DSCR
            if not report.sba_eligible:
                rate += 0.25
            suggested = {
                "loan_amount": loan,
                "interest_rate": round(rate, 2),
                "term_months": term,
                "sba_loan": bool(report.sba_eligible),
                "sba_guarantee_pct": 75.0,
                "origination_fee_pct": 2.0,
                "prepayment_penalty": True,
                "covenants": f"Maintain DSCR ≥ {max(1.20, round((report.dscr_base or 1.25)*0.9, 2))}x quarterly. Provide annual CPA-prepared financials. No additional debt without lender consent.",
                "conditions": "Subject to satisfactory appraisal and environmental review. Personal guarantee of all owners ≥ 20%. Evidence of equity injection prior to closing.",
            }
            if report.deal_killer_verdict == "renegotiate":
                suggested["covenants"] += f"\nNote: AI suggests renegotiating price — max supportable: ${(report.max_supportable_price or 0):,.0f}"

        results.append({
            "match_id": match.id,
            "deal_id": deal.id,
            "deal_name": deal.name,
            "industry": deal.industry,
            "borrower_name": deal.borrower_name if hasattr(deal, 'borrower_name') else "",
            "loan_amount_requested": deal.loan_amount_requested,
            "purchase_price": deal.purchase_price,
            "annual_revenue": deal.annual_revenue,
            "ebitda": deal.ebitda,
            "match_status": match.status,
            "term_sheet": ts,
            "term_sheet_status": ts.get("status","none") if ts else "none",
            "ai_suggested": suggested,
            "uw": {
                "health_score": report.health_score if report else None,
                "dscr_base": report.dscr_base if report else None,
                "verdict": report.deal_killer_verdict if report else None,
                "sba_eligible": report.sba_eligible if report else None,
            },
        })
    return results


@router.post("/term-sheets/save")
def save_term_sheet(
    data: TermSheetCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Save or update a term sheet on an accepted match."""
    from app.models.deal import DealMatch
    if current_user.role.value not in ["lender","credit_committee","admin"]:
        raise HTTPException(status_code=403, detail="Lenders only")

    match = db.query(DealMatch).filter(DealMatch.id == data.match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    if match.status != "accepted":
        raise HTTPException(status_code=400, detail="Match must be accepted before creating term sheet")

    ts = {
        "status": "draft",
        "loan_amount": data.loan_amount,
        "interest_rate": data.interest_rate,
        "term_months": data.term_months,
        "sba_loan": data.sba_loan,
        "sba_guarantee_pct": data.sba_guarantee_pct,
        "origination_fee_pct": data.origination_fee_pct,
        "prepayment_penalty": data.prepayment_penalty,
        "covenants": data.covenants,
        "conditions": data.conditions,
        "expiry_days": data.expiry_days,
        "notes": data.notes,
        "saved_by": current_user.id,
        "saved_at": __import__("datetime").datetime.utcnow().isoformat(),
    }

    extra = dict(match.counter_offer or {})
    extra["term_sheet"] = ts
    match.counter_offer = extra
    db.commit()

    audit_service.log(db=db, action="term_sheet_saved", entity_type="deal_match",
                      entity_id=match.id, user_id=current_user.id,
                      details={"deal_id": data.deal_id, "loan_amount": data.loan_amount})
    return {"status": "saved", "match_id": match.id, "term_sheet": ts}


@router.post("/term-sheets/{match_id}/submit-to-origination")
def submit_term_sheet_to_origination(
    match_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Mark a term sheet as submitted — moves deal into origination queue."""
    from app.models.deal import DealMatch, Deal, DealStatus
    if current_user.role.value not in ["lender","credit_committee","admin"]:
        raise HTTPException(status_code=403, detail="Lenders only")

    match = db.query(DealMatch).filter(DealMatch.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    extra = dict(match.counter_offer or {})
    if not extra.get("term_sheet"):
        raise HTTPException(status_code=400, detail="No term sheet saved. Save terms first.")

    extra["term_sheet"]["status"] = "submitted_to_origination"
    extra["term_sheet"]["submitted_at"] = __import__("datetime").datetime.utcnow().isoformat()
    match.counter_offer = extra

    # Update deal status to reflect it's in origination
    deal = db.query(Deal).filter(Deal.id == match.deal_id).first()
    if deal and deal.status == DealStatus.APPROVED:
        # Keep approved but flag in origination
        pass

    db.commit()

    audit_service.log(db=db, action="term_sheet_submitted_origination", entity_type="deal_match",
                      entity_id=match.id, user_id=current_user.id,
                      details={"deal_id": match.deal_id})

    return {"status": "submitted", "match_id": match_id, "message": "Term sheet moved to origination queue"}


@router.get("/origination-queue")
def get_origination_queue(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get deals with submitted term sheets ready for final origination review."""
    from app.models.deal import DealMatch, Deal, DealRiskReport
    if current_user.role.value not in ["lender","credit_committee","admin"]:
        raise HTTPException(status_code=403, detail="Lenders only")

    matches = db.query(DealMatch).filter(
        DealMatch.status == "accepted"
    ).all()

    queue = []
    for match in matches:
        extra = dict(match.counter_offer or {})
        ts = extra.get("term_sheet", {})
        if ts.get("status") != "submitted_to_origination":
            continue

        deal = db.query(Deal).filter(Deal.id == match.deal_id).first()
        report = db.query(DealRiskReport).filter(
            DealRiskReport.deal_id == match.deal_id
        ).order_by(DealRiskReport.version.desc()).first()

        queue.append({
            "match_id": match.id,
            "deal_id": deal.id if deal else match.deal_id,
            "deal_name": deal.name if deal else f"Deal {match.deal_id}",
            "industry": deal.industry if deal else "",
            "loan_amount_requested": deal.loan_amount_requested if deal else 0,
            "annual_revenue": deal.annual_revenue if deal else 0,
            "term_sheet": ts,
            "submitted_at": ts.get("submitted_at"),
            "uw": {
                "health_score": report.health_score if report else None,
                "dscr_base": report.dscr_base if report else None,
                "verdict": report.deal_killer_verdict if report else None,
                "sba_eligible": report.sba_eligible if report else None,
            },
            "can_originate": True,
        })
    return queue
