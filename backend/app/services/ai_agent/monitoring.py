"""
Heradyne AI Agent - Monitoring Engine
Post-policy monitoring with 18 variables for early warning.
"""
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum

from app.services.ai_agent.variables import MONITORING_VARIABLES


class AlertLevel(str, Enum):
    NONE = "none"
    WATCH = "watch"
    ADVISORY = "advisory"
    ESCALATION = "escalation"
    PRE_CLAIM = "pre_claim"


class AlertSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class MonitoringAlert:
    variable_id: str
    variable_name: str
    alert_level: AlertLevel
    severity: AlertSeverity
    trigger_value: Any
    threshold: Any
    message: str
    lead_time_months: str
    recommended_action: str
    triggered_at: str = ""


@dataclass
class DistressPattern:
    pattern_name: str
    likely_cause: str
    intervention: str
    expected_outcome: str
    urgency: str


@dataclass
class MonitoringResult:
    loan_id: int
    loan_number: str
    borrower_name: str
    health_score: float
    alert_level: AlertLevel
    alert_level_display: str
    active_alerts: List[MonitoringAlert] = field(default_factory=list)
    watch_count: int = 0
    advisory_count: int = 0
    escalation_count: int = 0
    pre_claim_count: int = 0
    revenue_trend: str = ""
    dscr_trend: str = ""
    cash_trend: str = ""
    detected_patterns: List[DistressPattern] = field(default_factory=list)
    recommended_frequency: str = "quarterly"
    next_review_date: str = ""
    required_actions: List[str] = field(default_factory=list)
    months_since_origination: int = 0
    estimated_months_to_risk: Optional[int] = None
    last_updated: str = ""
    data_freshness: Dict[str, str] = field(default_factory=dict)


