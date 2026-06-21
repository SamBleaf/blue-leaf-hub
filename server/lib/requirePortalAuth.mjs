/**
 * Client Portal v2.0 auth middleware.
 *
 * Produces a normalised `req.portalSession` for BOTH access models that the
 * portal supports simultaneously:
 *
 *   • JWT (v2 logged-in client)  — Authorization: Bearer <supabase access token>
 *       routes mounted at /api/portal/app/:projectId/*
 *       Verified against project_client_users for THIS specific projectId.
 *
 *   • Token (legacy read-only)   — :token in the URL path
 *       routes mounted at /api/portal/:token/*
 *       Anonymous, read-only fallback for unauthenticated sharing.
 *
 * Enforcement note: all portal routes query via the service-role key (bypasses
 * RLS). This middleware — NOT Supabase RLS — is the client access boundary. The
 * projectId-scoped membership check below is therefore mandatory and must never
 * be skipped on a JWT route.
 */
import { getServiceSupabase } from "./supabaseService.mjs";

/**
 * Attaches req.portalSession = {
 *   projectId, userId, isAuthenticated, authType: 'jwt'|'token', role, project
 * }
 */
export async function requirePortalAuth(req, res, next) {
  const sb = getServiceSupabase();
  if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });

  const authHeader = req.headers.authorization || "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";

  // ── Path A: Supabase JWT (authenticated v2 client) ────────────────────────
  if (bearer) {
    const projectId = String(req.params.projectId || "").trim();
    if (!projectId) {
      return res.status(400).json({ ok: false, error: "projectId required" });
    }

    const { data: { user } = {}, error } = await sb.auth.getUser(bearer);
    if (error || !user) {
      return res.status(401).json({ ok: false, error: "Invalid or expired session" });
    }

    // CRITICAL: verify this user has access to THIS specific project.
    const { data: pcu } = await sb
      .from("project_client_users")
      .select("project_id, role, is_active")
      .eq("user_id", user.id)
      .eq("project_id", projectId)
      .maybeSingle();

    // Fail-safe: anything other than a literal true (NULL, missing row) = no access.
    if (!pcu || pcu.is_active !== true) {
      return res.status(403).json({ ok: false, error: "No access to this project" });
    }

    const { data: project } = await sb
      .from("projects")
      .select("id, job_id, address, portal_enabled, portal_v2_enabled, build_phase, portal_client_name, portal_client_email, contract_value, completion_date_est, team_members")
      .eq("id", projectId)
      .maybeSingle();

    if (!project) {
      return res.status(404).json({ ok: false, error: "Project not found" });
    }

    req.portalSession = {
      projectId,
      userId: user.id,
      userEmail: user.email,
      isAuthenticated: true,
      authType: "jwt",
      role: pcu.role,
      project
    };
    return next();
  }

  // ── Path B: legacy token (anonymous, read-only) ───────────────────────────
  const token = String(req.params.token || "").trim();
  if (token) {
    const { data: project } = await sb
      .from("projects")
      .select("id, job_id, address, portal_enabled, portal_v2_enabled, build_phase, portal_client_name, portal_client_email, contract_value, completion_date_est, team_members")
      .eq("portal_token", token)
      .eq("portal_enabled", true)
      .maybeSingle();

    if (!project) {
      return res.status(404).json({ ok: false, error: "Portal not found" });
    }

    req.portalSession = {
      projectId: project.id,
      userId: null,
      userEmail: null,
      isAuthenticated: false,
      authType: "token",
      role: null,
      project
    };
    return next();
  }

  return res.status(401).json({ ok: false, error: "Authentication required" });
}

/**
 * Guard: action requires a logged-in client (not anonymous token access).
 * Use on any contractual write (approvals, signatures, payment notifications).
 */
export function requirePortalLogin(req, res, next) {
  if (!req.portalSession?.isAuthenticated) {
    return res.status(403).json({
      ok: false,
      error: "This action requires you to log in.",
      requiresLogin: true,
      loginUrl: "/client-portal"
    });
  }
  next();
}

/**
 * Guard: block contractual writes by an anonymous legacy-token caller.
 *
 * FAIL-SAFE: a token caller (isAuthenticated:false) is blocked by DEFAULT — on
 * every project, not only portal_v2_enabled ones. The legacy token is read-only;
 * any state-changing action requires a logged-in client. This must be paired with
 * requirePortalLogin on contractual routes (login is the primary gate; this is a
 * defence-in-depth second gate) and must NEVER be the sole guard that "allows" a
 * write. A leaked share-token can therefore never approve a variation, sign a
 * document, or notify payment.
 */
export function requirePortalWrite(req, res, next) {
  const session = req.portalSession;
  if (!session) {
    return res.status(401).json({ ok: false, error: "Authentication required" });
  }
  if (session.authType !== "jwt" || !session.isAuthenticated) {
    return res.status(403).json({
      ok: false,
      error: "This action requires client login.",
      requiresLogin: true,
      loginUrl: "/client-portal"
    });
  }
  // Sub-role (#11): only the primary/secondary client may take CONTRACTUAL actions.
  // architect / accountant invitees have view access but cannot approve variations,
  // notify payment, etc.
  if (!["primary", "secondary"].includes(session.role)) {
    return res.status(403).json({
      ok: false,
      error: "Your access can view this, but only the primary contact can approve it."
    });
  }
  next();
}
