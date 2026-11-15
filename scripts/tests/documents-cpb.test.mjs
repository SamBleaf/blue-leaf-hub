/**
 * documents-cpb.test.mjs — Client Project Brief (BLB-CPB, template cpb-2.1), doc suite checkpoint 2.
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
import { buildRegisterFixture, renderRegisterDocument, registerDocChecks, legacyProjectRef, cpbPathway, fontVerdict } from "../../server/lib/registerDocuments.mjs";
import { DOC_DEFS, buildClientBriefPayload, boundedRows } from "../../server/lib/documents/documentPayloads.mjs";
import { pdfFontNames } from "../../server/lib/docxToPdf.mjs";
import { restrictedFindings, restrictedInText } from "../../src/lib/restrictedProducts.js";
import { BASELINE_CATEGORIES } from "../../src/lib/registerGuidance.js";
import { makeItem } from "../../src/lib/register.js";
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
ok("scope lines are plain words; the reference stays in the record, not in the client's sentence (CPB-06)", cb.scopeIn.length >= 8 && cb.scopeIn.every((x) => !/\[|\]/.test(x.text) && /^[A-Z]\d{3}-[0-9A-Z]{3}$/.test(x.ref))
  && buildClientBriefPayload(fx).SCOPE_IN.every((x) => !("REF" in x)) && buildClientBriefPayload(fx).BOUNDARIES.every((g) => g.B_ITEMS.every((x) => !("REF" in x))), flat(cb.scopeIn.slice(0, 2)));
ok("project-wide rows read without a place prefix; room rows name the room", cb.scopeIn.some((x) => x.text.startsWith("Remove the rear wall")) && cb.scopeIn.some((x) => x.text.startsWith("Kitchen and living: ")) && !cb.scopeIn.some((x) => /^(Whole house|Site \/ existing):/.test(x.text)));
ok("a site fact is never work", !flat(cb.scopeIn).includes("Steep"));
ok("facts are noted as facts", cb.noted.some((g) => g.items.some((t) => /Steep access/.test(t))));
ok("retained, excluded, deferred and by-others stay in their own lists", texts(block("Existing to remain or protect")).some((t) => /Front bedrooms/.test(t))
  && texts(block("Not in the current scope")).some((t) => /Swimming pool/.test(t)) && texts(block("Not in the current scope")).some((t) => /Landscaping.*possible later stage/.test(t))
  && texts(block("By others")).some((t) => /Boundary fencing/.test(t)));
ok("client-supplied items are listed as such, not as included, excluded or a decision", texts(block("Items you plan to supply")).some((t) => /Fridge and coffee machine/.test(t))
  && !flat(cb.scopeIn).includes("Fridge") && !cb.decisions.some((d) => /Fridge/.test(d.action)));
ok("undecided scope is shown as still to be decided, never dropped", texts(block("Still to be decided")).some((t) => /side path/.test(t)));
ok("risks needing a check say who confirms them", texts(block("Still to be checked")).some((t) => /roof framing/.test(t) && /to confirm\.$/.test(t)));
ok("boundary notes are short (CPB-09)", cb.boundaries.every((b) => (b.note || "").length <= 60), flat(cb.boundaries.map((b) => b.note)));
ok("preferences carry a status in words", cb.preferences.flatMap((g) => g.items).every((x) => ["Preferred", "Proposed", "Client-approved", "Requirement", "For consultant review"].includes(x.status)));
ok("an approval with evidence reads Client-approved", cb.preferences.flatMap((g) => g.items).some((x) => /Porcelain benchtop/.test(x.text) && x.status === "Client-approved"));
const { fx: noEvidence } = build("kestrel", {}, (p) => { const b = p.register.items.find((i) => /Porcelain benchtop/.test(i.description || "")); b.evidence = null; });
ok("Client-approved without evidence reads Proposed, and issue is blocked until the approval is recorded (CPB-03)",
  noEvidence.clientBrief.preferences.flatMap((g) => g.items).some((x) => /Porcelain benchtop/.test(x.text) && x.status === "Proposed")
  && registerDocChecks("client_brief", noEvidence, { register: build("kestrel", {}, (p) => { p.register.items.find((i) => /Porcelain benchtop/.test(i.description || "")).evidence = null; }).p.register, recipientName: "X", mode: "issue" }).errors.some((e) => /client-approved without evidence/.test(e)));
ok("a kitchen item is grouped with the kitchen; windows have their own group", cb.preferences.find((g) => g.group === "Joinery and kitchen")?.items.some((x) => /benchtop/.test(x.text)) && cb.preferences.some((g) => g.group === "Windows and doors"));
ok("a room exception names its room in the Where column", cb.preferences.flatMap((g) => g.items).some((x) => x.where === "Main bedroom" && x.text === "Wool carpet"));
const prefPay = buildClientBriefPayload(fx).PREF_GROUPS;
const groupRows = (g) => [...g.ROWS_KEEP, ...g.ROWS, ...g.ROWS_PEN, ...g.ROWS_LAST];
ok("preferences are grouped under a band, the room named once per run (CPB-07)", prefPay.length >= 4 && prefPay.every((g) => g.GROUP && groupRows(g).length)
  && groupRows(prefPay.find((g) => g.GROUP === "Bathrooms and laundry")).map((r) => r.WHERE).join("|") === "Ensuite||", flat(prefPay.find((g) => g.GROUP === "Bathrooms and laundry")));
ok("the consultant-review goal is marked", cb.preferences.flatMap((g) => g.items).some((x) => /airtight/i.test(x.text) && x.status === "For consultant review"));

section("Decisions (Tab 26/27: a preference is never an open action)");
ok("3 to 7 decisions, each a sentence with a register reference", cb.decisions.length >= 3 && cb.decisions.length <= 7 && cb.decisions.every((d) => /^[A-Z]\d{3}-[0-9A-Z]{3}$/.test(d.ref) && /\.$/.test(d.action)), flat(cb.decisions));
ok("a preference with no next action isn't a decision", !cb.decisions.some((d) => /neutral walls|Freestanding bath/i.test(d.action)));
ok("a preference with a real next action is", cb.decisions.some((d) => /basin style/.test(d.action)));
ok("an architect's own task isn't listed as the client's decision", !cb.decisions.some((d) => /stair location/.test(d.action)));
const allDecisions = (pl) => [...pl.DECISIONS_KEEP, ...pl.DECISIONS, ...pl.DECISIONS_PEN, ...pl.DECISIONS_LAST];
ok("no owner is invented: an unassigned decision prints 'To be agreed'", cb.decisions.some((d) => /access route/.test(d.action) && d.owner === "") && allDecisions(buildClientBriefPayload(fx)).some((d) => /access route/.test(d.ACTION) && d.OWNER === "To be agreed"));
ok("the client's decisions come first", cb.decisions[0].owner === "Client");

section("Next steps follow the engagement pathway");
const steps = (f) => f.clientBrief.nextSteps;
ok("design and build before the PTSA: the separate agreement is explained once, Concept is where we are", !!steps(fx).ptsa && steps(fx).steps[0].label === "Concept" && steps(fx).steps[0].current && /pre-construction agreement \(PTSA\) is separate/.test(steps(fx).ptsa.text) && !steps(fx).ptsa.title);
const { fx: buildOnly } = build("powder", { recipientName: "Priya Raman" });
ok("build only: no concept, no agreement, no PTSA; confirm the scope, price, contract, build (CPB-01)", cpbPathway({ engagementPathway: "design_build", deliveryModel: "build_only" }) === "build_only"
  && !steps(buildOnly).ptsa && !/Concept|agreement|PTSA/i.test(flat([steps(buildOnly).paras, steps(buildOnly).steps])) && steps(buildOnly).steps.map((x) => x.label).join("|") === "Confirm the scope|Pricing|Building contract|Construction"
  && buildOnly.project.stageLabel === "Scope and pricing" && !/design develops/.test(buildClientBriefPayload(buildOnly).SCOPE_INTRO));
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
{
  const refsOf = (f) => { const c = f.clientBrief, m = {}; for (const x of [...c.scopeIn, ...c.boundaries.flatMap((b) => b.items), ...c.preferences.flatMap((g) => g.items)]) m[x.text] = x.ref; for (const d of c.decisions) m[d.action] = d.ref; return m; };
  const a = refsOf(fx), b = refsOf(build("kestrel", { status: "Draft" }).fx), c2 = refsOf(build("kestrel", { revision: 2 }, (p) => { p.context.engagementPathway = "plans_supplied"; p.lead.stage = "consultants"; }).fx);
  const shared = Object.keys(a).filter((k) => k in b && k in c2);
  ok("the same item keeps the same reference across the draft, R01 and R02 (CPB-05)", shared.length >= 30 && shared.every((k) => a[k] === b[k] && a[k] === c2[k]), `${shared.filter((k) => !(a[k] === b[k] && a[k] === c2[k])).length} differ of ${shared.length}`);
}
ok("without an allocated project number, the existing lead reference is used", build("kestrel", { projectRef: undefined }).fx.meta.ref === legacyProjectRef(kp.lead.id) && /^BL[0-9A-F]{6}$/.test(legacyProjectRef(kp.lead.id)));
ok("every document type has a code", ["client_brief", "architect_brief", "selections_schedule", "client_presentation", "tender_scope_notes"].every((t) => /^BLB-[A-Z]{3}-X$/.test(documentIdentity({ type: t, projectRef: "X", status: "Draft" }).number)));

section("Pre-issue checks");
const checks = registerDocChecks("client_brief", fx, { register: kp.register, recipientName: "Jordan & Mia Whitcombe", mode: "issue" });
ok("the Kestrel brief passes the pre-issue checks", checks.errors.length === 0, flat(checks));
ok("no dollar figures, estimate or allowance wording reach the client", !/\$\s?\d|allowance|estimate|margin/i.test(flat(cb)));
const pay = buildClientBriefPayload(fx);
ok("the status panel no longer claims nothing is approved; the brief doesn't itself authorise anything (CPB-03)", !/nothing in it is ordered or approved/.test(pay.STATUS_BODY) && /doesn't itself authorise purchasing, construction or changes to a contract/.test(pay.STATUS_BODY));
ok("consultant confirmation reads as still to come; the closing note uses no system names (CPB-11/12)", pay.NOTED.at(-1).N_ITEMS.some((x) => /will need to confirm/.test(x.TEXT)) && !/register/i.test(pay.ABOUT_BODY) && /information recorded for your project/.test(pay.ABOUT_BODY));
ok("a recorded fact reads as a sentence, not a list of codes (CPB-11)", cb.noted.flatMap((g) => g.items).includes("Site access: Steep access and narrow or restricted access."), flat(cb.noted));
const access = (p) => p.register.items.find((i) => (i.answer?.selected || []).some((x) => x.label === "Steep access"));
const zoned = build("kestrel", {}, (p) => { Object.assign(access(p).answer, { element: { label: "Driveway" }, zone: { label: "Front boundary" } }); access(p).answer.selected.push({ optionId: "nbn", label: "NBN pit in the driveway" }); }).fx.clientBrief.noted.flatMap((g) => g.items);
ok("a fact keeps its element and zone, and capitalised terms keep their capitals", zoned.includes("Site access: Driveway — Steep access, narrow or restricted access and NBN pit in the driveway — Front boundary."), flat(zoned));
const onSite = build("kestrel", {}, (p) => { const w = p.register.items.find((i) => i.promptKey === "W-007"); w.answer.selected = ["Work zones", "Temporary kitchen", "Dust and noise separation"].map((l, k) => ({ optionId: `c${k}`, path: ["yes", `c${k}`], label: `Yes · ${l}` })); }).fx.clientBrief.noted.flatMap((g) => g.items);
ok("a branch answer is said once: 'Yes — work zones, temporary kitchen and …'", onSite.includes("Living on site during works: Yes — work zones, temporary kitchen and dust and noise separation."), flat(onSite));
ok("a won project keeps its own stage label and has no steps", won.project.stageLabel && !/Concept|Plans and pricing|Scope and pricing|Tender$/.test(won.project.stageLabel) && won.clientBrief.nextSteps.steps.length === 0, `${won.project.stageLabel} | ${flat(won.clientBrief.nextSteps)}`);
ok("priorities: one is a single line, two are two columns, three are cards (CPB-10)", buildClientBriefPayload(buildOnly).PRI_INLINE === true && !buildClientBriefPayload(buildOnly).PRI_BAND_3
  && buildClientBriefPayload({ ...fx, clientBrief: { ...cb, priorities: cb.priorities.slice(0, 2) } }).PRI_BAND_2 === true && pay.PRI_BAND_3 === true);

section("Prohibited products (CPB-02)");
const stone = build("kestrel", {}, (p) => { p.register.items.push(makeItem({ id: "ri_kc_stone", itemKind: "selection", category: "benchtop", promptKey: "K-005", roomId: "k_kitchen", certainty: "preference", description: "Engineered stone island benchtop" })); });
const stoneChecks = registerDocChecks("client_brief", stone.fx, { register: stone.p.register, recipientName: "X", mode: "issue" });
ok("a client document naming engineered stone can't be issued, and says why", stoneChecks.errors.some((e) => /Engineered stone island benchtop/.test(e) && /prohibited in Australia from 1 July 2024/.test(e) && /original wording stays in the register's history/.test(e)), flat(stoneChecks.errors));
ok("the internal estimator's notes get a warning instead", registerDocChecks("tender_scope_notes", buildRegisterFixture("tender_scope_notes", { lead: stone.p.lead, context: stone.p.context, register: stone.p.register, projectRef: "0417", ...ISSUED }), { register: stone.p.register, recipientName: "Blue Leaf estimating", mode: "issue" }).warnings.some((w) => /engineered stone/i.test(w)));
ok("the check catches the card option too, and the client's record is never rewritten", restrictedFindings([makeItem({ itemKind: "selection", answer: { v: 1, state: "recorded", nature: "choice", selected: [{ optionId: "engineered_stone", path: ["engineered_stone"], label: "Engineered stone" }] } })]).length === 1
  && stone.p.register.items.find((i) => i.id === "ri_kc_stone").description === "Engineered stone island benchtop");
ok("engineered timber, natural, sintered and porcelain stone, and quartzite aren't flagged", restrictedFindings(["Engineered timber flooring", "Natural stone benchtop", "Sintered stone benchtop", "Porcelain benchtop", "Quartzite benchtop", "Granite benchtops"].map((d) => makeItem({ itemKind: "selection", description: d }))).length === 0);
ok("an excluded engineered-stone line isn't flagged", restrictedFindings([makeItem({ itemKind: "selection", disposition: "excluded", description: "Engineered stone benchtop" })]).length === 0);
const sel = (o) => makeItem({ itemKind: "selection", ...o });
const one = (o) => restrictedFindings([sel(o)])[0];
ok("existing stone to stay, or stone being removed, is a warning, not a block", one({ disposition: "retain", description: "Existing engineered stone vanity top" })?.blocking === false && one({ disposition: "remove", description: "Engineered stone benchtop to be removed" })?.blocking === false);
const keptStone = build("kestrel", {}, (p) => { p.register.items.push(sel({ id: "ri_kc_keep", category: "vanity", disposition: "retain", certainty: "fact", description: "Existing engineered stone laundry top" })); });
const keptChecks = registerDocChecks("client_brief", keptStone.fx, { register: keptStone.p.register, recipientName: "X", mode: "issue" });
ok("…so a brief that mentions existing stone can still be issued, with a warning", keptChecks.errors.length === 0 && keptChecks.warnings.some((w) => /mentions engineered stone/.test(w)), flat(keptChecks));
const blocks = (o) => one(o)?.blocking === true;
const warnsOnly = (o) => !!one(o) && one(o).blocking === false;
ok("a requirement to avoid it, or the client's own note, warns and never blocks", warnsOnly({ itemKind: "requirement", description: "No engineered stone in the kitchen" })
  && warnsOnly({ category: "benchtop", answer: { v: 1, state: "recorded", nature: "choice", selected: [{ optionId: "porcelain", label: "Porcelain" }], clientNote: "We don't want engineered stone" } })
  && warnsOnly({ category: "benchtop", answer: { v: 1, state: "recorded", nature: "choice", selected: [{ optionId: "other", label: "Other" }], clientNote: "Engineered stone looks the best" } }));
// Two independent red-team rounds showed negation in free text can't be read safely, so on a selection any wording blocks.
const anyWording = ["Not laminate, engineered stone island benchtop", "Replace the laminate with an engineered stone benchtop", "Instead of laminate, engineered stone", "Not sure, engineered stone",
  "No engineered stone splashback, engineered stone benchtop and island", "Engineered stone, changed from Snow to Calacatta per client 3/11", "Engineered stone - looking at the Calacatta range",
  "Client's final pick was engineered stone", "Engineered stone - style: Calacatta Nuvo", "Porcelain instead of engineered stone", "Porcelain benchtop (was engineered stone)", "No engineered stone in the kitchen"];
ok("on a selection that will be supplied, any wording naming engineered stone blocks (negation, history, colour changes)", anyWording.every((d) => blocks({ category: "joinery", description: d })), flat(anyWording.filter((d) => !blocks({ category: "joinery", description: d }))));
const shorthand = ["Eng. stone 40mm", "eng stone, Calacatta", "E-stone, white", "Estone 20mm Calacatta", "Engineerd stone benchtop", "Enginered stone", "Engeneered stone", "Engineered quartz, 20mm", "Agglomerate stone tops", "Reconstituted quartz"];
ok("shorthand, misspellings, agglomerate and engineered quartz are caught", shorthand.every((d) => blocks({ category: "joinery", description: d })), flat(shorthand.filter((d) => !blocks({ category: "joinery", description: d }))));
ok("quartz as a bench material blocks: next to a bench word, or alone on a benchtop, splashback, vanity or laundry bench record", [
  { category: "joinery", description: "Quartz island bench with waterfall" }, { category: "joinery", description: "Quartz kitchen benchtop" }, { category: "joinery", description: "Quartz benchtop - removed upstand per client" },
  { category: "benchtop", description: "Quartz" }, { promptKey: "K-006", description: "White quartz" }, { category: "benchtop", product: "Quartz - removed waterfall per client" },
  { promptKey: "B-004", category: "sanitary", product: "Quartz" }, { promptKey: "L-003", category: "joinery", description: "Laundry bench", product: "Quartz" }, { category: "joinery", description: "Island", product: "20mm quartz" },
].every(blocks));
ok("quartz as a colour, look, finish, sink, brand, or beside a compliant material doesn't block", [
  { category: "benchtop", description: "Porcelain benchtop", colour: "Quartz Grey" }, { category: "splashback", description: "Glass splashback", colour: "Rose Quartz" }, { category: "benchtop", description: "Porcelain benchtop with undermount quartz sink" },
  { category: "benchtop", description: "Laminate, quartz finish" }, { category: "benchtop", description: "Quartz-look porcelain" }, { category: "benchtop", description: "Porcelain - not quartz" }, { category: "tiles", description: "Rose quartz feature tile" },
].every((o) => !blocks(o)) && one({ category: "benchtop", manufacturer: "Quantum Quartz", product: "Quantum Zero" })?.product.level === "warning");
const avoidReq = build("kestrel", {}, (p) => { p.register.items.push(makeItem({ id: "ri_kc_avoid", itemKind: "requirement", category: "benchtop", roomId: "k_kitchen", certainty: "preference", description: "No engineered stone in the kitchen" })); });
const avoidChecks = registerDocChecks("client_brief", avoidReq.fx, { register: avoidReq.p.register, recipientName: "X", mode: "issue" });
ok("a brief with a 'no engineered stone' requirement still issues, with a warning that names the record and room", avoidChecks.errors.length === 0 && avoidChecks.warnings.some((w) => /No engineered stone in the kitchen" \(Kitchen[^)]*\) mentions engineered stone\. Check it isn't being supplied or installed/.test(w)), flat(avoidChecks.warnings));
ok("the block tells staff exactly what to do: name only what will be supplied", stoneChecks.errors.some((e) => /in a selection that will be supplied/.test(e) && /reword it even if it says what was replaced or avoided/.test(e) && /Retain or Remove/.test(e)), flat(stoneChecks.errors));
ok("brands that sold engineered stone warn and never block", one({ description: "Caesarstone porcelain range benchtop" })?.product.level === "warning" && one({ description: "Caesarstone porcelain range benchtop" })?.blocking === false);
ok("cement-based reconstituted or manufactured stone, bluestone and limestone aren't engineered stone", !one({ description: "Reconstituted stone wall veneer" }) && !one({ description: "Manufactured stone retaining blocks" }) && !one({ description: "Bluestone paving edge" }) && !one({ description: "Limestone hearth" }));
ok("printed fields (supplier, source, chosen option) block; the client's note only warns", blocks({ description: "Kitchen bench", supplier: "Engineered stone, Example Stone Co" }) && blocks({ description: "Kitchen bench", source: "Engineered stone sample board" })
  && blocks({ answer: { v: 1, state: "recorded", nature: "choice", selected: [{ optionId: "other", label: "Engineered stone" }] } }) && warnsOnly({ description: "Kitchen bench", answer: { v: 1, state: "recorded", nature: "choice", selected: [], clientNote: "We'd like engineered stone if possible" } }));
ok("free text in a document is scanned and warns", restrictedInText("Allow for an engineered stone island").length === 1 && restrictedInText("No engineered stone on this job").length === 1 && restrictedInText("Porcelain benches").length === 0);
ok("the pricing guide no longer offers engineered stone as a kitchen tier", !/engineered stone/i.test(JSON.stringify(BASELINE_CATEGORIES)));

section("Font fail-safe (CPB-13)");
ok("Lato only: fine", fontVerdict(["Lato-Regular", "Lato-Bold"]).error === null && fontVerdict(["Lato-Regular"]).warnings.length === 0);
ok("no Lato at all: refused, naming the substitute", /LiberationSans.*needs the Lato font/.test(fontVerdict(["LiberationSans"], {}).error || ""));
ok("…unless DOCUMENT_FONT_CHECK=warn while Lato is being installed", fontVerdict(["LiberationSans"], { DOCUMENT_FONT_CHECK: "warn" }).error === null && fontVerdict(["LiberationSans"], { DOCUMENT_FONT_CHECK: "warn" }).warnings.length === 1);
ok("Lato plus a fallback: a warning naming the fallback font", fontVerdict(["Lato-Regular", "DejaVuSans"]).error === null && /fallback font \(DejaVuSans\)/.test(fontVerdict(["Lato-Regular", "DejaVuSans"]).warnings[0] || ""));
const cjk = build("kestrel", {}, (p) => { p.register.items.find((i) => i.promptKey === "B-005").description = "Basin 洗手盆 ✓"; });
const cjkChecks = registerDocChecks("client_brief", cjk.fx, { register: cjk.p.register, recipientName: "X", mode: "preview" });
ok("characters the font can't print are named before anything is issued", cjkChecks.warnings.some((w) => /may not print/.test(w) && /洗/.test(w) && /✓/.test(w)), flat(cjkChecks.warnings));
const symbolChecks = registerDocChecks("client_brief", build("kestrel", {}, (p) => { p.register.items.find((i) => i.promptKey === "B-005").description = "Basin with ⭐ finish ⌛ ⬜"; }).fx, { register: kp.register, recipientName: "X", mode: "preview" });
ok("…including symbols outside the dingbats block (star, hourglass, white square)", symbolChecks.warnings.some((w) => /may not print/.test(w) && /⭐/.test(w) && /⌛/.test(w) && /⬜/.test(w)), flat(symbolChecks.warnings));
const punct = build("kestrel", {}, (p) => { p.register.items.find((i) => i.promptKey === "B-005").description = "Basin – ‘matte’ “stone-look” — Zoë’s pick, 40° edge, 2 m² × ½, café · Nguyễn → ≤ ™ •"; });
const punctChecks = registerDocChecks("client_brief", punct.fx, { register: punct.p.register, recipientName: "X", mode: "preview" });
ok("ordinary punctuation and accented names don't warn (curly quotes, dashes, °, m², ×, ½, Zoë, Nguyễn, arrows, ™)", /“stone-look”/.test(JSON.stringify(punct.fx)) && !punctChecks.warnings.some((w) => /may not print/.test(w)), flat(punctChecks.warnings));

section("Bounded tables (CPB-04/08)");
const rows = (n) => Array.from({ length: n }, (_, i) => ({ i }));
const shape = (n) => { const r = boundedRows("D", rows(n)); return [r.D_KEEP.length, r.D.length, r.D_PEN.length, r.D_LAST.length].join(","); };
ok("up to three rows stay whole; four or more keep two at the top and two at the bottom", shape(1) === "0,0,0,1" && shape(3) === "2,0,0,1" && shape(4) === "1,1,1,1" && shape(7) === "1,4,1,1");

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
  const decisionRefs = (pdf, n) => (text(pdf, n).match(/^[A-Z]\d{3}[-‑][0-9A-Z]{3}$/gm) || []).length;
  const decPages = Array.from({ length: kPages }, (_, i) => i + 1).filter((n) => decisionRefs(kPdf, n) > 0);
  ok("the decisions table never leaves a single row on a page", decPages.every((n) => decisionRefs(kPdf, n) >= 2), `rows per page ${decPages.map((n) => decisionRefs(kPdf, n))}`);
  const lastLines = (pdf) => { const n = pdfPages(pdf); return text(pdf, n).split("\n").filter((l) => l.trim()).length; };
  ok("no near-empty last page (at least 25 lines on it)", lastLines(kPdf) >= 25, `last page ${lastLines(kPdf)} lines`);
  ok("the closing note shares its page with the end of the steps table", /ABOUTTHISDOCUMENT/.test(text(kPdf, kPages).replace(/\s+/g, "")) && /Building contract/.test(text(kPdf, kPages)));
  ok("every font is Lato, read straight from the PDF (the issue fail-safe)", kOut.fonts.length > 0 && kOut.fonts.every((f) => /^Lato-/.test(f)), kOut.fonts.join());
  ok("a substituted font is caught", pdfFontNames(Buffer.from("<< /Type /Font /BaseFont /ABCDEF+LiberationSerif >> << /BaseFont /Lato-Bold >>")).join() === "LiberationSerif,Lato-Bold");
  const { fx: rfx } = build("ridgeline", { recipientName: "Alexander and Catherine Montgomery-Hargreaves" });
  const rPdf = join(tmp, "r.pdf"); fs.writeFileSync(rPdf, (await renderRegisterDocument("client_brief", rfx, {})).pdf);
  const rPages = pdfPages(rPdf);
  const prefPages = Array.from({ length: rPages }, (_, i) => i + 1).filter((n) => /YOUR PREFERENCE/.test(text(rPdf, n)));
  ok("a long preferences table repeats its header on every page it reaches", prefPages.length >= 2, `header on pages ${prefPages}`);
  ok("the long project has no near-empty last page", lastLines(rPdf) >= 25, `last page ${lastLines(rPdf)} lines, ${rPages} pages`);
  const assumesPage = Array.from({ length: rPages }, (_, i) => i + 1).find((n) => /THISBRIEFASSUMES/.test(text(rPdf, n).replace(/\s+/g, "")));
  ok("a short list stays whole with its label (the three working assumptions on one page)", !!assumesPage && /will need to confirm/.test(text(rPdf, assumesPage)) && /not set by this document/.test(text(rPdf, assumesPage).replace(/\s+/g, " ")), `label on page ${assumesPage}`);
  // Layout text keeps visual order: after the last band on a page, at least two rows (status words) must follow it.
  const bandRowsAfter = (pdf, n) => { let lt = ""; try { lt = execFileSync("pdftotext", ["-layout", "-f", String(n), "-l", String(n), pdf, "-"], { encoding: "utf8" }); } catch { return null; }
    const lines = lt.split("\n"); const last = lines.map((l) => l.replace(/\s+/g, "")).findLastIndex((l) => /^(EXTERIOR|WINDOWSANDDOORS|INTERIORFINISHES|JOINERYANDKITCHEN|BATHROOMSANDLAUNDRY|SERVICESANDFIXTURES|OUTDOORAREAS|REQUIREMENTSANDGOALS)$/.test(l));
    return last < 0 ? null : lines.slice(last + 1).filter((l) => /(Preferred|Proposed|Client-approved|Requirement|For consultant review)\s*$/.test(l)).length; };
  const bandTails = Array.from({ length: rPages }, (_, i) => bandRowsAfter(rPdf, i + 1)).filter((x) => x !== null);
  ok("a preference band never ends a page with fewer than two of its rows", bandTails.length >= 2 && bandTails.every((x) => x >= 2), `rows after the last band on each page: ${bandTails}`);
  // The reviewer's case: a big bathrooms group (19 rows) pushes the table's last group across a page. The page the
  // table continues on must open with at least two rows, never one row then the next section.
  const big = build("ridgeline", { recipientName: "X" }, (p) => { const ldry = p.register.meta.rooms.find((r) => r.name === "Laundry");
    ["Laundry trough with a pull-out mixer", "Overhead cupboards to the ceiling", "Benchtop over the appliances", "Hanging rail above the trough", "Tiled splashback to match the ensuite", "Floor waste and tiled floor", "Drying cupboard with a heated rail", "Broom cupboard"]
      .forEach((d, k) => p.register.items.push(makeItem({ id: `ri_rd_x${k}`, itemKind: "selection", promptKey: "B-009", category: "tiles", roomId: ldry.id, room: ldry.name, section: "room", certainty: "preference", description: d }))); }).fx;
  const bPdf = join(tmp, "big.pdf"); fs.writeFileSync(bPdf, (await renderRegisterDocument("client_brief", big, {})).pdf);
  const bPages = pdfPages(bPdf);
  const statusRows = (t) => t.split("\n").filter((l) => /(Preferred|Proposed|Client-approved|Requirement|For consultant review)\s*$/.test(l)).length;
  // A continuation page: right under the page header comes the repeated column header. Count its rows up to the next
  // section kicker ("04 / ASSUMPTIONS").
  const openers = Array.from({ length: bPages }, (_, i) => i + 1).slice(1).map((n) => { let lt = ""; try { lt = execFileSync("pdftotext", ["-layout", "-f", String(n), "-l", String(n), bPdf, "-"], { encoding: "utf8" }); } catch { /* poppler checked */ }
    const lines = lt.split("\n").filter((l) => l.trim());
    if (!/^\s*WHERE\s+YOUR PREFERENCE\s+STATUS/.test(lines[2] || "")) return null;
    const end = lines.findIndex((l, k) => k > 2 && /^\s*0\d\s+\//.test(l));
    return statusRows(lines.slice(3, end < 0 ? undefined : end).join("\n")); }).filter((x) => x !== null);
  ok("a continued preferences table opens its page with at least two rows (reviewer's 19-row case)", openers.length >= 1 && openers.every((x) => x >= 2), `rows at the top of each continuation page: ${openers}; pages ${bPages}`);
  const boPdf = join(tmp, "bo.pdf"); fs.writeFileSync(boPdf, (await renderRegisterDocument("client_brief", buildOnly, {})).pdf);
  const boText = text(boPdf).replace(/\s+/g, " ");
  ok("the rendered build-only brief never mentions concept design or a PTSA (CPB-01)", !/PTSA|Concept|pre-construction agreement/i.test(boText) && /Confirm the scope/.test(boText) && pdfPages(boPdf) <= 2, boText.slice(0, 200));
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
