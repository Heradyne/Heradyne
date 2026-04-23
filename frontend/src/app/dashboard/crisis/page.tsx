'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Siren, Loader, RefreshCw, CheckCircle, AlertTriangle, X, Clock, Users, Phone } from 'lucide-react';
import { api } from '@/lib/api';

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'bg-red-50 border-red-400 text-red-900',
  high:     'bg-orange-50 border-orange-400 text-orange-900',
  medium:   'bg-yellow-50 border-yellow-400 text-yellow-900',
};

const CRISIS_TYPES = [
  { value: 'customer_loss', label: '📉 Major Customer Loss', desc: 'Lost a key account or significant revenue source' },
  { value: 'key_person', label: '👤 Key Person Departure', desc: 'Owner, manager, or essential employee leaving' },
  { value: 'compliance', label: '⚖️ Compliance / Legal Issue', desc: 'Regulatory, licensing, or legal problem surfaced' },
  { value: 'cash_crisis', label: '💸 Cash Crisis', desc: "Can't make payroll, bills coming due, cash shortfall" },
  { value: 'operational', label: '⚙️ Operational Failure', desc: 'Equipment, supply chain, or facility problem' },
  { value: 'reputation', label: '📣 Reputation / PR Crisis', desc: 'Negative press, reviews, or public situation' },
  { value: 'other', label: '🔴 Other Crisis', desc: 'Something urgent not listed above' },
];

const HOUR_LABELS: Record<string, string> = {
  '1-4': '🔴 First 4 Hours', '4-12': '🟠 Hours 4–12', '12-24': '🟡 Hours 12–24',
};
const DAY_LABELS: Record<string, string> = {
  '2-3': 'Days 2–3', '4-7': 'Days 4–7', '8-14': 'Days 8–14',
};

