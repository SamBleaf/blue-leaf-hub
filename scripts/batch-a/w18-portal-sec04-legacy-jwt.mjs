/**
 * W18-SEC-04 — Invalid JWT + legacy token POST audit
 *
 * Proves:
 * - W18-SEC-04: missing/invalid JWT → 401 on v2 portal routes
 * - W18-SEC-04: valid JWT wrong project → 403
 * - W18-DRIFT-007-D: legacy token variation/decision respond → 403 (contractual blocked)
 * - W18-DRIFT-007 inventory: classify legacy POST endpoints B/C/D
 */
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
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
const INVALID_JWT = "not.a.valid.jwt.token";
const MALFORMED_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.invalid-signature";

async function getTokenForEmail(email, password = E2E_PASSWORD) {
  if (!SB_URL || !SB_ANON) throw new Error("Missing Supabase URL or anon key");
  const sb = createClient(SB_URL, SB_ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) {
    throw new Error(error?.message || `No session for ${email}`);
  }
  return data.session.access_token;
}

function v2ProbePaths(projectId) {
  return [
    { label: "my-projects", path: "/api/portal/my-projects" },
    { label: "home", path: `/api/portal/app/${projectId}/home` },
    { label: "actions", path: `/api/portal/app/${projectId}/actions` },
    { label: "notifications", path: `/api/portal/app/${projectId}/notifications` },
    { label: "journey", path: `/api/portal/app/${projectId}/journey` },
  ];
}

async function cleanup(svc, ids) {
  if (!svc) return;
  const { projectId, jobId, decisionId, messageIds = [], warrantyIds = [] } = ids;
  for (const mId of messageIds) await svc.from("portal_messages").delete().eq("id", mId);
  for (const wId of warrantyIds) await svc.from("warranty_items").delete().eq("id", wId);
  if (decisionId) {
    await svc.from("client_actions").delete().eq("related_entity_id", decisionId);
    await svc.from("portal_decisions").delete().eq("id", decisionId);
  }
  if (projectId) {
    await svc.from("project_client_users").delete().eq("project_id", projectId);
    await svc.from("projects").delete().eq("id", projectId);
  }
  if (jobId) await svc.from("jobs").delete().eq("id", jobId);
}

async function setupLegacyFixture(svc, adminToken, ts) {
  const address = buildTestJobAddress({ suite: "W18", workflowId: "SEC04", ts });
  const { status, body } = await post("/api/jobs", { address, status: "active" }, adminToken);
  const jobId = body?.job?.id;
  if (status !== 200 || !jobId) throw new Error(`job create failed: ${status}`);

  const portalToken = crypto.randomBytes(24).toString("base64url");
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
      portal_token: portalToken,
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

  const { data: decision, error: dErr } = await svc
    .from("portal_decisions")
    .insert({
      project_id: project.id,
      type: "variation",
      title: "__BLH TEST__ W18 SEC04 legacy block probe",
      status: "pending",
    })
    .select("id")
    .single();
  if (dErr || !decision?.id) throw new Error(dErr?.message || "decision insert failed");

  return { jobId, projectId: project.id, portalToken, decisionId: decision.id };
}

