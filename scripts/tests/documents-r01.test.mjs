// documents-r01.test.mjs — Document Engine Proof acceptance tests (no DB, no network).
// Run: node scripts/tests/documents-r01.test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderDocxTemplate } from "../../server/lib/docTemplates.mjs";
import {
  buildClientBriefPayload, buildArchitectBriefPayload, buildSelectionsSchedulePayload, buildClientPresentationPayload,
  validateFixture, SELECTION_STATUSES, ARCHITECT_ITEM_STATUSES, DOC_DEFS, PRESENTATION_PENDING_LABEL,
} from "../../server/lib/documents/documentPayloads.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../..");
const reno = JSON.parse(fs.readFileSync(path.join(__dirname, "../documents/fixtures/reno-extension.json"), "utf8"));
const long = JSON.parse(fs.readFileSync(path.join(__dirname, "../documents/fixtures/long-newbuild.json"), "utf8"));
const short = JSON.parse(fs.readFileSync(path.join(__dirname, "../documents/fixtures/short-powderroom.json"), "utf8"));
const issuedReno = { ...reno, meta: { ...reno.meta, status: "Issued", issuedDate: "2026-11-06" } };

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

// 1. Client Project Brief (cpb-2.0): lists map 1:1 (no loss), priorities choose the right card band, sections number
//    themselves in reading order, and the page identity is BLB-CPB-[ref]-[rev] (doc suite R01).
const cb = buildClientBriefPayload(reno);
const cbDraft = buildClientBriefPayload({ ...reno, meta: { ...reno.meta, status: "Draft" } });
const cbIssued = buildClientBriefPayload(issuedReno);
ok("T1 client brief: scope, boundaries, preferences, decisions and priorities map 1:1; sections number in order",
  cb.SCOPE_IN.length === reno.clientBrief.scopeIn.length && cb.BOUNDARIES[0].B_ITEMS.length === reno.clientBrief.boundaries[0].items.length &&
  cb.OVERVIEW.length === reno.clientBrief.overview.length && cb.PREF_GROUPS.reduce((n, g) => n + g.ROWS_KEEP.length + g.ROWS.length + g.ROWS_PEN.length + g.ROWS_LAST.length, 0) === reno.clientBrief.preferences.reduce((n, g) => n + g.items.length, 0) &&
  cb.PRI_BAND_3 === true && cb.PRI_BAND_2 === false && cb.PL1 === reno.clientBrief.priorities[0] &&
  [...cb.DECISIONS_KEEP, ...cb.DECISIONS, ...cb.DECISIONS_PEN, ...cb.DECISIONS_LAST].length === reno.clientBrief.decisions.length && [...cb.DECISIONS_KEEP, ...cb.DECISIONS, ...cb.DECISIONS_PEN, ...cb.DECISIONS_LAST].every((q) => q.REF && q.ACTION && q.OWNER) &&
  [cb.S1_NUM, cb.S2_NUM, cb.S3_NUM, cb.S4_NUM, cb.S5_NUM, cb.S6_NUM].join() === "01,02,03,04,05,06");
ok("T1b identity: a draft has no revision and says so; an issued copy prints BLB-CPB-ref-R0n and its date",
  /^BLB-CPB-0417\s+·\s+Draft — not issued$/.test(cbDraft.FTR_IDENTITY) && !/R0\d/.test(cbDraft.FTR_IDENTITY) && /^Draft/.test(cbDraft.DOC_KICKER) &&
  /^BLB-CPB-0417-R0\d\s+·\s+Issued 6 November 2026$/.test(cbIssued.FTR_IDENTITY) && cbIssued.META_ROWS.some((r) => r.VA === `BLB-CPB-0417-R0${reno.meta.revision}` || r.VB === `BLB-CPB-0417-R0${reno.meta.revision}`));

// 2. Architect brief (adb-1.0 on the shared design system; the full checks are in documents-adb.test.mjs): the payload
//    builds from a fixture, carries its identity, and a section with nothing in it doesn't print.
const ab = buildArchitectBriefPayload(reno);
ok("T2 architect brief: identity and cover from the fixture; empty sections don't print",
  ab.DOC_TITLE === "Design brief" && /^BLB-ADB-0417/.test(ab.FTR_IDENTITY) && ab.META_ROWS.length === 4 && ab.HAS_S2 === false && ab.HAS_S5 === false
  && ARCHITECT_ITEM_STATUSES.includes("Client-approved") && ARCHITECT_ITEM_STATUSES.includes("To verify"));

