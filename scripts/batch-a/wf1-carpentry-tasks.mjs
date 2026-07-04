/**
 * WF1 — Carpentry tasks Batch F regression lock
 *
 * F1 lock: GET /api/carpentry/jobs/:id/tasks returns 200 (was 502 before the
 *   dual-embed alias fix). The query uses aliased PostgREST embeds:
 *   assigned:employees!assigned_to + completer:employees!completed_by.
 * F2 lock: PATCH /api/carpentry/tasks/:id { title } is accepted and persists.
 *
 * Static checks (always): verify the alias is present in the server source.
 * Write checks (--write): seed a carpentry job + two site_tasks (one with
 *   assigned_to + completed_by set so the embed is exercised); assert both
 *   routes; self-clean all fixtures.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { WRITE, get, patch, serviceClient, getAuthToken } from "./_helpers.mjs";

function root() { return join(dirname(fileURLToPath(import.meta.url)), "..", ".."); }
function readRootFile(relPath) { return readFileSync(join(root(), relPath), "utf8"); }

// ── Static checks ────────────────────────────────────────────────────────────
function checkStatic(run) {
  run.section("WF1 static — carpentry task embed aliases + PATCH allow-list");

  const src = readRootFile("server/lib/carpentryRoutes.mjs");

  // F1: both GET and PATCH use the aliased embed (no bare double-embed).
  if (
    src.includes("assigned:employees!assigned_to") &&
    src.includes("completer:employees!completed_by")
  ) {
    run.pass("WF1-F1 both embed aliases present in carpentryRoutes.mjs");
  } else {
    run.fail("WF1-F1 embed aliases", "assigned:/completer: aliases missing — 42712 bug still present");
  }

  // F1: the old collision pattern must be gone.
  const collisionPattern = /employees!assigned_to\(.*\),\s*employees!completed_by/;
  if (!collisionPattern.test(src)) {
    run.pass("WF1-F1 old dual-bare-embed collision pattern removed");
  } else {
    run.fail("WF1-F1 collision removed", "bare double employees embed still present");
  }

  // F2: title in PATCH allow-list.
  if (src.includes("patch.title = title.trim()")) {
    run.pass("WF1-F2 title accepted in PATCH /api/carpentry/tasks/:id");
  } else {
    run.fail("WF1-F2 PATCH title", "patch.title assignment missing in carpentryRoutes.mjs");
  }

  // F2: non-empty title validation.
  if (src.includes('"title must not be empty."')) {
    run.pass("WF1-F2 empty-title validation present");
  } else {
    run.fail("WF1-F2 title validation", 'validation string "title must not be empty." not found');
  }

  // Client: aliased keys used in CarpentryJobDetail.jsx.
  const client = readRootFile("src/pages/CarpentryJobDetail.jsx");
  if (client.includes("task.assigned?.name") && client.includes("task.completer?.name")) {
    run.pass("WF1-F1 client reads aliased embed keys (task.assigned / task.completer)");
  } else {
    run.fail("WF1-F1 client embed keys", "task.assigned?.name or task.completer?.name not found in CarpentryJobDetail.jsx");
  }

  // Client: old bare task.employees?.name must be gone.
  if (!client.includes("task.employees?.name")) {
    run.pass("WF1-F1 stale task.employees?.name references removed from client");
  } else {
    run.fail("WF1-F1 stale client key", "task.employees?.name still referenced in CarpentryJobDetail.jsx");
  }

  // Client: edit sheet present.
  if (client.includes("openEdit") && client.includes("saveEdit") && client.includes("editTask")) {
    run.pass("WF1-F2 edit sheet (openEdit/saveEdit/editTask) present in CarpentryJobDetail.jsx");
  } else {
    run.fail("WF1-F2 edit sheet", "openEdit/saveEdit/editTask not all found in CarpentryJobDetail.jsx");
  }
}

// ── Write checks ─────────────────────────────────────────────────────────────
async function checkApi(run, token, svc) {
  run.section("WF1 write — GET tasks 200 (F1) + PATCH title persists (F2)");
  const stamp = Date.now();
  const made = { carpId: null, taskIds: [], empId: null };
  try {
    // Seed a carpentry job.
    const { data: cj, error: ce } = await svc
      .from("carpentry_jobs")
      .insert({
        reference: `BLH TEST WF1 ${stamp}`,
        client_name: "BLH TEST",
        address: `BLH TEST WF1 ${stamp} ST, ADELAIDE SA 5000`,
        status: "active",
      })
      .select("id")
      .single();
    if (ce || !cj?.id) { run.fail("seed carpentry job", ce?.message || "no id returned"); return; }
    made.carpId = cj.id;

    // Seed a minimal employee (for assigned_to + completed_by so the embed is exercised).
    const { data: emp, error: ee } = await svc
      .from("employees")
      .insert({
        name: `BLH TEST WF1 EMP ${stamp}`,
        trade: "carpenter",
        employment_type: "full_time",
        is_active: true,
        is_leading_hand: false,
      })
      .select("id")
      .single();
    if (ee || !emp?.id) { run.fail("seed employee", ee?.message || "no id"); return; }
    made.empId = emp.id;

    // Seed task A — with assigned_to + completed_by so both embed columns are exercised.
    const { data: tA, error: teA } = await svc
      .from("site_tasks")
      .insert({
        carpentry_job_id: cj.id,
        title: `BLH TEST WF1 task-A ${stamp}`,
        category: "general",
        priority: "normal",
        status: "done",
        task_audience: "worker",
        assigned_to: emp.id,
        completed_by: emp.id,
        completed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (teA || !tA?.id) { run.fail("seed task A", teA?.message || "no id"); return; }
    made.taskIds.push(tA.id);

    // Seed task B — plain open task for PATCH test.
    const { data: tB, error: teB } = await svc
      .from("site_tasks")
      .insert({
        carpentry_job_id: cj.id,
        title: `BLH TEST WF1 task-B ${stamp}`,
        category: "general",
        priority: "normal",
        status: "open",
        task_audience: "worker",
      })
      .select("id")
      .single();
    if (teB || !tB?.id) { run.fail("seed task B", teB?.message || "no id"); return; }
    made.taskIds.push(tB.id);

    // ── F1: GET /api/carpentry/jobs/:id/tasks must return 200 ──────────────
    // (Before the alias fix this route always 502'd with error 42712.)
    const listRes = await get(`/api/carpentry/jobs/${cj.id}/tasks`, token);
    if (listRes.status === 200 && Array.isArray(listRes.body.tasks)) {
      run.pass(`WF1-F1 GET /api/carpentry/jobs/:id/tasks → 200 (${listRes.body.tasks.length} tasks)`);
    } else {
      run.fail("WF1-F1 GET tasks 200", `status=${listRes.status} error=${listRes.body?.error || "—"}`);
    }

    // F1: the returned tasks should include both seeded tasks (status != wont_do).
    // task A is 'done' → still returned. task B is 'open' → returned.
    const ids = (listRes.body.tasks || []).map((t) => t.id);
    if (ids.includes(tA.id) && ids.includes(tB.id)) {
      run.pass("WF1-F1 both seeded tasks present in response");
    } else {
      run.fail("WF1-F1 task ids in response", `tA(${ids.includes(tA.id)}) tB(${ids.includes(tB.id)})`);
    }

    // F1: the embed aliases are present in the returned shape (assigned / completer).
    const taskA = (listRes.body.tasks || []).find((t) => t.id === tA.id);
    if (taskA && taskA.assigned?.id === emp.id) {
      run.pass("WF1-F1 task.assigned embed returned correctly");
    } else {
      run.fail("WF1-F1 task.assigned embed", `taskA.assigned=${JSON.stringify(taskA?.assigned)}`);
    }
    if (taskA && taskA.completer?.id === emp.id) {
      run.pass("WF1-F1 task.completer embed returned correctly");
    } else {
      run.fail("WF1-F1 task.completer embed", `taskA.completer=${JSON.stringify(taskA?.completer)}`);
    }

    // ── F2: PATCH title accepted and persists ──────────────────────────────
    const newTitle = `BLH TEST WF1 edited ${stamp}`;
    const patchRes = await patch(`/api/carpentry/tasks/${tB.id}`, { title: newTitle }, token);
    if (patchRes.status === 200 && patchRes.body.ok) {
      run.pass("WF1-F2 PATCH /api/carpentry/tasks/:id { title } → 200");
    } else {
      run.fail("WF1-F2 PATCH title 200", `status=${patchRes.status} error=${patchRes.body?.error || "—"}`);
    }

    if (patchRes.body.task?.title === newTitle) {
      run.pass("WF1-F2 returned task.title matches the patched value");
    } else {
      run.fail("WF1-F2 title persists", `got "${patchRes.body.task?.title}"`);
    }

    // F2: empty title rejected.
    const emptyRes = await patch(`/api/carpentry/tasks/${tB.id}`, { title: "   " }, token);
    if (emptyRes.status === 400) {
      run.pass("WF1-F2 empty title → 400 validation error");
    } else {
      run.fail("WF1-F2 empty title validation", `expected 400 got ${emptyRes.status}`);
    }

  } finally {
    if (made.taskIds.length) await svc.from("site_tasks").delete().in("id", made.taskIds);
    if (made.carpId)         await svc.from("site_tasks").delete().eq("carpentry_job_id", made.carpId);
    if (made.carpId)         await svc.from("carpentry_jobs").delete().eq("id", made.carpId);
    if (made.empId)          await svc.from("employees").delete().eq("id", made.empId);
  }
}

export async function runWF1CarpentryTasks(run) {
  run.section("WF1 — Carpentry Tasks Batch F regression lock");
  checkStatic(run);

  if (!WRITE) {
    run.gap("WF1 write checks", "requires --write");
    return;
  }

  const svc = serviceClient();
  if (!svc) { run.fail("WF1 service client", "SUPABASE_SERVICE_ROLE_KEY not set"); return; }

  let token;
  try {
    token = await getAuthToken();
  } catch (e) {
    run.fail("WF1 auth token", e.message);
    return;
  }

  await checkApi(run, token, svc);
}
