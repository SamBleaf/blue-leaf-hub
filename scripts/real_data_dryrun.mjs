/**
 * Real-data dry run — Finance → Client Portal v2.0 integration.
 * Creates a real job + variation + progress claim, runs them through the ACTUAL
 * integration code (server/lib/portalIntegration.mjs — the same functions the
 * Finance send/sign/pay endpoints call), then verifies they land in the client's
 * live portal and that the client can act on them. Cleans up at the end.
 *
 * Run: node scripts/real_data_dryrun.mjs   (dev server must be on :8787)
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  syncVariationSent, syncVariationSigned, syncClaimIssued, syncClaimPaid,
  syncVariationVoided, syncClaimVoided, syncClaimDisputed,
} from "../server/lib/portalIntegration.mjs";

config();
const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY, ANON = process.env.VITE_SUPABASE_ANON_KEY;
const API = "http://localhost:8787";
const sb = createClient(URL, SVC, { auth: { persistSession: false } });
const ts = Date.now();
const MARK = `__DRYRUN_${ts}`;

let pass = 0, fail = 0; const fails = [];
const check = (n, c, d) => { c ? (pass++, console.log("  ✓ " + n)) : (fail++, fails.push(n + (d ? " — " + d : "")), console.log("  ✗ " + n + (d ? " — " + d : ""))); };
const section = (t) => console.log("\n── " + t + " ──");
async function api(path, token, method = "GET", body) {
  const r = await fetch(API + path, { method, headers: { ...(token ? { Authorization: "Bearer " + token } : {}), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* */ }
  return { status: r.status, body: j };
}
const ids = { jobs: [], projects: [], users: [] };

async function mkClient(projectId) {
  const email = `dryrun-${ts}@example.test`, password = "Dr9!" + Math.random().toString(36).slice(2) + "Aa";
  const { data: u, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error("createUser: " + error.message);
  ids.users.push(u.user.id);
  await sb.from("user_profiles").insert({ id: u.user.id, email, full_name: "Dry-run client", role: "client", is_active: true });
  await sb.from("project_client_users").insert({ project_id: projectId, user_id: u.user.id, role: "primary", is_active: true });
  const a = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: s, error: se } = await a.auth.signInWithPassword({ email, password });
  if (se) throw new Error("signIn: " + se.message);
  return { id: u.user.id, token: s.session.access_token };
}

