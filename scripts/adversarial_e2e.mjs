/**
 * Adversarial live E2E — Client Portal v2.0.
 * Creates throwaway test clients + projects, attacks the live API and PostgREST
 * directly as those clients, asserts the security model, then self-cleans.
 *
 * Avoids any action that writes portal_audit_logs (append-only via mig 105's
 * trigger → undeletable), so cleanup is complete. Run: node scripts/adversarial_e2e.mjs
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config();
const URL = process.env.SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const API = "http://localhost:8787";
if (!URL || !SVC || !ANON) { console.error("Missing SUPABASE_URL / SERVICE_ROLE / VITE_SUPABASE_ANON_KEY"); process.exit(2); }

const svc = createClient(URL, SVC, { auth: { persistSession: false } });
const ts = Date.now();
const MARK = `__E2E_${ts}`;

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; fails.push(`${name}${detail ? " — " + detail : ""}`); console.log(`  ✗ ${name}${detail ? " — " + detail : ""}`); }
}
function section(t) { console.log(`\n── ${t} ──`); }

async function api(path, token, method = "GET", body) {
  const r = await fetch(API + path, {
    method,
    headers: { ...(token ? { Authorization: "Bearer " + token } : {}), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null; try { j = await r.json(); } catch { /* non-json */ }
  return { status: r.status, body: j };
}
async function rest(table, qs, token) {
  const r = await fetch(`${URL}/rest/v1/${table}?${qs}`, { headers: { apikey: ANON, Authorization: "Bearer " + token } });
  let j = null; try { j = await r.json(); } catch { /* */ }
  return { status: r.status, body: j };
}
function leakScan(obj, forbidden) {
  const s = JSON.stringify(obj || {});
  return forbidden.filter((k) => s.includes(k));
}

const created = { users: [], projects: [] };

async function mkProject(suffix) {
  const { data, error } = await svc.from("projects")
    .insert({ address: `${MARK}_${suffix}`, portal_enabled: true, portal_v2_enabled: true, build_phase: "on_site", contract_value: 1_000_000 })
    .select("id").single();
  if (error) throw new Error("mkProject: " + error.message);
  created.projects.push(data.id);
  return data.id;
}
async function mkUser(label, role, projectId) {
  const email = `portal-e2e-${label}-${ts}@example.test`;
  const password = "Te5t!" + Math.random().toString(36).slice(2) + "Aa9";
  const { data: u, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error("createUser " + label + ": " + error.message);
  created.users.push(u.user.id);
  await svc.from("user_profiles").insert({ id: u.user.id, email, full_name: `E2E ${label}`, role, is_active: true });
  if (projectId) await svc.from("project_client_users").insert({ project_id: projectId, user_id: u.user.id, role: "primary", is_active: true });
  const anonC = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: s, error: se } = await anonC.auth.signInWithPassword({ email, password });
  if (se) throw new Error("signIn " + label + ": " + se.message);
  return { id: u.user.id, email, token: s.session.access_token };
}

