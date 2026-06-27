/**
 * W18-P0-02 — Void variation approval guard + related portal regression probes
 *
 * Proves:
 * - W18-P0-02: client cannot approve after syncVariationVoided (portal_decisions → withdrawn)
 * - W18-P0-02-B: client cannot approve when decision already withdrawn (409, no audit)
 * - W18-SEC-03: client B blocked from project A variation respond (403/404)
 * - W18-API-04 (partial): approve-after-void does not create variation.approved audit row
 *
 * Write mode (--write): creates BLH TEST fixtures, calls live API, cleans up.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  WRITE,
  API,
  SB_URL,
  SB_ANON,
  post,
  get,
  getAuthToken,
  serviceClient,
} from "./_helpers.mjs";
import { buildTestJobAddress } from "../lib/testArtifactPrefixes.mjs";
import { ensureE2EUsers } from "../create-e2e-users.mjs";
import { syncVariationSent, syncVariationVoided } from "../../server/lib/portalIntegration.mjs";

const E2E_PASSWORD = "BlueLeaf-E2E-2026!";
const CLIENT_EMAIL = "e2e-client@blueleafbuilding.test";
const CLIENT_B_EMAIL = "e2e-client-b@blueleafbuilding.test";

async function getTokenForEmail(email, password = E2E_PASSWORD) {
  if (!SB_URL || !SB_ANON) throw new Error("Missing Supabase URL or anon key");
  const sb = createClient(SB_URL, SB_ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) {
    throw new Error(error?.message || `No session for ${email}`);
  }
  return data.session.access_token;
}

async function cleanup(svc, ids) {
  if (!svc) return;
  const { decisionId, variationId, jobId, projectId, projectBId } = ids;
  if (decisionId) {
    await svc.from("portal_audit_logs").delete().eq("entity_id", decisionId);
    await svc.from("client_actions").delete().eq("related_entity_id", decisionId);
    await svc.from("portal_decisions").delete().eq("id", decisionId);
  }
  if (variationId) await svc.from("job_variations").delete().eq("id", variationId);
  if (projectId) {
    await svc.from("project_client_users").delete().eq("project_id", projectId);
    await svc.from("portal_notifications").delete().eq("project_id", projectId);
    await svc.from("projects").delete().eq("id", projectId);
  }
  if (projectBId) {
    await svc.from("project_client_users").delete().eq("project_id", projectBId);
    await svc.from("projects").delete().eq("id", projectBId);
  }
  if (jobId) await svc.from("jobs").delete().eq("id", jobId);
}

async function setupPortalVariationFixture(svc, adminToken, users, ts) {
  const address = buildTestJobAddress({ suite: "W18", workflowId: "VOID", ts });
  const { status, body } = await post("/api/jobs", { address, status: "active" }, adminToken);
  const jobId = body?.job?.id;
  if (status !== 200 || !jobId) throw new Error(`job create failed: ${status}`);

  const clientUserId = users?.client?.id;
  if (!clientUserId) throw new Error("E2E client user missing — run create-e2e-users.mjs");

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

  const varNum = 9000 + (ts % 999);
  const { data: variation, error: vErr } = await svc
    .from("job_variations")
    .insert({
      job_id: jobId,
      variation_number: varNum,
      title: "__BLH TEST__ W18 void guard variation",
      description: "W18-P0-02 test fixture",
      amount_ex_gst: 500,
      status: "sent_to_client",
    })
    .select("*")
    .single();
  if (vErr || !variation?.id) throw new Error(vErr?.message || "variation insert failed");

  await syncVariationSent({ jobId, variation });

  const { data: decision } = await svc
    .from("portal_decisions")
    .select("id, status")
    .eq("project_id", project.id)
    .eq("job_variation_id", variation.id)
    .maybeSingle();
  if (!decision?.id || decision.status !== "pending") {
    throw new Error(`expected pending portal_decision, got ${decision?.status || "missing"}`);
  }

  return { jobId, projectId: project.id, variationId: variation.id, decisionId: decision.id, address };
}

export async function runW18PortalVoidGuard(run) {
  run.section("W18-P0-02 static guard (code)");

  const routesSrc = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../server/lib/portalV2Routes.mjs"),
    "utf8"
  );
  if (routesSrc.includes('decision.status !== "pending"') && routesSrc.includes("409")) {
    run.pass("W18-P0-02 code — variation respond rejects non-pending (409)");
  } else {
    run.fail("W18-P0-02 code — variation respond guard missing");
  }

  const intSrc = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../server/lib/portalIntegration.mjs"),
    "utf8"
  );
  if (intSrc.includes('status: "withdrawn"') && intSrc.includes("syncVariationVoided")) {
    run.pass("W18-P0-02 code — syncVariationVoided sets withdrawn");
  } else {
    run.fail("W18-P0-02 code — syncVariationVoided missing");
  }

  if (!WRITE) {
    run.skip("W18-P0-02 live void→approve blocked", "requires --write");
    run.skip("W18-P0-02-B withdrawn decision approve blocked", "requires --write");
    run.skip("W18-API-04 no audit on blocked approve", "requires --write");
    run.skip("W18-SEC-03 cross-project variation respond blocked", "requires --write");
    return;
  }

  run.section("W18-P0-02 write — void then client approve");

  const svc = serviceClient();
  if (!svc) {
    run.fail("W18 setup", "service client unavailable");
    return;
  }

  const users = await ensureE2EUsers();
  const adminToken = await getAuthToken();
  const ts = Date.now();
  const ids = { projectBId: null };

  try {
    const fx = await setupPortalVariationFixture(svc, adminToken, users, ts);
    Object.assign(ids, fx);

    const before = await svc
      .from("portal_decisions")
      .select("status, responded_at")
      .eq("id", fx.decisionId)
      .single();
    run.pass(`fixture pending decision (${before.data?.status})`);

    await syncVariationVoided({ variationId: fx.variationId });

    const afterVoid = await svc
      .from("portal_decisions")
      .select("status, responded_at")
      .eq("id", fx.decisionId)
      .single();
    if (afterVoid.data?.status === "withdrawn") {
      run.pass("W18-P0-02 setup — syncVariationVoided → withdrawn");
    } else {
      run.fail("W18-P0-02 setup — syncVariationVoided", `status=${afterVoid.data?.status}`);
    }

    const { data: action } = await svc
      .from("client_actions")
      .select("status, title")
      .eq("related_entity_id", fx.decisionId)
      .maybeSingle();
    if (action?.status === "completed") {
      run.pass("W18-P0-02 setup — client_action completed after void");
    } else {
      run.gap("W18-P0-02 client_action after void", `status=${action?.status || "missing"}`);
    }

    const auditBefore = await svc
      .from("portal_audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("entity_id", fx.decisionId)
      .eq("event_type", "variation.approved");

    const freshClientToken = await getTokenForEmail(CLIENT_EMAIL);
    const freshClientBToken = await getTokenForEmail(CLIENT_B_EMAIL);

    const { status: approveStatus, body: approveBody } = await post(
      `/api/portal/app/${fx.projectId}/variations/${fx.decisionId}/respond`,
      { action: "approve", note: "__BLH TEST__ should be blocked" },
      freshClientToken
    );

    if (approveStatus === 409) {
      run.pass("W18-P0-02 — client approve after void → 409");
    } else {
      run.fail("W18-P0-02 — client approve after void", `expected 409, got ${approveStatus} ${JSON.stringify(approveBody)}`);
    }

    const afterAttempt = await svc
      .from("portal_decisions")
      .select("status")
      .eq("id", fx.decisionId)
      .single();
    if (afterAttempt.data?.status === "withdrawn") {
      run.pass("W18-P0-02 — decision remains withdrawn (not approved)");
    } else {
      run.fail("W18-P0-02 — decision state", `expected withdrawn, got ${afterAttempt.data?.status}`);
    }

    const auditAfter = await svc
      .from("portal_audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("entity_id", fx.decisionId)
      .eq("event_type", "variation.approved");

    if ((auditAfter.count || 0) === (auditBefore.count || 0)) {
      run.pass("W18-API-04 partial — no variation.approved audit on blocked approve");
    } else {
      run.fail("W18-API-04 partial — audit leak", `before=${auditBefore.count} after=${auditAfter.count}`);
    }

    const { count: notifCount } = await svc
      .from("portal_notifications")
      .select("id", { count: "exact", head: true })
      .eq("project_id", fx.projectId)
      .eq("notification_type", "variation_approved")
      .gte("created_at", new Date(ts - 60000).toISOString());

    if ((notifCount || 0) === 0) {
      run.pass("W18-API-04 partial — no variation_approved notification from blocked approve");
    } else {
      run.fail("W18-API-04 partial — notification created", `count=${notifCount}`);
    }

    run.section("W18-SEC-03 cross-project variation respond");

    const { status: crossStatus } = await post(
      `/api/portal/app/${fx.projectId}/variations/${fx.decisionId}/respond`,
      { action: "approve" },
      freshClientBToken
    );
    if (crossStatus === 403) {
      run.pass("W18-SEC-03 — client B blocked from project A variation respond (403)");
    } else {
      run.fail("W18-SEC-03 — cross-project", `expected 403, got ${crossStatus}`);
    }
  } finally {
    await cleanup(svc, ids);
  }

  run.section("W18-SEC-03 / W18-API-03 E2E runtime (read-only)");

  const runtimePath = join(dirname(fileURLToPath(import.meta.url)), "../../e2e/.runtime.json");
  if (!existsSync(runtimePath)) {
    run.skip("W18-SEC-03 E2E seed isolation", "e2e/.runtime.json missing — run npm run test:e2e global-setup");
    run.skip("W18-API-03 selections leak scan", "e2e/.runtime.json missing");
    return;
  }

  const rt = JSON.parse(readFileSync(runtimePath, "utf8"));
  const projectA = rt.seed?.projectA;
  const projectB = rt.seed?.projectB;
  const clientUserId = rt.users?.client?.id;
  if (!projectA || !projectB || !clientUserId) {
    run.skip("W18-SEC-03 E2E seed isolation", "seed projects or client user missing in runtime.json");
    return;
  }

  const svcRt = serviceClient();
  if (!svcRt) {
    run.gap("W18-SEC-03 E2E seed preflight", "service client unavailable");
    run.gap("W18-API-03 selections", "service client unavailable");
    return;
  }

  const { data: pcuA } = await svcRt
    .from("project_client_users")
    .select("is_active")
    .eq("project_id", projectA)
    .eq("user_id", clientUserId)
    .maybeSingle();

  if (!pcuA || pcuA.is_active !== true) {
    run.gap(
      "W18-SEC-03 E2E seed — client A project link",
      "project_client_users missing/inactive for E2E projectA — run npm run test:e2e:seed (not a product 403 regression)"
    );
    run.gap("W18-API-03 selections", "E2E seed stale — same preflight");
    return;
  }

  const clientTokenRt = await getTokenForEmail(CLIENT_EMAIL);
  const clientBTokenRt = await getTokenForEmail(CLIENT_B_EMAIL);

  const homeA = await get(`/api/portal/app/${projectA}/home`, clientTokenRt);
  if (homeA.status === 200 && homeA.body?.ok) run.pass("W18-SEC-03 — client A home 200");
  else run.fail("W18-SEC-03 — client A home", `status=${homeA.status}`);

  const homeCross = await get(`/api/portal/app/${projectB}/home`, clientTokenRt);
  if (homeCross.status === 403) run.pass("W18-SEC-03 — client A blocked from project B (403)");
  else run.fail("W18-SEC-03 — client A cross-project", `status=${homeCross.status}`);

  const sel = await get(`/api/portal/app/${projectA}/selections`, clientTokenRt);
  if (sel.status === 200) {
    const s = JSON.stringify(sel.body || {});
    const leaks = ["SECRET_MARGIN", "cost_to_builder", "internal_notes"].filter((k) => s.includes(k));
    if (leaks.length === 0) run.pass("W18-API-03 — selections no internal field leak");
    else run.fail("W18-API-03 — selections leak", leaks.join(", "));
  } else {
    run.gap("W18-API-03 selections", `status=${sel.status}`);
  }
}
