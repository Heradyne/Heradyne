'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { DollarSign, TrendingUp, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Loader, RefreshCw, X, Building2, Users, Clock, FileText, Link, BarChart3, Target, ArrowUpRight, Sparkles, Upload, Landmark, Briefcase, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { AIDisclaimer } from '@/components/ai-disclaimer';

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
const pct = (n: number) => `${(n || 0).toFixed(1)}%`;

const INDUSTRIES = [
  'Home Services (HVAC, Plumbing, Electrical)',
  'Restaurant / Food Service',
  'Retail',
  'Healthcare Services',
  'Professional Services (Accounting, Legal, Consulting)',
  'Technology / Software',
  'Manufacturing',
  'Distribution / Wholesale',
  'Auto Services',
  'Landscaping / Property Services',
  'Childcare / Education',
  'Fitness / Wellness',
  'Construction / Contracting',
  'E-commerce',
  'Other',
];

const OD_GRADE_STYLE: Record<string, string> = {
  A: 'bg-green-100 text-green-800 border-green-300',
  B: 'bg-blue-100 text-blue-800 border-blue-300',
  C: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  D: 'bg-orange-100 text-orange-800 border-orange-300',
  F: 'bg-red-100 text-red-800 border-red-300',
};

const EFFORT_STYLE: Record<string, string> = {
  low: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-red-100 text-red-700',
};

const CATEGORY_ICON: Record<string, string> = {
  owner_dependency: '👤',
  recurring_revenue: '🔄',
  processes: '📋',
  team: '👥',
  customers: '🤝',
  financials: '📊',
  growth: '🚀',
};

type Step = 'intro' | 'business' | 'financials' | 'owner' | 'integrations' | 'results';

const STEPS: { id: Step; label: string }[] = [
  { id: 'business', label: 'Business' },
  { id: 'financials', label: 'Financials' },
  { id: 'owner', label: 'Owner' },
  { id: 'integrations', label: 'Data' },
];

const defaultForm = {
  business_description: '',
  industry: '',
  years_in_business: '',
  num_employees: '',
  owner_hours_per_week: '40',
  owner_role_description: '',
  key_customers: '',
  customer_concentration_pct: '',
  recurring_revenue_pct: '',
  has_written_processes: false,
  has_management_team: false,
  growth_rate_pct: '',
  annual_revenue: '',
  gross_profit: '',
  ebitda: '',
  owner_compensation: '',
  owner_benefits: '',
  one_time_expenses: '',
  inventory_value: '',
  equipment_value: '',
  real_estate_value: '',
  total_debt: '',
  cash_on_hand: '',
  has_tax_returns: false,
  has_bank_connection: false,
  has_payroll_connection: false,
  tax_return_years: [] as number[],
  bank_provider: '',
  payroll_provider: '',
};

