// =============================================================================
// shared/takeoff/engine/floor/drawing.js — Floor frame Phase 4: the scaled layout drawing as plain data (Sam, 19 Nov 2026).
// PURE. floorDrawing(layout) turns the engine's floor layout (plan-frame millimetres) into a model of three primitives: polygons, lines, text.
// The same model is drawn by the Layout view (SVG, src/components/takeoff/measure/FloorLayoutView.jsx) and by the takeoff PDF (pdfkit),
// so the screen and the paper cannot disagree. Hatching is generated geometry (lines clipped to the shape), so neither renderer needs patterns.
// The legend and the summary come back beside the drawing (not inside it) so the screen can print them as readable HTML at phone width.
// =============================================================================

const r1 = (n) => Math.round(n * 10) / 10;
const hypot = Math.hypot;

/** Fills of the three sheet products (light, distinct) and the line colours. */
export const FLOOR_DRAWING_COLORS = Object.freeze({
  structaflor: "#f1e2bf", hebel: "#d8e3f0", scyon: "#cdeee8",
  truss: "#64748b", trussCut: "#b45309", strongback: "#c2410c", trimmer: "#7c3aed", beam: "#0f4c75", controlJoint: "#dc2626", edge: "#1a1a2e", void: "#6b7280", wet: "#0d9488", ink: "#1a1a2e",
});
const C = FLOOR_DRAWING_COLORS;

/** Hatch lines at 45 degrees clipped to a polygon (even-odd, so concave shapes work). */
function hatchLines(pts, spacing) {
  const out = [];
  const cs = pts.map((p) => p.x + p.y);
  const lo = Math.min(...cs), hi = Math.max(...cs);
  for (let c = Math.ceil(lo / spacing) * spacing + spacing / 2; c < hi; c += spacing) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const fa = a.x + a.y - c, fb = b.x + b.y - c;
      if ((fa < 0) === (fb < 0) || fa === fb) continue;
      const t = fa / (fa - fb);
      xs.push(a.x + t * (b.x - a.x));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) out.push({ a: { x: xs[i], y: c - xs[i] }, b: { x: xs[i + 1], y: c - xs[i + 1] } });
  }
  return out;
}

const centroid = (pts) => ({ x: pts.reduce((t, p) => t + p.x, 0) / pts.length, y: pts.reduce((t, p) => t + p.y, 0) / pts.length });

/**
 * @param {object} layout  the engine's floor layout (layoutFloor + sheets / wetSheets / controlJoints), plan-frame millimetres
 * @param {{ name?: string }} [opts]
 * @returns {null | { width:number, height:number, title:string, items:Array<object>, legend:Array<object>, summary:Array<string>, counts:object }}
 */
