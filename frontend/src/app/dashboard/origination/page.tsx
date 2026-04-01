'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { 
  DollarSign, Shield, FileCheck, Plus, Check, X, 
  RefreshCw, Building, Percent, Calendar, CreditCard
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils';

interface OriginatableMatch {
  match_id: number;
  deal_id: number;
  deal_name: string;
  borrower_name: string;
  requested_amount: number;
  industry: string;
  state: string | null;
  match_score: number | null;
  status: string;
  accepted_at: string | null;
  has_insurer_acceptance: boolean;
  can_originate: boolean;
}

interface GuaranteeableMatch {
  match_id: number;
  deal_id: number;
  deal_name: string;
  borrower_name: string;
  loan_amount: number | null;
  industry: string;
  state: string | null;
  match_score: number | null;
  status: string;
  has_loan: boolean;
  loan_number: string | null;
  loan_principal: number | null;
}

interface ExecutedLoan {
  id: number;
  loan_number: string;
  borrower_name: string;
  principal_amount: number;
  current_principal_balance: number;
  interest_rate: number;
  term_months: number;
  monthly_payment: number;
  origination_date: string;
  maturity_date: string;
  status: string;
  guarantee_percentage: number | null;
  insurer_name: string | null;
  industry: string;
  state: string | null;
}

