import { loadRuntime } from "./runtime.mjs";
import { getAccessToken } from "./auth.mjs";

export function apiBase() {
  return loadRuntime().apiUrl || "http://127.0.0.1:8787";
}

export async function apiFetch(path, { method = "GET", token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-json */
  }
  return { status: res.status, body: json };
}

export async function apiAsRole(role, path, opts = {}) {
  const user = loadRuntime().users[role];
  const token = await getAccessToken(user.email, user.password);
  return apiFetch(path, { ...opts, token });
}

/** Scan JSON for forbidden internal field names / secret markers */
export function leakScan(obj, forbidden) {
  const s = JSON.stringify(obj ?? {});
  return forbidden.filter((k) => s.includes(k));
}

export const FORBIDDEN_CLIENT_LEAKS = [
  "cost_to_builder",
  "costToBuilder",
  "amount_ex_gst",
  "amountExGst",
  "cost_delta",
  "costDelta",
  "internal_notes",
  "internalNotes",
  "SECRET_MARGIN",
  "SECRET_SUPPLIER",
  "forecast_total_cost",
  "target_margin_pct",
];
