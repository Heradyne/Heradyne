import csv
import io
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_active_user, require_borrower
from app.models.user import User, UserRole
from app.models.deal import Deal, MonthlyCashflow, FeeLedger, DealStatus
from app.schemas.cashflow import (
    MonthlyCashflowCreate, MonthlyCashflowResponse, 
    FeeLedgerResponse, FeeLedgerSummary, BulkCashflowCreate
)
from app.services.audit import audit_service
from app.tasks import calculate_fees_task

router = APIRouter()


@router.post("/deals/{deal_id}/monthly", response_model=MonthlyCashflowResponse)
def add_monthly_cashflow(
    deal_id: int,
    cashflow_data: MonthlyCashflowCreate,
    current_user: User = Depends(require_borrower),
    db: Session = Depends(get_db)
):
    """Add monthly cash flow data for a deal."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    
    if deal.borrower_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    # Check if entry already exists
    existing = db.query(MonthlyCashflow).filter(
        MonthlyCashflow.deal_id == deal_id,
        MonthlyCashflow.month == cashflow_data.month,
        MonthlyCashflow.year == cashflow_data.year
    ).first()
    
    if existing:
        # Update existing
        existing.revenue = cashflow_data.revenue
        existing.ebitda = cashflow_data.ebitda
        existing.debt_service = cashflow_data.debt_service or 0
        existing.post_debt_fcf = existing.ebitda - existing.debt_service
        db.commit()
        db.refresh(existing)
        return existing
    
    # Create new
    post_debt_fcf = cashflow_data.ebitda - (cashflow_data.debt_service or 0)
    cashflow = MonthlyCashflow(
        deal_id=deal_id,
        month=cashflow_data.month,
        year=cashflow_data.year,
        revenue=cashflow_data.revenue,
        ebitda=cashflow_data.ebitda,
        debt_service=cashflow_data.debt_service or 0,
        post_debt_fcf=post_debt_fcf
    )
    db.add(cashflow)
    db.commit()
    db.refresh(cashflow)
    
    return cashflow


@router.post("/deals/{deal_id}/monthly/bulk", response_model=List[MonthlyCashflowResponse])
def add_bulk_cashflow(
    deal_id: int,
    data: BulkCashflowCreate,
    current_user: User = Depends(require_borrower),
    db: Session = Depends(get_db)
):
    """Add multiple months of cash flow data at once."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    
    if deal.borrower_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    results = []
    for cf_data in data.cashflows:
        existing = db.query(MonthlyCashflow).filter(
            MonthlyCashflow.deal_id == deal_id,
            MonthlyCashflow.month == cf_data.month,
            MonthlyCashflow.year == cf_data.year
        ).first()
        
        post_debt_fcf = cf_data.ebitda - (cf_data.debt_service or 0)
        
        if existing:
            existing.revenue = cf_data.revenue
            existing.ebitda = cf_data.ebitda
            existing.debt_service = cf_data.debt_service or 0
            existing.post_debt_fcf = post_debt_fcf
            results.append(existing)
        else:
            cashflow = MonthlyCashflow(
                deal_id=deal_id,
                month=cf_data.month,
                year=cf_data.year,
                revenue=cf_data.revenue,
                ebitda=cf_data.ebitda,
                debt_service=cf_data.debt_service or 0,
                post_debt_fcf=post_debt_fcf
            )
            db.add(cashflow)
            results.append(cashflow)
    
    db.commit()
    for r in results:
        db.refresh(r)
    
    return results