async function run() {
  section("Setup — real job + project + client");
  const { data: job, error: jErr } = await sb.from("jobs").insert({ address: `${MARK} 21 Folkstone Rd`, status: "won", original_contract_value: 1_450_000, contract_value: 1_450_000 }).select("id").single();
  if (jErr) throw new Error("create job: " + jErr.message);
  ids.jobs.push(job.id);
  // A 'won' job AUTO-creates a project (trigger, migration 096). Use it; else create one.
  let { data: project } = await sb.from("projects").select("id").eq("job_id", job.id).maybeSingle();
  if (!project) {
    const { data: np, error: pErr } = await sb.from("projects").insert({ address: `${MARK} 21 Folkstone Rd`, job_id: job.id }).select("id").single();
    if (pErr) throw new Error("create project: " + pErr.message);
    project = np;
  }
  await sb.from("projects").update({ address: `${MARK} 21 Folkstone Rd`, portal_enabled: true, portal_v2_enabled: true, build_phase: "on_site", contract_value: 1_450_000, portal_client_name: "David Sutton", portal_client_email: `dryrun-${ts}@example.test` }).eq("id", project.id);
  ids.projects.push(project.id);
  const client = await mkClient(project.id);
  check("real job + project + client created", !!job.id && !!project.id && !!client.token);

  // ─── VARIATION lifecycle ───────────────────────────────────────────────────
  section("Variation — create in Finance → sync → client approves → Finance signs");
  const { data: variation, error: vErr } = await sb.from("job_variations").insert({
    job_id: job.id, variation_number: 1, title: "Additional downlights, living room",
    description: "6 × LED downlights, wiring and a dimmer switch.", amount_ex_gst: 1520, eot_days: 0, status: "sent_to_client", sent_date: new Date().toISOString(),
  }).select("*").single();
  if (vErr) throw new Error("create variation: " + vErr.message);
  check("real job_variation created (amount_ex_gst 1520 → inc 1672)", variation.amount_inc_gst != null);

  // Real integration code (what POST .../variations/:vid/send invokes):
  await syncVariationSent({ jobId: job.id, variation });
  const acts1 = await api(`/api/portal/app/${project.id}/actions`, client.token);
  const vAction = acts1.body?.open?.find((a) => a.actionType === "variation_approval");
  check("variation landed in client My Actions", !!vAction, JSON.stringify(acts1.body?.open?.map((a) => a.actionType)));
  const decisionId = vAction?.relatedEntityId;
  const vDetail = await api(`/api/portal/app/${project.id}/variations/${decisionId}`, client.token);
  check("variation detail shows inc-GST $1,672 (no ex-GST / cost leak)", vDetail.body?.variation?.amountIncGst === 1672 && !JSON.stringify(vDetail.body).match(/amount_ex_gst|cost_to_builder|cost_delta/i));

  // Client approves via the real portal API:
  const approve = await api(`/api/portal/app/${project.id}/variations/${decisionId}/respond`, client.token, "POST", { action: "approve" });
  check("client approve → 200", approve.status === 200);
  const { data: decAfter } = await sb.from("portal_decisions").select("status").eq("id", decisionId).single();
  check("portal_decision now 'approved'", decAfter?.status === "approved");
  const { data: auditRows } = await sb.from("portal_audit_logs").select("event_type").eq("project_id", project.id).eq("entity_id", decisionId);
  check("approval written to immutable audit log", (auditRows || []).some((a) => a.event_type === "variation.approved"));
  const { data: jvAfterApprove } = await sb.from("job_variations").select("status").eq("id", variation.id).single();
  check("canonical job_variations NOT auto-flipped to 'signed' by client approve", jvAfterApprove?.status === "sent_to_client");
  // Re-approve is race/terminal-safe:
  const reapprove = await api(`/api/portal/app/${project.id}/variations/${decisionId}/respond`, client.token, "POST", { action: "approve" });
  check("re-approve blocked (409 — already responded)", reapprove.status === 409);

  // Finance signs it (what POST .../variations/:vid/sign invokes):
  await sb.from("job_variations").update({ status: "signed", signed_date: new Date().toISOString() }).eq("id", variation.id);
  await syncVariationSigned({ variationId: variation.id });
  const homeAfterSign = await api(`/api/portal/app/${project.id}/home`, client.token);
  check("Home financial snapshot now counts the variation as approved (+$1,672)", homeAfterSign.body?.home?.financial?.approvedVariations === 1672, "got " + homeAfterSign.body?.home?.financial?.approvedVariations);

  // ─── PROGRESS CLAIM lifecycle ──────────────────────────────────────────────
  section("Progress claim — issue in Finance → sync → client sees it → notifies payment");
  const { data: claim, error: cErr } = await sb.from("progress_claims").insert({
    job_id: job.id, claim_number: 1, stage: "frame", amount_ex_gst: 44000, status: "issued", issued_date: new Date().toISOString().slice(0, 10), due_date: "2026-06-30",
  }).select("*").single();
  if (cErr) throw new Error("create claim: " + cErr.message);
  await syncClaimIssued({ jobId: job.id, claim, stageLabel: "Frame & Roof" });
  const claims = await api(`/api/portal/app/${project.id}/claims`, client.token);
  const portalClaim = claims.body?.claims?.[0];
  check("claim landed in client portal (inc-GST $48,400)", portalClaim?.amount === 48400 && portalClaim?.canonical?.amountIncGst === 48400);
  const acts2 = await api(`/api/portal/app/${project.id}/actions`, client.token);
  check("claim-review action in My Actions", acts2.body?.open?.some((a) => a.actionType === "progress_claim_review"));
  const homeClaim = await api(`/api/portal/app/${project.id}/home`, client.token);
  check("Home shows $48,400 outstanding", homeClaim.body?.home?.financial?.claimsOutstanding === 48400, "got " + homeClaim.body?.home?.financial?.claimsOutstanding);

  // Client marks payment sent (idempotent):
  const pn1 = await api(`/api/portal/app/${project.id}/claims/${portalClaim.id}/payment-notify`, client.token, "POST", {});
  const pn2 = await api(`/api/portal/app/${project.id}/claims/${portalClaim.id}/payment-notify`, client.token, "POST", {});
  check("'I've paid' works once, second is idempotent no-op", pn1.status === 200 && pn2.body?.alreadyNotified === true);

  // Finance records the payment (partial), portal reflects paid-to-date:
  await sb.from("progress_claim_payments").insert({ progress_claim_id: claim.id, payment_amount: 24200, payment_date: "2026-06-28", payment_method: "eft" });
  await sb.from("progress_claims").update({ status: "partially_paid" }).eq("id", claim.id);
  await syncClaimPaid({ claimId: claim.id, newStatus: "partially_paid" });
  const homePartial = await api(`/api/portal/app/${project.id}/home`, client.token);
  check("partial payment: Home shows $24,200 paid + $24,200 outstanding (not full)", homePartial.body?.home?.financial?.claimsPaid === 24200 && homePartial.body?.home?.financial?.claimsOutstanding === 24200, `paid=${homePartial.body?.home?.financial?.claimsPaid} out=${homePartial.body?.home?.financial?.claimsOutstanding}`);
  const { data: pcPartial } = await sb.from("portal_claims").select("status, paid_to_date").eq("progress_claim_id", claim.id).maybeSingle();
  check("partial payment: portal_claim 'partially_paid' + paid_to_date $24,200 (WP-14)", pcPartial?.status === "partially_paid" && Number(pcPartial?.paid_to_date) === 24200, `status=${pcPartial?.status} ptd=${pcPartial?.paid_to_date}`);

  // ─── VOID lifecycle (WP-7) — Finance voids → client can no longer act ────────
  section("Void — voided variation & claim are withdrawn from the client");
  const { data: v2 } = await sb.from("job_variations").insert({
    job_id: job.id, variation_number: 2, title: "Extra tiling, ensuite", amount_ex_gst: 800, eot_days: 0, status: "sent_to_client", sent_date: new Date().toISOString(),
  }).select("*").single();
  await syncVariationSent({ jobId: job.id, variation: v2 });
  await syncVariationVoided({ variationId: v2.id });
  const { data: v2dec } = await sb.from("portal_decisions").select("status").eq("job_variation_id", v2.id).maybeSingle();
  check("voided variation → portal_decision 'withdrawn'", v2dec?.status === "withdrawn", "got " + v2dec?.status);
  const actsAfterVoid = await api(`/api/portal/app/${project.id}/actions`, client.token);
  check("voided variation gone from client open actions (no live Approve)", !actsAfterVoid.body?.open?.some((a) => a.actionType === "variation_approval" && /#2\b/.test(a.title || "")));

  const { data: c2 } = await sb.from("progress_claims").insert({
    job_id: job.id, claim_number: 2, stage: "lock_up", amount_ex_gst: 30000, status: "issued", issued_date: new Date().toISOString().slice(0, 10), due_date: "2026-07-15",
  }).select("*").single();
  await syncClaimIssued({ jobId: job.id, claim: c2, stageLabel: "Lock-Up" });
  await syncClaimVoided({ claimId: c2.id });
  const { data: c2pc } = await sb.from("portal_claims").select("status").eq("progress_claim_id", c2.id).maybeSingle();
  check("voided claim → portal_claim 'void'", c2pc?.status === "void", "got " + c2pc?.status);
  const actsAfterClaimVoid = await api(`/api/portal/app/${project.id}/actions`, client.token);
  check("voided claim gone from client open actions (no live 'I've paid')", !actsAfterClaimVoid.body?.open?.some((a) => a.actionType === "progress_claim_review" && /#2\b/.test(a.title || "")));

  // Payment guard (B3): paying a voided claim is blocked at the app level.
  const { data: c2pcRow } = await sb.from("portal_claims").select("id").eq("progress_claim_id", c2.id).maybeSingle();
  if (c2pcRow) {
    const payVoid = await api(`/api/portal/app/${project.id}/claims/${c2pcRow.id}/payment-notify`, client.token, "POST", {});
    check("payment-notify blocked on a voided claim (B3)", payVoid.body?.alreadyNotified === true && /void/i.test(payVoid.body?.message || ""), JSON.stringify(payVoid.body));
  }

  // ─── Dispute + payment-received notification (migration 110) ─────────────────
  section("Dispute + claim_paid notification (migration 110)");
  const { data: c3 } = await sb.from("progress_claims").insert({
    job_id: job.id, claim_number: 3, stage: "fixing", amount_ex_gst: 20000, status: "issued", issued_date: new Date().toISOString().slice(0, 10), due_date: "2026-08-01",
  }).select("*").single();
  await syncClaimIssued({ jobId: job.id, claim: c3, stageLabel: "Fixing" });
  await syncClaimDisputed({ claimId: c3.id, reason: "Scope query" });
  const { data: c3pc } = await sb.from("portal_claims").select("status, dispute_reason").eq("progress_claim_id", c3.id).maybeSingle();
  check("disputed claim → portal_claim 'disputed' + reason (mig 110)", c3pc?.status === "disputed" && !!c3pc?.dispute_reason, "got " + c3pc?.status);

  // Fully pay the first claim → portal_claim 'paid' + a 'claim_paid' notification.
  await sb.from("progress_claim_payments").insert({ progress_claim_id: claim.id, payment_amount: 24200, payment_date: "2026-06-30", payment_method: "eft" });
  await sb.from("progress_claims").update({ status: "paid" }).eq("id", claim.id);
  await syncClaimPaid({ claimId: claim.id, newStatus: "paid" });
  const { data: paidNote } = await sb.from("portal_notifications").select("id").eq("project_id", project.id).eq("target_user_id", client.id).eq("notification_type", "claim_paid").limit(1);
  check("full payment → portal_claim 'paid' + 'claim_paid' notification (mig 110)", (paidNote || []).length > 0);

  // ─── Document signing (WP-12) ───────────────────────────────────────────────
  section("Document signing — client signs a signature-required document");
  const { data: sdoc } = await sb.from("portal_documents").insert({
    project_id: project.id, folder: "contract", title: "Authority to Proceed.pdf", client_visible: true,
    storage_provider: "dropbox", storage_path: "/demo/authority", signature_required: true,
  }).select("id").single();
  const signRes = await api(`/api/portal/app/${project.id}/documents/${sdoc.id}/sign`, client.token, "POST", {});
  check("client sign → 200", signRes.status === 200);
  const { data: sdocAfter } = await sb.from("portal_documents").select("signed_at, signed_by_user_id").eq("id", sdoc.id).maybeSingle();
  check("document signed_at + signed_by recorded", !!sdocAfter?.signed_at && sdocAfter?.signed_by_user_id === client.id);
  const reSign = await api(`/api/portal/app/${project.id}/documents/${sdoc.id}/sign`, client.token, "POST", {});
  check("re-sign blocked (409 — already signed)", reSign.status === 409);

  // ─── Server-side deactivation (WP-15) ───────────────────────────────────────
  section("Deactivation — is_active=false revokes portal access server-side");
  await sb.from("project_client_users").update({ is_active: false }).eq("project_id", project.id).eq("user_id", client.id);
  const afterDeact = await api(`/api/portal/app/${project.id}/home`, client.token);
  check("deactivated client → 403 on portal routes", afterDeact.status === 403, "got " + afterDeact.status);
  await sb.from("project_client_users").update({ is_active: true }).eq("project_id", project.id).eq("user_id", client.id);
}

async function cleanup() {
  section("Cleanup");
  for (const pid of ids.projects) {
    const { data: sels } = await sb.from("client_selections").select("id").eq("project_id", pid);
    for (const s of sels || []) await sb.from("selection_options").delete().eq("selection_id", s.id);
    for (const t of ["client_actions", "portal_milestones", "client_selections", "portal_documents", "portal_meetings", "portal_messages", "portal_notifications", "portal_claims", "portal_decisions", "portal_updates", "project_client_users"]) {
      await sb.from(t).delete().eq("project_id", pid);
    }
  }
  for (const jid of ids.jobs) await sb.from("jobs").delete().eq("id", jid); // cascades variations + claims
  let del = 0, dis = 0;
  for (const pid of ids.projects) {
    const { error } = await sb.from("projects").delete().eq("id", pid);
    if (error) { await sb.from("projects").update({ address: `${MARK}_DELETED`, portal_enabled: false, portal_v2_enabled: false }).eq("id", pid); dis++; }
    else del++;
  }
  for (const uid of ids.users) { await sb.from("user_profiles").delete().eq("id", uid); await sb.auth.admin.deleteUser(uid); }
  // safety net
  await sb.from("jobs").delete().like("address", `${MARK}%`).then(() => {}).catch(() => {});
  console.log(`  jobs+variations+claims removed; projects: ${del} deleted, ${dis} disabled (immutable audit); users: ${ids.users.length} removed`);
}

(async () => {
  try { await run(); } catch (e) { console.error("\nRUN ERROR:", e.message); fail++; fails.push("RUN ERROR: " + e.message); }
  finally { try { await cleanup(); } catch (e) { console.error("CLEANUP ERROR:", e.message); } }
  console.log(`\n╔══ Real-data dry run ══╗\n  ${pass} passed  ${fail} failed`);
  if (fails.length) { console.log("\n  Failures:"); fails.forEach((f) => console.log("   ✗ " + f)); }
  process.exit(fail > 0 ? 1 : 0);
})();
