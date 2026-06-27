/**
 * Seeds realistic E2E workflow data — all rows tagged __E2E_ for safe cleanup.
 *   node scripts/seed-e2e-suite.mjs
 *   node scripts/seed-e2e-suite.mjs --cleanup
 */
import { createClient } from "@supabase/supabase-js";
import { config as dotenvConfig } from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { normaliseAddress } from "../server/lib/addressNormalise.mjs";

dotenvConfig({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const E2E_MARK = "__E2E_";
export const E2E_JOB_ID = "e2e00000-0000-4000-8000-000000000001";
export const E2E_PROJECT_A = "e2e00000-0000-4000-8000-000000000002";
export const E2E_PROJECT_B = "e2e00000-0000-4000-8000-000000000003";
export const E2E_LEAD_ID = "e2e00000-0000-4000-8000-000000000004";

const ADDR_A = `${E2E_MARK}21 Folkstone Rd, Brighton SA`;
const ADDR_B = `${E2E_MARK}8 Seaview Tce, Glenelg SA`;

function sb() {
  if (!SB_URL || !SVC) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(SB_URL, SVC, { auth: { persistSession: false } });
}

async function linkClient(supabase, projectId, userId, role = "primary") {
  await supabase.from("project_client_users").upsert(
    {
      project_id: projectId,
      user_id: userId,
      role,
      is_active: true,
      invite_accepted_at: new Date().toISOString(),
    },
    { onConflict: "project_id,user_id" }
  );
}

async function seedPortalV2(supabase, projectId) {
  await supabase.from("portal_milestones").delete().eq("project_id", projectId);
  await supabase.from("client_actions").delete().eq("project_id", projectId);
  const { data: sels } = await supabase.from("client_selections").select("id").eq("project_id", projectId);
  for (const s of sels || []) await supabase.from("selection_options").delete().eq("selection_id", s.id);
  await supabase.from("client_selections").delete().eq("project_id", projectId);
  await supabase.from("portal_decisions").delete().eq("project_id", projectId);
  await supabase.from("portal_claims").delete().eq("project_id", projectId);
  await supabase.from("portal_documents").delete().eq("project_id", projectId);
  await supabase.from("portal_updates").delete().eq("project_id", projectId);

  await supabase.from("portal_milestones").insert([
    { project_id: projectId, key: "pre_construction", label: "Pre-Construction", sort_order: 0, achieved_at: "2026-02-01" },
    { project_id: projectId, key: "site_slab", label: "Slab", sort_order: 1, achieved_at: "2026-04-10" },
    {
      project_id: projectId,
      key: "frame",
      label: "Frame & Roof",
      sort_order: 2,
      is_current: true,
      confidence: "watch",
      confidence_note: "Roof trusses delayed 5 days — no lock-up impact expected.",
      eta: "2026-07-15",
    },
    { project_id: projectId, key: "lock_up", label: "Lock-Up", sort_order: 3 },
    { project_id: projectId, key: "completion", label: "Handover", sort_order: 5 },
  ]);

  await supabase.from("portal_updates").insert({
    project_id: projectId,
    week_of: "2026-06-18",
    headline: "Frame is 90% complete — roof trusses next week",
    body: "Wall frames and top plate are done. Truss delivery confirmed for Monday.",
    builder_reasoning: "INTERNAL_ONLY: margin note — must not appear in client API",
    author_name: "Sam",
    published: true,
    status: "published",
    published_at: new Date().toISOString(),
  });

  const { data: sel, error: selErr } = await supabase
    .from("client_selections")
    .insert({
      project_id: projectId,
      category: "Kitchen",
      item_name: "Splashback Tile",
      room_area: "Kitchen",
      due_date: "2026-07-04",
      allowance_amount: 850,
      status: "awaiting_client",
      internal_notes: "SECRET_MARGIN_NOTE_E2E",
      sort_order: 0,
    })
    .select("id")
    .single();
  if (selErr || !sel) throw new Error(`client_selections insert: ${selErr?.message || "no row"}`);

  await supabase.from("selection_options").insert([
    {
      selection_id: sel.id,
      label: "Option A",
      product_name: "Subway White Gloss",
      supplier: "Tile Republic",
      price_inc_gst: 640,
      is_recommended: true,
      sort_order: 0,
      internal_notes: "SECRET_SUPPLIER_COST_E2E",
    },
    {
      selection_id: sel.id,
      label: "Option B",
      product_name: "Terracotta Handmade",
      supplier: "Artisan Tiles",
      price_inc_gst: 1240,
      sort_order: 1,
    },
  ]);

  await supabase.from("client_actions").insert({
    project_id: projectId,
    action_type: "selection_decision",
    title: "Select Splashback Tile",
    description: "Kitchen — allowance $850",
    related_entity_type: "client_selection",
    related_entity_id: sel.id,
    due_date: "2026-07-04",
    status: "pending",
  });

  const { data: dec } = await supabase
    .from("portal_decisions")
    .insert({
      project_id: projectId,
      type: "variation",
      title: "Additional downlights, living room",
      status: "pending",
      description: "6 × LED downlights with dimmer",
      cost_delta: 1672,
      schedule_delta: 0,
    })
    .select("id")
    .single();

  await supabase.from("client_actions").insert({
    project_id: projectId,
    action_type: "variation_approval",
    title: "Approve Variation #4",
    related_entity_type: "portal_decision",
    related_entity_id: dec.id,
    status: "pending",
  });

  await supabase.from("portal_claims").insert({
    project_id: projectId,
    stage_name: "Frame & Roof",
    amount: 48400,
    status: "invoiced",
    due_approx: "30 Jun 2026",
    sort_order: 0,
  });

  await supabase.from("portal_documents").insert({
    project_id: projectId,
    folder: "contract",
    title: "Building Contract.pdf",
    client_visible: true,
    storage_provider: "dropbox",
    storage_path: "/e2e/demo/contract",
  });
}

async function purgeProject(supabase, projectId) {
  if (!projectId) return;
  const { data: sels } = await supabase.from("client_selections").select("id").eq("project_id", projectId);
  for (const s of sels || []) await supabase.from("selection_options").delete().eq("selection_id", s.id);
  for (const t of [
    "client_actions",
    "portal_milestones",
    "client_selections",
    "portal_documents",
    "portal_meetings",
    "portal_messages",
    "portal_notifications",
    "portal_claims",
    "portal_decisions",
    "portal_updates",
    "project_client_users",
  ]) {
    await supabase.from(t).delete().eq("project_id", projectId);
  }
  await supabase.from("projects").delete().eq("id", projectId);
}

export async function seedE2ESuite({ users } = {}) {
  const supabase = sb();
  const now = new Date().toISOString();
  const addrNorm = normaliseAddress(ADDR_A);

  // Clean fixed IDs and any prior E2E rows tied to this job
  await supabase.from("financial_documents").delete().eq("job_id", E2E_JOB_ID);
  await supabase.from("job_variations").delete().eq("job_id", E2E_JOB_ID);
  await supabase.from("leads").delete().eq("id", E2E_LEAD_ID);
  const { data: jobProjects } = await supabase.from("projects").select("id").eq("job_id", E2E_JOB_ID);
  for (const p of jobProjects || []) await purgeProject(supabase, p.id);
  await purgeProject(supabase, E2E_PROJECT_B);
  await purgeProject(supabase, E2E_PROJECT_A);
  await supabase.from("jobs").delete().eq("id", E2E_JOB_ID);
  // Force-remove fixed IDs if partial drift left rows (e.g. after long regression runs)
  for (const pid of [E2E_PROJECT_A, E2E_PROJECT_B]) {
    await supabase.from("project_client_users").delete().eq("project_id", pid);
    await supabase.from("projects").delete().eq("id", pid);
  }
  await supabase.from("jobs").delete().eq("id", E2E_JOB_ID);

  const { error: jobErr } = await supabase.from("jobs").insert({
    id: E2E_JOB_ID,
    address: ADDR_A,
    address_normalised: addrNorm.normalised,
    address_suburb: addrNorm.suburb || "Brighton",
    address_state: addrNorm.state || "SA",
    address_postcode: addrNorm.postcode || "5048",
    project_type: "new_home",
    client_name: "David & Claire Sutton",
    client_email: users?.client?.email || "e2e-client@blueleafbuilding.test",
    client_phone: "0412 345 678",
    status: "tendering", // not 'won' yet — mig 096 trigger would auto-create a project
    original_contract_value: 1_450_000,
    contract_value: 1_450_000,
    target_margin_pct: 38,
    floor_margin_pct: 30,
    forecast_total_cost: 980_000,
    storeys: 2,
    floor_area_m2: 285,
    created_at: now,
  });
  if (jobErr) throw new Error(`jobs insert: ${jobErr.message}`);

  const { error: projAErr } = await supabase.from("projects").insert({
    id: E2E_PROJECT_A,
    job_id: E2E_JOB_ID,
    address: ADDR_A,
    status: "active",
    contract_value: 1_450_000,
    portal_enabled: true,
    portal_v2_enabled: true,
    build_phase: "on_site",
    portal_client_name: "David & Claire Sutton",
    portal_client_email: users?.client?.email,
    payment_instructions: "BSB 065 000 — Ref: Folkstone Rd",
    created_at: now,
    updated_at: now,
  });
  if (projAErr) throw new Error(`project A insert: ${projAErr.message}`);

  const { error: winErr } = await supabase
    .from("jobs")
    .update({ status: "won", won_at: now })
    .eq("id", E2E_JOB_ID);
  if (winErr) throw new Error(`job win update: ${winErr.message}`);

  const { error: projBErr } = await supabase.from("projects").insert({
    id: E2E_PROJECT_B,
    address: ADDR_B,
    status: "active",
    contract_value: 890_000,
    portal_enabled: true,
    portal_v2_enabled: true,
    build_phase: "on_site",
    portal_client_name: "E2E Isolation Client B",
    created_at: now,
    updated_at: now,
  });
  if (projBErr) throw new Error(`project B insert: ${projBErr.message}`);

  const { error: leadErr } = await supabase.from("leads").insert({
    id: E2E_LEAD_ID,
    name: "David & Claire Sutton",
    first_name: "David",
    last_name: "Sutton",
    email: users?.client?.email || "e2e-client@blueleafbuilding.test",
    phone: "0412 345 678",
    project_description: `${E2E_MARK}Two-storey coastal new build, Brighton`,
    stage: "won",
    lead_source: "referral",
    project_type: "new_build",
    construction_budget_min: 1_400_000,
    construction_budget_max: 1_600_000,
    job_id: E2E_JOB_ID,
    created_at: now,
    updated_at: now,
  });
  if (leadErr) throw new Error(`leads insert: ${leadErr.message}`);

  const { error: finErr } = await supabase.from("financial_documents").insert({
    job_id: E2E_JOB_ID,
    source: "manual",
    status: "approved",
    supplier_name: "Adelaide Concrete Co",
    amount_ex_gst: 68_000,
    invoice_number: "E2E-INV-001",
    created_at: now,
    updated_at: now,
  });
  if (finErr) throw new Error(`financial_documents insert: ${finErr.message}`);

  const { error: varErr } = await supabase.from("job_variations").insert({
    job_id: E2E_JOB_ID,
    variation_number: 1,
    title: "Upgrade kitchen benchtop",
    amount_ex_gst: 12_000,
    cost_to_builder: 8_200,
    status: "signed",
    created_at: now,
    updated_at: now,
  });
  if (varErr) throw new Error(`job_variations insert: ${varErr.message}`);

  await seedPortalV2(supabase, E2E_PROJECT_A);
  await seedPortalV2(supabase, E2E_PROJECT_B);

  if (users?.client?.id) await linkClient(supabase, E2E_PROJECT_A, users.client.id);
  if (users?.clientB?.id) await linkClient(supabase, E2E_PROJECT_B, users.clientB.id);

  return {
    mark: E2E_MARK,
    jobId: E2E_JOB_ID,
    projectA: E2E_PROJECT_A,
    projectB: E2E_PROJECT_B,
    leadId: E2E_LEAD_ID,
    addressA: ADDR_A,
    addressB: ADDR_B,
  };
}

export async function cleanupE2ESuite(seed) {
  if (!seed) return;
  const supabase = sb();
  for (const pid of [seed.projectA, seed.projectB].filter(Boolean)) {
    await purgeProject(supabase, pid);
  }
  if (seed.jobId) {
    await supabase.from("financial_documents").delete().eq("job_id", seed.jobId);
    await supabase.from("job_variations").delete().eq("job_id", seed.jobId);
    await supabase.from("jobs").delete().eq("id", seed.jobId);
  }
  if (seed.leadId) await supabase.from("leads").delete().eq("id", seed.leadId);
}

const isMain = process.argv[1]?.includes("seed-e2e-suite");
if (isMain) {
  if (process.argv.includes("--cleanup")) {
    await cleanupE2ESuite({
      projectA: E2E_PROJECT_A,
      projectB: E2E_PROJECT_B,
      jobId: E2E_JOB_ID,
      leadId: E2E_LEAD_ID,
    });
    console.log("E2E seed cleaned up");
  } else {
    const seed = await seedE2ESuite();
    console.log("E2E seed ready:", seed);
  }
}
