'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { 
  Calculator, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, XCircle, 
  RefreshCw, Sliders, Target, DollarSign, PieChart, FileText, Info,
  ChevronDown, ChevronUp, Shield, Zap, BarChart3
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { formatCurrency, formatPercent } from '@/lib/utils';

interface Deal {
  id: number;
  name: string;
  loan_amount_requested: number;
  industry: string;
  status: string;
}

interface LossDriver {
  factor: string;
  impact: number;
  description: string;
  vs_benchmark: string;
}

export default function ActuaryAdvisorPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<number | null>(null);
  const [pricingResult, setPricingResult] = useState<any>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Manual submission form
  const [showManualForm, setShowManualForm] = useState(false);
  const [submission, setSubmission] = useState({
    loan_amount: 1500000,
    naics_code: '722511',
    state: 'CA',
    vintage_year: 2024,
    term_months: 120,
    dscr: 1.35,
    credit_score: 710,
    collateral_type: 'mixed',
    sba_guaranty_pct: 0.75,
    equity_injection_pct: 0.15,
    business_age_years: 8,
    // Collateral details
    total_collateral_value: 1200000,
    collateral_items: [] as any[],
    // Premium budget
    max_monthly_premium: 2500,
    target_monthly_premium: 2000,
  });
  
  // Collateral items for itemized entry
  const [collateralItems, setCollateralItems] = useState<any[]>([
    { asset_type: 'real_estate', description: 'Commercial property', estimated_value: 800000 },
    { asset_type: 'equipment', description: 'Kitchen equipment', estimated_value: 400000 },
  ]);
  
  // Policy terms
  const [policyTerms, setPolicyTerms] = useState({
    attachment_point: 0,
    limit: 1125000,
    coinsurance: 1.0,
    waiting_period_days: 90,
  });
  
  // Structure optimizer
  const [showOptimizer, setShowOptimizer] = useState(false);
  const [scenarios, setScenarios] = useState<any[]>([]);
  
  // Expanded sections
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['pricing', 'decision']));

  useEffect(() => {
    loadDeals();
  }, []);

  const loadDeals = async () => {
    try {
      setLoading(true);
      const dealsData = await api.getDeals().catch(() => []);
      setDeals(dealsData.filter((d: Deal) => d.status !== 'draft'));
    } catch (err) {
      setError('Failed to load deals');
    } finally {
      setLoading(false);
    }
  };

  const priceDeal = async (dealId: number) => {
    setPricingLoading(true);
    setSelectedDeal(dealId);
    setShowManualForm(false);
    setError('');
    try {
      const result = await api.priceDeal(dealId, policyTerms);
      setPricingResult(result);
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail;
      if (typeof errorMsg === 'string') {
        setError(errorMsg);
      } else if (Array.isArray(errorMsg)) {
        setError(errorMsg.map((e: any) => typeof e === 'string' ? e : e.msg).join(', '));
      } else {
        setError('Pricing failed');
      }
      setPricingResult(null);
    } finally {
      setPricingLoading(false);
    }
  };

  const priceManualSubmission = async () => {
    setPricingLoading(true);
    setSelectedDeal(null);
    setError('');
    try {
      // Update limit based on loan amount if not set
      const terms = {
        attachment_point: policyTerms.attachment_point,
        limit: policyTerms.limit || submission.loan_amount * 0.75,
        coinsurance: policyTerms.coinsurance,
        waiting_period_days: policyTerms.waiting_period_days,
      };
      
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/api/v1/actuarial/price`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          submission: submission,
          policy_terms: terms,
        }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        // Handle validation errors
        if (result.detail) {
          if (Array.isArray(result.detail)) {
            // Pydantic validation errors
            const errorMessages = (result.detail || []).map((e: any) => 
              typeof e === 'string' ? e : `${e.loc?.join('.')}: ${e.msg}`
            ).join(', ');
            throw new Error(errorMessages);
          } else if (typeof result.detail === 'string') {
            throw new Error(result.detail);
          } else {
            throw new Error('Pricing failed');
          }
        }
        throw new Error('Pricing failed');
      }
      
      setPricingResult(result);
    } catch (err: any) {
      setError(err.message || 'Pricing failed');
      setPricingResult(null);
    } finally {
      setPricingLoading(false);
    }
  };

  const runStructureOptimizer = async () => {
    setPricingLoading(true);
    setError('');
    setShowOptimizer(false);
    try {
      const scenarioList = [
        { attachment_point: 0, limit: submission.loan_amount * 0.75, coinsurance: 1.0 },
        { attachment_point: 0, limit: submission.loan_amount * 0.50, coinsurance: 1.0 },
        { attachment_point: submission.loan_amount * 0.10, limit: submission.loan_amount * 0.65, coinsurance: 1.0 },
        { attachment_point: 0, limit: submission.loan_amount * 0.75, coinsurance: 0.80 },
        { attachment_point: submission.loan_amount * 0.05, limit: submission.loan_amount * 0.70, coinsurance: 0.90 },
      ];
      
      console.log('Running structure optimizer with:', { submission, scenarios: scenarioList });
      
      // Call API with correct base URL
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/api/v1/actuarial/structure-optimizer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          submission: submission,
          policy_terms: { attachment_point: 0, coinsurance: 1.0, waiting_period_days: 90 },
          scenarios: scenarioList,
        }),
      });
      
      const result = await response.json();
      console.log('Structure optimizer result:', result);
      
      if (!response.ok) {
        if (result.detail) {
          if (Array.isArray(result.detail)) {
            throw new Error(result.detail.map((e: any) => typeof e === 'string' ? e : `${e.loc?.join('.')}: ${e.msg}`).join(', '));
          } else if (typeof result.detail === 'string') {
            throw new Error(result.detail);
          }
        }
        throw new Error('Optimization failed');
      }
      
      if (result.scenarios && result.scenarios.length > 0) {
        setScenarios(result.scenarios);
        setShowOptimizer(true);
      } else {
        setError('No scenarios returned from optimizer');
      }
    } catch (err: any) {
      console.error('Structure optimizer error:', err);
      setError(err.message || 'Optimization failed');
    } finally {
      setPricingLoading(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const getDecisionColor = (decision: string) => {
    switch (decision) {
      case 'accept': return 'bg-green-100 text-green-800 border-green-300';
      case 'decline': return 'bg-red-100 text-red-800 border-red-300';
      case 'refer': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getDataSufficiencyColor = (level: string) => {
    switch (level) {
      case 'high': return 'text-green-600';
      case 'moderate': return 'text-yellow-600';
      case 'low': return 'text-orange-600';
      default: return 'text-red-600';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <Calculator className="h-8 w-8 mr-3 text-indigo-600" />
            Actuary Advisor
          </h1>
          <p className="text-gray-600">Deal-level pricing & underwriting guidance</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowManualForm(!showManualForm); setShowOptimizer(false); }}
            className={`btn ${showManualForm ? 'btn-primary' : 'btn-secondary'}`}
          >
            <FileText className="h-4 w-4 mr-2" />
            Manual Entry
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6">
          {error}
          <button onClick={() => setError('')} className="float-right">×</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: Deal Selection / Manual Entry */}
        <div className="lg:col-span-1 space-y-4">
          {/* Deal Selection */}
          {!showManualForm && (
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">Select Deal</h2>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {deals.length === 0 ? (
                  <p className="text-sm text-gray-500">No deals available</p>
                ) : (
                  deals.map(deal => (
                    <button
                      key={deal.id}
                      onClick={() => priceDeal(deal.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedDeal === deal.id
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <p className="font-medium text-sm">{deal.name}</p>
                      <p className="text-xs text-gray-500">
                        {formatCurrency(deal.loan_amount_requested)} • {deal.industry}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Manual Entry Form */}
          {showManualForm && (
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">Submission Details</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500">Loan Amount</label>
                  <input
                    type="number"
                    value={submission.loan_amount}
                    onChange={e => setSubmission({...submission, loan_amount: +e.target.value})}
                    className="input w-full text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">NAICS Code</label>
                  <input
                    type="text"
                    value={submission.naics_code}
                    onChange={e => setSubmission({...submission, naics_code: e.target.value})}
                    className="input w-full text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">DSCR</label>
                    <input
                      type="number"
                      step="0.01"
                      value={submission.dscr}
                      onChange={e => setSubmission({...submission, dscr: +e.target.value})}
                      className="input w-full text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Credit Score</label>
                    <input
                      type="number"
                      value={submission.credit_score}
                      onChange={e => setSubmission({...submission, credit_score: +e.target.value})}
                      className="input w-full text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">Business Age</label>
                    <input
                      type="number"
                      value={submission.business_age_years}
                      onChange={e => setSubmission({...submission, business_age_years: +e.target.value})}
                      className="input w-full text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Equity %</label>
                    <input
                      type="number"
                      step="0.01"
                      value={submission.equity_injection_pct * 100}
                      onChange={e => setSubmission({...submission, equity_injection_pct: +e.target.value / 100})}
                      className="input w-full text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Collateral Type</label>
                  <select
                    value={submission.collateral_type}
                    onChange={e => setSubmission({...submission, collateral_type: e.target.value})}
                    className="input w-full text-sm"
                  >
                    <option value="real_estate">Real Estate</option>
                    <option value="equipment">Equipment</option>
                    <option value="inventory">Inventory</option>
                    <option value="mixed">Mixed</option>
                    <option value="unsecured">Unsecured</option>
                  </select>
                </div>
                
                {/* Collateral Value */}
                <div className="border-t pt-3 mt-3">
                  <label className="text-xs text-gray-500 font-semibold">Business Collateral</label>
                  <div className="mt-2">
                    <label className="text-xs text-gray-500">Total Collateral Value ($)</label>
                    <input
                      type="number"
                      value={submission.total_collateral_value}
                      onChange={e => setSubmission({...submission, total_collateral_value: +e.target.value})}
                      className="input w-full text-sm"
                      placeholder="Market value of all pledged assets"
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Coverage: {((submission.total_collateral_value / submission.loan_amount) * 100).toFixed(0)}%
                  </p>
                </div>
                
                {/* Premium Budget */}
                <div className="border-t pt-3 mt-3">
                  <label className="text-xs text-gray-500 font-semibold">Monthly Premium Budget</label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <label className="text-xs text-gray-500">Target ($/mo)</label>
                      <input
                        type="number"
                        value={submission.target_monthly_premium}
                        onChange={e => setSubmission({...submission, target_monthly_premium: +e.target.value})}
                        className="input w-full text-sm"
                        placeholder="Preferred"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Max ($/mo)</label>
                      <input
                        type="number"
                        value={submission.max_monthly_premium}
                        onChange={e => setSubmission({...submission, max_monthly_premium: +e.target.value})}
                        className="input w-full text-sm"
                        placeholder="Maximum"
                      />
                    </div>
                  </div>
                </div>
                
                <button
                  onClick={priceManualSubmission}
                  disabled={pricingLoading}
                  className="btn btn-primary w-full mt-4"
                >
                  {pricingLoading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Calculator className="h-4 w-4 mr-2" />}
                  Calculate Pricing
                </button>
              </div>
            </div>
          )}

          {/* Policy Terms */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Policy Terms</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">Attachment Point ($)</label>
                <input
                  type="number"
                  value={policyTerms.attachment_point}
                  onChange={e => setPolicyTerms({...policyTerms, attachment_point: +e.target.value})}
                  className="input w-full text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Limit ($)</label>
                <input
                  type="number"
                  value={policyTerms.limit}
                  onChange={e => setPolicyTerms({...policyTerms, limit: +e.target.value})}
                  className="input w-full text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Coinsurance %</label>
                <input
                  type="number"
                  step="0.05"
                  value={policyTerms.coinsurance * 100}
                  onChange={e => setPolicyTerms({...policyTerms, coinsurance: +e.target.value / 100})}
                  className="input w-full text-sm"
                />
              </div>
              <button
                onClick={runStructureOptimizer}
                disabled={pricingLoading}
                className="btn btn-secondary w-full text-sm"
              >
                <Sliders className="h-4 w-4 mr-2" />
                Run Structure Optimizer
              </button>
            </div>
          </div>
        </div>

        {/* Right: Pricing Results */}
        <div className="lg:col-span-3">
          {pricingLoading ? (
            <div className="card flex items-center justify-center h-64">
              <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
              <span className="ml-3">Calculating actuarial pricing...</span>
            </div>
          ) : pricingResult ? (
            <div className="space-y-4">
              {/* Main Pricing Card */}
              <div className="card bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900">Indicated Premium</h2>
                  <div className={`px-4 py-2 rounded-lg border-2 font-semibold ${getDecisionColor(pricingResult.decision)}`}>
                    {pricingResult.decision.toUpperCase()}
                  </div>
                </div>
                
                <div className="grid grid-cols-5 gap-4 mb-4">
                  <div className="bg-white p-4 rounded-lg text-center">
                    <p className="text-3xl font-bold text-indigo-600">
                      {(pricingResult.indicated_rate * 100).toFixed(2)}%
                    </p>
                    <p className="text-sm text-gray-500">Indicated Rate</p>
                    <p className="text-xs text-gray-400">
                      ({(pricingResult.indicated_rate_low * 100).toFixed(2)}% - {(pricingResult.indicated_rate_high * 100).toFixed(2)}%)
                    </p>
                  </div>
                  <div className="bg-white p-4 rounded-lg text-center">
                    <p className="text-3xl font-bold text-green-600">
                      {formatCurrency(pricingResult.monthly_premium_dollars)}
                    </p>
                    <p className="text-sm text-gray-500">Monthly Premium</p>
                    <p className="text-xs text-gray-400">
                      {formatCurrency(pricingResult.annual_premium_dollars)}/yr
                    </p>
                  </div>
                  <div className="bg-white p-4 rounded-lg text-center">
                    <p className="text-3xl font-bold text-orange-600">
                      {formatCurrency(pricingResult.expected_loss_dollars)}
                    </p>
                    <p className="text-sm text-gray-500">Expected Loss</p>
                  </div>
                  <div className="bg-white p-4 rounded-lg text-center">
                    <p className="text-3xl font-bold text-purple-600">
                      {(pricingResult.expected_loss_ratio * 100).toFixed(1)}%
                    </p>
                    <p className="text-sm text-gray-500">Loss Ratio</p>
                  </div>
                  <div className={`bg-white p-4 rounded-lg text-center ${pricingResult.budget_feasible ? 'ring-2 ring-green-300' : 'ring-2 ring-red-300'}`}>
                    <p className={`text-3xl font-bold ${pricingResult.budget_feasible ? 'text-green-600' : 'text-red-600'}`}>
                      {pricingResult.budget_feasible ? '✓' : '✗'}
                    </p>
                    <p className="text-sm text-gray-500">Budget Fit</p>
                    {pricingResult.budget_gap && (
                      <p className={`text-xs ${pricingResult.budget_feasible ? 'text-green-500' : 'text-red-500'}`}>
                        {pricingResult.budget_feasible ? 'Under by' : 'Over by'} {formatCurrency(Math.abs(pricingResult.budget_gap))}/mo
                      </p>
                    )}
                  </div>
                </div>

                {/* Collateral Analysis */}
                {pricingResult.collateral_value > 0 && (
                  <div className="bg-blue-50 p-4 rounded-lg mb-4">
                    <h3 className="font-semibold mb-2 text-blue-800">Collateral Impact</h3>
                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-blue-600">Collateral Value:</span>
                        <span className="ml-2 font-medium">{formatCurrency(pricingResult.collateral_value)}</span>
                      </div>
                      <div>
                        <span className="text-blue-600">Coverage Ratio:</span>
                        <span className="ml-2 font-medium">{(pricingResult.collateral_coverage_ratio * 100).toFixed(0)}%</span>
                      </div>
                      <div>
                        <span className="text-blue-600">LGD Reduction:</span>
                        <span className="ml-2 font-medium text-green-600">-{(pricingResult.collateral_discount * 100).toFixed(0)}%</span>
                      </div>
                      <div>
                        <span className="text-blue-600">Adjusted LGD:</span>
                        <span className="ml-2 font-medium">{(pricingResult.collateral_adjusted_lgd * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Budget Analysis */}
                {!pricingResult.budget_feasible && pricingResult.budget_adjusted_coverage && (
                  <div className="bg-yellow-50 p-4 rounded-lg mb-4 border border-yellow-200">
                    <h3 className="font-semibold mb-2 text-yellow-800">Budget Alternative</h3>
                    <p className="text-sm text-yellow-700">
                      To meet the {formatCurrency(pricingResult.budget_monthly_premium || 0)}/month budget, 
                      coverage could be reduced to <strong>{formatCurrency(pricingResult.budget_adjusted_coverage)}</strong> 
                      (from {formatCurrency(submission.loan_amount * 0.75)}).
                    </p>
                  </div>
                )}

                {/* Rate Breakdown */}
                <div className="bg-white p-4 rounded-lg">
                  <h3 className="font-semibold mb-3">Rate Build-Up</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Pure Premium (Expected Loss)</span>
                      <span className="font-medium">{(pricingResult.pure_premium * 100).toFixed(3)}%</span>
                    </div>
                    {pricingResult.collateral_discount > 0 && (
                      <div className="flex justify-between items-center text-green-600">
                        <span className="text-sm">− Collateral Credit</span>
                        <span className="font-medium">-{(pricingResult.collateral_discount * pricingResult.pure_premium * 100).toFixed(3)}%</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center text-gray-600">
                      <span className="text-sm">+ Risk Load (Volatility/Tail)</span>
                      <span className="font-medium">{(pricingResult.risk_load * 100).toFixed(3)}%</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-600">
                      <span className="text-sm">+ Expense Load</span>
                      <span className="font-medium">{(pricingResult.expense_load * 100).toFixed(3)}%</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-600">
                      <span className="text-sm">+ Profit Margin</span>
                      <span className="font-medium">{(pricingResult.profit_margin * 100).toFixed(3)}%</span>
                    </div>
                    <div className="border-t pt-2 flex justify-between items-center font-bold">
                      <span>= Indicated Rate</span>
                      <span className="text-indigo-600">{(pricingResult.indicated_rate * 100).toFixed(3)}%</span>
                    </div>
                    <div className="flex justify-between items-center text-sm text-orange-600">
                      <span>Pricing Floor</span>
                      <span>{(pricingResult.pricing_floor * 100).toFixed(3)}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Decision & Conditions */}
              <div className="card">
                <button
                  onClick={() => toggleSection('decision')}
                  className="w-full flex items-center justify-between"
                >
                  <h3 className="font-semibold flex items-center">
                    <Target className="h-5 w-5 mr-2 text-indigo-600" />
                    Decision & Conditions
                  </h3>
                  {expandedSections.has('decision') ? <ChevronUp /> : <ChevronDown />}
                </button>
                
                {expandedSections.has('decision') && (
                  <div className="mt-4 space-y-4">
                    <div className={`p-4 rounded-lg border-2 ${getDecisionColor(pricingResult.decision)}`}>
                      <div className="flex items-center">
                        {pricingResult.decision === 'accept' && <CheckCircle className="h-6 w-6 mr-3" />}
                        {pricingResult.decision === 'decline' && <XCircle className="h-6 w-6 mr-3" />}
                        {pricingResult.decision === 'refer' && <AlertTriangle className="h-6 w-6 mr-3" />}
                        <div>
                          <p className="font-semibold capitalize">{pricingResult.decision}</p>
                          <p className="text-sm">{pricingResult.decision_rationale}</p>
                        </div>
                      </div>
                    </div>
                    
                    {pricingResult.required_conditions?.length > 0 && (
                      <div>
                        <p className="font-medium mb-2">Required Conditions:</p>
                        <ul className="space-y-1">
                          {(pricingResult.required_conditions || []).map((cond: string, i: number) => (
                            <li key={i} className="flex items-start text-sm">
                              <AlertTriangle className="h-4 w-4 mr-2 mt-0.5 text-yellow-500 flex-shrink-0" />
                              {cond}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Loss Drivers */}
              <div className="card">
                <button
                  onClick={() => toggleSection('drivers')}
                  className="w-full flex items-center justify-between"
                >
                  <h3 className="font-semibold flex items-center">
                    <BarChart3 className="h-5 w-5 mr-2 text-indigo-600" />
                    Loss Drivers (vs Benchmark)
                  </h3>
                  {expandedSections.has('drivers') ? <ChevronUp /> : <ChevronDown />}
                </button>
                
                {expandedSections.has('drivers') && (
                  <div className="mt-4 space-y-3">
                    {pricingResult.loss_drivers?.map((driver: LossDriver, i: number) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center">
                          {driver.impact > 0 ? (
                            <TrendingUp className="h-5 w-5 mr-3 text-red-500" />
                          ) : (
                            <TrendingDown className="h-5 w-5 mr-3 text-green-500" />
                          )}
                          <div>
                            <p className="font-medium">{driver.factor}</p>
                            <p className="text-sm text-gray-500">{driver.description}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`px-2 py-1 rounded text-sm font-medium ${
                            driver.impact > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                          }`}>
                            {driver.impact > 0 ? '+' : ''}{(driver.impact * 100).toFixed(0)}%
                          </span>
                          <p className="text-xs text-gray-400 mt-1">{driver.vs_benchmark}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Risk Metrics */}
              <div className="card">
                <button
                  onClick={() => toggleSection('risk')}
                  className="w-full flex items-center justify-between"
                >
                  <h3 className="font-semibold flex items-center">
                    <Shield className="h-5 w-5 mr-2 text-indigo-600" />
                    Risk & Capital Metrics
                  </h3>
                  {expandedSections.has('risk') ? <ChevronUp /> : <ChevronDown />}
                </button>
                
                {expandedSections.has('risk') && (
                  <div className="mt-4 grid grid-cols-3 gap-4">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-500">Default Probability</p>
                      <p className="text-xl font-bold">{(pricingResult.default_probability * 100).toFixed(2)}%</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-500">Loss Given Default</p>
                      <p className="text-xl font-bold">{(pricingResult.loss_given_default * 100).toFixed(1)}%</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-500">PML (99%)</p>
                      <p className="text-xl font-bold">{(pricingResult.pml_99 * 100).toFixed(2)}%</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-500">TVaR (99%)</p>
                      <p className="text-xl font-bold">{(pricingResult.tvar_99 * 100).toFixed(2)}%</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-500">Capital Required</p>
                      <p className="text-xl font-bold">{(pricingResult.capital_required * 100).toFixed(2)}%</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-500">Credibility</p>
                      <p className="text-xl font-bold">{(pricingResult.credibility_factor * 100).toFixed(0)}%</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Cohort Match */}
              <div className="card">
                <button
                  onClick={() => toggleSection('cohort')}
                  className="w-full flex items-center justify-between"
                >
                  <h3 className="font-semibold flex items-center">
                    <PieChart className="h-5 w-5 mr-2 text-indigo-600" />
                    Cohort Comparison
                  </h3>
                  {expandedSections.has('cohort') ? <ChevronUp /> : <ChevronDown />}
                </button>
                
                {expandedSections.has('cohort') && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium">{pricingResult.cohort_name}</span>
                      <span className={`text-sm ${getDataSufficiencyColor(pricingResult.data_sufficiency)}`}>
                        {pricingResult.cohort_loan_count} loans • {pricingResult.data_sufficiency} sufficiency
                      </span>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-lg text-sm">
                      <p>
                        This submission is compared against {pricingResult.cohort_loan_count} historical loans 
                        with similar characteristics. Credibility weighting of {(pricingResult.credibility_factor * 100).toFixed(0)}% 
                        is applied to cohort experience.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Audit Trail */}
              <div className="card bg-gray-50">
                <button
                  onClick={() => toggleSection('audit')}
                  className="w-full flex items-center justify-between"
                >
                  <h3 className="font-semibold flex items-center text-gray-600">
                    <Info className="h-5 w-5 mr-2" />
                    Audit Trail
                  </h3>
                  {expandedSections.has('audit') ? <ChevronUp /> : <ChevronDown />}
                </button>
                
                {expandedSections.has('audit') && (
                  <div className="mt-4 text-sm text-gray-600 space-y-2">
                    <div className="flex justify-between">
                      <span>Model Version:</span>
                      <span className="font-mono">{pricingResult.model_version}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Dataset Version:</span>
                      <span className="font-mono">{pricingResult.dataset_version}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Calculated At:</span>
                      <span className="font-mono">{new Date(pricingResult.calculated_at).toLocaleString()}</span>
                    </div>
                    <div className="pt-2 border-t">
                      <p className="font-medium mb-1">Assumptions:</p>
                      <div className="grid grid-cols-2 gap-1 text-xs">
                        {Object.entries(pricingResult.assumptions || {}).map(([key, value]) => (
                          <div key={key} className="flex justify-between">
                            <span className="text-gray-500">{key}:</span>
                            <span>{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="card text-center py-12">
              <Calculator className="h-16 w-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Select a Deal or Enter Submission
              </h3>
              <p className="text-gray-500">
                Choose a deal from the list or use manual entry to calculate actuarial pricing
              </p>
            </div>
          )}

          {/* Structure Optimizer Results */}
          {showOptimizer && scenarios.length > 0 && (
            <div className="card mt-4">
              <h3 className="font-semibold mb-4 flex items-center">
                <Sliders className="h-5 w-5 mr-2 text-indigo-600" />
                Structure Comparison
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2">Attachment</th>
                      <th className="pb-2">Limit</th>
                      <th className="pb-2">Coinsurance</th>
                      <th className="pb-2">Expected Loss</th>
                      <th className="pb-2">PML (99%)</th>
                      <th className="pb-2">Indicated Rate</th>
                      <th className="pb-2">Premium</th>
                      <th className="pb-2">ROI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenarios.map((s, i) => (
                      <tr key={i} className="border-b hover:bg-gray-50">
                        <td className="py-2">{formatCurrency(s.attachment_point)}</td>
                        <td className="py-2">{formatCurrency(s.limit)}</td>
                        <td className="py-2">{(s.coinsurance * 100).toFixed(0)}%</td>
                        <td className="py-2">{(s.expected_loss_rate * 100).toFixed(3)}%</td>
                        <td className="py-2">{(s.pml_99 * 100).toFixed(2)}%</td>
                        <td className="py-2 font-medium">{(s.indicated_rate * 100).toFixed(2)}%</td>
                        <td className="py-2">{formatCurrency(s.premium_dollars)}</td>
                        <td className="py-2">
                          <span className={s.roi > 0.12 ? 'text-green-600' : 'text-orange-600'}>
                            {(s.roi * 100).toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}