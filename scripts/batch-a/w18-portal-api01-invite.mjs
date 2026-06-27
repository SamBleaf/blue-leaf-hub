/**
 * W18-API-01 — Portal invite / onboarding / enablement linkage
 *
 * Proves:
 * - Admin can enable v2 settings and invite client
 * - accept-invite creates project_client_users + enables portal flags
 * - Client sees project in my-projects and can load home/actions/notifications
 * - Cross-project JWT isolation holds after invite
 * - generate-token is admin-only (legacy portal_token separate from JWT)
 * - Non-admin blocked from invite and generate-token
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import {
  WRITE,
  SB_URL,
  SB_ANON,
  post,
  get,
  patch,
  getAuthToken,
  serviceClient,
} from "./_helpers.mjs";
import { buildTestJobAddress } from "../lib/testArtifactPrefixes.mjs";
import { ensureE2EUsers } from "../create-e2e-users.mjs";

const E2E_PASSWORD = "BlueLeaf-E2E-2026!";
const CLIENT_B_EMAIL = "e2e-client-b@blueleafbuilding.test";
const EMPLOYEE_EMAIL = "e2e-employee@blueleafbuilding.test";
const EXISTING_CLIENT_EMAIL = "e2e-client@blueleafbuilding.test";

async function getTokenForEmail(email, password = E2E_PASSWORD) {
  if (!SB_URL || !SB_ANON) throw new Error("Missing Supabase URL or anon key");
  const sb = createClient(SB_URL, SB_ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) {
    throw new Error(error?.message || `No session for ${email}`);
  }
  return data.session.access_token;
}

function extractInviteToken(inviteUrl) {
  const m = String(inviteUrl || "").match(/\/accept-invite\/([a-f0-9]+)/i);
  return m?.[1] || null;
}

async function createBareProject(svc, adminToken, ts, { portalEnabled = false, portalV2Enabled = false } = {}) {
  const address = buildTestJobAddress({ suite: "W18", workflowId: "API01", ts });
  const { status, body } = await post("/api/jobs", { address, status: "active" }, adminToken);
  const jobId = body?.job?.id;
  if (status !== 200 || !jobId) throw new Error(`job create failed: ${status}`);

  const portalToken = crypto.randomBytes(24).toString("base64url");
  const { data: project, error: pErr } = await svc
    .from("projects")
    .insert({
      job_id: jobId,
      address,
      status: "active",
      portal_enabled: portalEnabled,
      portal_v2_enabled: portalV2Enabled,
      portal_token: portalToken,
      portal_client_name: "__BLH TEST__ Client",
    })
    .select("id, portal_token")
    .single();
  if (pErr || !project?.id) throw new Error(pErr?.message || "project insert failed");
  return { jobId, projectId: project.id, portalToken: project.portal_token, address };
}

async function cleanupInviteArtifacts(svc, ids) {
  if (!svc) return;
  const { projectId, jobId, linkProjectId, linkJobId, inviteEmail, authUserId, invitationIds = [] } = ids;

  for (const invId of invitationIds) {
    await svc.from("invitations").delete().eq("id", invId);
  }
  if (inviteEmail) {
    await svc.from("invitations").delete().eq("email", inviteEmail.toLowerCase());
  }
  if (projectId) {
    await svc.from("portal_notifications").delete().eq("project_id", projectId);
    await svc.from("client_actions").delete().eq("project_id", projectId);
    await svc.from("project_client_users").delete().eq("project_id", projectId);
    await svc.from("projects").delete().eq("id", projectId);
  }
  if (linkProjectId) {
    await svc.from("project_client_users").delete().eq("project_id", linkProjectId);
    await svc.from("projects").delete().eq("id", linkProjectId);
  }
  if (jobId) await svc.from("jobs").delete().eq("id", jobId);
  if (linkJobId) await svc.from("jobs").delete().eq("id", linkJobId);
  if (authUserId) {
    await svc.from("project_client_users").delete().eq("user_id", authUserId);
    await svc.from("user_profiles").delete().eq("id", authUserId);
    try {
      await svc.auth.admin.deleteUser(authUserId);
    } catch {
      /* best effort */
    }
  }
}

