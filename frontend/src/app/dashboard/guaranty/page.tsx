'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { AlertTriangle, FileText, Loader, RefreshCw, CheckCircle, XCircle, ChevronDown, ChevronUp, X, DollarSign } from 'lucide-react';
import { api } from '@/lib/api';
import { AIDisclaimer } from '@/components/ai-disclaimer';
import { formatCurrency } from '@/lib/utils';

const TAB_STATUS: Record<string, string> = {
  complete: 'text-green-700 bg-green-50 border-green-200',
  incomplete: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  missing: 'text-red-700 bg-red-50 border-red-200',
};

const READINESS_STYLE: Record<string, string> = {
  ready: 'border-green-300 bg-green-50',
  needs_work: 'border-yellow-300 bg-yellow-50',
  critical_gaps: 'border-red-300 bg-red-50',
};

export default function GuarantyPackagePage() {
  const [deals, setDeals] = useState<any[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [pkg, setPkg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [expandedTab, setExpandedTab] = useState<number | null>(1);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ default_date: '', default_reason: '', sba_loan_number: '' });

  useEffect(() => { api.getDeals().then(d => setDeals(d.filter((x: any) => x.status !== 'draft'))).catch(() => {}).finally(() => setLoading(false)); }, []);

  const selectDeal = async (deal: any) => {
    setSelectedDeal(deal);
    setPkg(null);
    try {
      const data = await api.getGuarantyPackage(deal.id);
      if (data.exists) setPkg(data);
    } catch { /* none yet */ }
  };

  const generate = async () => {
    if (!selectedDeal || !form.default_date || !form.default_reason) return;
    setGenerating(true);
    setError('');
    try {
      const result = await api.generateGuarantyPackage(selectedDeal.id, form);
      setPkg(result);
      setShowForm(false);
    } catch (e: any) { setError(e.response?.data?.detail || 'Failed to generate package'); }
    finally { setGenerating(false); }
  };

  const toggleTab = async (tabNumber: number, complete: boolean) => {
    if (!pkg?.package_id) return;
    try {
      const result = await api.updateGuarantyTab(pkg.package_id, tabNumber, complete);
      setPkg((prev: any) => ({
        ...prev,
        tabs_complete: { ...prev.tabs_complete, [String(tabNumber)]: complete },
      }));
    } catch { /* silent */ }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="h-8 w-8 animate-spin" /></div>;

  const tabs = pkg?.tabs || [];
  const completedTabs = Object.values(pkg?.tabs_complete || {}).filter(Boolean).length;
  const totalTabs = tabs.length || 10;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="h-7 w-7 text-red-600" /> Guaranty Purchase Package
          </h1>
          <p className="text-gray-600">AI-generated 10-tab SBA guaranty purchase packages for defaulted loans</p>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex justify-between">{error}<button onClick={() => setError('')}><X className="h-4 w-4" /></button></div>}

      <div className="grid grid-cols-4 gap-6">
        <div className="col-span-1">
          <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Select Deal</p>
          <div className="space-y-2 max-h-[70vh] overflow-y-auto">
            {(deals || []).map(deal => (
              <button key={deal.id} onClick={() => selectDeal(deal)}
                className={`w-full text-left p-3 rounded-xl border text-sm transition-all ${selectedDeal?.id === deal.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <p className="font-medium text-gray-900 truncate">{deal.name}</p>
                <p className="text-xs text-gray-400 mt-0.5 capitalize">{deal.industry}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-3">
          {!selectedDeal ? (
            <div className="card text-center py-16"><AlertTriangle className="h-12 w-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-400">Select a deal to view or generate a guaranty purchase package</p></div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">{selectedDeal.name}</h2>
                <button onClick={() => setShowForm(!showForm)} className="btn btn-primary text-sm inline-flex items-center gap-1">
                  <FileText className="h-4 w-4" /> {pkg ? 'Regenerate Package' : 'Generate Package'}
                </button>
              </div>

              {showForm && (
                <div className="card border-red-200 bg-red-50">
                  <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-500" />Default Information</h3>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div><label className="label">Default Date *</label><input type="date" value={form.default_date} onChange={e => setForm({...form, default_date: e.target.value})} className="input" /></div>
                    <div><label className="label">SBA Loan Number</label><input value={form.sba_loan_number} onChange={e => setForm({...form, sba_loan_number: e.target.value})} className="input" placeholder="SBA-XXXXXXX" /></div>
                    <div className="col-span-2"><label className="label">Default Reason *</label>
                      <select value={form.default_reason} onChange={e => setForm({...form, default_reason: e.target.value})} className="input">
                        <option value="">Select reason...</option>
                        {['Non-payment of principal and interest', 'Business closure', 'Bankruptcy filing', 'Death of principal', 'Fraud or misrepresentation', 'Covenant violation', 'Other'].map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={generate} disabled={generating || !form.default_date || !form.default_reason} className="btn btn-primary inline-flex items-center gap-2">
                      {generating ? <><Loader className="h-4 w-4 animate-spin" />Generating 10-tab package...</> : 'Generate Guaranty Package'}
                    </button>
                    <button onClick={() => setShowForm(false)} className="btn btn-secondary">Cancel</button>
                  </div>
                </div>
              )}

              {generating && (
                <div className="card text-center py-12">
                  <Loader className="h-8 w-8 animate-spin text-red-500 mx-auto mb-3" />
                  <p className="font-medium text-gray-700">Generating 10-tab guaranty package...</p>
                  <p className="text-sm text-gray-400 mt-1">Analyzing loan file, drafting narratives, identifying gaps</p>
                </div>
              )}

              {pkg && !generating && (
                <div className="space-y-4">
                  {/* Header */}
                  <div className={`card border-2 ${READINESS_STYLE[pkg.overall_readiness] || READINESS_STYLE.needs_work}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest opacity-60 mb-1">SBA Guaranty Purchase Package</p>
                        <h3 className="text-xl font-bold text-gray-900">{pkg.package_summary?.borrower_name}</h3>
                        <p className="text-sm text-gray-600 mt-0.5">Loan: {pkg.package_summary?.loan_number || form.sba_loan_number || 'N/A'}</p>
                        <p className="text-sm text-gray-600 mt-0.5">Default: {pkg.package_summary?.default_date} — {pkg.package_summary?.default_reason}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl font-bold">{completedTabs}/{totalTabs}</p>
                        <p className="text-xs text-gray-500">tabs complete</p>
                        <div className="w-24 bg-white bg-opacity-50 rounded-full h-2 mt-1">
                          <div className="h-2 rounded-full bg-current" style={{ width: `${(completedTabs/totalTabs)*100}%` }} />
                        </div>
                      </div>
                    </div>

                    {/* Recovery estimate */}
                    {pkg.estimated_recovery && (
                      <div className="mt-4 grid grid-cols-3 gap-3 pt-4 border-t border-black border-opacity-10">
                        {[
                          { label: 'Balance at Default', val: formatCurrency(pkg.package_summary?.balance_at_default || 0) },
                          { label: 'Guaranteed Amount', val: formatCurrency(pkg.package_summary?.guaranteed_amount || 0) },
                          { label: 'Est. Net Recovery', val: formatCurrency(pkg.estimated_recovery?.net_recovery || 0), highlight: true },
                        ].map(s => (
                          <div key={s.label} className={`text-center p-2 rounded-lg ${s.highlight ? 'bg-white bg-opacity-60' : ''}`}>
                            <p className={`text-lg font-bold ${s.highlight ? 'text-green-700' : 'text-gray-700'}`}>{s.val}</p>
                            <p className="text-xs text-gray-500">{s.label}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Servicing deficiencies */}
                    {pkg.servicing_deficiencies?.length > 0 && (
                      <div className="mt-3 bg-red-100 border border-red-300 rounded-lg p-3">
                        <p className="text-xs font-bold text-red-800 uppercase mb-1">⚠ Servicing Deficiencies — Could Reduce Guarantee</p>
                        {(pkg.servicing_deficiencies || []).map((d: string, i: number) => <p key={i} className="text-sm text-red-700">• {d}</p>)}
                      </div>
                    )}
                  </div>

                  {/* 10 tabs */}
                  <div className="card">
                    <h3 className="font-semibold text-gray-800 mb-3">10-Tab Package</h3>
                    <div className="space-y-2">
                      {(tabs || []).map((tab: any) => {
                        const isComplete = pkg.tabs_complete?.[String(tab.tab_number)] || false;
                        const isExp = expandedTab === tab.tab_number;
                        return (
                          <div key={tab.tab_number} className="border border-gray-100 rounded-xl overflow-hidden">
                            <div className="flex items-center gap-3 px-4 py-3">
                              <input type="checkbox" checked={isComplete}
                                onChange={e => toggleTab(tab.tab_number, e.target.checked)}
                                className="h-4 w-4 rounded text-green-600 border-gray-300 shrink-0" />
                              <button onClick={() => setExpandedTab(isExp ? null : tab.tab_number)}
                                className="flex-1 flex items-center justify-between text-left">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-gray-400 w-6">T{tab.tab_number}</span>
                                  <span className="text-sm font-semibold text-gray-800">{tab.tab_name}</span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${TAB_STATUS[tab.status] || TAB_STATUS.incomplete}`}>
                                    {tab.status}
                                  </span>
                                  {tab.critical_issues?.length > 0 && <AlertTriangle className="h-4 w-4 text-red-500" />}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-400">{tab.present_documents?.length || 0}/{(tab.required_documents?.length || 0)} docs</span>
                                  {isExp ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                                </div>
                              </button>
                            </div>

                            {isExp && (
                              <div className="border-t border-gray-100 px-4 py-4 bg-gray-50 space-y-3">
                                {tab.narrative && (
                                  <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Drafted Narrative</p>
                                    <p className="text-sm text-gray-700 leading-relaxed bg-white border border-gray-100 rounded-lg p-3 font-mono text-xs whitespace-pre-wrap">{tab.narrative}</p>
                                  </div>
                                )}
                                <div className="grid grid-cols-2 gap-4">
                                  {tab.present_documents?.length > 0 && (
                                    <div>
                                      <p className="text-xs font-semibold text-green-700 uppercase mb-1">Present in File</p>
                                      {tab.present_documents.map((d: string, i: number) => <p key={i} className="text-xs text-gray-700 flex gap-1"><CheckCircle className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />{d}</p>)}
                                    </div>
                                  )}
                                  {tab.missing_documents?.length > 0 && (
                                    <div>
                                      <p className="text-xs font-semibold text-red-700 uppercase mb-1">Missing</p>
                                      {tab.missing_documents.map((d: string, i: number) => <p key={i} className="text-xs text-gray-700 flex gap-1"><XCircle className="h-3 w-3 text-red-500 mt-0.5 shrink-0" />{d}</p>)}
                                    </div>
                                  )}
                                </div>
                                {tab.critical_issues?.length > 0 && (
                                  <div className="bg-red-50 border border-red-200 rounded-lg p-2">
                                    <p className="text-xs font-bold text-red-700 uppercase mb-1">Critical Issues</p>
                                    {tab.critical_issues.map((issue: string, i: number) => <p key={i} className="text-xs text-red-600">• {issue}</p>)}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Next steps */}
                  {pkg.next_steps?.length > 0 && (
                    <div className="card bg-blue-50 border-blue-200">
                      <p className="text-sm font-semibold text-blue-800 mb-2">Next Steps ({pkg.estimated_preparation_hours}h estimated)</p>
                      {(pkg.next_steps || []).map((s: string, i: number) => <p key={i} className="text-sm text-blue-700 flex gap-2 mb-1"><span className="font-bold shrink-0">{i+1}.</span>{s}</p>)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}