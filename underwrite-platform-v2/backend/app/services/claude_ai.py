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
        with urllib.request.urlopen(req, timeout=90) as resp:
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

# ── ENGINE 7: Banker Memo Generator ──────────────────────────────────────────

BANKER_MEMO_SYSTEM = """You are a senior SBA 7(a) lending officer writing a formal credit memo for a loan committee.

Rules:
1. Cite every specific number — DSCR, multiples, equity %, credit score, revenue
2. Write in the formal style of an SBA PLP lender credit memo
3. Structure as: Transaction Summary → Borrower Profile → Financial Analysis → Collateral → Risk Factors → Conditions → Recommendation
4. Use exact dollar amounts, not approximations
5. The recommendation must be specific: Approve / Approve with Conditions / Decline

Respond with valid JSON only.

{
  "memo_date": "<ISO date>",
  "loan_number_placeholder": "TBD-XXXXXX",
  "transaction_summary": "<2-3 sentences: business name, type, purchase price, loan amount, equity, use of proceeds>",
  "borrower_profile": "<3-4 sentences: owner background, experience, credit score, personal financial strength, management depth>",
  "financial_analysis": {
    "revenue_trend": "<describe with actual numbers>",
    "ebitda_analysis": "<normalized EBITDA with addback detail>",
    "dscr_analysis": "<DSCR calculation walk-through citing actual numbers>",
    "working_capital": "<assessment>"
  },
  "collateral_analysis": "<collateral types, NOLV, coverage ratio, SBA guarantee coverage>",
  "sba_eligibility": "<14-point eligibility summary>",
  "risk_factors": ["<risk 1 citing specific metric and dollar impact>", "<risk 2>", "<risk 3>"],
  "mitigants": ["<mitigant 1>", "<mitigant 2>"],
  "conditions_precedent": ["<condition 1>", "<condition 2>", "<condition 3>"],
  "recommendation": "<Approve | Approve with Conditions | Decline>",
  "recommendation_rationale": "<2-3 sentences citing DSCR, equity, industry benchmarks — write for a loan committee>",
  "proposed_structure": {
    "loan_amount": "<$>",
    "term_months": "<months>",
    "interest_rate": "<suggested range>",
    "sba_guarantee_pct": "<75% or 85%>",
    "equity_injection_required": "<$>"
  }
}"""


def claude_generate_banker_memo(deal_data: dict, risk_report: dict, uw_data: dict) -> Optional[dict]:
    import datetime
    health = uw_data.get("health_score", {}) or {}
    dscr = uw_data.get("dscr_pdscr", {}) or {}
    val = uw_data.get("valuation", {}) or {}
    dk = uw_data.get("deal_killer", {}) or {}
    sba = uw_data.get("sba_eligibility", {}) or {}
    rev = deal_data.get("annual_revenue") or 0
    ebitda = deal_data.get("ebitda") or 0
    price = deal_data.get("purchase_price") or 0
    loan = deal_data.get("loan_amount_requested") or 0
    equity = deal_data.get("equity_injection") or 0
    credit = deal_data.get("owner_credit_score") or "N/A"
    exp = deal_data.get("owner_experience_years") or "N/A"
    industry = deal_data.get("industry") or "unknown"

    # Safely coerce all numeric values that go into format strings
    _n = lambda v: v or 0  # None-safe number
    _s = lambda v, d="N/A": v if v is not None else d  # None-safe string

    user_msg = f"""Write a formal SBA 7(a) credit memo for loan committee review.

TRANSACTION:
Business: {deal_data.get('name','Unknown')} | Industry: {industry}
Purchase Price: ${_n(price):,.0f} | Loan Requested: ${_n(loan):,.0f} | Equity Injection: ${_n(equity):,.0f} ({round(_n(equity)/_n(price)*100,1) if price else 0}%)
Use of Proceeds: Acquisition financing

BORROWER:
Owner Credit Score: {credit} | Industry Experience: {exp} years
Business Age: {deal_data.get('business_age_years', deal_data.get('years_in_business', 'N/A'))} years

FINANCIALS:
Revenue: ${_n(rev):,.0f} | Normalized EBITDA: ${_n(ebitda):,.0f} ({round(_n(ebitda)/_n(rev)*100,1) if rev else 0}% margin)
DSCR: {_s(dscr.get('dscr_base'))}x | Post-Draw DSCR: {_s(dscr.get('pdscr'))}x
Stressed DSCR (-20% rev): {_s(dscr.get('dscr_stress_20'))}x
Owner Draw: ${_n(dscr.get('owner_draw_annual')):,.0f}/yr

UNDERWRITING:
Health Score: {_s(health.get('score'))}/100
Verdict: {(dk.get('verdict') or 'N/A').upper()} | Max Supportable Price: ${_n(dk.get('max_supportable_price')):,.0f}
SBA Eligible: {'Yes' if sba.get('eligible') else 'No'}
Collateral Coverage: {_s(risk_report.get('collateral_coverage'))}x | NOLV: ${_n(risk_report.get('nolv')):,.0f}
Annual PD: {_s(risk_report.get('annual_pd'))}
Equity Value (mid): ${_n(val.get('equity_value_mid')):,.0f}

SBA ELIGIBILITY ISSUES: {', '.join(sba.get('failed_checks', [])) if sba.get('failed_checks') else 'None identified'}

FULL DEAL DATA:
{json.dumps(deal_data, indent=2)}

Write a complete loan committee credit memo. JSON only. Memo date: {datetime.date.today().isoformat()}"""

    text = _call_claude(BANKER_MEMO_SYSTEM, user_msg, max_tokens=3000)
    result = _parse_json(text)
    if not result:
        return None
    result["_powered_by"] = "claude"
    result["generated_at"] = __import__("datetime").datetime.utcnow().isoformat()
    return result


# ── ENGINE 8: SBA SOP Q&A ────────────────────────────────────────────────────

SBA_QA_SYSTEM = """You are an expert on SBA Standard Operating Procedures (SOP 50 10 7.1) and SBA 7(a) lending rules.

You answer compliance questions asked by SBA lenders, loan officers, and credit analysts.

Rules:
1. Always cite the specific SOP section number (e.g. "SOP 50 10 7.1, Chapter 2, Section B")
2. Give the plain-English rule first, then the technical citation
3. Flag any "it depends" situations with the key decision factors
4. If a deal-specific question, apply the rule to their actual numbers
5. End with a concrete compliance action item

Respond in plain text (not JSON). Be concise but complete — 150-300 words."""


def claude_sba_qa(question: str, deal_context: Optional[dict] = None) -> Optional[str]:
    context_block = ""
    if deal_context:
        context_block = f"""
DEAL CONTEXT (apply rules to these specific numbers):
Business: {deal_context.get('name', 'N/A')} | Industry: {deal_context.get('industry', 'N/A')}
Loan: ${deal_context.get('loan_amount_requested', 0):,.0f} | Price: ${deal_context.get('purchase_price', 0):,.0f}
Equity: {deal_context.get('equity_injection', 0)} | DSCR: {deal_context.get('dscr', 'N/A')}x
Owner Experience: {deal_context.get('owner_experience_years', 'N/A')} years
"""

    user_msg = f"""{context_block}
COMPLIANCE QUESTION:
{question}

Answer citing specific SOP sections. Give the plain-English rule, the technical citation, and a concrete action item."""

    return _call_claude(SBA_QA_SYSTEM, user_msg, max_tokens=600)


# ── ENGINE 9: Borrower Recommendation Engine ─────────────────────────────────

