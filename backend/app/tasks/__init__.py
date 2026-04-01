"""
Heradyne Celery Tasks

Async tasks for:
- Underwriting analysis
- Policy matching
- Fee calculations
"""

from celery import Celery
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.deal import Deal, DealRiskReport, DealStatus
from app.services.underwriting import UnderwritingService
from app.services.matching import MatchingService
from app.services.audit import audit_service
from app.services.uw_engines import run_uw_engines  # UnderwriteOS

# Create Celery app
celery_app = Celery(
    "heradyne",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,  # 5 minutes max
)


def get_db() -> Session:
    """Get a database session for tasks."""
    return SessionLocal()


@celery_app.task(bind=True, name="analyze_deal")
def analyze_deal_task(self, deal_id: int):
    """
    Run underwriting analysis on a deal.
    
    This task:
    1. Updates deal status to 'analyzing'
    2. Runs all underwriting engines
    3. Creates a DealRiskReport
    4. Updates deal status to 'analyzed'
    """
    db = get_db()
    try:
        # Get the deal
        deal = db.query(Deal).filter(Deal.id == deal_id).first()
        if not deal:
            return {"error": f"Deal {deal_id} not found"}
        
        # Update status
        deal.status = DealStatus.ANALYZING
        db.commit()
        
        # Run underwriting
        underwriting_service = UnderwritingService(db)
        report_data = underwriting_service.analyze_deal(deal)
        
        # Get latest version
        latest_report = db.query(DealRiskReport).filter(
            DealRiskReport.deal_id == deal_id
        ).order_by(DealRiskReport.version.desc()).first()
        
        new_version = (latest_report.version + 1) if latest_report else 1
        
        # ── UnderwriteOS enrichment (additive, never blocks) ──
        uw_fields = run_uw_engines(deal, report_data)
        # ────────────────────────────────────────────────────────
        # Create risk report
        risk_report = DealRiskReport(
            deal_id=deal_id,
            version=new_version,
            normalized_ebitda=report_data["cashflow_analysis"]["normalized_ebitda"],
            post_debt_fcf=report_data["cashflow_analysis"]["post_debt_fcf"],
            dscr_base=report_data["cashflow_analysis"]["dscr_base"],
            dscr_stress=report_data["cashflow_analysis"]["dscr_stress"],
            sba_anchor_pd=report_data["pd_analysis"]["sba_anchor_pd"],
            industry_multiplier=report_data["pd_analysis"]["industry_multiplier"],
            leverage_multiplier=report_data["pd_analysis"]["leverage_multiplier"],
            volatility_multiplier=report_data["pd_analysis"]["volatility_multiplier"],
            annual_pd=report_data["pd_analysis"]["annual_pd"],
            ev_low=report_data["valuation"]["ev_low"],
            ev_mid=report_data["valuation"]["ev_mid"],
            ev_high=report_data["valuation"]["ev_high"],
            durability_score=report_data["valuation"]["durability_score"],
            business_nolv=report_data["collateral"]["business_nolv"],
            personal_nolv=report_data["collateral"]["personal_nolv"],
            total_nolv=report_data["collateral"]["total_nolv"],
            collateral_coverage=report_data["collateral"]["collateral_coverage"],
            recommended_guarantee_pct=report_data["structuring"]["recommended_guarantee_pct"],
            recommended_escrow_pct=report_data["structuring"]["recommended_escrow_pct"],
            recommended_alignment=report_data["structuring"]["recommended_alignment"],
            report_data=report_data,
            # UnderwriteOS fields
            health_score=uw_fields.get("health_score"),
            health_score_cashflow=uw_fields.get("health_score_cashflow"),
            health_score_stability=uw_fields.get("health_score_stability"),
            health_score_growth=uw_fields.get("health_score_growth"),
            health_score_liquidity=uw_fields.get("health_score_liquidity"),
            health_score_distress=uw_fields.get("health_score_distress"),
            pdscr=uw_fields.get("pdscr"),
            owner_draw_annual=uw_fields.get("owner_draw_annual"),
            premium_capacity_monthly=uw_fields.get("premium_capacity_monthly"),
            normalized_sde=uw_fields.get("normalized_sde"),
            sde_multiple_implied=uw_fields.get("sde_multiple_implied"),
            equity_value_low=uw_fields.get("equity_value_low"),
            equity_value_mid=uw_fields.get("equity_value_mid"),
            equity_value_high=uw_fields.get("equity_value_high"),
            net_debt=uw_fields.get("net_debt"),
            valuation_method_weights=uw_fields.get("valuation_method_weights"),
            sba_eligible=uw_fields.get("sba_eligible"),
            sba_eligibility_checklist=uw_fields.get("sba_eligibility_checklist"),
            sba_max_loan=uw_fields.get("sba_max_loan"),
            sba_ltv=uw_fields.get("sba_ltv"),
            deal_killer_verdict=uw_fields.get("deal_killer_verdict"),
            deal_confidence_score=uw_fields.get("deal_confidence_score"),
            max_supportable_price=uw_fields.get("max_supportable_price"),
            breakpoint_scenarios=uw_fields.get("breakpoint_scenarios"),
            cash_runway_months=uw_fields.get("cash_runway_months"),
            cash_forecast_18m=uw_fields.get("cash_forecast_18m"),
            playbooks=uw_fields.get("playbooks"),
        )
        db.add(risk_report)
        
        # Update deal status
        deal.status = DealStatus.ANALYZED
        db.commit()
        
        # Audit log
        audit_service.log(
            db=db,
            action="deal_analyzed",
            entity_type="deal",
            entity_id=deal_id,
            details={"version": new_version}
        )
        
        return {
            "deal_id": deal_id,
            "status": "analyzed",
            "report_version": new_version
        }
        
    except Exception as e:
        db.rollback()
        # Update status to indicate error
        deal = db.query(Deal).filter(Deal.id == deal_id).first()
        if deal:
            deal.status = DealStatus.SUBMITTED  # Revert to submitted
            db.commit()
        raise e
    finally:
        db.close()


