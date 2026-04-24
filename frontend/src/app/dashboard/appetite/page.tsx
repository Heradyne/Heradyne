'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Settings, Eye, EyeOff, Save, RotateCcw, CheckCircle } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

// ── Lender appetite defaults ──────────────────────────────────────────────────
const LENDER_MODULES = [
  { id: 'matches',         label: 'Matched Deals',       desc: 'Deals that fit your appetite criteria' },
  { id: 'term-sheets',     label: 'Term Sheet Builder',  desc: 'Submit offers and structure loan terms' },
  { id: 'collateral',      label: 'Collateral & LTV',    desc: 'Asset detail, coverage ratios, NOLV' },
  { id: 'monitoring',      label: 'Portfolio Monitor',   desc: 'Funded loans, health scores, alerts' },
  { id: 'origination',     label: 'Origination Pipeline',desc: 'Loans in process, SBA submission status' },
  { id: 'sba-compliance',  label: 'SBA Compliance',      desc: 'SBA form checklist and eligibility' },
  { id: 'ai-agent',        label: 'AI Underwriter',      desc: 'AI-powered deal scoring and analysis' },
  { id: 'financials',      label: 'Financials',          desc: 'Fee ledger, premium income, P&L' },
  { id: 'secondary-market',label: 'Secondary Market',    desc: 'Loan sale and participation tools' },
  { id: 'signatures',      label: 'Signatures',          desc: 'Document signing workflow' },
];

const LENDER_APPETITE_DEFAULTS = {
  min_loan: 250000,
  max_loan: 2000000,
  min_dscr: 1.25,
  max_ltv: 80,
  min_credit: 680,
  min_business_age: 2,
  industries: ['plumbing', 'hvac', 'electrical', 'construction', 'healthcare', 'manufacturing'],
  states: [],
  sba_only: false,
  require_collateral: true,
  deal_types: ['acquisition', 'expansion'],
};

// ── Insurer appetite defaults ─────────────────────────────────────────────────
const INSURER_MODULES = [
  { id: 'matches',          label: 'Deal Pipeline',        desc: 'Deals submitted for coverage review' },
  { id: 'actuarial-pricing',label: 'Actuarial Pricing',    desc: 'PD, LGD, pure premium, indicated rate' },
  { id: 'portfolio-exposure',label: 'Portfolio Exposure',  desc: 'Concentration by industry, geo, vintage' },
  { id: 'coverage-conditions',label: 'Coverage & Conditions', desc: 'Set coverage %, exclusions, conditions' },
  { id: 'monitoring',       label: 'Claims & Monitoring',  desc: 'Early warnings, loss projections, alerts' },
  { id: 'ai-agent',         label: 'AI Actuary Advisor',   desc: 'AI-powered risk pricing and analysis' },
  { id: 'financials',       label: 'Financials',           desc: 'Premium income, loss ratio, P&L' },
  { id: 'secondary-market', label: 'Reinsurance',          desc: 'Ceded exposure, treaty management' },
  { id: 'signatures',       label: 'Signatures',           desc: 'Policy document signing workflow' },
];

const INSURER_APPETITE_DEFAULTS = {
  min_loan: 100000,
  max_loan: 5000000,
  min_dscr: 1.20,
  max_coverage_pct: 90,
  min_coverage_pct: 50,
  min_equity_injection: 10,
  industries: ['plumbing', 'hvac', 'electrical', 'healthcare', 'manufacturing'],
  excluded_industries: ['restaurant', 'fitness'],
  max_pd: 0.08,
  target_loss_ratio: 0.60,
  require_sba_guarantee: true,
  states: [],
};

const ALL_INDUSTRIES = [
  'plumbing','hvac','electrical','roofing','landscaping','cleaning',
  'auto_repair','restaurant','retail','healthcare','manufacturing',
  'technology','construction','transportation','childcare','fitness','other',
];

