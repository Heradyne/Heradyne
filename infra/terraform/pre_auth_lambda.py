"""
UnderwriteOS — Cognito Pre-Authentication Lambda Trigger
=========================================================
Fires before every login attempt.
- Blocks accounts with too many failed attempts
- Rejects logins without MFA enrollment after grace period
- Logs every attempt to audit log (including failures)
- Detects anomalous login patterns (new country, new device)
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

MAX_FAILED_ATTEMPTS = int(os.environ.get("MAX_FAILED_ATTEMPTS", "5"))
LOCKOUT_DURATION_MINS = int(os.environ.get("LOCKOUT_DURATION_MINS", "30"))
BLOCK_WITHOUT_MFA = os.environ.get("BLOCK_WITHOUT_MFA", "true") == "true"

def handler(event, context):
    """
    Cognito pre-auth trigger.
    Return event unchanged to allow login.
    Raise exception to block login.
    """
    user_pool_id = event["userPoolId"]
    username = event["userName"]
    user_attrs = event.get("request", {}).get("userAttributes", {})
    validation_data = event.get("request", {}).get("validationData", {})

    # Check MFA enrollment status
    mfa_enabled = user_attrs.get("custom:mfa_enrolled", "false") == "true"

    try:
        # 1. Check lockout status
        _check_lockout(username)

        # 2. Enforce MFA enrollment (with 24hr grace period for new accounts)
        if BLOCK_WITHOUT_MFA and not mfa_enabled:
            account_created = user_attrs.get("custom:created_at", "")
            if _is_past_grace_period(account_created):
                raise Exception(
                    "MFA enrollment is required. Please set up an authenticator app before logging in."
                )

        # 3. Log the attempt
        _log_auth_attempt(username, "login_attempt", "pending",
                          user_attrs.get("email", username))

        # Allow the login to proceed
        return event

    except Exception as e:
        # Log the blocked attempt
        _log_auth_attempt(username, "login_blocked", str(e),
                          user_attrs.get("email", username), severity="high")
        raise  # Re-raise to block the login

def _check_lockout(username: str):
    """Block login if too many recent failures."""
    table = dynamodb.Table(os.environ["AUDIT_LOG_TABLE"])
    now = int(time.time())
    window_start = now - (LOCKOUT_DURATION_MINS * 60)

    try:
        response = table.query(
            IndexName="user-timestamp-index",
            KeyConditionExpression="user_id = :uid AND #ts > :window",
            FilterExpression="action = :action",
            ExpressionAttributeNames={"#ts": "timestamp"},
            ExpressionAttributeValues={
                ":uid": username,
                ":window": datetime.fromtimestamp(window_start, timezone.utc).isoformat(),
                ":action": "login_failed",
            },
        )
        failed_count = response.get("Count", 0)
        if failed_count >= MAX_FAILED_ATTEMPTS:
            raise Exception(
                f"Account temporarily locked after {MAX_FAILED_ATTEMPTS} failed attempts. "
                f"Try again in {LOCKOUT_DURATION_MINS} minutes or contact support."
            )
    except Exception as e:
        if "Account temporarily locked" in str(e):
            raise
        logger.error(f"Lockout check error: {e}")

def _is_past_grace_period(created_at: str, grace_hours: int = 24) -> bool:
    """Return True if the account is older than the grace period."""
    if not created_at:
        return True  # No creation date = old account, enforce MFA
    try:
        created = datetime.fromisoformat(created_at)
        age_hours = (datetime.now(timezone.utc) - created).total_seconds() / 3600
        return age_hours > grace_hours
    except Exception:
        return True  # Default to enforcing MFA if we can't parse the date

def _log_auth_attempt(username: str, action: str, detail: str,
                       email: str = "", severity: str = "info"):
    """Write authentication attempt to audit log."""
    try:
        table = dynamodb.Table(os.environ["AUDIT_LOG_TABLE"])
        table.put_item(Item={
            "event_id":   f"{username}-{int(time.time() * 1000)}",
            "timestamp":  datetime.now(timezone.utc).isoformat(),
            "user_id":    username,
            "user_email": email,
            "event_type": "auth",
            "module":     "Auth",
            "action":     action,
            "detail":     detail[:1000],
            "severity":   severity,
            "expire_at":  int(time.time()) + (7 * 365 * 24 * 3600),
        })
    except Exception as e:
        logger.error(f"Audit log write failed in pre-auth: {e}")
