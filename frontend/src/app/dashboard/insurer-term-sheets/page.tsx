'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, CheckCircle, Send, Save, Brain, ChevronDown, ChevronUp, Edit3, ArrowRight, Loader } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const fmtPct = (n: number) => `${Number(n).toFixed(2)}%`;

export default function InsurerTermSheetsPage() {
  const router = useRouter();
  const [matches, setMatches] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [showAI, setShowAI] = useState(false);

  const [form, setForm] = useState({
    coverage_pct: '85',
    coverage_amount: '',
    attachment_point_pct: '10',
    annual_premium_rate: '3.50',
    premium_payment: 'annual',
    policy_term_months: '120',
    waiting_period_days: '90',
    exclusions: '',
    conditions: '',
    sba_eligible: true,
    expiry_days: '30',
    notes: '',
  });

  useEffect(() => { loadMatches(); }, []);

  const loadMatches = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/v1/origination/insurer-term-sheets/accepted-matches`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setMatches(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const selectMatch = (match: any) => {
    setSelected(match);
    setSubmitted(match.term_sheet_status === 'submitted');
    setSaved(false); setError('');
    const src = match.term_sheet || match.ai_suggested || {};
    const loan = match.loan_amount_requested || 0;
    setForm({
      coverage_pct: (src.coverage_pct || 85).toString(),
      coverage_amount: (src.coverage_amount || Math.round(loan * 0.85)).toString(),
      attachment_point_pct: (src.attachment_point_pct || 10).toString(),
      annual_premium_rate: (src.annual_premium_rate || 3.5).toString(),
      premium_payment: src.premium_payment || 'annual',
      policy_term_months: (src.policy_term_months || 120).toString(),
      waiting_period_days: (src.waiting_period_days || 90).toString(),
      exclusions: src.exclusions || '',
      conditions: src.conditions || '',
      sba_eligible: src.sba_eligible !== undefined ? src.sba_eligible : true,
      expiry_days: (src.expiry_days || 30).toString(),
      notes: src.notes || '',
    });
  };

  const applyAI = () => {
    if (!selected?.ai_suggested) return;
    const s = selected.ai_suggested;
    setForm(p => ({
      ...p,
      coverage_pct: (s.coverage_pct || p.coverage_pct).toString(),
      coverage_amount: (s.coverage_amount || p.coverage_amount).toString(),
      attachment_point_pct: (s.attachment_point_pct || p.attachment_point_pct).toString(),
      annual_premium_rate: (s.annual_premium_rate || p.annual_premium_rate).toString(),
      policy_term_months: (s.policy_term_months || p.policy_term_months).toString(),
      waiting_period_days: (s.waiting_period_days || p.waiting_period_days).toString(),
      exclusions: s.exclusions || p.exclusions,
      conditions: s.conditions || p.conditions,
      sba_eligible: s.sba_eligible !== undefined ? s.sba_eligible : p.sba_eligible,
    }));
    setShowAI(false);
  };

  // Auto-calculate coverage amount when coverage_pct or loan changes
  const handleCoveragePct = (val: string) => {
    const loan = selected?.loan_amount_requested || 0;
    const pct = parseFloat(val) || 0;
    setForm(p => ({
      ...p,
      coverage_pct: val,
      coverage_amount: pct > 0 ? Math.round(loan * pct / 100).toString() : p.coverage_amount,
    }));
  };

  const saveTermSheet = async () => {
    if (!selected) return;
    setSaving(true); setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/v1/origination/insurer-term-sheets/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          match_id: selected.match_id,
          deal_id: selected.deal_id,
          coverage_pct: parseFloat(form.coverage_pct),
          coverage_amount: parseFloat(form.coverage_amount),
          attachment_point_pct: parseFloat(form.attachment_point_pct),
          annual_premium_rate: parseFloat(form.annual_premium_rate),
          premium_payment: form.premium_payment,
          policy_term_months: parseInt(form.policy_term_months),
          waiting_period_days: parseInt(form.waiting_period_days),
          exclusions: form.exclusions,
          conditions: form.conditions,
          sba_eligible: form.sba_eligible,
          expiry_days: parseInt(form.expiry_days),
          notes: form.notes,
        }),
      });
      if (!res.ok) { const e = await res.json(); setError(e.detail || 'Save failed'); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      await loadMatches();
    } catch (e) { setError('Connection error'); }
    finally { setSaving(false); }
  };

  const submitTermSheet = async () => {
    if (!selected) return;
    setSubmitting(true); setError('');
    try {
      await saveTermSheet();
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/v1/origination/insurer-term-sheets/${selected.match_id}/submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const e = await res.json(); setError(e.detail || 'Submit failed'); return; }
      setSubmitted(true);
      await loadMatches();
    } catch (e) { setError('Connection error'); }
    finally { setSubmitting(false); }
  };

  // Computed premium figures
  const coverageAmt = parseFloat(form.coverage_amount) || 0;
  const premiumRate = parseFloat(form.annual_premium_rate) || 0;
  const annualPremium = coverageAmt * premiumRate / 100;
  const monthlyPremium = annualPremium / 12;
  const totalPremium = annualPremium * (parseInt(form.policy_term_months) || 120) / 12;
  const exposedAmount = coverageAmt * (1 - (parseFloat(form.attachment_point_pct) || 0) / 100);

  const inp: React.CSSProperties = {
    width: '100%', padding: '0.55rem 0.875rem', border: '1.5px solid var(--border-mid)',
    borderRadius: '3px', fontSize: '0.85rem', fontFamily: '"DM Sans",sans-serif',
    color: 'var(--ink)', background: 'var(--surface-card)',
  };
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: '0.67rem', fontWeight: 500, letterSpacing: '0.12em',
    textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: '0.35rem',
  };

  const uw = selected?.uw || {};
  const ai = selected?.ai_suggested || {};
  const hasAI = Object.keys(ai).length > 0;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
        <p style={{ fontSize: '0.67rem', fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '0.3rem' }}>
          Insurer Workflow
        </p>
        <h1 style={{ fontFamily: '"DM Serif Display",serif', fontSize: '1.8rem', color: 'var(--navy)', fontWeight: 400, marginBottom: '0.25rem' }}>
          Coverage Term Sheet
        </h1>
        <p style={{ fontSize: '0.84rem', color: 'var(--ink-muted)', fontWeight: 300 }}>
          Structure your coverage offer — premium rate, coverage %, attachment point, exclusions, and policy conditions.
        </p>
      </div>

      {/* Workflow steps */}
      <div style={{ display: 'flex', marginBottom: '2rem', background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
        {[
          { n: '1', label: 'Deal Accepted', done: true },
          { n: '2', label: 'Price & Structure', done: !!selected && !submitted, active: !!selected && !submitted },
          { n: '3', label: 'Submit Coverage Offer', done: submitted },
          { n: '4', label: 'Guarantee Issuance', done: false },
        ].map((step, i, arr) => (
          <div key={step.n} style={{
            flex: 1, padding: '0.875rem 1rem', display: 'flex', alignItems: 'center', gap: '0.6rem',
            background: step.done ? 'var(--navy)' : step.active ? 'var(--gold-faint)' : 'transparent',
            borderRight: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{
              width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: step.done ? 'var(--accent)' : step.active ? 'var(--gold)' : 'var(--border-mid)',
              fontSize: '0.65rem', fontWeight: 600,
              color: step.done || step.active ? '#fff' : 'var(--ink-muted)',
            }}>{step.done ? '✓' : step.n}</div>
            <span style={{ fontSize: '0.75rem', fontWeight: 500, color: step.done ? 'rgba(255,255,255,0.9)' : step.active ? 'var(--gold-dark)' : 'var(--ink-faint)' }}>
              {step.label}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.5rem', alignItems: 'start' }}>

        {/* Deal list */}
        <div>
          <p style={{ ...lbl, marginBottom: '0.75rem' }}>Accepted Deals</p>
          {loading && <div style={{ fontSize: '0.83rem', color: 'var(--ink-faint)' }}>Loading...</div>}
          {!loading && matches.length === 0 && (
            <div style={{ padding: '1.5rem', background: 'var(--surface-card)', border: '1px dashed var(--border-mid)', borderRadius: '4px', textAlign: 'center' }}>
              <p style={{ fontSize: '0.82rem', color: 'var(--ink-faint)', marginBottom: '0.5rem' }}>No accepted deals yet</p>
              <button onClick={() => router.push('/dashboard/matches')} className="btn btn-outline btn-sm" style={{ marginTop: '0.75rem' }}>
                Go to Pipeline
              </button>
            </div>
          )}
          {(matches || []).map(match => {
            const tsStatus = match.term_sheet_status;
            const isActive = selected?.match_id === match.match_id;
            return (
              <div key={match.match_id} onClick={() => selectMatch(match)}
                style={{
                  padding: '0.875rem 1rem', borderRadius: '4px', cursor: 'pointer', marginBottom: '0.5rem',
                  border: `1.5px solid ${isActive ? 'var(--navy)' : 'var(--border)'}`,
                  background: isActive ? 'var(--navy-faint)' : 'var(--surface-card)',
                  transition: 'all 0.15s',
                }}>
                <p style={{ fontSize: '0.83rem', fontWeight: 500, color: 'var(--ink)', marginBottom: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {match.deal_name}
                </p>
                <p style={{ fontSize: '0.72rem', color: 'var(--ink-faint)', marginBottom: '0.4rem', textTransform: 'capitalize' }}>
                  {match.industry} · {fmt(match.loan_amount_requested || 0)}
                </p>
                <span style={{
                  fontSize: '0.62rem', fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase',
                  padding: '2px 7px', borderRadius: '2px',
                  background: tsStatus === 'submitted' ? 'var(--green-bg)' : tsStatus === 'draft' ? 'var(--gold-faint)' : 'var(--navy-light)',
                  color: tsStatus === 'submitted' ? 'var(--green)' : tsStatus === 'draft' ? 'var(--gold-dark)' : 'var(--navy)',
                  border: `1px solid ${tsStatus === 'submitted' ? 'var(--green-border)' : tsStatus === 'draft' ? 'var(--gold-light)' : 'rgba(15,35,64,0.15)'}`,
                }}>
                  {tsStatus === 'submitted' ? 'Offer Submitted' : tsStatus === 'draft' ? 'Draft' : 'No Offer Yet'}
                </span>
              </div>
            );
          })}
        </div>

        {/* Term sheet form */}
        {!selected ? (
          <div style={{ padding: '4rem', background: 'var(--surface-card)', border: '1px dashed var(--border-mid)', borderRadius: '4px', textAlign: 'center' }}>
            <Shield style={{ width: '32px', height: '32px', color: 'var(--border-strong)', margin: '0 auto 1rem' }} />
            <p style={{ fontSize: '0.9rem', color: 'var(--ink-muted)' }}>Select a deal to structure a coverage offer</p>
          </div>
        ) : submitted ? (
          <div style={{ padding: '3rem', background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: '4px', textAlign: 'center' }}>
            <CheckCircle style={{ width: '48px', height: '48px', color: 'var(--green-mid)', margin: '0 auto 1rem' }} />
            <h2 style={{ fontFamily: '"DM Serif Display",serif', fontSize: '1.4rem', color: 'var(--navy)', fontWeight: 400, marginBottom: '0.5rem' }}>
              Coverage Offer Submitted
            </h2>
            <p style={{ fontSize: '0.84rem', color: 'var(--ink-muted)', marginBottom: '2rem', lineHeight: 1.6 }}>
              Your coverage offer for <strong>{selected.deal_name}</strong> has been submitted.<br />
              It will be reviewed alongside the lender's term sheet before guarantee issuance.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button onClick={() => setSubmitted(false)} className="btn btn-secondary">Edit Offer</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {error && <div className="callout callout-red">{error}</div>}

            {/* UW context */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.75rem' }}>
              {[
                { label: 'Health', value: uw.health_score ? `${uw.health_score.toFixed(0)}/100` : '—', ok: (uw.health_score || 0) >= 70 },
                { label: 'DSCR', value: uw.dscr_base ? `${uw.dscr_base.toFixed(2)}x` : '—', ok: (uw.dscr_base || 0) >= 1.25 },
                { label: 'Annual PD', value: uw.annual_pd ? `${(uw.annual_pd * 100).toFixed(1)}%` : '—', ok: (uw.annual_pd || 0.1) < 0.05 },
                { label: 'Verdict', value: (uw.verdict || '—').toUpperCase(), ok: uw.verdict === 'buy' },
              ].map(m => (
                <div key={m.label} style={{
                  padding: '0.75rem', borderRadius: '3px', textAlign: 'center',
                  background: m.ok ? 'var(--green-bg)' : 'var(--red-bg)',
                  border: `1px solid ${m.ok ? 'var(--green-border)' : 'var(--red-border)'}`,
                }}>
                  <p style={{ fontSize: '0.63rem', textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--ink-muted)', marginBottom: '0.2rem' }}>{m.label}</p>
                  <p style={{ fontFamily: '"DM Mono",monospace', fontSize: '0.95rem', fontWeight: 500, color: m.ok ? 'var(--green)' : 'var(--red)' }}>{m.value}</p>
                </div>
              ))}
            </div>

            {/* AI suggestion banner */}
            {hasAI && (
              <div style={{ background: 'var(--gold-faint)', border: '1px solid var(--gold-light)', borderRadius: '4px', overflow: 'hidden' }}>
                <button onClick={() => setShowAI(!showAI)}
                  style={{ width: '100%', padding: '0.875rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <Brain style={{ width: '16px', height: '16px', color: 'var(--gold-dark)' }} />
                    <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--gold-dark)' }}>AI-Suggested Coverage Terms</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--gold)', fontFamily: '"DM Mono",monospace' }}>
                      {ai.coverage_pct}% · {ai.annual_premium_rate}% rate · {ai.attachment_point_pct}% attachment
                    </span>
                  </div>
                  {showAI ? <ChevronUp style={{ width: '14px', color: 'var(--gold-dark)' }} /> : <ChevronDown style={{ width: '14px', color: 'var(--gold-dark)' }} />}
                </button>
                {showAI && (
                  <div style={{ padding: '0 1rem 1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      {[
                        { label: 'Coverage %', value: `${ai.coverage_pct}%` },
                        { label: 'Coverage Amount', value: fmt(ai.coverage_amount || 0) },
                        { label: 'Attachment Point', value: `${ai.attachment_point_pct}%` },
                        { label: 'Annual Rate', value: `${ai.annual_premium_rate}%` },
                        { label: 'Policy Term', value: `${ai.policy_term_months}mo` },
                        { label: 'Waiting Period', value: `${ai.waiting_period_days} days` },
                      ].map(f => (
                        <div key={f.label} style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.5)', borderRadius: '3px' }}>
                          <p style={{ fontSize: '0.62rem', color: 'var(--gold-dark)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{f.label}</p>
                          <p style={{ fontFamily: '"DM Mono",monospace', fontSize: '0.82rem', color: 'var(--navy)', fontWeight: 500 }}>{f.value}</p>
                        </div>
                      ))}
                    </div>
                    <button onClick={applyAI} className="btn btn-gold btn-sm">Apply AI Terms</button>
                    <span style={{ fontSize: '0.7rem', color: 'var(--gold)', marginLeft: '0.75rem' }}>You can adjust all fields after applying</span>
                  </div>
                )}
              </div>
            )}

            {/* Main form */}
            <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: '4px', padding: '1.5rem', borderTop: '2px solid var(--gold)', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

              <h3 style={{ fontFamily: '"DM Serif Display",serif', fontSize: '1.1rem', color: 'var(--navy)', fontWeight: 400 }}>
                Coverage Structure — {selected.deal_name}
              </h3>

              {/* Coverage */}
              <div>
                <p style={{ ...lbl, marginBottom: '0.75rem', fontSize: '0.72rem', color: 'var(--navy)' }}>Coverage</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={lbl}>Coverage % of Loan</label>
                    <input style={inp} type="number" step="1" value={form.coverage_pct}
                      onChange={e => handleCoveragePct(e.target.value)} />
                    <p style={{ fontSize: '0.72rem', color: 'var(--ink-faint)', marginTop: '0.25rem' }}>% of loan insured</p>
                  </div>
                  <div>
                    <label style={lbl}>Coverage Amount</label>
                    <input style={inp} type="number" value={form.coverage_amount}
                      onChange={e => setForm(p => ({ ...p, coverage_amount: e.target.value }))} />
                    <p style={{ fontSize: '0.72rem', color: 'var(--ink-faint)', marginTop: '0.25rem' }}>{form.coverage_amount ? fmt(+form.coverage_amount) : '—'}</p>
                  </div>
                  <div>
                    <label style={lbl}>Attachment Point %</label>
                    <input style={inp} type="number" step="1" value={form.attachment_point_pct}
                      onChange={e => setForm(p => ({ ...p, attachment_point_pct: e.target.value }))} />
                    <p style={{ fontSize: '0.72rem', color: 'var(--ink-faint)', marginTop: '0.25rem' }}>First loss retained by lender</p>
                  </div>
                </div>
              </div>

              {/* Premium */}
              <div>
                <p style={{ ...lbl, marginBottom: '0.75rem', fontSize: '0.72rem', color: 'var(--navy)' }}>Premium</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={lbl}>Annual Premium Rate (%)</label>
                    <input style={inp} type="number" step="0.25" value={form.annual_premium_rate}
                      onChange={e => setForm(p => ({ ...p, annual_premium_rate: e.target.value }))} />
                    <p style={{ fontSize: '0.72rem', color: 'var(--ink-faint)', marginTop: '0.25rem' }}>% of coverage per year</p>
                  </div>
                  <div>
                    <label style={lbl}>Payment Frequency</label>
                    <select style={{ ...inp }} value={form.premium_payment}
                      onChange={e => setForm(p => ({ ...p, premium_payment: e.target.value }))}>
                      <option value="annual">Annual</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Policy Term (months)</label>
                    <input style={inp} type="number" value={form.policy_term_months}
                      onChange={e => setForm(p => ({ ...p, policy_term_months: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Premium summary */}
              {annualPremium > 0 && (
                <div style={{ background: 'var(--navy-faint)', border: '1px solid var(--navy-light)', borderRadius: '3px', padding: '1rem' }}>
                  <p style={{ fontSize: '0.63rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-muted)', marginBottom: '0.75rem', fontWeight: 500 }}>Premium Summary</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.75rem' }}>
                    {[
                      { label: 'Annual Premium', value: fmt(annualPremium) },
                      { label: 'Monthly Premium', value: fmt(monthlyPremium) },
                      { label: 'Total over Term', value: fmt(totalPremium) },
                      { label: 'Net Exposure', value: fmt(exposedAmount), sub: `after ${form.attachment_point_pct}% attachment` },
                    ].map(s => (
                      <div key={s.label}>
                        <p style={{ fontSize: '0.62rem', color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</p>
                        <p style={{ fontFamily: '"DM Mono",monospace', fontSize: '1rem', color: 'var(--navy)', fontWeight: 500, marginTop: '0.15rem' }}>{s.value}</p>
                        {s.sub && <p style={{ fontSize: '0.66rem', color: 'var(--ink-faint)' }}>{s.sub}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Policy terms */}
              <div>
                <p style={{ ...lbl, marginBottom: '0.75rem', fontSize: '0.72rem', color: 'var(--navy)' }}>Policy Terms</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={lbl}>Waiting Period (days)</label>
                    <input style={inp} type="number" value={form.waiting_period_days}
                      onChange={e => setForm(p => ({ ...p, waiting_period_days: e.target.value }))} />
                    <p style={{ fontSize: '0.72rem', color: 'var(--ink-faint)', marginTop: '0.25rem' }}>Days before coverage activates</p>
                  </div>
                  <div>
                    <label style={lbl}>Offer Expiry (days)</label>
                    <input style={inp} type="number" value={form.expiry_days}
                      onChange={e => setForm(p => ({ ...p, expiry_days: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.83rem', color: 'var(--ink)' }}>
                    <input type="checkbox" checked={form.sba_eligible} onChange={e => setForm(p => ({ ...p, sba_eligible: e.target.checked }))} style={{ accentColor: 'var(--navy)' }} />
                    SBA 7(a) guarantee required
                  </label>
                </div>
              </div>

              {/* Exclusions */}
              <div>
                <label style={lbl}>Exclusions</label>
                <textarea style={{ ...inp, resize: 'vertical' }} rows={5} value={form.exclusions}
                  onChange={e => setForm(p => ({ ...p, exclusions: e.target.value }))}
                  placeholder="• Intentional misrepresentation or fraud&#10;• Environmental liability pre-dating policy&#10;• Change of ownership without insurer consent" />
              </div>

              {/* Conditions */}
              <div>
                <label style={lbl}>Conditions Precedent</label>
                <textarea style={{ ...inp, resize: 'vertical' }} rows={5} value={form.conditions}
                  onChange={e => setForm(p => ({ ...p, conditions: e.target.value }))}
                  placeholder="• Maintain DSCR ≥ 1.25x annually&#10;• Annual CPA-prepared financials within 120 days&#10;• Notify insurer within 30 days of material adverse change" />
              </div>

              {/* Notes */}
              <div>
                <label style={lbl}>Internal Notes (not shared)</label>
                <input style={inp} value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Underwriting committee comments, risk notes, etc." />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                <button onClick={saveTermSheet} disabled={saving || !form.coverage_amount} className="btn btn-secondary">
                  {saving ? 'Saving...' : saved ? <><CheckCircle style={{ width: '14px' }} /> Saved</> : <><Save style={{ width: '14px' }} /> Save Draft</>}
                </button>
                <button onClick={submitTermSheet} disabled={submitting || !form.coverage_amount} className="btn btn-primary" style={{ flex: 1 }}>
                  {submitting ? 'Submitting...' : <><Send style={{ width: '14px' }} /> Submit Coverage Offer</>}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}