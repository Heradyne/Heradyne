'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Shield, ShieldCheck, ShieldOff, Key, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';

export default function SecurityPage() {
  const { user, loadUser } = useAuth();
  const [enrolling, setEnrolling] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'idle'|'scan'|'verify'|'done'>('idle');
  const [error, setError] = useState('');
  const [disabling, setDisabling] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  const mfaEnabled = (user as any)?.mfa_enabled;

  const startEnroll = async () => {
    setEnrolling(true); setError('');
    try {
      const data = await api.getMFAEnrollment();
      setQrCode(data.qr_code); setSecret(data.secret);
      setStep('scan');
    } catch(e: any) { setError(e.response?.data?.detail || 'Failed to start enrollment'); }
    finally { setEnrolling(false); }
  };

  const confirmEnroll = async () => {
    if (!code || code.length !== 6) { setError('Enter the 6-digit code from your authenticator app'); return; }
    setEnrolling(true); setError('');
    try {
      await api.confirmMFAEnrollment(code);
      setStep('done');
      await loadUser();
    } catch(e: any) { setError(e.response?.data?.detail || 'Invalid code'); }
    finally { setEnrolling(false); }
  };

  const disableMFA = async () => {
    if (!confirm('Disable MFA? Your account will be less secure.')) return;
    setDisabling(true);
    try {
      await api.disableMFA();
      setStep('idle'); setCode(''); setQrCode(''); setSecret('');
      await loadUser();
    } catch(e: any) { setError(e.response?.data?.detail || 'Failed to disable MFA'); }
    finally { setDisabling(false); }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) { setPwError('Passwords do not match'); return; }
    setPwLoading(true); setPwError(''); setPwSuccess(false);
    try {
      await api.changePassword(pwForm.current, pwForm.next);
      setPwSuccess(true);
      setPwForm({ current: '', next: '', confirm: '' });
    } catch(e: any) { setPwError(e.response?.data?.detail || 'Failed to change password'); }
    finally { setPwLoading(false); }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.55rem 0.875rem', border: '1.5px solid var(--border-mid)',
    borderRadius: '3px', fontSize: '0.85rem', fontFamily: '"DM Sans",sans-serif',
    background: 'var(--surface-card)', color: 'var(--ink)',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.67rem', fontWeight: 500, letterSpacing: '0.1em',
    textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: '0.35rem',
  };

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
        <p style={{ fontSize: '0.67rem', fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '0.3rem' }}>Account</p>
        <h1 style={{ fontFamily: '"DM Serif Display",serif', fontSize: '1.8rem', color: 'var(--navy)', fontWeight: 400 }}>Security Settings</h1>
        <p style={{ fontSize: '0.84rem', color: 'var(--ink-muted)', fontWeight: 300 }}>Multi-factor authentication and password management.</p>
      </div>

      {/* MFA */}
      <div className="card" style={{ marginBottom: '1.25rem', borderTop: `2px solid ${mfaEnabled ? 'var(--green-mid)' : 'var(--yellow-mid)'}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {mfaEnabled
              ? <ShieldCheck style={{ width: '24px', color: 'var(--green-mid)' }}/>
              : <Shield style={{ width: '24px', color: 'var(--yellow-mid)' }}/>
            }
            <div>
              <h2 style={{ fontFamily: '"DM Serif Display",serif', fontSize: '1.1rem', color: 'var(--navy)', fontWeight: 400 }}>
                Two-Factor Authentication
              </h2>
              <p style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                {mfaEnabled ? 'MFA is active. Your account is protected.' : 'MFA not enabled. Strongly recommended for your role.'}
              </p>
            </div>
          </div>
          <span className={`badge ${mfaEnabled ? 'badge-green' : 'badge-yellow'}`}>
            {mfaEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        {error && <div className="callout callout-red" style={{ marginBottom: '1rem' }}>{error}</div>}

        {/* Idle */}
        {step === 'idle' && !mfaEnabled && (
          <div>
            <p style={{ fontSize: '0.82rem', color: 'var(--ink-muted)', marginBottom: '1rem', lineHeight: 1.6 }}>
              Use an authenticator app (Google Authenticator, Authy, 1Password) to generate time-based codes.
              Once enabled, you'll need your code on every login.
            </p>
            <button onClick={startEnroll} disabled={enrolling} className="btn btn-primary">
              {enrolling ? 'Starting...' : 'Enable Two-Factor Authentication'}
            </button>
          </div>
        )}

        {/* Scan QR */}
        {step === 'scan' && (
          <div>
            <p style={{ fontSize: '0.82rem', color: 'var(--ink-muted)', marginBottom: '1rem' }}>
              Scan this QR code with your authenticator app, then enter the 6-digit code to confirm.
            </p>
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
              <img src={qrCode} alt="MFA QR Code" style={{ width: '160px', height: '160px', border: '1px solid var(--border)', borderRadius: '4px' }}/>
              <div style={{ flex: 1 }}>
                <p style={{ ...labelStyle, marginBottom: '0.5rem' }}>Or enter secret manually</p>
                <code style={{ fontSize: '0.78rem', background: 'var(--surface)', padding: '4px 8px', borderRadius: '3px', letterSpacing: '0.1em' }}>{secret}</code>
                <div style={{ marginTop: '1rem' }}>
                  <label style={labelStyle}>Verification code</label>
                  <input style={{ ...inputStyle, maxWidth: '160px' }} type="text" inputMode="numeric" maxLength={6}
                    placeholder="000000" value={code} onChange={e => setCode(e.target.value.replace(/\D/g,''))}/>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                  <button onClick={confirmEnroll} disabled={enrolling || code.length !== 6} className="btn btn-primary btn-sm">
                    {enrolling ? 'Verifying...' : 'Confirm'}
                  </button>
                  <button onClick={() => setStep('idle')} className="btn btn-secondary btn-sm">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Done */}
        {(step === 'done' || mfaEnabled) && (
          <div>
            {step === 'done' && (
              <div className="callout callout-green" style={{ marginBottom: '1rem' }}>
                <CheckCircle style={{ width: '14px', display: 'inline', marginRight: '6px' }}/>
                MFA enabled successfully. You'll be prompted for a code on your next login.
              </div>
            )}
            <button onClick={disableMFA} disabled={disabling} className="btn btn-danger btn-sm">
              <ShieldOff style={{ width: '13px' }}/> {disabling ? 'Disabling...' : 'Disable MFA'}
            </button>
          </div>
        )}
      </div>

      {/* Change password */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <Key style={{ width: '20px', color: 'var(--navy)' }}/>
          <h2 style={{ fontFamily: '"DM Serif Display",serif', fontSize: '1.1rem', color: 'var(--navy)', fontWeight: 400 }}>
            Change Password
          </h2>
        </div>
        {pwError && <div className="callout callout-red" style={{ marginBottom: '1rem' }}>{pwError}</div>}
        {pwSuccess && <div className="callout callout-green" style={{ marginBottom: '1rem' }}>Password changed successfully.</div>}
        <form onSubmit={changePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div><label style={labelStyle}>Current password</label><input style={inputStyle} type="password" value={pwForm.current} onChange={e => setPwForm(p => ({...p, current: e.target.value}))} required/></div>
          <div><label style={labelStyle}>New password</label><input style={inputStyle} type="password" value={pwForm.next} onChange={e => setPwForm(p => ({...p, next: e.target.value}))} required/></div>
          <div><label style={labelStyle}>Confirm new password</label><input style={inputStyle} type="password" value={pwForm.confirm} onChange={e => setPwForm(p => ({...p, confirm: e.target.value}))} required/></div>
          <div className="callout callout-navy" style={{ fontSize: '0.78rem' }}>
            Minimum 12 characters · uppercase · lowercase · number · special character
          </div>
          <button type="submit" disabled={pwLoading} className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
            {pwLoading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Session info */}
      <div style={{ marginTop: '1.25rem', padding: '1rem 1.25rem', background: 'var(--surface)', borderRadius: '4px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Clock style={{ width: '16px', color: 'var(--ink-muted)', flexShrink: 0 }}/>
        <p style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
          Sessions automatically expire after 15 minutes of inactivity. You'll see a warning before being logged out.
        </p>
      </div>
    </div>
  );
}