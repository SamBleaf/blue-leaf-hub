/**
 * registerStore.mjs — Master Register R03 · the stage-aware persistence adapter (Tab 23 Q5).
 *
 * ONE writer of register data, whatever stage the project is at:
 *   • LEAD mode   (no project yet) — the lead scratchpad `leads.selections_schedule` (mig 188). Saves are a
 *                  per-item merge with a version check, never a blind whole-array overwrite.
 *   • PROMOTION   (the first time a `projects` row exists for the lead's job) — the scratchpad is mapped,
 *                  ONCE and atomically, into the canonical project records via register_apply(mode=promote).
 *                  Runs automatically (preconstruction-portal setup, Won, or the first register open after a
 *                  project appears); a failure writes nothing and is retried on the next open (observable).
 *   • PROJECT mode — reads and writes the canonical records directly: client CHOICES in `client_selections`
 *                  (staged client_visible=false until the office issues them), everything else in internal
 *                  `room_scope_items`, the room list in `projects.register_meta`. Every save is ONE
 *                  register_apply call (one transaction) with per-row optimistic versions. The lead
 *                  scratchpad is then read-only history (salesRoutes PATCH refuses writes to it).
 *
 * Field ownership: register saves touch only register-owned columns — never client_notes, cost_impact,
 * allowance_amount, due dates, attachments or linked_variation_id (portal / finance own those) — and a
 * client's portal choice can never be silently overwritten (row versions are bumped by every writer).
 */
import {
  readRegister, writeRegister, emptyMeta, makeItem, isClientSelection, roomLabel, categoryLabel,
  resolvePromptId, questionById, REGISTER_CATEGORIES, QUESTION_LIBRARY_VERSION,
} from "../../src/lib/register.js";
import { notifyClient } from "./portalNotify.mjs";

const LEAD_COLS = "id, job_id, name, first_name, last_name, project_type, stage, selections_schedule, updated_at";
const SEL = "client_selections";
const RSI = "room_scope_items";

export class RegisterError extends Error {
  constructor(status, message, code, extra = {}) { super(message); this.status = status; this.code = code; Object.assign(this, extra); }
}

/**
 * Feature switch (default OFF). REGISTER_ENABLED=true turns the register on for every lead;
 * REGISTER_PILOT_LEADS=<lead id>,<lead id> turns it on for those leads only (the pilot). While off,
 * every /api/register route answers 404 REGISTER_DISABLED, the lead page hides the card and no
 * automatic promotion runs — so the code can ship before migrations 212/213 are applied.
 */
