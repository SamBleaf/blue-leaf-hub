/**
 * labourAttribution.mjs — Phase 7 (carpentry de-island): the canonical labour
 * double-count guard.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PROBLEM
 * ─────────────────────────────────────────────────────────────────────────────
 * A timesheet row can carry BOTH a builder `timesheets.job_id` AND a
 * `timesheets.carpentry_job_id`:
 *   • The worker PWA (POST /api/worker/timesheets) normally sets only ONE —
 *     a carpentry job sets carpentry_job_id; a builder job sets project_id+job_id
 *     (server/lib/workforceRoutes.mjs, src/pages/worker/WorkerLogHours.jsx).
 *   • BUT the supervisor PATCH /api/workforce/timesheets/:id/carpentry-job adds a
 *     carpentry_job_id WITHOUT clearing job_id — so a row CAN end up with both.
 *
 * Today there is NO double-count, because the two rollups live in SEPARATE id
 * spaces and never combine:
 *   • Finance rolls labour up by  timesheets.job_id           (financeCCRoutes.mjs)
 *   • Carpentry rolls labour up by timesheets.carpentry_job_id (carpentryRoutes.mjs)
 *
 * Migration 082 adds carpentry_jobs.job_id (the upward link). The MOMENT any
 * rollup follows that link to fold carpentry labour INTO the parent builder job,
 * a row carrying BOTH ids would be counted twice (once directly by job_id, once
 * via the carpentry → job_id link). This module is the guard against that.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CANONICAL RULE  (count labour ONCE, under the BUILDER job when both apply)
 * ─────────────────────────────────────────────────────────────────────────────
 * When a timesheet has BOTH job_id AND carpentry_job_id set, the labour is
 * attributed to the BUILDER job_id and EXCLUDED from the carpentry-via-link
 * rollup. Rationale (consistent with how finance/reconcile already behave):
 *   1. Finance is the authoritative money path. financeCCRoutes already keys the
 *      labour rollup on timesheets.job_id and folds it into actual_costs /
 *      working margin. That number is validated against Buildexact by
 *      buildexactReconcile.mjs (Hub actuals vs Buildxact). The builder job is
 *      therefore the canonical home for labour whenever a job_id exists.
 *   2. The carpentry budget-vs-actual (carpentryRoutes GET /jobs/:id/budget and
 *      /summary) keys on carpentry_job_id and is UNCHANGED by this rule — it
 *      keeps counting every timesheet carrying its carpentry_job_id, exactly as
 *      it does today. The guard only affects a NEW *builder-job* rollup that
 *      tries to ADD carpentry-linked labour on top of the direct job_id labour.
 *   3. So: direct job_id labour is counted once (finance, unchanged). Carpentry's
 *      own rollup is counted once (carpentry, unchanged). A builder-job rollup
 *      that becomes carpentry-aware must ONLY add carpentry labour whose
 *      timesheet has NO job_id of its own (otherwise it's already in the direct
 *      total). That is exactly what excludeDoubleCounted() / labourTotalForJob()
 *      below enforce.
 *
 * NOTHING in this phase changes an existing number: this helper is additive and
 * is applied ONLY where a rollup is explicitly made carpentry-aware. No existing
 * call site is rewired in Phase 7 — folding carpentry into builder-job numbers is
 * a flagged recommendation (see CALL SITES below), deferred until it can be
 * live-tested + reconciled.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CALL SITES TO APPLY THIS GUARD (flagged — NOT changed in Phase 7)
 * ─────────────────────────────────────────────────────────────────────────────
 * If/when these rollups are made carpentry-aware (i.e. start following
 * carpentry_jobs.job_id), wrap their timesheet sets with this guard:
 *   • server/lib/financeCCRoutes.mjs  (command-centre + /summary labour rollup,
 *     ~L444-461): if it begins ALSO summing carpentry timesheets linked via
 *     carpentry_jobs.job_id == jobId, feed the carpentry set through
 *     excludeDoubleCounted() first (drop rows whose job_id is already this job).
 *   • Any future "builder job total labour incl. carpentry" report: use
 *     labourTotalForJob() so the union is de-duplicated by timesheet id.
 * The carpentry-own rollups (carpentryRoutes GET /jobs/:id/budget, /summary) need
 * NO change — they are the carpentry_job_id side and stay single-counted.
 */

