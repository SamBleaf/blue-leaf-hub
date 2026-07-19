// =============================================================================
// Margin projection — schedule-driven earned value for the carpentry budget.
//
// Sam's model (2026-07-19): the projected margin BASELINES at the target (25% labour /
// 20% material) and only deviates as real timesheet burn proves we're tracking under or
// over. % complete is driven by the STAGE SCHEDULE (complete → 100%, planned → 0%), with
// an in-progress blend of schedule-elapsed + logged-hours-vs-allowable. This replaces the
// old projectedCost = actual ÷ %done, which read 100% margin whenever a category showed
// "done" with little/no logged cost.
//
// Pure (no Supabase / no Date.now) so it's unit-testable — the route passes `today` in.
// =============================================================================

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function parseYmd(s) {
  if (!s) return null;
  const [y, m, d] = String(s).split("-").map(Number);
  if (!y || !m) return null;
  return new Date(y, m - 1, d || 1, 12);
}

// Fraction of a stage's planned window elapsed as of `today` (0..1), or null when dates missing.
export function scheduleElapsed(plannedStart, plannedEnd, today) {
  const s = parseYmd(plannedStart), e = parseYmd(plannedEnd), t = parseYmd(today);
  if (!s || !e || !t) return null;
  if (e < s) return null;                      // reversed/invalid window → no signal (don't over-project)
  if (e.getTime() === s.getTime()) return t >= e ? 1 : 0;  // same-day stage
  return clamp((t - s) / (e - s), 0, 1);
}

// Schedule-driven % complete for a category (0..1 or null).
//   complete            → 1
//   in_progress         → blend of schedule-elapsed and logged-cost-vs-allowable (the signals
//                         that exist), capped below 1 so a started stage never reads 100%
//   planned             → 0
//   no stage row        → fallbackRatio (the site-task ratio) so non-scheduled jobs don't regress
export function categoryPctComplete({
  stageStatus = null, plannedStart = null, plannedEnd = null, today = null,
  actual = 0, allowableCost = 0, fallbackRatio = null,
} = {}) {
  if (stageStatus === "complete") return 1;
  if (stageStatus === "in_progress") {
    const signals = [];
    const el = scheduleElapsed(plannedStart, plannedEnd, today);
    if (el != null) signals.push(el);
    if (allowableCost > 0) signals.push(clamp((Number(actual) || 0) / allowableCost, 0, 1));
    if (!signals.length) return fallbackRatio != null ? clamp(fallbackRatio, 0, 0.99) : 0.5;
    return clamp(signals.reduce((a, b) => a + b, 0) / signals.length, 0, 0.99);
  }
  if (stageStatus === "planned") return 0;
  return fallbackRatio; // may be null
}

// Target-anchored projection: projected final cost = spent-so-far + the allowable cost for the
// work still to do. At 0% done this is exactly the target margin; it slides off target only as
// realized burn out/under-paces the allowable rate.
//
// Evidence clamp: never claim BETTER than target unless real logged cost backs it — this kills
// the "stage complete, $0 logged → 100% margin" artifact. Overspend (margin < target) is always
// shown (early warning); only the optimistic side is gated.
//
// → { projectedCost, projectedMarginPct, flag }  (nulls when there's no completion signal)
export function projectMargin({ budget = 0, actual = 0, pctComplete = null, targetPct = 0.25 } = {}) {
  if (!(budget > 0) || pctComplete == null) return { projectedCost: null, projectedMarginPct: null, flag: null };
  const pct = clamp(pctComplete, 0, 1);
  const spent = Number(actual) || 0;
  const allowableCost = budget * (1 - targetPct);
  let projectedCost = round2(spent + allowableCost * (1 - pct));
  let projectedMarginPct = round2(((budget - projectedCost) / budget) * 100);
  let flag = null;
  const targetMarginPct = round2(targetPct * 100);
  if (projectedMarginPct > targetMarginPct && pct > 0 && spent < allowableCost * pct * 0.5) {
    projectedCost = round2(allowableCost);   // hold at target — actuals too thin to prove a saving
    projectedMarginPct = targetMarginPct;
    flag = "actuals_incomplete";
  }
  return { projectedCost, projectedMarginPct, flag };
}