export function registerEnabledFor(leadId) {
  if (String(process.env.REGISTER_ENABLED || "").trim().toLowerCase() === "true") return true;
  const pilot = String(process.env.REGISTER_PILOT_LEADS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return !!leadId && pilot.includes(String(leadId).toLowerCase());
}

const nullIfBlank = (v) => (v === "" || v === undefined ? null : v);
const CATEGORY_KEY_BY_LABEL = Object.fromEntries(Object.entries(REGISTER_CATEGORIES).map(([k, l]) => [l.toLowerCase(), k]));
const categoryKeyFromLabel = (label) => CATEGORY_KEY_BY_LABEL[String(label || "").toLowerCase()] || null;

/** Which canonical store an item belongs in. The load-bearing scope-vs-selection guard. */
export function storeFor(item) { return isClientSelection(item) ? SEL : RSI; }

// ── canonical row ⇄ register item ────────────────────────────────────────────────────────────────

function deriveCertainty(row) {
  if (["approved", "ordered", "installed"].includes(row.status)) return "client_approved";
  if (row.certainty) return row.certainty === "client_approved" ? "proposed" : row.certainty;
  return row.status === "in_review" ? "proposed" : "not_considered";
}

export function selRowToItem(row, { isPreconstruction } = {}) {
  const d = row.register_detail || {};
  const boardCreated = !row.source_register_item_id;
  const approved = ["approved", "ordered", "installed"].includes(row.status);
  return makeItem({
    id: row.source_register_item_id || `cs_${row.id}`,
    itemKind: "selection",
    section: d.section || (row.source_room_id ? "room" : "project"),
    roomId: row.source_room_id || null,
    level: d.level || "",
    room: row.room_area || "",
    category: d.categoryKey || categoryKeyFromLabel(row.category) || "notes",
    promptKey: d.promptKey || null,
    disposition: row.disposition || (boardCreated ? "included" : "undecided"),
    description: d.description != null ? d.description : (row.item_name || ""),
    product: row.selected_product || "",
    manufacturer: row.manufacturer || "",
    model: row.selected_model_code || "",
    colour: row.finish || "",
    supplier: row.selected_supplier || "",
    quantity: row.quantity,
    unit: row.quantity_unit || "",
    certainty: deriveCertainty(row),
    responsibility: row.responsibility || "",
    supplyBy: row.supply_by || "",
    technicalStatus: row.technical_status || "not_required",
    technicalEvidence: row.technical_evidence || null,
    pricingStatus: row.pricing_status || "not_reviewed",
    pricingRef: row.pricing_ref || "",
    source: row.source_ref || "",
    sourceDocId: row.source_doc_id || null,
    nextAction: row.next_action || "",
    resolved: !!d.resolved,
    isDefault: !!d.isDefault,
    overridesDefaultId: d.overridesDefaultId || null,
    evidence: row.approval_evidence || (approved && row.approved_at ? { at: row.approved_at, by: "Portal board", method: "board" } : null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sync: {
      mode: "project", table: SEL, rowId: row.id, version: row.updated_at,
      clientVisible: row.client_visible !== false, status: row.status, boardCreated,
      approvedOnBoard: approved && !row.approval_evidence,
      clientChoice: row.status === "in_review"
        ? { product: row.selected_product, model: row.selected_model_code, supplier: row.selected_supplier, notes: row.client_notes, costImpact: row.cost_impact }
        : null,
      costImpact: row.cost_impact, allowanceAmount: row.allowance_amount, linkedVariationId: row.linked_variation_id,
      locked: ["ordered", "installed"].includes(row.status) || (!isPreconstruction && row.status === "approved"),
    },
  });
}

export function rsiRowToItem(row) {
  const d = row.register_detail || {};
  return makeItem({
    id: row.source_register_item_id || `rs_${row.id}`,
    itemKind: row.item_kind || "scope",
    section: d.section || (row.source_room_id ? "room" : "project"),
    roomId: row.source_room_id || null,
    level: d.level || "",
    room: row.room_area || "",
    category: row.category || "notes",
    promptKey: d.promptKey || null,
    disposition: row.disposition || "undecided",
    description: row.description || "",
    product: row.product || "",
    manufacturer: row.manufacturer || "",
    model: row.model || "",
    colour: row.colour || "",
    supplier: row.supplier || "",
    quantity: row.quantity,
    unit: row.quantity_unit || "",
    certainty: row.certainty || "not_considered",
    responsibility: row.responsibility || "",
    supplyBy: row.supply_by || "",
    technicalStatus: row.technical_status || "not_required",
    technicalEvidence: row.technical_evidence || null,
    pricingStatus: row.pricing_status || "not_reviewed",
    pricingRef: row.pricing_ref || "",
    source: row.source_ref || "",
    sourceDocId: row.source_doc_id || null,
    nextAction: row.next_action || "",
    resolved: !!d.resolved,
    isDefault: !!d.isDefault,
    overridesDefaultId: d.overridesDefaultId || null,
    evidence: row.approval_evidence || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sync: { mode: "project", table: RSI, rowId: row.id, version: row.updated_at, clientVisible: false, status: null },
  });
}

function detailOf(item) {
  return {
    promptKey: item.promptKey || null, categoryKey: item.category, section: item.section, level: item.level || "",
    isDefault: !!item.isDefault, overridesDefaultId: item.overridesDefaultId || null, resolved: !!item.resolved,
    description: item.description || "",
  };
}

function itemTitle(item) {
  const q = questionById(resolvePromptId(item.promptKey));
  return (item.description || "").trim() || q?.short || categoryLabel(item.category) || "Selection";
}

export function itemToSelRow(item, register, order = 0) {
  return {
    category: categoryLabel(item.category),
    item_name: itemTitle(item),
    room_area: roomLabel(register, item),
    selected_product: nullIfBlank(item.product), selected_model_code: nullIfBlank(item.model),
    selected_supplier: nullIfBlank(item.supplier), finish: nullIfBlank(item.colour), manufacturer: nullIfBlank(item.manufacturer),
    certainty: item.certainty, disposition: item.disposition,
    technical_status: item.technicalStatus, technical_evidence: item.technicalEvidence || null,
    pricing_status: item.pricingStatus, pricing_ref: nullIfBlank(item.pricingRef),
    responsibility: nullIfBlank(item.responsibility), supply_by: nullIfBlank(item.supplyBy),
    quantity: item.quantity, quantity_unit: nullIfBlank(item.unit),
    source_ref: nullIfBlank(item.source), source_doc_id: item.sourceDocId || null,
    next_action: nullIfBlank(item.nextAction), source_room_id: item.roomId || null,
    approval_evidence: item.certainty === "client_approved" ? (item.evidence || null) : null,
    register_detail: detailOf(item),
    sort_order: order,
  };
}

export function itemToRsiRow(item, register, order = 0) {
  const d = detailOf(item);
  delete d.description;                                     // room_scope_items has a real description column
  return {
    room_area: roomLabel(register, item), category: item.category, item_kind: item.itemKind,
    disposition: item.disposition, certainty: item.certainty, responsibility: nullIfBlank(item.responsibility),
    description: nullIfBlank(item.description), product: nullIfBlank(item.product), model: nullIfBlank(item.model),
    colour: nullIfBlank(item.colour), source_ref: nullIfBlank(item.source), next_action: nullIfBlank(item.nextAction),
    technical_status: item.technicalStatus, technical_evidence: item.technicalEvidence || null,
    pricing_status: item.pricingStatus, pricing_ref: nullIfBlank(item.pricingRef),
    approval_evidence: item.certainty === "client_approved" ? (item.evidence || null) : null,
    supply_by: nullIfBlank(item.supplyBy), manufacturer: nullIfBlank(item.manufacturer), supplier: nullIfBlank(item.supplier),
    quantity: item.quantity, quantity_unit: nullIfBlank(item.unit), source_doc_id: item.sourceDocId || null,
    source_room_id: item.roomId || null, register_detail: d, sort_order: order,
  };
}

/** Canonical meta (rooms + drawing basis + resume pointer). deliveryModel lives on the job/lead fact. */
function metaForCanonical(meta) {
  const m = emptyMeta(meta);
  return {
    version: 2, planRev: m.planRev, occupancy: m.occupancy, renovationOverlay: m.renovationOverlay,
    scopeAreas: m.scopeAreas, rooms: m.rooms, lastRoomId: m.lastRoomId, lastStep: m.lastStep,
    libraryVersion: QUESTION_LIBRARY_VERSION,
  };
}

/**
 * Deterministic order per item — grouped by room order (project-wide first), then register position.
 * Keyed by item id so the same item keeps the same sort_order across runs.
 */
function stableOrder(register) {
  const roomRank = new Map();
  (register.meta.rooms || []).forEach((r, i) => roomRank.set(r.id, i));
  const indexed = register.items.map((it, idx) => ({ it, idx }));
  indexed.sort((a, b) => {
    const ra = a.it.roomId ? (roomRank.get(a.it.roomId) ?? 9999) : -1;
    const rb = b.it.roomId ? (roomRank.get(b.it.roomId) ?? 9999) : -1;
    return ra !== rb ? ra - rb : a.idx - b.idx;
  });
  const order = new Map();
  indexed.forEach((e, i) => order.set(e.it.id, i));
  return order;
}

// ── target resolution ────────────────────────────────────────────────────────────────────────────

/** Resolve lead → job → project and the persistence mode. Pre-213 DBs degrade to lead mode. */
export async function resolveTarget(sb, leadId) {
  const { data: lead, error } = await sb.from("leads").select(LEAD_COLS).eq("id", leadId).maybeSingle();
  if (error) throw new RegisterError(400, "Could not read the lead.", "LEAD_READ");
  if (!lead) throw new RegisterError(404, "Lead not found", "NOT_FOUND");
  let project = null, schemaReady = true;
  if (lead.job_id) {
    const { data: p, error: pErr } = await sb.from("projects")
      .select("id, job_id, is_preconstruction, register_meta, portal_v2_enabled").eq("job_id", lead.job_id).maybeSingle();
    if (pErr) {
      if (pErr.code === "42703") {
        schemaReady = false;
        const { data: p2 } = await sb.from("projects").select("id, job_id").eq("job_id", lead.job_id).maybeSingle();
        project = p2 ? { ...p2, register_meta: null, is_preconstruction: true } : null;
      } else throw new RegisterError(400, "Could not read the project.", "PROJECT_READ");
    } else project = p;
  }
  const mode = !project || !schemaReady ? "lead" : project.register_meta ? "project" : "needs_promotion";
  return { lead, project, mode, schemaReady };
}

// ── load ─────────────────────────────────────────────────────────────────────────────────────────

async function loadCanonical(sb, project) {
  const [{ data: sels, error: sErr }, { data: rsis, error: rErr }] = await Promise.all([
    sb.from(SEL).select("*").eq("project_id", project.id).order("sort_order", { ascending: true }),
    sb.from(RSI).select("*").eq("project_id", project.id).order("sort_order", { ascending: true }),
  ]);
  if (sErr || rErr) throw new RegisterError(400, "Could not read the project register.", "CANONICAL_READ");
  const opts = { isPreconstruction: project.is_preconstruction !== false };
  const meta = emptyMeta({ ...(project.register_meta || {}), rev: Number(project.register_meta?.rev) || 0 });
  const items = [...(sels || []).map((r) => selRowToItem(r, opts)), ...(rsis || []).map(rsiRowToItem)];
  return { meta, items };
}

function leadSync(items) {
  return items.map((it) => ({ ...it, sync: { mode: "lead", version: it.updatedAt } }));
}

/**
 * Load the register for a lead in whatever mode applies. If a project exists but has never been
 * promoted, promotion runs now (atomic, idempotent) — staff never press a sync button.
 */
export async function loadRegister(sb, leadId, { actor, autoPromote = true } = {}) {
  let target = await resolveTarget(sb, leadId);
  let promotion = null;
  if (target.mode === "needs_promotion" && autoPromote) {
    promotion = await promoteRegisterToProject(sb, { leadId, projectId: target.project.id, actor });
    target = await resolveTarget(sb, leadId);
  }
  if (target.mode === "project") {
    const register = await loadCanonical(sb, target.project);
    return {
      mode: "project", leadId, projectId: target.project.id, jobId: target.lead.job_id,
      isPreconstruction: target.project.is_preconstruction !== false, register, promotion,
      promotedAt: target.project.register_meta?.promotion?.at || null, schemaReady: true,
    };
  }
  const reg = readRegister(target.lead);
  return {
    mode: "lead", leadId, projectId: target.project?.id || null, jobId: target.lead.job_id || null,
    isPreconstruction: true, register: { meta: reg.meta, items: leadSync(reg.items) },
    promotion, schemaReady: target.schemaReady,
    pendingPromotion: target.mode === "needs_promotion" || (!target.schemaReady && !!target.project),
  };
}

// ── promotion ────────────────────────────────────────────────────────────────────────────────────

function actorJson(actor) { return { id: actor?.id || null, name: actor?.name || actor?.email || "" }; }

/**
 * Promote a lead's register into its project's canonical stores — once, atomically. A no-op if the
 * project is already promoted. Never creates a project, never issues anything to the client.
 */
export async function promoteRegisterToProject(sb, { leadId, projectId = null, actor = null } = {}) {
  if (!sb || !leadId) return { ok: false, reason: "missing sb/leadId" };
  let target;
  try { target = await resolveTarget(sb, leadId); } catch (e) { return { ok: false, reason: e.message }; }
  const pid = projectId || target.project?.id;
  if (!pid) return { ok: false, reason: target.lead.job_id ? "no project for job yet" : "no job for lead yet" };
  if (!target.schemaReady) return { ok: false, reason: "migration 213 not applied — register stays on the lead" };
  if (target.project?.register_meta) return { ok: true, alreadyPromoted: true, projectId: pid };

  const register = readRegister(target.lead);
  const order = stableOrder(register);
  const ops = [{ op: "meta_init", meta: metaForCanonical(register.meta) }];
  for (const it of register.items) {
    const provenance = ["Master Register", `lead ${target.lead.id}`, target.lead.stage ? `stage ${target.lead.stage}` : null].filter(Boolean).join(" • ");
    if (storeFor(it) === SEL) {
      ops.push({ op: "sel_insert", item_id: it.id, row: { ...itemToSelRow(it, register, order.get(it.id) ?? 0), internal_notes: provenance } });
    } else {
      ops.push({ op: "scope_insert", item_id: it.id, row: { ...itemToRsiRow(it, register, order.get(it.id) ?? 0), notes: provenance } });
    }
  }
  const { data, error } = await sb.rpc("register_apply", {
    p_project_id: pid, p_lead_id: target.lead.id, p_ops: ops, p_actor: actorJson(actor), p_mode: "promote",
  });
  if (error) {
    console.warn("[register] promotion failed (nothing written; retried on next open):", error.message);
    try {
      await sb.from("job_events").insert({ job_id: target.lead.job_id, event_type: "register.promotion_failed", source: "register",
        entity_type: "project", entity_id: pid, metadata: { lead_id: target.lead.id, error: String(error.message || error).slice(0, 500) } });
    } catch { /* observability is best-effort */ }
    return { ok: false, reason: error.message || "promotion failed" };
  }
  // Defence in depth: register_apply reports a validation conflict as { ok:false } and writes NOTHING.
  // Promotion must NEVER report success in that case (register_meta stays NULL, so the scratchpad stays
  // authoritative and it is retried — not silently stranded with a false "promoted" result).
  if (data && data.ok === false) {
    const reason = (data.conflicts || []).map((c) => c.reason).join(", ") || "validation conflict";
    console.warn("[register] promotion blocked (nothing written; retried on next open):", reason);
    try {
      await sb.from("job_events").insert({ job_id: target.lead.job_id, event_type: "register.promotion_failed", source: "register",
        entity_type: "project", entity_id: pid, metadata: { lead_id: target.lead.id, reason, conflicts: (data.conflicts || []).slice(0, 50) } });
    } catch { /* observability is best-effort */ }
    return { ok: false, reason, conflicts: data.conflicts || [] };
  }
  if (data?.already_promoted) return { ok: true, alreadyPromoted: true, projectId: pid };
  return { ok: true, projectId: pid, selections: data?.promoted?.selections ?? 0, scopeItems: data?.promoted?.scopeItems ?? 0 };
}

// ── save ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Save a batch of register changes. payload: { meta?, changes: [item], deletes: [{id, sync}] }.
 * Every item carries the `sync` block it was loaded with (version + canonical row). Returns the fresh
 * register, or throws RegisterError(409, …, {conflicts}) — in which case NOTHING was written.
 */
export async function saveRegister(sb, leadId, payload = {}, { actor } = {}) {
  const target = await resolveTarget(sb, leadId);
  if (target.mode === "needs_promotion") {
    // A project appeared since this screen loaded — promote, then ask the client to reload (no lost edit:
    // the client keeps its unsaved changes and re-applies them against the canonical versions).
    await promoteRegisterToProject(sb, { leadId, projectId: target.project.id, actor });
    throw new RegisterError(409, "This brief has just moved onto the project record. Reloading — your unsaved changes are kept.", "MODE_CHANGED");
  }
  const changes = Array.isArray(payload.changes) ? payload.changes : [];
  const deletes = Array.isArray(payload.deletes) ? payload.deletes : [];
  if (target.mode === "project") return saveProject(sb, target, { meta: payload.meta, changes, deletes }, actor);
  if (changes.some((c) => c?.sync?.mode === "project") || deletes.some((d) => d?.sync?.mode === "project")) {
    throw new RegisterError(409, "The register changed storage since it was loaded — please reload.", "MODE_CHANGED");
  }
  return saveLead(sb, target, { meta: payload.meta, changes, deletes });
}

async function saveLead(sb, target, { meta, changes, deletes }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: lead } = await sb.from("leads").select(LEAD_COLS).eq("id", target.lead.id).maybeSingle();
    const cur = readRegister(lead);
    const byId = new Map(cur.items.map((i) => [i.id, i]));
    const conflicts = [];
    const now = new Date().toISOString();

    if (meta) {
      const baseRev = Number(meta.rev) || 0;
      if ((Number(cur.meta.rev) || 0) !== baseRev) conflicts.push({ itemId: "__meta__", reason: "meta_stale", current: cur.meta });
    }
    for (const ch of changes) {
      const existing = byId.get(ch.id);
      const baseVersion = ch.sync?.version || null;
      if (existing && baseVersion && existing.updatedAt !== baseVersion) conflicts.push({ itemId: ch.id, reason: "stale", current: existing });
      else if (!existing && baseVersion) conflicts.push({ itemId: ch.id, reason: "missing" });
    }
    for (const del of deletes) {
      const existing = byId.get(del.id);
      if (existing && del.sync?.version && existing.updatedAt !== del.sync.version) conflicts.push({ itemId: del.id, reason: "stale", current: existing });
    }
    if (conflicts.length) throw new RegisterError(409, "Some items were changed elsewhere.", "CONFLICT", { conflicts });

    for (const ch of changes) byId.set(ch.id, makeItem({ ...ch, updatedAt: now, sync: null }));
    for (const del of deletes) byId.delete(del.id);
    const nextMeta = meta ? emptyMeta({ ...meta, rev: (Number(cur.meta.rev) || 0) + 1 }) : cur.meta;
    const next = writeRegister({ meta: nextMeta, items: [...byId.values()] });

    // Conditional write on the lead's own updated_at — a concurrent save makes this affect 0 rows and
    // we re-merge on fresh data (no lost update between two open screens).
    let q = sb.from("leads").update({ selections_schedule: next, updated_at: now }).eq("id", target.lead.id);
    q = lead.updated_at ? q.eq("updated_at", lead.updated_at) : q;
    const { data: written, error } = await q.select("id");
    if (error) throw new RegisterError(400, "Could not save the brief.", "LEAD_WRITE");
    if (written && written.length) {
      const reg = readRegister({ selections_schedule: next });
      return { mode: "lead", register: { meta: reg.meta, items: leadSync(reg.items) } };
    }
  }
  throw new RegisterError(409, "The brief is being saved from another screen — please retry.", "BUSY");
}

