"""
underwrite-platform — app/services/claude_ai.py

Claude-powered replacements for Heradyne's rules-based engines.

Replaces 4 engines with live Anthropic API calls:
  1. RiskScoringEngine.score_deal()        → claude_score_deal()
  2. MonitoringEngine.assess_loan()        → claude_monitor_loan()
  3. Deal advisory / chat                  → claude_deal_chat()
  4. ActuarialPricingEngine               → claude_actuarial_price()

The UnderwriteOS math engines (health score, DSCR, valuation, SBA,
deal killer, cash flow, playbooks) remain as pure Python — they are
more reliable and faster for deterministic financial calculations.
Claude adds judgment, explanation, and context on top of the numbers.

Usage: set ANTHROPIC_API_KEY in environment. If key is absent or the
call fails, all functions fall back gracefully to the original
rules-based engine so the app never breaks.
"""

from __future__ import annotations
import os
import json
import logging
import urllib.request
import urllib.error
from typing import Any, Optional

log = logging.getLogger("claude_ai")

MODEL = "claude-sonnet-4-20250514"
MAX_TOKENS = 1500
API_URL = "https://api.anthropic.com/v1/messages"


# ─── Core call ──────────────────────────────────────────────────────────────

def _call_claude(system: str, user: str, max_tokens: int = MAX_TOKENS) -> Optional[str]:
    """
    Make a single Claude API call. Returns the text response or None on failure.
    Never raises — callers should handle None by falling back to rules engine.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        log.warning("ANTHROPIC_API_KEY not set — falling back to rules engine")
        return None

    payload = json.dumps({
        "model": MODEL,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }).encode("utf-8")

    req = urllib.request.Request(
        API_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
            return data["content"][0]["text"]
    except urllib.error.HTTPError as e:
        log.error(f"Claude API HTTP error {e.code}: {e.read().decode()[:200]}")
        return None
    except Exception as e:
        log.error(f"Claude API error: {e}")
        return None


def _parse_json(text: str) -> Optional[dict]:
    """Extract JSON from Claude response, stripping markdown fences."""
    if not text:
        return None
    clean = text.strip()
    if clean.startswith("```"):
        lines = clean.split("\n")
        clean = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])
    try:
        return json.loads(clean)
    except Exception:
        # Try to find JSON object in the text
        start = clean.find("{")
        end = clean.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(clean[start:end])
            except Exception:
                pass
    log.warning(f"Could not parse JSON from Claude response: {clean[:100]}")
    return None


# ─── ENGINE 1: Deal Risk Scoring ────────────────────────────────────────────

SCORING_SYSTEM = """You are an SBA 7(a) underwriting AI with deep knowledge of the 1.59 million loan 
SBA dataset (FY2000–2024). You score SMB acquisition and growth deals across 5 categories 
exactly like an experienced SBA lender would.

You ALWAYS respond with valid JSON only — no markdown, no preamble, no explanation outside the JSON.

Score each deal and return this exact structure:
{
  "composite_score": <0-100 float>,
  "tier": <"preferred"|"standard"|"elevated"|"high_risk"|"decline">,
  "tier_display": <human-readable tier label>,
  "recommended_premium": <annual premium as decimal, e.g. 0.025>,
  "expected_annual_default_rate": <float, e.g. 0.032>,
  "foia_benchmark_rate": <SBA cohort benchmark, e.g. 0.035>,
  "decision": <"approve"|"approve_with_conditions"|"refer"|"decline">,
  "monitoring_frequency": <"standard"|"enhanced"|"intensive"|"monthly">,
  "risk_flags": [<list of specific concerns, max 5>],
  "positive_factors": [<list of strengths, max 5>],
  "category_scores": {
    "structural": <0-100>,
    "financial": <0-100>,
    "operator": <0-100>,
    "asset": <0-100>,
    "geographic": <0-100>
  },
  "key_insight": "<one-sentence expert judgment that a rules engine could never produce>"
}

Scoring anchors (from SBA dataset):
- DSCR ≥ 1.50: strong positive; < 1.20: significant concern; < 1.0: likely decline
- Equity injection ≥ 20%: strong signal; < 10%: red flag
- Business age ≥ 10 years: preferred; < 3 years: elevated risk
- SDE multiple ≤ 3.0×: conservative; > 4.5×: aggressive
- Credit score ≥ 720: standard; < 660: high risk
- Industry: CoO (change of ownership) defaults 40% less than expansion loans"""


def claude_score_deal(deal_data: dict) -> Optional[dict]:
    """
    Score a deal using Claude instead of the rules-based RiskScoringEngine.
    Returns dict matching RiskScoreResult fields, or None to trigger fallback.
    """
    user_msg = f"""Score this SMB deal for SBA 7(a) financing:

