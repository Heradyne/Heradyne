"""
Portfolio Tools: Heatmap, Benchmarking, Stress Tests, SBA Wizard

GET  /portfolio-tools/heatmap           — Portfolio concentration heatmap
GET  /portfolio-tools/benchmarks        — Peer benchmarking (anonymous)
POST /portfolio-tools/stress-test       — Run a stress test scenario
GET  /portfolio-tools/stress-tests      — Past stress tests
GET  /portfolio-tools/sba-wizard/{deal_id} — SBA package checklist for deal
"""
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, Float, Boolean, Text, JSON, DateTime, ForeignKey, func
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User
from app.models.deal import Deal, DealMatch, DealRiskReport
from app.models.base import Base

router = APIRouter()


class PortfolioSnapshot(Base):
    __tablename__ = "portfolio_snapshots"
    id = Column(Integer, primary_key=True)
    lender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    snapshot_date = Column(DateTime, default=datetime.utcnow)
    total_loans = Column(Integer, default=0)
    total_exposure = Column(Float, default=0)
    avg_dscr = Column(Float, nullable=True)
    avg_ltv = Column(Float, nullable=True)
    avg_loan_size = Column(Float, nullable=True)
    approval_rate = Column(Float, nullable=True)
    default_rate = Column(Float, nullable=True)
    avg_days_to_close = Column(Float, nullable=True)
    industry_mix = Column(JSON, nullable=True)
    status_mix = Column(JSON, nullable=True)
    vintage_mix = Column(JSON, nullable=True)
    geographic_mix = Column(JSON, nullable=True)


class StressTest(Base):
    __tablename__ = "stress_tests"
    id = Column(Integer, primary_key=True)
    lender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    scenario_name = Column(String(255), nullable=False)
    parameters = Column(JSON, nullable=True)
    results = Column(JSON, nullable=True)
    loans_at_risk = Column(Integer, nullable=True)
    exposure_at_risk = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class StressTestRequest(BaseModel):
    scenario_name: str
    scenario_type: str  # rate_shock, industry_decline, borrower_default, combined
    rate_increase_bps: Optional[float] = 0      # basis points
    industry_revenue_decline_pct: Optional[float] = 0  # e.g. 30 = 30% decline
    affected_industry: Optional[str] = None
    specific_borrower_default_id: Optional[int] = None
    custom_parameters: Optional[dict] = None


HEALTH_COLORS = {
    "green":  {"min": 75, "color": "#10b981", "label": "Healthy"},
    "yellow": {"min": 50, "color": "#f59e0b", "label": "Watch"},
    "orange": {"min": 30, "color": "#f97316", "label": "Concern"},
    "red":    {"min": 0,  "color": "#ef4444", "label": "At Risk"},
}


def _health_color(score):
    if score is None: return "#6b7280"
    if score >= 75: return "#10b981"
    if score >= 50: return "#f59e0b"
    if score >= 30: return "#f97316"
    return "#ef4444"


def _get_lender_portfolio(db, lender_id):
    """Get all funded/approved deals for this lender."""
    matches = db.query(DealMatch).filter(
        DealMatch.lender_id == lender_id,
        DealMatch.status.in_(['accepted', 'counter_accepted'])
    ).all()
    deal_ids = [m.deal_id for m in matches]
    if not deal_ids:
        return []
    return db.query(Deal).filter(Deal.id.in_(deal_ids)).all()