async function saveProject(sb, target, { meta, changes, deletes }, actor) {
  const current = await loadCanonical(sb, target.project);
  const register = { meta: meta ? emptyMeta(meta) : current.meta, items: current.items };
  // Changes may reference rooms added in this same save — resolve labels against the incoming meta.
  const known = new Set(current.items.map((it) => it.id));
  const ops = [];
  if (meta) ops.push({ op: "meta_set", base_rev: Number(meta.rev) || 0, meta: metaForCanonical(meta) });
  let nextOrder = current.items.length;
  for (const raw of changes) {
    const it = makeItem(raw);
    const want = storeFor(it);
    const sync = raw.sync && raw.sync.mode === "project" ? raw.sync : null;
    // Existing rows keep their sort_order (null ⇒ unchanged); new rows append after the current list.
    const sortOrder = known.has(it.id) ? null : nextOrder++;
    const rowFor = (store) => (store === SEL ? itemToSelRow(it, register, sortOrder) : itemToRsiRow(it, register, sortOrder));
    if (sync?.rowId) {
      if (sync.table === want) {
        ops.push({ op: want === SEL ? "sel_update" : "scope_update", item_id: it.id, row_id: sync.rowId, base_version: sync.version, row: rowFor(want) });
      } else {
        // Reclassified across the scope/selection boundary: delete + insert, same stable id, one transaction.
        ops.push({ op: sync.table === SEL ? "sel_delete" : "scope_delete", item_id: it.id, row_id: sync.rowId, base_version: sync.version });
        ops.push({ op: want === SEL ? "sel_insert" : "scope_insert", item_id: it.id, row: rowFor(want) });
      }
    } else {
      ops.push({ op: want === SEL ? "sel_insert" : "scope_insert", item_id: it.id, row: rowFor(want) });
    }
  }
  for (const del of deletes) {
    const sync = del.sync && del.sync.mode === "project" ? del.sync : null;
    if (!sync?.rowId) continue;                                   // never persisted — nothing to delete
    ops.push({ op: sync.table === SEL ? "sel_delete" : "scope_delete", item_id: del.id, row_id: sync.rowId, base_version: sync.version });
  }
  if (!ops.length) return { mode: "project", register: current };
  await callApply(sb, target, ops, actor);
  return { mode: "project", register: await loadCanonical(sb, target.project) };
}

