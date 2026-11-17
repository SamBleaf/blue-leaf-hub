/**
 * register-section-step.test.mjs — the Throughout and Site & existing steps (REGISTER_SCREENS_SPEC.md S3: "the same
 * compact row is used on the Throughout and Site & existing steps"), and PromptRow's office mode ("Product details…").
 *
 *   sectionLayout() (src/lib/sectionLayout.js): every question at every stage (detail and tender ones under "More
 *   choices"), and every record reachable (M2); then the real SectionStep and PromptRow rendered to a string with
 *   esbuild (no browser, server or database): no question codes or system words on screen (M12, M13), phone inputs 16 px.
 *
 *   node scripts/tests/register-section-step.test.mjs
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { makeItem, emptyMeta, questionById, resolvePromptId, answerConfigFor } from "../../src/lib/register.js";
import { sectionLayout, stepOfQuestion } from "../../src/lib/sectionLayout.js";
import { realJob } from "../documents/fixtures/real-extension-job.mjs";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 700)}` : ""}`); } };
const section = (t) => console.log(`\n${t}`);
const flat = (o) => JSON.stringify(o);
const load = () => { const j = realJob(); return { ...j, register: { meta: emptyMeta(j.register.meta), items: j.register.items.map((i) => makeItem(i)) } }; };
const { register, context } = load();
const withItems = (reg, more) => ({ ...reg, items: [...reg.items, ...more.map((i) => makeItem(i))] });
const where = (lay, qid) => {
  for (const t of lay.topics) for (const g of ["primary", "more", "office"]) if (t[g].some((q) => q.id === qid)) return `${t.key}:${g}`;
  return null;
};
const allQs = (lay) => lay.topics.flatMap((t) => [...t.primary, ...t.more, ...t.office]).map((q) => q.id);

section("Every question at every stage (M2: 'Show detailed prompts' is retired)");
{
  const early = { ...context, stage: "winning_offer" };
  const w23 = { id: "x23", promptKey: "W-023", itemKind: "scope", section: "project", category: "inclusions", answer: { v: 1, state: "recorded" } };
  const reg = withItems(register, [w23]);
  const lay = sectionLayout(reg, early, "project", { stage: "winning_offer" });
  ok("at winning offer, a detail question with a record has its row, under More choices", where(lay, "W-023") === "inclusions:more" && lay.shownIds.has("x23"), where(lay, "W-023"));
  const bare = sectionLayout(register, early, "project", { stage: "discovery" });
  ok("…and without a record it is still offered (detail and tender questions at every stage)", where(bare, "W-023") === "inclusions:more" && where(sectionLayout(register, early, "site", { stage: "discovery" }), "W-002") === "consultants:more");
  ok("office-only questions sit in Office only", where(bare, "W-024") === "services:office" && where(sectionLayout(register, early, "site", { stage: "discovery" }), "W-012") === "consultants:office");
  ok("essential questions are the primary rows", where(bare, "W-013") === "envelope:primary" && where(bare, "K-005") === "kitchen_joinery:primary");
  ok("a house standard's own tier and topic are used (splashback: more detail, kitchen and joinery)", where(bare, "K-006") === "kitchen_joinery:more");
  ok("no question is in two groups", [bare, sectionLayout(register, early, "site", { stage: "discovery" })].every((l) => new Set(allQs(l)).size === allQs(l).length));
  ok("the client's story and the brief belong to The project step", !allQs(bare).some((id) => questionById(id)?.topic === "brief") && !allQs(bare).includes("P-005"));
  ok("…and so do the facts read from Sales (project type and delivery is never a row here)", !allQs(bare).includes("P-007") && !allQs(sectionLayout(register, context, "site")).includes("P-007"));
  ok("'Areas in the project' is Site's", where(sectionLayout(register, context, "site"), "P-006") === "existing:primary" && !allQs(bare).includes("P-006"));
  ok("W-006 and W-008 are reached from the existing-works row, not rows of their own", !allQs(sectionLayout(register, context, "site")).some((id) => ["W-006", "W-008"].includes(id)));
}

section("Nothing is hidden (the real job: every house-level record is reachable)");
{
  const proj = sectionLayout(register, context, "project", { stage: context.stage });
  const site = sectionLayout(register, context, "site", { stage: context.stage });
  const houseLevel = register.items.filter((i) => !i.roomId);
  // The client's story (P- brief questions) and the management questions are on The project step.
  const onProjectStep = (i) => { const q = questionById(resolvePromptId(i.promptKey)); return !!q && (q.section === "mgmt" || (q.section === "project" && q.topic === "brief" && q.id !== "P-006")); };
  const lost = houseLevel.filter((i) => !proj.shownIds.has(i.id) && !site.shownIds.has(i.id) && !onProjectStep(i));
  ok(`all ${houseLevel.length} house-level records are on Throughout, Site & existing or The project`, lost.length === 0, flat(lost.map((i) => [i.id, i.promptKey])));
  ok("…and none is on both steps", houseLevel.every((i) => !(proj.shownIds.has(i.id) && site.shownIds.has(i.id))));
  ok("gutters sit under their roof, as rows of the roof question", proj.shownIds.has("i27") && proj.linked(questionById("W-014")).under("i05").some((i) => i.id === "i27"));
  ok("the house standards' records (kitchen, wet areas, laundry) are Throughout's", ["i36", "i37", "i38", "i39", "i40", "i41", "i42", "i43", "i44"].every((id) => proj.shownIds.has(id)));
  ok("the living-on-site answer still shows on Site (moved to The project's 'During the works')", site.shownIds.has("i12") && !!where(site, "W-007"));
  ok("the real job has nothing left over", proj.other.length === 0 && site.other.length === 0, flat([...proj.other, ...site.other].map((i) => i.id)));

  const legacy = { id: "x30", promptKey: "wh_custom_old", itemKind: "selection", section: "project", description: "Old standard" };
  const second = { id: "x31", promptKey: "W-015", itemKind: "requirement", section: "project", description: "Second windows note" };
  const reg2 = withItems(register, [legacy, second]);
  const p2 = sectionLayout(reg2, context, "project");
  ok("a record whose question isn't offered at all (a legacy key) is under 'Other things recorded here'", p2.other.some((i) => i.id === "x30"));
  ok("so is a second record on a single question (the row shows the first)", p2.other.some((i) => i.id === "x31") && p2.rowItems(questionById("W-015"))[0].id === "i06");
  const nb = { ...context, projectType: "new_build" };
  const w4 = { id: "x32", promptKey: "W-004", itemKind: "scope", section: "site", category: "demolition", answer: { v: 1, state: "recorded" } };
  const s3 = sectionLayout(withItems(register, [w4]), nb, "site");
  ok("a renovation question on a new build with a record keeps its row (the existing-works row)", !!s3.existing && s3.existing.records.some((i) => i.id === "x32") && s3.shownIds.has("x32") && !!where(s3, "W-004"));
  ok("…without one, a new build isn't asked it", !sectionLayout(register, nb, "site").existing && !where(sectionLayout(register, nb, "site"), "W-004"));
  ok("which step a question belongs to", stepOfQuestion(questionById("W-013")) === "project" && stepOfQuestion(questionById("K-005")) === "project" && stepOfQuestion(questionById("P-006")) === "site"
    && stepOfQuestion(questionById("W-001")) === "site" && stepOfQuestion(questionById("P-005")) === "" && stepOfQuestion(questionById("K-007")) === "");
  ok("the standard questions are configured as standards", !!answerConfigFor("K-005")?.standard);
}

// ── Rendered (esbuild → string, no browser) ────────────────────────────────────────────────────────
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REG = join(REPO, "src/components/sales/lead-detail/register");
const dir = mkdtempSync(join(tmpdir(), "register-section-step-"));
const out = join(REPO, "node_modules", ".cache", `register-section-step-${process.pid}.mjs`);
const entry = join(dir, "entry.jsx");
writeFileSync(entry, `
import { renderToStaticMarkup } from "react-dom/server";
import SectionStep from ${JSON.stringify(join(REG, "SectionStep.jsx"))};
import PromptRow from ${JSON.stringify(join(REG, "PromptRow.jsx"))};
import { NeedsActionProvider } from ${JSON.stringify(join(REG, "NeedsAction.jsx"))};
const noop = () => {};
export const step = (props) => renderToStaticMarkup(<NeedsActionProvider reg={props.reg} context={props.context}><SectionStep upsertItem={noop} updateItem={noop} deleteItem={noop} mutateMeta={noop} saveState={() => "saved"} {...props} /></NeedsActionProvider>);
export const office = (props) => renderToStaticMarkup(<PromptRow office onChange={noop} actionFlag={false} {...props} />);
`);
try {
  await build({
    entryPoints: [entry], outfile: out, bundle: true, format: "esm", platform: "node", jsx: "automatic", logLevel: "silent",
    nodePaths: [join(REPO, "node_modules")], external: ["react", "react-dom", "react-dom/server", "react-router-dom"],
    define: { "import.meta.env": "{}" }, loader: { ".png": "empty", ".svg": "empty", ".css": "empty" },
  });
  const R = await import(pathToFileURL(out).href);
  const shown = (h) => h.replace(/data-testid="[^"]*"/g, "").replace(/<[^>]+>/g, " ");
  const codes = (h) => (shown(h).match(/\b[A-Z]-\d{3}\b/g) || []);

  section("Rendered: Throughout and Site & existing (M12)");
  const proj = R.step({ section: "project", reg: register, context, stage: context.stage });
  const site = R.step({ section: "site", reg: register, context, stage: context.stage });
  for (const [name, h] of [["Throughout", proj], ["Site & existing", site]]) {
    ok(`${name}: no question codes on screen`, codes(h).length === 0, codes(h).join(" "));
    ok(`${name}: none of the old card chrome (Office fields, Recorded:, Explore more, kind chips, the quick N/A row)`,
      !/Office fields|Recorded:|Explore more|Show detailed prompts|Scope \/ works|Action \/ verification|>Undecided</.test(h) && !/text-\[10px\][^"]*">N\/A</.test(h));
    ok(`${name}: one card per topic, the room screen's rows (⚑ and ⋯ on each)`, /data-testid="topic-/.test(h) && /data-testid="choice-row-/.test(h) && /data-testid="needs-action-/.test(h) && /aria-label="More for /.test(h));
  }
  ok("Throughout: More choices and Office only, with their counts", /More choices \(\d+\)/.test(proj) && /Office only \(\d+\)/.test(proj));
  ok("Throughout: a house standard is laid out one row per zone, the rarer zone a button", /data-testid="slot-W-017-main_floor"/.test(proj) && /data-testid="slot-K-005-kitchen"/.test(proj) && /data-testid="add-zone-K-005-scullery"/.test(proj));
  ok("Throughout: gutters sit under the roof", /data-testid="choice-row-W-014"/.test(proj) && />Gutters</.test(proj));
  ok("Throughout: the intro is plain (no 'room exception')", !/room exception/i.test(shown(proj)) && shown(proj).includes("Every room reads these"));
  ok("Throughout: the pricing guide stays, without codes", /data-testid="baseline-guide"/.test(proj));
  ok("Site: the site strip is one plain line", shown(site).includes("Council, zone and bushfire are on The project.") && !/Site intelligence|flows to the Architect Brief|Complexity:/.test(shown(site)));
  ok("Site: 'Areas in the project' names each area with Included · Optional · Excluded · Deferred", /data-testid="choice-row-P-006"/.test(site) && />\+ Area</.test(site)
    && ["Included", "Optional", "Excluded", "Deferred"].every((t) => R.step({ section: "site", reg: withItems(register, [{ id: "x41", promptKey: "P-006", itemKind: "scope", section: "project", description: "Rear garden", disposition: "deferred" }]), context }).includes(`>${t}<`)));
  ok("Site: the existing-works row, with '+ New-to-existing connection'", /data-testid="existing-works"/.test(site) && /\+ New-to-existing connection/.test(site));
  ok("phone inputs are 16 px (text-base or text-[16px] on every text box)", (proj.match(/<input[^>]*class="[^"]*"/g) || []).every((t) => /text-base|text-\[16px\]/.test(t)), (proj.match(/<input[^>]*class="[^"]*"/g) || []).find((t) => !/text-base|text-\[16px\]/.test(t)));
  const legacy = withItems(register, [{ id: "x40", promptKey: "wh_custom_old", itemKind: "selection", section: "project", description: "Old standard" }]);
  ok("a record no row shows is listed: 'Other things recorded here (1)'", R.step({ section: "project", reg: legacy, context }).includes("Other things recorded here (1)"));
  ok("an empty job's Site step still draws its rows", /data-testid="topic-access"/.test(R.step({ section: "site", reg: { meta: emptyMeta({}), items: [] }, context })));

  section("Rendered: Product details (PromptRow office mode, M13)");
  const k5 = register.items.find((i) => i.id === "i38");
  const off = R.office({ question: questionById("K-005"), item: k5 });
  ok("no question code, kind or category chip, help line, record-type or disposition select", codes(off).length === 0 && !/Record type|Scope \/ disposition|Selection<|Benchtops?<\/span>|Office fields/.test(off), codes(off).join(" "));
  ok("the office fields are there", ["Product", "Manufacturer", "Model or code", "Finish or colour", "Supplier", "What the client reads: name", "Supplied by", "Client status", "Technical check", "Drawing or supplier reference"].every((t) => off.includes(t)));
  ok("the settle-outs moved here from ⋯: By others · Excluded · Deferred · Existing to remain", ["By others", "Excluded", "Deferred", "Existing to remain"].every((t) => off.includes(`>${t}<`)));
  ok("phone inputs are 16 px and 44 px tall", (off.match(/<input[^>]*class="[^"]*"/g) || []).every((t) => /text-\[16px\]/.test(t) && /min-h-\[44px\]/.test(t)) && (off.match(/<select[^>]*class="[^"]*"/g) || []).every((t) => /text-\[16px\]/.test(t)));
  const fixedK5 = makeItem({ ...k5, product: "Laminex", sync: { ...(k5.sync || {}), baselined: true } });
  const fixedOff = R.office({ question: questionById("K-005"), item: fixedK5 });
  ok("a record in the signed contract: content fixed, the technical check and reference still open (N21)", /Part of the signed contract — change it through a variation/.test(fixedOff)
    && /value="Laminex"[^>]*disabled=""|disabled=""[^>]*value="Laminex"/.test(fixedOff) && !/<input[^>]*disabled=""[^>]*placeholder="Sheet and revision/.test(fixedOff));

  section("In the source");
  const choiceRow = readFileSync(join(REG, "ChoiceRow.jsx"), "utf8");
  ok("ChoiceRow's ⋯ menu is spec S3's (D2): no settle-outs in it", !/settleOptions|settlePatch/.test(choiceRow) && ["Not decided yet", "Not needed here", "Note for the office (doesn&apos;t print)", "Product details…", "Remove answer"].every((t) => choiceRow.includes(t)));
  ok("ChoiceRow and PromptRow lock content with contractFixed (baselined or locked)", /locked = contractFixed\(it\)/.test(choiceRow) && /locked = contractFixed\(it\)/.test(readFileSync(join(REG, "PromptRow.jsx"), "utf8")));
  const needs = readFileSync(join(REG, "NeedsAction.jsx"), "utf8");
  ok("the sheet and the toast carry data-layer=\"sheet\" (M11)", (needs.match(/data-layer="sheet"/g) || []).length >= 3);
  const tender = readFileSync(join(REG, "TenderPanel.jsx"), "utf8");
  ok("the Tender tables scroll inside their own box (N31)", /overflow-x-auto/.test(tender) && /sm:w-40/.test(tender));
} catch (e) {
  fail++; console.log(`  ✗ test stopped: ${String(e.stack || e).slice(0, 800)}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
  rmSync(out, { force: true });
}

console.log(`\nregister-section-step: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
