/**
 * register-promotion.test.mjs — Master Register R02 · Increment 2 logic tests (no DB).
 *
 * Exercises the REAL server/lib/registerPromotion.mjs against an in-memory fake Supabase that mimics
 * the exact query surface the service uses (.from/.select/.eq/.maybeSingle/.upsert) and honours
 * ON CONFLICT DO NOTHING (ignoreDuplicates). Proves the behaviours that matter most:
 *   • scope-vs-selection partition (the load-bearing client_selections guard),
 *   • promoted selections are STAGED (client_visible=false) and raise NO client_actions / no comms,
 *   • certainty→status mapping, provenance, stable-id keying,
 *   • idempotent re-run (no duplicates).
 *
 * Run: npm run test:register-promotion
 */

import assert from "node:assert/strict";
import { promoteRegisterToProject } from "../../server/lib/registerPromotion.mjs";
import { emptyMeta, makeRoom, makeItem, writeRegister } from "../../src/lib/register.js";

// ── Minimal fake Supabase (service-role surface the promotion uses) ───────────────────────────────
function makeFakeSb(seed = {}) {
  const store = {
    leads: seed.leads ? seed.leads.slice() : [],
    projects: seed.projects ? seed.projects.slice() : [],
    client_selections: [],
    room_scope_items: [],
    client_actions: [], // MUST stay empty — promotion never creates a client-facing action.
  };
  const matches = (r, preds) => preds.every((p) => p(r));
  function from(table) {
    const preds = [];
    let op = "select";
    const api = {
      select() { op = "select"; return api; },
      delete() { op = "delete"; return api; },
      eq(col, val) { preds.push((r) => r[col] === val); return api; },
      in(col, arr) { const s = new Set(arr); preds.push((r) => s.has(r[col])); return api; },
      gte(col, val) { preds.push((r) => r[col] != null && r[col] >= val); return api; },
      order() { return api; },
      limit() { return api; },
      not(col, operator, val) {
        if (operator === "is" && val === null) preds.push((r) => r[col] != null);
        else if (operator === "in") { const s = new Set(val); preds.push((r) => !s.has(r[col])); }
        else preds.push((r) => r[col] !== val);
        return api;
      },
      async maybeSingle() {
        const rows = (store[table] || []).filter((r) => matches(r, preds));
        return { data: rows[0] || null, error: null };
      },
      async upsert(rows, opts = {}) {
        const list = Array.isArray(rows) ? rows : [rows];
        const key = String(opts.onConflict || "").split(",").map((s) => s.trim()).filter(Boolean);
        for (const row of list) {
          if (opts.ignoreDuplicates && key.length) {
            const dup = store[table].some((r) => key.every((k) => r[k] === row[k]));
            if (dup) continue; // ON CONFLICT DO NOTHING
          }
          store[table].push({ ...row });
        }
        return { error: null };
      },
      async insert(rows) {
        const list = Array.isArray(rows) ? rows : [rows];
        for (const r of list) store[table].push({ ...r });
        return { error: null };
      },
      // Thenable — awaiting the builder (no .maybeSingle) runs a select, or a delete when .delete() was called.
      then(resolve) {
        if (op === "delete") {
          store[table] = (store[table] || []).filter((r) => !matches(r, preds));
          resolve({ data: null, error: null });
        } else {
          resolve({ data: (store[table] || []).filter((r) => matches(r, preds)), error: null });
        }
      },
    };
    return api;
  }
  return { from, __store: store };
}

// Flip the stored register item's fields (simulate staff reclassifying between promotion runs).
function setItem(lead, id, patch) {
  const row = (lead.selections_schedule || []).find((r) => r.kind === "item" && r.id === id);
  if (row) Object.assign(row, patch);
}
function singleItemLead(itemKind, disposition) {
  const room = makeRoom({ name: "Kitchen", roomType: "kitchen", scope: "renovated" });
  const item = makeItem({ id: "ri_x", itemKind, roomId: room.id, category: "appliances", description: "Appliances", disposition });
  return { id: "lead-x", job_id: "job-x", stage: "consultants", selections_schedule: writeRegister({ meta: emptyMeta({ rooms: [room] }), items: [item] }) };
}

