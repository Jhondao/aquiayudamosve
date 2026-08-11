import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, onSessionExpired, setAccessToken } from "../api/client";
import type { Profile } from "../types";

interface AuthState {
  profile: Profile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    onSessionExpired(() => setProfile(null));
    // Attempt a silent refresh on load — the httpOnly cookie may still be
    // valid even though the in-memory access token was wiped by a reload.
    api
      .refresh()
      .then((res) => setProfile(res.profile))
      .catch(() => setAccessToken(null))
      .finally(() => setLoading(false));
    return () => onSessionExpired(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    setAccessToken(res.accessToken);
    setProfile(res.profile);
  }, []);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    const res = await api.register(email, password, displayName);
    setAccessToken(res.accessToken);
    setProfile(res.profile);
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setAccessToken(null);
    setProfile(null);
  }, []);

  const value = useMemo(() => ({ profile, loading, login, register, logout }), [profile, loading, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
