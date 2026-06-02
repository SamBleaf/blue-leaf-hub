#!/usr/bin/env node
/**
 * scripts/backfill-carpentry-job-link.mjs — Phase 7 (Universal Data Architecture).
 *
 * Backfills carpentry_jobs.job_id (the nullable upward link to the builder `jobs`
 * spine — migration 082) by EXACT normalised-address match. Each carpentry job's
 * address is parsed with the EXACT JS parser (server/lib/addressNormalise.mjs →
 * normaliseAddress) and matched against jobs.address_normalised — the same key the
 * live app uses. SQL can't replicate the regex-based street-abbreviation expansion,
 * so this runs in Node instead — see the note in
 * supabase/migrations/082_carpentry_job_link.sql.
 *
 * ⚠️ MONEY-ADJACENT — LABOUR ATTRIBUTION. A wrong link folds carpentry into the
 * wrong builder job's rollups. This script is deliberately CONSERVATIVE:
 *   • It links ONLY when there is EXACTLY ONE builder job whose
 *     address_normalised equals the carpentry job's normalised address.
 *   • If ZERO builder jobs match → LEFT NULL (standalone subsidiary work — valid).
 *   • If MORE THAN ONE builder job matches (ambiguous) → LEFT NULL + WARN for
 *     manual review. NEVER force-link an ambiguous match.
 *   • It NEVER overwrites an existing non-NULL job_id (idempotent, manual links win).
 *
 * carpentry_jobs.job_id is a raw FK column (carpentry has no facts-service spine),
 * so it is written directly via the service client — NOT via setFact (which only
 * handles the `job` spine and the registered fact keys).
 *
 * Prereq: apply migration 082 first (it adds the column + index), and run
 *         scripts/backfill-address-facts.mjs first so jobs.address_normalised is
 *         populated (otherwise nothing will match).
 *
 * Usage:
 *   node scripts/backfill-carpentry-job-link.mjs            # DRY RUN — prints planned links, writes nothing
 *   node scripts/backfill-carpentry-job-link.mjs --apply    # writes carpentry_jobs.job_id
 *
 * Idempotent: re-running only links rows that are still NULL.
 */
import dotenv from "dotenv";
dotenv.config();
import { getServiceSupabase } from "../server/lib/supabaseService.mjs";
import { normaliseAddress } from "../server/lib/addressNormalise.mjs";

const APPLY = process.argv.includes("--apply");

(async () => {
  const sb = getServiceSupabase();
  if (!sb) {
    console.error("✗ No Supabase service client — check SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env");
    process.exit(1);
  }

  console.log(APPLY ? "APPLY mode — writing carpentry_jobs.job_id links." : "DRY RUN — no writes. Pass --apply to write.");

  const { data: carpentryJobs, error } = await sb
    .from("carpentry_jobs")
    .select("id, reference, address, job_id");
  if (error) {
    console.error("✗ Failed to read carpentry_jobs:", error.message);
    process.exit(1);
  }
  if (!carpentryJobs?.length) {
    console.log("No carpentry jobs to link.");
    process.exit(0);
  }

  let linked = 0, alreadyLinked = 0, noAddress = 0, unmatched = 0, ambiguous = 0, errors = 0;

  for (const cj of carpentryJobs) {
    if (cj.job_id) { alreadyLinked += 1; continue; } // never overwrite a manual/existing link
    if (!cj.address) { noAddress += 1; continue; }

    const norm = normaliseAddress(cj.address).normalised;
    if (!norm) { noAddress += 1; continue; }

    // Exact normalised-address match against the builder jobs spine. Pull up to 2
    // so we can DETECT ambiguity (more than one candidate → leave NULL, never guess).
    const { data: candidates, error: matchErr } = await sb
      .from("jobs")
      .select("id, address")
      .eq("address_normalised", norm)
      .limit(2);
    if (matchErr) {
      errors += 1;
      console.error(`   ✗ ${cj.reference}: match query failed — ${matchErr.message}`);
      continue;
    }

    if (!candidates?.length) {
      unmatched += 1; // standalone subsidiary work, or builder job not yet synced — VALID NULL
      continue;
    }
    if (candidates.length > 1) {
      ambiguous += 1;
      console.warn(`\n⚠ ${cj.reference}  "${cj.address}"`);
      console.warn(`   AMBIGUOUS — ${candidates.length}+ builder jobs share normalised key "${norm}". LEFT NULL for manual review:`);
      for (const c of candidates) console.warn(`     • ${c.id}  "${c.address}"`);
      continue;
    }

    const match = candidates[0];
    linked += 1;
    console.log(`\n${cj.reference}  "${cj.address}"`);
    console.log(`   → builder job ${match.id}  "${match.address}"`);
    if (APPLY) {
      const { error: upErr } = await sb
        .from("carpentry_jobs")
        .update({ job_id: match.id, updated_at: new Date().toISOString() })
        .eq("id", cj.id)
        .is("job_id", null); // guard: only write if still NULL (idempotent, race-safe)
      if (upErr) { errors += 1; console.error(`   ✗ link write failed — ${upErr.message}`); }
    }
  }

  console.log(`\n— Summary —`);
  console.log(`  carpentry jobs scanned: ${carpentryJobs.length}`);
  console.log(`  newly linked:           ${linked}`);
  console.log(`  already linked (kept):  ${alreadyLinked}`);
  console.log(`  no address:             ${noAddress}`);
  console.log(`  unmatched (NULL — ok):  ${unmatched}  (standalone or builder job not synced)`);
  console.log(`  ambiguous (NULL — ⚠):   ${ambiguous}  (review the warnings above)`);
  if (APPLY) console.log(`  errors:                 ${errors}`);
  else console.log(`  (dry run — re-run with --apply to write)`);
  process.exit(errors ? 1 : 0);
})();
