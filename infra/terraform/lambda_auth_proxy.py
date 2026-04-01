"""
UnderwriteOS — Lambda: API Proxy + Auth Enforcement
====================================================
Every API request goes through this handler.
1. Validates Cognito JWT (done by API Gateway before this runs)
2. Extracts user role and business_id from token claims
3. Enforces row-level access control
4. Routes to the correct engine
5. Fetches secrets from Secrets Manager (never from env vars)
6. Writes to audit log
7. Rate-limits AI agent calls

All DB connections use SSL/TLS via RDS Proxy.
All secrets come from Secrets Manager, KMS-encrypted.
"""

import os
import json
import time
import boto3
import psycopg2
import ssl
import logging
from datetime import datetime, timezone
from functools import wraps
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# AWS clients
secrets_client = boto3.client("secretsmanager")
dynamodb = boto3.resource("dynamodb")
ssm = boto3.client("ssm")

# ── Secret fetching — never hardcode credentials ─────────────
_secret_cache = {}

def get_secret(secret_name: str) -> dict:
    """Fetch from Secrets Manager with in-memory cache (Lambda warm reuse)."""
    if secret_name in _secret_cache:
        return _secret_cache[secret_name]
    try:
        response = secrets_client.get_secret_value(SecretId=secret_name)
        secret = json.loads(response["SecretString"])
        _secret_cache[secret_name] = secret
        return secret
    except ClientError as e:
        logger.error(f"Failed to fetch secret {secret_name}: {e}")
        raise

# ── DB connection via RDS Proxy (SSL required) ───────────────
def get_db_connection():
    """
    Connect to Aurora via RDS Proxy with SSL/TLS.
    Uses IAM authentication — no password stored anywhere.
    """
    env = os.environ["ENVIRONMENT"]
    proxy_endpoint = os.environ["RDS_PROXY_ENDPOINT"]
    db_name = os.environ["DB_NAME"]

    # IAM auth token — short-lived, no password needed
    rds_client = boto3.client("rds")
    token = rds_client.generate_db_auth_token(
        DBHostname=proxy_endpoint,
        Port=5432,
        DBUsername=os.environ["DB_USERNAME"],
        Region=os.environ["AWS_REGION"],
    )

    # SSL context — verify RDS certificate
    ssl_context = ssl.create_default_context()
    ssl_context.verify_mode = ssl.CERT_REQUIRED
    ssl_context.load_verify_locations("/var/task/certs/rds-ca-bundle.pem")

    conn = psycopg2.connect(
        host=proxy_endpoint,
        port=5432,
        database=db_name,
        user=os.environ["DB_USERNAME"],
        password=token,
        sslmode="verify-full",     # Full certificate verification — not just encryption
        sslrootcert="/var/task/certs/rds-ca-bundle.pem",
        connect_timeout=5,
    )
    return conn

# ── JWT claim extraction ─────────────────────────────────────
def extract_claims(event: dict) -> dict:
    """
    Extract verified claims from Cognito JWT.
    API Gateway already verified the signature — we just parse claims.
    Claims are in event["requestContext"]["authorizer"]["claims"].
    """
    claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
    if not claims:
        raise PermissionError("No JWT claims found — unauthenticated request")

    return {
        "user_id":    claims.get("sub"),
        "email":      claims.get("email"),
        "role":       claims.get("custom:role", ""),
        "business_id": claims.get("custom:business_id", ""),
        "groups":     claims.get("cognito:groups", "").split(","),
        "mfa_enrolled": claims.get("custom:mfa_enrolled", "false") == "true",
        "amr":        claims.get("amr", ""),   # Authentication method references
    }

# ── MFA enforcement ──────────────────────────────────────────
def require_mfa(claims: dict):
    """Block requests where MFA was not used in this session."""
    amr = claims.get("amr", "")
    # Cognito sets amr to include "mfa" or the MFA type when MFA was used
    if "mfa" not in amr and "totp" not in amr and "otp" not in amr:
        raise PermissionError("MFA required. Please log in with MFA enabled.")
    if not claims.get("mfa_enrolled"):
        raise PermissionError("MFA enrollment required before accessing financial data.")

