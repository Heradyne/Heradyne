'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { 
  Database, Filter, TrendingUp, TrendingDown, BarChart3, PieChart, 
  RefreshCw, Download, AlertTriangle, CheckCircle, Settings, FileText,
  ChevronDown, ChevronUp, Layers, Target, Shield, Zap
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { formatCurrency, formatPercent } from '@/lib/utils';

export default function ActuarialWorkbenchPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'cohort' | 'portfolio' | 'governance' | 'stress'>('cohort');
  const [error, setError] = useState('');
  
  // Cohort analysis
  const [cohortData, setCohortData] = useState<any>(null);
  const [cohortFilters, setCohortFilters] = useState({
    naics_prefix: '',
    state: '',
    vintage_start: 2020,
    vintage_end: 2024,
    loan_size_bucket: '',
  });
  
  // Portfolio metrics
  const [portfolioMetrics, setPortfolioMetrics] = useState<any>(null);
  
  // Model governance
  const [governance, setGovernance] = useState<any>(null);
  
  // Stress testing
  const [stressResults, setStressResults] = useState<any>(null);
  const [stressScenarios, setStressScenarios] = useState([
    { name: 'Moderate Recession', default_multiplier: 1.5, recovery_haircut: 0.15 },
    { name: 'Severe Recession', default_multiplier: 2.0, recovery_haircut: 0.25 },
    { name: 'Catastrophic', default_multiplier: 3.0, recovery_haircut: 0.40 },
  ]);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'cohort') {
        const data = await api.getCohortAnalysis(cohortFilters);
        setCohortData(data);
      } else if (activeTab === 'portfolio') {
        const data = await api.getPortfolioMetrics();
        setPortfolioMetrics(data);
      } else if (activeTab === 'governance') {
        const data = await api.getModelGovernance();
        setGovernance(data);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const runCohortAnalysis = async () => {
    setLoading(true);
    try {
      const data = await api.getCohortAnalysis(cohortFilters);
      setCohortData(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const runStressTest = async () => {
    setLoading(true);
    try {
      // Use a sample submission for stress testing
      const sampleSubmission = {
        loan_amount: 1500000,
        naics_code: '722511',
        dscr: 1.30,
        credit_score: 700,
        business_age_years: 5,
        equity_injection_pct: 0.10,
        collateral_type: 'mixed',
      };
      const policyTerms = {
        attachment_point: 0,
        limit: 1125000,
        coinsurance: 1.0,
      };
      
      const result = await api.runStressTest(sampleSubmission, policyTerms, stressScenarios);
      setStressResults(result);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Stress test failed');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'ok':
      case 'pass':
      case 'stable':
        return 'text-green-600 bg-green-50';
      case 'at_limit':
      case 'warning':
        return 'text-yellow-600 bg-yellow-50';
      case 'exceeded':
      case 'fail':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <Database className="h-8 w-8 mr-3 text-teal-600" />
            Actuarial Workbench
          </h1>
          <p className="text-gray-600">Data explorer, cohort analysis & stress testing</p>
        </div>
        <button onClick={loadData} className="btn btn-secondary">
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

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('cohort')}
            className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center ${
              activeTab === 'cohort'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Filter className="h-4 w-4 mr-2" />
            Cohort Analysis
          </button>
          <button
            onClick={() => setActiveTab('portfolio')}
            className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center ${
              activeTab === 'portfolio'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <PieChart className="h-4 w-4 mr-2" />
            Portfolio View
          </button>
          <button
            onClick={() => setActiveTab('stress')}
            className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center ${
              activeTab === 'stress'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Zap className="h-4 w-4 mr-2" />
            Stress Testing
          </button>
          <button
            onClick={() => setActiveTab('governance')}
            className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center ${
              activeTab === 'governance'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Settings className="h-4 w-4 mr-2" />
            Model Governance
          </button>
        </nav>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-teal-600" />
        </div>
      ) : (
        <>
          {/* Cohort Analysis Tab */}
          {activeTab === 'cohort' && (
            <div className="space-y-6">
              {/* Filters */}
              <div className="card">
                <h2 className="font-semibold mb-4 flex items-center">
                  <Filter className="h-5 w-5 mr-2 text-teal-600" />
                  Cohort Filters
                </h2>
                <div className="grid grid-cols-5 gap-4">
                  <div>
                    <label className="text-xs text-gray-500">NAICS Prefix</label>
                    <input
                      type="text"
                      placeholder="e.g., 72"
                      value={cohortFilters.naics_prefix}
                      onChange={e => setCohortFilters({...cohortFilters, naics_prefix: e.target.value})}
                      className="input w-full text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">State</label>
                    <input
                      type="text"
                      placeholder="e.g., CA"
                      value={cohortFilters.state}
                      onChange={e => setCohortFilters({...cohortFilters, state: e.target.value})}
                      className="input w-full text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Vintage Start</label>
                    <input
                      type="number"
                      value={cohortFilters.vintage_start}
                      onChange={e => setCohortFilters({...cohortFilters, vintage_start: +e.target.value})}
                      className="input w-full text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Vintage End</label>
                    <input
                      type="number"
                      value={cohortFilters.vintage_end}
                      onChange={e => setCohortFilters({...cohortFilters, vintage_end: +e.target.value})}
                      className="input w-full text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Loan Size</label>
                    <select
                      value={cohortFilters.loan_size_bucket}
                      onChange={e => setCohortFilters({...cohortFilters, loan_size_bucket: e.target.value})}
                      className="input w-full text-sm"
                    >
                      <option value="">All Sizes</option>
                      <option value="small">Small (&lt;$500K)</option>
                      <option value="medium">Medium ($500K-$1.5M)</option>
                      <option value="large">Large (&gt;$1.5M)</option>
                    </select>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button onClick={runCohortAnalysis} className="btn btn-primary">
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Run Analysis
                  </button>
                  <button className="btn btn-secondary">
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </button>
                </div>
              </div>

              {cohortData && (
                <>
                  {/* Cohort Summary */}
                  <div className="card">
                    <h2 className="font-semibold mb-4">Cohort Summary</h2>
                    <div className="grid grid-cols-5 gap-4">
                      <div className="p-4 bg-teal-50 rounded-lg text-center">
                        <p className="text-2xl font-bold text-teal-700">
                          {cohortData.cohort_summary?.loan_count?.toLocaleString()}
                        </p>
                        <p className="text-sm text-teal-600">Loans</p>
                      </div>
                      <div className="p-4 bg-blue-50 rounded-lg text-center">
                        <p className="text-2xl font-bold text-blue-700">
                          {formatCurrency(cohortData.cohort_summary?.total_exposure)}
                        </p>
                        <p className="text-sm text-blue-600">Total Exposure</p>
                      </div>
                      <div className="p-4 bg-orange-50 rounded-lg text-center">
                        <p className="text-2xl font-bold text-orange-700">
                          {(cohortData.cohort_summary?.avg_default_rate * 100).toFixed(2)}%
                        </p>
                        <p className="text-sm text-orange-600">Avg Default Rate</p>
                      </div>
                      <div className="p-4 bg-purple-50 rounded-lg text-center">
                        <p className="text-2xl font-bold text-purple-700">
                          {(cohortData.cohort_summary?.avg_lgd * 100).toFixed(1)}%
                        </p>
                        <p className="text-sm text-purple-600">Avg LGD</p>
                      </div>
                      <div className="p-4 bg-red-50 rounded-lg text-center">
                        <p className="text-2xl font-bold text-red-700">
                          {(cohortData.cohort_summary?.avg_loss_ratio * 100).toFixed(2)}%
                        </p>
                        <p className="text-sm text-red-600">Loss Ratio</p>
                      </div>
                    </div>
                  </div>

                  {/* Loss Triangle */}
                  <div className="card">
                    <h2 className="font-semibold mb-4">Loss Development Triangle</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left pb-2">Development Month</th>
                            <th className="text-right pb-2">Cumulative Default %</th>
                            <th className="text-right pb-2">Incremental %</th>
                            <th className="text-right pb-2">Emergence</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cohortData.loss_triangle?.map((row: any, i: number) => (
                            <tr key={i} className="border-b">
                              <td className="py-2">{row.development_month} months</td>
                              <td className="py-2 text-right font-medium">
                                {(row.cumulative_default_pct * 100).toFixed(2)}%
                              </td>
                              <td className="py-2 text-right">
                                {(row.incremental_default_pct * 100).toFixed(3)}%
                              </td>
                              <td className="py-2 text-right">
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div
                                    className="bg-teal-600 h-2 rounded-full"
                                    style={{ width: `${row.cumulative_default_pct / cohortData.cohort_summary?.avg_default_rate * 100}%` }}
                                  />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Rate Indications by Segment */}
                  <div className="card">
                    <h2 className="font-semibold mb-4">Rate Indications by NAICS</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left pb-2">NAICS</th>
                            <th className="text-right pb-2">Loans</th>
                            <th className="text-right pb-2">Default Rate</th>
                            <th className="text-right pb-2">LGD</th>
                            <th className="text-right pb-2">Pure Premium</th>
                            <th className="text-right pb-2">Indicated Rate</th>
                            <th className="text-right pb-2">Credibility</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cohortData.rate_indications?.map((row: any, i: number) => (
                            <tr key={i} className="border-b hover:bg-gray-50">
                              <td className="py-2 font-medium">{row.naics_prefix}</td>
                              <td className="py-2 text-right">{row.loan_count}</td>
                              <td className="py-2 text-right">{(row.default_rate * 100).toFixed(2)}%</td>
                              <td className="py-2 text-right">{(row.lgd * 100).toFixed(1)}%</td>
                              <td className="py-2 text-right">{(row.pure_premium * 100).toFixed(3)}%</td>
                              <td className="py-2 text-right font-medium text-teal-600">
                                {(row.indicated_rate * 100).toFixed(2)}%
                              </td>
                              <td className="py-2 text-right">
                                <span className={`px-2 py-0.5 rounded text-xs ${
                                  row.credibility >= 0.8 ? 'bg-green-100 text-green-700' :
                                  row.credibility >= 0.5 ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-700'
                                }`}>
                                  {(row.credibility * 100).toFixed(0)}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Vintage Analysis */}
                  <div className="card">
                    <h2 className="font-semibold mb-4">Vintage Performance</h2>
                    <div className="grid grid-cols-5 gap-4">
                      {cohortData.vintage_analysis?.map((v: any) => (
                        <div key={v.vintage} className="p-4 bg-gray-50 rounded-lg text-center">
                          <p className="text-lg font-bold">{v.vintage}</p>
                          <p className={`text-xl font-bold ${
                            v.default_rate > 0.03 ? 'text-red-600' :
                            v.default_rate > 0.02 ? 'text-orange-600' :
                            'text-green-600'
                          }`}>
                            {(v.default_rate * 100).toFixed(2)}%
                          </p>
                          <p className={`text-xs ${
                            v.status === 'mature' ? 'text-gray-500' :
                            v.status === 'developing' ? 'text-blue-500' :
                            'text-purple-500'
                          }`}>
                            {v.status}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Portfolio View Tab */}
          {activeTab === 'portfolio' && portfolioMetrics && (
            <div className="space-y-6">
              {/* Portfolio Summary */}
              <div className="grid grid-cols-4 gap-4">
                <div className="card bg-gradient-to-br from-teal-500 to-teal-600 text-white">
                  <p className="text-teal-100 text-sm">Total Exposure</p>
                  <p className="text-3xl font-bold">{formatCurrency(portfolioMetrics.portfolio_summary?.total_exposure)}</p>
                  <p className="text-teal-200 text-sm">{portfolioMetrics.portfolio_summary?.total_loans} loans</p>
                </div>
                <div className="card bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                  <p className="text-blue-100 text-sm">Total Premium</p>
                  <p className="text-3xl font-bold">{formatCurrency(portfolioMetrics.portfolio_summary?.total_premium)}</p>
                </div>
                <div className="card bg-gradient-to-br from-orange-500 to-orange-600 text-white">
                  <p className="text-orange-100 text-sm">Expected Loss Ratio</p>
                  <p className="text-3xl font-bold">{(portfolioMetrics.portfolio_summary?.expected_loss_ratio * 100).toFixed(1)}%</p>
                </div>
                <div className="card bg-gradient-to-br from-green-500 to-green-600 text-white">
                  <p className="text-green-100 text-sm">Actual Loss Ratio YTD</p>
                  <p className="text-3xl font-bold">{(portfolioMetrics.portfolio_summary?.actual_loss_ratio_ytd * 100).toFixed(1)}%</p>
                </div>
              </div>

              {/* Capital Metrics */}
              <div className="card">
                <h2 className="font-semibold mb-4 flex items-center">
                  <Shield className="h-5 w-5 mr-2 text-teal-600" />
                  Capital & Risk Metrics
                </h2>
                <div className="grid grid-cols-5 gap-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500">PML (99%)</p>
                    <p className="text-xl font-bold">{formatCurrency(portfolioMetrics.capital_metrics?.pml_99)}</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500">TVaR (99%)</p>
                    <p className="text-xl font-bold">{formatCurrency(portfolioMetrics.capital_metrics?.tvar_99)}</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500">Capital Required</p>
                    <p className="text-xl font-bold">{formatCurrency(portfolioMetrics.capital_metrics?.capital_required)}</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500">Capital Deployed</p>
                    <p className="text-xl font-bold">{formatCurrency(portfolioMetrics.capital_metrics?.capital_deployed)}</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500">Utilization</p>
                    <p className="text-xl font-bold">{(portfolioMetrics.capital_metrics?.capital_utilization * 100).toFixed(0)}%</p>
                  </div>
                </div>
              </div>

              {/* Concentration */}
              <div className="grid grid-cols-2 gap-6">
                {/* NAICS Concentration */}
                <div className="card">
                  <h2 className="font-semibold mb-4">NAICS Concentration</h2>
                  <div className="space-y-3">
                    {portfolioMetrics.concentration?.top_naics?.map((n: any) => (
                      <div key={n.naics} className="flex items-center justify-between">
                        <div className="flex items-center">
                          <span className="font-medium w-12">NAICS {n.naics}</span>
                          <div className="w-32 bg-gray-200 rounded-full h-2 ml-3">
                            <div
                              className={`h-2 rounded-full ${n.status === 'at_limit' ? 'bg-orange-500' : 'bg-teal-500'}`}
                              style={{ width: `${n.pct * 100 * 5}%` }}
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{(n.pct * 100).toFixed(1)}%</span>
                          <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(n.status)}`}>
                            {n.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Geography Concentration */}
                <div className="card">
                  <h2 className="font-semibold mb-4">Geographic Concentration</h2>
                  <div className="space-y-3">
                    {portfolioMetrics.concentration?.top_states?.map((s: any) => (
                      <div key={s.state} className="flex items-center justify-between">
                        <div className="flex items-center">
                          <span className="font-medium w-12">{s.state}</span>
                          <div className="w-32 bg-gray-200 rounded-full h-2 ml-3">
                            <div
                              className="bg-blue-500 h-2 rounded-full"
                              style={{ width: `${s.pct * 100 * 4}%` }}
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{(s.pct * 100).toFixed(1)}%</span>
                          <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(s.status)}`}>
                            {s.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Concentration Flags */}
              {portfolioMetrics.concentration?.flags?.length > 0 && (
                <div className="card border-2 border-yellow-200 bg-yellow-50">
                  <h2 className="font-semibold mb-3 flex items-center text-yellow-800">
                    <AlertTriangle className="h-5 w-5 mr-2" />
                    Concentration Alerts
                  </h2>
                  <ul className="space-y-1">
                    {(portfolioMetrics.concentration.flags || []).map((flag: string, i: number) => (
                      <li key={i} className="text-sm text-yellow-700 flex items-center">
                        <AlertTriangle className="h-4 w-4 mr-2" />
                        {flag}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Reinsurance */}
              <div className="card">
                <h2 className="font-semibold mb-4 flex items-center">
                  <Layers className="h-5 w-5 mr-2 text-teal-600" />
                  Reinsurance Structure
                </h2>
                <div className="grid grid-cols-4 gap-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500">Quota Share</p>
                    <p className="text-xl font-bold">{(portfolioMetrics.reinsurance?.quota_share_pct * 100).toFixed(0)}%</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500">XS Attachment</p>
                    <p className="text-xl font-bold">{formatCurrency(portfolioMetrics.reinsurance?.xs_attachment)}</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500">XS Limit</p>
                    <p className="text-xl font-bold">{formatCurrency(portfolioMetrics.reinsurance?.xs_limit)}</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500">Net Retention</p>
                    <p className="text-xl font-bold">{formatCurrency(portfolioMetrics.reinsurance?.net_retention)}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Stress Testing Tab */}
          {activeTab === 'stress' && (
            <div className="space-y-6">
              {/* Scenario Configuration */}
              <div className="card">
                <h2 className="font-semibold mb-4 flex items-center">
                  <Zap className="h-5 w-5 mr-2 text-teal-600" />
                  Stress Scenarios
                </h2>
                <div className="space-y-4">
                  {stressScenarios.map((scenario, i) => (
                    <div key={i} className="grid grid-cols-4 gap-4 items-center p-3 bg-gray-50 rounded-lg">
                      <input
                        type="text"
                        value={scenario.name}
                        onChange={e => {
                          const updated = [...stressScenarios];
                          updated[i].name = e.target.value;
                          setStressScenarios(updated);
                        }}
                        className="input text-sm"
                        placeholder="Scenario Name"
                      />
                      <div>
                        <label className="text-xs text-gray-500">Default Multiplier</label>
                        <input
                          type="number"
                          step="0.1"
                          value={scenario.default_multiplier}
                          onChange={e => {
                            const updated = [...stressScenarios];
                            updated[i].default_multiplier = +e.target.value;
                            setStressScenarios(updated);
                          }}
                          className="input w-full text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Recovery Haircut %</label>
                        <input
                          type="number"
                          step="0.05"
                          value={scenario.recovery_haircut * 100}
                          onChange={e => {
                            const updated = [...stressScenarios];
                            updated[i].recovery_haircut = +e.target.value / 100;
                            setStressScenarios(updated);
                          }}
                          className="input w-full text-sm"
                        />
                      </div>
                      <button
                        onClick={() => setStressScenarios(stressScenarios.filter((_, idx) => idx !== i))}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setStressScenarios([...stressScenarios, { name: 'New Scenario', default_multiplier: 1.5, recovery_haircut: 0.20 }])}
                      className="btn btn-secondary text-sm"
                    >
                      Add Scenario
                    </button>
                    <button onClick={runStressTest} className="btn btn-primary text-sm">
                      <Zap className="h-4 w-4 mr-2" />
                      Run Stress Test
                    </button>
                  </div>
                </div>
              </div>

              {/* Stress Results */}
              {stressResults && (
                <div className="card">
                  <h2 className="font-semibold mb-4">Stress Test Results</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left pb-2">Scenario</th>
                          <th className="text-right pb-2">Default Prob</th>
                          <th className="text-right pb-2">LGD</th>
                          <th className="text-right pb-2">Expected Loss</th>
                          <th className="text-right pb-2">Indicated Rate</th>
                          <th className="text-right pb-2">PML (99%)</th>
                          <th className="text-right pb-2">Impact</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stressResults.stress_results?.map((result: any, i: number) => {
                          const baseCase = stressResults.stress_results[0];
                          const impact = i === 0 ? 0 : (result.indicated_rate - baseCase.indicated_rate) / baseCase.indicated_rate;
                          
                          return (
                            <tr key={i} className={`border-b ${i === 0 ? 'bg-gray-50 font-medium' : ''}`}>
                              <td className="py-2">{result.scenario}</td>
                              <td className="py-2 text-right">{(result.default_probability * 100).toFixed(2)}%</td>
                              <td className="py-2 text-right">{(result.loss_given_default * 100).toFixed(1)}%</td>
                              <td className="py-2 text-right">{(result.expected_loss * 100).toFixed(3)}%</td>
                              <td className="py-2 text-right font-medium">{(result.indicated_rate * 100).toFixed(2)}%</td>
                              <td className="py-2 text-right">{(result.pml_99 * 100).toFixed(2)}%</td>
                              <td className="py-2 text-right">
                                {i === 0 ? (
                                  <span className="text-gray-400">Base</span>
                                ) : (
                                  <span className={impact > 0.5 ? 'text-red-600' : impact > 0.25 ? 'text-orange-600' : 'text-yellow-600'}>
                                    +{(impact * 100).toFixed(0)}%
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Model Governance Tab */}
          {activeTab === 'governance' && governance && (
            <div className="space-y-6">
              {/* Model Inventory */}
              <div className="card">
                <h2 className="font-semibold mb-4 flex items-center">
                  <FileText className="h-5 w-5 mr-2 text-teal-600" />
                  Model Inventory
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex justify-between p-2 bg-gray-50 rounded">
                      <span className="text-gray-500">Model Name</span>
                      <span className="font-medium">{governance.model_inventory?.model_name}</span>
                    </div>
                    <div className="flex justify-between p-2 bg-gray-50 rounded">
                      <span className="text-gray-500">Model ID</span>
                      <span className="font-mono">{governance.model_inventory?.model_id}</span>
                    </div>
                    <div className="flex justify-between p-2 bg-gray-50 rounded">
                      <span className="text-gray-500">Version</span>
                      <span className="font-mono">{governance.model_inventory?.version}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between p-2 bg-gray-50 rounded">
                      <span className="text-gray-500">Last Validation</span>
                      <span>{governance.model_inventory?.last_validation}</span>
                    </div>
                    <div className="flex justify-between p-2 bg-gray-50 rounded">
                      <span className="text-gray-500">Model Owner</span>
                      <span>{governance.model_inventory?.model_owner}</span>
                    </div>
                    <div className="flex justify-between p-2 bg-gray-50 rounded">
                      <span className="text-gray-500">Model Tier</span>
                      <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-sm">
                        {governance.model_inventory?.model_tier}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Data Sources */}
              <div className="card">
                <h2 className="font-semibold mb-4 flex items-center">
                  <Database className="h-5 w-5 mr-2 text-teal-600" />
                  Data Sources
                </h2>
                <div className="p-4 bg-teal-50 rounded-lg mb-4">
                  <p className="font-medium text-teal-800">{governance.data_sources?.primary?.name}</p>
                  <div className="grid grid-cols-4 gap-4 mt-2 text-sm">
                    <div>
                      <span className="text-teal-600">Records:</span>
                      <span className="ml-2 font-medium">{governance.data_sources?.primary?.records?.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-teal-600">Date Range:</span>
                      <span className="ml-2 font-medium">{governance.data_sources?.primary?.date_range}</span>
                    </div>
                    <div>
                      <span className="text-teal-600">Last Update:</span>
                      <span className="ml-2 font-medium">{governance.data_sources?.primary?.last_update}</span>
                    </div>
                    <div>
                      <span className="text-teal-600">Frequency:</span>
                      <span className="ml-2 font-medium">{governance.data_sources?.primary?.update_frequency}</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  {governance.data_sources?.secondary?.map((source: any, i: number) => (
                    <div key={i} className="flex justify-between p-2 bg-gray-50 rounded text-sm">
                      <span>{source.name}</span>
                      <span className="text-gray-500">{source.purpose}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Validation Results */}
              <div className="card">
                <h2 className="font-semibold mb-4 flex items-center">
                  <CheckCircle className="h-5 w-5 mr-2 text-teal-600" />
                  Validation Results
                </h2>
                <div className="grid grid-cols-2 gap-6">
                  <div className="p-4 bg-green-50 rounded-lg">
                    <p className="font-medium text-green-800 mb-2">Last Backtest</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Date</span>
                        <span>{governance.validation_results?.last_backtest?.date}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Actual vs Expected</span>
                        <span className="font-medium">{governance.validation_results?.last_backtest?.actual_vs_expected}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Lift Score</span>
                        <span className="font-medium">{governance.validation_results?.last_backtest?.lift_score}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Result</span>
                        <span className="px-2 py-0.5 bg-green-200 text-green-800 rounded">
                          {governance.validation_results?.last_backtest?.result}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <p className="font-medium text-blue-800 mb-2">Stability Monitoring</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>PSI Score</span>
                        <span className="font-medium">{governance.validation_results?.stability_monitoring?.psi_score}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Threshold</span>
                        <span>{governance.validation_results?.stability_monitoring?.threshold}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Status</span>
                        <span className="px-2 py-0.5 bg-blue-200 text-blue-800 rounded">
                          {governance.validation_results?.stability_monitoring?.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Change Log */}
              <div className="card">
                <h2 className="font-semibold mb-4">Change Log</h2>
                <div className="space-y-2">
                  {governance.change_log?.map((entry: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center">
                        <span className="text-sm text-gray-500 w-24">{entry.date}</span>
                        <span className="text-sm">{entry.change}</span>
                      </div>
                      <span className="text-xs text-gray-400">Approved by: {entry.approver}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
