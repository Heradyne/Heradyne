'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { XCircle, AlertTriangle, TrendingUp, Shield, ArrowRight, Lock, ChevronDown, ChevronUp } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const LockedSection = ({ title, onUpgrade }: { title: string; onUpgrade: () => void }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-6 relative overflow-hidden">
    <div className="blur-sm pointer-events-none select-none opacity-30">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-10 bg-gray-100 rounded"/>)}</div>
    </div>
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80">
      <Lock className="h-8 w-8 text-indigo-400 mb-2"/>
      <p className="font-semibold text-gray-800 mb-1">{title}</p>
      <p className="text-sm text-gray-500 mb-4 text-center px-8">Included in the Full Diligence Package</p>
      <button onClick={onUpgrade} className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 flex items-center gap-2">
        Upgrade — $399 <ArrowRight className="h-3 w-3"/>
      </button>
    </div>
  </div>
);

export default function ValuationResultsPage() {
  const params = useParams();
  const router = useRouter();
  const dealId = params.id as string;
  const [deal, setDeal] = useState<any>(null);
  const [uw, setUw] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [retries, setRetries] = useState(0);
  const [tier, setTier] = useState<'valuation'|'diligence'>('valuation');
  const [expandedPlaybook, setExpandedPlaybook] = useState<number|null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{role:string;content:string}[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    if (!dealId) return;
    const stored = localStorage.getItem(`deal_tier_${dealId}`) as 'valuation'|'diligence'|null;
    if (stored) setTier(stored);
    loadData();
  }, [dealId, retries]);

  const loadData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const [dRes, uRes] = await Promise.all([
        fetch(`${API}/api/v1/deals/${dealId}`, { headers }),
        fetch(`${API}/api/v1/underwriting/deals/${dealId}/full-underwriting`, { headers }),
      ]);
      if (dRes.ok) setDeal(await dRes.json());
      if (uRes.ok) { setUw(await uRes.json()); }
      else if (retries < 4) { setTimeout(() => setRetries(r => r+1), 3000); return; }
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim(); setChatInput('');
    const hist = [...chatMessages, {role:'user',content:msg}];
    setChatMessages(hist); setChatLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/v1/chat/deals/${dealId}/chat`, {
        method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
        body: JSON.stringify({message:msg, history:chatMessages.slice(-6)}),
      });
      if (res.ok) { const d = await res.json(); setChatMessages([...hist,{role:'assistant',content:d.reply}]); }
    } catch{} finally { setChatLoading(false); }
  };

  if (loading) return (
    <div className="max-w-3xl mx-auto text-center py-24">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"/>
      <p className="text-gray-500">{retries > 0 ? `Running analysis... (${retries}/4)` : 'Loading your report...'}</p>
    </div>
  );
  if (!deal) return <div className="max-w-3xl mx-auto text-center py-24 text-gray-500">Report not found.</div>;

  const hs = uw?.health_score?.score || 0;
  const verdict = uw?.deal_killer?.verdict || 'unknown';
  const vc = verdict==='buy'?'#15803d':verdict==='renegotiate'?'#ca8a04':'#dc2626';
  const vbg = verdict==='buy'?'bg-green-50 border-green-300':verdict==='renegotiate'?'bg-yellow-50 border-yellow-300':'bg-red-50 border-red-300';
  const vl = verdict==='buy'?'✓ Strong Buy':verdict==='renegotiate'?'⚠ Renegotiate':'✗ Pass';
  const val = uw?.valuation||{}; const dscr = uw?.dscr_pdscr||{}; const sba = uw?.sba_eligibility||{};
  const pbs = uw?.playbooks||[]; const isFull = tier==='diligence';
  const upgrade = () => router.push('/get-started?tier=diligence');

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full inline-block mb-2 ${isFull?'bg-indigo-100 text-indigo-700':'bg-blue-100 text-blue-700'}`}>
            {isFull?'Full Diligence Package':'Instant Valuation'}
          </span>
          <h1 className="text-2xl font-bold text-gray-900">Valuation Report</h1>
          <p className="text-gray-500 mt-0.5">{deal.name}</p>
        </div>
        <button onClick={()=>router.push('/dashboard/get-valuation')} className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1">New valuation <ArrowRight className="h-3 w-3"/></button>
      </div>

      {/* Verdict */}
      {uw?.deal_killer && (
        <div className={`rounded-xl border-2 p-6 ${vbg}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{color:vc}}>Deal Verdict</p>
              <p className="text-3xl font-bold" style={{color:vc}}>{vl}</p>
              <p className="text-sm mt-1" style={{color:vc}}>
                Confidence: {uw.deal_killer.confidence_score?.toFixed(0)}/100
                {uw.deal_killer.max_supportable_price&&` · Max price: ${fmt(uw.deal_killer.max_supportable_price)}`}
              </p>
            </div>
            <div className="text-6xl font-bold opacity-10" style={{color:vc}}>{uw.deal_killer.confidence_score?.toFixed(0)}</div>
          </div>
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {label:'Health Score', value:`${hs.toFixed(0)}`, sub:'out of 100', ok:hs>=70},
          {label:'DSCR', value:dscr.dscr_base?`${dscr.dscr_base.toFixed(2)}x`:'N/A', sub:'min 1.25x', ok:(dscr.dscr_base||0)>=1.25},
          {label:'SBA 7(a)', value:sba.eligible?'✓ Yes':'✗ No', sub:'eligibility', ok:sba.eligible},
          {label:'Asking Price', value:fmt(deal.purchase_price||0), sub:'vs market', ok:(val.equity_value_mid||0)>=(deal.purchase_price||0)},
        ].map(m=>(
          <div key={m.label} className={`rounded-xl border p-4 ${m.ok?'bg-green-50 border-green-200':'bg-red-50 border-red-200'}`}>
            <p className="text-xs font-semibold uppercase text-gray-500 mb-1">{m.label}</p>
            <p className={`text-2xl font-bold ${m.ok?'text-green-700':'text-red-600'}`}>{m.value}</p>
            <p className="text-xs text-gray-400">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* 5-Method Valuation */}
      {val.methods && (
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold mb-4">5-Method Valuation</h2>
          <div className="space-y-2 mb-4">
            {val.methods.map((m:any,i:number)=>(
              <div key={i} className="flex justify-between items-center py-2.5 border-b border-gray-50 last:border-0">
                <div><p className="text-sm font-medium text-gray-800">{m.method}</p>{m.multiple_used&&<p className="text-xs text-gray-400">{m.multiple_used}x multiple</p>}</div>
                <div className="text-right"><p className="font-semibold">{fmt(m.enterprise_value)}</p><p className="text-xs text-gray-400">{fmt(m.equity_value)} equity</p></div>
              </div>
            ))}
          </div>
          <div className="rounded-lg bg-gray-50 border p-4 flex justify-between items-center">
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold">Blended Equity Value</p>
              <p className="text-2xl font-bold text-gray-900">{fmt(val.equity_value_mid||0)}</p>
              <p className="text-xs text-gray-400">Range: {fmt(val.equity_value_low||0)} – {fmt(val.equity_value_high||0)}</p>
            </div>
            {deal.purchase_price&&val.equity_value_mid&&(
              <div className="text-right">
                <p className={`text-sm font-bold ${val.equity_value_mid>=deal.purchase_price?'text-green-700':'text-red-600'}`}>
                  {val.equity_value_mid>=deal.purchase_price?'✓ Priced fairly':'⚠ Overpriced'}
                </p>
                <p className="text-xs text-gray-400">vs {fmt(deal.purchase_price)} asking</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Risk flags — 2 free, rest locked */}
      {pbs.length>0&&(
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold mb-4">Risk Flags {!isFull&&<span className="text-sm font-normal text-gray-400">(showing 2 of {pbs.length})</span>}</h2>
          <div className="space-y-3">
            {pbs.slice(0,isFull?pbs.length:2).map((pb:any,i:number)=>(
              <div key={i} className={`rounded-lg border p-4 ${pb.severity==='critical'?'bg-red-50 border-red-200':pb.severity==='warning'?'bg-yellow-50 border-yellow-200':'bg-blue-50 border-blue-200'}`}>
                <div className="flex items-start justify-between cursor-pointer" onClick={()=>isFull&&setExpandedPlaybook(expandedPlaybook===i?null:i)}>
                  <div className="flex gap-3">
                    {pb.severity==='critical'?<XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5"/>:pb.severity==='warning'?<AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5"/>:<TrendingUp className="h-5 w-5 text-blue-500 shrink-0 mt-0.5"/>}
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{pb.title}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{pb.impact_summary}</p>
                      {pb.estimated_annual_impact&&<p className="text-xs font-semibold text-gray-500 mt-1">{fmt(pb.estimated_annual_impact)} impact</p>}
                    </div>
                  </div>
                  {isFull&&(expandedPlaybook===i?<ChevronUp className="h-4 w-4 text-gray-400 shrink-0"/>:<ChevronDown className="h-4 w-4 text-gray-400 shrink-0"/>)}
                </div>
                {isFull&&expandedPlaybook===i&&pb.actions&&(
                  <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                    {pb.actions.map((a:any)=>(
                      <div key={a.step} className="flex gap-3">
                        <span className="w-6 h-6 rounded-full bg-white border text-xs font-bold flex items-center justify-center shrink-0">{a.step}</span>
                        <div><p className="text-xs font-semibold text-gray-500">{a.label}</p><p className="text-sm text-gray-800">{a.detail}</p></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {!isFull&&pbs.length>2&&(
              <div className="rounded-lg border border-dashed border-gray-300 p-4 flex items-center justify-between">
                <p className="text-sm text-gray-500">+{pbs.length-2} more risk flags with action steps</p>
                <button onClick={upgrade} className="text-xs text-indigo-600 font-semibold hover:text-indigo-800">Unlock →</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Full package sections */}
      {isFull?(
        <>
          {/* Cash flow */}
          {uw?.cash_flow_forecast&&(
            <div className="bg-white rounded-xl border p-6">
              <h2 className="text-lg font-semibold mb-4">Cash Flow Summary</h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400">Cash Runway</p>
                  <p className="text-2xl font-bold text-gray-900">{uw.cash_flow_forecast.runway_months===18?'18+':uw.cash_flow_forecast.runway_months?.toFixed(1)} mo</p>
                </div>
                <div className="text-center bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400">Avg Monthly FCF</p>
                  <p className={`text-2xl font-bold ${(uw.cash_flow_forecast.avg_monthly_fcf||0)>=0?'text-green-700':'text-red-600'}`}>{fmt(uw.cash_flow_forecast.avg_monthly_fcf||0)}</p>
                </div>
                <div className="text-center bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400">PDSCR</p>
                  <p className={`text-2xl font-bold ${(dscr.pdscr||0)>=1.25?'text-green-700':'text-red-600'}`}>{dscr.pdscr?.toFixed(2)||'N/A'}x</p>
                </div>
              </div>
            </div>
          )}

          {/* SBA checklist */}
          <div className="bg-white rounded-xl border p-6">
            <h2 className="text-lg font-semibold mb-2">SBA 7(a) Document Checklist</h2>
            <p className="text-xs text-gray-400 mb-4">AI-generated based on your deal profile. Gather these before meeting with lenders.</p>
            <div className="space-y-2">
              {[
                {doc:'3 years business tax returns',required:true},
                {doc:'3 years personal tax returns (all owners ≥20%)',required:true},
                {doc:'YTD profit & loss statement (within 90 days)',required:true},
                {doc:'Current balance sheet',required:true},
                {doc:'Business debt schedule',required:true},
                {doc:'SBA Form 1919 — Borrower Information',required:true},
                {doc:'SBA Form 413 — Personal Financial Statement',required:true},
                {doc:'Letter of Intent or Purchase Agreement',required:true},
                {doc:'Evidence of equity injection (bank statements)',required:true},
                {doc:'Business plan / 3-year projections',required:false},
                {doc:'Accounts receivable aging report',required:false},
                {doc:'Seller transition agreement',required:false},
              ].map((item,i)=>(
                <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className={`w-5 h-5 rounded border-2 shrink-0 ${item.required?'border-blue-400':'border-gray-300'}`}/>
                  <p className="text-sm text-gray-800 flex-1">{item.doc}</p>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.required?'bg-blue-100 text-blue-700':'bg-gray-100 text-gray-500'}`}>{item.required?'Required':'Recommended'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* AI Chat */}
          <div className="bg-white rounded-xl border p-6">
            <h2 className="text-lg font-semibold mb-1">Ask Your Deal Advisor</h2>
            <p className="text-xs text-gray-400 mb-4">AI advisor with full context of your financials.</p>
            <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
              {chatMessages.length===0&&(
                <div className="flex flex-wrap gap-2">
                  {["What's my biggest risk?","Is this priced fairly?","What documents do I need first?","How do I improve my DSCR?"].map(q=>(
                    <button key={q} onClick={()=>setChatInput(q)} className="text-xs px-3 py-1.5 rounded-full border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">{q}</button>
                  ))}
                </div>
              )}
              {chatMessages.map((msg,i)=>(
                <div key={i} className={`flex ${msg.role==='user'?'justify-end':'justify-start'}`}>
                  <div className={`rounded-xl px-4 py-3 max-w-[85%] text-sm ${msg.role==='user'?'bg-blue-600 text-white':'bg-gray-50 border text-gray-800'}`}>{msg.content}</div>
                </div>
              ))}
              {chatLoading&&<div className="flex justify-start"><div className="bg-gray-50 border rounded-xl px-4 py-3 text-sm text-gray-400 animate-pulse">Analyzing your deal...</div></div>}
            </div>
            <div className="flex gap-2">
              <input type="text" value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendChat()} placeholder="Ask about this deal..." className="flex-1 text-sm border border-gray-200 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-400" disabled={chatLoading}/>
              <button onClick={sendChat} disabled={chatLoading||!chatInput.trim()} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40">Send</button>
            </div>
          </div>

          {/* Shareable link */}
          <div className="bg-white rounded-xl border p-6">
            <h2 className="text-lg font-semibold mb-2">Share with Lenders</h2>
            <p className="text-xs text-gray-400 mb-4">Send this link to lenders — they can view your diligence package and sign up to make an offer.</p>
            <div className="flex gap-2">
              <input readOnly value={`${typeof window!=='undefined'?window.location.origin:''}/lender/review/${dealId}`} className="flex-1 text-sm border border-gray-200 rounded-lg px-4 py-2 bg-gray-50 text-gray-600"/>
              <button onClick={()=>navigator.clipboard.writeText(`${window.location.origin}/lender/review/${dealId}`)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50">Copy</button>
            </div>
          </div>
        </>
      ):(
        <>
          <LockedSection title="18-Month Cash Flow Forecast" onUpgrade={upgrade}/>
          <LockedSection title="SBA 7(a) Document Checklist" onUpgrade={upgrade}/>
          <LockedSection title="AI Deal Advisor" onUpgrade={upgrade}/>
          <LockedSection title="Shareable Lender Link" onUpgrade={upgrade}/>
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-indigo-900 mb-1">Upgrade to Full Diligence Package</p>
                <p className="text-sm text-indigo-700 mb-3">Unlock the document checklist, cash flow forecast, AI advisor, shareable lender link, and all risk flag action steps.</p>
                <button onClick={upgrade} className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 flex items-center gap-2">
                  Upgrade — $399 <ArrowRight className="h-4 w-4"/>
                </button>
              </div>
              <Shield className="h-10 w-10 text-indigo-300 shrink-0"/>
            </div>
          </div>
        </>
      )}

      <p className="text-center text-xs text-gray-400">Informational only · Heradyne does not lend money, provide guarantees, or issue insurance</p>
    </div>
  );
}
