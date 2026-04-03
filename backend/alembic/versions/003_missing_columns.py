"""Add missing DealRiskReport columns and other model fields

Revision ID: 003
Revises: 002
Create Date: 2026-04-03
"""
from alembic import op
import sqlalchemy as sa

revision = '003_missing_columns'
down_revision = '002_underwriteos'
branch_labels = None
depends_on = None


def upgrade():
    # ── DealRiskReport — missing UW engine columns ────────────────────────────
    drr_cols = [
        ('health_score',            sa.Float),
        ('health_score_cashflow',   sa.Float),
        ('health_score_stability',  sa.Float),
        ('health_score_growth',     sa.Float),
        ('health_score_liquidity',  sa.Float),
        ('health_score_distress',   sa.Float),
        ('dscr_base',               sa.Float),
        ('dscr_stress',             sa.Float),
        ('pdscr',                   sa.Float),
        ('owner_draw_annual',       sa.Float),
        ('premium_capacity_monthly',sa.Float),
        ('post_debt_fcf',           sa.Float),
        ('annual_pd',               sa.Float),
        ('sba_anchor_pd',           sa.Float),
        ('collateral_coverage',     sa.Float),
        ('business_nolv',           sa.Float),
        ('personal_nolv',           sa.Float),
        ('total_nolv',              sa.Float),
        ('net_debt',                sa.Float),
        ('normalized_sde',          sa.Float),
        ('normalized_ebitda',       sa.Float),
        ('sde_multiple_implied',    sa.Float),
        ('industry_multiplier',     sa.Float),
        ('leverage_multiplier',     sa.Float),
        ('volatility_multiplier',   sa.Float),
        ('durability_score',        sa.Float),
        ('ev_low',                  sa.Float),
        ('ev_mid',                  sa.Float),
        ('ev_high',                 sa.Float),
        ('equity_value_low',        sa.Float),
        ('equity_value_mid',        sa.Float),
        ('equity_value_high',       sa.Float),
        ('sba_max_loan',            sa.Float),
        ('sba_ltv',                 sa.Float),
        ('recommended_guarantee_pct',sa.Float),
        ('recommended_escrow_pct',  sa.Float),
        ('verification_confidence', sa.Float),
        ('documents_verified',      sa.Integer),
    ]
    for col_name, col_type in drr_cols:
        _add_col_if_missing('deal_risk_reports', col_name, col_type())

    # JSON columns
    json_cols = [
        'recommended_alignment',
        'verification_flags',
        'report_data',
    ]
    for col_name in json_cols:
        _add_col_if_missing('deal_risk_reports', col_name, sa.JSON())

    # String columns
    _add_col_if_missing('deal_risk_reports', 'verification_status', sa.String(50))


def _add_col_if_missing(table, col_name, col_type):
    """Add column only if it doesn't already exist."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    cols = [c['name'] for c in inspector.get_columns(table)]
    if col_name not in cols:
        op.add_column(table, sa.Column(col_name, col_type, nullable=True))


def downgrade():
    drr_cols = [
        'health_score','health_score_cashflow','health_score_stability',
        'health_score_growth','health_score_liquidity','health_score_distress',
        'dscr_base','dscr_stress','pdscr','owner_draw_annual','premium_capacity_monthly',
        'post_debt_fcf','annual_pd','sba_anchor_pd','collateral_coverage',
        'business_nolv','personal_nolv','total_nolv','net_debt','normalized_sde',
        'normalized_ebitda','sde_multiple_implied','industry_multiplier',
        'leverage_multiplier','volatility_multiplier','durability_score',
        'ev_low','ev_mid','ev_high','equity_value_low','equity_value_mid',
        'equity_value_high','sba_max_loan','sba_ltv','recommended_guarantee_pct',
        'recommended_escrow_pct','verification_confidence','documents_verified',
        'recommended_alignment','verification_flags','report_data','verification_status',
    ]
    for col_name in drr_cols:
        try:
            op.drop_column('deal_risk_reports', col_name)
        except Exception:
            pass
