'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { ClipboardList, Loader, RefreshCw, ChevronDown, ChevronUp, Download, Plus, AlertTriangle, CheckCircle, X } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';

const RISK_RATING_STYLE: Record<string, string> = {
  '1-Pass':        'bg-green-100 text-green-800 border-green-300',
  '2-Watch':       'bg-yellow-100 text-yellow-800 border-yellow-300',
  '3-Substandard': 'bg-orange-100 text-orange-800 border-orange-300',
  '4-Doubtful':    'bg-red-100 text-red-800 border-red-300',
  '5-Loss':        'bg-purple-100 text-purple-800 border-purple-300',
};

const PRIORITY_STYLE: Record<string, string> = {
  high:   'text-red-600 font-semibold',
  medium: 'text-yellow-600 font-medium',
  low:    'text-gray-500',
};

export default function AnnualReviewPage() {
  const [deals, setDeals] = useState<any[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [activeReview, setActiveReview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [newReview, setNewReview] = useState({
    review_year: new Date().getFullYear(),
    review_type: 'annual',
  });
  const [expandedSection, setExpandedSection] = useState<string | null>('financial');
  const [lenderNotes, setLenderNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    api.getDeals().then(setDeals).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const selectDeal = async (deal: any) => {
    setSelectedDeal(deal);
    setActiveReview(null);
    setReviews([]);
    try {
      const data = await api.getAnnualReviews(deal.id);
      setReviews(data.reviews || []);
    } catch { setError('Failed to load reviews'); }
  };

  const generateReview = async () => {
    if (!selectedDeal) return;
    setGenerating(true);
    setError('');
    try {
      const result = await api.generateAnnualReview(selectedDeal.id, newReview);
      setActiveReview(result);
      setReviews(prev => [{ id: result.review_id, ...result, status: 'complete' }, ...prev]);
      setShowNewForm(false);
      setLenderNotes('');
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to generate review');
    } finally { setGenerating(false); }
  };

  const saveNotes = async () => {
    if (!activeReview) return;
    setSavingNotes(true);
    try {
      await api.saveSiteVisitNotes(activeReview.review_id, { lender_notes: lenderNotes });
    } catch { setError('Failed to save notes'); }
    finally { setSavingNotes(false); }
  };

  const printReview = () => window.print();

  const toggleSection = (s: string) => setExpandedSection(expandedSection === s ? null : s);

  const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button onClick={() => toggleSection(id)}
        className="w-full flex justify-between items-center px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left">
        <span className="font-semibold text-sm text-gray-800 uppercase tracking-wide">{title}</span>
        {expandedSection === id ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>
      {expandedSection === id && <div className="px-4 py-4">{children}</div>}
    </div>
  );

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="h-8 w-8 animate-spin" /></div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList className="h-7 w-7 text-blue-600" /> Annual Reviews
          </h1>
          <p className="text-gray-600">AI-generated annual loan reviews and ongoing performance documentation</p>
        </div>
        {activeReview && (
          <button onClick={printReview} className="btn btn-secondary text-sm inline-flex items-center gap-1">
            <Download className="h-4 w-4" /> Print / Save PDF
          </button>
        )}
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
            {(deals || []).map(deal => (
              <button key={deal.id} onClick={() => selectDeal(deal)}
                className={`w-full text-left p-3 rounded-xl border text-sm transition-all ${
                  selectedDeal?.id === deal.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                <p className="font-medium text-gray-900 truncate">{deal.name}</p>
                <p className="text-xs text-gray-400 capitalize mt-0.5">{deal.industry} · {deal.status}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Review panel */}
        <div className="col-span-3">
          {!selectedDeal ? (
            <div className="card text-center py-16">
              <ClipboardList className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">Select a deal to view or generate annual reviews</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* History + new button */}
              <div className="flex items-center justify-between">
                <div className="flex gap-2 flex-wrap">
                  {(reviews || []).map(r => (
                    <button key={r.id}
                      onClick={async () => {
                        if (r.ai_report) { setActiveReview(r); setLenderNotes(r.lender_notes || ''); }
                      }}
                      className={`px-3 py-1.5 text-sm rounded-full border font-medium transition-all ${
                        activeReview?.review_id === r.id || activeReview?.id === r.id
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                      }`}>
                      {r.review_year} — {r.review_type}
                      {r.risk_rating && (
                        <span className={`ml-2 text-xs px-1.5 py-0.5 rounded border ${RISK_RATING_STYLE[r.risk_rating] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                          {r.risk_rating}
                        </span>
                      )}
                    </button>
                  ))}
                  <button onClick={() => setShowNewForm(!showNewForm)}
                    className="px-3 py-1.5 text-sm rounded-full border border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 inline-flex items-center gap-1">
                    <Plus className="h-4 w-4" /> New Review
                  </button>
                </div>
              </div>

              {/* New review form */}
              {showNewForm && (
                <div className="card border-blue-200 bg-blue-50">
                  <h3 className="font-medium text-gray-800 mb-3">Generate Annual Review</h3>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className="label">Review Year</label>
                      <input type="number" value={newReview.review_year}
                        onChange={e => setNewReview({...newReview, review_year: parseInt(e.target.value)})}
                        className="input" />
                    </div>
                    <div>
                      <label className="label">Review Type</label>
                      <select value={newReview.review_type}
                        onChange={e => setNewReview({...newReview, review_type: e.target.value})}
                        className="input">
                        <option value="annual">Annual Review</option>
                        <option value="site_visit">Site Visit Review</option>
                        <option value="interim">Interim Review</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={generateReview} disabled={generating} className="btn btn-primary inline-flex items-center gap-2">
                      {generating ? <><Loader className="h-4 w-4 animate-spin" />Generating review...</> : 'Generate AI Review'}
                    </button>
                    <button onClick={() => setShowNewForm(false)} className="btn btn-secondary">Cancel</button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Claude will analyze deal data, risk report, payment history, and covenant status to generate a complete review.
                  </p>
                </div>
              )}

              {generating && (
                <div className="card text-center py-12">
                  <Loader className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
                  <p className="text-gray-600 font-medium">Generating annual review...</p>
                  <p className="text-gray-400 text-sm mt-1">Analyzing deal performance, payments, and covenant compliance</p>
                </div>
              )}

              {/* Active review display */}
              {activeReview?.ai_report && !generating && (
                <div className="space-y-3" id="review-content">
                  {/* Header */}
                  <div className={`card border-2 ${RISK_RATING_STYLE[activeReview.ai_report.risk_rating] || 'border-gray-200'}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">Annual Review — {activeReview.ai_report.review_period}</p>
                        <h2 className="text-xl font-bold text-gray-900">{selectedDeal.name}</h2>
                        <p className="text-sm text-gray-500 mt-1">{activeReview.ai_report.review_date}</p>
                      </div>
                      <div className="text-right">
                        <span className={`inline-block px-3 py-1 rounded-full border text-sm font-bold ${RISK_RATING_STYLE[activeReview.ai_report.risk_rating] || ''}`}>
                          {activeReview.ai_report.risk_rating}
                        </span>
                        <p className={`text-xs mt-1 font-medium ${
                          activeReview.ai_report.risk_rating_change === 'improved' ? 'text-green-600' :
                          activeReview.ai_report.risk_rating_change === 'downgraded' ? 'text-red-600' : 'text-gray-500'
                        }`}>
                          {activeReview.ai_report.risk_rating_change?.toUpperCase()}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-gray-700 mt-3 leading-relaxed">{activeReview.ai_report.executive_summary}</p>
                  </div>

                  {/* Recommendation banner */}
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-blue-800">Recommendation: {activeReview.ai_report.recommendation}</p>
                    <p className="text-xs text-blue-600">Next review: {activeReview.ai_report.next_review_date}</p>
                  </div>

                  {/* Sections */}
                  <Section id="financial" title="Financial Performance">
                    {activeReview.ai_report.financial_performance && Object.entries(activeReview.ai_report.financial_performance).map(([k, v]) => (
                      <div key={k} className="mb-3 pb-3 border-b border-gray-50 last:border-0">
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{k.replace(/_/g, ' ')}</p>
                        <p className="text-sm text-gray-800">{String(v)}</p>
                      </div>
                    ))}
                  </Section>

                  <Section id="loan" title="Loan Performance">
                    {activeReview.ai_report.loan_performance && Object.entries(activeReview.ai_report.loan_performance).map(([k, v]) => (
                      <div key={k} className="mb-3 pb-3 border-b border-gray-50 last:border-0">
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{k.replace(/_/g, ' ')}</p>
                        <p className="text-sm text-gray-800">{String(v)}</p>
                      </div>
                    ))}
                  </Section>

                  <Section id="risks" title="Risk Factors & Positive Factors">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-bold text-red-600 uppercase mb-2">Risk Factors</p>
                        {(activeReview.ai_report.risk_factors || []).map((r: string, i: number) => (
                          <p key={i} className="text-sm text-gray-700 flex gap-2 mb-1.5"><AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />{r}</p>
                        ))}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-green-600 uppercase mb-2">Positive Factors</p>
                        {(activeReview.ai_report.positive_factors || []).map((f: string, i: number) => (
                          <p key={i} className="text-sm text-gray-700 flex gap-2 mb-1.5"><CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />{f}</p>
                        ))}
                      </div>
                    </div>
                  </Section>

                  <Section id="actions" title="Action Items">
                    <div className="space-y-2">
                      {(activeReview.ai_report.action_items || []).map((item: any, i: number) => (
                        <div key={i} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex-1">
                            <p className={`text-sm ${PRIORITY_STYLE[item.priority] || ''}`}>{item.action}</p>
                            <p className="text-xs text-gray-400 mt-0.5">Owner: {item.owner} · Due: {item.due_date}</p>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ml-2 shrink-0 ${
                            item.priority === 'high' ? 'bg-red-100 text-red-700' :
                            item.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{item.priority?.toUpperCase()}</span>
                        </div>
                      ))}
                    </div>
                  </Section>

                  {activeReview.ai_report.business_assessment && (
                    <Section id="business" title="Business Assessment">
                      <p className="text-sm text-gray-700 leading-relaxed">{activeReview.ai_report.business_assessment}</p>
                    </Section>
                  )}

                  {activeReview.ai_report.officer_notes && (
                    <Section id="notes" title="Officer Notes">
                      <p className="text-sm text-gray-700 leading-relaxed italic">{activeReview.ai_report.officer_notes}</p>
                    </Section>
                  )}

                  {/* Lender notes */}
                  <div className="card">
                    <p className="text-sm font-semibold text-gray-700 mb-2">Add Lender Notes to File</p>
                    <textarea value={lenderNotes} onChange={e => setLenderNotes(e.target.value)}
                      className="input w-full min-h-20 resize-y text-sm"
                      placeholder="Add any additional commentary, exceptions, or observations for the loan file..." />
                    <button onClick={saveNotes} disabled={savingNotes} className="btn btn-secondary text-sm mt-2">
                      {savingNotes ? 'Saving...' : 'Save Notes'}
                    </button>
                  </div>

                  <p className="text-xs text-gray-400 text-center">
                    AI-generated review. Officer review and approval required before filing.
                    Generated {activeReview.ai_report.generated_at ? new Date(activeReview.ai_report.generated_at).toLocaleString() : ''}.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}