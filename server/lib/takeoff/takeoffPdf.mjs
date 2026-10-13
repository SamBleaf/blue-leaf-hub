// =============================================================================
// takeoffPdf.mjs — supplier flashing order PDF, rendered ONLY from a frozen export snapshot.
//
// Stands alone for the supplier: company, job/reference, supplier, delivery/pickup + required
// date, contact, per-profile diagram with every leg dimension, bend angle and end treatment,
// coated-face legend, material/finish/BMT/colour, finished length × qty rows, total LM, notes
// and handling flags. No prices, no subcontract terms, no invented return policy.
//
// Font: pdfkit's built-in Helvetica (WinAnsi). Every string goes through winAnsi() so symbols
// we rely on (× ° ±) are encodable and anything else degrades visibly to "?" — never silently
// dropped. Arrows/legends are drawn as vector graphics, not glyphs. LATO_TTF_PATH is honoured
// like poPdfKit when set.
// =============================================================================
import fs from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { coatedOffsetSegments, profileVertices, includedAngle, bendDirection, treatmentGlyphs } from "../../../shared/takeoff/index.js";

export const RENDERER_VERSION = "takeoff-pdf@1";
const BRAND = "#006c9b";
const INK = "#1A1A2E";
const MUTED = "#64748b";
const HAIR = "#d8dde3";
const LOGO = join(dirname(fileURLToPath(import.meta.url)), "../../../public/brand/logo-black.png");

const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
/** Map text to what Helvetica/WinAnsi can render; unknown characters become "?". */
export function winAnsi(s) {
  return String(s ?? "").replace(/[\s\S]/gu, (ch) => {
    const c = ch.codePointAt(0);
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.has(ch) || ch === "\n") return ch;
    if (ch === "→") return "->";
    return "?";
  });
}

// Exact to 0.01 mm — a 12.5 mm hem must never print as "13".
const fmt = (n) => (Number.isFinite(n) ? n.toLocaleString("en-AU", { maximumFractionDigits: 2 }) : "—");
const T = (s) => winAnsi(s);

function pickFont(doc) {
  const p = process.env.LATO_TTF_PATH?.trim();
  if (p && fs.existsSync(p)) {
    try { doc.registerFont("body", p); return { regular: "body", bold: "body" }; } catch { /* fall through */ }
  }
  return { regular: "Helvetica", bold: "Helvetica-Bold" };
}

