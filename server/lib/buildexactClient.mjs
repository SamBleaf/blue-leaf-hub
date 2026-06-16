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

/**
 * The Azure API Management subscription key — identifies Blue Leaf Building
 * as an approved API subscriber to Buildxact's gateway.
 *
 * Buildxact issues this separately from the user's login apiKey:
 *   1. Sign up at https://developer.buildxact.com, select a plan, await approval.
 *   2. After approval, retrieve Primary/Secondary keys from your developer portal profile.
 *
 * Set BUILDEXACT_SUBSCRIPTION_KEY to this value.
 * If it is NOT set, we fall back to BUILDEXACT_API_KEY (works when both are the same value,
 * which is the case for some Buildxact account tiers).
 */
function getSubscriptionKey() {
  return (
    _credentials?.subscriptionKey ||
    env("BUILDEXACT_SUBSCRIPTION_KEY") ||
    getApiKey()
  ).trim();
}

export function buildexactConfigured() {
  return Boolean(getEmail() && getApiKey() && getSubscriptionKey());
}

function apiBase() {
  return env("BUILDEXACT_API_URL") || DEFAULT_API;
}

function subscriptionHeaders() {
  const key = getSubscriptionKey();
  if (!key) throw new Error("BUILDEXACT_SUBSCRIPTION_KEY (or BUILDEXACT_API_KEY) is not set.");
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
      "Ocp-Apim-Subscription-Key": getSubscriptionKey() || apiKey,
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
      "Ocp-Apim-Subscription-Key": getSubscriptionKey() || apiKey,
      Accept: "application/json"
    },
    body: JSON.stringify({ email, apiKey, refreshToken: _refreshToken })
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
  const hasSubscriptionKey = Boolean(
    _credentials?.subscriptionKey || env("BUILDEXACT_SUBSCRIPTION_KEY")
  );
  return {
    configured,
    hasCachedToken: hasToken,
    tokenValid: valid,
    expiresAt: _accessExpiryMs > 0 ? new Date(_accessExpiryMs).toISOString() : null,
    credentialSource: _credentials ? "session_test" : configured ? "env" : "none",
    subscriptionKeySeparate: hasSubscriptionKey
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

// ─── OData response helpers (v3 collections may be a bare array or { value: [...] }) ──────
export function beList(res) {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.value)) return res.value;
  return [];
}
export function beFirst(res) {
  return beList(res)[0] || null;
}

// ─── Jobs (server prefix: /jobs) ──────────────────────────────────────────────────────
// JobDto has no "Name" field — filter on clientName when a term is given. OData property names
// follow the JSON DTOs (camelCase); GUID equality is unquoted. Verify casing live (Test Connection).
export async function getJobs(searchTerm) {
  const q = searchTerm
    ? { $filter: `contains(clientName,'${String(searchTerm).replace(/'/g, "''")}')` }
    : {};
  return beFetch("/jobs", { query: q });
}

// No bare GET /jobs/{id} exists in v3 — resolve a single job via the OData collection.
export async function getJobById(id) {
  return beFirst(await beFetch("/jobs", { query: { $filter: `jobId eq ${id}` } }));
}

const BX_GUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
// Buildxact keys jobs by a GUID `jobId`, but people know the human job number (e.g. "J1120").
// Accept either: a GUID passes straight through; a job number is matched client-side against the
// likely JobDto fields (the exact field isn't documented for our subscription, so we check the
// plausible ones plus a digits-only fallback). Returns { jobId, jobsSearched }.
export async function resolveBuildexactJobId(input) {
  const raw = String(input || "").trim();
  if (!raw) return { jobId: null, jobsSearched: 0 };
  if (BX_GUID_RE.test(raw)) return { jobId: raw, jobsSearched: 0 };

  const jobs = beList(await beFetch("/jobs", { query: { $top: 500 } }));
  const norm = (v) => String(v ?? "").trim().toLowerCase();
  const target = norm(raw);
  const targetDigits = target.replace(/\D/g, ""); // "j1120" -> "1120"
  const NUMBER_FIELDS = ["jobNumber", "jobNo", "job_no", "number", "reference", "code", "name", "displayName", "title"];

  const exact = jobs.find((j) => NUMBER_FIELDS.some((f) => norm(j?.[f]) === target));
  const byDigits = targetDigits
    ? jobs.find((j) => NUMBER_FIELDS.some((f) => norm(j?.[f]).replace(/\D/g, "") === targetDigits))
    : null;
  const match = exact || byDigits || null;

  return { jobId: match?.jobId || match?.JobId || null, jobsSearched: jobs.length };
}

