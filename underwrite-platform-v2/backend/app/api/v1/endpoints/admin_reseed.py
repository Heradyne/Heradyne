"""
Admin reseed endpoint — adds demo data without wiping existing records.
Safe to run multiple times.

Usage:
  GET https://heradyne-production.up.railway.app/api/v1/admin/reseed?token=<RESEED_SECRET>
"""

import os
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

router = APIRouter()


@router.get("/reseed")
@router.post("/reseed")
def reseed_database(token: str = Query(None)):
    """Adds the funded HVAC demo loan if it doesn't already exist. Never deletes data."""
    secret = os.environ.get("RESEED_SECRET", "")
    if not secret:
        raise HTTPException(status_code=403, detail="RESEED_SECRET not configured on server")
    if token != secret:
        raise HTTPException(status_code=403, detail="Invalid token")

    try:
        from app.core.database import SessionLocal
        from app.models.user import User
        from app.models.deal import Deal
        from app.seed import seed_funded_loan

        db = SessionLocal()

        # Check if HVAC loan already exists
        existing = db.query(Deal).filter(Deal.name.contains("Greenville HVAC")).first()
        if existing:
            db.close()
            return JSONResponse({
                "status": "already_exists",
                "message": "Greenville HVAC Solutions loan already in database — no changes made",
                "login": "borrower@example.com / password123"
            })

        # Get existing users
        users = {
            "borrower": db.query(User).filter(User.email == "borrower@example.com").first(),
            "lender1":  db.query(User).filter(User.email == "lender1@example.com").first(),
            "lender2":  db.query(User).filter(User.email == "lender2@example.com").first(),
            "insurer":  db.query(User).filter(User.email == "insurer@example.com").first(),
            "admin":    db.query(User).filter(User.email == "admin@example.com").first(),
        }

        if not users["borrower"]:
            db.close()
            return JSONResponse(status_code=400, content={
                "status": "error",
                "message": "No users found. Redeploy the backend first to run initial seed."
            })

        seed_funded_loan(db, users)
        db.close()

        return JSONResponse({
            "status": "success",
            "message": "Greenville HVAC Solutions LLC funded loan added successfully",
            "what_was_added": [
                "Deal: Greenville HVAC Solutions LLC (funded status)",
                "Risk report with health score, playbooks, SBA checklist",
                "Deal match (accepted by lender + insurer)",
                "Executed loan: SBA-2023-GVL-00147",
                "14 months of payment history",
                "14 months of cash flow data (showing decline after month 9)",
            ],
            "login": "borrower@example.com / password123",
            "next": "Log in → Business Dashboard (borrower) or Portfolio (lender/insurer)"
        })

    except Exception as e:
        import traceback
        return JSONResponse(status_code=500, content={
            "status": "error",
            "message": str(e),
            "trace": traceback.format_exc()
        })
