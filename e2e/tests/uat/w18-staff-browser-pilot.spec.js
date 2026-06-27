/**
 * W18-STAFF-BROWSER-PILOT-01 — staff browser UAT on fresh BLH TEST project.
 * Prerequisite: node scripts/uat/w18-staff-browser-pilot-setup.mjs
 */
import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { loginViaUI, dismissRolePicker, logoutViaUI } from "../../helpers/auth.mjs";

const PILOT_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../.uat-browser-pilot.json");

function loadPilot() {
  if (!existsSync(PILOT_PATH)) {
    throw new Error("Missing e2e/.uat-browser-pilot.json — run w18-staff-browser-pilot-setup.mjs first");
  }
  return JSON.parse(readFileSync(PILOT_PATH, "utf8"));
}

async function snap(page, pilot, name) {
  await page.screenshot({ path: join(pilot.screenshotDir, `${name}.png`), fullPage: true });
}

test.describe("W18-STAFF-BROWSER-PILOT-01", () => {
  const pilot = loadPilot();
  const { projectA, projectB, users } = pilot;

  test("01 admin — portal v2 overview", async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(() => localStorage.setItem("blhub_role", "director"));
    await loginViaUI(page, { email: users.admin.email, password: users.admin.password });
    await dismissRolePicker(page, "director");
    await page.goto(`/portal-admin/${projectA.projectId}/v2`);
    await expect(page.getByRole("heading", { name: /Client Portal v2 — Admin/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("body")).toContainText(projectA.address.slice(0, 20), { timeout: 10_000 });
    await expect(page.getByText("Portal v2 enabled (client login)")).toBeVisible();
    await snap(page, pilot, "01-admin-portal-v2");
  });

  test("02 client — login and home", async ({ page }) => {
    await loginViaUI(page, { email: users.client.email, password: users.client.password, expectPath: "/client-portal" });
    await expect(page.locator("body")).not.toContainText("No project linked yet");
    await expect(page.locator("body")).not.toContainText("Something went wrong");
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/SECRET_MARGIN|SECRET_SUPPLIER|cost_to_builder|internal_notes|margin note/i);
    await snap(page, pilot, "02-client-home");
  });

  test("03 client — navigation tabs", async ({ page }) => {
    await loginViaUI(page, { email: users.client.email, password: users.client.password, expectPath: "/client-portal" });
    for (const [path, label] of [
      ["/client-portal/actions", /Actions|My Actions/i],
      ["/client-portal/journey", /Journey|Project Journey/i],
      ["/client-portal/selections", /Selections|Select/i],
      ["/client-portal/documents", /Documents|Docs/i],
      ["/client-portal/messages", /Messages/i],
    ]) {
      await page.goto(path);
      await expect(page.locator("body")).not.toContainText("Something went wrong");
      await expect(page.getByRole("link", { name: label }).first()).toBeVisible({ timeout: 15_000 });
    }
    await snap(page, pilot, "03-client-actions");
  });

  test("04 client — actions and journey content", async ({ page }) => {
    await loginViaUI(page, { email: users.client.email, password: users.client.password, expectPath: "/client-portal" });
    await page.goto("/client-portal/actions");
    await expect(page.locator("body")).toContainText(/Splashback|Variation|Approve/i, { timeout: 15_000 });
    await page.goto("/client-portal/journey");
    await expect(page.locator("body")).toContainText(/Frame|Roof/i, { timeout: 15_000 });
    await expect(page.locator("body")).toContainText(pilot.visibleCaption.slice(0, 30));
    await expect(page.locator("body")).not.toContainText(pilot.hiddenCaption.slice(0, 30));
    await snap(page, pilot, "04-client-journey");
  });

  test("05 client — selections leak scan", async ({ page }) => {
    await loginViaUI(page, { email: users.client.email, password: users.client.password, expectPath: "/client-portal" });
    await page.goto("/client-portal/selections");
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/SECRET_MARGIN|SECRET_SUPPLIER|cost_to_builder|internal_notes/i);
    await snap(page, pilot, "05-client-selections");
  });

  test("06 client — documents when shared", async ({ page }) => {
    await loginViaUI(page, { email: users.client.email, password: users.client.password, expectPath: "/client-portal" });
    await page.goto("/client-portal/documents");
    await expect(page.locator("body")).toContainText(/Building Contract|contract|Documents/i, { timeout: 15_000 });
    await snap(page, pilot, "06-client-documents");
  });

  test("07 client B — isolation from project A", async ({ page }) => {
    await loginViaUI(page, { email: users.clientB.email, password: users.clientB.password, expectPath: "/client-portal" });
    await page.goto("/client-portal");
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("__BLH TEST__ Browser Pilot");
    expect(body).not.toMatch(/Frame & Roof.*Browser Pilot/i);
    await snap(page, pilot, "07-client-b-isolation");
  });

  test("08 client — mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginViaUI(page, { email: users.client.email, password: users.client.password, expectPath: "/client-portal" });
    await page.goto("/client-portal");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 5);
    expect(overflow).toBe(false);
    await snap(page, pilot, "08-client-mobile");
  });

  test("09 client — logout and re-login", async ({ page }) => {
    await loginViaUI(page, { email: users.client.email, password: users.client.password, expectPath: "/client-portal" });
    await logoutViaUI(page);
    await loginViaUI(page, { email: users.client.email, password: users.client.password, expectPath: "/client-portal" });
    await expect(page.locator("body")).not.toContainText("No project linked yet");
    await snap(page, pilot, "09-client-relogin");
  });

  test("10 supervisor — UI blocked from v2 admin route", async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(() => localStorage.setItem("blhub_role", "supervisor"));
    await loginViaUI(page, { email: users.supervisor.email, password: users.supervisor.password });
    await page.goto(`/portal-admin/${projectA.projectId}/v2`);
    await expect(page.getByRole("heading", { name: /Client Portal v2 — Admin/i })).not.toBeVisible({ timeout: 10_000 });
    await snap(page, pilot, "10-supervisor-blocked-ui");
  });
});