DEAL DATA:
{json.dumps(deal_data, indent=2)}

Provide your expert underwriting assessment as JSON."""

    text = _call_claude(SCORING_SYSTEM, user_msg)
    result = _parse_json(text)
    if not result:
        return None

    # Normalize to match the shape the endpoint expects
    return {
        "composite_score": float(result.get("composite_score", 65)),
        "tier": result.get("tier", "standard"),
        "tier_display": result.get("tier_display", "Standard"),
        "recommended_premium": float(result.get("recommended_premium", 0.025)),
        "expected_annual_default_rate": float(result.get("expected_annual_default_rate", 0.035)),
        "foia_benchmark_rate": float(result.get("foia_benchmark_rate", 0.035)),
        "decision": result.get("decision", "refer"),
        "monitoring_frequency": result.get("monitoring_frequency", "standard"),
        "risk_flags": result.get("risk_flags", []),
        "positive_factors": result.get("positive_factors", []),
        "category_scores": result.get("category_scores", {}),
        "key_insight": result.get("key_insight", ""),
        "variables_evaluated": len(deal_data),
        "variables_missing": [],
        "scored_at": __import__("datetime").datetime.utcnow().isoformat(),
        "_powered_by": "claude",
    }


# ─── ENGINE 2: Loan Monitoring ──────────────────────────────────────────────

MONITORING_SYSTEM = """You are an SBA loan portfolio monitoring AI. You assess active loans 
for early warning signals using the same 18-variable framework SBA lenders use for 
post-origination monitoring.

You ALWAYS respond with valid JSON only.

Return this exact structure:
{
  "health_score": <0-100 int>,
  "alert_level": <"none"|"watch"|"advisory"|"escalation"|"pre_claim">,
  "alert_level_display": <human label>,
  "active_alerts": [
    {
      "variable_name": "<what triggered>",
      "severity": <"low"|"medium"|"high"|"critical">,
      "message": "<specific actionable description>",
      "recommended_action": "<concrete next step>"
    }
  ],
  "positive_signals": [<list of healthy indicators>],
  "trend_direction": <"improving"|"stable"|"deteriorating"|"critical">,
  "estimated_months_to_default_risk": <null or integer>,
  "recommended_intervention": "<specific next action for the lender/insurer>",
  "key_insight": "<one sentence expert judgment>"
}

Alert level guidance:
- none: health ≥ 80, all metrics green
- watch: health 65-79, one soft concern  
- advisory: health 50-64, multiple concerns, action recommended in 30 days
- escalation: health 35-49, immediate lender contact required, 14-day deadline
- pre_claim: health < 35, loss likely without intervention, 1-day deadline"""


def claude_monitor_loan(loan_data: dict, monitoring_data: dict) -> Optional[dict]:
    """
    Assess a funded loan using Claude instead of MonitoringEngine.
    Returns dict matching MonitoringResult shape, or None to trigger fallback.
    """
    user_msg = f"""Assess this active SBA loan for early warning signals:

LOAN INFO:
{json.dumps(loan_data, indent=2)}

CURRENT MONITORING DATA:
{json.dumps(monitoring_data, indent=2)}

Provide your expert monitoring assessment as JSON."""

    text = _call_claude(MONITORING_SYSTEM, user_msg)
    result = _parse_json(text)
    if not result:
        return None

    return {
        "loan_id": loan_data.get("loan_id"),
        "loan_number": loan_data.get("loan_number", ""),
        "borrower_name": loan_data.get("borrower_name", ""),
        "health_score": int(result.get("health_score", 70)),
        "alert_level": result.get("alert_level", "none"),
        "alert_level_display": result.get("alert_level_display", "No Alert"),
        "active_alerts": result.get("active_alerts", []),
        "positive_signals": result.get("positive_signals", []),
        "trend_direction": result.get("trend_direction", "stable"),
        "estimated_months_to_default_risk": result.get("estimated_months_to_default_risk"),
        "recommended_intervention": result.get("recommended_intervention", ""),
        "key_insight": result.get("key_insight", ""),
        "assessed_at": __import__("datetime").datetime.utcnow().isoformat(),
        "_powered_by": "claude",
    }


# ─── ENGINE 3: Deal Advisory Chat ───────────────────────────────────────────

CHAT_SYSTEM = """You are an expert SBA 7(a) acquisition underwriter and CFO advisor embedded 
in the UnderwriteOS platform. You have access to full deal data, risk reports, and 
UnderwriteOS analysis outputs for the deal in context.

Your role: give the user specific, dollar-quantified, actionable advice — not generic commentary.
Speak like a senior deal advisor who has closed hundreds of SBA transactions.

