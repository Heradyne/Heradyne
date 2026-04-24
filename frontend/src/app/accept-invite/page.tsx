'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Loader, CheckCircle, AlertTriangle } from 'lucide-react';

function AcceptInviteContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!password || password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.acceptInvite(token, password);
      setDone(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Invalid or expired invite link');
    } finally { setLoading(false); }
  };

  if (!token) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="card max-w-md w-full text-center py-12">
        <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <p className="text-gray-600">Invalid invite link. Please ask your owner to resend.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="card max-w-md w-full">
        {done ? (
          <div className="text-center py-8">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <p className="text-xl font-bold text-gray-900 mb-2">Account created!</p>
            <p className="text-gray-500">Redirecting to login...</p>
          </div>
        ) : (
          <>
            <div className="text-center mb-6">
              <p className="text-sm font-medium text-blue-600 uppercase tracking-wide mb-2">Employee Invitation</p>
              <h1 className="text-2xl font-bold text-gray-900">Create Your Account</h1>
              <p className="text-gray-500 text-sm mt-1">Set a password to join your owner's team on Heradyne</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="label">Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  className="input w-full" placeholder="At least 8 characters" />
              </div>
              <div>
                <label className="label">Confirm Password</label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submit()}
                  className="input w-full" />
              </div>
              <button onClick={submit} disabled={loading || !password || !confirm}
                className="btn btn-primary w-full inline-flex items-center justify-center gap-2">
                {loading ? <Loader className="h-4 w-4 animate-spin" /> : null}
                Create Account & Join
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader className="h-8 w-8 animate-spin" /></div>}>
      <AcceptInviteContent />
    </Suspense>
  );
}