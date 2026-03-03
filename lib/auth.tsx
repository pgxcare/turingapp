'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { api } from '@/lib/api';

type User = {
  id: number;
  email: string;
  full_name: string;
  role: string;
};

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  authDisabled: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_DISABLED = process.env.NEXT_PUBLIC_AUTH_DISABLED !== 'false';
const DEMO_USER: User = {
  id: 0,
  email: 'demo@trusttower.local',
  full_name: 'Demo User',
  role: 'Admin'
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (AUTH_DISABLED) {
      setUser(DEMO_USER);
      setLoading(false);
      return;
    }

    const token = localStorage.getItem('tt_token');
    if (!token) {
      setLoading(false);
      return;
    }

    api
      .get<User>('/auth/me')
      .then((response) => setUser(response))
      .catch(() => {
        localStorage.removeItem('tt_token');
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    return {
      user,
      loading,
      authDisabled: AUTH_DISABLED,
      login: async (email: string, password: string) => {
        if (AUTH_DISABLED) {
          setUser(DEMO_USER);
          return;
        }
        const response = await api.post<{ access_token: string }>('/auth/login', {
          email,
          password
        });
        localStorage.setItem('tt_token', response.access_token);
        const me = await api.get<User>('/auth/me');
        setUser(me);
      },
      logout: () => {
        if (AUTH_DISABLED) {
          return;
        }
        localStorage.removeItem('tt_token');
        setUser(null);
      }
    };
  }, [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
