'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { TrendingUp, Target, Plus, Loader, RefreshCw, CheckCircle, AlertTriangle, X, ChevronDown, ChevronUp, Send, Building2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

const CATEGORY_COLORS: Record<string, string> = {
  revenue:       'bg-green-100 text-green-800 border-green-200',
  cost_savings:  'bg-blue-100 text-blue-800 border-blue-200',
  risk_reduction:'bg-orange-100 text-orange-800 border-orange-200',
  culture:       'bg-purple-100 text-purple-800 border-purple-200',
  other:         'bg-gray-100 text-gray-700 border-gray-200',
};

const STATUS_STYLE: Record<string, { label: string; style: string }> = {
  pending:      { label: 'Pending', style: 'bg-gray-100 text-gray-600 border-gray-200' },
  under_review: { label: 'Under Review', style: 'bg-blue-50 text-blue-700 border-blue-200' },
  accepted:     { label: 'Accepted ✓', style: 'bg-green-50 text-green-700 border-green-300' },
  implemented:  { label: 'Implemented ✓', style: 'bg-green-100 text-green-800 border-green-400' },
  declined:     { label: 'Declined', style: 'bg-red-50 text-red-700 border-red-200' },
  withdrawn:    { label: 'Withdrawn', style: 'bg-gray-50 text-gray-400 border-gray-200' },
};

const CONFIDENCE_COLOR: Record<string, string> = {
  high: 'text-green-700', medium: 'text-yellow-700', low: 'text-red-600',
};

type Tab = 'overview' | 'submit' | 'history';

