"""
Heradyne Underwriting Engines

Rules-based underwriting engines for:
- Cash Flow Analysis (normalized EBITDA, post-debt FCF, DSCR)
- Probability of Default (PD) calculation
- Valuation (EV range)
- Collateral (NOLV calculation)
- Deal Structuring (guarantee %, escrow %, alignment)

DISCLAIMER: These engines provide informational analysis only. 
Heradyne does not lend, guarantee, or insure.
"""

from typing import Dict, Any, List
from dataclasses import dataclass
from sqlalchemy.orm import Session

from app.models.deal import Deal
from app.services.assumptions import assumption_service


@dataclass
class CashFlowResult:
    """Cash flow analysis results."""
    normalized_ebitda: float
    total_addbacks: float
    annual_debt_service: float
    post_debt_fcf: float
    dscr_base: float
    dscr_stress: float
    stress_parameters: Dict[str, float]


@dataclass
class PDResult:
    """Probability of default analysis results."""
    sba_anchor_pd: float
    industry_multiplier: float
    leverage_multiplier: float
    volatility_multiplier: float
    annual_pd: float
    pd_explanation: str


@dataclass
class ValuationResult:
    """Valuation analysis results."""
    ev_low: float
    ev_mid: float
    ev_high: float
    multiple_low: float
    multiple_mid: float
    multiple_high: float
    durability_score: float
    durability_factors: Dict[str, float]


@dataclass
class CollateralResult:
    """Collateral analysis results."""
    business_assets_gross: float
    business_nolv: float
    personal_assets_gross: float
    personal_nolv: float
    total_nolv: float
    collateral_coverage: float
    asset_breakdown: List[Dict[str, Any]]


@dataclass
class StructuringResult:
    """Deal structuring recommendations."""
    recommended_guarantee_pct: float
    recommended_escrow_pct: float
    recommended_alignment: Dict[str, Any]
    rationale: str


class CashFlowEngine:
    """
    Cash Flow Engine
    
    Calculates:
    - Normalized EBITDA (base EBITDA + qualifying addbacks)
    - Post-debt Free Cash Flow
    - Debt Service Coverage Ratio (base and stress scenarios)
    """
    
    def __init__(self, db: Session):
        self.db = db
    
    def analyze(self, deal: Deal) -> CashFlowResult:
        """Run cash flow analysis on a deal."""
        # Calculate total addbacks
        total_addbacks = 0.0
        if deal.addbacks:
            for addback in deal.addbacks:
                if isinstance(addback, dict):
                    total_addbacks += addback.get('amount', 0)
        
        # Normalized EBITDA = reported EBITDA + qualifying addbacks
        normalized_ebitda = deal.ebitda + total_addbacks
        
        # Annual debt service (existing + new loan)
        existing_debt_service = deal.debt_service or 0
        
        # Estimate new loan debt service (simple annuity calculation)
        estimated_rate = 0.08
        term_years = deal.loan_term_months / 12
        if term_years > 0:
            r = estimated_rate
            n = term_years
            pmt_factor = (r * (1 + r) ** n) / ((1 + r) ** n - 1)
            new_debt_service = deal.loan_amount_requested * pmt_factor
        else:
            new_debt_service = 0
        
        annual_debt_service = existing_debt_service + new_debt_service
        
        # Post-debt FCF = Normalized EBITDA - CapEx - Debt Service
        capex = deal.capex or 0
        post_debt_fcf = normalized_ebitda - capex - annual_debt_service
        
        # DSCR = Normalized EBITDA / Debt Service
        if annual_debt_service > 0:
            dscr_base = normalized_ebitda / annual_debt_service
        else:
            dscr_base = 999.0
        
        # Stress DSCR
        stress_params = assumption_service.get_assumption(
            self.db, "cashflow_engine", "stress_scenarios"
        ) or {"revenue_decline": 0.20, "margin_compression": 0.05}
        
        revenue_stress = stress_params.get("revenue_decline", 0.20)
        margin_stress = stress_params.get("margin_compression", 0.05)
        
        stressed_revenue = deal.annual_revenue * (1 - revenue_stress)
        if deal.annual_revenue > 0:
            ebitda_margin = deal.ebitda / deal.annual_revenue
        else:
            ebitda_margin = 0.10
        
        stressed_margin = max(0, ebitda_margin - margin_stress)
        stressed_ebitda = stressed_revenue * stressed_margin
        
        if annual_debt_service > 0:
            dscr_stress = stressed_ebitda / annual_debt_service
        else:
            dscr_stress = 999.0
        
        return CashFlowResult(
            normalized_ebitda=round(normalized_ebitda, 2),
            total_addbacks=round(total_addbacks, 2),
            annual_debt_service=round(annual_debt_service, 2),
            post_debt_fcf=round(post_debt_fcf, 2),
            dscr_base=round(dscr_base, 2),
            dscr_stress=round(dscr_stress, 2),
            stress_parameters=stress_params
        )


