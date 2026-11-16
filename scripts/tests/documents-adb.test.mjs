/**
 * documents-adb.test.mjs — the Architect Design Brief (BLB-ADB, template adb-1.0 on the shared design system), doc suite
 * R01. Built from real register records (scripts/documents/fixtures/register-projects.mjs) through the real fixture
 * builder, payload and renderer. No database, no network.
 *
 *   node scripts/tests/documents-adb.test.mjs
 */
import fs from "fs";
import os from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import PizZip from "pizzip";
import { buildRegisterFixture, renderRegisterDocument, registerDocChecks } from "../../server/lib/registerDocuments.mjs";
import { buildArchitectBriefPayload, DOC_DEFS, validateFixture } from "../../server/lib/documents/documentPayloads.mjs";
import { makeItem } from "../../src/lib/register.js";
import { REGISTER_PROJECTS, designCoordination, KESTREL_DESIGN_TEAM } from "../documents/fixtures/register-projects.mjs";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 600)}` : ""}`); } };
const section = (t) => console.log(`\n${t}`);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");
const flat = (o) => JSON.stringify(o);
const ISSUED = { status: "Issued", issuedDate: "2026-11-16", revision: 1, issuer: "Sam Morris, Blue Leaf Building", recipientName: "Mara Ellison" };
const build = (name, more = {}, tweak) => { const p = REGISTER_PROJECTS[name](); tweak?.(p); return { p, fx: buildRegisterFixture("architect_brief", { lead: p.lead, context: p.context, register: p.register, projectRef: p.projectRef, ...ISSUED, ...more }) }; };
const rows = (pl, key) => [...pl[`${key}_KEEP`], ...pl[key], ...pl[`${key}_PEN`], ...pl[`${key}_LAST`]];

const { p: kp, fx: kfx } = build("kestrel", {}, designCoordination);
const kab = kfx.architectBrief, kpay = buildArchitectBriefPayload(kfx);
const { fx: rfx } = build("ridgeline", { recipientName: "Brightwater Design" });
const rab = rfx.architectBrief, rpay = buildArchitectBriefPayload(rfx);

section("What we need from the design team (coordination first: Tab 17:36)");
ok("requests are the design team's: architect, engineer, energy assessor; each named from the consultants on file", kab.requests.length === 7
  && kab.requests.every((r) => KESTREL_DESIGN_TEAM.some((c) => c.company === r.who)), flat(kab.requests.map((r) => r.who)));
ok("…in discipline order: the architect's first, then the engineer's, then the energy assessor's", kab.requests.map((r) => r.who).join("|")
  === "Ellison Architecture|Ellison Architecture|Ellison Architecture|Ellison Architecture|Corbett Structural|Corbett Structural|Hills Energy Rating", kab.requests.map((r) => r.who).join("|"));
ok("…a request is the action, said as a sentence, with the room where it belongs", kab.requests.some((r) => r.text === "Kitchen and living (A101): Show the island, the butler's pantry and the appliance positions on the next kitchen plan."));
ok("with no consultant on file, the discipline is named, never a person invented (Ridgeline: Engineer)", rab.requests.length === 1 && rab.requests[0].who === "Engineer");

{
  // Found by the sandbox e2e: a client requirement or a choice with a check open is not turned into a request.
  const { fx } = build("kestrel", {}, (p) => {
    designCoordination(p);
    p.register.items.push(makeItem({ id: "ri_kc_t1", itemKind: "requirement", promptKey: "W-015", category: "windows", section: "project", responsibility: "architect", technicalStatus: "needs_verification", description: "Control western sun to the living area" }));
    p.register.items.push(makeItem({ id: "ri_kc_t2", itemKind: "action", promptKey: "K-011", category: "joinery", roomId: "k_kitchen", room: "Kitchen and living", section: "room", responsibility: "trade", technicalStatus: "needs_verification", description: "Drawer runners and push-to-open: joiner to confirm" }));
  });
  const a = fx.architectBrief;
  ok("a requirement with a check open stays a requirement, marked To verify (not a 'Confirm:' request)", a.requirements.some((r) => /western sun/.test(r.text) && r.status === "To verify") && !a.requests.some((r) => /western sun/.test(r.text))
    && /To verify: the design team still needs to confirm how it is met/.test(buildArchitectBriefPayload(fx).REQS_INTRO));
  ok("a trade's technical check is a request, in its own words when they already say what to do", a.requests.some((r) => r.text === "Kitchen and living (A101): Drawer runners and push-to-open: joiner to confirm." && r.who === "Trade / supplier"));
}

