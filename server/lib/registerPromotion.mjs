/**
 * registerPromotion.mjs — Master Register R02 · Increment 2 (promote-once).
 *
 * Promotes the staff-captured room-by-room brief from the pre-job scratchpad
 * (`leads.selections_schedule`, migration 188) into the canonical project-keyed stores created by
 * migration 212, at the two moments a `projects` row first exists for the lead's job:
 *   • the pre-construction portal is set up (salesRoutes POST /preconstruction-portal), and
 *   • the lead is Won (finalizeWonJob).
 *
 * The register's own scope-vs-selection axis (src/lib/register.js · isClientSelection) decides the
 * destination:
 *   • genuine product/finish CHOICES → `client_selections`, STAGED (client_visible = false) with NO
 *     `client_actions` row and NO notification — nothing reaches the client until the office issues
 *     it. (Promotion writes client_selections DIRECTLY, bypassing the admin create endpoint that
 *     raises the client-facing 'selection_decision' action + email.)
 *   • scope/works records, and selections settled as excluded / by-others / N-A → the internal-only
 *     `room_scope_items`. These must NEVER land in client_selections. This is the load-bearing guard.
 *
 * Idempotent: every row carries the register item's stable id (`ri_…`) in `source_register_item_id`;
 * the upsert is ON CONFLICT DO NOTHING (ignoreDuplicates), so re-running never duplicates and never
 * clobbers a later office edit. Non-fatal by contract — callers wrap in try/catch; a failure here
 * must never block a stage move or a win.
 *
 * Pure of HTTP — takes a Supabase-like client (service role in production). No client comms.
 */

import {
  readRegister,
  isClientSelection,
  roomLabel,
  categoryLabel,
} from "../../src/lib/register.js";

// Register selection certainty → client_selections.status (migration 103 enum). A promoted row is
// never surfaced to the client regardless (client_visible=false), so these are purely the internal
// starting state the office sees on the admin board.
const CERTAINTY_TO_STATUS = {
  not_considered: "not_started",
  preference: "not_started",
  proposed: "in_review",
  client_approved: "approved",
};

/** One short provenance line (goes into internal_notes / notes — never shown to the client). */
function provenanceNote(lead, item) {
  return [
    "Master Register",
    `lead ${lead.id}`,
    lead.stage ? `stage ${lead.stage}` : null,
    item.source ? `ref ${item.source}` : null,
  ]
    .filter(Boolean)
    .join(" • ");
}

/**
 * Deterministic sort_order per register item — grouped by the room list order (whole-house first),
 * then the item's position in the register. Keyed by item id so the SAME item maps to the SAME value
 * across promotion runs (far more stable than a raw per-run array index; see finding F5).
 */
function stableOrder(register) {
  const roomRank = new Map();
  (register.meta.rooms || []).forEach((r, i) => roomRank.set(r.id, i));
  const indexed = register.items.map((it, idx) => ({ it, idx }));
  indexed.sort((a, b) => {
    const ra = a.it.roomId ? (roomRank.get(a.it.roomId) ?? 9999) : -1; // whole-house/defaults first
    const rb = b.it.roomId ? (roomRank.get(b.it.roomId) ?? 9999) : -1;
    return ra !== rb ? ra - rb : a.idx - b.idx;
  });
  const order = new Map();
  indexed.forEach((e, i) => order.set(e.it.id, i));
  return order;
}

/**
 * Retract rows this store should no longer hold, because their register item was reclassified onto
 * the OTHER axis (selection↔scope) or removed from the register between promotion runs (findings
 * F2/F4). Without this, a selection later settled as excluded/by-others/N-A leaves a stale
 * client_selections row — the exact state the load-bearing guard forbids.
 *
 * `keepIds` is the set of register item ids this store SHOULD currently hold. Rows whose
 * source_register_item_id is not in keepIds are deleted. For client_selections we only ever touch
 * STAGED rows (client_visible=false) — a row the office has already issued (client_visible=true) is
 * client-owned and is never auto-retracted (no-clobber). Best-effort: any DB error is swallowed so
 * reconciliation can never block a stage move or a win.
 */
async function retractStale(sb, table, pid, keepIds, { stagedOnly, sourceLeadId }) {
  // Scope strictly to THIS lead's promoted rows (source_lead_id): if two leads ever promoted into the
  // same project, re-promoting one must never retract the other's rows.
  let readQ = sb.from(table).select("source_register_item_id").eq("project_id", pid).not("source_register_item_id", "is", null);
  if (sourceLeadId) readQ = readQ.eq("source_lead_id", sourceLeadId);
  if (stagedOnly) readQ = readQ.eq("client_visible", false);
  const { data, error } = await readQ;
  if (error || !Array.isArray(data)) return; // pre-212 column/table absent, or read failed — nothing to do
  const stale = [...new Set(data.map((r) => r.source_register_item_id))].filter((id) => id && !keepIds.has(id));
  if (!stale.length) return;
  let delQ = sb.from(table).delete().eq("project_id", pid).in("source_register_item_id", stale);
  if (sourceLeadId) delQ = delQ.eq("source_lead_id", sourceLeadId);
  if (stagedOnly) delQ = delQ.eq("client_visible", false);
  await delQ;
}

