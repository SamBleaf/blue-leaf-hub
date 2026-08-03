// The §2 pattern rule as a build-failing gate (remediation-brief Step 7). Two jobs:
// 1. Assert classifyTarget() gives the intended class on representative control texts.
// 2. THE GATE: no site-fact target the map ever marks auto-fill (class A) may have a control text that
//    classifies as B/C/D/E. Today no target is marked auto-fill (the reviewer confirms the A–E table
//    first), so the gate is dormant-but-armed — it trips the moment a defective auto-fill flag is added.
// Run: node scripts/tests/carpentry-sitefacts-class.test.mjs
import { classifyTarget } from "../../server/lib/whs/carpentrySiteFactsClass.mjs";

let pass = 0, fail = 0;
const eq = (got, want, name) => { if (got === want) pass++; else { fail++; console.error(`  ✗ ${name}: got ${got}, want ${want}`); } };

// A — state only
eq(classifyTarget("Guardrail to the full open perimeter of the working level.").cls, "A", "plain guardrail state → A");
eq(classifyTarget("On-tool dust extraction with an H-class vacuum, correctly fitted.").cls, "A", "extraction fitted → A");
// B — sequencing
eq(classifyTarget("Guardrail installed before frames are handled at that level, not progressively as work reaches it.").cls, "B", "before/not progressively → B");
eq(classifyTarget("Trusses loaded onto the delivery vehicle in erection order.").cls, "B", "in erection order → B");
// C — dimension
eq(classifyTarget("Top rail 900–1100 mm, mid rail, toeboard.").cls, "C", "mm dimensions → C");
eq(classifyTarget("1.5 m exclusion from any unprotected edge.").cls, "C", "1.5 m → C");
// D — precondition
eq(classifyTarget("Travel restraint anchored to a rated anchor installed by a competent person.").cls, "D", "installed by competent person → D");
eq(classifyTarget("Fall-arrest permitted only where Part 3 records a ground-clearance calculation and a nominated rescuer.").cls, "D", "permitted only where → D");
eq(classifyTarget("Supply de-energised, isolated, locked and tagged, and proved dead by a licensed electrician.").cls, "D", "proved dead → D");
// E — two obligations
eq(classifyTarget("No person stands on the external top plate. Erection is carried out from internal wall plates.").cls, "D", "no-person precondition wins over E");
eq(classifyTarget("Cutting station located outdoors and downwind. Second-fix machining done in a ventilated area.").cls, "E", "two sentences → E");

// THE GATE — armed for when the reviewer's confirmed A-class table lands.
// A helper the wiring will use: an auto-fill flag is only legal on a class-A control.
import { isAutoFillable } from "../../server/lib/whs/carpentrySiteFactsClass.mjs";
eq(isAutoFillable("Guardrail to the full open perimeter."), true, "gate: plain state is auto-fillable");
eq(isAutoFillable("Guardrail installed before frames are handled."), false, "gate: sequencing is NOT auto-fillable");

console.log(`carpentry-sitefacts-class: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
