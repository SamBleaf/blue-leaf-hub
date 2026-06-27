// Procurement Intelligence (BQ-10) — register API.
//
// CLAUDE.md Law: ok()/err(); rowToCamel/rowsToCamel; camelCase boundary;
// never write order_by_date (GENERATED) or risk_status (computed) from the client.
// Role gates: register writes = admin/supervisor; PO/cost approval = admin.

import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth, requireRole } from "./requireAuth.mjs";
import { ok, err, rowToCamel, rowsToCamel, translateDbError } from "./apiResponse.mjs";
import {
  generateProcurementPlan, refreshJobRisk, recomputeItemRisk, computeCommittedCost,
} from "./procurementService.mjs";
import {
  onItemDelivered, refreshSupplierPerformance, detectMissingItems,
  quoteVsAllowance, suggestBackupSuppliers,
} from "./procurementLearningService.mjs";
import {
  aiConfigured, draftSupplierEmail, summariseSupplierReply,
  draftSelectionReminder, weeklyProcurementDigest, explainScheduleImpact,
} from "./procurementAiService.mjs";
import { buildPurchaseOrderPdfBuffer, defaultStandardConditions } from "./poPdfKit.mjs";
import { sendPlainMail } from "./notifyMail.mjs";
import { getBrandingEmailLogo } from "./brandingAssets.mjs";

const todayStr = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);
const GST_RATE = 0.1; // amounts ex-GST; 10% AU GST

const STATUS_VALUES = new Set([
  "not_started", "scope_required", "quote_requested", "quote_received",
  "waiting_on_selection", "waiting_on_clarification", "ready_for_approval", "approved",
  "po_drafted", "po_sent", "order_confirmed", "delivery_booked", "delivered", "closed",
  "delayed", "cancelled",
]);
const SUPPLY_VALUES = new Set(["builder_supplied", "subbie_supplied", "client_supplied", "pc_item"]);
const SEL_STATUS = new Set(["pending", "confirmed", "not_required"]);
const QUOTE_STATUS = new Set(["pending", "received", "not_required"]);
const RANK = {
  not_started: 0, scope_required: 1, quote_requested: 2, quote_received: 3,
  waiting_on_selection: 3, waiting_on_clarification: 3, ready_for_approval: 4,
  approved: 5, po_drafted: 6, po_sent: 7, order_confirmed: 8, delivery_booked: 9,
  delivered: 10, closed: 11, delayed: -1, cancelled: -1,
};

// fields a human may edit (sets user_modified). order_by_date/risk_status excluded.
const EDITABLE = {
  num: ["lead_time_days", "approval_buffer_days", "internal_review_buffer_days", "cost_allowance", "quoted_amount", "approved_amount", "quantity"],
  text: ["item_name", "category", "uom", "notes"],
  bool: ["required", "selection_required", "architect_clarification_required", "supplier_quote_required", "match_existing", "discontinued"],
  uuid: ["trade_category_id", "supplier_id", "backup_supplier_id", "related_schedule_task_id", "selection_decision_id", "purchase_order_id", "invoice_document_id"],
  date: ["required_on_site_date", "expected_delivery_date", "delivered_at"],
  enumStatus: ["status"],
  enumSupply: ["supply_type"],
  enumSel: ["selection_status"],
  enumQuote: ["supplier_quote_status"],
};

function buildItemUpdate(body) {
  const upd = {};
  for (const k of EDITABLE.num) if (k in body) upd[k] = body[k] === null || body[k] === "" ? null : Number(body[k]);
  for (const k of EDITABLE.text) if (k in body) upd[k] = body[k] === "" ? null : body[k];
  for (const k of EDITABLE.bool) if (k in body) upd[k] = !!body[k];
  for (const k of EDITABLE.uuid) if (k in body) upd[k] = body[k] || null;
  for (const k of EDITABLE.date) if (k in body) upd[k] = body[k] || null;
  if ("status" in body) {
    if (!STATUS_VALUES.has(body.status)) throw new Error(`Invalid status: ${body.status}`);
    upd.status = body.status;
  }
  if ("supply_type" in body) {
    if (!SUPPLY_VALUES.has(body.supply_type)) throw new Error(`Invalid supply_type: ${body.supply_type}`);
    upd.supply_type = body.supply_type;
  }
  if ("selection_status" in body) {
    if (body.selection_status && !SEL_STATUS.has(body.selection_status)) throw new Error("Invalid selection_status");
    upd.selection_status = body.selection_status || null;
  }
  if ("supplier_quote_status" in body) {
    if (body.supplier_quote_status && !QUOTE_STATUS.has(body.supplier_quote_status)) throw new Error("Invalid supplier_quote_status");
    upd.supplier_quote_status = body.supplier_quote_status || null;
  }
  return upd;
}

