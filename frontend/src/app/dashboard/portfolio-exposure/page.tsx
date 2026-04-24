'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { TrendingUp, AlertTriangle, BarChart3, Shield } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export default function PortfolioExposurePage() {
  const [deals, setDeals] = useState<any[]>([]);
  const [uwData, setUwData] = useState<Record<number, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/v1/deals/`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const all = await res.json();
      setDeals(all);
      all.forEach(async (deal: any) => {
        try {
          const r = await fetch(`${API}/api/v1/underwriting/deals/${deal.id}/full-underwriting`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (r.ok) {
            const data = await r.json();
            setUwData(prev => ({ ...prev, [deal.id]: data }));
          }
        } catch {}
      });
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  // Compute concentration metrics
  const totalExposure = deals.reduce((sum, d) => sum + (d.loan_amount_requested || 0), 0);
  const totalDeals = deals.length;

  const byIndustry = deals.reduce((acc, d) => {
    const ind = d.industry || 'other';
    if (!acc[ind]) acc[ind] = { count: 0, exposure: 0 };
    acc[ind].count++;
    acc[ind].exposure += d.loan_amount_requested || 0;
    return acc;
  }, {} as Record<string, {count:number;exposure:number}>);

  const byStatus = deals.reduce((acc, d) => {
    if (!acc[d.status]) acc[d.status] = { count: 0, exposure: 0 };
    acc[d.status].count++;
    acc[d.status].exposure += d.loan_amount_requested || 0;
    return acc;
  }, {} as Record<string, {count:number;exposure:number}>);

  const avgHealth = Object.values(uwData).reduce((sum: number, uw: any) => sum + (uw.health_score?.score || 0), 0) / Math.max(Object.keys(uwData).length, 1);
  const atRisk = deals.filter(d => {
    const uw = uwData[d.id];
    return uw && (uw.health_score?.score || 0) < 60;
  });

  const sortedIndustries = Object.entries(byIndustry).sort((a, b) => b[1].exposure - a[1].exposure);
  const maxIndustryExposure = Math.max(...Object.values(byIndustry).map(v => v.exposure), 1);

  const alertColors: Record<string, string> = {
    none: 'bg-green-100 text-green-700',
    watch: 'bg-blue-100 text-blue-700',
    advisory: 'bg-yellow-100 text-yellow-700',
    escalation: 'bg-orange-100 text-orange-700',
    pre_claim: 'bg-red-100 text-red-700',
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Portfolio Exposure</h1>
        <p className="text-gray-500 mt-1">Concentration analysis across your insured book.</p>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Exposure', value: fmt(totalExposure), sub: 'across all deals', color: 'bg-purple-50 border-purple-200' },
          { label: 'Total Deals', value: `${totalDeals}`, sub: 'in portfolio', color: 'bg-blue-50 border-blue-200' },
          { label: 'Avg Health Score', value: `${avgHealth.toFixed(0)}/100`, sub: 'portfolio average', color: avgHealth >= 70 ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200' },
          { label: 'At-Risk Deals', value: `${atRisk.length}`, sub: 'health score < 60', color: atRisk.length > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200' },
        ].map(m => (
          <div key={m.label} className={`rounded-xl border p-4 ${m.color}`}>
            <p className="text-xs text-gray-500 font-semibold uppercase">{m.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{m.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* Industry concentration */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-lg font-semibold mb-5">Industry Concentration</h2>
        {sortedIndustries.length === 0 ? (
          <p className="text-sm text-gray-400">No deals loaded yet.</p>
        ) : (
          <div className="space-y-3">
            {sortedIndustries.map(([ind, data]) => {
              const pct = totalExposure > 0 ? data.exposure / totalExposure * 100 : 0;
              const barPct = data.exposure / maxIndustryExposure * 100;
              const isConcentrated = pct > 30;
              return (
                <div key={ind}>
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800 capitalize">{ind.replace(/_/g,' ')}</span>
                      {isConcentrated && <AlertTriangle className="h-3 w-3 text-orange-400" title="High concentration"/>}
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-semibold text-gray-700">{fmt(data.exposure)}</span>
                      <span className="text-xs text-gray-400 ml-2">{pct.toFixed(1)}% · {data.count} deal{data.count !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className={`h-2 rounded-full transition-all ${isConcentrated ? 'bg-orange-400' : 'bg-purple-500'}`}
                      style={{ width: `${barPct}%` }}/>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {sortedIndustries.some(([,d]) => d.exposure / totalExposure > 0.3) && (
          <div className="mt-4 bg-orange-50 border border-orange-200 rounded-lg p-3">
            <p className="text-xs text-orange-700"><strong>Concentration alert:</strong> One or more industries exceed 30% of total exposure. Consider diversification limits.</p>
          </div>
        )}
      </div>

      {/* Status breakdown */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-lg font-semibold mb-4">Deal Status Breakdown</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Object.entries(byStatus).map(([status, data]) => (
            <div key={status} className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 capitalize mb-1">{status.replace(/_/g,' ')}</p>
              <p className="font-bold text-gray-900">{data.count} deal{data.count !== 1 ? 's' : ''}</p>
              <p className="text-xs text-gray-500">{fmt(data.exposure)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* At-risk deals */}
      {atRisk.length > 0 && (
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-400"/>
            At-Risk Deals
          </h2>
          <div className="space-y-3">
            {atRisk.map(deal => {
              const uw = uwData[deal.id];
              const alert = uw?.alert_level || 'advisory';
              return (
                <div key={deal.id} className="flex items-center justify-between p-3 border border-red-100 bg-red-50 rounded-lg">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{deal.name}</p>
                    <p className="text-xs text-gray-400 capitalize">{deal.industry} · {fmt(deal.loan_amount_requested || 0)}</p>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <div>
                      <p className="text-xs text-gray-400">Health</p>
                      <p className="text-sm font-bold text-red-600">{uw?.health_score?.score?.toFixed(0)}/100</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${alertColors[alert] || alertColors.advisory}`}>
                      {alert}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-center text-xs text-gray-400">
        Exposure figures reflect loan amounts requested. Actual insured amounts depend on coverage terms.
      </p>
    </div>
  );
}