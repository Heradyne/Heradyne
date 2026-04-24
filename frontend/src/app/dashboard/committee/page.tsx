'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Presentation, Loader, RefreshCw, CheckCircle, AlertTriangle, X, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { AIDisclaimer } from '@/components/ai-disclaimer';
import { formatCurrency } from '@/lib/utils';

const RECOMMENDATION_STYLE: Record<string, string> = {
  'APPROVE':                  'bg-green-50 border-green-400 text-green-800',
  'APPROVE WITH CONDITIONS':  'bg-blue-50 border-blue-400 text-blue-800',
  'DECLINE':                  'bg-red-50 border-red-400 text-red-800',
  'REQUEST MORE INFO':        'bg-yellow-50 border-yellow-400 text-yellow-800',
};

const DECISION_STYLE: Record<string, string> = {
  approved:   'bg-green-600 text-white',
  declined:   'bg-red-600 text-white',
  deferred:   'bg-yellow-500 text-white',
  conditions: 'bg-blue-600 text-white',
};

const SLIDE_TYPE_ICON: Record<string, string> = {
  cover: '🎯', executive_summary: '📋', transaction: '💰', borrower: '👤',
  financials: '📊', underwriting: '🔍', collateral: '🏠', risk: '⚠️',
  structure: '🏗️', recommendation: '✅',
};

