'use client';

import { useEffect, useState } from 'react';
import { 
  Users, Plus, RefreshCw, UserPlus, Shield, Building2, 
  CheckCircle, XCircle, Key, Loader2, UserCheck, ClipboardCheck, Link
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { User } from '@/types';
import { formatDate, getRoleLabel, isLenderRole } from '@/lib/utils';

interface LenderOrg {
  id: number;
  name: string;
  company: string;
  email: string;
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [lenderOrgs, setLenderOrgs] = useState<LenderOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Create user modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '',
    full_name: '',
    company_name: '',
    role: 'lender' as string,
    temporary_password: '',
    organization_id: null as number | null,
    skip_password_change: false,
  });

  useEffect(() => {
    loadUsers();
    loadLenderOrgs();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await api.getAllUsers();
      setUsers(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const loadLenderOrgs = async () => {
    try {
      const data = await api.getLenderOrganizations();
      setLenderOrgs(data);
    } catch (err: any) {
      console.error('Failed to load lender orgs:', err);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    setSuccess('');

    try {
      await api.adminCreateUser({
        email: newUser.email,
        full_name: newUser.full_name,
        company_name: newUser.company_name || undefined,
        role: newUser.role,
        temporary_password: newUser.temporary_password,
        organization_id: newUser.organization_id,
        skip_password_change: newUser.skip_password_change,
      });
      
      const pwdMsg = newUser.skip_password_change 
        ? 'Test account created - no password change required.' 
        : 'They will need to change their password on first login.';
      setSuccess(`User ${newUser.email} created successfully. ${pwdMsg}`);
      setShowCreateModal(false);
      setNewUser({
        email: '',
        full_name: '',
        company_name: '',
        role: 'lender',
        temporary_password: '',
        organization_id: null,
        skip_password_change: false,
      });
      loadUsers();
      loadLenderOrgs();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const handleActivate = async (userId: number) => {
    try {
      await api.activateUser(userId);
      setSuccess('User activated');
      loadUsers();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to activate user');
    }
  };

  const handleDeactivate = async (userId: number) => {
    try {
      await api.deactivateUser(userId);
      setSuccess('User deactivated');
      loadUsers();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to deactivate user');
    }
  };

  const handleResetPassword = async (userId: number, email: string) => {
    if (!confirm(`Reset password for ${email}? They will receive a temporary password and must change it on next login.`)) {
      return;
    }
    
    try {
      await api.adminResetPassword(userId);
      setSuccess(`Password reset for ${email}. Temporary password is: TempPass123!`);
      loadUsers();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to reset password');
    }
  };

  // Filter users by role
  const lenders = users.filter(u => u.role === 'lender');
  const loanOfficers = users.filter(u => u.role === 'loan_officer');
  const creditCommittee = users.filter(u => u.role === 'credit_committee');
  const insurers = users.filter(u => u.role === 'insurer');
  const borrowers = users.filter(u => u.role === 'borrower');
  const admins = users.filter(u => u.role === 'admin');

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-orange-100 text-orange-800',
      lender: 'bg-blue-100 text-blue-800',
      loan_officer: 'bg-cyan-100 text-cyan-800',
      credit_committee: 'bg-indigo-100 text-indigo-800',
      insurer: 'bg-purple-100 text-purple-800',
      borrower: 'bg-green-100 text-green-800',
    };
    return colors[role] || 'bg-gray-100 text-gray-800';
  };

  const getOrgName = (orgId: number | null | undefined) => {
    if (!orgId) return null;
    const org = lenderOrgs.find(o => o.id === orgId);
    return org ? org.company || org.name : `Org #${orgId}`;
  };

  const needsOrganization = ['loan_officer', 'credit_committee'].includes(newUser.role);

  if (currentUser?.role !== 'admin') {
    return (
      <div className="text-center py-12">
        <Shield className="h-12 w-12 mx-auto text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700">Access Denied</h2>
        <p className="text-gray-500">Only administrators can access user management.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-600">Create and manage all user accounts</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadUsers} className="btn btn-secondary inline-flex items-center">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </button>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="btn btn-primary inline-flex items-center"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Create User
          </button>
        </div>
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

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
        <div className="card bg-blue-50 border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-600 text-sm">Lenders</p>
              <p className="text-2xl font-bold text-blue-700">{lenders.length}</p>
            </div>
            <Building2 className="h-8 w-8 text-blue-400" />
          </div>
        </div>
        <div className="card bg-cyan-50 border-cyan-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-cyan-600 text-sm">Loan Officers</p>
              <p className="text-2xl font-bold text-cyan-700">{loanOfficers.length}</p>
            </div>
            <ClipboardCheck className="h-8 w-8 text-cyan-400" />
          </div>
        </div>
        <div className="card bg-indigo-50 border-indigo-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-indigo-600 text-sm">Credit Committee</p>
              <p className="text-2xl font-bold text-indigo-700">{creditCommittee.length}</p>
            </div>
            <UserCheck className="h-8 w-8 text-indigo-400" />
          </div>
        </div>
        <div className="card bg-purple-50 border-purple-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-600 text-sm">Insurers</p>
              <p className="text-2xl font-bold text-purple-700">{insurers.length}</p>
            </div>
            <Shield className="h-8 w-8 text-purple-400" />
          </div>
        </div>
        <div className="card bg-green-50 border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-600 text-sm">Borrowers</p>
              <p className="text-2xl font-bold text-green-700">{borrowers.length}</p>
            </div>
            <Users className="h-8 w-8 text-green-400" />
          </div>
        </div>
        <div className="card bg-orange-50 border-orange-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-600 text-sm">Admins</p>
              <p className="text-2xl font-bold text-orange-700">{admins.length}</p>
            </div>
            <Key className="h-8 w-8 text-orange-400" />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        </div>
      ) : (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">All Users</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Organization</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium">{user.full_name}</p>
                        <p className="text-sm text-gray-500">{user.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${getRoleBadgeColor(user.role)}`}>
                        {getRoleLabel(user.role)}
                      </span>
                      {user.must_change_password && (
                        <span className="ml-2 px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">
                          Must Change Password
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {user.organization_id ? (
                        <span className="inline-flex items-center">
                          <Link className="h-3 w-3 mr-1" />
                          {getOrgName(user.organization_id)}
                        </span>
                      ) : (
                        user.company_name || '-'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {user.is_active ? (
                        <span className="inline-flex items-center text-green-600 text-sm">
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-red-600 text-sm">
                          <XCircle className="h-4 w-4 mr-1" />
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {user.id !== currentUser?.id && (
                          <>
                            {user.is_active ? (
                              <button
                                onClick={() => handleDeactivate(user.id)}
                                className="text-red-600 hover:text-red-800 text-sm"
                              >
                                Deactivate
                              </button>
                            ) : (
                              <button
                                onClick={() => handleActivate(user.id)}
                                className="text-green-600 hover:text-green-800 text-sm"
                              >
                                Activate
                              </button>
                            )}
                            {user.role !== 'borrower' && (
                              <button
                                onClick={() => handleResetPassword(user.id, user.email)}
                                className="text-blue-600 hover:text-blue-800 text-sm"
                              >
                                Reset Password
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4">Create User Account</h2>
            
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="label">Role *</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value, organization_id: null })}
                  className="input"
                  required
                >
                  <optgroup label="Lender Roles">
                    <option value="lender">Lender (Full Access)</option>
                    <option value="loan_officer">Loan Officer (Verify Only)</option>
                    <option value="credit_committee">Credit Committee (Decisions)</option>
                  </optgroup>
                  <optgroup label="Other Roles">
                    <option value="insurer">Insurer / Fund</option>
                    <option value="borrower">Borrower</option>
                    <option value="admin">Admin</option>
                  </optgroup>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {newUser.role === 'lender' && 'Full lender access - can verify, decide, and originate'}
                  {newUser.role === 'loan_officer' && 'Can verify documents and request info, but cannot accept/reject or originate'}
                  {newUser.role === 'credit_committee' && 'Can accept/reject deals and originate loans'}
                  {newUser.role === 'insurer' && 'Insurance/guarantee provider'}
                  {newUser.role === 'borrower' && 'Business seeking financing'}
                  {newUser.role === 'admin' && 'Platform administrator'}
                </p>
              </div>

              {needsOrganization && (
                <div>
                  <label className="label">Lender Organization *</label>
                  <select
                    value={newUser.organization_id || ''}
                    onChange={(e) => setNewUser({ ...newUser, organization_id: e.target.value ? parseInt(e.target.value) : null })}
                    className="input"
                    required={needsOrganization}
                  >
                    <option value="">Select organization...</option>
                    {lenderOrgs.map(org => (
                      <option key={org.id} value={org.id}>
                        {org.company || org.name} ({org.email})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    This user will have access to the selected lender's policies and matches.
                  </p>
                </div>
              )}

              <div>
                <label className="label">Full Name *</label>
                <input
                  type="text"
                  value={newUser.full_name}
                  onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                  className="input"
                  required
                  placeholder="John Smith"
                />
              </div>

              <div>
                <label className="label">Email *</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="input"
                  required
                  placeholder="john@company.com"
                />
              </div>

              <div>
                <label className="label">Company Name</label>
                <input
                  type="text"
                  value={newUser.company_name}
                  onChange={(e) => setNewUser({ ...newUser, company_name: e.target.value })}
                  className="input"
                  placeholder="Acme Capital"
                />
              </div>

              <div>
                <label className="label">Temporary Password *</label>
                <input
                  type="text"
                  value={newUser.temporary_password}
                  onChange={(e) => setNewUser({ ...newUser, temporary_password: e.target.value })}
                  className="input"
                  required
                  minLength={6}
                  placeholder="At least 6 characters"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="skip_password"
                  checked={newUser.skip_password_change}
                  onChange={(e) => setNewUser({ ...newUser, skip_password_change: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="skip_password" className="text-sm text-gray-600">
                  Skip password change (for test accounts)
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="btn btn-primary inline-flex items-center"
                >
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Create User
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
