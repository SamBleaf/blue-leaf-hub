/**
 * registerHandover.mjs — Master Register R03 · tender linkage + contract baseline (Tab 22 D6, D-028).
 *
 * Tender: the estimator's view of the SAME register — included / excluded / by others / unresolved, the
 * products specified, what still needs pricing — plus the cost references that already exist in the
 * fee-proposal / Buildxact estimate, offered as LINK targets only. No price is copied into the register
 * and nothing here writes to estimating (Buildxact remains the single source of line pricing).
 *
 * Contract baseline: once the building contract is signed, an explicit staff action records an immutable
 * snapshot of the agreed register (approved scope, applicable selections, exclusions, drawing basis,
 * reviewed allowances, current issued documents) through the same issue registry as the documents.
 * Later changes follow the existing variation / approval processes; the register marks what changed
 * since the baseline. It never invites the client (portal onboarding stays in Portal Admin).
 */
import { createHash, randomBytes } from "crypto";
import { loadRegister } from "./registerStore.mjs";
import { loadRegisterContext } from "./registerContext.mjs";
import { DocumentError } from "./registerDocuments.mjs";
import {
  roomLabel, refCode, outstandingReasons, isClientSelection, INCLUDED_DISPOSITIONS, dispositionLabel, categoryLabel,
  QUESTION_LIBRARY_VERSION,
} from "../../src/lib/register.js";

const BUCKET = "lead-documents";
const row = (reg, i) => ({
  id: i.id, ref: refCode(i), area: roomLabel(reg, i), kind: i.itemKind, category: categoryLabel(i.category),
  description: i.description, disposition: dispositionLabel(i.disposition), certainty: i.certainty,
  product: [i.manufacturer, i.product, i.model].filter(Boolean).join(" "), finish: i.colour, supplier: i.supplier,
  quantity: i.quantity, unit: i.unit, supplyBy: i.supplyBy, technicalStatus: i.technicalStatus,
  pricingStatus: i.pricingStatus, pricingRef: i.pricingRef, source: i.source, nextAction: i.nextAction,
});

/** Existing cost sources for linking (names only — amounts stay in the estimate / fee proposal). */
async function costReferences(sb, lead) {
  const refs = [];
  try {
    let q = sb.from("fee_proposals").select("id, quote_number, status, categories, pc_sums, updated_at");
    q = lead.fee_proposal_id ? q.eq("id", lead.fee_proposal_id) : lead.job_id ? q.eq("job_id", lead.job_id) : null;
    if (!q) return refs;
    const { data } = await q.order("updated_at", { ascending: false }).limit(1);
    const fp = data?.[0];
    if (!fp) return refs;
    const qn = fp.quote_number || fp.id.slice(0, 8);
    (Array.isArray(fp.categories) ? fp.categories : []).forEach((c, idx) => {
      const name = c?.name || c?.category || `Category ${idx + 1}`;
      refs.push({ ref: `fee_proposal:${qn}:cat:${c?.number ?? idx + 1}`, label: `Estimate ${qn} · ${c?.number ? `${c.number} ` : ""}${name}`, kind: "category" });
      for (const it of c?.active_items || []) {
        const allow = String(it?.allowance || "").toUpperCase();
        if (allow === "PC" || allow === "PS") refs.push({ ref: `fee_proposal:${qn}:${allow.toLowerCase()}:${it.code || it.description}`, label: `${allow} · ${it.description || it.code}`, kind: allow.toLowerCase() });
      }
    });
    if (!refs.some((r) => r.kind === "pc" || r.kind === "ps")) {
      (Array.isArray(fp.pc_sums) ? fp.pc_sums : []).forEach((p, idx) => {
        const d = p?.PC_DESCRIPTION || p?.description;
        if (d) refs.push({ ref: `fee_proposal:${qn}:pc:${idx + 1}`, label: `PC · ${d}`, kind: "pc" });
      });
    }
  } catch { /* cost references are optional context */ }
  return refs;
}

