// conceptAgreementPdf.mjs — Sales OS Discovery. Generates the client-facing Concept Agreement PDF
// (overview, the 3-stage process, what you receive, what we need, fee summary). Built programmatically
// with pdfkit (no template file needed), saved to the lead-documents bucket at Discovery, and either
// shown in the meeting (downloaded) or attached to the discovery email. Fees are stored EX-GST and
// rendered INC-GST (rounded to whole dollars).

import { incGst } from "./constants.mjs";

const BRAND = "#006c9b";
const money = (exGst) => (exGst == null || exGst === "" ? "to be confirmed" : "$" + Math.round(incGst(exGst)).toLocaleString("en-AU") + " inc GST");

export async function buildConceptAgreementPdfBuffer({ lead = {}, designer = null } = {}) {
  const { default: PDFDocument } = await import("pdfkit");
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: "A4", margin: 56, info: { Title: "Concept Agreement", Author: "Blue Leaf Building" } });
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const clientName = (lead.name || [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "[Client]").trim();
    const designerName = designer ? `${designer.first_name || ""} ${designer.last_name || ""}`.trim() : "your recommended designer";
    const designerCompany = designer?.company || "";
    const site = (lead.site_address || lead.suburb || "").trim();
    const dateStr = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

    const H = (t) => { doc.moveDown(0.8); doc.fillColor(BRAND).font("Helvetica-Bold").fontSize(13).text(t); doc.moveDown(0.3); doc.fillColor("#222").font("Helvetica").fontSize(10.5); };
    const P = (t) => { doc.fillColor("#222").font("Helvetica").fontSize(10.5).text(t, { align: "left" }); doc.moveDown(0.4); };
    const stageHead = (t) => { doc.moveDown(0.3); doc.fillColor("#111").font("Helvetica-Bold").fontSize(11).text(t); doc.fillColor("#222").font("Helvetica").fontSize(10.5); };

    // Header
    doc.fillColor(BRAND).font("Helvetica-Bold").fontSize(20).text("Concept Agreement");
    doc.fillColor("#666").font("Helvetica").fontSize(10).text("Blue Leaf Building");
    doc.text(dateStr);
    doc.moveDown(0.6);
    doc.fillColor("#111").font("Helvetica").fontSize(10.5);
    doc.text(`Prepared for: ${clientName}`);
    if (site) doc.text(`Project: ${site}`);
    doc.text(`Recommended designer: ${designerName}${designerCompany ? ` (${designerCompany})` : ""}`);

    H("Overview");
    P("Thank you for the opportunity to work with you on your project. This document outlines our design-and-build process from here — what each stage involves, what it costs, and what you can expect — so there are no surprises down the track.");

    H("Our process");
    stageHead(`1. Concept Design Package — ${money(lead.concept_fee)}`);
    P(`A follow-up meeting with ${designerName} and the Blue Leaf team to run through measurements, ideas and key design considerations, after which ${designerName} prepares two concept drawings for your project. This small upfront fee keeps everyone aligned before more detailed design work begins. You'll review the concepts and we'll meet again to talk through any changes.`);
    stageHead(`2. Full Design Package — ${money(lead.design_package_fee)}`);
    P("If you're happy with the concepts and wish to proceed, we move into full design: a complete set of planning documents (floor plans, elevations, interiors and site plans — yours to keep), the engineering documentation required for approval, management of the entire planning-approval process, and full coordination from Blue Leaf throughout, keeping the project aligned with your budget and design preferences on a smooth path to construction.");
    stageHead("3. Fixed Price Building Proposal");
    P("Once your plans are approved and documentation is finalised, we prepare a Fixed Price Building Proposal. If accepted, we move into a building contract — and from there, breaking ground and starting your build.");

    H("What you receive at concept stage");
    P("- A collaborative design meeting with your recommended designer\n- Two concept drawings prepared for your project\n- A review meeting to talk through changes and next steps");

    H("What we need from you");
    P("- Any inspiration, mood boards or design ideas you'd like to share\n- Your confirmation to proceed with the Concept Design Package");

    H("Fee summary");
    P(`Concept Design Package: ${money(lead.concept_fee)}\nFull Design Package: ${money(lead.design_package_fee)}\nFixed Price Building Proposal: prepared once your plans are approved`);

    doc.moveDown(1.2);
    doc.fillColor("#666").font("Helvetica").fontSize(9).text("Blue Leaf Building  ·  Licensed Builder BLD 332830  ·  ABN 88 656 051 188", { align: "center" });

    doc.end();
  });
}
