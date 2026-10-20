// Hub review HUB 013 / HUB 020 — a flashing draft follows the takeoff (real engine + the shared order-draft rules).
import assert from "node:assert/strict";
import { FLASHING_SPEC_DEFAULTS, computeWorkspace, orderStatus, flashingNeeds, refreshDraftLines, flashingOrderGroups, withoutBasis } from "../../shared/takeoff/index.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); } }

// Sam's recorded job: Perforated bottom 16, Axon starter 23 (20 + 3), Corner 29, Head 11 = 79 pieces
const mat = (id, name, colour) => ({ id, name, methodKey: "finished_piece_count", methodVersion: 1, spec: { ...FLASHING_SPEC_DEFAULTS, colour }, rules: {}, profile: null });
const MATS = [mat("m-pb", "Cladding perforated bottom flashing", "Monument"), mat("m-ax", "Axon starter flashing", "Surfmist"), mat("m-co", "Corner flashing", "Basalt"), mat("m-he", "Head flashing", "Woodland Grey")];
const runs = [["m-pb", 3000, 16], ["m-ax", 2400, 20], ["m-ax", 1200, 3], ["m-co", 2700, 29], ["m-he", 1800, 11]];
function snapshot(extra = []) {
  const all = [...runs, ...extra];
  return { workspace: { id: "ws", revision: 1, state: "active" }, documents: [], calibrations: [], materials: MATS,
    measurements: all.map(([, len, q], i) => ({ id: `ms${i}`, kind: "manual", finishedLengthMm: len, quantity: q })),
    contributions: all.map(([m], i) => ({ id: `c${i}`, measurementId: `ms${i}`, jobMaterialId: m })) };
}
const byMat = new Map(MATS.map((m) => [m.id, m]));
const compute = (snap = snapshot()) => computeWorkspace(snap);
const needsOf = (comp, commitments = [], cover = new Map()) => flashingNeeds({ scheduleLines: comp.scheduleLines, status: orderStatus(comp.scheduleLines, commitments), cover });
const sum = (lines) => lines.reduce((a, l) => a + l.quantity, 0);
const perMat = (lines, comp) => { const o = {}; for (const l of lines) { const sl = comp.scheduleLines.find((s) => s.bucketKey === l.bucketKey); const n = byMat.get(sl.jobMaterialIds[0]).name; o[n] = (o[n] || 0) + l.quantity; } return o; };

t("the takeoff needs 79 flashing pieces: 16 / 23 / 29 / 11, all able to go on the order", () => {
  const comp = compute();
  const n = needsOf(comp);
  assert.equal(n.reduce((a, x) => a + x.need, 0), 79);
  assert.ok(n.every((x) => x.reason === null));
});

t("an old draft made with fewer flashings (FO-001001: Axon 5 + Corner 29) is brought fully up to date once: 79", () => {
  const comp = compute();
  const key = (m, len) => comp.scheduleLines.find((s) => s.jobMaterialIds[0] === m && s.finishedLengthMm === len).bucketKey;
  const fo1 = [{ bucketKey: key("m-ax", 2400), quantity: 5 }, { bucketKey: key("m-co", 2700), quantity: 29 }];
  const r = refreshDraftLines({ lines: fo1, basis: null, needs: needsOf(comp) });
  assert.equal(sum(r.lines), 79);
  assert.deepEqual(perMat(r.lines, comp), { "Axon starter flashing": 23, "Corner flashing": 29, "Cladding perforated bottom flashing": 16, "Head flashing": 11 });
  assert.equal(r.changed, true);
  assert.equal(Object.keys(r.basis).length, 5);
  // opening it again changes nothing
  const again = refreshDraftLines({ lines: r.lines, basis: r.basis, needs: needsOf(comp) });
  assert.equal(again.changed, false); assert.deepEqual(again.changes, []);
});

t("a line no longer in the takeoff (old colour, old 100 mm-step length) follows the takeoff when untouched; one the user changed stays for the out-of-date check", () => {
  const comp = compute();
  const r = refreshDraftLines({ lines: [{ bucketKey: "old-bucket|4600", quantity: 4, jobMaterialId: "m-pb" }], basis: null, needs: needsOf(comp) });
  assert.equal(r.lines.find((l) => l.bucketKey === "old-bucket|4600"), undefined);   // replaced by the current lengths
  assert.equal(sum(r.lines), 79);
  assert.ok(r.changes.some((c) => c.bucketKey === "old-bucket|4600" && c.to === 0));
  const kept = refreshDraftLines({ lines: [{ bucketKey: "old-bucket|4600", quantity: 4 }], basis: { "old-bucket|4600": 2 }, needs: needsOf(comp) });
  assert.equal(kept.lines.find((l) => l.bucketKey === "old-bucket|4600").quantity, 4);   // the user's number: shown as needs updating
});