async function run() {
  section("Setup (test projects + clients)");
  const pA = await mkProject("A");
  const pB = await mkProject("B");
  const A = await mkUser("a", "client", pA);
  const B = await mkUser("b", "client", pB);
  const staff = await mkUser("s", "employee", null);
  check("created 2 projects + 2 clients + 1 staff", created.projects.length === 2 && created.users.length === 3);

  // Seed read-only data on A (no audit writes), and a secret doc on B for IDOR.
  await svc.from("client_actions").insert({ project_id: pA, action_type: "variation_approval", title: "Approve Variation #1", related_entity_type: "portal_decision", related_entity_id: pA, status: "pending" });
  await svc.from("portal_milestones").insert({ project_id: pA, key: "frame", label: "Frame & Roof", is_current: true, confidence: "on_track", sort_order: 2 });
  const sel = (await svc.from("client_selections").insert({ project_id: pA, category: "Kitchen", item_name: "Splashback", status: "awaiting_client", internal_notes: "SECRET_MARGIN_NOTE", allowance_amount: 850 }).select("id").single()).data;
  await svc.from("selection_options").insert({ selection_id: sel.id, label: "Option A", product_name: "Subway White", price_inc_gst: 640, internal_notes: "SECRET_SUPPLIER_COST" });
  const bDoc = (await svc.from("portal_documents").insert({ project_id: pB, folder: "contract", title: "B Confidential Contract", client_visible: true, storage_provider: "dropbox", storage_path: "/secret/b" }).select("id").single()).data;

  section("1. Project isolation (requirePortalAuth)");
  check("A reads own /home (200)", (await api(`/api/portal/app/${pA}/home`, A.token)).status === 200);
  check("A BLOCKED from B /home (403)", (await api(`/api/portal/app/${pB}/home`, A.token)).status === 403);
  check("B BLOCKED from A /home (403)", (await api(`/api/portal/app/${pA}/home`, B.token)).status === 403);
  check("no-token /home (401)", (await api(`/api/portal/app/${pA}/home`)).status === 401);
  check("forged token /home (401)", (await api(`/api/portal/app/${pA}/home`, "garbage.jwt.x")).status === 401);
  const mp = await api("/api/portal/my-projects", A.token);
  check("my-projects returns ONLY A's project", mp.body?.projects?.length === 1 && mp.body.projects[0].projectId === pA, JSON.stringify(mp.body?.projects?.map((p) => p.projectId)));

  section("2. RLS — direct PostgREST with the client JWT + bundled anon key (migration 104)");
  const jobsC = await rest("jobs", "select=id&limit=5", A.token);
  check("client CANNOT read jobs via PostgREST", Array.isArray(jobsC.body) && jobsC.body.length === 0, `got ${JSON.stringify(jobsC.body).slice(0, 140)}`);
  const projC = await rest("projects", "select=id&limit=5", A.token);
  check("client CANNOT enumerate projects via PostgREST", Array.isArray(projC.body) && projC.body.length === 0, `got ${JSON.stringify(projC.body).slice(0, 140)}`);
  const crmC = await rest("crm_contacts", "select=id&limit=5", A.token);
  check("client CANNOT read crm_contacts (PII)", Array.isArray(crmC.body) && crmC.body.length === 0, `got ${JSON.stringify(crmC.body).slice(0, 140)}`);
  const jvC = await rest("job_variations", "select=id,cost_to_builder&limit=5", A.token);
  check("client CANNOT read job_variations (cost_to_builder)", Array.isArray(jvC.body) && jvC.body.length === 0, `got ${JSON.stringify(jvC.body).slice(0, 140)}`);
  const upC = await rest("user_profiles", "select=id,role", A.token);
  check("client reads ONLY their own user_profiles row", Array.isArray(upC.body) && upC.body.length === 1 && upC.body[0].id === A.id, `got ${JSON.stringify(upC.body).slice(0, 140)}`);
  const jobsS = await rest("jobs", "select=id&limit=1", staff.token);
  check("staff CAN still read jobs (104 didn't lock out staff)", Array.isArray(jobsS.body), `got ${JSON.stringify(jobsS.body).slice(0, 140)}`);

  section("3. Staff endpoints reject the client JWT (requireAuth rejects role:client)");
  check("client BLOCKED on /api/crm/contacts", [401, 403].includes((await api("/api/crm/contacts", A.token)).status));
  check("client BLOCKED on /api/finance/jobs", [401, 403].includes((await api("/api/finance/jobs", A.token)).status));
  check("client BLOCKED on admin v2 overview (403)", (await api(`/api/portal/admin/v2/${pA}/overview`, A.token)).status === 403);
  check("client BLOCKED on admin v2 expose-document (403)", (await api(`/api/portal/admin/v2/${pA}/expose-document`, A.token, "POST", { jobDocumentId: "x", folder: "contract" })).status === 403);

  section("4. No builder cost / margin / internal-notes leakage to the client");
  const home = await api(`/api/portal/app/${pA}/home`, A.token);
  const FORBIDDEN = ["cost_to_builder", "costToBuilder", "amount_ex_gst", "amountExGst", "cost_delta", "costDelta", "internal_notes", "internalNotes", "SECRET_MARGIN_NOTE", "SECRET_SUPPLIER_COST"];
  check("/home has no cost/margin/internal leakage", leakScan(home.body, FORBIDDEN).length === 0, "leaked: " + leakScan(home.body, FORBIDDEN).join(","));
  const sels = await api(`/api/portal/app/${pA}/selections`, A.token);
  check("/selections hides internal_notes + supplier cost", leakScan(sels.body, FORBIDDEN).length === 0, "leaked: " + leakScan(sels.body, FORBIDDEN).join(","));
  const acts = await api(`/api/portal/app/${pA}/actions`, A.token);
  check("/actions has no cost leakage", leakScan(acts.body, FORBIDDEN).length === 0, "leaked: " + leakScan(acts.body, FORBIDDEN).join(","));

  section("5. IDOR — cross-project document / media");
  check("A CANNOT download B's document (404)", (await api(`/api/portal/app/${pA}/documents/${bDoc.id}/download`, A.token)).status === 404);
  check("A CANNOT download via B's project path with A's token (403)", (await api(`/api/portal/app/${pB}/documents/${bDoc.id}/download`, A.token)).status === 403);
  check("A media route for foreign photo id (404/401)", [401, 404].includes((await api(`/api/portal/app/${pA}/media/00000000-0000-0000-0000-000000000000?t=${A.token}`, A.token)).status));

  section("6. Cross-project contractual writes rejected (no audit written)");
  check("A CANNOT respond to a B variation (403)", (await api(`/api/portal/app/${pB}/variations/00000000-0000-0000-0000-000000000000/respond`, A.token, "POST", { action: "approve" })).status === 403);
  check("A CANNOT payment-notify on B (403)", (await api(`/api/portal/app/${pB}/claims/00000000-0000-0000-0000-000000000000/payment-notify`, A.token, "POST", {})).status === 403);

  section("7. Functional read surface works for the owner");
  check("A /actions returns the seeded action", Array.isArray(acts.body?.open) && acts.body.open.length >= 1);
  check("A /selections returns the seeded selection (options present, no internal)", (sels.body?.selections?.[0]?.options?.length || 0) >= 1);
  check("A /journey returns the current stage", (await api(`/api/portal/app/${pA}/journey`, A.token)).body?.stages?.some((s) => s.isCurrent));
  check("A /documents loads", (await api(`/api/portal/app/${pA}/documents`, A.token)).status === 200);
}

