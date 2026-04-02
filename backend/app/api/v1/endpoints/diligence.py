"""
underwrite-platform — app/api/v1/endpoints/diligence.py

Section 2 Full Diligence Package — Document Analysis Engine

Flow:
  1. Borrower uploads SBA 7(a) required documents via existing /deals/{id}/documents
  2. POST /deals/{id}/diligence/analyze — Claude reads each doc, extracts financials,
     flags discrepancies vs stated numbers, produces lender narrative
  3. GET /deals/{id}/diligence/status — returns analysis status and results
  4. GET /lender/review/{token} — public lender review page (NDA gate)
"""

import os
import base64
import json
import logging
import urllib.request
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models.user import User, UserRole
from app.models.deal import Deal, DealDocument, DealRiskReport
from app.services.audit import audit_service

router = APIRouter()
log = logging.getLogger("diligence")

MODEL = "claude-sonnet-4-20250514"
API_URL = "https://api.anthropic.com/v1/messages"

# Required SBA 7(a) document types
REQUIRED_DOCS = [
    {"type": "tax_return_business",   "label": "3 Years Business Tax Returns",            "required": True},
    {"type": "tax_return_personal",   "label": "3 Years Personal Tax Returns",            "required": True},
    {"type": "pl_ytd",                "label": "YTD Profit & Loss Statement",             "required": True},
    {"type": "balance_sheet",         "label": "Current Balance Sheet",                   "required": True},
    {"type": "debt_schedule",         "label": "Business Debt Schedule",                  "required": True},
    {"type": "loi_purchase_agreement","label": "Letter of Intent / Purchase Agreement",   "required": True},
    {"type": "equity_evidence",       "label": "Evidence of Equity Injection",            "required": True},
    {"type": "business_plan",         "label": "Business Plan / 3-Year Projections",      "required": False},
    {"type": "ar_aging",              "label": "Accounts Receivable Aging Report",        "required": False},
    {"type": "seller_transition",     "label": "Seller Transition Agreement",             "required": False},
]

# Per-document extraction prompts
DOC_PROMPTS = {
    "tax_return_business": """Extract from this business tax return:
- Tax year
- Gross receipts / total revenue
- Cost of goods sold
- Gross profit
- Total expenses
- Net income / taxable income
- Officer compensation
- Depreciation and amortization
- Any non-recurring items
Return as JSON with field names as keys. Use null for missing fields.""",

    "tax_return_personal": """Extract from this personal tax return:
- Tax year
- Total income (W-2 + Schedule C + K-1 + other)
- Schedule C income (if present)
- Total deductions
- Adjusted gross income
- Total tax liability
- Any SBA-relevant obligations
Return as JSON.""",

    "pl_ytd": """Extract from this P&L statement:
- Period covered (from/to dates)
- Total revenue
- Cost of goods sold
- Gross profit and gross margin %
- Operating expenses breakdown (top 5 categories)
- EBITDA (or calculate: net income + interest + taxes + D&A)
- Net income
- Owner draws or officer compensation
- Any non-recurring items
Return as JSON.""",

    "balance_sheet": """Extract from this balance sheet:
- As-of date
- Total current assets
- Cash and equivalents
- Accounts receivable
- Inventory
- Total fixed assets
- Total assets
- Total current liabilities
- Accounts payable
- Short-term debt
- Total long-term liabilities
- Total liabilities
- Total equity / net worth
- Working capital (current assets - current liabilities)
Return as JSON.""",

    "debt_schedule": """Extract from this debt schedule:
- List each obligation with: creditor name, original amount, current balance, monthly payment, interest rate, maturity date, collateral
- Total monthly debt service
- Total outstanding debt
Return as JSON with a 'obligations' array and 'totals' object.""",

    "loi_purchase_agreement": """Extract from this LOI or purchase agreement:
- Purchase price
- Asset vs stock sale
- Included assets
- Excluded assets / liabilities
- Earnout or seller note terms
- Seller transition period
- Closing date
- Key contingencies
Return as JSON.""",

    "equity_evidence": """From this bank statement or equity evidence:
- Account balance shown
- Date of statement
- Confirms sufficient funds for equity injection: yes/no
- Any concerns with the source of funds
Return as JSON.""",

    "default": """Extract the key financial and business information from this document relevant to an SBA 7(a) loan application. Return as JSON.""",
}


