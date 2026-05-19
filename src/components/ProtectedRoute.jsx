import { Navigate, Outlet } from "react-router-dom";
import BrandLoading from "./brand/BrandLoading.jsx";
import { useAuth } from "../lib/useAuth.js";
import { supabaseConfigured } from "../lib/supabaseClient.js";

export default function ProtectedRoute() {
  const { session, loading } = useAuth();

  if (!supabaseConfigured) {
    return <Outlet />;
  }

  if (loading) {
    return <BrandLoading message="Loading session…" className="min-h-[60vh]" />;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
