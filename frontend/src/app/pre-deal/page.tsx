'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, ArrowRight, Shield, TrendingUp, FileText, Brain, DollarSign, Lock } from 'lucide-react';
import Link from 'next/link';

const TIERS = [
  {
    id: 'valuation',
    name: 'Instant Valuation',
    price: 99,
    tagline: 'Know what your business is worth in minutes',
    turnaround: 'Instant',
    color: 'blue',
    features: [
      'Business health score (0–100)',
      'Deal verdict — Buy, Pass, or Renegotiate',
      '5-method valuation (SDE, EBITDA, DCF, Revenue, Asset)',
      'DSCR analysis with stress scenarios',
      'SBA 7(a) eligibility check',
      '2–3 key risk flags with plain-English explanations',
    ],
    cta: 'Get My Valuation',
    badge: null,
  },
  {
    id: 'diligence',
    name: 'Full Diligence Package',
    price: 399,
    tagline: 'Everything you need to walk into a lender',
    turnaround: 'Same day',
    color: 'indigo',
    features: [
      'Everything in Instant Valuation',
      'AI-driven document checklist (SBA 7(a) standards)',
      'Document upload portal',
      '18-month cash flow forecast',
      'Playbooks with named vendors + dollar amounts',
      'Shareable link for lenders',
      'Lender-ready PDF diligence report',
      'Borrower Q&A with AI advisor',
    ],
    cta: 'Get Full Package',
    badge: 'Most Popular',
  },
];

export default function PreDealPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);

  const handleSelect = (tierId: string) => {
    setSelected(tierId);
    // Store selection and redirect to get started
    if (typeof window !== 'undefined') {
      localStorage.setItem('predeal_tier', tierId);
    }
    router.push(`/get-started?tier=${tierId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-7 w-7 text-blue-600" />
            <span className="text-xl font-bold text-gray-900">Heradyne</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900">Sign in</Link>
            <Link href="/register" className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">Create account</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="max-w-4xl mx-auto px-6 pt-16 pb-12 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-full px-4 py-1.5 mb-6">
          <Brain className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium text-blue-700">SBA-calibrated AI underwriting</span>
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Know your deal before you talk to a lender
        </h1>
        <p className="text-xl text-gray-500 max-w-2xl mx-auto">
          Get an institutional-grade valuation and diligence package powered by the same 
          engines used by SBA lenders — in minutes, not weeks.
        </p>
      </div>

      {/* Tier cards */}
      <div className="max-w-4xl mx-auto px-6 pb-16">
        <div className="grid md:grid-cols-2 gap-6">
          {TIERS.map(tier => (
            <div key={tier.id} className={`relative bg-white rounded-2xl border-2 ${tier.id === 'diligence' ? 'border-indigo-500 shadow-lg shadow-indigo-100' : 'border-gray-200'} p-8`}>
              {tier.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="bg-indigo-600 text-white text-xs font-bold px-4 py-1.5 rounded-full">{tier.badge}</span>
                </div>
              )}
              
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-900 mb-1">{tier.name}</h2>
                <p className="text-gray-500 text-sm mb-4">{tier.tagline}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-gray-900">${tier.price}</span>
                  <span className="text-gray-400 text-sm">one-time</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">⚡ {tier.turnaround} delivery</p>
              </div>

              <ul className="space-y-3 mb-8">
                {(tier.features || []).map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <CheckCircle className={`h-4 w-4 shrink-0 mt-0.5 ${tier.id === 'diligence' ? 'text-indigo-500' : 'text-blue-500'}`} />
                    <span className="text-sm text-gray-700">{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSelect(tier.id)}
                className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors ${
                  tier.id === 'diligence'
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {tier.cta}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Trust signals */}
        <div className="mt-12 grid grid-cols-3 gap-6 text-center">
          {[
            { icon: Shield, text: 'SBA 7(a) calibrated', sub: '1.59M loan dataset' },
            { icon: Lock, text: 'Secure & confidential', sub: 'Your data stays private' },
            { icon: TrendingUp, text: 'Institutional grade', sub: 'Same engines lenders use' },
          ].map(({ icon: Icon, text, sub }) => (
            <div key={text} className="flex flex-col items-center gap-2">
              <Icon className="h-6 w-6 text-gray-400" />
              <p className="text-sm font-semibold text-gray-700">{text}</p>
              <p className="text-xs text-gray-400">{sub}</p>
            </div>
          ))}
        </div>

        {/* Disclaimer */}
        <p className="text-center text-xs text-gray-400 mt-8">
          Heradyne is an informational platform only. Reports are for decision support and do not constitute lending, 
          guarantee, insurance, or investment advice.
        </p>
      </div>
    </div>
  );
}