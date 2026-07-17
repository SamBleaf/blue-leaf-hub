// =============================================================================
// pipelineTimeline.js — pure geometry for the Workforce Pipeline timeline.
//
// TIMELINE-LIBRARY DECISION (plan §8 spike outcome): gantt-task-react models one
// styled bar per task and cannot cleanly render, per row, a committed bar + a
// dashed forecast extension + an actual-progress fill + a break-even marker + an
// aligned capacity lane. So the Pipeline uses a CUSTOM lightweight timeline:
// absolute-positioned bars on a percentage date axis (left% / width% of the view
// window). Percentages keep it responsive with no pixel measurement. This module
// holds all the date→position maths so the components stay presentational.
// =============================================================================

// Parse 'YYYY-MM-DD' to a local Date at noon (DST-safe), same convention as the server.
function parse(ymd) {
  if (!ymd) return null;
  const [y, m, d] = String(ymd).split("-").map(Number);
  if (!y) return null;
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}
const DAY = 86400000;
export function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function daysBetween(fromYmd, toYmd) {
  const a = parse(fromYmd), b = parse(toYmd);
  if (!a || !b) return 0;
  return Math.round((b - a) / DAY);
}
const clampPct = (n) => Math.max(0, Math.min(100, n));

// Left offset (%) of a date within [from,to]. Dates outside clamp to 0/100.
export function leftPct(dateYmd, from, to) {
  const total = daysBetween(from, to) || 1;
  return clampPct((daysBetween(from, dateYmd) / total) * 100);
}

// A bar clipped to the view window: { leftPct, widthPct, clippedStart, clippedEnd } or null if
// the [start,end] range lies entirely outside [from,to].
export function barGeometry(start, end, from, to) {
  if (!start) return null;
  const e = end && end >= start ? end : start;
  if (e < from || start > to) return null;                 // entirely outside the window
  const total = daysBetween(from, to) || 1;
  const cStart = start < from ? from : start;
  const cEnd = e > to ? to : e;
  const left = clampPct((daysBetween(from, cStart) / total) * 100);
  // +1 day so a single-day range is visible; width is the inclusive span.
  const width = clampPct(((daysBetween(cStart, cEnd) + 1) / total) * 100);
  return { leftPct: left, widthPct: Math.max(width, 0.6), clippedStart: cStart, clippedEnd: cEnd };
}

// Axis ticks (month boundaries for month/quarter/year; week Mondays for the week horizon).
export function axisTicks(from, to, horizon) {
  const a = parse(from), b = parse(to);
  if (!a || !b) return [];
  const ticks = [];
  if (horizon === "week") {
    const cur = new Date(a);
    const dow = (cur.getDay() + 6) % 7;                     // 0=Mon
    cur.setDate(cur.getDate() - dow);                       // back to Monday
    for (; cur <= b; cur.setDate(cur.getDate() + 7)) {
      const t = ymd(cur);
      ticks.push({ key: t, leftPct: leftPct(t, from, to), label: shortDate(cur), major: false });
    }
  } else {
    const cur = new Date(a.getFullYear(), a.getMonth(), 1, 12);
    for (; cur <= b; cur.setMonth(cur.getMonth() + 1)) {
      const t = ymd(cur);
      ticks.push({ key: t, leftPct: leftPct(t, from, to), label: monthLabel(cur), major: cur.getMonth() === 0 });
    }
  }
  return ticks.filter((t) => t.leftPct > 0.01 && t.leftPct < 99.99);
}

function shortDate(d) { return `${d.getDate()}/${d.getMonth() + 1}`; }
function monthLabel(d) {
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return d.getMonth() === 0 ? `${M[0]} ${d.getFullYear()}` : M[d.getMonth()];
}

// Horizon navigation: shift the anchor date by one whole horizon (± direction).
export function shiftAnchor(anchorYmd, horizon, dir) {
  const d = parse(anchorYmd) || new Date();
  if (horizon === "week") d.setDate(d.getDate() + 7 * dir);
  else if (horizon === "month") d.setMonth(d.getMonth() + dir);
  else if (horizon === "quarter") d.setMonth(d.getMonth() + 3 * dir);
  else d.setFullYear(d.getFullYear() + dir);
  return ymd(d);
}

// The window [from,to] for a horizon anchored at anchorYmd (anchor = start of the window).
export function horizonWindow(anchorYmd, horizon) {
  const d = parse(anchorYmd) || new Date();
  const from = new Date(d);
  const to = new Date(d);
  if (horizon === "week") { const dow = (from.getDay() + 6) % 7; from.setDate(from.getDate() - dow); to.setTime(from.getTime()); to.setDate(to.getDate() + 6); }
  else if (horizon === "month") { from.setDate(1); to.setMonth(to.getMonth() + 1); to.setDate(0); }
  else if (horizon === "quarter") { const q = Math.floor(from.getMonth() / 3) * 3; from.setMonth(q, 1); to.setMonth(q + 3, 0); }
  else { from.setMonth(0, 1); to.setMonth(11, 31); }
  return { from: ymd(from), to: ymd(to) };
}

export function todayYmd() { return ymd(new Date()); }
