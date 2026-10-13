// Profile editor model tests — run: node scripts/tests/takeoff-profile-editor.test.mjs
// Exercises the pure helpers behind src/components/takeoff/ProfileEditor.jsx (sketch → profile,
// label placement, hit testing, viewport maths) against the production shared/takeoff model.
import assert from "node:assert/strict";
import {
  sketchLegs, sketchToProfile, layoutProfile, hitTest, fitView, zoomAt, screenToMm, snapToGrid,
  profileBoundsMm, offsetPolyline, segmentHitsBox, boxesOverlap, parseNumberInput, gridLines,
  screenSideNormal, COAT_OFFSET_PX, fitProfileView, layoutExtents, segmentsCross, leaderTail,
} from "../../src/components/takeoff/profileEditorModel.js";
import {
  normaliseProfile, starterProfile, profileVertices, mirrorProfile, reverseProfile, TakeoffValidationError,
} from "../../shared/takeoff/index.js";

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);
const one = (dir, coatedFace = "left", lengthMm = 100) =>
  normaliseProfile({ initialDirectionDeg: dir, segments: [{ id: "a", lengthMm }], bends: [], start: { type: "none" }, end: { type: "none" }, coatedFace });
const centre = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
/** Signed side of point p relative to directed segment a→b in screen space: >0 = left of travel. */
const sideOf = (a, b, p) => {
  const u = { x: b.x - a.x, y: b.y - a.y };
  const n = screenSideNormal({ x: u.x / Math.hypot(u.x, u.y), y: u.y / Math.hypot(u.x, u.y) }, "left");
  return (p.x - a.x) * n.x + (p.y - a.y) * n.y;
};

// ── sketch → profile ──────────────────────────────────────────────────────────
t("3 taps → 2 legs, lengths rounded to 5 mm, turn snapped to 15°", () => {
  const r = sketchLegs([{ x: 0, y: 0 }, { x: 102, y: 3 }, { x: 98, y: 77 }]);
  assert.deepEqual(r.lengths, [100, 75]);   // 102.04 → 100; (−2, 77) from snapped (100,0) → 75
  assert.deepEqual(r.headings, [0, 90]);    // 1.7° → 0°; 91.5° → 90°
  assert.deepEqual(r.turns, [90]);
});
t("sketchToProfile builds a canonical profile (left turn = +)", () => {
  const p = sketchToProfile([{ x: 0, y: 0 }, { x: 102, y: 3 }, { x: 98, y: 77 }], { coatedFace: "right" });
  assert.deepEqual(p.segments.map((s) => s.lengthMm), [100, 75]);
  assert.deepEqual(p.bends.map((b) => b.turnDeg), [90]);
  assert.equal(p.initialDirectionDeg, 0);
  assert.equal(p.coatedFace, "right");
  assert.equal(p.start.type, "none"); assert.equal(p.end.type, "none");
});
t("sketch right turn is negative and snaps to the nearest 15°", () => {
  const r = sketchLegs([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 150, y: -48 }]); // heading −43.8° → −45°
  assert.deepEqual(r.turns, [-45]);
  assert.equal(r.lengths[1], 70); // hypot(50, 48) = 69.3 → 70
});
t("sketch rounding does not accumulate (each leg measured from the snapped vertex)", () => {
  const r = sketchLegs([{ x: 0, y: 0 }, { x: 103, y: 0 }, { x: 103, y: 50 }]);
  assert.equal(r.lengths[0], 105);
  // second leg from snapped (105,0) to (103,50): hypot(−2,50)=50.04 → 50, heading 92.3 → 90
  assert.deepEqual([r.lengths[1], r.headings[1]], [50, 90]);
});
t("sketch skips zero-length and fold-back taps", () => {
  const r = sketchLegs([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 100, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 60 }]);
  assert.deepEqual(r.lengths, [100, 60]); // (1,1) rounds to 0 mm; (50,0) folds straight back
  assert.deepEqual(r.turns, [90]);
});
t("sketch with fewer than two usable points throws a plain-English validation error", () => {
  assert.throws(() => sketchToProfile([{ x: 0, y: 0 }]), (e) => e instanceof TakeoffValidationError && /two points/.test(e.message));
});
t("grid snap is 10 mm", () => assert.deepEqual(snapToGrid({ x: 14.9, y: -15.1 }), { x: 10, y: -20 }));

