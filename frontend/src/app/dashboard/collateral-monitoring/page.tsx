'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Building2, Loader, RefreshCw, AlertTriangle, CheckCircle, X, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'bg-red-50 border-red-300 text-red-800',
  high:     'bg-orange-50 border-orange-300 text-orange-800',
  medium:   'bg-yellow-50 border-yellow-200 text-yellow-800',
  low:      'bg-blue-50 border-blue-200 text-blue-700',
};

const ALERT_ICON: Record<string, string> = {
  ucc_expiring:      '📋',
  insurance_expiring: '🔒',
  appraisal_due:     '🏠',
  value_change:      '📊',
  missing_docs:      '📄',
};

export default function CollateralMonitoringPage() {
  const [monitoring, setMonitoring] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [expandedAsset, setExpandedAsset] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [monResult, assetsResult] = await Promise.all([
        api.getCollateralMonitoring().catch(() => null),
        api.getMyAssets().catch(() => ({ assets: [] })),
      ]);
      setMonitoring(monResult);
      setAssets(assetsResult.assets || assetsResult || []);
    } catch { setError('Failed to load collateral data'); }
    finally { setLoading(false); }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const result = await api.getCollateralMonitoring();
      setMonitoring(result);
    } catch { setError('Failed to refresh'); }
    finally { setRefreshing(false); }
  };

  const saveUCC = async (assetId: number) => {
    setSaving(assetId);
    try {
      await api.updateUCCInfo(assetId, editForm[`ucc_${assetId}`] || {});
      setSavedId(assetId);
      setTimeout(() => setSavedId(null), 2000);
      await loadAll();
    } catch { setError('Failed to save UCC info'); }
    finally { setSaving(null); }
  };

  const saveInsurance = async (assetId: number) => {
    setSaving(assetId);
    try {
      await api.updateInsuranceInfo(assetId, editForm[`ins_${assetId}`] || {});
      setSavedId(assetId);
      setTimeout(() => setSavedId(null), 2000);
      await loadAll();
    } catch { setError('Failed to save insurance info'); }
    finally { setSaving(null); }
  };

  const saveAppraisal = async (assetId: number) => {
    setSaving(assetId);
    try {
      await api.updateAppraisalInfo(assetId, editForm[`app_${assetId}`] || {});
      setSavedId(assetId);
      setTimeout(() => setSavedId(null), 2000);
      await loadAll();
    } catch { setError('Failed to save appraisal info'); }
    finally { setSaving(null); }
  };

  const setField = (key: string, field: string, value: string) => {
    setEditForm(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: value } }));
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="h-8 w-8 animate-spin" /></div>;

  const alerts = monitoring?.alerts || [];
  const critical = (alerts || []).filter((a: any) => a.severity === 'critical');
  const high = (alerts || []).filter((a: any) => a.severity === 'high');

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="h-7 w-7 text-blue-600" /> Collateral Monitoring
          </h1>
          <p className="text-gray-600">UCC filings, insurance, and appraisal tracking across your collateral portfolio</p>
        </div>
        <button onClick={refresh} disabled={refreshing} className="btn btn-secondary inline-flex items-center gap-2">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh Alerts
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex justify-between">
          {error}<button onClick={() => setError('')}><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Portfolio health summary */}
      {monitoring && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className={`card text-center border-2 ${
            monitoring.portfolio_health === 'healthy' ? 'border-green-300 bg-green-50' :
            monitoring.portfolio_health === 'critical' ? 'border-red-300 bg-red-50' :
            'border-yellow-300 bg-yellow-50'
          }`}>
            <p className={`text-2xl font-bold capitalize ${
              monitoring.portfolio_health === 'healthy' ? 'text-green-700' :
              monitoring.portfolio_health === 'critical' ? 'text-red-700' : 'text-yellow-700'
            }`}>{monitoring.portfolio_health?.replace('_', ' ')}</p>
            <p className="text-xs text-gray-500 mt-1">Portfolio Status</p>
          </div>
          <div className="card text-center">
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(monitoring.total_collateral_value || 0)}</p>
            <p className="text-xs text-gray-500 mt-1">Total Collateral Value</p>
          </div>
          <div className={`card text-center ${(monitoring.ucc_expiring_90_days || 0) > 0 ? 'bg-red-50 border-red-200' : ''}`}>
            <p className={`text-2xl font-bold ${(monitoring.ucc_expiring_90_days || 0) > 0 ? 'text-red-700' : 'text-gray-900'}`}>
              {monitoring.ucc_expiring_90_days || 0}
            </p>
            <p className="text-xs text-gray-500 mt-1">UCC Expiring (90d)</p>
          </div>
          <div className={`card text-center ${(monitoring.insurance_expiring_60_days || 0) > 0 ? 'bg-orange-50 border-orange-200' : ''}`}>
            <p className={`text-2xl font-bold ${(monitoring.insurance_expiring_60_days || 0) > 0 ? 'text-orange-700' : 'text-gray-900'}`}>
              {monitoring.insurance_expiring_60_days || 0}
            </p>
            <p className="text-xs text-gray-500 mt-1">Insurance Expiring (60d)</p>
          </div>
        </div>
      )}

      {/* Active alerts */}
      {alerts.length > 0 && (
        <div className="card mb-6">
          <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Active Alerts ({alerts.length})
            {critical.length > 0 && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">{critical.length} critical</span>}
          </h2>
          <div className="space-y-2">
            {(alerts || []).map((alert: any, i: number) => (
              <div key={i} className={`p-3 rounded-xl border ${SEVERITY_STYLE[alert.severity] || SEVERITY_STYLE.medium}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2">
                    <span className="text-lg">{ALERT_ICON[alert.alert_type] || '⚠'}</span>
                    <div>
                      <p className="text-sm font-semibold">{alert.asset_name}</p>
                      <p className="text-sm mt-0.5">{alert.message}</p>
                      <p className="text-xs mt-1 font-medium">→ {alert.action_required}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    {alert.due_date && <p className="text-xs font-bold">Due: {alert.due_date}</p>}
                    <span className={`text-xs uppercase font-bold`}>{alert.severity}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-asset detail and editing */}
      {assets.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-3">Asset Registry ({assets.length} assets)</h2>
          <div className="space-y-2">
            {(assets || []).map((asset: any) => {
              const isExp = expandedAsset === asset.id;
              return (
                <div key={asset.id} className="border border-gray-200 rounded-xl overflow-hidden">
                  <button onClick={() => setExpandedAsset(isExp ? null : asset.id)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{asset.category === 'real_estate' || asset.category === 'real_property' ? '🏠' : asset.category === 'equipment' ? '⚙️' : asset.category === 'vehicle' || asset.category === 'vehicles_fleet' ? '🚗' : '📦'}</span>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{asset.name}</p>
                        <p className="text-xs text-gray-400 capitalize">{asset.category?.replace(/_/g, ' ')} · {formatCurrency(asset.collateral_value || asset.estimated_value || 0)} collateral value</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {asset.ucc_expiration_date && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">UCC on file</span>}
                      {asset.insurance_expiration && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Insured</span>}
                      {isExp ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                    </div>
                  </button>

                  {isExp && (
                    <div className="border-t border-gray-100 px-4 py-4 bg-gray-50 grid grid-cols-3 gap-6">
                      {/* UCC */}
                      <div>
                        <p className="text-xs font-bold text-gray-600 uppercase mb-2">UCC Filing</p>
                        <div className="space-y-2">
                          {[
                            { label: 'Filing Number', field: 'ucc_filing_number', type: 'text', current: asset.ucc_filing_number },
                            { label: 'Filing Date', field: 'ucc_filing_date', type: 'date', current: asset.ucc_filing_date },
                            { label: 'Expiration Date', field: 'ucc_expiration_date', type: 'date', current: asset.ucc_expiration_date },
                            { label: 'Filing State', field: 'ucc_filing_state', type: 'text', current: asset.ucc_filing_state },
                          ].map(f => (
                            <div key={f.field}>
                              <label className="text-xs text-gray-500">{f.label}</label>
                              <input type={f.type} defaultValue={f.current || ''}
                                onChange={e => setField(`ucc_${asset.id}`, f.field, e.target.value)}
                                className="input text-sm w-full" placeholder={f.current || '—'} />
                            </div>
                          ))}
                          <button onClick={() => saveUCC(asset.id)} disabled={saving === asset.id}
                            className="btn btn-secondary text-xs w-full mt-1">
                            {saving === asset.id ? 'Saving...' : savedId === asset.id ? '✓ Saved' : 'Save UCC Info'}
                          </button>
                        </div>
                      </div>

                      {/* Insurance */}
                      <div>
                        <p className="text-xs font-bold text-gray-600 uppercase mb-2">Insurance</p>
                        <div className="space-y-2">
                          {[
                            { label: 'Carrier', field: 'insurance_carrier', type: 'text', current: asset.insurance_carrier },
                            { label: 'Policy Number', field: 'insurance_policy_number', type: 'text', current: asset.insurance_policy_number },
                            { label: 'Expiration Date', field: 'insurance_expiration', type: 'date', current: asset.insurance_expiration },
                            { label: 'Coverage Amount ($)', field: 'insurance_coverage_amount', type: 'number', current: asset.insurance_coverage_amount },
                          ].map(f => (
                            <div key={f.field}>
                              <label className="text-xs text-gray-500">{f.label}</label>
                              <input type={f.type} defaultValue={f.current || ''}
                                onChange={e => setField(`ins_${asset.id}`, f.field, e.target.value)}
                                className="input text-sm w-full" />
                            </div>
                          ))}
                          <button onClick={() => saveInsurance(asset.id)} disabled={saving === asset.id}
                            className="btn btn-secondary text-xs w-full mt-1">
                            {saving === asset.id ? 'Saving...' : 'Save Insurance Info'}
                          </button>
                        </div>
                      </div>

                      {/* Appraisal */}
                      <div>
                        <p className="text-xs font-bold text-gray-600 uppercase mb-2">Appraisal</p>
                        <div className="space-y-2">
                          {[
                            { label: 'Appraisal Date', field: 'appraisal_date', type: 'date', current: asset.appraisal_date },
                            { label: 'Appraised Value ($)', field: 'appraisal_value', type: 'number', current: asset.appraisal_value },
                            { label: 'Appraisal Firm', field: 'appraisal_firm', type: 'text', current: asset.appraisal_firm },
                            { label: 'Next Due Date', field: 'appraisal_next_due', type: 'date', current: asset.appraisal_next_due },
                          ].map(f => (
                            <div key={f.field}>
                              <label className="text-xs text-gray-500">{f.label}</label>
                              <input type={f.type} defaultValue={f.current || ''}
                                onChange={e => setField(`app_${asset.id}`, f.field, e.target.value)}
                                className="input text-sm w-full" />
                            </div>
                          ))}
                          <button onClick={() => saveAppraisal(asset.id)} disabled={saving === asset.id}
                            className="btn btn-secondary text-xs w-full mt-1">
                            {saving === asset.id ? 'Saving...' : 'Save Appraisal Info'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {assets.length === 0 && !loading && (
        <div className="card text-center py-12">
          <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">No collateral assets on file. Add assets in the Collateral & LTV section.</p>
        </div>
      )}
    </div>
  );
}