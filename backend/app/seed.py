"""
underwrite-platform Database Seed Script
Creates pre-analyzed deals so UnderwriteOS results appear immediately on first login.
"""
import sys
from datetime import datetime, date, timezone, timedelta
from sqlalchemy.orm import Session
from app.core.database import SessionLocal, engine
from app.core.security import get_password_hash
from app.models import Base
from app.models.user import User, UserRole
from app.models.deal import Deal, DealType, DealStatus, DealRiskReport, DealMatch, MonthlyCashflow
from app.models.policy import LenderPolicy, InsurerPolicy
from app.models.assumption import SystemAssumption, DEFAULT_ASSUMPTIONS
from app.models.executed_loan import ExecutedLoan, LoanPayment, LoanStatus


def seed_users(db):
    print("Seeding users...")
    borrower = User(email="borrower@example.com", hashed_password=get_password_hash("password123"),
        full_name="John Borrower", company_name="ABC Manufacturing Inc.", role=UserRole.BORROWER, is_active=True)
    db.add(borrower)
    lender1 = User(email="lender1@example.com", hashed_password=get_password_hash("password123"),
        full_name="Sarah Lender", company_name="First Capital Partners", role=UserRole.LENDER, is_active=True)
    db.add(lender1)
    db.flush()
    loan_officer = User(email="loanofficer@example.com", hashed_password=get_password_hash("password123"),
        full_name="Tom Verifier", company_name="First Capital Partners", role=UserRole.LOAN_OFFICER, is_active=True, organization_id=lender1.id)
    db.add(loan_officer)
    credit_committee = User(email="creditcommittee@example.com", hashed_password=get_password_hash("password123"),
        full_name="Diana Approver", company_name="First Capital Partners", role=UserRole.CREDIT_COMMITTEE, is_active=True, organization_id=lender1.id)
    db.add(credit_committee)
    lender2 = User(email="lender2@example.com", hashed_password=get_password_hash("password123"),
        full_name="Mike Finance", company_name="Growth Lending Group", role=UserRole.LENDER, is_active=True)
    db.add(lender2)
    insurer = User(email="insurer@example.com", hashed_password=get_password_hash("password123"),
        full_name="Lisa Risk", company_name="Credit Shield Insurance", role=UserRole.INSURER, is_active=True)
    db.add(insurer)
    admin = User(email="admin@example.com", hashed_password=get_password_hash("password123"),
        full_name="Admin User", company_name="UnderwriteOS", role=UserRole.ADMIN, is_active=True)
    db.add(admin)
    db.commit()
    for u in [borrower, lender1, loan_officer, credit_committee, lender2, insurer, admin]:
        db.refresh(u)
    print(f"  Created 7 users")
    return {"borrower": borrower, "lender1": lender1, "loan_officer": loan_officer,
            "credit_committee": credit_committee, "lender2": lender2, "insurer": insurer, "admin": admin}


