/**
 * W01-E2E-02 — Pipeline display name fallback (P0-A1)
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { getUser } from "../../../helpers/runtime.mjs";
import { loginViaUI, dismissRolePicker } from "../../../helpers/auth.mjs";

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.describe("W01-E2E-02 Pipeline display name", () => {
  test.skip(!URL || !SVC, "Requires Supabase service role");

  const ts = Date.now();
  const MARK = `__E2E_W01_${ts}`;
  let leadId = null;

  test.beforeAll(async () => {
    const svc = createClient(URL, SVC, { auth: { persistSession: false } });
    const { data } = await svc
      .from("leads")
      .insert({
        name: `${MARK} Website Lead`,
        email: `w01-e2e-${ts}@example.test`,
        stage: "enquiry",
        lead_source: "website",
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

  test("website lead name-only lead shows on pipeline", async ({ page }) => {
    await page.goto("/sales");
    await expect(page).toHaveURL(/\/sales/);

    await expect(page.getByText(`${MARK} Website Lead`)).toBeVisible({ timeout: 15000 });
  });
});
