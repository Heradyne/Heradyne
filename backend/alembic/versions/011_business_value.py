"""Business value hub: sale listings and investment summaries

Revision ID: 011_business_value
Revises: 010_sprint4
Create Date: 2026-04-23
"""
from alembic import op
import sqlalchemy as sa

revision = '011_business_value'
down_revision = '010_sprint4'
branch_labels = None
depends_on = None


def _add_if_missing(table, col_name, col_type):
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = [c['name'] for c in inspector.get_columns(table)]
    if col_name not in existing:
        op.add_column(table, sa.Column(col_name, col_type, nullable=True))


def upgrade():
    # Sale listings — when an owner marks their business for sale
    op.create_table(
        'sale_listings',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('deal_id', sa.Integer(), sa.ForeignKey('deals.id'), nullable=False),
        sa.Column('owner_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('status', sa.String(50), nullable=False, server_default='active'),  # active, under_loi, sold, withdrawn
        sa.Column('asking_price', sa.Float(), nullable=True),
        sa.Column('motivation', sa.Text(), nullable=True),           # why selling
        sa.Column('ideal_buyer', sa.Text(), nullable=True),          # type of buyer sought
        sa.Column('transition_period', sa.Integer(), nullable=True), # months seller will stay
        sa.Column('seller_financing', sa.Boolean(), server_default='false'),
        sa.Column('seller_financing_amount', sa.Float(), nullable=True),
        sa.Column('is_public', sa.Boolean(), server_default='false'), # visible to buyers
        sa.Column('listed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # Investment summaries (CIM - Confidential Information Memorandum)
    op.create_table(
        'investment_summaries',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('listing_id', sa.Integer(), sa.ForeignKey('sale_listings.id'), nullable=False),
        sa.Column('deal_id', sa.Integer(), sa.ForeignKey('deals.id'), nullable=False),
        sa.Column('owner_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('ai_content', sa.JSON(), nullable=True),            # full CIM content
        sa.Column('version', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('view_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # Value growth suggestions — AI-generated periodically
    op.create_table(
        'value_growth_plans',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('deal_id', sa.Integer(), sa.ForeignKey('deals.id'), nullable=False),
        sa.Column('owner_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('ai_plan', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table('value_growth_plans')
    op.drop_table('investment_summaries')
    op.drop_table('sale_listings')
