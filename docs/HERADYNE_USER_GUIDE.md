# Heradyne User Guide

## Overview

Heradyne is a deal structuring platform that connects borrowers seeking business loans with lenders and insurers. The platform automates underwriting analysis and policy matching to streamline the lending process.

**Important:** Heradyne is an informational platform only. It does not lend money, provide guarantees, or issue insurance. All outputs are recommendations for informational purposes.

---

## User Roles

### Borrower
Business owners or operators seeking financing for acquisitions or growth.

### Lender (Full Access)
Banks, credit unions, or alternative lenders with full lending authority. Can verify documents, make decisions, and originate loans.

### Loan Officer
Lender staff responsible for deal sourcing and verification. Can:
- View matched deals
- Download and verify documents
- Request additional information from borrowers
- Flag deals for Credit Committee review

**Cannot:** Accept/reject deals or originate loans.

### Credit Committee
Senior lender staff with decision authority. Can:
- Review verified deals
- Accept or reject loan applications
- Originate loans
- Manage policies
- Access financial dashboards

### Insurer/Fund
Insurance companies or credit funds that provide loan guarantees or credit enhancement.

### Admin
Platform administrators who manage system configuration and monitor activity.

---

## Borrower Guide

### Creating a Deal

1. **Login** to your borrower account
2. Click **"Create New Deal"** on the dashboard
3. Complete the multi-step wizard:

**Step 1: Basic Information**
- Deal name
- Deal type (Acquisition or Growth)
- Industry
- Business description

**Step 2: Financial Details**
- Loan amount requested
- Loan term (months)
- Annual revenue
- Gross profit
- EBITDA
- Capital expenditures
- Existing debt service
- Addbacks (with descriptions)

**Step 3: Deal-Specific Information**
- For Acquisitions: Purchase price, equity injection
- For Growth: Use of funds details

**Step 4: Collateral**
- Business assets (A/R, equipment, inventory, real estate)
- Personal assets (cash, brokerage, real estate, retirement)
- Owner credit score
- Or use pre-qualified assets (see below)

**Step 5: Review**
- Verify all information
- Save as draft or submit for analysis

### Pre-Qualifying Your Collateral

Before creating deals, you can pre-register and value your assets:

1. Go to **"Collateral"** in the sidebar
2. Click **"Add Asset"**
3. Select asset type (Personal or Business) and category
4. Enter asset details:

**For Real Estate:**
- Address, property type, square feet, year built
- Stated value (your estimate)

**For Vehicles:**
- Make, model, year, mileage
- Condition (excellent/good/fair/poor)

**For Equipment/Inventory:**
- Description, age, condition
- Stated value

5. Add lien information if applicable (amount, lien holder)
6. Click **"Add & Value Asset"**

**The Collateral Pricing Engine will:**
- Estimate market value based on asset details
- Calculate forced sale value (liquidation value)
- Apply category-specific haircuts
- Determine collateral value (what you can borrow against)

**Asset Categories and Haircuts:**

| Category | Haircut | You Get |
|----------|---------|---------|
| Real Estate | 20% | 80% of value |
| Vehicle | 30% | 70% of value |
| Investment Account | 15% | 85% of value |
| Retirement Account | 40% | 60% of value |
| Cash/Savings | 5% | 95% of value |
| Equipment | 35% | 65% of value |
| Inventory | 40% | 60% of value |

**Applying Assets to Deals:**
- Pre-qualified assets automatically populate when creating new deals
- Assets can be revalued at any time
- Confidence score indicates valuation reliability

### Understanding Your Default Protection

Once your loan is funded with a guarantee, you have tiered protection:

1. Go to **"Default Protection"** in the sidebar
2. View your protection status for each loan

**Tier 1: Business Protection**
- Your business assets pledged as collateral
- First line of defense against default
- Coverage shown with asset breakdown

**Tier 2: Personal Protection (Optional)**
- Enroll by clicking **"Enroll Now"**
- Choose monthly fee ($50 minimum)
- Each $1 paid provides $2 of protection
- Protects personal assets from seizure

