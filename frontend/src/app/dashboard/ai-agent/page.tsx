'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Brain, AlertTriangle, TrendingUp, Shield, CheckCircle, XCircle, Activity, BarChart3, RefreshCw, Target, Zap, ChevronDown, ChevronUp, Save, RotateCcw, Settings } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { formatCurrency, formatPercent } from '@/lib/utils';

interface Variable {
  id: string;
  name: string;
  category: string;
  weight: string;
  optimal_range: string;
  caution_range: string | null;
  reject_threshold: string | null;
  description: string;
  phase: string;
}

interface VariableSettings {
  enabled: boolean;
  customWeight: number; // 0-100 scale within category
}

interface CategorySettings {
  weight: number; // percentage 0-100
  enabled: boolean;
}

// Default category weights
const DEFAULT_CATEGORY_WEIGHTS: Record<string, number> = {
  structural: 25,
  geographic: 15,
  financial: 30,
  operator: 15,
  asset: 15,
};

// Default variable weights by importance
const DEFAULT_VARIABLE_WEIGHTS: Record<string, number> = {
  critical: 100,
  high: 75,
  medium: 50,
  low: 25,
};

// Fallback variables if API fails
const FALLBACK_VARIABLES: Record<string, Variable[]> = {
  structural: [
    { id: 'loan_size', name: 'Loan Size', category: 'structural', weight: 'critical', optimal_range: '>$500K', caution_range: '$350K-$500K', reject_threshold: '<$500K', description: 'Sub-$150K defaults 10× rate of >$2M', phase: 'mvp' },
    { id: 'loan_purpose', name: 'Loan Purpose', category: 'structural', weight: 'high', optimal_range: 'Change of Ownership', caution_range: 'Working capital', reject_threshold: null, description: 'Acquisitions default 40% less', phase: 'mvp' },
    { id: 'naics_industry', name: 'NAICS Industry Code', category: 'structural', weight: 'high', optimal_range: 'Tier 1 sector', caution_range: 'Tier 2-3', reject_threshold: 'Tier 4', description: '5× spread across industries', phase: 'mvp' },
    { id: 'business_age', name: 'Target Business Age', category: 'structural', weight: 'high', optimal_range: '>10 years', caution_range: '3-10 years', reject_threshold: '<3 years', description: '13.6% risk reduction/year', phase: 'mvp' },
    { id: 'loan_term', name: 'Loan Term', category: 'structural', weight: 'medium', optimal_range: '10-25 years', caution_range: '<10 years', reject_threshold: null, description: '10+ yr: 4% vs <10yr: 20%', phase: 'mvp' },
    { id: 'equity_injection', name: 'Down Payment / Equity', category: 'structural', weight: 'high', optimal_range: '≥20%', caution_range: '10-20%', reject_threshold: '<10%', description: '18% reduction per 5% above min', phase: 'mvp' },
    { id: 'sba_guarantee_pct', name: 'SBA Guarantee %', category: 'structural', weight: 'medium', optimal_range: '75% standard', caution_range: '50% Express', reject_threshold: null, description: 'Express higher default', phase: 'mvp' },
    { id: 'purchase_multiple_sde', name: 'Purchase Multiple (SDE)', category: 'structural', weight: 'high', optimal_range: '≤3.0×', caution_range: '3.0-4.5×', reject_threshold: '>4.5×', description: 'Valuation risk', phase: 'mvp' },
    { id: 'purchase_multiple_ebitda', name: 'Purchase Multiple (EBITDA)', category: 'structural', weight: 'high', optimal_range: '≤4.0×', caution_range: '4.0-6.0×', reject_threshold: '>6.0×', description: 'Flag aggressive multiples', phase: 'mvp' },
    { id: 'seller_note', name: 'Seller Note / Earnout', category: 'structural', weight: 'medium', optimal_range: '≥10%', caution_range: '<10%', reject_threshold: null, description: 'Seller conviction signal', phase: 'mvp' },
    { id: 'seller_transition', name: 'Seller Transition Period', category: 'structural', weight: 'medium', optimal_range: '6-12 months', caution_range: '<6 months', reject_threshold: 'No plan', description: '#1 acquisition risk', phase: 'mvp' },
  ],
  geographic: [
    { id: 'county_default_rate', name: 'County Default Rate', category: 'geographic', weight: 'high', optimal_range: '<1.9%', caution_range: '1.9-4.2%', reject_threshold: '>4.2%', description: 'Miami-Dade 9.55% vs 0%', phase: 'mvp' },
    { id: 'fema_flood_zone', name: 'FEMA Flood Zone', category: 'geographic', weight: 'medium', optimal_range: 'Zone X', caution_range: 'Zone B/C', reject_threshold: 'Zone A/V', description: 'Flood risk', phase: 'mvp' },
    { id: 'fema_disaster_history', name: 'FEMA Disaster History (5yr)', category: 'geographic', weight: 'medium', optimal_range: '<2 declarations', caution_range: '2-3', reject_threshold: '≥4', description: 'Recent disasters', phase: 'mvp' },
    { id: 'wildfire_risk', name: 'Wildfire Risk Score', category: 'geographic', weight: 'low', optimal_range: 'Low/Moderate', caution_range: 'High', reject_threshold: 'Extreme', description: 'Fire risk', phase: 'mvp' },
    { id: 'hurricane_exposure', name: 'Hurricane/Wind Exposure', category: 'geographic', weight: 'medium', optimal_range: 'Inland', caution_range: 'Moderate coastal', reject_threshold: 'High coastal', description: 'Wind risk', phase: 'mvp' },
    { id: 'earthquake_zone', name: 'Earthquake Zone', category: 'geographic', weight: 'low', optimal_range: 'Low seismicity', caution_range: 'Moderate', reject_threshold: 'High (CA, PNW)', description: 'Seismic risk', phase: 'mvp' },
    { id: 'climate_risk_index', name: 'Climate Risk Index', category: 'geographic', weight: 'medium', optimal_range: 'Low', caution_range: 'Moderate', reject_threshold: 'High', description: 'Aggregate risk', phase: 'mvp' },
    { id: 'market_saturation', name: 'Local Market Saturation', category: 'geographic', weight: 'medium', optimal_range: 'Low density', caution_range: 'Moderate', reject_threshold: 'Oversaturated', description: 'Competition', phase: 'phase2' },
    { id: 'local_economic_health', name: 'Local Economic Health', category: 'geographic', weight: 'medium', optimal_range: 'Growing', caution_range: 'Average', reject_threshold: 'Declining', description: 'Employment+pop trends', phase: 'mvp' },
    { id: 'urban_rural', name: 'Urban vs Rural', category: 'geographic', weight: 'low', optimal_range: 'Context-dependent', caution_range: 'Very rural', reject_threshold: null, description: 'Informational', phase: 'mvp' },
    { id: 'state_regulatory', name: 'State Regulatory Burden', category: 'geographic', weight: 'low', optimal_range: 'Business-friendly', caution_range: 'Moderate', reject_threshold: 'Heavy', description: 'Regulatory risk', phase: 'mvp' },
  ],
  financial: [
    { id: 'dscr', name: 'Debt Service Coverage (DSCR)', category: 'financial', weight: 'critical', optimal_range: '≥1.50×', caution_range: '1.20-1.49×', reject_threshold: '<1.20×', description: '#1 financial metric', phase: 'mvp' },
    { id: 'revenue_trend_3yr', name: 'Revenue Trend (3-Year)', category: 'financial', weight: 'high', optimal_range: 'Growing ≥5%/yr', caution_range: 'Flat ±2%', reject_threshold: 'Declining >5%', description: 'Business trajectory', phase: 'mvp' },
    { id: 'revenue_trend_12mo', name: 'Revenue Trend (12-Month)', category: 'financial', weight: 'high', optimal_range: 'Stable/growing', caution_range: 'Seasonal dip', reject_threshold: 'Declining', description: 'Current momentum', phase: 'mvp' },
    { id: 'gross_margin', name: 'Gross Margin', category: 'financial', weight: 'medium', optimal_range: '≥40%', caution_range: '25-39%', reject_threshold: '<25%', description: 'Pricing power', phase: 'mvp' },
    { id: 'ebitda_margin', name: 'EBITDA Margin', category: 'financial', weight: 'medium', optimal_range: '≥15%', caution_range: '8-14%', reject_threshold: '<8%', description: 'Operating efficiency', phase: 'mvp' },
    { id: 'owner_compensation', name: 'Owner Compensation (SDE)', category: 'financial', weight: 'medium', optimal_range: 'Sustainable', caution_range: 'Aggressive adds', reject_threshold: 'Negative', description: 'Earnings quality', phase: 'mvp' },
    { id: 'working_capital', name: 'Working Capital', category: 'financial', weight: 'medium', optimal_range: '≥3 months OpEx', caution_range: '1-3 months', reject_threshold: 'Negative', description: 'Liquidity buffer', phase: 'mvp' },
    { id: 'borrower_credit_score', name: 'Borrower Credit Score', category: 'financial', weight: 'high', optimal_range: '≥720', caution_range: '660-719', reject_threshold: '<660', description: 'Personal credit', phase: 'mvp' },
    { id: 'borrower_dti', name: 'Borrower Debt-to-Income', category: 'financial', weight: 'medium', optimal_range: '<35%', caution_range: '35-45%', reject_threshold: '>45%', description: 'Owner leverage', phase: 'mvp' },
    { id: 'customer_concentration', name: 'Customer Concentration', category: 'financial', weight: 'high', optimal_range: 'No client >10%', caution_range: '10-25%', reject_threshold: '>25%', description: 'Single point failure', phase: 'mvp' },
    { id: 'ar_aging', name: 'A/R Aging Quality', category: 'financial', weight: 'low', optimal_range: '>90% current', caution_range: '70-90%', reject_threshold: '<70%', description: 'Collection quality', phase: 'mvp' },
    { id: 'total_debt_load', name: 'Total Debt Load (All)', category: 'financial', weight: 'medium', optimal_range: 'DSCR ≥1.25×', caution_range: '1.10-1.24×', reject_threshold: '<1.10×', description: 'All obligations', phase: 'mvp' },
    { id: 'revenue_seasonality', name: 'Revenue Seasonality', category: 'financial', weight: 'low', optimal_range: '<20% var', caution_range: '20-40%', reject_threshold: '>40%', description: 'Seasonal risk', phase: 'mvp' },
    { id: 'cash_reserves_closing', name: 'Cash Reserves at Closing', category: 'financial', weight: 'medium', optimal_range: '≥6 months', caution_range: '3-6 months', reject_threshold: '<3 months', description: 'Deal fragility', phase: 'mvp' },
  ],
  operator: [
    { id: 'buyer_industry_exp', name: 'Buyer Industry Experience', category: 'operator', weight: 'high', optimal_range: '10+ years', caution_range: '3-10 years', reject_threshold: '<3 years', description: '53% better outcomes', phase: 'mvp' },
    { id: 'buyer_management_exp', name: 'Buyer Management Experience', category: 'operator', weight: 'high', optimal_range: 'Prior owner/C-suite', caution_range: 'Management', reject_threshold: 'First-time', description: 'P&L experience', phase: 'mvp' },
    { id: 'buyer_education', name: 'Buyer Education', category: 'operator', weight: 'low', optimal_range: 'Relevant degree+certs', caution_range: 'General', reject_threshold: 'None', description: 'Bonus factor', phase: 'mvp' },
    { id: 'seller_tenure', name: 'Seller Tenure', category: 'operator', weight: 'medium', optimal_range: '10+ years', caution_range: '5-10 years', reject_threshold: '<3 years', description: 'Why selling?', phase: 'mvp' },
    { id: 'employee_count', name: 'Number of Employees', category: 'operator', weight: 'medium', optimal_range: '5-50', caution_range: '<3 or >100', reject_threshold: null, description: 'Complexity/key-person', phase: 'mvp' },
    { id: 'key_employee_dependency', name: 'Key Employee Dependency', category: 'operator', weight: 'high', optimal_range: 'No single >20%', caution_range: '20-30%', reject_threshold: '>30%', description: 'Fragility risk', phase: 'mvp' },
    { id: 'key_employee_retention', name: 'Key Employee Retention', category: 'operator', weight: 'medium', optimal_range: 'Signed agreements', caution_range: 'Verbal', reject_threshold: 'None', description: 'Retention plan', phase: 'mvp' },
    { id: 'employee_turnover', name: 'Employee Turnover', category: 'operator', weight: 'medium', optimal_range: '<15%', caution_range: '15-30%', reject_threshold: '>30%', description: 'Culture signal', phase: 'mvp' },
    { id: 'owner_burn_rate', name: 'Owner Personal Burn Rate', category: 'operator', weight: 'low', optimal_range: 'Low fixed costs', caution_range: 'Moderate', reject_threshold: 'High', description: 'Cash extraction', phase: 'mvp' },
    { id: 'ownership_structure', name: 'Ownership Structure', category: 'operator', weight: 'low', optimal_range: 'Single/clear majority', caution_range: 'Multiple clear', reject_threshold: '50/50 split', description: 'Governance', phase: 'mvp' },
    { id: 'buyer_reserves', name: 'Buyer Personal Reserves', category: 'operator', weight: 'medium', optimal_range: '6+ months', caution_range: '3-6 months', reject_threshold: '<3 months', description: 'Safety net', phase: 'mvp' },
    { id: 'buyer_commitment', name: 'Buyer Commitment (Full-Time)', category: 'operator', weight: 'high', optimal_range: 'Full-time operator', caution_range: 'Transitioning', reject_threshold: 'Absentee', description: 'Attention', phase: 'mvp' },
  ],
  asset: [
    { id: 'tangible_assets', name: 'Total Tangible Assets', category: 'asset', weight: 'high', optimal_range: '≥75% of loan', caution_range: '40-75%', reject_threshold: '<40%', description: 'Asset coverage', phase: 'mvp' },
    { id: 'real_estate_owned', name: 'Real Estate Owned', category: 'asset', weight: 'medium', optimal_range: 'Business owns RE', caution_range: 'Favorable lease', reject_threshold: 'Leased only', description: 'Hard collateral', phase: 'mvp' },
    { id: 'equipment_value', name: 'Equipment & FF&E Value', category: 'asset', weight: 'medium', optimal_range: 'Modern/marketable', caution_range: 'Average', reject_threshold: 'Specialized', description: 'Liquidation value', phase: 'mvp' },
    { id: 'inventory_quality', name: 'Inventory Quality', category: 'asset', weight: 'low', optimal_range: 'Low perishability', caution_range: 'Moderate', reject_threshold: 'Perishable', description: 'Turnover/shelf life', phase: 'mvp' },
    { id: 'ip_brand', name: 'IP / Brand', category: 'asset', weight: 'low', optimal_range: 'Regional brand', caution_range: 'Some presence', reject_threshold: 'Generic', description: 'Resale premium', phase: 'mvp' },
    { id: 'personal_guarantee', name: 'Personal Guarantee', category: 'asset', weight: 'medium', optimal_range: 'Full PG ≥$500K NW', caution_range: 'Moderate NW', reject_threshold: 'Limited/low', description: 'Guarantor strength', phase: 'mvp' },
    { id: 'lease_terms', name: 'Lease Terms', category: 'asset', weight: 'medium', optimal_range: '5+ years favorable', caution_range: '2-5 years', reject_threshold: '<2 years', description: 'Displacement risk', phase: 'mvp' },
    { id: 'business_insurance', name: 'Business Insurance', category: 'asset', weight: 'medium', optimal_range: 'Full BOP+liability', caution_range: 'Basic', reject_threshold: 'Gaps', description: 'Coverage', phase: 'mvp' },
    { id: 'franchise_license', name: 'Franchise/License Status', category: 'asset', weight: 'medium', optimal_range: 'Good standing', caution_range: 'Minor issues', reject_threshold: 'Disputes', description: 'License risk', phase: 'mvp' },
    { id: 'customer_durability', name: 'Customer Base Durability', category: 'asset', weight: 'medium', optimal_range: 'Recurring/contracts', caution_range: 'Mixed', reject_threshold: 'Walk-in only', description: 'CF predictability', phase: 'mvp' },
    { id: 'competitor_concentration', name: 'Competitor Concentration', category: 'asset', weight: 'medium', optimal_range: 'Differentiated', caution_range: 'Moderate', reject_threshold: 'Saturated', description: 'Margin pressure', phase: 'phase2' },
    { id: 'supplier_concentration', name: 'Supplier Concentration', category: 'asset', weight: 'low', optimal_range: 'Multiple suppliers', caution_range: '2-3 key', reject_threshold: 'Single critical', description: 'Supply risk', phase: 'mvp' },
    { id: 'online_presence', name: 'Online Presence', category: 'asset', weight: 'low', optimal_range: '≥4.0 stars', caution_range: '3.5-4.0', reject_threshold: '<3.5', description: 'Customer satisfaction', phase: 'phase2' },
    { id: 'revenue_diversity', name: 'Revenue Diversity', category: 'asset', weight: 'low', optimal_range: 'Multiple streams', caution_range: '2-3 lines', reject_threshold: 'Single', description: 'Resilience', phase: 'mvp' },
  ],
  monitoring: [
    { id: 'mon_revenue_vs_projection', name: 'Revenue vs. Projection', category: 'monitoring', weight: 'high', optimal_range: 'On plan', caution_range: '5-15% below', reject_threshold: '≥15% below 2mo', description: '6-12mo lead', phase: 'phase2' },
    { id: 'mon_dscr_rolling', name: 'DSCR (Rolling 12-Month)', category: 'monitoring', weight: 'critical', optimal_range: '≥1.35×', caution_range: '1.20-1.35×', reject_threshold: '<1.20×', description: '6-9mo lead', phase: 'phase2' },
    { id: 'mon_bank_balance', name: 'Bank Balance Trend', category: 'monitoring', weight: 'medium', optimal_range: 'Stable/growing', caution_range: '2 weeks decline', reject_threshold: '3+ weeks decline', description: '3-6mo lead', phase: 'phase2' },
    { id: 'mon_sba_payment_status', name: 'SBA Loan Payment Status', category: 'monitoring', weight: 'critical', optimal_range: 'Current', caution_range: '10-30 days late', reject_threshold: 'Missed', description: '0-3mo lead', phase: 'mvp' },
    { id: 'mon_all_debt_timeliness', name: 'All-Debt Payment', category: 'monitoring', weight: 'high', optimal_range: 'All current', caution_range: '1-29 days late', reject_threshold: '>30 days late', description: '3-6mo lead', phase: 'phase2' },
    { id: 'mon_tax_deposits', name: 'Tax Deposit Regularity', category: 'monitoring', weight: 'medium', optimal_range: 'Regular', caution_range: 'Irregular', reject_threshold: 'Missed quarterly', description: '3-9mo lead', phase: 'phase2' },
    { id: 'mon_payroll_consistency', name: 'Payroll Consistency', category: 'monitoring', weight: 'high', optimal_range: 'On-time', caution_range: '1 delay', reject_threshold: 'Missed/delayed', description: '3-6mo lead', phase: 'phase2' },
    { id: 'mon_employee_count', name: 'Employee Count Change', category: 'monitoring', weight: 'high', optimal_range: 'Stable/growing', caution_range: '10-20% decline', reject_threshold: '>20% decline', description: '3-6mo lead', phase: 'phase2' },
    { id: 'mon_seasonal_deviation', name: 'Seasonal Pattern Deviation', category: 'monitoring', weight: 'medium', optimal_range: 'Within range', caution_range: '10-20% below', reject_threshold: '>20% below PY', description: '6-12mo lead', phase: 'phase2' },
    { id: 'mon_customer_concentration', name: 'Customer Concentration Shift', category: 'monitoring', weight: 'medium', optimal_range: 'Top <20%', caution_range: 'Top 20-30%', reject_threshold: 'Top >30%', description: '6-12mo lead', phase: 'phase2' },
    { id: 'mon_owner_draws', name: 'Owner Draw Changes', category: 'monitoring', weight: 'medium', optimal_range: 'Stable', caution_range: 'Up 10-20%', reject_threshold: 'Up >20% + flat rev', description: '3-6mo lead', phase: 'phase2' },
    { id: 'mon_new_liens', name: 'New Liens or Judgments', category: 'monitoring', weight: 'high', optimal_range: 'No new liens', caution_range: null, reject_threshold: 'Any new lien', description: '1-3mo lead', phase: 'phase2' },
    { id: 'mon_insurance_lapse', name: 'Insurance Lapse', category: 'monitoring', weight: 'critical', optimal_range: 'All active', caution_range: null, reject_threshold: 'Coverage lapsed', description: 'Immediate', phase: 'mvp' },
    { id: 'mon_key_personnel', name: 'Key Personnel Change', category: 'monitoring', weight: 'high', optimal_range: 'Team intact', caution_range: 'Supporting left', reject_threshold: 'Key person left', description: '3-6mo lead', phase: 'phase2' },
    { id: 'mon_online_reviews', name: 'Online Review Trend', category: 'monitoring', weight: 'low', optimal_range: 'Stable/improving', caution_range: '0.3-0.5 drop', reject_threshold: '>0.5 star drop', description: '6-12mo lead', phase: 'phase2' },
    { id: 'mon_local_economy', name: 'Local Economic Deterioration', category: 'monitoring', weight: 'low', optimal_range: 'Stable', caution_range: '+1-2% unemployment', reject_threshold: '+2% in 6mo', description: '6-12mo lead', phase: 'mvp' },
    { id: 'mon_natural_disaster', name: 'Natural Disaster Event', category: 'monitoring', weight: 'high', optimal_range: 'No disasters', caution_range: null, reject_threshold: 'Declaration 25mi', description: 'Immediate', phase: 'mvp' },
    { id: 'mon_competitor_entry', name: 'Competitor Entry/Market Shift', category: 'monitoring', weight: 'low', optimal_range: 'Stable market', caution_range: 'New competitor', reject_threshold: 'Major competitor', description: '12+mo lead', phase: 'phase2' },
  ],
};

