"""
underwrite-platform — app/services/claude_ai.py

Claude-powered AI engines for UnderwriteOS + Heradyne.

Every engine receives actual deal numbers and is prompted to:
  1. Reference specific metrics by name and value
  2. Explain WHY each metric drives the score/verdict/recommendation  
  3. Quantify every risk and opportunity in dollars
  4. Produce output the display layer renders with full context

Engines:
  1. claude_score_deal()         — SBA risk scoring with per-category rationale
  2. claude_monitor_loan()       — Post-funding monitoring with trend analysis
  3. claude_deal_chat()          — Conversational advisor with full deal context
  4. claude_actuarial_price()    — Credit insurance pricing with actuarial rationale
  5. claude_generate_playbooks() — Deal-specific action plans with named vendors
  6. claude_analyze_deal()       — Master synthesis: verdict + narrative + next steps
"""

from __future__ import annotations
import os, json, logging, urllib.request, urllib.error
from typing import Any, Optional

log = logging.getLogger("claude_ai")
MODEL = "claude-sonnet-4-20250514"
API_URL = "https://api.anthropic.com/v1/messages"

INDUSTRY_COHORT_RATES = {
    "plumbing": 0.028, "hvac": 0.028, "electrical": 0.031, "roofing": 0.035,
    "landscaping": 0.038, "cleaning": 0.042, "auto_repair": 0.045,
    "restaurant": 0.082, "retail": 0.055, "healthcare": 0.022,
    "manufacturing": 0.029, "technology": 0.041, "construction": 0.038,
    "transportation": 0.044, "childcare": 0.033, "fitness": 0.052,
    "services": 0.038, "other": 0.040,
}


