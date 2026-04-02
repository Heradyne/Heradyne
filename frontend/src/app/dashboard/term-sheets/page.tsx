'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Send, CheckCircle, DollarSign, AlertTriangle, ArrowRight } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export default function TermSheetsPage() {
  const router = useRouter();
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [uw, setUw] = useState<any>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    loan_amount: '',
    interest_rate: '10.75',
    term_months: '120',
    sba_loan: true,
    coverage_pct: '75',
    origination_fee: '2.0',
    prepayment_penalty: true,
    covenants: 'Maintain DSCR ≥ 1.25x. Quarterly financials required. No additional debt without lender consent.',
    conditions: 'Subject to satisfactory appraisal and environmental review. Personal guarantee required.',
    expiry_days: '30',
  });

  useEffect(() => { loadDeals(); }, []);

  const loadDeals = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/v1/deals/?status=submitted,analyzed,matched`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setDeals(await res.json());
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  const selectDeal = async (deal: any) => {
    setSelected(deal);
    setSubmitted(false);
    setForm(prev => ({ ...prev, loan_amount: deal.loan_amount_requested?.toString() || '' }));
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/v1/underwriting/deals/${deal.id}/full-underwriting`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setUw(await res.json());
    } catch(e) {}
  };

  const submitTermSheet = async () => {
    if (!selected) return;
    setSubmitting(true);
    // In production this would POST to /api/v1/deals/{id}/term-sheets
    await new Promise(r => setTimeout(r, 1500));
    setSubmitted(true);
    setSubmitting(false);
  };

  const upd = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));
  const inputClass = "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400";
  const labelClass = "block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1";

  const verdict = uw?.deal_killer?.verdict;
  const vColor = verdict === 'buy' ? 'text-green-700' : verdict === 'renegotiate' ? 'text-yellow-700' : 'text-red-600';

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Term Sheet Builder</h1>
        <p className="text-gray-500 mt-1">Select a deal and build a term sheet offer for the borrower.</p>
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Deal list */}
        <div className="col-span-2 space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Available Deals</p>
          {loading && <div className="text-sm text-gray-400">Loading...</div>}
          {!loading && deals.length === 0 && (
            <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-6 text-center">
              <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2"/>
              <p className="text-sm text-gray-400">No deals available yet</p>
            </div>
          )}
          {deals.map(deal => (
            <div key={deal.id}
              onClick={() => selectDeal(deal)}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${selected?.id === deal.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
              <p className="text-sm font-semibold text-gray-900 truncate">{deal.name}</p>
              <p className="text-xs text-gray-400 mt-0.5 capitalize">{deal.industry} · {fmt(deal.loan_amount_requested || 0)}</p>
              <span className={`text-xs font-semibold mt-1 inline-block px-2 py-0.5 rounded-full ${deal.status === 'analyzed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                {deal.status}
              </span>
            </div>
          ))}
        </div>

        {/* Term sheet form */}
        <div className="col-span-3">
          {!selected ? (
            <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-12 text-center">
              <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3"/>
              <p className="text-gray-400">Select a deal from the left to build a term sheet</p>
            </div>
          ) : submitted ? (
            <div className="bg-white rounded-xl border p-12 text-center">
              <CheckCircle className="h-14 w-14 text-green-500 mx-auto mb-4"/>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Term Sheet Submitted</h2>
              <p className="text-sm text-gray-500 mb-6">Your offer has been sent to {selected.name}. The borrower will be notified.</p>
              <button onClick={() => setSubmitted(false)} className="text-sm text-blue-600 hover:text-blue-800">Submit another offer →</button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border p-6 space-y-5">
              {/* Deal summary */}
              <div className="pb-4 border-b border-gray-100">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="font-bold text-gray-900">{selected.name}</h2>
                    <p className="text-xs text-gray-400 capitalize mt-0.5">{selected.industry} · Asking {fmt(selected.purchase_price || 0)}</p>
                  </div>
                  {uw && (
                    <div className="text-right">
                      <p className={`text-sm font-bold ${vColor}`}>
                        {verdict === 'buy' ? '✓ Buy' : verdict === 'renegotiate' ? '⚠ Renegotiate' : '✗ Pass'}
                      </p>
                      <p className="text-xs text-gray-400">DSCR {uw.dscr_pdscr?.dscr_base?.toFixed(2)}x · Health {uw.health_score?.score?.toFixed(0)}/100</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Loan terms */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Loan Amount *</label>
                  <input type="number" className={inputClass} value={form.loan_amount} onChange={e => upd('loan_amount', e.target.value)}/>
                  <p className="text-xs text-gray-400 mt-1">{form.loan_amount ? fmt(+form.loan_amount) : '—'}</p>
                </div>
                <div>
                  <label className={labelClass}>Interest Rate (%)</label>
                  <input type="number" step="0.25" className={inputClass} value={form.interest_rate} onChange={e => upd('interest_rate', e.target.value)}/>
                  <p className="text-xs text-gray-400 mt-1">Prime + spread</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Term (months)</label>
                  <input type="number" className={inputClass} value={form.term_months} onChange={e => upd('term_months', e.target.value)}/>
                </div>
                <div>
                  <label className={labelClass}>Origination Fee (%)</label>
                  <input type="number" step="0.25" className={inputClass} value={form.origination_fee} onChange={e => upd('origination_fee', e.target.value)}/>
                </div>
                <div>
                  <label className={labelClass}>SBA Guarantee (%)</label>
                  <input type="number" className={inputClass} value={form.coverage_pct} onChange={e => upd('coverage_pct', e.target.value)}/>
                </div>
              </div>

              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded" checked={form.sba_loan} onChange={e => upd('sba_loan', e.target.checked)}/>
                  <span className="text-sm text-gray-700">SBA 7(a) loan</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded" checked={form.prepayment_penalty} onChange={e => upd('prepayment_penalty', e.target.checked)}/>
                  <span className="text-sm text-gray-700">Prepayment penalty</span>
                </label>
              </div>

              <div>
                <label className={labelClass}>Covenants</label>
                <textarea className={inputClass} rows={3} value={form.covenants} onChange={e => upd('covenants', e.target.value)}/>
              </div>

              <div>
                <label className={labelClass}>Conditions Precedent</label>
                <textarea className={inputClass} rows={3} value={form.conditions} onChange={e => upd('conditions', e.target.value)}/>
              </div>

              <div>
                <label className={labelClass}>Offer Expiry (days)</label>
                <input type="number" className={inputClass} value={form.expiry_days} onChange={e => upd('expiry_days', e.target.value)} style={{maxWidth: '120px'}}/>
              </div>

              {/* Monthly payment calc */}
              {form.loan_amount && form.interest_rate && form.term_months && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-xs font-semibold text-blue-700 uppercase mb-2">Estimated Monthly Payment</p>
                  {(() => {
                    const P = +form.loan_amount;
                    const r = +form.interest_rate / 100 / 12;
                    const n = +form.term_months;
                    const pmt = r > 0 ? P * r * Math.pow(1+r,n) / (Math.pow(1+r,n)-1) : P/n;
                    return (
                      <div className="flex gap-6">
                        <div><p className="text-xs text-blue-600">Monthly P&I</p><p className="font-bold text-blue-900">{fmt(pmt)}</p></div>
                        <div><p className="text-xs text-blue-600">Annual P&I</p><p className="font-bold text-blue-900">{fmt(pmt * 12)}</p></div>
                        {uw?.health_score?.score && <div><p className="text-xs text-blue-600">DSCR after debt</p><p className={`font-bold ${(uw.dscr_pdscr?.dscr_base||0) >= 1.25 ? 'text-green-700' : 'text-red-600'}`}>{uw.dscr_pdscr?.dscr_base?.toFixed(2)}x</p></div>}
                      </div>
                    );
                  })()}
                </div>
              )}

              <button onClick={submitTermSheet} disabled={submitting || !form.loan_amount}
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {submitting ? 'Submitting...' : <><Send className="h-4 w-4"/> Submit Term Sheet to Borrower</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
