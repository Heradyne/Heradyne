'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { AlertTriangle, Calculator, Loader } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const fmtPct = (n: number) => `${(n * 100).toFixed(2)}%`;

export default function ActuarialPricingPage() {
  const [deals, setDeals] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [pricing, setPricing] = useState<any>(null);
  const [uw, setUw] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingError, setPricingError] = useState('');

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
    setPricingError('');
    setPricingLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers: any = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

      const [uwRes, priceRes] = await Promise.all([
        fetch(`${API}/api/v1/underwriting/deals/${deal.id}/full-underwriting`, { headers }),
        fetch(`${API}/api/v1/actuarial/price/deal/${deal.id}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ attachment_point: 0, limit: null, coinsurance: 1.0, waiting_period_days: 90 }),
        }),
      ]);

      if (uwRes.ok) setUw(await uwRes.json());
      if (priceRes.ok) {
        setPricing(await priceRes.json());
      } else {
        const err = await priceRes.json().catch(() => ({}));
        setPricingError(err?.detail || `Server error ${priceRes.status}`);
      }
    } catch(e: any) {
      setPricingError(e.message || 'Failed to load pricing');
    } finally {
      setPricingLoading(false);
    }
  };

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
          {deals.map(deal => (
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
          ) : pricingLoading ? (
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
                      {label:'DSCR',   value:`${uw.dscr_pdscr?.dscr_base?.toFixed(2)}x`,  ok:(uw.dscr_pdscr?.dscr_base||0)>=1.25},
                      {label:'SBA',    value:uw.sba_eligibility?.eligible?'✓ Yes':'✗ No', ok:uw.sba_eligibility?.eligible},
                      {label:'Verdict',value:(uw.deal_killer?.verdict||'N/A').toUpperCase(), ok:uw.deal_killer?.verdict==='buy'},
                    ].map(m => (
                      <div key={m.label} className={`rounded-lg p-3 text-center ${m.ok?'bg-green-50':'bg-red-50'}`}>
                        <p className="text-xs text-gray-400">{m.label}</p>
                        <p className={`font-bold text-sm ${m.ok?'text-green-700':'text-red-600'}`}>{m.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pricing ? (
                <>
                  {/* Decision + premium summary */}
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-purple-900">Actuarial Pricing Result</h3>
                      <span className={`text-xs px-3 py-1 rounded-full font-bold ${
                        pricing.decision === 'accept' ? 'bg-green-100 text-green-700' :
                        pricing.decision === 'refer'  ? 'bg-yellow-100 text-yellow-700' :
                                                        'bg-red-100 text-red-700'
                      }`}>
                        {(pricing.decision || 'N/A').replace(/_/g,' ').toUpperCase()}
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
                    {pricing.decision_rationale && (
                      <div className="bg-white rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Rationale</p>
                        <p className="text-sm text-gray-700">{pricing.decision_rationale}</p>
                      </div>
                    )}
                  </div>

                  {/* Frequency-severity breakdown */}
                  <div className="bg-white rounded-xl border p-5">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">Frequency-Severity Breakdown</h3>
                    <div className="space-y-1">
                      {[
                        {label:'Probability of Default (PD)',   value:fmtPct(pricing.default_probability||0),      sub:'likelihood of borrower default'},
                        {label:'Loss Given Default (LGD)',       value:fmtPct(pricing.loss_given_default||0),       sub:'exposure after SBA guarantee recovery'},
                        {label:'Collateral-Adjusted LGD',       value:fmtPct(pricing.collateral_adjusted_lgd||0),  sub:`collateral coverage ${(pricing.collateral_coverage_ratio||0).toFixed(2)}x loan`},
                        {label:'Pure Premium  (PD × LGD)',      value:fmtPct(pricing.pure_premium||0),             sub:'expected loss rate'},
                        {label:'Risk Load',                     value:fmtPct(pricing.risk_load||0),                sub:'variance & volatility buffer'},
                        {label:'Expense Load',                  value:fmtPct(pricing.expense_load||0),             sub:'operating expenses'},
                        {label:'Profit Margin',                 value:fmtPct(pricing.profit_margin||0),            sub:'target return on capital'},
                      ].map((row, i) => (
                        <div key={i} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                          <div>
                            <p className="text-sm text-gray-700">{row.label}</p>
                            <p className="text-xs text-gray-400">{row.sub}</p>
                          </div>
                          <p className="text-sm font-bold text-gray-800">{row.value}</p>
                        </div>
                      ))}
                      <div className="flex justify-between items-center py-2 bg-purple-50 rounded-lg px-3 mt-2">
                        <p className="text-sm font-bold text-purple-900">Indicated Rate (Total)</p>
                        <p className="text-sm font-bold text-purple-900">{fmtPct(pricing.indicated_rate||0)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Tail risk */}
                  <div className="bg-white rounded-xl border p-5">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">Tail Risk & Capital</h3>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      {[
                        {label:'PML 99th %ile',   value:fmtPct(pricing.pml_99||0)},
                        {label:'TVaR 99th %ile',  value:fmtPct(pricing.tvar_99||0)},
                        {label:'Capital Required',value:fmt(pricing.capital_required||0)},
                      ].map(m => (
                        <div key={m.label} className="bg-gray-50 rounded-lg p-3 text-center">
                          <p className="text-xs text-gray-400 mb-1">{m.label}</p>
                          <p className="text-lg font-bold text-gray-800">{m.value}</p>
                        </div>
                      ))}
                    </div>

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

                    {pricing.required_conditions?.length > 0 && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3">
                        <p className="text-xs font-semibold text-yellow-700 uppercase mb-1">Coverage Conditions</p>
                        {pricing.required_conditions.map((c: string, i: number) => (
                          <p key={i} className="text-xs text-yellow-800">• {c}</p>
                        ))}
                      </div>
                    )}

                    {pricing.loss_drivers?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Key Loss Drivers</p>
                        {pricing.loss_drivers.slice(0,4).map((d: any, i: number) => (
                          <div key={i} className="flex justify-between text-sm py-1 border-b border-gray-50">
                            <span className="text-gray-700">{d.factor || d.name || String(d)}</span>
                            {d.impact != null && <span className="text-red-600 font-medium">+{fmtPct(d.impact)}</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex justify-between text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100">
                      <span>Expected loss ratio: <strong className="text-gray-600">{fmtPct(pricing.expected_loss_ratio||0)}</strong></span>
                      <span>Cohort: <strong className="text-gray-600">{pricing.cohort_name || 'N/A'}</strong> ({pricing.cohort_loan_count || 0} loans)</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-white rounded-xl border p-8 text-center">
                  <AlertTriangle className="h-8 w-8 text-yellow-400 mx-auto mb-3"/>
                  <p className="text-sm text-gray-500">Actuarial pricing not available for this deal.</p>
                  {pricingError
                    ? <p className="text-xs text-red-400 mt-1">{pricingError}</p>
                    : <p className="text-xs text-gray-400 mt-1">Check that ANTHROPIC_API_KEY is configured.</p>
                  }
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
