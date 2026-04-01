// User types
export type UserRole = 'borrower' | 'lender' | 'loan_officer' | 'credit_committee' | 'insurer' | 'admin';

export interface User {
  id: number;
  email: string;
  full_name: string;
  company_name?: string;
  role: UserRole;
  is_active: boolean;
  must_change_password?: boolean;
  organization_id?: number | null;
  created_at: string;
  updated_at: string;
}

// Deal types
export type DealType = 'acquisition' | 'growth';
export type DealStatus = 
  | 'draft' 
  | 'submitted' 
  | 'analyzing' 
  | 'analyzed' 
  | 'matched' 
  | 'pending_lender' 
  | 'pending_insurer' 
  | 'approved' 
  | 'rejected' 
  | 'closed';

export interface AddbackItem {
  description: string;
  amount: number;
}

export interface AssetItem {
  type: string;
  value: number;
  description?: string;
}

export interface Deal {
  id: number;
  borrower_id: number;
  name: string;
  deal_type: DealType;
  status: DealStatus;
  industry: string;
  business_description?: string;
  company_name?: string;
  loan_amount_requested: number;
  loan_term_months: number;
  annual_revenue: number;
  gross_profit?: number;
  ebitda: number;
  ebitda_margin?: number;
  capex?: number;
  debt_service?: number;
  addbacks?: AddbackItem[];
  purchase_price?: number;
  equity_injection?: number;
  down_payment?: number;
  seller_financing?: number;
  business_assets?: AssetItem[];
  personal_assets?: AssetItem[];
  owner_credit_score?: number;
  owner_experience_years?: number;
  years_in_business?: number;
  employee_count?: number;
  revenue_growth_rate?: number;
  customer_concentration?: number;
  created_at: string;
  updated_at: string;
  // Relationships loaded with detail view
  documents?: DealDocument[];
  risk_reports?: DealRiskReport[];
}

export interface DealDocument {
  id: number;
  filename: string;
  original_filename: string;
  file_size: number;
  mime_type?: string;
  document_type?: string;
  created_at: string;
}

export interface DealRiskReport {
  id: number;
  deal_id: number;
  version: number;
  normalized_ebitda?: number;
  post_debt_fcf?: number;
  dscr_base?: number;
  dscr_stress?: number;
  sba_anchor_pd?: number;
  industry_multiplier?: number;
  leverage_multiplier?: number;
  volatility_multiplier?: number;
  annual_pd?: number;
  ev_low?: number;
  ev_mid?: number;
  ev_high?: number;
  durability_score?: number;
  business_nolv?: number;
  personal_nolv?: number;
  total_nolv?: number;
  collateral_coverage?: number;
  recommended_guarantee_pct?: number;
  recommended_escrow_pct?: number;
  recommended_alignment?: Record<string, any>;
  report_data?: Record<string, any>;
  // UnderwriteOS extended fields
  health_score?: number;
  health_score_cashflow?: number;
  health_score_stability?: number;
  health_score_growth?: number;
  health_score_liquidity?: number;
  health_score_distress?: number;
  pdscr?: number;
  owner_draw_annual?: number;
  premium_capacity_monthly?: number;
  normalized_sde?: number;
  sde_multiple_implied?: number;
  equity_value_low?: number;
  equity_value_mid?: number;
  equity_value_high?: number;
  net_debt?: number;
  valuation_method_weights?: Record<string, number>;
  sba_eligible?: boolean;
  sba_eligibility_checklist?: Array<{criterion: string; pass: boolean; note: string}>;
  sba_max_loan?: number;
  sba_ltv?: number;
  deal_killer_verdict?: string;
  deal_confidence_score?: number;
  max_supportable_price?: number;
  breakpoint_scenarios?: Array<Record<string, any>>;
  cash_runway_months?: number;
  cash_forecast_18m?: Array<Record<string, any>>;
  playbooks?: Array<Record<string, any>>;
  created_at: string;
}

