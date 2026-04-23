"""Sprint 2: SBA 1502 reporting, audit prep, collateral monitoring

Revision ID: 008_sprint2_compliance
Revises: 007_sprint1_servicing
Create Date: 2026-04-23
"""
from alembic import op
import sqlalchemy as sa

revision = '008_sprint2_compliance'
down_revision = '007_sprint1_servicing'
branch_labels = None
depends_on = None


def _add_if_missing(table, col_name, col_type):
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = [c['name'] for c in inspector.get_columns(table)]
    if col_name not in existing:
        op.add_column(table, sa.Column(col_name, col_type, nullable=True))


def upgrade():
    # ── Collateral monitoring fields ─────────────────────────────────────────
    for col, typ in [
        ('ucc_filing_number',      sa.String(100)),
        ('ucc_filing_date',        sa.Date()),
        ('ucc_expiration_date',    sa.Date()),
        ('ucc_filing_state',       sa.String(2)),
        ('ucc_continuation_due',   sa.Date()),
        ('insurance_carrier',      sa.String(255)),
        ('insurance_policy_number', sa.String(100)),
        ('insurance_expiration',   sa.Date()),
        ('insurance_coverage_amount', sa.Float()),
        ('insurance_verified_date', sa.Date()),
        ('appraisal_date',         sa.Date()),
        ('appraisal_value',        sa.Float()),
        ('appraisal_firm',         sa.String(255)),
        ('appraisal_next_due',     sa.Date()),
        ('monitoring_notes',       sa.Text()),
        ('last_inspection_date',   sa.Date()),
        ('next_inspection_due',    sa.Date()),
    ]:
        _add_if_missing('prequalified_assets', col, typ)

    # ── SBA 1502 reporting ────────────────────────────────────────────────────
    op.create_table(
        'sba_1502_reports',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('lender_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('reporting_month', sa.Integer(), nullable=False),   # 1-12
        sa.Column('reporting_year', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(50), nullable=False, server_default='draft'),
        sa.Column('loan_count', sa.Integer(), nullable=True),
        sa.Column('total_guaranteed_balance', sa.Float(), nullable=True),
        sa.Column('report_data', sa.JSON(), nullable=True),        # full loan rows
        sa.Column('validation_errors', sa.JSON(), nullable=True),  # validation issues
        sa.Column('generated_at', sa.DateTime(), nullable=True),
        sa.Column('submitted_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # ── SBA audit preparation ─────────────────────────────────────────────────
    op.create_table(
        'sba_audit_files',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('loan_id', sa.Integer(), sa.ForeignKey('executed_loans.id'), nullable=True),
        sa.Column('deal_id', sa.Integer(), sa.ForeignKey('deals.id'), nullable=False),
        sa.Column('lender_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('audit_readiness_score', sa.Integer(), nullable=True),  # 0-100
        sa.Column('checklist', sa.JSON(), nullable=True),          # tab items + completion
        sa.Column('missing_items', sa.JSON(), nullable=True),
        sa.Column('ai_package', sa.JSON(), nullable=True),         # generated audit package
        sa.Column('last_reviewed_at', sa.DateTime(), nullable=True),
        sa.Column('package_generated_at', sa.DateTime(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table('sba_audit_files')
    op.drop_table('sba_1502_reports')
    # Note: collateral columns not dropped to avoid data loss