async function callApply(sb, target, ops, actor) {
  const { data, error } = await sb.rpc("register_apply", {
    p_project_id: target.project.id, p_lead_id: target.lead.id, p_ops: ops, p_actor: actorJson(actor), p_mode: "edit",
  });
  if (error) {
    console.warn("[register] register_apply failed (nothing written):", error.code || "", error.message || error);
    if (error.code === "42883" || error.code === "PGRST202") throw new RegisterError(503, "Apply migration 213 first (Master Register R03).", "SCHEMA");
    if (/REGISTER_CONFLICT/.test(error.message || "")) throw new RegisterError(409, "Another change landed at the same moment — please retry.", "CONFLICT", { conflicts: [] });
    throw new RegisterError(400, "Could not save the register — nothing was changed.", "APPLY", { detail: error.message });
  }
  if (data && data.ok === false) {
    const conflicts = (data.conflicts || []).map((c) => ({ itemId: c.item_id, reason: c.reason }));
    throw new RegisterError(409, conflictMessage(conflicts), "CONFLICT", { conflicts });
  }
  return data;
}

const REASON_TEXT = {
  stale: "changed elsewhere since you opened it",
  missing: "no longer exists",
  exists: "was just created elsewhere",
  issued_locked: "has been issued to the client portal — withdraw it first",
  post_contract_locked: "is approved under the signed contract — change it through a variation",
  baseline_locked: "is part of the signed contract baseline — change it through a variation",
  approved_locked: "is client-approved — it can't be withdrawn",
  evidence_required: "needs approval evidence (who, when, how) to be marked client-approved",
  technical_evidence_required: "needs a drawing / consultant reference to be marked verified",
  not_in_review: "has no client choice waiting for review",
  reapproval_required: "changed after client approval — step it back to Proposed or record the client's re-approval",
  meta_stale: "room list was changed elsewhere",
};
function conflictMessage(conflicts) {
  const first = conflicts[0];
  if (!first) return "Some items were changed elsewhere.";
  const more = conflicts.length > 1 ? ` (+${conflicts.length - 1} more)` : "";
  return `An item ${REASON_TEXT[first.reason] || first.reason}${more}. Nothing was saved.`;
}

