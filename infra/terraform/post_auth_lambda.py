"""
UnderwriteOS — Cognito Post-Authentication Lambda Trigger
=========================================================
Fires after every successful login.
- Records successful login to audit log
- Verifies MFA was used (not just enrolled)
- Updates last-seen timestamp
"""

import os
import json
import time
import boto3
import logging
from datetime import datetime, timezone

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb")

def handler(event, context):
    username = event["userName"]
    user_attrs = event.get("request", {}).get("userAttributes", {})

    # Verify MFA was actually used in this session (not just enrolled)
    # Cognito sets amr to include the MFA method used
    amr = event.get("request", {}).get("userContextData", {}).get("amr", [])
    mfa_used = any(m in str(amr) for m in ["mfa", "totp", "otp", "sms"])

    try:
        table = dynamodb.Table(os.environ["AUDIT_LOG_TABLE"])
        table.put_item(Item={
            "event_id":   f"{username}-login-{int(time.time() * 1000)}",
            "timestamp":  datetime.now(timezone.utc).isoformat(),
            "user_id":    username,
            "user_email": user_attrs.get("email", username),
            "role":       user_attrs.get("custom:role", "unknown"),
            "event_type": "auth",
            "module":     "Auth",
            "action":     "login_successful",
            "detail":     f"MFA used: {mfa_used} · Device: {event.get('callerContext', {}).get('clientId', 'unknown')}",
            "severity":   "info" if mfa_used else "high",
            "expire_at":  int(time.time()) + (7 * 365 * 24 * 3600),
        })
    except Exception as e:
        logger.error(f"Post-auth audit log failed: {e}")

    return event
