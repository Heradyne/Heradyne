import enum
from sqlalchemy import Column, Integer, String, Float, Boolean, Enum, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from datetime import datetime

from app.models.base import Base, TimestampMixin


class SignatureDocumentStatus(str, enum.Enum):
    PENDING = "pending"  # Awaiting borrower signature
    SIGNED = "signed"    # Borrower has signed
    REJECTED = "rejected"  # Borrower rejected/declined
    EXPIRED = "expired"  # Document expired before signature
    WITHDRAWN = "withdrawn"  # Lender/insurer withdrew the document


class SignatureDocumentType(str, enum.Enum):
    LOAN_AGREEMENT = "loan_agreement"
    GUARANTEE_CONTRACT = "guarantee_contract"
    TERM_SHEET = "term_sheet"
    PROMISSORY_NOTE = "promissory_note"
    SECURITY_AGREEMENT = "security_agreement"
    PERSONAL_GUARANTEE = "personal_guarantee"
    OTHER = "other"


class SignatureDocument(Base, TimestampMixin):
    """Documents that require borrower signature, uploaded by lenders/insurers."""
    __tablename__ = "signature_documents"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Which deal this document is for
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    
    # Who uploaded the document (lender or insurer)
    uploaded_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Document info
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    document_type = Column(Enum(SignatureDocumentType, native_enum=False), default=SignatureDocumentType.OTHER)
    
    # File info (stored as base64 or file path)
    file_name = Column(String(255), nullable=False)
    file_type = Column(String(255), nullable=False)  # MIME type - can be long
    file_size = Column(Integer, nullable=True)  # Size in bytes
    file_data = Column(Text, nullable=True)  # Base64 encoded file content
    
    # Status tracking
    status = Column(Enum(SignatureDocumentStatus, native_enum=False), default=SignatureDocumentStatus.PENDING)
    
    # Signature info
    signature_requested_at = Column(DateTime, default=datetime.utcnow)
    signature_due_date = Column(DateTime, nullable=True)
    signed_at = Column(DateTime, nullable=True)
    signed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    signature_notes = Column(Text, nullable=True)  # Notes from borrower when signing/rejecting
    
    # Optional: Link to executed loan if this is for loan documentation
    loan_id = Column(Integer, ForeignKey("executed_loans.id"), nullable=True)
    
    # Relationships
    deal = relationship("Deal", backref="signature_documents")
    uploaded_by = relationship("User", foreign_keys=[uploaded_by_id], backref="uploaded_signature_docs")
    signed_by = relationship("User", foreign_keys=[signed_by_id], backref="signed_documents")
    loan = relationship("ExecutedLoan", backref="signature_documents")
    
    def __repr__(self):
        return f"<SignatureDocument {self.id}: {self.title} ({self.status.value})>"
