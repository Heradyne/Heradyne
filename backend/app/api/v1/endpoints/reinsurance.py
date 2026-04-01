"""
Reinsurance API Endpoints

Insurers can:
- View their insured deals
- Create reinsurance pools from selected deals
- Analyze pool risk characteristics
- Offer pools to the reinsurance market
- Manage offers from reinsurers
"""
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_active_user, require_insurer
from app.models.user import User, UserRole
from app.models.executed_loan import ExecutedLoan, LoanStatus
from app.models.deal import Deal, DealRiskReport
from app.models.reinsurance import (
    ReinsurancePool, ReinsuranceOffer, 
    ReinsurancePoolStatus, ReinsuranceOfferStatus
)
from app.services.audit import audit_service

router = APIRouter()


# Schemas
class InsuredDealResponse(BaseModel):
    id: int
    deal_id: int
    deal_name: str
    borrower_name: str
    industry: str
    state: Optional[str]
    loan_amount: float
    guarantee_percentage: float
    guaranteed_amount: float
    premium_rate: float
    annual_premium: float
    probability_of_default: float
    expected_loss: float
    status: str
    origination_date: str


class CreatePoolRequest(BaseModel):
    name: str
    description: Optional[str] = None
    deal_ids: List[int]
    cession_percentage: float = 50.0


class OfferPoolRequest(BaseModel):
    asking_price: float
    cession_percentage: Optional[float] = None
    notes: Optional[str] = None


class PoolResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    status: str
    deal_ids: List[int]
    cession_percentage: float
    asking_price: Optional[float]
    total_exposure: float
    total_premium: float
    weighted_pd: float
    expected_loss: float
    industry_distribution: Optional[dict]
    geographic_distribution: Optional[dict]
    created_at: str
    
    class Config:
        from_attributes = True


class MakeOfferRequest(BaseModel):
    offered_price: float
    offered_cession_pct: Optional[float] = None
    notes: Optional[str] = None


class OfferResponse(BaseModel):
    id: int
    pool_id: int
    pool_name: str
    reinsurer_name: str
    status: str
    offered_price: float
    offered_cession_pct: Optional[float]
    notes: Optional[str]
    response_notes: Optional[str]
    created_at: str
    
    class Config:
        from_attributes = True


# Helper functions
def calculate_pool_analytics(db: Session, deal_ids: List[int], insurer_id: int) -> dict:
    """Calculate analytics for a set of deals."""
    loans = db.query(ExecutedLoan).filter(
        ExecutedLoan.id.in_(deal_ids),
        ExecutedLoan.insurer_id == insurer_id
    ).all()
    
    if not loans:
        return {
            "total_exposure": 0,
            "total_premium": 0,
            "weighted_pd": 0,
            "expected_loss": 0,
            "industry_distribution": {},
            "geographic_distribution": {},
        }
    
    total_exposure = sum(l.principal_amount * (l.guarantee_percentage or 0) / 100 for l in loans)
    total_premium = sum(l.principal_amount * (l.premium_rate or 0) / 100 for l in loans)
    
    # Get risk reports for PD calculation
    weighted_pd = 0
    expected_loss = 0
    industry_dist = {}
    geo_dist = {}
    
    for loan in loans:
        guaranteed_amount = loan.principal_amount * (loan.guarantee_percentage or 0) / 100
        
        # Get risk report for PD
        risk_report = db.query(DealRiskReport).filter(
            DealRiskReport.deal_id == loan.deal_id
        ).order_by(DealRiskReport.version.desc()).first()
        
        pd = risk_report.annual_pd if risk_report else 0.05
        lgd = 0.45  # Standard assumption
        
        weighted_pd += pd * guaranteed_amount
        expected_loss += pd * lgd * guaranteed_amount
        
        # Industry distribution
        industry = loan.industry or "Unknown"
        industry_dist[industry] = industry_dist.get(industry, 0) + guaranteed_amount
        
        # Geographic distribution
        state = loan.state or "Unknown"
        geo_dist[state] = geo_dist.get(state, 0) + guaranteed_amount
    
    if total_exposure > 0:
        weighted_pd /= total_exposure
    
    return {
        "total_exposure": total_exposure,
        "total_premium": total_premium,
        "weighted_pd": weighted_pd,
        "expected_loss": expected_loss,
        "industry_distribution": industry_dist,
        "geographic_distribution": geo_dist,
    }


# Endpoints

