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
    window.location.href = `/auth/google?returnTo=${encodeURIComponent(window.location.pathname)}`;
  };

  const logout = async () => {
    await fetch("/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
  };

  return { user, loading, login, logout, refetch: fetchMe };
}