export async function getJobItems(jobId) {            // actuals/committed costs (JobItemDto)
  return beFetch(`/jobs/${encodeURIComponent(jobId)}/items`);
}
export async function getJobVariations(jobId) {
  return beFetch(`/jobs/${encodeURIComponent(jobId)}/variations`);
}
export async function getJobInvoices(jobId) {
  return beFetch(`/jobs/${encodeURIComponent(jobId)}/invoices`);
}
export async function getPurchaseOrders(jobId) {
  return beFetch(`/jobs/${encodeURIComponent(jobId)}/purchaseorders`);
}

// POST /jobs/purchaseorders/create — PurchaseOrderCreateOptionsDto (jobId is IN THE BODY).
// options: { jobId, orderType:'Purchase'|'Work', contactId?, description?, requiredByDate?,
//   items:[{ costItemType:'Material'|'Labour'|'SubContractor'|'Equipment'|'MatLab', description,
//            quantity, unitCost, totalCost, uom, itemCode?, notes? }] }
export async function createPurchaseOrder(options) {
  return beFetch("/jobs/purchaseorders/create", { method: "POST", body: options });
}

// DELETE /jobs/purchaseorders/{id} — only 'Unsent' orders can be deleted (soft delete).
export async function deletePurchaseOrder(id) {
  return beFetch(`/jobs/purchaseorders/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// POST /jobs/create — JobCreateOptionsDto.
export async function createJob(options) {
  return beFetch("/jobs/create", { method: "POST", body: options });
}

// ─── Estimates (server prefix: /estimates) ──────────────────────────────────────────────
export async function getEstimatesByJob(jobId) {
  return beList(await beFetch("/estimates", { query: { $filter: `jobId eq ${jobId}` } }));
}
export async function getEstimateItems(estimateId) {  // EstimateItemDto (costCategory, unitCost, total…)
  return beFetch(`/estimates/${encodeURIComponent(estimateId)}/items`);
}

// ─── Clients / Customers (server prefix: /clients) ──────────────────────────────────────
export async function getCustomers() {
  return beFetch("/clients");
}
export async function createCustomer(options) {       // CreateCustomerOptionsDto { name, email, ... }
  return beFetch("/clients", { method: "POST", body: options });
}
export async function getCustomerContacts(customerId) {
  return beFetch(`/clients/${encodeURIComponent(customerId)}/contacts`);
}
export async function createCustomerContact(customerId, options) {  // { firstName, lastName, email?, ... }
  return beFetch(`/clients/${encodeURIComponent(customerId)}/contacts`, { method: "POST", body: options });
}

// ─── Contacts: suppliers / subcontractors (server prefix: /contacts) ────────────────────
export async function getContacts() {
  return beFetch("/contacts");
}
export async function createContact(options) {        // CreateContactOptionsDto { contactType, name, ... }
  return beFetch("/contacts", { method: "POST", body: options });
}

// ─── Leads (server prefix: /leads) ──────────────────────────────────────────────────────
export async function getLeads() {
  return beFetch("/leads");
}
export async function createLead(options) {           // CreateLeadOptionsDto { clientName, customerId, customerContactId, ... }
  return beFetch("/leads", { method: "POST", body: options });
}
export async function updateLead(options) {           // PUT /leads — OverwriteLeadOptionsDto (id in body; overwrite)
  return beFetch("/leads", { method: "PUT", body: options });
}

// ─── Catalogues: recipe / price-book (server prefix: /catalogues) ───────────────────────
export async function getCatalogues() {
  return beFetch("/catalogues");
}
export async function getCatalogueItems(catalogueId) {
  return beFetch(`/catalogues/${encodeURIComponent(catalogueId)}/items`);
}
export async function searchCatalogueItems({ text, catalogueIds, categoryIds, top = 50, skip = 0 } = {}) {
  return beFetch("/catalogues/items/search", { query: { text, catalogueIds, categoryIds, top, skip } });
}

// ─── Documents (server prefix: /metadata/storage) ───────────────────────────────────────
export async function listDocuments(reference) {
  return beFetch("/metadata/storage/documents/list", { query: { reference } });
}

// ─── Schedules (server prefix: /metadata) — referenceType: 'Job' | 'Estimate' ──────────
export async function getSchedule(referenceType, referenceId) {
  return beFetch(`/metadata/schedules/${encodeURIComponent(referenceType)}/${encodeURIComponent(referenceId)}`);
}