export default function EmployeeDashboardPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [snapshot, setSnapshot] = useState<any>(null);
  const [kpis, setKpis] = useState<any[]>([]);
  const [contributions, setContributions] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedContrib, setExpandedContrib] = useState<number | null>(null);

  // Submit form
  const [form, setForm] = useState({
    type: 'above_beyond',
    title: '',
    description: '',
    category: 'revenue',
    evidence: '',
    action_date: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState<any>(null);

  // Discussion
  const [discussMsg, setDiscussMsg] = useState<Record<number, string>>({});
  const [sendingMsg, setSendingMsg] = useState<number | null>(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [snap, kpisData, contribData] = await Promise.all([
        api.getBusinessSnapshot().catch(() => null),
        api.getMyKPIs().catch(() => ({ kpis: [] })),
        api.getMyContributions().catch(() => ({ contributions: [], stats: null })),
      ]);
      setSnapshot(snap);
      setKpis(kpisData.kpis || []);
      setContributions(contribData.contributions || []);
      setStats(contribData.stats);
    } catch { setError('Failed to load data'); }
    finally { setLoading(false); }
  };

  const submitContribution = async () => {
    if (!form.title || !form.description) { setError('Title and description are required'); return; }
    setSubmitting(true);
    setError('');
    try {
      const result = await api.submitContribution({
        ...form,
        action_date: form.action_date || null,
      });
      setJustSubmitted(result);
      setForm({ type: 'above_beyond', title: '', description: '', category: 'revenue', evidence: '', action_date: '' });
      await loadAll();
      setTab('history');
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to submit contribution');
    } finally { setSubmitting(false); }
  };

  const withdraw = async (id: number) => {
    try {
      await api.withdrawContribution(id);
      await loadAll();
    } catch { setError('Failed to withdraw'); }
  };

  const sendMessage = async (id: number) => {
    const msg = discussMsg[id];
    if (!msg?.trim()) return;
    setSendingMsg(id);
    try {
      await api.addContributionDiscussion(id, msg);
      setDiscussMsg(prev => ({...prev, [id]: ''}));
      await loadAll();
    } catch { setError('Failed to send'); }
    finally { setSendingMsg(null); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="h-8 w-8 animate-spin" /></div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="h-7 w-7 text-blue-600" /> My Contributions
          </h1>
          <p className="text-gray-600">Track your impact and submit ideas or actions that create business value</p>
        </div>
        <button onClick={() => setTab('submit')} className="btn btn-primary inline-flex items-center gap-2">
          <Plus className="h-4 w-4" /> Submit Contribution
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex justify-between">
          {error}<button onClick={() => setError('')}><X className="h-4 w-4" /></button>
        </div>
      )}

      {justSubmitted && tab === 'history' && (
        <div className="bg-green-50 border border-green-300 rounded-xl p-4 mb-6">
          <p className="text-green-800 font-semibold flex items-center gap-2">
            <CheckCircle className="h-5 w-5" /> Contribution submitted and sent for AI evaluation
          </p>
          {justSubmitted.ai_evaluation?.value_mid != null && (
            <p className="text-sm text-green-700 mt-1">
              AI estimated value: {formatCurrency(justSubmitted.ai_evaluation.value_low || 0)} – {formatCurrency(justSubmitted.ai_evaluation.value_high || 0)}
            </p>
          )}
          <button onClick={() => setJustSubmitted(null)} className="text-xs text-green-600 mt-2 underline">Dismiss</button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-6">
          {[
            { id: 'overview', label: 'Overview & KPIs' },
            { id: 'submit', label: '+ Submit Contribution' },
            { id: 'history', label: 'My Submissions', badge: stats?.pending },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id as Tab)}
              className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap inline-flex items-center gap-1 ${
                tab === t.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
              {t.badge != null && t.badge > 0 && (
                <span className="ml-1 bg-yellow-500 text-white text-xs px-1.5 py-0.5 rounded-full">{t.badge}</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* My impact stats */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Submitted', val: stats.total, icon: '📝' },
                { label: 'Accepted', val: stats.accepted, icon: '✅' },
                { label: 'Pending Review', val: stats.pending + stats.under_review, icon: '⏳', highlight: true },
                { label: 'My Approved Value', val: formatCurrency(stats.total_approved_value || 0), icon: '💰' },
              ].map(s => (
                <div key={s.label} className={`card text-center ${s.highlight && (s.val as number) > 0 ? 'border-yellow-300 bg-yellow-50' : ''}`}>
                  <p className="text-2xl mb-1">{s.icon}</p>
                  <p className={`text-2xl font-bold ${s.highlight && (s.val as number) > 0 ? 'text-yellow-700' : 'text-gray-900'}`}>{s.val}</p>
                  <p className="text-xs text-gray-500">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Business health snapshot */}
          {snapshot?.has_data && (
            <div className="card bg-gradient-to-br from-slate-800 to-slate-900 text-white">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-slate-400 text-xs font-medium uppercase tracking-widest mb-1">Business Health</p>
                  <h2 className="text-xl font-bold">{snapshot.business_name}</h2>
                  <p className="text-slate-300 text-sm capitalize">{snapshot.industry}</p>
                </div>
                {snapshot.health_score != null && (
                  <div className="text-center">
                    <p className={`text-4xl font-bold ${snapshot.health_score >= 70 ? 'text-green-400' : snapshot.health_score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {Math.round(snapshot.health_score)}
                    </p>
                    <p className="text-xs text-slate-400">Health Score</p>
                  </div>
                )}
              </div>

              <p className={`text-sm font-medium mb-4 ${snapshot.health_score >= 70 ? 'text-green-300' : snapshot.health_score >= 50 ? 'text-yellow-300' : 'text-red-300'}`}>
                {snapshot.status_message}
              </p>

              {/* Health breakdown bars */}
              {snapshot.health_breakdown && Object.entries(snapshot.health_breakdown).some(([, v]) => v != null) && (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {Object.entries(snapshot.health_breakdown).map(([key, val]) => {
                    if (val == null) return null;
                    const v = val as number;
                    return (
                      <div key={key}>
                        <div className="flex justify-between mb-1">
                          <span className="text-xs text-slate-400 capitalize">{key}</span>
                          <span className="text-xs text-slate-300 font-medium">{Math.round(v)}</span>
                        </div>
                        <div className="w-full bg-slate-700 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full transition-all" style={{
                            width: `${Math.min(v, 100)}%`,
                            backgroundColor: v >= 70 ? '#4ade80' : v >= 50 ? '#facc15' : '#f87171'
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Business value range */}
              {snapshot.business_value_range?.mid && (
                <div className="border-t border-slate-700 pt-3">
                  <p className="text-xs text-slate-400 mb-1">Estimated Business Value</p>
                  <div className="flex items-end gap-2">
                    <span className="text-slate-400 text-sm">{formatCurrency(snapshot.business_value_range.low || 0)}</span>
                    <span className="text-2xl font-bold text-white">– {formatCurrency(snapshot.business_value_range.mid || 0)}</span>
                    <span className="text-slate-400 text-sm">– {formatCurrency(snapshot.business_value_range.high || 0)}</span>
                  </div>
                </div>
              )}

              {/* My contribution to the business */}
              {snapshot.my_total_value_contributed > 0 && (
                <div className="mt-3 bg-blue-900 bg-opacity-50 rounded-lg p-3">
                  <p className="text-xs text-blue-300">Your approved contributions to this business</p>
                  <p className="text-xl font-bold text-blue-200">{formatCurrency(snapshot.my_total_value_contributed)}</p>
                </div>
              )}
            </div>
          )}

          {/* My KPIs */}
          {kpis.length > 0 && (
            <div>
              <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <Target className="h-5 w-5 text-blue-600" /> My KPIs
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {kpis.map(kpi => {
                  const bkpi = kpi.business_kpi;
                  const pct = kpi.progress_pct || 0;
                  return (
                    <div key={kpi.employee_kpi_id} className="card">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${CATEGORY_COLORS[bkpi.category] || CATEGORY_COLORS.other}`}>
                            {bkpi.category.replace('_', ' ')}
                          </span>
                          <p className="font-semibold text-gray-900 mt-1.5">{bkpi.name}</p>
                          {kpi.role_description && <p className="text-xs text-gray-500 mt-0.5">{kpi.role_description}</p>}
                        </div>
                        {kpi.personal_target && (
                          <div className="text-right shrink-0 ml-3">
                            <p className="text-sm font-bold text-gray-700">
                              {bkpi.unit === '$' ? formatCurrency(kpi.personal_target) : `${kpi.personal_target} ${bkpi.unit || ''}`}
                            </p>
                            <p className="text-xs text-gray-400">{bkpi.period} target</p>
                          </div>
                        )}
                      </div>

                      {/* Progress */}
                      {kpi.personal_target && (
                        <>
                          <div className="flex justify-between mb-1">
                            <span className="text-xs text-gray-500">Progress</span>
                            <span className={`text-xs font-semibold ${pct >= 100 ? 'text-green-700' : pct >= 50 ? 'text-blue-700' : 'text-gray-500'}`}>
                              {pct.toFixed(1)}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
                            <div className="h-2 rounded-full transition-all" style={{
                              width: `${Math.min(pct, 100)}%`,
                              backgroundColor: pct >= 100 ? '#15803d' : pct >= 50 ? '#2563eb' : '#d1d5db'
                            }} />
                          </div>
                          <p className="text-xs text-gray-500">
                            {formatCurrency(kpi.value_contributed || 0)} contributed of {bkpi.unit === '$' ? formatCurrency(kpi.personal_target) : `${kpi.personal_target} ${bkpi.unit || ''}`} target
                          </p>
                        </>
                      )}

                      {kpi.measurement_method && (
                        <p className="text-xs text-blue-600 mt-2">Measured by: {kpi.measurement_method}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {kpis.length === 0 && !snapshot?.has_data && (
            <div className="card text-center py-12">
              <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">Your business dashboard will appear here once your owner sets up KPIs.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Submit ── */}
      {tab === 'submit' && (
        <div className="max-w-2xl">
          <div className="card">
            <h2 className="font-semibold text-gray-800 mb-1">Submit a Contribution</h2>
            <p className="text-sm text-gray-500 mb-4">Share an action you've taken or an idea you have — Claude will evaluate its business value and send it to your owner for review.</p>

            <div className="space-y-4">
              {/* Type */}
              <div>
                <label className="label">Contribution Type</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: 'above_beyond', label: '⚡ Above & Beyond', desc: 'Something you already did' },
                    { value: 'suggestion', label: '💡 Suggestion', desc: 'An idea for improvement' },
                  ].map(t => (
                    <button key={t.value} onClick={() => setForm({...form, type: t.value})}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        form.type === t.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                      }`}>
                      <p className="font-medium text-sm text-gray-800">{t.label}</p>
                      <p className="text-xs text-gray-400">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="label">Category</label>
                <div className="flex flex-wrap gap-2">
                  {['revenue', 'cost_savings', 'risk_reduction', 'culture', 'other'].map(cat => (
                    <button key={cat} onClick={() => setForm({...form, category: cat})}
                      className={`px-3 py-1.5 rounded-full border text-xs font-medium capitalize transition-all ${
                        form.category === cat ? CATEGORY_COLORS[cat] : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                      }`}>
                      {cat.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="label">Title *</label>
                <input value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                  className="input w-full" placeholder="e.g. Negotiated better supplier pricing" />
              </div>

              {/* Description */}
              <div>
                <label className="label">Description * <span className="text-gray-400 font-normal">(be specific — Claude uses this for valuation)</span></label>
                <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                  className="input w-full min-h-28 resize-y"
                  placeholder={form.type === 'above_beyond'
                    ? "Describe what you did, what the situation was, and what the result was. Include specific numbers if possible (e.g. saved 3 hours/week, reduced cost by $X, brought in $Y of revenue)."
                    : "Describe your idea clearly — what the problem is, what your solution is, and why you think it will create value."} />
              </div>

              {/* Evidence */}
              <div>
                <label className="label">Supporting Evidence <span className="text-gray-400 font-normal">(optional but helps AI evaluate accurately)</span></label>
                <textarea value={form.evidence} onChange={e => setForm({...form, evidence: e.target.value})}
                  className="input w-full min-h-16 resize-y text-sm"
                  placeholder="Emails, quotes, metrics, links, or any supporting detail..." />
              </div>

              {/* Action date (for above_beyond) */}
              {form.type === 'above_beyond' && (
                <div>
                  <label className="label">Date of Action</label>
                  <input type="date" value={form.action_date} onChange={e => setForm({...form, action_date: e.target.value})}
                    className="input" max={new Date().toISOString().split('T')[0]} />
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <p className="text-xs text-blue-700">
                  <strong>What happens next:</strong> Claude will evaluate the business value of your submission and explain its reasoning. Your owner will see the AI assessment and make the final decision. You'll be notified of the outcome and can discuss it.
                </p>
              </div>

              <button onClick={submitContribution} disabled={submitting || !form.title || !form.description}
                className="btn btn-primary w-full inline-flex items-center justify-center gap-2">
                {submitting
                  ? <><Loader className="h-4 w-4 animate-spin" />Submitting & evaluating...</>
                  : 'Submit Contribution'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── History ── */}
      {tab === 'history' && (
        <div className="space-y-4">
          {contributions.length === 0 ? (
            <div className="card text-center py-12">
              <TrendingUp className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400 mb-3">No contributions yet</p>
              <button onClick={() => setTab('submit')} className="btn btn-primary text-sm">Submit Your First Contribution</button>
            </div>
          ) : contributions.map(contrib => {
            const ev = contrib.ai_evaluation;
            const review = contrib.manager_review;
            const statusInfo = STATUS_STYLE[contrib.status] || STATUS_STYLE.pending;
            const isExp = expandedContrib === contrib.id;

            return (
              <div key={contrib.id} className="card">
                <button className="w-full flex items-start justify-between text-left" onClick={() => setExpandedContrib(isExp ? null : contrib.id)}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusInfo.style}`}>{statusInfo.label}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${CATEGORY_COLORS[contrib.category] || CATEGORY_COLORS.other}`}>
                        {contrib.category.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-gray-400 capitalize">{contrib.type.replace('_', ' ')}</span>
                    </div>
                    <p className="font-semibold text-gray-900">{contrib.title}</p>

                    {/* Quick value summary */}
                    {contrib.final_value != null && (
                      <p className="text-sm font-bold text-green-700 mt-1">Approved value: {formatCurrency(contrib.final_value)}</p>
                    )}
                    {ev && contrib.final_value == null && !ev.is_intangible && ev.value_mid != null && (
                      <p className="text-sm text-blue-600 mt-1">
                        AI estimate: {formatCurrency(ev.value_low || 0)} – {formatCurrency(ev.value_high || 0)}
                        <span className={`ml-2 text-xs ${CONFIDENCE_COLOR[ev.confidence] || ''}`}>({ev.confidence})</span>
                      </p>
                    )}
                    {ev?.is_intangible && contrib.final_value == null && (
                      <p className="text-sm text-purple-600 mt-1">Intangible value</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    <span className="text-xs text-gray-400">{new Date(contrib.created_at).toLocaleDateString()}</span>
                    {isExp ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                  </div>
                </button>

                {isExp && (
                  <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
                    {/* Description */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Your Description</p>
                      <p className="text-sm text-gray-700">{contrib.description}</p>
                      {contrib.evidence && <p className="text-xs text-gray-500 mt-1 italic">Evidence: {contrib.evidence}</p>}
                    </div>

                    {/* AI evaluation (always shown to employee) */}
                    {ev && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                        <p className="text-xs font-bold text-blue-700 uppercase mb-2">AI Evaluation — How Your Value Was Calculated</p>
                        {!ev.is_intangible && ev.value_mid != null ? (
                          <div className="grid grid-cols-3 gap-3 mb-3">
                            <div className="text-center"><p className="text-xs text-gray-500">Conservative</p><p className="font-bold text-gray-700">{formatCurrency(ev.value_low || 0)}</p></div>
                            <div className="text-center bg-white rounded-lg p-2"><p className="text-xs text-gray-500">Estimate</p><p className="text-xl font-bold text-blue-700">{formatCurrency(ev.value_mid || 0)}</p></div>
                            <div className="text-center"><p className="text-xs text-gray-500">Optimistic</p><p className="font-bold text-gray-700">{formatCurrency(ev.value_high || 0)}</p></div>
                          </div>
                        ) : ev.is_intangible ? (
                          <p className="text-sm text-purple-700 mb-2">This contribution has cultural or relational value that's difficult to put a dollar figure on.</p>
                        ) : null}

                        {/* Step by step reasoning */}
                        {ev.reasoning?.length > 0 && (
                          <div className="space-y-1 mb-2">
                            <p className="text-xs font-medium text-blue-600 mb-1">Step-by-step reasoning:</p>
                            {ev.reasoning.map((step: any, i: number) => (
                              <p key={i} className="text-xs text-blue-800 flex gap-2">
                                <span className="font-bold shrink-0">{i+1}.</span>
                                <span><strong>{step.label}:</strong> {step.detail}{step.value && ` → ${step.value}`}</span>
                              </p>
                            ))}
                          </div>
                        )}

                        <p className={`text-xs ${CONFIDENCE_COLOR[ev.confidence]}`}>
                          <strong>Confidence:</strong> {ev.confidence} — {ev.confidence_reason}
                        </p>

                        {ev.clarifying_questions?.length > 0 && (
                          <div className="mt-2 bg-yellow-50 rounded p-2">
                            <p className="text-xs font-medium text-yellow-800">To improve the estimate, consider adding:</p>
                            {ev.clarifying_questions.map((q: string, i: number) => <p key={i} className="text-xs text-yellow-700">• {q}</p>)}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Manager review */}
                    {review && (
                      <div className={`rounded-xl border p-4 ${review.decision === 'decline' ? 'bg-red-50 border-red-200' : review.decision === 'adjust' ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
                        <p className="text-xs font-bold uppercase mb-1">
                          {review.decision === 'agree' ? '✓ Owner Approved' : review.decision === 'adjust' ? '✏ Owner Adjusted' : '✗ Owner Declined'}
                        </p>
                        {review.adjusted_value != null && (
                          <p className="text-sm font-bold mb-1">Approved value: {formatCurrency(review.adjusted_value)}</p>
                        )}
                        <p className="text-sm">{review.notes}</p>
                        <p className="text-xs text-gray-400 mt-1">{new Date(review.reviewed_at).toLocaleDateString()}</p>
                      </div>
                    )}

                    {/* Discussion thread */}
                    {contrib.discussion?.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase">Discussion</p>
                        {contrib.discussion.map((msg: any, i: number) => (
                          <div key={i} className={`p-3 rounded-lg text-sm ${msg.user_id === contrib.employee_id ? 'bg-blue-50 ml-0 mr-8' : 'bg-gray-50 ml-8 mr-0'}`}>
                            <p className="text-xs text-gray-400 mb-0.5">{msg.user_id === contrib.employee_id ? 'You' : 'Owner'} · {new Date(msg.created_at).toLocaleDateString()}</p>
                            {msg.message}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Respond / discuss */}
                    {contrib.status !== 'withdrawn' && (
                      <div className="flex gap-2">
                        <input value={discussMsg[contrib.id] || ''} onChange={e => setDiscussMsg(prev => ({...prev, [contrib.id]: e.target.value}))}
                          onKeyDown={e => e.key === 'Enter' && sendMessage(contrib.id)}
                          className="input flex-1 text-sm" placeholder={contrib.status === 'declined' ? "Respond or provide more context to request re-review..." : "Add a comment..."} />
                        <button onClick={() => sendMessage(contrib.id)} disabled={sendingMsg === contrib.id}
                          className="btn btn-secondary px-3">
                          {sendingMsg === contrib.id ? <Loader className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </button>
                      </div>
                    )}

                    {/* Withdraw */}
                    {(contrib.status === 'pending' || contrib.status === 'under_review') && (
                      <button onClick={() => withdraw(contrib.id)} className="text-xs text-gray-400 hover:text-red-500 underline">
                        Withdraw this submission
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