export function floorDrawing(layout, opts = {}) {
  if (!layout || !layout.totals || !(layout.outline || []).length) return null;
  const O = layout.outline;
  const xs = O.map((p) => p.x), ys = O.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const bw = maxX - minX, bh = maxY - minY;
  const S = Math.max(bw, bh, 1);
  const fs = S / 38;                    // label size in drawing mm
  const pad = fs * 5;                   // room for edge labels and dimension lines
  const padL = fs * 9;                  // the left dimension text sits in the left margin
  const P = (q) => ({ x: r1(q.x - minX + padL), y: r1(q.y - minY + pad) });
  const items = [];
  const poly = (pts, o = {}) => items.push({ t: "poly", pts: pts.map(P), ...o });
  const line = (a, b, o = {}) => items.push({ t: "line", a: P(a), b: P(b), ...o });
  const text = (q, s, o = {}) => items.push({ t: "text", x: P(q).x, y: P(q).y, s: String(s), size: o.size || fs, anchor: o.anchor || "middle", fill: o.fill || C.ink, bold: !!o.bold, ...(o.bg ? { bg: true } : {}), ...(o.data ? { data: o.data } : {}) });
  const label = (q, s, o = {}) => text(q, s, { bg: true, ...o });
  const hatch = (pts, color, spacing, data) => { for (const h of hatchLines(pts.map(P), spacing)) items.push({ t: "line", a: h.a, b: h.b, stroke: color, sw: fs * 0.07, opacity: 0.7, data }); };
  const counts = { sheetPieces: 0, cutPieces: 0, wetPieces: 0, joints: 0, trussLines: 0, controlJoints: 0, legendKeys: [] };

  const sheets = layout.sheets || null;
  const product = sheets?.product === "hebel" ? "hebel" : "structaflor";
  const sheetSize = sheets?.sheet || null;
  const isCut = (p, sz) => !!sz && (p.lengthMm < sz.lengthMm - 10 || p.widthMm < sz.widthMm - 5);

  // 1  sheets (main floor then wet areas), each piece outlined; a cut piece also carries its size
  const sheetFill = (pieces, sz, fill, kind) => {
    for (const p of pieces) {
      const cut = isCut(p, sz);
      poly(p.corners, { fill, stroke: "#8a8f98", sw: fs * 0.09, data: cut ? `${kind}-cut` : `${kind}-sheet` });
      if (kind === "wet") counts.wetPieces++; else counts.sheetPieces++;
      if (cut && kind !== "wet") counts.cutPieces++;
      if (cut) {
        const c = p.corners; // small corner tick marks a cut piece, and a size note when it is big enough to read
        const w = hypot(c[1].x - c[0].x, c[1].y - c[0].y), h = hypot(c[3].x - c[0].x, c[3].y - c[0].y);
        const k = Math.min(fs * 1.2, w / 3, h / 3);
        if (k > 1) { const u = { x: (c[1].x - c[0].x) / w, y: (c[1].y - c[0].y) / w }, v = { x: (c[3].x - c[0].x) / h, y: (c[3].y - c[0].y) / h };
          line({ x: c[0].x + u.x * k, y: c[0].y + u.y * k }, { x: c[0].x + v.x * k, y: c[0].y + v.y * k }, { stroke: C.controlJoint, sw: fs * 0.12, data: "cut-mark" }); }
        if (w > fs * 9 && h > fs * 2.2 && kind !== "wet") text(centroid(c), `${Math.round(p.lengthMm)}x${Math.round(p.widthMm)}`, { size: fs * 0.62, fill: "#4b5563", data: "cut-size" });
      }
    }
  };
  if (sheets?.pieces?.length) sheetFill(sheets.pieces, sheetSize, C[product], "main");
  const wetSets = layout.wetSheets || [];
  for (const ws of wetSets) sheetFill(ws.pieces || [], ws.sheet, C.scyon, "wet");
  // joints = end joints between two pieces of one row (not the rows' long edges)
  if (sheets?.rowJoints) counts.joints = sheets.rowJoints.reduce((t, r) => t + r.length, 0);

  // 2  voids and wet areas on top of the sheets
  for (const v of layout.voids || []) {
    poly(v.points, { fill: "#ffffff", stroke: C.void, sw: fs * 0.12, dash: v.stair ? null : [fs * 0.5, fs * 0.3], data: v.stair ? "void-stair" : "void" });
    if (v.stair) hatch(v.points, C.void, fs * 0.55, "void-hatch");
    label(centroid(v.points), v.stair ? (v.name || "Stair void") : (v.name || "Opening"), { size: fs * 0.8, bold: true, fill: "#374151" });
  }
  for (const w of layout.wets || []) {
    poly(w.points, { fill: "none", stroke: C.wet, sw: fs * 0.14, data: "wet" });
    hatch(w.points, C.wet, fs * 0.7, "wet-hatch");
    const sz = wetSets[0]?.sheet;
    label(centroid(w.points), `${w.name || "Wet area"} · ${sz ? `Scyon ${sz.lengthMm}x${sz.widthMm}x${sz.thicknessMm}` : "Scyon"}`, { size: fs * 0.8, bold: true, fill: "#0f766e" });
  }

  // 3  outline
  poly(O, { fill: "none", stroke: C.edge, sw: fs * 0.2, data: "outline" });

  // 4  control joints (dashed)
  for (const cj of layout.controlJoints || []) {
    line(cj.a, cj.b, { stroke: C.controlJoint, sw: fs * 0.2, dash: [fs * 0.7, fs * 0.4], data: "control-joint" });
    label({ x: (cj.a.x + cj.b.x) / 2, y: (cj.a.y + cj.b.y) / 2 }, "CJ", { size: fs * 0.7, bold: true, fill: C.controlJoint });
    counts.controlJoints++;
  }

  // 5  trusses, strongbacks, trimmers, beams
  for (const t of layout.trusses || []) line(t.a, t.b, { stroke: t.interrupted ? C.trussCut : C.truss, sw: fs * 0.1, data: "truss" });
  counts.trussLines = (layout.lines || []).length;
  for (const s of layout.endStrongbacks || []) line(s.a, s.b, { stroke: C.strongback, sw: fs * 0.25, dash: [fs * 0.9, fs * 0.5], data: "end-strongback" });
  for (const row of layout.midRows || []) for (const run of row.runs) for (let i = 1; i < run.points.length; i++) line(run.points[i - 1], run.points[i], { stroke: C.strongback, sw: fs * 0.25, dash: [fs * 0.9, fs * 0.5], data: "mid-strongback" });
  for (const t of layout.trimmers || []) line(t.a, t.b, { stroke: C.trimmer, sw: fs * 0.3, data: "trimmer" });
  for (const b of layout.beams || []) line(b.a, b.b, { stroke: C.beam, sw: fs * 0.45, data: "beam" });
  for (const v of (layout.voids || []).filter((x) => x.stair)) {
    const t = (layout.trimmers || []).find((x) => x.voidId === v.id);
    if (t) label({ x: centroid(v.points).x, y: centroid(v.points).y + fs * 1.1 }, `LVL ${t.size}`, { size: fs * 0.65, fill: C.trimmer, bold: true });
  }

  // 6  edge labels outside the outline: beam letter and size, or the strongback it carries
  const cen = centroid(O);
  for (const e of layout.edges || []) {
    if (e.kind !== "end" && !e.beam) continue;
    const m = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 };
    const d = { x: m.x - cen.x, y: m.y - cen.y }, dl = hypot(d.x, d.y) || 1;
    const sized = e.beam && e.beam !== "unsized";
    label({ x: m.x + (d.x / dl) * fs * 1.6, y: m.y + (d.y / dl) * fs * 1.6 + fs * 0.3 }, `${e.label}${sized ? ` ${e.beam}` : e.beam ? " beam ?" : " SB"}`, { size: fs * 0.8, bold: true, fill: sized ? C.beam : C.strongback });
  }

  // 7  truss direction arrow with the centres, on the longest truss
  const longest = (layout.trusses || []).reduce((m, t) => (!m || t.lengthMm > m.lengthMm ? t : m), null);
  if (longest) {
    const d = { x: longest.b.x - longest.a.x, y: longest.b.y - longest.a.y }, dl = hypot(d.x, d.y) || 1, u = { x: d.x / dl, y: d.y / dl };
    const c = { x: (longest.a.x + longest.b.x) / 2, y: (longest.a.y + longest.b.y) / 2 };
    const h = Math.min(dl * 0.3, fs * 7);
    const a = { x: c.x - u.x * h, y: c.y - u.y * h }, b = { x: c.x + u.x * h, y: c.y + u.y * h };
    line(a, b, { stroke: C.ink, sw: fs * 0.14, data: "truss-arrow" });
    const head = (tip, sign) => { for (const s of [1, -1]) line(tip, { x: tip.x - sign * u.x * fs * 0.9 + s * -u.y * fs * 0.4, y: tip.y - sign * u.y * fs * 0.9 + s * u.x * fs * 0.4 }, { stroke: C.ink, sw: fs * 0.14, data: "truss-arrow" }); };
    head(a, -1); head(b, 1);
    label({ x: c.x, y: c.y - fs * 0.5 }, `Trusses ${layout.totals.centresMm} crs`, { size: fs * 0.75, bold: true });
  }

  // 8  overall dimensions (plan axes) along the bottom and the left
  const dim = (a, b, s) => { line(a, b, { stroke: C.ink, sw: fs * 0.07, data: "dimension" }); for (const p of [a, b]) line({ x: p.x, y: p.y - fs * 0.4 }, { x: p.x, y: p.y + fs * 0.4 }, { stroke: C.ink, sw: fs * 0.07, data: "dimension" }); text({ x: (a.x + b.x) / 2, y: a.y + fs * 1.2 }, s, { size: fs * 0.85, bold: true, data: "dimension-text" }); };
  const yb = maxY + fs * 2.4;
  dim({ x: minX, y: yb }, { x: maxX, y: yb }, `${Math.round(bw).toLocaleString("en-AU")} mm`);
  // left dimension: drawn vertical
  const xl = minX - fs * 3.2;
  line({ x: xl, y: minY }, { x: xl, y: maxY }, { stroke: C.ink, sw: fs * 0.07, data: "dimension" });
  for (const y of [minY, maxY]) line({ x: xl - fs * 0.4, y }, { x: xl + fs * 0.4, y }, { stroke: C.ink, sw: fs * 0.07, data: "dimension" });
  text({ x: xl - fs * 0.5, y: (minY + maxY) / 2 }, `${Math.round(bh).toLocaleString("en-AU")} mm`, { size: fs * 0.85, bold: true, anchor: "end", data: "dimension-text" });

  // legend: only what is on the drawing
  const T = layout.totals;
  const legend = [];
  const add = (key, label2, swatch) => { legend.push({ key, label: label2, ...swatch }); counts.legendKeys.push(key); };
  if (sheets?.pieces?.length) add(product, `${sheetSize?.name || (product === "hebel" ? "Hebel PowerFloor" : "Structaflor")} (each sheet outlined)`, { kind: "fill", color: C[product] });
  if (wetSets.length) add("scyon", `${wetSets[0].sheet?.name || "Scyon Secura"} (wet area)`, { kind: "fill", color: C.scyon });
  if ((layout.wets || []).length) add("wet", "Wet area (hatched)", { kind: "hatch", color: C.wet });
  if ((layout.voids || []).some((v) => v.stair)) add("stair", "Stair void (hatched)", { kind: "hatch", color: C.void });
  if ((layout.voids || []).some((v) => !v.stair)) add("opening", "Opening", { kind: "box", color: C.void });
  if (counts.cutPieces) add("cut", "Cut piece (red corner mark, size shown)", { kind: "line", color: C.controlJoint });
  add("truss", "Floor truss line", { kind: "line", color: C.truss });
  if ((layout.trusses || []).some((t) => t.interrupted)) add("trussCut", "Truss cut short by an opening", { kind: "line", color: C.trussCut });
  if ((layout.beams || []).length) add("beam", "Beam (letter and size)", { kind: "line", color: C.beam, w: 4 });
  if ((layout.endStrongbacks || []).length || (layout.midRows || []).some((r) => r.runs.length)) add("strongback", "Strongback, end (SB) and mid-span", { kind: "line", color: C.strongback, dash: true });
  if ((layout.trimmers || []).length) add("trimmer", "Stair trimmer (LVL)", { kind: "line", color: C.trimmer, w: 3 });
  if (counts.controlJoints) add("controlJoint", "Control joint (CJ)", { kind: "line", color: C.controlJoint, dash: true });

  const byMat = [];
  if (sheets) byMat.push(`${sheets.orderedSheets} × ${sheets.sheet.name} (${sheets.laidM2} m² laid)`);
  if (layout.scyon) byMat.push(`${layout.scyon.orderedSheets} × ${layout.scyon.sheet.name} (${layout.scyon.laidM2} m² wet)`);
  const summary = [
    `${T.trussCount} trusses at ${T.centresMm} crs · ${T.trussLines} truss lines · longest ${(T.longestSpanMm / 1000).toFixed(2)} m`,
    `Floor ${T.floorAreaM2} m² (main ${T.mainAreaM2} m², wet ${T.wetM2} m², openings ${T.openingsM2} m²) · ${r1(layout.frame.widthMm / 1000)} × ${r1(layout.frame.spanMm / 1000)} m`,
    ...byMat,
    `Strongbacks ${T.strongbackLm} lm${(layout.beams || []).length ? ` · beams ${T.beamLm} lm` : ""}${(layout.trimmers || []).length ? ` · trimmers ${T.trimmerLm} lm` : ""}`,
  ];

  return { width: r1(bw + padL + pad), height: r1(bh + pad * 2), title: opts.name || "Floor frame layout", items, legend, summary, counts };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pointsAttr = (pts) => pts.map((p) => `${p.x},${p.y}`).join(" ");

