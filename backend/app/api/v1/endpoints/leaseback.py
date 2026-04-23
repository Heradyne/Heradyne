"""
Asset Leaseback Marketplace

Owner/Borrower:
POST /leaseback/assets                         — Submit an asset listing
GET  /leaseback/assets/mine                    — My asset listings
GET  /leaseback/assets/{asset_id}              — Get a specific asset
PUT  /leaseback/assets/{asset_id}              — Update listing
POST /leaseback/assets/{asset_id}/evaluate     — Trigger AI evaluation
GET  /leaseback/proposals/mine                 — Proposals received
POST /leaseback/proposals/{proposal_id}/accept — Accept a proposal
POST /leaseback/proposals/{proposal_id}/decline — Decline a proposal
POST /leaseback/contracts/{contract_id}/sign   — Sign contract as owner

Admin:
GET  /leaseback/assets/all                     — All asset listings
GET  /leaseback/assets/{asset_id}/evaluation   — View AI evaluation
POST /leaseback/assets/{asset_id}/propose      — Create leaseback proposal
POST /leaseback/proposals/{proposal_id}/contract — Generate contract after acceptance
POST /leaseback/contracts/{contract_id}/countersign — Admin signs contract
GET  /leaseback/contracts/all                  — All contracts
"""

import asyncio
from datetime import date, datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, Float, Boolean, Text, JSON, Date, DateTime, ForeignKey
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User, UserRole
from app.models.deal import Deal, DealRiskReport
from app.models.executed_loan import ExecutedLoan
from app.models.base import Base, TimestampMixin
from app.services.claude_ai import claude_evaluate_asset, claude_generate_leaseback_contract
from app.services.audit import audit_service

router = APIRouter()


# ── Inline models ─────────────────────────────────────────────────────────────

