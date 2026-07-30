/**
 * apiFetch.js — Blue Leaf Hub frontend fetch standard.
 *
 * EVERY page component must use apiFetch/apiPost/apiPatch/apiDelete.
 * Never call authFetch() directly in page components.
 * See CLAUDE.md § Standards for the full law.
 *
 * All functions return { ok, data, error } — never throw.
 *   ok    — true if HTTP status is 2xx AND (data.ok !== false)
 *   data  — parsed JSON body (null on error)
 *   error — plain-English string (null on success)
 */

import { authFetch } from "./authFetch.js";

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

/**
 * General-purpose authenticated fetch.
 * Checks both HTTP status and JSON `ok` field.
 */
export async function apiFetch(url, options = {}) {
  try {
    const res = await authFetch(url, options);
    const json = await res.json().catch(() => null);

    if (!res.ok || json?.ok === false) {
      return {
        ok: false,
        data: null,
        error: json?.error || `Request failed (HTTP ${res.status})`,
      };
    }

    return { ok: true, data: json, error: null };
  } catch (e) {
    return { ok: false, data: null, error: e?.message || "Network error" };
  }
}

/**
 * Authenticated binary fetch — for endpoints that stream a file (e.g. a PDF) rather than JSON.
 * Returns { ok, blob, error }. Use instead of apiFetch when the response is not JSON.
 */
export async function apiBlob(url, options = {}) {
  try {
    const res = await authFetch(url, options);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      return { ok: false, blob: null, error: j?.error || `Request failed (HTTP ${res.status})` };
    }
    return { ok: true, blob: await res.blob(), error: null };
  } catch (e) {
    return { ok: false, blob: null, error: e?.message || "Network error" };
  }
}

// ─── Convenience methods ──────────────────────────────────────────────────────

/**
 * POST with JSON body.
 */
export async function apiPost(url, body) {
  return apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * PUT with JSON body.
 */
export async function apiPut(url, body) {
  return apiFetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * PATCH with JSON body.
 */
export async function apiPatch(url, body) {
  return apiFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * DELETE (no body).
 */
export async function apiDelete(url) {
  return apiFetch(url, { method: "DELETE" });
}

// ─── File upload helper ───────────────────────────────────────────────────────

/**
 * POST a FormData body (file upload). Does not set Content-Type — browser sets multipart boundary.
 */
export async function apiUpload(url, formData) {
  return apiFetch(url, { method: "POST", body: formData });
}
