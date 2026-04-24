'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle, XCircle, MessageSquare, RefreshCw, AlertTriangle, ShieldCheck, ShieldAlert, ChevronDown, ChevronUp, Eye, FileText, Download, Brain, Zap } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { DealMatch, Deal, DealRiskReport } from '@/types';
import { formatCurrency, formatPercent, formatDate, getStatusColor } from '@/lib/utils';

interface VerificationStatus {
  status: string;
  flag_count: number;
  confidence_score: number;
  discrepancies: Array<{
    field: string;
    reported: number;
    extracted: number;
    difference_pct: number;
    severity: string;
    notes: string;
  }>;
  critical_count: number;
  high_count: number;
}

interface AIAnalysis {
  composite_score: number;
  tier: string;
  tier_display: string;
  recommended_premium: number;
  expected_annual_default_rate: number;
  foia_benchmark_rate: number;
  decision: string;
  monitoring_frequency: string;
  risk_flags: string[];
  positive_factors: string[];
}

export default function MatchesPage() {
  const [uwScores, setUwScores] = useState<Record<number, any>>({});
  const { user } = useAuth();
  const [matches, setMatches] = useState<DealMatch[]>([]);
  const [deals, setDeals] = useState<Record<number, Deal>>({});
  const [riskReports, setRiskReports] = useState<Record<number, DealRiskReport>>({});
  const [verifications, setVerifications] = useState<Record<number, VerificationStatus>>({});
  const [aiAnalyses, setAiAnalyses] = useState<Record<number, AIAnalysis>>({});
  const [aiLoading, setAiLoading] = useState<number | null>(null);
  const [expandedDeals, setExpandedDeals] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('all');

  useEffect(() => {
    loadMatches();
  }, []);

  const loadMatches = async () => {
    try {
      const matchData = await api.getMyMatches();
      setMatches(matchData);

      // Load deal details, risk reports, and verification for each match
      const dealIds = [...new Set((matchData || []).map(m => m.deal_id))];
      const dealPromises = (dealIds || []).map(id => api.getDeal(id).catch(() => null));
      const verifyPromises = (dealIds || []).map(id => api.getVerificationStatus(id).catch(() => null));
      const reportPromises = (dealIds || []).map(id => api.getLatestRiskReport(id).catch(() => null));
      
      const [dealResults, verifyResults, reportResults] = await Promise.all([
        Promise.all(dealPromises),
        Promise.all(verifyPromises),
        Promise.all(reportPromises)
      ]);
      
      const dealMap: Record<number, Deal> = {};
      const verifyMap: Record<number, VerificationStatus> = {};
      const reportMap: Record<number, DealRiskReport> = {};
      
      (dealResults || []).forEach((deal, index) => {
        if (deal) {
          dealMap[dealIds[index]] = deal;
        }
      });
      
      (verifyResults || []).forEach((verify, index) => {
        if (verify) {
          verifyMap[dealIds[index]] = verify;
        }
      });
      
      (reportResults || []).forEach((report, index) => {
        if (report) {
          reportMap[dealIds[index]] = report;
        }
      });
      
      setDeals(dealMap);
      setVerifications(verifyMap);
      setRiskReports(reportMap);
    } catch (err) {
      setError('Failed to load matches');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpanded = (dealId: number) => {
    setExpandedDeals(prev => {
      const next = new Set(prev);
      if (next.has(dealId)) {
        next.delete(dealId);
      } else {
        next.add(dealId);
      }
      return next;
    });
  };

  const handleDecision = async (matchId: number, status: 'accepted' | 'rejected' | 'info_requested', notes?: string) => {
    setActionLoading(matchId);
    try {
      await api.makeMatchDecision(matchId, status, notes);
      await loadMatches();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save decision');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAIAnalysis = async (dealId: number) => {
    setAiLoading(dealId);
    try {
      const result = await api.scoreDealWithAIAgent(dealId);
      setAiAnalyses(prev => ({ ...prev, [dealId]: result }));
    } catch (err: any) {
      setError(err.response?.data?.detail || 'AI analysis failed');
    } finally {
      setAiLoading(null);
    }
  };

  const getTierColor = (tier: string) => {
    const colors: Record<string, string> = {
      preferred: 'bg-green-100 text-green-800 border-green-300',
      standard: 'bg-blue-100 text-blue-800 border-blue-300',
      elevated: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      high_risk: 'bg-orange-100 text-orange-800 border-orange-300',
      decline: 'bg-red-100 text-red-800 border-red-300',
    };
    return colors[tier] || 'bg-gray-100 text-gray-800';
  };

  const filteredMatches = (matches || []).filter(match => {
    if (filter === 'all') return true;
    return match.status === filter;
  });

  const pendingCount = (matches || []).filter(m => m.status === 'pending').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Matched Deals</h1>
          <p className="text-gray-600">
            Review deals that match your policies
            {pendingCount > 0 && (
              <span className="ml-2 text-primary-600 font-medium">
                ({pendingCount} pending review)
              </span>
            )}
          </p>
        </div>
        <button onClick={loadMatches} className="btn btn-secondary inline-flex items-center">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {(['all', 'pending', 'accepted', 'rejected'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === 'pending' && pendingCount > 0 && (
              <span className="ml-1 bg-white text-primary-600 px-1.5 py-0.5 rounded-full text-xs">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Matches list */}
      <div className="space-y-4">
        {filteredMatches.length > 0 ? (
          (filteredMatches || []).map((match) => {
            const deal = deals[match.deal_id];
            const report = riskReports[match.deal_id];
            const verification = verifications[match.deal_id];
            const hasFlags = verification && verification.flag_count > 0;
            const hasCriticalFlags = verification && (verification.critical_count > 0 || verification.high_count > 0);
            const isExpanded = expandedDeals.has(match.deal_id);
            
            return (
              <div key={match.id} className="card">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-semibold text-gray-900">
                        {deal?.name || `Deal #${match.deal_id}`}
                      </span>
                      <Link 
                        href={`/dashboard/deals/${match.deal_id}`}
                        className="text-xs bg-primary-100 text-primary-700 px-2 py-1 rounded hover:bg-primary-200 inline-flex items-center"
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View Full Details
                      </Link>
                    </div>
                    <p className="text-sm text-gray-500">
                      {deal?.industry && <span className="capitalize">{deal.industry.replace('_', ' ')}</span>}
                      {deal?.deal_type && <span> • {deal.deal_type}</span>}
                      {deal?.company_name && <span> • {deal.company_name}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Verification Badge */}
                    {verification && (
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        hasCriticalFlags 
                          ? 'bg-red-100 text-red-800' 
                          : hasFlags 
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-green-100 text-green-800'
                      }`}>
                        {hasCriticalFlags ? (
                          <><ShieldAlert className="h-3 w-3 mr-1" /> {verification.flag_count} Flags</>
                        ) : hasFlags ? (
                          <><AlertTriangle className="h-3 w-3 mr-1" /> {verification.flag_count} Flags</>
                        ) : (
                          <><ShieldCheck className="h-3 w-3 mr-1" /> Verified</>
                        )}
                      </span>
                    )}
                    {match.auto_decision && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        🤖 Auto
                      </span>
                    )}
                    <span className={`badge ${getStatusColor(match.status)}`}>
                      {match.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                {deal && (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4 text-sm">
                    <div>
                      <p className="text-gray-500">Loan Amount</p>
                      <p className="font-medium">{formatCurrency(deal.loan_amount_requested)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Revenue</p>
                      <p className="font-medium">{formatCurrency(deal.annual_revenue)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">EBITDA</p>
                      <p className="font-medium">{formatCurrency(deal.ebitda)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Term</p>
                      <p className="font-medium">{deal.loan_term_months} months</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Match Score</p>
                      <p className="font-medium">
                        {match.match_score ? `${(match.match_score * 100).toFixed(0)}%` : '-'}
                      </p>
                    </div>
                  </div>
                )}

                {/* AI Analysis Quick View - Always Visible */}
                <div className="mb-4 p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Brain className="h-5 w-5 text-purple-600 mr-2" />
                      <span className="font-medium text-purple-800">AI Risk Analysis</span>
                    </div>
                    {aiAnalyses[match.deal_id] ? (
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-2xl font-bold text-purple-700">{aiAnalyses[match.deal_id].composite_score}</span>
                          <span className="text-purple-600 text-sm ml-1">/ 100</span>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${getTierColor(aiAnalyses[match.deal_id].tier)}`}>
                          {aiAnalyses[match.deal_id].tier_display}
                        </span>
                        <button
                          onClick={() => handleAIAnalysis(match.deal_id)}
                          disabled={aiLoading === match.deal_id}
                          className="text-purple-600 hover:text-purple-800 text-sm"
                        >
                          {aiLoading === match.deal_id ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Re-run'}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleAIAnalysis(match.deal_id)}
                        disabled={aiLoading === match.deal_id}
                        className="btn bg-purple-600 hover:bg-purple-700 text-white inline-flex items-center"
                      >
                        {aiLoading === match.deal_id ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Zap className="h-4 w-4 mr-2" />
                            Run AI Analysis
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  
                  {/* Show quick metrics if analyzed */}
                  {aiAnalyses[match.deal_id] && (
                    <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                      <div className="bg-white rounded p-2 text-center">
                        <p className="text-gray-500">Premium</p>
                        <p className="font-bold text-gray-800">{(aiAnalyses[match.deal_id].recommended_premium * 100).toFixed(2)}%</p>
                      </div>
                      <div className="bg-white rounded p-2 text-center">
                        <p className="text-gray-500">Exp. Default</p>
                        <p className="font-bold text-gray-800">{(aiAnalyses[match.deal_id].expected_annual_default_rate * 100).toFixed(2)}%</p>
                      </div>
                      <div className="bg-white rounded p-2 text-center">
                        <p className="text-gray-500">Decision</p>
                        <p className="font-bold text-gray-800 capitalize">{aiAnalyses[match.deal_id].decision?.replace('_', ' ')}</p>
                      </div>
                      <div className="bg-white rounded p-2 text-center">
                        <p className="text-gray-500">Monitoring</p>
                        <p className="font-bold text-gray-800 capitalize">{aiAnalyses[match.deal_id].monitoring_frequency}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Expand/Collapse Button */}
                <button
                  onClick={() => toggleExpanded(match.deal_id)}
                  className="w-full flex items-center justify-center gap-2 text-sm text-gray-600 hover:text-gray-900 py-2 border-t border-b mb-4"
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      Hide Full Deal Information
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      Show Full Deal Information
                    </>
                  )}
                </button>

                {/* Expanded Deal Details */}
                {isExpanded && deal && (
                  <div className="mb-4 space-y-4 bg-gray-50 rounded-lg p-4">
                    {/* Business Information */}
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2 flex items-center">
                        <FileText className="h-4 w-4 mr-2" />
                        Business Information
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-gray-500">Deal Name</p>
                          <p className="font-medium">{deal.name}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Deal Type</p>
                          <p className="font-medium capitalize">{deal.deal_type}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Industry</p>
                          <p className="font-medium capitalize">{deal.industry?.replace('_', ' ')}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Status</p>
                          <p className="font-medium capitalize">{deal.status?.replace('_', ' ')}</p>
                        </div>
                        {deal.company_name && (
                          <div>
                            <p className="text-gray-500">Company Name</p>
                            <p className="font-medium">{deal.company_name}</p>
                          </div>
                        )}
                        {deal.years_in_business !== undefined && (
                          <div>
                            <p className="text-gray-500">Years in Business</p>
                            <p className="font-medium">{deal.years_in_business}</p>
                          </div>
                        )}
                        {deal.employee_count !== undefined && (
                          <div>
                            <p className="text-gray-500">Employee Count</p>
                            <p className="font-medium">{deal.employee_count}</p>
                          </div>
                        )}
                        {deal.owner_credit_score && (
                          <div>
                            <p className="text-gray-500">Owner Credit Score</p>
                            <p className="font-medium">{deal.owner_credit_score}</p>
                          </div>
                        )}
                        {deal.owner_experience_years !== undefined && (
                          <div>
                            <p className="text-gray-500">Owner Experience</p>
                            <p className="font-medium">{deal.owner_experience_years} years</p>
                          </div>
                        )}
                        {deal.customer_concentration !== undefined && (
                          <div>
                            <p className="text-gray-500">Customer Concentration</p>
                            <p className="font-medium">{formatPercent(deal.customer_concentration)}</p>
                          </div>
                        )}
                      </div>
                      {deal.business_description && (
                        <div className="mt-3 p-3 bg-white rounded border">
                          <p className="text-gray-500 text-sm font-medium">Business Description</p>
                          <p className="text-sm mt-1">{deal.business_description}</p>
                        </div>
                      )}
                    </div>

                    {/* Loan Request */}
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Loan Request</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-gray-500">Loan Amount Requested</p>
                          <p className="font-medium text-lg">{formatCurrency(deal.loan_amount_requested)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Loan Term</p>
                          <p className="font-medium">{deal.loan_term_months} months ({(deal.loan_term_months/12).toFixed(1)} years)</p>
                        </div>
                        {deal.purchase_price && (
                          <div>
                            <p className="text-gray-500">Purchase Price</p>
                            <p className="font-medium">{formatCurrency(deal.purchase_price)}</p>
                          </div>
                        )}
                        {deal.equity_injection && (
                          <div>
                            <p className="text-gray-500">Equity Injection</p>
                            <p className="font-medium">{formatCurrency(deal.equity_injection)}</p>
                          </div>
                        )}
                        {deal.down_payment && (
                          <div>
                            <p className="text-gray-500">Down Payment</p>
                            <p className="font-medium">{formatCurrency(deal.down_payment)}</p>
                          </div>
                        )}
                        {deal.seller_financing && (
                          <div>
                            <p className="text-gray-500">Seller Financing</p>
                            <p className="font-medium">{formatCurrency(deal.seller_financing)}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Financial Details */}
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Financial Metrics</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-gray-500">Annual Revenue</p>
                          <p className="font-medium">{formatCurrency(deal.annual_revenue)}</p>
                        </div>
                        {deal.gross_profit && (
                          <div>
                            <p className="text-gray-500">Gross Profit</p>
                            <p className="font-medium">{formatCurrency(deal.gross_profit)}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-gray-500">EBITDA</p>
                          <p className="font-medium">{formatCurrency(deal.ebitda)}</p>
                        </div>
                        {deal.ebitda_margin && (
                          <div>
                            <p className="text-gray-500">EBITDA Margin</p>
                            <p className="font-medium">{formatPercent(deal.ebitda_margin)}</p>
                          </div>
                        )}
                        {deal.revenue_growth_rate && (
                          <div>
                            <p className="text-gray-500">Revenue Growth Rate</p>
                            <p className="font-medium">{formatPercent(deal.revenue_growth_rate)}</p>
                          </div>
                        )}
                        {deal.capex !== undefined && deal.capex !== null && (
                          <div>
                            <p className="text-gray-500">CapEx</p>
                            <p className="font-medium">{formatCurrency(deal.capex)}</p>
                          </div>
                        )}
                        {deal.debt_service !== undefined && deal.debt_service !== null && (
                          <div>
                            <p className="text-gray-500">Existing Debt Service</p>
                            <p className="font-medium">{formatCurrency(deal.debt_service)}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Addbacks */}
                    {deal.addbacks && deal.addbacks.length > 0 && (
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">EBITDA Addbacks</h4>
                        <div className="bg-white rounded border p-3">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-gray-500 border-b">
                                <th className="pb-2">Description</th>
                                <th className="pb-2 text-right">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(deal.addbacks || []).map((addback: any, i: number) => (
                                <tr key={i} className="border-b last:border-0">
                                  <td className="py-2">{addback.description}</td>
                                  <td className="py-2 text-right font-medium">{formatCurrency(addback.amount)}</td>
                                </tr>
                              ))}
                              <tr className="font-medium bg-gray-50">
                                <td className="py-2">Total Addbacks</td>
                                <td className="py-2 text-right">
                                  {formatCurrency((deal.addbacks || []).reduce((sum: number, a: any) => sum + a.amount, 0))}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Business Assets */}
                    {deal.business_assets && deal.business_assets.length > 0 && (
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">Business Assets (Collateral)</h4>
                        <div className="bg-white rounded border p-3">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-gray-500 border-b">
                                <th className="pb-2">Type</th>
                                <th className="pb-2">Description</th>
                                <th className="pb-2 text-right">Value</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(deal.business_assets || []).map((asset: any, i: number) => (
                                <tr key={i} className="border-b last:border-0">
                                  <td className="py-2 capitalize">{asset.type?.replace('_', ' ')}</td>
                                  <td className="py-2 text-gray-600">{asset.description || '-'}</td>
                                  <td className="py-2 text-right font-medium">{formatCurrency(asset.value)}</td>
                                </tr>
                              ))}
                              <tr className="font-medium bg-gray-50">
                                <td className="py-2" colSpan={2}>Total Business Assets</td>
                                <td className="py-2 text-right">
                                  {formatCurrency((deal.business_assets || []).reduce((sum: number, a: any) => sum + a.value, 0))}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Personal Assets */}
                    {deal.personal_assets && deal.personal_assets.length > 0 && (
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">Personal Assets (Collateral)</h4>
                        <div className="bg-white rounded border p-3">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-gray-500 border-b">
                                <th className="pb-2">Type</th>
                                <th className="pb-2">Description</th>
                                <th className="pb-2 text-right">Value</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(deal.personal_assets || []).map((asset: any, i: number) => (
                                <tr key={i} className="border-b last:border-0">
                                  <td className="py-2 capitalize">{asset.type?.replace('_', ' ')}</td>
                                  <td className="py-2 text-gray-600">{asset.description || '-'}</td>
                                  <td className="py-2 text-right font-medium">{formatCurrency(asset.value)}</td>
                                </tr>
                              ))}
                              <tr className="font-medium bg-gray-50">
                                <td className="py-2" colSpan={2}>Total Personal Assets</td>
                                <td className="py-2 text-right">
                                  {formatCurrency((deal.personal_assets || []).reduce((sum: number, a: any) => sum + a.value, 0))}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Risk Analysis */}
                    {report && (
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">Underwriting Analysis</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div className="bg-blue-50 rounded p-2">
                            <p className="text-blue-600 text-xs">DSCR (Base)</p>
                            <p className="font-bold text-blue-700">{report.dscr_base?.toFixed(2)}x</p>
                          </div>
                          <div className="bg-blue-50 rounded p-2">
                            <p className="text-blue-600 text-xs">DSCR (Stress)</p>
                            <p className="font-bold text-blue-700">{report.dscr_stress?.toFixed(2)}x</p>
                          </div>
                          <div className="bg-purple-50 rounded p-2">
                            <p className="text-purple-600 text-xs">Annual PD</p>
                            <p className="font-bold text-purple-700">{formatPercent(report.annual_pd || 0)}</p>
                          </div>
                          <div className="bg-orange-50 rounded p-2">
                            <p className="text-orange-600 text-xs">Collateral Coverage</p>
                            <p className="font-bold text-orange-700">{formatPercent(report.collateral_coverage || 0)}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mt-3">
                          {report.ev_low && (
                            <div>
                              <p className="text-gray-500">EV (Low)</p>
                              <p className="font-medium">{formatCurrency(report.ev_low)}</p>
                            </div>
                          )}
                          {report.ev_mid && (
                            <div>
                              <p className="text-gray-500">EV (Mid)</p>
                              <p className="font-medium">{formatCurrency(report.ev_mid)}</p>
                            </div>
                          )}
                          {report.ev_high && (
                            <div>
                              <p className="text-gray-500">EV (High)</p>
                              <p className="font-medium">{formatCurrency(report.ev_high)}</p>
                            </div>
                          )}
                          {report.normalized_ebitda && (
                            <div>
                              <p className="text-gray-500">Normalized EBITDA</p>
                              <p className="font-medium">{formatCurrency(report.normalized_ebitda)}</p>
                            </div>
                          )}
                          {report.post_debt_fcf && (
                            <div>
                              <p className="text-gray-500">Post-Debt FCF</p>
                              <p className="font-medium">{formatCurrency(report.post_debt_fcf)}</p>
                            </div>
                          )}
                          {report.total_nolv && (
                            <div>
                              <p className="text-gray-500">Total NOLV</p>
                              <p className="font-medium">{formatCurrency(report.total_nolv)}</p>
                            </div>
                          )}
                          {report.business_nolv && (
                            <div>
                              <p className="text-gray-500">Business NOLV</p>
                              <p className="font-medium">{formatCurrency(report.business_nolv)}</p>
                            </div>
                          )}
                          {report.personal_nolv && (
                            <div>
                              <p className="text-gray-500">Personal NOLV</p>
                              <p className="font-medium">{formatCurrency(report.personal_nolv)}</p>
                            </div>
                          )}
                          {report.durability_score !== undefined && (
                            <div>
                              <p className="text-gray-500">Durability Score</p>
                              <p className="font-medium">{report.durability_score}/100</p>
                            </div>
                          )}
                          {report.recommended_guarantee_pct && (
                            <div>
                              <p className="text-gray-500">Rec. Guarantee %</p>
                              <p className="font-medium">{formatPercent(report.recommended_guarantee_pct)}</p>
                            </div>
                          )}
                          {report.recommended_escrow_pct && (
                            <div>
                              <p className="text-gray-500">Rec. Escrow %</p>
                              <p className="font-medium">{formatPercent(report.recommended_escrow_pct)}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* AI Agent Analysis */}
                    <div className="border-t pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-gray-900 flex items-center">
                          <Brain className="h-5 w-5 mr-2 text-purple-600" />
                          AI Agent Analysis
                        </h4>
                        {!aiAnalyses[match.deal_id] && (
                          <button
                            onClick={() => handleAIAnalysis(match.deal_id)}
                            disabled={aiLoading === match.deal_id}
                            className="btn btn-sm bg-purple-600 hover:bg-purple-700 text-white inline-flex items-center"
                          >
                            {aiLoading === match.deal_id ? (
                              <RefreshCw className="h-4 w-4 animate-spin mr-1" />
                            ) : (
                              <Zap className="h-4 w-4 mr-1" />
                            )}
                            Analyze Deal
                          </button>
                        )}
                      </div>
                      
                      {aiAnalyses[match.deal_id] ? (
                        <div className="bg-purple-50 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <p className="text-4xl font-bold text-purple-700">{aiAnalyses[match.deal_id].composite_score}</p>
                              <p className="text-sm text-purple-600">Composite Score</p>
                            </div>
                            <div className={`px-4 py-2 rounded-lg border ${getTierColor(aiAnalyses[match.deal_id].tier)}`}>
                              <p className="font-bold">{aiAnalyses[match.deal_id].tier_display}</p>
                              <p className="text-xs capitalize">{aiAnalyses[match.deal_id].decision?.replace('_', ' ')}</p>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
                            <div className="bg-white rounded p-2">
                              <p className="text-gray-500 text-xs">Rec. Premium</p>
                              <p className="font-bold">{(aiAnalyses[match.deal_id].recommended_premium * 100).toFixed(2)}%</p>
                            </div>
                            <div className="bg-white rounded p-2">
                              <p className="text-gray-500 text-xs">Expected Default</p>
                              <p className="font-bold">{(aiAnalyses[match.deal_id].expected_annual_default_rate * 100).toFixed(2)}%</p>
                            </div>
                            <div className="bg-white rounded p-2">
                              <p className="text-gray-500 text-xs">FOIA Benchmark</p>
                              <p className="font-bold">{(aiAnalyses[match.deal_id].foia_benchmark_rate * 100).toFixed(2)}%</p>
                            </div>
                            <div className="bg-white rounded p-2">
                              <p className="text-gray-500 text-xs">Monitoring</p>
                              <p className="font-bold capitalize">{aiAnalyses[match.deal_id].monitoring_frequency}</p>
                            </div>
                          </div>
                          
                          {aiAnalyses[match.deal_id].risk_flags?.length > 0 && (
                            <div className="mb-3">
                              <p className="text-xs font-medium text-gray-700 mb-1">Risk Flags:</p>
                              <div className="space-y-1">
                                {(aiAnalyses[match.deal_id].risk_flags || []).slice(0, 3).map((flag: any, i: number) => (
                                  <p key={i} className="text-xs text-orange-700 flex items-start">
                                    <AlertTriangle className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0" />
                                    {typeof flag === 'object' ? `${flag.flag}${flag.value ? ` (${flag.value})` : ''}` : flag}
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {aiAnalyses[match.deal_id].positive_factors?.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-gray-700 mb-1">Positive Factors:</p>
                              <div className="space-y-1">
                                {(aiAnalyses[match.deal_id].positive_factors || []).slice(0, 3).map((factor: any, i: number) => (
                                  <p key={i} className="text-xs text-green-700 flex items-start">
                                    <CheckCircle className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0" />
                                    {typeof factor === 'object' ? `${factor.factor}${factor.value ? ` (${factor.value})` : ''}` : factor}
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          <button
                            onClick={() => handleAIAnalysis(match.deal_id)}
                            className="mt-3 text-xs text-purple-600 hover:text-purple-800"
                          >
                            Re-analyze
                          </button>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">
                          Click "Analyze Deal" to run the 62-variable AI risk assessment
                        </p>
                      )}
                    </div>

                    {/* Documents */}
                    {deal.documents && deal.documents.length > 0 && (
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">Uploaded Documents ({(deal.documents || []).length})</h4>
                        <div className="bg-white rounded border p-3">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-gray-500 border-b">
                                <th className="pb-2">File Name</th>
                                <th className="pb-2">Type</th>
                                <th className="pb-2">Uploaded</th>
                                <th className="pb-2 text-center">Download</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(deal.documents || []).map((doc: any) => (
                                <tr key={doc.id} className="border-b last:border-0">
                                  <td className="py-2 flex items-center">
                                    <FileText className="h-4 w-4 mr-2 text-gray-400" />
                                    {doc.original_filename || doc.filename}
                                  </td>
                                  <td className="py-2 capitalize">{doc.document_type?.replace('_', ' ') || 'Other'}</td>
                                  <td className="py-2 text-gray-500">{formatDate(doc.created_at)}</td>
                                  <td className="py-2 text-center">
                                    <button
                                      onClick={async (e) => {
                                        e.preventDefault();
                                        await api.downloadDocument(deal.id, doc.id, doc.original_filename || doc.filename);
                                      }}
                                      className="text-primary-600 hover:text-primary-800 inline-flex items-center"
                                      title="Download"
                                    >
                                      <Download className="h-4 w-4" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Link to full deal page */}
                    <div className="pt-3 border-t">
                      <Link 
                        href={`/dashboard/deals/${match.deal_id}`}
                        className="btn btn-primary inline-flex items-center"
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Open Full Deal Page
                      </Link>
                    </div>
                  </div>
                )}

                {/* Verification Flags Section */}
                {verification && verification.discrepancies.length > 0 && (
                  <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm font-medium text-yellow-800 mb-2 flex items-center">
                      <AlertTriangle className="h-4 w-4 mr-1" />
                      Document Verification Flags
                    </p>
                    <div className="space-y-2">
                      {(verification.discrepancies || []).map((d, i) => (
                        <div key={i} className={`text-xs p-2 rounded ${
                          d.severity === 'critical' ? 'bg-red-100 text-red-800' :
                          d.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                          d.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          <span className="font-medium">{d.field}:</span> Reported {formatCurrency(d.reported)} vs Extracted {formatCurrency(d.extracted)} 
                          <span className="ml-1">({d.difference_pct > 0 ? '+' : ''}{d.difference_pct.toFixed(1)}%)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Constraints */}
                {(match.constraints_met?.length || match.constraints_failed?.length) && (
                  <div className="mb-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">Constraint Analysis</p>
                    <div className="flex flex-wrap gap-2">
                      {match.constraints_met?.slice(0, 3).map((c: any, i: number) => {
                        const label = typeof c === 'string' ? c : String(c.constraint || c.name || 'constraint');
                        return (
                          <span key={`met-${i}`} className="inline-flex items-center text-xs bg-green-50 text-green-700 px-2 py-1 rounded">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            {label.replace(/_/g, ' ')}
                          </span>
                        );
                      })}
                      {match.constraints_failed?.slice(0, 3).map((c: any, i: number) => {
                        const label = typeof c === 'string' ? c : String(c.constraint || c.name || 'constraint');
                        return (
                          <span key={`failed-${i}`} className="inline-flex items-center text-xs bg-red-50 text-red-700 px-2 py-1 rounded">
                            <XCircle className="h-3 w-3 mr-1" />
                            {label.replace(/_/g, ' ')}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Decision notes */}
                {match.decision_notes && (
                  <div className="bg-gray-50 rounded-lg p-3 mb-4">
                    <p className="text-sm text-gray-600">
                      <strong>Decision notes:</strong> {match.decision_notes}
                    </p>
                    {match.decision_at && (
                      <p className="text-xs text-gray-400 mt-1">
                        Decided on {formatDate(match.decision_at)}
                      </p>
                    )}
                  </div>
                )}

                {/* Actions */}
                {match.status === 'pending' && (
                  <div className="flex gap-3 pt-4 border-t">
                    {/* Accept/Reject only for Credit Committee, full Lenders, and Insurers */}
                    {user?.role !== 'loan_officer' && (
                      <>
                        <button
                          onClick={() => handleDecision(match.id, 'accepted')}
                          disabled={actionLoading === match.id}
                          className="btn btn-primary text-sm py-2"
                        >
                          <CheckCircle className="h-4 w-4 mr-1 inline" />
                          Accept
                        </button>
                        <button
                          onClick={() => {
                            const notes = prompt('Reason for rejection (optional):');
                            handleDecision(match.id, 'rejected', notes || undefined);
                          }}
                          disabled={actionLoading === match.id}
                          className="btn btn-danger text-sm py-2"
                        >
                          <XCircle className="h-4 w-4 mr-1 inline" />
                          Reject
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => {
                        const notes = prompt('What information do you need?');
                        if (notes) {
                          handleDecision(match.id, 'info_requested', notes);
                        }
                      }}
                      disabled={actionLoading === match.id}
                      className="btn btn-secondary text-sm py-2"
                    >
                      <MessageSquare className="h-4 w-4 mr-1 inline" />
                      Request Info
                    </button>
                    {/* Loan officer sees a note about escalating */}
                    {user?.role === 'loan_officer' && (
                      <span className="text-sm text-gray-500 self-center ml-2">
                        Use Verification page to review and escalate to Credit Committee
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="card text-center py-12">
            <p className="text-gray-500">
              {filter === 'all' 
                ? 'No matches found. Matches will appear when deals match your policies.'
                : `No ${filter} matches found.`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}