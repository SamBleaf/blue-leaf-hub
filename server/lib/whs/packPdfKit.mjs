// packPdfKit.mjs — the printed artefact (Design spec, Phase 3). Renders a carpentry job's WHS pack as a
// branded, page-numbered A4 PDF: tag-block cover, Site Card, Part 1 (stage-banded HRCW SWMS with the
// hierarchy bar + task-name-first cards), Part 2 task controls, Part 3 site record, a fixed emergency
// page, and the signature table. This is the Surface-C archival record. pdfkit is imported lazily (cold
// import is slow) and uses the built-in fonts (Helvetica + Courier for the load-bearing numbers).
import { resolvePpe, SITE_CONDITIONS } from "./packCompose.mjs";
import { hierarchyTier, TIER_COLOR, HOC } from "./hierarchyBar.mjs";

const NAVY = "#1B3A5C", INK = "#10151C", INK60 = "#5A646E", RULE = "#C9D1D8";
const GREEN = "#1F7A3D", AMBER = "#C77700", RED = "#B3261E";
const M = 40, PW = 595.28, PH = 841.89, CW = PW - 2 * M, TOP = M + 40, BOT = PH - 44;

const clean = (s) => String(s ?? "").replace(/\*\*/g, "").replace(/\*\(/g, "(").replace(/\)\*/g, ")").replace(/\s+/g, " ").trim();
const fdate = (d) => { if (!d) return "— not set —"; const t = new Date(d); return isNaN(t) ? String(d) : t.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }); };

