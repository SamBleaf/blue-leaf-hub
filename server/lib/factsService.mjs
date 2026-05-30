// factsService.mjs — the single read/write path for canonical facts (Phase 0 foundation).
// See docs/agent_knowledge/MASTER_DATA_DICTIONARY.md (Parts 2-5) + CLAUDE.md Canonical Data Law.
//
// NOT WIRED YET. No route imports this until the Phase 1+ cutover (verified with the app).
// Provenance authority = latest job_fact_history row per (job_id, fact_key).
//
// Rules enforced here:
//  - Generated facts are never written (computed live).
//  - Consequential facts from extraction are recorded as PENDING suggestions and require
//    confirmFact() before the canonical value is written. Internal facts >=0.90 auto-apply.
//  - Every write logs job_fact_history + emits a job_events row.

import { getServiceSupabase } from "./supabaseService.mjs";
import { getFactDef, factsForSpine } from "./jobFactRegistry.mjs";

const APPLIED_STATUSES = new Set(["manual", "confirmed", "extracted_applied"]);

function serialize(value, valueType) {
  if (value === null || value === undefined) return null;
  if (valueType === "json") return JSON.stringify(value);
  return String(value);
}

function inferValueType(def, value) {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (value !== null && typeof value === "object") return "json";
  return "text";
}

/** Resolve the lifecycle status for a write given source/confidence + the fact's tier. */
function resolveStatus(def, { status, source = "manual", confidence } = {}) {
  if (status) return status;
  if (source === "extraction") {
    if (def.tier === "consequential") return "extracted_flagged"; // always confirm
    return Number(confidence) >= 0.9 ? "extracted_applied" : "extracted_flagged";
  }
  return "manual";
}

/** Read the current stored value for a stored (non-generated) fact. */
async function readStoredValue(sb, jobId, def) {
  if (!def.store) return null;
  const { table, column } = def.store;
  const keyCol = table === "jobs" ? "id" : "job_id";
  const { data, error } = await sb.from(table).select(column).eq(keyCol, jobId).maybeSingle();
  if (error) throw error;
  return data ? data[column] : null;
}

/** Write a stored value (jobs by id; project_metrics by job_id, upserting the row). */
async function writeStoredValue(sb, jobId, def, value) {
  const { table, column } = def.store;
  if (table === "jobs") {
    const { error } = await sb.from("jobs").update({ [column]: value }).eq("id", jobId);
    if (error) throw error;
    return;
  }
  // project_metrics — upsert by job_id (1:1)
  const { data: existing, error: selErr } = await sb
    .from("project_metrics").select("id").eq("job_id", jobId).maybeSingle();
  if (selErr) throw selErr;
  if (existing) {
    const { error } = await sb.from("project_metrics").update({ [column]: value }).eq("job_id", jobId);
    if (error) throw error;
  } else {
    const { error } = await sb.from("project_metrics").insert([{ job_id: jobId, [column]: value }]);
    if (error) throw error;
  }
}