**Tier 3: Personal Assets at Risk**
- Last resort if Tier 1 and Tier 2 exhausted
- Shows your personal assets that could be seized
- Goal: Keep this at 0% used!

**Health Score (0-100):**
- 80-100: Healthy - good coverage ratio
- 60-79: Warning - monitor closely
- 40-59: At Risk - Tier 1 may be triggered
- 0-39: Critical - personal assets at risk

**Preview Mode:**
Before your loan is funded, you can preview your protection based on deal assets. This helps you understand your exposure before committing.

### Uploading Documents

1. Go to your deal's detail page
2. Click **"Upload Document"** in the Documents section
3. Select a file (PDF, Word, Excel, CSV, or image)
4. Document type is auto-detected based on filename:
   - Files with "tax", "1120", or "1065" → Tax Return
   - Files with "financial" or "statement" → Financial Statement
   - Files with "bank" → Bank Statement
   - Files with "p&l", "profit", or "loss" → Profit & Loss

**Supported formats:** PDF, DOC, DOCX, XLS, XLSX, CSV, TXT, PNG, JPG, JPEG (max 50MB)

### Submitting for Analysis

1. Ensure all required fields are completed
2. Upload supporting documents (recommended)
3. Click **"Submit for Analysis"**
4. The platform will run automated underwriting analysis
5. Status will change: DRAFT → SUBMITTED → ANALYZING → ANALYZED

### Understanding Your Risk Report

Once analyzed, your deal will have a Risk Report showing:

| Metric | Description |
|--------|-------------|
| DSCR (Base) | Debt Service Coverage Ratio under normal conditions |
| DSCR (Stress) | DSCR under stressed conditions (20% revenue decline) |
| Annual PD | Probability of Default (lower is better) |
| EV (Mid) | Estimated enterprise value |
| Collateral Coverage | Total collateral value / loan amount |
| Durability Score | Business stability score (0-100) |

**Structuring Recommendations:**
- Recommended Guarantee %
- Recommended Escrow %
- Alignment requirements (personal guarantee, key person insurance, etc.)

### Running Matching

After analysis:
1. Click **"Run Matching"** on your deal
2. The platform matches your deal against active lender/insurer policies
3. You'll see match results with scores and any failed constraints

### Responding to Information Requests

When a lender or insurer requests additional information:

1. **Dashboard Alert**: You'll see a prominent amber banner on your dashboard
2. **Deals List**: Affected deals show a badge with request count
3. **Deal Detail**: Full details of what information is needed

**To respond:**
1. Click on the deal with the info request
2. Read the specific request from the lender/insurer
3. Upload the requested documents
4. The reviewer will be notified to continue their review

### Responding to Counter-Offers

Some lenders/insurers use automated decision rules. If your deal doesn't fully match their policy but is close, you may receive a **counter-offer** with proposed modifications:

1. **Notification**: Counter-offers appear on your deal detail page with a purple highlight
2. **Review Details**: See exactly what changes are proposed (e.g., reduced loan amount)
3. **Expected Outcome**: The counter-offer shows the expected new match score if accepted

**Counter-Offer Options:**

| Action | Result |
|--------|--------|
| **Accept** | Deal is automatically updated with proposed values; match is accepted |
| **Decline** | Counter-offer is rejected; you can optionally provide a reason |
| **No Action** | Counter-offers expire after 7 days |

**Example Counter-Offer:**
- Original loan: $3,000,000
- Proposed loan: $2,500,000
- Reason: "Reduce loan to meet max loan size requirement"
- Expected match score: 95%

### Signing Documents

Lenders and insurers may send you documents requiring your signature:

1. Go to **"Signatures"** in the sidebar
2. View pending documents with:
   - Document title and type
   - Uploader name and role
   - Deal name
   - Due date (if set)

**To sign a document:**
1. Click **"Download"** to review the document
2. Click **"Review & Sign"**
3. Optionally add signature notes
4. Click **"Sign Document"** to confirm