export async function tenderSummary(sb, leadId, { actor } = {}) {
  const { data: lead } = await sb.from("leads").select("id, job_id, fee_proposal_id, stage").eq("id", leadId).maybeSingle();
  if (!lead) throw new DocumentError(404, "Lead not found", "NOT_FOUND");
  const loaded = await loadRegister(sb, leadId, { actor });
  const reg = loaded.register;
  const items = reg.items;
  const inScope = (i) => !["excluded", "by_others", "deferred", "na"].includes(i.disposition);
  const context = await loadRegisterContext(sb, leadId);
  return {
    mode: loaded.mode,
    drawingBasis: reg.meta.planRev || null,
    drawings: context?.drawings || [],
    included: items.filter((i) => i.itemKind === "scope" && (INCLUDED_DISPOSITIONS.has(i.disposition) || i.disposition === "retain")).map((i) => row(reg, i)),
    excluded: items.filter((i) => i.disposition === "excluded" || i.disposition === "deferred").map((i) => row(reg, i)),
    byOthers: items.filter((i) => i.disposition === "by_others" || i.supplyBy === "client" || i.supplyBy === "by_others").map((i) => row(reg, i)),
    unresolved: items.filter((i) => outstandingReasons(i).length && inScope(i)).map((i) => ({ ...row(reg, i), reasons: outstandingReasons(i) })),
    specified: items.filter((i) => isClientSelection(i) && (i.product || i.model)).map((i) => row(reg, i)),
    needsPricing: items.filter((i) => inScope(i) && (i.itemKind === "selection" || i.itemKind === "scope") && i.pricingStatus !== "quoted_or_confirmed"
      && !["client", "by_others"].includes(i.supplyBy) && (i.description || i.product)).map((i) => row(reg, i)),
    risks: items.filter((i) => i.technicalStatus === "needs_verification").map((i) => row(reg, i)),
    costRefs: await costReferences(sb, lead),
  };
}

export async function latestBaseline(sb, leadId) {
  const { data, error } = await sb.from("lead_documents").select("id, version, revision_label, issued_at, issued_by_name, source_snapshot")
    .eq("lead_id", leadId).eq("document_type", "register_baseline").eq("status", "current").not("issued_at", "is", null).maybeSingle();
  if (error || !data) return null;
  return { id: data.id, version: data.version, revision: data.revision_label, issuedAt: data.issued_at, issuedBy: data.issued_by_name,
    itemVersions: data.source_snapshot?.itemVersions || {}, contractStatus: data.source_snapshot?.contractStatus || null };
}

/**
 * Record the contract baseline (explicit staff approval). Requires a signed building contract (D-028).
 * Immutable + versioned (a later re-baseline supersedes, never overwrites). Ticks the existing Ops-Ready
 * "selections / schedules transferred" checklist item. Never invites or notifies the client.
 */
