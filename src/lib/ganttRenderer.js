import { toYmd } from "./dateYmd.js";

const LEGACY_PHASE_COLORS = {
  site_prep: "#64748b",
  substructure: "#78716c",
  frame: "#d97706",
  rough_in: "#2563eb",
  lock_up: "#16a34a",
  fitout: "#9333ea",
  completion: "#0d9488"
};

const PALETTE = ["#64748b", "#78716c", "#d97706", "#2563eb", "#16a34a", "#9333ea", "#0d9488", "#0ea5e9", "#db2777", "#65a30d"];

function hashPhaseColor(phase) {
  const p = String(phase || "");
  if (LEGACY_PHASE_COLORS[p]) return LEGACY_PHASE_COLORS[p];
  let h = 0;
  for (let i = 0; i < p.length; i++) h = (h * 31 + p.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function parseYmd(s) {
  const ymd = toYmd(s);
  if (!ymd) return null;
  const d = new Date(`${ymd}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function escapeXml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtWeekLabel(day) {
  const oneJan = new Date(day.getFullYear(), 0, 1);
  const n = Math.ceil(((day - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);
  return `W${n}`;
}

function statusOpacity(status) {
  if (status === "planned") return 0.55;
  if (status === "complete") return 1;
  return 0.9;
}

function statusFillPattern(status, phaseColor) {
  if (status === "complete") {
    return `<pattern id="pat-complete" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="4" height="8" transform="translate(0,0)" fill="${phaseColor}" fill-opacity="0.35"/>
      <rect width="4" height="8" transform="translate(4,0)" fill="#fff" fill-opacity="0.2"/>
    </pattern>`;
  }
  return "";
}

function taskDurationDays(t) {
  const s = toYmd(t.start_date);
  const e = toYmd(t.end_date || t.start_date);
  if (!s || !e) return 0;
  const a = new Date(`${s}T12:00:00`).getTime();
  const b = new Date(`${e}T12:00:00`).getTime();
  return Math.max(0, Math.round((b - a) / 86400000) + 1);
}

/** Longest-duration path on dependency DAG (approximate critical path). */
export function computeCriticalPathTaskIds(tasks) {
  const byId = new Map((tasks || []).map((t) => [t.id, t]));
  const memo = new Map();

  function longestFrom(tid) {
    if (memo.has(tid)) return memo.get(tid);
    const t = byId.get(tid);
    if (!t) return { score: 0, path: [] };
    const preds = (t.depends_on || []).filter((pid) => byId.has(pid));
    let best = { score: 0, path: [] };
    for (const p of preds) {
      const r = longestFrom(p);
      if (r.score > best.score) best = r;
    }
    const myDur = taskDurationDays(t);
    const out = { score: best.score + myDur, path: [...best.path, t.id] };
    memo.set(tid, out);
    return out;
  }

  let global = { score: -1, path: [] };
  for (const t of tasks || []) {
    const r = longestFrom(t.id);
    if (r.score > global.score) global = r;
  }
  return new Set(global.path);
}

function truncateText(s, maxChars) {
  const t = String(s || "");
  if (t.length <= maxChars) return t;
  return `${t.slice(0, Math.max(0, maxChars - 1))}…`;
}

function groupTasksByPhase(tasks) {
  const order = [];
  const seen = new Set();
  for (const t of tasks || []) {
    const ph = t.phase || "general";
    if (!seen.has(ph)) {
      seen.add(ph);
      order.push(ph);
    }
  }
  const blocks = [];
  for (const ph of order) {
    const list = (tasks || []).filter((t) => (t.phase || "general") === ph);
    if (!list.length) continue;
    let minS = list[0].start_date;
    let maxE = list[0].end_date || list[0].start_date;
    for (const t of list) {
      const s = t.start_date;
      const e = t.end_date || t.start_date;
      if (s && (!minS || s < minS)) minS = s;
      if (e && (!maxE || e > maxE)) maxE = e;
    }
    blocks.push({ phase: ph, tasks: list, spanStart: minS, spanEnd: maxE });
  }
  return blocks;
}

/**
 * @param {object[]} tasks
 * @param {{ start: string, end: string }} range
 * @param {{ phaseLabels?: Record<string, string>, weekColWidth?: number }} [options]
 */
export function buildGanttSvg(tasks, range, options = {}) {
  const weekColW = Math.max(80, Math.min(120, Number(options.weekColWidth) || 100));
  const dayW = weekColW / 7;
  const phaseLabels = options.phaseLabels || {};

  const startR = parseYmd(range.start);
  const endR = parseYmd(range.end);
  if (!startR || !endR || startR > endR) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="40"><text x="8" y="24">Invalid range</text></svg>';
  }

  const msPerDay = 86400000;
  const totalDays = Math.max(1, Math.round((endR - startR) / msPerDay) + 1);
  const headerH = 56;
  const rowH = 30;
  const leftPad = 8;
  const width = leftPad + totalDays * dayW + 24;
  const blocks = groupTasksByPhase(tasks);
  const critical = computeCriticalPathTaskIds(tasks);

  let rowCount = 0;
  for (const b of blocks) {
    rowCount += 1 + b.tasks.length;
  }
  if (!rowCount) rowCount = 1;
  const height = headerH + rowCount * rowH + 20;

  let defs = "";
  let body = "";

  body += `<rect x="0" y="0" width="${width}" height="${height}" fill="#fafafa"/>`;
  body += `<text x="${leftPad}" y="22" font-size="11" fill="#555">${escapeXml(range.start)} → ${escapeXml(range.end)}</text>`;

  for (let i = 0; i < totalDays; i++) {
    const x = leftPad + i * dayW;
    const day = new Date(startR);
    day.setDate(day.getDate() + i);
    const isMon = day.getDay() === 1;
    if (isMon) {
      body += `<text x="${x + 2}" y="40" font-size="9" fill="#666">${fmtWeekLabel(day)}</text>`;
    }
    if (day.getDate() === 1) {
      body += `<text x="${x + 2}" y="54" font-size="8" fill="#888">${day.toLocaleString("en-AU", { month: "short" })}</text>`;
    }
    const strokeW = day.getDay() === 1 ? 1.2 : 0.5;
    body += `<line x1="${x}" y1="${headerH - 4}" x2="${x}" y2="${height}" stroke="#e5e7eb" stroke-width="${strokeW}"/>`;
  }

  function xForDateStr(ymd) {
    const d = parseYmd(ymd);
    if (!d) return null;
    const di = Math.round((d - startR) / msPerDay);
    return leftPad + Math.max(0, di) * dayW;
  }

  const taskGeom = new Map();

  let y = headerH;
  for (const block of blocks) {
    const phColor = hashPhaseColor(block.phase);
    const phaseLabel = escapeXml(phaseLabels[block.phase] || String(block.phase).replace(/_/g, " "));
    const sx = xForDateStr(toYmd(block.spanStart));
    const ex = xForDateStr(toYmd(block.spanEnd || block.spanStart));
    if (sx != null && ex != null) {
      const barW = Math.max(weekColW * 0.25, ex - sx + dayW);
      body += `<rect x="${sx}" y="${y + 5}" width="${barW}" height="${rowH - 10}" rx="4" fill="${phColor}" fill-opacity="0.45" stroke="#334155" stroke-width="0.5"/>`;
      const labelW = barW - 8;
      body += `<text x="${sx + 6}" y="${y + rowH / 2 + 4}" font-size="11" font-weight="bold" fill="#ffffff">${truncateText(phaseLabel, Math.max(8, Math.floor(labelW / 6)))}</text>`;
    }
    y += rowH;

    for (const t of block.tasks) {
      const ys = y;
      const s = parseYmd(t.start_date);
      const e = parseYmd(t.end_date) || s;
      const col = hashPhaseColor(t.phase);
      const op = statusOpacity(t.status);
      if (t.status === "complete" && !defs.includes("pat-complete")) {
        defs += statusFillPattern("complete", col);
      }

      const sxBar = s ? leftPad + Math.max(0, Math.round((s - startR) / msPerDay)) * dayW : leftPad;
      const exBar = e ? leftPad + (Math.round((e - startR) / msPerDay) + 1) * dayW : sxBar + dayW;
      const barW = Math.max(dayW * 0.35, exBar - sxBar);
      const cyCenter = ys + rowH / 2;

      const fullTip = escapeXml(
        [t.name, t.trade, `${t.start_date || ""} – ${t.end_date || ""}`, t.hold_point_description, t.notes]
          .filter(Boolean)
          .join(" | ")
      );

      const crit = critical.has(t.id) || t.is_critical_path;
      const strokeCrit = crit ? ` stroke="#ea580c" stroke-width="2.5"` : ` stroke="#334155" stroke-width="0.5"`;

      if (t.is_hold_point) {
        const cx = sxBar + barW / 2;
        const cy = cyCenter;
        const fill = t.status === "delayed" ? "#f59e0b" : t.status === "blocked" ? "#dc2626" : col;
        body += `<g data-task-id="${t.id || ""}" data-task-start="${escapeXml(t.start_date || "")}" style="cursor:grab">`;
        body += `<polygon points="${cx},${cy - 9} ${cx + 9},${cy} ${cx},${cy + 9} ${cx - 9},${cy}" fill="${fill}" fill-opacity="${op}"${strokeCrit}><title>${fullTip}</title></polygon>`;
        body += `<text x="${cx}" y="${cy + 22}" text-anchor="middle" font-size="9" fill="#333" font-weight="600">${truncateText(escapeXml(t.name), 24)}</text>`;
        body += `</g>`;
        taskGeom.set(t.id, { x1: cx - 9, x2: cx + 9, yM: cy, kind: "diamond" });
      } else {
        let fillAttr = `fill="${col}" fill-opacity="${op}"`;
        if (t.status === "complete") fillAttr = `fill="url(#pat-complete)" fill-opacity="1"`;
        if (t.status === "delayed") fillAttr = `fill="#f59e0b" fill-opacity="${0.85}"`;
        if (t.status === "blocked") fillAttr = `fill="#dc2626" fill-opacity="${0.9}"`;
        body += `<rect data-task-id="${t.id || ""}" data-task-start="${escapeXml(t.start_date || "")}" x="${sxBar}" y="${ys + 6}" width="${barW}" height="${rowH - 12}" rx="3" ${fillAttr}${strokeCrit} style="cursor:grab"><title>${fullTip}</title></rect>`;
        if (barW >= 120) {
          const pad = 6;
          const clipId = `c-${String(t.id || "x").replace(/[^a-z0-9-]/gi, "")}`;
          defs += `<clipPath id="${clipId}"><rect x="${sxBar + pad}" y="${ys + 6}" width="${barW - pad * 2}" height="${rowH - 12}"/></clipPath>`;
          body += `<text clip-path="url(#${clipId})" x="${sxBar + pad}" y="${cyCenter + 4}" font-size="11" fill="#ffffff" font-weight="500">${truncateText(escapeXml(t.name), 200)}</text>`;
        }
        taskGeom.set(t.id, { x1: sxBar, x2: sxBar + barW, yM: cyCenter, kind: "bar" });
      }

      if (t.order_by_date) {
        const od = parseYmd(t.order_by_date);
        if (od && od >= startR && od <= endR) {
          const ox = leftPad + Math.round((od - startR) / msPerDay) * dayW + 2;
          body += `<text x="${ox}" y="${ys + rowH - 2}" font-size="10" fill="#b45309">▶</text>`;
        }
      }

      y += rowH;
    }
  }

  for (const t of tasks || []) {
    const deps = t.depends_on || [];
    const predName = (id) => {
      const p = tasks.find((x) => x.id === id);
      return p ? p.name : id;
    };
    for (const pid of deps) {
      const A = taskGeom.get(pid);
      const B = taskGeom.get(t.id);
      if (!A || !B) continue;
      const x1 = A.kind === "bar" ? A.x2 : (A.x1 + A.x2) / 2 + 9;
      const y1 = A.yM;
      const x2 = B.kind === "bar" ? B.x1 : (B.x1 + B.x2) / 2 - 9;
      const y2 = B.yM;
      const mx = (x1 + x2) / 2;
      const d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
      const title = escapeXml(`${predName(pid)} must complete before ${t.name} can start`);
      body += `<path d="${d}" fill="none" stroke="#CCCCCC" stroke-width="1.2" stroke-opacity="0.95"><title>${title}</title></path>`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="min-width:${width}px" data-gantt-day-w="${dayW}" data-gantt-left-pad="${leftPad}" data-gantt-range-start="${range.start}"><defs>${defs}</defs>${body}</svg>`;
}

export const PHASE_COLORS = new Proxy(LEGACY_PHASE_COLORS, {
  get(target, prop) {
    if (prop in target) return target[prop];
    return hashPhaseColor(String(prop));
  }
});
