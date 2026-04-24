'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Building2, Package, Loader, RefreshCw, CheckCircle, AlertTriangle, X, ChevronDown, ChevronUp, DollarSign, FileText, ExternalLink, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

const STATUS_STYLE: Record<string, string> = {
  pending:           'bg-gray-100 text-gray-600',
  evaluated:         'bg-blue-100 text-blue-800',
  proposal_sent:     'bg-yellow-100 text-yellow-800',
  under_negotiation: 'bg-orange-100 text-orange-800',
  contracted:        'bg-green-100 text-green-800',
};

const RISK_STYLE: Record<string, string> = {
  low:    'text-green-700 bg-green-50',
  medium: 'text-yellow-700 bg-yellow-50',
  high:   'text-red-700 bg-red-50',
};

export default function AdminLeasebackPage() {
  const [assets, setAssets] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'marketplace' | 'contracts'>('marketplace');
  const [showProposalForm, setShowProposalForm] = useState(false);
  const [proposalForm, setProposalForm] = useState({
    purchase_price: '', monthly_lease_payment: '', lease_term_months: '60',
    lease_type: 'operating', buyback_option: false, buyback_price: '',
    buyback_period_months: '24', rationale: '',
  });
  const [submittingProposal, setSubmittingProposal] = useState(false);
  const [generatingContract, setGeneratingContract] = useState<number | null>(null);
  const [signingContract, setSigningContract] = useState<number | null>(null);
  const [expandedContract, setExpandedContract] = useState<number | null>(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [a, c] = await Promise.all([
        api.getAllAssetListings().catch(() => ({ assets: [] })),
        api.getAllLeasebackContracts().catch(() => ({ contracts: [] })),
      ]);
      setAssets(a.assets || []);
      setContracts(c.contracts || []);
    } catch { setError('Failed to load data'); }
    finally { setLoading(false); }
  };

  const submitProposal = async () => {
    if (!selectedAsset || !proposalForm.purchase_price || !proposalForm.monthly_lease_payment) return;
    setSubmittingProposal(true);
    try {
      await api.proposeLeaseBack(selectedAsset.id, {
        purchase_price: parseFloat(proposalForm.purchase_price),
        monthly_lease_payment: parseFloat(proposalForm.monthly_lease_payment),
        lease_term_months: parseInt(proposalForm.lease_term_months),
        lease_type: proposalForm.lease_type,
        buyback_option: proposalForm.buyback_option,
        buyback_price: proposalForm.buyback_option && proposalForm.buyback_price ? parseFloat(proposalForm.buyback_price) : null,
        buyback_period_months: proposalForm.buyback_option && proposalForm.buyback_period_months ? parseInt(proposalForm.buyback_period_months) : null,
        rationale: proposalForm.rationale || null,
      });
      setShowProposalForm(false);
      setSelectedAsset(null);
      await loadAll();
    } catch (e: any) { setError(e.response?.data?.detail || 'Failed to submit proposal'); }
    finally { setSubmittingProposal(false); }
  };

  const generateContract = async (proposalId: number) => {
    setGeneratingContract(proposalId);
    setError('');
    try {
      await api.generateLeasebackContract(proposalId);
      await loadAll();
    } catch (e: any) { setError(e.response?.data?.detail || 'Failed to generate contract'); }
    finally { setGeneratingContract(null); }
  };

  const signContract = async (contractId: number) => {
    setSigningContract(contractId);
    try {
      await api.adminSignContract(contractId);
      await loadAll();
    } catch { setError('Failed to sign'); }
    finally { setSigningContract(null); }
  };

  // Suggested lease payment based on AI eval
  const suggestTerms = (asset: any) => {
    const ev = asset.ai_evaluation?.investor_summary;
    if (!ev) return;
    setProposalForm(prev => ({
      ...prev,
      purchase_price: String(Math.round(ev.suggested_purchase_price || 0)),
      monthly_lease_payment: String(Math.round(ev.suggested_monthly_lease || 0)),
      lease_term_months: String(ev.suggested_lease_term_months || 60),
    }));
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="h-8 w-8 animate-spin" /></div>;

  const evaluatedAssets = (assets || []).filter(a => a.status === 'evaluated' || a.ai_evaluation);
  const pendingContracts = (contracts || []).filter(c => !c.investor_signed);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="h-7 w-7 text-blue-600" /> Asset Marketplace
          </h1>
          <p className="text-gray-600">Review owner asset listings, propose leasebacks, and manage contracts</p>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex justify-between">{error}<button onClick={() => setError('')}><X className="h-4 w-4" /></button></div>}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Listings', val: assets.length },
          { label: 'Evaluated', val: evaluatedAssets.length },
          { label: 'Pending Contracts', val: pendingContracts.length, alert: pendingContracts.length > 0 },
          { label: 'Active Deals', val: (contracts || []).filter(c => c.status === 'fully_executed').length },
        ].map(s => (
          <div key={s.label} className={`card text-center ${s.alert ? 'border-yellow-300 bg-yellow-50' : ''}`}>
            <p className={`text-2xl font-bold ${s.alert ? 'text-yellow-700' : 'text-gray-900'}`}>{s.val}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'marketplace', label: 'Asset Listings' },
            { id: 'contracts', label: `Contracts${pendingContracts.length > 0 ? ` (${pendingContracts.length} pending)` : ''}` },
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id as any)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === t.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Marketplace ── */}
      {activeTab === 'marketplace' && (
        <div className="grid grid-cols-3 gap-6">
          {/* Asset list */}
          <div className="col-span-1 space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-3">All Listings ({assets.length})</p>
            {assets.length === 0 ? (
              <p className="text-sm text-gray-400">No assets submitted yet</p>
            ) : (assets || []).map(asset => (
              <button key={asset.id} onClick={() => { setSelectedAsset(asset); setShowProposalForm(false); }}
                className={`w-full text-left p-3 rounded-xl border text-sm transition-all ${
                  selectedAsset?.id === asset.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{asset.title}</p>
                    <p className="text-xs text-gray-400 capitalize mt-0.5">{asset.asset_type.replace('_', ' ')}</p>
                    <p className="text-xs text-gray-400">{asset.owner_name}</p>
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ml-2 shrink-0 ${STATUS_STYLE[asset.status] || STATUS_STYLE.pending}`}>
                    {asset.status.replace('_', ' ')}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Asset detail */}
          <div className="col-span-2">
            {!selectedAsset ? (
              <div className="card text-center py-16 border-dashed">
                <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400">Select an asset to review and propose a leaseback</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{selectedAsset.title}</h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {selectedAsset.owner_name} · {selectedAsset.owner_email} ·
                      <span className="capitalize ml-1">{selectedAsset.asset_type.replace('_', ' ')}</span>
                      {selectedAsset.location && ` · 📍${selectedAsset.location}`}
                    </p>
                  </div>
                  {selectedAsset.external_link && (
                    <a href={selectedAsset.external_link} target="_blank" rel="noopener noreferrer"
                      className="btn btn-secondary text-sm inline-flex items-center gap-1">
                      <ExternalLink className="h-4 w-4" /> View Listing
                    </a>
                  )}
                </div>

                <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3">{selectedAsset.description}</p>

                {/* AI evaluation */}
                {selectedAsset.ai_evaluation ? (
                  <div className="space-y-3">
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                      <p className="text-xs font-bold text-blue-700 uppercase mb-3">AI Valuation</p>
                      <div className="grid grid-cols-3 gap-3 text-center mb-3">
                        <div><p className="text-xs text-gray-500">Low</p><p className="font-bold">{formatCurrency(selectedAsset.ai_evaluation.valuation?.estimated_value_low || 0)}</p></div>
                        <div className="bg-white rounded-xl p-2"><p className="text-xs text-gray-500">Fair Value</p><p className="text-xl font-bold text-blue-700">{formatCurrency(selectedAsset.ai_evaluation.valuation?.estimated_value_mid || 0)}</p></div>
                        <div><p className="text-xs text-gray-500">High</p><p className="font-bold">{formatCurrency(selectedAsset.ai_evaluation.valuation?.estimated_value_high || 0)}</p></div>
                      </div>
                      <p className="text-xs text-gray-600 mb-2">{selectedAsset.ai_evaluation.valuation?.reasoning}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${selectedAsset.ai_evaluation.valuation?.confidence === 'high' ? 'bg-green-100 text-green-700' : selectedAsset.ai_evaluation.valuation?.confidence === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                        {selectedAsset.ai_evaluation.valuation?.confidence} confidence
                      </span>
                    </div>

                    {/* Investor summary */}
                    {selectedAsset.ai_evaluation.investor_summary && (
                      <div className="card">
                        <p className="text-xs font-bold text-gray-500 uppercase mb-2">AI Investment Analysis</p>
                        <p className="text-sm font-semibold text-gray-800 mb-2">{selectedAsset.ai_evaluation.investor_summary.headline}</p>
                        <div className="grid grid-cols-4 gap-2 text-xs mb-3">
                          {[
                            { label: 'Suggested Buy', val: formatCurrency(selectedAsset.ai_evaluation.investor_summary.suggested_purchase_price || 0) },
                            { label: 'Monthly Lease', val: formatCurrency(selectedAsset.ai_evaluation.investor_summary.suggested_monthly_lease || 0) },
                            { label: 'Annual Yield', val: `${selectedAsset.ai_evaluation.investor_summary.annual_yield_pct?.toFixed(1) || 0}%` },
                            { label: 'Payback', val: `${selectedAsset.ai_evaluation.investor_summary.payback_period_years?.toFixed(1) || 0} yrs` },
                          ].map(s => (
                            <div key={s.label} className="bg-gray-50 rounded-lg p-2 text-center">
                              <p className="text-gray-400">{s.label}</p>
                              <p className="font-bold text-gray-800">{s.val}</p>
                            </div>
                          ))}
                        </div>
                        {(selectedAsset.ai_evaluation?.investor_summary?.highlights || []).map((h: string, i: number) => (
                          <p key={i} className="text-xs text-gray-600 flex gap-1 mb-0.5"><TrendingUp className="h-3 w-3 text-green-500 shrink-0 mt-0.5" />{h}</p>
                        ))}
                      </div>
                    )}

                    {/* Leaseback viability */}
                    {selectedAsset.ai_evaluation.leaseback_viability && (
                      <div className={`rounded-xl p-3 border ${selectedAsset.ai_evaluation.leaseback_viability.viable ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                        <p className="text-sm font-semibold mb-1">
                          {selectedAsset.ai_evaluation.leaseback_viability.viable ? '✓ Leaseback viable' : '⚠ Review carefully'}
                        </p>
                        <p className="text-xs text-gray-600">{selectedAsset.ai_evaluation.leaseback_viability.affordability_assessment}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RISK_STYLE[selectedAsset.ai_evaluation.leaseback_viability.risk_to_investor] || ''}`}>
                            {selectedAsset.ai_evaluation.leaseback_viability.risk_to_investor} risk
                          </span>
                          <span className="text-xs text-gray-500">{selectedAsset.ai_evaluation.leaseback_viability.risk_notes}</span>
                        </div>
                      </div>
                    )}

                    {/* Due diligence */}
                    {selectedAsset.ai_evaluation.due_diligence_required?.length > 0 && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
                        <p className="text-xs font-bold text-yellow-800 uppercase mb-1">Due Diligence Required</p>
                        {(selectedAsset.ai_evaluation?.due_diligence_required || []).map((d: string, i: number) => (
                          <p key={i} className="text-xs text-yellow-700">• {d}</p>
                        ))}
                      </div>
                    )}

                    {/* Propose button */}
                    {selectedAsset.status === 'evaluated' && !showProposalForm && (
                      <div className="flex gap-3">
                        <button onClick={() => { setShowProposalForm(true); suggestTerms(selectedAsset); }}
                          className="btn btn-primary inline-flex items-center gap-2">
                          <DollarSign className="h-4 w-4" /> Propose Leaseback
                        </button>
                      </div>
                    )}

                    {/* Proposal form */}
                    {showProposalForm && (
                      <div className="card border-blue-200 bg-blue-50">
                        <h3 className="font-semibold text-gray-800 mb-3">Leaseback Proposal</h3>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="label">Purchase Price ($) *</label>
                            <input type="number" value={proposalForm.purchase_price}
                              onChange={e => setProposalForm({...proposalForm, purchase_price: e.target.value})}
                              className="input" />
                            {selectedAsset.ai_evaluation?.valuation?.estimated_value_mid && (
                              <p className="text-xs text-blue-600 mt-1">AI fair value: {formatCurrency(selectedAsset.ai_evaluation.valuation.estimated_value_mid)}</p>
                            )}
                          </div>
                          <div>
                            <label className="label">Monthly Lease ($) *</label>
                            <input type="number" value={proposalForm.monthly_lease_payment}
                              onChange={e => setProposalForm({...proposalForm, monthly_lease_payment: e.target.value})}
                              className="input" />
                            {proposalForm.purchase_price && proposalForm.monthly_lease_payment && (
                              <p className="text-xs text-green-600 mt-1">
                                Yield: {((parseFloat(proposalForm.monthly_lease_payment) * 12 / parseFloat(proposalForm.purchase_price)) * 100).toFixed(1)}%/yr
                              </p>
                            )}
                          </div>
                          <div>
                            <label className="label">Lease Term (months)</label>
                            <select value={proposalForm.lease_term_months} onChange={e => setProposalForm({...proposalForm, lease_term_months: e.target.value})} className="input">
                              {[12, 24, 36, 48, 60, 84, 120].map(m => <option key={m} value={m}>{m} months ({(m/12).toFixed(0)} yr{m > 12 ? 's' : ''})</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="label">Lease Type</label>
                            <select value={proposalForm.lease_type} onChange={e => setProposalForm({...proposalForm, lease_type: e.target.value})} className="input">
                              <option value="operating">Operating Lease</option>
                              <option value="finance">Finance Lease</option>
                            </select>
                          </div>
                          <div className="col-span-2">
                            <label className="flex items-center gap-2 cursor-pointer mb-2">
                              <input type="checkbox" checked={proposalForm.buyback_option}
                                onChange={e => setProposalForm({...proposalForm, buyback_option: e.target.checked})}
                                className="h-4 w-4 rounded text-blue-600" />
                              <span className="text-sm font-medium">Include buyback option</span>
                            </label>
                            {proposalForm.buyback_option && (
                              <div className="grid grid-cols-2 gap-3">
                                <div><label className="label">Buyback Price ($)</label><input type="number" value={proposalForm.buyback_price} onChange={e => setProposalForm({...proposalForm, buyback_price: e.target.value})} className="input" /></div>
                                <div><label className="label">Within (months)</label><input type="number" value={proposalForm.buyback_period_months} onChange={e => setProposalForm({...proposalForm, buyback_period_months: e.target.value})} className="input" /></div>
                              </div>
                            )}
                          </div>
                          <div className="col-span-2">
                            <label className="label">Message to Owner</label>
                            <textarea value={proposalForm.rationale} onChange={e => setProposalForm({...proposalForm, rationale: e.target.value})}
                              className="input w-full min-h-16 resize-y text-sm" placeholder="Explain your offer and any conditions..." />
                          </div>
                        </div>

                        {/* Deal summary */}
                        {proposalForm.purchase_price && proposalForm.monthly_lease_payment && (
                          <div className="mt-3 bg-white border border-gray-200 rounded-xl p-3 text-xs">
                            <p className="font-semibold text-gray-700 mb-2">Deal Summary</p>
                            <div className="grid grid-cols-3 gap-2">
                              <div><p className="text-gray-400">You Pay</p><p className="font-bold">{formatCurrency(parseFloat(proposalForm.purchase_price) || 0)}</p></div>
                              <div><p className="text-gray-400">Monthly Income</p><p className="font-bold text-green-700">{formatCurrency(parseFloat(proposalForm.monthly_lease_payment) || 0)}</p></div>
                              <div><p className="text-gray-400">Total over Term</p><p className="font-bold">{formatCurrency((parseFloat(proposalForm.monthly_lease_payment) || 0) * (parseInt(proposalForm.lease_term_months) || 0))}</p></div>
                            </div>
                          </div>
                        )}

                        <div className="flex gap-2 mt-3">
                          <button onClick={submitProposal} disabled={submittingProposal || !proposalForm.purchase_price || !proposalForm.monthly_lease_payment}
                            className="btn btn-primary inline-flex items-center gap-2">
                            {submittingProposal ? <Loader className="h-4 w-4 animate-spin" /> : null} Send Proposal to Owner
                          </button>
                          <button onClick={() => setShowProposalForm(false)} className="btn btn-secondary">Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="card text-center py-8 border-dashed">
                    <p className="text-gray-400">Asset hasn't been evaluated yet</p>
                    <p className="text-sm text-gray-400 mt-1">The owner needs to click "Get AI Evaluation" first</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Contracts ── */}
      {activeTab === 'contracts' && (
        <div className="space-y-4">
          {contracts.length === 0 ? (
            <div className="card text-center py-12">
              <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">No contracts yet. Accept proposals will generate contracts here.</p>
            </div>
          ) : (contracts || []).map(contract => {
            const isExp = expandedContract === contract.id;
            return (
              <div key={contract.id} className="card">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-900">{contract.asset_title}</p>
                    <p className="text-sm text-gray-500">Owner: {contract.owner_name} · {formatCurrency(contract.purchase_price || 0)} purchase · {formatCurrency(contract.monthly_lease || 0)}/mo lease</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${
                    contract.status === 'fully_executed' ? 'bg-green-100 text-green-800' :
                    contract.status === 'pending_signature' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>{contract.status.replace(/_/g, ' ')}</span>
                </div>

                <div className="flex gap-3 mb-3 text-xs">
                  <span className={`px-2 py-1 rounded-lg ${contract.owner_signed ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
                    {contract.owner_signed ? '✓ Owner signed' : '○ Owner pending'}
                  </span>
                  <span className={`px-2 py-1 rounded-lg ${contract.investor_signed ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                    {contract.investor_signed ? '✓ You signed' : '○ Your signature needed'}
                  </span>
                  {contract.effective_date && <span className="px-2 py-1 rounded-lg bg-blue-50 text-blue-700">Effective: {contract.effective_date}</span>}
                </div>

                {/* Generate contract if proposal accepted but no contract yet */}
                {contract.status === 'accepted' && !contract.contract_content && (
                  <button onClick={() => generateContract(contract.proposal_id || contract.id)} disabled={generatingContract === contract.id}
                    className="btn btn-primary text-sm inline-flex items-center gap-2 mb-3">
                    {generatingContract === contract.id ? <><Loader className="h-4 w-4 animate-spin" />Generating contract...</> : <><FileText className="h-4 w-4" />Generate Contract</>}
                  </button>
                )}

                {/* Admin sign button */}
                {!contract.investor_signed && contract.status !== 'fully_executed' && (
                  <button onClick={() => signContract(contract.id)} disabled={signingContract === contract.id}
                    className="btn bg-blue-600 text-white hover:bg-blue-700 border-blue-600 text-sm inline-flex items-center gap-2 mr-2">
                    {signingContract === contract.id ? <Loader className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                    Countersign Contract
                  </button>
                )}

                {contract.status === 'fully_executed' && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-sm text-green-800 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" /> Fully executed — active leaseback agreement
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
