from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, Field


class ConstraintResult(BaseModel):
    constraint: str
    required: Any
    actual: Any
    met: bool
    reason: str


class MatchResult(BaseModel):
    policy_id: int
    policy_name: str
    policy_type: str  # "lender" or "insurer"
    match_score: float
    constraints_met: List[ConstraintResult]
    constraints_failed: List[ConstraintResult]
    is_full_match: bool


class ApproveIfScenario(BaseModel):
    scenario_id: int
    description: str
    adjustments: dict  # What changes
    new_constraints_met: List[str]
    constraints_still_failed: List[str]
    feasibility_score: float


class CounterOffer(BaseModel):
    """Counter-offer proposed by lender/insurer to borrower"""
    original_values: dict  # Original deal values
    proposed_values: dict  # Proposed new values
    adjustments: List[dict]  # List of specific changes
    reason: str  # Why this counter-offer
    expected_match_score: float  # Expected score if accepted
    expires_in_days: int = 7  # How long borrower has to respond


class MatchResponse(BaseModel):
    deal_id: int
    deal_name: str
    total_lender_matches: int
    total_insurer_matches: int
    lender_matches: List[MatchResult]
    insurer_matches: List[MatchResult]
    approve_if_scenarios: List[ApproveIfScenario]
    auto_decisions_made: int = 0  # Count of auto-accept/reject
    counter_offers_generated: int = 0  # Count of counter-offers


class DealMatchResponse(BaseModel):
    id: int
    deal_id: int
    lender_policy_id: Optional[int]
    insurer_policy_id: Optional[int]
    match_score: Optional[float]
    match_reasons: Optional[Any]
    constraints_met: Optional[Any]
    constraints_failed: Optional[Any]
    status: str
    decision_notes: Optional[str]
    decision_at: Optional[datetime]
    scenarios: Optional[Any]
    
    # Auto-decision fields
    auto_decision: bool = False
    auto_decision_reason: Optional[str] = None
    
    # Counter-offer fields
    counter_offer: Optional[Any] = None
    counter_offer_at: Optional[datetime] = None
    counter_offer_expires_at: Optional[datetime] = None
    borrower_response: Optional[str] = None
    borrower_response_at: Optional[datetime] = None
    borrower_response_notes: Optional[str] = None
    
    created_at: datetime
    
    class Config:
        from_attributes = True


class DealMatchDecision(BaseModel):
    status: str = Field(..., pattern="^(accepted|rejected|info_requested)$")
    decision_notes: Optional[str] = None


class CounterOfferResponse(BaseModel):
    """Borrower's response to a counter-offer"""
    response: str = Field(..., pattern="^(accepted|rejected)$")
    notes: Optional[str] = None


class RunMatchRequest(BaseModel):
    generate_scenarios: bool = True
    apply_auto_decisions: bool = True  # Whether to apply auto-accept/reject/counter-offer
