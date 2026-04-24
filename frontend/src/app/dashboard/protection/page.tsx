'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { 
  Shield, ShieldCheck, ShieldAlert, ShieldX, AlertTriangle,
  Building2, Home, CreditCard, History, RefreshCw, Loader2, Info, Eye
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';

interface AssetDetail {
  type: string;
  description: string | null;
  estimated_value: number;
}

interface TierStatus {
  tier: string;
  name: string;
  description: string;
  coverage: number;
  used: number;
  remaining: number;
  percentage_used: number;
  is_active: boolean;
  triggered_at: string | null;
  assets: AssetDetail[];
}

interface Protection {
  id: number | null;
  loan_id: number | null;
  deal_id: number;
  deal_name: string;
  loan_number: string | null;
  status: string;
  current_tier: string;
  health_score: number;
  is_preview: boolean;
  original_loan_amount: number;
  outstanding_balance: number;
  guarantee_percentage: number;
  guaranteed_amount: number;
  tier_1: TierStatus;
  tier_2: TierStatus;
  tier_3: TierStatus;
  total_protection: number;
  total_used: number;
  total_remaining: number;
  months_current: number;
  months_delinquent: number;
  total_missed_payments: number;
  last_payment_date: string | null;
  tier_2_enrolled: boolean;
  tier_2_monthly_fee: number;
  created_at: string | null;
  updated_at: string | null;
}

interface ProtectionEvent {
  id: number;
  event_type: string;
  previous_status: string | null;
  new_status: string | null;
  amount_involved: number | null;
  description: string | null;
  created_at: string;
}

