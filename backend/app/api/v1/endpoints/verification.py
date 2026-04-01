"""
Verification API Endpoints

Loan officers can:
- View deals assigned for verification
- Create verification flags
- Mark deals as verified
- Request additional information
"""
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User, UserRole, LENDER_ROLES, LENDER_VERIFICATION_ROLES
from app.models.deal import Deal, DealMatch, DealRiskReport
from app.models.policy import LenderPolicy
from app.models.verification import (
    VerificationFlag, DealVerification, 
    FlagSeverity, FlagStatus, DealVerificationStatus
)
from app.services.audit import audit_service

router = APIRouter()


# Schemas
class CreateFlagRequest(BaseModel):
    deal_id: int
    match_id: Optional[int] = None
    field_name: str
    reported_value: Optional[str] = None
    expected_value: Optional[str] = None
    difference_description: Optional[str] = None
    severity: FlagSeverity = FlagSeverity.MEDIUM
    notes: Optional[str] = None


class ResolveFlagRequest(BaseModel):
    status: FlagStatus
    resolution_notes: Optional[str] = None


class FlagResponse(BaseModel):
    id: int
    deal_id: int
    match_id: Optional[int]
    field_name: str
    reported_value: Optional[str]
    expected_value: Optional[str]
    difference_description: Optional[str]
    severity: str
    status: str
    notes: Optional[str]
    flagged_by_name: str
    resolved_by_name: Optional[str]
    resolved_at: Optional[str]
    resolution_notes: Optional[str]
    created_at: str
    
    class Config:
        from_attributes = True


class VerificationChecklistUpdate(BaseModel):
    financials_verified: Optional[bool] = None
    documents_reviewed: Optional[bool] = None
    collateral_verified: Optional[bool] = None
    references_checked: Optional[bool] = None
    verification_notes: Optional[str] = None


class DealVerificationResponse(BaseModel):
    id: int
    deal_id: int
    deal_name: str
    match_id: Optional[int]
    status: str
    assigned_to_name: Optional[str]
    verified_by_name: Optional[str]
    verified_at: Optional[str]
    financials_verified: bool
    documents_reviewed: bool
    collateral_verified: bool
    references_checked: bool
    verification_notes: Optional[str]
    ready_for_committee: bool
    flag_count: int
    pending_flag_count: int
    
    class Config:
        from_attributes = True


class MarkVerifiedRequest(BaseModel):
    match_id: int
    verification_notes: Optional[str] = None


# Endpoints