export default function AppetitePage() {
  const { user } = useAuth();
  const role = user?.role || 'lender';
  const isLender = role === 'lender' || role === 'loan_officer' || role === 'credit_committee';
  const isInsurer = role === 'insurer';

  const modules = isLender ? LENDER_MODULES : INSURER_MODULES;
  const defaultAppetite = isLender ? LENDER_APPETITE_DEFAULTS : INSURER_APPETITE_DEFAULTS;

  const [visibleModules, setVisibleModules] = useState<string[]>(() => {
    if (typeof window === 'undefined') return modules.map(m => m.id);
    const saved = localStorage.getItem(`heradyne_modules_${role}`);
    return saved ? JSON.parse(saved) : modules.map(m => m.id);
  });

  const [appetite, setAppetite] = useState<any>(() => {
    if (typeof window === 'undefined') return defaultAppetite;
    const saved = localStorage.getItem(`heradyne_appetite_${role}`);
    return saved ? JSON.parse(saved) : defaultAppetite;
  });

  const [saved, setSaved] = useState(false);

  const toggleModule = (id: string) => {
    setVisibleModules(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const toggleIndustry = (industry: string) => {
    const key = isInsurer ? 'excluded_industries' : 'industries';
    setAppetite((prev: any) => {
      const list: string[] = prev[key] || [];
      return {
        ...prev,
        [key]: list.includes(industry)
          ? list.filter((i: string) => i !== industry)
          : [...list, industry],
      };
    });
  };

  const saveSettings = () => {
    localStorage.setItem(`heradyne_modules_${role}`, JSON.stringify(visibleModules));
    localStorage.setItem(`heradyne_appetite_${role}`, JSON.stringify(appetite));
    // Dispatch event so sidebar reacts immediately
    window.dispatchEvent(new Event('appetite-updated'));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const resetDefaults = () => {
    setVisibleModules(modules.map(m => m.id));
    setAppetite(defaultAppetite);
  };

  const upd = (k: string, v: any) => setAppetite((prev: any) => ({ ...prev, [k]: v }));

  const inputClass = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400";
  const labelClass = "block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1";

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isLender ? 'Lender Preferences' : 'Insurer Preferences'}
          </h1>
          <p className="text-gray-500 mt-1">
            Customize your dashboard and set your {isLender ? 'lending' : 'underwriting'} appetite.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={resetDefaults} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            <RotateCcw className="h-4 w-4"/> Reset
          </button>
          <button onClick={saveSettings} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">
            {saved ? <CheckCircle className="h-4 w-4"/> : <Save className="h-4 w-4"/>}
            {saved ? 'Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Module visibility */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-lg font-semibold mb-1">Dashboard Modules</h2>
        <p className="text-sm text-gray-500 mb-5">
          Toggle which sections appear in your sidebar. Hidden sections can always be re-enabled here.
        </p>
        <div className="space-y-2">
          {modules.map(mod => (
            <div key={mod.id} className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${visibleModules.includes(mod.id) ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
              <div>
                <p className={`text-sm font-semibold ${visibleModules.includes(mod.id) ? 'text-blue-900' : 'text-gray-500'}`}>
                  {mod.label}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{mod.desc}</p>
              </div>
              <button onClick={() => toggleModule(mod.id)} className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${visibleModules.includes(mod.id) ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'}`}>
                {visibleModules.includes(mod.id) ? <><Eye className="h-3 w-3"/> Visible</> : <><EyeOff className="h-3 w-3"/> Hidden</>}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Lender appetite */}
      {isLender && (
        <div className="bg-white rounded-xl border p-6 space-y-5">
          <h2 className="text-lg font-semibold">Lending Appetite</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Min Loan Amount</label>
              <input type="number" className={inputClass} value={appetite.min_loan} onChange={e => upd('min_loan', +e.target.value)}/>
              <p className="text-xs text-gray-400 mt-1">{fmt(appetite.min_loan)}</p>
            </div>
            <div>
              <label className={labelClass}>Max Loan Amount</label>
              <input type="number" className={inputClass} value={appetite.max_loan} onChange={e => upd('max_loan', +e.target.value)}/>
              <p className="text-xs text-gray-400 mt-1">{fmt(appetite.max_loan)}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Min DSCR</label>
              <input type="number" step="0.05" className={inputClass} value={appetite.min_dscr} onChange={e => upd('min_dscr', +e.target.value)}/>
              <p className="text-xs text-gray-400 mt-1">{appetite.min_dscr}x floor</p>
            </div>
            <div>
              <label className={labelClass}>Max LTV (%)</label>
              <input type="number" className={inputClass} value={appetite.max_ltv} onChange={e => upd('max_ltv', +e.target.value)}/>
              <p className="text-xs text-gray-400 mt-1">{appetite.max_ltv}% cap</p>
            </div>
            <div>
              <label className={labelClass}>Min Credit Score</label>
              <input type="number" className={inputClass} value={appetite.min_credit} onChange={e => upd('min_credit', +e.target.value)}/>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Min Business Age (years)</label>
              <input type="number" className={inputClass} value={appetite.min_business_age} onChange={e => upd('min_business_age', +e.target.value)}/>
            </div>
            <div className="flex flex-col gap-3 pt-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded" checked={appetite.sba_only} onChange={e => upd('sba_only', e.target.checked)}/>
                <span className="text-sm text-gray-700">SBA 7(a) only</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded" checked={appetite.require_collateral} onChange={e => upd('require_collateral', e.target.checked)}/>
                <span className="text-sm text-gray-700">Require collateral</span>
              </label>
            </div>
          </div>

          <div>
            <label className={labelClass}>Industries I lend in</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {ALL_INDUSTRIES.map(ind => (
                <button key={ind} onClick={() => toggleIndustry(ind)}
                  className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${(appetite.industries || []).includes(ind) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                  {ind.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelClass}>Deal Types</label>
            <div className="flex gap-2 mt-2">
              {['acquisition','expansion','refinance','working_capital'].map(dt => (
                <button key={dt} onClick={() => {
                  const list = appetite.deal_types || [];
                  upd('deal_types', list.includes(dt) ? list.filter((d: string) => d !== dt) : [...list, dt]);
                }}
                  className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${(appetite.deal_types || []).includes(dt) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                  {dt.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Insurer appetite */}
      {isInsurer && (
        <div className="bg-white rounded-xl border p-6 space-y-5">
          <h2 className="text-lg font-semibold">Underwriting Appetite</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Min Insured Loan</label>
              <input type="number" className={inputClass} value={appetite.min_loan} onChange={e => upd('min_loan', +e.target.value)}/>
              <p className="text-xs text-gray-400 mt-1">{fmt(appetite.min_loan)}</p>
            </div>
            <div>
              <label className={labelClass}>Max Insured Loan</label>
              <input type="number" className={inputClass} value={appetite.max_loan} onChange={e => upd('max_loan', +e.target.value)}/>
              <p className="text-xs text-gray-400 mt-1">{fmt(appetite.max_loan)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Coverage Range (%)</label>
              <div className="flex gap-2 items-center">
                <input type="number" className={inputClass} placeholder="Min" value={appetite.min_coverage_pct} onChange={e => upd('min_coverage_pct', +e.target.value)}/>
                <span className="text-gray-400 text-sm shrink-0">to</span>
                <input type="number" className={inputClass} placeholder="Max" value={appetite.max_coverage_pct} onChange={e => upd('max_coverage_pct', +e.target.value)}/>
              </div>
              <p className="text-xs text-gray-400 mt-1">{appetite.min_coverage_pct}%–{appetite.max_coverage_pct}% coverage window</p>
            </div>
            <div>
              <label className={labelClass}>Min DSCR at Origination</label>
              <input type="number" step="0.05" className={inputClass} value={appetite.min_dscr} onChange={e => upd('min_dscr', +e.target.value)}/>
              <p className="text-xs text-gray-400 mt-1">{appetite.min_dscr}x minimum</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Max PD Accepted</label>
              <input type="number" step="0.005" className={inputClass} value={appetite.max_pd} onChange={e => upd('max_pd', +e.target.value)}/>
              <p className="text-xs text-gray-400 mt-1">{(appetite.max_pd * 100).toFixed(1)}% max default rate</p>
            </div>
            <div>
              <label className={labelClass}>Target Loss Ratio</label>
              <input type="number" step="0.01" className={inputClass} value={appetite.target_loss_ratio} onChange={e => upd('target_loss_ratio', +e.target.value)}/>
              <p className="text-xs text-gray-400 mt-1">{(appetite.target_loss_ratio * 100).toFixed(0)}% target</p>
            </div>
            <div>
              <label className={labelClass}>Min Equity Injection (%)</label>
              <input type="number" className={inputClass} value={appetite.min_equity_injection} onChange={e => upd('min_equity_injection', +e.target.value)}/>
              <p className="text-xs text-gray-400 mt-1">{appetite.min_equity_injection}% minimum</p>
            </div>
          </div>

          <div>
            <label className={labelClass}>Excluded Industries (will not write coverage)</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {ALL_INDUSTRIES.map(ind => (
                <button key={ind} onClick={() => toggleIndustry(ind)}
                  className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${(appetite.excluded_industries || []).includes(ind) ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                  {ind.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">Red = excluded from coverage</p>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="rounded" checked={appetite.require_sba_guarantee} onChange={e => upd('require_sba_guarantee', e.target.checked)}/>
              <span className="text-sm text-gray-700">Require SBA guarantee on all policies</span>
            </label>
          </div>
        </div>
      )}

      <p className="text-center text-xs text-gray-400">
        Settings are saved locally. Push Save to apply changes to your sidebar and deal matching.
      </p>
    </div>
  );
}