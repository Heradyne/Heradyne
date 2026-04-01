"""
Heradyne Matching Engine

Matches deals to lender and insurer policies based on constraints.
Generates "approve-if" scenarios for near-miss deals.
Supports auto-accept/reject and counter-offer generation.

DISCLAIMER: This matching is informational only. 
Heradyne does not lend, guarantee, or insure.
"""

from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from app.models.deal import Deal, DealRiskReport, DealMatch
from app.models.policy import LenderPolicy, InsurerPolicy


@dataclass
class ConstraintCheck:
    """Result of checking a single constraint."""
    constraint: str
    required: Any
    actual: Any
    met: bool
    reason: str


@dataclass
class PolicyMatch:
    """Result of matching a deal to a policy."""
    policy_id: int
    policy_name: str
    policy_type: str
    constraints_met: List[ConstraintCheck]
    constraints_failed: List[ConstraintCheck]
    is_full_match: bool
    match_score: float
    # Auto-decision info
    policy: Any = None  # Reference to policy for auto-decision thresholds


@dataclass
class ApproveIfScenario:
    """A potential restructuring scenario to meet constraints."""
    scenario_id: int
    description: str
    adjustments: Dict[str, Any]
    new_constraints_met: List[str]
    constraints_still_failed: List[str]
    feasibility_score: float


@dataclass
class CounterOffer:
    """A counter-offer generated for the borrower."""
    original_values: Dict[str, Any]
    proposed_values: Dict[str, Any]
    adjustments: List[Dict[str, Any]]
    reason: str
    expected_match_score: float
    expires_in_days: int = 7


