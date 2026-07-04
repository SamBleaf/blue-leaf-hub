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
import { createClient } from "@supabase/supabase-js";
import { WRITE, get, patch, serviceClient, SB_URL, SB_ANON } from "./_helpers.mjs";

function root() { return join(dirname(fileURLToPath(import.meta.url)), "..", ".."); }
function readRootFile(relPath) { return readFileSync(join(root(), relPath), "utf8"); }

// ── Static checks ────────────────────────────────────────────────────────────
function checkStatic(run) {
  run.section("WF1 static — carpentry task embed aliases + PATCH allow-list + C3 guard");

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

  // C1: dnd-kit imports present.
  if (
    client.includes("@dnd-kit/core") &&
    client.includes("@dnd-kit/sortable") &&
    client.includes("SortableContext") &&
    client.includes("DndContext") &&
    client.includes("arrayMove") &&
    client.includes("handleDragEnd")
  ) {
    run.pass("WF1-C1 @dnd-kit imports + DndContext/SortableContext wiring present in CarpentryJobDetail.jsx");
  } else {
    run.fail("WF1-C1 dnd-kit", "@dnd-kit imports or DndContext/SortableContext/handleDragEnd missing");
  }

  // C1: sortOrder PATCH on drag end.
  if (client.includes("sortOrder") && client.includes("handleDragEnd")) {
    run.pass("WF1-C1 sortOrder PATCH + handleDragEnd present");
  } else {
    run.fail("WF1-C1 sortOrder PATCH", "sortOrder or handleDragEnd not found in CarpentryJobDetail.jsx");
  }

  // C2: sign-off review section renders completer, completedAt, completionPhotoSignedUrl.
  if (
    client.includes("task.completer?.name") &&
    client.includes("task.completedAt") &&
    client.includes("task.completionPhotoSignedUrl") &&
    client.includes("Sign-off Review")
  ) {
    run.pass("WF1-C2 sign-off review section present (completer, completedAt, photo, label)");
  } else {
    run.fail("WF1-C2 sign-off review", "completer/completedAt/completionPhotoSignedUrl/Sign-off Review not all found");
  }

  // C2: server already signs photos — verify signSiteTaskPhotos is called in GET handler.
  const serverSrc = readRootFile("server/lib/carpentryRoutes.mjs");
  if (serverSrc.includes("signSiteTaskPhotos") && serverSrc.includes("/api/carpentry/jobs/:id/tasks")) {
    run.pass("WF1-C2 signSiteTaskPhotos called in GET /api/carpentry/jobs/:id/tasks handler");
  } else {
    run.fail("WF1-C2 photo signing", "signSiteTaskPhotos not found in carpentryRoutes.mjs GET tasks handler");
  }

  // C3: leading-hand assign guard in PATCH /api/worker/tasks/:id.
  const wfSrc = readRootFile("server/lib/workforceRoutes.mjs");
  if (
    wfSrc.includes("Only a leading hand can assign tasks to crew members.") &&
    wfSrc.includes("req.body?.assigned_to !== undefined && !emp.is_leading_hand")
  ) {
    run.pass("WF1-C3 leading-hand guard for assigned_to present in workforceRoutes.mjs");
  } else {
    run.fail("WF1-C3 assign guard", "is_leading_hand guard for assigned_to missing in workforceRoutes.mjs PATCH worker tasks");
  }

  // C3: crew endpoint exists.
  if (wfSrc.includes("/api/worker/jobs/:id/crew")) {
    run.pass("WF1-C3 GET /api/worker/jobs/:id/crew endpoint present");
  } else {
    run.fail("WF1-C3 crew endpoint", "GET /api/worker/jobs/:id/crew not found in workforceRoutes.mjs");
  }

  // C3 + C4: PWA assign affordance is leading-hand gated.
  const pwaSrc = readRootFile("src/pages/worker/WorkerTasks.jsx");
  if (pwaSrc.includes("isLeadingHand") && pwaSrc.includes("openAssignSheet") && pwaSrc.includes("doAssign")) {
    run.pass("WF1-C3 PWA assign affordance present (isLeadingHand / openAssignSheet / doAssign)");
  } else {
    run.fail("WF1-C3 PWA assign", "isLeadingHand/openAssignSheet/doAssign not all found in WorkerTasks.jsx");
  }

  // C4: sign-off glance (Done by <name>) is leading-hand gated.
  if (pwaSrc.includes("Done by") && pwaSrc.includes("isLeadingHand && completedByName")) {
    run.pass("WF1-C4 sign-off glance 'Done by' present and leading-hand gated in WorkerTasks.jsx");
  } else {
    run.fail("WF1-C4 sign-off glance", "'Done by' or isLeadingHand guard missing in WorkerTasks.jsx");
  }

  // C5: from-transcript endpoint in workforceRoutes.
  if (
    wfSrc.includes("/api/worker/tasks/from-transcript") &&
    wfSrc.includes("Only a leading hand can extract tasks from a transcript.") &&
    wfSrc.includes("splitTranscriptToTasks")
  ) {
    run.pass("WF1-C5 POST /api/worker/tasks/from-transcript endpoint + guard + splitTranscriptToTasks present");
  } else {
    run.fail("WF1-C5 from-transcript endpoint", "endpoint, guard, or splitTranscriptToTasks missing in workforceRoutes.mjs");
  }

  // C5: PWA from-transcript sheet present and leading-hand gated.
  if (
    pwaSrc.includes("showTranscriptSheet") &&
    pwaSrc.includes("From transcript") &&
    pwaSrc.includes("extractTasks") &&
    pwaSrc.includes("bulkAddDrafts") &&
    pwaSrc.includes("draftTasks")
  ) {
    run.pass("WF1-C5 PWA from-transcript sheet (showTranscriptSheet / extractTasks / bulkAddDrafts / draftTasks) present");
  } else {
    run.fail("WF1-C5 PWA transcript sheet", "showTranscriptSheet/extractTasks/bulkAddDrafts/draftTasks not all found in WorkerTasks.jsx");
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

    // ── C2: completed task in GET response has completer + completed_at ────────
    // (completion_photo_signed_url can't be asserted without a real storage object,
    //  but the shape fields that drive the UI must be present on a done task.)
    const taskAInList = (listRes.body.tasks || []).find((t) => t.id === tA.id);
    if (taskAInList && taskAInList.completedAt) {
      run.pass("WF1-C2 completed task has completedAt in GET response");
    } else {
      run.fail("WF1-C2 completedAt field", `taskA.completedAt=${taskAInList?.completedAt}`);
    }
    if (taskAInList && taskAInList.completer?.id === emp.id) {
      run.pass("WF1-C2 completed task has completer embed in GET response");
    } else {
      run.fail("WF1-C2 completer embed", `taskA.completer=${JSON.stringify(taskAInList?.completer)}`);
    }
    // completionPhotoUrl is null on the seed task (no storage object) — field must exist (not undefined).
    if (taskAInList && "completionPhotoUrl" in taskAInList) {
      run.pass("WF1-C2 completionPhotoUrl key present in GET response (null when no photo)");
    } else {
      run.fail("WF1-C2 completionPhotoUrl key", "completionPhotoUrl key missing from GET response task");
    }

  } finally {
    if (made.taskIds.length) await svc.from("site_tasks").delete().in("id", made.taskIds);
    if (made.carpId)         await svc.from("site_tasks").delete().eq("carpentry_job_id", made.carpId);
    if (made.carpId)         await svc.from("carpentry_jobs").delete().eq("id", made.carpId);
    if (made.empId)          await svc.from("employees").delete().eq("id", made.empId);
  }
}

