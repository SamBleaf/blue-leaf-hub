// pdfkit is imported lazily inside the builder below — its cold import (~13s here, font
// decompression) must NOT run at module load, or it blocks the whole API server's startup.

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

function fmt$(n) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(n) || 0);
}

/**
 * @param {{ proposal: object, logoDataUrl?: string }} opts
 * @returns {Promise<Buffer>}
 */
export async function buildFeeProposalPdfBuffer(opts) {
  const { default: PDFDocument } = await import("pdfkit");
  const p = opts.proposal || {};
  const summaryRows =
    Array.isArray(p.SUMMARY_ROWS) && p.SUMMARY_ROWS.length
      ? p.SUMMARY_ROWS
      : (p.categories || []).map((c) => {
          const ex = Number(c.subtotal_ex_gst ?? c.subtotal ?? 0);
          const inc = Number(c.subtotal_inc_gst ?? Math.round(ex * 1.1 * 100) / 100);
          const name = c.name || String(c.number ?? "");
          return {
            CATEGORY_NAME: name,
            CATEGORY_SUBTOTAL_EX_GST: fmt$(ex),
            CATEGORY_COST_GST: fmt$(inc)
          };
        });

  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: "Fee Proposal", Author: "Blue Leaf Building" } });
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const logoBuf = dataUrlToBuffer(opts.logoDataUrl);
    if (logoBuf) {
      try {
        doc.image(logoBuf, 48, 42, { width: 100 });
      } catch {
        /* ignore */
      }
    }

    doc.fillColor(BRAND).font("Helvetica-Bold").fontSize(16).text("Blue Leaf Building", 48, logoBuf ? 150 : 48, {
      width: 500
    });
    doc.fillColor("#111").font("Helvetica").fontSize(11);
    let y = logoBuf ? 178 : 76;
    doc.text(`Fee Proposal — ${String(p.quote_number || "").trim() || "Draft"}`, 48, y);
    y += 22;
    doc.font("Helvetica-Bold").text("Project", 48, y);
    doc.font("Helvetica").text(String(p.address || "—"), 140, y, { width: 400 });
    y += 36;
    doc.font("Helvetica-Bold").text("Client", 48, y);
    doc.font("Helvetica").text(String(p.client_name || "—"), 140, y, { width: 400 });
    y += 22;
    doc.font("Helvetica-Bold").text("Architect", 48, y);
    doc.font("Helvetica").text(String(p.architect_name || "—"), 140, y, { width: 400 });
    y += 22;
    doc.font("Helvetica-Bold").text("Refs", 48, y);
    doc
      .font("Helvetica")
      .text(`Arch: ${p.arch_ref || "—"}  Eng: ${p.eng_ref || "—"}  Spec: ${p.spec_ref || "—"}`, 140, y, { width: 400 });
    y += 28;
    if (p.floor_area_m2 != null && p.floor_area_m2 !== "") {
      doc.font("Helvetica-Bold").text("Floor area", 48, y);
      doc.font("Helvetica").text(`${p.floor_area_m2} m²`, 140, y, { width: 400 });
      y += 22;
    }
    y += 14;

    doc.fillColor(BRAND).font("Helvetica-Bold").fontSize(12).text("Summary", 48, y);
    y += 18;
    doc.fillColor("#111").font("Helvetica").fontSize(9);
    for (const r of summaryRows.slice(0, 40)) {
      doc.text(`${r.CATEGORY_NAME || r.name || "—"} — ${r.CATEGORY_COST_GST || r.CATEGORY_SUBTOTAL_EX_GST || ""}`, 52, y, {
        width: 500
      });
      y += 14;
      if (y > 700) {
        doc.addPage();
        y = 48;
      }
    }
    y += 10;
    doc.font("Helvetica-Bold").text(`Total (inc GST): ${fmt$(p.total_inc_gst)}`, 48, y);
    y += 28;

    doc.fillColor(BRAND).font("Helvetica-Bold").fontSize(12).text("Inclusions", 48, y);
    y += 16;
    doc.fillColor("#111").font("Helvetica").fontSize(9);
    for (const sec of p.inclusion_sections || []) {
      doc.font("Helvetica-Bold").text(String(sec.SECTION_HEADING || ""), 52, y);
      y += 12;
      for (const it of sec.SECTION_ITEMS || []) {
        doc.font("Helvetica").text(`• ${String(it.ITEM_TEXT || "")}`, 58, y, { width: 480 });
        y += 12;
        if (y > 720) {
          doc.addPage();
          y = 48;
        }
      }
      y += 6;
    }

    y += 10;
    doc.fillColor(BRAND).font("Helvetica-Bold").fontSize(12).text("Exclusions", 48, y);
    y += 14;
    doc.fillColor("#111").font("Helvetica").fontSize(9);
    for (const ex of p.exclusions || []) {
      const line = typeof ex === "string" ? ex : ex?.EXCLUSION_TEXT || "";
      doc.text(`• ${line}`, 52, y, { width: 500 });
      y += 12;
      if (y > 720) {
        doc.addPage();
        y = 48;
      }
    }

    y += 14;
    doc.fillColor(BRAND).font("Helvetica-Bold").fontSize(12).text("Fee schedule", 48, y);
    y += 14;
    doc.fillColor("#111").font("Helvetica").fontSize(9);
    for (const row of p.fee_schedule || []) {
      doc.text(`${row.STAGE_CLAIM || ""} — ${row.MILESTONE || ""} — ${row.PERCENTAGE || ""}`, 52, y);
      y += 12;
    }

    y += 16;
    doc.fillColor(BRAND).font("Helvetica-Bold").text("Next steps", 48, y);
    y += 14;
    doc.fillColor("#111").font("Helvetica").fontSize(9).text(String(p.next_steps || "").slice(0, 4000), 48, y, {
      width: 500
    });

    doc.end();
  });
}
