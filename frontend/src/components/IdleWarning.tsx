'use client';
import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export default function IdleWarning() {
  const { idleWarning, dismissIdleWarning, logout } = useAuth();
  const [countdown, setCountdown] = useState(120);

  useEffect(() => {
    if (!idleWarning) { setCountdown(120); return; }
    const t = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(t); logout(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [idleWarning]);

  if (!idleWarning) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15,35,64,0.6)', backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'var(--surface-card)', borderRadius: '6px', padding: '2rem', maxWidth: '380px',
        width: '90%', textAlign: 'center', border: '1px solid var(--border)',
        boxShadow: '0 20px 60px rgba(15,35,64,0.3)',
      }}>
        <div style={{
          width: '48px', height: '48px', borderRadius: '50%', background: 'var(--yellow-bg)',
          border: '2px solid var(--yellow-border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 1rem',
        }}>
          <Clock style={{ width: '24px', color: 'var(--yellow-mid)' }}/>
        </div>
        <h2 style={{ fontFamily: '"DM Serif Display",serif', fontSize: '1.2rem', color: 'var(--navy)', marginBottom: '0.5rem', fontWeight: 400 }}>
          Session expiring
        </h2>
        <p style={{ fontSize: '0.84rem', color: 'var(--ink-muted)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
          You've been inactive for 13 minutes. For your security, you'll be logged out in
        </p>
        <p style={{ fontFamily: '"DM Mono",monospace', fontSize: '2.5rem', color: 'var(--yellow-mid)', marginBottom: '1.5rem', lineHeight: 1 }}>
          {countdown}s
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button onClick={dismissIdleWarning} className="btn btn-primary">
            Stay logged in
          </button>
          <button onClick={() => logout()} className="btn btn-secondary">
            Log out now
          </button>
        </div>
      </div>
    </div>
  );
}