**To decline signing:**
1. Click **"Review & Sign"**
2. Click **"Decline to Sign"**
3. Enter a reason (required)
4. The lender/insurer will be notified

**Document Types You May Receive:**
- Loan Agreement
- Guarantee Contract
- Term Sheet
- Promissory Note
- Security Agreement
- Personal Guarantee

---

## Loan Officer Guide

Loan Officers are responsible for verifying deal information before it goes to the Credit Committee for approval.

### Verification Dashboard

Access the verification dashboard via **"Verification"** in the sidebar.

**Dashboard Overview:**
- Total deals matched to your organization's policies
- Pending Review count
- Verified count
- Flagged/Info Requested count

**Filter Options:**
- **All Deals**: View everything
- **Pending Review**: Deals awaiting your verification
- **Verified**: Deals you've marked as ready for Credit Committee
- **Flagged**: Deals with issues or info requests

### Verifying a Deal

1. Click on a deal to expand the verification panel
2. Review the two-column comparison:

**Left Column - Borrower Reported Values:**
| Field | What to Check |
|-------|---------------|
| Annual Revenue | Compare to tax returns, financial statements |
| Gross Profit | Verify margin calculations |
| EBITDA | Confirm addbacks are legitimate |
| Addbacks | Review each addback for reasonableness |
| Debt Service | Check against bank statements |
| Owner Credit Score | Verify with credit report |
| Business Assets | Confirm existence and values |
| Personal Assets | Verify collateral pledged |

**Right Column - Calculated Risk Metrics:**
| Metric | What It Means |
|--------|---------------|
| DSCR (Base) | Cash flow coverage at normal conditions (target: >1.25x) |
| DSCR (Stressed) | Cash flow coverage with 20% revenue decline (target: >1.0x) |
| Probability of Default | Annual default likelihood (lower is better, target: <5%) |
| Enterprise Value | Estimated business value based on EBITDA multiples |
| Collateral Coverage | Total collateral / loan amount (target: >80%) |
| Leverage | Debt / EBITDA ratio (target: <4.0x) |
| Durability Score | Business stability rating 0-100 |

3. Review uploaded documents by downloading each one
4. Check the Policy Match Details section for constraint issues

### Verification Actions

**Mark as Verified:**
1. After reviewing all information, click **"Mark as Verified"**
2. Optionally add verification notes
3. The deal moves to "Verified" status and is ready for Credit Committee

**Request Information:**
1. Click **"Request Information"**
2. Enter a detailed description of what you need:
   ```
   Please provide the following:
   - Last 3 months of bank statements
   - Accounts receivable aging report
   - Updated financial projections
   ```
3. Click **"Send Request"**
4. The borrower receives a notification and the deal shows "Info Requested"

**Flag a Discrepancy:**
1. Click **"Flag Discrepancy"**
2. Fill in the flag details:
   - **Field Name**: Which value has an issue (e.g., "Annual Revenue")
   - **Reported Value**: What the borrower stated
   - **Severity**: Low / Medium / High / Critical
   - **Notes**: Describe the issue
3. Click **"Add Flag"**
4. The deal shows "Flagged" status

### Severity Guidelines

| Severity | When to Use |
|----------|-------------|
| **Low** | Minor rounding differences (<5%) |
| **Medium** | Needs clarification but not blocking |
| **High** | Significant discrepancy affecting risk assessment |
| **Critical** | Major red flag, potential fraud concern |

### Best Practices

1. **Download all documents** before making verification decisions
2. **Cross-reference** borrower inputs with supporting documents
3. **Document everything** - use notes liberally
4. **Flag early** - it's easier to resolve issues before Committee review
5. **Use info requests** for missing documents rather than rejecting

---

## Credit Committee Guide

Credit Committee members review verified deals and make final approval decisions.

### Reviewing Verified Deals

1. Go to **"Matched Deals"** in the sidebar
2. Filter by status to see pending deals
3. Look for the **"Verified"** badge - these have been checked by Loan Officers
4. Review the Loan Officer's verification notes

