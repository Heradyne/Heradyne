# Heradyne Development Roadmap

## Overview

This document outlines recommended next steps for taking the Heradyne MVP to production-ready status.

---

## MVP Completed Features ✅

The following features have been implemented in the current MVP:

### Core Platform
- ✅ User authentication (JWT)
- ✅ Role-based access control (Borrower, Lender, Insurer, Admin)
- ✅ Deal creation with multi-step wizard
- ✅ Document upload with type detection
- ✅ Five underwriting engines (Cash Flow, PD, Valuation, Collateral, Structuring)
- ✅ Policy management for lenders/insurers
- ✅ Automated policy matching with scoring
- ✅ Restructuring scenario generation

### Frontend Pages
- ✅ Dashboard with role-specific stats
- ✅ Deals list with filtering and search
- ✅ Deal detail page with risk report visualization
- ✅ New deal wizard (5 steps)
- ✅ Policy management page (create/edit/delete)
- ✅ Matched deals page for lenders/insurers
- ✅ System assumptions editor (admin)
- ✅ Audit log viewer (admin)

### Document Verification
- ✅ Verification service comparing documents to reported values
- ✅ Discrepancy flagging with severity levels
- ✅ Verification badges on matched deals
- ✅ API endpoints for verification status

### Information Request System
- ✅ Lenders/insurers can request additional information
- ✅ Borrowers see notifications on dashboard
- ✅ Info request badges on deals list
- ✅ Detailed request messages on deal detail page
- ✅ Document upload workflow for responses

### Auto-Decision & Counter-Offer System
- ✅ Configurable auto-accept threshold per policy
- ✅ Configurable auto-reject threshold per policy
- ✅ Counter-offer range configuration
- ✅ Automatic counter-offer generation based on failed constraints
- ✅ Counter-offer calculations for loan size, term, DSCR, leverage
- ✅ Borrower counter-offer response UI (accept/decline)
- ✅ Automatic deal update when counter-offer accepted
- ✅ Counter-offer expiration (7 days)
- ✅ Auto-decision badges and tracking

### User-Specific Assumption Overrides
- ✅ User-scoped assumptions (per-lender/insurer customization)
- ✅ System defaults with user override inheritance
- ✅ Admin UI for managing user overrides
- ✅ Copy defaults to user (bulk override creation)
- ✅ Clear all user overrides (revert to defaults)
- ✅ Visual indication of overridden vs default values
- ✅ Effective assumptions API (merged view)

### Financial Dashboard
- ✅ Lender dashboard with portfolio analytics
- ✅ Interest rate, principal outstanding, monthly payments
- ✅ Geographic and industry concentration analysis
- ✅ Default tracking and past-due metrics
- ✅ Insurer dashboard with policy analytics
- ✅ Premium received, loss ratio, expected loss
- ✅ Lender concentration for insurers
- ✅ Admin dashboard with platform-wide metrics
- ✅ Drill-down by lender or insurer
- ✅ Executed loans tracking with full detail view
- ✅ Loan payment history tracking
- ✅ Insurance claims management

### Document Downloads for Lenders/Insurers
- ✅ Download endpoint with role-based access control
- ✅ Lenders can download documents from matched deals
- ✅ Insurers can download documents from matched deals
- ✅ Download button in Matched Deals page
- ✅ Download button in Deal Detail page sidebar
- ✅ CORS support for cross-origin downloads
- ✅ Audit logging for all document downloads

### Secondary Market
- ✅ Loan participation listings (lenders sell portions of loans)
- ✅ Whole loan sales
- ✅ Risk transfer listings (insurers sell/transfer risk positions)
- ✅ Offer submission and management
- ✅ Accept/reject offers with automatic ownership transfer
- ✅ Participation records tracking fractional ownership
- ✅ Risk transfer records tracking insurance positions
- ✅ Market statistics dashboard
- ✅ Browse, filter, and search listings
- ✅ My Listings and My Offers tabs
- ✅ Role-based filtering: Lenders see loan listings, Insurers see risk listings
- ✅ Role-based access control on offers (lenders buy loans, insurers buy risk)

### Document Signatures
- ✅ Lenders and insurers can upload documents requiring borrower signature
- ✅ Document types: Loan Agreement, Guarantee Contract, Term Sheet, etc.
- ✅ Borrowers see pending documents in Signatures page
- ✅ Download, review, and sign documents
- ✅ Option to reject/decline with reason
- ✅ Lenders/insurers can track document status
- ✅ Withdraw pending documents
- ✅ Audit logging for all signature actions

