'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  ClipboardCheck, RefreshCw, AlertTriangle, CheckCircle, XCircle, 
  FileText, Download, MessageSquare, Flag, Eye, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, DollarSign, Percent, Shield, AlertCircle,
  FileQuestion, Send, Loader2
} from 'lucide-react';
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

interface VerificationFlag {
  id?: number;
  field: string;
  reported_value: string;
  flagged_value?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  notes: string;
  status: 'pending' | 'resolved' | 'dismissed';
  created_at?: string;
}

export default function VerificationPage() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<DealMatch[]>([]);
  const [deals, setDeals] = useState<Record<number, Deal>>({});
  const [riskReports, setRiskReports] = useState<Record<number, DealRiskReport>>({});
  const [verifications, setVerifications] = useState<Record<number, VerificationStatus>>({});
  const [expandedDeal, setExpandedDeal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending_review' | 'flagged' | 'verified'>('all');
  
  // Modal states
  const [showInfoRequestModal, setShowInfoRequestModal] = useState<number | null>(null);
  const [showFlagModal, setShowFlagModal] = useState<number | null>(null);
  const [infoRequestMessage, setInfoRequestMessage] = useState('');
  const [newFlag, setNewFlag] = useState<Partial<VerificationFlag>>({
    field: '',
    reported_value: '',
    flagged_value: '',
    severity: 'medium',
    notes: '',
  });

  useEffect(() => {
    if (user?.role === 'loan_officer' || user?.role === 'lender' || user?.role === 'admin') {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    try {
      setLoading(true);
      const matchData = await api.getMyMatches();
      setMatches(matchData);

      // Load deal details, risk reports, and verification for each match
      const dealIds = [...new Set(matchData.map(m => m.deal_id))];
      const dealPromises = dealIds.map(id => api.getDeal(id).catch(() => null));
      const verifyPromises = dealIds.map(id => api.getDealVerificationStatus(id).catch(() => null));
      const reportPromises = dealIds.map(id => api.getLatestRiskReport(id).catch(() => null));
      
      const [dealResults, verifyResults, reportResults] = await Promise.all([
        Promise.all(dealPromises),
        Promise.all(verifyPromises),
        Promise.all(reportPromises)
      ]);
      
      const dealMap: Record<number, Deal> = {};
      const verifyMap: Record<number, VerificationStatus> = {};
      const reportMap: Record<number, DealRiskReport> = {};
      
      dealResults.forEach((deal, index) => {
        if (deal) dealMap[dealIds[index]] = deal;
      });
      
      verifyResults.forEach((verify, index) => {
        if (verify) verifyMap[dealIds[index]] = verify;
      });
      
      reportResults.forEach((report, index) => {
        if (report) reportMap[dealIds[index]] = report;
      });
      
      setDeals(dealMap);
      setVerifications(verifyMap);
      setRiskReports(reportMap);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestInfo = async (matchId: number) => {
    if (!infoRequestMessage.trim()) {
      setError('Please enter a message describing what information you need');
      return;
    }
    
    setActionLoading(`info-${matchId}`);
    try {
      await api.makeDecision(matchId, { status: 'info_requested', decision_notes: infoRequestMessage });
      setSuccess('Information request sent to borrower');
      setShowInfoRequestModal(null);
      setInfoRequestMessage('');
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to request information');
    } finally {
      setActionLoading(null);
    }
  };

  const handleMarkVerified = async (matchId: number, dealId: number) => {
    setActionLoading(`verify-${matchId}`);
    try {
      // Use the dedicated verification endpoint
      await api.markDealVerified({ 
        match_id: matchId,
        verification_notes: `Deal verified and ready for Credit Committee review.`
      });
      setSuccess('Deal marked as verified and ready for Credit Committee review');
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to mark as verified');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSubmitFlag = async (dealId: number) => {
    if (!newFlag.field || !newFlag.notes) {
      setError('Please fill in the field name and notes');
      return;
    }
    
    setActionLoading(`flag-${dealId}`);
    try {
      const match = matches.find(m => m.deal_id === dealId);
      // Use the dedicated verification flag endpoint
      await api.createVerificationFlag({
        deal_id: dealId,
        match_id: match?.id,
        field_name: newFlag.field || '',
        reported_value: newFlag.reported_value,
        expected_value: newFlag.flagged_value,
        severity: newFlag.severity || 'medium',
        notes: newFlag.notes
      });
      setSuccess('Flag added to deal');
      setShowFlagModal(null);
      setNewFlag({ field: '', reported_value: '', flagged_value: '', severity: 'medium', notes: '' });
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to add flag');
    } finally {
      setActionLoading(null);
    }
  };

  const getRiskColor = (value: number, thresholds: { good: number; warning: number }, higher_is_better: boolean = true) => {
    if (higher_is_better) {
      if (value >= thresholds.good) return 'text-green-600';
      if (value >= thresholds.warning) return 'text-yellow-600';
      return 'text-red-600';
    } else {
      if (value <= thresholds.good) return 'text-green-600';
      if (value <= thresholds.warning) return 'text-yellow-600';
      return 'text-red-600';
    }
  };

  const getVerificationBadge = (dealId: number, matchStatus: string) => {
    const verify = verifications[dealId];
    
    // Check if already verified by loan officer
    const match = matches.find(m => m.deal_id === dealId);
    if (match?.decision_notes?.includes('[VERIFIED BY LOAN OFFICER]')) {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircle className="h-3 w-3 inline mr-1" />
          Verified
        </span>
      );
    }
    
    if (match?.decision_notes?.includes('[FLAG')) {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
          <Flag className="h-3 w-3 inline mr-1" />
          Flagged
        </span>
      );
    }
    
    if (matchStatus === 'info_requested') {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          <MessageSquare className="h-3 w-3 inline mr-1" />
          Info Requested
        </span>
      );
    }
    
    if (verify && verify.flag_count > 0) {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          <AlertTriangle className="h-3 w-3 inline mr-1" />
          {verify.flag_count} Discrepancies
        </span>
      );
    }
    
    return (
      <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        <ClipboardCheck className="h-3 w-3 inline mr-1" />
        Pending Review
      </span>
    );
  };

  const filteredMatches = matches.filter(match => {
    if (filter === 'all') return true;
    const hasVerifiedNote = match.decision_notes?.includes('[VERIFIED BY LOAN OFFICER]');
    const hasFlagNote = match.decision_notes?.includes('[FLAG');
    
    if (filter === 'verified') return hasVerifiedNote;
    if (filter === 'flagged') return hasFlagNote || match.status === 'info_requested';
    if (filter === 'pending_review') return !hasVerifiedNote && !hasFlagNote && match.status === 'pending';
    return true;
  });

  if (!user || !['loan_officer', 'lender', 'admin'].includes(user.role)) {
    return (
      <div className="text-center py-12">
        <ClipboardCheck className="h-12 w-12 mx-auto text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700">Access Denied</h2>
        <p className="text-gray-500">Only Loan Officers can access deal verification.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Deal Verification</h1>
          <p className="text-gray-600">Review matched deals, verify information, and flag discrepancies</p>
        </div>
        <button onClick={loadData} className="btn btn-secondary inline-flex items-center">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6">
          {error}
          <button onClick={() => setError('')} className="float-right">×</button>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg mb-6">
          {success}
          <button onClick={() => setSuccess('')} className="float-right">×</button>
        </div>
      )}

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="card bg-gray-50">
          <p className="text-sm text-gray-600">Total Matches</p>
          <p className="text-2xl font-bold">{matches.length}</p>
        </div>
        <div className="card bg-yellow-50">
          <p className="text-sm text-yellow-600">Pending Review</p>
          <p className="text-2xl font-bold text-yellow-700">
            {matches.filter(m => m.status === 'pending' && !m.decision_notes?.includes('[VERIFIED')).length}
          </p>
        </div>
        <div className="card bg-green-50">
          <p className="text-sm text-green-600">Verified</p>
          <p className="text-2xl font-bold text-green-700">
            {matches.filter(m => m.decision_notes?.includes('[VERIFIED BY LOAN OFFICER]')).length}
          </p>
        </div>
        <div className="card bg-red-50">
          <p className="text-sm text-red-600">Flagged / Info Requested</p>
          <p className="text-2xl font-bold text-red-700">
            {matches.filter(m => m.decision_notes?.includes('[FLAG') || m.status === 'info_requested').length}
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {(['all', 'pending_review', 'verified', 'flagged'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg font-medium ${
              filter === f ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {f === 'all' ? 'All Deals' : f === 'pending_review' ? 'Pending Review' : f === 'verified' ? 'Verified' : 'Flagged'}
          </button>
        ))}
      </div>

      {/* Deals List */}
      {filteredMatches.length === 0 ? (
        <div className="card text-center py-12">
          <ClipboardCheck className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600">No deals to verify.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredMatches.map((match) => {
            const deal = deals[match.deal_id];
            const report = riskReports[match.deal_id];
            const verify = verifications[match.deal_id];
            const isExpanded = expandedDeal === match.deal_id;
            
            if (!deal) return null;

            return (
              <div key={match.id} className="card">
                {/* Header Row */}
                <div 
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedDeal(isExpanded ? null : match.deal_id)}
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <h3 className="font-semibold text-lg">{deal.name}</h3>
                      <p className="text-sm text-gray-500">
                        {deal.industry} • {formatCurrency(deal.loan_amount_requested)} requested
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Match Score</p>
                      <p className="text-lg font-bold text-primary-600">
                        {match.match_score ? `${(match.match_score * 100).toFixed(0)}%` : 'N/A'}
                      </p>
                    </div>
                    {getVerificationBadge(match.deal_id, match.status)}
                    {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="mt-6 border-t pt-6">
                    {/* Borrower Inputs vs Calculated Risks */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                      {/* Borrower Inputs */}
                      <div>
                        <h4 className="font-semibold text-gray-700 mb-4 flex items-center">
                          <FileText className="h-4 w-4 mr-2" />
                          Borrower Reported Values
                        </h4>
                        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Annual Revenue</span>
                            <span className="font-medium">{formatCurrency(deal.annual_revenue)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Gross Profit</span>
                            <span className="font-medium">{formatCurrency(deal.gross_profit)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">EBITDA</span>
                            <span className="font-medium">{formatCurrency(deal.ebitda)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Addbacks</span>
                            <span className="font-medium">
                              {formatCurrency(deal.addbacks?.reduce((sum, a) => sum + a.amount, 0) || 0)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Existing Debt Service</span>
                            <span className="font-medium">{formatCurrency(deal.debt_service || 0)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Owner Credit Score</span>
                            <span className="font-medium">{deal.owner_credit_score || 'N/A'}</span>
                          </div>
                          {deal.deal_type === 'acquisition' && (
                            <>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Purchase Price</span>
                                <span className="font-medium">{formatCurrency(deal.purchase_price || 0)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Equity Injection</span>
                                <span className="font-medium">{formatCurrency(deal.equity_injection || 0)}</span>
                              </div>
                            </>
                          )}
                        </div>
                        
                        {/* Collateral Summary */}
                        <h4 className="font-semibold text-gray-700 mt-4 mb-2">Collateral</h4>
                        <div className="bg-gray-50 rounded-lg p-4">
                          <div className="flex justify-between mb-2">
                            <span className="text-gray-600">Business Assets</span>
                            <span className="font-medium">
                              {formatCurrency(deal.business_assets?.reduce((sum, a) => sum + a.value, 0) || 0)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Personal Assets</span>
                            <span className="font-medium">
                              {formatCurrency(deal.personal_assets?.reduce((sum, a) => sum + a.value, 0) || 0)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Calculated Risks */}
                      <div>
                        <h4 className="font-semibold text-gray-700 mb-4 flex items-center">
                          <TrendingUp className="h-4 w-4 mr-2" />
                          Calculated Risk Metrics
                        </h4>
                        {report ? (
                          <div className="bg-blue-50 rounded-lg p-4 space-y-3">
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600">DSCR (Base)</span>
                              <span className={`font-bold text-lg ${getRiskColor(report.dscr_base, { good: 1.25, warning: 1.0 })}`}>
                                {report.dscr_base?.toFixed(2)}x
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600">DSCR (Stressed)</span>
                              <span className={`font-bold text-lg ${getRiskColor(report.dscr_stress, { good: 1.0, warning: 0.8 })}`}>
                                {report.dscr_stress?.toFixed(2)}x
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600">Probability of Default</span>
                              <span className={`font-bold text-lg ${getRiskColor(report.annual_pd * 100, { good: 3, warning: 5 }, false)}`}>
                                {(report.annual_pd * 100).toFixed(2)}%
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600">Enterprise Value</span>
                              <span className="font-bold text-lg text-gray-800">
                                {formatCurrency(report.ev_mid)}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600">Collateral Coverage</span>
                              <span className={`font-bold text-lg ${getRiskColor(report.collateral_coverage * 100, { good: 80, warning: 50 })}`}>
                                {(report.collateral_coverage * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600">Leverage (Debt/EBITDA)</span>
                              <span className={`font-bold text-lg ${getRiskColor(report.leverage, { good: 3, warning: 4 }, false)}`}>
                                {report.leverage?.toFixed(1)}x
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600">Durability Score</span>
                              <span className={`font-bold text-lg ${getRiskColor(report.durability_score, { good: 70, warning: 50 })}`}>
                                {report.durability_score?.toFixed(0)}/100
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-gray-100 rounded-lg p-4 text-center text-gray-500">
                            Risk analysis not available
                          </div>
                        )}

                        {/* Structuring Recommendations */}
                        {report && (
                          <div className="mt-4">
                            <h4 className="font-semibold text-gray-700 mb-2">Structuring Recommendations</h4>
                            <div className="bg-purple-50 rounded-lg p-4 space-y-2">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Recommended Guarantee</span>
                                <span className="font-medium">{(report.recommended_guarantee_pct * 100).toFixed(0)}%</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Recommended Escrow</span>
                                <span className="font-medium">{(report.recommended_escrow_pct * 100).toFixed(0)}%</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Document Verification Status */}
                    {verify && verify.discrepancies && verify.discrepancies.length > 0 && (
                      <div className="mb-6">
                        <h4 className="font-semibold text-gray-700 mb-4 flex items-center">
                          <AlertTriangle className="h-4 w-4 mr-2 text-yellow-500" />
                          Document Verification Discrepancies
                        </h4>
                        <div className="bg-yellow-50 rounded-lg p-4">
                          <table className="w-full">
                            <thead>
                              <tr className="text-left text-sm text-gray-600">
                                <th className="pb-2">Field</th>
                                <th className="pb-2">Reported</th>
                                <th className="pb-2">Extracted</th>
                                <th className="pb-2">Difference</th>
                                <th className="pb-2">Severity</th>
                              </tr>
                            </thead>
                            <tbody>
                              {verify.discrepancies.map((d, i) => (
                                <tr key={i} className="border-t border-yellow-200">
                                  <td className="py-2 font-medium">{d.field}</td>
                                  <td className="py-2">{formatCurrency(d.reported)}</td>
                                  <td className="py-2">{formatCurrency(d.extracted)}</td>
                                  <td className="py-2">{d.difference_pct.toFixed(1)}%</td>
                                  <td className="py-2">
                                    <span className={`px-2 py-1 rounded text-xs ${
                                      d.severity === 'critical' ? 'bg-red-100 text-red-800' :
                                      d.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                                      'bg-yellow-100 text-yellow-800'
                                    }`}>
                                      {d.severity}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Match Constraints */}
                    <div className="mb-6">
                      <h4 className="font-semibold text-gray-700 mb-4 flex items-center">
                        <Shield className="h-4 w-4 mr-2" />
                        Policy Match Details
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        {match.constraints_met && match.constraints_met.length > 0 && (
                          <div className="bg-green-50 rounded-lg p-4">
                            <p className="font-medium text-green-700 mb-2">✓ Constraints Met</p>
                            <ul className="text-sm text-green-600 space-y-1">
                              {match.constraints_met.map((c: any, i: number) => {
                                // Handle both string and object formats
                                const label = typeof c === 'string' 
                                  ? c 
                                  : String(c.constraint || c.name || 'Constraint');
                                return <li key={i}>{label}</li>;
                              })}
                            </ul>
                          </div>
                        )}
                        {match.constraints_failed && match.constraints_failed.length > 0 && (
                          <div className="bg-red-50 rounded-lg p-4">
                            <p className="font-medium text-red-700 mb-2">✗ Constraints Failed</p>
                            <ul className="text-sm text-red-600 space-y-1">
                              {match.constraints_failed.map((c: any, i: number) => {
                                // Handle both string and object formats
                                if (typeof c === 'string') {
                                  return <li key={i}>{c}</li>;
                                }
                                const label = String(c.constraint || c.name || 'Constraint');
                                const reason = c.reason ? String(c.reason) : '';
                                return (
                                  <li key={i}>
                                    <span className="font-medium">{label}</span>
                                    {reason && <span className="text-red-500"> - {reason}</span>}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Documents */}
                    <div className="mb-6">
                      <h4 className="font-semibold text-gray-700 mb-4 flex items-center">
                        <FileText className="h-4 w-4 mr-2" />
                        Uploaded Documents
                      </h4>
                      {deal.documents && deal.documents.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {deal.documents.map((doc: any) => (
                            <div key={doc.id} className="flex items-center justify-between bg-gray-50 rounded p-2">
                              <div className="flex items-center">
                                <FileText className="h-4 w-4 mr-2 text-gray-400" />
                                <span className="text-sm truncate">{doc.filename}</span>
                              </div>
                              <button
                                onClick={() => api.downloadDocument(deal.id, doc.id, doc.filename)}
                                className="text-primary-600 hover:text-primary-800"
                              >
                                <Download className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500 text-sm">No documents uploaded</p>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-4 border-t">
                      <button
                        onClick={() => handleMarkVerified(match.id, match.deal_id)}
                        disabled={actionLoading === `verify-${match.id}`}
                        className="btn btn-primary inline-flex items-center"
                      >
                        {actionLoading === `verify-${match.id}` ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <CheckCircle className="h-4 w-4 mr-2" />
                        )}
                        Mark as Verified
                      </button>
                      <button
                        onClick={() => setShowInfoRequestModal(match.id)}
                        className="btn btn-secondary inline-flex items-center"
                      >
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Request Information
                      </button>
                      <button
                        onClick={() => setShowFlagModal(match.deal_id)}
                        className="btn bg-yellow-100 text-yellow-800 hover:bg-yellow-200 inline-flex items-center"
                      >
                        <Flag className="h-4 w-4 mr-2" />
                        Flag Discrepancy
                      </button>
                      <Link
                        href={`/dashboard/deals/${match.deal_id}`}
                        className="btn btn-secondary inline-flex items-center"
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Full Deal
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Request Information Modal */}
      {showInfoRequestModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-semibold mb-4">Request Additional Information</h2>
            <p className="text-gray-600 mb-4">
              Describe what additional documents or information you need from the borrower.
            </p>
            <textarea
              value={infoRequestMessage}
              onChange={(e) => setInfoRequestMessage(e.target.value)}
              className="input w-full h-32"
              placeholder="Please provide the following documents:&#10;- Last 3 months bank statements&#10;- Accounts receivable aging report&#10;- Updated financial projections"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => { setShowInfoRequestModal(null); setInfoRequestMessage(''); }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRequestInfo(showInfoRequestModal)}
                disabled={actionLoading === `info-${showInfoRequestModal}`}
                className="btn btn-primary inline-flex items-center"
              >
                {actionLoading === `info-${showInfoRequestModal}` ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Send Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flag Discrepancy Modal */}
      {showFlagModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-semibold mb-4">Flag Data Discrepancy</h2>
            <div className="space-y-4">
              <div>
                <label className="label">Field Name *</label>
                <input
                  type="text"
                  value={newFlag.field}
                  onChange={(e) => setNewFlag({ ...newFlag, field: e.target.value })}
                  className="input"
                  placeholder="e.g., Annual Revenue, EBITDA, Inventory Value"
                />
              </div>
              <div>
                <label className="label">Reported Value</label>
                <input
                  type="text"
                  value={newFlag.reported_value}
                  onChange={(e) => setNewFlag({ ...newFlag, reported_value: e.target.value })}
                  className="input"
                  placeholder="Value shown in the deal"
                />
              </div>
              <div>
                <label className="label">Severity *</label>
                <select
                  value={newFlag.severity}
                  onChange={(e) => setNewFlag({ ...newFlag, severity: e.target.value as any })}
                  className="input"
                >
                  <option value="low">Low - Minor discrepancy</option>
                  <option value="medium">Medium - Needs clarification</option>
                  <option value="high">High - Significant issue</option>
                  <option value="critical">Critical - Major red flag</option>
                </select>
              </div>
              <div>
                <label className="label">Notes / Issue Description *</label>
                <textarea
                  value={newFlag.notes}
                  onChange={(e) => setNewFlag({ ...newFlag, notes: e.target.value })}
                  className="input h-24"
                  placeholder="Describe the discrepancy or concern..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowFlagModal(null); setNewFlag({ field: '', reported_value: '', flagged_value: '', severity: 'medium', notes: '' }); }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSubmitFlag(showFlagModal)}
                disabled={actionLoading === `flag-${showFlagModal}`}
                className="btn bg-yellow-500 text-white hover:bg-yellow-600 inline-flex items-center"
              >
                {actionLoading === `flag-${showFlagModal}` ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Flag className="h-4 w-4 mr-2" />
                )}
                Add Flag
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