// ── Fixture: one lead whose register covers every partition case ──────────────────────────────────
function fixtureLead() {
  const kitchen = makeRoom({ name: "Kitchen", roomType: "kitchen", scope: "renovated", level: "Ground" });
  const bath = makeRoom({ name: "Bathroom", roomType: "bathroom", scope: "renovated", level: "Ground" });
  const meta = emptyMeta({ planRev: "DA-02", rooms: [kitchen, bath], renovationOverlay: true });

  const items = [
    // CHOICES → client_selections (staged)
    makeItem({ itemKind: "selection", roomId: kitchen.id, category: "flooring", description: "Engineered oak", certainty: "client_approved", evidence: { at: "2026-10-01T00:00:00.000Z", by: "sam" }, product: "Oak XL", colour: "Natural" }),
    makeItem({ itemKind: "selection", roomId: kitchen.id, category: "benchtop", description: "Stone benchtop", certainty: "proposed" }),
    makeItem({ itemKind: "selection", roomId: bath.id, category: "tiling", description: "Floor + wall tiles", certainty: "not_considered" }),
    makeItem({ itemKind: "selection", roomId: null, category: "flooring", description: "Default flooring standard", certainty: "preference", isDefault: true }),
    // SCOPE / WORKS → room_scope_items
    makeItem({ itemKind: "scope", roomId: kitchen.id, category: "scope", description: "Demolish dividing wall", disposition: "remove" }),
    makeItem({ itemKind: "scope", roomId: bath.id, category: "tiling", description: "Waterproof + vent", disposition: "new", nextAction: "Confirm fall to waste" }),
    // SETTLED-OUT SELECTIONS → room_scope_items (NEVER client_selections) — load-bearing guard
    makeItem({ itemKind: "selection", roomId: kitchen.id, category: "appliances", description: "Appliances", disposition: "by_others" }),
    makeItem({ itemKind: "selection", roomId: bath.id, category: "sanitary", description: "Spa bath", disposition: "excluded" }),
  ];

  const register = { meta, items };
  // Add a LEGACY finishes row ({area,item,notes}) to prove non-destructive adoption → promotes as a selection.
  const schedule = [...writeRegister(register), { area: "Laundry", item: "Trough + mixer", notes: "client to confirm" }];

  return {
    lead: { id: "lead-1", job_id: "job-1", name: "Jane Client", first_name: "Jane", last_name: "Client", project_type: "renovation", stage: "consultants", selections_schedule: schedule },
    rooms: { kitchen, bath },
    items,
  };
}

// ── Tiny runner ───────────────────────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n    ${e.message}`); }
}

console.log("Master Register R02 · Increment 2 — promotion logic\n");

await test("T-P01 selections promote to client_selections; scope + settled-out go to room_scope_items", async () => {
  const { lead, items } = fixtureLead();
  const sb = makeFakeSb({ leads: [lead], projects: [{ id: "proj-1", job_id: "job-1" }] });
  const r = await promoteRegisterToProject(sb, { leadId: "lead-1", projectId: "proj-1" });
  assert.equal(r.ok, true);
  // Genuine choices: 3 approved/proposed/not_considered + 1 default (preference) + 1 legacy = 5.
  assert.equal(sb.__store.client_selections.length, 5, "expected 5 client_selections");
  // scope: remove + new(bath wp) = 2; settled-out selections: by_others + excluded = 2 → 4.
  assert.equal(sb.__store.room_scope_items.length, 4, "expected 4 room_scope_items");
  assert.equal(r.selections, 5);
  assert.equal(r.scopeItems, 4);
});

await test("T-P02 LOAD-BEARING: no by-others/excluded selection ever reaches client_selections", async () => {
  const { lead, items } = fixtureLead();
  const sb = makeFakeSb({ leads: [lead], projects: [{ id: "proj-1", job_id: "job-1" }] });
  await promoteRegisterToProject(sb, { leadId: "lead-1", projectId: "proj-1" });
  const byOthers = items.find((i) => i.disposition === "by_others");
  const excluded = items.find((i) => i.disposition === "excluded");
  const csIds = new Set(sb.__store.client_selections.map((r) => r.source_register_item_id));
  assert.ok(!csIds.has(byOthers.id), "by_others leaked into client_selections");
  assert.ok(!csIds.has(excluded.id), "excluded leaked into client_selections");
  // They are in room_scope_items, tagged as selection-kind.
  const rsi = sb.__store.room_scope_items.find((r) => r.source_register_item_id === byOthers.id);
  assert.equal(rsi.item_kind, "selection");
  assert.equal(rsi.disposition, "by_others");
});

await test("T-P03 every promoted selection is STAGED (client_visible=false)", async () => {
  const { lead } = fixtureLead();
  const sb = makeFakeSb({ leads: [lead], projects: [{ id: "proj-1", job_id: "job-1" }] });
  await promoteRegisterToProject(sb, { leadId: "lead-1", projectId: "proj-1" });
  assert.ok(sb.__store.client_selections.every((r) => r.client_visible === false), "a promoted selection was visible");
});

await test("T-P04 promotion creates NO client_actions and sends nothing", async () => {
  const { lead } = fixtureLead();
  const sb = makeFakeSb({ leads: [lead], projects: [{ id: "proj-1", job_id: "job-1" }] });
  await promoteRegisterToProject(sb, { leadId: "lead-1", projectId: "proj-1" });
  assert.equal(sb.__store.client_actions.length, 0, "promotion raised a client action");
});

