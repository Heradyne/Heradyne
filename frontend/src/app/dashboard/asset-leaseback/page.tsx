'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Package, Plus, Loader, RefreshCw, CheckCircle, AlertTriangle, X, ChevronDown, ChevronUp, FileText, ExternalLink, DollarSign, Tag } from 'lucide-react';
import { api } from '@/lib/api';
import { LegalAckGate, AIDisclaimer } from '@/components/ai-disclaimer';
import { formatCurrency } from '@/lib/utils';

const ASSET_TYPES = [
  { value: 'real_estate', label: '🏠 Real Estate' },
  { value: 'equipment', label: '⚙️ Equipment / Machinery' },
  { value: 'vehicle', label: '🚗 Vehicle / Fleet' },
  { value: 'inventory', label: '📦 Inventory' },
  { value: 'ip', label: '💡 Intellectual Property' },
  { value: 'other', label: '📋 Other' },
];

const STATUS_STYLE: Record<string, { label: string; style: string }> = {
  pending:           { label: 'Pending Evaluation', style: 'bg-gray-100 text-gray-600 border-gray-200' },
  evaluated:         { label: 'Evaluated ✓', style: 'bg-blue-50 text-blue-700 border-blue-200' },
  proposal_sent:     { label: 'Proposal Received', style: 'bg-yellow-50 text-yellow-800 border-yellow-300' },
  under_negotiation: { label: 'Under Negotiation', style: 'bg-orange-50 text-orange-800 border-orange-300' },
  contracted:        { label: 'Contracted ✓', style: 'bg-green-50 text-green-800 border-green-300' },
  rejected:          { label: 'Declined', style: 'bg-red-50 text-red-700 border-red-200' },
};

const CONTRACT_STATUS: Record<string, string> = {
  pending_signature: 'bg-yellow-50 border-yellow-300 text-yellow-800',
  owner_signed:      'bg-blue-50 border-blue-300 text-blue-800',
  investor_signed:   'bg-purple-50 border-purple-300 text-purple-800',
  fully_executed:    'bg-green-50 border-green-300 text-green-800',
};

