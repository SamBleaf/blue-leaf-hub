/**
 * W1B — CRM unified timeline + lead_signals (Batch 1B of CRM_SALES_CONTROL_SYSTEM_BUILD_PLAN.md)
 * Requires migration 128_lead_timeline_view.sql (v_lead_timeline) + 127 (lead_signals).
 * Gap-documented (not failed) if the view/table are missing — manual-apply per convention.
 */
import { WRITE, API, post, patch, get, getAuthToken, serviceClient } from "./_helpers.mjs";

const PREFIX = "__BLH TEST__ W1B";

async function del(path, token) {
  const res = await fetch(`${API}${path}`, { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

export async function runW1B(run) {
  run.section("W1B CRM unified timeline + signals (migration 128)");

  const svc = serviceClient();
  if (!svc) { run.fail("Service client", "SUPABASE_SERVICE_ROLE_KEY not configured"); return; }

  // View reachable?
  const { error: viewErr } = await svc.from("v_lead_timeline").select("lead_id").limit(1);
  if (viewErr && viewErr.code === "42P01") {
    run.gap("Migration 128 applied", "v_lead_timeline missing — paste supabase/migrations/128_lead_timeline_view.sql, then re-run --write");
  } else if (viewErr) {
    run.fail("v_lead_timeline reachable", viewErr.message);
  } else {
    run.pass("Migration 128 applied (v_lead_timeline reachable)");
  }

  if (!WRITE) {
    run.skip("W1B-01 lead_signals CRUD round-trip", "requires --write");
    run.skip("W1B-02 timeline surfaces lead activity", "requires --write");
    run.skip("W1B-03 convert backfills crm_interactions.lead_id", "requires --write");
    return;
  }

  let token;
  try { token = await getAuthToken(); } catch (e) { run.fail("Auth token", e.message); return; }

  const ts = Date.now();
  const leadIds = [], contactIds = [];
  try {
    // Base lead
    const created = await post("/api/sales/leads", {
      first_name: PREFIX, last_name: `Timeline ${ts}`, email: `blh-test-w1b-${ts}@example.test`,
      lead_source: "referral", stage: "enquiry",
    }, token);
    const leadId = created.body?.lead?.id;
    if (!leadId) { run.fail("W1B setup", `could not create lead — ${JSON.stringify(created.body)}`); return; }
    leadIds.push(leadId);

    // W1B-01 — lead_signals CRUD round-trip
    const add = await post(`/api/sales/leads/${leadId}/signals`, { kind: "objection", label: "Worried about budget" }, token);
    const sigId = add.body?.signal?.id;
    const list = await get(`/api/sales/leads/${leadId}/signals`, token);
    const patched = sigId ? await patch(`/api/sales/leads/${leadId}/signals/${sigId}`, { status: "addressed" }, token) : { status: 0 };
    const removed = sigId ? await del(`/api/sales/leads/${leadId}/signals/${sigId}`, token) : { status: 0 };
    if (add.status === 200 && sigId && (list.body?.signals || []).some(s => s.id === sigId)
        && patched.body?.signal?.status === "addressed" && removed.status === 200) {
      run.pass("W1B-01 lead_signals CRUD round-trip (create/list/addressed/delete)");
    } else {
      run.fail("W1B-01 lead_signals CRUD round-trip", `add ${add.status} patch ${patched.status} del ${removed.status}`);
    }
    const badKind = await post(`/api/sales/leads/${leadId}/signals`, { kind: "nonsense", label: "x" }, token);
    if (badKind.status === 400) run.pass("W1B-01b invalid signal kind rejected");
    else run.fail("W1B-01b invalid signal kind rejected", `status ${badKind.status}`);

    // W1B-02 — timeline surfaces the lead's own activity (the auto "Lead created" row)
    const tl = await get(`/api/sales/leads/${leadId}/timeline`, token);
    if (tl.body?.viewMissing) {
      run.gap("W1B-02 timeline surfaces lead activity", "v_lead_timeline not applied — endpoint soft-returned empty");
    } else if (tl.status === 200 && Array.isArray(tl.body?.timeline) && tl.body.timeline.some(e => e.kind === "activity")) {
      run.pass("W1B-02 timeline surfaces lead activity");
    } else {
      run.fail("W1B-02 timeline surfaces lead activity", JSON.stringify(tl.body).slice(0, 200));
    }

    // W1B-03 — convert backfills crm_interactions.lead_id
    const { data: contact } = await svc.from("crm_contacts").insert({
      first_name: PREFIX, last_name: `Convert ${ts}`, email: `blh-test-w1b-c-${ts}@example.test`, lead_source: "referral",
    }).select().single();
    if (contact?.id) {
      contactIds.push(contact.id);
      await svc.from("crm_interactions").insert({ contact_id: contact.id, interaction_type: "call", summary: "Intro call" });
      const conv = await post(`/api/crm/contacts/${contact.id}/convert`, {}, token);
      const newLeadId = conv.body?.lead?.id;
      if (newLeadId) leadIds.push(newLeadId);
      const { data: inter } = await svc.from("crm_interactions").select("lead_id").eq("contact_id", contact.id);
      if (conv.status === 200 && newLeadId && (inter || []).every(i => i.lead_id === newLeadId)) {
        run.pass("W1B-03 convert backfills crm_interactions.lead_id");
      } else {
        run.fail("W1B-03 convert backfills crm_interactions.lead_id", `convert ${conv.status}, interactions ${JSON.stringify(inter)}`);
      }
    } else {
      run.fail("W1B-03 setup", "could not create test contact");
    }
  } finally {
    for (const id of contactIds) {
      await svc.from("crm_interactions").delete().eq("contact_id", id);
      await svc.from("crm_contacts").delete().eq("id", id);
    }
    for (const id of leadIds) {
      await svc.from("lead_signals").delete().eq("lead_id", id);
      await svc.from("lead_activities").delete().eq("lead_id", id);
      await svc.from("crm_interactions").delete().eq("lead_id", id);
      await svc.from("leads").delete().eq("id", id);
    }
  }
}
