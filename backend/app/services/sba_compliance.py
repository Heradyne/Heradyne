"""
SBA 7(a) Loan Program Compliance Service

Evaluates deals against SBA 7(a) eligibility requirements per:
- 13 CFR 120 (SBA Business Loan Programs)
- SBA SOP 50 10 6 (Lender and Development Company Loan Programs)
- SBA SOP 50 57 (7(a) Loan Servicing and Liquidation)

This module checks both BORROWER eligibility and LENDER compliance requirements.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any, Tuple
from enum import Enum
from datetime import datetime


class ComplianceStatus(str, Enum):
    ELIGIBLE = "eligible"
    INELIGIBLE = "ineligible"
    REQUIRES_REVIEW = "requires_review"
    INCOMPLETE = "incomplete"


class ComplianceCategory(str, Enum):
    BUSINESS_TYPE = "business_type"
    SIZE_STANDARDS = "size_standards"
    USE_OF_PROCEEDS = "use_of_proceeds"
    CREDIT_ELSEWHERE = "credit_elsewhere"
    OWNERSHIP = "ownership"
    CHARACTER = "character"
    COLLATERAL = "collateral"
    EQUITY_INJECTION = "equity_injection"
    REPAYMENT_ABILITY = "repayment_ability"
    MANAGEMENT = "management"
    FRANCHISE = "franchise"
    AFFILIATE = "affiliate"


@dataclass
class ComplianceCheck:
    """Individual compliance check result"""
    id: str
    name: str
    category: ComplianceCategory
    status: ComplianceStatus
    requirement: str
    finding: str
    cfr_reference: str
    sop_reference: str
    is_hard_decline: bool = False
    documentation_required: List[str] = field(default_factory=list)
    lender_action_required: Optional[str] = None


@dataclass
class SBAComplianceResult:
    """Complete SBA 7(a) compliance evaluation result"""
    deal_id: int
    overall_status: ComplianceStatus
    eligible_loan_types: List[str]  # 7(a) Standard, 7(a) Small, Express, etc.
    max_loan_amount: float
    checks: List[ComplianceCheck]
    passed_count: int
    failed_count: int
    review_count: int
    incomplete_count: int
    hard_declines: List[str]
    documentation_gaps: List[str]
    lender_compliance_items: List[str]
    recommendations: List[str]
    evaluated_at: str


# Ineligible business types per 13 CFR 120.110
INELIGIBLE_NAICS_CODES = {
    # Gambling/Gaming
    "713210": "Casinos (except Casino Hotels)",
    "713290": "Other Gambling Industries",
    "713120": "Amusement Arcades (if primarily gambling)",
    # Adult Entertainment
    "711110": "Theater Companies and Dinner Theaters (if adult content)",
    "512131": "Motion Picture Theaters (if adult content)",
    # Lending/Investment
    "522298": "All Other Nondepository Credit Intermediation",
    "523110": "Investment Banking and Securities Dealing",
    "523120": "Securities Brokerage",
    "523130": "Commodity Contracts Dealing",
    "523920": "Portfolio Management",
    "525910": "Open-End Investment Funds",
    "525990": "Other Financial Vehicles",
    # Insurance (life insurance companies)
    "524113": "Direct Life Insurance Carriers",
    # Government/Political
    "813940": "Political Organizations",
    # Religious (for religious activities)
    "813110": "Religious Organizations (for religious activities only)",
    # Pyramid/Multi-level
    "454390": "Other Direct Selling Establishments (if MLM structure)",
}

# SBA Size Standards by NAICS (simplified - actual standards vary by specific code)
SIZE_STANDARDS_BY_NAICS_PREFIX = {
    "11": {"type": "revenue", "max": 1000000},  # Agriculture - $1M
    "21": {"type": "employees", "max": 500},     # Mining - 500 employees
    "22": {"type": "employees", "max": 500},     # Utilities
    "23": {"type": "revenue", "max": 39500000},  # Construction - $39.5M
    "31": {"type": "employees", "max": 500},     # Manufacturing
    "32": {"type": "employees", "max": 500},     # Manufacturing
    "33": {"type": "employees", "max": 500},     # Manufacturing
    "42": {"type": "employees", "max": 250},     # Wholesale Trade - 250 employees
    "44": {"type": "revenue", "max": 8000000},   # Retail Trade - $8M
    "45": {"type": "revenue", "max": 8000000},   # Retail Trade
    "48": {"type": "revenue", "max": 30000000},  # Transportation - $30M
    "49": {"type": "revenue", "max": 30000000},  # Transportation
    "51": {"type": "revenue", "max": 38500000},  # Information - $38.5M
    "52": {"type": "revenue", "max": 38500000},  # Finance - $38.5M
    "53": {"type": "revenue", "max": 8000000},   # Real Estate - $8M
    "54": {"type": "revenue", "max": 16500000},  # Professional Services - $16.5M
    "55": {"type": "employees", "max": 500},     # Management
    "56": {"type": "revenue", "max": 22000000},  # Admin Services - $22M
    "61": {"type": "revenue", "max": 22000000},  # Education - $22M
    "62": {"type": "revenue", "max": 8000000},   # Healthcare - $8M
    "71": {"type": "revenue", "max": 8000000},   # Arts/Entertainment - $8M
    "72": {"type": "revenue", "max": 8000000},   # Accommodation/Food - $8M
    "81": {"type": "revenue", "max": 8000000},   # Other Services - $8M
}


class SBAComplianceEngine:
    """
    SBA 7(a) Loan Compliance Evaluation Engine
    
    Checks both borrower eligibility and lender compliance requirements.
    """
    
    def __init__(self):
        self.max_7a_amount = 5000000  # $5M max for standard 7(a)
        self.max_express_amount = 500000  # $500K max for SBA Express
        self.max_small_amount = 500000  # $500K max for 7(a) Small
        self.min_equity_injection_standard = 0.10  # 10% for standard
        self.min_equity_injection_coc = 0.10  # 10% for change of ownership
        self.min_dscr = 1.15  # Minimum DSCR for repayment ability
    
    def evaluate_deal(self, deal_data: Dict[str, Any]) -> SBAComplianceResult:
        """
        Evaluate a deal against all SBA 7(a) eligibility requirements.
        
        Args:
            deal_data: Dictionary containing deal information
            
        Returns:
            SBAComplianceResult with all compliance checks
        """
        checks = []
        hard_declines = []
        documentation_gaps = []
        lender_compliance_items = []
        
        # Run all compliance checks
        checks.append(self._check_business_type(deal_data))
        checks.append(self._check_size_standards(deal_data))
        checks.append(self._check_use_of_proceeds(deal_data))
        checks.append(self._check_credit_elsewhere(deal_data))
        checks.append(self._check_ownership_eligibility(deal_data))
        checks.append(self._check_character(deal_data))
        checks.append(self._check_collateral(deal_data))
        checks.append(self._check_equity_injection(deal_data))
        checks.append(self._check_repayment_ability(deal_data))
        checks.append(self._check_management_experience(deal_data))
        checks.append(self._check_franchise_eligibility(deal_data))
        checks.append(self._check_affiliate_rules(deal_data))
        
        # Additional lender-specific checks
        lender_checks = self._get_lender_compliance_items(deal_data, checks)
        lender_compliance_items.extend(lender_checks)
        
        # Collect hard declines and documentation gaps
        for check in checks:
            if check.is_hard_decline and check.status == ComplianceStatus.INELIGIBLE:
                hard_declines.append(f"{check.name}: {check.finding}")
            if check.documentation_required:
                for doc in check.documentation_required:
                    if doc not in documentation_gaps:
                        documentation_gaps.append(doc)
        
        # Calculate counts
        passed = sum(1 for c in checks if c.status == ComplianceStatus.ELIGIBLE)
        failed = sum(1 for c in checks if c.status == ComplianceStatus.INELIGIBLE)
        review = sum(1 for c in checks if c.status == ComplianceStatus.REQUIRES_REVIEW)
        incomplete = sum(1 for c in checks if c.status == ComplianceStatus.INCOMPLETE)
        
        # Determine overall status
        if hard_declines:
            overall_status = ComplianceStatus.INELIGIBLE
        elif failed > 0:
            overall_status = ComplianceStatus.INELIGIBLE
        elif review > 0 or incomplete > 0:
            overall_status = ComplianceStatus.REQUIRES_REVIEW
        else:
            overall_status = ComplianceStatus.ELIGIBLE
        
        # Determine eligible loan types and max amount
        eligible_types, max_amount = self._determine_eligible_programs(deal_data, checks)
        
        # Generate recommendations
        recommendations = self._generate_recommendations(checks, deal_data)
        
        return SBAComplianceResult(
            deal_id=deal_data.get("deal_id", 0),
            overall_status=overall_status,
            eligible_loan_types=eligible_types,
            max_loan_amount=max_amount,
            checks=checks,
            passed_count=passed,
            failed_count=failed,
            review_count=review,
            incomplete_count=incomplete,
            hard_declines=hard_declines,
            documentation_gaps=documentation_gaps,
            lender_compliance_items=lender_compliance_items,
            recommendations=recommendations,
            evaluated_at=datetime.utcnow().isoformat(),
        )
    
    def _check_business_type(self, deal_data: Dict) -> ComplianceCheck:
        """Check if business type is eligible per 13 CFR 120.110"""
        naics = deal_data.get("naics_code") or deal_data.get("industry", "")
        business_type = deal_data.get("business_type", "")
        
        # Check for ineligible NAICS codes
        if naics in INELIGIBLE_NAICS_CODES:
            return ComplianceCheck(
                id="business_type",
                name="Business Type Eligibility",
                category=ComplianceCategory.BUSINESS_TYPE,
                status=ComplianceStatus.INELIGIBLE,
                requirement="Business must not be engaged in ineligible activities per 13 CFR 120.110",
                finding=f"NAICS {naics} is ineligible: {INELIGIBLE_NAICS_CODES[naics]}",
                cfr_reference="13 CFR 120.110",
                sop_reference="SOP 50 10 6, Chapter 2",
                is_hard_decline=True,
            )
        
        # Check for nonprofit status (generally ineligible)
        if "nonprofit" in business_type.lower() or "non-profit" in business_type.lower():
            return ComplianceCheck(
                id="business_type",
                name="Business Type Eligibility",
                category=ComplianceCategory.BUSINESS_TYPE,
                status=ComplianceStatus.INELIGIBLE,
                requirement="Business must be organized for-profit",
                finding="Nonprofit organizations are not eligible for SBA 7(a) loans",
                cfr_reference="13 CFR 120.100",
                sop_reference="SOP 50 10 6, Chapter 2",
                is_hard_decline=True,
            )
        
        # Check for US operation
        us_operation = deal_data.get("operates_in_us", True)
        if not us_operation:
            return ComplianceCheck(
                id="business_type",
                name="Business Type Eligibility",
                category=ComplianceCategory.BUSINESS_TYPE,
                status=ComplianceStatus.INELIGIBLE,
                requirement="Business must operate primarily in the United States",
                finding="Business does not operate primarily in the United States",
                cfr_reference="13 CFR 120.100",
                sop_reference="SOP 50 10 6, Chapter 2",
                is_hard_decline=True,
            )
        
        if not naics:
            return ComplianceCheck(
                id="business_type",
                name="Business Type Eligibility",
                category=ComplianceCategory.BUSINESS_TYPE,
                status=ComplianceStatus.INCOMPLETE,
                requirement="NAICS code required to verify eligibility",
                finding="NAICS code not provided",
                cfr_reference="13 CFR 120.110",
                sop_reference="SOP 50 10 6, Chapter 2",
                documentation_required=["Business NAICS code", "Description of business activities"],
            )
        
        return ComplianceCheck(
            id="business_type",
            name="Business Type Eligibility",
            category=ComplianceCategory.BUSINESS_TYPE,
            status=ComplianceStatus.ELIGIBLE,
            requirement="Business must not be engaged in ineligible activities",
            finding=f"NAICS {naics} is eligible for SBA financing",
            cfr_reference="13 CFR 120.110",
            sop_reference="SOP 50 10 6, Chapter 2",
        )
    
    def _check_size_standards(self, deal_data: Dict) -> ComplianceCheck:
        """Check if business meets SBA size standards"""
        naics = deal_data.get("naics_code") or deal_data.get("industry", "")
        revenue = deal_data.get("annual_revenue", 0)
        employees = deal_data.get("employee_count", 0)
        
        if not naics:
            return ComplianceCheck(
                id="size_standards",
                name="Size Standards",
                category=ComplianceCategory.SIZE_STANDARDS,
                status=ComplianceStatus.INCOMPLETE,
                requirement="Business must meet SBA size standards for its industry",
                finding="Cannot determine size standard without NAICS code",
                cfr_reference="13 CFR 121",
                sop_reference="SOP 50 10 6, Chapter 2",
                documentation_required=["NAICS code", "Annual revenue for 3 years", "Employee count"],
            )
        
        # Get size standard for NAICS prefix
        naics_prefix = naics[:2]
        standard = SIZE_STANDARDS_BY_NAICS_PREFIX.get(naics_prefix, {"type": "revenue", "max": 8000000})
        
        if standard["type"] == "revenue":
            if revenue > standard["max"]:
                return ComplianceCheck(
                    id="size_standards",
                    name="Size Standards",
                    category=ComplianceCategory.SIZE_STANDARDS,
                    status=ComplianceStatus.INELIGIBLE,
                    requirement=f"Annual revenue must not exceed ${standard['max']:,.0f} for this industry",
                    finding=f"Annual revenue (${revenue:,.0f}) exceeds size standard",
                    cfr_reference="13 CFR 121.201",
                    sop_reference="SOP 50 10 6, Chapter 2",
                    is_hard_decline=True,
                )
        else:
            if employees > standard["max"]:
                return ComplianceCheck(
                    id="size_standards",
                    name="Size Standards",
                    category=ComplianceCategory.SIZE_STANDARDS,
                    status=ComplianceStatus.INELIGIBLE,
                    requirement=f"Employee count must not exceed {standard['max']} for this industry",
                    finding=f"Employee count ({employees}) exceeds size standard",
                    cfr_reference="13 CFR 121.201",
                    sop_reference="SOP 50 10 6, Chapter 2",
                    is_hard_decline=True,
                )
        
        return ComplianceCheck(
            id="size_standards",
            name="Size Standards",
            category=ComplianceCategory.SIZE_STANDARDS,
            status=ComplianceStatus.ELIGIBLE,
            requirement="Business must meet SBA size standards",
            finding=f"Business meets size standards for NAICS {naics}",
            cfr_reference="13 CFR 121",
            sop_reference="SOP 50 10 6, Chapter 2",
        )
    
    def _check_use_of_proceeds(self, deal_data: Dict) -> ComplianceCheck:
        """Check if use of proceeds is eligible"""
        loan_purpose = deal_data.get("loan_purpose", "") or deal_data.get("deal_type", "")
        
        eligible_purposes = [
            "acquisition", "change of ownership", "business acquisition",
            "working capital", "inventory", "equipment",
            "real estate", "construction", "renovation",
            "refinancing", "debt refinance",
            "expansion", "start-up", "startup",
        ]
        
        ineligible_purposes = [
            "speculation", "investment",
            "gambling", "casino",
            "political", "lobbying",
            "personal use", "consumer",
        ]
        
        purpose_lower = loan_purpose.lower()
        
        for ineligible in ineligible_purposes:
            if ineligible in purpose_lower:
                return ComplianceCheck(
                    id="use_of_proceeds",
                    name="Use of Proceeds",
                    category=ComplianceCategory.USE_OF_PROCEEDS,
                    status=ComplianceStatus.INELIGIBLE,
                    requirement="Loan proceeds must be used for eligible business purposes",
                    finding=f"'{loan_purpose}' is not an eligible use of proceeds",
                    cfr_reference="13 CFR 120.120",
                    sop_reference="SOP 50 10 6, Chapter 2",
                    is_hard_decline=True,
                )
        
        is_eligible = any(p in purpose_lower for p in eligible_purposes)
        
        if not is_eligible and loan_purpose:
            return ComplianceCheck(
                id="use_of_proceeds",
                name="Use of Proceeds",
                category=ComplianceCategory.USE_OF_PROCEEDS,
                status=ComplianceStatus.REQUIRES_REVIEW,
                requirement="Loan proceeds must be used for eligible business purposes",
                finding=f"'{loan_purpose}' requires review for eligibility",
                cfr_reference="13 CFR 120.120",
                sop_reference="SOP 50 10 6, Chapter 2",
                documentation_required=["Detailed use of proceeds statement"],
                lender_action_required="Review and document eligible use of proceeds",
            )
        
        if not loan_purpose:
            return ComplianceCheck(
                id="use_of_proceeds",
                name="Use of Proceeds",
                category=ComplianceCategory.USE_OF_PROCEEDS,
                status=ComplianceStatus.INCOMPLETE,
                requirement="Loan purpose must be documented",
                finding="Loan purpose not specified",
                cfr_reference="13 CFR 120.120",
                sop_reference="SOP 50 10 6, Chapter 2",
                documentation_required=["Statement of loan purpose", "Use of proceeds breakdown"],
            )
        
        return ComplianceCheck(
            id="use_of_proceeds",
            name="Use of Proceeds",
            category=ComplianceCategory.USE_OF_PROCEEDS,
            status=ComplianceStatus.ELIGIBLE,
            requirement="Loan proceeds must be used for eligible business purposes",
            finding=f"'{loan_purpose}' is an eligible use of proceeds",
            cfr_reference="13 CFR 120.120",
            sop_reference="SOP 50 10 6, Chapter 2",
        )
    
    def _check_credit_elsewhere(self, deal_data: Dict) -> ComplianceCheck:
        """Check credit elsewhere test - borrower cannot get credit on reasonable terms"""
        credit_elsewhere = deal_data.get("credit_elsewhere_test", None)
        personal_resources = deal_data.get("personal_liquid_assets", 0)
        loan_amount = deal_data.get("loan_amount", 0) or deal_data.get("loan_amount_requested", 0)
        
        # If personal resources are very high relative to loan, may fail credit elsewhere
        if loan_amount > 0 and personal_resources > loan_amount * 2:
            return ComplianceCheck(
                id="credit_elsewhere",
                name="Credit Elsewhere Test",
                category=ComplianceCategory.CREDIT_ELSEWHERE,
                status=ComplianceStatus.REQUIRES_REVIEW,
                requirement="Borrower must not be able to obtain credit elsewhere on reasonable terms",
                finding=f"High personal resources (${personal_resources:,.0f}) vs loan (${loan_amount:,.0f}) - review needed",
                cfr_reference="13 CFR 120.101",
                sop_reference="SOP 50 10 6, Chapter 2",
                documentation_required=["Credit elsewhere worksheet", "Personal financial statement"],
                lender_action_required="Document why borrower cannot obtain credit elsewhere on reasonable terms",
            )
        
        if credit_elsewhere is None:
            return ComplianceCheck(
                id="credit_elsewhere",
                name="Credit Elsewhere Test",
                category=ComplianceCategory.CREDIT_ELSEWHERE,
                status=ComplianceStatus.INCOMPLETE,
                requirement="Credit elsewhere test must be documented",
                finding="Credit elsewhere test not documented",
                cfr_reference="13 CFR 120.101",
                sop_reference="SOP 50 10 6, Chapter 2",
                documentation_required=["SBA Form 1919 or equivalent analysis"],
                lender_action_required="Complete credit elsewhere analysis and document in file",
            )
        
        return ComplianceCheck(
            id="credit_elsewhere",
            name="Credit Elsewhere Test",
            category=ComplianceCategory.CREDIT_ELSEWHERE,
            status=ComplianceStatus.ELIGIBLE,
            requirement="Borrower must not be able to obtain credit elsewhere on reasonable terms",
            finding="Credit elsewhere test documented and satisfied",
            cfr_reference="13 CFR 120.101",
            sop_reference="SOP 50 10 6, Chapter 2",
        )
    
    def _check_ownership_eligibility(self, deal_data: Dict) -> ComplianceCheck:
        """Check ownership structure eligibility"""
        owners = deal_data.get("owners", [])
        us_citizens = deal_data.get("owners_us_citizens", True)
        legal_status = deal_data.get("legal_residents", True)
        
        # Must have at least 51% US citizen/legal resident ownership
        if not us_citizens and not legal_status:
            return ComplianceCheck(
                id="ownership",
                name="Ownership Eligibility",
                category=ComplianceCategory.OWNERSHIP,
                status=ComplianceStatus.REQUIRES_REVIEW,
                requirement="51% of business must be owned by US citizens or legal permanent residents",
                finding="Ownership citizenship/residency status requires review",
                cfr_reference="13 CFR 120.102",
                sop_reference="SOP 50 10 6, Chapter 2",
                documentation_required=["Ownership schedule", "Citizenship/residency documentation for all 20%+ owners"],
                lender_action_required="Verify 51%+ ownership by eligible individuals",
            )
        
        if not owners:
            return ComplianceCheck(
                id="ownership",
                name="Ownership Eligibility",
                category=ComplianceCategory.OWNERSHIP,
                status=ComplianceStatus.INCOMPLETE,
                requirement="Ownership structure must be documented",
                finding="Ownership information not provided",
                cfr_reference="13 CFR 120.102",
                sop_reference="SOP 50 10 6, Chapter 2",
                documentation_required=["Ownership schedule", "Articles of organization", "Operating agreement"],
            )
        
        return ComplianceCheck(
            id="ownership",
            name="Ownership Eligibility",
            category=ComplianceCategory.OWNERSHIP,
            status=ComplianceStatus.ELIGIBLE,
            requirement="51% of business must be owned by eligible individuals",
            finding="Ownership structure is eligible",
            cfr_reference="13 CFR 120.102",
            sop_reference="SOP 50 10 6, Chapter 2",
        )
    
    def _check_character(self, deal_data: Dict) -> ComplianceCheck:
        """Check character requirements (criminal history, debarment, etc.)"""
        credit_score = deal_data.get("owner_credit_score") or deal_data.get("credit_score", 0)
        bankruptcies = deal_data.get("bankruptcies_past_7_years", 0)
        current_delinquencies = deal_data.get("current_delinquencies", 0)
        criminal_history = deal_data.get("criminal_history_disclosed", None)
        
        issues = []
        status = ComplianceStatus.ELIGIBLE
        docs_required = []
        
        # Credit score issues
        if credit_score > 0 and credit_score < 620:
            issues.append(f"Low credit score ({credit_score})")
            status = ComplianceStatus.REQUIRES_REVIEW
            docs_required.append("Credit explanation letter")
        
        # Recent bankruptcy
        if bankruptcies > 0:
            issues.append(f"Bankruptcy in past 7 years ({bankruptcies})")
            status = ComplianceStatus.REQUIRES_REVIEW
            docs_required.append("Bankruptcy discharge documentation")
            docs_required.append("Explanation of circumstances")
        
        # Current delinquencies
        if current_delinquencies > 0:
            issues.append(f"Current delinquencies ({current_delinquencies})")
            status = ComplianceStatus.REQUIRES_REVIEW
            docs_required.append("Explanation of delinquencies")
            docs_required.append("Plan for resolution")
        
        # Criminal history check
        if criminal_history is None:
            docs_required.append("SBA Form 912 for all 20%+ owners")
            if status == ComplianceStatus.ELIGIBLE:
                status = ComplianceStatus.INCOMPLETE
        
        if issues:
            return ComplianceCheck(
                id="character",
                name="Character Determination",
                category=ComplianceCategory.CHARACTER,
                status=status,
                requirement="All principals must demonstrate acceptable character",
                finding="; ".join(issues),
                cfr_reference="13 CFR 120.150",
                sop_reference="SOP 50 10 6, Chapter 2",
                documentation_required=docs_required,
                lender_action_required="Review character issues and document mitigating factors" if status == ComplianceStatus.REQUIRES_REVIEW else None,
            )
        
        if status == ComplianceStatus.INCOMPLETE:
            return ComplianceCheck(
                id="character",
                name="Character Determination",
                category=ComplianceCategory.CHARACTER,
                status=status,
                requirement="Character determination must be completed for all principals",
                finding="Character documentation incomplete",
                cfr_reference="13 CFR 120.150",
                sop_reference="SOP 50 10 6, Chapter 2",
                documentation_required=docs_required,
            )
        
        return ComplianceCheck(
            id="character",
            name="Character Determination",
            category=ComplianceCategory.CHARACTER,
            status=ComplianceStatus.ELIGIBLE,
            requirement="All principals must demonstrate acceptable character",
            finding="Character requirements satisfied",
            cfr_reference="13 CFR 120.150",
            sop_reference="SOP 50 10 6, Chapter 2",
        )
    
    def _check_collateral(self, deal_data: Dict) -> ComplianceCheck:
        """Check collateral requirements"""
        loan_amount = deal_data.get("loan_amount", 0) or deal_data.get("loan_amount_requested", 0)
        collateral_value = deal_data.get("total_collateral_value", 0)
        real_estate_collateral = deal_data.get("real_estate_collateral", 0)
        business_assets = deal_data.get("total_business_assets", 0)
        personal_assets = deal_data.get("total_personal_assets", 0)
        
        total_collateral = collateral_value or (real_estate_collateral + business_assets + personal_assets)
        
        # SBA requires lender to collateralize to the maximum extent possible
        # but does not mandate specific LTV ratios
        
        if total_collateral == 0:
            return ComplianceCheck(
                id="collateral",
                name="Collateral",
                category=ComplianceCategory.COLLATERAL,
                status=ComplianceStatus.INCOMPLETE,
                requirement="Lender must collateralize the loan to the maximum extent possible",
                finding="No collateral information provided",
                cfr_reference="13 CFR 120.160",
                sop_reference="SOP 50 10 6, Chapter 4",
                documentation_required=[
                    "Schedule of business assets",
                    "Personal financial statements for all 20%+ owners",
                    "Real estate appraisals (if applicable)",
                ],
                lender_action_required="Identify and perfect liens on all available collateral",
            )
        
        coverage = (total_collateral / loan_amount * 100) if loan_amount > 0 else 0
        
        if coverage < 100:
            return ComplianceCheck(
                id="collateral",
                name="Collateral",
                category=ComplianceCategory.COLLATERAL,
                status=ComplianceStatus.REQUIRES_REVIEW,
                requirement="Lender must collateralize to the maximum extent possible",
                finding=f"Collateral coverage is {coverage:.1f}% - document shortfall justification",
                cfr_reference="13 CFR 120.160",
                sop_reference="SOP 50 10 6, Chapter 4",
                documentation_required=["Collateral shortfall justification"],
                lender_action_required="Document that all available collateral has been pledged",
            )
        
        return ComplianceCheck(
            id="collateral",
            name="Collateral",
            category=ComplianceCategory.COLLATERAL,
            status=ComplianceStatus.ELIGIBLE,
            requirement="Lender must collateralize to the maximum extent possible",
            finding=f"Collateral coverage is {coverage:.1f}%",
            cfr_reference="13 CFR 120.160",
            sop_reference="SOP 50 10 6, Chapter 4",
        )
    
    def _check_equity_injection(self, deal_data: Dict) -> ComplianceCheck:
        """Check equity injection requirements"""
        deal_type = deal_data.get("deal_type", "") or deal_data.get("loan_purpose", "")
        equity_injection = deal_data.get("equity_injection", 0) or deal_data.get("down_payment", 0)
        purchase_price = deal_data.get("purchase_price", 0)
        total_project_cost = deal_data.get("total_project_cost", 0) or purchase_price
        
        if total_project_cost == 0:
            if "acquisition" in deal_type.lower() or "change of ownership" in deal_type.lower():
                return ComplianceCheck(
                    id="equity_injection",
                    name="Equity Injection",
                    category=ComplianceCategory.EQUITY_INJECTION,
                    status=ComplianceStatus.INCOMPLETE,
                    requirement="Equity injection must be documented for acquisitions",
                    finding="Purchase price/project cost not provided",
                    cfr_reference="13 CFR 120.150",
                    sop_reference="SOP 50 10 6, Chapter 3",
                    documentation_required=["Purchase agreement", "Sources and uses statement"],
                )
            return ComplianceCheck(
                id="equity_injection",
                name="Equity Injection",
                category=ComplianceCategory.EQUITY_INJECTION,
                status=ComplianceStatus.ELIGIBLE,
                requirement="Equity injection required for acquisitions and startups",
                finding="Non-acquisition loan - equity injection requirements may vary",
                cfr_reference="13 CFR 120.150",
                sop_reference="SOP 50 10 6, Chapter 3",
            )
        
        equity_pct = (equity_injection / total_project_cost) if total_project_cost > 0 else 0
        
        # Change of ownership typically requires 10%
        min_equity = self.min_equity_injection_coc if "acquisition" in deal_type.lower() else self.min_equity_injection_standard
        
        if equity_pct < min_equity:
            return ComplianceCheck(
                id="equity_injection",
                name="Equity Injection",
                category=ComplianceCategory.EQUITY_INJECTION,
                status=ComplianceStatus.INELIGIBLE,
                requirement=f"Minimum {min_equity*100:.0f}% equity injection required",
                finding=f"Equity injection is {equity_pct*100:.1f}%, below {min_equity*100:.0f}% minimum",
                cfr_reference="13 CFR 120.150",
                sop_reference="SOP 50 10 6, Chapter 3",
                documentation_required=["Sources of equity injection", "Bank statements showing funds available"],
            )
        
        return ComplianceCheck(
            id="equity_injection",
            name="Equity Injection",
            category=ComplianceCategory.EQUITY_INJECTION,
            status=ComplianceStatus.ELIGIBLE,
            requirement=f"Minimum {min_equity*100:.0f}% equity injection required",
            finding=f"Equity injection is {equity_pct*100:.1f}%",
            cfr_reference="13 CFR 120.150",
            sop_reference="SOP 50 10 6, Chapter 3",
        )
    
    def _check_repayment_ability(self, deal_data: Dict) -> ComplianceCheck:
        """Check repayment ability / cash flow adequacy"""
        dscr = deal_data.get("dscr", 0) or deal_data.get("dscr_base", 0)
        annual_revenue = deal_data.get("annual_revenue", 0)
        ebitda = deal_data.get("ebitda", 0)
        debt_service = deal_data.get("annual_debt_service", 0)
        
        if dscr == 0 and ebitda > 0 and debt_service > 0:
            dscr = ebitda / debt_service
        
        if dscr == 0:
            return ComplianceCheck(
                id="repayment_ability",
                name="Repayment Ability",
                category=ComplianceCategory.REPAYMENT_ABILITY,
                status=ComplianceStatus.INCOMPLETE,
                requirement="Borrower must demonstrate ability to repay the loan",
                finding="Cash flow / DSCR information not provided",
                cfr_reference="13 CFR 120.150",
                sop_reference="SOP 50 10 6, Chapter 4",
                documentation_required=[
                    "3 years historical financial statements",
                    "Year-to-date financials",
                    "Cash flow projections",
                    "Tax returns",
                ],
            )
        
        if dscr < 1.0:
            return ComplianceCheck(
                id="repayment_ability",
                name="Repayment Ability",
                category=ComplianceCategory.REPAYMENT_ABILITY,
                status=ComplianceStatus.INELIGIBLE,
                requirement=f"DSCR should be at least {self.min_dscr:.2f}x",
                finding=f"DSCR is {dscr:.2f}x - insufficient cash flow to service debt",
                cfr_reference="13 CFR 120.150",
                sop_reference="SOP 50 10 6, Chapter 4",
                is_hard_decline=True,
            )
        
        if dscr < self.min_dscr:
            return ComplianceCheck(
                id="repayment_ability",
                name="Repayment Ability",
                category=ComplianceCategory.REPAYMENT_ABILITY,
                status=ComplianceStatus.REQUIRES_REVIEW,
                requirement=f"DSCR should be at least {self.min_dscr:.2f}x",
                finding=f"DSCR is {dscr:.2f}x - marginal cash flow",
                cfr_reference="13 CFR 120.150",
                sop_reference="SOP 50 10 6, Chapter 4",
                documentation_required=["Cash flow analysis", "Stress test scenarios"],
                lender_action_required="Document mitigating factors supporting repayment ability",
            )
        
        return ComplianceCheck(
            id="repayment_ability",
            name="Repayment Ability",
            category=ComplianceCategory.REPAYMENT_ABILITY,
            status=ComplianceStatus.ELIGIBLE,
            requirement=f"DSCR should be at least {self.min_dscr:.2f}x",
            finding=f"DSCR is {dscr:.2f}x - adequate cash flow",
            cfr_reference="13 CFR 120.150",
            sop_reference="SOP 50 10 6, Chapter 4",
        )
    
    def _check_management_experience(self, deal_data: Dict) -> ComplianceCheck:
        """Check management experience requirements"""
        buyer_experience = deal_data.get("buyer_industry_experience", 0) or deal_data.get("owner_experience_years", 0)
        management_experience = deal_data.get("management_experience", 0)
        is_acquisition = "acquisition" in deal_data.get("deal_type", "").lower()
        
        if buyer_experience == 0 and management_experience == 0:
            return ComplianceCheck(
                id="management",
                name="Management Experience",
                category=ComplianceCategory.MANAGEMENT,
                status=ComplianceStatus.INCOMPLETE,
                requirement="Management must have relevant experience to operate the business",
                finding="Management experience not documented",
                cfr_reference="13 CFR 120.150",
                sop_reference="SOP 50 10 6, Chapter 4",
                documentation_required=["Management resumes", "Background on relevant experience"],
            )
        
        if is_acquisition and buyer_experience < 2:
            return ComplianceCheck(
                id="management",
                name="Management Experience",
                category=ComplianceCategory.MANAGEMENT,
                status=ComplianceStatus.REQUIRES_REVIEW,
                requirement="Buyer should have relevant industry experience for acquisitions",
                finding=f"Buyer has {buyer_experience} years industry experience - limited for acquisition",
                cfr_reference="13 CFR 120.150",
                sop_reference="SOP 50 10 6, Chapter 4",
                documentation_required=["Detailed management plan", "Training/transition plan"],
                lender_action_required="Document mitigating factors for limited experience",
            )
        
        return ComplianceCheck(
            id="management",
            name="Management Experience",
            category=ComplianceCategory.MANAGEMENT,
            status=ComplianceStatus.ELIGIBLE,
            requirement="Management must have relevant experience",
            finding=f"Management has {max(buyer_experience, management_experience)} years relevant experience",
            cfr_reference="13 CFR 120.150",
            sop_reference="SOP 50 10 6, Chapter 4",
        )
    
    def _check_franchise_eligibility(self, deal_data: Dict) -> ComplianceCheck:
        """Check franchise eligibility if applicable"""
        is_franchise = deal_data.get("is_franchise", False)
        franchise_name = deal_data.get("franchise_name", "")
        franchise_on_registry = deal_data.get("franchise_on_sba_registry", None)
        
        if not is_franchise:
            return ComplianceCheck(
                id="franchise",
                name="Franchise Eligibility",
                category=ComplianceCategory.FRANCHISE,
                status=ComplianceStatus.ELIGIBLE,
                requirement="Franchises must be on SBA Franchise Directory",
                finding="Not a franchise - requirement not applicable",
                cfr_reference="13 CFR 120.111",
                sop_reference="SOP 50 10 6, Chapter 2",
            )
        
        if franchise_on_registry is None:
            return ComplianceCheck(
                id="franchise",
                name="Franchise Eligibility",
                category=ComplianceCategory.FRANCHISE,
                status=ComplianceStatus.INCOMPLETE,
                requirement="Franchises must be on SBA Franchise Directory",
                finding=f"Franchise '{franchise_name}' directory status unknown",
                cfr_reference="13 CFR 120.111",
                sop_reference="SOP 50 10 6, Chapter 2",
                documentation_required=["Franchise agreement", "FDD (Franchise Disclosure Document)"],
                lender_action_required="Verify franchise is on SBA Franchise Directory",
            )
        
        if not franchise_on_registry:
            return ComplianceCheck(
                id="franchise",
                name="Franchise Eligibility",
                category=ComplianceCategory.FRANCHISE,
                status=ComplianceStatus.INELIGIBLE,
                requirement="Franchises must be on SBA Franchise Directory",
                finding=f"Franchise '{franchise_name}' is not on SBA Franchise Directory",
                cfr_reference="13 CFR 120.111",
                sop_reference="SOP 50 10 6, Chapter 2",
                is_hard_decline=True,
            )
        
        return ComplianceCheck(
            id="franchise",
            name="Franchise Eligibility",
            category=ComplianceCategory.FRANCHISE,
            status=ComplianceStatus.ELIGIBLE,
            requirement="Franchises must be on SBA Franchise Directory",
            finding=f"Franchise '{franchise_name}' is on SBA Franchise Directory",
            cfr_reference="13 CFR 120.111",
            sop_reference="SOP 50 10 6, Chapter 2",
        )
    
    def _check_affiliate_rules(self, deal_data: Dict) -> ComplianceCheck:
        """Check affiliate rules and combined size"""
        has_affiliates = deal_data.get("has_affiliates", False)
        affiliate_revenue = deal_data.get("affiliate_combined_revenue", 0)
        affiliate_employees = deal_data.get("affiliate_combined_employees", 0)
        
        if not has_affiliates:
            return ComplianceCheck(
                id="affiliates",
                name="Affiliate Rules",
                category=ComplianceCategory.AFFILIATE,
                status=ComplianceStatus.ELIGIBLE,
                requirement="Business with affiliates must meet combined size standards",
                finding="No affiliates - requirement not applicable",
                cfr_reference="13 CFR 121.103",
                sop_reference="SOP 50 10 6, Chapter 2",
            )
        
        if affiliate_revenue == 0 and affiliate_employees == 0:
            return ComplianceCheck(
                id="affiliates",
                name="Affiliate Rules",
                category=ComplianceCategory.AFFILIATE,
                status=ComplianceStatus.INCOMPLETE,
                requirement="Business with affiliates must meet combined size standards",
                finding="Affiliate information not provided",
                cfr_reference="13 CFR 121.103",
                sop_reference="SOP 50 10 6, Chapter 2",
                documentation_required=[
                    "List of all affiliates",
                    "Organizational charts",
                    "Combined revenue and employee counts",
                ],
                lender_action_required="Complete affiliate analysis per 13 CFR 121.103",
            )
        
        # Would need to check combined size against standards - simplified here
        return ComplianceCheck(
            id="affiliates",
            name="Affiliate Rules",
            category=ComplianceCategory.AFFILIATE,
            status=ComplianceStatus.REQUIRES_REVIEW,
            requirement="Business with affiliates must meet combined size standards",
            finding=f"Affiliates present - combined revenue ${affiliate_revenue:,.0f}, employees {affiliate_employees}",
            cfr_reference="13 CFR 121.103",
            sop_reference="SOP 50 10 6, Chapter 2",
            lender_action_required="Verify combined entity meets size standards",
        )
    
    def _get_lender_compliance_items(self, deal_data: Dict, checks: List[ComplianceCheck]) -> List[str]:
        """Generate lender compliance checklist items"""
        items = []
        
        # Standard lender compliance items for all 7(a) loans
        items.extend([
            "Complete SBA Form 1920 (Lender's Application for Guaranty)",
            "Verify IRS tax transcript matches submitted returns",
            "Check CAIVRS (Credit Alert Verification Reporting System)",
            "Check SAM.gov for debarment/suspension",
            "Obtain personal guarantees from all 20%+ owners",
            "Document credit elsewhere test",
            "Complete environmental review (if real estate involved)",
            "Verify SBA guarantee fee has been calculated correctly",
        ])
        
        # Add items based on specific check results
        for check in checks:
            if check.lender_action_required:
                items.append(check.lender_action_required)
        
        # Deal-type specific items
        deal_type = deal_data.get("deal_type", "").lower()
        if "acquisition" in deal_type or "change of ownership" in deal_type:
            items.extend([
                "Verify equity injection source and availability",
                "Document seller's reason for sale",
                "Verify no seller-related debt in transaction",
                "Complete business valuation or document purchase price justification",
            ])
        
        loan_amount = deal_data.get("loan_amount", 0) or deal_data.get("loan_amount_requested", 0)
        if loan_amount > 500000:
            items.append("Obtain independent business valuation for loans >$500K with intangibles")
        
        return list(set(items))  # Remove duplicates
    
    def _determine_eligible_programs(self, deal_data: Dict, checks: List[ComplianceCheck]) -> Tuple[List[str], float]:
        """Determine which SBA programs the deal is eligible for"""
        loan_amount = deal_data.get("loan_amount", 0) or deal_data.get("loan_amount_requested", 0)
        
        has_failures = any(c.status == ComplianceStatus.INELIGIBLE for c in checks)
        
        if has_failures:
            return [], 0
        
        eligible = []
        max_amount = 0
        
        # Standard 7(a)
        if loan_amount <= self.max_7a_amount:
            eligible.append("7(a) Standard")
            max_amount = min(loan_amount, self.max_7a_amount)
        
        # 7(a) Small Loan
        if loan_amount <= self.max_small_amount:
            eligible.append("7(a) Small Loan")
        
        # SBA Express
        if loan_amount <= self.max_express_amount:
            eligible.append("SBA Express")
        
        # Community Advantage (if applicable)
        if loan_amount <= 350000:
            eligible.append("Community Advantage")
        
        return eligible, max_amount
    
    def _generate_recommendations(self, checks: List[ComplianceCheck], deal_data: Dict) -> List[str]:
        """Generate recommendations based on compliance results"""
        recommendations = []
        
        for check in checks:
            if check.status == ComplianceStatus.REQUIRES_REVIEW:
                recommendations.append(f"Review required for {check.name}: {check.finding}")
            elif check.status == ComplianceStatus.INCOMPLETE:
                docs = ", ".join(check.documentation_required[:3]) if check.documentation_required else "required documentation"
                recommendations.append(f"Obtain {docs} for {check.name}")
        
        # Loan structure recommendations
        loan_amount = deal_data.get("loan_amount", 0) or deal_data.get("loan_amount_requested", 0)
        if loan_amount > self.max_express_amount and loan_amount <= self.max_7a_amount:
            recommendations.append("Consider standard 7(a) processing given loan size")
        elif loan_amount <= self.max_express_amount:
            recommendations.append("Eligible for SBA Express - faster processing available")
        
        return recommendations


# Convenience function for quick checks
def check_sba_compliance(deal_data: Dict[str, Any]) -> SBAComplianceResult:
    """Quick compliance check for a deal"""
    engine = SBAComplianceEngine()
    return engine.evaluate_deal(deal_data)
