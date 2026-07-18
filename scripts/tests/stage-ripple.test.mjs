// stageRipple — dependency ripple for carpentry stage moves. Run: node scripts/tests/stage-ripple.test.mjs
import { rippleStages } from "../../src/lib/stageRipple.js";

let pass = 0, fail = 0;
function ok(c, name) { if (c) pass++; else { fail++; console.error(`  ✗ ${name}`); } }

const stages = [
  { rowId: "F", stage: "first_fix_framing", label: "First Fix Framing", plannedStart: "2026-08-03", plannedEnd: "2026-08-20", dependsOn: [] },
  { rowId: "C", stage: "cladding", label: "Cladding", plannedStart: "2026-08-28", plannedEnd: "2026-09-15", dependsOn: [{ stageKey: "first_fix_framing", type: "FS", lagDays: 5 }] },
  { rowId: "S", stage: "second_fix", label: "Second Fix", plannedStart: "2026-09-18", plannedEnd: "2026-09-30", dependsOn: [{ stageKey: "cladding", type: "FS", lagDays: 2 }] },
];

// Move framing a week later → its dependents push forward (FS + lag).
const later = rippleStages(stages, "F", "2026-08-10");
ok(later.find((r) => r.rowId === "F")?.plannedStart === "2026-08-10", "moved framing start applied");
ok(later.some((r) => r.rowId === "C"), "cladding pushed downstream");
ok(later.some((r) => r.rowId === "S"), "second fix pushed transitively");
const f = later.find((r) => r.rowId === "F");
ok(f.plannedEnd > f.plannedStart, "framing keeps a positive span (duration preserved)");

// Move framing EARLIER → forward-only push means dependents don't move.
const earlier = rippleStages(stages, "F", "2026-07-20");
ok(earlier.length === 1 && earlier[0].rowId === "F", "moving earlier doesn't drag dependents (push-only)");

// No dependents → only the moved stage changes.
const solo = rippleStages([stages[0]], "F", "2026-08-05");
ok(solo.length === 1 && solo[0].rowId === "F", "single stage moves alone");

// Unknown rowId → no changes.
ok(rippleStages(stages, "ZZZ", "2026-08-05").length === 0, "unknown row → no-op");

console.log(`stage-ripple: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