// ── label placement ───────────────────────────────────────────────────────────
for (const dir of [0, 90, 180, 270, 45, 135, 200, 330]) {
  for (const coated of ["left", "right"]) {
    t(`leg label clears its leg and sits on the non-coated side (dir ${dir}°, coated ${coated})`, () => {
      const L = layoutProfile(one(dir, coated), 1.5);
      const leg = L.legs[0];
      assert.equal(segmentHitsBox(leg.a, leg.b, leg.label.box), false, "label box touches the leg");
      const s = sideOf(leg.a, leg.b, centre(leg.label.box));
      assert.ok(coated === "left" ? s < 0 : s > 0, `label on the coated side (signed ${s.toFixed(1)})`);
      assert.equal(leg.label.text, "L1 100");
    });
  }
}
t("every label in the starter profile clears every leg and no two labels overlap", () => {
  const L = layoutProfile(starterProfile(), 1.6);
  const boxes = [...L.legs.map((l) => l.label.box), ...L.corners.map((c) => c.label.box), ...L.ends.filter((e) => e.glyph).map((e) => e.glyph.label.box)];
  assert.equal(boxes.length, 3 + 2 + 1);
  for (const b of boxes) for (const l of L.legs) assert.equal(segmentHitsBox(l.a, l.b, b), false);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.equal(boxesOverlap(boxes[i], boxes[j]), false, `labels ${i} and ${j} overlap`);
});
t("U channel: labels stay off the profile at a cramped zoom", () => {
  const p = normaliseProfile({ initialDirectionDeg: 270, segments: [{ id: "a", lengthMm: 60 }, { id: "b", lengthMm: 40 }, { id: "c", lengthMm: 60 }],
    bends: [{ turnDeg: 90 }, { turnDeg: 90 }], start: { type: "none" }, end: { type: "open_return", widthMm: 15, side: "left" }, coatedFace: "right" });
  const L = layoutProfile(p, 1);
  for (const lab of [...L.legs.map((l) => l.label), ...L.corners.map((c) => c.label)]) {
    for (const l of L.legs) assert.equal(segmentHitsBox(l.a, l.b, lab.box), false, `${lab.text} sits on L${l.index + 1}`);
  }
});
t("narrow U (8 mm base): no label on the profile and no leader crosses another line", () => {
  const p = normaliseProfile({ initialDirectionDeg: 270, segments: [{ id: "a", lengthMm: 60 }, { id: "b", lengthMm: 8 }, { id: "c", lengthMm: 120 }, { id: "d", lengthMm: 40 }],
    bends: [{ turnDeg: 90 }, { turnDeg: 90 }, { turnDeg: -135 }], start: { type: "none" }, end: { type: "closed_hem", widthMm: 10, side: "right" }, coatedFace: "right" });
  for (const scale of [1.5, 3, 6]) {
    const L = layoutProfile(p, scale);
    const labels = [...L.legs.map((l) => l.label), ...L.corners.map((c) => c.label), ...L.ends.filter((e) => e.glyph).map((e) => e.glyph.label)];
    for (const lab of labels) {
      for (const l of L.legs) assert.equal(segmentHitsBox(l.a, l.b, lab.box), false, `${lab.text} sits on L${l.index + 1} at ${scale}px/mm`);
      const tail = lab.leader && leaderTail(lab.leader);
      if (tail) for (const l of L.legs) assert.equal(segmentsCross(tail[0], tail[1], l.a, l.b), false, `${lab.text} leader crosses L${l.index + 1} at ${scale}px/mm`);
    }
  }
});
t("very short leg gets a leader line", () => {
  const p = normaliseProfile({ initialDirectionDeg: 0, segments: [{ id: "a", lengthMm: 100 }, { id: "b", lengthMm: 8 }, { id: "c", lengthMm: 100 }],
    bends: [{ turnDeg: 90 }, { turnDeg: 90 }], start: { type: "none" }, end: { type: "none" }, coatedFace: "left" });
  const L = layoutProfile(p, 1.5);
  assert.ok(L.legs[1].label.leader, "short leg should have a leader");
  assert.equal(L.legs[0].label.leader, null);
});
t("corner label sits outside the fold", () => {
  const L = layoutProfile(starterProfile(), 2);
  for (const c of L.corners) {
    const prev = L.pts[c.index], next = L.pts[c.index + 2];
    const interior = { x: (prev.x + next.x) / 2 - c.v.x, y: (prev.y + next.y) / 2 - c.v.y };
    const lab = centre(c.label.box);
    assert.ok((lab.x - c.v.x) * interior.x + (lab.y - c.v.y) * interior.y < 0, `B${c.index + 1} label is inside the fold`);
  }
  assert.deepEqual(L.corners.map((c) => c.label.text), ["90°", "90°"]);
});
t("coated band offsets toward the coated side, and mirror carries it with the geometry", () => {
  for (const p of [starterProfile(), mirrorProfile(starterProfile()), reverseProfile(starterProfile())]) {
    const L = layoutProfile(p, 1);
    const s = sideOf(L.pts[0], L.pts[1], L.coated[0]);
    near(Math.abs(s), COAT_OFFSET_PX);
    assert.ok(p.coatedFace === "left" ? s > 0 : s < 0);
  }
});
t("offsetPolyline mitres a 90° fold at d·√2", () => {
  const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: -100 }];
  const out = offsetPolyline(pts, [{ x: 0, y: 1 }, { x: 1, y: 0 }], 4);
  assert.equal(out.length, 3);
  near(out[1].x, 104); near(out[1].y, 4);
});