@router.get("/insured-deals", response_model=List[InsuredDealResponse])
def get_insured_deals(
    current_user: User = Depends(require_insurer),
    db: Session = Depends(get_db)
):
    """Get all deals insured by this insurer."""
    loans = db.query(ExecutedLoan).filter(
        ExecutedLoan.insurer_id == current_user.id,
        ExecutedLoan.guarantee_percentage > 0,
        ExecutedLoan.status.in_([LoanStatus.ACTIVE, LoanStatus.CURRENT])
    ).all()
    
    result = []
    for loan in loans:
        deal = db.query(Deal).filter(Deal.id == loan.deal_id).first()
        borrower = db.query(User).filter(User.id == loan.borrower_id).first()
        
        # Get risk report for PD
        risk_report = db.query(DealRiskReport).filter(
            DealRiskReport.deal_id == loan.deal_id
        ).order_by(DealRiskReport.version.desc()).first()
        
        pd = risk_report.annual_pd if risk_report else 0.05
        guaranteed_amount = loan.principal_amount * (loan.guarantee_percentage or 0) / 100
        annual_premium = loan.principal_amount * (loan.premium_rate or 0) / 100
        expected_loss = pd * 0.45 * guaranteed_amount  # LGD = 45%
        
        result.append(InsuredDealResponse(
            id=loan.id,
            deal_id=loan.deal_id,
            deal_name=deal.name if deal else f"Loan #{loan.loan_number}",
            borrower_name=borrower.full_name if borrower else "Unknown",
            industry=loan.industry or (deal.industry if deal else "Unknown"),
            state=loan.state,
            loan_amount=loan.principal_amount,
            guarantee_percentage=loan.guarantee_percentage or 0,
            guaranteed_amount=guaranteed_amount,
            premium_rate=loan.premium_rate or 0,
            annual_premium=annual_premium,
            probability_of_default=pd,
            expected_loss=expected_loss,
            status=loan.status.value,
            origination_date=loan.origination_date.isoformat() if loan.origination_date else ""
        ))
    
    return result


@router.get("/pools", response_model=List[PoolResponse])
def get_reinsurance_pools(
    current_user: User = Depends(require_insurer),
    db: Session = Depends(get_db)
):
    """Get all reinsurance pools for this insurer."""
    pools = db.query(ReinsurancePool).filter(
        ReinsurancePool.insurer_id == current_user.id
    ).order_by(ReinsurancePool.created_at.desc()).all()
    
    return [
        PoolResponse(
            id=p.id,
            name=p.name,
            description=p.description,
            status=p.status.value,
            deal_ids=p.deal_ids or [],
            cession_percentage=p.cession_percentage,
            asking_price=p.asking_price,
            total_exposure=p.total_exposure,
            total_premium=p.total_premium,
            weighted_pd=p.weighted_pd,
            expected_loss=p.expected_loss,
            industry_distribution=p.industry_distribution,
            geographic_distribution=p.geographic_distribution,
            created_at=p.created_at.isoformat()
        ) for p in pools
    ]


@router.post("/pools", response_model=PoolResponse, status_code=status.HTTP_201_CREATED)
def create_reinsurance_pool(
    request: CreatePoolRequest,
    current_user: User = Depends(require_insurer),
    db: Session = Depends(get_db)
):
    """Create a new reinsurance pool from selected deals."""
    if not request.deal_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must select at least one deal"
        )
    
    # Verify all deals belong to this insurer
    valid_loans = db.query(ExecutedLoan).filter(
        ExecutedLoan.id.in_(request.deal_ids),
        ExecutedLoan.insurer_id == current_user.id
    ).all()
    
    if len(valid_loans) != len(request.deal_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Some deals are not valid or don't belong to you"
        )
    
    # Calculate analytics
    analytics = calculate_pool_analytics(db, request.deal_ids, current_user.id)
    
    pool = ReinsurancePool(
        insurer_id=current_user.id,
        name=request.name,
        description=request.description,
        deal_ids=request.deal_ids,
        cession_percentage=request.cession_percentage,
        total_exposure=analytics["total_exposure"],
        total_premium=analytics["total_premium"],
        weighted_pd=analytics["weighted_pd"],
        expected_loss=analytics["expected_loss"],
        industry_distribution=analytics["industry_distribution"],
        geographic_distribution=analytics["geographic_distribution"],
    )
    db.add(pool)
    db.commit()
    db.refresh(pool)
    
    audit_service.log(
        db=db,
        action="reinsurance_pool_created",
        entity_type="reinsurance_pool",
        entity_id=pool.id,
        user_id=current_user.id,
        details={"name": pool.name, "deal_count": len(request.deal_ids)}
    )
    
    return PoolResponse(
        id=pool.id,
        name=pool.name,
        description=pool.description,
        status=pool.status.value,
        deal_ids=pool.deal_ids,
        cession_percentage=pool.cession_percentage,
        asking_price=pool.asking_price,
        total_exposure=pool.total_exposure,
        total_premium=pool.total_premium,
        weighted_pd=pool.weighted_pd,
        expected_loss=pool.expected_loss,
        industry_distribution=pool.industry_distribution,
        geographic_distribution=pool.geographic_distribution,
        created_at=pool.created_at.isoformat()
    )


