'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Shield, CheckCircle, XCircle, AlertTriangle, FileText, ChevronDown, ChevronUp, ExternalLink, RefreshCw, ClipboardList, BookOpen, FilePlus, Loader, Copy, Check } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

interface ComplianceCheck {
  id: string; name: string; category: string; status: string;
  requirement: string; finding: string; cfr_reference: string;
  sop_reference: string; is_hard_decline: boolean;
  documentation_required: string[]; lender_action_required: string | null;
}

interface Deal {
  id: number; name: string; loan_amount_requested: number; industry: string; status: string;
}

const SBA_FORMS: Record<string, string> = {
  form_1919: 'SBA Form 1919 — Borrower Information',
  form_1920: "SBA Form 1920 — Lender's Application",
  form_912: 'SBA Form 912 — Personal History',
  form_413: 'SBA Form 413 — Personal Financial Statement',
  form_4506t: 'IRS Form 4506-T — Tax Transcript Request',
  form_147: 'SBA Form 147 — Note',
  credit_memo: 'Credit Memorandum',
  equity_injection_cert: 'Equity Injection Certification',
  credit_elsewhere: 'Credit Elsewhere Certification',
};

const FIELD_STATUS_STYLE: Record<string, string> = {
  filled: 'text-green-700 bg-green-50 border-green-200',
  missing: 'text-red-700 bg-red-50 border-red-200',
  requires_borrower: 'text-blue-700 bg-blue-50 border-blue-200',
  requires_lender: 'text-purple-700 bg-purple-50 border-purple-200',
  requires_signature: 'text-yellow-700 bg-yellow-50 border-yellow-200',
};

const FIELD_STATUS_LABEL: Record<string, string> = {
  filled: '✓ Filled', missing: '✗ Missing',
  requires_borrower: 'Needs Borrower', requires_lender: 'Needs Lender',
  requires_signature: 'Signature Req.',
};