// ── hit testing ───────────────────────────────────────────────────────────────
t("tap on a leg, its label, a corner, an end and empty space", () => {
  const p = starterProfile();
  const L = layoutProfile(p, 1.5);
  const mid = { x: (L.legs[1].a.x + L.legs[1].b.x) / 2, y: (L.legs[1].a.y + L.legs[1].b.y) / 2 };
  assert.deepEqual(hitTest(L, mid), { kind: "leg", id: p.segments[1].id });
  assert.deepEqual(hitTest(L, centre(L.legs[0].label.box)), { kind: "leg", id: p.segments[0].id });
  assert.deepEqual(hitTest(L, L.corners[1].v), { kind: "corner", index: 1 });
  assert.deepEqual(hitTest(L, centre(L.corners[0].label.box)), { kind: "corner", index: 0 });
  assert.deepEqual(hitTest(L, L.ends[1].p), { kind: "end", which: "end" });
  assert.equal(hitTest(L, { x: 5000, y: 5000 }), null);
});

// ── viewport ──────────────────────────────────────────────────────────────────
t("fitView puts every vertex inside the viewport with padding", () => {
  const p = starterProfile();
  const size = { w: 375, h: 320 };
  const v = fitView(profileBoundsMm(p), size);
  for (const q of profileVertices(p).points) {
    const sx = v.tx + q.x * v.scale, sy = v.ty - q.y * v.scale;
    assert.ok(sx >= 40 && sx <= size.w - 40 && sy >= 30 && sy <= size.h - 30, `vertex at ${sx.toFixed(0)},${sy.toFixed(0)}`);
  }
});
t("fitView inset keeps the drawing out of the reserved band", () => {
  const p = starterProfile();
  const v = fitView(profileBoundsMm(p), { w: 375, h: 320 }, { top: 48 });
  for (const q of profileVertices(p).points) assert.ok(v.ty - q.y * v.scale >= 48 + 30);
});
t("label-aware fit keeps every label and glyph on screen and out of the reserved band", () => {
  const shapes = [
    starterProfile(),
    sketchToProfile([{ x: 0, y: 0 }, { x: 160, y: 0 }, { x: 160, y: 220 }, { x: 220, y: 185 }]),
    normaliseProfile({ initialDirectionDeg: 0, segments: [{ id: "a", lengthMm: 300 }], bends: [], start: { type: "closed_hem", widthMm: 10, side: "left" }, end: { type: "open_return", widthMm: 20, side: "right" }, coatedFace: "left" }),
  ];
  for (const size of [{ w: 375, h: 300 }, { w: 900, h: 640 }]) {
    for (const p of shapes) {
      const v = fitProfileView(p, size, { top: 48 });
      const e = layoutExtents(layoutProfile(p, v.scale));
      assert.ok(v.tx + e.minX >= 0 && v.tx + e.maxX <= size.w, `x ${(v.tx + e.minX).toFixed(0)}..${(v.tx + e.maxX).toFixed(0)} of ${size.w}`);
      assert.ok(v.ty + e.minY >= 48 && v.ty + e.maxY <= size.h, `y ${(v.ty + e.minY).toFixed(0)}..${(v.ty + e.maxY).toFixed(0)} of ${size.h}`);
    }
  }
});
t("fitView handles a single straight leg (zero height)", () => {
  const v = fitView(profileBoundsMm(one(0)), { w: 400, h: 300 });
  assert.ok(Number.isFinite(v.scale) && v.scale > 0);
});
t("zoomAt keeps the pinch centre fixed", () => {
  const v = { scale: 2, tx: 50, ty: 200 };
  const c = { x: 120, y: 80 };
  const before = screenToMm(v, c), after = screenToMm(zoomAt(v, 1.7, c), c);
  near(before.x, after.x); near(before.y, after.y);
});
t("grid lines coarsen when zoomed out", () => {
  assert.equal(gridLines({ scale: 2, tx: 0, ty: 0 }, { w: 300, h: 300 }).stepMm, 10);
  assert.equal(gridLines({ scale: 0.2, tx: 0, ty: 0 }, { w: 300, h: 300 }).stepMm, 100);
});

// ── input parsing ─────────────────────────────────────────────────────────────
t("parseNumberInput", () => {
  assert.equal(parseNumberInput(" 150 "), 150);
  assert.equal(parseNumberInput("1,200"), 1200);
  assert.equal(parseNumberInput("12.5mm"), 12.5);
  assert.equal(parseNumberInput("135°"), 135);
  assert.ok(Number.isNaN(parseNumberInput("")));
  assert.ok(Number.isNaN(parseNumberInput("abc")));
  assert.ok(Number.isNaN(parseNumberInput("1.2.3")));
});

console.log(`takeoff-profile-editor: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