// 3. Selections payload is grouped (not a flat list), group-ordered, 22 items total.
const ss = buildSelectionsSchedulePayload(long);
const order = ["External", "Internal Finishes", "Joinery", "Wet Areas", "Services & Fixtures", "External Works"];
const grpOk = ss.GROUPS.every((g, i) => i === 0 || order.indexOf(g.GROUP_NAME) >= order.indexOf(ss.GROUPS[i - 1].GROUP_NAME));
const total = ss.GROUPS.reduce((n, g) => n + g.ITEMS.length, 0);
ok("T3 selections: grouped + group-ordered; 22 items total; blank qty defaults to em dash",
  ss.GROUPS.length === 6 && grpOk && total === 22 && ss.GROUPS.every((g) => g.ITEMS.every((r) => r.QTY && r.STATUS)));

// 4. A properly ISSUED document with a logo validates in issue mode.
ok("T4 validation: an Issued fixture (logo present) passes issue mode", validateFixture(issuedReno, { mode: "issue", logoPresent: true }).ok === true);

// 5. A Draft/specimen is NOT issue-ready (issue control), but still renders in draft mode.
const draftCheck = validateFixture(reno, { mode: "issue" });
ok("T5 issue control: a Draft/specimen is blocked from issue but valid as a draft",
  draftCheck.ok === false && draftCheck.errors.some((e) => /not marked "Issued"/.test(e)) && validateFixture(reno, { mode: "draft" }).ok === true);

// 6. Missing client name blocks issue.
const noClient = JSON.parse(JSON.stringify(issuedReno)); noClient.project.clientName = "";
ok("T6 validation: missing client name blocks issue", validateFixture(noClient, { mode: "issue" }).ok === false);

// 7. Placeholder / TODO text blocks issue (and warns in draft); a fabricated $0 blocks issue.
const placeholder = JSON.parse(JSON.stringify(issuedReno)); placeholder.clientBrief.overview[0] = "TODO: real summary {{CLIENT}}";
const zeroMoney = JSON.parse(JSON.stringify(issuedReno)); zeroMoney.clientBrief.overview.push("Fixed price is $0.00 for the whole build");
ok("T7 validation: placeholder text & $0 money both block issue",
  validateFixture(placeholder, { mode: "issue" }).ok === false && validateFixture(placeholder, { mode: "draft" }).ok === true &&
  validateFixture(zeroMoney, { mode: "issue" }).ok === false);

// 8. Status vocabularies enforced: unknown selection status blocks; non-decision states allowed; architect status vocabulary enforced.
const badSel = JSON.parse(JSON.stringify(issuedReno)); badSel.selections = [{ group: "External", itemId: "X", category: "c", product: "p", finish: "f", status: "Maybe-ish", responsibility: "BLB" }];
const badArch = JSON.parse(JSON.stringify(issuedReno)); badArch.architectBrief.requirements = [{ ref: "W015-TU4", text: "Good daylight", status: "Confirmed" }];
ok("T8 validation: unknown selection status blocks; special states allowed; architect 'Confirmed' rejected (intent≠verification)",
  validateFixture(badSel, { mode: "issue" }).ok === false &&
  ["By Others", "N/A", "Excluded", "Existing to Remain", "Undecided"].every((s) => SELECTION_STATUSES.includes(s)) &&
  validateFixture(badArch, { mode: "issue" }).ok === false);

// 9. Missing approved logo blocks issue (Tab 17 identity blocker).
ok("T9 issue control: missing logo blocks issue", validateFixture(issuedReno, { mode: "issue", logoPresent: false }).ok === false);

// 10. Rendering is DETERMINISTIC — same (template, payload) → byte-identical output (immutable-issue reproducibility).
const tpl = fs.readFileSync(path.join(REPO, "public/templates", DOC_DEFS.client_brief.templateFile));
const r1 = renderDocxTemplate(tpl, buildClientBriefPayload(reno));
const r2 = renderDocxTemplate(tpl, buildClientBriefPayload(reno));
ok("T10 render is deterministic (issued-snapshot reproducibility)", Buffer.compare(r1, r2) === 0 && r1.length > 5000);