export default function AssetLeasebackPage() {
  const [assets, setAssets] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [evaluating, setEvaluating] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [expandedContract, setExpandedContract] = useState<number | null>(null);
  const [respondingTo, setRespondingTo] = useState<number | null>(null);
  const [responseNotes, setResponseNotes] = useState('');
  const [signingContract, setSigningContract] = useState<number | null>(null);
  const [ackContractId, setAckContractId] = useState<number | null>(null);
  const [form, setForm] = useState({
    title: '', description: '', asset_type: 'equipment', location: '',
    external_link: '', owner_estimated_value: '', additional_details: '',
  });
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'assets' | 'proposals' | 'contracts'>('assets');

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [a, p, c] = await Promise.all([
        api.getMyAssetListings().catch(() => ({ assets: [] })),
        api.getMyLeasebackProposals().catch(() => ({ proposals: [] })),
        api.getMyLeasebackContracts().catch(() => ({ contracts: [] })),
      ]);
      setAssets(a.assets || []);
      setProposals(p.proposals || []);
      setContracts(c.contracts || []);
    } catch { setError('Failed to load data'); }
    finally { setLoading(false); }
  };

  const submitAsset = async () => {
    if (!form.title || !form.description) { setError('Title and description required'); return; }
    setSaving(true);
    try {
      await api.createAssetListing({
        ...form,
        owner_estimated_value: form.owner_estimated_value ? parseFloat(form.owner_estimated_value) : null,
        additional_details: form.additional_details ? { notes: form.additional_details } : null,
      });
      setShowForm(false);
      setForm({ title: '', description: '', asset_type: 'equipment', location: '', external_link: '', owner_estimated_value: '', additional_details: '' });
      await loadAll();
    } catch (e: any) { setError(e.response?.data?.detail || 'Failed to submit asset'); }
    finally { setSaving(false); }
  };

  const evaluate = async (assetId: number) => {
    setEvaluating(assetId);
    setError('');
    try {
      await api.evaluateAsset(assetId);
      await loadAll();
    } catch (e: any) { setError(e.response?.data?.detail || 'Evaluation failed'); }
    finally { setEvaluating(null); }
  };

  const respond = async (proposalId: number, accept: boolean) => {
    setRespondingTo(proposalId);
    try {
      if (accept) await api.acceptLeasebackProposal(proposalId, responseNotes);
      else await api.declineLeasebackProposal(proposalId, responseNotes);
      setResponseNotes('');
      setRespondingTo(null);
      await loadAll();
      if (accept) setActiveTab('contracts');
    } catch (e: any) { setError(e.response?.data?.detail || 'Failed to respond'); }
    finally { setRespondingTo(null); }
  };

  const signContract = async (contractId: number) => {
    setSigningContract(contractId);
    try {
      await api.signLeasebackContract(contractId);
      await loadAll();
    } catch (e: any) { setError(e.response?.data?.detail || 'Failed to sign contract'); }
    finally { setSigningContract(null); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="h-8 w-8 animate-spin" /></div>;

  const pendingProposals = (proposals || []).filter(p => p.status === 'proposed');
  const pendingContracts = (contracts || []).filter(c => c.status === 'pending_signature');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="h-7 w-7 text-blue-600" /> Asset Marketplace
          </h1>
          <p className="text-gray-600">List assets for investor evaluation and leaseback financing</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn btn-primary inline-flex items-center gap-2">
          <Plus className="h-4 w-4" /> List an Asset
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex justify-between">{error}<button onClick={() => setError('')}><X className="h-4 w-4" /></button></div>}

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <button onClick={() => setActiveTab('assets')} className={`card text-center transition-all ${activeTab === 'assets' ? 'ring-2 ring-blue-500' : ''}`}>
          <p className="text-2xl font-bold text-gray-900">{assets.length}</p>
          <p className="text-sm text-gray-500">My Assets</p>
        </button>
        <button onClick={() => setActiveTab('proposals')} className={`card text-center transition-all ${activeTab === 'proposals' ? 'ring-2 ring-blue-500' : ''} ${pendingProposals.length > 0 ? 'border-yellow-300 bg-yellow-50' : ''}`}>
          <p className={`text-2xl font-bold ${pendingProposals.length > 0 ? 'text-yellow-700' : 'text-gray-900'}`}>{pendingProposals.length}</p>
          <p className="text-sm text-gray-500">Pending Proposals</p>
        </button>
        <button onClick={() => setActiveTab('contracts')} className={`card text-center transition-all ${activeTab === 'contracts' ? 'ring-2 ring-blue-500' : ''} ${pendingContracts.length > 0 ? 'border-blue-300 bg-blue-50' : ''}`}>
          <p className={`text-2xl font-bold ${pendingContracts.length > 0 ? 'text-blue-700' : 'text-gray-900'}`}>{pendingContracts.length}</p>
          <p className="text-sm text-gray-500">Awaiting Signature</p>
        </button>
      </div>

      {/* Submit form */}
      {showForm && (
        <div className="card border-blue-200 bg-blue-50 mb-6">
          <h3 className="font-semibold text-gray-800 mb-4">List a New Asset</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Asset Title *</label>
              <input value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                className="input w-full" placeholder="e.g. 2019 Caterpillar 320 Excavator" />
            </div>
            <div>
              <label className="label">Asset Type</label>
              <select value={form.asset_type} onChange={e => setForm({...form, asset_type: e.target.value})} className="input">
                {ASSET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Your Estimated Value ($)</label>
              <input type="number" value={form.owner_estimated_value} onChange={e => setForm({...form, owner_estimated_value: e.target.value})}
                className="input" placeholder="What do you think it's worth?" />
            </div>
            <div>
              <label className="label">Location</label>
              <input value={form.location} onChange={e => setForm({...form, location: e.target.value})}
                className="input" placeholder="City, State" />
            </div>
            <div>
              <label className="label">Link to Listing / Appraisal</label>
              <input value={form.external_link} onChange={e => setForm({...form, external_link: e.target.value})}
                className="input" placeholder="https://..." />
            </div>
            <div className="col-span-2">
              <label className="label">Description * <span className="text-gray-400 font-normal">(condition, age, usage, why you need to keep using it)</span></label>
              <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                className="input w-full min-h-24 resize-y"
                placeholder="Describe the asset in detail. Include condition, year, hours/mileage, how it's used in your business, and why a leaseback would work for you." />
            </div>
            <div className="col-span-2">
              <label className="label">Additional Notes (optional)</label>
              <textarea value={form.additional_details} onChange={e => setForm({...form, additional_details: e.target.value})}
                className="input w-full min-h-16 resize-y text-sm" placeholder="Maintenance history, attachments included, financing remaining, etc." />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={submitAsset} disabled={saving} className="btn btn-primary inline-flex items-center gap-2">
              {saving ? <Loader className="h-4 w-4 animate-spin" /> : null} Submit Asset
            </button>
            <button onClick={() => setShowForm(false)} className="btn btn-secondary">Cancel</button>
          </div>
          <p className="text-xs text-gray-500 mt-2">After submitting, click "Get AI Evaluation" to have Claude assess the asset value and generate an investor summary.</p>
        </div>
      )}

      {/* ── Assets tab ── */}
      {activeTab === 'assets' && (
        <div className="space-y-3">
          {assets.length === 0 ? (
            <div className="card text-center py-12 border-dashed">
              <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400 mb-3">No assets listed yet</p>
              <p className="text-sm text-gray-400">List equipment, real estate, vehicles, or other assets to unlock leaseback financing from investors.</p>
            </div>
          ) : (assets || []).map(asset => {
            const isExp = expanded === asset.id;
            const ev = asset.ai_evaluation;
            const statusInfo = STATUS_STYLE[asset.status] || STATUS_STYLE.pending;
            return (
              <div key={asset.id} className="card">
                <button className="w-full flex items-start justify-between text-left" onClick={() => setExpanded(isExp ? null : asset.id)}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusInfo.style}`}>{statusInfo.label}</span>
                      <span className="text-xs text-gray-400 capitalize">{asset.asset_type.replace('_', ' ')}</span>
                    </div>
                    <p className="font-semibold text-gray-900">{asset.title}</p>
                    {asset.location && <p className="text-xs text-gray-400 mt-0.5">📍 {asset.location}</p>}
                    {ev?.valuation?.estimated_value_mid && (
                      <p className="text-sm text-blue-700 font-medium mt-1">
                        AI estimate: {formatCurrency(ev.valuation.estimated_value_low)} – {formatCurrency(ev.valuation.estimated_value_high)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {asset.owner_estimated_value && <span className="text-sm text-gray-500">{formatCurrency(asset.owner_estimated_value)}</span>}
                    {isExp ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                  </div>
                </button>

                {isExp && (
                  <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
                    <p className="text-sm text-gray-600">{asset.description}</p>
                    {asset.external_link && (
                      <a href={asset.external_link} target="_blank" rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1">
                        <ExternalLink className="h-4 w-4" /> View External Listing
                      </a>
                    )}

                    {/* AI evaluation */}
                    {ev ? (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                        <p className="text-xs font-bold text-blue-700 uppercase">AI Evaluation</p>

                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div><p className="text-xs text-gray-500">Conservative</p><p className="font-bold text-gray-700">{formatCurrency(ev.valuation?.estimated_value_low || 0)}</p></div>
                          <div className="bg-white rounded-xl p-2"><p className="text-xs text-gray-500">Fair Value</p><p className="text-xl font-bold text-blue-700">{formatCurrency(ev.valuation?.estimated_value_mid || 0)}</p></div>
                          <div><p className="text-xs text-gray-500">Optimistic</p><p className="font-bold text-gray-700">{formatCurrency(ev.valuation?.estimated_value_high || 0)}</p></div>
                        </div>

                        <p className="text-xs text-gray-600">{ev.valuation?.reasoning}</p>

                        {ev.investor_summary && (
                          <div className="bg-white rounded-lg p-3">
                            <p className="text-xs font-semibold text-gray-700 mb-1">Investor Summary</p>
                            <p className="text-sm text-gray-800 font-medium">{ev.investor_summary.headline}</p>
                            <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                              <div><p className="text-gray-400">Suggested Purchase</p><p className="font-bold">{formatCurrency(ev.investor_summary.suggested_purchase_price || 0)}</p></div>
                              <div><p className="text-gray-400">Monthly Lease</p><p className="font-bold">{formatCurrency(ev.investor_summary.suggested_monthly_lease || 0)}</p></div>
                              <div><p className="text-gray-400">Annual Yield</p><p className="font-bold text-green-700">{ev.investor_summary.annual_yield_pct?.toFixed(1) || 0}%</p></div>
                            </div>
                          </div>
                        )}

                        {ev.leaseback_viability && (
                          <div className={`rounded-lg p-2 text-xs ${ev.leaseback_viability.viable ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                            {ev.leaseback_viability.viable ? '✓ Leaseback viable' : '⚠ Leaseback may be challenging'}
                            {' — '}{ev.leaseback_viability.affordability_assessment}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <button onClick={() => evaluate(asset.id)} disabled={evaluating === asset.id}
                          className="btn btn-primary inline-flex items-center gap-2">
                          {evaluating === asset.id
                            ? <><Loader className="h-4 w-4 animate-spin" />Evaluating...</>
                            : '🔍 Get AI Evaluation'}
                        </button>
                        <p className="text-xs text-gray-400 mt-2">Claude will assess fair market value and generate an investor summary</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Proposals tab ── */}
      {activeTab === 'proposals' && (
        <div className="space-y-4">
          {proposals.length === 0 ? (
            <div className="card text-center py-12">
              <Tag className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">No proposals received yet. Once an investor reviews your asset, proposals will appear here.</p>
            </div>
          ) : (proposals || []).map(proposal => (
            <div key={proposal.id} className={`card border-2 ${proposal.status === 'proposed' ? 'border-yellow-300' : proposal.status === 'accepted' ? 'border-green-300' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-xs text-gray-500 mb-1">{proposal.asset_title}</p>
                  <p className="text-xl font-bold text-gray-900">{formatCurrency(proposal.purchase_price)}</p>
                  <p className="text-sm text-gray-600">Investor will purchase your asset and lease it back to you</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${
                  proposal.status === 'proposed' ? 'bg-yellow-100 text-yellow-800' :
                  proposal.status === 'accepted' ? 'bg-green-100 text-green-800' :
                  'bg-gray-100 text-gray-600'
                }`}>{proposal.status}</span>
              </div>

              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  { label: 'Monthly Lease', val: formatCurrency(proposal.monthly_lease_payment) },
                  { label: 'Lease Term', val: `${proposal.lease_term_months} months` },
                  { label: 'Total Payments', val: formatCurrency(proposal.total_lease_value) },
                  { label: 'Investor Yield', val: `${proposal.annual_yield_pct?.toFixed(1) || 0}%/yr` },
                ].map(s => (
                  <div key={s.label} className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-400 mb-1">{s.label}</p>
                    <p className="font-bold text-gray-800">{s.val}</p>
                  </div>
                ))}
              </div>

              {proposal.buyback_option && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 mb-3 text-sm text-blue-800">
                  🔄 Buyback option: repurchase for {formatCurrency(proposal.buyback_price || 0)} within {proposal.buyback_period_months} months
                </div>
              )}

              {proposal.rationale && (
                <p className="text-sm text-gray-600 mb-3 italic">"{proposal.rationale}"</p>
              )}

              {proposal.status === 'proposed' && (
                <div className="space-y-3 pt-3 border-t border-gray-100">
                  <textarea value={responseNotes} onChange={e => setResponseNotes(e.target.value)}
                    className="input w-full min-h-16 text-sm" placeholder="Add a note (optional) — questions, conditions, or comments..." />
                  <div className="flex gap-3">
                    <button onClick={() => respond(proposal.id, true)} disabled={respondingTo === proposal.id}
                      className="flex-1 btn bg-green-600 text-white hover:bg-green-700 border-green-600 inline-flex items-center justify-center gap-2">
                      {respondingTo === proposal.id ? <Loader className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                      Accept Proposal
                    </button>
                    <button onClick={() => respond(proposal.id, false)} disabled={respondingTo === proposal.id}
                      className="flex-1 btn bg-red-50 text-red-600 border-red-200 hover:bg-red-100">
                      Decline
                    </button>
                  </div>
                  <p className="text-xs text-gray-400">Accepting will trigger contract generation. You'll review and sign before anything is finalized.</p>
                </div>
              )}

              {proposal.status === 'accepted' && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  Accepted — check the Contracts tab to review and sign your agreement
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Contracts tab ── */}
      {activeTab === 'contracts' && (
        <div className="space-y-4">
          {contracts.length === 0 ? (
            <div className="card text-center py-12">
              <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">No contracts yet. Accept a proposal to receive your contract.</p>
            </div>
          ) : contracts.map(contract => {
            const isExp = expandedContract === contract.id;
            const sections = contract.contract_content?.sections || [];
            return (
              <div key={contract.id} className={`card border-2 ${CONTRACT_STATUS[contract.status] || 'border-gray-200'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Sale-Leaseback Agreement</p>
                    <p className="font-semibold text-gray-900">{contract.asset_title}</p>
                    {contract.purchase_price && <p className="text-sm text-gray-600 mt-0.5">Purchase: {formatCurrency(contract.purchase_price)} · Monthly lease: {formatCurrency(contract.monthly_lease)}</p>}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${CONTRACT_STATUS[contract.status] || 'bg-gray-100 text-gray-600'}`}>
                    {contract.status.replace(/_/g, ' ')}
                  </span>
                </div>

                {/* Signature status */}
                <div className="flex gap-3 mb-3">
                  <div className={`flex-1 rounded-lg p-2 text-center text-xs font-medium ${contract.owner_signed_at ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
                    {contract.owner_signed_at ? '✓ You signed' : '○ Your signature needed'}
                  </div>
                  <div className={`flex-1 rounded-lg p-2 text-center text-xs font-medium ${contract.investor_signed_at ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
                    {contract.investor_signed_at ? '✓ Investor signed' : '○ Awaiting investor'}
                  </div>
                </div>

                {/* Key terms */}
                {contract.contract_content?.key_terms_summary && (
                  <div className="bg-gray-50 rounded-xl p-3 mb-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Key Terms</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {Object.entries(contract.contract_content.key_terms_summary).map(([k, v]) => (
                        <div key={k}><p className="text-gray-400 capitalize">{k.replace(/_/g, ' ')}</p><p className="font-medium text-gray-800">{String(v)}</p></div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Attorney review warnings */}
                {contract.contract_content?.attorney_review_notes?.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3">
                    <p className="text-xs font-bold text-yellow-800 mb-1">⚠ Review with an attorney before signing</p>
                    {(contract.contract_content?.attorney_review_notes || []).map((note: string, i: number) => (
                      <p key={i} className="text-xs text-yellow-700">• {note}</p>
                    ))}
                  </div>
                )}

                {/* Read contract */}
                <div className="mb-3">
                  <button onClick={() => setExpandedContract(isExp ? null : contract.id)}
                    className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                    <FileText className="h-4 w-4" />{isExp ? 'Hide contract' : 'Read full contract'}
                    {isExp ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {isExp && sections.length > 0 && (
                    <div className="mt-3 border border-gray-200 rounded-xl overflow-hidden">
                      {sections.map((section: any, i: number) => (
                        <div key={i} className={`px-4 py-3 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${section.requires_attorney_review ? 'border-l-4 border-yellow-400' : ''}`}>
                          <p className="text-xs font-bold text-gray-500 uppercase mb-1">{section.section_number} {section.title}</p>
                          <p className="text-sm text-gray-700 leading-relaxed">{section.content}</p>
                          {section.requires_attorney_review && <p className="text-xs text-yellow-700 mt-1">⚠ Attorney review recommended</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Sign button — requires legal acknowledgment */}
                {!contract.owner_signed_at && contract.status !== 'fully_executed' && (
                  ackContractId === contract.id ? (
                    <LegalAckGate
                      onConfirm={() => { signContract(contract.id); setAckContractId(null); }}
                      disabled={signingContract === contract.id}
                      actionLabel={signingContract === contract.id ? 'Signing...' : 'Sign Contract'}
                    />
                  ) : (
                    <button onClick={() => setAckContractId(contract.id)}
                      className="btn bg-blue-600 text-white hover:bg-blue-700 border-blue-600 w-full inline-flex items-center justify-center gap-2">
                      <FileText className="h-4 w-4" /> Review & Sign Contract
                    </button>
                  )
                )}

                {contract.status === 'fully_executed' && (
                  <div className="bg-green-50 border border-green-300 rounded-xl p-3 text-center">
                    <p className="text-green-800 font-semibold">🎉 Contract Fully Executed</p>
                    <p className="text-sm text-green-700 mt-1">Effective {contract.effective_date}. Both parties have signed.</p>
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
