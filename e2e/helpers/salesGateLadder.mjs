import { mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { expect } from "@playwright/test";
import { apiAsRole } from "./api.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));

/** BLH-PW-SALES-GATE-YYYYMMDD-HHMM */
export function makeSalesGateRunId(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `BLH-PW-SALES-GATE-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export function screenshotDir(runId) {
  const dir = join(__dir, "..", "screenshots", runId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export async function snap(page, runId, name) {
  const dir = screenshotDir(runId);
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
}

export async function cleanupRunLeads(svc, runTag) {
  if (!svc || !runTag) return;
  const { data: leads } = await svc.from("leads").select("id").ilike("email", `%${runTag}%`);
  for (const row of leads || []) {
    await svc.from("lead_conversations").delete().eq("lead_id", row.id);
    await svc.from("lead_notes").delete().eq("lead_id", row.id);
    await svc.from("lead_documents").delete().eq("lead_id", row.id);
    await svc.from("leads").delete().eq("id", row.id);
  }
}

/** Open sticky-header Next panel and click Move to {stageLabel}. */
export async function advanceToStage(page, stageLabel) {
  const details = page.locator("details").filter({
    has: page.locator("summary").filter({ hasText: `Next: ${stageLabel}` }),
  }).first();
  await details.locator("summary").click();
  await details.evaluate((el) => {
    if (!el.open) el.open = true;
  });
  const moveBtn = details.getByRole("button", { name: new RegExp(`Move to ${stageLabel}`, "i") });
  await moveBtn.waitFor({ state: "visible" });
  await moveBtn.click();
  await page.waitForTimeout(800);
}

export async function openNextPanel(page, stageLabel) {
  const details = page.locator("details").filter({
    has: page.locator("summary").filter({ hasText: `Next: ${stageLabel}` }),
  }).first();
  await details.locator("summary").click();
  await details.evaluate((el) => {
    if (!el.open) el.open = true;
  });
  return details;
}

export async function fillScorecardStrong(page) {
  const card = page.locator(".rounded-card").filter({ hasText: "Do this now" }).first()
    .locator(".rounded-card").filter({ hasText: "Qualifying Scorecard" });
  const gates = card.locator("div.space-y-3 > div.space-y-1");

  await gates.nth(0).getByRole("button", { name: "Yes", exact: true }).click();
  await page.waitForTimeout(400);
  await gates.nth(1).getByRole("button", { name: "< 6 months", exact: true }).click();
  await page.waitForTimeout(400);
  await gates.nth(2).getByRole("button", { name: "Owns site", exact: true }).click();
  await page.waitForTimeout(400);
  await gates.nth(3).getByRole("button", { name: "Yes", exact: true }).click();
  await page.waitForTimeout(400);

  await expect
    .poll(async () => {
      const t = await card.locator(".text-sm.font-bold").first().textContent();
      return parseInt(t || "0", 10);
    }, { timeout: 10000 })
    .toBeGreaterThanOrEqual(5);
}

export async function advanceViaFocusPanel(page, stageLabel) {
  const focus = page.locator(".rounded-card").filter({ hasText: "Do this now" }).first();
  const moveBtn = focus.getByRole("button", { name: new RegExp(`Move to ${stageLabel}`, "i") });
  await expect(moveBtn).toBeEnabled({ timeout: 15_000 });
  await moveBtn.click();
  await page.waitForTimeout(800);
}

export async function fillStageWorkTextarea(page, placeholder, value) {
  const leadFile = page.locator("details").filter({ hasText: "Lead file" });
  const field = leadFile.getByPlaceholder(placeholder);
  await field.scrollIntoViewIfNeeded();
  await field.fill(value);
  await field.blur();
  await page.waitForTimeout(600);
}

export async function fillInlineFieldInBlock(page, blockTitle, label, value) {
  const leadFile = page.locator("details").filter({ hasText: "Lead file" });
  const block = leadFile.locator(".rounded-card").filter({ hasText: blockTitle });
  const row = block.getByText(label, { exact: true }).locator("..");
  await row.getByRole("button").click();
  const input = row.locator("input").first();
  await input.fill(value);
  await input.press("Enter");
  await page.waitForTimeout(600);
}

export async function waitForLeadStage(_page, leadId, stage) {
  await expect
    .poll(async () => {
      const { body } = await apiAsRole("admin", `/api/sales/leads/${leadId}`);
      return body?.lead?.stage;
    }, { timeout: 15_000 })
    .toBe(stage);
}

export async function waitForLeadDetailReady(page) {
  await expect(page.locator("body")).not.toContainText("Invalid or expired session", { timeout: 20_000 });
  await expect(page.getByText("Lead file")).toBeVisible({ timeout: 20_000 });
}

export async function editLeadFileField(page, label, value) {
  const drawer = page.locator("details").filter({ hasText: "Lead file" });
  const row = drawer.getByText(label, { exact: true }).locator("..");
  await row.scrollIntoViewIfNeeded();
  await row.getByRole("button").first().click();
  const input = row.locator("input, textarea").first();
  await input.fill(value);
  await input.press("Enter");
  await page.waitForTimeout(600);
}

export async function editLeadFileDateField(page, label, isoDate) {
  const drawer = page.locator("details").filter({ hasText: "Lead file" });
  const row = drawer.getByText(label, { exact: true }).locator("..");
  await row.scrollIntoViewIfNeeded();
  const editBtn = row.getByRole("button").first();
  await editBtn.click();
  const input = row.locator('input[type="date"]');
  await input.waitFor({ state: "visible" });
  await input.fill(isoDate);
  await input.press("Enter");
  await page.waitForTimeout(800);
}
