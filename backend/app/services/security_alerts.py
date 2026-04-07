"""
Security alerting service.

Watches audit logs for suspicious events and fires webhooks/notifications.
Covers SOC 2 CC7 (monitoring) requirements.
"""
import json
import urllib.request
from typing import Optional
from app.core.config import settings


# High-risk actions that should trigger alerts
HIGH_RISK_ACTIONS = {
    "login_failed",
    "mfa_failed",
    "user_data_erased",
    "role_changed",
    "admin_action",
    "bulk_export",
    "deal_soft_deleted",
    "mfa_disabled",
    "password_changed",
}

# Actions that always alert regardless of threshold
ALWAYS_ALERT_ACTIONS = {
    "user_data_erased",
    "role_changed",
    "mfa_disabled",
}

# Per-user thresholds before alerting
THRESHOLDS = {
    "login_failed": 5,
    "mfa_failed": 3,
}


def _send_webhook(payload: dict) -> None:
    """Send alert to configured webhook (Slack, PagerDuty, etc.)."""
    webhook_url = getattr(settings, 'SECURITY_WEBHOOK_URL', None)
    if not webhook_url:
        return
    try:
        data = json.dumps(payload).encode()
        req = urllib.request.Request(
            webhook_url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass  # Never block the main flow due to alerting failure


def check_and_alert(
    action: str,
    entity_id: Optional[int],
    user_id: Optional[int],
    ip_address: Optional[str],
    details: Optional[dict],
    db=None,
) -> None:
    """Called after every audit log write. Fires alerts for suspicious events."""
    if action not in HIGH_RISK_ACTIONS:
        return

    alert = False
    severity = "info"

    if action in ALWAYS_ALERT_ACTIONS:
        alert = True
        severity = "high"

    elif action in THRESHOLDS and db is not None:
        # Count recent occurrences for this user
        try:
            from app.models.audit import AuditLog
            from datetime import datetime, timedelta
            cutoff = datetime.utcnow() - timedelta(minutes=15)
            count = db.query(AuditLog).filter(
                AuditLog.action == action,
                AuditLog.user_id == user_id,
                AuditLog.created_at >= cutoff,
            ).count()
            if count >= THRESHOLDS[action]:
                alert = True
                severity = "high" if action == "login_failed" else "medium"
        except Exception:
            pass

    elif action in HIGH_RISK_ACTIONS:
        alert = True
        severity = "medium"

    if alert:
        _send_webhook({
            "event": "heradyne_security_alert",
            "severity": severity,
            "action": action,
            "user_id": user_id,
            "entity_id": entity_id,
            "ip_address": ip_address,
            "details": details or {},
            "timestamp": __import__("datetime").datetime.utcnow().isoformat(),
            "environment": settings.ENVIRONMENT,
        })
