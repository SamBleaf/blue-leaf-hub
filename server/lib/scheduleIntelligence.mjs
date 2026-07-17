// =============================================================================
// Schedule Intelligence (Workforce Pipeline v1) — deterministic, auditable forecasting.
// No AI. Transparent rules + the cost model + historical medians + live production. Keeps
// the four schedule measures separate (committed / expected / break-even allowance / actual)
// and returns a structured explanation assembled from the numbers (never invented prose).
//
// Units (verified vs costModelService): teamChargeUpPerDay / teamBreakEvenPerDay are WHOLE-TEAM
// $/day, so labourSell ÷ teamChargeUpPerDay = whole-team-days; × headcount ÷ crewSize re-expresses
// that as a crew-of-N's productive working-days (no double-conversion — reconcile vs the Budget
// burn block on ≥2 real jobs before shipping).
// =============================================================================
import { workingDaysBetween, addWorkingDays } from "./workingCalendar.mjs";
import { stageOrder, stageLabel } from "./carpentryStages.mjs";

const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const MOBILISATION_DAYS = 0.5;
const DEFECT_FRACTION = 0.05;                                   // 5% of productive days for returns/defects
const CONTINGENCY = { High: 0.05, Medium: 0.12, Low: 0.25, Insufficient: 0.4 };

// ── Break-even allowance (financial deadline, not the expected duration) ──────
export function breakEven({ labourSell, crewSize, cm }) {
  const headcount = cm?.headcount || 0;
  if (!cm || !(cm.teamChargeUpPerDay > 0) || !(cm.teamBreakEvenPerDay > 0) || !(labourSell > 0) || headcount <= 0) {
    return { available: false, atMarginDays: null, breakEvenDays: null, targetMarginDays: null, breakEvenAllowanceDays: null, crewSize: crewSize || null, headcount: headcount || null };
  }
  const crew = crewSize > 0 ? crewSize : headcount;
  const atMarginDays = labourSell / cm.teamChargeUpPerDay;      // whole-team-days at target margin
  const breakEvenDays = labourSell / cm.teamBreakEvenPerDay;    // whole-team-days at margin-zero (larger)
  const scale = headcount / crew;                              // whole-team → crew-of-N calendar days
  return {
    available: true,
    atMarginDays: round1(atMarginDays),
    breakEvenDays: round1(breakEvenDays),
    targetMarginDays: round1(atMarginDays * scale),            // crew productive working-days at target margin
    breakEvenAllowanceDays: round1(breakEvenDays * scale),     // crew productive working-days to margin-zero (the deadline)
    crewSize: crew, headcount,
  };
}

function sumGapDays(includedStages, gapMediansByStage = {}) {
  const ordered = [...includedStages].sort((a, b) => stageOrder(a) - stageOrder(b));
  let g = 0;
  for (let i = 1; i < ordered.length; i++) g += Number(gapMediansByStage[ordered[i]] ?? 1) || 0; // default 1 working-day gap
  return round1(g);
}