export default function CrisisPage() {
  const [deals, setDeals] = useState<any[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [crises, setCrises] = useState<any[]>([]);
  const [activeEvent, setActiveEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [resolveForm, setResolveForm] = useState<Record<number, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ crisis_type: '', description: '', severity: 'high' });

  useEffect(() => {
    api.getDeals().then(d => {
      setDeals(d.filter((x: any) => x.status !== 'draft'));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const selectDeal = async (deal: any) => {
    setSelectedDeal(deal);
    setActiveEvent(null);
    try {
      const data = await api.listCrises(deal.id);
      setCrises(data.events || []);
    } catch { setError('Failed to load crisis history'); }
  };

  const reportCrisis = async () => {
    if (!selectedDeal || !form.crisis_type || !form.description) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await api.reportCrisis(selectedDeal.id, form);
      setActiveEvent(result);
      const data = await api.listCrises(selectedDeal.id);
      setCrises(data.events || []);
      setShowForm(false);
      setForm({ crisis_type: '', description: '', severity: 'high' });
    } catch (e: any) { setError(e.response?.data?.detail || 'Failed to generate response plan'); }
    finally { setSubmitting(false); }
  };

  const resolve = async (id: number) => {
    const notes = resolveForm[id];
    if (!notes) return;
    try {
      await api.resolveCrisis(id, notes);
      const data = await api.listCrises(selectedDeal.id);
      setCrises(data.events || []);
      if (activeEvent?.event_id === id) setActiveEvent((p: any) => ({...p, status: 'resolved'}));
    } catch { setError('Failed to resolve'); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="h-8 w-8 animate-spin" /></div>;

  const response = activeEvent?.ai_response || activeEvent;
  const isResolved = activeEvent?.status === 'resolved';

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Siren className="h-7 w-7 text-red-600" /> Crisis Response
          </h1>
          <p className="text-gray-600">Structured 24–48 hour response plans for business emergencies</p>
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
              {crises.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Crisis History</p>
                  <div className="space-y-1 mb-3">
                    {crises.map(c => (
                      <button key={c.id} onClick={() => setActiveEvent(c)}
                        className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-all ${activeEvent?.id === c.id || activeEvent?.event_id === c.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                        <div className="flex items-center justify-between">
                          <p className="font-medium capitalize">{c.crisis_type.replace('_', ' ')}</p>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${c.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{c.status}</span>
                        </div>
                        <p className="text-gray-400 mt-0.5">{new Date(c.created_at).toLocaleDateString()}</p>
                      </button>
                    ))}
                  </div>
                </>
              )}
              <button onClick={() => setShowForm(!showForm)} className="btn btn-primary w-full text-sm bg-red-600 hover:bg-red-700 border-red-600">
                🚨 Report a Crisis
              </button>
            </>
          )}
        </div>

        <div className="col-span-3">
          {!selectedDeal ? (
            <div className="card text-center py-16"><Siren className="h-12 w-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-400">Select a deal to report a crisis or view past responses</p></div>
          ) : showForm ? (
            <div className="card border-red-300 bg-red-50">
              <h3 className="font-semibold text-red-900 mb-1 flex items-center gap-2"><Siren className="h-5 w-5" />Report a Business Crisis</h3>
              <p className="text-sm text-red-700 mb-4">Claude will generate an immediate action plan for the next 24–48 hours.</p>
              <div className="space-y-4">
                <div>
                  <label className="label text-red-800">What type of crisis?</label>
                  <div className="grid grid-cols-1 gap-2">
                    {CRISIS_TYPES.map(ct => (
                      <button key={ct.value} onClick={() => setForm({...form, crisis_type: ct.value})}
                        className={`text-left p-3 rounded-xl border transition-all ${form.crisis_type === ct.value ? 'border-red-500 bg-red-100' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
                        <p className="font-medium text-sm">{ct.label}</p>
                        <p className="text-xs text-gray-500">{ct.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label">Describe what happened *</label>
                  <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                    className="input w-full min-h-24 resize-y"
                    placeholder="Be specific — what happened, when, who is involved, what's at immediate risk. The more detail, the better the response plan." />
                </div>
                <div>
                  <label className="label">Severity</label>
                  <div className="flex gap-2">
                    {['high', 'critical', 'medium'].map(s => (
                      <button key={s} onClick={() => setForm({...form, severity: s})}
                        className={`flex-1 py-2 rounded-lg border text-sm font-medium capitalize ${form.severity === s ? (s === 'critical' ? 'bg-red-600 text-white border-red-600' : s === 'high' ? 'bg-orange-500 text-white border-orange-500' : 'bg-yellow-500 text-white border-yellow-500') : 'bg-white text-gray-600 border-gray-200'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={reportCrisis} disabled={submitting || !form.crisis_type || !form.description}
                    className="btn bg-red-600 text-white hover:bg-red-700 border-red-600 inline-flex items-center gap-2">
                    {submitting ? <><Loader className="h-4 w-4 animate-spin" />Generating response plan...</> : '🚨 Get Response Plan'}
                  </button>
                  <button onClick={() => setShowForm(false)} className="btn btn-secondary">Cancel</button>
                </div>
              </div>
            </div>
          ) : submitting ? (
            <div className="card text-center py-12">
              <Siren className="h-8 w-8 text-red-500 animate-bounce mx-auto mb-3" />
              <p className="font-medium text-gray-700">Generating crisis response plan...</p>
              <p className="text-sm text-gray-400 mt-1">Building your 24-48 hour action playbook</p>
            </div>
          ) : !response ? (
            <div className="card text-center py-16 border-dashed">
              <Siren className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400 mb-3">No crisis events on record</p>
              <p className="text-sm text-gray-400">Use the crisis response workflow when something urgent happens to your business.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Crisis header */}
              <div className={`card border-2 ${SEVERITY_STYLE[response.severity_assessment || 'high']}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold uppercase tracking-widest opacity-60">{response.crisis_type?.replace('_', ' ')}</span>
                      {isResolved && <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">Resolved</span>}
                    </div>
                    <p className="text-lg font-bold">{response.headline}</p>
                    <p className="text-sm mt-1 opacity-80">Severity: {response.severity_assessment?.toUpperCase()}</p>
                  </div>
                  {response.notify_lender && (
                    <div className="bg-orange-100 border border-orange-300 rounded-xl p-2 text-center shrink-0 ml-3">
                      <Phone className="h-5 w-5 text-orange-600 mx-auto mb-0.5" />
                      <p className="text-xs font-bold text-orange-700">Notify</p>
                      <p className="text-xs text-orange-600">Lender</p>
                    </div>
                  )}
                </div>

                {response.immediate_risk_to_loan && (
                  <div className="mt-3 bg-red-100 border border-red-200 rounded-lg p-2">
                    <p className="text-xs font-bold text-red-800">Loan Risk: {response.immediate_risk_to_loan}</p>
                  </div>
                )}
              </div>

              {/* Lender communication draft */}
              {response.notify_lender && response.lender_communication_draft && (
                <div className="card bg-orange-50 border-orange-200">
                  <p className="text-sm font-semibold text-orange-800 mb-2 flex items-center gap-2"><Phone className="h-4 w-4" />Draft Communication to Lender</p>
                  <p className="text-sm text-gray-700 font-mono bg-white border border-gray-100 rounded-lg p-3 text-xs whitespace-pre-wrap">{response.lender_communication_draft}</p>
                </div>
              )}

              {/* Stabilize actions (first 24h) */}
              {response.stabilize_actions?.length > 0 && (
                <div className="card">
                  <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2"><Clock className="h-5 w-5 text-red-500" />Stabilize — First 24 Hours</h3>
                  {['1-4', '4-12', '12-24'].map(hour => {
                    const actions = response.stabilize_actions.filter((a: any) => a.hour === hour);
                    if (!actions.length) return null;
                    return (
                      <div key={hour} className="mb-4">
                        <p className="text-xs font-bold text-gray-500 uppercase mb-2">{HOUR_LABELS[hour]}</p>
                        <div className="space-y-2">
                          {actions.map((action: any, i: number) => (
                            <div key={i} className="flex gap-3 p-3 bg-red-50 border border-red-100 rounded-xl">
                              <div className="w-6 h-6 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center shrink-0">{i+1}</div>
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-gray-800">{action.action}</p>
                                <div className="flex gap-3 mt-1">
                                  <span className="text-xs text-blue-600 font-medium">Owner: {action.who}</span>
                                  <span className="text-xs text-red-600">{action.why}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Recovery actions (days 2-14) */}
              {response.recovery_actions?.length > 0 && (
                <div className="card">
                  <h3 className="font-semibold text-gray-800 mb-3">Recover — Days 2–14</h3>
                  <div className="space-y-2">
                    {response.recovery_actions.map((action: any, i: number) => (
                      <div key={i} className="flex gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl">
                        <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded-full font-medium shrink-0">{action.day}</span>
                        <div>
                          <p className="text-sm font-medium text-gray-800">{action.action}</p>
                          <p className="text-xs text-blue-700 mt-0.5">{action.outcome}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cash preservation */}
              {response.cash_preservation_steps?.length > 0 && (
                <div className="card bg-green-50 border-green-200">
                  <p className="text-sm font-semibold text-green-800 mb-2">💵 Cash Preservation Steps</p>
                  {response.cash_preservation_steps.map((s: string, i: number) => <p key={i} className="text-sm text-green-700 flex gap-2 mb-1"><span className="shrink-0">•</span>{s}</p>)}
                </div>
              )}

              {/* Mistakes to avoid */}
              {response.mistakes_to_avoid?.length > 0 && (
                <div className="card bg-yellow-50 border-yellow-200">
                  <p className="text-sm font-semibold text-yellow-800 mb-2">⚠️ Common Mistakes to Avoid</p>
                  {response.mistakes_to_avoid.map((m: string, i: number) => <p key={i} className="text-sm text-yellow-700 flex gap-2 mb-1"><X className="h-4 w-4 shrink-0 mt-0.5" />{m}</p>)}
                </div>
              )}

              {/* Resources */}
              {response.resources_to_engage?.length > 0 && (
                <div className="card">
                  <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2"><Users className="h-4 w-4" />Resources to Engage</p>
                  <div className="flex flex-wrap gap-2">
                    {response.resources_to_engage.map((r: string, i: number) => (
                      <span key={i} className="text-xs bg-gray-100 border border-gray-200 text-gray-700 px-3 py-1 rounded-full">{r}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* 30 day outlook */}
              {response['30_day_outlook'] && (
                <div className="card bg-slate-50 border-slate-200">
                  <p className="text-sm font-semibold text-slate-700 mb-1">30-Day Outlook</p>
                  <p className="text-sm text-slate-600">{response['30_day_outlook']}</p>
                </div>
              )}

              {/* Resolve */}
              {!isResolved && (activeEvent?.event_id || activeEvent?.id) && (
                <div className="card border-dashed">
                  <p className="text-sm font-semibold text-gray-700 mb-2">Mark Crisis Resolved</p>
                  <textarea value={resolveForm[activeEvent.event_id || activeEvent.id] || ''} onChange={e => setResolveForm(prev => ({...prev, [activeEvent.event_id || activeEvent.id]: e.target.value}))}
                    className="input w-full min-h-16 text-sm mb-2" placeholder="Describe how the crisis was resolved..." />
                  <button onClick={() => resolve(activeEvent.event_id || activeEvent.id)} className="btn btn-secondary text-sm inline-flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" /> Mark Resolved
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
