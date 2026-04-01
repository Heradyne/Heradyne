"""Add UnderwriteOS columns to deal_risk_reports and policy tables

Revision ID: 002_underwriteos
Revises: 001_initial
Create Date: 2024-10-31
"""
from alembic import op
import sqlalchemy as sa

revision = '002_underwriteos'
down_revision = '001_initial'
branch_labels = None
depends_on = None

def upgrade():
    # Health Score columns
    for col in [
        ('health_score', sa.Float), ('health_score_cashflow', sa.Float),
        ('health_score_stability', sa.Float), ('health_score_growth', sa.Float),
        ('health_score_liquidity', sa.Float), ('health_score_distress', sa.Float),
    ]:
        op.add_column('deal_risk_reports', sa.Column(col[0], col[1](), nullable=True))
    # PDSCR
    for col in [('pdscr', sa.Float), ('owner_draw_annual', sa.Float), ('premium_capacity_monthly', sa.Float)]:
        op.add_column('deal_risk_reports', sa.Column(col[0], col[1](), nullable=True))
    # Valuation bridge
    for col in [
        ('normalized_sde', sa.Float), ('sde_multiple_implied', sa.Float),
        ('equity_value_low', sa.Float), ('equity_value_mid', sa.Float), ('equity_value_high', sa.Float),
        ('net_debt', sa.Float),
    ]:
        op.add_column('deal_risk_reports', sa.Column(col[0], col[1](), nullable=True))
    op.add_column('deal_risk_reports', sa.Column('valuation_method_weights', sa.JSON(), nullable=True))
    # SBA eligibility
    op.add_column('deal_risk_reports', sa.Column('sba_eligible', sa.Boolean(), nullable=True))
    op.add_column('deal_risk_reports', sa.Column('sba_eligibility_checklist', sa.JSON(), nullable=True))
    for col in [('sba_max_loan', sa.Float), ('sba_ltv', sa.Float)]:
        op.add_column('deal_risk_reports', sa.Column(col[0], col[1](), nullable=True))
    # Deal killer
    op.add_column('deal_risk_reports', sa.Column('deal_killer_verdict', sa.String(20), nullable=True))
    op.add_column('deal_risk_reports', sa.Column('deal_confidence_score', sa.Float(), nullable=True))
    op.add_column('deal_risk_reports', sa.Column('max_supportable_price', sa.Float(), nullable=True))
    op.add_column('deal_risk_reports', sa.Column('breakpoint_scenarios', sa.JSON(), nullable=True))
    # Cash flow forecast
    op.add_column('deal_risk_reports', sa.Column('cash_runway_months', sa.Float(), nullable=True))
    op.add_column('deal_risk_reports', sa.Column('cash_forecast_18m', sa.JSON(), nullable=True))
    # Playbooks
    op.add_column('deal_risk_reports', sa.Column('playbooks', sa.JSON(), nullable=True))
    # Lender policy UW filters
    for col in [('min_health_score', sa.Float), ('min_pdscr', sa.Float), ('min_deal_confidence_score', sa.Float)]:
        op.add_column('lender_policies', sa.Column(col[0], col[1](), nullable=True))
    op.add_column('lender_policies', sa.Column('require_sba_eligible', sa.Boolean(), nullable=True))
    # Insurer policy UW fields
    for col in [('min_health_score', sa.Float), ('max_pdscr_floor', sa.Float), ('pg_support_pct_of_loan', sa.Float), ('lender_support_pct_of_loan', sa.Float)]:
        op.add_column('insurer_policies', sa.Column(col[0], col[1](), nullable=True))

def downgrade():
    uw_drr = ['health_score','health_score_cashflow','health_score_stability','health_score_growth',
              'health_score_liquidity','health_score_distress','pdscr','owner_draw_annual',
              'premium_capacity_monthly','normalized_sde','sde_multiple_implied','equity_value_low',
              'equity_value_mid','equity_value_high','net_debt','valuation_method_weights',
              'sba_eligible','sba_eligibility_checklist','sba_max_loan','sba_ltv',
              'deal_killer_verdict','deal_confidence_score','max_supportable_price',
              'breakpoint_scenarios','cash_runway_months','cash_forecast_18m','playbooks']
    for c in uw_drr: op.drop_column('deal_risk_reports', c)
    for c in ['min_health_score','min_pdscr','min_deal_confidence_score','require_sba_eligible']:
        op.drop_column('lender_policies', c)
    for c in ['min_health_score','max_pdscr_floor','pg_support_pct_of_loan','lender_support_pct_of_loan']:
        op.drop_column('insurer_policies', c)