def seed_deals(db, borrower):
    """
    Create 2 deals already in ANALYZED status with full Heradyne + UnderwriteOS
    risk report data pre-populated. Results visible immediately on first login —
    no need to submit and wait for Celery.
    """
    print("Seeding pre-analyzed deals with UnderwriteOS data...")

    # ── DEAL 1: Acme Plumbing LLC ────────────────────────────────────────────
    deal1 = Deal(
        borrower_id=borrower.id, name="Acme Plumbing LLC — Acquisition",
        deal_type=DealType.ACQUISITION, status=DealStatus.ANALYZED,
        industry="plumbing",
        business_description="Acquisition of Acme Plumbing LLC, 12-year established plumbing company in Greenville, SC. 7 employees, $1.49M TTM revenue, strong recurring commercial accounts.",
        loan_amount_requested=1_440_000, loan_term_months=120,
        annual_revenue=1_488_000, gross_profit=743_000, ebitda=372_000, capex=24_000, debt_service=0,
        addbacks=[
            {"description": "Owner compensation above market", "amount": 120_000},
            {"description": "Depreciation and amortization",   "amount": 42_000},
            {"description": "One-time equipment repair",        "amount": 6_400},
            {"description": "Personal vehicle non-business",    "amount": 21_000},
        ],
        purchase_price=1_800_000, equity_injection=360_000,
        business_assets=[
            {"type": "equipment",           "value": 196_000, "description": "Fleet and tools"},
            {"type": "accounts_receivable", "value": 124_800, "description": "Customer AR (32-day avg)"},
            {"type": "cash",                "value": 89_200,  "description": "Operating cash"},
        ],
        personal_assets=[
            {"type": "primary_residence",   "value": 340_000, "description": "Owner's home"},
            {"type": "brokerage_accounts",  "value": 85_000,  "description": "Investment portfolio"},
        ],
        owner_credit_score=730, owner_experience_years=12
    )
    db.add(deal1)
    db.flush()

    r1 = DealRiskReport(
        deal_id=deal1.id, version=1,
        # Heradyne engine outputs
        normalized_ebitda=500_000, post_debt_fcf=327_200,
        dscr_base=2.89, dscr_stress=2.31,
        sba_anchor_pd=0.03, industry_multiplier=1.1, leverage_multiplier=1.0, volatility_multiplier=1.0, annual_pd=0.033,
        ev_low=1_250_000, ev_mid=1_718_000, ev_high=2_000_000, durability_score=72,
        business_nolv=272_640, personal_nolv=357_000, total_nolv=629_640, collateral_coverage=0.437,
        recommended_guarantee_pct=0.60, recommended_escrow_pct=0.05,
        recommended_alignment={"personal_guarantee": True, "monthly_reporting": True, "key_person_life_insurance": True, "annual_audit": False},
        # UnderwriteOS: Health Score
        health_score=78.0, health_score_cashflow=18.0, health_score_stability=17.6,
        health_score_growth=15.9, health_score_liquidity=14.0, health_score_distress=12.5,
        # UnderwriteOS: PDSCR
        pdscr=1.42, owner_draw_annual=120_000, premium_capacity_monthly=4_200,
        # UnderwriteOS: Valuation
        normalized_sde=500_000, sde_multiple_implied=3.60,
        equity_value_low=1_142_000, equity_value_mid=1_609_000, equity_value_high=1_891_000,
        net_debt=108_800, valuation_method_weights={"sde": 0.40, "ebitda": 0.30, "dcf": 0.20, "revenue": 0.05, "asset": 0.05},
        # UnderwriteOS: SBA
        sba_eligible=True,
        sba_eligibility_checklist=[
            {"criterion": "For-profit US business",              "pass": True,  "note": "Confirmed"},
            {"criterion": "Eligible industry",                    "pass": True,  "note": "Plumbing — eligible"},
            {"criterion": "Revenue <= SBA size standard ($15M)", "pass": True,  "note": "$1.49M revenue"},
            {"criterion": "DSCR >= 1.25",                       "pass": True,  "note": "DSCR 2.89"},
            {"criterion": "LTV <= 90%",                         "pass": True,  "note": "LTV 80%"},
            {"criterion": "Equity injection >= 10%",             "pass": True,  "note": "20% equity ($360K)"},
            {"criterion": "Loan <= $5M (SBA 7(a) max)",         "pass": True,  "note": "$1.44M"},
            {"criterion": "Business operating >= 2 years",       "pass": True,  "note": "12 years"},
            {"criterion": "Owner/operator experience",           "pass": True,  "note": "12 years in industry"},
            {"criterion": "No outstanding federal tax liens",    "pass": True,  "note": "Borrower attestation required"},
            {"criterion": "No prior SBA default (CAIVRS)",       "pass": True,  "note": "CAIVRS check at origination"},
            {"criterion": "Personal guarantee all 20%+ owners", "pass": True,  "note": "Required at origination"},
            {"criterion": "Key-person insurance (loan > $1M)",  "pass": True,  "note": "Required at close"},
            {"criterion": "Collateral pledged (all available)", "pass": True,  "note": "Business assets + personal RE"},
        ],
        sba_max_loan=1_620_000, sba_ltv=0.800,
        # UnderwriteOS: Deal Killer
        deal_killer_verdict="buy", deal_confidence_score=84.0, max_supportable_price=1_928_000,
        breakpoint_scenarios=[
            {"label": "Base case (0% decline)",      "revenue_impact_pct": 0.0,   "dscr": 2.89, "max_supportable_price": 1_928_000, "verdict": "buy"},
            {"label": "Mild stress (-10%)",          "revenue_impact_pct": -10.0, "dscr": 2.60, "max_supportable_price": 1_735_000, "verdict": "buy"},
            {"label": "Moderate stress (-20%)",      "revenue_impact_pct": -20.0, "dscr": 1.29, "max_supportable_price": 1_542_000, "verdict": "buy"},
            {"label": "Severe stress (-30%)",        "revenue_impact_pct": -30.0, "dscr": 0.96, "max_supportable_price": 1_157_000, "verdict": "renegotiate"},
            {"label": "Loss of top customer (-18%)", "revenue_impact_pct": -18.0, "dscr": 1.38, "max_supportable_price": 1_579_000, "verdict": "buy"},
        ],
        # UnderwriteOS: Cash Flow
        cash_runway_months=3.2,
        cash_forecast_18m=[
            {"month": "Nov", "revenue": 124_000, "burn": 96_000, "net": 28_000,  "balance": 117_200},
            {"month": "Dec", "revenue": 127_100, "burn": 96_000, "net": 31_100,  "balance": 148_300},
            {"month": "Jan", "revenue": 130_278, "burn": 96_000, "net": 34_278,  "balance": 182_578},
            {"month": "Feb", "revenue": 133_535, "burn": 96_000, "net": 37_535,  "balance": 220_113},
            {"month": "Mar", "revenue": 136_873, "burn": 96_000, "net": 40_873,  "balance": 260_986},
            {"month": "Apr", "revenue": 140_295, "burn": 96_000, "net": 44_295,  "balance": 305_281},
        ],
        # UnderwriteOS: Playbooks
        playbooks=[
            {
                "title": "Cash runway critical — 3.2 months remaining",
                "severity": "critical",
                "trigger": "Cash $89K / burn $96K/mo — threshold 2 months",
                "impact_summary": "AR acceleration + vendor deferral extends runway to 68 days",
                "estimated_annual_impact": 35_910,
                "actions": [
                    {"step": 1, "label": "Immediate — today", "detail": "Call top 2 overdue AR accounts (Greenville Property Mgmt $14,800 + SC School District $7,400). Offer 1.5% early-pay discount.", "dollar_impact": 22_200},
                    {"step": 2, "label": "This week", "detail": "Defer Apex Supply ($8,200) and FleetPro lease ($4,100) by 30 days. Both vendors accept deferrals.", "dollar_impact": 12_300},
                    {"step": 3, "label": "This week", "detail": "Cancel unused SaaS: ServiceTitan add-on $680/mo, Housecall Pro backup $240/mo, unused Slack seats $180/mo.", "dollar_impact": 1_800},
                ],
            },
            {
                "title": "DSCR at risk under moderate stress",
                "severity": "critical",
                "trigger": "DSCR 1.29 at -20% revenue — SBA minimum: 1.25",
                "impact_summary": "4% pricing increase or fleet optimization restores 8%+ DSCR buffer",
                "estimated_annual_impact": 79_920,
                "actions": [
                    {"step": 1, "label": "Option A — pricing", "detail": "Increase labor rate $95 to $99/hr (4.2%). Adds $56,400/yr. DSCR at -20% stress: 1.29 -> 1.36.", "dollar_impact": 56_400},
                    {"step": 2, "label": "Option B — cost",    "detail": "Fleet routing optimization ($14,400/yr) + replace 2 aging vans ($9,120/yr). Combined: $23,520/yr.", "dollar_impact": 23_520},
                ],
            },
            {
                "title": "Gross margin 49.9% — below 52% industry avg",
                "severity": "warning",
                "trigger": "2.1 pts below SBA plumbing cohort average",
                "impact_summary": "Parts markup + labor utilization can add $159K/yr",
                "estimated_annual_impact": 159_340,
                "actions": [
                    {"step": 1, "label": "Parts margin",      "detail": "Increase parts markup 18% -> 24%. Update ServiceTitan catalog this week.", "dollar_impact": 19_340},
                    {"step": 2, "label": "Labor utilization", "detail": "Improve dispatch to raise billable 71% -> 78%. 4 techs x 7 extra hrs/wk x $95 = $140K/yr.", "dollar_impact": 140_000},
                ],
            },
            {
                "title": "Recurring revenue opportunity — $0 MRR today",
                "severity": "opportunity",
                "trigger": "100% of $1.49M revenue is one-time/ad-hoc",
                "impact_summary": "Maintenance contracts add $119K/yr MRR and increase valuation multiple from 3.2x to 4.1x",
                "estimated_annual_impact": 119_040,
                "actions": [
                    {"step": 1, "label": "Launch — 30 days", "detail": "Email 847 customers about Care Plan at $199/mo. Target 5% conversion = 42 contracts = $100,296/yr.", "dollar_impact": 100_296},
                    {"step": 2, "label": "Scale — 90 days",  "detail": "Add commercial tier $399/mo. Target 15 accounts = $71,820/yr. Valuation: 3.2x -> 4.1x SDE.", "dollar_impact": 71_820},
                ],
            },
        ],
        report_data={"source": "underwrite-platform-seed", "engines": ["heradyne_all_5", "uw_all_7"]}
    )
    db.add(r1)

    # ── DEAL 2: ABC Manufacturing ────────────────────────────────────────────
    deal2 = Deal(
        borrower_id=borrower.id, name="ABC Manufacturing Acquisition",
        deal_type=DealType.ACQUISITION, status=DealStatus.ANALYZED,
        industry="manufacturing",
        business_description="Acquisition of precision manufacturing company specializing in automotive components. 12 years operating, strong asset base.",
        loan_amount_requested=2_500_000, loan_term_months=120,
        annual_revenue=5_000_000, gross_profit=2_000_000, ebitda=800_000, capex=100_000, debt_service=50_000,
        addbacks=[
            {"description": "Owner salary above market", "amount": 75_000},
            {"description": "One-time legal fees",       "amount": 25_000},
        ],
        purchase_price=3_000_000, equity_injection=500_000,
        business_assets=[
            {"type": "equipment",           "value": 800_000, "description": "CNC machines"},
            {"type": "inventory",           "value": 400_000, "description": "Raw materials"},
            {"type": "accounts_receivable", "value": 600_000, "description": "Customer receivables"},
        ],
        personal_assets=[
            {"type": "primary_residence", "value": 500_000, "description": "Owner's home"},
            {"type": "brokerage_accounts","value": 200_000, "description": "Investment portfolio"},
        ],
        owner_credit_score=740, owner_experience_years=12
    )
    db.add(deal2)
    db.flush()

    r2 = DealRiskReport(
        deal_id=deal2.id, version=1,
        normalized_ebitda=900_000, post_debt_fcf=562_000,
        dscr_base=2.42, dscr_stress=1.94,
        sba_anchor_pd=0.03, industry_multiplier=1.0, leverage_multiplier=1.0, volatility_multiplier=1.0, annual_pd=0.030,
        ev_low=2_700_000, ev_mid=4_050_000, ev_high=5_400_000, durability_score=81,
        business_nolv=1_040_000, personal_nolv=580_000, total_nolv=1_620_000, collateral_coverage=0.648,
        recommended_guarantee_pct=0.57, recommended_escrow_pct=0.04,
        recommended_alignment={"personal_guarantee": True, "monthly_reporting": True, "key_person_life_insurance": True, "annual_audit": False},
        health_score=86.0, health_score_cashflow=20.0, health_score_stability=20.0,
        health_score_growth=18.0, health_score_liquidity=16.0, health_score_distress=12.0,
        pdscr=1.97, owner_draw_annual=75_000, premium_capacity_monthly=8_400,
        normalized_sde=975_000, sde_multiple_implied=3.08,
        equity_value_low=2_600_000, equity_value_mid=3_950_000, equity_value_high=5_300_000, net_debt=50_000,
        valuation_method_weights={"sde": 0.40, "ebitda": 0.30, "dcf": 0.20, "revenue": 0.05, "asset": 0.05},
        sba_eligible=True,
        sba_eligibility_checklist=[{"criterion": c, "pass": True, "note": "Confirmed"} for c in [
            "For-profit US business", "Eligible industry", "Revenue <= SBA size standard ($15M)",
            "DSCR >= 1.25", "LTV <= 90%", "Equity injection >= 10%", "Loan <= $5M (SBA 7(a) max)",
            "Business operating >= 2 years", "Owner/operator experience",
            "No outstanding federal tax liens", "No prior SBA default (CAIVRS)",
            "Personal guarantee all 20%+ owners", "Key-person insurance (loan > $1M)",
            "Collateral pledged (all available)",
        ]],
        sba_max_loan=2_700_000, sba_ltv=0.833,
        deal_killer_verdict="buy", deal_confidence_score=91.0, max_supportable_price=3_420_000,
        breakpoint_scenarios=[
            {"label": "Base case (0%)",        "revenue_impact_pct": 0.0,   "dscr": 2.42, "max_supportable_price": 3_420_000, "verdict": "buy"},
            {"label": "Mild stress (-10%)",    "revenue_impact_pct": -10.0, "dscr": 2.18, "max_supportable_price": 3_078_000, "verdict": "buy"},
            {"label": "Moderate stress (-20%)", "revenue_impact_pct": -20.0, "dscr": 1.53, "max_supportable_price": 2_736_000, "verdict": "buy"},
            {"label": "Severe stress (-30%)",  "revenue_impact_pct": -30.0, "dscr": 1.21, "max_supportable_price": 2_394_000, "verdict": "renegotiate"},
            {"label": "Top customer loss (-18%)", "revenue_impact_pct": -18.0, "dscr": 1.62, "max_supportable_price": 2_804_000, "verdict": "buy"},
        ],
        cash_runway_months=18.0,
        cash_forecast_18m=[
            {"month": m, "revenue": int(416_666*(1.02**i)), "burn": 320_000,
             "net": int(416_666*(1.02**i))-320_000,
             "balance": 800_000+sum(int(416_666*(1.02**j))-320_000 for j in range(i+1))}
            for i, m in enumerate(["Nov","Dec","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr"])
        ],
        playbooks=[
            {
                "title": "Revenue concentration — top 3 customers = 38%",
                "severity": "warning",
                "trigger": "Loss of largest customer reduces revenue by $900K — DSCR drops to 1.21",
                "impact_summary": "Multi-year contracts with key accounts eliminates single largest deal risk",
                "estimated_annual_impact": 400_000,
                "actions": [
                    {"step": 1, "label": "30 days", "detail": "Negotiate 2-year service contracts with top 3 accounts. Offer 3% discount for multi-year commitment.", "dollar_impact": 0},
                    {"step": 2, "label": "90 days", "detail": "Add 3 new mid-size accounts to bring top-3 concentration from 38% to below 25%.", "dollar_impact": 400_000},
                ],
            },
            {
                "title": "QSBS eligibility — potential $714K federal tax savings at exit",
                "severity": "opportunity",
                "trigger": "Business qualifies for IRC S1202 QSBS if structured as C-Corp acquisition",
                "impact_summary": "Buyer may exclude up to 100% of federal capital gains after 5-year hold (OBBBA 2025 rules)",
                "estimated_annual_impact": 714_000,
                "actions": [
                    {"step": 1, "label": "Pre-close", "detail": "Confirm C-Corp structure. Gross assets $1.8M < $75M OBBBA threshold. All 14 S1202 criteria appear met.", "dollar_impact": 0},
                    {"step": 2, "label": "At close",  "detail": "Document original issuance. Hold 5+ years for 100% federal exclusion. Est. tax saved at $3M exit: $714,000.", "dollar_impact": 714_000},
                ],
            },
        ],
        report_data={"source": "underwrite-platform-seed"}
    )
    db.add(r2)
    db.commit()
    db.refresh(deal1); db.refresh(deal2)
    print(f"  Created 2 pre-analyzed deals with full UnderwriteOS risk reports")
    return [deal1, deal2]


