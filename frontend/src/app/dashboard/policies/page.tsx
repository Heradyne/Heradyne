'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { LenderPolicy, InsurerPolicy } from '@/types';
import { formatCurrency, formatPercent, formatDate, INDUSTRIES } from '@/lib/utils';

export default function PoliciesPage() {
  const { user } = useAuth();
  const [lenderPolicies, setLenderPolicies] = useState<LenderPolicy[]>([]);
  const [insurerPolicies, setInsurerPolicies] = useState<InsurerPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<LenderPolicy | InsurerPolicy | null>(null);
  const [error, setError] = useState('');

  const isLender = user?.role === 'lender';
  const isInsurer = user?.role === 'insurer';

  useEffect(() => {
    loadPolicies();
  }, [user]);

  const loadPolicies = async () => {
    try {
      if (isLender || user?.role === 'admin') {
        const data = await api.getLenderPolicies();
        setLenderPolicies(data);
      }
      if (isInsurer || user?.role === 'admin') {
        const data = await api.getInsurerPolicies();
        setInsurerPolicies(data);
      }
    } catch (err) {
      setError('Failed to load policies');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number, type: 'lender' | 'insurer') => {
    if (!confirm('Are you sure you want to delete this policy?')) return;
    
    try {
      if (type === 'lender') {
        await api.deleteLenderPolicy(id);
      } else {
        // Would need to add this to API
      }
      await loadPolicies();
    } catch (err) {
      setError('Failed to delete policy');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const policies = isLender ? lenderPolicies : insurerPolicies;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Policies</h1>
          <p className="text-gray-600">
            {isLender ? 'Define your lending criteria' : 'Define your coverage parameters'}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn btn-primary inline-flex items-center"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Policy
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {showForm && (
        <PolicyForm
          type={isLender ? 'lender' : 'insurer'}
          policy={editingPolicy}
          onSave={async () => {
            setShowForm(false);
            setEditingPolicy(null);
            await loadPolicies();
          }}
          onCancel={() => {
            setShowForm(false);
            setEditingPolicy(null);
          }}
        />
      )}

      {!showForm && (
        <div className="grid gap-6">
          {policies.length > 0 ? (
            policies.map((policy) => (
              <div key={policy.id} className="card">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{policy.name}</h2>
                    <p className="text-sm text-gray-500">
                      Created {formatDate(policy.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`badge ${policy.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                      {policy.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <button
                      onClick={() => {
                        setEditingPolicy(policy);
                        setShowForm(true);
                      }}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(policy.id, isLender ? 'lender' : 'insurer')}
                      className="p-1 text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {isLender && (
                  <LenderPolicyDetails policy={policy as LenderPolicy} />
                )}
                {isInsurer && (
                  <InsurerPolicyDetails policy={policy as InsurerPolicy} />
                )}
              </div>
            ))
          ) : (
            <div className="card text-center py-12">
              <p className="text-gray-500 mb-4">No policies defined yet</p>
              <button onClick={() => setShowForm(true)} className="btn btn-primary">
                Create Your First Policy
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LenderPolicyDetails({ policy }: { policy: LenderPolicy }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-gray-500">Loan Size</p>
          <p className="font-medium">
            {policy.min_loan_size ? formatCurrency(policy.min_loan_size) : 'No min'} - {policy.max_loan_size ? formatCurrency(policy.max_loan_size) : 'No max'}
          </p>
        </div>
        <div>
          <p className="text-gray-500">Min DSCR</p>
          <p className="font-medium">{policy.min_dscr ? `${policy.min_dscr}x` : 'Not set'}</p>
        </div>
        <div>
          <p className="text-gray-500">Max PD</p>
          <p className="font-medium">{policy.max_pd ? formatPercent(policy.max_pd) : 'Not set'}</p>
        </div>
        <div>
          <p className="text-gray-500">Max Leverage</p>
          <p className="font-medium">{policy.max_leverage ? `${policy.max_leverage}x` : 'Not set'}</p>
        </div>
        <div>
          <p className="text-gray-500">Term Range</p>
          <p className="font-medium">
            {policy.min_term_months || 0} - {policy.max_term_months || '∞'} months
          </p>
        </div>
        <div>
          <p className="text-gray-500">Target Rate</p>
          <p className="font-medium">
            {policy.target_rate_min ? formatPercent(policy.target_rate_min) : '?'} - {policy.target_rate_max ? formatPercent(policy.target_rate_max) : '?'}
          </p>
        </div>
        <div className="col-span-2">
          <p className="text-gray-500">Industries</p>
          <p className="font-medium">
            {policy.allowed_industries?.length 
              ? policy.allowed_industries.join(', ')
              : 'All industries'}
            {policy.excluded_industries?.length 
              ? ` (excluding: ${policy.excluded_industries.join(', ')})` 
              : ''}
          </p>
        </div>
      </div>
      
      {/* Auto-Decision Settings Display */}
      {policy.auto_decision_enabled && (
        <div className="bg-blue-50 rounded-lg p-3 text-sm">
          <p className="font-medium text-blue-800 mb-2">🤖 Auto-Decision Enabled</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-blue-700">
            {policy.auto_reject_threshold !== undefined && (
              <div>
                <span className="text-blue-500">Auto-Reject:</span> ≤{policy.auto_reject_threshold}%
              </div>
            )}
            {policy.counter_offer_min !== undefined && (
              <div>
                <span className="text-blue-500">Counter Min:</span> ≥{policy.counter_offer_min}%
              </div>
            )}
            {policy.counter_offer_max !== undefined && (
              <div>
                <span className="text-blue-500">Counter Max:</span> &lt;{policy.counter_offer_max}%
              </div>
            )}
            {policy.auto_accept_threshold !== undefined && (
              <div>
                <span className="text-blue-500">Auto-Accept:</span> ≥{policy.auto_accept_threshold}%
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InsurerPolicyDetails({ policy }: { policy: InsurerPolicy }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
      <div>
        <p className="text-gray-500">Coverage Amount</p>
        <p className="font-medium">
          {policy.min_coverage_amount ? formatCurrency(policy.min_coverage_amount) : 'No min'} - {policy.max_coverage_amount ? formatCurrency(policy.max_coverage_amount) : 'No max'}
        </p>
      </div>
      <div>
        <p className="text-gray-500">Max Expected Loss</p>
        <p className="font-medium">{policy.max_expected_loss ? formatPercent(policy.max_expected_loss) : 'Not set'}</p>
      </div>
      <div>
        <p className="text-gray-500">Attachment Point</p>
        <p className="font-medium">
          {policy.min_attachment_point ? formatPercent(policy.min_attachment_point) : '?'} - {policy.max_attachment_point ? formatPercent(policy.max_attachment_point) : '?'}
        </p>
      </div>
      <div>
        <p className="text-gray-500">Target Premium</p>
        <p className="font-medium">
          {policy.target_premium_min ? formatPercent(policy.target_premium_min) : '?'} - {policy.target_premium_max ? formatPercent(policy.target_premium_max) : '?'}
        </p>
      </div>
      <div className="col-span-2">
        <p className="text-gray-500">Industries</p>
        <p className="font-medium">
          {policy.allowed_industries?.length 
            ? policy.allowed_industries.join(', ')
            : 'All industries'}
        </p>
      </div>
    </div>
  );
}

function PolicyForm({ 
  type, 
  policy, 
  onSave, 
  onCancel 
}: { 
  type: 'lender' | 'insurer';
  policy: LenderPolicy | InsurerPolicy | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState({
    name: policy?.name || '',
    is_active: policy?.is_active ?? true,
    min_loan_size: (policy as LenderPolicy)?.min_loan_size?.toString() || '',
    max_loan_size: (policy as LenderPolicy)?.max_loan_size?.toString() || '',
    min_dscr: (policy as LenderPolicy)?.min_dscr?.toString() || '',
    max_pd: (policy as LenderPolicy)?.max_pd?.toString() || '',
    max_leverage: (policy as LenderPolicy)?.max_leverage?.toString() || '',
    min_collateral_coverage: (policy as LenderPolicy)?.min_collateral_coverage?.toString() || '',
    min_term_months: (policy as LenderPolicy)?.min_term_months?.toString() || '',
    max_term_months: (policy as LenderPolicy)?.max_term_months?.toString() || '',
    target_rate_min: (policy as LenderPolicy)?.target_rate_min?.toString() || '',
    target_rate_max: (policy as LenderPolicy)?.target_rate_max?.toString() || '',
    allowed_industries: policy?.allowed_industries || [],
    allowed_deal_types: policy?.allowed_deal_types || ['acquisition', 'growth'],
    // Insurer specific
    max_expected_loss: (policy as InsurerPolicy)?.max_expected_loss?.toString() || '',
    min_coverage_amount: (policy as InsurerPolicy)?.min_coverage_amount?.toString() || '',
    max_coverage_amount: (policy as InsurerPolicy)?.max_coverage_amount?.toString() || '',
    // Auto-decision settings
    auto_decision_enabled: policy?.auto_decision_enabled ?? false,
    auto_accept_threshold: policy?.auto_accept_threshold?.toString() || '',
    auto_reject_threshold: policy?.auto_reject_threshold?.toString() || '',
    counter_offer_min: policy?.counter_offer_min?.toString() || '',
    counter_offer_max: policy?.counter_offer_max?.toString() || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data: any = {
        name: formData.name,
        is_active: formData.is_active,
        allowed_industries: formData.allowed_industries.length > 0 ? formData.allowed_industries : null,
        allowed_deal_types: formData.allowed_deal_types,
        // Auto-decision settings
        auto_decision_enabled: formData.auto_decision_enabled,
      };

      // Add auto-decision thresholds if enabled
      if (formData.auto_decision_enabled) {
        if (formData.auto_accept_threshold) data.auto_accept_threshold = parseFloat(formData.auto_accept_threshold);
        if (formData.auto_reject_threshold) data.auto_reject_threshold = parseFloat(formData.auto_reject_threshold);
        if (formData.counter_offer_min) data.counter_offer_min = parseFloat(formData.counter_offer_min);
        if (formData.counter_offer_max) data.counter_offer_max = parseFloat(formData.counter_offer_max);
      }

      if (type === 'lender') {
        if (formData.min_loan_size) data.min_loan_size = parseFloat(formData.min_loan_size);
        if (formData.max_loan_size) data.max_loan_size = parseFloat(formData.max_loan_size);
        if (formData.min_dscr) data.min_dscr = parseFloat(formData.min_dscr);
        if (formData.max_pd) data.max_pd = parseFloat(formData.max_pd);
        if (formData.max_leverage) data.max_leverage = parseFloat(formData.max_leverage);
        if (formData.min_collateral_coverage) data.min_collateral_coverage = parseFloat(formData.min_collateral_coverage);
        if (formData.min_term_months) data.min_term_months = parseInt(formData.min_term_months);
        if (formData.max_term_months) data.max_term_months = parseInt(formData.max_term_months);
        if (formData.target_rate_min) data.target_rate_min = parseFloat(formData.target_rate_min);
        if (formData.target_rate_max) data.target_rate_max = parseFloat(formData.target_rate_max);

        if (policy) {
          await api.updateLenderPolicy(policy.id, data);
        } else {
          await api.createLenderPolicy(data);
        }
      } else {
        if (formData.max_expected_loss) data.max_expected_loss = parseFloat(formData.max_expected_loss);
        if (formData.min_coverage_amount) data.min_coverage_amount = parseFloat(formData.min_coverage_amount);
        if (formData.max_coverage_amount) data.max_coverage_amount = parseFloat(formData.max_coverage_amount);

        if (policy) {
          await api.updateInsurerPolicy(policy.id, data);
        } else {
          await api.createInsurerPolicy(data);
        }
      }

      onSave();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save policy');
    } finally {
      setLoading(false);
    }
  };

  const toggleIndustry = (industry: string) => {
    const current = formData.allowed_industries;
    if (current.includes(industry)) {
      setFormData({ ...formData, allowed_industries: current.filter(i => i !== industry) });
    } else {
      setFormData({ ...formData, allowed_industries: [...current, industry] });
    }
  };

  return (
    <div className="card mb-6">
      <h2 className="text-lg font-semibold mb-4">
        {policy ? 'Edit Policy' : 'Create New Policy'}
      </h2>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Policy Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input"
              required
            />
          </div>

          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm">Active (available for matching)</span>
            </label>
          </div>
        </div>

        {type === 'lender' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="label">Min Loan Size</label>
                <input
                  type="number"
                  value={formData.min_loan_size}
                  onChange={(e) => setFormData({ ...formData, min_loan_size: e.target.value })}
                  className="input"
                  placeholder="500000"
                />
              </div>
              <div>
                <label className="label">Max Loan Size</label>
                <input
                  type="number"
                  value={formData.max_loan_size}
                  onChange={(e) => setFormData({ ...formData, max_loan_size: e.target.value })}
                  className="input"
                  placeholder="5000000"
                />
              </div>
              <div>
                <label className="label">Min DSCR</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.min_dscr}
                  onChange={(e) => setFormData({ ...formData, min_dscr: e.target.value })}
                  className="input"
                  placeholder="1.25"
                />
              </div>
              <div>
                <label className="label">Max PD (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.max_pd}
                  onChange={(e) => setFormData({ ...formData, max_pd: e.target.value })}
                  className="input"
                  placeholder="0.05"
                />
              </div>
              <div>
                <label className="label">Max Leverage</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.max_leverage}
                  onChange={(e) => setFormData({ ...formData, max_leverage: e.target.value })}
                  className="input"
                  placeholder="4.0"
                />
              </div>
              <div>
                <label className="label">Min Collateral Coverage</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.min_collateral_coverage}
                  onChange={(e) => setFormData({ ...formData, min_collateral_coverage: e.target.value })}
                  className="input"
                  placeholder="0.8"
                />
              </div>
              <div>
                <label className="label">Min Term (months)</label>
                <input
                  type="number"
                  value={formData.min_term_months}
                  onChange={(e) => setFormData({ ...formData, min_term_months: e.target.value })}
                  className="input"
                  placeholder="36"
                />
              </div>
              <div>
                <label className="label">Max Term (months)</label>
                <input
                  type="number"
                  value={formData.max_term_months}
                  onChange={(e) => setFormData({ ...formData, max_term_months: e.target.value })}
                  className="input"
                  placeholder="120"
                />
              </div>
            </div>
          </>
        )}

        {type === 'insurer' && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Max Expected Loss (%)</label>
              <input
                type="number"
                step="0.01"
                value={formData.max_expected_loss}
                onChange={(e) => setFormData({ ...formData, max_expected_loss: e.target.value })}
                className="input"
                placeholder="0.03"
              />
            </div>
            <div>
              <label className="label">Min Coverage Amount</label>
              <input
                type="number"
                value={formData.min_coverage_amount}
                onChange={(e) => setFormData({ ...formData, min_coverage_amount: e.target.value })}
                className="input"
                placeholder="250000"
              />
            </div>
            <div>
              <label className="label">Max Coverage Amount</label>
              <input
                type="number"
                value={formData.max_coverage_amount}
                onChange={(e) => setFormData({ ...formData, max_coverage_amount: e.target.value })}
                className="input"
                placeholder="2000000"
              />
            </div>
          </div>
        )}

        {/* Auto-Decision Settings */}
        <div className="border-t pt-4 mt-4">
          <div className="flex items-center mb-4">
            <input
              type="checkbox"
              id="auto_decision_enabled"
              checked={formData.auto_decision_enabled}
              onChange={(e) => setFormData({ ...formData, auto_decision_enabled: e.target.checked })}
              className="h-4 w-4 text-primary-600 rounded border-gray-300"
            />
            <label htmlFor="auto_decision_enabled" className="ml-2 font-medium text-gray-700">
              Enable Auto-Decisions
            </label>
          </div>
          
          {formData.auto_decision_enabled && (
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-4">
                Configure automatic accept/reject thresholds and counter-offer ranges based on match score (0-100%).
                <br />
                <span className="text-amber-600 font-medium">Order: Reject → Counter-Offer → Accept</span>
              </p>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="label">Auto-Reject ≤ (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.auto_reject_threshold}
                    onChange={(e) => setFormData({ ...formData, auto_reject_threshold: e.target.value })}
                    className="input"
                    placeholder="30"
                  />
                  <p className="text-xs text-gray-500 mt-1">Reject if score ≤ this</p>
                </div>
                <div>
                  <label className="label">Counter-Offer Min (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.counter_offer_min}
                    onChange={(e) => setFormData({ ...formData, counter_offer_min: e.target.value })}
                    className="input"
                    placeholder="50"
                  />
                  <p className="text-xs text-gray-500 mt-1">Counter if score ≥ this</p>
                </div>
                <div>
                  <label className="label">Counter-Offer Max (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.counter_offer_max}
                    onChange={(e) => setFormData({ ...formData, counter_offer_max: e.target.value })}
                    className="input"
                    placeholder="80"
                  />
                  <p className="text-xs text-gray-500 mt-1">Counter if score &lt; accept</p>
                </div>
                <div>
                  <label className="label">Auto-Accept ≥ (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.auto_accept_threshold}
                    onChange={(e) => setFormData({ ...formData, auto_accept_threshold: e.target.value })}
                    className="input"
                    placeholder="90"
                  />
                  <p className="text-xs text-gray-500 mt-1">Accept if score ≥ this</p>
                </div>
              </div>
              
              <div className="mt-4 p-3 bg-blue-50 rounded text-sm text-blue-800">
                <strong>Example:</strong> With reject=30%, counter-min=50%, counter-max=80%, accept=90%:
                <ul className="list-disc ml-5 mt-1">
                  <li>Match ≤30% → Auto-rejected</li>
                  <li>Match 31-49% → Manual review</li>
                  <li>Match 50-89% → Counter-offer sent to borrower</li>
                  <li>Match ≥90% → Auto-accepted</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="label">Allowed Industries (leave empty for all)</label>
          <div className="flex flex-wrap gap-2">
            {INDUSTRIES.map((industry) => (
              <button
                key={industry}
                type="button"
                onClick={() => toggleIndustry(industry)}
                className={`px-3 py-1 rounded-full text-sm ${
                  formData.allowed_industries.includes(industry)
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {industry.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-4">
          <button type="button" onClick={onCancel} className="btn btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="btn btn-primary">
            {loading ? 'Saving...' : 'Save Policy'}
          </button>
        </div>
      </form>
    </div>
  );
}