import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/useAuth.js";

/**
 * Gate children on the DB role (user_profiles.role via useAuth) — NOT the cosmetic
 * localStorage view-role. Renders nothing while auth resolves; redirects otherwise.
 * Use for in-page gating; route-level gating still uses RoleRoute.
 */
export default function RoleGuard({ allowed = [], children, redirectTo = "/login", fallback = null }) {
  const { role, loading } = useAuth();
  if (loading) return null;
  if (!role || !allowed.includes(role)) return fallback ?? <Navigate to={redirectTo} replace />;
  return children;
}
