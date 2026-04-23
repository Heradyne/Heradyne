"""Add covenant tracking and annual review tables

Revision ID: 007_sprint1_servicing
Revises: 006_custom_criteria
Create Date: 2026-04-23
"""
from alembic import op
import sqlalchemy as sa

revision = '007_sprint1_servicing'
down_revision = '006_custom_criteria'
branch_labels = None
depends_on = None


def upgrade():
    # Loan covenants table
    op.create_table(
        'loan_covenants',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('loan_id', sa.Integer(), sa.ForeignKey('executed_loans.id'), nullable=True),
        sa.Column('deal_id', sa.Integer(), sa.ForeignKey('deals.id'), nullable=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('covenant_type', sa.String(50), nullable=False),  # dscr, reporting, insurance, other
        sa.Column('required_value', sa.Float(), nullable=True),
        sa.Column('required_text', sa.Text(), nullable=True),
        sa.Column('measurement_date', sa.Date(), nullable=True),
        sa.Column('frequency', sa.String(50), nullable=False, server_default='annual'),  # monthly, quarterly, annual
        sa.Column('is_active', sa.Boolean(), server_default='true'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    # Covenant checks / compliance events
    op.create_table(
        'covenant_checks',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('covenant_id', sa.Integer(), sa.ForeignKey('loan_covenants.id'), nullable=False),
        sa.Column('check_date', sa.Date(), nullable=False),
        sa.Column('actual_value', sa.Float(), nullable=True),
        sa.Column('actual_text', sa.Text(), nullable=True),
        sa.Column('status', sa.String(50), nullable=False, server_default='compliant'),  # compliant, watch, breach, waived
        sa.Column('ai_analysis', sa.JSON(), nullable=True),
        sa.Column('letter_generated', sa.Boolean(), server_default='false'),
        sa.Column('letter_content', sa.Text(), nullable=True),
        sa.Column('letter_sent_at', sa.DateTime(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('checked_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # Annual reviews
    op.create_table(
        'annual_reviews',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('loan_id', sa.Integer(), sa.ForeignKey('executed_loans.id'), nullable=True),
        sa.Column('deal_id', sa.Integer(), sa.ForeignKey('deals.id'), nullable=False),
        sa.Column('review_year', sa.Integer(), nullable=False),
        sa.Column('review_type', sa.String(50), nullable=False, server_default='annual'),  # annual, site_visit, interim
        sa.Column('status', sa.String(50), nullable=False, server_default='pending'),  # pending, in_progress, complete
        sa.Column('scheduled_date', sa.Date(), nullable=True),
        sa.Column('completed_date', sa.Date(), nullable=True),
        sa.Column('ai_report', sa.JSON(), nullable=True),
        sa.Column('site_visit_prep', sa.JSON(), nullable=True),
        sa.Column('site_visit_notes', sa.Text(), nullable=True),
        sa.Column('lender_notes', sa.Text(), nullable=True),
        sa.Column('financial_data_submitted', sa.Boolean(), server_default='false'),
        sa.Column('financial_data', sa.JSON(), nullable=True),
        sa.Column('reviewed_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )


def downgrade():
    op.drop_table('annual_reviews')
    op.drop_table('covenant_checks')
    op.drop_table('loan_covenants')
