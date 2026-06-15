// Procurement Intelligence (BQ-10) — generation + risk + committed-cost service.
//
// Pure logic over the procurement_items register (migration 085). DB via the
// service-role client passed in by callers (routes + the job-lock hook).
//
// Canonical Data Law:
//   * order_by_date is a GENERATED column in the DB — we never write it.
//   * Generation is an UPSERT keyed by (job_id, source, source_ref) — it adds
//     newly-relevant items and refreshes system-owned fields WITHOUT clobbering
//     human edits (user_modified) or duplicating rows.
//   * Reuses pullBuildexactEstimate + resolveTradeCategoryId; never re-implements them.
//
// Status rank + risk thresholds mirror src/lib/constants.js (server can't import
// the frontend module). The SQL CHECK constraints in migration 085 are the source
// of truth for the value strings.

import { resolveTradeCategoryId } from "./buildexactParser.mjs";
import { pullBuildexactEstimate } from "./buildexactDeepIntegration.mjs";
import { buildexactConfigured } from "./buildexactClient.mjs";
import { emitEvent } from "./factsService.mjs";

// Linear progress rank (mirror of PROCUREMENT_STATUS_RANK). off-rail = -1.
const STATUS_RANK = {
  not_started: 0, scope_required: 1, quote_requested: 2, quote_received: 3,
  waiting_on_selection: 3, waiting_on_clarification: 3, ready_for_approval: 4,
  approved: 5, po_drafted: 6, po_sent: 7, order_confirmed: 8, delivery_booked: 9,
  delivered: 10, closed: 11, delayed: -1, cancelled: -1,
};
const RANK_PO_SENT = STATUS_RANK.po_sent;            // 7
const RANK_ORDER_CONFIRMED = STATUS_RANK.order_confirmed; // 8
const DONE_STATUSES = new Set(["delivered", "closed", "cancelled"]);

const todayStr = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);

