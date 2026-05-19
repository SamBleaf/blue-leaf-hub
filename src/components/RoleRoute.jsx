import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/useAuth.js";
import { supabaseConfigured } from "../lib/supabaseClient.js";

export default function RoleRoute({ element, allowed, redirectTo = "/home" }) {
  const { role, loading } = useAuth();

  if (!supabaseConfigured) return element;

  if (loading) return null;

  if (!role || !allowed.includes(role)) {
    return <Navigate to={redirectTo} replace />;
  }

  return element;
}
