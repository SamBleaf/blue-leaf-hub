/**
 * W1A — CRM/Sales Control Spine (Batch 1A of docs/plans/CRM_SALES_CONTROL_SYSTEM_BUILD_PLAN.md)
 * Requires migration 127_crm_control_spine.sql applied first — checked live; gap-documented
 * (not failed) if missing, since the migration is manual-apply per repo convention.
 */
import { WRITE, post, patch, getAuthToken, serviceClient } from "./_helpers.mjs";

const PREFIX = "__BLH TEST__ W1A";

async function migrationApplied(svc) {
  const { error } = await svc.from("leads").select("fit_quality").limit(1);
  return !error;
}

export async function runW1A(run) {
  run.section("W1A CRM Control Spine (migration 127)");

  const svc = serviceClient();
  if (!svc) { run.fail("Service client", "SUPABASE_SERVICE_ROLE_KEY not configured"); return; }

  const applied = await migrationApplied(svc);
  if (!applied) {
    run.gap("Migration 127 applied", "leads.fit_quality missing — paste supabase/migrations/127_crm_control_spine.sql in Supabase SQL editor, then re-run --write");
    return;
  }
  run.pass("Migration 127 applied (leads.fit_quality reachable)");

  const { data: signalsProbe, error: signalsErr } = await svc.from("lead_signals").select("id").limit(1);
  if (signalsErr) run.fail("lead_signals table reachable", signalsErr.message);
  else run.pass("lead_signals table reachable");

  if (!WRITE) {
    run.skip("W1A-01 lead_source_category required on create", "requires --write");
    run.skip("W1A-02 fit_quality/readiness set + provenance stamped", "requires --write");
    run.skip("W1A-03 stage change → rule-based action_type/action_due_at", "requires --write");
    run.skip("W1A-04 explicit action_type wins over the stage-change rule", "requires --write");
    run.skip("W1A-05 snoozed_until round-trips", "requires --write");
    return;
  }

  let token;
  try {
    token = await getAuthToken();
  } catch (e) {
    run.fail("Auth token", e.message);
    return;
  }

  const ts = Date.now();
  const leadIds = [];

  try {
    // W1A-01 — a lead with no lead_source and no lead_source_category must be rejected.
    const noSource = await post("/api/sales/leads", {
      first_name: PREFIX, last_name: `NoSource ${ts}`, email: `blh-test-w1a-nosource-${ts}@example.test`,
    }, token);
    if (noSource.status === 400 && /lead_source_category/i.test(noSource.body?.error || "")) {
      run.pass("W1A-01 create without lead_source_category is rejected");
    } else {
      run.fail("W1A-01 create without lead_source_category is rejected", `status ${noSource.status} ${JSON.stringify(noSource.body)}`);
      if (noSource.body?.lead?.id) leadIds.push(noSource.body.lead.id);
    }

    // A lead with a classifiable lead_source ("referral") should auto-derive the category and succeed.
    const created = await post("/api/sales/leads", {
      first_name: PREFIX, last_name: `Spine ${ts}`, email: `blh-test-w1a-spine-${ts}@example.test`,
      lead_source: "referral", stage: "enquiry",
    }, token);
    const leadId = created.body?.lead?.id;
    if (created.status === 200 && leadId && created.body.lead.lead_source_category === "referral") {
      run.pass("W1A-01b lead_source_category auto-derived from lead_source ('referral')");
    } else {
      run.fail("W1A-01b lead_source_category auto-derived", `status ${created.status} ${JSON.stringify(created.body)}`);
    }
    if (!leadId) { run.fail("W1A setup", "Could not create base test lead — aborting remaining cases"); return; }
    leadIds.push(leadId);

    // W1A-02 — fit_quality + readiness set by hand, provenance stamped, never AI-mutated.
    const fitSet = await patch(`/api/sales/leads/${leadId}`, { fit_quality: "strong", readiness: "ready_for_consult" }, token);
    if (fitSet.status === 200 && fitSet.body?.lead?.fit_quality === "strong" && fitSet.body?.lead?.readiness === "ready_for_consult" && fitSet.body?.lead?.fit_set_at) {
      run.pass("W1A-02 fit_quality/readiness set + fit_set_at stamped");
    } else {
      run.fail("W1A-02 fit_quality/readiness set + fit_set_at stamped", JSON.stringify(fitSet.body));
    }
    const invalidFit = await patch(`/api/sales/leads/${leadId}`, { fit_quality: "not_a_real_value" }, token);
    if (invalidFit.status === 400) run.pass("W1A-02b invalid fit_quality rejected");
    else run.fail("W1A-02b invalid fit_quality rejected", `status ${invalidFit.status}`);

    // W1A-03 — stage change with no explicit action_type gets the rule-based default.
    const stageMove = await patch(`/api/sales/leads/${leadId}`, { stage: "qualify" }, token);
    if (stageMove.status === 200 && stageMove.body?.lead?.action_type === "response_due" && stageMove.body?.lead?.action_due_at) {
      run.pass("W1A-03 stage change applies rule-based action_type/action_due_at (qualify → response_due)");
    } else {
      run.fail("W1A-03 stage change applies rule-based action_type/action_due_at", JSON.stringify(stageMove.body));
    }

    // W1A-04 — an explicit action_type in the SAME request as a stage change must win (not overridden).
    const explicitWin = await patch(`/api/sales/leads/${leadId}`, { stage: "discovery", action_type: "plans_received" }, token);
    if (explicitWin.status === 200 && explicitWin.body?.lead?.action_type === "plans_received") {
      run.pass("W1A-04 explicit action_type wins over the stage-change rule default");
    } else {
      run.fail("W1A-04 explicit action_type wins over the stage-change rule default", JSON.stringify(explicitWin.body));
    }

    // W1A-05 — snoozed_until round-trips.
    const snoozeUntil = new Date(Date.now() + 7 * 86400000).toISOString();
    const snoozed = await patch(`/api/sales/leads/${leadId}`, { snoozed_until: snoozeUntil }, token);
    if (snoozed.status === 200 && snoozed.body?.lead?.snoozed_until) {
      run.pass("W1A-05 snoozed_until round-trips");
    } else {
      run.fail("W1A-05 snoozed_until round-trips", JSON.stringify(snoozed.body));
    }
  } finally {
    if (svc) {
      for (const id of leadIds) {
        await svc.from("lead_activities").delete().eq("lead_id", id);
        await svc.from("leads").delete().eq("id", id);
      }
    }
  }
}