export default function SBACompliancePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<number | null>(null);
  const [complianceResult, setComplianceResult] = useState<any>(null);
  const [lenderChecklist, setLenderChecklist] = useState<any>(null);
  const [requirements, setRequirements] = useState<any>(null);
  const [checkLoading, setCheckLoading] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'eligibility' | 'checklist' | 'documents' | 'reference'>('eligibility');
  const [error, setError] = useState('');

  // Document draft state
  const [selectedForm, setSelectedForm] = useState('form_1919');
  const [draftLoading, setDraftLoading] = useState(false);
  const [draft, setDraft] = useState<any>(null);
  const [draftError, setDraftError] = useState('');
  const [fieldFilter, setFieldFilter] = useState<'all' | 'missing' | 'filled'>('all');
  const [copied, setCopied] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [dealsData, reqData] = await Promise.all([
        api.getDeals().catch(() => []),
        api.getSBARequirements().catch(() => null),
      ]);
      setDeals(dealsData.filter((d: Deal) => d.status !== 'draft'));
      setRequirements(reqData);
    } catch { setError('Failed to load data'); }
    finally { setLoading(false); }
  };

  const checkCompliance = async (dealId: number) => {
    setCheckLoading(true);
    setSelectedDeal(dealId);
    setDraft(null);
    setDraftError('');
    try {
      const [compliance, checklist] = await Promise.all([
        api.checkSBACompliance(dealId),
        api.getLenderChecklist(dealId).catch(() => null),
      ]);
      setComplianceResult(compliance);
      setLenderChecklist(checklist);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Compliance check failed');
    } finally { setCheckLoading(false); }
  };

  const generateDraft = async () => {
    if (!selectedDeal) return;
    setDraftLoading(true);
    setDraftError('');
    setDraft(null);
    try {
      const result = await api.draftSBAForm(selectedDeal, selectedForm);
      setDraft(result);
    } catch (e: any) {
      setDraftError(e.response?.data?.detail || 'Failed to generate draft. Check ANTHROPIC_API_KEY.');
    } finally { setDraftLoading(false); }
  };

  const copyDraft = () => {
    if (!draft) return;
    const lines = [
      `DRAFT: ${draft.form_name}`,
      `Deal: ${draft.deal_name} | Completion: ${draft.completion_pct}%`,
      '',
      '=== FIELDS ===',
      ...(draft.fields || []).map((f: any) =>
        `${f.field_label || f.field_name}: ${f.value ?? '[MISSING — ' + (f.missing_reason || 'Not provided') + ']'}`
      ),
      '',
      draft.draft_narrative ? `=== NARRATIVE ===\n${draft.draft_narrative}\n` : '',
      '=== MISSING REQUIRED FIELDS ===',
      ...(draft.missing_required_fields || []).map((f: string) => `• ${f}`),
      '',
      '=== BLOCKING ISSUES ===',
      ...(draft.blocking_issues || []).map((i: string) => `⚠ ${i}`),
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const statusIcon = (s: string) => {
    if (s === 'eligible') return <CheckCircle className="h-5 w-5 text-green-500" />;
    if (s === 'ineligible') return <XCircle className="h-5 w-5 text-red-500" />;
    if (s === 'requires_review') return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    return <FileText className="h-5 w-5 text-gray-400" />;
  };

  const statusCard = (s: string) => {
    if (s === 'eligible') return 'bg-green-100 text-green-800 border-green-200';
    if (s === 'ineligible') return 'bg-red-100 text-red-800 border-red-200';
    if (s === 'requires_review') return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const grouped = (checks: ComplianceCheck[]) =>
    checks.reduce((acc, c) => { (acc[c.category] = acc[c.category] || []).push(c); return acc; }, {} as Record<string, ComplianceCheck[]>);

  const catNames: Record<string, string> = {
    business_type: 'Business Type', size_standards: 'Size Standards', use_of_proceeds: 'Use of Proceeds',
    credit_elsewhere: 'Credit Elsewhere', ownership: 'Ownership', character: 'Character',
    collateral: 'Collateral', equity_injection: 'Equity Injection', repayment_ability: 'Repayment Ability',
    management: 'Management', franchise: 'Franchise', affiliate: 'Affiliates',
  };

  const visibleFields = (fields: any[]) => {
    if (fieldFilter === 'missing') return fields.filter(f => ['missing', 'requires_borrower', 'requires_lender'].includes(f.status));
    if (fieldFilter === 'filled') return fields.filter(f => f.status === 'filled');
    return fields;
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
    </div>
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <Shield className="h-8 w-8 mr-3 text-blue-600" /> SBA 7(a) Compliance
          </h1>
          <p className="text-gray-600">Eligibility verification, lender compliance tracking & AI document drafts</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6">
          {error}<button onClick={() => setError('')} className="float-right text-lg leading-none">×</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Deal selector */}
        <div className="lg:col-span-1">
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Select Deal</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {deals.length === 0 ? (
                <p className="text-sm text-gray-500">No deals available</p>
              ) : deals.map(deal => (
                <button key={deal.id} onClick={() => checkCompliance(deal.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedDeal === deal.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}>
                  <p className="font-medium text-sm">{deal.name}</p>
                  <p className="text-xs text-gray-500">{formatCurrency(deal.loan_amount_requested)} · {deal.industry}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main panel */}
        <div className="lg:col-span-3">
          {checkLoading ? (
            <div className="card flex items-center justify-center h-64">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
              <span className="ml-3">Checking SBA compliance...</span>
            </div>
          ) : complianceResult ? (
            <div className="space-y-4">
              {/* Status banner */}
              <div className={`card border-2 ${statusCard(complianceResult.overall_status)}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    {statusIcon(complianceResult.overall_status)}
                    <div className="ml-4">
                      <h2 className="text-xl font-bold">{complianceResult.deal_name}</h2>
                      <p className="text-sm capitalize">Status: <strong>{complianceResult.overall_status.replace(/_/g, ' ')}</strong></p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Max Eligible</p>
                    <p className="text-2xl font-bold">{formatCurrency(complianceResult.max_loan_amount)}</p>
                  </div>
                </div>

                {complianceResult.eligible_loan_types?.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm font-medium mb-2">Eligible Programs:</p>
                    <div className="flex flex-wrap gap-2">
                      {complianceResult.eligible_loan_types.map((t: string) => (
                        <span key={t} className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-4 gap-3">
                  {[
                    { label: 'Passed', val: complianceResult.passed_count, cls: 'text-green-600 bg-green-50' },
                    { label: 'Failed', val: complianceResult.failed_count, cls: 'text-red-600 bg-red-50' },
                    { label: 'Review', val: complianceResult.review_count, cls: 'text-yellow-600 bg-yellow-50' },
                    { label: 'Incomplete', val: complianceResult.incomplete_count, cls: 'text-gray-600 bg-gray-50' },
                  ].map(s => (
                    <div key={s.label} className={`text-center p-2 rounded ${s.cls}`}>
                      <p className="text-2xl font-bold">{s.val}</p>
                      <p className="text-xs">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {complianceResult.hard_declines?.length > 0 && (
                <div className="card border-2 border-red-300 bg-red-50">
                  <h3 className="font-semibold text-red-800 flex items-center mb-2">
                    <XCircle className="h-5 w-5 mr-2" /> Hard Decline Issues
                  </h3>
                  {complianceResult.hard_declines.map((d: string, i: number) => <p key={i} className="text-sm text-red-700">• {d}</p>)}
                </div>
              )}

              {/* Tabs */}
              <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-4">
                  {[
                    { id: 'eligibility', label: 'Eligibility', icon: <FileText className="h-4 w-4 inline mr-1" /> },
                    ...(lenderChecklist ? [{ id: 'checklist', label: 'Lender Checklist', icon: <ClipboardList className="h-4 w-4 inline mr-1" /> }] : []),
                    { id: 'documents', label: '📄 Document Drafts', icon: null },
                    { id: 'reference', label: 'Reference', icon: <BookOpen className="h-4 w-4 inline mr-1" /> },
                  ].map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                      className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                        activeTab === tab.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}>
                      {tab.icon}{tab.label}
                    </button>
                  ))}
                </nav>
              </div>

              {/* ── Eligibility ── */}
              {activeTab === 'eligibility' && (
                <div className="space-y-3">
                  {Object.entries(grouped(complianceResult.checks)).map(([cat, checks]) => (
                    <div key={cat} className="card">
                      <button onClick={() => toggleCategory(cat)} className="w-full flex items-center justify-between">
                        <div className="flex items-center">
                          <span className="font-semibold">{catNames[cat] || cat}</span>
                          <span className="ml-2 text-sm text-gray-500">({(checks as any[]).length})</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {(checks as any[]).map((c: ComplianceCheck) => <span key={c.id}>{statusIcon(c.status)}</span>)}
                          {expandedCategories.has(cat) ? <ChevronUp className="h-5 w-5 ml-1 text-gray-400" /> : <ChevronDown className="h-5 w-5 ml-1 text-gray-400" />}
                        </div>
                      </button>
                      {expandedCategories.has(cat) && (
                        <div className="mt-4 space-y-3">
                          {(checks as ComplianceCheck[]).map(c => (
                            <div key={c.id} className={`p-3 rounded-lg border ${statusCard(c.status)}`}>
                              <div className="flex items-start justify-between">
                                <div className="flex items-start">
                                  {statusIcon(c.status)}
                                  <div className="ml-3">
                                    <p className="font-medium">{c.name}</p>
                                    <p className="text-sm mt-1">{c.finding}</p>
                                    <p className="text-xs text-gray-500 mt-1">Requirement: {c.requirement}</p>
                                  </div>
                                </div>
                                <a href="https://www.ecfr.gov/current/title-13/chapter-I/part-120" target="_blank" rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:underline inline-flex items-center shrink-0 ml-2">
                                  {c.cfr_reference}<ExternalLink className="h-3 w-3 ml-1" />
                                </a>
                              </div>
                              {c.documentation_required?.length > 0 && (
                                <div className="mt-2 pt-2 border-t">
                                  <p className="text-xs font-medium">Documentation Required:</p>
                                  {c.documentation_required.map((d, i) => <p key={i} className="text-xs">• {d}</p>)}
                                </div>
                              )}
                              {c.lender_action_required && (
                                <div className="mt-2 p-2 bg-yellow-50 rounded text-xs">
                                  <strong>Lender Action:</strong> {c.lender_action_required}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {complianceResult.documentation_gaps?.length > 0 && (
                    <div className="card">
                      <h3 className="font-semibold mb-3 flex items-center">
                        <AlertTriangle className="h-5 w-5 mr-2 text-yellow-500" /> Documentation Gaps
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                        {complianceResult.documentation_gaps.map((d: string, i: number) => (
                          <div key={i} className="flex items-center p-2 bg-yellow-50 rounded text-sm">
                            <FileText className="h-4 w-4 mr-2 text-yellow-600 shrink-0" />{d}
                          </div>
                        ))}
                      </div>
                      <button onClick={() => setActiveTab('documents')}
                        className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                        <FilePlus className="h-4 w-4" /> Generate document drafts to address these gaps →
                      </button>
                    </div>
                  )}

                  {complianceResult.recommendations?.length > 0 && (
                    <div className="card">
                      <h3 className="font-semibold mb-3">Recommendations</h3>
                      {complianceResult.recommendations.map((r: string, i: number) => (
                        <p key={i} className="flex items-start text-sm mb-2">
                          <CheckCircle className="h-4 w-4 mr-2 mt-0.5 text-blue-500 shrink-0" />{r}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Checklist ── */}
              {activeTab === 'checklist' && lenderChecklist && (
                <div className="space-y-4">
                  {Object.entries(lenderChecklist.checklist).map(([section, items]: [string, any]) =>
                    items.length > 0 && (
                      <div key={section} className="card">
                        <h3 className="font-semibold capitalize mb-3">{section.replace(/_/g, ' ')}</h3>
                        <div className="space-y-2">
                          {items.map((item: any, i: number) => (
                            <label key={i} className="flex items-start gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer">
                              <input type="checkbox" checked={item.completed} onChange={() => {}}
                                className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600" />
                              <div>
                                <p className={`text-sm ${item.required ? 'font-medium' : ''}`}>{item.item}</p>
                                {item.required && <span className="text-xs text-red-600">Required</span>}
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}

              {/* ── Document Drafts ── */}
              {activeTab === 'documents' && (
                <div className="space-y-4">
                  {/* Gaps warning */}
                  {complianceResult.documentation_gaps?.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                      <p className="text-sm font-semibold text-yellow-800 flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4" />
                        {complianceResult.documentation_gaps.length} documentation gaps detected — these fields will be flagged as missing in any draft
                      </p>
                      <div className="grid grid-cols-2 gap-1">
                        {complianceResult.documentation_gaps.map((d: string, i: number) => (
                          <p key={i} className="text-xs text-yellow-700 flex gap-1"><span className="shrink-0">•</span>{d}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Form selector */}
                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <h3 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
                      <FilePlus className="h-5 w-5 text-blue-600" /> Generate AI Document Draft
                    </h3>
                    <p className="text-sm text-gray-500 mb-4">
                      Select a form to generate a pre-filled draft using deal data. Missing fields are flagged automatically.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
                      {Object.entries(SBA_FORMS).map(([key, label]) => (
                        <button key={key} onClick={() => { setSelectedForm(key); setDraft(null); setDraftError(''); }}
                          className={`text-left p-3 rounded-lg border text-sm transition-all ${
                            selectedForm === key
                              ? 'border-blue-500 bg-blue-50 text-blue-800 font-medium'
                              : 'border-gray-200 hover:border-gray-300 text-gray-700'
                          }`}>
                          <FileText className="h-4 w-4 inline mr-2 opacity-50" />{label}
                        </button>
                      ))}
                    </div>
                    <button onClick={generateDraft} disabled={draftLoading}
                      className="btn btn-primary inline-flex items-center">
                      {draftLoading
                        ? <><Loader className="h-4 w-4 mr-2 animate-spin" />Generating draft...</>
                        : <><FilePlus className="h-4 w-4 mr-2" />Generate Draft for {SBA_FORMS[selectedForm]}</>}
                    </button>
                    {draftError && (
                      <p className="mt-3 text-sm text-red-600 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0" />{draftError}
                      </p>
                    )}
                  </div>

                  {/* Draft output */}
                  {draftLoading && (
                    <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
                      <Loader className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
                      <p className="text-gray-600 font-medium">Generating {SBA_FORMS[selectedForm]}...</p>
                      <p className="text-gray-400 text-sm mt-1">Pre-filling all available fields and flagging gaps</p>
                    </div>
                  )}

                  {draft && !draftLoading && (
                    <div className="space-y-4">
                      {/* Draft header */}
                      <div className={`rounded-xl border-2 p-5 ${
                        draft.completion_pct >= 80 ? 'bg-green-50 border-green-300'
                        : draft.completion_pct >= 50 ? 'bg-yellow-50 border-yellow-300'
                        : 'bg-red-50 border-red-300'
                      }`}>
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="text-lg font-bold text-gray-900">{draft.form_name}</h3>
                            <p className="text-sm text-gray-600 mt-0.5">{draft.form_purpose}</p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 ml-4">
                            <div className="text-center">
                              <p className={`text-3xl font-bold ${draft.completion_pct >= 80 ? 'text-green-700' : draft.completion_pct >= 50 ? 'text-yellow-700' : 'text-red-700'}`}>
                                {draft.completion_pct}%
                              </p>
                              <p className="text-xs text-gray-500">Complete</p>
                            </div>
                            <button onClick={copyDraft} className="btn btn-secondary text-sm inline-flex items-center">
                              {copied ? <><Check className="h-4 w-4 mr-1 text-green-600" />Copied</> : <><Copy className="h-4 w-4 mr-1" />Copy</>}
                            </button>
                          </div>
                        </div>

                        {/* Blocking issues */}
                        {draft.blocking_issues?.length > 0 && (
                          <div className="bg-red-100 border border-red-300 rounded-lg p-3 mb-2">
                            <p className="text-xs font-bold text-red-800 uppercase mb-2">⛔ Blocking Issues — SBA Will Reject This Form</p>
                            {draft.blocking_issues.map((issue: string, i: number) => (
                              <p key={i} className="text-sm text-red-700 flex gap-2"><span className="shrink-0">•</span>{issue}</p>
                            ))}
                          </div>
                        )}

                        {/* Missing required fields */}
                        {draft.missing_required_fields?.length > 0 && (
                          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-2">
                            <p className="text-xs font-bold text-orange-800 uppercase mb-2">
                              ⚠ {draft.missing_required_fields.length} Required Fields Cannot Be Auto-Filled
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {draft.missing_required_fields.map((f: string, i: number) => (
                                <span key={i} className="text-xs bg-orange-100 border border-orange-200 text-orange-800 px-2 py-0.5 rounded-full">{f}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Warnings */}
                        {draft.warnings?.length > 0 && (
                          <div className="bg-yellow-100 border border-yellow-200 rounded-lg p-3">
                            <p className="text-xs font-bold text-yellow-800 uppercase mb-1">Compliance Warnings</p>
                            {draft.warnings.map((w: string, i: number) => (
                              <p key={i} className="text-sm text-yellow-800">• {w}</p>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Field browser */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-gray-800">
                            Form Fields ({(draft.fields || []).length} total)
                          </h3>
                          <div className="flex gap-1">
                            {(['all', 'missing', 'filled'] as const).map(f => (
                              <button key={f} onClick={() => setFieldFilter(f)}
                                className={`px-3 py-1 text-xs rounded-full font-medium ${
                                  fieldFilter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}>
                                {f === 'all' ? 'All' : f === 'missing'
                                  ? `Missing (${(draft.fields || []).filter((x: any) => ['missing','requires_borrower','requires_lender'].includes(x.status)).length})`
                                  : `Filled (${(draft.fields || []).filter((x: any) => x.status === 'filled').length})`}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-50">
                          {visibleFields(draft.fields || []).map((field: any, i: number) => (
                            <div key={i} className={`px-4 py-3 flex items-start gap-3 ${
                              field.status === 'missing' ? 'bg-red-50'
                              : ['requires_borrower','requires_lender'].includes(field.status) ? 'bg-blue-50'
                              : ''
                            }`}>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium border shrink-0 mt-0.5 whitespace-nowrap ${FIELD_STATUS_STYLE[field.status] || 'text-gray-600 bg-gray-100 border-gray-200'}`}>
                                {FIELD_STATUS_LABEL[field.status] || field.status}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-700">{field.field_label || field.field_name}</p>
                                {field.value != null ? (
                                  <p className="text-sm font-mono bg-white border border-gray-100 rounded px-2 py-1 mt-1 text-gray-900 break-words">{String(field.value)}</p>
                                ) : (
                                  <p className="text-sm text-red-600 italic mt-0.5">{field.missing_reason || 'Data not available in deal record'}</p>
                                )}
                                {field.source && (
                                  <p className="text-xs text-gray-400 mt-0.5">Source: {field.source.replace(/_/g, ' ')}</p>
                                )}
                              </div>
                            </div>
                          ))}
                          {visibleFields(draft.fields || []).length === 0 && (
                            <div className="px-4 py-8 text-center text-gray-400 text-sm">
                              No {fieldFilter === 'filled' ? 'filled' : 'missing'} fields to show
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Narrative */}
                      {draft.draft_narrative && (
                        <div className="bg-white border border-gray-200 rounded-xl p-5">
                          <h3 className="text-sm font-semibold text-gray-700 mb-3">Draft Narrative / Description Sections</h3>
                          <pre className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed font-mono bg-gray-50 rounded-lg p-4 overflow-x-auto">{draft.draft_narrative}</pre>
                        </div>
                      )}

                      {/* Next steps */}
                      {draft.next_steps?.length > 0 && (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                          <p className="text-sm font-semibold text-blue-800 mb-2">Steps to Complete This Draft</p>
                          <ol className="space-y-1">
                            {draft.next_steps.map((s: string, i: number) => (
                              <li key={i} className="text-sm text-blue-700 flex gap-2">
                                <span className="font-bold shrink-0">{i + 1}.</span>{s}
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}

                      <p className="text-xs text-gray-400 text-center">
                        AI-generated draft for reference only. Verify all fields before submission to SBA.
                        Missing fields must be collected from borrower or lender records.
                        Drafted {draft.drafted_at ? new Date(draft.drafted_at).toLocaleString() : 'just now'}.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Reference ── */}
              {activeTab === 'reference' && requirements && (
                <div className="space-y-4">
                  <div className="card">
                    <h3 className="font-semibold mb-3">Program Limits</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {Object.entries(requirements.program_limits).map(([p, lim]: [string, any]) => (
                        <div key={p} className="p-3 bg-gray-50 rounded-lg">
                          <p className="font-medium text-sm capitalize">{p.replace(/_/g, ' ')}</p>
                          <p className="text-xl font-bold">{formatCurrency(lim.max_amount)}</p>
                          {lim.sba_guarantee_pct && <p className="text-xs text-gray-500">{lim.sba_guarantee_pct * 100}% guarantee</p>}
                          {lim.turnaround && <p className="text-xs text-blue-600">{lim.turnaround}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="card">
                    <h3 className="font-semibold mb-3">Ineligible Businesses</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {requirements.ineligible_businesses.map((b: string, i: number) => (
                        <div key={i} className="flex items-center text-sm text-red-700">
                          <XCircle className="h-4 w-4 mr-2 shrink-0" />{b}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="card">
                    <h3 className="font-semibold mb-3">Required SBA Forms</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {requirements.required_forms.map((f: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <span className="font-medium text-sm">{f.form}</span>
                          <span className="text-xs text-gray-500">{f.purpose}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="card text-center py-12">
              <Shield className="h-16 w-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Deal to Check Compliance</h3>
              <p className="text-gray-500">Verify SBA eligibility and generate AI document drafts</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
