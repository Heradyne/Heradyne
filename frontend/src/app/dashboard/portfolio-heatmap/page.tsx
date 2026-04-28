'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle, TrendingUp, DollarSign, BarChart3, Building2 } from 'lucide-react';
import { api } from '@/lib/api';

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
const fmtK = (n: number) => n >= 1000000 ? `$${(n/1000000).toFixed(1)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}K` : fmt(n);

const healthColor = (score: number | null) => {
  if (score === null || score === undefined) return '#9ca3af';
  if (score >= 75) return '#10b981';
  if (score >= 50) return '#f59e0b';
  if (score >= 30) return '#f97316';
  return '#ef4444';
};
const healthLabel = (score: number | null) => {
  if (score === null || score === undefined) return 'Unknown';
  if (score >= 75) return 'Healthy';
  if (score >= 50) return 'Watch';
  if (score >= 30) return 'Concern';
  return 'At Risk';
};

export default function PortfolioHeatmapPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'heatmap' | 'benchmarks' | 'deals'>('heatmap');
  const [benchmarks, setBenchmarks] = useState<any>(null);

  useEffect(() => {
    api.getPortfolioHeatmap().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const loadBenchmarks = async () => {
    if (!benchmarks) {
      const b = await api.getPortfolioBenchmarks().catch(() => null);
      setBenchmarks(b);
    }
    setActiveTab('benchmarks');
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="h-8 w-8 animate-spin" /></div>;

  if (!data?.exists) {
    return (
      <div className="card text-center py-16">
        <BarChart3 className="h-12 w-12 text-gray-200 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-gray-700 mb-2">No Portfolio Data Yet</h2>
        <p className="text-gray-500">Accept your first deal match to start seeing portfolio analytics.</p>
      </div>
    );
  }

  const { summary, industry_heatmap, size_distribution, vintage_distribution, deal_health_map, concentration_warnings } = data;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Portfolio Heat Map</h1>
          <p className="text-gray-500">Concentration risk and health across your portfolio</p>
        </div>
        <div className="flex gap-2">
          {(['heatmap', 'benchmarks', 'deals'] as const).map(tab => (
            <button key={tab} onClick={() => tab === 'benchmarks' ? loadBenchmarks() : setActiveTab(tab)}
              className={`btn text-sm capitalize ${activeTab === tab ? 'btn-primary' : 'btn-secondary'}`}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        {[
          { label: 'Total Deals', value: summary.total_deals, color: 'text-gray-900' },
          { label: 'Total Exposure', value: fmtK(summary.total_exposure), color: 'text-blue-700' },
          { label: 'Avg Loan Size', value: fmtK(summary.avg_loan_size), color: 'text-gray-700' },
          { label: 'Avg Health Score', value: summary.avg_health_score ? `${summary.avg_health_score}/100` : '—', color: healthColor(summary.avg_health_score), isStyle: true },
          { label: 'At-Risk Loans', value: summary.at_risk_count, color: summary.at_risk_count > 0 ? 'text-red-600' : 'text-green-600' },
        ].map(({ label, value, color, isStyle }) => (
          <div key={label} className="card text-center">
            <p className="text-xs text-gray-400 uppercase font-medium mb-1">{label}</p>
            <p className={`text-2xl font-bold ${!isStyle ? color : ''}`} style={isStyle ? { color } : {}}>{value}</p>
          </div>
        ))}
      </div>

      {/* Concentration warnings */}
      {(concentration_warnings || []).length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6">
          <p className="text-sm font-bold text-orange-800 flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4" /> Concentration Warnings
          </p>
          <div className="flex gap-4">
            {(concentration_warnings || []).map((w: any) => (
              <div key={w.industry} className="text-sm text-orange-700">
                <strong>{w.industry}</strong> is {w.pct_of_portfolio}% of portfolio — consider diversifying
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Heatmap tab */}
      {activeTab === 'heatmap' && (
        <div className="grid grid-cols-2 gap-6">
          {/* Industry concentration */}
          <div className="card">
            <h3 className="font-semibold text-gray-800 mb-4">Industry Concentration</h3>
            <div className="space-y-3">
              {(industry_heatmap || []).map((ind: any) => (
                <div key={ind.industry}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">{ind.industry}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{ind.count} loans · {fmtK(ind.exposure)}</span>
                      {ind.risk_flag && <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                      <div className="h-6 rounded-full flex items-center px-2 transition-all" style={{ width: `${Math.min(ind.pct_of_portfolio, 100)}%`, background: ind.color }}>
                        <span className="text-xs text-white font-bold">{ind.pct_of_portfolio}%</span>
                      </div>
                    </div>
                    <span className="text-xs font-medium w-20 text-right" style={{ color: ind.color }}>
                      {ind.avg_health_score ? `${ind.avg_health_score} score` : 'No data'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Loan size distribution */}
          <div className="card">
            <h3 className="font-semibold text-gray-800 mb-4">Loan Size Distribution</h3>
            <div className="space-y-3">
              {(size_distribution || []).map((bucket: any) => (
                <div key={bucket.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">{bucket.label}</span>
                    <span className="text-xs text-gray-400">{bucket.count} loans · {fmtK(bucket.exposure)}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-4">
                    <div className="h-4 rounded-full bg-blue-500 transition-all" style={{ width: `${(bucket.count / summary.total_deals) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Vintage */}
          <div className="card">
            <h3 className="font-semibold text-gray-800 mb-4">Portfolio Vintage</h3>
            <div className="flex items-end gap-3 h-32">
              {(vintage_distribution || []).map((v: any) => {
                const maxCount = Math.max(...(vintage_distribution || []).map((x: any) => x.count), 1);
                return (
                  <div key={v.year} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-gray-500">{v.count}</span>
                    <div className="w-full bg-indigo-400 rounded-t transition-all" style={{ height: `${(v.count / maxCount) * 80}px` }} />
                    <span className="text-xs text-gray-400">{v.year}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Health score distribution */}
          <div className="card">
            <h3 className="font-semibold text-gray-800 mb-4">Portfolio Health Summary</h3>
            {[
              { label: 'Healthy (75+)', min: 75, color: '#10b981' },
              { label: 'Watch (50-74)', min: 50, max: 75, color: '#f59e0b' },
              { label: 'Concern (30-49)', min: 30, max: 50, color: '#f97316' },
              { label: 'At Risk (<30)', min: 0, max: 30, color: '#ef4444' },
            ].map(bucket => {
              const count = (deal_health_map || []).filter((d: any) =>
                d.health_score !== null &&
                d.health_score >= bucket.min &&
                (bucket.max === undefined || d.health_score < bucket.max)
              ).length;
              const exposure = (deal_health_map || []).filter((d: any) =>
                d.health_score !== null &&
                d.health_score >= bucket.min &&
                (bucket.max === undefined || d.health_score < bucket.max)
              ).reduce((sum: number, d: any) => sum + (d.amount || 0), 0);
              return (
                <div key={bucket.label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: bucket.color }} />
                    <span className="text-sm text-gray-700">{bucket.label}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900">{count} loans</p>
                    <p className="text-xs text-gray-400">{fmtK(exposure)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Benchmarks tab */}
      {activeTab === 'benchmarks' && benchmarks && (
        <div className="grid grid-cols-2 gap-6">
          <div className="card">
            <h3 className="font-semibold text-gray-800 mb-4">Your Portfolio vs Platform</h3>
            {[
              { label: 'Avg Loan Size', yours: fmtK(benchmarks.your_portfolio.avg_loan_size), platform: fmtK(benchmarks.platform_benchmarks.avg_loan_size) },
              { label: 'Avg DSCR', yours: benchmarks.your_portfolio.avg_dscr?.toFixed(2) || '—', platform: benchmarks.platform_benchmarks.avg_dscr?.toFixed(2) || '—' },
              { label: 'Total Loans', yours: benchmarks.your_portfolio.total_loans, platform: benchmarks.platform_benchmarks.total_loans },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between py-3 border-b border-gray-50">
                <span className="text-sm text-gray-600">{row.label}</span>
                <div className="flex gap-6 text-right">
                  <div><p className="text-xs text-gray-400">You</p><p className="font-bold text-blue-700">{row.yours}</p></div>
                  <div><p className="text-xs text-gray-400">Platform Avg</p><p className="font-bold text-gray-600">{row.platform}</p></div>
                </div>
              </div>
            ))}
            <div className="mt-4 bg-blue-50 rounded-xl p-3">
              <p className="text-xs font-bold text-blue-700 mb-1">Platform: {benchmarks.platform_benchmarks.total_lenders} lenders · {benchmarks.platform_benchmarks.total_loans} loans</p>
              {(benchmarks.insights || []).map((i: string, idx: number) => (
                <p key={idx} className="text-sm text-blue-800">{i}</p>
              ))}
            </div>
          </div>
          <div className="card">
            <h3 className="font-semibold text-gray-800 mb-4">Your Percentile Rankings</h3>
            {[
              { label: 'DSCR Percentile', value: benchmarks.your_percentiles.dscr_percentile, desc: 'Higher = better credit quality' },
              { label: 'Loan Size Percentile', value: benchmarks.your_percentiles.loan_size_percentile, desc: 'Position vs other lenders' },
            ].map(p => (
              <div key={p.label} className="mb-4">
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">{p.label}</span>
                  <span className="text-sm font-bold text-blue-700">{p.value ? `${p.value}th` : '—'}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3">
                  <div className="h-3 rounded-full bg-blue-500" style={{ width: `${p.value || 0}%` }} />
                </div>
                <p className="text-xs text-gray-400 mt-1">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deals tab */}
      {activeTab === 'deals' && (
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4">All Portfolio Deals — Sorted by Health Score</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase border-b">
                <th className="pb-2">Deal</th>
                <th className="pb-2">Industry</th>
                <th className="pb-2 text-right">Loan Amount</th>
                <th className="pb-2 text-right">DSCR</th>
                <th className="pb-2 text-center">Health</th>
                <th className="pb-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {(deal_health_map || []).map((d: any) => (
                <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2.5">
                    <a href={`/dashboard/deals/${d.id}`} className="font-medium text-gray-900 hover:text-blue-600">{d.name}</a>
                  </td>
                  <td className="py-2.5 text-gray-500">{d.industry}</td>
                  <td className="py-2.5 text-right font-medium">{fmtK(d.amount)}</td>
                  <td className="py-2.5 text-right">{d.dscr?.toFixed(2) || '—'}</td>
                  <td className="py-2.5 text-center">
                    {d.health_score ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: d.color }}>
                        {d.health_score} · {healthLabel(d.health_score)}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-2.5 text-center">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">{d.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
