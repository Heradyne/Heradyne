"""
Heradyne AI Agent - Risk Scoring Engine
Evaluates deals across 62 variables in 5 categories.
"""
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field
from datetime import datetime

from app.services.ai_agent.variables import (
    Variable, VariableCategory, CATEGORY_WEIGHTS, RISK_TIERS, INDUSTRY_RISK_TIERS,
    get_all_underwriting_variables, get_category_max_points
)


@dataclass
class VariableScore:
    variable_id: str
    variable_name: str
    category: VariableCategory
    raw_value: Any
    score: float
    max_score: float
    percentage: float
    flag: Optional[str] = None
    notes: str = ""


@dataclass
class CategoryScore:
    category: VariableCategory
    weight: float
    raw_score: float
    max_score: float
    weighted_score: float
    percentage: float
    variable_scores: List[VariableScore] = field(default_factory=list)
    flags: List[str] = field(default_factory=list)


@dataclass
class RiskScoreResult:
    composite_score: float
    tier: str
    tier_display: str
    recommended_premium: float
    premium_range: Tuple[float, float]
    expected_annual_default_rate: float
    foia_benchmark_rate: float
    decision: str
    monitoring_frequency: str
    category_scores: Dict[str, CategoryScore] = field(default_factory=dict)
    hard_declines: List[str] = field(default_factory=list)
    risk_flags: List[str] = field(default_factory=list)
    positive_factors: List[str] = field(default_factory=list)
    segment_avg_score: float = 0.0
    percentile_in_segment: float = 0.0
    variables_evaluated: int = 0
    variables_missing: List[str] = field(default_factory=list)
    scored_at: str = ""


