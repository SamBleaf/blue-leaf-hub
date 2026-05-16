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
