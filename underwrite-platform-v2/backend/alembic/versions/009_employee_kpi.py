"""Employee Ownership KPI Module

Revision ID: 009_employee_kpi
Revises: 008_sprint2_compliance
Create Date: 2026-04-23
"""
from alembic import op
import sqlalchemy as sa

revision = '009_employee_kpi'
down_revision = '008_sprint2_compliance'
branch_labels = None
depends_on = None


def _add_if_missing(table, col_name, col_type):
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = [c['name'] for c in inspector.get_columns(table)]
    if col_name not in existing:
        op.add_column(table, sa.Column(col_name, col_type, nullable=True))


def upgrade():
    # ── Extend UserRole enum to include employee ──────────────────────────────
    # SQLAlchemy native_enum=False stores as VARCHAR — just add the value in app code
    # No migration needed for the enum itself since it's stored as a string

    # ── Add employee invite token to users ───────────────────────────────────
    _add_if_missing('users', 'invited_by_id', sa.Integer())
    _add_if_missing('users', 'job_title', sa.String(255))

    # ── Business KPIs ────────────────────────────────────────────────────────
    op.create_table(
        'business_kpis',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('owner_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('deal_id', sa.Integer(), sa.ForeignKey('deals.id'), nullable=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('category', sa.String(50), nullable=False),
        sa.Column('target_value', sa.Float(), nullable=True),
        sa.Column('unit', sa.String(50), nullable=True),
        sa.Column('period', sa.String(50), nullable=False, server_default='annual'),
        sa.Column('weight', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('is_active', sa.Boolean(), server_default='true'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # ── Employee KPIs ────────────────────────────────────────────────────────
    op.create_table(
        'employee_kpis',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('employee_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('business_kpi_id', sa.Integer(), sa.ForeignKey('business_kpis.id'), nullable=False),
        sa.Column('personal_target', sa.Float(), nullable=True),
        sa.Column('measurement_method', sa.Text(), nullable=True),
        sa.Column('role_description', sa.String(255), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # ── Contributions ────────────────────────────────────────────────────────
    op.create_table(
        'contributions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('employee_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('owner_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('deal_id', sa.Integer(), sa.ForeignKey('deals.id'), nullable=True),
        sa.Column('type', sa.String(50), nullable=False),  # suggestion, above_beyond
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('category', sa.String(50), nullable=False),
        sa.Column('status', sa.String(50), nullable=False, server_default='pending'),
        sa.Column('evidence', sa.Text(), nullable=True),
        sa.Column('action_date', sa.Date(), nullable=True),
        sa.Column('final_value', sa.Float(), nullable=True),
        sa.Column('approved_at', sa.DateTime(), nullable=True),
        sa.Column('withdrawn_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # ── AI Evaluations ───────────────────────────────────────────────────────
    op.create_table(
        'ai_evaluations',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('contribution_id', sa.Integer(), sa.ForeignKey('contributions.id'), nullable=False),
        sa.Column('value_low', sa.Float(), nullable=True),
        sa.Column('value_mid', sa.Float(), nullable=True),
        sa.Column('value_high', sa.Float(), nullable=True),
        sa.Column('value_unit', sa.String(50), nullable=True),
        sa.Column('reasoning', sa.JSON(), nullable=True),
        sa.Column('linked_kpis', sa.JSON(), nullable=True),
        sa.Column('confidence', sa.String(20), nullable=True),
        sa.Column('confidence_reason', sa.Text(), nullable=True),
        sa.Column('clarifying_questions', sa.JSON(), nullable=True),
        sa.Column('is_intangible', sa.Boolean(), server_default='false'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # ── Manager Reviews ──────────────────────────────────────────────────────
    op.create_table(
        'manager_reviews',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('contribution_id', sa.Integer(), sa.ForeignKey('contributions.id'), nullable=False),
        sa.Column('manager_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('decision', sa.String(20), nullable=False),  # agree, adjust, decline
        sa.Column('adjusted_value', sa.Float(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=False),
        sa.Column('reviewed_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # ── Discussion Threads ───────────────────────────────────────────────────
    op.create_table(
        'contribution_discussions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('contribution_id', sa.Integer(), sa.ForeignKey('contributions.id'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # ── Employee Invites ─────────────────────────────────────────────────────
    op.create_table(
        'employee_invites',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('owner_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('full_name', sa.String(255), nullable=False),
        sa.Column('job_title', sa.String(255), nullable=True),
        sa.Column('token', sa.String(64), unique=True, nullable=False),
        sa.Column('accepted_at', sa.DateTime(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table('employee_invites')
    op.drop_table('contribution_discussions')
    op.drop_table('manager_reviews')
    op.drop_table('ai_evaluations')
    op.drop_table('contributions')
    op.drop_table('employee_kpis')
    op.drop_table('business_kpis')
