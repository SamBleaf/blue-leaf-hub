// =============================================================================
// takeoffApi.js — the two transport adapters for the ONE takeoff UI.
//
//   createStaffTakeoffApi()   Hub      → /api/takeoff/...         via apiFetch (Supabase session)
//   createWorkerTakeoffApi()  PWA      → /api/worker/takeoff/...  via workerFetch (keeps the worker
//                                        token / admin-preview headers)
//
// Both return the same { ok, data, error, status, code } shape so components never care which
// shell they are in. Placement recording exists only on the staff adapter (admin, server-enforced).
// =============================================================================
import { apiFetch, apiStream } from "./apiFetch.js";
import { workerFetch } from "./workerFetch.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

/** Wrap the raw worker fetch in the apiFetch result contract. */
async function workerJson(url, options = {}) {
  try {
    const res = await workerFetch(url, options);
    const json = await res.json().catch(() => null);
    if (!res.ok || json?.ok === false) {
      return { ok: false, data: null, status: res.status, code: json?.code || null, error: json?.error || `Request failed (HTTP ${res.status})` };
    }
    return { ok: true, data: json, status: res.status, error: null };
  } catch (e) {
    return { ok: false, data: null, error: e?.message || "Network error", network: true };
  }
}

function makeApi(base, send, fetcher, extras = {}) {
  const get = (p) => send(`${base}${p}`);
  const post = (p, body) => send(`${base}${p}`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body ?? {}) });
  const patch = (p, body) => send(`${base}${p}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(body ?? {}) });
  return {
    shell: extras.shell,
    capabilities: (jobType, jobId) => get(`/capabilities${jobType && jobId ? `?jobType=${encodeURIComponent(jobType)}&jobId=${encodeURIComponent(jobId)}` : ""}`),
    job: (jobType, jobId) => get(`/jobs/${encodeURIComponent(jobType)}/${encodeURIComponent(jobId)}`),
    createWorkspace: (jobType, jobId, body) => post(`/jobs/${encodeURIComponent(jobType)}/${encodeURIComponent(jobId)}/workspaces`, body),
    workspace: (id) => get(`/workspaces/${id}`),
    commit: (id, body) => post(`/workspaces/${id}/commit`, body),
    presets: () => get("/presets"),
    suppliers: () => get("/suppliers"),
    // HUB 008: office staff add a supplier from the order — Hub and Worker app (the server checks who may)
    createSupplier: (body) => post("/suppliers", body),
    updateSupplier: (id, body) => patch(`/suppliers/${id}`, body),   // HUB 019
    // HUB 014: save a product's company cladding default (office logins on the Hub and in the Worker app)
    saveCompanyDefault: (body) => post("/company-defaults", body),
    // HUB 024: add an aluminium setup to the company products (same office logins; the server checks who may)
    saveCompanyProduct: (body) => post("/company-products", body),
    // HUB 013 / HUB 020: open (and for Flashings, bring up to date) the section's working draft; discard a draft
    openOrder: (wsId, body) => post(`/workspaces/${wsId}/orders/open`, body),
    discardOrder: (orderId, body) => post(`/orders/${orderId}/discard`, body),
    orders: (wsId) => get(`/workspaces/${wsId}/orders`),
    createOrder: (wsId, body) => post(`/workspaces/${wsId}/orders`, body),
    saveOrder: (orderId, body) => patch(`/orders/${orderId}`, body),
    previewOrder: (orderId) => get(`/orders/${orderId}/preview`),
    exportOrder: (orderId, body) => post(`/orders/${orderId}/exports`, body),
    retryExport: (exportId) => post(`/exports/${exportId}/retry`, {}),
    /** Plan bytes for the viewer (authorised each open; never a stored signed URL). */
    planBytes: (docId, opts) => apiStream(`${base}/documents/${docId}/content`, { ...opts, fetcher }),
    exportPdf: (exportId, opts) => apiStream(`${base}/exports/${exportId}/pdf`, { ...opts, fetcher }),
    /** Site appendix (cutting & setout) for an export — rendered from the same frozen snapshot, never part of the supplier PDF. */
    exportAppendix: (exportId, opts) => apiStream(`${base}/exports/${exportId}/appendix`, { ...opts, fetcher }),
    ...extras.more?.({ get, post, patch }),
  };
}

export function createStaffTakeoffApi() {
  return makeApi("/api/takeoff", apiFetch, undefined, {
    shell: "hub",
    more: ({ post }) => ({
      savePreset: (body) => post("/presets", body),
      placeOrder: (orderId, body) => post(`/orders/${orderId}/placements`, body),
      cancelPlacement: (placementId, reason) => post(`/placements/${placementId}/cancel`, { reason }),
    }),
  });
}

export function createWorkerTakeoffApi() {
  return makeApi("/api/worker/takeoff", workerJson, (url, opts) => workerFetch(url, opts), { shell: "worker" });
}

// wall-by-wall step 5: walls and runs use a time-ordered id, so walls saved together come back in the order traced
export { orderedId } from "./orderedId.js";

/** Random id for client-generated records (idempotent create/retry). */
export function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
