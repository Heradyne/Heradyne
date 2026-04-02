'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Shield, ArrowRight, ArrowLeft, Lock, CheckCircle, Loader } from 'lucide-react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const TIERS = {
  valuation: { name: 'Instant Valuation', price: 99 },
  diligence:  { name: 'Full Diligence Package', price: 399 },
};

const INDUSTRIES = [
  'plumbing', 'hvac', 'electrical', 'roofing', 'landscaping', 'cleaning',
  'auto_repair', 'restaurant', 'retail', 'healthcare', 'manufacturing',
  'technology', 'construction', 'transportation', 'childcare', 'fitness', 'other',
];

function GetStartedContent() {
  const router = useRouter();
  const params = useSearchParams();
  const tier = (params.get('tier') || 'valuation') as keyof typeof TIERS;
  const tierInfo = TIERS[tier] || TIERS.valuation;

  const [step, setStep] = useState<'deal' | 'account' | 'payment' | 'processing' | 'done'>('deal');
  const [error, setError] = useState('');

  // Deal info
  const [deal, setDeal] = useState({
    business_name: '',
    industry: 'plumbing',
    annual_revenue: '',
    ebitda: '',
    asking_price: '',
    loan_amount: '',
    equity_injection: '',
    owner_credit_score: '',
    business_age_years: '',
    description: '',
  });

  // Account info
  const [account, setAccount] = useState({
    full_name: '',
    email: '',
    password: '',
    company: '',
  });

  // Payment (simulated)
  const [payment, setPayment] = useState({
    card_number: '4242 4242 4242 4242',
    expiry: '12/26',
    cvv: '123',
    name: '',
  });

  const [token, setToken] = useState<string | null>(null);
  const [dealId, setDealId] = useState<number | null>(null);

  useEffect(() => {
    // Check if already logged in
    const t = localStorage.getItem('token');
    if (t) {
      setToken(t);
      setStep('deal');
    }
  }, []);

  const updateDeal = (k: string, v: string) => setDeal(prev => ({ ...prev, [k]: v }));
  const updateAccount = (k: string, v: string) => setAccount(prev => ({ ...prev, [k]: v }));
  const updatePayment = (k: string, v: string) => setPayment(prev => ({ ...prev, [k]: v }));

  const submitDeal = async () => {
    setError('');
    if (!deal.business_name || !deal.annual_revenue || !deal.ebitda || !deal.asking_price) {
      setError('Please fill in all required fields.');
      return;
    }
    if (!token) {
      setStep('account');
      return;
    }
    setStep('payment');
  };

  const createAccount = async () => {
    setError('');
    if (!account.full_name || !account.email || !account.password) {
      setError('Please fill in all required fields.');
      return;
    }
    try {
      const res = await fetch(`${API}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: account.email,
          password: account.password,
          full_name: account.full_name,
          company_name: account.company,
          role: 'borrower',
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.detail || 'Registration failed');
        return;
      }
      // Login
      const loginRes = await fetch(`${API}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: account.email, password: account.password }),
      });
      if (!loginRes.ok) { setError('Login after registration failed'); return; }
      const loginData = await loginRes.json();
      localStorage.setItem('token', loginData.access_token);
      setToken(loginData.access_token);
      setStep('payment');
    } catch (e) {
      setError('Connection error. Please try again.');
    }
  };

  const processPayment = async () => {
    setError('');
    setStep('processing');

    try {
      // Create the deal
      const dealRes = await fetch(`${API}/api/v1/deals/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: `${deal.business_name} — Acquisition`,
          deal_type: 'acquisition',
          industry: deal.industry,
          business_description: deal.description || `${deal.business_name} acquisition opportunity.`,
          loan_amount_requested: parseFloat(deal.loan_amount) || parseFloat(deal.asking_price) * 0.8,
          loan_term_months: 120,
          annual_revenue: parseFloat(deal.annual_revenue),
          ebitda: parseFloat(deal.ebitda),
          purchase_price: parseFloat(deal.asking_price),
          equity_injection: parseFloat(deal.equity_injection) || parseFloat(deal.asking_price) * 0.1,
          owner_credit_score: parseInt(deal.owner_credit_score) || 700,
          owner_experience_years: parseInt(deal.business_age_years) || 5,
        }),
      });

      if (!dealRes.ok) {
        const err = await dealRes.json();
        setError(err.detail || 'Failed to create deal');
        setStep('payment');
        return;
      }

      const dealData = await dealRes.json();
      setDealId(dealData.id);

      // Submit for analysis
      await fetch(`${API}/api/v1/deals/${dealData.id}/submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      // Record pre-deal purchase (simulated)
      await fetch(`${API}/api/v1/predeal/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ deal_id: dealData.id, tier, amount: tierInfo.price }),
      }).catch(() => {}); // non-blocking if endpoint not ready

      setStep('done');
    } catch (e) {
      setError('Something went wrong. Please try again.');
      setStep('payment');
    }
  };

  const inputClass = "w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400";
  const labelClass = "block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/pre-deal" className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-blue-600" />
            <span className="font-bold text-gray-900">Heradyne</span>
          </Link>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Lock className="h-4 w-4" />
            Secure checkout
          </div>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Order summary */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-8 flex justify-between items-center">
          <div>
            <p className="font-semibold text-blue-900">{tierInfo.name}</p>
            <p className="text-sm text-blue-600">One-time payment · Instant delivery</p>
          </div>
          <p className="text-2xl font-bold text-blue-900">${tierInfo.price}</p>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {['deal', 'account', 'payment'].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                step === s ? 'bg-blue-600 text-white' :
                ['deal','account','payment','processing','done'].indexOf(step) > i ? 'bg-green-500 text-white' :
                'bg-gray-200 text-gray-500'
              }`}>
                {['deal','account','payment','processing','done'].indexOf(step) > i ? '✓' : i + 1}
              </div>
              <span className="text-xs text-gray-500 hidden sm:block">
                {s === 'deal' ? 'Deal Info' : s === 'account' ? 'Your Account' : 'Payment'}
              </span>
              {i < 2 && <div className="flex-1 h-px bg-gray-200 min-w-4"/>}
            </div>
          ))}
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-6">{error}</div>}

        {/* ── STEP 1: Deal Info ── */}
        {step === 'deal' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 space-y-5">
            <h2 className="text-lg font-bold text-gray-900">Tell us about the business</h2>

            <div>
              <label className={labelClass}>Business Name *</label>
              <input className={inputClass} placeholder="Acme Plumbing LLC" value={deal.business_name} onChange={e => updateDeal('business_name', e.target.value)}/>
            </div>

            <div>
              <label className={labelClass}>Industry *</label>
              <select className={inputClass} value={deal.industry} onChange={e => updateDeal('industry', e.target.value)}>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Annual Revenue *</label>
                <input className={inputClass} placeholder="$1,500,000" value={deal.annual_revenue} onChange={e => updateDeal('annual_revenue', e.target.value.replace(/[^0-9.]/g, ''))}/>
              </div>
              <div>
                <label className={labelClass}>EBITDA / SDE *</label>
                <input className={inputClass} placeholder="$350,000" value={deal.ebitda} onChange={e => updateDeal('ebitda', e.target.value.replace(/[^0-9.]/g, ''))}/>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Asking Price *</label>
                <input className={inputClass} placeholder="$1,200,000" value={deal.asking_price} onChange={e => updateDeal('asking_price', e.target.value.replace(/[^0-9.]/g, ''))}/>
              </div>
              <div>
                <label className={labelClass}>Loan Amount Needed</label>
                <input className={inputClass} placeholder="$960,000" value={deal.loan_amount} onChange={e => updateDeal('loan_amount', e.target.value.replace(/[^0-9.]/g, ''))}/>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Down Payment / Equity</label>
                <input className={inputClass} placeholder="$240,000" value={deal.equity_injection} onChange={e => updateDeal('equity_injection', e.target.value.replace(/[^0-9.]/g, ''))}/>
              </div>
              <div>
                <label className={labelClass}>Your Credit Score</label>
                <input className={inputClass} placeholder="720" value={deal.owner_credit_score} onChange={e => updateDeal('owner_credit_score', e.target.value.replace(/[^0-9]/g, ''))}/>
              </div>
            </div>

            <div>
              <label className={labelClass}>Business Age (years)</label>
              <input className={inputClass} placeholder="12" value={deal.business_age_years} onChange={e => updateDeal('business_age_years', e.target.value.replace(/[^0-9]/g, ''))}/>
            </div>

            <div>
              <label className={labelClass}>Brief Description (optional)</label>
              <textarea className={inputClass} rows={3} placeholder="What does the business do? Any key details about the acquisition..." value={deal.description} onChange={e => updateDeal('description', e.target.value)}/>
            </div>

            <button onClick={submitDeal} className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors">
              Continue <ArrowRight className="h-4 w-4"/>
            </button>
          </div>
        )}

        {/* ── STEP 2: Account ── */}
        {step === 'account' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 space-y-5">
            <div className="flex items-center gap-3 mb-2">
              <button onClick={() => setStep('deal')} className="text-gray-400 hover:text-gray-600"><ArrowLeft className="h-5 w-5"/></button>
              <h2 className="text-lg font-bold text-gray-900">Create your account</h2>
            </div>
            <p className="text-sm text-gray-500">Your report will be saved to your account. Already have one? <Link href="/login" className="text-blue-600 hover:underline">Sign in</Link></p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Full Name *</label>
                <input className={inputClass} placeholder="John Smith" value={account.full_name} onChange={e => updateAccount('full_name', e.target.value)}/>
              </div>
              <div>
                <label className={labelClass}>Company (optional)</label>
                <input className={inputClass} placeholder="Smith Acquisitions LLC" value={account.company} onChange={e => updateAccount('company', e.target.value)}/>
              </div>
            </div>

            <div>
              <label className={labelClass}>Email *</label>
              <input className={inputClass} type="email" placeholder="john@example.com" value={account.email} onChange={e => updateAccount('email', e.target.value)}/>
            </div>

            <div>
              <label className={labelClass}>Password *</label>
              <input className={inputClass} type="password" placeholder="Min 8 characters" value={account.password} onChange={e => updateAccount('password', e.target.value)}/>
            </div>

            <button onClick={createAccount} className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors">
              Create Account & Continue <ArrowRight className="h-4 w-4"/>
            </button>
          </div>
        )}

        {/* ── STEP 3: Payment ── */}
        {step === 'payment' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 space-y-5">
            <div className="flex items-center gap-3 mb-2">
              <button onClick={() => setStep(token ? 'deal' : 'account')} className="text-gray-400 hover:text-gray-600"><ArrowLeft className="h-5 w-5"/></button>
              <h2 className="text-lg font-bold text-gray-900">Payment</h2>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
              <p className="text-sm font-semibold text-yellow-800">Demo mode — no real charge</p>
              <p className="text-xs text-yellow-600 mt-0.5">Payment processing coming soon. Use the test card below to continue.</p>
            </div>

            <div>
              <label className={labelClass}>Cardholder Name</label>
              <input className={inputClass} placeholder="John Smith" value={payment.name} onChange={e => updatePayment('name', e.target.value)}/>
            </div>

            <div>
              <label className={labelClass}>Card Number</label>
              <input className={inputClass} value={payment.card_number} onChange={e => updatePayment('card_number', e.target.value)} maxLength={19}/>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Expiry</label>
                <input className={inputClass} value={payment.expiry} onChange={e => updatePayment('expiry', e.target.value)} maxLength={5}/>
              </div>
              <div>
                <label className={labelClass}>CVV</label>
                <input className={inputClass} value={payment.cvv} onChange={e => updatePayment('cvv', e.target.value)} maxLength={3}/>
              </div>
            </div>

            <button onClick={processPayment} className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-green-700 transition-colors">
              <Lock className="h-4 w-4"/>
              Pay ${tierInfo.price} — Get My Report
            </button>

            <p className="text-center text-xs text-gray-400">Your report will be available immediately after payment.</p>
          </div>
        )}

        {/* ── PROCESSING ── */}
        {step === 'processing' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <Loader className="h-12 w-12 text-blue-600 animate-spin mx-auto mb-4"/>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Running your analysis...</h2>
            <p className="text-sm text-gray-500">Valuing your business across 5 methods, running DSCR analysis, and checking SBA eligibility.</p>
          </div>
        )}

        {/* ── DONE ── */}
        {step === 'done' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <CheckCircle className="h-14 w-14 text-green-500 mx-auto mb-4"/>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Your report is ready!</h2>
            <p className="text-sm text-gray-500 mb-8">
              Your {tierInfo.name} has been completed. View it in your dashboard.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => {
                  if (dealId) router.push(`/dashboard/deals/${dealId}`);
                  else router.push('/dashboard/deals');
                }}
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
              >
                View My Report
              </button>
              <button onClick={() => router.push('/dashboard')} className="w-full border border-gray-200 text-gray-600 py-3 rounded-xl font-semibold hover:bg-gray-50 transition-colors">
                Go to Dashboard
              </button>
            </div>
            {tier === 'valuation' && (
              <div className="mt-8 p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
                <p className="text-sm font-semibold text-indigo-900 mb-1">Want the full diligence package?</p>
                <p className="text-xs text-indigo-600 mb-3">Get lender-ready documents, AI document checklist, and a shareable report for $399.</p>
                <button onClick={() => router.push('/get-started?tier=diligence')} className="text-sm font-semibold text-indigo-700 hover:text-indigo-900">
                  Upgrade to Full Package →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function GetStartedPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"/></div>}>
      <GetStartedContent />
    </Suspense>
  );
}
