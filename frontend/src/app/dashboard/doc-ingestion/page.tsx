'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { Upload, FileText, Loader, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

const DOC_TYPES = [
  { value: 'p_and_l', label: 'P&L Statement' },
  { value: 'tax_return', label: 'Tax Return (Business)' },
  { value: 'balance_sheet', label: 'Balance Sheet' },
  { value: 'bank_statement', label: 'Bank Statement' },
  { value: 'other', label: 'Other Financial Document' },
];

const QUALITY_COLORS: Record<string, string> = {
  excellent: 'text-green-700 bg-green-50',
  good: 'text-blue-700 bg-blue-50',
  fair: 'text-yellow-700 bg-yellow-50',
  poor: 'text-red-700 bg-red-50',
};

export default function DocumentIngestionPage() {
  const [docType, setDocType] = useState('p_and_l');
  const [businessName, setBusinessName] = useState('');
  const [documentText, setDocumentText] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<any[]>([]);

  const normalize = async () => {
    if (!documentText.trim() || !businessName.trim()) {
      setError('Please enter a business name and paste the document text.');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await api.normalizeDocument(documentText, docType, businessName);
      setResult(res);
      setHistory(prev => [{ ...res, business_name: businessName, doc_type: docType }, ...prev.slice(0, 4)]);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to normalize document');
    } finally {
      setLoading(false);
    }
  };

  const fmt = (v: any) => v != null ? formatCurrency(v) : '—';

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Financial Document Ingestion</h1>
        <p className="text-gray-500 mt-1">
          Paste any financial document — P&L, tax return, balance sheet — and AI extracts and normalizes it for SBA underwriting.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      <div className="grid grid-cols-5 gap-6">
        {/* Input panel */}
        <div className="col-span-2 space-y-4">
          <div>
            <label className="label">Business Name *</label>
            <input
              type="text"
              value={businessName}
              onChange={e => setBusinessName(e.target.value)}
              className="input"
              placeholder="e.g. Greenville HVAC Solutions LLC"
            />
          </div>
          <div>
            <label className="label">Document Type *</label>
            <select value={docType} onChange={e => setDocType(e.target.value)} className="input">
              {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Document Text *</label>
            <p className="text-xs text-gray-400 mb-1">Paste the text content of the document (copy from PDF, spreadsheet, or email)</p>
            <textarea
              value={documentText}
              onChange={e => setDocumentText(e.target.value)}
              className="input min-h-48 resize-y text-xs font-mono"
              placeholder={`Paste document text here...\n\nExample:\nRevenue: $1,240,000\nCost of Goods Sold: $480,000\nGross Profit: $760,000\nOwner Salary: $120,000\nRent: $48,000\nUtilities: $18,000\nNet Income: $142,000`}
            />
          </div>
          <button
            onClick={normalize}
            disabled={loading || !documentText.trim() || !businessName.trim()}
            className="btn btn-primary w-full inline-flex items-center justify-center"
          >
            {loading ? <Loader className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            {loading ? 'Analyzing...' : 'Extract & Normalize'}
          </button>

          {/* History */}
          {history.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Recent</p>
              {history.map((h, i) => (
                <div key={i} className="p-3 border border-gray-100 rounded-lg mb-2 cursor-pointer hover:bg-gray-50" onClick={() => setResult(h)}>
                  <p className="text-sm font-medium text-gray-800 truncate">{h.business_name}</p>
                  <p className="text-xs text-gray-400">{DOC_TYPES.find(t => t.value === h.doc_type)?.label} · {h.period_covered || 'N/A'}</p>
                  {h.normalized_ebitda != null && (
                    <p className="text-xs text-green-600 font-medium mt-0.5">EBITDA: {formatCurrency(h.normalized_ebitda)}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Results panel */}
        <div className="col-span-3">
          {!result && !loading && (
            <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-12 text-center">
              <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">Paste a document to extract financial data</p>
              <p className="text-gray-300 text-sm mt-1">Works with P&Ls, tax returns, balance sheets, bank statements</p>
            </div>
          )}

          {loading && (
            <div className="bg-white rounded-xl border p-12 text-center">
              <Loader className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
              <p className="text-gray-600 font-medium">Analyzing document...</p>
              <p className="text-gray-400 text-sm mt-1">Extracting and normalizing financial data</p>
            </div>
          )}

          {result && !loading && (
            <div className="space-y-4">
              {/* Header */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{result.business_name || businessName}</h3>
                    <p className="text-sm text-gray-500">{DOC_TYPES.find(t => t.value === (result.doc_type || docType))?.label} · {result.period_covered || 'Period N/A'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${QUALITY_COLORS[result.data_quality] || 'text-gray-600 bg-gray-100'}`}>
                      {result.data_quality?.toUpperCase() || 'N/A'} QUALITY
                    </span>
                    <span className="text-xs text-gray-400">Confidence: {result.confidence || 0}%</span>
                  </div>
                </div>

                {/* Key outputs */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-blue-600 mb-1">Normalized EBITDA</p>
                    <p className="text-xl font-bold text-blue-900">{fmt(result.normalized_ebitda)}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-green-600 mb-1">SDE</p>
                    <p className="text-xl font-bold text-green-900">{fmt(result.sde)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500 mb-1">Gross Revenue</p>
                    <p className="text-xl font-bold text-gray-900">{fmt(result.extracted_financials?.gross_revenue)}</p>
                  </div>
                </div>
              </div>

              {/* Extracted financials */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Extracted Financials</h3>
                <div className="space-y-1">
                  {Object.entries(result.extracted_financials || {}).map(([key, value]) => (
                    value != null && (
                      <div key={key} className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
                        <span className="text-sm text-gray-600 capitalize">{key.replace(/_/g, ' ')}</span>
                        <span className="text-sm font-semibold text-gray-900">{typeof value === 'number' ? formatCurrency(value) : String(value)}</span>
                      </div>
                    )
                  ))}
                </div>
              </div>

              {/* Addbacks */}
              {result.addbacks?.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">EBITDA Addbacks</h3>
                  <div className="space-y-2">
                    {result.addbacks.map((ab: any, i: number) => (
                      <div key={i} className="flex justify-between items-start py-2 border-b border-gray-50 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-gray-800">{ab.item}</p>
                          <p className="text-xs text-gray-400">{ab.justification}</p>
                        </div>
                        <span className="text-sm font-semibold text-green-700 shrink-0 ml-3">+{formatCurrency(ab.amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center pt-2 font-semibold">
                      <span className="text-sm text-gray-800">Total Addbacks</span>
                      <span className="text-sm text-green-700">+{formatCurrency(result.addbacks.reduce((s: number, a: any) => s + (a.amount || 0), 0))}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Flags */}
              {result.flags?.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-yellow-800 mb-2 flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" /> Document Flags
                  </p>
                  {result.flags.map((f: string, i: number) => (
                    <p key={i} className="text-sm text-yellow-700 flex gap-2 mb-1"><span className="shrink-0">•</span>{f}</p>
                  ))}
                </div>
              )}

              {/* Verification needed */}
              {result.verification_needed?.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-blue-800 mb-2 flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" /> Lender Verification Required
                  </p>
                  {result.verification_needed.map((v: string, i: number) => (
                    <p key={i} className="text-sm text-blue-700 flex gap-2 mb-1"><span className="shrink-0">□</span>{v}</p>
                  ))}
                </div>
              )}

              <button onClick={normalize} className="btn btn-secondary text-sm inline-flex items-center">
                <RefreshCw className="h-4 w-4 mr-2" /> Re-analyze
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