// ── portal-facing actions (staff-initiated, explicit) ────────────────────────────────────────────

async function projectTargetOrThrow(sb, leadId) {
  const target = await resolveTarget(sb, leadId);
  if (target.mode !== "project") throw new RegisterError(409, "Selections can only be issued once the brief is on a project record (set up the pre-construction project first).", "NO_PROJECT");
  return target;
}

/**
 * Issue / withdraw / return selections on the client portal. Issue creates the client's "Select …" task
 * and notifies through the existing portal chokepoint (which only fires for an enabled, onboarded portal).
 */
export async function portalAction(sb, leadId, action, items, { actor, note } = {}) {
  const target = await projectTargetOrThrow(sb, leadId);
  const opName = { issue: "sel_issue", withdraw: "sel_withdraw", return: "sel_return" }[action];
  if (!opName) throw new RegisterError(400, "Unknown action.", "BAD_ACTION");
  const ops = (items || []).filter((i) => i?.sync?.table === SEL && i.sync.rowId)
    .map((i) => ({ op: opName, item_id: i.id, row_id: i.sync.rowId, base_version: i.sync.version, note: note || null }));
  if (!ops.length) throw new RegisterError(400, "Only client selections on the project can be issued to the portal.", "NOT_SELECTION");
  const result = await callApply(sb, target, ops, actor);
  if (action === "issue" || action === "return") {
    for (const r of result?.results || []) {
      if (r.status !== "awaiting_client") continue;
      await notifyClient(target.project.id, {
        type: "selection_due",
        title: action === "issue" ? "A new selection is ready for you" : "Please review a selection",
        body: action === "issue" ? "A selection is ready on your Selections board." : (note || "Blue Leaf has asked you to review a selection."),
        entityType: "client_selection", entityId: r.row_id,
      });
    }
  }
  return { result, register: await loadCanonical(sb, target.project) };
}

