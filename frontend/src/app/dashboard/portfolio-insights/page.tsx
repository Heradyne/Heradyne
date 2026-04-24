'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { PieChart, Loader, AlertTriangle, RefreshCw, TrendingUp, TrendingDown, Minus, CheckCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatPercent } from '@/lib/utils';

const HEALTH_COLOR: Record<string, string> = {
  green: 'text-green-600',
  yellow: 'text-yellow-600',
  red: 'text-red-600',
};
const URGENCY_BG: Record<string, string> = {
  green: 'bg-green-50 border-green-200',
  yellow: 'bg-yellow-50 border-yellow-200',
  red: 'bg-red-50 border-red-200',
};
const RISK_COLOR: Record<string, string> = {
  low: 'text-green-700 bg-green-100',
  medium: 'text-yellow-700 bg-yellow-100',
  high: 'text-red-700 bg-red-100',
};

export default function PortfolioInsightsPage() {
  const [insights, setInsights] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  useEffect(() => { loadInsights(); }, []);

  const loadInsights = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.getPortfolioInsights();
      setInsights(result);
      setLastRefreshed(new Date());
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to load portfolio insights');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader className="h-10 w-10 animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">Analyzing your portfolio...</p>
          <p className="text-gray-400 text-sm mt-1">Generating AI-powered insights across all loans</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <PieChart className="h-6 w-6 text-blue-600" />
            Portfolio Insights
          </h1>
          <p className="text-gray-500 mt-1">AI-powered analysis of your loan portfolio</p>
          {lastRefreshed && (
            <p className="text-xs text-gray-400 mt-1">Last updated: {lastRefreshed.toLocaleTimeString()}</p>
          )}
        </div>
        <button onClick={loadInsights} disabled={loading} className="btn btn-secondary inline-flex items-center">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {!insights && !loading && !error && (
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-12 text-center">
          <PieChart className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">No portfolio data available yet</p>
          <p className="text-gray-300 text-sm mt-1">Portfolio insights appear once you have originated loans</p>
        </div>
      )}

      {insights && (
        <div className="space-y-6">
          {/* Portfolio health banner */}
          <div className={`rounded-xl border p-6 ${insights.portfolio_health_score >= 70 ? 'bg-green-50 border-green-200' : insights.portfolio_health_score >= 50 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900">Portfolio Health Score</h2>
              <span className={`text-4xl font-bold ${insights.portfolio_health_score >= 70 ? 'text-green-700' : insights.portfolio_health_score >= 50 ? 'text-yellow-700' : 'text-red-700'}`}>
                {insights.portfolio_health_score}/100
              </span>
            </div>
            <p className="text-gray-700">{insights.health_narrative}</p>
          </div>

          {/* Top 3 actions */}
          {insights.top_3_actions?.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="font-semibold text-gray-800 mb-3">🎯 Top Priority Actions</h3>
              <div className="space-y-2">
                {(insights.top_3_actions || []).map((action: string, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                    <span className="text-blue-700 font-bold text-sm shrink-0">{i + 1}</span>
                    <p className="text-sm text-blue-800">{action}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-6">
            {/* Early warnings */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                Early Warning Signals
              </h3>
              {insights.early_warnings?.length > 0 ? (
                <div className="space-y-3">
                  {(insights.early_warnings || []).map((w: any, i: number) => (
                    <div key={i} className={`rounded-lg border p-3 ${URGENCY_BG[w.urgency] || 'bg-gray-50 border-gray-200'}`}>
                      <div className="flex items-start justify-between mb-1">
                        <p className="text-sm font-semibold text-gray-800">{w.loan_identifier}</p>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${w.urgency === 'red' ? 'bg-red-200 text-red-800' : w.urgency === 'yellow' ? 'bg-yellow-200 text-yellow-800' : 'bg-green-200 text-green-800'}`}>
                          {w.urgency?.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">{w.signal}</p>
                      {w.recommended_action && (
                        <p className="text-xs text-gray-500 mt-1 font-medium">→ {w.recommended_action}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <CheckCircle className="h-8 w-8 text-green-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No early warning signals detected</p>
                </div>
              )}
            </div>

            {/* Concentration risks */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <PieChart className="h-4 w-4 text-purple-500" />
                Concentration Risks
              </h3>
              {insights.concentration_risks?.length > 0 ? (
                <div className="space-y-3">
                  {(insights.concentration_risks || []).map((c: any, i: number) => (
                    <div key={i} className="border border-gray-100 rounded-lg p-3">
                      <div className="flex items-start justify-between mb-1">
                        <div>
                          <p className="text-xs text-gray-400 capitalize">{c.type}</p>
                          <p className="text-sm font-medium text-gray-800">{c.detail}</p>
                        </div>
                        <div className="text-right">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${RISK_COLOR[c.risk_level] || 'text-gray-700 bg-gray-100'}`}>
                            {c.risk_level?.toUpperCase()}
                          </span>
                          <p className="text-xs text-gray-400 mt-1">{c.pct_of_portfolio != null ? `${(c.pct_of_portfolio * 100).toFixed(0)}% of book` : ''}</p>
                        </div>
                      </div>
                      {c.action && <p className="text-xs text-gray-500 mt-1">→ {c.action}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-6">No significant concentrations</p>
              )}
            </div>
          </div>

          {/* Benchmark comparison */}
          {insights.benchmark_comparison && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                SBA FOIA Benchmark Comparison
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-400 mb-1">Your Portfolio Expected Loss</p>
                  <p className="text-xl font-bold text-gray-900">
                    {insights.benchmark_comparison.portfolio_expected_loss != null
                      ? `${(insights.benchmark_comparison.portfolio_expected_loss * 100).toFixed(2)}%`
                      : 'N/A'}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-400 mb-1">SBA Industry Benchmark</p>
                  <p className="text-xl font-bold text-gray-900">
                    {insights.benchmark_comparison.sba_industry_benchmark != null
                      ? `${(insights.benchmark_comparison.sba_industry_benchmark * 100).toFixed(2)}%`
                      : 'N/A'}
                  </p>
                </div>
                <div className={`rounded-lg p-3 text-center ${insights.benchmark_comparison.vs_benchmark?.includes('below') ? 'bg-green-50' : 'bg-red-50'}`}>
                  <p className="text-xs text-gray-400 mb-1">vs. Benchmark</p>
                  <p className={`text-sm font-bold ${insights.benchmark_comparison.vs_benchmark?.includes('below') ? 'text-green-700' : 'text-red-700'}`}>
                    {insights.benchmark_comparison.vs_benchmark || 'N/A'}
                  </p>
                </div>
              </div>
              {insights.benchmark_comparison.interpretation && (
                <p className="text-sm text-gray-600 mt-3 p-3 bg-blue-50 rounded-lg">{insights.benchmark_comparison.interpretation}</p>
              )}
            </div>
          )}

          {/* 30-day priorities + deployment opportunities */}
          <div className="grid grid-cols-2 gap-6">
            {insights['30_day_priorities']?.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="font-semibold text-gray-800 mb-3">📅 30-Day Priorities</h3>
                <ol className="space-y-2">
                  {insights['30_day_priorities'].map((p: string, i: number) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-700">
                      <span className="text-blue-600 font-bold shrink-0">{i + 1}.</span>{p}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {insights.deployment_opportunities?.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="font-semibold text-gray-800 mb-3">💡 Deployment Opportunities</h3>
                <ul className="space-y-2">
                  {(insights.deployment_opportunities || []).map((opp: string, i: number) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-700">
                      <span className="text-green-500 shrink-0 mt-0.5">→</span>{opp}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <p className="text-center text-xs text-gray-400">
            AI-generated portfolio analysis. Not a substitute for independent credit review.
            Powered by Claude · {insights.analyzed_at ? new Date(insights.analyzed_at).toLocaleString() : ''}
          </p>
        </div>
      )}
    </div>
  );
}