// 11. Client Selections Presentation (editorial): built from the SAME selections, grouped into client
//     areas, with a decisions list; palette tiles are data-driven and gracefully absent when unprovided.
const cp = buildClientPresentationPayload(long);
const cpItems = cp.AREAS.flatMap((a) => a.ITEMS);
const cpShort = buildClientPresentationPayload(short); // no clientPresentation block in fixture
ok("T11 client presentation: same selections regrouped into client areas; decisions filtered; palette optional",
  cp.AREAS.length >= 3 && cpItems.length === long.selections.length && cp.AREAS.every((a, i) => a.AREA_NUM === String(i + 1).padStart(2, "0")) &&
  cp.HAS_PALETTE.length === 1 && cp.TILE1_AREA === "Exterior" && cp.DECISIONS.every((d) => d.REF_ID && d.ITEM && [PRESENTATION_PENDING_LABEL, "Hold", "Design", "Undecided", "Preliminary"].includes(d.STATUS)) &&
  cpShort.HAS_PALETTE.length === 0 && cpShort.AREAS.length >= 1);

// 12. Deliberate pagination flags (no fabricated geometry — just content-size signals the template reads).
const cbReno = buildClientBriefPayload(reno), cbShort = buildClientBriefPayload(short);
const cpbXml = new (await import("pizzip")).default(fs.readFileSync(path.join(REPO, "public/templates", DOC_DEFS.client_brief.templateFile))).file("word/document.xml").asText();
const adbXml = new (await import("pizzip")).default(fs.readFileSync(path.join(REPO, "public/templates", DOC_DEFS.architect_brief.templateFile))).file("word/document.xml").asText();
ok("T12 pagination: the client brief and the architect brief flow (no forced breaks) and hide empty sections",
  !/w:type="page"|pageBreakBefore/.test(adbXml) &&
  !/w:type="page"|pageBreakBefore/.test(cpbXml) && cbReno.HAS_STEPS === true && cbShort.HAS_STEPS === false &&
  cbShort.NOTED.at(-1).N_LABEL === "This brief assumes" && cbShort.HAS_S5 === (short.clientBrief.decisions.length > 0) &&
  buildClientBriefPayload({ ...short, clientBrief: { ...short.clientBrief, decisions: [], preferences: [] } }).HAS_S5 === false);

// 13. All FIVE templates (four client and consultant, one internal: R05 P5) render from one fixture via the canonical engine (no second engine, no image module).
let rendered = 0;
for (const def of Object.values(DOC_DEFS)) {
  const tpl = fs.readFileSync(path.join(REPO, "public/templates", def.templateFile));
  const out = renderDocxTemplate(tpl, def.build(reno));
  if (out && out.length > 5000) rendered++;
}
ok("T13 all five documents render through the existing renderDocxTemplate", rendered === 5 && Object.keys(DOC_DEFS).length === 5);

// 14. Footer page numbers keep the footer style under LibreOffice (Tab 26 R05 retest): each PAGE/NUMPAGES
//     field is four runs (begin · instruction · separate · end), every one 7.5pt grey like the "PAGE" label.
{
  const PizZip = (await import("pizzip")).default;
  const { splitFooterFields } = await import("../documents/fix-footer-page-fields.mjs");
  let good = 0;
  for (const def of Object.values(DOC_DEFS)) {
    const zip = new PizZip(fs.readFileSync(path.join(REPO, "public/templates", def.templateFile)));
    const xml = Object.keys(zip.files).filter((n) => /^word\/footer\d*\.xml$/.test(n)).map((n) => zip.file(n).asText()).join("");
    const runs = xml.match(/<w:r>(?:(?!<\/w:r>).)*<\/w:r>/g) || [];
    const fieldRuns = runs.filter((r) => /<w:fldChar|<w:instrText/.test(r));
    const oneRunField = runs.some((r) => /fldCharType="begin"/.test(r) && /fldCharType="end"/.test(r));
    // Every field run carries an explicit size and colour, the same across all eight (the footer's own style).
    const sz = (r) => r.match(/<w:sz w:val="(\d+)"\/>/)?.[1], col = (r) => r.match(/<w:color w:val="([0-9A-F]{6})"\/>/)?.[1];
    const styled = fieldRuns.length === 8 && fieldRuns.every((r) => sz(r) && col(r) && sz(r) === sz(fieldRuns[0]) && col(r) === col(fieldRuns[0]));
    const once = (xml.match(/<w:instrText[^>]*>\s*PAGE\s*</g) || []).length === 1 && (xml.match(/<w:instrText[^>]*>\s*NUMPAGES\s*</g) || []).length === 1;
    if (!oneRunField && styled && once && splitFooterFields(xml).count === 0) good += 1;
    else console.log(`    ${def.templateFile}: oneRunField=${oneRunField} styled=${styled} once=${once}`);
  }
  const sample = '<w:r><w:rPr><w:sz w:val="15"/></w:rPr><w:fldChar w:fldCharType="begin"/><w:instrText xml:space="preserve">PAGE</w:instrText><w:fldChar w:fldCharType="separate"/><w:fldChar w:fldCharType="end"/></w:r>';
  const fixed = splitFooterFields(sample);
  ok("T14 footer page numbers are split, styled fields in all five templates (and the fixer is idempotent)",
    good === 5 && fixed.count === 1 && (fixed.xml.match(/<w:r>/g) || []).length === 4 && splitFooterFields(fixed.xml).count === 0);
}