/** Draw a profile into the box (x,y,w,h). Returns nothing; all labels inside the box. */
export function drawProfile(doc, profile, box, fonts) {
  const { points, headings } = profileVertices(profile);
  const coated = coatedOffsetSegments(profile, 0);
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = 26;
  const spanX = Math.max(maxX - minX, 1), spanY = Math.max(maxY - minY, 1);
  const s = Math.min((box.w - pad * 2) / spanX, (box.h - pad * 2) / spanY);
  const ox = box.x + (box.w - spanX * s) / 2, oy = box.y + (box.h - spanY * s) / 2;
  const P = (p) => ({ x: ox + (p.x - minX) * s, y: oy + (maxY - p.y) * s }); // flip y for PDF page space

  doc.save().rect(box.x, box.y, box.w, box.h).lineWidth(0.5).strokeColor(HAIR).stroke().restore();

  // coated face: a thick brand-coloured band offset toward the coated side
  const off = 3.2;
  coated.forEach((seg, i) => {
    const a = P(points[i]), b = P(points[i + 1]);
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    // left normal of traversal in PDF page space (y down) is (dy, -dx)/len
    const side = profile.coatedFace === "left" ? 1 : -1;
    const nx = (dy / len) * side * off, ny = (-dx / len) * side * off;
    doc.save().moveTo(a.x + nx, a.y + ny).lineTo(b.x + nx, b.y + ny).lineWidth(2.4).strokeColor(BRAND).stroke().restore();
    void seg;
  });
  // the profile itself
  doc.save().lineWidth(1.4).strokeColor(INK);
  points.forEach((p, i) => { const q = P(p); if (i === 0) doc.moveTo(q.x, q.y); else doc.lineTo(q.x, q.y); });
  doc.stroke().restore();

  // end treatments
  for (const g of treatmentGlyphs(profile)) {
    const at = P(g.point);
    const w = Math.max(6, Math.min(18, g.widthMm * s));
    const hdgRad = (g.headingDeg * Math.PI) / 180;
    const dir = { x: Math.cos(hdgRad), y: -Math.sin(hdgRad) };
    const n = { x: g.normal.x, y: -g.normal.y };
    doc.save().lineWidth(1.4).strokeColor(INK);
    if (g.type === "closed_hem") {
      // folded back flat: short return parallel to the leg on the chosen side, with a closed loop
      const a2 = { x: at.x + n.x * 3, y: at.y + n.y * 3 };
      doc.moveTo(at.x, at.y).bezierCurveTo(at.x + dir.x * 4, at.y + dir.y * 4, a2.x + dir.x * 4, a2.y + dir.y * 4, a2.x, a2.y)
        .lineTo(a2.x - dir.x * w, a2.y - dir.y * w).stroke();
    } else {
      // open return: a 90° return on the chosen side
      doc.moveTo(at.x, at.y).lineTo(at.x + n.x * w, at.y + n.y * w).stroke();
    }
    doc.restore();
    // label sits beyond the end of the leg (along its direction), clear of the leg's own label
    const lbl = T(`${g.type === "closed_hem" ? "Hem" : "Return"} ${fmt(g.widthMm)}`);
    doc.font(fonts.regular).fontSize(6.5).fillColor(MUTED);
    const lw = doc.widthOfString(lbl);
    const lx = at.x + dir.x * 12 + n.x * (w / 2), ly = at.y + dir.y * 12 + n.y * (w / 2);
    doc.text(lbl, dir.x >= 0 ? lx : lx - lw, ly - 3.5, { width: lw + 2, lineBreak: false });
  }

  // leg labels: centred beside each leg on the NON-coated side, offset by the text's own extent
  // along the normal so a label never sits on its leg
  doc.font(fonts.bold).fontSize(7.5).fillColor(INK);
  const lh = 8;
  profile.segments.forEach((seg, i) => {
    const a = P(points[i]), b = P(points[i + 1]);
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const side = profile.coatedFace === "left" ? -1 : 1;
    const nx = (dy / len) * side, ny = (-dx / len) * side;
    const label = T(`L${i + 1} ${fmt(seg.lengthMm)}`);
    const w = doc.widthOfString(label);
    const d = 5 + Math.abs(nx) * (w / 2) + Math.abs(ny) * (lh / 2);
    const cx = (a.x + b.x) / 2 + nx * d, cy = (a.y + b.y) / 2 + ny * d;
    doc.text(label, cx - w / 2, cy - lh / 2, { width: w + 2, lineBreak: false });
  });
  // bend labels on the OUTSIDE of each fold (opposite the interior bisector)
  doc.font(fonts.regular).fontSize(6.5).fillColor(MUTED);
  profile.bends.forEach((bend, i) => {
    if (bend.turnDeg === 0) return;
    const a = P(points[i]), v = P(points[i + 1]), b = P(points[i + 2]);
    const u1 = { x: (v.x - a.x) / (Math.hypot(v.x - a.x, v.y - a.y) || 1), y: (v.y - a.y) / (Math.hypot(v.x - a.x, v.y - a.y) || 1) };
    const u2 = { x: (b.x - v.x) / (Math.hypot(b.x - v.x, b.y - v.y) || 1), y: (b.y - v.y) / (Math.hypot(b.x - v.x, b.y - v.y) || 1) };
    let ex = u1.x - u2.x, ey = u1.y - u2.y; // = −(−u1 + u2): exterior bisector
    const el = Math.hypot(ex, ey) || 1; ex /= el; ey /= el;
    const label = T(`${fmt(includedAngle(bend.turnDeg))}°`);
    const w = doc.widthOfString(label);
    const cx = v.x + ex * (9 + w / 2), cy = v.y + ey * 9;
    doc.text(label, cx - w / 2, cy - 3.5, { width: w + 2, lineBreak: false });
  });
  void headings;
}

