import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/useAuth.js";
import { getDefaultRoute } from "../lib/roles.js";
import { supabaseConfigured } from "../lib/supabaseClient.js";

export default function RootRedirect() {
  const { session, role, loading } = useAuth();

  if (!supabaseConfigured) return <Navigate to="/home" replace />;

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-page">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-hairline border-t-accent" aria-hidden />
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  return <Navigate to={getDefaultRoute(role)} replace />;
}
