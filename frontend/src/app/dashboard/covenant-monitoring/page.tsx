'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Shield, AlertTriangle, CheckCircle, Plus, FileText, RefreshCw, Loader, ChevronDown, ChevronUp, Copy, Check, X } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

const STATUS_STYLE: Record<string, string> = {
  compliant:   'bg-green-50 border-green-200 text-green-800',
  watch:       'bg-yellow-50 border-yellow-200 text-yellow-800',
  breach:      'bg-red-50 border-red-200 text-red-800',
  not_checked: 'bg-gray-50 border-gray-200 text-gray-600',
  waived:      'bg-blue-50 border-blue-200 text-blue-800',
};

const COVENANT_TYPES = ['dscr', 'reporting', 'insurance', 'financial', 'other'];
const FREQUENCIES = ['monthly', 'quarterly', 'annual'];

export default function CovenantMonitoringPage() {
  const [deals, setDeals] = useState<any[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [covenants, setCovenants] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [letter, setLetter] = useState<Record<number, any>>({});
  const [letterLoading, setLetterLoading] = useState<number | null>(null);
  const [checkLoading, setCheckLoading] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [checkForm, setCheckForm] = useState<Record<number, { value: string; notes: string }>>({});
  const [newCovenant, setNewCovenant] = useState({
    name: '', covenant_type: 'dscr', required_value: '', frequency: 'annual', notes: '',
  });

  useEffect(() => {
    Promise.all([
      api.getDeals().then(setDeals).catch(() => {}),
      api.getCovenantDashboard().then(setDashboard).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const selectDeal = async (deal: any) => {
    setSelectedDeal(deal);
    setCovenants([]);
    setShowAddForm(false);
    try {
      const data = await api.getCovenants(deal.id);
      setCovenants(data.covenants || []);
    } catch { setError('Failed to load covenants'); }
  };

  const addCovenant = async () => {
    if (!selectedDeal || !newCovenant.name) return;
    try {
      await api.addCovenant(selectedDeal.id, {
        ...newCovenant,
        required_value: newCovenant.required_value ? parseFloat(newCovenant.required_value) : null,
      });
      const data = await api.getCovenants(selectedDeal.id);
      setCovenants(data.covenants || []);
      setShowAddForm(false);
      setNewCovenant({ name: '', covenant_type: 'dscr', required_value: '', frequency: 'annual', notes: '' });
    } catch { setError('Failed to add covenant'); }
  };

  const logCheck = async (covenantId: number) => {
    const form = checkForm[covenantId] || { value: '', notes: '' };
    setCheckLoading(covenantId);
    try {
      await api.logCovenantCheck(covenantId, {
        actual_value: form.value ? parseFloat(form.value) : null,
        notes: form.notes || null,
      });
      const data = await api.getCovenants(selectedDeal.id);
      setCovenants(data.covenants || []);
      setCheckForm(prev => ({ ...prev, [covenantId]: { value: '', notes: '' } }));
    } catch { setError('Failed to log check'); }
    finally { setCheckLoading(null); }
  };

  const generateLetter = async (covenantId: number) => {
    setLetterLoading(covenantId);
    setError('');
    try {
      const result = await api.generateCovenantLetter(covenantId);
      setLetter(prev => ({ ...prev, [covenantId]: result }));
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to generate letter');
    } finally { setLetterLoading(null); }
  };

  const copyLetter = (covenantId: number) => {
    const l = letter[covenantId];
    if (!l) return;
    const text = [
      l.subject, '', l.salutation, '', l.opening_paragraph, '',
      l.covenant_detail, '',
      ...(l.required_actions || []).map((a: string) => `• ${a}`),
      '', `Deadline: ${l.deadline || 'As noted above'}`,
      '', l.closing_paragraph, '', l.closing,
    ].join('\n');
    navigator.clipboard.writeText(text);
    setCopied(covenantId);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="h-8 w-8 animate-spin text-primary-600" /></div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="h-7 w-7 text-blue-600" /> Covenant Monitoring
          </h1>
          <p className="text-gray-600">Track loan covenants, log checks, and generate compliance letters</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex justify-between">
          {error}<button onClick={() => setError('')}><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Portfolio summary */}
      {dashboard && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="card text-center">
            <p className="text-3xl font-bold text-gray-900">{dashboard.total_covenants}</p>
            <p className="text-sm text-gray-500">Active Covenants</p>
          </div>
          <div className="card text-center border-yellow-200 bg-yellow-50">
            <p className="text-3xl font-bold text-yellow-700">{dashboard.watches}</p>
            <p className="text-sm text-yellow-600">Watch</p>
          </div>
          <div className="card text-center border-red-200 bg-red-50">
            <p className="text-3xl font-bold text-red-700">{dashboard.breaches}</p>
            <p className="text-sm text-red-600">Breach</p>
          </div>
        </div>
      )}

      {/* Portfolio alerts */}
      {dashboard?.alerts?.length > 0 && (
        <div className="card mb-6">
          <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" /> Portfolio Alerts
          </h2>
          <div className="space-y-2">
            {(dashboard.alerts || []).map((alert: any, i: number) => (
              <div key={i} className={`flex items-center justify-between p-3 rounded-lg border ${STATUS_STYLE[alert.status]}`}>
                <div>
                  <p className="font-medium text-sm">{alert.deal_name} — {alert.covenant_name}</p>
                  <p className="text-xs mt-0.5">
                    Required: {alert.required_value} | Actual: {alert.actual_value} | Checked: {alert.check_date}
                  </p>
                </div>
                <span className="text-xs font-bold uppercase px-2 py-1 rounded bg-white bg-opacity-60">
                  {alert.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-6">
        {/* Deal list */}
        <div className="col-span-1">
          <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Select Deal</p>
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {(deals || []).map(deal => (
              <button key={deal.id} onClick={() => selectDeal(deal)}
                className={`w-full text-left p-3 rounded-xl border text-sm transition-all ${
                  selectedDeal?.id === deal.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                <p className="font-medium text-gray-900 truncate">{deal.name}</p>
                <p className="text-xs text-gray-400 mt-0.5 capitalize">{deal.industry}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Covenants panel */}
        <div className="col-span-3">
          {!selectedDeal ? (
            <div className="card text-center py-16">
              <Shield className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">Select a deal to manage covenants</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">{selectedDeal.name}</h2>
                <button onClick={() => setShowAddForm(!showAddForm)} className="btn btn-secondary text-sm inline-flex items-center gap-1">
                  <Plus className="h-4 w-4" /> Add Covenant
                </button>
              </div>

              {/* Add covenant form */}
              {showAddForm && (
                <div className="card border-blue-200 bg-blue-50">
                  <h3 className="font-medium text-gray-800 mb-3">New Covenant</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="label">Covenant Name *</label>
                      <input value={newCovenant.name} onChange={e => setNewCovenant({...newCovenant, name: e.target.value})}
                        className="input" placeholder="e.g. Minimum DSCR 1.25x" />
                    </div>
                    <div>
                      <label className="label">Type</label>
                      <select value={newCovenant.covenant_type} onChange={e => setNewCovenant({...newCovenant, covenant_type: e.target.value})} className="input">
                        {(COVENANT_TYPES || []).map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Required Value</label>
                      <input type="number" step="0.01" value={newCovenant.required_value}
                        onChange={e => setNewCovenant({...newCovenant, required_value: e.target.value})}
                        className="input" placeholder="e.g. 1.25" />
                    </div>
                    <div>
                      <label className="label">Frequency</label>
                      <select value={newCovenant.frequency} onChange={e => setNewCovenant({...newCovenant, frequency: e.target.value})} className="input">
                        {(FREQUENCIES || []).map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase()+f.slice(1)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Notes</label>
                      <input value={newCovenant.notes} onChange={e => setNewCovenant({...newCovenant, notes: e.target.value})}
                        className="input" placeholder="Optional notes" />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={addCovenant} className="btn btn-primary text-sm">Save Covenant</button>
                    <button onClick={() => setShowAddForm(false)} className="btn btn-secondary text-sm">Cancel</button>
                  </div>
                </div>
              )}

              {covenants.length === 0 ? (
                <div className="card text-center py-10">
                  <p className="text-gray-400 mb-3">No covenants tracked for this deal yet</p>
                  <button onClick={() => setShowAddForm(true)} className="btn btn-primary text-sm">
                    <Plus className="h-4 w-4 mr-1" />Add First Covenant
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {(covenants || []).map(cov => {
                    const latest = cov.latest_check;
                    const isExp = expanded === cov.id;
                    const form = checkForm[cov.id] || { value: '', notes: '' };
                    const ltr = letter[cov.id];

                    return (
                      <div key={cov.id} className="card overflow-hidden">
                        {/* Header */}
                        <button className="w-full flex items-center justify-between" onClick={() => setExpanded(isExp ? null : cov.id)}>
                          <div className="flex items-center gap-3">
                            <div>
                              <p className="font-semibold text-gray-900 text-left">{cov.name}</p>
                              <p className="text-xs text-gray-500 text-left capitalize">
                                {cov.covenant_type} · {cov.frequency} ·
                                Required: {cov.required_value || cov.required_text || 'See notes'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {latest ? (
                              <span className={`text-xs px-2 py-1 rounded-full border font-medium ${STATUS_STYLE[latest.status]}`}>
                                {latest.status.replace('_', ' ').toUpperCase()}
                              </span>
                            ) : (
                              <span className="text-xs px-2 py-1 rounded-full border bg-gray-50 border-gray-200 text-gray-500">
                                NOT CHECKED
                              </span>
                            )}
                            {isExp ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                          </div>
                        </button>

                        {isExp && (
                          <div className="border-t border-gray-100 mt-3 pt-3 space-y-4">
                            {/* Latest check detail */}
                            {latest && (
                              <div className={`p-3 rounded-lg border ${STATUS_STYLE[latest.status]}`}>
                                <p className="text-sm font-medium">Last checked: {latest.date}</p>
                                {latest.actual_value != null && (
                                  <p className="text-sm">Actual: <strong>{latest.actual_value}</strong> vs Required: {cov.required_value}</p>
                                )}
                                {latest.letter_generated && (
                                  <p className="text-xs mt-1 opacity-70">✓ Letter generated</p>
                                )}
                              </div>
                            )}

                            {/* Log new check */}
                            <div className="bg-gray-50 rounded-lg p-3">
                              <p className="text-sm font-medium text-gray-700 mb-2">Log Compliance Check</p>
                              <div className="flex gap-2">
                                <input type="number" step="0.01" value={form.value}
                                  onChange={e => setCheckForm(prev => ({...prev, [cov.id]: {...(prev[cov.id] || {value:'',notes:''}), value: e.target.value}}))}
                                  className="input flex-1 text-sm" placeholder={`Actual ${cov.covenant_type === 'dscr' ? 'DSCR' : 'value'}`} />
                                <input value={form.notes}
                                  onChange={e => setCheckForm(prev => ({...prev, [cov.id]: {...(prev[cov.id] || {value:'',notes:''}), notes: e.target.value}}))}
                                  className="input flex-1 text-sm" placeholder="Notes (optional)" />
                                <button onClick={() => logCheck(cov.id)} disabled={checkLoading === cov.id}
                                  className="btn btn-primary text-sm px-3">
                                  {checkLoading === cov.id ? <Loader className="h-4 w-4 animate-spin" /> : 'Log'}
                                </button>
                              </div>
                            </div>

                            {/* Generate letter */}
                            {latest && latest.status !== 'compliant' && (
                              <div>
                                <button onClick={() => generateLetter(cov.id)} disabled={letterLoading === cov.id}
                                  className="btn btn-secondary text-sm inline-flex items-center gap-2">
                                  {letterLoading === cov.id
                                    ? <><Loader className="h-4 w-4 animate-spin" />Generating letter...</>
                                    : <><FileText className="h-4 w-4" />Generate {latest.status === 'breach' ? 'Breach Notice' : 'Watch Notice'}</>}
                                </button>

                                {ltr && (
                                  <div className="mt-3 bg-white border border-gray-200 rounded-xl p-4">
                                    <div className="flex items-start justify-between mb-3">
                                      <div>
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                          ltr.urgency === 'critical' ? 'bg-red-100 text-red-700' :
                                          ltr.urgency === 'urgent' ? 'bg-orange-100 text-orange-700' :
                                          'bg-gray-100 text-gray-600'
                                        }`}>{ltr.urgency?.toUpperCase()}</span>
                                        <p className="text-sm font-semibold text-gray-800 mt-1">{ltr.subject}</p>
                                      </div>
                                      <button onClick={() => copyLetter(cov.id)} className="btn btn-secondary text-xs inline-flex items-center gap-1">
                                        {copied === cov.id ? <><Check className="h-3 w-3 text-green-600" />Copied</> : <><Copy className="h-3 w-3" />Copy</>}
                                      </button>
                                    </div>
                                    <div className="space-y-2 text-sm text-gray-700 bg-gray-50 rounded-lg p-3 font-mono text-xs whitespace-pre-wrap">
                                      {[ltr.salutation, '', ltr.opening_paragraph, '', ltr.covenant_detail, '',
                                        ...(ltr.required_actions || []).map((a: string) => `• ${a}`),
                                        '', ltr.deadline ? `Deadline: ${ltr.deadline}` : '',
                                        '', ltr.closing_paragraph, '', ltr.closing
                                      ].join('\n')}
                                    </div>
                                    {ltr.cc?.length > 0 && (
                                      <p className="text-xs text-gray-500 mt-2">CC: {ltr.cc.join(', ')}</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            {latest?.status === 'compliant' && (
                              <button onClick={() => generateLetter(cov.id)} disabled={letterLoading === cov.id}
                                className="btn btn-secondary text-sm inline-flex items-center gap-2 text-green-700">
                                {letterLoading === cov.id ? <Loader className="h-4 w-4 animate-spin" /> : <><CheckCircle className="h-4 w-4" />Generate Compliance Confirmation</>}
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
          )}
        </div>
      </div>
    </div>
  );
}