/**
 * Decide which spine OWNS a timesheet's labour, given both possible links.
 * Canonical rule: builder job_id wins when both are present.
 *
 * @param {{ job_id?: string|null, carpentry_job_id?: string|null }} ts
 * @returns {"builder"|"carpentry"|"unattributed"}
 */
export function labourOwner(ts) {
  if (!ts) return "unattributed";
  if (ts.job_id) return "builder";            // builder job wins (incl. when both set)
  if (ts.carpentry_job_id) return "carpentry";
  return "unattributed";
}

/**
 * True when a timesheet carries BOTH links — the only rows at risk of being
 * double-counted by a carpentry-aware builder-job rollup.
 *
 * @param {{ job_id?: string|null, carpentry_job_id?: string|null }} ts
 * @returns {boolean}
 */
export function isDualAttributed(ts) {
  return Boolean(ts?.job_id && ts?.carpentry_job_id);
}

/**
 * Filter a list of carpentry-side timesheets (selected by carpentry_job_id) down
 * to ONLY those safe to add to a BUILDER-job labour total — i.e. rows that have
 * NO job_id of their own (so they aren't already counted in the direct job_id
 * total). Rows that ALSO carry a job_id are dropped here because they belong to
 * the builder job directly (canonical rule).
 *
 * Use this when a builder-job rollup follows carpentry_jobs.job_id and wants to
 * ADD the linked carpentry labour without double-counting.
 *
 * @param {Array<{ job_id?: string|null, carpentry_job_id?: string|null }>} carpentryTimesheets
 * @returns {Array} the subset whose labour is NOT already attributed to a builder job
 */
export function excludeDoubleCounted(carpentryTimesheets) {
  if (!Array.isArray(carpentryTimesheets)) return [];
  return carpentryTimesheets.filter((ts) => !ts?.job_id);
}

/**
 * De-duplicate a combined set of timesheets (direct builder + carpentry-linked)
 * by timesheet id, so any row appearing in both sources is counted ONCE. Use when
 * building a "builder job total labour incl. carpentry" figure.
 *
 * @param {Array<{ id: string }>} directJobTimesheets    selected by timesheets.job_id == jobId
 * @param {Array<{ id: string, job_id?: string|null }>} carpentryLinkedTimesheets selected via carpentry_jobs.job_id == jobId
 * @returns {Array} unique timesheets (direct rows kept; carpentry rows added only if not already present and not dual-attributed)
 */
export function dedupeTimesheetsForJob(directJobTimesheets, carpentryLinkedTimesheets) {
  const byId = new Map();
  for (const ts of directJobTimesheets || []) {
    if (ts?.id) byId.set(ts.id, ts);
  }
  for (const ts of excludeDoubleCounted(carpentryLinkedTimesheets || [])) {
    if (ts?.id && !byId.has(ts.id)) byId.set(ts.id, ts);
  }
  return [...byId.values()];
}

/**
 * Convenience: sum a numeric labour field across a de-duplicated builder-job
 * timesheet set. Pass an extractor that returns the row's labour cost (ex-GST).
 *
 * @param {Array} directJobTimesheets
 * @param {Array} carpentryLinkedTimesheets
 * @param {(ts:any)=>number} costOf
 * @returns {number} total labour, each timesheet counted once
 */
export function labourTotalForJob(directJobTimesheets, carpentryLinkedTimesheets, costOf) {
  const rows = dedupeTimesheetsForJob(directJobTimesheets, carpentryLinkedTimesheets);
  const total = rows.reduce((sum, ts) => sum + Number(costOf?.(ts) || 0), 0);
  return Math.round(total * 100) / 100;
}
