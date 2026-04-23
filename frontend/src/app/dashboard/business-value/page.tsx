'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { TrendingUp, Target, Tag, Loader, RefreshCw, CheckCircle, AlertTriangle, X, ChevronDown, ChevronUp, DollarSign, ArrowUpRight, Sparkles, Building2, Copy, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { AIDisclaimer, DisclaimerBanner } from '@/components/ai-disclaimer';
import { formatCurrency } from '@/lib/utils';

type Tab = 'value' | 'grow' | 'sell';

const HEALTH_COLOR = (s: number) => s >= 70 ? '#15803d' : s >= 50 ? '#ca8a04' : '#dc2626';
const DIFFICULTY_STYLE: Record<string, string> = {
  easy:   'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  hard:   'bg-red-100 text-red-800',
};
const IMPORTANCE_STYLE: Record<string, string> = {
  critical: 'border-l-4 border-red-500',
  high:     'border-l-4 border-orange-400',
  medium:   'border-l-4 border-blue-400',
};

export default function BusinessValuePage() {
  const [deals, setDeals] = useState<any[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('value');
  const [snapshot, setSnapshot] = useState<any>(null);
  const [growthPlan, setGrowthPlan] = useState<any>(null);
  const [listing, setListing] = useState<any>(null);
  const [cim, setCim] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [generatingCim, setGeneratingCim] = useState(false);
  const [listingForm, setListingForm] = useState({
    asking_price: '', motivation: '', ideal_buyer: '',
    transition_period: '6', seller_financing: false, seller_financing_amount: '', is_public: false,
  });
  const [savingListing, setSavingListing] = useState(false);
  const [showListingForm, setShowListingForm] = useState(false);
  const [error, setError] = useState('');
  const [expandedOpp, setExpandedOpp] = useState<number | null>(0);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  useEffect(() => {
    api.getDeals().then(d => {
      const relevant = d.filter((x: any) => ['funded', 'matched', 'approved', 'pending_lender', 'analyzed'].includes(x.status));
      setDeals(relevant);
      if (relevant.length > 0) selectDeal(relevant[0]);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const selectDeal = async (deal: any) => {
    setSelectedDeal(deal);
    setSnapshot(null); setGrowthPlan(null); setListing(null); setCim(null);
    try {
      const [snap, plan, lst, summary] = await Promise.all([
        api.getBusinessValueSnapshot(deal.id).catch(() => null),
        api.getValueGrowthPlan(deal.id).catch(() => null),
        api.getBusinessListing(deal.id).catch(() => null),
        api.getInvestmentSummary(deal.id).catch(() => null),
      ]);
      setSnapshot(snap);
      if (plan?.exists) setGrowthPlan(plan);
      if (lst?.is_listed) {
        setListing(lst);
        setListingForm({
          asking_price: String(lst.asking_price || ''),
          motivation: lst.motivation || '',
          ideal_buyer: lst.ideal_buyer || '',
          transition_period: String(lst.transition_period || 6),
          seller_financing: lst.seller_financing || false,
          seller_financing_amount: String(lst.seller_financing_amount || ''),
          is_public: lst.is_public || false,
        });
      }
      if (summary?.exists) setCim(summary);
    } catch { setError('Failed to load business data'); }
  };

  const generateGrowthPlan = async () => {
    if (!selectedDeal) return;
    setGeneratingPlan(true);
    setError('');
    try {
      const result = await api.generateValueGrowthPlan(selectedDeal.id);
      setGrowthPlan(result);
    } catch (e: any) { setError(e.response?.data?.detail || 'Failed to generate growth plan'); }
    finally { setGeneratingPlan(false); }
  };

  const saveListing = async () => {
    if (!selectedDeal) return;
    setSavingListing(true);
    try {
      const result = await api.listBusinessForSale(selectedDeal.id, {
        asking_price: listingForm.asking_price ? parseFloat(listingForm.asking_price) : null,
        motivation: listingForm.motivation || null,
        ideal_buyer: listingForm.ideal_buyer || null,
        transition_period: parseInt(listingForm.transition_period) || 6,
        seller_financing: listingForm.seller_financing,
        seller_financing_amount: listingForm.seller_financing_amount ? parseFloat(listingForm.seller_financing_amount) : null,
        is_public: listingForm.is_public,
      });
      setListing(result);
      setShowListingForm(false);
      const snap = await api.getBusinessValueSnapshot(selectedDeal.id);
      setSnapshot(snap);
    } catch (e: any) { setError(e.response?.data?.detail || 'Failed to save listing'); }
    finally { setSavingListing(false); }
  };

  const withdrawListing = async () => {
    if (!selectedDeal) return;
    try {
      await api.withdrawBusinessListing(selectedDeal.id);
      setListing(null);
      const snap = await api.getBusinessValueSnapshot(selectedDeal.id);
      setSnapshot(snap);
    } catch { setError('Failed to withdraw listing'); }
  };

  const generateCIM = async () => {
    if (!selectedDeal) return;
    setGeneratingCim(true);
    setError('');
    try {
      const result = await api.generateInvestmentSummary(selectedDeal.id);
      setCim(result);
    } catch (e: any) { setError(e.response?.data?.detail || 'Failed to generate investment summary'); }
    finally { setGeneratingCim(false); }
  };

  const copySection = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(key);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="h-8 w-8 animate-spin" /></div>;

  const val = snapshot?.valuation || {};
  const health = snapshot?.health || {};
  const ownership = snapshot?.ownership || {};
  const financials = snapshot?.financials || {};

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <DollarSign className="h-7 w-7 text-green-600" /> Business Value
          </h1>
          <p className="text-gray-600">What your business is worth, how to grow it, and how to sell it</p>
        </div>

        {/* Deal selector */}
        {deals.length > 1 && (
          <select value={selectedDeal?.id || ''} onChange={e => {
            const d = deals.find(x => x.id === +e.target.value);
            if (d) selectDeal(d);
          }} className="input text-sm w-56">
            {deals.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex justify-between">{error}<button onClick={() => setError('')}><X className="h-4 w-4" /></button></div>}

      {!selectedDeal || !snapshot ? (
        <div className="card text-center py-16">
          <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">No valued businesses found. Get a valuation first.</p>
        </div>
      ) : (
        <>
          {/* Big value card */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 mb-6 text-white">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-slate-400 text-xs font-medium uppercase tracking-widest mb-1">{snapshot.business_name}</p>
                <p className="text-5xl font-bold">{formatCurrency(val.equity_value_mid || 0)}</p>
                <p className="text-slate-400 text-sm mt-1">
                  Range: {formatCurrency(val.equity_value_low || 0)} – {formatCurrency(val.equity_value_high || 0)}
                </p>
              </div>
              <div className="text-right">
                <div className={`text-4xl font-bold mb-1 ${(health.score || 0) >= 70 ? 'text-green-400' : (health.score || 0) >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {Math.round(health.score || 0)}
                </div>
                <p className="text-slate-400 text-xs">Health Score</p>
              </div>
            </div>

            {/* Your equity */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-700">
              <div>
                <p className="text-slate-400 text-xs mb-1">Your Equity</p>
                <p className="text-xl font-bold text-white">{formatCurrency(ownership.estimated_equity || 0)}</p>
                <p className="text-xs text-slate-400">after loan balance</p>
              </div>
              <div>
                <p className="text-slate-400 text-xs mb-1">vs. Purchase Price</p>
                <p className={`text-xl font-bold ${(ownership.value_vs_purchase || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {(ownership.value_vs_purchase || 0) >= 0 ? '+' : ''}{ownership.value_vs_purchase?.toFixed(1) || '0'}%
                </p>
                <p className="text-xs text-slate-400">change in value</p>
              </div>
              <div>
                <p className="text-slate-400 text-xs mb-1">DSCR</p>
                <p className={`text-xl font-bold ${(health.dscr || 0) >= 1.25 ? 'text-green-400' : (health.dscr || 0) >= 1.0 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {health.dscr?.toFixed(2) || 'N/A'}x
                </p>
                <p className="text-xs text-slate-400">debt coverage</p>
              </div>
            </div>

            {snapshot.listing?.is_listed && (
              <div className="mt-4 bg-green-900 bg-opacity-50 border border-green-600 rounded-xl px-4 py-2 flex items-center justify-between">
                <p className="text-sm text-green-300 font-medium">🏷️ Listed for sale at {formatCurrency(snapshot.listing.asking_price || 0)}</p>
                <span className="text-xs bg-green-700 text-green-100 px-2 py-0.5 rounded-full">Active</span>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 mb-6">
            <nav className="-mb-px flex space-x-8">
              {[
                { id: 'value', label: '📊 What It\'s Worth', },
                { id: 'grow', label: '🚀 How to Grow It', },
                { id: 'sell', label: '🏷️ Sell It', },
              ].map(t => (
                <button key={t.id} onClick={() => setTab(t.id as Tab)}
                  className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${tab === t.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {t.label}
                </button>
              ))}
            </nav>
          </div>

          {/* ── VALUE TAB ── */}
          {tab === 'value' && (
            <div className="space-y-6">
              {/* Health breakdown */}
              <div className="card">
                <h2 className="font-semibold text-gray-800 mb-4">Business Health Breakdown</h2>
                <div className="space-y-3">
                  {[
                    { label: 'Cash Flow', val: health.cashflow, desc: 'Ability to generate cash after debt service' },
                    { label: 'Stability', val: health.stability, desc: 'Consistency of revenue and operations' },
                    { label: 'Growth', val: health.growth, desc: 'Revenue and EBITDA trend direction' },
                    { label: 'Liquidity', val: health.liquidity, desc: 'Working capital and cash reserves' },
                  ].map(s => s.val != null ? (
                    <div key={s.label}>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700">{s.label}</span>
                        <span className="text-sm font-bold" style={{ color: HEALTH_COLOR(s.val) }}>{Math.round(s.val)}/100</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2.5 mb-0.5">
                        <div className="h-2.5 rounded-full transition-all" style={{ width: `${Math.min(s.val, 100)}%`, backgroundColor: HEALTH_COLOR(s.val) }} />
                      </div>
                      <p className="text-xs text-gray-400">{s.desc}</p>
                    </div>
                  ) : null)}
                </div>
              </div>

              {/* Key metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Annual Revenue', val: formatCurrency(financials.annual_revenue || 0) },
                  { label: 'EBITDA', val: `${formatCurrency(financials.ebitda || 0)} (${financials.ebitda_margin?.toFixed(1) || 0}%)` },
                  { label: 'Enterprise Value', val: formatCurrency(val.ev_mid || 0) },
                  { label: 'SDE Multiple', val: val.sde_multiple ? `${val.sde_multiple.toFixed(2)}x` : 'N/A' },
                ].map(m => (
                  <div key={m.label} className="card text-center">
                    <p className="text-lg font-bold text-gray-900">{m.val}</p>
                    <p className="text-xs text-gray-500 mt-1">{m.label}</p>
                  </div>
                ))}
              </div>

              {/* Valuation methods */}
              {val.method_weights && (
                <div className="card">
                  <h2 className="font-semibold text-gray-800 mb-3">How Your Value Was Calculated</h2>
                  <p className="text-sm text-gray-500 mb-3">Your business value is calculated using 5 methods. Each is weighted based on what's most applicable to your industry and financials.</p>
                  <div className="space-y-2">
                    {Object.entries(val.method_weights).map(([method, weight]) => (
                      <div key={method} className="flex items-center gap-3">
                        <span className="text-sm text-gray-600 w-40 capitalize">{method.replace(/_/g, ' ')}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div className="h-2 rounded-full bg-blue-500" style={{ width: `${(weight as number) * 100}%` }} />
                        </div>
                        <span className="text-sm font-medium text-gray-700 w-10 text-right">{((weight as number) * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Purchase vs current */}
              {ownership.purchase_price > 0 && (
                <div className="card bg-gradient-to-r from-blue-50 to-green-50 border-blue-200">
                  <h2 className="font-semibold text-gray-800 mb-3">Your Investment Return</h2>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-xs text-gray-500 mb-1">Paid</p>
                      <p className="text-xl font-bold text-gray-700">{formatCurrency(ownership.purchase_price)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500 mb-1">Current Value</p>
                      <p className="text-xl font-bold text-gray-900">{formatCurrency(val.equity_value_mid || 0)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500 mb-1">Change</p>
                      <p className={`text-xl font-bold ${(ownership.value_vs_purchase || 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {(ownership.value_vs_purchase || 0) >= 0 ? '+' : ''}{ownership.value_vs_purchase?.toFixed(1) || 0}%
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── GROW TAB ── */}
          {tab === 'grow' && (
            <div className="space-y-6">
              {!growthPlan && !generatingPlan && (
                <div className="card text-center py-12 border-dashed">
                  <Sparkles className="h-12 w-12 text-blue-400 mx-auto mb-3" />
                  <h3 className="font-semibold text-gray-800 mb-2">Get Your Value Growth Plan</h3>
                  <p className="text-sm text-gray-500 mb-4 max-w-sm mx-auto">
                    Claude will analyze your business and identify the top 5 highest-leverage ways to grow your equity value — with specific numbers and timelines.
                  </p>
                  <button onClick={generateGrowthPlan} className="btn btn-primary inline-flex items-center gap-2">
                    <Sparkles className="h-4 w-4" /> Generate Value Growth Plan
                  </button>
                </div>
              )}

              {generatingPlan && (
                <div className="card text-center py-12">
                  <Loader className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
                  <p className="font-medium text-gray-700">Analyzing your business...</p>
                  <p className="text-sm text-gray-400 mt-1">Identifying highest-leverage value creation opportunities</p>
                </div>
              )}

              {growthPlan && !generatingPlan && (
                <div className="space-y-4">
                  {/* Current value summary */}
                  <div className="card bg-gradient-to-r from-slate-800 to-slate-900 text-white">
                    <p className="text-xs text-slate-400 uppercase tracking-widest mb-2">Current State</p>
                    <p className="text-sm leading-relaxed">{growthPlan.current_value_summary?.primary_valuation_method}</p>
                    <p className="text-sm text-slate-300 mt-1">{growthPlan.current_value_summary?.vs_purchase_price}</p>
                  </div>

                  {/* The one thing */}
                  {growthPlan.one_thing && (
                    <div className="card bg-blue-600 text-white">
                      <p className="text-xs uppercase tracking-widest text-blue-200 mb-1">Most Important Right Now</p>
                      <p className="text-lg font-semibold">{growthPlan.one_thing}</p>
                    </div>
                  )}

                  {/* Quick wins */}
                  {growthPlan.quick_wins?.length > 0 && (
                    <div className="card bg-green-50 border-green-200">
                      <p className="text-sm font-semibold text-green-800 mb-2">⚡ Quick Wins (90 days)</p>
                      {growthPlan.quick_wins.map((w: string, i: number) => (
                        <p key={i} className="text-sm text-green-700 flex gap-2 mb-1"><CheckCircle className="h-4 w-4 shrink-0 mt-0.5 text-green-500" />{w}</p>
                      ))}
                    </div>
                  )}

                  {/* Top opportunities */}
                  {growthPlan.growth_opportunities?.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-gray-800 mb-3">Top Growth Opportunities</h3>
                      <div className="space-y-3">
                        {growthPlan.growth_opportunities.map((opp: any, i: number) => {
                          const isExp = expandedOpp === i;
                          return (
                            <div key={i} className={`card overflow-hidden ${IMPORTANCE_STYLE[opp.difficulty] || ''}`}>
                              <button className="w-full flex items-start justify-between text-left"
                                onClick={() => setExpandedOpp(isExp ? null : i)}>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">{opp.rank}</span>
                                    <p className="font-semibold text-gray-900">{opp.title}</p>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${DIFFICULTY_STYLE[opp.difficulty] || ''}`}>{opp.difficulty}</span>
                                  </div>
                                  <p className="text-sm text-green-700 font-semibold ml-8">{opp.value_impact}</p>
                                  {!isExp && <p className="text-xs text-gray-400 ml-8 mt-0.5">{opp.current_metric} → {opp.target_metric}</p>}
                                </div>
                                <div className="flex items-center gap-2 shrink-0 ml-3">
                                  <span className="text-xs text-gray-400">{opp.timeline}</span>
                                  {isExp ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                                </div>
                              </button>

                              {isExp && (
                                <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                                  <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div><p className="text-xs text-gray-500 uppercase mb-1">Current</p><p className="font-medium">{opp.current_metric}</p></div>
                                    <div><p className="text-xs text-gray-500 uppercase mb-1">Target</p><p className="font-medium text-green-700">{opp.target_metric}</p></div>
                                    <div><p className="text-xs text-gray-500 uppercase mb-1">Value Impact</p><p className="font-bold text-green-700">{opp.value_impact}</p></div>
                                    <div><p className="text-xs text-gray-500 uppercase mb-1">Investment</p><p className="font-medium">{opp.estimated_cost || 'Low'}</p></div>
                                  </div>
                                  {Array.isArray(opp.how_to_do_it) ? (
                                    <div>
                                      <p className="text-xs font-semibold text-gray-500 uppercase mb-2">How to Do It</p>
                                      {opp.how_to_do_it.map((step: string, si: number) => (
                                        <p key={si} className="text-sm text-gray-700 flex gap-2 mb-1"><span className="font-bold shrink-0 text-blue-600">{si+1}.</span>{step}</p>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-sm text-gray-700">{opp.how_to_do_it}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Upside scenario */}
                  {growthPlan.upside_scenario && (
                    <div className="card bg-gradient-to-br from-green-900 to-green-800 text-white">
                      <p className="text-xs text-green-300 uppercase tracking-widest mb-2">3-Year Upside Scenario</p>
                      <p className="text-sm text-green-200 mb-4">{growthPlan.upside_scenario.description}</p>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="text-center bg-white bg-opacity-10 rounded-xl p-3">
                          <p className="text-xs text-green-300 mb-1">Revenue</p>
                          <p className="text-lg font-bold">{formatCurrency(growthPlan.upside_scenario.projected_revenue || 0)}</p>
                        </div>
                        <div className="text-center bg-white bg-opacity-10 rounded-xl p-3">
                          <p className="text-xs text-green-300 mb-1">EBITDA</p>
                          <p className="text-lg font-bold">{formatCurrency(growthPlan.upside_scenario.projected_ebitda || 0)}</p>
                        </div>
                        <div className="text-center bg-white bg-opacity-20 rounded-xl p-3">
                          <p className="text-xs text-green-200 mb-1">Business Value</p>
                          <p className="text-2xl font-bold">{formatCurrency(growthPlan.upside_scenario.projected_value_mid || 0)}</p>
                        </div>
                      </div>
                      {growthPlan.upside_scenario.key_assumptions?.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-green-700">
                          <p className="text-xs text-green-300 mb-1">Key Assumptions</p>
                          {growthPlan.upside_scenario.key_assumptions.map((a: string, i: number) => (
                            <p key={i} className="text-xs text-green-200">• {a}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Value risks */}
                  {growthPlan.value_risks?.length > 0 && (
                    <div className="card">
                      <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-yellow-500" />Value Risks</h3>
                      {growthPlan.value_risks.map((r: any, i: number) => (
                        <div key={i} className="mb-3 pb-3 border-b border-gray-50 last:border-0">
                          <p className="text-sm font-medium text-red-700">{r.risk}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{r.current_exposure}</p>
                          <p className="text-xs text-blue-600 mt-0.5">Mitigation: {r.mitigation}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <button onClick={generateGrowthPlan} className="btn btn-secondary text-sm inline-flex items-center gap-1">
                    <RefreshCw className="h-4 w-4" /> Refresh Plan
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── SELL TAB ── */}
          {tab === 'sell' && (
            <div className="space-y-6">
              {/* Listing status */}
              {listing?.is_listed ? (
                <div className="card bg-green-50 border-green-300">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-green-800 flex items-center gap-2"><Tag className="h-5 w-5" />Listed for Sale</p>
                      <p className="text-2xl font-bold text-green-900 mt-1">{formatCurrency(listing.asking_price || 0)}</p>
                      <p className="text-sm text-green-700 mt-1">Transition: {listing.transition_period} months · {listing.seller_financing ? `Seller financing: ${formatCurrency(listing.seller_financing_amount || 0)}` : 'No seller financing'}</p>
                      {listing.motivation && <p className="text-sm text-gray-600 mt-1 italic">"{listing.motivation}"</p>}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setShowListingForm(true)} className="btn btn-secondary text-sm">Edit</button>
                      <button onClick={withdrawListing} className="btn text-sm bg-red-50 text-red-600 border-red-200 hover:bg-red-100">Withdraw</button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="card border-dashed text-center py-8">
                  <Tag className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <h3 className="font-semibold text-gray-800 mb-1">List Your Business for Sale</h3>
                  <p className="text-sm text-gray-500 mb-4">Set your asking price and generate a professional investment summary to share with buyers.</p>
                  <button onClick={() => setShowListingForm(true)} className="btn btn-primary">List for Sale</button>
                </div>
              )}

              {/* Listing form */}
              {showListingForm && (
                <div className="card border-blue-200 bg-blue-50">
                  <h3 className="font-semibold text-gray-800 mb-4">{listing?.is_listed ? 'Update Listing' : 'List Your Business'}</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">Asking Price ($)</label>
                      <input type="number" value={listingForm.asking_price}
                        onChange={e => setListingForm({...listingForm, asking_price: e.target.value})}
                        className="input" placeholder={String(val.equity_value_mid || '')} />
                      {val.equity_value_mid && <p className="text-xs text-blue-600 mt-1">AI valuation: {formatCurrency(val.equity_value_mid)}</p>}
                    </div>
                    <div>
                      <label className="label">Seller Transition Period (months)</label>
                      <input type="number" value={listingForm.transition_period}
                        onChange={e => setListingForm({...listingForm, transition_period: e.target.value})}
                        className="input" />
                    </div>
                    <div className="col-span-2">
                      <label className="label">Why Are You Selling?</label>
                      <textarea value={listingForm.motivation}
                        onChange={e => setListingForm({...listingForm, motivation: e.target.value})}
                        className="input w-full min-h-16 resize-y text-sm"
                        placeholder="e.g. Pursuing new ventures, retirement, health reasons..." />
                    </div>
                    <div className="col-span-2">
                      <label className="label">Ideal Buyer Profile</label>
                      <input value={listingForm.ideal_buyer}
                        onChange={e => setListingForm({...listingForm, ideal_buyer: e.target.value})}
                        className="input w-full" placeholder="e.g. Experienced operator in HVAC, search fund, individual buyer with industry background" />
                    </div>
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={listingForm.seller_financing}
                          onChange={e => setListingForm({...listingForm, seller_financing: e.target.checked})}
                          className="h-4 w-4 rounded text-blue-600" />
                        <span className="text-sm font-medium text-gray-700">Offer Seller Financing</span>
                      </label>
                    </div>
                    {listingForm.seller_financing && (
                      <div>
                        <label className="label">Seller Financing Amount ($)</label>
                        <input type="number" value={listingForm.seller_financing_amount}
                          onChange={e => setListingForm({...listingForm, seller_financing_amount: e.target.value})}
                          className="input" />
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button onClick={saveListing} disabled={savingListing} className="btn btn-primary inline-flex items-center gap-2">
                      {savingListing ? <Loader className="h-4 w-4 animate-spin" /> : null}
                      {listing?.is_listed ? 'Update Listing' : 'List for Sale'}
                    </button>
                    <button onClick={() => setShowListingForm(false)} className="btn btn-secondary">Cancel</button>
                  </div>
                </div>
              )}

              {/* Investment summary / CIM */}
              {listing?.is_listed && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-800">Investment Summary (CIM)</h3>
                      <p className="text-sm text-gray-500">AI-generated Confidential Information Memorandum to share with buyers</p>
                    </div>
                    <button onClick={generateCIM} disabled={generatingCim} className="btn btn-primary inline-flex items-center gap-2">
                      {generatingCim ? <><Loader className="h-4 w-4 animate-spin" />Generating...</> : <><Sparkles className="h-4 w-4" />{cim ? 'Regenerate' : 'Generate CIM'}</>}
                    </button>
                  </div>

                  {generatingCim && (
                    <div className="card text-center py-10">
                      <Loader className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
                      <p className="font-medium text-gray-700">Writing your investment summary...</p>
                      <p className="text-sm text-gray-400 mt-1">Creating a professional CIM from your business data</p>
                    </div>
                  )}

                  {cim && !generatingCim && (
                    <div className="space-y-4">
                      {/* CIM header */}
                      <div className="bg-gradient-to-r from-slate-900 to-blue-900 text-white rounded-2xl p-6">
                        <p className="text-xs text-blue-300 uppercase tracking-widest mb-1">Confidential Information Memorandum</p>
                        <h2 className="text-2xl font-bold mb-1">{cim.business_overview?.business_name}</h2>
                        <p className="text-blue-200 text-sm mb-4 capitalize">{cim.business_overview?.industry}</p>
                        <p className="text-white leading-relaxed">{cim.executive_summary}</p>
                        <div className="mt-4 pt-4 border-t border-white border-opacity-20 flex gap-6">
                          <div><p className="text-xs text-blue-300">Asking Price</p><p className="text-xl font-bold">{cim.valuation?.asking_price}</p></div>
                          <div><p className="text-xs text-blue-300">Revenue</p><p className="text-xl font-bold">{cim.financial_summary?.revenue}</p></div>
                          <div><p className="text-xs text-blue-300">EBITDA</p><p className="text-xl font-bold">{cim.financial_summary?.ebitda}</p></div>
                          <div><p className="text-xs text-blue-300">DSCR</p><p className="text-xl font-bold">{cim.financial_summary?.dscr}</p></div>
                        </div>
                      </div>

                      {/* Investment highlights */}
                      {cim.investment_highlights?.length > 0 && (
                        <div className="card">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="font-semibold text-gray-800">Investment Highlights</h3>
                            <button onClick={() => copySection('highlights', cim.investment_highlights.map((h: any) => `• ${h.title}: ${h.detail}`).join('\n'))}
                              className="text-xs text-gray-400 hover:text-gray-600 inline-flex items-center gap-1">
                              {copiedSection === 'highlights' ? <><Check className="h-3 w-3 text-green-600" />Copied</> : <><Copy className="h-3 w-3" />Copy</>}
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            {cim.investment_highlights.map((h: any, i: number) => (
                              <div key={i} className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
                                <p className="text-sm font-semibold text-blue-900 flex items-center gap-1"><ArrowUpRight className="h-4 w-4" />{h.title}</p>
                                <p className="text-sm text-blue-700 mt-0.5">{h.detail}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Valuation rationale */}
                      {cim.valuation && (
                        <div className="card">
                          <h3 className="font-semibold text-gray-800 mb-3">Valuation</h3>
                          <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                            {[
                              { label: 'Asking Price', val: cim.valuation.asking_price },
                              { label: 'EV/EBITDA', val: cim.valuation.ev_ebitda_multiple },
                              { label: 'SDE Multiple', val: cim.valuation.sde_multiple },
                              { label: 'SBA Eligible', val: cim.valuation.sba_eligible },
                              { label: 'Equity Req.', val: cim.valuation.equity_injection_required },
                            ].map(v => (
                              <div key={v.label} className="flex justify-between p-2 bg-gray-50 rounded-lg">
                                <span className="text-gray-500">{v.label}</span>
                                <span className="font-semibold text-gray-800">{v.val}</span>
                              </div>
                            ))}
                          </div>
                          <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{cim.valuation.equity_value_rationale}</p>
                        </div>
                      )}

                      {/* Growth opportunities */}
                      {cim.growth_opportunities?.length > 0 && (
                        <div className="card">
                          <h3 className="font-semibold text-gray-800 mb-3">Growth Opportunities for New Owner</h3>
                          {cim.growth_opportunities.map((g: string, i: number) => (
                            <p key={i} className="text-sm text-gray-700 flex gap-2 mb-2"><ArrowUpRight className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />{g}</p>
                          ))}
                        </div>
                      )}

                      {/* Transaction details */}
                      {cim.transaction_details && (
                        <div className="card">
                          <h3 className="font-semibold text-gray-800 mb-3">Transaction Details</h3>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            {[
                              { label: 'Transition Period', val: cim.transaction_details.transition_period },
                              { label: 'Seller Financing', val: cim.transaction_details.seller_financing },
                              { label: 'Ideal Buyer', val: cim.transaction_details.ideal_buyer_profile },
                              { label: 'Reason for Sale', val: cim.transaction_details.reason_for_sale },
                            ].map(v => v.val ? (
                              <div key={v.label} className="p-2 bg-gray-50 rounded-lg">
                                <p className="text-xs text-gray-400">{v.label}</p>
                                <p className="font-medium text-gray-800">{v.val}</p>
                              </div>
                            ) : null)}
                          </div>
                        </div>
                      )}

                      {/* Risk factors */}
                      {cim.risk_factors?.length > 0 && (
                        <div className="card">
                          <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-yellow-500" />Risk Factors</h3>
                          {cim.risk_factors.map((r: any, i: number) => (
                            <div key={i} className="mb-2 pb-2 border-b border-gray-50 last:border-0">
                              <p className="text-sm font-medium text-gray-800">{r.risk}</p>
                              <p className="text-xs text-blue-600 mt-0.5">Mitigation: {r.mitigation}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Next steps for buyers */}
                      {cim.deal_process?.next_steps?.length > 0 && (
                        <div className="card bg-blue-50 border-blue-200">
                          <p className="text-sm font-semibold text-blue-800 mb-2">Next Steps for Interested Buyers</p>
                          {cim.deal_process.next_steps.map((s: string, i: number) => (
                            <p key={i} className="text-sm text-blue-700 flex gap-2 mb-1"><span className="font-bold shrink-0">{i+1}.</span>{s}</p>
                          ))}
                          {cim.deal_process.nda_required && <p className="text-xs text-blue-600 mt-2">📄 NDA required before detailed financials are shared</p>}
                        </div>
                      )}

                      <AIDisclaimer type="legal" compact className="mb-2" />
                      <p className="text-xs text-gray-400 text-center">
                        AI-generated CIM v{cim.version}. Review with your broker or attorney before sharing with buyers.
                        Generated {cim.generated_at ? new Date(cim.generated_at).toLocaleString() : ''}.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
