/**
 * register-project-step.test.mjs — the rules behind the register's "The project" step (REGISTER_SCREENS_SPEC.md S1):
 * src/lib/projectStory.js on the anonymised REAL job (scripts/documents/fixtures/real-extension-job.mjs) and on small
 * made-up records. Budget band chips (one tap writes both figures, a second tap clears), the exact range, "Confirmed with
 * the client", the target start, the lead PATCH check (Paying by, amounts, dates), Top priorities from earlier words,
 * the gap strip, Site and planning in plain words, and the design team (job_contact_roles + consultant_roster merged,
 * deduped, and kept in step). Also: the story facts are registered on the Lead spine. Then the real ProjectStep,
 * StoryFields, DesignTeamCard and NameArchitectPanel rendered to a string (esbuild, no browser). No database, no network.
 * Fixes covered here: only a plain yes confirms the budget (B2); one budget figure against the stored other (N26);
 * "Use these" leaves unmatched words as typed (P10); the site reads from the lead until the job is looked up (M3); Re-check
 * for every staff member, rate-limited (N16); plain errors from the facts service (N25); "+ Add someone new" never links
 * the wrong person or saves twice (N24, M6); the roster written against what is stored (N29); the architect typed in Sales
 * stays visible (M14); "Not named" never cut (N30); no stray separators in the identity line and gap strip (P9).
 * Round 2: a skipped Re-check never says "Updated" (R5; the route itself: register-site-recheck.test.mjs); a no-email
 * save reuses someone only in the same discipline with the same firm, phone or email (R7); a practice named with no
 * person is a firm-only contact, linked to the CRM's (R8); "During the works" segments are 44 px and wrap on a phone (R10).
 * Round 3: a name-only entry saved again (a retry after a lost answer) reuses the name-only contact of that discipline
 * (P2); a firm-only save links the CRM's practice only when the typed email and phone agree, and fills its blanks (P3);
 * the Sales 'Budget confirmed' hint is 12 px (P5).
 * Round 4: a no-email save reuses a "consultant" role row only when the lead's roster has that contact in the same
 * discipline (an energy assessor is never the land surveyor of the same name) (D1); a practice with an email links only a
 * practice, never a person at that firm sharing the office email, and never writes its details onto a person (D2). Both
 * also through the real design-team route (esbuild bundle, an in-memory database stand-in, no network).
 *
 *   node scripts/tests/register-project-step.test.mjs
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import {
  bandOf, budgetChoice, bandPatch, exactLabel, exactPatch, parseMoney, moneyText, budgetConfirmedOn, confirmedNoteOf, BUDGET_CONFIRMED_TEXT,
  startParts, startValue, startYears, MONTH_NAMES, normaliseStoryPatch, prioritiesFromNote, projectGaps, siteRows, siteSummary,
  mergeConsultants, rosterAdd, rosterRemove, rosterNeedsRole, sameDiscipline, storageRolesFor, teamRows, contactLabel, splitName,
  searchWords, contactMatches, STORY_COLUMNS, BUDGET_FIELD_KEYS, STORY_FIELD_KEYS, PHONE_MORE_KEYS, DESIGN_TEAM_ROLES, OTHER_CONSULTANT_ROLES,
  budgetPairError, emailMatch, sameNamedOnJob, firmOnlyName, firmOnlyMatch, phoneKey, conflictWords, contactNameOf, nameKey,
  detailsAgree, detailsToFill, firmShaped,
} from "../../src/lib/projectStory.js";
import { siteSource, siteFacts, recheckDue, RECHECK_MIN_MS } from "../../server/lib/registerContext.mjs";
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
// Only a plain yes counts: a hopeful note in Sales never prints the band (owner decision 1).
const CONFIRMED_TABLE = [
  ["Yes", true], ["yes - approved finance", true], ["Yes, approved finance", true], ["Confirmed", true], ["Confirmed with the client", true],
  ["true", true], ["Y", true], [true, true],
  ["Pending bank approval", false], ["Awaiting finance", false], ["Waiting on broker", false], ["Maybe", false],
  ["Client to confirm after valuation", false], ["$1.3M–$1.5M approved finance", false], ["Not yet", false], ["no", false], ["No.", false],
  ["TBC", false], ["to be confirmed", false], ["Unconfirmed", false], ["Yesterday they said maybe", false], ["-", false], ["", false], [null, false], [false, false],
];
for (const [text, want] of CONFIRMED_TABLE) ok(`${JSON.stringify(text)} reads as ${want ? "confirmed" : "not confirmed"}`, budgetConfirmedOn(text) === want);
const bandCtx = (text) => ({ budget: { min: 800000, max: 1000000, confirmed: budgetConfirmedOn(text) } });
ok("the brief prints the band for a plain yes (owner decision 1)", ["Yes", "yes - approved finance", "Confirmed", true].every((t) => budgetLine(bandCtx(t)) === "$800k–$1m construction budget, ex GST (the client's figure)."));
ok("…and never for a hopeful note or nothing", ["Pending bank approval", "Awaiting finance", "Maybe", "Client to confirm after valuation", "", "no"].every((t) => budgetLine(bandCtx(t)) === ""));
ok("words beyond a plain yes stay visible under the toggle, never rewritten", confirmedNoteOf("Pending bank approval") === "Pending bank approval"
  && confirmedNoteOf("Yes - approved finance") === "Yes - approved finance" && confirmedNoteOf("Yes") === "" && confirmedNoteOf("confirmed") === "");

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
ok("one figure on its own passes the body check (the pair is checked against the stored figure)", !normaliseStoryPatch({ construction_budget_min: 1500000 }).error);
section("Lead PATCH: one budget figure against the stored other (Sales saves them separately)");
const stored = { construction_budget_min: "800000", construction_budget_max: "1000000" };
const minAbove = budgetPairError({ construction_budget_min: 1200000 }, stored);
ok("a lower figure above the stored upper one is refused, in plain English", /lower figure is more than its upper figure \(\$1,000,000\)/.test(minAbove || "") && /Nothing was saved/.test(minAbove), minAbove);
const maxBelow = budgetPairError({ construction_budget_max: 600000 }, stored);
ok("an upper figure below the stored lower one is refused", /upper figure is less than its lower figure \(\$800,000\)/.test(maxBelow || ""), maxBelow);
ok("Sales' min 1,200,000 then max 800,000: the second save is refused", !!budgetPairError({ construction_budget_max: 800000 }, { construction_budget_min: 1200000, construction_budget_max: null }));
ok("a figure inside the stored range passes", budgetPairError({ construction_budget_min: 900000 }, stored) === null && budgetPairError({ construction_budget_max: 900000 }, stored) === null);
ok("equal figures pass", budgetPairError({ construction_budget_min: 1000000 }, stored) === null);
ok("clearing a figure is never checked", budgetPairError({ construction_budget_min: null }, stored) === null);
ok("no stored other figure → nothing to check", budgetPairError({ construction_budget_min: 5000000 }, { construction_budget_max: null }) === null && budgetPairError({ construction_budget_max: 1 }, {}) === null);
ok("both figures in one body are left to normaliseStoryPatch", budgetPairError({ construction_budget_min: 2000000, construction_budget_max: 1000000 }, stored) === null);
ok("a body without budget figures is untouched", budgetPairError({ name: "X" }, stored) === null);
const salesSrc = readFileSync(new URL("../../server/lib/salesRoutes.mjs", import.meta.url), "utf8");
ok("the lead PATCH runs the pair check against the stored lead", /budgetPairError\(body, storedLead\)/.test(salesSrc));
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
ok("only commas, semicolons and new lines separate phrases: the rest stays exactly as typed", eq(p2.add, ["storage"]) && p2.rest === "natural light and a big pool", flat(p2));
const pFlow = prioritiesFromNote("Indoor/outdoor flow and room for the grandkids", P5.options, [], 3);
ok("'Indoor/outdoor flow and room for the grandkids' is left exactly as typed", pFlow.add.length === 0 && pFlow.rest === "Indoor/outdoor flow and room for the grandkids", flat(pFlow));
const pMix = prioritiesFromNote("Natural light; Indoor/outdoor flow & a deck\nSpace", P5.options, [], 3);
ok("matched phrases come out, the rest keeps its own words and separators", eq(pMix.add, ["natural_light", "space"]) && pMix.rest === "Indoor/outdoor flow & a deck", flat(pMix));
const pMid = prioritiesFromNote("a big pool, Space; north light", P5.options, [], 3);
ok("a phrase taken from the middle keeps the separator before the next one", eq(pMid.add, ["space"]) && pMid.rest === "a big pool, north light", flat(pMid));
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

section("Site after conversion: where the rows read from (registerContext.siteSource)");
const leadSite = { site_council: "CITY OF MARION", site_zone: "Hills Neighbourhood", site_bushfire_prone: true, site_complexity: "high", site_enriched_at: "2026-11-01T00:00:00Z" };
const jobSite = { site_council: "CITY OF HOLDFAST BAY", site_zone: "General Neighbourhood", site_bushfire_prone: false, site_complexity: "low", site_enriched_at: "2026-11-16T00:00:00Z" };
const jobBlank = { id: "j1", site_enriched_at: null };
ok("a job that has been looked up → the job's values", siteSource(jobSite, leadSite) === jobSite && siteFacts(jobSite, leadSite).council === "CITY OF HOLDFAST BAY");
ok("a job not looked up yet → the lead's values (no blank rows after the PTSA)", siteSource(jobBlank, leadSite) === leadSite && siteFacts(jobBlank, leadSite).zone === "Hills Neighbourhood" && siteFacts(jobBlank, leadSite).bushfire === true);
ok("no job → the lead's values", siteSource(null, leadSite) === leadSite);
ok("neither looked up → every value null", siteSource(jobBlank, { id: "l1" }) === null && Object.values(siteFacts(jobBlank, { id: "l1" })).every((v) => v === null));
ok("a false bushfire value is kept (never read as 'not known')", siteFacts(jobSite, null).bushfire === false);
ok("conversion runs the lookup for the new job", /if \(!job\.site_enriched_at\) enrichSite\("jobs", job\.id\)\.catch/.test(salesSrc));

section("Re-check: any staff member, rate-limited per lead");
const NOW_MS = Date.parse("2026-11-17T10:00:00Z");
ok("never looked up → due", recheckDue(null, NOW_MS) && recheckDue("not a date", NOW_MS));
ok("looked up 5 minutes ago → not due", !recheckDue(new Date(NOW_MS - 5 * 60 * 1000).toISOString(), NOW_MS));
ok("looked up 10 minutes ago or more → due", recheckDue(new Date(NOW_MS - RECHECK_MIN_MS).toISOString(), NOW_MS) && recheckDue("2026-11-01T00:00:00Z", NOW_MS));
const regRoutesSrc = readFileSync(new URL("../../server/lib/registerRoutes.mjs", import.meta.url), "utf8");
const recheckRoute = regRoutesSrc.slice(regRoutesSrc.indexOf("/site/recheck`"), regRoutesSrc.indexOf("/promote`"));
ok("the staff route needs a sign-in but no admin role", /app\.post\(`\$\{base\}\/site\/recheck`, requireAuth, async/.test(regRoutesSrc) && !/requireRole/.test(recheckRoute));
const failedBranch = recheckRoute.slice(recheckRoute.indexOf('if (out.status === "failed")'), recheckRoute.indexOf("const context = await loadRegisterContext"));
ok("it answers { context, skipped }; a skip says why in plain words", /ok\(res, \{ context, skipped: false \}\)/.test(recheckRoute)
  && /ok\(res, \{ context, skipped: true, reason: out\.reason, message: recheckSkipWords\(out\.reason\) \}\)/.test(recheckRoute));
ok("a failure sends only the plain words, never the lookup's reason", /return err\(res, out\.retrySoon \? 429 : 502, recheckFailureWords\(out\.reason\), "SITE_LOOKUP"\);/.test(failedBranch)
  && (failedBranch.match(/out\.reason/g) || []).length === 2, failedBranch);
ok("…through runSiteRecheck (stored values read first, the lookup look-only; register-site-recheck.test.mjs)", /runSiteRecheck\(sb, leadId, \{ running: recheckRunning, failedAt: recheckFailedAt \}\)/.test(recheckRoute) && !/enrichSite\(/.test(recheckRoute));
ok("the plain-English failure line", /Couldn't reach the mapping service\. Nothing changed\./.test(regRoutesSrc));
const regCtxSrc = readFileSync(new URL("../../server/lib/registerContext.mjs", import.meta.url), "utf8");
ok("a failed fact write logs the database text and sends a plain line", /Could not save the project fact\. Nothing changed\./.test(regCtxSrc) && !/new Error\(r\?\.error/.test(regCtxSrc));

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

section("'+ Add someone new': an email links a contact only when the names match");
const ava = { id: "c-ava", first_name: "Ava", last_name: "Arch", company: "Arch Studio", email: "Info@ArchStudio.test" };
const ben = { id: "c-ben", first_name: "Ben", last_name: "Draw", company: "Arch Studio", email: "info@archstudio.test" };
const gone = { id: "c-old", first_name: "Ava", last_name: "Arch", company: "Arch Studio", email: "info@archstudio.test", is_archived: true };
ok("the same email (any case) and the same name → that contact", emailMatch([ava], { name: "ava  arch", email: "info@archstudio.test" }).contact === ava);
ok("a shared office email with a different name → a conflict, never a silent link", emailMatch([ben], { name: "Ava Arch", email: "info@archstudio.test" }).conflict === ben && !emailMatch([ben], { name: "Ava Arch", email: "info@archstudio.test" }).contact);
ok("of several with that email, the one whose name matches", emailMatch([ben, ava], { name: "Ava Arch", email: "INFO@archstudio.test" }).contact === ava);
ok("an archived contact is never linked", !emailMatch([gone], { name: "Ava Arch", email: "info@archstudio.test" }).contact && !emailMatch([gone], { name: "Ava Arch", email: "info@archstudio.test" }).conflict);
ok("an over-matched query is re-checked exactly ('*' and '_' are wildcards in the query)", eq(emailMatch([{ ...ava, email: "infoXarchstudio.test" }], { name: "Ava Arch", email: "info*archstudio.test" }), {}));
ok("no email → nothing to match", eq(emailMatch([ava], { name: "Ava Arch", email: "" }), {}));
ok("the conflict names the person in plain words", conflictWords(ben) === "Ben Draw, Arch Studio" && conflictWords({ company: "Studio X" }) === "Studio X" && contactNameOf(ben) === "Ben Draw");
ok("names compare without case, punctuation or extra spaces", nameKey(" O'Neil,  AVA ") === "o neil ava");
ok("the route links by email only through emailMatch, archived contacts left out", /emailMatch\(same, \{ name, email, firmOnly: !!firmOnly \}\)/.test(salesSrc) && /\.not\("is_archived", "is", true\)\.limit\(20\)/.test(salesSrc) && /code: "EMAIL_IN_USE"/.test(salesSrc));

section("A practice with an email links only a practice, never a person at that firm (D2)");
{
  const person = { id: "e-ava", first_name: "Ava", last_name: "Arch", company: "Studio X Architects", email: "info@studiox.test", phone: null };
  const firm = { id: "e-firm", first_name: "", last_name: null, company: "Studio X Architects", email: "INFO@studiox.test", phone: null };
  const split = { id: "e-split", first_name: "Studio", last_name: "X Architects", company: "studio x architects", email: "info@studiox.test" };
  const elsewhere = { id: "e-else", first_name: "Bo", last_name: "Bell", company: "Bell Design", email: "info@studiox.test" };
  ok("firmShaped: no person's name, or a 'name' that is only the firm split in two; a person is not", firmShaped(firm) && firmShaped(split) && !firmShaped(person)
    && firmShaped({ first_name: "", last_name: null, company: null }) && !firmShaped({ first_name: "Studio", last_name: "X", company: "Other Co" }));
  const practiceEntry = { name: "Studio X Architects", email: "info@studiox.test", firmOnly: true };
  ok("a practice whose email a person at that firm shares (the office email) → nothing linked, no conflict (the practice is added)", eq(emailMatch([person], practiceEntry), {}));
  ok("…the CRM's practice with that email → linked, even listed after the person", emailMatch([person, firm], practiceEntry).contact === firm);
  ok("…an earlier tender's split-name practice counts as the practice", emailMatch([person, split], practiceEntry).contact === split);
  ok("…someone at another firm with that email is still a conflict", emailMatch([elsewhere], practiceEntry).conflict === elsewhere && !emailMatch([elsewhere], practiceEntry).contact);
  ok("…a person at the firm and someone elsewhere → not linked, and no conflict either", eq(emailMatch([elsewhere, person], practiceEntry), {}));
  ok("a person named with that email still links that person (unchanged)", emailMatch([person], { name: "Ava Arch", email: "info@studiox.test" }).contact === person
    && emailMatch([firm], { name: "Ava Arch", email: "info@studiox.test" }).conflict === firm);
  const fillAt = salesSrc.indexOf("if (contact && firmOnly");
  ok("the route: a practice's typed details are written only onto a practice (never onto a person)", /if \(contact && firmOnly && firmShaped\(contact\)\) \{/.test(salesSrc)
    && fillAt > 0 && salesSrc.indexOf("detailsToFill(contact,", fillAt) > fillAt && (salesSrc.match(/detailsToFill\(/g) || []).length === 1);
}

section("'+ Add someone new' twice: the second save reuses the person");
const onJob = [
  { id: "r1", status: "active", role: "architect", contact: { id: "c-dup", first_name: "BLH TEST Dup", last_name: "Archer", company: "Dup Studio" } },
  { id: "r2", status: "inactive", role: "architect", contact: { id: "c-off", first_name: "Old", last_name: "Hand", company: null, phone: "0400 000 001" } },
  { id: "r3", status: "active", role: "architect", contact: { id: "c-firm", first_name: "", last_name: null, company: "Studio X" } },
];
ok("the same name and firm already on this job, same discipline → that contact (no duplicate)", sameNamedOnJob(onJob, { name: "blh test dup  archer", company: "Dup Studio", role: "architect" })?.id === "c-dup");
ok("…a designer is the architect's discipline", sameNamedOnJob(onJob, { name: "BLH TEST Dup Archer", company: "dup studio", role: "designer" })?.id === "c-dup");
ok("the same name with another firm is someone else", sameNamedOnJob(onJob, { name: "BLH TEST Dup Archer", company: "Other Studio", role: "architect" }) === null);
ok("someone who has left the job is not reused", sameNamedOnJob(onJob, { name: "Old Hand", company: "", phone: "0400 000 001", role: "architect" }) === null);
ok("a firm-only contact is matched by its firm", sameNamedOnJob(onJob, { name: "Studio X", company: "", role: "architect" })?.id === "c-firm"
  && sameNamedOnJob(onJob, { name: "studio x", company: "Studio X", role: "architect" })?.id === "c-firm");
ok("…but not under another firm typed", sameNamedOnJob(onJob, { name: "Studio X", company: "Studio Y", role: "architect" }) === null);
ok("no name or no role → nothing", sameNamedOnJob(onJob, { name: " ", company: "Dup Studio", role: "architect" }) === null && sameNamedOnJob(null, { name: "A", role: "architect" }) === null
  && sameNamedOnJob(onJob, { name: "BLH TEST Dup Archer", company: "Dup Studio" }) === null);
ok("the route reuses the person only through sameNamedOnJob, with the role, firm, phone, email and the lead's roster", /sameNamedOnJob\(onJob, \{ name, company, phone, email, role \}, lead\.consultant_roster\)/.test(salesSrc)
  && /\.select\("id, status, role, contact:crm_contacts\(\*\)"\)/.test(salesSrc));

section("No email: an engineer 'Tom' is never the architect 'Tom' (R7)");
const toms = [
  { id: "r-arch", status: "active", role: "architect", contact: { id: "c-arch", first_name: "Tom", last_name: null, company: null, phone: "0412 345 678", email: "tom@arch.test" } },
  { id: "r-eng", status: "active", role: "engineer", contact: { id: "c-eng", first_name: "Tom", last_name: null, company: "Beam Co", phone: null, email: null } },
  { id: "r-energy", status: "active", role: "consultant", contact: { id: "c-nrg", first_name: "Tom", last_name: null, company: "Star Rate", phone: null } },
];
ok("an engineer 'Tom' with no firm (phone typed) → a new contact, not the architect", sameNamedOnJob(toms, { name: "Tom", company: "", phone: "0499 111 222", role: "engineer" }) === null);
ok("…even with the architect's phone: another discipline is never reused", sameNamedOnJob(toms, { name: "Tom", company: "", phone: "0412 345 678", role: "engineer" }) === null);
ok("the architect 'Tom' with nothing typed, while the one on the job has a phone and email → a new contact (a blank firm is not the same firm)", sameNamedOnJob(toms, { name: "Tom", company: "", role: "architect" }) === null);
ok("the architect 'Tom', same phone (written another way) → reused", sameNamedOnJob(toms, { name: "tom", company: "", phone: "+61 412 345 678", role: "architect" })?.id === "c-arch");
ok("the architect 'Tom', same email (any case) → reused", sameNamedOnJob(toms, { name: "Tom", email: "TOM@arch.test", role: "architect" })?.id === "c-arch");
ok("the engineer 'Tom' of Beam Co, same firm → reused", sameNamedOnJob(toms, { name: "Tom", company: "beam co", role: "engineer" })?.id === "c-eng");
ok("…and not as an architect", sameNamedOnJob(toms, { name: "Tom", company: "Beam Co", role: "architect" }) === null);
const tomsRoster = [{ role: "energy", contactId: "c-nrg" }];
ok("an energy assessor (stored as 'consultant', energy on the roster) of the same firm → reused; as an engineer → not", sameNamedOnJob(toms, { name: "Tom", company: "Star Rate", role: "energy" }, tomsRoster)?.id === "c-nrg"
  && sameNamedOnJob(toms, { name: "Tom", company: "Star Rate", role: "engineer" }, tomsRoster) === null);
ok("a phone compares by its digits", phoneKey("+61 (412) 345-678") === "0412345678" && phoneKey("08 8123 4567") === "0881234567" && phoneKey(null) === "");

section("A 'consultant' role row is reused only in the discipline the roster gives it (D1)");
{
  // Energy, land surveyor, soil and geotech, lighting and sanitary are all stored as "consultant" in job_contact_roles.
  const sam = { id: "c-sam", first_name: "Sam", last_name: "Lee", company: null, phone: null, email: null };
  const rows = [{ id: "r-sam", status: "active", role: "consultant", contact: sam }];
  const energyRoster = [{ role: "energy", contactId: "c-sam", deliverables: [] }];
  ok("a name-only energy assessor 'Sam Lee' is never reused as the land surveyor 'Sam Lee'", sameNamedOnJob(rows, { name: "Sam Lee", role: "land_surveyor" }, energyRoster) === null);
  ok("…nor as soil and geotech, lighting or sanitary", ["soil_geotech", "lighting", "sanitary"].every((role) => sameNamedOnJob(rows, { name: "Sam Lee", role }, energyRoster) === null));
  ok("…the energy assessor saved again (a retry) → reused", sameNamedOnJob(rows, { name: "sam  LEE", role: "energy" }, energyRoster)?.id === "c-sam");
  ok("…the same firm alone, or the same phone alone, does not make another discipline the same (round 5: it takes the name, firm AND phone)",
    sameNamedOnJob([{ ...rows[0], contact: { ...sam, company: "Star Rate", phone: "0400 111 222" } }], { name: "Sam Lee", company: "Star Rate", role: "land_surveyor" }, energyRoster) === null
    && sameNamedOnJob([{ ...rows[0], contact: { ...sam, company: "Star Rate", phone: "0400 111 222" } }], { name: "Sam Lee", phone: "0400 111 222", role: "land_surveyor" }, energyRoster) === null);
  ok("…name, firm and phone all the same: one person, one contact (round 5, K2)",
    sameNamedOnJob([{ ...rows[0], contact: { ...sam, company: "Star Rate", phone: "0400 111 222" } }], { name: "Sam Lee", company: "Star Rate", phone: "0400 111 222", role: "land_surveyor" }, energyRoster)?.id === "c-sam");
  ok("one person under one 'consultant' row in two disciplines → reused in either, not in a third", sameNamedOnJob(rows, { name: "Sam Lee", role: "soil_geotech" },
    [{ role: "land_surveyor", contactId: "c-sam" }, { role: "soil_geotech", contact_id: "c-sam" }])?.id === "c-sam"
    && sameNamedOnJob(rows, { name: "Sam Lee", role: "lighting" }, [{ role: "land_surveyor", contactId: "c-sam" }, { role: "soil_geotech", contactId: "c-sam" }]) === null);
  ok("no roster, or the roster doesn't name this contact → not reused (a new contact, never a merge)", sameNamedOnJob(rows, { name: "Sam Lee", role: "energy" }) === null
    && sameNamedOnJob(rows, { name: "Sam Lee", role: "energy" }, null) === null
    && sameNamedOnJob(rows, { name: "Sam Lee", role: "energy" }, [{ role: "energy", contactId: "c-other" }]) === null);
  ok("…an emptied slot (the person taken off) doesn't count", sameNamedOnJob(rows, { name: "Sam Lee", role: "energy" }, [{ role: "energy", contactId: "", previousContactId: "c-sam" }]) === null);
  ok("…a roster entry that itself says only 'consultant' gives no discipline", sameNamedOnJob(rows, { name: "Sam Lee", role: "land_surveyor" }, [{ role: "consultant", contactId: "c-sam" }]) === null);
  ok("a 'Consultant' card role is the roster's 'other' discipline", sameNamedOnJob(rows, { name: "Sam Lee", role: "consultant" }, [{ role: "other", contactId: "c-sam" }])?.id === "c-sam"
    && sameNamedOnJob(rows, { name: "Sam Lee", role: "consultant" }, energyRoster) === null);
  ok("the architect and engineer rows are their own discipline: no roster needed", sameNamedOnJob(onJob, { name: "BLH TEST Dup Archer", company: "Dup Studio", role: "architect" }, [])?.id === "c-dup"
    && sameNamedOnJob(onJob, { name: "BLH TEST Dup Archer", company: "Dup Studio", role: "architect" }, energyRoster)?.id === "c-dup");
  // The route's no-email path, step by step: the role row is "consultant", the roster entry carries the discipline.
  const saved = [], roster = [];
  const save = (entry) => {
    const c = sameNamedOnJob(saved, entry, roster);
    const made = c || { id: `c-${saved.length + 1}`, ...splitName(entry.name), company: null, phone: null, email: null };
    if (!c) saved.push({ id: `r-${saved.length + 1}`, status: "active", role: storageRolesFor(entry.role).dbRole, contact: made });
    roster.splice(0, roster.length, ...rosterAdd(roster, { contactId: made.id, rosterRole: storageRolesFor(entry.role).rosterRole }, NOW));
    return made;
  };
  const energy = save({ name: "Sam Lee", role: "energy" });
  const surveyor = save({ name: "Sam Lee", role: "land_surveyor" });
  ok("saving the energy assessor, then a land surveyor of the same name → two contacts, one discipline each", surveyor.id !== energy.id && saved.length === 2
    && eq(roster.map((e) => [e.role, e.contactId]), [["energy", energy.id], ["land_surveyor", surveyor.id]]), flat(roster));
  ok("…each one's retry finds its own (no third contact)", save({ name: "Sam Lee", role: "energy" }).id === energy.id && save({ name: "Sam Lee", role: "land_surveyor" }).id === surveyor.id
    && saved.length === 2 && roster.length === 2);
}

section("A practice named with no person is a firm-only contact, linked to the CRM's (R8)");
ok("the name is the firm → the firm", firmOnlyName({ name: "Studio X Architects", company: "studio x  architects" }) === "studio x architects");
ok("only a firm → the firm", firmOnlyName({ company: " Studio X Architects " }) === "Studio X Architects" && firmOnlyName({ name: "", company: "Studio X" }) === "Studio X");
ok("a person at a firm, or no firm → not firm-only", firmOnlyName({ name: "Ava Arch", company: "Studio X" }) === "" && firmOnlyName({ name: "Ava Arch", company: "" }) === "" && firmOnlyName({}) === "");
const crm = [
  { id: "p-ava", first_name: "Ava", last_name: "Arch", company: "Studio X Architects", status: "active", contact_type: "architect", created_at: "2026-01-01" },
  { id: "p-old", first_name: "", last_name: null, company: "Studio X Architects", status: "active", contact_type: "architect", is_archived: true, created_at: "2025-01-01" },
  { id: "p-lost", first_name: "", last_name: null, company: "Studio X Architects", status: "lost", contact_type: "architect", created_at: "2025-02-01" },
  { id: "p-split", first_name: "Studio", last_name: "X Architects", company: "Studio X Architects", status: "active", contact_type: "architect", created_at: "2026-10-01" },
  { id: "p-firm", first_name: "", last_name: null, company: "STUDIO X ARCHITECTS", status: "active", contact_type: "architect", created_at: "2026-11-01" },
  { id: "p-other", first_name: "", last_name: null, company: "Studio X Architects Pty Ltd", status: "active", contact_type: "architect", created_at: "2024-01-01" },
];
ok("the CRM's firm-only contact with the same firm (any case) is linked", firmOnlyMatch(crm, { company: "studio x architects", contactType: "architect" })?.id === "p-firm");
ok("…a person at that firm, an archived or lost one, or a longer firm name never is", firmOnlyMatch(crm.filter((r) => r.id !== "p-firm" && r.id !== "p-split"), { company: "Studio X Architects", contactType: "architect" }) === null);
ok("…an earlier tender's split-name practice counts, after a true firm-only one", firmOnlyMatch(crm.filter((r) => r.id !== "p-firm"), { company: "Studio X Architects" })?.id === "p-split");
ok("…an over-matched query is re-checked exactly", firmOnlyMatch([{ id: "w", first_name: "", company: "StudioXArchitects", status: "active" }], { company: "Studio_X_Architects" }) === null);
ok("…no firm, or nothing stored → nothing", firmOnlyMatch(crm, { company: " " }) === null && firmOnlyMatch(null, { company: "Studio X" }) === null);
ok("of two, the 'active' one, then the oldest", firmOnlyMatch([
  { id: "a-new", first_name: "", company: "Arc", status: "new", created_at: "2025-01-01" },
  { id: "a-act2", first_name: "", company: "Arc", status: "active", created_at: "2026-02-01" },
  { id: "a-act1", first_name: "", company: "Arc", status: "active", created_at: "2026-01-01" },
], { company: "arc" })?.id === "a-act1");
const dtRoute = salesSrc.slice(salesSrc.indexOf('app.post("/api/sales/leads/:id/design-team"'), salesSrc.indexOf('app.delete("/api/sales/leads/:id/design-team/:roleId"'));
ok("the route: a firm-only save looks the firm up in the CRM (archived left out) before adding", /if \(!contact && firmOnly\)/.test(dtRoute)
  && /\.ilike\("company", pattern\)\.not\("is_archived", "is", true\)\.limit\(20\)/.test(dtRoute) && /firmOnlyMatch\(cErr \? \[\] : firms, \{ company: firmOnly, contactType: roles\.contactType, email, phone \}\)/.test(dtRoute)
  && dtRoute.indexOf("firmOnlyMatch(") < dtRoute.indexOf('.from("crm_contacts").insert('));
ok("…and adds it with no first or last name (never 'Studio' + 'X Architects')", /const who = firmOnly \? \{ first_name: "", last_name: null \} : splitName\(name\);/.test(dtRoute));
ok("…the database's own words never reach the browser", !/err\(res, 400, cErr/.test(dtRoute) && /translateDbError\(cErr\)/.test(dtRoute));
const pipeSrc = readFileSync(new URL("../../src/pages/SalesPipeline.jsx", import.meta.url), "utf8");
const leadPageSrc = readFileSync(new URL("../../src/pages/LeadDetail.jsx", import.meta.url), "utf8");
ok("the Sales 'Budget confirmed' hint is 12 px, as the Sales labels beside it (P5)", /className="[^"]*\btext-xs\b[^"]*" data-testid="budget-confirmed-hint"/.test(leadPageSrc)
  && !/text-\[11px\][^"]*" data-testid="budget-confirmed-hint"/.test(leadPageSrc));
ok("the Architect Tender drawer names the practice as a firm, not a person", /apiPost\(`\/api\/sales\/leads\/\$\{lead\.id\}\/design-team`, \{ role: "architect", company: architect \}\)/.test(pipeSrc)
  && !/design-team`, \{[^}]*name: architect/.test(pipeSrc));

section("A name-only entry saved twice: the second save reuses the first (P2)");
{
  // The route's no-email path, twice: the first answer is lost (a gateway timeout after it landed) and the user retries.
  const saved = [];
  const save = (entry) => {
    const c = sameNamedOnJob(saved, entry);
    if (c) return c;
    const made = { id: `c-${saved.length + 1}`, ...splitName(entry.name), company: entry.company || null, phone: entry.phone || null, email: entry.email || null };
    saved.push({ id: `r-${saved.length + 1}`, status: "active", role: storageRolesFor(entry.role).dbRole, contact: made });
    return made;
  };
  const first = save({ name: "Tom Smith", role: "architect" });
  const again = save({ name: "Tom Smith", role: "architect" });
  ok("the same name-only entry saved again → the same contact, one role row (no second 'Tom Smith' architect)", again.id === first.id && saved.length === 1, flat(saved));
  const retyped = save({ name: "  tom   SMITH ", company: " ", phone: "", email: null, role: "architect" });
  ok("…blank firm, phone and email typed, and the name in another case → still the same one", retyped.id === first.id && saved.length === 1);
  const engineer = save({ name: "Tom Smith", role: "engineer" });
  ok("the same name-only entry as the engineer → a new contact and role (two disciplines, two people)", engineer.id !== first.id && saved.length === 2);
  ok("…and each discipline's second save finds its own", save({ name: "Tom Smith", role: "engineer" }).id === engineer.id && save({ name: "Tom Smith", role: "architect" }).id === first.id && saved.length === 2);
  ok("…a designer is the architect's discipline", save({ name: "Tom Smith", role: "designer" }).id === first.id && saved.length === 2);
}
{
  const named = [
    { id: "r-n1", status: "active", role: "architect", contact: { id: "c-bare", first_name: "Tom", last_name: "Smith", company: null, phone: null, email: null } },
    { id: "r-n2", status: "active", role: "architect", contact: { id: "c-tel", first_name: "Jo", last_name: "Lane", company: null, phone: "0412 000 111", email: null } },
    { id: "r-n3", status: "inactive", role: "engineer", contact: { id: "c-left", first_name: "Tom", last_name: "Smith", company: "", phone: "", email: "" } },
    { id: "r-n4", status: "active", role: "architect", contact: { id: "c-cher", first_name: "Cher", last_name: null, company: null } },
  ];
  ok("name only, on the job with no firm, phone or email, same discipline → reused", sameNamedOnJob(named, { name: "Tom Smith", role: "architect" })?.id === "c-bare");
  ok("name only, but the one on the job has a phone → a new contact (R7: nothing tells them apart)", sameNamedOnJob(named, { name: "Jo Lane", role: "architect" }) === null);
  ok("a phone typed, the one on the job has none → a new contact (R7 unchanged)", sameNamedOnJob(named, { name: "Tom Smith", phone: "0499 111 222", role: "architect" }) === null);
  ok("a firm typed, the one on the job has none → a new contact", sameNamedOnJob(named, { name: "Tom Smith", company: "Beam Co", role: "architect" }) === null);
  ok("name only, someone of that name who has left the job → not reused", sameNamedOnJob(named, { name: "Tom Smith", role: "engineer" }) === null);
  ok("the full name must match: 'Cher Smith' is not 'Cher'", sameNamedOnJob(named, { name: "Cher Smith", role: "architect" }) === null && sameNamedOnJob(named, { name: "cher", role: "architect" })?.id === "c-cher");
  ok("Tom the architect is never reused for Tom the engineer, name only or not", sameNamedOnJob(named, { name: "Tom Smith", role: "engineer" }) === null
    && sameNamedOnJob(toms, { name: "Tom", role: "engineer" }) === null && sameNamedOnJob(toms, { name: "Tom", company: "Beam Co", role: "architect" }) === null);
}

section("A firm-only save links the CRM's practice only when the typed email and phone agree (P3)");
const practice = { id: "f-1", first_name: "", last_name: null, company: "Studio X Architects", email: "old@studiox.test", phone: "08 8123 4567", status: "active", contact_type: "architect", created_at: "2026-01-01" };
const bare = { id: "f-2", first_name: "", last_name: null, company: "Studio X Architects", email: null, phone: null, status: "active", contact_type: "architect", created_at: "2026-02-01" };
ok("detailsAgree: nothing typed, blank on the contact, or the same (email any case, phone by digits)", detailsAgree(practice, {}) && detailsAgree(bare, { email: "new@studiox.test", phone: "0400 000 000" })
  && detailsAgree(practice, { email: "OLD@StudioX.test", phone: "+61 8 8123 4567" }) === true);
ok("…another email, or another phone → they don't", !detailsAgree(practice, { email: "new@studiox.test" }) && !detailsAgree(practice, { phone: "08 8999 0000" }));
ok("detailsToFill: only what the contact has none of", eq(detailsToFill(bare, { email: " new@studiox.test ", phone: "0400 000 000" }), { email: "new@studiox.test", phone: "0400 000 000" })
  && eq(detailsToFill(practice, { email: "new@studiox.test", phone: "0400 000 000" }), {}) && eq(detailsToFill(bare, {}), {}) && eq(detailsToFill({ ...bare, email: "a@b.test" }, { email: "c@d.test", phone: "0400" }), { phone: "0400" }));
ok("a new email typed, the CRM's practice has another → not linked (a new firm-only contact keeps what was typed)", firmOnlyMatch([practice], { company: "Studio X Architects", email: "new@studiox.test" }) === null);
ok("a new phone typed, the CRM's practice has another → not linked", firmOnlyMatch([practice], { company: "Studio X Architects", phone: "08 8999 0000" }) === null);
ok("the same phone written another way → linked", firmOnlyMatch([practice], { company: "studio x architects", phone: "+61 8 8123 4567" })?.id === "f-1");
ok("the practice has no email or phone → linked (the route fills them in)", firmOnlyMatch([bare], { company: "Studio X Architects", email: "new@studiox.test", phone: "0400 000 000" })?.id === "f-2");
ok("of two practices, the one whose details agree", firmOnlyMatch([practice, bare], { company: "Studio X Architects", email: "new@studiox.test" })?.id === "f-2"
  && firmOnlyMatch([practice, { ...bare, phone: "0400 000 000" }], { company: "Studio X Architects", phone: "0400 000 000" })?.id === "f-2");
ok("nothing typed but the firm → linked as before (the 'active' one, then the oldest)", firmOnlyMatch([bare, practice], { company: "Studio X Architects" })?.id === "f-1");
const firmOnJob = [{ id: "r-f", status: "active", role: "architect", contact: practice }];
ok("on this job: the practice with another phone typed → not reused (goes to the CRM check, then a new one)", sameNamedOnJob(firmOnJob, { name: "Studio X Architects", phone: "08 8999 0000", role: "architect" }) === null);
ok("…the same phone, or none typed → reused", sameNamedOnJob(firmOnJob, { name: "Studio X Architects", phone: "(08) 8123-4567", role: "architect" })?.id === "f-1"
  && sameNamedOnJob(firmOnJob, { name: "Studio X Architects", role: "architect" })?.id === "f-1");
{
  const fillAt = dtRoute.indexOf("if (contact && firmOnly && firmShaped(contact))");
  const fillBlock = dtRoute.slice(fillAt, dtRoute.indexOf("if (!contact) {", fillAt));
  ok("the route: a linked practice gets the typed email or phone it has none of, before anything else is written", fillAt > dtRoute.indexOf("firmOnlyMatch(")
    && /const fill = detailsToFill\(contact, \{ email, phone \}\);/.test(fillBlock) && /\.from\("crm_contacts"\)\.update\(\{ \.\.\.fill, updated_at: now \}\)\.eq\("id", contact\.id\)/.test(fillBlock)
    && fillAt < dtRoute.indexOf('.from("job_contact_roles").select("id, job_id, lead_id, status")'));
  ok("…a failed write says so in plain words (never the database's), and nothing else is saved", /if \(uErr\) return err\(res, 400, translateDbError\(uErr\)\);/.test(fillBlock));
  ok("…and a firm-only contact that isn't linked is added with what was typed", /const row = \{ \.\.\.who, email, phone, company: company \|\| null,/.test(dtRoute));
}

section("The roster is written against what is stored now (no lost update)");
ok("the roster write is conditional on the lead being unchanged", /\.eq\("updated_at", current\.updated_at\)/.test(salesSrc) && /current = fresh;/.test(salesSrc));
ok("both the add and the remove re-apply their change to the fresh roster", /saveRoster\(sb, lead, \(roster\) => rosterAdd\(roster,/.test(salesSrc) && /saveRoster\(sb, lead, \(roster\) => rosterRemove\(roster,/.test(salesSrc));
ok("a second clash says so in plain words", salesSrc.includes("Someone else changed the design team — try again.") && (salesSrc.match(/err\(res, 409, ROSTER_CLASH, "CONFLICT"\)/g) || []).length === 2);

// ── The design-team route itself (D1, D2): salesRoutes.mjs bundled with esbuild, its database and sign-in swapped for
//    an in-memory stand-in (no .env read, no network, no server listening) ───────────────────────────────────────────
{
  const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const stubs = mkdtempSync(join(tmpdir(), "design-team-route-"));
  const routeOut = join(REPO_ROOT, "node_modules", ".cache", `design-team-route-${process.pid}.mjs`);
  const stub = (name, src) => { const f = join(stubs, name); writeFileSync(f, src); return f; };
  const sbStub = stub("supabaseService.mjs", "export const getServiceSupabase = () => globalThis.__designTeamSb || null;\n");
  const authStub = stub("requireAuth.mjs", "export const requireAuth = (req, _res, next) => { req.caller = { id: 'u-test', role: 'staff' }; next(); };\n"
    + "export const requireRole = () => (_req, _res, next) => next();\nexport const requireCronSecretOrAdmin = (_req, _res, next) => next();\n");
  const envStub = stub("dotenv.mjs", "export const config = () => ({ parsed: {} });\nexport default { config };\n");
  // A LIKE pattern as PostgREST reads it: '\x' is x, '%' any run, '_' any one character.
  const likeRe = (pat) => {
    let re = "";
    for (let i = 0; i < pat.length; i++) {
      const ch = pat[i];
      if (ch === "\\" && i + 1 < pat.length) re += pat[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      else re += ch === "%" ? ".*" : ch === "_" ? "." : ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    return new RegExp(`^${re}$`, "i");
  };
  const memoryDb = (tables) => {
    const writes = [];
    let seq = 0;
    const from = (table) => {
      const st = { op: "select", filters: [], payload: null, join: null, limit: null };
      const rows = () => (tables[table] ||= []);
      const run = () => {
        if (st.op === "insert") {
          const made = (Array.isArray(st.payload) ? st.payload : [st.payload]).map((p) => ({ id: `${table}-new-${++seq}`, ...p }));
          rows().push(...made); writes.push({ table, op: "insert", rows: made }); return made;
        }
        const hit = rows().filter((r) => st.filters.every((f) => f(r)));
        if (st.op === "update") { hit.forEach((r) => Object.assign(r, st.payload)); writes.push({ table, op: "update", ids: hit.map((r) => r.id), patch: st.payload }); return hit; }
        const out = st.join ? hit.map((r) => ({ ...r, [st.join.as]: (tables[st.join.table] || []).find((c) => c.id === r[`${st.join.as}_id`]) || null })) : hit;
        return st.limit == null ? out : out.slice(0, st.limit);
      };
      const q = {
        select(cols = "*") { const m = st.op === "select" && /(\w+):(\w+)\(/.exec(cols); if (m) st.join = { as: m[1], table: m[2] }; return q; },
        insert(p) { st.op = "insert"; st.payload = p; return q; },
        update(p) { st.op = "update"; st.payload = p; return q; },
        eq(k, v) { st.filters.push((r) => r[k] === v); return q; },
        is(k, v) { st.filters.push((r) => (r[k] ?? null) === v); return q; },
        not(k, _op, v) { st.filters.push((r) => (r[k] ?? null) !== v); return q; },
        in(k, vs) { st.filters.push((r) => vs.includes(r[k])); return q; },
        ilike(k, pat) { const re = likeRe(pat); st.filters.push((r) => re.test(String(r[k] ?? ""))); return q; },
        or(expr) {
          const any = expr.split(",").map((part) => { const [k, , ...v] = part.split("."); return (r) => String(r[k]) === v.join("."); });
          st.filters.push((r) => any.some((f) => f(r))); return q;
        },
        order() { return q; },
        limit(n) { st.limit = n; return q; },
        maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
        single: async () => { const d = run()[0]; return d ? { data: d, error: null } : { data: null, error: { code: "PGRST116", message: "no rows" } }; },
        then: (ok2, no) => Promise.resolve({ data: run(), error: null }).then(ok2, no),
      };
      return q;
    };
    return { sb: { from }, tables, writes };
  };
  try {
    await build({
      entryPoints: [join(REPO_ROOT, "server/lib/salesRoutes.mjs")], outfile: routeOut, bundle: true, format: "esm", platform: "node", logLevel: "silent",
      plugins: [{ name: "design-team-stubs", setup(b) {
        b.onResolve({ filter: /\/supabaseService\.mjs$/ }, () => ({ path: sbStub }));
        b.onResolve({ filter: /\/requireAuth\.mjs$/ }, () => ({ path: authStub }));
        b.onResolve({ filter: /^dotenv(\/.*)?$/ }, () => ({ path: envStub }));
        b.onResolve({ filter: /^[^./]/ }, (a) => ({ path: a.path, external: true }));
      } }],
    });
    const { registerSalesRoutes } = await import(pathToFileURL(routeOut).href);
    const handlers = {};
    registerSalesRoutes(new Proxy({}, { get: (_t, method) => (path, ...hs) => { handlers[`${String(method)} ${path}`] = hs; } }));
    const postTeam = handlers["post /api/sales/leads/:id/design-team"];
    const call = async (db, leadId, body) => {
      globalThis.__designTeamSb = db.sb;
      let status = 200, json = null;
      const res = { status(n) { status = n; return res; }, json(b) { json = b; return res; } };
      const req = { params: { id: leadId }, body, query: {}, headers: {} };
      for (const h of postTeam) { let next = false; await h(req, res, () => { next = true; }); if (!next) break; }
      return { status, json };
    };
    const leadRow = (id, roster = []) => ({ id, job_id: null, consultant_roster: roster, updated_at: "2026-11-17T00:00:00.000Z" });

    section("The design-team route: an energy assessor is never the land surveyor of the same name (D1)");
    {
      const db = memoryDb({
        leads: [leadRow("L-d1", [{ role: "energy", contactId: "c-sam", deliverables: [] }])],
        crm_contacts: [{ id: "c-sam", first_name: "Sam", last_name: "Lee", company: null, email: null, phone: null, contact_type: "other", status: "active" }],
        job_contact_roles: [{ id: "r-sam", lead_id: "L-d1", job_id: null, contact_id: "c-sam", role: "consultant", status: "active" }],
      });
      const surveyor = await call(db, "L-d1", { role: "land_surveyor", name: "Sam Lee" });
      const roster1 = db.tables.leads[0].consultant_roster;
      ok("a name-only land surveyor 'Sam Lee' → a new contact, not the energy assessor", surveyor.status === 200 && surveyor.json?.ok === true && surveyor.json.contactId && surveyor.json.contactId !== "c-sam"
        && db.tables.crm_contacts.length === 2, flat(surveyor));
      ok("…the roster keeps one discipline each (energy → the assessor, land surveyor → the new contact)", eq(roster1.map((e) => [e.role, e.contactId]), [["energy", "c-sam"], ["land_surveyor", surveyor.json?.contactId]]), flat(roster1));
      ok("…and the design team shows two people, not one person in both", (surveyor.json?.consultants || []).filter((c) => c.name === "Sam Lee").map((c) => `${c.role}:${c.contactId}`).sort().join(",")
        === ["energy:c-sam", `land_surveyor:${surveyor.json?.contactId}`].sort().join(","), flat(surveyor.json?.consultants));
      const energyAgain = await call(db, "L-d1", { role: "energy", name: "Sam Lee" });
      const surveyorAgain = await call(db, "L-d1", { role: "land_surveyor", name: "sam lee" });
      ok("each one saved again (a retry) → its own contact, no third", energyAgain.json?.contactId === "c-sam" && surveyorAgain.json?.contactId === surveyor.json?.contactId
        && db.tables.crm_contacts.length === 2 && db.tables.leads[0].consultant_roster.length === 2, flat([energyAgain.json?.contactId, surveyorAgain.json?.contactId, db.tables.crm_contacts.length]));
    }

    section("The design-team route: a practice with an email never links or writes onto a person at that firm (D2)");
    {
      const ava = { id: "c-ava", first_name: "Ava", last_name: "Arch", company: "Studio X Architects", email: "info@studiox.com.au", phone: null, contact_type: "architect", status: "active" };
      const db = memoryDb({ leads: [leadRow("L-d2")], crm_contacts: [{ ...ava }], job_contact_roles: [] });
      const r = await call(db, "L-d2", { role: "architect", name: "Studio X Architects", company: "Studio X Architects", email: "info@studiox.com.au", phone: "08 8123 4567" });
      const made = db.tables.crm_contacts.find((c) => c.id === r.json?.contactId);
      ok("the practice is saved (no 'someone else uses that email' stop)", r.status === 200 && r.json?.ok === true, flat(r));
      ok("…Ava's CRM record is untouched: no phone written onto her", db.tables.crm_contacts[0].phone === null && !db.writes.some((w) => w.table === "crm_contacts" && w.op === "update"), flat(db.writes));
      ok("…the practice is a new firm-only contact with the email and phone typed", r.json?.contactId !== "c-ava" && made && made.first_name === "" && made.last_name === null
        && made.company === "Studio X Architects" && made.email === "info@studiox.com.au" && made.phone === "08 8123 4567", flat(made));
      ok("…and it, not Ava, is the architect on this lead", db.tables.job_contact_roles.length === 1 && db.tables.job_contact_roles[0].contact_id === made?.id
        && eq(db.tables.leads[0].consultant_roster.map((e) => [e.role, e.contactId]), [["architect", made?.id]]), flat(db.tables.job_contact_roles));
      const practice = { id: "c-studio", first_name: "", last_name: null, company: "Studio X Architects", email: "info@studiox.com.au", phone: null, contact_type: "architect", status: "active" };
      const db2 = memoryDb({ leads: [leadRow("L-d2b")], crm_contacts: [{ ...ava }, { ...practice }], job_contact_roles: [] });
      const r2 = await call(db2, "L-d2b", { role: "architect", company: "Studio X Architects", email: "INFO@studiox.com.au", phone: "08 8123 4567" });
      ok("the CRM's practice with that email → linked, and the phone it had none of goes onto the practice (not Ava)", r2.json?.contactId === "c-studio"
        && db2.tables.crm_contacts.find((c) => c.id === "c-studio").phone === "08 8123 4567" && db2.tables.crm_contacts.find((c) => c.id === "c-ava").phone === null
        && db2.tables.crm_contacts.length === 2, flat([r2.json, db2.writes]));
      const db3 = memoryDb({ leads: [leadRow("L-d2c")], crm_contacts: [{ ...ava }], job_contact_roles: [] });
      const r3 = await call(db3, "L-d2c", { role: "architect", name: "Ava Arch", company: "Studio X Architects", email: "info@studiox.com.au", phone: "0400 111 222" });
      ok("a person named with that email still links that person, and nothing is written onto her", r3.json?.contactId === "c-ava" && db3.tables.crm_contacts[0].phone === null
        && db3.tables.crm_contacts.length === 1, flat(r3.json));
    }
  } catch (e) {
    ok("the design-team route runs against the in-memory stand-in", false, e?.stack || e);
  } finally {
    delete globalThis.__designTeamSb;
    rmSync(stubs, { recursive: true, force: true });
    rmSync(routeOut, { force: true });
  }
}

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
  ok("'Re-check' is offered to every staff member, not only an admin", tx.includes("Re-check") && text(R.step({ reg: real.register, context: real.context, lead: real.lead, actor: { role: "admin" } })).includes("Re-check"));
  const stepSrc = readFileSync(join(REG, "ProjectStep.jsx"), "utf8");
  const recheckFn = stepSrc.slice(stepSrc.indexOf("async function recheck()"), stepSrc.indexOf("const showInSales"));
  ok("Re-check: a skipped lookup shows the server's words, never 'Updated'", /if \(r\.ok && r\.data\?\.skipped\) \{\s*setSiteMsg\(clean\(r\.data\.message\) \|\| RECHECK_SKIPPED\);/.test(recheckFn)
    && recheckFn.indexOf("skipped") < recheckFn.indexOf("Updated ") && stepSrc.includes('const RECHECK_SKIPPED = "Checked less than 10 minutes ago, so it wasn\'t run again.";'), recheckFn);
  ok("…'Updated' only after a lookup that ran, with the lookup's day; a failure shows the plain line", /Updated \$\{adelaideDay\(at && Number\.isFinite\(Date\.parse\(at\)\)/.test(recheckFn) && /r\.error \|\| RECHECK_FAILED/.test(recheckFn));
  ok("…through the staff route, not the admin geo route", stepSrc.includes("/site/recheck`") && !stepSrc.includes("/api/geo/enrich"));
  // P9: each "·" rides inside its item (and is clipped at a line start), so no line starts or ends with a stray dot.
  const idLine = h.slice(h.indexOf("overflow-x-clip", h.indexOf("for the architect&#x27;s brief <span")), h.indexOf("Change in Sales"));
  ok("identity line: every separator sits inside its item, none on its own", (idLine.match(/<span aria-hidden="true" class="inline-block w-\[12px\][^"]*">·<\/span>/g) || []).length === 4
    && !/<span aria-hidden="true">·<\/span>/.test(h), idLine.slice(0, 500));
  ok("…and the line is shifted and clipped by the separator's width", /class="min-w-0 flex-1 overflow-x-clip[^"]*"><p class="m-0 -ml-\[12px\] flex flex-wrap/.test(h));
  ok("the gap strip's links keep a 44 px tap without 44 px lines", /data-testid="project-gaps"[\s\S]*?min-h-0 py-\[11px\] -my-\[11px\] font-bold/.test(h));
  ok("'During the works': Moving out · Partly lived in ✓ · Living there", /aria-pressed="false"[^>]*>Moving out</.test(h) && /aria-pressed="true"[^>]*>(<svg[\s\S]*?<\/svg>)?Partly lived\u00a0in</.test(h) && h.includes(">Living there<"));
  const works = h.slice(h.indexOf('data-testid="works-segments"'), h.indexOf(">Living there<") + 20);
  const worksOpen = h.slice(h.lastIndexOf("<div", h.indexOf('data-testid="works-segments"')), h.indexOf('data-testid="works-segments"'));
  const segBtns = works.match(/<button[^>]*>/g) || [];
  ok("'During the works': no fixed-height row, so the border never takes 2 px off a segment (N8)", works.length > 0 && !/\bh-11\b|\bh-\[/.test(worksOpen), worksOpen);
  ok("…each segment is at least 44 px tall", segBtns.length === 3 && segBtns.every((b) => /\bmin-h-\[44px\]/.test(b)), segBtns.join("\n"));
  ok("…and on a phone 'Partly lived in' fits: 15 px, tight lines, allowed two lines (never cut or squeezed out)", segBtns.every((b) => /\btext-\[15px\]/.test(b) && /\bleading-tight\b/.test(b) && /\bmin-w-0\b/.test(b) && /\btext-center\b/.test(b)
    && !/\btruncate\b|\boverflow-hidden\b|\bwhitespace-nowrap\b/.test(b)), segBtns[1]);
  ok("…wrapping as 'Partly / lived in' (its last two words kept together), the two-word labels free to wrap", works.includes("Partly lived\u00a0in") && works.includes(">Moving out<") && !works.includes("Moving\u00a0out"));
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
  ok("read-only: no 'Re-check'", !text(ro).includes("Re-check"));
  const legacyJob = load((j) => { j.context.legacyArchitectName = "Studio X Architects"; });
  const hl = R.step({ reg: legacyJob.register, context: legacyJob.context, lead: legacyJob.lead });
  ok("an architect typed in Sales shows under the Architect row ('Noted in Sales')", text(hl).includes("Architect Not named Name the architect Noted in Sales: “Studio X Architects”"), text(hl).slice(text(hl).indexOf("Design team"), text(hl).indexOf("Design team") + 300));
  ok("…and still reads 'Not named': the brief prints only a contact", text(hl).includes("Architect Not named"));
  ok("'Not named' never wraps under the button (phone)", /whitespace-nowrap text-sm font-bold text-amber-800">Not named</.test(hl) && /class="flex basis-full pl-\[122px\] sm:basis-auto sm:pl-0"><button[^>]*data-focus-key="architect"/.test(hl));

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
  const pending = text(R.story({ context: { ...real.context, budget: { ...real.context.budget, confirmed: budgetConfirmedOn("Pending bank approval"), confirmedNote: confirmedNoteOf("Pending bank approval") } }, fields: ["confirmed"] }));
  ok("a hopeful note in Sales reads as not confirmed, and says how to confirm", /aria-pressed="false"/.test(R.story({ context: { ...real.context, budget: { ...real.context.budget, confirmed: false, confirmedNote: "Pending bank approval" } }, fields: ["confirmed"] }))
    && pending.includes("Noted in Sales: “Pending bank approval”. Tick “Confirmed with the client” once they confirm."), pending);
  ok("no question codes in the story fields", !codes(R.story({ context: real.context })));
  const p = text(R.panel({ lead: real.lead, context: real.context }));
  ok("the name-the-architect sheet: title, search, '+ Add someone new', footnote", p.includes("Name the architect") && /placeholder="Search people and firms"/.test(R.panel({ lead: real.lead, context: real.context })) && p.includes("Add someone new") && p.includes("Saved to the client's contacts — Sales shows the same."));
  ok("the panel names other roles", text(R.panel({ lead: real.lead, context: real.context, role: "engineer" })).includes("Name the engineer"));
  const legacyCtx = { ...real.context, legacyArchitectName: "Studio X Architects" };
  ok("naming the architect starts from the name typed in Sales", /type="search"[^>]*value="Studio X Architects"/.test(R.panel({ lead: real.lead, context: legacyCtx })));
  ok("…but not when changing an architect, or for another role", /type="search"[^>]*value=""/.test(R.panel({ lead: real.lead, context: legacyCtx, replaces: { roleId: "r1" } })) && /type="search"[^>]*value=""/.test(R.panel({ lead: real.lead, context: legacyCtx, role: "engineer" })));
  const teamSrc = readFileSync(join(REG, "DesignTeamCard.jsx"), "utf8");
  ok("the search box waits for the sheet to hand it focus (no autofocus fight)", /type="search"[^>]*data-autofocus=""/.test(R.panel({ lead: real.lead, context: real.context }))
    && !/type="search"[^\n]*autoFocus/.test(teamSrc) && /querySelector\("\[data-autofocus\]"\)/.test(teamSrc));
  ok("after a save the panel resets (no second Save of the same person)", /setAdding\(false\); setForm\(EMPTY_FORM\); setQ\(""\)/.test(teamSrc) && /inFlight\.current/.test(teamSrc));
  ok("an email someone else uses offers 'Use <them>' or 'Back'", /r\.code === "EMAIL_IN_USE"/.test(teamSrc) && teamSrc.includes("Use {clash.name || \"them\"}"));
  const tm = text(R.team({ lead: real.lead, context: { ...real.context, consultants: merged }, readOnly: true }));
  ok("read-only design team: names, no buttons", tm.includes("Ava Arch — Arch Studio") && tm.includes("Eli Beam — Beam Engineers") && !tm.includes("Name the architect") && !tm.includes("Another consultant"));
  ok("the others follow, in plain words", tm.includes("Land surveyor Sam Level — Level Survey") && tm.includes("Soil and geotech Sam Level — Level Survey"));
} catch (e) {
  ok("the project step renders", false, e?.stack || e);
} finally {
  rmSync(dir, { recursive: true, force: true });
  rmSync(out, { force: true });
}

section("Round 5 (K2): the same person in a second discipline is one contact");
{
  const nora = { id: "c-nora", first_name: "Nora", last_name: "Watts", company: "Star Ratings", phone: "0412 000 111", email: null };
  const rows = [{ id: "rr1", status: "active", role: "consultant", contact: nora }, { id: "rr2", status: "active", role: "engineer", contact: { id: "c-eng", first_name: "Eli", last_name: "Beam", company: "Beam Engineers", phone: "0400 222 333" } }];
  const energyRoster = [{ role: "energy", contactId: "c-nora" }];
  ok("Nora, same firm and phone, named again as the land surveyor (both stored as 'consultant') → her contact, no duplicate", sameNamedOnJob(rows, { name: "Nora Watts", company: "star ratings", phone: "+61 412 000 111", role: "land_surveyor" }, energyRoster)?.id === "c-nora");
  ok("…and as an engineer (another stored role) → her contact", sameNamedOnJob(rows, { name: "Nora Watts", company: "Star Ratings", phone: "0412000111", role: "engineer" }, energyRoster)?.id === "c-nora");
  ok("same name and firm but no phone typed → a new contact (a duplicate is the safe failure)", sameNamedOnJob(rows, { name: "Nora Watts", company: "Star Ratings", role: "land_surveyor" }, energyRoster) === null);
  ok("same name and phone but another firm → a new contact", sameNamedOnJob(rows, { name: "Nora Watts", company: "Other Co", phone: "0412 000 111", role: "land_surveyor" }, energyRoster) === null);
  ok("same name and firm, a different phone → a new contact, never a merge of two people", sameNamedOnJob(rows, { name: "Nora Watts", company: "Star Ratings", phone: "0499 999 999", role: "land_surveyor" }, energyRoster) === null);
  ok("someone who has left the job is not reused in another discipline", sameNamedOnJob([{ ...rows[0], status: "inactive" }], { name: "Nora Watts", company: "Star Ratings", phone: "0412 000 111", role: "land_surveyor" }, energyRoster) === null);
  ok("the same discipline still reuses as before", sameNamedOnJob(rows, { name: "Nora Watts", company: "Star Ratings", role: "energy" }, energyRoster)?.id === "c-nora");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
