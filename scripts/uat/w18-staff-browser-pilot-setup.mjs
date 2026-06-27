/**
 * W18-STAFF-BROWSER-PILOT-01 — fresh demo project setup (not __E2E_ fixture).
 *   node scripts/uat/w18-staff-browser-pilot-setup.mjs
 */
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { config as dotenvConfig } from "dotenv";
import { post, patch, get, serviceClient } from "../batch-a/_helpers.mjs";
import { buildTestJobAddress } from "../lib/testArtifactPrefixes.mjs";
import { ensureE2EUsers } from "../create-e2e-users.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
dotenvConfig({ path: join(ROOT, ".env"), override: true });

const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SB_ANON = process.env.VITE_SUPABASE_ANON_KEY;
const E2E_PASSWORD = "BlueLeaf-E2E-2026!";
const CLIENT_UAT_PASSWORD = "BlueLeaf-UAT-2026!";
const VISIBLE_CAPTION = "__BLH TEST__ W18 browser pilot visible photo";
const HIDDEN_CAPTION = "__BLH TEST__ W18 browser pilot hidden photo";
const MILESTONE_KEY = "frame";

async function tokenFor(email, password = E2E_PASSWORD) {
  const sb = createClient(SB_URL, SB_ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) throw new Error(`Sign-in failed ${email}: ${error?.message}`);
  return data.session.access_token;
}

function extractInviteToken(url) {
  const m = String(url || "").match(/\/accept-invite\/([a-f0-9]+)/i);
  return m?.[1] || null;
}

async function createProject(svc, adminToken, ts, suffix) {
  const address = buildTestJobAddress({ suite: "W18", workflowId: `BROWSER-${suffix}`, ts });
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
      portal_enabled: true,
      portal_v2_enabled: true,
      build_phase: "on_site",
      portal_client_name: "__BLH TEST__ Browser Pilot Client",
      portal_token: portalToken,
    })
    .select("id, address")
    .single();
  if (pErr || !project?.id) throw new Error(pErr?.message || "project insert failed");
  return { jobId, projectId: project.id, address: project.address };
}

async function seedPortalContent(svc, projectId, ts) {
  await svc.from("portal_milestones").insert([
    { project_id: projectId, key: "pre_construction", label: "Pre-Construction", sort_order: 0, achieved_at: "2026-02-01" },
    { project_id: projectId, key: MILESTONE_KEY, label: "Frame & Roof", sort_order: 2, is_current: true, eta: "2026-07-15" },
  ]);

  await svc.from("portal_updates").insert([
    {
      project_id: projectId,
      week_of: "2026-06-20",
      headline: "DRAFT — internal only",
      body: "Should not appear to client",
      builder_reasoning: "SECRET_MARGIN internal draft",
      published: false,
      status: "draft",
    },
    {
      project_id: projectId,
      week_of: "2026-06-18",
      headline: "Frame progress on track",
      body: "Truss delivery confirmed for Monday.",
      builder_reasoning: "INTERNAL_ONLY margin note",
      author_name: "Sam",
      published: true,
      status: "published",
      published_at: new Date().toISOString(),
    },
  ]);

  const { data: sel } = await svc
    .from("client_selections")
    .insert({
      project_id: projectId,
      category: "Kitchen",
      item_name: "Splashback Tile",
      allowance_amount: 850,
      status: "awaiting_client",
      internal_notes: "SECRET_MARGIN_NOTE_BROWSER",
      sort_order: 0,
    })
    .select("id")
    .single();

  await svc.from("selection_options").insert([
    {
      selection_id: sel.id,
      label: "Option A",
      product_name: "Subway White Gloss",
      price_inc_gst: 640,
      sort_order: 0,
      internal_notes: "SECRET_SUPPLIER_COST_BROWSER",
    },
  ]);

  await svc.from("client_actions").insert({
    project_id: projectId,
    action_type: "selection_decision",
    title: "Select Splashback Tile",
    status: "pending",
    related_entity_type: "client_selection",
    related_entity_id: sel.id,
  });

  const { data: dec } = await svc
    .from("portal_decisions")
    .insert({
      project_id: projectId,
      type: "variation",
      title: "Approve Variation — downlights",
      status: "pending",
      cost_delta: 1672,
    })
    .select("id")
    .single();

  await svc.from("client_actions").insert({
    project_id: projectId,
    action_type: "variation_approval",
    title: "Approve Variation #4",
    status: "pending",
    related_entity_type: "portal_decision",
    related_entity_id: dec.id,
  });

  const basePath = `__BLH TEST__/w18-browser-${ts}`;
  await svc.from("project_photos").insert([
    {
      project_id: projectId,
      milestone_key: MILESTONE_KEY,
      caption: HIDDEN_CAPTION,
      storage_path: `${basePath}-hidden.jpg`,
      public_url: `https://example.test/${basePath}-hidden.jpg`,
      client_visible: false,
      taken_at: new Date().toISOString().slice(0, 10),
    },
    {
      project_id: projectId,
      milestone_key: MILESTONE_KEY,
      caption: VISIBLE_CAPTION,
      storage_path: `${basePath}-visible.jpg`,
      public_url: `https://example.test/${basePath}-visible.jpg`,
      client_visible: true,
      taken_at: new Date().toISOString().slice(0, 10),
    },
  ]);

  await svc.from("portal_documents").insert({
    project_id: projectId,
    title: "BLH TEST Building Contract",
    category: "contract",
    storage_path: `${basePath}-contract.pdf`,
    is_shared: true,
    shared_at: new Date().toISOString(),
  });
}

