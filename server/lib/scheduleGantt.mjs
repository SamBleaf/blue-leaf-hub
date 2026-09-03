// scheduleGantt.mjs — SC-2. Renders the canonical schedule (scheduleEngine) as a self-contained SVG
// construction-programme chart — the exact "Process and Timeline" visual, generated from data.
// Served as a preview now; the final DOCX embed (rasterise to PNG for docxtemplater's image module,
// OR a native shaded-table Gantt) is settled when the PBSA template is locked. Time-based (months
// from site start); buffers are already baked into the schedule (internal — never labelled here).
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Blue Leaf palette — restrained, on-brand construction stages.
const STAGE_COLORS = ["#8a7250", "#6f7d84", "#4a6b78", "#006c9b", "#0e8a86", "#b5852f", "#4f8a6a", "#2E6B4F", "#12556c"];

/**
 * Build the programme Gantt as an SVG string from a canonical schedule (scheduleEngine output).
 * Returns null when there's no schedule.
 */
export function buildScheduleGanttSvg(schedule) {
  if (!schedule || !Array.isArray(schedule.stages) || !schedule.stages.length) return null;
  const stages = schedule.stages;
  const months = Math.max(1, Math.ceil(schedule.totalWeeks / 4.345));

  const LABEL_W = 176, RIGHT = 748, TOP = 26, ROW_H = 35, BAR_H = 20;
  const timeW = RIGHT - LABEL_W;
  const monthW = timeW / months;
  const W = 760, H = TOP + stages.length * ROW_H + 34;
  const xOfWeek = (wk) => LABEL_W + (wk / 4.345) * monthW;   // week (0-based edge) → x

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="Segoe UI, system-ui, Arial, sans-serif">`);
  parts.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);

  // month gridlines + header
  parts.push(`<text x="12" y="16" font-size="10" font-weight="700" fill="#6b6b6b">STAGE</text>`);
  for (let m = 0; m <= months; m++) {
    const x = (LABEL_W + m * monthW).toFixed(1);
    parts.push(`<line x1="${x}" y1="${TOP - 2}" x2="${x}" y2="${TOP + stages.length * ROW_H}" stroke="#e6ebee" stroke-width="1"/>`);
    if (m < months) {
      const cx = (LABEL_W + (m + 0.5) * monthW).toFixed(1);
      parts.push(`<text x="${cx}" y="16" font-size="10.5" font-weight="700" fill="#8f8f8f" text-anchor="middle">M${m + 1}</text>`);
    }
  }

  // stage rows: label + bar
  stages.forEach((s, i) => {
    const rowY = TOP + i * ROW_H;
    const color = STAGE_COLORS[i % STAGE_COLORS.length];
    const x0 = xOfWeek(s.startWeek - 1);
    const x1 = xOfWeek(s.endWeek);
    const w = Math.max(6, x1 - x0);
    parts.push(`<text x="12" y="${(rowY + 18).toFixed(0)}" font-size="12.5" fill="#242424">${esc(s.label)}</text>`);
    parts.push(`<rect x="${x0.toFixed(1)}" y="${(rowY + 6).toFixed(0)}" width="${w.toFixed(1)}" height="${BAR_H}" rx="4" fill="${color}"/>`);
  });

  // handover marker at the end of the last bar
  const lastY = TOP + (stages.length - 1) * ROW_H + 16;
  const hx = xOfWeek(stages[stages.length - 1].endWeek);
  parts.push(`<path d="M${hx.toFixed(1)} ${(lastY - 7).toFixed(0)} l7 7 -7 7 -7 -7 z" fill="#C08A2C"/>`);
  parts.push(`<text x="${hx.toFixed(1)}" y="${(TOP + stages.length * ROW_H + 20).toFixed(0)}" font-size="10" fill="#C08A2C" font-weight="700" text-anchor="end">Handover</text>`);

  parts.push(`</svg>`);
  return parts.join("");
}