def _call_claude(system: str, user: str, max_tokens: int = 1500) -> Optional[str]:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        log.warning("ANTHROPIC_API_KEY not set")
        return None
    payload = json.dumps({
        "model": MODEL, "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }).encode("utf-8")
    req = urllib.request.Request(API_URL, data=payload, headers={
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    }, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            return json.loads(resp.read())["content"][0]["text"]
    except urllib.error.HTTPError as e:
        log.error(f"Claude HTTP {e.code}: {e.read().decode()[:200]}")
    except Exception as e:
        log.error(f"Claude error: {e}")
    return None


def _parse_json(text: str) -> Optional[dict]:
    if not text: return None
    clean = text.strip()
    if clean.startswith("```"):
        lines = clean.split("\n")
        clean = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    try:
        return json.loads(clean)
    except Exception:
        s, e = clean.find("{"), clean.rfind("}") + 1
        if s >= 0 and e > s:
            try: return json.loads(clean[s:e])
            except Exception: pass
    log.warning(f"Could not parse JSON: {clean[:100]}")
    return None


def _parse_list(text: str) -> Optional[list]:
    if not text: return None
    clean = text.strip()
    if clean.startswith("```"):
        lines = clean.split("\n")
        clean = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    try:
        r = json.loads(clean)
        if isinstance(r, list): return r
        if isinstance(r, dict) and "playbooks" in r: return r["playbooks"]
    except Exception:
        s, e = clean.find("["), clean.rfind("]") + 1
        if s >= 0 and e > s:
            try: return json.loads(clean[s:e])
            except Exception: pass
    return None


# ── ENGINE 1: Deal Risk Scoring ──────────────────────────────────────────────

SCORING_SYSTEM = """You are a senior SBA 7(a) underwriter with 20 years experience and deep knowledge of the 1.59M loan SBA FOIA dataset (FY2000-2024).

Score deals across 5 categories. For EACH category you MUST reference the specific metric values provided and explain in one sentence why that metric drives the score.

Respond with valid JSON only. No markdown. No preamble.

{
  "composite_score": <0-100 float>,
  "tier": <"preferred"|"standard"|"elevated"|"high_risk"|"decline">,
  "tier_display": <e.g. "Preferred — Top 20% of SBA Applicants">,
  "decision": <"approve"|"approve_with_conditions"|"refer"|"decline">,
  "monitoring_frequency": <"quarterly"|"semi-annual"|"monthly"|"intensive">,
  "recommended_premium": <annual insurance rate decimal>,
  "expected_annual_default_rate": <float>,
  "foia_benchmark_rate": <SBA cohort benchmark for this industry+size>,
  "category_scores": {
    "structural": {"score": <0-100>, "weight": 0.25, "rationale": "<cite specific metrics>"},
    "financial": {"score": <0-100>, "weight": 0.30, "rationale": "<cite actual numbers>"},
    "operator": {"score": <0-100>, "weight": 0.20, "rationale": "<cite credit, experience>"},
    "asset": {"score": <0-100>, "weight": 0.15, "rationale": "<cite collateral coverage, LTV>"},
    "geographic": {"score": <0-100>, "weight": 0.10, "rationale": "<cite state, industry risk>"}
  },
  "risk_flags": [{"flag": "<concern>", "metric": "<metric>", "value": "<actual value>", "threshold": "<threshold>", "dollar_impact": "<dollar impact>"}],
  "positive_factors": [{"factor": "<strength>", "metric": "<metric>", "value": "<actual value>", "why_it_matters": "<why this reduces default risk>"}],
  "key_insight": "<one sentence citing actual deal numbers that a rules engine could never produce>",
  "conditions": ["<approval conditions if any>"]
}

SBA anchors: DSCR >=1.50 strong; 1.25-1.49 standard; 1.00-1.24 elevated; <1.00 decline. Equity >=20% preferred; <10% red flag. Biz age >=10yr preferred. SDE multiple <=3.0x conservative; >4.5x aggressive. Credit >=720 preferred. CoO loans default 40% less than expansion. Industry rates: plumbing/HVAC 2.8%; restaurants 8.2%; manufacturing 2.9%; healthcare 2.2%."""


def claude_score_deal(deal_data: dict) -> Optional[dict]:
    dscr = deal_data.get("dscr", "unknown")
    eq = deal_data.get("equity_injection", 0)
    cr = deal_data.get("borrower_credit_score", "unknown")
    age = deal_data.get("business_age", "unknown")
    loan = deal_data.get("loan_amount", 0)
    rev = deal_data.get("annual_revenue", 0)
    ebitda = deal_data.get("ebitda", 0)
    industry = deal_data.get("naics_industry", deal_data.get("industry", "unknown"))
    price = deal_data.get("asking_price", deal_data.get("purchase_price", 0))
    margin = round(ebitda/rev*100, 1) if rev else "unknown"
    ltv = round(loan/price*100, 1) if price else "unknown"

    user_msg = f"""Score this SBA 7(a) deal. Reference every specific number in your rationale.

KEY METRICS:
Industry: {industry} | DSCR: {dscr}x | Revenue: ${rev:,.0f} | EBITDA: ${ebitda:,.0f} ({margin}% margin)
Loan: ${loan:,.0f} | Asking Price: ${price:,.0f} | LTV: {ltv}% | Equity: {eq}%
Credit Score: {cr} | Business Age: {age} years

FULL DATA:
{json.dumps(deal_data, indent=2)}

Score each category citing specific metrics. JSON only."""

    text = _call_claude(SCORING_SYSTEM, user_msg, max_tokens=2000)
    result = _parse_json(text)
    if not result: return None

    cats = result.get("category_scores", {})
    norm_cats = {}
    for cat, val in cats.items():
        norm_cats[cat] = val if isinstance(val, dict) else {"score": float(val), "weight": 0.2, "rationale": ""}

    return {
        "composite_score": float(result.get("composite_score", 65)),
        "tier": result.get("tier", "standard"),
        "tier_display": result.get("tier_display", "Standard"),
        "recommended_premium": float(result.get("recommended_premium", 0.025)),
        "expected_annual_default_rate": float(result.get("expected_annual_default_rate", 0.035)),
        "foia_benchmark_rate": float(result.get("foia_benchmark_rate", 0.035)),
        "decision": result.get("decision", "refer"),
        "monitoring_frequency": result.get("monitoring_frequency", "quarterly"),
        "risk_flags": result.get("risk_flags", []),
        "positive_factors": result.get("positive_factors", []),
        "category_scores": norm_cats,
        "key_insight": result.get("key_insight", ""),
        "conditions": result.get("conditions", []),
        "variables_evaluated": len(deal_data),
        "variables_missing": [],
        "scored_at": __import__("datetime").datetime.utcnow().isoformat(),
        "_powered_by": "claude",
    }


# ── ENGINE 2: Loan Monitoring ────────────────────────────────────────────────

MONITORING_SYSTEM = """You are an SBA loan portfolio monitoring AI. Analyze funded loans for early warning signals using the 18-variable SBA monitoring framework.

You MUST reference specific numbers — not generic thresholds. If DSCR dropped from 1.68 to 1.21, say that. Lenders act on specifics.

Respond with valid JSON only.

{
  "health_score": <0-100>,
  "alert_level": <"none"|"watch"|"advisory"|"escalation"|"pre_claim">,
  "alert_level_display": <"Healthy"|"Watch — Monitor Closely"|"Advisory — Action in 30 Days"|"Escalation — Contact Now"|"Pre-Claim — Imminent Loss">,
  "trend_direction": <"improving"|"stable"|"deteriorating"|"critical">,
  "estimated_months_to_default_risk": <null or int>,
  "active_alerts": [{"variable_name": "<SBA var>", "severity": <"low"|"medium"|"high"|"critical">, "message": "<cite actual values>", "recommended_action": "<specific step with deadline>", "dollar_at_risk": "<exposure estimate>"}],
  "positive_signals": ["<cite actual improving metrics>"],
  "recommended_intervention": "<specific action with deadline citing actual numbers>",
  "narrative": "<2-3 sentences: what is happening and why, citing specific metrics>",
  "key_insight": "<one sentence citing specific numbers>"
}

Alert thresholds: none >=80; watch 65-79; advisory 50-64; escalation 35-49; pre_claim <35."""


def claude_monitor_loan(loan_data: dict, monitoring_data: dict) -> Optional[dict]:
    dscr_orig = loan_data.get("origination_dscr", monitoring_data.get("dscr_at_origination", "unknown"))
    dscr_curr = monitoring_data.get("dscr_current", monitoring_data.get("mon_dscr_rolling", "unknown"))
    rev_vs_proj = monitoring_data.get("revenue_vs_projection", "unknown")
    days_late = monitoring_data.get("days_past_due", 0)
    balance = loan_data.get("current_principal_balance", loan_data.get("principal_amount", 0))

    user_msg = f"""Assess this active SBA loan.

KEY METRICS:
Origination DSCR: {dscr_orig}x → Current DSCR: {dscr_curr}x
Revenue vs Projection: {rev_vs_proj}
Payment Status: {monitoring_data.get('sba_payment_status','current')} ({days_late} days past due)
Outstanding Balance: ${balance:,.0f}

LOAN DATA:
{json.dumps(loan_data, indent=2)}

MONITORING DATA:
{json.dumps(monitoring_data, indent=2)}

Reference specific numbers in every alert. JSON only."""

    text = _call_claude(MONITORING_SYSTEM, user_msg)
    result = _parse_json(text)
    if not result: return None

    return {
        "loan_id": loan_data.get("loan_id"),
        "loan_number": loan_data.get("loan_number", ""),
        "borrower_name": loan_data.get("borrower_name", ""),
        "health_score": int(result.get("health_score", 70)),
        "alert_level": result.get("alert_level", "none"),
        "alert_level_display": result.get("alert_level_display", "Healthy"),
        "active_alerts": result.get("active_alerts", []),
        "positive_signals": result.get("positive_signals", []),
        "trend_direction": result.get("trend_direction", "stable"),
        "estimated_months_to_default_risk": result.get("estimated_months_to_default_risk"),
        "recommended_intervention": result.get("recommended_intervention", ""),
        "narrative": result.get("narrative", ""),
        "key_insight": result.get("key_insight", ""),
        "assessed_at": __import__("datetime").datetime.utcnow().isoformat(),
        "_powered_by": "claude",
    }


# ── ENGINE 3: Deal Advisory Chat ─────────────────────────────────────────────

CHAT_SYSTEM = """You are a senior SBA 7(a) deal advisor embedded in UnderwriteOS.

Rules:
1. ALWAYS cite specific numbers — say "your DSCR of 1.42x" not "your DSCR"
2. Quantify every risk in dollars
3. Give numbered action steps with named vendors and dollar amounts
4. 150-250 words unless detailed analysis requested
5. End every response with "Next step: [one specific action to take today]"
6. Never say "I cannot" — you have everything you need in the deal context"""


def claude_deal_chat(user_message: str, deal_data: dict, risk_report: dict, uw_data: dict, conversation_history: list = None) -> Optional[str]:
    health = uw_data.get("health_score", {})
    dscr = uw_data.get("dscr_pdscr", {})
    val = uw_data.get("valuation", {})
    dk = uw_data.get("deal_killer", {})
    cf = uw_data.get("cash_flow_forecast", {})
    sba = uw_data.get("sba_eligibility", {})
    pbs = uw_data.get("playbooks", [])
    rev = deal_data.get("annual_revenue", 0)
    ebitda = deal_data.get("ebitda", 0)

    context = f"""=== DEAL: {deal_data.get('name','Unknown')} | {deal_data.get('industry','unknown')} ===
Revenue: ${rev:,.0f} | EBITDA: ${ebitda:,.0f} ({round(ebitda/rev*100,1) if rev else 0}% margin)
Asking: ${deal_data.get('purchase_price',0):,.0f} | Loan: ${deal_data.get('loan_amount_requested',0):,.0f}
Equity: ${deal_data.get('equity_injection',0):,.0f} ({round(deal_data.get('equity_injection',0)/deal_data.get('purchase_price',1)*100,1) if deal_data.get('purchase_price') else 0}%) | Credit: {deal_data.get('owner_credit_score','N/A')} | Experience: {deal_data.get('owner_experience_years','N/A')}yr

=== UNDERWRITEOS ===
Health: {health.get('score','N/A')}/100 (CF:{health.get('cashflow','N/A')} Stab:{health.get('stability','N/A')} Growth:{health.get('growth','N/A')} Liq:{health.get('liquidity','N/A')})
DSCR: {dscr.get('dscr_base','N/A')}x base | {dscr.get('pdscr','N/A')}x post-draw | stressed: {dscr.get('dscr_stress_20','N/A')}x
Owner Draw: ${dscr.get('owner_draw_annual',0):,.0f}/yr | Premium Capacity: ${dscr.get('premium_capacity_monthly',0):,.0f}/mo
Verdict: {dk.get('verdict','N/A').upper()} | Confidence: {dk.get('confidence_score','N/A')}/100 | Max Price: ${dk.get('max_supportable_price',0):,.0f}
Cash Runway: {cf.get('runway_months','N/A')} mo | SBA: {'Yes' if sba.get('eligible') else 'No'}
Equity Value: ${val.get('equity_value_mid',0):,.0f} (${val.get('equity_value_low',0):,.0f}–${val.get('equity_value_high',0):,.0f})

=== PLAYBOOKS ===
{chr(10).join([f"• [{p.get('severity','').upper()}] {p.get('title','')} — {p.get('impact_summary','')}" for p in pbs])}

=== HERADYNE ===
DSCR: {risk_report.get('dscr_base','N/A')}x | Annual PD: {risk_report.get('annual_pd','N/A')} | Collateral: {risk_report.get('collateral_coverage','N/A')}x"""

    messages = []
    if conversation_history:
        for msg in conversation_history[-8:]:
            messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": f"{context}\n\n---\nQUESTION: {user_message}"})

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key: return None

    payload = json.dumps({"model": MODEL, "max_tokens": 700, "system": CHAT_SYSTEM, "messages": messages}).encode()
    req = urllib.request.Request(API_URL, data=payload, headers={
        "Content-Type": "application/json", "x-api-key": api_key, "anthropic-version": "2023-06-01"
    }, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())["content"][0]["text"]
    except Exception as e:
        log.error(f"Claude chat error: {e}")
        return None


# ── ENGINE 4: Actuarial Pricing ──────────────────────────────────────────────

ACTUARIAL_SYSTEM = """You are a senior actuarial AI for SBA 7(a) credit insurance. Use frequency-severity methodology anchored to SBA FOIA data.

Reference specific deal metrics in your rationale. Explain your pricing to a lender in plain English.

Respond with valid JSON only.

{
  "pd_estimate": <probability of default>,
  "lgd_estimate": <loss given default after SBA guarantee recovery>,
  "pure_premium": <pd * lgd>,
  "risk_load": <variance load, 20-30% of pure premium>,
  "expense_load": <0.004-0.007>,
  "profit_margin": <0.002-0.004>,
  "indicated_rate": <total annual rate>,
  "indicated_rate_low": <optimistic scenario>,
  "indicated_rate_high": <stress scenario>,
  "monthly_premium_dollars": <rate * loan / 12>,
  "annual_premium_dollars": <rate * loan>,
  "risk_decision": <"accept"|"accept_with_conditions"|"refer"|"decline">,
  "expected_loss_ratio": <pure/indicated, target 55-65%>,
  "cohort_benchmark_rate": <industry cohort rate>,
  "credibility_weight": <0.0-1.0 deal vs cohort weighting>,
  "key_risk_factors": ["<factor citing actual metric>", "<factor 2>", "<factor 3>"],
  "pricing_rationale": "<3-4 sentences citing actual DSCR, equity %, industry rate — write for lender>",
  "conditions": ["<underwriting conditions>"]
}"""


def claude_actuarial_price(submission: dict, policy_terms: dict) -> Optional[dict]:
    loan = submission.get("loan_amount", 0)
    industry = submission.get("industry", submission.get("naics_industry", "other")).lower()
    cohort = INDUSTRY_COHORT_RATES.get(industry, 0.040)
    dscr = submission.get("dscr", 1.35)
    eq = submission.get("equity_injection", 10)
    guarantee = submission.get("sba_guarantee_pct", 75)
    age = submission.get("business_age", 5)

    pd_mult = 0.70 if dscr >= 1.50 else 1.00 if dscr >= 1.25 else 1.45 if dscr >= 1.00 else 2.00
    eq_adj = 1.0 - max(0, (eq - 10) / 100 * 1.8)
    adj_pd = cohort * pd_mult * eq_adj

    user_msg = f"""Price this SBA 7(a) credit insurance submission.

ACTUARIAL INPUTS (cite in rationale):
Industry: {industry} | Cohort Base Rate (SBA FOIA): {cohort:.1%}
Loan: ${loan:,.0f} | DSCR: {dscr}x → PD multiplier: {pd_mult}x
Equity: {eq}% → reduces PD ~{(1-eq_adj)*100:.0f}%
Business Age: {age} years | SBA Guarantee: {guarantee}%
Pre-adjusted PD: {adj_pd:.1%}

SUBMISSION: {json.dumps(submission, indent=2)}
POLICY: {json.dumps(policy_terms, indent=2)}

JSON only."""

    text = _call_claude(ACTUARIAL_SYSTEM, user_msg, max_tokens=1000)
    result = _parse_json(text)
    if not result: return None

    rate = float(result.get("indicated_rate", adj_pd * 1.4))
    result["monthly_premium_dollars"] = round(loan * rate / 12, 2)
    result["annual_premium_dollars"] = round(loan * rate, 2)
    result["_powered_by"] = "claude"
    return result


# ── ENGINE 5: Playbook Generation ────────────────────────────────────────────

PLAYBOOK_SYSTEM = """You are a CFO-level SMB advisor for SBA acquisition businesses. Generate specific dollar-quantified action plans.

Every playbook MUST:
1. Reference the specific metric that triggered it (e.g. "Your DSCR of 1.21x is 4bps above floor")
2. Quantify dollar impact of inaction
3. Name actual vendors/software/resources (ServiceTitan, QuickBooks, SCORE, SBA Form 413)
4. Give actions with specific dollar amounts
5. Order by time horizon: Immediate → This week → 30 days → 90 days

Respond with a JSON array only.

[{
  "title": "<cite specific metric e.g. 'DSCR 1.21x — 4bps Above Minimum'>",
  "severity": <"critical"|"warning"|"opportunity">,
  "trigger": "<specific metric and value>",
  "impact_summary": "<what happens if unaddressed, in dollars>",
  "estimated_annual_impact": <dollars>,
  "actions": [{"step": 1, "label": "<Immediate|This week|30 days|90 days>", "detail": "<specific vendor, amount, step>", "dollar_impact": <dollars>}]
}]

Max 5 playbooks, min 2 actions each. Lead with most critical."""


def claude_generate_playbooks(deal_data: dict, financial_data: dict, uw_metrics: dict) -> Optional[list]:
    dscr = uw_metrics.get("dscr", financial_data.get("dscr", "unknown"))
    health = uw_metrics.get("health_score", "unknown")
    runway = uw_metrics.get("cash_runway_months", "unknown")
    verdict = uw_metrics.get("deal_verdict", "unknown")
    rev = financial_data.get("revenue", deal_data.get("annual_revenue", 0))
    ebitda = financial_data.get("ebitda", deal_data.get("ebitda", 0))
    price = deal_data.get("purchase_price", deal_data.get("asking_price", 0))
    loan = deal_data.get("loan_amount", deal_data.get("loan_amount_requested", 0))

    user_msg = f"""Generate playbooks for: {deal_data.get('name','Unknown')} | {deal_data.get('industry','unknown')}

CITE IN EVERY PLAYBOOK:
DSCR: {dscr}x | Health: {health}/100 | Runway: {runway} mo | Verdict: {verdict}
Revenue: ${rev:,.0f} | EBITDA: ${ebitda:,.0f} | Price: ${price:,.0f} | Loan: ${loan:,.0f}

FINANCIALS: {json.dumps(financial_data, indent=2)}
UW OUTPUTS: {json.dumps(uw_metrics, indent=2)}
DEAL: {json.dumps(deal_data, indent=2)}

JSON array only."""

    return _parse_list(_call_claude(PLAYBOOK_SYSTEM, user_msg, max_tokens=2500))


# ── ENGINE 6: Master Deal Analysis ───────────────────────────────────────────

ANALYSIS_SYSTEM = """You are a senior SBA underwriter providing a master deal analysis. You have full quantitative output from 7 UnderwriteOS engines.

Synthesize into an expert narrative that:
1. States verdict with specific justification citing actual metrics
2. Identifies the 2-3 things that most determine this deal's outcome
3. Gives borrower concrete numbered next steps
4. Is written in plain English a first-time buyer understands
5. References every key number by name and value

Respond with valid JSON only.

{
  "executive_summary": "<3-4 sentences: verdict, key strengths, key risks, recommendation — cite specific metrics>",
  "verdict_explanation": "<why buy/renegotiate/pass — cite DSCR, multiple, health score, runway>",
  "top_3_success_factors": ["<factor citing metric and why it matters>", "<factor 2>", "<factor 3>"],
  "top_3_risk_factors": ["<risk citing metric, dollar impact, probability>", "<risk 2>", "<risk 3>"],
  "borrower_next_steps": [
    {"step": 1, "action": "<specific>", "why": "<why for this deal>", "timeline": "<when>"},
    {"step": 2, "action": "<specific>", "why": "<why>", "timeline": "<when>"},
    {"step": 3, "action": "<specific>", "why": "<why>", "timeline": "<when>"}
  ],
  "lender_talking_points": ["<point 1 — lead with when talking to lenders>", "<point 2>", "<point 3>"],
  "negotiation_leverage": "<specific advice on price negotiation based on valuation vs asking price>"
}"""


def claude_analyze_deal(deal_data: dict, uw_results: dict) -> Optional[dict]:
    health = uw_results.get("health_score", {})
    dscr = uw_results.get("dscr_pdscr", {})
    val = uw_results.get("valuation", {})
    dk = uw_results.get("deal_killer", {})
    cf = uw_results.get("cash_flow_forecast", {})
    sba = uw_results.get("sba_eligibility", {})
    pbs = uw_results.get("playbooks", [])

    user_msg = f"""Synthesize this deal analysis.

DEAL: {deal_data.get('name','Unknown')} | {deal_data.get('industry','unknown')}
Revenue: ${deal_data.get('annual_revenue',0):,.0f} | EBITDA: ${deal_data.get('ebitda',0):,.0f}
Asking: ${deal_data.get('purchase_price',0):,.0f} | Loan: ${deal_data.get('loan_amount_requested',0):,.0f}

ENGINE OUTPUTS:
Health: {health.get('score','N/A')}/100 (CF:{health.get('cashflow','N/A')} Stab:{health.get('stability','N/A')} Growth:{health.get('growth','N/A')} Liq:{health.get('liquidity','N/A')})
DSCR: {dscr.get('dscr_base','N/A')}x | PDSCR: {dscr.get('pdscr','N/A')}x | Stressed: {dscr.get('dscr_stress_20','N/A')}x
Verdict: {dk.get('verdict','N/A').upper()} | Confidence: {dk.get('confidence_score','N/A')}/100 | Max Price: ${dk.get('max_supportable_price',0):,.0f}
Equity Value: ${val.get('equity_value_mid',0):,.0f} (${val.get('equity_value_low',0):,.0f}–${val.get('equity_value_high',0):,.0f})
Cash Runway: {cf.get('runway_months','N/A')} mo | SBA: {'Yes' if sba.get('eligible') else 'No'}

TOP RISKS:
{chr(10).join([f"• {p.get('title','')} — {p.get('impact_summary','')}" for p in pbs[:3]])}

JSON only."""

    text = _call_claude(ANALYSIS_SYSTEM, user_msg, max_tokens=2000)
    result = _parse_json(text)
    if not result: return None
    result["_powered_by"] = "claude"
    return result
