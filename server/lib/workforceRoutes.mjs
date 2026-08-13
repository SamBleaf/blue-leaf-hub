import crypto from "crypto";
import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth, requireRole } from "./requireAuth.mjs";
import { buildexactConfigured, createPurchaseOrder, completePurchaseOrder, buildexactCompleteOrdersEnabled, isPurchaseOrderComplete, createContact, getContacts, beList, beFetch } from "./buildexactClient.mjs";
import { getCostModel, loadedRate } from "./costModelService.mjs";
import { catalogueFor, budgetTaskCategory } from "./carpentrySubtaskDictionary.mjs";
import { pullBuildexactEstimate } from "./buildexactDeepIntegration.mjs";
import { normaliseAddress } from "./addressNormalise.mjs";
import { ok, err, rowToCamel, rowsToCamel, translateDbError } from "./apiResponse.mjs";
import { splitTranscriptToTasks } from "./voiceTasks.mjs";
import { buildPhotoPath, signSiteTaskPhotos, SITE_MEDIA_BUCKET, PHOTO_ENTITY_DIR, isUuid, isValidPhotoKey, isStoragePath } from "./siteMedia.mjs";
import { todayYmd, mondayOf, addDaysYmd } from "./dateYmd.mjs";
import { validateChargeUpSite } from "./chargeUpService.mjs";
import { attachAssigneesFromDb, assigneesForTask, setAssignees, visibleToWorker } from "./taskAssignments.mjs";
import { recordTaskDeletion } from "./taskAudit.mjs";
import { ensureCarpentryJobSwms } from "./whs/carpentrySwmsRoutes.mjs";
import { loadAndComposePack } from "./whs/carpentryWhsPackRoutes.mjs";

// BLB Charge Up category — an allocation to this carpentry job must name a site (address).
const CHARGE_UP_REFERENCE = "BL-CHARGEUP";
// PostgREST reports a missing table/column via a schema-cache error, not the raw PG code.
const chargeUpColMissing = (e) =>
  !!e && (e.code === "42703" || e.code === "42P01" || e.code === "PGRST204" || e.code === "PGRST205" ||
    /charge_up|could not find|schema cache|does not exist/i.test(e.message || ""));

// ── Task metadata ─────────────────────────────────────────────────────────────

const TASK_PHASE_MAP = {
  first_fix_framing:    "frame",
  cladding:             "lock_up",
  second_fix:           "fitout",
  outdoor_works:        "completion",
  formwork_slab_prep:   "site_slab",
  site_labouring:       "general",
  site_cleanup:         "general",
  supervision:          "general",
  other:                "general",
};

export const TASK_LABELS = {
  first_fix_framing:    "First fix / framing",
  cladding:             "Cladding",
  second_fix:           "Second fix",
  outdoor_works:        "Outdoor works",
  formwork_slab_prep:   "Formwork / slab prep",
  site_labouring:       "Site labouring",
  site_cleanup:         "Site cleanup",
  supervision:          "Supervision",
  other:                "Other",
};

const TASK_CATEGORIES = Object.keys(TASK_LABELS);

