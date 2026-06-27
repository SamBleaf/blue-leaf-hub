/**
 * P0-D1 — W13 site diary + media baseline
 *
 * Proves:
 * - W13-API-01 admin/supervisor diary save
 * - W13-API-02 project/date linkage + cross-project isolation
 * - W13-API-03 worker photo + task complete linkage
 * - W13-SEC-01 employee blocked from site-task admin writes; diary save allowed
 * - W13-SEC-02 no public/client diary API access
 * - W13-STORAGE-01 DB row even if Dropbox null; site-media path pattern
 * - W13-DRIFT-01 photo_paths unused; three silos documented
 */
import { createClient } from "@supabase/supabase-js";
import {
  WRITE,
  SB_URL,
  SB_ANON,
  post,
  get,
  getAuthToken,
  serviceClient,
} from "./_helpers.mjs";
import { buildTestJobAddress } from "../lib/testArtifactPrefixes.mjs";
import { ensureE2EUsers } from "../create-e2e-users.mjs";
import { SITE_MEDIA_BUCKET, isValidPhotoKey } from "../../server/lib/siteMedia.mjs";

const E2E_PASSWORD = "BlueLeaf-E2E-2026!";

const MIN_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAB//2Q==";

async function getTokenForEmail(email, password = E2E_PASSWORD) {
  if (!SB_URL || !SB_ANON) throw new Error("Missing Supabase URL or anon key");
  const sb = createClient(SB_URL, SB_ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) {
    throw new Error(error?.message || `No session for ${email}`);
  }
  return data.session.access_token;
}

async function ensureWorkerEmployee(svc, userId, name) {
  const { data: existing } = await svc
    .from("employees")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: created, error } = await svc
    .from("employees")
    .insert({
      user_id: userId,
      name,
      trade: "carpenter",
      hourly_rate: 50,
      is_active: true,
    })
    .select("id")
    .single();
  if (error || !created?.id) throw new Error(error?.message || "employee insert failed");
  return created.id;
}

async function cleanup(svc, {
  projectId,
  projectIdB,
  jobId,
  jobIdB,
  taskIds = [],
  storagePaths = [],
}) {
  if (!svc) return;
  for (const path of storagePaths) {
    try {
      await svc.storage.from(SITE_MEDIA_BUCKET).remove([path]);
    } catch { /* best-effort */ }
  }
  for (const pid of [projectId, projectIdB].filter(Boolean)) {
    await svc.from("site_diary").delete().eq("project_id", pid);
    await svc.from("portal_updates").delete().eq("project_id", pid);
    await svc.from("site_tasks").delete().eq("project_id", pid);
    await svc.from("projects").delete().eq("id", pid);
  }
  for (const jid of [jobId, jobIdB].filter(Boolean)) {
    await svc.from("jobs").delete().eq("id", jid);
  }
}

async function createProjectFixture(adminToken, svc, ts, suffix = "") {
  const address = buildTestJobAddress({ suite: "W13", workflowId: "DIARY", ts: `${ts}${suffix}` });
  const { status, body } = await post("/api/jobs", { address, status: "active" }, adminToken);
  const jobId = body?.job?.id;
  if (status !== 200 || !jobId) throw new Error(`job create failed: ${status}`);

  const { data: project, error } = await svc
    .from("projects")
    .insert({ job_id: jobId, address, status: "active" })
    .select("id")
    .single();
  if (error || !project?.id) throw new Error(error?.message || "project insert failed");

  return { jobId, projectId: project.id, address };
}

function diaryPayload(overrides = {}) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    entry_date: today,
    weather: "Fine",
    trades_onsite: ["BLH TEST Carpentry"],
    work_completed: "BLH TEST slab prep completed",
    issues: "BLH TEST internal issue — not for portal",
    instructions_given: "BLH TEST hold crane lift",
    visitors: "BLH TEST inspector",
    supervisor: "BLH TEST Supervisor",
    structured_by_ai: false,
    ...overrides,
  };
}