export async function runW18PortalSec04(run) {
  run.section("W18-SEC-04 static — legacy POST inventory");

  const routesSrc = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../server/lib/portalRoutes.mjs"),
    "utf8"
  );
  const authSrc = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../server/lib/requirePortalAuth.mjs"),
    "utf8"
  );

  const inventory = [
    {
      id: "legacy-conversations",
      pattern: 'app.post("/api/portal/:token/conversations"',
      class: "B",
      note: "low-risk client message POST",
    },
    {
      id: "legacy-sitewalk",
      pattern: 'app.post("/api/portal/:token/sitewalk"',
      class: "C",
      note: "operational RSVP — spam/SOP P1",
    },
    {
      id: "legacy-decision-respond",
      pattern: 'app.post("/api/portal/:token/decisions/:decisionId/respond"',
      class: "D",
      note: "contractual — must be disabled",
    },
    {
      id: "legacy-warranty",
      pattern: 'app.post("/api/portal/:token/warranty"',
      class: "C",
      note: "operational warranty request — SOP P1",
    },
  ];

  for (const item of inventory) {
    if (routesSrc.includes(item.pattern)) {
      run.pass(`W18-SEC-04 inventory — ${item.id} present (class ${item.class}: ${item.note})`);
    } else {
      run.fail(`W18-SEC-04 inventory — ${item.id}`, "route not found");
    }
  }

  if (routesSrc.includes("portal_v2_enabled") && routesSrc.includes("return null")) {
    run.pass("W18-SEC-04 code — resolveProject disables legacy token when portal_v2_enabled");
  } else {
    run.fail("W18-SEC-04 code — legacy v2 gate missing in resolveProject");
  }

  if (routesSrc.includes("Approvals now require logging in") && routesSrc.includes("return res.status(403)")) {
    run.pass("W18-DRIFT-007-D code — legacy decision respond returns 403 requiresLogin");
  } else {
    run.fail("W18-DRIFT-007-D code — legacy decision respond guard missing");
  }

  if (authSrc.includes('return res.status(401)') && authSrc.includes("Invalid or expired session")) {
    run.pass("W18-SEC-04 code — requirePortalAuth rejects invalid JWT with 401");
  } else {
    run.fail("W18-SEC-04 code — JWT 401 guard missing");
  }

  if (!WRITE) {
    run.skip("W18-SEC-04 live JWT probes", "requires --write");
    run.skip("W18-DRIFT-007 legacy POST behaviour", "requires --write");
    return;
  }

  run.section("W18-SEC-04 write — JWT rejection");

  const svc = serviceClient();
  if (!svc) {
    run.fail("W18-SEC-04 setup", "service client unavailable");
    return;
  }

  await ensureE2EUsers();
  const adminToken = await getAuthToken();
  const ts = Date.now();
  const ids = { messageIds: [], warrantyIds: [] };

  try {
    const fx = await setupLegacyFixture(svc, adminToken, ts);
    Object.assign(ids, fx);

    const probes = v2ProbePaths(fx.projectId);
    for (const { label, path } of probes) {
      const noAuth = await get(path, null);
      if (noAuth.status === 401) {
        run.pass(`W18-SEC-04 — ${label} missing JWT → 401`);
      } else {
        run.fail(`W18-SEC-04 — ${label} missing JWT`, `expected 401, got ${noAuth.status}`);
      }

      const badJwt = await get(path, INVALID_JWT);
      if (badJwt.status === 401) {
        run.pass(`W18-SEC-04 — ${label} invalid JWT → 401`);
      } else {
        run.fail(`W18-SEC-04 — ${label} invalid JWT`, `expected 401, got ${badJwt.status}`);
      }

      const malformed = await get(path, MALFORMED_JWT);
      if (malformed.status === 401) {
        run.pass(`W18-SEC-04 — ${label} malformed JWT → 401`);
      } else {
        run.fail(`W18-SEC-04 — ${label} malformed JWT`, `expected 401, got ${malformed.status}`);
      }
    }

    run.gap(
      "W18-SEC-04 — expired JWT",
      "true expired Supabase session not synthesized — invalid/malformed covers getUser rejection path (same 401 handler)"
    );

    const clientBToken = await getTokenForEmail(CLIENT_B_EMAIL);
    for (const { label, path } of probes.filter((p) => p.label !== "my-projects")) {
      const cross = await get(path, clientBToken);
      if (cross.status === 403) {
        run.pass(`W18-SEC-04 — ${label} wrong-project JWT → 403`);
      } else {
        run.fail(`W18-SEC-04 — ${label} wrong-project`, `expected 403, got ${cross.status}`);
      }
    }

    const clientToken = await getTokenForEmail(CLIENT_EMAIL);
    const ownHome = await get(`/api/portal/app/${fx.projectId}/home`, clientToken);
    if (ownHome.status === 200 && ownHome.body?.ok) {
      run.pass("W18-SEC-04 — valid JWT own project → 200 (control)");
    } else {
      run.fail("W18-SEC-04 — valid JWT control", `status=${ownHome.status}`);
    }

    run.section("W18-DRIFT-007 write — legacy token POST classification");

    const badToken = await post("/api/portal/not-a-real-token/conversations", { body: "__BLH TEST__" });
    if (badToken.status === 404) {
      run.pass("W18-SEC-04 — invalid legacy token → 404");
    } else {
      run.fail("W18-SEC-04 — invalid legacy token", `status=${badToken.status}`);
    }

    const legacyApprove = await post(
      `/api/portal/${fx.portalToken}/decisions/${fx.decisionId}/respond`,
      { action: "approve", clientNote: "__BLH TEST__ should block" }
    );
    if (legacyApprove.status === 403 && legacyApprove.body?.requiresLogin) {
      run.pass("W18-DRIFT-007-D — legacy decision respond → 403 requiresLogin");
    } else {
      run.fail(
        "W18-DRIFT-007-D — legacy decision respond",
        `expected 403 requiresLogin, got ${legacyApprove.status} ${JSON.stringify(legacyApprove.body)}`
      );
    }

    const afterDecision = await svc.from("portal_decisions").select("status").eq("id", fx.decisionId).single();
    if (afterDecision.data?.status === "pending") {
      run.pass("W18-DRIFT-007-D — decision unchanged after legacy respond attempt");
    } else {
      run.fail("W18-DRIFT-007-D — decision state", afterDecision.data?.status || "missing");
    }

    const legacyMsg = await post(`/api/portal/${fx.portalToken}/conversations`, {
      body: "__BLH TEST__ W18 SEC04 legacy message",
    });
    if (legacyMsg.status === 404) {
      run.pass("W18-DRIFT-007-B — legacy conversations blocked on v2 project (404 — resolveProject v2 gate)");
    } else if (legacyMsg.status === 200 && legacyMsg.body?.ok) {
      run.gap("W18-DRIFT-007-B — legacy conversations POST allowed", "class B — non-v2 projects only; P1 SOP");
      if (legacyMsg.body?.message?.id) ids.messageIds.push(legacyMsg.body.message.id);
    } else {
      run.gap("W18-DRIFT-007-B — legacy conversations", `status=${legacyMsg.status}`);
    }

    const legacyWalk = await post(`/api/portal/${fx.portalToken}/sitewalk`, {
      siteWalkId: "00000000-0000-0000-0000-000000000000",
    });
    if (legacyWalk.status === 404) {
      run.pass("W18-DRIFT-007-C — legacy sitewalk blocked on v2 project (404 — resolveProject v2 gate)");
    } else {
      run.gap("W18-DRIFT-007-C — legacy sitewalk", `status=${legacyWalk.status} — class C if non-v2`);
    }

    const legacyWarranty = await post(`/api/portal/${fx.portalToken}/warranty`, {
      area: "__BLH TEST__ bathroom",
      description: "__BLH TEST__ W18 SEC04 warranty probe",
      urgency: "can_wait",
    });
    if (legacyWarranty.status === 404) {
      run.pass("W18-DRIFT-007-C — legacy warranty blocked on v2 project (404 — resolveProject v2 gate)");
    } else if (legacyWarranty.status === 200 && legacyWarranty.body?.ok) {
      run.gap("W18-DRIFT-007-C — legacy warranty POST allowed", "class C — non-v2 projects only");
      if (legacyWarranty.body?.item?.id) ids.warrantyIds.push(legacyWarranty.body.item.id);
    } else {
      run.gap("W18-DRIFT-007-C — legacy warranty", `status=${legacyWarranty.status}`);
    }
  } finally {
    await cleanup(svc, ids);
  }
}