### Tiered Default Protection System
- ✅ Three-tier protection model for borrowers with guaranteed loans
- ✅ **Tier 1: Business Protection** - Business assets pledged as collateral
- ✅ **Tier 2: Personal Protection** - Optional monthly fee for additional coverage
  - Borrower can enroll after loan funding
  - Each $1 paid provides $2 of protection (2x multiplier)
  - Minimum $50/month fee
- ✅ **Tier 3: Personal Assets at Risk** - Last resort if other tiers exhausted
- ✅ Protection preview before loan funding (based on deal assets)
- ✅ Health score calculation (0-100) based on coverage ratio
- ✅ Tier progression during default scenarios
- ✅ Event history tracking for all protection changes
- ✅ Visual tier cards showing coverage, used, remaining amounts
- ✅ Asset details displayed within each tier

### Pre-Qualified Collateral System
- ✅ Borrowers can pre-register assets before creating deals
- ✅ **Collateral Pricing Engine** with category-specific valuation:
  - Real estate: Price per square foot by property type
  - Vehicles: Depreciation by age + mileage adjustment
  - Equipment: Depreciated replacement cost
  - Financial accounts: Face value with type-specific haircuts
  - Inventory, receivables, and other asset types
- ✅ **Asset Categories with Haircuts**:
  - Personal: Real Estate (20%), Vehicle (30%), Investment (15%), Retirement (40%), Cash (5%), Jewelry (50%), Collectibles (60%)
  - Business: Equipment (35%), Inventory (40%), A/R (25%), Real Property (20%), IP (70%), Fleet (30%), F&F (50%)
- ✅ Lien tracking with net equity calculation
- ✅ Valuation confidence scores and method notes
- ✅ Revalue assets on demand
- ✅ Apply pre-qualified assets to deals automatically
- ✅ Summary dashboard with total collateral value
- ✅ Personal vs Business asset tabs

### Split Lender Roles
- ✅ **Loan Officer** role for deal sourcing and verification:
  - Can view matched deals for their organization
  - Can download and verify borrower documents
  - Can request additional information from borrowers
  - Cannot accept/reject deals or originate loans
  - Escalates to Credit Committee for decisions
- ✅ **Credit Committee** role for decisions and origination:
  - Can accept or reject loan applications
  - Can originate loans from accepted matches
  - Can manage lender policies
  - Full access to financial dashboards
- ✅ Organization linking (loan officers belong to lender organizations)
- ✅ Role-based permission checks throughout API
- ✅ Separate navigation menus per role
- ✅ Backwards compatible with existing "lender" role (full access)

### Loan Officer Verification System
- ✅ **Verification Dashboard** for loan officers:
  - View all matched deals for their organization
  - See borrower-reported values alongside calculated risk metrics
  - Compare inputs to analysis outputs side-by-side
  - Filter by: All, Pending Review, Verified, Flagged
- ✅ **Risk Analysis Display**:
  - DSCR (Base & Stressed) with color-coded indicators
  - Probability of Default with risk thresholds
  - Enterprise Value, Collateral Coverage, Leverage
  - Durability Score
  - Structuring Recommendations (Guarantee %, Escrow %)
- ✅ **Verification Actions**:
  - Mark as Verified (ready for Credit Committee)
  - Request Additional Information from borrower
  - Flag Discrepancy with severity levels (Low/Medium/High/Critical)
  - View and download all borrower documents
- ✅ **Flag Management**:
  - Create flags on specific fields
  - Track reported vs expected values
  - Add notes and severity
  - Resolve or dismiss flags
- ✅ **Verification Status Tracking**:
  - Pending Review, In Review, Verified, Flagged, Info Requested
  - Checklist: Financials, Documents, Collateral, References
  - Ready for Committee indicator
- ✅ **Audit Trail**:
  - All verification actions logged
  - Verified by name and timestamp visible to Credit Committee

### Loan Origination & Guarantee Contracts
- ✅ Lenders can originate loans from accepted matches
- ✅ Configure principal, interest rate, and term
- ✅ Automatic monthly payment calculation
- ✅ Insurers can issue guarantee contracts
- ✅ Configure guarantee percentage and premium rate
- ✅ Guarantees can be issued before or after loan funding
- ✅ Deal status updated to "funded" on origination
- ✅ Origination page with pending/completed tabs
- ✅ Summary statistics for portfolio
- ✅ **Dual Acceptance Mode** (Admin configurable):
  - Admin can require both lender AND insurer acceptance before origination
  - Origination page shows insurer acceptance status on each deal
  - Deals without insurer acceptance show "Awaiting Insurer/Fund Acceptance"
  - Settings managed via Admin > Assumptions > Origination Settings
