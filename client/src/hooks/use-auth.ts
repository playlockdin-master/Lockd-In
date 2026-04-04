import { useState, useEffect, useCallback } from "react";

export interface AuthUser {
  id:       string;
  username: string;
  avatarId: string;
}

export function useAuth() {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const res  = await fetch("/auth/me", { credentials: "include" });
      const data = await res.json();
      setUser(data.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  const login = () => {
    // Pass current path as returnTo so user lands back where they were
    // Don't encode it — the server puts it in the session, not in the URL params
    const returnTo = window.location.pathname;
    window.location.href = `/auth/google?returnTo=${encodeURIComponent(returnTo)}`;
  };

  const logout = async () => {
    try {
      await fetch("/auth/logout", { method: "POST", credentials: "include" });
    } catch {}
    setUser(null);
    // Hard reload to clear any cached state
    window.location.href = "/";
  };

  return { user, loading, login, logout, refetch: fetchMe };
}