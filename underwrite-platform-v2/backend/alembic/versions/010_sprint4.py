"""Sprint 4: Guaranty packages, committee presentations, QBRs, crisis workflows

Revision ID: 010_sprint4
Revises: 009_employee_kpi
Create Date: 2026-04-23
"""
from alembic import op
import sqlalchemy as sa

revision = '010_sprint4'
down_revision = '009_employee_kpi'
branch_labels = None
depends_on = None


def upgrade():
    # Guaranty purchase packages (10-tab SBA default packages)
    op.create_table(
        'guaranty_packages',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('loan_id', sa.Integer(), sa.ForeignKey('executed_loans.id'), nullable=True),
        sa.Column('deal_id', sa.Integer(), sa.ForeignKey('deals.id'), nullable=False),
        sa.Column('lender_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('status', sa.String(50), nullable=False, server_default='draft'),
        sa.Column('default_date', sa.Date(), nullable=True),
        sa.Column('default_reason', sa.Text(), nullable=True),
        sa.Column('ai_package', sa.JSON(), nullable=True),       # full 10-tab package
        sa.Column('tabs_complete', sa.JSON(), nullable=True),    # {tab_id: bool}
        sa.Column('estimated_recovery', sa.Float(), nullable=True),
        sa.Column('sba_loan_number', sa.String(100), nullable=True),
        sa.Column('submitted_at', sa.DateTime(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # Credit committee presentations
    op.create_table(
        'committee_presentations',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('deal_id', sa.Integer(), sa.ForeignKey('deals.id'), nullable=False),
        sa.Column('lender_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('presentation_type', sa.String(50), nullable=False, server_default='credit_committee'),
        sa.Column('ai_content', sa.JSON(), nullable=True),   # full slide content
        sa.Column('status', sa.String(50), nullable=False, server_default='draft'),
        sa.Column('committee_date', sa.Date(), nullable=True),
        sa.Column('decision', sa.String(50), nullable=True),  # approved, declined, deferred, conditions
        sa.Column('decision_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # Quarterly business reviews (borrower-side)
    op.create_table(
        'quarterly_reviews',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('deal_id', sa.Integer(), sa.ForeignKey('deals.id'), nullable=False),
        sa.Column('borrower_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('quarter', sa.Integer(), nullable=False),   # 1-4
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('ai_review', sa.JSON(), nullable=True),
        sa.Column('owner_notes', sa.Text(), nullable=True),
        sa.Column('status', sa.String(50), nullable=False, server_default='draft'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # Crisis response workflows (borrower-side)
    op.create_table(
        'crisis_events',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('deal_id', sa.Integer(), sa.ForeignKey('deals.id'), nullable=False),
        sa.Column('borrower_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('crisis_type', sa.String(100), nullable=False),  # customer_loss, key_person, compliance, cash_crisis, other
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('severity', sa.String(20), nullable=False, server_default='high'),
        sa.Column('ai_response', sa.JSON(), nullable=True),   # 48hr response plan
        sa.Column('status', sa.String(50), nullable=False, server_default='active'),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.Column('resolution_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table('crisis_events')
    op.drop_table('quarterly_reviews')
    op.drop_table('committee_presentations')
    op.drop_table('guaranty_packages')
