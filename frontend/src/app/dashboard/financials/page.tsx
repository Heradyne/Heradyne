'use client';

import { useEffect, useState } from 'react';
import { 
  DollarSign, TrendingUp, AlertTriangle, PieChart, 
  MapPin, Building2, ChevronDown, ChevronRight, Eye,
  BarChart3, Users, Shield, RefreshCw, FileText
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { 
  LenderDashboardStats, InsurerDashboardStats, AdminDashboardStats,
  ExecutedLoan, User
} from '@/types';
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils';

export default function FinancialsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Dashboard data based on role
  const [lenderStats, setLenderStats] = useState<LenderDashboardStats | null>(null);
  const [insurerStats, setInsurerStats] = useState<InsurerDashboardStats | null>(null);
  const [adminStats, setAdminStats] = useState<AdminDashboardStats | null>(null);
  
  // Loans list
  const [loans, setLoans] = useState<ExecutedLoan[]>([]);
  const [selectedLoan, setSelectedLoan] = useState<ExecutedLoan | null>(null);
  
  // For admin: view by lender/insurer
  const [viewMode, setViewMode] = useState<'overview' | 'lender' | 'insurer'>('overview');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  
  // Expanded sections
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['summary', 'performance', 'concentration', 'loans']));

  useEffect(() => {
    loadData();
  }, [user]);

  useEffect(() => {
    if (user?.role === 'admin' && viewMode !== 'overview' && selectedUserId) {
      loadUserSpecificData();
    }
  }, [viewMode, selectedUserId]);

  const loadData = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      setError('');
      
      if (user.role === 'lender') {
        const [stats, loanData] = await Promise.all([
          api.getLenderDashboard(),
          api.getExecutedLoans()
        ]);
        setLenderStats(stats);
        setLoans(loanData);
      } else if (user.role === 'insurer') {
        const [stats, loanData] = await Promise.all([
          api.getInsurerDashboard(),
          api.getExecutedLoans()
        ]);
        setInsurerStats(stats);
        setLoans(loanData);
      } else if (user.role === 'admin') {
        const [stats, loanData, usersData] = await Promise.all([
          api.getAdminDashboard(),
          api.getExecutedLoans(),
          api.getAllUsers()
        ]);
        setAdminStats(stats);
        setLoans(loanData);
        setUsers(usersData.filter(u => u.role === 'lender' || u.role === 'insurer'));
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load financial data');
    } finally {
      setLoading(false);
    }
  };

  const loadUserSpecificData = async () => {
    if (!selectedUserId) return;
    
    try {
      if (viewMode === 'lender') {
        const stats = await api.getLenderDashboard(selectedUserId);
        setLenderStats(stats);
        const loanData = await api.getExecutedLoans({ lender_id: selectedUserId });
        setLoans(loanData);
      } else if (viewMode === 'insurer') {
        const stats = await api.getInsurerDashboard(selectedUserId);
        setInsurerStats(stats);
        const loanData = await api.getExecutedLoans({ insurer_id: selectedUserId });
        setLoans(loanData);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load user data');
    }
  };

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'paid_off': return 'bg-blue-100 text-blue-800';
      case 'default': return 'bg-red-100 text-red-800';
      case 'workout': return 'bg-yellow-100 text-yellow-800';
      case 'charged_off': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  // Render Lender Dashboard
  const renderLenderDashboard = () => {
    if (!lenderStats) return null;
    
    return (
      <>
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="card bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm">Total Principal Outstanding</p>
                <p className="text-2xl font-bold">{formatCurrency(lenderStats.total_principal_outstanding)}</p>
              </div>
              <DollarSign className="h-10 w-10 text-blue-200" />
            </div>
          </div>
          
          <div className="card bg-gradient-to-br from-green-500 to-green-600 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm">Monthly Income</p>
                <p className="text-2xl font-bold">{formatCurrency(lenderStats.monthly_total_payments)}</p>
                <p className="text-xs text-green-200">
                  P: {formatCurrency(lenderStats.monthly_principal_payments)} | I: {formatCurrency(lenderStats.monthly_interest_income)}
                </p>
              </div>
              <TrendingUp className="h-10 w-10 text-green-200" />
            </div>
          </div>
          
          <div className="card bg-gradient-to-br from-purple-500 to-purple-600 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm">Weighted Avg Rate</p>
                <p className="text-2xl font-bold">{(lenderStats.weighted_average_interest_rate * 100).toFixed(2)}%</p>
              </div>
              <BarChart3 className="h-10 w-10 text-purple-200" />
            </div>
          </div>
          
          <div className={`card ${lenderStats.default_rate > 5 ? 'bg-gradient-to-br from-red-500 to-red-600' : 'bg-gradient-to-br from-gray-500 to-gray-600'} text-white`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-100 text-sm">Default Rate</p>
                <p className="text-2xl font-bold">{lenderStats.default_rate.toFixed(2)}%</p>
                <p className="text-xs">{lenderStats.defaulted_loans} of {lenderStats.total_loans} loans</p>
              </div>
              <AlertTriangle className="h-10 w-10 text-gray-200" />
            </div>
          </div>
        </div>

        {/* Portfolio Summary Section */}
        <div className="card mb-6">
          <button 
            onClick={() => toggleSection('summary')}
            className="w-full flex items-center justify-between text-left"
          >
            <h2 className="text-lg font-semibold">Portfolio Summary</h2>
            {expandedSections.has('summary') ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </button>
          
          {expandedSections.has('summary') && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-gray-500 text-sm">Total Loans</p>
                <p className="text-xl font-bold">{lenderStats.total_loans}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-gray-500 text-sm">Active Loans</p>
                <p className="text-xl font-bold text-green-600">{lenderStats.active_loans}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-gray-500 text-sm">Paid Off</p>
                <p className="text-xl font-bold text-blue-600">{lenderStats.paid_off_loans}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-gray-500 text-sm">Defaulted</p>
                <p className="text-xl font-bold text-red-600">{lenderStats.defaulted_loans}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-gray-500 text-sm">Total Originated</p>
                <p className="text-xl font-bold">{formatCurrency(lenderStats.total_principal_originated)}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-gray-500 text-sm">Avg Loan Size</p>
                <p className="text-xl font-bold">{formatCurrency(lenderStats.average_loan_size)}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-gray-500 text-sm">Avg Term</p>
                <p className="text-xl font-bold">{lenderStats.average_term_months.toFixed(0)} mo</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-gray-500 text-sm">Avg Interest Rate</p>
                <p className="text-xl font-bold">{(lenderStats.average_interest_rate * 100).toFixed(2)}%</p>
              </div>
            </div>
          )}
        </div>

        {/* Performance Metrics */}
        <div className="card mb-6">
          <button 
            onClick={() => toggleSection('performance')}
            className="w-full flex items-center justify-between text-left"
          >
            <h2 className="text-lg font-semibold">Performance & Risk</h2>
            {expandedSections.has('performance') ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </button>
          
          {expandedSections.has('performance') && (
            <div className="mt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                  <p className="text-yellow-700 text-sm">30+ Days Past Due</p>
                  <p className="text-xl font-bold text-yellow-800">{lenderStats.loans_past_due_30}</p>
                </div>
                <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                  <p className="text-orange-700 text-sm">60+ Days Past Due</p>
                  <p className="text-xl font-bold text-orange-800">{lenderStats.loans_past_due_60}</p>
                </div>
                <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-red-700 text-sm">90+ Days Past Due</p>
                  <p className="text-xl font-bold text-red-800">{lenderStats.loans_past_due_90}</p>
                </div>
                <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-red-700 text-sm">Total Past Due Amount</p>
                  <p className="text-xl font-bold text-red-800">{formatCurrency(lenderStats.total_past_due)}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-medium text-blue-800 mb-2">Insurance Coverage</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-blue-700">Insured Principal</span>
                      <span className="font-medium">{formatCurrency(lenderStats.insured_principal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-700">Uninsured Principal</span>
                      <span className="font-medium">{formatCurrency(lenderStats.uninsured_principal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-700">Avg Guarantee %</span>
                      <span className="font-medium">{(lenderStats.average_guarantee_percentage * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
                
                <div className="p-4 bg-green-50 rounded-lg">
                  <h4 className="font-medium text-green-800 mb-2">Monthly Cash Flow</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-green-700">Principal Payments</span>
                      <span className="font-medium">{formatCurrency(lenderStats.monthly_principal_payments)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-green-700">Interest Income</span>
                      <span className="font-medium">{formatCurrency(lenderStats.monthly_interest_income)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-green-800 font-medium">Total</span>
                      <span className="font-bold">{formatCurrency(lenderStats.monthly_total_payments)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Concentration Analysis */}
        <div className="card mb-6">
          <button 
            onClick={() => toggleSection('concentration')}
            className="w-full flex items-center justify-between text-left"
          >
            <h2 className="text-lg font-semibold">Concentration Analysis</h2>
            {expandedSections.has('concentration') ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </button>
          
          {expandedSections.has('concentration') && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Geographic */}
              <div>
                <h4 className="font-medium text-gray-700 mb-3 flex items-center">
                  <MapPin className="h-4 w-4 mr-2" />
                  Geographic Concentration
                </h4>
                <div className="space-y-2">
                  {lenderStats.geographic_concentration.slice(0, 10).map((geo, i) => (
                    <div key={geo.state} className="flex items-center">
                      <span className="w-12 text-sm font-medium">{geo.state}</span>
                      <div className="flex-1 mx-2">
                        <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${Math.min(geo.percentage, 100)}%` }}
                          />
                        </div>
                      </div>
                      <span className="w-16 text-right text-sm">{geo.percentage.toFixed(1)}%</span>
                      <span className="w-20 text-right text-xs text-gray-500">{geo.loan_count} loans</span>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Industry */}
              <div>
                <h4 className="font-medium text-gray-700 mb-3 flex items-center">
                  <Building2 className="h-4 w-4 mr-2" />
                  Industry Concentration
                </h4>
                <div className="space-y-2">
                  {lenderStats.industry_concentration.slice(0, 10).map((ind, i) => (
                    <div key={ind.industry} className="flex items-center">
                      <span className="w-24 text-sm font-medium capitalize truncate">{ind.industry.replace('_', ' ')}</span>
                      <div className="flex-1 mx-2">
                        <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-green-500 rounded-full"
                            style={{ width: `${Math.min(ind.percentage, 100)}%` }}
                          />
                        </div>
                      </div>
                      <span className="w-16 text-right text-sm">{ind.percentage.toFixed(1)}%</span>
                      <span className="w-20 text-right text-xs text-gray-500">{ind.loan_count} loans</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </>
    );
  };

  // Render Insurer Dashboard
  const renderInsurerDashboard = () => {
    if (!insurerStats) return null;
    
    return (
      <>
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="card bg-gradient-to-br from-purple-500 to-purple-600 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm">Total Exposure</p>
                <p className="text-2xl font-bold">{formatCurrency(insurerStats.total_exposure)}</p>
              </div>
              <Shield className="h-10 w-10 text-purple-200" />
            </div>
          </div>
          
          <div className="card bg-gradient-to-br from-green-500 to-green-600 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm">Premium Received</p>
                <p className="text-2xl font-bold">{formatCurrency(insurerStats.total_premium_received)}</p>
              </div>
              <DollarSign className="h-10 w-10 text-green-200" />
            </div>
          </div>
          
          <div className="card bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm">Monthly Premium</p>
                <p className="text-2xl font-bold">{formatCurrency(insurerStats.monthly_premium_income)}</p>
              </div>
              <TrendingUp className="h-10 w-10 text-blue-200" />
            </div>
          </div>
          
          <div className={`card ${insurerStats.loss_ratio > 50 ? 'bg-gradient-to-br from-red-500 to-red-600' : 'bg-gradient-to-br from-gray-500 to-gray-600'} text-white`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-100 text-sm">Loss Ratio</p>
                <p className="text-2xl font-bold">{insurerStats.loss_ratio.toFixed(1)}%</p>
                <p className="text-xs">Claims / Premium</p>
              </div>
              <AlertTriangle className="h-10 w-10 text-gray-200" />
            </div>
          </div>
        </div>

        {/* Portfolio Summary */}
        <div className="card mb-6">
          <button 
            onClick={() => toggleSection('summary')}
            className="w-full flex items-center justify-between text-left"
          >
            <h2 className="text-lg font-semibold">Policy Summary</h2>
            {expandedSections.has('summary') ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </button>
          
          {expandedSections.has('summary') && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-gray-500 text-sm">Total Policies</p>
                <p className="text-xl font-bold">{insurerStats.total_policies}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-gray-500 text-sm">Active Policies</p>
                <p className="text-xl font-bold text-green-600">{insurerStats.active_policies}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-gray-500 text-sm">In Default</p>
                <p className="text-xl font-bold text-red-600">{insurerStats.policies_in_default}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-gray-500 text-sm">Current Claims</p>
                <p className="text-xl font-bold text-orange-600">{insurerStats.current_claims}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-gray-500 text-sm">Total Insured Principal</p>
                <p className="text-xl font-bold">{formatCurrency(insurerStats.total_insured_principal)}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-gray-500 text-sm">Avg Premium Rate</p>
                <p className="text-xl font-bold">{(insurerStats.average_premium_rate * 100).toFixed(2)}%</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-gray-500 text-sm">Avg Guarantee %</p>
                <p className="text-xl font-bold">{(insurerStats.average_guarantee_percentage * 100).toFixed(1)}%</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-gray-500 text-sm">Claims Paid</p>
                <p className="text-xl font-bold text-red-600">{formatCurrency(insurerStats.total_claims_paid)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Risk Analysis */}
        <div className="card mb-6">
          <button 
            onClick={() => toggleSection('performance')}
            className="w-full flex items-center justify-between text-left"
          >
            <h2 className="text-lg font-semibold">Risk Analysis</h2>
            {expandedSections.has('performance') ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </button>
          
          {expandedSections.has('performance') && (
            <div className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <h4 className="font-medium text-purple-800 mb-2">Exposure Summary</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-purple-700">Current Exposure</span>
                      <span className="font-medium">{formatCurrency(insurerStats.total_exposure)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-purple-700">Expected Loss</span>
                      <span className="font-medium">{formatCurrency(insurerStats.expected_loss)}</span>
                    </div>
                  </div>
                </div>
                
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <h4 className="font-medium text-green-800 mb-2">Premium Income</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-green-700">Total Received</span>
                      <span className="font-medium">{formatCurrency(insurerStats.total_premium_received)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-green-700">Monthly Income</span>
                      <span className="font-medium">{formatCurrency(insurerStats.monthly_premium_income)}</span>
                    </div>
                  </div>
                </div>
                
                <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                  <h4 className="font-medium text-red-800 mb-2">Claims</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-red-700">Pending Claims</span>
                      <span className="font-medium">{insurerStats.current_claims}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-700">Total Paid</span>
                      <span className="font-medium">{formatCurrency(insurerStats.total_claims_paid)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-700">Loss Ratio</span>
                      <span className="font-medium">{insurerStats.loss_ratio.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Lender Concentration */}
              {insurerStats.lender_concentration.length > 0 && (
                <div className="mt-4">
                  <h4 className="font-medium text-gray-700 mb-3 flex items-center">
                    <Users className="h-4 w-4 mr-2" />
                    Lender Concentration
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2">Lender</th>
                          <th className="text-right py-2">Policies</th>
                          <th className="text-right py-2">Exposure</th>
                        </tr>
                      </thead>
                      <tbody>
                        {insurerStats.lender_concentration.map((lender, i) => (
                          <tr key={lender.lender_id} className="border-b">
                            <td className="py-2">{lender.lender_name}</td>
                            <td className="text-right py-2">{lender.count}</td>
                            <td className="text-right py-2">{formatCurrency(lender.exposure)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Concentration Analysis */}
        <div className="card mb-6">
          <button 
            onClick={() => toggleSection('concentration')}
            className="w-full flex items-center justify-between text-left"
          >
            <h2 className="text-lg font-semibold">Concentration Analysis</h2>
            {expandedSections.has('concentration') ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </button>
          
          {expandedSections.has('concentration') && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Geographic */}
              <div>
                <h4 className="font-medium text-gray-700 mb-3 flex items-center">
                  <MapPin className="h-4 w-4 mr-2" />
                  Geographic Concentration
                </h4>
                <div className="space-y-2">
                  {insurerStats.geographic_concentration.slice(0, 10).map((geo) => (
                    <div key={geo.state} className="flex items-center">
                      <span className="w-12 text-sm font-medium">{geo.state}</span>
                      <div className="flex-1 mx-2">
                        <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-purple-500 rounded-full"
                            style={{ width: `${Math.min(geo.percentage, 100)}%` }}
                          />
                        </div>
                      </div>
                      <span className="w-16 text-right text-sm">{geo.percentage.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Industry */}
              <div>
                <h4 className="font-medium text-gray-700 mb-3 flex items-center">
                  <Building2 className="h-4 w-4 mr-2" />
                  Industry Concentration
                </h4>
                <div className="space-y-2">
                  {insurerStats.industry_concentration.slice(0, 10).map((ind) => (
                    <div key={ind.industry} className="flex items-center">
                      <span className="w-24 text-sm font-medium capitalize truncate">{ind.industry.replace('_', ' ')}</span>
                      <div className="flex-1 mx-2">
                        <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-indigo-500 rounded-full"
                            style={{ width: `${Math.min(ind.percentage, 100)}%` }}
                          />
                        </div>
                      </div>
                      <span className="w-16 text-right text-sm">{ind.percentage.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </>
    );
  };

  // Render Admin Dashboard
  const renderAdminDashboard = () => {
    if (!adminStats && viewMode === 'overview') return null;
    
    if (viewMode === 'lender' && lenderStats) {
      return renderLenderDashboard();
    }
    
    if (viewMode === 'insurer' && insurerStats) {
      return renderInsurerDashboard();
    }
    
    if (!adminStats) return null;
    
    return (
      <>
        {/* Platform Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="card bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm">Total Principal Outstanding</p>
                <p className="text-2xl font-bold">{formatCurrency(adminStats.total_principal_outstanding)}</p>
              </div>
              <DollarSign className="h-10 w-10 text-blue-200" />
            </div>
          </div>
          
          <div className="card bg-gradient-to-br from-green-500 to-green-600 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm">Total Loans</p>
                <p className="text-2xl font-bold">{adminStats.total_loans}</p>
              </div>
              <FileText className="h-10 w-10 text-green-200" />
            </div>
          </div>
          
          <div className="card bg-gradient-to-br from-purple-500 to-purple-600 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm">Total Insured</p>
                <p className="text-2xl font-bold">{formatCurrency(adminStats.total_insured_amount)}</p>
              </div>
              <Shield className="h-10 w-10 text-purple-200" />
            </div>
          </div>
          
          <div className={`card ${adminStats.platform_default_rate > 5 ? 'bg-gradient-to-br from-red-500 to-red-600' : 'bg-gradient-to-br from-gray-500 to-gray-600'} text-white`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-100 text-sm">Platform Default Rate</p>
                <p className="text-2xl font-bold">{adminStats.platform_default_rate.toFixed(2)}%</p>
              </div>
              <AlertTriangle className="h-10 w-10 text-gray-200" />
            </div>
          </div>
        </div>

        {/* Lender & Insurer Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Lenders */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <Users className="h-5 w-5 mr-2" />
              Lenders ({adminStats.active_lenders} active of {adminStats.total_lenders})
            </h3>
            <div className="space-y-3">
              {adminStats.lender_stats.slice(0, 5).map((lender) => (
                <div key={lender.lender_id} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{lender.lender_name}</span>
                    <button
                      onClick={() => {
                        setSelectedUserId(lender.lender_id);
                        setViewMode('lender');
                      }}
                      className="text-primary-600 hover:underline text-sm"
                    >
                      View Details
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2 text-sm">
                    <div>
                      <span className="text-gray-500">Loans:</span> {lender.loan_count}
                    </div>
                    <div>
                      <span className="text-gray-500">Principal:</span> {formatCurrency(lender.total_principal)}
                    </div>
                    <div>
                      <span className="text-gray-500">Defaults:</span> 
                      <span className={lender.default_count > 0 ? 'text-red-600' : ''}> {lender.default_count}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Insurers */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <Shield className="h-5 w-5 mr-2" />
              Insurers ({adminStats.active_insurers} active of {adminStats.total_insurers})
            </h3>
            <div className="space-y-3">
              {adminStats.insurer_stats.slice(0, 5).map((insurer) => (
                <div key={insurer.insurer_id} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{insurer.insurer_name}</span>
                    <button
                      onClick={() => {
                        setSelectedUserId(insurer.insurer_id);
                        setViewMode('insurer');
                      }}
                      className="text-primary-600 hover:underline text-sm"
                    >
                      View Details
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2 text-sm">
                    <div>
                      <span className="text-gray-500">Policies:</span> {insurer.policy_count}
                    </div>
                    <div>
                      <span className="text-gray-500">Exposure:</span> {formatCurrency(insurer.total_exposure)}
                    </div>
                    <div>
                      <span className="text-gray-500">Premium:</span> {formatCurrency(insurer.premium_collected)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Platform Stats */}
        <div className="card mb-6">
          <h3 className="text-lg font-semibold mb-4">Platform Statistics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-500 text-sm">Total Originated</p>
              <p className="text-xl font-bold">{formatCurrency(adminStats.total_principal_originated)}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-500 text-sm">Total Defaults</p>
              <p className="text-xl font-bold text-red-600">{adminStats.total_defaults}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-500 text-sm">Total Losses</p>
              <p className="text-xl font-bold text-red-600">{formatCurrency(adminStats.total_losses)}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-500 text-sm">Total Recoveries</p>
              <p className="text-xl font-bold text-green-600">{formatCurrency(adminStats.total_recoveries)}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-500 text-sm">Premium Collected</p>
              <p className="text-xl font-bold">{formatCurrency(adminStats.total_premium_collected)}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-500 text-sm">Avg Portfolio Size</p>
              <p className="text-xl font-bold">{formatCurrency(adminStats.average_portfolio_size)}</p>
            </div>
          </div>
        </div>

        {/* Concentration Analysis */}
        <div className="card mb-6">
          <h3 className="text-lg font-semibold mb-4">Platform Concentration</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Geographic */}
            <div>
              <h4 className="font-medium text-gray-700 mb-3 flex items-center">
                <MapPin className="h-4 w-4 mr-2" />
                Geographic
              </h4>
              <div className="space-y-2">
                {adminStats.geographic_concentration.slice(0, 8).map((geo) => (
                  <div key={geo.state} className="flex items-center">
                    <span className="w-12 text-sm font-medium">{geo.state}</span>
                    <div className="flex-1 mx-2">
                      <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${Math.min(geo.percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                    <span className="w-16 text-right text-sm">{geo.percentage.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Industry */}
            <div>
              <h4 className="font-medium text-gray-700 mb-3 flex items-center">
                <Building2 className="h-4 w-4 mr-2" />
                Industry
              </h4>
              <div className="space-y-2">
                {adminStats.industry_concentration.slice(0, 8).map((ind) => (
                  <div key={ind.industry} className="flex items-center">
                    <span className="w-24 text-sm font-medium capitalize truncate">{ind.industry.replace('_', ' ')}</span>
                    <div className="flex-1 mx-2">
                      <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-green-500 rounded-full"
                          style={{ width: `${Math.min(ind.percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                    <span className="w-16 text-right text-sm">{ind.percentage.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  };

  // Render Loans Table
  const renderLoansTable = () => (
    <div className="card">
      <button 
        onClick={() => toggleSection('loans')}
        className="w-full flex items-center justify-between text-left"
      >
        <h2 className="text-lg font-semibold">Executed Loans ({loans.length})</h2>
        {expandedSections.has('loans') ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
      </button>
      
      {expandedSections.has('loans') && (
        <div className="mt-4 overflow-x-auto">
          {loans.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No executed loans yet.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-3 px-2">Loan #</th>
                  <th className="text-left py-3 px-2">Borrower</th>
                  {user?.role === 'admin' && <th className="text-left py-3 px-2">Lender</th>}
                  <th className="text-right py-3 px-2">Principal</th>
                  <th className="text-right py-3 px-2">Rate</th>
                  <th className="text-right py-3 px-2">Balance</th>
                  <th className="text-center py-3 px-2">Status</th>
                  <th className="text-left py-3 px-2">Industry</th>
                  <th className="text-left py-3 px-2">State</th>
                  <th className="text-center py-3 px-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((loan) => (
                  <tr key={loan.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-2 font-mono text-xs">{loan.loan_number}</td>
                    <td className="py-3 px-2">{loan.borrower_name || `ID: ${loan.borrower_id}`}</td>
                    {user?.role === 'admin' && <td className="py-3 px-2">{loan.lender_name || `ID: ${loan.lender_id}`}</td>}
                    <td className="py-3 px-2 text-right">{formatCurrency(loan.principal_amount)}</td>
                    <td className="py-3 px-2 text-right">{(loan.interest_rate * 100).toFixed(2)}%</td>
                    <td className="py-3 px-2 text-right">{formatCurrency(loan.current_principal_balance)}</td>
                    <td className="py-3 px-2 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(loan.status)}`}>
                        {loan.status}
                      </span>
                    </td>
                    <td className="py-3 px-2 capitalize">{loan.industry?.replace('_', ' ')}</td>
                    <td className="py-3 px-2">{loan.state || '-'}</td>
                    <td className="py-3 px-2 text-center">
                      <button
                        onClick={() => setSelectedLoan(loan)}
                        className="text-primary-600 hover:underline"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );

  // Loan Detail Modal
  const renderLoanModal = () => {
    if (!selectedLoan) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-xl font-semibold">Loan Details</h2>
              <p className="text-gray-500 font-mono">{selectedLoan.loan_number}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm ${getStatusColor(selectedLoan.status)}`}>
              {selectedLoan.status}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-500 text-sm">Principal Amount</p>
              <p className="text-lg font-bold">{formatCurrency(selectedLoan.principal_amount)}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-500 text-sm">Current Balance</p>
              <p className="text-lg font-bold">{formatCurrency(selectedLoan.current_principal_balance)}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-500 text-sm">Interest Rate</p>
              <p className="text-lg font-bold">{(selectedLoan.interest_rate * 100).toFixed(2)}%</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-500 text-sm">Monthly Payment</p>
              <p className="text-lg font-bold">{formatCurrency(selectedLoan.monthly_payment)}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Loan Terms</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-500">Term:</span> {selectedLoan.term_months} months</div>
                <div><span className="text-gray-500">Origination:</span> {formatDate(selectedLoan.origination_date)}</div>
                <div><span className="text-gray-500">Maturity:</span> {formatDate(selectedLoan.maturity_date)}</div>
                <div><span className="text-gray-500">Payments Made:</span> {selectedLoan.total_payments_made}</div>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Parties</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-500">Borrower:</span> {selectedLoan.borrower_name}</div>
                <div><span className="text-gray-500">Lender:</span> {selectedLoan.lender_name}</div>
                {selectedLoan.insurer_id && (
                  <div><span className="text-gray-500">Insurer:</span> {selectedLoan.insurer_name}</div>
                )}
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Business Details</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-500">Industry:</span> <span className="capitalize">{selectedLoan.industry?.replace('_', ' ')}</span></div>
                <div><span className="text-gray-500">Location:</span> {selectedLoan.city}, {selectedLoan.state} {selectedLoan.zip_code}</div>
              </div>
            </div>

            {selectedLoan.guarantee_percentage && (
              <div>
                <h4 className="font-medium mb-2">Insurance</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-gray-500">Guarantee %:</span> {(selectedLoan.guarantee_percentage * 100).toFixed(1)}%</div>
                  <div><span className="text-gray-500">Premium Rate:</span> {selectedLoan.premium_rate ? (selectedLoan.premium_rate * 100).toFixed(2) + '%' : '-'}</div>
                  <div><span className="text-gray-500">Premium Paid:</span> {formatCurrency(selectedLoan.premium_paid)}</div>
                </div>
              </div>
            )}

            <div>
              <h4 className="font-medium mb-2">Payment History</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-500">Total Principal Paid:</span> {formatCurrency(selectedLoan.total_principal_paid)}</div>
                <div><span className="text-gray-500">Total Interest Paid:</span> {formatCurrency(selectedLoan.total_interest_paid)}</div>
                <div><span className="text-gray-500">Last Payment:</span> {selectedLoan.last_payment_date ? formatDate(selectedLoan.last_payment_date) : 'None'}</div>
                <div><span className="text-gray-500">Days Past Due:</span> <span className={selectedLoan.days_past_due > 0 ? 'text-red-600' : ''}>{selectedLoan.days_past_due}</span></div>
              </div>
            </div>

            {selectedLoan.default_date && (
              <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                <h4 className="font-medium text-red-800 mb-2">Default Information</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-red-700">Default Date:</span> {formatDate(selectedLoan.default_date)}</div>
                  <div><span className="text-red-700">Default Amount:</span> {formatCurrency(selectedLoan.default_amount || 0)}</div>
                  <div><span className="text-red-700">Recovery:</span> {formatCurrency(selectedLoan.recovery_amount || 0)}</div>
                  <div><span className="text-red-700">Loss:</span> {formatCurrency(selectedLoan.loss_amount || 0)}</div>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end mt-6">
            <button onClick={() => setSelectedLoan(null)} className="btn btn-secondary">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financial Dashboard</h1>
          <p className="text-gray-600">
            {user?.role === 'lender' && 'Portfolio performance and loan metrics'}
            {user?.role === 'insurer' && 'Policy performance and risk metrics'}
            {user?.role === 'admin' && 'Platform-wide financial overview'}
          </p>
        </div>
        <div className="flex gap-2">
          {user?.role === 'admin' && viewMode !== 'overview' && (
            <button 
              onClick={() => {
                setViewMode('overview');
                setSelectedUserId(null);
                loadData();
              }}
              className="btn btn-secondary"
            >
              ← Back to Overview
            </button>
          )}
          <button onClick={loadData} className="btn btn-secondary inline-flex items-center">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </button>
        </div>
      </div>

      {/* Admin View Selector */}
      {user?.role === 'admin' && viewMode !== 'overview' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6">
          <p className="text-blue-800">
            Viewing {viewMode === 'lender' ? 'Lender' : 'Insurer'}: <strong>{users.find(u => u.id === selectedUserId)?.full_name}</strong>
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Role-specific dashboard */}
      {user?.role === 'lender' && renderLenderDashboard()}
      {user?.role === 'insurer' && renderInsurerDashboard()}
      {user?.role === 'admin' && renderAdminDashboard()}

      {/* Loans Table */}
      {renderLoansTable()}

      {/* Loan Detail Modal */}
      {renderLoanModal()}
    </div>
  );
}