def _call_claude_with_doc(system: str, user_text: str, file_content: bytes, mime_type: str) -> Optional[str]:
    """Call Claude with a document attachment."""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return None

    # Encode file as base64
    b64 = base64.standard_b64encode(file_content).decode("utf-8")

    # Build message with document
    if mime_type == "application/pdf":
        doc_block = {
            "type": "document",
            "source": {"type": "base64", "media_type": "application/pdf", "data": b64}
        }
    elif mime_type and mime_type.startswith("image/"):
        doc_block = {
            "type": "image",
            "source": {"type": "base64", "media_type": mime_type, "data": b64}
        }
    else:
        # Try as PDF
        doc_block = {
            "type": "document",
            "source": {"type": "base64", "media_type": "application/pdf", "data": b64}
        }

    payload = json.dumps({
        "model": MODEL,
        "max_tokens": 2000,
        "system": system,
        "messages": [{
            "role": "user",
            "content": [
                doc_block,
                {"type": "text", "text": user_text}
            ]
        }]
    }).encode("utf-8")

    req = urllib.request.Request(
        API_URL, data=payload,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
            return data["content"][0]["text"]
    except Exception as e:
        log.error(f"Claude doc analysis error: {e}")
        return None


def _call_claude(system: str, user: str, max_tokens: int = 2000) -> Optional[str]:
    """Text-only Claude call for synthesis."""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return None
    payload = json.dumps({
        "model": MODEL, "max_tokens": max_tokens, "system": system,
        "messages": [{"role": "user", "content": user}],
    }).encode("utf-8")
    req = urllib.request.Request(API_URL, data=payload, headers={
        "Content-Type": "application/json", "x-api-key": api_key, "anthropic-version": "2023-06-01",
    }, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            return json.loads(resp.read())["content"][0]["text"]
    except Exception as e:
        log.error(f"Claude error: {e}")
        return None


def _parse_json(text: str) -> dict:
    if not text:
        return {}
    clean = text.strip()
    if clean.startswith("```"):
        lines = clean.split("\n")
        clean = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    try:
        return json.loads(clean)
    except Exception:
        s, e = clean.find("{"), clean.rfind("}") + 1
        if s >= 0 and e > s:
            try:
                return json.loads(clean[s:e])
            except Exception:
                pass
    return {"raw_text": text[:500]}


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/deals/{deal_id}/diligence/checklist")
def get_checklist(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get the SBA 7(a) document checklist with upload status for each item."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    if current_user.role == UserRole.BORROWER and deal.borrower_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Get uploaded docs
    uploaded = db.query(DealDocument).filter(DealDocument.deal_id == deal_id).all()
    uploaded_types = {doc.document_type: doc for doc in uploaded}

    checklist = []
    required_count = 0
    uploaded_required = 0
    for item in REQUIRED_DOCS:
        doc = uploaded_types.get(item["type"])
        status_val = "uploaded" if doc else "missing"
        if item["required"]:
            required_count += 1
            if doc:
                uploaded_required += 1
        checklist.append({
            **item,
            "status": status_val,
            "document_id": doc.id if doc else None,
            "filename": doc.original_filename if doc else None,
            "uploaded_at": doc.created_at.isoformat() if doc else None,
        })

    return {
        "deal_id": deal_id,
        "checklist": checklist,
        "required_uploaded": uploaded_required,
        "required_total": required_count,
        "ready_to_analyze": uploaded_required >= required_count,
        "total_uploaded": len(uploaded),
    }


@router.post("/deals/{deal_id}/diligence/analyze")
async def run_diligence_analysis(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Run full AI diligence analysis on uploaded documents.
    Extracts financials from each doc, cross-checks against stated numbers,
    flags discrepancies, and produces a lender-ready narrative.
    """
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    if current_user.role == UserRole.BORROWER and deal.borrower_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="AI analysis requires ANTHROPIC_API_KEY to be configured")

    # Load uploaded documents
    docs = db.query(DealDocument).filter(DealDocument.deal_id == deal_id).all()
    if not docs:
        raise HTTPException(status_code=400, detail="No documents uploaded. Please upload required documents first.")

    # ── STEP 1: Extract data from each document ──────────────────────────────
    extracted = {}
    doc_summaries = []

    for doc in docs:
        try:
            # Read file
            if not os.path.exists(doc.file_path):
                log.warning(f"File not found: {doc.file_path}")
                continue

            with open(doc.file_path, "rb") as f:
                content = f.read()

            doc_type = doc.document_type or "default"
            prompt = DOC_PROMPTS.get(doc_type, DOC_PROMPTS["default"])

            system = f"""You are a forensic financial analyst reviewing documents for an SBA 7(a) loan application.
Extract financial data precisely from the document provided.
You ALWAYS respond with valid JSON only — no markdown, no preamble.
If you cannot read or find a value, use null."""

            result_text = _call_claude_with_doc(system, prompt, content, doc.mime_type or "application/pdf")
            extracted_data = _parse_json(result_text) if result_text else {}

            extracted[doc_type] = extracted_data
            doc_summaries.append({
                "document_type": doc_type,
                "label": next((d["label"] for d in REQUIRED_DOCS if d["type"] == doc_type), doc.original_filename),
                "filename": doc.original_filename,
                "extracted": extracted_data,
            })

        except Exception as e:
            log.error(f"Error processing doc {doc.id}: {e}")
            doc_summaries.append({
                "document_type": doc.document_type,
                "label": doc.original_filename,
                "filename": doc.original_filename,
                "error": str(e),
            })

    # ── STEP 2: Synthesize — cross-check against stated numbers ──────────────

    stated_numbers = {
        "annual_revenue": deal.annual_revenue,
        "ebitda": deal.ebitda,
        "gross_profit": deal.gross_profit,
        "purchase_price": deal.purchase_price,
        "loan_amount_requested": deal.loan_amount_requested,
        "equity_injection": deal.equity_injection,
        "owner_credit_score": deal.owner_credit_score,
    }

    synthesis_prompt = f"""You are a senior SBA underwriter reviewing a full diligence package.

STATED NUMBERS (what the borrower entered in their application):
{json.dumps(stated_numbers, indent=2)}

EXTRACTED FROM DOCUMENTS:
{json.dumps(extracted, indent=2)}

BUSINESS: {deal.name} | {deal.industry}

Produce a comprehensive diligence analysis. Be specific — cite actual numbers from both sources.

Return this exact JSON structure:
{{
  "verification_status": <"verified"|"discrepancies_found"|"insufficient_docs">,
  "confidence_score": <0-100 — how confident are you in the stated numbers>,
  "verified_financials": {{
    "annual_revenue": <extracted or null>,
    "ebitda": <extracted or null>,
    "gross_profit": <extracted or null>,
    "owner_compensation": <extracted or null>,
    "total_debt_service": <from debt schedule or null>,
    "net_worth": <from balance sheet or null>,
    "working_capital": <from balance sheet or null>
  }},
  "discrepancies": [
    {{
      "field": "<field name>",
      "stated_value": <what borrower entered>,
      "extracted_value": <what docs show>,
      "variance_pct": <percentage difference>,
      "severity": <"minor"|"moderate"|"material">,
      "explanation": "<what might explain this difference>"
    }}
  ],
  "document_findings": [
    {{
      "document": "<doc type>",
      "key_finding": "<most important finding from this doc>",
      "concerns": ["<concern 1>"],
      "positive_signals": ["<positive 1>"]
    }}
  ],
  "missing_information": ["<what's missing that a lender would want>"],
  "lender_narrative": "<4-6 sentence lender-ready description of this business and deal opportunity, citing specific verified numbers — write as if you are the underwriter presenting this deal to a credit committee>",
  "underwriter_notes": "<2-3 sentences of frank underwriter commentary on the quality of this package and any material concerns>",
  "sba_readiness_score": <0-100 — how ready is this package for an SBA lender>,
  "recommended_next_steps": ["<specific step 1>", "<step 2>", "<step 3>"]
}}"""

    synthesis_system = "You are a senior SBA 7(a) underwriter. Respond with valid JSON only."
    synthesis_text = _call_claude(synthesis_system, synthesis_prompt, max_tokens=3000)
    synthesis = _parse_json(synthesis_text) if synthesis_text else {}

    # ── STEP 3: Save results to risk report ──────────────────────────────────

    report = db.query(DealRiskReport).filter(
        DealRiskReport.deal_id == deal_id
    ).order_by(DealRiskReport.version.desc()).first()

    if not report:
        report = DealRiskReport(deal_id=deal_id, version=1)
        db.add(report)
        db.flush()

    # Store diligence results in report_data JSON field
    existing_data = report.report_data or {}
    existing_data["diligence_analysis"] = {
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
        "doc_count": len(docs),
        "document_summaries": doc_summaries,
        "synthesis": synthesis,
    }
    report.report_data = existing_data

    # Update verification fields
    if synthesis.get("confidence_score"):
        report.verification_confidence = synthesis["confidence_score"] / 100
    if synthesis.get("discrepancies"):
        report.verification_flags = synthesis["discrepancies"]
    report.verification_status = synthesis.get("verification_status", "insufficient_docs")
    report.documents_verified = len(docs)

    db.commit()

    audit_service.log(
        db=db, action="diligence_analysis_run", entity_type="deal",
        entity_id=deal_id, user_id=current_user.id,
        details={"doc_count": len(docs), "status": synthesis.get("verification_status")}
    )

    return {
        "deal_id": deal_id,
        "status": "complete",
        "documents_analyzed": len(docs),
        "verification_status": synthesis.get("verification_status", "insufficient_docs"),
        "confidence_score": synthesis.get("confidence_score", 0),
        "discrepancy_count": len(synthesis.get("discrepancies", [])),
        "sba_readiness_score": synthesis.get("sba_readiness_score", 0),
        "analysis": synthesis,
        "document_summaries": doc_summaries,
    }


@router.get("/deals/{deal_id}/diligence/results")
def get_diligence_results(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get the latest diligence analysis results."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    if current_user.role == UserRole.BORROWER and deal.borrower_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    report = db.query(DealRiskReport).filter(
        DealRiskReport.deal_id == deal_id
    ).order_by(DealRiskReport.version.desc()).first()

    if not report or not report.report_data:
        return {"deal_id": deal_id, "status": "not_run", "analysis": None}

    diligence = report.report_data.get("diligence_analysis")
    if not diligence:
        return {"deal_id": deal_id, "status": "not_run", "analysis": None}

    return {
        "deal_id": deal_id,
        "status": "complete",
        "analyzed_at": diligence.get("analyzed_at"),
        "documents_analyzed": diligence.get("doc_count", 0),
        "analysis": diligence.get("synthesis", {}),
        "document_summaries": diligence.get("document_summaries", []),
    }


# ── PDF Report Generation ────────────────────────────────────────────────────

@router.get("/deals/{deal_id}/diligence/report.pdf")
def generate_pdf_report(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Generate and download the lender-ready PDF diligence report."""
    import io
    from fastapi.responses import StreamingResponse
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
    from reportlab.lib.enums import TA_CENTER, TA_LEFT

    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    if current_user.role == UserRole.BORROWER and deal.borrower_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    report = db.query(DealRiskReport).filter(
        DealRiskReport.deal_id == deal_id
    ).order_by(DealRiskReport.version.desc()).first()

    diligence = (report.report_data or {}).get("diligence_analysis", {}) if report else {}
    analysis = diligence.get("synthesis", {})

    # Build PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter,
        rightMargin=0.75*inch, leftMargin=0.75*inch,
        topMargin=0.75*inch, bottomMargin=0.75*inch)

    styles = getSampleStyleSheet()
    story = []

    # Custom styles
    title_style = ParagraphStyle('Title', parent=styles['Title'], fontSize=20, textColor=colors.HexColor('#1e3a5f'), spaceAfter=6)
    h1_style = ParagraphStyle('H1', parent=styles['Heading1'], fontSize=13, textColor=colors.HexColor('#1e3a5f'), spaceBefore=16, spaceAfter=6)
    h2_style = ParagraphStyle('H2', parent=styles['Heading2'], fontSize=11, textColor=colors.HexColor('#374151'), spaceBefore=10, spaceAfter=4)
    body_style = ParagraphStyle('Body', parent=styles['Normal'], fontSize=10, leading=14, spaceAfter=6)
    small_style = ParagraphStyle('Small', parent=styles['Normal'], fontSize=8, textColor=colors.HexColor('#6b7280'))
    label_style = ParagraphStyle('Label', parent=styles['Normal'], fontSize=8, textColor=colors.HexColor('#6b7280'), spaceAfter=2)
    value_style = ParagraphStyle('Value', parent=styles['Normal'], fontSize=11, fontName='Helvetica-Bold', spaceAfter=8)

    def fmt_usd(val):
        if val is None: return 'N/A'
        try: return f"${float(val):,.0f}"
        except: return str(val)

    # ── Cover ──
    story.append(Spacer(1, 0.3*inch))
    story.append(Paragraph("CONFIDENTIAL DILIGENCE REPORT", ParagraphStyle('Cover', parent=styles['Normal'], fontSize=9, textColor=colors.HexColor('#6b7280'), alignment=TA_CENTER)))
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph(deal.name, title_style))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor('#1e3a5f')))
    story.append(Spacer(1, 0.1*inch))

    from datetime import datetime
    story.append(Paragraph(f"Prepared by UnderwriteOS · {datetime.now().strftime('%B %d, %Y')} · Confidential", small_style))
    story.append(Spacer(1, 0.3*inch))

    # ── Deal Summary ──
    story.append(Paragraph("Deal Summary", h1_style))
    summary_data = [
        ['Business', deal.name, 'Industry', deal.industry or 'N/A'],
        ['Annual Revenue', fmt_usd(deal.annual_revenue), 'EBITDA', fmt_usd(deal.ebitda)],
        ['Asking Price', fmt_usd(deal.purchase_price), 'Loan Requested', fmt_usd(deal.loan_amount_requested)],
        ['Equity Injection', fmt_usd(deal.equity_injection), 'Owner Credit', str(deal.owner_credit_score or 'N/A')],
    ]
    t = Table(summary_data, colWidths=[1.3*inch, 2.2*inch, 1.3*inch, 2.2*inch])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f9fafb')),
        ('BACKGROUND', (0,0), (0,-1), colors.HexColor('#e5e7eb')),
        ('BACKGROUND', (2,0), (2,-1), colors.HexColor('#e5e7eb')),
        ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
        ('FONTNAME', (2,0), (2,-1), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('PADDING', (0,0), (-1,-1), 6),
        ('GRID', (0,0), (-1,-1), 0.5, colors.white),
        ('ROWBACKGROUNDS', (0,0), (-1,-1), [colors.HexColor('#f9fafb'), colors.white]),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.2*inch))

    # ── UnderwriteOS Scores ──
    if report:
        story.append(Paragraph("UnderwriteOS Analysis", h1_style))
        scores_data = [
            ['Health Score', f"{report.health_score or 'N/A'}/100", 'Deal Verdict', str(report.deal_killer_verdict or 'N/A').title()],
            ['DSCR (Base)', f"{report.dscr_base or 'N/A'}x", 'PDSCR', f"{report.pdscr or 'N/A'}x"],
            ['Equity Value', fmt_usd(report.equity_value_mid), 'Max Price', fmt_usd(report.max_supportable_price)],
            ['Cash Runway', f"{report.cash_runway_months or 'N/A'} months", 'SBA Eligible', 'Yes' if report.sba_eligible else 'No'],
        ]
        t2 = Table(scores_data, colWidths=[1.3*inch, 2.2*inch, 1.3*inch, 2.2*inch])
        t2.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (0,-1), colors.HexColor('#e5e7eb')),
            ('BACKGROUND', (2,0), (2,-1), colors.HexColor('#e5e7eb')),
            ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
            ('FONTNAME', (2,0), (2,-1), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,-1), 9),
            ('PADDING', (0,0), (-1,-1), 6),
            ('GRID', (0,0), (-1,-1), 0.5, colors.white),
            ('ROWBACKGROUNDS', (0,0), (-1,-1), [colors.HexColor('#f9fafb'), colors.white]),
        ]))
        story.append(t2)
        story.append(Spacer(1, 0.2*inch))

    # ── Diligence Analysis ──
    if analysis:
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#e5e7eb')))
        story.append(Paragraph("Document Diligence Analysis", h1_style))

        status_colors = {
            'verified': colors.HexColor('#dcfce7'),
            'discrepancies_found': colors.HexColor('#fef9c3'),
            'insufficient_docs': colors.HexColor('#f3f4f6'),
        }
        status_text = {
            'verified': 'FINANCIALS VERIFIED',
            'discrepancies_found': 'DISCREPANCIES FOUND — REVIEW REQUIRED',
            'insufficient_docs': 'INSUFFICIENT DOCUMENTS',
        }
        v_status = analysis.get('verification_status', 'insufficient_docs')
        status_table = Table([[
            Paragraph(status_text.get(v_status, v_status.upper()), ParagraphStyle('Status', fontName='Helvetica-Bold', fontSize=10)),
            Paragraph(f"Confidence: {analysis.get('confidence_score', 'N/A')}/100   SBA Readiness: {analysis.get('sba_readiness_score', 'N/A')}/100", ParagraphStyle('StatusSub', fontSize=9, textColor=colors.HexColor('#374151'))),
        ]], colWidths=[3*inch, 4*inch])
        status_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), status_colors.get(v_status, colors.HexColor('#f3f4f6'))),
            ('PADDING', (0,0), (-1,-1), 10),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ]))
        story.append(status_table)
        story.append(Spacer(1, 0.15*inch))

        if analysis.get('lender_narrative'):
            story.append(Paragraph("Lender Narrative", h2_style))
            story.append(Paragraph(analysis['lender_narrative'], body_style))

        if analysis.get('underwriter_notes'):
            story.append(Paragraph("Underwriter Notes", h2_style))
            story.append(Paragraph(f"<i>{analysis['underwriter_notes']}</i>", ParagraphStyle('Notes', parent=body_style, textColor=colors.HexColor('#4b5563'))))

        if analysis.get('verified_financials'):
            story.append(Paragraph("Verified Financials", h2_style))
            vf = analysis['verified_financials']
            rows = [[k.replace('_',' ').title(), fmt_usd(v) if isinstance(v, (int,float)) else str(v or 'N/A')] for k,v in vf.items() if v is not None]
            if rows:
                vf_table = Table(rows, colWidths=[3*inch, 3*inch])
                vf_table.setStyle(TableStyle([
                    ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
                    ('FONTSIZE', (0,0), (-1,-1), 9),
                    ('PADDING', (0,0), (-1,-1), 5),
                    ('ROWBACKGROUNDS', (0,0), (-1,-1), [colors.HexColor('#f9fafb'), colors.white]),
                    ('GRID', (0,0), (-1,-1), 0.3, colors.HexColor('#e5e7eb')),
                ]))
                story.append(vf_table)
                story.append(Spacer(1, 0.1*inch))

        if analysis.get('discrepancies'):
            story.append(Paragraph(f"Discrepancies ({len(analysis['discrepancies'])})", h2_style))
            for d in analysis['discrepancies']:
                sev = d.get('severity', 'minor')
                sev_color = colors.HexColor('#fee2e2') if sev == 'material' else colors.HexColor('#fef9c3') if sev == 'moderate' else colors.HexColor('#eff6ff')
                disc_data = [[
                    Paragraph(f"<b>{d.get('field','').replace('_',' ').title()}</b> — {sev.upper()}", ParagraphStyle('DiscHead', fontSize=9, fontName='Helvetica-Bold')),
                    Paragraph(f"Stated: {fmt_usd(d.get('stated_value'))}  |  Docs: {fmt_usd(d.get('extracted_value'))}  |  {abs(d.get('variance_pct',0)):.1f}% variance", ParagraphStyle('DiscVal', fontSize=8)),
                ]]
                if d.get('explanation'):
                    disc_data.append([Paragraph('', styles['Normal']), Paragraph(d['explanation'], ParagraphStyle('DiscExp', fontSize=8, textColor=colors.HexColor('#4b5563')))])
                dt = Table(disc_data, colWidths=[2.5*inch, 4.5*inch])
                dt.setStyle(TableStyle([
                    ('BACKGROUND', (0,0), (-1,-1), sev_color),
                    ('PADDING', (0,0), (-1,-1), 6),
                    ('TOPPADDING', (0,0), (-1,0), 8),
                ]))
                story.append(dt)
                story.append(Spacer(1, 0.05*inch))

        if analysis.get('missing_information'):
            story.append(Paragraph("Missing Information", h2_style))
            for item in analysis['missing_information']:
                story.append(Paragraph(f"• {item}", body_style))

        if analysis.get('recommended_next_steps'):
            story.append(Paragraph("Recommended Next Steps", h2_style))
            for i, step in enumerate(analysis['recommended_next_steps'], 1):
                story.append(Paragraph(f"{i}. {step}", body_style))

    # ── Disclaimer ──
    story.append(Spacer(1, 0.3*inch))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#e5e7eb')))
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph(
        "DISCLAIMER: This report is produced by UnderwriteOS and is for informational purposes only. "
        "It does not constitute lending, guarantee, insurance, or investment advice. "
        "All analysis is based on information provided by the borrower and extracted from uploaded documents. "
        "Lenders should conduct their own independent due diligence.",
        small_style
    ))

    doc.build(story)
    buffer.seek(0)

    safe_name = deal.name.replace(" ", "_").replace("—", "-")[:40]
    filename = f"Heradyne_Diligence_{safe_name}.pdf"

    audit_service.log(db=db, action="diligence_pdf_downloaded", entity_type="deal",
                      entity_id=deal_id, user_id=current_user.id)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


