'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Bell, MessageSquare } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { Deal, DealMatch } from '@/types';
import { formatCurrency, formatDate, getStatusColor } from '@/lib/utils';

export default function DealsPage() {
  const { user } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealInfoRequests, setDealInfoRequests] = useState<Record<number, DealMatch[]>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadDeals();
  }, [statusFilter]);

  const loadDeals = async () => {
    try {
      const data = await api.getDeals(statusFilter || undefined);
      setDeals(data);
      
      // For borrowers, check each deal for info requests
      if (user?.role === 'borrower') {
        const infoRequestsMap: Record<number, DealMatch[]> = {};
        for (const deal of data) {
          if (deal.status !== 'draft') {
            try {
              const matches = await api.getDealMatches(deal.id);
              const infoRequests = matches.filter(m => m.status === 'info_requested');
              if (infoRequests.length > 0) {
                infoRequestsMap[deal.id] = infoRequests;
              }
            } catch (e) {
              // Skip if can't fetch matches
            }
          }
        }
        setDealInfoRequests(infoRequestsMap);
      }
    } catch (error) {
      console.error('Failed to load deals:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredDeals = deals.filter(deal =>
    deal.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    deal.industry.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalInfoRequests = Object.values(dealInfoRequests).flat().length;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {user?.role === 'admin' ? 'All Deals' : 'My Deals'}
        </h1>
        {user?.role === 'borrower' && (
          <Link href="/dashboard/deals/new" className="btn btn-primary inline-flex items-center">
            <Plus className="h-5 w-5 mr-2" />
            Create Deal
          </Link>
        )}
      </div>

      {/* Info Requests Alert Banner */}
      {user?.role === 'borrower' && totalInfoRequests > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <Bell className="h-5 w-5 text-amber-600 mr-3" />
            <div>
              <p className="font-semibold text-amber-800">
                Action Required: {totalInfoRequests} Information Request{totalInfoRequests > 1 ? 's' : ''}
              </p>
              <p className="text-sm text-amber-700">
                Lenders or insurers have requested additional information on your deals. Click on the deal to view details.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search deals..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input pl-10"
              />
            </div>
          </div>
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input"
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="analyzing">Analyzing</option>
              <option value="analyzed">Analyzed</option>
              <option value="matched">Matched</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Deals Table */}
      <div className="card">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : filteredDeals.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deal Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Industry</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Loan Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Revenue</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">EBITDA</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {(filteredDeals || []).map((deal) => {
                  const hasInfoRequests = dealInfoRequests[deal.id]?.length > 0;
                  return (
                    <tr key={deal.id} className={`hover:bg-gray-50 ${hasInfoRequests ? 'bg-amber-50' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center">
                          <Link href={`/dashboard/deals/${deal.id}`} className="text-primary-600 hover:underline font-medium">
                            {deal.name}
                          </Link>
                          {hasInfoRequests && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-200 text-amber-800">
                              <MessageSquare className="h-3 w-3 mr-1" />
                              {dealInfoRequests[deal.id].length} request{dealInfoRequests[deal.id].length > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 capitalize">{deal.deal_type}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 capitalize">{deal.industry.replace('_', ' ')}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-medium">{formatCurrency(deal.loan_amount_requested)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatCurrency(deal.annual_revenue)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatCurrency(deal.ebitda)}</td>
                      <td className="px-4 py-3">
                        <span className={`badge ${getStatusColor(deal.status)}`}>
                          {deal.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(deal.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">No deals found</p>
            {user?.role === 'borrower' && (
              <Link href="/dashboard/deals/new" className="btn btn-primary">
                Create Your First Deal
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}