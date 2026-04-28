'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle, X, Loader, Zap } from 'lucide-react';
import { api } from '@/lib/api';

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
const fmtK = (n: number) => n >= 1000000 ? `$${(n/1000000).toFixed(1)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}K` : fmt(n);

const PRESETS = [
  {
    name: 'Fed Rate Shock (+200bps)',
    type: 'rate_shock',
    params: { rate_increase_bps: 200, industry_revenue_decline_pct: 0 },
    icon: '📈',
    desc: 'Model impact of a 200 basis point rate increase on all variable-rate loans',
  },
  {
    name: 'Recession: -25% Revenue',
    type: 'industry_decline',
    params: { rate_increase_bps: 0, industry_revenue_decline_pct: 25, affected_industry: 'ALL' },
    icon: '📉',
    desc: 'Broad 25% revenue decline across all industries',
  },
  {
    name: 'Restaurant/Retail Stress',
    type: 'industry_decline',
    params: { rate_increase_bps: 0, industry_revenue_decline_pct: 35, affected_industry: 'Restaurant / Food Service' },
    icon: '🍽️',
    desc: '35% revenue decline in restaurant and retail sector',
  },
  {
    name: 'Combined Shock',
    type: 'combined',
    params: { rate_increase_bps: 150, industry_revenue_decline_pct: 20, affected_industry: 'ALL' },
    icon: '⚡',
    desc: '+150bps rates AND 20% revenue decline — severe stress',
  },
];