class PDEngine:
    """
    Probability of Default Engine
    
    Formula: Annual PD = SBA Anchor * Industry Multiplier * Leverage Multiplier * Volatility Multiplier
    """
    
    def __init__(self, db: Session):
        self.db = db
    
    def analyze(self, deal: Deal, normalized_ebitda: float) -> PDResult:
        """Calculate probability of default for a deal."""
        
        sba_anchor = assumption_service.get_assumption(
            self.db, "pd_engine", "sba_anchor_pd"
        ) or 0.03
        
        industry_multipliers = assumption_service.get_assumption(
            self.db, "pd_engine", "industry_multipliers"
        ) or {}
        
        industry = deal.industry.lower().replace(" ", "_")
        industry_mult = industry_multipliers.get(industry, industry_multipliers.get("default", 1.0))
        
        if normalized_ebitda > 0:
            leverage = deal.loan_amount_requested / normalized_ebitda
        else:
            leverage = 999.0
        
        leverage_config = assumption_service.get_assumption(
            self.db, "pd_engine", "leverage_multipliers"
        ) or {"ranges": [{"max_leverage": 999, "multiplier": 1.0}]}
        
        leverage_mult = 1.0
        for range_config in leverage_config.get("ranges", []):
            if leverage <= range_config.get("max_leverage", 999):
                leverage_mult = range_config.get("multiplier", 1.0)
                break
        
        volatility_multipliers = assumption_service.get_assumption(
            self.db, "pd_engine", "volatility_multipliers"
        ) or {"low": 0.9, "medium": 1.0, "high": 1.3}
        
        high_vol_industries = ["technology", "restaurants", "hospitality", "construction"]
        low_vol_industries = ["healthcare", "professional_services"]
        
        if industry in high_vol_industries:
            volatility_mult = volatility_multipliers.get("high", 1.3)
            vol_category = "high"
        elif industry in low_vol_industries:
            volatility_mult = volatility_multipliers.get("low", 0.9)
            vol_category = "low"
        else:
            volatility_mult = volatility_multipliers.get("medium", 1.0)
            vol_category = "medium"
        
        annual_pd = sba_anchor * industry_mult * leverage_mult * volatility_mult
        annual_pd = min(max(annual_pd, 0.001), 0.50)
        
        explanation = (
            f"Annual PD of {annual_pd:.2%} calculated as: "
            f"SBA anchor ({sba_anchor:.2%}) × "
            f"Industry multiplier ({industry_mult:.2f} for {deal.industry}) × "
            f"Leverage multiplier ({leverage_mult:.2f} for {leverage:.1f}x) × "
            f"Volatility multiplier ({volatility_mult:.2f} - {vol_category})"
        )
        
        return PDResult(
            sba_anchor_pd=sba_anchor,
            industry_multiplier=industry_mult,
            leverage_multiplier=leverage_mult,
            volatility_multiplier=volatility_mult,
            annual_pd=round(annual_pd, 4),
            pd_explanation=explanation
        )