export default function ProtectionPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [protections, setProtections] = useState<Protection[]>([]);
  const [selectedProtection, setSelectedProtection] = useState<Protection | null>(null);
  const [events, setEvents] = useState<ProtectionEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [enrollFee, setEnrollFee] = useState(100);
  const [enrolling, setEnrolling] = useState(false);
  
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (user?.role === 'borrower') {
      loadProtections();
    }
  }, [user]);

  const loadProtections = async () => {
    try {
      setLoading(true);
      const data = await api.getMyProtections();
      setProtections(data);
      if (data.length > 0 && !selectedProtection) {
        setSelectedProtection(data[0]);
        if (data[0].id) {
          loadEvents(data[0].id);
        } else {
          setEvents([]);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load protections');
    } finally {
      setLoading(false);
    }
  };

  const loadEvents = async (protectionId: number) => {
    try {
      setLoadingEvents(true);
      const data = await api.getProtectionEvents(protectionId);
      setEvents(data);
    } catch (err: any) {
      console.error('Failed to load events:', err);
      setEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  };

  const selectProtection = (protection: Protection) => {
    setSelectedProtection(protection);
    if (protection.id) {
      loadEvents(protection.id);
    } else {
      setEvents([]);
    }
  };

  const handleEnrollTier2 = async () => {
    if (!selectedProtection) return;
    setEnrolling(true);
    setError('');
    try {
      const updated = await api.enrollTier2(selectedProtection.id, enrollFee);
      setSuccess('Successfully enrolled in Tier 2 Personal Protection!');
      setShowEnrollModal(false);
      setSelectedProtection(updated);
      loadProtections();
      loadEvents(selectedProtection.id);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to enroll');
    } finally {
      setEnrolling(false);
    }
  };

  const handleTier2Payment = async () => {
    if (!selectedProtection) return;
    setPaying(true);
    setError('');
    try {
      const updated = await api.makeTier2Payment(selectedProtection.id, paymentAmount);
      setSuccess(`Payment of ${formatCurrency(paymentAmount)} processed! Added ${formatCurrency(paymentAmount * 2)} to your protection.`);
      setShowPaymentModal(false);
      setSelectedProtection(updated);
      loadProtections();
      loadEvents(selectedProtection.id);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to process payment');
    } finally {
      setPaying(false);
    }
  };

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    if (score >= 40) return 'text-orange-600';
    return 'text-red-600';
  };

  const getHealthBg = (score: number) => {
    if (score >= 80) return 'bg-green-100';
    if (score >= 60) return 'bg-yellow-100';
    if (score >= 40) return 'bg-orange-100';
    return 'bg-red-100';
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string; text: string; icon: any }> = {
      active: { bg: 'bg-green-100', text: 'text-green-800', icon: ShieldCheck },
      preview: { bg: 'bg-blue-100', text: 'text-blue-800', icon: Eye },
      warning: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: AlertTriangle },
      tier_1_triggered: { bg: 'bg-orange-100', text: 'text-orange-800', icon: ShieldAlert },
      tier_2_triggered: { bg: 'bg-orange-100', text: 'text-orange-800', icon: ShieldAlert },
      tier_3_triggered: { bg: 'bg-red-100', text: 'text-red-800', icon: ShieldX },
      defaulted: { bg: 'bg-red-100', text: 'text-red-800', icon: ShieldX },
    };
    return badges[status] || badges.active;
  };

  if (user?.role !== 'borrower') {
    return (
      <div className="text-center py-12">
        <Shield className="h-12 w-12 mx-auto text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700">Access Denied</h2>
        <p className="text-gray-500">Only borrowers can view default protection.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Default Protection</h1>
          <p className="text-gray-600">Track your tiered protection against loan default</p>
        </div>
        <button onClick={loadProtections} className="btn btn-secondary inline-flex items-center">
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

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg mb-6">
          {success}
          <button onClick={() => setSuccess('')} className="float-right">×</button>
        </div>
      )}

      {protections.length === 0 ? (
        <div className="card text-center py-12">
          <Shield className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600">No active loan protections.</p>
          <p className="text-sm text-gray-500 mt-2">
            Protection is automatically created when you receive a loan with a guarantee.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Protection List */}
          <div className="lg:col-span-1 space-y-4">
            <h2 className="font-semibold text-gray-700">Your Loans</h2>
            {(protections || []).map((protection) => {
              const StatusIcon = getStatusBadge(protection.status).icon;
              return (
                <div
                  key={protection.id || `preview-${protection.deal_id}`}
                  onClick={() => selectProtection(protection)}
                  className={`card cursor-pointer hover:shadow-lg transition-shadow ${
                    selectedProtection?.deal_id === protection.deal_id ? 'ring-2 ring-primary-500' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{protection.deal_name}</p>
                      <p className="text-sm text-gray-500">
                        {protection.loan_number || 'Loan pending'}
                      </p>
                      {protection.is_preview && (
                        <span className="inline-flex items-center px-2 py-0.5 mt-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          <Eye className="h-3 w-3 mr-1" />
                          Preview
                        </span>
                      )}
                    </div>
                    <div className={`p-2 rounded-full ${getHealthBg(protection.health_score)}`}>
                      <StatusIcon className={`h-5 w-5 ${getHealthColor(protection.health_score)}`} />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-sm text-gray-500">Health Score</span>
                    <span className={`text-lg font-bold ${getHealthColor(protection.health_score)}`}>
                      {protection.health_score}/100
                    </span>
                  </div>
                  <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all ${
                        protection.health_score >= 80 ? 'bg-green-500' :
                        protection.health_score >= 60 ? 'bg-yellow-500' :
                        protection.health_score >= 40 ? 'bg-orange-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${protection.health_score}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: Selected Protection Details */}
          {selectedProtection && (
            <div className="lg:col-span-2 space-y-6">
              {/* Header */}
              <div className="card">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-semibold">{selectedProtection.deal_name}</h2>
                    <p className="text-gray-500">
                      {selectedProtection.loan_number ? `Loan: ${selectedProtection.loan_number}` : 'Loan not yet funded'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {selectedProtection.is_preview && (
                      <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                        PREVIEW
                      </span>
                    )}
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      getStatusBadge(selectedProtection.status).bg
                    } ${getStatusBadge(selectedProtection.status).text}`}>
                      {selectedProtection.status.replace(/_/g, ' ').toUpperCase()}
                    </span>
                  </div>
                </div>
                
                {selectedProtection.is_preview && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                    <p className="text-sm text-blue-700">
                      <Info className="h-4 w-4 inline mr-1" />
                      This is a preview of your default protection based on your deal. 
                      Final protection will be created when your loan is funded with a guarantee.
                    </p>
                  </div>
                )}
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">
                      {selectedProtection.is_preview ? 'Requested Amount' : 'Loan Amount'}
                    </p>
                    <p className="font-semibold">{formatCurrency(selectedProtection.original_loan_amount)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Outstanding</p>
                    <p className="font-semibold">{formatCurrency(selectedProtection.outstanding_balance)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">
                      {selectedProtection.is_preview ? 'Est. Guarantee' : 'Guarantee'}
                    </p>
                    <p className="font-semibold">{selectedProtection.guarantee_percentage}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Total Protection</p>
                    <p className="font-semibold text-green-600">{formatCurrency(selectedProtection.total_protection)}</p>
                  </div>
                </div>
              </div>

              {/* Tier 1 */}
              <div className={`card border-l-4 ${selectedProtection.tier_1.is_active ? 'border-l-blue-500' : 'border-l-gray-300'}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Building2 className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="font-medium">Tier 1: Business Protection</h4>
                      <p className="text-sm text-gray-500">Business assets pledged as collateral</p>
                    </div>
                  </div>
                  {selectedProtection.tier_1.is_active && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">ACTIVE</span>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-4">
                  <div><p className="text-sm text-gray-500">Coverage</p><p className="font-semibold">{formatCurrency(selectedProtection.tier_1.coverage)}</p></div>
                  <div><p className="text-sm text-gray-500">Used</p><p className="font-semibold text-orange-600">{formatCurrency(selectedProtection.tier_1.used)}</p></div>
                  <div><p className="text-sm text-gray-500">Remaining</p><p className="font-semibold text-green-600">{formatCurrency(selectedProtection.tier_1.remaining)}</p></div>
                </div>
                {selectedProtection.tier_1.assets && selectedProtection.tier_1.assets.length > 0 && (
                  <div className="mt-4 bg-gray-50 rounded-lg p-3">
                    <p className="text-sm font-medium text-gray-700 mb-2">Business Assets:</p>
                    <div className="space-y-1">
                      {(selectedProtection.tier_1.assets || []).map((asset, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className="text-gray-600">
                            {asset.type}{asset.description ? `: ${asset.description}` : ''}
                          </span>
                          <span className="font-medium">{formatCurrency(asset.estimated_value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selectedProtection.tier_1.coverage > 0 && (
                  <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500" style={{ width: `${100 - selectedProtection.tier_1.percentage_used}%` }} />
                  </div>
                )}
              </div>

              {/* Tier 2 */}
              <div className={`card border-l-4 ${selectedProtection.tier_2_enrolled ? 'border-l-purple-500' : 'border-l-gray-300'}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <CreditCard className="h-6 w-6 text-purple-600" />
                    </div>
                    <div>
                      <h4 className="font-medium">Tier 2: Personal Protection</h4>
                      <p className="text-sm text-gray-500">Monthly fee protects personal assets</p>
                    </div>
                  </div>
                  {selectedProtection.is_preview ? (
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                      Available after funding
                    </span>
                  ) : !selectedProtection.tier_2_enrolled ? (
                    <button onClick={() => { setEnrollFee(100); setShowEnrollModal(true); }} className="btn btn-primary text-sm">
                      Enroll Now
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">ENROLLED</span>
                      <button onClick={() => { setPaymentAmount(selectedProtection.tier_2_monthly_fee); setShowPaymentModal(true); }} className="btn btn-secondary text-sm">
                        Make Payment
                      </button>
                    </div>
                  )}
                </div>
                {selectedProtection.tier_2_enrolled ? (
                  <div className="mt-4 grid grid-cols-3 gap-4">
                    <div><p className="text-sm text-gray-500">Coverage</p><p className="font-semibold">{formatCurrency(selectedProtection.tier_2.coverage)}</p></div>
                    <div><p className="text-sm text-gray-500">Used</p><p className="font-semibold text-orange-600">{formatCurrency(selectedProtection.tier_2.used)}</p></div>
                    <div><p className="text-sm text-gray-500">Monthly Fee</p><p className="font-semibold">{formatCurrency(selectedProtection.tier_2_monthly_fee)}</p></div>
                  </div>
                ) : (
                  <div className="mt-4 bg-purple-50 rounded-lg p-3">
                    <p className="text-sm text-purple-700">
                      <Info className="h-4 w-4 inline mr-1" />
                      {selectedProtection.is_preview 
                        ? 'You can enroll in personal protection once your loan is funded.'
                        : 'Protect your personal assets by paying a monthly fee. Each $1 paid provides $2 of protection.'}
                    </p>
                  </div>
                )}
              </div>

              {/* Tier 3 */}
              <div className={`card border-l-4 ${selectedProtection.tier_3.is_active ? 'border-l-red-500' : 'border-l-gray-300'}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-100 rounded-lg">
                      <Home className="h-6 w-6 text-red-600" />
                    </div>
                    <div>
                      <h4 className="font-medium">Tier 3: Personal Assets at Risk</h4>
                      <p className="text-sm text-gray-500">Last resort if other tiers exhausted</p>
                    </div>
                  </div>
                  {selectedProtection.tier_3.is_active && (
                    <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">AT RISK</span>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-4">
                  <div><p className="text-sm text-gray-500">Personal Assets</p><p className="font-semibold">{formatCurrency(selectedProtection.tier_3.coverage)}</p></div>
                  <div><p className="text-sm text-gray-500">Seized</p><p className="font-semibold text-red-600">{formatCurrency(selectedProtection.tier_3.used)}</p></div>
                  <div><p className="text-sm text-gray-500">Protected</p><p className="font-semibold text-green-600">{formatCurrency(selectedProtection.tier_3.remaining)}</p></div>
                </div>
                {selectedProtection.tier_3.assets && selectedProtection.tier_3.assets.length > 0 && (
                  <div className="mt-4 bg-red-50 rounded-lg p-3">
                    <p className="text-sm font-medium text-gray-700 mb-2">Personal Assets at Risk:</p>
                    <div className="space-y-1">
                      {(selectedProtection.tier_3.assets || []).map((asset, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className="text-gray-600">
                            {asset.type}{asset.description ? `: ${asset.description}` : ''}
                          </span>
                          <span className="font-medium">{formatCurrency(asset.estimated_value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selectedProtection.tier_3.coverage === 0 && (
                  <div className="mt-4 bg-gray-50 rounded-lg p-3">
                    <p className="text-sm text-gray-600">
                      <Info className="h-4 w-4 inline mr-1" />
                      No personal assets on file. Add personal assets to your deal to see your Tier 3 exposure.
                    </p>
                  </div>
                )}
              </div>

              {/* Events */}
              {!selectedProtection.is_preview && (
                <div className="card">
                  <div className="flex items-center gap-2 mb-4">
                    <History className="h-5 w-5 text-gray-500" />
                    <h3 className="font-semibold">Event History</h3>
                  </div>
                  {loadingEvents ? (
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400 mx-auto" />
                  ) : events.length === 0 ? (
                    <p className="text-gray-500 text-sm">No events recorded yet.</p>
                  ) : (
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {(events || []).map((event) => (
                        <div key={event.id} className="flex items-start gap-3 text-sm">
                          <div className="w-2 h-2 mt-2 rounded-full bg-gray-400" />
                          <div>
                            <p className="font-medium">{event.event_type.replace(/_/g, ' ')}</p>
                            {event.description && <p className="text-gray-500">{event.description}</p>}
                            <p className="text-xs text-gray-400">{formatDate(event.created_at)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Enroll Modal */}
      {showEnrollModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-semibold mb-4">Enroll in Tier 2 Protection</h2>
            <div className="bg-purple-50 rounded-lg p-4 mb-4">
              <p className="text-sm text-purple-700">
                Protect your personal assets by paying a monthly fee. 
                Each dollar provides <strong>$2 of protection</strong>.
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label">Monthly Fee</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                  <input type="number" value={enrollFee} onChange={(e) => setEnrollFee(parseFloat(e.target.value) || 0)} className="input pl-8" min={50} />
                </div>
                <p className="text-xs text-gray-500 mt-1">Minimum $50/month</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex justify-between text-sm"><span>Monthly Payment:</span><span className="font-semibold">{formatCurrency(enrollFee)}</span></div>
                <div className="flex justify-between text-sm mt-1"><span>Coverage per Payment:</span><span className="font-semibold text-green-600">{formatCurrency(enrollFee * 2)}</span></div>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowEnrollModal(false)} className="btn btn-secondary">Cancel</button>
                <button onClick={handleEnrollTier2} disabled={enrolling || enrollFee < 50} className="btn btn-primary">
                  {enrolling ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enroll Now'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-semibold mb-4">Make Tier 2 Payment</h2>
            <div className="space-y-4">
              <div>
                <label className="label">Payment Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                  <input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)} className="input pl-8" min={1} />
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex justify-between text-sm"><span>Payment:</span><span className="font-semibold">{formatCurrency(paymentAmount)}</span></div>
                <div className="flex justify-between text-sm mt-1"><span>Protection Added:</span><span className="font-semibold text-green-600">{formatCurrency(paymentAmount * 2)}</span></div>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowPaymentModal(false)} className="btn btn-secondary">Cancel</button>
                <button onClick={handleTier2Payment} disabled={paying || paymentAmount <= 0} className="btn btn-primary">
                  {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Pay Now'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}