// taskAudit — records a site_task "delete" (soft delete to status 'wont_do') into site_task_deletions
// (mig 173). Wired into every path that can set a task to wont_do. FAIL-SOFT: an audit failure (or a
// missing table pre-mig-173) is logged and swallowed — it must NEVER block the delete itself.

// Record a task deletion. Snapshots the CURRENT row, so call this BEFORE the wont_do update.
// Skips if the task is already wont_do (avoids double-logging a re-delete).
export async function recordTaskDeletion(sb, { taskId, actorId = null, actorLabel = null, source = null }) {
  try {
    if (!sb || !taskId) return;
    const { data: t } = await sb.from("site_tasks").select("*").eq("id", taskId).maybeSingle();
    if (!t || t.status === "wont_do") return;
    await sb.from("site_task_deletions").insert({
      site_task_id: t.id,
      title: t.title ?? null,
      category: t.category ?? null,
      task_audience: t.task_audience ?? null,
      prior_status: t.status ?? null,
      carpentry_job_id: t.carpentry_job_id ?? null,
      project_id: t.project_id ?? null,
      charge_up_job_id: t.charge_up_job_id ?? null,
      assigned_to: t.assigned_to ?? null,
      snapshot: t,
      deleted_by: actorId,
      deleted_by_label: actorLabel,
      source,
    });
  } catch (e) {
    console.error("[taskAudit] recordTaskDeletion failed (non-fatal):", e?.message || e);
  }
}