t("lines nobody touched follow the takeoff up and down; a line the user changed or removed keeps their choice", () => {
  const comp = compute();
  const first = refreshDraftLines({ lines: [], basis: {}, needs: needsOf(comp) });
  const head = comp.scheduleLines.find((s) => s.jobMaterialIds[0] === "m-he").bucketKey;
  const corner = comp.scheduleLines.find((s) => s.jobMaterialIds[0] === "m-co").bucketKey;
  // Sam takes the Head flashing off and sets Corner to 25 (saved — the basis stays as the refresh left it)
  const edited = first.lines.filter((l) => l.bucketKey !== head).map((l) => (l.bucketKey === corner ? { ...l, quantity: 25 } : l));
  // the takeoff grows: 2 more Axon 2400 and 3 more Head
  const comp2 = compute(snapshot([["m-ax", 2400, 2], ["m-he", 1800, 3]]));
  const r = refreshDraftLines({ lines: edited, basis: first.basis, needs: needsOf(comp2) });
  assert.equal(r.lines.find((l) => l.bucketKey === head), undefined);               // still off: the user removed it
  assert.equal(r.lines.find((l) => l.bucketKey === corner).quantity, 25);          // the user's number
  const ax = comp2.scheduleLines.find((s) => s.jobMaterialIds[0] === "m-ax" && s.finishedLengthMm === 2400).bucketKey;
  assert.equal(r.lines.find((l) => l.bucketKey === ax).quantity, 22);              // untouched: followed the takeoff up
  // the takeoff shrinks: untouched lines follow it down
  const comp3 = compute(snapshot().measurements ? { ...snapshot(), measurements: snapshot().measurements.map((m) => (m.id === "ms0" ? { ...m, quantity: 10 } : m)) } : null);
  const pb = comp3.scheduleLines.find((s) => s.jobMaterialIds[0] === "m-pb").bucketKey;
  const down = refreshDraftLines({ lines: first.lines, basis: first.basis, needs: needsOf(comp3) });
  assert.equal(down.lines.find((l) => l.bucketKey === pb).quantity, 10);
});

t("left off with a reason: blocked (a length with a problem), ordered (placed) and on another exported order", () => {
  const comp = compute();
  const head = comp.scheduleLines.find((s) => s.jobMaterialIds[0] === "m-he");
  const blockedLines = comp.scheduleLines.map((s) => (s.bucketKey === head.bucketKey ? { ...s, problems: ["material_incomplete"] } : s));
  const n1 = flashingNeeds({ scheduleLines: blockedLines, status: orderStatus(blockedLines, []) });
  assert.equal(n1.find((x) => x.bucketKey === head.bucketKey).reason, "blocked");
  const r = refreshDraftLines({ lines: [], basis: {}, needs: n1 });
  assert.equal(r.lines.find((l) => l.bucketKey === head.bucketKey), undefined);     // never added while blocked
  const corner = comp.scheduleLines.find((s) => s.jobMaterialIds[0] === "m-co");
  const n2 = needsOf(comp, [{ bucketKey: corner.bucketKey, contributionId: null, quantity: 29 }]);
  assert.equal(n2.find((x) => x.bucketKey === corner.bucketKey).reason, "ordered");
  const n3 = needsOf(comp, [], new Map([[corner.bucketKey, { exported: 29, placed: 0, refs: ["FO-001007"] }]]));
  const c3 = n3.find((x) => x.bucketKey === corner.bucketKey);
  assert.equal(c3.reason, "on_other_order"); assert.deepEqual(c3.refs, ["FO-001007"]);
});

t("groups are P-numbered like the PDF (by flashing name), longest length first, totals add to 79, no zero rows", () => {
  const comp = compute();
  const r = refreshDraftLines({ lines: [], basis: {}, needs: needsOf(comp) });
  const qty = Object.fromEntries(r.lines.map((l) => [l.bucketKey, l.quantity]));
  const g = flashingOrderGroups(qty, comp.scheduleLines, byMat);
  assert.deepEqual(g.map((x) => `${x.profileId} ${x.materialName} ${x.pieces}`),
    ["P1 Axon starter flashing 23", "P2 Cladding perforated bottom flashing 16", "P3 Corner flashing 29", "P4 Head flashing 11"]);
  assert.deepEqual(g[0].lines.map((x) => x.line.finishedLengthMm), [2400, 1200]);
  assert.equal(g.reduce((a, x) => a + x.pieces, 0), 79);
  assert.ok(g.every((x) => x.lines.every((l) => l.quantity > 0)));
  // a length taken to 0 on screen stays listed (so it can be put back) only when asked to
  const head = g[3].lines[0].line.bucketKey;
  assert.equal(flashingOrderGroups({ ...qty, [head]: 0 }, comp.scheduleLines, byMat).length, 3);
  assert.equal(flashingOrderGroups({ ...qty, [head]: 0 }, comp.scheduleLines, byMat, new Set([head])).length, 4);
});

t("the refresh basis is never shown or frozen: withoutBasis strips it", () => {
  assert.deepEqual(withoutBasis({ method: "pickup", basis: { a: 1 } }), { method: "pickup" });
  assert.deepEqual(withoutBasis({ method: "pickup" }), { method: "pickup" });
  assert.deepEqual(withoutBasis(null), {});
});

console.log(`takeoff-tc-hub013: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
