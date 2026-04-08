from typing import List, Optional
from datetime import datetime, timedelta
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User, UserRole
from app.models.executed_loan import ExecutedLoan, LoanStatus
from app.models.secondary_market import (
    SecondaryListing, SecondaryOffer, ParticipationRecord, RiskTransferRecord,
    ListingStatus, ListingType, OfferStatus
)
from app.schemas.secondary_market import (
    SecondaryListingCreate, SecondaryListingUpdate, SecondaryListingResponse,
    SecondaryOfferCreate, SecondaryOfferResponse, OfferResponseAction,
    ParticipationRecordResponse, RiskTransferRecordResponse, SecondaryMarketStats
)
from app.services.audit import audit_service

router = APIRouter()
log = logging.getLogger("heradyne.secondary_market")


# ============ Listings ============

@router.get("/listings", response_model=List[SecondaryListingResponse])
def list_secondary_listings(
    listing_type: Optional[str] = Query(None, description="Filter by type: loan_participation, whole_loan, risk_transfer"),
    status_filter: Optional[str] = Query(None, description="Filter by status"),
    min_price: Optional[float] = Query(None),
    max_price: Optional[float] = Query(None),
    industry: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    my_listings: bool = Query(False, description="Show only my listings"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """List secondary market listings."""
    
    query = db.query(SecondaryListing)
    
    # By default, show active listings to all, or all statuses for own listings
    if my_listings:
        query = query.filter(SecondaryListing.seller_id == current_user.id)
    else:
        if not status_filter:
            query = query.filter(SecondaryListing.status == ListingStatus.ACTIVE)
    
    # Apply filters
    if listing_type:
        query = query.filter(SecondaryListing.listing_type == listing_type)
    if status_filter:
        query = query.filter(SecondaryListing.status == status_filter)
    if min_price:
        query = query.filter(SecondaryListing.asking_price >= min_price)
    if max_price:
        query = query.filter(SecondaryListing.asking_price <= max_price)
    
    # Filter by loan attributes
    if industry or state:
        query = query.join(ExecutedLoan, SecondaryListing.loan_id == ExecutedLoan.id)
        if industry:
            query = query.filter(ExecutedLoan.industry == industry)
        if state:
            query = query.filter(ExecutedLoan.state == state)
    
    listings = query.order_by(SecondaryListing.listed_date.desc()).all()
    
    # Enrich with related data
    result = []
    for listing in listings:
        listing_dict = {
            "id": listing.id,
            "seller_id": listing.seller_id,
            "listing_type": listing.listing_type.value if hasattr(listing.listing_type, 'value') else listing.listing_type,
            "loan_id": listing.loan_id,
            "title": listing.title,
            "description": listing.description,
            "participation_percentage": listing.participation_percentage,
            "principal_amount": listing.principal_amount,
            "risk_percentage": listing.risk_percentage,
            "premium_share": listing.premium_share,
            "asking_price": listing.asking_price,
            "implied_yield": listing.implied_yield,
            "remaining_term_months": listing.remaining_term_months,
            "status": listing.status.value if hasattr(listing.status, 'value') else listing.status,
            "listed_date": listing.listed_date,
            "expiry_date": listing.expiry_date,
            "sold_date": listing.sold_date,
            "buyer_id": listing.buyer_id,
            "final_price": listing.final_price,
            "created_at": listing.created_at,
        }
        
        # Add seller/buyer names
        seller = db.query(User).filter(User.id == listing.seller_id).first()
        listing_dict["seller_name"] = seller.full_name if seller else None
        
        if listing.buyer_id:
            buyer = db.query(User).filter(User.id == listing.buyer_id).first()
            listing_dict["buyer_name"] = buyer.full_name if buyer else None
        
        # Add loan details
        if listing.loan_id:
            loan = db.query(ExecutedLoan).filter(ExecutedLoan.id == listing.loan_id).first()
            if loan:
                listing_dict["loan_number"] = loan.loan_number
                listing_dict["loan_industry"] = loan.industry
                listing_dict["loan_state"] = loan.state
                listing_dict["original_principal"] = loan.principal_amount
                listing_dict["current_balance"] = loan.current_principal_balance
                listing_dict["interest_rate"] = loan.interest_rate
        
        # Add offer count
        listing_dict["offer_count"] = db.query(SecondaryOffer).filter(
            SecondaryOffer.listing_id == listing.id,
            SecondaryOffer.status == OfferStatus.PENDING
        ).count()
        
        result.append(SecondaryListingResponse(**listing_dict))
    
    return result


@router.get("/listings/{listing_id}", response_model=SecondaryListingResponse)
def get_listing(
    listing_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get a specific listing."""
    listing = db.query(SecondaryListing).filter(SecondaryListing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")
    
    # Build response with enriched data
    listing_dict = {
        "id": listing.id,
        "seller_id": listing.seller_id,
        "listing_type": listing.listing_type.value if hasattr(listing.listing_type, 'value') else listing.listing_type,
        "loan_id": listing.loan_id,
        "title": listing.title,
        "description": listing.description,
        "participation_percentage": listing.participation_percentage,
        "principal_amount": listing.principal_amount,
        "risk_percentage": listing.risk_percentage,
        "premium_share": listing.premium_share,
        "asking_price": listing.asking_price,
        "implied_yield": listing.implied_yield,
        "remaining_term_months": listing.remaining_term_months,
        "status": listing.status.value if hasattr(listing.status, 'value') else listing.status,
        "listed_date": listing.listed_date,
        "expiry_date": listing.expiry_date,
        "sold_date": listing.sold_date,
        "buyer_id": listing.buyer_id,
        "final_price": listing.final_price,
        "created_at": listing.created_at,
    }
    
    seller = db.query(User).filter(User.id == listing.seller_id).first()
    listing_dict["seller_name"] = seller.full_name if seller else None
    
    if listing.buyer_id:
        buyer = db.query(User).filter(User.id == listing.buyer_id).first()
        listing_dict["buyer_name"] = buyer.full_name if buyer else None
    
    if listing.loan_id:
        loan = db.query(ExecutedLoan).filter(ExecutedLoan.id == listing.loan_id).first()
        if loan:
            listing_dict["loan_number"] = loan.loan_number
            listing_dict["loan_industry"] = loan.industry
            listing_dict["loan_state"] = loan.state
            listing_dict["original_principal"] = loan.principal_amount
            listing_dict["current_balance"] = loan.current_principal_balance
            listing_dict["interest_rate"] = loan.interest_rate
    
    listing_dict["offer_count"] = db.query(SecondaryOffer).filter(
        SecondaryOffer.listing_id == listing.id,
        SecondaryOffer.status == OfferStatus.PENDING
    ).count()
    
    return SecondaryListingResponse(**listing_dict)


@router.post("/listings", response_model=SecondaryListingResponse, status_code=status.HTTP_201_CREATED)
def create_listing(
    listing_data: SecondaryListingCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create a new secondary market listing."""
    
    # Validate user role matches listing type
    if listing_data.listing_type in ["loan_participation", "whole_loan"]:
        if current_user.role != UserRole.LENDER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail="Only lenders can list loan participations"
            )
    elif listing_data.listing_type == "risk_transfer":
        if current_user.role != UserRole.INSURER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail="Only insurers can list risk transfers"
            )
    
    # Validate loan ownership
    loan = db.query(ExecutedLoan).filter(ExecutedLoan.id == listing_data.loan_id).first()
    if not loan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Loan not found")
    
    if listing_data.listing_type in ["loan_participation", "whole_loan"]:
        if loan.lender_id != current_user.id:
            # Check if user has participation
            participation = db.query(ParticipationRecord).filter(
                ParticipationRecord.loan_id == loan.id,
                ParticipationRecord.owner_id == current_user.id,
                ParticipationRecord.is_active == True
            ).first()
            if not participation:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN, 
                    detail="You don't own this loan or any participation in it"
                )
    elif listing_data.listing_type == "risk_transfer":
        if loan.insurer_id != current_user.id:
            # Check if user has risk transfer
            risk_record = db.query(RiskTransferRecord).filter(
                RiskTransferRecord.loan_id == loan.id,
                RiskTransferRecord.insurer_id == current_user.id,
                RiskTransferRecord.is_active == True
            ).first()
            if not risk_record:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN, 
                    detail="You don't hold risk on this loan"
                )
    
    # Calculate remaining term
    if loan.maturity_date:
        from datetime import date
        remaining_days = (loan.maturity_date - date.today()).days
        remaining_months = max(0, remaining_days // 30)
    else:
        remaining_months = listing_data.remaining_term_months
    
    listing = SecondaryListing(
        seller_id=current_user.id,
        listing_type=listing_data.listing_type,
        loan_id=listing_data.loan_id,
        title=listing_data.title,
        description=listing_data.description,
        participation_percentage=listing_data.participation_percentage,
        principal_amount=listing_data.principal_amount,
        risk_percentage=listing_data.risk_percentage,
        premium_share=listing_data.premium_share,
        asking_price=listing_data.asking_price,
        minimum_price=listing_data.minimum_price,
        implied_yield=listing_data.implied_yield,
        remaining_term_months=remaining_months,
        expiry_date=listing_data.expiry_date,
        status=ListingStatus.ACTIVE
    )
    
    db.add(listing)
    db.commit()
    db.refresh(listing)
    
    audit_service.log(
        db=db, action="listing_created", entity_type="secondary_listing",
        entity_id=listing.id, user_id=current_user.id,
        details={"listing_type": listing_data.listing_type, "asking_price": listing_data.asking_price}
    )
    
    return get_listing(listing.id, current_user, db)


@router.put("/listings/{listing_id}", response_model=SecondaryListingResponse)
def update_listing(
    listing_id: int,
    listing_data: SecondaryListingUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update a listing."""
    listing = db.query(SecondaryListing).filter(SecondaryListing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")
    
    if listing.seller_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    if listing.status not in [ListingStatus.ACTIVE, ListingStatus.PENDING]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot update sold/cancelled listing")
    
    update_data = listing_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(listing, field, value)
    
    db.commit()
    db.refresh(listing)
    
    return get_listing(listing_id, current_user, db)


@router.delete("/listings/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_listing(
    listing_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Cancel a listing."""
    listing = db.query(SecondaryListing).filter(SecondaryListing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")
    
    if listing.seller_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    if listing.status == ListingStatus.SOLD:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot cancel sold listing")
    
    listing.status = ListingStatus.CANCELLED
    
    # Reject all pending offers
    for offer in listing.offers:
        if offer.status == OfferStatus.PENDING:
            offer.status = OfferStatus.REJECTED
            offer.seller_message = "Listing cancelled by seller"
            offer.response_date = datetime.utcnow()
    
    db.commit()
    
    audit_service.log(
        db=db, action="listing_cancelled", entity_type="secondary_listing",
        entity_id=listing_id, user_id=current_user.id
    )


# ============ Offers ============

@router.get("/listings/{listing_id}/offers", response_model=List[SecondaryOfferResponse])
def list_offers(
    listing_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """List offers on a listing (seller only)."""
    listing = db.query(SecondaryListing).filter(SecondaryListing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")
    
    if listing.seller_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only seller can view offers")
    
    offers = db.query(SecondaryOffer).filter(SecondaryOffer.listing_id == listing_id).order_by(SecondaryOffer.offer_date.desc()).all()
    
    result = []
    for offer in offers:
        offer_dict = {
            "id": offer.id,
            "listing_id": offer.listing_id,
            "buyer_id": offer.buyer_id,
            "offer_price": offer.offer_price,
            "message": offer.message,
            "status": offer.status.value if hasattr(offer.status, 'value') else offer.status,
            "offer_date": offer.offer_date,
            "expiry_date": offer.expiry_date,
            "response_date": offer.response_date,
            "seller_message": offer.seller_message,
            "created_at": offer.created_at,
            "listing_title": listing.title,
        }
        
        buyer = db.query(User).filter(User.id == offer.buyer_id).first()
        offer_dict["buyer_name"] = buyer.full_name if buyer else None
        
        result.append(SecondaryOfferResponse(**offer_dict))
    
    return result


@router.post("/listings/{listing_id}/offers", response_model=SecondaryOfferResponse, status_code=status.HTTP_201_CREATED)
def create_offer(
    listing_id: int,
    offer_data: SecondaryOfferCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Make an offer on a listing."""
    try:
        listing = db.query(SecondaryListing).filter(SecondaryListing.id == listing_id).first()
        if not listing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")
        
        if listing.status != ListingStatus.ACTIVE:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Listing is not active")
        
        if listing.seller_id == current_user.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot make offer on own listing")
        
        # Validate buyer role
        if listing.listing_type in [ListingType.LOAN_PARTICIPATION, ListingType.WHOLE_LOAN]:
            if current_user.role != UserRole.LENDER:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only lenders can buy loan participations")
        elif listing.listing_type == ListingType.RISK_TRANSFER:
            if current_user.role != UserRole.INSURER:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only insurers can buy risk transfers")
        
        # Check for existing pending offer
        existing = db.query(SecondaryOffer).filter(
            SecondaryOffer.listing_id == listing_id,
            SecondaryOffer.buyer_id == current_user.id,
            SecondaryOffer.status == OfferStatus.PENDING
        ).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You already have a pending offer")
        
        offer = SecondaryOffer(
            listing_id=listing_id,
            buyer_id=current_user.id,
            offer_price=offer_data.offer_price,
            message=offer_data.message,
            expiry_date=offer_data.expiry_date,
            status=OfferStatus.PENDING
        )
        
        db.add(offer)
        
        # Update listing status
        listing.status = ListingStatus.PENDING
        
        db.commit()
        db.refresh(offer)
        
        audit_service.log(
            db=db, action="offer_created", entity_type="secondary_offer",
            entity_id=offer.id, user_id=current_user.id,
            details={"listing_id": listing_id, "offer_price": offer_data.offer_price}
        )
        
        return SecondaryOfferResponse(
            id=offer.id,
            listing_id=offer.listing_id,
            buyer_id=offer.buyer_id,
            offer_price=offer.offer_price,
            message=offer.message,
            status=offer.status.value,
            offer_date=offer.offer_date,
            expiry_date=offer.expiry_date,
            response_date=offer.response_date,
            seller_message=offer.seller_message,
            created_at=offer.created_at,
            buyer_name=current_user.full_name,
            listing_title=listing.title
        )
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Error creating offer: {e}")
        import traceback
        traceback.print_exc()
        log.error(f"Internal error: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again.")


@router.post("/offers/{offer_id}/respond", response_model=SecondaryOfferResponse)
def respond_to_offer(
    offer_id: int,
    response: OfferResponseAction,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Accept or reject an offer (seller only)."""
    offer = db.query(SecondaryOffer).filter(SecondaryOffer.id == offer_id).first()
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    
    listing = db.query(SecondaryListing).filter(SecondaryListing.id == offer.listing_id).first()
    if listing.seller_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only seller can respond to offers")
    
    if offer.status != OfferStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Offer is not pending")
    
    offer.response_date = datetime.utcnow()
    offer.seller_message = response.message
    
    if response.action == "accept":
        offer.status = OfferStatus.ACCEPTED
        
        # Complete the sale
        listing.status = ListingStatus.SOLD
        listing.buyer_id = offer.buyer_id
        listing.final_price = offer.offer_price
        listing.sold_date = datetime.utcnow()
        
        # Reject all other pending offers
        other_offers = db.query(SecondaryOffer).filter(
            SecondaryOffer.listing_id == listing.id,
            SecondaryOffer.id != offer_id,
            SecondaryOffer.status == OfferStatus.PENDING
        ).all()
        for other in other_offers:
            other.status = OfferStatus.REJECTED
            other.seller_message = "Another offer was accepted"
            other.response_date = datetime.utcnow()
        
        # Create participation/risk transfer record for buyer
        if listing.listing_type in [ListingType.LOAN_PARTICIPATION, ListingType.WHOLE_LOAN]:
            participation = ParticipationRecord(
                loan_id=listing.loan_id,
                owner_id=offer.buyer_id,
                ownership_percentage=listing.participation_percentage or 1.0,
                principal_owned=listing.principal_amount or 0,
                purchase_price=offer.offer_price,
                source_listing_id=listing.id,
                is_original_lender=False
            )
            db.add(participation)
            
            # Mark seller's participation as inactive (if selling whole stake)
            if listing.listing_type == ListingType.WHOLE_LOAN:
                seller_participation = db.query(ParticipationRecord).filter(
                    ParticipationRecord.loan_id == listing.loan_id,
                    ParticipationRecord.owner_id == current_user.id,
                    ParticipationRecord.is_active == True
                ).first()
                if seller_participation:
                    seller_participation.is_active = False
        
        elif listing.listing_type == ListingType.RISK_TRANSFER:
            risk_record = RiskTransferRecord(
                loan_id=listing.loan_id,
                insurer_id=offer.buyer_id,
                risk_percentage=listing.risk_percentage or 0,
                premium_share=listing.premium_share or 0,
                transfer_price=offer.offer_price,
                source_listing_id=listing.id,
                is_original_insurer=False
            )
            db.add(risk_record)
        
        audit_service.log(
            db=db, action="offer_accepted", entity_type="secondary_offer",
            entity_id=offer_id, user_id=current_user.id,
            details={"listing_id": listing.id, "final_price": offer.offer_price}
        )
    else:
        offer.status = OfferStatus.REJECTED
        
        # Check if there are other pending offers
        other_pending = db.query(SecondaryOffer).filter(
            SecondaryOffer.listing_id == listing.id,
            SecondaryOffer.status == OfferStatus.PENDING
        ).count()
        
        if other_pending == 0:
            listing.status = ListingStatus.ACTIVE
        
        audit_service.log(
            db=db, action="offer_rejected", entity_type="secondary_offer",
            entity_id=offer_id, user_id=current_user.id
        )
    
    db.commit()
    db.refresh(offer)
    
    buyer = db.query(User).filter(User.id == offer.buyer_id).first()
    
    return SecondaryOfferResponse(
        id=offer.id,
        listing_id=offer.listing_id,
        buyer_id=offer.buyer_id,
        offer_price=offer.offer_price,
        message=offer.message,
        status=offer.status.value,
        offer_date=offer.offer_date,
        expiry_date=offer.expiry_date,
        response_date=offer.response_date,
        seller_message=offer.seller_message,
        created_at=offer.created_at,
        buyer_name=buyer.full_name if buyer else None,
        listing_title=listing.title
    )


@router.delete("/offers/{offer_id}", status_code=status.HTTP_204_NO_CONTENT)
def withdraw_offer(
    offer_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Withdraw an offer (buyer only)."""
    offer = db.query(SecondaryOffer).filter(SecondaryOffer.id == offer_id).first()
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    
    if offer.buyer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only buyer can withdraw offer")
    
    if offer.status != OfferStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Offer is not pending")
    
    offer.status = OfferStatus.WITHDRAWN
    
    # Update listing status if no other pending offers
    listing = db.query(SecondaryListing).filter(SecondaryListing.id == offer.listing_id).first()
    other_pending = db.query(SecondaryOffer).filter(
        SecondaryOffer.listing_id == listing.id,
        SecondaryOffer.status == OfferStatus.PENDING
    ).count()
    
    if other_pending == 0:
        listing.status = ListingStatus.ACTIVE
    
    db.commit()
    
    audit_service.log(
        db=db, action="offer_withdrawn", entity_type="secondary_offer",
        entity_id=offer_id, user_id=current_user.id
    )


# ============ My Activity ============

@router.get("/my/offers", response_model=List[SecondaryOfferResponse])
def get_my_offers(
    status_filter: Optional[str] = Query(None),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get my offers on listings."""
    query = db.query(SecondaryOffer).filter(SecondaryOffer.buyer_id == current_user.id)
    
    if status_filter:
        query = query.filter(SecondaryOffer.status == status_filter)
    
    offers = query.order_by(SecondaryOffer.offer_date.desc()).all()
    
    result = []
    for offer in offers:
        listing = db.query(SecondaryListing).filter(SecondaryListing.id == offer.listing_id).first()
        
        result.append(SecondaryOfferResponse(
            id=offer.id,
            listing_id=offer.listing_id,
            buyer_id=offer.buyer_id,
            offer_price=offer.offer_price,
            message=offer.message,
            status=offer.status.value if hasattr(offer.status, 'value') else offer.status,
            offer_date=offer.offer_date,
            expiry_date=offer.expiry_date,
            response_date=offer.response_date,
            seller_message=offer.seller_message,
            created_at=offer.created_at,
            buyer_name=current_user.full_name,
            listing_title=listing.title if listing else None
        ))
    
    return result


@router.get("/my/participations", response_model=List[ParticipationRecordResponse])
def get_my_participations(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get my loan participations."""
    if current_user.role != UserRole.LENDER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only lenders have participations")
    
    records = db.query(ParticipationRecord).filter(
        ParticipationRecord.owner_id == current_user.id,
        ParticipationRecord.is_active == True
    ).all()
    
    result = []
    for record in records:
        loan = db.query(ExecutedLoan).filter(ExecutedLoan.id == record.loan_id).first()
        
        result.append(ParticipationRecordResponse(
            id=record.id,
            loan_id=record.loan_id,
            owner_id=record.owner_id,
            ownership_percentage=record.ownership_percentage,
            principal_owned=record.principal_owned,
            purchase_price=record.purchase_price,
            purchase_date=record.purchase_date,
            is_original_lender=record.is_original_lender,
            is_active=record.is_active,
            owner_name=current_user.full_name,
            loan_number=loan.loan_number if loan else None
        ))
    
    return result


@router.get("/my/risk-positions", response_model=List[RiskTransferRecordResponse])
def get_my_risk_positions(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get my risk positions."""
    if current_user.role != UserRole.INSURER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only insurers have risk positions")
    
    records = db.query(RiskTransferRecord).filter(
        RiskTransferRecord.insurer_id == current_user.id,
        RiskTransferRecord.is_active == True
    ).all()
    
    result = []
    for record in records:
        loan = db.query(ExecutedLoan).filter(ExecutedLoan.id == record.loan_id).first()
        
        result.append(RiskTransferRecordResponse(
            id=record.id,
            loan_id=record.loan_id,
            insurer_id=record.insurer_id,
            risk_percentage=record.risk_percentage,
            premium_share=record.premium_share,
            transfer_price=record.transfer_price,
            transfer_date=record.transfer_date,
            is_original_insurer=record.is_original_insurer,
            is_active=record.is_active,
            insurer_name=current_user.full_name,
            loan_number=loan.loan_number if loan else None
        ))
    
    return result


# ============ Market Stats ============

@router.get("/stats", response_model=SecondaryMarketStats)
def get_market_stats(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get secondary market statistics."""
    
    # Loan listings
    loan_types = [ListingType.LOAN_PARTICIPATION, ListingType.WHOLE_LOAN]
    total_loan_listings = db.query(SecondaryListing).filter(
        SecondaryListing.listing_type.in_(loan_types)
    ).count()
    
    active_loan_listings = db.query(SecondaryListing).filter(
        SecondaryListing.listing_type.in_(loan_types),
        SecondaryListing.status == ListingStatus.ACTIVE
    ).count()
    
    loan_stats = db.query(
        func.sum(SecondaryListing.principal_amount),
        func.avg(SecondaryListing.asking_price),
        func.avg(SecondaryListing.implied_yield)
    ).filter(
        SecondaryListing.listing_type.in_(loan_types),
        SecondaryListing.status == ListingStatus.ACTIVE
    ).first()
    
    # Risk listings
    total_risk_listings = db.query(SecondaryListing).filter(
        SecondaryListing.listing_type == ListingType.RISK_TRANSFER
    ).count()
    
    active_risk_listings = db.query(SecondaryListing).filter(
        SecondaryListing.listing_type == ListingType.RISK_TRANSFER,
        SecondaryListing.status == ListingStatus.ACTIVE
    ).count()
    
    risk_stats = db.query(
        func.sum(SecondaryListing.asking_price),
        func.avg(SecondaryListing.asking_price)
    ).filter(
        SecondaryListing.listing_type == ListingType.RISK_TRANSFER,
        SecondaryListing.status == ListingStatus.ACTIVE
    ).first()
    
    # Recent activity
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    
    listings_30d = db.query(SecondaryListing).filter(
        SecondaryListing.listed_date >= thirty_days_ago
    ).count()
    
    sales_30d = db.query(SecondaryListing).filter(
        SecondaryListing.sold_date >= thirty_days_ago,
        SecondaryListing.status == ListingStatus.SOLD
    ).all()
    
    return SecondaryMarketStats(
        total_loan_listings=total_loan_listings,
        active_loan_listings=active_loan_listings,
        total_loan_volume=loan_stats[0] or 0,
        avg_loan_asking_price=loan_stats[1] or 0,
        avg_loan_yield=(loan_stats[2] or 0) * 100,  # Convert to percentage
        total_risk_listings=total_risk_listings,
        active_risk_listings=active_risk_listings,
        total_risk_volume=risk_stats[0] or 0,
        avg_risk_asking_price=risk_stats[1] or 0,
        listings_last_30_days=listings_30d,
        sales_last_30_days=len(sales_30d),
        total_sales_volume_30_days=sum(s.final_price or 0 for s in sales_30d)
    )
