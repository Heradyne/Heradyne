'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Upload, Play, Users, FileText, AlertTriangle, CheckCircle, XCircle, MessageSquare, Bell, Download, Brain, Zap, RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { Deal, DealRiskReport, DealMatch } from '@/types';
import { formatCurrency, formatPercent, formatDate, getStatusColor, DISCLAIMER } from '@/lib/utils';

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

export default function DealDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const dealId = parseInt(params.id as string);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [deal, setDeal] = useState<Deal & { documents: any[]; risk_reports: DealRiskReport[] } | null>(null);
  const [matches, setMatches] = useState<DealMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [uwData, setUwData] = useState<any>(null);
  const [uwLoading, setUwLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<{role:string;content:string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);


  useEffect(() => {
    loadDeal();
  }, [dealId]);

  const loadDeal = async () => {
    try {
      console.log('Loading deal:', dealId);
      const dealData = await api.getDeal(dealId);
      console.log('Deal loaded:', dealData);
      setDeal(dealData);
      if (dealData.risk_reports?.length > 0) {
        loadUWData(parseInt(params.id as string));
      }
      
      // Load matches for all non-draft deals (so borrowers can see info requests)
      if (dealData.status !== 'draft') {
        try {
          const matchData = await api.getDealMatches(dealId);
          setMatches(matchData);
        } catch (e) {
          // Might not have permission, that's ok
          console.log('Could not load matches:', e);
        }
      }
    } catch (err: any) {
      console.error('Failed to load deal:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to load deal');
    } finally {
      setLoading(false);
    }
  };


  const loadUWData = async (id: number) => {
    setUwLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/underwriting/deals/${id}/full-underwriting`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUwData(data);
      }
    } catch (e) {
      // UW data optional — don't block page
    } finally {
      setUwLoading(false);
    }
  };


  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    const newHistory = [...chatMessages, {role: 'user', content: userMsg}];
    setChatMessages(newHistory);
    setChatLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/chat/deals/${dealId}/chat`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`},
          body: JSON.stringify({message: userMsg, history: chatMessages.slice(-6)}),
        }
      );
      if (res.ok) {
        const data = await res.json();
        setChatMessages([...newHistory, {role: 'assistant', content: data.reply}]);
      } else {
        setChatMessages([...newHistory, {role: 'assistant', content: 'AI advisor unavailable. Check that ANTHROPIC_API_KEY is set.'}]);
      }
    } catch (e) {
      setChatMessages([...newHistory, {role: 'assistant', content: 'Connection error. Please try again.'}]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleAIAnalysis = async () => {
    setAiLoading(true);
    setError('');
    try {
      const result = await api.scoreDealWithAIAgent(dealId);
      setAiAnalysis(result);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'AI analysis failed');
    } finally {
      setAiLoading(false);
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

  const handleSubmit = async () => {
    setActionLoading(true);
    setError('');
    try {
      await api.submitDeal(dealId);
      setSuccess('Deal submitted for analysis');
      await loadDeal();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to submit deal');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRunMatching = async () => {
    setActionLoading(true);
    setError('');
    try {
      await api.runMatching(dealId);
      setSuccess('Matching complete');
      await loadDeal();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to run matching');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadLoading(true);
    setError('');
    setSuccess('');

    try {
      // Determine document type based on filename
      let documentType = 'other';
      const filename = file.name.toLowerCase();
      if (filename.includes('tax') || filename.includes('1120') || filename.includes('1065')) {
        documentType = 'tax_return';
      } else if (filename.includes('financial') || filename.includes('statement')) {
        documentType = 'financial_statement';
      } else if (filename.includes('bank')) {
        documentType = 'bank_statement';
      } else if (filename.includes('p&l') || filename.includes('profit') || filename.includes('loss')) {
        documentType = 'profit_loss';
      }

      await api.uploadDocument(dealId, file, documentType);
      setSuccess(`Uploaded ${file.name}`);
      await loadDeal();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to upload document');
    } finally {
      setUploadLoading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">
          {error || 'Deal not found or you do not have permission to view it.'}
        </p>
        <Link 
          href={user?.role === 'borrower' || user?.role === 'admin' ? '/dashboard/deals' : '/dashboard/matches'}
          className="text-primary-600 hover:underline"
        >
          ← Go back
        </Link>
      </div>
    );
  }

  const latestReport = deal.risk_reports?.[0];
  
  // Find matches with info requests
  const infoRequests = matches.filter(m => m.status === 'info_requested');
  const hasInfoRequests = infoRequests.length > 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link 
          href={user?.role === 'borrower' || user?.role === 'admin' ? '/dashboard/deals' : '/dashboard/matches'} 
          className="text-primary-600 hover:underline inline-flex items-center mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> 
          {user?.role === 'borrower' || user?.role === 'admin' ? 'Back to Deals' : 'Back to Matched Deals'}
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{deal.name}</h1>
            <p className="text-gray-600 capitalize">{deal.deal_type} • {deal.industry.replace('_', ' ')}</p>
          </div>
          <span className={`badge ${getStatusColor(deal.status)} text-sm px-3 py-1`}>
            {deal.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg mb-6">
          {success}
        </div>
      )}

      {/* AI Agent Analysis Card - Only for non-borrowers */}
      {user?.role !== 'borrower' && (
        <div className="card mb-6 border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-white">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <Brain className="h-6 w-6 text-purple-600 mr-3" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900">AI Risk Analysis</h2>
                <p className="text-sm text-gray-500">62-variable scoring powered by FOIA data</p>
              </div>
            </div>
            {!aiAnalysis && (
              <button
                onClick={handleAIAnalysis}
                disabled={aiLoading}
                className="btn bg-purple-600 hover:bg-purple-700 text-white inline-flex items-center px-6"
              >
                {aiLoading ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Zap className="h-5 w-5 mr-2" />
                    Run AI Analysis
                  </>
                )}
              </button>
            )}
          </div>

          {aiAnalysis ? (
            <div>
              {/* Score and Tier */}
              <div className="flex items-center justify-between mb-6 p-4 bg-purple-100 rounded-lg">
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <p className="text-5xl font-bold text-purple-700">{aiAnalysis.composite_score}</p>
                    <p className="text-sm text-purple-600">Score</p>
                  </div>
                  <div className={`px-6 py-3 rounded-lg border-2 ${getTierColor(aiAnalysis.tier)}`}>
                    <p className="text-xl font-bold">{aiAnalysis.tier_display}</p>
                    <p className="text-sm capitalize">{aiAnalysis.decision?.replace('_', ' ')}</p>
                  </div>
                </div>
                <button
                  onClick={handleAIAnalysis}
                  disabled={aiLoading}
                  className="text-purple-600 hover:text-purple-800 inline-flex items-center"
                >
                  {aiLoading ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                  Re-analyze
                </button>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white border rounded-lg p-3 text-center">
                  <p className="text-gray-500 text-sm">Recommended Premium</p>
                  <p className="text-2xl font-bold text-gray-800">{(aiAnalysis.recommended_premium * 100).toFixed(2)}%</p>
                </div>
                <div className="bg-white border rounded-lg p-3 text-center">
                  <p className="text-gray-500 text-sm">Expected Default Rate</p>
                  <p className="text-2xl font-bold text-gray-800">{(aiAnalysis.expected_annual_default_rate * 100).toFixed(2)}%</p>
                </div>
                <div className="bg-white border rounded-lg p-3 text-center">
                  <p className="text-gray-500 text-sm">FOIA Benchmark</p>
                  <p className="text-2xl font-bold text-gray-800">{(aiAnalysis.foia_benchmark_rate * 100).toFixed(2)}%</p>
                </div>
                <div className="bg-white border rounded-lg p-3 text-center">
                  <p className="text-gray-500 text-sm">Monitoring Frequency</p>
                  <p className="text-2xl font-bold text-gray-800 capitalize">{aiAnalysis.monitoring_frequency}</p>
                </div>
              </div>

              {/* Risk Flags and Positive Factors */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {aiAnalysis.risk_flags && aiAnalysis.risk_flags.length > 0 && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <h4 className="font-medium text-orange-800 mb-2 flex items-center">
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Risk Flags ({aiAnalysis.risk_flags.length})
                    </h4>
                    <ul className="space-y-1">
                      {aiAnalysis.risk_flags.map((flag: any, i: number) => (
                        <li key={i} className="text-sm text-orange-700 flex items-start">
                          <span className="mr-2">•</span>
                          <span>{typeof flag === 'object' ? `${flag.flag}${flag.value ? ` (${flag.value})` : ''}` : flag}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {aiAnalysis.positive_factors && aiAnalysis.positive_factors.length > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h4 className="font-medium text-green-800 mb-2 flex items-center">
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Positive Factors ({aiAnalysis.positive_factors.length})
                    </h4>
                    <ul className="space-y-1">
                      {aiAnalysis.positive_factors.map((factor: any, i: number) => (
                        <li key={i} className="text-sm text-green-700 flex items-start">
                          <span className="mr-2">•</span>
                          <span>{typeof factor === 'object' ? `${factor.factor}${factor.value ? ` (${factor.value})` : ''}` : factor}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-gray-500">
              <Brain className="h-12 w-12 mx-auto mb-3 text-purple-300" />
              <p>Click "Run AI Analysis" to score this deal across 62 risk variables</p>
              <p className="text-sm mt-1">Analysis includes: structural, geographic, financial, operator, and asset factors</p>
            </div>
          )}
        </div>
      )}

      {/* Information Requests Alert - Show prominently for borrowers */}
      {user?.role === 'borrower' && hasInfoRequests && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4 mb-6">
          <div className="flex items-start">
            <Bell className="h-6 w-6 text-amber-600 mr-3 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-amber-800 mb-2">
                Action Required: {infoRequests.length} Information Request{infoRequests.length > 1 ? 's' : ''}
              </h3>
              <div className="space-y-3">
                {infoRequests.map((match) => (
                  <div key={match.id} className="bg-white rounded-lg p-3 border border-amber-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700">
                        {match.lender_policy_id ? 'Lender' : 'Insurer'} Request
                      </span>
                      <span className="text-xs text-gray-500">
                        {match.decision_at && formatDate(match.decision_at)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-800 bg-amber-50 p-2 rounded">
                      <MessageSquare className="h-4 w-4 inline mr-1 text-amber-600" />
                      {match.decision_notes || 'Additional information requested'}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      Please upload the requested documents below to continue the review process.
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      {user?.role === 'borrower' && (
        <div className="card mb-6">
          <div className="flex gap-4">
            {deal.status === 'draft' && (
              <button onClick={handleSubmit} disabled={actionLoading} className="btn btn-primary">
                <Play className="h-4 w-4 mr-2 inline" />
                Submit for Analysis
              </button>
            )}
            {deal.status === 'analyzed' && (
              <button onClick={handleRunMatching} disabled={actionLoading} className="btn btn-primary">
                <Users className="h-4 w-4 mr-2 inline" />
                Run Matching
              </button>
            )}
            {deal.status === 'draft' && (
              <Link href={`/dashboard/deals/${dealId}/edit`} className="btn btn-secondary">
                Edit Deal
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Deal Summary */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Deal Summary</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Loan Requested</p>
                <p className="text-xl font-semibold">{formatCurrency(deal.loan_amount_requested)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Term</p>
                <p className="text-xl font-semibold">{deal.loan_term_months} months</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Annual Revenue</p>
                <p className="text-lg font-medium">{formatCurrency(deal.annual_revenue)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">EBITDA</p>
                <p className="text-lg font-medium">{formatCurrency(deal.ebitda)}</p>
              </div>
              {deal.purchase_price && (
                <div>
                  <p className="text-sm text-gray-500">Purchase Price</p>
                  <p className="text-lg font-medium">{formatCurrency(deal.purchase_price)}</p>
                </div>
              )}
              {deal.owner_credit_score && (
                <div>
                  <p className="text-sm text-gray-500">Owner Credit Score</p>
                  <p className="text-lg font-medium">{deal.owner_credit_score}</p>
                </div>
              )}
            </div>
            {deal.business_description && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-gray-500 mb-1">Description</p>
                <p className="text-gray-700">{deal.business_description}</p>
              </div>
            )}
          </div>

          {/* Risk Report */}
          {latestReport && (
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">
                Risk Analysis <span className="text-sm font-normal text-gray-500">(v{latestReport.version})</span>
              </h2>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="text-xs text-blue-600 uppercase">DSCR (Base)</p>
                  <p className="text-2xl font-bold text-blue-700">{latestReport.dscr_base?.toFixed(2)}x</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-3">
                  <p className="text-xs text-purple-600 uppercase">Annual PD</p>
                  <p className="text-2xl font-bold text-purple-700">{formatPercent(latestReport.annual_pd || 0)}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3">
                  <p className="text-xs text-green-600 uppercase">EV (Mid)</p>
                  <p className="text-2xl font-bold text-green-700">{formatCurrency(latestReport.ev_mid || 0)}</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-3">
                  <p className="text-xs text-orange-600 uppercase">Collateral</p>
                  <p className="text-2xl font-bold text-orange-700">{formatPercent(latestReport.collateral_coverage || 0)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="font-medium text-gray-700 mb-2">Cash Flow Analysis</h3>
                  <dl className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Normalized EBITDA</dt>
                      <dd>{formatCurrency(latestReport.normalized_ebitda || 0)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Post-Debt FCF</dt>
                      <dd>{formatCurrency(latestReport.post_debt_fcf || 0)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">DSCR (Stress)</dt>
                      <dd>{latestReport.dscr_stress?.toFixed(2)}x</dd>
                    </div>
                  </dl>
                </div>
                <div>
                  <h3 className="font-medium text-gray-700 mb-2">Structuring</h3>
                  <dl className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Rec. Guarantee</dt>
                      <dd>{formatPercent(latestReport.recommended_guarantee_pct || 0)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Rec. Escrow</dt>
                      <dd>{formatPercent(latestReport.recommended_escrow_pct || 0)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Durability Score</dt>
                      <dd>{latestReport.durability_score}/100</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
          )}

          {/* UnderwriteOS Analysis */}
          {latestReport && (
            <div className="space-y-4">
              
              {/* Deal Verdict Banner */}
              {uwData?.deal_killer && (
                <div className={`rounded-xl p-5 border ${
                  uwData.deal_killer.verdict === 'buy' ? 'bg-green-50 border-green-200' :
                  uwData.deal_killer.verdict === 'renegotiate' ? 'bg-yellow-50 border-yellow-200' :
                  'bg-red-50 border-red-200'
                }`}>
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{color: uwData.deal_killer.verdict === 'buy' ? '#166534' : uwData.deal_killer.verdict === 'renegotiate' ? '#854d0e' : '#991b1b'}}>
                        UnderwriteOS — Deal Verdict
                      </p>
                      <h2 className="text-xl font-bold text-gray-900">
                        {uwData.deal_killer.verdict === 'buy' ? '✓ Buy — deal passes all thresholds' :
                         uwData.deal_killer.verdict === 'renegotiate' ? '⚠ Renegotiate — addressable issues found' :
                         '✕ Pass — material concerns at current price'}
                      </h2>
                      <p className="text-sm text-gray-600 mt-1">
                        Confidence score: {uwData.deal_killer.confidence_score?.toFixed(0)}/100 · 
                        Max supportable price: {uwData.deal_killer.max_supportable_price ? formatCurrency(uwData.deal_killer.max_supportable_price) : 'N/A'}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold" style={{color: uwData.deal_killer.verdict === 'buy' ? '#166534' : uwData.deal_killer.verdict === 'renegotiate' ? '#854d0e' : '#991b1b'}}>
                        {uwData.deal_killer.confidence_score?.toFixed(0)}
                      </div>
                      <div className="text-xs text-gray-500">deal score / 100</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Health Score + PDSCR + Runway row */}
              {uwData?.health_score && (
                <div className="card">
                  <h2 className="text-lg font-semibold mb-4">UnderwriteOS — Health Score &amp; PDSCR</h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className={`rounded-lg p-3 ${(uwData.health_score.score || 0) >= 70 ? 'bg-green-50' : (uwData.health_score.score || 0) >= 50 ? 'bg-yellow-50' : 'bg-red-50'}`}>
                      <p className="text-xs uppercase font-semibold mb-1" style={{color: (uwData.health_score.score || 0) >= 70 ? '#166534' : (uwData.health_score.score || 0) >= 50 ? '#854d0e' : '#991b1b'}}>Health Score</p>
                      <p className="text-2xl font-bold" style={{color: (uwData.health_score.score || 0) >= 70 ? '#15803d' : (uwData.health_score.score || 0) >= 50 ? '#ca8a04' : '#dc2626'}}>
                        {uwData.health_score.score?.toFixed(0)}/100
                      </p>
                    </div>
                    <div className={`rounded-lg p-3 ${(uwData.dscr_pdscr?.pdscr || 0) >= 1.25 ? 'bg-green-50' : (uwData.dscr_pdscr?.pdscr || 0) >= 1.0 ? 'bg-yellow-50' : 'bg-red-50'}`}>
                      <p className="text-xs uppercase font-semibold mb-1 text-gray-600">PDSCR (post-draw)</p>
                      <p className="text-2xl font-bold text-gray-900">{uwData.dscr_pdscr?.pdscr?.toFixed(2)}x</p>
                    </div>
                    <div className={`rounded-lg p-3 ${(uwData.cash_flow_forecast?.runway_months || 0) >= 6 ? 'bg-green-50' : (uwData.cash_flow_forecast?.runway_months || 0) >= 2 ? 'bg-yellow-50' : 'bg-red-50'}`}>
                      <p className="text-xs uppercase font-semibold mb-1 text-gray-600">Cash Runway</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {uwData.cash_flow_forecast?.runway_months === 18 ? '18+ mo' : `${uwData.cash_flow_forecast?.runway_months?.toFixed(1)} mo`}
                      </p>
                    </div>
                    <div className={`rounded-lg p-3 ${uwData.sba_eligibility?.eligible ? 'bg-green-50' : 'bg-red-50'}`}>
                      <p className="text-xs uppercase font-semibold mb-1 text-gray-600">SBA 7(a) Eligible</p>
                      <p className="text-2xl font-bold" style={{color: uwData.sba_eligibility?.eligible ? '#15803d' : '#dc2626'}}>
                        {uwData.sba_eligibility?.eligible ? '✓ Yes' : '✕ No'}
                      </p>
                    </div>
                  </div>
                  {/* Health subscores */}
                  <div className="grid grid-cols-5 gap-2">
                    {[
                      {label: 'Cash Flow', val: uwData.health_score.cashflow},
                      {label: 'Stability', val: uwData.health_score.stability},
                      {label: 'Growth', val: uwData.health_score.growth},
                      {label: 'Liquidity', val: uwData.health_score.liquidity},
                      {label: 'Distress', val: uwData.health_score.distress},
                    ].map(s => (
                      <div key={s.label} className="text-center bg-gray-50 rounded p-2">
                        <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                        <p className="font-bold text-sm">{s.val?.toFixed(0)}/20</p>
                        <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                          <div className="h-1.5 rounded-full bg-blue-500" style={{width: `${Math.min(100, ((s.val || 0)/20)*100)}%`}}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Valuation — 5 Methods + EV→Equity Bridge */}
              {uwData?.valuation && (
                <div className="card">
                  <h2 className="text-lg font-semibold mb-4">UnderwriteOS — Valuation (5 Methods + Equity Bridge)</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="pb-2 text-gray-500 font-medium">Method</th>
                          <th className="pb-2 text-gray-500 font-medium text-right">Enterprise Value</th>
                          <th className="pb-2 text-gray-500 font-medium text-right">Equity Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {[
                          {method: 'SDE Multiple (primary)', ev: null, eq: null, evLow: uwData.valuation.ev_sde_low, evHigh: uwData.valuation.ev_sde_high, eqLow: null, note: 'Range'},
                          {method: 'EBITDA Multiple', ev: uwData.valuation.ev_ebitda, eq: uwData.valuation.equity_ebitda},
                          {method: 'DCF (5-year, 20% discount)', ev: uwData.valuation.ev_dcf, eq: uwData.valuation.equity_dcf},
                          {method: 'Revenue Multiple', ev: uwData.valuation.ev_revenue, eq: uwData.valuation.equity_revenue},
                          {method: 'Asset-based ⚠ book value', ev: uwData.valuation.ev_asset, eq: uwData.valuation.equity_asset},
                        ].map(row => (
                          <tr key={row.method} className="py-2">
                            <td className="py-2 text-gray-600">{row.method}</td>
                            <td className="py-2 text-right font-medium">
                              {row.evLow ? `${formatCurrency(row.evLow)} – ${formatCurrency(row.evHigh)}` : formatCurrency(row.ev || 0)}
                            </td>
                            <td className="py-2 text-right text-green-700 font-medium">
                              {row.eq ? formatCurrency(row.eq) : '—'}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-blue-50 font-semibold">
                          <td className="py-2 px-1 rounded-l text-blue-800">Blended (weighted)</td>
                          <td className="py-2 text-right text-blue-800">{formatCurrency(uwData.valuation.ev_blended || 0)}</td>
                          <td className="py-2 text-right text-green-700 rounded-r">{formatCurrency(uwData.valuation.equity_value_mid || 0)}</td>
                        </tr>
                      </tbody>
                    </table>
                    <p className="text-xs text-gray-400 mt-2">Net debt deducted: {formatCurrency(uwData.valuation.net_debt || 0)} · Equity value = EV − net debt · SDE multiple (ask): {uwData.valuation.sde_multiple_implied?.toFixed(1)}×</p>
                  </div>
                </div>
              )}

              {/* Playbooks */}
              {uwData?.playbooks && uwData.playbooks.length > 0 && (
                <div className="card">
                  <h2 className="text-lg font-semibold mb-4">UnderwriteOS — Actionable Playbooks</h2>
                  <div className="space-y-3">
                    {uwData.playbooks.map((pb: any, i: number) => (
                      <div key={i} className={`rounded-lg p-4 border ${
                        pb.severity === 'critical' ? 'bg-red-50 border-red-200' :
                        pb.severity === 'warning' ? 'bg-yellow-50 border-yellow-200' :
                        'bg-green-50 border-green-200'
                      }`}>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded mr-2 ${
                              pb.severity === 'critical' ? 'bg-red-100 text-red-700' :
                              pb.severity === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-green-100 text-green-700'
                            }`}>{pb.severity}</span>
                            <span className="font-semibold text-gray-900">{pb.title}</span>
                          </div>
                          {pb.estimated_annual_impact > 0 && (
                            <span className="text-sm font-bold text-green-700 whitespace-nowrap">
                              +{formatCurrency(pb.estimated_annual_impact)}/yr
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mb-3">{pb.impact_summary}</p>
                        <div className="space-y-1">
                          {pb.actions?.map((action: any, j: number) => (
                            <div key={j} className="flex gap-2 text-sm bg-white rounded p-2 border border-gray-100">
                              <span className="font-bold text-gray-400 flex-shrink-0">{action.step}.</span>
                              <div>
                                <span className="text-xs uppercase font-semibold text-gray-400 block">{action.label}</span>
                                {action.detail}
                                {action.dollar_impact > 0 && (
                                  <span className="text-green-600 font-semibold ml-1">({formatCurrency(action.dollar_impact)})</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}


              {/* AI Deal Chat */}
              <div className="card">
                <h2 className="text-lg font-semibold mb-1">UnderwriteOS — AI Deal Advisor</h2>
                <p className="text-xs text-gray-400 mb-4">Ask anything about this deal — DSCR, valuation, risks, next steps. Powered by Claude with full deal context.</p>
                {/* Message history */}
                <div className="space-y-3 mb-4 max-h-80 overflow-y-auto">
                  {chatMessages.length === 0 && (
                    <div className="flex flex-wrap gap-2">
                      {[
                        "What's the biggest risk in this deal?",
                        "Should I renegotiate the price?",
                        "What playbook should I execute first?",
                        "Is this SBA 7(a) fundable?",
                        "What happens to DSCR if I lose my top customer?",
                      ].map(q => (
                        <button key={q} onClick={() => { setChatInput(q); }}
                          className="text-xs px-3 py-1.5 rounded-full border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors">
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`rounded-xl px-4 py-3 max-w-[85%] text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-50 border border-gray-200 text-gray-800'
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-400">
                        <span className="animate-pulse">Analyzing deal...</span>
                      </div>
                    </div>
                  )}
                </div>
                {/* Input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendChat()}
                    placeholder="Ask about this deal..."
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-400"
                    disabled={chatLoading}
                  />
                  <button
                    onClick={sendChat}
                    disabled={chatLoading || !chatInput.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
                  >
                    Send
                  </button>
                </div>
                <p className="text-xs text-gray-300 mt-2">Requires ANTHROPIC_API_KEY · Responses use full deal data including health score, PDSCR, valuation, and playbooks</p>
              </div>

              {/* Breakpoint Scenarios */}
              {uwData?.deal_killer?.breakpoint_scenarios && (
                <div className="card">
                  <h2 className="text-lg font-semibold mb-4">UnderwriteOS — Deal Breakpoint Scenarios</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="pb-2 text-gray-500 font-medium">Scenario</th>
                          <th className="pb-2 text-gray-500 font-medium text-right">DSCR</th>
                          <th className="pb-2 text-gray-500 font-medium text-right">Max Price</th>
                          <th className="pb-2 text-gray-500 font-medium text-right">Verdict</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {uwData.deal_killer.breakpoint_scenarios.map((s: any, i: number) => (
                          <tr key={i} className={i === 0 ? 'bg-green-50' : ''}>
                            <td className="py-2 text-gray-700">{s.label}</td>
                            <td className={`py-2 text-right font-medium ${s.dscr >= 1.25 ? 'text-green-700' : s.dscr >= 1.0 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {s.dscr?.toFixed(2)}×
                            </td>
                            <td className="py-2 text-right">{formatCurrency(s.max_supportable_price || 0)}</td>
                            <td className="py-2 text-right">
                              <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                                s.verdict === 'buy' ? 'bg-green-100 text-green-700' :
                                s.verdict === 'renegotiate' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-red-100 text-red-700'
                              }`}>{s.verdict}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">SBA minimum DSCR: 1.25× · SBA-calibrated from 1.59M loan dataset</p>
                </div>
              )}

              {/* SBA 7(a) Checklist */}
              {uwData?.sba_eligibility?.checklist && (
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">UnderwriteOS — SBA 7(a) Eligibility (14-Point)</h2>
                    <span className={`text-sm font-bold px-3 py-1 rounded-full ${uwData.sba_eligibility.eligible ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {uwData.sba_eligibility.eligible ? '✓ Eligible' : '✕ Issues found'}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {uwData.sba_eligibility.checklist.map((item: any, i: number) => (
                      <div key={i} className={`flex items-start gap-3 p-2 rounded text-sm ${item.pass ? 'bg-green-50' : 'bg-red-50'}`}>
                        <span className={`flex-shrink-0 font-bold ${item.pass ? 'text-green-600' : 'text-red-600'}`}>
                          {item.pass ? '✓' : '✕'}
                        </span>
                        <div className="flex-1">
                          <span className={`font-medium ${item.pass ? 'text-green-800' : 'text-red-800'}`}>{item.criterion}</span>
                          <span className="text-gray-500 ml-2 text-xs">{item.note}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {uwData.sba_eligibility.max_loan && (
                    <p className="text-xs text-gray-500 mt-3">Max SBA loan: {formatCurrency(uwData.sba_eligibility.max_loan)} · LTV: {((uwData.sba_eligibility.ltv || 0) * 100).toFixed(1)}%</p>
                  )}
                </div>
              )}

              {uwLoading && (
                <div className="card text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                  <p className="text-sm text-gray-500">Loading UnderwriteOS analysis...</p>
                </div>
              )}

            </div>
          )}

          {/* Matches - Show for all users who can see them */}
          {matches.length > 0 && (
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">
                Policy Matches
                {hasInfoRequests && user?.role === 'borrower' && (
                  <span className="ml-2 text-sm font-normal text-amber-600">
                    ({infoRequests.length} awaiting response)
                  </span>
                )}
              </h2>
              <div className="space-y-4">
                {matches.map((match) => (
                  <MatchCard 
                    key={match.id} 
                    match={match} 
                    userRole={user?.role || ''} 
                    onCounterOfferResponse={async (matchId, response, notes) => {
                      try {
                        await api.respondToCounterOffer(matchId, response, notes);
                        setSuccess(`Counter-offer ${response}`);
                        await loadDeal();
                      } catch (err: any) {
                        setError(err.response?.data?.detail || 'Failed to respond to counter-offer');
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Documents */}
          <div className={`card ${hasInfoRequests ? 'ring-2 ring-amber-300' : ''}`}>
            <h2 className="text-lg font-semibold mb-4">
              Documents
              {hasInfoRequests && (
                <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-100 px-2 py-1 rounded">
                  Upload requested docs
                </span>
              )}
            </h2>
            {deal.documents && deal.documents.length > 0 ? (
              <ul className="space-y-2 mb-4">
                {deal.documents.map((doc: any) => (
                  <li key={doc.id} className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded">
                    <div className="flex items-center min-w-0 flex-1">
                      <FileText className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                      <span className="truncate">{doc.original_filename}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      {doc.document_type && (
                        <span className="text-xs text-gray-500">
                          {doc.document_type.replace('_', ' ')}
                        </span>
                      )}
                      <button
                        onClick={async (e) => {
                          e.preventDefault();
                          await api.downloadDocument(deal.id, doc.id, doc.original_filename);
                        }}
                        className="text-primary-600 hover:text-primary-800 p-1"
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500 mb-4">No documents uploaded</p>
            )}
            
            {/* Hidden file input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg"
            />
            
            {/* Upload button - always visible for borrowers */}
            {user?.role === 'borrower' && (
              <button 
                onClick={handleUploadClick}
                disabled={uploadLoading}
                className={`w-full text-sm flex items-center justify-center ${
                  hasInfoRequests 
                    ? 'btn btn-primary' 
                    : 'btn btn-secondary'
                }`}
              >
                {uploadLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Document
                  </>
                )}
              </button>
            )}
            
            <p className="text-xs text-gray-400 mt-2">
              Supported: PDF, Word, Excel, CSV, Images (max 50MB)
            </p>
          </div>

          {/* Timeline */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Timeline</h2>
            <div className="space-y-3 text-sm">
              <div className="flex items-center">
                <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                <span>Created {formatDate(deal.created_at)}</span>
              </div>
              {deal.status !== 'draft' && (
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                  <span>Submitted</span>
                </div>
              )}
              {latestReport && (
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                  <span>Analyzed {formatDate(latestReport.created_at)}</span>
                </div>
              )}
              {matches.length > 0 && (
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                  <span>Matched to {matches.length} policies</span>
                </div>
              )}
              {hasInfoRequests && (
                <div className="flex items-center text-amber-600">
                  <Bell className="h-4 w-4 mr-2" />
                  <span>Info requested</span>
                </div>
              )}
              {matches.some(m => m.status === 'accepted') && (
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                  <span>Accepted by {matches.filter(m => m.status === 'accepted').length} reviewer(s)</span>
                </div>
              )}
            </div>
          </div>

          {/* Disclaimer */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-800">{DISCLAIMER}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Match Card Component
function MatchCard({ 
  match, 
  userRole, 
  onCounterOfferResponse 
}: { 
  match: DealMatch;
  userRole: string;
  onCounterOfferResponse: (matchId: number, response: 'accepted' | 'rejected', notes?: string) => Promise<void>;
}) {
  const [showCounterOfferModal, setShowCounterOfferModal] = useState(false);
  const [responseLoading, setResponseLoading] = useState(false);
  const [responseNotes, setResponseNotes] = useState('');

  const isCounterOffer = match.status === 'counter_offered';
  const hasCounterOffer = match.counter_offer !== null && match.counter_offer !== undefined;

  const handleResponse = async (response: 'accepted' | 'rejected') => {
    setResponseLoading(true);
    try {
      await onCounterOfferResponse(match.id, response, responseNotes);
      setShowCounterOfferModal(false);
    } finally {
      setResponseLoading(false);
    }
  };

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'counter_offered': return 'Counter-Offer';
      case 'counter_accepted': return 'Counter Accepted';
      case 'counter_rejected': return 'Counter Rejected';
      case 'info_requested': return 'Info Requested';
      default: return status;
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'counter_offered': return 'bg-purple-100 text-purple-800';
      case 'counter_accepted': return 'bg-green-100 text-green-800';
      case 'counter_rejected': return 'bg-red-100 text-red-800';
      case 'info_requested': return 'bg-amber-100 text-amber-800';
      case 'accepted': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className={`border rounded-lg p-4 ${
      isCounterOffer ? 'border-purple-300 bg-purple-50' :
      match.status === 'info_requested' ? 'border-amber-300 bg-amber-50' : ''
    }`}>
      <div className="flex justify-between items-start mb-2">
        <div>
          <p className="font-medium">
            {match.lender_policy_id ? 'Lender' : 'Insurer'} Policy #{match.lender_policy_id || match.insurer_policy_id}
          </p>
          <p className="text-sm text-gray-500">
            Match Score: {match.match_score ? `${(match.match_score * 100).toFixed(0)}%` : '-'}
            {match.auto_decision && (
              <span className="ml-2 text-xs text-blue-600">🤖 Auto-decided</span>
            )}
          </p>
        </div>
        <span className={`badge ${getStatusClass(match.status)}`}>
          {getStatusDisplay(match.status)}
        </span>
      </div>
      
      {/* Auto-decision reason */}
      {match.auto_decision_reason && (
        <div className="mt-2 p-2 rounded text-sm bg-blue-50 text-blue-700">
          <span className="font-medium">Auto-decision:</span> {match.auto_decision_reason}
        </div>
      )}
      
      {/* Counter-offer details */}
      {isCounterOffer && hasCounterOffer && userRole === 'borrower' && (
        <div className="mt-3 p-3 bg-white rounded-lg border border-purple-200">
          <p className="font-medium text-purple-800 mb-2">📋 Counter-Offer Received</p>
          <p className="text-sm text-gray-600 mb-3">{match.counter_offer?.reason}</p>
          
          <div className="space-y-2 mb-3">
            {match.counter_offer?.adjustments?.map((adj: any, i: number) => (
              <div key={i} className="text-sm bg-purple-50 p-2 rounded">
                <span className="font-medium">{adj.field}:</span>{' '}
                <span className="text-red-600 line-through">${adj.original?.toLocaleString()}</span>
                {' → '}
                <span className="text-green-600 font-medium">${adj.proposed?.toLocaleString()}</span>
                <p className="text-xs text-gray-500 mt-1">{adj.reason}</p>
              </div>
            ))}
          </div>
          
          <p className="text-xs text-gray-500 mb-3">
            Expected new match score: {match.counter_offer?.expected_match_score?.toFixed(0)}%
            {match.counter_offer_expires_at && (
              <> • Expires: {new Date(match.counter_offer_expires_at).toLocaleDateString()}</>
            )}
          </p>
          
          <div className="flex gap-2">
            <button
              onClick={() => handleResponse('accepted')}
              disabled={responseLoading}
              className="btn btn-primary text-sm px-4 py-2"
            >
              {responseLoading ? 'Processing...' : '✓ Accept Counter-Offer'}
            </button>
            <button
              onClick={() => setShowCounterOfferModal(true)}
              disabled={responseLoading}
              className="btn btn-secondary text-sm px-4 py-2"
            >
              ✗ Decline
            </button>
          </div>
        </div>
      )}

      {/* Counter-offer accepted/rejected status */}
      {(match.status === 'counter_accepted' || match.status === 'counter_rejected') && match.counter_offer && (
        <div className={`mt-2 p-2 rounded text-sm ${
          match.status === 'counter_accepted' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          Counter-offer was {match.status === 'counter_accepted' ? 'accepted' : 'declined'}
          {match.borrower_response_notes && (
            <p className="mt-1 text-xs">Note: {match.borrower_response_notes}</p>
          )}
        </div>
      )}
      
      {/* Show decision notes (info request message) */}
      {match.decision_notes && !isCounterOffer && (
        <div className={`mt-2 p-2 rounded text-sm ${
          match.status === 'info_requested' 
            ? 'bg-amber-100 text-amber-800' 
            : 'bg-gray-100 text-gray-700'
        }`}>
          <MessageSquare className="h-4 w-4 inline mr-1" />
          {match.decision_notes}
        </div>
      )}
      
      {match.constraints_failed && match.constraints_failed.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-red-600 font-medium mb-1">Failed Constraints:</p>
          <ul className="text-xs text-gray-600">
            {match.constraints_failed.slice(0, 3).map((c: any, i: number) => (
              <li key={i} className="flex items-center">
                <XCircle className="h-3 w-3 text-red-500 mr-1" />
                {c.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Decline modal */}
      {showCounterOfferModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Decline Counter-Offer</h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to decline this counter-offer? You can optionally provide a reason.
            </p>
            <textarea
              value={responseNotes}
              onChange={(e) => setResponseNotes(e.target.value)}
              placeholder="Reason for declining (optional)"
              className="input w-full mb-4"
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCounterOfferModal(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => handleResponse('rejected')}
                disabled={responseLoading}
                className="btn bg-red-600 text-white hover:bg-red-700"
              >
                {responseLoading ? 'Processing...' : 'Decline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