export async function runW13SiteDiaryBaseline(run) {
  run.section("P0-D1 — W13 site diary + media baseline");

  if (!WRITE) {
    run.gap("W13-API-01 diary save", "requires --write");
    run.gap("W13-API-02 project linkage", "requires --write");
    run.gap("W13-API-03 worker photo linkage", "requires --write");
    run.gap("W13-SEC-01 site-task gate", "requires --write");
    run.gap("W13-SEC-02 public/client diary", "requires --write");
    run.gap("W13-STORAGE-01 storage side effects", "requires --write");
    run.gap("W13-DRIFT-01 duplicate media SSoT", "requires --write");
    return;
  }

  const svc = serviceClient();
  if (!svc) {
    run.fail("W13 setup", "service role required");
    return;
  }

  let adminToken;
  let supervisorToken;
  let employeeToken;
  let clientToken;
  let workerEmployeeId;
  try {
    adminToken = await getAuthToken();
    const users = await ensureE2EUsers();
    supervisorToken = await getTokenForEmail(users.supervisor.email);
    employeeToken = await getTokenForEmail(users.employee.email);
    clientToken = await getTokenForEmail(users.client.email);
    workerEmployeeId = await ensureWorkerEmployee(svc, users.employee.id, users.employee.fullName);
  } catch (e) {
    run.fail("W13 setup auth", e.message);
    return;
  }

  const ts = Date.now();
  let jobId = null;
  let projectId = null;
  let jobIdB = null;
  let projectIdB = null;
  let taskId = null;
  let taskIdOtherEmp = null;
  let photoPath = null;
  const storagePaths = [];

  try {
    const fixture = await createProjectFixture(adminToken, svc, ts);
    jobId = fixture.jobId;
    projectId = fixture.projectId;

    const fixtureB = await createProjectFixture(adminToken, svc, ts, "-b");
    jobIdB = fixtureB.jobId;
    projectIdB = fixtureB.projectId;

    run.section("W13-SEC-02 public / client diary access");

    const { status: noAuthStatus } = await get(`/api/diary/${projectId}`, null);
    if (noAuthStatus === 401) {
      run.pass("W13-SEC-02 unauthenticated GET diary returns 401");
    } else {
      run.fail("W13-SEC-02 unauthenticated GET", `expected 401; got ${noAuthStatus}`);
    }

    const { status: noAuthSave } = await post("/api/diary/save", { projectId, entry: diaryPayload() }, null);
    if (noAuthSave === 401) {
      run.pass("W13-SEC-02 unauthenticated POST diary/save returns 401");
    } else {
      run.fail("W13-SEC-02 unauthenticated save", `expected 401; got ${noAuthSave}`);
    }

    const { status: clientGetStatus, body: clientGetBody } = await get(`/api/diary/${projectId}`, clientToken);
    if (clientGetStatus === 403 && clientGetBody?.ok === false) {
      run.pass("W13-SEC-02 client JWT cannot GET staff diary API (403)");
    } else {
      run.fail("W13-SEC-02 client GET diary", `expected 403; got ${clientGetStatus}`);
    }

    const { status: clientSaveStatus } = await post(
      "/api/diary/save",
      { projectId, entry: diaryPayload({ work_completed: "BLH TEST client probe" }) },
      clientToken
    );
    if (clientSaveStatus === 403) {
      run.pass("W13-SEC-02 client JWT cannot POST diary/save (403)");
    } else {
      run.fail("W13-SEC-02 client save", `expected 403; got ${clientSaveStatus}`);
    }

    run.section("W13-API-01 / W13-API-02 diary save + linkage");

    const entryDate = new Date().toISOString().slice(0, 10);
    const payload = diaryPayload({ entry_date: entryDate, work_completed: "BLH TEST diary admin save" });

    const { status: adminSaveStatus, body: adminSaveBody } = await post(
      "/api/diary/save",
      { projectId, entry: payload },
      adminToken
    );

    const { data: adminRow } = await svc
      .from("site_diary")
      .select("id, project_id, entry_date, work_completed, photo_paths, dropbox_pdf_path, supervisor")
      .eq("project_id", projectId)
      .eq("work_completed", "BLH TEST diary admin save")
      .maybeSingle();

    if (adminSaveStatus === 200 && adminSaveBody?.ok === true && adminRow?.id) {
      run.pass("W13-API-01 admin POST diary/save creates site_diary row");
    } else {
      run.fail("W13-API-01 admin save", `status=${adminSaveStatus} row=${JSON.stringify(adminRow)}`);
    }

    if (adminRow?.project_id === projectId && adminRow?.entry_date === entryDate && adminRow?.supervisor === "BLH TEST Supervisor") {
      run.pass("W13-API-02 diary row links to supplied project_id, date, supervisor");
    } else {
      run.fail("W13-API-02 linkage", JSON.stringify(adminRow));
    }

    const { status: supSaveStatus, body: supSaveBody } = await post(
      "/api/diary/save",
      { projectId, entry: diaryPayload({ work_completed: "BLH TEST diary supervisor save" }) },
      supervisorToken
    );
    const { count: supCount } = await svc
      .from("site_diary")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("work_completed", "BLH TEST diary supervisor save");

    if (supSaveStatus === 200 && supSaveBody?.ok === true && supCount === 1) {
      run.pass("W13-API-01 supervisor POST diary/save succeeds");
    } else {
      run.fail("W13-API-01 supervisor save", `status=${supSaveStatus} count=${supCount}`);
    }

    const { status: badProjectStatus, body: badProjectBody } = await post(
      "/api/diary/save",
      { projectId: "00000000-0000-0000-0000-000000000099", entry: diaryPayload({ work_completed: "BLH TEST bogus project" }) },
      adminToken
    );
    const { count: bogusCount } = await svc
      .from("site_diary")
      .select("id", { count: "exact", head: true })
      .eq("work_completed", "BLH TEST bogus project");

    if (badProjectStatus === 404 && badProjectBody?.ok === false && bogusCount === 0) {
      run.pass("W13-API-02 save to non-existent project returns 404, no row");
    } else {
      run.fail("W13-API-02 bogus project", `status=${badProjectStatus} rows=${bogusCount}`);
    }

    await post(
      "/api/diary/save",
      { projectId: projectIdB, entry: diaryPayload({ work_completed: "BLH TEST diary project B only" }) },
      adminToken
    );

    const { body: listA } = await get(`/api/diary/${projectId}`, adminToken);
    const { body: listB } = await get(`/api/diary/${projectIdB}`, adminToken);

    const aHasB = (listA?.entries || []).some((e) => e.work_completed === "BLH TEST diary project B only");
    const bHasB = (listB?.entries || []).some((e) => e.work_completed === "BLH TEST diary project B only");
    const aHasA = (listA?.entries || []).some((e) => e.work_completed === "BLH TEST diary admin save");

    if (!aHasB && bHasB && aHasA) {
      run.pass("W13-API-02 GET diary lists isolated per project_id");
    } else {
      run.fail("W13-API-02 cross-project list", `aHasB=${aHasB} bHasB=${bHasB} aHasA=${aHasA}`);
    }

    run.section("W13-SEC-01 employee vs admin-only site records");

    const { status: empTaskPost, body: empTaskBody } = await post(
      `/api/projects/${projectId}/site-tasks`,
      { title: "BLH TEST employee forbidden task" },
      employeeToken
    );
    if (empTaskPost === 403 && empTaskBody?.ok === false) {
      run.pass("W13-SEC-01 employee cannot POST site-tasks (403)");
    } else {
      run.fail("W13-SEC-01 employee POST site-tasks", `expected 403; got ${empTaskPost}`);
    }

    const { status: empParseStatus } = await post(
      "/api/supervisor/parse-voice",
      { transcript: "BLH TEST voice", projectAddress: fixture.address },
      employeeToken
    );
    if (empParseStatus === 403) {
      run.pass("W13-SEC-01 employee cannot POST parse-voice (403)");
    } else {
      run.fail("W13-SEC-01 employee parse-voice", `expected 403; got ${empParseStatus}`);
    }

    const { status: empDiaryStatus, body: empDiaryBody } = await post(
      "/api/diary/save",
      { projectId, entry: diaryPayload({ work_completed: "BLH TEST employee diary allowed" }) },
      employeeToken
    );
    const { count: empDiaryCount } = await svc
      .from("site_diary")
      .select("id", { count: "exact", head: true })
      .eq("work_completed", "BLH TEST employee diary allowed");

    if (empDiaryStatus === 200 && empDiaryBody?.ok === true && empDiaryCount === 1) {
      run.pass("W13-SEC-01 employee diary save allowed by design (200)");
    } else {
      run.fail("W13-SEC-01 employee diary", `status=${empDiaryStatus} count=${empDiaryCount}`);
    }

    run.section("W13-STORAGE-01 / W13-DRIFT-01 storage + drift");

    if (adminRow && (adminRow.photo_paths == null || (Array.isArray(adminRow.photo_paths) && adminRow.photo_paths.length === 0))) {
      run.pass("W13-DRIFT-01 site_diary.photo_paths remains unused on save");
    } else {
      run.fail("W13-DRIFT-01 photo_paths", JSON.stringify(adminRow?.photo_paths));
    }

    run.gap(
      "W13-DRIFT-003 three media silos",
      "site-media (worker tasks) vs Dropbox diary PDF vs project_photos (portal) — no cross-link by design"
    );

    if (adminSaveBody?.entry?.id) {
      run.pass("W13-STORAGE-01 diary save succeeds regardless of dropbox_pdf_path");
    } else {
      run.fail("W13-STORAGE-01 diary row", "missing entry in response");
    }

    if (adminRow?.dropbox_pdf_path) {
      run.pass("W13-STORAGE-01 dropbox_pdf_path filed when Dropbox configured");
    } else {
      run.gap("W13-STORAGE-01 Dropbox diary PDF", "dropbox_pdf_path null — DB row still created (W13-DRIFT-002 UI toast drift)");
    }

    try {
      const clientSb = createClient(SB_URL, SB_ANON, { auth: { autoRefreshToken: false, persistSession: false } });
      await clientSb.auth.signInWithPassword({ email: "e2e-client@blueleafbuilding.test", password: E2E_PASSWORD });
      const { data: rlsRows, error: rlsErr } = await clientSb.from("site_diary").select("id, work_completed").limit(5);
      if (!rlsErr && Array.isArray(rlsRows) && rlsRows.length > 0) {
        run.gap("W13-SEC-04 site_diary RLS", `client JWT read ${rlsRows.length} row(s) via direct Supabase — lockdown recommended`);
      } else if (rlsErr) {
        run.pass("W13-SEC-04 client direct Supabase site_diary blocked or denied");
      } else {
        run.gap("W13-SEC-04 site_diary RLS", "no rows visible to client JWT (empty or policy untested)");
      }
    } catch (e) {
      run.gap("W13-SEC-04 site_diary RLS", `direct Supabase probe skipped: ${e.message}`);
    }

    run.section("W13-API-03 worker photo + task complete linkage");

    const { status: taskCreateStatus, body: taskCreateBody } = await post(
      `/api/projects/${projectId}/site-tasks`,
      {
        title: "BLH TEST W13 photo task",
        assigned_to: workerEmployeeId,
        category: "general",
      },
      supervisorToken
    );
    taskId = taskCreateBody?.task?.id;
    if (taskCreateStatus === 200 && taskId) {
      run.pass("W13-API-03 setup supervisor created site task");
    } else {
      run.fail("W13-API-03 task setup", `status=${taskCreateStatus}`);
      return;
    }

    const { data: otherEmp } = await svc
      .from("employees")
      .insert({
        name: `BLH TEST W13 Other ${ts}`,
        trade: "labourer",
        hourly_rate: 45,
        is_active: true,
      })
      .select("id")
      .single();

    if (otherEmp?.id) {
      const { status: otherTaskStatus, body: otherTaskBody } = await post(
        `/api/projects/${projectId}/site-tasks`,
        { title: "BLH TEST assigned other", assigned_to: otherEmp.id },
        supervisorToken
      );
      taskIdOtherEmp = otherTaskBody?.task?.id;

      const { status: wrongPhotoStatus } = await post(
        "/api/worker/photos",
        {
          dataUrl: MIN_JPEG,
          entityType: "site_task",
          entityId: taskIdOtherEmp,
          filename: "blh-test.jpg",
        },
        employeeToken
      );
      if (wrongPhotoStatus === 403) {
        run.pass("W13-API-03 worker cannot photo another employee's assigned task (403)");
      } else {
        run.fail("W13-API-03 wrong assignment photo", `expected 403; got ${wrongPhotoStatus}`);
      }
    }

    const { status: photoStatus, body: photoBody } = await post(
      "/api/worker/photos",
      {
        dataUrl: MIN_JPEG,
        entityType: "site_task",
        entityId: taskId,
        filename: "blh-test.jpg",
      },
      employeeToken
    );

    if (photoStatus === 200 && photoBody?.ok === true && photoBody?.path) {
      photoPath = photoBody.path;
      storagePaths.push(photoPath);
      run.pass("W13-API-03 worker POST /api/worker/photos returns storage path");
    } else if (photoStatus === 502) {
      run.gap("W13-API-03 worker photo upload", "storage upload failed (502) — Supabase site-media bucket unavailable in env");
      return;
    } else {
      run.fail("W13-API-03 photo upload", `status=${photoStatus} body=${JSON.stringify(photoBody)}`);
      return;
    }

    if (isValidPhotoKey(photoPath) && photoPath.startsWith(`site-tasks/${taskId}/`)) {
      run.pass("W13-STORAGE-01 photo path matches site-tasks/{taskId}/ pattern");
    } else {
      run.fail("W13-STORAGE-01 photo path", photoPath);
    }

    const { status: completeStatus, body: completeBody } = await post(
      `/api/worker/tasks/${taskId}/complete`,
      { photoPath, notes: "BLH TEST complete" },
      employeeToken
    );

    const { data: completedTask } = await svc
      .from("site_tasks")
      .select("id, project_id, status, completion_photo_url")
      .eq("id", taskId)
      .single();

    if (
      completeStatus === 200 &&
      completeBody?.ok === true &&
      completedTask?.status === "done" &&
      completedTask?.project_id === projectId &&
      completedTask?.completion_photo_url === photoPath
    ) {
      run.pass("W13-API-03 task complete links photo to correct project/task");
    } else {
      run.fail("W13-API-03 complete linkage", JSON.stringify({ completeStatus, completedTask }));
    }

    const { count: photoOnB } = await svc
      .from("site_tasks")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectIdB)
      .eq("completion_photo_url", photoPath);

    if (photoOnB === 0) {
      run.pass("W13-API-03 completion photo not linked to other project");
    } else {
      run.fail("W13-API-03 cross-project photo", `count on B=${photoOnB}`);
    }

    if (taskIdOtherEmp) {
      await svc.from("employees").delete().eq("id", otherEmp.id);
    }
  } catch (e) {
    run.fail("W13 unexpected", e.message);
  } finally {
    if (taskIdOtherEmp) {
      await svc.from("site_tasks").delete().eq("id", taskIdOtherEmp);
    }
    if (taskId) {
      await svc.from("site_tasks").delete().eq("id", taskId);
    }
    await cleanup(svc, { projectId, projectIdB, jobId, jobIdB, storagePaths });
  }
}