### Making Decisions

For each verified deal, you can:

1. **Accept**: Approve the deal for origination
2. **Reject**: Decline the deal (provide a reason)
3. **Request More Info**: Send back to Loan Officer or Borrower

### Originating Loans

After accepting a deal:
1. Go to **"Origination"** in the sidebar
2. Find the accepted deal in the list
3. Configure loan terms (principal, rate, term)
4. Click **"Originate Loan"**

See the Loan Origination section for full details.

---

## Lender/Insurer Guide

### Creating Policies

1. Go to **"My Policies"** in the sidebar
2. Click **"New Policy"**
3. Configure your lending/coverage criteria:

**For Lenders:**
- Min/Max loan size
- Min DSCR requirement
- Max PD allowed
- Max leverage (Debt/EBITDA)
- Min collateral coverage
- Allowed/excluded industries
- Term limits
- Target rate range

**For Insurers:**
- Max expected loss (PD × LGD)
- Coverage amount limits
- Attachment point range
- Target premium range
- Allowed industries

4. Click **"Save Policy"**
5. Toggle **"Active"** to include in matching

### Configuring Auto-Decisions (Optional)

Automate your decision process by enabling auto-decisions in your policy:

1. Check **"Enable Auto-Decisions"** in the policy form
2. Configure thresholds:

| Threshold | Description | Example |
|-----------|-------------|---------|
| Auto-Reject ≤ | Automatically reject deals with score at or below | 30% |
| Counter-Offer Min ≥ | Start sending counter-offers at this score | 50% |
| Counter-Offer Max < | Send counter-offers up to (but not including) this score | 90% |
| Auto-Accept ≥ | Automatically accept deals with score at or above | 90% |

**Score Range Behavior:**
```
0%        30%         50%         90%        100%
|----------|-----------|-----------|----------|
  Auto-     Manual      Counter-    Auto-
  Reject    Review      Offer       Accept
```

**Counter-Offer Generation:**
When a deal falls in the counter-offer range, the system automatically:
- Analyzes which constraints failed
- Calculates what deal modifications would meet your policy
- Sends the borrower a counter-offer with specific proposed changes
- Gives them 7 days to accept or decline

### Financial Dashboard

Access your portfolio analytics via **"Financials"** in the sidebar.

**Lender Dashboard shows:**
- **Portfolio Summary**: Total principal outstanding, loans originated, average loan size
- **Monthly Income**: Principal payments, interest income, total payments
- **Performance Metrics**: Default rate, past due loans (30/60/90 days)
- **Risk Analysis**: Insured vs uninsured exposure, average guarantee percentage
- **Concentration Analysis**: Geographic and industry breakdowns with visual charts
- **Executed Loans Table**: All loans with details and filtering

**Insurer Dashboard shows:**
- **Exposure Summary**: Total insured principal, current exposure
- **Premium Income**: Total received, monthly income, average rate
- **Risk Metrics**: Loss ratio, expected loss, claims pending/paid
- **Lender Concentration**: Exposure by lender partner
- **Concentration Analysis**: Geographic and industry breakdowns
- **Policies Table**: All insured loans with details

**Viewing Individual Loans:**
1. Click the **eye icon** on any loan row
2. View complete loan details including:
   - Loan terms (principal, rate, term, monthly payment)
   - Parties involved (borrower, lender, insurer)
   - Payment history (principal paid, interest paid, payments made)
   - Insurance details (guarantee %, premium rate, premium paid)
   - Default information (if applicable)

### Reviewing Matched Deals

1. Go to **"Matched Deals"** in the sidebar
2. Filter by status: All, Pending, Accepted, Rejected
3. Each match shows:
   - Deal summary (loan amount, revenue, EBITDA)
   - Match score
   - Met/Failed constraints
   - **Verification status**
   - **Auto-decision badge** (if auto-decided)

4. Click **"View Full Details"** to expand and see:
   - Complete borrower information
   - Financial metrics and loan request details
   - EBITDA addbacks and asset tables
   - Underwriting analysis results
   - **Uploaded documents with download buttons**