BORROWER_REC_SYSTEM = """You are an AI advisor helping a small business buyer maximize their acquisition success and loan approval odds.

You see their full deal analysis and give specific, actionable recommendations tailored to their exact numbers.

Rules:
1. Reference their specific metrics (e.g. "your DSCR of 1.21x is 4bps above the SBA floor")
2. Prioritize by impact — highest dollar/approval impact first
3. Give specific vendors, forms, dollar amounts
4. Flag anything that could kill the deal
5. Write for a first-time buyer, not a banker

Respond with valid JSON only.

{
  "approval_probability": <0-100 int>,
  "approval_summary": "<one sentence on current odds citing key metrics>",
  "deal_killers": ["<specific issue that could kill approval>"],
  "top_recommendations": [
    {
      "priority": <1-5 int>,
      "category": "<credit|equity|documents|business|negotiation|legal>",
      "title": "<specific action title>",
      "why_it_matters": "<cite specific metric and how this moves it>",
      "action_steps": ["<step 1 with specific vendor/amount/timeline>", "<step 2>"],
      "estimated_impact": "<what changes if they do this>",
      "urgency": "<do_today|this_week|30_days|before_closing>"
    }
  ],
  "strengths_to_highlight": ["<strength to emphasize to lenders, cite metric>"],
  "next_30_days_checklist": ["<task 1>", "<task 2>", "<task 3>", "<task 4>", "<task 5>"]
}"""


def claude_borrower_recommendations(deal_data: dict, uw_data: dict, risk_report: dict) -> Optional[dict]:
    health = uw_data.get("health_score", {})
    dscr = uw_data.get("dscr_pdscr", {})
    dk = uw_data.get("deal_killer", {})
    sba = uw_data.get("sba_eligibility", {})
    val = uw_data.get("valuation", {})
    pbs = uw_data.get("playbooks", [])
    rev = deal_data.get("annual_revenue") or 0
    ebitda = deal_data.get("ebitda") or 0
    price = deal_data.get("purchase_price") or 0
    loan = deal_data.get("loan_amount_requested") or 0
    equity = deal_data.get("equity_injection") or 0
    credit = deal_data.get("owner_credit_score") or "N/A"

    user_msg = f"""Generate personalized recommendations for this SBA acquisition buyer.

YOUR DEAL: {deal_data.get('name','Unknown')} | {deal_data.get('industry','unknown')}
Purchase Price: ${price:,.0f} | Loan: ${loan:,.0f} | Equity: ${equity:,.0f} ({round(equity/price*100,1) if price else 0}%)
Revenue: ${rev:,.0f} | EBITDA: ${ebitda:,.0f} | Credit Score: {credit}

UNDERWRITING RESULTS:
Health Score: {health.get('score','N/A')}/100
DSCR: {dscr.get('dscr_base','N/A')}x (floor is 1.25x for most SBA lenders)
Post-Draw DSCR: {dscr.get('pdscr','N/A')}x
Verdict: {dk.get('verdict','N/A').upper()} | Confidence: {dk.get('confidence_score','N/A')}/100
SBA Eligible: {'Yes' if sba.get('eligible') else 'No — ' + ', '.join(sba.get('failed_checks',[])[:2])}
Equity Value (mid): ${val.get('equity_value_mid',0):,.0f} vs asking ${price:,.0f}

ACTIVE RISKS FROM PLAYBOOKS:
{chr(10).join([f"• [{p.get('severity','').upper()}] {p.get('title','')} — {p.get('impact_summary','')}" for p in pbs[:4]])}

SBA FAILED CHECKS: {', '.join(sba.get('failed_checks', [])) or 'None'}

Give specific recommendations this buyer should act on NOW to maximize approval odds. JSON only."""

    text = _call_claude(BORROWER_REC_SYSTEM, user_msg, max_tokens=2500)
    result = _parse_json(text)
    if not result:
        return None
    result["_powered_by"] = "claude"
    return result


# ── ENGINE 10: Covenant Monitoring with Explanations ─────────────────────────

COVENANT_SYSTEM = """You are an SBA loan covenant monitoring AI. You track financial covenants and explain breaches in plain English to borrowers.

Rules:
1. Compare actual vs. required covenant levels with exact numbers
2. Explain what the breach means in plain English (not banker language)
3. Give specific remediation steps with deadlines and dollar amounts
4. Quantify the risk to the borrower if not remediated
5. Rate urgency: green/yellow/red

Respond with valid JSON only.

{
  "overall_covenant_health": "<green|yellow|red>",
  "health_explanation": "<plain English summary for borrower>",
  "covenants": [
    {
      "name": "<covenant name>",
      "required": "<required level>",
      "actual": "<actual level>",
      "status": "<compliant|watch|breach>",
      "plain_english": "<what this means for the borrower in one sentence>",
      "breach_consequence": "<what happens if not fixed, in dollars/timeline>",
      "remediation": "<specific steps to cure, with amounts and timeline>",
      "urgency": "<green|yellow|red>"
    }
  ],
  "summary_for_borrower": "<3-4 sentences plain English: overall health, biggest concern, most important action>",
  "lender_notification_required": <true|false>,
  "cure_period_days": <int or null>
}"""


def claude_covenant_monitoring(loan_data: dict, financial_data: dict, covenants: list) -> Optional[dict]:
    balance = loan_data.get("current_principal_balance", loan_data.get("principal_amount", 0))
    borrower = loan_data.get("borrower_name", "the borrower")

    user_msg = f"""Monitor covenants for this active SBA loan.

LOAN: {borrower} | Balance: ${balance:,.0f}
Industry: {loan_data.get('industry', 'N/A')} | Origination DSCR: {loan_data.get('origination_dscr', 'N/A')}x

REQUIRED COVENANTS:
{json.dumps(covenants, indent=2)}

CURRENT FINANCIALS:
{json.dumps(financial_data, indent=2)}

Assess each covenant. Explain breaches in plain English for a small business owner. JSON only."""

    text = _call_claude(COVENANT_SYSTEM, user_msg, max_tokens=2000)
    result = _parse_json(text)
    if not result:
        return None
    result["_powered_by"] = "claude"
    result["assessed_at"] = __import__("datetime").datetime.utcnow().isoformat()
    return result


# ── ENGINE 11: Financial Document Normalization ───────────────────────────────

DOC_NORMALIZE_SYSTEM = """You are a financial document analyst. You extract and normalize financial data from uploaded business documents into a standardized format for SBA underwriting.

Rules:
1. Extract every financial metric you can find — revenue, EBITDA, addbacks, assets, liabilities
2. Flag any inconsistencies between documents
3. Calculate normalized EBITDA with itemized addbacks
4. Note the document quality/completeness
5. Flag anything that needs lender verification

Respond with valid JSON only.

{
  "document_type": "<p_and_l|tax_return|balance_sheet|bank_statement|other>",
  "period_covered": "<e.g. FY2023 or TTM Q3 2024>",
  "extracted_financials": {
    "gross_revenue": <number or null>,
    "cost_of_goods": <number or null>,
    "gross_profit": <number or null>,
    "total_operating_expenses": <number or null>,
    "net_income": <number or null>,
    "owner_salary": <number or null>,
    "depreciation_amortization": <number or null>,
    "interest_expense": <number or null>,
    "one_time_items": <number or null>,
    "ebitda_reported": <number or null>
  },
  "addbacks": [
    {"item": "<addback name>", "amount": <number>, "justification": "<why this is an addback>"}
  ],
  "normalized_ebitda": <number>,
  "sde": <seller discretionary earnings number>,
  "data_quality": "<excellent|good|fair|poor>",
  "flags": ["<inconsistency or concern>"],
  "verification_needed": ["<item needing lender verification>"],
  "confidence": <0-100>
}"""


