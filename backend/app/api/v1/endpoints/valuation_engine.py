"""
Self-Service Business Valuation Engine

POST /valuation-engine/valuate          — Run a new valuation
GET  /valuation-engine/history          — Get valuation history
GET  /valuation-engine/latest           — Get most recent valuation
GET  /valuation-engine/{id}             — Get specific valuation
POST /valuation-engine/connect-bank     — Mark bank as connected (Plaid webhook)
POST /valuation-engine/connect-payroll  — Mark payroll as connected
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
from app.models.deal import Deal
from app.models.base import Base
from app.services.claude_ai import claude_deep_valuation
from app.services.audit import audit_service

router = APIRouter()


class BusinessValuation(Base):
    __tablename__ = "business_valuations"
    id = Column(Integer, primary_key=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=True)
    business_description = Column(Text, nullable=True)
    industry = Column(String(255), nullable=True)
    years_in_business = Column(Integer, nullable=True)
    num_employees = Column(Integer, nullable=True)
    owner_hours_per_week = Column(Integer, nullable=True)
    owner_role_description = Column(Text, nullable=True)
    key_customers = Column(Text, nullable=True)
    customer_concentration_pct = Column(Float, nullable=True)
    recurring_revenue_pct = Column(Float, nullable=True)
    has_written_processes = Column(Boolean, nullable=True)
    has_management_team = Column(Boolean, nullable=True)
    growth_rate_pct = Column(Float, nullable=True)
    annual_revenue = Column(Float, nullable=True)
    gross_profit = Column(Float, nullable=True)
    ebitda = Column(Float, nullable=True)
    owner_compensation = Column(Float, nullable=True)
    owner_benefits = Column(Float, nullable=True)
    one_time_expenses = Column(Float, nullable=True)
    inventory_value = Column(Float, nullable=True)
    equipment_value = Column(Float, nullable=True)
    real_estate_value = Column(Float, nullable=True)
    total_debt = Column(Float, nullable=True)
    cash_on_hand = Column(Float, nullable=True)
    has_tax_returns = Column(Boolean, default=False)
    has_bank_connection = Column(Boolean, default=False)
    has_payroll_connection = Column(Boolean, default=False)
    tax_return_years = Column(JSON, nullable=True)
    bank_provider = Column(String(100), nullable=True)
    payroll_provider = Column(String(100), nullable=True)
    ai_valuation = Column(JSON, nullable=True)
    valuation_low = Column(Float, nullable=True)
    valuation_mid = Column(Float, nullable=True)
    valuation_high = Column(Float, nullable=True)
    sde = Column(Float, nullable=True)
    sde_multiple_low = Column(Float, nullable=True)
    sde_multiple_mid = Column(Float, nullable=True)
    sde_multiple_high = Column(Float, nullable=True)
    owner_dependency_score = Column(Integer, nullable=True)
    overall_quality_score = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class ValuationRequest(BaseModel):
    # Business description
    business_description: str
    industry: str
    years_in_business: int = 0
    num_employees: int = 0
    owner_hours_per_week: int = 40
    owner_role_description: str = ""
    key_customers: str = ""
    customer_concentration_pct: float = 0
    recurring_revenue_pct: float = 0
    has_written_processes: bool = False
    has_management_team: bool = False
    growth_rate_pct: float = 0
    # Financials
    annual_revenue: float
    gross_profit: float = 0
    ebitda: float = 0
    owner_compensation: float = 0
    owner_benefits: float = 0
    one_time_expenses: float = 0
    inventory_value: float = 0
    equipment_value: float = 0
    real_estate_value: float = 0
    total_debt: float = 0
    cash_on_hand: float = 0
    # Data sources
    has_tax_returns: bool = False
    has_bank_connection: bool = False
    has_payroll_connection: bool = False
    tax_return_years: list = []
    deal_id: Optional[int] = None


class IntegrationConnect(BaseModel):
    provider: str
    connection_id: Optional[str] = None


@router.post("/valuate")
async def run_valuation(
    data: ValuationRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Run a complete AI business valuation."""
    loop = asyncio.get_running_loop()

    result = await loop.run_in_executor(None, lambda: claude_deep_valuation(
        business_description=data.business_description,
        industry=data.industry,
        years_in_business=data.years_in_business,
        num_employees=data.num_employees,
        owner_hours_per_week=data.owner_hours_per_week,
        owner_role_description=data.owner_role_description,
        key_customers=data.key_customers,
        customer_concentration_pct=data.customer_concentration_pct,
        recurring_revenue_pct=data.recurring_revenue_pct,
        has_written_processes=data.has_written_processes,
        has_management_team=data.has_management_team,
        growth_rate_pct=data.growth_rate_pct,
        annual_revenue=data.annual_revenue,
        gross_profit=data.gross_profit,
        ebitda=data.ebitda,
        owner_compensation=data.owner_compensation,
        owner_benefits=data.owner_benefits,
        one_time_expenses=data.one_time_expenses,
        inventory_value=data.inventory_value,
        equipment_value=data.equipment_value,
        real_estate_value=data.real_estate_value,
        total_debt=data.total_debt,
        cash_on_hand=data.cash_on_hand,
        has_tax_returns=data.has_tax_returns,
        has_bank_connection=data.has_bank_connection,
        has_payroll_connection=data.has_payroll_connection,
        tax_return_years=data.tax_return_years,
    ))

    if not result:
        raise HTTPException(status_code=503, detail="AI service unavailable.")

    vs = result.get("valuation_summary", {})
    od = result.get("owner_dependency", {})

    rec = BusinessValuation(
        owner_id=current_user.id,
        deal_id=data.deal_id,
        business_description=data.business_description,
        industry=data.industry,
        years_in_business=data.years_in_business,
        num_employees=data.num_employees,
        owner_hours_per_week=data.owner_hours_per_week,
        owner_role_description=data.owner_role_description,
        key_customers=data.key_customers,
        customer_concentration_pct=data.customer_concentration_pct,
        recurring_revenue_pct=data.recurring_revenue_pct,
        has_written_processes=data.has_written_processes,
        has_management_team=data.has_management_team,
        growth_rate_pct=data.growth_rate_pct,
        annual_revenue=data.annual_revenue,
        gross_profit=data.gross_profit,
        ebitda=data.ebitda,
        owner_compensation=data.owner_compensation,
        owner_benefits=data.owner_benefits,
        one_time_expenses=data.one_time_expenses,
        inventory_value=data.inventory_value,
        equipment_value=data.equipment_value,
        real_estate_value=data.real_estate_value,
        total_debt=data.total_debt,
        cash_on_hand=data.cash_on_hand,
        has_tax_returns=data.has_tax_returns,
        has_bank_connection=data.has_bank_connection,
        has_payroll_connection=data.has_payroll_connection,
        tax_return_years=data.tax_return_years,
        ai_valuation=result,
        valuation_low=vs.get("valuation_low"),
        valuation_mid=vs.get("valuation_mid"),
        valuation_high=vs.get("valuation_high"),
        sde=vs.get("sde"),
        sde_multiple_low=vs.get("implied_multiple_low"),
        sde_multiple_mid=vs.get("implied_multiple_mid"),
        sde_multiple_high=vs.get("implied_multiple_high"),
        owner_dependency_score=od.get("score"),
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)

    audit_service.log(
        db=db, action="business_valuation_run",
        entity_type="valuation", entity_id=rec.id,
        user_id=current_user.id,
        details={"valuation_mid": vs.get("valuation_mid"), "industry": data.industry}
    )

    return {"valuation_id": rec.id, **result}


