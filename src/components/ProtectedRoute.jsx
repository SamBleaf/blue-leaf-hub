import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../lib/useAuth.js";
import { supabaseConfigured } from "../lib/supabaseClient.js";

export default function ProtectedRoute() {
  const { session, loading } = useAuth();

  if (!supabaseConfigured) {
    return <Outlet />;
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 bg-page">
        <div
          className="h-10 w-10 animate-spin rounded-full border-[3px] border-hairline border-t-accent"
          aria-hidden
        />
        <p className="text-sm text-muted">Loading session…</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
