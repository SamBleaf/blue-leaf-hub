/**
 * Verify migrations 099–104 actually applied to the live Supabase DB.
 * Probes PostgREST with the service-role key (the SQL-editor "untitled query"
 * labels are irrelevant — this checks whether the OBJECTS exist).
 *
 * Run: node scripts/verify_migrations.mjs
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config();
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(2); }
const sb = createClient(url, key, { auth: { persistSession: false } });

let ok = 0, missing = 0;
const fails = [];

async function tableExists(table) {
  const { error } = await sb.from(table).select("*", { head: true, count: "exact" }).limit(0);
  return !error || !/does not exist|42P01/i.test(error.message || "");
}
async function columnExists(table, col) {
  const { error } = await sb.from(table).select(col).limit(0);
  return !error || !/(does not exist|42703)/i.test(error.message || "");
}
async function fnExists(fn) {
  const { error } = await sb.rpc(fn);
  // 42883 = function does not exist; anything else (incl. ok or a different error) = exists
  return !error || !/(does not exist|42883|could not find|PGRST202)/i.test(`${error.message || ""} ${error.code || ""} ${error.hint || ""}`);
}

async function check(label, fn) {
  const present = await fn();
  if (present) { ok++; console.log(`  ✓ ${label}`); }
  else { missing++; fails.push(label); console.log(`  ✗ ${label}  — NOT FOUND`); }
}

console.log("\n── Prerequisites (099–102) ──");
await check("100 invitations.employee_id", () => columnExists("invitations", "employee_id"));
await check("101 lead_documents.ptsa_signed_document_path", () => columnExists("lead_documents", "ptsa_signed_document_path"));
await check("102 rfq_events table", () => tableExists("rfq_events"));

console.log("\n── Migration 103 — portal v2 tables ──");
for (const t of [
  "project_client_users", "client_actions", "portal_documents", "portal_meetings",
  "client_selections", "selection_options", "portal_audit_logs", "portal_notifications",
]) await check(`103 ${t}`, () => tableExists(t));

console.log("\n── Migration 103 — new columns ──");
await check("103 projects.build_phase", () => columnExists("projects", "build_phase"));
await check("103 projects.portal_v2_enabled", () => columnExists("projects", "portal_v2_enabled"));
await check("103 portal_milestones.is_current", () => columnExists("portal_milestones", "is_current"));
await check("103 portal_milestones.confidence", () => columnExists("portal_milestones", "confidence"));
await check("103 portal_decisions.builder_reasoning", () => columnExists("portal_decisions", "builder_reasoning"));
await check("103 portal_claims.progress_claim_id", () => columnExists("portal_claims", "progress_claim_id"));
await check("103 portal_notifications.dedup_day", () => columnExists("portal_notifications", "dedup_day"));

console.log("\n── Migration 104 — RLS hardening ──");
await check("104 auth_is_staff() function", () => fnExists("auth_is_staff"));

console.log("\n── Migration 105 / 108 — follow-ups ──");
await check("105 projects.payment_instructions", () => columnExists("projects", "payment_instructions"));
// 108 adds paid_to_date in the SAME migration that widens the portal_decisions /
// portal_claims status CHECKs (→ 'withdrawn' / 'void' / 'partially_paid'). So if
// paid_to_date exists, 108 is applied — the void/partial-pay sync paths are live.
await check("108 portal_claims.paid_to_date", () => columnExists("portal_claims", "paid_to_date"));

console.log("\n════════════════════════════════════════");
console.log(`  ${ok} present, ${missing} missing`);
if (missing) {
  console.log("\n  MISSING — re-apply these migrations:");
  fails.forEach((f) => console.log(`    • ${f}`));
}
console.log("════════════════════════════════════════\n");
process.exit(missing ? 1 : 0);
