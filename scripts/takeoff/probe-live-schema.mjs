// READ-ONLY live schema probe for the takeoff build.   node scripts/takeoff/probe-live-schema.mjs
// Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the environment/.env. Every check is a
// zero-row select (limit 0) or a bucket metadata read — no data is read or printed, nothing is
// written, no RPC is executed. Prints PRESENT / MISSING per column so operators can see exactly
// which migrations the live database has before TAKEOFF_ENABLED is switched on.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config();
const url = process.env.SUPABASE_URL?.trim(), key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) { console.log("BLOCKED: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — cannot probe."); process.exit(0); }
const sb = createClient(url, key, { auth: { persistSession: false } });

const CHECKS = [
  ["job_documents", ["id", "job_id", "document_type", "title", "version", "status", "storage_provider", "storage_path", "audience_layer", "supersedes_document_id", "uploaded_by", "uploaded_at"], "mig 069"],
  ["job_documents", ["carpentry_job_id"], "mig 152"],
  ["job_documents", ["charge_up_job_id"], "mig 172"],
  ["job_documents", ["revision_label", "content_sha256", "byte_size", "archived_at", "archived_by"], "mig 206 (expected MISSING until applied)"],
  ["suppliers", ["id", "name", "email", "phone", "contact_name", "abn", "is_active", "updated_at"], "mig 085"],
  ["suppliers", ["is_preferred", "account_terms"], "mig 092"],
  ["suppliers", ["address"], "audit: selected by procurementRoutes.mjs but in NO migration"],
  ["company_profile", ["name", "abn", "address", "phone", "email", "updated_at"], "mig 069"],
  ["carpentry_jobs", ["id", "address", "client_name", "status"], "mig 065"],
  ["projects", ["id", "job_id", "address", "status"], "core"],
  ["charge_up_jobs", ["id", "carpentry_job_id", "status", "address"], "mig 145"],
  ["employees", ["id", "user_id", "is_leading_hand", "is_active"], "mig 059"],
  ["user_profiles", ["id", "role", "is_active"], "core"],
  ["timesheets", ["employee_id", "project_id", "carpentry_job_id", "date"], "mig 059/065"],
  ["takeoff_workspaces", ["id", "revision"], "mig 206 (expected MISSING until applied)"],
  ["takeoff_exports", ["id", "artifact_status"], "mig 206 (expected MISSING until applied)"],
];

let missing = 0;
for (const [table, cols, note] of CHECKS) {
  for (const c of cols) {
    const { error } = await sb.from(table).select(c).limit(0);
    const ok = !error;
    if (!ok) missing++;
    console.log(`${ok ? "PRESENT" : "MISSING"}  ${table}.${c}  (${note})${ok ? "" : ` — ${error.code || ""}`}`);
  }
}
for (const b of ["job-plans", "takeoff-exports"]) {
  const { data, error } = await sb.storage.getBucket(b);
  console.log(`${data && !error ? "PRESENT" : "MISSING"}  storage bucket ${b}${data ? ` (public=${data.public})` : ""}`);
}
console.log(`\n${missing} column/table check(s) missing.`);
