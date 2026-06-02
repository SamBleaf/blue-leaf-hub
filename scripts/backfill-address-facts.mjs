#!/usr/bin/env node
/**
 * scripts/backfill-address-facts.mjs — Phase 1 (Universal Data Architecture).
 *
 * Backfills address_normalised / address_suburb / address_postcode / address_state
 * on every existing `jobs` row, computed with the EXACT JS parser
 * (server/lib/addressNormalise.mjs → normaliseAddress) so the stored values match
 * what the live setFact() address-write hook produces. SQL can't replicate the
 * regex-based street-abbreviation expansion, so this runs in Node instead — see the
 * note in supabase/migrations/077_address_backfill.sql.
 *
 * Writes go through the facts service (setFact, source='system',
 * reason='address_backfill') so each derived value gets a job_fact_history
 * provenance row — never a raw column write.
 *
 * Prereq: apply migration 077 first (it ensures the columns + index exist).
 *
 * Usage:
 *   node scripts/backfill-address-facts.mjs            # DRY RUN — prints planned writes, writes nothing
 *   node scripts/backfill-address-facts.mjs --apply    # writes the derived facts via setFact()
 *
 * Idempotent: re-running only rewrites values that differ from what's stored.
 */
import dotenv from "dotenv";
dotenv.config();
import { getServiceSupabase } from "../server/lib/supabaseService.mjs";
import { normaliseAddress } from "../server/lib/addressNormalise.mjs";
import { setFact } from "../server/lib/factsService.mjs";

const APPLY = process.argv.includes("--apply");

// fact_key → field on the normaliseAddress() result + the stored jobs column.
const DERIVED = [
  { key: "address_normalised", field: "normalised", column: "address_normalised" },
  { key: "address_suburb", field: "suburb", column: "address_suburb" },
  { key: "address_postcode", field: "postcode", column: "address_postcode" },
  { key: "address_state", field: "state", column: "address_state" },
];

(async () => {
  const sb = getServiceSupabase();
  if (!sb) {
    console.error("✗ No Supabase service client — check SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env");
    process.exit(1);
  }

  console.log(APPLY ? "APPLY mode — writing derived address facts via setFact()." : "DRY RUN — no writes. Pass --apply to write.");

  const { data: jobs, error } = await sb
    .from("jobs")
    .select("id, address, address_normalised, address_suburb, address_postcode, address_state");
  if (error) {
    console.error("✗ Failed to read jobs:", error.message);
    process.exit(1);
  }
  if (!jobs?.length) {
    console.log("No jobs to backfill.");
    process.exit(0);
  }

  let rowsTouched = 0, factsWritten = 0, rowsSkipped = 0, errors = 0;

  for (const job of jobs) {
    if (!job.address) { rowsSkipped += 1; continue; }
    const parsed = normaliseAddress(job.address);

    const changes = [];
    for (const { key, field, column } of DERIVED) {
      const next = parsed?.[field] ?? null;
      if (next === null || next === undefined) continue; // don't clobber with nulls
      const current = job[column] ?? null;
      if (String(current) === String(next)) continue;    // already correct — idempotent skip
      changes.push({ key, value: next, from: current });
    }

    if (!changes.length) { rowsSkipped += 1; continue; }
    rowsTouched += 1;
    console.log(`\n${job.id}  "${job.address}"`);
    for (const c of changes) {
      console.log(`   ${c.key}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.value)}`);
      if (APPLY) {
        const r = await setFact(job.id, c.key, c.value, { source: "system", reason: "address_backfill" });
        if (r.ok) { factsWritten += 1; }
        else { errors += 1; console.error(`   ✗ ${c.key}: ${r.error}`); }
      }
    }
  }

  console.log(`\n— Summary —`);
  console.log(`  jobs scanned:   ${jobs.length}`);
  console.log(`  rows to update: ${rowsTouched}`);
  console.log(`  rows skipped:   ${rowsSkipped} (no address or already correct)`);
  if (APPLY) {
    console.log(`  facts written:  ${factsWritten}`);
    console.log(`  errors:         ${errors}`);
  } else {
    console.log(`  (dry run — re-run with --apply to write)`);
  }
  process.exit(errors ? 1 : 0);
})();
