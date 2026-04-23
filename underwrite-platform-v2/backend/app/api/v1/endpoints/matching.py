from typing import List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_active_user, require_lender_or_insurer, require_borrower
from app.models.user import User, UserRole, LENDER_ROLES, LENDER_DECISION_ROLES, LENDER_VERIFICATION_ROLES
from app.models.deal import Deal, DealRiskReport, DealMatch, DealStatus
from app.schemas.matching import (
    MatchResponse, DealMatchResponse, DealMatchDecision, RunMatchRequest, CounterOfferResponse
)
from app.services.matching import MatchingService
from app.services.audit import audit_service
from app.tasks import match_deal_task

router = APIRouter()

DISCLAIMER = (
    "INFORMATIONAL ONLY: Heradyne does not lend, guarantee, or insure. "
    "These matches are recommendations only."
)


@router.post("/deals/{deal_id}/run")
def run_matching(
    deal_id: int,
    request: RunMatchRequest = RunMatchRequest(),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Run matching for a deal against all active policies.
    
    Generates approve-if scenarios for near-miss matches.
    """
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    
    # Check access
    if current_user.role == UserRole.BORROWER and deal.borrower_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    # Get latest risk report
    risk_report = db.query(DealRiskReport).filter(
        DealRiskReport.deal_id == deal_id
    ).order_by(DealRiskReport.version.desc()).first()
    
    if not risk_report:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Deal must be analyzed before matching. Submit the deal first."
        )
    
    # Run matching
    matching_service = MatchingService(db)
    results = matching_service.match_deal(deal, risk_report, request.generate_scenarios)
    
    # Update deal status
    deal.status = DealStatus.MATCHED
    db.commit()
    
    audit_service.log(
        db=db, action="matching_run", entity_type="deal",
        entity_id=deal_id, user_id=current_user.id,
        details={"lender_matches": results["total_lender_matches"], 
                "insurer_matches": results["total_insurer_matches"]}
    )
    
    results["disclaimer"] = DISCLAIMER
    return results


@router.post("/deals/{deal_id}/run-async")
def run_matching_async(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Run matching asynchronously."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    
    if current_user.role == UserRole.BORROWER and deal.borrower_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    match_deal_task.delay(deal_id)
    
    return {"message": "Matching started", "deal_id": deal_id, "disclaimer": DISCLAIMER}


@router.get("/deals/{deal_id}/matches", response_model=List[DealMatchResponse])
def get_deal_matches(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all matches for a deal."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    
    if current_user.role == UserRole.BORROWER and deal.borrower_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    matches = db.query(DealMatch).filter(DealMatch.deal_id == deal_id).all()
    return matches


@router.get("/my-matches", response_model=List[DealMatchResponse])
def get_my_matches(
    current_user: User = Depends(require_lender_or_insurer),
    db: Session = Depends(get_db)
):
    """Get matches for the current lender or insurer's policies."""
    query = db.query(DealMatch)
    
    if current_user.role in LENDER_ROLES:
        # Get matches for this lender's policies (or organization's policies)
        from app.models.policy import LenderPolicy
        lender_id = current_user.effective_lender_id
        policy_ids = [p.id for p in db.query(LenderPolicy).filter(
            LenderPolicy.lender_id == lender_id
        ).all()]
        query = query.filter(DealMatch.lender_policy_id.in_(policy_ids))
    
    elif current_user.role == UserRole.INSURER:
        # Get matches for this insurer's policies
        from app.models.policy import InsurerPolicy
        policy_ids = [p.id for p in db.query(InsurerPolicy).filter(
            InsurerPolicy.insurer_id == current_user.id
        ).all()]
        query = query.filter(DealMatch.insurer_policy_id.in_(policy_ids))
    
    matches = query.order_by(DealMatch.created_at.desc()).all()
    return matches


@router.put("/matches/{match_id}/decision", response_model=DealMatchResponse)
def make_decision(
    match_id: int,
    decision: DealMatchDecision,
    current_user: User = Depends(require_lender_or_insurer),
    db: Session = Depends(get_db)
):
    """
    Make a decision on a match (accept/reject/request info).
    
    Role permissions:
    - Loan Officers: Can only request info (verification role)
    - Credit Committee/Lenders: Can accept, reject, or request info
    - Insurers: Can accept, reject, or request info
    """
    match = db.query(DealMatch).filter(DealMatch.id == match_id).first()
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")
    
    # Check role-based permissions for decision type
    if decision.status in ["accepted", "rejected"]:
        # Only credit committee, full lenders, or insurers can accept/reject
        if current_user.role == UserRole.LOAN_OFFICER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Loan Officers cannot accept or reject deals. This requires Credit Committee approval."
            )
    
    # Verify ownership
    if current_user.role in LENDER_ROLES:
        from app.models.policy import LenderPolicy
        lender_id = current_user.effective_lender_id
        policy = db.query(LenderPolicy).filter(LenderPolicy.id == match.lender_policy_id).first()
        if not policy or policy.lender_id != lender_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    elif current_user.role == UserRole.INSURER:
        from app.models.policy import InsurerPolicy
        policy = db.query(InsurerPolicy).filter(InsurerPolicy.id == match.insurer_policy_id).first()
        if not policy or policy.insurer_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    # Update match
    match.status = decision.status
    match.decision_notes = decision.decision_notes
    match.decision_at = datetime.utcnow()
    
    # Update deal status if needed
    deal = db.query(Deal).filter(Deal.id == match.deal_id).first()
    if decision.status == "accepted":
        if match.lender_policy_id:
            deal.status = DealStatus.PENDING_INSURER
        else:
            deal.status = DealStatus.APPROVED
    elif decision.status == "rejected":
        # Check if all matches are rejected
        other_pending = db.query(DealMatch).filter(
            DealMatch.deal_id == match.deal_id,
            DealMatch.id != match_id,
            DealMatch.status == "pending"
        ).count()
        if other_pending == 0:
            deal.status = DealStatus.REJECTED
    
    db.commit()
    db.refresh(match)
    
    audit_service.log(
        db=db, action=f"match_{decision.status}", entity_type="deal_match",
        entity_id=match_id, user_id=current_user.id,
        details={"deal_id": match.deal_id, "notes": decision.decision_notes, "role": current_user.role.value}
    )
    
    return match


