"""Business forecasts table

Revision ID: 015_business_forecasts
Revises: 014_business_valuations
"""
from alembic import op
import sqlalchemy as sa

revision = '015_business_forecasts'
down_revision = '014_business_valuations'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'business_forecasts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('owner_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('valuation_id', sa.Integer(), sa.ForeignKey('business_valuations.id'), nullable=True),
        sa.Column('decisions', sa.JSON(), nullable=True),
        sa.Column('ai_forecast', sa.JSON(), nullable=True),
        sa.Column('scenario_used', sa.String(50), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table('business_forecasts')
