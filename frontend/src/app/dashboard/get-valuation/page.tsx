'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle, Shield, TrendingUp, Lock, FileText, Plus, Brain } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const VALUED = ['analyzed','matched','funded','approved','pending_lender','pending_insurer','closed'];

const TIERS = [
  {
    id: 'valuation', name: 'Instant Valuation', price: 99,
    tagline: 'Know what your business is worth in minutes',
    cta: 'Get New Valuation — $99', badge: null,
    features: ['Business health score (0–100)','Deal verdict — Buy, Pass, or Renegotiate','5-method valuation (SDE, EBITDA, DCF, Revenue, Asset)','DSCR analysis with stress scenarios','SBA 7(a) eligibility check','2–3 key risk flags'],
  },
  {
    id: 'diligence', name: 'Full Diligence Package', price: 399,
    tagline: 'Everything you need to walk into a lender',
    cta: 'Get Full Package — $399', badge: 'Most Popular',
    features: ['Everything in Instant Valuation','AI document checklist (SBA 7(a) standards)','Document upload portal','18-month cash flow forecast','Playbooks with vendor recommendations','Shareable lender link + PDF report','AI advisor Q&A'],
  },
];

export default function GetValuationPage() {
  const router = useRouter();
  const [deals, setDeals] = useState<any[]>([]);
  const [uwData, setUwData] = useState<Record<number, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadDeals(); }, []);

  const loadDeals = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/v1/deals/`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const all = await res.json();
      const valued = (all || []).filter((d: any) => VALUED.includes(d.status));
      setDeals(valued);
      (valued || []).forEach(async (deal: any) => {
        try {
          const r = await fetch(`${API}/api/v1/underwriting/deals/${deal.id}/full-underwriting`, { headers: { Authorization: `Bearer ${token}` } });
          if (r.ok) {
            const data = await r.json();
            setUwData(prev => ({ ...prev, [deal.id]: data }));
          }
        } catch {}
      });
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  const vBadge = (v: string) => v==='buy'?'bg-green-50 border-green-200 text-green-700':v==='renegotiate'?'bg-yellow-50 border-yellow-200 text-yellow-700':'bg-red-50 border-red-200 text-red-600';
  const vLabel = (v: string) => v==='buy'?'✓ Buy':v==='renegotiate'?'⚠ Renegotiate':'✗ Pass';

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Valuations</h1>
        <p className="text-gray-500 mt-1">Institutional-grade deal analysis powered by SBA-calibrated AI.</p>
      </div>

      {/* Existing valued deals */}
      {!loading && deals.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Your Valued Deals</h2>
          <div className="space-y-3">
            {(deals || []).map(deal => {
              const uw = uwData[deal.id];
              const verdict = uw?.deal_killer?.verdict;
              const hs = uw?.health_score?.score;
              const tier = typeof window !== 'undefined' ? localStorage.getItem(`deal_tier_${deal.id}`) || 'valuation' : 'valuation';
              return (
                <div key={deal.id} onClick={() => router.push(`/dashboard/valuation/${deal.id}`)}
                  className="bg-white rounded-xl border border-gray-200 p-5 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                        <FileText className="h-5 w-5 text-blue-600"/>
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{deal.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {deal.industry} · {fmt(deal.annual_revenue || 0)} revenue · {fmt(deal.purchase_price || 0)} asking
                        </p>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full inline-block mt-1 ${tier==='diligence'?'bg-indigo-100 text-indigo-700':'bg-blue-100 text-blue-700'}`}>
                          {tier==='diligence'?'Full Diligence':'Instant Valuation'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      {hs !== undefined && (
                        <div className="text-center hidden sm:block">
                          <p className="text-xs text-gray-400">Health</p>
                          <p className={`text-lg font-bold ${hs>=70?'text-green-700':hs>=50?'text-yellow-700':'text-red-600'}`}>{hs.toFixed(0)}</p>
                        </div>
                      )}
                      {verdict && <span className={`text-sm font-bold px-3 py-1 rounded-full border ${vBadge(verdict)}`}>{vLabel(verdict)}</span>}
                      {!uw && <span className="text-xs text-gray-400 flex items-center gap-1"><div className="w-3 h-3 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"/>Loading...</span>}
                      <ArrowRight className="h-4 w-4 text-gray-300"/>
                    </div>
                  </div>
                  {uw?.valuation?.equity_value_mid && (
                    <div className="mt-3 pt-3 border-t border-gray-50 flex flex-wrap gap-4 text-xs text-gray-500">
                      <span>Value: <strong className="text-gray-800">{fmt(uw.valuation.equity_value_mid)}</strong></span>
                      <span>DSCR: <strong className={(uw.dscr_pdscr?.dscr_base||0)>=1.25?'text-green-700':'text-red-600'}>{uw.dscr_pdscr?.dscr_base?.toFixed(2)}x</strong></span>
                      <span>SBA: <strong className={uw.sba_eligibility?.eligible?'text-green-700':'text-red-600'}>{uw.sba_eligibility?.eligible?'Eligible':'Not Eligible'}</strong></span>
                      {uw.deal_killer?.max_supportable_price && <span>Max Price: <strong className="text-gray-800">{fmt(uw.deal_killer.max_supportable_price)}</strong></span>}
                      {tier !== 'diligence' && (
                        <button
                          onClick={e => { e.stopPropagation(); router.push(`/get-started?tier=diligence&deal_id=${deal.id}`); }}
                          className="ml-auto text-xs font-semibold text-indigo-600 hover:text-indigo-800 border border-indigo-200 bg-indigo-50 px-3 py-1 rounded-full"
                        >
                          Upgrade to Full Package →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && deals.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-8 text-center">
          <Brain className="h-10 w-10 text-blue-400 mx-auto mb-3"/>
          <p className="font-semibold text-blue-900 mb-1">No valuations yet</p>
          <p className="text-sm text-blue-700">Get your first deal valued below — know what a business is worth before you talk to a lender.</p>
        </div>
      )}

      {/* New valuation tiers */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Plus className="h-5 w-5 text-gray-400"/>
          <h2 className="text-lg font-semibold text-gray-900">{deals.length > 0 ? 'Value Another Deal' : 'Get Started'}</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          {TIERS.map(tier => (
            <div key={tier.id} className={`relative bg-white rounded-2xl border-2 ${tier.id==='diligence'?'border-indigo-500 shadow-lg shadow-indigo-100':'border-gray-200'} p-7`}>
              {tier.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="bg-indigo-600 text-white text-xs font-bold px-4 py-1.5 rounded-full">{tier.badge}</span>
                </div>
              )}
              <div className="mb-5">
                <h3 className="text-lg font-bold text-gray-900 mb-1">{tier.name}</h3>
                <p className="text-gray-500 text-sm mb-3">{tier.tagline}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-gray-900">${tier.price}</span>
                  <span className="text-gray-400 text-sm">one-time · instant</span>
                </div>
              </div>
              <ul className="space-y-2 mb-6">
                {(tier.features || []).map((f,i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle className={`h-4 w-4 shrink-0 mt-0.5 ${tier.id==='diligence'?'text-indigo-500':'text-blue-500'}`}/>
                    <span className="text-sm text-gray-700">{f}</span>
                  </li>
                ))}
              </ul>
              <button onClick={() => router.push(`/get-started?tier=${tier.id}`)}
                className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors ${tier.id==='diligence'?'bg-indigo-600 text-white hover:bg-indigo-700':'bg-blue-600 text-white hover:bg-blue-700'}`}>
                {tier.cta} <ArrowRight className="h-4 w-4"/>
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 text-center pb-4">
        {[{icon:Shield,text:'SBA 7(a) calibrated',sub:'1.59M loan dataset'},{icon:Lock,text:'Secure & confidential',sub:'Your data stays private'},{icon:TrendingUp,text:'Institutional grade',sub:'Same engines lenders use'}].map(({icon:Icon,text,sub})=>(
          <div key={text} className="flex flex-col items-center gap-1.5">
            <Icon className="h-5 w-5 text-gray-400"/>
            <p className="text-sm font-semibold text-gray-700">{text}</p>
            <p className="text-xs text-gray-400">{sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}