async function cleanup() {
  section("Cleanup");
  for (const pid of created.projects) {
    for (const t of ["selection_options"]) {
      // options key on selection_id, deleted via cascade when client_selections go; explicit for safety
      await svc.from("selection_options").delete().eq("selection_id", "00000000-0000-0000-0000-000000000000").then(() => {}).catch(() => {});
    }
    for (const t of ["client_actions", "portal_milestones", "client_selections", "portal_documents", "portal_meetings", "portal_messages", "portal_notifications", "portal_claims", "portal_decisions", "project_client_users"]) {
      await svc.from(t).delete().eq("project_id", pid).then(() => {}).catch(() => {});
    }
  }
  let projDeleted = 0, projDisabled = 0;
  for (const pid of created.projects) {
    const { error } = await svc.from("projects").delete().eq("id", pid);
    if (error) { // likely an immutable audit row (by design) — anonymize + disable instead
      await svc.from("projects").update({ address: `${MARK}_DELETED`, portal_enabled: false, portal_v2_enabled: false }).eq("id", pid);
      projDisabled++;
    } else projDeleted++;
  }
  let usersDeleted = 0;
  for (const uid of created.users) {
    await svc.from("user_profiles").delete().eq("id", uid).then(() => {}).catch(() => {});
    const { error } = await svc.auth.admin.deleteUser(uid);
    if (!error) usersDeleted++;
  }
  // Safety net: nuke any stray rows still bearing the marker.
  await svc.from("projects").delete().like("address", `${MARK}%`).then(() => {}).catch(() => {});
  console.log(`  projects: ${projDeleted} deleted, ${projDisabled} disabled (immutable-audit); users: ${usersDeleted}/${created.users.length} deleted`);
}

(async () => {
  try { await run(); }
  catch (e) { console.error("\nRUN ERROR:", e.message); fail++; fails.push("RUN ERROR: " + e.message); }
  finally {
    try { await cleanup(); } catch (e) { console.error("CLEANUP ERROR:", e.message); }
  }
  console.log(`\n╔══ Results ══╗`);
  console.log(`  ${pass} passed  ${fail} failed`);
  if (fails.length) { console.log("\n  Failures:"); fails.forEach((f) => console.log("   ✗ " + f)); }
  console.log("");
  process.exit(fail > 0 ? 1 : 0);
})();
