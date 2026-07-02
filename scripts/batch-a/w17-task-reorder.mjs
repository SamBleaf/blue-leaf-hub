/**
 * W17 — Worker task reorder (PUT /api/worker/tasks/reorder).
 * Supervisors (leading-hand token) / admins (preview) drag to reorder; workers see the
 * sort_order. This exercises the admin-preview path + the shared sort_order update + the
 * auth gate. __BLH TEST__ fixtures, cleaned up.
 */
import { WRITE, API, getAuthToken, serviceClient } from "./_helpers.mjs";

const PREFIX = "__BLH TEST__ W17RE";

export async function runW17TaskReorder(run) {
  run.section("W17 worker task reorder");
  const svc = serviceClient();
  if (!svc) { run.fail("Service client", "SUPABASE_SERVICE_ROLE_KEY not configured"); return; }

  if (!WRITE) {
    run.skip("W17-RE-01 reorder persists sort_order (admin preview)", "requires --write");
    run.skip("W17-RE-02 unauthenticated reorder rejected", "requires --write");
    return;
  }

  let token;
  try { token = await getAuthToken(); } catch (e) { run.fail("Auth token", e.message); return; }

  const ts = Date.now();
  let jobId = null;
  const taskIds = [];
  try {
    const { data: emp } = await svc.from("employees").select("id").eq("is_active", true).limit(1).maybeSingle();
    if (!emp?.id) { run.fail("W17-RE setup", "no active employee for preview"); return; }

    const { data: job } = await svc.from("carpentry_jobs")
      .insert({ reference: `W17RE-${ts}`, client_name: PREFIX, address: `${PREFIX} ${ts} St`, project_type: "other", status: "active" })
      .select().single();
    if (!job?.id) { run.fail("W17-RE setup", "could not create carpentry job"); return; }
    jobId = job.id;

    for (let i = 0; i < 3; i++) {
      const { data: t } = await svc.from("site_tasks")
        .insert({ carpentry_job_id: jobId, title: `${PREFIX} T${i}`, category: "general", priority: "normal", status: "open", task_audience: "worker", sort_order: i, created_via: "manual" })
        .select().single();
      taskIds.push(t.id);
    }

    // W17-RE-01 — reorder 0,1,2 → 2,0,1 via the admin-preview path.
    const newOrder = [taskIds[2], taskIds[0], taskIds[1]];
    const res = await fetch(`${API}/api/worker/tasks/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "x-preview-employee-id": emp.id },
      body: JSON.stringify({ jobId, jobType: "carpentry", orderedIds: newOrder }),
    });
    const body = await res.json().catch(() => ({}));
    const { data: rows } = await svc.from("site_tasks").select("id, sort_order").in("id", taskIds);
    const byId = Object.fromEntries((rows || []).map(r => [r.id, r.sort_order]));
    if (res.status === 200 && body.ok && byId[taskIds[2]] === 0 && byId[taskIds[0]] === 1 && byId[taskIds[1]] === 2) {
      run.pass("W17-RE-01 reorder persists sort_order (admin preview)");
    } else {
      run.fail("W17-RE-01 reorder persists sort_order", `status ${res.status} order ${JSON.stringify(byId)}`);
    }

    // W17-RE-02 — no auth → 401 (never touches the DB).
    const noAuth = await fetch(`${API}/api/worker/tasks/reorder`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, jobType: "carpentry", orderedIds: newOrder }),
    });
    if (noAuth.status === 401) run.pass("W17-RE-02 unauthenticated reorder rejected (401)");
    else run.fail("W17-RE-02 unauthenticated reorder rejected", `status ${noAuth.status}`);
  } finally {
    for (const id of taskIds) await svc.from("site_tasks").delete().eq("id", id);
    if (jobId) await svc.from("carpentry_jobs").delete().eq("id", jobId);
  }
}
