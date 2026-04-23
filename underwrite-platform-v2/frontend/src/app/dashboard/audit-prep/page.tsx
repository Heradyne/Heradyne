'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Shield, Loader, RefreshCw, CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronUp, X } from 'lucide-react';
import { api } from '@/lib/api';

const READINESS_STYLE: Record<string, string> = {
  audit_ready:    'bg-green-50 border-green-300 text-green-800',
  mostly_ready:   'bg-blue-50 border-blue-300 text-blue-800',
  needs_work:     'bg-yellow-50 border-yellow-300 text-yellow-800',
  critical_gaps:  'bg-red-50 border-red-300 text-red-800',
};

const TAB_STATUS_ICON = {
  complete:         <CheckCircle className="h-4 w-4 text-green-500" />,
  mostly_complete:  <CheckCircle className="h-4 w-4 text-blue-400" />,
  incomplete:       <AlertTriangle className="h-4 w-4 text-yellow-500" />,
  missing:          <XCircle className="h-4 w-4 text-red-500" />,
};

const RISK_STYLE: Record<string, string> = {
  high:   'text-red-700 bg-red-50 border-red-200',
  medium: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  low:    'text-gray-600 bg-gray-50 border-gray-200',
};

export default function AuditPrepPage() {
  const [deals, setDeals] = useState<any[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [auditFile, setAuditFile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [expandedTab, setExpandedTab] = useState<number | null>(null);

  useEffect(() => { api.getDeals().then(setDeals).catch(() => {}).finally(() => setLoading(false)); }, []);

  const selectDeal = async (deal: any) => {
    setSelectedDeal(deal);
    setAuditFile(null);
    try {
      const data = await api.getAuditFile(deal.id);
      if (data.exists) setAuditFile(data);
    } catch { /* no file yet */ }
  };

  const generate = async () => {
    if (!selectedDeal) return;
    setGenerating(true);
    setError('');
    try {
      const result = await api.generateAuditPackage(selectedDeal.id);
      setAuditFile(result);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to generate audit package');
    } finally { setGenerating(false); }
  };

  const toggleChecklist = async (tabNumber: number, item: string, completed: boolean) => {
    if (!selectedDeal) return;
    try {
      await api.updateAuditChecklist(selectedDeal.id, { tab_number: tabNumber, item, completed });
    } catch { /* silent fail */ }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="h-8 w-8 animate-spin" /></div>;

  const pkg = auditFile?.ai_package;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="h-7 w-7 text-blue-600" /> SBA Audit Preparation
          </h1>
          <p className="text-gray-600">Maintain audit-ready loan files and generate SBA examination packages</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex justify-between">
          {error}<button onClick={() => setError('')}><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="grid grid-cols-4 gap-6">
        {/* Deal list */}
        <div className="col-span-1">
          <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Select Deal</p>
          <div className="space-y-2 max-h-[70vh] overflow-y-auto">
            {deals.map(deal => (
              <button key={deal.id} onClick={() => selectDeal(deal)}
                className={`w-full text-left p-3 rounded-xl border text-sm transition-all ${
                  selectedDeal?.id === deal.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                <p className="font-medium text-gray-900 truncate">{deal.name}</p>
                <p className="text-xs text-gray-400 capitalize mt-0.5">{deal.industry}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Audit file panel */}
        <div className="col-span-3">
          {!selectedDeal ? (
            <div className="card text-center py-16">
              <Shield className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">Select a deal to view or generate its audit file</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">{selectedDeal.name}</h2>
                <button onClick={generate} disabled={generating}
                  className="btn btn-primary inline-flex items-center gap-2">
                  {generating
                    ? <><Loader className="h-4 w-4 animate-spin" />Generating...</>
                    : <><Shield className="h-4 w-4" />{pkg ? 'Refresh Audit Package' : 'Generate Audit Package'}</>}
                </button>
              </div>

              {generating && (
                <div className="card text-center py-12">
                  <Loader className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
                  <p className="text-gray-600 font-medium">Assessing audit readiness...</p>
                  <p className="text-gray-400 text-sm mt-1">Reviewing all 10 audit tabs against loan file</p>
                </div>
              )}

              {pkg && !generating && (
                <div className="space-y-4">
                  {/* Readiness header */}
                  <div className={`card border-2 ${READINESS_STYLE[pkg.readiness_level] || READINESS_STYLE.needs_work}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest mb-1 opacity-60">SBA Audit Readiness</p>
                        <p className="text-sm leading-relaxed">{pkg.executive_summary}</p>
                      </div>
                      <div className="text-center ml-6 shrink-0">
                        <p className="text-5xl font-bold">{pkg.readiness_score}</p>
                        <p className="text-xs uppercase font-semibold mt-1 opacity-70">/ 100</p>
                        <p className="text-xs mt-1 capitalize font-medium">
                          {pkg.readiness_level?.replace(/_/g, ' ')}
                        </p>
                      </div>
                    </div>

                    {/* Score bar */}
                    <div className="mt-3 w-full bg-white bg-opacity-40 rounded-full h-2">
                      <div className="h-2 rounded-full transition-all" style={{
                        width: `${pkg.readiness_score}%`,
                        backgroundColor: pkg.readiness_score >= 80 ? '#15803d' : pkg.readiness_score >= 60 ? '#2563eb' : pkg.readiness_score >= 40 ? '#ca8a04' : '#dc2626',
                      }} />
                    </div>

                    {/* Est. hours */}
                    {pkg.estimated_hours_to_audit_ready > 0 && (
                      <p className="text-xs mt-2 opacity-70">
                        Estimated {pkg.estimated_hours_to_audit_ready} hours to reach audit-ready status
                      </p>
                    )}
                  </div>

                  {/* Critical gaps */}
                  {pkg.critical_gaps?.length > 0 && (
                    <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4">
                      <p className="text-sm font-bold text-red-800 mb-2 flex items-center gap-2">
                        <XCircle className="h-5 w-5" /> Critical Gaps — Could Result in Guarantee Denial
                      </p>
                      {pkg.critical_gaps.map((gap: string, i: number) => (
                        <p key={i} className="text-sm text-red-700 flex gap-2 mb-1">
                          <span className="shrink-0">•</span>{gap}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* High priority actions */}
                  {pkg.high_priority_actions?.length > 0 && (
                    <div className="card">
                      <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-yellow-500" /> Priority Actions
                      </h3>
                      <div className="space-y-2">
                        {pkg.high_priority_actions.map((action: any, i: number) => (
                          <div key={i} className="flex items-start justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-800">{action.action}</p>
                              <p className="text-xs text-red-600 mt-0.5">Risk: {action.risk_if_missing}</p>
                            </div>
                            {action.deadline && (
                              <span className="text-xs bg-white border border-yellow-300 text-yellow-800 px-2 py-0.5 rounded-full ml-3 shrink-0">
                                {action.deadline}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 10-tab breakdown */}
                  <div className="card">
                    <h3 className="font-semibold text-gray-800 mb-3">10-Tab Audit File Assessment</h3>
                    <div className="space-y-2">
                      {(pkg.tabs || []).map((tab: any) => (
                        <div key={tab.tab_number} className="border border-gray-100 rounded-xl overflow-hidden">
                          <button onClick={() => setExpandedTab(expandedTab === tab.tab_number ? null : tab.tab_number)}
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left">
                            <div className="flex items-center gap-3">
                              {TAB_STATUS_ICON[tab.status as keyof typeof TAB_STATUS_ICON] || TAB_STATUS_ICON.incomplete}
                              <div>
                                <span className="text-sm font-medium text-gray-800">
                                  Tab {tab.tab_number}: {tab.tab_name}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <span className={`text-sm font-bold ${tab.completion_pct >= 80 ? 'text-green-700' : tab.completion_pct >= 50 ? 'text-yellow-700' : 'text-red-600'}`}>
                                  {tab.completion_pct}%
                                </span>
                              </div>
                              <div className="w-20 bg-gray-200 rounded-full h-1.5">
                                <div className="h-1.5 rounded-full" style={{
                                  width: `${tab.completion_pct}%`,
                                  backgroundColor: tab.completion_pct >= 80 ? '#15803d' : tab.completion_pct >= 50 ? '#ca8a04' : '#dc2626',
                                }} />
                              </div>
                              {expandedTab === tab.tab_number ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                            </div>
                          </button>

                          {expandedTab === tab.tab_number && (
                            <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-3">
                              {/* Present items */}
                              {tab.present_items?.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-green-700 uppercase mb-1">Present in File</p>
                                  {tab.present_items.map((item: string, i: number) => (
                                    <div key={i} className="flex items-center gap-2 text-sm text-gray-700 mb-1">
                                      <input type="checkbox" defaultChecked
                                        onChange={e => toggleChecklist(tab.tab_number, item, e.target.checked)}
                                        className="h-4 w-4 rounded text-green-600 border-gray-300" />
                                      {item}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Missing items */}
                              {tab.missing_items?.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-red-700 uppercase mb-1">Missing / Incomplete</p>
                                  {tab.missing_items.map((item: any, i: number) => (
                                    <div key={i} className={`p-2 rounded-lg border mb-2 ${RISK_STYLE[item.risk] || RISK_STYLE.low}`}>
                                      <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                          <p className="text-sm font-medium">{item.item}</p>
                                          {item.sba_reference && (
                                            <p className="text-xs opacity-70 mt-0.5">Ref: {item.sba_reference}</p>
                                          )}
                                          {item.action && (
                                            <p className="text-xs mt-1 font-medium">→ {item.action}</p>
                                          )}
                                        </div>
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ml-2 shrink-0 ${RISK_STYLE[item.risk] || RISK_STYLE.low}`}>
                                          {item.risk}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Strengths */}
                  {pkg.strengths?.length > 0 && (
                    <div className="card">
                      <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-green-500" /> Well-Documented Areas
                      </h3>
                      {pkg.strengths.map((s: string, i: number) => (
                        <p key={i} className="text-sm text-gray-700 flex gap-2 mb-1">
                          <span className="text-green-500 shrink-0">✓</span>{s}
                        </p>
                      ))}
                    </div>
                  )}

                  <p className="text-xs text-gray-400 text-center">
                    AI audit assessment. Officer review required. Not a substitute for legal compliance review.
                    Generated {pkg.generated_at ? new Date(pkg.generated_at).toLocaleString() : ''}.
                  </p>
                </div>
              )}

              {!pkg && !generating && (
                <div className="card text-center py-12 border-dashed">
                  <Shield className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium mb-1">No audit file yet for {selectedDeal.name}</p>
                  <p className="text-gray-400 text-sm">Click "Generate Audit Package" to assess all 10 audit tabs</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