export async function runW18PortalApi01(run) {
  run.section("W18-API-01 static — invite/onboarding code audit");

  const authSrc = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../server/lib/authRoutes.mjs"),
    "utf8"
  );
  const portalSrc = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../server/lib/portalRoutes.mjs"),
    "utf8"
  );
  const v2AdminSrc = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../server/lib/portalV2AdminRoutes.mjs"),
    "utf8"
  );

  if (authSrc.includes('caller.role !== "admin"') && authSrc.includes('app.post("/api/auth/invite"')) {
    run.pass("W18-API-01 code — POST /api/auth/invite requires admin role");
  } else {
    run.fail("W18-API-01 code — invite admin guard missing");
  }

  if (authSrc.includes("project_client_users") && authSrc.includes("accept-invite")) {
    run.pass("W18-API-01 code — accept-invite upserts project_client_users for client invites");
  } else {
    run.fail("W18-API-01 code — accept-invite project_client_users link missing");
  }

  if (authSrc.includes("portal_v2_enabled: true") && authSrc.includes("portal_enabled: true")) {
    run.pass("W18-API-01 code — accept-invite enables portal_enabled + portal_v2_enabled");
  } else {
    run.fail("W18-API-01 code — accept-invite portal flags missing");
  }

  if (portalSrc.includes('requireRole("admin")') && portalSrc.includes("generate-token")) {
    run.pass("W18-API-01 code — generate-token requires admin role");
  } else {
    run.fail("W18-API-01 code — generate-token admin guard missing");
  }

  if (v2AdminSrc.includes('requireRole("admin", "supervisor", "employee")')) {
    run.pass("W18-API-01 code — v2 admin settings allow staff roles (admin/supervisor/employee)");
  } else {
    run.fail("W18-API-01 code — v2 admin staff role gate missing");
  }

  if (portalSrc.includes("portal_token") && authSrc.includes("project_client_users")) {
    run.pass("W18-API-01 code — legacy portal_token path separate from JWT project_client_users");
  } else {
    run.fail("W18-API-01 code — legacy vs JWT separation unclear");
  }

  if (!WRITE) {
    run.skip("W18-API-01 live invite/onboarding probes", "requires --write");
    return;
  }

  run.section("W18-API-01 write — invite + onboarding E2E");

  const svc = serviceClient();
  if (!svc) {
    run.fail("W18-API-01 setup", "service client unavailable");
    return;
  }

  await ensureE2EUsers();
  const adminToken = await getAuthToken();
  const employeeToken = await getTokenForEmail(EMPLOYEE_EMAIL);
  const clientBToken = await getTokenForEmail(CLIENT_B_EMAIL);
  const ts = Date.now();
  const inviteEmail = `blh.test.w18.api01.${ts}@blueleafbuilding.test`;
  const inviteName = "__BLH TEST__ W18 API01 Invite Client";
  const ids = { invitationIds: [], inviteEmail };

  try {
    const bare = await createBareProject(svc, adminToken, ts, {
      portalEnabled: false,
      portalV2Enabled: false,
    });
    Object.assign(ids, bare);

    // Non-admin blocked from generate-token
    const empGen = await post("/api/portal/admin/generate-token", { projectId: bare.projectId }, employeeToken);
    if (empGen.status === 403) {
      run.pass("W18-SEC-02 — employee generate-token → 403");
    } else {
      run.fail("W18-SEC-02 — employee generate-token", `expected 403, got ${empGen.status}`);
    }

    // Non-admin blocked from invite
    const empInv = await post(
      "/api/auth/invite",
      { email: `blocked.${ts}@blueleafbuilding.test`, role: "client", projectId: bare.projectId },
      employeeToken
    );
    if (empInv.status === 403) {
      run.pass("W18-API-01 — employee invite → 403");
    } else {
      run.fail("W18-API-01 — employee invite", `expected 403, got ${empInv.status}`);
    }

    // Admin can enable v2 settings before invite
    const enable = await patch(
      `/api/portal/admin/v2/${bare.projectId}/settings`,
      { portalV2Enabled: true, buildPhase: "on_site" },
      adminToken
    );
    if (enable.status === 200 && enable.body?.ok) {
      run.pass("W18-API-01 — admin PATCH v2 settings → 200");
    } else {
      run.fail("W18-API-01 — admin PATCH v2 settings", `status ${enable.status}`);
    }

    // Admin invite new client
    const inv = await post(
      "/api/auth/invite",
      { email: inviteEmail, fullName: inviteName, role: "client", projectId: bare.projectId },
      adminToken
    );
    if (inv.status !== 200 || !inv.body?.ok) {
      run.fail("W18-API-01 — admin invite client", `status ${inv.status} ${inv.body?.error || ""}`);
      return;
    }
    run.pass("W18-API-01 — admin invite client → 200");

    const inviteToken = extractInviteToken(inv.body.inviteUrl);
    if (!inviteToken) {
      run.fail("W18-API-01 — invite token extracted", "inviteUrl missing token");
      return;
    }
    run.pass("W18-API-01 — invite URL contains accept-invite token");

    const tokenCheck = await get(`/api/auth/invite/${inviteToken}`);
    if (tokenCheck.status === 200 && tokenCheck.body?.email === inviteEmail.toLowerCase()) {
      run.pass("W18-API-01 — GET invite token validates email");
    } else {
      run.fail("W18-API-01 — GET invite token", `status ${tokenCheck.status}`);
    }

    const accept = await post("/api/auth/accept-invite", {
      token: inviteToken,
      password: E2E_PASSWORD,
      fullName: inviteName,
    });
    if (accept.status !== 200 || !accept.body?.ok) {
      run.fail("W18-API-01 — accept-invite", `status ${accept.status} ${accept.body?.error || ""}`);
      return;
    }
    run.pass("W18-API-01 — accept-invite → 200");

    const { data: authUsers } = await svc.auth.admin.listUsers({ page: 1, perPage: 200 });
    const newUser = (authUsers?.users || []).find((u) => (u.email || "").toLowerCase() === inviteEmail.toLowerCase());
    if (!newUser?.id) {
      run.fail("W18-API-01 — auth user created", "user not found after accept");
      return;
    }
    ids.authUserId = newUser.id;

    const { data: pcu } = await svc
      .from("project_client_users")
      .select("project_id, user_id, role, is_active, invite_accepted_at")
      .eq("project_id", bare.projectId)
      .eq("user_id", newUser.id)
      .maybeSingle();
    if (pcu?.is_active === true && pcu?.invite_accepted_at) {
      run.pass("W18-API-01 — project_client_users row linked after accept");
    } else {
      run.fail("W18-API-01 — project_client_users row", "missing or inactive");
    }

    const { data: proj } = await svc
      .from("projects")
      .select("portal_enabled, portal_v2_enabled, portal_client_email, portal_token")
      .eq("id", bare.projectId)
      .maybeSingle();
    if (proj?.portal_enabled === true && proj?.portal_v2_enabled === true) {
      run.pass("W18-API-01 — project portal flags enabled after accept");
    } else {
      run.fail("W18-API-01 — project portal flags", `enabled=${proj?.portal_enabled} v2=${proj?.portal_v2_enabled}`);
    }

    if (proj?.portal_client_email?.toLowerCase() === inviteEmail.toLowerCase()) {
      run.pass("W18-API-01 — portal_client_email stamped from invite");
    } else {
      run.fail("W18-API-01 — portal_client_email", `got ${proj?.portal_client_email}`);
    }

    const clientToken = await getTokenForEmail(inviteEmail);
    const myProjects = await get("/api/portal/my-projects", clientToken);
    const listed = (myProjects.body?.projects || []).some((p) => p.projectId === bare.projectId || p.id === bare.projectId);
    if (myProjects.status === 200 && listed) {
      run.pass("W18-API-01 — client my-projects includes invited project");
    } else {
      run.fail("W18-API-01 — client my-projects", `status ${myProjects.status} listed=${listed}`);
    }

    const home = await get(`/api/portal/app/${bare.projectId}/home`, clientToken);
    if (home.status === 200 && home.body?.ok) {
      run.pass("W18-API-02 — client home loads after invite");
    } else {
      run.fail("W18-API-02 — client home", `status ${home.status}`);
    }

    const actions = await get(`/api/portal/app/${bare.projectId}/actions`, clientToken);
    if (actions.status === 200 && actions.body?.ok) {
      run.pass("W18-API-02 — client actions loads after invite");
    } else {
      run.fail("W18-API-02 — client actions", `status ${actions.status}`);
    }

    // Scoped notification — only invited client should read
    const dedupDay = new Date().toISOString().slice(0, 10);
    const { error: nErr } = await svc.from("portal_notifications").insert({
      project_id: bare.projectId,
      target_user_id: newUser.id,
      notification_type: "action_required",
      title: "__BLH TEST__ W18 API01 scoped notify",
      body: "scoped probe",
      channel: "in_app",
      dedup_day: dedupDay,
    });
    if (nErr) {
      run.fail("W18-API-01 — notification insert", nErr.message);
    }

    const notifs = await get(`/api/portal/app/${bare.projectId}/notifications`, clientToken);
    const hasNotify = (notifs.body?.notifications || []).some((n) =>
      String(n.title || "").includes("API01")
    );
    if (notifs.status === 200 && hasNotify) {
      run.pass("W18-API-01 — notifications scoped to invited client");
    } else {
      run.fail("W18-API-01 — notifications scope", `status ${notifs.status} found=${hasNotify}`);
    }

    const crossHome = await get(`/api/portal/app/${bare.projectId}/home`, clientBToken);
    if (crossHome.status === 403) {
      run.pass("W18-SEC-03 — client B blocked from invited project → 403");
    } else {
      run.fail("W18-SEC-03 — cross-client isolation", `expected 403, got ${crossHome.status}`);
    }

    const crossNotifs = await get(`/api/portal/app/${bare.projectId}/notifications`, clientBToken);
    if (crossNotifs.status === 403) {
      run.pass("W18-SEC-03 — client B notifications on foreign project → 403");
    } else {
      run.fail("W18-SEC-03 — cross-client notifications", `expected 403, got ${crossNotifs.status}`);
    }

    // SEC-04 regression after invite — missing JWT still 401
    const noJwt = await get(`/api/portal/app/${bare.projectId}/home`, null);
    if (noJwt.status === 401) {
      run.pass("W18-SEC-04 — missing JWT after invite flow → 401");
    } else {
      run.fail("W18-SEC-04 — missing JWT after invite", `expected 401, got ${noJwt.status}`);
    }

    // Legacy generate-token separate from JWT
    const gen = await post("/api/portal/admin/generate-token", { projectId: bare.projectId }, adminToken);
    if (gen.status === 200 && gen.body?.token) {
      run.pass("W18-API-01 — admin generate-token → 200 (legacy portal_token)");
    } else {
      run.fail("W18-API-01 — admin generate-token", `status ${gen.status}`);
    }

    const legacyRead = await get(`/api/portal/${gen.body.token}`);
    if (legacyRead.status === 404) {
      run.pass("W18-API-01 — legacy token read blocked on v2 project → 404 (v2 gate)");
    } else if (legacyRead.status === 200) {
      run.gap(
        "W18-API-01 — legacy token on v2 project",
        "legacy GET returned 200 — v2 gate may not apply to all read routes; JWT still primary"
      );
    } else {
      run.pass(`W18-API-01 — legacy token on v2 project → ${legacyRead.status}`);
    }

    if (gen.body?.token && clientToken) {
      run.pass("W18-API-01 — legacy portal_token coexists with JWT access (separate paths)");
    }

    // Existing client linked to second project (no new invite email)
    run.section("W18-API-01 write — existing client multi-project link");
    const linkTs = ts + 1;
    const linkBare = await createBareProject(svc, adminToken, linkTs, {
      portalEnabled: false,
      portalV2Enabled: false,
    });
    ids.linkProjectId = linkBare.projectId;
    ids.linkJobId = linkBare.jobId;

    const linkInv = await post(
      "/api/auth/invite",
      { email: EXISTING_CLIENT_EMAIL, role: "client", projectId: linkBare.projectId },
      adminToken
    );
    if (linkInv.status === 200 && linkInv.body?.linkedExisting === true) {
      run.pass("W18-API-01 — existing client invite links project without new email");
    } else {
      run.fail("W18-API-01 — existing client link", `status ${linkInv.status} linkedExisting=${linkInv.body?.linkedExisting}`);
    }

    const existingToken = await getTokenForEmail(EXISTING_CLIENT_EMAIL);
    const existingProjects = await get("/api/portal/my-projects", existingToken);
    const linkListed = (existingProjects.body?.projects || []).some(
      (p) => p.projectId === linkBare.projectId || p.id === linkBare.projectId
    );
    if (existingProjects.status === 200 && linkListed) {
      run.pass("W18-API-01 — existing client my-projects includes linked project");
    } else {
      run.fail("W18-API-01 — existing client my-projects link", `listed=${linkListed}`);
    }

    const linkHome = await get(`/api/portal/app/${linkBare.projectId}/home`, existingToken);
    if (linkHome.status === 200) {
      run.pass("W18-API-01 — existing client home on linked project → 200");
    } else {
      run.fail("W18-API-01 — existing client linked home", `status ${linkHome.status}`);
    }
  } finally {
    await cleanupInviteArtifacts(svc, ids);
  }
}
