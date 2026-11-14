/**
 * documents-cpb.test.mjs — Client Project Brief (BLB-CPB, template cpb-2.0), doc suite R01.
 * What the homeowner's brief may and may not say, built from real register records through the real builder, plus the
 * template's structure and a real LibreOffice render. No server, no database.
 * Run: node scripts/tests/documents-cpb.test.mjs
 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import PizZip from "pizzip";
import { buildRegisterFixture, renderRegisterDocument, registerDocChecks, legacyProjectRef } from "../../server/lib/registerDocuments.mjs";
import { DOC_DEFS, buildClientBriefPayload } from "../../server/lib/documents/documentPayloads.mjs";
import { documentIdentity, issueRevisionLabel } from "../../server/lib/documents/documentIdentity.mjs";
import { REGISTER_PROJECTS } from "../documents/fixtures/register-projects.mjs";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 600)}` : ""}`); } };
const section = (t) => console.log(`\n${t}`);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");
const flat = (o) => JSON.stringify(o);
const ISSUED = { status: "Issued", issuedDate: "2026-11-15", revision: 1, issuer: "Blue Leaf Building", recipientName: "Jordan & Mia Whitcombe" };
const build = (name, more = {}, tweak) => { const p = REGISTER_PROJECTS[name](); tweak?.(p); return { p, fx: buildRegisterFixture("client_brief", { lead: p.lead, context: p.context, register: p.register, projectRef: p.projectRef, ...ISSUED, ...more }) }; };

const { p: kp, fx } = build("kestrel");
const cb = fx.clientBrief;
const texts = (list) => list.map((x) => x.text);
const block = (label) => cb.boundaries.find((b) => b.label === label)?.items || [];

section("What the brief says, and doesn't");
ok("scope lines are plain words; the reference sits beside them", cb.scopeIn.length >= 8 && cb.scopeIn.every((x) => !/\[|\]/.test(x.text) && /^[A-Z]\d{3}-[0-9A-Z]{3}$/.test(x.ref)), flat(cb.scopeIn.slice(0, 2)));
ok("project-wide rows read without a place prefix; room rows name the room", cb.scopeIn.some((x) => x.text.startsWith("Remove the rear wall")) && cb.scopeIn.some((x) => x.text.startsWith("Kitchen and living: ")) && !cb.scopeIn.some((x) => /^(Whole house|Site \/ existing):/.test(x.text)));
ok("a site fact is never work", !flat(cb.scopeIn).includes("Steep"));
ok("facts are noted as facts", cb.noted.some((g) => g.items.some((t) => /Steep access/.test(t))));
ok("retained, excluded, deferred and by-others stay in their own lists", texts(block("Existing to remain or protect")).some((t) => /Front bedrooms/.test(t))
  && texts(block("Not in the current scope")).some((t) => /Swimming pool/.test(t)) && texts(block("Not in the current scope")).some((t) => /Landscaping.*possible later stage/.test(t))
  && texts(block("By others")).some((t) => /Boundary fencing/.test(t)));
ok("client-supplied items are listed as such, not as included, excluded or a decision", texts(block("Items you plan to supply")).some((t) => /Fridge and coffee machine/.test(t))
  && !flat(cb.scopeIn).includes("Fridge") && !cb.decisions.some((d) => /Fridge/.test(d.action)));
ok("undecided scope is shown as still to be decided, never dropped", texts(block("Still to be decided")).some((t) => /side path/.test(t)));
ok("risks needing a check say who confirms them", texts(block("To be checked during design")).some((t) => /roof framing/.test(t) && /to confirm\.$/.test(t)));
ok("preferences carry a status in words", cb.preferences.flatMap((g) => g.items).every((x) => ["Preferred", "Proposed", "Client-approved", "Requirement", "For consultant review"].includes(x.status)));
ok("an approval with evidence reads Client-approved", cb.preferences.flatMap((g) => g.items).some((x) => /Engineered stone/.test(x.text) && x.status === "Client-approved"));
ok("a kitchen item is grouped with the kitchen; windows have their own group", cb.preferences.find((g) => g.group === "Joinery and kitchen")?.items.some((x) => /stone benchtop/.test(x.text)) && cb.preferences.some((g) => g.group === "Windows and doors"));
ok("a room exception names the room", cb.preferences.flatMap((g) => g.items).some((x) => x.text === "Main bedroom: Wool carpet"));
ok("the consultant-review goal is marked", cb.preferences.flatMap((g) => g.items).some((x) => /airtight/i.test(x.text) && x.status === "For consultant review"));

section("Decisions (Tab 26/27: a preference is never an open action)");
ok("3 to 7 decisions, each a sentence with a register reference", cb.decisions.length >= 3 && cb.decisions.length <= 7 && cb.decisions.every((d) => /^[A-Z]\d{3}-[0-9A-Z]{3}$/.test(d.ref) && /\.$/.test(d.action)), flat(cb.decisions));
ok("a preference with no next action isn't a decision", !cb.decisions.some((d) => /neutral walls|Freestanding bath/i.test(d.action)));
ok("a preference with a real next action is", cb.decisions.some((d) => /basin style/.test(d.action)));
ok("an architect's own task isn't listed as the client's decision", !cb.decisions.some((d) => /stair location/.test(d.action)));
ok("no owner is invented: an unassigned decision prints 'To be agreed'", cb.decisions.some((d) => /access route/.test(d.action) && d.owner === "") && buildClientBriefPayload(fx).DECISIONS.some((d) => /access route/.test(d.ACTION) && d.OWNER === "To be agreed"));
ok("the client's decisions come first", cb.decisions[0].owner === "Client");

section("Next steps follow the engagement pathway");
const steps = (f) => f.clientBrief.nextSteps;
ok("design and build before the PTSA: the separate agreement is explained, Concept is where we are", !!steps(fx).ptsa && steps(fx).steps[0].label === "Concept" && steps(fx).steps[0].current && /pre-construction services agreement/.test(steps(fx).ptsa.text));
const signed = build("kestrel", {}, (p) => { p.context.commercial.ptsaStatus = "signed"; p.lead.stage = "consultants"; }).fx;
ok("PTSA signed: no 'next is the PTSA', and design coordination is current", !steps(signed).ptsa && !/next step is to agree/.test(flat(steps(signed))) && steps(signed).steps[0].label === "Design coordination" && steps(signed).steps[0].current);
const plans = build("kestrel", {}, (p) => { p.context.engagementPathway = "plans_supplied"; p.lead.stage = "consultants"; }).fx;
ok("plans supplied: no PTSA and no concept or agreement step", !steps(plans).ptsa && !/Concept|agreement/i.test(flat(steps(plans).steps)) && /plans are already prepared/.test(steps(plans).paras[0]));
const tender = build("kestrel", {}, (p) => { p.context.engagementPathway = "architect_tender"; p.lead.stage = "tender"; }).fx;
ok("architect tender: no PTSA; pricing is current at Tender", !steps(tender).ptsa && steps(tender).steps.find((x) => x.current)?.label === "Pricing");
const won = build("kestrel", {}, (p) => { p.lead.stage = "won"; }).fx;
ok("won: no process steps, no PTSA", !steps(won).ptsa && steps(won).steps.length === 0);

section("Identity: BLB-[TYPE]-[PROJECT REF]-[REVISION]");
const draftPay = buildClientBriefPayload(build("kestrel", { status: "Draft" }).fx);
const r2 = buildClientBriefPayload(build("kestrel", { revision: 2 }).fx);
ok("a draft carries no revision and says it isn't issued", /^BLB-CPB-0417\s+·\s+Draft — not issued$/.test(draftPay.FTR_IDENTITY) && /^Draft/.test(draftPay.DOC_KICKER) && draftPay.STATUS_LABEL.startsWith("Draft"), draftPay.FTR_IDENTITY);
ok("an issued copy prints its revision and date", /^BLB-CPB-0417-R02\s+·\s+Issued 15 November 2026$/.test(r2.FTR_IDENTITY) && r2.META_ROWS.some((r) => r.VA === "BLB-CPB-0417-R02"), r2.FTR_IDENTITY);
ok("issued to the named recipient", r2.META_ROWS.some((r) => r.LB === "Issued to" && r.VB === "Jordan & Mia Whitcombe"));
ok("the drawing basis is printed as recorded, not in Blue Leaf's revision format", r2.META_ROWS.some((r) => r.VB === "Concept Set C-02, 28 October 2026"));
ok("new issues are R01, R02 …", issueRevisionLabel(1) === "R01" && issueRevisionLabel(12) === "R12");
ok("without an allocated project number, the existing lead reference is used", build("kestrel", { projectRef: undefined }).fx.meta.ref === legacyProjectRef(kp.lead.id) && /^BL[0-9A-F]{6}$/.test(legacyProjectRef(kp.lead.id)));
ok("every document type has a code", ["client_brief", "architect_brief", "selections_schedule", "client_presentation", "tender_scope_notes"].every((t) => /^BLB-[A-Z]{3}-X$/.test(documentIdentity({ type: t, projectRef: "X", status: "Draft" }).number)));

section("Pre-issue checks");
const checks = registerDocChecks("client_brief", fx, { register: kp.register, recipientName: "Jordan & Mia Whitcombe", mode: "issue" });
ok("the Kestrel brief passes the pre-issue checks", checks.errors.length === 0, flat(checks));
ok("no dollar figures, estimate or allowance wording reach the client", !/\$\s?\d|allowance|estimate|margin/i.test(flat(cb)));

section("Template structure (cpb-2.0)");
const zip = new PizZip(fs.readFileSync(join(REPO, "public/templates", DOC_DEFS.client_brief.templateFile)));
const docXml = zip.file("word/document.xml").asText(), hdr = zip.file("word/header1.xml")?.asText() || "", ftr = zip.file("word/footer1.xml")?.asText() || "";
const media = Object.keys(zip.files).filter((n) => n.startsWith("word/media/"));
const logo = fs.readFileSync(join(REPO, "public/brand/logo-black.png"));
ok("a real header part carries the original logo, the document type and the project", /HDR_DOC_TYPE/.test(hdr) && /HDR_PROJECT/.test(hdr) && /<a:blip|r:embed/.test(hdr) && media.some((m) => Buffer.compare(zip.file(m).asNodeBuffer(), logo) === 0));
ok("a real footer part carries the identity and Page X of Y", /FTR_IDENTITY/.test(ftr) && /<w:instrText[^>]*>\s*PAGE\s*</.test(ftr) && /<w:instrText[^>]*>\s*NUMPAGES\s*</.test(ftr) && /Page /.test(ftr) && / of /.test(ftr));
ok("no two tables touch (LibreOffice would merge them and lose the repeating header)", !/<\/w:tbl>\s*<w:tbl>/.test(docXml));
ok("each data table has a repeating header row", (docXml.match(/<w:tblHeader\/>/g) || []).length === 3);
ok("headings are Word styles (PDF outline, editable DOCX)", /w:styleId="Heading1"/.test(zip.file("word/styles.xml").asText()) && (docXml.match(/<w:pStyle w:val="Heading1"\/>/g) || []).length >= 6);
ok("no forced page breaks", !/w:type="page"|pageBreakBefore/.test(docXml));
ok("Lato only in the template", !/w:ascii="(?!Lato)[^"]+"/.test(docXml + hdr + ftr));

section("Rendered through LibreOffice");
const tmp = fs.mkdtempSync(join(tmpdir(), "cpb-test-"));
const text = (pdf, page) => { try { return execFileSync("pdftotext", [...(page ? ["-f", String(page), "-l", String(page)] : []), pdf, "-"], { encoding: "utf8" }); } catch { return null; } };
const pdfPages = (pdf) => { try { return Number(execFileSync("pdfinfo", [pdf], { encoding: "utf8" }).match(/Pages:\s+(\d+)/)[1]); } catch { return 0; } };
const kOut = await renderRegisterDocument("client_brief", fx, {});
const kPdf = join(tmp, "k.pdf"); fs.writeFileSync(kPdf, kOut.pdf);
ok("no unfilled tag or empty value", kOut.leaks.length === 0, kOut.leaks.join());
const kPages = pdfPages(kPdf);
if (text(kPdf) === null) ok("poppler tools available (pdftotext, pdfinfo, pdffonts)", false, "install poppler to run the render checks");
else {
  ok("Kestrel Court is 3 to 5 pages", kPages >= 3 && kPages <= 5, `pages ${kPages}`);
  ok("every page carries the header and 'Page n of N'", Array.from({ length: kPages }, (_, i) => i + 1).every((n) => /CLIENT PROJECT BRIEF/.test(text(kPdf, n)) && new RegExp(`Page ${n} of ${kPages}`).test(text(kPdf, n))));
  ok("the identity is on every page", Array.from({ length: kPages }, (_, i) => i + 1).every((n) => /BLB-CPB-0417-R01/.test(text(kPdf, n))));
  ok("the required preliminary wording is on page 1", /not a construction\s+specification, a fixed-price quotation or a contract/.test(text(kPdf, 1).replace(/\s+/g, " ")));
  let fonts = ""; try { fonts = execFileSync("pdffonts", [kPdf], { encoding: "utf8" }); } catch { /* checked above */ }
  ok("only Lato is embedded (no substitution)", /Lato-Regular/.test(fonts) && fonts.split("\n").slice(2).filter(Boolean).every((l) => /Lato-/.test(l)), fonts);
  const decisionsPages = Array.from({ length: kPages }, (_, i) => i + 1).filter((n) => /DECISION OR NEXT STEP/.test(text(kPdf, n)));
  ok("the decisions table isn't split (short tables stay whole)", decisionsPages.length === 1, `on pages ${decisionsPages}`);
  const { fx: rfx } = build("ridgeline", { recipientName: "Alexander and Catherine Montgomery-Hargreaves" });
  const rPdf = join(tmp, "r.pdf"); fs.writeFileSync(rPdf, (await renderRegisterDocument("client_brief", rfx, {})).pdf);
  const rPages = pdfPages(rPdf);
  const prefPages = Array.from({ length: rPages }, (_, i) => i + 1).filter((n) => /YOUR PREFERENCE/.test(text(rPdf, n)));
  ok("a long preferences table repeats its header on every page it reaches", prefPages.length >= 2, `header on pages ${prefPages}`);
  const { fx: pfx } = build("powder", { recipientName: "Priya Raman" });
  pfx.clientBrief.decisions = [];
  const pPdf = join(tmp, "p.pdf"); fs.writeFileSync(pPdf, (await renderRegisterDocument("client_brief", pfx, {})).pdf);
  const pText = text(pPdf);
  ok("an empty section disappears, and the sections renumber", !/Decisions to make/.test(pText) && /05\/NEXTSTEPS/.test(pText.replace(/\s+/g, "")), pText.slice(0, 300));
  ok("a short job stays short", pdfPages(pPdf) <= 2, `pages ${pdfPages(pPdf)}`);
}
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\ndocuments-cpb: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
