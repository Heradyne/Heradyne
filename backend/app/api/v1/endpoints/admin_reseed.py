"""
Admin reseed endpoint — hit this URL to reseed the database without redeploying.
Protected by a secret token so it can't be triggered accidentally.

Usage:
  POST https://heradyne-production.up.railway.app/api/v1/admin/reseed
  Header: X-Reseed-Token: <RESEED_SECRET env var>

Or just open in browser (GET):
  https://heradyne-production.up.railway.app/api/v1/admin/reseed?token=<RESEED_SECRET>
"""

import os
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

router = APIRouter()


@router.get("/reseed")
@router.post("/reseed")
def reseed_database(token: str = Query(None, description="Reseed secret token")):
    """
    Clears and re-seeds the database with fresh demo data including the funded HVAC loan.
    Requires RESEED_SECRET environment variable to be set and passed as ?token=
    """
    secret = os.environ.get("RESEED_SECRET", "")
    if not secret:
        raise HTTPException(status_code=403, detail="RESEED_SECRET not configured on server")
    if token != secret:
        raise HTTPException(status_code=403, detail="Invalid token")

    try:
        from app.core.database import SessionLocal
        from app.seed import seed_users, seed_deals, seed_lender_policies, seed_insurer_policies, seed_assumptions, seed_funded_loan
        from app.models.user import User
        from app.models.policy import LenderPolicy, InsurerPolicy
        from app.models.executed_loan import LoanPayment, ExecutedLoan
        from app.models.deal import MonthlyCashflow, DealMatch, DealRiskReport, Deal

        db = SessionLocal()

        # Clear in dependency order
        from app.models.audit import AuditLog
        db.query(LoanPayment).delete()
        db.query(ExecutedLoan).delete()
        db.query(MonthlyCashflow).delete()
        db.query(DealMatch).delete()
        db.query(DealRiskReport).delete()
        db.query(Deal).delete()
        db.query(LenderPolicy).delete()
        db.query(InsurerPolicy).delete()
        db.query(AuditLog).delete()
        db.query(User).delete()
        db.commit()

        # Re-seed everything
        users = seed_users(db)
        seed_deals(db, users["borrower"])
        seed_lender_policies(db, users["lender1"], users["lender2"])
        seed_insurer_policies(db, users["insurer"])
        seed_assumptions(db)
        seed_funded_loan(db, users)
        db.close()

        return JSONResponse({
            "status": "success",
            "message": "Database re-seeded successfully",
            "deals": [
                "Acme Plumbing LLC — Acquisition (analyzed)",
                "ABC Manufacturing — Acquisition (analyzed)",
                "Greenville HVAC Solutions LLC — Funded + Insured (advisory alert)",
            ],
            "login": "borrower@example.com / password123"
        })

    except Exception as e:
        import traceback
        return JSONResponse(status_code=500, content={
            "status": "error",
            "message": str(e),
            "trace": traceback.format_exc()
        })