# ── Lender NDA Token ─────────────────────────────────────────────────────────

import hashlib
import secrets

class NdaAcceptRequest(BaseModel):
    token: str
    lender_name: str
    lender_email: str
    company: str


def _get_share_token(deal_id: int) -> str:
    """Generate a deterministic share token for a deal."""
    secret = os.environ.get("SECRET_KEY", "heradyne-secret")
    return hashlib.sha256(f"{secret}:deal:{deal_id}:share".encode()).hexdigest()[:24]


@router.get("/lender/review/{token}")
def get_lender_review(token: str, db: Session = Depends(get_db)):
    """
    Public lender review page. Returns the AI summary for any valid share token.
    Actual documents require NDA acceptance.
    """
    # Find deal by token
    deals = db.query(Deal).all()
    target_deal = None
    for deal in deals:
        if _get_share_token(deal.id) == token:
            target_deal = deal
            break

    if not target_deal:
        raise HTTPException(status_code=404, detail="Invalid or expired share link")

    report = db.query(DealRiskReport).filter(
        DealRiskReport.deal_id == target_deal.id
    ).order_by(DealRiskReport.version.desc()).first()

    diligence = (report.report_data or {}).get("diligence_analysis", {}) if report else {}
    analysis = diligence.get("synthesis", {})

    return {
        "deal_id": target_deal.id,
        "deal_name": target_deal.name,
        "industry": target_deal.industry,
        "asking_price": target_deal.purchase_price,
        "loan_amount": target_deal.loan_amount_requested,
        "annual_revenue": target_deal.annual_revenue,
        "ebitda": target_deal.ebitda,
        # AI summary — visible without NDA
        "ai_summary": {
            "lender_narrative": analysis.get("lender_narrative", ""),
            "verification_status": analysis.get("verification_status", "not_analyzed"),
            "confidence_score": analysis.get("confidence_score"),
            "sba_readiness_score": analysis.get("sba_readiness_score"),
            "verified_financials": analysis.get("verified_financials", {}),
        } if analysis else None,
        # Scores from UW engines
        "uw_summary": {
            "health_score": report.health_score,
            "deal_verdict": report.deal_killer_verdict,
            "dscr_base": report.dscr_base,
            "equity_value_mid": report.equity_value_mid,
            "sba_eligible": report.sba_eligible,
        } if report else None,
        "nda_required": True,
        "share_token": token,
    }


