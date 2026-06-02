// scripts/seed-test-job.mjs — seed ONE realistic, healthy won job into the local DB
// so the Finance Command Centre has data to verify against on localhost.
// Idempotent: deletes the seed rows (fixed UUIDs) then re-inserts. Run: node scripts/seed-test-job.mjs
import dotenv from "dotenv";
dotenv.config();
import { getServiceSupabase } from "../server/lib/supabaseService.mjs";
import { normaliseAddress } from "../server/lib/addressNormalise.mjs";

const sb = getServiceSupabase();
if (!sb) { console.error("✗ No Supabase service client — check SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env"); process.exit(1); }

const JOB_ID = "5eed0000-0000-4000-8000-000000000001";
const PROJECT_ID = "5eed0000-0000-4000-8000-000000000002";
const PROPOSAL_ID = "5eed0000-0000-4000-8000-000000000003";
const now = new Date().toISOString();

async function step(label, promise) {
  const { error } = await promise;
  console.log(error ? `  ✗ ${label}: ${error.message}` : `  ✓ ${label}`);
  return !error;
}

(async () => {
  console.log("Cleaning any previous seed rows…");
  await sb.from("financial_documents").delete().eq("job_id", JOB_ID);
  await sb.from("job_variations").delete().eq("job_id", JOB_ID);
  await sb.from("fee_proposals").delete().eq("id", PROPOSAL_ID);
  await sb.from("projects").delete().eq("id", PROJECT_ID);
  await sb.from("jobs").delete().eq("id", JOB_ID);

  console.log("Seeding…");
  // Job: won, healthy numbers. Contract $850k ex-GST, forecast cost $620k → ~27% forecast margin.
  const A = normaliseAddress("12 Test Street, Glenelg SA 5045");
  await step("jobs", sb.from("jobs").insert({
    id: JOB_ID,
    address: "12 Test Street, Glenelg SA 5045",
    address_normalised: A.normalised,
    address_suburb: A.suburb,
    address_state: A.state,
    address_postcode: A.postcode,
    project_type: "new_home",
    client_name: "Test Client (seed)",
    client_email: "test.client@example.com",
    client_phone: "0400 000 000",
    status: "won",
    won_at: now,
    original_contract_value: 850000,
    contract_value: 850000,
    target_margin_pct: 40,
    floor_margin_pct: 33,
    forecast_total_cost: 620000,
    estimated_total_cost: 600000,
    storeys: 2,
    floor_area_m2: 320,
    created_at: now,
  }));

  await step("projects", sb.from("projects").insert({
    id: PROJECT_ID, job_id: JOB_ID,
    address: "12 Test Street, Glenelg SA 5045",
    status: "active", contract_value: 850000,
    created_at: now, updated_at: now,
  }));

  // Fee proposal (accepted): ex-GST = total_inc_gst - tax = 935000 - 85000 = 850000.
  await step("fee_proposals", sb.from("fee_proposals").insert({
    id: PROPOSAL_ID, job_id: JOB_ID, quote_number: "SEED-001",
    address: "12 Test Street, Glenelg SA 5045", client_name: "Test Client (seed)",
    net_total: 607000, markup_percent: 40, markup_amount: 243000,
    tax_amount: 85000, total_inc_gst: 935000, status: "accepted",
    created_at: now, updated_at: now,
  }));

  // Approved invoices → actual costs ($153.5k)
  const docs = [
    { supplier_name: "Adelaide Concrete Co",  amount_ex_gst: 52000 },
    { supplier_name: "Frame & Truss SA",      amount_ex_gst: 73500 },
    { supplier_name: "Glenelg Electrical",    amount_ex_gst: 28000 },
  ];
  for (const [i, d] of docs.entries()) {
    await step(`financial_documents[${i}]`, sb.from("financial_documents").insert({
      job_id: JOB_ID, source: "manual", status: "approved",
      supplier_name: d.supplier_name, amount_ex_gst: d.amount_ex_gst,
      invoice_number: `SEED-INV-${i + 1}`, created_at: now, updated_at: now,
    }));
  }

  // One signed variation
  await step("job_variations", sb.from("job_variations").insert({
    job_id: JOB_ID, variation_number: 1, title: "Upgrade kitchen benchtop (seed)",
    amount_ex_gst: 12000, status: "signed", created_at: now, updated_at: now,
  }));

  console.log("\nDone. View at: http://localhost:5173/finance/jobs/" + JOB_ID);
  process.exit(0);
})();
