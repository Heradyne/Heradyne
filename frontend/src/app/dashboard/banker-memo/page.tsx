'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { FileText, Loader, Download, RefreshCw, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { AIDisclaimer } from '@/components/ai-disclaimer';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function BankerMemoPage() {
  const [deals, setDeals] = useState<any[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [memo, setMemo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['transaction', 'financial', 'recommendation']));

  useEffect(() => { loadDeals(); }, []);

  const loadDeals = async () => {
    try {
      const data = await api.getDeals();
      setDeals(data);
    } catch { setError('Failed to load deals'); }
    finally { setLoading(false); }
  };

  const generateMemo = async (deal: any) => {
    setSelectedDeal(deal);
    setMemo(null);
    setError('');
    setGenerating(true);
    try {
      const result = await api.generateBankerMemo(deal.id);
      setMemo(result);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to generate memo');
    } finally {
      setGenerating(false);
    }
  };

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const printMemo = () => window.print();

  const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
    <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
      <button
        onClick={() => toggleSection(id)}
        className="w-full flex justify-between items-center px-5 py-3 bg-gray-50 hover:bg-gray-100 text-left"
      >
        <span className="font-semibold text-gray-800 text-sm uppercase tracking-wide">{title}</span>
        {expandedSections.has(id) ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>
      {expandedSections.has(id) && <div className="px-5 py-4">{children}</div>}
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Banker Memo</h1>
          <p className="text-gray-500 mt-1">Generate SBA credit memos for loan committee review</p>
        </div>
        {memo && (
          <button onClick={printMemo} className="btn btn-secondary inline-flex items-center">
            <Download className="h-4 w-4 mr-2" /> Print / Save PDF
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="grid grid-cols-5 gap-6">
        {/* Deal selector */}
        <div className="col-span-2">
          <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Select Deal</p>
          {loading ? (
            <div className="text-sm text-gray-400">Loading deals...</div>
          ) : deals.length === 0 ? (
            <div className="text-sm text-gray-400">No deals available</div>
          ) : (
            <div className="space-y-2">
              {(deals || []).map(deal => (
                <div
                  key={deal.id}
                  onClick={() => generateMemo(deal)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    selectedDeal?.id === deal.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900 truncate">{deal.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5 capitalize">
                    {deal.industry} · {deal.loan_amount_requested ? formatCurrency(deal.loan_amount_requested) : 'N/A'}
                  </p>
                  <p className={`text-xs mt-1 font-medium ${
                    deal.status === 'matched' || deal.status === 'approved' ? 'text-green-600' : 'text-gray-400'
                  }`}>{deal.status?.replace(/_/g, ' ').toUpperCase()}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Memo panel */}
        <div className="col-span-3">
          {!selectedDeal && !generating && (
            <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-12 text-center">
              <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">Select a deal to generate a credit memo</p>
            </div>
          )}

          {generating && (
            <div className="bg-white rounded-xl border p-12 text-center">
              <Loader className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
              <p className="text-gray-600 font-medium">Generating credit memo...</p>
              <p className="text-gray-400 text-sm mt-1">Claude is drafting your loan committee memo</p>
            </div>
          )}

          {memo && !generating && (
            <div id="memo-content" className="space-y-0 print:text-sm">
              {/* Header */}
              <div className="bg-white border-b-2 border-blue-600 rounded-t-xl px-6 py-5">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs text-blue-600 font-bold uppercase tracking-widest mb-1">Credit Memorandum</p>
                    <h2 className="text-xl font-bold text-gray-900">{selectedDeal?.name}</h2>
                    <p className="text-gray-500 text-sm mt-1">{selectedDeal?.industry?.toUpperCase()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Memo Date</p>
                    <p className="text-sm font-medium text-gray-900">{memo.memo_date || new Date().toLocaleDateString()}</p>
                    <p className="text-xs text-gray-500 mt-2">Loan Ref</p>
                    <p className="text-sm font-medium text-gray-900">{memo.loan_number_placeholder}</p>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between">
                  <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                    memo.recommendation === 'Approve' ? 'bg-green-500 text-white' :
                    memo.recommendation === 'Approve with Conditions' ? 'bg-yellow-400 text-gray-900' :
                    'bg-red-500 text-white'
                  }`}>
                    {memo.recommendation}
                  </span>
                  <p className="text-gray-600 text-sm max-w-md text-right">{memo.recommendation_rationale}</p>
                </div>
              </div>

              <div className="bg-white rounded-b-xl border border-t-0 p-5 space-y-0">
                <Section id="transaction" title="Transaction Summary">
                  <p className="text-sm text-gray-700 leading-relaxed">{memo.transaction_summary}</p>
                  {memo.proposed_structure && (
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      {[
                        { label: 'Loan Amount', value: memo.proposed_structure.loan_amount },
                        { label: 'Term', value: memo.proposed_structure.term_months },
                        { label: 'Rate Range', value: memo.proposed_structure.interest_rate },
                        { label: 'SBA Guarantee', value: memo.proposed_structure.sba_guarantee_pct },
                        { label: 'Equity Required', value: memo.proposed_structure.equity_injection_required },
                      ].map(f => (
                        <div key={f.label} className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-400">{f.label}</p>
                          <p className="text-sm font-semibold text-gray-900">{f.value || 'N/A'}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>

                <Section id="borrower" title="Borrower Profile">
                  <p className="text-sm text-gray-700 leading-relaxed">{memo.borrower_profile}</p>
                </Section>

                <Section id="financial" title="Financial Analysis">
                  {memo.financial_analysis && (
                    <div className="space-y-3">
                      {Object.entries(memo.financial_analysis).map(([key, value]) => (
                        <div key={key} className="border-b border-gray-50 pb-3 last:border-0">
                          <p className="text-xs font-semibold text-gray-500 uppercase mb-1">
                            {key.replace(/_/g, ' ')}
                          </p>
                          <p className="text-sm text-gray-700">{String(value)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>

                <Section id="collateral" title="Collateral Analysis">
                  <p className="text-sm text-gray-700 leading-relaxed">{memo.collateral_analysis}</p>
                </Section>

                <Section id="sba" title="SBA Eligibility">
                  <p className="text-sm text-gray-700 leading-relaxed">{memo.sba_eligibility}</p>
                </Section>

                <Section id="risks" title="Risk Factors & Mitigants">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-semibold text-red-600 uppercase mb-2">Risk Factors</p>
                      <ul className="space-y-2">
                        {(memo.risk_factors || []).map((r: string, i: number) => (
                          <li key={i} className="text-sm text-gray-700 flex gap-2">
                            <span className="text-red-400 shrink-0 mt-0.5">•</span>{r}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-green-600 uppercase mb-2">Mitigants</p>
                      <ul className="space-y-2">
                        {(memo.mitigants || []).map((m: string, i: number) => (
                          <li key={i} className="text-sm text-gray-700 flex gap-2">
                            <span className="text-green-500 shrink-0 mt-0.5">✓</span>{m}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </Section>

                <Section id="conditions" title="Conditions Precedent">
                  <ol className="space-y-2">
                    {(memo.conditions_precedent || []).map((c: string, i: number) => (
                      <li key={i} className="text-sm text-gray-700 flex gap-3">
                        <span className="text-blue-600 font-semibold shrink-0">{i + 1}.</span>{c}
                      </li>
                    ))}
                  </ol>
                </Section>

                <div className="bg-gray-50 rounded-lg p-4 mt-2">
                  <p className="text-xs text-gray-400 text-center">
                    DISCLAIMER: This memo is AI-generated using borrower-provided data and system models.
                    It does not constitute an SBA approval, commitment to lend, or substitute for independent lender underwriting.
                    Generated {memo.generated_at ? new Date(memo.generated_at).toLocaleString() : 'now'}.
                  </p>
                </div>
              </div>

              <div className="mt-4 flex justify-center">
                <button
                  onClick={() => generateMemo(selectedDeal)}
                  className="btn btn-secondary inline-flex items-center text-sm"
                >
                  <RefreshCw className="h-4 w-4 mr-2" /> Regenerate Memo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}