export function toYmd(value) {
  if (value == null || value === "") return "";
  const t = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  if (/^\d{4}-\d{2}-\d{2}T/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  const day = Number(m[1]);
  const month = Number(m[2]);
  const y = Number(m[3]);
  if (!y || month < 1 || month > 12 || day < 1 || day > 31) return "";
  const out = `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const dt = new Date(`${out}T12:00:00`);
  if (Number.isNaN(dt.getTime()) || dt.getFullYear() !== y || dt.getMonth() + 1 !== month || dt.getDate() !== day) return "";
  return out;
}

export function addDaysYmd(ymd, days) {
  const base = toYmd(ymd);
  if (!base) throw new Error("Invalid date");
  const d = new Date(`${base}T12:00:00`);
  d.setDate(d.getDate() + days);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date");
  return d.toISOString().slice(0, 10);
}

// The business operates in Australia (QLD). Computing "today" via
// new Date().toISOString().slice(0,10) returns the UTC date, which is the
// PREVIOUS day for the first ~10 hours of every AEST day — an off-by-one that
// corrupts week boundaries, "missing timesheet" flags and (downstream) payroll.
// Always derive calendar dates in the business timezone.
export const BUSINESS_TZ = "Australia/Brisbane"; // UTC+10, no DST

// Current calendar date (YYYY-MM-DD) in the business timezone.
export function todayYmd(tz = BUSINESS_TZ) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

// Monday (week start) of the week containing the given YYYY-MM-DD.
// Noon-anchored so getDay()/setDate() never cross a UTC or DST boundary.
export function mondayOf(ymd) {
  const base = toYmd(ymd) || todayYmd();
  const d = new Date(`${base}T12:00:00`);
  const day = d.getDay(); // 0=Sun … 6=Sat (local, but noon-anchored so stable)
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
