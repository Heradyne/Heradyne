'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { RefreshCw, CheckCircle, AlertCircle, FileText, ChevronRight, X, Download } from 'lucide-react';
import { api } from '@/lib/api';

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

const STATUS_STYLE: Record<string, string> = {
  ready_to_send:         'bg-green-100 text-green-700',
  needs_borrower_input:  'bg-yellow-100 text-yellow-700',
  needs_borrower_signature: 'bg-blue-100 text-blue-700',
  conditional:           'bg-gray-100 text-gray-500',
};
const STATUS_LABEL: Record<string, string> = {
  ready_to_send:            'Ready',
  needs_borrower_input:     'Needs Borrower',
  needs_borrower_signature: 'Needs Signature',
  conditional:              'Conditional',
};

export default function SBAWizardPage() {
  const [deals, setDeals] = useState<any[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<number | null>(null);
  const [wizardData, setWizardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingWizard, setLoadingWizard] = useState(false);

  useEffect(() => {
    api.getDeals().then(d => {
      const ds = Array.isArray(d) ? d : (d?.deals || []);
      setDeals(ds.filter((deal: any) => deal.status !== 'draft'));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const loadWizard = async (dealId: number) => {
    setLoadingWizard(true);
    setSelectedDeal(dealId);
    try {
      const data = await api.getSBAWizard(dealId);
      setWizardData(data);
    } catch { /* silent */ }
    finally { setLoadingWizard(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="h-8 w-8 animate-spin" /></div>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileText className="h-7 w-7 text-blue-600" /> SBA 7(a) Package Wizard
        </h1>
        <p className="text-gray-500">Generate a complete SBA submission checklist pre-populated from deal data</p>
      </div>

      {!wizardData ? (
        <div className="card max-w-lg">
          <h3 className="font-semibold text-gray-800 mb-3">Select a Deal</h3>
          {deals.length === 0 ? (
            <p className="text-gray-400 text-sm">No submitted deals yet.</p>
          ) : (
            <div className="space-y-2">
              {deals.map(deal => (
                <button key={deal.id} onClick={() => loadWizard(deal.id)}
                  className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-left transition-all">
                  <div>
                    <p className="font-medium text-gray-800">{deal.name}</p>
                    <p className="text-xs text-gray-400">{deal.industry} · {fmt(deal.loan_amount_requested)}</p>
                  </div>
                  {loadingWizard && selectedDeal === deal.id
                    ? <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
                    : <ChevronRight className="h-4 w-4 text-gray-400" />}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{wizardData.deal_name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div className="h-2 rounded-full bg-blue-500" style={{ width: `${wizardData.readiness_score}%` }} />
                </div>
                <span className="text-sm text-gray-600">{wizardData.readiness_score}% package ready</span>
              </div>
            </div>
            <button onClick={() => { setWizardData(null); setSelectedDeal(null); }} className="btn btn-secondary text-sm">← Change Deal</button>
          </div>

          {/* Pre-filled data */}
          {wizardData.prefilled && (
            <div className="card bg-blue-50 border-blue-200">
              <p className="text-xs font-bold text-blue-700 uppercase mb-3">Pre-filled from Deal Data</p>
              <div className="grid grid-cols-3 gap-3 text-sm">
                {[
                  ['Business Name', wizardData.prefilled.business_name],
                  ['Industry', wizardData.prefilled.industry],
                  ['Loan Amount', fmt(wizardData.prefilled.loan_amount)],
                  ['Annual Revenue', fmt(wizardData.prefilled.annual_revenue)],
                  ['EBITDA', fmt(wizardData.prefilled.ebitda)],
                  ['DSCR', wizardData.prefilled.dscr?.toFixed(2) || '—'],
                  ['Business Value', wizardData.prefilled.equity_value ? fmt(wizardData.prefilled.equity_value) : '—'],
                  ['Equity Injection Required', fmt(wizardData.prefilled.equity_injection_required)],
                  ['SDE', wizardData.prefilled.sde ? fmt(wizardData.prefilled.sde) : '—'],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <p className="text-xs text-blue-500">{label}</p>
                    <p className="font-medium text-blue-900">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Next steps */}
          <div className="card bg-yellow-50 border-yellow-200">
            <p className="text-xs font-bold text-yellow-700 uppercase mb-2">Next Steps</p>
            {(wizardData.next_steps || []).map((step: string, i: number) => (
              <p key={i} className="text-sm text-yellow-800 flex gap-2 mb-1">
                <span className="font-bold text-yellow-600 shrink-0">{i + 1}.</span>{step}
              </p>
            ))}
          </div>

          {/* SBA Forms */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-3">Required SBA Forms</h3>
            <div className="space-y-3">
              {(wizardData.forms || []).map((form: any) => (
                <div key={form.form} className="card flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-gray-700">{form.form}</span>
                      <span className="font-medium text-gray-900">— {form.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[form.status] || 'bg-gray-100 text-gray-500'}`}>
                        {STATUS_LABEL[form.status] || form.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">{form.description}</p>
                    {form.auto_populated?.length > 0 && (
                      <p className="text-xs text-green-600 mt-1">✓ Auto-populated: {form.auto_populated.join(', ')}</p>
                    )}
                    {form.fields_needed?.length > 0 && (
                      <p className="text-xs text-yellow-600 mt-0.5">Needs: {form.fields_needed.join(', ')}</p>
                    )}
                  </div>
                  <button className="btn btn-secondary text-xs ml-4 flex items-center gap-1 shrink-0">
                    <Download className="h-3 w-3" /> Get Form
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Document checklist */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-3">Document Checklist</h3>
            <div className="card divide-y divide-gray-50">
              {(wizardData.documents || []).map((doc: any, i: number) => (
                <div key={i} className="py-3 flex items-start gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${doc.status === 'completed' ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
                    {doc.status === 'completed' && <CheckCircle className="h-3 w-3 text-white" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium ${doc.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{doc.name}</p>
                      {doc.required && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Required</span>}
                    </div>
                    {doc.note && <p className="text-xs text-gray-400 mt-0.5">{doc.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
