import fs from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
// pdfkit imported lazily inside the builder (cold import is ~13s; must not block server boot).
import { DEFAULT_PO_TERMS } from "./poDefaultTerms.mjs";

const BRAND = "#006c9b";
const PO_HEADER_LOGO_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../public/brand/logo-black.png");
const PO_WATERMARK_LOGO_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../public/brand/icon-blue.png");
const PO_HEADER_LOGO_X = 40;
const PO_HEADER_LOGO_Y = 28;
const PO_HEADER_LOGO_W = 152;
const PO_TITLE_Y = 142;

function loadBrandPng(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return fs.readFileSync(filePath);
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

/** Wordmark header (logo-black.png) + faint leaf watermark (icon-blue.png). */
function drawBrandLayer(doc, headerBuf, watermarkBuf) {
  if (watermarkBuf) {
    try {
      doc.save();
      doc.opacity(0.06);
      doc.image(watermarkBuf, 18, 580, { width: 110 });
      doc.restore();
    } catch {
      /* ignore bad image */
    }
  }
  if (headerBuf) {
    try {
      doc.image(headerBuf, PO_HEADER_LOGO_X, PO_HEADER_LOGO_Y, { width: PO_HEADER_LOGO_W });
    } catch {
      /* ignore bad image */
    }
  }
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
 * @param {string} [opts.logoDataUrl] — ignored for PO PDF header; wordmark loaded from public/brand/logo-black.png
 * @param {{ fileName?: string, receivedDate?: string, acceptedAmountExGst?: number|null, attachmentStatus?: string }} [opts.quoteReference]
 */
export async function buildPurchaseOrderPdfBuffer(opts) {
  const { default: PDFDocument } = await import("pdfkit");
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: "Purchase Order", Author: opts.company?.companyName || "Blue Leaf Building" } });
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const bodyFont = pickBodyFont(doc);
    const headingFont = bodyFont === "Helvetica" ? "Helvetica-Bold" : bodyFont;

    const headerBuf = loadBrandPng(PO_HEADER_LOGO_PATH);
    const watermarkBuf = loadBrandPng(PO_WATERMARK_LOGO_PATH);
    drawBrandLayer(doc, headerBuf, watermarkBuf);

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

    doc.fillColor(BRAND).font(headingFont).fontSize(20).text("Purchase Order", 48, PO_TITLE_Y);
    doc.y = PO_TITLE_Y + 28;

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

    doc.moveDown(3);
    const sy = doc.y;
    const conds = Array.isArray(opts.standardConditions) ? opts.standardConditions : [];
    const condText = conds.join("\n");
    doc.font(bodyFont).fontSize(8);
    const condBodyHeight = condText
      ? doc.heightOfString(condText, { width: 488, lineGap: 1.2 })
      : 0;
    const scopeBoxHeight = Math.min(108, Math.max(58, condBodyHeight + 24));
    doc.rect(48, sy, 504, scopeBoxHeight).stroke("#ccc");
    doc.font(headingFont).fontSize(9).fillColor("#111").text("Scope of Work — standard conditions", 56, sy + 6);
    doc.font(bodyFont).fontSize(8).fillColor("#111");
    if (condText) {
      doc.text(condText, 56, sy + 20, { width: 488, lineGap: 1.2 });
    }
    doc.y = sy + scopeBoxHeight + 6;

    const qr = opts.quoteReference;
    if (qr) {
      const qy = doc.y;
      doc.rect(48, qy, 504, 54).stroke("#ddd");
      doc.font(headingFont).fontSize(9).fillColor("#111").text("Quote Reference", 56, qy + 6);
      doc.font(bodyFont).fontSize(8);
      const submitted =
        qr.fileName && qr.fileName !== "Unavailable" ? qr.fileName : "Unavailable";
      const received = qr.receivedDate || "—";
      const amount =
        qr.acceptedAmountExGst != null && Number(qr.acceptedAmountExGst) > 0
          ? `$${Number(qr.acceptedAmountExGst).toFixed(2)} (ex GST)`
          : "—";
      const attach = qr.attachmentStatus || "Not available";
      doc.text(
        [
          `Submitted quote: ${submitted}`,
          `Received: ${received}`,
          `Accepted amount: ${amount}`,
          `Quote attachment: ${attach}`,
        ].join("\n"),
        56,
        qy + 20,
        { width: 488 }
      );
      doc.y = qy + 58;
    }

    doc.moveDown(2.5);
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
    const italicFont = bodyFont === "Helvetica" ? "Helvetica-Oblique" : bodyFont;
    doc.font(italicFont).fontSize(8.5).fillColor("#444");
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

export function defaultStandardConditions(_tentativeStartLabel) {
  return [
    "1. Complete all works in accordance with the construction documentation, accepted quote, and this Purchase Order.",
    "2. This PO is not active until required WHS / site compliance items are complete.",
    "3. All invoices must include the PO number.",
    "4. No on-site activity is to commence before approved/stamped construction drawings are issued, unless agreed in writing.",
    "5. Timing is indicative only and will be confirmed by the Project Manager.",
    "6. All values are GST exclusive unless noted otherwise.",
  ];
}
