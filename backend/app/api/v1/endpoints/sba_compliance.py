"""
SBA 7(a) Compliance API Endpoints
"""
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User, UserRole
from app.models.deal import Deal, DealRiskReport
from app.services.sba_compliance import SBAComplianceEngine, SBAComplianceResult, ComplianceStatus

router = APIRouter()


class ComplianceCheckResponse(BaseModel):
    id: str
    name: str
    category: str
    status: str
    requirement: str
    finding: str
    cfr_reference: str
    sop_reference: str
    is_hard_decline: bool
    documentation_required: List[str]
    lender_action_required: Optional[str]


class SBAComplianceResponse(BaseModel):
    deal_id: int
    deal_name: Optional[str]
    overall_status: str
    eligible_loan_types: List[str]
    max_loan_amount: float
    checks: List[ComplianceCheckResponse]
    passed_count: int
    failed_count: int
    review_count: int
    incomplete_count: int
    hard_declines: List[str]
    documentation_gaps: List[str]
    lender_compliance_items: List[str]
    recommendations: List[str]
    evaluated_at: str


@router.get("/check/{deal_id}", response_model=SBAComplianceResponse)
async def check_deal_compliance(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Check SBA 7(a) compliance for a specific deal.
    
    Returns detailed compliance status including:
    - Eligibility for various 7(a) programs
    - Individual compliance checks with CFR/SOP references
    - Documentation gaps
    - Lender compliance requirements
    - Recommendations
    """
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    # Get latest risk report for additional data
    risk_report = db.query(DealRiskReport).filter(
        DealRiskReport.deal_id == deal_id
    ).order_by(DealRiskReport.version.desc()).first()
    
    # Build deal data from database
    deal_data = {
        "deal_id": deal.id,
        "deal_type": str(deal.deal_type.value) if deal.deal_type else "",
        "loan_amount": deal.loan_amount_requested,
        "loan_amount_requested": deal.loan_amount_requested,
        "loan_purpose": str(deal.deal_type.value) if deal.deal_type else "",
        "naics_code": deal.industry,
        "industry": deal.industry,
        "annual_revenue": deal.annual_revenue,
        "ebitda": deal.ebitda,
        "purchase_price": deal.purchase_price or 0,
        "equity_injection": deal.equity_injection or 0,
        "owner_credit_score": deal.owner_credit_score or 0,
        "owner_experience_years": deal.owner_experience_years or 0,
        "operates_in_us": True,  # Assume US for now
        "owners_us_citizens": True,  # Assume for now
        "business_assets": deal.business_assets or [],
        "personal_assets": deal.personal_assets or [],
    }
    
    # Calculate total assets
    if deal.business_assets:
        deal_data["total_business_assets"] = sum(a.get("value", 0) for a in deal.business_assets)
    if deal.personal_assets:
        deal_data["total_personal_assets"] = sum(a.get("value", 0) for a in deal.personal_assets)
    
    # Add risk report data if available
    if risk_report:
        deal_data["dscr"] = risk_report.dscr_base or 0
        deal_data["dscr_base"] = risk_report.dscr_base or 0
        deal_data["total_collateral_value"] = (risk_report.total_nolv or 0)
    
    # Run compliance check
    engine = SBAComplianceEngine()
    result = engine.evaluate_deal(deal_data)
    
    # Convert to response
    checks_response = [
        ComplianceCheckResponse(
            id=c.id,
            name=c.name,
            category=c.category.value,
            status=c.status.value,
            requirement=c.requirement,
            finding=c.finding,
            cfr_reference=c.cfr_reference,
            sop_reference=c.sop_reference,
            is_hard_decline=c.is_hard_decline,
            documentation_required=c.documentation_required,
            lender_action_required=c.lender_action_required,
        )
        for c in result.checks
    ]
    
    return SBAComplianceResponse(
        deal_id=result.deal_id,
        deal_name=deal.name,
        overall_status=result.overall_status.value,
        eligible_loan_types=result.eligible_loan_types,
        max_loan_amount=result.max_loan_amount,
        checks=checks_response,
        passed_count=result.passed_count,
        failed_count=result.failed_count,
        review_count=result.review_count,
        incomplete_count=result.incomplete_count,
        hard_declines=result.hard_declines,
        documentation_gaps=result.documentation_gaps,
        lender_compliance_items=result.lender_compliance_items,
        recommendations=result.recommendations,
        evaluated_at=result.evaluated_at,
    )


@router.get("/lender-checklist/{deal_id}")
async def get_lender_checklist(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get SBA lender compliance checklist for a deal.
    
    Only accessible by lender roles. Returns required lender actions
    and documentation for SBA compliance.
    """
    # Only lenders can access this
    if current_user.role not in [UserRole.LENDER, UserRole.LOAN_OFFICER, UserRole.CREDIT_COMMITTEE, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Lender access required")
    
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    # Get compliance result
    deal_data = {
        "deal_id": deal.id,
        "deal_type": str(deal.deal_type.value) if deal.deal_type else "",
        "loan_amount": deal.loan_amount_requested,
        "loan_purpose": str(deal.deal_type.value) if deal.deal_type else "",
        "naics_code": deal.industry,
        "annual_revenue": deal.annual_revenue,
        "ebitda": deal.ebitda,
        "purchase_price": deal.purchase_price or 0,
        "equity_injection": deal.equity_injection or 0,
        "owner_credit_score": deal.owner_credit_score or 0,
    }
    
    engine = SBAComplianceEngine()
    result = engine.evaluate_deal(deal_data)
    
    # Organize checklist by category
    checklist = {
        "pre_closing": [
            {"item": "Complete SBA Form 1920 (Lender's Application for Guaranty)", "required": True, "completed": False},
            {"item": "Verify IRS tax transcripts match submitted returns (4506-T)", "required": True, "completed": False},
            {"item": "Check CAIVRS for all principals", "required": True, "completed": False},
            {"item": "Check SAM.gov for debarment/suspension", "required": True, "completed": False},
            {"item": "Verify business is registered and in good standing", "required": True, "completed": False},
            {"item": "Complete SBA Form 912 for all 20%+ owners", "required": True, "completed": False},
            {"item": "Document credit elsewhere test", "required": True, "completed": False},
        ],
        "collateral": [
            {"item": "Perfect UCC-1 filing on business assets", "required": True, "completed": False},
            {"item": "Obtain personal guarantees from all 20%+ owners", "required": True, "completed": False},
            {"item": "Document collateral shortfall justification (if applicable)", "required": False, "completed": False},
        ],
        "closing": [
            {"item": "Calculate and collect SBA guarantee fee", "required": True, "completed": False},
            {"item": "Verify equity injection deposited", "required": True, "completed": False},
            {"item": "Complete SBA Note (Form 147)", "required": True, "completed": False},
            {"item": "Issue Settlement Statement with SBA use of proceeds", "required": True, "completed": False},
        ],
        "post_closing": [
            {"item": "Submit loan data to SBA E-Tran within 10 days", "required": True, "completed": False},
            {"item": "Maintain servicing file per SOP 50 57", "required": True, "completed": False},
            {"item": "Complete annual servicing review", "required": True, "completed": False},
        ],
        "deal_specific": []
    }
    
    # Add deal-specific items from compliance result
    for item in result.lender_compliance_items:
        if item not in [c["item"] for cat in checklist.values() for c in cat]:
            checklist["deal_specific"].append({
                "item": item,
                "required": True,
                "completed": False
            })
    
    # Add documentation gaps
    for doc in result.documentation_gaps:
        checklist["deal_specific"].append({
            "item": f"Obtain: {doc}",
            "required": True,
            "completed": False
        })
    
    return {
        "deal_id": deal_id,
        "deal_name": deal.name,
        "overall_status": result.overall_status.value,
        "checklist": checklist,
        "total_items": sum(len(items) for items in checklist.values()),
        "required_items": sum(1 for items in checklist.values() for i in items if i["required"]),
    }


@router.get("/requirements")
async def get_sba_requirements(
    current_user: User = Depends(get_current_active_user)
):
    """
    Get SBA 7(a) program requirements reference.
    
    Returns eligibility criteria and program limits.
    """
    return {
        "program_limits": {
            "7a_standard": {
                "max_amount": 5000000,
                "max_term_working_capital": 120,  # 10 years
                "max_term_equipment": 300,  # 25 years (useful life)
                "max_term_real_estate": 300,  # 25 years
                "sba_guarantee_pct": 0.75,  # 75% for loans > $150K
                "sba_guarantee_pct_small": 0.85,  # 85% for loans <= $150K
            },
            "7a_small": {
                "max_amount": 500000,
                "turnaround": "Expedited",
            },
            "sba_express": {
                "max_amount": 500000,
                "sba_guarantee_pct": 0.50,  # 50%
                "turnaround": "36 hours",
            },
            "community_advantage": {
                "max_amount": 350000,
                "focus": "Underserved markets",
            },
        },
        "eligibility_criteria": {
            "business_type": {
                "requirement": "For-profit business operating in the United States",
                "cfr_reference": "13 CFR 120.100",
            },
            "size": {
                "requirement": "Must meet SBA size standards for industry",
                "cfr_reference": "13 CFR 121",
            },
            "use_of_proceeds": {
                "requirement": "Sound business purpose",
                "eligible": ["Working capital", "Equipment", "Real estate", "Acquisition", "Refinancing", "Inventory"],
                "ineligible": ["Speculation", "Investment", "Gambling", "Political activities"],
                "cfr_reference": "13 CFR 120.120",
            },
            "credit_elsewhere": {
                "requirement": "Cannot obtain credit on reasonable terms elsewhere",
                "cfr_reference": "13 CFR 120.101",
            },
            "equity_injection": {
                "requirement": "Minimum 10% for change of ownership",
                "cfr_reference": "13 CFR 120.150",
            },
            "repayment_ability": {
                "requirement": "Demonstrate ability to repay from cash flow",
                "recommended_dscr": 1.15,
                "cfr_reference": "13 CFR 120.150",
            },
        },
        "ineligible_businesses": [
            "Gambling/casino operations",
            "Lending/investment businesses",
            "Life insurance companies",
            "Pyramid/multi-level marketing",
            "Speculative real estate",
            "Religious organizations (for religious activities)",
            "Political/lobbying organizations",
            "Adult entertainment",
            "Government-owned entities",
        ],
        "required_forms": [
            {"form": "SBA Form 1919", "purpose": "Borrower Information Form"},
            {"form": "SBA Form 1920", "purpose": "Lender's Application for Guaranty"},
            {"form": "SBA Form 912", "purpose": "Statement of Personal History"},
            {"form": "SBA Form 413", "purpose": "Personal Financial Statement"},
            {"form": "IRS Form 4506-T", "purpose": "Request for Transcript of Tax Return"},
            {"form": "SBA Form 147", "purpose": "SBA Note"},
        ],
    }