// re-risk a single item + return the fresh row
async function reRiskItem(sb, id) {
  const { data: row } = await sb.from("procurement_items").select("*").eq("id", id).maybeSingle();
  if (!row) return null;
  const risk = recomputeItemRisk(row, todayStr());
  if (risk !== row.risk_status) {
    await sb.from("procurement_items").update({ risk_status: risk, risk_refreshed_at: new Date().toISOString() }).eq("id", id);
    row.risk_status = risk;
  }
  return row;
}

// Stamp lifecycle timestamps on a status transition (without overwriting existing
// stamps). Feeds the learning ledger. `current` is the pre-update row.
function applyLifecycle(current, upd) {
  if (!("status" in upd)) return upd;
  const nowIso = new Date().toISOString();
  const rank = RANK[upd.status] ?? 0;
  if (rank >= RANK.po_sent && !current?.ordered_at && !upd.ordered_at) upd.ordered_at = nowIso;
  if (upd.status === "order_confirmed" && !current?.order_confirmed_at) upd.order_confirmed_at = nowIso;
  if (upd.status === "delivered" && !current?.delivered_at && !upd.delivered_at) upd.delivered_at = todayStr();
  return upd;
}

function formatGenerateResponse(result, existingBefore = 0) {
  return {
    summary: {
      created: result.created ?? 0,
      existing: existingBefore,
      skipped: result.skipped ?? 0,
      enriched: result.enriched ?? 0,
      refreshed: result.refreshed ?? 0,
      total: result.total ?? 0,
      warnings: result.warnings ?? [],
    },
    result,
  };
}

async function countProcurementItems(sb, jobId) {
  const { count } = await sb
    .from("procurement_items")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("required", true);
  return count || 0;
}

async function runGenerateForJob(sb, jobId, opts) {
  const existingBefore = await countProcurementItems(sb, jobId);
  const result = await generateProcurementPlan(sb, jobId, opts);
  return { result, payload: formatGenerateResponse(result, existingBefore) };
}

