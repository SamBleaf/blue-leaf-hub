import PDFDocument from "pdfkit";

const BRAND = "#006c9b";

function dataUrlToBuffer(dataUrl) {
  const s = String(dataUrl || "").trim();
  const m = s.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
  if (!m) return null;
  try {
    return Buffer.from(m[2], "base64");
  } catch {
    return null;
  }
}

function rowTable(doc, x, y, labelW, rows, bodyFont) {
  let cy = y;
  doc.font(bodyFont).fontSize(10).fillColor("#111");
  for (const [label, value] of rows) {
    const v = value == null || value === "" ? "—" : String(value);
    doc.fillColor("#555").fontSize(9).text(label, x, cy, { width: labelW });
    doc.fillColor("#111").text(v, x + labelW, cy, { width: 400 });
    cy += Math.max(18, doc.heightOfString(v, { width: 400 }) + 6);
  }
  return cy;
}

export function buildSiteDiaryPdfBuffer(opts) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: "Site Diary", Author: "Blue Leaf Building" } });
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const addr = opts.projectAddress || "";
    const entryDate = opts.entryDate || "";
    doc.fillColor(BRAND).font("Helvetica-Bold").fontSize(16).text("SITE DIARY", 48, 48);
    doc.font("Helvetica").fontSize(10).fillColor("#333").text(addr, 48, 72);
    doc.text(`Date: ${entryDate}`, 48, 88);

    const rows = [
      ["Weather", opts.weather],
      ["Trades on site", Array.isArray(opts.tradesOnsite) ? opts.tradesOnsite.join(", ") : opts.tradesOnsite],
      ["Work completed", opts.workCompleted],
      ["Issues", opts.issues],
      ["Instructions given", opts.instructionsGiven],
      ["Visitors", opts.visitors],
      ["Supervisor", opts.supervisor]
    ];
    rowTable(doc, 48, 120, 130, rows, "Helvetica");

    const footY = 750;
    doc.fontSize(8).fillColor("#666").text(`Generated ${opts.generatedAt || new Date().toISOString()}`, 48, footY);
    doc.text(`Supervisor: ${opts.supervisor || "—"}`, 48, footY + 12);

    doc.end();
  });
}

export function buildIncidentReportPdfBuffer(opts) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: "Site Report", Author: "Blue Leaf Building" } });
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fillColor(BRAND).font("Helvetica-Bold").fontSize(16).text("SITE REPORT", 48, 48);
    doc.font("Helvetica").fontSize(10).fillColor("#333").text(opts.projectAddress || "", 48, 72);
    doc.text(`Reported: ${opts.reportedAt || ""}`, 48, 88);

    const rows = [
      ["Type", opts.reportType],
      ["Severity", opts.severity],
      ["Title", opts.title],
      ["Description", opts.description],
      ["Corrective action", opts.correctiveAction],
      ["Reported by", opts.reportedBy]
    ];
    rowTable(doc, 48, 115, 130, rows, "Helvetica");

    doc.fontSize(8).fillColor("#666").text(`PDF generated ${opts.generatedAt || new Date().toISOString()}`, 48, 740);
    doc.end();
  });
}

export function buildInductionPdfBuffer(opts) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: "Site Induction", Author: "Blue Leaf Building" } });
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fillColor(BRAND).font("Helvetica-Bold").fontSize(16).text("SITE INDUCTION RECORD", 48, 48);
    doc.font("Helvetica").fontSize(10).fillColor("#333").text(opts.projectAddress || "", 48, 72);

    let y = 100;
    doc.font("Helvetica-Bold").fontSize(11).text("Person details", 48, y);
    y += 18;
    const personRows = [
      ["Name", opts.personName],
      ["Company", opts.company],
      ["Trade", opts.trade],
      ["Mobile", opts.mobile],
      ["Emergency contact", opts.emergencyContactName],
      ["Emergency phone", opts.emergencyContactPhone]
    ];
    y = rowTable(doc, 48, y, 140, personRows, "Helvetica") + 12;

    doc.font("Helvetica-Bold").fontSize(11).text("Site rules acknowledged", 48, y);
    y += 16;
    doc.font("Helvetica").fontSize(10).text(`Yes — ${opts.rulesAckAt || ""}`, 48, y);
    y += 28;

    doc.font("Helvetica-Bold").fontSize(11).text("SWMS acknowledged", 48, y);
    y += 16;
    doc.font("Helvetica").fontSize(9);
    const list = Array.isArray(opts.swmsLines) ? opts.swmsLines : [];
    if (!list.length) {
      doc.text("None listed for this induction.", 48, y);
      y += 20;
    } else {
      for (const line of list) {
        doc.text(`• ${line}`, 48, y, { width: 500 });
        y += 14;
      }
    }
    y += 16;

    const sigBuf = dataUrlToBuffer(opts.signatureDataUrl);
    if (sigBuf) {
      try {
        doc.font("Helvetica-Bold").text("Signature", 48, y);
        y += 14;
        doc.image(sigBuf, 48, y, { width: 220, height: 80 });
        y += 90;
      } catch {
        doc.font("Helvetica").text("(Signature image could not be embedded.)", 48, y);
        y += 20;
      }
    }

    doc.fontSize(8).fillColor("#666").text(`Inducted at ${opts.inductedAt || ""}`, 48, 720);
    doc.end();
  });
}

