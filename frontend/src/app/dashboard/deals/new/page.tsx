'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { INDUSTRIES } from '@/lib/utils';

type Step = 'basics' | 'financials' | 'collateral' | 'review';

export default function NewDealPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('basics');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    deal_type: 'acquisition',
    industry: '',
    business_description: '',
    loan_amount_requested: '',
    loan_term_months: '84',
    annual_revenue: '',
    gross_profit: '',
    ebitda: '',
    capex: '',
    debt_service: '',
    purchase_price: '',
    equity_injection: '',
    owner_credit_score: '',
    owner_experience_years: '',
    addbacks: [] as { description: string; amount: string }[],
    business_assets: [] as { type: string; value: string; description: string }[],
    personal_assets: [] as { type: string; value: string; description: string }[],
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const addAddback = () => {
    setFormData({
      ...formData,
      addbacks: [...formData.addbacks, { description: '', amount: '' }],
    });
  };

  const updateAddback = (index: number, field: string, value: string) => {
    const newAddbacks = [...formData.addbacks];
    newAddbacks[index] = { ...newAddbacks[index], [field]: value };
    setFormData({ ...formData, addbacks: newAddbacks });
  };

  const addAsset = (type: 'business' | 'personal') => {
    const key = type === 'business' ? 'business_assets' : 'personal_assets';
    setFormData({
      ...formData,
      [key]: [...formData[key], { type: '', value: '', description: '' }],
    });
  };

  const updateAsset = (assetType: 'business' | 'personal', index: number, field: string, value: string) => {
    const key = assetType === 'business' ? 'business_assets' : 'personal_assets';
    const newAssets = [...formData[key]];
    newAssets[index] = { ...newAssets[index], [field]: value };
    setFormData({ ...formData, [key]: newAssets });
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');

    try {
      const dealData = {
        name: formData.name,
        deal_type: formData.deal_type,
        industry: formData.industry,
        business_description: formData.business_description || undefined,
        loan_amount_requested: parseFloat(formData.loan_amount_requested),
        loan_term_months: parseInt(formData.loan_term_months),
        annual_revenue: parseFloat(formData.annual_revenue),
        gross_profit: formData.gross_profit ? parseFloat(formData.gross_profit) : undefined,
        ebitda: parseFloat(formData.ebitda),
        capex: formData.capex ? parseFloat(formData.capex) : undefined,
        debt_service: formData.debt_service ? parseFloat(formData.debt_service) : undefined,
        purchase_price: formData.purchase_price ? parseFloat(formData.purchase_price) : undefined,
        equity_injection: formData.equity_injection ? parseFloat(formData.equity_injection) : undefined,
        owner_credit_score: formData.owner_credit_score ? parseInt(formData.owner_credit_score) : undefined,
        owner_experience_years: formData.owner_experience_years ? parseInt(formData.owner_experience_years) : undefined,
        addbacks: (formData.addbacks || []).filter(a => a.description && a.amount).map(a => ({
          description: a.description,
          amount: parseFloat(a.amount),
        })),
        business_assets: (formData.business_assets || []).filter(a => a.type && a.value).map(a => ({
          type: a.type,
          value: parseFloat(a.value),
          description: a.description || undefined,
        })),
        personal_assets: (formData.personal_assets || []).filter(a => a.type && a.value).map(a => ({
          type: a.type,
          value: parseFloat(a.value),
          description: a.description || undefined,
        })),
      };

      const deal = await api.createDeal(dealData);
      router.push(`/dashboard/deals/${deal.id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create deal');
    } finally {
      setLoading(false);
    }
  };

  const steps: Step[] = ['basics', 'financials', 'collateral', 'review'];
  const currentIndex = steps.indexOf(step);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Create New Deal</h1>
        <p className="text-gray-600">Fill in the deal information step by step</p>
      </div>

      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                i <= currentIndex ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {i + 1}
              </div>
              <span className="ml-2 text-sm capitalize hidden sm:inline">{s}</span>
              {i < steps.length - 1 && (
                <div className={`w-12 sm:w-24 h-1 mx-2 ${i < currentIndex ? 'bg-primary-600' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      <div className="card">
        {/* Step 1: Basics */}
        {step === 'basics' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">Basic Information</h2>
            
            <div>
              <label className="label">Deal Name *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="input"
                placeholder="e.g., ABC Manufacturing Acquisition"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Deal Type *</label>
                <select name="deal_type" value={formData.deal_type} onChange={handleChange} className="input">
                  <option value="acquisition">Acquisition</option>
                  <option value="growth">Growth Capital</option>
                </select>
              </div>
              <div>
                <label className="label">Industry *</label>
                <select name="industry" value={formData.industry} onChange={handleChange} className="input">
                  <option value="">Select industry...</option>
                  {INDUSTRIES.map(ind => (
                    <option key={ind} value={ind}>{ind.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="label">Business Description</label>
              <textarea
                name="business_description"
                value={formData.business_description}
                onChange={handleChange}
                className="input"
                rows={3}
                placeholder="Brief description of the business..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Loan Amount Requested *</label>
                <input
                  type="number"
                  name="loan_amount_requested"
                  value={formData.loan_amount_requested}
                  onChange={handleChange}
                  className="input"
                  placeholder="1000000"
                />
              </div>
              <div>
                <label className="label">Loan Term (months)</label>
                <input
                  type="number"
                  name="loan_term_months"
                  value={formData.loan_term_months}
                  onChange={handleChange}
                  className="input"
                />
              </div>
            </div>

            {formData.deal_type === 'acquisition' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Purchase Price</label>
                  <input
                    type="number"
                    name="purchase_price"
                    value={formData.purchase_price}
                    onChange={handleChange}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Equity Injection</label>
                  <input
                    type="number"
                    name="equity_injection"
                    value={formData.equity_injection}
                    onChange={handleChange}
                    className="input"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Financials */}
        {step === 'financials' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">Financial Information</h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Annual Revenue *</label>
                <input
                  type="number"
                  name="annual_revenue"
                  value={formData.annual_revenue}
                  onChange={handleChange}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Gross Profit</label>
                <input
                  type="number"
                  name="gross_profit"
                  value={formData.gross_profit}
                  onChange={handleChange}
                  className="input"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="label">EBITDA *</label>
                <input
                  type="number"
                  name="ebitda"
                  value={formData.ebitda}
                  onChange={handleChange}
                  className="input"
                />
              </div>
              <div>
                <label className="label">CapEx</label>
                <input
                  type="number"
                  name="capex"
                  value={formData.capex}
                  onChange={handleChange}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Existing Debt Service</label>
                <input
                  type="number"
                  name="debt_service"
                  value={formData.debt_service}
                  onChange={handleChange}
                  className="input"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="label mb-0">Addbacks</label>
                <button type="button" onClick={addAddback} className="text-sm text-primary-600 hover:underline">
                  + Add addback
                </button>
              </div>
              {(formData.addbacks || []).map((addback, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="Description"
                    value={addback.description}
                    onChange={(e) => updateAddback(i, 'description', e.target.value)}
                    className="input flex-1"
                  />
                  <input
                    type="number"
                    placeholder="Amount"
                    value={addback.amount}
                    onChange={(e) => updateAddback(i, 'amount', e.target.value)}
                    className="input w-32"
                  />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Owner Credit Score</label>
                <input
                  type="number"
                  name="owner_credit_score"
                  value={formData.owner_credit_score}
                  onChange={handleChange}
                  className="input"
                  min="300"
                  max="850"
                />
              </div>
              <div>
                <label className="label">Owner Experience (years)</label>
                <input
                  type="number"
                  name="owner_experience_years"
                  value={formData.owner_experience_years}
                  onChange={handleChange}
                  className="input"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Collateral */}
        {step === 'collateral' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">Collateral Information</h2>
            
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="label mb-0">Business Assets</label>
                <button type="button" onClick={() => addAsset('business')} className="text-sm text-primary-600 hover:underline">
                  + Add asset
                </button>
              </div>
              {(formData.business_assets || []).map((asset, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <select
                    value={asset.type}
                    onChange={(e) => updateAsset('business', i, 'type', e.target.value)}
                    className="input w-40"
                  >
                    <option value="">Type...</option>
                    <option value="accounts_receivable">A/R</option>
                    <option value="inventory">Inventory</option>
                    <option value="equipment">Equipment</option>
                    <option value="vehicles">Vehicles</option>
                    <option value="real_estate">Real Estate</option>
                  </select>
                  <input
                    type="number"
                    placeholder="Value"
                    value={asset.value}
                    onChange={(e) => updateAsset('business', i, 'value', e.target.value)}
                    className="input w-32"
                  />
                  <input
                    type="text"
                    placeholder="Description"
                    value={asset.description}
                    onChange={(e) => updateAsset('business', i, 'description', e.target.value)}
                    className="input flex-1"
                  />
                </div>
              ))}
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="label mb-0">Personal Assets</label>
                <button type="button" onClick={() => addAsset('personal')} className="text-sm text-primary-600 hover:underline">
                  + Add asset
                </button>
              </div>
              {(formData.personal_assets || []).map((asset, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <select
                    value={asset.type}
                    onChange={(e) => updateAsset('personal', i, 'type', e.target.value)}
                    className="input w-40"
                  >
                    <option value="">Type...</option>
                    <option value="primary_residence">Primary Residence</option>
                    <option value="investment_property">Investment Property</option>
                    <option value="brokerage_accounts">Brokerage</option>
                    <option value="retirement_accounts">Retirement</option>
                    <option value="cash">Cash</option>
                  </select>
                  <input
                    type="number"
                    placeholder="Value"
                    value={asset.value}
                    onChange={(e) => updateAsset('personal', i, 'value', e.target.value)}
                    className="input w-32"
                  />
                  <input
                    type="text"
                    placeholder="Description"
                    value={asset.description}
                    onChange={(e) => updateAsset('personal', i, 'description', e.target.value)}
                    className="input flex-1"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 'review' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">Review Deal</h2>
            
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="font-medium text-gray-700 mb-2">Basic Info</h3>
                <dl className="space-y-1 text-sm">
                  <div><dt className="inline text-gray-500">Name:</dt> <dd className="inline">{formData.name}</dd></div>
                  <div><dt className="inline text-gray-500">Type:</dt> <dd className="inline capitalize">{formData.deal_type}</dd></div>
                  <div><dt className="inline text-gray-500">Industry:</dt> <dd className="inline capitalize">{formData.industry}</dd></div>
                  <div><dt className="inline text-gray-500">Loan:</dt> <dd className="inline">${parseInt(formData.loan_amount_requested || '0').toLocaleString()}</dd></div>
                  <div><dt className="inline text-gray-500">Term:</dt> <dd className="inline">{formData.loan_term_months} months</dd></div>
                </dl>
              </div>
              <div>
                <h3 className="font-medium text-gray-700 mb-2">Financials</h3>
                <dl className="space-y-1 text-sm">
                  <div><dt className="inline text-gray-500">Revenue:</dt> <dd className="inline">${parseInt(formData.annual_revenue || '0').toLocaleString()}</dd></div>
                  <div><dt className="inline text-gray-500">EBITDA:</dt> <dd className="inline">${parseInt(formData.ebitda || '0').toLocaleString()}</dd></div>
                  {formData.addbacks.length > 0 && (
                    <div><dt className="inline text-gray-500">Addbacks:</dt> <dd className="inline">{formData.addbacks.length} items</dd></div>
                  )}
                </dl>
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
              <strong>Note:</strong> After creating the deal, you can upload documents and submit it for analysis.
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8 pt-6 border-t">
          {currentIndex > 0 ? (
            <button
              type="button"
              onClick={() => setStep(steps[currentIndex - 1])}
              className="btn btn-secondary inline-flex items-center"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </button>
          ) : (
            <div />
          )}
          
          {currentIndex < steps.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep(steps[currentIndex + 1])}
              className="btn btn-primary inline-flex items-center"
              disabled={
                (step === 'basics' && (!formData.name || !formData.industry || !formData.loan_amount_requested)) ||
                (step === 'financials' && (!formData.annual_revenue || !formData.ebitda))
              }
            >
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="btn btn-primary inline-flex items-center"
            >
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Create Deal
            </button>
          )}
        </div>
      </div>
    </div>
  );
}