/**
 * buildexactSync.mjs — pull a Buildxact job's headline financials into the Hub mirror table
 * `buildexact_job_sync` (Phase-1: Buildxact = financial system of record; Hub mirrors for visibility
 * + reconciliation). Read-from-Buildxact, write-to-Hub only. Requires migration 075.
 */
import { getServiceSupabase } from "./supabaseService.mjs";
import {
  buildexactConfigured, getJobById, getEstimatesByJob, getPurchaseOrders, beList
} from "./buildexactClient.mjs";
import { normaliseAddress } from "./addressNormalise.mjs";

const n = (x) => { const v = Number(x); return Number.isFinite(v) ? v : 0; };

export async function syncBuildexactJob(buildexactJobId) {
  if (!buildexactConfigured()) throw new Error("Buildxact is not configured.");
  const sb = getServiceSupabase();
  if (!sb) throw new Error("Supabase service role not configured.");

  const job = await getJobById(buildexactJobId);
  if (!job) throw new Error(`Buildxact job ${buildexactJobId} not found.`);

  const estimates = beList(await getEstimatesByJob(buildexactJobId).catch(() => []));
  const est = estimates.find((e) => e?.isAccepted) ||
    [...estimates].sort((a, b) => new Date(b?.modifiedAt || 0) - new Date(a?.modifiedAt || 0))[0] || null;

  let pos = [];
  try { pos = beList(await getPurchaseOrders(buildexactJobId)); } catch { /* leave empty */ }
  const poEx = pos.reduce((s, p) => s + n(p.orderTotalExTax), 0);

  // Link to a Hub job: explicit buildexact_job_id, else normalised-address match.
  let hubJobId = null;
  const linked = await sb.from("jobs").select("id").eq("buildexact_job_id", buildexactJobId).maybeSingle();
  if (linked.data) hubJobId = linked.data.id;
  if (!hubJobId) {
    const addr = normaliseAddress(job.worksLocationAddress || job.clientAddress || "");
    if (addr.normalised) {
      const { data } = await sb.from("jobs").select("id").eq("address_normalised", addr.normalised).limit(1);
      if (data?.[0]) hubJobId = data[0].id;
    }
  }

  const row = {
    job_id: hubJobId,
    buildexact_job_id: buildexactJobId,
    job_number: job.number || null,
    client_name: job.clientName || null,
    address: job.worksLocationAddress || job.clientAddress || null,
    contract_ex: n(job.contractTotal),
    contract_gst: n(job.contractTax),
    estimate_ex: est ? n(est.total) : null,
    markup: est ? n(est.markup) : null,
    actual_ex: n(job.actualTotal),
    claims_ex: n(job.paymentTotal),
    claims_gst: n(job.paymentTax),
    variations_ex: n(job.variationTotal),
    variations_gst: n(job.variationTax),
    po_count: pos.length,
    po_ex: poEx,
    estimate_id: est?.estimateId || null,
    raw: { job, estimate: est, purchaseOrders: pos },
    synced_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from("buildexact_job_sync")
    .upsert(row, { onConflict: "buildexact_job_id" })
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