@router.get("/my-deals")
def get_deals_for_verification(
    status_filter: Optional[str] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get deals assigned to this loan officer for verification.
    
    Loan officers see deals matched to their organization's policies.
    """
    if current_user.role not in LENDER_VERIFICATION_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only loan officers and lenders can access verification"
        )
    
    # Get the effective lender ID (org head for loan officers)
    lender_id = current_user.effective_lender_id
    
    # Get policy IDs for this lender
    policy_ids = [p.id for p in db.query(LenderPolicy).filter(
        LenderPolicy.lender_id == lender_id
    ).all()]
    
    if not policy_ids:
        return []
    
    # Get matches for these policies
    matches_query = db.query(DealMatch).filter(
        DealMatch.lender_policy_id.in_(policy_ids)
    )
    
    if status_filter:
        matches_query = matches_query.filter(DealMatch.status == status_filter)
    
    matches = matches_query.order_by(DealMatch.created_at.desc()).all()
    
    result = []
    for match in matches:
        deal = db.query(Deal).filter(Deal.id == match.deal_id).first()
        if not deal:
            continue
        
        # Get risk report
        risk_report = db.query(DealRiskReport).filter(
            DealRiskReport.deal_id == deal.id
        ).order_by(DealRiskReport.version.desc()).first()
        
        # Get verification status
        verification = db.query(DealVerification).filter(
            DealVerification.deal_id == deal.id,
            DealVerification.lender_id == lender_id
        ).first()
        
        # Count flags
        flag_count = db.query(VerificationFlag).filter(
            VerificationFlag.deal_id == deal.id
        ).count()
        pending_flags = db.query(VerificationFlag).filter(
            VerificationFlag.deal_id == deal.id,
            VerificationFlag.status == FlagStatus.PENDING
        ).count()
        
        borrower = db.query(User).filter(User.id == deal.borrower_id).first()
        
        result.append({
            "match_id": match.id,
            "deal_id": deal.id,
            "deal_name": deal.name,
            "borrower_name": borrower.full_name if borrower else "Unknown",
            "industry": deal.industry,
            "loan_amount_requested": deal.loan_amount_requested,
            "match_score": match.match_score,
            "match_status": match.status,
            "constraints_met": match.constraints_met,
            "constraints_failed": match.constraints_failed,
            "verification_status": verification.status.value if verification else "pending_review",
            "flag_count": flag_count,
            "pending_flag_count": pending_flags,
            "ready_for_committee": verification.ready_for_committee if verification else False,
            "risk_metrics": {
                "dscr_base": risk_report.dscr_base if risk_report else None,
                "dscr_stress": risk_report.dscr_stress if risk_report else None,
                "annual_pd": risk_report.annual_pd if risk_report else None,
                "ev_mid": risk_report.ev_mid if risk_report else None,
                "collateral_coverage": risk_report.collateral_coverage if risk_report else None,
                "leverage": risk_report.leverage if risk_report else None,
                "durability_score": risk_report.durability_score if risk_report else None,
            } if risk_report else None,
            "created_at": match.created_at.isoformat()
        })
    
    return result


@router.post("/flags", response_model=FlagResponse, status_code=status.HTTP_201_CREATED)
def create_flag(
    request: CreateFlagRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create a verification flag on a deal."""
    if current_user.role not in LENDER_VERIFICATION_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only loan officers and lenders can create flags"
        )
    
    # Verify deal exists and user has access
    deal = db.query(Deal).filter(Deal.id == request.deal_id).first()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    
    # Create flag
    flag = VerificationFlag(
        deal_id=request.deal_id,
        match_id=request.match_id,
        flagged_by_id=current_user.id,
        field_name=request.field_name,
        reported_value=request.reported_value,
        expected_value=request.expected_value,
        difference_description=request.difference_description,
        severity=request.severity,
        notes=request.notes
    )
    db.add(flag)
    
    # Update or create deal verification status
    lender_id = current_user.effective_lender_id
    verification = db.query(DealVerification).filter(
        DealVerification.deal_id == request.deal_id,
        DealVerification.lender_id == lender_id
    ).first()
    
    if not verification:
        verification = DealVerification(
            deal_id=request.deal_id,
            match_id=request.match_id,
            lender_id=lender_id,
            assigned_to_id=current_user.id,
            status=DealVerificationStatus.FLAGGED
        )
        db.add(verification)
    else:
        verification.status = DealVerificationStatus.FLAGGED
    
    db.commit()
    db.refresh(flag)
    
    audit_service.log(
        db=db,
        action="verification_flag_created",
        entity_type="deal",
        entity_id=request.deal_id,
        user_id=current_user.id,
        details={"field": request.field_name, "severity": request.severity.value}
    )
    
    return FlagResponse(
        id=flag.id,
        deal_id=flag.deal_id,
        match_id=flag.match_id,
        field_name=flag.field_name,
        reported_value=flag.reported_value,
        expected_value=flag.expected_value,
        difference_description=flag.difference_description,
        severity=flag.severity.value,
        status=flag.status.value,
        notes=flag.notes,
        flagged_by_name=current_user.full_name,
        resolved_by_name=None,
        resolved_at=None,
        resolution_notes=None,
        created_at=flag.created_at.isoformat()
    )