@router.post("/lender/review/{token}/accept-nda")
def accept_nda(token: str, request: NdaAcceptRequest, db: Session = Depends(get_db)):
    """
    Lender accepts NDA. Returns a signed access token for full document access.
    In production this would create a lender account and log the NDA acceptance.
    """
    # Validate token
    deals = db.query(Deal).all()
    target_deal = None
    for deal in deals:
        if _get_share_token(deal.id) == token:
            target_deal = deal
            break

    if not target_deal:
        raise HTTPException(status_code=404, detail="Invalid share link")

    # Generate a time-limited access token for this lender
    access_token = secrets.token_urlsafe(32)

    # Log NDA acceptance
    audit_service.log(
        db=db, action="lender_nda_accepted", entity_type="deal",
        entity_id=target_deal.id, user_id=None,
        details={
            "lender_name": request.lender_name,
            "lender_email": request.lender_email,
            "company": request.company,
            "access_token": access_token[:8] + "...",
        }
    )

    return {
        "status": "accepted",
        "access_token": access_token,
        "deal_id": target_deal.id,
        "message": "NDA accepted. You now have access to the full diligence package.",
    }


@router.get("/deals/{deal_id}/diligence/share-link")
def get_share_link(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get the shareable lender review link for a deal."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    if current_user.role == UserRole.BORROWER and deal.borrower_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    token = _get_share_token(deal_id)
    return {"share_token": token, "deal_id": deal_id}