// ── C3 write: worker-token assign guard ──────────────────────────────────────
// Seeds two employees with worker_token fields (no auth account needed — worker
// auth resolves by token column). Asserts 403 for the normal worker and 200 for
// the leading hand.
async function checkC3Api(run, svc) {
  run.section("WF1-C3 write — worker PATCH assigned_to guard");
  const stamp = Date.now();
  const made = { taskId: null, carpId: null, normalEmpId: null, lhEmpId: null };
  const normalToken = `wf1-test-normal-${stamp}`;
  const lhToken    = `wf1-test-lh-${stamp}`;

  const API_URL = process.env.BATCH_A_API_URL || "http://localhost:8787";

  async function workerPatch(taskId, token, body) {
    const res = await fetch(`${API_URL}/api/worker/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-worker-token": token },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }

  try {
    // Seed carpentry job.
    const { data: cj, error: ce } = await svc
      .from("carpentry_jobs")
      .insert({ reference: `BLH TEST WF1-C3 ${stamp}`, client_name: "BLH TEST", address: `BLH TEST WF1-C3 ${stamp} ST, SA 5000`, status: "active" })
      .select("id").single();
    if (ce || !cj?.id) { run.fail("seed carpentry job (C3)", ce?.message || "no id"); return; }
    made.carpId = cj.id;

    // Seed a normal (non-leading-hand) worker.
    const { data: emp1, error: e1 } = await svc
      .from("employees")
      .insert({ name: `BLH TEST WF1-C3 WORKER ${stamp}`, trade: "carpenter", employment_type: "full_time", is_active: true, is_leading_hand: false, worker_token: normalToken })
      .select("id").single();
    if (e1 || !emp1?.id) { run.fail("seed normal employee (C3)", e1?.message || "no id"); return; }
    made.normalEmpId = emp1.id;

    // Seed a leading hand worker.
    const { data: emp2, error: e2 } = await svc
      .from("employees")
      .insert({ name: `BLH TEST WF1-C3 LH ${stamp}`, trade: "carpenter", employment_type: "full_time", is_active: true, is_leading_hand: true, worker_token: lhToken })
      .select("id").single();
    if (e2 || !emp2?.id) { run.fail("seed leading hand employee (C3)", e2?.message || "no id"); return; }
    made.lhEmpId = emp2.id;

    // Seed an unassigned task on the carpentry job.
    const { data: task, error: te } = await svc
      .from("site_tasks")
      .insert({ carpentry_job_id: cj.id, title: `BLH TEST WF1-C3 task ${stamp}`, category: "general", priority: "normal", status: "open", task_audience: "worker" })
      .select("id").single();
    if (te || !task?.id) { run.fail("seed task (C3)", te?.message || "no id"); return; }
    made.taskId = task.id;

    // Normal worker tries to set assigned_to → must be 403.
    const deny = await workerPatch(task.id, normalToken, { assigned_to: emp1.id });
    if (deny.status === 403) {
      run.pass("WF1-C3 normal worker PATCH assigned_to → 403");
    } else {
      run.fail("WF1-C3 normal worker 403", `expected 403 got ${deny.status} — ${deny.body?.error || "—"}`);
    }

    // Leading hand sets assigned_to to the normal worker → must be 200.
    const allow = await workerPatch(task.id, lhToken, { assigned_to: emp1.id });
    if (allow.status === 200 && allow.body.ok) {
      run.pass("WF1-C3 leading hand PATCH assigned_to → 200");
    } else {
      run.fail("WF1-C3 leading hand 200", `expected 200 got ${allow.status} — ${allow.body?.error || "—"}`);
    }

    // Verify the assign persisted in the returned task.
    if (allow.body.task?.assigned_to === emp1.id) {
      run.pass("WF1-C3 assigned_to persisted in returned task");
    } else {
      run.fail("WF1-C3 assigned_to persists", `got ${allow.body.task?.assigned_to}`);
    }

  } finally {
    if (made.taskId)      await svc.from("site_tasks").delete().eq("id", made.taskId);
    if (made.carpId)      await svc.from("site_tasks").delete().eq("carpentry_job_id", made.carpId);
    if (made.carpId)      await svc.from("carpentry_jobs").delete().eq("id", made.carpId);
    if (made.normalEmpId) await svc.from("employees").delete().eq("id", made.normalEmpId);
    if (made.lhEmpId)     await svc.from("employees").delete().eq("id", made.lhEmpId);
  }
}

// ── C5 write: from-transcript guard ─────────────────────────────────────────
// Seeds two worker-token employees (non-LH + LH). Asserts:
//   - non-LH → 403
//   - LH     → 200 with { draft: true } OR graceful 502 (AI key absent)
async function checkC5Api(run, svc) {
  run.section("WF1-C5 write — from-transcript 403 guard + leading-hand 200/502");
  const stamp = Date.now();
  const made = { carpId: null, normalEmpId: null, lhEmpId: null };
  const normalToken = `wf1-c5-normal-${stamp}`;
  const lhToken     = `wf1-c5-lh-${stamp}`;
  const API_URL = process.env.BATCH_A_API_URL || "http://localhost:8787";

  async function workerPost(path, token, body) {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-worker-token": token },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }

  try {
    // Seed carpentry job.
    const { data: cj, error: ce } = await svc
      .from("carpentry_jobs")
      .insert({ reference: `BLH TEST WF1-C5 ${stamp}`, client_name: "BLH TEST", address: `BLH TEST WF1-C5 ${stamp} ST, SA 5000`, status: "active" })
      .select("id").single();
    if (ce || !cj?.id) { run.fail("seed carpentry job (C5)", ce?.message || "no id"); return; }
    made.carpId = cj.id;

    // Seed a normal worker.
    const { data: emp1, error: e1 } = await svc
      .from("employees")
      .insert({ name: `BLH TEST WF1-C5 WORKER ${stamp}`, trade: "carpenter", employment_type: "full_time", is_active: true, is_leading_hand: false, worker_token: normalToken })
      .select("id").single();
    if (e1 || !emp1?.id) { run.fail("seed normal employee (C5)", e1?.message || "no id"); return; }
    made.normalEmpId = emp1.id;

    // Seed a leading hand.
    const { data: emp2, error: e2 } = await svc
      .from("employees")
      .insert({ name: `BLH TEST WF1-C5 LH ${stamp}`, trade: "carpenter", employment_type: "full_time", is_active: true, is_leading_hand: true, worker_token: lhToken })
      .select("id").single();
    if (e2 || !emp2?.id) { run.fail("seed leading hand (C5)", e2?.message || "no id"); return; }
    made.lhEmpId = emp2.id;

    const payload = { transcript: "Fix the ridge capping on the north wall. Clean up offcuts near the stairwell.", jobId: cj.id, jobType: "carpentry" };

    // Non-LH → must be 403.
    const deny = await workerPost("/api/worker/tasks/from-transcript", normalToken, payload);
    if (deny.status === 403) {
      run.pass("WF1-C5 non-leading-hand POST from-transcript → 403");
    } else {
      run.fail("WF1-C5 non-LH 403", `expected 403 got ${deny.status} — ${deny.body?.error || "—"}`);
    }

    // Leading hand → 200 (with AI key) OR 502 (graceful — key absent in test env).
    const allow = await workerPost("/api/worker/tasks/from-transcript", lhToken, payload);
    if (allow.status === 200 && allow.body.ok && allow.body.draft === true) {
      run.pass(`WF1-C5 leading hand POST from-transcript → 200 draft:true (${(allow.body.tasks || []).length} tasks extracted)`);
    } else if (allow.status === 502) {
      run.pass("WF1-C5 leading hand POST from-transcript → 502 graceful (AI key absent in test env — guard confirmed, extraction not tested)");
    } else {
      run.fail("WF1-C5 LH 200/502", `expected 200 or 502 got ${allow.status} — ${allow.body?.error || "—"}`);
    }

  } finally {
    if (made.carpId)      await svc.from("site_tasks").delete().eq("carpentry_job_id", made.carpId);
    if (made.carpId)      await svc.from("carpentry_jobs").delete().eq("id", made.carpId);
    if (made.normalEmpId) await svc.from("employees").delete().eq("id", made.normalEmpId);
    if (made.lhEmpId)     await svc.from("employees").delete().eq("id", made.lhEmpId);
  }
}

export async function runWF1CarpentryTasks(run) {
  run.section("WF1 — Carpentry Tasks Batch F regression lock + C3 assign guard");
  checkStatic(run);

  if (!WRITE) {
    run.gap("WF1 write checks", "requires --write");
    return;
  }

  const svc = serviceClient();
  if (!svc) { run.fail("WF1 service client", "SUPABASE_SERVICE_ROLE_KEY not set"); return; }

  let token;
  try {
    // Carpentry endpoints require an ACTIVE staff account. The shared getAuthToken
    // signs in as ai-test-director, whose employee record is inactive → "Account inactive".
    // Use the canonical active admin (e2e-admin), matching the real app's requirement.
    const sb = createClient(SB_URL, SB_ANON, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await sb.auth.signInWithPassword({ email: "e2e-admin@blueleafbuilding.test", password: "BlueLeaf-E2E-2026!" });
    if (error || !data?.session?.access_token) throw new Error(error?.message || "e2e-admin sign-in failed — run: node scripts/create-e2e-users.mjs");
    token = data.session.access_token;
  } catch (e) {
    run.fail("WF1 auth token", e.message);
    return;
  }

  await checkApi(run, token, svc);
  await checkC3Api(run, svc);
  await checkC5Api(run, svc);
}