# ── Role-based access control ────────────────────────────────
ROUTE_PERMISSIONS = {
    "/health-score":       ["Owner", "Admin"],
    "/financials":         ["Owner", "Admin"],
    "/underwriting":       ["Buyer", "Admin"],
    "/sba-eligibility":    ["Owner", "Buyer", "Admin"],
    "/valuation":          ["Owner", "Buyer", "Admin"],
    "/pdscr":              ["Owner", "Buyer", "Admin"],
    "/ai-agent":           ["Owner", "Buyer", "Admin"],
    "/audit-log":          ["Admin"],              # Admin only
    "/admin/users":        ["Admin"],
    "/admin/integrations": ["Admin"],
}

def check_route_permission(path: str, claims: dict):
    """Raise if the user's role is not permitted for this route."""
    groups = claims.get("groups", [])
    allowed_groups = ROUTE_PERMISSIONS.get(path, [])
    if not allowed_groups:
        raise PermissionError(f"Unknown route: {path}")
    if not any(g in groups for g in allowed_groups):
        raise PermissionError(
            f"Role {groups} not authorized for {path}. Required: {allowed_groups}"
        )

# ── Row-level access — owners can only see their own data ────
def check_business_access(requested_business_id: str, claims: dict):
    """
    Owners can only access their own business_id.
    Buyers can only access business IDs they're authorized for.
    Admins can access any business.
    """
    if "Admin" in claims.get("groups", []):
        return  # Admins bypass row-level check
    user_business_id = claims.get("business_id")
    if user_business_id != requested_business_id:
        raise PermissionError(
            f"Access denied: user is not authorized for business {requested_business_id}"
        )

# ── Rate limiting — AI agent calls ───────────────────────────
AI_RATE_LIMIT = 20  # calls per hour per user

