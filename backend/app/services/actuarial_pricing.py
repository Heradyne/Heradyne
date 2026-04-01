"""
Heradyne Actuarial Pricing Engine

"Actuary-in-a-Box" for SBA 7(a) loan insurance pricing.

Components:
1. Frequency-Severity Model (two-part default probability + LGD)
2. Premium Calculation (pure premium + risk loads + expenses)
3. Capital/PML Calculations (stochastic simulation)
4. Cohort Analysis & Credibility Weighting
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any, Tuple
from enum import Enum
from datetime import datetime, date
import math
import random


class RiskDecision(str, Enum):
    ACCEPT = "accept"
    DECLINE = "decline"
    REFER = "refer"


class DataSufficiency(str, Enum):
    HIGH = "high"          # >500 comparable loans, full credibility
    MODERATE = "moderate"  # 100-500 loans, partial credibility
    LOW = "low"            # <100 loans, heavy prior weighting
    INSUFFICIENT = "insufficient"  # <20 loans, manual review required


@dataclass
class LossDriver:
    """Individual factor driving risk up or down"""
    factor: str
    impact: float  # Positive = increases risk, negative = decreases
    description: str
    vs_benchmark: str  # "above average", "below average", "average"


@dataclass
class CohortMatch:
    """Similar historical loans for comparison"""
    cohort_name: str
    loan_count: int
    avg_default_rate: float
    avg_lgd: float
    avg_loss_ratio: float
    filters_applied: Dict[str, Any]


@dataclass 
class StructureScenario:
    """What-if scenario for policy structure"""
    attachment_point: float  # % of loan where coverage starts
    limit: float  # Max coverage amount
    coinsurance: float  # % insurer pays
    expected_loss: float
    pml_99: float  # 99th percentile max loss
    indicated_rate: float
    capital_load: float
    roi: float


@dataclass
class PricingResult:
    """Complete pricing output for a submission"""
    # Core pricing
    pure_premium: float  # Expected loss per exposure
    risk_load: float  # Volatility, tail, parameter uncertainty
    expense_load: float  # Fixed + variable expenses
    profit_margin: float
    indicated_rate: float  # Total rate
    indicated_rate_low: float  # Confidence band
    indicated_rate_high: float
    pricing_floor: float  # Minimum acceptable rate
    
    # Collateral analysis
    collateral_value: float
    collateral_coverage_ratio: float  # Collateral / Loan Amount
    collateral_adjusted_lgd: float  # LGD after collateral
    collateral_discount: float  # Premium discount from collateral
    
    # Premium budget
    budget_monthly_premium: Optional[float]
    budget_feasible: bool
    budget_gap: Optional[float]
    budget_adjusted_coverage: Optional[float]
    
    # Data quality
    data_sufficiency: DataSufficiency
    credibility_factor: float  # 0-1, how much weight on cohort vs prior
    cohort_loan_count: int
    
    # Risk metrics
    expected_loss_ratio: float
    default_probability: float  # Frequency
    loss_given_default: float  # Severity (base, before collateral)
    pml_99: float  # 99th percentile loss
    tvar_99: float  # Tail value at risk
    capital_required: float
    
    # Decision
    decision: RiskDecision
    decision_rationale: str
    required_conditions: List[str]
    
    # Drivers
    loss_drivers: List[LossDriver]
    cohort_match: CohortMatch
    
    # Audit
    model_version: str
    dataset_version: str
    assumptions: Dict[str, Any]
    calculated_at: str


@dataclass
class PortfolioMetrics:
    """Aggregate portfolio view"""
    total_exposure: float
    total_premium: float
    expected_loss: float
    expected_loss_ratio: float
    pml_99: float
    tvar_99: float
    capital_usage: float
    concentration_flags: List[str]
    reinsurance_leverage: float


# FOIA-based empirical defaults by segment
NAICS_DEFAULT_RATES = {
    "11": 0.012,  # Agriculture
    "21": 0.018,  # Mining
    "22": 0.015,  # Utilities
    "23": 0.022,  # Construction
    "31": 0.019,  # Manufacturing
    "32": 0.019,
    "33": 0.019,
    "42": 0.017,  # Wholesale
    "44": 0.025,  # Retail
    "45": 0.025,
    "48": 0.059,  # Transportation - highest risk
    "49": 0.035,
    "51": 0.021,  # Information
    "52": 0.018,  # Finance
    "53": 0.023,  # Real Estate
    "54": 0.016,  # Professional Services
    "56": 0.028,  # Admin Services
    "61": 0.019,  # Education
    "62": 0.014,  # Healthcare - lowest risk
    "71": 0.032,  # Arts/Entertainment
    "72": 0.038,  # Accommodation/Food
    "81": 0.024,  # Other Services
}

# LGD by collateral type (base LGD without specific collateral value)
LGD_BY_COLLATERAL = {
    "real_estate": 0.25,
    "equipment": 0.45,
    "inventory": 0.60,
    "receivables": 0.50,
    "unsecured": 0.75,
    "mixed": 0.40,
}

# Collateral liquidation recovery rates (% of market value recoverable in default)
COLLATERAL_RECOVERY_RATES = {
    "real_estate": 0.75,      # 75% of market value in forced sale
    "equipment": 0.50,        # 50% - depreciation and specialized nature
    "inventory": 0.35,        # 35% - perishable, seasonal, obsolescence
    "receivables": 0.60,      # 60% - collection risk
    "vehicles": 0.55,         # 55% - rapid depreciation
    "cash": 1.00,             # 100% - liquid
    "securities": 0.90,       # 90% - market risk
    "other": 0.30,            # 30% - uncertain value
}

# Vintage adjustment factors
VINTAGE_ADJUSTMENTS = {
    2020: 1.35,  # COVID vintage - higher risk
    2021: 1.20,
    2022: 1.10,
    2023: 1.05,
    2024: 1.00,
    2025: 1.00,
}


class ActuarialPricingEngine:
    """
    Full actuarial pricing engine for SBA 7(a) loan insurance.
    
    Implements frequency-severity model with credibility weighting,
    capital calculations, and decision automation.
    """
    
    def __init__(self):
        self.model_version = "1.0.0"
        self.dataset_version = "FOIA-2025-Q1"
        
        # Default assumptions
        self.base_expense_ratio = 0.15  # 15% of premium
        self.variable_expense_ratio = 0.05  # 5% of premium
        self.target_profit_margin = 0.10  # 10% profit load
        self.target_combined_ratio = 0.85  # 85% combined ratio target
        self.risk_free_rate = 0.045  # 4.5%
        self.cost_of_capital = 0.12  # 12% required ROE
        
        # Credibility parameters (Bühlmann)
        self.full_credibility_standard = 500  # Loans for full credibility
        self.partial_credibility_min = 20  # Minimum for any credibility
        
        # Capital parameters
        self.capital_multiplier = 0.25  # Capital = 25% of PML
        
    def price_submission(
        self,
        submission: Dict[str, Any],
        policy_terms: Dict[str, Any],
        portfolio_context: Optional[Dict[str, Any]] = None
    ) -> PricingResult:
        """
        Price a single loan submission.
        
        Args:
            submission: Loan/borrower characteristics
            policy_terms: Coverage structure (attachment, limit, etc.)
            portfolio_context: Current portfolio for concentration checks
            
        Returns:
            Complete PricingResult with decision and audit trail
        """
        # Extract key inputs
        loan_amount = submission.get("loan_amount", 0)
        naics = str(submission.get("naics_code", submission.get("industry", "99")))[:2]
        geography = submission.get("state", submission.get("geography", "US"))
        vintage = submission.get("vintage_year", datetime.now().year)
        term_months = submission.get("term_months", 120)
        dscr = submission.get("dscr", 1.25)
        credit_score = submission.get("credit_score", 700)
        collateral_type = submission.get("collateral_type", "mixed")
        guaranty_pct = submission.get("sba_guaranty_pct", 0.75)
        equity_injection = submission.get("equity_injection_pct", 0.10)
        business_age = submission.get("business_age_years", 5)
        
        # NEW: Collateral details
        collateral_items = submission.get("collateral_items", [])
        total_collateral_value = submission.get("total_collateral_value", 0)
        
        # NEW: Premium budget
        max_monthly_premium = submission.get("max_monthly_premium")
        target_monthly_premium = submission.get("target_monthly_premium")
        
        # Policy terms
        attachment = policy_terms.get("attachment_point", 0)  # First loss %
        limit = policy_terms.get("limit", loan_amount * 0.75)
        coinsurance = policy_terms.get("coinsurance", 1.0)  # % insurer pays
        
        # 1. Calculate base default probability (frequency)
        base_pd = self._calculate_default_probability(
            naics=naics,
            dscr=dscr,
            credit_score=credit_score,
            business_age=business_age,
            equity_injection=equity_injection,
            term_months=term_months,
            vintage=vintage,
        )
        
        # 2. Calculate base LGD (severity without specific collateral)
        base_lgd = self._calculate_lgd(
            collateral_type=collateral_type,
            guaranty_pct=guaranty_pct,
            loan_amount=loan_amount,
        )
        
        # 3. Calculate collateral-adjusted LGD
        collateral_value, collateral_coverage, collateral_adjusted_lgd, collateral_discount = \
            self._calculate_collateral_adjusted_lgd(
                loan_amount=loan_amount,
                base_lgd=base_lgd,
                collateral_items=collateral_items,
                total_collateral_value=total_collateral_value,
                collateral_type=collateral_type,
            )
        
        # 4. Find comparable cohort
        cohort = self._find_cohort(submission)
        
        # 5. Calculate credibility and blend with cohort
        credibility = self._calculate_credibility(cohort.loan_count)
        blended_pd = credibility * cohort.avg_default_rate + (1 - credibility) * base_pd
        # Use collateral-adjusted LGD for blending
        blended_lgd = credibility * cohort.avg_lgd + (1 - credibility) * collateral_adjusted_lgd
        
        # 6. Calculate expected loss (pure premium rate)
        pure_premium_rate = blended_pd * blended_lgd
        
        # Calculate insured exposure for dollar amounts
        insured_exposure = min(loan_amount - attachment, limit) * coinsurance
        
        # 7. Risk loads (as percentage of pure premium, not additive)
        cv = math.sqrt(blended_pd * (1 - blended_pd)) / blended_pd if blended_pd > 0 else 1
        volatility_load_factor = 1 + (cv * 0.25)
        param_uncertainty_factor = 1 + ((1 - credibility) * 0.15)
        tail_load_factor = 1.10
        
        # Collateral quality adjustment to risk load
        # Better collateral = lower risk load
        collateral_risk_adjustment = 1.0 - (collateral_discount * 0.5)  # Up to 50% of collateral discount reduces risk load
        
        risk_load_multiplier = volatility_load_factor * param_uncertainty_factor * tail_load_factor * collateral_risk_adjustment
        risk_loaded_pure_premium = pure_premium_rate * risk_load_multiplier
        risk_load = risk_loaded_pure_premium - pure_premium_rate
        
        # 8. Expense and profit loads
        permissible_loss_ratio = 1 - self.base_expense_ratio - self.variable_expense_ratio - self.target_profit_margin
        
        # 9. Calculate indicated rate
        indicated_rate = risk_loaded_pure_premium / permissible_loss_ratio
        
        expense_load = indicated_rate * (self.base_expense_ratio + self.variable_expense_ratio)
        profit_load = indicated_rate * self.target_profit_margin
        
        # Confidence band
        uncertainty = (1 - credibility) * 0.20 + 0.05
        indicated_rate_low = indicated_rate * (1 - uncertainty)
        indicated_rate_high = indicated_rate * (1 + uncertainty)
        
        # Pricing floor
        pricing_floor = pure_premium_rate / permissible_loss_ratio
        
        # 10. Premium budget analysis
        annual_premium = indicated_rate * insured_exposure
        monthly_premium = annual_premium / 12
        
        budget_feasible = True
        budget_gap = None
        budget_adjusted_coverage = None
        budget_monthly = target_monthly_premium or max_monthly_premium
        
        if budget_monthly is not None and budget_monthly > 0:
            if monthly_premium <= budget_monthly:
                budget_feasible = True
                budget_gap = budget_monthly - monthly_premium  # Surplus
            else:
                budget_feasible = False
                budget_gap = monthly_premium - budget_monthly  # Shortfall
                
                # Calculate what coverage we can offer within budget
                # monthly_budget = rate * coverage / 12
                # coverage = monthly_budget * 12 / rate
                if indicated_rate > 0:
                    budget_adjusted_coverage = (budget_monthly * 12) / indicated_rate
                    budget_adjusted_coverage = min(budget_adjusted_coverage, insured_exposure)
        
        # 11. Capital and PML calculations
        pml_99, tvar_99 = self._calculate_pml(blended_pd, blended_lgd, insured_exposure)
        capital_required = pml_99 * self.capital_multiplier
        
        # 12. Loss drivers analysis (include collateral as a driver)
        loss_drivers = self._analyze_loss_drivers(submission, base_pd, base_lgd, cohort, collateral_coverage, collateral_discount)
        
        # 13. Decision logic
        decision, rationale, conditions = self._make_decision(
            indicated_rate=indicated_rate,
            pricing_floor=pricing_floor,
            blended_pd=blended_pd,
            blended_lgd=blended_lgd,
            credibility=credibility,
            loss_drivers=loss_drivers,
            portfolio_context=portfolio_context,
            budget_feasible=budget_feasible,
            collateral_coverage=collateral_coverage,
        )
        
        # 14. Data sufficiency assessment
        if cohort.loan_count >= self.full_credibility_standard:
            data_sufficiency = DataSufficiency.HIGH
        elif cohort.loan_count >= 100:
            data_sufficiency = DataSufficiency.MODERATE
        elif cohort.loan_count >= self.partial_credibility_min:
            data_sufficiency = DataSufficiency.LOW
        else:
            data_sufficiency = DataSufficiency.INSUFFICIENT
        
        return PricingResult(
            pure_premium=pure_premium_rate,
            risk_load=risk_load,
            expense_load=expense_load,
            profit_margin=profit_load,
            indicated_rate=indicated_rate,
            indicated_rate_low=indicated_rate_low,
            indicated_rate_high=indicated_rate_high,
            pricing_floor=pricing_floor,
            collateral_value=collateral_value,
            collateral_coverage_ratio=collateral_coverage,
            collateral_adjusted_lgd=collateral_adjusted_lgd,
            collateral_discount=collateral_discount,
            budget_monthly_premium=budget_monthly,
            budget_feasible=budget_feasible,
            budget_gap=budget_gap,
            budget_adjusted_coverage=budget_adjusted_coverage,
            data_sufficiency=data_sufficiency,
            credibility_factor=credibility,
            cohort_loan_count=cohort.loan_count,
            expected_loss_ratio=pure_premium_rate / indicated_rate if indicated_rate > 0 else 0,
            default_probability=blended_pd,
            loss_given_default=base_lgd,  # Report base LGD
            pml_99=pml_99,
            tvar_99=tvar_99,
            capital_required=capital_required,
            decision=decision,
            decision_rationale=rationale,
            required_conditions=conditions,
            loss_drivers=loss_drivers,
            cohort_match=cohort,
            model_version=self.model_version,
            dataset_version=self.dataset_version,
            assumptions={
                "base_expense_ratio": self.base_expense_ratio,
                "variable_expense_ratio": self.variable_expense_ratio,
                "target_profit_margin": self.target_profit_margin,
                "permissible_loss_ratio": permissible_loss_ratio,
                "cost_of_capital": self.cost_of_capital,
                "recovery_lag_months": 18,
                "trend_factor": 1.0,
                "collateral_haircut_applied": 1 - collateral_discount,
            },
            calculated_at=datetime.utcnow().isoformat(),
        )
    
    def _calculate_default_probability(
        self,
        naics: str,
        dscr: float,
        credit_score: int,
        business_age: int,
        equity_injection: float,
        term_months: int,
        vintage: int,
    ) -> float:
        """Calculate base default probability using empirical factors"""
        # Start with NAICS base rate
        base_rate = NAICS_DEFAULT_RATES.get(naics, 0.025)
        
        # DSCR adjustment (most important factor)
        if dscr >= 1.5:
            dscr_mult = 0.6
        elif dscr >= 1.25:
            dscr_mult = 0.8
        elif dscr >= 1.15:
            dscr_mult = 1.0
        elif dscr >= 1.0:
            dscr_mult = 1.5
        else:
            dscr_mult = 2.5
        
        # Credit score adjustment
        if credit_score >= 750:
            credit_mult = 0.7
        elif credit_score >= 700:
            credit_mult = 0.85
        elif credit_score >= 680:
            credit_mult = 1.0
        elif credit_score >= 650:
            credit_mult = 1.3
        else:
            credit_mult = 1.8
        
        # Business age adjustment (13.6% reduction per year per FOIA)
        age_mult = max(0.5, 1 - (business_age * 0.05))
        
        # Equity injection adjustment (18% reduction per 5% above 10%)
        equity_above_min = max(0, equity_injection - 0.10)
        equity_mult = max(0.6, 1 - (equity_above_min / 0.05) * 0.18)
        
        # Term adjustment (longer terms = lower annual default)
        if term_months >= 120:
            term_mult = 0.85
        elif term_months >= 84:
            term_mult = 0.95
        else:
            term_mult = 1.1
        
        # Vintage adjustment
        vintage_mult = VINTAGE_ADJUSTMENTS.get(vintage, 1.0)
        
        # Combine multiplicatively
        adjusted_pd = base_rate * dscr_mult * credit_mult * age_mult * equity_mult * term_mult * vintage_mult
        
        # Cap at reasonable bounds
        return max(0.005, min(0.15, adjusted_pd))
    
    def _calculate_lgd(
        self,
        collateral_type: str,
        guaranty_pct: float,
        loan_amount: float,
    ) -> float:
        """Calculate loss given default"""
        # Base LGD by collateral
        base_lgd = LGD_BY_COLLATERAL.get(collateral_type, 0.45)
        
        # SBA guaranty reduces effective LGD
        # But we're pricing the insurer's layer above SBA
        # So our LGD is on the unguaranteed portion
        unguaranteed_pct = 1 - guaranty_pct
        
        # Recovery timing discount (18 month avg recovery lag)
        recovery_discount = 0.95  # ~5% time value
        
        # Effective LGD
        effective_lgd = base_lgd * recovery_discount
        
        # Loan size adjustment (larger loans have slightly better recovery)
        if loan_amount >= 2000000:
            effective_lgd *= 0.90
        elif loan_amount >= 1000000:
            effective_lgd *= 0.95
        
        return max(0.15, min(0.85, effective_lgd))
    
    def _calculate_collateral_adjusted_lgd(
        self,
        loan_amount: float,
        base_lgd: float,
        collateral_items: List[Dict[str, Any]],
        total_collateral_value: float,
        collateral_type: str,
    ) -> Tuple[float, float, float, float]:
        """
        Calculate LGD adjusted for specific collateral value.
        
        Returns:
            (collateral_value, coverage_ratio, adjusted_lgd, discount_rate)
        """
        # Calculate total recoverable collateral value
        if collateral_items and len(collateral_items) > 0:
            # Sum up itemized collateral with recovery rates
            total_recoverable = 0
            total_market_value = 0
            
            for item in collateral_items:
                asset_type = item.get("asset_type", "other")
                market_value = item.get("estimated_value", 0)
                liquidation_value = item.get("liquidation_value")
                
                total_market_value += market_value
                
                if liquidation_value:
                    # Use provided liquidation value
                    total_recoverable += liquidation_value
                else:
                    # Apply standard recovery rate
                    recovery_rate = COLLATERAL_RECOVERY_RATES.get(asset_type, 0.30)
                    total_recoverable += market_value * recovery_rate
            
            collateral_value = total_market_value
            recoverable_value = total_recoverable
        elif total_collateral_value and total_collateral_value > 0:
            # Use total value with type-based recovery rate
            collateral_value = total_collateral_value
            recovery_rate = COLLATERAL_RECOVERY_RATES.get(collateral_type, 0.40)
            recoverable_value = total_collateral_value * recovery_rate
        else:
            # No specific collateral provided - use base LGD
            return (0, 0, base_lgd, 0)
        
        # Coverage ratio = Collateral / Loan Amount
        coverage_ratio = collateral_value / loan_amount if loan_amount > 0 else 0
        
        # Recoverable coverage = what we can actually recover / loan amount
        recoverable_coverage = recoverable_value / loan_amount if loan_amount > 0 else 0
        
        # Adjusted LGD = Base LGD * (1 - recoverable coverage)
        # If collateral covers 100% of loan with 50% recovery, we recover 50%, so LGD is halved
        # LGD can't go below floor even with excellent collateral
        lgd_reduction = min(recoverable_coverage, 0.80)  # Cap reduction at 80%
        adjusted_lgd = base_lgd * (1 - lgd_reduction)
        adjusted_lgd = max(0.10, adjusted_lgd)  # Floor at 10% LGD
        
        # Collateral discount = how much the premium is reduced
        # This is the percentage reduction in expected loss due to collateral
        if base_lgd > 0:
            collateral_discount = (base_lgd - adjusted_lgd) / base_lgd
        else:
            collateral_discount = 0
        
        return (collateral_value, coverage_ratio, adjusted_lgd, collateral_discount)
    
    def _find_cohort(self, submission: Dict[str, Any]) -> CohortMatch:
        """Find comparable historical loans"""
        # In production, this queries the actual loan database
        # Here we simulate based on submission characteristics
        
        naics = str(submission.get("naics_code", submission.get("industry", "99")))[:2]
        loan_amount = submission.get("loan_amount", 1000000)
        
        # Simulate cohort stats based on NAICS
        base_default = NAICS_DEFAULT_RATES.get(naics, 0.025)
        
        # Size bucket affects cohort
        if loan_amount < 500000:
            size_bucket = "small"
            count_mult = 1.5
            default_mult = 1.2
        elif loan_amount < 1500000:
            size_bucket = "medium"
            count_mult = 1.0
            default_mult = 1.0
        else:
            size_bucket = "large"
            count_mult = 0.7
            default_mult = 0.85
        
        # Simulated cohort
        loan_count = int(300 * count_mult * random.uniform(0.8, 1.2))
        avg_default = base_default * default_mult * random.uniform(0.9, 1.1)
        avg_lgd = 0.42 * random.uniform(0.9, 1.1)
        
        return CohortMatch(
            cohort_name=f"NAICS {naics} / {size_bucket.title()} Loans",
            loan_count=loan_count,
            avg_default_rate=avg_default,
            avg_lgd=avg_lgd,
            avg_loss_ratio=avg_default * avg_lgd,
            filters_applied={
                "naics_prefix": naics,
                "size_bucket": size_bucket,
                "vintage_range": "2020-2024",
            },
        )
    
    def _calculate_credibility(self, n: int) -> float:
        """
        Bühlmann credibility factor.
        
        Z = n / (n + k) where k is the credibility standard
        """
        k = self.full_credibility_standard
        if n < self.partial_credibility_min:
            return 0.0
        return n / (n + k)
    
    def _calculate_tail_load(
        self,
        pd: float,
        lgd: float,
        exposure: float
    ) -> float:
        """Calculate tail risk load based on loss distribution"""
        # Simplified tail load calculation
        # In production, use Monte Carlo simulation
        
        # Expected loss
        el = pd * lgd
        
        # Assume losses follow beta distribution
        # Tail load is based on 99th percentile excess
        
        # Variance approximation
        variance = pd * (1 - pd) * lgd * lgd
        std_dev = math.sqrt(variance)
        
        # 99th percentile (approx 2.33 std devs for normal)
        pct_99 = el + 2.33 * std_dev
        
        # Tail load = excess over expected / exposure
        tail_excess = max(0, pct_99 - el)
        
        return tail_excess * 0.3  # 30% of tail excess as load
    
    def _calculate_pml(
        self,
        pd: float,
        lgd: float,
        exposure: float
    ) -> Tuple[float, float]:
        """
        Calculate PML (99th percentile) and TVaR.
        
        Returns (PML_99, TVaR_99) as rates (not dollar amounts)
        """
        # Monte Carlo simulation (simplified)
        n_simulations = 10000
        losses = []
        
        for _ in range(n_simulations):
            # Simulate default
            if random.random() < pd:
                # Simulate severity with some variance
                severity = lgd * random.uniform(0.5, 1.5)
                losses.append(min(severity, 1.0))
            else:
                losses.append(0)
        
        losses.sort()
        
        # 99th percentile
        pml_99_idx = int(n_simulations * 0.99)
        pml_99 = losses[pml_99_idx]
        
        # TVaR (average of losses above 99th percentile)
        tail_losses = losses[pml_99_idx:]
        tvar_99 = sum(tail_losses) / len(tail_losses) if tail_losses else pml_99
        
        return pml_99, tvar_99
    
    def _analyze_loss_drivers(
        self,
        submission: Dict[str, Any],
        base_pd: float,
        lgd: float,
        cohort: CohortMatch,
        collateral_coverage: float = 0,
        collateral_discount: float = 0,
    ) -> List[LossDriver]:
        """Identify top factors driving risk"""
        drivers = []
        
        # Compare to cohort average
        cohort_pd = cohort.avg_default_rate
        pd_diff = base_pd - cohort_pd
        
        # COLLATERAL ANALYSIS (NEW)
        if collateral_coverage >= 1.5:
            drivers.append(LossDriver(
                factor="Collateral Coverage",
                impact=-0.35,
                description=f"Excellent {collateral_coverage*100:.0f}% collateral coverage ({collateral_discount*100:.0f}% LGD reduction)",
                vs_benchmark="significantly below average risk"
            ))
        elif collateral_coverage >= 1.0:
            drivers.append(LossDriver(
                factor="Collateral Coverage",
                impact=-0.25,
                description=f"Full {collateral_coverage*100:.0f}% collateral coverage ({collateral_discount*100:.0f}% LGD reduction)",
                vs_benchmark="below average risk"
            ))
        elif collateral_coverage >= 0.5:
            drivers.append(LossDriver(
                factor="Collateral Coverage",
                impact=-0.10,
                description=f"Partial {collateral_coverage*100:.0f}% collateral coverage",
                vs_benchmark="slightly below average risk"
            ))
        elif collateral_coverage < 0.25 and collateral_coverage > 0:
            drivers.append(LossDriver(
                factor="Collateral Coverage",
                impact=0.15,
                description=f"Weak {collateral_coverage*100:.0f}% collateral coverage",
                vs_benchmark="above average risk"
            ))
        elif collateral_coverage == 0:
            drivers.append(LossDriver(
                factor="Collateral Coverage",
                impact=0.20,
                description="No specific collateral pledged",
                vs_benchmark="above average risk"
            ))
        
        # DSCR analysis
        dscr = submission.get("dscr", 1.25)
        if dscr < 1.15:
            drivers.append(LossDriver(
                factor="DSCR",
                impact=0.3,
                description=f"DSCR of {dscr:.2f}x is below 1.15x threshold",
                vs_benchmark="above average risk"
            ))
        elif dscr >= 1.5:
            drivers.append(LossDriver(
                factor="DSCR",
                impact=-0.2,
                description=f"Strong DSCR of {dscr:.2f}x provides cushion",
                vs_benchmark="below average risk"
            ))
        
        # Credit score
        credit = submission.get("credit_score", 700)
        if credit < 680:
            drivers.append(LossDriver(
                factor="Credit Score",
                impact=0.2,
                description=f"Credit score of {credit} is below preferred threshold",
                vs_benchmark="above average risk"
            ))
        elif credit >= 750:
            drivers.append(LossDriver(
                factor="Credit Score",
                impact=-0.15,
                description=f"Excellent credit score of {credit}",
                vs_benchmark="below average risk"
            ))
        
        # Industry
        naics = str(submission.get("naics_code", submission.get("industry", "99")))[:2]
        industry_rate = NAICS_DEFAULT_RATES.get(naics, 0.025)
        if industry_rate > 0.03:
            drivers.append(LossDriver(
                factor="Industry",
                impact=0.25,
                description=f"NAICS {naics} has elevated historical default rate",
                vs_benchmark="above average risk"
            ))
        elif industry_rate < 0.018:
            drivers.append(LossDriver(
                factor="Industry",
                impact=-0.15,
                description=f"NAICS {naics} has favorable historical performance",
                vs_benchmark="below average risk"
            ))
        
        # Business age
        age = submission.get("business_age_years", 5)
        if age < 3:
            drivers.append(LossDriver(
                factor="Business Age",
                impact=0.2,
                description=f"Business age of {age} years increases risk",
                vs_benchmark="above average risk"
            ))
        elif age >= 10:
            drivers.append(LossDriver(
                factor="Business Age",
                impact=-0.15,
                description=f"Established business with {age} years history",
                vs_benchmark="below average risk"
            ))
        
        # Equity injection
        equity = submission.get("equity_injection_pct", 0.10)
        if equity >= 0.25:
            drivers.append(LossDriver(
                factor="Equity Injection",
                impact=-0.2,
                description=f"Strong {equity*100:.0f}% equity injection",
                vs_benchmark="below average risk"
            ))
        elif equity < 0.10:
            drivers.append(LossDriver(
                factor="Equity Injection",
                impact=0.15,
                description=f"Low {equity*100:.0f}% equity injection",
                vs_benchmark="above average risk"
            ))
        
        # Sort by absolute impact
        drivers.sort(key=lambda x: abs(x.impact), reverse=True)
        
        return drivers[:6]  # Top 6 (increased to include collateral)
    
    def _make_decision(
        self,
        indicated_rate: float,
        pricing_floor: float,
        blended_pd: float,
        blended_lgd: float,
        credibility: float,
        loss_drivers: List[LossDriver],
        portfolio_context: Optional[Dict[str, Any]],
        budget_feasible: bool = True,
        collateral_coverage: float = 0,
    ) -> Tuple[RiskDecision, str, List[str]]:
        """Make underwriting decision with rationale"""
        conditions = []
        
        # Hard decline thresholds
        if blended_pd > 0.10:
            return (
                RiskDecision.DECLINE,
                f"Default probability of {blended_pd*100:.1f}% exceeds 10% threshold",
                []
            )
        
        if blended_pd * blended_lgd > 0.05:
            return (
                RiskDecision.DECLINE,
                f"Expected loss rate of {blended_pd*blended_lgd*100:.2f}% exceeds 5% threshold",
                []
            )
        
        # Collateral requirements
        if collateral_coverage < 0.25:
            conditions.append("Additional collateral recommended (coverage below 25%)")
        
        # Budget feasibility
        if not budget_feasible:
            conditions.append("Indicated premium exceeds borrower's stated budget - consider reduced coverage")
        
        # Refer thresholds
        if credibility < 0.3:
            conditions.append("Manual actuarial review required due to limited cohort data")
            
        if blended_pd > 0.05:
            conditions.append(f"Minimum rate of {pricing_floor*100:.2f}% required")
        
        # Check for multiple negative drivers
        negative_drivers = [d for d in loss_drivers if d.impact > 0.15]
        if len(negative_drivers) >= 3:
            conditions.append("Enhanced monitoring covenant required")
        
        # Collateral can offset some risk factors
        if collateral_coverage >= 1.0 and len(negative_drivers) >= 2:
            # Strong collateral mitigates some concerns
            conditions.append("Strong collateral coverage offsets elevated risk factors")
        
        # Portfolio concentration checks
        if portfolio_context:
            # Would check NAICS, geography, lender concentrations
            pass
        
        # Decision logic
        # Excellent collateral can enable acceptance even with some concerns
        if collateral_coverage >= 1.5 and blended_pd <= 0.05:
            return (
                RiskDecision.ACCEPT,
                f"Strong collateral coverage ({collateral_coverage*100:.0f}%) supports acceptance",
                conditions
            )
        
        if len(conditions) >= 3 or credibility < 0.2:
            return (
                RiskDecision.REFER,
                "Multiple risk factors require senior underwriter review",
                conditions
            )
        
        if not budget_feasible and collateral_coverage < 0.5:
            return (
                RiskDecision.REFER,
                "Budget constraints with weak collateral require review",
                conditions
            )
        
        if conditions:
            return (
                RiskDecision.ACCEPT,
                "Acceptable risk with conditions",
                conditions
            )
        
        return (
            RiskDecision.ACCEPT,
            "Risk profile within acceptable parameters",
            []
        )
    
    def run_structure_scenarios(
        self,
        submission: Dict[str, Any],
        scenarios: List[Dict[str, Any]]
    ) -> List[StructureScenario]:
        """
        Run what-if scenarios for different policy structures.
        
        Helps optimize attachment, limit, coinsurance.
        """
        results = []
        
        for scenario in scenarios:
            pricing = self.price_submission(submission, scenario)
            
            results.append(StructureScenario(
                attachment_point=scenario.get("attachment_point", 0),
                limit=scenario.get("limit", 0),
                coinsurance=scenario.get("coinsurance", 1.0),
                expected_loss=pricing.pure_premium,
                pml_99=pricing.pml_99,
                indicated_rate=pricing.indicated_rate,
                capital_load=pricing.capital_required,
                roi=(pricing.indicated_rate - pricing.pure_premium - pricing.expense_load) / pricing.capital_required if pricing.capital_required > 0 else 0,
            ))
        
        return results
    
    def calculate_portfolio_metrics(
        self,
        loans: List[Dict[str, Any]],
        policy_terms: Dict[str, Any]
    ) -> PortfolioMetrics:
        """Calculate aggregate portfolio metrics"""
        total_exposure = 0
        total_premium = 0
        total_expected_loss = 0
        
        naics_exposure = {}
        geography_exposure = {}
        lender_exposure = {}
        
        for loan in loans:
            exposure = loan.get("loan_amount", 0) * policy_terms.get("coinsurance", 1.0)
            total_exposure += exposure
            
            pricing = self.price_submission(loan, policy_terms)
            total_premium += pricing.indicated_rate * exposure
            total_expected_loss += pricing.pure_premium * exposure
            
            # Track concentrations
            naics = str(loan.get("naics_code", "99"))[:2]
            naics_exposure[naics] = naics_exposure.get(naics, 0) + exposure
            
            geo = loan.get("state", "Unknown")
            geography_exposure[geo] = geography_exposure.get(geo, 0) + exposure
            
            lender = loan.get("lender_id", "Unknown")
            lender_exposure[lender] = lender_exposure.get(lender, 0) + exposure
        
        # Concentration flags
        concentration_flags = []
        for naics, exp in naics_exposure.items():
            if exp / total_exposure > 0.20:
                concentration_flags.append(f"NAICS {naics} exceeds 20% ({exp/total_exposure*100:.1f}%)")
        
        for geo, exp in geography_exposure.items():
            if exp / total_exposure > 0.25:
                concentration_flags.append(f"{geo} exceeds 25% ({exp/total_exposure*100:.1f}%)")
        
        for lender, exp in lender_exposure.items():
            if exp / total_exposure > 0.15:
                concentration_flags.append(f"Lender concentration exceeds 15%")
        
        # PML at portfolio level (assumes some correlation)
        # Simplified: aggregate PML with diversification benefit
        individual_pmls = [self.price_submission(l, policy_terms).pml_99 * l.get("loan_amount", 0) for l in loans]
        undiversified_pml = sum(individual_pmls)
        diversification_benefit = 0.7  # 30% diversification benefit
        portfolio_pml = undiversified_pml * diversification_benefit
        
        return PortfolioMetrics(
            total_exposure=total_exposure,
            total_premium=total_premium,
            expected_loss=total_expected_loss,
            expected_loss_ratio=total_expected_loss / total_premium if total_premium > 0 else 0,
            pml_99=portfolio_pml,
            tvar_99=portfolio_pml * 1.2,  # Simplified
            capital_usage=portfolio_pml * self.capital_multiplier,
            concentration_flags=concentration_flags,
            reinsurance_leverage=0,  # Would calculate based on treaties
        )


# Convenience function
def price_loan(submission: Dict[str, Any], policy_terms: Dict[str, Any]) -> PricingResult:
    """Quick pricing for a single loan"""
    engine = ActuarialPricingEngine()
    return engine.price_submission(submission, policy_terms)