@router.get("/heatmap")
async def portfolio_heatmap(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    deals = _get_lender_portfolio(db, current_user.id)

    if not deals:
        return {"exists": False, "message": "No portfolio deals yet"}

    total_exposure = sum(d.loan_amount_requested or 0 for d in deals)

    # Industry concentration
    industry_map = {}
    for d in deals:
        ind = d.industry or "Other"
        if ind not in industry_map:
            industry_map[ind] = {"count": 0, "exposure": 0, "health_scores": [], "deals": []}
        rpt = db.query(DealRiskReport).filter(DealRiskReport.deal_id == d.id).order_by(DealRiskReport.version.desc()).first()
        score = rpt.health_score if rpt else None
        industry_map[ind]["count"] += 1
        industry_map[ind]["exposure"] += d.loan_amount_requested or 0
        if score: industry_map[ind]["health_scores"].append(score)
        industry_map[ind]["deals"].append({"id": d.id, "name": d.name, "amount": d.loan_amount_requested, "score": score})

    industry_heatmap = []
    for ind, data in industry_map.items():
        avg_score = sum(data["health_scores"]) / len(data["health_scores"]) if data["health_scores"] else None
        pct = round(data["exposure"] / max(total_exposure, 1) * 100, 1)
        industry_heatmap.append({
            "industry": ind,
            "count": data["count"],
            "exposure": data["exposure"],
            "pct_of_portfolio": pct,
            "avg_health_score": round(avg_score, 1) if avg_score else None,
            "color": _health_color(avg_score),
            "risk_flag": pct > 25,  # flag if > 25% concentration
            "deals": data["deals"],
        })
    industry_heatmap.sort(key=lambda x: -x["exposure"])

    # Loan size buckets
    size_buckets = {
        "< $500K":     {"min": 0,        "max": 500000,   "count": 0, "exposure": 0},
        "$500K-$1M":   {"min": 500000,   "max": 1000000,  "count": 0, "exposure": 0},
        "$1M-$2M":     {"min": 1000000,  "max": 2000000,  "count": 0, "exposure": 0},
        "$2M-$5M":     {"min": 2000000,  "max": 5000000,  "count": 0, "exposure": 0},
        "> $5M":       {"min": 5000000,  "max": 999999999,"count": 0, "exposure": 0},
    }
    for d in deals:
        amt = d.loan_amount_requested or 0
        for label, bucket in size_buckets.items():
            if bucket["min"] <= amt < bucket["max"]:
                bucket["count"] += 1
                bucket["exposure"] += amt
                break

    # Vintage (year funded)
    vintage_map = {}
    for d in deals:
        year = d.created_at.year if d.created_at else "Unknown"
        if year not in vintage_map:
            vintage_map[year] = {"count": 0, "exposure": 0}
        vintage_map[year]["count"] += 1
        vintage_map[year]["exposure"] += d.loan_amount_requested or 0

    # Health score distribution
    all_scores = []
    deal_health = []
    for d in deals:
        rpt = db.query(DealRiskReport).filter(DealRiskReport.deal_id == d.id).order_by(DealRiskReport.version.desc()).first()
        score = rpt.health_score if rpt else None
        dscr = rpt.dscr_base if rpt else None
        if score: all_scores.append(score)
        deal_health.append({
            "id": d.id,
            "name": d.name,
            "industry": d.industry,
            "amount": d.loan_amount_requested,
            "health_score": score,
            "dscr": dscr,
            "color": _health_color(score),
            "status": d.status.value if hasattr(d.status, 'value') else str(d.status),
        })

    deal_health.sort(key=lambda x: (x["health_score"] or 999))

    return {
        "exists": True,
        "summary": {
            "total_deals": len(deals),
            "total_exposure": total_exposure,
            "avg_loan_size": total_exposure / max(len(deals), 1),
            "avg_health_score": round(sum(all_scores) / max(len(all_scores), 1), 1) if all_scores else None,
            "at_risk_count": sum(1 for s in all_scores if s < 50),
            "at_risk_exposure": sum(d["amount"] or 0 for d in deal_health if (d["health_score"] or 99) < 50),
        },
        "industry_heatmap": industry_heatmap,
        "size_distribution": [{"label": k, **v} for k, v in size_buckets.items() if v["count"] > 0],
        "vintage_distribution": [{"year": k, **v} for k, v in sorted(vintage_map.items())],
        "deal_health_map": deal_health,
        "concentration_warnings": [
            i for i in industry_heatmap if i["risk_flag"]
        ],
    }


@router.get("/benchmarks")
async def get_benchmarks(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Anonymous peer benchmarking against other lenders on the platform."""
    deals = _get_lender_portfolio(db, current_user.id)

    # My stats
    total_exposure = sum(d.loan_amount_requested or 0 for d in deals)
    my_dscrs, my_ltvs = [], []
    for d in deals:
        rpt = db.query(DealRiskReport).filter(DealRiskReport.deal_id == d.id).order_by(DealRiskReport.version.desc()).first()
        if rpt:
            if rpt.dscr_base: my_dscrs.append(rpt.dscr_base)

    # All lenders' stats (anonymized)
    all_matches = db.query(DealMatch).filter(DealMatch.status.in_(['accepted', 'counter_accepted'])).all()
    all_lender_ids = list(set(m.lender_id for m in all_matches))

    platform_dscrs, platform_sizes = [], []
    for lid in all_lender_ids:
        lid_matches = [m for m in all_matches if m.lender_id == lid]
        lid_deal_ids = [m.deal_id for m in lid_matches]
        lid_deals = db.query(Deal).filter(Deal.id.in_(lid_deal_ids)).all() if lid_deal_ids else []
        for d in lid_deals:
            if d.loan_amount_requested:
                platform_sizes.append(d.loan_amount_requested)
            rpt = db.query(DealRiskReport).filter(DealRiskReport.deal_id == d.id).order_by(DealRiskReport.version.desc()).first()
            if rpt and rpt.dscr_base:
                platform_dscrs.append(rpt.dscr_base)

    def safe_avg(lst): return round(sum(lst) / max(len(lst), 1), 2) if lst else None
    def percentile(lst, val):
        if not lst or val is None: return None
        sorted_lst = sorted(lst)
        idx = sum(1 for x in sorted_lst if x <= val)
        return round(idx / len(sorted_lst) * 100)

    my_avg_dscr = safe_avg(my_dscrs)
    platform_avg_dscr = safe_avg(platform_dscrs)
    my_avg_size = total_exposure / max(len(deals), 1) if deals else 0

    return {
        "your_portfolio": {
            "total_loans": len(deals),
            "total_exposure": total_exposure,
            "avg_loan_size": round(my_avg_size),
            "avg_dscr": my_avg_dscr,
        },
        "platform_benchmarks": {
            "avg_loan_size": round(safe_avg(platform_sizes) or 0),
            "avg_dscr": platform_avg_dscr,
            "total_lenders": len(all_lender_ids),
            "total_loans": len(all_matches),
        },
        "your_percentiles": {
            "dscr_percentile": percentile(platform_dscrs, my_avg_dscr),
            "loan_size_percentile": percentile(platform_sizes, my_avg_size),
        },
        "insights": [
            f"Your average DSCR of {my_avg_dscr}x is {'above' if (my_avg_dscr or 0) > (platform_avg_dscr or 0) else 'below'} platform average of {platform_avg_dscr}x" if my_avg_dscr and platform_avg_dscr else "Run more deals to unlock peer comparison",
        ],
    }


@router.post("/stress-test")
async def run_stress_test(
    data: StressTestRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Model what happens to the portfolio under stress scenarios."""
    deals = _get_lender_portfolio(db, current_user.id)
    if not deals:
        raise HTTPException(status_code=400, detail="No portfolio deals to stress test")

    results = []
    loans_at_risk = 0
    exposure_at_risk = 0

    for deal in deals:
        rpt = db.query(DealRiskReport).filter(
            DealRiskReport.deal_id == deal.id
        ).order_by(DealRiskReport.version.desc()).first()

        baseline_dscr = rpt.dscr_base if rpt else 1.2
        baseline_score = rpt.health_score if rpt else 60
        loan_amount = deal.loan_amount_requested or 0

        stressed_dscr = baseline_dscr
        stressed_score = baseline_score
        impact_notes = []

        # Rate shock: increase in debt service reduces DSCR
        if data.rate_increase_bps and data.rate_increase_bps > 0:
            rate_increase = data.rate_increase_bps / 10000
            # Approximate: 200bps on a 25yr amortization reduces DSCR by ~10-15%
            dscr_impact = rate_increase * 5  # rough multiplier
            stressed_dscr -= dscr_impact
            impact_notes.append(f"+{data.rate_increase_bps}bps rate shock: DSCR -{round(dscr_impact,2)}")

        # Industry revenue decline
        if data.industry_revenue_decline_pct and data.industry_revenue_decline_pct > 0:
            if not data.affected_industry or deal.industry == data.affected_industry or data.affected_industry == "ALL":
                # Revenue decline flows through to DSCR proportionally
                revenue_factor = 1 - (data.industry_revenue_decline_pct / 100)
                stressed_dscr *= revenue_factor
                stressed_score *= revenue_factor
                impact_notes.append(f"{data.industry_revenue_decline_pct}% revenue decline applied")

        # Single borrower default
        if data.specific_borrower_default_id and deal.id == data.specific_borrower_default_id:
            stressed_dscr = 0
            stressed_score = 0
            impact_notes.append("Borrower default modeled")

        at_risk = stressed_dscr < 1.15 or stressed_score < 40

        if at_risk:
            loans_at_risk += 1
            exposure_at_risk += loan_amount

        results.append({
            "deal_id": deal.id,
            "deal_name": deal.name,
            "industry": deal.industry,
            "loan_amount": loan_amount,
            "baseline_dscr": round(baseline_dscr, 2),
            "stressed_dscr": round(max(stressed_dscr, 0), 2),
            "baseline_score": round(baseline_score, 1) if baseline_score else None,
            "stressed_score": round(max(stressed_score, 0), 1) if stressed_score else None,
            "at_risk": at_risk,
            "impact_notes": impact_notes,
            "status_change": "WATCH" if stressed_dscr < 1.25 and stressed_dscr >= 1.0 else ("DEFAULT RISK" if stressed_dscr < 1.0 else "PERFORMING"),
        })

    results.sort(key=lambda x: x["stressed_dscr"])

    total_exposure = sum(d.loan_amount_requested or 0 for d in deals)
    st = StressTest(
        lender_id=current_user.id,
        scenario_name=data.scenario_name,
        parameters=data.dict(),
        results=results,
        loans_at_risk=loans_at_risk,
        exposure_at_risk=exposure_at_risk,
    )
    db.add(st)
    db.commit()
    db.refresh(st)

    return {
        "stress_test_id": st.id,
        "scenario_name": data.scenario_name,
        "summary": {
            "total_loans_tested": len(deals),
            "loans_at_risk": loans_at_risk,
            "exposure_at_risk": exposure_at_risk,
            "pct_portfolio_at_risk": round(exposure_at_risk / max(total_exposure, 1) * 100, 1),
        },
        "results": results,
    }


@router.get("/stress-tests")
async def get_stress_tests(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    tests = db.query(StressTest).filter(
        StressTest.lender_id == current_user.id
    ).order_by(StressTest.created_at.desc()).limit(20).all()

    return {"stress_tests": [{
        "id": t.id,
        "scenario_name": t.scenario_name,
        "loans_at_risk": t.loans_at_risk,
        "exposure_at_risk": t.exposure_at_risk,
        "created_at": t.created_at.isoformat(),
    } for t in tests]}


@router.get("/sba-wizard/{deal_id}")
async def sba_wizard(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Generate a pre-populated SBA 7(a) package checklist from deal data."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    rpt = db.query(DealRiskReport).filter(DealRiskReport.deal_id == deal_id).order_by(DealRiskReport.version.desc()).first()

    # Pre-populate from deal data
    forms = [
        {
            "form": "SBA Form 1919",
            "title": "Borrower Information Form",
            "description": "Required for all 7(a) loans. One per owner with 20%+ stake.",
            "status": "ready_to_send",
            "auto_populated": ["business_name", "loan_amount", "business_address", "business_type"],
            "fields_needed": ["owner_ssn", "owner_dob", "citizenship_status", "criminal_history"],
            "download_url": None,
        },
        {
            "form": "SBA Form 912",
            "title": "Statement of Personal History",
            "description": "Required if any owner has criminal history to disclose.",
            "status": "conditional",
            "auto_populated": [],
            "fields_needed": ["criminal_history_details"],
            "download_url": None,
        },
        {
            "form": "SBA Form 413",
            "title": "Personal Financial Statement",
            "description": "Required for each owner with 20%+ stake and each guarantor.",
            "status": "needs_borrower_input",
            "auto_populated": [],
            "fields_needed": ["personal_assets", "personal_liabilities", "personal_income"],
            "download_url": None,
        },
        {
            "form": "IRS Form 4506-C",
            "title": "Tax Transcript Request",
            "description": "Must be signed by borrower to authorize IRS tax transcript pull.",
            "status": "needs_borrower_signature",
            "auto_populated": ["business_name", "ein"],
            "fields_needed": ["borrower_signature", "date"],
            "download_url": None,
        },
        {
            "form": "Environmental Questionnaire",
            "title": "Environmental Due Diligence",
            "description": "Required for all 7(a) loans. Phase I/II if real estate collateral.",
            "status": "needs_borrower_input",
            "auto_populated": [],
            "fields_needed": ["property_address", "environmental_history"],
            "download_url": None,
        },
        {
            "form": "Business Plan",
            "title": "Business Plan / Executive Summary",
            "description": "Required for startups and businesses <2 years. Recommended for all.",
            "status": "needs_borrower_input",
            "auto_populated": ["business_description", "industry", "loan_purpose"],
            "fields_needed": ["management_experience", "market_analysis", "financial_projections"],
            "download_url": None,
        },
    ]

    # Document checklist auto-populated from deal
    documents = [
        {"name": "3 Years Business Tax Returns", "status": "pending", "required": True},
        {"name": "3 Years Personal Tax Returns (all owners)", "status": "pending", "required": True},
        {"name": "YTD P&L + Balance Sheet", "status": "pending", "required": True},
        {"name": "12 Months Business Bank Statements", "status": "pending", "required": True},
        {"name": "Executed Purchase Agreement", "status": "pending", "required": True, "note": "Acquisition loans only"},
        {"name": "Business Debt Schedule", "status": "pending", "required": True},
        {"name": "Proof of Equity Injection", "status": "pending", "required": True, "note": f"10% minimum — ${round((deal.loan_amount_requested or 0) * 0.1):,} based on requested amount"},
        {"name": "A/R + A/P Aging Reports", "status": "pending", "required": False},
        {"name": "Business License / Permits", "status": "pending", "required": False},
        {"name": "Franchise Agreement", "status": "pending", "required": False, "note": "If applicable"},
    ]

    # Pre-fill from deal
    prefilled = {
        "business_name": deal.business_name or deal.name,
        "industry": deal.industry,
        "loan_amount": deal.loan_amount_requested,
        "loan_purpose": deal.loan_purpose or "Business acquisition",
        "annual_revenue": deal.annual_revenue,
        "ebitda": deal.ebitda,
        "dscr": rpt.dscr_base if rpt else None,
        "health_score": rpt.health_score if rpt else None,
        "equity_value": rpt.equity_value_mid if rpt else None,
        "sde": rpt.normalized_sde if rpt else None,
        "equity_injection_required": round((deal.loan_amount_requested or 0) * 0.10),
        "equity_injection_pct": 10,
    }

    return {
        "deal_id": deal_id,
        "deal_name": deal.name,
        "forms": forms,
        "documents": documents,
        "prefilled": prefilled,
        "readiness_score": round(sum(1 for f in forms if f["status"] == "ready_to_send") / len(forms) * 100),
        "next_steps": [
            f"Send SBA Form 1919 to borrower for completion",
            f"Request IRS 4506-C signature — authorize tax transcript pull",
            f"Verify equity injection source — ${prefilled['equity_injection_required']:,} required (10%)",
            f"Order business valuation appraisal if not done",
            f"Check SBA eligibility — industry, size, use of proceeds",
        ],
    }