export async function recordBaseline(sb, leadId, { actor, note } = {}) {
  const { data: lead } = await sb.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (!lead) throw new DocumentError(404, "Lead not found", "NOT_FOUND");
  if ("contract_status" in lead && lead.contract_status !== "signed") {
    throw new DocumentError(409, "Record the signed building contract first — the baseline is the agreed contract scope.", "CONTRACT_NOT_SIGNED");
  }
  const loaded = await loadRegister(sb, leadId, { actor });
  if (loaded.mode !== "project") throw new DocumentError(409, "The brief must be on the project record first (it moves automatically once the project exists).", "NO_PROJECT");
  const stampedAt = new Date().toISOString();
  // P0 (Tab 25 blocker 2): mark the current register as the signed-contract baseline so register_apply
  // protects these scope/requirement rows from unreviewed post-contract change (deletes + substantive
  // edits need a variation reference). Stamp BEFORE re-reading item versions, so the baseline's
  // itemVersions reflect the post-stamp state — otherwise every item would read "changed since contract".
  try {
    await sb.from("room_scope_items").update({ baselined_at: stampedAt }).eq("project_id", loaded.projectId).is("baselined_at", null);
    await sb.from("client_selections").update({ baselined_at: stampedAt }).eq("project_id", loaded.projectId).is("baselined_at", null);
  } catch { /* pre-213 (column absent) — the JSON snapshot remains the record of truth */ }
  const reg = (await loadRegister(sb, leadId, { actor })).register;   // re-read so itemVersions capture the post-stamp versions
  const { data: issued } = await sb.from("lead_documents").select("id, document_type, revision_label, issued_at, content_sha256")
    .eq("lead_id", leadId).in("document_type", ["client_brief", "architect_brief", "selections_schedule"]).eq("status", "current").not("issued_at", "is", null);
  const snapshot = {
    kind: "register_contract_baseline", recordedAt: stampedAt, recordedBy: actor?.name || null, note: note || null,
    contractStatus: lead.contract_status || null, contractSignedDate: lead.contract_signed_date || null,
    projectId: loaded.projectId, jobId: lead.job_id, drawingBasis: reg.meta.planRev || null, libraryVersion: QUESTION_LIBRARY_VERSION,
    rooms: reg.meta.rooms,
    approvedScope: reg.items.filter((i) => i.itemKind === "scope" && (INCLUDED_DISPOSITIONS.has(i.disposition) || i.disposition === "retain")).map((i) => row(reg, i)),
    exclusions: reg.items.filter((i) => ["excluded", "by_others", "deferred"].includes(i.disposition)).map((i) => row(reg, i)),
    selections: reg.items.filter(isClientSelection).map((i) => ({ ...row(reg, i), portalStatus: i.sync?.status || null, clientVisible: !!i.sync?.clientVisible })),
    requirements: reg.items.filter((i) => i.itemKind === "requirement").map((i) => row(reg, i)),
    openItems: reg.items.filter((i) => outstandingReasons(i).length).map((i) => ({ ...row(reg, i), reasons: outstandingReasons(i) })),
    reviewedAllowances: reg.items.filter((i) => i.pricingStatus === "quoted_or_confirmed" || i.pricingRef).map((i) => row(reg, i)),
    issuedDocuments: (issued || []).map((d) => ({ id: d.id, type: d.document_type, revision: d.revision_label, issuedAt: d.issued_at, sha256: d.content_sha256 })),
    itemVersions: Object.fromEntries(reg.items.map((i) => [i.id, i.sync?.version || i.updatedAt])),
  };
  const body = Buffer.from(JSON.stringify(snapshot, null, 2));
  const { data: cur } = await sb.from("lead_documents").select("version").eq("lead_id", leadId).eq("document_type", "register_baseline")
    .not("issued_at", "is", null).order("version", { ascending: false }).limit(1);
  const version = (cur?.[0]?.version || 0) + 1;
  const path = `leads/${leadId}/register/register_baseline/${snapshot.recordedAt.slice(0, 10)}-baseline-B${String(version).padStart(2, "0")}-${randomBytes(3).toString("hex")}.json`;
  const up = await sb.storage.from(BUCKET).upload(path, body, { contentType: "application/json", upsert: false });
  if (up.error) throw new DocumentError(502, "Could not store the baseline.", "STORAGE");
  const { data, error } = await sb.rpc("register_issue_document", {
    p_lead_id: leadId, p_document_type: "register_baseline", p_expected_version: version,
    p_row: { filename: `Contract baseline B${String(version).padStart(2, "0")}.json`, file_size: body.length, mime_type: "application/json", storage_path: path,
      uploaded_by: actor?.email || "register", content_sha256: createHash("sha256").update(body).digest("hex"), revision_label: `B${String(version).padStart(2, "0")}`,
      template_key: "register_baseline", template_version: QUESTION_LIBRARY_VERSION, source_snapshot: snapshot, issued_by: actor?.id || null,
      issued_by_name: actor?.name || null, recipient_name: "Operations handover", audience: "internal", job_id: lead.job_id || null, project_id: loaded.projectId },
  });
  if (error || data?.ok === false) throw new DocumentError(409, "Could not record the baseline — please retry.", "BASELINE", { detail: error?.message || data?.reason });

  // Existing Ops-Ready checklist (mig 195): the register handover satisfies "selections / schedules transferred".
  try {
    const checklist = { ...(lead.ops_ready_checklist && typeof lead.ops_ready_checklist === "object" ? lead.ops_ready_checklist : {}), selections_transfer: true };
    await sb.from("leads").update({ ops_ready_checklist: checklist }).eq("id", leadId);
  } catch { /* pre-195 — the baseline record itself is the evidence */ }
  if (lead.job_id) {
    try {
      await sb.from("job_events").insert({ job_id: lead.job_id, event_type: "register.baseline.recorded", source: "register", actor_id: actor?.id || null,
        entity_type: "document", entity_id: data.document.id, metadata: { lead_id: leadId, version, items: reg.items.length } });
    } catch { /* best-effort */ }
  }
  return { baseline: { id: data.document.id, revision: data.document.revision_label, issuedAt: data.document.issued_at }, counts: {
    scope: snapshot.approvedScope.length, selections: snapshot.selections.length, exclusions: snapshot.exclusions.length, open: snapshot.openItems.length } };
}
