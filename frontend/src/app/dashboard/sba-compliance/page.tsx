'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Shield, CheckCircle, XCircle, AlertTriangle, FileText, ChevronDown, ChevronUp, ExternalLink, RefreshCw, ClipboardList, BookOpen } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

interface ComplianceCheck {
  id: string;
  name: string;
  category: string;
  status: string;
  requirement: string;
  finding: string;
  cfr_reference: string;
  sop_reference: string;
  is_hard_decline: boolean;
  documentation_required: string[];
  lender_action_required: string | null;
}

interface Deal {
  id: number;
  name: string;
  loan_amount_requested: number;
  industry: string;
  status: string;
}

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
  const [activeTab, setActiveTab] = useState<'eligibility' | 'checklist' | 'reference'>('eligibility');
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [dealsData, reqData] = await Promise.all([
        api.getDeals().catch(() => []),
        api.getSBARequirements().catch(() => null),
      ]);
      setDeals(dealsData.filter((d: Deal) => d.status !== 'draft'));
      setRequirements(reqData);
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const checkCompliance = async (dealId: number) => {
    setCheckLoading(true);
    setSelectedDeal(dealId);
    try {
      const [compliance, checklist] = await Promise.all([
        api.checkSBACompliance(dealId),
        api.getLenderChecklist(dealId).catch(() => null),
      ]);
      setComplianceResult(compliance);
      setLenderChecklist(checklist);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Compliance check failed');
    } finally {
      setCheckLoading(false);
    }
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'eligible':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'ineligible':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'requires_review':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      default:
        return <FileText className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'eligible':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'ineligible':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'requires_review':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const groupChecksByCategory = (checks: ComplianceCheck[]) => {
    return checks.reduce((acc, check) => {
      if (!acc[check.category]) {
        acc[check.category] = [];
      }
      acc[check.category].push(check);
      return acc;
    }, {} as Record<string, ComplianceCheck[]>);
  };

  const categoryNames: Record<string, string> = {
    business_type: 'Business Type',
    size_standards: 'Size Standards',
    use_of_proceeds: 'Use of Proceeds',
    credit_elsewhere: 'Credit Elsewhere',
    ownership: 'Ownership',
    character: 'Character',
    collateral: 'Collateral',
    equity_injection: 'Equity Injection',
    repayment_ability: 'Repayment Ability',
    management: 'Management',
    franchise: 'Franchise',
    affiliate: 'Affiliates',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <Shield className="h-8 w-8 mr-3 text-blue-600" />
            SBA 7(a) Compliance
          </h1>
          <p className="text-gray-600">Eligibility verification & lender compliance tracking</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6">
          {error}
          <button onClick={() => setError('')} className="float-right">×</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: Deal Selection */}
        <div className="lg:col-span-1">
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Select Deal</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {deals.length === 0 ? (
                <p className="text-sm text-gray-500">No deals available</p>
              ) : (
                deals.map(deal => (
                  <button
                    key={deal.id}
                    onClick={() => checkCompliance(deal.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedDeal === deal.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <p className="font-medium text-sm">{deal.name}</p>
                    <p className="text-xs text-gray-500">
                      {formatCurrency(deal.loan_amount_requested)} • {deal.industry}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right: Compliance Results */}
        <div className="lg:col-span-3">
          {checkLoading ? (
            <div className="card flex items-center justify-center h-64">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
              <span className="ml-3">Checking SBA compliance...</span>
            </div>
          ) : complianceResult ? (
            <div className="space-y-6">
              {/* Overall Status */}
              <div className={`card border-2 ${getStatusColor(complianceResult.overall_status)}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    {getStatusIcon(complianceResult.overall_status)}
                    <div className="ml-4">
                      <h2 className="text-xl font-bold">{complianceResult.deal_name}</h2>
                      <p className="text-sm capitalize">
                        Status: <strong>{complianceResult.overall_status.replace('_', ' ')}</strong>
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Max Eligible Amount</p>
                    <p className="text-2xl font-bold">{formatCurrency(complianceResult.max_loan_amount)}</p>
                  </div>
                </div>

                {/* Eligible Programs */}
                {complianceResult.eligible_loan_types?.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm font-medium mb-2">Eligible Programs:</p>
                    <div className="flex flex-wrap gap-2">
                      {(complianceResult.eligible_loan_types || []).map((type: string) => (
                        <span key={type} className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                          {type}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Summary Stats */}
                <div className="mt-4 grid grid-cols-4 gap-4">
                  <div className="text-center p-2 bg-green-50 rounded">
                    <p className="text-2xl font-bold text-green-600">{complianceResult.passed_count}</p>
                    <p className="text-xs text-green-700">Passed</p>
                  </div>
                  <div className="text-center p-2 bg-red-50 rounded">
                    <p className="text-2xl font-bold text-red-600">{complianceResult.failed_count}</p>
                    <p className="text-xs text-red-700">Failed</p>
                  </div>
                  <div className="text-center p-2 bg-yellow-50 rounded">
                    <p className="text-2xl font-bold text-yellow-600">{complianceResult.review_count}</p>
                    <p className="text-xs text-yellow-700">Review</p>
                  </div>
                  <div className="text-center p-2 bg-gray-50 rounded">
                    <p className="text-2xl font-bold text-gray-600">{complianceResult.incomplete_count}</p>
                    <p className="text-xs text-gray-700">Incomplete</p>
                  </div>
                </div>
              </div>

              {/* Hard Declines Warning */}
              {complianceResult.hard_declines?.length > 0 && (
                <div className="card border-2 border-red-300 bg-red-50">
                  <h3 className="font-semibold text-red-800 flex items-center mb-2">
                    <XCircle className="h-5 w-5 mr-2" />
                    Hard Decline Issues
                  </h3>
                  <ul className="space-y-1">
                    {(complianceResult.hard_declines || []).map((decline: string, i: number) => (
                      <li key={i} className="text-sm text-red-700">• {decline}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Tabs */}
              <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8">
                  <button
                    onClick={() => setActiveTab('eligibility')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'eligibility'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <FileText className="h-4 w-4 inline mr-2" />
                    Eligibility Checks
                  </button>
                  {lenderChecklist && (
                    <button
                      onClick={() => setActiveTab('checklist')}
                      className={`py-2 px-1 border-b-2 font-medium text-sm ${
                        activeTab === 'checklist'
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <ClipboardList className="h-4 w-4 inline mr-2" />
                      Lender Checklist
                    </button>
                  )}
                  <button
                    onClick={() => setActiveTab('reference')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'reference'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <BookOpen className="h-4 w-4 inline mr-2" />
                    Reference
                  </button>
                </nav>
              </div>

              {/* Eligibility Checks Tab */}
              {activeTab === 'eligibility' && (
                <div className="space-y-3">
                  {Object.entries(groupChecksByCategory(complianceResult.checks)).map(([category, checks]) => (
                    <div key={category} className="card">
                      <button
                        onClick={() => toggleCategory(category)}
                        className="w-full flex items-center justify-between"
                      >
                        <div className="flex items-center">
                          <span className="font-semibold">{categoryNames[category] || category}</span>
                          <span className="ml-2 text-sm text-gray-500">({checks.length} checks)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {(checks || []).map((c: ComplianceCheck) => (
                            <span key={c.id} className="w-3 h-3">
                              {getStatusIcon(c.status)}
                            </span>
                          ))}
                          {expandedCategories.has(category) ? (
                            <ChevronUp className="h-5 w-5 text-gray-400" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-gray-400" />
                          )}
                        </div>
                      </button>

                      {expandedCategories.has(category) && (
                        <div className="mt-4 space-y-3">
                          {(checks || []).map((check: ComplianceCheck) => (
                            <div
                              key={check.id}
                              className={`p-3 rounded-lg border ${getStatusColor(check.status)}`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex items-start">
                                  {getStatusIcon(check.status)}
                                  <div className="ml-3">
                                    <p className="font-medium">{check.name}</p>
                                    <p className="text-sm mt-1">{check.finding}</p>
                                    <p className="text-xs text-gray-500 mt-1">
                                      Requirement: {check.requirement}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right text-xs">
                                  <a
                                    href={`https://www.ecfr.gov/current/title-13/chapter-I/part-120`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline inline-flex items-center"
                                  >
                                    {check.cfr_reference}
                                    <ExternalLink className="h-3 w-3 ml-1" />
                                  </a>
                                </div>
                              </div>

                              {check.documentation_required?.length > 0 && (
                                <div className="mt-2 pt-2 border-t">
                                  <p className="text-xs font-medium">Documentation Required:</p>
                                  <ul className="text-xs mt-1">
                                    {(check.documentation_required || []).map((doc, i) => (
                                      <li key={i}>• {doc}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {check.lender_action_required && (
                                <div className="mt-2 p-2 bg-yellow-50 rounded text-xs">
                                  <strong>Lender Action:</strong> {check.lender_action_required}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Lender Checklist Tab */}
              {activeTab === 'checklist' && lenderChecklist && (
                <div className="space-y-4">
                  {Object.entries(lenderChecklist.checklist).map(([section, items]: [string, any]) => (
                    items.length > 0 && (
                      <div key={section} className="card">
                        <h3 className="font-semibold capitalize mb-3">
                          {section.replace('_', ' ')}
                        </h3>
                        <div className="space-y-2">
                          {items.map((item: any, i: number) => (
                            <label
                              key={i}
                              className="flex items-start gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={item.completed}
                                onChange={() => {}}
                                className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600"
                              />
                              <div>
                                <p className={`text-sm ${item.required ? 'font-medium' : ''}`}>
                                  {item.item}
                                </p>
                                {item.required && (
                                  <span className="text-xs text-red-600">Required</span>
                                )}
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    )
                  ))}
                </div>
              )}

              {/* Reference Tab */}
              {activeTab === 'reference' && requirements && (
                <div className="space-y-4">
                  {/* Program Limits */}
                  <div className="card">
                    <h3 className="font-semibold mb-3">Program Limits</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {Object.entries(requirements.program_limits).map(([program, limits]: [string, any]) => (
                        <div key={program} className="p-3 bg-gray-50 rounded-lg">
                          <p className="font-medium text-sm capitalize">{program.replace('_', ' ')}</p>
                          <p className="text-xl font-bold">{formatCurrency(limits.max_amount)}</p>
                          {limits.sba_guarantee_pct && (
                            <p className="text-xs text-gray-500">
                              {(limits.sba_guarantee_pct * 100)}% SBA Guarantee
                            </p>
                          )}
                          {limits.turnaround && (
                            <p className="text-xs text-blue-600">{limits.turnaround}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Ineligible Businesses */}
                  <div className="card">
                    <h3 className="font-semibold mb-3">Ineligible Businesses</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {(requirements.ineligible_businesses || []).map((biz: string, i: number) => (
                        <div key={i} className="flex items-center text-sm text-red-700">
                          <XCircle className="h-4 w-4 mr-2 flex-shrink-0" />
                          {biz}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Required Forms */}
                  <div className="card">
                    <h3 className="font-semibold mb-3">Required SBA Forms</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {(requirements.required_forms || []).map((form: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <span className="font-medium text-sm">{form.form}</span>
                          <span className="text-xs text-gray-500">{form.purpose}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Documentation Gaps */}
              {complianceResult.documentation_gaps?.length > 0 && (
                <div className="card">
                  <h3 className="font-semibold mb-3 flex items-center">
                    <AlertTriangle className="h-5 w-5 mr-2 text-yellow-500" />
                    Documentation Gaps
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {(complianceResult.documentation_gaps || []).map((doc: string, i: number) => (
                      <div key={i} className="flex items-center p-2 bg-yellow-50 rounded text-sm">
                        <FileText className="h-4 w-4 mr-2 text-yellow-600" />
                        {doc}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {complianceResult.recommendations?.length > 0 && (
                <div className="card">
                  <h3 className="font-semibold mb-3">Recommendations</h3>
                  <ul className="space-y-2">
                    {(complianceResult.recommendations || []).map((rec: string, i: number) => (
                      <li key={i} className="flex items-start text-sm">
                        <CheckCircle className="h-4 w-4 mr-2 mt-0.5 text-blue-500 flex-shrink-0" />
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="card text-center py-12">
              <Shield className="h-16 w-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Select a Deal to Check Compliance
              </h3>
              <p className="text-gray-500">
                Choose a deal from the list to verify SBA 7(a) eligibility
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}