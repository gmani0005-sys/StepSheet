import { create } from 'zustand';
import { User } from '../types';
import { api } from '../api/client';
import { storage } from '../utils/storage';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, pass: string) => Promise<void>;
  join: (email: string, pass: string, name?: string) => Promise<void>;
  logout: () => void;
  initAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: storage.get('stepsheet_access_token'),
  isAuthenticated: !!storage.get('stepsheet_access_token'),
  isLoading: false,
  error: null,

  login: async (email, pass) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.login({ email, password: pass });
      storage.set('stepsheet_access_token', res.access_token);
      storage.set('stepsheet_refresh_token', res.refresh_token);
      set({ user: res.user, token: res.access_token, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Login failed', isLoading: false });
      throw err;
    }
  },

  join: async (email, pass, name) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.join({ email, password: pass, full_name: name });
      storage.set('stepsheet_access_token', res.access_token);
      storage.set('stepsheet_refresh_token', res.refresh_token);
      set({ user: res.user, token: res.access_token, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Signup failed', isLoading: false });
      throw err;
    }
  },

  logout: () => {
    storage.remove('stepsheet_access_token');
    storage.remove('stepsheet_refresh_token');
    set({ user: null, token: null, isAuthenticated: false });
  },

  initAuth: async () => {
    const token = storage.get('stepsheet_access_token');
    if (!token) return;
    try {
      const user = await api.getMe();
      set({ user, isAuthenticated: true });
    } catch {
      storage.remove('stepsheet_access_token');
      set({ user: null, token: null, isAuthenticated: false });
    }
  },
}));