@router.get("/pools/{pool_id}", response_model=PoolResponse)
def get_pool_details(
    pool_id: int,
    current_user: User = Depends(require_insurer),
    db: Session = Depends(get_db)
):
    """Get details of a specific pool."""
    pool = db.query(ReinsurancePool).filter(
        ReinsurancePool.id == pool_id,
        ReinsurancePool.insurer_id == current_user.id
    ).first()
    
    if not pool:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pool not found")
    
    return PoolResponse(
        id=pool.id,
        name=pool.name,
        description=pool.description,
        status=pool.status.value,
        deal_ids=pool.deal_ids,
        cession_percentage=pool.cession_percentage,
        asking_price=pool.asking_price,
        total_exposure=pool.total_exposure,
        total_premium=pool.total_premium,
        weighted_pd=pool.weighted_pd,
        expected_loss=pool.expected_loss,
        industry_distribution=pool.industry_distribution,
        geographic_distribution=pool.geographic_distribution,
        created_at=pool.created_at.isoformat()
    )


@router.post("/pools/{pool_id}/offer")
def offer_pool_to_market(
    pool_id: int,
    request: OfferPoolRequest,
    current_user: User = Depends(require_insurer),
    db: Session = Depends(get_db)
):
    """Offer a pool to the reinsurance market."""
    pool = db.query(ReinsurancePool).filter(
        ReinsurancePool.id == pool_id,
        ReinsurancePool.insurer_id == current_user.id
    ).first()
    
    if not pool:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pool not found")
    
    if pool.status != ReinsurancePoolStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only draft pools can be offered"
        )
    
    pool.status = ReinsurancePoolStatus.OFFERED
    pool.asking_price = request.asking_price
    if request.cession_percentage:
        pool.cession_percentage = request.cession_percentage
    pool.offered_at = datetime.utcnow()
    
    db.commit()
    
    audit_service.log(
        db=db,
        action="reinsurance_pool_offered",
        entity_type="reinsurance_pool",
        entity_id=pool.id,
        user_id=current_user.id,
        details={"asking_price": request.asking_price}
    )
    
    return {"message": "Pool offered to market", "pool_id": pool.id}


@router.delete("/pools/{pool_id}")
def delete_pool(
    pool_id: int,
    current_user: User = Depends(require_insurer),
    db: Session = Depends(get_db)
):
    """Delete a draft pool."""
    pool = db.query(ReinsurancePool).filter(
        ReinsurancePool.id == pool_id,
        ReinsurancePool.insurer_id == current_user.id
    ).first()
    
    if not pool:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pool not found")
    
    if pool.status != ReinsurancePoolStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only draft pools can be deleted"
        )
    
    db.delete(pool)
    db.commit()
    
    return {"message": "Pool deleted"}


# Market endpoints (for reinsurers to browse and make offers)

