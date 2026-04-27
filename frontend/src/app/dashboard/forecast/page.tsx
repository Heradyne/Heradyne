'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { TrendingUp, Plus, Loader, RefreshCw, X, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, DollarSign, Users, Clock, Target, BarChart3, Sparkles, ArrowRight, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { AIDisclaimer } from '@/components/ai-disclaimer';

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
const fmtK = (n: number) => n >= 1000000 ? `$${(n/1000000).toFixed(1)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}K` : fmt(n);

const DECISION_TYPES = [
  { value: 'HIRE_MANAGER', label: '👤 Hire a Manager', desc: 'Reduce owner hours, enable growth', defaultTimeline: 6, defaultInvestment: 0, defaultMonthlyCost: 10000 },
  { value: 'ADD_SERVICE_LINE', label: '🆕 Add Service/Product Line', desc: 'New revenue stream', defaultTimeline: 9, defaultInvestment: 25000, defaultMonthlyCost: 3000 },
  { value: 'RAISE_PRICES', label: '💰 Raise Prices', desc: 'Improve margins', defaultTimeline: 1, defaultInvestment: 0, defaultMonthlyCost: 0 },
  { value: 'ADD_RECURRING', label: '🔄 Add Recurring Revenue', desc: 'Subscriptions, contracts, retainers', defaultTimeline: 12, defaultInvestment: 10000, defaultMonthlyCost: 2000 },
  { value: 'REDUCE_CUSTOMER_CONCENTRATION', label: '🤝 Diversify Customers', desc: 'Reduce top customer dependence', defaultTimeline: 18, defaultInvestment: 15000, defaultMonthlyCost: 5000 },
  { value: 'HIRE_SALES', label: '📣 Hire Sales Person', desc: 'Accelerate revenue growth', defaultTimeline: 12, defaultInvestment: 0, defaultMonthlyCost: 7500 },
  { value: 'DOCUMENT_PROCESSES', label: '📋 Document Processes/SOPs', desc: 'Reduce owner dependency', defaultTimeline: 3, defaultInvestment: 5000, defaultMonthlyCost: 0 },
  { value: 'CUT_COST_CENTER', label: '✂️ Cut a Cost Center', desc: 'Improve EBITDA margin', defaultTimeline: 1, defaultInvestment: 0, defaultMonthlyCost: 0 },
  { value: 'REDUCE_OWNER_HOURS', label: '⏰ Reduce Owner Hours', desc: 'Work less, increase value', defaultTimeline: 6, defaultInvestment: 20000, defaultMonthlyCost: 5000 },
  { value: 'ACQUIRE_BUSINESS', label: '🏢 Acquire Another Business', desc: 'Buy revenue and customers', defaultTimeline: 12, defaultInvestment: 250000, defaultMonthlyCost: 0 },
];

const SCENARIO_COLORS = {
  conservative: '#f59e0b',
  base: '#3b82f6',
  aggressive: '#10b981',
};

const METRIC_OPTIONS = [
  { value: 'revenue', label: 'Revenue', format: fmtK },
  { value: 'ebitda', label: 'EBITDA', format: fmtK },
  { value: 'business_value', label: 'Business Value', format: fmtK },
  { value: 'owner_hours', label: 'Owner Hours/Week', format: (n: number) => `${n}h` },
  { value: 'owner_dependency_score', label: 'Owner Dependency Score', format: (n: number) => `${n}/100` },
  { value: 'customer_concentration_pct', label: 'Customer Concentration', format: (n: number) => `${n?.toFixed(0)}%` },
  { value: 'recurring_revenue_pct', label: 'Recurring Revenue', format: (n: number) => `${n?.toFixed(0)}%` },
  { value: 'cash_position', label: 'Cash Position', format: fmtK },
];

