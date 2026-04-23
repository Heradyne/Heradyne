"""Add custom_criteria to lender and insurer policies

Revision ID: 006_custom_criteria
Revises: 005_encrypt_pii
Create Date: 2026-04-15
"""
from alembic import op
import sqlalchemy as sa

revision = '006_custom_criteria'
down_revision = '005_encrypt_pii'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('lender_policies', sa.Column('custom_criteria', sa.JSON(), nullable=True))
    op.add_column('insurer_policies', sa.Column('custom_criteria', sa.JSON(), nullable=True))


def downgrade():
    op.drop_column('lender_policies', 'custom_criteria')
    op.drop_column('insurer_policies', 'custom_criteria')
