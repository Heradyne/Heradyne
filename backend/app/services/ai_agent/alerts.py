"""
Heradyne AI Agent - Alert Engine
"""
from typing import Dict, List, Optional
from dataclasses import dataclass, field
from datetime import datetime, timedelta
import uuid

from app.services.ai_agent.monitoring import AlertLevel, MonitoringResult


@dataclass
class AlertNotification:
    id: str
    loan_id: int
    loan_number: str
    alert_level: AlertLevel
    subject: str
    body: str
    response_deadline: Optional[str] = None
    created_at: str = ""


@dataclass
class AlertDashboard:
    total_loans: int
    loans_at_watch: int
    loans_at_advisory: int
    loans_at_escalation: int
    loans_at_pre_claim: int
    alerts_requiring_action: int
    top_alerts: List[Dict] = field(default_factory=list)
    generated_at: str = ""


class AlertEngine:
    """Manages alert notifications."""
    
    def process_monitoring_result(self, result: MonitoringResult) -> List[AlertNotification]:
        if result.alert_level == AlertLevel.NONE:
            return []
        
        days_map = {AlertLevel.WATCH: None, AlertLevel.ADVISORY: 30, AlertLevel.ESCALATION: 14, AlertLevel.PRE_CLAIM: 1}
        deadline = None
        if days_map.get(result.alert_level):
            deadline = (datetime.utcnow() + timedelta(days=days_map[result.alert_level])).isoformat()
        
        prefix = {'watch': '[WATCH]', 'advisory': '[ADVISORY]', 'escalation': '[ESCALATION]', 'pre_claim': '[PRE-CLAIM - URGENT]'}.get(result.alert_level.value, '[ALERT]')
        
        body_lines = [f"Loan: {result.loan_number}", f"Borrower: {result.borrower_name}", f"Health Score: {result.health_score}/100", f"Alert Level: {result.alert_level_display}", "", "Active Alerts:"]
        for alert in result.active_alerts[:5]:
            body_lines.append(f"  - {alert.message}")
        
        return [AlertNotification(
            id=str(uuid.uuid4()),
            loan_id=result.loan_id,
            loan_number=result.loan_number,
            alert_level=result.alert_level,
            subject=f"{prefix} Loan {result.loan_number} - {result.borrower_name}",
            body="\n".join(body_lines),
            response_deadline=deadline,
            created_at=datetime.utcnow().isoformat()
        )]
    
    def generate_dashboard(self, results: List[MonitoringResult]) -> AlertDashboard:
        dashboard = AlertDashboard(
            total_loans=len(results),
            loans_at_watch=sum(1 for r in results if r.alert_level == AlertLevel.WATCH),
            loans_at_advisory=sum(1 for r in results if r.alert_level == AlertLevel.ADVISORY),
            loans_at_escalation=sum(1 for r in results if r.alert_level == AlertLevel.ESCALATION),
            loans_at_pre_claim=sum(1 for r in results if r.alert_level == AlertLevel.PRE_CLAIM),
            alerts_requiring_action=sum(1 for r in results if r.alert_level in [AlertLevel.ADVISORY, AlertLevel.ESCALATION, AlertLevel.PRE_CLAIM]),
            generated_at=datetime.utcnow().isoformat()
        )
        
        priority = {AlertLevel.PRE_CLAIM: 0, AlertLevel.ESCALATION: 1, AlertLevel.ADVISORY: 2, AlertLevel.WATCH: 3}
        sorted_results = sorted(results, key=lambda r: (priority.get(r.alert_level, 4), -r.health_score))
        
        for result in sorted_results[:10]:
            if result.alert_level != AlertLevel.NONE:
                dashboard.top_alerts.append({
                    'loan_id': result.loan_id, 'loan_number': result.loan_number,
                    'borrower_name': result.borrower_name, 'alert_level': result.alert_level.value,
                    'health_score': result.health_score, 'alert_count': len(result.active_alerts)
                })
        
        return dashboard
