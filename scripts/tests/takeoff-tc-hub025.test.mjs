// Hub review HUB 025 — "Conflict" / "That was already saved." on the aluminium screens. The server adds assignments
// BEFORE it archives (takeoff_commit), so "stop using W2" + "use W2 again under a new id" in ONE save met the old
// assignment on the one-live-assignment-per-(measurement, material) rule. The client now keeps those two halves in
// separate saves (deferPairCollisions) and names the edits a real conflict holds (nameChanges). Pure rules from
// src/components/takeoff/changeset.js; the server side is in takeoff-api.test.mjs ("HUB 025"), the screens in
// e2e/ui-review/tc-hub025.spec.js.
import assert from "node:assert/strict";
import { deferPairCollisions, describeChanges, isEmpty, isSaveConflict, mergeChanges, nameChanges, partial } from "../../src/components/takeoff/changeset.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); } }

const ALU = "mat-alu", OP = "m-w01";
const c1 = { id: "c1", measurementId: OP, jobMaterialId: ALU, role: "opening" };
const c2 = { id: "c2", measurementId: OP, jobMaterialId: ALU, role: "opening" };
const ids = (part) => Object.keys(part.upsert).sort();

t("re-tick in one batch: the new assignment waits for the next save; this save keeps the archive of the old one", () => {
  // untick (archive c1) then tick (new c2) inside one debounce window, c1 still live on the server
  const batch = mergeChanges(partial({ archive: { contributions: ["c1"] } }), partial({ contributions: [c2] }));
  const { now, later } = deferPairCollisions(batch, [c1]);
  assert.deepEqual(now.contributions.archive, ["c1"]);
  assert.deepEqual(ids(now.contributions), []);
  assert.deepEqual(ids(later.contributions), ["c2"]);
  assert.deepEqual(later.contributions.upsert.c2, c2, "the same id and record, never rewritten");
  assert.equal(later.contributions.archive.length, 0);
  // the next save, once c1 is archived on the server: nothing left to defer
  const next = deferPairCollisions(later, []);
  assert.equal(next.now, later); assert.ok(isEmpty(next.later));
});

t("undo chain (revive c1 while c2 is live on the server and archived in this batch): the revive is deferred", () => {
  const batch = mergeChanges(partial({ archive: { contributions: ["c2"] } }), partial({ contributions: [c1] }));
  const { now, later } = deferPairCollisions(batch, [c2]);
  assert.deepEqual(now.contributions.archive, ["c2"]);
  assert.deepEqual(ids(now.contributions), []);
  assert.deepEqual(ids(later.contributions), ["c1"]);
});

t("a new id added and removed in one batch is dropped from the upserts (ends archived, no collision)", () => {
  // c1 live; untick (archive c1), tick (c2), untick again (archive c2)
  const batch = [partial({ archive: { contributions: ["c1"] } }), partial({ contributions: [c2] }), partial({ archive: { contributions: ["c2"] } })].reduce(mergeChanges);
  assert.deepEqual(ids(batch.contributions), ["c2"], "mergeChanges keeps the upsert beside its archive");
  const { now, later } = deferPairCollisions(batch, [c1]);
  assert.deepEqual(ids(now.contributions), []);
  assert.deepEqual([...now.contributions.archive].sort(), ["c1", "c2"]);
  assert.ok(isEmpty(later));
});

t("a genuine duplicate is left for the server to refuse (holder not archived; two new ids on one pair)", () => {
  const dup = partial({ contributions: [c2] });
  const a = deferPairCollisions(dup, [c1]);
  assert.equal(a.now, dup, "c1 stays live → nothing moves"); assert.ok(isEmpty(a.later));
  const two = partial({ contributions: [c1, c2] });
  const b = deferPairCollisions(two, []);
  assert.equal(b.now, two); assert.ok(isEmpty(b.later));
  // an update of the holder itself is never a collision
  const same = partial({ contributions: [{ ...c1, role: "opening" }] });
  assert.equal(deferPairCollisions(same, [c1]).now, same);
});

