import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type PublicUser, type StreakInfo } from './api';

type AuthValue = {
  user: PublicUser | null;
  streak: StreakInfo | null;
  /** False until the first session check finishes. */
  ready: boolean;
  register: (email: string, password: string, name: string) => Promise<{ email: string; devCode?: string; delivery: string }>;
  verify: (email: string, code: string) => Promise<void>;
  resend: (email: string) => Promise<{ devCode?: string; delivery: string }>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Drops every session for the account, this browser included. */
  logoutEverywhere: () => Promise<void>;
  setStreak: (streak: StreakInfo) => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [streak, setStreak] = useState<StreakInfo | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await api.me();
        if (cancelled) return;
        setUser(session?.user ?? null);
        setStreak(session?.streak ?? null);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const result = await api.register(email, password, name);
    return { email: result.email, devCode: result.devCode, delivery: result.delivery };
  }, []);

  const verify = useCallback(async (email: string, code: string) => {
    const result = await api.verify(email, code);
    setUser(result.user);
    setStreak(result.streak);
  }, []);

  const resend = useCallback(async (email: string) => {
    const result = await api.resend(email);
    return { devCode: result.devCode, delivery: result.delivery };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.login(email, password);
    setUser(result.user);
    setStreak(result.streak);
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setUser(null);
    setStreak(null);
  }, []);

  const logoutEverywhere = useCallback(async () => {
    await api.logoutEverywhere().catch(() => undefined);
    setUser(null);
    setStreak(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ user, streak, ready, register, verify, resend, login, logout, logoutEverywhere, setStreak }),
    [user, streak, ready, register, verify, resend, login, logout, logoutEverywhere],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
