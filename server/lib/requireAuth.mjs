/**
 * Express middleware: validates Supabase Bearer JWT and attaches caller profile.
 */
import { getServiceSupabase } from "./supabaseService.mjs";

export async function requireAuth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return res.status(401).json({ ok: false, error: "Unauthorised" });
  const sb = getServiceSupabase();
  if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return res.status(401).json({ ok: false, error: "Invalid or expired session" });
  const { data: profile } = await sb
    .from("user_profiles")
    .select("id, role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.is_active) return res.status(403).json({ ok: false, error: "Account inactive" });
  // SECURITY: requireAuth gates STAFF endpoints. Portal clients are issued real
  // Supabase auth accounts but must NEVER reach staff APIs through this middleware
  // (they have a dedicated portal middleware, requirePortalAuth). Without this a
  // logged-in client's token would pass every bare requireAuth route (CRM, costs,
  // jobs, …). Clients authenticate to the portal via requirePortalAuth only.
  if (profile.role === "client") {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }
  req.caller = { ...profile, email: user.email };
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.caller) return res.status(401).json({ ok: false, error: "Unauthorised" });
    if (!roles.includes(req.caller.role)) return res.status(403).json({ ok: false, error: "Forbidden" });
    next();
  };
}
