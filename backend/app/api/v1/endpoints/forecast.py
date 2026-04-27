"""
Business Decision Forecaster

POST /forecast/run           — Run a forecast with decisions
GET  /forecast/history       — Past forecasts
GET  /forecast/{id}          — Get specific forecast
"""

import asyncio
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, Float, Boolean, Text, JSON, DateTime, ForeignKey
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User
from app.models.base import Base
from app.services.claude_ai import claude_business_forecast
from app.services.audit import audit_service

router = APIRouter()


class BusinessForecast(Base):
    __tablename__ = "business_forecasts"
    id = Column(Integer, primary_key=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    valuation_id = Column(Integer, ForeignKey("business_valuations.id"), nullable=True)
    decisions = Column(JSON, nullable=True)
    ai_forecast = Column(JSON, nullable=True)
    scenario_used = Column(String(50), nullable=True, default="base")
    created_at = Column(DateTime, default=datetime.utcnow)


class Decision(BaseModel):
    type: str  # HIRE_MANAGER, ADD_SERVICE_LINE, RAISE_PRICES, etc.
    description: str
    timeline_months: int = 12
    investment_required: float = 0
    revenue_impact_pct: float = 0
    cost_impact: float = 0  # monthly cost change


class ForecastRequest(BaseModel):
    # Current state (required)
    business_description: str
    industry: str
    annual_revenue: float
    ebitda: float = 0
    sde: float = 0
    current_value: float = 0
    owner_hours_per_week: float = 40
    num_employees: int = 0
    customer_concentration_pct: float = 0
    recurring_revenue_pct: float = 0
    owner_dependency_score: int = 50
    current_multiple: float = 2.5
    cash_on_hand: float = 0
    growth_rate_pct: float = 0
    # Decisions
    decisions: List[Decision] = []
    # Link to a valuation if we have one
    valuation_id: Optional[int] = None


@router.post("/run")
async def run_forecast(
    data: ForecastRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(None, lambda: claude_business_forecast(
        business_description=data.business_description,
        industry=data.industry,
        annual_revenue=data.annual_revenue,
        ebitda=data.ebitda,
        sde=data.sde,
        current_value=data.current_value,
        owner_hours_per_week=data.owner_hours_per_week,
        num_employees=data.num_employees,
        customer_concentration_pct=data.customer_concentration_pct,
        recurring_revenue_pct=data.recurring_revenue_pct,
        owner_dependency_score=data.owner_dependency_score,
        current_multiple=data.current_multiple,
        cash_on_hand=data.cash_on_hand,
        growth_rate_pct=data.growth_rate_pct,
        decisions=[d.dict() for d in data.decisions],
    ))

    if not result:
        raise HTTPException(status_code=503, detail="AI service unavailable.")

    rec = BusinessForecast(
        owner_id=current_user.id,
        valuation_id=data.valuation_id,
        decisions=[d.dict() for d in data.decisions],
        ai_forecast=result,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)

    audit_service.log(
        db=db, action="business_forecast_run",
        entity_type="forecast", entity_id=rec.id,
        user_id=current_user.id,
        details={"decisions": len(data.decisions), "industry": data.industry}
    )

    return {"forecast_id": rec.id, **result}


@router.get("/history")
async def forecast_history(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    forecasts = db.query(BusinessForecast).filter(
        BusinessForecast.owner_id == current_user.id
    ).order_by(BusinessForecast.created_at.desc()).limit(20).all()

    return {"forecasts": [{
        "id": f.id,
        "decisions": f.decisions,
        "decision_count": len(f.decisions or []),
        "key_insight": (f.ai_forecast or {}).get("forecast_summary", {}).get("key_insight"),
        "created_at": f.created_at.isoformat(),
    } for f in forecasts]}


@router.get("/{forecast_id}")
async def get_forecast(
    forecast_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    f = db.query(BusinessForecast).filter(
        BusinessForecast.id == forecast_id,
        BusinessForecast.owner_id == current_user.id,
    ).first()
    if not f:
        raise HTTPException(status_code=404, detail="Forecast not found")

    return {
        "forecast_id": f.id,
        "decisions": f.decisions,
        "created_at": f.created_at.isoformat(),
        **(f.ai_forecast or {}),
    }