async function latestProvenance(sb, jobId, factKey) {
  const { data, error } = await sb
    .from("job_fact_history")
    .select("source, source_document_id, confidence, status, changed_by, changed_at")
    .eq("job_id", jobId).eq("fact_key", factKey)
    .order("changed_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data || null;
}

/** Emit a job_events row (best-effort; never throws into the caller's transaction). */
export async function emitEvent(jobId, eventType, { actorId = null, source = "system", entityType = null, entityId = null, metadata = {} } = {}) {
  const sb = getServiceSupabase();
  if (!sb) return;
  await sb.from("job_events").insert([{
    job_id: jobId, event_type: eventType, actor_id: actorId, source,
    entity_type: entityType, entity_id: entityId, metadata,
  }]).then(({ error }) => { if (error) console.warn("[factsService] emitEvent:", error.message); });
}

// ── Generated fact computations (read-only) ─────────────────────────────────
async function computeContractValue(sb, jobId) {
  const { data: job } = await sb.from("jobs").select("original_contract_value, contract_value").eq("id", jobId).maybeSingle();
  const base = Number(job?.original_contract_value ?? job?.contract_value ?? 0);
  const { data: vars } = await sb.from("job_variations").select("amount_ex_gst").eq("job_id", jobId).eq("status", "signed");
  const signed = (vars || []).reduce((s, v) => s + Number(v.amount_ex_gst || 0), 0);
  return base + signed;
}
async function computeActualCosts(sb, jobId) {
  const { data: docs } = await sb.from("financial_documents")
    .select("amount_ex_gst, approved_amount, status").eq("job_id", jobId)
    .in("status", ["approved", "filed", "xero_synced"]);
  return (docs || []).reduce((s, d) => s + Number(d.approved_amount ?? d.amount_ex_gst ?? 0), 0);
}
async function computeForecastMarginPct(sb, jobId) {
  const cv = await computeContractValue(sb, jobId);
  if (!cv) return null;
  const { data: job } = await sb.from("jobs").select("forecast_total_cost").eq("id", jobId).maybeSingle();
  const ftc = Number(job?.forecast_total_cost ?? 0);
  return Math.round(((cv - ftc) / cv) * 1000) / 10;
}
const COMPUTERS = {
  contractValue: computeContractValue,
  actualCosts: computeActualCosts,
  forecastMarginPct: computeForecastMarginPct,
};
async function computeGenerated(sb, jobId, def) {
  const fn = def.compute && COMPUTERS[def.compute];
  return fn ? fn(sb, jobId) : null;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Write a fact. Returns { ok, applied, status, value, error }.
 * Generated facts are rejected. Consequential extractions are held as pending suggestions.
 */
export async function setFact(jobId, key, value, opts = {}) {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, error: "Database not configured." };
  const def = getFactDef(key);
  if (!def) return { ok: false, error: `Unknown fact: ${key}` };
  if (def.type === "generated") return { ok: false, error: `'${key}' is a generated fact and cannot be written directly.` };

  const valueType = inferValueType(def, value);
  const status = resolveStatus(def, opts);
  const apply = APPLIED_STATUSES.has(status);

  let oldValue = null;
  try {
    oldValue = await readStoredValue(sb, jobId, def);
    if (apply) await writeStoredValue(sb, jobId, def, value);

    await sb.from("job_fact_history").insert([{
      spine: def.spine, job_id: jobId, fact_key: key,
      old_value: serialize(oldValue, valueType), new_value: serialize(value, valueType),
      value_type: valueType, source: opts.source || "manual",
      source_document_id: opts.sourceDocumentId || null,
      confidence: opts.confidence ?? null, status, reason: opts.reason || null,
      changed_by: opts.actorId || null,
    }]);

    await emitEvent(jobId, apply ? "fact.changed" : "fact.suggested", {
      actorId: opts.actorId, source: opts.source || "manual",
      entityType: "fact", metadata: { fact_key: key, status, tier: def.tier },
    });

    return { ok: true, applied: apply, status, value: apply ? value : oldValue };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/** Promote the latest pending (extracted_flagged) suggestion for a consequential fact to canonical. */
export async function confirmFact(jobId, key, opts = {}) {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, error: "Database not configured." };
  const def = getFactDef(key);
  if (!def || def.type === "generated") return { ok: false, error: `Cannot confirm '${key}'.` };
  try {
    const { data: pending } = await sb.from("job_fact_history")
      .select("new_value, value_type").eq("job_id", jobId).eq("fact_key", key)
      .eq("status", "extracted_flagged").order("changed_at", { ascending: false }).limit(1).maybeSingle();
    if (!pending) return { ok: false, error: "No pending suggestion to confirm." };
    let value = pending.new_value;
    if (pending.value_type === "number") value = Number(value);
    else if (pending.value_type === "boolean") value = value === "true";
    else if (pending.value_type === "json") value = JSON.parse(value);
    return setFact(jobId, key, value, { ...opts, status: "confirmed", source: opts.source || "manual" });
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/** Read a single fact's current value + provenance. */
export async function getFact(jobId, key) {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const def = getFactDef(key);
  if (!def) return null;
  const value = def.type === "generated"
    ? await computeGenerated(sb, jobId, def)
    : await readStoredValue(sb, jobId, def);
  const provenance = def.type === "generated"
    ? { type: "generated", computed: true }
    : await latestProvenance(sb, jobId, key);
  return { key, label: def.label, family: def.family, type: def.type, tier: def.tier, value, provenance };
}

/** Assemble the full job profile: every job-spine fact grouped by family, with provenance. */
export async function getJobProfile(jobId) {
  const sb = getServiceSupabase();
  if (!sb) return null;

  const [{ data: jobRow }, { data: pmRow }, { data: history }] = await Promise.all([
    sb.from("jobs").select("*").eq("id", jobId).maybeSingle(),
    sb.from("project_metrics").select("*").eq("job_id", jobId).maybeSingle(),
    sb.from("job_fact_history").select("fact_key, source, source_document_id, confidence, status, changed_by, changed_at")
      .eq("job_id", jobId).order("changed_at", { ascending: false }),
  ]);
  if (!jobRow) return null;

  // latest provenance per fact_key
  const provByKey = {};
  for (const h of history || []) if (!provByKey[h.fact_key]) provByKey[h.fact_key] = h;

  const profile = { jobId, families: {} };
  for (const def of factsForSpine("job")) {
    let value = null;
    if (def.type === "generated") {
      value = await computeGenerated(sb, jobId, def);
    } else if (def.store) {
      const row = def.store.table === "jobs" ? jobRow : pmRow;
      value = row ? row[def.store.column] : null;
    }
    (profile.families[def.family] ||= []).push({
      key: def.key, label: def.label, type: def.type, tier: def.tier, value,
      provenance: def.type === "generated" ? { type: "generated", computed: true } : provByKey[def.key] || null,
    });
  }
  return profile;
}

// Lead/Party profiles — minimal v1 (core rows). Expand as those spines migrate.
export async function getLeadProfile(leadId) {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data } = await sb.from("leads").select("*").eq("id", leadId).maybeSingle();
  return data ? { leadId, lead: data } : null;
}
export async function getPartyProfile(contactId) {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data } = await sb.from("crm_contacts").select("*").eq("id", contactId).maybeSingle();
  return data ? { contactId, contact: data } : null;
}