t("a batch with no collisions comes back unchanged (the same object)", () => {
  const ch = partial({ materials: [{ id: ALU, name: "Aluminium angle 50 × 50 × 3" }], contributions: [{ id: "c9", measurementId: "m-other", jobMaterialId: ALU, role: "opening" }], archive: { contributions: ["c1"] } });
  const { now, later } = deferPairCollisions(ch, [c1]);
  assert.equal(now, ch); assert.ok(isEmpty(later));
  assert.equal(deferPairCollisions(null, []).now, null);
});

t("the deferred half merges in front of newer edits; untick again before it is sent → it ends archived", () => {
  const { later } = deferPairCollisions(mergeChanges(partial({ archive: { contributions: ["c1"] } }), partial({ contributions: [c2] })), [c1]);
  const queued = mergeChanges(later, partial({ archive: { contributions: ["c2"] } }));
  const { now: send, later: rest } = deferPairCollisions(queued, []); // c1 already archived on the server
  assert.deepEqual(ids(send.contributions), []);
  assert.deepEqual(send.contributions.archive, ["c2"]);
  assert.ok(isEmpty(rest));
  // a newer, unrelated edit rides along with the deferred half
  const kerf = mergeChanges(later, partial({ materials: [{ id: ALU, name: "Aluminium angle 50 × 50 × 3", spec: { kerfMm: 3 } }] }));
  assert.deepEqual(ids(kerf.contributions), ["c2"]); assert.deepEqual(ids(kerf.materials), [ALU]);
});

t("nameChanges names the material and the opening label; falls back to counts when there is nothing to name", () => {
  const view = { materials: [{ id: ALU, name: "Aluminium angle 50 × 50 × 3" }], measurements: [{ id: OP, kind: "opening", inputs: { label: "W01" } }], contributions: [] };
  const base = { ...view, contributions: [c1] };
  const ch = mergeChanges(partial({ materials: [{ id: ALU, name: "Aluminium angle 50 × 50 × 3", spec: { kerfMm: 3 } }] }), partial({ archive: { contributions: ["c1"] } }));
  const names = nameChanges(ch, view, base);
  assert.deepEqual(names, ["Aluminium angle 50 × 50 × 3 setup", "which openings Aluminium angle 50 × 50 × 3 uses (W01)"]);
  // a new straight cut names its length and its material
  const cut = partial({ measurements: [{ id: "m-cut", kind: "manual", finishedLengthMm: 1200, quantity: 1, label: null }], contributions: [{ id: "c-cut", measurementId: "m-cut", jobMaterialId: ALU, role: "primary" }] });
  assert.deepEqual(nameChanges(cut, view, base), ["a 1,200 mm cut added to Aluminium angle 50 × 50 × 3"]);
  // nothing to name (an archive of an unknown assignment) → describeChanges' counts
  const bare = partial({ archive: { contributions: ["c-unknown"] } });
  assert.deepEqual(nameChanges(bare, view, base), describeChanges(bare));
  assert.deepEqual(nameChanges(null, view, base), []);
});

t("isSaveConflict: every CONFLICT code (CONFLICT_RETRY included) and a bare 409 are a Conflict; any other refusal is not", () => {
  // the server's two "someone else saved" answers (takeoffService: revision check, and loadSnapshotFresh's last retry)
  assert.equal(isSaveConflict({ ok: false, status: 409, code: "CONFLICT", error: "Someone else saved this takeoff first." }), true);
  assert.equal(isSaveConflict({ ok: false, status: 409, code: "CONFLICT_RETRY", error: "The takeoff changed while loading — reload." }), true);
  assert.equal(isSaveConflict({ ok: false, status: 409, error: "x" }), true, "an older server's 409 with no code");
  // refusals of THIS change, never a conflict
  for (const code of ["DUPLICATE_ASSIGNMENT", "IMMUTABLE", "INVALID", "UNAUTHENTICATED", "FORBIDDEN"]) assert.equal(isSaveConflict({ ok: false, status: code === "UNAUTHENTICATED" ? 401 : 409, code }), false, code);
  assert.equal(isSaveConflict({ ok: false, network: true }), false);
  assert.equal(isSaveConflict({ ok: false, status: 500, code: "INTERNAL" }), false);
  assert.equal(isSaveConflict({ ok: true, status: 200 }), false);
  assert.equal(isSaveConflict(null), false);
});

console.log(`takeoff-tc-hub025: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