def claude_normalize_financials(document_text: str, document_type: str, business_name: str) -> Optional[dict]:
    user_msg = f"""Extract and normalize financial data from this {document_type} for {business_name}.

DOCUMENT CONTENT:
{document_text[:6000]}

Extract all financial metrics, calculate normalized EBITDA with addbacks, flag any issues. JSON only."""

    text = _call_claude(DOC_NORMALIZE_SYSTEM, user_msg, max_tokens=2000)
    result = _parse_json(text)
    if not result:
        return None
    result["_powered_by"] = "claude"
    result["normalized_at"] = __import__("datetime").datetime.utcnow().isoformat()
    return result


# ── ENGINE 12: Portfolio Insights for Lenders ────────────────────────────────

PORTFOLIO_INSIGHTS_SYSTEM = """You are a senior SBA portfolio manager providing AI-driven portfolio insights for a lender.

Analyze the portfolio and provide:
1. Concentration risks (industry, geography, loan size)
2. Early warning signals across the book
3. Performance vs. SBA FOIA benchmarks
4. Specific action items for the highest-risk loans
5. Opportunities to deploy capital

Respond with valid JSON only.

{
  "portfolio_health_score": <0-100>,
  "health_narrative": "<2-3 sentences on overall portfolio health citing specific metrics>",
  "concentration_risks": [
    {"type": "<industry|geography|loan_size|borrower>", "detail": "<specific concentration>", "pct_of_portfolio": <float>, "risk_level": "<low|medium|high>", "action": "<recommendation>"}
  ],
  "early_warnings": [
    {"loan_identifier": "<deal name or id>", "signal": "<specific concern citing metrics>", "recommended_action": "<specific step with timeline>", "urgency": "<green|yellow|red>"}
  ],
  "benchmark_comparison": {
    "portfolio_expected_loss": <float>,
    "sba_industry_benchmark": <float>,
    "vs_benchmark": "<above|below|at> benchmark by X bps",
    "interpretation": "<what this means>"
  },
  "deployment_opportunities": ["<opportunity 1>", "<opportunity 2>"],
  "top_3_actions": ["<most important action 1>", "<action 2>", "<action 3>"],
  "30_day_priorities": ["<priority 1>", "<priority 2>", "<priority 3>"]
}"""


def claude_portfolio_insights(portfolio_data: dict, loans: list) -> Optional[dict]:
    total_exposure = sum(l.get("principal_amount", l.get("current_principal_balance", 0)) for l in loans)
    loan_count = len(loans)
    industries = {}
    for l in loans:
        ind = l.get("industry", "unknown")
        industries[ind] = industries.get(ind, 0) + 1

    user_msg = f"""Analyze this SBA loan portfolio and provide actionable insights.

PORTFOLIO SUMMARY:
Total Loans: {loan_count} | Total Exposure: ${total_exposure:,.0f}
Industry Mix: {json.dumps(industries)}

PORTFOLIO METRICS:
{json.dumps(portfolio_data, indent=2)}

INDIVIDUAL LOANS (summary):
{json.dumps([{
    'name': l.get('borrower_name', l.get('deal_name', 'Unknown')),
    'balance': l.get('current_principal_balance', l.get('principal_amount', 0)),
    'industry': l.get('industry', 'unknown'),
    'status': l.get('loan_status', l.get('status', 'current')),
    'dscr_orig': l.get('origination_dscr', 'N/A'),
    'health': l.get('health_score', 'N/A')
} for l in loans[:20]], indent=2)}

Provide portfolio-level insights and specific actions. JSON only."""

    text = _call_claude(PORTFOLIO_INSIGHTS_SYSTEM, user_msg, max_tokens=2500)
    result = _parse_json(text)
    if not result:
        return None
    result["_powered_by"] = "claude"
    result["analyzed_at"] = __import__("datetime").datetime.utcnow().isoformat()
    return result

# ── ENGINE 13: SBA Document Drafts ───────────────────────────────────────────

SBA_FORMS_SYSTEM = """You are an SBA 7(a) lending specialist generating pre-filled draft content for SBA forms.

CRITICAL: Respond with valid JSON only. No markdown fences. No preamble. Start with { and end with }.

Use this exact structure:
{
  "form_name": "<full form name>",
  "form_purpose": "<one sentence>",
  "completion_pct": <0-100>,
  "fields": [
    {"field_name": "<name>", "field_label": "<label>", "value": "<value or null>", "status": "<filled|missing|requires_borrower|requires_lender|requires_signature>", "source": "<deal_data|borrower_input|lender_input|computed>", "missing_reason": "<only if missing>"}
  ],
  "missing_required_fields": ["<field name>"],
  "blocking_issues": ["<SBA rejection issue>"],
  "warnings": ["<compliance warning>"],
  "next_steps": ["<step to complete draft>"],
  "draft_narrative": "<narrative text for this form>"
}

Rules:
1. Fill every field you have data for with actual values — never fabricate missing data
2. Set status=missing and explain missing_reason for any field lacking data
3. blocking_issues = things SBA would reject (hard declines, missing required fields)
4. warnings = non-blocking compliance notes
5. Keep fields array to the 10-15 most important fields for this form type"""


def claude_draft_sba_form(form_type: str, deal_data: dict, risk_report: dict, lender_data: dict) -> Optional[dict]:
    import datetime
    rev = deal_data.get("annual_revenue") or 0
    ebitda = deal_data.get("ebitda") or 0
    price = deal_data.get("purchase_price") or 0
    loan = deal_data.get("loan_amount_requested") or 0
    equity = deal_data.get("equity_injection") or 0
    credit = deal_data.get("owner_credit_score") or "MISSING"
    exp = deal_data.get("owner_experience_years") or "MISSING"
    industry = deal_data.get("industry") or "MISSING"
    state = deal_data.get("state") or "MISSING"
    dscr = risk_report.get("dscr_base") or "MISSING"

    user_msg = f"""Generate a pre-filled draft for: {form_type}

DEAL DATA AVAILABLE:
Business Name: {deal_data.get('name', 'MISSING')}
Industry: {industry}
State: {state}
Purchase Price: ${price:,.0f}
Loan Requested: ${loan:,.0f}
Equity Injection: ${equity:,.0f} ({round(equity/price*100,1) if price else 'MISSING'}%)
Annual Revenue: ${rev:,.0f}
EBITDA: ${ebitda:,.0f}
DSCR: {dscr}x
Owner Credit Score: {credit}
Owner Experience: {exp} years
Business Age: {deal_data.get('years_in_business', 'MISSING')} years
Deal Type: {deal_data.get('deal_type', 'acquisition')}

LENDER DATA:
{json.dumps(lender_data, indent=2) if lender_data else 'Not provided'}

RISK REPORT:
{json.dumps(risk_report, indent=2) if risk_report else 'Not available'}

For each field:
- If data is available, fill it with the actual value
- If data is missing, set status to "missing" and explain what's needed
- Flag anything that would cause SBA to reject the form

JSON only. Today: {datetime.date.today().isoformat()}"""

    text = _call_claude(SBA_FORMS_SYSTEM, user_msg, max_tokens=4000)
    if not text:
        log.error("claude_draft_sba_form: no response from Claude")
        return None
    result = _parse_json(text)
    if not result:
        # Last-resort: return a structured error with the raw text so frontend
        # can at least show something rather than a blank 503
        log.error(f"claude_draft_sba_form: JSON parse failed, raw: {text[:200]}")
        return {
            "form_name": form_type,
            "form_purpose": "Draft generation encountered a formatting error.",
            "completion_pct": 0,
            "fields": [],
            "missing_required_fields": [],
            "blocking_issues": ["AI response could not be parsed. Please try again."],
            "warnings": [],
            "next_steps": ["Click Generate Draft again — this is usually a transient error."],
            "draft_narrative": text[:2000] if text else "",
            "_parse_error": True,
        }
    result["_powered_by"] = "claude"
    result["drafted_at"] = __import__("datetime").datetime.utcnow().isoformat()
    return result

