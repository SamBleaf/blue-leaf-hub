/**
 * xeroClient.mjs — Xero OAuth2 (auth-code) + DB-backed rotating-refresh-token store.
 *
 * Division of truth: XERO is the accounting source of truth (invoice numbers, GST, the
 * official PDF, the pay link, paid status). This module owns the CONNECTION only:
 *   • buildAuthorizeUrl / exchangeCodeForTokens — the in-app connect flow (writes
 *     xero_credentials, one row per authorised organisation/tenant)
 *   • getXeroAccessToken — returns a fresh 30-min access token, refreshing + persisting
 *     the ROTATED refresh token atomically. Xero rotates the refresh token on EVERY
 *     refresh; losing the new one means a manual reconnect, so persistence is the #1 risk.
 *   • xeroRequest — authenticated API helper (Bearer + xero-tenant-id, 429 back-off);
 *     returns parsed JSON, or a Buffer when `accept: "application/pdf"`.
 *
 * Modelled on dropboxClient.getDropboxAccessToken (:34) but DB-backed (xero_credentials,
 * migration 020) because Xero's rotation means the token MUST survive a restart.
 *
 * Fail-soft: throws XeroNotConnectedError (never crashes a route) when the app isn't
 * configured (XERO_CLIENT_ID/SECRET) or no tenant is connected — every caller catches it
 * and degrades. Nothing here runs or reaches the network until a route actually calls it.
 */
import crypto from "crypto";
import { getServiceSupabase } from "./supabaseService.mjs";
import { appBaseUrl } from "./appUrl.mjs";

const AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
const TOKEN_URL = "https://identity.xero.com/connect/token";
const CONNECTIONS_URL = "https://api.xero.com/connections";
const API_BASE = "https://api.xero.com/api.xro/2.0";
const DEFAULT_SCOPES =
  "openid profile email offline_access accounting.transactions accounting.contacts accounting.settings";
const ACCESS_SKEW_MS = 60_000; // treat a token as stale 60s before its real expiry

export class XeroNotConnectedError extends Error {
  constructor(message = "Xero is not connected", { needsReconnect = false } = {}) {
    super(message);
    this.name = "XeroNotConnectedError";
    this.needsReconnect = needsReconnect;
  }
}

export function xeroConfigured() {
  return !!(process.env.XERO_CLIENT_ID?.trim() && process.env.XERO_CLIENT_SECRET?.trim());
}

function xeroEnv() {
  const clientId = process.env.XERO_CLIENT_ID?.trim();
  const clientSecret = process.env.XERO_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const redirectUri =
    process.env.XERO_REDIRECT_URI?.trim() || `${appBaseUrl()}/api/public/xero/callback`;
  const scopes = process.env.XERO_SCOPES?.trim() || DEFAULT_SCOPES;
  return { clientId, clientSecret, redirectUri, scopes };
}

/** The exact redirect_uri we send to Xero — must match the one registered in the Xero app. */
export function xeroRedirectUri() {
  return xeroEnv()?.redirectUri || `${appBaseUrl()}/api/public/xero/callback`;
}

function basicAuthHeader(env) {
  return "Basic " + Buffer.from(`${env.clientId}:${env.clientSecret}`).toString("base64");
}

// ── Signed OAuth state (no server-side session store) ─────────────────────────
// state = base64url(JSON{n,ts}) + "." + HMAC-SHA256(payload, CLIENT_SECRET). Verified
// on the callback for integrity + freshness (≤10 min) — defeats CSRF on the redirect.
function b64url(buf) {
  return Buffer.from(buf).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s) {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString();
}
export function signState() {
  const env = xeroEnv();
  if (!env) throw new XeroNotConnectedError("Xero is not configured");
  const payload = b64url(JSON.stringify({ n: crypto.randomBytes(8).toString("hex"), ts: Date.now() }));
  const sig = b64url(crypto.createHmac("sha256", env.clientSecret).update(payload).digest());
  return `${payload}.${sig}`;
}
export function verifyState(state) {
  const env = xeroEnv();
  if (!env || typeof state !== "string" || !state.includes(".")) return false;
  const [payload, sig] = state.split(".");
  const expected = b64url(crypto.createHmac("sha256", env.clientSecret).update(payload).digest());
  const a = Buffer.from(sig || ""), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const { ts } = JSON.parse(b64urlDecode(payload));
    return typeof ts === "number" && Date.now() - ts < 10 * 60_000;
  } catch { return false; }
}

