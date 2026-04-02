'use client';

import { useEffect, useState, useRef } from 'react';
import { Upload, CheckCircle, AlertTriangle, XCircle, FileText, Loader, ChevronDown, ChevronUp, Download, Link } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

interface DiligenceUploadProps {
  dealId: string;
}

export default function DiligenceUpload({ dealId }: DiligenceUploadProps) {
  const [checklist, setChecklist] = useState<any[]>([]);
  const [checklistMeta, setChecklistMeta] = useState<any>({});
  const [results, setResults] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeDocType, setActiveDocType] = useState<string | null>(null);

  useEffect(() => {
    loadChecklist();
    loadResults();
  }, [dealId]);

  const loadChecklist = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/v1/deals/${dealId}/diligence/checklist`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setChecklist(data.checklist || []);
        setChecklistMeta(data);
      }
    } catch (e) { console.error(e); }
  };

  const loadResults = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/v1/deals/${dealId}/diligence/results`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'complete') setResults(data);
      }
    } catch (e) { console.error(e); }
  };

  const handleUploadClick = (docType: string) => {
    setActiveDocType(docType);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeDocType) return;
    e.target.value = '';

    setUploading(activeDocType);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(
        `${API}/api/v1/deals/${dealId}/documents?document_type=${activeDocType}`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData }
      );
      if (res.ok) {
        await loadChecklist();
      } else {
        const err = await res.json();
        setError(err.detail || 'Upload failed');
      }
    } catch (e) {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(null);
      setActiveDocType(null);
    }
  };

  const runAnalysis = async () => {
    setAnalyzing(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/v1/deals/${dealId}/diligence/analyze`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data);
        await loadChecklist();
      } else {
        const err = await res.json();
        setError(err.detail || 'Analysis failed');
      }
    } catch (e) {
      setError('Analysis failed. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  const requiredUploaded = checklistMeta.required_uploaded || 0;
  const requiredTotal = checklistMeta.required_total || 7;
  const readyToAnalyze = checklistMeta.ready_to_analyze || false;
  const analysis = results?.analysis || {};

  const severityColor = (s: string) =>
    s === 'material' ? 'text-red-600 bg-red-50 border-red-200' :
    s === 'moderate' ? 'text-yellow-700 bg-yellow-50 border-yellow-200' :
    'text-blue-700 bg-blue-50 border-blue-200';

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Document Diligence</h2>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${readyToAnalyze ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
            {requiredUploaded}/{requiredTotal} required docs
          </span>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Upload your SBA 7(a) documents. Claude will extract and verify the financials,
          flag any discrepancies against your stated numbers, and produce a lender-ready analysis.
        </p>

        {/* Progress bar */}
        <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
          <div
            className="h-2 rounded-full transition-all bg-blue-600"
            style={{ width: `${(requiredUploaded / requiredTotal) * 100}%` }}
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Checklist */}
        <div className="space-y-2">
          {checklist.map((item) => (
            <div key={item.type} className={`rounded-lg border p-3 flex items-center justify-between ${item.status === 'uploaded' ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
              <div className="flex items-center gap-3">
                {item.status === 'uploaded' ? (
                  <CheckCircle className="h-5 w-5 text-green-500 shrink-0"/>
                ) : (
                  <div className={`w-5 h-5 rounded border-2 shrink-0 ${item.required ? 'border-blue-400' : 'border-gray-300'}`}/>
                )}
                <div>
                  <p className={`text-sm font-medium ${item.status === 'uploaded' ? 'text-green-800' : 'text-gray-800'}`}>
                    {item.label}
                  </p>
                  {item.filename && (
                    <p className="text-xs text-gray-400 mt-0.5">{item.filename}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!item.required && (
                  <span className="text-xs text-gray-400">Optional</span>
                )}
                {uploading === item.type ? (
                  <Loader className="h-4 w-4 animate-spin text-blue-500"/>
                ) : (
                  <button
                    onClick={() => handleUploadClick(item.type)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      item.status === 'uploaded'
                        ? 'border border-gray-200 text-gray-500 hover:bg-gray-50'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {item.status === 'uploaded' ? 'Replace' : 'Upload'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Run Analysis button */}
        <div className="mt-5">
          {readyToAnalyze ? (
            <button
              onClick={runAnalysis}
              disabled={analyzing}
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {analyzing ? (
                <><Loader className="h-4 w-4 animate-spin"/>Analyzing documents... (1-2 minutes)</>
              ) : (
                <><FileText className="h-4 w-4"/>{results ? 'Re-run Analysis' : 'Run Full AI Analysis'}</>
              )}
            </button>
          ) : (
            <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-4 text-center">
              <p className="text-sm text-gray-500">
                Upload all {requiredTotal} required documents to run the full AI analysis.
                <span className="text-blue-600 font-semibold"> {requiredTotal - requiredUploaded} remaining.</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Analysis Results */}
      {results && analysis && (
        <div className="space-y-4">

          {/* Status banner */}
          <div className={`rounded-xl border-2 p-5 ${
            analysis.verification_status === 'verified' ? 'bg-green-50 border-green-300' :
            analysis.verification_status === 'discrepancies_found' ? 'bg-yellow-50 border-yellow-300' :
            'bg-gray-50 border-gray-300'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest mb-1 text-gray-500">Diligence Status</p>
                <p className={`text-2xl font-bold ${
                  analysis.verification_status === 'verified' ? 'text-green-700' :
                  analysis.verification_status === 'discrepancies_found' ? 'text-yellow-700' :
                  'text-gray-600'
                }`}>
                  {analysis.verification_status === 'verified' ? '✓ Financials Verified' :
                   analysis.verification_status === 'discrepancies_found' ? '⚠ Discrepancies Found' :
                   'Insufficient Documents'}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  Confidence: {analysis.confidence_score}/100 · SBA Readiness: {analysis.sba_readiness_score}/100
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">{results.documents_analyzed} docs analyzed</p>
                {results.analyzed_at && (
                  <p className="text-xs text-gray-400">{new Date(results.analyzed_at).toLocaleString()}</p>
                )}
              </div>
            </div>
          </div>

          {/* Lender narrative */}
          {analysis.lender_narrative && (
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-sm font-bold uppercase text-gray-500 mb-2">Lender-Ready Narrative</h3>
              <p className="text-gray-800 leading-relaxed">{analysis.lender_narrative}</p>
              {analysis.underwriter_notes && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs font-bold text-gray-400 uppercase mb-1">Underwriter Notes</p>
                  <p className="text-sm text-gray-600 italic">{analysis.underwriter_notes}</p>
                </div>
              )}
            </div>
          )}

          {/* Verified financials */}
          {analysis.verified_financials && (
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-sm font-bold uppercase text-gray-500 mb-3">Verified Financials</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Object.entries(analysis.verified_financials).map(([key, val]) => val !== null && (
                  <div key={key} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-400 capitalize">{key.replace(/_/g, ' ')}</p>
                    <p className="font-semibold text-gray-900">
                      {typeof val === 'number' ? fmt(val as number) : String(val)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Discrepancies */}
          {analysis.discrepancies?.length > 0 && (
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-sm font-bold uppercase text-gray-500 mb-3">
                Discrepancies ({analysis.discrepancies.length})
              </h3>
              <div className="space-y-3">
                {analysis.discrepancies.map((d: any, i: number) => (
                  <div key={i} className={`rounded-lg border p-4 ${severityColor(d.severity)}`}>
                    <div className="flex justify-between items-start mb-1">
                      <p className="font-semibold capitalize">{d.field?.replace(/_/g, ' ')}</p>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${severityColor(d.severity)}`}>
                        {d.severity}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                      <div>
                        <p className="text-xs text-gray-500">Stated</p>
                        <p className="font-medium">{d.stated_value !== null ? fmt(d.stated_value) : 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">From Documents</p>
                        <p className="font-medium">{d.extracted_value !== null ? fmt(d.extracted_value) : 'N/A'}</p>
                      </div>
                    </div>
                    {d.variance_pct && <p className="text-xs">{Math.abs(d.variance_pct).toFixed(1)}% variance</p>}
                    {d.explanation && <p className="text-xs text-gray-600 mt-1">{d.explanation}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-document findings */}
          {analysis.document_findings?.length > 0 && (
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-sm font-bold uppercase text-gray-500 mb-3">Document Findings</h3>
              <div className="space-y-3">
                {analysis.document_findings.map((f: any, i: number) => (
                  <div key={i} className="border border-gray-100 rounded-lg overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50"
                      onClick={() => setExpandedDoc(expandedDoc === f.document ? null : f.document)}
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-gray-400 shrink-0"/>
                        <span className="text-sm font-medium capitalize">{f.document?.replace(/_/g, ' ')}</span>
                      </div>
                      {expandedDoc === f.document ? <ChevronUp className="h-4 w-4 text-gray-400"/> : <ChevronDown className="h-4 w-4 text-gray-400"/>}
                    </button>
                    {expandedDoc === f.document && (
                      <div className="px-4 pb-4 space-y-2 border-t border-gray-100 pt-3">
                        {f.key_finding && <p className="text-sm text-gray-800"><strong>Key finding:</strong> {f.key_finding}</p>}
                        {f.concerns?.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-red-600 mb-1">Concerns</p>
                            {f.concerns.map((c: string, j: number) => <p key={j} className="text-xs text-red-700 flex gap-1"><AlertTriangle className="h-3 w-3 shrink-0 mt-0.5"/>{c}</p>)}
                          </div>
                        )}
                        {f.positive_signals?.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-green-600 mb-1">Positive Signals</p>
                            {f.positive_signals.map((s: string, j: number) => <p key={j} className="text-xs text-green-700 flex gap-1"><CheckCircle className="h-3 w-3 shrink-0 mt-0.5"/>{s}</p>)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Missing info */}
          {analysis.missing_information?.length > 0 && (
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-sm font-bold uppercase text-gray-500 mb-3">Missing Information</h3>
              <ul className="space-y-1">
                {analysis.missing_information.map((item: string, i: number) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-700">
                    <XCircle className="h-4 w-4 text-gray-400 shrink-0 mt-0.5"/>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Next steps */}
          {analysis.recommended_next_steps?.length > 0 && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
              <h3 className="text-sm font-bold uppercase text-indigo-700 mb-3">Recommended Next Steps</h3>
              <ol className="space-y-2">
                {analysis.recommended_next_steps.map((step: string, i: number) => (
                  <li key={i} className="flex gap-3 text-sm text-indigo-800">
                    <span className="w-5 h-5 rounded-full bg-indigo-200 text-indigo-800 flex items-center justify-center text-xs font-bold shrink-0">{i+1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Download PDF + Share Link */}
          <div className="bg-white rounded-xl border p-6">
            <h3 className="text-sm font-bold uppercase text-gray-500 mb-4">Export & Share</h3>
            <div className="grid grid-cols-2 gap-3">
              <a
                href={`${API}/api/v1/deals/${dealId}/diligence/report.pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-gray-900 text-white py-3 rounded-xl font-semibold text-sm hover:bg-gray-800 transition-colors"
              >
                <Download className="h-4 w-4"/>
                Download PDF Report
              </a>
              <button
                onClick={async () => {
                  const token = localStorage.getItem('token');
                  const res = await fetch(`${API}/api/v1/deals/${dealId}/diligence/share-link`, {
                    headers: { Authorization: `Bearer ${token}` }
                  });
                  if (res.ok) {
                    const data = await res.json();
                    const url = `${window.location.origin}/lender/review/${data.share_token}`;
                    navigator.clipboard.writeText(url);
                    alert('Lender link copied to clipboard!');
                  }
                }}
                className="flex items-center justify-center gap-2 border border-gray-200 text-gray-700 py-3 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors"
              >
                <Link className="h-4 w-4"/>
                Copy Lender Link
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-3 text-center">
              Lenders must accept an NDA before viewing uploaded documents. The AI summary is visible to all.
            </p>
          </div>

        </div>
      )}
    </div>
  );
}