export async function buildWhsPackPdfBuffer({ job = {}, company = {}, pack = {}, modules = [], logoDataUrl = "" } = {}) {
  const { default: PDFDocument } = await import("pdfkit");

  // ---- derive the same data the HTML composer uses ----
  const byCode = Object.fromEntries(modules.map((m) => [m.module_code, m]));
  const a = pack.answers || {};
  const sel = pack.selected_controls || {};
  const hrcw = (pack.selected_hrcw || []).map((c) => byCode[c]).filter(Boolean);
  const task = (pack.selected_task || []).map((c) => byCode[c]).filter(Boolean);
  const allReviewed = [...hrcw, ...task].every((m) => m.review_status === "reviewed");
  const missing = [...(pack.selected_hrcw || []), ...(pack.selected_task || [])].filter((c) => !byCode[c]);
  const draft = pack.review_status !== "issued" || !allReviewed || missing.length > 0;
  const siteAddress = [a.addressStreet, a.addressSuburb, a.addressPostcode].filter(Boolean).join(", ") || job.address || "";
  const pastDue = pack.review_status === "issued" && pack.review_due_at && new Date(pack.review_due_at) < new Date();
  const ppe = resolvePpe([...hrcw, ...task], a);
  const logoBuf = (() => { const m = String(logoDataUrl || "").match(/^data:image\/(png|jpe?g);base64,(.+)$/i); try { return m ? Buffer.from(m[2], "base64") : null; } catch { return null; } })();

  const doc = new PDFDocument({ size: "A4", margin: M, bufferPages: true, info: { Title: `WHS Pack ${job.reference || ""}`, Author: "Blue Leaf Building" } });
  const chunks = [];
  const done = new Promise((resolve, reject) => { doc.on("data", (c) => chunks.push(c)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });

  let y = TOP;
  // Header on every page (logo + wordmark + address), then a navy rule.
  const header = () => {
    if (logoBuf) { try { doc.image(logoBuf, M, M - 6, { height: 22 }); } catch { /* bad image */ } }
    doc.font("Helvetica-Bold").fontSize(11).fillColor(NAVY).text("SITE WHS PACK", logoBuf ? M + 30 : M, M, { continued: false });
    doc.font("Courier").fontSize(8).fillColor(INK60).text(`${siteAddress}  ·  v${pack.version || 1}`, M, M + 2, { width: CW, align: "right" });
    doc.moveTo(M, M + 26).lineTo(PW - M, M + 26).lineWidth(1).strokeColor(NAVY).stroke();
    y = TOP;
  };
  const newPage = () => { doc.addPage(); header(); };
  const need = (h) => { if (y + h > BOT) newPage(); };
  header();

  // ---- primitives ----
  const barGlyph = (levels, x, yy) => {
    const { filled, tier } = hierarchyTier(levels);
    const on = TIER_COLOR[tier];
    for (let l = 1; l <= 6; l++) {
      doc.rect(x + (l - 1) * 16, yy, 14, 6).fillColor(filled.includes(l) ? on : "#E3E7EB").fill();
    }
    return on;
  };
  const kv = (rows, opts = {}) => {
    const lw = opts.labelW || 190;
    for (const [k, v] of rows) {
      const val = v == null || v === "" ? "—" : clean(v);
      const vh = doc.font("Helvetica").fontSize(9).heightOfString(val, { width: CW - lw - 12 });
      const rh = Math.max(16, vh + 6);
      need(rh);
      doc.rect(M, y, lw, rh).fillColor("#F4F6F8").fill();
      doc.rect(M, y, CW, rh).lineWidth(0.5).strokeColor(RULE).stroke();
      doc.moveTo(M + lw, y).lineTo(M + lw, y + rh).strokeColor(RULE).stroke();
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(INK).text(clean(k), M + 4, y + 4, { width: lw - 8 });
      doc.font(/\d/.test(val) ? "Courier" : "Helvetica").fontSize(9).fillColor(INK).text(val, M + lw + 6, y + 4, { width: CW - lw - 12 });
      y += rh;
    }
    y += 4;
  };
  const heading = (t, color = INK) => { need(24); doc.font("Helvetica-Bold").fontSize(11).fillColor(color).text(clean(t), M, y); y += 16; };
  const stageBand = (t) => { need(26); doc.rect(M, y, CW, 18).fillColor(NAVY).fill(); doc.font("Helvetica-Bold").fontSize(10).fillColor("#fff").text(clean(t).toUpperCase(), M + 8, y + 4); y += 24; };
  const para = (t, size = 9, color = INK, gap = 4) => { const h = doc.font("Helvetica").fontSize(size).heightOfString(clean(t), { width: CW }); need(h + gap); doc.fillColor(color).font("Helvetica").fontSize(size).text(clean(t), M, y, { width: CW }); y += h + gap; };

  // ---- TAG BLOCK (cover identity) ----
  {
    const bg = pastDue ? RED : draft ? AMBER : GREEN;
    const word = pastDue ? "REVIEW OVERDUE — NOT FOR SITE USE" : draft ? "DRAFT — NOT FOR SITE USE" : "ISSUED — IN DATE";
    need(120);
    doc.rect(M, y, CW, 22).fillColor(bg).fill();
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#fff").text("SITE WHS PACK", M + 8, y + 5);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#fff").text(company.name || "Blue Leaf Building", M, y + 6, { width: CW - 8, align: "right" });
    y += 26;
    doc.font("Helvetica-Bold").fontSize(13).fillColor(INK).text(siteAddress || "[site address]", M, y); y += 16;
    doc.font("Courier").fontSize(9).fillColor(INK60).text(`${job.reference || ""} · ${job.projectType || ""}`, M, y); y += 14;
    kv([
      ["Version", `v${pack.version || 1}`],
      ["Issued", pack.approved_at ? fdate(pack.approved_at) : "—"],
      ["Reviewer (competent person)", pack.reviewed_by || "— pending —"],
      ["Review due", fdate(pack.review_due_at)],
    ]);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(bg).text(word, M, y); y += 20;
  }

  // ---- SITE CARD ----
  {
    need(40);
    doc.rect(M, y, CW, 20).fillColor(NAVY).fill();
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#fff").text("TODAY ON THIS SITE", M + 8, y + 4); y += 26;
    heading("WHAT WILL KILL YOU HERE", RED);
    if (!hrcw.length) para("No HRCW selected for this job yet.", 9, INK60);
    hrcw.slice(0, 3).forEach((m, i) => {
      para(`${i + 1}  ${clean(m.title || m.module_code)}`, 10, INK, 1);
      const inPlace = (sel[m.module_code] || []).slice(0, 2).map(clean).join(" · ");
      para(inPlace ? `■ In place: ${inPlace}` : "■ No controls recorded — do not start", 9, inPlace ? GREEN : RED, 3);
    });
    heading("STOP WORK IF");
    const bits = [];
    if (a.stopWind) bits.push(`Wind over ${a.stopWind} km/h`);
    if (a.stopHeat) bits.push(`Heat over ${a.stopHeat} °C`);
    if (a.noWetWork) bits.push("No roof/joist work when wet or frosted");
    para(bits.length ? bits.join("   ·   ") : "Stop-work limits not set — capture them in site facts.", 10, bits.length ? INK : INK60);
    heading("IF SOMETHING HAPPENS");
    kv([
      ["Hospital", a.hospital],
      ["First aid", a.firstAider],
      ["Muster point", a.musterPoint],
      ["Rescue", a.fallArrestInUse ? (a.rescuer || "[rescuer not set]") : "No fall-arrest in use on this job"],
      ["Call", company.phone],
    ]);
    para("Stop the work if a control isn't there. No one will be disadvantaged for stopping the work.", 9, INK);
  }

  // ---- module card (Part 1 / 2) ----
  const moduleCard = (m, part) => {
    const c = m.content_json || {};
    const opts = Array.isArray(c.controlOptions) ? c.controlOptions : [];
    const keys = Array.isArray(sel[m.module_code]) ? sel[m.module_code] : [];
    const picked = opts.filter((o) => keys.includes(o.text));
    const levels = picked.map((o) => o.level);
    need(60);
    // task name first, module id demoted to the right
    doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text(clean(m.title || ""), M, y, { width: CW - 60 });
    doc.font("Courier").fontSize(9).fillColor(INK60).text(m.module_code || "", PW - M - 60, y, { width: 60, align: "right" });
    y += doc.font("Helvetica-Bold").fontSize(11).heightOfString(clean(m.title || ""), { width: CW - 60 }) + 2;
    const barColor = barGlyph(levels, M, y + 1);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(barColor).text(hierarchyTier(levels).label, M + 6 * 16 + 6, y - 1);
    y += 12;
    if (c.trigger) para(`Applies when: ${clean(c.trigger)}`, 8.5, INK60, 3);
    const just = (a.justifications || {})[m.module_code];
    if (just) para(`Why this is acceptable: ${clean(just)}`, 8.5, RED, 3);
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(INK).text("IN PLACE ON THIS SITE", M, y); y += 12;
    if (!opts.length) para("Controls for this item are the site PPE matrix + general site rules.", 8.5, INK60);
    else if (!picked.length) para("No controls selected — cannot proceed until the supervisor selects the controls actually in place.", 8.5, RED);
    else picked.forEach((x) => para(`■ L${x.level} ${HOC[x.level] || ""}: ${clean(x.text)}`, 8.5, INK, 2));
    y += 4; need(1);
    doc.moveTo(M, y).lineTo(PW - M, y).lineWidth(0.5).strokeColor(RULE).stroke(); y += 8;
  };

  // ---- PART 1 — grouped by work stage (derived from title prefix / project type) ----
  newPage();
  stageBand("Part 1 — Combined HRCW Safe Work Method Statement");
  kv([
    ["Company", company.name || "Blue Leaf Building"], ["ABN", company.abn], ["Site address", siteAddress],
    ["Principal contractor", a.principalContractor], ["PC WHS management plan (ref)", a.pcPlanRef],
    ["Other PCBUs + coordination (s46)", a.otherPcbus], ["Site supervisor", a.supervisor],
  ]);
  if (missing.length) para(`⚠ MISSING MODULE(S): ${missing.join(", ")} — selected but no longer in the register. Fix before issuing.`, 9, RED);
  if (!hrcw.length) para("No HRCW selected — confirm the questionnaire.", 9, INK60);
  hrcw.forEach((m) => moduleCard(m, 1));
  heading("Compliance & stop-work (WHS Reg 300)");
  para("This work is carried out in accordance with this SWMS. If any person becomes aware the work is not being carried out in accordance with it, or a control is not adequately controlling the risk, the HRCW stops immediately and does not resume until the work complies or the SWMS is revised. Any worker may stop the work; no worker will be disadvantaged for doing so.", 9);

  // ---- PART 2 ----
  newPage();
  stageBand("Part 2 — Task-control modules (not HRCW)");
  if (!task.length) para("No task modules selected.", 9, INK60);
  task.forEach((m) => moduleCard(m, 2));

  // ---- PART 3 — site record ----
  newPage();
  stageBand("Part 3 — Site implementation record");
  heading("Site PPE");
  kv(Object.entries(ppe).length ? Object.entries(ppe) : [["PPE", "not yet resolved"]], { labelW: 220 });
  if (a.fallArrestInUse) {
    heading("Fall-arrest rescue plan (arrest in use)", RED);
    kv([
      ["Ground-clearance calculation", a.groundClearance], ["Anchor type + rating", a.anchorType],
      ["Installed / verified by", a.anchorInstaller], ["Harness / lanyard inspection", a.harnessInspection],
      ["Rescue method", a.rescueMethod], ["Nominated rescuer", a.rescuer], ["Rescue equipment + location", a.rescueEquipment],
    ]);
  }
  heading("Site-specific conditions");
  kv(SITE_CONDITIONS.map(([k, label]) => { const v = (a.conditions || {})[k] || {}; return [label, v.y ? `YES — ${clean(v.detail) || "—"}` : "No"]; }), { labelW: 260 });
  heading("Consultation (with the workers — Act ss47–49)");
  kv([
    ["Toolbox discussion", (pack.consultation && pack.consultation.summary) || a.consultationSummary],
    ["Workers consulted", a.consultationNames], ["Date / method", a.consultationDate],
  ]);
  heading("Document control");
  kv([
    ["Version", `v${pack.version || 1}`], ["Reviewer (competent person)", pack.reviewed_by],
    ["Reviewer sign-off", pack.reviewed_at ? fdate(pack.reviewed_at) : ""], ["Scheduled review due", fdate(pack.review_due_at)],
  ]);

  // ---- EMERGENCY PAGE (fixed position, high contrast) ----
  newPage();
  need(200);
  doc.rect(M, y, CW, 24).fillColor(RED).fill();
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#fff").text("EMERGENCY", M + 8, y + 5); y += 30;
  kv([
    ["Nearest hospital / medical", a.hospital], ["First aider on site", a.firstAider],
    ["First-aid qualification expiry", a.firstAiderExpiry], ["First-aid kit location", a.firstAidKit],
    ["Fire extinguisher location", a.fireExtinguisher], ["Muster point", a.musterPoint],
    ["Emergency contact", company.phone],
  ], { labelW: 220 });

  // ---- SIGN-ON PAGE — the crew signs the printed copy too ----
  newPage();
  stageBand("Worker sign-on — this pack version");
  para("Every worker signs below (or in the field app) confirming this pack was discussed and understood before starting work. A material change bumps the version and requires re-consultation + re-signature.", 9);
  y += 4;
  const rowH = 26, cols = [["Name", 200], ["Date", 90], ["Signature", CW - 290]];
  need(rowH);
  let cx = M;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(INK);
  for (const [label, w] of cols) { doc.rect(cx, y, w, 18).lineWidth(0.5).strokeColor(RULE).stroke(); doc.text(label, cx + 4, y + 5); cx += w; }
  y += 18;
  for (let i = 0; i < 14; i++) {
    need(rowH); cx = M;
    for (const [, w] of cols) { doc.rect(cx, y, w, rowH).lineWidth(0.5).strokeColor(RULE).stroke(); cx += w; }
    y += rowH;
  }

  // ---- footers with Page N of M (bufferPages) ----
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.font("Courier").fontSize(7.5).fillColor(INK60)
      .text(`Blue Leaf Building · ${siteAddress} · v${pack.version || 1} · ${fdate(new Date())} · Page ${i + 1} of ${range.count}`, M, PH - 30, { width: CW, align: "center" });
  }

  doc.end();
  return done;
}