@router.put("/matches/{match_id}/counter-offer-response", response_model=DealMatchResponse)
def respond_to_counter_offer(
    match_id: int,
    response: CounterOfferResponse,
    current_user: User = Depends(require_borrower),
    db: Session = Depends(get_db)
):
    """
    Borrower responds to a counter-offer.
    
    If accepted, the deal is updated with the proposed values and re-analyzed.
    If rejected, the match status is updated accordingly.
    """
    from app.schemas.matching import CounterOfferResponse
    
    match = db.query(DealMatch).filter(DealMatch.id == match_id).first()
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")
    
    if match.status != "counter_offered":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, 
                          detail="This match does not have a pending counter-offer")
    
    # Verify borrower owns the deal
    deal = db.query(Deal).filter(Deal.id == match.deal_id).first()
    if deal.borrower_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    # Check if counter-offer has expired
    if match.counter_offer_expires_at and match.counter_offer_expires_at < datetime.utcnow():
        match.borrower_response = "expired"
        match.borrower_response_at = datetime.utcnow()
        match.status = "rejected"
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, 
                          detail="Counter-offer has expired")
    
    match.borrower_response = response.response
    match.borrower_response_at = datetime.utcnow()
    match.borrower_response_notes = response.notes
    
    if response.response == "accepted":
        # Apply the counter-offer changes to the deal
        counter_offer = match.counter_offer
        if counter_offer and "proposed_values" in counter_offer:
            for field, value in counter_offer["proposed_values"].items():
                if hasattr(deal, field):
                    setattr(deal, field, value)
        
        # Mark match as accepted (borrower accepted counter-offer)
        match.status = "counter_accepted"
        
        # Update deal status
        if match.lender_policy_id:
            deal.status = DealStatus.PENDING_INSURER
        else:
            deal.status = DealStatus.APPROVED
        
        audit_service.log(
            db=db, action="counter_offer_accepted", entity_type="deal_match",
            entity_id=match_id, user_id=current_user.id,
            details={
                "deal_id": match.deal_id, 
                "counter_offer": counter_offer,
                "notes": response.notes
            }
        )
    else:
        # Borrower rejected counter-offer
        match.status = "counter_rejected"
        
        audit_service.log(
            db=db, action="counter_offer_rejected", entity_type="deal_match",
            entity_id=match_id, user_id=current_user.id,
            details={"deal_id": match.deal_id, "notes": response.notes}
        )
    
    db.commit()
    db.refresh(match)
    
    return match


@router.get("/matches/{match_id}/counter-offer")
def get_counter_offer_details(
    match_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get details of a counter-offer for a match.
    Available to borrower (deal owner) and the lender/insurer who made the offer.
    """
    match = db.query(DealMatch).filter(DealMatch.id == match_id).first()
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")
    
    deal = db.query(Deal).filter(Deal.id == match.deal_id).first()
    
    # Check access
    is_deal_owner = deal.borrower_id == current_user.id
    is_policy_owner = False
    
    if current_user.role == UserRole.LENDER and match.lender_policy_id:
        from app.models.policy import LenderPolicy
        policy = db.query(LenderPolicy).filter(LenderPolicy.id == match.lender_policy_id).first()
        is_policy_owner = policy and policy.lender_id == current_user.id
    elif current_user.role == UserRole.INSURER and match.insurer_policy_id:
        from app.models.policy import InsurerPolicy
        policy = db.query(InsurerPolicy).filter(InsurerPolicy.id == match.insurer_policy_id).first()
        is_policy_owner = policy and policy.insurer_id == current_user.id
    
    if not (is_deal_owner or is_policy_owner or current_user.role == UserRole.ADMIN):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    if not match.counter_offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No counter-offer for this match")
    
    return {
        "match_id": match.id,
        "deal_id": match.deal_id,
        "deal_name": deal.name,
        "status": match.status,
        "counter_offer": match.counter_offer,
        "counter_offer_at": match.counter_offer_at,
        "expires_at": match.counter_offer_expires_at,
        "is_expired": match.counter_offer_expires_at and match.counter_offer_expires_at < datetime.utcnow(),
        "borrower_response": match.borrower_response,
        "borrower_response_at": match.borrower_response_at,
        "borrower_response_notes": match.borrower_response_notes
    }
