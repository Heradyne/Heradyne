import { create } from 'zustand';
import { User } from '@/types';
import { api } from './api';

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const IDLE_WARNING_MS = 13 * 60 * 1000; // warn at 13 minutes

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  mustChangePassword: boolean;
  mfaRequired: boolean;
  mfaToken: string | null;
  idleWarning: boolean;
  login: (email: string, password: string) => Promise<{ mustChangePassword: boolean; mfaRequired: boolean; mfaToken?: string }>;
  verifyMFA: (mfaToken: string, code: string) => Promise<{ mustChangePassword: boolean }>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  setMustChangePassword: (value: boolean) => void;
  dismissIdleWarning: () => void;
}

// ── Idle session tracker ──────────────────────────────────────────────────────
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let warningTimer: ReturnType<typeof setTimeout> | null = null;

function resetIdleTimers(onWarning: () => void, onLogout: () => void) {
  if (idleTimer) clearTimeout(idleTimer);
  if (warningTimer) clearTimeout(warningTimer);
  warningTimer = setTimeout(onWarning, IDLE_WARNING_MS);
  idleTimer = setTimeout(onLogout, IDLE_TIMEOUT_MS);
}

function clearIdleTimers() {
  if (idleTimer) clearTimeout(idleTimer);
  if (warningTimer) clearTimeout(warningTimer);
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  mustChangePassword: false,
  mfaRequired: false,
  mfaToken: null,
  idleWarning: false,

  login: async (email, password) => {
    const result = await api.login(email, password);

    if (result.mfa_required) {
      set({ mfaRequired: true, mfaToken: result.mfa_token || null });
      return { mustChangePassword: false, mfaRequired: true, mfaToken: result.mfa_token };
    }

    const user = await api.getCurrentUser();
    const mustChangePassword = result.must_change_password || false;
    set({ user, isAuthenticated: true, mustChangePassword, mfaRequired: false });
    get()._startIdleTracking();
    return { mustChangePassword, mfaRequired: false };
  },

  verifyMFA: async (mfaToken, code) => {
    const result = await api.verifyMFA(mfaToken, code);
    const user = await api.getCurrentUser();
    const mustChangePassword = result.must_change_password || false;
    set({ user, isAuthenticated: true, mustChangePassword, mfaRequired: false, mfaToken: null });
    get()._startIdleTracking();
    return { mustChangePassword };
  },

  logout: async () => {
    clearIdleTimers();
    await api.logout();
    set({ user: null, isAuthenticated: false, mustChangePassword: false, mfaRequired: false, mfaToken: null, idleWarning: false });
  },

  loadUser: async () => {
    try {
      const user = await api.getCurrentUser();
      set({ user, isAuthenticated: true, isLoading: false, mustChangePassword: user.must_change_password || false });
      get()._startIdleTracking();
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  setMustChangePassword: (value) => set({ mustChangePassword: value }),

  dismissIdleWarning: () => {
    set({ idleWarning: false });
    get()._startIdleTracking(); // reset timers
  },

  // Internal: starts idle tracking
  _startIdleTracking: () => {
    if (typeof window === 'undefined') return;
    const warn = () => set({ idleWarning: true });
    const doLogout = async () => {
      set({ idleWarning: false });
      await get().logout();
      window.location.href = '/login?reason=idle';
    };
    resetIdleTimers(warn, doLogout);
    // Reset on any user activity
    const reset = () => resetIdleTimers(warn, doLogout);
    ['mousemove','keydown','click','scroll','touchstart'].forEach(ev =>
      window.removeEventListener(ev, reset)
    );
    ['mousemove','keydown','click','scroll','touchstart'].forEach(ev =>
      window.addEventListener(ev, reset, { passive: true })
    );
  },
} as any));