/** Item history (append-only job_events written in the same transaction as each change). */
export async function itemHistory(sb, leadId, itemId) {
  const target = await resolveTarget(sb, leadId);
  if (!target.lead.job_id) return [];
  let q = sb.from("job_events").select("id, event_type, occurred_at, actor_id, metadata")
    .eq("job_id", target.lead.job_id).like("event_type", "register.%").order("occurred_at", { ascending: false }).limit(200);
  if (itemId) q = q.eq("metadata->>item_id", itemId);
  const { data, error } = await q;
  if (error) return [];
  return (data || []).map((e) => ({
    id: e.id, event: e.event_type, at: e.occurred_at, actorName: e.metadata?.actor_name || null,
    itemId: e.metadata?.item_id || null, postContract: !!e.metadata?.post_contract, note: e.metadata?.note || null,
    changes: e.metadata?.changes || null,
  }));
}

/** Guard used by salesRoutes PATCH: once promoted, the lead scratchpad is read-only history. */
export async function leadScratchpadLocked(sb, lead) {
  if (!lead?.job_id) return false;
  const { data, error } = await sb.from("projects").select("register_meta").eq("job_id", lead.job_id).maybeSingle();
  if (error) return false;                                  // pre-213: no lock
  return !!data?.register_meta;
}

export { writeRegister };
