import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabase, supabaseConfigured, SUPABASE_AUTH_CLIENT_RESET } from "./supabaseClient.js";

// eslint-disable-next-line react-refresh/only-export-components -- context exported for useAuth hook
export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  // The user id the currently-loaded profile belongs to (null = none resolved yet). We compare
  // this against the live session's user id to know whether the role is resolved for THIS session.
  // A plain boolean leaked across the cold-load gap: the profile effect runs once on mount with no
  // session and marked itself "resolved", so the window after getSession() sets a session but
  // before the re-fetch ran looked already-resolved with role=null → RoleRoute wrongly redirected
  // to /home on hard refresh / deep-link. Keying on the user id closes that gap and also avoids a
  // loading flash on token refresh (same uid stays resolved).
  const [profileUserId, setProfileUserId] = useState(null);
  const [clientNonce, setClientNonce] = useState(0);

  const signOut = useCallback(async () => {
    const sb = getSupabase();
    if (sb) await sb.auth.signOut().catch(() => {});
    setProfile(null);
    navigate("/login", { replace: true });
  }, [navigate]);

  useEffect(() => {
    const bump = () => setClientNonce((n) => n + 1);
    window.addEventListener(SUPABASE_AUTH_CLIENT_RESET, bump);
    return () => window.removeEventListener(SUPABASE_AUTH_CLIENT_RESET, bump);
  }, []);

  useEffect(() => {
    // UI Review Mode (non-production): never call Supabase auth — the mock value below
    // supplies session + role. Dead branch in prod (VITE_UI_REVIEW_MODE unset).
    if (import.meta.env.VITE_UI_REVIEW_MODE === "true") {
      setLoading(false);
      return undefined;
    }

    if (!supabaseConfigured) {
      setSession(null);
      setProfile(null);
      setLoading(false);
      return undefined;
    }

    const sb = getSupabase();
    if (!sb) {
      setSession(null);
      setProfile(null);
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

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) {
      setProfile(null);
      setProfileUserId(null); // no session → nothing to resolve
      return;
    }
    const sb = getSupabase();
    if (!sb) return;

    let cancelled = false;

    sb.from("user_profiles")
      .select("id, email, full_name, role, is_active")
      .eq("id", uid)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data && !data.is_active) {
          signOut();
          return;
        }
        setProfile(data || null);
        setProfileUserId(uid); // role resolved for this session's user
      })
      .catch(() => {
        if (!cancelled) {
          setProfile(null);
          setProfileUserId(uid); // resolved (to no profile) — don't hang in loading forever
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, signOut]);

  const value = useMemo(() => {
    // UI Review Mode (non-production): supply a fake session + role so route guards render
    // every view without real auth. Role comes from ?reviewRole= (director|admin|supervisor|
    // employee|client), default admin. Dead branch in prod (VITE_UI_REVIEW_MODE unset).
    if (import.meta.env.VITE_UI_REVIEW_MODE === "true") {
      let role = "admin";
      try {
        const p = new URLSearchParams(window.location.search).get("reviewRole");
        if (p === "director") role = "admin";
        else if (p) role = p;
      } catch { /* ignore */ }
      const user = { id: "00000000-0000-4000-8000-0000000000a1", email: `${role}@uireview.local` };
      return {
        user,
        session: { user, access_token: "ui-review" },
        loading: false,
        profile: { id: user.id, email: user.email, full_name: "UI Review", role, is_active: true },
        role,
        signOut: () => {},
      };
    }

    const sessionUserId = session?.user?.id ?? null;
    return {
      user: session?.user ?? null,
      session,
      // Stay "loading" until the profile/role is resolved for THIS session's user, so guards
      // never see role=null mid-resolution and wrongly redirect on hard refresh / deep-link.
      loading: loading || (!!sessionUserId && profileUserId !== sessionUserId),
      profile,
      role: profile?.role ?? null,
      signOut
    };
  }, [session, loading, profileUserId, profile, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