@celery_app.task(bind=True, name="match_deal")
def match_deal_task(self, deal_id: int, generate_scenarios: bool = True):
    """
    Match a deal against all active policies.
    
    This task:
    1. Gets the latest risk report
    2. Matches against lender and insurer policies
    3. Generates approve-if scenarios if needed
    4. Updates deal status to 'matched'
    """
    db = get_db()
    try:
        # Get the deal
        deal = db.query(Deal).filter(Deal.id == deal_id).first()
        if not deal:
            return {"error": f"Deal {deal_id} not found"}
        
        # Get latest risk report
        risk_report = db.query(DealRiskReport).filter(
            DealRiskReport.deal_id == deal_id
        ).order_by(DealRiskReport.version.desc()).first()
        
        if not risk_report:
            return {"error": f"No risk report found for deal {deal_id}"}
        
        # Run matching
        matching_service = MatchingService(db)
        match_results = matching_service.match_deal(deal, risk_report, generate_scenarios)
        
        # Update deal status
        deal.status = DealStatus.MATCHED
        db.commit()
        
        # Audit log
        audit_service.log(
            db=db,
            action="deal_matched",
            entity_type="deal",
            entity_id=deal_id,
            details={
                "lender_matches": match_results["total_lender_matches"],
                "insurer_matches": match_results["total_insurer_matches"]
            }
        )
        
        return match_results
        
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()


@celery_app.task(bind=True, name="calculate_fees")
def calculate_fees_task(self, deal_id: int):
    """
    Calculate monthly fees based on cash flow data.
    
    Fee = min(post_debt_fcf * 0.02, actual_calculated_amount)
    Capped at 2% of post-debt FCF
    """
    from app.models.deal import MonthlyCashflow, FeeLedger
    
    db = get_db()
    try:
        # Get the deal
        deal = db.query(Deal).filter(Deal.id == deal_id).first()
        if not deal:
            return {"error": f"Deal {deal_id} not found"}
        
        # Get fee cap from assumptions
        from app.services.assumptions import assumption_service
        fee_cap = assumption_service.get_assumption(db, "fees", "borrower_fee_cap") or 0.02
        
        # Get monthly cashflows
        cashflows = db.query(MonthlyCashflow).filter(
            MonthlyCashflow.deal_id == deal_id
        ).order_by(MonthlyCashflow.year, MonthlyCashflow.month).all()
        
        # Clear existing fee entries for this deal
        db.query(FeeLedger).filter(FeeLedger.deal_id == deal_id).delete()
        
        total_fees = 0.0
        for cf in cashflows:
            # Calculate post-debt FCF if not set
            post_debt_fcf = cf.post_debt_fcf
            if post_debt_fcf is None:
                post_debt_fcf = cf.ebitda - (cf.debt_service or 0)
            
            # Calculate fee (only if positive cash flow)
            if post_debt_fcf > 0:
                calculated_fee = post_debt_fcf * fee_cap
            else:
                calculated_fee = 0
            
            # Create fee ledger entry
            fee_entry = FeeLedger(
                deal_id=deal_id,
                month=cf.month,
                year=cf.year,
                post_debt_fcf=post_debt_fcf,
                fee_rate=fee_cap,
                calculated_fee=calculated_fee
            )
            db.add(fee_entry)
            total_fees += calculated_fee
        
        db.commit()
        
        # Audit log
        audit_service.log(
            db=db,
            action="fees_calculated",
            entity_type="deal",
            entity_id=deal_id,
            details={
                "months_processed": len(cashflows),
                "total_fees": total_fees
            }
        )
        
        return {
            "deal_id": deal_id,
            "months_processed": len(cashflows),
            "total_fees": round(total_fees, 2)
        }
        
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()
