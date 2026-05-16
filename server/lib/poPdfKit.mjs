import fs from "fs";
import PDFDocument from "pdfkit";
import { DEFAULT_PO_TERMS } from "./poDefaultTerms.mjs";

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

function pickBodyFont(doc) {
  const p = process.env.LATO_TTF_PATH?.trim();
  if (p && fs.existsSync(p)) {
    try {
      doc.registerFont("lato", p);
      return "lato";
    } catch {
      /* fall through */
    }
  }
  return "Helvetica";
}

/**
 * @param {object} opts
 * @param {string} opts.poNumber
 * @param {string} opts.dateCreatedIso
 * @param {{ companyName: string, abn: string, address: string, phone: string, email: string, website: string }} opts.company
 * @param {{ name: string, lines: string[] }} opts.vendor
 * @param {string} opts.jobAddress
 * @param {string} opts.tradeTitle
 * @param {string} opts.scheduledCompletionIso
 * @param {string} opts.tentativeStartLabel
 * @param {{ description: string, qty: string, unit: string, unitCost: number, lineTotal: number }[]} opts.lineItems
 * @param {number} opts.subtotalExGst
 * @param {number} opts.gstAmount
 * @param {number} opts.totalIncGst
 * @param {string[]} opts.standardConditions
 * @param {string} [opts.termsPage2]
 * @param {string} [opts.logoDataUrl]
 */
