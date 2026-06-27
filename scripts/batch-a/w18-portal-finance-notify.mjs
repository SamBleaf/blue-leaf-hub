/**
 * W18-API-04 — Finance-event portal notification + client_action regression
 *
 * Proves sync paths in portalIntegration.mjs + portalNotify.mjs:
 * - variation sent → variation_issued notification + variation_approval action
 * - claim issued → progress_claim_issued notification + progress_claim_review action
 * - variation signed (finance) → variation_approved notification
 * - claim paid → claim_paid notification + action completed
 * - idempotent re-sync does not duplicate notifications (dedup_day)
 * - non-v2 project → no notifications
 * - void/dispute → action closed, no unsafe duplicate notifications
 * - W18-SEC-03 cross-project notifications/actions blocked
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
import {
  syncVariationSent,
  syncVariationSigned,
  syncVariationVoided,
  syncClaimIssued,
  syncClaimPaid,
  syncClaimVoided,
  syncClaimDisputed,
} from "../../server/lib/portalIntegration.mjs";

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

async function countNotifications(svc, projectId, { type, entityId, userId } = {}) {
  let q = svc.from("portal_notifications").select("id", { count: "exact", head: true }).eq("project_id", projectId);
  if (type) q = q.eq("notification_type", type);
  if (entityId) q = q.eq("related_entity_id", entityId);
  if (userId) q = q.eq("target_user_id", userId);
  const { count } = await q;
  return count || 0;
}

async function getClientAction(svc, projectId, entityType, entityId) {
  const { data } = await svc
    .from("client_actions")
    .select("id, action_type, status, project_id")
    .eq("project_id", projectId)
    .eq("related_entity_type", entityType)
    .eq("related_entity_id", entityId)
    .maybeSingle();
  return data;
}

async function cleanup(svc, ids) {
  if (!svc) return;
  const {
    projectId,
    projectNonV2Id,
    jobId,
    jobNonV2Id,
    variationIds = [],
    claimIds = [],
    decisionIds = [],
    portalClaimIds = [],
  } = ids;

  for (const dId of decisionIds) {
    await svc.from("portal_audit_logs").delete().eq("entity_id", dId);
    await svc.from("client_actions").delete().eq("related_entity_id", dId);
    await svc.from("portal_decisions").delete().eq("id", dId);
  }
  for (const pcId of portalClaimIds) {
    await svc.from("client_actions").delete().eq("related_entity_id", pcId);
    await svc.from("portal_claims").delete().eq("id", pcId);
  }
  for (const cId of claimIds) {
    await svc.from("progress_claim_payments").delete().eq("progress_claim_id", cId);
    await svc.from("progress_claims").delete().eq("id", cId);
  }
  for (const vId of variationIds) {
    await svc.from("job_variations").delete().eq("id", vId);
  }
  for (const pId of [projectId, projectNonV2Id].filter(Boolean)) {
    await svc.from("portal_notifications").delete().eq("project_id", pId);
    await svc.from("project_client_users").delete().eq("project_id", pId);
    await svc.from("projects").delete().eq("id", pId);
  }
  for (const jId of [jobId, jobNonV2Id].filter(Boolean)) {
    await svc.from("jobs").delete().eq("id", jId);
  }
}

async function setupJobProject(svc, adminToken, ts, { v2Enabled = true, tag = "" } = {}) {
  const address = buildTestJobAddress({ suite: "W18", workflowId: `NOTIFY${tag}`, ts });
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
      portal_enabled: v2Enabled,
      portal_v2_enabled: v2Enabled,
      portal_client_name: "BLH TEST Client",
      portal_client_email: CLIENT_EMAIL,
    })
    .select("id")
    .single();
  if (pErr || !project?.id) throw new Error(pErr?.message || "project insert failed");

  if (v2Enabled) {
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
  }

  return { jobId, projectId: project.id, clientUserId };
}

async function insertVariation(svc, jobId, num, title) {
  const { data, error } = await svc
    .from("job_variations")
    .insert({
      job_id: jobId,
      variation_number: num,
      title,
      description: "__BLH TEST__ W18-API-04 variation",
      amount_ex_gst: 1000,
      status: "sent_to_client",
    })
    .select("*")
    .single();
  if (error || !data?.id) throw new Error(error?.message || "variation insert failed");
  return data;
}

async function insertClaim(svc, jobId, num, stage = "frame") {
  const { data, error } = await svc
    .from("progress_claims")
    .insert({
      job_id: jobId,
      claim_number: num,
      stage,
      amount_ex_gst: 5000,
      status: "issued",
      issued_date: new Date().toISOString().slice(0, 10),
      due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    })
    .select("*")
    .single();
  if (error || !data?.id) throw new Error(error?.message || "claim insert failed");
  return data;
}

async function getDecisionForVariation(svc, projectId, variationId) {
  const { data } = await svc
    .from("portal_decisions")
    .select("id, status")
    .eq("project_id", projectId)
    .eq("job_variation_id", variationId)
    .maybeSingle();
  return data;
}

async function getPortalClaim(svc, projectId, progressClaimId) {
  const { data } = await svc
    .from("portal_claims")
    .select("id, status")
    .eq("project_id", projectId)
    .eq("progress_claim_id", progressClaimId)
    .maybeSingle();
  return data;
}

export async function runW18PortalFinanceNotify(run) {
  run.section("W18-API-04 static guard (code)");

  const intSrc = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../server/lib/portalIntegration.mjs"),
    "utf8"
  );
  const notifySrc = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../server/lib/portalNotify.mjs"),
    "utf8"
  );

  const checks = [
    ["syncVariationSent → notifyClient", intSrc.includes('type: "variation_issued"')],
    ["syncClaimIssued → notifyClient", intSrc.includes('type: "progress_claim_issued"')],
    ["syncClaimPaid → claim_paid", intSrc.includes('type: "claim_paid"')],
    ["syncVariationSigned → variation_approved", intSrc.includes('type: "variation_approved"')],
    ["notifyClient dedup upsert", notifySrc.includes("ignoreDuplicates: true")],
    ["notifyClient v2 gate", notifySrc.includes("portal_v2_enabled !== true")],
  ];
  for (const [name, ok] of checks) {
    if (ok) run.pass(`W18-API-04 code — ${name}`);
    else run.fail(`W18-API-04 code — ${name}`, "missing");
  }

  if (!WRITE) {
    run.skip("W18-API-04 finance event notifications", "requires --write");
    return;
  }

  run.section("W18-API-04 write — finance notification regression");

  const svc = serviceClient();
  if (!svc) {
    run.fail("W18-API-04 setup", "service client unavailable");
    return;
  }

  await ensureE2EUsers();
  const adminToken = await getAuthToken();
  const ts = Date.now();
  const ids = { variationIds: [], claimIds: [], decisionIds: [], portalClaimIds: [] };

  try {
    const { jobId, projectId, clientUserId } = await setupJobProject(svc, adminToken, ts, { v2Enabled: true });
    Object.assign(ids, { jobId, projectId });

    // ── 1. Variation sent ───────────────────────────────────────────────────
    const var1 = await insertVariation(svc, jobId, 8000 + (ts % 99), "__BLH TEST__ W18 notify var sent");
    ids.variationIds.push(var1.id);
    await syncVariationSent({ jobId, variation: var1 });

    const dec1 = await getDecisionForVariation(svc, projectId, var1.id);
    if (!dec1?.id) {
      run.fail("W18-API-04 variation sent — portal_decision", "missing");
      return;
    }
    ids.decisionIds.push(dec1.id);

    const action1 = await getClientAction(svc, projectId, "portal_decision", dec1.id);
    const nVarIssued = await countNotifications(svc, projectId, {
      type: "variation_issued",
      entityId: dec1.id,
      userId: clientUserId,
    });

    if (action1?.action_type === "variation_approval" && action1.status === "pending") {
      run.pass("W18-API-04 — variation sent creates variation_approval action");
    } else {
      run.fail("W18-API-04 — variation action", JSON.stringify(action1));
    }
    if (nVarIssued >= 1) {
      run.pass("W18-API-04 — variation sent creates variation_issued notification");
    } else {
      run.fail("W18-API-04 — variation_issued notification", `count=${nVarIssued}`);
    }

    // Idempotency
    await syncVariationSent({ jobId, variation: var1 });
    const nVarIssued2 = await countNotifications(svc, projectId, {
      type: "variation_issued",
      entityId: dec1.id,
      userId: clientUserId,
    });
    if (nVarIssued2 === nVarIssued) {
      run.pass("W18-API-04 — variation sent re-sync does not duplicate notification");
    } else {
      run.fail("W18-API-04 — variation idempotency", `${nVarIssued} → ${nVarIssued2}`);
    }

    // ── 2. Claim sent ───────────────────────────────────────────────────────
    const claim1 = await insertClaim(svc, jobId, 7000 + (ts % 99));
    ids.claimIds.push(claim1.id);
    await syncClaimIssued({ jobId, claim: claim1, stageLabel: "Frame stage" });

    const pc1 = await getPortalClaim(svc, projectId, claim1.id);
    if (!pc1?.id) {
      run.fail("W18-API-04 claim sent — portal_claim", "missing");
      return;
    }
    ids.portalClaimIds.push(pc1.id);

    const actionClaim1 = await getClientAction(svc, projectId, "portal_claim", pc1.id);
    const nClaimIssued = await countNotifications(svc, projectId, {
      type: "progress_claim_issued",
      entityId: pc1.id,
      userId: clientUserId,
    });

    if (actionClaim1?.action_type === "progress_claim_review" && actionClaim1.status === "pending") {
      run.pass("W18-API-04 — claim sent creates progress_claim_review action");
    } else {
      run.fail("W18-API-04 — claim action", JSON.stringify(actionClaim1));
    }
    if (nClaimIssued >= 1) {
      run.pass("W18-API-04 — claim sent creates progress_claim_issued notification");
    } else {
      run.fail("W18-API-04 — progress_claim_issued notification", `count=${nClaimIssued}`);
    }

    await syncClaimIssued({ jobId, claim: claim1, stageLabel: "Frame stage" });
    const nClaimIssued2 = await countNotifications(svc, projectId, {
      type: "progress_claim_issued",
      entityId: pc1.id,
      userId: clientUserId,
    });
    if (nClaimIssued2 === nClaimIssued) {
      run.pass("W18-API-04 — claim sent re-sync does not duplicate notification");
    } else {
      run.fail("W18-API-04 — claim idempotency", `${nClaimIssued} → ${nClaimIssued2}`);
    }

    // ── 3. Client variation approve (portal route — audit, not variation_approved notify) ──
    const beforeApprovedNotify = await countNotifications(svc, projectId, {
      type: "variation_approved",
      userId: clientUserId,
    });
    const freshClientToken = await getTokenForEmail(CLIENT_EMAIL);
    const approve = await post(
      `/api/portal/app/${projectId}/variations/${dec1.id}/respond`,
      { action: "approve", note: "__BLH TEST__ approved" },
      freshClientToken
    );
    if (approve.status === 200 && approve.body?.ok) {
      run.pass("W18-API-04 — client variation approve succeeds");
    } else {
      run.fail("W18-API-04 — client approve", `status=${approve.status}`);
    }

    const { count: auditCount } = await svc
      .from("portal_audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("entity_id", dec1.id)
      .eq("event_type", "variation.approved");
    if ((auditCount || 0) >= 1) {
      run.pass("W18-API-04 — client approve creates variation.approved audit");
    } else {
      run.fail("W18-API-04 — approve audit", "missing");
    }

    const afterApprovedNotify = await countNotifications(svc, projectId, {
      type: "variation_approved",
      userId: clientUserId,
    });
    if (afterApprovedNotify === beforeApprovedNotify) {
      run.pass("W18-API-04 — client approve does not create variation_approved notification (finance sign path)");
    } else {
      run.gap(
        "W18-API-04 — client approve notification",
        "unexpected variation_approved on client approve — should come from syncVariationSigned only"
      );
    }

    // ── 4. Finance variation signed → variation_approved notification ───────
    await syncVariationSigned({ variationId: var1.id });
    const nVarApproved = await countNotifications(svc, projectId, {
      type: "variation_approved",
      entityId: dec1.id,
      userId: clientUserId,
    });
    if (nVarApproved >= 1) {
      run.pass("W18-API-04 — syncVariationSigned creates variation_approved notification");
    } else {
      run.fail("W18-API-04 — variation_approved notification", `count=${nVarApproved}`);
    }

    // ── 5. Claim paid ───────────────────────────────────────────────────────
    await svc.from("progress_claim_payments").insert({
      progress_claim_id: claim1.id,
      payment_amount: 5500,
      payment_date: new Date().toISOString().slice(0, 10),
      payment_method: "eft",
    });
    const beforePaidNotify = await countNotifications(svc, projectId, {
      type: "claim_paid",
      entityId: pc1.id,
      userId: clientUserId,
    });
    await syncClaimPaid({ claimId: claim1.id, newStatus: "paid" });
    const actionPaid = await getClientAction(svc, projectId, "portal_claim", pc1.id);
    const nClaimPaid = await countNotifications(svc, projectId, {
      type: "claim_paid",
      entityId: pc1.id,
      userId: clientUserId,
    });

    if (actionPaid?.status === "completed") {
      run.pass("W18-API-04 — claim paid completes client_action");
    } else {
      run.fail("W18-API-04 — claim paid action", actionPaid?.status || "missing");
    }
    if (nClaimPaid > beforePaidNotify) {
      run.pass("W18-API-04 — claim paid creates claim_paid notification");
    } else {
      run.fail("W18-API-04 — claim_paid notification", `before=${beforePaidNotify} after=${nClaimPaid}`);
    }

    // Partial paid — no claim_paid notification expected
    const claim2 = await insertClaim(svc, jobId, 7100 + (ts % 99), "lock_up");
    ids.claimIds.push(claim2.id);
    await syncClaimIssued({ jobId, claim: claim2 });
    const pc2 = await getPortalClaim(svc, projectId, claim2.id);
    ids.portalClaimIds.push(pc2.id);
    await svc.from("progress_claim_payments").insert({
      progress_claim_id: claim2.id,
      payment_amount: 1000,
      payment_date: new Date().toISOString().slice(0, 10),
      payment_method: "eft",
    });
    const beforePartial = await countNotifications(svc, projectId, { type: "claim_paid", userId: clientUserId });
    await syncClaimPaid({ claimId: claim2.id, newStatus: "partially_paid" });
    const afterPartial = await countNotifications(svc, projectId, { type: "claim_paid", userId: clientUserId });
    if (afterPartial === beforePartial) {
      run.pass("W18-API-04 — partial payment does not create claim_paid notification");
    } else {
      run.gap("W18-API-04 — partial payment notify", "unexpected claim_paid on partially_paid");
    }

    // ── 6. Dispute ──────────────────────────────────────────────────────────
    const claim3 = await insertClaim(svc, jobId, 7200 + (ts % 99), "fixing");
    ids.claimIds.push(claim3.id);
    await syncClaimIssued({ jobId, claim: claim3 });
    const pc3 = await getPortalClaim(svc, projectId, claim3.id);
    ids.portalClaimIds.push(pc3.id);
    const beforeDispute = await countNotifications(svc, projectId, { userId: clientUserId });
    await syncClaimDisputed({ claimId: claim3.id, reason: "__BLH TEST__ dispute" });
    const afterDispute = await countNotifications(svc, projectId, { userId: clientUserId });
    const actionDispute = await getClientAction(svc, projectId, "portal_claim", pc3.id);
    const pc3Row = await svc.from("portal_claims").select("status").eq("id", pc3.id).single();

    if (actionDispute?.status === "completed") {
      run.pass("W18-API-04 — dispute closes client_action");
    } else {
      run.fail("W18-API-04 — dispute action", actionDispute?.status || "missing");
    }
    if (pc3Row.data?.status === "disputed") {
      run.pass("W18-API-04 — dispute sets portal_claim status disputed");
    } else {
      run.fail("W18-API-04 — dispute status", pc3Row.data?.status || "missing");
    }
    if (afterDispute === beforeDispute) {
      run.pass("W18-API-04 — dispute does not create extra notification (action-only sync)");
    } else {
      run.gap("W18-API-04 — dispute notification", `count ${beforeDispute} → ${afterDispute}`);
    }

    // ── 7. Void variation + void claim ──────────────────────────────────────
    const varVoid = await insertVariation(svc, jobId, 8100 + (ts % 99), "__BLH TEST__ W18 void notify");
    ids.variationIds.push(varVoid.id);
    await syncVariationSent({ jobId, variation: varVoid });
    const decVoid = await getDecisionForVariation(svc, projectId, varVoid.id);
    ids.decisionIds.push(decVoid.id);
    const beforeVoidVar = await countNotifications(svc, projectId, { userId: clientUserId });
    await syncVariationVoided({ variationId: varVoid.id });
    const afterVoidVar = await countNotifications(svc, projectId, { userId: clientUserId });
    const decVoidRow = await svc.from("portal_decisions").select("status").eq("id", decVoid.id).single();
    const actionVoidVar = await getClientAction(svc, projectId, "portal_decision", decVoid.id);

    if (decVoidRow.data?.status === "withdrawn") run.pass("W18-API-04 — void variation withdraws decision");
    else run.fail("W18-API-04 — void variation status", decVoidRow.data?.status);
    if (actionVoidVar?.status === "completed") run.pass("W18-API-04 — void variation completes action");
    else run.fail("W18-API-04 — void variation action", actionVoidVar?.status);
    if (afterVoidVar === beforeVoidVar) run.pass("W18-API-04 — void variation does not add notification");
    else run.gap("W18-API-04 — void variation notification", `${beforeVoidVar} → ${afterVoidVar}`);

    const claim4 = await insertClaim(svc, jobId, 7300 + (ts % 99), "practical_completion");
    ids.claimIds.push(claim4.id);
    await syncClaimIssued({ jobId, claim: claim4 });
    const pc4 = await getPortalClaim(svc, projectId, claim4.id);
    ids.portalClaimIds.push(pc4.id);
    const beforeVoidClaim = await countNotifications(svc, projectId, { userId: clientUserId });
    await syncClaimVoided({ claimId: claim4.id });
    const afterVoidClaim = await countNotifications(svc, projectId, { userId: clientUserId });
    const pc4Row = await svc.from("portal_claims").select("status").eq("id", pc4.id).single();
    const actionVoidClaim = await getClientAction(svc, projectId, "portal_claim", pc4.id);

    if (pc4Row.data?.status === "void") run.pass("W18-API-04 — void claim sets portal_claim void");
    else run.fail("W18-API-04 — void claim status", pc4Row.data?.status);
    if (actionVoidClaim?.status === "completed") run.pass("W18-API-04 — void claim completes action");
    else run.fail("W18-API-04 — void claim action", actionVoidClaim?.status);
    if (afterVoidClaim === beforeVoidClaim) run.pass("W18-API-04 — void claim does not add notification");
    else run.gap("W18-API-04 — void claim notification", `${beforeVoidClaim} → ${afterVoidClaim}`);

    // ── 8. Non-v2 project — no notifications ────────────────────────────────
    const nonV2 = await setupJobProject(svc, adminToken, ts + 1, { v2Enabled: false, tag: "NOV2" });
    ids.jobNonV2Id = nonV2.jobId;
    ids.projectNonV2Id = nonV2.projectId;
    const varNonV2 = await insertVariation(svc, nonV2.jobId, 8200 + (ts % 99), "__BLH TEST__ non-v2");
    ids.variationIds.push(varNonV2.id);
    await syncVariationSent({ jobId: nonV2.jobId, variation: varNonV2 });
    const nNonV2 = await countNotifications(svc, nonV2.projectId);
    const decNonV2 = await getDecisionForVariation(svc, nonV2.projectId, varNonV2.id);
    if (!decNonV2 && nNonV2 === 0) {
      run.pass("W18-API-04 — non-v2 project sync no-ops (no decision, no notification)");
    } else {
      run.fail("W18-API-04 — non-v2 gate", `decision=${!!decNonV2} notifications=${nNonV2}`);
    }

    // ── 9. API: notifications scoped to user + project ────────────────────────
    const clientTokenApi = await getTokenForEmail(CLIENT_EMAIL);
    const clientBToken = await getTokenForEmail(CLIENT_B_EMAIL);
    const notifApi = await get(`/api/portal/app/${projectId}/notifications`, clientTokenApi);
    if (notifApi.status === 200 && notifApi.body?.ok) {
      const notes = notifApi.body.notifications || [];
      const types = notes.map((n) => n.notificationType || n.notification_type);
      const hasVarIssued = types.includes("variation_issued");
      const wrongProject = notes.some((n) => (n.projectId || n.project_id) && (n.projectId || n.project_id) !== projectId);
      if (hasVarIssued && !wrongProject) {
        run.pass("W18-API-04 — GET notifications returns scoped finance events");
      } else {
        run.fail("W18-API-04 — GET notifications", `types=${types.join(",")} wrongProject=${wrongProject}`);
      }
    } else {
      run.fail("W18-API-04 — GET notifications", `status=${notifApi.status}`);
    }

    const actionsApi = await get(`/api/portal/app/${projectId}/actions`, clientTokenApi);
    if (actionsApi.status === 200 && actionsApi.body?.ok) {
      const actions = actionsApi.body.actions || [];
      const leak = actions.some((a) => a.projectId && a.projectId !== projectId);
      if (!leak) run.pass("W18-API-02 — GET actions scoped to project");
      else run.fail("W18-API-02 — actions scope", "cross-project leak");
    } else {
      run.fail("W18-API-02 — GET actions", `status=${actionsApi.status}`);
    }

    const crossNotif = await get(`/api/portal/app/${projectId}/notifications`, clientBToken);
    const crossActions = await get(`/api/portal/app/${projectId}/actions`, clientBToken);
    if (crossNotif.status === 403 && crossActions.status === 403) {
      run.pass("W18-SEC-03 — client B blocked from project A notifications + actions (403)");
    } else {
      run.fail("W18-SEC-03 — cross-project", `notif=${crossNotif.status} actions=${crossActions.status}`);
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
  const projectB = rt.seed?.projectB;
  if (!projectB) {
    run.skip("W18-SEC-03 E2E isolation", "seed projectB missing");
    return;
  }

  const clientTokenRt = await getTokenForEmail(CLIENT_EMAIL);
  const crossHome = await get(`/api/portal/app/${projectB}/home`, clientTokenRt);
  if (crossHome.status === 403) run.pass("W18-SEC-03 E2E — client A blocked from project B home");
  else run.fail("W18-SEC-03 E2E cross-project", `status=${crossHome.status}`);
}