def seed_lender_policies(db, lender1, lender2):
    print("Seeding lender policies...")
    p1 = LenderPolicy(
        lender_id=lender1.id, name="Conservative SMB Lending", is_active=True,
        min_loan_size=500_000, max_loan_size=5_000_000,
        min_dscr=1.25, max_pd=0.05, max_leverage=4.0, min_collateral_coverage=0.8,
        allowed_industries=["manufacturing","healthcare","professional_services","wholesale","plumbing"],
        excluded_industries=["restaurants","hospitality"],
        min_term_months=36, max_term_months=120,
        target_rate_min=0.08, target_rate_max=0.12,
        allowed_deal_types=["acquisition","growth"],
        min_health_score=60.0, min_pdscr=1.10, require_sba_eligible=True, min_deal_confidence_score=55.0,
        notes="Health score >= 60 and SBA eligibility required."
    )
    p2 = LenderPolicy(
        lender_id=lender2.id, name="Growth Capital Program", is_active=True,
        min_loan_size=250_000, max_loan_size=3_000_000,
        min_dscr=1.15, max_pd=0.08, max_leverage=5.0, min_collateral_coverage=0.5,
        allowed_industries=["technology","services","manufacturing","healthcare","plumbing"],
        excluded_industries=["construction"],
        min_term_months=24, max_term_months=84,
        target_rate_min=0.10, target_rate_max=0.15,
        allowed_deal_types=["growth"],
        min_health_score=50.0, notes="Higher risk tolerance for growth businesses"
    )
    db.add(p1); db.add(p2); db.commit()
    print("  Created 2 lender policies")
    return [p1, p2]


