import { create } from 'zustand';
import { User } from '@/types';
import { api } from './api';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  mustChangePassword: boolean;
  login: (email: string, password: string) => Promise<{ mustChangePassword: boolean }>;
  logout: () => void;
  loadUser: () => Promise<void>;
  setMustChangePassword: (value: boolean) => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  mustChangePassword: false,

  login: async (email: string, password: string) => {
    const result = await api.login(email, password);
    const user = await api.getCurrentUser();
    const mustChangePassword = result.must_change_password || false;
    set({ user, isAuthenticated: true, mustChangePassword });
    return { mustChangePassword };
  },

  logout: () => {
    api.logout();
    set({ user: null, isAuthenticated: false, mustChangePassword: false });
  },

  loadUser: async () => {
    try {
      if (api.getToken()) {
        const user = await api.getCurrentUser();
        // Check if user must change password
        const mustChangePassword = user.must_change_password || false;
        set({ user, isAuthenticated: true, isLoading: false, mustChangePassword });
      } else {
        set({ isLoading: false });
      }
    } catch {
      api.logout();
      set({ user: null, isAuthenticated: false, isLoading: false, mustChangePassword: false });
    }
  },

  setMustChangePassword: (value: boolean) => {
    set({ mustChangePassword: value });
  },
}));
