/** Cost Intelligence — Buildxact template + per-job estimate API helpers. */
import { authFetch } from "./authFetch.js";

export async function fetchBuildxactTemplate() {
  const res = await authFetch("/api/cost-intelligence/template");
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Failed to load template");
  return json;
}

export async function fetchJobEstimateBreakdown(jobId) {
  const res = await fetch(`/api/cost-intelligence/jobs/${jobId}/estimate`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Failed to load estimate");
  return json;
}

export async function syncJobEstimateFromBuildxact(jobId) {
  const res = await fetch(`/api/cost-intelligence/jobs/${jobId}/sync-estimate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Sync failed");
  return json;
}