export function registerProcurementRoutes(app) {
  // ── Generate / regenerate ──────────────────────────────────────────────────
  app.post("/api/procurement/jobs/:jobId/generate", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { result, payload } = await runGenerateForJob(sb, req.params.jobId, {
        mode: "manual", actorId: req.caller?.id || null,
      });
      if (!result.ok) return err(res, 400, result.error || "Generation failed");
      // Plan regenerated → clear the schedule-drift staleness flag (migration 097).
      await sb.from("projects")
        .update({ procurement_plan_stale: false, procurement_plan_stale_since: null })
        .eq("job_id", req.params.jobId);
      return ok(res, payload);
    } catch (e) {
      console.error("[procurement/generate]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // Resolve job via project spine (same generation path as job route).
  app.post("/api/procurement/projects/:projectId/generate", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { data: project } = await sb
        .from("projects")
        .select("id, job_id")
        .eq("id", req.params.projectId)
        .maybeSingle();
      if (!project?.job_id) return err(res, 404, "Project not found or not linked to a job.");
      const { result, payload } = await runGenerateForJob(sb, project.job_id, {
        mode: "manual", actorId: req.caller?.id || null,
      });
      if (!result.ok) return err(res, 400, result.error || "Generation failed");
      await sb.from("projects")
        .update({ procurement_plan_stale: false, procurement_plan_stale_since: null })
        .eq("id", req.params.projectId);
      return ok(res, { ...payload, projectId: project.id, jobId: project.job_id });
    } catch (e) {
      console.error("[procurement/projects/generate]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── Register for a job (+ committed cost + risk counts) ──────────────────────
  app.get("/api/procurement/jobs/:jobId/items", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      await refreshJobRisk(sb, req.params.jobId);
      const { data, error } = await sb
        .from("procurement_items")
        .select("*")
        .eq("job_id", req.params.jobId)
        .order("order_by_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      const items = (data || []).filter((r) => r.required !== false);
      const committed = await computeCommittedCost(sb, req.params.jobId);
      const riskCounts = items.reduce((a, r) => { a[r.risk_status] = (a[r.risk_status] || 0) + 1; return a; }, {});
      const committedVisible = req.caller?.role === "admin" ? committed.committed : null;
      return ok(res, { items: rowsToCamel(items), committed: committedVisible, riskCounts });
    } catch (e) {
      console.error("[procurement/items GET]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── Committed cost only (Financial Command Centre integration) ───────────────
  app.get("/api/procurement/jobs/:jobId/committed-cost", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const c = await computeCommittedCost(sb, req.params.jobId);
      return ok(res, { committed: c.committed, lines: c.lines });
    } catch (e) {
      return err(res, 502, translateDbError(e));
    }
  });

  // ── Edit an item (sets user_modified) ────────────────────────────────────────
  app.patch("/api/procurement/items/:id", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      let upd;
      try { upd = buildItemUpdate(req.body || {}); }
      catch (ve) { return err(res, 400, ve.message); }
      // Cost fields are admin-only (plan §P): supervisors manage the register but not cost.
      if (req.caller?.role !== "admin") {
        for (const k of ["cost_allowance", "quoted_amount", "approved_amount"]) delete upd[k];
      }
      if (!Object.keys(upd).length) return err(res, 400, "No editable fields provided.");
      const { data: current } = await sb.from("procurement_items").select("*").eq("id", req.params.id).maybeSingle();
      if (!current) return err(res, 404, "Item not found.");
      applyLifecycle(current, upd);
      upd.user_modified = true;
      upd.updated_at = new Date().toISOString();
      const { error } = await sb.from("procurement_items").update(upd).eq("id", req.params.id);
      if (error) throw error;
      // Learning: an item just became delivered → capture lead observation + refresh supplier perf.
      if (upd.status === "delivered" && current.status !== "delivered") {
        try { await onItemDelivered(sb, req.params.id); } catch (le) { console.warn("[procurement] onItemDelivered:", le?.message || le); }
      }
      const row = await reRiskItem(sb, req.params.id);
      return ok(res, { item: row ? rowToCamel(row) : null });
    } catch (e) {
      console.error("[procurement/items PATCH]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── Add a manual item ────────────────────────────────────────────────────────
  app.post("/api/procurement/items", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const b = req.body || {};
    if (!b.jobId && !b.job_id) return err(res, 400, "jobId is required.");
    if (!b.itemName && !b.item_name) return err(res, 400, "itemName is required.");
    const jobId = b.jobId || b.job_id;
    try {
      const { data: project } = await sb.from("projects").select("id").eq("job_id", jobId).limit(1).maybeSingle();
      let upd;
      try { upd = buildItemUpdate({ ...b, item_name: b.itemName || b.item_name }); }
      catch (ve) { return err(res, 400, ve.message); }
      // Cost fields are admin-only (plan §P) — also on the manual-create path, not just PATCH.
      if (req.caller?.role !== "admin") {
        for (const k of ["cost_allowance", "quoted_amount", "approved_amount"]) delete upd[k];
      }
      const insert = {
        job_id: jobId, project_id: project?.id || null,
        source: "manual", user_modified: true, required: true,
        status: upd.status || "not_started",
        supply_type: upd.supply_type || "builder_supplied",
        ...upd,
      };
      const { data, error } = await sb.from("procurement_items").insert([insert]).select("*").single();
      if (error) throw error;
      const row = await reRiskItem(sb, data.id);
      return ok(res, { item: rowToCamel(row || data) });
    } catch (e) {
      console.error("[procurement/items POST]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── Soft-remove (required=false, won't resurrect on regenerate) ──────────────
  app.delete("/api/procurement/items/:id", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { error } = await sb.from("procurement_items")
        .update({ required: false, user_modified: true, updated_at: new Date().toISOString() })
        .eq("id", req.params.id);
      if (error) throw error;
      return ok(res);
    } catch (e) {
      console.error("[procurement/items DELETE]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── Command Centre — cross-job "what needs attention this week" ───────────────
  app.get("/api/procurement/command-centre", requireAuth, requireRole("admin", "supervisor"), async (_req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { data, error } = await sb
        .from("procurement_items")
        .select("*")
        .eq("required", true)
        .not("status", "in", "(closed,cancelled)");
      if (error) throw error;
      const items = data || [];
      // refresh risk in-memory for accurate buckets (cheap; persisted lazily on job open)
      const today = todayStr();
      for (const it of items) it.risk_status = recomputeItemRisk(it, today);

      // job address map
      const jobIds = [...new Set(items.map((i) => i.job_id))];
      const addr = {};
      if (jobIds.length) {
        const { data: jobs } = await sb.from("jobs").select("id, address").in("id", jobIds);
        for (const j of jobs || []) addr[j.id] = j.address;
      }
      const deco = (i) => ({ ...rowToCamel(i), jobAddress: addr[i.job_id] || null, daysUntilOrderBy: i.order_by_date ? daysBetween(i.order_by_date, today) : null });

      const orderable = (i) => (RANK[i.status] ?? 0) < RANK.po_sent;
      const buckets = {
        overdue:          items.filter((i) => i.order_by_date && i.order_by_date < today && orderable(i)).map(deco),
        dueSoon:          items.filter((i) => i.order_by_date && i.order_by_date >= today && daysBetween(i.order_by_date, today) <= 21 && orderable(i)).map(deco),
        selectionBlockers:items.filter((i) => i.selection_required && i.selection_status !== "confirmed").map(deco),
        awaitingQuotes:   items.filter((i) => (i.supplier_quote_required && i.supplier_quote_status !== "received") || i.status === "quote_requested").map(deco),
        deliveryRisks:    items.filter((i) => ["order_confirmed", "delivery_booked"].includes(i.status) && ["at_risk", "critical"].includes(i.risk_status)).map(deco),
        longLeadCriticals:items.filter((i) => i.risk_status === "critical" || ((i.lead_time_days || 0) >= 28 && ["watch", "at_risk", "critical"].includes(i.risk_status))).map(deco),
        needsDate:        items.filter((i) => !i.required_on_site_date).map(deco),
      };
      const sortByOrderBy = (arr) => arr.sort((a, b) => (a.orderByDate || "9999").localeCompare(b.orderByDate || "9999"));
      buckets.overdue = sortByOrderBy(buckets.overdue);
      buckets.dueSoon = sortByOrderBy(buckets.dueSoon);

      // Procurement plans flagged stale by a schedule change (migration 097) —
      // surfaces a "schedule changed, refresh plan" prompt without auto-running.
      let staleProjects = [];
      if (jobIds.length) {
        const { data: stale } = await sb
          .from("projects")
          .select("id, job_id, procurement_plan_stale_since")
          .in("job_id", jobIds)
          .eq("procurement_plan_stale", true);
        staleProjects = (stale || []).map((p) => ({
          projectId: p.id,
          jobId: p.job_id,
          jobAddress: addr[p.job_id] || null,
          staleSince: p.procurement_plan_stale_since || null,
        }));
      }

      return ok(res, { buckets, totalActive: items.length, staleProjects });
    } catch (e) {
      console.error("[procurement/command-centre]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── Selection blockers (joins portal_decisions) ──────────────────────────────
  app.get("/api/procurement/selections/blockers", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      let q = sb.from("procurement_items").select("*").eq("required", true).eq("selection_required", true);
      if (req.query.jobId) q = q.eq("job_id", req.query.jobId);
      const { data, error } = await q;
      if (error) throw error;
      const items = (data || []).filter((i) => i.selection_status !== "confirmed");
      const decIds = [...new Set(items.map((i) => i.selection_decision_id).filter(Boolean))];
      const decById = {};
      if (decIds.length) {
        const { data: decs } = await sb.from("portal_decisions").select("id, title, status, due_date, urgency").in("id", decIds);
        for (const d of decs || []) decById[d.id] = d;
      }
      const today = todayStr();
      const out = items.map((i) => ({
        ...rowToCamel(i),
        decision: i.selection_decision_id ? rowToCamel(decById[i.selection_decision_id] || null) : null,
        daysUntilOrderBy: i.order_by_date ? daysBetween(i.order_by_date, today) : null,
      }));
      return ok(res, { blockers: out });
    } catch (e) {
      console.error("[procurement/selections/blockers]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── Request a quote (mark quote_requested; email draft is P2 — never auto-send) ─
  app.post("/api/procurement/items/:id/request-quote", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { error } = await sb.from("procurement_items").update({
        status: "quote_requested", supplier_quote_required: true, supplier_quote_status: "pending",
        user_modified: true, updated_at: new Date().toISOString(),
      }).eq("id", req.params.id);
      if (error) throw error;
      const row = await reRiskItem(sb, req.params.id);
      return ok(res, { item: row ? rowToCamel(row) : null });
    } catch (e) {
      console.error("[procurement/request-quote]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── Draft a PO (creates a DRAFT purchase_orders row + links it — NEVER sends/orders) ──
  app.post("/api/procurement/items/:id/draft-po", requireAuth, requireRole("admin"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { data: item } = await sb.from("procurement_items").select("*").eq("id", req.params.id).maybeSingle();
      if (!item) return err(res, 404, "Item not found.");
      if (item.supply_type !== "builder_supplied")
        return err(res, 400, `Only builder-supplied items are ordered by us (this is ${String(item.supply_type).replace(/_/g, " ")}).`);
      const supplierId = req.body?.supplierId || item.supplier_id;
      const [{ data: supplier }, { data: trade }, { data: project }] = await Promise.all([
        supplierId ? sb.from("suppliers").select("name, email").eq("id", supplierId).maybeSingle() : Promise.resolve({ data: null }),
        item.trade_category_id ? sb.from("trade_categories").select("name").eq("id", item.trade_category_id).maybeSingle() : Promise.resolve({ data: null }),
        sb.from("projects").select("id, address").eq("job_id", item.job_id).limit(1).maybeSingle(),
      ]);
      const amount = Number(item.approved_amount ?? item.quoted_amount ?? item.cost_allowance ?? 0) || 0;
      // Guard: a PO with no supplier or $0 can never be issued — block it at draft.
      if (!supplierId) return err(res, 400, "Assign a supplier before drafting a PO.");
      if (amount <= 0) return err(res, 400, "Set an approved or quoted amount before drafting a PO.");
      const gst = Math.round(amount * GST_RATE * 100) / 100;
      const poRow = {
        project_id: project?.id || null, job_id: item.job_id, subcontractor_id: null,
        po_number: `PO-D-${String(item.job_id).slice(0, 4)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase(),
        trade: trade?.name || item.category || null,
        scope_of_work: `${supplier?.name ? supplier.name + " — " : ""}${item.item_name}${item.quantity ? ` ×${item.quantity}${item.uom ? " " + item.uom : ""}` : ""}`,
        line_items: [{ description: item.item_name, quantity: item.quantity || 1, uom: item.uom || null, unit_cost: amount, total: amount }],
        total_amount: amount, gst_amount: gst, total_inc_gst: Math.round((amount + gst) * 100) / 100,
        status: "draft",
      };
      const { data: po, error: poErr } = await sb.from("purchase_orders").insert([poRow]).select("id, po_number, status, total_amount").single();
      if (poErr) throw poErr;
      await sb.from("procurement_items").update({
        purchase_order_id: po.id, supplier_id: supplierId || item.supplier_id || null,
        status: (RANK[item.status] ?? 0) < RANK.po_drafted ? "po_drafted" : item.status,
        user_modified: true, updated_at: new Date().toISOString(),
      }).eq("id", item.id);
      const row = await reRiskItem(sb, item.id);
      return ok(res, { purchaseOrder: rowToCamel(po), item: row ? rowToCamel(row) : null, note: "Draft PO created. Use 'Issue PO' to send it to the supplier — nothing has been sent yet." });
    } catch (e) {
      console.error("[procurement/draft-po]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── POST /api/procurement/items/:id/issue-po ────────────────────────────────
  // The missing end-to-end step: issue an item's DRAFT po — render the PO PDF,
  // email it to the assigned supplier, mark PO issued + item po_sent (so committed
  // cost advances). Procurement-specific; does NOT touch the tender /api/po/issue.
  app.post("/api/procurement/items/:id/issue-po", requireAuth, requireRole("admin"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { data: item } = await sb.from("procurement_items").select("*").eq("id", req.params.id).maybeSingle();
      if (!item) return err(res, 404, "Item not found.");
      if (!item.purchase_order_id) return err(res, 400, "Draft a PO for this item first.");

      const [{ data: po }, { data: supplier }, { data: trade }, { data: project }] = await Promise.all([
        sb.from("purchase_orders").select("*").eq("id", item.purchase_order_id).maybeSingle(),
        item.supplier_id ? sb.from("suppliers").select("name, email, phone, address").eq("id", item.supplier_id).maybeSingle() : Promise.resolve({ data: null }),
        item.trade_category_id ? sb.from("trade_categories").select("name").eq("id", item.trade_category_id).maybeSingle() : Promise.resolve({ data: null }),
        sb.from("projects").select("id, address").eq("job_id", item.job_id).limit(1).maybeSingle(),
      ]);
      if (!po) return err(res, 404, "Linked PO not found — draft it again.");
      if (po.status === "issued") return err(res, 409, "This PO has already been issued.");
      if (!supplier) return err(res, 400, "Assign a supplier before issuing.");
      if (!supplier.email) return err(res, 400, `${supplier.name || "The supplier"} has no email on file — add one before issuing.`);

      const amount = Number(po.total_amount ?? 0) || 0;
      if (amount <= 0) return err(res, 400, "PO amount is zero — set an approved amount and re-draft.");
      const gst = Number(po.gst_amount ?? Math.round(amount * GST_RATE * 100) / 100);
      const incGst = Number(po.total_inc_gst ?? Math.round((amount + gst) * 100) / 100);

      const { data: company } = await sb.from("company_profile").select("name, abn, address, phone, email").limit(1).maybeSingle();
      const logoDataUrl = await getBrandingEmailLogo(sb).catch(() => "");

      const lineItems = (Array.isArray(po.line_items) && po.line_items.length)
        ? po.line_items.map((li) => ({ description: li.description || item.item_name, qty: String(li.quantity ?? item.quantity ?? 1), unit: li.uom || item.uom || "", unitCost: Number(li.unit_cost ?? amount), lineTotal: Number(li.total ?? amount) }))
        : [{ description: item.item_name, qty: String(item.quantity || 1), unit: item.uom || "", unitCost: amount, lineTotal: amount }];

      const pdfBuf = await buildPurchaseOrderPdfBuffer({
        poNumber: po.po_number,
        dateCreatedIso: todayStr(),
        company: {
          companyName: company?.name || "Blue Leaf Building",
          abn: company?.abn || "", address: company?.address || "",
          phone: company?.phone || "", email: company?.email || "", website: "",
        },
        vendor: { name: supplier.name || "Supplier", lines: [supplier.address, supplier.phone, supplier.email].filter(Boolean) },
        jobAddress: project?.address || "",
        tradeTitle: trade?.name || item.category || "Materials",
        scheduledCompletionIso: item.required_on_site_date || "",
        tentativeStartLabel: "",
        lineItems,
        subtotalExGst: amount, gstAmount: gst, totalIncGst: incGst,
        standardConditions: defaultStandardConditions(),
        logoDataUrl,
      });

      const safeAddr = (project?.address || "job").replace(/[^a-zA-Z0-9]/g, "-");
      const fmtAud = (n) => Number(n || 0).toLocaleString("en-AU", { style: "currency", currency: "AUD" });
      await sendPlainMail({
        to: supplier.email,
        subject: `Purchase Order ${po.po_number} — ${project?.address || "Blue Leaf Building"}`,
        text: `Hi ${supplier.name || ""},\n\nPlease find attached Purchase Order ${po.po_number} for ${project?.address || "our project"}.\n\nItem: ${item.item_name}\nTotal (inc GST): ${fmtAud(incGst)}\n\nPlease confirm receipt and expected delivery.\n\nBlue Leaf Building`,
        attachments: [{ filename: `PO-${po.po_number}-${safeAddr}.pdf`, content: pdfBuf, contentType: "application/pdf" }],
      });

      await sb.from("purchase_orders").update({ status: "issued", issued_at: new Date().toISOString() }).eq("id", po.id);
      await sb.from("procurement_items").update({
        status: (RANK[item.status] ?? 0) < RANK.po_sent ? "po_sent" : item.status,
        user_modified: true, updated_at: new Date().toISOString(),
      }).eq("id", item.id);
      const row = await reRiskItem(sb, item.id);
      return ok(res, { purchaseOrder: { ...rowToCamel(po), status: "issued" }, item: row ? rowToCamel(row) : null, emailedTo: supplier.email });
    } catch (e) {
      console.error("[procurement/issue-po]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── Suppliers CRUD ───────────────────────────────────────────────────────────
  app.get("/api/procurement/suppliers", requireAuth, requireRole("admin", "supervisor"), async (_req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { data, error } = await sb.from("suppliers").select("*").order("name", { ascending: true });
      if (error) throw error;
      return ok(res, { suppliers: rowsToCamel(data || []) });
    } catch (e) {
      return err(res, 502, translateDbError(e));
    }
  });

  app.post("/api/procurement/suppliers", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const b = req.body || {};
    if (!b.name) return err(res, 400, "name is required.");
    try {
      const insert = {
        name: b.name, abn: b.abn || null, trade_category_id: b.tradeCategoryId || null,
        contact_name: b.contactName || null, email: b.email || null, phone: b.phone || null,
        usual_lead_time_days: b.usualLeadTimeDays != null ? Number(b.usualLeadTimeDays) : null,
        account_terms: b.accountTerms || null, is_preferred: !!b.isPreferred, usual_products: b.usualProducts || null,
        notes: b.notes || null, is_active: b.isActive !== false,
      };
      const { data, error } = await sb.from("suppliers").insert([insert]).select("*").single();
      if (error) throw error;
      return ok(res, { supplier: rowToCamel(data) });
    } catch (e) {
      console.error("[procurement/suppliers POST]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  app.patch("/api/procurement/suppliers/:id", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const b = req.body || {};
    const map = { name: "name", abn: "abn", tradeCategoryId: "trade_category_id", contactName: "contact_name", email: "email", phone: "phone", usualLeadTimeDays: "usual_lead_time_days", accountTerms: "account_terms", usualProducts: "usual_products", isPreferred: "is_preferred", notes: "notes", isActive: "is_active" };
    const upd = { updated_at: new Date().toISOString() };
    for (const [camel, snake] of Object.entries(map)) {
      if (camel in b) upd[snake] = snake === "usual_lead_time_days" ? (b[camel] == null ? null : Number(b[camel]))
        : (snake === "is_active" || snake === "is_preferred") ? !!b[camel] : (b[camel] || null);
    }
    try {
      const { data, error } = await sb.from("suppliers").update(upd).eq("id", req.params.id).select("*").single();
      if (error) throw error;
      return ok(res, { supplier: rowToCamel(data) });
    } catch (e) {
      console.error("[procurement/suppliers PATCH]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── Supplier performance (learning) ──────────────────────────────────────────
  app.get("/api/procurement/suppliers/:id/performance", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const [{ data: supplier }, { data: obs }] = await Promise.all([
        sb.from("suppliers").select("*").eq("id", req.params.id).maybeSingle(),
        sb.from("supplier_lead_observations").select("*").eq("supplier_id", req.params.id).order("delivered_at", { ascending: false }).limit(50),
      ]);
      if (!supplier) return err(res, 404, "Supplier not found.");
      return ok(res, { supplier: rowToCamel(supplier), observations: rowsToCamel(obs || []) });
    } catch (e) { return err(res, 502, translateDbError(e)); }
  });

  app.post("/api/procurement/suppliers/:id/refresh-performance", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const r = await refreshSupplierPerformance(sb, req.params.id);
      return ok(res, { performance: r ? rowToCamel(r) : null });
    } catch (e) { return err(res, 502, translateDbError(e)); }
  });

  // ── Missing-item detection vs similar past jobs ──────────────────────────────
  app.get("/api/procurement/jobs/:jobId/missing-items", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const missing = await detectMissingItems(sb, req.params.jobId, { threshold: Number(req.query.threshold) || 0.6 });
      return ok(res, { missing });
    } catch (e) { return err(res, 502, translateDbError(e)); }
  });

  // ── Quote vs estimate-allowance variance for a job ───────────────────────────
  app.get("/api/procurement/jobs/:jobId/quote-variance", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { data } = await sb.from("procurement_items").select("*").eq("job_id", req.params.jobId).eq("required", true);
      const out = (data || []).map((it) => ({ ...rowToCamel(it), quoteVariance: quoteVsAllowance(it) })).filter((it) => it.quoteVariance);
      return ok(res, { items: out });
    } catch (e) { return err(res, 502, translateDbError(e)); }
  });

  // ── Backup-supplier suggestions for an item ──────────────────────────────────
  app.get("/api/procurement/items/:id/backup-suppliers", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { data: item } = await sb.from("procurement_items").select("*").eq("id", req.params.id).maybeSingle();
      if (!item) return err(res, 404, "Item not found.");
      const suppliers = await suggestBackupSuppliers(sb, item);
      return ok(res, { suppliers: rowsToCamel(suppliers) });
    } catch (e) { return err(res, 502, translateDbError(e)); }
  });

  // ── Cross-job long-lead criticals ────────────────────────────────────────────
  app.get("/api/procurement/long-lead", requireAuth, requireRole("admin", "supervisor"), async (_req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { data } = await sb.from("procurement_items").select("*").eq("required", true)
        .not("status", "in", "(closed,cancelled,delivered)").gte("lead_time_days", 28);
      const today = todayStr();
      const items = (data || []).map((i) => ({ ...i, risk_status: recomputeItemRisk(i, today) }));
      const jobIds = [...new Set(items.map((i) => i.job_id))];
      const addr = {};
      if (jobIds.length) { const { data: jobs } = await sb.from("jobs").select("id, address").in("id", jobIds); for (const j of jobs || []) addr[j.id] = j.address; }
      const out = items.map((i) => ({ ...rowToCamel(i), jobAddress: addr[i.job_id] || null, daysUntilOrderBy: i.order_by_date ? daysBetween(i.order_by_date, today) : null }))
        .sort((a, b) => (a.orderByDate || "9999").localeCompare(b.orderByDate || "9999"));
      return ok(res, { items: out });
    } catch (e) { return err(res, 502, translateDbError(e)); }
  });

  // ── Cross-job items grouped by supplier (batch ordering) ─────────────────────
  app.get("/api/procurement/by-supplier", requireAuth, requireRole("admin", "supervisor"), async (_req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { data } = await sb.from("procurement_items").select("*").eq("required", true).eq("supply_type", "builder_supplied")
        .not("status", "in", "(closed,cancelled,delivered)");
      const items = data || [];
      const supIds = [...new Set(items.map((i) => i.supplier_id).filter(Boolean))];
      const supById = {};
      if (supIds.length) { const { data: sups } = await sb.from("suppliers").select("id, name, email").in("id", supIds); for (const s of sups || []) supById[s.id] = s; }
      const groups = {};
      for (const it of items) {
        const key = it.supplier_id || "unassigned";
        (groups[key] ||= { supplier: it.supplier_id ? rowToCamel(supById[it.supplier_id] || null) : null, items: [] }).items.push(rowToCamel(it));
      }
      return ok(res, { groups: Object.values(groups) });
    } catch (e) { return err(res, 502, translateDbError(e)); }
  });

  // ── AI drafts (DRAFT ONLY — never sent/ordered) ──────────────────────────────
  app.post("/api/procurement/ai/supplier-email", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const { supplierId, itemIds, kind } = req.body || {};
    if (!supplierId || !Array.isArray(itemIds) || !itemIds.length) return err(res, 400, "supplierId and itemIds[] required.");
    try {
      const draft = await draftSupplierEmail(sb, { supplierId, itemIds, kind: kind === "order" ? "order" : "rfq" });
      return ok(res, { draft, aiConfigured: aiConfigured() });
    } catch (e) { return err(res, 502, translateDbError(e)); }
  });

  app.post("/api/procurement/ai/summarise-reply", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    if (!req.body?.replyText) return err(res, 400, "replyText required.");
    try { return ok(res, { result: await summariseSupplierReply(req.body.replyText), aiConfigured: aiConfigured() }); }
    catch (e) { return err(res, 502, translateDbError(e)); }
  });

  app.post("/api/procurement/items/:id/ai/selection-reminder", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const draft = await draftSelectionReminder(sb, req.params.id);
      if (!draft) return err(res, 404, "Item not found.");
      return ok(res, { draft, aiConfigured: aiConfigured() });
    } catch (e) { return err(res, 502, translateDbError(e)); }
  });

  app.post("/api/procurement/items/:id/ai/schedule-impact", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const out = await explainScheduleImpact(sb, req.params.id, Number(req.body?.slipDays) || 0);
      if (!out) return err(res, 404, "Item not found.");
      return ok(res, { result: out, aiConfigured: aiConfigured() });
    } catch (e) { return err(res, 502, translateDbError(e)); }
  });

  app.get("/api/procurement/ai/weekly-digest", requireAuth, requireRole("admin", "supervisor"), async (_req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try { return ok(res, { digest: await weeklyProcurementDigest(sb), aiConfigured: aiConfigured() }); }
    catch (e) { return err(res, 502, translateDbError(e)); }
  });
}
