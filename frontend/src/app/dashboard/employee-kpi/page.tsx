'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Users, Target, ClipboardList, BarChart3, Plus, Loader, RefreshCw, CheckCircle, X, ChevronDown, ChevronUp, Send, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

const CATEGORY_COLORS: Record<string, string> = {
  revenue:       'bg-green-100 text-green-800 border-green-200',
  cost_savings:  'bg-blue-100 text-blue-800 border-blue-200',
  risk_reduction:'bg-orange-100 text-orange-800 border-orange-200',
  culture:       'bg-purple-100 text-purple-800 border-purple-200',
  other:         'bg-gray-100 text-gray-700 border-gray-200',
};

const STATUS_STYLE: Record<string, string> = {
  pending:      'bg-yellow-50 border-yellow-200 text-yellow-800',
  under_review: 'bg-blue-50 border-blue-200 text-blue-800',
  accepted:     'bg-green-50 border-green-200 text-green-800',
  implemented:  'bg-green-100 border-green-300 text-green-900',
  declined:     'bg-red-50 border-red-200 text-red-700',
};

const CONFIDENCE_COLOR: Record<string, string> = {
  high: 'text-green-700', medium: 'text-yellow-700', low: 'text-red-600',
};

type Tab = 'dashboard' | 'employees' | 'kpis' | 'review';

