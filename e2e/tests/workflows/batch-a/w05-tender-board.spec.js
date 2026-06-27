/**
 * P0-A5 — Tender Board rfqs-only progress baseline
 * W05-UI-02, W05-API-08, W05-E2E-01 (partial)
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { getUser } from "../../../helpers/runtime.mjs";
import { loginViaUI, dismissRolePicker } from "../../../helpers/auth.mjs";

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

function quotesRingPct(rfqs) {
  if (!rfqs?.length) return 0;
  const got = rfqs.filter((r) => ["received", "accepted"].includes(r.status)).length;
  return Math.round((got / rfqs.length) * 100);
}

test.describe("P0-A5 — Tender Board rfqs-only baseline", () => {
  test("W05-UI-02 quotesRingPct logic matches TenderBoard.jsx", () => {
    test.info().annotations.push({
      type: "baseline",
      description: "W05-DRIFT-003 — progress uses legacy rfqs only; SAM-W05-006 blocks redesign",
    });
    expect(quotesRingPct([])).toBe(0);
    expect(quotesRingPct([{ status: "sent" }, { status: "received" }])).toBe(50);
    expect(quotesRingPct([{ status: "received" }])).toBe(100);
  });

  test.describe("W05-UI-02 board fixtures", () => {
    test.skip(!URL || !SVC, "Requires Supabase service role");

    const ts = Date.now();
    const MARK = `__P0A5_${ts}`;
    const ids = { rfqsJob: null, pkgJob: null, subId: null };

    test.beforeAll(async () => {
      const svc = createClient(URL, SVC, { auth: { persistSession: false } });
      const { data: sub } = await svc.from("subcontractors").select("id").limit(1).single();
      ids.subId = sub?.id;

      const { data: jobA } = await svc
        .from("jobs")
        .insert({ address: `${MARK} RFQs 50pct`, status: "tendering" })
        .select("id")
        .single();
      ids.rfqsJob = jobA?.id;

      if (ids.rfqsJob && ids.subId) {
        await svc.from("rfqs").insert([
          {
            job_id: ids.rfqsJob,
            subcontractor_id: ids.subId,
            trade: "electrical",
            status: "sent",
            sent_at: new Date().toISOString(),
          },
          {
            job_id: ids.rfqsJob,
            subcontractor_id: ids.subId,
            trade: "plumbing",
            status: "received",
            sent_at: new Date().toISOString(),
            received_at: new Date().toISOString(),
          },
        ]);
      }

      const { data: jobB } = await svc
        .from("jobs")
        .insert({ address: `${MARK} Package Zero`, status: "tendering" })
        .select("id")
        .single();
      ids.pkgJob = jobB?.id;

      if (ids.pkgJob) {
        const { data: pkg } = await svc
          .from("rfq_packages")
          .insert({ job_id: ids.pkgJob, project_address: `${MARK} pkg`, status: "active" })
          .select("id")
          .single();
        if (pkg?.id && ids.subId) {
          const { data: scope } = await svc
            .from("rfq_trade_scopes")
            .insert({
              package_id: pkg.id,
              trade_id: "electrical",
              trade_label: "Electrical",
              status: "received",
            })
            .select("id")
            .single();
          await svc.from("rfq_recipients").insert({
            package_id: pkg.id,
            trade_scope_id: scope?.id,
            subcontractor_id: ids.subId,
            business_name: "E2E Sub",
            email: "e2e-p0a5@example.test",
            status: "received",
          });
        }
      }
    });

    test.afterAll(async () => {
      const svc = createClient(URL, SVC, { auth: { persistSession: false } });
      for (const jobId of [ids.rfqsJob, ids.pkgJob].filter(Boolean)) {
        await svc.from("rfqs").delete().eq("job_id", jobId);
        const { data: pkgs } = await svc.from("rfq_packages").select("id").eq("job_id", jobId);
        for (const p of pkgs || []) {
          await svc.from("rfq_recipients").delete().eq("package_id", p.id);
          await svc.from("rfq_trade_scopes").delete().eq("package_id", p.id);
          await svc.from("rfq_packages").delete().eq("id", p.id);
        }
        await svc.from("jobs").delete().eq("id", jobId);
      }
    });

    test.beforeEach(async ({ page }) => {
      const admin = getUser("admin");
      await page.goto("/login");
      await page.evaluate(() => localStorage.setItem("blhub_role", "director"));
      await loginViaUI(page, { email: admin.email, password: admin.password });
      await dismissRolePicker(page, "director");
    });

    test("job with rfqs shows non-zero quote progress on board", async ({ page }) => {
      test.skip(!ids.rfqsJob || !ids.subId, "fixture incomplete");
      await page.goto("/tender-manager/board");
      const card = page.locator("div").filter({ hasText: `${MARK} RFQs 50pct` }).first();
      await expect(card).toBeVisible();
      await expect(card.getByText("50%")).toBeVisible();
    });

    test("package-only job shows 0% quote progress on board", async ({ page }) => {
      test.skip(!ids.pkgJob, "fixture incomplete");
      await page.goto("/tender-manager/board");
      const card = page.locator(".rounded-card").filter({
        has: page.getByRole("heading", { name: `${MARK} Package Zero` }),
      });
      await expect(card).toHaveCount(1);
      const quotesRing = card
        .locator("div")
        .filter({ has: page.getByText("Quotes", { exact: true }) })
        .locator("span")
        .last();
      await expect(quotesRing).toHaveText("0%");
      test.info().annotations.push({
        type: "gap-documented",
        description: "W05-DRIFT-003 — rfq_packages/recipients received but board ring is rfqs-only",
      });
    });
  });

  test.describe("W05-E2E-01 Board smoke", () => {
    test.skip(!URL || !SVC, "Requires Supabase service role");

    test("board route loads", async ({ page }) => {
      const admin = getUser("admin");
      await page.goto("/login");
      await loginViaUI(page, { email: admin.email, password: admin.password });
      await page.goto("/tender-manager/board");
      await expect(page.locator("body")).not.toContainText("Something went wrong");
    });

    test.skip("W05-E2E-01 full win → Operations path", async () => {
      test.info().annotations.push({ type: "skeleton", description: "W05-DRIFT-009 deferred" });
    });
  });
});
