'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { TrendingUp, Loader, RefreshCw, CheckCircle, AlertTriangle, X, ChevronDown, ChevronUp, Target } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

const RATING_STYLE: Record<string, string> = {
  strong:          'bg-green-50 border-green-400 text-green-800',
  solid:           'bg-blue-50 border-blue-400 text-blue-800',
  mixed:           'bg-yellow-50 border-yellow-400 text-yellow-800',
  needs_attention: 'bg-orange-50 border-orange-400 text-orange-800',
  critical:        'bg-red-50 border-red-400 text-red-800',
};

const RATING_EMOJI: Record<string, string> = {
  strong: '🚀', solid: '✅', mixed: '🔄', needs_attention: '⚠️', critical: '🚨',
};

const PRIORITY_COLOR = ['bg-red-600', 'bg-orange-500', 'bg-yellow-500', 'bg-blue-500', 'bg-gray-400'];

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

export default function QBRPage() {
  const [deals, setDeals] = useState<any[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [activeReview, setActiveReview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [expandedSection, setExpandedSection] = useState<string | null>('performance_summary');
  const [showForm, setShowForm] = useState(false);
  const now = new Date();
  const [form, setForm] = useState({ quarter: Math.ceil((now.getMonth() + 1) / 3), year: now.getFullYear() });

  useEffect(() => {
    api.getDeals().then(d => {
      const funded = d.filter((x: any) => x.status === 'funded' || x.status !== 'draft');
      setDeals(funded);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const selectDeal = async (deal: any) => {
    setSelectedDeal(deal);
    setActiveReview(null);
    try {
      const data = await api.listQBRs(deal.id);
      setReviews(data.reviews || []);
    } catch { setError('Failed to load reviews'); }
  };

  const generate = async () => {
    if (!selectedDeal) return;
    setGenerating(true);
    setError('');
    try {
      const result = await api.generateQBR(selectedDeal.id, form.quarter, form.year);
      setActiveReview(result);
      const data = await api.listQBRs(selectedDeal.id);
      setReviews(data.reviews || []);
      setShowForm(false);
    } catch (e: any) { setError(e.response?.data?.detail || 'Failed to generate review'); }
    finally { setGenerating(false); }
  };

  const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button onClick={() => setExpandedSection(expandedSection === id ? null : id)}
        className="w-full flex justify-between items-center px-4 py-3 bg-gray-50 hover:bg-gray-100">
        <span className="font-semibold text-sm text-gray-800">{title}</span>
        {expandedSection === id ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>
      {expandedSection === id && <div className="px-4 py-4">{children}</div>}
    </div>
  );

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="h-8 w-8 animate-spin" /></div>;

  const review = activeReview?.sections || activeReview?.ai_review?.sections;
  const meta = activeReview || activeReview?.ai_review;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="h-7 w-7 text-blue-600" /> Quarterly Business Review
          </h1>
          <p className="text-gray-600">AI-generated quarterly performance reviews for your business</p>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex justify-between">{error}<button onClick={() => setError('')}><X className="h-4 w-4" /></button></div>}

      <div className="grid grid-cols-4 gap-6">
        <div className="col-span-1">
          <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Select Deal</p>
          <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
            {deals.map(deal => (
              <button key={deal.id} onClick={() => selectDeal(deal)}
                className={`w-full text-left p-3 rounded-xl border text-sm transition-all ${selectedDeal?.id === deal.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <p className="font-medium text-gray-900 truncate">{deal.name}</p>
                <p className="text-xs text-gray-400 capitalize mt-0.5">{deal.industry}</p>
              </button>
            ))}
          </div>

          {selectedDeal && (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Past Reviews</p>
              <div className="space-y-1 mb-3">
                {reviews.map(r => (
                  <button key={r.id} onClick={async () => {
                    try { const full = await api.generateQBR(selectedDeal.id, r.quarter, r.year); setActiveReview(full); } catch { /* use cached */ }
                    setActiveReview(r);
                  }}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-all ${activeReview?.id === r.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <p className="font-medium">{r.quarter_label}</p>
                    {r.overall_rating && <span className="text-gray-400 capitalize">{r.overall_rating.replace('_', ' ')}</span>}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowForm(!showForm)} className="btn btn-primary w-full text-sm">
                + New Review
              </button>
              {showForm && (
                <div className="mt-3 space-y-2">
                  <div>
                    <label className="label text-xs">Quarter</label>
                    <select value={form.quarter} onChange={e => setForm({...form, quarter: +e.target.value})} className="input text-sm">
                      {[1,2,3,4].map(q => <option key={q} value={q}>Q{q}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs">Year</label>
                    <input type="number" value={form.year} onChange={e => setForm({...form, year: +e.target.value})} className="input text-sm" />
                  </div>
                  <button onClick={generate} disabled={generating} className="btn btn-primary w-full text-sm inline-flex items-center justify-center gap-2">
                    {generating ? <Loader className="h-4 w-4 animate-spin" /> : null} Generate Q{form.quarter} {form.year}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="col-span-3">
          {!selectedDeal ? (
            <div className="card text-center py-16"><TrendingUp className="h-12 w-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-400">Select a deal to view or generate quarterly reviews</p></div>
          ) : generating ? (
            <div className="card text-center py-12">
              <Loader className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
              <p className="font-medium text-gray-700">Generating Q{form.quarter} {form.year} review...</p>
              <p className="text-sm text-gray-400 mt-1">Analyzing financials, loan health, and trends</p>
            </div>
          ) : !meta ? (
            <div className="card text-center py-16 border-dashed">
              <TrendingUp className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">Generate your first quarterly review</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Header */}
              <div className={`card border-2 ${RATING_STYLE[meta.overall_rating] || RATING_STYLE.mixed}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest opacity-60 mb-1">{meta.quarter_label || `Q${meta.quarter} ${meta.year}`} Business Review</p>
                    <h2 className="text-xl font-bold">{meta.business_name}</h2>
                    <p className="text-sm mt-1 leading-relaxed opacity-90">{meta.headline}</p>
                  </div>
                  <div className="text-center shrink-0 ml-4">
                    <p className="text-4xl">{RATING_EMOJI[meta.overall_rating] || '📊'}</p>
                    <p className="text-xs capitalize font-semibold mt-1">{meta.overall_rating?.replace('_', ' ')}</p>
                  </div>
                </div>
              </div>

              {/* Q Priorities */}
              {meta.q_priorities?.length > 0 && (
                <div className="card">
                  <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2"><Target className="h-5 w-5 text-blue-600" />Next Quarter Priorities</h3>
                  <div className="space-y-2">
                    {meta.q_priorities.map((p: any, i: number) => (
                      <div key={i} className="flex gap-3 p-3 bg-gray-50 rounded-xl">
                        <div className={`w-7 h-7 rounded-full ${PRIORITY_COLOR[i] || PRIORITY_COLOR[4]} text-white text-sm font-bold flex items-center justify-center shrink-0`}>{p.priority}</div>
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900 text-sm">{p.title}</p>
                          <p className="text-sm text-gray-600 mt-0.5">{p.action}</p>
                          <p className="text-xs text-blue-600 mt-1">{p.why} · By: {p.by_when}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sections */}
              {review && (
                <div className="space-y-2">
                  <Section id="performance_summary" title="Performance Summary">
                    <p className="text-sm text-gray-700 leading-relaxed">{review.performance_summary}</p>
                  </Section>

                  {review.financial_highlights?.length > 0 && (
                    <Section id="financials" title="Financial Highlights">
                      <div className="space-y-3">
                        {review.financial_highlights.map((h: any, i: number) => (
                          <div key={i} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                              <p className="text-sm font-semibold text-gray-800">{h.metric}</p>
                              <p className="text-xs text-gray-500 mt-0.5">{h.interpretation}</p>
                            </div>
                            <div className="text-right shrink-0 ml-3">
                              <p className="font-bold text-gray-900">{h.value}</p>
                              {h.vs_prior && <p className="text-xs text-gray-400">{h.vs_prior}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                  <Section id="loan_health" title="Loan Health">
                    <p className="text-sm text-gray-700 leading-relaxed">{review.loan_health}</p>
                  </Section>

                  {review.whats_working?.length > 0 && (
                    <Section id="working" title="What's Working">
                      {review.whats_working.map((w: string, i: number) => (
                        <p key={i} className="text-sm text-gray-700 flex gap-2 mb-2"><CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />{w}</p>
                      ))}
                    </Section>
                  )}

                  {review.areas_for_improvement?.length > 0 && (
                    <Section id="improve" title="Areas for Improvement">
                      {review.areas_for_improvement.map((a: any, i: number) => (
                        <div key={i} className="p-3 bg-yellow-50 border border-yellow-100 rounded-lg mb-2">
                          <p className="text-sm font-semibold text-yellow-900">{a.area}</p>
                          <p className="text-sm text-yellow-800 mt-0.5">{a.observation}</p>
                          <p className="text-sm text-blue-700 mt-1 font-medium">→ {a.suggestion}</p>
                        </div>
                      ))}
                    </Section>
                  )}

                  {review.risk_flags?.length > 0 && (
                    <Section id="risks" title="Risk Flags">
                      {review.risk_flags.map((r: string, i: number) => (
                        <p key={i} className="text-sm text-red-700 flex gap-2 mb-1"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />{r}</p>
                      ))}
                    </Section>
                  )}

                  {review.industry_context && (
                    <Section id="industry" title="Industry Context">
                      <p className="text-sm text-gray-700">{review.industry_context}</p>
                    </Section>
                  )}

                  {meta.questions_for_owner?.length > 0 && (
                    <div className="card bg-purple-50 border-purple-200">
                      <p className="text-sm font-semibold text-purple-800 mb-2">🤔 Questions Worth Reflecting On</p>
                      {meta.questions_for_owner.map((q: string, i: number) => (
                        <p key={i} className="text-sm text-purple-700 mb-1">• {q}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <p className="text-xs text-gray-400 text-center">
                AI-generated review. Review with your accountant or advisor before making major decisions.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
