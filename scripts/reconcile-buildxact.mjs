#!/usr/bin/env node
/**
 * Buildxact ⇄ Blue Leaf Hub reconciliation — DEV/TROUBLESHOOTING TOOL (not user-facing).
 *
 *   node scripts/reconcile-buildxact.mjs <jobId | address-or-name | all>
 *
 * Pulls a job's headline numbers from Buildxact (live API) and the Hub DB (Supabase), prints them
 * side-by-side, flags any mismatch > $1. Auto-matches Hub↔Buildxact by buildexact_job_id → address.
 * Requires BUILDEXACT_* + SUPABASE_* in .env.
 */
import "dotenv/config";
import { getServiceSupabase } from "../server/lib/supabaseService.mjs";
import { buildexactLogin, buildexactConfigured } from "../server/lib/buildexactClient.mjs";
import { resolveBxJob, reconcileOne, renderReport } from "../server/lib/buildexactReconcile.mjs";

const arg = process.argv[2] || "all";
const LIMIT = Number(process.env.RECON_LIMIT || 5); // cap for "all" so we don't hammer the API

(async () => {
  if (!buildexactConfigured()) {
    console.error("Buildxact not configured — set BUILDEXACT_USERNAME / BUILDEXACT_API_KEY / BUILDEXACT_SUBSCRIPTION_KEY in .env");
    process.exit(1);
  }
  const sb = getServiceSupabase();
  if (!sb) { console.error("Supabase service role not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)."); process.exit(1); }

  await buildexactLogin();
  let jobs = await resolveBxJob(arg);
  if (!jobs.length) { console.log(`No Buildxact job matched "${arg}".`); process.exit(0); }

  const isAll = !arg || arg === "all";
  if (isAll && jobs.length > LIMIT) {
    console.log(`(${jobs.length} jobs; showing first ${LIMIT} — set RECON_LIMIT to change)`);
    jobs = jobs.slice(0, LIMIT);
  }

  let mismatches = 0, linked = 0;
  for (const job of jobs) {
    const result = await reconcileOne(sb, job);
    if (result.hubJob) linked += 1;
    if (result.rows.some((r) => String(r.match).startsWith("DIFF") || r.match === "differs")) mismatches += 1;
    console.log(renderReport(result));
  }
  console.log(`\n──\n${jobs.length} job(s) checked · ${linked} linked to a Hub job · ${mismatches} with a mismatch.`);
  process.exit(0);
})().catch((e) => { console.error("reconcile error:", e?.message || e); process.exit(1); });