- ⚠️ Participation/risk records disabled pending database migration (see note below)
- ⚠️ Location fields (state/city/zip) not captured on deals - loans created without location data

> **Note:** The secondary market tables (`secondary_listings`, `secondary_offers`, `participation_records`, `risk_transfer_records`) must be created by running a fresh database migration. To enable full functionality:
> ```bash
> docker-compose down -v
> docker-compose up --build
> ```
> This will recreate the database with all tables including secondary market support.

### Synchronous Analysis Fallback
- ✅ Analysis runs synchronously when Celery unavailable
- ✅ Matching runs synchronously for immediate results

---

## Phase 1: Production Hardening (Weeks 1-4)

### Security

- [ ] **Authentication hardening**
  - Implement refresh tokens
  - Add token revocation (Redis blacklist)
  - Implement account lockout after failed attempts
  - Add password complexity requirements
  - Add MFA support (TOTP)

- [ ] **API security**
  - Add rate limiting (100 req/min per user)
  - Implement request signing
  - Add API versioning headers
  - HTTPS everywhere

- [ ] **File upload security**
  - Integrate virus scanning (ClamAV)
  - Verify file magic bytes
  - Process uploads in sandbox
  - Migrate to S3 storage

### Infrastructure

- [ ] **Database**
  - Set up PostgreSQL on RDS
  - Configure read replicas
  - Enable encryption at rest
  - Set up automated backups
  - Connection pooling (PgBouncer)

- [ ] **Caching**
  - Redis for session storage
  - Cache system assumptions
  - Cache user permissions

- [ ] **Monitoring**
  - Application metrics (Prometheus)
  - Log aggregation (CloudWatch/ELK)
  - Error tracking (Sentry)
  - Uptime monitoring
  - Alerting rules

### Testing

- [ ] **Test coverage**
  - Unit tests for all engines (>80% coverage)
  - Integration tests for API endpoints
  - End-to-end tests for critical flows
  - Load testing

---

## Phase 2: Feature Completion (Weeks 5-8)

### UI Enhancements

- [x] ~~Deal detail page~~ ✅ Completed
- [x] ~~Lender/Insurer dashboards~~ ✅ Completed
- [x] ~~Admin panel (assumptions, audit)~~ ✅ Completed
- [ ] Interactive charts (DSCR, valuation range)
- [ ] Document viewer
- [ ] Bulk actions for matches
- [ ] Export capabilities

### Notifications

- [ ] **Email notifications**
  - Deal submitted confirmation
  - Analysis complete
  - New match available
  - Decision made
  - Information requested notification
  - Digest emails

- [x] ~~In-app notifications~~ ✅ Completed (info request alerts)
- [ ] Real-time updates (WebSocket)
- [ ] Notification preferences

### Reporting

- [ ] **Deal reports**
  - PDF export of risk report
  - Executive summary generation
  - Comparison reports

- [ ] **Portfolio analytics**
  - Deal pipeline dashboard
  - Match success rates
  - Industry breakdown
  - Time-to-decision metrics

---

## Phase 3: Advanced Features (Weeks 9-12)

### Document Processing

- [x] ~~Document verification framework~~ ✅ Completed
- [ ] **OCR integration** (production enhancement)
  - AWS Textract or Google Document AI
  - Tax return parsing (Form 1120, 1065, Schedule C)
  - Bank statement parsing (Plaid integration)
  - Auto-populate deal fields from documents

- [ ] **Document analysis**
  - Identify missing documents
  - Cross-reference multiple documents
  - Extract key metrics automatically

### Enhanced Matching

- [ ] **Weighted constraints**
  - Allow lenders to prioritize constraints
  - Soft vs hard constraints
  - Custom scoring models

- [ ] **Multi-lender deals**
  - Syndication support
  - Lead lender designation
  - Pro-rata calculations

- [ ] **Scenario optimization**
  - ML-based scenario generation
  - Multi-constraint scenarios
  - Optimal restructuring suggestions

### Communication

- [x] ~~Information request workflow~~ ✅ Completed
- [ ] **Messaging system**
  - In-platform messaging
  - Deal-specific threads
  - File attachments
  - Message templates