export function buildScheduleGanttPdfBuffer(opts) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: "A4", margin: 36, layout: "landscape", info: { Title: "Schedule Gantt", Author: "Blue Leaf Building" } });
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const tasks = Array.isArray(opts.tasks) ? opts.tasks : [];
    doc.fillColor(BRAND).font("Helvetica-Bold").fontSize(14).text("CONSTRUCTION SCHEDULE", 36, 36);
    doc.font("Helvetica").fontSize(10).fillColor("#333").text(opts.projectAddress || "", 36, 54);
    doc.text(`Generated ${opts.generatedAt || new Date().toISOString()}`, 36, 68);
    if (opts.summaryLine) {
      doc.font("Helvetica-Oblique").fontSize(9).fillColor("#555").text(String(opts.summaryLine), 36, 82, { width: 720 });
    }

    let y = 100;
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#111");
    doc.text("Phase", 36, y, { width: 90 });
    doc.text("Task", 126, y, { width: 200 });
    doc.text("Start", 330, y, { width: 70 });
    doc.text("End", 400, y, { width: 70 });
    doc.text("Dur", 470, y, { width: 36 });
    doc.text("Deps", 506, y, { width: 80 });
    doc.text("Lead", 586, y, { width: 36 });
    doc.text("Hold", 622, y, { width: 36 });
    doc.text("Notes", 658, y, { width: 120 });
    y += 14;
    doc.moveTo(36, y).lineTo(780, y).stroke("#ccc");
    y += 6;

    doc.font("Helvetica").fontSize(7);
    for (const t of tasks) {
      if (y > 520) {
        doc.addPage();
        y = 36;
      }
      const deps = Array.isArray(t.depends_on) ? t.depends_on.length : 0;
      const conc = Array.isArray(t.can_run_concurrent_with) ? t.can_run_concurrent_with.length : 0;
      const depNote = deps ? `${deps} id(s)` : "";
      const lead = t.lead_time_weeks != null ? `${t.lead_time_weeks}w` : t.procurement_lead_days != null ? `${t.procurement_lead_days}d` : "—";
      doc.fillColor("#111").text(String(t.phase || "").slice(0, 40), 36, y, { width: 90 });
      doc.text(String(t.name || "").slice(0, 80), 126, y, { width: 200 });
      doc.text(String(t.start_date || "—"), 330, y, { width: 70 });
      doc.text(String(t.end_date || "—"), 400, y, { width: 70 });
      doc.text(String(t.duration_days ?? "—"), 470, y, { width: 36 });
      doc.text(depNote + (conc ? ` +${conc}∥` : ""), 506, y, { width: 80 });
      doc.text(lead, 586, y, { width: 36 });
      doc.text(t.is_hold_point ? "Y" : "", 622, y, { width: 36 });
      doc.text(String(t.notes || "").slice(0, 60).replace(/\n/g, " "), 658, y, { width: 120 });
      y += Math.max(12, doc.heightOfString(String(t.name || ""), { width: 200 }) + 2);
    }

    doc.end();
  });
}

export function buildScheduleAnalysisPdfBuffer(opts) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: "Schedule AI Analysis", Author: "Blue Leaf Building" } });
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fillColor(BRAND).font("Helvetica-Bold").fontSize(16).text("SCHEDULE — AI ANALYSIS", 48, 48);
    doc.font("Helvetica").fontSize(10).fillColor("#333").text(opts.projectAddress || "", 48, 72);
    doc.text(`Date: ${opts.analysisDate || ""}`, 48, 88);

    const body = String(opts.analysisText || "").trim() || "—";
    doc.font("Helvetica").fontSize(10).fillColor("#111").text(body, 48, 115, { width: 500, align: "left" });

    doc.fontSize(8).fillColor("#666").text(`Generated ${opts.generatedAt || new Date().toISOString()}`, 48, 740);
    doc.end();
  });
}
