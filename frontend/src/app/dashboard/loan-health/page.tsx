'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Activity, DollarSign, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '@/lib/auth';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function fmt(n: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n); }

export default function LoanHealthPage() {
  const { user } = useAuth();
  const [loan, setLoan] = useState<any>(null);
  const [cashflow, setCashflow] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{role:string;content:string}[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [expandedPlaybook, setExpandedPlaybook] = useState<number|null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const headers = { Authorization: `Bearer ${token}` };

      // Get funded deals for this borrower
      const dealsRes = await fetch(`${API}/api/v1/deals/`, { headers });
      if (!dealsRes.ok) return;
      const deals = await dealsRes.json();
      // Find funded deal — check both 'funded' status and deals with HVAC in name as fallback
      const funded = deals.find((d: any) => d.status === 'funded') ||
                     deals.find((d: any) => d.name?.toLowerCase().includes('hvac'));
      if (!funded) { setLoading(false); return; }

      // Get full deal + UW data
      const [dealRes, uwRes, cfRes] = await Promise.all([
        fetch(`${API}/api/v1/deals/${funded.id}`, { headers }),
        fetch(`${API}/api/v1/underwriting/deals/${funded.id}/full-underwriting`, { headers }),
        fetch(`${API}/api/v1/deals/${funded.id}/cashflows`, { headers }),
      ]);

      const dealData = dealRes.ok ? await dealRes.json() : funded;
      const uwData = uwRes.ok ? await uwRes.json() : null;
      const cfData = cfRes.ok ? await cfRes.json() : [];

      setLoan({ ...dealData, uw: uwData });
      setCashflow(cfData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading || !loan) return;
    const msg = chatInput.trim();
    setChatInput('');
    const newHistory = [...chatMessages, { role: 'user', content: msg }];
    setChatMessages(newHistory);
    setChatLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API}/api/v1/chat/deals/${loan.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: msg, history: chatMessages.slice(-6) }),
      });
      if (res.ok) {
        const data = await res.json();
        setChatMessages([...newHistory, { role: 'assistant', content: data.reply }]);
      }
    } catch (e) {
      setChatMessages([...newHistory, { role: 'assistant', content: 'Connection error. Please try again.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;

  if (!loan) return (
    <div className="max-w-2xl mx-auto text-center py-24">
      <Activity className="h-12 w-12 text-gray-300 mx-auto mb-4" />
      <h2 className="text-xl font-semibold text-gray-700 mb-2">No Active Loan</h2>
      <p className="text-gray-500">Once your deal is funded, your loan health dashboard will appear here with cash flow tracking, alerts, and AI-powered recommendations.</p>
    </div>
  );

  const uw = loan.uw;
  const healthScore = uw?.health_score?.score || 0;
  const healthColor = healthScore >= 70 ? '#15803d' : healthScore >= 50 ? '#ca8a04' : '#dc2626';
  const healthBg = healthScore >= 70 ? 'bg-green-50 border-green-200' : healthScore >= 50 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200';
  const playbooks = uw?.playbooks || [];
  const runway = uw?.cash_flow_forecast?.runway_months;

  // Cash flow chart dimensions
  const chartW = 600; const chartH = 140; const pad = 40;
  const maxRev = Math.max(...cashflow.map((c: any) => c.revenue), 1);
  const minEbitda = Math.min(...cashflow.map((c: any) => c.ebitda), 0);
  const maxEbitda = Math.max(...cashflow.map((c: any) => c.ebitda), 1);
  const range = maxRev;

  const xScale = (i: number) => pad + (i / (cashflow.length - 1 || 1)) * (chartW - pad * 2);
  const yScale = (v: number) => chartH - pad/2 - ((v - minEbitda) / (range - minEbitda || 1)) * (chartH - pad);

  const revPoints = cashflow.map((c: any, i: number) => `${xScale(i)},${yScale(c.revenue)}`).join(' ');
  const ebitdaPoints = cashflow.map((c: any, i: number) => `${xScale(i)},${yScale(c.ebitda)}`).join(' ');

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Business Dashboard</h1>
        <p className="text-gray-500 mt-1">{loan.name} · SBA 7(a) · {fmt(loan.loan_amount_requested)}</p>
      </div>

      {/* Health Score + Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className={`rounded-xl border p-4 ${healthBg}`}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{color: healthColor}}>Health Score</p>
          <p className="text-3xl font-bold" style={{color: healthColor}}>{healthScore.toFixed(0)}</p>
          <p className="text-xs mt-1" style={{color: healthColor}}>out of 100</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">DSCR</p>
          <p className={`text-3xl font-bold ${(uw?.dscr_pdscr?.dscr_base||0) >= 1.25 ? 'text-green-700' : 'text-red-600'}`}>
            {uw?.dscr_pdscr?.dscr_base?.toFixed(2) || 'N/A'}x
          </p>
          <p className="text-xs text-gray-400 mt-1">min 1.25x required</p>
        </div>
        <div className={`rounded-xl border p-4 ${(runway||0) >= 6 ? 'bg-green-50 border-green-200' : (runway||0) >= 2 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'}`}>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1">Cash Runway</p>
          <p className={`text-3xl font-bold ${(runway||0) >= 6 ? 'text-green-700' : (runway||0) >= 2 ? 'text-yellow-700' : 'text-red-600'}`}>
            {runway === 18 ? '18+' : runway?.toFixed(1) || 'N/A'}
          </p>
          <p className="text-xs text-gray-400 mt-1">months</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">SBA Eligible</p>
          <p className={`text-3xl font-bold ${uw?.sba_eligibility?.eligible ? 'text-green-700' : 'text-red-600'}`}>
            {uw?.sba_eligibility?.eligible ? '✓ Yes' : '✕ No'}
          </p>
          <p className="text-xs text-gray-400 mt-1">7(a) program</p>
        </div>
      </div>

      {/* Cash Flow Chart */}
      {cashflow.length > 0 && (
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold mb-1">Cash Flow — {cashflow.length} Months</h2>
          <p className="text-xs text-gray-400 mb-4">Revenue vs EBITDA actuals since funding</p>
          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full" style={{height: 160}}>
            {/* Grid lines */}
            {[0.25, 0.5, 0.75].map(t => (
              <line key={t} x1={pad} y1={chartH - pad/2 - t*(chartH-pad)} x2={chartW-pad} y2={chartH - pad/2 - t*(chartH-pad)} stroke="#f0f0f0" strokeWidth="1"/>
            ))}
            {/* Revenue line */}
            <polyline points={revPoints} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinejoin="round"/>
            {/* EBITDA line */}
            <polyline points={ebitdaPoints} fill="none" stroke="#16a34a" strokeWidth="2" strokeLinejoin="round" strokeDasharray="4,2"/>
            {/* Data points */}
            {cashflow.map((c: any, i: number) => (
              <g key={i}>
                <circle cx={xScale(i)} cy={yScale(c.revenue)} r="3" fill="#2563eb"/>
                <circle cx={xScale(i)} cy={yScale(c.ebitda)} r="2.5" fill="#16a34a"/>
              </g>
            ))}
            {/* Month labels — show every 3rd */}
            {cashflow.map((c: any, i: number) => i % 3 === 0 && (
              <text key={i} x={xScale(i)} y={chartH} textAnchor="middle" fontSize="9" fill="#9ca3af">
                {c.month}/{String(c.year).slice(2)}
              </text>
            ))}
          </svg>
          <div className="flex gap-6 mt-2">
            <div className="flex items-center gap-2"><div className="w-6 h-0.5 bg-blue-600"/><span className="text-xs text-gray-500">Revenue</span></div>
            <div className="flex items-center gap-2"><div className="w-6 h-0.5 bg-green-600" style={{borderTop: '2px dashed #16a34a', background: 'none'}}/><span className="text-xs text-gray-500">EBITDA</span></div>
          </div>
          {/* Latest month summary */}
          {cashflow.length > 0 && (() => {
            const latest = cashflow[cashflow.length - 1];
            const prev = cashflow[cashflow.length - 2];
            const revChange = prev ? ((latest.revenue - prev.revenue) / prev.revenue) * 100 : 0;
            return (
              <div className="mt-4 pt-4 border-t flex gap-6">
                <div>
                  <p className="text-xs text-gray-400">Latest Revenue</p>
                  <p className="font-semibold text-gray-900">{fmt(latest.revenue)}</p>
                  <p className={`text-xs ${revChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {revChange >= 0 ? '▲' : '▼'} {Math.abs(revChange).toFixed(1)}% vs prior month
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Latest EBITDA</p>
                  <p className="font-semibold text-gray-900">{fmt(latest.ebitda)}</p>
                  <p className="text-xs text-gray-400">{((latest.ebitda/latest.revenue)*100).toFixed(1)}% margin</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Post-Debt FCF</p>
                  <p className={`font-semibold ${(latest.post_debt_fcf||0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {fmt(latest.post_debt_fcf || latest.ebitda - 22847)}
                  </p>
                  <p className="text-xs text-gray-400">after loan payment</p>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Active Alerts / Playbooks */}
      {playbooks.length > 0 && (
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold mb-1">Action Items</h2>
          <p className="text-xs text-gray-400 mb-4">AI-generated recommendations based on your current financials</p>
          <div className="space-y-3">
            {playbooks.map((pb: any, i: number) => (
              <div key={i} className={`rounded-lg border p-4 ${pb.severity === 'critical' ? 'bg-red-50 border-red-200' : pb.severity === 'warning' ? 'bg-yellow-50 border-yellow-200' : 'bg-blue-50 border-blue-200'}`}>
                <div className="flex items-start justify-between cursor-pointer" onClick={() => setExpandedPlaybook(expandedPlaybook === i ? null : i)}>
                  <div className="flex items-start gap-3">
                    {pb.severity === 'critical' ? <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0"/> : pb.severity === 'warning' ? <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5 shrink-0"/> : <TrendingUp className="h-5 w-5 text-blue-500 mt-0.5 shrink-0"/>}
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{pb.title}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{pb.impact_summary}</p>
                      {pb.estimated_annual_impact && <p className="text-xs font-semibold mt-1" style={{color: pb.severity === 'critical' ? '#dc2626' : pb.severity === 'warning' ? '#ca8a04' : '#2563eb'}}>
                        {fmt(pb.estimated_annual_impact)} annual impact
                      </p>}
                    </div>
                  </div>
                  {expandedPlaybook === i ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0"/> : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0"/>}
                </div>
                {expandedPlaybook === i && pb.actions && (
                  <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                    {pb.actions.map((a: any) => (
                      <div key={a.step} className="flex gap-3">
                        <span className="w-6 h-6 rounded-full bg-white border text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{a.step}</span>
                        <div>
                          <p className="text-xs font-semibold text-gray-500">{a.label}</p>
                          <p className="text-sm text-gray-800">{a.detail}</p>
                          {a.dollar_impact && <p className="text-xs text-gray-500 mt-0.5">{fmt(a.dollar_impact)} potential impact</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Chat */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-lg font-semibold mb-1">Ask Your Business Advisor</h2>
        <p className="text-xs text-gray-400 mb-4">Get specific advice about your loan, cash flow, and how to improve your business health score. Powered by AI with full context of your financials.</p>
        <div className="space-y-3 mb-4 max-h-72 overflow-y-auto">
          {chatMessages.length === 0 && (
            <div className="flex flex-wrap gap-2">
              {[
                "Why is my health score dropping?",
                "How do I improve my DSCR?",
                "What should I do first to fix my cash flow?",
                "Am I at risk of defaulting?",
                "How do I get more commercial accounts?",
              ].map(q => (
                <button key={q} onClick={() => setChatInput(q)}
                  className="text-xs px-3 py-1.5 rounded-full border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors">
                  {q}
                </button>
              ))}
            </div>
          )}
          {chatMessages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`rounded-xl px-4 py-3 max-w-[85%] text-sm leading-relaxed ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-50 border border-gray-200 text-gray-800'}`}>
                {msg.content}
              </div>
            </div>
          ))}
          {chatLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-400">
                <span className="animate-pulse">Analyzing your financials...</span>
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendChat()}
            placeholder="Ask about your loan, cash flow, or business health..."
            className="flex-1 text-sm border border-gray-200 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-400"
            disabled={chatLoading}/>
          <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors">
            Send
          </button>
        </div>
      </div>

      {/* Health Subscores */}
      {uw?.health_score && (
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold mb-4">Health Score Breakdown</h2>
          <div className="space-y-3">
            {[
              {label: 'Cash Flow', val: uw.health_score.cashflow, desc: 'Ability to generate positive post-debt cash flow'},
              {label: 'Stability', val: uw.health_score.stability, desc: 'Consistency of revenue and operations'},
              {label: 'Growth', val: uw.health_score.growth, desc: 'Revenue and EBITDA trend direction'},
              {label: 'Liquidity', val: uw.health_score.liquidity, desc: 'Working capital and cash reserves'},
              {label: 'Distress', val: uw.health_score.distress, desc: 'Early warning signal score (higher = less distress)'},
            ].map(s => (
              <div key={s.label}>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">{s.label}</span>
                  <span className="text-sm font-semibold" style={{color: (s.val||0) >= 70 ? '#15803d' : (s.val||0) >= 50 ? '#ca8a04' : '#dc2626'}}>{s.val?.toFixed(0) || 'N/A'}/100</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className="h-2 rounded-full transition-all" style={{width: `${s.val||0}%`, backgroundColor: (s.val||0) >= 70 ? '#15803d' : (s.val||0) >= 50 ? '#ca8a04' : '#dc2626'}}/>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