/**
 * Promote a lead's Master Register into its project's canonical stores.
 *
 * @param {object} sb                 Supabase-like client (service role).
 * @param {object} opts
 * @param {string} opts.leadId        The lead whose register is promoted.
 * @param {string} [opts.projectId]   Target project; if omitted, resolved via the lead's job_id.
 * @returns {Promise<{ok:boolean, reason?:string, projectId?:string, selections?:number, scopeItems?:number}>}
 */
export async function promoteRegisterToProject(sb, { leadId, projectId = null } = {}) {
  if (!sb || !leadId) return { ok: false, reason: "missing sb/leadId" };

  // 1. Load the lead — register source + identity. (project_type/name exist on leads; see migs 016/063.)
  const { data: lead, error: leadErr } = await sb
    .from("leads")
    .select("id, job_id, name, first_name, last_name, project_type, stage, selections_schedule")
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr) return { ok: false, reason: leadErr.message || "lead read failed" };
  if (!lead) return { ok: false, reason: "lead not found" };

  // 2. Resolve the target project. It must already exist (preconstruction or Won) — promotion never
  //    creates a project.
  let pid = projectId;
  if (!pid) {
    if (!lead.job_id) return { ok: false, reason: "no job for lead yet" };
    const { data: proj, error: pErr } = await sb
      .from("projects")
      .select("id")
      .eq("job_id", lead.job_id)
      .maybeSingle();
    if (pErr) return { ok: false, reason: pErr.message || "project read failed" };
    if (!proj) return { ok: false, reason: "no project for job yet" };
    pid = proj.id;
  }

  // 3. Parse + partition the register on the scope-vs-selection axis.
  const register = readRegister(lead);
  const order = stableOrder(register);
  const selections = [];
  const scope = [];
  for (const item of register.items) {
    (isClientSelection(item) ? selections : scope).push(item);
  }

  // 4a. CHOICES → client_selections, STAGED (hidden) + no client action, no notification.
  const selRows = selections.map((it) => ({
    project_id: pid,
    source_register_item_id: it.id,
    source_lead_id: lead.id,
    promoted_at: new Date().toISOString(),
    client_visible: false, // staged — the office issues it later; never auto-surfaced to the client
    category: categoryLabel(it.category),
    item_name: it.description || categoryLabel(it.category) || "Selection",
    room_area: roomLabel(register, it),
    status: CERTAINTY_TO_STATUS[it.certainty] || "not_started",
    selected_product: it.product || null,
    selected_model_code: it.model || null,
    // internal_notes is NEVER returned to the client (portal CLIENT_SELECTION_FIELDS omits it).
    internal_notes: [
      provenanceNote(lead, it),
      it.colour ? `Colour: ${it.colour}` : null,
      it.nextAction ? `Next: ${it.nextAction}` : null,
    ]
      .filter(Boolean)
      .join(" — "),
    approved_at: it.certainty === "client_approved" && it.evidence?.at ? it.evidence.at : null,
    sort_order: order.get(it.id) ?? 0,
  }));

  if (selRows.length) {
    const { error } = await sb
      .from("client_selections")
      .upsert(selRows, { onConflict: "project_id,source_register_item_id", ignoreDuplicates: true });
    if (error) return { ok: false, reason: error.message || "client_selections upsert failed" };
  }

  // 4b. Everything else → room_scope_items (internal-only; the portal never reads this table).
  const scopeRows = scope.map((it) => ({
    project_id: pid,
    source_register_item_id: it.id,
    source_lead_id: lead.id,
    promoted_at: new Date().toISOString(),
    room_area: roomLabel(register, it),
    category: it.category || null,
    item_kind: it.itemKind,
    disposition: it.disposition || null,
    certainty: it.itemKind === "selection" ? it.certainty || null : null,
    responsibility: it.responsibility || null,
    description: it.description || null,
    product: it.product || null,
    model: it.model || null,
    colour: it.colour || null,
    source_ref: it.source || null,
    next_action: it.nextAction || null,
    notes: provenanceNote(lead, it),
    sort_order: order.get(it.id) ?? 0,
  }));

  if (scopeRows.length) {
    const { error } = await sb
      .from("room_scope_items")
      .upsert(scopeRows, { onConflict: "project_id,source_register_item_id", ignoreDuplicates: true });
    if (error) return { ok: false, reason: error.message || "room_scope_items upsert failed" };
  }

  // 5. Reconcile the opposite store so an item reclassified (or removed) between the preconstruction
  //    and Won runs can't linger on the wrong axis — e.g. a selection later settled as
  //    excluded/by-others/N-A must not keep a (staged) client_selections row. Issued rows
  //    (client_visible=true) are never auto-retracted. Best-effort — never blocks the caller.
  const selIds = new Set(selections.map((i) => i.id));
  const scopeIds = new Set(scope.map((i) => i.id));
  await retractStale(sb, "client_selections", pid, selIds, { stagedOnly: true, sourceLeadId: lead.id });
  await retractStale(sb, "room_scope_items", pid, scopeIds, { stagedOnly: false, sourceLeadId: lead.id });

  return { ok: true, projectId: pid, selections: selRows.length, scopeItems: scopeRows.length };
}
