"""Lender tools: pipeline CRM, comms hub, benchmarking, stress tests

Revision ID: 016_lender_tools
Revises: 015_business_forecasts
"""
from alembic import op
import sqlalchemy as sa

revision = '016_lender_tools'
down_revision = '015_business_forecasts'
branch_labels = None
depends_on = None


def upgrade():
    # Pipeline CRM — deal stage tracking + reminders
    op.create_table(
        'pipeline_stages',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('deal_id', sa.Integer(), sa.ForeignKey('deals.id'), nullable=False),
        sa.Column('lender_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('stage', sa.String(50), nullable=False, default='prospect'),
        # prospect → application → underwriting → approved → closed → servicing → rejected
        sa.Column('stage_entered_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('days_in_stage', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('next_action', sa.Text(), nullable=True),
        sa.Column('next_action_date', sa.DateTime(), nullable=True),
        sa.Column('priority', sa.String(20), default='normal'),  # low, normal, high, urgent
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_pipeline_lender', 'pipeline_stages', ['lender_id'])
    op.create_index('ix_pipeline_deal', 'pipeline_stages', ['deal_id'])

    # Borrower Communication Hub — threads and messages
    op.create_table(
        'deal_threads',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('deal_id', sa.Integer(), sa.ForeignKey('deals.id'), nullable=False),
        sa.Column('subject', sa.String(255), nullable=False),
        sa.Column('thread_type', sa.String(50), default='general'),
        # general, document_request, condition, question
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('is_resolved', sa.Boolean(), default=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        'thread_messages',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('thread_id', sa.Integer(), sa.ForeignKey('deal_threads.id'), nullable=False),
        sa.Column('sender_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('is_read', sa.Boolean(), default=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # Document request checklists
    op.create_table(
        'doc_requests',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('deal_id', sa.Integer(), sa.ForeignKey('deals.id'), nullable=False),
        sa.Column('lender_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('items', sa.JSON(), nullable=True),
        # [{name, description, required, completed, completed_at, document_id}]
        sa.Column('due_date', sa.DateTime(), nullable=True),
        sa.Column('reminder_sent_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # Peer benchmarking snapshots (anonymous)
    op.create_table(
        'portfolio_snapshots',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('lender_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('snapshot_date', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('total_loans', sa.Integer(), default=0),
        sa.Column('total_exposure', sa.Float(), default=0),
        sa.Column('avg_dscr', sa.Float(), nullable=True),
        sa.Column('avg_ltv', sa.Float(), nullable=True),
        sa.Column('avg_loan_size', sa.Float(), nullable=True),
        sa.Column('approval_rate', sa.Float(), nullable=True),
        sa.Column('default_rate', sa.Float(), nullable=True),
        sa.Column('avg_days_to_close', sa.Float(), nullable=True),
        sa.Column('industry_mix', sa.JSON(), nullable=True),
        sa.Column('status_mix', sa.JSON(), nullable=True),
        sa.Column('vintage_mix', sa.JSON(), nullable=True),
        sa.Column('geographic_mix', sa.JSON(), nullable=True),
    )

    # Stress test runs
    op.create_table(
        'stress_tests',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('lender_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('scenario_name', sa.String(255), nullable=False),
        sa.Column('parameters', sa.JSON(), nullable=True),
        sa.Column('results', sa.JSON(), nullable=True),
        sa.Column('loans_at_risk', sa.Integer(), nullable=True),
        sa.Column('exposure_at_risk', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table('stress_tests')
    op.drop_table('portfolio_snapshots')
    op.drop_table('doc_requests')
    op.drop_table('thread_messages')
    op.drop_table('deal_threads')
    op.drop_table('pipeline_stages')