export default function CommitteePresentationPage() {
  const [deals, setDeals] = useState<any[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [presentation, setPresentation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [activeSlide, setActiveSlide] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [decisionForm, setDecisionForm] = useState({ decision: '', notes: '' });
  const [savingDecision, setSavingDecision] = useState(false);

  useEffect(() => { api.getDeals().then(d => setDeals(d.filter((x: any) => x.status !== 'draft'))).catch(() => {}).finally(() => setLoading(false)); }, []);

  const selectDeal = async (deal: any) => {
    setSelectedDeal(deal);
    setPresentation(null);
    setActiveSlide(0);
    try {
      const data = await api.getCommitteePresentation(deal.id);
      if (data.exists) setPresentation(data);
    } catch { /* none yet */ }
  };

  const generate = async () => {
    if (!selectedDeal) return;
    setGenerating(true);
    setError('');
    try {
      const result = await api.generateCommitteePresentation(selectedDeal.id);
      setPresentation(result);
      setActiveSlide(0);
    } catch (e: any) { setError(e.response?.data?.detail || 'Failed to generate presentation'); }
    finally { setGenerating(false); }
  };

  const saveDecision = async () => {
    if (!decisionForm.decision || !presentation?.presentation_id) return;
    setSavingDecision(true);
    try {
      await api.recordCommitteeDecision(presentation.presentation_id, decisionForm.decision, decisionForm.notes);
      setPresentation((prev: any) => ({ ...prev, decision: decisionForm.decision, decision_notes: decisionForm.notes, status: 'decided' }));
    } catch { setError('Failed to save decision'); }
    finally { setSavingDecision(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="h-8 w-8 animate-spin" /></div>;

  const slides = presentation?.slides || [];
  const currentSlide = slides[activeSlide];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Presentation className="h-7 w-7 text-blue-600" /> Committee Presentation
          </h1>
          <p className="text-gray-600">AI-generated credit committee presentations from deal data</p>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex justify-between">{error}<button onClick={() => setError('')}><X className="h-4 w-4" /></button></div>}

      <div className="grid grid-cols-4 gap-6">
        {/* Deal list */}
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

        {/* Presentation panel */}
        <div className="col-span-3">
          {!selectedDeal ? (
            <div className="card text-center py-16"><Presentation className="h-12 w-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-400">Select a deal to generate a committee presentation</p></div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">{selectedDeal.name}</h2>
                <button onClick={generate} disabled={generating} className="btn btn-primary inline-flex items-center gap-2">
                  {generating ? <><Loader className="h-4 w-4 animate-spin" />Generating...</> : <><Presentation className="h-4 w-4" />{presentation ? 'Regenerate' : 'Generate Presentation'}</>}
                </button>
              </div>

              {generating && (
                <div className="card text-center py-12">
                  <Loader className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
                  <p className="font-medium text-gray-700">Building credit committee presentation...</p>
                  <p className="text-sm text-gray-400 mt-1">Analyzing deal, structuring slides, drafting speaker notes</p>
                </div>
              )}

              {presentation && !generating && (
                <div className="space-y-4">
                  {/* Recommendation banner */}
                  <div className={`card border-2 ${RECOMMENDATION_STYLE[presentation.recommendation] || 'border-gray-200'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest opacity-60 mb-1">AI Recommendation</p>
                        <p className="text-2xl font-bold">{presentation.recommendation}</p>
                        <p className="text-sm mt-1 opacity-80">{presentation.one_line_summary}</p>
                      </div>
                      <div className="text-right">
                        <span className={`text-sm px-3 py-1 rounded-full border font-medium capitalize`}>
                          {presentation.confidence} confidence
                        </span>
                        {presentation.decision && (
                          <div className={`mt-2 px-3 py-1 rounded-full text-sm font-bold capitalize ${DECISION_STYLE[presentation.decision] || 'bg-gray-100 text-gray-700'}`}>
                            Committee: {presentation.decision}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Approval conditions */}
                    {presentation.approval_conditions?.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-black border-opacity-10">
                        <p className="text-xs font-bold uppercase mb-1 opacity-70">Conditions</p>
                        {(presentation.approval_conditions || []).map((c: string, i: number) => <p key={i} className="text-sm">• {c}</p>)}
                      </div>
                    )}
                  </div>

                  {/* Slide viewer */}
                  {slides.length > 0 && (
                    <div className="card">
                      {/* Slide nav */}
                      <div className="flex items-center gap-1 mb-4 flex-wrap">
                        {(slides || []).map((slide: any, i: number) => (
                          <button key={i} onClick={() => setActiveSlide(i)}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all ${activeSlide === i ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                            <span>{SLIDE_TYPE_ICON[slide.type] || '📄'}</span>
                            <span className="hidden sm:inline">{slide.slide_number}</span>
                          </button>
                        ))}
                        <button onClick={() => setShowNotes(!showNotes)}
                          className={`ml-auto px-2 py-1 rounded-lg text-xs font-medium ${showNotes ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                          Speaker Notes
                        </button>
                      </div>

                      {/* Current slide */}
                      {currentSlide && (
                        <div className="bg-slate-900 rounded-xl p-8 text-white min-h-64">
                          <p className="text-xs text-slate-400 uppercase tracking-widest mb-3">
                            Slide {currentSlide.slide_number} — {currentSlide.title}
                          </p>
                          <h2 className="text-2xl font-bold mb-6">{currentSlide.title}</h2>

                          {/* Key points */}
                          {currentSlide.key_points?.length > 0 && (
                            <ul className="space-y-2 mb-4">
                              {(currentSlide.key_points || []).map((pt: string, i: number) => (
                                <li key={i} className="flex gap-2 text-slate-200">
                                  <span className="text-blue-400 shrink-0 mt-0.5">›</span>{pt}
                                </li>
                              ))}
                            </ul>
                          )}

                          {/* Data table */}
                          {currentSlide.data_table?.length > 0 && (
                            <div className="grid grid-cols-2 gap-2 mt-4">
                              {(currentSlide.data_table || []).map((row: any, i: number) => (
                                <div key={i} className="bg-slate-800 rounded-lg p-3">
                                  <p className="text-xs text-slate-400">{row.label}</p>
                                  <p className="font-bold text-white">{row.value}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {showNotes && currentSlide?.speaker_notes && (
                        <div className="mt-3 bg-purple-50 border border-purple-200 rounded-lg p-3">
                          <p className="text-xs font-bold text-purple-700 uppercase mb-1">Speaker Notes</p>
                          <p className="text-sm text-purple-800">{currentSlide.speaker_notes}</p>
                        </div>
                      )}

                      {/* Slide nav arrows */}
                      <div className="flex justify-between mt-4">
                        <button onClick={() => setActiveSlide(Math.max(0, activeSlide-1))} disabled={activeSlide === 0} className="btn btn-secondary text-sm">← Previous</button>
                        <span className="text-sm text-gray-400 self-center">{activeSlide+1} / {slides.length}</span>
                        <button onClick={() => setActiveSlide(Math.min(slides.length-1, activeSlide+1))} disabled={activeSlide === slides.length-1} className="btn btn-secondary text-sm">Next →</button>
                      </div>
                    </div>
                  )}

                  {/* Tough questions */}
                  {presentation.questions_committee_will_ask?.length > 0 && (
                    <div className="card bg-yellow-50 border-yellow-200">
                      <p className="text-sm font-semibold text-yellow-800 mb-2">⚡ Questions the Committee Will Likely Ask</p>
                      {(presentation.questions_committee_will_ask || []).map((q: string, i: number) => (
                        <p key={i} className="text-sm text-yellow-700 flex gap-2 mb-1"><span className="shrink-0 font-bold">{i+1}.</span>{q}</p>
                      ))}
                    </div>
                  )}

                  {/* Record decision */}
                  {!presentation.decision && (
                    <div className="card">
                      <p className="font-semibold text-gray-800 mb-3">Record Committee Decision</p>
                      <div className="flex gap-2 mb-3">
                        {['approved', 'conditions', 'deferred', 'declined'].map(d => (
                          <button key={d} onClick={() => setDecisionForm({...decisionForm, decision: d})}
                            className={`flex-1 py-2 rounded-lg border text-sm font-medium capitalize transition-all ${
                              decisionForm.decision === d
                                ? DECISION_STYLE[d] + ' border-transparent'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                            }`}>
                            {d === 'conditions' ? 'Approve w/ Conditions' : d}
                          </button>
                        ))}
                      </div>
                      <textarea value={decisionForm.notes} onChange={e => setDecisionForm({...decisionForm, notes: e.target.value})}
                        className="input w-full min-h-16 text-sm mb-3" placeholder="Decision notes, conditions, or rationale..." />
                      <button onClick={saveDecision} disabled={!decisionForm.decision || savingDecision} className="btn btn-primary">
                        {savingDecision ? 'Saving...' : 'Record Decision'}
                      </button>
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