section("Decisions that affect the drawings");
ok("the client's and Blue Leaf's open actions; an unassigned one reads 'To be agreed' (never handed to the architect)", kab.decisions.length === 5
  && kab.decisions.every((d) => ["Client", "Blue Leaf", "To be agreed"].includes(d.who)) && kab.decisions.some((d) => /access route/.test(d.text) && d.who === "To be agreed"), flat(kab.decisions));
ok("a decision already made isn't listed (the footprint, settled at the PTSA meeting)", !kab.decisions.some((d) => /footprint/.test(d.text)) && !kab.requests.some((r) => /footprint/.test(r.text)));
ok("the client's own design-affecting decisions now reach the architect (were filtered out before)", rab.decisions.some((d) => /ceiling height/.test(d.text) && d.who === "Client") && rab.decisions.some((d) => /appliance brand/.test(d.text)));

section("What the design must achieve");
ok("the client's priorities come first, in their own words", /^Client priorities: Natural light, entertaining and storage\. In the client's words: "We want the kitchen/.test(kab.requirements[0].text) && kab.requirements[0].status === "");
ok("Client-approved only with evidence, and it says when a technical check is still open, and who confirms it (Tab 26 DOC-02, Tab 11:30)", kab.requirements.some((r) => r.status === "Client-approved" && /\(technical check pending: Hills Energy Rating\)$/.test(r.text)), flat(kab.requirements.map((r) => r.text)));
ok("a performance direction reads 'For consultant review'; a plain requirement carries no label", kab.requirements.some((r) => /Envelope quality/.test(r.text) && r.status === "For consultant review") && kab.requirements.some((r) => /Heating, cooling/.test(r.text) && r.status === ""));
{
  const { fx } = build("kestrel", {}, (p) => { designCoordination(p); const w = p.register.items.find((i) => /Good daylight/.test(i.description || "")); w.evidence = null; });
  ok("…an approval with no evidence never prints as Client-approved", fx.architectBrief.requirements.find((r) => /Good daylight/.test(r.text)).status !== "Client-approved");
}
ok("the key explains only the statuses printed", /Client-approved: the client has confirmed it/.test(kpay.REQS_INTRO) && /For consultant review:/.test(kpay.REQS_INTRO)
  && !/Client-approved/.test(rpay.REQS_INTRO), rpay.REQS_INTRO);

section("Scope and boundaries");
ok("grouped by kind: the work, then what stays, what's out, by others, client supplied, undecided, the site and household", kab.scope.map((g) => g.group).join("|")
  === "Proposed work|Existing to remain or protect|Not in the current scope|By others|Supplied by the client|Still to be decided|Site and household", kab.scope.map((g) => g.group).join("|"));
ok("the room work is said once per family of rooms, with every record's reference (Ridgeline)", rab.scope[0].rows.some((r) => r.text === "New kitchen, scullery, living room, dining room and family room" && r.refs.length === 5));
ok("the folded garage keeps both references", rab.scope[0].rows.some((r) => /double garage/.test(r.text) && r.refs.length === 2));
ok("a check the design team owns is asked once, in the requests, and not repeated in the scope (Tab 27:20)", !rab.scope.flatMap((g) => g.rows).some((r) => /Soil classification/.test(r.text)) && rab.requests.some((r) => /Soil classification/.test(r.text)));
ok("the Check column is labelled only when a check is open", kpay.SCOPE_CHECK_HEAD === "" && !kab.scope.some((g) => g.rows.some((r) => r.check)));
{
  const { fx } = build("kestrel", {}, (p) => { designCoordination(p); p.register.items.find((i) => i.description === "Remove the rear wall and the existing lean-to").technicalStatus = "needs_verification"; });
  const pl = buildArchitectBriefPayload(fx);
  ok("…and reads 'To verify' on the row whose check is open", pl.SCOPE_CHECK_HEAD === "Check" && fx.architectBrief.scope[0].rows.find((r) => /rear wall/.test(r.text)).check === "To verify");
}

section("Design direction by location (common information once, then the exceptions)");
ok("what applies throughout the house comes first, once", kab.directionGroups[0].group === "Throughout the house" && kab.directionGroups[0].rows.length === 4);
// ADB-01 (owner, 16 Nov): an exception is described only when the default it names applies to the room. Kestrel's floor
// default covers the main floor zone, so the main bedroom's carpet is simply its own choice, even though the record
// still carries a link to that default.
ok("ADB-01: a bedroom's carpet isn't 'instead of' a main-floor default that never applied to it", kab.directionGroups.find((g) => /Main bedroom/.test(g.group)).rows[0].text === "Wool carpet");
{
  const { fx } = build("kestrel", {}, (p) => { designCoordination(p); const d = p.register.items.find((i) => i.description === "Engineered timber-look flooring through the main living areas"); d.answer = { zone: { key: "bedroom_floor", label: "Bedroom floor" } }; d.description = "Engineered timber-look flooring to the bedrooms"; });
  ok("ADB-01: …and when the default does apply (the bedroom-floor zone), the exception names what it replaces", fx.architectBrief.directionGroups.find((g) => /Main bedroom/.test(g.group)).rows[0].text === "Wool carpet, instead of the engineered timber-look flooring to the bedrooms");
  const { fx: fx2 } = build("kestrel", {}, (p) => { designCoordination(p); const d = p.register.items.find((i) => i.description === "Engineered timber-look flooring through the main living areas"); delete d.answer; });
  ok("ADB-01: …an unzoned default applies to every room, so it is named there too (the register's rule, not a guess)", /^Wool carpet, instead of the engineered/.test(fx2.architectBrief.directionGroups.find((g) => /Main bedroom/.test(g.group)).rows[0].text));
}
ok("ADB-02: the scope section reads 'Scope and boundaries' on every pathway", /sectionHead|Scope and boundaries/.test(fs.readFileSync(join(REPO, "scripts/documents/author-adb.mjs"), "utf8")) && new PizZip(fs.readFileSync(join(REPO, "public/templates/blb-architect-brief-template.docx"))).file("word/document.xml").asText().includes("Scope and boundaries"));
{
  const study = rab.directionGroups.find((g) => g.group === "Study").rows;
  ok("ADB-03: the study's desk and shelving are joinery work in the study (scope), its feature colour is the study's own wall finish, and the house walls say nothing about the study",
    rab.scope.find((g) => g.group === "Proposed work").rows.some((r) => r.text === "Study: Built-in desk and shelving along one wall") && !study.some((r) => /desk/.test(r.text))
    && study.length === 1 && study[0].item === "Wall, ceiling & feature finish" && /feature colour/.test(study[0].text)
    && rab.directionGroups[0].rows.some((r) => r.text === "Warm white walls throughout") && !flat(rab.directionGroups[0]).includes("study"), flat([study, rab.scope[0].rows.map((r) => r.text)]));
}
ok("Preferred is the norm, so it isn't printed; Proposed and Client-approved are", kab.directionGroups.flatMap((g) => g.rows).every((r) => ["", "Proposed", "Client-approved"].includes(r.status))
  && kab.directionGroups.flatMap((g) => g.rows).some((r) => r.status === "Client-approved") && /unless marked Proposed or Client-approved/.test(kpay.DIR_INTRO));
ok("rooms with the same choices share one group, each record's reference kept; a room's own extra stays its own (Ridgeline)",
  rab.directionGroups.some((g) => g.group === "Ensuite and bathroom" && g.rows.length === 5 && g.rows.every((r) => r.ref.split(", ").length === 2))
  && rab.directionGroups.some((g) => g.group === "Ensuite" && g.rows.length === 1 && /bath/i.test(g.rows[0].text)), flat(rab.directionGroups.map((g) => [g.group, g.rows.length])));
ok("a room's own drawing sheet is named once, in its header", kab.directionGroups.some((g) => g.group === "Kitchen and living  ·  A101"));

section("The editorial rule: no system wording repeated row after row");
const printed = flat(kpay) + flat(rpay);
ok("no 'Whole house' or 'Site / existing' anywhere", !/Whole house|Site \/ existing/.test(printed));
ok("no '(project default)', '(room exception)' or '(intent, subject to consultant review)' tags", !/\(project default\)|\(room exception\)|subject to consultant review/.test(printed));
ok("no 'Preferred' status, no 'OPEN' column, no 'New: New'", !/"STATUS":"Preferred"|"OPEN"|New: New/.test(printed));
ok("the drawing basis prints once, on the cover, not on every row", (flat(kpay).match(/Concept Set C-02, 28 October 2026/g) || []).length === 1);
ok("client wording doesn't leak into the architect's brief ('your', 'you want')", !/\byour\b|\bYou want\b/i.test(flat(rpay.SCOPE_GROUPS) + flat(rpay.OVERVIEW)), flat(rpay.SCOPE_GROUPS).match(/[^"]*\byour\b[^"]*/i)?.[0]);

section("Cover, identity and revisions");
ok("the cover names the architect, the client, the drawing basis, the document and its status", kpay.META_ROWS.some((r) => r.VA === "Mara Ellison, Ellison Architecture") && kpay.META_ROWS.some((r) => r.VA === "Jordan & Mia Whitcombe")
  && kpay.META_ROWS.some((r) => r.VB === "BLB-ADB-0417-R01") && kpay.META_ROWS.some((r) => r.VB === "R01 · Issued 16 November 2026"), flat(kpay.META_ROWS));
ok("it never claims approval of a technical solution or consultant sign-off", /doesn't approve a technical solution or stand in for consultant sign-off/.test(kpay.STATUS_BODY));
ok("a later revision says which revision it replaces; a draft is marked as one", /^This revision replaces R01, issued 10 November 2026\./.test(buildArchitectBriefPayload(build("kestrel", { revision: 2, supersedes: { label: "R01", issuedDate: "2026-11-10" } }, designCoordination).fx).STATUS_BODY)
  && /^Draft/.test(buildArchitectBriefPayload(build("kestrel", { status: "Draft" }, designCoordination).fx).DOC_KICKER));
ok("sections number only what prints", [kpay.S1_NUM, kpay.S2_NUM, kpay.S3_NUM, kpay.S4_NUM, kpay.S5_NUM, kpay.S6_NUM].join() === "01,02,03,04,05,06");
ok("the documents on file sit with the project (section 1), a superseded one left out", kpay.HAS_REFS && rows(kpay, "REFS").length === 3 && rows(kpay, "REFS").some((r) => r.TEXT === "Structural advice S-01, revision 1, Corbett Structural") && !rows(kpay, "REFS").some((r) => /C-01/.test(r.TEXT))
  && buildArchitectBriefPayload(build("kestrel", {}, (p) => { designCoordination(p); p.context.drawings[2].reviewStatus = "superseded"; }).fx).REFS_LAST.every((r) => !/Structural advice/.test(r.TEXT)));
ok("status vocabulary enforced: 'Confirmed' is rejected (client intent isn't verification)", validateFixture({ ...kfx, architectBrief: { ...kab, requirements: [{ ref: "X", text: "t", status: "Confirmed" }] } }, { mode: "issue" }).ok === false);
ok("the specimens pass the pre-issue checks", ["kestrel", "ridgeline"].every((n) => { const b = n === "kestrel" ? build("kestrel", {}, designCoordination) : build("ridgeline"); return registerDocChecks("architect_brief", b.fx, { register: b.p.register, recipientName: "Mara Ellison", mode: "issue" }).errors.length === 0; }));

section("QA round 1: confirmed findings, each now a test");
{
  const mk = (more) => makeItem({ id: `ri_qa_${Math.abs(JSON.stringify(more).split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7))}`, section: "project", ...more });
  const qa = build("kestrel", { recipientName: "Mara Ellison" }, (p) => {
    designCoordination(p);
    p.context.consultants = [{ role: "architect", status: "inactive", name: "Previous Architect", company: "Old Studio" }, ...KESTREL_DESIGN_TEAM];
    p.register.items.push(
      mk({ itemKind: "action", promptKey: "W-005", category: "existing", technicalStatus: "needs_verification", description: "Possible termite damage to the rear wall plate" }),
      mk({ itemKind: "action", promptKey: "P-009", category: "notes", responsibility: "client", description: "Confirm the stair balustrade style before the next drawing issue" }),
      mk({ itemKind: "action", promptKey: "W-021", category: "electrical", responsibility: "consultant", nextAction: "Advise on switchboard capacity for the extension" }),
      mk({ itemKind: "action", promptKey: "W-002", category: "site", responsibility: "consultant", nextAction: "Confirm the BAL rating for the extension" }),
      mk({ itemKind: "requirement", promptKey: "R-015", category: "structure", responsibility: "blue_leaf", description: "Allow 3 mm tolerance for the benchtop template" }),
      mk({ itemKind: "action", promptKey: "W-008", category: "existing", responsibility: "architect", nextAction: "Detail the step at the extension junction", source: "A103 Rev C" }),
      mk({ itemKind: "requirement", promptKey: "W-020", category: "hvac", technicalStatus: "verified", technicalEvidence: { at: "2026-11-12", by: "Hills Energy Rating", ref: "Energy report E-01" }, description: "Zoned heating and cooling sized for the extension" }),
    );
  });
  const a = qa.fx.architectBrief;
  ok("an unowned technical check or risk is the design team's, Who 'To be agreed', not dropped (REC-05)", a.requests.some((r) => /termite/.test(r.text) && r.who === "To be agreed"));
  ok("a client action in its own words is a decision (REC-06)", a.decisions.some((d) => /balustrade/.test(d.text) && d.who === "Client"));
  ok("a BAL rating is the engineer's, never the energy assessor's; another discipline is named for what it is (REC-03)", a.requests.some((r) => /BAL rating/.test(r.text) && r.who === "Corbett Structural")
    && a.requests.some((r) => /switchboard/.test(r.text) && r.who === "TLI (lighting & electrical)"), flat(a.requests.map((r) => [r.text.slice(0, 30), r.who])));
  ok("a former architect on file is never named; the cover is prepared for the person it's issued to (REC-04)", a.preparedFor === "Mara Ellison, Ellison Architecture" && !flat(a).includes("Old Studio"));
  ok("an office-only note is never the client's requirement (REC-07)", !a.requirements.some((r) => /tolerance/.test(r.text)));
  ok("a record's own drawing reference prints on its request (REC-08)", a.requests.some((r) => /step at the extension junction \(A103 Rev C\)\.$/.test(r.text)));
  ok("a verified requirement says Verified, and the intro explains it (REC-13)", a.requirements.some((r) => /Zoned heating/.test(r.text) && r.status === "Verified") && /Verified: confirmed by the design team/.test(buildArchitectBriefPayload(qa.fx).REQS_INTRO));
}
ok("an unmarked requirement is explained (RID-01); Proposed and Client-approved are defined in the direction (REC-10)", /Unmarked: the client's stated requirement, not yet confirmed in writing/.test(rpay.REQS_INTRO)
  && /Proposed: a specific option put to the client, not yet decided/.test(kpay.DIR_INTRO) && /Client-approved: the client has confirmed it with us/.test(kpay.DIR_INTRO));
ok("the scope intro says only what follows: a new build has nothing that stays (RID-11)", !/what stays/.test(rpay.SCOPE_INTRO) && /what stays/.test(kpay.SCOPE_INTRO));
ok("a two-sentence cell keeps its full stops (RID-09)", rab.scope.find((g) => g.group === "Site and household").rows[0].text === "Site access is steep. Crane or plant access will need to be planned for.");
{
  const p = REGISTER_PROJECTS.kestrel(); designCoordination(p); p.context.goals.description = "You want a calm home that suits your family.";
  const fx = buildRegisterFixture("architect_brief", { lead: p.lead, context: p.context, register: p.register, projectRef: p.projectRef, ...ISSUED });
  ok("wording addressed to the client is caught before issue, as a warning (REC-12)", registerDocChecks("architect_brief", fx, { register: p.register, recipientName: "Mara Ellison", mode: "issue" }).warnings.some((w) => /addressed to the client/.test(w)));
}

section("Template (adb-1.0)");
const zip = new PizZip(fs.readFileSync(join(REPO, "public/templates", DOC_DEFS.architect_brief.templateFile)));
const docXml = zip.file("word/document.xml").asText(), hdr = zip.file("word/header1.xml")?.asText() || "", ftr = zip.file("word/footer1.xml")?.asText() || "";
ok("a real header part with the document type and project, and a footer with the identity and Page X of Y", /HDR_DOC_TYPE/.test(hdr) && /HDR_PROJECT/.test(hdr) && /FTR_IDENTITY/.test(ftr) && /NUMPAGES/.test(ftr));
ok("no forced page breaks; Lato only; no two tables touching", !/w:type="page"|pageBreakBefore/.test(docXml) && !/w:ascii="(?!Lato)[^"]+"/.test(docXml + hdr + ftr) && !/<\/w:tbl>\s*<w:tbl>/.test(docXml));
ok("every table has a repeating header row (requests, decisions, requirements, the scope and direction groups, the documents list)", (docXml.match(/<w:tblHeader\/>/g) || []).length === 6, (docXml.match(/<w:tblHeader\/>/g) || []).length);
ok("headings are Word styles (PDF outline)", (docXml.match(/<w:pStyle w:val="Heading1"\/>/g) || []).length === 6);
ok("built on the shared design system (same tokens as the client brief: blue 006C9B, ink 23313A)", /006C9B/.test(docXml) && /23313A/.test(docXml) && !/142B39/.test(docXml));

section("Rendered through LibreOffice");
const tmp = fs.mkdtempSync(join(os.tmpdir(), "adb-test-"));
const text = (pdf, page) => { try { return execFileSync("pdftotext", [...(page ? ["-f", String(page), "-l", String(page)] : []), pdf, "-"], { encoding: "utf8" }); } catch { return null; } };
const pages = (pdf) => { try { return Number(execFileSync("pdfinfo", [pdf], { encoding: "utf8" }).match(/Pages:\s+(\d+)/)[1]); } catch { return 0; } };
for (const [name, fx] of [["Kestrel Court", kfx], ["Ridgeline Drive", rfx]]) {
  const out = await renderRegisterDocument("architect_brief", fx, {});
  const pdf = join(tmp, `${name}.pdf`); fs.writeFileSync(pdf, out.pdf);
  const n = pages(pdf);
  if (text(pdf) === null) { ok("poppler tools available", false); break; }
  ok(`${name}: 2 to 5 pages, no leaks, Lato only`, n >= 2 && n <= 5 && out.leaks.length === 0 && out.fonts.every((f) => /^Lato-/.test(f)), `pages ${n} leaks ${out.leaks} fonts ${out.fonts}`);
  ok(`${name}: every page carries the header and Page n of N, and the identity`, Array.from({ length: n }, (_, i) => i + 1).every((k) => /ARCHITECT DESIGN BRIEF/.test(text(pdf, k)) && new RegExp(`Page ${k} of ${n}`).test(text(pdf, k)) && /BLB-ADB-0\d{3}-R01/.test(text(pdf, k))));
  const lastLines = text(pdf, n).split("\n").filter((l) => l.trim()).length;
  ok(`${name}: no near-empty last page (at least 25 lines on it)`, lastLines >= 25, `${lastLines} lines`);
}

console.log(`\ndocuments-adb: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
