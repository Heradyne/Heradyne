"""
underwrite-platform — app/api/v1/endpoints/deal_chat.py

Claude-powered deal advisory chat.
Gives users a conversational AI that knows their specific deal numbers —
DSCR, SDE, health score, playbooks, valuation — and answers questions
about it with the depth of a senior SBA underwriter.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User, UserRole
from app.models.deal import Deal, DealRiskReport
from app.services.claude_ai import claude_deal_chat
from app.services.audit import audit_service

router = APIRouter()


class ChatMessage(BaseModel):
    role: str   # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []


class ChatResponse(BaseModel):
    reply: str
    powered_by: str
    deal_id: int


FALLBACK_RESPONSES = {
    "dscr": "Based on the deal data, the DSCR analysis is available in the UnderwriteOS risk report above. Set ANTHROPIC_API_KEY to enable AI-powered advisory.",
    "default": "AI advisory requires ANTHROPIC_API_KEY to be set. The UnderwriteOS analysis panels above show all key metrics including health score, deal verdict, valuation, playbooks, and SBA eligibility.",
}


@router.post("/deals/{deal_id}/chat", response_model=ChatResponse)
def chat_about_deal(
    deal_id: int,
    request: ChatRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Conversational AI advisor with full deal context.
    Answers questions about DSCR, valuation, playbooks, SBA eligibility,
    deal risks, and specific next steps — all grounded in this deal's numbers.
    """
    # Access check
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    if current_user.role == UserRole.BORROWER and deal.borrower_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Get latest risk report
    rpt = db.query(DealRiskReport).filter(
        DealRiskReport.deal_id == deal_id
    ).order_by(DealRiskReport.version.desc()).first()

    # Build deal context dicts
    deal_data = {
        "name": deal.name,
        "industry": deal.industry,
        "deal_type": str(deal.deal_type),
        "annual_revenue": deal.annual_revenue,
        "ebitda": deal.ebitda,
        "gross_profit": deal.gross_profit,
        "capex": deal.capex,
        "purchase_price": deal.purchase_price,
        "loan_amount_requested": deal.loan_amount_requested,
        "equity_injection": deal.equity_injection,
        "loan_term_months": deal.loan_term_months,
        "owner_credit_score": deal.owner_credit_score,
        "owner_experience_years": deal.owner_experience_years,
        "addbacks": deal.addbacks or [],
    }

    risk_report = {}
    uw_data = {}

    if rpt:
        risk_report = {
            "dscr_base": rpt.dscr_base,
            "dscr_stress": rpt.dscr_stress,
            "annual_pd": rpt.annual_pd,
            "ev_low": rpt.ev_low, "ev_mid": rpt.ev_mid, "ev_high": rpt.ev_high,
            "collateral_coverage": rpt.collateral_coverage,
            "recommended_guarantee_pct": rpt.recommended_guarantee_pct,
            "business_nolv": rpt.business_nolv,
            "personal_nolv": rpt.personal_nolv,
        }
        uw_data = {
            "health_score": {
                "score": rpt.health_score,
                "cashflow": rpt.health_score_cashflow,
                "stability": rpt.health_score_stability,
                "growth": rpt.health_score_growth,
                "liquidity": rpt.health_score_liquidity,
                "distress": rpt.health_score_distress,
            },
            "dscr_pdscr": {
                "dscr_base": rpt.dscr_base,
                "pdscr": rpt.pdscr,
                "owner_draw_annual": rpt.owner_draw_annual,
                "premium_capacity_monthly": rpt.premium_capacity_monthly,
            },
            "valuation": {
                "normalized_sde": rpt.normalized_sde,
                "sde_multiple_implied": rpt.sde_multiple_implied,
                "equity_value_low": rpt.equity_value_low,
                "equity_value_mid": rpt.equity_value_mid,
                "equity_value_high": rpt.equity_value_high,
                "net_debt": rpt.net_debt,
            },
            "sba_eligibility": {
                "eligible": rpt.sba_eligible,
                "max_loan": rpt.sba_max_loan,
            },
            "deal_killer": {
                "verdict": rpt.deal_killer_verdict,
                "confidence_score": rpt.deal_confidence_score,
                "max_supportable_price": rpt.max_supportable_price,
            },
            "cash_flow_forecast": {
                "runway_months": rpt.cash_runway_months,
            },
            "playbooks": rpt.playbooks or [],
        }

    # Convert history
    history = [{"role": m.role, "content": m.content} for m in request.history]

    # Call Claude
    reply = claude_deal_chat(
        user_message=request.message,
        deal_data=deal_data,
        risk_report=risk_report,
        uw_data=uw_data,
        conversation_history=history,
    )

    powered_by = "claude"
    if not reply:
        # Fallback response
        msg_lower = request.message.lower()
        if "dscr" in msg_lower or "debt service" in msg_lower:
            reply = FALLBACK_RESPONSES["dscr"]
        else:
            reply = FALLBACK_RESPONSES["default"]
        powered_by = "fallback"

    audit_service.log(
        db=db, action="deal_chat", entity_type="deal",
        entity_id=deal_id, user_id=current_user.id,
        details={"powered_by": powered_by, "message_length": len(request.message)}
    )

    return ChatResponse(reply=reply, powered_by=powered_by, deal_id=deal_id)


@router.post("/chat", response_model=ChatResponse)
def general_chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    General SBA underwriting chat — no deal context required.
    Useful for platform-level questions about SBA rules, QSBS, deal structures etc.
    """
    from app.services.claude_ai import _call_claude

    system = """You are an expert SBA 7(a) underwriter, CFO advisor, and acquisition specialist 
embedded in the UnderwriteOS platform. Answer questions about SBA rules, deal structuring, 
valuation, DSCR analysis, QSBS eligibility, portfolio reserve strategy, and SMB acquisitions.
Be specific, practical, and direct. Reference real SBA data and thresholds."""

    reply = _call_claude(system, request.message, max_tokens=600)
    powered_by = "claude"

    if not reply:
        reply = "AI chat requires ANTHROPIC_API_KEY. Please set this environment variable to enable AI advisory."
        powered_by = "fallback"

    return ChatResponse(reply=reply, powered_by=powered_by, deal_id=0)
