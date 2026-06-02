/**
 * buildexactReconcile.mjs — DEV/TROUBLESHOOTING TOOL (not user-facing).
 *
 * Pulls a job's headline numbers from BOTH Buildxact (live API) and Blue Leaf Hub (Supabase),
 * lays them side-by-side, and flags any mismatch (> $1 tolerance). Used by you + the agent to
 * verify the sync landed and the Hub's own maths agree with Buildxact while we build/audit.
 *
 * Run via: node scripts/reconcile-buildxact.mjs <jobId | address-or-name | all>
 */
import { getServiceSupabase } from "./supabaseService.mjs";
import { normaliseAddress } from "./addressNormalise.mjs";
import {
  buildexactLogin, getJobs, getJobById, getEstimatesByJob, getPurchaseOrders, beList
} from "./buildexactClient.mjs";

const TOLERANCE = 1; // dollars — within $1 counts as a match (rounding noise)
const n = (x) => { const v = Number(x); return Number.isFinite(v) ? v : 0; };
const isGuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || "").trim());

// ── Resolve a Buildxact job from a guid / address / name / number ──────────────────────────
export async function resolveBxJob(arg) {
  if (isGuid(arg)) {
    const job = await getJobById(arg);
    return job ? [job] : [];
  }
  const all = beList(await getJobs(""));
  if (!arg || arg === "all") return all;
  const q = String(arg).toLowerCase();
  return all.filter((j) =>
    `${j.number || ""} ${j.clientName || ""} ${j.worksLocationAddress || ""} ${j.clientAddress || ""} ${j.description || ""}`
      .toLowerCase().includes(q)
  );
}

// ── Buildxact side (live API) ───────────────────────────────────────────────────────────────
async function bxSide(job) {
  const estimates = beList(await getEstimatesByJob(job.jobId).catch(() => []));
  const est = estimates.find((e) => e?.isAccepted) ||
    [...estimates].sort((a, b) => new Date(b?.modifiedAt || 0) - new Date(a?.modifiedAt || 0))[0] || null;
  let poCount = 0, poEx = 0;
  try {
    const pos = beList(await getPurchaseOrders(job.jobId));
    poCount = pos.length;
    poEx = pos.reduce((s, p) => s + n(p.orderTotalExTax), 0);
  } catch { /* leave 0 */ }
  return {
    client: job.clientName || "",
    address: job.worksLocationAddress || job.clientAddress || "",
    contractEx: n(job.contractTotal),
    contractGst: n(job.contractTax),
    estimateEx: est ? n(est.total) : null,
    markup: est ? n(est.markup) : null,
    actualEx: n(job.actualTotal),
    poCount, poEx,
    claimsEx: n(job.paymentTotal),
    claimsGst: n(job.paymentTax),
    varEx: n(job.variationTotal),
    varGst: n(job.variationTax),
  };
}

// ── Hub side (Supabase) — finds the linked Hub job, else auto-matches by address/number ──────
async function hubSide(sb, bxJob) {
  // 1) explicit link, else 2) normalised-address match, else 3) job number match
  let hubJob = null, matchedBy = "none";
  const byLink = await sb.from("jobs").select("*").eq("buildexact_job_id", bxJob.jobId).maybeSingle();
  if (byLink.data) { hubJob = byLink.data; matchedBy = "buildexact_job_id"; }
  if (!hubJob) {
    const addr = normaliseAddress(bxJob.worksLocationAddress || bxJob.clientAddress || "");
    if (addr.normalised) {
      const { data } = await sb.from("jobs").select("*").eq("address_normalised", addr.normalised).limit(1);
      if (data?.[0]) { hubJob = data[0]; matchedBy = "address"; }
    }
  }
  if (!hubJob) return { hubJob: null, matchedBy: "no Hub job found", metrics: null };

  const jid = hubJob.id;
  const sum = (rows, col) => (rows || []).reduce((s, r) => s + n(r[col]), 0);
  const claims = (await sb.from("progress_claims").select("amount_ex_gst,gst_amount,status").eq("job_id", jid)).data || [];
  const liveClaims = claims.filter((c) => !["draft", "void"].includes(c.status));
  const vars = (await sb.from("job_variations").select("amount_ex_gst,gst_amount,status").eq("job_id", jid)).data || [];
  const signed = vars.filter((v) => v.status === "signed");
  const pos = (await sb.from("purchase_orders").select("total_amount,gst_amount").eq("job_id", jid)).data || [];
  const budgets = (await sb.from("job_budgets").select("budget_amount").eq("job_id", jid)).data || [];
  const signedVarEx = sum(signed, "amount_ex_gst");

  const metrics = {
    client: hubJob.client_name || "",
    address: hubJob.address || "",
    contractEx: n(hubJob.original_contract_value) + signedVarEx,
    contractGst: (n(hubJob.original_contract_value) + signedVarEx) * 0.1,
    estimateEx: budgets.length ? sum(budgets, "budget_amount") : null,
    markup: null, // Hub doesn't track estimate markup separately
    actualEx: null, // (out of scope for v1 — wire to approved financial_documents later)
    poCount: pos.length, poEx: sum(pos, "total_amount"),
    claimsEx: sum(liveClaims, "amount_ex_gst"),
    claimsGst: sum(liveClaims, "gst_amount"),
    varEx: signedVarEx,
    varGst: sum(signed, "gst_amount"),
  };
  return { hubJob, matchedBy, metrics };
}