// 15. The client presentation never prints "TBC": an undecided row says "Still to be decided" once, its item is the
//     heading, and an unknown supplier leaves no dangling separator. The technical register keeps TBC (Tab 27 line 21).
{
  const tbcRow = { group: "Internal Finishes", itemId: "R005-1", category: "Bed 1 — Floor finish", where: "Bed 1", item: "Floor finish", product: "TBC", finish: "TBC", qty: "—", status: "TBC", responsibility: "TBC" };
  const prefRow = { ...tbcRow, itemId: "R006-1", item: "Wall paint", category: "Bed 1 — Wall paint", finish: "Warm white", status: "Preferred" };
  const namedRow = { ...tbcRow, itemId: "K005-1", group: "Joinery", item: "Benchtop", category: "Kitchen — Benchtop", where: "Kitchen", product: "Engineered stone", finish: "20 mm", status: "Proposed", responsibility: "Client · Routleys" };
  const pfx = { ...reno, selections: [tbcRow, prefRow, namedRow] };
  const pp = buildClientPresentationPayload(pfx);
  const its = pp.AREAS.flatMap((a) => a.ITEMS);
  const row = (id) => its.find((x) => x.REF_ID === id);
  const words = JSON.stringify({ AREAS: pp.AREAS, DECISIONS: pp.DECISIONS });
  const tbc = row("R005-1"), pref = row("R006-1"), named = row("K005-1");
  const tech = buildSelectionsSchedulePayload(pfx);
  ok("T15 client presentation: one 'Still to be decided' per undecided row, no TBC, no dangling separator; technical register keeps TBC",
    !/"TBC"/.test(words) &&
    tbc.STATUS === PRESENTATION_PENDING_LABEL && tbc.NAME === "Floor finish" && tbc.CAT === "Bed 1" && tbc.DESC === "" && tbc.SOURCE === "" && tbc.SEP === "" &&
    (JSON.stringify(tbc).match(new RegExp(PRESENTATION_PENDING_LABEL, "g")) || []).length === 1 &&
    pref.STATUS === "Preferred" && pref.NAME === "Wall paint" && pref.DESC === "Warm white" &&
    named.NAME === "Engineered stone" && named.CAT === "Kitchen — Benchtop" && named.SEP === "   /   " && named.SOURCE === "Client · Routleys" &&
    pp.DECISIONS.find((d) => d.REF_ID === "R005-1")?.OWNER === "—" && pp.DECISIONS.find((d) => d.REF_ID === "R005-1")?.STATUS === PRESENTATION_PENDING_LABEL &&
    /TBC/.test(JSON.stringify(tech)) &&
    /Still to be decided means/.test(pp.READ_BODY));
  const tpl = fs.readFileSync(path.join(REPO, "public/templates", DOC_DEFS.client_presentation.templateFile));
  const PizZip = (await import("pizzip")).default;
  const out = new PizZip(renderDocxTemplate(tpl, pp)).file("word/document.xml").asText().replace(/<[^>]+>/g, "");
  ok("T15b it renders: no TBC, no leftover tag, the separator only where there's a supplier",
    !/\bTBC\b/.test(out) && !/\{[#/]?[A-Z_]{2,}\}/.test(out) && (out.match(/ {3}\/ {3}/g) || []).length === 1 + (pp.SUBLINE.match(/ {3}\/ {3}/g) || []).length && out.includes("Still to be decided"));
}

console.log(`\nR01–R04 document tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
