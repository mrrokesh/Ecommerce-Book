import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import api, { clearAuthToken } from '../api/client';
import type { User } from '../types';

type AuthValue = {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<unknown>;
  register: (payload: Record<string, unknown>) => Promise<unknown>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // Auth is httpOnly cookie based — always probe /me with credentials.
    clearAuthToken();
    try {
      const { data } = await api.get('/auth/me');
      setUser((data.user || data || null) as User | null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    clearAuthToken();
    const { data } = await api.post('/auth/login', { email, password });
    setUser((data.user || data) as User);
    return data;
  }, []);

  const register = useCallback(async (payload: Record<string, unknown>) => {
    clearAuthToken();
    const { data } = await api.post('/auth/register', payload);
    setUser((data.user || data) as User);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore */
    }
    clearAuthToken();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      login,
      register,
      logout,
      refresh,
    }),
    [user, loading, login, register, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
