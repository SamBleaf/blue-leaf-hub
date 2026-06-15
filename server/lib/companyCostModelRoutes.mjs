// Company Cost Model (P1) — sync the Google Sheet (Overheads / OperatingParams / EmployeeRates)
// into the Hub's canonical store, and expose it for every module (carpentry burn-rate, finance,
// schedule, workforce). Read of the sheet is via googleSheetsClient (OAuth, read-only).
import { config as dotenvConfig } from "dotenv";
import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth, requireRole } from "./requireAuth.mjs";
import { googleSheetsConfigured, readNamedRanges } from "./googleSheetsClient.mjs";

const { parsed: _env = {} } = dotenvConfig();
const sheetId = () => process.env.GOOGLE_COST_MODEL_SHEET_ID?.trim() || _env.GOOGLE_COST_MODEL_SHEET_ID?.trim();

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

// OperatingParams range = rows of [label, value]
function parseParams(rows) {
  const p = {};
  for (const row of rows || []) {
    const k = String(row[0] || "").toLowerCase();
    const v = num(row[1]);
    if (k.includes("working weeks")) p.working_weeks = v;
    else if (k.includes("productive hours")) p.productive_hours_week = v;
    else if (k.includes("hours per day")) p.hours_per_day = v;
    else if (k.includes("headcount")) p.headcount = v;
    else if (k.includes("margin")) p.margin_pct = v;
    else if (k.includes("productive labour")) p.productive_pct = v;
  }
  return p;
}

export function registerCompanyCostModelRoutes(app) {
  // Read the current model + per-employee rates
  app.get("/api/cost-model", requireAuth, async (_req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(500).json({ ok: false, error: "Database not configured" });
    const [{ data: model }, { data: rates }] = await Promise.all([
      sb.from("company_cost_model").select("*").limit(1).maybeSingle(),
      sb.from("employee_cost_rates").select("*").order("charge_up_hourly", { ascending: false }),
    ]);
    res.json({
      ok: true,
      model: model || null,
      rates: rates || [],
      configured: googleSheetsConfigured() && !!sheetId(),
    });
  });

  // Pull the latest numbers from the Google Sheet
  app.post("/api/cost-model/sync", requireAuth, requireRole("admin", "supervisor"), async (_req, res) => {
    const sb = getServiceSupabase();
    const id = sheetId();
    if (!googleSheetsConfigured() || !id) {
      return res.status(400).json({ ok: false, error: "Google Sheets not configured — need GOOGLE_DRIVE_* OAuth + GOOGLE_COST_MODEL_SHEET_ID." });
    }
    try {
      const ranges = await readNamedRanges(id, ["OperatingParams", "Overheads", "EmployeeRates"]);

      const params = parseParams(ranges.OperatingParams);
      const overheads = (ranges.Overheads || []).filter((r) => r[0] != null && r[0] !== "")
        .map((r) => ({ name: String(r[0]), annual: num(r[1]) || 0 }));
      const overhead_total = overheads.reduce((s, o) => s + o.annual, 0);
      const teamProductiveHours = (params.headcount || 0) * (params.working_weeks || 0) * (params.productive_hours_week || 0);
      const overhead_recovery_per_hour = teamProductiveHours > 0 ? overhead_total / teamProductiveHours : null;

      // EmployeeRates range = [name, base, true, +overhead, break-even, charge-up]
      const rateRows = (ranges.EmployeeRates || []).filter((r) => r[0] != null && r[0] !== "").map((r) => ({
        employee_name: String(r[0]).trim(),
        base_hourly: num(r[1]), true_hourly: num(r[2]), overhead_hourly: num(r[3]),
        break_even_hourly: num(r[4]), charge_up_hourly: num(r[5]),
      }));

      // Match each sheet name to an employee record (name-based, like the labour push)
      const { data: emps } = await sb.from("employees").select("id, name");
      const byName = {};
      (emps || []).forEach((e) => { byName[String(e.name || "").trim().toLowerCase()] = e.id; });
      const unmatched = [];
      for (const rr of rateRows) {
        rr.employee_id = byName[rr.employee_name.toLowerCase()] || null;
        if (!rr.employee_id) unmatched.push(rr.employee_name);
      }

      // Upsert the singleton model row
      const modelRow = {
        google_sheet_id: id, ...params,
        overhead_total, overhead_recovery_per_hour, overheads,
        last_synced_at: new Date().toISOString(), last_sync_status: "ok", sync_error: null,
        updated_at: new Date().toISOString(),
      };
      const { data: existing } = await sb.from("company_cost_model").select("id").limit(1).maybeSingle();
      if (existing) await sb.from("company_cost_model").update(modelRow).eq("id", existing.id);
      else await sb.from("company_cost_model").insert(modelRow);

      // Upsert each employee's rates (by name)
      for (const rr of rateRows) {
        await sb.from("employee_cost_rates").upsert({ ...rr, synced_at: new Date().toISOString() }, { onConflict: "employee_name" });
      }

      res.json({
        ok: true,
        synced: { employees: rateRows.length, overheads: overheads.length },
        overhead_recovery_per_hour,
        overhead_total,
        unmatched, // sheet names with no matching employee record
      });
    } catch (e) {
      console.warn("[cost-model/sync] failed:", e?.message);
      const { data: existing } = await sb.from("company_cost_model").select("id").limit(1).maybeSingle();
      if (existing) await sb.from("company_cost_model").update({ last_sync_status: "error", sync_error: e?.message, last_synced_at: new Date().toISOString() }).eq("id", existing.id);
      res.status(502).json({ ok: false, error: e?.message || "Sync failed" });
    }
  });
}
