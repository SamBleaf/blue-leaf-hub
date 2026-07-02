/**
 * W1C — closed-loop attribution + ROI (Batch 1C).
 *   Sub-batch A (guarded): fee_proposals.lead_id trigger (migration 129).
 *   Main: lead_touch_events + enquiry_attribution revenue + v_lead_attribution_roi (migration 130).
 * Direct-DB (service role) tests — the trigger + view are DB-level. Gap-documented, not
 * failed, when a migration isn't applied yet (manual-apply per repo convention).
 */
import { WRITE, serviceClient } from "./_helpers.mjs";

const PREFIX = "__BLH TEST__ W1C";

export async function runW1C(run) {
  run.section("W1C attribution + ROI (migrations 129, 130)");
  const svc = serviceClient();
  if (!svc) { run.fail("Service client", "SUPABASE_SERVICE_ROLE_KEY not configured"); return; }

  // ── Sub-batch A: fee_proposals.lead_id (migration 129) ────────────────────
  const { error: colErr } = await svc.from("fee_proposals").select("lead_id").limit(1);
  if (colErr && colErr.code !== "42703" && colErr.code !== "42P01") {
    // unrelated error — surface it
    run.fail("fee_proposals.lead_id reachable", colErr.message);
  } else if (colErr) {
    run.gap("Migration 129 applied", "fee_proposals.lead_id missing — paste supabase/migrations/129_fee_proposals_lead_id.sql");
  } else {
    run.pass("Migration 129 applied (fee_proposals.lead_id reachable)");
  }

  if (!WRITE) {
    run.skip("W1C-01 fee_proposal trigger derives lead_id from job", "requires --write");
    run.skip("W1C-02 attribution ROI view returns rows", "requires --write");
    return;
  }

  const ts = Date.now();
  const leadIds = [], jobIds = [], fpIds = [];
  try {
    // Fixture: lead → job(lead_id) → fee_proposal(job_id)
    const { data: lead } = await svc.from("leads").insert({
      first_name: PREFIX, last_name: `Attr ${ts}`, email: `blh-test-w1c-${ts}@example.test`,
      lead_source: "referral", lead_source_category: "referral", stage: "won",
      estimated_value: 750000,
    }).select().single();
    if (!lead?.id) { run.fail("W1C setup", "could not create lead"); return; }
    leadIds.push(lead.id);

    const { data: job } = await svc.from("jobs").insert({
      address: `${PREFIX} ${ts} St`, lead_id: lead.id,
    }).select().single();
    if (!job?.id) { run.fail("W1C setup", "could not create job"); return; }
    jobIds.push(job.id);

    // W1C-01 — insert a fee_proposal against the job; the trigger should stamp lead_id.
    const { data: fp, error: fpErr } = await svc.from("fee_proposals").insert({
      job_id: job.id, quote_number: `W1C-${ts}`, total_inc_gst: 825000,
    }).select().single();
    if (fpErr) {
      run.gap("W1C-01 fee_proposal trigger derives lead_id", `insert failed (${fpErr.code === "42P01" || fpErr.code === "42703" ? "migration 129 not applied" : fpErr.message})`);
    } else {
      fpIds.push(fp.id);
      if (fp.lead_id === lead.id) run.pass("W1C-01 fee_proposal trigger derives lead_id from job");
      else run.fail("W1C-01 fee_proposal trigger derives lead_id from job", `expected ${lead.id}, got ${fp.lead_id}`);
    }

    // W1C-02 — ROI view returns a row for this won lead with proposal value.
    const { data: roi, error: roiErr } = await svc
      .from("v_lead_attribution_roi").select("*").eq("lead_id", lead.id);
    if (roiErr && (roiErr.code === "42P01")) {
      run.gap("W1C-02 attribution ROI view returns rows", "v_lead_attribution_roi missing — paste supabase/migrations/130_attribution_roi.sql");
    } else if (roiErr) {
      run.fail("W1C-02 attribution ROI view", roiErr.message);
    } else if ((roi || []).length > 0) {
      run.pass("W1C-02 attribution ROI view returns a row for the won lead");
    } else {
      run.fail("W1C-02 attribution ROI view returns rows", "no row for the seeded won lead");
    }
  } finally {
    for (const id of fpIds) await svc.from("fee_proposals").delete().eq("id", id);
    for (const id of jobIds) await svc.from("jobs").delete().eq("id", id);
    for (const id of leadIds) {
      await svc.from("lead_touch_events").delete().eq("lead_id", id).then(() => {}, () => {});
      await svc.from("enquiry_attribution").delete().eq("lead_id", id).then(() => {}, () => {});
      await svc.from("lead_activities").delete().eq("lead_id", id);
      await svc.from("leads").delete().eq("id", id);
    }
  }
}