export default function ForecastPage() {
  const [latestVal, setLatestVal] = useState<any>(null);
  const [deals, setDeals] = useState<any[]>([]);
  const [mounted, setMounted] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [decisions, setDecisions] = useState<any[]>([]);
  const [showDecisionForm, setShowDecisionForm] = useState(false);
  const [newDecision, setNewDecision] = useState<any>({ type: '', description: '', timeline_months: 12, investment_required: 0, revenue_impact_pct: 0, cost_impact: 0 });
  const [forecast, setForecast] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [activeScenario, setActiveScenario] = useState<'conservative' | 'base' | 'aggressive'>('base');
  const [activeMetric, setActiveMetric] = useState('business_value');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [expandedDecision, setExpandedDecision] = useState<number | null>(null);
  const [customInputs, setCustomInputs] = useState<any>({});
  const [showCustomInputs, setShowCustomInputs] = useState(false);

  useEffect(() => {
    setMounted(true);
    loadData();
    loadDeals();
  }, []);

  const loadDeals = async () => {
    try {
      const data = await api.getDeals();
      setDeals((data || []).filter((d: any) => d.status !== 'draft'));
    } catch { /* silent */ }
  };

  const selectDeal = async (dealId: number) => {
    try {
      const data = await api.prefillValuationFromDeal(dealId);
      setSelectedDeal(data);
    } catch { /* silent */ }
  };

  const loadData = async () => {
    try {
      const [val, hist] = await Promise.all([
        api.getLatestValuation().catch(() => null),
        api.getForecastHistory().catch(() => ({ forecasts: [] })),
      ]);
      if (val?.exists) setLatestVal(val);
      setHistory(hist.forecasts || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  const addDecision = () => {
    if (!newDecision.type) return;
    const template = DECISION_TYPES.find(d => d.value === newDecision.type);
    const decision = {
      ...newDecision,
      description: newDecision.description || template?.desc || '',
      timeline_months: newDecision.timeline_months || template?.defaultTimeline || 12,
      investment_required: newDecision.investment_required || template?.defaultInvestment || 0,
      cost_impact: newDecision.cost_impact || template?.defaultMonthlyCost || 0,
    };
    setDecisions([...decisions, decision]);
    setNewDecision({ type: '', description: '', timeline_months: 12, investment_required: 0, revenue_impact_pct: 0, cost_impact: 0 });
    setShowDecisionForm(false);
  };

  const removeDecision = (i: number) => setDecisions(decisions.filter((_, idx) => idx !== i));

  const runForecast = async () => {
    setRunning(true);
    setError('');
    try {
      const vs = latestVal?.valuation_summary || {};
      const dealPrefill = selectedDeal?.prefilled || {};
      const dealRpt = selectedDeal?.risk_report || {};
      const inputs = latestVal?.inputs || {};
      const od = latestVal?.owner_dependency || {};

      const payload = {
        business_description: dealPrefill.business_description || inputs.business_description || customInputs.business_description || 'Small business',
        industry: dealPrefill.industry || inputs.industry || customInputs.industry || 'Services',
        annual_revenue: dealPrefill.annual_revenue || inputs.annual_revenue || customInputs.annual_revenue || 0,
        ebitda: dealPrefill.ebitda || inputs.ebitda || customInputs.ebitda || 0,
        sde: dealPrefill.normalized_sde || dealRpt.normalized_sde || vs.sde || customInputs.sde || 0,
        current_value: dealRpt.equity_value_mid || vs.valuation_mid || customInputs.current_value || 0,
        owner_hours_per_week: inputs.owner_hours_per_week || customInputs.owner_hours || 40,
        num_employees: inputs.num_employees || customInputs.num_employees || 0,
        customer_concentration_pct: inputs.customer_concentration_pct || customInputs.customer_concentration_pct || 0,
        recurring_revenue_pct: inputs.recurring_revenue_pct || customInputs.recurring_revenue_pct || 0,
        owner_dependency_score: od.score || customInputs.owner_dependency_score || 50,
        current_multiple: vs.implied_multiple_mid || customInputs.current_multiple || 2.5,
        cash_on_hand: inputs.cash_on_hand || customInputs.cash_on_hand || 0,
        growth_rate_pct: inputs.growth_rate_pct || customInputs.growth_rate_pct || 0,
        decisions,
        valuation_id: latestVal?.valuation_id,
      };

      const result = await api.runForecast(payload);
      setForecast(result);
      await loadData();
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Forecast failed. Please try again.');
    } finally {
      setRunning(false);
    }
  };

  const scenarioData = forecast?.scenarios?.[activeScenario];
  const monthly = (scenarioData?.monthly_data || []) as any[];
  const metric = METRIC_OPTIONS.find(m => m.value === activeMetric);

  // Build sparkline data for the chart
  const chartData = monthly.map((m: any, i: number) => ({
    month: i + 1,
    value: m[activeMetric] || 0,
    event: m.key_event,
  }));
  const maxVal = Math.max(...chartData.map(d => d.value), 1);
  const minVal = Math.min(...chartData.map(d => d.value), 0);

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="h-8 w-8 animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-blue-600" /> Business Forecaster
          </h1>
          <p className="text-gray-600">Model the financial impact of your decisions before you make them</p>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex justify-between">{error}<button onClick={() => setError('')}><X className="h-4 w-4" /></button></div>}

      <div className="grid grid-cols-4 gap-6">
        {/* Left panel — decision builder */}
        <div className="col-span-1 space-y-4">

          {/* Current state */}
          {latestVal?.exists ? (
            <div className="card bg-slate-800 text-white">
              <p className="text-xs text-slate-400 uppercase font-bold mb-2">Starting Point</p>
              <p className="text-xl font-bold">{fmtK(latestVal.valuation_summary?.valuation_mid || 0)}</p>
              <p className="text-slate-300 text-xs mt-0.5">{latestVal.inputs?.industry}</p>
              <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                <div><p className="text-slate-400">Revenue</p><p className="font-medium">{fmtK(latestVal.inputs?.annual_revenue || 0)}</p></div>
                <div><p className="text-slate-400">Owner hrs</p><p className="font-medium">{latestVal.inputs?.owner_hours_per_week}h/wk</p></div>
              </div>
            </div>
          ) : (
            <div className="card border-yellow-300 bg-yellow-50">
              <p className="text-sm font-medium text-yellow-800">No valuation yet</p>
              <p className="text-xs text-yellow-700 mt-1">Run a valuation first for the most accurate forecast, or enter figures manually below.</p>
              <button onClick={() => setShowCustomInputs(!showCustomInputs)} className="text-xs text-blue-600 underline mt-1">Enter manually</button>
            </div>
          )}

          {/* Manual inputs if no valuation */}
          {showCustomInputs && !latestVal?.exists && (
            <div className="card space-y-2">
              <p className="text-xs font-bold text-gray-600 uppercase">Manual Inputs</p>
              {[
                { label: 'Industry', field: 'industry', type: 'text' },
                { label: 'Annual Revenue', field: 'annual_revenue', type: 'number' },
                { label: 'EBITDA', field: 'ebitda', type: 'number' },
                { label: 'SDE', field: 'sde', type: 'number' },
                { label: 'Business Value', field: 'current_value', type: 'number' },
                { label: 'Owner hrs/week', field: 'owner_hours', type: 'number' },
                { label: 'Employees', field: 'num_employees', type: 'number' },
                { label: 'Cash on Hand', field: 'cash_on_hand', type: 'number' },
                { label: 'Growth Rate %', field: 'growth_rate_pct', type: 'number' },
              ].map(inp => (
                <div key={inp.field}>
                  <label className="text-xs text-gray-500">{inp.label}</label>
                  <input type={inp.type} value={customInputs[inp.field] || ''}
                    onChange={e => setCustomInputs((p: any) => ({...p, [inp.field]: e.target.value}))}
                    className="input w-full text-sm py-1" />
                </div>
              ))}
            </div>
          )}

          {/* Deal selector */}
          {mounted && deals.length > 0 && (
            <div className="card">
              <p className="text-xs font-bold text-gray-500 uppercase mb-2">Pre-fill from Deal</p>
              <select value={selectedDeal?.deal_id || ''}
                onChange={e => e.target.value ? selectDeal(+e.target.value) : setSelectedDeal(null)}
                className="input w-full text-sm">
                <option value="">Use valuation data</option>
                {deals.map((d: any) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              {selectedDeal && (
                <p className="text-xs text-green-600 mt-1">✓ Using data from {selectedDeal.deal_name}</p>
              )}
            </div>
          )}

          {/* Decisions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-gray-500 uppercase">Decisions to Model</p>
              <button onClick={() => setShowDecisionForm(true)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>

            {decisions.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center">
                <p className="text-xs text-gray-400">Add decisions to forecast their impact</p>
                <button onClick={() => setShowDecisionForm(true)} className="text-xs text-blue-600 underline mt-1">Add your first decision</button>
              </div>
            ) : (
              <div className="space-y-2">
                {decisions.map((d, i) => {
                  const template = DECISION_TYPES.find(t => t.value === d.type);
                  return (
                    <div key={i} className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-start justify-between">
                      <div>
                        <p className="text-xs font-semibold text-gray-800">{template?.label || d.type}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{d.timeline_months}mo · {d.investment_required > 0 ? fmt(d.investment_required) + ' upfront' : 'No upfront cost'}</p>
                        {d.revenue_impact_pct > 0 && <p className="text-xs text-green-600">+{d.revenue_impact_pct}% revenue</p>}
                      </div>
                      <button onClick={() => removeDecision(i)} className="text-gray-300 hover:text-red-400 ml-2 shrink-0">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Decision form */}
          {showDecisionForm && (
            <div className="card border-blue-200 bg-blue-50 space-y-3">
              <p className="text-sm font-semibold text-gray-800">Add a Decision</p>
              <div>
                <select value={newDecision.type} onChange={e => {
                  const t = DECISION_TYPES.find(d => d.value === e.target.value);
                  setNewDecision({
                    ...newDecision, type: e.target.value,
                    description: t?.desc || '',
                    timeline_months: t?.defaultTimeline || 12,
                    investment_required: t?.defaultInvestment || 0,
                    cost_impact: t?.defaultMonthlyCost || 0,
                  });
                }} className="input w-full text-sm">
                  <option value="">Select decision type...</option>
                  {DECISION_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              {newDecision.type && (
                <>
                  <div>
                    <label className="text-xs text-gray-500">Description (optional)</label>
                    <input value={newDecision.description} onChange={e => setNewDecision({...newDecision, description: e.target.value})}
                      className="input w-full text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500">Timeline (months)</label>
                      <input type="number" value={newDecision.timeline_months} onChange={e => setNewDecision({...newDecision, timeline_months: +e.target.value})} className="input w-full text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Upfront Investment ($)</label>
                      <input type="number" value={newDecision.investment_required} onChange={e => setNewDecision({...newDecision, investment_required: +e.target.value})} className="input w-full text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Revenue Impact (%)</label>
                      <input type="number" value={newDecision.revenue_impact_pct} onChange={e => setNewDecision({...newDecision, revenue_impact_pct: +e.target.value})} className="input w-full text-sm" placeholder="+15" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Monthly Cost ($)</label>
                      <input type="number" value={newDecision.cost_impact} onChange={e => setNewDecision({...newDecision, cost_impact: +e.target.value})} className="input w-full text-sm" />
                    </div>
                  </div>
                </>
              )}
              <div className="flex gap-2">
                <button onClick={addDecision} disabled={!newDecision.type} className="btn btn-primary text-sm flex-1">Add</button>
                <button onClick={() => setShowDecisionForm(false)} className="btn btn-secondary text-sm">Cancel</button>
              </div>
            </div>
          )}

          {/* Run button */}
          <button onClick={runForecast} disabled={running}
            className="btn btn-primary w-full py-3 inline-flex items-center justify-center gap-2">
            {running ? <><Loader className="h-4 w-4 animate-spin" />Running forecast...</> : <><Sparkles className="h-4 w-4" />Run {decisions.length > 0 ? `${decisions.length}-Decision` : 'Baseline'} Forecast</>}
          </button>

          {/* History */}
          {history.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase mb-2">Past Forecasts</p>
              {(history || []).slice(0, 5).map((h: any) => (
                <button key={h.id}
                  onClick={async () => { const f = await api.getForecastById(h.id); setForecast(f); }}
                  className="w-full text-left p-2 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-200 mb-1">
                  <p className="text-xs font-medium text-gray-700">{h.decision_count} decision{h.decision_count !== 1 ? 's' : ''}</p>
                  <p className="text-xs text-gray-400">{new Date(h.created_at).toLocaleDateString()}</p>
                  {h.key_insight && <p className="text-xs text-blue-600 mt-0.5 truncate">{h.key_insight}</p>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right panel — results */}
        <div className="col-span-3">
          {!forecast ? (
            <div className="card text-center py-16 border-dashed">
              <BarChart3 className="h-16 w-16 text-gray-200 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-800 mb-2">Model Your Decisions</h2>
              <p className="text-gray-500 max-w-md mx-auto mb-6">
                Add the decisions you're considering — hiring a manager, adding a service line, raising prices — and see exactly how they'll affect your revenue, EBITDA, owner hours, and business value over 36 months.
              </p>
              <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto text-left">
                {[
                  { icon: '📊', label: 'See the J-curve', desc: 'Know when costs hit before revenue grows' },
                  { icon: '🔀', label: '3 Scenarios', desc: 'Conservative, base, and aggressive' },
                  { icon: '💰', label: 'ROI Calculator', desc: 'Break-even month and 36-month return' },
                ].map(f => (
                  <div key={f.label} className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-2xl mb-1">{f.icon}</p>
                    <p className="text-sm font-semibold text-gray-700">{f.label}</p>
                    <p className="text-xs text-gray-400">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5">

              {/* Key insight */}
              {forecast.forecast_summary?.key_insight && (
                <div className="bg-blue-600 rounded-2xl p-4 text-white">
                  <p className="text-xs font-bold uppercase tracking-wider text-blue-200 mb-1">Key Insight</p>
                  <p className="font-semibold leading-relaxed">{forecast.forecast_summary.key_insight}</p>
                  {forecast.forecast_summary.recommended_sequence && (
                    <p className="text-sm text-blue-200 mt-2">Recommended order: {forecast.forecast_summary.recommended_sequence}</p>
                  )}
                </div>
              )}

              {/* Scenario switcher + metric selector */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex gap-2">
                    {(['conservative', 'base', 'aggressive'] as const).map(s => (
                      <button key={s} onClick={() => setActiveScenario(s)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-all border ${activeScenario === s ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200'}`}
                        style={activeScenario === s ? { backgroundColor: SCENARIO_COLORS[s] } : {}}>
                        {s}
                      </button>
                    ))}
                  </div>
                  <select value={activeMetric} onChange={e => setActiveMetric(e.target.value)} className="input text-sm py-1 w-48">
                    {METRIC_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>

                {/* Chart */}
                {chartData.length > 0 && (
                  <div className="relative h-48 w-full">
                    <svg viewBox={`0 0 ${chartData.length * 10} 100`} preserveAspectRatio="none" className="w-full h-full">
                      {/* Grid lines */}
                      {[0, 25, 50, 75, 100].map(y => (
                        <line key={y} x1="0" y1={y} x2={chartData.length * 10} y2={y}
                          stroke="#f3f4f6" strokeWidth="0.5" />
                      ))}
                      {/* Line */}
                      <polyline
                        points={chartData.map((d, i) => {
                          const x = i * 10 + 5;
                          const y = 100 - ((d.value - minVal) / (maxVal - minVal || 1)) * 90 - 5;
                          return `${x},${y}`;
                        }).join(' ')}
                        fill="none"
                        stroke={SCENARIO_COLORS[activeScenario]}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {/* Area fill */}
                      <polygon
                        points={[
                          ...chartData.map((d, i) => {
                            const x = i * 10 + 5;
                            const y = 100 - ((d.value - minVal) / (maxVal - minVal || 1)) * 90 - 5;
                            return `${x},${y}`;
                          }),
                          `${(chartData.length - 1) * 10 + 5},100`,
                          `5,100`
                        ].join(' ')}
                        fill={SCENARIO_COLORS[activeScenario]}
                        fillOpacity="0.1"
                      />
                      {/* Milestone markers */}
                      {(scenarioData?.milestones || []).map((m: any, i: number) => {
                        const x = (m.month - 1) * 10 + 5;
                        return <line key={i} x1={x} y1="0" x2={x} y2="100" stroke={SCENARIO_COLORS[activeScenario]} strokeWidth="0.5" strokeDasharray="2,2" />;
                      })}
                    </svg>
                    {/* X-axis labels */}
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>Month 1</span><span>Month 12</span><span>Month 24</span><span>Month 36</span>
                    </div>
                  </div>
                )}

                {/* Summary at 12/24/36 */}
                {scenarioData && (
                  <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-100">
                    <div className="text-center">
                      <p className="text-xs text-gray-400">Today</p>
                      <p className="font-bold text-gray-900">{metric?.format(forecast.without_decisions?.month_36_value ? latestVal?.valuation_summary?.valuation_mid || 0 : 0) || '—'}</p>
                    </div>
                    {['month_12_summary', 'month_24_summary', 'month_36_summary'].map((k, i) => (
                      <div key={k} className="text-center">
                        <p className="text-xs text-gray-400">Month {[12, 24, 36][i]}</p>
                        <p className="font-bold" style={{ color: SCENARIO_COLORS[activeScenario] }}>
                          {metric?.format(scenarioData[k]?.[activeMetric.replace('business_value', 'value').replace('owner_dependency_score', 'owner_hours')] || 0) || '—'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Milestones timeline */}
              {(scenarioData?.milestones || []).length > 0 && (
                <div className="card">
                  <h3 className="font-semibold text-gray-800 mb-3">Key Milestones — {activeScenario.charAt(0).toUpperCase() + activeScenario.slice(1)} Scenario</h3>
                  <div className="space-y-2">
                    {(scenarioData.milestones || []).map((m: any, i: number) => (
                      <div key={i} className="flex gap-3 items-start">
                        <div className="w-14 text-center shrink-0">
                          <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">Mo {m.month}</span>
                        </div>
                        <div className="flex-1 pb-2 border-b border-gray-50 last:border-0">
                          <p className="text-sm font-medium text-gray-800">{m.event}</p>
                          <p className="text-xs text-green-600">{m.impact}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Decision analysis */}
              {(forecast.decision_analysis || []).length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-800 mb-3">Decision Analysis</h3>
                  <div className="space-y-3">
                    {(forecast.decision_analysis || []).map((d: any, i: number) => {
                      const isExp = expandedDecision === i;
                      return (
                        <div key={i} className="card">
                          <button className="w-full flex items-start justify-between text-left"
                            onClick={() => setExpandedDecision(isExp ? null : i)}>
                            <div>
                              <p className="font-semibold text-gray-900">{d.decision}</p>
                              <div className="flex gap-3 mt-1 text-sm">
                                <span className="text-gray-500">Break-even: <strong className="text-gray-800">Month {d.break_even_month}</strong></span>
                                <span className="text-green-700 font-medium">{d.roi_36_month} ROI</span>
                                {d.j_curve && <span className="text-orange-600 text-xs">⚠ J-curve</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-3">
                              <div className="text-right">
                                {d.upfront_cost > 0 && <p className="text-xs text-gray-500">{fmt(d.upfront_cost)} upfront</p>}
                                {d.monthly_cost > 0 && <p className="text-xs text-gray-500">{fmt(d.monthly_cost)}/mo</p>}
                              </div>
                              {isExp ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                            </div>
                          </button>

                          {isExp && (
                            <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                              {(d.risks || []).length > 0 && (
                                <div>
                                  <p className="text-xs font-bold text-gray-500 uppercase mb-1">Risks</p>
                                  {(d.risks || []).map((r: string, ri: number) => (
                                    <p key={ri} className="text-sm text-orange-700 flex gap-1"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />{r}</p>
                                  ))}
                                </div>
                              )}
                              {(d.prerequisites || []).length > 0 && (
                                <div>
                                  <p className="text-xs font-bold text-gray-500 uppercase mb-1">Prerequisites</p>
                                  {(d.prerequisites || []).map((p: string, pi: number) => (
                                    <p key={pi} className="text-sm text-blue-700 flex gap-1"><CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />{p}</p>
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

              {/* Without decisions comparison */}
              {forecast.without_decisions && (
                <div className="card bg-gray-50">
                  <h3 className="font-semibold text-gray-700 mb-2">Without These Decisions (Do Nothing)</h3>
                  <div className="flex gap-6 text-sm">
                    <div>
                      <p className="text-gray-400 text-xs">36-Month Value</p>
                      <p className="font-bold text-gray-700">{fmtK(forecast.without_decisions.month_36_value || 0)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs">36-Month Revenue</p>
                      <p className="font-bold text-gray-700">{fmtK(forecast.without_decisions.month_36_revenue || 0)}</p>
                    </div>
                    {forecast.scenarios?.base?.month_36_summary?.value && (
                      <div>
                        <p className="text-gray-400 text-xs">Value Gained (Base)</p>
                        <p className="font-bold text-green-700">
                          +{fmtK((forecast.scenarios.base.month_36_summary.value || 0) - (forecast.without_decisions.month_36_value || 0))}
                        </p>
                      </div>
                    )}
                  </div>
                  {forecast.without_decisions.note && (
                    <p className="text-xs text-gray-500 mt-2 italic">{forecast.without_decisions.note}</p>
                  )}
                </div>
              )}

              {/* Cash requirements */}
              {forecast.cash_requirements?.total_investment > 0 && (
                <div className="card border-yellow-200 bg-yellow-50">
                  <h3 className="font-semibold text-yellow-800 mb-2 flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />Cash Requirements
                  </h3>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div><p className="text-yellow-600 text-xs">Total Investment</p><p className="font-bold text-yellow-900">{fmt(forecast.cash_requirements.total_investment)}</p></div>
                    <div><p className="text-yellow-600 text-xs">Peak Cash Need</p><p className="font-bold text-yellow-900">{fmt(forecast.cash_requirements.peak_cash_amount)} (Mo {forecast.cash_requirements.peak_cash_need_month})</p></div>
                  </div>
                  {(forecast.cash_requirements.funding_options || []).length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-bold text-yellow-700 mb-1">Funding Options</p>
                      {(forecast.cash_requirements.funding_options || []).map((f: string, i: number) => (
                        <p key={i} className="text-xs text-yellow-800">• {f}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Interdependencies */}
              {(forecast.interdependencies || []).length > 0 && (
                <div className="card bg-purple-50 border-purple-200">
                  <p className="text-sm font-semibold text-purple-800 mb-2">⚡ Decision Interdependencies</p>
                  {(forecast.interdependencies || []).map((item: string, i: number) => (
                    <p key={i} className="text-sm text-purple-700 flex gap-2 mb-1"><ArrowRight className="h-4 w-4 shrink-0 mt-0.5" />{item}</p>
                  ))}
                </div>
              )}

              <AIDisclaimer type="financial" compact />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
