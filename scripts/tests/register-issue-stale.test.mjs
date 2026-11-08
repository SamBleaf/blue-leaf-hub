/**
 * register-issue-stale.test.mjs — R04 review §1 failure-injection regression (loopback sandbox only).
 *
 * Proves a controlled document can NEVER be issued from register data that changed since it was previewed —
 * the server-side half of "a failed/stale save cannot issue a stale document". The client half (DocumentsStep
 * guards preview/issue/pack on flushAll() returning true) has no component-test harness in this repo; this
 * test exercises the authoritative server guard the client relies on:
 *
 *   preview  → returns itemVersions V0 (the content fingerprint)
 *   edit     → an item's version bumps the register to V1 (simulates the state the client did NOT re-preview)
 *   issue(V0)→ 409 ISSUE_STALE, and NO new issued revision is recorded
 *   issue(V1)→ the staleness gate passes (any remaining block is an ordinary pre-issue check, never ISSUE_STALE)
 *
 * Run: node scripts/tests/register-issue-stale.test.mjs   (needs the sandbox API :8797 + gateway :54321)
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
const anon = () => createClient(GW, secrets.anon_key, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? `\n      ${d}` : ""}`); } };
async function signIn(c) { const { data, error } = await anon().auth.signInWithPassword({ email: c.email, password: c.password }); if (error) throw new Error(error.message); return data.session.access_token; }
async function api(tok, method, path, body) {
  const r = await fetch(API + path, { method, headers: { authorization: `Bearer ${tok}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let b = null; try { b = await r.json(); } catch { /* non-json */ }
  return { status: r.status, ok: r.ok, body: b };
}
const issuedCount = (docsBody, type) => (docsBody?.documents?.issued || []).filter((d) => !type || d.document_type === type).length;

async function main() {
  const staff = await signIn(handoff.staff_login);

  // Find a staging lead whose register has at least one editable item (any of the three seeded projects).
  let leadId = null, reg = null;
  for (const p of handoff.projects) {
    const r = await api(staff, "GET", `/api/register/leads/${p.leadId}`);
    if (r.ok && (r.body?.register?.items || []).some((i) => i.id)) { leadId = p.leadId; reg = r.body.register; break; }
  }
  if (!leadId) { console.error("no staging lead with register items found — is the sandbox seeded?"); process.exit(2); }
  const DOC = "client_brief";

  // 1) PREVIEW → fingerprint V0
  const pv0 = await api(staff, "POST", `/api/register/leads/${leadId}/documents/${DOC}/preview`, { recipientName: "Stale Test Recipient" });
  ok("preview returns an itemVersions fingerprint", pv0.ok && pv0.body?.itemVersions && typeof pv0.body.itemVersions === "object", JSON.stringify({ status: pv0.status, hasVersions: !!pv0.body?.itemVersions }));
  const V0 = pv0.body.itemVersions;

  // 2) Current fingerprint issues WITHOUT a staleness block (it may still hit an ordinary pre-issue check).
  const before = await api(staff, "GET", `/api/register/leads/${leadId}/documents`);
  const issueFresh = await api(staff, "POST", `/api/register/leads/${leadId}/documents/${DOC}/issue`, { recipientName: "Stale Test Recipient", recipientEmail: "stale.test@staging.invalid", expectedVersions: V0 });
  ok("current fingerprint is NOT blocked as stale (gate passes for un-changed data)", issueFresh.body?.code !== "ISSUE_STALE", JSON.stringify({ status: issueFresh.status, code: issueFresh.body?.code }));
  const countAfterFresh = issuedCount((await api(staff, "GET", `/api/register/leads/${leadId}/documents`)).body);

  // 3) EDIT a register item → version bumps → register is now V1 (what the client did NOT re-preview).
  const target = (reg.items || []).find((i) => i.id);
  const newDesc = `${target.description || target.category || "item"} · stale-probe ${Date.now()}`;
  const put = await api(staff, "PUT", `/api/register/leads/${leadId}`, { changes: [{ ...target, description: newDesc }] });
  ok("register edit saved (item version will bump)", put.ok || put.status === 200, JSON.stringify({ status: put.status, err: put.body?.error }));
  const regV1 = await api(staff, "GET", `/api/register/leads/${leadId}`);
  const bumped = (regV1.body?.register?.items || []).find((i) => i.id === target.id);
  const V1 = Object.fromEntries((regV1.body?.register?.items || []).map((i) => [i.id, i.sync?.version ?? i.updatedAt ?? null]));
  ok("the edited item's fingerprint changed (V0 → V1)", String(V0[target.id]) !== String(V1[target.id]), JSON.stringify({ before: V0[target.id], after: V1[target.id] }));

  // 4) ISSUE with the STALE fingerprint V0 → refused, nothing recorded.
  const countBeforeStale = issuedCount((await api(staff, "GET", `/api/register/leads/${leadId}/documents`)).body);
  const stale = await api(staff, "POST", `/api/register/leads/${leadId}/documents/${DOC}/issue`, { recipientName: "Stale Test Recipient", recipientEmail: "stale.test@staging.invalid", expectedVersions: V0 });
  ok("stale issue is refused with 409 ISSUE_STALE", stale.status === 409 && stale.body?.code === "ISSUE_STALE", JSON.stringify({ status: stale.status, code: stale.body?.code }));
  const countAfterStale = issuedCount((await api(staff, "GET", `/api/register/leads/${leadId}/documents`)).body);
  ok("NO issued revision is recorded by a stale issue (nothing was issued)", countAfterStale === countBeforeStale, JSON.stringify({ before: countBeforeStale, after: countAfterStale }));

  // 5) A FRESH preview (V1) un-blocks the staleness gate.
  const pv1 = await api(staff, "POST", `/api/register/leads/${leadId}/documents/${DOC}/preview`, { recipientName: "Stale Test Recipient" });
  const issueFresh2 = await api(staff, "POST", `/api/register/leads/${leadId}/documents/${DOC}/issue`, { recipientName: "Stale Test Recipient", recipientEmail: "stale.test@staging.invalid", expectedVersions: pv1.body?.itemVersions });
  ok("re-previewing clears the staleness block (fresh fingerprint is accepted by the gate)", issueFresh2.body?.code !== "ISSUE_STALE", JSON.stringify({ status: issueFresh2.status, code: issueFresh2.body?.code }));

  // cleanup: revert the probe edit so the staging lead is unchanged for other tests.
  if (bumped) await api(staff, "PUT", `/api/register/leads/${leadId}`, { changes: [{ ...bumped, description: target.description || null }] });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