- [ ] **Deal room**
  - Shared workspace
  - Q&A functionality
  - Negotiation support

---

## Phase 4: ML Integration (Weeks 13-20)

### PD Model Enhancement

- [ ] **Training data collection**
  - Historical default data
  - Feature engineering
  - Data validation

- [ ] **Model development**
  - Gradient boosting model
  - Feature importance analysis
  - Backtesting

- [ ] **Deployment**
  - Model serving infrastructure
  - A/B testing framework
  - Monitoring and drift detection

### Valuation Model

- [ ] **Comparable transactions**
  - Transaction database
  - Similarity matching
  - Multiple adjustment

- [ ] **ML valuation**
  - Feature extraction
  - Ensemble model
  - Confidence intervals

### Document Intelligence

- [ ] **NLP pipeline**
  - Entity extraction
  - Relationship mapping
  - Anomaly detection

---

## Phase 5: Scale & Integration (Weeks 21-26)

### External Integrations

- [ ] **Credit bureaus**
  - Experian/Equifax/TransUnion
  - Business credit reports
  - Automated pulls

- [ ] **Accounting software**
  - QuickBooks integration
  - Xero integration
  - Auto-sync financials

- [ ] **Banking**
  - Plaid integration
  - Bank statement analysis
  - Cash flow verification

### API Platform

- [ ] **Partner API**
  - API key management
  - Usage tracking
  - Rate limiting
  - Webhook support

- [ ] **White-label**
  - Customizable branding
  - Subdomain support
  - Custom domains

### Performance

- [ ] **Optimization**
  - Database query optimization
  - Caching strategy
  - CDN for static assets
  - Async processing expansion

- [ ] **Scalability**
  - Horizontal scaling
  - Database sharding strategy
  - Multi-region deployment

---

## Technical Debt

### Code Quality

- [ ] Comprehensive type hints
- [ ] Docstrings for all public methods
- [ ] Code linting (flake8, black)
- [ ] Pre-commit hooks

### Architecture

- [ ] Event-driven architecture
- [ ] Domain-driven design refinement
- [ ] Service extraction (if needed)
- [ ] API gateway

### Documentation

- [ ] API documentation improvements
- [ ] Developer onboarding guide
- [ ] Runbook for operations
- [ ] Architecture decision records (ADRs)

---

## Compliance & Legal

### Data Protection

- [ ] Privacy policy
- [ ] Terms of service
- [ ] Data processing agreements
- [ ] GDPR/CCPA compliance
- [ ] Data retention policies

### Financial Regulations

- [ ] Legal review of disclaimers
- [ ] Regulatory compliance assessment
- [ ] State licensing requirements
- [ ] BSA/AML considerations

### Security Certifications

- [ ] SOC 2 Type II
- [ ] Penetration testing
- [ ] Security audit
- [ ] Bug bounty program

---

## Team Recommendations

### Roles Needed

| Role | Responsibility | When |
|------|----------------|------|
| DevOps Engineer | Infrastructure, CI/CD | Phase 1 |
| QA Engineer | Testing, automation | Phase 1 |
| Product Designer | UX improvements | Phase 2 |
| Data Scientist | ML models | Phase 4 |
| Security Engineer | Hardening, compliance | Phase 1-2 |

### Development Practices

- Two-week sprints
- Code review required
- Feature flags for rollout
- Staging environment testing
- Blue-green deployments

---

## Success Metrics

### Technical

| Metric | Target |
|--------|--------|
| API response time (p95) | < 200ms |
| Uptime | 99.9% |
| Test coverage | > 80% |
| Deployment frequency | Daily |

### Business

| Metric | Target |
|--------|--------|
| Deal submission to analysis | < 5 minutes |
| Match generation time | < 30 seconds |
| User activation rate | > 60% |
| Deal completion rate | > 40% |

---

## Timeline Summary

| Phase | Weeks | Focus |
|-------|-------|-------|
| 1 | 1-4 | Production hardening |
| 2 | 5-8 | Feature completion |
| 3 | 9-12 | Advanced features |
| 4 | 13-20 | ML integration |
| 5 | 21-26 | Scale & integration |

**Total estimated timeline: 6 months to production-ready platform**

---

## Notes

- Prioritize based on user feedback
- Security should never be deprioritized
- Regular stakeholder demos
- Iterative releases preferred over big bangs
- Document all decisions and trade-offs
