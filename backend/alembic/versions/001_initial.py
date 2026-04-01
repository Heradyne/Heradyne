"""Initial migration

Revision ID: 001_initial
Revises: 
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Users table
    op.create_table('users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('full_name', sa.String(length=255), nullable=False),
        sa.Column('company_name', sa.String(length=255), nullable=True),
        sa.Column('role', sa.String(length=50), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=True, default=True),
        sa.Column('must_change_password', sa.Boolean(), nullable=True, default=False),
        sa.Column('organization_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)
    op.create_index(op.f('ix_users_organization_id'), 'users', ['organization_id'], unique=False)

    # Deals table
    op.create_table('deals',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('borrower_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('deal_type', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=True),
        sa.Column('industry', sa.String(length=100), nullable=False),
        sa.Column('business_description', sa.Text(), nullable=True),
        sa.Column('loan_amount_requested', sa.Float(), nullable=False),
        sa.Column('loan_term_months', sa.Integer(), nullable=False),
        sa.Column('annual_revenue', sa.Float(), nullable=False),
        sa.Column('gross_profit', sa.Float(), nullable=True),
        sa.Column('ebitda', sa.Float(), nullable=False),
        sa.Column('capex', sa.Float(), nullable=True),
        sa.Column('debt_service', sa.Float(), nullable=True),
        sa.Column('addbacks', sa.JSON(), nullable=True),
        sa.Column('purchase_price', sa.Float(), nullable=True),
        sa.Column('equity_injection', sa.Float(), nullable=True),
        sa.Column('business_assets', sa.JSON(), nullable=True),
        sa.Column('personal_assets', sa.JSON(), nullable=True),
        sa.Column('owner_credit_score', sa.Integer(), nullable=True),
        sa.Column('owner_experience_years', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['borrower_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_deals_id'), 'deals', ['id'], unique=False)

    # Deal Documents table
    op.create_table('deal_documents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('deal_id', sa.Integer(), nullable=False),
        sa.Column('filename', sa.String(length=255), nullable=False),
        sa.Column('original_filename', sa.String(length=255), nullable=False),
        sa.Column('file_path', sa.String(length=500), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=False),
        sa.Column('mime_type', sa.String(length=100), nullable=True),
        sa.Column('document_type', sa.String(length=100), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['deal_id'], ['deals.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_deal_documents_id'), 'deal_documents', ['id'], unique=False)

    # Deal Risk Reports table
    op.create_table('deal_risk_reports',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('deal_id', sa.Integer(), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('normalized_ebitda', sa.Float(), nullable=True),
        sa.Column('post_debt_fcf', sa.Float(), nullable=True),
        sa.Column('dscr_base', sa.Float(), nullable=True),
        sa.Column('dscr_stress', sa.Float(), nullable=True),
        sa.Column('sba_anchor_pd', sa.Float(), nullable=True),
        sa.Column('industry_multiplier', sa.Float(), nullable=True),
        sa.Column('leverage_multiplier', sa.Float(), nullable=True),
        sa.Column('volatility_multiplier', sa.Float(), nullable=True),
        sa.Column('annual_pd', sa.Float(), nullable=True),
        sa.Column('ev_low', sa.Float(), nullable=True),
        sa.Column('ev_mid', sa.Float(), nullable=True),
        sa.Column('ev_high', sa.Float(), nullable=True),
        sa.Column('durability_score', sa.Float(), nullable=True),
        sa.Column('business_nolv', sa.Float(), nullable=True),
        sa.Column('personal_nolv', sa.Float(), nullable=True),
        sa.Column('total_nolv', sa.Float(), nullable=True),
        sa.Column('collateral_coverage', sa.Float(), nullable=True),
        sa.Column('recommended_guarantee_pct', sa.Float(), nullable=True),
        sa.Column('recommended_escrow_pct', sa.Float(), nullable=True),
        sa.Column('recommended_alignment', sa.JSON(), nullable=True),
        # Document verification fields
        sa.Column('verification_status', sa.String(length=50), nullable=True),
        sa.Column('verification_confidence', sa.Float(), nullable=True),
        sa.Column('verification_flags', sa.JSON(), nullable=True),
        sa.Column('documents_verified', sa.Integer(), nullable=True),
        sa.Column('report_data', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['deal_id'], ['deals.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_deal_risk_reports_id'), 'deal_risk_reports', ['id'], unique=False)

    # Lender Policies table
    op.create_table('lender_policies',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('lender_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('min_loan_size', sa.Float(), nullable=True),
        sa.Column('max_loan_size', sa.Float(), nullable=True),
        sa.Column('min_dscr', sa.Float(), nullable=True),
        sa.Column('max_pd', sa.Float(), nullable=True),
        sa.Column('max_leverage', sa.Float(), nullable=True),
        sa.Column('min_collateral_coverage', sa.Float(), nullable=True),
        sa.Column('allowed_industries', sa.JSON(), nullable=True),
        sa.Column('excluded_industries', sa.JSON(), nullable=True),
        sa.Column('min_term_months', sa.Integer(), nullable=True),
        sa.Column('max_term_months', sa.Integer(), nullable=True),
        sa.Column('target_rate_min', sa.Float(), nullable=True),
        sa.Column('target_rate_max', sa.Float(), nullable=True),
        sa.Column('allowed_deal_types', sa.JSON(), nullable=True),
        # Auto-decision thresholds
        sa.Column('auto_accept_threshold', sa.Float(), nullable=True),
        sa.Column('auto_reject_threshold', sa.Float(), nullable=True),
        sa.Column('counter_offer_min', sa.Float(), nullable=True),
        sa.Column('counter_offer_max', sa.Float(), nullable=True),
        sa.Column('auto_decision_enabled', sa.Boolean(), nullable=True, default=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['lender_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_lender_policies_id'), 'lender_policies', ['id'], unique=False)

    # Insurer Policies table
    op.create_table('insurer_policies',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('insurer_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('max_expected_loss', sa.Float(), nullable=True),
        sa.Column('min_attachment_point', sa.Float(), nullable=True),
        sa.Column('max_attachment_point', sa.Float(), nullable=True),
        sa.Column('target_premium_min', sa.Float(), nullable=True),
        sa.Column('target_premium_max', sa.Float(), nullable=True),
        sa.Column('min_coverage_amount', sa.Float(), nullable=True),
        sa.Column('max_coverage_amount', sa.Float(), nullable=True),
        sa.Column('allowed_industries', sa.JSON(), nullable=True),
        sa.Column('excluded_industries', sa.JSON(), nullable=True),
        sa.Column('allowed_deal_types', sa.JSON(), nullable=True),
        # Auto-decision thresholds
        sa.Column('auto_accept_threshold', sa.Float(), nullable=True),
        sa.Column('auto_reject_threshold', sa.Float(), nullable=True),
        sa.Column('counter_offer_min', sa.Float(), nullable=True),
        sa.Column('counter_offer_max', sa.Float(), nullable=True),
        sa.Column('auto_decision_enabled', sa.Boolean(), nullable=True, default=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['insurer_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_insurer_policies_id'), 'insurer_policies', ['id'], unique=False)

    # Deal Matches table
    op.create_table('deal_matches',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('deal_id', sa.Integer(), nullable=False),
        sa.Column('lender_policy_id', sa.Integer(), nullable=True),
        sa.Column('insurer_policy_id', sa.Integer(), nullable=True),
        sa.Column('match_score', sa.Float(), nullable=True),
        sa.Column('match_reasons', sa.JSON(), nullable=True),
        sa.Column('constraints_met', sa.JSON(), nullable=True),
        sa.Column('constraints_failed', sa.JSON(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=True),
        sa.Column('decision_notes', sa.Text(), nullable=True),
        sa.Column('decision_at', sa.DateTime(), nullable=True),
        # Auto-decision fields
        sa.Column('auto_decision', sa.Boolean(), nullable=True, default=False),
        sa.Column('auto_decision_reason', sa.String(length=100), nullable=True),
        # Counter-offer fields
        sa.Column('counter_offer', sa.JSON(), nullable=True),
        sa.Column('counter_offer_at', sa.DateTime(), nullable=True),
        sa.Column('counter_offer_expires_at', sa.DateTime(), nullable=True),
        sa.Column('borrower_response', sa.String(length=50), nullable=True),
        sa.Column('borrower_response_at', sa.DateTime(), nullable=True),
        sa.Column('borrower_response_notes', sa.Text(), nullable=True),
        sa.Column('scenarios', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['deal_id'], ['deals.id'], ),
        sa.ForeignKeyConstraint(['lender_policy_id'], ['lender_policies.id'], ),
        sa.ForeignKeyConstraint(['insurer_policy_id'], ['insurer_policies.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_deal_matches_id'), 'deal_matches', ['id'], unique=False)

    # Monthly Cashflows table
    op.create_table('monthly_cashflows',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('deal_id', sa.Integer(), nullable=False),
        sa.Column('month', sa.Integer(), nullable=False),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('revenue', sa.Float(), nullable=False),
        sa.Column('ebitda', sa.Float(), nullable=False),
        sa.Column('debt_service', sa.Float(), nullable=True),
        sa.Column('post_debt_fcf', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['deal_id'], ['deals.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_monthly_cashflows_id'), 'monthly_cashflows', ['id'], unique=False)

    # Fee Ledger table
    op.create_table('fee_ledger',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('deal_id', sa.Integer(), nullable=False),
        sa.Column('month', sa.Integer(), nullable=False),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('post_debt_fcf', sa.Float(), nullable=False),
        sa.Column('fee_rate', sa.Float(), nullable=False),
        sa.Column('calculated_fee', sa.Float(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['deal_id'], ['deals.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_fee_ledger_id'), 'fee_ledger', ['id'], unique=False)

    # System Assumptions table
    op.create_table('system_assumptions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('category', sa.String(length=100), nullable=False),
        sa.Column('key', sa.String(length=100), nullable=False),
        sa.Column('value', sa.JSON(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'category', 'key', name='uq_user_category_key')
    )
    op.create_index(op.f('ix_system_assumptions_category'), 'system_assumptions', ['category'], unique=False)
    op.create_index(op.f('ix_system_assumptions_id'), 'system_assumptions', ['id'], unique=False)
    op.create_index(op.f('ix_system_assumptions_key'), 'system_assumptions', ['key'], unique=False)
    op.create_index(op.f('ix_system_assumptions_user_id'), 'system_assumptions', ['user_id'], unique=False)

    # Audit Logs table
    op.create_table('audit_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('action', sa.String(length=100), nullable=False),
        sa.Column('entity_type', sa.String(length=100), nullable=False),
        sa.Column('entity_id', sa.Integer(), nullable=True),
        sa.Column('details', sa.JSON(), nullable=True),
        sa.Column('ip_address', sa.String(length=50), nullable=True),
        sa.Column('user_agent', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_audit_logs_action'), 'audit_logs', ['action'], unique=False)
    op.create_index(op.f('ix_audit_logs_entity_type'), 'audit_logs', ['entity_type'], unique=False)
    op.create_index(op.f('ix_audit_logs_id'), 'audit_logs', ['id'], unique=False)

    # Executed Loans table
    op.create_table('executed_loans',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('deal_id', sa.Integer(), nullable=False),
        sa.Column('match_id', sa.Integer(), nullable=True),
        sa.Column('borrower_id', sa.Integer(), nullable=False),
        sa.Column('lender_id', sa.Integer(), nullable=False),
        sa.Column('insurer_id', sa.Integer(), nullable=True),
        sa.Column('loan_number', sa.String(length=50), nullable=False),
        sa.Column('principal_amount', sa.Float(), nullable=False),
        sa.Column('interest_rate', sa.Float(), nullable=False),
        sa.Column('term_months', sa.Integer(), nullable=False),
        sa.Column('monthly_payment', sa.Float(), nullable=False),
        sa.Column('origination_date', sa.Date(), nullable=False),
        sa.Column('maturity_date', sa.Date(), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, default='active'),
        sa.Column('current_principal_balance', sa.Float(), nullable=False),
        sa.Column('guarantee_percentage', sa.Float(), nullable=True),
        sa.Column('premium_rate', sa.Float(), nullable=True),
        sa.Column('premium_paid', sa.Float(), default=0),
        sa.Column('state', sa.String(length=2), nullable=True),
        sa.Column('city', sa.String(length=100), nullable=True),
        sa.Column('zip_code', sa.String(length=10), nullable=True),
        sa.Column('industry', sa.String(length=100), nullable=False),
        sa.Column('days_past_due', sa.Integer(), default=0),
        sa.Column('last_payment_date', sa.Date(), nullable=True),
        sa.Column('total_payments_made', sa.Integer(), default=0),
        sa.Column('total_principal_paid', sa.Float(), default=0),
        sa.Column('total_interest_paid', sa.Float(), default=0),
        sa.Column('default_date', sa.Date(), nullable=True),
        sa.Column('default_amount', sa.Float(), nullable=True),
        sa.Column('recovery_amount', sa.Float(), nullable=True),
        sa.Column('loss_amount', sa.Float(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['deal_id'], ['deals.id'], ),
        sa.ForeignKeyConstraint(['match_id'], ['deal_matches.id'], ),
        sa.ForeignKeyConstraint(['borrower_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['lender_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['insurer_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('loan_number')
    )
    op.create_index(op.f('ix_executed_loans_id'), 'executed_loans', ['id'], unique=False)
    op.create_index(op.f('ix_executed_loans_loan_number'), 'executed_loans', ['loan_number'], unique=True)
    op.create_index(op.f('ix_executed_loans_state'), 'executed_loans', ['state'], unique=False)
    op.create_index(op.f('ix_executed_loans_industry'), 'executed_loans', ['industry'], unique=False)

    # Loan Payments table
    op.create_table('loan_payments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('loan_id', sa.Integer(), nullable=False),
        sa.Column('payment_date', sa.Date(), nullable=False),
        sa.Column('payment_number', sa.Integer(), nullable=False),
        sa.Column('scheduled_payment', sa.Float(), nullable=False),
        sa.Column('actual_payment', sa.Float(), nullable=False),
        sa.Column('principal_portion', sa.Float(), nullable=False),
        sa.Column('interest_portion', sa.Float(), nullable=False),
        sa.Column('principal_balance_after', sa.Float(), nullable=False),
        sa.Column('is_late', sa.Boolean(), default=False),
        sa.Column('days_late', sa.Integer(), default=0),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['loan_id'], ['executed_loans.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_loan_payments_id'), 'loan_payments', ['id'], unique=False)

    # Insurance Claims table
    op.create_table('insurance_claims',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('loan_id', sa.Integer(), nullable=False),
        sa.Column('insurer_id', sa.Integer(), nullable=False),
        sa.Column('claim_number', sa.String(length=50), nullable=False),
        sa.Column('claim_date', sa.Date(), nullable=False),
        sa.Column('claim_amount', sa.Float(), nullable=False),
        sa.Column('approved_amount', sa.Float(), nullable=True),
        sa.Column('paid_amount', sa.Float(), nullable=True),
        sa.Column('status', sa.String(length=50), default='pending'),
        sa.Column('approved_date', sa.Date(), nullable=True),
        sa.Column('paid_date', sa.Date(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['loan_id'], ['executed_loans.id'], ),
        sa.ForeignKeyConstraint(['insurer_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('claim_number')
    )
    op.create_index(op.f('ix_insurance_claims_id'), 'insurance_claims', ['id'], unique=False)

    # Secondary Market - Listings
    op.create_table('secondary_listings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('seller_id', sa.Integer(), nullable=False),
        sa.Column('listing_type', sa.String(length=50), nullable=False),
        sa.Column('loan_id', sa.Integer(), nullable=True),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('participation_percentage', sa.Float(), nullable=True),
        sa.Column('principal_amount', sa.Float(), nullable=True),
        sa.Column('risk_percentage', sa.Float(), nullable=True),
        sa.Column('premium_share', sa.Float(), nullable=True),
        sa.Column('asking_price', sa.Float(), nullable=False),
        sa.Column('minimum_price', sa.Float(), nullable=True),
        sa.Column('implied_yield', sa.Float(), nullable=True),
        sa.Column('remaining_term_months', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False, default='active'),
        sa.Column('listed_date', sa.DateTime(), nullable=True),
        sa.Column('expiry_date', sa.Date(), nullable=True),
        sa.Column('sold_date', sa.DateTime(), nullable=True),
        sa.Column('buyer_id', sa.Integer(), nullable=True),
        sa.Column('final_price', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['seller_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['buyer_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['loan_id'], ['executed_loans.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_secondary_listings_id'), 'secondary_listings', ['id'], unique=False)
    op.create_index(op.f('ix_secondary_listings_status'), 'secondary_listings', ['status'], unique=False)
    op.create_index(op.f('ix_secondary_listings_listing_type'), 'secondary_listings', ['listing_type'], unique=False)

    # Secondary Market - Offers
    op.create_table('secondary_offers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('listing_id', sa.Integer(), nullable=False),
        sa.Column('buyer_id', sa.Integer(), nullable=False),
        sa.Column('offer_price', sa.Float(), nullable=False),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False, default='pending'),
        sa.Column('offer_date', sa.DateTime(), nullable=True),
        sa.Column('expiry_date', sa.Date(), nullable=True),
        sa.Column('response_date', sa.DateTime(), nullable=True),
        sa.Column('seller_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['listing_id'], ['secondary_listings.id'], ),
        sa.ForeignKeyConstraint(['buyer_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_secondary_offers_id'), 'secondary_offers', ['id'], unique=False)

    # Participation Records
    op.create_table('participation_records',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('loan_id', sa.Integer(), nullable=False),
        sa.Column('owner_id', sa.Integer(), nullable=False),
        sa.Column('ownership_percentage', sa.Float(), nullable=False),
        sa.Column('principal_owned', sa.Float(), nullable=False),
        sa.Column('purchase_price', sa.Float(), nullable=False),
        sa.Column('purchase_date', sa.DateTime(), nullable=True),
        sa.Column('source_listing_id', sa.Integer(), nullable=True),
        sa.Column('is_original_lender', sa.Boolean(), default=False),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['loan_id'], ['executed_loans.id'], ),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['source_listing_id'], ['secondary_listings.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_participation_records_id'), 'participation_records', ['id'], unique=False)

    # Risk Transfer Records
    op.create_table('risk_transfer_records',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('loan_id', sa.Integer(), nullable=False),
        sa.Column('insurer_id', sa.Integer(), nullable=False),
        sa.Column('risk_percentage', sa.Float(), nullable=False),
        sa.Column('premium_share', sa.Float(), nullable=False),
        sa.Column('transfer_price', sa.Float(), nullable=False),
        sa.Column('transfer_date', sa.DateTime(), nullable=True),
        sa.Column('source_listing_id', sa.Integer(), nullable=True),
        sa.Column('is_original_insurer', sa.Boolean(), default=False),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['loan_id'], ['executed_loans.id'], ),
        sa.ForeignKeyConstraint(['insurer_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['source_listing_id'], ['secondary_listings.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_risk_transfer_records_id'), 'risk_transfer_records', ['id'], unique=False)

    # Signature Documents table
    op.create_table('signature_documents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('deal_id', sa.Integer(), nullable=False),
        sa.Column('uploaded_by_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('document_type', sa.String(length=50), nullable=True, default='other'),
        sa.Column('file_name', sa.String(length=255), nullable=False),
        sa.Column('file_type', sa.String(length=255), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('file_data', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=True, default='pending'),
        sa.Column('signature_requested_at', sa.DateTime(), nullable=True),
        sa.Column('signature_due_date', sa.DateTime(), nullable=True),
        sa.Column('signed_at', sa.DateTime(), nullable=True),
        sa.Column('signed_by_id', sa.Integer(), nullable=True),
        sa.Column('signature_notes', sa.Text(), nullable=True),
        sa.Column('loan_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['deal_id'], ['deals.id'], ),
        sa.ForeignKeyConstraint(['uploaded_by_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['signed_by_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['loan_id'], ['executed_loans.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_signature_documents_id'), 'signature_documents', ['id'], unique=False)
    op.create_index(op.f('ix_signature_documents_deal_id'), 'signature_documents', ['deal_id'], unique=False)
    op.create_index(op.f('ix_signature_documents_status'), 'signature_documents', ['status'], unique=False)

    # Borrower Protections table (tiered default protection)
    op.create_table('borrower_protections',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('borrower_id', sa.Integer(), nullable=False),
        sa.Column('loan_id', sa.Integer(), nullable=False),
        sa.Column('deal_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=True, default='active'),
        sa.Column('current_tier', sa.String(length=20), nullable=True, default='tier_1'),
        # Tier 1: Business Protection
        sa.Column('total_premiums_paid', sa.Float(), nullable=True, default=0.0),
        sa.Column('business_assets_value', sa.Float(), nullable=True, default=0.0),
        sa.Column('tier_1_coverage', sa.Float(), nullable=True, default=0.0),
        sa.Column('tier_1_used', sa.Float(), nullable=True, default=0.0),
        # Tier 2: Personal Protection
        sa.Column('tier_2_enrolled', sa.Boolean(), nullable=True, default=False),
        sa.Column('tier_2_monthly_fee', sa.Float(), nullable=True, default=0.0),
        sa.Column('tier_2_total_paid', sa.Float(), nullable=True, default=0.0),
        sa.Column('tier_2_coverage_multiplier', sa.Float(), nullable=True, default=2.0),
        sa.Column('tier_2_coverage', sa.Float(), nullable=True, default=0.0),
        sa.Column('tier_2_used', sa.Float(), nullable=True, default=0.0),
        sa.Column('tier_2_start_date', sa.DateTime(), nullable=True),
        # Tier 3: Personal Assets
        sa.Column('personal_assets_value', sa.Float(), nullable=True, default=0.0),
        sa.Column('tier_3_exposure', sa.Float(), nullable=True, default=0.0),
        sa.Column('tier_3_seized', sa.Float(), nullable=True, default=0.0),
        # Loan details
        sa.Column('original_loan_amount', sa.Float(), nullable=True, default=0.0),
        sa.Column('outstanding_balance', sa.Float(), nullable=True, default=0.0),
        sa.Column('guarantee_percentage', sa.Float(), nullable=True, default=0.0),
        sa.Column('guaranteed_amount', sa.Float(), nullable=True, default=0.0),
        # Payment tracking
        sa.Column('months_current', sa.Integer(), nullable=True, default=0),
        sa.Column('months_delinquent', sa.Integer(), nullable=True, default=0),
        sa.Column('total_missed_payments', sa.Float(), nullable=True, default=0.0),
        # Timestamps
        sa.Column('last_payment_date', sa.DateTime(), nullable=True),
        sa.Column('tier_1_triggered_at', sa.DateTime(), nullable=True),
        sa.Column('tier_2_triggered_at', sa.DateTime(), nullable=True),
        sa.Column('tier_3_triggered_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['borrower_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['loan_id'], ['executed_loans.id'], ),
        sa.ForeignKeyConstraint(['deal_id'], ['deals.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_borrower_protections_id'), 'borrower_protections', ['id'], unique=False)
    op.create_index(op.f('ix_borrower_protections_borrower_id'), 'borrower_protections', ['borrower_id'], unique=False)
    op.create_index(op.f('ix_borrower_protections_loan_id'), 'borrower_protections', ['loan_id'], unique=False)

    # Protection Payments table (Tier 2 fee payments)
    op.create_table('protection_payments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('protection_id', sa.Integer(), nullable=False),
        sa.Column('borrower_id', sa.Integer(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('payment_date', sa.DateTime(), nullable=True),
        sa.Column('payment_method', sa.String(length=50), nullable=True),
        sa.Column('coverage_added', sa.Float(), nullable=True, default=0.0),
        sa.Column('status', sa.String(length=50), nullable=True, default='completed'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['protection_id'], ['borrower_protections.id'], ),
        sa.ForeignKeyConstraint(['borrower_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_protection_payments_id'), 'protection_payments', ['id'], unique=False)

    # Protection Events table (audit log for protection changes)
    op.create_table('protection_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('protection_id', sa.Integer(), nullable=False),
        sa.Column('event_type', sa.String(length=100), nullable=False),
        sa.Column('previous_status', sa.String(length=50), nullable=True),
        sa.Column('new_status', sa.String(length=50), nullable=True),
        sa.Column('previous_tier', sa.String(length=20), nullable=True),
        sa.Column('new_tier', sa.String(length=20), nullable=True),
        sa.Column('amount_involved', sa.Float(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['protection_id'], ['borrower_protections.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_protection_events_id'), 'protection_events', ['id'], unique=False)

    # Pre-qualified Assets table
    op.create_table('prequalified_assets',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('borrower_id', sa.Integer(), nullable=False),
        sa.Column('asset_type', sa.String(length=20), nullable=False),
        sa.Column('category', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        # Real estate fields
        sa.Column('address', sa.String(length=500), nullable=True),
        sa.Column('property_type', sa.String(length=100), nullable=True),
        sa.Column('square_feet', sa.Integer(), nullable=True),
        sa.Column('year_built', sa.Integer(), nullable=True),
        # Vehicle fields
        sa.Column('make', sa.String(length=100), nullable=True),
        sa.Column('model', sa.String(length=100), nullable=True),
        sa.Column('year', sa.Integer(), nullable=True),
        sa.Column('vin', sa.String(length=50), nullable=True),
        sa.Column('mileage', sa.Integer(), nullable=True),
        # Equipment fields
        sa.Column('condition', sa.String(length=50), nullable=True),
        sa.Column('age_years', sa.Integer(), nullable=True),
        # Valuation
        sa.Column('stated_value', sa.Float(), nullable=False),
        sa.Column('estimated_value', sa.Float(), nullable=True),
        sa.Column('forced_sale_value', sa.Float(), nullable=True),
        sa.Column('collateral_value', sa.Float(), nullable=True),
        sa.Column('valuation_confidence', sa.Float(), nullable=True),
        sa.Column('valuation_method', sa.String(length=100), nullable=True),
        sa.Column('valuation_notes', sa.Text(), nullable=True),
        sa.Column('last_valued_at', sa.DateTime(), nullable=True),
        # Liens
        sa.Column('has_lien', sa.Boolean(), nullable=True, default=False),
        sa.Column('lien_amount', sa.Float(), nullable=True),
        sa.Column('lien_holder', sa.String(length=255), nullable=True),
        sa.Column('net_equity', sa.Float(), nullable=True),
        # Verification
        sa.Column('verification_status', sa.String(length=20), nullable=True, default='pending'),
        sa.Column('verified_at', sa.DateTime(), nullable=True),
        sa.Column('verified_by_id', sa.Integer(), nullable=True),
        sa.Column('verification_notes', sa.Text(), nullable=True),
        # Other
        sa.Column('documents', sa.JSON(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True, default=True),
        sa.Column('times_used_as_collateral', sa.Integer(), nullable=True, default=0),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['borrower_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['verified_by_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_prequalified_assets_id'), 'prequalified_assets', ['id'], unique=False)
    op.create_index(op.f('ix_prequalified_assets_borrower_id'), 'prequalified_assets', ['borrower_id'], unique=False)
    op.create_index(op.f('ix_prequalified_assets_category'), 'prequalified_assets', ['category'], unique=False)

    # Verification flags table
    op.create_table('verification_flags',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('deal_id', sa.Integer(), nullable=False),
        sa.Column('match_id', sa.Integer(), nullable=True),
        sa.Column('flagged_by_id', sa.Integer(), nullable=False),
        sa.Column('field_name', sa.String(length=100), nullable=False),
        sa.Column('reported_value', sa.String(length=255), nullable=True),
        sa.Column('expected_value', sa.String(length=255), nullable=True),
        sa.Column('difference_description', sa.Text(), nullable=True),
        sa.Column('severity', sa.String(length=20), nullable=True, default='medium'),
        sa.Column('status', sa.String(length=20), nullable=True, default='pending'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('resolved_by_id', sa.Integer(), nullable=True),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.Column('resolution_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['deal_id'], ['deals.id'], ),
        sa.ForeignKeyConstraint(['match_id'], ['deal_matches.id'], ),
        sa.ForeignKeyConstraint(['flagged_by_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['resolved_by_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_verification_flags_id'), 'verification_flags', ['id'], unique=False)
    op.create_index(op.f('ix_verification_flags_deal_id'), 'verification_flags', ['deal_id'], unique=False)

    # Deal verifications table
    op.create_table('deal_verifications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('deal_id', sa.Integer(), nullable=False),
        sa.Column('match_id', sa.Integer(), nullable=True),
        sa.Column('lender_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=30), nullable=True, default='pending_review'),
        sa.Column('assigned_to_id', sa.Integer(), nullable=True),
        sa.Column('verified_by_id', sa.Integer(), nullable=True),
        sa.Column('verified_at', sa.DateTime(), nullable=True),
        sa.Column('financials_verified', sa.Boolean(), nullable=True, default=False),
        sa.Column('documents_reviewed', sa.Boolean(), nullable=True, default=False),
        sa.Column('collateral_verified', sa.Boolean(), nullable=True, default=False),
        sa.Column('references_checked', sa.Boolean(), nullable=True, default=False),
        sa.Column('verification_notes', sa.Text(), nullable=True),
        sa.Column('ready_for_committee', sa.Boolean(), nullable=True, default=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['deal_id'], ['deals.id'], ),
        sa.ForeignKeyConstraint(['match_id'], ['deal_matches.id'], ),
        sa.ForeignKeyConstraint(['lender_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['assigned_to_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['verified_by_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_deal_verifications_id'), 'deal_verifications', ['id'], unique=False)
    op.create_index(op.f('ix_deal_verifications_deal_id'), 'deal_verifications', ['deal_id'], unique=False)

    # Reinsurance pools table
    op.create_table('reinsurance_pools',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('insurer_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True, default='draft'),
        sa.Column('deal_ids', sa.JSON(), nullable=False),
        sa.Column('cession_percentage', sa.Float(), nullable=True, default=50.0),
        sa.Column('asking_price', sa.Float(), nullable=True),
        sa.Column('total_exposure', sa.Float(), nullable=True, default=0),
        sa.Column('total_premium', sa.Float(), nullable=True, default=0),
        sa.Column('weighted_pd', sa.Float(), nullable=True, default=0),
        sa.Column('expected_loss', sa.Float(), nullable=True, default=0),
        sa.Column('industry_distribution', sa.JSON(), nullable=True),
        sa.Column('geographic_distribution', sa.JSON(), nullable=True),
        sa.Column('offered_at', sa.DateTime(), nullable=True),
        sa.Column('sold_at', sa.DateTime(), nullable=True),
        sa.Column('sold_to_id', sa.Integer(), nullable=True),
        sa.Column('sale_price', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['insurer_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['sold_to_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_reinsurance_pools_id'), 'reinsurance_pools', ['id'], unique=False)
    op.create_index(op.f('ix_reinsurance_pools_insurer_id'), 'reinsurance_pools', ['insurer_id'], unique=False)

    # Reinsurance offers table
    op.create_table('reinsurance_offers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('pool_id', sa.Integer(), nullable=False),
        sa.Column('reinsurer_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=True, default='pending'),
        sa.Column('offered_price', sa.Float(), nullable=False),
        sa.Column('offered_cession_pct', sa.Float(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('response_notes', sa.Text(), nullable=True),
        sa.Column('responded_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['pool_id'], ['reinsurance_pools.id'], ),
        sa.ForeignKeyConstraint(['reinsurer_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_reinsurance_offers_id'), 'reinsurance_offers', ['id'], unique=False)
    op.create_index(op.f('ix_reinsurance_offers_pool_id'), 'reinsurance_offers', ['pool_id'], unique=False)


def downgrade() -> None:
    op.drop_table('reinsurance_offers')
    op.drop_table('reinsurance_pools')
    op.drop_table('deal_verifications')
    op.drop_table('verification_flags')
    op.drop_table('prequalified_assets')
    op.drop_table('protection_events')
    op.drop_table('protection_payments')
    op.drop_table('borrower_protections')
    op.drop_table('signature_documents')
    op.drop_table('risk_transfer_records')
    op.drop_table('participation_records')
    op.drop_table('secondary_offers')
    op.drop_table('secondary_listings')
    op.drop_table('insurance_claims')
    op.drop_table('loan_payments')
    op.drop_table('executed_loans')
    op.drop_table('audit_logs')
    op.drop_table('system_assumptions')
    op.drop_table('fee_ledger')
    op.drop_table('monthly_cashflows')
    op.drop_table('deal_matches')
    op.drop_table('insurer_policies')
    op.drop_table('lender_policies')
    op.drop_table('deal_risk_reports')
    op.drop_table('deal_documents')
    op.drop_table('deals')
    op.drop_table('users')