export default function ValuationEnginePage() {
  const [step, setStep] = useState<Step>('intro');
  const [form, setForm] = useState(defaultForm);
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [selectedDealId, setSelectedDealId] = useState<number | null>(null);
  const [prefilling, setPrefilling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [expandedRoadmap, setExpandedRoadmap] = useState<number | null>(0);
  const [activeHistoryId, setActiveHistoryId] = useState<number | null>(null);

  useEffect(() => {
    loadHistory();
    loadDeals();
  }, []);

  const loadDeals = async () => {
    try {
      const data = await api.getDeals();
      const owned = (data || []).filter((d: any) => d.status !== 'draft');
      setDeals(owned);
    } catch { /* silent */ }
  };

  const prefillFromDeal = async (dealId: number) => {
    setPrefilling(true);
    try {
      const data = await api.prefillValuationFromDeal(dealId);
      const p = data.prefilled;
      setForm(prev => ({
        ...prev,
        business_description: p.business_description || prev.business_description,
        industry: p.industry || prev.industry,
        annual_revenue: p.annual_revenue ? String(p.annual_revenue) : prev.annual_revenue,
        gross_profit: p.gross_profit ? String(p.gross_profit) : prev.gross_profit,
        ebitda: p.ebitda ? String(p.ebitda) : prev.ebitda,
        owner_compensation: p.owner_compensation ? String(p.owner_compensation) : prev.owner_compensation,
        owner_benefits: p.owner_benefits ? String(p.owner_benefits) : prev.owner_benefits,
        one_time_expenses: p.one_time_expenses ? String(p.one_time_expenses) : prev.one_time_expenses,
        equipment_value: p.equipment_value ? String(p.equipment_value) : prev.equipment_value,
        real_estate_value: p.real_estate_value ? String(p.real_estate_value) : prev.real_estate_value,
        total_debt: p.total_debt ? String(p.total_debt) : prev.total_debt,
        years_in_business: p.years_in_business ? String(p.years_in_business) : prev.years_in_business,
        has_tax_returns: p.has_tax_returns || prev.has_tax_returns,
      }));
      setSelectedDealId(dealId);
      setStep('business');
    } catch { /* silent */ }
    finally { setPrefilling(false); }
  };

  const loadHistory = async () => {
    try {
      const [latest, hist] = await Promise.all([
        api.getLatestValuation().catch(() => ({ exists: false })),
        api.getValuationHistory().catch(() => ({ valuations: [] })),
      ]);
      if (latest.exists) {
        setResult(latest);
        setStep('results');
      }
      setHistory(hist.valuations || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  const f = (field: string, value: any) => setForm(prev => ({ ...prev, [field]: value }));
  const n = (v: string) => v ? parseFloat(v) : 0;

  const runValuation = async () => {
    if (!form.business_description || !form.industry || !form.annual_revenue) {
      setError('Please fill in business description, industry, and annual revenue at minimum.');
      return;
    }
    setRunning(true);
    setError('');
    try {
      const data = {
        business_description: form.business_description,
        industry: form.industry,
        years_in_business: n(form.years_in_business),
        num_employees: n(form.num_employees),
        owner_hours_per_week: n(form.owner_hours_per_week),
        owner_role_description: form.owner_role_description,
        key_customers: form.key_customers,
        customer_concentration_pct: n(form.customer_concentration_pct),
        recurring_revenue_pct: n(form.recurring_revenue_pct),
        has_written_processes: form.has_written_processes,
        has_management_team: form.has_management_team,
        growth_rate_pct: n(form.growth_rate_pct),
        annual_revenue: n(form.annual_revenue),
        gross_profit: n(form.gross_profit),
        ebitda: n(form.ebitda),
        owner_compensation: n(form.owner_compensation),
        owner_benefits: n(form.owner_benefits),
        one_time_expenses: n(form.one_time_expenses),
        inventory_value: n(form.inventory_value),
        equipment_value: n(form.equipment_value),
        real_estate_value: n(form.real_estate_value),
        total_debt: n(form.total_debt),
        cash_on_hand: n(form.cash_on_hand),
        has_tax_returns: form.has_tax_returns,
        has_bank_connection: form.has_bank_connection,
        has_payroll_connection: form.has_payroll_connection,
        tax_return_years: form.tax_return_years,
      };
      const res = await api.runValuation(data);
      setResult(res);
      setStep('results');
      await loadHistory();
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Valuation failed. Please try again.');
    } finally {
      setRunning(false);
    }
  };

  const Input = ({ label, field, type = 'number', prefix = '', hint = '', placeholder = '' }: any) => (
    <div>
      <label className="label">{label}</label>
      {hint && <p className="text-xs text-gray-400 mb-1">{hint}</p>}
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">{prefix}</span>}
        <input
          type={type}
          value={(form as any)[field]}
          onChange={e => f(field, e.target.value)}
          placeholder={placeholder}
          className={`input w-full ${prefix ? 'pl-7' : ''}`}
        />
      </div>
    </div>
  );

  const Toggle = ({ label, field, hint = '' }: any) => (
    <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-gray-200 hover:border-blue-300 transition-all">
      <input type="checkbox" checked={(form as any)[field]} onChange={e => f(field, e.target.checked)}
        className="h-5 w-5 rounded text-blue-600 mt-0.5 shrink-0" />
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {hint && <p className="text-xs text-gray-400">{hint}</p>}
      </div>
    </label>
  );

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="h-8 w-8 animate-spin" /></div>;

  const vs = result?.valuation_summary || {};
  const od = result?.owner_dependency || {};
  const roadmap = result?.improvement_roadmap || [];
  const methods = result?.valuation_methods || [];
  const proj = result?.projections || {};
  const drivers = result?.multiple_drivers || {};

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <DollarSign className="h-7 w-7 text-green-600" /> Business Valuation Engine
          </h1>
          <p className="text-gray-600">Know what your business is worth and how to make it worth more</p>
        </div>
        {step === 'results' && (
          <button onClick={() => { setStep('intro'); setForm(defaultForm); }} className="btn btn-secondary text-sm inline-flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> New Valuation
          </button>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex justify-between">{error}<button onClick={() => setError('')}><X className="h-4 w-4" /></button></div>}

      <div className="grid grid-cols-4 gap-6">
        {/* Sidebar */}
        {history.length > 0 && (
          <div className="col-span-1">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Valuation History</p>
            <div className="space-y-2">
              {(history || []).map((v: any) => (
                <button key={v.id}
                  onClick={async () => {
                    const full = await api.getValuationById(v.id);
                    setResult(full);
                    setStep('results');
                    setActiveHistoryId(v.id);
                  }}
                  className={`w-full text-left p-3 rounded-xl border text-sm transition-all ${activeHistoryId === v.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <p className="font-medium text-gray-900">{v.valuation_mid ? fmt(v.valuation_mid) : 'Pending'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{new Date(v.created_at).toLocaleDateString()}</p>
                  {v.owner_dependency_score != null && (
                    <p className={`text-xs mt-1 font-medium ${v.owner_dependency_score >= 70 ? 'text-green-600' : v.owner_dependency_score >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                      Owner dependency: {v.owner_dependency_score}/100
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Main content */}
        <div className={history.length > 0 ? 'col-span-3' : 'col-span-4'}>

          {/* ── Intro ── */}
          {step === 'intro' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-slate-900 to-blue-950 rounded-2xl p-8 text-white">
                <p className="text-blue-300 text-sm font-medium uppercase tracking-widest mb-3">AI-Powered Valuation</p>
                <h2 className="text-3xl font-bold mb-3">What Is Your Business Really Worth?</h2>
                <p className="text-slate-300 text-lg mb-6">
                  Get a comprehensive valuation using 5 industry-standard methods, a brutally honest owner dependency score, and a specific roadmap to increase your multiple.
                </p>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  {[
                    { icon: '📊', label: '5-Method Valuation', desc: 'SDE, EBITDA, DCF, Revenue, Asset' },
                    { icon: '👤', label: 'Owner Dependency Score', desc: 'The #1 value killer, measured' },
                    { icon: '🚀', label: 'Growth Roadmap', desc: 'Specific steps with dollar impact' },
                  ].map(f => (
                    <div key={f.label} className="bg-white bg-opacity-10 rounded-xl p-4">
                      <p className="text-2xl mb-1">{f.icon}</p>
                      <p className="font-semibold">{f.label}</p>
                      <p className="text-sm text-slate-300">{f.desc}</p>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-slate-400 mb-4">
                  Connect your bank, payroll, and upload tax returns for the most accurate valuation — or start with manual inputs.
                </p>
                {/* Deal selector */}
                {deals.length > 0 && (
                  <div className="bg-white bg-opacity-10 rounded-xl p-4 mb-4">
                    <p className="text-sm font-semibold text-blue-200 mb-2">📂 Pre-fill from an existing deal submission</p>
                    <div className="flex gap-2">
                      <select
                        value={selectedDealId || ''}
                        onChange={e => e.target.value && prefillFromDeal(+e.target.value)}
                        className="flex-1 bg-white bg-opacity-20 border border-white border-opacity-20 rounded-lg px-3 py-2 text-white text-sm"
                      >
                        <option value="" className="text-gray-900">Select a deal to pre-fill...</option>
                        {deals.map((d: any) => (
                          <option key={d.id} value={d.id} className="text-gray-900">
                            {d.name} — {d.industry}
                          </option>
                        ))}
                      </select>
                      {prefilling && <Loader className="h-5 w-5 animate-spin text-white self-center shrink-0" />}
                    </div>
                    {selectedDealId && <p className="text-xs text-green-300 mt-1">✓ Deal data pre-filled — review and adjust below</p>}
                  </div>
                )}
                <button onClick={() => setStep('business')} className="btn bg-white text-slate-900 hover:bg-gray-100 font-semibold px-8 py-3 inline-flex items-center gap-2">
                  {selectedDealId ? 'Review Pre-filled Data' : 'Start Valuation'} <ChevronRight className="h-5 w-5" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {[
                  { icon: <Landmark className="h-6 w-6 text-blue-600" />, label: 'Bank Account', desc: 'Connect via Plaid for real revenue data', tag: 'Coming Soon' },
                  { icon: <Briefcase className="h-6 w-6 text-purple-600" />, label: 'Payroll', desc: 'Gusto, ADP, Paychex integration', tag: 'Coming Soon' },
                  { icon: <Upload className="h-6 w-6 text-green-600" />, label: 'Tax Returns', desc: 'Upload PDF returns for precise SDE', tag: 'Upload' },
                ].map(item => (
                  <div key={item.label} className="card flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">{item.icon}</div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-800">{item.label}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.tag === 'Coming Soon' ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>{item.tag}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Form Steps ── */}
          {['business', 'financials', 'owner', 'integrations'].includes(step) && (
            <div className="space-y-6">
              {/* Progress */}
              <div className="flex items-center gap-2">
                {STEPS.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <button onClick={() => setStep(s.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${step === s.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step === s.id ? 'bg-white text-blue-600' : 'bg-gray-300 text-gray-600'}`}>{i + 1}</span>
                      {s.label}
                    </button>
                    {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-gray-300" />}
                  </div>
                ))}
              </div>

              {/* Business step */}
              {step === 'business' && (
                <div className="card space-y-4">
                  <h2 className="font-semibold text-gray-800 flex items-center gap-2"><Building2 className="h-5 w-5 text-blue-600" />Tell Us About Your Business</h2>
                  <div>
                    <label className="label">What does your business do? *</label>
                    <p className="text-xs text-gray-400 mb-1">Be specific — this helps Claude understand your customers, revenue model, and competitive position</p>
                    <textarea value={form.business_description} onChange={e => f('business_description', e.target.value)}
                      className="input w-full min-h-24 resize-y"
                      placeholder="e.g. We're a residential HVAC service company in Charlotte, NC. We do installations, repairs, and maintenance. About 60% of revenue is service contracts (recurring), 40% is new installations. Our average job is $2,400. We have 3 service vans and serve mostly homeowners in the $300K-$800K home range..." />
                  </div>
                  <div>
                    <label className="label">Industry *</label>
                    <select value={form.industry} onChange={e => f('industry', e.target.value)} className="input w-full">
                      <option value="">Select industry...</option>
                      {INDUSTRIES.map(ind => <option key={ind} value={ind}>{ind}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <Input label="Years in Business" field="years_in_business" placeholder="8" />
                    <Input label="Number of Employees" field="num_employees" placeholder="12" />
                    <Input label="Revenue Growth YoY (%)" field="growth_rate_pct" placeholder="15" />
                  </div>
                  <div>
                    <label className="label">Key Customers / Customer Base</label>
                    <textarea value={form.key_customers} onChange={e => f('key_customers', e.target.value)}
                      className="input w-full min-h-16 resize-y text-sm"
                      placeholder="e.g. Primarily residential homeowners. Largest customer is a property management company accounting for ~25% of revenue. No other customer over 10%." />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Top Customer Concentration (%)" field="customer_concentration_pct" placeholder="25" hint="% of revenue from your single largest customer" />
                    <Input label="Recurring Revenue (%)" field="recurring_revenue_pct" placeholder="60" hint="% from contracts, subscriptions, or repeat customers" />
                  </div>
                  <button onClick={() => setStep('financials')} className="btn btn-primary w-full">Continue to Financials →</button>
                </div>
              )}

              {/* Financials step */}
              {step === 'financials' && (
                <div className="card space-y-4">
                  <h2 className="font-semibold text-gray-800 flex items-center gap-2"><BarChart3 className="h-5 w-5 text-green-600" />Financial Information</h2>
                  <p className="text-sm text-gray-500">Use your most recent full year of financials. The more accurate these are, the better the valuation.</p>

                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800">
                    <strong>SDE (Seller's Discretionary Earnings)</strong> is the primary valuation metric for small businesses. It equals: EBITDA + Owner Compensation + Owner Benefits + One-Time Expenses. We'll calculate it for you.
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Annual Revenue *" field="annual_revenue" prefix="$" placeholder="2,400,000" />
                    <Input label="Gross Profit" field="gross_profit" prefix="$" placeholder="1,440,000" hint="Revenue minus cost of goods sold" />
                    <Input label="EBITDA" field="ebitda" prefix="$" placeholder="480,000" hint="Earnings before interest, taxes, depreciation, amortization" />
                    <Input label="Owner's Total Compensation" field="owner_compensation" prefix="$" placeholder="120,000" hint="Salary + distributions you took from the business" />
                    <Input label="Owner Benefits & Perks" field="owner_benefits" prefix="$" placeholder="24,000" hint="Health insurance, vehicle, phone, travel paid by business" />
                    <Input label="One-Time / Non-Recurring Expenses" field="one_time_expenses" prefix="$" placeholder="35,000" hint="Expenses that won't recur (legal fees, equipment repair, etc.)" />
                  </div>

                  {n(form.ebitda) > 0 && n(form.owner_compensation) > 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                      <p className="text-sm font-semibold text-green-800">Estimated SDE</p>
                      <p className="text-2xl font-bold text-green-700">
                        {fmt(n(form.ebitda) + n(form.owner_compensation) + n(form.owner_benefits) + n(form.one_time_expenses))}
                      </p>
                      <p className="text-xs text-green-600 mt-0.5">EBITDA + Owner Comp + Benefits + One-Time = SDE</p>
                    </div>
                  )}

                  <p className="text-sm font-semibold text-gray-700 pt-2">Assets & Liabilities (optional but improves accuracy)</p>
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Inventory Value" field="inventory_value" prefix="$" placeholder="0" />
                    <Input label="Equipment Value" field="equipment_value" prefix="$" placeholder="180,000" />
                    <Input label="Real Estate Value" field="real_estate_value" prefix="$" placeholder="0" hint="Only if owned by the business" />
                    <Input label="Total Business Debt" field="total_debt" prefix="$" placeholder="250,000" />
                    <Input label="Cash on Hand" field="cash_on_hand" prefix="$" placeholder="85,000" />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setStep('business')} className="btn btn-secondary flex-1">← Back</button>
                    <button onClick={() => setStep('owner')} className="btn btn-primary flex-1">Continue to Owner Profile →</button>
                  </div>
                </div>
              )}

              {/* Owner step */}
              {step === 'owner' && (
                <div className="card space-y-4">
                  <h2 className="font-semibold text-gray-800 flex items-center gap-2"><Users className="h-5 w-5 text-purple-600" />Owner & Operations Profile</h2>
                  <p className="text-sm text-gray-500">Owner dependency is the #1 factor buyers look at. Be honest here — it determines your multiple more than any other single factor.</p>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">How many hours/week do you work in the business?</label>
                      <select value={form.owner_hours_per_week} onChange={e => f('owner_hours_per_week', e.target.value)} className="input w-full">
                        {[['<10', '10 hours or less'], ['20', '~20 hours'], ['30', '~30 hours'], ['40', '40 hours (full time)'], ['50', '50+ hours'], ['60', '60+ hours'], ['70', '70+ hours (all-in)']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="label">What is your role in the business day-to-day?</label>
                    <p className="text-xs text-gray-400 mb-1">Be honest — what would stop running without you?</p>
                    <textarea value={form.owner_role_description} onChange={e => f('owner_role_description', e.target.value)}
                      className="input w-full min-h-20 resize-y text-sm"
                      placeholder="e.g. I handle all sales and customer relationships. My manager runs day-to-day operations, but all new clients come through me. I also do all the bookkeeping and payroll. The business could probably run without me for 2 weeks max." />
                  </div>

                  <div className="space-y-3">
                    <Toggle label="We have written processes / SOPs" field="has_written_processes"
                      hint="Documented how-tos for key business functions (hiring, service delivery, customer onboarding)" />
                    <Toggle label="We have a management team that can run the business without me" field="has_management_team"
                      hint="At least one manager who handles operations, customer issues, and team management" />
                  </div>

                  {n(form.owner_hours_per_week) > 45 && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                      <p className="text-sm font-semibold text-red-800 flex items-center gap-2"><AlertTriangle className="h-4 w-4" />High Owner Dependency Warning</p>
                      <p className="text-sm text-red-700 mt-1">Working {form.owner_hours_per_week}+ hours/week is a major value detractor. Buyers see this as a job, not a business. This is probably reducing your multiple by 0.5–1.5x. We'll show you how to fix it.</p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button onClick={() => setStep('financials')} className="btn btn-secondary flex-1">← Back</button>
                    <button onClick={() => setStep('integrations')} className="btn btn-primary flex-1">Continue →</button>
                  </div>
                </div>
              )}

              {/* Integrations step */}
              {step === 'integrations' && (
                <div className="card space-y-4">
                  <h2 className="font-semibold text-gray-800 flex items-center gap-2"><Link className="h-5 w-5 text-blue-600" />Connect Your Data</h2>
                  <p className="text-sm text-gray-500">Connecting real data significantly improves valuation accuracy. All optional — you can always run with manual inputs.</p>

                  <div className="space-y-3">
                    {/* Bank account */}
                    <div className={`border-2 rounded-2xl p-4 transition-all ${form.has_bank_connection ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center"><Landmark className="h-5 w-5 text-blue-600" /></div>
                          <div>
                            <p className="font-semibold text-gray-800">Bank Account</p>
                            <p className="text-xs text-gray-500">Connect via Plaid for real revenue and cash flow data</p>
                          </div>
                        </div>
                        {form.has_bank_connection ? (
                          <span className="text-sm text-green-700 font-medium flex items-center gap-1"><CheckCircle className="h-4 w-4" />Connected</span>
                        ) : (
                          <button onClick={() => { f('has_bank_connection', true); f('bank_provider', 'Plaid'); }}
                            className="btn btn-secondary text-sm">Connect Bank</button>
                        )}
                      </div>
                      {form.has_bank_connection && <p className="text-xs text-green-600 mt-2">✓ Bank data will be included in your valuation</p>}
                    </div>

                    {/* Payroll */}
                    <div className={`border-2 rounded-2xl p-4 transition-all ${form.has_payroll_connection ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center"><Briefcase className="h-5 w-5 text-purple-600" /></div>
                          <div>
                            <p className="font-semibold text-gray-800">Payroll</p>
                            <p className="text-xs text-gray-500">Gusto, ADP, Paychex, QuickBooks Payroll</p>
                          </div>
                        </div>
                        {form.has_payroll_connection ? (
                          <span className="text-sm text-green-700 font-medium flex items-center gap-1"><CheckCircle className="h-4 w-4" />Connected</span>
                        ) : (
                          <div className="flex gap-2">
                            {['Gusto', 'ADP', 'Paychex'].map(p => (
                              <button key={p} onClick={() => { f('has_payroll_connection', true); f('payroll_provider', p); }}
                                className="btn btn-secondary text-xs px-2 py-1">{p}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Tax returns */}
                    <div className={`border-2 rounded-2xl p-4 transition-all ${form.has_tax_returns ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center"><FileText className="h-5 w-5 text-green-600" /></div>
                          <div>
                            <p className="font-semibold text-gray-800">Tax Returns</p>
                            <p className="text-xs text-gray-500">Upload 2-3 years of business tax returns for most accurate SDE</p>
                          </div>
                        </div>
                        {!form.has_tax_returns ? (
                          <button onClick={() => { f('has_tax_returns', true); f('tax_return_years', [2022, 2023, 2024]); }}
                            className="btn btn-secondary text-sm inline-flex items-center gap-1"><Upload className="h-4 w-4" />Upload</button>
                        ) : (
                          <span className="text-sm text-green-700 font-medium flex items-center gap-1"><CheckCircle className="h-4 w-4" />Uploaded</span>
                        )}
                      </div>
                      {form.has_tax_returns && (
                        <div className="flex gap-2 mt-2">
                          {[2022, 2023, 2024].map(yr => (
                            <span key={yr} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">{yr}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <AIDisclaimer type="valuation" compact />

                  <div className="flex gap-3">
                    <button onClick={() => setStep('owner')} className="btn btn-secondary flex-1">← Back</button>
                    <button onClick={runValuation} disabled={running} className="btn btn-primary flex-1 inline-flex items-center justify-center gap-2 py-3">
                      {running ? <><Loader className="h-5 w-5 animate-spin" />Valuating your business...</> : <><Sparkles className="h-5 w-5" />Run Valuation</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Results ── */}
          {step === 'results' && result && (
            <div className="space-y-5">

              {/* Hero valuation card */}
              <div className="bg-gradient-to-br from-slate-900 to-blue-950 rounded-2xl p-6 text-white">
                <p className="text-blue-300 text-xs font-bold uppercase tracking-widest mb-2">AI Business Valuation</p>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-5xl font-bold">{fmt(vs.valuation_mid)}</p>
                    <p className="text-slate-400 mt-1">Range: {fmt(vs.valuation_low)} – {fmt(vs.valuation_high)}</p>
                    <p className="text-sm text-slate-300 mt-2">{vs.implied_multiple_mid?.toFixed(2)}x SDE · {fmt(vs.sde)} SDE</p>
                  </div>
                  <div className="text-center">
                    <div className={`text-4xl font-bold ${(od.score || 0) >= 70 ? 'text-green-400' : (od.score || 0) >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {od.score || 0}
                    </div>
                    <p className="text-xs text-slate-400">Owner Dependency</p>
                    <div className={`mt-1 text-xs font-bold px-2 py-0.5 rounded-full ${OD_GRADE_STYLE[od.grade] || OD_GRADE_STYLE.C}`}>{od.grade}</div>
                  </div>
                </div>
                {result.executive_summary && (
                  <p className="text-sm text-slate-300 leading-relaxed border-t border-slate-700 pt-3">{result.executive_summary}</p>
                )}
              </div>

              {/* SDE calculation */}
              {vs.sde_calculation && (
                <div className="card">
                  <p className="text-xs font-bold text-gray-500 uppercase mb-2">How Your SDE Was Calculated</p>
                  <p className="text-sm text-gray-700 font-mono bg-gray-50 rounded-lg p-3">{vs.sde_calculation}</p>
                </div>
              )}

              {/* Valuation methods */}
              {methods.length > 0 && (
                <div className="card">
                  <h3 className="font-semibold text-gray-800 mb-3">Valuation Methods</h3>
                  <div className="space-y-2">
                    {(methods || []).map((m: any, i: number) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-700 w-48">{m.method}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div className="h-2 rounded-full bg-blue-500 transition-all" style={{ width: `${(m.weight || 0) * 100}%` }} />
                        </div>
                        <span className="text-sm font-bold text-gray-900 w-24 text-right">{fmt(m.value)}</span>
                        <span className="text-xs text-gray-400 w-12 text-right">{((m.weight || 0) * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Primary: {vs.primary_method}</p>
                </div>
              )}

              {/* Owner dependency deep dive */}
              <div className={`card border-2 ${OD_GRADE_STYLE[od.grade] || ''}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">Owner Dependency Score</h3>
                    <p className="text-sm text-gray-600 mt-0.5">{od.headline}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-4xl font-bold">{od.score || 0}/100</p>
                    <p className="text-xs text-gray-500">Grade: {od.grade}</p>
                  </div>
                </div>

                <div className="mb-3">
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div className="h-3 rounded-full transition-all" style={{
                      width: `${od.score || 0}%`,
                      backgroundColor: (od.score || 0) >= 70 ? '#16a34a' : (od.score || 0) >= 50 ? '#ca8a04' : '#dc2626'
                    }} />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>0 — Can't sell</span>
                    <span>50 — Sellable</span>
                    <span>100 — Premium</span>
                  </div>
                </div>

                {(od.risk_factors || []).length > 0 && (
                  <div className="space-y-2 mb-3">
                    {(od.risk_factors || []).map((rf: any, i: number) => (
                      <div key={i} className={`p-2 rounded-lg text-sm ${rf.severity === 'high' ? 'bg-red-50' : rf.severity === 'medium' ? 'bg-yellow-50' : 'bg-gray-50'}`}>
                        <p className="font-medium">{rf.factor}</p>
                        <p className="text-xs text-gray-600 mt-0.5">{rf.impact}</p>
                      </div>
                    ))}
                  </div>
                )}

                {(od.buyer_concerns || []).length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs font-bold text-gray-600 uppercase mb-1">What buyers will say</p>
                    {(od.buyer_concerns || []).map((c: string, i: number) => (
                      <p key={i} className="text-sm text-gray-700 flex gap-2 mb-1"><span className="text-red-400">›</span>{c}</p>
                    ))}
                  </div>
                )}
              </div>

              {/* Multiple drivers */}
              {(drivers.expanders_present?.length > 0 || drivers.killers_present?.length > 0) && (
                <div className="grid grid-cols-2 gap-4">
                  {drivers.expanders_present?.length > 0 && (
                    <div className="card bg-green-50 border-green-200">
                      <p className="text-sm font-bold text-green-800 mb-2">✓ Multiple Expanders</p>
                      {(drivers.expanders_present || []).map((e: any, i: number) => (
                        <div key={i} className="mb-2">
                          <p className="text-sm font-medium text-green-800">{e.factor}</p>
                          <p className="text-xs text-green-700">{e.value_added} · {e.explanation}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {drivers.killers_present?.length > 0 && (
                    <div className="card bg-red-50 border-red-200">
                      <p className="text-sm font-bold text-red-800 mb-2">✗ Multiple Killers</p>
                      {(drivers.killers_present || []).map((k: any, i: number) => (
                        <div key={i} className="mb-2">
                          <p className="text-sm font-medium text-red-800">{k.factor}</p>
                          <p className="text-xs text-red-700">{k.value_lost} · {k.explanation}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Improvement roadmap */}
              {roadmap.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2"><Target className="h-5 w-5 text-blue-600" />Your Value Growth Roadmap</h3>
                  <div className="space-y-3">
                    {(roadmap || []).map((item: any, i: number) => {
                      const isExp = expandedRoadmap === i;
                      return (
                        <div key={i} className="card overflow-hidden">
                          <button className="w-full flex items-start justify-between text-left"
                            onClick={() => setExpandedRoadmap(isExp ? null : i)}>
                            <div className="flex items-start gap-3 flex-1">
                              <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center shrink-0">{item.rank}</div>
                              <div>
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="text-sm">{CATEGORY_ICON[item.category] || '📌'}</span>
                                  <p className="font-semibold text-gray-900">{item.action}</p>
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${EFFORT_STYLE[item.effort] || ''}`}>{item.effort} effort</span>
                                </div>
                                <p className="text-sm text-green-700 font-medium">{item.multiple_impact} · {fmt(item.value_impact_dollars)} value increase</p>
                                {!isExp && <p className="text-xs text-gray-400 mt-0.5">{item.current_state}</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-3">
                              <span className="text-xs text-gray-400">{item.time_to_impact}</span>
                              {isExp ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                            </div>
                          </button>

                          {isExp && (
                            <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <div className="bg-gray-50 rounded-lg p-2"><p className="text-xs text-gray-400">Now</p><p className="font-medium">{item.current_state}</p></div>
                                <div className="bg-green-50 rounded-lg p-2"><p className="text-xs text-gray-400">Target</p><p className="font-medium text-green-700">{item.target_state}</p></div>
                              </div>
                              {Array.isArray(item.specific_steps) && item.specific_steps.length > 0 && (
                                <div>
                                  <p className="text-xs font-bold text-gray-500 uppercase mb-2">How to do it</p>
                                  {item.specific_steps.map((s: string, si: number) => (
                                    <p key={si} className="text-sm text-gray-700 flex gap-2 mb-1"><span className="font-bold text-blue-600 shrink-0">{si + 1}.</span>{s}</p>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Value projections */}
              {proj.current_value && (
                <div className="card bg-gradient-to-r from-green-900 to-green-800 text-white">
                  <p className="text-xs text-green-300 uppercase tracking-widest font-bold mb-3">Value Trajectory (If You Execute)</p>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="bg-white bg-opacity-10 rounded-xl p-3 text-center">
                      <p className="text-xs text-green-300 mb-1">Today</p>
                      <p className="text-xl font-bold">{fmt(proj.current_value)}</p>
                    </div>
                    {['12_month', '24_month', '36_month'].map((k, i) => (
                      <div key={k} className="bg-white bg-opacity-10 rounded-xl p-3 text-center">
                        <p className="text-xs text-green-300 mb-1">{[12, 24, 36][i]} Months</p>
                        <p className="text-xl font-bold">{fmt(proj[k]?.value)}</p>
                        {proj[k]?.key_action && <p className="text-xs text-green-200 mt-1">{proj[k].key_action}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Data quality */}
              {result.data_quality && (
                <div className="card bg-gray-50 border-gray-200">
                  <p className="text-sm font-semibold text-gray-700 mb-1">
                    Valuation Confidence: <span className={result.data_quality.confidence === 'high' ? 'text-green-600' : result.data_quality.confidence === 'medium' ? 'text-yellow-600' : 'text-red-600'}>{result.data_quality.confidence}</span>
                  </p>
                  {(result.data_quality.missing_data || []).length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Connect these for a better valuation:</p>
                      {(result.data_quality.missing_data || []).map((d: string, i: number) => (
                        <p key={i} className="text-xs text-gray-600 flex gap-1"><ArrowUpRight className="h-3 w-3 text-blue-400 shrink-0 mt-0.5" />{d}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <AIDisclaimer type="valuation" compact />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
