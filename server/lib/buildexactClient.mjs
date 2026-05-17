/**
 * Buildxact / Buildexact API v3 — first-party auth (official flow).
 *
 * Env:
 *   BUILDEXACT_API_URL   (default https://api-v3.buildxact.com)
 *   BUILDEXACT_USERNAME  (Buildxact login email)
 *   BUILDEXACT_API_KEY   (subscription key + login apiKey body)
 *
 * Optional in-memory override: set by successful POST /api/buildexact/test-connection
 * with { email, apiKey } so the same process can call APIs without .env until restart.
 *
 * Rules: Ocp-Apim-Subscription-Key on every request; cache access token until near expiry;
 * refresh when expired; login again if refresh fails.
 */

const DEFAULT_API = "https://api-v3.buildxact.com";

function env(name) {
  return process.env[name]?.trim() || "";
}

/** Runtime credentials (e.g. last successful “test” from Settings). */
let _credentials = null;

export function clearBuildexactSessionOverride() {
  _credentials = null;
  _accessToken = null;
  _refreshToken = null;
  _accessExpiryMs = 0;
}

function getEmail() {
  return (_credentials?.email || env("BUILDEXACT_USERNAME")).trim();
}

function getApiKey() {
  return (_credentials?.apiKey || env("BUILDEXACT_API_KEY")).trim();
}

export function buildexactConfigured() {
  return Boolean(getEmail() && getApiKey());
}

function apiBase() {
  return env("BUILDEXACT_API_URL") || DEFAULT_API;
}

function subscriptionHeaders() {
  const key = getApiKey();
  if (!key) throw new Error("BUILDEXACT_API_KEY is not set.");
  return {
    "Content-Type": "application/json",
    "Ocp-Apim-Subscription-Key": key,
    Accept: "application/json"
  };
}

let _accessToken = null;
let _refreshToken = null;
let _accessExpiryMs = 0;

function parseLoginPayload(json) {
  const access =
    json?.accessToken ?? json?.access_token ?? json?.AccessToken ?? json?.token ?? null;
  const refresh =
    json?.refreshToken ?? json?.refresh_token ?? json?.RefreshToken ?? null;
  let expiresIn = json?.expiresIn ?? json?.expires_in ?? json?.ExpiresIn;
  if (expiresIn == null || expiresIn === "") expiresIn = 3600;
  const n = Number(expiresIn);
  const expiresInSec = Number.isFinite(n) && n > 0 ? n : 3600;
  return { access, refresh, expiresInSec };
}

/**
 * Login and replace in-memory session.
 * @param {string} [emailOverride]
 * @param {string} [apiKeyOverride]
 */
