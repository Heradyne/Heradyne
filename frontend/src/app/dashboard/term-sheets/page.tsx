'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, ArrowRight, Save, Send, Brain, AlertTriangle, ChevronDown, ChevronUp, Edit3 } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const fmtPct = (n: number) => `${n.toFixed(2)}%`;

export default function TermSheetsPage() {
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
    loan_amount: '',
    interest_rate: '10.75',
    term_months: '120',
    sba_loan: true,
    sba_guarantee_pct: '75',
    origination_fee_pct: '2.0',
    prepayment_penalty: true,
    covenants: '',
    conditions: '',
    expiry_days: '30',
    notes: '',
  });

  useEffect(() => { loadMatches(); }, []);

  const loadMatches = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/v1/origination/term-sheets/accepted-matches`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMatches(data);
      }
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  const selectMatch = (match: any) => {
    setSelected(match);
    setSubmitted(match.term_sheet_status === 'submitted_to_origination');
    setSaved(false);
    setError('');

    // Pre-fill from existing term sheet or AI suggestion
    const source = match.term_sheet || match.ai_suggested || {};
    setForm({
      loan_amount: (source.loan_amount || match.loan_amount_requested || '').toString(),
      interest_rate: (source.interest_rate || 10.75).toString(),
      term_months: (source.term_months || 120).toString(),
      sba_loan: source.sba_loan !== undefined ? source.sba_loan : true,
      sba_guarantee_pct: (source.sba_guarantee_pct || 75).toString(),
      origination_fee_pct: (source.origination_fee_pct || 2.0).toString(),
      prepayment_penalty: source.prepayment_penalty !== undefined ? source.prepayment_penalty : true,
      covenants: source.covenants || '',
      conditions: source.conditions || '',
      expiry_days: (source.expiry_days || 30).toString(),
      notes: source.notes || '',
    });
  };

  const applyAISuggestion = () => {
    if (!selected?.ai_suggested) return;
    const s = selected.ai_suggested;
    setForm(prev => ({
      ...prev,
      loan_amount: (s.loan_amount || prev.loan_amount).toString(),
      interest_rate: (s.interest_rate || prev.interest_rate).toString(),
      term_months: (s.term_months || prev.term_months).toString(),
      sba_loan: s.sba_loan !== undefined ? s.sba_loan : prev.sba_loan,
      covenants: s.covenants || prev.covenants,
      conditions: s.conditions || prev.conditions,
    }));
    setShowAI(false);
  };

  const saveTermSheet = async () => {
    if (!selected) return;
    setSaving(true); setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/v1/origination/term-sheets/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          match_id: selected.match_id,
          deal_id: selected.deal_id,
          loan_amount: parseFloat(form.loan_amount),
          interest_rate: parseFloat(form.interest_rate),
          term_months: parseInt(form.term_months),
          sba_loan: form.sba_loan,
          sba_guarantee_pct: parseFloat(form.sba_guarantee_pct),
          origination_fee_pct: parseFloat(form.origination_fee_pct),
          prepayment_penalty: form.prepayment_penalty,
          covenants: form.covenants,
          conditions: form.conditions,
          expiry_days: parseInt(form.expiry_days),
          notes: form.notes,
        }),
      });
      if (!res.ok) { const e = await res.json(); setError(e.detail || 'Save failed'); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      await loadMatches();
    } catch(e) { setError('Connection error'); }
    finally { setSaving(false); }
  };

  const submitToOrigination = async () => {
    if (!selected) return;
    setSubmitting(true); setError('');
    try {
      const token = localStorage.getItem('token');
      // Save first to ensure latest terms are stored
      await saveTermSheet();
      const res = await fetch(`${API}/api/v1/origination/term-sheets/${selected.match_id}/submit-to-origination`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const e = await res.json(); setError(e.detail || 'Submit failed'); return; }
      setSubmitted(true);
      await loadMatches();
    } catch(e) { setError('Connection error'); }
    finally { setSubmitting(false); }
  };

  // Live payment calc
  const calcPayment = () => {
    const P = parseFloat(form.loan_amount) || 0;
    const r = parseFloat(form.interest_rate) / 100 / 12;
    const n = parseInt(form.term_months) || 120;
    if (!P || !r) return { monthly: 0, annual: 0, totalCost: 0 };
    const pmt = P * r * Math.pow(1+r,n) / (Math.pow(1+r,n)-1);
    return { monthly: pmt, annual: pmt*12, totalCost: pmt*n };
  };

  const pmt = calcPayment();
  const originationFee = (parseFloat(form.loan_amount)||0) * (parseFloat(form.origination_fee_pct)||0) / 100;

  const inputClass: React.CSSProperties = {
    width:'100%', padding:'0.55rem 0.875rem', border:'1.5px solid var(--border-mid)',
    borderRadius:'3px', fontSize:'0.85rem', fontFamily:'"DM Sans",sans-serif',
    color:'var(--ink)', background:'var(--surface-card)',
  };
  const labelStyle: React.CSSProperties = {
    display:'block', fontSize:'0.67rem', fontWeight:500, letterSpacing:'0.12em',
    textTransform:'uppercase', color:'var(--ink-muted)', marginBottom:'0.35rem',
    fontFamily:'"DM Sans",sans-serif',
  };

  const uw = selected?.uw || {};
  const ai = selected?.ai_suggested || {};
  const hasAI = Object.keys(ai).length > 0;

  return (
    <div style={{maxWidth:'1100px',margin:'0 auto'}}>

      {/* Header */}
      <div style={{marginBottom:'2rem',paddingBottom:'1.5rem',borderBottom:'1px solid var(--border)'}}>
        <p style={{fontSize:'0.67rem',fontWeight:500,letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--gold)',fontFamily:'"DM Sans",sans-serif',marginBottom:'0.3rem'}}>
          Lender Workflow
        </p>
        <h1 style={{fontFamily:'"DM Serif Display",serif',fontSize:'1.8rem',color:'var(--navy)',fontWeight:400,marginBottom:'0.25rem'}}>
          Term Sheet Builder
        </h1>
        <p style={{fontSize:'0.84rem',color:'var(--ink-muted)',fontWeight:300}}>
          Accepted deals → Review AI-suggested terms → Adjust → Submit to Origination
        </p>
      </div>

      {/* Workflow steps indicator */}
      <div style={{display:'flex',alignItems:'center',gap:'0',marginBottom:'2rem',background:'var(--surface-card)',border:'1px solid var(--border)',borderRadius:'4px',overflow:'hidden'}}>
        {[
          {n:'1', label:'Deal Accepted', done:true},
          {n:'2', label:'Build Term Sheet', done:selected && !submitted, active:!!selected && !submitted},
          {n:'3', label:'Submit to Origination', done:submitted},
          {n:'4', label:'Final Review & Sign', done:false},
        ].map((step, i, arr) => (
          <div key={step.n} style={{
            flex:1, padding:'0.875rem 1rem', display:'flex', alignItems:'center', gap:'0.6rem',
            background: step.done ? 'var(--navy)' : step.active ? 'var(--gold-faint)' : 'transparent',
            borderRight: i < arr.length-1 ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{
              width:'22px', height:'22px', borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
              background: step.done ? 'var(--accent)' : step.active ? 'var(--gold)' : 'var(--border-mid)',
              fontSize:'0.65rem', fontWeight:600, color: step.done||step.active ? '#fff' : 'var(--ink-muted)',
            }}>{step.done ? '✓' : step.n}</div>
            <span style={{fontSize:'0.75rem',fontWeight:500,color:step.done?'rgba(255,255,255,0.9)':step.active?'var(--gold-dark)':'var(--ink-faint)'}}>
              {step.label}
            </span>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'280px 1fr',gap:'1.5rem',alignItems:'start'}}>

        {/* Deal selector */}
        <div>
          <p style={{...labelStyle,marginBottom:'0.75rem'}}>Accepted Deals</p>
          {loading && <p style={{fontSize:'0.83rem',color:'var(--ink-faint)'}}>Loading...</p>}
          {!loading && matches.length === 0 && (
            <div style={{padding:'1.5rem',background:'var(--surface-card)',border:'1px dashed var(--border-mid)',borderRadius:'4px',textAlign:'center'}}>
              <p style={{fontSize:'0.82rem',color:'var(--ink-faint)',marginBottom:'0.5rem'}}>No accepted deals yet</p>
              <p style={{fontSize:'0.75rem',color:'var(--ink-faint)'}}>Accept deals in Matched Deals first</p>
              <button onClick={()=>router.push('/dashboard/matches')} className="btn btn-outline btn-sm" style={{marginTop:'0.75rem'}}>
                Go to Matches
              </button>
            </div>
          )}
          <div style={{display:'flex',flexDirection:'column',gap:'0.5rem'}}>
            {matches.map(match => {
              const tsStatus = match.term_sheet_status;
              const isActive = selected?.match_id === match.match_id;
              return (
                <div key={match.match_id} onClick={() => selectMatch(match)}
                  style={{
                    padding:'0.875rem 1rem', borderRadius:'4px', cursor:'pointer',
                    border:`1.5px solid ${isActive?'var(--navy)':'var(--border)'}`,
                    background: isActive ? 'var(--navy-faint)' : 'var(--surface-card)',
                    transition:'all 0.15s',
                  }}>
                  <p style={{fontSize:'0.83rem',fontWeight:500,color:'var(--ink)',marginBottom:'0.25rem',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                    {match.deal_name}
                  </p>
                  <p style={{fontSize:'0.72rem',color:'var(--ink-faint)',marginBottom:'0.4rem',textTransform:'capitalize'}}>
                    {match.industry} · {fmt(match.loan_amount_requested||0)}
                  </p>
                  <span style={{
                    fontSize:'0.62rem',fontWeight:500,letterSpacing:'0.07em',textTransform:'uppercase',
                    padding:'2px 7px',borderRadius:'2px',
                    background: tsStatus==='submitted_to_origination' ? 'var(--green-bg)' : tsStatus==='draft' ? 'var(--gold-faint)' : 'var(--navy-light)',
                    color: tsStatus==='submitted_to_origination' ? 'var(--green)' : tsStatus==='draft' ? 'var(--gold-dark)' : 'var(--navy)',
                    border: `1px solid ${tsStatus==='submitted_to_origination'?'var(--green-border)':tsStatus==='draft'?'var(--gold-light)':'var(--navy-light)'}`,
                  }}>
                    {tsStatus==='submitted_to_origination' ? 'In Origination' : tsStatus==='draft' ? 'Draft' : 'No Term Sheet'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Term sheet form */}
        {!selected ? (
          <div style={{padding:'4rem',background:'var(--surface-card)',border:'1px dashed var(--border-mid)',borderRadius:'4px',textAlign:'center'}}>
            <Edit3 style={{width:'32px',height:'32px',margin:'0 auto 1rem',color:'var(--border-strong)'}}/>
            <p style={{fontSize:'0.9rem',color:'var(--ink-muted)'}}>Select an accepted deal to build a term sheet</p>
          </div>
        ) : submitted ? (
          <div style={{padding:'3rem',background:'var(--surface-card)',border:'1px solid var(--border)',borderRadius:'4px',textAlign:'center'}}>
            <CheckCircle style={{width:'48px',height:'48px',margin:'0 auto 1rem',color:'var(--green-mid)'}}/>
            <h2 style={{fontFamily:'"DM Serif Display",serif',fontSize:'1.4rem',color:'var(--navy)',fontWeight:400,marginBottom:'0.5rem'}}>
              Submitted to Origination
            </h2>
            <p style={{fontSize:'0.84rem',color:'var(--ink-muted)',marginBottom:'2rem'}}>
              The term sheet for <strong>{selected.deal_name}</strong> is in the origination queue for final review and signature.
            </p>
            <div style={{display:'flex',gap:'0.75rem',justifyContent:'center'}}>
              <button onClick={()=>router.push('/dashboard/origination')} className="btn btn-primary">
                Go to Origination <ArrowRight style={{width:'14px',height:'14px'}}/>
              </button>
              <button onClick={()=>{setSubmitted(false);setSaved(false);}} className="btn btn-secondary">
                Edit Terms
              </button>
            </div>
          </div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>

            {error && (
              <div className="callout callout-red">{error}</div>
            )}

            {/* Deal context bar */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'0.75rem'}}>
              {[
                {label:'Health Score', value:uw.health_score?`${uw.health_score.toFixed(0)}/100`:'N/A', ok:(uw.health_score||0)>=70},
                {label:'DSCR', value:uw.dscr_base?`${uw.dscr_base.toFixed(2)}x`:'N/A', ok:(uw.dscr_base||0)>=1.25},
                {label:'SBA Eligible', value:uw.sba_eligible?'Yes':'No', ok:uw.sba_eligible},
                {label:'Verdict', value:(uw.verdict||'—').toUpperCase(), ok:uw.verdict==='buy'},
              ].map(m=>(
                <div key={m.label} style={{
                  padding:'0.75rem',borderRadius:'3px',textAlign:'center',
                  background:m.ok?'var(--green-bg)':'var(--red-bg)',
                  border:`1px solid ${m.ok?'var(--green-border)':'var(--red-border)'}`,
                }}>
                  <p style={{fontSize:'0.63rem',textTransform:'uppercase',letterSpacing:'0.09em',color:'var(--ink-muted)',marginBottom:'0.2rem'}}>{m.label}</p>
                  <p style={{fontFamily:'"DM Mono",monospace',fontSize:'0.95rem',fontWeight:500,color:m.ok?'var(--green)':'var(--red)'}}>{m.value}</p>
                </div>
              ))}
            </div>

            {/* AI suggestion banner */}
            {hasAI && (
              <div style={{background:'var(--gold-faint)',border:'1px solid var(--gold-light)',borderRadius:'4px',overflow:'hidden'}}>
                <button onClick={()=>setShowAI(!showAI)}
                  style={{width:'100%',padding:'0.875rem 1rem',display:'flex',alignItems:'center',justifyContent:'space-between',background:'none',border:'none',cursor:'pointer',fontFamily:'"DM Sans",sans-serif'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'0.6rem'}}>
                    <Brain style={{width:'16px',height:'16px',color:'var(--gold-dark)'}}/>
                    <span style={{fontSize:'0.82rem',fontWeight:500,color:'var(--gold-dark)'}}>AI-Suggested Terms</span>
                    <span style={{fontSize:'0.7rem',color:'var(--gold)',fontFamily:'"DM Mono",monospace'}}>
                      {fmt(ai.loan_amount||0)} · {ai.interest_rate}% · {ai.term_months}mo
                    </span>
                  </div>
                  {showAI ? <ChevronUp style={{width:'14px',color:'var(--gold-dark)'}}/> : <ChevronDown style={{width:'14px',color:'var(--gold-dark)'}}/>}
                </button>
                {showAI && (
                  <div style={{padding:'0 1rem 1rem'}}>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'0.5rem',marginBottom:'0.75rem'}}>
                      {[
                        {label:'Loan Amount', value:fmt(ai.loan_amount||0)},
                        {label:'Interest Rate', value:`${ai.interest_rate}%`},
                        {label:'Term', value:`${ai.term_months} months`},
                        {label:'SBA Loan', value:ai.sba_loan?'Yes':'No'},
                        {label:'Guarantee', value:`${ai.sba_guarantee_pct}%`},
                        {label:'Orig. Fee', value:`${ai.origination_fee_pct}%`},
                      ].map(f=>(
                        <div key={f.label} style={{padding:'0.5rem',background:'rgba(255,255,255,0.5)',borderRadius:'3px'}}>
                          <p style={{fontSize:'0.62rem',color:'var(--gold-dark)',textTransform:'uppercase',letterSpacing:'0.08em'}}>{f.label}</p>
                          <p style={{fontFamily:'"DM Mono",monospace',fontSize:'0.82rem',color:'var(--navy)',fontWeight:500}}>{f.value}</p>
                        </div>
                      ))}
                    </div>
                    {ai.covenants && <p style={{fontSize:'0.76rem',color:'var(--gold-dark)',marginBottom:'0.75rem',lineHeight:1.5}}>{ai.covenants}</p>}
                    <button onClick={applyAISuggestion} className="btn btn-gold btn-sm">
                      Apply AI Terms to Form
                    </button>
                    <span style={{fontSize:'0.7rem',color:'var(--gold)',marginLeft:'0.75rem'}}>You can adjust all fields after applying</span>
                  </div>
                )}
              </div>
            )}

            {/* Main form */}
            <div style={{background:'var(--surface-card)',border:'1px solid var(--border)',borderRadius:'4px',padding:'1.5rem',display:'flex',flexDirection:'column',gap:'1.25rem'}}>
              <div style={{borderTop:'2px solid var(--gold)',marginTop:'-1.5rem',marginLeft:'-1.5rem',marginRight:'-1.5rem',marginBottom:'0.5rem'}}/>

              <h3 style={{fontFamily:'"DM Serif Display",serif',fontSize:'1.1rem',color:'var(--navy)',fontWeight:400}}>
                Loan Terms — {selected.deal_name}
              </h3>

              {/* Loan structure */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem'}}>
                <div>
                  <label style={labelStyle}>Loan Amount *</label>
                  <input style={inputClass} type="number" value={form.loan_amount} onChange={e=>setForm(p=>({...p,loan_amount:e.target.value}))}/>
                  <p style={{fontSize:'0.72rem',color:'var(--ink-faint)',marginTop:'0.25rem'}}>{form.loan_amount?fmt(+form.loan_amount):'—'}</p>
                </div>
                <div>
                  <label style={labelStyle}>Interest Rate (%)</label>
                  <input style={inputClass} type="number" step="0.25" value={form.interest_rate} onChange={e=>setForm(p=>({...p,interest_rate:e.target.value}))}/>
                  <p style={{fontSize:'0.72rem',color:'var(--ink-faint)',marginTop:'0.25rem'}}>Current SBA prime + spread</p>
                </div>
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'1rem'}}>
                <div>
                  <label style={labelStyle}>Term (months)</label>
                  <input style={inputClass} type="number" value={form.term_months} onChange={e=>setForm(p=>({...p,term_months:e.target.value}))}/>
                </div>
                <div>
                  <label style={labelStyle}>SBA Guarantee (%)</label>
                  <input style={inputClass} type="number" value={form.sba_guarantee_pct} onChange={e=>setForm(p=>({...p,sba_guarantee_pct:e.target.value}))}/>
                </div>
                <div>
                  <label style={labelStyle}>Origination Fee (%)</label>
                  <input style={inputClass} type="number" step="0.25" value={form.origination_fee_pct} onChange={e=>setForm(p=>({...p,origination_fee_pct:e.target.value}))}/>
                </div>
              </div>

              <div style={{display:'flex',gap:'2rem'}}>
                <label style={{display:'flex',alignItems:'center',gap:'0.5rem',cursor:'pointer',fontSize:'0.83rem',color:'var(--ink)'}}>
                  <input type="checkbox" checked={form.sba_loan} onChange={e=>setForm(p=>({...p,sba_loan:e.target.checked}))} style={{accentColor:'var(--navy)'}}/>
                  SBA 7(a) loan
                </label>
                <label style={{display:'flex',alignItems:'center',gap:'0.5rem',cursor:'pointer',fontSize:'0.83rem',color:'var(--ink)'}}>
                  <input type="checkbox" checked={form.prepayment_penalty} onChange={e=>setForm(p=>({...p,prepayment_penalty:e.target.checked}))} style={{accentColor:'var(--navy)'}}/>
                  Prepayment penalty
                </label>
              </div>

              {/* Payment calc */}
              {pmt.monthly > 0 && (
                <div style={{background:'var(--navy-faint)',border:'1px solid var(--navy-light)',borderRadius:'3px',padding:'1rem'}}>
                  <p style={{fontSize:'0.63rem',textTransform:'uppercase',letterSpacing:'0.1em',color:'var(--ink-muted)',marginBottom:'0.75rem',fontWeight:500}}>Payment Summary</p>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'0.75rem'}}>
                    {[
                      {label:'Monthly P&I', value:fmt(pmt.monthly)},
                      {label:'Annual P&I', value:fmt(pmt.annual)},
                      {label:'Total Cost', value:fmt(pmt.totalCost)},
                      {label:'Origination Fee', value:fmt(originationFee)},
                    ].map(s=>(
                      <div key={s.label}>
                        <p style={{fontSize:'0.62rem',color:'var(--ink-faint)',textTransform:'uppercase',letterSpacing:'0.08em'}}>{s.label}</p>
                        <p style={{fontFamily:'"DM Mono",monospace',fontSize:'1rem',color:'var(--navy)',fontWeight:500,marginTop:'0.15rem'}}>{s.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Covenants */}
              <div>
                <label style={labelStyle}>Covenants</label>
                <textarea style={{...inputClass,resize:'vertical'}} rows={4} value={form.covenants}
                  onChange={e=>setForm(p=>({...p,covenants:e.target.value}))}
                  placeholder="Maintain DSCR ≥ 1.25x quarterly. Provide annual CPA-prepared financials..."/>
              </div>

              {/* Conditions */}
              <div>
                <label style={labelStyle}>Conditions Precedent</label>
                <textarea style={{...inputClass,resize:'vertical'}} rows={3} value={form.conditions}
                  onChange={e=>setForm(p=>({...p,conditions:e.target.value}))}
                  placeholder="Subject to satisfactory appraisal and environmental review..."/>
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:'1rem'}}>
                <div>
                  <label style={labelStyle}>Offer Expiry (days)</label>
                  <input style={{...inputClass}} type="number" value={form.expiry_days}
                    onChange={e=>setForm(p=>({...p,expiry_days:e.target.value}))}/>
                </div>
                <div>
                  <label style={labelStyle}>Internal Notes (not shown to borrower)</label>
                  <input style={inputClass} value={form.notes}
                    onChange={e=>setForm(p=>({...p,notes:e.target.value}))}
                    placeholder="Credit committee comments, conditions, etc."/>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{display:'flex',gap:'0.75rem',paddingTop:'0.5rem',borderTop:'1px solid var(--border)'}}>
                <button onClick={saveTermSheet} disabled={saving||!form.loan_amount} className="btn btn-secondary">
                  {saving ? 'Saving...' : saved ? <><CheckCircle style={{width:'14px'}}/> Saved</> : <><Save style={{width:'14px'}}/> Save Draft</>}
                </button>
                <button onClick={submitToOrigination} disabled={submitting||!form.loan_amount} className="btn btn-primary" style={{flex:1}}>
                  {submitting ? 'Submitting...' : <><Send style={{width:'14px',height:'14px'}}/> Submit to Origination</>}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}