### Downloading Documents

As a lender or insurer, you can download any document attached to a matched deal:

1. Expand the deal details on the Matched Deals page
2. Scroll to the **"Uploaded Documents"** section
3. Click the **download icon (⬇)** next to any document
4. The file downloads with its original filename

Alternatively:
1. Click **"Open Full Deal Page"** to view the full deal
2. Find the **Documents** section in the right sidebar
3. Click the download icon next to any document

**Note:** Document downloads are logged for audit purposes.

### Understanding Verification Flags

The platform compares uploaded documents against borrower-reported values:

| Badge | Meaning |
|-------|---------|
| 🛡️ Verified (green) | All values match documents within 5% |
| ⚠️ X Flags (yellow) | Some values differ by 5-30% |
| 🚨 X Flags (red) | Critical discrepancies (>30%) |

**Discrepancy details show:**
- Field name (e.g., "Annual Revenue")
- Reported value vs. Extracted value
- Percentage difference
- Severity level
- Source document

### Making Decisions

For each pending match, you can:

1. **Accept** - Indicates interest in the deal
2. **Reject** - Pass on the deal (with optional reason)
3. **Request Info** - Ask borrower for additional information

**Requesting Information:**
1. Click **"Request Info"**
2. Enter a clear description of what you need
3. The borrower will be notified immediately
4. Match status changes to "Info Requested"
5. Monitor for document uploads and re-review

### Uploading Documents for Signature

After accepting a deal, you may need the borrower to sign documents:

1. Go to **"Signatures"** in the sidebar
2. Click **"Upload Document"**
3. Select the deal from accepted matches
4. Fill in document details:
   - **Title**: e.g., "Loan Agreement - ABC Corp"
   - **Document Type**: Loan Agreement, Guarantee Contract, Term Sheet, etc.
   - **Description**: Brief explanation for borrower
   - **Due Date**: Optional deadline
5. Upload the document (PDF, DOC, or DOCX)
6. Click **"Upload"**

**Tracking Document Status:**
Your uploaded documents appear in a table showing:
- Document title and type
- Associated deal
- Borrower status: Pending, Signed, or Rejected
- Upload date and due date

**Document Statuses:**

| Status | Meaning |
|--------|---------|
| **Pending** (yellow) | Awaiting borrower action |
| **Signed** (green) | Borrower has signed |
| **Rejected** (red) | Borrower declined with reason |
| **Withdrawn** (gray) | You withdrew the document |

**Actions:**
- **Download**: Review the document
- **Withdraw**: Remove a pending document (before signing)

### Secondary Market

Access the secondary market via **"Secondary Market"** in the sidebar to buy or sell loan participations and risk positions.

> **Role-Based Access:** The secondary market shows only relevant listings for your role:
> - **Lenders** see loan participations and whole loan listings
> - **Insurers/Funds** see risk transfer listings
> - **Admins** see all listing types

**For Lenders - Selling Loan Participations:**
1. Click **"Create Listing"**
2. Select the loan you want to sell (portion of)
3. Set the participation percentage (e.g., 25% of the loan)
4. Set your asking price and implied yield
5. Submit the listing

**For Lenders - Buying Loan Participations:**
1. Browse active listings in the **"Browse Listings"** tab
2. Filter by "Loan Participations" or "Whole Loans"
3. Review loan details (interest rate, remaining term, yield)
4. Click **"Make Offer"** and submit your price
5. Wait for seller response

**For Insurers - Selling Risk Transfers:**
1. Click **"Create Listing"**
2. Select the loan with risk you want to transfer
3. Set the risk percentage and premium share
4. Set your asking price
5. Submit the listing

**For Insurers - Buying Risk Transfers:**
1. Browse risk transfer listings in the **"Browse Listings"** tab
2. Review risk details (coverage percentage, premium share)
3. Click **"Make Offer"** and submit your price
4. Wait for seller response

