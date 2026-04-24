'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, ArrowRight, Building2, Brain, Target, FileText, DollarSign, Users, Shield, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Step = 'welcome' | 'role_setup' | 'first_action' | 'complete';

const LENDER_STEPS = [
  { icon: <Target className="h-6 w-6 text-blue-600" />, title: 'Set Your Lending Appetite', desc: 'Tell us what deals you want to see — industries, loan sizes, geography.', action: 'Set Preferences', href: '/dashboard/appetite' },
  { icon: <Brain className="h-6 w-6 text-purple-600" />, title: 'Run Your First AI Underwrite', desc: 'Score a deal with 62 variables calibrated to 1.6M SBA loans.', action: 'Open AI Underwriter', href: '/dashboard/ai-agent' },
  { icon: <FileText className="h-6 w-6 text-green-600" />, title: 'Browse Matched Deals', desc: 'See acquisition deals matched to your lending criteria.', action: 'View Matches', href: '/dashboard/matches' },
];

const BORROWER_STEPS = [
  { icon: <DollarSign className="h-6 w-6 text-green-600" />, title: 'Get Your Business Valued', desc: 'Understand what your business is worth with a 5-method AI valuation.', action: 'Get Valuation', href: '/dashboard/get-valuation' },
  { icon: <Target className="h-6 w-6 text-blue-600" />, title: 'Check Your Loan Health', desc: 'See your health score, DSCR, and AI-generated improvement playbooks.', action: 'View Dashboard', href: '/dashboard/loan-health' },
  { icon: <Building2 className="h-6 w-6 text-purple-600" />, title: 'Explore Your Business Value', desc: 'See what your business is worth today and how to grow it.', action: 'View Business Value', href: '/dashboard/business-value' },
];

const ADMIN_STEPS = [
  { icon: <Users className="h-6 w-6 text-blue-600" />, title: 'Review Users', desc: 'View all borrowers, lenders, and employees on the platform.', action: 'View Users', href: '/dashboard/users' },
  { icon: <Building2 className="h-6 w-6 text-green-600" />, title: 'Browse Asset Marketplace', desc: 'Review owner-submitted assets and propose leasebacks.', action: 'Asset Marketplace', href: '/dashboard/leaseback-admin' },
  { icon: <Brain className="h-6 w-6 text-purple-600" />, title: 'Run AI Agent', desc: 'Score any deal with the full 62-variable underwriting engine.', action: 'Open AI Agent', href: '/dashboard/ai-agent' },
];

const PLATFORM_FEATURES = [
  { icon: '🏦', label: 'SBA 7(a) Underwriting', desc: '62-variable AI scoring' },
  { icon: '📊', label: 'Business Valuation', desc: '5-method valuation engine' },
  { icon: '📋', label: 'SBA Compliance', desc: 'Eligibility, 1502, audits' },
  { icon: '📈', label: 'Portfolio Servicing', desc: 'Covenants, reviews, alerts' },
  { icon: '💡', label: 'Value Growth Plans', desc: 'AI equity growth advisor' },
  { icon: '🏷️', label: 'Asset Marketplace', desc: 'Leaseback financing' },
];

export default function OnboardingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const [completedActions, setCompletedActions] = useState<Set<number>>(new Set());

  const role = user?.role || 'borrower';
  const isLender = ['lender', 'loan_officer', 'credit_committee'].includes(role);
  const isAdmin = role === 'admin';

  const steps = isAdmin ? ADMIN_STEPS : isLender ? LENDER_STEPS : BORROWER_STEPS;

  const markDone = (i: number) => setCompletedActions(prev => new Set([...prev, i]));

  const completeOnboarding = () => {
    localStorage.setItem('heradyne_onboarded', 'true');
    router.push('/dashboard');
  };

  if (step === 'welcome') return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-blue-600 bg-opacity-20 border border-blue-500 border-opacity-30 rounded-full px-4 py-1.5 mb-6">
            <span className="text-blue-300 text-sm font-medium">Welcome to Heradyne</span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">
            {isAdmin ? 'Admin Dashboard' : isLender ? 'Your SBA Lending Platform' : 'Your Business Command Center'}
          </h1>
          <p className="text-slate-300 text-lg">
            {isAdmin ? 'Manage the platform, review assets, and oversee all deals.' :
             isLender ? 'AI-powered SBA underwriting, compliance, and portfolio management — all in one place.' :
             'Understand your business value, manage your loan, and grow your equity.'}
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
          {(PLATFORM_FEATURES || []).filter((_, i) => isAdmin || isLender ? true : [0, 1, 2, 3, 4, 5].includes(i)).map(f => (
            <div key={f.label} className="bg-white bg-opacity-5 border border-white border-opacity-10 rounded-xl p-4 text-center">
              <p className="text-2xl mb-1">{f.icon}</p>
              <p className="text-sm font-semibold text-white">{f.label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="bg-amber-900 bg-opacity-40 border border-amber-600 border-opacity-40 rounded-xl p-4 mb-6">
          <p className="text-xs text-amber-300 leading-relaxed">
            <strong>Informational Platform Only:</strong> Heradyne provides AI-powered analysis and workflow tools. All outputs are for informational purposes only and do not constitute financial, legal, or investment advice. Always consult qualified professionals before making financial decisions.
          </p>
        </div>

        <button onClick={() => setStep('role_setup')}
          className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 transition-colors">
          Get Started <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );

  if (step === 'role_setup') return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <p className="text-sm text-blue-600 font-medium uppercase tracking-wide mb-2">Quick Setup</p>
          <h2 className="text-2xl font-bold text-gray-900">3 things to get you started</h2>
          <p className="text-gray-500 mt-1 text-sm">These will make immediate sense of your dashboard</p>
        </div>

        <div className="space-y-4 mb-8">
          {(steps || []).map((s, i) => {
            const done = completedActions.has(i);
            return (
              <div key={i} className={`bg-white rounded-2xl border p-5 transition-all ${done ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${done ? 'bg-green-100' : 'bg-gray-100'}`}>
                    {done ? <CheckCircle className="h-6 w-6 text-green-600" /> : s.icon}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{s.title}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{s.desc}</p>
                  </div>
                  <button
                    onClick={() => { markDone(i); router.push(s.href); }}
                    className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1 ${
                      done ? 'bg-green-100 text-green-700' : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}>
                    {done ? '✓ Done' : s.action} {!done && <ChevronRight className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-3">
          <button onClick={completeOnboarding} className="flex-1 py-3 rounded-xl bg-gray-900 text-white font-semibold hover:bg-gray-800 transition-colors">
            Go to Dashboard
          </button>
          {completedActions.size > 0 && (
            <button onClick={completeOnboarding} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
              Finish Setup <ArrowRight className="h-5 w-5" />
            </button>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          You can access all features anytime from the navigation menu
        </p>
      </div>
    </div>
  );

  return null;
}