@router.get("/flags/{deal_id}", response_model=List[FlagResponse])
def get_deal_flags(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all verification flags for a deal."""
    if current_user.role not in LENDER_ROLES and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    flags = db.query(VerificationFlag).filter(
        VerificationFlag.deal_id == deal_id
    ).order_by(VerificationFlag.created_at.desc()).all()
    
    result = []
    for flag in flags:
        flagged_by = db.query(User).filter(User.id == flag.flagged_by_id).first()
        resolved_by = db.query(User).filter(User.id == flag.resolved_by_id).first() if flag.resolved_by_id else None
        
        result.append(FlagResponse(
            id=flag.id,
            deal_id=flag.deal_id,
            match_id=flag.match_id,
            field_name=flag.field_name,
            reported_value=flag.reported_value,
            expected_value=flag.expected_value,
            difference_description=flag.difference_description,
            severity=flag.severity.value,
            status=flag.status.value,
            notes=flag.notes,
            flagged_by_name=flagged_by.full_name if flagged_by else "Unknown",
            resolved_by_name=resolved_by.full_name if resolved_by else None,
            resolved_at=flag.resolved_at.isoformat() if flag.resolved_at else None,
            resolution_notes=flag.resolution_notes,
            created_at=flag.created_at.isoformat()
        ))
    
    return result


@router.put("/flags/{flag_id}/resolve")
def resolve_flag(
    flag_id: int,
    request: ResolveFlagRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Resolve or dismiss a verification flag."""
    if current_user.role not in LENDER_ROLES and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    flag = db.query(VerificationFlag).filter(VerificationFlag.id == flag_id).first()
    if not flag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flag not found")
    
    flag.status = request.status
    flag.resolved_by_id = current_user.id
    flag.resolved_at = datetime.utcnow()
    flag.resolution_notes = request.resolution_notes
    
    db.commit()
    
    return {"message": f"Flag {request.status.value}"}


@router.post("/mark-verified")
def mark_deal_verified(
    request: MarkVerifiedRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Mark a deal as verified and ready for Credit Committee review.
    
    This updates the verification status and optionally the match notes.
    """
    if current_user.role not in LENDER_VERIFICATION_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only loan officers and lenders can verify deals"
        )
    
    match = db.query(DealMatch).filter(DealMatch.id == request.match_id).first()
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")
    
    deal = db.query(Deal).filter(Deal.id == match.deal_id).first()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    
    lender_id = current_user.effective_lender_id
    
    # Update or create verification record
    verification = db.query(DealVerification).filter(
        DealVerification.deal_id == deal.id,
        DealVerification.lender_id == lender_id
    ).first()
    
    if not verification:
        verification = DealVerification(
            deal_id=deal.id,
            match_id=match.id,
            lender_id=lender_id
        )
        db.add(verification)
    
    verification.status = DealVerificationStatus.VERIFIED
    verification.verified_by_id = current_user.id
    verification.verified_at = datetime.utcnow()
    verification.verification_notes = request.verification_notes
    verification.ready_for_committee = True
    verification.financials_verified = True
    verification.documents_reviewed = True
    
    # Add note to match for credit committee visibility
    verification_note = f"[VERIFIED] by {current_user.full_name} on {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}. {request.verification_notes or ''}"
    if match.decision_notes:
        match.decision_notes = f"{verification_note}\n---\n{match.decision_notes}"
    else:
        match.decision_notes = verification_note
    
    db.commit()
    
    audit_service.log(
        db=db,
        action="deal_verified",
        entity_type="deal",
        entity_id=deal.id,
        user_id=current_user.id,
        details={"match_id": match.id, "notes": request.verification_notes}
    )
    
    return {
        "message": "Deal verified and ready for Credit Committee review",
        "deal_id": deal.id,
        "match_id": match.id,
        "verified_by": current_user.full_name,
        "verified_at": verification.verified_at.isoformat()
    }


@router.put("/checklist/{deal_id}")
def update_verification_checklist(
    deal_id: int,
    request: VerificationChecklistUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update the verification checklist for a deal."""
    if current_user.role not in LENDER_VERIFICATION_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    lender_id = current_user.effective_lender_id
    
    verification = db.query(DealVerification).filter(
        DealVerification.deal_id == deal_id,
        DealVerification.lender_id == lender_id
    ).first()
    
    if not verification:
        verification = DealVerification(
            deal_id=deal_id,
            lender_id=lender_id,
            assigned_to_id=current_user.id,
            status=DealVerificationStatus.IN_REVIEW
        )
        db.add(verification)
    
    if request.financials_verified is not None:
        verification.financials_verified = request.financials_verified
    if request.documents_reviewed is not None:
        verification.documents_reviewed = request.documents_reviewed
    if request.collateral_verified is not None:
        verification.collateral_verified = request.collateral_verified
    if request.references_checked is not None:
        verification.references_checked = request.references_checked
    if request.verification_notes is not None:
        verification.verification_notes = request.verification_notes
    
    # Update status based on completion
    if verification.status == DealVerificationStatus.PENDING_REVIEW:
        verification.status = DealVerificationStatus.IN_REVIEW
    
    db.commit()
    
    return {"message": "Checklist updated"}


@router.get("/status/{deal_id}")
def get_verification_status(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get verification status for a deal from this lender's perspective."""
    if current_user.role not in LENDER_ROLES and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    lender_id = current_user.effective_lender_id
    
    verification = db.query(DealVerification).filter(
        DealVerification.deal_id == deal_id,
        DealVerification.lender_id == lender_id
    ).first()
    
    flags = db.query(VerificationFlag).filter(
        VerificationFlag.deal_id == deal_id
    ).all()
    
    pending_flags = [f for f in flags if f.status == FlagStatus.PENDING]
    
    if not verification:
        return {
            "status": "pending_review",
            "financials_verified": False,
            "documents_reviewed": False,
            "collateral_verified": False,
            "references_checked": False,
            "ready_for_committee": False,
            "flag_count": len(flags),
            "pending_flag_count": len(pending_flags),
            "verified_by": None,
            "verified_at": None
        }
    
    verified_by = db.query(User).filter(User.id == verification.verified_by_id).first() if verification.verified_by_id else None
    
    return {
        "status": verification.status.value,
        "financials_verified": verification.financials_verified,
        "documents_reviewed": verification.documents_reviewed,
        "collateral_verified": verification.collateral_verified,
        "references_checked": verification.references_checked,
        "ready_for_committee": verification.ready_for_committee,
        "verification_notes": verification.verification_notes,
        "flag_count": len(flags),
        "pending_flag_count": len(pending_flags),
        "verified_by": verified_by.full_name if verified_by else None,
        "verified_at": verification.verified_at.isoformat() if verification.verified_at else None
    }
