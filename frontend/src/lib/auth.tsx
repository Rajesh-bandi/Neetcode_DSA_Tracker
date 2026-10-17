import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type PublicUser, type StreakInfo } from './api';

type AuthValue = {
  user: PublicUser | null;
  streak: StreakInfo | null;
  /** False until the first session check finishes. */
  ready: boolean;
  register: (email: string, password: string, name: string, username: string) => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<number>;
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

  const register = useCallback(async (email: string, password: string, name: string, username: string) => {
    const result = await api.register(email, password, name, username);
    setUser(result.user);
    setStreak(result.streak);
  }, []);
  const login = useCallback(async (identifier: string, password: string) => {
    const result = await api.login(identifier, password);
    setUser(result.user);
    setStreak(result.streak);
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const result = await api.changePassword(currentPassword, newPassword);
    return result.otherSessionsSignedOut;
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
    () => ({ user, streak, ready, register, login, changePassword, logout, logoutEverywhere, setStreak }),
    [user, streak, ready, register, login, changePassword, logout, logoutEverywhere],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