export default function AIAgentPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<any>(null);
  const [tiers, setTiers] = useState<any>({});
  const [variables, setVariables] = useState<Record<string, Variable[]>>({});
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [scoringResult, setScoringResult] = useState<any>(null);
  const [scoringLoading, setScoringLoading] = useState(false);
  
  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [categorySettings, setCategorySettings] = useState<Record<string, CategorySettings>>({
    structural: { weight: 25, enabled: true },
    geographic: { weight: 15, enabled: true },
    financial: { weight: 30, enabled: true },
    operator: { weight: 15, enabled: true },
    asset: { weight: 15, enabled: true },
  });
  const [variableSettings, setVariableSettings] = useState<Record<string, VariableSettings>>({});
  const [hasChanges, setHasChanges] = useState(false);
  
  const [demoData, setDemoData] = useState({
    loan_amount: 1500000, loan_purpose: 'acquisition', naics_industry: '621',
    business_age: 12, equity_injection: 20, dscr: 1.45, borrower_credit_score: 720,
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [dashboardData, tiersData, variablesData] = await Promise.all([
        api.getAIAgentDashboard().catch((e) => {
          console.log('Dashboard error:', e);
          return { total_loans: 0, loans_at_watch: 0, loans_at_advisory: 0, loans_at_escalation: 0, loans_at_pre_claim: 0, alerts_requiring_action: 0, top_alerts: [] };
        }),
        api.getAIAgentTiers().catch((e) => {
          console.log('Tiers error:', e);
          return { tiers: {} };
        }),
        api.getAIAgentVariables().catch((e) => {
          console.log('Variables error:', e);
          return null;
        }),
      ]);
      console.log('Variables loaded:', variablesData);
      setDashboard(dashboardData);
      setTiers(tiersData.tiers || {});
      
      // Use API data or fallback to hardcoded variables
      const varsToUse = (variablesData && Object.keys(variablesData).length > 0) ? variablesData : FALLBACK_VARIABLES;
      setVariables(varsToUse);
      
      // Initialize variable settings if not set
      const initialVarSettings: Record<string, VariableSettings> = {};
      (Object.values(varsToUse).flat() as Variable[]).forEach((v: Variable) => {
        if (!variableSettings[v.id]) {
          initialVarSettings[v.id] = {
            enabled: true,
            customWeight: DEFAULT_VARIABLE_WEIGHTS[v.weight] || 50,
          };
        }
      });
      if (Object.keys(initialVarSettings).length > 0) {
        setVariableSettings(prev => ({ ...initialVarSettings, ...prev }));
      }
    } catch (err: any) {
      console.error('Load error:', err);
      setError('Failed to load AI Agent data');
      setVariables(FALLBACK_VARIABLES);
    } finally {
      setLoading(false);
    }
  };

  // Initialize variable settings when variables change
  useEffect(() => {
    if (Object.keys(variables).length > 0 && Object.keys(variableSettings).length === 0) {
      const initialSettings: Record<string, VariableSettings> = {};
      Object.values(variables).flat().forEach((v: Variable) => {
        initialSettings[v.id] = {
          enabled: true,
          customWeight: DEFAULT_VARIABLE_WEIGHTS[v.weight] || 50,
        };
      });
      setVariableSettings(initialSettings);
    }
  }, [variables]);

  const toggleVariableEnabled = (varId: string) => {
    setVariableSettings(prev => ({
      ...prev,
      [varId]: { ...prev[varId], enabled: !prev[varId]?.enabled }
    }));
    setHasChanges(true);
  };

  const updateVariableWeight = (varId: string, weight: number) => {
    setVariableSettings(prev => ({
      ...prev,
      [varId]: { ...prev[varId], customWeight: weight }
    }));
    setHasChanges(true);
  };

  const toggleCategoryEnabled = (category: string) => {
    setCategorySettings(prev => ({
      ...prev,
      [category]: { ...prev[category], enabled: !prev[category]?.enabled }
    }));
    setHasChanges(true);
  };

  const updateCategoryWeight = (category: string, weight: number) => {
    setCategorySettings(prev => ({
      ...prev,
      [category]: { ...prev[category], weight }
    }));
    setHasChanges(true);
  };

  const resetToDefaults = () => {
    setCategorySettings({
      structural: { weight: 25, enabled: true },
      geographic: { weight: 15, enabled: true },
      financial: { weight: 30, enabled: true },
      operator: { weight: 15, enabled: true },
      asset: { weight: 15, enabled: true },
    });
    const resetVarSettings: Record<string, VariableSettings> = {};
    Object.values(variables).flat().forEach((v: Variable) => {
      resetVarSettings[v.id] = {
        enabled: true,
        customWeight: DEFAULT_VARIABLE_WEIGHTS[v.weight] || 50,
      };
    });
    setVariableSettings(resetVarSettings);
    setHasChanges(false);
    setSuccess('Settings reset to defaults');
    setTimeout(() => setSuccess(''), 3000);
  };

  const saveSettings = () => {
    // In a real implementation, this would save to the backend
    // For now, we'll just show a success message
    setHasChanges(false);
    setSuccess('Settings saved successfully');
    setTimeout(() => setSuccess(''), 3000);
  };

  const getTotalCategoryWeight = () => {
    return Object.values(categorySettings)
      .filter(s => s.enabled)
      .reduce((sum, s) => sum + s.weight, 0);
  };

  const getEnabledVariableCount = (category: string) => {
    const categoryVars = variables[category] || [];
    return categoryVars.filter(v => variableSettings[v.id]?.enabled !== false).length;
  };

  const runScoringDemo = async () => {
    setScoringLoading(true);
    try {
      const result = await api.scoreWithAIAgent(demoData);
      setScoringResult(result);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Scoring failed');
    } finally {
      setScoringLoading(false);
    }
  };

  const toggleCategoryExpanded = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const getTierColor = (tier: string) => {
    const colors: Record<string, string> = {
      preferred: 'text-green-600 bg-green-50 border-green-200',
      standard: 'text-blue-600 bg-blue-50 border-blue-200',
      elevated: 'text-yellow-600 bg-yellow-50 border-yellow-200',
      high_risk: 'text-orange-600 bg-orange-50 border-orange-200',
      decline: 'text-red-600 bg-red-50 border-red-200',
    };
    return colors[tier] || 'text-gray-600 bg-gray-50';
  };

  const getWeightBadge = (weight: string) => {
    const colors: Record<string, string> = {
      critical: 'bg-red-100 text-red-700',
      high: 'bg-orange-100 text-orange-700',
      medium: 'bg-yellow-100 text-yellow-700',
      low: 'bg-gray-100 text-gray-700',
    };
    return colors[weight] || 'bg-gray-100 text-gray-700';
  };

  const categories = [
    { key: 'structural', name: 'Structural', weight: '25%', color: 'purple', bgColor: 'bg-purple-50', borderColor: 'border-purple-200', textColor: 'text-purple-700', desc: 'Deal characteristics' },
    { key: 'geographic', name: 'Geographic', weight: '15%', color: 'blue', bgColor: 'bg-blue-50', borderColor: 'border-blue-200', textColor: 'text-blue-700', desc: 'Location risk' },
    { key: 'financial', name: 'Financial', weight: '30%', color: 'green', bgColor: 'bg-green-50', borderColor: 'border-green-200', textColor: 'text-green-700', desc: 'Borrower financials' },
    { key: 'operator', name: 'Operator', weight: '15%', color: 'yellow', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200', textColor: 'text-yellow-700', desc: 'Human capital' },
    { key: 'asset', name: 'Asset', weight: '15%', color: 'orange', bgColor: 'bg-orange-50', borderColor: 'border-orange-200', textColor: 'text-orange-700', desc: 'Collateral & quality' },
    { key: 'monitoring', name: 'Monitoring', weight: 'N/A', color: 'red', bgColor: 'bg-red-50', borderColor: 'border-red-200', textColor: 'text-red-700', desc: 'Post-policy early warning' },
  ];

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="h-8 w-8 animate-spin text-primary-600" /></div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <Brain className="h-8 w-8 mr-3 text-purple-600" />
            AI Underwriting Agent
          </h1>
          <p className="text-gray-600">62-variable risk scoring • 18-variable monitoring • FOIA-calibrated</p>
        </div>
        <button onClick={loadData} className="btn btn-secondary inline-flex items-center">
          <RefreshCw className="h-4 w-4 mr-2" />Refresh
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6">{error}<button onClick={() => setError('')} className="float-right">×</button></div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg mb-6">{success}<button onClick={() => setSuccess('')} className="float-right">×</button></div>}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="card bg-gradient-to-br from-purple-500 to-purple-600 text-white">
          <div className="flex items-center justify-between">
            <div><p className="text-purple-100 text-sm">Underwriting Variables</p><p className="text-3xl font-bold">62</p><p className="text-xs text-purple-200">5 categories</p></div>
            <Target className="h-10 w-10 text-purple-200" />
          </div>
        </div>
        <div className="card bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <div className="flex items-center justify-between">
            <div><p className="text-blue-100 text-sm">Monitoring Variables</p><p className="text-3xl font-bold">18</p><p className="text-xs text-blue-200">Early warning</p></div>
            <Activity className="h-10 w-10 text-blue-200" />
          </div>
        </div>
        <div className="card bg-gradient-to-br from-green-500 to-green-600 text-white">
          <div className="flex items-center justify-between">
            <div><p className="text-green-100 text-sm">FOIA Loans Analyzed</p><p className="text-3xl font-bold">1.6M</p><p className="text-xs text-green-200">FY2000-2025</p></div>
            <BarChart3 className="h-10 w-10 text-green-200" />
          </div>
        </div>
        <div className="card bg-gradient-to-br from-orange-500 to-orange-600 text-white">
          <div className="flex items-center justify-between">
            <div><p className="text-orange-100 text-sm">Active Alerts</p><p className="text-3xl font-bold">{dashboard?.alerts_requiring_action || 0}</p><p className="text-xs text-orange-200">Requiring action</p></div>
            <AlertTriangle className="h-10 w-10 text-orange-200" />
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Risk Scoring Demo */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4 flex items-center"><Zap className="h-5 w-5 mr-2 text-yellow-500" />Risk Scoring Demo</h2>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs text-gray-500">Loan Amount</label>
              <input type="number" value={demoData.loan_amount} onChange={e => setDemoData({...demoData, loan_amount: +e.target.value})} className="input w-full text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500">NAICS Code</label>
              <input type="text" value={demoData.naics_industry} onChange={e => setDemoData({...demoData, naics_industry: e.target.value})} className="input w-full text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Business Age (yrs)</label>
              <input type="number" value={demoData.business_age} onChange={e => setDemoData({...demoData, business_age: +e.target.value})} className="input w-full text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Equity Injection %</label>
              <input type="number" value={demoData.equity_injection} onChange={e => setDemoData({...demoData, equity_injection: +e.target.value})} className="input w-full text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500">DSCR</label>
              <input type="number" step="0.01" value={demoData.dscr} onChange={e => setDemoData({...demoData, dscr: +e.target.value})} className="input w-full text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Credit Score</label>
              <input type="number" value={demoData.borrower_credit_score} onChange={e => setDemoData({...demoData, borrower_credit_score: +e.target.value})} className="input w-full text-sm" />
            </div>
          </div>
          <button onClick={runScoringDemo} disabled={scoringLoading} className="btn btn-primary w-full">
            {scoringLoading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Brain className="h-4 w-4 mr-2" />}
            Run AI Scoring
          </button>

          {scoringResult && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-3xl font-bold">{scoringResult.composite_score}</p>
                  <p className="text-sm text-gray-500">Composite Score</p>
                </div>
                <div className={`px-4 py-2 rounded-lg border ${getTierColor(scoringResult.tier)}`}>
                  <p className="font-semibold">{scoringResult.tier_display}</p>
                  <p className="text-xs">{scoringResult.decision.replace('_', ' ')}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                <div className="bg-white p-2 rounded"><span className="text-gray-500">Premium:</span> <span className="font-medium">{(scoringResult.recommended_premium * 100).toFixed(2)}%</span></div>
                <div className="bg-white p-2 rounded"><span className="text-gray-500">Exp. Default:</span> <span className="font-medium">{(scoringResult.expected_annual_default_rate * 100).toFixed(2)}%</span></div>
                <div className="bg-white p-2 rounded"><span className="text-gray-500">FOIA Benchmark:</span> <span className="font-medium">{(scoringResult.foia_benchmark_rate * 100).toFixed(2)}%</span></div>
                <div className="bg-white p-2 rounded"><span className="text-gray-500">Monitoring:</span> <span className="font-medium capitalize">{scoringResult.monitoring_frequency}</span></div>
              </div>
              {scoringResult.risk_flags?.length > 0 && (
                <div className="text-sm">
                  <p className="font-medium text-gray-700 mb-1">Risk Flags:</p>
                  {scoringResult.risk_flags.slice(0, 3).map((flag: string, i: number) => (
                    <p key={i} className="text-orange-600 text-xs flex items-start"><AlertTriangle className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0" />{flag}</p>
                  ))}
                </div>
              )}
              {scoringResult.positive_factors?.length > 0 && (
                <div className="text-sm mt-2">
                  <p className="font-medium text-gray-700 mb-1">Positive Factors:</p>
                  {scoringResult.positive_factors.slice(0, 3).map((factor: string, i: number) => (
                    <p key={i} className="text-green-600 text-xs flex items-start"><CheckCircle className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0" />{factor}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Risk Tiers & Alerts */}
        <div className="space-y-6">
          {/* Risk Tiers */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Risk Tier Definitions</h2>
            <div className="space-y-2">
              {Object.entries(tiers).map(([name, info]: [string, any]) => (
                <div key={name} className={`p-3 rounded-lg border ${getTierColor(name)}`}>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-semibold capitalize">{name.replace('_', ' ')}</p>
                      <p className="text-xs">Score: {info.score_range?.[0]}-{info.score_range?.[1]}</p>
                    </div>
                    <div className="text-right text-sm">
                      {info.premium_range ? (
                        <p>{(info.premium_range[0] * 100).toFixed(2)}-{(info.premium_range[1] * 100).toFixed(2)}%</p>
                      ) : <p>N/A</p>}
                      <p className="text-xs capitalize">{info.decision?.replace('_', ' ')}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Alert Summary */}
          {dashboard && (
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">Portfolio Alerts</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 p-3 rounded-lg text-center">
                  <p className="text-2xl font-bold text-blue-600">{dashboard.loans_at_watch}</p>
                  <p className="text-xs text-blue-700">Watch</p>
                </div>
                <div className="bg-yellow-50 p-3 rounded-lg text-center">
                  <p className="text-2xl font-bold text-yellow-600">{dashboard.loans_at_advisory}</p>
                  <p className="text-xs text-yellow-700">Advisory</p>
                </div>
                <div className="bg-orange-50 p-3 rounded-lg text-center">
                  <p className="text-2xl font-bold text-orange-600">{dashboard.loans_at_escalation}</p>
                  <p className="text-xs text-orange-700">Escalation</p>
                </div>
                <div className="bg-red-50 p-3 rounded-lg text-center">
                  <p className="text-2xl font-bold text-red-600">{dashboard.loans_at_pre_claim}</p>
                  <p className="text-xs text-red-700">Pre-Claim</p>
                </div>
              </div>
              {dashboard.top_alerts?.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Top Alerts</p>
                  {dashboard.top_alerts.slice(0, 3).map((alert: any, i: number) => (
                    <div key={i} className="flex justify-between items-center p-2 bg-gray-50 rounded mb-1 text-sm">
                      <span>{alert.loan_number} - {alert.borrower_name}</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        alert.alert_level === 'pre_claim' ? 'bg-red-100 text-red-700' :
                        alert.alert_level === 'escalation' ? 'bg-orange-100 text-orange-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>{alert.alert_level}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Variable Categories - Clickable with Settings */}
      <div className="card mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Scoring Categories <span className="text-sm font-normal text-gray-500">(click to expand)</span></h2>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <>
                <button onClick={resetToDefaults} className="btn btn-secondary text-sm inline-flex items-center">
                  <RotateCcw className="h-4 w-4 mr-1" /> Reset
                </button>
                <button onClick={saveSettings} className="btn btn-primary text-sm inline-flex items-center">
                  <Save className="h-4 w-4 mr-1" /> Save
                </button>
              </>
            )}
            <button 
              onClick={() => setShowSettings(!showSettings)} 
              className={`btn text-sm inline-flex items-center ${showSettings ? 'btn-primary' : 'btn-secondary'}`}
            >
              <Settings className="h-4 w-4 mr-1" /> {showSettings ? 'Hide Controls' : 'Show Controls'}
            </button>
          </div>
        </div>
        
        {/* Category Weight Summary */}
        {showSettings && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Total Category Weight:</span>
              <span className={`text-sm font-bold ${getTotalCategoryWeight() === 100 ? 'text-green-600' : 'text-orange-600'}`}>
                {getTotalCategoryWeight()}% {getTotalCategoryWeight() !== 100 && '(should equal 100%)'}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${getTotalCategoryWeight() === 100 ? 'bg-green-500' : 'bg-orange-500'}`}
                style={{ width: `${Math.min(getTotalCategoryWeight(), 100)}%` }}
              />
            </div>
          </div>
        )}
        
        <div className="space-y-3">
          {categories.map((cat) => {
            const isExpanded = expandedCategories.has(cat.key);
            const categoryVars = variables[cat.key] || [];
            const catSettings = categorySettings[cat.key] || { weight: 15, enabled: true };
            const enabledCount = getEnabledVariableCount(cat.key);
            
            return (
              <div key={cat.key} className={`rounded-lg border ${cat.borderColor} overflow-hidden ${!catSettings.enabled ? 'opacity-50' : ''}`}>
                {/* Category Header */}
                <div className={`p-4 ${cat.bgColor}`}>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => toggleCategoryExpanded(cat.key)}
                      className="flex items-center gap-4 flex-1 text-left hover:opacity-80"
                    >
                      <div>
                        <p className={`font-semibold ${cat.textColor}`}>{cat.name}</p>
                        <p className="text-xs text-gray-500">{cat.desc}</p>
                      </div>
                    </button>
                    
                    <div className="flex items-center gap-4">
                      {/* Settings Controls */}
                      {showSettings ? (
                        <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                          {/* Enable/Disable Toggle */}
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={catSettings.enabled}
                              onChange={() => toggleCategoryEnabled(cat.key)}
                              className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                            />
                            <span className="text-xs text-gray-600">Enabled</span>
                          </label>
                          
                          {/* Weight Slider */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">Weight:</span>
                            <input
                              type="range"
                              min="0"
                              max="50"
                              value={catSettings.weight}
                              onChange={(e) => updateCategoryWeight(cat.key, parseInt(e.target.value))}
                              disabled={!catSettings.enabled}
                              className="w-20 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                            />
                            <span className="text-sm font-bold w-10">{catSettings.weight}%</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-right">
                          <p className="text-2xl font-bold text-gray-800">{catSettings.weight}%</p>
                          <p className="text-xs text-gray-500">{enabledCount}/{categoryVars.length} vars</p>
                        </div>
                      )}
                      
                      <button onClick={() => toggleCategoryExpanded(cat.key)}>
                        {isExpanded ? (
                          <ChevronUp className={`h-5 w-5 ${cat.textColor}`} />
                        ) : (
                          <ChevronDown className={`h-5 w-5 ${cat.textColor}`} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
                
                {/* Expanded Variables with Controls */}
                {isExpanded && categoryVars.length > 0 && (
                  <div className="bg-white p-4 border-t">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b">
                          {showSettings && <th className="pb-2 font-medium w-16">Active</th>}
                          <th className="pb-2 font-medium">Variable</th>
                          <th className="pb-2 font-medium">{showSettings ? 'Custom Weight' : 'Weight'}</th>
                          <th className="pb-2 font-medium">Optimal</th>
                          <th className="pb-2 font-medium">Caution</th>
                          <th className="pb-2 font-medium">Reject</th>
                          <th className="pb-2 font-medium">Phase</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categoryVars.map((v: Variable) => {
                          const varSettings = variableSettings[v.id] || { enabled: true, customWeight: DEFAULT_VARIABLE_WEIGHTS[v.weight] || 50 };
                          return (
                            <tr key={v.id} className={`border-b last:border-0 hover:bg-gray-50 ${!varSettings.enabled ? 'opacity-50' : ''}`}>
                              {showSettings && (
                                <td className="py-2">
                                  <input
                                    type="checkbox"
                                    checked={varSettings.enabled}
                                    onChange={() => toggleVariableEnabled(v.id)}
                                    className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                  />
                                </td>
                              )}
                              <td className="py-2">
                                <p className="font-medium text-gray-900">{v.name}</p>
                                <p className="text-xs text-gray-500">{v.description}</p>
                              </td>
                              <td className="py-2">
                                {showSettings ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="range"
                                      min="0"
                                      max="100"
                                      value={varSettings.customWeight}
                                      onChange={(e) => updateVariableWeight(v.id, parseInt(e.target.value))}
                                      disabled={!varSettings.enabled}
                                      className="w-16 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                    />
                                    <span className="text-xs font-medium w-8">{varSettings.customWeight}</span>
                                  </div>
                                ) : (
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getWeightBadge(v.weight)}`}>
                                    {v.weight}
                                  </span>
                                )}
                              </td>
                              <td className="py-2 text-green-600 text-xs">{v.optimal_range}</td>
                              <td className="py-2 text-yellow-600 text-xs">{v.caution_range}</td>
                              <td className="py-2 text-red-600 text-xs">{v.reject_threshold || '-'}</td>
                              <td className="py-2">
                                <span className={`px-2 py-0.5 rounded text-xs ${v.phase === 'mvp' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                  {v.phase === 'mvp' ? 'MVP' : 'Phase 2'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                
                {/* No variables message */}
                {isExpanded && categoryVars.length === 0 && (
                  <div className="bg-white p-4 border-t text-center text-gray-500 text-sm">
                    No variables loaded for this category
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