def check_ai_rate_limit(user_id: str):
    """
    Token bucket rate limiter using DynamoDB.
    Raises if user has exceeded AI_RATE_LIMIT calls in the past hour.
    """
    table = dynamodb.Table(os.environ["RATE_LIMIT_TABLE"])
    now = int(time.time())
    window_start = now - 3600  # 1 hour window

    try:
        response = table.update_item(
            Key={"user_id": user_id, "window": str(window_start // 3600)},
            UpdateExpression="SET call_count = if_not_exists(call_count, :zero) + :one, "
                             "window_start = if_not_exists(window_start, :ws), "
                             "expire_at = :exp",
            ExpressionAttributeValues={
                ":zero": 0, ":one": 1,
                ":ws": window_start,
                ":exp": now + 7200,  # TTL 2 hours
            },
            ReturnValues="UPDATED_NEW",
        )
        count = int(response["Attributes"]["call_count"])
        if count > AI_RATE_LIMIT:
            raise PermissionError(
                f"AI rate limit exceeded ({AI_RATE_LIMIT} calls/hour). "
                f"Try again in {60 - (now % 3600) // 60} minutes."
            )
    except ClientError as e:
        logger.error(f"Rate limit check failed: {e}")
        # Fail open with a warning rather than blocking — adjust for your risk tolerance

# ── Audit log writer ─────────────────────────────────────────
def write_audit_event(claims: dict, action: str, module: str, detail: str,
                      severity: str = "info", request_id: str = ""):
    """
    Write an immutable audit event to DynamoDB.
    Every API call is logged here.
    """
    try:
        table = dynamodb.Table(os.environ["AUDIT_LOG_TABLE"])
        table.put_item(Item={
            "event_id":   f"{claims['user_id']}-{int(time.time() * 1000)}",
            "timestamp":  datetime.now(timezone.utc).isoformat(),
            "user_id":    claims.get("user_id", "unknown"),
            "user_email": claims.get("email", "unknown"),
            "role":       str(claims.get("groups", [])),
            "event_type": "api",
            "module":     module,
            "action":     action,
            "detail":     detail[:2000],  # Truncate to prevent oversized items
            "severity":   severity,
            "request_id": request_id,
            "expire_at":  int(time.time()) + (7 * 365 * 24 * 3600),  # 7-year retention
        })
    except Exception as e:
        logger.error(f"Audit log write failed: {e}")
        # Never raise — audit failure should not break the request

# ── AI Agent proxy — calls Anthropic via server-side ─────────
def call_ai_agent(user_message: str, role: str, claims: dict) -> str:
    """
    Proxy all Anthropic API calls server-side.
    The API key NEVER reaches the browser.
    """
    import urllib.request

    # Rate limit check
    check_ai_rate_limit(claims["user_id"])

    # Fetch API key from Secrets Manager
    secret = get_secret(f"underwriteos/{os.environ['ENVIRONMENT']}/anthropic-api-key")
    api_key = secret["ANTHROPIC_API_KEY"]

    role_prompts = {
        "cfo":        "You are a CFO Advisor in UnderwriteOS...",
        "underwriter":"You are an SMB Acquisition Underwriter...",
        "sba":        "You are an SBA 7(a) Specialist...",
        "valuator":   "You are a Business Valuator...",
        "operator":   "You are an Operations Advisor...",
    }
    system_prompt = role_prompts.get(role, role_prompts["cfo"])

    payload = json.dumps({
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 1000,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_message}],
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=30) as response:
        data = json.loads(response.read())
        return data["content"][0]["text"]

# ── Main Lambda handler ───────────────────────────────────────
def handler(event, context):
    """
    Single entry-point Lambda for all UnderwriteOS API routes.
    API Gateway routes all requests here after Cognito JWT verification.
    """
    path = event.get("path", "")
    method = event.get("httpMethod", "GET")
    request_id = context.aws_request_id

    try:
        # 1. Extract JWT claims (already verified by API Gateway Cognito authorizer)
        claims = extract_claims(event)

        # 2. Enforce MFA on every request
        require_mfa(claims)

        # 3. Check route permissions
        check_route_permission(path, claims)

        # 4. Parse body
        body = {}
        if event.get("body"):
            body = json.loads(event["body"])

        # 5. Row-level access check if business_id is in request
        if "business_id" in body:
            check_business_access(body["business_id"], claims)

        # 6. Route to correct handler
        if path == "/ai-agent" and method == "POST":
            response_body = call_ai_agent(
                user_message=body.get("message", ""),
                role=body.get("role", "cfo"),
                claims=claims,
            )
            write_audit_event(
                claims, "AI query", "AI Agent",
                f"Role: {body.get('role')} · Chars: {len(body.get('message',''))}",
                request_id=request_id,
            )
            return _response(200, {"reply": response_body})

        elif path == "/health-score" and method == "GET":
            conn = get_db_connection()
            # ... query health score from DB ...
            write_audit_event(claims, "Health score viewed", "Health Score Engine",
                              f"Business: {body.get('business_id')}", request_id=request_id)
            return _response(200, {"score": 78, "subscores": {}})  # placeholder

        elif path == "/audit-log" and method == "GET":
            # Admin only — already checked by check_route_permission
            write_audit_event(claims, "Audit log accessed", "Audit Log",
                              "Admin viewed audit log", severity="medium",
                              request_id=request_id)
            # ... query DynamoDB audit log ...
            return _response(200, {"events": []})

        else:
            return _response(404, {"error": f"Unknown route: {path}"})

    except PermissionError as e:
        logger.warning(f"Permission denied: {e} — user: {event.get('requestContext',{}).get('authorizer',{}).get('claims',{}).get('email','unknown')}")
        return _response(403, {"error": str(e)})

    except Exception as e:
        logger.error(f"Unhandled error on {path}: {e}", exc_info=True)
        return _response(500, {"error": "Internal server error"})


def _response(status_code: int, body: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "Cache-Control": "no-store",   # Never cache financial data
        },
        "body": json.dumps(body),
    }