export async function buildexactLogin(emailOverride, apiKeyOverride) {
  const email = (emailOverride ?? getEmail()).trim();
  const apiKey = (apiKeyOverride ?? getApiKey()).trim();
  if (!email || !apiKey) {
    throw new Error("Buildxact login requires email and API key.");
  }

  const base = apiBase().replace(/\/$/, "");
  const url = `${base}/accounts/auth/login`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": apiKey,
      Accept: "application/json"
    },
    body: JSON.stringify({ email, apiKey })
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const msg =
      json?.message ||
      json?.error ||
      json?.title ||
      json?.detail ||
      text ||
      `Buildxact login failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }

  const { access, refresh, expiresInSec } = parseLoginPayload(json);
  if (!access || typeof access !== "string") {
    throw new Error("Buildxact login response missing accessToken.");
  }

  const now = Date.now();
  _accessToken = access;
  _refreshToken = refresh && typeof refresh === "string" ? refresh : null;
  _accessExpiryMs = now + expiresInSec * 1000;

  if (emailOverride != null && apiKeyOverride != null) {
    _credentials = { email: String(emailOverride).trim(), apiKey: String(apiKeyOverride).trim() };
  }

  return { accessToken: _accessToken, expiresIn: expiresInSec };
}

async function buildexactRefresh() {
  const email = getEmail();
  const apiKey = getApiKey();
  if (!_refreshToken || !email) {
    return false;
  }

  const base = apiBase().replace(/\/$/, "");
  const url = `${base}/accounts/auth/refresh-token`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": apiKey,
      Accept: "application/json"
    },
    body: JSON.stringify({ email, refreshToken: _refreshToken })
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }

  if (!res.ok) {
    _accessToken = null;
    _refreshToken = null;
    _accessExpiryMs = 0;
    return false;
  }

  const { access, refresh, expiresInSec } = parseLoginPayload(json);
  if (!access) return false;

  const now = Date.now();
  _accessToken = access;
  if (refresh && typeof refresh === "string") {
    _refreshToken = refresh;
  }
  _accessExpiryMs = now + expiresInSec * 1000;
  return true;
}

/**
 * Returns a valid access token, refreshing or logging in as needed.
 */
export async function getBuildexactToken() {
  if (!buildexactConfigured()) {
    throw new Error(
      "Buildxact is not configured — set BUILDEXACT_USERNAME and BUILDEXACT_API_KEY in `.env`, or use Test connection with email + API key."
    );
  }

  const now = Date.now();
  const margin = 60_000;
  if (_accessToken && now < _accessExpiryMs - margin) {
    return _accessToken;
  }

  if (_refreshToken) {
    const ok = await buildexactRefresh();
    if (ok && _accessToken && now < _accessExpiryMs - margin) {
      return _accessToken;
    }
  }

  await buildexactLogin();
  return _accessToken;
}

/**
 * Non-secret status for Settings / health checks.
 */
export function getBuildexactTokenStatus() {
  const now = Date.now();
  const configured = buildexactConfigured();
  const hasToken = Boolean(_accessToken);
  const valid = Boolean(_accessToken && now < _accessExpiryMs - 60_000);
  return {
    configured,
    hasCachedToken: hasToken,
    tokenValid: valid,
    expiresAt: _accessExpiryMs > 0 ? new Date(_accessExpiryMs).toISOString() : null,
    credentialSource: _credentials ? "session_test" : configured ? "env" : "none"
  };
}

export async function beFetch(path, { method = "GET", body, query } = {}) {
  const token = await getBuildexactToken();
  const apiKey = getApiKey();
  const base = apiBase().replace(/\/$/, "");
  const rel = path.startsWith("/") ? path : `/${path}`;
  const u = new URL(path.startsWith("http") ? path : `${base}${rel}`);
  if (query && typeof query === "object") {
    for (const [k, v] of Object.entries(query)) {
      if (v != null && v !== "") u.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(u, {
    method,
    headers: {
      ...subscriptionHeaders(),
      "Ocp-Apim-Subscription-Key": apiKey,
      Authorization: `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(json.message || json.error || json.title || text || `Buildxact ${method} ${path} (${res.status})`);
  }
  return json;
}

export async function getJobs(searchTerm) {
  const q = searchTerm
    ? { $filter: `contains(Name,'${String(searchTerm).replace(/'/g, "''")}')` }
    : {};
  return beFetch("/jobs", { query: q });
}

export async function getJobById(id) {
  return beFetch(`/jobs/${encodeURIComponent(id)}`);
}

export async function createPurchaseOrder(jobId, poData) {
  return beFetch(`/jobs/${encodeURIComponent(jobId)}/purchase_orders`, {
    method: "POST",
    body: poData
  });
}

export async function getPurchaseOrders(jobId) {
  return beFetch(`/jobs/${encodeURIComponent(jobId)}/purchase_orders`);
}

export async function syncQuotesToJob(buildexactJobId, acceptedTrades) {
  return beFetch(`/jobs/${encodeURIComponent(buildexactJobId)}/costs/sync`, {
    method: "POST",
    body: { accepted_trades: acceptedTrades }
  });
}

export async function getJobEstimateItems(buildexactJobId) {
  return beFetch(`/jobs/${encodeURIComponent(buildexactJobId)}/estimateitems`);
}

export async function getJobEstimates(buildexactJobId) {
  return beFetch(`/jobs/${encodeURIComponent(buildexactJobId)}/estimates`);
}

export async function updateEstimateItem(buildexactJobId, itemId, updates) {
  return beFetch(`/jobs/${encodeURIComponent(buildexactJobId)}/estimateitems/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    body: updates
  });
}

export async function acceptEstimate(buildexactJobId, estimateId) {
  return beFetch(`/jobs/${encodeURIComponent(buildexactJobId)}/estimates/${encodeURIComponent(estimateId)}/accept`, {
    method: "POST"
  });
}

export async function updateEstimateStatus(buildexactJobId, estimateId, status) {
  return beFetch(`/jobs/${encodeURIComponent(buildexactJobId)}/estimates/${encodeURIComponent(estimateId)}`, {
    method: "PATCH",
    body: { status }
  });
}
