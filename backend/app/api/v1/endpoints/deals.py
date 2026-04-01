import os
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.config import settings
from app.core.deps import get_current_active_user, require_borrower
from app.models.user import User, UserRole
from app.models.deal import Deal, DealDocument, DealRiskReport, DealStatus
from app.schemas.deal import (
    DealCreate, DealUpdate, DealResponse, DealListResponse, 
    DealDetailResponse, DealDocumentResponse, DealRiskReportResponse,
    DealSubmitResponse
)
from app.services.audit import audit_service
from app.services.uw_engines import run_uw_engines  # UnderwriteOS
from app.tasks import analyze_deal_task

router = APIRouter()

DISCLAIMER = (
    "DISCLAIMER: Heradyne is an informational platform only. "
    "It does not lend money, provide guarantees, or issue insurance. "
    "All analysis and recommendations are for informational purposes."
)


@router.post("/", response_model=DealResponse, status_code=status.HTTP_201_CREATED)
def create_deal(
    deal_data: DealCreate,
    current_user: User = Depends(require_borrower),
    db: Session = Depends(get_db)
):
    """Create a new deal. Only borrowers can create deals."""
    deal = Deal(
        borrower_id=current_user.id,
        name=deal_data.name,
        deal_type=deal_data.deal_type,
        industry=deal_data.industry,
        business_description=deal_data.business_description,
        loan_amount_requested=deal_data.loan_amount_requested,
        loan_term_months=deal_data.loan_term_months,
        annual_revenue=deal_data.annual_revenue,
        gross_profit=deal_data.gross_profit,
        ebitda=deal_data.ebitda,
        capex=deal_data.capex,
        debt_service=deal_data.debt_service,
        addbacks=[a.model_dump() for a in deal_data.addbacks] if deal_data.addbacks else None,
        purchase_price=deal_data.purchase_price,
        equity_injection=deal_data.equity_injection,
        business_assets=[a.model_dump() for a in deal_data.business_assets] if deal_data.business_assets else None,
        personal_assets=[a.model_dump() for a in deal_data.personal_assets] if deal_data.personal_assets else None,
        owner_credit_score=deal_data.owner_credit_score,
        owner_experience_years=deal_data.owner_experience_years,
        status=DealStatus.DRAFT
    )
    db.add(deal)
    db.commit()
    db.refresh(deal)
    
    audit_service.log(
        db=db, action="deal_created", entity_type="deal",
        entity_id=deal.id, user_id=current_user.id,
        details={"deal_type": deal.deal_type.value}
    )
    return deal