def seed_insurer_policies(db, insurer):
    print("Seeding insurer policies...")
    p = InsurerPolicy(
        insurer_id=insurer.id, name="SMB Credit Enhancement", is_active=True,
        max_expected_loss=0.03, min_attachment_point=0.10, max_attachment_point=0.30,
        target_premium_min=0.02, target_premium_max=0.05,
        min_coverage_amount=250_000, max_coverage_amount=2_000_000,
        allowed_industries=["manufacturing","technology","healthcare","professional_services","wholesale","plumbing"],
        excluded_industries=["restaurants","hospitality","construction"],
        allowed_deal_types=["acquisition","growth"],
        pg_support_pct_of_loan=0.30, lender_support_pct_of_loan=0.15, min_health_score=55.0,
        notes="PG support up to 30% of loan for quality SMB deals."
    )
    db.add(p); db.commit()
    print("  Created 1 insurer policy")
    return [p]


def seed_assumptions(db):
    print("Seeding system assumptions...")
    count = 0
    for a in DEFAULT_ASSUMPTIONS:
        if not db.query(SystemAssumption).filter(SystemAssumption.category==a["category"], SystemAssumption.key==a["key"]).first():
            db.add(SystemAssumption(category=a["category"], key=a["key"], value=a["value"], description=a.get("description")))
            count += 1
    db.commit()
    print(f"  Created {count} system assumptions")


