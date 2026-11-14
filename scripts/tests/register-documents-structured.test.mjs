/**
 * register-documents-structured.test.mjs — R05 P5 (Tab 27 Gate 6, B12, Tab 22). What each document may and may not say, from the
 * real fixture builders. Card answers print, facts never become work, and nothing internal reaches a client or consultant.
 * No server, no database. Run: node scripts/tests/register-documents-structured.test.mjs
 */
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { QUESTIONS, ANSWER_CONFIG } from "../../src/lib/registerQuestions.js";
import { makeItem, makeRoom, emptyMeta, toggleOption, setCategoryTier, BASELINE_CATEGORIES, PERFORMANCE_SUGGESTIONS } from "../../src/lib/register.js";
import { buildRegisterFixture, registerDocChecks, REGISTER_DOC_TYPES, renderRegisterDocument } from "../../server/lib/registerDocuments.mjs";
import { renderDocxTemplate } from "../../server/lib/docTemplates.mjs";
import { DOC_DEFS } from "../../server/lib/documents/documentPayloads.mjs";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 700)}` : ""}`); } };
const section = (t) => console.log(`\n${t}`);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");
const q = (id) => QUESTIONS.find((x) => x.id === id);
const pick = (id, ...steps) => steps.reduce((a, p) => toggleOption(ANSWER_CONFIG[id], a, p), null);
const mk = (id, more) => makeItem({ itemKind: q(id).itemKind, category: q(id).category, promptKey: id, section: q(id).section === "site" ? "site" : "project", technicalStatus: q(id).technical, ...more });
const zone = (a, key, label) => ({ ...a, zone: { key, label } });
const INTERNAL_NOTE = "STAFFONLY-MARK-7731";

const bed = makeRoom({ id: "r_bed", name: "Bed 1", roomType: "bedroom", sheet: "A201" });
const kitchen = makeRoom({ id: "r_kit", name: "Kitchen", roomType: "kitchen" });
const main = mk("W-013", { isDefault: true, certainty: "preference", answer: { ...zone(pick("W-013", ["render"], ["render", "rendered_aac"]), "main_walls", "Main walls"), note: INTERNAL_NOTE } });
const feature = mk("W-013", { isDefault: true, certainty: "preference", answer: zone(pick("W-013", ["lightweight_cladding"], ["lightweight_cladding", "fibre_cement_sheet"]), "feature", "Feature") });
const roof = mk("W-014", { isDefault: true, certainty: "preference", answer: zone(pick("W-014", ["metal_roofing"], ["metal_roofing", "pitched"], ["metal_roofing", "pitched", "corrugated"]), "main_roof", "Main roof") });
const gutters = mk("W-014", { certainty: "preference", answer: { v: 1, state: "recorded", nature: "choice", selected: [{ optionId: "quad", path: ["quad"], label: "Quad" }], element: { id: "el_g", key: "gutters", label: "Gutters" }, linkedItemIds: [roof.id] } });
const carpet = mk("W-017", { isDefault: true, certainty: "preference", answer: zone(pick("W-017", ["carpet"]), "bedroom_floor", "Bedrooms") });
const exception = mk("R-005", { roomId: bed.id, room: bed.name, certainty: "preference", overridesDefaultId: carpet.id, answer: pick("R-005", ["timber"]) });
const access = mk("W-001", { answer: pick("W-001", ["narrow_or_restricted_access"], ["steep_access"]) });
const pilotAccess = mk("W-007", { disposition: "included", answer: pick("W-007", ["yes"]) });
const risk = mk("W-011", { description: "Footings under rear wall unknown", nextAction: "Open up and inspect", responsibility: "consultant" });
const goal = mk("W-016", { answer: pick("W-016", ["airtightness"]) });
const demo = mk("W-004", { disposition: "remove", quantity: 42, unit: "m2", answer: { ...pick("W-004", ["demolish"]), element: { id: "el_w", key: "walls", label: "Walls" }, areaIds: [kitchen.id] } });
const fence = mk("W-010", { disposition: "by_others", answer: { ...pick("W-010", ["by_others"]), element: { id: "el_f", key: "fencing", label: "Fencing" } } });
const excluded = mk("W-010", { disposition: "excluded", answer: { ...pick("W-010", ["excluded"]), element: { id: "el_p", key: "pool", label: "Pool" } } });
const baseline = setCategoryTier(setCategoryTier(null, "kitchen", "standard", { at: "x", by: "y" }), "roof", "premium", { at: "x", by: "y" });
const benchtop = mk("K-005", { isDefault: true, certainty: "preference", answer: zone(pick("K-005", ["engineered_stone"]), "kitchen", "Kitchen") });
const items = [main, feature, roof, gutters, carpet, exception, access, pilotAccess, risk, goal, demo, fence, excluded, benchtop];
const register = { meta: emptyMeta({ planRev: "Concept A Rev 2", rooms: [kitchen, bed], baseline }), items };
const context = { identity: { clientName: "Test Client", siteAddress: "1 Test St", suburb: "Stirling" }, projectType: "renovation", deliveryModel: "design_build", goals: { description: "A warm renovation" }, consultants: [], drawings: [{ filename: "A101 Plan.pdf", revision: "C", issuer: "Studio" }] };
const input = (status = "Issued") => ({ lead: { id: "00000000-0000-0000-0000-000000abc123", stage: "tender" }, context, register, revision: 1, status, issuedDate: "2026-11-10", issuer: "Staff" });
const fx = (t) => buildRegisterFixture(t, input());
const brief = fx("client_brief"), arch = fx("architect_brief"), sel = fx("selections_schedule"), notes = fx("tender_scope_notes");
const flat = (o) => JSON.stringify(o);
const sectionOf = (name) => notes.tenderNotes.sections.find((s) => s.title === name);