export function buildAuthorizeUrl(state) {
  const env = xeroEnv();
  if (!env) throw new XeroNotConnectedError("Xero is not configured");
  // Build the query with encodeURIComponent so the spaces in `scope` become %20.
  // URLSearchParams emits `+` for spaces, which Xero's authorize endpoint rejects as an
  // invalid scope token (→ error invalid_scope / 500). Xero requires %20-delimited scopes.
  const params = {
    response_type: "code",
    client_id: env.clientId,
    redirect_uri: env.redirectUri,
    scope: env.scopes,
    state,
  };
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `${AUTHORIZE_URL}?${qs}`;
}

/**
 * Exchange the auth code for tokens, discover the authorised organisation(s) via
 * GET /connections, and upsert one xero_credentials row per tenant. Returns the
 * connections array. Called once, from the OAuth callback.
 */
export async function exchangeCodeForTokens(code) {
  const env = xeroEnv();
  if (!env) throw new XeroNotConnectedError("Xero is not configured");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basicAuthHeader(env) },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: env.redirectUri }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error_description || json.error || `Xero token exchange failed (${res.status})`);
  const accessToken = json.access_token;
  const refreshToken = json.refresh_token;
  const expiresAt = new Date(Date.now() + (json.expires_in || 1800) * 1000).toISOString();

  const connRes = await fetch(CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  const connections = await connRes.json().catch(() => []);
  if (!connRes.ok || !Array.isArray(connections) || !connections.length) {
    throw new Error("Xero authorised but returned no organisations to connect.");
  }

  const sb = getServiceSupabase();
  if (!sb) throw new Error("Database is not configured.");
  const orgs = connections.filter((c) => !c.tenantType || c.tenantType === "ORGANISATION");
  const nowIso = new Date().toISOString();
  for (const c of (orgs.length ? orgs : connections)) {
    const { error } = await sb.from("xero_credentials").upsert({
      tenant_id: c.tenantId,
      tenant_name: c.tenantName || null,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      updated_at: nowIso,
    }, { onConflict: "tenant_id" });
    if (error) throw new Error(error.message);
  }
  return connections;
}

/** The most-recently-refreshed connected tenant (we operate a single Blue Leaf org). */
export async function getConnectedTenant() {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data } = await sb
    .from("xero_credentials")
    .select("tenant_id, tenant_name, expires_at, refresh_token, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.tenant_id || !data.refresh_token) return null;
  return data;
}

function isFresh(expiresAt) {
  if (!expiresAt) return false;
  return Date.now() < new Date(expiresAt).getTime() - ACCESS_SKEW_MS;
}

// Serialise refreshes per tenant within THIS process so concurrent callers don't each
// spend the (single-use) refresh token. Cross-process races (rare — one Railway instance)
// are caught by the compare-and-swap update + the invalid_grant re-read below.
const _refreshLocks = new Map();

/**
 * Return a fresh access token for a tenant, refreshing + persisting the rotated refresh
 * token if needed. Persistence is atomic: UPDATE ... WHERE refresh_token = <the one we
 * used> — 0 rows means another worker rotated first, so we re-read and use theirs.
 */
