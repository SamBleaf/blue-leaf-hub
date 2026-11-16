// render-register-specimens.mjs — render controlled documents for the fictional register projects through the
// Hub's real pipeline: register → buildRegisterFixture → payload → renderDocxTemplate → LibreOffice PDF.
//
//   node scripts/documents/render-register-specimens.mjs <outDir> [docType=client_brief]
//
// Writes <name>.docx, <name>.pdf, page images (<name>-N.png, needs pdftoppm) and summary.json (pages, fonts,
// pre-issue checks, leak scan). No database, no network, nothing stored.
import fs from "fs";
import { execFileSync } from "child_process";
import { join } from "path";
import { buildRegisterFixture, renderRegisterDocument, registerDocChecks } from "../../server/lib/registerDocuments.mjs";
import { REGISTER_PROJECTS, plansSuppliedRevision, designCoordination } from "./fixtures/register-projects.mjs";

const [outDir, docType = "client_brief"] = process.argv.slice(2);
if (!outDir) { console.error("usage: render-register-specimens.mjs <outDir> [docType]"); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });

const ISSUED = { status: "Issued", issuedDate: "2026-11-15", revision: 1, issuer: "Sam Morris, Blue Leaf Building" };
const variants = [
  { name: "kestrel-issued", project: "kestrel", ...ISSUED, recipientName: "Jordan & Mia Whitcombe" },
  { name: "kestrel-draft", project: "kestrel", status: "Draft", issuedDate: "2026-11-15", revision: 1, issuer: ISSUED.issuer },
  // R02 a day after R01, saying which revision it replaces (final inspection R02-01).
  { name: "kestrel-plans-supplied", project: "kestrel", ...ISSUED, issuedDate: "2026-11-16", revision: 2, supersedes: { label: "R01", issuedDate: ISSUED.issuedDate },
    recipientName: "Jordan & Mia Whitcombe", tweak: plansSuppliedRevision },
  { name: "powder-issued", project: "powder", ...ISSUED, recipientName: "Priya Raman" },
  { name: "ridgeline-issued", project: "ridgeline", ...ISSUED, recipientName: "Alexander and Catherine Montgomery-Hargreaves" },
];

// The Architect Design Brief goes to the design team: Kestrel Court at design coordination (architect, engineer and energy
// assessor engaged), as a draft and issued, and Ridgeline Drive as an early first issue after the concept presentation.
const ADB_VARIANTS = [
  { name: "kestrel-coordination", project: "kestrel", ...ISSUED, issuedDate: "2026-11-16", recipientName: "Mara Ellison", tweak: designCoordination },
  { name: "kestrel-coordination-draft", project: "kestrel", status: "Draft", issuedDate: "2026-11-16", revision: 1, issuer: ISSUED.issuer, tweak: designCoordination },
  { name: "ridgeline-first-issue", project: "ridgeline", ...ISSUED, issuedDate: "2026-11-16", recipientName: "Brightwater Design" },
];
if (docType === "architect_brief") variants.splice(0, variants.length, ...ADB_VARIANTS);

const tool = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: "utf8" }); } catch { return null; } };
const summary = [];
for (const v of variants) {
  const p = REGISTER_PROJECTS[v.project]();
  v.tweak?.(p);
  const input = { lead: p.lead, context: p.context, register: p.register, projectRef: p.projectRef, revision: v.revision, supersedes: v.supersedes, status: v.status, issuedDate: v.issuedDate, issuer: v.issuer, recipientName: v.recipientName };
  const fx = buildRegisterFixture(docType, input);
  const checks = registerDocChecks(docType, buildRegisterFixture(docType, { ...input, status: "Issued" }), { register: p.register, recipientName: v.recipientName || "Recipient", mode: "issue" });
  const out = await renderRegisterDocument(docType, fx, {});
  const base = join(outDir, `${docType}--${v.name}`);
  fs.writeFileSync(`${base}.docx`, out.docx);
  fs.writeFileSync(`${base}.pdf`, out.pdf);
  fs.writeFileSync(`${base}.fixture.json`, JSON.stringify(fx, null, 2));
  const pages = Number((tool("pdfinfo", [`${base}.pdf`]) || "").match(/Pages:\s+(\d+)/)?.[1] || 0);
  const fonts = [...new Set(((tool("pdffonts", [`${base}.pdf`]) || "").split("\n").slice(2).map((l) => l.split(/\s+/)[0]).filter(Boolean)).map((f) => f.replace(/^[A-Z]{6}\+/, "")))];
  tool("pdftoppm", ["-r", "80", "-png", `${base}.pdf`, base]);
  summary.push({ name: v.name, pages, fonts, leaks: out.leaks, errors: checks.errors, warnings: checks.warnings, template: `${out.template.file}@${out.template.hash}` });
  console.log(`${v.name.padEnd(24)} ${String(pages).padStart(2)} pages  fonts ${fonts.join(",")}  leaks ${out.leaks.length}  errors ${checks.errors.length}`);
}
fs.writeFileSync(join(outDir, `${docType}--summary.json`), JSON.stringify(summary, null, 2));