class MatchingService:
    """Service for matching deals to lender and insurer policies."""
    
    def __init__(self, db: Session):
        self.db = db
    

    def _check_uw_constraints(self, risk_report, policy) -> list:
        from app.models.deal import DealRiskReport
        from app.services.matching import ConstraintCheck
        failed = []
        if getattr(policy, 'min_health_score', None) and getattr(risk_report, 'health_score', None) is not None:
            if risk_report.health_score < policy.min_health_score:
                failed.append(ConstraintCheck(constraint='min_health_score', required=policy.min_health_score, actual=risk_report.health_score, met=False, reason=f'Health score {risk_report.health_score:.0f} below minimum {policy.min_health_score:.0f}'))
        if getattr(policy, 'min_pdscr', None) and getattr(risk_report, 'pdscr', None) is not None:
            if risk_report.pdscr < policy.min_pdscr:
                failed.append(ConstraintCheck(constraint='min_pdscr', required=policy.min_pdscr, actual=risk_report.pdscr, met=False, reason=f'PDSCR {risk_report.pdscr:.2f} below minimum {policy.min_pdscr:.2f}'))
        if getattr(policy, 'require_sba_eligible', None) and getattr(risk_report, 'sba_eligible', None) is False:
            failed.append(ConstraintCheck(constraint='require_sba_eligible', required=True, actual=False, met=False, reason='Deal is not SBA 7(a) eligible'))
        return failed

    def match_deal(
        self, 
        deal: Deal, 
        risk_report: DealRiskReport,
        generate_scenarios: bool = True,
        apply_auto_decisions: bool = True
    ) -> Dict[str, Any]:
        """
        Match a deal against all active lender and insurer policies.
        
        Returns match results and optional approve-if scenarios.
        Applies auto-decisions based on policy thresholds.
        """
        # Get active policies
        lender_policies = self.db.query(LenderPolicy).filter(
            LenderPolicy.is_active == True
        ).all()
        
        insurer_policies = self.db.query(InsurerPolicy).filter(
            InsurerPolicy.is_active == True
        ).all()
        
        # Match against lender policies
        lender_matches = []
        for policy in lender_policies:
            match_result = self._match_lender_policy(deal, risk_report, policy)
            match_result.policy = policy  # Store policy reference
            lender_matches.append(match_result)
        
        # Match against insurer policies
        insurer_matches = []
        for policy in insurer_policies:
            match_result = self._match_insurer_policy(deal, risk_report, policy)
            match_result.policy = policy  # Store policy reference
            insurer_matches.append(match_result)
        
        # Sort by match score (full matches first, then by score)
        lender_matches.sort(key=lambda x: (-int(x.is_full_match), -x.match_score))
        insurer_matches.sort(key=lambda x: (-int(x.is_full_match), -x.match_score))
        
        # Generate approve-if scenarios for near-misses
        scenarios = []
        if generate_scenarios:
            scenarios = self._generate_scenarios(deal, risk_report, lender_matches, insurer_matches)
        
        # Save matches to database with auto-decisions
        auto_decisions_made, counter_offers_generated = self._save_matches(
            deal, risk_report, lender_matches, insurer_matches, scenarios, apply_auto_decisions
        )
        
        return {
            "deal_id": deal.id,
            "deal_name": deal.name,
            "total_lender_matches": len([m for m in lender_matches if m.is_full_match]),
            "total_insurer_matches": len([m for m in insurer_matches if m.is_full_match]),
            "lender_matches": [self._match_to_dict(m) for m in lender_matches],
            "insurer_matches": [self._match_to_dict(m) for m in insurer_matches],
            "approve_if_scenarios": [self._scenario_to_dict(s) for s in scenarios],
            "auto_decisions_made": auto_decisions_made,
            "counter_offers_generated": counter_offers_generated,
            "disclaimer": (
                "INFORMATIONAL ONLY: These matches are for informational purposes. "
                "Heradyne does not lend, guarantee, or insure. Final terms require "
                "direct engagement with lenders/insurers."
            )
        }
    
    def _match_lender_policy(
        self, 
        deal: Deal, 
        report: DealRiskReport, 
        policy: LenderPolicy
    ) -> PolicyMatch:
        """Match a deal against a lender policy."""
        constraints_met = []
        constraints_failed = []
        
        # Check loan size
        if policy.min_loan_size is not None:
            check = ConstraintCheck(
                constraint="min_loan_size",
                required=policy.min_loan_size,
                actual=deal.loan_amount_requested,
                met=deal.loan_amount_requested >= policy.min_loan_size,
                reason=f"Loan ${deal.loan_amount_requested:,.0f} vs min ${policy.min_loan_size:,.0f}"
            )
            (constraints_met if check.met else constraints_failed).append(check)
        
        if policy.max_loan_size is not None:
            check = ConstraintCheck(
                constraint="max_loan_size",
                required=policy.max_loan_size,
                actual=deal.loan_amount_requested,
                met=deal.loan_amount_requested <= policy.max_loan_size,
                reason=f"Loan ${deal.loan_amount_requested:,.0f} vs max ${policy.max_loan_size:,.0f}"
            )
            (constraints_met if check.met else constraints_failed).append(check)
        
        # Check DSCR
        if policy.min_dscr is not None and report.dscr_base is not None:
            check = ConstraintCheck(
                constraint="min_dscr",
                required=policy.min_dscr,
                actual=report.dscr_base,
                met=report.dscr_base >= policy.min_dscr,
                reason=f"DSCR {report.dscr_base:.2f}x vs min {policy.min_dscr:.2f}x"
            )
            (constraints_met if check.met else constraints_failed).append(check)
        
        # Check PD
        if policy.max_pd is not None and report.annual_pd is not None:
            check = ConstraintCheck(
                constraint="max_pd",
                required=policy.max_pd,
                actual=report.annual_pd,
                met=report.annual_pd <= policy.max_pd,
                reason=f"PD {report.annual_pd:.2%} vs max {policy.max_pd:.2%}"
            )
            (constraints_met if check.met else constraints_failed).append(check)
        
        # Check leverage
        if policy.max_leverage is not None and report.normalized_ebitda:
            leverage = deal.loan_amount_requested / report.normalized_ebitda
            check = ConstraintCheck(
                constraint="max_leverage",
                required=policy.max_leverage,
                actual=leverage,
                met=leverage <= policy.max_leverage,
                reason=f"Leverage {leverage:.1f}x vs max {policy.max_leverage:.1f}x"
            )
            (constraints_met if check.met else constraints_failed).append(check)
        
        # Check collateral coverage
        if policy.min_collateral_coverage is not None and report.collateral_coverage is not None:
            check = ConstraintCheck(
                constraint="min_collateral_coverage",
                required=policy.min_collateral_coverage,
                actual=report.collateral_coverage,
                met=report.collateral_coverage >= policy.min_collateral_coverage,
                reason=f"Coverage {report.collateral_coverage:.1%} vs min {policy.min_collateral_coverage:.1%}"
            )
            (constraints_met if check.met else constraints_failed).append(check)
        
        # Check industry
        industry_lower = deal.industry.lower()
        if policy.allowed_industries:
            allowed = [i.lower() for i in policy.allowed_industries]
            check = ConstraintCheck(
                constraint="allowed_industries",
                required=policy.allowed_industries,
                actual=deal.industry,
                met=industry_lower in allowed,
                reason=f"Industry '{deal.industry}' in allowed list" if industry_lower in allowed 
                       else f"Industry '{deal.industry}' not in allowed list"
            )
            (constraints_met if check.met else constraints_failed).append(check)
        
        if policy.excluded_industries:
            excluded = [i.lower() for i in policy.excluded_industries]
            check = ConstraintCheck(
                constraint="excluded_industries",
                required=policy.excluded_industries,
                actual=deal.industry,
                met=industry_lower not in excluded,
                reason=f"Industry '{deal.industry}' not excluded" if industry_lower not in excluded
                       else f"Industry '{deal.industry}' is excluded"
            )
            (constraints_met if check.met else constraints_failed).append(check)
        
        # Check term
        if policy.min_term_months is not None:
            check = ConstraintCheck(
                constraint="min_term_months",
                required=policy.min_term_months,
                actual=deal.loan_term_months,
                met=deal.loan_term_months >= policy.min_term_months,
                reason=f"Term {deal.loan_term_months} months vs min {policy.min_term_months}"
            )
            (constraints_met if check.met else constraints_failed).append(check)
        
        if policy.max_term_months is not None:
            check = ConstraintCheck(
                constraint="max_term_months",
                required=policy.max_term_months,
                actual=deal.loan_term_months,
                met=deal.loan_term_months <= policy.max_term_months,
                reason=f"Term {deal.loan_term_months} months vs max {policy.max_term_months}"
            )
            (constraints_met if check.met else constraints_failed).append(check)
        
        # Check deal type
        if policy.allowed_deal_types:
            allowed = [t.lower() for t in policy.allowed_deal_types]
            check = ConstraintCheck(
                constraint="allowed_deal_types",
                required=policy.allowed_deal_types,
                actual=deal.deal_type.value,
                met=deal.deal_type.value.lower() in allowed,
                reason=f"Deal type '{deal.deal_type.value}' allowed" if deal.deal_type.value.lower() in allowed
                       else f"Deal type '{deal.deal_type.value}' not allowed"
            )
            (constraints_met if check.met else constraints_failed).append(check)
        
        # Calculate match score
        total_constraints = len(constraints_met) + len(constraints_failed)
        if total_constraints > 0:
            match_score = len(constraints_met) / total_constraints
        else:
            match_score = 1.0  # No constraints = full match
        
        is_full_match = len(constraints_failed) == 0
        
        return PolicyMatch(
            policy_id=policy.id,
            policy_name=policy.name,
            policy_type="lender",
            constraints_met=constraints_met,
            constraints_failed=constraints_failed,
            is_full_match=is_full_match,
            match_score=match_score
        )
    
    def _match_insurer_policy(
        self, 
        deal: Deal, 
        report: DealRiskReport, 
        policy: InsurerPolicy
    ) -> PolicyMatch:
        """Match a deal against an insurer policy."""
        constraints_met = []
        constraints_failed = []
        
        # Calculate expected loss (PD * LGD)
        # Assume LGD of 40% for simplicity
        lgd = 0.40
        if report.annual_pd:
            expected_loss = report.annual_pd * lgd
        else:
            expected_loss = None
        
        if policy.max_expected_loss is not None and expected_loss is not None:
            check = ConstraintCheck(
                constraint="max_expected_loss",
                required=policy.max_expected_loss,
                actual=expected_loss,
                met=expected_loss <= policy.max_expected_loss,
                reason=f"Expected loss {expected_loss:.2%} vs max {policy.max_expected_loss:.2%}"
            )
            (constraints_met if check.met else constraints_failed).append(check)
        
        # Check coverage amount
        coverage_amount = deal.loan_amount_requested * (report.recommended_guarantee_pct or 0.60)
        
        if policy.min_coverage_amount is not None:
            check = ConstraintCheck(
                constraint="min_coverage_amount",
                required=policy.min_coverage_amount,
                actual=coverage_amount,
                met=coverage_amount >= policy.min_coverage_amount,
                reason=f"Coverage ${coverage_amount:,.0f} vs min ${policy.min_coverage_amount:,.0f}"
            )
            (constraints_met if check.met else constraints_failed).append(check)
        
        if policy.max_coverage_amount is not None:
            check = ConstraintCheck(
                constraint="max_coverage_amount",
                required=policy.max_coverage_amount,
                actual=coverage_amount,
                met=coverage_amount <= policy.max_coverage_amount,
                reason=f"Coverage ${coverage_amount:,.0f} vs max ${policy.max_coverage_amount:,.0f}"
            )
            (constraints_met if check.met else constraints_failed).append(check)
        
        # Check industry
        industry_lower = deal.industry.lower()
        if policy.allowed_industries:
            allowed = [i.lower() for i in policy.allowed_industries]
            check = ConstraintCheck(
                constraint="allowed_industries",
                required=policy.allowed_industries,
                actual=deal.industry,
                met=industry_lower in allowed,
                reason=f"Industry '{deal.industry}' allowed" if industry_lower in allowed
                       else f"Industry '{deal.industry}' not allowed"
            )
            (constraints_met if check.met else constraints_failed).append(check)
        
        if policy.excluded_industries:
            excluded = [i.lower() for i in policy.excluded_industries]
            check = ConstraintCheck(
                constraint="excluded_industries",
                required=policy.excluded_industries,
                actual=deal.industry,
                met=industry_lower not in excluded,
                reason=f"Industry '{deal.industry}' not excluded" if industry_lower not in excluded
                       else f"Industry '{deal.industry}' is excluded"
            )
            (constraints_met if check.met else constraints_failed).append(check)
        
        # Check deal type
        if policy.allowed_deal_types:
            allowed = [t.lower() for t in policy.allowed_deal_types]
            check = ConstraintCheck(
                constraint="allowed_deal_types",
                required=policy.allowed_deal_types,
                actual=deal.deal_type.value,
                met=deal.deal_type.value.lower() in allowed,
                reason=f"Deal type '{deal.deal_type.value}' allowed" if deal.deal_type.value.lower() in allowed
                       else f"Deal type '{deal.deal_type.value}' not allowed"
            )
            (constraints_met if check.met else constraints_failed).append(check)
        
        # Calculate match score
        total_constraints = len(constraints_met) + len(constraints_failed)
        if total_constraints > 0:
            match_score = len(constraints_met) / total_constraints
        else:
            match_score = 1.0
        
        is_full_match = len(constraints_failed) == 0
        
        return PolicyMatch(
            policy_id=policy.id,
            policy_name=policy.name,
            policy_type="insurer",
            constraints_met=constraints_met,
            constraints_failed=constraints_failed,
            is_full_match=is_full_match,
            match_score=match_score
        )
    
    def _generate_scenarios(
        self,
        deal: Deal,
        report: DealRiskReport,
        lender_matches: List[PolicyMatch],
        insurer_matches: List[PolicyMatch]
    ) -> List[ApproveIfScenario]:
        """Generate approve-if scenarios for near-miss matches."""
        scenarios = []
        scenario_id = 0
        
        # Focus on near-miss matches (score > 0.5 but not full match)
        near_misses = [
            m for m in lender_matches + insurer_matches 
            if not m.is_full_match and m.match_score >= 0.5
        ]
        
        for match in near_misses[:3]:  # Limit to top 3 near-misses
            failed_constraints = match.constraints_failed
            
            for constraint in failed_constraints:
                scenario_id += 1
                scenario = self._generate_scenario_for_constraint(
                    scenario_id, deal, report, match, constraint
                )
                if scenario:
                    scenarios.append(scenario)
        
        # Sort by feasibility and limit to 3
        scenarios.sort(key=lambda x: -x.feasibility_score)
        return scenarios[:3]
    
    def _generate_scenario_for_constraint(
        self,
        scenario_id: int,
        deal: Deal,
        report: DealRiskReport,
        match: PolicyMatch,
        failed_constraint: ConstraintCheck
    ) -> Optional[ApproveIfScenario]:
        """Generate a scenario to address a specific failed constraint."""
        
        adjustments = {}
        description = ""
        feasibility = 0.5
        
        if failed_constraint.constraint == "max_loan_size":
            # Reduce loan size by up to 15%
            max_reduction = deal.loan_amount_requested * 0.15
            required_reduction = deal.loan_amount_requested - failed_constraint.required
            
            if required_reduction <= max_reduction:
                new_amount = failed_constraint.required
                adjustments["loan_amount"] = {
                    "from": deal.loan_amount_requested,
                    "to": new_amount,
                    "change_pct": -((deal.loan_amount_requested - new_amount) / deal.loan_amount_requested)
                }
                description = f"Reduce loan amount to ${new_amount:,.0f}"
                feasibility = 0.8
            else:
                return None
        
        elif failed_constraint.constraint == "min_dscr":
            # Suggest extending term or reducing loan
            current_dscr = report.dscr_base or 1.0
            required_dscr = failed_constraint.required
            
            # Try extending term to 120 months max
            if deal.loan_term_months < 120:
                new_term = min(120, int(deal.loan_term_months * (required_dscr / current_dscr)))
                adjustments["loan_term_months"] = {
                    "from": deal.loan_term_months,
                    "to": new_term
                }
                description = f"Extend term to {new_term} months to improve DSCR"
                feasibility = 0.7
            else:
                # Reduce loan
                reduction_factor = current_dscr / required_dscr
                new_amount = deal.loan_amount_requested * reduction_factor
                adjustments["loan_amount"] = {
                    "from": deal.loan_amount_requested,
                    "to": new_amount
                }
                description = f"Reduce loan to ${new_amount:,.0f} to meet DSCR requirement"
                feasibility = 0.6
        
        elif failed_constraint.constraint == "max_pd":
            # Suggest higher escrow or guarantee
            current_escrow = report.recommended_escrow_pct or 0.05
            new_escrow = min(0.07, current_escrow + 0.02)
            
            adjustments["escrow_pct"] = {
                "from": current_escrow,
                "to": new_escrow
            }
            description = f"Increase escrow to {new_escrow:.0%} to offset higher PD"
            feasibility = 0.75
        
        elif failed_constraint.constraint == "min_collateral_coverage":
            # Suggest additional collateral
            current_coverage = report.collateral_coverage or 0
            required_coverage = failed_constraint.required
            shortfall = (required_coverage - current_coverage) * deal.loan_amount_requested
            
            adjustments["additional_collateral_needed"] = shortfall
            description = f"Provide ${shortfall:,.0f} additional collateral"
            feasibility = 0.5
        
        elif failed_constraint.constraint in ["max_term_months", "min_term_months"]:
            # Adjust term
            new_term = failed_constraint.required
            adjustments["loan_term_months"] = {
                "from": deal.loan_term_months,
                "to": new_term
            }
            description = f"Adjust term to {new_term} months"
            feasibility = 0.9
        
        else:
            # Generic scenario
            return None
        
        if not adjustments:
            return None
        
        return ApproveIfScenario(
            scenario_id=scenario_id,
            description=description,
            adjustments=adjustments,
            new_constraints_met=[failed_constraint.constraint],
            constraints_still_failed=[
                c.constraint for c in match.constraints_failed 
                if c.constraint != failed_constraint.constraint
            ],
            feasibility_score=feasibility
        )
    
    def _save_matches(
        self,
        deal: Deal,
        risk_report: DealRiskReport,
        lender_matches: List[PolicyMatch],
        insurer_matches: List[PolicyMatch],
        scenarios: List[ApproveIfScenario],
        apply_auto_decisions: bool = True
    ) -> Tuple[int, int]:
        """
        Save match results to database.
        Apply auto-decisions based on policy thresholds.
        Returns (auto_decisions_made, counter_offers_generated).
        """
        # Clear existing matches for this deal
        self.db.query(DealMatch).filter(DealMatch.deal_id == deal.id).delete()
        
        auto_decisions_made = 0
        counter_offers_generated = 0
        
        # Save lender matches
        for match in lender_matches:
            status, auto_decision, auto_reason, counter_offer = self._determine_auto_decision(
                match, deal, risk_report, apply_auto_decisions
            )
            
            if auto_decision:
                auto_decisions_made += 1
            if counter_offer:
                counter_offers_generated += 1
            
            db_match = DealMatch(
                deal_id=deal.id,
                lender_policy_id=match.policy_id,
                match_score=match.match_score,
                match_reasons=[c.reason for c in match.constraints_met],
                constraints_met=[self._constraint_to_dict(c) for c in match.constraints_met],
                constraints_failed=[self._constraint_to_dict(c) for c in match.constraints_failed],
                status=status,
                auto_decision=auto_decision,
                auto_decision_reason=auto_reason,
                counter_offer=counter_offer,
                counter_offer_at=datetime.utcnow() if counter_offer else None,
                counter_offer_expires_at=datetime.utcnow() + timedelta(days=7) if counter_offer else None,
                decision_at=datetime.utcnow() if auto_decision else None,
                scenarios=[self._scenario_to_dict(s) for s in scenarios] if match.is_full_match else None
            )
            self.db.add(db_match)
        
        # Save insurer matches
        for match in insurer_matches:
            status, auto_decision, auto_reason, counter_offer = self._determine_auto_decision(
                match, deal, risk_report, apply_auto_decisions
            )
            
            if auto_decision:
                auto_decisions_made += 1
            if counter_offer:
                counter_offers_generated += 1
            
            db_match = DealMatch(
                deal_id=deal.id,
                insurer_policy_id=match.policy_id,
                match_score=match.match_score,
                match_reasons=[c.reason for c in match.constraints_met],
                constraints_met=[self._constraint_to_dict(c) for c in match.constraints_met],
                constraints_failed=[self._constraint_to_dict(c) for c in match.constraints_failed],
                status=status,
                auto_decision=auto_decision,
                auto_decision_reason=auto_reason,
                counter_offer=counter_offer,
                counter_offer_at=datetime.utcnow() if counter_offer else None,
                counter_offer_expires_at=datetime.utcnow() + timedelta(days=7) if counter_offer else None,
                decision_at=datetime.utcnow() if auto_decision else None,
                scenarios=[self._scenario_to_dict(s) for s in scenarios] if match.is_full_match else None
            )
            self.db.add(db_match)
        
        self.db.commit()
        return auto_decisions_made, counter_offers_generated
    
    def _determine_auto_decision(
        self,
        match: PolicyMatch,
        deal: Deal,
        risk_report: DealRiskReport,
        apply_auto_decisions: bool
    ) -> Tuple[str, bool, Optional[str], Optional[Dict]]:
        """
        Determine if auto-decision applies based on policy thresholds.
        
        Returns (status, is_auto_decision, auto_reason, counter_offer)
        """
        if not apply_auto_decisions or match.policy is None:
            return "pending", False, None, None
        
        policy = match.policy
        
        # Check if auto-decisions are enabled
        if not getattr(policy, 'auto_decision_enabled', False):
            return "pending", False, None, None
        
        score_pct = match.match_score * 100  # Convert to percentage
        
        # Check auto-accept threshold
        if policy.auto_accept_threshold and score_pct >= policy.auto_accept_threshold:
            return "accepted", True, f"Auto-accepted: match score {score_pct:.1f}% >= {policy.auto_accept_threshold}% threshold", None
        
        # Check auto-reject threshold
        if policy.auto_reject_threshold and score_pct <= policy.auto_reject_threshold:
            return "rejected", True, f"Auto-rejected: match score {score_pct:.1f}% <= {policy.auto_reject_threshold}% threshold", None
        
        # Check counter-offer range
        if (policy.counter_offer_min and policy.counter_offer_max and
            score_pct >= policy.counter_offer_min and score_pct < (policy.auto_accept_threshold or 100)):
            
            # Generate counter-offer
            counter_offer = self._generate_counter_offer(match, deal, risk_report, policy)
            if counter_offer:
                return "counter_offered", True, f"Counter-offer generated: match score {score_pct:.1f}% in counter-offer range", counter_offer
        
        return "pending", False, None, None
    
    def _generate_counter_offer(
        self,
        match: PolicyMatch,
        deal: Deal,
        risk_report: DealRiskReport,
        policy: Any
    ) -> Optional[Dict]:
        """
        Generate a counter-offer based on failed constraints.
        Proposes deal modifications that would meet policy requirements.
        """
        original_values = {}
        proposed_values = {}
        adjustments = []
        
        # Even if no constraints failed, we can still make a counter-offer
        # based on improving the deal to better match the policy
        
        for constraint in (match.constraints_failed or []):
            if constraint.constraint == "max_loan_size" and hasattr(policy, 'max_loan_size') and policy.max_loan_size:
                original_values["loan_amount_requested"] = deal.loan_amount_requested
                proposed_values["loan_amount_requested"] = policy.max_loan_size
                adjustments.append({
                    "field": "Loan Amount",
                    "original": deal.loan_amount_requested,
                    "proposed": policy.max_loan_size,
                    "change": policy.max_loan_size - deal.loan_amount_requested,
                    "reason": f"Reduce loan from ${deal.loan_amount_requested:,.0f} to ${policy.max_loan_size:,.0f} to meet max loan size"
                })
            
            elif constraint.constraint == "min_loan_size" and hasattr(policy, 'min_loan_size') and policy.min_loan_size:
                original_values["loan_amount_requested"] = deal.loan_amount_requested
                proposed_values["loan_amount_requested"] = policy.min_loan_size
                adjustments.append({
                    "field": "Loan Amount",
                    "original": deal.loan_amount_requested,
                    "proposed": policy.min_loan_size,
                    "change": policy.min_loan_size - deal.loan_amount_requested,
                    "reason": f"Increase loan from ${deal.loan_amount_requested:,.0f} to ${policy.min_loan_size:,.0f} to meet min loan size"
                })
            
            elif constraint.constraint == "max_term_months" and hasattr(policy, 'max_term_months') and policy.max_term_months:
                original_values["loan_term_months"] = deal.loan_term_months
                proposed_values["loan_term_months"] = policy.max_term_months
                adjustments.append({
                    "field": "Loan Term",
                    "original": deal.loan_term_months,
                    "proposed": policy.max_term_months,
                    "change": policy.max_term_months - deal.loan_term_months,
                    "reason": f"Reduce term from {deal.loan_term_months} to {policy.max_term_months} months"
                })
            
            elif constraint.constraint == "min_term_months" and hasattr(policy, 'min_term_months') and policy.min_term_months:
                original_values["loan_term_months"] = deal.loan_term_months
                proposed_values["loan_term_months"] = policy.min_term_months
                adjustments.append({
                    "field": "Loan Term",
                    "original": deal.loan_term_months,
                    "proposed": policy.min_term_months,
                    "change": policy.min_term_months - deal.loan_term_months,
                    "reason": f"Increase term from {deal.loan_term_months} to {policy.min_term_months} months"
                })
            
            # For DSCR issues, suggest reducing loan amount to improve DSCR
            elif constraint.constraint == "min_dscr" and hasattr(policy, 'min_dscr') and policy.min_dscr:
                # Calculate what loan amount would achieve the required DSCR
                if risk_report.dscr_base and risk_report.dscr_base > 0:
                    # DSCR = Cash Flow / Debt Service
                    # To increase DSCR, reduce loan (and thus debt service)
                    ratio_needed = policy.min_dscr / risk_report.dscr_base
                    suggested_loan = deal.loan_amount_requested / ratio_needed * 0.95  # 5% buffer
                    suggested_loan = round(suggested_loan / 10000) * 10000  # Round to nearest 10k
                    
                    if suggested_loan < deal.loan_amount_requested:
                        original_values["loan_amount_requested"] = deal.loan_amount_requested
                        proposed_values["loan_amount_requested"] = suggested_loan
                        adjustments.append({
                            "field": "Loan Amount",
                            "original": deal.loan_amount_requested,
                            "proposed": suggested_loan,
                            "change": suggested_loan - deal.loan_amount_requested,
                            "reason": f"Reduce loan from ${deal.loan_amount_requested:,.0f} to ${suggested_loan:,.0f} to improve DSCR from {risk_report.dscr_base:.2f}x toward {policy.min_dscr:.2f}x requirement"
                        })
            
            # For leverage issues, suggest reducing loan amount
            elif constraint.constraint == "max_leverage" and hasattr(policy, 'max_leverage') and policy.max_leverage:
                if deal.ebitda and deal.ebitda > 0:
                    max_loan_for_leverage = policy.max_leverage * deal.ebitda
                    max_loan_for_leverage = round(max_loan_for_leverage / 10000) * 10000
                    
                    if max_loan_for_leverage < deal.loan_amount_requested:
                        original_values["loan_amount_requested"] = deal.loan_amount_requested
                        proposed_values["loan_amount_requested"] = max_loan_for_leverage
                        adjustments.append({
                            "field": "Loan Amount",
                            "original": deal.loan_amount_requested,
                            "proposed": max_loan_for_leverage,
                            "change": max_loan_for_leverage - deal.loan_amount_requested,
                            "reason": f"Reduce loan from ${deal.loan_amount_requested:,.0f} to ${max_loan_for_leverage:,.0f} to meet {policy.max_leverage:.1f}x max leverage requirement"
                        })
        
        # If we couldn't generate specific adjustments but there are failed constraints,
        # create a generic counter-offer noting what needs to change
        if not adjustments and match.constraints_failed:
            failed_names = [c.constraint.replace('_', ' ').title() for c in match.constraints_failed[:3]]
            return {
                "original_values": {"deal_terms": "current"},
                "proposed_values": {"deal_terms": "to be negotiated"},
                "adjustments": [{
                    "field": "Deal Terms",
                    "original": "Current terms",
                    "proposed": "Revised terms needed",
                    "change": None,
                    "reason": f"Deal requires adjustments to meet: {', '.join(failed_names)}. Please contact lender to discuss options."
                }],
                "reason": f"Counter-offer: Deal needs modifications to address {len(match.constraints_failed)} constraint(s)",
                "expected_match_score": min(100, match.match_score * 100 + 20),  # Estimate improved score
                "expires_in_days": 7
            }
        
        if not adjustments:
            return None
        
        # Estimate new match score
        new_constraints_met = len(match.constraints_met) + len(adjustments)
        total_constraints = new_constraints_met + len(match.constraints_failed) - len(adjustments)
        expected_score = (new_constraints_met / total_constraints * 100) if total_constraints > 0 else match.match_score * 100
        
        return {
            "original_values": original_values,
            "proposed_values": proposed_values,
            "adjustments": adjustments,
            "reason": f"Counter-offer to address {len(adjustments)} constraint(s)",
            "expected_match_score": min(100, expected_score),
            "expires_in_days": 7
        }
    
    def _constraint_to_dict(self, constraint: ConstraintCheck) -> Dict[str, Any]:
        """Convert constraint check to dictionary."""
        return {
            "constraint": constraint.constraint,
            "required": constraint.required,
            "actual": constraint.actual,
            "met": constraint.met,
            "reason": constraint.reason
        }
    
    def _match_to_dict(self, match: PolicyMatch) -> Dict[str, Any]:
        """Convert policy match to dictionary."""
        return {
            "policy_id": match.policy_id,
            "policy_name": match.policy_name,
            "policy_type": match.policy_type,
            "match_score": match.match_score,
            "is_full_match": match.is_full_match,
            "constraints_met": [self._constraint_to_dict(c) for c in match.constraints_met],
            "constraints_failed": [self._constraint_to_dict(c) for c in match.constraints_failed]
        }
    
    def _scenario_to_dict(self, scenario: ApproveIfScenario) -> Dict[str, Any]:
        """Convert scenario to dictionary."""
        return {
            "scenario_id": scenario.scenario_id,
            "description": scenario.description,
            "adjustments": scenario.adjustments,
            "new_constraints_met": scenario.new_constraints_met,
            "constraints_still_failed": scenario.constraints_still_failed,
            "feasibility_score": scenario.feasibility_score
        }
