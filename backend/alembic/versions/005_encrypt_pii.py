"""Convert PII columns to encrypted Text and add erasure endpoint support

Revision ID: 005_encrypt_pii
Revises: 004_security
Create Date: 2026-04-07
"""
from alembic import op
import sqlalchemy as sa

revision = '005_encrypt_pii'
down_revision = '004_security'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    deal_cols = [c['name'] for c in inspector.get_columns('deals')]

    # Convert business_assets and personal_assets from JSON to Text
    # (encrypted Fernet tokens are text strings)
    # First preserve existing data as text, then change type
    for col in ['business_assets', 'personal_assets']:
        if col in deal_cols:
            # Cast existing JSON to text (Fernet will handle new values going forward)
            op.alter_column(
                'deals', col,
                type_=sa.Text(),
                existing_type=sa.JSON(),
                existing_nullable=True,
                postgresql_using=f"{col}::text",
            )

    # Add erasure request tracking table
    try:
        op.create_table(
            'erasure_requests',
            sa.Column('id', sa.Integer, primary_key=True),
            sa.Column('user_id', sa.Integer, sa.ForeignKey('users.id'), nullable=False),
            sa.Column('requested_by_id', sa.Integer, sa.ForeignKey('users.id'), nullable=True),
            sa.Column('status', sa.String(50), default='pending'),
            sa.Column('reason', sa.Text, nullable=True),
            sa.Column('completed_at', sa.DateTime, nullable=True),
            sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        )
    except Exception:
        pass  # Table may already exist


def downgrade():
    for col in ['business_assets', 'personal_assets']:
        try:
            op.alter_column('deals', col, type_=sa.JSON(), existing_type=sa.Text())
        except Exception:
            pass
    try:
        op.drop_table('erasure_requests')
    except Exception:
        pass
