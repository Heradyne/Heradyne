'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Search, RefreshCw, Filter } from 'lucide-react';
import { api } from '@/lib/api';
import { AuditLog } from '@/types';
import { formatDateTime } from '@/lib/utils';

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filters
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(0);
  const limit = 50;

  useEffect(() => {
    loadLogs();
  }, [entityType, action, page]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const params: any = { skip: page * limit, limit };
      if (entityType) params.entity_type = entityType;
      if (action) params.action = action;
      
      const data = await api.getAuditLogs(params);
      setLogs(data.items);
      setTotal(data.total);
    } catch (err) {
      setError('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setEntityType('');
    setAction('');
    setPage(0);
  };

  const getActionColor = (action: string): string => {
    if (action.includes('created') || action.includes('registered')) return 'text-green-600 bg-green-50';
    if (action.includes('deleted')) return 'text-red-600 bg-red-50';
    if (action.includes('updated') || action.includes('submitted')) return 'text-blue-600 bg-blue-50';
    if (action.includes('accepted')) return 'text-green-600 bg-green-50';
    if (action.includes('rejected')) return 'text-red-600 bg-red-50';
    return 'text-gray-600 bg-gray-50';
  };

  const uniqueEntityTypes = [...new Set((logs || []).map(l => l.entity_type))];
  const uniqueActions = [...new Set((logs || []).map(l => l.action))];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
          <p className="text-gray-600">View system activity and changes</p>
        </div>
        <button onClick={loadLogs} className="btn btn-secondary inline-flex items-center">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="label">Entity Type</label>
            <select
              value={entityType}
              onChange={(e) => { setEntityType(e.target.value); setPage(0); }}
              className="input"
            >
              <option value="">All Types</option>
              <option value="user">User</option>
              <option value="deal">Deal</option>
              <option value="deal_document">Document</option>
              <option value="deal_match">Match</option>
              <option value="lender_policy">Lender Policy</option>
              <option value="insurer_policy">Insurer Policy</option>
              <option value="system_assumption">Assumption</option>
            </select>
          </div>
          <div>
            <label className="label">Action</label>
            <select
              value={action}
              onChange={(e) => { setAction(e.target.value); setPage(0); }}
              className="input"
            >
              <option value="">All Actions</option>
              <option value="user_registered">User Registered</option>
              <option value="user_login">User Login</option>
              <option value="deal_created">Deal Created</option>
              <option value="deal_submitted">Deal Submitted</option>
              <option value="deal_analyzed">Deal Analyzed</option>
              <option value="deal_matched">Deal Matched</option>
              <option value="match_accepted">Match Accepted</option>
              <option value="match_rejected">Match Rejected</option>
              <option value="document_uploaded">Document Uploaded</option>
              <option value="assumption_updated">Assumption Updated</option>
            </select>
          </div>
          {(entityType || action) && (
            <button onClick={clearFilters} className="text-sm text-primary-600 hover:underline">
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Logs Table */}
      <div className="card">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : logs.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entity</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {(logs || []).map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {formatDateTime(log.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded ${getActionColor(log.action)}`}>
                          {log.action.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className="text-gray-900">{log.entity_type}</span>
                        {log.entity_id && (
                          <span className="text-gray-500 ml-1">#{log.entity_id}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {log.user_id || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {log.details ? (
                          <details className="cursor-pointer">
                            <summary className="text-primary-600 hover:underline">View</summary>
                            <pre className="mt-2 p-2 bg-gray-50 rounded text-xs overflow-x-auto max-w-md">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          </details>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex justify-between items-center mt-4 pt-4 border-t">
              <p className="text-sm text-gray-600">
                Showing {page * limit + 1} - {Math.min((page + 1) * limit, total)} of {total} logs
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="btn btn-secondary text-sm py-1 px-3 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={(page + 1) * limit >= total}
                  className="btn btn-secondary text-sm py-1 px-3 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500">No audit logs found</p>
            {(entityType || action) && (
              <button onClick={clearFilters} className="text-primary-600 hover:underline mt-2">
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}