export default function OwnerKPIPage() {
  const [tab, setTab] = useState<Tab>('review');
  const [dashboard, setDashboard] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedContrib, setExpandedContrib] = useState<number | null>(null);

  // Invite form
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', full_name: '', job_title: '' });
  const [inviteResult, setInviteResult] = useState<any>(null);
  const [inviting, setInviting] = useState(false);

  // KPI form
  const [showKPIForm, setShowKPIForm] = useState(false);
  const [kpiForm, setKpiForm] = useState({ name: '', description: '', category: 'revenue', target_value: '', unit: '$', period: 'annual', weight: 1 });
  const [savingKPI, setSavingKPI] = useState(false);

  // Assign KPI
  const [assignForm, setAssignForm] = useState({ employee_id: '', business_kpi_id: '', personal_target: '', measurement_method: '', role_description: '' });
  const [showAssign, setShowAssign] = useState(false);

  // Review
  const [reviewForms, setReviewForms] = useState<Record<number, { decision: string; notes: string; adjusted_value: string }>>({});
  const [reviewing, setReviewing] = useState<number | null>(null);
  const [discussMsg, setDiscussMsg] = useState<Record<number, string>>({});

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [dash, emps, kpisData, q] = await Promise.all([
        api.getOwnerKPIDashboard().catch(() => null),
        api.getMyEmployees().catch(() => ({ employees: [] })),
        api.getBusinessKPIs().catch(() => ({ kpis: [] })),
        api.getReviewQueue().catch(() => ({ contributions: [] })),
      ]);
      setDashboard(dash);
      setEmployees(emps.employees || []);
      setKpis(kpisData.kpis || []);
      setQueue(q.contributions || []);
    } catch { setError('Failed to load data'); }
    finally { setLoading(false); }
  };

  const sendInvite = async () => {
    setInviting(true);
    try {
      const result = await api.inviteEmployee(inviteForm);
      setInviteResult(result);
      await loadAll();
    } catch (e: any) { setError(e.response?.data?.detail || 'Failed to send invite'); }
    finally { setInviting(false); }
  };

  const saveKPI = async () => {
    setSavingKPI(true);
    try {
      await api.createBusinessKPI({ ...kpiForm, target_value: kpiForm.target_value ? parseFloat(kpiForm.target_value) : null });
      setShowKPIForm(false);
      setKpiForm({ name: '', description: '', category: 'revenue', target_value: '', unit: '$', period: 'annual', weight: 1 });
      const data = await api.getBusinessKPIs();
      setKpis(data.kpis || []);
    } catch { setError('Failed to save KPI'); }
    finally { setSavingKPI(false); }
  };

  const assignKPI = async () => {
    try {
      await api.assignEmployeeKPI({
        employee_id: parseInt(assignForm.employee_id),
        business_kpi_id: parseInt(assignForm.business_kpi_id),
        personal_target: assignForm.personal_target ? parseFloat(assignForm.personal_target) : null,
        measurement_method: assignForm.measurement_method || null,
        role_description: assignForm.role_description || null,
      });
      setShowAssign(false);
      setAssignForm({ employee_id: '', business_kpi_id: '', personal_target: '', measurement_method: '', role_description: '' });
    } catch { setError('Failed to assign KPI'); }
  };

  const submitReview = async (id: number) => {
    const form = reviewForms[id];
    if (!form?.decision || !form?.notes) { setError('Decision and notes are required'); return; }
    setReviewing(id);
    try {
      await api.reviewContribution(id, {
        decision: form.decision,
        notes: form.notes,
        adjusted_value: form.adjusted_value ? parseFloat(form.adjusted_value) : undefined,
      });
      await loadAll();
      setExpandedContrib(null);
    } catch (e: any) { setError(e.response?.data?.detail || 'Failed to submit review'); }
    finally { setReviewing(null); }
  };

  const sendDiscussion = async (id: number) => {
    const msg = discussMsg[id];
    if (!msg?.trim()) return;
    try {
      await api.addContributionDiscussion(id, msg);
      setDiscussMsg(prev => ({ ...prev, [id]: '' }));
      await loadAll();
    } catch { setError('Failed to send message'); }
  };

  const setReviewField = (id: number, field: string, value: string) => {
    setReviewForms(prev => ({ ...prev, [id]: { ...(prev[id] || { decision: '', notes: '', adjusted_value: '' }), [field]: value } }));
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="h-8 w-8 animate-spin" /></div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Target className="h-7 w-7 text-blue-600" /> Employee Ownership Program
          </h1>
          <p className="text-gray-600">Connect your team's contributions to business value</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex justify-between">
          {error}<button onClick={() => setError('')}><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-6">
          {[
            { id: 'review', label: 'Review Queue', icon: <ClipboardList className="h-4 w-4 inline mr-1" />, badge: queue.length },
            { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 className="h-4 w-4 inline mr-1" /> },
            { id: 'employees', label: 'Employees', icon: <Users className="h-4 w-4 inline mr-1" />, badge: employees.length },
            { id: 'kpis', label: 'Business KPIs', icon: <Target className="h-4 w-4 inline mr-1" /> },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id as Tab)}
              className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap inline-flex items-center gap-1 ${
                tab === t.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t.icon}{t.label}
              {t.badge != null && t.badge > 0 && (
                <span className="ml-1 bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full">{t.badge}</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Review Queue ── */}
      {tab === 'review' && (
        <div className="space-y-4">
          {queue.length === 0 ? (
            <div className="card text-center py-12">
              <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">All caught up — no pending submissions</p>
            </div>
          ) : (queue || []).map(contrib => {
            const ev = contrib.ai_evaluation;
            const form = reviewForms[contrib.id] || { decision: '', notes: '', adjusted_value: '' };
            const isExp = expandedContrib === contrib.id;
            return (
              <div key={contrib.id} className={`card border-l-4 ${STATUS_STYLE[contrib.status] || 'border-gray-200'}`}>
                <button className="w-full flex items-start justify-between text-left" onClick={() => setExpandedContrib(isExp ? null : contrib.id)}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${CATEGORY_COLORS[contrib.category] || CATEGORY_COLORS.other}`}>
                        {contrib.category.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-gray-500 capitalize">{contrib.type.replace('_', ' ')}</span>
                    </div>
                    <p className="font-semibold text-gray-900">{contrib.title}</p>
                    <p className="text-sm text-gray-600 mt-0.5">by {contrib.employee_name}</p>
                    {ev && !ev.is_intangible && ev.value_mid != null && (
                      <p className="text-sm text-blue-700 font-medium mt-1">
                        AI estimate: {formatCurrency(ev.value_low || 0)} – {formatCurrency(ev.value_high || 0)}
                        <span className={`ml-2 text-xs ${CONFIDENCE_COLOR[ev.confidence] || ''}`}>({ev.confidence} confidence)</span>
                      </p>
                    )}
                    {ev?.is_intangible && <p className="text-sm text-purple-700 font-medium mt-1">Intangible / cultural value</p>}
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <span className="text-xs text-gray-400">{new Date(contrib.created_at).toLocaleDateString()}</span>
                    {isExp ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                  </div>
                </button>

                {isExp && (
                  <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
                    {/* Description */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Description</p>
                      <p className="text-sm text-gray-700">{contrib.description}</p>
                      {contrib.evidence && <p className="text-xs text-gray-500 mt-1">Evidence: {contrib.evidence}</p>}
                    </div>

                    {/* AI evaluation */}
                    {ev && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                        <p className="text-xs font-bold text-blue-700 uppercase mb-2">AI Evaluation</p>
                        {!ev.is_intangible && ev.value_mid != null ? (
                          <div className="grid grid-cols-3 gap-3 mb-3">
                            <div className="text-center"><p className="text-xs text-gray-500">Low</p><p className="text-lg font-bold text-gray-700">{formatCurrency(ev.value_low || 0)}</p></div>
                            <div className="text-center"><p className="text-xs text-gray-500">Mid</p><p className="text-xl font-bold text-blue-700">{formatCurrency(ev.value_mid || 0)}</p></div>
                            <div className="text-center"><p className="text-xs text-gray-500">High</p><p className="text-lg font-bold text-gray-700">{formatCurrency(ev.value_high || 0)}</p></div>
                          </div>
                        ) : (
                          <p className="text-sm text-purple-700 font-medium mb-2">Intangible value — cultural or relationship impact</p>
                        )}
                        {/* Reasoning steps */}
                        {ev.reasoning?.length > 0 && (
                          <div className="space-y-1 mb-2">
                            {(ev.reasoning || []).map((step: any, i: number) => (
                              <p key={i} className="text-xs text-blue-800"><span className="font-bold">{step.label}:</span> {step.detail} {step.value && `→ ${step.value}`}</p>
                            ))}
                          </div>
                        )}
                        <p className={`text-xs font-medium ${CONFIDENCE_COLOR[ev.confidence]}`}>Confidence: {ev.confidence} — {ev.confidence_reason}</p>
                        {ev.linked_kpis?.length > 0 && (
                          <p className="text-xs text-blue-600 mt-1">Affects: {(ev.linked_kpis || []).map((k: any) => k.kpi_name).join(', ')}</p>
                        )}
                        {ev.clarifying_questions?.length > 0 && (
                          <div className="mt-2 bg-yellow-50 border border-yellow-200 rounded p-2">
                            <p className="text-xs font-medium text-yellow-800">Could improve estimate with:</p>
                            {(ev.clarifying_questions || []).map((q: string, i: number) => <p key={i} className="text-xs text-yellow-700">• {q}</p>)}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Review form */}
                    <div className="bg-gray-50 rounded-xl p-4">
                      <p className="text-sm font-semibold text-gray-700 mb-3">Your Decision</p>
                      <div className="flex gap-2 mb-3">
                        {['agree', 'adjust', 'decline'].map(d => (
                          <button key={d} onClick={() => setReviewField(contrib.id, 'decision', d)}
                            className={`flex-1 py-2 rounded-lg border text-sm font-medium capitalize transition-all ${
                              form.decision === d
                                ? d === 'agree' ? 'bg-green-600 text-white border-green-600'
                                  : d === 'decline' ? 'bg-red-600 text-white border-red-600'
                                  : 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                            }`}>
                            {d === 'agree' ? '✓ Agree' : d === 'adjust' ? '✏ Adjust' : '✗ Decline'}
                          </button>
                        ))}
                      </div>

                      {form.decision === 'adjust' && (
                        <div className="mb-3">
                          <label className="label">Adjusted Value ($)</label>
                          <input type="number" value={form.adjusted_value}
                            onChange={e => setReviewField(contrib.id, 'adjusted_value', e.target.value)}
                            className="input" placeholder="Enter your approved value" />
                        </div>
                      )}

                      <div className="mb-3">
                        <label className="label">Notes for Employee {form.decision === 'decline' || form.decision === 'adjust' ? '(required)' : '(optional but recommended)'}</label>
                        <textarea value={form.notes} onChange={e => setReviewField(contrib.id, 'notes', e.target.value)}
                          className="input w-full min-h-16 resize-y text-sm"
                          placeholder={form.decision === 'decline' ? 'Explain why this was declined...' : form.decision === 'adjust' ? 'Explain your adjustment...' : 'Add context or encouragement...'} />
                      </div>

                      <button onClick={() => submitReview(contrib.id)} disabled={!form.decision || !form.notes || reviewing === contrib.id}
                        className="btn btn-primary inline-flex items-center gap-2">
                        {reviewing === contrib.id ? <Loader className="h-4 w-4 animate-spin" /> : null}
                        Submit Review
                      </button>
                    </div>

                    {/* Discussion */}
                    {contrib.discussion?.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase">Discussion</p>
                        {(contrib.discussion || []).map((msg: any, i: number) => (
                          <div key={i} className={`p-2 rounded-lg text-sm ${msg.user_id === contrib.employee_id ? 'bg-gray-50' : 'bg-blue-50'}`}>
                            <p className="text-xs text-gray-400 mb-0.5">{msg.user_id === contrib.employee_id ? 'Employee' : 'You'} · {new Date(msg.created_at).toLocaleDateString()}</p>
                            {msg.message}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <input value={discussMsg[contrib.id] || ''} onChange={e => setDiscussMsg(prev => ({...prev, [contrib.id]: e.target.value}))}
                        className="input flex-1 text-sm" placeholder="Add a note or ask a question..." />
                      <button onClick={() => sendDiscussion(contrib.id)} className="btn btn-secondary text-sm px-3">
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Dashboard ── */}
      {tab === 'dashboard' && dashboard && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Team Members', val: dashboard.total_employees, icon: '👥' },
              { label: 'Total Submissions', val: dashboard.total_contributions, icon: '📝' },
              { label: 'Pending Review', val: dashboard.pending_review, icon: '⏳', alert: dashboard.pending_review > 0 },
              { label: 'Total Approved Value', val: formatCurrency(dashboard.total_approved_value || 0), icon: '💰' },
            ].map(s => (
              <div key={s.label} className={`card text-center ${s.alert ? 'border-yellow-300 bg-yellow-50' : ''}`}>
                <p className="text-2xl mb-1">{s.icon}</p>
                <p className={`text-2xl font-bold ${s.alert ? 'text-yellow-700' : 'text-gray-900'}`}>{s.val}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Value by category */}
          {dashboard.value_by_category && Object.keys(dashboard.value_by_category).length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-gray-800 mb-3">Value by Category</h3>
              <div className="space-y-2">
                {Object.entries(dashboard.value_by_category).map(([cat, val]) => (
                  <div key={cat} className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize w-32 text-center ${CATEGORY_COLORS[cat] || CATEGORY_COLORS.other}`}>
                      {cat.replace('_', ' ')}
                    </span>
                    <div className="flex-1 bg-gray-100 rounded-full h-3">
                      <div className="h-3 rounded-full bg-blue-500" style={{
                        width: `${Math.min(((val as number) / (dashboard.total_approved_value || 1)) * 100, 100)}%`
                      }} />
                    </div>
                    <span className="text-sm font-semibold text-gray-700 w-20 text-right">{formatCurrency(val as number)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top contributors */}
          {dashboard.top_contributors?.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-gray-800 mb-3">Top Contributors</h3>
              <div className="space-y-2">
                {(dashboard.top_contributors || []).map((emp: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-sm font-bold flex items-center justify-center">{i+1}</span>
                      <p className="font-medium text-gray-800">{emp.name}</p>
                      <span className="text-xs text-gray-400">{emp.count} contributions</span>
                    </div>
                    <p className="font-semibold text-green-700">{formatCurrency(emp.value)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Employees ── */}
      {tab === 'employees' && (
        <div className="space-y-4">
          <div className="flex justify-between">
            <p className="text-sm text-gray-500">{employees.length} team member{employees.length !== 1 ? 's' : ''}</p>
            <button onClick={() => setShowInvite(!showInvite)} className="btn btn-primary text-sm inline-flex items-center gap-1">
              <Plus className="h-4 w-4" /> Invite Employee
            </button>
          </div>

          {showInvite && (
            <div className="card border-blue-200 bg-blue-50">
              <h3 className="font-medium text-gray-800 mb-3">Invite a Team Member</h3>
              {inviteResult ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-green-800 mb-2">✓ Invite created for {inviteResult.email}</p>
                  <p className="text-sm text-gray-700 mb-2">Share this link:</p>
                  <div className="bg-white border border-gray-200 rounded p-3 text-xs font-mono text-blue-700 break-all">{inviteResult.invite_link}</div>
                  <p className="text-xs text-gray-400 mt-2">Expires in 7 days</p>
                  <button onClick={() => { setInviteResult(null); setShowInvite(false); }} className="btn btn-secondary text-sm mt-3">Done</button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div><label className="label">Full Name *</label><input value={inviteForm.full_name} onChange={e => setInviteForm({...inviteForm, full_name: e.target.value})} className="input" /></div>
                    <div><label className="label">Email *</label><input type="email" value={inviteForm.email} onChange={e => setInviteForm({...inviteForm, email: e.target.value})} className="input" /></div>
                    <div><label className="label">Job Title</label><input value={inviteForm.job_title} onChange={e => setInviteForm({...inviteForm, job_title: e.target.value})} className="input" placeholder="e.g. Operations Manager" /></div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={sendInvite} disabled={inviting || !inviteForm.email || !inviteForm.full_name} className="btn btn-primary inline-flex items-center gap-2">
                      {inviting ? <Loader className="h-4 w-4 animate-spin" /> : null} Create Invite Link
                    </button>
                    <button onClick={() => setShowInvite(false)} className="btn btn-secondary">Cancel</button>
                  </div>
                </>
              )}
            </div>
          )}

          {employees.length === 0 ? (
            <div className="card text-center py-10">
              <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">No team members yet. Invite your first employee.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {(employees || []).map(emp => (
                <div key={emp.id} className="card">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{emp.full_name}</p>
                      <p className="text-sm text-gray-400">{emp.email}</p>
                      {emp.job_title && <p className="text-xs text-blue-600 mt-0.5">{emp.job_title}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-green-700">{formatCurrency(emp.total_approved_value || 0)}</p>
                      <p className="text-xs text-gray-400">approved value</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 text-center">
                    <div className="bg-gray-50 rounded p-2">
                      <p className="text-lg font-bold text-gray-700">{emp.contribution_count}</p>
                      <p className="text-xs text-gray-400">contributions</p>
                    </div>
                    <div className={`rounded p-2 ${emp.pending_review > 0 ? 'bg-yellow-50' : 'bg-gray-50'}`}>
                      <p className={`text-lg font-bold ${emp.pending_review > 0 ? 'text-yellow-700' : 'text-gray-700'}`}>{emp.pending_review}</p>
                      <p className="text-xs text-gray-400">pending review</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Assign KPI form */}
          {employees.length > 0 && kpis.length > 0 && (
            <div className="card border-dashed">
              <div className="flex items-center justify-between">
                <p className="font-medium text-gray-700">Assign KPIs to Team Members</p>
                <button onClick={() => setShowAssign(!showAssign)} className="btn btn-secondary text-sm inline-flex items-center gap-1">
                  <Target className="h-4 w-4" /> {showAssign ? 'Cancel' : 'Assign KPI'}
                </button>
              </div>
              {showAssign && (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Employee</label>
                    <select value={assignForm.employee_id} onChange={e => setAssignForm({...assignForm, employee_id: e.target.value})} className="input">
                      <option value="">Select employee</option>
                      {(employees || []).map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Business KPI</label>
                    <select value={assignForm.business_kpi_id} onChange={e => setAssignForm({...assignForm, business_kpi_id: e.target.value})} className="input">
                      <option value="">Select KPI</option>
                      {(kpis || []).map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Personal Target ({kpis.find(k => k.id === parseInt(assignForm.business_kpi_id))?.unit || '$'})</label>
                    <input type="number" value={assignForm.personal_target} onChange={e => setAssignForm({...assignForm, personal_target: e.target.value})} className="input" />
                  </div>
                  <div>
                    <label className="label">Role Description</label>
                    <input value={assignForm.role_description} onChange={e => setAssignForm({...assignForm, role_description: e.target.value})} className="input" placeholder="How this employee impacts this KPI" />
                  </div>
                  <div className="col-span-2">
                    <label className="label">Measurement Method</label>
                    <input value={assignForm.measurement_method} onChange={e => setAssignForm({...assignForm, measurement_method: e.target.value})} className="input" placeholder="How we'll measure their contribution" />
                  </div>
                  <button onClick={assignKPI} disabled={!assignForm.employee_id || !assignForm.business_kpi_id} className="btn btn-primary col-span-2">Save Assignment</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Business KPIs ── */}
      {tab === 'kpis' && (
        <div className="space-y-4">
          <div className="flex justify-between">
            <p className="text-sm text-gray-500">{kpis.length} business KPI{kpis.length !== 1 ? 's' : ''}</p>
            <button onClick={() => setShowKPIForm(!showKPIForm)} className="btn btn-primary text-sm inline-flex items-center gap-1">
              <Plus className="h-4 w-4" /> New KPI
            </button>
          </div>

          {showKPIForm && (
            <div className="card border-blue-200 bg-blue-50">
              <h3 className="font-medium text-gray-800 mb-3">New Business KPI</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="col-span-2"><label className="label">KPI Name *</label><input value={kpiForm.name} onChange={e => setKpiForm({...kpiForm, name: e.target.value})} className="input" placeholder="e.g. Monthly Revenue Growth" /></div>
                <div><label className="label">Category</label>
                  <select value={kpiForm.category} onChange={e => setKpiForm({...kpiForm, category: e.target.value})} className="input">
                    {['revenue', 'cost_savings', 'risk_reduction', 'culture'].map(c => <option key={c} value={c}>{c.replace('_', ' ').toUpperCase()}</option>)}
                  </select>
                </div>
                <div><label className="label">Period</label>
                  <select value={kpiForm.period} onChange={e => setKpiForm({...kpiForm, period: e.target.value})} className="input">
                    {['monthly', 'quarterly', 'annual'].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div><label className="label">Target Value</label><input type="number" value={kpiForm.target_value} onChange={e => setKpiForm({...kpiForm, target_value: e.target.value})} className="input" /></div>
                <div><label className="label">Unit</label><input value={kpiForm.unit} onChange={e => setKpiForm({...kpiForm, unit: e.target.value})} className="input" placeholder="$, %, hours, count" /></div>
                <div className="col-span-2"><label className="label">Description</label><input value={kpiForm.description} onChange={e => setKpiForm({...kpiForm, description: e.target.value})} className="input" /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveKPI} disabled={savingKPI || !kpiForm.name} className="btn btn-primary inline-flex items-center gap-2">
                  {savingKPI ? <Loader className="h-4 w-4 animate-spin" /> : null} Save KPI
                </button>
                <button onClick={() => setShowKPIForm(false)} className="btn btn-secondary">Cancel</button>
              </div>
            </div>
          )}

          {kpis.length === 0 ? (
            <div className="card text-center py-10">
              <Target className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400 mb-2">No business KPIs yet</p>
              <p className="text-sm text-gray-400">Create KPIs to give your team targets and connect their work to business outcomes.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {(kpis || []).map(kpi => (
                <div key={kpi.id} className="card">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${CATEGORY_COLORS[kpi.category] || CATEGORY_COLORS.other}`}>
                        {kpi.category.replace('_', ' ')}
                      </span>
                      <p className="font-semibold text-gray-900 mt-2">{kpi.name}</p>
                      {kpi.description && <p className="text-sm text-gray-500 mt-0.5">{kpi.description}</p>}
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      {kpi.target_value && <p className="font-bold text-gray-900">{kpi.unit === '$' ? formatCurrency(kpi.target_value) : `${kpi.target_value} ${kpi.unit || ''}`}</p>}
                      <p className="text-xs text-gray-400 capitalize">{kpi.period} target</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}