class ValuationEngine:
    """Valuation Engine - calculates EV range using industry multiple bands."""
    
    def __init__(self, db: Session):
        self.db = db
    
    def analyze(self, deal: Deal, normalized_ebitda: float) -> ValuationResult:
        """Calculate valuation for a deal."""
        
        ev_multiples = assumption_service.get_assumption(
            self.db, "valuation_engine", "ev_multiples"
        ) or {}
        
        industry = deal.industry.lower().replace(" ", "_")
        multiples = ev_multiples.get(industry, ev_multiples.get("default", {
            "low": 3.0, "mid": 4.5, "high": 6.0
        }))
        
        mult_low = multiples.get("low", 3.0)
        mult_mid = multiples.get("mid", 4.5)
        mult_high = multiples.get("high", 6.0)
        
        ev_low = normalized_ebitda * mult_low
        ev_mid = normalized_ebitda * mult_mid
        ev_high = normalized_ebitda * mult_high
        
        durability_factors = {}
        
        if deal.annual_revenue >= 10_000_000:
            rev_score = 25
        elif deal.annual_revenue >= 5_000_000:
            rev_score = 20
        elif deal.annual_revenue >= 2_000_000:
            rev_score = 15
        else:
            rev_score = 10
        durability_factors["revenue_size"] = rev_score
        
        if deal.annual_revenue > 0:
            margin = deal.ebitda / deal.annual_revenue
        else:
            margin = 0
        
        if margin >= 0.20:
            margin_score = 25
        elif margin >= 0.15:
            margin_score = 20
        elif margin >= 0.10:
            margin_score = 15
        else:
            margin_score = 10
        durability_factors["ebitda_margin"] = margin_score
        
        if deal.owner_experience_years:
            if deal.owner_experience_years >= 10:
                exp_score = 25
            elif deal.owner_experience_years >= 5:
                exp_score = 20
            elif deal.owner_experience_years >= 2:
                exp_score = 15
            else:
                exp_score = 10
        else:
            exp_score = 15
        durability_factors["owner_experience"] = exp_score
        
        stable_industries = ["healthcare", "professional_services", "manufacturing"]
        if industry in stable_industries:
            ind_score = 25
        else:
            ind_score = 15
        durability_factors["industry_stability"] = ind_score
        
        durability_score = sum(durability_factors.values())
        
        return ValuationResult(
            ev_low=round(ev_low, 2),
            ev_mid=round(ev_mid, 2),
            ev_high=round(ev_high, 2),
            multiple_low=mult_low,
            multiple_mid=mult_mid,
            multiple_high=mult_high,
            durability_score=durability_score,
            durability_factors=durability_factors
        )


class CollateralEngine:
    """Collateral Engine - calculates NOLV using haircut tables."""
    
    def __init__(self, db: Session):
        self.db = db
    
    def analyze(self, deal: Deal) -> CollateralResult:
        """Calculate collateral value for a deal."""
        
        business_haircuts = assumption_service.get_assumption(
            self.db, "collateral_engine", "business_asset_haircuts"
        ) or {"default": 0.50}
        
        personal_haircuts = assumption_service.get_assumption(
            self.db, "collateral_engine", "personal_asset_haircuts"
        ) or {"default": 0.40}
        
        business_gross = 0.0
        business_nolv = 0.0
        asset_breakdown = []
        
        if deal.business_assets:
            for asset in deal.business_assets:
                if isinstance(asset, dict):
                    asset_type = asset.get("type", "default").lower().replace(" ", "_")
                    value = asset.get("value", 0)
                    haircut = business_haircuts.get(asset_type, business_haircuts.get("default", 0.50))
                    nolv = value * (1 - haircut)
                    
                    business_gross += value
                    business_nolv += nolv
                    
                    asset_breakdown.append({
                        "category": "business",
                        "type": asset_type,
                        "description": asset.get("description", ""),
                        "gross_value": value,
                        "haircut": haircut,
                        "nolv": nolv
                    })
        
        personal_gross = 0.0
        personal_nolv = 0.0
        
        if deal.personal_assets:
            for asset in deal.personal_assets:
                if isinstance(asset, dict):
                    asset_type = asset.get("type", "default").lower().replace(" ", "_")
                    value = asset.get("value", 0)
                    haircut = personal_haircuts.get(asset_type, personal_haircuts.get("default", 0.40))
                    nolv = value * (1 - haircut)
                    
                    personal_gross += value
                    personal_nolv += nolv
                    
                    asset_breakdown.append({
                        "category": "personal",
                        "type": asset_type,
                        "description": asset.get("description", ""),
                        "gross_value": value,
                        "haircut": haircut,
                        "nolv": nolv
                    })
        
        total_nolv = business_nolv + personal_nolv
        
        if deal.loan_amount_requested > 0:
            collateral_coverage = total_nolv / deal.loan_amount_requested
        else:
            collateral_coverage = 0.0
        
        return CollateralResult(
            business_assets_gross=round(business_gross, 2),
            business_nolv=round(business_nolv, 2),
            personal_assets_gross=round(personal_gross, 2),
            personal_nolv=round(personal_nolv, 2),
            total_nolv=round(total_nolv, 2),
            collateral_coverage=round(collateral_coverage, 3),
            asset_breakdown=asset_breakdown
        )