Rules:
- Always ground your response in the specific numbers from the deal data provided
- Be direct. Users pay for clarity, not caveats
- When asked about risks, give specific dollar impact estimates
- When asked about actions, give numbered steps with dollar amounts and named vendors
- Mention DSCR, SDE, health score, and playbooks by their specific values when relevant
- Keep responses concise — 150-300 words unless a detailed analysis is explicitly requested
- Never say "I cannot" — reframe as what you CAN do
- End with one specific next action the user should take today"""


def claude_deal_chat(
    user_message: str,
    deal_data: dict,
    risk_report: dict,
    uw_data: dict,
    conversation_history: list = None,
) -> Optional[str]:
    """
    AI chat about a specific deal. Uses full deal context.
    Returns response text or None to trigger fallback.
    """
    context = f"""DEAL CONTEXT:
Name: {deal_data.get('name', 'Unknown')}
Industry: {deal_data.get('industry', 'Unknown')}
Revenue: ${deal_data.get('annual_revenue', 0):,.0f}
EBITDA: ${deal_data.get('ebitda', 0):,.0f}
Purchase price: ${deal_data.get('purchase_price', 0):,.0f}
Loan requested: ${deal_data.get('loan_amount_requested', 0):,.0f}
Equity injection: ${deal_data.get('equity_injection', 0):,.0f}

HERADYNE ANALYSIS:
DSCR (base): {risk_report.get('dscr_base', 'N/A')}
DSCR (stress): {risk_report.get('dscr_stress', 'N/A')}
Annual PD: {risk_report.get('annual_pd', 'N/A')}
EV range: ${risk_report.get('ev_low', 0):,.0f} – ${risk_report.get('ev_high', 0):,.0f}
Collateral coverage: {risk_report.get('collateral_coverage', 'N/A')}

UNDERWRITEOS ANALYSIS:
Health score: {uw_data.get('health_score', {}).get('score', 'N/A')}/100
PDSCR: {uw_data.get('dscr_pdscr', {}).get('pdscr', 'N/A')}
Cash runway: {uw_data.get('cash_flow_forecast', {}).get('runway_months', 'N/A')} months
SBA eligible: {uw_data.get('sba_eligibility', {}).get('eligible', 'N/A')}
Deal verdict: {uw_data.get('deal_killer', {}).get('verdict', 'N/A')}
Deal confidence: {uw_data.get('deal_killer', {}).get('confidence_score', 'N/A')}/100
Max supportable price: ${uw_data.get('deal_killer', {}).get('max_supportable_price', 0):,.0f}
Normalized SDE: ${uw_data.get('valuation', {}).get('normalized_sde', 0):,.0f}
Equity value range: ${uw_data.get('valuation', {}).get('equity_value_low', 0):,.0f} – ${uw_data.get('valuation', {}).get('equity_value_high', 0):,.0f}

PLAYBOOKS:
{json.dumps([{'title': p.get('title'), 'severity': p.get('severity'), 'impact': p.get('estimated_annual_impact')} for p in uw_data.get('playbooks', [])], indent=2)}"""

    messages = []
    # Add conversation history
    if conversation_history:
        for msg in conversation_history[-6:]:  # last 6 messages for context
            messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": f"{context}\n\nUSER QUESTION: {user_message}"})

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        log.warning("ANTHROPIC_API_KEY not set")
        return None

    payload = json.dumps({
        "model": MODEL,
        "max_tokens": 600,
        "system": CHAT_SYSTEM,
        "messages": messages,
    }).encode("utf-8")

    req = urllib.request.Request(
        API_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
            return data["content"][0]["text"]
    except Exception as e:
        log.error(f"Claude chat error: {e}")
        return None


# ─── ENGINE 4: Actuarial Pricing ────────────────────────────────────────────

ACTUARIAL_SYSTEM = """You are a senior actuarial AI specializing in SBA 7(a) credit insurance pricing.
You use frequency-severity methodology anchored to SBA FOIA charge-off data.

You ALWAYS respond with valid JSON only — no markdown, no explanation outside the JSON.

Return this exact structure:
{
  "pure_premium": <annual loss rate as decimal, e.g. 0.018>,
  "risk_load": <additional load for variance, e.g. 0.004>,
  "expense_load": <operating expense load, e.g. 0.005>,
  "profit_margin": <target margin, e.g. 0.003>,
  "indicated_rate": <total annual rate, e.g. 0.030>,
  "indicated_rate_low": <optimistic scenario rate>,
  "indicated_rate_high": <conservative scenario rate>,
  "monthly_premium_dollars": <dollar amount per month>,
  "annual_premium_dollars": <dollar amount per year>,
  "risk_decision": <"accept"|"accept_with_conditions"|"refer"|"decline">,
  "expected_loss_ratio": <expected losses / premium, e.g. 0.60>,
  "pd_estimate": <probability of default, e.g. 0.045>,
  "lgd_estimate": <loss given default, e.g. 0.40>,
  "cohort_benchmark_rate": <SBA historical rate for similar loans>,
  "credibility_weight": <how much weight on this deal vs cohort, 0-1>,
  "key_risk_factors": [<top 3 drivers of this premium>],
  "pricing_rationale": "<2-3 sentence actuarial explanation of the pricing>",
  "conditions": [<any conditions for acceptance, empty list if none>]
}

