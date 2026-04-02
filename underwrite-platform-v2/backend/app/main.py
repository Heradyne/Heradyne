from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.api.v1 import api_router

# Create FastAPI app
app = FastAPI(
    title="UnderwriteOS + Heradyne Platform API",
    description="""
## UnderwriteOS + Heradyne — Combined SMB Acquisition Platform

**DISCLAIMER**: Heradyne is an informational platform only. It does NOT lend money, 
provide guarantees, or issue insurance policies. All outputs are recommendations 
for informational purposes.

### Features

- **Deal Management**: Create, submit, and track loan deals
- **Underwriting Engines**: Cash flow, PD, valuation, and collateral analysis
- **Policy Matching**: Match deals to lender and insurer policies
- **Approve-If Scenarios**: Generate restructuring scenarios for near-misses
- **Fee Simulation**: Calculate and export monthly fee ledgers

### Roles

- **Borrower**: Create and manage deals
- **Lender**: Define policies, view matches, accept/reject deals
- **Insurer**: Define policies, view matches, accept/reject deals
- **Admin**: System administration, assumptions management
    """,
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS middleware — allow all origins (restrict after go-live)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Type", "Content-Length"],
)

# Include API router
app.include_router(api_router, prefix="/api/v1")


@app.get("/")
def root():
    """Root endpoint with API info."""
    return {
        "name": "UnderwriteOS + Heradyne Platform API",
        "version": "2.0.0",
        "docs": "/docs",
        "disclaimer": (
            "Heradyne is an informational platform only. It does NOT lend money, "
            "provide guarantees, or issue insurance policies."
        )
    }


@app.get("/health")
def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}
