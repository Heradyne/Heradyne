'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { TrendingUp, AlertTriangle, CheckCircle, Loader, RefreshCw, ChevronDown, ChevronUp, Target, Shield } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

const URGENCY_COLORS: Record<string, string> = {
  do_today: 'bg-red-100 text-red-700 border-red-200',
  this_week: 'bg-orange-100 text-orange-700 border-orange-200',
  '30_days': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  before_closing: 'bg-blue-100 text-blue-700 border-blue-200',
};

const CATEGORY_COLORS: Record<string, string> = {
  credit: 'bg-purple-50 border-purple-200',
  equity: 'bg-green-50 border-green-200',
  documents: 'bg-blue-50 border-blue-200',
  business: 'bg-orange-50 border-orange-200',
  negotiation: 'bg-yellow-50 border-yellow-200',
  legal: 'bg-red-50 border-red-200',
};

export default function RecommendationsPage() {
  const [deals, setDeals] = useState<any[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [recs, setRecs] = useState<any>(null);
  const [covenants, setCovenants] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [recsLoading, setRecsLoading] = useState(false);
  const [covenantsLoading, setCovenantsLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'recommendations' | 'covenants'>('recommendations');
  const [expandedRec, setExpandedRec] = useState<number | null>(null);
  const [covenantForm, setCovenantForm] = useState({ dscr: '', revenue: '', net_income: '', current_ratio: '' });

  useEffect(() => { api.getDeals().then(setDeals).catch(() => {}).finally(() => setLoading(false)); }, []);

  const loadRecommendations = async (deal: any) => {
    setSelectedDeal(deal);
    setRecs(null);
    setCovenants(null);
    setError('');
    setRecsLoading(true);
    try {
      const result = await api.getBorrowerRecommendations(deal.id);
      setRecs(result);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to generate recommendations');
    } finally {
      setRecsLoading(false);
    }
  };

  const checkCovenants = async () => {
    if (!selectedDeal) return;
    setCovenantsLoading(true);
    setError('');
    try {
      const financialData = {
        dscr: parseFloat(covenantForm.dscr) || null,
        annual_revenue: parseFloat(covenantForm.revenue) || null,
        net_income: parseFloat(covenantForm.net_income) || null,
        current_ratio: parseFloat(covenantForm.current_ratio) || null,
      };
      const result = await api.checkCovenants(selectedDeal.id, financialData);
      setCovenants(result);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to check covenants');
    } finally {
      setCovenantsLoading(false);
    }
  };

  const healthColors: Record<string, string> = { green: 'text-green-600', yellow: 'text-yellow-600', red: 'text-red-600' };
  const healthBg: Record<string, string> = { green: 'bg-green-50 border-green-200', yellow: 'bg-yellow-50 border-yellow-200', red: 'bg-red-50 border-red-200' };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">AI Advisor</h1>
        <p className="text-gray-500 mt-1">Personalized recommendations and covenant monitoring for your deal</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      <div className="grid grid-cols-5 gap-6">
        {/* Deal list */}
        <div className="col-span-2">
          <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Your Deals</p>
          {loading && <div className="text-sm text-gray-400">Loading...</div>}
          {(deals || []).map(deal => (
            <div key={deal.id} onClick={() => loadRecommendations(deal)}
              className={`p-4 rounded-xl border cursor-pointer transition-all mb-2 ${
                selectedDeal?.id === deal.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white hover:border-gray-300'
              }`}>
              <p className="text-sm font-semibold text-gray-900 truncate">{deal.name}</p>
              <p className="text-xs text-gray-400 mt-0.5 capitalize">{deal.industry} · {deal.loan_amount_requested ? formatCurrency(deal.loan_amount_requested) : 'N/A'}</p>
            </div>
          ))}
        </div>

        {/* Main panel */}
        <div className="col-span-3">
          {!selectedDeal && !recsLoading && (
            <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-12 text-center">
              <Target className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">Select a deal to get AI-powered recommendations</p>
            </div>
          )}

          {recsLoading && (
            <div className="bg-white rounded-xl border p-12 text-center">
              <Loader className="h-8 w-8 animate-spin text-indigo-600 mx-auto mb-3" />
              <p className="text-gray-600 font-medium">Analyzing your deal...</p>
              <p className="text-gray-400 text-sm mt-1">Generating personalized approval recommendations</p>
            </div>
          )}

          {selectedDeal && recs && !recsLoading && (
            <>
              {/* Tabs */}
              <div className="flex border-b border-gray-200 mb-4">
                <button onClick={() => setActiveTab('recommendations')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === 'recommendations' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  Recommendations
                </button>
                <button onClick={() => setActiveTab('covenants')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === 'covenants' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  Covenant Monitor
                </button>
              </div>

              {activeTab === 'recommendations' && (
                <div className="space-y-4">
                  {/* Approval probability */}
                  <div className={`rounded-xl border p-5 ${recs.approval_probability >= 70 ? 'bg-green-50 border-green-200' : recs.approval_probability >= 50 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-gray-800">Approval Probability</h3>
                      <span className={`text-3xl font-bold ${recs.approval_probability >= 70 ? 'text-green-700' : recs.approval_probability >= 50 ? 'text-yellow-700' : 'text-red-700'}`}>
                        {recs.approval_probability}%
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">{recs.approval_summary}</p>
                  </div>

                  {/* Deal killers */}
                  {recs.deal_killers?.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                      <p className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-1">
                        <AlertTriangle className="h-4 w-4" /> Deal Killers — Address Immediately
                      </p>
                      {(recs.deal_killers || []).map((d: string, i: number) => (
                        <p key={i} className="text-sm text-red-700 flex gap-2 mb-1"><span className="shrink-0">⚠</span>{d}</p>
                      ))}
                    </div>
                  )}

                  {/* Recommendations */}
                  <div className="space-y-3">
                    {(recs.top_recommendations || []).map((rec: any, i: number) => (
                      <div key={i} className={`rounded-xl border p-4 ${CATEGORY_COLORS[rec.category] || 'bg-gray-50 border-gray-200'}`}>
                        <div className="flex items-start justify-between cursor-pointer" onClick={() => setExpandedRec(expandedRec === i ? null : i)}>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold text-gray-500">#{rec.priority}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${URGENCY_COLORS[rec.urgency] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                {rec.urgency?.replace(/_/g, ' ').toUpperCase()}
                              </span>
                              <span className="text-xs text-gray-400 capitalize">{rec.category}</span>
                            </div>
                            <p className="text-sm font-semibold text-gray-900">{rec.title}</p>
                            <p className="text-sm text-gray-600 mt-0.5">{rec.why_it_matters}</p>
                          </div>
                          {expandedRec === i ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0 mt-1" /> : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0 mt-1" />}
                        </div>
                        {expandedRec === i && (
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Action Steps</p>
                            <ol className="space-y-2">
                              {(rec.action_steps || []).map((step: string, j: number) => (
                                <li key={j} className="text-sm text-gray-700 flex gap-2">
                                  <span className="text-indigo-600 font-semibold shrink-0">{j + 1}.</span>{step}
                                </li>
                              ))}
                            </ol>
                            {rec.estimated_impact && (
                              <p className="text-xs text-gray-500 mt-3 p-2 bg-white rounded">
                                <strong>Expected impact:</strong> {rec.estimated_impact}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* 30-day checklist */}
                  {recs.next_30_days_checklist?.length > 0 && (
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <p className="text-sm font-semibold text-gray-700 mb-3">📋 Your Next 30-Day Checklist</p>
                      <div className="space-y-2">
                        {(recs.next_30_days_checklist || []).map((item: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-sm text-gray-700">
                            <span className="mt-0.5 h-4 w-4 border border-gray-300 rounded shrink-0 flex items-center justify-center text-xs text-gray-400">{i + 1}</span>
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button onClick={() => loadRecommendations(selectedDeal)} className="btn btn-secondary text-sm inline-flex items-center">
                    <RefreshCw className="h-4 w-4 mr-2" /> Refresh Recommendations
                  </button>
                </div>
              )}

              {activeTab === 'covenants' && (
                <div className="space-y-4">
                  {/* Input form */}
                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <h3 className="font-semibold text-gray-800 mb-3">Enter Current Financials</h3>
                    <p className="text-sm text-gray-500 mb-4">Input your most recent numbers to check covenant compliance.</p>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { key: 'dscr', label: 'Current DSCR', placeholder: 'e.g. 1.42' },
                        { key: 'current_ratio', label: 'Current Ratio', placeholder: 'e.g. 1.8' },
                        { key: 'revenue', label: 'Annual Revenue ($)', placeholder: 'e.g. 850000' },
                        { key: 'net_income', label: 'Net Income ($)', placeholder: 'e.g. 120000' },
                      ].map(f => (
                        <div key={f.key}>
                          <label className="label">{f.label}</label>
                          <input
                            type="number"
                            step="0.01"
                            value={(covenantForm as any)[f.key]}
                            onChange={e => setCovenantForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                            className="input"
                            placeholder={f.placeholder}
                          />
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={checkCovenants}
                      disabled={covenantsLoading}
                      className="btn btn-primary mt-4 inline-flex items-center"
                    >
                      {covenantsLoading ? <Loader className="h-4 w-4 mr-2 animate-spin" /> : <Shield className="h-4 w-4 mr-2" />}
                      Check Covenant Compliance
                    </button>
                  </div>

                  {covenants && (
                    <div className="space-y-3">
                      {/* Overall health */}
                      <div className={`rounded-xl border p-4 ${healthBg[covenants.overall_covenant_health] || 'bg-gray-50 border-gray-200'}`}>
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-gray-800">Overall Covenant Health</h3>
                          <span className={`font-bold text-lg uppercase ${healthColors[covenants.overall_covenant_health] || 'text-gray-600'}`}>
                            {covenants.overall_covenant_health}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 mt-2">{covenants.health_explanation}</p>
                        {covenants.lender_notification_required && (
                          <div className="mt-2 bg-red-100 text-red-700 text-xs px-3 py-1.5 rounded-lg font-medium">
                            ⚠ Lender notification may be required
                          </div>
                        )}
                      </div>

                      {/* Individual covenants */}
                      {(covenants.covenants || []).map((c: any, i: number) => (
                        <div key={i} className={`rounded-xl border p-4 ${c.status === 'breach' ? 'bg-red-50 border-red-200' : c.status === 'watch' ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
                          <div className="flex items-start justify-between mb-2">
                            <p className="font-medium text-gray-800">{c.name}</p>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.status === 'breach' ? 'bg-red-200 text-red-800' : c.status === 'watch' ? 'bg-yellow-200 text-yellow-800' : 'bg-green-200 text-green-800'}`}>
                              {c.status?.toUpperCase()}
                            </span>
                          </div>
                          <div className="flex gap-4 text-sm mb-2">
                            <span className="text-gray-500">Required: <strong>{c.required}</strong></span>
                            <span className="text-gray-500">Actual: <strong className={c.status === 'breach' ? 'text-red-700' : 'text-gray-900'}>{c.actual}</strong></span>
                          </div>
                          <p className="text-sm text-gray-700 mb-2">{c.plain_english}</p>
                          {c.status !== 'compliant' && c.remediation && (
                            <div className="bg-white rounded-lg p-3 text-sm">
                              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Remediation</p>
                              <p className="text-gray-700">{c.remediation}</p>
                              {c.breach_consequence && (
                                <p className="text-red-600 text-xs mt-1">⚠ {c.breach_consequence}</p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Summary for borrower */}
                      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                        <p className="text-sm font-semibold text-indigo-800 mb-1">What This Means For You</p>
                        <p className="text-sm text-indigo-700">{covenants.summary_for_borrower}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}