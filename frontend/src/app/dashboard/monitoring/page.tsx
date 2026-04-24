'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Activity, TrendingDown, TrendingUp, ChevronDown, ChevronUp, DollarSign } from 'lucide-react';
import { useAuth } from '@/lib/auth';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

const ALERT_CONFIG: Record<string, {label: string; color: string; bg: string; border: string}> = {
  none:       { label: 'Healthy',    color: '#15803d', bg: 'bg-green-50',  border: 'border-green-200' },
  watch:      { label: 'Watch',      color: '#ca8a04', bg: 'bg-yellow-50', border: 'border-yellow-200' },
  advisory:   { label: 'Advisory',   color: '#ea580c', bg: 'bg-orange-50', border: 'border-orange-200' },
  escalation: { label: 'Escalation', color: '#dc2626', bg: 'bg-red-50',    border: 'border-red-200' },
  pre_claim:  { label: 'Pre-Claim',  color: '#7c3aed', bg: 'bg-purple-50', border: 'border-purple-200' },
};

export default function MonitoringPage() {
  const { user } = useAuth();
  const [loans, setLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [cashflows, setCashflows] = useState<Record<number, any[]>>({});
  const [monitoring, setMonitoring] = useState<Record<number, any>>({});
  const [monitoringLoading, setMonitoringLoading] = useState<Record<number, boolean>>({});

  useEffect(() => { loadLoans(); }, []);

  const loadLoans = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      // Get all funded deals
      const dealsRes = await fetch(`${API}/api/v1/deals/`, { headers });
      if (!dealsRes.ok) return;
      const deals = await dealsRes.json();
      const funded = deals.filter((d: any) => d.status === 'funded');

      // Load UW data for each
      const loansWithUW = await Promise.all(funded.map(async (deal: any) => {
        try {
          const uwRes = await fetch(`${API}/api/v1/underwriting/deals/${deal.id}/full-underwriting`, { headers });
          const uw = uwRes.ok ? await uwRes.json() : null;
          return { ...deal, uw };
        } catch { return deal; }
      }));

      setLoans(loansWithUW);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadCashflow = async (dealId: number) => {
    if (cashflows[dealId]) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/v1/deals/${dealId}/cashflows`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setCashflows(prev => ({ ...prev, [dealId]: data }));
      }
    } catch {}
  };

  const runMonitoring = async (loan: any) => {
    if (monitoring[loan.id] || monitoringLoading[loan.id]) return;
    setMonitoringLoading(prev => ({ ...prev, [loan.id]: true }));
    try {
      const token = localStorage.getItem('token');
      const cf = cashflows[loan.id] || [];
      const latest = cf[cf.length - 1] || {};
      const prev3 = cf.slice(-4, -1);
      const avgRev = prev3.length ? prev3.reduce((s: number, c: any) => s + c.revenue, 0) / prev3.length : latest.revenue;

      const payload = {
        loan_id: loan.id,
        dscr_current: loan.uw?.dscr_pdscr?.dscr_base || 1.35,
        revenue_vs_projection: latest.revenue && avgRev ? (latest.revenue / avgRev) - 1 : 0,
        bank_balance_trend: (loan.uw?.cash_flow_forecast?.runway_months || 12) >= 6 ? 'stable' : 'declining',
        sba_payment_status: 'current',
        days_past_due: 0,
      };

      const res = await fetch(`${API}/api/v1/ai-agent/monitor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        setMonitoring(prev => ({ ...prev, [loan.id]: data }));
      }
    } catch (e) { console.error(e); }
    finally { setMonitoringLoading(prev => ({ ...prev, [loan.id]: false })); }
  };

  const toggleExpand = (loan: any) => {
    const newId = expanded === loan.id ? null : loan.id;
    setExpanded(newId);
    if (newId) {
      loadCashflow(loan.id);
      runMonitoring(loan);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"/></div>;

  if (loans.length === 0) return (
    <div className="max-w-2xl mx-auto text-center py-24">
      <Activity className="h-12 w-12 text-gray-300 mx-auto mb-4"/>
      <h2 className="text-xl font-semibold text-gray-700 mb-2">No Funded Loans</h2>
      <p className="text-gray-500">Funded loans will appear here with real-time health monitoring, cash flow tracking, and AI-powered early warning alerts.</p>
    </div>
  );

  // Summary counts
  const alertCounts = { none: 0, watch: 0, advisory: 0, escalation: 0, pre_claim: 0 };
  loans.forEach(l => {
    const score = l.uw?.health_score?.score || 80;
    const level = score >= 80 ? 'none' : score >= 65 ? 'watch' : score >= 50 ? 'advisory' : score >= 35 ? 'escalation' : 'pre_claim';
    alertCounts[level as keyof typeof alertCounts]++;
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Portfolio</h1>
        <p className="text-gray-500 mt-1">Real-time health tracking for all funded loans · {loans.length} active loan{loans.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Alert Summary */}
      <div className="grid grid-cols-5 gap-3">
        {Object.entries(alertCounts).map(([level, count]) => {
          const cfg = ALERT_CONFIG[level];
          return (
            <div key={level} className={`rounded-xl border p-3 text-center ${cfg.bg} ${cfg.border}`}>
              <p className="text-2xl font-bold" style={{color: cfg.color}}>{count}</p>
              <p className="text-xs font-semibold mt-1" style={{color: cfg.color}}>{cfg.label}</p>
            </div>
          );
        })}
      </div>

      {/* Loan List */}
      <div className="space-y-3">
        {loans.map(loan => {
          const score = loan.uw?.health_score?.score || 80;
          const alertLevel = score >= 80 ? 'none' : score >= 65 ? 'watch' : score >= 50 ? 'advisory' : score >= 35 ? 'escalation' : 'pre_claim';
          const cfg = ALERT_CONFIG[alertLevel];
          const isExpanded = expanded === loan.id;
          const cf = cashflows[loan.id] || [];
          const mon = monitoring[loan.id];
          const latest = cf[cf.length - 1];
          const prev = cf[cf.length - 2];
          const revChange = latest && prev ? ((latest.revenue - prev.revenue) / prev.revenue) * 100 : null;

          return (
            <div key={loan.id} className={`bg-white rounded-xl border ${isExpanded ? cfg.border : 'border-gray-200'} overflow-hidden`}>
              {/* Row header */}
              <div className="p-4 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => toggleExpand(loan)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {/* Alert badge */}
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.border} border`} style={{color: cfg.color}}>
                      {cfg.label}
                    </span>
                    {/* Name + details */}
                    <div>
                      <p className="font-semibold text-gray-900">{loan.name}</p>
                      <p className="text-xs text-gray-400">{loan.industry} · {fmt(loan.loan_amount_requested)} · {loan.state}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    {/* Health score */}
                    <div className="text-center">
                      <p className="text-xs text-gray-400">Health</p>
                      <p className="font-bold" style={{color: cfg.color}}>{score.toFixed(0)}/100</p>
                    </div>
                    {/* DSCR */}
                    <div className="text-center hidden md:block">
                      <p className="text-xs text-gray-400">DSCR</p>
                      <p className={`font-bold ${(loan.uw?.dscr_pdscr?.dscr_base||0) >= 1.25 ? 'text-green-700' : 'text-red-600'}`}>
                        {loan.uw?.dscr_pdscr?.dscr_base?.toFixed(2) || 'N/A'}x
                      </p>
                    </div>
                    {/* Revenue trend */}
                    {revChange !== null && (
                      <div className="text-center hidden md:block">
                        <p className="text-xs text-gray-400">Rev Trend</p>
                        <p className={`font-bold flex items-center gap-1 ${revChange >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                          {revChange >= 0 ? <TrendingUp className="h-3 w-3"/> : <TrendingDown className="h-3 w-3"/>}
                          {Math.abs(revChange).toFixed(1)}%
                        </p>
                      </div>
                    )}
                    {/* Runway */}
                    <div className="text-center hidden md:block">
                      <p className="text-xs text-gray-400">Runway</p>
                      <p className={`font-bold ${(loan.uw?.cash_flow_forecast?.runway_months||0) >= 6 ? 'text-green-700' : 'text-red-600'}`}>
                        {loan.uw?.cash_flow_forecast?.runway_months === 18 ? '18+' : loan.uw?.cash_flow_forecast?.runway_months?.toFixed(1) || 'N/A'} mo
                      </p>
                    </div>
                    {isExpanded ? <ChevronUp className="h-5 w-5 text-gray-400"/> : <ChevronDown className="h-5 w-5 text-gray-400"/>}
                  </div>
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border-t border-gray-100 p-5 space-y-5">

                  {/* Cash flow mini chart */}
                  {cf.length > 0 && (() => {
                    const w = 500; const h = 100; const p = 30;
                    const maxR = Math.max(...cf.map((c: any) => c.revenue));
                    const minE = Math.min(...cf.map((c: any) => c.ebitda), 0);
                    const range = maxR - minE || 1;
                    const xs = (i: number) => p + (i / (cf.length - 1 || 1)) * (w - p*2);
                    const ys = (v: number) => h - p/2 - ((v - minE) / range) * (h - p);
                    return (
                      <div>
                        <p className="text-sm font-semibold text-gray-700 mb-2">Cash Flow — {cf.length} months</p>
                        <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{height: 100}}>
                          <polyline points={cf.map((c: any, i: number) => `${xs(i)},${ys(c.revenue)}`).join(' ')} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinejoin="round"/>
                          <polyline points={cf.map((c: any, i: number) => `${xs(i)},${ys(c.ebitda)}`).join(' ')} fill="none" stroke="#16a34a" strokeWidth="1.5" strokeLinejoin="round" strokeDasharray="3,2"/>
                          {cf.map((c: any, i: number) => <circle key={i} cx={xs(i)} cy={ys(c.revenue)} r="2.5" fill="#2563eb"/>)}
                          {cf.map((c: any, i: number) => i % 3 === 0 && <text key={i} x={xs(i)} y={h} textAnchor="middle" fontSize="8" fill="#9ca3af">{c.month}/{String(c.year).slice(2)}</text>)}
                        </svg>
                        <div className="grid grid-cols-3 gap-3 mt-3">
                          {cf.slice(-3).map((c: any, i: number) => (
                            <div key={i} className="text-center bg-gray-50 rounded-lg p-2">
                              <p className="text-xs text-gray-400">{c.month}/{c.year}</p>
                              <p className="text-sm font-semibold text-blue-700">{fmt(c.revenue)}</p>
                              <p className="text-xs text-green-700">{fmt(c.ebitda)} EBITDA</p>
                              <p className={`text-xs ${(c.post_debt_fcf||0) >= 0 ? 'text-gray-600' : 'text-red-600'}`}>
                                {fmt(c.post_debt_fcf || c.ebitda - 22847)} FCF
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* AI Monitoring Assessment */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-gray-700">AI Monitoring Assessment</p>
                      {monitoringLoading[loan.id] && <span className="text-xs text-gray-400 animate-pulse">Running assessment...</span>}
                    </div>
                    {mon ? (
                      <div className={`rounded-lg border p-4 ${ALERT_CONFIG[mon.alert_level || 'none'].bg} ${ALERT_CONFIG[mon.alert_level || 'none'].border}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-bold" style={{color: ALERT_CONFIG[mon.alert_level || 'none'].color}}>
                            {ALERT_CONFIG[mon.alert_level || 'none'].label} — Health {mon.health_score}/100
                          </span>
                          <span className="text-xs text-gray-500">· {mon.trend_direction}</span>
                        </div>
                        {mon.key_insight && <p className="text-sm text-gray-700 mb-3 italic">"{mon.key_insight}"</p>}
                        {mon.narrative && (
                          <div className="bg-white rounded-lg p-3 border mb-3">
                            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">What's Happening</p>
                            <p className="text-sm text-gray-800">{mon.narrative}</p>
                          </div>
                        )}
                        {mon.active_alerts?.length > 0 && (
                          <div className="space-y-2 mb-3">
                            {(mon.active_alerts || []).map((alert: any, i: number) => (
                              <div key={i} className="flex gap-2 bg-red-50 border border-red-100 rounded-lg p-2">
                                <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5"/>
                                <div>
                                  <p className="text-sm font-medium text-gray-800">{alert.message}</p>
                                  <p className="text-xs text-gray-500 mt-0.5">{alert.recommended_action}</p>
                                  {alert.dollar_at_risk && <p className="text-xs text-red-600 font-semibold mt-0.5">At risk: {alert.dollar_at_risk}</p>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {mon.recommended_intervention && (
                          <div className="bg-white rounded-lg p-3 border">
                            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Recommended Action</p>
                            <p className="text-sm text-gray-800">{mon.recommended_intervention}</p>
                          </div>
                        )}
                      </div>
                    ) : !monitoringLoading[loan.id] && (
                      <p className="text-sm text-gray-400">Assessment will load automatically.</p>
                    )}
                  </div>

                  {/* Playbooks */}
                  {loan.uw?.playbooks?.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-gray-700 mb-2">Active Playbooks</p>
                      <div className="space-y-2">
                        {loan.uw.playbooks.map((pb: any, i: number) => (
                          <div key={i} className={`rounded-lg border p-3 ${pb.severity === 'critical' ? 'bg-red-50 border-red-200' : pb.severity === 'warning' ? 'bg-yellow-50 border-yellow-200' : 'bg-blue-50 border-blue-200'}`}>
                            <div className="flex justify-between items-start">
                              <p className="text-sm font-medium text-gray-800">{pb.title}</p>
                              {pb.estimated_annual_impact && <span className="text-xs font-semibold text-gray-500 shrink-0 ml-2">{fmt(pb.estimated_annual_impact)}/yr</span>}
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">{pb.impact_summary}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Key metrics grid */}
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      {label: 'Cash Flow', val: loan.uw?.health_score?.cashflow},
                      {label: 'Stability', val: loan.uw?.health_score?.stability},
                      {label: 'Growth', val: loan.uw?.health_score?.growth},
                      {label: 'Liquidity', val: loan.uw?.health_score?.liquidity},
                    ].map(s => (
                      <div key={s.label} className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-400">{s.label}</p>
                        <p className="font-bold text-lg" style={{color: (s.val||0) >= 70 ? '#15803d' : (s.val||0) >= 50 ? '#ca8a04' : '#dc2626'}}>
                          {s.val?.toFixed(0) || 'N/A'}
                        </p>
                        <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                          <div className="h-1 rounded-full" style={{width: `${s.val||0}%`, backgroundColor: (s.val||0) >= 70 ? '#15803d' : (s.val||0) >= 50 ? '#ca8a04' : '#dc2626'}}/>
                        </div>
                      </div>
                    ))}
                  </div>

                </div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}
