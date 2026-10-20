// Hub review HUB 018 — unfinished-drawing cards on this device. A drawing already saved as it is in its flashing
// is finished and never shows as "unfinished"; a card for a flashing not in the takeoff reopens under its own name,
// never as a made-up blank "New flashing". Drives the REAL card logic (src/components/takeoff/editorDrafts.js).
import assert from "node:assert/strict";
import { draftCardText, editorDraftCard, materialForDraft, sameProfile } from "../../src/components/takeoff/editorDrafts.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); } }
const SIDE = "left";
const prof = (l2 = 150) => ({ segments: [{ id: "s1", lengthMm: 100 }, { id: "s2", lengthMm: l2 }], bends: [{ turnDeg: 90 }], start: { type: "none" }, end: { type: "none" }, coatedFace: SIDE });
const rec = (present, extra = {}) => ({ key: "editor|a|w|m1", materialId: "m1", draft: { v: 1, hist: { present, past: [], future: [] }, drafts: {}, ...extra.draft }, ...extra.rec });
const mat = (profile, name = "Apron flashing") => ({ id: "m1", name, methodKey: "flashing_runs", profile });

t("a drawing already saved as it is in its flashing is finished — no card (also when the saved jsonb has its keys in another order)", () => {
  assert.equal(editorDraftCard(rec({ profile: prof(), anchor: null, first: null }), mat(prof())), null);
  const reordered = JSON.parse(JSON.stringify({ end: { type: "none" }, start: { type: "none" }, coatedFace: SIDE, bends: [{ turnDeg: 90 }], segments: [{ lengthMm: 100, id: "s1" }, { lengthMm: 150, id: "s2" }] }));
  assert.equal(editorDraftCard(rec({ profile: prof(), first: null }), mat(reordered)), null);
  assert.ok(sameProfile(prof(), reordered));
});

t("reasons: a start point for a flashing not in the takeoff → 'point' under its own name; an invalid size → 'invalid'; a different shape → 'changed'", () => {
  const point = editorDraftCard(rec({ profile: null, first: { x: 0, y: 0 } }, { rec: { meta: { name: "Flashing 3", isNew: true } } }), null);
  assert.deepEqual(point, { materialId: "m1", name: "Flashing 3", isNew: true, reason: "point" });
  assert.equal(draftCardText(point), " — not in the takeoff yet.");
  const invalid = editorDraftCard(rec({ profile: prof(), first: null }, { draft: { drafts: { "leg:s2": "." } } }), mat(prof()));
  assert.equal(invalid.reason, "invalid", "a size that isn't valid yet is recoverable even with the saved shape");
  assert.equal(draftCardText(invalid), " (has a size that isn't valid yet).");
  const changed = editorDraftCard(rec({ profile: prof(175), first: null }), mat(prof()));
  assert.equal(changed.reason, "changed"); assert.equal(changed.name, "Apron flashing");
  assert.equal(editorDraftCard(rec({ profile: prof(), first: null }), null).reason, "new");
});

t("nothing to recover → no card: empty, blank with only history, missing present", () => {
  assert.equal(editorDraftCard(rec({ profile: null, first: null }), mat(prof())), null);
  assert.equal(editorDraftCard({ ...rec({ profile: null, first: null }), draft: { hist: { present: { profile: null, first: null }, past: [{ profile: prof() }] }, drafts: {} } }, null), null);
  assert.equal(editorDraftCard({ materialId: "m1", draft: {} }, null), null);
});

t("materialForDraft keeps the saved name (meta) or the fallback 'Flashing N' — never 'New flashing' — and adds no profile", () => {
  const fallback = { id: "new-id", name: "Flashing 4", methodKey: "flashing_runs", profile: null };
  assert.deepEqual(materialForDraft({ materialId: "m9" }, fallback), { ...fallback, id: "m9", name: "Flashing 4" });   // a record from an older build (no meta)
  assert.equal(materialForDraft({ materialId: "m9", meta: { name: "Flashing 3" } }, fallback).name, "Flashing 3");
  assert.equal(materialForDraft({ materialId: "m9", meta: { name: "Flashing 3" } }, fallback).profile, null);
});

t("a shape that can't be compared counts as changed — a draft is never deleted on doubt", () => {
  const corrupt = { segments: [{ id: "s1", lengthMm: -5 }], bends: [] };
  assert.equal(sameProfile(corrupt, prof()), false);
  assert.equal(editorDraftCard(rec({ profile: corrupt, first: null }), mat(prof())).reason, "changed");
});

console.log(`takeoff-tc-hub018: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
