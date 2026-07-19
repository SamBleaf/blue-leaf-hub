// Margin projection — unit tests. Run: node scripts/tests/margin-projection.test.mjs
// Schedule-driven % complete + target-anchored projection (Sam's 2026-07-19 model).
import { scheduleElapsed, categoryPctComplete, projectMargin } from "../../server/lib/marginProjection.mjs";

let pass = 0, fail = 0;
function eq(a, e, name) { const A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) pass++; else { fail++; console.error(`  ✗ ${name}\n      expected ${E}\n      got      ${A}`); } }
function ok(c, name) { if (c) pass++; else { fail++; console.error(`  ✗ ${name}`); } }

// ── scheduleElapsed ──
eq(scheduleElapsed("2026-07-01", "2026-07-11", "2026-07-06"), 0.5, "half-way through the planned window");
eq(scheduleElapsed("2026-07-01", "2026-07-11", "2026-06-20"), 0, "before start → 0");
eq(scheduleElapsed("2026-07-01", "2026-07-11", "2026-08-01"), 1, "after end → 1");
eq(scheduleElapsed(null, "2026-07-11", "2026-07-06"), null, "missing start → null");
eq(scheduleElapsed("2026-07-11", "2026-07-11", "2026-07-12"), 1, "zero-length window, today past → 1");
eq(scheduleElapsed("2026-08-01", "2026-07-01", "2026-07-15"), null, "reversed window (end before start) → null, not 1 (no over-projection)");

// ── categoryPctComplete ──
eq(categoryPctComplete({ stageStatus: "complete" }), 1, "complete → 100%");
eq(categoryPctComplete({ stageStatus: "planned", fallbackRatio: 0.9 }), 0, "planned → 0 (schedule wins over tasks)");
eq(categoryPctComplete({ stageStatus: null, fallbackRatio: 0.6 }), 0.6, "no stage → falls back to site-task ratio");
eq(categoryPctComplete({ stageStatus: null, fallbackRatio: null }), null, "no stage + no fallback → null (no projection)");
eq(categoryPctComplete({ stageStatus: "in_progress", plannedStart: "2026-07-01", plannedEnd: "2026-07-11", today: "2026-07-06", actual: 1500, allowableCost: 7500 }), 0.35, "in-progress blend: avg(elapsed 0.5, cost 0.2)");
eq(categoryPctComplete({ stageStatus: "in_progress", actual: 3750, allowableCost: 7500 }), 0.5, "in-progress, no dates → cost signal only");
eq(categoryPctComplete({ stageStatus: "in_progress", plannedStart: "2026-07-01", plannedEnd: "2026-07-11", today: "2026-07-09" }), 0.8, "in-progress, no cost → schedule signal only");
ok(categoryPctComplete({ stageStatus: "in_progress" }) === 0.5, "in-progress, no signals → 0.5 placeholder");

// ── projectMargin (budget 10000, target 25% → allowable 7500) ──
eq(projectMargin({ budget: 10000, actual: 0, pctComplete: 0 }), { projectedCost: 7500, projectedMarginPct: 25, flag: null }, "not started → target 25%, not 100%");
eq(projectMargin({ budget: 10000, actual: 6000, pctComplete: 1 }), { projectedCost: 6000, projectedMarginPct: 40, flag: null }, "complete + real under-spend → 40% (proven saving shown)");
eq(projectMargin({ budget: 10000, actual: 0, pctComplete: 1 }), { projectedCost: 7500, projectedMarginPct: 25, flag: "actuals_incomplete" }, "complete + $0 logged → held at target + flag (kills the 100% artifact)");
eq(projectMargin({ budget: 10000, actual: 5000, pctComplete: 0.5 }), { projectedCost: 8750, projectedMarginPct: 12.5, flag: null }, "in-progress overspend → 12.5% shown (early warning, not clamped)");
eq(projectMargin({ budget: 10000, actual: 2000, pctComplete: 0.5 }), { projectedCost: 5750, projectedMarginPct: 42.5, flag: null }, "in-progress real saving w/ evidence → 42.5% shown");
eq(projectMargin({ budget: 10000, actual: 1000, pctComplete: 0.5 }), { projectedCost: 7500, projectedMarginPct: 25, flag: "actuals_incomplete" }, "in-progress, logged cost too thin for the claimed saving → held at target");
eq(projectMargin({ budget: 0, actual: 0, pctComplete: 0.5 }), { projectedCost: null, projectedMarginPct: null, flag: null }, "no budget → null");
eq(projectMargin({ budget: 10000, actual: 0, pctComplete: null }), { projectedCost: null, projectedMarginPct: null, flag: null }, "no completion signal → null (unchanged for unscheduled/untasked lines)");
eq(projectMargin({ budget: 10000, actual: 0, pctComplete: NaN }), { projectedCost: null, projectedMarginPct: null, flag: null }, "NaN pct (e.g. undefined/N task ratio) → null, NOT a resurrected phantom 100%");
eq(categoryPctComplete({ stageStatus: null, fallbackRatio: NaN }), null, "NaN fallbackRatio → null, not NaN");
eq(projectMargin({ budget: 10000, actual: 3000, pctComplete: 0.4, targetPct: 0.20 }), { projectedCost: 7800, projectedMarginPct: 22, flag: null }, "material target 20%: allowable 8000, 3000 + 8000×0.6 = 7800 → 22%");

console.log(`margin-projection: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
