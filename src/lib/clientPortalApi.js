/**
 * clientPortalApi.js — Client Portal v2.0 fetch helpers.
 *
 * The v2 client portal is for *logged-in* clients (role === "client", a real
 * Supabase auth account) — NOT the token-based v1 share link (see portalApi.js,
 * which targets /api/portal/:token/... with no auth).
 *
 * Base: /api/portal/app/:projectId/<path>  — Authorization: Bearer <client's Supabase token>
 * All helpers return { ok, data, error } like apiFetch.js (never throw).
 *
 * The Bearer token is attached automatically by apiFetch → authFetch (which reads
 * the current Supabase session). Page components must use these helpers, never
 * authFetch / raw fetch directly.
 */

import { useEffect, useState } from "react";
import { apiFetch, apiPost, apiPatch } from "./apiFetch.js";

const APP_BASE = "/api/portal/app";

/** Build the namespaced URL for a client-portal-app request. */
function appUrl(projectId, path = "") {
  const clean = String(path || "").replace(/^\/+/, "");
  return clean ? `${APP_BASE}/${projectId}/${clean}` : `${APP_BASE}/${projectId}`;
}

// ─── Core helpers ──────────────────────────────────────────────────────────────

/**
 * GET /api/portal/app/:projectId/<path>
 * @returns {Promise<{ ok: boolean, data: object|null, error: string|null }>}
 */
export function portalGet(projectId, path) {
  return apiFetch(appUrl(projectId, path));
}

/**
 * POST /api/portal/app/:projectId/<path> with a JSON body.
 * @returns {Promise<{ ok: boolean, data: object|null, error: string|null }>}
 */
export function portalPost(projectId, path, body = {}) {
  return apiPost(appUrl(projectId, path), body);
}

/**
 * PATCH /api/portal/app/:projectId/<path> with a JSON body.
 * @returns {Promise<{ ok: boolean, data: object|null, error: string|null }>}
 */
export function portalPatch(projectId, path, body = {}) {
  return apiPatch(appUrl(projectId, path), body);
}

// ─── Session / projectId resolution ────────────────────────────────────────────

/**
 * Resolve the logged-in client's projectId.
 *
 * A client is linked to exactly one (or a small number of) active project via the
 * `projects` table (RLS-scoped to their account by portal_client_email). We read the
 * first active portal-enabled project, then confirm/enrich it via the session endpoint.
 *
 * @param {string} email — the logged-in client's email (from useAuth profile/user).
 * @returns {Promise<{ ok: boolean, projectId: string|null, error: string|null }>}
 */
export async function resolveClientProjectId() {
  // Resolve via the service-role API, NOT a direct `projects` query — RLS denies
  // clients all direct table access (migration 104). The client's Supabase Bearer
  // token is attached automatically by apiFetch.
  const { ok, data, error } = await apiFetch("/api/portal/my-projects");
  if (!ok) return { ok: false, projectId: null, error: error || "Could not load your project." };
  const projects = data?.projects || [];
  if (!projects.length) {
    return { ok: false, projectId: null, error: "No active project portal is linked to your account yet." };
  }
  // Prefer a v2-enabled project; otherwise the first active one.
  const chosen = projects.find((p) => p.portalV2Enabled) || projects[0];
  return { ok: true, projectId: chosen.projectId, error: null };
}

/**
 * GET /api/portal/app/:projectId/session — full session payload for a project.
 * @returns {Promise<{ ok, data: { session }, error }>}
 */
export function getPortalSession(projectId) {
  return portalGet(projectId, "session");
}

/**
 * useClientPortalProject — hook that resolves the current client's projectId and
 * session in one shot. Pages typically read projectId from the layout context
 * (useClientPortal), but this hook is the canonical resolver used by the layout.
 *
 * @param {string|undefined} email — logged-in client's email.
 * @param {number} [nonce=0] — bump to force a re-resolve (e.g. after an action).
 * @returns {{ loading: boolean, projectId: string|null, session: object|null, error: string|null }}
 */
export function useClientPortalProject(email, nonce = 0) {
  const [state, setState] = useState({
    loading: true,
    projectId: null,
    session: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    if (!email) {
      setState({ loading: false, projectId: null, session: null, error: "No client account." });
      return undefined;
    }
    setState((s) => ({ ...s, loading: true, error: null }));

    (async () => {
      const resolved = await resolveClientProjectId(email);
      if (cancelled) return;
      if (!resolved.ok) {
        setState({ loading: false, projectId: null, session: null, error: resolved.error });
        return;
      }
      const { ok, data, error } = await getPortalSession(resolved.projectId);
      if (cancelled) return;
      setState({
        loading: false,
        projectId: resolved.projectId,
        session: ok ? data?.session ?? null : null,
        error: ok ? null : error,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [email, nonce]);

  return state;
}
