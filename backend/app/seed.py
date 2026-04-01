"""
underwrite-platform Database Seed Script
Creates pre-analyzed deals so UnderwriteOS results appear immediately on first login.
"""
import sys
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.core.database import SessionLocal, engine
from app.core.security import get_password_hash
from app.models import Base
from app.models.user import User, UserRole
from app.models.deal import Deal, DealType, DealStatus, DealRiskReport
from app.models.policy import LenderPolicy, InsurerPolicy
from app.models.assumption import SystemAssumption, DEFAULT_ASSUMPTIONS


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


def main():
    print("\n" + "="*50)
    print("underwrite-platform Database Seeder")
    print("="*50 + "\n")
    db = SessionLocal()
    try:
        if db.query(User).count() > 0:
            print("Database already seeded — skipping.")
            print("To re-seed: docker compose down -v && docker compose up --build")
            return
        users = seed_users(db)
        seed_deals(db, users["borrower"])
        seed_lender_policies(db, users["lender1"], users["lender2"])
        seed_insurer_policies(db, users["insurer"])
        seed_assumptions(db)
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