**Managing Offers:**
- **My Listings** tab: View your listings and respond to offers
- **My Offers** tab: Track offers you've made
- Accept/Reject offers with optional messages
- Withdraw pending offers if needed

**After a Sale:**
- Ownership records are automatically updated
- Buyer receives participation/risk record
- Seller's position is adjusted accordingly
- All transactions are logged for audit

### Loan Origination (Lenders)

After accepting a deal match, lenders can originate loans:

1. Go to **"Origination"** in the sidebar
2. View deals ready for origination in the **"Pending Originations"** tab
3. Click **"Originate Loan"** on a deal
4. Configure loan terms:
   - **Principal Amount**: The funded amount
   - **Interest Rate**: Annual rate (e.g., 8%)
   - **Term**: Loan duration in months
5. Review the calculated monthly payment
6. Click **"Originate Loan"** to fund the deal

**After Origination:**
- Loan appears in "Originated Loans" tab
- Loan shows in Financial Dashboard
- Deal status changes to "Funded"
- Can be listed on Secondary Market

**Dual Acceptance Mode:**
If the admin has enabled "Require Dual Acceptance":
- Each deal card shows whether an insurer has accepted ("Insurer Accepted" badge) or not ("No Insurer" badge)
- Deals without insurer acceptance will show "Awaiting Insurer/Fund Acceptance" instead of the originate button
- You must wait for an insurer/fund to accept the deal before you can originate the loan

> **Note:** Location fields (state, city, zip code) are not currently captured in the deal creation process, so loans are created without geographic data. This can be added in a future update to the deal creation wizard.

### Guarantee Contracts (Insurers/Funds)

After accepting a deal match, insurers can issue guarantee contracts:

1. Go to **"Guarantees"** in the sidebar
2. View deals ready for guarantee in the **"Pending Guarantees"** tab
3. Click **"Issue Guarantee"** on a deal
4. Configure guarantee terms:
   - **Guarantee Percentage**: Portion of loan covered (e.g., 50%)
   - **Premium Rate**: Annual premium rate (e.g., 2%)
5. Click **"Issue Guarantee"** to activate coverage

**Timing:**
- Guarantees can be issued before or after loan funding
- If issued before, commitment is recorded and applied when loan is funded
- If issued after, existing loan is updated with guarantee details

### Document Signatures

The Signatures feature allows lenders and insurers to upload documents that require borrower signature.

**For Lenders & Insurers - Uploading Documents:**

1. Go to **"Signatures"** in the sidebar
2. Click **"Upload Document"**
3. Select the deal (must be an accepted deal)
4. Fill in document details:
   - **Title**: Name of the document
   - **Document Type**: Loan Agreement, Term Sheet, etc.
   - **Description**: Brief explanation
   - **Due Date**: Optional deadline
5. Upload the PDF or Word file
6. Click **"Upload Document"**

**Tracking Uploaded Documents:**
- View all uploaded documents in the table
- See status: Pending, Signed, Rejected, or Withdrawn
- Download documents at any time
- Withdraw pending documents if needed

**For Borrowers - Signing Documents:**

1. Go to **"Signatures"** in the sidebar
2. View all pending documents from lenders and insurers
3. For each document:
   - Click **"Download"** to review the document
   - Click **"Review & Sign"** to proceed
4. In the signing modal:
   - Add optional notes
   - Click **"Sign Document"** to sign
   - Or click **"Decline to Sign"** to reject

**Rejecting Documents:**
- If you decline to sign, you must provide a reason
- The lender/insurer will see your rejection reason
- They can then upload a revised document if needed

**Document Types:**
- Loan Agreement
- Guarantee Contract
- Term Sheet
- Promissory Note
- Security Agreement
- Personal Guarantee
- Other

---

## Admin Guide

### Managing System Assumptions

1. Go to **"Assumptions"** in the sidebar
2. Categories include:
   - **pd_engine**: PD calculation parameters
   - **valuation_engine**: Industry multiples
   - **collateral_engine**: Asset haircuts
   - **structuring_engine**: Guarantee/escrow bands
   - **cashflow_engine**: Stress test parameters
   - **fees**: Fee calculation settings

