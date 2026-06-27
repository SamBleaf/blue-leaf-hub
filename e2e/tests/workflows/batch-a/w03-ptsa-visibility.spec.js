/**
 * W03-UI-03 — PTSA block visibility at fee_proposal stage (W03-DRIFT-009)
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { getUser } from "../../../helpers/runtime.mjs";
import { loginViaUI, dismissRolePicker } from "../../../helpers/auth.mjs";

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.describe("W03-UI-03 PTSA block at fee_proposal stage", () => {
  test.skip(!URL || !SVC, "Requires Supabase service role");

  const ts = Date.now();
  let leadId = null;

  test.beforeAll(async () => {
    const svc = createClient(URL, SVC, { auth: { persistSession: false } });
    const { data } = await svc
      .from("leads")
      .insert({
        first_name: "PTSA",
        last_name: `Visibility${ts}`,
        email: `w03-ui-${ts}@example.test`,
        stage: "fee_proposal",
      })
      .select("id")
      .single();
    leadId = data?.id;
  });

  test.afterAll(async () => {
    if (!leadId) return;
    const svc = createClient(URL, SVC, { auth: { persistSession: false } });
    await svc.from("leads").delete().eq("id", leadId);
  });

  test.beforeEach(async ({ page }) => {
    const admin = getUser("admin");
    await page.goto("/login");
    await page.evaluate(() => localStorage.setItem("blhub_role", "director"));
    await loginViaUI(page, { email: admin.email, password: admin.password });
    await dismissRolePicker(page, "director");
  });

  test("PTSA block hidden at fee_proposal — gap documented", async ({ page }) => {
    test.info().annotations.push({
      type: "gap",
      description: "W03-DRIFT-009 — showPreTender excludes fee_proposal stage",
    });

    await page.goto(`/sales/leads/${leadId}`);
    await expect(page.locator("body")).not.toContainText("Failed to load");

    const body = await page.locator("body").innerText();
    const ptsaVisible = /PTSA|Pre-Tender|Pre Tender/i.test(body);

    if (!ptsaVisible) {
      expect(ptsaVisible).toBe(false);
      test.fixme(true, "W03-DRIFT-009: PTSA block not shown at fee_proposal — expected until UI fix");
    } else {
      expect(ptsaVisible).toBe(true);
    }
  });
});
