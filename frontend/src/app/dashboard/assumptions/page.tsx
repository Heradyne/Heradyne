'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Save, RefreshCw, ChevronDown, ChevronRight, Users, Copy, Trash2, User as UserIcon, Settings, Shield } from 'lucide-react';
import { api } from '@/lib/api';
import { SystemAssumption, User, UserWithOverrides } from '@/types';
import { formatDate } from '@/lib/utils';

type ViewMode = 'system' | 'user' | 'origination';

interface OriginationSettings {
  require_dual_acceptance: boolean;
  require_insurer_for_origination: boolean;
}

export default function AssumptionsPage() {
  const [assumptions, setAssumptions] = useState<SystemAssumption[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [usersWithOverrides, setUsersWithOverrides] = useState<UserWithOverrides[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [editingValue, setEditingValue] = useState<{ category: string; key: string; value: string; userId?: number } | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // View mode: system defaults, user-specific, or origination settings
  const [viewMode, setViewMode] = useState<ViewMode>('system');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  
  // Origination settings
  const [originationSettings, setOriginationSettings] = useState<OriginationSettings>({
    require_dual_acceptance: false,
    require_insurer_for_origination: false
  });
  const [savingOrigination, setSavingOrigination] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (viewMode === 'system') {
      loadAssumptions();
    } else if (viewMode === 'user' && selectedUserId) {
      loadUserOverrides(selectedUserId);
    } else if (viewMode === 'origination') {
      loadOriginationSettings();
    }
  }, [viewMode, selectedUserId]);

  const loadData = async () => {
    try {
      const [assumptionsData, usersData] = await Promise.all([
        api.getAssumptions(),
        api.getAllUsers().catch(() => [])
      ]);
      setAssumptions(assumptionsData);
      setUsers(usersData.filter(u => u.role === 'lender' || u.role === 'insurer'));
      
      // Load users with overrides
      try {
        const overrides = await api.getUsersWithOverrides();
        setUsersWithOverrides(overrides);
      } catch (e) {
        // May not have permission
      }
      
      // Load origination settings
      try {
        const settings = await api.getOriginationSettings();
        setOriginationSettings(settings);
      } catch (e) {
        // May not have permission or settings don't exist yet
      }
      
      // Expand all categories by default
      const categories = new Set(assumptionsData.map(a => a.category));
      setExpandedCategories(categories);
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadAssumptions = async () => {
    try {
      // Load system defaults (user_id = 0 means null/system)
      const data = await api.getAssumptions(undefined, 0);
      setAssumptions(data);
    } catch (err) {
      setError('Failed to load assumptions');
    }
  };
  
  const loadOriginationSettings = async () => {
    try {
      const settings = await api.getOriginationSettings();
      setOriginationSettings(settings);
    } catch (err) {
      setError('Failed to load origination settings');
    }
  };
  
  const saveOriginationSettings = async () => {
    setSavingOrigination(true);
    setError('');
    setSuccess('');
    try {
      await api.updateOriginationSettings(originationSettings);
      setSuccess('Origination settings saved successfully');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save origination settings');
    } finally {
      setSavingOrigination(false);
    }
  };

  const loadUserOverrides = async (userId: number) => {
    try {
      // Get effective assumptions for user (system + overrides merged)
      const data = await api.getEffectiveAssumptions(userId);
      setAssumptions(data);
    } catch (err) {
      setError('Failed to load user overrides');
    }
  };

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const startEditing = (assumption: SystemAssumption) => {
    setEditingValue({
      category: assumption.category,
      key: assumption.key,
      value: JSON.stringify(assumption.value, null, 2),
      userId: viewMode === 'user' ? selectedUserId || undefined : undefined
    });
  };

  const cancelEditing = () => {
    setEditingValue(null);
  };

  const saveAssumption = async () => {
    if (!editingValue) return;
    
    setSaving(`${editingValue.category}.${editingValue.key}`);
    setError('');
    setSuccess('');

    try {
      const parsedValue = JSON.parse(editingValue.value);
      
      if (viewMode === 'user' && selectedUserId) {
        // Save as user override
        await api.createUserOverride(selectedUserId, editingValue.category, editingValue.key, parsedValue);
        setSuccess(`Updated override for ${editingValue.category}.${editingValue.key}`);
        await loadUserOverrides(selectedUserId);
      } else {
        // Save system default
        await api.updateAssumption(editingValue.category, editingValue.key, parsedValue);
        setSuccess(`Updated ${editingValue.category}.${editingValue.key}`);
        await loadAssumptions();
      }
      
      setEditingValue(null);
    } catch (err: any) {
      if (err instanceof SyntaxError) {
        setError('Invalid JSON format');
      } else {
        setError(err.response?.data?.detail || 'Failed to save assumption');
      }
    } finally {
      setSaving(null);
    }
  };

  const copyDefaultsToUser = async (userId: number) => {
    setError('');
    setSuccess('');
    try {
      const copied = await api.copyDefaultsToUser(userId);
      setSuccess(`Copied ${copied.length} defaults to user`);
      setShowCopyModal(false);
      
      // Refresh users with overrides
      const overrides = await api.getUsersWithOverrides();
      setUsersWithOverrides(overrides);
      
      // If viewing this user, refresh
      if (selectedUserId === userId) {
        await loadUserOverrides(userId);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to copy defaults');
    }
  };

  const deleteUserOverrides = async (userId: number) => {
    if (!confirm('Are you sure you want to delete all overrides for this user? They will revert to system defaults.')) {
      return;
    }
    
    setError('');
    setSuccess('');
    try {
      await api.deleteUserOverrides(userId);
      setSuccess('Deleted all user overrides');
      
      // Refresh users with overrides
      const overrides = await api.getUsersWithOverrides();
      setUsersWithOverrides(overrides);
      
      // If viewing this user, switch back to system
      if (selectedUserId === userId) {
        setViewMode('system');
        setSelectedUserId(null);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete overrides');
    }
  };

  const selectUser = (userId: number) => {
    setSelectedUserId(userId);
    setViewMode('user');
    setShowUserModal(false);
  };

  // Group assumptions by category
  const groupedAssumptions = assumptions.reduce((acc, assumption) => {
    if (!acc[assumption.category]) {
      acc[assumption.category] = [];
    }
    acc[assumption.category].push(assumption);
    return acc;
  }, {} as Record<string, SystemAssumption[]>);

  const categoryDescriptions: Record<string, string> = {
    'pd_engine': 'Probability of Default calculation parameters',
    'valuation_engine': 'Enterprise value multiple tables',
    'collateral_engine': 'Asset haircut percentages for NOLV',
    'structuring_engine': 'Guarantee and escrow band parameters',
    'cashflow_engine': 'Stress test and cash flow parameters',
    'fees': 'Fee calculation parameters'
  };

  const selectedUser = users.find(u => u.id === selectedUserId);

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
          <h1 className="text-2xl font-bold text-gray-900">System Assumptions</h1>
          <p className="text-gray-600">Configure underwriting engine parameters</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowUserModal(true)} className="btn btn-secondary inline-flex items-center">
            <Users className="h-4 w-4 mr-2" />
            User Overrides
          </button>
          <button onClick={loadData} className="btn btn-secondary inline-flex items-center">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </button>
        </div>
      </div>

      {/* View Mode Toggle */}
      <div className="bg-white rounded-lg border p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => { setViewMode('system'); setSelectedUserId(null); }}
              className={`px-4 py-2 rounded-lg font-medium ${
                viewMode === 'system' 
                  ? 'bg-primary-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              System Defaults
            </button>
            <button
              onClick={() => { setViewMode('origination'); setSelectedUserId(null); }}
              className={`px-4 py-2 rounded-lg font-medium inline-flex items-center ${
                viewMode === 'origination' 
                  ? 'bg-primary-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Settings className="h-4 w-4 mr-2" />
              Origination Settings
            </button>
            {selectedUserId && (
              <button
                onClick={() => setViewMode('user')}
                className={`px-4 py-2 rounded-lg font-medium inline-flex items-center ${
                  viewMode === 'user' 
                    ? 'bg-primary-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <UserIcon className="h-4 w-4 mr-2" />
                {selectedUser?.full_name || `User #${selectedUserId}`}
              </button>
            )}
          </div>
          
          {viewMode === 'user' && selectedUserId && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowCopyModal(true)}
                className="btn btn-secondary text-sm inline-flex items-center"
              >
                <Copy className="h-4 w-4 mr-1" />
                Copy All Defaults
              </button>
              <button
                onClick={() => deleteUserOverrides(selectedUserId)}
                className="btn bg-red-600 text-white hover:bg-red-700 text-sm inline-flex items-center"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Clear Overrides
              </button>
            </div>
          )}
        </div>
        
        {viewMode === 'user' && selectedUserId && (
          <p className="text-sm text-gray-500 mt-2">
            Showing effective assumptions for <strong>{selectedUser?.full_name}</strong> ({selectedUser?.email}).
            Values with a blue border are user-specific overrides.
          </p>
        )}
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

      {/* Origination Settings Panel */}
      {viewMode === 'origination' && (
        <div className="card mb-6">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="h-8 w-8 text-primary-600" />
            <div>
              <h2 className="text-xl font-semibold">Loan Origination Settings</h2>
              <p className="text-sm text-gray-500">Control requirements for loan origination</p>
            </div>
          </div>
          
          <div className="space-y-6">
            {/* Dual Acceptance Setting */}
            <div className="border rounded-lg p-4 bg-gray-50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">Require Dual Acceptance</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    When enabled, both a <strong>lender</strong> AND an <strong>insurer/fund</strong> must accept 
                    the deal before the lender can originate the loan. This ensures every loan has 
                    guarantee coverage before funding.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-4">
                  <input
                    type="checkbox"
                    checked={originationSettings.require_dual_acceptance}
                    onChange={(e) => setOriginationSettings({
                      ...originationSettings,
                      require_dual_acceptance: e.target.checked
                    })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                </label>
              </div>
              
              {originationSettings.require_dual_acceptance && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                  <strong>Active:</strong> Lenders will see "Awaiting Insurer/Fund Acceptance" on deals that don't have 
                  insurer approval yet. They won't be able to originate loans until an insurer accepts.
                </div>
              )}
            </div>
            
            {/* Require Insurer Setting */}
            <div className="border rounded-lg p-4 bg-gray-50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">Require Insurer for Origination</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    When enabled, an <strong>insurer/fund</strong> must accept the deal before origination, 
                    but doesn't require lender acceptance first (insurer can accept independently).
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-4">
                  <input
                    type="checkbox"
                    checked={originationSettings.require_insurer_for_origination}
                    onChange={(e) => setOriginationSettings({
                      ...originationSettings,
                      require_insurer_for_origination: e.target.checked
                    })}
                    className="sr-only peer"
                    disabled={originationSettings.require_dual_acceptance}
                  />
                  <div className={`w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600 ${originationSettings.require_dual_acceptance ? 'opacity-50' : ''}`}></div>
                </label>
              </div>
              
              {originationSettings.require_dual_acceptance && (
                <div className="mt-3 p-3 bg-gray-100 border border-gray-200 rounded text-sm text-gray-600">
                  <em>This setting is superseded by "Require Dual Acceptance" above.</em>
                </div>
              )}
            </div>
            
            {/* Save Button */}
            <div className="flex justify-end pt-4 border-t">
              <button
                onClick={saveOriginationSettings}
                disabled={savingOrigination}
                className="btn btn-primary inline-flex items-center"
              >
                {savingOrigination ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Origination Settings
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* System Assumptions List - only show when not in origination view */}
      {viewMode !== 'origination' && (
      <>
      <div className="space-y-4">
        {Object.entries(groupedAssumptions).map(([category, items]) => (
          <div key={category} className="card">
            <button
              onClick={() => toggleCategory(category)}
              className="w-full flex items-center justify-between text-left"
            >
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{category}</h2>
                <p className="text-sm text-gray-500">{categoryDescriptions[category] || 'Configuration parameters'}</p>
              </div>
              {expandedCategories.has(category) ? (
                <ChevronDown className="h-5 w-5 text-gray-400" />
              ) : (
                <ChevronRight className="h-5 w-5 text-gray-400" />
              )}
            </button>

            {expandedCategories.has(category) && (
              <div className="mt-4 space-y-4">
                {items.map((assumption) => {
                  const isOverride = viewMode === 'user' && assumption.user_id !== null;
                  
                  return (
                    <div 
                      key={`${assumption.category}.${assumption.key}`} 
                      className={`border rounded-lg p-4 ${isOverride ? 'border-blue-400 bg-blue-50' : ''}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-gray-900">{assumption.key}</h3>
                            {isOverride && (
                              <span className="text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded">
                                User Override
                              </span>
                            )}
                          </div>
                          {assumption.description && (
                            <p className="text-sm text-gray-500">{assumption.description}</p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">
                            Last updated: {formatDate(assumption.updated_at)}
                          </p>
                        </div>
                        {editingValue?.category === assumption.category && editingValue?.key === assumption.key ? (
                          <div className="flex gap-2">
                            <button
                              onClick={saveAssumption}
                              disabled={saving !== null}
                              className="btn btn-primary text-sm py-1 px-3"
                            >
                              <Save className="h-4 w-4 mr-1 inline" />
                              Save
                            </button>
                            <button
                              onClick={cancelEditing}
                              className="btn btn-secondary text-sm py-1 px-3"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEditing(assumption)}
                            className="text-primary-600 hover:underline text-sm"
                          >
                            Edit
                          </button>
                        )}
                      </div>

                      {editingValue?.category === assumption.category && editingValue?.key === assumption.key ? (
                        <textarea
                          value={editingValue.value}
                          onChange={(e) => setEditingValue({ ...editingValue, value: e.target.value })}
                          className="w-full h-48 font-mono text-sm p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      ) : (
                        <pre className={`rounded-lg p-3 text-sm overflow-x-auto ${isOverride ? 'bg-white' : 'bg-gray-50'}`}>
                          {JSON.stringify(assumption.value, null, 2)}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {Object.keys(groupedAssumptions).length === 0 && viewMode !== 'origination' && (
        <div className="card text-center py-12">
          <p className="text-gray-500">No assumptions configured yet.</p>
          <p className="text-sm text-gray-400 mt-2">Run the seed script to populate default assumptions.</p>
        </div>
      )}
      </>
      )}

      {/* User Selection Modal */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4">User-Specific Assumptions</h2>
            
            {/* Users with existing overrides */}
            {usersWithOverrides.length > 0 && (
              <div className="mb-6">
                <h3 className="font-medium text-gray-700 mb-2">Users with Overrides</h3>
                <div className="space-y-2">
                  {usersWithOverrides.map(user => (
                    <div key={user.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                      <div>
                        <p className="font-medium">{user.full_name}</p>
                        <p className="text-sm text-gray-500">{user.email} • {user.role} • {user.override_count} overrides</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => selectUser(user.id)}
                          className="btn btn-primary text-sm"
                        >
                          View/Edit
                        </button>
                        <button
                          onClick={() => deleteUserOverrides(user.id)}
                          className="btn bg-red-100 text-red-700 hover:bg-red-200 text-sm"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All lenders/insurers */}
            <div>
              <h3 className="font-medium text-gray-700 mb-2">All Lenders & Insurers</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {users.map(user => {
                  const hasOverrides = usersWithOverrides.some(u => u.id === user.id);
                  return (
                    <div key={user.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                      <div>
                        <p className="font-medium">{user.full_name}</p>
                        <p className="text-sm text-gray-500">{user.email} • {user.role}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => selectUser(user.id)}
                          className="btn btn-secondary text-sm"
                        >
                          {hasOverrides ? 'View/Edit' : 'Create Overrides'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <button onClick={() => setShowUserModal(false)} className="btn btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copy Defaults Modal */}
      {showCopyModal && selectedUserId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-semibold mb-4">Copy System Defaults</h2>
            <p className="text-gray-600 mb-4">
              This will copy all system default assumptions as overrides for <strong>{selectedUser?.full_name}</strong>.
              Existing overrides will not be affected.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCopyModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={() => copyDefaultsToUser(selectedUserId)} className="btn btn-primary">
                Copy Defaults
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
