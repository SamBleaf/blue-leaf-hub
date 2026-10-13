// =============================================================================
// Synthetic known-dimension plan PDFs for takeoff tests + the ui-review fixture.
// Hand-written PDF (valid xref) so we control MediaBox/CropBox origin, /Rotate and /UserUnit
// exactly. Contains no customer data.
//
//   buildKnownPlanPdf({ rotate, userUnit, origin, scaleRatio })
//
// Drawing: a 12,000 × 8,000 mm building outline at 1:scaleRatio (default 100), dimension
// strings "12000" (horizontal) and "8000" (vertical), a 3,000 mm check line labelled "3000",
// and a 4,312 mm eaves run to measure. Returns { bytes, meta } where meta gives the PDF-space
// coordinates of every feature (for tests) and the expected mm-per-pt scale.
// =============================================================================

const PT_PER_MM_PAPER = 72 / 25.4;

export function buildKnownPlanPdf({ rotate = 0, userUnit = 1, origin = { x: 0, y: 0 }, scaleRatio = 100, pageSizePt = { w: 842, h: 595 } } = {}) {
  const k = PT_PER_MM_PAPER / scaleRatio / userUnit; // PDF units per real mm
  const ox = origin.x, oy = origin.y;
  const bx = ox + 120, by = oy + 150;                 // building lower-left in PDF space
  const W = 12000 * k, H = 8000 * k;
  const features = {
    building: { x0: bx, y0: by, x1: bx + W, y1: by + H },
    horizontalDim: { p1: { x: bx, y: by - 40 }, p2: { x: bx + W, y: by - 40 }, mm: 12000 },
    verticalDim: { p1: { x: bx - 40, y: by }, p2: { x: bx - 40, y: by + H }, mm: 8000 },
    checkDim: { p1: { x: bx, y: by + H + 30 }, p2: { x: bx + 3000 * k, y: by + H + 30 }, mm: 3000 },
    eavesRun: { p1: { x: bx + 1000 * k, y: by + 2000 * k }, p2: { x: bx + 5312 * k, y: by + 2000 * k }, mm: 4312 },
  };
  const line = (a, b) => `${a.x.toFixed(4)} ${a.y.toFixed(4)} m ${b.x.toFixed(4)} ${b.y.toFixed(4)} l S`;
  const text = (x, y, s) => `BT /F1 9 Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${s}) Tj ET`;
  const tick = (p, vertical) => (vertical ? line({ x: p.x - 4, y: p.y }, { x: p.x + 4, y: p.y }) : line({ x: p.x, y: p.y - 4 }, { x: p.x, y: p.y + 4 }));
  const f = features;
  const content = [
    "0.2 0.2 0.2 RG 1.2 w",
    `${bx.toFixed(4)} ${by.toFixed(4)} ${W.toFixed(4)} ${H.toFixed(4)} re S`,
    "0.6 w 0 0.42 0.61 RG",
    line(f.horizontalDim.p1, f.horizontalDim.p2), tick(f.horizontalDim.p1), tick(f.horizontalDim.p2),
    line(f.verticalDim.p1, f.verticalDim.p2), tick(f.verticalDim.p1, true), tick(f.verticalDim.p2, true),
    line(f.checkDim.p1, f.checkDim.p2), tick(f.checkDim.p1), tick(f.checkDim.p2),
    "0.8 0.2 0.2 RG 1 w", line(f.eavesRun.p1, f.eavesRun.p2),
    "0 0 0 rg",
    text(bx + W / 2 - 12, by - 52, "12000"),
    text(bx - 70, by + H / 2, "8000"),
    text(bx + 1500 * k - 10, by + H + 36, "3000"),
    text(bx + 2500 * k, by + 2000 * k + 6, "EAVES 4312"),
    text(ox + 20, oy + pageSizePt.h - 30, `SYNTHETIC TEST PLAN 1:${scaleRatio} - NOT FOR CONSTRUCTION`),
  ].join("\n");

  const box = `[${ox} ${oy} ${ox + pageSizePt.w} ${oy + pageSizePt.h}]`;
  const objs = [];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  objs[3] = `<< /Type /Page /Parent 2 0 R /MediaBox ${box} /CropBox ${box} /Rotate ${rotate}${userUnit !== 1 ? ` /UserUnit ${userUnit}` : ""} /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`;
  objs[4] = `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;
  objs[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  let out = "%PDF-1.6\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = Buffer.byteLength(out, "latin1");
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return {
    bytes: new Uint8Array(Buffer.from(out, "latin1")),
    meta: { features, pdfUnitsPerMm: k, mmPerPdfUnit: 1 / k, viewBox: [ox, oy, ox + pageSizePt.w, oy + pageSizePt.h], rotate, userUnit },
  };
}

// ── Multi-page synthetic plan sets (ui-review fixture + viewer stress) ─────────
function knownContent(ox, oy, k, h, ratio) {
  const bx = ox + 120, by = oy + 150, W = 12000 * k, H = 8000 * k;
  const line = (a, b) => `${a.x.toFixed(3)} ${a.y.toFixed(3)} m ${b.x.toFixed(3)} ${b.y.toFixed(3)} l S`;
  const text = (x, y, s, size = 9) => `BT /F1 ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${s}) Tj ET`;
  return [
    "0.2 0.2 0.2 RG 1.2 w", `${bx.toFixed(3)} ${by.toFixed(3)} ${W.toFixed(3)} ${H.toFixed(3)} re S`,
    `${(bx + 5000 * k).toFixed(3)} ${by.toFixed(3)} m ${(bx + 5000 * k).toFixed(3)} ${(by + H).toFixed(3)} l S`,
    "0.6 w 0 0.42 0.61 RG",
    line({ x: bx, y: by - 40 }, { x: bx + W, y: by - 40 }), line({ x: bx - 40, y: by }, { x: bx - 40, y: by + H }),
    line({ x: bx, y: by + H + 30 }, { x: bx + 3000 * k, y: by + H + 30 }),
    "0 0 0 rg", text(bx + W / 2 - 12, by - 52, "12000"), text(bx - 70, by + H / 2, "8000"), text(bx + 1500 * k - 10, by + H + 36, "3000"),
    text(ox + 20, oy + h - 30, `SYNTHETIC TEST PLAN 1:${ratio} - NOT FOR CONSTRUCTION`, 11),
  ].join("\n");
}
function denseContent(ox, oy, w, h, seed = 7) {
  // ~6,000 strokes + labels: a heavy A1 sheet to exercise rendering/zoom budgets.
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out = ["0.35 0.35 0.35 RG 0.3 w"];
  for (let gx = 0; gx <= w; gx += 20) out.push(`${(ox + gx).toFixed(1)} ${oy} m ${(ox + gx).toFixed(1)} ${oy + h} l S`);
  for (let gy = 0; gy <= h; gy += 20) out.push(`${ox} ${(oy + gy).toFixed(1)} m ${ox + w} ${(oy + gy).toFixed(1)} l S`);
  out.push("0.1 0.1 0.1 RG 0.8 w");
  for (let i = 0; i < 6000; i++) { const x = ox + rnd() * w, y = oy + rnd() * h; out.push(`${x.toFixed(1)} ${y.toFixed(1)} m ${(x + (rnd() - 0.5) * 60).toFixed(1)} ${(y + (rnd() - 0.5) * 60).toFixed(1)} l S`); }
  out.push("0 0 0 rg");
  for (let i = 0; i < 400; i++) out.push(`BT /F1 6 Tf ${(ox + rnd() * w).toFixed(1)} ${(oy + rnd() * h).toFixed(1)} Td (D${i} ${Math.round(rnd() * 9000)}) Tj ET`);
  out.push(`BT /F1 24 Tf ${ox + 40} ${oy + h - 60} Td (SYNTHETIC DENSE A1 SHEET - NOT FOR CONSTRUCTION) Tj ET`);
  return out.join("\n");
}

/**
 * pages: [{ kind:"known"|"dense", rotate=0, origin={x,y}, userUnit=1, size={w,h} (pt), scaleRatio=100 }]
 * Returns { bytes, pages:[meta…] } — meta mirrors buildKnownPlanPdf's for "known" pages.
 */
export function buildPlanSetPdf(pages) {
  const metas = pages.map((pg) => {
    const size = pg.size || { w: 842, h: 595 }, o = pg.origin || { x: 0, y: 0 }, uu = pg.userUnit || 1, ratio = pg.scaleRatio || 100;
    const k = PT_PER_MM_PAPER / ratio / uu;
    return { kind: pg.kind, rotate: pg.rotate || 0, userUnit: uu, viewBox: [o.x, o.y, o.x + size.w, o.y + size.h], pdfUnitsPerMm: k, mmPerPdfUnit: 1 / k };
  });
  return writePdf(metas, pages);
}

function writePdf(metas, pages) {
  // Deterministic numbering: 1 catalog, 2 pages, 3 font, then (page, content) pairs.
  const objs = [null, "<< /Type /Catalog /Pages 2 0 R >>", null, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  const kids = [];
  pages.forEach((pg, i) => {
    const m = metas[i], size = pg.size || { w: 842, h: 595 }, o = pg.origin || { x: 0, y: 0 };
    const content = pg.kind === "dense" ? denseContent(o.x, o.y, size.w, size.h, 7 + i) : knownContent(o.x, o.y, m.pdfUnitsPerMm, size.h, pg.scaleRatio || 100);
    const box = `[${m.viewBox.join(" ")}]`;
    const pageNo = objs.length, contentNo = pageNo + 1;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox ${box} /CropBox ${box} /Rotate ${m.rotate}${m.userUnit !== 1 ? ` /UserUnit ${m.userUnit}` : ""} /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNo} 0 R >>`);
    objs.push(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
    kids.push(`${pageNo} 0 R`);
  });
  objs[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.6\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [];
  for (let i = 1; i < objs.length; i++) { offsets[i] = Buffer.byteLength(out, "latin1"); out += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return { bytes: new Uint8Array(Buffer.from(out, "latin1")), pages: metas };
}
