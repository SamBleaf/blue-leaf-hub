#!/usr/bin/env node
/**
 * scripts/reclassify-finance-quotes.mjs
 *
 * One-off cleanup: the finance email poller used to ingest tender QUOTES + account STATEMENTS as
 * invoices (they carry a price, so the amount-only gate let them through). The poller now skips
 * them (classifyInboxDoc). This backfills the ones already sitting in the inbox: it re-classifies
 * every email-source doc still awaiting action (pending_approval / unmatched) using the SAME
 * classifier, and sets the quotes/statements to status='rejected' (reversible — not a hard delete).
 *
 * Uses original_filename + email_subject (the same signals the live poller has). Real invoices are
 * left untouched.
 *
 *   node scripts/reclassify-finance-quotes.mjs            # DRY RUN — lists what it would reject, writes nothing
 *   node scripts/reclassify-finance-quotes.mjs --apply    # sets status='rejected' on the quotes/statements
 */
import dotenv from "dotenv"; dotenv.config();
import { getServiceSupabase } from "../server/lib/supabaseService.mjs";
import { classifyInboxDoc } from "../server/lib/financeRoutes.mjs";

const APPLY = process.argv.includes("--apply");

const sb = getServiceSupabase();
if (!sb) { console.error("✗ no service client"); process.exit(1); }

const { data, error } = await sb.from("financial_documents")
  .select("id, original_filename, email_subject, supplier_name, amount_total, status, job_id")
  .eq("source", "email")
  .in("status", ["pending_approval", "unmatched"]);
if (error) { console.error("✗", error.message); process.exit(1); }

const candidates = [];
for (const d of data || []) {
  const cls = classifyInboxDoc({}, { filename: d.original_filename || "", subject: d.email_subject || "" });
  if (cls !== "invoice") candidates.push({ ...d, _class: cls });
}

console.log(`\n${(data || []).length} email docs awaiting action → ${candidates.length} classify as quote/statement:\n`);
for (const c of candidates) {
  console.log(`  [${c._class}] ${c.original_filename}  ·  "${(c.email_subject || "").slice(0, 55)}"  ·  $${c.amount_total ?? "-"}`);
}
const kept = (data || []).length - candidates.length;
console.log(`\n${kept} would remain as invoices.`);

if (!APPLY) {
  console.log("\nDRY RUN — nothing written. Re-run with --apply to set these to status='rejected'.\n");
  process.exit(0);
}

let done = 0;
for (const c of candidates) {
  const { error: e } = await sb.from("financial_documents")
    .update({ status: "rejected", updated_at: new Date().toISOString() })
    .eq("id", c.id);
  if (e) console.error(`  ✗ ${c.original_filename}: ${e.message}`);
  else done++;
}
console.log(`\n✓ rejected ${done}/${candidates.length} quote/statement docs.\n`);
process.exit(0);