@router.get("/market")
def get_market_pools(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get pools available in the reinsurance market."""
    if current_user.role != UserRole.INSURER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    # Get pools offered by OTHER insurers
    pools = db.query(ReinsurancePool).filter(
        ReinsurancePool.status == ReinsurancePoolStatus.OFFERED,
        ReinsurancePool.insurer_id != current_user.id
    ).all()
    
    result = []
    for pool in pools:
        insurer = db.query(User).filter(User.id == pool.insurer_id).first()
        result.append({
            "id": pool.id,
            "name": pool.name,
            "description": pool.description,
            "insurer_name": insurer.company_name if insurer else "Unknown",
            "deal_count": len(pool.deal_ids),
            "total_exposure": pool.total_exposure,
            "total_premium": pool.total_premium,
            "weighted_pd": pool.weighted_pd,
            "expected_loss": pool.expected_loss,
            "cession_percentage": pool.cession_percentage,
            "asking_price": pool.asking_price,
            "industry_distribution": pool.industry_distribution,
            "geographic_distribution": pool.geographic_distribution,
            "offered_at": pool.offered_at.isoformat() if pool.offered_at else None,
        })
    
    return result


@router.post("/market/{pool_id}/offer")
def make_offer_on_pool(
    pool_id: int,
    request: MakeOfferRequest,
    current_user: User = Depends(require_insurer),
    db: Session = Depends(get_db)
):
    """Make an offer to buy a pool from another insurer."""
    pool = db.query(ReinsurancePool).filter(
        ReinsurancePool.id == pool_id,
        ReinsurancePool.status == ReinsurancePoolStatus.OFFERED
    ).first()
    
    if not pool:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pool not found or not available")
    
    if pool.insurer_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot make offer on your own pool"
        )
    
    offer = ReinsuranceOffer(
        pool_id=pool_id,
        reinsurer_id=current_user.id,
        offered_price=request.offered_price,
        offered_cession_pct=request.offered_cession_pct,
        notes=request.notes,
    )
    db.add(offer)
    db.commit()
    db.refresh(offer)
    
    audit_service.log(
        db=db,
        action="reinsurance_offer_made",
        entity_type="reinsurance_offer",
        entity_id=offer.id,
        user_id=current_user.id,
        details={"pool_id": pool_id, "offered_price": request.offered_price}
    )
    
    return {"message": "Offer submitted", "offer_id": offer.id}


@router.get("/offers/received", response_model=List[OfferResponse])
def get_received_offers(
    current_user: User = Depends(require_insurer),
    db: Session = Depends(get_db)
):
    """Get offers received on your pools."""
    pools = db.query(ReinsurancePool).filter(
        ReinsurancePool.insurer_id == current_user.id
    ).all()
    pool_ids = [p.id for p in pools]
    
    offers = db.query(ReinsuranceOffer).filter(
        ReinsuranceOffer.pool_id.in_(pool_ids)
    ).order_by(ReinsuranceOffer.created_at.desc()).all()
    
    result = []
    for offer in offers:
        pool = next((p for p in pools if p.id == offer.pool_id), None)
        reinsurer = db.query(User).filter(User.id == offer.reinsurer_id).first()
        result.append(OfferResponse(
            id=offer.id,
            pool_id=offer.pool_id,
            pool_name=pool.name if pool else "Unknown",
            reinsurer_name=reinsurer.company_name if reinsurer else "Unknown",
            status=offer.status.value,
            offered_price=offer.offered_price,
            offered_cession_pct=offer.offered_cession_pct,
            notes=offer.notes,
            response_notes=offer.response_notes,
            created_at=offer.created_at.isoformat()
        ))
    
    return result


@router.put("/offers/{offer_id}/accept")
def accept_offer(
    offer_id: int,
    current_user: User = Depends(require_insurer),
    db: Session = Depends(get_db)
):
    """Accept an offer on your pool."""
    offer = db.query(ReinsuranceOffer).filter(ReinsuranceOffer.id == offer_id).first()
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    
    pool = db.query(ReinsurancePool).filter(ReinsurancePool.id == offer.pool_id).first()
    if not pool or pool.insurer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your pool")
    
    # Accept the offer
    offer.status = ReinsuranceOfferStatus.ACCEPTED
    offer.responded_at = datetime.utcnow()
    
    # Update pool
    pool.status = ReinsurancePoolStatus.SOLD
    pool.sold_at = datetime.utcnow()
    pool.sold_to_id = offer.reinsurer_id
    pool.sale_price = offer.offered_price
    
    # Reject other offers
    db.query(ReinsuranceOffer).filter(
        ReinsuranceOffer.pool_id == pool.id,
        ReinsuranceOffer.id != offer_id,
        ReinsuranceOffer.status == ReinsuranceOfferStatus.PENDING
    ).update({"status": ReinsuranceOfferStatus.REJECTED})
    
    db.commit()
    
    return {"message": "Offer accepted", "sale_price": offer.offered_price}


@router.put("/offers/{offer_id}/reject")
def reject_offer(
    offer_id: int,
    response_notes: Optional[str] = None,
    current_user: User = Depends(require_insurer),
    db: Session = Depends(get_db)
):
    """Reject an offer on your pool."""
    offer = db.query(ReinsuranceOffer).filter(ReinsuranceOffer.id == offer_id).first()
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    
    pool = db.query(ReinsurancePool).filter(ReinsurancePool.id == offer.pool_id).first()
    if not pool or pool.insurer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your pool")
    
    offer.status = ReinsuranceOfferStatus.REJECTED
    offer.response_notes = response_notes
    offer.responded_at = datetime.utcnow()
    
    db.commit()
    
    return {"message": "Offer rejected"}
