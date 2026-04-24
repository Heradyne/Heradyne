'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Shield, TrendingUp, AlertTriangle, CheckCircle, Calculator, Loader } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const fmtPct = (n: number) => `${(n * 100).toFixed(2)}%`;

export default function ActuarialPricingPage() {
  const [deals, setDeals] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [pricing, setPricing] = useState<any>(null);
  const [uw, setUw] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pricing_loading, setPricingLoading] = useState(false);

  useEffect(() => { loadDeals(); }, []);

  const loadDeals = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/v1/deals/`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setDeals(await res.json());
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  const selectDeal = async (deal: any) => {
    setSelected(deal);
    setPricing(null);
    setPricingLoading(true);
    try {
      const token = localStorage.getItem('token');
      const [uwRes, priceRes] = await Promise.all([
        fetch(`${API}/api/v1/underwriting/deals/${deal.id}/full-underwriting`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/v1/ai/price-deal/${deal.id}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
      ]);
      if (uwRes.ok) setUw(await uwRes.json());
      if (priceRes?.ok) setPricing(await priceRes.json());
    } catch(e) {}
    finally { setPricingLoading(false); }
  };

  const inputClass = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400";

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Actuarial Pricing</h1>
        <p className="text-gray-500 mt-1">PD, LGD, pure premium, and indicated rate per deal.</p>
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Deal list */}
        <div className="col-span-2 space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Deals for Pricing</p>
          {loading && <div className="text-sm text-gray-400">Loading...</div>}
          {(deals || []).map(deal => (
            <div key={deal.id} onClick={() => selectDeal(deal)}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${selected?.id === deal.id ? 'border-purple-500 bg-purple-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
              <p className="text-sm font-semibold text-gray-900 truncate">{deal.name}</p>
              <p className="text-xs text-gray-400 mt-0.5 capitalize">{deal.industry} · {fmt(deal.loan_amount_requested || 0)}</p>
            </div>
          ))}
        </div>

        {/* Pricing panel */}
        <div className="col-span-3">
          {!selected ? (
            <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-12 text-center">
              <Calculator className="h-10 w-10 text-gray-300 mx-auto mb-3"/>
              <p className="text-gray-400">Select a deal to run actuarial pricing</p>
            </div>
          ) : pricing_loading ? (
            <div className="bg-white rounded-xl border p-12 text-center">
              <Loader className="h-8 w-8 animate-spin text-purple-600 mx-auto mb-3"/>
              <p className="text-gray-500">Running actuarial model...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* UW scores */}
              {uw && (
                <div className="bg-white rounded-xl border p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">UnderwriteOS Risk Inputs</h3>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      {label:'Health', value:`${uw.health_score?.score?.toFixed(0)}/100`, ok:(uw.health_score?.score||0)>=70},
                      {label:'DSCR', value:`${uw.dscr_pdscr?.dscr_base?.toFixed(2)}x`, ok:(uw.dscr_pdscr?.dscr_base||0)>=1.25},
                      {label:'SBA', value:uw.sba_eligibility?.eligible?'✓ Yes':'✗ No', ok:uw.sba_eligibility?.eligible},
                      {label:'Verdict', value:(uw.deal_killer?.verdict||'N/A').toUpperCase(), ok:uw.deal_killer?.verdict==='buy'},
                    ].map(m => (
                      <div key={m.label} className={`rounded-lg p-3 text-center ${m.ok?'bg-green-50':'bg-red-50'}`}>
                        <p className="text-xs text-gray-400">{m.label}</p>
                        <p className={`font-bold text-sm ${m.ok?'text-green-700':'text-red-600'}`}>{m.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pricing output */}
              {pricing ? (
                <>
                  {/* Rate summary */}
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-purple-900">Indicated Annual Rate</h3>
                      <span className={`text-xs px-3 py-1 rounded-full font-bold ${pricing.risk_decision==='accept'?'bg-green-100 text-green-700':pricing.risk_decision==='refer'?'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-700'}`}>
                        {pricing.risk_decision?.replace(/_/g,' ').toUpperCase()}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="text-center">
                        <p className="text-xs text-purple-600 mb-1">Indicated Rate</p>
                        <p className="text-3xl font-bold text-purple-900">{fmtPct(pricing.indicated_rate || 0)}</p>
                        <p className="text-xs text-purple-500">annual</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-purple-600 mb-1">Monthly Premium</p>
                        <p className="text-2xl font-bold text-purple-900">{fmt(pricing.monthly_premium_dollars || 0)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-purple-600 mb-1">Annual Premium</p>
                        <p className="text-2xl font-bold text-purple-900">{fmt(pricing.annual_premium_dollars || 0)}</p>
                      </div>
                    </div>
                    {pricing.pricing_rationale && (
                      <div className="bg-white rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Actuarial Rationale</p>
                        <p className="text-sm text-gray-700">{pricing.pricing_rationale}</p>
                      </div>
                    )}
                  </div>

                  {/* Frequency-severity breakdown */}
                  <div className="bg-white rounded-xl border p-5">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">Frequency-Severity Breakdown</h3>
                    <div className="space-y-2">
                      {[
                        {label:'Probability of Default (PD)', value:fmtPct(pricing.pd_estimate||0), sub:`vs ${fmtPct(pricing.cohort_benchmark_rate||0)} cohort benchmark`},
                        {label:'Loss Given Default (LGD)', value:fmtPct(pricing.lgd_estimate||0), sub:'after SBA guarantee recovery'},
                        {label:'Pure Premium (PD × LGD)', value:fmtPct(pricing.pure_premium||0), sub:'expected loss rate'},
                        {label:'Risk Load', value:fmtPct(pricing.risk_load||0), sub:'variance & volatility buffer'},
                        {label:'Expense Load', value:fmtPct(pricing.expense_load||0), sub:'operating expenses'},
                        {label:'Profit Margin', value:fmtPct(pricing.profit_margin||0), sub:'target return'},
                      ].map((row, i) => (
                        <div key={i} className={`flex justify-between items-center py-2 ${i < 5 ? 'border-b border-gray-50' : 'border-t-2 border-gray-200 font-semibold'}`}>
                          <div>
                            <p className={`text-sm ${i===5?'font-semibold text-gray-900':'text-gray-700'}`}>{row.label}</p>
                            <p className="text-xs text-gray-400">{row.sub}</p>
                          </div>
                          <p className={`text-sm font-bold ${i===5?'text-purple-700':''}`}>{row.value}</p>
                        </div>
                      ))}
                      <div className="flex justify-between items-center py-2 bg-purple-50 rounded-lg px-3">
                        <p className="text-sm font-bold text-purple-900">Indicated Rate (Total)</p>
                        <p className="text-sm font-bold text-purple-900">{fmtPct(pricing.indicated_rate||0)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Rate range + conditions */}
                  <div className="bg-white rounded-xl border p-5">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Optimistic Scenario</p>
                        <p className="text-lg font-bold text-green-700">{fmtPct(pricing.indicated_rate_low||0)}</p>
                        <p className="text-xs text-gray-400">DSCR holds, no surprises</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Stress Scenario</p>
                        <p className="text-lg font-bold text-red-600">{fmtPct(pricing.indicated_rate_high||0)}</p>
                        <p className="text-xs text-gray-400">Revenue −15%, DSCR pressure</p>
                      </div>
                    </div>
                    {pricing.key_risk_factors?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Key Rate Drivers</p>
                        {(pricing.key_risk_factors || []).map((f: string, i: number) => (
                          <p key={i} className="text-sm text-gray-700 flex gap-2 mb-1">
                            <span className="text-purple-400 shrink-0">•</span>{f}
                          </p>
                        ))}
                      </div>
                    )}
                    {pricing.conditions?.length > 0 && (
                      <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <p className="text-xs font-semibold text-yellow-700 uppercase mb-1">Coverage Conditions</p>
                        {(pricing.conditions || []).map((c: string, i: number) => (
                          <p key={i} className="text-xs text-yellow-800">• {c}</p>
                        ))}
                      </div>
                    )}
                    <div className="flex justify-between text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100">
                      <span>Expected loss ratio: <strong className="text-gray-600">{fmtPct(pricing.expected_loss_ratio||0)}</strong></span>
                      <span>Credibility weight: <strong className="text-gray-600">{((pricing.credibility_weight||0)*100).toFixed(0)}%</strong> this deal vs cohort</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-white rounded-xl border p-8 text-center">
                  <AlertTriangle className="h-8 w-8 text-yellow-400 mx-auto mb-3"/>
                  <p className="text-sm text-gray-500">Actuarial pricing not available for this deal.</p>
                  <p className="text-xs text-gray-400 mt-1">Check that ANTHROPIC_API_KEY is configured.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}