class StructuringEngine:
    """Deal Structuring Engine - proposes guarantee %, escrow %, and alignment."""
    
    def __init__(self, db: Session):
        self.db = db
    
    def analyze(
        self, 
        deal: Deal, 
        pd_result: PDResult, 
        dscr_base: float,
        collateral_coverage: float
    ) -> StructuringResult:
        """Generate structuring recommendations."""
        
        guarantee_bands = assumption_service.get_assumption(
            self.db, "structuring_engine", "guarantee_bands"
        ) or {"min_pct": 0.50, "max_pct": 0.70, "default_pct": 0.60}
        
        escrow_bands = assumption_service.get_assumption(
            self.db, "structuring_engine", "escrow_bands"
        ) or {"min_pct": 0.03, "max_pct": 0.07, "default_pct": 0.05}
        
        base_guarantee = guarantee_bands.get("default_pct", 0.60)
        
        if pd_result.annual_pd > 0.06:
            pd_adjustment = 0.05
        elif pd_result.annual_pd > 0.04:
            pd_adjustment = 0.02
        elif pd_result.annual_pd < 0.02:
            pd_adjustment = -0.03
        else:
            pd_adjustment = 0
        
        if dscr_base < 1.1:
            dscr_adjustment = 0.05
        elif dscr_base < 1.25:
            dscr_adjustment = 0.02
        elif dscr_base > 1.5:
            dscr_adjustment = -0.03
        else:
            dscr_adjustment = 0
        
        recommended_guarantee = base_guarantee + pd_adjustment + dscr_adjustment
        recommended_guarantee = min(
            max(recommended_guarantee, guarantee_bands.get("min_pct", 0.50)),
            guarantee_bands.get("max_pct", 0.70)
        )
        
        base_escrow = escrow_bands.get("default_pct", 0.05)
        
        if collateral_coverage < 0.5:
            coll_adjustment = 0.02
        elif collateral_coverage > 1.0:
            coll_adjustment = -0.01
        else:
            coll_adjustment = 0
        
        recommended_escrow = base_escrow + coll_adjustment
        recommended_escrow = min(
            max(recommended_escrow, escrow_bands.get("min_pct", 0.03)),
            escrow_bands.get("max_pct", 0.07)
        )
        
        alignment = {
            "personal_guarantee": True,
            "key_person_life_insurance": deal.loan_amount_requested > 1_000_000,
            "monthly_reporting": True,
            "annual_audit": deal.loan_amount_requested > 2_000_000,
            "board_seat": deal.loan_amount_requested > 5_000_000,
            "financial_covenants": {
                "min_dscr": 1.15,
                "max_leverage": 4.5
            }
        }
        
        rationale = (
            f"Recommended {recommended_guarantee:.0%} guarantee based on "
            f"annual PD of {pd_result.annual_pd:.2%} and DSCR of {dscr_base:.2f}. "
            f"Escrow of {recommended_escrow:.0%} recommended given "
            f"collateral coverage of {collateral_coverage:.1%}."
        )
        
        return StructuringResult(
            recommended_guarantee_pct=round(recommended_guarantee, 3),
            recommended_escrow_pct=round(recommended_escrow, 3),
            recommended_alignment=alignment,
            rationale=rationale
        )


