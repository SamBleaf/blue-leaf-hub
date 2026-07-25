#!/usr/bin/env node
/**
 * scripts/cleanup-quote-inbox.mjs
 *
 * One-off cleanup: the inbound-quote IMAP poller used to write EVERY no-RFQ-match email to the
 * Quote Inbox (unmatched_quote_emails), so the badge sat at ~76 rows that are almost entirely junk
 * — client-portal notifications ("Client approved a variation — …", sent from admin@) and hardening
 * test artifacts (BLH TEST / __DRYRUN / __DEMO). The poller now skips these at the source
 * (server/lib/quoteInboxClassify.mjs). This backfills the ones already sitting in the inbox: it
 * re-classifies every UNRESOLVED row using the SAME classifier and marks the junk resolved by
 * setting resolved_at (reversible — NOT a hard delete; set resolved_at back to NULL to restore).
 *
 * Uses from_email + subject + body_preview (the same signals the live poller has). Rows that still
 * look like a subcontractor quote are left untouched.
 *
 *   node scripts/cleanup-quote-inbox.mjs            # DRY RUN — lists what it would resolve, writes nothing
 *   node scripts/cleanup-quote-inbox.mjs --apply    # sets resolved_at on the junk rows
 */
import dotenv from "dotenv"; dotenv.config();
import { getServiceSupabase } from "../server/lib/supabaseService.mjs";
import { classifyInboundQuoteEmail } from "../server/lib/quoteInboxClassify.mjs";

const APPLY = process.argv.includes("--apply");

const sb = getServiceSupabase();
if (!sb) { console.error("✗ no service client (set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)"); process.exit(1); }

const { data, error } = await sb.from("unmatched_quote_emails")
  .select("id, from_email, subject, body_preview, created_at")
  .is("resolved_at", null)
  .order("created_at", { ascending: false });
if (error) { console.error("✗", error.message); process.exit(1); }

const rows = data || [];
const candidates = [];
for (const r of rows) {
  const cls = classifyInboundQuoteEmail({ fromEmail: r.from_email, subject: r.subject, body: r.body_preview });
  if (cls.category !== "quote") candidates.push({ ...r, _class: cls.category, _reason: cls.reason });
}

// Group the dry-run list by reason so Sam can eyeball each bucket before approving.
const byClass = {};
for (const c of candidates) (byClass[c._class] ||= []).push(c);

console.log(`\n${rows.length} unresolved Quote Inbox rows → ${candidates.length} classify as junk:\n`);
for (const [cls, list] of Object.entries(byClass)) {
  console.log(`  ── ${cls} (${list.length}) ──`);
  for (const c of list) {
    console.log(`     "${(c.subject || "(no subject)").slice(0, 60)}"  ·  ${c.from_email || "(no from)"}  ·  ${c._reason}`);
  }
}
const kept = rows.length - candidates.length;
console.log(`\n${kept} would remain in the Quote Inbox (still look like subcontractor quotes).`);

if (!APPLY) {
  console.log("\nDRY RUN — nothing written. Re-run with --apply to set resolved_at on the junk rows.\n");
  process.exit(0);
}

let done = 0;
const resolvedAt = new Date().toISOString();
for (const c of candidates) {
  const { error: e } = await sb.from("unmatched_quote_emails")
    .update({ resolved_at: resolvedAt })
    .eq("id", c.id);
  if (e) console.error(`  ✗ ${c.id}: ${e.message}`);
  else done++;
}
console.log(`\n✓ resolved ${done}/${candidates.length} junk rows (reversible — set resolved_at back to NULL to restore).\n`);
process.exit(0);
