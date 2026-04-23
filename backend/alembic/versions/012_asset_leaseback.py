"""Asset listings and leaseback marketplace

Revision ID: 012_asset_leaseback
Revises: 011_business_value
Create Date: 2026-04-23
"""
from alembic import op
import sqlalchemy as sa

revision = '012_asset_leaseback'
down_revision = '011_business_value'
branch_labels = None
depends_on = None


def upgrade():
    # Asset listings — owner submits an asset for investor evaluation
    op.create_table(
        'asset_listings',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('owner_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('deal_id', sa.Integer(), sa.ForeignKey('deals.id'), nullable=True),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('asset_type', sa.String(100), nullable=False),  # real_estate, equipment, vehicle, inventory, ip, other
        sa.Column('location', sa.String(255), nullable=True),
        sa.Column('external_link', sa.String(500), nullable=True),   # link to listing/appraisal
        sa.Column('owner_estimated_value', sa.Float(), nullable=True),
        sa.Column('photos_urls', sa.JSON(), nullable=True),           # list of photo URLs
        sa.Column('additional_details', sa.JSON(), nullable=True),    # flexible key/value
        sa.Column('ai_evaluation', sa.JSON(), nullable=True),         # Claude's evaluation
        sa.Column('ai_evaluated_at', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(50), nullable=False, server_default='pending'),
        # pending → evaluated → proposal_sent → under_negotiation → contracted → completed | rejected
        sa.Column('is_visible_to_investors', sa.Boolean(), server_default='false'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # Leaseback proposals — admin proposes to buy + lease back
    op.create_table(
        'leaseback_proposals',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('asset_listing_id', sa.Integer(), sa.ForeignKey('asset_listings.id'), nullable=False),
        sa.Column('proposed_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),  # admin
        sa.Column('owner_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('purchase_price', sa.Float(), nullable=False),
        sa.Column('monthly_lease_payment', sa.Float(), nullable=False),
        sa.Column('lease_term_months', sa.Integer(), nullable=False),
        sa.Column('lease_type', sa.String(50), nullable=False, server_default='operating'),  # operating, finance
        sa.Column('buyback_option', sa.Boolean(), server_default='false'),
        sa.Column('buyback_price', sa.Float(), nullable=True),
        sa.Column('buyback_period_months', sa.Integer(), nullable=True),
        sa.Column('rationale', sa.Text(), nullable=True),            # admin's notes
        sa.Column('ai_analysis', sa.JSON(), nullable=True),          # Claude's deal analysis
        sa.Column('status', sa.String(50), nullable=False, server_default='proposed'),
        # proposed → accepted → declined → contracted → active | terminated
        sa.Column('owner_response_notes', sa.Text(), nullable=True),
        sa.Column('responded_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # Leaseback contracts — generated after owner accepts proposal
    op.create_table(
        'leaseback_contracts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('proposal_id', sa.Integer(), sa.ForeignKey('leaseback_proposals.id'), nullable=False),
        sa.Column('asset_listing_id', sa.Integer(), sa.ForeignKey('asset_listings.id'), nullable=False),
        sa.Column('owner_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('investor_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),  # admin
        sa.Column('contract_content', sa.JSON(), nullable=True),     # AI-generated contract
        sa.Column('contract_html', sa.Text(), nullable=True),        # rendered HTML
        sa.Column('status', sa.String(50), nullable=False, server_default='pending_signature'),
        # pending_signature → owner_signed → investor_signed → fully_executed → active | terminated
        sa.Column('owner_signed_at', sa.DateTime(), nullable=True),
        sa.Column('investor_signed_at', sa.DateTime(), nullable=True),
        sa.Column('effective_date', sa.Date(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table('leaseback_contracts')
    op.drop_table('leaseback_proposals')
    op.drop_table('asset_listings')
