/**
 * register-project-step.test.mjs — the rules behind the register's "The project" step (REGISTER_SCREENS_SPEC.md S1):
 * src/lib/projectStory.js on the anonymised REAL job (scripts/documents/fixtures/real-extension-job.mjs) and on small
 * made-up records. Budget band chips (one tap writes both figures, a second tap clears), the exact range, "Confirmed with
 * the client", the target start, the lead PATCH check (Paying by, amounts, dates), Top priorities from earlier words,
 * the gap strip, Site and planning in plain words, and the design team (job_contact_roles + consultant_roster merged,
 * deduped, and kept in step). Also: the story facts are registered on the Lead spine. Then the real ProjectStep,
 * StoryFields, DesignTeamCard and NameArchitectPanel rendered to a string (esbuild, no browser). No database, no network.
 *
 *   node scripts/tests/register-project-step.test.mjs
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import {
  bandOf, budgetChoice, bandPatch, exactLabel, exactPatch, parseMoney, moneyText, budgetConfirmedOn, confirmedNoteOf, BUDGET_CONFIRMED_TEXT,
  startParts, startValue, startYears, MONTH_NAMES, normaliseStoryPatch, prioritiesFromNote, projectGaps, siteRows, siteSummary,
  mergeConsultants, rosterAdd, rosterRemove, rosterNeedsRole, sameDiscipline, storageRolesFor, teamRows, contactLabel, splitName,
  searchWords, contactMatches, STORY_COLUMNS, BUDGET_FIELD_KEYS, STORY_FIELD_KEYS, PHONE_MORE_KEYS, DESIGN_TEAM_ROLES, OTHER_CONSULTANT_ROLES,
} from "../../src/lib/projectStory.js";
import { BUDGET_BANDS, budgetLine, designTeam, namedArchitect } from "../../src/lib/briefModel.js";
import { answerConfigFor, makeItem, emptyMeta } from "../../src/lib/register.js";
import { LEAD_FINANCE_STATUS_LABELS } from "../../src/lib/constants.js";
import { FACT_REGISTRY } from "../../server/lib/jobFactRegistry.mjs";
import { realJob } from "../documents/fixtures/real-extension-job.mjs";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 700)}` : ""}`); } };
const section = (t) => console.log(`\n${t}`);
const flat = (o) => JSON.stringify(o);
const eq = (a, b) => flat(a) === flat(b);
const load = (tweak) => { const j = realJob(); tweak?.(j); return { ...j, register: { meta: emptyMeta(j.register.meta), items: j.register.items.map((i) => makeItem(i)) } }; };

// ── 1 · Budget band chips ────────────────────────────────────────────────────────────────────────────
section("Budget band chips (ex GST)");
ok("six bands, in the agreed order", eq(BUDGET_BANDS.map((b) => b.label), ["Under $400k", "$400k–$600k", "$600k–$800k", "$800k–$1m", "$1m–$1.5m", "Over $1.5m"]));
ok("one tap writes both figures for a middle band", eq(bandPatch("800_1m", null, null), { construction_budget_min: 800000, construction_budget_max: 1000000 }));
ok("'Under $400k' writes no lower figure", eq(bandPatch("under_400", null, null), { construction_budget_min: null, construction_budget_max: 400000 }));
ok("'Over $1.5m' writes no upper figure", eq(bandPatch("over_1_5m", null, null), { construction_budget_min: 1500000, construction_budget_max: null }));
ok("a second tap on the chosen band clears both", eq(bandPatch("800_1m", 800000, 1000000), { construction_budget_min: null, construction_budget_max: null }));
ok("a second tap on 'Over $1.5m' clears both", eq(bandPatch("over_1_5m", 1500000, null), { construction_budget_min: null, construction_budget_max: null }));
ok("tapping another band moves to it (no clearing)", eq(bandPatch("1m_1_5m", 800000, 1000000), { construction_budget_min: 1000000, construction_budget_max: 1500000 }));
ok("an unknown band writes nothing", bandPatch("nope", 1, 2) === null);
ok("amounts are numbers, never strings", Object.values(bandPatch("400_600", null, null)).every((v) => typeof v === "number"));
ok("bandOf finds the band a stored range is", bandOf(600000, 800000)?.key === "600_800");
ok("bandOf reads stored strings from the database as numbers", bandOf("600000", "800000")?.key === "600_800");
ok("zero counts as no figure (as budgetWords)", bandOf(0, 400000)?.key === "under_400" && bandOf(0, 0) === null);
ok("every band's chip comes back as that band", BUDGET_BANDS.every((b) => budgetChoice(b.min, b.max).key === b.key));

section("Exact range");
ok("nothing stored → no chip chosen", eq(budgetChoice(null, null), { kind: "none", key: null, label: "" }));
const exact = budgetChoice(850000, 950000);
ok("a range that matches no band shows a chosen 'Exact: $… – $…' chip", exact.kind === "exact" && exact.label === "Exact: $850,000 – $950,000", flat(exact));
ok("a lower figure on its own reads 'Exact: from …'", budgetChoice(850000, null).label === "Exact: from $850,000");
ok("an upper figure on its own (not a band) reads 'Exact: up to …'", budgetChoice(null, 950000).label === "Exact: up to $950,000");
ok("exactLabel with nothing is blank", exactLabel(null, null) === "");
ok("moneyText rounds and groups", moneyText(849999.6) === "$850,000" && moneyText(null) === "");
ok("parseMoney: 850,000 / $850k / 1.2m", parseMoney("850,000").value === 850000 && parseMoney("$850k").value === 850000 && parseMoney("1.2m").value === 1200000);
ok("parseMoney: blank is no figure", parseMoney("  ").value === null && !parseMoney("").error);
ok("parseMoney: words are refused in plain English", /Type an amount/.test(parseMoney("about a million").error || ""));
ok("From and To write both columns", eq(exactPatch("850k", "950,000").patch, { construction_budget_min: 850000, construction_budget_max: 950000 }));
ok("From more than To is refused", /more than/.test(exactPatch("1m", "900k").error || ""));
ok("blank From and To clear the budget", eq(exactPatch("", "").patch, { construction_budget_min: null, construction_budget_max: null }));
ok("an exact range that IS a band reads as the band", budgetChoice(...Object.values(exactPatch("400k", "600k").patch)).key === "400_600");

section("Confirmed with the client");
ok("the toggle writes a plain 'Yes'", BUDGET_CONFIRMED_TEXT === "Yes" && budgetConfirmedOn("Yes"));
ok("free text from Sales that names a figure counts as confirmed", budgetConfirmedOn("$1.3M–$1.5M approved finance"));
ok("'no', 'TBC', 'not yet', '-' and blank do not", ["no", "No.", "TBC", "not yet", "-", "", null, "to be confirmed"].every((t) => !budgetConfirmedOn(t)));
ok("a boolean passes through", budgetConfirmedOn(true) && !budgetConfirmedOn(false));
ok("words beyond a plain yes stay visible under the toggle", confirmedNoteOf("$1.3M–$1.5M approved finance") === "$1.3M–$1.5M approved finance" && confirmedNoteOf("Yes") === "" && confirmedNoteOf("confirmed") === "");
const confirmedCtx = { budget: { min: 800000, max: 1000000, confirmed: budgetConfirmedOn("Yes") } };
ok("the brief prints the band only once confirmed (owner decision 1)", budgetLine(confirmedCtx) === "$800k–$1m construction budget, ex GST (the client's figure)." && budgetLine({ budget: { ...confirmedCtx.budget, confirmed: budgetConfirmedOn("no") } }) === "");

// ── 2 · Target start ────────────────────────────────────────────────────────────────────────────────
section("Target start (month + year, stored as YYYY-MM-01)");
ok("the real job's start reads April 2027", eq(startParts(realJob().context.budget.desiredStart), { year: 2027, month: 4 }) && MONTH_NAMES[3] === "April");
ok("a full date still reads its month", eq(startParts("2027-11-23"), { year: 2027, month: 11 }));
ok("nothing stored reads as nothing", eq(startParts(null), { year: null, month: null }));
ok("April 2027 → 2027-04-01", startValue(4, 2027) === "2027-04-01" && startValue("4", "2027") === "2027-04-01");
ok("December pads, January pads", startValue(12, 2028) === "2028-12-01" && startValue(1, 2026) === "2026-01-01");
ok("nothing is written until both are chosen", startValue("", 2027) === null && startValue(4, "") === null);
ok("a month out of range writes nothing", startValue(13, 2027) === null && startValue(0, 2027) === null);
const years = startYears(new Date("2026-11-17T00:00:00+10:30"));
ok("years offered: this year and the next four", eq(years, [2026, 2027, 2028, 2029, 2030]), flat(years));
ok("a stored year outside the range is still offered", startYears(new Date("2026-11-17T00:00:00+10:30"), 2032).includes(2032));
ok("what the screen writes passes the lead PATCH check", normaliseStoryPatch({ desired_start_date: startValue(4, 2027) }).updates?.desired_start_date === "2027-04-01");

// ── 3 · The lead PATCH check ─────────────────────────────────────────────────────────────────────────
section("Lead PATCH: Paying by, amounts and dates (server side)");
for (const k of Object.keys(LEAD_FINANCE_STATUS_LABELS)) ok(`"${k}" is a known Paying by`, normaliseStoryPatch({ finance_status: k }).updates?.finance_status === k);
const badPay = normaliseStoryPatch({ finance_status: "bitcoin" });
ok("an unknown Paying by is refused, in plain English, naming the choices", !!badPay.error && badPay.error.includes("Cash") && badPay.error.includes("Pre-approved") && !/finance_status/.test(badPay.error), badPay.error);
ok("a blank Paying by clears it", normaliseStoryPatch({ finance_status: "" }).updates.finance_status === null && normaliseStoryPatch({ finance_status: null }).updates.finance_status === null);
ok("a body without Paying by is untouched", !("finance_status" in normaliseStoryPatch({ name: "X" }).updates));
ok("budget figures as numbers pass", eq(normaliseStoryPatch({ construction_budget_min: 800000, construction_budget_max: 1000000 }).updates, { construction_budget_min: 800000, construction_budget_max: 1000000 }));
ok("a numeric string from an older form is stored as a number", normaliseStoryPatch({ construction_budget_min: "800000" }).updates?.construction_budget_min === 800000);
ok("words or a negative figure are refused", !!normaliseStoryPatch({ construction_budget_max: "about 1m" }).error && !!normaliseStoryPatch({ construction_budget_min: -5 }).error);
ok("lower more than upper (in one save) is refused", !!normaliseStoryPatch({ construction_budget_min: 1000000, construction_budget_max: 800000 }).error);
ok("one figure on its own is never cross-checked (Sales saves min and max separately)", !normaliseStoryPatch({ construction_budget_min: 1500000 }).error);
ok("a blank figure clears it", normaliseStoryPatch({ construction_budget_max: "" }).updates.construction_budget_max === null);
ok("a date passes, a non-date is refused", !normaliseStoryPatch({ desired_start_date: "2027-04-01" }).error && !!normaliseStoryPatch({ desired_start_date: "April" }).error && !!normaliseStoryPatch({ desired_start_date: "2027-13-01" }).error);
ok("blank story text is stored as nothing", normaliseStoryPatch({ wo_client_vision: "   " }).updates.wo_client_vision === null);
ok("story text is kept as typed", normaliseStoryPatch({ key_requirements: "Open plan\nNorth light " }).updates.key_requirements === "Open plan\nNorth light ");
ok("other columns pass through untouched", normaliseStoryPatch({ stage: "consultants", notes: "x" }).updates.stage === "consultants");

section("Story fields: columns and groups");
ok("each field writes its lead column", eq(STORY_COLUMNS, { vision: "wo_client_vision", must_haves: "key_requirements", concern: "wo_biggest_concern", excited: "wo_most_excited_about", confirmed: "wo_budget_confirmed", paying: "finance_status", start: "desired_start_date" }));
ok("BUDGET_FIELD_KEYS is the 'Budget and timing' group", eq(BUDGET_FIELD_KEYS, ["budget", "confirmed", "paying", "start"]));
ok("the contract's field keys are all known", ["vision", "must_haves", "concern", "priorities", "budget", "confirmed", "paying", "start", "excited"].every((k) => STORY_FIELD_KEYS.includes(k)));
ok("phone: vision, must-haves, budget and start stay out; four sit behind 'More about the client'", PHONE_MORE_KEYS.filter((k) => k !== "excited").length === 4 && !["vision", "must_haves", "budget", "start"].some((k) => PHONE_MORE_KEYS.includes(k)));

section("Story facts are registered on the Lead spine (Canonical Data Law)");
const LEAD_STORY = { client_vision: "wo_client_vision", key_requirements: "key_requirements", client_concern: "wo_biggest_concern", client_excited_about: "wo_most_excited_about",
  construction_budget_min: "construction_budget_min", construction_budget_max: "construction_budget_max", budget_confirmed: "wo_budget_confirmed", finance_status: "finance_status", desired_start_date: "desired_start_date" };
for (const [key, column] of Object.entries(LEAD_STORY)) {
  const def = FACT_REGISTRY.find((f) => f.key === key);
  ok(`${key} → leads.${column}, lead spine, versioned`, def?.spine === "lead" && def.store?.table === "leads" && def.store.column === column && def.type === "versioned", flat(def));
}
ok("each story column is registered once", Object.values(LEAD_STORY).every((c) => FACT_REGISTRY.filter((f) => f.store?.table === "leads" && f.store.column === c).length === 1));
ok("money facts are consequential (they print in the brief)", ["construction_budget_min", "construction_budget_max", "budget_confirmed"].every((k) => FACT_REGISTRY.find((f) => f.key === k).tier === "consequential"));

// ── 4 · Top priorities from the earlier words ───────────────────────────────────────────────────────
section("Top priorities: 'Use these'");
const P5 = answerConfigFor("P-005");
const p1 = prioritiesFromNote("Natural light, Space", P5.options, [], P5.max);
ok("the real job's 'Natural light, Space' ticks both chips and leaves nothing", eq(p1.add, ["natural_light", "space"]) && p1.rest === "", flat(p1));
const p2 = prioritiesFromNote("natural light and a big pool; storage", P5.options, [], 3);
ok("words that match no chip stay in the note", eq(p2.add, ["natural_light", "storage"]) && p2.rest === "a big pool", flat(p2));
const p3 = prioritiesFromNote("Space, Privacy, Comfort, Storage", P5.options, ["energy_use"], 3);
ok("never more than three chosen; the ones that don't fit stay in the note", eq(p3.add, ["space", "privacy"]) && p3.rest === "Comfort, Storage", flat(p3));
const p4 = prioritiesFromNote("Space", P5.options, ["space"], 3);
ok("a word already ticked is taken out of the note", p4.add.length === 0 && p4.rest === "", flat(p4));
ok("nothing noted → nothing to do", eq(prioritiesFromNote("", P5.options, [], 3), { add: [], rest: "" }));

// ── 5 · The gap strip ───────────────────────────────────────────────────────────────────────────────
section("Gaps for the architect's brief (R1)");
const { register: realReg, context: realCtx } = load();
const gaps = projectGaps(realReg, realCtx);
ok("the real job: vision · must-haves · budget · the architect's name (4 gaps, as drawn)", eq(gaps.map((g) => g.label), ["the client's vision", "must-haves", "budget", "the architect's name"]), flat(gaps));
ok("each gap has the key the field answers to", eq(gaps.map((g) => g.key), ["vision", "must_haves", "budget", "architect"]));
const filled = load((j) => {
  j.context.goals.vision = "A light-filled family home"; j.context.goals.keyRequirements = "Three bedrooms";
  j.context.budget.min = 800000; j.context.budget.max = 1000000;
  j.context.consultants = [{ role: "architect", name: "Ava Arch", company: "Arch Studio", status: "active" }];
});
ok("a gap leaves the strip once its field is saved; the strip is empty at zero", projectGaps(filled.register, filled.context).length === 0, flat(projectGaps(filled.register, filled.context)));
const noBudgetOnly = load((j) => { j.context.goals.vision = "V"; j.context.goals.keyRequirements = "K"; });
ok("a budget alone missing still shows (and only it, plus the architect)", eq(projectGaps(noBudgetOnly.register, noBudgetOnly.context).map((g) => g.key), ["budget", "architect"]));
const noPlan = load((j) => { j.register.meta.planRev = ""; });
ok("no drawing set → 'the drawing set' joins the strip", projectGaps(noPlan.register, noPlan.context).some((g) => g.key === "planRev" && g.label === "the drawing set"));
ok("no context yet → no strip", projectGaps(realReg, null).length === 0);
ok("an inactive architect is not a named one", eq(projectGaps(filled.register, { ...filled.context, consultants: [{ role: "architect", name: "Ava", status: "inactive" }] }).map((g) => g.key), ["architect"]));

// ── 6 · Site and planning ───────────────────────────────────────────────────────────────────────────
section("Site and planning (R4)");
const rows = siteRows(realCtx.site, "Standard driveway");
const row = (k, list = rows) => list.find((r) => r.key === k);
ok("six rows: council · zone · bushfire · slope · complexity · access", eq(rows.map((r) => r.label), ["Council", "Planning zone", "Bushfire", "Slope", "Site complexity", "Access"]));
ok("council in capitals reads as a name ('City of Seaview')", row("council").text === "City of Seaview", row("council").text);
ok("a mapped bushfire area: the chip, then 'BAL to be assessed'", row("bushfire").chip === "In a mapped bushfire area" && row("bushfire").text === "BAL to be assessed");
ok("a missing slope reads 'Not known', muted", row("slope").text === "Not known" && row("slope").muted);
ok("complexity in plain words", row("complexity").text === "High");
ok("the access answer is a link to its record", row("access").text === "Standard driveway" && row("access").link);
const nullFire = siteRows({ ...realCtx.site, bushfire: null });
ok("a null bushfire value reads 'Not confirmed', never 'not bushfire-prone'", row("bushfire", nullFire).text === "Not confirmed" && !/not .*bushfire/i.test(row("bushfire", nullFire).text));
ok("false reads 'Not in a mapped bushfire area'", row("bushfire", siteRows({ bushfire: false })).text === "Not in a mapped bushfire area");
ok("no access answer reads 'Not recorded'", row("access", siteRows({})).text === "Not recorded" && !row("access", siteRows({})).link);
ok("the phone's one-line summary", siteSummary(realCtx.site) === "City of Seaview · Hills Neighbourhood · Bushfire area · High complexity", siteSummary(realCtx.site));
ok("nothing from mapping yet", siteSummary({}) === "Nothing from public mapping yet" && siteSummary(null) === "Nothing from public mapping yet");
ok("a council with no bushfire answer says so", siteSummary({ council: "CITY OF MARION" }) === "City of Marion · Bushfire not confirmed");

// ── 7 · The design team: roles + roster merged ──────────────────────────────────────────────────────
section("Design team: storage roles");
ok("an architect is stored as architect", eq(storageRolesFor("architect"), { dbRole: "architect", rosterRole: "architect", contactType: "architect" }));
ok("a designer is a designer row on the architect's roster line", eq(storageRolesFor("designer"), { dbRole: "designer", rosterRole: "architect", contactType: "designer" }));
ok("an energy assessor is stored as 'consultant', the discipline on the roster", eq(storageRolesFor("energy"), { dbRole: "consultant", rosterRole: "energy", contactType: "other" }));
ok("land surveyor, soil, lighting, sanitary: 'consultant' rows", ["land_surveyor", "soil_geotech", "lighting", "sanitary"].every((r) => storageRolesFor(r).dbRole === "consultant" && storageRolesFor(r).rosterRole === r));
ok("every role the card offers is storable", [...OTHER_CONSULTANT_ROLES, "architect", "engineer", "energy"].every((r) => storageRolesFor(r) && DESIGN_TEAM_ROLES[r]));
ok("a role the card doesn't take is refused", storageRolesFor("referrer") === null && storageRolesFor("") === null);
ok("only roles the database allows are written", [...Object.keys(DESIGN_TEAM_ROLES)].every((r) => ["referrer", "consultant", "architect", "designer", "interior_designer", "agent", "engineer", "other"].includes(storageRolesFor(r).dbRole)));
ok("architect ~ designer; consultant ~ energy; energy ≠ land surveyor; other ≠ consultant", sameDiscipline("designer", "architect") && sameDiscipline("consultant", "energy")
  && !sameDiscipline("energy", "land_surveyor") && !sameDiscipline("other", "consultant") && !sameDiscipline("architect", "interior_designer") && !sameDiscipline(null, "architect"));

section("Design team: merge and dedupe");
const ARCH = "c-arch", ENG = "c-eng", NRG = "c-nrg", SURV = "c-surv";
const contact = (first, last, company, extra = {}) => ({ first_name: first, last_name: last, company, email: `${first.toLowerCase()}@example.test`, phone: null, ...extra });
const roleRows = [
  { id: "r1", role: "architect", status: "active", contact_id: ARCH, contact: contact("Ava", "Arch", "Arch Studio") },
  { id: "r1j", role: "architect", status: "inactive", contact_id: ARCH, contact: contact("Ava", "Arch", "Arch Studio") },   // the job copy
  { id: "r2", role: "consultant", status: "active", contact_id: NRG, contact: contact("Nora", "Watts", "Star Ratings") },
  { id: "r3", role: "consultant", status: "active", contact_id: SURV, contact: contact("Sam", "Level", "Level Survey") },
  { id: "r9", role: "referrer", status: "active", contact_id: "c-ref", contact: contact("Rex", "Ref", null) },
];
const roster = [
  { role: "architect", contactId: ARCH, deliverables: [] },
  { role: "energy", contactId: NRG, deliverables: [] },
  { role: "land_surveyor", contactId: SURV, deliverables: [] },
  { role: "soil_geotech", contactId: SURV, deliverables: [] },          // the surveyor does the soil report too
  { role: "engineer", contactId: ENG, deliverables: [] },               // on the roster only
  { role: "engineer", contactId: ENG, deliverables: [] },               // the same line twice
  { role: "lighting", contactId: "", deliverables: [] },                // an empty slot
  { role: "other", name: "Old Name-only Consultant" },                  // an older roster entry with a name and no contact
];
const merged = mergeConsultants(roleRows, roster, { [ENG]: contact("Eli", "Beam", "Beam Engineers") });
const byRole = (r) => merged.filter((c) => c.role === r);
ok("the architect is listed once (lead row and job row are one person), active", byRole("architect").length === 1 && byRole("architect")[0].status === "active" && byRole("architect")[0].roleId === "r1", flat(byRole("architect")));
ok("every entry carries its contactId and roleId", merged.filter((c) => c.source === "role").every((c) => c.contactId && c.roleId));
ok("a 'consultant' row reads as the roster's discipline (energy)", byRole("energy").length === 1 && byRole("energy")[0].roleId === "r2" && byRole("energy")[0].name === "Nora Watts");
ok("a second discipline under one shared row is its own entry, with the row and the person's details", byRole("soil_geotech").length === 1 && byRole("soil_geotech")[0].roleId === "r3"
  && byRole("soil_geotech")[0].company === "Level Survey" && byRole("land_surveyor")[0].roleId === "r3", flat(merged.filter((c) => c.contactId === SURV)));
ok("a roster-only person is read from their contact, once", byRole("engineer").length === 1 && byRole("engineer")[0].name === "Eli Beam" && byRole("engineer")[0].roleId === null && byRole("engineer")[0].contactId === ENG);
ok("an empty slot is not a person", byRole("lighting").length === 0);
ok("an older name-only roster entry still shows", merged.some((c) => c.name === "Old Name-only Consultant" && c.role === "other"));
ok("referrers and agents are not the design team", !merged.some((c) => c.contactId === "c-ref"));
ok("the named architect reads '<Name> — <Firm>'", contactLabel(namedArchitect({ consultants: merged })) === "Ava Arch — Arch Studio");
const onlyInactive = mergeConsultants([{ id: "x", role: "architect", status: "inactive", contact_id: ARCH, contact: contact("Ava", "Arch", "Arch Studio") }], [{ role: "architect", contactId: ARCH }]);
ok("an inactive role stays in the list but is never shown or printed", onlyInactive.length === 1 && designTeam({ consultants: onlyInactive }).length === 0 && namedArchitect({ consultants: onlyInactive }) === null);
const t = teamRows({ consultants: merged });
ok("the card's rows: architect, engineer, energy assessor, then the others", t.architect?.contactId === ARCH && t.engineer?.contactId === ENG && t.energy?.contactId === NRG
  && eq(t.others.map((c) => c.role).sort(), ["land_surveyor", "other", "soil_geotech"]), flat(t.others));
ok("the real job has nobody named yet", teamRows(realCtx).architect === null && teamRows(realCtx).others.length === 0);

section("Design team: keeping the roster in step");
const NOW = "2026-11-17T01:00:00.000Z";
const added = rosterAdd([], { contactId: ARCH, rosterRole: "architect" }, NOW);
ok("naming someone new adds a roster line with the discipline's documents", added.length === 1 && added[0].contactId === ARCH && added[0].deliverables.map((d) => d.key).join() === "working_drawings,site_plan" && added[0].deliverables.every((d) => d.status === "pending"));
ok("naming them again changes nothing", eq(rosterAdd(added, { contactId: ARCH, rosterRole: "architect" }, NOW), added));
const slot = rosterAdd([{ role: "engineer", contactId: "", deliverables: [{ key: "structural_drawings", status: "requested" }] }], { contactId: ENG, rosterRole: "engineer" }, NOW);
ok("an empty slot for the discipline is filled (its documents kept)", slot.length === 1 && slot[0].contactId === ENG && slot[0].deliverables[0].status === "requested");
const worked = [{ role: "architect", contactId: ARCH, briefIssuedAt: "2026-11-01", deliverables: [{ key: "working_drawings", status: "received" }] }];
const changed = rosterAdd(worked, { contactId: "c-new", rosterRole: "architect", replacesContactId: ARCH }, NOW);
ok("'Change' puts the new person in the old one's place, keeping the documents", changed.length === 1 && changed[0].contactId === "c-new" && changed[0].deliverables[0].status === "received");
const both = rosterAdd([{ role: "land_surveyor", contactId: SURV, deliverables: [] }], { contactId: SURV, rosterRole: "soil_geotech" }, NOW);
ok("a second discipline for the same person never overwrites the first", eq(both.map((e) => e.role), ["land_surveyor", "soil_geotech"]));
ok("removing an untouched line removes it", rosterRemove(added, { contactId: ARCH, rosterRole: "architect" }, NOW).length === 0);
const kept = rosterRemove(worked, { contactId: ARCH, rosterRole: "architect" }, NOW);
ok("removing a line with work on it keeps its place and documents, with nobody named", kept.length === 1 && kept[0].contactId === "" && kept[0].previousContactId === ARCH && kept[0].deliverables[0].status === "received", flat(kept));
ok("…and the next person named fills that place", eq(rosterAdd(kept, { contactId: "c-next", rosterRole: "architect" }, NOW).map((e) => [e.contactId, e.deliverables[0].status]), [["c-next", "received"]]));
const two = [{ role: "land_surveyor", contactId: SURV }, { role: "soil_geotech", contactId: SURV }];
const minusSoil = rosterRemove(two, { contactId: SURV, rosterRole: "soil_geotech" }, NOW);
ok("removing one discipline leaves the person's other one", eq(minusSoil.map((e) => e.role), ["land_surveyor"]));
ok("…so their shared 'consultant' row is still needed", rosterNeedsRole(minusSoil, SURV, "consultant"));
ok("…until the last one goes", !rosterNeedsRole(rosterRemove(minusSoil, { contactId: SURV, rosterRole: "land_surveyor" }, NOW), SURV, "consultant"));
ok("an architect row is not kept alive by an engineer line", !rosterNeedsRole([{ role: "engineer", contactId: ARCH }], ARCH, "architect"));
ok("a designer row is the architect's roster line", rosterNeedsRole([{ role: "architect", contactId: ARCH }], ARCH, "designer"));
ok("removing with no person changes nothing", eq(rosterRemove(two, { contactId: null }, NOW), two));
ok("rosters that aren't lists are read as empty", eq(rosterAdd(null, { contactId: ENG, rosterRole: "engineer" }, NOW).map((e) => e.contactId), [ENG]) && eq(rosterRemove(undefined, { contactId: ENG }), []));
const rt = mergeConsultants([{ id: "r1", role: "architect", status: "active", contact_id: ARCH, contact: contact("Ava", "Arch", "Arch Studio") }], added);
ok("after a save the merged list has the architect once", rt.length === 1 && rt[0].rosterRole === "architect");

section("Search and new contacts");
ok("search words lose characters that would break the query", eq(searchWords("Smith, (Arch)* %_ \"x\""), ["Smith", "Arch", "x"]));
ok("at most four words", searchWords("a b c d e f").length === 4);
ok("a contact matches when every word is in its name, firm or email", contactMatches(contact("Ava", "Arch", "Arch Studio"), ["ava", "studio"]) && !contactMatches(contact("Ava", "Arch", "Arch Studio"), ["ava", "beam"]));
ok("'Jane van der Berg' splits into first and last", eq(splitName(" Jane  van der Berg "), { first_name: "Jane", last_name: "van der Berg" }) && eq(splitName("Cher"), { first_name: "Cher", last_name: null }));
ok("a firm-only contact reads as the firm", contactLabel({ name: "Arch Studio", company: "Arch Studio" }) === "Arch Studio" && contactLabel({ name: "Ava", company: null }) === "Ava");

// ── Rendered (esbuild → string, no browser) ────────────────────────────────────────────────────────
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REG = join(REPO, "src/components/sales/lead-detail/register");
const dir = mkdtempSync(join(tmpdir(), "register-project-step-"));
const out = join(REPO, "node_modules", ".cache", `register-project-step-${process.pid}.mjs`);
const entry = join(dir, "entry.jsx");
writeFileSync(entry, `
import { renderToStaticMarkup } from "react-dom/server";
import ProjectStep from ${JSON.stringify(join(REG, "ProjectStep.jsx"))};
import StoryFields, { BUDGET_FIELD_KEYS } from ${JSON.stringify(join(REG, "StoryFields.jsx"))};
import DesignTeamCard, { NameArchitectPanel } from ${JSON.stringify(join(REG, "DesignTeamCard.jsx"))};
const noop = () => {};
const store = { patchLead: noop, reloadContext: noop, setDeliveryModel: noop, mutateMeta: noop, upsertItem: noop, updateItem: noop, deleteItem: noop, addItem: noop, saveState: () => ({}) };
export { BUDGET_FIELD_KEYS };
export const step = (props) => renderToStaticMarkup(<ProjectStep stage="consultants" actor={{ id: "u1", role: "staff" }} {...store} {...props} />);
export const story = (props) => renderToStaticMarkup(<StoryFields patchLead={noop} {...props} />);
export const team = (props) => renderToStaticMarkup(<DesignTeamCard reloadContext={noop} {...props} />);
export const panel = (props) => renderToStaticMarkup(<NameArchitectPanel onSaved={noop} {...props} />);
`);
try {
  await build({
    entryPoints: [entry], outfile: out, bundle: true, format: "esm", platform: "node", jsx: "automatic", logLevel: "silent",
    nodePaths: [join(REPO, "node_modules")], external: ["react", "react-dom", "react-dom/server", "react-router-dom"],
    define: { "import.meta.env": "{}" }, loader: { ".png": "empty", ".svg": "empty", ".css": "empty" },
  });
  const R = await import(pathToFileURL(out).href);
  const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&").replace(/\s+/g, " ");
  const codes = (h) => /\b[A-Z]-\d{3}\b/.test(text(h));

  section("Rendered: The project (the real job)");
  const real = load();
  const h = R.step({ reg: real.register, context: real.context, lead: real.lead });
  const tx = text(h);
  ok("the gap strip reads as drawn, with the count", tx.includes("Still missing for the architect's brief:") && /the client's vision · must-haves · budget · the architect's name 4 gaps/.test(tx), tx.slice(0, 400));
  ok("…and the phone one-liner", tx.includes("4 gaps for the architect's brief ›"));
  ok("the identity line: client · site · type · delivery model · PTSA, and 'Change in Sales ›'", /Client · Site address, Seaview Park · Extension · Construction management · PTSA draft Change in Sales ›/.test(tx), tx.slice(0, 600));
  ok("the story card and its caption", tx.includes("The client's story") && tx.includes("Saved to the client's details — Sales shows the same"));
  ok("vision and must-haves carry their gap captions", tx.includes("Not recorded — the architect's brief opens with this.") && tx.includes("Must-haves Not recorded."));
  ok("Top priorities with the earlier words and 'Use these'", tx.includes("Top priorities (pick up to 3)") && tx.includes("Noted earlier: Natural light, Space Use these"));
  ok("the budget chips and 'Exact…'", BUDGET_BANDS.every((b) => tx.includes(b.label)) && tx.includes("Exact…") && tx.includes("Not recorded — the brief will say “to be confirmed by Blue Leaf”."));
  ok("Paying by shows Cash chosen", /aria-pressed="true"[^>]*>(<svg[\s\S]*?<\/svg>)?Cash</.test(h));
  ok("the target start reads April 2027", /<option value="4" selected="">April<\/option>/.test(h) && /<option value="2027" selected="">2027<\/option>/.test(h));
  ok("'+ What they're most excited about' is offered", tx.includes("What they're most excited about"));
  ok("Site and planning in plain words", tx.includes("From public mapping — a guide only. Check before relying on it.") && tx.includes("City of Seaview") && tx.includes("In a mapped bushfire area BAL to be assessed")
    && tx.includes("Slope Not known") && tx.includes("Site complexity High") && tx.includes("Access Standard driveway"), tx);
  ok("'Re-check' is offered only to an admin (the mapping service is admin-only)", !tx.includes("Re-check") && text(R.step({ reg: real.register, context: real.context, lead: real.lead, actor: { role: "admin" } })).includes("Re-check"));
  ok("'During the works': Moving out · Partly lived in ✓ · Living there", /aria-pressed="false"[^>]*>Moving out</.test(h) && /aria-pressed="true"[^>]*>(<svg[\s\S]*?<\/svg>)?Partly lived in</.test(h) && h.includes(">Living there<"));
  ok("the earlier site note, with 'Tidy up'", tx.includes("Earlier note: “not sure if they want to live in - shouldn't -” Tidy up"));
  ok("the design team: Architect not named, 'Name the architect', engineer and energy assessor '+ Add'", tx.includes("Architect Not named Name the architect") && tx.includes("Engineer Not named Add") && tx.includes("Energy assessor Not named Add") && tx.includes("Another consultant"));
  ok("the earlier design note sits in the design team card, with 'Edit'", tx.includes("Noted earlier: “client architect - and blue leaf aid” Edit"));
  ok("the brief's footnote", tx.includes("Until one is named it says “The design team”."));
  ok("Drawings: the basis and the file hint", /id="project-plan-rev"[^>]*value="DA rev 3"/.test(h) && tx.includes("No drawing files with Blue Leaf yet · Upload in Files ›"));
  ok("'Who does what (construction management)' is closed by default", tx.includes("Who does what (construction management)") && /aria-expanded="false"[^>]*>Who does what/.test(h));
  ok("'Decisions before next milestone' shows only with a record", !tx.includes("Decisions before next milestone"));
  ok("no question codes or system words on screen", !codes(h) && !/Sales fact|\blead_id\b|wo_client/.test(tx));
  ok("every gap has a field to land on", ["vision", "must_haves", "budget", "architect", "planRev"].every((k) => h.includes(`data-focus-key="${k}"`)));
  ok("phone inputs are 16 px (no iOS zoom)", (h.match(/<textarea[^>]*class="[^"]*"/g) || []).every((t) => t.includes("text-[16px]")) && /id="project-plan-rev"[^>]*class="[^"]*text-\[16px\]/.test(h));
  ok("phone: 'More about the client (4)'", tx.includes("More about the client (4) ▸"));
  ok("phone: the site summary row and 'Engineer, energy assessor and others ›'", tx.includes("City of Seaview · Hills Neighbourhood · Bushfire area · High complexity") && tx.includes("Engineer, energy assessor and others ›"));

  const ro = R.step({ reg: real.register, context: real.context, lead: real.lead, readOnly: true });
  ok("read-only: values, no inputs", !/<(textarea|input|select)\b/.test(ro) && text(ro).includes("Partly lived in") && text(ro).includes("DA rev 3") && text(ro).includes("April 2027") && text(ro).includes("Cash"), ro.match(/<(textarea|input|select)\b[^>]*>/)?.[0]);
  ok("read-only: no 'Name the architect', 'Tidy up' or 'Use these'", !/Name the architect<|Tidy up<|Use these</.test(ro));

  const withP9 = load((j) => { j.register.items.push({ id: "p9", promptKey: "P-009", itemKind: "action", category: "notes", section: "project", description: "Confirm the stair position" }); });
  ok("'Decisions before next milestone' shows when it holds a record", text(R.step({ reg: withP9.register, context: withP9.context, lead: withP9.lead })).includes("Decisions before next milestone"));
  const dbJob = load((j) => { j.context.deliveryModel = "design_build"; });
  ok("design & build: the management questions are hidden, except one with a record", text(R.step({ reg: dbJob.register, context: dbJob.context, lead: dbJob.lead })).includes("Who does what (design & build)"));
  const dbEmpty = load((j) => { j.context.deliveryModel = "design_build"; j.register.items = j.register.items.filter((i) => !/^M-/.test(i.promptKey || "")); });
  ok("…and nothing at all when none has a record", !text(R.step({ reg: dbEmpty.register, context: dbEmpty.context, lead: dbEmpty.lead })).includes("Who does what"));
  const done = load((j) => {
    j.context.goals.vision = "A light-filled family home"; j.context.goals.keyRequirements = "Three bedrooms";
    j.context.budget.min = 850000; j.context.budget.max = 950000; j.context.site.bushfire = null;
    j.context.consultants = mergeConsultants([{ id: "r1", role: "architect", status: "active", contact_id: "c1", contact: { first_name: "Ava", last_name: "Arch", company: "Arch Studio" } }], []);
  });
  const hd = R.step({ reg: done.register, context: done.context, lead: done.lead });
  ok("no gaps → no strip", !text(hd).includes("Still missing") && !text(hd).includes("for the architect's brief ›"));
  ok("a stored range that is no band shows as a chosen 'Exact' chip", /aria-pressed="true"[^>]*>(<svg[\s\S]*?<\/svg>)?Exact: \$850,000 – \$950,000/.test(hd));
  ok("a null bushfire reads 'Not confirmed'", text(hd).includes("Bushfire Not confirmed"));
  ok("a named architect reads '<Name> — <Firm>' with ⋯", text(hd).includes("Architect Ava Arch — Arch Studio") && hd.includes('aria-label="Options for Ava Arch — Arch Studio"'));
  ok("no context yet → a loading line, no crash", text(R.step({ reg: real.register, context: null, lead: real.lead })).includes("Loading the project"));

  section("Rendered: StoryFields, NameArchitectPanel");
  ok("BUDGET_FIELD_KEYS is exported from StoryFields", eq(R.BUDGET_FIELD_KEYS, ["budget", "confirmed", "paying", "start"]));
  const onlyBudget = text(R.story({ context: real.context, fields: ["budget", "confirmed"] }));
  ok("`fields` limits what shows (the edit drawer's budget)", onlyBudget.includes("Construction budget (ex GST)") && onlyBudget.includes("Confirmed with the client") && !onlyBudget.includes("What they want") && !onlyBudget.includes("Paying by") && !onlyBudget.includes("Budget and timing"));
  const visionOnly = text(R.story({ context: real.context, fields: ["vision"] }));
  ok("…a single story field", visionOnly.includes("What they want, in their words") && !visionOnly.includes("Must-haves"));
  const excited = text(R.story({ context: { ...real.context, goals: { ...real.context.goals, excitedAbout: "The kitchen" } } }));
  ok("the excited line shows once it holds words", excited.includes("What they're most excited about") && /The kitchen/.test(R.story({ context: { ...real.context, goals: { ...real.context.goals, excitedAbout: "The kitchen" } } })));
  const conf = text(R.story({ context: { ...real.context, budget: { ...real.context.budget, confirmed: true, confirmedNote: "$1.3M–$1.5M approved finance" } }, fields: ["confirmed"] }));
  ok("words typed in Sales under 'Confirmed' stay visible", conf.includes("Noted in Sales: “$1.3M–$1.5M approved finance”"));
  ok("no question codes in the story fields", !codes(R.story({ context: real.context })));
  const p = text(R.panel({ lead: real.lead, context: real.context }));
  ok("the name-the-architect sheet: title, search, '+ Add someone new', footnote", p.includes("Name the architect") && /placeholder="Search people and firms"/.test(R.panel({ lead: real.lead, context: real.context })) && p.includes("Add someone new") && p.includes("Saved to the client's contacts — Sales shows the same."));
  ok("the panel names other roles", text(R.panel({ lead: real.lead, context: real.context, role: "engineer" })).includes("Name the engineer"));
  const tm = text(R.team({ lead: real.lead, context: { ...real.context, consultants: merged }, readOnly: true }));
  ok("read-only design team: names, no buttons", tm.includes("Ava Arch — Arch Studio") && tm.includes("Eli Beam — Beam Engineers") && !tm.includes("Name the architect") && !tm.includes("Another consultant"));
  ok("the others follow, in plain words", tm.includes("Land surveyor Sam Level — Level Survey") && tm.includes("Soil and geotech Sam Level — Level Survey"));
} catch (e) {
  ok("the project step renders", false, e?.stack || e);
} finally {
  rmSync(dir, { recursive: true, force: true });
  rmSync(out, { force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