async function probeCrossRole(projectId, users) {
  const paths = [`/api/portal/admin/v2/${projectId}/overview`];
  const roles = ["admin", "supervisor", "employee", "client"];
  const out = {};
  for (const role of roles) {
    const email = users[role]?.email;
    if (!email) continue;
    const tok = await tokenFor(email, role === "client" ? CLIENT_UAT_PASSWORD : E2E_PASSWORD).catch(() => null);
    if (!tok) {
      out[role] = { status: "auth_failed" };
      continue;
    }
    const { status } = await get(paths[0], tok);
    out[role] = { status, path: paths[0] };
  }
  return out;
}

async function main() {
  const health = await get("/api/health");
  if (health.status !== 200) throw new Error("API not healthy — run npm run dev");

  const svc = serviceClient();
  if (!svc) throw new Error("Service client unavailable");

  const users = await ensureE2EUsers();
  const adminToken = await tokenFor(users.admin.email);
  const ts = Date.now();
  const runId = `BLH-W18-BROWSER-${ts}`;
  const clientEmail = `blh.uat.browser.${ts}@blueleafbuilding.test`;
  const clientName = "__BLH TEST__ Browser Pilot Client";

  const projectA = await createProject(svc, adminToken, ts, "A");
  await seedPortalContent(svc, projectA.projectId, ts);

  const projectB = await createProject(svc, adminToken, ts + 1, "B");
  await svc.from("project_client_users").upsert(
    {
      project_id: projectB.projectId,
      user_id: users.clientB.id,
      role: "primary",
      is_active: true,
      invite_accepted_at: new Date().toISOString(),
    },
    { onConflict: "project_id,user_id" }
  );

  await patch(
    `/api/portal/admin/v2/${projectA.projectId}/settings`,
    { portalV2Enabled: true, buildPhase: "on_site", teamMembers: [], paymentInstructions: "BSB 065 000 — Ref: BLH TEST" },
    adminToken
  );

  const inv = await post(
    "/api/auth/invite",
    { email: clientEmail, fullName: clientName, role: "client", projectId: projectA.projectId },
    adminToken
  );
  if (inv.status !== 200 || !inv.body?.inviteUrl) throw new Error(`invite failed: ${inv.status} ${inv.body?.error}`);

  const inviteToken = extractInviteToken(inv.body.inviteUrl);
  const acc = await post("/api/auth/accept-invite", {
    token: inviteToken,
    password: CLIENT_UAT_PASSWORD,
    fullName: clientName,
  });
  if (acc.status !== 200) throw new Error(`accept-invite failed: ${acc.status} ${acc.body?.error}`);

  const crossRole = await probeCrossRole(projectA.projectId, { ...users, client: { email: clientEmail } });

  const shotDir = join(ROOT, "e2e", "screenshots", runId);
  mkdirSync(shotDir, { recursive: true });

  const baseUrl =
    process.env.E2E_BASE_URL ||
    (await fetch("http://[::1]:5174/").then((r) => (r.ok ? "http://[::1]:5174" : null)).catch(() => null)) ||
    "http://localhost:5174";

  const runtime = {
    runId,
    createdAt: new Date().toISOString(),
    baseUrl,
    apiUrl: "http://127.0.0.1:8787",
    branch: "portal-v2",
    projectA,
    projectB,
    visibleCaption: VISIBLE_CAPTION,
    hiddenCaption: HIDDEN_CAPTION,
    screenshotDir: shotDir,
    users: {
      admin: { email: users.admin.email, password: E2E_PASSWORD },
      supervisor: { email: users.supervisor.email, password: E2E_PASSWORD },
      employee: { email: users.employee.email, password: E2E_PASSWORD },
      client: { email: clientEmail, password: CLIENT_UAT_PASSWORD, name: clientName },
      clientB: { email: users.clientB.email, password: E2E_PASSWORD },
    },
    inviteUrl: inv.body.inviteUrl,
    crossRoleApi: crossRole,
  };

  const outPath = join(ROOT, "e2e", ".uat-browser-pilot.json");
  writeFileSync(outPath, JSON.stringify(runtime, null, 2));
  console.log(JSON.stringify({ ok: true, runId, projectId: projectA.projectId, address: projectA.address, baseUrl, screenshotDir: shotDir }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
