"""
Business Value Hub

GET  /business-value/{deal_id}/snapshot        — Current valuation + health
POST /business-value/{deal_id}/growth-plan     — Generate value growth plan
GET  /business-value/{deal_id}/growth-plan     — Get latest growth plan

POST /business-value/{deal_id}/list-for-sale   — Create/update a sale listing
GET  /business-value/{deal_id}/listing         — Get listing details
DELETE /business-value/{deal_id}/listing       — Withdraw listing

POST /business-value/{deal_id}/investment-summary — Generate CIM
GET  /business-value/{deal_id}/investment-summary — Get latest CIM
"""

import asyncio
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, Float, Boolean, Text, JSON, DateTime, ForeignKey
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User, UserRole
from app.models.deal import Deal, DealRiskReport
from app.models.executed_loan import ExecutedLoan, LoanPayment
from app.models.base import Base, TimestampMixin
from app.services.claude_ai import claude_value_growth_advisor, claude_generate_investment_summary
from app.services.audit import audit_service

router = APIRouter()


# ── Inline models ─────────────────────────────────────────────────────────────

class SaleListing(Base, TimestampMixin):
    __tablename__ = "sale_listings"
    id = Column(Integer, primary_key=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String(50), nullable=False, default="active")
    asking_price = Column(Float, nullable=True)
    motivation = Column(Text, nullable=True)
    ideal_buyer = Column(Text, nullable=True)
    transition_period = Column(Integer, nullable=True)
    seller_financing = Column(Boolean, default=False)
    seller_financing_amount = Column(Float, nullable=True)
    is_public = Column(Boolean, default=False)
    listed_at = Column(DateTime, nullable=True)


class InvestmentSummary(Base, TimestampMixin):
    __tablename__ = "investment_summaries"
    id = Column(Integer, primary_key=True)
    listing_id = Column(Integer, ForeignKey("sale_listings.id"), nullable=False)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    ai_content = Column(JSON, nullable=True)
    version = Column(Integer, nullable=False, default=1)
    view_count = Column(Integer, nullable=False, default=0)