@router.get("/", response_model=List[DealListResponse])
def list_deals(
    status_filter: Optional[DealStatus] = Query(None, alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """List deals based on user role."""
    query = db.query(Deal)
    
    if current_user.role == UserRole.BORROWER:
        query = query.filter(Deal.borrower_id == current_user.id)
    elif current_user.role in [UserRole.LENDER, UserRole.INSURER]:
        query = query.filter(Deal.status.in_([
            DealStatus.ANALYZED, DealStatus.MATCHED, 
            DealStatus.PENDING_LENDER, DealStatus.PENDING_INSURER,
            DealStatus.APPROVED, DealStatus.CLOSED
        ]))
    
    if status_filter:
        query = query.filter(Deal.status == status_filter)
    
    deals = query.order_by(Deal.created_at.desc()).offset(skip).limit(limit).all()
    return deals


@router.get("/{deal_id}", response_model=DealDetailResponse)
def get_deal(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get deal details including documents and risk reports."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    
    if current_user.role == UserRole.BORROWER and deal.borrower_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    return deal


@router.put("/{deal_id}", response_model=DealResponse)
def update_deal(
    deal_id: int,
    deal_update: DealUpdate,
    current_user: User = Depends(require_borrower),
    db: Session = Depends(get_db)
):
    """Update a deal (only drafts can be updated)."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    
    if deal.borrower_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    if deal.status != DealStatus.DRAFT:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only draft deals can be updated")
    
    update_data = deal_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field in ["addbacks", "business_assets", "personal_assets"] and value is not None:
            value = [a.model_dump() if hasattr(a, 'model_dump') else a for a in value]
        setattr(deal, field, value)
    
    db.commit()
    db.refresh(deal)
    
    audit_service.log(db=db, action="deal_updated", entity_type="deal", entity_id=deal.id, user_id=current_user.id)
    return deal


@router.post("/{deal_id}/submit", response_model=DealSubmitResponse)
def submit_deal(
    deal_id: int,
    current_user: User = Depends(require_borrower),
    db: Session = Depends(get_db)
):
    """Submit a deal for analysis. Triggers async underwriting pipeline."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    
    if deal.borrower_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    if deal.status not in [DealStatus.DRAFT, DealStatus.SUBMITTED]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Deal has already been submitted and processed")
    
    deal.status = DealStatus.SUBMITTED
    db.commit()
    
    # Try async first, fall back to sync if Celery is not available
    try:
        analyze_deal_task.delay(deal_id)
    except Exception:
        # Celery not available, run synchronously
        _run_analysis_sync(deal_id, db)
    
    audit_service.log(db=db, action="deal_submitted", entity_type="deal", entity_id=deal.id, user_id=current_user.id)
    
    return DealSubmitResponse(deal_id=deal.id, status=deal.status, message=f"Deal submitted for analysis. {DISCLAIMER}")


@router.post("/{deal_id}/analyze-sync", response_model=DealSubmitResponse)
def analyze_deal_sync(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Run analysis synchronously (for testing or when Celery is unavailable)."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    
    if deal.borrower_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    _run_analysis_sync(deal_id, db)
    
    db.refresh(deal)
    return DealSubmitResponse(deal_id=deal.id, status=deal.status.value, message=f"Analysis complete. {DISCLAIMER}")


def _run_analysis_sync(deal_id: int, db: Session):
    """Run underwriting analysis synchronously."""
    from app.services.underwriting import UnderwritingService
    
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        return
    
    # Update status
    deal.status = DealStatus.ANALYZING
    db.commit()
    
    try:
        # Run underwriting
        underwriting_service = UnderwritingService(db)
        report_data = underwriting_service.analyze_deal(deal)
        
        # Get latest version
        latest_report = db.query(DealRiskReport).filter(
            DealRiskReport.deal_id == deal_id
        ).order_by(DealRiskReport.version.desc()).first()
        
        new_version = (latest_report.version + 1) if latest_report else 1
        
        # Create risk report

        # ── UnderwriteOS enrichment (sync path) ─────────────────────────────
        uw_fields = run_uw_engines(deal, report_data)
        # ────────────────────────────────────────────────────────────────────
        risk_report = DealRiskReport(
            deal_id=deal_id,
            version=new_version,
            normalized_ebitda=report_data["cashflow_analysis"]["normalized_ebitda"],
            post_debt_fcf=report_data["cashflow_analysis"]["post_debt_fcf"],
            dscr_base=report_data["cashflow_analysis"]["dscr_base"],
            dscr_stress=report_data["cashflow_analysis"]["dscr_stress"],
            sba_anchor_pd=report_data["pd_analysis"]["sba_anchor_pd"],
            industry_multiplier=report_data["pd_analysis"]["industry_multiplier"],
            leverage_multiplier=report_data["pd_analysis"]["leverage_multiplier"],
            volatility_multiplier=report_data["pd_analysis"]["volatility_multiplier"],
            annual_pd=report_data["pd_analysis"]["annual_pd"],
            ev_low=report_data["valuation"]["ev_low"],
            ev_mid=report_data["valuation"]["ev_mid"],
            ev_high=report_data["valuation"]["ev_high"],
            durability_score=report_data["valuation"]["durability_score"],
            business_nolv=report_data["collateral"]["business_nolv"],
            personal_nolv=report_data["collateral"]["personal_nolv"],
            total_nolv=report_data["collateral"]["total_nolv"],
            collateral_coverage=report_data["collateral"]["collateral_coverage"],
            recommended_guarantee_pct=report_data["structuring"]["recommended_guarantee_pct"],
            recommended_escrow_pct=report_data["structuring"]["recommended_escrow_pct"],
            recommended_alignment=report_data["structuring"]["recommended_alignment"],
            report_data=report_data
        )
        db.add(risk_report)
        
        # Update deal status
        deal.status = DealStatus.ANALYZED
        db.commit()
        
    except Exception as e:
        db.rollback()
        deal.status = DealStatus.SUBMITTED
        db.commit()
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/{deal_id}/analyze", response_model=DealSubmitResponse)
def trigger_analysis(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Re-trigger analysis on a deal."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    
    if deal.borrower_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    analyze_deal_task.delay(deal_id)
    
    return DealSubmitResponse(deal_id=deal.id, status=deal.status, message=f"Analysis triggered. {DISCLAIMER}")


@router.post("/{deal_id}/documents", response_model=DealDocumentResponse)
async def upload_document(
    deal_id: int,
    document_type: Optional[str] = None,
    file: UploadFile = File(...),
    current_user: User = Depends(require_borrower),
    db: Session = Depends(get_db)
):
    """Upload a document to a deal's data room."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    
    if deal.borrower_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, 
                          detail=f"File too large. Max size: {settings.MAX_UPLOAD_SIZE_MB}MB")
    
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else ""
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                          detail=f"File type not allowed. Allowed: {settings.ALLOWED_EXTENSIONS}")
    
    upload_dir = os.path.join(settings.UPLOAD_DIR, str(deal_id))
    os.makedirs(upload_dir, exist_ok=True)
    
    unique_filename = f"{uuid.uuid4().hex}_{file.filename}"
    file_path = os.path.join(upload_dir, unique_filename)
    
    with open(file_path, "wb") as f:
        f.write(content)
    
    doc = DealDocument(
        deal_id=deal_id, filename=unique_filename, original_filename=file.filename,
        file_path=file_path, file_size=len(content), mime_type=file.content_type,
        document_type=document_type
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    
    audit_service.log(db=db, action="document_uploaded", entity_type="deal_document",
                     entity_id=doc.id, user_id=current_user.id,
                     details={"deal_id": deal_id, "filename": file.filename})
    return doc


@router.get("/{deal_id}/documents", response_model=List[DealDocumentResponse])
def list_documents(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """List all documents for a deal."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    
    if current_user.role == UserRole.BORROWER and deal.borrower_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    return deal.documents


@router.get("/{deal_id}/documents/{document_id}/download")
def download_document(
    deal_id: int, 
    document_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Download a document from a deal's data room.
    Accessible by: deal owner, lenders, insurers (for matched deals), and admins.
    """
    from fastapi.responses import Response
    import traceback
    
    try:
        print(f"Download request: deal_id={deal_id}, document_id={document_id}, user={current_user.email}")
        
        deal = db.query(Deal).filter(Deal.id == deal_id).first()
        if not deal:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
        
        print(f"Deal found: {deal.name}")
        
        # Access control
        if current_user.role == UserRole.BORROWER:
            if deal.borrower_id != current_user.id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        elif current_user.role in [UserRole.LENDER, UserRole.INSURER]:
            from app.models.deal import DealMatch
            from app.models.policy import LenderPolicy, InsurerPolicy
            
            has_match = False
            
            if current_user.role == UserRole.LENDER:
                user_policies = db.query(LenderPolicy).filter(LenderPolicy.lender_id == current_user.id).all()
                print(f"Lender has {len(user_policies)} policies")
                if user_policies:
                    user_policy_ids = [p.id for p in user_policies]
                    has_match = db.query(DealMatch).filter(
                        DealMatch.deal_id == deal_id,
                        DealMatch.lender_policy_id.in_(user_policy_ids)
                    ).first() is not None
            else:
                user_policies = db.query(InsurerPolicy).filter(InsurerPolicy.insurer_id == current_user.id).all()
                print(f"Insurer has {len(user_policies)} policies")
                if user_policies:
                    user_policy_ids = [p.id for p in user_policies]
                    has_match = db.query(DealMatch).filter(
                        DealMatch.deal_id == deal_id,
                        DealMatch.insurer_policy_id.in_(user_policy_ids)
                    ).first() is not None
            
            print(f"Has match: {has_match}")
            if not has_match:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied - no match with this deal")
        
        # Get the document
        doc = db.query(DealDocument).filter(
            DealDocument.id == document_id, 
            DealDocument.deal_id == deal_id
        ).first()
        
        if not doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
        
        print(f"Document found: {doc.original_filename}, path: {doc.file_path}")
        
        if not os.path.exists(doc.file_path):
            print(f"File not found at path: {doc.file_path}")
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found on server")
        
        # Log the download
        audit_service.log(
            db=db, action="document_downloaded", entity_type="deal_document",
            entity_id=document_id, user_id=current_user.id, 
            details={"deal_id": deal_id, "filename": doc.original_filename}
        )
        
        # Read file content
        print(f"Reading file: {doc.file_path}")
        with open(doc.file_path, 'rb') as f:
            file_content = f.read()
        print(f"File read successfully, size: {len(file_content)} bytes")
        
        return Response(
            content=file_content,
            media_type=doc.mime_type or "application/octet-stream",
            headers={
                "Content-Disposition": f'attachment; filename="{doc.original_filename}"',
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Credentials": "true",
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in download_document: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@router.delete("/{deal_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    deal_id: int, document_id: int,
    current_user: User = Depends(require_borrower),
    db: Session = Depends(get_db)
):
    """Delete a document from a deal."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    
    if deal.borrower_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    doc = db.query(DealDocument).filter(DealDocument.id == document_id, DealDocument.deal_id == deal_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    
    if os.path.exists(doc.file_path):
        os.remove(doc.file_path)
    
    db.delete(doc)
    db.commit()
    
    audit_service.log(db=db, action="document_deleted", entity_type="deal_document",
                     entity_id=document_id, user_id=current_user.id, details={"deal_id": deal_id})


@router.get("/{deal_id}/risk-reports", response_model=List[DealRiskReportResponse])
def list_risk_reports(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """List all risk reports for a deal."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    
    if current_user.role == UserRole.BORROWER and deal.borrower_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    reports = db.query(DealRiskReport).filter(DealRiskReport.deal_id == deal_id).order_by(DealRiskReport.version.desc()).all()
    return reports


@router.get("/{deal_id}/risk-reports/latest", response_model=DealRiskReportResponse)
def get_latest_risk_report(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get the latest risk report for a deal."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    
    if current_user.role == UserRole.BORROWER and deal.borrower_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    report = db.query(DealRiskReport).filter(DealRiskReport.deal_id == deal_id).order_by(DealRiskReport.version.desc()).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No risk report found for this deal")
    
    return report


@router.delete("/{deal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_deal(
    deal_id: int,
    current_user: User = Depends(require_borrower),
    db: Session = Depends(get_db)
):
    """Delete a deal (only drafts can be deleted)."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    
    if deal.borrower_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    if deal.status != DealStatus.DRAFT:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only draft deals can be deleted")
    
    for doc in deal.documents:
        if os.path.exists(doc.file_path):
            os.remove(doc.file_path)
    
    db.delete(deal)
    db.commit()
    
    audit_service.log(db=db, action="deal_deleted", entity_type="deal", entity_id=deal_id, user_id=current_user.id)


@router.get("/{deal_id}/verification")
def get_verification_status(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get document verification status for a deal.
    
    Shows any discrepancies between borrower-reported values and 
    values extracted from uploaded documents.
    
    Available to: Deal owner, lenders/insurers (for analyzed+ deals), admins
    """
    from app.services.verification import DocumentVerificationService
    
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    
    # Check access
    is_owner = deal.borrower_id == current_user.id
    is_admin = current_user.role == UserRole.ADMIN
    is_reviewer = current_user.role in [UserRole.LENDER, UserRole.INSURER]
    
    if not (is_owner or is_admin):
        if is_reviewer:
            # Reviewers can only see analyzed+ deals
            if deal.status in [DealStatus.DRAFT, DealStatus.SUBMITTED, DealStatus.ANALYZING]:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, 
                                  detail="Deal not yet available for review")
        else:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    verification_service = DocumentVerificationService(db)
    summary = verification_service.get_verification_summary(deal)
    
    return {
        **summary,
        "disclaimer": "Document verification is automated and may not catch all discrepancies. Manual review recommended."
    }


@router.post("/{deal_id}/verify-documents")
def run_verification(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Manually trigger document verification for a deal.
    Updates the latest risk report with verification results.
    """
    from app.services.verification import DocumentVerificationService
    
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    
    if deal.borrower_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    verification_service = DocumentVerificationService(db)
    result = verification_service.verify_deal(deal)
    
    # Update latest risk report if exists
    latest_report = db.query(DealRiskReport).filter(
        DealRiskReport.deal_id == deal_id
    ).order_by(DealRiskReport.version.desc()).first()
    
    if latest_report:
        latest_report.verification_status = "verified" if result.verified else "flagged"
        latest_report.verification_confidence = result.confidence_score
        latest_report.verification_flags = [
            {
                "field": d.field_label,
                "reported": d.reported_value,
                "extracted": d.extracted_value,
                "difference_pct": round(d.difference_pct * 100, 1),
                "severity": d.severity.value,
                "notes": d.notes
            }
            for d in result.discrepancies
        ]
        latest_report.documents_verified = len(result.documents_analyzed)
        db.commit()
    
    audit_service.log(
        db=db, action="verification_run", entity_type="deal",
        entity_id=deal_id, user_id=current_user.id,
        details={"flag_count": result.flag_count, "verified": result.verified}
    )
    
    return verification_service.get_verification_summary(deal)


@router.get("/{deal_id}/cashflows")
def get_deal_cashflows(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get monthly cash flow data for a deal."""
    from app.models.deal import MonthlyCashflow
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    if current_user.role == UserRole.BORROWER and deal.borrower_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    cashflows = db.query(MonthlyCashflow).filter(
        MonthlyCashflow.deal_id == deal_id
    ).order_by(MonthlyCashflow.year, MonthlyCashflow.month).all()
    return [
        {
            "month": c.month, "year": c.year,
            "revenue": c.revenue, "ebitda": c.ebitda,
            "debt_service": c.debt_service,
            "post_debt_fcf": c.post_debt_fcf,
        }
        for c in cashflows
    ]