@router.get("/history")
async def valuation_history(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get all past valuations for this owner."""
    valuations = db.query(BusinessValuation).filter(
        BusinessValuation.owner_id == current_user.id
    ).order_by(BusinessValuation.created_at.desc()).all()

    return {"valuations": [{
        "id": v.id,
        "industry": v.industry,
        "annual_revenue": v.annual_revenue,
        "valuation_low": v.valuation_low,
        "valuation_mid": v.valuation_mid,
        "valuation_high": v.valuation_high,
        "sde": v.sde,
        "sde_multiple_mid": v.sde_multiple_mid,
        "owner_dependency_score": v.owner_dependency_score,
        "has_bank_connection": v.has_bank_connection,
        "has_payroll_connection": v.has_payroll_connection,
        "has_tax_returns": v.has_tax_returns,
        "executive_summary": v.ai_valuation.get("executive_summary") if v.ai_valuation else None,
        "created_at": v.created_at.isoformat(),
    } for v in valuations]}


@router.get("/latest")
async def latest_valuation(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    v = db.query(BusinessValuation).filter(
        BusinessValuation.owner_id == current_user.id
    ).order_by(BusinessValuation.created_at.desc()).first()

    if not v:
        return {"exists": False}

    return {
        "exists": True,
        "valuation_id": v.id,
        "created_at": v.created_at.isoformat(),
        **(v.ai_valuation or {}),
        "inputs": {
            "industry": v.industry,
            "annual_revenue": v.annual_revenue,
            "ebitda": v.ebitda,
            "owner_hours_per_week": v.owner_hours_per_week,
            "num_employees": v.num_employees,
            "has_bank_connection": v.has_bank_connection,
            "has_payroll_connection": v.has_payroll_connection,
            "has_tax_returns": v.has_tax_returns,
        }
    }


@router.get("/{valuation_id}")
async def get_valuation(
    valuation_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    v = db.query(BusinessValuation).filter(
        BusinessValuation.id == valuation_id,
        BusinessValuation.owner_id == current_user.id,
    ).first()
    if not v:
        raise HTTPException(status_code=404, detail="Valuation not found")

    return {
        "valuation_id": v.id,
        "created_at": v.created_at.isoformat(),
        **(v.ai_valuation or {}),
        "inputs": {
            "business_description": v.business_description,
            "industry": v.industry,
            "annual_revenue": v.annual_revenue,
            "gross_profit": v.gross_profit,
            "ebitda": v.ebitda,
            "owner_compensation": v.owner_compensation,
            "owner_benefits": v.owner_benefits,
            "one_time_expenses": v.one_time_expenses,
            "owner_hours_per_week": v.owner_hours_per_week,
            "num_employees": v.num_employees,
            "years_in_business": v.years_in_business,
            "customer_concentration_pct": v.customer_concentration_pct,
            "recurring_revenue_pct": v.recurring_revenue_pct,
            "has_written_processes": v.has_written_processes,
            "has_management_team": v.has_management_team,
            "growth_rate_pct": v.growth_rate_pct,
            "inventory_value": v.inventory_value,
            "equipment_value": v.equipment_value,
            "real_estate_value": v.real_estate_value,
            "total_debt": v.total_debt,
            "cash_on_hand": v.cash_on_hand,
            "has_bank_connection": v.has_bank_connection,
            "has_payroll_connection": v.has_payroll_connection,
            "has_tax_returns": v.has_tax_returns,
            "tax_return_years": v.tax_return_years,
        }
    }


@router.post("/connect-bank")
async def connect_bank(
    data: IntegrationConnect,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Record that user has connected their bank account (via Plaid or similar)."""
    # Update the most recent valuation or store as a preference
    latest = db.query(BusinessValuation).filter(
        BusinessValuation.owner_id == current_user.id
    ).order_by(BusinessValuation.created_at.desc()).first()

    if latest:
        latest.has_bank_connection = True
        latest.bank_provider = data.provider
        db.commit()

    return {
        "connected": True,
        "provider": data.provider,
        "message": f"{data.provider} connected. Re-run your valuation to include bank data."
    }


@router.post("/connect-payroll")
async def connect_payroll(
    data: IntegrationConnect,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Record that user has connected their payroll provider."""
    latest = db.query(BusinessValuation).filter(
        BusinessValuation.owner_id == current_user.id
    ).order_by(BusinessValuation.created_at.desc()).first()

    if latest:
        latest.has_payroll_connection = True
        latest.payroll_provider = data.provider
        db.commit()

    return {
        "connected": True,
        "provider": data.provider,
        "message": f"{data.provider} connected. Re-run your valuation to include payroll data."
    }

@router.get("/from-deal/{deal_id}")
async def prefill_from_deal(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Pre-fill valuation inputs from an existing deal submission."""
    from app.models.deal import Deal, DealRiskReport

    deal = db.query(Deal).filter(
        Deal.id == deal_id,
        Deal.borrower_id == current_user.id,
    ).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    # Get latest risk report for valuation data
    rpt = db.query(DealRiskReport).filter(
        DealRiskReport.deal_id == deal_id
    ).order_by(DealRiskReport.version.desc()).first()

    # Calculate addbacks total
    addbacks_total = 0
    if deal.addbacks:
        addbacks_total = sum(a.get('amount', 0) for a in deal.addbacks if isinstance(a, dict))

    # SDE = normalized_sde from report or calculate manually
    sde = (rpt.normalized_sde if rpt and rpt.normalized_sde else
           (deal.ebitda + (deal.owner_draw_annual or 0) + addbacks_total))

    return {
        "deal_id": deal_id,
        "deal_name": deal.name,
        "prefilled": {
            "business_description": deal.business_description or f"{deal.name} — {deal.industry} business",
            "industry": deal.industry,
            "annual_revenue": deal.annual_revenue,
            "gross_profit": deal.gross_profit or 0,
            "ebitda": deal.ebitda,
            "owner_compensation": deal.owner_draw_annual or 0,
            "owner_benefits": 0,
            "one_time_expenses": addbacks_total,
            "inventory_value": 0,
            "equipment_value": sum(
                a.get('value', 0) for a in (deal.business_assets or [])
                if isinstance(a, dict) and a.get('type') in ('equipment', 'machinery', 'vehicle')
            ) if deal.business_assets else 0,
            "real_estate_value": sum(
                a.get('value', 0) for a in (deal.business_assets or [])
                if isinstance(a, dict) and a.get('type') == 'real_estate'
            ) if deal.business_assets else 0,
            "total_debt": deal.loan_amount_requested or 0,
            "cash_on_hand": 0,
            "years_in_business": deal.owner_experience_years or 0,
            "num_employees": 0,
            "owner_hours_per_week": 50,
            "growth_rate_pct": 0,
            # From risk report if available
            "current_value": rpt.equity_value_mid if rpt else None,
            "current_multiple": rpt.sde_multiple_implied if rpt else None,
            "has_tax_returns": any(
                d.document_type == 'tax_return'
                for d in deal.documents
            ) if deal.documents else False,
        },
        # Pass through risk report data for context
        "risk_report": {
            "health_score": rpt.health_score if rpt else None,
            "dscr": rpt.dscr_base if rpt else None,
            "equity_value_low": rpt.equity_value_low if rpt else None,
            "equity_value_mid": rpt.equity_value_mid if rpt else None,
            "equity_value_high": rpt.equity_value_high if rpt else None,
            "normalized_sde": rpt.normalized_sde if rpt else None,
            "sde_multiple": rpt.sde_multiple_implied if rpt else None,
        } if rpt else None,
    }