@router.get("/deals/{deal_id}/monthly", response_model=List[MonthlyCashflowResponse])
def get_monthly_cashflows(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all monthly cash flow data for a deal."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    
    if current_user.role == UserRole.BORROWER and deal.borrower_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    cashflows = db.query(MonthlyCashflow).filter(
        MonthlyCashflow.deal_id == deal_id
    ).order_by(MonthlyCashflow.year, MonthlyCashflow.month).all()
    
    return cashflows


@router.post("/deals/{deal_id}/calculate-fees", response_model=FeeLedgerSummary)
def calculate_fees(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Calculate fees based on monthly cash flow data."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    
    if current_user.role == UserRole.BORROWER and deal.borrower_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    # Get fee cap
    from app.services.assumptions import assumption_service
    fee_cap = assumption_service.get_assumption(db, "fees", "borrower_fee_cap") or 0.02
    
    # Get monthly cashflows
    cashflows = db.query(MonthlyCashflow).filter(
        MonthlyCashflow.deal_id == deal_id
    ).order_by(MonthlyCashflow.year, MonthlyCashflow.month).all()
    
    if not cashflows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No monthly cash flow data. Add monthly data first."
        )
    
    # Clear existing fee entries
    db.query(FeeLedger).filter(FeeLedger.deal_id == deal_id).delete()
    
    total_fees = 0.0
    entries = []
    
    for cf in cashflows:
        post_debt_fcf = cf.post_debt_fcf if cf.post_debt_fcf else (cf.ebitda - (cf.debt_service or 0))
        
        if post_debt_fcf > 0:
            calculated_fee = post_debt_fcf * fee_cap
        else:
            calculated_fee = 0
        
        fee_entry = FeeLedger(
            deal_id=deal_id,
            month=cf.month,
            year=cf.year,
            post_debt_fcf=post_debt_fcf,
            fee_rate=fee_cap,
            calculated_fee=calculated_fee
        )
        db.add(fee_entry)
        entries.append(fee_entry)
        total_fees += calculated_fee
    
    db.commit()
    for e in entries:
        db.refresh(e)
    
    audit_service.log(
        db=db, action="fees_calculated", entity_type="deal",
        entity_id=deal_id, user_id=current_user.id,
        details={"months": len(entries), "total": total_fees}
    )
    
    return FeeLedgerSummary(
        deal_id=deal_id,
        total_fees=round(total_fees, 2),
        entries=entries
    )


@router.get("/deals/{deal_id}/fee-ledger", response_model=FeeLedgerSummary)
def get_fee_ledger(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get fee ledger for a deal."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    
    if current_user.role == UserRole.BORROWER and deal.borrower_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    entries = db.query(FeeLedger).filter(
        FeeLedger.deal_id == deal_id
    ).order_by(FeeLedger.year, FeeLedger.month).all()
    
    total_fees = sum(e.calculated_fee for e in entries)
    
    return FeeLedgerSummary(
        deal_id=deal_id,
        total_fees=round(total_fees, 2),
        entries=entries
    )


@router.get("/deals/{deal_id}/fee-ledger/export")
def export_fee_ledger_csv(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Export fee ledger as CSV."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    
    if current_user.role == UserRole.BORROWER and deal.borrower_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    entries = db.query(FeeLedger).filter(
        FeeLedger.deal_id == deal_id
    ).order_by(FeeLedger.year, FeeLedger.month).all()
    
    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow([
        "Deal ID", "Deal Name", "Year", "Month", 
        "Post-Debt FCF", "Fee Rate", "Calculated Fee"
    ])
    
    # Data rows
    for entry in entries:
        writer.writerow([
            deal_id, deal.name, entry.year, entry.month,
            f"{entry.post_debt_fcf:.2f}", f"{entry.fee_rate:.2%}", 
            f"{entry.calculated_fee:.2f}"
        ])
    
    # Total row
    total_fees = sum(e.calculated_fee for e in entries)
    writer.writerow(["", "", "", "TOTAL", "", "", f"{total_fees:.2f}"])
    
    # Add disclaimer
    writer.writerow([])
    writer.writerow(["DISCLAIMER: Heradyne is informational only. It does not lend, guarantee, or insure."])
    
    output.seek(0)
    
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=fee_ledger_deal_{deal_id}.csv"
        }
    )