Actuarial anchors from SBA dataset:
- Overall SBA 7(a) charge-off rate: ~3.5% (varies widely by cohort)
- Manufacturing: ~2.8%, Technology: ~4.1%, Restaurants: ~8.2%, Healthcare: ~2.2%
- LGD typically 35-55% after SBA guarantee recovery
- DSCR 1.50+: PD multiplier ~0.7; DSCR 1.20-1.49: 1.0; DSCR <1.20: 1.4-1.8
- Equity injection: each 5% above minimum reduces PD ~18%
- Business age: each year reduces PD ~13.6%"""


def claude_actuarial_price(submission: dict, policy_terms: dict) -> Optional[dict]:
    """
    Price an SBA credit insurance submission using Claude.
    Returns dict matching PricingResult shape, or None to trigger fallback.
    """
    loan_amount = submission.get("loan_amount", 0)

    user_msg = f"""Price this SBA 7(a) credit insurance submission:

SUBMISSION:
{json.dumps(submission, indent=2)}

POLICY TERMS:
{json.dumps(policy_terms, indent=2)}

Calculate the indicated annual premium rate and provide full actuarial breakdown as JSON.
The loan amount is ${loan_amount:,.0f}."""

    text = _call_claude(ACTUARIAL_SYSTEM, user_msg, max_tokens=800)
    result = _parse_json(text)
    if not result:
        return None

    # Fill in derived fields
    rate = float(result.get("indicated_rate", 0.030))
    result["monthly_premium_dollars"] = round(loan_amount * rate / 12, 2)
    result["annual_premium_dollars"] = round(loan_amount * rate, 2)
    result["_powered_by"] = "claude"
    return result


# ─── ENGINE 5: Portfolio Playbook Generation ─────────────────────────────────

PLAYBOOK_SYSTEM = """You are a CFO-level business advisor specializing in SMB turnarounds and 
SBA acquisition businesses. You generate specific, dollar-quantified action plans.

You ALWAYS respond with valid JSON only.

Return a list of playbooks:
[
  {
    "title": "<specific problem + impact>",
    "severity": <"critical"|"warning"|"opportunity">,
    "trigger": "<what metric/threshold triggered this>",
    "impact_summary": "<one sentence dollar-quantified impact>",
    "estimated_annual_impact": <dollar amount>,
    "actions": [
      {
        "step": <1|2|3>,
        "label": "<time horizon: Immediate/This week/30 days/90 days>",
        "detail": "<specific action with named vendors, dollar amounts, and exact steps>",
        "dollar_impact": <estimated dollar impact of this action>
      }
    ]
  }
]

Rules:
- Every action must have a specific dollar amount
- Name actual vendors, tools, or resources (e.g. ServiceTitan, QuickBooks, SBA Form 413)
- Lead with the most critical/highest-impact playbook first
- Maximum 5 playbooks
- Minimum 2 actions per playbook
- Be brutally specific — no generic advice"""


def claude_generate_playbooks(deal_data: dict, financial_data: dict, uw_metrics: dict) -> Optional[list]:
    """
    Generate deal-specific playbooks using Claude instead of the rules-based generator.
    Returns list of playbook dicts or None to trigger fallback.
    """
    user_msg = f"""Generate actionable playbooks for this SMB acquisition deal:

DEAL:
{json.dumps(deal_data, indent=2)}

FINANCIAL METRICS:
{json.dumps(financial_data, indent=2)}

UNDERWRITEOS METRICS:
{json.dumps(uw_metrics, indent=2)}

Create specific, dollar-quantified playbooks as JSON."""

    text = _call_claude(PLAYBOOK_SYSTEM, user_msg, max_tokens=2000)
    if not text:
        return None

    # Try parsing as list
    clean = text.strip()
    if clean.startswith("```"):
        lines = clean.split("\n")
        clean = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])
    try:
        result = json.loads(clean)
        if isinstance(result, list):
            return result
        if isinstance(result, dict) and "playbooks" in result:
            return result["playbooks"]
    except Exception:
        # Try to find array in text
        start = clean.find("[")
        end = clean.rfind("]") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(clean[start:end])
            except Exception:
                pass
    return None