section("Card answers print in the existing documents (Gate 6.1)");
ok("the schedule prints what was chosen", /Render/.test(flat(sel.selections)) && /Fibre cement/i.test(flat(sel.selections)), flat(sel.selections).slice(0, 500));
ok("two wall systems are two lines", sel.selections.filter((r) => r.category.includes("Architectural material")).length === 2);
ok("gutters say which roof", sel.selections.some((r) => /Quad/.test(r.product) && /Main roof/.test(r.product)));
ok("a project default is labelled", sel.selections.some((r) => /project default/.test(r.category)));
ok("a room exception is labelled", sel.selections.some((r) => r.category.startsWith("Bed 1") && /room exception/.test(r.category)));
ok("every line keeps its item id", sel.selections.every((r) => /^[A-Z]\d{3}-|^X-/.test(r.itemId)));
ok("the client brief prints card choices", /Render/.test(flat(brief.clientBrief.preferences)));
ok("scope lines carry the item id, beside the words rather than inside them", brief.clientBrief.scopeIn.some((l) => /Walls/.test(l.text) && /^W004-/.test(l.ref) && !/\[/.test(l.text)), flat(brief.clientBrief.scopeIn));
ok("the architect brief lists card scope", arch.architectBrief.scheduleItems.some((r) => /Demolish|Remove/i.test(r.requirement) && /Walls/.test(r.requirement)), flat(arch.architectBrief.scheduleItems).slice(0, 400));
ok("an area reads as the room's name", brief.clientBrief.scopeIn.some((l) => l.text.startsWith("Kitchen:")));

section("Facts never become priced scope (MR-UX-02.8)");
ok("site access isn't Included", !brief.clientBrief.scopeIn.some((l) => /Narrow|Steep/.test(l.text)));
ok("an older Included status on a fact doesn't print as work", !brief.clientBrief.scopeIn.some((l) => /Yes/.test(l.text)), flat(brief.clientBrief.scopeIn));
ok("the architect's register doesn't list it as work", !arch.architectBrief.scheduleItems.some((r) => /Narrow|Steep/.test(r.requirement)));
ok("it's noted as a fact", brief.clientBrief.noted.some((g) => /site and household/.test(g.label) && g.items.some((t) => /Narrow/.test(t))), flat(brief.clientBrief.noted));

section("Performance goals stay intent (B04, DEC-MRUX-03)");
ok("the goal is labelled for review", brief.clientBrief.preferences.flatMap((g) => g.items).some((x) => /Airtightness/.test(x.text) && x.status === "For consultant review") && /Airtightness[^"]*subject to consultant review/.test(flat(arch.architectBrief.scheduleItems)), flat(brief.clientBrief.preferences).slice(0, 800));
const suggestions = Object.values(PERFORMANCE_SUGGESTIONS).flat().map((s) => s.text);
for (const [name, doc] of [["client brief", brief], ["architect brief", arch], ["schedule", sel]]) ok(`no review suggestion in the ${name}`, !suggestions.some((t) => flat(doc).includes(t)));

section("Nothing internal reaches a client or consultant (B12)");
const tierWords = BASELINE_CATEGORIES.flatMap((c) => [...Object.values(c.tiers), ...(c.parts || []).flatMap((p) => Object.values(p.tiers || {})), ...Object.values(c.zoneTiers || {}).flatMap((t) => Object.values(t))]);
for (const [name, doc] of [["client brief", brief], ["architect brief", arch], ["schedule", sel]]) {
  ok(`no tier wording in the ${name}`, !tierWords.some((t) => flat(doc).includes(t)));
  ok(`no staff note in the ${name}`, !flat(doc).includes(INTERNAL_NOTE));
  ok(`no pricing assumption wording in the ${name}`, !/pricing assumption/i.test(flat(doc)));
}

section("Tender Scope & Pricing Notes: what the estimator gets (Gate 6.2)");
ok("it is registered as internal", REGISTER_DOC_TYPES.tender_scope_notes.audience === "internal");
ok("included work is listed", sectionOf("Existing works and demolition")?.rows.some((r) => /Walls/.test(r.text)));
ok("excluded and by others are separate", sectionOf("Excluded or deferred")?.rows.some((r) => /Pool/.test(r.text)) && sectionOf("By others or client supplied")?.rows.some((r) => /Fencing/.test(r.text)));
ok("each system is its own line", sectionOf("Construction systems and materials")?.rows.filter((r) => /Render|Fibre/i.test(r.text)).length === 2);
ok("facts are facts", sectionOf("Site and household facts")?.rows.every((r) => r.status === "Fact") && sectionOf("Site and household facts").rows.some((r) => /Narrow/.test(r.text)));
ok("a fact isn't in the included work", !flat(sectionOf("Included work") || {}).includes("Narrow"));
ok("risks carry their next step and owner", sectionOf("Existing-condition risks")?.rows.some((r) => /Footings/.test(r.text) && /Next: Open up/.test(r.note)));
ok("technical questions are listed", sectionOf("Technical questions")?.rows.some((r) => /Render/.test(r.text)));
const assumptions = sectionOf("Blue Leaf pricing assumptions");
ok("assumptions are labelled and say what they cover", assumptions?.rows.some((r) => /Kitchen/.test(r.area) && /Assumption/.test(r.status) && /cabinetry/.test(r.note)), flat(assumptions));
ok("draft wording says so", assumptions?.rows.every((r) => /draft/.test(r.status)));
ok("review suggestions are marked", sectionOf("Performance goals for review")?.rows.every((r) => r.status === "Review required"));
ok("drawing references are there", sectionOf("Drawing references")?.rows.some((r) => /Concept A Rev 2/.test(r.text)) && sectionOf("Drawing references").rows.some((r) => /A101/.test(r.text)));
ok("register rows carry source item ids", sectionOf("Construction systems and materials").rows.every((r) => r.itemId));
ok("the staff note is available here", flat(notes.tenderNotes).includes(INTERNAL_NOTE));
ok("no quantity, even when one was measured", !/\b42\b|m2/.test(flat(notes.tenderNotes)));
ok("no amounts", !/\$\s?\d/.test(flat(notes.tenderNotes)));

section("Audit fixes");
const kitchenLine = assumptions.rows.find((r) => /Kitchen/.test(r.area));
ok("the assumption doesn't describe the benchtop that was chosen (R05-05)", !/bench/i.test(kitchenLine.text) && /cabinetry/i.test(kitchenLine.text), kitchenLine.text);
const checkReq = mk("W-022", { itemKind: "requirement", certainty: "client_approved", evidence: { at: "2026-11-10", by: "Staff" }, description: "Steel beam over the new opening", technicalStatus: "needs_verification" });
const plainReq = mk("W-022", { itemKind: "requirement", certainty: "client_approved", evidence: { at: "2026-11-10", by: "Staff" }, description: "Keep the existing fireplace" });
const archCheck = buildRegisterFixture("architect_brief", { ...input(), register: { ...register, items: [...items, checkReq, plainReq] } }).architectBrief.confirmedReqs;
ok("a client-approved requirement still needing a technical check says so (Tab 26 DOC-02)", archCheck.some((l) => /Steel beam over the new opening \(technical check pending\)$/.test(l)), flat(archCheck));
ok("one with no open check reads as before", archCheck.some((l) => /Keep the existing fireplace$/.test(l)), flat(archCheck));
ok("schedule rows carry the room and the item separately, for the client presentation", sel.selections.every((r) => typeof r.where === "string" && r.item && r.category.startsWith(r.where.replace(/ \((project default|room exception)\)$/, ""))), flat(sel.selections.slice(0, 2)));
// An item reference must never read as placeholder text: "W014-XXX" blocked issuing (found by sandbox-register-structured).
{
  const { refCode } = await import("../../src/lib/register.js");
  const { PLACEHOLDER_RX } = await import("../../server/lib/documents/documentPayloads.mjs");
  let hits = 0, seen = 0, changedOthers = 0;
  const fnv = (id) => { let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36).toUpperCase().slice(-3).padStart(3, "0"); };
  for (let n = 0; n < 200000; n++) {
    const id = `ri_${n.toString(36)}`;
    const raw = fnv(id), ref = refCode({ id, promptKey: "W-014" });
    if (/^(XXX|TBD)$/.test(raw)) { seen += 1; if (PLACEHOLDER_RX.test(ref)) hits += 1; }
    else if (ref !== `W014-${raw}`) changedOthers += 1;
  }
  ok("no item reference reads as a placeholder, and every other reference is unchanged", seen > 0 && hits === 0 && changedOthers === 0, JSON.stringify({ seen, hits, changedOthers }));
}
const viteConfig = fs.readFileSync(join(REPO, "vite.config.js"), "utf8");
ok("the service worker leaves stored-file links alone (R05-01)", /navigateFallbackDenylist:[^\n]*\\\/sb/.test(viteConfig));

section("Pre-issue checks");
const check = (doc, reg = register, extra = {}) => registerDocChecks("tender_scope_notes", doc, { register: reg, recipientName: "Blue Leaf estimating", mode: "issue", ...extra });
ok("a good set passes", check(notes).errors.length === 0, flat(check(notes)));
const dollarReg = { ...register, items: [...items, mk("W-022", { description: "Allow $5000 for appliances" })] };
ok("a dollar figure blocks it, as for every document", check(buildRegisterFixture("tender_scope_notes", { ...input(), register: dollarReg }), dollarReg).errors.some((e) => /dollar/.test(e)));
const noRev = { ...register, meta: emptyMeta({ ...register.meta, planRev: "" }) };
ok("no drawing revision blocks it", check(buildRegisterFixture("tender_scope_notes", { ...input(), register: noRev }), noRev).errors.some((e) => /drawing/.test(e)));
const empty = { meta: emptyMeta({ planRev: "A" }), items: [] };
ok("drawings alone isn't a document", check(buildRegisterFixture("tender_scope_notes", { ...input(), register: empty }), empty).errors.some((e) => /nothing in the register/.test(e)));
ok("no recipient blocks it", registerDocChecks("tender_scope_notes", notes, { register, recipientName: "", mode: "issue" }).errors.some((e) => /issued to/.test(e)));

section("Old records and rendering");
const legacy = { meta: emptyMeta({ planRev: "A", rooms: [kitchen] }), items: [makeItem({ itemKind: "selection", promptKey: "K-005", category: "benchtop", roomId: kitchen.id, description: "Marble bench", certainty: "preference" }), makeItem({ itemKind: "scope", promptKey: "R-003", category: "scope", roomId: kitchen.id, description: "New kitchen", disposition: "new" })] };
const lf = buildRegisterFixture("client_brief", { ...input(), register: legacy });
ok("older typed records print unchanged", /Marble bench/.test(flat(lf.clientBrief.preferences)) && lf.clientBrief.scopeIn.some((l) => /New kitchen/.test(l.text)));
const out = await renderRegisterDocument("tender_scope_notes", buildRegisterFixture("tender_scope_notes", input("Draft")), {});
ok("it renders to DOCX and PDF", out.docx.length > 5000 && out.pdf.length > 5000 && out.pdf.slice(0, 4).toString() === "%PDF");
ok("no unfilled tag or empty value", out.leaks.length === 0, out.leaks.join());
ok("it uses its own template", out.template.key === "tender_scope_notes");
const tpl = fs.readFileSync(join(REPO, "public/templates", DOC_DEFS.client_brief.templateFile));
const payload = DOC_DEFS.client_brief.build(brief);
const r1 = renderDocxTemplate(tpl, payload);
await new Promise((r) => setTimeout(r, 2200));
ok("the same input gives the same bytes, two seconds apart (the documents-r01 T10 flake)", Buffer.compare(r1, renderDocxTemplate(tpl, payload)) === 0);

console.log(`\nregister-documents-structured: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
