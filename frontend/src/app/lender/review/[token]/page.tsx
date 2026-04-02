'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Shield, CheckCircle, Lock, ArrowRight, FileText, AlertTriangle, Brain } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

function LenderReviewContent() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [deal, setDeal] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [ndaStep, setNdaStep] = useState<'preview'|'nda'|'accepted'>('preview');
  const [form, setForm] = useState({ lender_name: '', lender_email: '', company: '' });
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (token) loadDeal(); }, [token]);

  const loadDeal = async () => {
    try {
      const res = await fetch(`${API}/api/v1/lender/review/${token}`);
      if (res.ok) setDeal(await res.json());
      else setError('This share link is invalid or has expired.');
    } catch { setError('Could not load deal. Please try again.'); }
    finally { setLoading(false); }
  };

  const acceptNda = async () => {
    if (!form.lender_name || !form.lender_email || !form.company) {
      setError('Please fill in all fields.');
      return;
    }
    setAccepting(true); setError('');
    try {
      const res = await fetch(`${API}/api/v1/lender/review/${token}/accept-nda`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...form }),
      });
      if (res.ok) {
        setNdaStep('accepted');
      } else {
        setError('Failed to accept NDA. Please try again.');
      }
    } catch { setError('Connection error. Please try again.'); }
    finally { setAccepting(false); }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"/>
    </div>
  );

  if (error && !deal) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center max-w-md mx-auto p-8">
        <AlertTriangle className="h-12 w-12 text-yellow-400 mx-auto mb-4"/>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Link Not Found</h2>
        <p className="text-gray-500">{error}</p>
      </div>
    </div>
  );

  const summary = deal?.ai_summary;
  const uw = deal?.uw_summary;
  const verdict = uw?.deal_verdict;
  const vColor = verdict==='buy'?'#15803d':verdict==='renegotiate'?'#ca8a04':'#dc2626';
  const vBg = verdict==='buy'?'bg-green-50 border-green-200':verdict==='renegotiate'?'bg-yellow-50 border-yellow-200':'bg-red-50 border-red-200';
  const vLabel = verdict==='buy'?'✓ Buy':verdict==='renegotiate'?'⚠ Renegotiate':'✗ Pass';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-7 w-7 text-blue-600"/>
            <span className="text-xl font-bold text-gray-900">Heradyne</span>
            <span className="text-sm text-gray-400 ml-2">Lender Review</span>
          </div>
          <div className="flex items-center gap-3">
            <a href="/login" className="text-sm text-gray-600 hover:text-gray-900">Sign in</a>
            <a href="/register" className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">Create Account</a>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">

        {/* Deal header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2.5 py-1 rounded-full">
              Confidential Diligence Package
            </span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{deal?.deal_name}</h1>
          <p className="text-gray-500 mt-1 capitalize">{deal?.industry} · {fmt(deal?.annual_revenue || 0)} revenue</p>
        </div>

        {/* Deal summary — visible to all */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {label:'Asking Price', value:fmt(deal?.asking_price||0)},
            {label:'Annual Revenue', value:fmt(deal?.annual_revenue||0)},
            {label:'EBITDA', value:fmt(deal?.ebitda||0)},
            {label:'Loan Requested', value:fmt(deal?.loan_amount||0)},
          ].map(m => (
            <div key={m.label} className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-400">{m.label}</p>
              <p className="font-bold text-gray-900 mt-0.5">{m.value}</p>
            </div>
          ))}
        </div>

        {/* UW scores */}
        {uw && (
          <div className="bg-white rounded-xl border p-6">
            <div className="flex items-center gap-2 mb-4">
              <Brain className="h-5 w-5 text-blue-600"/>
              <h2 className="text-lg font-semibold">UnderwriteOS Analysis</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className={`rounded-lg border p-3 ${vBg}`}>
                <p className="text-xs text-gray-500">Verdict</p>
                <p className="font-bold" style={{color:vColor}}>{vLabel}</p>
              </div>
              <div className={`rounded-lg border p-3 ${(uw.health_score||0)>=70?'bg-green-50 border-green-200':'bg-yellow-50 border-yellow-200'}`}>
                <p className="text-xs text-gray-500">Health Score</p>
                <p className={`font-bold ${(uw.health_score||0)>=70?'text-green-700':'text-yellow-700'}`}>{uw.health_score||'N/A'}/100</p>
              </div>
              <div className={`rounded-lg border p-3 ${(uw.dscr_base||0)>=1.25?'bg-green-50 border-green-200':'bg-red-50 border-red-200'}`}>
                <p className="text-xs text-gray-500">DSCR</p>
                <p className={`font-bold ${(uw.dscr_base||0)>=1.25?'text-green-700':'text-red-600'}`}>{uw.dscr_base?.toFixed(2)||'N/A'}x</p>
              </div>
              <div className={`rounded-lg border p-3 ${uw.sba_eligible?'bg-green-50 border-green-200':'bg-red-50 border-red-200'}`}>
                <p className="text-xs text-gray-500">SBA 7(a)</p>
                <p className={`font-bold ${uw.sba_eligible?'text-green-700':'text-red-600'}`}>{uw.sba_eligible?'✓ Eligible':'✗ Not Eligible'}</p>
              </div>
            </div>
          </div>
        )}

        {/* AI narrative — visible to all */}
        {summary?.lender_narrative && (
          <div className="bg-white rounded-xl border p-6">
            <h2 className="text-lg font-semibold mb-2">Underwriter Summary</h2>
            <p className="text-gray-700 leading-relaxed">{summary.lender_narrative}</p>
            <div className="mt-3 flex gap-4 text-xs text-gray-500">
              {summary.confidence_score && <span>Confidence: <strong className="text-gray-700">{summary.confidence_score}/100</strong></span>}
              {summary.sba_readiness_score && <span>SBA Readiness: <strong className="text-gray-700">{summary.sba_readiness_score}/100</strong></span>}
              {summary.verification_status && <span>Status: <strong className="text-gray-700 capitalize">{summary.verification_status.replace(/_/g,' ')}</strong></span>}
            </div>
          </div>
        )}

        {/* NDA gate for documents */}
        {ndaStep === 'preview' && (
          <div className="bg-white rounded-xl border-2 border-indigo-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                <Lock className="h-5 w-5 text-indigo-600"/>
              </div>
              <div>
                <h2 className="font-bold text-gray-900">Full Diligence Package</h2>
                <p className="text-sm text-gray-500">Accept NDA to view uploaded documents and detailed analysis</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <p className="text-xs font-bold uppercase text-gray-500 mb-2">What's included behind the NDA</p>
              <ul className="space-y-1.5">
                {['3 years of verified business tax returns','YTD P&L and balance sheet','Business debt schedule','Letter of intent / purchase agreement','AI-extracted financial verification','Full discrepancy analysis','Lender-ready PDF report'].map(item => (
                  <li key={item} className="flex gap-2 text-sm text-gray-700">
                    <FileText className="h-4 w-4 text-gray-400 shrink-0 mt-0.5"/>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <button onClick={() => setNdaStep('nda')} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors">
              Accept NDA & View Full Package <ArrowRight className="h-4 w-4"/>
            </button>
            <button onClick={() => setNdaStep('accepted')} className="w-full border-2 border-dashed border-gray-300 text-gray-500 py-3 rounded-xl font-semibold text-sm hover:border-gray-400 hover:text-gray-700 transition-colors mt-2">
              Skip — Demo mode (accept NDA instantly)
            </button>
          </div>
        )}

        {ndaStep === 'nda' && (
          <div className="bg-white rounded-xl border-2 border-indigo-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Non-Disclosure Agreement</h2>
            <p className="text-sm text-gray-500 mb-4">By entering your information and clicking accept, you agree to keep all documents and information in this diligence package strictly confidential, use them solely for evaluating this financing opportunity, and not share them with any third party without written consent from the borrower.</p>

            <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-600 mb-5 max-h-32 overflow-y-auto">
              <p className="font-semibold mb-2">CONFIDENTIALITY AGREEMENT</p>
              <p>This Non-Disclosure Agreement ("Agreement") is entered into by the undersigned lender ("Receiving Party") regarding the business acquisition opportunity presented herein. The Receiving Party agrees to: (1) hold all Confidential Information in strict confidence; (2) not disclose any Confidential Information to any third parties without prior written consent; (3) use Confidential Information solely for evaluating this specific financing opportunity; (4) promptly return or destroy all Confidential Information upon request. This Agreement shall be governed by applicable law. Violation may result in immediate termination of access and legal remedies.</p>
            </div>

            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">{error}</div>}

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Full Name *</label>
                <input className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400" placeholder="John Smith" value={form.lender_name} onChange={e => setForm(f => ({...f, lender_name: e.target.value}))}/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Business Email *</label>
                <input className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400" type="email" placeholder="john@bank.com" value={form.lender_email} onChange={e => setForm(f => ({...f, lender_email: e.target.value}))}/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Company / Institution *</label>
                <input className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400" placeholder="First National Bank" value={form.company} onChange={e => setForm(f => ({...f, company: e.target.value}))}/>
              </div>
            </div>

            <button onClick={acceptNda} disabled={accepting} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-indigo-700 disabled:opacity-60 transition-colors">
              {accepting ? 'Processing...' : 'I Accept — View Full Package'}
              <CheckCircle className="h-4 w-4"/>
            </button>
          </div>
        )}

        {ndaStep === 'accepted' && (
          <div className="bg-white rounded-xl border-2 border-green-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle className="h-8 w-8 text-green-500"/>
              <div>
                <h2 className="font-bold text-gray-900">NDA Accepted</h2>
                <p className="text-sm text-gray-500">You now have access to the full diligence package</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-5">
              Your acceptance has been recorded and shared with the borrower. To access all uploaded documents and submit a financing offer, create a lender account on Heradyne.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <a href="/register" className="bg-indigo-600 text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors text-center">
                Create Lender Account <ArrowRight className="h-4 w-4"/>
              </a>
              <a href="/login" className="border border-gray-200 text-gray-700 py-3 rounded-xl font-semibold text-sm flex items-center justify-center hover:bg-gray-50 transition-colors text-center">
                Sign In
              </a>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-gray-400">
          This diligence package was prepared using UnderwriteOS · Heradyne · Informational purposes only
        </p>
      </div>
    </div>
  );
}

export default function LenderReviewPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"/></div>}>
      <LenderReviewContent/>
    </Suspense>
  );
}
