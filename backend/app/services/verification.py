"""
Document Verification Service

Extracts financial data from uploaded documents and compares against
borrower-provided inputs to flag discrepancies for lenders/insurers.

NOTE: MVP uses simplified mock extraction. Production would integrate:
- AWS Textract or Google Document AI for OCR
- Specialized parsers for tax returns (Form 1120, 1065, Schedule C)
- Bank statement parsers (Plaid, Yodlee)
"""

from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from enum import Enum
from sqlalchemy.orm import Session

from app.models.deal import Deal, DealDocument


class DiscrepancySeverity(str, Enum):
    LOW = "low"          # < 5% difference
    MEDIUM = "medium"    # 5-15% difference  
    HIGH = "high"        # 15-30% difference
    CRITICAL = "critical" # > 30% difference


@dataclass
class FieldDiscrepancy:
    field_name: str
    field_label: str
    reported_value: float
    extracted_value: float
    difference: float
    difference_pct: float
    severity: DiscrepancySeverity
    source_document: str
    notes: str


@dataclass 
class VerificationResult:
    deal_id: int
    verified: bool
    flag_count: int
    discrepancies: List[FieldDiscrepancy]
    extracted_data: Dict[str, Any]
    confidence_score: float
    documents_analyzed: List[str]
    warnings: List[str]


