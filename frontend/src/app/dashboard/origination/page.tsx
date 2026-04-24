'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileCheck, Send, CheckCircle, ArrowRight, FileText, Shield, DollarSign, Loader, Clock } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const fmt = (n: number) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);

const CHECKLIST = [
  'Signed Letter of Intent / Purchase Agreement',
  'SBA Form 1919 — Borrower Information Form',
  'SBA Form 413 — Personal Financial Statement',
  '3 years business tax returns',
  '3 years personal tax returns',
  'YTD profit & loss statement (within 90 days)',
  'Current balance sheet',
  'Business debt schedule',
  'Evidence of equity injection (bank statements)',
  'Environmental questionnaire (if real estate)',
  'Business valuation / appraisal',
  'Franchise agreement (if applicable)',
];

export default function OriginationPage() {
  const router = useRouter();
  const [queue, setQueue] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [checkedItems, setCheckedItems] = useState<Record<string,boolean[]>>({});
  const [originating, setOriginating] = useState(false);
  const [sendingSig, setSendingSig] = useState(false);
  const [originated, setOriginated] = useState<Record<string,boolean>>({});
  const [sigSent, setSigSent] = useState<Record<string,boolean>>({});
  const [activeTab, setActiveTab] = useState<'queue'|'loans'>('queue');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const token = localStorage.getItem('token');
      const h = { Authorization: `Bearer ${token}` };
      const [qRes, lRes] = await Promise.all([
        fetch(`${API}/api/v1/origination/origination-queue`, { headers: h }),
        fetch(`${API}/api/v1/origination/my-originated-loans`, { headers: h }).catch(()=>null),
      ]);
      if (qRes.ok) setQueue(await qRes.json());
      if (lRes?.ok) setLoans(await lRes.json());
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  const toggleCheck = (dealKey: string, idx: number) => {
    setCheckedItems(prev => {
      const list = prev[dealKey] || Array(CHECKLIST.length).fill(false);
      const next = [...list];
      next[idx] = !next[idx];
      return { ...prev, [dealKey]: next };
    });
  };

  const checkCount = (dealKey: string) => (checkedItems[dealKey] || []).filter(Boolean).length;
  const allChecked = (dealKey: string) => checkCount(dealKey) === CHECKLIST.length;

  const originateLoan = async (item: any) => {
    setOriginating(true);
    try {
      const token = localStorage.getItem('token');
      const ts = item.term_sheet;
      const res = await fetch(`${API}/api/v1/origination/originate-loan`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body: JSON.stringify({
          match_id: item.match_id,
          loan_amount: ts.loan_amount,
          interest_rate: ts.interest_rate,
          term_months: ts.term_months,
          sba_loan: ts.sba_loan,
        }),
      });
      if (res.ok) {
        setOriginated(p => ({...p, [item.match_id]: true}));
        await loadData();
      }
    } catch(e) { console.error(e); }
    finally { setOriginating(false); }
  };

  const sendForSignature = async (item: any) => {
    setSendingSig(true);
    // Simulate sending — in production this would call DocuSign/HelloSign
    await new Promise(r => setTimeout(r, 1500));
    setSigSent(p => ({...p, [item.match_id]: true}));
    setSendingSig(false);
  };

  const labelStyle: React.CSSProperties = {
    fontSize:'0.67rem',fontWeight:500,letterSpacing:'0.12em',textTransform:'uppercase',
    color:'var(--ink-muted)',marginBottom:'0.35rem',fontFamily:'"DM Sans",sans-serif',display:'block',
  };

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh'}}>
      <Loader style={{width:'28px',color:'var(--gold)',animation:'spin 0.8s linear infinite'}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{maxWidth:'1100px',margin:'0 auto'}}>

      {/* Header */}
      <div style={{marginBottom:'2rem',paddingBottom:'1.5rem',borderBottom:'1px solid var(--border)'}}>
        <p style={{fontSize:'0.67rem',fontWeight:500,letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--gold)',fontFamily:'"DM Sans",sans-serif',marginBottom:'0.3rem'}}>
          Lender Workflow
        </p>
        <h1 style={{fontFamily:'"DM Serif Display",serif',fontSize:'1.8rem',color:'var(--navy)',fontWeight:400,marginBottom:'0.25rem'}}>
          Origination
        </h1>
        <p style={{fontSize:'0.84rem',color:'var(--ink-muted)',fontWeight:300}}>
          Final document review, compliance checklist, and signature dispatch.
        </p>
      </div>

      {/* Tab bar */}
      <div style={{display:'flex',gap:'0',marginBottom:'1.5rem',borderBottom:'2px solid var(--border)'}}>
        {(['queue','loans'] as const).map(tab => (
          <button key={tab} onClick={()=>setActiveTab(tab)}
            style={{
              padding:'0.65rem 1.5rem',border:'none',background:'none',cursor:'pointer',
              fontSize:'0.82rem',fontWeight:500,fontFamily:'"DM Sans",sans-serif',
              color: activeTab===tab ? 'var(--navy)' : 'var(--ink-muted)',
              borderBottom: activeTab===tab ? '2px solid var(--navy)' : '2px solid transparent',
              marginBottom:'-2px',transition:'color 0.15s',
            }}>
            {tab==='queue' ? `Origination Queue (${queue.length})` : `Originated Loans (${loans.length})`}
          </button>
        ))}
      </div>

      {/* Origination queue */}
      {activeTab==='queue' && (
        <div>
          {queue.length === 0 ? (
            <div style={{padding:'4rem',textAlign:'center',background:'var(--surface-card)',border:'1px dashed var(--border-mid)',borderRadius:'4px'}}>
              <FileCheck style={{width:'36px',height:'36px',color:'var(--border-strong)',margin:'0 auto 1rem'}}/>
              <p style={{fontSize:'0.9rem',color:'var(--ink-muted)',marginBottom:'0.5rem'}}>No deals in origination queue</p>
              <p style={{fontSize:'0.8rem',color:'var(--ink-faint)',marginBottom:'1.25rem'}}>
                Accept deals and build term sheets first
              </p>
              <button onClick={()=>router.push('/dashboard/term-sheets')} className="btn btn-primary btn-sm">
                Go to Term Sheets <ArrowRight style={{width:'13px'}}/>
              </button>
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:'1.25rem'}}>
              {(queue || []).map(item => {
                const ts = item.term_sheet || {};
                const dealKey = `${item.match_id}`;
                const checked = checkCount(dealKey);
                const complete = allChecked(dealKey);
                const hasOriginated = originated[item.match_id];
                const hasSig = sigSent[item.match_id];

                // Monthly payment
                const P = ts.loan_amount||0;
                const r = (ts.interest_rate||10.75)/100/12;
                const n = ts.term_months||120;
                const pmt = r > 0 ? P*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1) : P/n;

                return (
                  <div key={item.match_id} style={{background:'var(--surface-card)',border:'1px solid var(--border)',borderRadius:'4px',overflow:'hidden',borderTop:'2px solid var(--gold)'}}>

                    {/* Deal header */}
                    <div style={{padding:'1.5rem',display:'grid',gridTemplateColumns:'1fr auto',gap:'1rem',alignItems:'start'}}>
                      <div>
                        <h2 style={{fontFamily:'"DM Serif Display",serif',fontSize:'1.2rem',color:'var(--navy)',fontWeight:400,marginBottom:'0.25rem'}}>
                          {item.deal_name}
                        </h2>
                        <p style={{fontSize:'0.78rem',color:'var(--ink-faint)',textTransform:'capitalize'}}>
                          {item.industry} · Submitted {item.submitted_at ? new Date(item.submitted_at).toLocaleDateString() : 'recently'}
                        </p>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:'0.5rem'}}>
                        <span style={{
                          fontSize:'0.62rem',fontWeight:500,letterSpacing:'0.07em',textTransform:'uppercase',
                          padding:'3px 9px',borderRadius:'2px',
                          background: complete ? 'var(--green-bg)' : 'var(--yellow-bg)',
                          color: complete ? 'var(--green)' : 'var(--yellow)',
                          border: `1px solid ${complete?'var(--green-border)':'var(--yellow-border)'}`,
                        }}>
                          {complete ? 'Ready to Originate' : `${checked}/${CHECKLIST.length} docs`}
                        </span>
                      </div>
                    </div>

                    {/* Term sheet summary */}
                    <div style={{padding:'0 1.5rem 1.5rem',display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'0.75rem',borderBottom:'1px solid var(--border)'}}>
                      {[
                        {label:'Loan Amount', value:fmt(ts.loan_amount||0)},
                        {label:'Interest Rate', value:`${ts.interest_rate||0}%`},
                        {label:'Term', value:`${ts.term_months||0} months`},
                        {label:'Monthly P&I', value:fmt(pmt)},
                        {label:'SBA Guarantee', value:`${ts.sba_guarantee_pct||0}%`},
                      ].map(s=>(
                        <div key={s.label} style={{padding:'0.625rem',background:'var(--surface)',borderRadius:'3px',border:'1px solid var(--border)'}}>
                          <p style={{fontSize:'0.62rem',color:'var(--ink-faint)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:'0.2rem'}}>{s.label}</p>
                          <p style={{fontFamily:'"DM Mono",monospace',fontSize:'0.88rem',color:'var(--navy)',fontWeight:500}}>{s.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Two columns: checklist + covenants */}
                    <div style={{padding:'1.5rem',display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1.5rem'}}>

                      {/* Document checklist */}
                      <div>
                        <label style={labelStyle}>Pre-Closing Document Checklist</label>
                        <div style={{display:'flex',flexDirection:'column',gap:'0.375rem'}}>
                          {CHECKLIST.map((doc, idx) => {
                            const done = (checkedItems[dealKey]||[])[idx];
                            return (
                              <label key={idx} style={{display:'flex',alignItems:'center',gap:'0.6rem',cursor:'pointer',padding:'0.375rem 0.5rem',borderRadius:'3px',background:done?'var(--green-bg)':'transparent',transition:'background 0.12s'}}>
                                <input type="checkbox" checked={!!done} onChange={()=>toggleCheck(dealKey,idx)} style={{accentColor:'var(--green-mid)',width:'14px',height:'14px',flexShrink:0}}/>
                                <span style={{fontSize:'0.78rem',color:done?'var(--green)':'var(--ink-muted)',lineHeight:1.4,textDecoration:done?'line-through':'none'}}>
                                  {doc}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        <div style={{marginTop:'0.75rem',height:'4px',background:'var(--surface-alt)',borderRadius:'99px',overflow:'hidden'}}>
                          <div style={{height:'100%',borderRadius:'99px',background:complete?'var(--green-mid)':'var(--gold)',width:`${(checked/CHECKLIST.length)*100}%`,transition:'width 0.3s'}}/>
                        </div>
                        <p style={{fontSize:'0.7rem',color:'var(--ink-faint)',marginTop:'0.35rem'}}>{checked} of {CHECKLIST.length} documents confirmed</p>
                      </div>

                      {/* Covenants + actions */}
                      <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
                        {ts.covenants && (
                          <div>
                            <label style={labelStyle}>Covenants</label>
                            <div style={{padding:'0.75rem',background:'var(--navy-faint)',border:'1px solid var(--navy-light)',borderRadius:'3px',fontSize:'0.78rem',color:'var(--navy-mid)',lineHeight:1.6,whiteSpace:'pre-line'}}>
                              {ts.covenants}
                            </div>
                          </div>
                        )}
                        {ts.conditions && (
                          <div>
                            <label style={labelStyle}>Conditions Precedent</label>
                            <div style={{padding:'0.75rem',background:'var(--gold-faint)',border:'1px solid var(--gold-light)',borderRadius:'3px',fontSize:'0.78rem',color:'var(--gold-dark)',lineHeight:1.6,whiteSpace:'pre-line'}}>
                              {ts.conditions}
                            </div>
                          </div>
                        )}

                        {/* UW scores */}
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.5rem'}}>
                          {[
                            {label:'Health Score',value:item.uw?.health_score?`${item.uw.health_score.toFixed(0)}/100`:'—',ok:(item.uw?.health_score||0)>=70},
                            {label:'DSCR',value:item.uw?.dscr_base?`${item.uw.dscr_base.toFixed(2)}x`:'—',ok:(item.uw?.dscr_base||0)>=1.25},
                          ].map(m=>(
                            <div key={m.label} style={{padding:'0.5rem',borderRadius:'3px',textAlign:'center',background:m.ok?'var(--green-bg)':'var(--red-bg)',border:`1px solid ${m.ok?'var(--green-border)':'var(--red-border)'}`}}>
                              <p style={{fontSize:'0.6rem',color:'var(--ink-muted)',textTransform:'uppercase',letterSpacing:'0.08em'}}>{m.label}</p>
                              <p style={{fontFamily:'"DM Mono",monospace',fontSize:'0.9rem',fontWeight:500,color:m.ok?'var(--green)':'var(--red)'}}>{m.value}</p>
                            </div>
                          ))}
                        </div>

                        {/* Action buttons */}
                        <div style={{display:'flex',flexDirection:'column',gap:'0.625rem',marginTop:'auto',paddingTop:'0.5rem'}}>
                          {hasSig ? (
                            <div className="callout callout-green" style={{textAlign:'center'}}>
                              <CheckCircle style={{width:'16px',display:'inline',marginRight:'6px'}}/>
                              Signature request sent to borrower
                            </div>
                          ) : (
                            <button
                              onClick={() => sendForSignature(item)}
                              disabled={!complete || sendingSig}
                              className="btn btn-gold"
                              style={{width:'100%',justifyContent:'center',opacity:complete?1:0.5}}>
                              {sendingSig ? 'Sending...' : <><Send style={{width:'14px'}}/> Send for Signature</>}
                            </button>
                          )}
                          {!complete && (
                            <p style={{fontSize:'0.72rem',color:'var(--ink-faint)',textAlign:'center'}}>
                              Complete all {CHECKLIST.length} checklist items to unlock
                            </p>
                          )}
                          {hasOriginated ? (
                            <div className="callout callout-green" style={{textAlign:'center'}}>
                              <CheckCircle style={{width:'16px',display:'inline',marginRight:'6px'}}/>
                              Loan originated successfully
                            </div>
                          ) : (
                            <button
                              onClick={() => originateLoan(item)}
                              disabled={!complete || originating || !hasSig}
                              className="btn btn-primary"
                              style={{width:'100%',justifyContent:'center',opacity:(complete&&hasSig)?1:0.5}}>
                              {originating ? 'Originating...' : <><FileCheck style={{width:'14px'}}/> Originate Loan</>}
                            </button>
                          )}
                          {complete && !hasSig && (
                            <p style={{fontSize:'0.72rem',color:'var(--ink-faint)',textAlign:'center'}}>
                              Send for signature first to enable origination
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Edit terms link */}
                    <div style={{padding:'0.75rem 1.5rem',background:'var(--surface)',borderTop:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <button onClick={()=>router.push('/dashboard/term-sheets')} className="btn btn-ghost btn-sm">
                        ← Edit Term Sheet
                      </button>
                      {ts.notes && (
                        <p style={{fontSize:'0.75rem',color:'var(--ink-faint)',fontStyle:'italic'}}>Note: {ts.notes}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Originated loans */}
      {activeTab==='loans' && (
        <div>
          {loans.length === 0 ? (
            <div style={{padding:'4rem',textAlign:'center',background:'var(--surface-card)',border:'1px dashed var(--border-mid)',borderRadius:'4px'}}>
              <DollarSign style={{width:'36px',color:'var(--border-strong)',margin:'0 auto 1rem'}}/>
              <p style={{fontSize:'0.9rem',color:'var(--ink-muted)'}}>No originated loans yet</p>
            </div>
          ) : (
            <div style={{background:'var(--surface-card)',border:'1px solid var(--border)',borderRadius:'4px',overflow:'hidden'}}>
              <table className="h-table">
                <thead>
                  <tr>
                    <th>Loan Number</th>
                    <th>Borrower</th>
                    <th>Principal</th>
                    <th>Rate</th>
                    <th>Term</th>
                    <th>Monthly Payment</th>
                    <th>Status</th>
                    <th>Originated</th>
                  </tr>
                </thead>
                <tbody>
                  {(loans || []).map(loan => (
                    <tr key={loan.id}>
                      <td style={{fontFamily:'"DM Mono",monospace',fontWeight:500}}>{loan.loan_number}</td>
                      <td>{loan.borrower_name}</td>
                      <td style={{fontFamily:'"DM Mono",monospace'}}>{fmt(loan.principal_amount||0)}</td>
                      <td style={{fontFamily:'"DM Mono",monospace'}}>{loan.interest_rate?.toFixed(2)}%</td>
                      <td>{loan.term_months}mo</td>
                      <td style={{fontFamily:'"DM Mono",monospace'}}>{fmt(loan.monthly_payment||0)}</td>
                      <td><span className="badge badge-green">{loan.status}</span></td>
                      <td style={{color:'var(--ink-faint)',fontSize:'0.78rem'}}>{loan.origination_date ? new Date(loan.origination_date).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}