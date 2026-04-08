from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.api.v1 import api_router

# ── Sentry error tracking ─────────────────────────────────────────────────────
if settings.SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        integrations=[FastApiIntegration(), SqlalchemyIntegration()],
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        environment=settings.ENVIRONMENT,
        # Never send PII to Sentry
        send_default_pii=False,
        before_send=lambda event, hint: _scrub_sentry_event(event),
    )

    def _scrub_sentry_event(event: dict) -> dict:
        """Strip any PII from Sentry events before sending."""
        # Remove Authorization headers and cookies
        if "request" in event:
            req = event["request"]
            if "headers" in req:
                for key in list(req["headers"].keys()):
                    if key.lower() in ("authorization", "cookie", "set-cookie"):
                        req["headers"][key] = "[Filtered]"
            req.pop("cookies", None)
        return event

# ── Rate limiter ──────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address, default_limits=[settings.RATE_LIMIT_API])

app = FastAPI(
    title="UnderwriteOS + Heradyne Platform API",
    version="2.0.0",
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── Security headers middleware ───────────────────────────────────────────────
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "  # unsafe-inline needed for Next.js hydration
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data: blob:; "
        "connect-src 'self'; "
        "frame-ancestors 'none'; "
        "form-action 'self';"
    )
    return response

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,   # Required for httpOnly cookies
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
    expose_headers=["Content-Disposition", "Content-Type", "Content-Length"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/")
def root():
    return {
        "name": "UnderwriteOS + Heradyne Platform API",
        "version": "2.0.0",
        "disclaimer": "Heradyne is an informational platform only.",
    }


@app.get("/health")
def health_check():
    """
    Health check endpoint for uptime monitoring.
    Returns component status so monitors can detect partial failures.
    """
    import time
    from app.core.database import engine
    from sqlalchemy import text as sql_text

    components = {}
    overall = "healthy"

    # Database check
    try:
        with engine.connect() as conn:
            conn.execute(sql_text("SELECT 1"))
        components["database"] = "healthy"
    except Exception:
        components["database"] = "unhealthy"
        overall = "degraded"

    # Redis check
    try:
        from app.core.security import _get_redis
        r = _get_redis()
        r.ping()
        components["redis"] = "healthy"
    except Exception:
        components["redis"] = "unhealthy"
        # Redis down = token blacklist unavailable, but not fatal
        if overall == "healthy":
            overall = "degraded"

    return {
        "status": overall,
        "components": components,
        "timestamp": int(time.time()),
        "version": "2.0.0",
    }
