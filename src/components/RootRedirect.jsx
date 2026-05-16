import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/useAuth.js";
import { supabaseConfigured } from "../lib/supabaseClient.js";

/** `/` → login if no session, otherwise tender-manager home */
export default function RootRedirect() {
  const { session, loading } = useAuth();

  if (!supabaseConfigured) {
    return <Navigate to="/tender-manager/home" replace />;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-page">
        <div
          className="h-10 w-10 animate-spin rounded-full border-[3px] border-hairline border-t-accent"
          aria-hidden
        />
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  if (session) return <Navigate to="/tender-manager/home" replace />;
  return <Navigate to="/login" replace />;
}