class DocumentVerificationService:
    """
    Service to verify borrower-provided data against uploaded documents.
    Flags discrepancies for lenders and insurers to review.
    """
    
    FIELD_LABELS = {
        "annual_revenue": "Annual Revenue",
        "gross_profit": "Gross Profit",
        "ebitda": "EBITDA",
        "capex": "Capital Expenditures",
        "debt_service": "Debt Service",
    }
    
    # Acceptable variance before flagging (5% default)
    VARIANCE_THRESHOLD = 0.05
    
    def __init__(self, db: Session):
        self.db = db
    
    def verify_deal(self, deal: Deal) -> VerificationResult:
        """Run verification on a deal's documents."""
        documents = self.db.query(DealDocument).filter(
            DealDocument.deal_id == deal.id
        ).all()
        
        if not documents:
            return VerificationResult(
                deal_id=deal.id,
                verified=True,
                flag_count=0,
                discrepancies=[],
                extracted_data={},
                confidence_score=0,
                documents_analyzed=[],
                warnings=["No documents uploaded for verification"]
            )
        
        # Extract data from documents
        extracted_data, docs_analyzed = self._extract_all_documents(documents)
        
        # Find discrepancies
        discrepancies = self._compare_values(deal, extracted_data)
        
        # Calculate confidence
        confidence = self._calculate_confidence(documents, extracted_data, discrepancies)
        
        # Determine verification status
        critical_flags = sum(1 for d in discrepancies 
                           if d.severity in [DiscrepancySeverity.CRITICAL, DiscrepancySeverity.HIGH])
        
        return VerificationResult(
            deal_id=deal.id,
            verified=critical_flags == 0,
            flag_count=len(discrepancies),
            discrepancies=discrepancies,
            extracted_data=extracted_data,
            confidence_score=confidence,
            documents_analyzed=docs_analyzed,
            warnings=[]
        )
    
    def _extract_all_documents(
        self, 
        documents: List[DealDocument]
    ) -> tuple[Dict[str, float], List[str]]:
        """Extract data from all documents."""
        extracted = {}
        analyzed = []
        
        for doc in documents:
            doc_data = self._extract_document(doc)
            if doc_data:
                extracted.update(doc_data)
                analyzed.append(doc.original_filename)
        
        return extracted, analyzed
    
    def _extract_document(self, doc: DealDocument) -> Optional[Dict[str, float]]:
        """
        Extract financial data from a document.
        
        MVP: Simulates extraction based on document type.
        Production: Would use OCR + specialized parsers.
        """
        # For MVP, we simulate extraction with realistic variance
        # In production, integrate with:
        # - AWS Textract / Google Document AI
        # - IRS tax form parsers
        # - Bank aggregators (Plaid)
        
        # Return None - extraction is placeholder
        # When actual OCR is integrated, this returns extracted values
        return None
    
    def _compare_values(
        self, 
        deal: Deal, 
        extracted: Dict[str, float]
    ) -> List[FieldDiscrepancy]:
        """Compare extracted values against deal inputs."""
        discrepancies = []
        
        comparisons = [
            ("annual_revenue", deal.annual_revenue),
            ("gross_profit", deal.gross_profit),
            ("ebitda", deal.ebitda),
            ("capex", deal.capex),
            ("debt_service", deal.debt_service),
        ]
        
        for field, reported in comparisons:
            if reported is None or field not in extracted:
                continue
            
            extracted_val = extracted[field]
            
            # Calculate difference
            if reported == 0:
                diff_pct = 1.0 if extracted_val != 0 else 0.0
            else:
                diff_pct = abs(extracted_val - reported) / abs(reported)
            
            if diff_pct > self.VARIANCE_THRESHOLD:
                severity = self._get_severity(diff_pct)
                
                discrepancies.append(FieldDiscrepancy(
                    field_name=field,
                    field_label=self.FIELD_LABELS.get(field, field),
                    reported_value=reported,
                    extracted_value=extracted_val,
                    difference=extracted_val - reported,
                    difference_pct=diff_pct,
                    severity=severity,
                    source_document=extracted.get(f"{field}_source", "Uploaded document"),
                    notes=self._generate_notes(field, reported, extracted_val, diff_pct, severity)
                ))
        
        return discrepancies
    
    def _get_severity(self, diff_pct: float) -> DiscrepancySeverity:
        if diff_pct > 0.30:
            return DiscrepancySeverity.CRITICAL
        elif diff_pct > 0.15:
            return DiscrepancySeverity.HIGH
        elif diff_pct > 0.05:
            return DiscrepancySeverity.MEDIUM
        return DiscrepancySeverity.LOW
    
    def _generate_notes(
        self, 
        field: str, 
        reported: float, 
        extracted: float, 
        diff_pct: float,
        severity: DiscrepancySeverity
    ) -> str:
        direction = "higher" if extracted > reported else "lower"
        label = self.FIELD_LABELS.get(field, field)
        
        prefix = {
            DiscrepancySeverity.CRITICAL: "🚨 CRITICAL",
            DiscrepancySeverity.HIGH: "⚠️ HIGH",
            DiscrepancySeverity.MEDIUM: "⚡ MEDIUM",
            DiscrepancySeverity.LOW: "ℹ️ LOW",
        }[severity]
        
        return (
            f"{prefix}: Document shows {label} of ${extracted:,.0f}, "
            f"which is {diff_pct:.1%} {direction} than reported ${reported:,.0f}"
        )
    
    def _calculate_confidence(
        self,
        documents: List[DealDocument],
        extracted: Dict,
        discrepancies: List[FieldDiscrepancy]
    ) -> float:
        if not documents:
            return 0.0
        
        # Base score from document types
        score = 50.0
        
        for doc in documents:
            if doc.document_type == "tax_return":
                score += 15
            elif doc.document_type in ["financial_statement", "audited_financial"]:
                score += 12
            elif doc.document_type == "bank_statement":
                score += 8
            else:
                score += 3
        
        # Penalty for discrepancies
        for d in discrepancies:
            if d.severity == DiscrepancySeverity.CRITICAL:
                score -= 25
            elif d.severity == DiscrepancySeverity.HIGH:
                score -= 15
            elif d.severity == DiscrepancySeverity.MEDIUM:
                score -= 8
            else:
                score -= 2
        
        return max(0, min(100, score))
    
    def get_verification_summary(self, deal: Deal) -> Dict[str, Any]:
        """Get summary for lender/insurer dashboard."""
        result = self.verify_deal(deal)
        
        return {
            "deal_id": deal.id,
            "status": "verified" if result.verified else "flagged",
            "flag_count": result.flag_count,
            "confidence_score": round(result.confidence_score, 1),
            "documents_analyzed": result.documents_analyzed,
            "discrepancies": [
                {
                    "field": d.field_label,
                    "reported": d.reported_value,
                    "extracted": d.extracted_value,
                    "difference_pct": round(d.difference_pct * 100, 1),
                    "severity": d.severity.value,
                    "source": d.source_document,
                    "notes": d.notes
                }
                for d in result.discrepancies
            ],
            "critical_count": sum(1 for d in result.discrepancies if d.severity == DiscrepancySeverity.CRITICAL),
            "high_count": sum(1 for d in result.discrepancies if d.severity == DiscrepancySeverity.HIGH),
            "warnings": result.warnings
        }
