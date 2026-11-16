/**
 * documents-selections.test.mjs — the Technical Selections Schedule and the Client Selections Presentation
 * (docs/documents/SELECTIONS_SPEC.md): one register, two documents. No database; LibreOffice not needed.
 *
 *   node scripts/tests/documents-selections.test.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import PizZip from "pizzip";
import { makeItem, makeRoom, emptyMeta } from "../../src/lib/register.js";
import { buildRegisterFixture, registerDocChecks, selectionRecords, REGISTER_DOC_TYPES, TRADE_GROUPS } from "../../server/lib/registerDocuments.mjs";
import { DOC_DEFS, SELECTION_STATE_WORDS, buildSelectionsSchedulePayload, buildClientPresentationPayload } from "../../server/lib/documents/documentPayloads.mjs";
import { documentIdentity } from "../../server/lib/documents/documentIdentity.mjs";
import { renderDocxTemplate } from "../../server/lib/docTemplates.mjs";
import { REGISTER_PROJECTS, designCoordination, kestrelSupplierEvidence, ridgelineTender } from "../documents/fixtures/register-projects.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 600)}` : ""}`); } };
const section = (t) => console.log(`\n${t}`);
const flat = (o) => JSON.stringify(o);
const strings = (o, out = []) => { if (typeof o === "string") out.push(o); else if (Array.isArray(o)) o.forEach((x) => strings(x, out)); else if (o && typeof o === "object") Object.values(o).forEach((x) => strings(x, out)); return out; };
const input = (p, more = {}) => ({ lead: p.lead, context: p.context, register: p.register, projectRef: p.projectRef, revision: 1, status: "Issued", issuedDate: "2026-11-16", issuer: "Staff", recipientName: "Recipient", ...more });
const checks = (docType, p, opts) => registerDocChecks(docType, buildRegisterFixture(docType, input(p), opts), { register: p.register, recipientName: "Recipient", mode: "issue" });

const kestrel = () => kestrelSupplierEvidence(designCoordination(REGISTER_PROJECTS.kestrel()));
const kestrelRelinked = () => { const p = kestrel(); const i = p.register.items.find((x) => x.sourceDocId === "doc_kc_c01"); Object.assign(i, { sourceDocId: "doc_kc_c02", source: "Concept Set C-02" }); return p; };
const ridge = () => ridgelineTender(REGISTER_PROJECTS.ridgeline());

section("Two documents, one register (spec S1, S2)");
{
  const p = ridge();
  const tss = buildRegisterFixture("selections_schedule", input(p)), csp = buildRegisterFixture("client_presentation", input(p));
  ok("both documents read the same selection records", flat(tss.selections) === flat(csp.selections) && tss.selections.length > 20);
  ok("each is its own document type, with its own code", REGISTER_DOC_TYPES.selections_schedule.def === "selections_schedule" && REGISTER_DOC_TYPES.client_presentation.def === "client_presentation"
    && documentIdentity({ type: "selections_schedule", projectRef: "0631", status: "Issued", revision: 1 }).number === "BLB-TSS-0631-R01"
    && documentIdentity({ type: "client_presentation", projectRef: "0631", status: "Issued", revision: 1 }).number === "BLB-CSP-0631-R01");
  ok("the schedule is for consultants and trades, the presentation for the client", REGISTER_DOC_TYPES.selections_schedule.audience === "consultant" && REGISTER_DOC_TYPES.client_presentation.audience === "client");
  ok("every record's status is one the documents define", tss.selections.every((r) => SELECTION_STATE_WORDS.includes(r.selection)), flat(tss.selections.map((r) => r.selection)));
  const both = [...tss.selections, ...buildRegisterFixture("selections_schedule", input(kestrelRelinked())).selections];
  ok("known, provisional and unresolved are all derived (across the two specimens)", ["known", "provisional", "unresolved"].every((k) => both.some((r) => r.knowledge === k)), flat(tss.technicalSchedule.knowledge));
}

section("Technical Selections Schedule (spec §3)");
{
  const p = ridge();
  const fx = buildRegisterFixture("selections_schedule", input(p)), t = fx.technicalSchedule;
  const order = [...TRADE_GROUPS.map(([g]) => g), "Other selections"];
  ok("grouped by trade, in the schedule's order", t.groups.every((g, k) => k === 0 || order.indexOf(g.group) > order.indexOf(t.groups[k - 1].group)), flat(t.groups.map((g) => g.group)));
  const rows = t.groups.flatMap((g) => g.rows);
  ok("no system terms: no TBC, Whole house, (project default) or (room exception)", !/\bTBC\b|Whole house|project default|room exception/i.test(flat(t)), flat(t).match(/.{40}(TBC|Whole house|project default|room exception).{40}/i)?.[0]);
  ok("a house-wide row has a blank location (said once, in the reading note)", rows.some((r) => r.item === "Paint & ceiling direction" && r.location === ""));
  ok("rooms with identical records share a row, keeping every reference", rows.some((r) => r.location === "Ensuite and bathroom" && r.item === "Vanity" && r.ref.split(", ").length === 2), flat(rows.filter((r) => r.item === "Vanity")));
  // The shower system is identical in both rooms, so it prints once for "Ensuite and bathroom".
  const ensuiteTaps = rows.filter((r) => r.item === "Tapware & accessories" && /^Ensuite/.test(r.location));
  ok("one record per product: the ensuite's tapware is three products, each with its own code", ensuiteTaps.length === 3 && ensuiteTaps.every((r) => /\b\d{5}\b/.test(r.detail))
    && ensuiteTaps.some((r) => r.location === "Ensuite and bathroom" && /Glide/.test(r.product)), flat(ensuiteTaps));
  ok("manufacturer, supplier and code on the product's second line", rows.some((r) => r.detail === "Caroma · Routleys · 57525 · supply: blue leaf"), flat(rows.map((r) => r.detail)));
  ok("a supplier's count prints as it was recorded; nothing prints as 0", rows.some((r) => r.item === "Basin" && r.quantity === "2") && !rows.some((r) => /^0\b/.test(r.quantity)));
  ok("the source is a key, listed once in the source documents", rows.some((r) => r.source === "S1") && t.sources.length === 1 && t.sources[0].key === "S1" && /Routleys 452499/.test(t.sources[0].document) && /No revision printed/.test(t.sources[0].revision));
  ok("the requirements these selections must meet are listed, with their status", t.requirements.some((r) => /Double glazing/.test(r.text) && r.applies === "Windows and doors" && /To verify/.test(r.status)));
  ok("open actions carry their owner, and nothing repeats a product", t.actions.some((a) => /trough's finish|sink's finish/.test(a.text) && a.who === "Blue Leaf") && t.actions.some((a) => /back-to-wall toilet/.test(a.text) && a.who === "Client"));
  ok("the client's own words show under a product proposed in their place", rows.some((r) => r.item === "Toilet" && r.direction === "Wall-hung toilet"));
  ok("a preference with nothing recorded reads To be decided, so blank only ever means a recorded preference",
    selectionRecords({ meta: emptyMeta({ rooms: [] }), items: [makeItem({ id: "x1", itemKind: "selection", category: "paint", promptKey: "W-019", certainty: "preference" })] }, {})[0].selection === "To be decided");
  const k = buildRegisterFixture("selections_schedule", input(kestrelRelinked()));
  const kRows = k.technicalSchedule.groups.flatMap((g) => g.rows);
  ok("an exception says what it replaces only when that default applies (ADB-01): the bedroom carpet reads just 'Wool carpet'", kRows.some((r) => r.product === "Wool carpet" && r.location === "Main bedroom" && !r.replaces));
  ok("a TLI fitting added by hand reaches Lighting and electrical through the cited document's discipline", k.technicalSchedule.groups.some((g) => g.group === "Lighting and electrical" && g.rows.some((r) => r.item === "Downlights" && r.quantity === "46 EA")));
  ok("a fitting tied to no room says so, never 'throughout the house'", kRows.some((r) => r.item === "Downlights" && r.location === "No room recorded"));
  ok("an unreviewed source is flagged on the row", kRows.some((r) => r.sourceFlag === "Source not yet reviewed" && /S\d/.test(r.source)));
  ok("the TLI 'TBC by designer' pendants are To be decided, not Not yet discussed", kRows.some((r) => r.item === "Entry pendants" && r.selection === "To be decided"));
  const pay = buildSelectionsSchedulePayload(k);
  ok("the summary prints known, provisional and unresolved, each defined once", /Known: \d+ \(client-approved or existing/.test(pay.SUMMARY) && /Provisional: \d+/.test(pay.SUMMARY) && /Unresolved: \d+/.test(pay.SUMMARY), pay.SUMMARY);
  ok("the reading note defines each printed status once", (pay.READ_INTRO.match(/Proposed:/g) || []).length === 1 && /To verify:/.test(pay.READ_INTRO) && /A row with no location applies throughout the house/.test(pay.READ_INTRO));
  ok("the status note follows the issue state and adopts no supplier content", /^Issued for coordination$/.test(pay.STATUS_LABEL) && /citing it isn't acceptance/.test(pay.STATUS_BODY) && !/pricing/.test(pay.STATUS_LABEL));
  const draft = buildSelectionsSchedulePayload(buildRegisterFixture("selections_schedule", input(kestrelRelinked(), { status: "Draft" })));
  ok("a draft says so", /^Draft for coordination/.test(draft.STATUS_LABEL) && /^Draft/.test(draft.DOC_KICKER));
  ok("a second line never opens an empty cell", pay.SEL_GROUPS.every((g) => ["ROWS_KEEP", "ROWS", "ROWS_PEN", "ROWS_LAST"].every((key) => (g[key] || []).every((r) => !(r.STATUS === "" && r.TECH) && !(r.SOURCE === "" && r.FLAG)))));
}

section("Client Selections Presentation (spec §4)");
{
  const p = ridge();
  const fx = buildRegisterFixture("client_presentation", input(p)), c = fx.clientSelections;
  const pay = buildClientPresentationPayload(fx);
  const printed = strings(pay).join(" | ");
  const recs = fx.selections;
  const codes = [...new Set(recs.flatMap((r) => [r.ref, r.model, r.sourceDocNumber]).filter((x) => x && x.length >= 3))];
  ok("no register reference, product code or supplier document number prints", !codes.some((x) => printed.includes(x)), codes.filter((x) => printed.includes(x)).join(", "));
  ok("no technical state, source, quantity or system term prints", !/To verify|Verified|Source not|\bS1\b|Whole house|project default|room exception|\bTBC\b| EA\b/.test(printed), printed.match(/.{30}(To verify|Verified|Source not|Whole house|TBC).{30}/)?.[0]);
  ok("throughout the house first, then each room", c.groups[0].group === "Throughout the house" && c.groups.some((g) => g.group === "Ensuite and bathroom"));
  ok("a preference shows the client's words, never a product typed on it", (() => {
    const q = REGISTER_PROJECTS.ridgeline(); const i = q.register.items.find((x) => x.description === "Handmade-look tile splashback"); i.product = "Supplier tile 12345";
    const f = buildRegisterFixture("client_presentation", input(q)); return flat(f.clientSelections).includes("Handmade-look tile splashback") && !flat(f.clientSelections).includes("Supplier tile 12345");
  })());
  ok("a proposal that replaces what they asked for shows both, when it's been raised with them", c.groups.some((g) => g.rows.some((r) => r.status === "Proposed" && /Acero\+/.test(r.text) && /undermount sink with a matte black mixer/i.test(r.earlier))));
  ok("a staff label is never shown as the client's earlier words", !c.groups.some((g) => g.rows.some((r) => /Ensuite window|External door/.test(r.earlier || ""))));
  ok("what we need from you: the client's own actions, never a row per proposal", c.needs.length > 0 && c.needs.every((n) => !/^Let us know whether the proposed/.test(n.text)) && c.proposals > 0 && /marked Proposed/.test(pay.NEEDS_INTRO), flat(c.needs));
  ok("the status note makes no process promise", /isn't a contract document, a price or a technical approval/.test(pay.STATUS_BODY) && !/before it is ordered|confirm every product|the trades/.test(pay.STATUS_BODY));
  // Portal states (critique): a choice the client made, or a change they asked for, is never asked again.
  const q = ridge();
  const sink = q.register.items.find((x) => x.product && /Luxe LF/.test(x.product));
  sink.sync = { mode: "project", status: "in_review", clientVisible: true };
  const basin = q.register.items.find((x) => x.id === "ri_rd_s04");
  basin.sync = { mode: "project", status: "changes_requested", clientVisible: true };
  const f2 = buildRegisterFixture("client_presentation", input(q));
  const rows2 = f2.clientSelections.groups.flatMap((g) => g.rows);
  ok("a portal choice reads Client's choice, with Blue Leaf; a requested change reads so too", rows2.some((r) => /Luxe LF/.test(r.text) && r.status === "Client's choice, with Blue Leaf") && rows2.some((r) => r.status === "Change requested, with Blue Leaf"));
  ok("…and neither is counted as a proposal awaiting their answer", f2.clientSelections.proposals === c.proposals - 2, `${f2.clientSelections.proposals} vs ${c.proposals}`);
  const unreleased = ridge(); unreleased.register.items.find((x) => /back-to-wall/.test(x.product || "")).sync = { mode: "project", status: "not_started", clientVisible: false };
  ok("an item not yet released on the portal is never asked about", !buildRegisterFixture("client_presentation", input(unreleased)).clientSelections.needs.some((n) => /back-to-wall/.test(n.text)));
  // A legacy schedule row: "item — Supplier: X — notes" (readRegister). Only its item reaches the client.
  const leg = REGISTER_PROJECTS.powder();
  leg.register.items.push(makeItem({ id: "ri_legacy_x", itemKind: "selection", category: "notes", certainty: "preference", description: "Mirror cabinet — Supplier: Acme Bath — staff: chase price", supplier: "Acme Bath", updatedAt: "1970-01-01T00:00:00.000Z" }));
  const lf = flat(buildRegisterFixture("client_presentation", input(leg)).clientSelections);
  ok("a legacy row prints only its item, never its supplier or notes", lf.includes("Mirror cabinet") && !/Acme|chase price/.test(lf));
}

section("Pre-issue checks (spec §5)");
{
  const draft = kestrel();   // the cabinetry still cites the superseded concept set
  ok("a superseded source blocks the schedule", checks("selections_schedule", draft).errors.some((e) => /superseded/.test(e)));
  ok("…and the presentation", checks("client_presentation", draft).errors.some((e) => /superseded/.test(e)));
  ok("relinked, both can be issued", checks("selections_schedule", kestrelRelinked()).errors.length === 0 && checks("client_presentation", kestrelRelinked()).errors.length === 0,
    flat([checks("selections_schedule", kestrelRelinked()).errors, checks("client_presentation", kestrelRelinked()).errors]));
  ok("an unreviewed source warns", checks("selections_schedule", kestrelRelinked()).warnings.some((w) => /still marked received or under review/.test(w)));
  const gone = kestrelRelinked(); gone.register.items.find((x) => x.id === "ri_kc_s02").sourceDocId = "doc_deleted";
  ok("a source no longer on file blocks issue", checks("selections_schedule", gone).errors.some((e) => /no longer on file/.test(e)));
  const ver = kestrelRelinked(); Object.assign(ver.register.items.find((x) => x.id === "ri_kc_s02"), { technicalStatus: "verified", technicalEvidence: { at: "2026-11-16", by: "Blue Leaf review", ref: "Rylock RM-6403 Ver 1" } });
  ok("verified against a document nobody has reviewed blocks issue", checks("selections_schedule", ver).errors.some((e) => /marked verified against .* which hasn't been reviewed/.test(e)));
  const board = ridge(); const b = board.register.items.find((x) => x.description === "Granite benchtops with a 40 mm edge");
  Object.assign(b, { evidence: { at: "2026-11-16", by: "Portal board", method: "board" }, sync: { mode: "project", status: "approved", approvedOnBoard: true, clientVisible: true } });
  const bfx = buildRegisterFixture("selections_schedule", input(board));
  ok("an approval held only as the portal board's status prints as Proposed and blocks issue (SFS-15)",
    bfx.selections.find((r) => r.product === "Granite benchtops with a 40 mm edge")?.selection === "Proposed" && checks("selections_schedule", board).errors.some((e) => /approved on the portal board with no recorded evidence/.test(e)));
  const zero = ridge(); zero.register.items.find((x) => x.id === "ri_rd_s04").quantity = 0;
  ok("a quantity of 0 prints blank and warns", buildRegisterFixture("selections_schedule", input(zero)).selections.find((r) => r.id === "ri_rd_s04").quantity === "" && checks("selections_schedule", zero).warnings.some((w) => /quantity of 0/.test(w)));
  const leak = ridge(); leak.register.items.find((x) => /back-to-wall/.test(x.product || "")).nextAction = "Confirm Routleys code 57525 for the ensuite toilet";
  ok("the presentation refuses to print a product code in staff wording", checks("client_presentation", leak).errors.some((e) => /shouldn't see \(.*57525/.test(e)));
  const pref = REGISTER_PROJECTS.ridgeline(); Object.assign(pref.register.items.find((x) => x.description === "Handmade-look tile splashback"), { description: "", product: "Supplier tile" });
  ok("a preference with only a product warns on the presentation", checks("client_presentation", pref).warnings.some((w) => /a preference with only a product recorded/.test(w)));
  ok("separate approved products for one item don't raise the duplicate warning", !checks("selections_schedule", ridge()).warnings.some((w) => /client-approved records for/.test(w)));
  const dup = REGISTER_PROJECTS.ridgeline();
  dup.register.items.push(makeItem({ ...dup.register.items.find((x) => x.description === "Granite benchtops with a 40 mm edge"), id: "ri_dup", description: "Porcelain benchtops" }));
  ok("two approved records with no code for one item warn", checks("selections_schedule", dup).warnings.some((w) => /2 client-approved records for "Benchtop"/.test(w)));
}

section("Coordination packs (spec §3.4)");
{
  const r = buildRegisterFixture("selections_schedule", input(ridge(), { status: "Draft" }), { coord: "routleys" });
  ok("the Routleys pack holds the Routleys records and names its party", r.selections.length >= 10 && r.selections.every((x) => x.coord === "routleys" || /Routleys/.test(x.supplier)) && /Routleys/.test(buildSelectionsSchedulePayload(r).DOC_KICKER));
  const w = buildRegisterFixture("selections_schedule", input(kestrelRelinked(), { status: "Draft" }), { coord: "windows" });
  ok("the windows pack holds the Rylock openings through the cited document's discipline", w.selections.some((x) => /Chainwinder awning/.test(x.product)) && w.technicalSchedule.actions.some((a) => /U-value/.test(a.text)));
  const tli = buildRegisterFixture("selections_schedule", input(kestrelRelinked(), { status: "Draft" }), { coord: "tli" });
  ok("the TLI pack holds the TLI fittings", tli.selections.some((x) => x.item === "Downlights") && !tli.selections.some((x) => /Chainwinder/.test(x.product)));
}

section("Templates (design system)");
{
  for (const [type, p] of [["selections_schedule", kestrelRelinked()], ["client_presentation", ridge()]]) {
    const def = DOC_DEFS[type];
    const docx = renderDocxTemplate(fs.readFileSync(path.join(REPO, "public/templates", def.templateFile)), def.build(buildRegisterFixture(type, input(p))));
    const zip = new PizZip(docx);
    const xml = zip.file("word/document.xml").asText();
    const text = xml.replace(/<[^>]+>/g, " ");
    ok(`${type}: renders with no leftover tag, a real header and footer`, !/\{[#/^]?[A-Z][A-Z0-9_]+\}/.test(text) && Object.keys(zip.files).some((n) => /header\d*\.xml$/.test(n)) && Object.keys(zip.files).some((n) => /footer\d*\.xml$/.test(n)));
    ok(`${type}: ${type === "selections_schedule" ? "A4 landscape" : "A4 portrait"}`, type === "selections_schedule" ? /w:orient="landscape"/.test(xml) : !/w:orient="landscape"/.test(xml));
    ok(`${type}: Lato only, every table header repeats`, !/w:ascii="(?!Lato)[^"]+"/.test(xml) && (xml.match(/<w:tblHeader\/>/g) || []).length >= 2);
  }
}

console.log(`\ndocuments-selections: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
