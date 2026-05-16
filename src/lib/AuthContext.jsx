import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabase, supabaseConfigured, SUPABASE_AUTH_CLIENT_RESET } from "./supabaseClient.js";

// eslint-disable-next-line react-refresh/only-export-components -- context exported for useAuth hook
export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clientNonce, setClientNonce] = useState(0);

  const signOut = useCallback(async () => {
    const sb = getSupabase();
    if (sb) await sb.auth.signOut().catch(() => {});
    navigate("/login", { replace: true });
  }, [navigate]);

  useEffect(() => {
    const bump = () => setClientNonce((n) => n + 1);
    window.addEventListener(SUPABASE_AUTH_CLIENT_RESET, bump);
    return () => window.removeEventListener(SUPABASE_AUTH_CLIENT_RESET, bump);
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) {
      setSession(null);
      setLoading(false);
      return undefined;
    }

    const sb = getSupabase();
    if (!sb) {
      setSession(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    sb.auth
      .getSession()
      .then(({ data: { session: s }, error }) => {
        if (cancelled) return;
        if (error) console.warn("[Auth] getSession:", error.message);
        setSession(s ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    const { data } = sb.auth.onAuthStateChange((_event, s) => {
      if (!cancelled) setSession(s ?? null);
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [clientNonce]);

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      signOut,
    }),
    [session, loading, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
