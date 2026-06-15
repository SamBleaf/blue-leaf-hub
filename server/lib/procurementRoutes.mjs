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

const todayStr = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);

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
  bool: ["required", "selection_required", "architect_clarification_required", "supplier_quote_required", "match_existing"],
  uuid: ["trade_category_id", "supplier_id", "backup_supplier_id", "related_schedule_task_id", "selection_decision_id", "purchase_order_id", "invoice_document_id"],
  date: ["required_on_site_date"],
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

export function registerProcurementRoutes(app) {
  // ── Generate / regenerate ──────────────────────────────────────────────────
  app.post("/api/procurement/jobs/:jobId/generate", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const result = await generateProcurementPlan(sb, req.params.jobId, {
        mode: "manual", actorId: req.caller?.id || null,
      });
      if (!result.ok) return err(res, 400, result.error || "Generation failed");
      return ok(res, { result });
    } catch (e) {
      console.error("[procurement/generate]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── Register for a job (+ committed cost + risk counts) ──────────────────────
  app.get("/api/procurement/jobs/:jobId/items", requireAuth, async (req, res) => {
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
      return ok(res, { items: rowsToCamel(items), committed: committed.committed, riskCounts });
    } catch (e) {
      console.error("[procurement/items GET]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── Committed cost only (Financial Command Centre integration) ───────────────
  app.get("/api/procurement/jobs/:jobId/committed-cost", requireAuth, async (req, res) => {
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
      if (!Object.keys(upd).length) return err(res, 400, "No editable fields provided.");
      upd.user_modified = true;
      upd.updated_at = new Date().toISOString();
      const { error } = await sb.from("procurement_items").update(upd).eq("id", req.params.id);
      if (error) throw error;
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
  app.get("/api/procurement/command-centre", requireAuth, async (_req, res) => {
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
      return ok(res, { buckets, totalActive: items.length });
    } catch (e) {
      console.error("[procurement/command-centre]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── Selection blockers (joins portal_decisions) ──────────────────────────────
  app.get("/api/procurement/selections/blockers", requireAuth, async (req, res) => {
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

  // ── Draft PO — P2 stub (feature-flagged) ─────────────────────────────────────
  app.post("/api/procurement/items/:id/draft-po", requireAuth, requireRole("admin"), async (_req, res) => {
    return err(res, 501, "Auto-draft purchase orders ships in P2. For now, raise the PO in the existing purchase-order flow.", "NOT_IMPLEMENTED");
  });

  // ── Suppliers CRUD ───────────────────────────────────────────────────────────
  app.get("/api/procurement/suppliers", requireAuth, async (_req, res) => {
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
    const map = { name: "name", abn: "abn", tradeCategoryId: "trade_category_id", contactName: "contact_name", email: "email", phone: "phone", usualLeadTimeDays: "usual_lead_time_days", notes: "notes", isActive: "is_active" };
    const upd = { updated_at: new Date().toISOString() };
    for (const [camel, snake] of Object.entries(map)) {
      if (camel in b) upd[snake] = snake === "usual_lead_time_days" ? (b[camel] == null ? null : Number(b[camel])) : snake === "is_active" ? !!b[camel] : (b[camel] || null);
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
}