3. Click on a category to expand
4. Edit the JSON value for any assumption
5. Click **"Save"** to apply changes

**Caution:** Changes to system defaults affect all users immediately.

### Origination Settings (Dual Acceptance)

Admins can control loan origination requirements:

1. Go to **"Assumptions"** in the sidebar
2. Click the **"Origination Settings"** tab
3. Configure the following options:

| Setting | Description |
|---------|-------------|
| **Require Dual Acceptance** | When enabled, both a lender AND an insurer/fund must accept the deal before the lender can originate the loan. This ensures every loan has guarantee coverage. |
| **Require Insurer for Origination** | When enabled, an insurer must accept before origination (but lender can accept first). Superseded by Dual Acceptance if both are enabled. |

4. Click **"Save Origination Settings"** to apply

**When Dual Acceptance is Enabled:**
- Lenders see "Insurer Accepted" or "No Insurer" badges on each pending deal
- Deals without insurer acceptance show "Awaiting Insurer/Fund Acceptance"
- The "Originate Loan" button is hidden until an insurer accepts
- This enforces platform-wide guarantee requirements

**Use Case:**
Enable Dual Acceptance when you want to ensure every originated loan has insurance/guarantee coverage before funding.

### User-Specific Assumption Overrides

Admins can create custom assumptions for specific lenders or insurers:

1. Click **"User Overrides"** button on the Assumptions page
2. Select a lender or insurer from the list
3. You'll see their "effective" assumptions (system defaults + any overrides)
4. Edit any assumption to create a user-specific override
5. Overrides are highlighted with a blue border

**Override Actions:**

| Action | Description |
|--------|-------------|
| **Copy All Defaults** | Creates user overrides for all system assumptions (starting point for customization) |
| **Clear Overrides** | Removes all user overrides, reverting to system defaults |
| **Edit** | Creates or updates an override for that specific assumption |

**How Overrides Work:**
- System defaults apply to all users by default
- User overrides take precedence for that specific user
- When a deal is analyzed/matched, the system uses the lender's/insurer's effective assumptions
- Deleting an override reverts that assumption to the system default

**Use Case Example:**
A lender wants more conservative industry risk multipliers:
1. Admin selects the lender in User Overrides
2. Clicks "Copy All Defaults" to start with current values
3. Edits `industry_multipliers` to increase risk factors
4. Saves - that lender's matches now use custom multipliers

### Viewing Audit Logs

1. Go to **"Audit Logs"** in the sidebar
2. Filter by:
   - Entity type (user, deal, policy, match, assumption)
   - Action (created, submitted, accepted, etc.)
3. Click **"View"** on any log to see full details

Logged actions include:
- User registrations and logins
- Deal creation, submission, analysis
- Policy changes
- Match decisions
- Assumption updates

---

## Test Accounts

The following test accounts are created when the database is seeded. All use password: `password123`

### Borrower
| Email | Description |
|-------|-------------|
| borrower@example.com | Sample borrower with test deals |

### Lender Organization (First Capital Partners)
| Email | Role | Description |
|-------|------|-------------|
| lender1@example.com | Lender | Full access - organization owner |
| loanofficer@example.com | Loan Officer | Verification only |
| creditcommittee@example.com | Credit Committee | Decisions and origination |

### Standalone Lender
| Email | Role | Description |
|-------|------|-------------|
| lender2@example.com | Lender | Full access - Growth Lending Group |

### Insurer/Fund
| Email | Description |
|-------|-------------|
| insurer@example.com | Credit Shield Insurance |

### Admin
| Email | Description |
|-------|-------------|
| admin@example.com | Platform administrator |

**Role Permissions Summary:**

