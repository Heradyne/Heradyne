"""Business valuation tracking — self-service owner valuations

Revision ID: 014_business_valuations
Revises: 013_notifications
"""
from alembic import op
import sqlalchemy as sa

revision = '014_business_valuations'
down_revision = '013_notifications'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'business_valuations',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('owner_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('deal_id', sa.Integer(), sa.ForeignKey('deals.id'), nullable=True),

        # What the owner told us
        sa.Column('business_description', sa.Text(), nullable=True),
        sa.Column('industry', sa.String(255), nullable=True),
        sa.Column('years_in_business', sa.Integer(), nullable=True),
        sa.Column('num_employees', sa.Integer(), nullable=True),
        sa.Column('owner_hours_per_week', sa.Integer(), nullable=True),
        sa.Column('owner_role_description', sa.Text(), nullable=True),
        sa.Column('key_customers', sa.Text(), nullable=True),       # top customers narrative
        sa.Column('customer_concentration_pct', sa.Float(), nullable=True),  # % from top customer
        sa.Column('recurring_revenue_pct', sa.Float(), nullable=True),
        sa.Column('has_written_processes', sa.Boolean(), nullable=True),
        sa.Column('has_management_team', sa.Boolean(), nullable=True),
        sa.Column('growth_rate_pct', sa.Float(), nullable=True),    # YoY revenue growth

        # Financial inputs (manual or from integrations)
        sa.Column('annual_revenue', sa.Float(), nullable=True),
        sa.Column('gross_profit', sa.Float(), nullable=True),
        sa.Column('ebitda', sa.Float(), nullable=True),
        sa.Column('owner_compensation', sa.Float(), nullable=True),
        sa.Column('owner_benefits', sa.Float(), nullable=True),
        sa.Column('one_time_expenses', sa.Float(), nullable=True),
        sa.Column('inventory_value', sa.Float(), nullable=True),
        sa.Column('equipment_value', sa.Float(), nullable=True),
        sa.Column('real_estate_value', sa.Float(), nullable=True),
        sa.Column('total_debt', sa.Float(), nullable=True),
        sa.Column('cash_on_hand', sa.Float(), nullable=True),

        # Data source flags
        sa.Column('has_tax_returns', sa.Boolean(), server_default='false'),
        sa.Column('has_bank_connection', sa.Boolean(), server_default='false'),
        sa.Column('has_payroll_connection', sa.Boolean(), server_default='false'),
        sa.Column('tax_return_years', sa.JSON(), nullable=True),    # [2022, 2023, 2024]
        sa.Column('bank_provider', sa.String(100), nullable=True),
        sa.Column('payroll_provider', sa.String(100), nullable=True),

        # AI valuation results
        sa.Column('ai_valuation', sa.JSON(), nullable=True),
        sa.Column('valuation_low', sa.Float(), nullable=True),
        sa.Column('valuation_mid', sa.Float(), nullable=True),
        sa.Column('valuation_high', sa.Float(), nullable=True),
        sa.Column('sde', sa.Float(), nullable=True),
        sa.Column('sde_multiple_low', sa.Float(), nullable=True),
        sa.Column('sde_multiple_mid', sa.Float(), nullable=True),
        sa.Column('sde_multiple_high', sa.Float(), nullable=True),
        sa.Column('owner_dependency_score', sa.Integer(), nullable=True),  # 0-100, lower = worse
        sa.Column('overall_quality_score', sa.Integer(), nullable=True),   # 0-100

        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_index('ix_bv_owner_id', 'business_valuations', ['owner_id'])


def downgrade():
    op.drop_table('business_valuations')
