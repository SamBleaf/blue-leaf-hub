/**
 * W18-P0-03 / W18-DRIFT-008 / W18-DRIFT-009 — client_visible photo enforcement
 *
 * Proves:
 * - W18-P0-03: GET /journey returns only project_photos where client_visible=true
 * - W18-DRIFT-008: GET /home recentPhotos omits hidden; includes visible
 * - W18-DRIFT-009: GET /media/:photoId returns 404 for hidden; visible reaches storage path
 * - W18-SEC-03: cross-project journey/media blocked
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
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

const E2E_PASSWORD = "BlueLeaf-E2E-2026!";
const CLIENT_EMAIL = "e2e-client@blueleafbuilding.test";
const CLIENT_B_EMAIL = "e2e-client-b@blueleafbuilding.test";
const HIDDEN_CAPTION = "__BLH TEST__ W18 hidden journey photo";
const VISIBLE_CAPTION = "__BLH TEST__ W18 visible journey photo";
const MILESTONE_KEY = "w18_test_frame";

async function getTokenForEmail(email, password = E2E_PASSWORD) {
  if (!SB_URL || !SB_ANON) throw new Error("Missing Supabase URL or anon key");
  const sb = createClient(SB_URL, SB_ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) {
    throw new Error(error?.message || `No session for ${email}`);
  }
  return data.session.access_token;
}

function journeyPhotoIds(body) {
  const ids = [];
  const captions = [];
  for (const st of body?.stages || []) {
    for (const p of st.photos || []) {
      if (p.id) ids.push(p.id);
      if (p.caption) captions.push(p.caption);
    }
  }
  return { ids, captions };
}

function homePhotoIds(body) {
  const photos = body?.home?.recentPhotos || [];
  return {
    ids: photos.map((p) => p.id).filter(Boolean),
    captions: photos.map((p) => p.caption).filter(Boolean),
  };
}

async function cleanup(svc, ids) {
  if (!svc) return;
  const { photoHiddenId, photoVisibleId, projectId, jobId } = ids;
  if (photoHiddenId) await svc.from("project_photos").delete().eq("id", photoHiddenId);
  if (photoVisibleId) await svc.from("project_photos").delete().eq("id", photoVisibleId);
  if (projectId) {
    await svc.from("portal_milestones").delete().eq("project_id", projectId);
    await svc.from("project_client_users").delete().eq("project_id", projectId);
    await svc.from("projects").delete().eq("id", projectId);
  }
  if (jobId) await svc.from("jobs").delete().eq("id", jobId);
}

async function setupPhotoFixture(svc, adminToken, ts) {
  const address = buildTestJobAddress({ suite: "W18", workflowId: "PHOTO", ts });
  const { status, body } = await post("/api/jobs", { address, status: "active" }, adminToken);
  const jobId = body?.job?.id;
  if (status !== 200 || !jobId) throw new Error(`job create failed: ${status}`);

  const users = await ensureE2EUsers();
  const clientUserId = users.client?.id;
  if (!clientUserId) throw new Error("E2E client user missing");

  const { data: project, error: pErr } = await svc
    .from("projects")
    .insert({
      job_id: jobId,
      address,
      status: "active",
      portal_enabled: true,
      portal_v2_enabled: true,
      portal_client_name: "BLH TEST Client",
      portal_client_email: CLIENT_EMAIL,
    })
    .select("id")
    .single();
  if (pErr || !project?.id) throw new Error(pErr?.message || "project insert failed");

  await svc.from("project_client_users").upsert(
    {
      project_id: project.id,
      user_id: clientUserId,
      role: "primary",
      is_active: true,
      invite_accepted_at: new Date().toISOString(),
    },
    { onConflict: "project_id,user_id" }
  );

  await svc.from("portal_milestones").insert({
    project_id: project.id,
    key: MILESTONE_KEY,
    label: "BLH TEST Frame",
    is_current: true,
    sort_order: 1,
  });

  const basePath = `__BLH TEST__/w18-photo-${ts}`;
  const { data: hidden, error: hErr } = await svc
    .from("project_photos")
    .insert({
      project_id: project.id,
      milestone_key: MILESTONE_KEY,
      caption: HIDDEN_CAPTION,
      storage_path: `${basePath}-hidden.jpg`,
      public_url: `https://example.test/${basePath}-hidden.jpg`,
      client_visible: false,
      taken_at: new Date().toISOString().slice(0, 10),
    })
    .select("id")
    .single();
  if (hErr || !hidden?.id) throw new Error(hErr?.message || "hidden photo insert failed");

  const { data: visible, error: vErr } = await svc
    .from("project_photos")
    .insert({
      project_id: project.id,
      milestone_key: MILESTONE_KEY,
      caption: VISIBLE_CAPTION,
      storage_path: `${basePath}-visible.jpg`,
      public_url: `https://example.test/${basePath}-visible.jpg`,
      client_visible: true,
      taken_at: new Date().toISOString().slice(0, 10),
    })
    .select("id")
    .single();
  if (vErr || !visible?.id) throw new Error(vErr?.message || "visible photo insert failed");

  return {
    jobId,
    projectId: project.id,
    photoHiddenId: hidden.id,
    photoVisibleId: visible.id,
  };
}

export async function runW18PortalPhotoVisibility(run) {
  run.section("W18-P0-03 static guard (code)");

  const routesSrc = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../server/lib/portalV2Routes.mjs"),
    "utf8"
  );
  const journeyIdx = routesSrc.indexOf("app.get(`${base}/journey`");
  const journeyBlock = journeyIdx >= 0 ? routesSrc.slice(journeyIdx, journeyIdx + 2500) : "";
  if (journeyBlock.includes('.eq("client_visible", true)')) {
    run.pass("W18-P0-03 code — journey query filters client_visible=true");
  } else {
    run.fail("W18-P0-03 code — journey client_visible filter missing");
  }

  const homeIdx = routesSrc.indexOf("Recent photos");
  const homeBlock = homeIdx >= 0 ? routesSrc.slice(homeIdx, homeIdx + 600) : "";
  if (homeBlock.includes('.eq("client_visible", true)')) {
    run.pass("W18-DRIFT-008 code — home recentPhotos filters client_visible=true");
  } else {
    run.fail("W18-DRIFT-008 code — home client_visible filter missing");
  }

  const mediaIdx = routesSrc.indexOf('app.get("/api/portal/app/:projectId/media/:photoId"');
  const mediaBlock = mediaIdx >= 0 ? routesSrc.slice(mediaIdx, mediaIdx + 1200) : "";
  if (mediaBlock.includes("client_visible") && mediaBlock.includes("404")) {
    run.pass("W18-DRIFT-009 code — media route gates client_visible (404)");
  } else {
    run.fail("W18-DRIFT-009 code — media client_visible gate missing");
  }

  if (!WRITE) {
    run.skip("W18-P0-03 live journey photo filter", "requires --write");
    run.skip("W18-P0-03 hidden photo absent from journey", "requires --write");
    run.skip("W18-SEC-03 cross-project journey blocked", "requires --write");
    return;
  }

  run.section("W18-P0-03 write — journey photo visibility");

  const svc = serviceClient();
  if (!svc) {
    run.fail("W18-P0-03 setup", "service client unavailable");
    return;
  }

  await ensureE2EUsers();
  const adminToken = await getAuthToken();
  const ts = Date.now();
  const ids = {};

  try {
    const fx = await setupPhotoFixture(svc, adminToken, ts);
    Object.assign(ids, fx);

    const clientToken = await getTokenForEmail(CLIENT_EMAIL);
    const clientBToken = await getTokenForEmail(CLIENT_B_EMAIL);

    const journey = await get(`/api/portal/app/${fx.projectId}/journey`, clientToken);
    if (journey.status !== 200 || !journey.body?.ok) {
      run.fail("W18-P0-03 journey load", `status=${journey.status}`);
      return;
    }

    const { ids: jIds, captions: jCaps } = journeyPhotoIds(journey.body);
    if (jIds.includes(fx.photoVisibleId) && !jIds.includes(fx.photoHiddenId)) {
      run.pass("W18-P0-03 — journey returns visible photo only");
    } else {
      run.fail(
        "W18-P0-03 — journey photo filter",
        `visible=${jIds.includes(fx.photoVisibleId)} hidden=${jIds.includes(fx.photoHiddenId)} ids=${jIds.join(",")}`
      );
    }

    if (!jCaps.includes(HIDDEN_CAPTION) && jCaps.includes(VISIBLE_CAPTION)) {
      run.pass("W18-P0-03 — hidden caption absent; visible caption present");
    } else {
      run.fail("W18-P0-03 — journey captions", `caps=${jCaps.join(" | ")}`);
    }

    const home = await get(`/api/portal/app/${fx.projectId}/home`, clientToken);
    if (home.status === 200 && home.body?.ok) {
      const { ids: hIds, captions: hCaps } = homePhotoIds(home.body);
      if (!hIds.includes(fx.photoHiddenId) && !hCaps.includes(HIDDEN_CAPTION)) {
        run.pass("W18-DRIFT-008 — home recentPhotos omit hidden photo");
      } else {
        run.fail("W18-DRIFT-008 — home leaks hidden photo", `ids=${hIds.join(",")}`);
      }
      if (hIds.includes(fx.photoVisibleId) && hCaps.includes(VISIBLE_CAPTION)) {
        run.pass("W18-DRIFT-008 — home recentPhotos include visible photo");
      } else {
        run.fail("W18-DRIFT-008 — home missing visible photo", `ids=${hIds.join(",")}`);
      }
    } else {
      run.fail("W18-DRIFT-008 home load", `status=${home.status}`);
    }

    const mediaHidden = await get(
      `/api/portal/app/${fx.projectId}/media/${fx.photoHiddenId}`,
      clientToken
    );
    if (mediaHidden.status === 404) {
      run.pass("W18-DRIFT-009 — hidden photo direct media returns 404");
    } else {
      run.fail("W18-DRIFT-009 — hidden photo media", `expected 404, got ${mediaHidden.status}`);
    }

    const mediaVisible = await get(
      `/api/portal/app/${fx.projectId}/media/${fx.photoVisibleId}`,
      clientToken
    );
    if (mediaVisible.status === 404) {
      run.fail("W18-DRIFT-009 — visible photo blocked by gate", "unexpected 404");
    } else if ([200, 500, 503].includes(mediaVisible.status)) {
      run.pass(
        `W18-DRIFT-009 — visible photo passes client_visible gate (status=${mediaVisible.status}; storage fetch may fail in test env)`
      );
    } else {
      run.fail("W18-DRIFT-009 — visible photo media", `unexpected status=${mediaVisible.status}`);
    }

    const crossMedia = await get(
      `/api/portal/app/${fx.projectId}/media/${fx.photoVisibleId}`,
      clientBToken
    );
    if (crossMedia.status === 403) {
      run.pass("W18-SEC-03 — client B blocked from project A media (403)");
    } else {
      run.fail("W18-SEC-03 — cross-project media", `expected 403, got ${crossMedia.status}`);
    }

    const cross = await get(`/api/portal/app/${fx.projectId}/journey`, clientBToken);
    if (cross.status === 403) {
      run.pass("W18-SEC-03 — client B blocked from project A journey (403)");
    } else {
      run.fail("W18-SEC-03 — cross-project journey", `expected 403, got ${cross.status}`);
    }

    const dbHidden = await svc.from("project_photos").select("client_visible").eq("id", fx.photoHiddenId).single();
    const dbVisible = await svc.from("project_photos").select("client_visible").eq("id", fx.photoVisibleId).single();
    if (dbHidden.data?.client_visible === false && dbVisible.data?.client_visible === true) {
      run.pass("W18-P0-03 DB — client_visible flags unchanged after API reads");
    } else {
      run.fail("W18-P0-03 DB state", `hidden=${dbHidden.data?.client_visible} visible=${dbVisible.data?.client_visible}`);
    }
  } finally {
    await cleanup(svc, ids);
  }

  run.section("W18-SEC-03 / W18-API-03 E2E runtime");

  const runtimePath = join(dirname(fileURLToPath(import.meta.url)), "../../e2e/.runtime.json");
  if (!existsSync(runtimePath)) {
    run.skip("W18-SEC-03 E2E isolation", "e2e/.runtime.json missing");
    return;
  }

  const rt = JSON.parse(readFileSync(runtimePath, "utf8"));
  const projectA = rt.seed?.projectA;
  const projectB = rt.seed?.projectB;
  if (!projectA || !projectB) {
    run.skip("W18-SEC-03 E2E isolation", "seed projects missing");
    return;
  }

  const clientTokenRt = await getTokenForEmail(CLIENT_EMAIL);
  const crossHome = await get(`/api/portal/app/${projectB}/home`, clientTokenRt);
  if (crossHome.status === 403) run.pass("W18-SEC-03 E2E — client A blocked from project B home");
  else run.fail("W18-SEC-03 E2E cross-project", `status=${crossHome.status}`);

  const sel = await get(`/api/portal/app/${projectA}/selections`, clientTokenRt);
  if (sel.status === 200) {
    const s = JSON.stringify(sel.body || {});
    const leaks = ["SECRET_MARGIN", "cost_to_builder", "internal_notes"].filter((k) => s.includes(k));
    if (leaks.length === 0) run.pass("W18-API-03 — selections scoped (no internal leak)");
    else run.fail("W18-API-03 — selections leak", leaks.join(", "));
  }
}