class RiskScoringEngine:
    """Main scoring engine for pre-policy underwriting."""
    
    def __init__(self):
        self.variables = get_all_underwriting_variables()
        self.category_max_points = get_category_max_points()
    
    def score_deal(self, deal_data: Dict[str, Any]) -> RiskScoreResult:
        """Score a deal across all 62 underwriting variables."""
        hard_declines = self._check_hard_declines(deal_data)
        if hard_declines:
            return self._create_decline_result(deal_data, hard_declines)
        
        category_scores = {}
        all_flags = []
        all_positives = []
        
        for category in [VariableCategory.STRUCTURAL, VariableCategory.GEOGRAPHIC,
                        VariableCategory.FINANCIAL, VariableCategory.OPERATOR, VariableCategory.ASSET]:
            cat_score = self._score_category(category, deal_data)
            category_scores[category.value] = cat_score
            all_flags.extend(cat_score.flags)
            for vs in cat_score.variable_scores:
                if vs.flag == 'optimal' and vs.percentage >= 0.8:
                    all_positives.append(f"{vs.variable_name}: {vs.notes}")
        
        composite_score = sum(cat_score.weighted_score for cat_score in category_scores.values())
        composite_score = min(100, max(0, composite_score))
        
        tier, tier_info = self._determine_tier(composite_score)
        foia_rate = self._get_foia_benchmark(deal_data)
        premium_range = tier_info['premium_range'] or (0, 0)
        recommended_premium = self._calculate_premium(composite_score, tier, foia_rate, deal_data)
        missing = self._get_missing_variables(deal_data)
        
        return RiskScoreResult(
            composite_score=round(composite_score, 1),
            tier=tier,
            tier_display=tier.replace('_', ' ').title(),
            recommended_premium=recommended_premium,
            premium_range=premium_range,
            expected_annual_default_rate=tier_info['expected_default'],
            foia_benchmark_rate=foia_rate,
            decision=tier_info['decision'],
            monitoring_frequency=tier_info['monitoring_frequency'] or 'quarterly',
            category_scores=category_scores,
            hard_declines=[],
            risk_flags=all_flags[:10],
            positive_factors=all_positives[:5],
            segment_avg_score=68.0,
            percentile_in_segment=self._calculate_percentile(composite_score, deal_data),
            variables_evaluated=62 - len(missing),
            variables_missing=missing,
            scored_at=datetime.utcnow().isoformat()
        )
    
    def _check_hard_declines(self, data: Dict) -> List[str]:
        declines = []
        if data.get('loan_amount', 0) < 500000:
            declines.append(f"Loan amount ${data.get('loan_amount', 0):,.0f} below $500K minimum")
        if data.get('dscr', 1.5) < 1.0:
            declines.append(f"DSCR {data.get('dscr', 0):.2f}x below 1.0x minimum")
        if data.get('borrower_credit_score', 700) < 620:
            declines.append(f"Credit score {data.get('borrower_credit_score', 0)} below 620 minimum")
        return declines
    
    def _score_category(self, category: VariableCategory, data: Dict) -> CategoryScore:
        variables = [v for v in self.variables if v.category == category]
        variable_scores = []
        flags = []
        
        for var in variables:
            vs = self._score_variable(var, data)
            variable_scores.append(vs)
            if vs.flag == 'reject':
                flags.append(f"[CRITICAL] {var.name}: {vs.notes}")
            elif vs.flag == 'caution':
                flags.append(f"[CAUTION] {var.name}: {vs.notes}")
        
        raw_score = sum(vs.score for vs in variable_scores)
        max_score = self.category_max_points.get(category, 25)
        percentage = raw_score / max_score if max_score > 0 else 0
        weight = CATEGORY_WEIGHTS.get(category, 0.2)
        weighted_score = percentage * weight * 100
        
        return CategoryScore(
            category=category, weight=weight, raw_score=raw_score,
            max_score=max_score, weighted_score=weighted_score,
            percentage=percentage, variable_scores=variable_scores, flags=flags
        )
    
    def _score_variable(self, var: Variable, data: Dict) -> VariableScore:
        raw_value = data.get(var.id)
        if raw_value is None:
            return VariableScore(var.id, var.name, var.category, None, 0.0, var.max_points, 0.0, None, "Data not provided")
        
        score, flag, notes = self._apply_scoring_logic(var, raw_value, data)
        return VariableScore(var.id, var.name, var.category, raw_value, score, var.max_points, score / var.max_points if var.max_points > 0 else 0, flag, notes)
    
    def _apply_scoring_logic(self, var: Variable, value: Any, data: Dict) -> Tuple[float, str, str]:
        max_pts = var.max_points
        
        if var.id == 'loan_size':
            if value >= 2000000: return max_pts, 'optimal', f"${value:,.0f} - Large loan"
            elif value >= 500000: return max_pts * 0.7, 'optimal', f"${value:,.0f} - Acceptable"
            else: return 0, 'reject', f"${value:,.0f} - Below minimum"
        
        elif var.id == 'dscr':
            if value >= 1.50: return max_pts, 'optimal', f"{value:.2f}x - Excellent"
            elif value >= 1.35: return max_pts * 0.8, 'optimal', f"{value:.2f}x - Strong"
            elif value >= 1.20: return max_pts * 0.5, 'caution', f"{value:.2f}x - Acceptable"
            else: return max_pts * 0.2, 'reject', f"{value:.2f}x - Marginal"
        
        elif var.id == 'borrower_credit_score':
            if value >= 750: return max_pts, 'optimal', f"Score {value} - Excellent"
            elif value >= 720: return max_pts * 0.85, 'optimal', f"Score {value} - Very good"
            elif value >= 680: return max_pts * 0.65, 'optimal', f"Score {value} - Good"
            elif value >= 660: return max_pts * 0.4, 'caution', f"Score {value} - Fair"
            else: return max_pts * 0.1, 'reject', f"Score {value} - Below threshold"
        
        elif var.id == 'equity_injection':
            if value >= 25: return max_pts, 'optimal', f"{value}% equity - Strong"
            elif value >= 20: return max_pts * 0.8, 'optimal', f"{value}% equity - Good"
            elif value >= 10: return max_pts * 0.4, 'caution', f"{value}% equity - Minimum"
            else: return 0, 'reject', f"{value}% equity - Below minimum"
        
        elif var.id == 'naics_industry':
            tier = self._get_industry_tier(value)
            if tier == 1: return max_pts, 'optimal', f"NAICS {value} - Tier 1"
            elif tier == 2: return max_pts * 0.75, 'optimal', f"NAICS {value} - Tier 2"
            elif tier == 3: return max_pts * 0.5, 'caution', f"NAICS {value} - Tier 3"
            else: return max_pts * 0.25, 'reject', f"NAICS {value} - Tier 4"
        
        # Default scoring
        return max_pts * 0.5, "caution", str(value)
    
    def _get_industry_tier(self, naics_code: str) -> int:
        naics_str = str(naics_code)[:2]
        for tier_num, (tier_name, tier_info) in enumerate(INDUSTRY_RISK_TIERS.items(), 1):
            if naics_str in tier_info['naics_prefixes']:
                return tier_num
        return 3
    
    def _determine_tier(self, score: float) -> Tuple[str, Dict]:
        for tier_name, tier_info in RISK_TIERS.items():
            min_score, max_score = tier_info['score_range']
            if min_score <= score <= max_score:
                return tier_name, tier_info
        return 'decline', RISK_TIERS['decline']
    
    def _calculate_premium(self, score: float, tier: str, foia_rate: float, data: Dict) -> float:
        tier_info = RISK_TIERS.get(tier, RISK_TIERS['elevated'])
        if not tier_info['premium_range']: return 0.0
        min_prem, max_prem = tier_info['premium_range']
        tier_min, tier_max = tier_info['score_range']
        score_pct = (score - tier_min) / (tier_max - tier_min) if tier_max > tier_min else 0.5
        premium = max_prem - (score_pct * (max_prem - min_prem))
        if foia_rate > 0.02: premium += 0.0025
        return round(premium, 4)
    
    def _get_foia_benchmark(self, data: Dict) -> float:
        naics = str(data.get('naics_industry', ''))[:2]
        tier = self._get_industry_tier(naics)
        base_rates = {1: 0.015, 2: 0.025, 3: 0.035, 4: 0.050}
        rate = base_rates.get(tier, 0.030)
        if data.get('loan_amount', 0) >= 2000000: rate *= 0.6
        elif data.get('loan_amount', 0) >= 1000000: rate *= 0.8
        if data.get('loan_purpose') in ['acquisition', 'change_of_ownership']: rate *= 0.6
        return round(rate, 4)
    
    def _calculate_percentile(self, score: float, data: Dict) -> float:
        z_score = (score - 68) / 12
        return min(99, max(1, round(50 + (z_score * 20))))
    
    def _get_missing_variables(self, data: Dict) -> List[str]:
        return [var.id for var in self.variables if var.id not in data or data[var.id] is None]
    
    def _create_decline_result(self, data: Dict, declines: List[str]) -> RiskScoreResult:
        return RiskScoreResult(
            composite_score=0, tier='decline', tier_display='Decline',
            recommended_premium=0, premium_range=(0, 0),
            expected_annual_default_rate=0.05, foia_benchmark_rate=self._get_foia_benchmark(data),
            decision='auto_decline', monitoring_frequency='none',
            hard_declines=declines, scored_at=datetime.utcnow().isoformat()
        )