// Policy types
export interface LenderPolicy {
  id: number;
  lender_id: number;
  name: string;
  is_active: boolean;
  min_loan_size?: number;
  max_loan_size?: number;
  min_dscr?: number;
  max_pd?: number;
  max_leverage?: number;
  min_collateral_coverage?: number;
  allowed_industries?: string[];
  excluded_industries?: string[];
  min_term_months?: number;
  max_term_months?: number;
  target_rate_min?: number;
  target_rate_max?: number;
  allowed_deal_types?: string[];
  // Auto-decision thresholds
  auto_accept_threshold?: number;
  auto_reject_threshold?: number;
  counter_offer_min?: number;
  counter_offer_max?: number;
  auto_decision_enabled?: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface InsurerPolicy {
  id: number;
  insurer_id: number;
  name: string;
  is_active: boolean;
  max_expected_loss?: number;
  min_attachment_point?: number;
  max_attachment_point?: number;
  target_premium_min?: number;
  target_premium_max?: number;
  min_coverage_amount?: number;
  max_coverage_amount?: number;
  allowed_industries?: string[];
  excluded_industries?: string[];
  allowed_deal_types?: string[];
  // Auto-decision thresholds
  auto_accept_threshold?: number;
  auto_reject_threshold?: number;
  counter_offer_min?: number;
  counter_offer_max?: number;
  auto_decision_enabled?: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// Match types
export interface ConstraintResult {
  constraint: string;
  required: any;
  actual: any;
  met: boolean;
  reason: string;
}

export interface MatchResult {
  policy_id: number;
  policy_name: string;
  policy_type: 'lender' | 'insurer';
  match_score: number;
  is_full_match: boolean;
  constraints_met: ConstraintResult[];
  constraints_failed: ConstraintResult[];
}

export interface ApproveIfScenario {
  scenario_id: number;
  description: string;
  adjustments: Record<string, any>;
  new_constraints_met: string[];
  constraints_still_failed: string[];
  feasibility_score: number;
}

export interface DealMatch {
  id: number;
  deal_id: number;
  lender_policy_id?: number;
  insurer_policy_id?: number;
  match_score?: number;
  match_reasons?: string[];
  constraints_met?: ConstraintResult[];
  constraints_failed?: ConstraintResult[];
  status: string;
  decision_notes?: string;
  decision_at?: string;
  // Auto-decision fields
  auto_decision?: boolean;
  auto_decision_reason?: string;
  // Counter-offer fields
  counter_offer?: {
    original_values: Record<string, any>;
    proposed_values: Record<string, any>;
    adjustments: Array<{
      field: string;
      original: any;
      proposed: any;
      change: any;
      reason: string;
    }>;
    reason: string;
    expected_match_score: number;
    expires_in_days: number;
  };
  counter_offer_at?: string;
  counter_offer_expires_at?: string;
  borrower_response?: string;
  borrower_response_at?: string;
  borrower_response_notes?: string;
  scenarios?: ApproveIfScenario[];
  created_at: string;
}

// Assumption types
export interface SystemAssumption {
  id: number;
  user_id?: number;
  category: string;
  key: string;
  value: any;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface UserWithOverrides {
  id: number;
  email: string;
  full_name: string;
  role: string;
  override_count: number;
}

// Cashflow types
export interface MonthlyCashflow {
  id: number;
  deal_id: number;
  month: number;
  year: number;
  revenue: number;
  ebitda: number;
  debt_service?: number;
  post_debt_fcf?: number;
  created_at: string;
}

export interface FeeLedgerEntry {
  id: number;
  deal_id: number;
  month: number;
  year: number;
  post_debt_fcf: number;
  fee_rate: number;
  calculated_fee: number;
  created_at: string;
}

// API Response types
export interface Token {
  access_token: string;
  token_type: string;
}

export interface AuditLog {
  id: number;
  user_id?: number;
  action: string;
  entity_type: string;
  entity_id?: number;
  details?: Record<string, any>;
  ip_address?: string;
  created_at: string;
}

// Financial Dashboard Types
export interface ExecutedLoan {
  id: number;
  deal_id: number;
  match_id?: number;
  borrower_id: number;
  lender_id: number;
  insurer_id?: number;
  loan_number: string;
  principal_amount: number;
  interest_rate: number;
  term_months: number;
  monthly_payment: number;
  origination_date: string;
  maturity_date: string;
  status: string;
  current_principal_balance: number;
  guarantee_percentage?: number;
  premium_rate?: number;
  premium_paid: number;
  state?: string;
  city?: string;
  zip_code?: string;
  industry: string;
  days_past_due: number;
  last_payment_date?: string;
  total_payments_made: number;
  total_principal_paid: number;
  total_interest_paid: number;
  default_date?: string;
  default_amount?: number;
  recovery_amount?: number;
  loss_amount?: number;
  notes?: string;
  borrower_name?: string;
  lender_name?: string;
  insurer_name?: string;
  deal_name?: string;
  created_at: string;
  updated_at: string;
}

export interface GeographicConcentration {
  state: string;
  loan_count: number;
  total_principal: number;
  percentage: number;
}

export interface IndustryConcentration {
  industry: string;
  loan_count: number;
  total_principal: number;
  percentage: number;
}

export interface LenderDashboardStats {
  total_loans: number;
  total_principal_outstanding: number;
  total_principal_originated: number;
  average_interest_rate: number;
  weighted_average_interest_rate: number;
  average_loan_size: number;
  average_term_months: number;
  monthly_principal_payments: number;
  monthly_interest_income: number;
  monthly_total_payments: number;
  active_loans: number;
  paid_off_loans: number;
  defaulted_loans: number;
  default_rate: number;
  total_past_due: number;
  loans_past_due_30: number;
  loans_past_due_60: number;
  loans_past_due_90: number;
  geographic_concentration: GeographicConcentration[];
  industry_concentration: IndustryConcentration[];
  insured_principal: number;
  uninsured_principal: number;
  average_guarantee_percentage: number;
}

export interface InsurerDashboardStats {
  total_policies: number;
  total_insured_principal: number;
  total_premium_received: number;
  average_premium_rate: number;
  average_guarantee_percentage: number;
  monthly_premium_income: number;
  total_exposure: number;
  current_claims: number;
  total_claims_paid: number;
  loss_ratio: number;
  active_policies: number;
  policies_in_default: number;
  expected_loss: number;
  geographic_concentration: GeographicConcentration[];
  industry_concentration: IndustryConcentration[];
  lender_concentration: Array<{
    lender_id: number;
    lender_name: string;
    count: number;
    exposure: number;
  }>;
}

export interface AdminDashboardStats {
  total_loans: number;
  total_principal_outstanding: number;
  total_principal_originated: number;
  total_lenders: number;
  active_lenders: number;
  average_portfolio_size: number;
  total_insurers: number;
  active_insurers: number;
  total_insured_amount: number;
  total_premium_collected: number;
  platform_default_rate: number;
  total_defaults: number;
  total_losses: number;
  total_recoveries: number;
  lender_stats: Array<{
    lender_id: number;
    lender_name: string;
    loan_count: number;
    total_principal: number;
    outstanding_principal: number;
    default_count: number;
  }>;
  insurer_stats: Array<{
    insurer_id: number;
    insurer_name: string;
    policy_count: number;
    total_exposure: number;
    premium_collected: number;
    default_count: number;
  }>;
  geographic_concentration: GeographicConcentration[];
  industry_concentration: IndustryConcentration[];
}

export interface LoanPayment {
  id: number;
  loan_id: number;
  payment_date: string;
  payment_number: number;
  scheduled_payment: number;
  actual_payment: number;
  principal_portion: number;
  interest_portion: number;
  principal_balance_after: number;
  is_late: boolean;
  days_late: number;
  created_at: string;
}

// Secondary Market Types
export interface SecondaryListing {
  id: number;
  seller_id: number;
  listing_type: 'loan_participation' | 'whole_loan' | 'risk_transfer';
  loan_id?: number;
  title: string;
  description?: string;
  participation_percentage?: number;
  principal_amount?: number;
  risk_percentage?: number;
  premium_share?: number;
  asking_price: number;
  implied_yield?: number;
  remaining_term_months?: number;
  status: 'active' | 'pending' | 'sold' | 'cancelled' | 'expired';
  listed_date: string;
  expiry_date?: string;
  sold_date?: string;
  buyer_id?: number;
  final_price?: number;
  created_at: string;
  seller_name?: string;
  buyer_name?: string;
  loan_number?: string;
  loan_industry?: string;
  loan_state?: string;
  original_principal?: number;
  current_balance?: number;
  interest_rate?: number;
  offer_count: number;
}

export interface SecondaryOffer {
  id: number;
  listing_id: number;
  buyer_id: number;
  offer_price: number;
  message?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'expired';
  offer_date: string;
  expiry_date?: string;
  response_date?: string;
  seller_message?: string;
  created_at: string;
  buyer_name?: string;
  listing_title?: string;
}

export interface ParticipationRecord {
  id: number;
  loan_id: number;
  owner_id: number;
  ownership_percentage: number;
  principal_owned: number;
  purchase_price: number;
  purchase_date: string;
  is_original_lender: boolean;
  is_active: boolean;
  owner_name?: string;
  loan_number?: string;
}

export interface RiskTransferRecord {
  id: number;
  loan_id: number;
  insurer_id: number;
  risk_percentage: number;
  premium_share: number;
  transfer_price: number;
  transfer_date: string;
  is_original_insurer: boolean;
  is_active: boolean;
  insurer_name?: string;
  loan_number?: string;
}

export interface SecondaryMarketStats {
  total_loan_listings: number;
  active_loan_listings: number;
  total_loan_volume: number;
  avg_loan_asking_price: number;
  avg_loan_yield: number;
  total_risk_listings: number;
  active_risk_listings: number;
  total_risk_volume: number;
  avg_risk_asking_price: number;
  listings_last_30_days: number;
  sales_last_30_days: number;
  total_sales_volume_30_days: number;
}