# ── ENGINE 14: Covenant Letter Generator ─────────────────────────────────────

COVENANT_LETTER_SYSTEM = """You are an SBA loan servicing specialist generating formal covenant compliance letters.

Write in professional bank correspondence style. Be specific about the covenant, the breach or concern, the cure period, and required actions.

Rules:
1. Reference the specific loan number, borrower name, and covenant name
2. State the required level and actual level with exact numbers
3. For breach letters: state cure period (typically 30-60 days per loan agreement)
4. For watch letters: be constructive — acknowledge the trend and request action
5. For compliance confirmation: be brief and positive
6. Include a specific deadline for response or cure

Respond with valid JSON only. No markdown.

{
  "letter_type": "<compliance_confirmation|watch_notice|breach_notice|cure_period_expiring>",
  "subject": "<letter subject line>",
  "salutation": "<Dear [Name],>",
  "opening_paragraph": "<context and purpose of letter>",
  "covenant_detail": "<specific covenant description, required level, actual level>",
  "required_actions": ["<action 1 with deadline>", "<action 2>"],
  "deadline": "<specific date or timeframe>",
  "closing_paragraph": "<next steps and contact info placeholder>",
  "closing": "<Sincerely, [Loan Officer Name]>",
  "cc": ["<SBA Servicing Center (if breach)>"],
  "urgency": "<routine|urgent|critical>"
}"""


def claude_generate_covenant_letter(
    covenant_name: str,
    status: str,
    required_value: float,
    actual_value: float,
    borrower_name: str,
    loan_number: str,
    lender_name: str,
    loan_data: dict,
) -> Optional[dict]:
    import datetime
    today = datetime.date.today().isoformat()
    cure_deadline = (datetime.date.today() + datetime.timedelta(days=30)).isoformat()

    user_msg = f"""Generate a covenant compliance letter.

LOAN DETAILS:
Borrower: {borrower_name}
Loan Number: {loan_number}
Lender: {lender_name}
Letter Date: {today}

COVENANT:
Name: {covenant_name}
Status: {status.upper()}
Required Level: {required_value}
Actual Level: {actual_value}
Variance: {round((actual_value - required_value) / required_value * 100, 1) if required_value else 'N/A'}%
Cure Period Deadline: {cure_deadline}

LOAN CONTEXT:
{json.dumps(loan_data, indent=2)}

Generate the appropriate {status} letter. JSON only."""

    text = _call_claude(COVENANT_LETTER_SYSTEM, user_msg, max_tokens=1500)
    result = _parse_json(text)
    if not result:
        return None
    result["_powered_by"] = "claude"
    result["generated_at"] = __import__("datetime").datetime.utcnow().isoformat()
    result["letter_date"] = __import__("datetime").date.today().isoformat()
    return result


# ── ENGINE 15: Annual Review Generator ───────────────────────────────────────

ANNUAL_REVIEW_SYSTEM = """You are a senior SBA loan officer generating an annual loan review report.

This is the formal annual review that documents the loan's performance, the borrower's financial condition, and the lender's ongoing risk assessment. It must be thorough enough to pass SBA examination.

Rules:
1. Reference specific numbers — DSCR, revenue, EBITDA, balance, payment history
2. Compare current performance to origination underwriting
3. Identify trends — improving, stable, deteriorating
4. Flag any policy exceptions, covenant issues, or concerns
5. Give a clear risk rating and recommendation (maintain/enhance monitoring, restructure, etc.)
6. Write in the formal style that appears in bank loan files

Respond with valid JSON only.

{
  "review_date": "<ISO date>",
  "review_period": "<year covered>",
  "loan_number": "<loan number>",
  "borrower_name": "<name>",
  "risk_rating": "<1-Pass|2-Watch|3-Substandard|4-Doubtful|5-Loss>",
  "risk_rating_change": "<improved|maintained|downgraded>",
  "executive_summary": "<3-4 sentences: current status, key developments, risk rating rationale>",
  "financial_performance": {
    "revenue_vs_origination": "<analysis with specific numbers>",
    "ebitda_trend": "<analysis>",
    "dscr_current": "<current DSCR and comparison to requirement>",
    "dscr_trend": "<improving/stable/deteriorating with data>",
    "working_capital": "<assessment>"
  },
  "loan_performance": {
    "payment_history": "<summary of payment behavior>",
    "current_balance": "<balance vs original>",
    "collateral_assessment": "<current collateral adequacy>",
    "covenant_compliance": "<summary of covenant status>"
  },
  "business_assessment": "<operational assessment, management, industry conditions>",
  "risk_factors": ["<specific risk 1 with data>", "<risk 2>"],
  "positive_factors": ["<strength 1>", "<strength 2>"],
  "action_items": [
    {"action": "<required action>", "owner": "<lender|borrower>", "due_date": "<date>", "priority": "<high|medium|low>"}
  ],
  "recommendation": "<Continue current terms|Increase monitoring frequency|Obtain updated financials|Consider restructure|Refer to special assets>",
  "next_review_date": "<ISO date>",
  "officer_notes": "<additional commentary for loan file>"
}"""


def claude_generate_annual_review(
    deal_data: dict,
    loan_data: dict,
    risk_report: dict,
    uw_data: dict,
    financial_data: dict,
    payment_history: list,
    covenant_status: list,
    review_year: int,
) -> Optional[dict]:
    import datetime
    _n = lambda v: v or 0
    rev = _n(deal_data.get("annual_revenue"))
    ebitda = _n(deal_data.get("ebitda"))
    balance = _n(loan_data.get("current_principal_balance", loan_data.get("principal_amount")))
    original = _n(loan_data.get("principal_amount"))
    dscr = risk_report.get("dscr_base") or "N/A"
    payments_late = sum(1 for p in payment_history if p.get("is_late"))

    user_msg = f"""Generate a formal annual loan review for {review_year}.

LOAN:
Borrower: {deal_data.get('name', 'Unknown')}
Loan Number: {loan_data.get('loan_number', 'N/A')}
Original Balance: ${_n(original):,.0f}
Current Balance: ${_n(balance):,.0f}
Payments Made: {loan_data.get('total_payments_made', 'N/A')} | Late Payments: {payments_late}
Days Past Due: {loan_data.get('days_past_due', 0)}
Industry: {deal_data.get('industry', 'N/A')}

FINANCIAL PERFORMANCE:
Revenue: ${rev:,.0f} | EBITDA: ${ebitda:,.0f} ({round(ebitda/rev*100,1) if rev else 0}% margin)
Current DSCR: {dscr}x | Origination DSCR: {risk_report.get('origination_dscr', 'N/A')}x
Health Score: {uw_data.get('health_score', {}).get('score', 'N/A')}/100

CURRENT YEAR FINANCIALS (if submitted):
{json.dumps(financial_data, indent=2) if financial_data else 'Not yet submitted'}

COVENANT STATUS:
{json.dumps(covenant_status, indent=2) if covenant_status else 'No active covenants on file'}

PAYMENT HISTORY (last 12):
{json.dumps(payment_history[-12:], indent=2) if payment_history else 'No payment records'}

UNDERWRITING:
Verdict: {uw_data.get('deal_killer', {}).get('verdict', 'N/A')}
SBA Eligible: {uw_data.get('sba_eligibility', {}).get('eligible', 'N/A')}
Collateral Coverage: {risk_report.get('collateral_coverage', 'N/A')}x

Review Period: {review_year}
Review Date: {datetime.date.today().isoformat()}

Generate a complete annual review for the loan file. JSON only."""

    text = _call_claude(ANNUAL_REVIEW_SYSTEM, user_msg, max_tokens=3000)
    result = _parse_json(text)
    if not result:
        return None
    result["_powered_by"] = "claude"
    result["generated_at"] = __import__("datetime").datetime.utcnow().isoformat()
    return result