// ── Deterministic job forecast (the four values + confidence + explanation) ───
// actuals    = aggregateStages() output for THIS job (null if not started)
// historical = { expectedHoursByStage, gapMediansByStage, sampleSize } for the project_type (null if none)
// includedStages = stage keys present in the job's budget line items
export function forecastDuration({
  labourSell, crewSize, cm, hoursPerDay = 8, nonWork = {},
  actuals = null, historical = null, includedStages = [], plannedStartDate = null,
}) {
  const be = breakEven({ labourSell, crewSize, cm });
  const crew = be.crewSize || (crewSize > 0 ? crewSize : (cm?.headcount || 3));
  const consumedHours = actuals ? round1(actuals.totalHours) : 0;

  // Evidence hierarchy for expected TOTAL productive hours (top available wins; active overrides).
  let expectedHours = null, source = "manual", confidence = "Insufficient", sampleSize = 0;
  if (historical && historical.sampleSize > 0 && includedStages.length) {
    const h = includedStages.reduce((s, st) => s + (Number(historical.expectedHoursByStage?.[st]) || 0), 0);
    if (h > 0) { expectedHours = round1(h); source = "historical"; sampleSize = historical.sampleSize; confidence = historical.sampleSize >= 4 ? "Medium" : "Low"; }
  }
  if ((expectedHours == null || expectedHours <= 0) && be.available) {
    expectedHours = round1(be.targetMarginDays * crew * hoursPerDay); // planned hours at target margin
    source = "budget_break_even"; confidence = "Low";
  }
  if (expectedHours == null) { expectedHours = 0; source = "manual"; confidence = "Insufficient"; }

  // Active-job override: real production sharpens the estimate + confidence.
  let productionRate = null, percentComplete = null;
  if (actuals && actuals.totalHours > 0) {
    const elapsedWd = actuals.firstDate && actuals.lastDate ? workingDaysBetween(actuals.firstDate, actuals.lastDate, nonWork) : 0;
    productionRate = elapsedWd > 0 ? round1(actuals.totalHours / elapsedWd) : round1(crew * hoursPerDay);
    if (expectedHours > 0) percentComplete = Math.min(100, Math.round((consumedHours / expectedHours) * 100));
    confidence = (percentComplete ?? 0) >= 20 ? "High" : (source === "budget_break_even" ? "Medium" : confidence);
    source = "active_production";
    sampleSize = Math.max(sampleSize, 1);
  }

  const remainingHours = Math.max(0, round1(expectedHours - consumedHours));
  const expectedProductiveCrewDays = round1(expectedHours / (crew * hoursPerDay));
  const remainingCrewDays = round1(remainingHours / (crew * hoursPerDay));
  const gapDays = sumGapDays(includedStages, historical?.gapMediansByStage);
  const defectDays = round1(expectedProductiveCrewDays * DEFECT_FRACTION);
  const contingencyDays = round1(expectedProductiveCrewDays * (CONTINGENCY[confidence] ?? 0.25));
  const expectedCalendarDays = round1(expectedProductiveCrewDays + gapDays + MOBILISATION_DAYS + defectDays + contingencyDays);

  // Dates: active jobs project forward from the last worked day by remaining work; else from the planned start.
  const startBasis = (actuals && actuals.firstDate) || plannedStartDate || null;
  const remainingCalendarDays = round1(remainingCrewDays + defectDays + contingencyDays + (actuals ? 0 : gapDays + MOBILISATION_DAYS));
  const anchor = (actuals && actuals.lastDate) || plannedStartDate || null;
  const expectedCompletion = anchor ? addWorkingDays(anchor, Math.max(1, Math.ceil(remainingCalendarDays)), nonWork) : null;
  const marginRisk = be.available && expectedProductiveCrewDays > be.breakEvenAllowanceDays;

  return {
    source, confidence, sampleSize, crewSize: crew,
    expectedHours, consumedHours, remainingHours,
    expectedProductiveCrewDays, expectedCalendarDays,
    productionRate, percentComplete,
    expectedStart: startBasis, expectedCompletion,
    breakEven: be, marginRisk,
    assumptions: { crewSize: crew, hoursPerDay, gapDays, mobilisationDays: MOBILISATION_DAYS, defectDays, contingencyDays },
    explanation: explain({ source, confidence, sampleSize, includedStages, expectedHours, remainingHours, crew, productionRate, gapDays, percentComplete, marginRisk, historical }),
  };
}

// Structured explanation assembled from calculation outputs (never invented prose).
function explain(o) {
  const bits = [];
  if (o.source === "active_production") {
    bits.push(`Based on live production${o.percentComplete != null ? ` (${o.percentComplete}% complete)` : ""}`);
    if (o.productionRate != null) bits.push(`current rate ${o.productionRate} hrs/working-day`);
    bits.push(`${o.remainingHours} hrs remaining`);
  } else if (o.source === "historical") {
    bits.push(`Based on ${o.sampleSize} comparable job${o.sampleSize === 1 ? "" : "s"}`);
    bits.push(`${o.expectedHours} forecast hrs across ${o.includedStages.length} stage${o.includedStages.length === 1 ? "" : "s"}`);
  } else if (o.source === "budget_break_even") {
    bits.push("Budget-derived (no comparable history yet)");
    bits.push(`${o.expectedHours} planned hrs at target margin`);
  } else {
    bits.push("Insufficient data — manual estimate needed");
  }
  bits.push(`crew of ${o.crew}`);
  if (o.gapDays > 0) bits.push(`${o.gapDays} working-day inter-stage gap allowance`);
  if (o.marginRisk) bits.push("⚠ forecast exceeds the break-even labour allowance");
  return bits.join(" · ");
}

// Collate historical stage medians for a project_type from an array of comparable jobs'
// per-stage actuals (each: aggregateStages() output). Small-N: median hours per stage +
// median inter-stage gap. Returns { expectedHoursByStage, gapMediansByStage, sampleSize }.
export function collateHistorical(jobsStageActuals = []) {
  const hoursByStage = {}, gapByPair = {};
  let sampleSize = 0;
  for (const agg of jobsStageActuals) {
    if (!agg || !agg.stages?.length) continue;
    sampleSize++;
    for (const s of agg.stages) (hoursByStage[s.stage] ||= []).push(s.hours);
    for (const g of agg.gaps || []) (gapByPair[g.toStage] ||= []).push(g.gapWorkingDays);
  }
  const median = (arr) => { if (!arr.length) return null; const a = [...arr].sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  const expectedHoursByStage = {}, gapMediansByStage = {};
  for (const [st, arr] of Object.entries(hoursByStage)) expectedHoursByStage[st] = round1(median(arr));
  for (const [st, arr] of Object.entries(gapByPair)) gapMediansByStage[st] = round1(median(arr));
  return { expectedHoursByStage, gapMediansByStage, sampleSize };
}

export { stageLabel };
