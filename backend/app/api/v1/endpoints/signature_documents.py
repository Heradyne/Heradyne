from typing import List, Optional
from datetime import datetime, date
import logging
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.orm import Session
import base64

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User, UserRole
from app.models.deal import Deal, DealMatch
from app.models.executed_loan import ExecutedLoan
from app.models.signature_document import (
    SignatureDocument, SignatureDocumentStatus, SignatureDocumentType
)
from app.services.audit import audit_service

router = APIRouter()
log = logging.getLogger("heradyne.signature_documents")


# Schemas
class SignatureDocumentCreate(BaseModel):
    deal_id: int
    title: str
    description: Optional[str] = None
    document_type: str = "other"
    signature_due_date: Optional[date] = None
    loan_id: Optional[int] = None


class SignatureDocumentResponse(BaseModel):
    id: int
    deal_id: int
    uploaded_by_id: int
    title: str
    description: Optional[str]
    document_type: str
    file_name: str
    file_type: str
    file_size: Optional[int]
    status: str
    signature_requested_at: Optional[datetime]
    signature_due_date: Optional[datetime]
    signed_at: Optional[datetime]
    signed_by_id: Optional[int]
    signature_notes: Optional[str]
    loan_id: Optional[int]
    created_at: datetime
    updated_at: datetime
    
    # Enriched fields
    uploaded_by_name: Optional[str] = None
    uploaded_by_role: Optional[str] = None
    signed_by_name: Optional[str] = None
    deal_name: Optional[str] = None
    borrower_name: Optional[str] = None
    
    class Config:
        from_attributes = True


class SignDocumentRequest(BaseModel):
    signature_notes: Optional[str] = None


class RejectDocumentRequest(BaseModel):
    rejection_reason: str


# Helper to check if user has access to deal
def user_has_deal_access(user: User, deal: Deal, db: Session) -> bool:
    """Check if user has access to this deal."""
    from app.models.policy import LenderPolicy, InsurerPolicy
    
    if user.role == UserRole.ADMIN:
        return True
    if user.role == UserRole.BORROWER:
        return deal.borrower_id == user.id
    if user.role == UserRole.LENDER:
        # Check if lender has a match with this deal through their policies
        lender_policy_ids = [p.id for p in db.query(LenderPolicy).filter(
            LenderPolicy.lender_id == user.id
        ).all()]
        
        if not lender_policy_ids:
            return False
            
        match = db.query(DealMatch).filter(
            DealMatch.deal_id == deal.id,
            DealMatch.lender_policy_id.in_(lender_policy_ids)
        ).first()
        return match is not None
        
    if user.role == UserRole.INSURER:
        # Check if insurer has a match with this deal through their policies
        insurer_policy_ids = [p.id for p in db.query(InsurerPolicy).filter(
            InsurerPolicy.insurer_id == user.id
        ).all()]
        
        if not insurer_policy_ids:
            return False
            
        match = db.query(DealMatch).filter(
            DealMatch.deal_id == deal.id,
            DealMatch.insurer_policy_id.in_(insurer_policy_ids)
        ).first()
        return match is not None
        
    return False


# Endpoints