class UnderwritingService:
    """Main underwriting service that orchestrates all engines."""
    
    def __init__(self, db: Session):
        self.db = db
        self.cashflow_engine = CashFlowEngine(db)
        self.pd_engine = PDEngine(db)
        self.valuation_engine = ValuationEngine(db)
        self.collateral_engine = CollateralEngine(db)
        self.structuring_engine = StructuringEngine(db)
    
    def analyze_deal(self, deal: Deal) -> Dict[str, Any]:
        """Run full underwriting analysis on a deal."""
        
        cashflow = self.cashflow_engine.analyze(deal)
        pd_result = self.pd_engine.analyze(deal, cashflow.normalized_ebitda)
        valuation = self.valuation_engine.analyze(deal, cashflow.normalized_ebitda)
        collateral = self.collateral_engine.analyze(deal)
        structuring = self.structuring_engine.analyze(
            deal, pd_result, cashflow.dscr_base, collateral.collateral_coverage
        )
        
        report = {
            "disclaimer": (
                "INFORMATIONAL ONLY: This analysis is provided for informational purposes. "
                "Heradyne does not lend money, provide guarantees, or issue insurance. "
                "All recommendations should be independently verified."
            ),
            "deal_summary": {
                "id": deal.id,
                "name": deal.name,
                "type": deal.deal_type.value,
                "industry": deal.industry,
                "loan_requested": deal.loan_amount_requested,
                "term_months": deal.loan_term_months
            },
            "cashflow_analysis": {
                "normalized_ebitda": cashflow.normalized_ebitda,
                "total_addbacks": cashflow.total_addbacks,
                "annual_debt_service": cashflow.annual_debt_service,
                "post_debt_fcf": cashflow.post_debt_fcf,
                "dscr_base": cashflow.dscr_base,
                "dscr_stress": cashflow.dscr_stress,
                "stress_parameters": cashflow.stress_parameters
            },
            "pd_analysis": {
                "sba_anchor_pd": pd_result.sba_anchor_pd,
                "industry_multiplier": pd_result.industry_multiplier,
                "leverage_multiplier": pd_result.leverage_multiplier,
                "volatility_multiplier": pd_result.volatility_multiplier,
                "annual_pd": pd_result.annual_pd,
                "explanation": pd_result.pd_explanation
            },
            "valuation": {
                "ev_low": valuation.ev_low,
                "ev_mid": valuation.ev_mid,
                "ev_high": valuation.ev_high,
                "multiple_low": valuation.multiple_low,
                "multiple_mid": valuation.multiple_mid,
                "multiple_high": valuation.multiple_high,
                "durability_score": valuation.durability_score,
                "durability_factors": valuation.durability_factors
            },
            "collateral": {
                "business_assets_gross": collateral.business_assets_gross,
                "business_nolv": collateral.business_nolv,
                "personal_assets_gross": collateral.personal_assets_gross,
                "personal_nolv": collateral.personal_nolv,
                "total_nolv": collateral.total_nolv,
                "collateral_coverage": collateral.collateral_coverage,
                "asset_breakdown": collateral.asset_breakdown
            },
            "structuring": {
                "recommended_guarantee_pct": structuring.recommended_guarantee_pct,
                "recommended_escrow_pct": structuring.recommended_escrow_pct,
                "recommended_alignment": structuring.recommended_alignment,
                "rationale": structuring.rationale
            }
        }
        
        return report