export default function OriginationPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Data for lenders
  const [originatableMatches, setOriginatableMatches] = useState<OriginatableMatch[]>([]);
  const [originatedLoans, setOriginatedLoans] = useState<ExecutedLoan[]>([]);
  
  // Data for insurers
  const [guaranteeableMatches, setGuaranteeableMatches] = useState<GuaranteeableMatch[]>([]);
  const [guaranteedLoans, setGuaranteedLoans] = useState<ExecutedLoan[]>([]);
  
  // UI State
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');
  const [showOriginateModal, setShowOriginateModal] = useState(false);
  const [showGuaranteeModal, setShowGuaranteeModal] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<OriginatableMatch | GuaranteeableMatch | null>(null);
  
  // Form state for loan origination
  const [loanForm, setLoanForm] = useState({
    principal_amount: 0,
    interest_rate: 8,
    term_months: 60,
    notes: ''
  });
  
  // Form state for guarantee
  const [guaranteeForm, setGuaranteeForm] = useState({
    guarantee_percentage: 50,
    premium_rate: 2,
    notes: ''
  });

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      
      if (user?.role === 'lender') {
        const [matches, loans] = await Promise.all([
          api.getOriginatableMatches().catch(e => {
            console.error('Error fetching originatable matches:', e);
            return [];
          }),
          api.getMyOriginatedLoans().catch(e => {
            console.error('Error fetching originated loans:', e);
            return [];
          })
        ]);
        setOriginatableMatches(matches);
        setOriginatedLoans(loans);
      } else if (user?.role === 'insurer') {
        const [matches, loans] = await Promise.all([
          api.getGuaranteeableMatches().catch(e => {
            console.error('Error fetching guaranteeable matches:', e);
            return [];
          }),
          api.getMyGuaranteedLoans().catch(e => {
            console.error('Error fetching guaranteed loans:', e);
            return [];
          })
        ]);
        setGuaranteeableMatches(matches);
        setGuaranteedLoans(loans);
      }
    } catch (err: any) {
      console.error('Load data error:', err);
      setError(err.response?.data?.detail || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleOriginateLoan = async () => {
    if (!selectedMatch) return;
    
    try {
      await api.originateLoan({
        match_id: selectedMatch.match_id,
        principal_amount: loanForm.principal_amount,
        interest_rate: loanForm.interest_rate / 100, // Convert to decimal
        term_months: loanForm.term_months,
        notes: loanForm.notes || undefined
      });
      
      setShowOriginateModal(false);
      setSelectedMatch(null);
      setLoanForm({ principal_amount: 0, interest_rate: 8, term_months: 60, notes: '' });
      loadData();
      alert('Loan originated successfully!');
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to originate loan');
    }
  };

  const handleIssueGuarantee = async () => {
    if (!selectedMatch) return;
    
    try {
      const result = await api.issueGuarantee({
        match_id: selectedMatch.match_id,
        guarantee_percentage: guaranteeForm.guarantee_percentage,
        premium_rate: guaranteeForm.premium_rate,
        notes: guaranteeForm.notes || undefined
      });
      
      setShowGuaranteeModal(false);
      setSelectedMatch(null);
      setGuaranteeForm({ guarantee_percentage: 50, premium_rate: 2, notes: '' });
      loadData();
      alert(`Guarantee issued! Contract #: ${result.guarantee_number}`);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to issue guarantee');
    }
  };

  const openOriginateModal = (match: OriginatableMatch) => {
    setSelectedMatch(match);
    setLoanForm({
      ...loanForm,
      principal_amount: match.requested_amount
    });
    setShowOriginateModal(true);
  };

  const openGuaranteeModal = (match: GuaranteeableMatch) => {
    setSelectedMatch(match);
    setShowGuaranteeModal(true);
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      paid_off: 'bg-blue-100 text-blue-800',
      default: 'bg-red-100 text-red-800',
      workout: 'bg-yellow-100 text-yellow-800',
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const isLender = user?.role === 'lender';
  const isInsurer = user?.role === 'insurer';

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isLender ? 'Loan Origination' : 'Guarantee Contracts'}
          </h1>
          <p className="text-gray-600">
            {isLender 
              ? 'Fund accepted deals and manage your loan portfolio'
              : 'Issue guarantee contracts for accepted deals'
            }
          </p>
        </div>
        <button onClick={loadData} className="btn btn-secondary inline-flex items-center">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {isLender && (
          <>
            <div className="card bg-gradient-to-br from-blue-500 to-blue-600 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm">Ready to Originate</p>
                  <p className="text-2xl font-bold">{originatableMatches.length}</p>
                </div>
                <FileCheck className="h-10 w-10 text-blue-200" />
              </div>
            </div>
            <div className="card bg-gradient-to-br from-green-500 to-green-600 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm">Total Originated</p>
                  <p className="text-2xl font-bold">{originatedLoans.length}</p>
                </div>
                <CreditCard className="h-10 w-10 text-green-200" />
              </div>
            </div>
            <div className="card bg-gradient-to-br from-purple-500 to-purple-600 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 text-sm">Total Principal</p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(originatedLoans.reduce((sum, l) => sum + l.principal_amount, 0))}
                  </p>
                </div>
                <DollarSign className="h-10 w-10 text-purple-200" />
              </div>
            </div>
          </>
        )}
        
        {isInsurer && (
          <>
            <div className="card bg-gradient-to-br from-purple-500 to-purple-600 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 text-sm">Ready to Guarantee</p>
                  <p className="text-2xl font-bold">{guaranteeableMatches.length}</p>
                </div>
                <Shield className="h-10 w-10 text-purple-200" />
              </div>
            </div>
            <div className="card bg-gradient-to-br from-green-500 to-green-600 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm">Total Guarantees</p>
                  <p className="text-2xl font-bold">{guaranteedLoans.length}</p>
                </div>
                <FileCheck className="h-10 w-10 text-green-200" />
              </div>
            </div>
            <div className="card bg-gradient-to-br from-blue-500 to-blue-600 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm">Total Exposure</p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(guaranteedLoans.reduce((sum, l) => 
                      sum + (l.principal_amount * (l.guarantee_percentage || 0)), 0
                    ))}
                  </p>
                </div>
                <DollarSign className="h-10 w-10 text-blue-200" />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('pending')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'pending'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {isLender ? `Pending Originations (${originatableMatches.length})` : `Pending Guarantees (${guaranteeableMatches.length})`}
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'completed'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {isLender ? `Originated Loans (${originatedLoans.length})` : `Guaranteed Loans (${guaranteedLoans.length})`}
          </button>
        </nav>
      </div>

      {/* Pending Tab - Lender */}
      {activeTab === 'pending' && isLender && (
        <div>
          {originatableMatches.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FileCheck className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p>No deals ready for origination.</p>
              <p className="text-sm">Accept deals in the Matched Deals page first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {originatableMatches.map((match) => (
                <div key={match.match_id} className="card hover:shadow-lg transition-shadow">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-xs text-gray-500">Match #{match.match_id}</span>
                    <div className="flex gap-1">
                      {match.has_insurer_acceptance ? (
                        <span className="bg-purple-100 text-purple-800 px-2 py-1 text-xs rounded-full">
                          Insurer Accepted
                        </span>
                      ) : (
                        <span className="bg-yellow-100 text-yellow-800 px-2 py-1 text-xs rounded-full">
                          No Insurer
                        </span>
                      )}
                      <span className="bg-green-100 text-green-800 px-2 py-1 text-xs rounded-full">
                        {match.status}
                      </span>
                    </div>
                  </div>
                  
                  <h3 className="font-semibold text-lg mb-1">{match.deal_name}</h3>
                  <p className="text-gray-600 text-sm mb-3">{match.borrower_name}</p>
                  
                  <div className="space-y-2 text-sm mb-4">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Requested Amount</span>
                      <span className="font-semibold">{formatCurrency(match.requested_amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Industry</span>
                      <span className="capitalize">{match.industry}</span>
                    </div>
                    {match.state && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">State</span>
                        <span>{match.state}</span>
                      </div>
                    )}
                    {match.match_score && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Match Score</span>
                        <span>{match.match_score.toFixed(0)}%</span>
                      </div>
                    )}
                  </div>
                  
                  {match.can_originate ? (
                    <button
                      onClick={() => openOriginateModal(match)}
                      className="btn btn-primary w-full"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Originate Loan
                    </button>
                  ) : (
                    <div className="text-center">
                      <div className="bg-orange-100 text-orange-800 px-3 py-2 rounded-lg text-sm mb-2">
                        <Shield className="h-4 w-4 inline mr-1" />
                        Awaiting Insurer/Fund Acceptance
                      </div>
                      <p className="text-xs text-gray-500">
                        An insurer or fund must accept this deal before you can originate the loan.
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pending Tab - Insurer */}
      {activeTab === 'pending' && isInsurer && (
        <div>
          {guaranteeableMatches.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Shield className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p>No deals ready for guarantee.</p>
              <p className="text-sm">Accept deals in the Matched Deals page first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {guaranteeableMatches.map((match) => (
                <div key={match.match_id} className="card hover:shadow-lg transition-shadow">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-xs text-gray-500">Match #{match.match_id}</span>
                    {match.has_loan ? (
                      <span className="bg-blue-100 text-blue-800 px-2 py-1 text-xs rounded-full">
                        Loan Funded
                      </span>
                    ) : (
                      <span className="bg-yellow-100 text-yellow-800 px-2 py-1 text-xs rounded-full">
                        Awaiting Loan
                      </span>
                    )}
                  </div>
                  
                  <h3 className="font-semibold text-lg mb-1">{match.deal_name}</h3>
                  <p className="text-gray-600 text-sm mb-3">{match.borrower_name}</p>
                  
                  <div className="space-y-2 text-sm mb-4">
                    {match.has_loan ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Loan Number</span>
                          <span className="font-mono text-xs">{match.loan_number}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Principal</span>
                          <span className="font-semibold">{formatCurrency(match.loan_principal || 0)}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Requested Amount</span>
                        <span className="font-semibold">{formatCurrency(match.loan_amount || 0)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-500">Industry</span>
                      <span className="capitalize">{match.industry}</span>
                    </div>
                    {match.state && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">State</span>
                        <span>{match.state}</span>
                      </div>
                    )}
                  </div>
                  
                  <button
                    onClick={() => openGuaranteeModal(match)}
                    className="btn btn-primary w-full"
                  >
                    <Shield className="h-4 w-4 mr-2" />
                    Issue Guarantee
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Completed Tab */}
      {activeTab === 'completed' && (
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left py-3 px-4">Loan Number</th>
                <th className="text-left py-3 px-4">Borrower</th>
                <th className="text-right py-3 px-4">Principal</th>
                <th className="text-right py-3 px-4">Rate</th>
                <th className="text-right py-3 px-4">Term</th>
                {isInsurer && <th className="text-right py-3 px-4">Guarantee %</th>}
                <th className="text-center py-3 px-4">Status</th>
                <th className="text-left py-3 px-4">Originated</th>
              </tr>
            </thead>
            <tbody>
              {(isLender ? originatedLoans : guaranteedLoans).map((loan) => (
                <tr key={loan.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4 font-mono text-sm">{loan.loan_number}</td>
                  <td className="py-3 px-4">{loan.borrower_name}</td>
                  <td className="py-3 px-4 text-right">{formatCurrency(loan.principal_amount)}</td>
                  <td className="py-3 px-4 text-right">{(loan.interest_rate * 100).toFixed(2)}%</td>
                  <td className="py-3 px-4 text-right">{loan.term_months} mo</td>
                  {isInsurer && (
                    <td className="py-3 px-4 text-right">
                      {loan.guarantee_percentage ? `${(loan.guarantee_percentage * 100).toFixed(0)}%` : '-'}
                    </td>
                  )}
                  <td className="py-3 px-4 text-center">
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadge(loan.status)}`}>
                      {loan.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-500 text-sm">{formatDate(loan.origination_date)}</td>
                </tr>
              ))}
              {((isLender ? originatedLoans : guaranteedLoans).length === 0) && (
                <tr>
                  <td colSpan={isInsurer ? 8 : 7} className="py-8 text-center text-gray-500">
                    No {isLender ? 'originated loans' : 'guaranteed loans'} yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Originate Loan Modal */}
      {showOriginateModal && selectedMatch && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
            <h2 className="text-xl font-semibold mb-4">Originate Loan</h2>
            
            <div className="bg-gray-50 p-3 rounded-lg mb-4">
              <div className="font-medium">{(selectedMatch as OriginatableMatch).deal_name}</div>
              <div className="text-sm text-gray-600">{(selectedMatch as OriginatableMatch).borrower_name}</div>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Principal Amount *
                </label>
                <input
                  type="number"
                  value={loanForm.principal_amount}
                  onChange={(e) => setLoanForm({ ...loanForm, principal_amount: parseFloat(e.target.value) })}
                  className="input w-full"
                  min="0"
                  step="1000"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Interest Rate (%) *
                </label>
                <input
                  type="number"
                  value={loanForm.interest_rate}
                  onChange={(e) => setLoanForm({ ...loanForm, interest_rate: parseFloat(e.target.value) })}
                  className="input w-full"
                  min="0"
                  max="100"
                  step="0.25"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Term (Months) *
                </label>
                <input
                  type="number"
                  value={loanForm.term_months}
                  onChange={(e) => setLoanForm({ ...loanForm, term_months: parseInt(e.target.value) })}
                  className="input w-full"
                  min="1"
                  max="360"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={loanForm.notes}
                  onChange={(e) => setLoanForm({ ...loanForm, notes: e.target.value })}
                  className="input w-full"
                  rows={2}
                />
              </div>
              
              {/* Calculated Payment Preview */}
              {loanForm.principal_amount > 0 && loanForm.interest_rate > 0 && loanForm.term_months > 0 && (
                <div className="bg-blue-50 p-3 rounded-lg text-sm">
                  <div className="flex justify-between mb-1">
                    <span className="text-blue-700">Estimated Monthly Payment:</span>
                    <span className="font-semibold text-blue-800">
                      {formatCurrency(
                        (() => {
                          const r = (loanForm.interest_rate / 100) / 12;
                          const n = loanForm.term_months;
                          const p = loanForm.principal_amount;
                          if (r === 0) return p / n;
                          return p * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
                        })()
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-700">Total Interest:</span>
                    <span className="font-semibold text-blue-800">
                      {formatCurrency(
                        (() => {
                          const r = (loanForm.interest_rate / 100) / 12;
                          const n = loanForm.term_months;
                          const p = loanForm.principal_amount;
                          if (r === 0) return 0;
                          const payment = p * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
                          return (payment * n) - p;
                        })()
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowOriginateModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handleOriginateLoan} className="btn btn-primary">
                <Check className="h-4 w-4 mr-2" />
                Originate Loan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Issue Guarantee Modal */}
      {showGuaranteeModal && selectedMatch && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
            <h2 className="text-xl font-semibold mb-4">Issue Guarantee Contract</h2>
            
            <div className="bg-gray-50 p-3 rounded-lg mb-4">
              <div className="font-medium">{(selectedMatch as GuaranteeableMatch).deal_name}</div>
              <div className="text-sm text-gray-600">{(selectedMatch as GuaranteeableMatch).borrower_name}</div>
              {(selectedMatch as GuaranteeableMatch).has_loan && (
                <div className="text-sm text-blue-600 mt-1">
                  Loan: {(selectedMatch as GuaranteeableMatch).loan_number} - 
                  {formatCurrency((selectedMatch as GuaranteeableMatch).loan_principal || 0)}
                </div>
              )}
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Guarantee Percentage *
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={guaranteeForm.guarantee_percentage}
                    onChange={(e) => setGuaranteeForm({ ...guaranteeForm, guarantee_percentage: parseFloat(e.target.value) })}
                    className="input w-32"
                    min="1"
                    max="100"
                  />
                  <span>%</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Coverage: {formatCurrency(
                    ((selectedMatch as GuaranteeableMatch).loan_principal || (selectedMatch as GuaranteeableMatch).loan_amount || 0) 
                    * (guaranteeForm.guarantee_percentage / 100)
                  )}
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Premium Rate (Annual %) *
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={guaranteeForm.premium_rate}
                    onChange={(e) => setGuaranteeForm({ ...guaranteeForm, premium_rate: parseFloat(e.target.value) })}
                    className="input w-32"
                    min="0"
                    max="100"
                    step="0.25"
                  />
                  <span>%</span>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={guaranteeForm.notes}
                  onChange={(e) => setGuaranteeForm({ ...guaranteeForm, notes: e.target.value })}
                  className="input w-full"
                  rows={2}
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowGuaranteeModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handleIssueGuarantee} className="btn btn-primary">
                <Shield className="h-4 w-4 mr-2" />
                Issue Guarantee
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