class ValueGrowthPlan(Base):
    __tablename__ = "value_growth_plans"
    id = Column(Integer, primary_key=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    ai_plan = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# ── Request schemas ───────────────────────────────────────────────────────────

class ListingCreate(BaseModel):
    asking_price: Optional[float] = None
    motivation: Optional[str] = None
    ideal_buyer: Optional[str] = None
    transition_period: Optional[int] = 6
    seller_financing: bool = False
    seller_financing_amount: Optional[float] = None
    is_public: bool = False


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_context(deal_id: int, current_user: User, db: Session):
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    if current_user.role == UserRole.BORROWER and deal.borrower_id != current_user.id:
        # Allow employees linked to the owner
        if current_user.organization_id != deal.borrower_id:
            raise HTTPException(status_code=403, detail="Access denied")

    rpt = db.query(DealRiskReport).filter(
        DealRiskReport.deal_id == deal_id
    ).order_by(DealRiskReport.version.desc()).first()

    loan = db.query(ExecutedLoan).filter(ExecutedLoan.deal_id == deal_id).first()

    deal_data = {
        "name": deal.name, "industry": deal.industry,
        "annual_revenue": deal.annual_revenue, "ebitda": deal.ebitda,
        "purchase_price": deal.purchase_price,
        "loan_amount_requested": deal.loan_amount_requested,
        "equity_injection": deal.equity_injection,
        "owner_credit_score": deal.owner_credit_score,
        "owner_experience_years": deal.owner_experience_years,
    }

    risk_report = {}
    uw_data = {}
    cashflows = []

    if rpt:
        risk_report = {
            "dscr_base": rpt.dscr_base, "annual_pd": rpt.annual_pd,
            "collateral_coverage": rpt.collateral_coverage, "total_nolv": rpt.total_nolv,
            "ev_low": rpt.ev_low, "ev_mid": rpt.ev_mid, "ev_high": rpt.ev_high,
            "equity_value_low": rpt.equity_value_low,
            "equity_value_mid": rpt.equity_value_mid,
            "equity_value_high": rpt.equity_value_high,
            "normalized_ebitda": rpt.normalized_ebitda,
            "normalized_sde": rpt.normalized_sde,
            "sde_multiple_implied": rpt.sde_multiple_implied,
            "sba_eligible": rpt.sba_eligible,
            "health_score": rpt.health_score,
            "health_score_cashflow": rpt.health_score_cashflow,
            "health_score_stability": rpt.health_score_stability,
            "health_score_growth": rpt.health_score_growth,
            "health_score_liquidity": rpt.health_score_liquidity,
            "valuation_method_weights": rpt.valuation_method_weights,
        }
        uw_data = {
            "health_score": {"score": rpt.health_score},
            "deal_killer": {"verdict": rpt.deal_killer_verdict or "unknown"},
        }

    if loan:
        payments = db.query(LoanPayment).filter(
            LoanPayment.loan_id == loan.id
        ).order_by(LoanPayment.payment_date.desc()).limit(12).all()
        cashflows = [{
            "payment_date": str(p.payment_date),
            "revenue": None, "ebitda": None,
            "principal_portion": p.principal_portion,
            "interest_portion": p.interest_portion,
        } for p in payments]

    return deal, deal_data, risk_report, uw_data, cashflows, loan


# ── Value Snapshot ────────────────────────────────────────────────────────────

@router.get("/{deal_id}/snapshot")
async def get_value_snapshot(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get current business valuation snapshot with context."""
    deal, deal_data, risk_report, uw_data, cashflows, loan = _get_context(deal_id, current_user, db)

    # Get active listing if any
    listing = db.query(SaleListing).filter(
        SaleListing.deal_id == deal_id,
        SaleListing.status == "active",
    ).first()

    # Get latest growth plan
    growth_plan = db.query(ValueGrowthPlan).filter(
        ValueGrowthPlan.deal_id == deal_id
    ).order_by(ValueGrowthPlan.created_at.desc()).first()

    equity_mid = risk_report.get("equity_value_mid") or 0
    purchase_price = deal_data.get("purchase_price") or 0
    loan_balance = loan.current_principal_balance if loan else 0

    return {
        "deal_id": deal_id,
        "business_name": deal.name,
        "industry": deal.industry,

        # Valuation
        "valuation": {
            "equity_value_low": risk_report.get("equity_value_low"),
            "equity_value_mid": equity_mid,
            "equity_value_high": risk_report.get("equity_value_high"),
            "ev_low": risk_report.get("ev_low"),
            "ev_mid": risk_report.get("ev_mid"),
            "ev_high": risk_report.get("ev_high"),
            "normalized_ebitda": risk_report.get("normalized_ebitda"),
            "normalized_sde": risk_report.get("normalized_sde"),
            "sde_multiple": risk_report.get("sde_multiple_implied"),
            "method_weights": risk_report.get("valuation_method_weights"),
        },

        # What you own
        "ownership": {
            "purchase_price": purchase_price,
            "current_loan_balance": loan_balance,
            "estimated_equity": max(0, equity_mid - loan_balance),
            "value_vs_purchase": round((equity_mid - purchase_price) / purchase_price * 100, 1) if purchase_price else None,
            "equity_return_pct": round((equity_mid - purchase_price) / (purchase_price - (deal_data.get("loan_amount_requested") or 0)) * 100, 1)
                if purchase_price and deal_data.get("loan_amount_requested") else None,
        },

        # Health
        "health": {
            "score": risk_report.get("health_score"),
            "cashflow": risk_report.get("health_score_cashflow"),
            "stability": risk_report.get("health_score_stability"),
            "growth": risk_report.get("health_score_growth"),
            "liquidity": risk_report.get("health_score_liquidity"),
            "dscr": risk_report.get("dscr_base"),
            "annual_pd": risk_report.get("annual_pd"),
        },

        # Key financials
        "financials": {
            "annual_revenue": deal_data.get("annual_revenue"),
            "ebitda": deal_data.get("ebitda"),
            "ebitda_margin": round(deal_data.get("ebitda", 0) / deal_data.get("annual_revenue", 1) * 100, 1)
                if deal_data.get("annual_revenue") else None,
        },

        # Sale status
        "listing": {
            "is_listed": listing is not None,
            "listing_id": listing.id if listing else None,
            "asking_price": listing.asking_price if listing else None,
            "status": listing.status if listing else None,
        } if listing else {"is_listed": False},

        # Growth plan available?
        "has_growth_plan": growth_plan is not None,
        "growth_plan_date": growth_plan.created_at.isoformat() if growth_plan else None,
    }


# ── Value Growth Plan ─────────────────────────────────────────────────────────

@router.post("/{deal_id}/growth-plan")
async def generate_growth_plan(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Generate an AI value growth plan for this business."""
    deal, deal_data, risk_report, uw_data, cashflows, loan = _get_context(deal_id, current_user, db)

    loop = asyncio.get_running_loop()
    plan = await loop.run_in_executor(None, lambda: claude_value_growth_advisor(
        deal_data=deal_data, risk_report=risk_report,
        uw_data=uw_data, cashflows=cashflows,
    ))

    if not plan:
        raise HTTPException(status_code=503, detail="AI service unavailable.")

    rec = ValueGrowthPlan(
        deal_id=deal_id,
        owner_id=current_user.id,
        ai_plan=plan,
    )
    db.add(rec)
    db.commit()

    audit_service.log(db=db, action="growth_plan_generated", entity_type="deal",
                      entity_id=deal_id, user_id=current_user.id)
    return {"plan_id": rec.id, "deal_id": deal_id, **plan}


@router.get("/{deal_id}/growth-plan")
async def get_growth_plan(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get the latest value growth plan."""
    _get_context(deal_id, current_user, db)  # access check

    plan = db.query(ValueGrowthPlan).filter(
        ValueGrowthPlan.deal_id == deal_id
    ).order_by(ValueGrowthPlan.created_at.desc()).first()

    if not plan:
        return {"deal_id": deal_id, "exists": False}

    return {"plan_id": plan.id, "deal_id": deal_id, "exists": True,
            "created_at": plan.created_at.isoformat(), **(plan.ai_plan or {})}


# ── Sale Listing ──────────────────────────────────────────────────────────────

@router.post("/{deal_id}/list-for-sale")
async def create_listing(
    deal_id: int,
    data: ListingCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Mark this business as for sale and set listing details."""
    deal, deal_data, risk_report, _, _, _ = _get_context(deal_id, current_user, db)

    # Only the actual owner can list
    if deal.borrower_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Only the business owner can list for sale")

    # Deactivate any existing listing
    existing = db.query(SaleListing).filter(
        SaleListing.deal_id == deal_id,
        SaleListing.status == "active",
    ).first()
    if existing:
        existing.status = "withdrawn"

    # Use AI valuation as default asking price if not provided
    default_asking = data.asking_price or risk_report.get("equity_value_mid") or deal_data.get("purchase_price")

    listing = SaleListing(
        deal_id=deal_id,
        owner_id=current_user.id,
        asking_price=default_asking,
        motivation=data.motivation,
        ideal_buyer=data.ideal_buyer,
        transition_period=data.transition_period or 6,
        seller_financing=data.seller_financing,
        seller_financing_amount=data.seller_financing_amount,
        is_public=data.is_public,
        status="active",
        listed_at=datetime.utcnow(),
    )
    db.add(listing)
    db.commit()
    db.refresh(listing)

    audit_service.log(db=db, action="business_listed_for_sale", entity_type="deal",
                      entity_id=deal_id, user_id=current_user.id,
                      details={"asking_price": default_asking})
    return {
        "listing_id": listing.id, "deal_id": deal_id,
        "asking_price": listing.asking_price,
        "status": listing.status,
        "message": "Business listed. Generate an investment summary to create your CIM."
    }


@router.get("/{deal_id}/listing")
async def get_listing(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    listing = db.query(SaleListing).filter(
        SaleListing.deal_id == deal_id,
    ).order_by(SaleListing.created_at.desc()).first()

    if not listing:
        return {"deal_id": deal_id, "is_listed": False}

    return {
        "listing_id": listing.id, "deal_id": deal_id, "is_listed": True,
        "status": listing.status,
        "asking_price": listing.asking_price,
        "motivation": listing.motivation,
        "ideal_buyer": listing.ideal_buyer,
        "transition_period": listing.transition_period,
        "seller_financing": listing.seller_financing,
        "seller_financing_amount": listing.seller_financing_amount,
        "is_public": listing.is_public,
        "listed_at": listing.listed_at.isoformat() if listing.listed_at else None,
    }


@router.delete("/{deal_id}/listing")
async def withdraw_listing(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    listing = db.query(SaleListing).filter(
        SaleListing.deal_id == deal_id,
        SaleListing.owner_id == current_user.id,
        SaleListing.status == "active",
    ).first()
    if not listing:
        raise HTTPException(status_code=404, detail="No active listing found")

    listing.status = "withdrawn"
    db.commit()
    return {"listing_id": listing.id, "status": "withdrawn"}


# ── Investment Summary / CIM ──────────────────────────────────────────────────

@router.post("/{deal_id}/investment-summary")
async def generate_investment_summary(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Generate a Confidential Information Memorandum (CIM) for this business."""
    deal, deal_data, risk_report, uw_data, _, _ = _get_context(deal_id, current_user, db)

    listing = db.query(SaleListing).filter(
        SaleListing.deal_id == deal_id,
        SaleListing.status == "active",
    ).first()

    if not listing:
        raise HTTPException(
            status_code=400,
            detail="List your business for sale first before generating an investment summary."
        )

    listing_data = {
        "asking_price": listing.asking_price,
        "motivation": listing.motivation or "Owner pursuing other opportunities",
        "ideal_buyer": listing.ideal_buyer or "Experienced operator",
        "transition_period": listing.transition_period or 6,
        "seller_financing": listing.seller_financing,
        "seller_financing_amount": listing.seller_financing_amount,
    }

    loop = asyncio.get_running_loop()
    cim = await loop.run_in_executor(None, lambda: claude_generate_investment_summary(
        deal_data=deal_data, risk_report=risk_report,
        uw_data=uw_data, listing_data=listing_data,
    ))

    if not cim:
        raise HTTPException(status_code=503, detail="AI service unavailable.")

    # Get version number
    last = db.query(InvestmentSummary).filter(
        InvestmentSummary.deal_id == deal_id
    ).order_by(InvestmentSummary.version.desc()).first()
    version = (last.version + 1) if last else 1

    rec = InvestmentSummary(
        listing_id=listing.id, deal_id=deal_id,
        owner_id=current_user.id,
        ai_content=cim, version=version,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)

    audit_service.log(db=db, action="investment_summary_generated", entity_type="deal",
                      entity_id=deal_id, user_id=current_user.id)
    return {"summary_id": rec.id, "deal_id": deal_id, "version": version, **cim}


@router.get("/{deal_id}/investment-summary")
async def get_investment_summary(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get the latest investment summary / CIM."""
    _get_context(deal_id, current_user, db)

    summary = db.query(InvestmentSummary).filter(
        InvestmentSummary.deal_id == deal_id
    ).order_by(InvestmentSummary.version.desc()).first()

    if not summary:
        return {"deal_id": deal_id, "exists": False}

    # Increment view count
    summary.view_count += 1
    db.commit()

    return {
        "summary_id": summary.id, "deal_id": deal_id, "exists": True,
        "version": summary.version, "view_count": summary.view_count,
        "created_at": summary.created_at.isoformat(),
        **(summary.ai_content or {}),
    }