# ── ENGINE 16: Site Visit Preparation ────────────────────────────────────────

SITE_VISIT_SYSTEM = """You are an SBA loan officer preparing for a borrower site visit or annual review meeting.

Generate a structured preparation package the loan officer can bring to the visit and use during the review.

Rules:
1. Prepare specific questions based on the deal's financial data and risk indicators
2. Flag anything unusual that needs in-person verification
3. Include items to physically verify at the site
4. Suggest topics to raise based on monitoring alerts and trends
5. Provide a post-visit documentation template

Respond with valid JSON only.

{
  "visit_purpose": "<annual review|covenant check|troubled loan review|routine monitoring>",
  "pre_visit_summary": "<2-3 sentences on the loan's current status to brief the officer>",
  "items_to_verify_onsite": [
    {"item": "<what to check>", "why": "<why it matters>", "how": "<how to verify it>"}
  ],
  "financial_questions": [
    {"question": "<specific question citing actual numbers>", "context": "<why you're asking>"}
  ],
  "operational_questions": ["<question about operations, staffing, customers, etc.>"],
  "risk_flags_to_address": [
    {"flag": "<concern from monitoring data>", "question_to_ask": "<how to probe it>"}
  ],
  "documents_to_request": ["<document 1>", "<document 2>"],
  "positive_topics": ["<accomplishment or strength to acknowledge>"],
  "post_visit_documentation_template": {
    "visit_date": "<fill in>",
    "persons_present": "<fill in>",
    "facility_condition": "<fill in>",
    "key_findings": "<fill in>",
    "borrower_representations": "<fill in>",
    "action_items": "<fill in>",
    "officer_assessment": "<fill in>"
  }
}"""


def claude_prepare_site_visit(
    deal_data: dict,
    loan_data: dict,
    risk_report: dict,
    uw_data: dict,
    covenant_status: list,
    monitoring_alerts: list,
    visit_type: str = "annual_review",
) -> Optional[dict]:
    _n = lambda v: v or 0
    rev = _n(deal_data.get("annual_revenue"))
    ebitda = _n(deal_data.get("ebitda"))
    balance = _n(loan_data.get("current_principal_balance", loan_data.get("principal_amount")))
    dscr = risk_report.get("dscr_base") or "N/A"
    health = uw_data.get("health_score", {}).get("score", "N/A")

    user_msg = f"""Prepare a site visit package for a {visit_type.replace('_', ' ')}.

LOAN OVERVIEW:
Borrower: {deal_data.get('name', 'Unknown')}
Industry: {deal_data.get('industry', 'N/A')}
Current Balance: ${_n(balance):,.0f}
Days Past Due: {loan_data.get('days_past_due', 0)}

FINANCIAL SNAPSHOT:
Revenue: ${rev:,.0f} | EBITDA: ${ebitda:,.0f}
DSCR: {dscr}x | Health Score: {health}/100
Verdict: {uw_data.get('deal_killer', {}).get('verdict', 'N/A')}

ACTIVE MONITORING ALERTS:
{json.dumps(monitoring_alerts, indent=2) if monitoring_alerts else 'No active alerts'}

COVENANT STATUS:
{json.dumps(covenant_status, indent=2) if covenant_status else 'No covenants tracked'}

COLLATERAL:
Coverage: {risk_report.get('collateral_coverage', 'N/A')}x | NOLV: ${_n(risk_report.get('total_nolv')):,.0f}

Generate a thorough site visit preparation package. JSON only."""

    text = _call_claude(SITE_VISIT_SYSTEM, user_msg, max_tokens=2500)
    result = _parse_json(text)
    if not result:
        return None
    result["_powered_by"] = "claude"
    result["prepared_at"] = __import__("datetime").datetime.utcnow().isoformat()
    return result

# ── ENGINE 17: SBA 1502 Report Generator ─────────────────────────────────────

SBA_1502_SYSTEM = """You are an SBA servicing specialist generating SBA Form 1502 monthly reporting data.

SBA Form 1502 is the monthly loan status report all SBA 7(a) lenders must submit. It tracks:
- Current loan balance and guaranteed balance
- Payment status (current, 1-29 DPD, 30-60 DPD, 60+ DPD, default)
- Interest accrued during the period
- Principal payments received
- Any status changes

Rules:
1. Use exact SBA field names as they appear on Form 1502
2. Flag any data quality issues that would cause SBA to reject the report
3. Calculate guaranteed balance from principal balance × guarantee percentage
4. Payment status codes: C=Current, 1=1-29 DPD, 2=30-59 DPD, 3=60-89 DPD, 4=90+ DPD, D=Default
5. Flag loans needing special servicing attention

Respond with valid JSON only. No markdown.

{
  "report_month": "<MM/YYYY>",
  "lender_id_placeholder": "<SBA Lender ID>",
  "summary": {
    "total_loans": <int>,
    "total_outstanding_balance": <float>,
    "total_guaranteed_balance": <float>,
    "current_loans": <int>,
    "delinquent_loans": <int>,
    "default_loans": <int>
  },
  "loan_rows": [
    {
      "sba_loan_number": "<loan number>",
      "borrower_name": "<name>",
      "original_amount": <float>,
      "current_balance": <float>,
      "guaranteed_balance": <float>,
      "guarantee_pct": <float>,
      "payment_status_code": "<C|1|2|3|4|D>",
      "days_past_due": <int>,
      "interest_rate": <float>,
      "interest_accrued_this_period": <float>,
      "principal_paid_this_period": <float>,
      "maturity_date": "<date>",
      "flags": ["<any issues>"]
    }
  ],
  "validation_errors": ["<error that would cause SBA rejection>"],
  "warnings": ["<non-blocking data quality issues>"],
  "ready_to_submit": <true|false>
}"""


def claude_generate_1502(loans: list, month: int, year: int, lender_name: str) -> Optional[dict]:
    import datetime
    report_period = f"{month:02d}/{year}"

    user_msg = f"""Generate SBA Form 1502 monthly report for {lender_name}.

REPORTING PERIOD: {report_period}
LOAN COUNT: {len(loans)}

LOAN DATA:
{json.dumps(loans, indent=2)}

Generate the complete 1502 report. Flag any data issues. JSON only."""

    text = _call_claude(SBA_1502_SYSTEM, user_msg, max_tokens=4000)
    result = _parse_json(text)
    if not result:
        return None
    result["_powered_by"] = "claude"
    result["generated_at"] = __import__("datetime").datetime.utcnow().isoformat()
    return result


# ── ENGINE 18: SBA Audit Preparation ─────────────────────────────────────────

AUDIT_PREP_SYSTEM = """You are an SBA loan audit specialist preparing audit-ready documentation for an SBA portfolio review.

SBA conducts periodic lender audits. Failure to have proper documentation can result in:
- Guarantee purchases being denied
- Loss of PLP (Preferred Lender Program) status  
- Civil money penalties

The standard SBA audit looks at 10 key areas (the "10-tab file"):
1. Credit application and underwriting
2. Eligibility determination
3. Loan approval and authorization
4. Closing and disbursement
5. Collateral
6. Equity injection
7. Servicing and monitoring
8. Financial statements
9. Insurance
10. Compliance certifications

Rules:
1. Check each tab for completeness based on available deal/loan data
2. Flag missing items with specific SBA form numbers or document names
3. Note any items that could jeopardize guarantee purchase
4. Provide a readiness score 0-100
5. Prioritize critical missing items (guarantee-threatening) vs nice-to-have

Respond with valid JSON only.

{
  "readiness_score": <0-100>,
  "readiness_level": "<audit_ready|mostly_ready|needs_work|critical_gaps>",
  "executive_summary": "<2-3 sentences on overall audit readiness>",
  "tabs": [
    {
      "tab_number": <1-10>,
      "tab_name": "<name>",
      "completion_pct": <0-100>,
      "status": "<complete|mostly_complete|incomplete|missing>",
      "present_items": ["<item that is present>"],
      "missing_items": [{"item": "<missing item>", "sba_reference": "<SBA SOP section>", "risk": "<high|medium|low>", "action": "<what to do>"}]
    }
  ],
  "critical_gaps": ["<item that could result in guarantee denial>"],
  "high_priority_actions": [
    {"action": "<specific action>", "deadline": "<when needed>", "risk_if_missing": "<consequence>"}
  ],
  "strengths": ["<well-documented area>"],
  "estimated_hours_to_audit_ready": <int>
}"""


