'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { MapPin, Loader, RefreshCw, CheckCircle, AlertTriangle, FileText, ChevronDown, ChevronUp, X, Save } from 'lucide-react';
import { api } from '@/lib/api';

const VISIT_TYPES = [
  { value: 'annual_review', label: 'Annual Review' },
  { value: 'site_visit', label: 'Field Site Visit' },
  { value: 'troubled_loan', label: 'Troubled Loan Review' },
  { value: 'routine_monitoring', label: 'Routine Monitoring Call' },
];

export default function SiteVisitPage() {
  const [deals, setDeals] = useState<any[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [visitType, setVisitType] = useState('annual_review');
  const [prep, setPrep] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['pre_visit_summary', 'financial_questions']));
  const [postVisitNotes, setPostVisitNotes] = useState<Record<string, string>>({});
  const [savedNotes, setSavedNotes] = useState(false);
  const [activeReviewId, setActiveReviewId] = useState<number | null>(null);

  useEffect(() => { api.getDeals().then(setDeals).catch(() => {}).finally(() => setLoading(false)); }, []);

  const generate = async () => {
    if (!selectedDeal) return;
    setGenerating(true);
    setError('');
    setPrep(null);
    try {
      const result = await api.generateSiteVisitPrep(selectedDeal.id, visitType);
      setPrep(result);
      // Check for open review to attach notes to
      const reviews = await api.getAnnualReviews(selectedDeal.id).catch(() => ({ reviews: [] }));
      const open = reviews.reviews?.find((r: any) => r.status !== 'complete');
      if (open) setActiveReviewId(open.id);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to generate prep. Check ANTHROPIC_API_KEY.');
    } finally { setGenerating(false); }
  };

  const savePostVisitNotes = async () => {
    if (!activeReviewId) return;
    try {
      await api.saveSiteVisitNotes(activeReviewId, {
        notes: Object.entries(postVisitNotes).map(([k, v]) => `${k}: ${v}`).join('\n\n'),
        mark_complete: postVisitNotes.officer_assessment ? true : false,
      });
      setSavedNotes(true);
      setTimeout(() => setSavedNotes(false), 2000);
    } catch { setError('Failed to save notes'); }
  };

  const toggle = (s: string) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(s) ? next.delete(s) : next.add(s);
    return next;
  });

  const Section = ({ id, title, count, children }: { id: string; title: string; count?: number; children: React.ReactNode }) => (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => toggle(id)} className="w-full flex justify-between items-center px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-gray-800">{title}</span>
          {count != null && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{count}</span>}
        </div>
        {expanded.has(id) ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>
      {expanded.has(id) && <div className="px-4 py-4">{children}</div>}
    </div>
  );

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="h-8 w-8 animate-spin" /></div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MapPin className="h-7 w-7 text-blue-600" /> Site Visit & Review Workflow
          </h1>
          <p className="text-gray-600">AI-generated preparation packages and post-visit documentation</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex justify-between">
          {error}<button onClick={() => setError('')}><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="grid grid-cols-4 gap-6">
        {/* Config panel */}
        <div className="col-span-1 space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Select Deal</p>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {(deals || []).map(deal => (
                <button key={deal.id} onClick={() => { setSelectedDeal(deal); setPrep(null); }}
                  className={`w-full text-left p-3 rounded-xl border text-sm transition-all ${
                    selectedDeal?.id === deal.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                  <p className="font-medium text-gray-900 truncate">{deal.name}</p>
                  <p className="text-xs text-gray-400 capitalize mt-0.5">{deal.industry}</p>
                </button>
              ))}
            </div>
          </div>

          {selectedDeal && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Visit Type</p>
              <div className="space-y-1">
                {(VISIT_TYPES || []).map(vt => (
                  <button key={vt.value} onClick={() => setVisitType(vt.value)}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-all ${
                      visitType === vt.value ? 'border-blue-500 bg-blue-50 text-blue-800 font-medium' : 'border-gray-200 text-gray-700'
                    }`}>
                    {vt.label}
                  </button>
                ))}
              </div>
              <button onClick={generate} disabled={generating}
                className="btn btn-primary w-full mt-3 inline-flex items-center justify-center gap-2">
                {generating ? <><Loader className="h-4 w-4 animate-spin" />Preparing...</> : 'Generate Prep Package'}
              </button>
            </div>
          )}
        </div>

        {/* Prep package */}
        <div className="col-span-3">
          {!selectedDeal ? (
            <div className="card text-center py-16">
              <MapPin className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">Select a deal and visit type to generate a preparation package</p>
            </div>
          ) : generating ? (
            <div className="card text-center py-12">
              <Loader className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
              <p className="text-gray-600 font-medium">Preparing visit package for {selectedDeal.name}...</p>
              <p className="text-gray-400 text-sm mt-1">Analyzing deal data, alerts, and covenants</p>
            </div>
          ) : !prep ? (
            <div className="card text-center py-16 border-dashed">
              <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">Click "Generate Prep Package" to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Summary banner */}
              <div className="card bg-gradient-to-r from-blue-600 to-blue-700 text-white">
                <p className="text-xs text-blue-200 uppercase tracking-widest mb-1">
                  {VISIT_TYPES.find(v => v.value === visitType)?.label} — {selectedDeal.name}
                </p>
                <p className="text-sm leading-relaxed">{prep.pre_visit_summary}</p>
              </div>

              {/* Items to verify onsite */}
              {prep.items_to_verify_onsite?.length > 0 && (
                <Section id="verify" title="Items to Verify Onsite" count={prep.items_to_verify_onsite.length}>
                  <div className="space-y-3">
                    {(prep.items_to_verify_onsite || []).map((item: any, i: number) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <input type="checkbox" className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-gray-800">{item.item}</p>
                          <p className="text-xs text-gray-500 mt-0.5"><strong>Why:</strong> {item.why}</p>
                          <p className="text-xs text-blue-600 mt-0.5"><strong>How:</strong> {item.how}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Financial questions */}
              {prep.financial_questions?.length > 0 && (
                <Section id="financial_questions" title="Financial Questions to Ask" count={prep.financial_questions.length}>
                  <div className="space-y-3">
                    {(prep.financial_questions || []).map((q: any, i: number) => (
                      <div key={i} className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                        <p className="text-sm font-semibold text-blue-900">Q{i+1}: {q.question}</p>
                        <p className="text-xs text-blue-700 mt-1">{q.context}</p>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Risk flags */}
              {prep.risk_flags_to_address?.length > 0 && (
                <Section id="flags" title="Risk Flags to Address" count={prep.risk_flags_to_address.length}>
                  <div className="space-y-2">
                    {(prep.risk_flags_to_address || []).map((flag: any, i: number) => (
                      <div key={i} className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-sm font-semibold text-yellow-900 flex gap-2">
                          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />{flag.flag}
                        </p>
                        <p className="text-xs text-yellow-700 mt-1">Ask: {flag.question_to_ask}</p>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Operational questions */}
              {prep.operational_questions?.length > 0 && (
                <Section id="ops" title="Operational Questions">
                  <ul className="space-y-2">
                    {(prep.operational_questions || []).map((q: string, i: number) => (
                      <li key={i} className="text-sm text-gray-700 flex gap-2">
                        <span className="text-blue-500 shrink-0 font-bold">{i+1}.</span>{q}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {/* Documents to request */}
              {prep.documents_to_request?.length > 0 && (
                <Section id="docs" title="Documents to Request / Collect">
                  <div className="space-y-2">
                    {(prep.documents_to_request || []).map((doc: string, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                        <span className="text-sm text-gray-700">{doc}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Positive topics */}
              {prep.positive_topics?.length > 0 && (
                <Section id="positive" title="Positive Topics to Acknowledge">
                  <ul className="space-y-1">
                    {(prep.positive_topics || []).map((t: string, i: number) => (
                      <li key={i} className="text-sm text-gray-700 flex gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />{t}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {/* Post-visit documentation */}
              <div className="card border-2 border-dashed border-gray-300">
                <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Save className="h-5 w-5 text-gray-500" /> Post-Visit Documentation
                </h3>
                <p className="text-xs text-gray-400 mb-4">Complete after the visit to document findings for the loan file.</p>
                <div className="space-y-3">
                  {prep.post_visit_documentation_template && Object.entries(prep.post_visit_documentation_template).map(([key, placeholder]) => (
                    <div key={key}>
                      <label className="label capitalize">{key.replace(/_/g, ' ')}</label>
                      <textarea
                        value={postVisitNotes[key] || ''}
                        onChange={e => setPostVisitNotes(prev => ({...prev, [key]: e.target.value}))}
                        className="input w-full min-h-16 resize-y text-sm"
                        placeholder={String(placeholder)}
                      />
                    </div>
                  ))}
                </div>
                {activeReviewId && (
                  <button onClick={savePostVisitNotes} className="btn btn-primary mt-4 inline-flex items-center gap-2">
                    {savedNotes ? <><CheckCircle className="h-4 w-4" />Saved to Review File</> : <><Save className="h-4 w-4" />Save to Review File</>}
                  </button>
                )}
                {!activeReviewId && (
                  <p className="text-xs text-gray-400 mt-3">Create an annual review first to attach these notes to the loan file.</p>
                )}
              </div>

              <p className="text-xs text-gray-400 text-center">
                AI-generated preparation package. Verify all information against loan file before visit.
                Generated {prep.prepared_at ? new Date(prep.prepared_at).toLocaleString() : 'just now'}.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}