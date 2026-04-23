'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, TrendingUp, FileText, AlertTriangle, CheckCircle, Clock, Shield, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, getStatusColor, getRoleLabel } from '@/lib/utils';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge badge-navy', submitted: 'badge badge-gold', analyzed: 'badge badge-blue',
  matched: 'badge badge-green', funded: 'badge badge-green', approved: 'badge badge-green',
  declined: 'badge badge-red', pending: 'badge badge-yellow',
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [deals, setDeals] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [uwSummary, setUwSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (user) loadData(); }, [user]);

  const loadData = async () => {
    try {
      if (user?.role === 'borrower' || user?.role === 'admin') {
        const dRaw = await api.getDeals();
        const d: any[] = Array.isArray(dRaw) ? dRaw : ((dRaw as any)?.deals ?? []);
        setDeals(d);
        const analyzed = d.filter((deal: any) => ['analyzed','matched','funded','approved'].includes(deal.status));
        const token = localStorage.getItem('token');
        const uwResults: any[] = [];
        for (const deal of analyzed.slice(0,5)) {
          try {
            const res = await fetch(`${API}/api/v1/underwriting/deals/${deal.id}/full-underwriting`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) { const data = await res.json(); uwResults.push({ dealId: deal.id, dealName: deal.name, ...data }); }
          } catch {}
        }
        setUwSummary(uwResults);
      }
      if (['lender','insurer','loan_officer','credit_committee'].includes(user?.role || '')) {
        const [mRaw, dRaw2] = await Promise.all([api.getMyMatches().catch(()=>[]), api.getDeals().catch(()=>[])]);
        const m: any[] = Array.isArray(mRaw) ? mRaw : ((mRaw as any)?.matches ?? []);
        const d2: any[] = Array.isArray(dRaw2) ? dRaw2 : ((dRaw2 as any)?.deals ?? []);
        setMatches(m); setDeals(d2);
      }
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  const greet = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh'}}>
      <div style={{width:'32px',height:'32px',border:'2px solid var(--gold-light)',borderTopColor:'var(--navy)',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const isBorrower = user?.role === 'borrower';
  const isLender = ['lender','loan_officer','credit_committee'].includes(user?.role||'');
  const isInsurer = user?.role === 'insurer';
  const isAdmin = user?.role === 'admin';

  const pendingDeals = deals.filter(d => ['submitted','analyzed'].includes(d.status)).length;
  const activeDeals = deals.filter(d => ['matched','funded','approved'].includes(d.status)).length;
  const pendingMatches = matches.filter(m => m.status === 'pending').length;

  return (
    <div style={{maxWidth:'1100px',margin:'0 auto'}}>

      {/* ── Page header ── */}
      <div style={{marginBottom:'2.5rem',paddingBottom:'1.75rem',borderBottom:'1px solid var(--border)'}}>
        <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',flexWrap:'wrap',gap:'1rem'}}>
          <div>
            <p style={{fontSize:'0.67rem',fontWeight:500,letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--gold)',fontFamily:'"DM Sans",sans-serif',marginBottom:'0.4rem'}}>
              {greet()}
            </p>
            <h1 style={{fontFamily:'"DM Serif Display",serif',fontSize:'2rem',color:'var(--navy)',fontWeight:400,lineHeight:1.05,marginBottom:'0.3rem'}}>
              {user?.full_name?.split(' ')[0] || 'Welcome back'}
            </h1>
            <p style={{fontSize:'0.83rem',color:'var(--ink-muted)',fontWeight:300}}>
              {getRoleLabel(user?.role||'')} · {new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}
            </p>
          </div>
          {isBorrower && (
            <Link href="/dashboard/get-valuation" className="btn btn-primary btn-lg">
              <Plus style={{width:'14px',height:'14px'}}/> New Valuation
            </Link>
          )}
          {(isLender||isInsurer) && (
            <Link href="/dashboard/matches" className="btn btn-primary btn-lg">
              View Deal Pipeline <ArrowRight style={{width:'14px',height:'14px'}}/>
            </Link>
          )}
        </div>
      </div>

      {/* ── Stats row ── */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:'1rem',marginBottom:'2.5rem'}}>
        {isBorrower && <>
          <div className="stat-block">
            <p className="stat-label">Total Deals</p>
            <p className="stat-num num">{deals.length}</p>
            <p className="stat-sub">in your portfolio</p>
          </div>
          <div className="stat-block">
            <p className="stat-label">Under Review</p>
            <p className="stat-num num val-gold">{pendingDeals}</p>
            <p className="stat-sub">awaiting decision</p>
          </div>
          <div className="stat-block">
            <p className="stat-label">Active</p>
            <p className="stat-num num val-ok">{activeDeals}</p>
            <p className="stat-sub">matched or funded</p>
          </div>
          {uwSummary.length > 0 && (
            <div className="stat-block metric-gold">
              <p className="stat-label">Avg Health Score</p>
              <p className="stat-num num val-gold">
                {(uwSummary.reduce((s,u)=>s+(u.health_score?.score||0),0)/uwSummary.length).toFixed(0)}
              </p>
              <p className="stat-sub">across valued deals</p>
            </div>
          )}
        </>}

        {(isLender||isInsurer) && <>
          <div className="stat-block">
            <p className="stat-label">Deals Available</p>
            <p className="stat-num num">{deals.length}</p>
            <p className="stat-sub">in pipeline</p>
          </div>
          <div className="stat-block">
            <p className="stat-label">Pending Review</p>
            <p className="stat-num num val-gold">{pendingMatches}</p>
            <p className="stat-sub">awaiting your action</p>
          </div>
          <div className="stat-block">
            <p className="stat-label">Accepted</p>
            <p className="stat-num num val-ok">{matches.filter(m=>m.status==='accepted').length}</p>
            <p className="stat-sub">in your book</p>
          </div>
          <div className="stat-block">
            <p className="stat-label">Total Exposure</p>
            <p className="stat-num num" style={{fontSize:'1.4rem'}}>
              {fmt(deals.reduce((s,d)=>s+(d.loan_amount_requested||0),0))}
            </p>
            <p className="stat-sub">loan amount</p>
          </div>
        </>}

        {isAdmin && <>
          <div className="stat-block"><p className="stat-label">Total Deals</p><p className="stat-num num">{deals.length}</p></div>
          <div className="stat-block"><p className="stat-label">Active</p><p className="stat-num num val-ok">{activeDeals}</p></div>
          <div className="stat-block"><p className="stat-label">Total Value</p><p className="stat-num num" style={{fontSize:'1.4rem'}}>{fmt(deals.reduce((s,d)=>s+(d.loan_amount_requested||0),0))}</p></div>
        </>}
      </div>

      {/* ── Two-column content ── */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1.5rem',marginBottom:'2rem'}}>

        {/* UW health scores — borrower */}
        {isBorrower && uwSummary.length > 0 && (
          <div className="card card-accent" style={{gridColumn:'1/-1'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.25rem'}}>
              <div>
                <span className="eyebrow" style={{marginBottom:'0.25rem'}}>UnderwriteOS</span>
                <h2 style={{fontFamily:'"DM Serif Display",serif',fontSize:'1.15rem',color:'var(--navy)',fontWeight:400}}>Deal Health Scores</h2>
              </div>
              <Link href="/dashboard/get-valuation" className="btn btn-ghost btn-sm">View all <ArrowRight style={{width:'12px',height:'12px'}}/></Link>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:'1rem'}}>
              {uwSummary.map(uw => {
                const score = uw.health_score?.score || 0;
                const verdict = uw.deal_killer?.verdict;
                const color = score>=70?'var(--green-mid)':score>=50?'var(--yellow-mid)':'var(--red-mid)';
                const bg = score>=70?'var(--green-bg)':score>=50?'var(--yellow-bg)':'var(--red-bg)';
                return (
                  <Link key={uw.dealId} href={`/dashboard/valuation/${uw.dealId}`}
                    style={{background:bg,borderRadius:'4px',padding:'1rem',textDecoration:'none',display:'block',border:`1px solid ${score>=70?'var(--green-border)':score>=50?'var(--yellow-border)':'var(--red-border)'}`,transition:'transform 0.15s',}}
                    onMouseEnter={e=>(e.currentTarget as HTMLElement).style.transform='translateY(-1px)'}
                    onMouseLeave={e=>(e.currentTarget as HTMLElement).style.transform='none'}>
                    <p style={{fontSize:'0.7rem',color:'var(--ink-muted)',marginBottom:'0.5rem',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{uw.dealName}</p>
                    <div style={{display:'flex',alignItems:'baseline',gap:'4px',marginBottom:'0.5rem'}}>
                      <span style={{fontFamily:'"DM Mono",monospace',fontSize:'2rem',lineHeight:1,color,fontWeight:500}}>{score.toFixed(0)}</span>
                      <span style={{fontSize:'0.75rem',color:'var(--ink-faint)'}}>/100</span>
                    </div>
                    <div style={{height:'3px',background:'rgba(0,0,0,0.08)',borderRadius:'99px',overflow:'hidden'}}>
                      <div style={{height:'100%',width:`${score}%`,background:color,borderRadius:'99px'}}/>
                    </div>
                    {verdict && <p style={{fontSize:'0.68rem',marginTop:'0.5rem',color,fontWeight:500,letterSpacing:'0.06em',textTransform:'uppercase'}}>
                      {verdict==='buy'?'✓ Buy':verdict==='renegotiate'?'⚠ Renegotiate':'✗ Pass'}
                    </p>}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent deals */}
        <div className="card">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.25rem'}}>
            <h2 style={{fontFamily:'"DM Serif Display",serif',fontSize:'1.1rem',color:'var(--navy)',fontWeight:400}}>
              {isBorrower ? 'My Deals' : 'Recent Deals'}
            </h2>
            <Link href={isBorrower?'/dashboard/deals':'/dashboard/matches'} className="btn btn-ghost btn-sm" style={{fontSize:'0.72rem'}}>
              View all <ArrowRight style={{width:'11px',height:'11px'}}/>
            </Link>
          </div>
          {deals.length === 0 ? (
            <div style={{textAlign:'center',padding:'2rem',color:'var(--ink-faint)'}}>
              <FileText style={{width:'32px',height:'32px',margin:'0 auto 0.75rem',opacity:0.3}}/>
              <p style={{fontSize:'0.83rem'}}>No deals yet</p>
              {isBorrower && <Link href="/dashboard/get-valuation" className="btn btn-primary btn-sm" style={{marginTop:'1rem'}}>Get a Valuation</Link>}
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:'0'}}>
              {deals.slice(0,6).map((deal,i) => (
                <Link key={deal.id} href={isBorrower?`/dashboard/valuation/${deal.id}`:`/dashboard/deals/${deal.id}`}
                  style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0.75rem 0',textDecoration:'none',borderBottom:i<Math.min(deals.length,6)-1?'1px solid var(--border)':'none',transition:'background 0.12s',cursor:'pointer'}}
                  onMouseEnter={e=>(e.currentTarget as HTMLElement).style.marginLeft='4px'}
                  onMouseLeave={e=>(e.currentTarget as HTMLElement).style.marginLeft='0'}>
                  <div style={{minWidth:0}}>
                    <p style={{fontSize:'0.84rem',fontWeight:500,color:'var(--ink)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',marginBottom:'0.2rem'}}>{deal.name}</p>
                    <p style={{fontSize:'0.72rem',color:'var(--ink-faint)',textTransform:'capitalize'}}>{deal.industry} · {formatDate(deal.created_at)}</p>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:'0.75rem',flexShrink:0,marginLeft:'1rem'}}>
                    <span style={{fontSize:'0.8rem',color:'var(--ink-muted)',fontFamily:'"DM Mono",monospace'}}>{fmt(deal.loan_amount_requested||0)}</span>
                    <span className={STATUS_BADGE[deal.status]||'badge badge-navy'}>{deal.status}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Right column — role-specific */}
        <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>

          {/* Borrower: quick actions */}
          {isBorrower && (
            <div className="card card-navy">
              <span className="eyebrow" style={{color:'var(--accent)',borderColor:'rgba(196,165,90,0.3)',marginBottom:'1rem'}}>Quick Actions</span>
              <div style={{display:'flex',flexDirection:'column',gap:'0.625rem'}}>
                {[
                  {label:'Get Instant Valuation — $99', href:'/get-started?tier=valuation', sub:'Health score, DSCR, 5-method valuation'},
                  {label:'Full Diligence Package — $399', href:'/get-started?tier=diligence', sub:'Documents, lender PDF, shareable link'},
                  {label:'Business Dashboard', href:'/dashboard/loan-health', sub:'Cash flow, playbooks, AI advisor'},
                ].map(a => (
                  <Link key={a.href} href={a.href}
                    style={{display:'block',padding:'0.875rem 1rem',borderRadius:'3px',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.09)',textDecoration:'none',transition:'background 0.15s,border-color 0.15s'}}
                    onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgba(196,165,90,0.12)';(e.currentTarget as HTMLElement).style.borderColor='rgba(196,165,90,0.3)'}}
                    onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.05)';(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,0.09)'}}>
                    <p style={{fontSize:'0.83rem',fontWeight:500,color:'rgba(255,255,255,0.9)',marginBottom:'0.15rem'}}>{a.label}</p>
                    <p style={{fontSize:'0.72rem',color:'rgba(255,255,255,0.38)'}}>{a.sub}</p>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Lender: pending matches */}
          {(isLender||isInsurer) && matches.length > 0 && (
            <div className="card">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.25rem'}}>
                <h2 style={{fontFamily:'"DM Serif Display",serif',fontSize:'1.1rem',color:'var(--navy)',fontWeight:400}}>Pending Review</h2>
                <span style={{fontFamily:'"DM Mono",monospace',fontSize:'1rem',color:'var(--gold-dark)',fontWeight:500}}>{pendingMatches}</span>
              </div>
              {matches.filter(m=>m.status==='pending').slice(0,4).map((m,i,arr) => (
                <div key={m.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.65rem 0',borderBottom:i<arr.length-1?'1px solid var(--border)':'none'}}>
                  <div>
                    <p style={{fontSize:'0.82rem',fontWeight:500,color:'var(--ink)'}}>{m.deal_name||`Deal #${m.deal_id}`}</p>
                    <p style={{fontSize:'0.7rem',color:'var(--ink-faint)',marginTop:'0.1rem'}}>{fmt(m.loan_amount||0)}</p>
                  </div>
                  <Link href="/dashboard/matches" className="btn btn-outline btn-sm">Review</Link>
                </div>
              ))}
            </div>
          )}

          {/* Platform overview / stats for lenders */}
          {(isLender||isInsurer||isAdmin) && (
            <div className="card card-accent">
              <span className="eyebrow">Platform</span>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem',marginTop:'0.75rem'}}>
                {[
                  {label:'SBA Dataset', value:'1.59M', sub:'loans calibrated'},
                  {label:'Avg DSCR', value:'1.42x', sub:'portfolio average'},
                  {label:'SBA Eligible', value:`${deals.filter(d=>d.sba_eligible!==false).length}`, sub:'of your deals'},
                  {label:'Data Vintage', value:'25yr', sub:'FY2000–2024'},
                ].map(s => (
                  <div key={s.label} style={{padding:'0.875rem',background:'var(--surface)',borderRadius:'3px',border:'1px solid var(--border)'}}>
                    <p style={{fontSize:'0.63rem',fontWeight:500,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--ink-muted)',marginBottom:'0.3rem'}}>{s.label}</p>
                    <p style={{fontFamily:'"DM Mono",monospace',fontSize:'1.4rem',color:'var(--navy)',lineHeight:1}}>{s.value}</p>
                    <p style={{fontSize:'0.7rem',color:'var(--ink-faint)',marginTop:'0.2rem'}}>{s.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer disclaimer ── */}
      <div style={{borderTop:'1px solid var(--border)',paddingTop:'1.25rem',marginTop:'1rem'}}>
        <p style={{fontSize:'0.67rem',color:'var(--ink-faint)',lineHeight:1.6,maxWidth:'680px',fontFamily:'"DM Sans",sans-serif',fontWeight:300}}>
          Heradyne is an informational platform only. All analysis, scores, valuations, and recommendations are for decision support and do not constitute lending, guarantee, insurance, or investment advice. Engage qualified professionals for all transactions.
        </p>
      </div>
    </div>
  );
}