export default function StressTestPage() {
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [custom, setCustom] = useState({
    scenario_name: '',
    scenario_type: 'rate_shock',
    rate_increase_bps: 0,
    industry_revenue_decline_pct: 0,
    affected_industry: 'ALL',
  });

  useEffect(() => {
    api.getStressTests().then(d => setHistory(d.stress_tests || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const runPreset = async (preset: typeof PRESETS[0]) => {
    setRunning(true);
    setError('');
    try {
      const res = await api.runStressTest({
        scenario_name: preset.name,
        scenario_type: preset.type,
        ...preset.params,
      });
      setResult(res);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Stress test failed');
    } finally { setRunning(false); }
  };

  const runCustom = async () => {
    if (!custom.scenario_name) { setError('Enter a scenario name'); return; }
    setRunning(true);
    setError('');
    try {
      const res = await api.runStressTest(custom);
      setResult(res);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Stress test failed');
    } finally { setRunning(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="h-8 w-8 animate-spin" /></div>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Zap className="h-7 w-7 text-yellow-500" />Stress Test Simulator</h1>
        <p className="text-gray-500">Model what happens to your portfolio under adverse scenarios</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 flex justify-between">{error}<button onClick={() => setError('')}><X className="h-4 w-4" /></button></div>}

      <div className="grid grid-cols-3 gap-6">
        {/* Left: presets + custom */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="font-semibold text-gray-800 mb-3">Quick Scenarios</h3>
            <div className="space-y-2">
              {PRESETS.map(preset => (
                <button key={preset.name} onClick={() => runPreset(preset)} disabled={running}
                  className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all">
                  <div className="flex items-start gap-2">
                    <span className="text-xl shrink-0">{preset.icon}</span>
                    <div>
                      <p className="font-medium text-gray-800 text-sm">{preset.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{preset.desc}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold text-gray-800 mb-3">Custom Scenario</h3>
            <div className="space-y-3">
              <div>
                <label className="label text-xs">Scenario Name</label>
                <input value={custom.scenario_name} onChange={e => setCustom({...custom, scenario_name: e.target.value})}
                  className="input w-full text-sm" placeholder="My stress test" />
              </div>
              <div>
                <label className="label text-xs">Rate Increase (basis points)</label>
                <input type="number" value={custom.rate_increase_bps} onChange={e => setCustom({...custom, rate_increase_bps: +e.target.value})}
                  className="input w-full text-sm" placeholder="200" />
                <p className="text-xs text-gray-400 mt-0.5">100bps = 1%</p>
              </div>
              <div>
                <label className="label text-xs">Revenue Decline (%)</label>
                <input type="number" value={custom.industry_revenue_decline_pct} onChange={e => setCustom({...custom, industry_revenue_decline_pct: +e.target.value})}
                  className="input w-full text-sm" placeholder="30" />
              </div>
              <div>
                <label className="label text-xs">Affected Industry</label>
                <input value={custom.affected_industry} onChange={e => setCustom({...custom, affected_industry: e.target.value})}
                  className="input w-full text-sm" placeholder="ALL or specific industry" />
              </div>
              <button onClick={runCustom} disabled={running} className="btn btn-primary w-full text-sm">
                {running ? <><Loader className="h-4 w-4 animate-spin inline mr-2" />Running...</> : 'Run Custom Test'}
              </button>
            </div>
          </div>

          {/* History */}
          {history.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-gray-800 mb-2 text-sm">Past Tests</h3>
              {(history || []).slice(0, 5).map((h: any) => (
                <div key={h.id} className="py-2 border-b border-gray-50 last:border-0">
                  <p className="text-sm font-medium text-gray-700">{h.scenario_name}</p>
                  <p className="text-xs text-gray-400">{h.loans_at_risk} loans at risk · {fmtK(h.exposure_at_risk || 0)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: results */}
        <div className="col-span-2">
          {running && (
            <div className="card text-center py-12">
              <Loader className="h-10 w-10 animate-spin text-blue-500 mx-auto mb-3" />
              <p className="text-gray-600 font-medium">Running stress test across your portfolio...</p>
            </div>
          )}

          {!running && !result && (
            <div className="card text-center py-16 border-dashed">
              <Zap className="h-12 w-12 text-gray-200 mx-auto mb-3" />
              <h2 className="text-lg font-bold text-gray-700 mb-1">Select a Scenario</h2>
              <p className="text-gray-400 text-sm">Choose a preset or build a custom scenario to see which loans flip to watch list</p>
            </div>
          )}

          {!running && result && (
            <div className="space-y-4">
              {/* Summary */}
              <div className={`rounded-2xl p-5 ${result.summary.loans_at_risk > 0 ? 'bg-red-900' : 'bg-green-900'} text-white`}>
                <p className="text-xs uppercase tracking-widest font-bold mb-2 text-white text-opacity-70">{result.scenario_name}</p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-3xl font-bold">{result.summary.loans_at_risk}</p>
                    <p className="text-sm opacity-70">Loans at Risk</p>
                  </div>
                  <div>
                    <p className="text-3xl font-bold">{fmtK(result.summary.exposure_at_risk)}</p>
                    <p className="text-sm opacity-70">Exposure at Risk</p>
                  </div>
                  <div>
                    <p className="text-3xl font-bold">{result.summary.pct_portfolio_at_risk}%</p>
                    <p className="text-sm opacity-70">of Portfolio</p>
                  </div>
                </div>
              </div>

              {/* Loan-by-loan results */}
              <div className="card">
                <h3 className="font-semibold text-gray-800 mb-3">Loan-by-Loan Impact</h3>
                <div className="space-y-2">
                  {(result.results || []).map((loan: any) => (
                    <div key={loan.deal_id} className={`p-3 rounded-xl flex items-start justify-between ${loan.at_risk ? 'bg-red-50 border border-red-200' : 'bg-gray-50'}`}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {loan.at_risk
                            ? <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                            : <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />}
                          <p className="font-medium text-gray-900 text-sm">{loan.deal_name}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            loan.status_change === 'DEFAULT RISK' ? 'bg-red-100 text-red-700' :
                            loan.status_change === 'WATCH' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-green-100 text-green-700'
                          }`}>{loan.status_change}</span>
                        </div>
                        <div className="flex gap-4 mt-1 text-xs text-gray-500">
                          <span>DSCR: <strong>{loan.baseline_dscr}x</strong> → <strong className={loan.stressed_dscr < 1.15 ? 'text-red-600' : 'text-gray-700'}>{loan.stressed_dscr}x</strong></span>
                          <span>{fmtK(loan.loan_amount)}</span>
                          <span>{loan.industry}</span>
                        </div>
                        {loan.impact_notes?.length > 0 && (
                          <p className="text-xs text-gray-400 mt-0.5">{loan.impact_notes.join(' · ')}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