def seed_funded_loan(db, users):
    """
    Seed a funded + insured SBA loan with 14 months of payment history,
    deteriorating cash flow, and 3 AI-flagged monitoring alerts.

    Business: Greenville HVAC Solutions LLC
      - Funded Feb 2023, 14 months in
      - Lender: First Capital Partners
      - Insurer: Credit Shield Insurance
      - Status: ADVISORY — revenue declining, DSCR slipping, one late payment
    """
    print("Seeding funded loan with monitoring data...")

    borrower  = users["borrower"]
    lender    = users["lender1"]
    insurer   = users["insurer"]
    origination = date(2023, 2, 15)
    today = date(2024, 4, 1)

    # ── 1. Deal (FUNDED status) ──────────────────────────────────────────────
    deal = Deal(
        borrower_id=borrower.id,
        name="Greenville HVAC Solutions LLC — Acquisition",
        deal_type=DealType.ACQUISITION,
        status=DealStatus.FUNDED,
        industry="hvac",
        business_description=(
            "Acquisition of Greenville HVAC Solutions LLC, an 18-year established "
            "HVAC service company in Greenville, SC. 11 employees, $2.1M TTM revenue "
            "at closing. Strong commercial maintenance contracts (42% of revenue). "
            "Post-close: lost largest commercial account (Johnson Controls, $310K/yr) "
            "in month 9. Revenue trending down. Owner implementing corrective actions."
        ),
        loan_amount_requested=1_920_000,
        loan_term_months=120,
        annual_revenue=2_108_000,
        gross_profit=1_054_000,
        ebitda=463_000,
        capex=38_000,
        debt_service=0,
        addbacks=[
            {"description": "Owner compensation above market", "amount": 145_000},
            {"description": "Depreciation and amortization",   "amount": 56_000},
            {"description": "One-time truck purchase",         "amount": 28_000},
        ],
        purchase_price=2_310_000,
        equity_injection=390_000,
        business_assets=[
            {"type": "equipment",           "value": 285_000, "description": "HVAC fleet + tools"},
            {"type": "accounts_receivable", "value": 176_000, "description": "AR (38-day avg)"},
            {"type": "cash",                "value": 112_000, "description": "Operating cash at close"},
        ],
        personal_assets=[
            {"type": "primary_residence", "value": 420_000, "description": "Owner home, Greenville SC"},
            {"type": "brokerage_accounts", "value": 95_000,  "description": "Investment portfolio"},
        ],
        owner_credit_score=734,
        owner_experience_years=8,
    )
    db.add(deal)
    db.flush()

    # ── 2. Risk Report (at origination — strong numbers) ────────────────────
    report = DealRiskReport(
        deal_id=deal.id, version=1,
        # Heradyne engines
        dscr_base=1.68, dscr_stress=1.31,
        annual_pd=0.028, lifetime_pd=0.19,
        ev_low=1_980_000, ev_mid=2_310_000, ev_high=2_640_000,
        equity_value_low=1_560_000, equity_value_mid=1_890_000, equity_value_high=2_220_000,
        net_debt=420_000,
        collateral_coverage=1.42,
        business_nolv=228_000, personal_nolv=310_000,
        recommended_guarantee_pct=0.75,
        # UnderwriteOS health score (at origination)
        health_score=82,
        health_score_cashflow=79,
        health_score_stability=88,
        health_score_growth=76,
        health_score_liquidity=84,
        health_score_distress=83,
        # DSCR / PDSCR
        pdscr=1.41,
        owner_draw_annual=145_000,
        premium_capacity_monthly=4_200,
        # Valuation
        normalized_sde=318_000,
        sde_multiple_implied=3.2,
        # SBA
        sba_eligible=True,
        sba_max_loan=5_000_000,
        # Deal verdict at origination
        deal_killer_verdict="buy",
        deal_confidence_score=87,
        max_supportable_price=2_410_000,
        # Cash flow
        cash_runway_months=18,
        # Playbooks (at origination — proactive)
        playbooks=[
            {
                "title": "Customer Concentration Risk — Johnson Controls 14.7% of Revenue",
                "severity": "warning",
                "trigger": "Single commercial account >10% of revenue",
                "impact_summary": "Loss of Johnson Controls would reduce DSCR from 1.68 to 1.23",
                "estimated_annual_impact": 310_000,
                "actions": [
                    {"step": 1, "label": "Immediate", "detail": "Lock Johnson Controls into 3-year maintenance contract renewal at current pricing. Offer 5% loyalty discount ($15,500/yr) to secure. Use ServiceTitan CRM to track contract status.", "dollar_impact": 310_000},
                    {"step": 2, "label": "90 days", "detail": "Develop 3 new commercial maintenance accounts to diversify. Target property management companies via BOMA Upstate SC chapter. Each new account worth $80-120K/yr.", "dollar_impact": 90_000},
                ]
            },
            {
                "title": "Technician Shortage — 2 Open Positions Reducing Capacity",
                "severity": "warning",
                "trigger": "Unfilled positions >15% of workforce",
                "impact_summary": "2 unfilled tech positions costing estimated $180K/yr in lost revenue",
                "estimated_annual_impact": 180_000,
                "actions": [
                    {"step": 1, "label": "This week", "detail": "Post on Indeed and Ziprecruiter with $2,500 sign-on bonus. Budget $5,000 total. Greenville tech market tight — consider Spartanburg candidates.", "dollar_impact": 180_000},
                    {"step": 2, "label": "30 days", "detail": "Partner with Greenville Technical College HVAC program for apprentice pipeline. $0 cost, 6-month lead time.", "dollar_impact": 45_000},
                ]
            },
        ],
        # Breakpoints
        deal_killer_breakpoints={
            "scenarios": [
                {"scenario": "Base case", "revenue_change": 0, "dscr": 1.68, "verdict": "buy"},
                {"scenario": "-10% revenue", "revenue_change": -0.10, "dscr": 1.42, "verdict": "buy"},
                {"scenario": "-20% revenue", "revenue_change": -0.20, "dscr": 1.16, "verdict": "renegotiate"},
                {"scenario": "-30% revenue", "revenue_change": -0.30, "dscr": 0.89, "verdict": "pass"},
                {"scenario": "+10% revenue", "revenue_change": 0.10, "dscr": 1.94, "verdict": "buy"},
            ]
        },
        # SBA checklist
        sba_checklist={
            "items": [
                {"criterion": "For-profit US business", "result": "pass"},
                {"criterion": "Meets SBA size standards (NAICS 238220)", "result": "pass"},
                {"criterion": "Owner equity injection ≥10%", "result": "pass", "detail": "16.9% injection"},
                {"criterion": "Business operates in US", "result": "pass"},
                {"criterion": "Owner credit score ≥650", "result": "pass", "detail": "734"},
                {"criterion": "No prior SBA default", "result": "pass"},
                {"criterion": "Business viable / positive cash flow", "result": "pass"},
                {"criterion": "Collateral identified", "result": "pass"},
                {"criterion": "Personal guarantee from owner", "result": "pass"},
                {"criterion": "No delinquent federal debt", "result": "pass"},
                {"criterion": "DSCR ≥1.15", "result": "pass", "detail": "1.68x"},
                {"criterion": "Business age ≥2 years", "result": "pass", "detail": "18 years"},
                {"criterion": "Purpose is eligible (CoO)", "result": "pass"},
                {"criterion": "Loan amount ≤$5M", "result": "pass", "detail": "$1.92M"},
            ]
        },
    )
    db.add(report)
    db.flush()

    # ── 3. Deal Match (accepted by lender + insurer) ─────────────────────────
    # We need a lender policy — get first one
    lender_policy = db.query(LenderPolicy).filter(LenderPolicy.lender_id == lender.id).first()
    insurer_policy = db.query(InsurerPolicy).filter(InsurerPolicy.insurer_id == insurer.id).first()

    match = DealMatch(
        deal_id=deal.id,
        lender_policy_id=lender_policy.id if lender_policy else None,
        insurer_policy_id=insurer_policy.id if insurer_policy else None,
        match_score=87.4,
        match_reasons=["DSCR 1.68x exceeds minimum 1.25x", "18yr business age", "SC preferred geography", "HVAC tier-1 industry"],
        constraints_met=["dscr", "credit_score", "business_age", "equity_injection", "geography"],
        constraints_failed=[],
        status="accepted",
        decision_notes="Strong acquisition. Johnson Controls concentration noted — monitor quarterly. Approved at full $1.92M.",
        decision_at=datetime(2023, 1, 28, 14, 30, tzinfo=timezone.utc),
    )
    db.add(match)
    db.flush()

    # ── 4. Executed Loan ─────────────────────────────────────────────────────
    monthly_payment = 22_847  # P&I on $1.92M @ 7.25% over 10 years
    loan = ExecutedLoan(
        deal_id=deal.id,
        match_id=match.id,
        borrower_id=borrower.id,
        lender_id=lender.id,
        insurer_id=insurer.id,
        loan_number="SBA-2023-GVL-00147",
        principal_amount=1_920_000,
        interest_rate=0.0725,
        term_months=120,
        monthly_payment=monthly_payment,
        origination_date=origination,
        maturity_date=date(2033, 2, 15),
        status=LoanStatus.ACTIVE,
        current_principal_balance=1_796_420,
        guarantee_percentage=0.75,
        premium_rate=0.028,
        premium_paid=44_800,
        state="SC", city="Greenville", zip_code="29601",
        industry="hvac",
        days_past_due=0,
        last_payment_date=date(2024, 3, 15),
        total_payments_made=13,
        total_principal_paid=123_580,
        total_interest_paid=173_230,
        notes=(
            "ADVISORY watch initiated Apr 2024. Johnson Controls contract lost month 9 ($310K ARR). "
            "Revenue -14.7% trailing 3mo vs origination. One payment 8 days late (Feb 2024, cured). "
            "Owner deploying corrective plan: 2 new commercial accounts in pipeline, hiring 2 techs."
        ),
    )
    db.add(loan)
    db.flush()

    # ── 5. Payment History (14 months) ──────────────────────────────────────
    balance = 1_920_000.0
    monthly_rate = 0.0725 / 12

    for month_num in range(1, 15):
        pay_date = date(2023, 2, 15) + timedelta(days=30 * month_num)
        interest = balance * monthly_rate
        principal = monthly_payment - interest
        balance -= principal
        is_late = (month_num == 13)  # Feb 2024 payment was 8 days late
        payment = LoanPayment(
            loan_id=loan.id,
            payment_date=pay_date,
            payment_number=month_num,
            scheduled_payment=monthly_payment,
            actual_payment=monthly_payment,
            principal_portion=round(principal, 2),
            interest_portion=round(interest, 2),
            principal_balance_after=round(balance, 2),
            is_late=is_late,
            days_late=8 if is_late else 0,
        )
        db.add(payment)

    # ── 6. Monthly Cash Flow (14 months — healthy then declining) ────────────
    # Months 1-8: on-plan. Month 9: Johnson Controls lost. Months 10-14: declining.
    cashflow_data = [
        # month, year, revenue, ebitda
        (1,  2023, 178_200, 39_400),
        (2,  2023, 182_400, 41_200),
        (3,  2023, 194_600, 46_800),   # spring surge
        (4,  2023, 201_300, 48_900),
        (5,  2023, 198_700, 47_200),
        (6,  2023, 188_400, 43_100),
        (7,  2023, 192_800, 44_600),
        (8,  2023, 185_300, 41_800),
        (9,  2023, 161_400, 28_300),   # Johnson Controls lost mid-month
        (10, 2023, 149_200, 18_600),   # first full month without JC
        (11, 2023, 143_800, 14_200),
        (12, 2023, 138_600, 11_800),   # slow winter
        (1,  2024, 132_400,  8_900),   # worst month — late payment
        (2,  2024, 141_700, 13_400),   # slight recovery, new account signed
    ]
    for (mo, yr, rev, ebitda) in cashflow_data:
        cf = MonthlyCashflow(
            deal_id=deal.id,
            month=mo, year=yr,
            revenue=rev,
            ebitda=ebitda,
            debt_service=monthly_payment,
            post_debt_fcf=round(ebitda - monthly_payment, 2),
        )
        db.add(cf)

    db.commit()
    print(f"  Created funded loan: SBA-2023-GVL-00147 (Greenville HVAC Solutions LLC)")
    print(f"  14 months payment history, 14 months cash flow, ADVISORY status")
    return loan