/** The drawing model as an SVG string (used by tests and anything without React). The React view draws the same primitives. */
export function drawingToSvg(model) {
  if (!model) return "";
  const body = model.items.map((it) => {
    const d = it.data ? ` data-fl="${esc(it.data)}"` : "";
    if (it.t === "poly") return `<polygon${d} points="${pointsAttr(it.pts)}" fill="${it.fill || "none"}" stroke="${it.stroke || "none"}" stroke-width="${it.sw || 0}"${it.dash ? ` stroke-dasharray="${it.dash.join(" ")}"` : ""}/>`;
    if (it.t === "line") return `<line${d} x1="${it.a.x}" y1="${it.a.y}" x2="${it.b.x}" y2="${it.b.y}" stroke="${it.stroke}" stroke-width="${it.sw}"${it.dash ? ` stroke-dasharray="${it.dash.join(" ")}"` : ""}${it.opacity ? ` stroke-opacity="${it.opacity}"` : ""}/>`;
    return `<text${d} x="${it.x}" y="${it.y}" font-size="${it.size}" text-anchor="${it.anchor}" fill="${it.fill}"${it.bold ? ' font-weight="700"' : ""}${it.bg ? ` stroke="#fff" stroke-width="${r1(it.size * 0.3)}" paint-order="stroke"` : ""}>${esc(it.s)}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${model.width} ${model.height}" data-floor-layout-drawing="">${body}</svg>`;
}
