// portalScheduleSync.mjs — SC-4. Auto-feed the client portal's timeline from the REAL Ops schedule,
// so the client sees the actual build program (one source of truth), not a hand-maintained copy.
// Only client-facing build stages cross over — the internal detail (buffers, building-notification
// hold-points, inspections) never reaches the client view. Upserts by a stable per-stage key so a
// re-sync PRESERVES any achieved dates + hero photos already attached to a milestone.
export async function syncPortalMilestonesFromSchedule(sb, projectId) {
  if (!sb || !projectId) return { ok: false, synced: 0, reason: "no project" };
  const { data: tasks } = await sb.from("schedule_tasks")
    .select("name, phase, end_date, is_hold_point, task_type")
    .eq("project_id", projectId).is("deleted_at", null)
    .order("start_date", { ascending: true, nullsFirst: false });
  // Client-facing build stages only — exclude hold-points / inspections (internal notifications).
  const stages = (tasks || []).filter((t) => !t.is_hold_point && t.task_type !== "inspection" && t.end_date);
  if (!stages.length) return { ok: true, synced: 0 };

  const seen = new Set();
  const rows = [];
  stages.forEach((t, i) => {
    let key = `sched:${t.phase || "stage"}`;
    if (seen.has(key)) key = `${key}:${i}`;   // guard against a repeated phase
    seen.add(key);
    // NOTE: achieved_at + hero_photo_id are deliberately NOT in the payload → preserved on re-sync.
    rows.push({ project_id: projectId, key, label: t.name, eta: t.end_date, sort_order: i });
  });

  const { error } = await sb.from("portal_milestones").upsert(rows, { onConflict: "project_id,key" });
  if (error) return { ok: false, synced: 0, error: error.message };

  // Remove schedule-sourced milestones whose stage no longer exists (keeps the timeline in step).
  const { data: existing } = await sb.from("portal_milestones").select("id, key").eq("project_id", projectId).like("key", "sched:%");
  const stale = (existing || []).filter((m) => !seen.has(m.key)).map((m) => m.id);
  if (stale.length) await sb.from("portal_milestones").delete().in("id", stale);

  return { ok: true, synced: rows.length };
}
