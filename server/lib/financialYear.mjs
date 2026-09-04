// =============================================================================
// financialYear.mjs — one canonical AU financial-year helper.
//
// Promoted verbatim from the auFyQuarter() that lived inline in carpentryRoutes.mjs
// so carpentry, chargeUp, and the new internal-category service all read the SAME
// FY + quarter maths. AU FY runs 1 Jul → 30 Jun; label = start year + last two digits
// of the end year, e.g. "2025-26". Quarters within the FY: Q1 Jul–Sep, Q2 Oct–Dec,
// Q3 Jan–Mar, Q4 Apr–Jun.
//
// NOTE (deliberate, not an oversight): chargeUpService.auFinancialYear() uses a DIFFERENT
// label format ("2025/26", slash, no quarters) and is left untouched here — repointing it
// would change the charge-up report's emitted FY label, which the Phase 1 brief forbids
// ("WITHOUT changing behaviour"). Only the identical-behaviour auFyQuarter is unified.
// =============================================================================

// AU financial year (Jul–Jun) + quarter for a YYYY-MM-DD date. FY label e.g. "2025-26".
// Returns { fy, q } — key is `q` (not `quarter`) to preserve the original caller shape.
export function auFyQuarter(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const m = d.getUTCMonth(), y = d.getUTCFullYear();
  const fyStart = m >= 6 ? y : y - 1;
  const fy = `${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")}`;
  const q = m >= 6 ? Math.floor((m - 6) / 3) + 1 : Math.floor((m + 6) / 3) + 1;
  return { fy, q };
}

// Employer super-guarantee (SG) rate by AU financial year — used to cost paid-leave days
// (Annual + Sick) as cost-to-business. The statutory rate has stepped up, so this is a
// per-FY lookup, not a constant, letting a historical FY cost correctly. RDO leave does
// NOT use this (break_even_hourly already contains super — never re-add it).
//
// Keyed by the auFyQuarter() label format ("2025-26"). Any FY not listed — including
// 2025-26 onward and anything pre-2023 — defaults to the latest statutory rate, 12%.
export const SUPER_GUARANTEE_BY_FY = {
  "2023-24": 0.11,
  "2024-25": 0.115,
  "2025-26": 0.12,
};

export function superGuaranteeForFy(fyLabel) {
  if (fyLabel && SUPER_GUARANTEE_BY_FY[fyLabel] != null) return SUPER_GUARANTEE_BY_FY[fyLabel];
  return 0.12; // default: latest statutory rate (2025-26 onward)
}
