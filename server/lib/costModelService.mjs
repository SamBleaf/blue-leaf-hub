// Shared reader for the Company Cost Model (mig 090) — used by the carpentry burn-rate (P3),
// the workforce loaded-cost push (P4), and the schedule budget-days guardrail (P5).
// Returns null gracefully if migration 090 isn't applied yet, so callers never break.
import { getServiceSupabase } from "./supabaseService.mjs";

export async function getCostModel(sb) {
  sb = sb || getServiceSupabase();
  if (!sb) return null;
  try {
    const { data: model, error } = await sb.from("company_cost_model").select("*").limit(1).maybeSingle();
    if (error) return null; // tables not present (migration 090 not yet applied)
    const { data: rates } = await sb.from("employee_cost_rates").select("*");
    const ratesById = {};
    let teamChargeUp = 0, teamBreakEven = 0;
    for (const r of rates || []) {
      if (r.employee_id) ratesById[r.employee_id] = r;
      teamChargeUp += Number(r.charge_up_hourly || 0);
      teamBreakEven += Number(r.break_even_hourly || 0);
    }
    const hoursPerDay = Number(model?.hours_per_day) || 8;
    return {
      model: model || null,
      rates: rates || [],
      ratesById,
      hoursPerDay,
      marginPct: Number(model?.margin_pct) || 0,
      headcount: (rates || []).length,
      // Whole-team day rates (the "work backward from full team" planned basis)
      teamChargeUpPerDay: teamChargeUp * hoursPerDay,
      teamBreakEvenPerDay: teamBreakEven * hoursPerDay,
    };
  } catch { return null; }
}

// The loaded labour cost rate for an employee — break-even (wage + on-costs + overhead),
// falling back to true cost. Returns null if no synced rate (caller uses base pay rate).
export function loadedRate(cm, employeeId) {
  const r = cm?.ratesById?.[employeeId];
  if (!r) return null;
  return Number(r.break_even_hourly ?? r.true_hourly) || null;
}

const div = (a, b) => (b > 0 ? a / b : null);

// Burn-rate for a single labour budget line. labourValue = budget for that category.
export function burnForLine(labourValue, actualCost, actualHours, cm) {
  if (!cm) return null;
  const atMarginDays = div(labourValue, cm.teamChargeUpPerDay);
  const breakEvenDays = div(labourValue, cm.teamBreakEvenPerDay);
  const pctConsumed = labourValue > 0 ? actualCost / labourValue : null;
  const marginRemaining = labourValue - actualCost;
  // 🟢 comfortably under · 🟡 within break-even band · 🔴 over the value (unprofitable)
  let status = "ok";
  if (pctConsumed != null) {
    if (pctConsumed >= 1) status = "over";
    else if (pctConsumed >= (1 - (cm.marginPct || 0))) status = "warn";
  }
  return {
    atMarginDays: atMarginDays == null ? null : Math.round(atMarginDays * 10) / 10,
    breakEvenDays: breakEvenDays == null ? null : Math.round(breakEvenDays * 10) / 10,
    actualHours: Math.round(actualHours * 10) / 10,
    pctConsumed: pctConsumed == null ? null : Math.round(pctConsumed * 1000) / 1000,
    marginRemaining: Math.round(marginRemaining * 100) / 100,
    status,
  };
}