await test("T-P05 certainty → status mapping", async () => {
  const { lead, items } = fixtureLead();
  const sb = makeFakeSb({ leads: [lead], projects: [{ id: "proj-1", job_id: "job-1" }] });
  await promoteRegisterToProject(sb, { leadId: "lead-1", projectId: "proj-1" });
  const byId = Object.fromEntries(sb.__store.client_selections.map((r) => [r.source_register_item_id, r]));
  const approved = items.find((i) => i.certainty === "client_approved");
  const proposed = items.find((i) => i.certainty === "proposed" && i.itemKind === "selection");
  const notConsidered = items.find((i) => i.certainty === "not_considered" && i.itemKind === "selection" && i.disposition === "undecided");
  assert.equal(byId[approved.id].status, "approved");
  assert.equal(byId[proposed.id].status, "in_review");
  assert.equal(byId[notConsidered.id].status, "not_started");
  // client_approved with evidence stamps approved_at.
  assert.equal(byId[approved.id].approved_at, "2026-10-01T00:00:00.000Z");
});

await test("T-P06 provenance + stable-id keying on both stores", async () => {
  const { lead } = fixtureLead();
  const sb = makeFakeSb({ leads: [lead], projects: [{ id: "proj-1", job_id: "job-1" }] });
  await promoteRegisterToProject(sb, { leadId: "lead-1", projectId: "proj-1" });
  for (const r of sb.__store.client_selections) {
    assert.equal(r.source_lead_id, "lead-1");
    assert.ok(String(r.source_register_item_id).startsWith("ri_"), "selection missing stable id");
    assert.ok(/Master Register/.test(r.internal_notes || ""), "selection missing provenance");
  }
  for (const r of sb.__store.room_scope_items) {
    assert.equal(r.source_lead_id, "lead-1");
    assert.ok(/Master Register/.test(r.notes || ""), "scope item missing provenance");
  }
});

await test("T-P07 legacy {area,item,notes} row promotes (adopted as a selection)", async () => {
  const { lead } = fixtureLead();
  const sb = makeFakeSb({ leads: [lead], projects: [{ id: "proj-1", job_id: "job-1" }] });
  await promoteRegisterToProject(sb, { leadId: "lead-1", projectId: "proj-1" });
  const legacy = sb.__store.client_selections.find((r) => /Trough \+ mixer/.test(r.item_name || ""));
  assert.ok(legacy, "legacy finishes row did not promote");
  assert.equal(legacy.room_area, "Laundry");
});

await test("T-P08 idempotent — a second run adds nothing (ON CONFLICT DO NOTHING)", async () => {
  const { lead } = fixtureLead();
  const sb = makeFakeSb({ leads: [lead], projects: [{ id: "proj-1", job_id: "job-1" }] });
  await promoteRegisterToProject(sb, { leadId: "lead-1", projectId: "proj-1" });
  const selAfter1 = sb.__store.client_selections.length;
  const rsiAfter1 = sb.__store.room_scope_items.length;
  await promoteRegisterToProject(sb, { leadId: "lead-1", projectId: "proj-1" });
  assert.equal(sb.__store.client_selections.length, selAfter1, "re-run duplicated selections");
  assert.equal(sb.__store.room_scope_items.length, rsiAfter1, "re-run duplicated scope items");
});

await test("T-P09 projectId resolved from the lead's job when omitted", async () => {
  const { lead } = fixtureLead();
  const sb = makeFakeSb({ leads: [lead], projects: [{ id: "proj-9", job_id: "job-1" }] });
  const r = await promoteRegisterToProject(sb, { leadId: "lead-1" });
  assert.equal(r.ok, true);
  assert.equal(r.projectId, "proj-9");
  assert.ok(sb.__store.client_selections.every((x) => x.project_id === "proj-9"));
});

