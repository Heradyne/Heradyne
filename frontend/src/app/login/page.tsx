'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Shield } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const { login, verifyMFA } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [step, setStep] = useState<'credentials'|'mfa'>('credentials');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const result = await login(email, password);
      if (result.mfaRequired) {
        setMfaToken(result.mfaToken || '');
        setStep('mfa');
      } else {
        router.push(result.mustChangePassword ? '/change-password' : '/dashboard');
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Incorrect email or password.');
    } finally { setLoading(false); }
  };

  const handleMFA = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const result = await verifyMFA(mfaToken, mfaCode);
      router.push(result.mustChangePassword ? '/change-password' : '/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Invalid code. Please try again.');
    } finally { setLoading(false); }
  };

  return (
    <div style={{minHeight:'100vh',background:'var(--surface)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'3rem 1.5rem'}}>
      <Link href="/" style={{fontFamily:'"DM Serif Display",serif',fontSize:'1.3rem',color:'var(--navy)',letterSpacing:'0.06em',textDecoration:'none',marginBottom:'2.5rem',display:'block',textAlign:'center'}}>
        HERADYNE
      </Link>

      <div style={{width:'100%',maxWidth:'400px'}}>
        <div className="card" style={{padding:'2.5rem'}}>

          {step === 'credentials' ? (
            <>
              <h1 style={{fontFamily:'"DM Serif Display",serif',fontSize:'1.5rem',color:'var(--navy)',marginBottom:'0.4rem',fontWeight:400}}>Sign in</h1>
              <p style={{fontSize:'0.83rem',color:'var(--ink-muted)',marginBottom:'2rem'}}>
                Don&apos;t have an account?{' '}
                <Link href="/register" style={{color:'var(--gold-dark)',textDecoration:'underline',textUnderlineOffset:'3px'}}>Create one</Link>
              </p>
              {error && <div className="callout callout-red" style={{marginBottom:'1.25rem'}}>{error}</div>}
              <form onSubmit={handleLogin} style={{display:'flex',flexDirection:'column',gap:'1.125rem'}}>
                <div>
                  <label className="label">Email</label>
                  <input className="input" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email"/>
                </div>
                <div>
                  <label className="label">Password</label>
                  <input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password"/>
                </div>
                <button type="submit" disabled={loading} className="btn btn-primary btn-lg" style={{width:'100%',marginTop:'0.5rem'}}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin"/> : 'Sign In'}
                </button>
              </form>
            </>
          ) : (
            <>
              <div style={{display:'flex',alignItems:'center',gap:'0.75rem',marginBottom:'1rem'}}>
                <Shield style={{width:'24px',color:'var(--navy)'}}/>
                <h1 style={{fontFamily:'"DM Serif Display",serif',fontSize:'1.4rem',color:'var(--navy)',fontWeight:400}}>Two-Factor Auth</h1>
              </div>
              <p style={{fontSize:'0.83rem',color:'var(--ink-muted)',marginBottom:'1.5rem',lineHeight:1.6}}>
                Enter the 6-digit code from your authenticator app.
              </p>
              {error && <div className="callout callout-red" style={{marginBottom:'1.25rem'}}>{error}</div>}
              <form onSubmit={handleMFA} style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
                <div>
                  <label className="label">Verification Code</label>
                  <input className="input" type="text" inputMode="numeric" maxLength={6} value={mfaCode}
                    onChange={e=>setMfaCode(e.target.value.replace(/\D/g,''))}
                    placeholder="000000" autoFocus style={{letterSpacing:'0.25em',fontSize:'1.25rem',textAlign:'center'}}/>
                </div>
                <button type="submit" disabled={loading||mfaCode.length!==6} className="btn btn-primary btn-lg" style={{width:'100%'}}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin"/> : 'Verify'}
                </button>
                <button type="button" onClick={()=>{setStep('credentials');setError('');setMfaCode('');}} className="btn btn-ghost btn-sm" style={{width:'100%'}}>
                  ← Back to login
                </button>
              </form>
            </>
          )}
        </div>

        {/* Demo accounts */}
        {step === 'credentials' && (
          <div className="card" style={{marginTop:'1rem',padding:'1.25rem'}}>
            <p style={{fontSize:'0.68rem',fontWeight:500,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--ink-muted)',marginBottom:'0.75rem'}}>Demo accounts</p>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.5rem'}}>
              {[
                {label:'Borrower', email:'borrower@example.com'},
                {label:'Lender',   email:'lender1@example.com'},
                {label:'Insurer',  email:'insurer@example.com'},
                {label:'Admin',    email:'admin@example.com'},
              ].map(d => (
                <button key={d.email} type="button"
                  onClick={()=>{setEmail(d.email);setPassword('password123');}}
                  style={{padding:'0.5rem',border:'1px solid var(--border-mid)',borderRadius:'4px',fontSize:'0.75rem',color:'var(--ink-muted)',background:'var(--surface)',cursor:'pointer',textAlign:'left',fontFamily:'"DM Sans",sans-serif',transition:'border-color 0.15s,color 0.15s'}}
                  onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='var(--navy)';(e.currentTarget as HTMLElement).style.color='var(--navy)'}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='var(--border-mid)';(e.currentTarget as HTMLElement).style.color='var(--ink-muted)'}}>
                  <span style={{display:'block',fontWeight:500}}>{d.label}</span>
                  <span style={{fontSize:'0.68rem',opacity:0.7}}>{d.email}</span>
                </button>
              ))}
            </div>
            <p style={{fontSize:'0.7rem',color:'var(--ink-faint)',marginTop:'0.6rem'}}>All demo passwords: <code style={{fontFamily:'monospace'}}>password123</code></p>
          </div>
        )}
      </div>

      <p style={{marginTop:'2rem',fontSize:'0.72rem',color:'var(--ink-faint)'}}>
        © 2025 Heradyne · <Link href="/" style={{color:'var(--ink-faint)'}}>Back to home</Link>
      </p>
    </div>
  );
}
