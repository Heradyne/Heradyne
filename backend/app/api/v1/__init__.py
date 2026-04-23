from fastapi import APIRouter

from app.api.v1.endpoints import underwriting, predeal, portfolio_reserve, sba_diligence, support_indication, qsbs_eval, deal_chat, admin_reseed, diligence, ai_features, servicing, compliance, employee_kpi
from app.api.v1.endpoints import auth, users, deals, policies, matching, cashflow, assumptions, audit, financial, secondary_market, origination, signature_documents, default_protection, collateral, verification, reinsurance, ai_agent, sba_compliance, actuarial

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(deals.router, prefix="/deals", tags=["Deals"])
api_router.include_router(policies.router, prefix="/policies", tags=["Policies"])
api_router.include_router(matching.router, prefix="/matching", tags=["Matching"])
api_router.include_router(cashflow.router, prefix="/cashflow", tags=["Cash Flow & Fees"])
api_router.include_router(assumptions.router, prefix="/assumptions", tags=["System Assumptions"])
api_router.include_router(audit.router, prefix="/audit", tags=["Audit Logs"])
api_router.include_router(financial.router, prefix="/financial", tags=["Financial Dashboard"])
api_router.include_router(secondary_market.router, prefix="/secondary-market", tags=["Secondary Market"])
api_router.include_router(origination.router, prefix="/origination", tags=["Loan Origination"])
api_router.include_router(signature_documents.router, prefix="/signature-documents", tags=["Signature Documents"])
api_router.include_router(default_protection.router, prefix="/protection", tags=["Default Protection"])
api_router.include_router(collateral.router, prefix="/collateral", tags=["Collateral"])
api_router.include_router(verification.router, prefix="/verification", tags=["Deal Verification"])
api_router.include_router(reinsurance.router, prefix="/reinsurance", tags=["Reinsurance"])
api_router.include_router(ai_agent.router, prefix="/ai-agent", tags=["AI Agent"])
api_router.include_router(sba_compliance.router, prefix="/sba-compliance", tags=["SBA Compliance"])
api_router.include_router(actuarial.router, prefix="/actuarial", tags=["Actuarial Pricing"])

api_router.include_router(underwriting.router, prefix="/underwriting", tags=["UnderwriteOS — Underwriting"])
api_router.include_router(predeal.router, prefix="/predeal", tags=["UnderwriteOS — Pre-Deal Funnel"])
api_router.include_router(portfolio_reserve.router, prefix="/portfolio-reserve", tags=["UnderwriteOS — Portfolio Reserve"])
api_router.include_router(sba_diligence.router, prefix="/sba-diligence", tags=["UnderwriteOS — SBA Diligence"])
api_router.include_router(support_indication.router, prefix="/support-indication", tags=["UnderwriteOS — Investment & PG Indication"])
api_router.include_router(qsbs_eval.router, prefix="/qsbs", tags=["UnderwriteOS — QSBS Evaluator"])

api_router.include_router(deal_chat.router, prefix="/chat", tags=["UnderwriteOS — AI Deal Chat"])

api_router.include_router(ai_features.router, prefix="/ai-features", tags=["AI Features"])
api_router.include_router(servicing.router, prefix="/servicing", tags=["Servicing"])
api_router.include_router(compliance.router, prefix="/compliance", tags=["Compliance"])
api_router.include_router(employee_kpi.router, prefix="/employee-kpi", tags=["Employee KPI"])

api_router.include_router(admin_reseed.router, prefix="/admin", tags=["Admin"])
api_router.include_router(diligence.router, prefix="", tags=["Section 2 — Full Diligence"])
