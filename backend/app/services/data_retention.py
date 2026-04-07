"""
Data retention & PII redaction service.

- Soft-delete deals after 90 days in declined status
- Redact PII from soft-deleted deals
- Right-to-erasure for CCPA/GDPR compliance
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.models.deal import Deal, DealStatus
from app.models.user import User
from app.services.audit import audit_service


_REDACTED = "[REDACTED]"
_REDACT_AFTER_DAYS = 90


def redact_deal_pii(deal: Deal, db: Session, reason: str = "retention_policy") -> None:
    """Redact PII from a soft-deleted deal."""
    if deal.redacted_at:
        return  # already redacted

    # Clear sensitive financial fields that contain PII
    deal.borrower_name = _REDACTED
    deal.owner_name = _REDACTED if hasattr(deal, 'owner_name') else None
    deal.personal_assets = []
    deal.owner_credit_score = None
    deal.redacted_at = datetime.now(timezone.utc)
    deal.redaction_reason = reason
    db.commit()


def soft_delete_deal(deal: Deal, db: Session, deleted_by: Optional[int] = None) -> None:
    """Soft-delete a deal (mark deleted_at, don't physically remove)."""
    deal.deleted_at = datetime.now(timezone.utc)
    db.commit()
    audit_service.log(
        db=db, action="deal_soft_deleted", entity_type="deal",
        entity_id=deal.id, user_id=deleted_by,
        details={"reason": "soft_delete"},
    )


def run_retention_cleanup(db: Session) -> dict:
    """
    Scheduled task: redact PII from declined deals older than 90 days.
    Call from Celery beat or a management command.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=_REDACT_AFTER_DAYS)
    stats = {"deals_redacted": 0, "errors": 0}

    # Find declined deals past retention window, not yet redacted
    deals = db.query(Deal).filter(
        Deal.status == DealStatus.DECLINED,
        Deal.updated_at < cutoff,
        Deal.redacted_at.is_(None),
    ).all()

    for deal in deals:
        try:
            if not deal.deleted_at:
                soft_delete_deal(deal, db)
            redact_deal_pii(deal, db, reason="automated_retention_policy")
            stats["deals_redacted"] += 1
        except Exception as e:
            stats["errors"] += 1

    return stats


def erase_user_data(user: User, db: Session, requested_by_id: int) -> dict:
    """
    Right-to-erasure: anonymize a user's PII while preserving audit trail.
    CCPA/GDPR §17 compliance.
    """
    stats = {"deals_redacted": 0}

    # Anonymize user PII
    user.email = f"deleted_{user.id}@redacted.invalid"
    user.full_name = _REDACTED
    user.company_name = _REDACTED
    user.hashed_password = "ERASED"
    user.totp_secret = None
    user.is_active = False
    user.deleted_at = datetime.now(timezone.utc)
    user.pii_redacted_at = datetime.now(timezone.utc)

    # Redact their deals
    for deal in db.query(Deal).filter(Deal.borrower_id == user.id).all():
        try:
            redact_deal_pii(deal, db, reason="user_erasure_request")
            stats["deals_redacted"] += 1
        except Exception:
            pass

    db.commit()

    audit_service.log(
        db=db, action="user_data_erased", entity_type="user",
        entity_id=user.id, user_id=requested_by_id,
        details={"reason": "erasure_request", **stats},
    )
    return stats