| Permission | Loan Officer | Credit Committee | Full Lender |
|------------|:------------:|:----------------:|:-----------:|
| View matched deals | ✓ | ✓ | ✓ |
| Download documents | ✓ | ✓ | ✓ |
| Request info from borrower | ✓ | ✓ | ✓ |
| Flag discrepancies | ✓ | ✓ | ✓ |
| Mark as verified | ✓ | ✓ | ✓ |
| Accept/Reject deals | ✗ | ✓ | ✓ |
| Originate loans | ✗ | ✓ | ✓ |
| Manage policies | ✗ | ✓ | ✓ |
| Access financials | ✗ | ✓ | ✓ |

---

## Workflow Summary

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  BORROWER   │     │   PLATFORM  │     │LENDER/INSURER│
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │ Create Deal       │                   │
       │──────────────────>│                   │
       │                   │                   │
       │ Upload Documents  │                   │
       │──────────────────>│                   │
       │                   │                   │
       │ Submit for        │                   │
       │ Analysis          │                   │
       │──────────────────>│                   │
       │                   │                   │
       │                   │ Run Underwriting  │
       │                   │ Engines           │
       │                   │                   │
       │                   │ Document          │
       │                   │ Verification      │
       │                   │                   │
       │                   │ Policy Matching   │
       │                   │                   │
       │                   │ Notify Match      │
       │                   │──────────────────>│
       │                   │                   │
       │                   │      Review &     │
       │                   │      Decide       │
       │                   │<──────────────────│
       │                   │                   │
       │    [If Info       │                   │
       │    Requested]     │                   │
       │<──────────────────│                   │
       │                   │                   │
       │ Upload More Docs  │                   │
       │──────────────────>│                   │
       │                   │──────────────────>│
       │                   │                   │
       │                   │   Final Decision  │
       │<──────────────────│<──────────────────│
       │                   │                   │
```

---

## FAQ

### For Borrowers

**Q: How long does analysis take?**
A: Typically 1-2 minutes. Complex deals may take longer.

**Q: Can I edit a submitted deal?**
A: No. Create a new deal or contact support.

**Q: Why was my deal rejected by all lenders?**
A: Review the failed constraints for each match. Common issues:
- DSCR too low
- Loan amount outside policy range
- Industry not accepted
- PD too high

### For Lenders/Insurers

**Q: How are match scores calculated?**
A: Match score = constraints met / total constraints. 100% = full match.

**Q: What does "Near Miss" mean?**
A: Deals with 50-99% match score. Restructuring scenarios may be available.

**Q: Can I see documents before accepting?**
A: Yes, you can view and download all uploaded documents for any matched deal. Documents are accessible from:
- The expanded deal view on the Matched Deals page (click the download icon)
- The full Deal Detail page (click "Open Full Deal Page" then download from sidebar)

**Q: How do I download documents?**
A: Click the download icon (⬇) next to any document in the documents list. The file will download to your computer with its original filename.

### For All Users

**Q: Is my data secure?**
A: Yes. All data is encrypted, passwords are hashed, and access is role-based.

**Q: Who can see my deals/policies?**
A: Only you can see your drafts. Submitted deals are visible to matched lenders/insurers.

**Q: How do I get help?**
A: Contact support@heradyne.com or use the feedback button.

---

## Troubleshooting

### "Failed to load data" Error on Origination Page

This usually means the database needs to be recreated with the latest schema:

```bash
docker-compose down -v
docker-compose up --build
```

### CORS Errors in Browser Console

CORS errors typically indicate the backend server crashed. Check the backend logs:

```bash
docker-compose logs backend --tail=100
```

### Secondary Market Not Working

The secondary market requires additional database tables. If you upgraded from an earlier version:

```bash
docker-compose down -v
docker-compose up --build
```

### No Deals Showing in Origination

Only **accepted** matches appear in the Origination page. Make sure:
1. A deal has been submitted and analyzed
2. A lender/insurer policy exists that matches the deal
3. The match has been **accepted** (not just pending)

---

## Technical Requirements

- Modern web browser (Chrome, Firefox, Safari, Edge)
- JavaScript enabled
- Cookies enabled (for authentication)
- Stable internet connection

**Recommended:**
- Desktop or tablet for best experience
- PDF viewer for document review