def claude_generate_audit_package(
    deal_data: dict,
    loan_data: dict,
    risk_report: dict,
    documents: list,
    payment_history: list,
    covenant_status: list,
    annual_reviews: list,
) -> Optional[dict]:
    _n = lambda v: v or 0

    user_msg = f"""Assess audit readiness for this SBA loan file.

LOAN:
Borrower: {deal_data.get('name', 'Unknown')}
Loan Number: {loan_data.get('loan_number', 'N/A')}
Original Amount: ${_n(loan_data.get('principal_amount')):,.0f}
Current Balance: ${_n(loan_data.get('current_principal_balance')):,.0f}
Origination Date: {loan_data.get('origination_date', 'N/A')}
Industry: {deal_data.get('industry', 'N/A')}

DOCUMENTS ON FILE:
{json.dumps([d.get('document_type', d.get('filename', 'unknown')) for d in documents], indent=2) if documents else 'None uploaded'}

PAYMENT HISTORY:
Total Payments Made: {loan_data.get('total_payments_made', 0)}
Days Past Due: {loan_data.get('days_past_due', 0)}
Late Payments: {sum(1 for p in payment_history if p.get('is_late'))}

COVENANT COMPLIANCE:
{json.dumps(covenant_status, indent=2) if covenant_status else 'No covenants tracked'}

ANNUAL REVIEWS:
{json.dumps([{'year': r.get('review_year'), 'status': r.get('status'), 'rating': r.get('risk_rating')} for r in annual_reviews], indent=2) if annual_reviews else 'No reviews on file'}

UNDERWRITING:
DSCR: {risk_report.get('dscr_base', 'N/A')}x
SBA Eligible: {risk_report.get('sba_eligible', 'N/A')}
Health Score: {risk_report.get('health_score', 'N/A')}/100

Assess all 10 audit tabs. Be specific about what is present and missing. JSON only."""

    text = _call_claude(AUDIT_PREP_SYSTEM, user_msg, max_tokens=4000)
    result = _parse_json(text)
    if not result:
        return None
    result["_powered_by"] = "claude"
    result["generated_at"] = __import__("datetime").datetime.utcnow().isoformat()
    return result


# ── ENGINE 19: Collateral Monitoring Alerts ───────────────────────────────────

COLLATERAL_MONITOR_SYSTEM = """You are an SBA loan collateral monitoring specialist.

Review the collateral portfolio and identify:
1. UCC filings expiring in the next 90 days (must be continued before expiration)
2. Insurance policies expiring in the next 60 days
3. Appraisals that need updating (typically required every 3 years for real estate)
4. Collateral whose value may have significantly changed
5. Any missing documentation

UCC filings are valid for 5 years. Continuation must be filed within 6 months before expiration.
Insurance must be maintained at all times — lapse creates serious risk.

Respond with valid JSON only.

{
  "portfolio_health": "<healthy|attention_needed|critical>",
  "total_collateral_value": <float>,
  "total_ucc_filed": <int>,
  "alerts": [
    {
      "asset_id": <int>,
      "asset_name": "<name>",
      "alert_type": "<ucc_expiring|insurance_expiring|appraisal_due|value_change|missing_docs>",
      "severity": "<critical|high|medium|low>",
      "message": "<specific alert with dates>",
      "due_date": "<date>",
      "action_required": "<specific action to take>"
    }
  ],
  "ucc_expiring_90_days": <int>,
  "insurance_expiring_60_days": <int>,
  "appraisals_due": <int>,
  "recommended_actions": ["<action 1>", "<action 2>"]
}"""


def claude_monitor_collateral(assets: list, today_str: str) -> Optional[dict]:
    user_msg = f"""Review this collateral portfolio for monitoring alerts.

TODAY: {today_str}
ASSET COUNT: {len(assets)}

ASSETS:
{json.dumps(assets, indent=2)}

Identify all UCC expirations (within 90 days), insurance expirations (within 60 days), and appraisal requirements. JSON only."""

    text = _call_claude(COLLATERAL_MONITOR_SYSTEM, user_msg, max_tokens=2000)
    result = _parse_json(text)
    if not result:
        return None
    result["_powered_by"] = "claude"
    result["checked_at"] = __import__("datetime").datetime.utcnow().isoformat()
    return result

# ── ENGINE 20: Employee Contribution Evaluator ────────────────────────────────

CONTRIBUTION_EVAL_SYSTEM = """You are evaluating an employee contribution for a small business owner. 
Estimate the business value conservatively and transparently.

Rules:
1. Be conservative — never overstate
2. Show your math step by step
3. If value is primarily cultural/intangible, say so — don't force a dollar figure
4. Prefer ranges over point estimates
5. Flag if you need more info to make a good estimate

Respond with valid JSON only. No markdown.

{
  "value_low": <float or null if intangible>,
  "value_mid": <float or null if intangible>,
  "value_high": <float or null if intangible>,
  "value_unit": "<$ | hours | % | intangible>",
  "is_intangible": <true|false>,
  "reasoning": [
    {"step": 1, "label": "<step name>", "detail": "<calculation or logic>", "value": "<intermediate result>"}
  ],
  "linked_kpis": [
    {"kpi_name": "<n>", "impact": "<how this contribution affects it>", "magnitude": "<small|medium|large>"}
  ],
  "confidence": "<low|medium|high>",
  "confidence_reason": "<why this confidence level>",
  "clarifying_questions": ["<question that would improve the estimate>"],
  "summary": "<1-2 sentences summarizing the value and how it was calculated>"
}"""


def claude_evaluate_contribution(
    title: str,
    description: str,
    category: str,
    contribution_type: str,
    evidence: str,
    employee_kpis: list,
    company_context: dict,
    employee_role: str,
) -> Optional[dict]:
    _n = lambda v: v or 0
    rev = _n(company_context.get('annual_revenue'))
    industry = company_context.get('industry', 'small business')

    user_msg = f"""Evaluate this employee contribution.

COMPANY CONTEXT:
Industry: {industry}
Annual Revenue: ${rev:,.0f}
Business Size: {'small' if rev < 2_000_000 else 'mid-size'}

EMPLOYEE:
Role: {employee_role}
Active KPIs: {json.dumps(employee_kpis, indent=2) if employee_kpis else 'Not specified'}

CONTRIBUTION:
Type: {contribution_type.replace('_', ' ').title()}
Category: {category}
Title: {title}
Description: {description}
Evidence: {evidence or 'None provided'}

Evaluate the business value. Be conservative. Show your reasoning step by step. JSON only."""

    text = _call_claude(CONTRIBUTION_EVAL_SYSTEM, user_msg, max_tokens=2000)
    result = _parse_json(text)
    if not result:
        return None
    result["_powered_by"] = "claude"
    result["evaluated_at"] = __import__("datetime").datetime.utcnow().isoformat()
    return result

# ── ENGINE 21: Guaranty Purchase Package ─────────────────────────────────────