// Display label for a timesheet entry: the chosen sub-task (e.g. "Wall framing") when one was picked,
// else the main category. Lets the Approvals table show tasks inline without expanding each row.
function taskLabelForEntry(e) {
  // Prefer the sub-task the worker picked: canonical_key (mig 147) is the first-class attribution;
  // fall back to the legacy budget_line_item_id join, then the main category.
  const canon = e?.canonical_key || (e?.budget_line_item_id ? e?.carpentry_budget_line_items?.canonical_key : null);
  if (canon) {
    const opt = catalogueFor({ parentTaskCategory: e.task_category, costType: "labour" }).find((o) => o.key === canon);
    return opt?.label || e?.carpentry_budget_line_items?.description || canon;
  }
  // A budget-driven category (e.g. "aac_and_foam_supply_and_installation") has no built-in label —
  // humanise the slug so the Approvals table reads "Aac and foam supply and installation", not the raw key.
  const cat = e?.task_category;
  if (TASK_LABELS[cat]) return TASK_LABELS[cat];
  if (!cat) return "—";
  return cat.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
function attachTaskLabels(timesheets) {
  for (const ts of timesheets || []) for (const e of ts.timesheet_entries || []) e.taskLabel = taskLabelForEntry(e);
  return timesheets;
}

// ── Per-entry hours validation (deployment hardening) ─────────────────────────
// The client clamps hours to 0.5–24, but the server is the system of record and
// must enforce it independently. Rejects NaN/Infinity/null/undefined/non-numeric
// strings, zero, negatives, and any single entry above the per-entry ceiling.
// Returns an error message string if invalid, or null if every entry is valid.
const MAX_ENTRY_HOURS = 24;
function validateEntryHours(entries) {
  for (const e of entries) {
    // Reject raw values that are not a number or a cleanly-parsing numeric string.
    if (e == null || (typeof e.hours !== "number" && typeof e.hours !== "string")) {
      return "Each entry must have valid hours.";
    }
    if (typeof e.hours === "string" && e.hours.trim() === "") {
      return "Each entry must have valid hours.";
    }
    const h = Number(e.hours);
    if (!Number.isFinite(h) || h <= 0 || h > MAX_ENTRY_HOURS) {
      return `Each entry must have hours greater than 0 and no more than ${MAX_ENTRY_HOURS}.`;
    }
  }
  return null;
}

// ── Cost helpers ──────────────────────────────────────────────────────────────

// Split a day's hours into three pay bands:
//   regular   — up to overtime_threshold (paid at base rate)
//   overtime  — between overtime_threshold and double_time_threshold (overtime_multiplier)
//   doubletime — above double_time_threshold (double_time_multiplier)
// A missing/invalid threshold means that band simply never applies (treated as Infinity).
function splitOvertimeHours(totalHours, settings) {
  const hours = Number(totalHours) || 0;
  const otRaw = Number(settings?.overtime_threshold);
  const dtRaw = Number(settings?.double_time_threshold);
  const ot = Number.isFinite(otRaw) ? otRaw : Infinity;
  const dt = Number.isFinite(dtRaw) ? dtRaw : Infinity;

  const regular = Math.min(hours, ot);
  const overtime = hours > ot ? Math.min(hours, dt) - ot : 0;
  const doubletime = hours > dt ? hours - dt : 0;

  return {
    regular: Math.max(0, regular),
    overtime: Math.max(0, overtime),
    doubletime: Math.max(0, doubletime),
  };
}

function computeCost(bands, employee, rateOverride) {
  // P4: prefer the synced loaded rate (break-even = wage + on-costs + overhead) when available,
  // so Buildexact actuals reflect the real cost of labour, not the base pay rate.
  const rate = Number(rateOverride) || Number(employee?.hourly_rate) || 0;
  const otMult = Number(employee?.overtime_multiplier) || 1;
  const dtMult = Number(employee?.double_time_multiplier) || 1;
  const cost =
    bands.regular * rate +
    bands.overtime * rate * otMult +
    bands.doubletime * rate * dtMult;
  return Math.round(cost * 100) / 100;
}

// ── Monday of the current ISO week ───────────────────────────────────────────

// Monday of the week containing dateStr, in the business timezone (AU-local).
// Delegates to the shared, noon-anchored mondayOf() so the week boundary is not
// thrown off by the UTC date being a day behind during AEST mornings.
function weekStart(dateStr) {
  return mondayOf(dateStr || todayYmd());
}

// ── Buildexact sync ───────────────────────────────────────────────────────────

// Match a site address to a Buildexact job id — via the buildexact_job_sync mirror first
// (one row per BX job, small), then Hub jobs by normalised address. This is the "linked by
// job address" path used when a record has no direct buildexact_job_id stored.
async function resolveBuildexactJobIdByAddress(rawAddress, sb) {
  const addr = normaliseAddress(rawAddress || "");
  if (!addr.normalised) return null;
  const { data: mirrors } = await sb.from("buildexact_job_sync").select("buildexact_job_id, address").not("buildexact_job_id", "is", null);
  const m = (mirrors || []).find(r => normaliseAddress(r.address || "").normalised === addr.normalised);
  if (m?.buildexact_job_id) return m.buildexact_job_id;
  const { data: jrow } = await sb.from("jobs").select("buildexact_job_id").eq("address_normalised", addr.normalised).not("buildexact_job_id", "is", null).maybeSingle();
  return jrow?.buildexact_job_id || null;
}

// Resolve a timesheet's Buildexact job id. Carpentry jobs ARE Buildexact jobs (created from
// accepted BX quotes) — they carry buildexact_job_id directly (source of truth), falling back
// to an address match. Construction timesheets resolve job_id (or project_id → projects.job_id)
// → jobs.buildexact_job_id, then the buildexact_job_sync mirror, then address.
// Returns { buildexactJobId, error } — error is a plain-English reason when it can't resolve.
async function resolveBuildexactJobIdForTimesheet(timesheet, sb) {
  if (timesheet.carpentry_job_id) {
    const { data: cj } = await sb.from("carpentry_jobs").select("buildexact_job_id, address").eq("id", timesheet.carpentry_job_id).maybeSingle();
    if (cj?.buildexact_job_id) return { buildexactJobId: cj.buildexact_job_id, error: null };
    const byAddr = await resolveBuildexactJobIdByAddress(cj?.address, sb);
    if (byAddr) return { buildexactJobId: byAddr, error: null };
    return { buildexactJobId: null, error: "No Buildexact job for this carpentry job — set its Buildexact job ID or match the site address" };
  }

  let jobId = timesheet.job_id || null;
  if (!jobId && timesheet.project_id) {
    const { data: proj } = await sb.from("projects").select("job_id").eq("id", timesheet.project_id).maybeSingle();
    jobId = proj?.job_id || null;
  }
  if (!jobId) return { buildexactJobId: null, error: "No job linked to this timesheet (or its project)" };
  const { data: job } = await sb.from("jobs").select("buildexact_job_id, address").eq("id", jobId).maybeSingle();
  if (job?.buildexact_job_id) return { buildexactJobId: job.buildexact_job_id, error: null };
  const { data: mirror } = await sb.from("buildexact_job_sync").select("buildexact_job_id").eq("job_id", jobId).maybeSingle();
  if (mirror?.buildexact_job_id) return { buildexactJobId: mirror.buildexact_job_id, error: null };
  const byAddr = await resolveBuildexactJobIdByAddress(job?.address, sb);
  if (byAddr) return { buildexactJobId: byAddr, error: null };
  return { buildexactJobId: null, error: "Linked job has no Buildexact ID" };
}

// Resolve the worker's reusable "[Name] (HUB)" Buildexact contact — create ONCE, reuse forever
// (never a new contact per push, the way Deputy ended up duplicating). Returns the contactId, or
// null if creation isn't possible (the Work Order still works without it — the name is on the line).
export async function ensureBuildexactContact(emp, sb) {
  if (emp.buildexact_contact_id) return emp.buildexact_contact_id;
  const wantName = `${emp.name} (HUB)`;
  try {
    const existing = beList(await getContacts()).find(c => (c.name || "").trim().toLowerCase() === wantName.toLowerCase());
    let contactId = existing?.contactId || existing?.id || null;
    if (!contactId) {
      const created = await createContact({
        contactType: "Person",
        name: wantName,
        email: emp.email || undefined,
        mobile: emp.phone || undefined,
      });
      contactId = created?.contactId || created?.id || null;
    }
    if (contactId) {
      await sb.from("employees").update({ buildexact_contact_id: contactId, updated_at: new Date().toISOString() }).eq("id", emp.id);
    }
    return contactId;
  } catch (e) {
    console.warn("[workforce/buildexact-contact]", e?.message);
    return null;
  }
}

// The Buildexact "Actuals Category" (a Work-Order line's `parentTask`) for a labour line. For a
// carpentry job, use the per-job category mapped from the task (carpentry_job_budgets, mig 067);
// otherwise fall back to the task label.
export async function resolveCostCategory(timesheet, entry, sb) {
  if (timesheet.carpentry_job_id) {
    const { data: b } = await sb.from("carpentry_job_budgets")
      .select("category_name")
      .eq("job_id", timesheet.carpentry_job_id)
      .eq("cost_type", "labour")
      .eq("workforce_task_category", entry.task_category)
      .order("sort_order").limit(1).maybeSingle();
    if (b?.category_name) return b.category_name;
  }
  return TASK_LABELS[entry.task_category] || entry.task_category;
}

// Complete a Buildexact Work Order created from a timesheet. POST /jobs/purchaseorders/complete flips
// it to "Completed" and creates the actual-costing items from the lines. The order id is kept on the
// row in EVERY outcome so a retry completes (never re-creates) the same order.
async function completeWorkOrder(woId, timesheet, sb, opts = {}) {
  try {
    if (opts.precheck) {
      // Retry path: if Buildexact already shows this order completed, a prior completion succeeded
      // but its HTTP response was lost — mark done instead of re-completing (avoids double-booking).
      let jobId = null;
      try { ({ buildexactJobId: jobId } = await resolveBuildexactJobIdForTimesheet(timesheet, sb)); } catch { /* unknown */ }
      const already = await isPurchaseOrderComplete(jobId, woId);
      if (already === true) {
        await sb.from("timesheets").update({
          buildexact_work_order_id: woId,
          buildexact_completed_at: new Date().toISOString(),
          buildexact_sync_error: null,
        }).eq("id", timesheet.id);
        console.log("[workforce/buildexact-sync] WORK ORDER already completed in Buildexact — marked done", JSON.stringify({ id: woId, ts: timesheet.id }));
        return { synced: true, workOrderId: woId, completed: true, skipped: "already_completed" };
      }
      if (already === null) {
        // Can't confirm the order's status on a retry — re-completing could double-book. Stop and
        // flag for manual review rather than guess.
        await sb.from("timesheets").update({
          buildexact_work_order_id: woId,
          buildexact_completed_at: null,
          buildexact_needs_review: true,
          buildexact_sync_error: `Couldn't confirm Buildexact order ${woId} status on retry — verify it in Buildexact, then Force re-sync`,
        }).eq("id", timesheet.id);
        console.warn("[workforce/buildexact-sync] completion status indeterminate on retry — flagged for review", JSON.stringify({ id: woId, ts: timesheet.id }));
        return { synced: false, workOrderId: woId, completed: false, needsReview: true, error: "completion status indeterminate" };
      }
    }
    await completePurchaseOrder(woId);
    await sb.from("timesheets").update({
      buildexact_work_order_id: woId,
      buildexact_completed_at: new Date().toISOString(),
      buildexact_sync_error: null,
    }).eq("id", timesheet.id);
    console.log("[workforce/buildexact-sync] WORK ORDER completed", JSON.stringify({ id: woId, ts: timesheet.id }));
    return { synced: true, workOrderId: woId, completed: true };
  } catch (e) {
    await sb.from("timesheets").update({
      buildexact_work_order_id: woId,
      buildexact_completed_at: null,
      buildexact_sync_error: `Work Order created (id ${woId}) but completion failed: ${e?.message || "unknown"}`,
    }).eq("id", timesheet.id);
    console.warn("[workforce/buildexact-sync] WORK ORDER completion failed", JSON.stringify({ woId, error: e?.message }));
    return { synced: false, workOrderId: woId, completed: false, error: e?.message };
  }
}

// Push an approved timesheet to Buildexact as a WORK ORDER (orderType 'Work') — the mechanism
// Deputy used (proven live 2026-06-14): one Work Order per timesheet, a Labour line per entry,
// each line's `parentTask` set to the job's cost category (the "Actuals Category"), description
// "[Name] (HUB)". Returns { synced, error?, skipped?, workOrderId? } so callers can count.
export async function syncTimesheetToBuildexact(timesheet, sb, opts = {}) {
  if (!buildexactConfigured()) return { synced: false, skipped: true };
  // Terminal: needs manual intervention (orphaned/empty order, or edited after an order existed).
  if (timesheet.buildexact_needs_review && !opts.force) {
    return { synced: false, skipped: "needs_review", error: timesheet.buildexact_sync_error };
  }
  // Fully done: actuals booked. completed_at is authoritative ON ITS OWN — legacy rows backfilled by
  // migration 098 can have completed_at without a work_order_id, and must never be re-created.
  if (timesheet.buildexact_completed_at && !timesheet.buildexact_sync_error) {
    return { synced: true, skipped: "already_pushed" };
  }

  // Atomically claim the row so concurrent pushers (approval auto-feed, manual /sync, bulk
  // sync-pending) can never double-create or double-complete. A stale claim (>10 min) is reclaimable.
  // claimStamp is our unique lease token: on release we clear ONLY our own claim, so a slow worker
  // whose lease was reclaimed can't wipe the new holder's claim.
  const claimCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const claimStamp = new Date().toISOString();
  const { data: claimed } = await sb.from("timesheets")
    .update({ buildexact_sync_claimed_at: claimStamp })
    .eq("id", timesheet.id)
    .or(`buildexact_sync_claimed_at.is.null,buildexact_sync_claimed_at.lt.${claimCutoff}`)
    .select("id, status, buildexact_work_order_id, buildexact_completed_at, buildexact_sync_error, buildexact_needs_review");
  if (!claimed || claimed.length === 0) return { synced: false, skipped: "sync_in_progress" };
  let row = claimed[0];

  try {
    // Forced redo of a needs-review row (operator has cleaned up the order in Buildexact): drop the
    // stale order id so a fresh, correct one is created.
    if (opts.force && row.buildexact_needs_review) {
      await sb.from("timesheets").update({
        buildexact_needs_review: false,
        buildexact_work_order_id: null,
        buildexact_completed_at: null,
        buildexact_synced_at: null,
        buildexact_sync_error: null,
      }).eq("id", timesheet.id);
      row = { ...row, buildexact_needs_review: false, buildexact_work_order_id: null, buildexact_completed_at: null };
    }
    // Re-check authoritative state now that we hold the claim (closes the read->claim window).
    if (row.buildexact_needs_review) return { synced: false, skipped: "needs_review", error: row.buildexact_sync_error };
    if (row.buildexact_completed_at && !row.buildexact_sync_error) {
      return { synced: true, skipped: "already_pushed" };
    }
    // Only push APPROVED timesheets — a forced re-sync of an unapproved row would book $0 actuals
    // (unapprove nulls each entry's cost_amount). Use the fresh DB status, not the possibly-stale
    // in-memory one the approval auto-feed passes.
    if (row.status !== "approved") return { synced: false, skipped: "not_approved" };
    // Order already created but not completed -> retry completion only (never re-create), with a
    // pre-check so a lost completion response doesn't double-book.
    if (row.buildexact_work_order_id) {
      if (!buildexactCompleteOrdersEnabled()) return { synced: true, skipped: "complete_disabled", workOrderId: row.buildexact_work_order_id };
      return await completeWorkOrder(row.buildexact_work_order_id, timesheet, sb, { precheck: true });
    }

    // ── Create a new Work Order ──────────────────────────────────────────────
    const { data: emp } = await sb.from("employees").select("*").eq("id", timesheet.employee_id).single();
    if (!emp) {
      await sb.from("timesheets").update({ buildexact_sync_error: "Employee record not found" }).eq("id", timesheet.id);
      return { synced: false, error: "Employee record not found" };
    }
    const { buildexactJobId, error: resolveErr } = await resolveBuildexactJobIdForTimesheet(timesheet, sb);
    if (!buildexactJobId) {
      await sb.from("timesheets").update({ buildexact_sync_error: resolveErr }).eq("id", timesheet.id);
      return { synced: false, error: resolveErr };
    }
    const { data: entries } = await sb.from("timesheet_entries").select("*").eq("timesheet_id", timesheet.id);
    if (!entries?.length) return { synced: false, skipped: "no_entries" };

    const contactId = await ensureBuildexactContact(emp, sb);

    const items = [];
    for (const entry of entries) {
      const parentTask = await resolveCostCategory(timesheet, entry, sb);
      const hrs = Number(entry.hours) || 0;
      const lineTotal = Number(entry.cost_amount ?? 0);
      // unitCost = the effective per-hour cost for THIS entry, derived from the booked cost_amount
      // (the loaded break-even rate, already including any OT/double-time premiums). This keeps the
      // BX line internally consistent (unitCost × quantity ≈ totalCost) and decouples it from the
      // editable employees.hourly_rate column. totalCost remains the authoritative booked actual.
      const unitCost = hrs > 0 ? Math.round((lineTotal / hrs) * 10000) / 10000 : (Number(emp.hourly_rate) || 0);
      items.push({
        costItemType: "Labour",
        description: `${emp.name} (HUB)`,
        quantity: hrs,
        unitCost,
        totalCost: lineTotal,
        uom: "hr",
        parentTask: parentTask || undefined,
        notes: "Imported from Blue Leaf Hub",
      });
    }

    try {
      const order = await createPurchaseOrder({
        jobId: buildexactJobId,
        orderType: "Work",
        // Apply GST (10%) like Deputy's native sync. Tax is an ORDER-level flag in Buildexact
        // (isTaxFree) — NOT a line-item field. New API-created orders default to isTaxFree:true
        // (GST-free); Deputy stamps isTaxFree:false so the Actual Cost matches the historical
        // labour orders. The ex-GST cost (what drives margin) is identical either way.
        isTaxFree: false,
        ...(contactId ? { contactId } : {}),
        description: `Blue Leaf Hub labour — ${emp.name} — ${timesheet.date}`,
        items,
      });
      const woId = order?.purchaseOrderId || order?.id || null;
      // A successful create with no resolvable id means an order exists in Buildexact we can't
      // reference — STOP (don't complete; don't let a retry re-create a duplicate). Manual review.
      if (!woId) {
        await sb.from("timesheets").update({
          buildexact_needs_review: true,
          buildexact_sync_error: "Buildexact created the Work Order but returned no id — reconcile manually in Buildexact, then Force re-sync",
        }).eq("id", timesheet.id);
        console.warn("[workforce/buildexact-sync] WORK ORDER created with NO id", JSON.stringify({ job: buildexactJobId }));
        return { synced: false, error: "Work Order created but Buildexact returned no id", needsReview: true };
      }
      // Persist the id immediately so a retry never re-creates it, even if a later step fails.
      await sb.from("timesheets").update({ buildexact_work_order_id: woId, buildexact_synced_at: new Date().toISOString() }).eq("id", timesheet.id);
      // Verify the line items actually landed. Buildexact has been seen to create the order header
      // but drop the lines — and a Work Order with 0 items can't be marked Completed. Flag for
      // manual cleanup (delete the empty order, then Force re-sync) rather than looping on it.
      let landed = items.length;
      try { const back = await beFetch(`/jobs/purchaseorders/${woId}/items`); landed = (Array.isArray(back) ? back : (back.items || [])).length; }
      catch { /* keep the sent count */ }
      if (items.length > 0 && landed === 0) {
        await sb.from("timesheets").update({
          buildexact_needs_review: true,
          buildexact_sync_error: "Work Order created but its line items didn't land in Buildexact — delete the empty order in Buildexact, then Force re-sync",
        }).eq("id", timesheet.id);
        console.warn("[workforce/buildexact-sync] WORK ORDER has NO line items", JSON.stringify({ id: woId, sentLines: items.length }));
        return { synced: false, error: "Work Order line items didn't land in Buildexact", workOrderId: woId, needsReview: true };
      }
      console.log("[workforce/buildexact-sync] WORK ORDER created", JSON.stringify({ orderNumber: order?.orderNumber, id: woId, job: buildexactJobId, lines: landed }));
      if (!buildexactCompleteOrdersEnabled()) {
        return { synced: true, workOrderId: woId, completed: false, skipped: "complete_disabled" };
      }
      // Complete -> status "Completed" + actual-costing items created from the line items.
      return await completeWorkOrder(woId, timesheet, sb);
    } catch (e) {
      console.warn("[workforce/buildexact-sync] WORK ORDER failed", JSON.stringify({ job: buildexactJobId, error: e?.message }));
      await sb.from("timesheets").update({ buildexact_sync_error: e?.message || "Work Order create failed" }).eq("id", timesheet.id);
      return { synced: false, error: e?.message };
    }
  } finally {
    // Release ONLY our own lease (match claimStamp) so we never clear a claim another worker
    // acquired after ours went stale.
    await sb.from("timesheets").update({ buildexact_sync_claimed_at: null })
      .eq("id", timesheet.id).eq("buildexact_sync_claimed_at", claimStamp);
  }
}

// ── Labour budget update (fire-and-forget) ────────────────────────────────────

async function updateJobLabourBudget(jobId, sb) {
  if (!jobId) return;
  try {
    const { data: entries } = await sb
      .from("timesheet_entries")
      .select("task_category, cost_amount, timesheets!inner(job_id, status)")
      .eq("timesheets.job_id", jobId)
      .eq("timesheets.status", "approved");
    if (!entries?.length) return;
    // BX05 — INTENTIONAL no-op write. The Financial Command Centre already derives labour
    // budget-vs-actual by reading approved timesheets live and resolving task_category →
    // trade_category (financeCCRoutes.mjs). Persisting these totals into job_budgets here
    // would DOUBLE-COUNT labour against that live read. Kept as an observability log only —
    // do not "complete" this into a job_budgets upsert without first removing the live read.
    const grouped = {};
    for (const e of entries) {
      const cat = e.task_category;
      grouped[cat] = (grouped[cat] || 0) + Number(e.cost_amount || 0);
    }
    console.log("[workforce/labour-budget]", jobId, grouped);
  } catch (err) {
    console.warn("[workforce/labour-budget] update failed:", err?.message);
  }
}

// ── Approve a single timesheet (shared logic) ─────────────────────────────────

async function approveSingleTimesheet(timesheetId, callerId, sb) {
  const { data: ts, error: tsErr } = await sb
    .from("timesheets")
    .select("*, employees(*)")
    .eq("id", timesheetId)
    .single();
  if (tsErr || !ts) throw new Error("Timesheet not found");

  // Idempotency guard: an already-approved timesheet is never re-approved. We do not
  // recompute cost, do not re-stamp approved_by/approved_at, and do not re-trigger
  // Buildexact sync. Re-approval is only possible after an explicit unapprove resets
  // status back to "submitted".
  if (ts.status === "approved") {
    return { alreadyApproved: true };
  }

  const { data: entries } = await sb.from("timesheet_entries").select("*").eq("timesheet_id", timesheetId);
  const { data: settings } = await sb.from("workforce_settings").select("*").limit(1).single();
  const cm = await getCostModel(sb); // P4: loaded break-even rate (null until mig 090 + sync)

  // Compute cost for each entry
  for (const entry of entries || []) {
    const bands = splitOvertimeHours(Number(entry.hours), settings || { overtime_threshold: 8, double_time_threshold: 10 });
    const cost = computeCost(bands, ts.employees, loadedRate(cm, ts.employee_id));
    // overtime_hours stores all premium hours (overtime + double-time) — preserves the
    // column's original meaning (hours paid above the base rate).
    await sb.from("timesheet_entries")
      .update({ cost_amount: cost, overtime_hours: bands.overtime + bands.doubletime })
      .eq("id", entry.id);
  }

  await sb.from("timesheets").update({
    status: "approved",
    approved_by: callerId,
    approved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", timesheetId);

  // Auto-feed pushes to Buildexact on approval; manual-feed waits for an explicit
  // "Sync to Buildexact" action (workforce_settings.buildexact_sync_mode).
  if ((settings?.buildexact_sync_mode || "auto") === "auto") {
    syncTimesheetToBuildexact(ts, sb).catch(e => console.error("[workforce/sync]", e?.message));
  }
  updateJobLabourBudget(ts.job_id, sb).catch(e => console.error("[workforce/labour-budget]", e?.message));
  return { alreadyApproved: false };
}

// ── Workforce allocations (W16-A1) ────────────────────────────────────────────

const ALLOCATION_SELECT = `
  *,
  employees(id, name),
  projects(id, address),
  carpentry_jobs(id, address, client_name),
  workforce_crews(id, name)
`;

function formatAllocation(row) {
  if (!row) return null;
  const base = rowToCamel(row);
  return {
    id: base.id,
    allocationDate: base.allocationDate,
    employeeId: base.employeeId,
    crewId: base.crewId,
    projectId: base.projectId,
    carpentryJobId: base.carpentryJobId,
    notes: base.notes,
    createdBy: base.createdBy,
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
    employeeName: row.employees?.name ?? null,
    projectAddress: row.projects?.address ?? null,
    carpentryJobAddress: row.carpentry_jobs?.address ?? null,
    carpentryJobClientName: row.carpentry_jobs?.client_name ?? null,
    crewName: row.workforce_crews?.name ?? null,
    // BLB Charge Up: which site this shift is on (label + address the crew sees).
    // Present only when the allocation is tagged to a charge_up_jobs row (mig 146).
    chargeUpJobId: base.chargeUpJobId ?? null,
    chargeUpSiteLabel: null,
    chargeUpSiteAddress: null,
  };
}

// Is this carpentry job the BLB Charge Up category? (cheap, cached per call site).
async function isChargeUpJob(sb, carpentryJobId) {
  if (!carpentryJobId) return false;
  const { data } = await sb.from("carpentry_jobs").select("reference").eq("id", carpentryJobId).maybeSingle();
  return data?.reference === CHARGE_UP_REFERENCE;
}

// Validate + resolve the site to store on a charge-up allocation. Fails soft (allows
// untagged) before mig 145/146 is applied so the Planner never breaks. Delegates the
// required/belongs-to rule to the pure validateChargeUpSite so there's no rule in the route.
async function resolveAllocChargeUpSite(sb, carpentryJobId, chargeUpJobId) {
  if (!(await isChargeUpJob(sb, carpentryJobId))) return { chargeUpJobId: null };
  const { data: sites, error } = await sb.from("charge_up_jobs")
    .select("id").eq("carpentry_job_id", carpentryJobId).eq("status", "active");
  if (error) return chargeUpColMissing(error) ? { chargeUpJobId: null } : { error: translateDbError(error) };
  return validateChargeUpSite({ isChargeUpJob: true, activeSiteIds: (sites || []).map((s) => s.id), chargeUpJobId });
}

// Attach each allocation's charge-up site label/address in one query (guarded — a missing
// table/column pre-migration just leaves the labels null; ids still flow through).
async function attachChargeUpSites(sb, allocations) {
  const ids = [...new Set(allocations.map((a) => a.chargeUpJobId).filter(Boolean))];
  if (!ids.length) return allocations;
  const { data, error } = await sb.from("charge_up_jobs").select("id, site_label, address").in("id", ids);
  if (error) return allocations; // pre-mig or transient — labels stay null, non-fatal
  const byId = new Map((data || []).map((s) => [s.id, s]));
  for (const a of allocations) {
    if (!a.chargeUpJobId) continue;
    const s = byId.get(a.chargeUpJobId);
    a.chargeUpSiteLabel = s?.site_label ?? "(deleted site)";
    a.chargeUpSiteAddress = s?.address ?? null;
  }
  return allocations;
}

// Planner palette keys, in the same order as src/lib/plannerColors.js PLANNER_PALETTE.
const PLANNER_COLOR_KEYS = ["blue", "teal", "amber", "purple", "coral", "pink", "green", "red", "slate", "indigo"];
function plannerAutoColorKey(key, orderedKeys) {
  const i = orderedKeys.indexOf(key);
  let idx = i;
  if (i < 0) { let h = 0; const s = String(key); for (let c = 0; c < s.length; c++) h = (h * 31 + s.charCodeAt(c)) | 0; idx = Math.abs(h); }
  return PLANNER_COLOR_KEYS[idx % PLANNER_COLOR_KEYS.length];
}
// Attach each allocation's Planner colourKey so the worker's shift widget matches the Workforce
// Planner exactly. Mirrors WorkforcePlannerTab: a saved colour wins, else auto-colour by the
// job's position in the *board* — i.e. the active jobs (projects, then carpentry by created_at
// DESC) filtered to those on-board or allocated in the CURRENT week. Resolved server-side because
// workers can't call the admin planner-jobs endpoint.
async function attachAllocationColors(sb, allocations) {
  if (!allocations.length) return allocations;
  const weekFrom = mondayOf(todayYmd());
  const weekTo = addDaysYmd(weekFrom, 6);
  const [{ data: pj }, { data: wk }, { data: projs }, { data: carps }] = await Promise.all([
    sb.from("workforce_planner_jobs").select("project_id, carpentry_job_id, color, on_board"),
    sb.from("workforce_allocations").select("project_id, carpentry_job_id").gte("allocation_date", weekFrom).lte("allocation_date", weekTo),
    sb.from("projects").select("id, created_at").order("created_at", { ascending: true }),
    sb.from("carpentry_jobs").select("id").order("created_at", { ascending: false }),
  ]);
  const savedMap = {}; const onBoard = new Set(); const allocKeys = new Set();
  for (const r of pj || []) { const k = r.project_id ? `project:${r.project_id}` : `carpentry:${r.carpentry_job_id}`; if (r.color) savedMap[k] = r.color; if (r.on_board) onBoard.add(k); }
  for (const a of wk || []) allocKeys.add(a.project_id ? `project:${a.project_id}` : `carpentry:${a.carpentry_job_id}`);
  const universe = [...(projs || []).map((p) => `project:${p.id}`), ...(carps || []).map((c) => `carpentry:${c.id}`)];
  const orderedKeys = universe.filter((k) => onBoard.has(k) || allocKeys.has(k));
  for (const a of allocations) {
    const key = a.projectId ? `project:${a.projectId}` : a.carpentryJobId ? `carpentry:${a.carpentryJobId}` : null;
    a.colorKey = key ? (savedMap[key] || plannerAutoColorKey(key, orderedKeys)) : "slate";
  }
  return allocations;
}

function parseJobSpine(body) {
  const projectId = body.projectId ?? body.project_id ?? null;
  const carpentryJobId = body.carpentryJobId ?? body.carpentry_job_id ?? null;
  const hasProject = !!projectId;
  const hasCarpentry = !!carpentryJobId;
  if (hasProject === hasCarpentry) {
    return { error: "Set exactly one of projectId or carpentryJobId" };
  }
  return { projectId: hasProject ? projectId : null, carpentryJobId: hasCarpentry ? carpentryJobId : null };
}

async function fetchAllocationById(sb, id) {
  const { data, error } = await sb.from("workforce_allocations").select(ALLOCATION_SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function syncCrewMembers(sb, crewId, memberIds) {
  if (!Array.isArray(memberIds)) return;
  const ids = [...new Set(memberIds.filter(id => isUuid(id)))];
  await sb.from("workforce_crew_members").delete().eq("crew_id", crewId);
  if (!ids.length) return;
  const rows = ids.map((employeeId, i) => ({
    crew_id: crewId,
    employee_id: employeeId,
    sort_order: i,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await sb.from("workforce_crew_members").insert(rows);
  if (error) throw new Error(error.message);
}

// ── Route registration ────────────────────────────────────────────────────────

export function registerWorkforceRoutes(app) {
  // ── Settings ──────────────────────────────────────────────────────────────

  app.get("/api/workforce/settings", requireAuth, async (_req, res) => {
    const sb = getServiceSupabase();
    let { data } = await sb.from("workforce_settings").select("*").limit(1).single();
    if (!data) {
      await sb.from("workforce_settings").insert({});
      ({ data } = await sb.from("workforce_settings").select("*").limit(1).single());
    }
    res.json({ ok: true, settings: data });
  });

  app.put("/api/workforce/settings", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const { data: existing } = await sb.from("workforce_settings").select("id").limit(1).single();
    if (!existing) return res.status(404).json({ ok: false, error: "Settings not found" });
    const allowed = [
      "standard_hours", "standard_break_minutes", "standard_start_time",
      "overtime_threshold", "double_time_threshold", "working_days",
      "cost_code_first_fix_framing", "cost_code_cladding", "cost_code_second_fix",
      "cost_code_outdoor_works", "cost_code_formwork_slab_prep", "cost_code_site_labouring",
      "cost_code_site_cleanup", "cost_code_supervision", "cost_code_other",
      "buildexact_sync_mode",
    ];
    const update = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) update[k] = req.body[k];
    }
    update.updated_at = new Date().toISOString();
    const { data, error } = await sb.from("workforce_settings").update(update).eq("id", existing.id).select().single();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, settings: data });
  });

  // ── Employees ─────────────────────────────────────────────────────────────

  app.get("/api/workforce/employees", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const isDirector = ["admin"].includes(req.caller.role);
    const includeInactive = req.query.include_inactive === "true";
    // worker_token is selected only to derive a has_worker_link flag — it is stripped before the
    // response so the secret is never exposed (lets the Team Directory show who still needs a link).
    const baseCols = "id, user_id, name, trade, employment_type, is_leading_hand, is_active, email, phone, staff_code, buildexact_employee_id, buildexact_contact_id, invite_sent_at, created_at, worker_token" + (isDirector ? ", hourly_rate, overtime_multiplier, double_time_multiplier" : "");
    const run = (cols, orderCol) => {
      let q = sb.from("employees").select(cols);
      if (!includeInactive) q = q.eq("is_active", true);
      return q.order(orderCol, { ascending: true, nullsFirst: false });
    };
    let { data, error } = await run(baseCols + ", employee_number", "employee_number");
    // Degrade gracefully if migration 093 isn't applied yet (column missing).
    if (error && /employee_number/i.test(error.message || "")) {
      ({ data, error } = await run(baseCols, "name"));
    }
    if (error) return res.status(500).json({ ok: false, error: error.message });
    const employees = (data || []).map(({ worker_token, ...e }) => ({ ...e, has_worker_link: !!worker_token }));
    res.json({ ok: true, employees });
  });

  // Weekly timesheet completion snapshot (admin/supervisor): for each active
  // employee × each working day of the week, did they submit/approve a timesheet?
  // Lets the office see at a glance who still owes hours. AU-local week math.
  app.get("/api/workforce/completion-snapshot", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const week_start = mondayOf(req.query.weekStart || todayYmd());
    const week_end = addDaysYmd(week_start, 6);

    const { data: settings } = await sb.from("workforce_settings").select("working_days").limit(1).maybeSingle();
    const workingDayNames = (settings?.working_days?.length ? settings.working_days : ["Mon", "Tue", "Wed", "Thu", "Fri"]);
    const DOW_NAME = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    // Working-day dates within this week (noon-anchored to avoid TZ drift).
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = addDaysYmd(week_start, i);
      const dow = new Date(`${d}T12:00:00`).getDay();
      if (workingDayNames.includes(DOW_NAME[dow])) dates.push(d);
    }

    const { data: emps, error: empErr } = await sb.from("employees")
      .select("id, name, employment_type, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (empErr) return res.status(500).json({ ok: false, error: empErr.message });

    // Pull the job + entry breakdown too, so the hover tooltip can show which job and which sub-tasks
    // (e.g. J1171 · Wall framing) a day's hours were logged against.
    const { data: ts } = await sb.from("timesheets")
      .select("id, employee_id, date, status, carpentry_jobs(reference, address, client_name), projects(address), timesheet_entries(hours, task_category, canonical_key, budget_line_item_id, carpentry_budget_line_items(canonical_key, description))")
      .gte("date", week_start).lte("date", week_end);
    const statusByKey = {};
    const idByKey = {};
    const hoursByKey = {};   // W17-P2: hours per employee/day = sum of that day's timesheet_entries.hours
    const jobByKey = {};     // employee|date -> job label (carpentry reference/address, else project address)
    const tasksByKey = {};   // employee|date -> [distinct sub-task / category labels]
    for (const t of ts || []) {
      const k = `${t.employee_id}|${t.date}`;
      statusByKey[k] = t.status;
      idByKey[k] = t.id;
      const cj = t.carpentry_jobs;
      jobByKey[k] = cj ? (cj.reference || cj.address || cj.client_name || null) : (t.projects?.address || null);
      let h = 0;
      const labels = [];
      for (const en of t.timesheet_entries || []) {
        h += Number(en.hours || 0);
        const label = taskLabelForEntry(en);
        if (label && label !== "—" && !labels.includes(label)) labels.push(label);
      }
      hoursByKey[k] = h;
      tasksByKey[k] = labels;
    }

    const DONE = ["submitted", "approved"];
    const employees = (emps || []).map((e) => {
      // Only full-time staff are expected to log every working day. Casual/part-time
      // would otherwise show as "missing" on days they never work → false positives
      // that drown the real signal. They still appear (informational), missing = 0.
      const expectsAllDays = e.employment_type === "full_time";
      const days = {};
      let done = 0, missing = 0;
      for (const d of dates) {
        const k = `${e.id}|${d}`;
        const st = statusByKey[k] || null;                       // raw timesheets.status or null
        const hours = Math.round((hoursByKey[k] || 0) * 100) / 100;
        // W17-P2: per-day value is { state, status, hours }. state splits the old "done" into
        // approved/submitted via the raw status; "draft"/other non-final statuses fall into the
        // missing bucket (raw value preserved in status) so the missing COUNT is unchanged.
        let state;
        if (st && DONE.includes(st)) { state = st; done++; }     // "approved" | "submitted"
        else if (st === "rejected") { state = "rejected"; if (expectsAllDays) missing++; }
        else if (st) { state = "missing"; if (expectsAllDays) missing++; }
        else { state = expectsAllDays ? "missing" : "na"; if (expectsAllDays) missing++; }
        days[d] = { state, status: st, hours, id: idByKey[k] || null, job: jobByKey[k] || null, tasks: tasksByKey[k] || [] };
      }
      return { id: e.id, name: e.name, employment_type: e.employment_type, expects_all_days: expectsAllDays, days, done, missing };
    });

    res.json({ ok: true, week_start, week_end, dates, employees });
  });

  app.post("/api/workforce/employees", requireAuth, requireRole("admin"), async (req, res) => {
    const sb = getServiceSupabase();
    const { name, trade, employment_type, hourly_rate, overtime_multiplier, double_time_multiplier, is_leading_hand, buildexact_employee_id, email, phone, staff_code } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: "name is required" });
    // Auto-assign the next sequential employee number (MAX+1).
    const { data: maxRow } = await sb.from("employees").select("employee_number").order("employee_number", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    const nextNumber = (maxRow?.employee_number || 0) + 1;
    const { data, error } = await sb.from("employees").insert({
      name, employee_number: nextNumber, trade: trade || "carpenter",
      employment_type: employment_type || "full_time",
      hourly_rate: hourly_rate || 0,
      overtime_multiplier: overtime_multiplier || 1.5,
      double_time_multiplier: double_time_multiplier || 2.0,
      is_leading_hand: !!is_leading_hand,
      buildexact_employee_id: buildexact_employee_id || null,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      staff_code: staff_code?.trim() || null,
    }).select().single();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, employee: data });
  });

  app.put("/api/workforce/employees/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const sb = getServiceSupabase();
    const allowed = ["name", "trade", "employment_type", "hourly_rate", "overtime_multiplier", "double_time_multiplier", "is_leading_hand", "buildexact_employee_id", "buildexact_contact_id", "email", "phone", "staff_code"];
    const update = { updated_at: new Date().toISOString() };
    for (const k of allowed) {
      if (req.body[k] !== undefined) update[k] = req.body[k];
    }
    const { data, error } = await sb.from("employees").update(update).eq("id", req.params.id).select().single();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, employee: data });
  });

  app.delete("/api/workforce/employees/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const sb = getServiceSupabase();
    const { error } = await sb.from("employees").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", req.params.id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true });
  });

  // (removed) POST /api/workforce/employees/:id/invite — dead endpoint: it used a non-existent
  // 'worker' role and never inserted a user_profiles row, so the invitee could never pass auth.
  // App-login invites now go through POST /api/auth/invite with { employeeId } (authRoutes.mjs +
  // WorkforceTeam.jsx), which creates the profile AND the canonical employee<->login link (mig 100).

  app.get("/api/workforce/employees/:id/preview", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const today = todayYmd();
    const [empRes, tsRes] = await Promise.all([
      sb.from("employees").select("id, name, trade, employment_type, is_leading_hand, is_active").eq("id", req.params.id).single(),
      sb.from("timesheets").select("*, timesheet_entries(*)").eq("employee_id", req.params.id).eq("date", today).maybeSingle(),
    ]);
    if (!empRes.data) return res.status(404).json({ ok: false, error: "Employee not found" });
    res.json({ ok: true, employee: empRes.data, today_timesheet: tsRes.data || null });
  });

  // ── Timesheets ────────────────────────────────────────────────────────────

  app.get("/api/workforce/timesheets/pending", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    // Only admins (directors) may see pay rates — mirror the sibling /timesheets endpoint so a
    // supervisor opening Approvals doesn't receive every worker's hourly_rate/multipliers.
    const isDirector = req.caller.role === "admin";
    const { data, error } = await sb
      .from("timesheets")
      .select("*, employees(id, name, trade" + (isDirector ? ", hourly_rate, overtime_multiplier" : "") + "), projects(id, address), carpentry_jobs(id, reference, client_name, address), timesheet_entries(*, carpentry_budget_line_items(canonical_key, description))")
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, timesheets: attachTaskLabels(data) });
  });

  app.get("/api/workforce/timesheets", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const isDirector = req.caller.role === "admin";
    const { status, employee_id, project_id, date_from, date_to } = req.query;
    let q = sb.from("timesheets")
      .select("*, employees(id, name, trade" + (isDirector ? ", hourly_rate, overtime_multiplier" : "") + "), projects(id, address), carpentry_jobs(id, reference, client_name, address), timesheet_entries(*)")
      .order("date", { ascending: false });
    if (status) q = q.eq("status", status);
    if (employee_id) q = q.eq("employee_id", employee_id);
    if (project_id) q = q.eq("project_id", project_id);
    if (date_from) q = q.gte("date", date_from);
    if (date_to) q = q.lte("date", date_to);
    const { data, error } = await q;
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, timesheets: data });
  });

  // Full detail for one timesheet — powers the Snapshot + Approvals "banner" modal.
  // Returns the timesheet with its entries (completion photos signed) + the tasks the employee
  // marked done on that shift. Snake_case, mirroring the sibling /pending + /timesheets endpoints.
  app.get("/api/workforce/timesheets/:id/detail", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!isUuid(req.params.id)) return err(res, 400, "Invalid timesheet id.");
    const isDirector = req.caller.role === "admin";
    const { data: ts, error } = await sb
      .from("timesheets")
      .select("*, employees(id, name, trade" + (isDirector ? ", hourly_rate, overtime_multiplier" : "") + "), projects(id, address), carpentry_jobs(id, reference, client_name, address), timesheet_entries(*, carpentry_budget_line_items(canonical_key, description))")
      .eq("id", req.params.id)
      .maybeSingle();
    if (error) return err(res, 500, translateDbError(error));
    if (!ts) return err(res, 404, "Timesheet not found.", "NOT_FOUND");
    // Attach the sub-task label to each entry (same as the Approvals list) so the modal can show
    // the sub-section the worker logged against, not just the main category.
    attachTaskLabels([ts]);

    // Sign entry completion photos that are storage paths (legacy inline data: URLs pass through).
    for (const en of ts.timesheet_entries || []) {
      if (en && isStoragePath(en.completion_photo_url)) {
        try {
          const { data: s } = await sb.storage.from(SITE_MEDIA_BUCKET).createSignedUrl(en.completion_photo_url, 3600);
          if (s?.signedUrl) en.completion_photo_signed_url = s.signedUrl;
        } catch { /* best-effort */ }
      }
    }

    // Tasks completed on this shift. completed_at is UTC; match it to the timesheet's LOCAL
    // (Adelaide) calendar date so a morning task (stored on the previous UTC day) still counts —
    // fetch a ±1-day window, then filter by Adelaide-local date. Bonus data: never fail on it.
    let tasksCompleted = [];
    try {
      const { data: cand } = await sb
        .from("site_tasks")
        .select("id, title, category, completed_at, completion_photo_url")
        .eq("completed_by", ts.employee_id)
        .eq("status", "done")
        .gte("completed_at", `${addDaysYmd(ts.date, -1)}T00:00:00`)
        .lte("completed_at", `${addDaysYmd(ts.date, 1)}T23:59:59.999`)
        .order("completed_at", { ascending: true });
      tasksCompleted = (cand || []).filter((t) =>
        t.completed_at &&
        new Date(t.completed_at).toLocaleDateString("en-CA", { timeZone: "Australia/Adelaide" }) === ts.date
      );
      for (const t of tasksCompleted) {
        if (isStoragePath(t.completion_photo_url)) {
          try {
            const { data: s } = await sb.storage.from(SITE_MEDIA_BUCKET).createSignedUrl(t.completion_photo_url, 3600);
            if (s?.signedUrl) t.completion_photo_signed_url = s.signedUrl;
          } catch { /* best-effort */ }
        }
      }
    } catch { /* tasks-that-shift is a bonus — never fail the detail on it */ }

    return res.json({ ok: true, timesheet: ts, tasksCompleted });
  });

  app.post("/api/workforce/timesheets/mass-fill", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const { date, project_id, job_id, carpentry_job_id, charge_up_job_id, entries } = req.body;
    if (!date || !Array.isArray(entries) || !entries.length) {
      return res.status(400).json({ ok: false, error: "date and entries[] are required" });
    }
    // BLB Charge Up: if the carpentry job HAS active charge-up sites, a location is required for the
    // whole batch and must belong to this job. Mirrors POST /api/worker/timesheets. Fail-soft: before
    // mig 145 (no charge_up_jobs table) the probe errors and we log untagged, as before.
    let chargeUpJobId = null;
    if (carpentry_job_id) {
      const { data: siteRows, error: siteErr } = await sb.from("charge_up_jobs")
        .select("id").eq("carpentry_job_id", carpentry_job_id).eq("status", "active");
      if (!siteErr && (siteRows || []).length) {
        if (charge_up_job_id && siteRows.some((s) => s.id === charge_up_job_id)) chargeUpJobId = charge_up_job_id;
        if (!chargeUpJobId) return res.status(400).json({ ok: false, error: "Pick a location before submitting charge-up work." });
      }
    }
    const results = [];
    for (const e of entries) {
      try {
        const { employee_id, task_category, hours, notes } = e;
        // Per-row date wins (so one submit can cover a whole week); falls back to the batch date.
        const rowDate = e.date || date;
        if (!employee_id || !task_category || !hours || !rowDate) {
          results.push({ employee_id, ok: false, error: "Missing fields" });
          continue;
        }
        // Upsert timesheet for this employee+date
        let { data: ts } = await sb.from("timesheets").select("id").eq("employee_id", employee_id).eq("date", rowDate).maybeSingle();
        if (!ts) {
          const ins = await sb.from("timesheets").insert({
            employee_id, date: rowDate,
            project_id: project_id || null,
            job_id: job_id || null,
            carpentry_job_id: carpentry_job_id || null,
            status: "submitted",
            submitted_at: new Date().toISOString(),
          }).select("id").single();
          ts = ins.data;
        }
        if (!ts?.id) { results.push({ employee_id, ok: false, error: "Could not create timesheet" }); continue; }

        const entryRow = {
          timesheet_id: ts.id,
          employee_id,
          task_category,
          phase: TASK_PHASE_MAP[task_category] || "general",
          hours: Number(hours),
          overtime_hours: 0,
          notes: notes || null,
        };
        // Only reference the charge-up site column when a site was picked — chargeUpJobId is only
        // non-null when mig 145 is applied + active sites exist, so this never hits a missing column.
        if (chargeUpJobId) entryRow.charge_up_job_id = chargeUpJobId;
        const { error: entryErr } = await sb.from("timesheet_entries").insert(entryRow);
        results.push({ employee_id, date: rowDate, timesheet_id: ts.id, ok: !entryErr, error: entryErr?.message });
      } catch (err) {
        results.push({ employee_id: e.employee_id, ok: false, error: err?.message });
      }
    }
    res.json({ ok: true, results });
  });

  app.post("/api/workforce/timesheets/mass-approve", requireAuth, requireRole("admin"), async (req, res) => {
    const sb = getServiceSupabase();
    const { timesheet_ids } = req.body;
    if (!Array.isArray(timesheet_ids) || !timesheet_ids.length) {
      return res.status(400).json({ ok: false, error: "timesheet_ids[] required" });
    }
    const results = [];
    let approvedCount = 0;
    let alreadyApprovedCount = 0;
    for (const id of timesheet_ids) {
      try {
        const r = await approveSingleTimesheet(id, req.caller.id, sb);
        if (r?.alreadyApproved) alreadyApprovedCount++; else approvedCount++;
        results.push({ id, ok: true, alreadyApproved: !!r?.alreadyApproved });
      } catch (err) {
        results.push({ id, ok: false, error: err?.message });
      }
    }
    res.json({ ok: true, results, approvedCount, alreadyApprovedCount });
  });

  app.post("/api/workforce/timesheets/:id/approve", requireAuth, requireRole("admin"), async (req, res) => {
    const sb = getServiceSupabase();
    try {
      const r = await approveSingleTimesheet(req.params.id, req.caller.id, sb);
      res.json({ ok: true, alreadyApproved: !!r?.alreadyApproved });
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  });

  // Retry Buildexact sync for a specific approved timesheet
  app.post("/api/workforce/timesheets/:id/sync", requireAuth, requireRole("admin"), async (req, res) => {
    const sb = getServiceSupabase();
    const { data: ts } = await sb.from("timesheets")
      .select("*, timesheet_entries(*)").eq("id", req.params.id).single();
    if (!ts) return res.status(404).json({ ok: false, error: "Timesheet not found" });
    try {
      // force=true redoes a needs-review timesheet: clears the stale order id and creates a fresh one
      // (use only after the old order has been deleted/adjusted in Buildexact).
      const force = req.body?.force === true || req.query?.force === "true";
      const r = await syncTimesheetToBuildexact(ts, sb, { force });
      if (r?.synced || r?.skipped === "already_pushed" || r?.skipped === "complete_disabled") {
        return res.json({ ok: true, ...r });
      }
      return res.status(502).json({ ok: false, error: r?.error || `Sync did not complete (${r?.skipped || "unknown"})`, result: r });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Bulk-push all approved timesheets not yet synced to Buildexact (manual-feed / catch-up button)
  app.post("/api/workforce/timesheets/sync-pending", requireAuth, requireRole("admin"), async (_req, res) => {
    const sb = getServiceSupabase();
    if (!buildexactConfigured()) return res.status(400).json({ ok: false, error: "Buildexact is not configured." });
    const { data: rows, error } = await sb.from("timesheets")
      .select("*, timesheet_entries(*)")
      .eq("status", "approved")
      .is("buildexact_completed_at", null)
      .eq("buildexact_needs_review", false);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    let synced = 0, failed = 0;
    for (const ts of rows || []) {
      try {
        const r = await syncTimesheetToBuildexact(ts, sb);
        if (r?.synced) synced++; else failed++;
      } catch (e) {
        console.warn("[workforce/sync-pending]", e?.message);
        failed++;
      }
    }
    res.json({ ok: true, synced, failed, total: (rows || []).length });
  });

  // Admin delete (test cleanup / erroneous entries) — cascades to timesheet_entries
  app.delete("/api/workforce/timesheets/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const sb = getServiceSupabase();
    await sb.from("timesheet_entries").delete().eq("timesheet_id", req.params.id);
    const { error } = await sb.from("timesheets").delete().eq("id", req.params.id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true });
  });

  app.post("/api/workforce/timesheets/:id/reject", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const { notes } = req.body;
    const { error } = await sb.from("timesheets").update({
      status: "rejected",
      rejection_notes: notes || null,
      updated_at: new Date().toISOString(),
    }).eq("id", req.params.id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true });
  });

  // Director can un-approve a timesheet → resets to submitted so it can be re-reviewed/edited
  app.post("/api/workforce/timesheets/:id/unapprove", requireAuth, requireRole("admin"), async (req, res) => {
    const sb = getServiceSupabase();
    // If a Buildexact order already exists for this timesheet, edits can't auto-sync (the API creates/
    // completes orders, it can't rewrite an existing order's lines). Flag it for manual review so
    // re-approval won't silently re-complete a stale/already-completed order; the operator deletes or
    // adjusts it in Buildexact and uses Force re-sync to create a fresh one.
    const { data: cur } = await sb.from("timesheets")
      .select("buildexact_work_order_id, buildexact_completed_at")
      .eq("id", req.params.id).eq("status", "approved").maybeSingle();
    const hasOrder = !!(cur && cur.buildexact_work_order_id);
    const { error } = await sb.from("timesheets").update({
      status: "submitted",
      approved_by: null,
      approved_at: null,
      buildexact_synced_at: null,
      buildexact_completed_at: null,
      buildexact_sync_claimed_at: null,
      buildexact_needs_review: hasOrder,
      buildexact_sync_error: hasOrder
        ? `A Buildexact order (${cur.buildexact_work_order_id})${cur.buildexact_completed_at ? " is already completed" : " already exists"} for this timesheet — edits won't auto-sync. Delete/adjust it in Buildexact, then use Force re-sync.`
        : null,
      updated_at: new Date().toISOString(),
    }).eq("id", req.params.id).eq("status", "approved");
    if (error) return res.status(500).json({ ok: false, error: error.message });
    // Reset cost_amount on entries so it gets re-computed on next approval
    await sb.from("timesheet_entries").update({ cost_amount: null, overtime_hours: 0 })
      .eq("timesheet_id", req.params.id);
    res.json({ ok: true, buildexactNeedsReview: hasOrder, workOrderId: cur?.buildexact_work_order_id || null });
  });

  // Attribute (or clear) a carpentry job on a pending/submitted timesheet
  app.patch("/api/workforce/timesheets/:id/carpentry-job", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const { carpentryJobId } = req.body;
    // Verify the timesheet exists and is editable (not yet approved)
    const { data: ts, error: tsErr } = await sb
      .from("timesheets")
      .select("id, status")
      .eq("id", req.params.id)
      .maybeSingle();
    if (tsErr || !ts) return res.status(404).json({ ok: false, error: "Timesheet not found" });
    if (ts.status === "approved") {
      return res.status(400).json({ ok: false, error: "Cannot change carpentry job on an approved timesheet. Unapprove it first." });
    }
    // Validate carpentryJobId if provided
    if (carpentryJobId) {
      const { data: job } = await sb.from("carpentry_jobs").select("id").eq("id", carpentryJobId).maybeSingle();
      if (!job) return res.status(400).json({ ok: false, error: "Carpentry job not found" });
    }
    const { error } = await sb.from("timesheets")
      .update({ carpentry_job_id: carpentryJobId || null, updated_at: new Date().toISOString() })
      .eq("id", req.params.id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true });
  });

  // Edit a single timesheet entry from Approvals — lets an admin/supervisor correct an
  // over-claimed hour or wrong task category inline instead of rejecting the whole timesheet.
  // Only allowed while the parent timesheet is "submitted" (pending approval): once approved,
  // cost_amount may already be synced to Buildexact, so edits are blocked (unapprove reopens it).
  app.patch("/api/workforce/timesheet-entries/:id", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const { hours, taskCategory, overtimeHours, notes, canonicalKey, budgetLineItemId } = req.body;

    const { data: entry, error: entryErr } = await sb
      .from("timesheet_entries")
      .select("*, timesheets!inner(id, status, employee_id, carpentry_job_id, employees(*))")
      .eq("id", req.params.id)
      .maybeSingle();
    if (entryErr) return err(res, 500, translateDbError(entryErr));
    if (!entry) return err(res, 404, "Timesheet entry not found", "NOT_FOUND");

    const ts = entry.timesheets;
    if (ts.status === "approved") {
      return err(res, 409, "Approved timesheets can't be edited — reject to reopen.", "ALREADY_APPROVED");
    }
    if (ts.status !== "submitted") {
      return err(res, 409, "Only submitted (pending approval) timesheets can be edited here.", "NOT_SUBMITTED");
    }

    // Validate inputs — same bounds as the worker edit path / DB check constraints.
    // NB: timesheet_entries has no updated_at column — do not set it (would 500).
    const update = {};
    if (hours !== undefined) {
      const h = Number(hours);
      if (!Number.isFinite(h) || h <= 0 || h > MAX_ENTRY_HOURS) {
        return err(res, 400, `Hours must be greater than 0 and no more than ${MAX_ENTRY_HOURS}.`, "BAD_HOURS");
      }
      update.hours = h;
    }
    if (taskCategory !== undefined) {
      if (!TASK_CATEGORIES.includes(taskCategory)) {
        return err(res, 400, "Invalid task category.", "BAD_CATEGORY");
      }
      update.task_category = taskCategory;
      update.phase = TASK_PHASE_MAP[taskCategory] || "general";
    }
    // Sub-task attribution (canonical_key, mig 147): the office can re-attribute an entry to a budget
    // sub-task (e.g. Wall framing) or clear it. Only when the column exists and the entry is on a
    // carpentry job. If the category changed and no sub-task is supplied, drop the now-stale sub-task.
    const hasCanonicalCol = "canonical_key" in entry;
    if (hasCanonicalCol && (canonicalKey !== undefined || update.task_category !== undefined)) {
      const effCat = update.task_category !== undefined ? update.task_category : entry.task_category;
      if (canonicalKey) {
        const carpentryJobId = entry.timesheets?.carpentry_job_id || null;
        if (!carpentryJobId) return err(res, 400, "Only carpentry-job entries can have a sub-task.", "NO_JOB");
        // A sub-task can span SEVERAL line items (e.g. many cladding lines → "battening"), so fetch all
        // matches — never .maybeSingle() (which returns null on >1 and would reject a valid sub-task).
        const { data: lis } = await sb.from("carpentry_budget_line_items")
          .select("id").eq("job_id", carpentryJobId).eq("task_category", effCat)
          .eq("canonical_key", canonicalKey).eq("status", "confirmed");
        if (!lis || !lis.length) return err(res, 400, "That sub-task isn't part of this job's budget.", "BAD_SUBTASK");
        update.canonical_key = canonicalKey;
        update.budget_line_item_id = lis.some((l) => l.id === budgetLineItemId) ? budgetLineItemId : lis[0].id;
      } else {
        update.canonical_key = null;
        update.budget_line_item_id = null;
      }
    }
    if (overtimeHours !== undefined) {
      const ot = Number(overtimeHours);
      if (!Number.isFinite(ot) || ot < 0) {
        return err(res, 400, "Overtime hours must be 0 or greater.", "BAD_OT_HOURS");
      }
      update.overtime_hours = ot;
    }
    if (notes !== undefined) update.notes = notes || null;

    // Recompute cost_amount with the same formula used at approval time (splitOvertimeHours +
    // computeCost), keyed off the possibly-just-edited hours so the figure the approver sees
    // (and later syncs to Buildexact) always reflects the corrected entry.
    const effectiveHours = update.hours !== undefined ? update.hours : Number(entry.hours);
    const { data: settings } = await sb.from("workforce_settings").select("*").limit(1).single();
    const cm = await getCostModel(sb);
    const bands = splitOvertimeHours(effectiveHours, settings || { overtime_threshold: 8, double_time_threshold: 10 });
    update.cost_amount = computeCost(bands, ts.employees, loadedRate(cm, ts.employee_id));
    // overtime_hours mirrors the approval flow's convention (all premium hours) unless the
    // caller explicitly supplied their own overtimeHours override above.
    if (overtimeHours === undefined) {
      update.overtime_hours = bands.overtime + bands.doubletime;
    }

    const { data: updated, error: updateErr } = await sb
      .from("timesheet_entries")
      .update(update)
      .eq("id", req.params.id)
      .select()
      .single();
    if (updateErr) return err(res, 500, translateDbError(updateErr));

    ok(res, { entry: { ...rowToCamel(updated), taskLabel: taskLabelForEntry(updated) } });
  });

  // Add an extra entry (task category + hours) to a submitted timesheet from the detail modal.
  // Same guards + cost formula as the entry edit above.
  app.post("/api/workforce/timesheets/:id/entries", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const { hours, taskCategory, notes } = req.body || {};

    if (!isUuid(req.params.id)) return err(res, 400, "Invalid timesheet id.");
    const { data: ts, error: tsErr } = await sb
      .from("timesheets")
      .select("id, status, employee_id, employees(*)")
      .eq("id", req.params.id)
      .maybeSingle();
    if (tsErr) return err(res, 500, translateDbError(tsErr));
    if (!ts) return err(res, 404, "Timesheet not found.", "NOT_FOUND");
    if (ts.status === "approved") return err(res, 409, "Approved timesheets can't be edited — reject to reopen.", "ALREADY_APPROVED");
    if (ts.status !== "submitted") return err(res, 409, "Only submitted (pending approval) timesheets can be edited here.", "NOT_SUBMITTED");

    const h = Number(hours);
    if (!Number.isFinite(h) || h <= 0 || h > MAX_ENTRY_HOURS) {
      return err(res, 400, `Hours must be greater than 0 and no more than ${MAX_ENTRY_HOURS}.`, "BAD_HOURS");
    }
    if (!TASK_CATEGORIES.includes(taskCategory)) {
      return err(res, 400, "Invalid task category.", "BAD_CATEGORY");
    }

    const { data: settings } = await sb.from("workforce_settings").select("*").limit(1).single();
    const cm = await getCostModel(sb);
    const bands = splitOvertimeHours(h, settings || { overtime_threshold: 8, double_time_threshold: 10 });
    const cost = computeCost(bands, ts.employees, loadedRate(cm, ts.employee_id));

    const { data: created, error: insErr } = await sb
      .from("timesheet_entries")
      .insert({
        timesheet_id:   ts.id,
        employee_id:    ts.employee_id,
        task_category:  taskCategory,
        phase:          TASK_PHASE_MAP[taskCategory] || "general",
        hours:          h,
        overtime_hours: bands.overtime + bands.doubletime,
        cost_amount:    cost,
        notes:          notes || null,
      })
      .select()
      .single();
    if (insErr) return err(res, 500, translateDbError(insErr));

    ok(res, { entry: rowToCamel(created) });
  });

  // ── Labour dashboard ──────────────────────────────────────────────────────

  app.get("/api/projects/:id/labour", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const projectId = req.params.id;
    const isDirector = req.caller.role === "admin";

    const { data: project } = await sb.from("projects").select("id, address, job_id").eq("id", projectId).single();
    if (!project) return res.status(404).json({ ok: false, error: "Project not found" });

    // All approved timesheet entries for this project
    const { data: entries } = await sb
      .from("timesheet_entries")
      .select("task_category, hours, cost_amount, timesheets!inner(project_id, status, date, employees(id, name))")
      .eq("timesheets.project_id", projectId)
      .eq("timesheets.status", "approved");

    // Group by category
    const byCategory = {};
    for (const e of entries || []) {
      const cat = e.task_category;
      if (!byCategory[cat]) byCategory[cat] = { task_category: cat, label: TASK_LABELS[cat] || cat, phase: TASK_PHASE_MAP[cat] || "general", total_hours: 0, total_cost: 0, entry_count: 0 };
      byCategory[cat].total_hours += Number(e.hours || 0);
      byCategory[cat].total_cost += Number(e.cost_amount || 0);
      byCategory[cat].entry_count++;
    }

    // Workers active this week
    const monStr = weekStart(todayYmd());
    const { data: weekEntries } = await sb
      .from("timesheet_entries")
      .select("hours, cost_amount, timesheets!inner(project_id, status, date, employees(id, name))")
      .eq("timesheets.project_id", projectId)
      .in("timesheets.status", ["approved", "submitted"])
      .gte("timesheets.date", monStr);

    const workerMap = {};
    for (const e of weekEntries || []) {
      const emp = e.timesheets?.employees;
      if (!emp) continue;
      if (!workerMap[emp.id]) workerMap[emp.id] = { name: emp.name, hours: 0, cost: 0 };
      workerMap[emp.id].hours += Number(e.hours || 0);
      workerMap[emp.id].cost += Number(e.cost_amount || 0);
    }

    const totalHours = Object.values(byCategory).reduce((s, c) => s + c.total_hours, 0);
    const totalCost = Object.values(byCategory).reduce((s, c) => s + c.total_cost, 0);

    // Buildexact estimates (best-effort)
    let buildexactEstimates = null;
    if (project.job_id) {
      const { data: job } = await sb.from("jobs").select("buildexact_job_id").eq("id", project.job_id).maybeSingle();
      if (job?.buildexact_job_id) {
        try { buildexactEstimates = await pullBuildexactEstimate(job.buildexact_job_id); } catch { /* ignore */ }
      }
    }

    // Pay-derived cost is director-only. Non-directors keep hours/names/categories
    // but every cost field is nulled — consistent with hourly_rate being hidden on
    // the employees endpoint and the aggregate total_cost gate below. Shape is stable.
    const categoriesOut = Object.values(byCategory).map(c =>
      isDirector ? c : { ...c, total_cost: null });
    const workersOut = Object.values(workerMap).map(w =>
      isDirector ? w : { ...w, cost: null });

    res.json({
      ok: true,
      entries_by_category: categoriesOut,
      workers_this_week: workersOut,
      total_hours: totalHours,
      total_cost: isDirector ? totalCost : null,
      buildexact_estimates: buildexactEstimates,
    });
  });

  // ── Site tasks ────────────────────────────────────────────────────────────

  const PRIORITY_ORDER = { urgent: 0, normal: 1, when_time_permits: 2 };
  // Whitelists for worker-supplied query params. These endpoints run with the
  // service role (RLS bypassed), so every client-supplied value that reaches a
  // PostgREST filter MUST be validated against a fixed set / isUuid() first.
  // W17-P3: include the carpentry labour streams (mig 114 site_tasks.category CHECK) so a worker can
  // filter carpentry tasks by their budget category — category == budget category == timesheet task_category.
  const SITE_TASK_CATEGORIES = ["general", "defect", "safety", "materials", "inspection", "first_fix_framing", "cladding", "second_fix", "outdoor_works", "formwork_slab_prep", "site_labouring", "site_cleanup", "supervision"];
  const WORKER_JOB_TYPES = ["project", "carpentry"];

  app.get("/api/projects/:id/site-tasks", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const { data, error } = await sb
      .from("site_tasks")
      .select("*, employees!assigned_to(id, name)")
      .eq("project_id", req.params.id)
      .neq("status", "wont_do")
      .order("sort_order")
      .order("created_at");
    if (error) return res.status(500).json({ ok: false, error: error.message });
    const sorted = (data || []).sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99));
    await signSiteTaskPhotos(sb, sorted);
    res.json({ ok: true, tasks: await attachAssigneesFromDb(sb, sorted) });
  });

  app.post("/api/projects/:id/site-tasks", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const { title, description, assigned_to, priority, category, due_date } = req.body;
    if (!title) return res.status(400).json({ ok: false, error: "title is required" });
    const { data, error } = await sb.from("site_tasks").insert({
      project_id: req.params.id,
      title, description: description || null,
      assigned_to: assigned_to || null,
      priority: priority || "normal",
      category: category || "general",
      due_date: due_date || null,
      created_by: req.caller.id,
      created_via: "manual",
    }).select().single();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (assigned_to) await setAssignees(sb, data.id, [assigned_to], null);   // dual-write the join
    const [withA] = await attachAssigneesFromDb(sb, [data]);
    res.json({ ok: true, task: withA });
  });

  app.post("/api/projects/:id/site-tasks/bulk", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const { tasks, created_via } = req.body;
    if (!Array.isArray(tasks) || !tasks.length) {
      return res.status(400).json({ ok: false, error: "tasks[] required" });
    }
    const rows = tasks.map(t => ({
      project_id: req.params.id,
      title: t.title,
      description: t.description || null,
      priority: t.priority || "normal",
      category: t.category || "general",
      assigned_to: t.assigned_to || null,
      created_by: req.caller.id,
      created_via: created_via || "manual",
    }));
    const { data, error } = await sb.from("site_tasks").insert(rows).select();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    for (const t of (data || [])) { if (t.assigned_to) await setAssignees(sb, t.id, [t.assigned_to], null); }
    res.json({ ok: true, tasks: await attachAssigneesFromDb(sb, data || []) });
  });

  // ── W17-P6: voice-to-tasks for building projects (mirror of the carpentry path) ──
  // Paste a site walk-through transcript → DRAFT task list for review. Creates NOTHING;
  // the UI reviews/edits, then saves the keepers via POST /site-tasks/bulk (ai_extraction).
  app.post("/api/projects/:id/site-tasks/from-transcript", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    try {
      const transcript = String(req.body?.transcript || "").trim();
      if (!transcript) return err(res, 400, "transcript is required.");
      if (transcript.length > 20000) return err(res, 413, "Transcript too long — split it into shorter sessions.");
      const jobLabel = String(req.body?.jobLabel || "").trim();
      const tasks = await splitTranscriptToTasks(transcript, { jobLabel });
      return ok(res, { tasks, draft: true });
    } catch (e) {
      console.error("[projects/site-tasks from-transcript]", e);
      return err(res, 502, e.message || "Could not extract tasks from the transcript.");
    }
  });

  // ── W17-P7: leading-hand QC checklist — apply a set of supervisor-audience inspection
  // tasks (only leading hands see/complete them; the audience gate is enforced in /worker/tasks).
  const QC_TEMPLATE = [
    "Frame / first-fix inspection",
    "Roof / trusses inspection",
    "Box-gutter / framing inspection",
    "External cladding inspection",
    "Fixing / second-fix inspection",
    "Decking / external inspection",
    "Defects / handover walk-through",
  ];
  app.post("/api/projects/:id/site-tasks/apply-qc-template", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const projectId = req.params.id;
    if (!isUuid(projectId)) return err(res, 400, "Invalid project id.");
    const { data: existing } = await sb.from("site_tasks").select("title").eq("project_id", projectId).eq("task_audience", "supervisor");
    const have = new Set((existing || []).map(t => (t.title || "").toLowerCase()));
    const rows = QC_TEMPLATE.filter(t => !have.has(t.toLowerCase())).map(title => ({
      project_id: projectId, title, task_audience: "supervisor", category: "inspection", priority: "normal", created_by: req.caller.id, created_via: "manual",
    }));
    if (!rows.length) return ok(res, { created: 0, skipped: QC_TEMPLATE.length });
    const { data, error } = await sb.from("site_tasks").insert(rows).select("id");
    if (error) return err(res, 500, translateDbError(error));
    ok(res, { created: (data || []).length, skipped: QC_TEMPLATE.length - rows.length });
  });

  app.patch("/api/site-tasks/:id", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    // assigned_to is written through the join (setAssignees) below, not as a bare column.
    const allowed = ["title", "description", "priority", "category", "status", "due_date", "completion_notes", "sort_order"];
    const update = { updated_at: new Date().toISOString() };
    for (const k of allowed) {
      if (req.body[k] !== undefined) update[k] = req.body[k];
    }
    if (req.body.status === "done" && !update.completed_at) {
      update.completed_at = new Date().toISOString();
      // Attribute office completions: completed_by FKs employees(id), but req.caller.id is the
      // auth/user_profiles id — resolve the caller's employee record so the audit trail isn't null.
      const { data: callerEmp } = await sb.from("employees").select("id").eq("user_id", req.caller.id).maybeSingle();
      if (callerEmp?.id) update.completed_by = callerEmp.id;
    }
    let { data, error } = await sb.from("site_tasks").update(update).eq("id", req.params.id).select().single();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (req.body.assigned_to !== undefined) {
      await setAssignees(sb, req.params.id, req.body.assigned_to ? [req.body.assigned_to] : [], null);
      // Re-read so the pre-mig fallback overlays the freshly-mirrored assigned_to, not the stale row.
      const { data: fresh } = await sb.from("site_tasks").select().eq("id", req.params.id).maybeSingle();
      if (fresh) data = fresh;
    }
    const [withA] = await attachAssigneesFromDb(sb, [data]);
    res.json({ ok: true, task: withA });
  });

  app.delete("/api/site-tasks/:id", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    await recordTaskDeletion(sb, { taskId: req.params.id, actorId: req.caller?.id || null, actorLabel: req.caller?.email || req.caller?.role || null, source: "site-task-delete" });
    const { error } = await sb.from("site_tasks").update({ status: "wont_do", updated_at: new Date().toISOString() }).eq("id", req.params.id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true });
  });

  // ── Task-delete AUDIT LOG (mig 173) ─────────────────────────────────────────
  // A "delete" is a soft delete (status → wont_do); recordTaskDeletion logs who/when/what on every
  // delete path. List recent deletions (optionally for one job), and RESTORE a soft-deleted task.
  app.get("/api/workforce/task-deletions", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    try {
      let q = sb.from("site_task_deletions").select("*").order("created_at", { ascending: false }).limit(limit);
      if (req.query.jobId && isUuid(req.query.jobId)) q = q.eq("carpentry_job_id", req.query.jobId);
      if (req.query.projectId && isUuid(req.query.projectId)) q = q.eq("project_id", req.query.projectId);
      const { data, error } = await q;
      if (error) { if (/site_task_deletions.*does not exist|schema cache/i.test(error.message || "")) return ok(res, { deletions: [], migrationPending: true }); throw error; }
      // Flag which deleted tasks are still restorable (row still present + still wont_do).
      const ids = [...new Set((data || []).map((d) => d.site_task_id).filter(Boolean))];
      const { data: live } = ids.length ? await sb.from("site_tasks").select("id, status").in("id", ids) : { data: [] };
      const statusById = Object.fromEntries((live || []).map((t) => [t.id, t.status]));
      const deletions = (data || []).map((d) => ({ ...rowToCamel(d), restorable: statusById[d.site_task_id] === "wont_do" }));
      return ok(res, { deletions });
    } catch (e) { console.error("[task-deletions GET]", e?.message || e); return err(res, 500, "Could not load the delete log."); }
  });
  app.post("/api/workforce/task-deletions/:auditId/restore", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    if (!isUuid(req.params.auditId)) return err(res, 400, "Invalid id.");
    try {
      const { data: log } = await sb.from("site_task_deletions").select("site_task_id, prior_status").eq("id", req.params.auditId).maybeSingle();
      if (!log?.site_task_id) return err(res, 404, "Delete record not found.", "NOT_FOUND");
      const restoreTo = ["open", "in_progress", "blocked", "done"].includes(log.prior_status) ? log.prior_status : "open";
      const { data: t } = await sb.from("site_tasks").select("id, status").eq("id", log.site_task_id).maybeSingle();
      if (!t) return err(res, 410, "That task no longer exists and can't be restored.", "GONE");
      if (t.status !== "wont_do") return err(res, 409, "That task isn't deleted — nothing to restore.", "NOT_DELETED");
      const { error } = await sb.from("site_tasks").update({ status: restoreTo, updated_at: new Date().toISOString() }).eq("id", log.site_task_id);
      if (error) return err(res, 500, translateDbError(error));
      return ok(res, { restoredTo: restoreTo });
    } catch (e) { console.error("[task-deletions restore]", e?.message || e); return err(res, 500, "Could not restore the task."); }
  });

  // ── Workforce crews (W16-A1) ────────────────────────────────────────────────

  app.get("/api/workforce/crews", requireAuth, requireRole("admin", "supervisor"), async (_req, res) => {
    const sb = getServiceSupabase();
    const { data: crews, error } = await sb.from("workforce_crews")
      .select("*, workforce_crew_members(id, employee_id, sort_order, employees(id, name))")
      .order("name", { ascending: true });
    if (error) return err(res, 500, translateDbError(error));
    const out = (crews || []).map(c => ({
      ...rowToCamel(c),
      members: (c.workforce_crew_members || []).map(m => ({
        id: m.id,
        employeeId: m.employee_id,
        sortOrder: m.sort_order,
        employeeName: m.employees?.name ?? null,
      })),
    }));
    ok(res, { crews: out });
  });

  app.post("/api/workforce/crews", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const name = String(req.body.name || "").trim();
    if (!name) return err(res, 400, "Crew name is required");
    const { data: crew, error } = await sb.from("workforce_crews").insert({ name }).select().single();
    if (error) return err(res, 500, translateDbError(error));
    try {
      await syncCrewMembers(sb, crew.id, req.body.memberIds);
    } catch (e) {
      await sb.from("workforce_crews").delete().eq("id", crew.id);
      return err(res, 500, e.message || "Could not add crew members");
    }
    const { data: full } = await sb.from("workforce_crews")
      .select("*, workforce_crew_members(id, employee_id, sort_order, employees(id, name))")
      .eq("id", crew.id).single();
    ok(res, {
      crew: {
        ...rowToCamel(full),
        members: (full?.workforce_crew_members || []).map(m => ({
          id: m.id,
          employeeId: m.employee_id,
          sortOrder: m.sort_order,
          employeeName: m.employees?.name ?? null,
        })),
      },
    });
  });

  app.put("/api/workforce/crews/:id", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const update = { updated_at: new Date().toISOString() };
    if (req.body.name !== undefined) {
      const name = String(req.body.name || "").trim();
      if (!name) return err(res, 400, "Crew name cannot be empty");
      update.name = name;
    }
    if (req.body.isActive !== undefined) update.is_active = !!req.body.isActive;
    const { data: crew, error } = await sb.from("workforce_crews").update(update).eq("id", req.params.id).select().maybeSingle();
    if (error) return err(res, 500, translateDbError(error));
    if (!crew) return err(res, 404, "Crew not found", "NOT_FOUND");
    if (req.body.memberIds !== undefined) {
      try {
        await syncCrewMembers(sb, crew.id, req.body.memberIds);
      } catch (e) {
        return err(res, 500, e.message || "Could not update crew members");
      }
    }
    const { data: full } = await sb.from("workforce_crews")
      .select("*, workforce_crew_members(id, employee_id, sort_order, employees(id, name))")
      .eq("id", crew.id).single();
    ok(res, {
      crew: {
        ...rowToCamel(full),
        members: (full?.workforce_crew_members || []).map(m => ({
          id: m.id,
          employeeId: m.employee_id,
          sortOrder: m.sort_order,
          employeeName: m.employees?.name ?? null,
        })),
      },
    });
  });

  // ── Workforce allocations (W16-A1) ──────────────────────────────────────────

  app.get("/api/workforce/allocations", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const { from, to, employeeId, projectId, carpentryJobId } = req.query;
    let q = sb.from("workforce_allocations").select(ALLOCATION_SELECT).order("allocation_date", { ascending: true });
    if (from) q = q.gte("allocation_date", from);
    if (to) q = q.lte("allocation_date", to);
    if (employeeId) q = q.eq("employee_id", employeeId);
    if (projectId) q = q.eq("project_id", projectId);
    if (carpentryJobId) q = q.eq("carpentry_job_id", carpentryJobId);
    const { data, error } = await q;
    if (error) return err(res, 500, translateDbError(error));
    const allocations = await attachChargeUpSites(sb, (data || []).map(formatAllocation));
    ok(res, { allocations });
  });

  app.post("/api/workforce/allocations", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const allocationDate = req.body.allocationDate ?? req.body.allocation_date;
    const employeeId = req.body.employeeId ?? req.body.employee_id;
    if (!allocationDate) return err(res, 400, "allocationDate is required");
    if (!employeeId || !isUuid(employeeId)) return err(res, 400, "employeeId is required");
    const spine = parseJobSpine(req.body);
    if (spine.error) return err(res, 400, spine.error);

    const { data: existing } = await sb.from("workforce_allocations")
      .select("id").eq("employee_id", employeeId).eq("allocation_date", allocationDate).maybeSingle();
    if (existing) return err(res, 409, "This employee already has an allocation on that date", "DUPLICATE_ALLOCATION");

    const cu = await resolveAllocChargeUpSite(sb, spine.carpentryJobId, req.body.chargeUpJobId ?? req.body.charge_up_job_id ?? null);
    if (cu.error) return err(res, 400, cu.error);

    const crewId = req.body.crewId ?? req.body.crew_id ?? null;
    const row = {
      allocation_date: allocationDate,
      employee_id: employeeId,
      crew_id: crewId && isUuid(crewId) ? crewId : null,
      project_id: spine.projectId,
      carpentry_job_id: spine.carpentryJobId,
      notes: req.body.notes ?? null,
      created_by: req.caller.id,
      updated_at: new Date().toISOString(),
    };
    // Only include the column when a site is actually chosen, so the insert never references
    // charge_up_job_id before mig 146 is applied (would 500 the whole Planner otherwise).
    if (cu.chargeUpJobId) row.charge_up_job_id = cu.chargeUpJobId;
    const { data, error } = await sb.from("workforce_allocations").insert(row).select("id").single();
    if (error) {
      if (/duplicate key|unique constraint/i.test(error.message || "")) {
        return err(res, 409, "This employee already has an allocation on that date", "DUPLICATE_ALLOCATION");
      }
      return err(res, 500, translateDbError(error));
    }
    try {
      const full = await fetchAllocationById(sb, data.id);
      ok(res, { allocation: formatAllocation(full) });
    } catch (e) {
      return err(res, 500, e.message);
    }
  });

  app.put("/api/workforce/allocations/:id", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const { data: current } = await sb.from("workforce_allocations").select("*").eq("id", req.params.id).maybeSingle();
    if (!current) return err(res, 404, "Allocation not found", "NOT_FOUND");

    const update = { updated_at: new Date().toISOString() };
    if (req.body.allocationDate !== undefined || req.body.allocation_date !== undefined) {
      update.allocation_date = req.body.allocationDate ?? req.body.allocation_date;
    }
    if (req.body.employeeId !== undefined || req.body.employee_id !== undefined) {
      update.employee_id = req.body.employeeId ?? req.body.employee_id;
    }
    if (req.body.crewId !== undefined || req.body.crew_id !== undefined) {
      const crewId = req.body.crewId ?? req.body.crew_id;
      update.crew_id = crewId && isUuid(crewId) ? crewId : null;
    }
    if (req.body.notes !== undefined) update.notes = req.body.notes;

    const nextProjectId = req.body.projectId ?? req.body.project_id ?? current.project_id;
    const nextCarpentryId = req.body.carpentryJobId ?? req.body.carpentry_job_id ?? current.carpentry_job_id;
    if (req.body.projectId !== undefined || req.body.projectId === null
      || req.body.carpentryJobId !== undefined || req.body.carpentryJobId === null
      || req.body.project_id !== undefined || req.body.carpentry_job_id !== undefined) {
      const spine = parseJobSpine({ projectId: nextProjectId, carpentryJobId: nextCarpentryId });
      if (spine.error) return err(res, 400, spine.error);
      update.project_id = spine.projectId;
      update.carpentry_job_id = spine.carpentryJobId;
    }

    const checkEmployeeId = update.employee_id ?? current.employee_id;
    const checkDate = update.allocation_date ?? current.allocation_date;
    const { data: dup } = await sb.from("workforce_allocations")
      .select("id").eq("employee_id", checkEmployeeId).eq("allocation_date", checkDate)
      .neq("id", req.params.id).maybeSingle();
    if (dup) return err(res, 409, "This employee already has an allocation on that date", "DUPLICATE_ALLOCATION");

    const { error } = await sb.from("workforce_allocations").update(update).eq("id", req.params.id);
    if (error) {
      if (/duplicate key|unique constraint/i.test(error.message || "")) {
        return err(res, 409, "This employee already has an allocation on that date", "DUPLICATE_ALLOCATION");
      }
      return err(res, 500, translateDbError(error));
    }
    try {
      const full = await fetchAllocationById(sb, req.params.id);
      ok(res, { allocation: formatAllocation(full) });
    } catch (e) {
      return err(res, 500, e.message);
    }
  });

  app.delete("/api/workforce/allocations/:id", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const { data, error } = await sb.from("workforce_allocations").delete().eq("id", req.params.id).select("id").maybeSingle();
    if (error) return err(res, 500, translateDbError(error));
    if (!data) return err(res, 404, "Allocation not found", "NOT_FOUND");
    ok(res);
  });

  // ── Atomic assign / move / swap (fixes chip vanish/duplicate + broken swap-onto-occupied) ──
  // One transaction via the migration-143 RPCs; falls back to ordered ops if the functions aren't
  // applied yet. Both return the AFFECTED allocation rows so the client can apply server truth.
  const rpcMissing = (e) =>
    !!e && (e.code === "42883" || e.code === "PGRST202" || /function .* does not exist|could not find the function|schema cache/i.test(e.message || ""));
  async function formatAllocIds(sb, ids) {
    const out = [];
    for (const id of ids) {
      try { const full = await fetchAllocationById(sb, id); if (full) out.push(formatAllocation(full)); } catch { /* deleted mid-swap */ }
    }
    return attachChargeUpSites(sb, out);
  }

  app.post("/api/workforce/allocations/assign", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const allocationDate = req.body.allocationDate ?? req.body.allocation_date ?? req.body.date;
    const employeeId = req.body.employeeId ?? req.body.employee_id;
    if (!allocationDate) return err(res, 400, "allocationDate is required");
    if (!employeeId || !isUuid(employeeId)) return err(res, 400, "employeeId is required");
    const spine = parseJobSpine(req.body);
    if (spine.error) return err(res, 400, spine.error);
    const cu = await resolveAllocChargeUpSite(sb, spine.carpentryJobId, req.body.chargeUpJobId ?? req.body.charge_up_job_id ?? null);
    if (cu.error) return err(res, 400, cu.error);
    const notes = req.body.notes ?? null;
    // The assign RPC replaces-or-inserts one (employee, date) cell but doesn't know about the
    // charge-up site column; stamp it on the resulting row afterwards. Guarded so it never runs
    // (nor references the column) unless a real site was chosen — safe before mig 146.
    const tagSite = async (ids) => {
      if (cu.chargeUpJobId) {
        await sb.from("workforce_allocations").update({ charge_up_job_id: cu.chargeUpJobId })
          .eq("employee_id", employeeId).eq("allocation_date", allocationDate);
      }
      return formatAllocIds(sb, ids);
    };
    try {
      const { data, error } = await sb.rpc("workforce_allocation_assign", {
        p_employee: employeeId, p_date: allocationDate,
        p_project: spine.projectId, p_carpentry: spine.carpentryJobId,
        p_notes: notes, p_created_by: req.caller.id,
      });
      if (error && !rpcMissing(error)) return err(res, 500, translateDbError(error));
      if (error) { // fallback (mig 143 not applied) — ordered ops, non-atomic
        await sb.from("workforce_allocations").delete().eq("employee_id", employeeId).eq("allocation_date", allocationDate);
        const insRow = {
          employee_id: employeeId, allocation_date: allocationDate,
          project_id: spine.projectId, carpentry_job_id: spine.carpentryJobId,
          notes, created_by: req.caller.id, updated_at: new Date().toISOString(),
        };
        if (cu.chargeUpJobId) insRow.charge_up_job_id = cu.chargeUpJobId;
        const ins = await sb.from("workforce_allocations").insert(insRow).select("id").single();
        if (ins.error) return err(res, 500, translateDbError(ins.error));
        return ok(res, { allocations: await formatAllocIds(sb, [ins.data.id]) });
      }
      return ok(res, { allocations: await tagSite((data || []).map((r) => r.id)) });
    } catch (e) { return err(res, 500, e.message); }
  });

  app.post("/api/workforce/allocations/move", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const id = req.body.id;
    const toEmployee = req.body.toEmployeeId ?? req.body.to_employee ?? req.body.employeeId;
    const toDate = req.body.toDate ?? req.body.to_date ?? req.body.allocationDate;
    if (!id || !isUuid(id)) return err(res, 400, "id is required");
    if (!toEmployee || !isUuid(toEmployee)) return err(res, 400, "toEmployeeId is required");
    if (!toDate) return err(res, 400, "toDate is required");
    try {
      const { data, error } = await sb.rpc("workforce_allocation_move", { p_id: id, p_to_employee: toEmployee, p_to_date: toDate });
      if (error && (error.code === "P0002" || /allocation_not_found/.test(error.message || ""))) return err(res, 404, "Allocation not found", "NOT_FOUND");
      if (error && !rpcMissing(error)) return err(res, 500, translateDbError(error));
      if (error) { // fallback (mig 143 not applied) — ordered ops mirroring the RPC
        const { data: src } = await sb.from("workforce_allocations").select("*").eq("id", id).maybeSingle();
        if (!src) return err(res, 404, "Allocation not found", "NOT_FOUND");
        if (src.employee_id === toEmployee && src.allocation_date === toDate) return ok(res, { allocations: await formatAllocIds(sb, [id]) });
        const { data: tgt } = await sb.from("workforce_allocations").select("*").eq("employee_id", toEmployee).eq("allocation_date", toDate).maybeSingle();
        if (tgt) {
          await sb.from("workforce_allocations").delete().eq("id", tgt.id);
          await sb.from("workforce_allocations").update({ employee_id: toEmployee, allocation_date: toDate, updated_at: new Date().toISOString() }).eq("id", id);
          await sb.from("workforce_allocations").insert({
            employee_id: src.employee_id, allocation_date: src.allocation_date,
            project_id: tgt.project_id, carpentry_job_id: tgt.carpentry_job_id,
            // preserve the displaced shift's charge-up site (undefined pre-mig → key omitted)
            charge_up_job_id: tgt.charge_up_job_id ?? undefined,
            notes: tgt.notes, created_by: tgt.created_by, updated_at: new Date().toISOString(),
          });
        } else {
          await sb.from("workforce_allocations").update({ employee_id: toEmployee, allocation_date: toDate, updated_at: new Date().toISOString() }).eq("id", id);
        }
        const { data: rows } = await sb.from("workforce_allocations").select("id")
          .or(`and(employee_id.eq.${toEmployee},allocation_date.eq.${toDate}),and(employee_id.eq.${src.employee_id},allocation_date.eq.${src.allocation_date})`);
        return ok(res, { allocations: await formatAllocIds(sb, (rows || []).map((r) => r.id)) });
      }
      return ok(res, { allocations: await formatAllocIds(sb, (data || []).map((r) => r.id)) });
    } catch (e) { return err(res, 500, e.message); }
  });

  // Clear every allocation in a date range (the "Clear week" button).
  app.post("/api/workforce/allocations/clear-week", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const { from, to } = req.body;
    if (!from || !to) return err(res, 400, "from and to are required");
    const { error } = await sb.from("workforce_allocations").delete().gte("allocation_date", from).lte("allocation_date", to);
    if (error) return err(res, 500, translateDbError(error));
    ok(res);
  });

  // ── W17-P4b/P4c: per-job Planner settings (colour + board membership) — advisory/UI only.
  // Degrades gracefully if migration 118 is not applied (table missing → empty / 503).
  // PostgREST reports a missing table via a schema-cache error, not the raw PG 42P01 code.
  const plannerTableMissing = (e) =>
    !!e && (e.code === "42P01" || e.code === "PGRST205" || /could not find the table|schema cache|does not exist/i.test(e.message || ""));

  app.get("/api/workforce/planner-jobs", requireAuth, requireRole("admin", "supervisor"), async (_req, res) => {
    const sb = getServiceSupabase();
    const { data, error } = await sb.from("workforce_planner_jobs").select("project_id, carpentry_job_id, color, on_board");
    if (error) {
      if (plannerTableMissing(error)) return ok(res, { jobs: [] }); // table not present yet
      return err(res, 500, translateDbError(error));
    }
    ok(res, { jobs: (data || []).map(r => ({ projectId: r.project_id, carpentryJobId: r.carpentry_job_id, color: r.color, onBoard: r.on_board })) });
  });

  app.put("/api/workforce/planner-jobs", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const hasColor = typeof req.body.color === "string";
    const hasBoard = typeof req.body.onBoard === "boolean";
    if (!hasColor && !hasBoard) return err(res, 400, "color or onBoard is required");
    const spine = parseJobSpine(req.body);
    if (spine.error) return err(res, 400, spine.error);
    const col = spine.projectId ? "project_id" : "carpentry_job_id";
    const val = spine.projectId || spine.carpentryJobId;
    const { data: existing, error: lookupErr } = await sb.from("workforce_planner_jobs").select("id").eq(col, val).maybeSingle();
    if (plannerTableMissing(lookupErr)) return err(res, 503, "Planner settings need migration 118 applied", "MIGRATION_PENDING");
    const patch = { updated_at: new Date().toISOString() };
    if (hasColor) patch.color = req.body.color.trim();
    if (hasBoard) patch.on_board = req.body.onBoard;
    const result = existing
      ? await sb.from("workforce_planner_jobs").update(patch).eq("id", existing.id).select("id").single()
      : await sb.from("workforce_planner_jobs").insert({ project_id: spine.projectId, carpentry_job_id: spine.carpentryJobId, color: hasColor ? req.body.color.trim() : null, on_board: hasBoard ? req.body.onBoard : false, created_by: req.caller.id }).select("id").single();
    if (result.error) {
      if (plannerTableMissing(result.error)) return err(res, 503, "Planner settings need migration 118 applied", "MIGRATION_PENDING");
      return err(res, 500, translateDbError(result.error));
    }
    ok(res, { job: { projectId: spine.projectId, carpentryJobId: spine.carpentryJobId, ...(hasColor ? { color: req.body.color.trim() } : {}), ...(hasBoard ? { onBoard: req.body.onBoard } : {}) } });
  });

  // ── W17-P5: RDO + public-holiday DISPLAY model (advisory/UI only) ──────────
  // Display-only: never creates/alters a timesheet, approval, or Buildxact sync.
  // Graceful 503 MIGRATION_PENDING / empty until migration 119 is applied.
  const ymdUTC = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  const MS_WEEK = 7 * 86400000;
  const weekIndex = (d) => Math.floor((d.getTime() - Date.UTC(2024, 0, 1)) / MS_WEEK); // weeks since a Monday epoch
  function nthWeekdayOfMonth(year, month0, weekday, n) {
    const first = new Date(Date.UTC(year, month0, 1));
    const shift = (weekday - first.getUTCDay() + 7) % 7;
    return new Date(Date.UTC(year, month0, 1 + shift + (n - 1) * 7));
  }
  function easterSunday(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(year, month - 1, day));
  }
  function saPublicHolidays(year) {
    const easter = easterSunday(year), addD = (dt, n) => new Date(dt.getTime() + n * 86400000);
    return [
      { date: `${year}-01-01`, name: "New Year's Day" },
      { date: `${year}-01-26`, name: "Australia Day" },
      { date: ymdUTC(nthWeekdayOfMonth(year, 2, 1, 2)), name: "Adelaide Cup Day" },
      { date: ymdUTC(addD(easter, -2)), name: "Good Friday" },
      { date: ymdUTC(addD(easter, -1)), name: "Easter Saturday" },
      { date: ymdUTC(addD(easter, 1)), name: "Easter Monday" },
      { date: `${year}-04-25`, name: "Anzac Day" },
      { date: ymdUTC(nthWeekdayOfMonth(year, 5, 1, 2)), name: "King's Birthday" },
      { date: ymdUTC(nthWeekdayOfMonth(year, 9, 1, 1)), name: "Labour Day" },
      { date: `${year}-12-25`, name: "Christmas Day" },
      { date: `${year}-12-26`, name: "Proclamation Day" },
    ];
  }

  app.get("/api/workforce/public-holidays", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    let q = sb.from("workforce_public_holidays").select("id, holiday_date, name, region").order("holiday_date", { ascending: true });
    if (req.query.from) q = q.gte("holiday_date", req.query.from);
    if (req.query.to) q = q.lte("holiday_date", req.query.to);
    const { data, error } = await q;
    if (error) { if (plannerTableMissing(error)) return ok(res, { holidays: [] }); return err(res, 500, translateDbError(error)); }
    ok(res, { holidays: (data || []).map(r => ({ id: r.id, date: r.holiday_date, name: r.name, region: r.region })) });
  });
  app.post("/api/workforce/public-holidays", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const date = req.body.date, name = (req.body.name || "").trim();
    if (!date || !name) return err(res, 400, "date and name are required");
    const { data, error } = await sb.from("workforce_public_holidays").insert({ holiday_date: date, name, region: req.body.region || "SA", created_by: req.caller.id }).select("id").single();
    if (error) { if (plannerTableMissing(error)) return err(res, 503, "Needs migration 119 applied", "MIGRATION_PENDING"); if (/duplicate|unique/i.test(error.message || "")) return err(res, 409, "That date already has a holiday", "DUPLICATE"); return err(res, 500, translateDbError(error)); }
    ok(res, { holiday: { id: data.id, date, name } });
  });
  app.delete("/api/workforce/public-holidays/:id", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const { error } = await sb.from("workforce_public_holidays").delete().eq("id", req.params.id);
    if (error) return err(res, 500, translateDbError(error));
    ok(res);
  });
  app.post("/api/workforce/public-holidays/seed-sa", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const year = Number(req.query.year) || new Date().getFullYear();
    const rows = saPublicHolidays(year).map(h => ({ holiday_date: h.date, name: h.name, region: "SA", created_by: req.caller.id }));
    const { error } = await sb.from("workforce_public_holidays").upsert(rows, { onConflict: "holiday_date,region", ignoreDuplicates: true });
    if (error) { if (plannerTableMissing(error)) return err(res, 503, "Needs migration 119 applied", "MIGRATION_PENDING"); return err(res, 500, translateDbError(error)); }
    ok(res, { seeded: rows.length, year });
  });

  app.post("/api/workforce/employee-rdo", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const employeeId = req.body.employeeId, rdoDate = req.body.rdoDate;
    if (!isUuid(employeeId) || !rdoDate) return err(res, 400, "employeeId and rdoDate are required");
    const { data, error } = await sb.from("workforce_employee_rdo_dates").insert({ employee_id: employeeId, rdo_date: rdoDate, note: req.body.note || null, created_by: req.caller.id }).select("id").single();
    if (error) { if (plannerTableMissing(error)) return err(res, 503, "Needs migration 119 applied", "MIGRATION_PENDING"); if (/duplicate|unique/i.test(error.message || "")) return err(res, 409, "Already an RDO on that date", "DUPLICATE"); return err(res, 500, translateDbError(error)); }
    ok(res, { rdo: { id: data.id, employeeId, date: rdoDate } });
  });
  app.delete("/api/workforce/employee-rdo/:id", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const { error } = await sb.from("workforce_employee_rdo_dates").delete().eq("id", req.params.id);
    if (error) return err(res, 500, translateDbError(error));
    ok(res);
  });

  app.get("/api/workforce/rdo-patterns", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    let q = sb.from("workforce_rdo_patterns").select("id, employee_id, interval_weeks, weekday, anchor_date, active");
    if (req.query.employeeId) q = q.eq("employee_id", req.query.employeeId);
    const { data, error } = await q;
    if (error) { if (plannerTableMissing(error)) return ok(res, { patterns: [] }); return err(res, 500, translateDbError(error)); }
    ok(res, { patterns: (data || []).map(r => ({ id: r.id, employeeId: r.employee_id, intervalWeeks: r.interval_weeks, weekday: r.weekday, anchorDate: r.anchor_date, active: r.active })) });
  });
  app.post("/api/workforce/rdo-patterns", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const employeeId = req.body.employeeId, weekday = Number(req.body.weekday), intervalWeeks = Number(req.body.intervalWeeks) || 2, anchorDate = req.body.anchorDate;
    if (!isUuid(employeeId) || !anchorDate || !(weekday >= 0 && weekday <= 6)) return err(res, 400, "employeeId, weekday (0-6) and anchorDate are required");
    const { data, error } = await sb.from("workforce_rdo_patterns").insert({ employee_id: employeeId, interval_weeks: Math.min(8, Math.max(1, intervalWeeks)), weekday, anchor_date: anchorDate, created_by: req.caller.id }).select("id").single();
    if (error) { if (plannerTableMissing(error)) return err(res, 503, "Needs migration 119 applied", "MIGRATION_PENDING"); return err(res, 500, translateDbError(error)); }
    ok(res, { pattern: { id: data.id, employeeId, weekday, intervalWeeks, anchorDate } });
  });
  app.delete("/api/workforce/rdo-patterns/:id", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const { error } = await sb.from("workforce_rdo_patterns").delete().eq("id", req.params.id);
    if (error) return err(res, 500, translateDbError(error));
    ok(res);
  });

  // ── Team RDOs (whole-crew days off) — the PRIMARY RDO model (advisory/display only) ──────
  app.get("/api/workforce/team-rdo", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    let q = sb.from("workforce_team_rdo_dates").select("id, rdo_date, note").order("rdo_date", { ascending: true });
    if (req.query.from) q = q.gte("rdo_date", req.query.from);
    if (req.query.to) q = q.lte("rdo_date", req.query.to);
    const { data, error } = await q;
    if (error) { if (plannerTableMissing(error)) return ok(res, { teamRdo: [] }); return err(res, 500, translateDbError(error)); }
    ok(res, { teamRdo: (data || []).map(r => ({ id: r.id, date: r.rdo_date, note: r.note })) });
  });
  app.post("/api/workforce/team-rdo", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const date = req.body.date;
    if (!date) return err(res, 400, "date is required");
    const { data, error } = await sb.from("workforce_team_rdo_dates").insert({ rdo_date: date, note: req.body.note || null, region: req.body.region || "SA", created_by: req.caller.id }).select("id").single();
    if (error) { if (plannerTableMissing(error)) return err(res, 503, "Needs migration 124 applied", "MIGRATION_PENDING"); if (/duplicate|unique/i.test(error.message || "")) return err(res, 409, "That date already has a team RDO", "DUPLICATE"); return err(res, 500, translateDbError(error)); }
    ok(res, { teamRdo: { id: data.id, date } });
  });
  app.patch("/api/workforce/team-rdo/:id", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const upd = {};
    if (req.body.date) upd.rdo_date = req.body.date;
    if ("note" in req.body) upd.note = req.body.note || null;
    if (!Object.keys(upd).length) return err(res, 400, "Nothing to update");
    const { error } = await sb.from("workforce_team_rdo_dates").update(upd).eq("id", req.params.id);
    if (error) { if (/duplicate|unique/i.test(error.message || "")) return err(res, 409, "That date already has a team RDO", "DUPLICATE"); return err(res, 500, translateDbError(error)); }
    ok(res);
  });
  app.delete("/api/workforce/team-rdo/:id", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const { error } = await sb.from("workforce_team_rdo_dates").delete().eq("id", req.params.id);
    if (error) return err(res, 500, translateDbError(error));
    ok(res);
  });
  // Generate a year of team RDOs = the last Friday of each month. Idempotent (skips existing dates).
  // Flags each date that falls within 3 days of a public holiday so admin can review/move it.
  app.post("/api/workforce/team-rdo/generate-yearly", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const year = Number(req.body.year) || new Date().getUTCFullYear();
    const region = req.body.region || "SA";
    const dates = [];
    for (let m = 0; m < 12; m++) {
      const last = new Date(Date.UTC(year, m + 1, 0));        // last day of month m
      last.setUTCDate(last.getUTCDate() - ((last.getUTCDay() - 5 + 7) % 7)); // back up to Friday (5)
      dates.push(ymdUTC(last));
    }
    const rows = dates.map(d => ({ rdo_date: d, region, note: "Team RDO (last Friday)", created_by: req.caller.id }));
    const { error } = await sb.from("workforce_team_rdo_dates").upsert(rows, { onConflict: "rdo_date,region", ignoreDuplicates: true });
    if (error) { if (plannerTableMissing(error)) return err(res, 503, "Needs migration 124 applied", "MIGRATION_PENDING"); return err(res, 500, translateDbError(error)); }
    const { data: hols } = await sb.from("workforce_public_holidays").select("holiday_date, name").gte("holiday_date", `${year}-01-01`).lte("holiday_date", `${year}-12-31`);
    const flagged = dates.map(d => {
      const near = (hols || []).find(h => Math.abs((new Date(`${d}T12:00:00Z`) - new Date(`${h.holiday_date}T12:00:00Z`)) / 86400000) <= 3);
      return { date: d, nearHoliday: near ? near.name : null };
    });
    ok(res, { generated: dates.length, dates: flagged });
  });

  // Combined non-working days for a date range: public holidays + manual RDO + pattern-expanded RDO.
  app.get("/api/workforce/non-working-days", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const from = req.query.from, to = req.query.to;
    if (!from || !to) return err(res, 400, "from and to are required");
    const holRes = await sb.from("workforce_public_holidays").select("holiday_date, name").gte("holiday_date", from).lte("holiday_date", to);
    if (holRes.error) { if (plannerTableMissing(holRes.error)) return ok(res, { holidays: [], rdo: [] }); return err(res, 500, translateDbError(holRes.error)); }
    const rdoRes = await sb.from("workforce_employee_rdo_dates").select("employee_id, rdo_date, note").gte("rdo_date", from).lte("rdo_date", to);
    const patRes = await sb.from("workforce_rdo_patterns").select("employee_id, interval_weeks, weekday, anchor_date").eq("active", true);
    const rdo = (rdoRes.data || []).map(r => ({ employeeId: r.employee_id, date: r.rdo_date, source: "manual", note: r.note }));
    const start = new Date(`${from}T12:00:00Z`), end = new Date(`${to}T12:00:00Z`);
    for (const p of (patRes.data || [])) {
      const anchorWeek = weekIndex(new Date(`${p.anchor_date}T12:00:00Z`));
      for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000)) {
        if (d.getUTCDay() !== p.weekday) continue;
        if ((weekIndex(d) - anchorWeek) % p.interval_weeks === 0) rdo.push({ employeeId: p.employee_id, date: ymdUTC(d), source: "pattern" });
      }
    }
    const teamRes = await sb.from("workforce_team_rdo_dates").select("id, rdo_date, note").gte("rdo_date", from).lte("rdo_date", to);
    const teamRdo = teamRes.error ? [] : (teamRes.data || []).map(r => ({ id: r.id, date: r.rdo_date, note: r.note }));
    ok(res, { holidays: (holRes.data || []).map(h => ({ date: h.holiday_date, name: h.name })), rdo, teamRdo });
  });

  // Generate (or rotate) a worker's magic-link token and return the shareable path. (W01)
  // Admin issues this once per worker and sends them the link; regenerate to revoke the old one.
  app.post("/api/workforce/employees/:id/worker-link", requireAuth, requireRole("admin"), async (req, res) => {
    const sb = getServiceSupabase();
    const { data: emp } = await sb.from("employees").select("id, name, worker_token").eq("id", req.params.id).maybeSingle();
    if (!emp) return res.status(404).json({ ok: false, error: "Employee not found" });
    let token = emp.worker_token;
    if (!token || req.body?.regenerate) {
      token = crypto.randomBytes(24).toString("base64url");
      const { error } = await sb.from("employees").update({ worker_token: token, updated_at: new Date().toISOString() }).eq("id", emp.id);
      if (error) return res.status(500).json({ ok: false, error: error.message });
    }
    res.json({ ok: true, token, path: `/worker?token=${encodeURIComponent(token)}` });
  });

  // ── Worker-facing endpoints ───────────────────────────────────────────────

  async function resolveWorkerEmployee(userId, sb) {
    // 1. Already linked by user_id (the normal case after first login)
    const { data: linked } = await sb.from("employees").select("*").eq("user_id", userId).eq("is_active", true).maybeSingle();
    if (linked) return linked;

    // 2. First login after invite. The invite stores the employee_id in the auth
    //    user's metadata (see POST /employees/:id/invite). Read it and link it back
    //    to employees.user_id so every future lookup hits branch 1.
    const { data: authUser } = await sb.auth.admin.getUserById(userId);
    const metaEmployeeId = authUser?.user?.user_metadata?.employee_id;
    if (metaEmployeeId) {
      const { data: byMeta } = await sb.from("employees").select("*").eq("id", metaEmployeeId).eq("is_active", true).maybeSingle();
      if (byMeta) {
        if (!byMeta.user_id) {
          await sb.from("employees").update({ user_id: userId, updated_at: new Date().toISOString() }).eq("id", byMeta.id);
        }
        return { ...byMeta, user_id: userId };
      }
    }

    return null;
  }

  // Worker auth: accept a per-worker magic-link token (?token= or x-worker-token header)
  // so field workers use the PWA without a Supabase account. Falls back to normal Supabase
  // auth when no token is present (logged-in admin/worker). A token resolves to exactly ONE
  // active employee and grants only that worker's own endpoints — never admin/supervisor ones.
  async function workerAuth(req, res, next) {
    const token = String(req.query.token || req.get("x-worker-token") || "").trim();
    if (token) {
      const sb = getServiceSupabase();
      const { data: emp } = await sb.from("employees").select("*").eq("worker_token", token).eq("is_active", true).maybeSingle();
      if (emp) { req.workerEmployee = emp; return next(); }
      return res.status(401).json({ ok: false, error: "This worker link is invalid or has been reset." });
    }
    // No worker token → authenticate as a console user. An admin/supervisor may then PREVIEW a
    // specific worker's view (read-only) by passing previewEmployeeId, so the office sees exactly
    // what that worker sees in the PWA. Preview is GET-only and never uses the worker's live token —
    // it can never submit hours, edit timesheets, complete tasks, or upload photos as the worker.
    return requireAuth(req, res, async () => {
      const previewId = String(req.query.previewEmployeeId || req.get("x-preview-employee-id") || "").trim();
      if (!previewId) return next();
      // Full worker-view preview is a DIRECTOR (admin) tool only. Admins already see every
      // employee's timesheets/tasks/photos across the console, so previewing grants no new data.
      // Supervisors are deliberately excluded from the full impersonated view (read-only or not).
      if (req.caller?.role !== "admin") {
        return res.status(403).json({ ok: false, error: "Forbidden" });
      }
      if (!isUuid(previewId)) {
        return res.status(400).json({ ok: false, error: "Invalid employee id." });
      }
      // Preview is read-only for everything EXCEPT reordering the task list: a low-risk,
      // sort_order-only change, and preview is already admin-gated above — so an admin can
      // curate the on-site task order from their phone. Every other write stays blocked.
      const isReorder = req.method === "PUT" && req.path === "/api/worker/tasks/reorder";
      if (req.method !== "GET" && !isReorder) {
        return res.status(403).json({ ok: false, error: "Read-only preview — you can't submit or complete work as a worker." });
      }
      const sb = getServiceSupabase();
      const { data: emp } = await sb.from("employees").select("*").eq("id", previewId).eq("is_active", true).maybeSingle();
      if (!emp) return res.status(404).json({ ok: false, error: "Employee not found." });
      req.workerEmployee = emp;
      req.workerPreview = true;
      return next();
    });
  }

  app.get("/api/worker/me", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return res.status(403).json({ ok: false, error: "No employee record found" });

    const today = todayYmd();
    const yesterday = addDaysYmd(today, -1);
    const monStr = weekStart(today);

    const [todayTs, yesterdayTs, weekEntries, settings] = await Promise.all([
      sb.from("timesheets").select("*, timesheet_entries(id, task_category, phase, hours, notes, completion_photo_url)").eq("employee_id", emp.id).eq("date", today).maybeSingle(),
      sb.from("timesheets").select("project_id, carpentry_job_id, projects(id, address)").eq("employee_id", emp.id).eq("date", yesterday).maybeSingle(),
      sb.from("timesheet_entries").select("hours, timesheets!inner(employee_id, date, status)").eq("timesheets.employee_id", emp.id).gte("timesheets.date", monStr).in("timesheets.status", ["submitted", "approved"]),
      sb.from("workforce_settings").select("*").limit(1).single(),
    ]);

    const weeklyHours = (weekEntries.data || []).reduce((s, e) => s + Number(e.hours || 0), 0);

    // Open-task badge count. If the PWA passes the worker's currently-selected job
    // (?jobId&jobType) the badge follows that job so it always matches the Site-tasks
    // list. With no selection (first home load) fall back to the latest-timesheet
    // context purely for the badge — never for the task list itself.
    let openTaskCount = 0;
    const selJobId = (req.query.jobId || "").trim();
    const selJobType = (req.query.jobType || "").trim();
    const currentProjectId = todayTs.data?.project_id || yesterdayTs.data?.project_id || null;
    const currentCarpentryJobId = todayTs.data?.carpentry_job_id || yesterdayTs.data?.carpentry_job_id || null;

    const selJobTypeOk = !selJobType || WORKER_JOB_TYPES.includes(selJobType);
    let selJobAllowed = false;
    if (selJobId && isUuid(selJobId) && selJobTypeOk) {
      const vis = await workerVisibleJobs(sb, emp.id);
      selJobAllowed = workerMaySeeJob(vis, selJobId, selJobType);
    }
    // Multi-assign: count open tasks the worker actually sees (shared OR they're on it). Fetch +
    // filter in JS (small volume) — a COUNT can't express the join predicate. Also fixes the old
    // fallback path that skipped the visibility filter entirely.
    const countVisibleOpen = async (buildFilter) => {
      let q = sb.from("site_tasks").select("id, assigned_to").in("status", ["open", "in_progress"]);
      q = buildFilter(q);
      const { data: rows } = await q;
      const withA = await attachAssigneesFromDb(sb, rows || []);
      return withA.filter((t) => visibleToWorker(t.assignees, emp.id)).length;
    };
    if (selJobAllowed) {
      openTaskCount = await countVisibleOpen((q) =>
        selJobType === "carpentry" ? q.eq("carpentry_job_id", selJobId)
          : selJobType === "project" ? q.eq("project_id", selJobId)
            : q.or(`project_id.eq.${selJobId},carpentry_job_id.eq.${selJobId}`));
    } else if (currentProjectId || currentCarpentryJobId) {
      openTaskCount = await countVisibleOpen((q) =>
        (currentProjectId && currentCarpentryJobId) ? q.or(`project_id.eq.${currentProjectId},carpentry_job_id.eq.${currentCarpentryJobId}`)
          : currentProjectId ? q.eq("project_id", currentProjectId)
            : q.eq("carpentry_job_id", currentCarpentryJobId));
    }

    // Return employee without rate
    const { hourly_rate: _r, overtime_multiplier: _om, double_time_multiplier: _dm, worker_token: _wt, ...safeEmp } = emp;

    res.json({
      ok: true,
      employee: safeEmp,
      today_timesheet: todayTs.data || null,
      yesterday_project: yesterdayTs.data?.projects || null,
      weekly_hours: Math.round(weeklyHours * 100) / 100,
      open_task_count: openTaskCount,
      current_project_id: currentProjectId,
      settings: settings.data || null,
    });
  });

  app.get("/api/worker/projects", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return res.status(403).json({ ok: false, error: "No employee record found" });

    // Fetch construction projects AND carpentry jobs in parallel
    const [projRes, carpRes] = await Promise.all([
      sb.from("projects").select("id, address, job_id, status").order("address", { ascending: true }),
      sb.from("carpentry_jobs").select("id, address, client_name, status").order("address", { ascending: true }),
    ]);
    if (projRes.error) return res.status(500).json({ ok: false, error: projRes.error.message });

    const projects = (projRes.data || []).map(p => ({ ...p, type: "project" }));
    // Carpentry jobs surface as sites — show "address (client)" for clarity
    const carpJobs = (carpRes.data || []).map(j => ({
      id: j.id,
      address: j.client_name ? `${j.address} (${j.client_name})` : j.address,
      status: j.status,
      type: "carpentry",
    }));

    // Active sites first, then alphabetical within each bucket
    const list = [...projects, ...carpJobs].sort((a, b) => {
      const aActive = a.status === "active" ? 0 : 1;
      const bActive = b.status === "active" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return a.address.localeCompare(b.address);
    });

    res.json({ ok: true, projects: list });
  });

  // Job picker for the Worker PWA Site-tasks screen (W-fix). Returns the jobs a
  // worker would pick from — every ACTIVE project/carpentry job, PLUS any job the
  // worker has logged hours on in the last 90 days (so a recently-finished site
  // they still owe tasks on stays available). "recent" jobs sort first so the
  // common case (the site I'm on now) is one tap. This replaces the old implicit
  // "infer the job from the latest timesheet" behaviour that hid freshly-added tasks.
  // Jobs a worker may access: active projects + active carpentry jobs, PLUS any
  // job they logged a timesheet against in the last 90 days. This is the single
  // source of truth for BOTH the job picker AND authorising task reads — the
  // worker endpoints run with the service role (RLS bypassed), so a UUID-valid
  // jobId must still be checked against this set or any worker could enumerate
  // every job's tasks/photos by guessing ids.
  async function workerVisibleJobs(sb, empId) {
    const since = addDaysYmd(todayYmd(), -90);
    const [projRes, carpRes, tsRes] = await Promise.all([
      sb.from("projects").select("id, address, status").order("address", { ascending: true }),
      sb.from("carpentry_jobs").select("id, address, client_name, status").order("address", { ascending: true }),
      sb.from("timesheets").select("project_id, carpentry_job_id").eq("employee_id", empId).gte("date", since),
    ]);
    const recentProj = new Set();
    const recentCarp = new Set();
    for (const t of tsRes.data || []) {
      if (t.project_id) recentProj.add(t.project_id);
      if (t.carpentry_job_id) recentCarp.add(t.carpentry_job_id);
    }
    const projects = (projRes.data || [])
      .map(p => ({ id: p.id, address: p.address, status: p.status, type: "project", recent: recentProj.has(p.id) }))
      .filter(p => p.status === "active" || p.recent);
    const carpJobs = (carpRes.data || [])
      .map(j => ({ id: j.id, address: j.client_name ? `${j.address} (${j.client_name})` : j.address, status: j.status, type: "carpentry", recent: recentCarp.has(j.id) }))
      .filter(j => j.status === "active" || j.recent);
    return {
      error: projRes.error,
      projects,
      carpJobs,
      projectIds: new Set(projects.map(p => p.id)),
      carpentryIds: new Set(carpJobs.map(j => j.id)),
    };
  }

  function workerMaySeeJob(vis, jobId, jobType) {
    if (jobType === "carpentry") return vis.carpentryIds.has(jobId);
    if (jobType === "project") return vis.projectIds.has(jobId);
    return vis.projectIds.has(jobId) || vis.carpentryIds.has(jobId);
  }

  // A charge-up SITE (charge_up_jobs) owns its own tasks/plans but is not itself a visible job — it is
  // authorised via its parent BL-CHARGEUP carpentry job. Returns that parent carpentry_job_id when the
  // site is active and the worker may see the parent, else null.
  async function workerChargeUpSiteParent(sb, vis, chargeUpJobId) {
    if (!chargeUpJobId || !isUuid(chargeUpJobId)) return null;
    const { data: site } = await sb.from("charge_up_jobs").select("carpentry_job_id, status").eq("id", chargeUpJobId).maybeSingle();
    if (!site || site.status !== "active") return null;
    return workerMaySeeJob(vis, site.carpentry_job_id, "carpentry") ? site.carpentry_job_id : null;
  }

  // Worker WRITE-guard: may this worker act on (complete/photo/edit) THIS task? The list/preview
  // paths are job-gated (workerVisibleJobs), but the write endpoints previously authorised on
  // assignee-visibility alone — so a shared (unassigned) task on a job the worker isn't on could
  // be actioned by id. Resolve the task's job and gate on membership, matching the list paths.
  // A charge-up site task (owned by charge_up_job_id) is authorised via its parent job. { found, allowed }.
  async function workerMayActOnTask(sb, empId, taskId) {
    const { data: t } = await sb.from("site_tasks").select("project_id, carpentry_job_id, charge_up_job_id").eq("id", taskId).maybeSingle();
    if (!t) return { found: false, allowed: false };
    const vis = await workerVisibleJobs(sb, empId);
    if (vis.error) return { found: true, allowed: false };
    if (t.charge_up_job_id) {
      const parent = await workerChargeUpSiteParent(sb, vis, t.charge_up_job_id);
      return { found: true, allowed: !!parent };
    }
    const jobId = t.carpentry_job_id || t.project_id || null;
    const jobType = t.carpentry_job_id ? "carpentry" : "project";
    if (!jobId) return { found: true, allowed: false };
    return { found: true, allowed: workerMaySeeJob(vis, jobId, jobType) };
  }

  app.get("/api/worker/jobs", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return res.status(403).json({ ok: false, error: "No employee record found" });

    const vis = await workerVisibleJobs(sb, emp.id);
    if (vis.error) return res.status(500).json({ ok: false, error: vis.error.message });

    const list = [...vis.projects, ...vis.carpJobs].sort((a, b) => {
      if (a.recent !== b.recent) return a.recent ? -1 : 1;
      const aActive = a.status === "active" ? 0 : 1;
      const bActive = b.status === "active" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return a.address.localeCompare(b.address);
    });

    res.json({ ok: true, jobs: list });
  });

  app.post("/api/worker/timesheets", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return res.status(403).json({ ok: false, error: "No employee record found" });

    const { date, project_id, job_id, carpentry_job_id, charge_up_job_id, entries } = req.body;
    if (!date || !Array.isArray(entries) || !entries.length) {
      return res.status(400).json({ ok: false, error: "date and entries[] required" });
    }
    if (!project_id && !carpentry_job_id) {
      return res.status(400).json({ ok: false, error: "Select a site or job before submitting." });
    }
    // Tolerate timezones ahead of UTC (e.g. AEST +10): the worker's local "today" can be
    // a calendar day ahead of the server's UTC date, so allow up to UTC + 1 day.
    const maxDate = addDaysYmd(todayYmd(), 1);
    if (date > maxDate) {
      return res.status(400).json({ ok: false, error: "Cannot log hours for a future date" });
    }
    // Per-entry hours validation (server-side; client clamps are not trusted).
    const hoursError = validateEntryHours(entries);
    if (hoursError) {
      return res.status(400).json({ ok: false, error: hoursError });
    }
    if (entries.reduce((s, e) => s + Number(e.hours), 0) > 24) {
      return res.status(400).json({ ok: false, error: "Total hours for one day cannot exceed 24" });
    }
    // Validate every entry's category. Base set = the 8 workforce streams (+ "other"); for a carpentry
    // job, ALSO accept that job's LABOUR budget cost categories (budgetTaskCategory) so any budgeted
    // area — e.g. "AAC and foam supply and installation" — is loggable, not just the built-in 8.
    let allowedCats = new Set(TASK_CATEGORIES);
    if (carpentry_job_id) {
      const { data: budgetCats } = await sb.from("carpentry_job_budgets")
        .select("category_name, workforce_task_category").eq("job_id", carpentry_job_id).eq("cost_type", "labour");
      for (const b of budgetCats || []) allowedCats.add(budgetTaskCategory(b));
    }
    if (entries.some(e => !allowedCats.has(e.task_category))) {
      return res.status(400).json({ ok: false, error: "Invalid task category" });
    }

    // Worker job-visibility validation: the worker may only log hours against a job
    // that is visible/assignable to them. Carpentry job wins if both are supplied.
    {
      const jobType = carpentry_job_id ? "carpentry" : "project";
      const jobId = carpentry_job_id || project_id;
      const vis = await workerVisibleJobs(sb, emp.id);
      if (vis.error) return res.status(500).json({ ok: false, error: translateDbError(vis.error) });
      if (!workerMaySeeJob(vis, jobId, jobType)) {
        return res.status(403).json({ ok: false, error: "You don't have access to this job." });
      }
    }

    // BLB Charge Up: if the carpentry job HAS active charge-up sites, a location is required
    // and must belong to this job. Jobs without sites (or before mig 145) log untagged as before.
    let chargeUpJobId = null;
    if (carpentry_job_id) {
      const { data: siteRows, error: siteErr } = await sb.from("charge_up_jobs")
        .select("id").eq("carpentry_job_id", carpentry_job_id).eq("status", "active");
      if (!siteErr && (siteRows || []).length) {
        if (charge_up_job_id && siteRows.some((s) => s.id === charge_up_job_id)) chargeUpJobId = charge_up_job_id;
        if (!chargeUpJobId) return res.status(400).json({ ok: false, error: "Pick a location before submitting charge-up work." });
      }
    }

    // Sub-task spine (Phase 1, mig 147): a carpentry labour entry attributes to a budget SUB-TASK
    // (task_category, canonical_key). Required when the job's category has confirmed sub-tasks.
    // Gated on a column probe so it fails soft (logs coarse, as before) until mig 147 is applied.
    let subtaskKeysByCat = null;   // Map task_category -> Set(canonical_key)
    let hasCanonicalCol = false;
    if (carpentry_job_id) {
      const { error: probeErr } = await sb.from("timesheet_entries").select("canonical_key").limit(1);
      hasCanonicalCol = !probeErr;
      if (hasCanonicalCol) {
        const { data: liRows } = await sb.from("carpentry_budget_line_items")
          .select("task_category, canonical_key").eq("job_id", carpentry_job_id).eq("status", "confirmed")
          .not("task_category", "is", null).not("canonical_key", "is", null);
        subtaskKeysByCat = new Map();
        for (const r of liRows || []) {
          if (!subtaskKeysByCat.has(r.task_category)) subtaskKeysByCat.set(r.task_category, new Set());
          subtaskKeysByCat.get(r.task_category).add(r.canonical_key);
        }
        for (const e of entries) {
          const avail = subtaskKeysByCat.get(e.task_category);
          if (avail && avail.size) {   // this category HAS sub-tasks → one must be picked
            if (!e.canonical_key) return res.status(400).json({ ok: false, error: `Pick a sub-task for ${TASK_LABELS[e.task_category] || e.task_category} before submitting.` });
            if (!avail.has(e.canonical_key)) return res.status(400).json({ ok: false, error: "That sub-task isn't part of this job." });
          }
        }
      }
    }

    // Check existing timesheet for today
    const { data: existing } = await sb.from("timesheets").select("id, status").eq("employee_id", emp.id).eq("date", date).maybeSingle();
    if (existing && existing.status === "approved") {
      return res.status(409).json({ ok: false, error: "Timesheet already approved" });
    }

    let timesheetId = existing?.id;
    if (!timesheetId) {
      const { data: ts, error: tsErr } = await sb.from("timesheets").insert({
        employee_id: emp.id, date,
        project_id: project_id || null,
        job_id: job_id || null,
        carpentry_job_id: carpentry_job_id || null,
        status: "submitted",
        submitted_at: new Date().toISOString(),
      }).select("id").single();
      if (tsErr) return res.status(500).json({ ok: false, error: translateDbError(tsErr) });
      timesheetId = ts.id;
    } else {
      await sb.from("timesheets").update({
        project_id: project_id || null,
        job_id: job_id || null,
        carpentry_job_id: carpentry_job_id || null,
        status: "submitted",
        submitted_at: new Date().toISOString(),
        rejection_notes: null,
        updated_at: new Date().toISOString(),
      }).eq("id", timesheetId);
      // Clear old entries on resubmit
      await sb.from("timesheet_entries").delete().eq("timesheet_id", timesheetId);
    }

    // P3: sub-task allocation — only accept budget_line_item_id values that belong to THIS carpentry
    // job (guards cross-job ids + FK errors). Any other value falls back to null (rolls to the category).
    let validLineIds = null;
    if (carpentry_job_id && entries.some(e => e.budget_line_item_id)) {
      const { data: liRows } = await sb.from("carpentry_budget_line_items").select("id").eq("job_id", carpentry_job_id);
      validLineIds = new Set((liRows || []).map(r => r.id));
    }
    // Insert entries
    const entryRows = entries.map(e => {
      const row = {
        timesheet_id: timesheetId,
        employee_id: emp.id,
        task_category: e.task_category,
        budget_line_item_id: (validLineIds && e.budget_line_item_id && validLineIds.has(e.budget_line_item_id)) ? e.budget_line_item_id : null,
        phase: TASK_PHASE_MAP[e.task_category] || "general",
        hours: Number(e.hours),
        overtime_hours: 0,
        notes: e.notes || null,
        completion_photo_url: e.completion_photo_url || null,
      };
      // Only include the charge-up site column when a site was picked — chargeUpJobId is only
      // non-null when mig 145 is applied + sites exist, so this never references a missing column.
      if (chargeUpJobId) row.charge_up_job_id = chargeUpJobId;
      // Sub-task attribution — only written when mig 147 is applied AND the picked key belongs to
      // this job's category (so the column is never referenced pre-migration).
      if (hasCanonicalCol && e.canonical_key && subtaskKeysByCat?.get(e.task_category)?.has(e.canonical_key)) {
        row.canonical_key = e.canonical_key;
      }
      return row;
    });
    const { error: entryErr } = await sb.from("timesheet_entries").insert(entryRows);
    if (entryErr) return res.status(500).json({ ok: false, error: translateDbError(entryErr) });

    res.json({ ok: true, timesheet_id: timesheetId });
  });

  // Job's confirmed sub-tasks for the two-level PWA timesheet picker — grouped by the parent
  // task_category. One option per canonical_key (distinct sub-task), with a representative line-item
  // id for the worker's time to attach to. Labour only; fail-soft if migration 140 isn't applied.
  // ── Job PLANS (F1) — uploaded into the Hub → Supabase Storage → shown on the PWA ──────
  // A "plan" = job_documents row: storage_provider='supabase', status='current', a plan
  // document_type, audience_layer='worker'. mig 152 adds the carpentry spine + 'job-plans' bucket.
  // Supersession is EXPLICIT (uploader names the target), never inferred.
  const PLAN_DOC_TYPES = ["architectural", "engineering", "structural", "survey", "specification", "plan"];
  const PLANS_BUCKET = "job-plans";
  // Only a genuinely-missing mig-152 spine (carpentry_job_id) / table / bucket counts as "not enabled".
  // A different missing column must surface as a real error, not be masked as migrationPending.
  const isMissingPlanCol = (e) => /carpentry_job_id.*does not exist|charge_up_job_id.*does not exist|schema cache|relation .* does not exist|bucket .* not found|Bucket not found/i.test(String(e?.message || e || ""));
  const sanitizePlanName = (n) => (String(n || "plan.pdf").toLowerCase().replace(/[^a-z0-9.\-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 120) || "plan.pdf");

  async function listCurrentPlans(sb, spine) {
    // NOTE: job_documents (mig 069) has NO created_at column — order/select by uploaded_at only.
    let q = sb.from("job_documents")
      .select("id, document_type, title, version, uploaded_at")
      .eq("status", "current").eq("storage_provider", "supabase").in("document_type", PLAN_DOC_TYPES);
    q = spine.chargeUpJobId ? q.eq("charge_up_job_id", spine.chargeUpJobId)
      : spine.carpentryJobId ? q.eq("carpentry_job_id", spine.carpentryJobId)
      : q.eq("job_id", spine.jobId);
    const { data, error } = await q.order("document_type").order("uploaded_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((r) => ({ docId: r.id, fileName: r.title, documentType: r.document_type, uploadedAt: r.uploaded_at }));
  }
  async function uploadPlan(sb, spine, body, callerId) {
    const fileName = sanitizePlanName(body.fileName);
    const b64 = String(body.fileBase64 || "").replace(/^data:[^;]+;base64,/, "");
    if (!b64) throw new Error("No file provided");
    const buffer = Buffer.from(b64, "base64");
    const documentType = PLAN_DOC_TYPES.includes(body.documentType) ? body.documentType : "plan";
    const dir = spine.chargeUpJobId ? `charge-up/${spine.chargeUpJobId}`
      : spine.carpentryJobId ? `carpentry/${spine.carpentryJobId}`
      : `job/${spine.jobId}`;
    const path = `${dir}/${todayYmd()}-${crypto.randomUUID().slice(0, 8)}-${fileName}`;
    const { error: upErr } = await sb.storage.from(PLANS_BUCKET).upload(path, buffer, { contentType: "application/pdf", upsert: false });
    if (upErr) throw upErr;
    const supersedes = body.supersedesDocumentId && isUuid(body.supersedesDocumentId) ? body.supersedesDocumentId : null;
    if (supersedes) await sb.from("job_documents").update({ status: "superseded" }).eq("id", supersedes);
    const rev = String(body.revision || "").trim();
    const row = {
      job_id: spine.jobId || null, carpentry_job_id: spine.carpentryJobId || null, charge_up_job_id: spine.chargeUpJobId || null,
      document_type: documentType, title: rev ? `${fileName} — ${rev}` : fileName,
      storage_provider: "supabase", storage_path: `${PLANS_BUCKET}/${path}`, audience_layer: "worker",
      status: "current", supersedes_document_id: supersedes, uploaded_by: callerId || null, uploaded_at: new Date().toISOString(),
    };
    const { data, error } = await sb.from("job_documents").insert(row).select("id, title").maybeSingle();
    if (error) throw error;
    return { docId: data?.id, title: data?.title };
  }
  async function signPlan(sb, storagePath) {
    const [bucket, ...rest] = String(storagePath).split("/");
    const { data, error } = await sb.storage.from(bucket).createSignedUrl(rest.join("/"), 60);
    if (error) throw error;
    return data.signedUrl;
  }
  async function resolveProjectJobId(sb, projectId) {
    const { data } = await sb.from("projects").select("job_id").eq("id", projectId).maybeSingle();
    return data?.job_id || null;
  }

  // Admin/supervisor — carpentry job plans
  app.get("/api/carpentry/jobs/:id/plans", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase(); if (!sb) return err(res, 503, "Database not configured");
    if (!isUuid(req.params.id)) return err(res, 400, "Invalid job id");
    try { return ok(res, { plans: await listCurrentPlans(sb, { carpentryJobId: req.params.id }) }); }
    catch (e) { if (isMissingPlanCol(e)) return ok(res, { plans: [], migrationPending: true }); console.error("[plans GET carp]", e?.message || e); return err(res, 500, "Could not load plans"); }
  });
  app.post("/api/carpentry/jobs/:id/plans", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase(); if (!sb) return err(res, 503, "Database not configured");
    if (!isUuid(req.params.id)) return err(res, 400, "Invalid job id");
    try { return ok(res, await uploadPlan(sb, { carpentryJobId: req.params.id }, req.body || {}, req.caller?.id)); }
    catch (e) { if (isMissingPlanCol(e)) return err(res, 503, "Plans aren't enabled yet — apply migration 152", "MIGRATION_PENDING"); console.error("[plans POST carp]", e?.message || e); return err(res, 500, translateDbError(e)); }
  });
  // Admin/supervisor — construction project plans (resolve project → job_id)
  app.get("/api/projects/:id/plans", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase(); if (!sb) return err(res, 503, "Database not configured");
    if (!isUuid(req.params.id)) return err(res, 400, "Invalid project id");
    const jobId = await resolveProjectJobId(sb, req.params.id);
    if (!jobId) return err(res, 409, "This project has no linked job to hold plans.");
    try { return ok(res, { plans: await listCurrentPlans(sb, { jobId }) }); }
    catch (e) { if (isMissingPlanCol(e)) return ok(res, { plans: [], migrationPending: true }); console.error("[plans GET proj]", e?.message || e); return err(res, 500, "Could not load plans"); }
  });
  app.post("/api/projects/:id/plans", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase(); if (!sb) return err(res, 503, "Database not configured");
    if (!isUuid(req.params.id)) return err(res, 400, "Invalid project id");
    const jobId = await resolveProjectJobId(sb, req.params.id);
    if (!jobId) return err(res, 409, "This project has no linked job to hold plans.");
    try { return ok(res, await uploadPlan(sb, { jobId }, req.body || {}, req.caller?.id)); }
    catch (e) { if (isMissingPlanCol(e)) return err(res, 503, "Plans aren't enabled yet — apply migration 152", "MIGRATION_PENDING"); console.error("[plans POST proj]", e?.message || e); return err(res, 500, translateDbError(e)); }
  });
  // Admin/supervisor — BLB Charge Up SITE plans (per-site, mig 172). A site owns its own plans just
  // like a normal job — same uploadPlan/listCurrentPlans, scoped by charge_up_job_id.
  app.get("/api/charge-up/sites/:siteId/plans", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase(); if (!sb) return err(res, 503, "Database not configured");
    if (!isUuid(req.params.siteId)) return err(res, 400, "Invalid site id");
    try { return ok(res, { plans: await listCurrentPlans(sb, { chargeUpJobId: req.params.siteId }) }); }
    catch (e) { if (isMissingPlanCol(e)) return ok(res, { plans: [], migrationPending: true }); console.error("[plans GET charge-up]", e?.message || e); return err(res, 500, "Could not load plans"); }
  });
  app.post("/api/charge-up/sites/:siteId/plans", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase(); if (!sb) return err(res, 503, "Database not configured");
    if (!isUuid(req.params.siteId)) return err(res, 400, "Invalid site id");
    try { return ok(res, await uploadPlan(sb, { chargeUpJobId: req.params.siteId }, req.body || {}, req.caller?.id)); }
    catch (e) { if (isMissingPlanCol(e)) return err(res, 503, "Charge-up plans aren't enabled yet — apply migration 172", "MIGRATION_PENDING"); console.error("[plans POST charge-up]", e?.message || e); return err(res, 500, translateDbError(e)); }
  });
  // Admin/supervisor — remove a plan (storage object + row) and view (signed URL)
  app.delete("/api/job-plans/:docId", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase(); if (!sb) return err(res, 503, "Database not configured");
    const { data: doc } = await sb.from("job_documents").select("id, storage_path, storage_provider").eq("id", req.params.docId).maybeSingle();
    if (!doc) return err(res, 404, "Plan not found", "NOT_FOUND");
    if (doc.storage_provider === "supabase" && doc.storage_path) {
      const [bucket, ...rest] = doc.storage_path.split("/");
      await sb.storage.from(bucket).remove([rest.join("/")]).catch(() => {});
    }
    await sb.from("job_documents").delete().eq("id", req.params.docId);
    return ok(res);
  });
  app.get("/api/job-plans/:docId/download", requireAuth, async (req, res) => {
    const sb = getServiceSupabase(); if (!sb) return err(res, 503, "Database not configured");
    const { data: doc } = await sb.from("job_documents").select("storage_path, storage_provider").eq("id", req.params.docId).maybeSingle();
    if (!doc?.storage_path || doc.storage_provider !== "supabase") return err(res, 404, "Plan not available");
    try { return ok(res, { signedUrl: await signPlan(sb, doc.storage_path), expiresIn: 60 }); }
    catch { return err(res, 500, "Could not generate a download link"); }
  });
  // Worker — current plans for a job they can see, + a signed download (access-gated)
  app.get("/api/worker/jobs/:id/plans", workerAuth, async (req, res) => {
    const sb = getServiceSupabase(); if (!sb) return err(res, 503, "Database not configured");
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return err(res, 403, "No employee record found.");
    if (!isUuid(req.params.id)) return err(res, 400, "Invalid job id");
    const jobType = req.query.jobType === "carpentry" ? "carpentry" : "project";
    // Charge Up: a picked site (charge_up_job_id) owns its own plans — authorised via its parent job.
    const chargeUpJobId = String(req.query.chargeUpJobId || "").trim();
    if (chargeUpJobId && !isUuid(chargeUpJobId)) return err(res, 400, "Invalid site id");
    const vis = await workerVisibleJobs(sb, emp.id);
    if (vis.error) return err(res, 500, translateDbError(vis.error));
    if (!workerMaySeeJob(vis, req.params.id, jobType)) return err(res, 403, "You don't have access to this job.");
    if (chargeUpJobId && !(await workerChargeUpSiteParent(sb, vis, chargeUpJobId))) return err(res, 403, "You don't have access to this site.");
    try {
      let spine;
      if (chargeUpJobId) spine = { chargeUpJobId };
      else if (jobType === "carpentry") spine = { carpentryJobId: req.params.id };
      else { const jobId = await resolveProjectJobId(sb, req.params.id); if (!jobId) return ok(res, { plans: [] }); spine = { jobId }; }
      return ok(res, { plans: await listCurrentPlans(sb, spine) });
    } catch (e) { if (isMissingPlanCol(e)) return ok(res, { plans: [], migrationPending: true }); console.error("[worker plans GET]", e?.message || e); return err(res, 500, "Could not load plans"); }
  });
  app.get("/api/worker/plans/:docId/download", workerAuth, async (req, res) => {
    const sb = getServiceSupabase(); if (!sb) return err(res, 503, "Database not configured");
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return err(res, 403, "No employee record found.");
    const { data: doc } = await sb.from("job_documents").select("*").eq("id", req.params.docId).maybeSingle();
    if (!doc || doc.storage_provider !== "supabase" || !doc.storage_path) return err(res, 404, "Plan not available");
    const vis = await workerVisibleJobs(sb, emp.id);
    if (vis.error) return err(res, 500, translateDbError(vis.error));
    let allowed = false;
    if (doc.charge_up_job_id) allowed = !!(await workerChargeUpSiteParent(sb, vis, doc.charge_up_job_id));
    else if (doc.carpentry_job_id) allowed = workerMaySeeJob(vis, doc.carpentry_job_id, "carpentry");
    else if (doc.job_id && vis.projectIds?.size) {
      const { data: ps } = await sb.from("projects").select("id").eq("job_id", doc.job_id).in("id", [...vis.projectIds]);
      allowed = (ps || []).length > 0;
    }
    if (!allowed) return err(res, 403, "You don't have access to this plan.");
    try { return ok(res, { signedUrl: await signPlan(sb, doc.storage_path), expiresIn: 60 }); }
    catch { return err(res, 500, "Could not generate a download link"); }
  });

  app.get("/api/worker/jobs/:id/subtasks", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return err(res, 403, "No employee record found.");
    const jobId = String(req.params.id || "");
    if (!isUuid(jobId)) return err(res, 400, "Invalid job id.");
    try {
      const vis = await workerVisibleJobs(sb, emp.id);
      if (!vis.error && !workerMaySeeJob(vis, jobId, "carpentry")) return err(res, 403, "You don't have access to this job.");

      // BLB Charge Up (reference BL-CHARGEUP): the "sub-tasks" are its sites (charge_up_jobs),
      // which the worker picks as a Location instead of a budget sub-task.
      let chargeUpSites = [];
      const { data: jobRow } = await sb.from("carpentry_jobs").select("reference").eq("id", jobId).maybeSingle();
      if (jobRow?.reference === "BL-CHARGEUP") {
        const { data: sites } = await sb.from("charge_up_jobs").select("id, site_label, address")
          .eq("carpentry_job_id", jobId).eq("status", "active").order("sort_order").order("site_label");
        chargeUpSites = (sites || []).map((s) => ({ id: s.id, label: s.site_label, address: s.address || null }));
      }

      // Loggable parent categories = this job's LABOUR budget cost categories (so any budgeted area
      // is loggable, e.g. "AAC and foam supply and installation" — not just the built-in 8). value =
      // the mapped workforce stream, else a slug of the name; label = the actual budget category name.
      let categories = [];
      const { data: budgetCats } = await sb.from("carpentry_job_budgets")
        .select("category_name, workforce_task_category, sort_order")
        .eq("job_id", jobId).eq("cost_type", "labour").order("sort_order");
      const seenCat = new Set();
      for (const b of budgetCats || []) {
        const value = budgetTaskCategory(b);
        if (seenCat.has(value)) continue;
        seenCat.add(value);
        categories.push({ value, label: b.category_name });
      }

      const { data: rows, error } = await sb
        .from("carpentry_budget_line_items")
        .select("id, task_category, canonical_key, description, sort_order")
        .eq("job_id", jobId).eq("status", "confirmed")
        .not("task_category", "is", null).not("canonical_key", "is", null)
        .order("sort_order");
      if (error) return ok(res, { subtasks: {}, chargeUpSites, categories }); // line-items table missing → still return sites + categories
      const byCat = {};
      for (const r of rows || []) {
        const m = (byCat[r.task_category] ||= new Map());
        if (!m.has(r.canonical_key)) {
          const opt = catalogueFor({ parentTaskCategory: r.task_category, costType: "labour" }).find((o) => o.key === r.canonical_key);
          m.set(r.canonical_key, { key: r.canonical_key, label: opt?.label || r.description || r.canonical_key, budgetLineItemId: r.id });
        }
      }
      const subtasks = {};
      for (const [cat, m] of Object.entries(byCat)) subtasks[cat] = [...m.values()];
      return ok(res, { subtasks, chargeUpSites, categories });
    } catch (e) {
      console.error("[worker/jobs subtasks]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // Office sibling of the worker /subtasks map — a carpentry job's confirmed budget SUB-TASKS per
  // category (canonical_key → label), so Approvals can show + edit an entry's sub-task (e.g. Wall framing).
  app.get("/api/carpentry/jobs/:id/subtasks", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const jobId = String(req.params.id || "");
    if (!isUuid(jobId)) return err(res, 400, "Invalid job id.");
    try {
      const { data: rows, error } = await sb
        .from("carpentry_budget_line_items")
        .select("id, task_category, canonical_key, description, sort_order")
        .eq("job_id", jobId).eq("status", "confirmed")
        .not("task_category", "is", null).not("canonical_key", "is", null)
        .order("sort_order");
      if (error) return ok(res, { subtasks: {} }); // line-items table missing → no sub-tasks
      const byCat = {};
      for (const r of rows || []) {
        const m = (byCat[r.task_category] ||= new Map());
        if (!m.has(r.canonical_key)) {
          const opt = catalogueFor({ parentTaskCategory: r.task_category, costType: "labour" }).find((o) => o.key === r.canonical_key);
          m.set(r.canonical_key, { key: r.canonical_key, label: opt?.label || r.description || r.canonical_key, budgetLineItemId: r.id });
        }
      }
      const subtasks = {};
      for (const [cat, m] of Object.entries(byCat)) subtasks[cat] = [...m.values()];
      return ok(res, { subtasks });
    } catch (e) {
      console.error("[carpentry/jobs subtasks]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // WHS: the SWMS a worker must sign for a carpentry job, with their own sign-on status.
  app.get("/api/worker/jobs/:id/swms", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return err(res, 403, "No employee record found.");
    const jobId = String(req.params.id || "");
    if (!isUuid(jobId)) return err(res, 400, "Invalid job id.");
    try {
      const vis = await workerVisibleJobs(sb, emp.id);
      if (vis.error || !workerMaySeeJob(vis, jobId, "carpentry")) return err(res, 403, "You don't have access to this job.");
      const { data: job } = await sb.from("carpentry_jobs").select("id, reference, address, project_type").eq("id", jobId).maybeSingle();
      if (!job) return err(res, 404, "Job not found.");
      const { templateIds } = await ensureCarpentryJobSwms(sb, job);
      let swms = [];
      if (templateIds.length) {
        const { data: t } = await sb.from("swms_templates").select("*").in("id", templateIds).order("title");
        const { data: mine } = await sb.from("whs_swms_signon")
          .select("swms_template_id, swms_version").eq("carpentry_job_id", jobId).eq("employee_id", emp.id);
        const signed = new Set((mine || []).map((s) => `${s.swms_template_id}:${s.swms_version}`));
        swms = (t || []).map((row) => ({
          id: row.id, title: row.title, version: row.version, summary: row.summary,
          workCategory: row.work_category, isHighRisk: row.is_high_risk, reviewStatus: row.review_status,
          source: row.source, contentHtml: row.content_html, pdfPath: row.pdf_path,
          signed: signed.has(`${row.id}:${row.version}`), // false if a new version needs re-signing
        }));
      }
      return ok(res, { job: { id: job.id, reference: job.reference, address: job.address }, swms });
    } catch (e) {
      console.error("[worker/jobs swms]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // WHS: a worker signs on to a SWMS (once per job; a new version needs a fresh sign-on). The shield record.
  app.post("/api/worker/swms/:swmsTemplateId/signon", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return err(res, 403, "No employee record found.");
    if (req.workerPreview) return err(res, 403, "Read-only preview — you can't sign on as a worker.");
    const swmsTemplateId = String(req.params.swmsTemplateId || "");
    const carpentryJobId = String(req.body?.carpentryJobId || "");
    const signatureDataUrl = typeof req.body?.signatureDataUrl === "string" ? req.body.signatureDataUrl : null;
    if (!isUuid(swmsTemplateId) || !isUuid(carpentryJobId)) return err(res, 400, "Invalid ids.");
    try {
      const vis = await workerVisibleJobs(sb, emp.id);
      if (vis.error || !workerMaySeeJob(vis, carpentryJobId, "carpentry")) return err(res, 403, "You don't have access to this job.");
      // The SWMS must be current-attached to THIS job, active, and REVIEWED — a worker can only sign a
      // SWMS actually issued to their job that has passed WHS review (never a DRAFT). Version is taken
      // server-side (never a client-supplied version).
      const { data: tpl } = await sb.from("swms_templates").select("id, version, review_status, is_active").eq("id", swmsTemplateId).maybeSingle();
      if (!tpl) return err(res, 404, "SWMS not found.");
      if (tpl.is_active === false) return err(res, 409, "This SWMS is no longer active.");
      if (tpl.review_status !== "reviewed") return err(res, 409, "This SWMS is awaiting WHS review and can't be signed yet.");
      const { data: link } = await sb.from("project_swms").select("id").eq("carpentry_job_id", carpentryJobId).eq("swms_template_id", swmsTemplateId).maybeSingle();
      if (!link) return err(res, 409, "This SWMS isn't assigned to this job.");
      const { error } = await sb.from("whs_swms_signon").insert({
        swms_template_id: swmsTemplateId, swms_version: tpl.version,
        carpentry_job_id: carpentryJobId, employee_id: emp.id,
        signature_data_url: signatureDataUrl, created_by: emp.id,
      });
      if (error) {
        if (/duplicate|unique/i.test(String(error.message || ""))) return ok(res, { already: true });
        return err(res, 500, translateDbError(error));
      }
      return ok(res, { signed: true, version: tpl.version });
    } catch (e) {
      console.error("[worker/swms signon]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // WHS pack (Phase C): the ONE composed site WHS pack a worker signs. Returns the composed HTML +
  // the current version + whether THIS worker has signed that version. Only an ISSUED (reviewed +
  // approved) pack is signable — a draft is not shown as ready.
  app.get("/api/worker/jobs/:id/whs-pack", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return err(res, 403, "No employee record found.");
    const jobId = String(req.params.id || "");
    if (!isUuid(jobId)) return err(res, 400, "Invalid job id.");
    try {
      const vis = await workerVisibleJobs(sb, emp.id);
      if (vis.error || !workerMaySeeJob(vis, jobId, "carpentry")) return err(res, 403, "You don't have access to this job.");
      const { error, job, pack, html } = await loadAndComposePack(sb, jobId);
      if (error) return err(res, 404, error);
      const issued = !!pack && pack.review_status === "issued";
      let signed = false;
      if (pack) {
        const { data: mine } = await sb.from("whs_swms_signon")
          .select("id").eq("pack_id", pack.id).eq("pack_version", pack.version).eq("employee_id", emp.id).maybeSingle();
        signed = !!mine;
      }
      return ok(res, {
        job: { id: job.id, reference: job.reference, address: job.address },
        pack: pack ? { version: pack.version, issued, signed, html: issued ? html : null } : null,
      });
    } catch (e) {
      console.error("[worker/jobs whs-pack]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // A worker signs the current pack version (once per version; a new version needs a fresh sign-on).
  // The version is taken server-side (never client-supplied). Only an ISSUED pack can be signed.
  app.post("/api/worker/jobs/:id/whs-pack/signon", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return err(res, 403, "No employee record found.");
    if (req.workerPreview) return err(res, 403, "Read-only preview — you can't sign on as a worker.");
    const jobId = String(req.params.id || "");
    const signatureDataUrl = typeof req.body?.signatureDataUrl === "string" ? req.body.signatureDataUrl : null;
    if (!isUuid(jobId)) return err(res, 400, "Invalid job id.");
    try {
      const vis = await workerVisibleJobs(sb, emp.id);
      if (vis.error || !workerMaySeeJob(vis, jobId, "carpentry")) return err(res, 403, "You don't have access to this job.");
      const { data: pack } = await sb.from("carpentry_whs_packs").select("id, version, review_status").eq("carpentry_job_id", jobId).maybeSingle();
      if (!pack) return err(res, 404, "No WHS pack for this job yet.");
      if (pack.review_status !== "issued") return err(res, 409, "This WHS pack is awaiting review/approval and can't be signed yet.");
      const { error } = await sb.from("whs_swms_signon").insert({
        pack_id: pack.id, pack_version: pack.version,
        carpentry_job_id: jobId, employee_id: emp.id,
        signature_data_url: signatureDataUrl, created_by: emp.id,
      });
      if (error) {
        if (/duplicate|unique/i.test(String(error.message || ""))) return ok(res, { already: true });
        return err(res, 500, translateDbError(error));
      }
      return ok(res, { signed: true, version: pack.version });
    } catch (e) {
      console.error("[worker/jobs whs-pack signon]", e);
      return err(res, 502, translateDbError(e));
    }
  });

  // Recent timesheets (for the worker's "My week" view — spot missing days).
  app.get("/api/worker/timesheets", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return res.status(403).json({ ok: false, error: "No employee record found" });
    const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 120);
    const from = req.query.from || new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
    let q = sb.from("timesheets")
      .select("id, date, status, project_id, projects(address), timesheet_entries(hours)")
      .eq("employee_id", emp.id).gte("date", from);
    if (req.query.to) q = q.lte("date", req.query.to);
    const { data, error } = await q.order("date", { ascending: false });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    const timesheets = (data || []).map((t) => ({
      id: t.id, date: t.date, status: t.status,
      project: t.projects?.address || null,
      hours: (t.timesheet_entries || []).reduce((s, e) => s + Number(e.hours || 0), 0),
    }));
    res.json({ ok: true, timesheets, from });
  });

  app.get("/api/worker/timesheets/:date", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return res.status(403).json({ ok: false, error: "No employee record found" });
    // Echo the sub-task (canonical_key, mig 147) + charge-up site (charge_up_job_id, mig 145) so
    // re-editing a day restores the picks. Fall back to the base select if a column isn't there yet.
    const sel = (withNew) => `*, timesheet_entries(id, task_category, budget_line_item_id, ${withNew ? "canonical_key, charge_up_job_id, " : ""}phase, hours, notes, completion_photo_url)`;
    let { data, error } = await sb.from("timesheets").select(sel(true)).eq("employee_id", emp.id).eq("date", req.params.date).maybeSingle();
    if (error) ({ data } = await sb.from("timesheets").select(sel(false)).eq("employee_id", emp.id).eq("date", req.params.date).maybeSingle());
    res.json({ ok: true, timesheet: data || null });
  });

  app.put("/api/worker/timesheets/:id", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return res.status(403).json({ ok: false, error: "No employee record found" });

    const { data: ts } = await sb.from("timesheets").select("id, employee_id, status, project_id, job_id, carpentry_job_id").eq("id", req.params.id).single();
    if (!ts) return res.status(404).json({ ok: false, error: "Timesheet not found" });
    if (ts.employee_id !== emp.id) return res.status(403).json({ ok: false, error: "Forbidden" });
    if (ts.status === "approved") return res.status(409).json({ ok: false, error: "Cannot edit approved timesheet" });

    const { entries, ...rest } = req.body;
    // Tolerate timezones ahead of UTC (AEST +10) — match the POST handler's +1 day allowance so a
    // same-day edit late in the evening isn't falsely rejected.
    const maxDate = addDaysYmd(todayYmd(), 1);
    if (rest.date && rest.date > maxDate) {
      return res.status(400).json({ ok: false, error: "Cannot log hours for a future date" });
    }
    if (Array.isArray(entries)) {
      const hoursError = validateEntryHours(entries);
      if (hoursError) return res.status(400).json({ ok: false, error: hoursError });
      if (entries.reduce((s, e) => s + Number(e.hours), 0) > 24) {
        return res.status(400).json({ ok: false, error: "Total hours for one day cannot exceed 24" });
      }
      if (entries.some(e => !TASK_CATEGORIES.includes(e.task_category))) {
        return res.status(400).json({ ok: false, error: "Invalid task category" });
      }
    }

    // Build the timesheet update from an explicit allow-list — never spread the raw
    // body. This prevents a worker from writing arbitrary columns, and means a job
    // can only be reassigned through the visibility check below.
    const update = {
      status: "submitted",
      submitted_at: new Date().toISOString(),
      rejection_notes: null,
      updated_at: new Date().toISOString(),
    };
    if ("date" in rest) update.date = rest.date;
    if ("job_id" in rest) update.job_id = rest.job_id || null;

    // Resolve the effective job after this edit (body value if supplied, else current),
    // and validate the worker may log against it. Blocks silent reassignment.
    const reassigns = ("project_id" in rest) || ("carpentry_job_id" in rest);
    const effProjectId = ("project_id" in rest) ? (rest.project_id || null) : (ts.project_id || null);
    const effCarpentryId = ("carpentry_job_id" in rest) ? (rest.carpentry_job_id || null) : (ts.carpentry_job_id || null);
    if (!effProjectId && !effCarpentryId) {
      return res.status(400).json({ ok: false, error: "Select a site or job before submitting." });
    }
    if (reassigns) {
      const jobType = effCarpentryId ? "carpentry" : "project";
      const jobId = effCarpentryId || effProjectId;
      const vis = await workerVisibleJobs(sb, emp.id);
      if (vis.error) return res.status(500).json({ ok: false, error: translateDbError(vis.error) });
      if (!workerMaySeeJob(vis, jobId, jobType)) {
        return res.status(403).json({ ok: false, error: "You don't have access to this job." });
      }
      update.project_id = effProjectId;
      update.carpentry_job_id = effCarpentryId;
    }

    await sb.from("timesheets").update(update).eq("id", ts.id);
    if (Array.isArray(entries)) {
      await sb.from("timesheet_entries").delete().eq("timesheet_id", ts.id);
      const rows = entries.map(e => ({
        timesheet_id: ts.id, employee_id: emp.id,
        task_category: e.task_category,
        phase: TASK_PHASE_MAP[e.task_category] || "general",
        hours: Number(e.hours), overtime_hours: 0,
        notes: e.notes || null,
        completion_photo_url: e.completion_photo_url || null,
      }));
      await sb.from("timesheet_entries").insert(rows);
    }
    res.json({ ok: true });
  });

  app.get("/api/worker/tasks", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return res.status(403).json({ ok: false, error: "No employee record found" });

    // The worker EXPLICITLY selects a job (sent as ?jobId&jobType) — we no longer
    // infer it from the latest timesheet. Inference was the bug: a freshly-added
    // task on a job the worker hadn't yet logged hours against was invisible.
    const jobId = (req.query.jobId || "").trim();
    const jobType = (req.query.jobType || "").trim();
    const category = (req.query.category || "").trim();
    // Charge Up: the worker picks a SITE (charge_up_jobs) under the BL-CHARGEUP parent; its tasks are
    // owned by the site (charge_up_job_id), not the parent job.
    const chargeUpJobId = (req.query.chargeUpJobId || "").trim();

    if (!jobId) return res.json({ ok: true, tasks: [], needsJobSelection: true });
    if (!isUuid(jobId)) return err(res, 400, "Invalid job id.", "BAD_JOB_ID");
    if (jobType && !WORKER_JOB_TYPES.includes(jobType)) return err(res, 400, "Invalid job type.", "BAD_JOB_TYPE");
    if (category && !SITE_TASK_CATEGORIES.includes(category)) return err(res, 400, "Invalid category.", "BAD_CATEGORY");
    if (chargeUpJobId && !isUuid(chargeUpJobId)) return err(res, 400, "Invalid site id.", "BAD_SITE_ID");

    // Authorise: the worker may only read tasks for a job in their visible set.
    const vis = await workerVisibleJobs(sb, emp.id);
    if (!workerMaySeeJob(vis, jobId, jobType)) return err(res, 403, "You don't have access to this job.", "JOB_FORBIDDEN");
    if (chargeUpJobId && !(await workerChargeUpSiteParent(sb, vis, chargeUpJobId))) {
      return err(res, 403, "You don't have access to this site.", "SITE_FORBIDDEN");
    }

    let q = sb
      .from("site_tasks")
      .select("*, employees!assigned_to(id, name), completer:employees!completed_by(id, name)")
      .neq("status", "wont_do");
    // jobId is validated as a UUID above, so the .or() interpolation is injection-safe.
    if (chargeUpJobId) q = q.eq("charge_up_job_id", chargeUpJobId);
    else if (jobType === "carpentry") q = q.eq("carpentry_job_id", jobId);
    else if (jobType === "project") q = q.eq("project_id", jobId);
    else q = q.or(`project_id.eq.${jobId},carpentry_job_id.eq.${jobId}`);
    if (category) q = q.eq("category", category);
    // W17-P3: normal workers see only 'worker' tasks; leading hands also see 'supervisor' (QC) tasks.
    // Closes the D3 leak where supervisor/QC tasks surfaced to every worker.
    if (!emp.is_leading_hand) q = q.eq("task_audience", "worker");
    q = q.order("sort_order").order("created_at");

    const { data: tasks, error } = await q;
    if (error) return err(res, 500, error.message);

    // Filter (multi-assign dual-read): done tasks (history) + SHARED (no assignees) + tasks I'm on.
    const withAssignees = await attachAssigneesFromDb(sb, tasks || []);
    // A leading hand runs the crew, so they see EVERY task on the job (shared + assigned to any crew
    // member) — otherwise handing work out makes it vanish from their own list (looked like deletion).
    // A plain worker keeps the focused view: done + shared + assigned-to-them.
    const visible = emp.is_leading_hand ? withAssignees : withAssignees.filter(t => t.status === "done" || visibleToWorker(t.assignees, emp.id));
    const sorted = visible.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99));
    await signSiteTaskPhotos(sb, sorted);
    // Who-signed-off (completer name) is supervisor/admin-only info in the field app: strip it
    // for regular workers. Leading hands and admin preview keep it. Mirrors the C4 UI gate + the
    // D3 audience-leak fix — don't just hide it in the UI, don't send it down the wire.
    if (!emp.is_leading_hand && !req.workerPreview) {
      for (const t of sorted) { if (t) delete t.completer; }
    }
    res.json({ ok: true, tasks: sorted, jobId, jobType: jobType || null });
  });

  // W17-P3: read-only "preview as worker" for admin/supervisor (console-authenticated — NOT the worker
  // token path). Returns the exact task set the chosen employee would see for a job, applying the SAME
  // task_audience + assigned_to visibility, so the office preview always matches the worker's reality.
  app.get("/api/workforce/employees/:id/task-preview", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!isUuid(req.params.id)) return err(res, 400, "Invalid employee id.");
    const { data: emp } = await sb.from("employees").select("id, name, is_leading_hand, is_active").eq("id", req.params.id).maybeSingle();
    if (!emp) return err(res, 404, "Employee not found.", "NOT_FOUND");
    const jobId = (req.query.jobId || "").trim();
    const jobType = (req.query.jobType || "").trim();
    const category = (req.query.category || "").trim();
    if (!jobId) {
      // W17-P3 (preview UI): no job selected yet → return the worker's visible jobs so the admin
      // "Preview as worker" panel can offer the same job picker the worker would see.
      const visJobs = await workerVisibleJobs(sb, emp.id);
      const jobs = [
        ...visJobs.projects.map((p) => ({ id: p.id, address: p.address, type: "project" })),
        ...visJobs.carpJobs.map((j) => ({ id: j.id, address: j.address, type: "carpentry" })),
      ];
      return ok(res, { preview: true, employee: emp, tasks: [], jobs, needsJobSelection: true });
    }
    if (!isUuid(jobId)) return err(res, 400, "Invalid job id.", "BAD_JOB_ID");
    if (jobType && !WORKER_JOB_TYPES.includes(jobType)) return err(res, 400, "Invalid job type.", "BAD_JOB_TYPE");
    if (category && !SITE_TASK_CATEGORIES.includes(category)) return err(res, 400, "Invalid category.", "BAD_CATEGORY");
    const vis = await workerVisibleJobs(sb, emp.id);
    if (!workerMaySeeJob(vis, jobId, jobType)) return err(res, 403, "Employee has no access to this job.", "JOB_FORBIDDEN");

    let q = sb.from("site_tasks").select("*, employees!assigned_to(id, name)").neq("status", "wont_do");
    if (jobType === "carpentry") q = q.eq("carpentry_job_id", jobId);
    else if (jobType === "project") q = q.eq("project_id", jobId);
    else q = q.or(`project_id.eq.${jobId},carpentry_job_id.eq.${jobId}`);
    if (category) q = q.eq("category", category);
    if (!emp.is_leading_hand) q = q.eq("task_audience", "worker");
    q = q.order("sort_order").order("created_at");
    const { data: tasks, error } = await q;
    if (error) return err(res, 500, error.message);
    const withAssignees = await attachAssigneesFromDb(sb, tasks || []);
    // A leading hand runs the crew, so they see EVERY task on the job (shared + assigned to any crew
    // member) — otherwise handing work out makes it vanish from their own list (looked like deletion).
    // A plain worker keeps the focused view: done + shared + assigned-to-them.
    const visible = emp.is_leading_hand ? withAssignees : withAssignees.filter(t => t.status === "done" || visibleToWorker(t.assignees, emp.id));
    const sorted = visible.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99));
    await signSiteTaskPhotos(sb, sorted);
    ok(res, { preview: true, employee: emp, tasks: sorted, jobId, jobType: jobType || null });
  });

  // Upload a worker completion photo to the private site-media bucket; returns the storage PATH.
  // Any active worker may attach photos. Body: { dataUrl, entityType, entityId, filename }.
  app.post("/api/worker/photos", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return err(res, 403, "No employee record found");
    const { dataUrl, data, entityType, entityId, filename } = req.body || {};
    const raw = dataUrl || data;
    if (!raw || !entityType || !entityId) return err(res, 400, "dataUrl, entityType and entityId are required.");
    if (!PHOTO_ENTITY_DIR[entityType]) return err(res, 400, "Invalid entityType.");
    if (!isUuid(entityId)) return err(res, 400, "Invalid entityId.");
    if (entityType === "site_task") {
      const j = await workerMayActOnTask(sb, emp.id, entityId);
      if (!j.found) return err(res, 404, "Task not found.");
      if (!j.allowed) return err(res, 403, "You don't have access to this job.");
      if (!visibleToWorker(await assigneesForTask(sb, entityId), emp.id)) return err(res, 403, "You can only add photos to your own or unassigned tasks.");
    }
    const m = /^data:(image\/(?:jpe?g|png|webp));base64,(.+)$/i.exec(String(raw));
    if (!m) return err(res, 400, "Photo must be a base64 image.");
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > 6 * 1024 * 1024) return err(res, 413, "Photo too large (max 6MB).");
    const path = buildPhotoPath(entityType, entityId, filename);
    if (!path) return err(res, 400, "Could not build a storage path.");
    try {
      const { error } = await sb.storage.from(SITE_MEDIA_BUCKET).upload(path, buf, { contentType: m[1], upsert: false });
      if (error) throw error;
      return ok(res, { path });
    } catch (e) {
      console.error("[worker/photos]", e?.message || e);
      return err(res, 502, "Could not save the photo. Please try again.");
    }
  });

  app.post("/api/worker/tasks/:id/complete", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return res.status(403).json({ ok: false, error: "No employee record found" });

    const update = {
      status: "done",
      completed_at: new Date().toISOString(),
      completed_by: emp.id,
      updated_at: new Date().toISOString(),
    };
    if (req.body.notes) update.completion_notes = req.body.notes;
    // Completion photo: any worker may attach one. Value MUST be a storage key from /api/worker/photos.
    const rawPhoto = req.body.photoPath || req.body.photo_url;
    if (rawPhoto != null && String(rawPhoto).trim() !== "") {
      const p = String(rawPhoto).trim();
      if (!isValidPhotoKey(p)) return err(res, 400, "Upload the photo before completing the task.");
      update.completion_photo_url = p;
    }

    // W17-P3: a normal worker cannot complete a supervisor/QC task — only a leading hand.
    if (!emp.is_leading_hand) {
      const { data: tk } = await sb.from("site_tasks").select("task_audience").eq("id", req.params.id).maybeSingle();
      if (tk?.task_audience === "supervisor") return err(res, 403, "QC tasks can only be completed by a leading hand.");
    }

    // Job-membership gate (mirror the list paths): can't act on a task on a job you're not on.
    const jm = await workerMayActOnTask(sb, emp.id, req.params.id);
    if (!jm.found) return err(res, 404, "Task not found.");
    if (!jm.allowed) return err(res, 403, "You don't have access to this job.");
    // Multi-assign: a worker can complete a task that's shared (no assignees) or that they're on.
    if (!visibleToWorker(await assigneesForTask(sb, req.params.id), emp.id)) {
      return err(res, 403, "You can only complete tasks assigned to you or unassigned tasks.");
    }
    const { data, error } = await sb.from("site_tasks").update(update).eq("id", req.params.id).select().maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return err(res, 404, "Task not found.");
    res.json({ ok: true, task: data });
  });

  // ── PATCH /api/worker/tasks/:id ─────────────────────────────────────────────
  // Worker-auth task update: toggle done/open, mark blocked, add notes/photo.
  // Worker-auth: a leading hand (onsite supervisor) can add a work task to a carpentry job from the
  // PWA — any worker can then tick it. Mirrors the worker PATCH auth. Not for QC template tasks.
  app.post("/api/worker/tasks", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (req.workerPreview) return res.status(403).json({ ok: false, error: "Read-only preview — you can't add tasks as a worker." });
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return res.status(403).json({ ok: false, error: "No employee record found" });
    if (!emp.is_leading_hand) return err(res, 403, "Only a leading hand can add tasks onsite.");
    const jobId = String(req.body?.jobId || "").trim();
    const title = String(req.body?.title || "").trim();
    const chargeUpJobId = String(req.body?.chargeUpJobId || "").trim();
    if (!isUuid(jobId) || !title) return err(res, 400, "jobId and title are required.");
    if (chargeUpJobId && !isUuid(chargeUpJobId)) return err(res, 400, "Invalid site id.");
    const category = String(req.body?.category || "general").trim() || "general";
    const priority = ["urgent", "normal", "when_time_permits"].includes(req.body?.priority) ? req.body.priority : "normal";
    const description = String(req.body?.description || "").trim() || null;
    // Charge Up: own the task by the SITE (charge_up_job_id; carpentry_job_id stays null per the 3-way
    // owner rule, mig 151), authorised via the site's parent job. Otherwise own by the carpentry job.
    let owner;
    if (chargeUpJobId) {
      const vis = await workerVisibleJobs(sb, emp.id);
      if (!(await workerChargeUpSiteParent(sb, vis, chargeUpJobId))) return err(res, 403, "You don't have access to this site.");
      owner = { charge_up_job_id: chargeUpJobId };
    } else {
      owner = { carpentry_job_id: jobId };
    }
    const { data, error } = await sb.from("site_tasks").insert({
      ...owner, title, description, category, priority, status: "open",
      created_via: "manual", task_audience: "worker"
    }).select("*").single();
    if (error) return err(res, 500, translateDbError(error));
    return ok(res, { task: rowToCamel(data) });
  });

  // ── POST /api/worker/tasks/from-transcript ──────────────────────────────────
  // Leading-hand only: paste a site walk-through transcript → AI extracts a DRAFT
  // task list. Creates NOTHING — the PWA shows the drafts, the user ticks which to
  // keep, then bulk-creates via POST /api/worker/tasks.
  app.post("/api/worker/tasks/from-transcript", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return err(res, 403, "No employee record found");
    if (!emp.is_leading_hand) return err(res, 403, "Only a leading hand can extract tasks from a transcript.");

    const transcript = String(req.body?.transcript || "").trim();
    if (!transcript) return err(res, 400, "transcript is required.");
    if (transcript.length > 20000) return err(res, 413, "Transcript too long — split it into shorter sessions.");

    const jobId = String(req.body?.jobId || "").trim();
    if (!isUuid(jobId)) return err(res, 400, "jobId must be a valid UUID.");
    const jobLabel = String(req.body?.jobLabel || "").trim();
    const jobType  = String(req.body?.jobType  || "").trim();

    // Feed labour work streams for carpentry jobs so draft tasks land in the right
    // budget stream (mirrors the carpentry endpoint logic).
    let workStreams = [];
    if (sb && jobType === "carpentry") {
      const { data: budgets } = await sb
        .from("carpentry_job_budgets")
        .select("category_name, cost_type, workforce_task_category")
        .eq("job_id", jobId)
        .eq("cost_type", "labour");
      workStreams = (budgets || [])
        .filter((b) => b.workforce_task_category)
        .map((b) => ({ value: b.workforce_task_category, label: b.category_name }));
    }

    try {
      const tasks = await splitTranscriptToTasks(transcript, { jobLabel, workStreams });
      return ok(res, { tasks, draft: true });
    } catch (e) {
      console.error("[worker/tasks from-transcript]", e);
      return err(res, 502, e.message || "Could not extract tasks from the transcript.");
    }
  });

  // Workers can only update tasks assigned to them or unassigned.
  // Preview mode is blocked (read-only).
  app.patch("/api/worker/tasks/:id", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (req.workerPreview) return res.status(403).json({ ok: false, error: "Read-only preview — you can't update tasks as a worker." });
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return res.status(403).json({ ok: false, error: "No employee record found" });

    if (!isUuid(req.params.id)) return err(res, 400, "Invalid task id.");

    // C3 guard: only a leading hand may set assigned_to.
    if (req.body?.assigned_to !== undefined && !emp.is_leading_hand) {
      return err(res, 403, "Only a leading hand can assign tasks to crew members.");
    }

    const { status, completionNotes, completionPhotoUrl, assigned_to, title, description, category } = req.body || {};
    const update = { updated_at: new Date().toISOString() };

    // Leading hand may edit a task's name / info / category (same fields as the Hub + draft editor).
    if (title !== undefined || description !== undefined || category !== undefined) {
      if (!emp.is_leading_hand) return err(res, 403, "Only a leading hand can edit a task's details.");
      if (title !== undefined) {
        const tt = String(title).trim();
        if (!tt) return err(res, 400, "Task title can't be empty.");
        update.title = tt;
      }
      if (description !== undefined) update.description = String(description || "").trim() || null;
      if (category !== undefined) {
        const c = String(category).trim();
        if (!SITE_TASK_CATEGORIES.includes(c)) return err(res, 400, "Invalid category.");
        update.category = c;
      }
    }

    if (status !== undefined) {
      const VALID = ["open", "in_progress", "done", "blocked"];
      if (!VALID.includes(status)) return err(res, 400, "Invalid status.");
      // QC tasks: only a leading hand may complete them.
      if (status === "done" && !emp.is_leading_hand) {
        const { data: tk } = await sb.from("site_tasks").select("task_audience").eq("id", req.params.id).maybeSingle();
        if (tk?.task_audience === "supervisor") return err(res, 403, "QC tasks can only be completed by a leading hand.");
      }
      update.status = status;
      if (status === "done") {
        update.completed_at = new Date().toISOString();
        update.completed_by = emp.id;
      } else if (status === "open" || status === "blocked") {
        // Un-done or blocked → clear completion stamp.
        update.completed_at = null;
        update.completed_by = null;
      }
    }

    if (completionNotes !== undefined) update.completion_notes = completionNotes || null;
    if (completionPhotoUrl !== undefined) {
      const p = String(completionPhotoUrl || "").trim();
      if (p && !isValidPhotoKey(p)) return err(res, 400, "Upload the photo before saving.");
      update.completion_photo_url = p || null;
    }

    // C3: leading hand may assign a task to a crew member (null = unassign) — written through
    // the join (setAssignees) below, never a bare assigned_to write.
    let assignVal;   // undefined = no change; null = unassign; else the assignee id
    if (assigned_to !== undefined) {
      assignVal = assigned_to === null ? null : String(assigned_to).trim();
      if (assignVal !== null && !isUuid(assignVal)) return err(res, 400, "Invalid assigned_to value.");
    }

    // Multi-assign scope: a leading hand may update any task; a regular worker only a task that's
    // shared (no assignees) or that they're on — AND only on a job they can see.
    if (!emp.is_leading_hand) {
      const jm = await workerMayActOnTask(sb, emp.id, req.params.id);
      if (!jm.found) return err(res, 404, "Task not found.");
      if (!jm.allowed) return err(res, 403, "You don't have access to this job.");
      if (!visibleToWorker(await assigneesForTask(sb, req.params.id), emp.id)) {
        return err(res, 403, "You can only update tasks assigned to you or unassigned tasks.");
      }
    }
    let { data, error } = await sb.from("site_tasks").update(update).eq("id", req.params.id)
      .select("*, employees!assigned_to(id, name)").maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return err(res, 404, "Task not found.");
    if (assignVal !== undefined) {
      await setAssignees(sb, req.params.id, assignVal ? [assignVal] : [], emp.id);
      // Re-read so the pre-mig fallback overlays the freshly-mirrored assigned_to, not the stale row.
      const { data: fresh } = await sb.from("site_tasks").select("*, employees!assigned_to(id, name)").eq("id", req.params.id).maybeSingle();
      if (fresh) data = fresh;
    }
    const [withAssignees] = await attachAssigneesFromDb(sb, [data]);
    return res.json({ ok: true, task: withAssignees });
  });

  // ── POST /api/worker/tasks/:id/assignees (multi-assign from the PWA, leading hand) ──
  // SET the task's assignees to workerIds[] (dual-writes the join + the first→assigned_to mirror).
  app.post("/api/worker/tasks/:id/assignees", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (req.workerPreview) return err(res, 403, "Read-only preview — you can't assign as a worker.");
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return err(res, 403, "No employee record found");
    if (!emp.is_leading_hand) return err(res, 403, "Only a leading hand can assign tasks to crew.");
    if (!isUuid(req.params.id)) return err(res, 400, "Invalid task id.");
    const workerIds = Array.isArray(req.body?.workerIds) ? req.body.workerIds.filter(isUuid) : [];
    try {
      await setAssignees(sb, req.params.id, workerIds, emp.id);
      const { data: task } = await sb.from("site_tasks").select("*, employees!assigned_to(id, name)").eq("id", req.params.id).maybeSingle();
      if (!task) return err(res, 404, "Task not found.", "NOT_FOUND");
      const [withA] = await attachAssigneesFromDb(sb, [task]);
      return res.json({ ok: true, task: withA });
    } catch (e) {
      console.error("[worker/tasks/:id/assignees]", e?.message || e);
      return err(res, 502, translateDbError(e));
    }
  });

  // ── GET /api/worker/jobs/:id/crew ────────────────────────────────────────────
  // Returns employees who have recently clocked on to this job (based on timesheets
  // within the last 90 days). Used by the leading-hand crew picker to assign tasks.
  app.get("/api/worker/jobs/:id/crew", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return err(res, 403, "No employee record found");
    if (!emp.is_leading_hand) return err(res, 403, "Only a leading hand can view the crew list.");
    if (!isUuid(req.params.id)) return err(res, 400, "Invalid job id.");

    // Assignable crew = ALL active workers. (Previously limited to employees with a
    // timesheet on this job in the last 90 days, which showed only whoever had clocked
    // on — often just 1 person. A leading hand needs to assign to anyone on the crew.)
    const { data: crew, error: empErr } = await sb
      .from("employees")
      .select("id, name, trade, is_leading_hand")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (empErr) return err(res, 500, translateDbError(empErr));

    ok(res, { crew: (crew || []).map(e => ({ id: e.id, name: e.name, trade: e.trade, isLeadingHand: e.is_leading_hand })) });
  });

  // ── GET /api/worker/crew/day?date=&jobId=&jobType= (F2 + F3 picker) ──────────
  // Same-site/same-day crew (leading hand only). Without jobId → the caller's OWN rostered
  // site that day (Week Crew view). With jobId+jobType → who's rostered to THAT site that day
  // (multi-assign picker scope). Charge-up narrowing is fail-soft (attachChargeUpSites).
  app.get("/api/worker/crew/day", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return err(res, 403, "No employee record found");
    if (!emp.is_leading_hand) return err(res, 403, "Only a leading hand can view the crew.");
    const date = String(req.query.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return err(res, 400, "A valid date is required.");
    const jobId = String(req.query.jobId || "").trim();
    const jobType = req.query.jobType === "carpentry" ? "carpentry" : req.query.jobType === "project" ? "project" : null;
    try {
      // Resolve the day's site spine.
      let spine = null;   // { projectId } | { carpentryJobId, chargeUpJobId? }
      if (jobId && isUuid(jobId) && jobType) {
        const vis = await workerVisibleJobs(sb, emp.id);
        if (vis.error) return err(res, 500, translateDbError(vis.error));   // fail CLOSED, matching the plans endpoints
        if (!workerMaySeeJob(vis, jobId, jobType)) return err(res, 403, "You don't have access to this job.");
        spine = jobType === "carpentry" ? { carpentryJobId: jobId } : { projectId: jobId };
      } else {
        const { data: mineRows } = await sb.from("workforce_allocations").select(ALLOCATION_SELECT).eq("employee_id", emp.id).eq("allocation_date", date);
        const [mine] = await attachChargeUpSites(sb, (mineRows || []).map(formatAllocation));
        if (!mine) return ok(res, { date, site: null, crew: [] });
        if (mine.chargeUpJobId) spine = { carpentryJobId: mine.carpentryJobId, chargeUpJobId: mine.chargeUpJobId };
        else if (mine.carpentryJobId) spine = { carpentryJobId: mine.carpentryJobId };
        else if (mine.projectId) spine = { projectId: mine.projectId };
      }
      if (!spine) return ok(res, { date, site: null, crew: [] });
      let q = sb.from("workforce_allocations").select(ALLOCATION_SELECT).eq("allocation_date", date);
      q = spine.projectId ? q.eq("project_id", spine.projectId) : q.eq("carpentry_job_id", spine.carpentryJobId);
      const { data: rows, error } = await q;
      if (error) return err(res, 500, translateDbError(error));
      let allocs = await attachChargeUpSites(sb, (rows || []).map(formatAllocation));
      if (spine.chargeUpJobId) allocs = allocs.filter((a) => a.chargeUpJobId === spine.chargeUpJobId);
      const empIds = [...new Set(allocs.map((a) => a.employeeId).filter(Boolean))];
      const { data: emps } = empIds.length ? await sb.from("employees").select("id, name, trade").in("id", empIds) : { data: [] };
      const tradeById = new Map((emps || []).map((e) => [e.id, e.trade]));
      const f = allocs[0];
      const site = f ? {
        label: f.chargeUpSiteLabel || f.carpentryJobAddress || f.carpentryJobClientName || f.projectAddress || "Site",
        address: f.chargeUpSiteAddress || f.carpentryJobAddress || f.projectAddress || null,
        kind: f.chargeUpJobId ? "Charge Up" : f.carpentryJobId ? "Carpentry" : "Building",
      } : null;
      const crew = allocs
        .map((a) => ({ employeeId: a.employeeId, name: a.employeeName || "Unknown", trade: tradeById.get(a.employeeId) || null, isSelf: a.employeeId === emp.id }))
        .sort((x, y) => (x.name || "").localeCompare(y.name || ""));
      return ok(res, { date, site, crew });
    } catch (e) {
      console.error("[worker/crew/day]", e?.message || e);
      return err(res, 500, "Could not load the crew");
    }
  });

  // ── PUT /api/worker/tasks/reorder ───────────────────────────────────────────
  // A leading hand (worker token) or an admin (preview) drags to set the on-site task
  // order; every worker then sees tasks in this sort_order. Only sort_order changes.
  // Scoped to the job, so an id from another job is simply not matched (can't be moved).
  app.put("/api/worker/tasks/reorder", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return err(res, 403, "No employee record found");
    // Token path must be a leading hand. Admin preview is already admin-gated in workerAuth.
    if (!req.workerPreview && !emp.is_leading_hand) {
      return err(res, 403, "Only a leading hand can reorder tasks.");
    }
    const jobId = String(req.body?.jobId || "").trim();
    const jobType = String(req.body?.jobType || "").trim();
    const chargeUpJobId = String(req.body?.chargeUpJobId || "").trim();
    const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : null;
    if (!isUuid(jobId)) return err(res, 400, "Invalid job id.", "BAD_JOB_ID");
    if (jobType && !WORKER_JOB_TYPES.includes(jobType)) return err(res, 400, "Invalid job type.", "BAD_JOB_TYPE");
    if (chargeUpJobId && !isUuid(chargeUpJobId)) return err(res, 400, "Invalid site id.", "BAD_SITE_ID");
    if (!orderedIds || !orderedIds.length) return err(res, 400, "orderedIds is required.");
    if (!orderedIds.every(isUuid)) return err(res, 400, "orderedIds must all be task ids.");
    if (orderedIds.length > 500) return err(res, 413, "Too many tasks in one reorder.");

    // Same job-visibility gate as GET (admin preview sees every job).
    if (!req.workerPreview) {
      const vis = await workerVisibleJobs(sb, emp.id);
      if (!workerMaySeeJob(vis, jobId, jobType)) return err(res, 403, "You don't have access to this job.", "JOB_FORBIDDEN");
      if (chargeUpJobId && !(await workerChargeUpSiteParent(sb, vis, chargeUpJobId))) return err(res, 403, "You don't have access to this site.", "SITE_FORBIDDEN");
    }

    // sort_order = position in the submitted order. jobId is a validated UUID, so the
    // .or() interpolation is injection-safe (matches the GET pattern above).
    const now = new Date().toISOString();
    let updated = 0;
    for (let i = 0; i < orderedIds.length; i++) {
      let q = sb.from("site_tasks").update({ sort_order: i, updated_at: now }).eq("id", orderedIds[i]);
      if (chargeUpJobId) q = q.eq("charge_up_job_id", chargeUpJobId);
      else if (jobType === "carpentry") q = q.eq("carpentry_job_id", jobId);
      else if (jobType === "project") q = q.eq("project_id", jobId);
      else q = q.or(`project_id.eq.${jobId},carpentry_job_id.eq.${jobId}`);
      const { data, error } = await q.select("id");
      if (error) return err(res, 500, translateDbError(error));
      updated += (data?.length || 0);
    }
    return ok(res, { updated });
  });

  // ── Worker allocations (W16-A1) ─────────────────────────────────────────────

  app.get("/api/worker/allocations/today", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller?.id, sb);
    if (!emp) return err(res, 403, "No employee record found");

    const today = todayYmd();
    const tomorrow = addDaysYmd(today, 1);
    const { data, error } = await sb.from("workforce_allocations")
      .select(ALLOCATION_SELECT)
      .eq("employee_id", emp.id)
      .in("allocation_date", [today, tomorrow])
      .order("allocation_date", { ascending: true });
    if (error) return err(res, 500, translateDbError(error));

    const formatted = (data || []).map(formatAllocation);
    await attachAllocationColors(sb, formatted);
    await attachChargeUpSites(sb, formatted);   // BLB Charge Up: show the specific site, not just the category
    const byDate = {};
    for (const a of formatted) byDate[a.allocationDate] = a;
    ok(res, { today: byDate[today] ?? null, tomorrow: byDate[tomorrow] ?? null });
  });

  app.get("/api/worker/allocations/week", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller?.id, sb);
    if (!emp) return err(res, 403, "No employee record found");

    // Accept an explicit from/to range (the worker calendar passes the visible month); default to
    // the current Mon–Sun week.
    const from = req.query.from || mondayOf(req.query.weekStart || todayYmd());
    const to = req.query.to || addDaysYmd(from, 6);
    const { data, error } = await sb.from("workforce_allocations")
      .select(ALLOCATION_SELECT)
      .eq("employee_id", emp.id)
      .gte("allocation_date", from)
      .lte("allocation_date", to)
      .order("allocation_date", { ascending: true });
    if (error) return err(res, 500, translateDbError(error));
    const allocations = (data || []).map(formatAllocation);
    await attachAllocationColors(sb, allocations);
    await attachChargeUpSites(sb, allocations);   // BLB Charge Up: show the specific site, not just the category
    ok(res, { weekStart: from, weekEnd: to, allocations });
  });

  // ── CSV export (for History tab) ─────────────────────────────────────────

  app.get("/api/workforce/timesheets/export.csv", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const isDirector = req.caller.role === "admin";
    const { date_from, date_to, employee_id, project_id } = req.query;

    let q = sb.from("timesheet_entries")
      .select("*, timesheets!inner(date, status, employees(name, trade), projects(address))")
      .in("timesheets.status", ["approved", "submitted"]);
    if (date_from) q = q.gte("timesheets.date", date_from);
    if (date_to) q = q.lte("timesheets.date", date_to);
    if (employee_id) q = q.eq("timesheets.employees.id", employee_id);
    if (project_id) q = q.eq("timesheets.project_id", project_id);
    q = q.order("timesheets.date", { ascending: false });

    const { data: entries } = await q;

    const headers = ["Date", "Employee", "Trade", "Project", "Task", "Hours", "Overtime Hours", "Status"];
    if (isDirector) headers.push("Cost");

    const rows = (entries || []).map(e => {
      const row = [
        e.timesheets?.date || "",
        e.timesheets?.employees?.name || "",
        e.timesheets?.employees?.trade || "",
        e.timesheets?.projects?.address || "",
        TASK_LABELS[e.task_category] || e.task_category,
        e.hours,
        e.overtime_hours || 0,
        e.timesheets?.status || "",
      ];
      if (isDirector) row.push(e.cost_amount != null ? Number(e.cost_amount).toFixed(2) : "");
      return row;
    });

    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="timesheets-export.csv"');
    res.send(csv);
  });

  // ── Day-off requests (worker + admin) — mig 139 ─────────────────────────────
  // Worker submits a DATE RANGE (date_from…date_to inclusive; single day = both
  // equal) → lands 'submitted' → Workforce Approvals "Time off" tab reviews it.
  // On approve, each day in the range becomes a workforce_employee_rdo_dates row
  // (mig 119) — reuses the existing RDO look, zero planner-code change. The
  // created row ids are tracked on the request (applied_rdo_ids) so a later
  // reject can delete exactly those rows and clear the trail.
  const MAX_DAY_OFF_RANGE_DAYS = 60;

  function isValidYmd(v) {
    if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const [y, m, d] = v.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() + 1 === m && dt.getUTCDate() === d;
  }

  // Inclusive list of YYYY-MM-DD dates from dateFrom to dateTo. Local (noon-anchored)
  // date math via addDaysYmd — no UTC/TZ drift. guard caps runaway loops defensively;
  // callers validate the range size (MAX_DAY_OFF_RANGE_DAYS) before this ever runs.
  function enumerateDateRange(dateFrom, dateTo) {
    const out = [];
    let cur = dateFrom;
    let guard = 0;
    while (cur <= dateTo && guard < 400) {
      out.push(cur);
      cur = addDaysYmd(cur, 1);
      guard++;
    }
    return out;
  }

  // Shared by worker create + admin edit. Returns an error message, or null if valid.
  function validateDayOffRange(dateFrom, dateTo) {
    if (!isValidYmd(dateFrom) || !isValidYmd(dateTo)) return "dateFrom and dateTo must be valid dates (YYYY-MM-DD).";
    if (dateTo < dateFrom) return "dateTo must be on or after dateFrom.";
    if (enumerateDateRange(dateFrom, dateTo).length > MAX_DAY_OFF_RANGE_DAYS) return `Requests cannot span more than ${MAX_DAY_OFF_RANGE_DAYS} days.`;
    return null;
  }

  // Worker: submit a request. Employee is ALWAYS resolved server-side from the
  // caller's token/session — never trust an employee_id in the body.
  app.post("/api/worker/day-off-requests", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return err(res, 403, "No employee record found");

    const dateFrom = String(req.body.dateFrom || "").trim();
    const dateTo = String(req.body.dateTo || "").trim();
    const rangeError = validateDayOffRange(dateFrom, dateTo);
    if (rangeError) return err(res, 400, rangeError);
    const reason = req.body.reason ? String(req.body.reason).trim() : null;

    const { data, error } = await sb.from("workforce_day_off_requests").insert({
      employee_id: emp.id,
      date_from: dateFrom,
      date_to: dateTo,
      reason: reason || null,
      status: "submitted",
    }).select().single();
    if (error) {
      if (plannerTableMissing(error)) return err(res, 503, "Time-off requests need migration 139 applied", "MIGRATION_PENDING");
      return err(res, 500, translateDbError(error));
    }
    ok(res, { request: rowToCamel(data) });
  });

  // Worker: own requests ONLY — never another employee's.
  app.get("/api/worker/day-off-requests", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return err(res, 403, "No employee record found");

    const { data, error } = await sb.from("workforce_day_off_requests")
      .select("*")
      .eq("employee_id", emp.id)
      .order("submitted_at", { ascending: false });
    if (error) {
      if (plannerTableMissing(error)) return ok(res, { requests: [] });
      return err(res, 500, translateDbError(error));
    }
    ok(res, { requests: rowsToCamel(data) });
  });

  // Admin/supervisor: list requests (defaults to pending) with the employee name joined.
  app.get("/api/workforce/day-off-requests", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    let q = sb.from("workforce_day_off_requests").select("*, employees!employee_id(id, name)");
    q = req.query.status ? q.eq("status", req.query.status) : q.eq("status", "submitted");
    const { data, error } = await q.order("submitted_at", { ascending: true });
    if (error) {
      if (plannerTableMissing(error)) return ok(res, { requests: [] });
      return err(res, 500, translateDbError(error));
    }
    ok(res, { requests: rowsToCamel(data) });
  });

  // Admin only: approve — writes one RDO row per day in the range (skips a date that
  // already has an RDO for this employee rather than failing the whole approval).
  app.post("/api/workforce/day-off-requests/:id/approve", requireAuth, requireRole("admin"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!isUuid(req.params.id)) return err(res, 400, "Invalid request id.");
    const { data: reqRow, error: loadErr } = await sb.from("workforce_day_off_requests").select("*").eq("id", req.params.id).maybeSingle();
    if (loadErr) {
      if (plannerTableMissing(loadErr)) return err(res, 503, "Time-off requests need migration 139 applied", "MIGRATION_PENDING");
      return err(res, 500, translateDbError(loadErr));
    }
    if (!reqRow) return err(res, 404, "Time-off request not found.", "NOT_FOUND");
    if (reqRow.status !== "submitted") return err(res, 409, "Only pending requests can be approved.", "NOT_SUBMITTED");

    const dates = enumerateDateRange(reqRow.date_from, reqRow.date_to);
    const appliedIds = [];
    for (const rdoDate of dates) {
      const { data: rdoRow, error: rdoErr } = await sb.from("workforce_employee_rdo_dates").insert({
        employee_id: reqRow.employee_id,
        rdo_date: rdoDate,
        note: "Approved leave",
        created_by: req.caller.id,
      }).select("id").single();
      if (rdoErr) {
        if (rdoErr.code === "23505") continue; // that date is already an RDO for this employee — skip, don't fail
        if (plannerTableMissing(rdoErr)) return err(res, 503, "Needs migration 119 applied", "MIGRATION_PENDING");
        return err(res, 500, translateDbError(rdoErr));
      }
      if (rdoRow?.id) appliedIds.push(rdoRow.id);
    }

    const { data: updated, error: updErr } = await sb.from("workforce_day_off_requests").update({
      status: "approved",
      applied_rdo_ids: appliedIds,
      reviewed_by: req.caller.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", req.params.id).select().single();
    if (updErr) return err(res, 500, translateDbError(updErr));
    ok(res, { request: rowToCamel(updated) });
  });

  // Admin/supervisor: reject — if it was approved, delete the RDO rows it created first.
  app.post("/api/workforce/day-off-requests/:id/reject", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!isUuid(req.params.id)) return err(res, 400, "Invalid request id.");
    const { data: reqRow, error: loadErr } = await sb.from("workforce_day_off_requests").select("*").eq("id", req.params.id).maybeSingle();
    if (loadErr) {
      if (plannerTableMissing(loadErr)) return err(res, 503, "Time-off requests need migration 139 applied", "MIGRATION_PENDING");
      return err(res, 500, translateDbError(loadErr));
    }
    if (!reqRow) return err(res, 404, "Time-off request not found.", "NOT_FOUND");

    if (reqRow.status === "approved" && Array.isArray(reqRow.applied_rdo_ids) && reqRow.applied_rdo_ids.length) {
      const { error: delErr } = await sb.from("workforce_employee_rdo_dates").delete().in("id", reqRow.applied_rdo_ids);
      if (delErr) return err(res, 500, translateDbError(delErr));
    }

    const { data: updated, error: updErr } = await sb.from("workforce_day_off_requests").update({
      status: "rejected",
      rejection_notes: req.body.notes || null,
      applied_rdo_ids: [],
      reviewed_by: req.caller.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", req.params.id).select().single();
    if (updErr) return err(res, 500, translateDbError(updErr));
    ok(res, { request: rowToCamel(updated) });
  });

  // Admin/supervisor: edit dates/reason — only while still pending.
  app.patch("/api/workforce/day-off-requests/:id", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!isUuid(req.params.id)) return err(res, 400, "Invalid request id.");
    const { data: reqRow, error: loadErr } = await sb.from("workforce_day_off_requests").select("*").eq("id", req.params.id).maybeSingle();
    if (loadErr) {
      if (plannerTableMissing(loadErr)) return err(res, 503, "Time-off requests need migration 139 applied", "MIGRATION_PENDING");
      return err(res, 500, translateDbError(loadErr));
    }
    if (!reqRow) return err(res, 404, "Time-off request not found.", "NOT_FOUND");
    if (reqRow.status !== "submitted") return err(res, 409, "Only pending requests can be edited.", "NOT_SUBMITTED");

    const dateFrom = req.body.dateFrom !== undefined ? String(req.body.dateFrom || "").trim() : reqRow.date_from;
    const dateTo = req.body.dateTo !== undefined ? String(req.body.dateTo || "").trim() : reqRow.date_to;
    const rangeError = validateDayOffRange(dateFrom, dateTo);
    if (rangeError) return err(res, 400, rangeError);

    const update = { date_from: dateFrom, date_to: dateTo, updated_at: new Date().toISOString() };
    if ("reason" in req.body) update.reason = req.body.reason ? String(req.body.reason).trim() : null;

    const { data: updated, error: updErr } = await sb.from("workforce_day_off_requests").update(update).eq("id", req.params.id).select().single();
    if (updErr) return err(res, 500, translateDbError(updErr));
    ok(res, { request: rowToCamel(updated) });
  });

  console.log("[workforce] routes registered");
}
