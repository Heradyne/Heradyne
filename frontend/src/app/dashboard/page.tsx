'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, Plus, TrendingUp, Clock, CheckCircle, Bell, MessageSquare } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { Deal, DealMatch } from '@/types';
import { formatCurrency, formatDate, getStatusColor, getRoleLabel } from '@/lib/utils';

export default function DashboardPage() {
  const { user } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [matches, setMatches] = useState<DealMatch[]>([]);
  const [infoRequests, setInfoRequests] = useState<{deal: Deal, requests: DealMatch[]}[]>([]);
  const [loading, setLoading] = useState(true);
  const [uwSummary, setUwSummary] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    try {
      let dealsData: any[] = [];
      if (user?.role === 'borrower' || user?.role === 'admin') {
        dealsData = await api.getDeals();
        setDeals(dealsData);
        
        // For borrowers, check for info requests on each deal
        if (user?.role === 'borrower') {
          const requestsList: {deal: Deal, requests: DealMatch[]}[] = [];
          for (const deal of dealsData) {
            if (deal.status !== 'draft') {
              try {
                const dealMatches = await api.getDealMatches(deal.id);
                const requests = dealMatches.filter(m => m.status === 'info_requested');
                if (requests.length > 0) {
                  requestsList.push({ deal, requests });
                }
              } catch (e) {
                // Skip if can't fetch
              }
            }
          }
          setInfoRequests(requestsList);
        }
      }

        // Load UW health scores for each analyzed deal
        const analyzed = dealsData.filter((d: any) => ['analyzed','matched','funded','approved'].includes(d.status));
        const uwResults: any[] = [];
        for (const deal of analyzed.slice(0, 5)) {  // limit to 5
          try {
            const token = localStorage.getItem('access_token');
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/underwriting/deals/${deal.id}/health-score`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) { uwResults.push({dealId: deal.id, dealName: deal.name, ...(await res.json())}); }
          } catch (e) {}
        }
        setUwSummary(uwResults);
      if (user?.role === 'lender' || user?.role === 'insurer') {
        const matchesData = await api.getMyMatches();
        setMatches(matchesData);
        const dealsData = await api.getDeals();
        setDeals(dealsData);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const stats = {
    totalDeals: deals.length,
    draftDeals: deals.filter(d => d.status === 'draft').length,
    analyzedDeals: deals.filter(d => ['analyzed', 'matched'].includes(d.status)).length,
    pendingMatches: matches.filter(m => m.status === 'pending').length,
    acceptedMatches: matches.filter(m => m.status === 'accepted').length,
    totalInfoRequests: infoRequests.reduce((sum, ir) => sum + ir.requests.length, 0),
  };

  return (
    <div>

      {/* UnderwriteOS Health Scores */}
      {uwSummary.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">UnderwriteOS — Deal Health Scores</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {uwSummary.map((uw) => (
              <div key={uw.dealId} className={`rounded-xl p-4 border ${
                (uw.health_score || 0) >= 70 ? 'bg-green-50 border-green-200' :
                (uw.health_score || 0) >= 50 ? 'bg-yellow-50 border-yellow-200' :
                'bg-red-50 border-red-200'
              }`}>
                <p className="text-xs text-gray-500 mb-1 truncate">{uw.dealName}</p>
                <div className="flex items-baseline justify-between">
                  <span className="text-3xl font-bold" style={{color: (uw.health_score || 0) >= 70 ? '#15803d' : (uw.health_score || 0) >= 50 ? '#ca8a04' : '#dc2626'}}>
                    {uw.health_score?.toFixed(0)}
                  </span>
                  <span className="text-sm text-gray-500">/ 100</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                  <div className="h-1.5 rounded-full" style={{
                    width: `${uw.health_score || 0}%`,
                    background: (uw.health_score || 0) >= 70 ? '#16a34a' : (uw.health_score || 0) >= 50 ? '#ca8a04' : '#dc2626'
                  }}></div>
                </div>
                <div className="grid grid-cols-5 gap-1 mt-2 text-center">
                  {['Cashflow','Stability','Growth','Liquidity','Distress'].map((label, i) => {
                    const key = label.toLowerCase();
                    const val = uw.subscores?.[key];
                    return (
                      <div key={label}>
                        <p className="text-xs text-gray-400">{label.slice(0,4)}</p>
                        <p className="text-xs font-bold">{val?.toFixed(0) ?? '—'}</p>
                      </div>
                    );
                  })}
                </div>
                {uw.cash_runway_months !== undefined && (
                  <p className="text-xs mt-2 text-gray-500">
                    Cash runway: <span className="font-semibold">{uw.cash_runway_months === 18 ? '18+ mo' : `${uw.cash_runway_months?.toFixed(1)} mo`}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.full_name}
        </h1>
        <p className="text-gray-600">{getRoleLabel(user?.role || '')} Dashboard</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {(user?.role === 'borrower' || user?.role === 'admin') && (
          <>
            <div className="card">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-blue-100">
                  <FileText className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-500">Total Deals</p>
                  <p className="text-2xl font-semibold">{stats.totalDeals}</p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-yellow-100">
                  <Clock className="h-6 w-6 text-yellow-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-500">Drafts</p>
                  <p className="text-2xl font-semibold">{stats.draftDeals}</p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-green-100">
                  <TrendingUp className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-500">Analyzed</p>
                  <p className="text-2xl font-semibold">{stats.analyzedDeals}</p>
                </div>
              </div>
            </div>
          </>
        )}
        {(user?.role === 'lender' || user?.role === 'insurer') && (
          <>
            <div className="card">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-yellow-100">
                  <Clock className="h-6 w-6 text-yellow-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-500">Pending Review</p>
                  <p className="text-2xl font-semibold">{stats.pendingMatches}</p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-green-100">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-500">Accepted</p>
                  <p className="text-2xl font-semibold">{stats.acceptedMatches}</p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-blue-100">
                  <FileText className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-500">Available Deals</p>
                  <p className="text-2xl font-semibold">{deals.length}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Info Requests Alert for Borrowers */}
      {user?.role === 'borrower' && infoRequests.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4 mb-8">
          <div className="flex items-start">
            <Bell className="h-6 w-6 text-amber-600 mr-3 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-amber-800 mb-3">
                Action Required: {stats.totalInfoRequests} Information Request{stats.totalInfoRequests > 1 ? 's' : ''}
              </h3>
              <div className="space-y-3">
                {infoRequests.map(({ deal, requests }) => (
                  <div key={deal.id} className="bg-white rounded-lg p-3 border border-amber-200">
                    <Link 
                      href={`/dashboard/deals/${deal.id}`}
                      className="font-medium text-primary-600 hover:underline"
                    >
                      {deal.name}
                    </Link>
                    <div className="mt-2 space-y-2">
                      {requests.map((req) => (
                        <div key={req.id} className="text-sm bg-amber-50 p-2 rounded flex items-start">
                          <MessageSquare className="h-4 w-4 text-amber-600 mr-2 mt-0.5 flex-shrink-0" />
                          <div>
                            <span className="font-medium text-amber-800">
                              {req.lender_policy_id ? 'Lender' : 'Insurer'} Request:
                            </span>
                            <span className="text-amber-700 ml-1">
                              {req.decision_notes || 'Additional information requested'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      {user?.role === 'borrower' && (
        <div className="mb-8">
          <Link href="/dashboard/deals/new" className="btn btn-primary inline-flex items-center">
            <Plus className="h-5 w-5 mr-2" />
            Create New Deal
          </Link>
        </div>
      )}

      {/* Recent Activity */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">
          {user?.role === 'borrower' || user?.role === 'admin' ? 'Recent Deals' : 'Recent Matches'}
        </h2>
        
        {(user?.role === 'borrower' || user?.role === 'admin') && deals.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deal</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {deals.slice(0, 5).map((deal) => (
                  <tr key={deal.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/deals/${deal.id}`} className="text-primary-600 hover:underline font-medium">
                        {deal.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 capitalize">{deal.deal_type}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{formatCurrency(deal.loan_amount_requested)}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${getStatusColor(deal.status)}`}>{deal.status.replace('_', ' ')}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(deal.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (user?.role === 'lender' || user?.role === 'insurer') && matches.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deal ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Match Score</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {matches.slice(0, 5).map((match) => (
                  <tr key={match.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/deals/${match.deal_id}`} className="text-primary-600 hover:underline">
                        Deal #{match.deal_id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {match.match_score ? `${(match.match_score * 100).toFixed(0)}%` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${getStatusColor(match.status)}`}>{match.status}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(match.created_at)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/matches/${match.id}`} className="text-primary-600 hover:underline text-sm">
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">
            {user?.role === 'borrower' 
              ? 'No deals yet. Create your first deal to get started.'
              : 'No matches yet. Matches will appear here when deals match your policies.'}
          </p>
        )}
      </div>
    </div>
  );
}