class AssetListing(Base, TimestampMixin):
    __tablename__ = "asset_listings"
    id = Column(Integer, primary_key=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    asset_type = Column(String(100), nullable=False)
    location = Column(String(255), nullable=True)
    external_link = Column(String(500), nullable=True)
    owner_estimated_value = Column(Float, nullable=True)
    photos_urls = Column(JSON, nullable=True)
    additional_details = Column(JSON, nullable=True)
    ai_evaluation = Column(JSON, nullable=True)
    ai_evaluated_at = Column(DateTime, nullable=True)
    status = Column(String(50), nullable=False, default="pending")
    is_visible_to_investors = Column(Boolean, default=False)


class LeasebackProposal(Base, TimestampMixin):
    __tablename__ = "leaseback_proposals"
    id = Column(Integer, primary_key=True)
    asset_listing_id = Column(Integer, ForeignKey("asset_listings.id"), nullable=False)
    proposed_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    purchase_price = Column(Float, nullable=False)
    monthly_lease_payment = Column(Float, nullable=False)
    lease_term_months = Column(Integer, nullable=False)
    lease_type = Column(String(50), nullable=False, default="operating")
    buyback_option = Column(Boolean, default=False)
    buyback_price = Column(Float, nullable=True)
    buyback_period_months = Column(Integer, nullable=True)
    rationale = Column(Text, nullable=True)
    ai_analysis = Column(JSON, nullable=True)
    status = Column(String(50), nullable=False, default="proposed")
    owner_response_notes = Column(Text, nullable=True)
    responded_at = Column(DateTime, nullable=True)


class LeasebackContract(Base, TimestampMixin):
    __tablename__ = "leaseback_contracts"
    id = Column(Integer, primary_key=True)
    proposal_id = Column(Integer, ForeignKey("leaseback_proposals.id"), nullable=False)
    asset_listing_id = Column(Integer, ForeignKey("asset_listings.id"), nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    investor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    contract_content = Column(JSON, nullable=True)
    contract_html = Column(Text, nullable=True)
    status = Column(String(50), nullable=False, default="pending_signature")
    owner_signed_at = Column(DateTime, nullable=True)
    investor_signed_at = Column(DateTime, nullable=True)
    effective_date = Column(Date, nullable=True)


# ── Request schemas ───────────────────────────────────────────────────────────

class AssetCreate(BaseModel):
    title: str
    description: str
    asset_type: str
    location: Optional[str] = None
    external_link: Optional[str] = None
    owner_estimated_value: Optional[float] = None
    photos_urls: Optional[List[str]] = None
    additional_details: Optional[dict] = None
    deal_id: Optional[int] = None


class ProposalCreate(BaseModel):
    purchase_price: float
    monthly_lease_payment: float
    lease_term_months: int
    lease_type: str = "operating"
    buyback_option: bool = False
    buyback_price: Optional[float] = None
    buyback_period_months: Optional[int] = None
    rationale: Optional[str] = None


class ProposalResponse(BaseModel):
    accept: bool
    notes: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _serialize_asset(a: AssetListing, include_eval: bool = True) -> dict:
    d = {
        "id": a.id, "title": a.title, "description": a.description,
        "asset_type": a.asset_type, "location": a.location,
        "external_link": a.external_link,
        "owner_estimated_value": a.owner_estimated_value,
        "photos_urls": a.photos_urls or [],
        "additional_details": a.additional_details or {},
        "status": a.status,
        "is_visible_to_investors": a.is_visible_to_investors,
        "created_at": a.created_at.isoformat(),
        "ai_evaluated_at": a.ai_evaluated_at.isoformat() if a.ai_evaluated_at else None,
    }
    if include_eval and a.ai_evaluation:
        d["ai_evaluation"] = a.ai_evaluation
    return d


def _serialize_proposal(p: LeasebackProposal, asset: AssetListing = None) -> dict:
    return {
        "id": p.id, "asset_listing_id": p.asset_listing_id,
        "asset_title": asset.title if asset else None,
        "purchase_price": p.purchase_price,
        "monthly_lease_payment": p.monthly_lease_payment,
        "lease_term_months": p.lease_term_months,
        "lease_type": p.lease_type,
        "buyback_option": p.buyback_option,
        "buyback_price": p.buyback_price,
        "buyback_period_months": p.buyback_period_months,
        "rationale": p.rationale,
        "status": p.status,
        "owner_response_notes": p.owner_response_notes,
        "responded_at": p.responded_at.isoformat() if p.responded_at else None,
        "created_at": p.created_at.isoformat(),
        "ai_analysis": p.ai_analysis,
        # computed
        "total_lease_value": round(p.monthly_lease_payment * p.lease_term_months, 2),
        "annual_yield_pct": round((p.monthly_lease_payment * 12 / p.purchase_price * 100), 1) if p.purchase_price else None,
    }


# ── Owner: Asset management ───────────────────────────────────────────────────

@router.post("/assets")
async def create_asset_listing(
    data: AssetCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Owner submits a new asset for investor evaluation."""
    asset = AssetListing(
        owner_id=current_user.id,
        deal_id=data.deal_id,
        title=data.title,
        description=data.description,
        asset_type=data.asset_type,
        location=data.location,
        external_link=data.external_link,
        owner_estimated_value=data.owner_estimated_value,
        photos_urls=data.photos_urls,
        additional_details=data.additional_details,
        status="pending",
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)

    audit_service.log(db=db, action="asset_listed", entity_type="asset",
                      entity_id=asset.id, user_id=current_user.id,
                      details={"title": data.title, "type": data.asset_type})
    return _serialize_asset(asset)


@router.get("/assets/mine")
async def my_asset_listings(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    assets = db.query(AssetListing).filter(
        AssetListing.owner_id == current_user.id
    ).order_by(AssetListing.created_at.desc()).all()
    return {"assets": [_serialize_asset(a) for a in assets]}


@router.get("/assets/all")
async def all_asset_listings(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Admin view of all asset listings."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    assets = db.query(AssetListing).order_by(AssetListing.created_at.desc()).all()
    result = []
    for a in assets:
        owner = db.query(User).filter(User.id == a.owner_id).first()
        proposals = db.query(LeasebackProposal).filter(
            LeasebackProposal.asset_listing_id == a.id
        ).count()
        d = _serialize_asset(a)
        d["owner_name"] = owner.full_name if owner else "Unknown"
        d["owner_email"] = owner.email if owner else ""
        d["proposal_count"] = proposals
        result.append(d)
    return {"assets": result, "total": len(result)}


@router.get("/assets/{asset_id}")
async def get_asset(
    asset_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    asset = db.query(AssetListing).filter(AssetListing.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # Owner, admin, or if public — can view
    if asset.owner_id != current_user.id and current_user.role != UserRole.ADMIN:
        if not asset.is_visible_to_investors:
            raise HTTPException(status_code=403, detail="Access denied")

    return _serialize_asset(asset)


@router.put("/assets/{asset_id}")
async def update_asset(
    asset_id: int,
    data: AssetCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    asset = db.query(AssetListing).filter(
        AssetListing.id == asset_id,
        AssetListing.owner_id == current_user.id,
    ).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    for field, value in data.dict(exclude_none=True).items():
        if hasattr(asset, field):
            setattr(asset, field, value)
    db.commit()
    return _serialize_asset(asset)


@router.post("/assets/{asset_id}/evaluate")
async def evaluate_asset(
    asset_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Trigger Claude AI evaluation of the asset. Owner or admin can trigger."""
    asset = db.query(AssetListing).filter(AssetListing.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    if asset.owner_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Access denied")

    # Get business context
    deal = db.query(Deal).filter(
        Deal.borrower_id == asset.owner_id
    ).first()
    rpt = db.query(DealRiskReport).filter(
        DealRiskReport.deal_id == deal.id
    ).order_by(DealRiskReport.version.desc()).first() if deal else None
    loan = db.query(ExecutedLoan).filter(
        ExecutedLoan.deal_id == deal.id
    ).first() if deal else None

    business_context = {
        "industry": deal.industry if deal else "unknown",
        "annual_revenue": deal.annual_revenue if deal else 0,
        "ebitda": deal.ebitda if deal else 0,
        "loan_balance": loan.current_principal_balance if loan else 0,
        "health_score": rpt.health_score if rpt else None,
    }

    loop = asyncio.get_running_loop()
    evaluation = await loop.run_in_executor(None, lambda: claude_evaluate_asset(
        title=asset.title,
        description=asset.description,
        asset_type=asset.asset_type,
        owner_estimated_value=asset.owner_estimated_value or 0,
        location=asset.location or "",
        external_link=asset.external_link or "",
        additional_details=asset.additional_details or {},
        business_context=business_context,
    ))

    if not evaluation:
        raise HTTPException(status_code=503, detail="AI service unavailable.")

    asset.ai_evaluation = evaluation
    asset.ai_evaluated_at = datetime.utcnow()
    asset.status = "evaluated"
    asset.is_visible_to_investors = True  # Make visible to admin after evaluation
    db.commit()

    audit_service.log(db=db, action="asset_evaluated", entity_type="asset",
                      entity_id=asset_id, user_id=current_user.id)
    return _serialize_asset(asset)


# ── Owner: Proposals received ─────────────────────────────────────────────────

@router.get("/proposals/mine")
async def my_proposals(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    proposals = db.query(LeasebackProposal).filter(
        LeasebackProposal.owner_id == current_user.id
    ).order_by(LeasebackProposal.created_at.desc()).all()

    result = []
    for p in proposals:
        asset = db.query(AssetListing).filter(AssetListing.id == p.asset_listing_id).first()
        result.append(_serialize_proposal(p, asset))
    return {"proposals": result}


@router.post("/proposals/{proposal_id}/accept")
async def accept_proposal(
    proposal_id: int,
    data: ProposalResponse,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    proposal = db.query(LeasebackProposal).filter(
        LeasebackProposal.id == proposal_id,
        LeasebackProposal.owner_id == current_user.id,
    ).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if proposal.status != "proposed":
        raise HTTPException(status_code=400, detail="Proposal is no longer pending")

    proposal.status = "accepted"
    proposal.owner_response_notes = data.notes
    proposal.responded_at = datetime.utcnow()

    asset = db.query(AssetListing).filter(AssetListing.id == proposal.asset_listing_id).first()
    if asset:
        asset.status = "under_negotiation"

    db.commit()

    audit_service.log(db=db, action="proposal_accepted", entity_type="proposal",
                      entity_id=proposal_id, user_id=current_user.id)
    return {"proposal_id": proposal_id, "status": "accepted",
            "message": "Proposal accepted. The investor will now generate the contract for your review."}


@router.post("/proposals/{proposal_id}/decline")
async def decline_proposal(
    proposal_id: int,
    data: ProposalResponse,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    proposal = db.query(LeasebackProposal).filter(
        LeasebackProposal.id == proposal_id,
        LeasebackProposal.owner_id == current_user.id,
    ).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    proposal.status = "declined"
    proposal.owner_response_notes = data.notes
    proposal.responded_at = datetime.utcnow()
    db.commit()

    return {"proposal_id": proposal_id, "status": "declined"}


# ── Owner: Sign contract ──────────────────────────────────────────────────────

@router.get("/contracts/all")
async def all_contracts(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Admin view of all contracts."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    contracts = db.query(LeasebackContract).order_by(LeasebackContract.created_at.desc()).all()
    result = []
    for c in contracts:
        asset = db.query(AssetListing).filter(AssetListing.id == c.asset_listing_id).first()
        owner = db.query(User).filter(User.id == c.owner_id).first()
        proposal = db.query(LeasebackProposal).filter(LeasebackProposal.id == c.proposal_id).first()
        result.append({
            "id": c.id, "status": c.status,
            "asset_title": asset.title if asset else "Unknown",
            "owner_name": owner.full_name if owner else "Unknown",
            "purchase_price": proposal.purchase_price if proposal else None,
            "monthly_lease": proposal.monthly_lease_payment if proposal else None,
            "owner_signed": c.owner_signed_at is not None,
            "investor_signed": c.investor_signed_at is not None,
            "effective_date": str(c.effective_date) if c.effective_date else None,
            "created_at": c.created_at.isoformat(),
        })
    return {"contracts": result}

@router.get("/contracts/mine")
async def my_contracts(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    contracts = db.query(LeasebackContract).filter(
        LeasebackContract.owner_id == current_user.id
    ).order_by(LeasebackContract.created_at.desc()).all()

    result = []
    for c in contracts:
        asset = db.query(AssetListing).filter(AssetListing.id == c.asset_listing_id).first()
        proposal = db.query(LeasebackProposal).filter(LeasebackProposal.id == c.proposal_id).first()
        result.append({
            "id": c.id, "status": c.status,
            "asset_title": asset.title if asset else "Unknown",
            "purchase_price": proposal.purchase_price if proposal else None,
            "monthly_lease": proposal.monthly_lease_payment if proposal else None,
            "owner_signed_at": c.owner_signed_at.isoformat() if c.owner_signed_at else None,
            "investor_signed_at": c.investor_signed_at.isoformat() if c.investor_signed_at else None,
            "effective_date": str(c.effective_date) if c.effective_date else None,
            "created_at": c.created_at.isoformat(),
            "contract_content": c.contract_content,
        })
    return {"contracts": result}


@router.post("/contracts/{contract_id}/sign")
async def owner_sign_contract(
    contract_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Owner signs the leaseback contract."""
    contract = db.query(LeasebackContract).filter(
        LeasebackContract.id == contract_id,
        LeasebackContract.owner_id == current_user.id,
    ).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")
    if contract.owner_signed_at:
        raise HTTPException(status_code=400, detail="Already signed")

    contract.owner_signed_at = datetime.utcnow()
    if contract.investor_signed_at:
        contract.status = "fully_executed"
        contract.effective_date = date.today()
        # Update asset status
        asset = db.query(AssetListing).filter(AssetListing.id == contract.asset_listing_id).first()
        if asset:
            asset.status = "contracted"
    else:
        contract.status = "owner_signed"

    db.commit()

    audit_service.log(db=db, action="contract_signed_owner", entity_type="contract",
                      entity_id=contract_id, user_id=current_user.id)
    return {"contract_id": contract_id, "status": contract.status,
            "message": "Contract signed. Waiting for investor countersignature." if not contract.investor_signed_at else "Contract fully executed!"}


# ── Admin: Asset marketplace ──────────────────────────────────────────────────

@router.post("/assets/{asset_id}/propose")
async def create_proposal(
    asset_id: int,
    data: ProposalCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Admin creates a leaseback proposal for an asset."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    asset = db.query(AssetListing).filter(AssetListing.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # Generate AI analysis of the deal
    ev = asset.ai_evaluation or {}
    investor_summary = ev.get("investor_summary", {})

    ai_analysis = {
        "asset_value_estimate": ev.get("valuation", {}).get("estimated_value_mid"),
        "implied_cap_rate": round(data.monthly_lease_payment * 12 / data.purchase_price * 100, 2) if data.purchase_price else None,
        "annual_yield_pct": round(data.monthly_lease_payment * 12 / data.purchase_price * 100, 1) if data.purchase_price else None,
        "total_lease_value": round(data.monthly_lease_payment * data.lease_term_months, 2),
        "payback_period_years": round(data.purchase_price / (data.monthly_lease_payment * 12), 1) if data.monthly_lease_payment else None,
        "leaseback_viability": ev.get("leaseback_viability", {}),
        "risk_level": ev.get("leaseback_viability", {}).get("risk_to_investor", "medium"),
    }

    proposal = LeasebackProposal(
        asset_listing_id=asset_id,
        proposed_by_id=current_user.id,
        owner_id=asset.owner_id,
        purchase_price=data.purchase_price,
        monthly_lease_payment=data.monthly_lease_payment,
        lease_term_months=data.lease_term_months,
        lease_type=data.lease_type,
        buyback_option=data.buyback_option,
        buyback_price=data.buyback_price,
        buyback_period_months=data.buyback_period_months,
        rationale=data.rationale,
        ai_analysis=ai_analysis,
        status="proposed",
    )
    db.add(proposal)
    asset.status = "proposal_sent"
    db.commit()
    db.refresh(proposal)

    audit_service.log(db=db, action="leaseback_proposed", entity_type="asset",
                      entity_id=asset_id, user_id=current_user.id,
                      details={"purchase_price": data.purchase_price})
    return _serialize_proposal(proposal, asset)


@router.post("/proposals/{proposal_id}/contract")
async def generate_contract(
    proposal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Admin generates the leaseback contract after owner accepts proposal."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    proposal = db.query(LeasebackProposal).filter(LeasebackProposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if proposal.status != "accepted":
        raise HTTPException(status_code=400, detail="Proposal must be accepted before generating contract")

    asset = db.query(AssetListing).filter(AssetListing.id == proposal.asset_listing_id).first()
    owner = db.query(User).filter(User.id == proposal.owner_id).first()
    investor = db.query(User).filter(User.id == current_user.id).first()

    loop = asyncio.get_running_loop()
    contract_content = await loop.run_in_executor(None, lambda: claude_generate_leaseback_contract(
        asset_title=asset.title if asset else "Asset",
        asset_description=asset.description if asset else "",
        owner_name=owner.full_name if owner else "Owner",
        investor_name=investor.full_name if investor else "Investor",
        purchase_price=proposal.purchase_price,
        monthly_lease=proposal.monthly_lease_payment,
        lease_term_months=proposal.lease_term_months,
        lease_type=proposal.lease_type,
        buyback_option=proposal.buyback_option,
        buyback_price=proposal.buyback_price or 0,
        buyback_period_months=proposal.buyback_period_months or 0,
    ))

    if not contract_content:
        raise HTTPException(status_code=503, detail="AI service unavailable.")

    contract = LeasebackContract(
        proposal_id=proposal_id,
        asset_listing_id=proposal.asset_listing_id,
        owner_id=proposal.owner_id,
        investor_id=current_user.id,
        contract_content=contract_content,
        status="pending_signature",
    )
    db.add(contract)
    proposal.status = "contracted"
    db.commit()
    db.refresh(contract)

    audit_service.log(db=db, action="contract_generated", entity_type="proposal",
                      entity_id=proposal_id, user_id=current_user.id)
    return {"contract_id": contract.id, "proposal_id": proposal_id,
            "status": "pending_signature", **contract_content}


@router.post("/contracts/{contract_id}/countersign")
async def admin_sign_contract(
    contract_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Admin countersigns the contract."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    contract = db.query(LeasebackContract).filter(
        LeasebackContract.id == contract_id,
        LeasebackContract.investor_id == current_user.id,
    ).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")

    contract.investor_signed_at = datetime.utcnow()
    if contract.owner_signed_at:
        contract.status = "fully_executed"
        contract.effective_date = date.today()
        asset = db.query(AssetListing).filter(AssetListing.id == contract.asset_listing_id).first()
        if asset:
            asset.status = "contracted"
    else:
        contract.status = "investor_signed"
    db.commit()

    return {"contract_id": contract_id, "status": contract.status}

