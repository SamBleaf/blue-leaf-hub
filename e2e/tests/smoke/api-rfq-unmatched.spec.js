import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { apiAsRole, apiFetch } from "../../helpers/api.mjs";

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.describe("RFQ unmatched quote workflow", () => {
  test.skip(!URL || !SVC, "Requires Supabase service role in .env");

  /** @type {import('@supabase/supabase-js').SupabaseClient} */
  let svc;
  const ts = Date.now();
  const MARK = `__E2E_RFQ_${ts}`;
  const created = { jobId: null, packageId: null, rfqId: null, unmatchedId: null, recipientId: null, scopeId: null };

  test.beforeAll(() => {
    svc = createClient(URL, SVC, { auth: { persistSession: false } });
  });

  test.afterAll(async () => {
    if (created.unmatchedId) await svc.from("unmatched_quote_emails").delete().eq("id", created.unmatchedId);
    if (created.packageId) await svc.from("rfq_packages").delete().eq("id", created.packageId);
    if (created.rfqId) await svc.from("rfqs").delete().eq("id", created.rfqId);
    if (created.jobId) await svc.from("jobs").delete().eq("id", created.jobId);
  });

  test("unmatched list requires auth", async () => {
    const { status } = await apiFetch("/api/quote-tracker/unmatched");
    expect(status).toBe(401);
  });

  test("manual resolve propagates to package tables", async () => {
    const { data: sub } = await svc.from("subcontractors").select("id, email").limit(1).single();
    expect(sub?.id).toBeTruthy();

    const { data: job } = await svc
      .from("jobs")
      .insert({ address: `${MARK} Brighton`, status: "tendering" })
      .select("id")
      .single();
    created.jobId = job.id;

    const { data: rfq } = await svc
      .from("rfqs")
      .insert({
        job_id: job.id,
        subcontractor_id: sub.id,
        trade: "electrical",
        status: "sent",
        sent_at: new Date().toISOString()
      })
      .select("id")
      .single();
    created.rfqId = rfq.id;

    const { data: pkg } = await svc
      .from("rfq_packages")
      .insert({ job_id: job.id, project_address: `${MARK} Brighton`, status: "active" })
      .select("id")
      .single();
    created.packageId = pkg.id;

    const { data: scope } = await svc
      .from("rfq_trade_scopes")
      .insert({ package_id: pkg.id, trade_id: "electrical", trade_label: "Electrical", status: "sent" })
      .select("id")
      .single();
    created.scopeId = scope.id;

    const { data: rec } = await svc
      .from("rfq_recipients")
      .insert({
        package_id: pkg.id,
        trade_scope_id: scope.id,
        subcontractor_id: sub.id,
        business_name: "E2E Sub",
        email: sub.email || "e2e@example.com",
        status: "sent",
        rfq_id: rfq.id
      })
      .select("id")
      .single();
    created.recipientId = rec.id;

    const { data: unmatched } = await svc
      .from("unmatched_quote_emails")
      .insert({
        source: "e2e",
        external_id: `e2e-${ts}`,
        from_email: sub.email,
        subject: "E2E quote",
        body_preview: "Quote $10,000 ex GST"
      })
      .select("id")
      .single();
    created.unmatchedId = unmatched.id;

    const list = await apiAsRole("admin", "/api/quote-tracker/unmatched");
    expect(list.status).toBe(200);
    expect((list.body?.items || []).some((i) => i.id === unmatched.id)).toBe(true);

    const resolve = await apiAsRole("admin", "/api/unmatched-quotes/resolve", {
      method: "POST",
      body: { unmatchedId: unmatched.id, rfqId: rfq.id }
    });
    expect(resolve.status).toBe(200);
    expect(resolve.body?.ok).toBe(true);
    created.unmatchedId = null;

    const { data: rfqAfter } = await svc.from("rfqs").select("status").eq("id", rfq.id).single();
    expect(rfqAfter?.status).toBe("received");

    const { data: recAfter } = await svc.from("rfq_recipients").select("status").eq("id", rec.id).single();
    expect(recAfter?.status).toBe("received");

    const { data: uRow } = await svc
      .from("unmatched_quote_emails")
      .select("resolved_at, matched_rfq_id")
      .eq("id", unmatched.id)
      .single();
    expect(uRow?.resolved_at).toBeTruthy();
    expect(uRow?.matched_rfq_id).toBe(rfq.id);
  });
});