export function buildPurchaseOrderPdfBuffer(opts) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: "Purchase Order", Author: opts.company?.companyName || "Blue Leaf Building" } });
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const bodyFont = pickBodyFont(doc);
    const headingFont = bodyFont === "Helvetica" ? "Helvetica-Bold" : bodyFont;

    const logoBuf = dataUrlToBuffer(opts.logoDataUrl);
    if (logoBuf) {
      try {
        doc.image(logoBuf, 48, 42, { width: 110 });
      } catch {
        /* ignore bad image */
      }
    }

    const c = opts.company || {};
    doc.fillColor(BRAND).font(headingFont).fontSize(11);
    doc.text(c.companyName || "Blue Leaf Building", 320, 42, { width: 220, align: "right" });
    doc.fillColor("#111").font(bodyFont).fontSize(9);
    const rhs = [
      c.abn ? `ABN: ${c.abn}` : "",
      c.address || "",
      c.email || "",
      c.phone || "",
      c.website || ""
    ]
      .filter(Boolean)
      .join("\n");
    doc.text(rhs, 320, 58, { width: 220, align: "right" });

    doc.moveDown(4);
    doc.fillColor(BRAND).font(headingFont).fontSize(20).text("Purchase Order", 48, doc.y);
    doc.moveDown(0.6);

    doc.fillColor("#111").font(headingFont).fontSize(10);
    doc.text(`Date Created: ${opts.dateCreatedIso || ""}`, { continued: false });
    doc.font(bodyFont).text(`Date Released: N/A`);
    doc.font(headingFont).text(`Purchase Order #: ${opts.poNumber || ""}`);

    doc.moveDown(1);
    const y0 = doc.y;
    doc.font(headingFont).text("SUB / VENDOR", 48, y0, { width: 230 });
    doc.text("JOB", 290, y0, { width: 250 });
    doc.font(bodyFont).fontSize(9);
    const vy = y0 + 16;
    doc.text((opts.vendor?.lines || []).join("\n"), 48, vy, { width: 230 });
    doc.text(opts.jobAddress || "", 290, vy, { width: 250 });

    doc.moveDown(4);
    const ty = doc.y;
    doc.rect(48, ty, 504, 22).stroke("#ccc");
    doc.font(headingFont).fontSize(9).text("PO Title", 52, ty + 6, { width: 120 });
    doc.text("Sched. completion", 180, ty + 6, { width: 120 });
    doc.text("Status", 310, ty + 6, { width: 70 });
    doc.text("Total (ex GST)", 400, ty + 6, { width: 140 });
    doc.font(bodyFont);
    doc.text(opts.tradeTitle || "", 52, ty + 28, { width: 120 });
    doc.text(opts.scheduledCompletionIso || "TBC", 180, ty + 28, { width: 120 });
    doc.text("Draft", 310, ty + 28, { width: 70 });
    doc.text(`$${Number(opts.subtotalExGst || 0).toFixed(2)}`, 400, ty + 28, { width: 140, align: "right" });

    doc.moveDown(3.2);
    const sy = doc.y;
    doc.rect(48, sy, 504, 120).stroke("#ccc");
    doc.font(headingFont).fontSize(10).text("Scope of Work — standard conditions", 56, sy + 8);
    doc.font(bodyFont).fontSize(8.5);
    const conds = Array.isArray(opts.standardConditions) ? opts.standardConditions : [];
    doc.text(conds.join("\n"), 56, sy + 26, { width: 488 });

    doc.moveDown(6.5);
    doc.font(headingFont).fontSize(9).text("Line items");
    const ly = doc.y + 6;
    doc.rect(48, ly, 504, 22).stroke("#ccc");
    doc.text("Description", 52, ly + 6, { width: 200 });
    doc.text("Qty / Unit", 260, ly + 6, { width: 80 });
    doc.text("Unit $", 350, ly + 6, { width: 70 });
    doc.text("Line $", 430, ly + 6, { width: 110, align: "right" });

    let rowY = ly + 28;
    for (const row of opts.lineItems || []) {
      doc.rect(48, rowY - 4, 504, 20).stroke("#eee");
      doc.font(bodyFont).fontSize(8.5);
      doc.text(row.description || "", 52, rowY, { width: 200 });
      doc.text(`${row.qty || ""} ${row.unit || ""}`.trim(), 260, rowY, { width: 80 });
      doc.text(`$${Number(row.unitCost || 0).toFixed(2)}`, 350, rowY, { width: 70 });
      doc.text(`$${Number(row.lineTotal || 0).toFixed(2)}`, 430, rowY, { width: 110, align: "right" });
      rowY += 22;
    }

    doc.font(headingFont).fontSize(9);
    doc.text(`Subtotal (ex GST)    $${Number(opts.subtotalExGst || 0).toFixed(2)}`, 48, rowY + 8, { width: 500, align: "right" });
    doc.text(`GST 10%              $${Number(opts.gstAmount || 0).toFixed(2)}`, 48, rowY + 24, { width: 500, align: "right" });
    doc.text(`Total (inc GST)       $${Number(opts.totalIncGst || 0).toFixed(2)}`, 48, rowY + 40, { width: 500, align: "right" });

    doc.moveDown(5);
    doc.font(bodyFont).fontSize(8.5).fillColor("#444").italic();
    doc.text(
      "This Purchase Order is issued subject to the terms and conditions on the following page(s). " +
        "Signature below indicates acceptance of this Purchase Order and attached terms.",
      48,
      doc.y,
      { width: 504 }
    );
    doc.fillColor("#111").font(bodyFont).fontSize(9).text("\n\nSignature: ________________________________    Date: ______________    Approved by: ________________", 48, doc.y, {
      width: 504
    });

    doc.addPage();
    doc.fillColor(BRAND).font(headingFont).fontSize(14).text("Terms and Conditions", 48, 48);
    doc.fillColor("#111").font(bodyFont).fontSize(8.5);
    const terms = String(opts.termsPage2 || DEFAULT_PO_TERMS).trim();
    doc.text(terms, 48, 78, { width: 504, align: "left" });

    doc.end();
  });
}

export function defaultStandardConditions(tentativeStartLabel) {
  const t = tentativeStartLabel || "TBC";
  return [
    "1. Please see attached for full terms and conditions",
    "2. Supply/carry out all works as per Construction Documentation and attached quote",
    "3. This PO is NON ACTIVE until all WH&S requirements are completed via HazardCo",
    "4. All invoices must indicate PO number",
    "5. No on-site activity to commence prior to receiving stamped construction drawings",
    "6. The project manager will be in contact to confirm timing: Sam Morris — 0434 046 399",
    `7. Indicative timing for works: ${t}`,
    "8. All values are GST Exclusive"
  ];
}
