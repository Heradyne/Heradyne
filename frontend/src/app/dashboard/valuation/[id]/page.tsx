'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CheckCircle, XCircle, AlertTriangle, TrendingUp, Shield, DollarSign, ArrowRight, Download } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export default function ValuationResultsPage() {
  const params = useParams();
  const router = useRouter();
  const dealId = params.id;
  const [deal, setDeal] = useState<any>(null);
  const [uw, setUw] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [retries, setRetries] = useState(0);

  useEffect(() => { if (dealId) loadData(); }, [dealId, retries]);

  const loadData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const [dealRes, uwRes] = await Promise.all([
        fetch(`${API}/api/v1/deals/${dealId}`, { headers }),
        fetch(`${API}/api/v1/underwriting/deals/${dealId}/full-underwriting`, { headers }),
      ]);
      if (dealRes.ok) setDeal(await dealRes.json());
      if (uwRes.ok) {
        const uwData = await uwRes.json();
        setUw(uwData);
      } else if (retries < 3) {
        // Analysis still running — retry after 3 seconds
        setTimeout(() => setRetries(r => r + 1), 3000);
        return;
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) return (
    <div className="max-w-3xl mx-auto text-center py-24">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"/>
      <p className="text-gray-500">Loading your valuation report...</p>
    </div>
  );

  if (!deal) return (
    <div className="max-w-3xl mx-auto text-center py-24">
      <p className="text-gray-500">Report not found.</p>
    </div>
  );

  const healthScore = uw?.health_score?.score || 0;
  const verdict = uw?.deal_killer?.verdict || 'unknown';
  const verdictColor = verdict === 'buy' ? '#15803d' : verdict === 'renegotiate' ? '#ca8a04' : '#dc2626';
  const verdictBg = verdict === 'buy' ? 'bg-green-50 border-green-300' : verdict === 'renegotiate' ? 'bg-yellow-50 border-yellow-300' : 'bg-red-50 border-red-300';
  const verdictLabel = verdict === 'buy' ? '✓ Strong Buy' : verdict === 'renegotiate' ? '⚠ Renegotiate' : '✗ Pass';

  const valuation = uw?.valuation || {};
  const dscr = uw?.dscr_pdscr || {};
  const sba = uw?.sba_eligibility || {};
  const playbooks = uw?.playbooks || [];

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Valuation Report</h1>
          <p className="text-gray-500 mt-1">{deal.name}</p>
        </div>
        <button
          onClick={() => router.push('/dashboard/get-valuation')}
          className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
        >
          Get another valuation <ArrowRight className="h-3 w-3"/>
        </button>
      </div>

      {/* Deal verdict banner */}
      {uw?.deal_killer && (
        <div className={`rounded-xl border-2 p-6 ${verdictBg}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{color: verdictColor}}>Deal Verdict</p>
              <p className="text-3xl font-bold" style={{color: verdictColor}}>{verdictLabel}</p>
              <p className="text-sm mt-1" style={{color: verdictColor}}>
                Confidence: {uw.deal_killer.confidence_score?.toFixed(0)}/100
                {uw.deal_killer.max_supportable_price && ` · Max supportable price: ${fmt(uw.deal_killer.max_supportable_price)}`}
              </p>
            </div>
            <div className="text-5xl font-bold opacity-20" style={{color: verdictColor}}>
              {uw.deal_killer.confidence_score?.toFixed(0)}
            </div>
          </div>
        </div>
      )}

      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className={`rounded-xl border p-4 ${healthScore >= 70 ? 'bg-green-50 border-green-200' : healthScore >= 50 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'}`}>
          <p className="text-xs font-semibold uppercase text-gray-500 mb-1">Health Score</p>
          <p className="text-3xl font-bold" style={{color: healthScore >= 70 ? '#15803d' : healthScore >= 50 ? '#ca8a04' : '#dc2626'}}>{healthScore.toFixed(0)}</p>
          <p className="text-xs text-gray-400">out of 100</p>
        </div>
        <div className={`rounded-xl border p-4 ${(dscr.dscr_base||0) >= 1.25 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <p className="text-xs font-semibold uppercase text-gray-500 mb-1">DSCR</p>
          <p className={`text-3xl font-bold ${(dscr.dscr_base||0) >= 1.25 ? 'text-green-700' : 'text-red-600'}`}>{dscr.dscr_base?.toFixed(2) || 'N/A'}x</p>
          <p className="text-xs text-gray-400">min 1.25x</p>
        </div>
        <div className={`rounded-xl border p-4 ${sba.eligible ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <p className="text-xs font-semibold uppercase text-gray-500 mb-1">SBA 7(a)</p>
          <p className={`text-3xl font-bold ${sba.eligible ? 'text-green-700' : 'text-red-600'}`}>{sba.eligible ? '✓ Yes' : '✗ No'}</p>
          <p className="text-xs text-gray-400">eligibility</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs font-semibold uppercase text-gray-500 mb-1">Runway</p>
          <p className="text-3xl font-bold text-gray-900">{uw?.cash_flow_forecast?.runway_months === 18 ? '18+' : uw?.cash_flow_forecast?.runway_months?.toFixed(1) || 'N/A'}</p>
          <p className="text-xs text-gray-400">months</p>
        </div>
      </div>

      {/* 5-Method Valuation */}
      {valuation.methods && (
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold mb-4">5-Method Valuation</h2>
          <div className="space-y-2 mb-4">
            {valuation.methods.map((m: any, i: number) => (
              <div key={i} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-800">{m.method}</p>
                  <p className="text-xs text-gray-400">{m.multiple_used ? `${m.multiple_used}x multiple` : ''}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">{fmt(m.enterprise_value)}</p>
                  <p className="text-xs text-gray-400">EV · {fmt(m.equity_value)} equity</p>
                </div>
              </div>
            ))}
          </div>
          <div className={`rounded-lg p-4 ${verdictBg}`}>
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs font-semibold uppercase text-gray-500">Blended Equity Value</p>
                <p className="text-2xl font-bold text-gray-900">{fmt(valuation.equity_value_mid || 0)}</p>
                <p className="text-xs text-gray-500">Range: {fmt(valuation.equity_value_low || 0)} – {fmt(valuation.equity_value_high || 0)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">vs asking price</p>
                <p className="text-sm font-semibold text-gray-700">{fmt(deal.purchase_price || 0)}</p>
                {deal.purchase_price && valuation.equity_value_mid && (
                  <p className={`text-xs font-semibold ${valuation.equity_value_mid >= deal.purchase_price ? 'text-green-600' : 'text-red-600'}`}>
                    {valuation.equity_value_mid >= deal.purchase_price ? '✓ Below fair value' : '⚠ Above fair value'}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Risk flags */}
      {playbooks.length > 0 && (
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold mb-4">Key Risk Flags</h2>
          <div className="space-y-3">
            {playbooks.slice(0, 3).map((pb: any, i: number) => (
              <div key={i} className={`rounded-lg border p-4 flex gap-3 ${pb.severity === 'critical' ? 'bg-red-50 border-red-200' : pb.severity === 'warning' ? 'bg-yellow-50 border-yellow-200' : 'bg-blue-50 border-blue-200'}`}>
                {pb.severity === 'critical' ? <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5"/> : pb.severity === 'warning' ? <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5"/> : <TrendingUp className="h-5 w-5 text-blue-500 shrink-0 mt-0.5"/>}
                <div>
                  <p className="text-sm font-semibold text-gray-900">{pb.title}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{pb.impact_summary}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upgrade CTA for valuation-only users */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-semibold text-indigo-900 mb-1">Want the full diligence package?</p>
            <p className="text-sm text-indigo-700 mb-3">
              Get lender-ready documents, AI document checklist, 18-month cash flow forecast, 
              detailed playbooks, and a shareable report link — everything you need to walk into a lender.
            </p>
            <button
              onClick={() => router.push('/get-started?tier=diligence')}
              className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors flex items-center gap-2"
            >
              Upgrade to Full Package — $399 <ArrowRight className="h-4 w-4"/>
            </button>
          </div>
          <Shield className="h-10 w-10 text-indigo-300 shrink-0"/>
        </div>
      </div>

      <p className="text-center text-xs text-gray-400">
        This report is informational only and does not constitute lending, guarantee, insurance, or investment advice. · Heradyne
      </p>
    </div>
  );
}