export async function getXeroAccessToken(tenantId) {
  const env = xeroEnv();
  if (!env) throw new XeroNotConnectedError("Xero is not configured");
  const sb = getServiceSupabase();
  if (!sb) throw new XeroNotConnectedError("Database is not configured");

  const readRow = async () => {
    if (tenantId) {
      const { data } = await sb.from("xero_credentials").select("*").eq("tenant_id", tenantId).maybeSingle();
      return data;
    }
    return getConnectedTenant().then(async (t) => {
      if (!t) return null;
      const { data } = await sb.from("xero_credentials").select("*").eq("tenant_id", t.tenant_id).maybeSingle();
      return data;
    });
  };

  const row = await readRow();
  if (!row?.refresh_token) throw new XeroNotConnectedError("Xero is not connected", { needsReconnect: true });
  if (row.access_token && isFresh(row.expires_at)) return { accessToken: row.access_token, tenantId: row.tenant_id };

  const key = row.tenant_id;
  // If a refresh for this tenant is already in flight in this process, wait for it, then re-read.
  if (_refreshLocks.has(key)) {
    await _refreshLocks.get(key).catch(() => {});
    const fresh = (await sb.from("xero_credentials").select("access_token, expires_at").eq("tenant_id", key).maybeSingle()).data;
    if (fresh?.access_token && isFresh(fresh.expires_at)) return { accessToken: fresh.access_token, tenantId: key };
  }

  const p = (async () => {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basicAuthHeader(env) },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: row.refresh_token }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (json.error === "invalid_grant") {
        // Another worker may have already consumed + rotated the token — re-read once.
        const fresh = (await sb.from("xero_credentials").select("*").eq("tenant_id", key).maybeSingle()).data;
        if (fresh?.refresh_token && fresh.refresh_token !== row.refresh_token && fresh.access_token && isFresh(fresh.expires_at)) {
          return { accessToken: fresh.access_token, tenantId: key };
        }
        throw new XeroNotConnectedError("Xero session expired — reconnect Xero.", { needsReconnect: true });
      }
      throw new Error(json.error_description || json.error || `Xero token refresh failed (${res.status})`);
    }
    const newAccess = json.access_token;
    const newRefresh = json.refresh_token || row.refresh_token;
    const newExpiry = new Date(Date.now() + (json.expires_in || 1800) * 1000).toISOString();
    const { data: updated } = await sb.from("xero_credentials")
      .update({ access_token: newAccess, refresh_token: newRefresh, expires_at: newExpiry, updated_at: new Date().toISOString() })
      .eq("tenant_id", key)
      .eq("refresh_token", row.refresh_token) // compare-and-swap: only if unchanged
      .select("access_token")
      .maybeSingle();
    if (!updated) {
      const fresh = (await sb.from("xero_credentials").select("access_token, expires_at").eq("tenant_id", key).maybeSingle()).data;
      if (fresh?.access_token) return { accessToken: fresh.access_token, tenantId: key };
    }
    return { accessToken: newAccess, tenantId: key };
  })();

  _refreshLocks.set(key, p);
  try {
    return await p;
  } finally {
    _refreshLocks.delete(key);
  }
}

/**
 * Authenticated Xero API call. Adds Bearer + xero-tenant-id, honours 429 Retry-After,
 * returns parsed JSON (default) or a Buffer for `accept: "application/pdf"`.
 * Throws XeroNotConnectedError (fail-soft) if not configured/connected.
 */
export async function xeroRequest(path, { method = "GET", tenantId, accept = "application/json", body, idempotencyKey, query } = {}) {
  const { accessToken, tenantId: tid } = await getXeroAccessToken(tenantId);
  let url = /^https?:\/\//.test(path) ? path : `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  if (query && typeof query === "object") {
    const u = new URL(url);
    for (const [k, v] of Object.entries(query)) if (v != null) u.searchParams.set(k, String(v));
    url = u.toString();
  }
  const headers = { Authorization: `Bearer ${accessToken}`, "xero-tenant-id": tid, Accept: accept };
  if (body != null) headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { method, headers, body: body != null ? JSON.stringify(body) : undefined });
    if (res.status === 429 && attempt < 3) {
      const retry = Number(res.headers.get("Retry-After")) || 2 ** attempt;
      await new Promise((r) => setTimeout(r, Math.min(retry, 60) * 1000));
      continue;
    }
    if (accept === "application/pdf") {
      if (!res.ok) throw new Error(`Xero PDF request failed (${res.status}).`);
      return Buffer.from(await res.arrayBuffer());
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = json?.Message || json?.Detail
        || json?.Elements?.[0]?.ValidationErrors?.[0]?.Message
        || `Xero API error (${res.status}).`;
      const e = new Error(msg);
      e.status = res.status;
      e.xero = json;
      throw e;
    }
    return json;
  }
  throw new Error("Xero API is rate-limited — try again shortly.");
}

/** Forget all stored Xero tokens (in-app "Disconnect"). Xero-side revocation is manual. */
export async function disconnectXero() {
  const sb = getServiceSupabase();
  if (!sb) return;
  await sb.from("xero_credentials").delete().not("tenant_id", "is", null);
}