// Normalise a string for fuzzy item-name de-dup (lowercase alnum tokens).
function normKey(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function fuzzyNameMatch(a, b) {
  const na = normKey(a), nb = normKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

// ── Risk (separate dimension, computed because 'today' moves) ──────────────────
// Mirrors runbook §1.2. Returns one of: on_track|watch|at_risk|critical|blocked.
export function recomputeItemRisk(item, today = todayStr()) {
  const status = item.status || "not_started";
  if (DONE_STATUSES.has(status)) return "on_track";
  const rank = STATUS_RANK[status] ?? 0;
  const obd = item.order_by_date;

  const selectionOpen =
    !!item.selection_required && item.selection_status !== "confirmed";

  if (obd == null) {
    // No date yet → not a false risk; but an open selection is still a blocker signal.
    return selectionOpen ? "blocked" : "on_track";
  }
  const dUntil = daysBetween(obd, today); // negative = overdue

  if (selectionOpen && dUntil <= 14) return "blocked";
  if (dUntil < 0 && rank < RANK_ORDER_CONFIRMED) return "critical";
  if (dUntil <= 7 && rank < RANK_PO_SENT) return "at_risk";
  if (dUntil <= 21 && rank < RANK_PO_SENT) return "watch";
  return "on_track";
}

// Recompute + persist risk_status for every item on a job. Cheap; called after
// generation and after any item write that could shift risk.
export async function refreshJobRisk(sb, jobId) {
  const { data: items, error } = await sb
    .from("procurement_items")
    .select("id, status, order_by_date, selection_required, selection_status, risk_status")
    .eq("job_id", jobId)
    .eq("required", true);
  if (error || !items) return { updated: 0 };
  const today = todayStr();
  let updated = 0;
  for (const it of items) {
    const risk = recomputeItemRisk(it, today);
    if (risk !== it.risk_status) {
      await sb.from("procurement_items")
        .update({ risk_status: risk, risk_refreshed_at: new Date().toISOString() })
        .eq("id", it.id);
      updated++;
    }
  }
  return { updated };
}

// Committed cost = Σ approved_amount on items whose PO has been sent (rank ≥ po_sent).
// Computed, never stored-editable. Used by the Financial Command Centre.
export async function computeCommittedCost(sb, jobId) {
  const { data, error } = await sb
    .from("procurement_items")
    .select("status, approved_amount, quoted_amount, cost_allowance")
    .eq("job_id", jobId)
    .eq("required", true);
  if (error || !data) return { committed: 0, lines: 0 };
  let committed = 0, lines = 0;
  for (const it of data) {
    if ((STATUS_RANK[it.status] ?? 0) >= RANK_PO_SENT) {
      const amt = Number(it.approved_amount ?? it.quoted_amount ?? it.cost_allowance ?? 0);
      if (Number.isFinite(amt)) { committed += amt; lines++; }
    }
  }
  return { committed: Math.round(committed * 100) / 100, lines };
}

// ── Generation (auto-on-lock + regenerate, idempotent UPSERT) ──────────────────
//
// generateProcurementPlan(sb, jobId, { mode }) — mode is 'auto' | 'manual' (telemetry only).
// Returns { ok, created, refreshed, enriched, skipped, blocked, total }.
export async function generateProcurementPlan(sb, jobId, { mode = "manual", actorId = null } = {}) {
  const out = { ok: true, mode, created: 0, refreshed: 0, enriched: 0, skipped: 0, total: 0 };
  if (!sb || !jobId) return { ok: false, error: "missing sb/jobId" };

  // job + its project (jobs don't store project_id; projects.job_id → project)
  const { data: job } = await sb.from("jobs").select("id, project_type").eq("id", jobId).maybeSingle();
  if (!job) return { ok: false, error: "job not found" };
  const buildType = String(job.project_type || "").trim().toLowerCase();

  const { data: project } = await sb
    .from("projects")
    .select("id, buildexact_job_id")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const projectId = project?.id || null;

  // existing register rows for this job
  const reload = async () =>
    (await sb.from("procurement_items").select("*").eq("job_id", jobId)).data || [];
  let existing = await reload();
  const byKey = (src, ref) =>
    existing.find((e) => e.source === src && e.source_ref === ref) ||
    // template rows that absorbed an estimate keep source='template+estimate'
    (src === "template" ? existing.find((e) => e.source === "template+estimate" && e.source_ref === ref) : null);

  // ── SOURCE 1: master template (always available, works pre-estimate) ──
  let templates = [];
  {
    const { data } = await sb.from("procurement_templates").select("*").eq("is_active", true);
    templates = (data || []).filter((t) => {
      const types = t.applies_to_build_types;
      if (!types || types.length === 0) return true;        // applies to all
      if (!buildType) return true;                          // unknown build type → include
      return types.map((x) => String(x).toLowerCase()).includes(buildType);
    });
  }
  for (const t of templates) {
    const ref = String(t.id);
    const row = byKey("template", ref);
    if (!row) {
      const { error } = await sb.from("procurement_items").insert([{
        job_id: jobId, project_id: projectId,
        trade_category_id: t.trade_category_id,
        item_name: t.item_name, category: t.phase || null,
        source: "template", source_ref: ref, template_id: t.id,
        required: true,
        supply_type: t.supply_type || "builder_supplied",
        supplier_id: t.default_supplier_id || null,
        lead_time_days: t.default_lead_time_days ?? null,
        selection_required: !!t.selection_required,
        match_existing: !!t.match_existing,
        status: "not_started",
      }]);
      if (!error) out.created++;
    } else if (!row.user_modified && row.required !== false) {
      // refresh template-descriptive fields only (system-owned), never human-owned
      const upd = {
        item_name: t.item_name,
        trade_category_id: t.trade_category_id,
        category: t.phase || null,
        selection_required: !!t.selection_required,
        match_existing: !!t.match_existing,
        updated_at: new Date().toISOString(),
      };
      if (row.lead_time_days == null && t.default_lead_time_days != null) upd.lead_time_days = t.default_lead_time_days;
      await sb.from("procurement_items").update(upd).eq("id", row.id);
      out.refreshed++;
    } else {
      out.skipped++; // deleted (required=false) or user-edited → respect it
    }
  }
  existing = await reload();

  // ── SOURCE 2: Buildexact estimate (refines the real list, when present) ──
  if (buildexactConfigured() && project?.buildexact_job_id) {
    try {
      const est = await pullBuildexactEstimate(project.buildexact_job_id);
      const lines = est?.estimate?.categories || [];
      for (const line of lines) {
        const desc = line.description || line.categoryName || "";
        const amount = Number(line.amount);
        if (!desc || !Number.isFinite(amount)) continue;
        const tradeId = await resolveTradeCategoryId(sb, line.categoryName || desc);

        // de-dup: an existing non-cancelled item, same trade + fuzzy name → enrich, don't duplicate
        const match = existing.find((e) =>
          e.required !== false &&
          (tradeId ? e.trade_category_id === tradeId : true) &&
          fuzzyNameMatch(e.item_name, desc));
        if (match) {
          const upd = { updated_at: new Date().toISOString() };
          if (!match.user_modified || match.cost_allowance == null) upd.cost_allowance = amount;
          if (match.source === "template") { upd.source = "template+estimate"; }
          await sb.from("procurement_items").update(upd).eq("id", match.id);
          out.enriched++;
          continue;
        }
        // else upsert a fresh estimate-sourced item
        const ref = normKey(`${line.categoryName || ""}|${desc}`).slice(0, 180);
        const row = existing.find((e) => e.source === "estimate" && e.source_ref === ref);
        if (!row) {
          const { error } = await sb.from("procurement_items").insert([{
            job_id: jobId, project_id: projectId, trade_category_id: tradeId,
            item_name: desc, source: "estimate", source_ref: ref,
            required: true, supply_type: "builder_supplied",
            cost_allowance: amount, status: "not_started",
          }]);
          if (!error) { out.created++; existing.push({ source: "estimate", source_ref: ref, item_name: desc, trade_category_id: tradeId, required: true }); }
        } else if (!row.user_modified) {
          await sb.from("procurement_items").update({ cost_allowance: amount, updated_at: new Date().toISOString() }).eq("id", row.id);
          out.refreshed++;
        }
      }
    } catch (e) {
      console.warn("[procurement] estimate enrich skipped:", e?.message || e);
      // template-only mode — fully usable
    }
    existing = await reload();
  }

  // ── SOURCE 3: schedule (required-on-site dates → drives Generated order_by) ──
  if (projectId) {
    const { data: tasks } = await sb
      .from("schedule_tasks")
      .select("id, trade, phase, start_date, trade")
      .eq("project_id", projectId);
    if (tasks?.length) {
      // index tasks by normalised trade name → earliest start_date
      const tcIds = [...new Set(existing.map((e) => e.trade_category_id).filter(Boolean))];
      const tcNameById = {};
      if (tcIds.length) {
        const { data: tcs } = await sb.from("trade_categories").select("id, name").in("id", tcIds);
        for (const tc of tcs || []) tcNameById[tc.id] = normKey(tc.name);
      }
      for (const it of existing) {
        if (it.required === false) continue;
        if (it.user_modified && it.related_schedule_task_id) continue; // respect manual link
        const tcName = tcNameById[it.trade_category_id];
        if (!tcName) continue;
        const matches = tasks.filter((t) => normKey(t.trade) === tcName && t.start_date);
        if (!matches.length) continue;
        matches.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
        const task = matches[0];
        const upd = {};
        if (it.related_schedule_task_id !== task.id) upd.related_schedule_task_id = task.id;
        if (it.required_on_site_date !== task.start_date) upd.required_on_site_date = task.start_date;
        if (Object.keys(upd).length) {
          upd.updated_at = new Date().toISOString();
          await sb.from("procurement_items").update(upd).eq("id", it.id);
          out.refreshed++;
        }
      }
    }
  }

  // risk + event
  const risk = await refreshJobRisk(sb, jobId);
  const { count } = await sb
    .from("procurement_items")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("required", true);
  out.total = count || 0;
  out.riskUpdated = risk.updated;

  await emitEvent(jobId, "procurement.plan_generated", {
    actorId, source: "procurement_module",
    metadata: { mode, created: out.created, refreshed: out.refreshed, enriched: out.enriched, total: out.total },
  });

  return out;
}
