// =============================================================================
// Working-calendar utilities (Workforce Pipeline / Schedule Intelligence v1)
// Pure, dependency-free date math. Non-working days (weekends + public holidays +
// RDOs) are INJECTED as Sets of 'YYYY-MM-DD' strings so these functions stay pure and
// unit-testable — the route layer fetches them (workforceRoutes non-working-days) and
// passes them in. All dates are local 'YYYY-MM-DD' strings (never UTC-sliced).
// =============================================================================

// Parse 'YYYY-MM-DD' to a LOCAL Date at noon (noon avoids DST edge shifts).
function parse(ymd) {
  const [y, m, d] = String(ymd).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}
export function toYmd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function isWeekend(ymd) {
  const dow = parse(ymd).getDay(); // 0 Sun … 6 Sat
  return dow === 0 || dow === 6;
}

// A working day = weekday, not a public holiday, not an RDO (holidays/rdo are Sets of ymd).
export function isWorkingDay(ymd, { holidays, rdo } = {}) {
  if (isWeekend(ymd)) return false;
  if (holidays && holidays.has(ymd)) return false;
  if (rdo && rdo.has(ymd)) return false;
  return true;
}

// Inclusive count of working days in [fromYmd, toYmd]. 0 if to < from or either missing.
export function workingDaysBetween(fromYmd, toYmd, nonWork = {}) {
  if (!fromYmd || !toYmd) return 0;
  let a = parse(fromYmd), b = parse(toYmd);
  if (b < a) return 0;
  let n = 0;
  for (const cur = new Date(a); cur <= b; cur.setDate(cur.getDate() + 1)) {
    if (isWorkingDay(toYmd0(cur), nonWork)) n++;
  }
  return n;
}
// tiny helper to avoid re-formatting inside the loop hot path
function toYmd0(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

// The date that is `n` WORKING days after (or, with a negative n, before) fromYmd.
// n=0 returns the next working day on/after fromYmd. Positive n counts forward.
export function addWorkingDays(fromYmd, n, nonWork = {}) {
  if (!fromYmd) return null;
  const step = n < 0 ? -1 : 1;
  let remaining = Math.abs(n);
  const cur = parse(fromYmd);
  // land on a working day first (0 working-days-from a weekend → next working day)
  while (!isWorkingDay(toYmd0(cur), nonWork)) cur.setDate(cur.getDate() + step);
  while (remaining > 0) {
    cur.setDate(cur.getDate() + step);
    if (isWorkingDay(toYmd0(cur), nonWork)) remaining--;
  }
  return toYmd0(cur);
}

// Elapsed inclusive CALENDAR days in [from, to] (weekends/holidays included) — the
// "elapsed" side of the productive-vs-elapsed distinction.
export function calendarDaysBetween(fromYmd, toYmd) {
  if (!fromYmd || !toYmd) return 0;
  const a = parse(fromYmd), b = parse(toYmd);
  if (b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

// Working days per whole weeks/months a horizon spans — used by capacity denominators.
// Returns [{ periodStart, periodEnd, workingDays }] bucketed by 'week' (Mon-anchored) or 'month'.
export function bucketWorkingDays(fromYmd, toYmd, periodType, nonWork = {}) {
  if (!fromYmd || !toYmd) return [];
  const buckets = [];
  const a = parse(fromYmd), b = parse(toYmd);
  if (b < a) return [];
  const cur = new Date(a);
  let key = periodKey(cur, periodType);
  let start = toYmd0(cur), wd = 0;
  for (; cur <= b; cur.setDate(cur.getDate() + 1)) {
    const k = periodKey(cur, periodType);
    if (k !== key) {
      buckets.push({ periodStart: start, workingDays: wd, periodType });
      key = k; start = toYmd0(cur); wd = 0;
    }
    if (isWorkingDay(toYmd0(cur), nonWork)) wd++;
  }
  buckets.push({ periodStart: start, workingDays: wd, periodType });
  return buckets;
}
// Re-exports so other pure services share one date/period implementation (no duplication).
export const parseYmd = (ymd) => parse(ymd);
export const periodKeyOf = (ymd, periodType) => periodKey(parse(ymd), periodType);

function periodKey(date, periodType) {
  if (periodType === "month") return `${date.getFullYear()}-${date.getMonth()}`;
  if (periodType === "quarter") return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3)}`;
  if (periodType === "year") return `${date.getFullYear()}`;
  // week — ISO-ish Monday anchor
  const d = new Date(date); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow);
  return toYmd0(d);
}
