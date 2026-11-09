/**
 * r05-walkthrough.spec.mjs — Scenario 12: the same lead on a desktop and at phone width, through each stage and each Register step (R05 P7).
 * Run only through scripts/dev/register-sandbox/playwright.sandbox.config.mjs, which refuses anything but the loopback sandbox.
 * Screenshots: ~/blh-register-evidence/r05/p7/
 */
import { readFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { buildTestJobAddress } from "../../lib/testArtifactPrefixes.mjs";
import { makeRoom, emptyMeta, makeItem } from "../../../src/lib/register.js";

const GW = "http://localhost:54321", API = "http://localhost:8797";
const SB = join(homedir(), ".blh-register-sandbox");
const secrets = JSON.parse(readFileSync(join(SB, "secrets.json"), "utf8"));
const creds = JSON.parse(readFileSync(join(SB, "credentials.local.json"), "utf8"));
const EVIDENCE = join(homedir(), "blh-register-evidence", "r05", "p7");
mkdirSync(EVIDENCE, { recursive: true });
const svc = createClient(GW, secrets.service_key, { auth: { persistSession: false } });
const NOW = new Date().toISOString();
const FACTS = { qualify_budget: 2, qualify_timeframe: 2, qualify_site: 2, qualify_decision_maker: 2, discovery_meeting_booked_at: NOW, concept_agreement_status: "accepted" };
const STAGES = ["enquiry", "qualify", "discovery", "winning_offer", "fee_proposal", "consultants", "tender", "won"];
const STEPS = ["context", "whole_house", "site", "rooms", "register", "documents"];

let session, leadId;
const by = (page, id) => page.getByTestId(id).filter({ visible: true });
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const offenders = (page) => page.evaluate(() => [...document.querySelectorAll("#root *")].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && e.getClientRects().length && !e.closest(".overflow-x-auto")).slice(0, 5).map((e) => `${e.tagName}.${String(e.className).slice(0, 60)}`));

test.beforeAll(async () => {
  const { data } = await createClient(GW, secrets.anon_key, { auth: { persistSession: false } }).auth.signInWithPassword({ email: creds.staff.email, password: creds.staff.password });
  session = data.session;
  const headers = { authorization: `Bearer ${session.access_token}`, "content-type": "application/json" };
  const created = await (await fetch(`${API}/api/sales/leads`, { method: "POST", headers, body: JSON.stringify({ first_name: "Walk", last_name: "Through", name: `Walk Through ${Date.now()}`, email: `walk-${Date.now()}@example.invalid`, phone: "0400 000 000", site_address: buildTestJobAddress({ suite: "R05-WALK", workflowId: String(Date.now()) }), suburb: "Stirling", project_type: "renovation", lead_source: "referral" }) })).json();
  leadId = created.lead.id;
  const bed = makeRoom({ id: "wt_bed", name: "Bed 1", roomType: "bedroom", order: 0, scope: "renovated" });
  const floor = makeItem({ itemKind: "selection", category: "flooring", promptKey: "W-017", section: "project", isDefault: true, certainty: "preference", answer: { v: 1, state: "recorded", nature: "choice", zone: { key: "bedroom_floor", label: "Bedrooms" }, selected: [{ optionId: "carpet", path: ["carpet"], label: "Carpet" }] } });
  await fetch(`${API}/api/register/leads/${leadId}`, { method: "PUT", headers, body: JSON.stringify({ meta: { ...emptyMeta({ planRev: "Rev A", renovationOverlay: true, rooms: [bed] }), rev: 0 }, changes: [floor] }) });
  await svc.from("leads").update(FACTS).eq("id", leadId);
});

test.beforeEach(async ({ context }) => {
  await context.addInitScript(([k, v]) => localStorage.setItem(k, v), ["sb-localhost-auth-token", JSON.stringify(session)]);
  await context.route("**/api/blueprint/chat", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, reply: "Stub" }) }));
});

for (const stage of STAGES) {
  test(`Sales stage: ${stage}`, async ({ page }, info) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await svc.from("leads").update({ stage }).eq("id", leadId);
    await page.goto(`/sales/${leadId}`, { waitUntil: "domcontentloaded" });
    await page.locator("#lead-focus").filter({ visible: true }).first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(EVIDENCE, `${info.project.name}-sales-${stage}.png`), fullPage: false });
    expect(await noOverflow(page), (await offenders(page)).join(" | ")).toBe(true);
    expect(errors, errors.join(" | ")).toEqual([]);
    if (stage !== "won") expect(await page.getByRole("button", { name: /^Move to/ }).filter({ visible: true }).count(), "exactly one way forward").toBe(1);
  });
}

for (const step of STEPS) {
  test(`Register step: ${step}`, async ({ page }, info) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await svc.from("leads").update({ stage: "winning_offer" }).eq("id", leadId);
    await page.goto(`/sales/${leadId}`, { waitUntil: "domcontentloaded" });
    await by(page, "register-workshop").first().waitFor({ timeout: 60000 });
    if (await by(page, "continue-brief").count()) await by(page, "continue-brief").first().click();
    await by(page, `step-${step}`).click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(EVIDENCE, `${info.project.name}-register-${step}.png`), fullPage: false });
    expect(await noOverflow(page), (await offenders(page)).join(" | ")).toBe(true);
    expect(errors, errors.join(" | ")).toEqual([]);
  });
}