GUARANTY_SYSTEM = """You are an SBA loan workout specialist preparing a guaranty purchase package.

When an SBA loan defaults, the lender submits a guaranty purchase package to SBA to collect on the guarantee. 
This is the "10-tab package" — a standardized set of documentation SBA requires.

The 10 tabs are:
1. Loan Summary & Default Narrative
2. Credit Application & Approval Documents
3. Closing & Disbursement Documentation
4. Collateral Documentation
5. Equity Injection Evidence
6. Financial Statements (origination + 3 years)
7. Servicing History & Payment Records
8. Default & Loss Mitigation Actions
9. Insurance & Other Recovery Actions
10. SBA Forms & Certifications

Rules:
1. Be specific about what documents are needed for each tab
2. Flag anything missing that SBA will reject the package for
3. Draft the narrative sections (tabs 1 and 8) fully
4. Calculate estimated net recovery after liquidation costs
5. Note any servicing deficiencies that could reduce or eliminate the guarantee

Respond with valid JSON only. No markdown.

{
  "package_summary": {
    "borrower_name": "<n>",
    "loan_number": "<n>",
    "original_amount": <float>,
    "balance_at_default": <float>,
    "guaranteed_amount": <float>,
    "default_date": "<date>",
    "default_reason": "<primary reason>"
  },
  "estimated_recovery": {
    "collateral_liquidation_value": <float>,
    "estimated_liquidation_costs": <float>,
    "net_recovery": <float>,
    "sba_net_loss": <float>,
    "recovery_timeline_months": <int>
  },
  "tabs": [
    {
      "tab_number": <1-10>,
      "tab_name": "<n>",
      "status": "<complete|incomplete|missing>",
      "narrative": "<drafted narrative for this tab if applicable>",
      "required_documents": ["<document>"],
      "present_documents": ["<document already in file>"],
      "missing_documents": ["<document needed>"],
      "critical_issues": ["<issue that could jeopardize guarantee>"]
    }
  ],
  "servicing_deficiencies": ["<any issue that could reduce guarantee>"],
  "overall_readiness": "<ready|needs_work|critical_gaps>",
  "estimated_preparation_hours": <int>,
  "next_steps": ["<step 1>", "<step 2>"]
}"""


def claude_generate_guaranty_package(
    deal_data: dict,
    loan_data: dict,
    risk_report: dict,
    payment_history: list,
    covenant_status: list,
    documents: list,
    default_date: str,
    default_reason: str,
) -> Optional[dict]:
    _n = lambda v: v or 0
    late_payments = sum(1 for p in payment_history if p.get("is_late"))
    balance = _n(loan_data.get("current_principal_balance"))
    original = _n(loan_data.get("principal_amount"))
    guarantee_pct = loan_data.get("guarantee_percentage") or 0.75

    user_msg = f"""Prepare a guaranty purchase package for this defaulted SBA loan.

LOAN DETAILS:
Borrower: {deal_data.get('name', 'Unknown')}
Loan Number: {loan_data.get('loan_number', 'N/A')}
Original Amount: ${_n(original):,.0f}
Balance at Default: ${_n(balance):,.0f}
Guarantee %: {guarantee_pct * 100:.0f}%
Guaranteed Amount: ${balance * guarantee_pct:,.0f}
Default Date: {default_date}
Default Reason: {default_reason}
Industry: {deal_data.get('industry', 'N/A')}

PAYMENT HISTORY:
Total Payments Made: {loan_data.get('total_payments_made', 0)}
Late Payments: {late_payments}
Days Past Due at Default: {loan_data.get('days_past_due', 0)}

COLLATERAL:
Coverage: {risk_report.get('collateral_coverage', 'N/A')}x
NOLV: ${_n(risk_report.get('total_nolv')):,.0f}

DOCUMENTS ON FILE:
{chr(10).join(['• ' + d for d in documents]) if documents else 'None specified'}

COVENANT STATUS:
{json.dumps(covenant_status, indent=2) if covenant_status else 'None tracked'}

ORIGINATION DATA:
DSCR at origination: {risk_report.get('dscr_base', 'N/A')}x
Equity injection: ${_n(deal_data.get('equity_injection')):,.0f}
SBA eligible: {risk_report.get('sba_eligible', 'Unknown')}

Draft the complete 10-tab guaranty purchase package. Be specific about missing documents.
Generate full narratives for tabs 1 and 8. JSON only."""

    text = _call_claude(GUARANTY_SYSTEM, user_msg, max_tokens=4000)
    result = _parse_json(text)
    if not result:
        return None
    result["_powered_by"] = "claude"
    result["generated_at"] = __import__("datetime").datetime.utcnow().isoformat()
    return result


# ── ENGINE 22: Credit Committee Presentation ──────────────────────────────────

COMMITTEE_SYSTEM = """You are a senior loan officer preparing a credit committee presentation for an SBA 7(a) loan.

This presentation will be reviewed by the credit committee to approve, decline, or request modifications to the loan.
It must be thorough, balanced, and formatted for efficient committee review.

Rules:
1. Lead with the recommendation — committee members are busy
2. Use actual numbers from the deal — no placeholders
3. Present risks honestly — underselling risks is worse than overselling them
4. Structure for a 10-15 minute committee presentation
5. Include deal structure alternatives if the primary structure has concerns

Respond with valid JSON only.

{
  "recommendation": "<APPROVE|APPROVE WITH CONDITIONS|DECLINE|REQUEST MORE INFO>",
  "confidence": "<high|medium|low>",
  "one_line_summary": "<20 words or less>",
  "slides": [
    {
      "slide_number": <int>,
      "title": "<slide title>",
      "type": "<cover|executive_summary|transaction|borrower|financials|underwriting|collateral|risk|structure|recommendation>",
      "key_points": ["<bullet point>"],
      "data_table": [{"label": "<n>", "value": "<v>"}],
      "speaker_notes": "<what the loan officer should say>"
    }
  ],
  "approval_conditions": ["<condition if recommending approval with conditions>"],
  "questions_committee_will_ask": ["<likely tough question>"],
  "deal_killers_addressed": ["<how each potential deal killer was resolved>"],
  "comparable_deals": "<context on similar deals in portfolio if applicable>"
}"""


def claude_generate_committee_presentation(
    deal_data: dict,
    risk_report: dict,
    uw_data: dict,
    lender_context: dict,
) -> Optional[dict]:
    _n = lambda v: v or 0
    rev = _n(deal_data.get("annual_revenue"))
    ebitda = _n(deal_data.get("ebitda"))
    price = _n(deal_data.get("purchase_price"))
    loan = _n(deal_data.get("loan_amount_requested"))
    equity = _n(deal_data.get("equity_injection"))
    dscr = risk_report.get("dscr_base") or "N/A"
    health = uw_data.get("health_score", {}).get("score", "N/A")
    verdict = uw_data.get("deal_killer", {}).get("verdict", "unknown")

    user_msg = f"""Generate a credit committee presentation.

TRANSACTION:
Borrower / Business: {deal_data.get('name', 'Unknown')}
Industry: {deal_data.get('industry', 'N/A')}
Purchase Price: ${price:,.0f} | Loan: ${loan:,.0f} | Equity: ${equity:,.0f} ({round(equity/price*100,1) if price else 0}%)
Owner Experience: {deal_data.get('owner_experience_years', 'N/A')} years
Credit Score: {deal_data.get('owner_credit_score', 'N/A')}

FINANCIALS:
Revenue: ${rev:,.0f} | EBITDA: ${ebitda:,.0f} ({round(ebitda/rev*100,1) if rev else 0}% margin)
DSCR: {dscr}x | Health Score: {health}/100
Verdict: {verdict.upper()}

UNDERWRITING:
SBA Eligible: {uw_data.get('sba_eligibility', {}).get('eligible', 'N/A')}
Failed Checks: {uw_data.get('sba_eligibility', {}).get('failed_checks', [])}
Collateral Coverage: {risk_report.get('collateral_coverage', 'N/A')}x
Annual PD: {risk_report.get('annual_pd', 'N/A')}

VALUATION:
Equity Value (mid): ${_n(risk_report.get('ev_mid')):,.0f}
Max Supportable Price: ${_n(uw_data.get('deal_killer', {}).get('max_supportable_price')):,.0f}

LENDER CONTEXT:
{json.dumps(lender_context, indent=2) if lender_context else 'Standard SBA 7a terms'}

Create a complete committee presentation with 8-10 slides. JSON only."""

    text = _call_claude(COMMITTEE_SYSTEM, user_msg, max_tokens=4000)
    result = _parse_json(text)
    if not result:
        return None
    result["_powered_by"] = "claude"
    result["generated_at"] = __import__("datetime").datetime.utcnow().isoformat()
    return result