class MonitoringEngine:
    """Post-policy monitoring engine."""
    
    def __init__(self):
        self.variables = MONITORING_VARIABLES
        self.intervention_playbook = {
            'revenue_decline_minor': DistressPattern("Revenue -10-20%, DSCR >1.2×", "Market softness", "Lender check-in call", "Borrower stabilizes", "30-day"),
            'margin_compression': DistressPattern("Revenue flat, DSCR <1.2×", "Cost inflation", "Lender + borrower meeting", "Ops adjusted in 6mo", "14-day"),
            'revenue_decline_major': DistressPattern("Revenue -20%+, DSCR →1.0×", "Structural problem", "Formal workout", "60-80% claim savings", "immediate"),
            'missed_payment': DistressPattern("Missed SBA payment", "Cash flow crisis", "14-day cure or sale", "Value preserved", "immediate"),
            'terminal_distress': DistressPattern("New liens + missed payroll", "Terminal distress", "Subrogation + wind-down", "40-60% recovery", "immediate"),
        }
    
    def assess_loan(self, loan_data: Dict[str, Any], monitoring_data: Dict[str, Any]) -> MonitoringResult:
        """Assess a loan using the 18-variable monitoring system."""
        alerts = []
        
        for var in self.variables:
            alert = self._check_variable(var, monitoring_data)
            if alert:
                alerts.append(alert)
        
        alert_level = self._determine_alert_level(alerts)
        health_score = self._calculate_health_score(alerts, monitoring_data)
        patterns = self._detect_patterns(monitoring_data, alerts)
        frequency = self._recommend_frequency(alert_level)
        actions = [a.recommended_action for a in alerts[:5]]
        
        return MonitoringResult(
            loan_id=loan_data.get('loan_id', 0),
            loan_number=loan_data.get('loan_number', ''),
            borrower_name=loan_data.get('borrower_name', ''),
            health_score=round(health_score, 1),
            alert_level=alert_level,
            alert_level_display=alert_level.value.replace('_', ' ').title(),
            active_alerts=alerts,
            watch_count=sum(1 for a in alerts if a.alert_level == AlertLevel.WATCH),
            advisory_count=sum(1 for a in alerts if a.alert_level == AlertLevel.ADVISORY),
            escalation_count=sum(1 for a in alerts if a.alert_level == AlertLevel.ESCALATION),
            pre_claim_count=sum(1 for a in alerts if a.alert_level == AlertLevel.PRE_CLAIM),
            revenue_trend=self._determine_trend(monitoring_data, 'revenue'),
            dscr_trend=self._determine_trend(monitoring_data, 'dscr'),
            cash_trend=self._determine_trend(monitoring_data, 'cash'),
            detected_patterns=patterns,
            recommended_frequency=frequency,
            next_review_date=(datetime.utcnow() + timedelta(days={'daily': 1, 'weekly': 7, 'monthly': 30, 'quarterly': 90}.get(frequency, 30))).isoformat(),
            required_actions=actions,
            months_since_origination=self._calc_months(loan_data.get('origination_date')),
            estimated_months_to_risk=3 if health_score < 30 else (6 if health_score < 50 else None),
            last_updated=datetime.utcnow().isoformat(),
            data_freshness={}
        )
    
    def _check_variable(self, var, data: Dict) -> Optional[MonitoringAlert]:
        var_id = var.id.replace('mon_', '')
        value = data.get(var_id) or data.get(var.id)
        if value is None:
            return None
        
        now = datetime.utcnow().isoformat()
        
        if var.id == 'mon_dscr_rolling':
            dscr = value
            if dscr < 1.0:
                return MonitoringAlert(var.id, var.name, AlertLevel.PRE_CLAIM, AlertSeverity.CRITICAL, f"{dscr:.2f}x", "<1.0x", f"DSCR at {dscr:.2f}x - cannot service debt", "0-3", "Activate claims protocol", now)
            elif dscr < 1.2:
                return MonitoringAlert(var.id, var.name, AlertLevel.ESCALATION, AlertSeverity.CRITICAL, f"{dscr:.2f}x", "<1.2x", f"DSCR at {dscr:.2f}x - approaching threshold", "6-9", "Escalate to claims watchlist", now)
        
        elif var.id == 'mon_sba_payment_status':
            status = str(value).lower()
            if status in ['missed', 'default', 'delinquent']:
                return MonitoringAlert(var.id, var.name, AlertLevel.PRE_CLAIM, AlertSeverity.CRITICAL, status, "Missed", f"SBA payment: {status}", "0-3", "Immediate contact, 14-day cure", now)
            elif status in ['late', '30_days']:
                return MonitoringAlert(var.id, var.name, AlertLevel.ESCALATION, AlertSeverity.HIGH, status, "30+ days", f"SBA payment {status}", "1-3", "Contact borrower", now)
        
        elif var.id == 'mon_insurance_lapse':
            if value in [True, 'lapsed', 'expired']:
                return MonitoringAlert(var.id, var.name, AlertLevel.PRE_CLAIM, AlertSeverity.CRITICAL, "Lapsed", "Any lapse", "Insurance coverage lapsed", "immediate", "Policy violation - require cure", now)
        
        elif var.id == 'mon_new_liens':
            if value and value > 0:
                return MonitoringAlert(var.id, var.name, AlertLevel.ESCALATION, AlertSeverity.HIGH, f"{value} liens", "Any lien", f"{value} new lien(s) filed", "1-3", "Immediate review", now)
        
        elif var.id == 'mon_employee_count':
            change = data.get('employee_count_change_pct', 0)
            if change <= -20:
                return MonitoringAlert(var.id, var.name, AlertLevel.ADVISORY, AlertSeverity.HIGH, f"{change}%", ">20% decline", f"Headcount declined {abs(change)}%", "3-6", "Request explanation", now)
        
        return None
    
    def _determine_alert_level(self, alerts: List[MonitoringAlert]) -> AlertLevel:
        if not alerts:
            return AlertLevel.NONE
        if any(a.alert_level == AlertLevel.PRE_CLAIM for a in alerts):
            return AlertLevel.PRE_CLAIM
        if any(a.alert_level == AlertLevel.ESCALATION for a in alerts):
            return AlertLevel.ESCALATION
        if any(a.alert_level == AlertLevel.ADVISORY for a in alerts):
            return AlertLevel.ADVISORY
        return AlertLevel.WATCH
    
    def _calculate_health_score(self, alerts: List[MonitoringAlert], data: Dict) -> float:
        score = 100
        for alert in alerts:
            if alert.alert_level == AlertLevel.PRE_CLAIM: score -= 40
            elif alert.alert_level == AlertLevel.ESCALATION: score -= 25
            elif alert.alert_level == AlertLevel.ADVISORY: score -= 15
            elif alert.alert_level == AlertLevel.WATCH: score -= 5
        return max(0, min(100, score))
    
    def _detect_patterns(self, data: Dict, alerts: List[MonitoringAlert]) -> List[DistressPattern]:
        patterns = []
        dscr = data.get('dscr_current', 1.5)
        rev_change = data.get('revenue_change_pct', 0)
        
        if -20 < rev_change <= -10 and dscr > 1.2:
            patterns.append(self.intervention_playbook['revenue_decline_minor'])
        elif rev_change <= -20 or dscr <= 1.0:
            patterns.append(self.intervention_playbook['revenue_decline_major'])
        
        if any(a.variable_id == 'mon_sba_payment_status' and a.alert_level == AlertLevel.PRE_CLAIM for a in alerts):
            patterns.append(self.intervention_playbook['missed_payment'])
        
        return patterns
    
    def _recommend_frequency(self, alert_level: AlertLevel) -> str:
        return {'pre_claim': 'daily', 'escalation': 'weekly', 'advisory': 'monthly', 'watch': 'monthly'}.get(alert_level.value, 'quarterly')
    
    def _determine_trend(self, data: Dict, metric: str) -> str:
        change = data.get(f'{metric}_trend_pct', 0)
        if change >= 5: return "growing"
        elif change <= -5: return "declining"
        return "stable"
    
    def _calc_months(self, orig_date) -> int:
        if not orig_date: return 0
        if isinstance(orig_date, str):
            orig_date = datetime.fromisoformat(orig_date.replace('Z', '+00:00'))
        return max(0, (datetime.utcnow() - orig_date.replace(tzinfo=None)).days // 30)
