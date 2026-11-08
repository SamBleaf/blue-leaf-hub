/**
 * register-handover-status.test.mjs — R04 Slice 6 (HAND-FIX) regression (loopback sandbox only).
 *
 * The ONE server-grounded handover status must keep the five states DISTINCT and never interchangeable:
 * signed contract vs recorded baseline vs project operational status vs Ops-Ready handover vs the portal
 * lifecycle (configured → v2 → client-linked → invited → onboarded), plus a single correct next-action.
 * Verifies Margaret Lowe's fixture + a synthetic project progressing signed → baselined → ops-ready →
 * invited → onboarded (via direct canonical-record manipulation — no new status store).
 *
 * Run: node scripts/tests/register-handover-status.test.mjs
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const API = "http://localhost:8797", GW = "http://localhost:54321";
for (const u of [API, GW]) if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(u)) { console.error("loopback only"); process.exit(2); }
const SB = join(homedir(), ".blh-register-sandbox");
const secrets = JSON.parse(readFileSync(join(SB, "secrets.json"), "utf8"));
const handoff = JSON.parse(readFileSync(join(SB, "staging-handoff.json"), "utf8"));
const svc = createClient(GW, secrets.service_key, { auth: { persistSession: false } });
const anon = () => createClient(GW, secrets.anon_key, { auth: { persistSession: false } });
const LOWE = handoff.projects.find((p) => p.label.includes("P3")).leadId;
const MARK = `HS-TEST-${Date.now()}`;

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? `\n      ${d}` : ""}`); } };
async function signIn(c) { const { data, error } = await anon().auth.signInWithPassword({ email: c.email, password: c.password }); if (error) throw new Error(error.message); return data.session.access_token; }
async function status(tok, lead) { const r = await fetch(`${API}/api/register/leads/${lead}/handover-status`, { headers: { authorization: `Bearer ${tok}` } }); const b = await r.json(); return b.status; }

async function main() {
  const staff = await signIn(handoff.staff_login);

  // ── Lowe fixture: contract signed, baseline recorded, live project, client onboarded ──────────────
  const low = await status(staff, LOWE);
  ok("Lowe: contract signed", low?.contract.signed === true);
  ok("Lowe: contract baseline recorded (distinct from contract)", low?.baseline.recorded === true && !!low.baseline.revision);
  ok("Lowe: project is live (Operations)", low?.project.status === "live");
  ok("Lowe: portal configured + v2 + client linked", low?.portal.configured && low.portal.v2Enabled && low.portal.clientLinked);
  ok("Lowe: portal invited + onboarded are present as their own states", "invited" in low.portal && "onboarded" in low.portal);

  // ── Synthetic progression ─────────────────────────────────────────────────────────────────────────
  const { data: lead } = await svc.from("leads").insert({ first_name: "Handover", last_name: "Test", name: `${MARK}`, email: `${MARK}@staging.invalid`, site_address: "9 Handover St, Prospect SA 5082", project_type: "renovation", stage: "won", lead_source: "internal_test", lead_source_category: "other", archived: true, ops_ready_checklist: {} }).select("id").single();
  const L = lead.id;

  let s = await status(staff, L);
  ok("no job/project → project.status='none' + next action = create project", s?.project.status === "none" && /project record/i.test(s?.nextAction?.label || ""), JSON.stringify(s?.nextAction));

  const { data: job } = await svc.from("jobs").insert({ address: "9 Handover St, Prospect SA 5082", client_name: "Handover Test", project_type: "renovation", lead_id: L, status: "won" }).select("id").single();
  await svc.from("leads").update({ job_id: job.id }).eq("id", L);
  // a won job fires trigger 096 → a live project is auto-created; reuse it (else create one), then set flags.
  let { data: proj } = await svc.from("projects").select("id").eq("job_id", job.id).maybeSingle();
  if (!proj) ({ data: proj } = await svc.from("projects").insert({ job_id: job.id, address: "9 Handover St, Prospect SA 5082", status: "active", is_preconstruction: false, build_phase: "construction", portal_v2_enabled: true }).select("id").single());
  await svc.from("projects").update({ is_preconstruction: false, portal_v2_enabled: true }).eq("id", proj.id);

  s = await status(staff, L);
  ok("project live, contract NOT signed → next = record signed contract", s?.project.status === "live" && s.contract.signed === false && /signed building contract/i.test(s.nextAction?.label || ""), JSON.stringify(s?.nextAction));
  ok("Ops handover applicable (won) and not ready; job_created auto-done", s?.opsHandover.applicable === true && s.opsHandover.ready === false && s.opsHandover.done >= 1);

  await svc.from("leads").update({ contract_status: "signed" }).eq("id", L);
  s = await status(staff, L);
  ok("contract signed → baseline still not recorded → next = record baseline", s?.contract.signed === true && s.baseline.recorded === false && /baseline/i.test(s.nextAction?.label || ""), JSON.stringify(s?.nextAction));
  ok("signed contract bumped the Ops auto 'contract_signed' item", s?.opsHandover.done >= 2);

  await svc.from("lead_documents").insert({ lead_id: L, document_type: "register_baseline", status: "current", version: 1, revision_label: "B01", issued_at: new Date().toISOString(), issued_by_name: "Test", source_snapshot: { itemVersions: {} }, filename: "baseline-B01.json", storage_path: `test/${MARK}/baseline-B01.json` });
  s = await status(staff, L);
  ok("baseline recorded (distinct) → next = finish Ops-Ready handoff", s?.baseline.recorded === true && /ops-ready|handoff/i.test(s.nextAction?.label || ""), JSON.stringify(s?.nextAction));

  const allTicked = { proposal_uploaded: true, final_docs: true, selections_transfer: true, value_to_finance: true, start_to_scheduler: true, details_confirmed: true };
  await svc.from("leads").update({ ops_ready_checklist: allTicked, won_substatus: "ops_ready" }).eq("id", L);
  s = await status(staff, L);
  ok("Ops Ready (distinct from signed/baselined) → next = invite client (deliberate)", s?.opsHandover.ready === true && /invite the client/i.test(s.nextAction?.label || ""), JSON.stringify(s?.nextAction));
  ok("portal: still NOT invited / NOT onboarded (no auto-invite)", s?.portal.invited === false && s.portal.onboarded === false);

  const { data: loweLink } = await svc.from("project_client_users").select("user_id").eq("project_id", "f4de74e9-26ce-4ae4-b45e-3991d3e36256").limit(1).maybeSingle();
  const clientId = loweLink?.user_id;
  await svc.from("projects").update({ portal_client_email: "client.sandbox@blueleaf.test" }).eq("id", proj.id);
  await svc.from("project_client_users").insert({ project_id: proj.id, user_id: clientId, role: "primary", is_active: true, invited_at: new Date().toISOString() });
  s = await status(staff, L);
  ok("invited (but not onboarded) → next = client to accept", s?.portal.invited === true && s.portal.onboarded === false && s.nextAction?.owner === "Client", JSON.stringify(s?.nextAction));

  await svc.from("project_client_users").update({ invite_accepted_at: new Date().toISOString() }).eq("project_id", proj.id).eq("user_id", clientId);
  s = await status(staff, L);
  ok("onboarded → no outstanding next action (fully handed over)", s?.portal.onboarded === true && !s.nextAction, JSON.stringify(s?.nextAction));

  // ── cleanup ─────────────────────────────────────────────────────────────────────────────────────
  await svc.from("project_client_users").delete().eq("project_id", proj.id);
  await svc.from("lead_documents").delete().eq("lead_id", L);
  await svc.from("client_selections").delete().eq("project_id", proj.id);
  await svc.from("room_scope_items").delete().eq("project_id", proj.id);
  await svc.from("projects").delete().eq("id", proj.id);
  await svc.from("jobs").delete().eq("id", job.id);
  await svc.from("leads").delete().eq("id", L);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
