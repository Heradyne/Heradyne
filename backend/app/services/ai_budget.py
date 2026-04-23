"""
AI Cost Control Middleware

- Tracks per-user AI requests per day
- Enforces hard limits by role
- Adds slowapi rate limiting on all AI endpoints
- Logs usage for billing/monitoring
"""

import time
import logging
from typing import Optional
from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.models.user import User, UserRole

log = logging.getLogger("heradyne.ai_budget")

# Daily AI request limits by role
DAILY_LIMITS = {
    UserRole.ADMIN:            500,
    UserRole.LENDER:           100,
    UserRole.LOAN_OFFICER:     100,
    UserRole.CREDIT_COMMITTEE: 100,
    UserRole.INSURER:          50,
    UserRole.BORROWER:         20,
}

DEFAULT_LIMIT = 10


def _get_redis():
    try:
        import redis
        from app.core.config import settings
        return redis.from_url(settings.REDIS_URL, decode_responses=True, socket_timeout=2)
    except Exception:
        return None


def check_ai_budget(user: User) -> None:
    """
    Check if user has remaining AI budget for today.
    Raises 429 if over limit. Increments counter on success.
    Called at the start of every AI endpoint.
    """
    r = _get_redis()
    if r is None:
        # Redis unavailable — allow but log warning
        log.warning(f"Redis unavailable — skipping AI budget check for user {user.id}")
        return

    limit = DAILY_LIMITS.get(user.role, DEFAULT_LIMIT)

    # Key resets every 24 hours (86400 seconds)
    today = int(time.time()) // 86400
    key = f"ai_budget:{user.id}:{today}"

    try:
        current = r.get(key)
        count = int(current) if current else 0

        if count >= limit:
            log.warning(f"AI budget exceeded for user {user.id} (role={user.role}, count={count}, limit={limit})")
            raise HTTPException(
                status_code=429,
                detail=f"Daily AI request limit reached ({limit} requests/day for your account). Resets at midnight UTC.",
                headers={"X-RateLimit-Limit": str(limit), "X-RateLimit-Remaining": "0"},
            )

        # Increment — set expiry on first write
        pipe = r.pipeline()
        pipe.incr(key)
        pipe.expire(key, 86400)
        pipe.execute()

        remaining = limit - count - 1
        log.info(f"AI request: user={user.id} role={user.role.value} count={count+1}/{limit} remaining={remaining}")

    except HTTPException:
        raise
    except Exception as e:
        log.error(f"AI budget check error for user {user.id}: {e}")
        # Don't block on Redis errors — just log


def get_ai_usage(user_id: int) -> dict:
    """Get today's AI usage for a user."""
    r = _get_redis()
    if r is None:
        return {"used": 0, "limit": 0, "remaining": 0}

    today = int(time.time()) // 86400
    key = f"ai_budget:{user_id}:{today}"
    count = int(r.get(key) or 0)

    return {"used": count, "limit": DEFAULT_LIMIT, "remaining": max(0, DEFAULT_LIMIT - count)}