def main():
    print("\n" + "="*50)
    print("underwrite-platform Database Seeder")
    print("="*50 + "\n")
    db = SessionLocal()
    force = "--force" in sys.argv
    try:
        if db.query(User).count() > 0 and not force:
            print("Database already seeded — skipping.")
            print("To re-seed: run with --force flag")
            return
        if force:
            print("Force re-seed requested — clearing existing data...")
            from app.models.executed_loan import LoanPayment, InsuranceClaim, ExecutedLoan
            from app.models.deal import MonthlyCashflow, FeeLedger, DealMatch, DealRiskReport, Deal
            from app.models.audit import AuditLog
            from app.models.verification import VerificationStatus
            from app.models.collateral import CollateralItem
            from app.models.signature_document import SignatureDocument
            from sqlalchemy import text
            # Use CASCADE truncate to avoid FK ordering issues
            db.execute(text("TRUNCATE TABLE audit_logs, loan_payments, insurance_claims, executed_loans, monthly_cashflows, fee_ledger, deal_matches, deal_risk_reports, deals, lender_policies, insurer_policies, users RESTART IDENTITY CASCADE"))
            db.commit()
            print("  Cleared existing data")
        users = seed_users(db)
        seed_deals(db, users["borrower"])
        seed_lender_policies(db, users["lender1"], users["lender2"])
        seed_insurer_policies(db, users["insurer"])
        seed_assumptions(db)
        seed_funded_loan(db, users)
        print("\n" + "="*50)
        print("Seeding complete!")
        print("="*50)
        print("\nAll passwords: password123")
        print("-"*50)
        print("borrower@example.com        -> Borrower")
        print("lender1@example.com         -> Lender (full access)")
        print("loanofficer@example.com     -> Loan Officer")
        print("creditcommittee@example.com -> Credit Committee")
        print("lender2@example.com         -> Lender 2")
        print("insurer@example.com         -> Insurer")
        print("admin@example.com           -> Admin")
        print("-"*50)
        print("\nTo see UnderwriteOS results immediately:")
        print("  1. Log in as borrower@example.com")
        print("  2. Click either deal")
        print("  3. Scroll past Heradyne risk report")
        print("  4. See: Deal Verdict, Health Score, Valuation,")
        print("          Playbooks, Breakpoints, SBA 14-point check")
        print("\nDISCLAIMER: Informational only. Does not lend/guarantee/insure.\n")
    except Exception as e:
        print(f"Seed error: {e}")
        import traceback; traceback.print_exc()
        db.rollback(); raise
    finally:
        db.close()

if __name__ == "__main__":
    main()