# ── ENGINE 23: Quarterly Business Review ─────────────────────────────────────

QBR_SYSTEM = """You are a business advisor generating a quarterly business review for a small business owner.

This review helps the owner understand how their business is performing, what's working, what needs attention, and what to focus on next quarter.

Rules:
1. Be honest and specific — use actual numbers
2. Frame concerns constructively — this is a coaching document, not a report card
3. Link loan performance to business performance
4. Give 3-5 concrete, actionable priorities for next quarter
5. Keep it readable for a non-financial business owner

Respond with valid JSON only.

{
  "quarter_label": "<Q1 2026>",
  "business_name": "<n>",
  "headline": "<one-sentence summary of the quarter>",
  "overall_rating": "<strong|solid|mixed|needs_attention|critical>",
  "sections": {
    "performance_summary": "<2-3 sentences on how the business performed this quarter>",
    "financial_highlights": [{"metric": "<n>", "value": "<v>", "vs_prior": "<change>", "interpretation": "<what it means>"}],
    "loan_health": "<plain-English assessment of loan compliance and trajectory>",
    "whats_working": ["<specific strength with data>"],
    "areas_for_improvement": [{"area": "<n>", "observation": "<what the data shows>", "suggestion": "<actionable advice>"}],
    "industry_context": "<brief comparison to industry benchmarks if relevant>",
    "risk_flags": ["<anything lender or advisor should know about>"]
  },
  "q_priorities": [
    {"priority": 1, "title": "<title>", "action": "<specific action>", "why": "<why this matters>", "by_when": "<timeframe>"}
  ],
  "questions_for_owner": ["<question worth reflecting on>"],
  "next_review_date": "<Q2 2026>"
}"""


def claude_generate_qbr(
    deal_data: dict,
    loan_data: dict,
    risk_report: dict,
    cashflows: list,
    quarter: int,
    year: int,
) -> Optional[dict]:
    _n = lambda v: v or 0
    rev = _n(deal_data.get("annual_revenue"))
    ebitda = _n(deal_data.get("ebitda"))
    dscr = risk_report.get("dscr_base") or "N/A"
    health = risk_report.get("health_score") or "N/A"
    balance = _n(loan_data.get("current_principal_balance"))
    dpd = loan_data.get("days_past_due") or 0

    # Get recent cashflow data
    recent_cf = cashflows[-3:] if cashflows else []

    user_msg = f"""Generate a Q{quarter} {year} business review for this SBA loan borrower.

BUSINESS:
Name: {deal_data.get('name', 'Unknown')}
Industry: {deal_data.get('industry', 'N/A')}
Annual Revenue: ${rev:,.0f}
EBITDA: ${ebitda:,.0f} ({round(ebitda/rev*100,1) if rev else 0}% margin)

LOAN STATUS:
Current Balance: ${balance:,.0f}
Days Past Due: {dpd}
DSCR: {dscr}x
Health Score: {health}/100

RECENT CASHFLOWS:
{json.dumps(recent_cf, indent=2) if recent_cf else 'Not available'}

HEALTH BREAKDOWN:
Cashflow Score: {risk_report.get('health_score_cashflow', 'N/A')}
Stability Score: {risk_report.get('health_score_stability', 'N/A')}
Growth Score: {risk_report.get('health_score_growth', 'N/A')}
Liquidity Score: {risk_report.get('health_score_liquidity', 'N/A')}

Write this for the BUSINESS OWNER — plain language, actionable, honest but constructive.
Quarter: Q{quarter} {year}. JSON only."""

    text = _call_claude(QBR_SYSTEM, user_msg, max_tokens=3000)
    result = _parse_json(text)
    if not result:
        return None
    result["_powered_by"] = "claude"
    result["generated_at"] = __import__("datetime").datetime.utcnow().isoformat()
    return result


# ── ENGINE 24: Crisis Response Workflow ──────────────────────────────────────

CRISIS_SYSTEM = """You are a business crisis advisor helping a small business owner respond to an acute business problem.

The owner needs immediate, structured guidance for the first 24-48 hours of a crisis situation.

Crisis types you handle:
- Major customer loss (lost a key account)
- Key person departure (owner, manager, key employee leaving)
- Compliance issue (regulatory, legal, license problem)
- Cash crisis (can't make payroll, bills coming due)
- Operational failure (equipment breakdown, supply chain, facility)
- Reputation/PR crisis

Rules:
1. First hour actions come first — urgency matters
2. Be specific and actionable — no vague advice
3. Flag if the lender should be notified (and help draft that communication)
4. Include immediate cash preservation steps if relevant
5. Separate "stabilize" actions (hours 1-24) from "recover" actions (days 2-14)

Respond with valid JSON only.

{
  "crisis_type": "<type>",
  "severity_assessment": "<critical|serious|manageable>",
  "headline": "<what this crisis means for the business in plain English>",
  "immediate_risk_to_loan": "<yes/no and brief explanation>",
  "stabilize_actions": [
    {"hour": "<1-4|4-12|12-24>", "action": "<specific step>", "who": "<owner|advisor|attorney|lender>", "why": "<why this can't wait>"}
  ],
  "recovery_actions": [
    {"day": "<2-3|4-7|8-14>", "action": "<step>", "outcome": "<what this achieves>"}
  ],
  "notify_lender": <true|false>,
  "lender_communication_draft": "<draft message to lender if applicable>",
  "cash_preservation_steps": ["<step if cash is at risk>"],
  "mistakes_to_avoid": ["<common mistake in this situation>"],
  "resources_to_engage": ["<attorney|CPA|industry association|SBA resource center|etc>"],
  "30_day_outlook": "<honest assessment of where things stand in 30 days if actions are taken>"
}"""


def claude_crisis_response(
    crisis_type: str,
    description: str,
    deal_data: dict,
    loan_data: dict,
    risk_report: dict,
) -> Optional[dict]:
    _n = lambda v: v or 0
    rev = _n(deal_data.get("annual_revenue"))
    balance = _n(loan_data.get("current_principal_balance"))
    dpd = loan_data.get("days_past_due") or 0
    health = risk_report.get("health_score") or "N/A"

    user_msg = f"""Generate an immediate crisis response plan.

BUSINESS CONTEXT:
Business: {deal_data.get('name', 'Unknown')}
Industry: {deal_data.get('industry', 'N/A')}
Annual Revenue: ${rev:,.0f}
SBA Loan Balance: ${balance:,.0f}
Days Past Due: {dpd}
Health Score: {health}/100
DSCR: {risk_report.get('dscr_base', 'N/A')}x

CRISIS:
Type: {crisis_type}
Description: {description}

Generate an immediate 24-48 hour response plan. Be specific. The owner needs to act now.
JSON only."""

    text = _call_claude(CRISIS_SYSTEM, user_msg, max_tokens=2500)
    result = _parse_json(text)
    if not result:
        return None
    result["_powered_by"] = "claude"
    result["generated_at"] = __import__("datetime").datetime.utcnow().isoformat()
    return result
