/**
 * PLAYWRIGHT-SALES-GATE-LADDER-01
 *
 * Browser regression for sales stage-gate ladder (Enquiry → Fee Proposal).
 * Mirrors manual path from E2E_FULL_WALKTHROUGH_BLH-E2E-20260627-1041.md
 *
 * W01 convert/address gate: API-only (no Dropbox convert).
 * W02-DRIFT-006: advisory scorecard only — no hard-block assertions beyond current UI.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { getUser } from "../../helpers/runtime.mjs";
import { loginViaUI, dismissRolePicker } from "../../helpers/auth.mjs";
import { apiAsRole } from "../../helpers/api.mjs";
import {
  makeSalesGateRunId,
  snap,
  cleanupRunLeads,
  advanceToStage,
  advanceViaFocusPanel,
  fillScorecardStrong,
  fillStageWorkTextarea,
  fillInlineFieldInBlock,
  editLeadFileField,
  editLeadFileDateField,
  waitForLeadDetailReady,
  waitForLeadStage,
  openNextPanel,
} from "../../helpers/salesGateLadder.mjs";

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

const RUN_ID = makeSalesGateRunId();
const RUN_TAG = RUN_ID;
const CLIENT = {
  firstName: "Amelia",
  lastName: "Hartley",
  email: `amelia.hartley+${RUN_TAG}@example.test`,
  phone: "0412 555 019",
  suburb: "Norwood",
  projectType: "Extension",
  budget: "950000",
  source: "Referral",
};
const PROJECT_TITLE = `BLH PLAYWRIGHT TEST — Norwood Alteration & Addition — ${RUN_TAG}`;
const SITE_ADDRESS = "14 Jarrah Street, Norwood SA 5067";
const DISCOVERY_NOTES =
  "Architect-referred client. Rear extension + kitchen/living renovation. Upper ensuite. External cladding and roofing. Windows and weatherproofing in scope. Landscaping excluded.";
const SCOPE_NOTE =
  "Rear extension, kitchen/living renovation, upper-level ensuite, external cladding, roofing, windows, weatherproofing — landscaping excluded.";

test.describe.serial("PLAYWRIGHT-SALES-GATE-LADDER-01 — sales stage ladder", () => {
  test.skip(!URL || !SVC, "Requires Supabase service role");

  let leadId = null;

  test.beforeAll(async () => {
    const svc = createClient(URL, SVC, { auth: { persistSession: false } });
    await cleanupRunLeads(svc, RUN_TAG);
  });

  test.afterAll(async () => {
    const svc = createClient(URL, SVC, { auth: { persistSession: false } });
    await cleanupRunLeads(svc, RUN_TAG);
  });

  test.beforeEach(async ({ page }) => {
    const admin = getUser("admin");
    await page.goto("/login");
    await page.evaluate(() => localStorage.setItem("blhub_role", "director"));
    await loginViaUI(page, { email: admin.email, password: admin.password });
    await dismissRolePicker(page, "director");
  });

  test("Enquiry → Fee Proposal stage-gate ladder + address gate", async ({ page }) => {
    test.info().annotations.push({ type: "run_id", description: RUN_ID });

    // ── 1. Create lead from Sales Pipeline UI ─────────────────────────
    await page.goto("/sales");
    await expect(page).toHaveURL(/\/sales/);
    await snap(page, RUN_ID, "01-sales-pipeline");

    await page.getByRole("button", { name: /Add Lead/i }).click();
    await expect(page.getByRole("heading", { name: "New Lead" })).toBeVisible();

    const panel = page.locator(".max-w-md").filter({ has: page.getByRole("heading", { name: "New Lead" }) });
    const textInputs = panel.locator('input:not([type="number"]):not([type="email"]):not([type="tel"])');
    await textInputs.nth(0).fill(CLIENT.firstName);
    await textInputs.nth(1).fill(CLIENT.lastName);
    await panel.locator('input[type="email"]').fill(CLIENT.email);
    await panel.locator('input[type="tel"]').fill(CLIENT.phone);
    await textInputs.nth(2).fill(CLIENT.suburb);
    await panel.locator("select").nth(0).selectOption({ label: CLIENT.projectType });
    await panel.locator('input[type="number"]').fill(CLIENT.budget);
    await panel.locator("select").nth(1).selectOption({ label: CLIENT.source });
    await panel.locator("select").nth(1).selectOption({ label: CLIENT.source });
    const createWait = page.waitForResponse(
      (r) => r.url().includes("/api/sales/leads") && r.request().method() === "POST" && r.status() === 200,
    );
    await panel.getByRole("button", { name: "Add Lead" }).click();
    const createResp = await createWait;
    const created = await createResp.json();
    leadId = created?.lead?.id;
    expect(leadId).toBeTruthy();

    await expect(page.getByText(`${CLIENT.firstName} ${CLIENT.lastName}`)).toBeVisible({ timeout: 15000 });
    await snap(page, RUN_ID, "02-lead-on-pipeline");

    // ── 2. Open LeadDetail ────────────────────────────────────────────
    const detailWait = page.waitForResponse(
      (r) => r.url().includes(`/api/sales/leads/${leadId}`) && r.request().method() === "GET" && r.status() === 200,
    );
    await page.goto(`/sales/${leadId}`);
    await detailWait;
    await waitForLeadDetailReady(page);
    await expect(page).toHaveURL(new RegExp(`/sales/${leadId}`));

    await expect(page.getByText("Enquiry", { exact: true }).first()).toBeVisible();
    await snap(page, RUN_ID, "03-lead-detail-enquiry");

    // Core fields in Lead file
    const leadFile = page.locator("details").filter({ hasText: "Lead file" });
    await expect(leadFile.getByText(CLIENT.email)).toBeVisible();
    await expect(leadFile.getByText(CLIENT.phone)).toBeVisible();

    // ── 3. Enquiry → Qualify (no gate) ───────────────────────────────
    await advanceToStage(page, "Qualify");
    await expect(page.getByText("Qualify", { exact: true }).first()).toBeVisible();
    await snap(page, RUN_ID, "04-stage-qualify");

    // Outcome stamps must not misfire
    let { body: leadSnap } = await apiAsRole("admin", `/api/sales/leads/${leadId}`);
    expect(leadSnap?.lead?.wonAt ?? leadSnap?.lead?.won_at).toBeFalsy();
    expect(leadSnap?.lead?.lostAt ?? leadSnap?.lead?.lost_at).toBeFalsy();

    // ── 4. Qualify → Discovery (score ≥ 5 gate) ─────────────────────
    await expect(page.getByText("Qualify", { exact: true }).first()).toBeVisible();
    const nextDiscovery = await openNextPanel(page, "Discovery");
    await expect(nextDiscovery.getByText("Qualifying score ≥ 5")).toBeVisible();
    const moveDiscovery = nextDiscovery.getByRole("button", { name: /Move to Discovery/i });
    await expect(moveDiscovery).toBeDisabled();

    await fillScorecardStrong(page);
    await snap(page, RUN_ID, "05-scorecard-filled");

    await expect(moveDiscovery).toBeEnabled({ timeout: 10000 });
    await moveDiscovery.click();
    await waitForLeadStage(page, leadId, "discovery");
    await page.reload();
    await waitForLeadDetailReady(page);
    await expect(page.getByText("Do this now · Discovery")).toBeVisible();
    await snap(page, RUN_ID, "06-stage-discovery");

    const startDate = "2026-09-01";
    await fillStageWorkTextarea(page, "What did you learn in the discovery meeting?", DISCOVERY_NOTES);
    await fillStageWorkTextarea(page, /4 bed, alfresco/i, "Rear extension priority; ensuite upstairs; landscaping out of scope.");

    await leadFile.getByText("Design stage", { exact: true }).locator("..").locator("select").selectOption({ label: "Concept" });
    await editLeadFileDateField(page, "Desired start", startDate);

    await expect
      .poll(async () => {
        const { body } = await apiAsRole("admin", `/api/sales/leads/${leadId}`);
        const lead = body?.lead;
        return {
          notes: lead?.discoveryNotes ?? lead?.discovery_notes,
          design: lead?.designStage ?? lead?.design_stage,
          start: lead?.desiredStartDate ?? lead?.desired_start_date,
        };
      }, { timeout: 15000 })
      .toMatchObject({
        notes: expect.any(String),
        design: expect.any(String),
        start: expect.any(String),
      });

    await snap(page, RUN_ID, "07-discovery-fields");

    const nextWinning = await openNextPanel(page, "Winning Offer");
    await expect(nextWinning.getByText("Discovery notes filled")).toBeVisible();
    const moveWinning = nextWinning.getByRole("button", { name: /Move to Winning Offer/i });
    await expect(moveWinning).toBeEnabled({ timeout: 10000 });
    await moveWinning.click();
    await waitForLeadStage(page, leadId, "winning_offer");
    await page.reload();
    await waitForLeadDetailReady(page);
    await snap(page, RUN_ID, "08-stage-winning-offer");

    await fillInlineFieldInBlock(page, "Winning Offer", "Pre-construction fee", "15000");

    const nextFee = await openNextPanel(page, "Fee Proposal");
    const moveFee = nextFee.getByRole("button", { name: /Move to Fee Proposal/i });
    await expect(moveFee).toBeEnabled({ timeout: 10000 });
    await moveFee.click();
    await waitForLeadStage(page, leadId, "fee_proposal");
    await page.reload();
    await waitForLeadDetailReady(page);
    await snap(page, RUN_ID, "09-stage-fee-proposal");

    // PTSA warnings (PTSA-WARNING-01 / scope gate)
    await expect(page.getByText(/Scope not set/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Mark PTSA as signed/i }).first()).toBeDisabled();

    // ── 7. W01 address gate — no site_address ───────────────────────
    ({ body: leadSnap } = await apiAsRole("admin", `/api/sales/leads/${leadId}`));
    expect(leadSnap?.lead?.siteAddress ?? leadSnap?.lead?.site_address ?? null).toBeFalsy();

    const convertBlocked = await apiAsRole("admin", `/api/sales/leads/${leadId}/convert-to-job`, {
      method: "POST",
      body: {},
    });
    expect(convertBlocked.status).toBe(400);
    await snap(page, RUN_ID, "10-convert-blocked-no-address");

    // ── 8. Set site_address — gate unblocks (no live convert) ───────
    await editLeadFileField(page, "Site address", SITE_ADDRESS);
    ({ body: leadSnap } = await apiAsRole("admin", `/api/sales/leads/${leadId}`));
    expect(leadSnap?.lead?.siteAddress ?? leadSnap?.lead?.site_address).toContain("Jarrah");

    // Advance to Accepted via focus panel (sticky Next hidden at fee_proposal)
    await advanceViaFocusPanel(page, "Accepted");
    await waitForLeadStage(page, leadId, "accepted");
    await page.reload();
    await waitForLeadDetailReady(page);
    await expect(page.getByText("Do this now · Accepted")).toBeVisible();

    const createJobBtn = page.getByRole("button", { name: /Create Job from Lead/i }).first();
    await expect(createJobBtn).toBeEnabled();
    await snap(page, RUN_ID, "11-site-address-gate-open");

    // Do NOT click Create Job — avoids Dropbox side-effect

    // Terminal outcome stamps still clean
    ({ body: leadSnap } = await apiAsRole("admin", `/api/sales/leads/${leadId}`));
    expect(leadSnap?.lead?.wonAt ?? leadSnap?.lead?.won_at).toBeFalsy();
    expect(leadSnap?.lead?.lostAt ?? leadSnap?.lead?.lost_at).toBeFalsy();
    expect(leadSnap?.lead?.jobId ?? leadSnap?.lead?.job_id).toBeFalsy();

    await snap(page, RUN_ID, "12-ladder-complete");
  });
});