await test("T-P10 no project yet → ok:false, nothing written", async () => {
  const { lead } = fixtureLead();
  const sb = makeFakeSb({ leads: [lead], projects: [] });
  const r = await promoteRegisterToProject(sb, { leadId: "lead-1" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /no project/i);
  assert.equal(sb.__store.client_selections.length, 0);
  assert.equal(sb.__store.room_scope_items.length, 0);
});

await test("T-P11 empty register → ok:true, no rows, no error", async () => {
  const sb = makeFakeSb({ leads: [{ id: "lead-2", job_id: "job-2", stage: "consultants", selections_schedule: [] }], projects: [{ id: "proj-2", job_id: "job-2" }] });
  const r = await promoteRegisterToProject(sb, { leadId: "lead-2" });
  assert.equal(r.ok, true);
  assert.equal(r.selections, 0);
  assert.equal(r.scopeItems, 0);
});

await test("T-P12 reclassify selection → settled-out RETRACTS the staged client_selections row (F2/F4)", async () => {
  const lead = singleItemLead("selection", "undecided"); // selection → client_selections (staged)
  const sb = makeFakeSb({ leads: [lead], projects: [{ id: "proj-x", job_id: "job-x" }] });
  await promoteRegisterToProject(sb, { leadId: "lead-x", projectId: "proj-x" });
  assert.equal(sb.__store.client_selections.length, 1, "selection not staged on run 1");
  assert.equal(sb.__store.room_scope_items.length, 0);
  // Staff settle it as by-others → it is no longer a client selection.
  setItem(lead, "ri_x", { disposition: "by_others" });
  await promoteRegisterToProject(sb, { leadId: "lead-x", projectId: "proj-x" });
  const leaked = sb.__store.client_selections.some((r) => r.source_register_item_id === "ri_x");
  assert.ok(!leaked, "reclassified selection stayed in client_selections (guard breach)");
  assert.ok(sb.__store.room_scope_items.some((r) => r.source_register_item_id === "ri_x"), "not moved to room_scope_items");
});

await test("T-P13 reclassify scope → selection RETRACTS the room_scope_items row", async () => {
  const lead = singleItemLead("scope", "remove"); // scope → room_scope_items
  const sb = makeFakeSb({ leads: [lead], projects: [{ id: "proj-x", job_id: "job-x" }] });
  await promoteRegisterToProject(sb, { leadId: "lead-x", projectId: "proj-x" });
  assert.equal(sb.__store.room_scope_items.length, 1);
  assert.equal(sb.__store.client_selections.length, 0);
  setItem(lead, "ri_x", { itemKind: "selection", disposition: "new" }); // now a genuine choice
  await promoteRegisterToProject(sb, { leadId: "lead-x", projectId: "proj-x" });
  assert.ok(!sb.__store.room_scope_items.some((r) => r.source_register_item_id === "ri_x"), "stale scope row not retracted");
  assert.ok(sb.__store.client_selections.some((r) => r.source_register_item_id === "ri_x"), "not moved to client_selections");
});

await test("T-P14 an ISSUED (client_visible=true) row is NEVER auto-retracted (no-clobber)", async () => {
  const lead = singleItemLead("selection", "undecided");
  const sb = makeFakeSb({ leads: [lead], projects: [{ id: "proj-x", job_id: "job-x" }] });
  await promoteRegisterToProject(sb, { leadId: "lead-x", projectId: "proj-x" });
  // Office issues it to the client.
  sb.__store.client_selections.find((r) => r.source_register_item_id === "ri_x").client_visible = true;
  // Then the register item is reclassified to by-others.
  setItem(lead, "ri_x", { disposition: "by_others" });
  await promoteRegisterToProject(sb, { leadId: "lead-x", projectId: "proj-x" });
  assert.ok(sb.__store.client_selections.some((r) => r.source_register_item_id === "ri_x" && r.client_visible === true),
    "an issued row was wrongly auto-retracted");
});

await test("T-P15 reconciliation is scoped to the promoting lead (two leads, one project — N2)", async () => {
  const roomA = makeRoom({ name: "Kitchen", roomType: "kitchen" });
  const roomB = makeRoom({ name: "Bathroom", roomType: "bathroom" });
  const leadA = { id: "lead-a", job_id: "job-s", stage: "consultants", selections_schedule: writeRegister({ meta: emptyMeta({ rooms: [roomA] }), items: [makeItem({ id: "ri_a", itemKind: "selection", roomId: roomA.id, description: "A choice", disposition: "undecided" })] }) };
  const leadB = { id: "lead-b", job_id: "job-s", stage: "consultants", selections_schedule: writeRegister({ meta: emptyMeta({ rooms: [roomB] }), items: [makeItem({ id: "ri_b", itemKind: "selection", roomId: roomB.id, description: "B choice", disposition: "undecided" })] }) };
  const sb = makeFakeSb({ leads: [leadA, leadB], projects: [{ id: "proj-s", job_id: "job-s" }] });
  await promoteRegisterToProject(sb, { leadId: "lead-a", projectId: "proj-s" });
  await promoteRegisterToProject(sb, { leadId: "lead-b", projectId: "proj-s" });
  assert.equal(sb.__store.client_selections.length, 2, "both leads' selections should be staged");
  // Re-promote lead A — must NOT retract lead B's staged row.
  await promoteRegisterToProject(sb, { leadId: "lead-a", projectId: "proj-s" });
  assert.ok(sb.__store.client_selections.some((r) => r.source_register_item_id === "ri_a"), "lead A's own row wrongly retracted");
  assert.ok(sb.__store.client_selections.some((r) => r.source_register_item_id === "ri_b"), "lead B's row wrongly retracted by lead A's run");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