@router.post("/upload", response_model=SignatureDocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_signature_document(
    deal_id: int = Form(...),
    title: str = Form(...),
    description: Optional[str] = Form(None),
    document_type: str = Form("other"),
    signature_due_date: Optional[str] = Form(None),
    loan_id: Optional[int] = Form(None),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Upload a document for borrower signature (lenders/insurers only)."""
    try:
        # Only lenders and insurers can upload signature documents
        if current_user.role not in [UserRole.LENDER, UserRole.INSURER, UserRole.ADMIN]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only lenders and insurers can upload signature documents"
            )
        
        # Verify deal exists
        deal = db.query(Deal).filter(Deal.id == deal_id).first()
        if not deal:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deal not found"
            )
        
        # Verify user has access to this deal
        if not user_has_deal_access(current_user, deal, db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this deal"
            )
        
        # Read file content
        file_content = await file.read()
        file_base64 = base64.b64encode(file_content).decode('utf-8')
        
        # Parse due date if provided
        due_date = None
        if signature_due_date:
            try:
                due_date = datetime.strptime(signature_due_date, "%Y-%m-%d")
            except ValueError:
                pass
        
        # Create signature document
        sig_doc = SignatureDocument(
            deal_id=deal_id,
            uploaded_by_id=current_user.id,
            title=title,
            description=description,
            document_type=SignatureDocumentType(document_type) if document_type in [e.value for e in SignatureDocumentType] else SignatureDocumentType.OTHER,
            file_name=file.filename,
            file_type=file.content_type or "application/octet-stream",
            file_size=len(file_content),
            file_data=file_base64,
            status=SignatureDocumentStatus.PENDING,
            signature_requested_at=datetime.utcnow(),
            signature_due_date=due_date,
            loan_id=loan_id
        )
        
        db.add(sig_doc)
        db.commit()
        db.refresh(sig_doc)
        
        # Audit log
        audit_service.log(
            db=db,
            action="signature_document_uploaded",
            entity_type="signature_document",
            entity_id=sig_doc.id,
            user_id=current_user.id,
            details={"deal_id": deal_id, "title": title, "file_name": file.filename}
        )
        
        borrower = db.query(User).filter(User.id == deal.borrower_id).first()
        
        return SignatureDocumentResponse(
            id=sig_doc.id,
            deal_id=sig_doc.deal_id,
            uploaded_by_id=sig_doc.uploaded_by_id,
            title=sig_doc.title,
            description=sig_doc.description,
            document_type=sig_doc.document_type.value,
            file_name=sig_doc.file_name,
            file_type=sig_doc.file_type,
            file_size=sig_doc.file_size,
            status=sig_doc.status.value,
            signature_requested_at=sig_doc.signature_requested_at,
            signature_due_date=sig_doc.signature_due_date,
            signed_at=sig_doc.signed_at,
            signed_by_id=sig_doc.signed_by_id,
            signature_notes=sig_doc.signature_notes,
            loan_id=sig_doc.loan_id,
            created_at=sig_doc.created_at,
            updated_at=sig_doc.updated_at,
            uploaded_by_name=current_user.full_name,
            uploaded_by_role=current_user.role.value,
            deal_name=deal.name,
            borrower_name=borrower.full_name if borrower else None
        )
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Error in upload_signature_document: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred processing this document."
        )


@router.get("/pending", response_model=List[SignatureDocumentResponse])
def get_pending_signatures(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get documents pending signature (for borrowers)."""
    if current_user.role != UserRole.BORROWER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only borrowers can view pending signatures"
        )
    
    # Get all pending signature documents for borrower's deals
    docs = db.query(SignatureDocument).join(Deal).filter(
        Deal.borrower_id == current_user.id,
        SignatureDocument.status == SignatureDocumentStatus.PENDING
    ).order_by(SignatureDocument.signature_requested_at.desc()).all()
    
    result = []
    for doc in docs:
        deal = doc.deal
        uploader = db.query(User).filter(User.id == doc.uploaded_by_id).first()
        
        result.append(SignatureDocumentResponse(
            id=doc.id,
            deal_id=doc.deal_id,
            uploaded_by_id=doc.uploaded_by_id,
            title=doc.title,
            description=doc.description,
            document_type=doc.document_type.value,
            file_name=doc.file_name,
            file_type=doc.file_type,
            file_size=doc.file_size,
            status=doc.status.value,
            signature_requested_at=doc.signature_requested_at,
            signature_due_date=doc.signature_due_date,
            signed_at=doc.signed_at,
            signed_by_id=doc.signed_by_id,
            signature_notes=doc.signature_notes,
            loan_id=doc.loan_id,
            created_at=doc.created_at,
            updated_at=doc.updated_at,
            uploaded_by_name=uploader.full_name if uploader else None,
            uploaded_by_role=uploader.role.value if uploader else None,
            deal_name=deal.name if deal else None,
            borrower_name=current_user.full_name
        ))
    
    return result


@router.get("/deal/{deal_id}", response_model=List[SignatureDocumentResponse])
def get_deal_signature_documents(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all signature documents for a deal."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deal not found"
        )
    
    # Verify access
    if not user_has_deal_access(current_user, deal, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this deal"
        )
    
    docs = db.query(SignatureDocument).filter(
        SignatureDocument.deal_id == deal_id
    ).order_by(SignatureDocument.created_at.desc()).all()
    
    borrower = db.query(User).filter(User.id == deal.borrower_id).first()
    
    result = []
    for doc in docs:
        uploader = db.query(User).filter(User.id == doc.uploaded_by_id).first()
        signer = db.query(User).filter(User.id == doc.signed_by_id).first() if doc.signed_by_id else None
        
        result.append(SignatureDocumentResponse(
            id=doc.id,
            deal_id=doc.deal_id,
            uploaded_by_id=doc.uploaded_by_id,
            title=doc.title,
            description=doc.description,
            document_type=doc.document_type.value,
            file_name=doc.file_name,
            file_type=doc.file_type,
            file_size=doc.file_size,
            status=doc.status.value,
            signature_requested_at=doc.signature_requested_at,
            signature_due_date=doc.signature_due_date,
            signed_at=doc.signed_at,
            signed_by_id=doc.signed_by_id,
            signature_notes=doc.signature_notes,
            loan_id=doc.loan_id,
            created_at=doc.created_at,
            updated_at=doc.updated_at,
            uploaded_by_name=uploader.full_name if uploader else None,
            uploaded_by_role=uploader.role.value if uploader else None,
            signed_by_name=signer.full_name if signer else None,
            deal_name=deal.name,
            borrower_name=borrower.full_name if borrower else None
        ))
    
    return result


@router.get("/my-uploads", response_model=List[SignatureDocumentResponse])
def get_my_uploaded_documents(
    status_filter: Optional[str] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get documents I've uploaded (for lenders/insurers)."""
    if current_user.role not in [UserRole.LENDER, UserRole.INSURER, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only lenders and insurers can view uploaded documents"
        )
    
    query = db.query(SignatureDocument).filter(
        SignatureDocument.uploaded_by_id == current_user.id
    )
    
    if status_filter:
        try:
            status_enum = SignatureDocumentStatus(status_filter)
            query = query.filter(SignatureDocument.status == status_enum)
        except ValueError:
            pass
    
    docs = query.order_by(SignatureDocument.created_at.desc()).all()
    
    result = []
    for doc in docs:
        deal = doc.deal
        borrower = db.query(User).filter(User.id == deal.borrower_id).first() if deal else None
        signer = db.query(User).filter(User.id == doc.signed_by_id).first() if doc.signed_by_id else None
        
        result.append(SignatureDocumentResponse(
            id=doc.id,
            deal_id=doc.deal_id,
            uploaded_by_id=doc.uploaded_by_id,
            title=doc.title,
            description=doc.description,
            document_type=doc.document_type.value,
            file_name=doc.file_name,
            file_type=doc.file_type,
            file_size=doc.file_size,
            status=doc.status.value,
            signature_requested_at=doc.signature_requested_at,
            signature_due_date=doc.signature_due_date,
            signed_at=doc.signed_at,
            signed_by_id=doc.signed_by_id,
            signature_notes=doc.signature_notes,
            loan_id=doc.loan_id,
            created_at=doc.created_at,
            updated_at=doc.updated_at,
            uploaded_by_name=current_user.full_name,
            uploaded_by_role=current_user.role.value,
            signed_by_name=signer.full_name if signer else None,
            deal_name=deal.name if deal else None,
            borrower_name=borrower.full_name if borrower else None
        ))
    
    return result


@router.get("/{document_id}", response_model=SignatureDocumentResponse)
def get_signature_document(
    document_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get a specific signature document."""
    doc = db.query(SignatureDocument).filter(SignatureDocument.id == document_id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    deal = doc.deal
    if not user_has_deal_access(current_user, deal, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this document"
        )
    
    uploader = db.query(User).filter(User.id == doc.uploaded_by_id).first()
    borrower = db.query(User).filter(User.id == deal.borrower_id).first()
    signer = db.query(User).filter(User.id == doc.signed_by_id).first() if doc.signed_by_id else None
    
    return SignatureDocumentResponse(
        id=doc.id,
        deal_id=doc.deal_id,
        uploaded_by_id=doc.uploaded_by_id,
        title=doc.title,
        description=doc.description,
        document_type=doc.document_type.value,
        file_name=doc.file_name,
        file_type=doc.file_type,
        file_size=doc.file_size,
        status=doc.status.value,
        signature_requested_at=doc.signature_requested_at,
        signature_due_date=doc.signature_due_date,
        signed_at=doc.signed_at,
        signed_by_id=doc.signed_by_id,
        signature_notes=doc.signature_notes,
        loan_id=doc.loan_id,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        uploaded_by_name=uploader.full_name if uploader else None,
        uploaded_by_role=uploader.role.value if uploader else None,
        signed_by_name=signer.full_name if signer else None,
        deal_name=deal.name,
        borrower_name=borrower.full_name if borrower else None
    )


@router.get("/{document_id}/download")
def download_signature_document(
    document_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Download a signature document file."""
    doc = db.query(SignatureDocument).filter(SignatureDocument.id == document_id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    deal = doc.deal
    if not user_has_deal_access(current_user, deal, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this document"
        )
    
    if not doc.file_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document file not found"
        )
    
    return {
        "file_name": doc.file_name,
        "file_type": doc.file_type,
        "file_data": doc.file_data  # Base64 encoded
    }


@router.post("/{document_id}/sign", response_model=SignatureDocumentResponse)
def sign_document(
    document_id: int,
    request: SignDocumentRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Sign a document (borrowers only)."""
    if current_user.role != UserRole.BORROWER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only borrowers can sign documents"
        )
    
    doc = db.query(SignatureDocument).filter(SignatureDocument.id == document_id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    deal = doc.deal
    if deal.borrower_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only sign documents for your own deals"
        )
    
    if doc.status != SignatureDocumentStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Document is not pending signature (current status: {doc.status.value})"
        )
    
    # Sign the document
    doc.status = SignatureDocumentStatus.SIGNED
    doc.signed_at = datetime.utcnow()
    doc.signed_by_id = current_user.id
    doc.signature_notes = request.signature_notes
    
    db.commit()
    db.refresh(doc)
    
    # Audit log
    audit_service.log(
        db=db,
        action="document_signed",
        entity_type="signature_document",
        entity_id=doc.id,
        user_id=current_user.id,
        details={"deal_id": doc.deal_id, "title": doc.title}
    )
    
    uploader = db.query(User).filter(User.id == doc.uploaded_by_id).first()
    
    return SignatureDocumentResponse(
        id=doc.id,
        deal_id=doc.deal_id,
        uploaded_by_id=doc.uploaded_by_id,
        title=doc.title,
        description=doc.description,
        document_type=doc.document_type.value,
        file_name=doc.file_name,
        file_type=doc.file_type,
        file_size=doc.file_size,
        status=doc.status.value,
        signature_requested_at=doc.signature_requested_at,
        signature_due_date=doc.signature_due_date,
        signed_at=doc.signed_at,
        signed_by_id=doc.signed_by_id,
        signature_notes=doc.signature_notes,
        loan_id=doc.loan_id,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        uploaded_by_name=uploader.full_name if uploader else None,
        uploaded_by_role=uploader.role.value if uploader else None,
        signed_by_name=current_user.full_name,
        deal_name=deal.name,
        borrower_name=current_user.full_name
    )


@router.post("/{document_id}/reject", response_model=SignatureDocumentResponse)
def reject_document(
    document_id: int,
    request: RejectDocumentRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Reject/decline to sign a document (borrowers only)."""
    if current_user.role != UserRole.BORROWER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only borrowers can reject documents"
        )
    
    doc = db.query(SignatureDocument).filter(SignatureDocument.id == document_id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    deal = doc.deal
    if deal.borrower_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only reject documents for your own deals"
        )
    
    if doc.status != SignatureDocumentStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Document is not pending signature (current status: {doc.status.value})"
        )
    
    # Reject the document
    doc.status = SignatureDocumentStatus.REJECTED
    doc.signed_at = datetime.utcnow()  # Use signed_at for rejection time too
    doc.signed_by_id = current_user.id
    doc.signature_notes = request.rejection_reason
    
    db.commit()
    db.refresh(doc)
    
    # Audit log
    audit_service.log(
        db=db,
        action="document_rejected",
        entity_type="signature_document",
        entity_id=doc.id,
        user_id=current_user.id,
        details={"deal_id": doc.deal_id, "title": doc.title, "reason": request.rejection_reason}
    )
    
    uploader = db.query(User).filter(User.id == doc.uploaded_by_id).first()
    
    return SignatureDocumentResponse(
        id=doc.id,
        deal_id=doc.deal_id,
        uploaded_by_id=doc.uploaded_by_id,
        title=doc.title,
        description=doc.description,
        document_type=doc.document_type.value,
        file_name=doc.file_name,
        file_type=doc.file_type,
        file_size=doc.file_size,
        status=doc.status.value,
        signature_requested_at=doc.signature_requested_at,
        signature_due_date=doc.signature_due_date,
        signed_at=doc.signed_at,
        signed_by_id=doc.signed_by_id,
        signature_notes=doc.signature_notes,
        loan_id=doc.loan_id,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        uploaded_by_name=uploader.full_name if uploader else None,
        uploaded_by_role=uploader.role.value if uploader else None,
        signed_by_name=current_user.full_name,
        deal_name=deal.name,
        borrower_name=current_user.full_name
    )


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def withdraw_document(
    document_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Withdraw a signature document (uploader only, only if pending)."""
    doc = db.query(SignatureDocument).filter(SignatureDocument.id == document_id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    # Only uploader can withdraw
    if doc.uploaded_by_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the uploader can withdraw a document"
        )
    
    if doc.status != SignatureDocumentStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only withdraw pending documents"
        )
    
    doc.status = SignatureDocumentStatus.WITHDRAWN
    db.commit()
    
    # Audit log
    audit_service.log(
        db=db,
        action="document_withdrawn",
        entity_type="signature_document",
        entity_id=doc.id,
        user_id=current_user.id,
        details={"deal_id": doc.deal_id, "title": doc.title}
    )
