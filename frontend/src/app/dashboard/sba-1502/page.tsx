'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { FileText, Loader, RefreshCw, CheckCircle, AlertTriangle, XCircle, Send, ChevronDown, ChevronUp, X, Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const STATUS_STYLE: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-700 border-gray-300',
  submitted: 'bg-green-100 text-green-800 border-green-300',
};
const PAYMENT_CODE_LABEL: Record<string, { label: string; color: string }> = {
  C: { label: 'Current',   color: 'text-green-700 bg-green-50' },
  '1': { label: '1-29 DPD', color: 'text-yellow-700 bg-yellow-50' },
  '2': { label: '30-59 DPD', color: 'text-orange-700 bg-orange-50' },
  '3': { label: '60-89 DPD', color: 'text-red-600 bg-red-50' },
  '4': { label: '90+ DPD',  color: 'text-red-800 bg-red-100' },
  D:  { label: 'Default',  color: 'text-purple-800 bg-purple-100' },
};

export default function SBA1502Page() {
  const [reports, setReports] = useState<any[]>([]);
  const [activeReport, setActiveReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [expandedLoans, setExpandedLoans] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const now = new Date();
  const [form, setForm] = useState({
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  });

  useEffect(() => { loadReports(); }, []);

  const loadReports = async () => {
    try {
      const data = await api.list1502Reports();
      setReports(data.reports || []);
    } catch { setError('Failed to load reports'); }
    finally { setLoading(false); }
  };

  const generate = async () => {
    setGenerating(true);
    setError('');
    try {
      const result = await api.generate1502Report(form.month, form.year);
      setActiveReport(result);
      await loadReports();
      setShowForm(false);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to generate report');
    } finally { setGenerating(false); }
  };

  const loadReport = async (id: number) => {
    try {
      const data = await api.get1502Report(id);
      setActiveReport(data);
    } catch { setError('Failed to load report'); }
  };

  const submitReport = async (id: number) => {
    setSubmitting(true);
    try {
      await api.submit1502Report(id);
      await loadReports();
      if (activeReport?.report_id === id) {
        setActiveReport((prev: any) => ({ ...prev, status: 'submitted' }));
      }
    } catch { setError('Failed to submit report'); }
    finally { setSubmitting(false); }
  };

  const toggleLoan = (id: string) => setExpandedLoans(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="h-8 w-8 animate-spin text-primary-600" /></div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="h-7 w-7 text-blue-600" /> SBA Form 1502 Reporting
          </h1>
          <p className="text-gray-600">Monthly SBA loan status reports — generate, validate, and submit</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary inline-flex items-center gap-2">
          <FileText className="h-4 w-4" /> Generate Report
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex justify-between">
          {error}<button onClick={() => setError('')}><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Generate form */}
      {showForm && (
        <div className="card border-blue-200 bg-blue-50 mb-6">
          <h3 className="font-semibold text-gray-800 mb-3">New 1502 Report</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="label">Reporting Month</label>
              <select value={form.month} onChange={e => setForm({...form, month: +e.target.value})} className="input">
                {(MONTHS || []).map((m, i) => <option key={i} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Reporting Year</label>
              <input type="number" value={form.year} onChange={e => setForm({...form, year: +e.target.value})} className="input" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={generate} disabled={generating} className="btn btn-primary inline-flex items-center gap-2">
              {generating ? <><Loader className="h-4 w-4 animate-spin" />Generating...</> : 'Generate 1502 Report'}
            </button>
            <button onClick={() => setShowForm(false)} className="btn btn-secondary">Cancel</button>
          </div>
          <p className="text-xs text-gray-500 mt-2">Claude will pull all active loans, calculate guaranteed balances, and flag any data issues.</p>
        </div>
      )}

      {generating && (
        <div className="card text-center py-12 mb-6">
          <Loader className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">Generating 1502 report for {MONTHS[form.month-1]} {form.year}...</p>
          <p className="text-gray-400 text-sm mt-1">Pulling loan data, calculating guaranteed balances, running validation</p>
        </div>
      )}

      <div className="grid grid-cols-4 gap-6">
        {/* History list */}
        <div className="col-span-1">
          <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Report History</p>
          {reports.length === 0 ? (
            <p className="text-sm text-gray-400">No reports yet</p>
          ) : (
            <div className="space-y-2">
              {(reports || []).map(r => (
                <button key={r.id} onClick={() => loadReport(r.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    activeReport?.report_id === r.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                  <p className="font-medium text-sm text-gray-900">{MONTHS[r.month-1]} {r.year}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_STYLE[r.status] || STATUS_STYLE.draft}`}>
                      {r.status.toUpperCase()}
                    </span>
                    {r.validation_errors > 0 && (
                      <span className="text-xs text-red-600">{r.validation_errors} errors</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{r.loan_count} loans · {formatCurrency(r.total_guaranteed_balance || 0)} guaranteed</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Report detail */}
        <div className="col-span-3">
          {!activeReport ? (
            <div className="card text-center py-16">
              <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">Generate a new report or select one from history</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Report header */}
              <div className={`card border-2 ${activeReport.ready_to_submit || activeReport.status === 'submitted' ? 'border-green-300 bg-green-50' : 'border-yellow-300 bg-yellow-50'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">SBA Form 1502</p>
                    <h2 className="text-xl font-bold text-gray-900">{activeReport.report_month}</h2>
                    <p className="text-sm text-gray-600 mt-1">{activeReport.lender_id_placeholder}</p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-block px-3 py-1 rounded-full border text-sm font-bold ${STATUS_STYLE[activeReport.status] || STATUS_STYLE.draft}`}>
                      {(activeReport.status || 'DRAFT').toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Summary stats */}
                {activeReport.summary && (
                  <div className="grid grid-cols-5 gap-3 mt-4">
                    {[
                      { label: 'Total Loans', val: activeReport.summary.total_loans },
                      { label: 'Outstanding', val: formatCurrency(activeReport.summary.total_outstanding_balance || 0) },
                      { label: 'Guaranteed', val: formatCurrency(activeReport.summary.total_guaranteed_balance || 0) },
                      { label: 'Delinquent', val: activeReport.summary.delinquent_loans, alert: activeReport.summary.delinquent_loans > 0 },
                      { label: 'Default', val: activeReport.summary.default_loans, alert: activeReport.summary.default_loans > 0 },
                    ].map(s => (
                      <div key={s.label} className={`p-2 rounded-lg text-center ${s.alert ? 'bg-red-50' : 'bg-white bg-opacity-60'}`}>
                        <p className={`text-lg font-bold ${s.alert ? 'text-red-700' : 'text-gray-900'}`}>{s.val}</p>
                        <p className="text-xs text-gray-500">{s.label}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Validation */}
                {activeReport.validation_errors?.length > 0 && (
                  <div className="mt-3 bg-red-100 border border-red-200 rounded-lg p-3">
                    <p className="text-sm font-bold text-red-800 mb-1">⛔ {activeReport.validation_errors.length} Validation Errors — Fix Before Submitting</p>
                    {(activeReport.validation_errors || []).map((e: string, i: number) => (
                      <p key={i} className="text-sm text-red-700">• {e}</p>
                    ))}
                  </div>
                )}
                {activeReport.warnings?.length > 0 && (
                  <div className="mt-2 bg-yellow-100 border border-yellow-200 rounded-lg p-3">
                    <p className="text-xs font-bold text-yellow-800 mb-1">⚠ Data Quality Warnings</p>
                    {(activeReport.warnings || []).map((w: string, i: number) => (
                      <p key={i} className="text-xs text-yellow-700">• {w}</p>
                    ))}
                  </div>
                )}

                {/* Submit button */}
                {activeReport.status !== 'submitted' && (
                  <div className="mt-4 flex items-center gap-3">
                    <button onClick={() => setShowPreview(true)}
                      className="btn btn-secondary inline-flex items-center gap-2">
                      <Printer className="h-4 w-4" /> Preview Report
                    </button>
                    {activeReport.ready_to_submit ? (
                      <button onClick={() => submitReport(activeReport.report_id)} disabled={submitting}
                        className="btn btn-primary inline-flex items-center gap-2">
                        {submitting ? <Loader className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Mark as Submitted to SBA
                      </button>
                    ) : (
                      <p className="text-sm text-yellow-700">Resolve validation errors before submitting.</p>
                    )}
                  </div>
                )}
                {activeReport.status === 'submitted' && (
                  <div className="mt-3 flex items-center gap-4">
                    <div className="flex items-center gap-2 text-green-700">
                      <CheckCircle className="h-5 w-5" />
                      <p className="text-sm font-medium">Submitted to SBA</p>
                    </div>
                    <button onClick={() => setShowPreview(true)}
                      className="btn btn-secondary text-sm inline-flex items-center gap-2">
                      <Printer className="h-4 w-4" /> View Report
                    </button>
                  </div>
                )}
              </div>

              {/* Loan rows */}
              {activeReport.loan_rows?.length > 0 && (
                <div className="card">
                  <h3 className="font-semibold text-gray-800 mb-3">Loan Detail ({activeReport.loan_rows.length} loans)</h3>
                  <div className="space-y-2">
                    {/* Header */}
                    <div className="grid grid-cols-6 gap-2 px-3 py-2 bg-gray-50 rounded text-xs font-semibold text-gray-500 uppercase">
                      <span className="col-span-2">Loan / Borrower</span>
                      <span className="text-right">Balance</span>
                      <span className="text-right">Guaranteed</span>
                      <span className="text-center">Status</span>
                      <span className="text-right">Interest Accrued</span>
                    </div>
                    {(activeReport.loan_rows || []).map((loan: any, i: number) => {
                      const isExp = expandedLoans.has(loan.sba_loan_number);
                      const pCode = PAYMENT_CODE_LABEL[loan.payment_status_code] || { label: loan.payment_status_code, color: 'text-gray-600 bg-gray-50' };
                      return (
                        <div key={i} className={`border rounded-lg overflow-hidden ${loan.flags?.length > 0 ? 'border-red-200' : 'border-gray-100'}`}>
                          <button onClick={() => toggleLoan(loan.sba_loan_number)}
                            className="w-full grid grid-cols-6 gap-2 px-3 py-2.5 text-left hover:bg-gray-50 items-center">
                            <div className="col-span-2">
                              <p className="text-sm font-medium text-gray-900">{loan.sba_loan_number}</p>
                              <p className="text-xs text-gray-400 truncate">{loan.borrower_name}</p>
                            </div>
                            <p className="text-sm text-right text-gray-700">{formatCurrency(loan.current_balance || 0)}</p>
                            <p className="text-sm text-right text-blue-700 font-medium">{formatCurrency(loan.guaranteed_balance || 0)}</p>
                            <div className="flex justify-center">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pCode.color}`}>
                                {pCode.label}
                              </span>
                            </div>
                            <div className="flex items-center justify-end gap-1">
                              <p className="text-sm text-gray-600">{formatCurrency(loan.interest_accrued_this_period || 0)}</p>
                              {loan.flags?.length > 0 && <AlertTriangle className="h-4 w-4 text-red-500" />}
                            </div>
                          </button>
                          {isExp && (
                            <div className="px-3 py-3 bg-gray-50 border-t border-gray-100 grid grid-cols-3 gap-3 text-xs text-gray-600">
                              <div><span className="font-medium">Original:</span> {formatCurrency(loan.original_amount || 0)}</div>
                              <div><span className="font-medium">Guarantee %:</span> {((loan.guarantee_pct || 0) * 100).toFixed(0)}%</div>
                              <div><span className="font-medium">Interest Rate:</span> {((loan.interest_rate || 0) * 100).toFixed(2)}%</div>
                              <div><span className="font-medium">Principal Paid:</span> {formatCurrency(loan.principal_paid_this_period || 0)}</div>
                              <div><span className="font-medium">Maturity:</span> {loan.maturity_date || 'N/A'}</div>
                              <div><span className="font-medium">DPD:</span> {loan.days_past_due || 0}</div>
                              {loan.flags?.length > 0 && (
                                <div className="col-span-3">
                                  {(loan.flags || []).map((f: string, fi: number) => (
                                    <p key={fi} className="text-red-600">⚠ {f}</p>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

      {/* ── 1502 Preview Modal ── */}
      {showPreview && activeReport && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-50 overflow-y-auto py-8 px-4">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl">

            {/* Modal toolbar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl z-10">
              <div>
                <h2 className="font-bold text-gray-900">SBA Form 1502 — {activeReport.report_month}</h2>
                <p className="text-sm text-gray-500">Review carefully before submitting to SBA</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="btn btn-secondary text-sm inline-flex items-center gap-2">
                  <Printer className="h-4 w-4" /> Print / PDF
                </button>
                <button onClick={() => setShowPreview(false)} className="btn btn-secondary text-sm inline-flex items-center gap-1">
                  <X className="h-4 w-4" /> Close
                </button>
              </div>
            </div>

            {/* Formal SBA 1502 layout */}
            <div className="p-8 text-sm" style={{ fontFamily: 'Georgia, serif' }}>

              {/* Form title block */}
              <div className="border-2 border-gray-800 p-5 mb-6">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-widest">U.S. Small Business Administration</p>
                    <h1 className="text-2xl font-bold mt-1">SBA FORM 1502</h1>
                    <p className="text-sm text-gray-600">Guaranteed Loan Status Report</p>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    <p>OMB Approval No. 3245-0017</p>
                    <p className="mt-1">Reporting Period: <strong className="text-gray-800">{activeReport.report_month}</strong></p>
                    <p className="mt-1">Status: <strong className={activeReport.status === 'submitted' ? 'text-green-700' : 'text-yellow-700'}>{(activeReport.status || 'DRAFT').toUpperCase()}</strong></p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 mt-5 pt-4 border-t border-gray-300">
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">Lender / Institution</p>
                    <p className="text-base font-semibold">{activeReport.lender_id_placeholder || '— Not specified —'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">Date Prepared</p>
                    <p className="text-base">{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                  </div>
                </div>
              </div>

              {/* Part I — Portfolio Summary */}
              <div className="mb-6">
                <div className="bg-gray-800 text-white px-4 py-2 font-bold text-xs uppercase tracking-widest mb-0">
                  PART I — PORTFOLIO SUMMARY
                </div>
                <table className="w-full border border-gray-300 text-sm">
                  <tbody>
                    <tr className="border-b border-gray-200">
                      <td className="px-4 py-2 text-gray-600 w-1/2">Total Number of Active SBA Loans</td>
                      <td className="px-4 py-2 font-bold text-right">{activeReport.summary?.total_loans || 0}</td>
                    </tr>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <td className="px-4 py-2 text-gray-600">Total Outstanding Principal Balance</td>
                      <td className="px-4 py-2 font-bold text-right">{formatCurrency(activeReport.summary?.total_outstanding_balance || 0)}</td>
                    </tr>
                    <tr className="border-b border-gray-200">
                      <td className="px-4 py-2 text-gray-600">Total SBA Guaranteed Balance (75%)</td>
                      <td className="px-4 py-2 font-bold text-right text-blue-700">{formatCurrency(activeReport.summary?.total_guaranteed_balance || 0)}</td>
                    </tr>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <td className="px-4 py-2 text-gray-600">Loans 30+ Days Past Due (Delinquent)</td>
                      <td className={`px-4 py-2 font-bold text-right ${(activeReport.summary?.delinquent_loans || 0) > 0 ? 'text-red-700' : 'text-green-700'}`}>
                        {activeReport.summary?.delinquent_loans || 0}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 text-gray-600">Loans in Default / Charged Off</td>
                      <td className={`px-4 py-2 font-bold text-right ${(activeReport.summary?.default_loans || 0) > 0 ? 'text-red-700' : 'text-green-700'}`}>
                        {activeReport.summary?.default_loans || 0}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Part II — Individual Loan Detail */}
              <div className="mb-6">
                <div className="bg-gray-800 text-white px-4 py-2 font-bold text-xs uppercase tracking-widest mb-0">
                  PART II — INDIVIDUAL LOAN STATUS ({(activeReport.loan_rows || []).length} LOAN{(activeReport.loan_rows || []).length !== 1 ? 'S' : ''})
                </div>
                <table className="w-full border border-gray-300 text-xs">
                  <thead>
                    <tr className="bg-gray-100 border-b-2 border-gray-400">
                      <th className="px-3 py-2 text-left font-bold">SBA Loan Number</th>
                      <th className="px-3 py-2 text-left font-bold">Borrower Name</th>
                      <th className="px-3 py-2 text-right font-bold">Outstanding Balance</th>
                      <th className="px-3 py-2 text-right font-bold">Guaranteed Amt</th>
                      <th className="px-3 py-2 text-right font-bold">Pmt Received</th>
                      <th className="px-3 py-2 text-right font-bold">Interest Accrued</th>
                      <th className="px-3 py-2 text-center font-bold">Status</th>
                      <th className="px-3 py-2 text-right font-bold">DPD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(activeReport.loan_rows || []).map((loan: any, i: number) => (
                      <tr key={i} className={`border-b border-gray-200 ${i % 2 === 0 ? '' : 'bg-gray-50'} ${(loan.days_past_due || 0) > 90 ? 'bg-red-50' : ''}`}>
                        <td className="px-3 py-2 font-mono text-xs">{loan.sba_loan_number || loan.loan_number || '—'}</td>
                        <td className="px-3 py-2 font-medium">{loan.borrower_name}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(loan.outstanding_balance || 0)}</td>
                        <td className="px-3 py-2 text-right text-blue-700">{formatCurrency(loan.guaranteed_balance || 0)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(loan.current_payment || 0)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(loan.interest_accrued || 0)}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            (loan.days_past_due || 0) === 0 ? 'bg-green-100 text-green-700' :
                            (loan.days_past_due || 0) <= 30 ? 'bg-yellow-100 text-yellow-700' :
                            (loan.days_past_due || 0) <= 90 ? 'bg-orange-100 text-orange-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {loan.status_label || loan.payment_status || 'Current'}
                          </span>
                        </td>
                        <td className={`px-3 py-2 text-right font-bold ${(loan.days_past_due || 0) > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                          {loan.days_past_due || 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-200 border-t-2 border-gray-600 font-bold">
                      <td className="px-3 py-2 text-xs uppercase" colSpan={2}>Totals</td>
                      <td className="px-3 py-2 text-right">{formatCurrency((activeReport.loan_rows || []).reduce((s: number, l: any) => s + (l.outstanding_balance || 0), 0))}</td>
                      <td className="px-3 py-2 text-right text-blue-700">{formatCurrency((activeReport.loan_rows || []).reduce((s: number, l: any) => s + (l.guaranteed_balance || 0), 0))}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency((activeReport.loan_rows || []).reduce((s: number, l: any) => s + (l.current_payment || 0), 0))}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency((activeReport.loan_rows || []).reduce((s: number, l: any) => s + (l.interest_accrued || 0), 0))}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Validation notices */}
              {(activeReport.validation_errors || []).length > 0 && (
                <div className="mb-6 border-2 border-red-400 rounded-lg p-4 bg-red-50">
                  <p className="font-bold text-red-800 mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" /> {activeReport.validation_errors.length} Validation Error{activeReport.validation_errors.length !== 1 ? 's' : ''} — Must Resolve Before Submitting
                  </p>
                  {(activeReport.validation_errors || []).map((e: string, i: number) => (
                    <p key={i} className="text-sm text-red-700 flex gap-2"><span className="shrink-0">•</span>{e}</p>
                  ))}
                </div>
              )}

              {/* Part III — Certification */}
              <div className="border-2 border-gray-400 p-5">
                <div className="bg-gray-800 text-white px-4 py-2 font-bold text-xs uppercase tracking-widest -mx-5 -mt-5 mb-4">
                  PART III — LENDER CERTIFICATION
                </div>
                <p className="text-xs text-gray-600 leading-relaxed mb-6">
                  I certify that the information contained in this report is true and accurate and that the lender is in compliance with all SBA Loan Program Requirements applicable to the 7(a) loan program, including those in 13 CFR Part 120. I understand that any false statement made in connection with this report may subject the lender, and/or its officers, to criminal and/or civil penalties under applicable federal statutes, including 18 U.S.C. §§ 1001 and 1014.
                </p>
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <div className="border-b-2 border-gray-800 h-10 mb-1"></div>
                    <p className="text-xs text-gray-500">Authorized Representative Signature</p>
                  </div>
                  <div>
                    <div className="border-b-2 border-gray-800 h-10 mb-1"></div>
                    <p className="text-xs text-gray-500">Date (MM/DD/YYYY)</p>
                  </div>
                  <div>
                    <div className="border-b-2 border-gray-800 h-10 mb-1"></div>
                    <p className="text-xs text-gray-500">Printed Name</p>
                  </div>
                  <div>
                    <div className="border-b-2 border-gray-800 h-10 mb-1"></div>
                    <p className="text-xs text-gray-500">Title</p>
                  </div>
                </div>
              </div>

            </div>

            {/* Modal footer actions */}
            <div className="px-8 py-4 border-t border-gray-200 flex justify-between items-center bg-gray-50 rounded-b-2xl">
              <button onClick={() => setShowPreview(false)} className="btn btn-secondary">Close Preview</button>
              <div className="flex gap-3">
                <button onClick={() => window.print()} className="btn btn-secondary inline-flex items-center gap-2">
                  <Printer className="h-4 w-4" /> Print / Save as PDF
                </button>
                {activeReport.ready_to_submit && activeReport.status !== 'submitted' && (
                  <button onClick={() => { submitReport(activeReport.report_id); setShowPreview(false); }}
                    disabled={submitting} className="btn btn-primary inline-flex items-center gap-2">
                    {submitting ? <Loader className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Submit to SBA
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

  );
}