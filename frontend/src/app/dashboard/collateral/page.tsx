'use client';

import { useEffect, useState } from 'react';
import { 
  Package, Plus, Building2, Car, Wallet, Home, Briefcase, 
  RefreshCw, Loader2, Trash2, Edit, CheckCircle, Clock, AlertCircle,
  DollarSign, ChevronDown, ChevronUp
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

interface AssetCategory {
  value: string;
  label: string;
  type: string;
  haircut: number;
  description: string;
}

interface Asset {
  id: number;
  asset_type: string;
  category: string;
  name: string;
  description: string | null;
  stated_value: number;
  estimated_value: number | null;
  collateral_value: number | null;
  valuation_confidence: number | null;
  valuation_notes: string | null;
  has_lien: boolean;
  lien_amount: number | null;
  lien_holder: string | null;
  verification_status: string;
  address?: string;
  property_type?: string;
  square_feet?: number;
  year_built?: number;
  make?: string;
  model?: string;
  year?: number;
  mileage?: number;
  condition?: string;
  age_years?: number;
}

interface CollateralSummary {
  total_assets: number;
  total_stated_value: number;
  total_estimated_value: number;
  total_collateral_value: number;
  personal_assets_count: number;
  personal_assets_value: number;
  business_assets_count: number;
  business_assets_value: number;
}

const CATEGORY_ICONS: Record<string, any> = {
  real_estate: Home, vehicle: Car, investment_account: Wallet,
  retirement_account: Wallet, cash_savings: DollarSign, equipment: Package,
  inventory: Package, real_property: Building2, vehicles_fleet: Car, default: Briefcase,
};

export default function CollateralPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [summary, setSummary] = useState<CollateralSummary | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'personal' | 'business'>('personal');
  const [expandedAsset, setExpandedAsset] = useState<number | null>(null);
  
  const [form, setForm] = useState({
    asset_type: 'personal', category: '', name: '', description: '', stated_value: '',
    address: '', property_type: '', square_feet: '', year_built: '',
    make: '', model: '', year: '', mileage: '',
    condition: 'good', age_years: '',
    has_lien: false, lien_amount: '', lien_holder: '',
  });

  useEffect(() => {
    if (user?.role === 'borrower') loadData();
  }, [user]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [cats, assetList, sum] = await Promise.all([
        api.getAssetCategories(), api.getMyAssets(), api.getCollateralSummary()
      ]);
      setCategories(cats); setAssets(assetList); setSummary(sum);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load data');
    } finally { setLoading(false); }
  };

  const resetForm = () => setForm({
    asset_type: activeTab, category: '', name: '', description: '', stated_value: '',
    address: '', property_type: '', square_feet: '', year_built: '',
    make: '', model: '', year: '', mileage: '', condition: 'good', age_years: '',
    has_lien: false, lien_amount: '', lien_holder: '',
  });

  const openAddModal = () => { resetForm(); setEditingAsset(null); setShowAddModal(true); };

  const openEditModal = (asset: Asset) => {
    setEditingAsset(asset);
    setForm({
      asset_type: asset.asset_type, category: asset.category, name: asset.name,
      description: asset.description || '', stated_value: asset.stated_value.toString(),
      address: asset.address || '', property_type: asset.property_type || '',
      square_feet: asset.square_feet?.toString() || '', year_built: asset.year_built?.toString() || '',
      make: asset.make || '', model: asset.model || '', year: asset.year?.toString() || '',
      mileage: asset.mileage?.toString() || '', condition: asset.condition || 'good',
      age_years: asset.age_years?.toString() || '', has_lien: asset.has_lien,
      lien_amount: asset.lien_amount?.toString() || '', lien_holder: asset.lien_holder || '',
    });
    setShowAddModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const data: any = {
        asset_type: form.asset_type, category: form.category, name: form.name,
        description: form.description || null, stated_value: parseFloat(form.stated_value), has_lien: form.has_lien,
      };
      if (form.address) data.address = form.address;
      if (form.property_type) data.property_type = form.property_type;
      if (form.square_feet) data.square_feet = parseInt(form.square_feet);
      if (form.year_built) data.year_built = parseInt(form.year_built);
      if (form.make) data.make = form.make;
      if (form.model) data.model = form.model;
      if (form.year) data.year = parseInt(form.year);
      if (form.mileage) data.mileage = parseInt(form.mileage);
      if (form.condition) data.condition = form.condition;
      if (form.age_years) data.age_years = parseInt(form.age_years);
      if (form.has_lien && form.lien_amount) {
        data.lien_amount = parseFloat(form.lien_amount);
        data.lien_holder = form.lien_holder;
      }
      
      if (editingAsset) {
        await api.updateAsset(editingAsset.id, data);
        setSuccess('Asset updated successfully');
      } else {
        await api.createAsset(data);
        setSuccess('Asset added and valued successfully');
      }
      setShowAddModal(false); loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save asset');
    } finally { setSaving(false); }
  };

  const handleDelete = async (assetId: number) => {
    if (!confirm('Are you sure you want to remove this asset?')) return;
    try { await api.deleteAsset(assetId); setSuccess('Asset removed'); loadData(); }
    catch (err: any) { setError(err.response?.data?.detail || 'Failed to delete asset'); }
  };

  const handleRevalue = async (assetId: number) => {
    try { await api.revalueAsset(assetId); setSuccess('Asset revalued'); loadData(); }
    catch (err: any) { setError(err.response?.data?.detail || 'Failed to revalue asset'); }
  };

  const getCategoryIcon = (category: string) => CATEGORY_ICONS[category] || CATEGORY_ICONS.default;
  const getCategoryLabel = (v: string) => categories.find(c => c.value === v)?.label || v;
  const getVerificationBadge = (status: string) => {
    const badges: Record<string, any> = {
      verified: { bg: 'bg-green-100', text: 'text-green-800', icon: CheckCircle },
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: Clock },
      rejected: { bg: 'bg-red-100', text: 'text-red-800', icon: AlertCircle },
    };
    return badges[status] || badges.pending;
  };

  const filteredCategories = categories.filter(c => c.type === form.asset_type);
  const filteredAssets = assets.filter(a => a.asset_type === activeTab);
  const selectedCategory = categories.find(c => c.value === form.category);
  const showRealEstateFields = ['real_estate', 'real_property'].includes(form.category);
  const showVehicleFields = ['vehicle', 'vehicles_fleet'].includes(form.category);
  const showEquipmentFields = ['equipment', 'inventory', 'furniture_fixtures'].includes(form.category);

  if (user?.role !== 'borrower') {
    return (<div className="text-center py-12"><Package className="h-12 w-12 mx-auto text-gray-400 mb-4" /><h2 className="text-xl font-semibold text-gray-700">Access Denied</h2></div>);
  }
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary-600" /></div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pre-Qualify Collateral</h1>
          <p className="text-gray-600">Add and value your assets for use as loan collateral</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="btn btn-secondary inline-flex items-center"><RefreshCw className="h-4 w-4 mr-2" />Refresh</button>
          <button onClick={openAddModal} className="btn btn-primary inline-flex items-center"><Plus className="h-4 w-4 mr-2" />Add Asset</button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6">{error}<button onClick={() => setError('')} className="float-right">×</button></div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg mb-6">{success}<button onClick={() => setSuccess('')} className="float-right">×</button></div>}

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="card bg-gradient-to-br from-blue-50 to-blue-100">
            <p className="text-sm text-blue-600 font-medium">Total Assets</p>
            <p className="text-2xl font-bold text-blue-900">{summary.total_assets}</p>
          </div>
          <div className="card bg-gradient-to-br from-green-50 to-green-100">
            <p className="text-sm text-green-600 font-medium">Collateral Value</p>
            <p className="text-2xl font-bold text-green-900">{formatCurrency(summary.total_collateral_value)}</p>
            <p className="text-xs text-green-600">After haircuts</p>
          </div>
          <div className="card bg-gradient-to-br from-purple-50 to-purple-100">
            <p className="text-sm text-purple-600 font-medium">Personal Assets</p>
            <p className="text-2xl font-bold text-purple-900">{formatCurrency(summary.personal_assets_value)}</p>
          </div>
          <div className="card bg-gradient-to-br from-orange-50 to-orange-100">
            <p className="text-sm text-orange-600 font-medium">Business Assets</p>
            <p className="text-2xl font-bold text-orange-900">{formatCurrency(summary.business_assets_value)}</p>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-6">
        <button onClick={() => setActiveTab('personal')} className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'personal' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
          <Home className="h-4 w-4 inline mr-2" />Personal Assets
        </button>
        <button onClick={() => setActiveTab('business')} className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'business' ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
          <Building2 className="h-4 w-4 inline mr-2" />Business Assets
        </button>
      </div>

      {filteredAssets.length === 0 ? (
        <div className="card text-center py-12">
          <Package className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600">No {activeTab} assets added yet.</p>
          <button onClick={openAddModal} className="btn btn-primary mt-4"><Plus className="h-4 w-4 mr-2" />Add Your First Asset</button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredAssets.map((asset) => {
            const Icon = getCategoryIcon(asset.category);
            const badge = getVerificationBadge(asset.verification_status);
            const BadgeIcon = badge.icon;
            const isExpanded = expandedAsset === asset.id;
            return (
              <div key={asset.id} className="card">
                <div className="flex items-start justify-between cursor-pointer" onClick={() => setExpandedAsset(isExpanded ? null : asset.id)}>
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-lg ${activeTab === 'personal' ? 'bg-purple-100' : 'bg-orange-100'}`}>
                      <Icon className={`h-6 w-6 ${activeTab === 'personal' ? 'text-purple-600' : 'text-orange-600'}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{asset.name}</h3>
                      <p className="text-sm text-gray-500">{getCategoryLabel(asset.category)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Collateral Value</p>
                      <p className="text-xl font-bold text-green-600">{formatCurrency(asset.collateral_value || 0)}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
                      <BadgeIcon className="h-3 w-3 inline mr-1" />{asset.verification_status}
                    </span>
                    {isExpanded ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
                  </div>
                </div>
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div><p className="text-sm text-gray-500">Stated Value</p><p className="font-semibold">{formatCurrency(asset.stated_value)}</p></div>
                      <div><p className="text-sm text-gray-500">Estimated Value</p><p className="font-semibold">{formatCurrency(asset.estimated_value || 0)}</p></div>
                      <div><p className="text-sm text-gray-500">Confidence</p><p className="font-semibold">{((asset.valuation_confidence || 0) * 100).toFixed(0)}%</p></div>
                      <div><p className="text-sm text-gray-500">Category</p><p className="font-semibold">{getCategoryLabel(asset.category)}</p></div>
                    </div>
                    {asset.has_lien && <div className="bg-yellow-50 rounded-lg p-3 mb-4"><p className="text-sm text-yellow-800"><AlertCircle className="h-4 w-4 inline mr-1" />Lien: {formatCurrency(asset.lien_amount || 0)} to {asset.lien_holder}</p></div>}
                    {asset.valuation_notes && <div className="bg-gray-50 rounded-lg p-3 mb-4"><p className="text-sm text-gray-600"><strong>Notes:</strong> {asset.valuation_notes}</p></div>}
                    <div className="flex gap-2">
                      <button onClick={() => openEditModal(asset)} className="btn btn-secondary text-sm"><Edit className="h-4 w-4 mr-1" />Edit</button>
                      <button onClick={() => handleRevalue(asset.id)} className="btn btn-secondary text-sm"><RefreshCw className="h-4 w-4 mr-1" />Revalue</button>
                      <button onClick={() => handleDelete(asset.id)} className="btn bg-red-100 text-red-700 hover:bg-red-200 text-sm"><Trash2 className="h-4 w-4 mr-1" />Remove</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 my-8 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4">{editingAsset ? 'Edit Asset' : 'Add New Asset'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!editingAsset && (
                <div>
                  <label className="label">Asset Type</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setForm(f => ({ ...f, asset_type: 'personal', category: '' }))} className={`flex-1 py-2 px-4 rounded-lg border ${form.asset_type === 'personal' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-300'}`}><Home className="h-4 w-4 inline mr-2" />Personal</button>
                    <button type="button" onClick={() => setForm(f => ({ ...f, asset_type: 'business', category: '' }))} className={`flex-1 py-2 px-4 rounded-lg border ${form.asset_type === 'business' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-300'}`}><Building2 className="h-4 w-4 inline mr-2" />Business</button>
                  </div>
                </div>
              )}
              <div>
                <label className="label">Category *</label>
                <select value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} className="input" required>
                  <option value="">Select category...</option>
                  {filteredCategories.map(cat => <option key={cat.value} value={cat.value}>{cat.label}</option>)}
                </select>
                {selectedCategory && <p className="text-xs text-gray-500 mt-1">{selectedCategory.description} • {(selectedCategory.haircut * 100).toFixed(0)}% haircut</p>}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="label">Asset Name *</label><input type="text" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} className="input" required /></div>
                <div><label className="label">Stated Value *</label><div className="relative"><span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span><input type="number" value={form.stated_value} onChange={(e) => setForm(f => ({ ...f, stated_value: e.target.value }))} className="input pl-8" required /></div></div>
              </div>
              <div><label className="label">Description</label><textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} className="input" rows={2} /></div>
              
              {showRealEstateFields && (
                <div className="border-t pt-4">
                  <h3 className="font-medium mb-3">Property Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2"><label className="label">Address</label><input type="text" value={form.address} onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))} className="input" /></div>
                    <div><label className="label">Property Type</label><select value={form.property_type} onChange={(e) => setForm(f => ({ ...f, property_type: e.target.value }))} className="input"><option value="">Select...</option><option value="single_family">Single Family</option><option value="condo">Condo</option><option value="commercial">Commercial</option><option value="land">Land</option></select></div>
                    <div><label className="label">Square Feet</label><input type="number" value={form.square_feet} onChange={(e) => setForm(f => ({ ...f, square_feet: e.target.value }))} className="input" /></div>
                    <div><label className="label">Year Built</label><input type="number" value={form.year_built} onChange={(e) => setForm(f => ({ ...f, year_built: e.target.value }))} className="input" /></div>
                  </div>
                </div>
              )}
              
              {showVehicleFields && (
                <div className="border-t pt-4">
                  <h3 className="font-medium mb-3">Vehicle Details</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div><label className="label">Make</label><input type="text" value={form.make} onChange={(e) => setForm(f => ({ ...f, make: e.target.value }))} className="input" /></div>
                    <div><label className="label">Model</label><input type="text" value={form.model} onChange={(e) => setForm(f => ({ ...f, model: e.target.value }))} className="input" /></div>
                    <div><label className="label">Year</label><input type="number" value={form.year} onChange={(e) => setForm(f => ({ ...f, year: e.target.value }))} className="input" /></div>
                    <div><label className="label">Mileage</label><input type="number" value={form.mileage} onChange={(e) => setForm(f => ({ ...f, mileage: e.target.value }))} className="input" /></div>
                  </div>
                </div>
              )}
              
              {showEquipmentFields && (
                <div className="border-t pt-4">
                  <h3 className="font-medium mb-3">Equipment Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="label">Condition</label><select value={form.condition} onChange={(e) => setForm(f => ({ ...f, condition: e.target.value }))} className="input"><option value="excellent">Excellent</option><option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option></select></div>
                    <div><label className="label">Age (years)</label><input type="number" value={form.age_years} onChange={(e) => setForm(f => ({ ...f, age_years: e.target.value }))} className="input" /></div>
                  </div>
                </div>
              )}
              
              <div className="border-t pt-4">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.has_lien} onChange={(e) => setForm(f => ({ ...f, has_lien: e.target.checked }))} className="rounded" />
                  <span>This asset has an existing lien</span>
                </label>
                {form.has_lien && (
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div><label className="label">Lien Amount</label><div className="relative"><span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span><input type="number" value={form.lien_amount} onChange={(e) => setForm(f => ({ ...f, lien_amount: e.target.value }))} className="input pl-8" /></div></div>
                    <div><label className="label">Lien Holder</label><input type="text" value={form.lien_holder} onChange={(e) => setForm(f => ({ ...f, lien_holder: e.target.value }))} className="input" /></div>
                  </div>
                )}
              </div>
              
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingAsset ? 'Save Changes' : 'Add & Value Asset'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