/**
 * Render the frozen snapshot. opts: { exportNo, isDraft, snapshotSha256 }.
 * @returns {Promise<Buffer>}
 */
export async function renderSupplierOrderPdf(snapshot, opts = {}) {
  const { default: PDFDocument } = await import("pdfkit");
  return await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true,
      info: { Title: T(`Supplier order ${snapshot.orderRef}`), Author: T(snapshot.company?.name || "Blue Leaf Building"), Creator: RENDERER_VERSION } });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      draw(doc, snapshot, opts);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

function draw(doc, snap, opts) {
  const fonts = pickFont(doc);
  const W = doc.page.width, M = 40, CW = W - M * 2;
  const bottom = () => doc.page.height - 56;
  let y = 40;

  const header = (cont) => {
    y = 36;
    if (fs.existsSync(LOGO)) { try { doc.image(LOGO, M, y, { width: 120 }); } catch { /* logo optional */ } }
    doc.font(fonts.bold).fontSize(15).fillColor(INK).text(T(opts.isDraft ? "DRAFT FLASHING ORDER" : "FLASHING ORDER"), M, y, { width: CW, align: "right" });
    doc.font(fonts.regular).fontSize(9).fillColor(MUTED).text(T(`${snap.orderRef}${opts.exportNo ? ` · export ${opts.exportNo}` : ""}${cont ? " (continued)" : ""}`), M, y + 19, { width: CW, align: "right" });
    y += cont ? 46 : 78; // clear the wordmark (it is taller than the title block)
    if (opts.isDraft) {
      doc.save().rotate(-30, { origin: [W / 2, doc.page.height / 2] }).font(fonts.bold).fontSize(90).fillColor("#c0392b").opacity(0.08)
        .text("DRAFT", 0, doc.page.height / 2 - 50, { width: W, align: "center" }).restore();
      doc.opacity(1);
    }
  };
  const newPage = () => { doc.addPage(); header(true); };
  const need = (h) => { if (y + h > bottom()) newPage(); };

  header(false);

  // parties
  const col = (x, w, title, lines) => {
    doc.font(fonts.bold).fontSize(7.5).fillColor(MUTED).text(T(title.toUpperCase()), x, y, { width: w });
    doc.font(fonts.regular).fontSize(9).fillColor(INK);
    let yy = y + 11;
    for (const l of lines.filter(Boolean)) { doc.text(T(l), x, yy, { width: w }); yy = doc.y + 1; }
    return yy;
  };
  const c = snap.company || {};
  const s = snap.supplier || {};
  const d = snap.delivery || {};
  const third = (CW - 20) / 3;
  const y1 = col(M, third, "From", [c.name, c.abn ? `ABN ${c.abn}` : null, c.address, c.phone, c.email]);
  const y2 = col(M + third + 10, third, "Supplier", [s.name || "Not chosen", s.contactName ? `Attn: ${s.contactName}` : null, s.phone, s.email]);
  const deliveryLines = d.method === "pickup"
    ? ["Pickup", d.pickupBranch ? `Branch: ${d.pickupBranch}` : null]
    : d.method === "delivery" ? ["Deliver to:", d.address] : ["Delivery / pickup not set"];
  const y3 = col(M + (third + 10) * 2, third, "Job", [snap.job?.label, ...deliveryLines,
    d.requiredDate ? `Required: ${d.requiredDate}` : null,
    d.contactName || d.contactPhone ? `Site contact: ${[d.contactName, d.contactPhone].filter(Boolean).join(" ")}` : null]);
  y = Math.max(y1, y2, y3) + 8;
  if (d.notes || snap.notes) {
    doc.font(fonts.regular).fontSize(8.5).fillColor(INK).text(T(`Notes: ${[d.notes, snap.notes].filter(Boolean).join(" · ")}`), M, y, { width: CW });
    y = doc.y + 6;
  }
  doc.font(fonts.regular).fontSize(7.5).fillColor(MUTED)
    .text(T("All dimensions in mm. Lengths are FINISHED order lengths. Girth is indicative only (no bend deduction) — supplier fabrication instructions take precedence."), M, y, { width: CW });
  y = doc.y + 10;

  // profiles
  for (const g of snap.groups || []) {
    need(250);
    doc.save().rect(M, y, CW, 20).fill("#eef5f9").restore();
    const sp = g.spec || {};
    doc.font(fonts.bold).fontSize(10).fillColor(INK).text(T(`${g.profileId} — ${g.materialName}`), M + 6, y + 5, { width: CW * 0.5, lineBreak: false });
    doc.font(fonts.regular).fontSize(8.5).fillColor(INK)
      .text(T([sp.finish, sp.colour, sp.colourCode ? `(${sp.colourCode})` : null, sp.bmt != null ? `${sp.bmt} BMT` : null, sp.product, sp.productCode].filter(Boolean).join(" · ")),
        M + CW * 0.5, y + 6, { width: CW * 0.5 - 6, align: "right", lineBreak: false });
    y += 26;

    const boxW = CW * 0.52, boxH = 170;
    if (g.profile) drawProfile(doc, g.profile, { x: M, y, w: boxW, h: boxH }, fonts);
    else doc.font(fonts.regular).fontSize(9).fillColor(MUTED).text("No profile drawing", M, y + 70, { width: boxW, align: "center" });
    // coated-face legend
    doc.save().moveTo(M + 2, y + boxH + 8).lineTo(M + 24, y + boxH + 8).lineWidth(2.4).strokeColor(BRAND).stroke().restore();
    doc.font(fonts.regular).fontSize(7).fillColor(MUTED).text(T(`Coated face (${g.profile?.coatedFace === "right" ? "right" : "left"} side travelling L1 -> L${g.profile?.segments?.length || 1})`), M + 28, y + boxH + 4.5, { width: boxW - 30, lineBreak: false });

    // dimension table: as many rows as fit beside the drawing, the rest continue below it
    // (three columns, paginating) so a long profile never strands single lines on blank pages.
    const tx = M + boxW + 12, tw = CW - boxW - 12, rowDim = 11;
    const dims = g.dimensions;
    const dimLines = [];
    if (dims) {
      for (const l of dims.legs) dimLines.push({ t: `${l.label}  ${fmt(l.lengthMm)} mm` });
      for (const b of dims.bends) dimLines.push({ t: `${b.label}  ${fmt(b.includedDeg)}° ${b.direction === "straight" ? "straight" : `fold ${b.direction}`}` });
      const tr = (t, name) => (t.type === "none" ? `${name}: plain` : `${name}: ${t.type === "closed_hem" ? "closed hem" : "open return"} ${fmt(t.widthMm)} mm (${t.side})`);
      dimLines.push({ t: tr(dims.start, "Start") }, { t: tr(dims.end, "End") }, { t: `Indicative girth ${fmt(dims.girthMm)} mm`, muted: true });
    }
    let ty = y;
    doc.font(fonts.bold).fontSize(8).fillColor(MUTED).text("DIMENSIONS", tx, ty); ty += rowDim;
    const besideMax = Math.floor((boxH - rowDim) / rowDim);
    const beside = dimLines.slice(0, besideMax), rest = dimLines.slice(besideMax);
    for (const d of beside) { doc.font(fonts.regular).fontSize(8.5).fillColor(d.muted ? MUTED : INK).text(T(d.t), tx, ty, { width: tw, lineBreak: false }); ty += rowDim; }
    y = Math.max(y + boxH + 14, ty) + 8;
    if (rest.length) {
      const colW = (CW - 20) / 3;
      for (let i = 0; i < rest.length; i += 3) {
        if (y + rowDim > bottom()) { newPage(); doc.font(fonts.bold).fontSize(9).fillColor(INK).text(T(`${g.profileId} — ${g.materialName} — dimensions (continued)`), M, y); y = doc.y + 4; }
        rest.slice(i, i + 3).forEach((d, j) => doc.font(fonts.regular).fontSize(8.5).fillColor(d.muted ? MUTED : INK).text(T(d.t), M + j * (colW + 10), y, { width: colW, lineBreak: false }));
        y += rowDim;
      }
      y += 8;
    }

    // cutting list
    const rowH = 15;
    const headerRow = (cont) => {
      doc.save().rect(M, y, CW, rowH).fill("#f3f5f7").restore();
      doc.font(fonts.bold).fontSize(8).fillColor(MUTED);
      doc.text(T(`QTY${cont ? "  (continued)" : ""}`), M + 6, y + 4, { width: 90, lineBreak: false });
      doc.text("FINISHED LENGTH (mm)", M + 100, y + 4, { width: 140, lineBreak: false });
      doc.text("LM", M + 250, y + 4, { width: 60, lineBreak: false });
      doc.text("HANDLING", M + 320, y + 4, { width: CW - 326, lineBreak: false });
      y += rowH;
    };
    const profileLabel = () => { doc.font(fonts.bold).fontSize(9).fillColor(INK).text(T(`${g.profileId} — ${g.materialName}`), M, y); y = doc.y + 4; };
    if (y + rowH * 3 > bottom()) { newPage(); profileLabel(); headerRow(true); } else headerRow(false);
    for (const l of g.lines) {
      if (y + rowH > bottom()) { newPage(); profileLabel(); headerRow(true); }
      doc.font(fonts.regular).fontSize(9).fillColor(INK);
      doc.text(T(`${l.quantity} ×`), M + 6, y + 3, { width: 90, lineBreak: false });
      doc.text(T(fmt(l.finishedLengthMm)), M + 100, y + 3, { width: 140, lineBreak: false });
      doc.text(T(((l.finishedLengthMm * l.quantity) / 1000).toFixed(3)), M + 250, y + 3, { width: 60, lineBreak: false });
      doc.fillColor(l.handlingFlag ? "#b45309" : MUTED).text(T(l.ceilingExceeded ? "Over order ceiling" : l.handlingFlag ? "Long piece — handle with care" : "-"), M + 320, y + 3, { width: CW - 326, lineBreak: false });
      doc.save().moveTo(M, y + rowH).lineTo(M + CW, y + rowH).lineWidth(0.4).strokeColor(HAIR).stroke().restore();
      y += rowH;
    }
    doc.font(fonts.bold).fontSize(9).fillColor(INK).text(T(`${g.pieces} pieces · ${g.totalLm.toFixed(3)} LM`), M, y + 4, { width: CW, align: "right" });
    y = doc.y + 14;
  }

  need(40);
  const t = snap.totals || {};
  doc.font(fonts.bold).fontSize(10).fillColor(INK).text(T(`Order total: ${t.pieces || 0} pieces · ${(t.totalLm || 0).toFixed(3)} LM${t.handlingFlags ? ` · ${t.handlingFlags} long piece(s) flagged` : ""}`), M, y, { width: CW });
  y = doc.y + 4;
  doc.font(fonts.regular).fontSize(7.5).fillColor(MUTED).text(T("This document lists quantities and profiles only. It is not a price or a contract. Confirm product availability, colour and fabrication allowances with the supplier."), M, y, { width: CW });

  // footers
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // writing in the footer band must not trigger pdfkit's auto page-add
    const fy = doc.page.height - 34;
    doc.font(fonts.regular).fontSize(6.5).fillColor(MUTED)
      .text(T(`${snap.orderRef} · ${RENDERER_VERSION} · ${snap.calculationVersion} · snapshot ${String(opts.snapshotSha256 || "").slice(0, 12)} · page ${i - range.start + 1} of ${range.count}`), M, fy, { width: CW, align: "center", lineBreak: false });
  }
  void bendDirection;
}
