"""Security fields: MFA, audit tracking, soft delete, deal redaction

Revision ID: 004_security
Revises: 003_missing_columns
Create Date: 2026-04-07
"""
from alembic import op
import sqlalchemy as sa

revision = '004_security'
down_revision = '003_missing_columns'
branch_labels = None
depends_on = None


def _add_if_missing(table, col_name, col_type):
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = [c['name'] for c in inspector.get_columns(table)]
    if col_name not in existing:
        op.add_column(table, sa.Column(col_name, col_type, nullable=True))


def upgrade():
    # ── User security fields ──────────────────────────────────────────────────
    for col, typ in [
        ('totp_secret',         sa.String(64)),
        ('mfa_enabled',         sa.Boolean()),
        ('failed_login_count',  sa.Integer()),
        ('last_failed_login',   sa.DateTime()),
        ('last_login_at',       sa.DateTime()),
        ('last_login_ip',       sa.String(50)),
        ('deleted_at',          sa.DateTime()),
        ('pii_redacted_at',     sa.DateTime()),
    ]:
        _add_if_missing('users', col, typ)

    # Set defaults for existing rows
    conn = op.get_bind()
    conn.execute(sa.text("UPDATE users SET mfa_enabled = false WHERE mfa_enabled IS NULL"))
    conn.execute(sa.text("UPDATE users SET failed_login_count = 0 WHERE failed_login_count IS NULL"))

    # ── Deal soft-delete ──────────────────────────────────────────────────────
    for col, typ in [
        ('deleted_at',      sa.DateTime()),
        ('redacted_at',     sa.DateTime()),
        ('redaction_reason',sa.String(255)),
    ]:
        _add_if_missing('deals', col, typ)

    # ── Audit log: ensure ip_address index ───────────────────────────────────
    # Make audit logs immutable via DB trigger
    try:
        _add_immutable_audit_trigger(op.get_bind())
    except Exception:
        pass

    try:
        op.create_index('ix_audit_logs_created_at', 'audit_logs', ['created_at'])
    except Exception:
        pass
    try:
        op.create_index('ix_audit_logs_user_id_action', 'audit_logs', ['user_id', 'action'])
    except Exception:
        pass


def downgrade():
    for col in ['totp_secret','mfa_enabled','failed_login_count','last_failed_login',
                'last_login_at','last_login_ip','deleted_at','pii_redacted_at']:
        try:
            op.drop_column('users', col)
        except Exception:
            pass
    for col in ['deleted_at','redacted_at','redaction_reason']:
        try:
            op.drop_column('deals', col)
        except Exception:
            pass


def _add_immutable_audit_trigger(conn):
    """Postgres trigger: prevent UPDATE/DELETE on audit_logs."""
    conn.execute(sa.text("""
        CREATE OR REPLACE FUNCTION prevent_audit_modification()
        RETURNS TRIGGER AS $$
        BEGIN
            RAISE EXCEPTION 'Audit logs are immutable and cannot be modified or deleted';
        END;
        $$ LANGUAGE plpgsql;
    """))
    # Drop if exists first to allow re-running
    conn.execute(sa.text("""
        DROP TRIGGER IF EXISTS audit_logs_immutable ON audit_logs;
    """))
    conn.execute(sa.text("""
        CREATE TRIGGER audit_logs_immutable
        BEFORE UPDATE OR DELETE ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
    """))
