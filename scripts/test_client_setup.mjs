/**
 * Stand up (or tear down) a ready-to-walk Client Portal v2 demo so you can log in
 * as a test CLIENT and click through the live portal.
 *
 *   node scripts/test_client_setup.mjs            → create demo project + client + seed
 *   node scripts/test_client_setup.mjs --cleanup  → remove it all
 *
 * Then: `npm run dev`, open the Vite URL (http://localhost:5173), log in at /login
 * with the printed credentials → you'll land in the client portal.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config();
const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SVC) { console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(2); }
const sb = createClient(URL, SVC, { auth: { persistSession: false } });

const ADDR = "__DEMO 21 Folkstone Rd, Brighton";
const EMAIL = "testclient@example.test";
const PASSWORD = "BlueLeafTest1!";
const CLEANUP = process.argv.includes("--cleanup");

async function findProjects() {
  const { data } = await sb.from("projects").select("id").eq("address", ADDR);
  return (data || []).map((p) => p.id);
}
async function findUser() {
  const { data } = await sb.from("user_profiles").select("id").eq("email", EMAIL).maybeSingle();
  return data?.id || null;
}

async function teardown() {
  const projectIds = await findProjects();
  for (const pid of projectIds) {
    const { data: sels } = await sb.from("client_selections").select("id").eq("project_id", pid);
    for (const s of sels || []) await sb.from("selection_options").delete().eq("selection_id", s.id);
    for (const t of ["client_actions", "portal_milestones", "client_selections", "portal_documents", "portal_meetings", "portal_messages", "portal_notifications", "portal_claims", "portal_decisions", "portal_updates", "project_client_users"]) {
      await sb.from(t).delete().eq("project_id", pid);
    }
    const { error } = await sb.from("projects").delete().eq("id", pid);
    if (error) await sb.from("projects").update({ portal_enabled: false, portal_v2_enabled: false, address: "__DEMO_DELETED" }).eq("id", pid);
  }
  const uid = await findUser();
  if (uid) { await sb.from("user_profiles").delete().eq("id", uid); await sb.auth.admin.deleteUser(uid); }
  console.log(`Cleaned up: ${projectIds.length} project(s), ${uid ? 1 : 0} user.`);
}

async function setup() {
  await teardown(); // idempotent: clear any prior run first

  const { data: project, error: pErr } = await sb.from("projects").insert({
    address: ADDR,
    portal_enabled: true,
    portal_v2_enabled: true,
    build_phase: "on_site",
    contract_value: 1_450_000,
    portal_client_name: "David & Claire Sutton",
    portal_client_email: EMAIL,
    payment_instructions: "Account name: Blue Leaf Building Pty Ltd\nBSB: 065 000\nAccount: 1234 5678\nReference: 21 Folkstone Rd",
    team_members: [
      { name: "Sam Morris", role: "Director", contactPreference: "call" },
      { name: "Site Supervisor", role: "On-site contact", contactPreference: "call" },
    ],
  }).select("id").single();
  if (pErr) throw new Error("create project: " + pErr.message);
  const pid = project.id;

  // Milestones — pre-construction → handover, "Frame & Roof" current on a watch.
  await sb.from("portal_milestones").insert([
    { project_id: pid, key: "pre_construction", label: "Pre-Construction", sort_order: 0, achieved_at: "2026-03-01" },
    { project_id: pid, key: "site_slab", label: "Slab", sort_order: 1, achieved_at: "2026-04-20" },
    { project_id: pid, key: "frame", label: "Frame & Roof", sort_order: 2, is_current: true, confidence: "watch", confidence_note: "Roof trusses delayed 5 days due to supplier lead time. No change to the lock-up date expected.", eta: "2026-07-15" },
    { project_id: pid, key: "lock_up", label: "Lock-Up", sort_order: 3, stage_preview: "Roof cladding, windows and external doors are installed and the house becomes weatherproof. Typically 3–4 weeks." },
    { project_id: pid, key: "fitout", label: "Fit-Out", sort_order: 4 },
    { project_id: pid, key: "completion", label: "Handover", sort_order: 5 },
  ]);

  await sb.from("portal_updates").insert({
    project_id: pid, week_of: "2026-06-18", headline: "Frame is 90% complete — roof trusses next week",
    body: "Wall frames and top plate are done. Roof trusses are delivered and set, ready to install Monday.",
    builder_reasoning: "We used a vapour-permeable sarking rather than standard foil — it lets the wall assembly breathe while still blocking air infiltration, which matters for long-term weather-tightness in the Adelaide climate.",
    author_name: "Sam", published: true, status: "published", published_at: new Date().toISOString(),
  });

  // Selection + options + action
  const { data: sel } = await sb.from("client_selections").insert({
    project_id: pid, category: "Kitchen", item_name: "Splashback Tile", room_area: "Kitchen",
    due_date: "2026-07-04", lead_time_weeks: 6, order_by_date: "2026-07-02", allowance_amount: 850, status: "awaiting_client", sort_order: 0,
    internal_notes: "supplier margin — do not show client",
  }).select("id").single();
  await sb.from("selection_options").insert([
    { selection_id: sel.id, label: "Option A", product_name: "Subway White Gloss", supplier: "Tile Republic", price_inc_gst: 640, lead_time_weeks: 4, is_recommended: true, sort_order: 0, internal_notes: "cost 410" },
    { selection_id: sel.id, label: "Option B", product_name: "Terracotta Handmade", supplier: "Artisan Tiles", price_inc_gst: 1240, lead_time_weeks: 8, sort_order: 1, internal_notes: "cost 820" },
  ]);
  await sb.from("client_actions").insert({ project_id: pid, action_type: "selection_decision", title: "Select Splashback Tile", description: "Kitchen — allowance $850, 2 options", related_entity_type: "client_selection", related_entity_id: sel.id, due_date: "2026-07-04", status: "pending" });

  // Variation decision + action
  const { data: dec } = await sb.from("portal_decisions").insert({
    project_id: pid, type: "variation", title: "Additional downlights, living room", status: "pending",
    description: "Additional 6 × LED downlights, wiring, and a dimmer switch in the living and dining area.",
    builder_reasoning: "Raising this now ensures the wiring is run before the ceiling is lined — doing it after lining is significantly more expensive and disruptive.",
    cost_delta: 1672, schedule_delta: 0,
  }).select("id").single();
  await sb.from("client_actions").insert({ project_id: pid, action_type: "variation_approval", title: "Approve Variation #4", description: "Additional downlights", related_entity_type: "portal_decision", related_entity_id: dec.id, status: "pending" });

  // Meeting + action
  const { data: mtg } = await sb.from("portal_meetings").insert({
    project_id: pid, title: "Site Meeting", meeting_type: "site", status: "scheduled", client_visible: true,
    scheduled_at: "2026-06-26T09:00:00+09:30", location: "On site", agenda: "Frame inspection, roof schedule, splashback decision",
  }).select("id").single();
  await sb.from("client_actions").insert({ project_id: pid, action_type: "meeting_confirmation", title: "Confirm Site Meeting", description: "Thursday 9:00am", related_entity_type: "portal_meeting", related_entity_id: mtg.id, due_date: "2026-06-26", status: "pending" });

  // A claim (with payment instructions) + a document
  await sb.from("portal_claims").insert({ project_id: pid, stage_name: "Frame & Roof", amount: 48400, status: "invoiced", due_approx: "30 Jun 2026", payment_instructions: "Account name: Blue Leaf Building Pty Ltd\nBSB: 065 000\nAccount: 1234 5678\nReference: Claim #4 — 21 Folkstone Rd", sort_order: 0 });
  await sb.from("portal_documents").insert({ project_id: pid, folder: "contract", title: "Building Contract.pdf", client_visible: true, storage_provider: "dropbox", storage_path: "/demo/contract" });

  // Client login — REUSE the auth user if the email already exists. Supabase auth
  // deletes can be blocked by FKs from prior portal data, leaving an orphan account;
  // reusing it (and resetting the password) is robust and avoids the duplicate-email error.
  let userId = null;
  const { data: created } = await sb.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  if (created?.user) {
    userId = created.user.id;
  } else {
    for (let page = 1; page <= 25 && !userId; page++) {
      const { data } = await sb.auth.admin.listUsers({ page, perPage: 200 });
      const existing = (data?.users || []).find((x) => x.email === EMAIL);
      if (existing) {
        userId = existing.id;
        await sb.auth.admin.updateUserById(userId, { password: PASSWORD, email_confirm: true });
      }
      if (!data?.users?.length || data.users.length < 200) break;
    }
    if (!userId) throw new Error("create user: could not create or find the auth account for " + EMAIL);
  }
  await sb.from("user_profiles").upsert({ id: userId, email: EMAIL, full_name: "David Sutton (test client)", role: "client", is_active: true });
  await sb.from("project_client_users").upsert(
    { project_id: pid, user_id: userId, role: "primary", is_active: true, invite_accepted_at: new Date().toISOString() },
    { onConflict: "project_id,user_id" }
  );

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Client Portal v2 demo is ready to walk                       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`  1. Run:    npm run dev`);
  console.log(`  2. Open:   http://localhost:5173/login`);
  console.log(`  3. Log in as the TEST CLIENT (use a different browser / incognito`);
  console.log(`             if you're already logged in as staff):`);
  console.log(`               email:    ${EMAIL}`);
  console.log(`               password: ${PASSWORD}`);
  console.log(`     → you'll land in the client portal (/client-portal).`);
  console.log(`  Project: "${ADDR}"  (id ${pid})`);
  console.log(`  Walk: Home → My Actions (approve the variation, choose a tile,`);
  console.log(`        confirm the meeting) → Project Journey → Selections →`);
  console.log(`        Documents → Messages (send one).`);
  console.log(`\n  When done:  node scripts/test_client_setup.mjs --cleanup`);
  console.log(`  (Approving/selecting writes immutable audit rows, so cleanup may`);
  console.log(`   leave the project as a disabled stub — that's the audit trigger working.)\n`);
}

(async () => {
  try {
    if (CLEANUP) await teardown();
    else await setup();
  } catch (e) { console.error("ERROR:", e.message); process.exit(1); }
})();
