// @ts-check
// Hub review HUB 028 — Walls (trace once, studs + plates + noggins together), UI Review Mode (mocked backend).
// Plan: docs/hub_review/WALLS_FRAMING_PLAN.md. Step 2 (material and registry): the review mock keeps a Walls item the
// way the REAL server does (scripts/tests/takeoff-api.test.mjs "HUB 028 step 2") — the normalised spec with its four
// parts (Long plates = 90 × 45 LVL), junk dropped — and refuses a measurement a Walls item can't read (walls only).
// The Add walls flow and the Walls card arrive in steps 4 and 5.
import { test, expect } from "@playwright/test";
import { normaliseFamilySpec, wallFramingDefaults } from "../../shared/takeoff/index.js";

async function ready(page) {
  await page.waitForFunction(() => document.documentElement.getAttribute("data-ui-review-ready") === "true", null, { timeout: 30_000 }).catch(() => {});
}
/** One save through the fake server's own commit endpoint (as the app sends it). */
const commit = (page, changes, key) => page.evaluate(async ({ changes, key }) => {
  const ws = await (await fetch("/api/takeoff/workspaces/ws-1")).json();
  const r = await fetch("/api/takeoff/workspaces/ws-1/commit", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expectedRevision: ws.snapshot.workspace.revision, idempotencyKey: key, changes }) });
  return { status: r.status, body: await r.json(), before: ws.snapshot.workspace.revision };
}, { changes, key });
const snapshot = (page) => page.evaluate(async () => (await (await fetch("/api/takeoff/workspaces/ws-1")).json()).snapshot);

test("HUB 028 step 2: the mock keeps a Walls item like the server (normalised parts) and refuses a measurement Walls can't read", async ({ page }) => {
  await page.goto("/carpentry/cjb-1/takeoff?reviewRole=admin");
  await ready(page);
  const spec = wallFramingDefaults([]);
  const sent = { ...spec, junk: "x", spareRate: 10, components: { ...spec.components, extra: { section: { depthMm: 1 } },
    noggins: { ...spec.components.noggins, treatment: " H2 ", stock: { maxMm: 5400, unavailableMm: [4800, 4850] } } } };
  const walls = { id: "mat-walls", name: "Walls", methodKey: "wall_framing", methodVersion: 1, spec: sent, rules: { centresMm: 600, doubleTopPlate: false }, profile: null };
  const ok = await commit(page, {
    materials: { upsert: [walls] },
    measurements: { upsert: [{ id: "w-1", kind: "wall", inputs: { kind: "rect", widthMm: 6000, heightMm: 2700, name: "Wall 1" } }] },
    contributions: { upsert: [{ id: "c-w-1", measurementId: "w-1", jobMaterialId: "mat-walls", role: "wall" }] } }, "hub028-s2-seed");
  expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  const kept = (await snapshot(page)).materials.find((m) => m.id === "mat-walls");
  expect(kept.spec).toEqual(normaliseFamilySpec(sent));
  expect(Object.keys(kept.spec.components)).toEqual(["studs", "plates", "longPlates", "noggins"]);
  expect(kept.spec.components.noggins.stock).toEqual({ maxMm: 5400, unavailableMm: [4800] });
  expect([kept.spec.components.longPlates.grade, kept.spec.components.longPlates.stock.maxMm, kept.spec.spareRate, kept.spec.junk]).toEqual(["LVL", 11000, 0, undefined]);
  expect(kept.rules).toEqual({ centresMm: 600, doubleTopPlate: false });
  // an entered length on Walls: the server's own message, and nothing saved
  const before = (await snapshot(page)).workspace.revision;
  const bad = await commit(page, {
    measurements: { upsert: [{ id: "m-len", kind: "manual", finishedLengthMm: 2400, quantity: 2 }] },
    contributions: { upsert: [{ id: "c-len", measurementId: "m-len", jobMaterialId: "mat-walls", role: "primary" }] } }, "hub028-s2-bad");
  expect(bad.status).toBe(400);
  expect(bad.body.error).toBe("Walls can't use a manual measurement — assign it to the right material.");
  const after = await snapshot(page);
  expect(after.workspace.revision).toBe(before);
  expect(after.measurements.some((m) => m.id === "m-len")).toBe(false);
  // a broken part is refused like the server's cleaner, naming the part
  const broken = await commit(page, { materials: { upsert: [{ ...walls, spec: { ...sent, components: { plates: { section: { depthMm: -90 } } } } }] } }, "hub028-s2-broken");
  expect(broken.status).toBe(400);
  expect(broken.body.error).toBe("Plates: section depth must be a positive number.");
  expect((await snapshot(page)).materials.find((m) => m.id === "mat-walls").spec).toEqual(normaliseFamilySpec(sent));
});