// ── Build comparison rows ─────────────────────────────────────────────────────────────────
function rowsFor(bx, hub) {
  const money = (label, b, h) => {
    if (b == null && (!hub || h == null)) return { label, bx: "—", hub: "—", match: "—" };
    if (!hub || h == null) return { label, bx: fmt(b), hub: "—", match: "n/a" };
    if (b == null) return { label, bx: "—", hub: fmt(h), match: "n/a" };
    const ok = Math.abs(b - h) <= TOLERANCE;
    return { label, bx: fmt(b), hub: fmt(h), match: ok ? "OK" : `DIFF ${fmt(h - b)}` };
  };
  const text = (label, b, h) => ({
    label, bx: b || "—", hub: (hub ? (h || "—") : "—"),
    match: !hub ? "—" : ((b || "").trim().toLowerCase() === (h || "").trim().toLowerCase() ? "OK" : "differs")
  });
  return [
    text("Client", bx.client, hub?.client),
    text("Address", bx.address, hub?.address),
    money("Contract (ex GST)", bx.contractEx, hub?.contractEx),
    money("  GST (contract)", bx.contractGst, hub?.contractGst),
    money("Estimate cost (ex)", bx.estimateEx, hub?.estimateEx),
    money("  Markup (estimate)", bx.markup, hub?.markup),
    money("Actual costs (ex)", bx.actualEx, hub?.actualEx),
    money("POs total (ex)", bx.poEx, hub?.poEx),
    { label: "POs count", bx: String(bx.poCount), hub: hub ? String(hub.poCount) : "—",
      match: !hub ? "—" : (bx.poCount === hub.poCount ? "OK" : `DIFF ${(hub.poCount - bx.poCount)}`) },
    money("Claims to date (ex)", bx.claimsEx, hub?.claimsEx),
    money("  GST (claims)", bx.claimsGst, hub?.claimsGst),
    money("Variations signed (ex)", bx.varEx, hub?.varEx),
    money("  GST (variations)", bx.varGst, hub?.varGst),
  ];
}

function fmt(v) {
  if (v == null) return "—";
  const neg = v < 0;
  const s = "$" + Math.abs(v).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return neg ? `-${s}` : s;
}

export async function reconcileOne(sb, bxJob) {
  const bx = await bxSide(bxJob);
  const { hubJob, matchedBy, metrics } = await hubSide(sb, bxJob);
  return { bxJob, hubJob, matchedBy, rows: rowsFor(bx, metrics) };
}

export function renderReport({ bxJob, hubJob, matchedBy, rows }) {
  const lines = [];
  lines.push("");
  lines.push(`Job: ${bxJob.number || ""}  ${bxJob.clientName || ""}  ${bxJob.worksLocationAddress || bxJob.clientAddress || ""}`.trim());
  lines.push(`  Buildxact jobId: ${bxJob.jobId}`);
  lines.push(`  Hub job: ${hubJob ? `${hubJob.id} (matched by ${matchedBy})` : `NOT LINKED (${matchedBy})`}`);
  lines.push("");
  const pad = (s, w) => { const str = String(s); return (str.length > w - 1 ? str.slice(0, w - 2) + "…" : str).padEnd(w); };
  lines.push(`  ${pad("Metric", 24)}${pad("Buildxact", 18)}${pad("Blue Leaf Hub", 18)}Match`);
  lines.push(`  ${"-".repeat(24 + 18 + 18 + 6)}`);
  for (const r of rows) {
    lines.push(`  ${pad(r.label, 24)}${pad(r.bx, 18)}${pad(r.hub, 18)}${r.match}`);
  }
  return lines.join("\n");
}
