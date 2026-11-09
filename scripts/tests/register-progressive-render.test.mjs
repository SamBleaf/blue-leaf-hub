/**
 * register-progressive-render.test.mjs — renders the real PromptRow for every question in the library and checks what
 * staff are offered (R05 P4a, Tab 27 Gate 2). Bundles with esbuild and renders to a string: no browser, server or
 * database. It proves which controls appear. Clicks, keyboard and saving are in sandbox-register-guided.test.mjs.
 *
 * Run: node scripts/tests/register-progressive-render.test.mjs
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dir = mkdtempSync(join(tmpdir(), "register-render-"));
const out = join(REPO, "node_modules", ".cache", `register-render-${process.pid}.mjs`);
const entry = join(dir, "entry.jsx");
const REG = join(REPO, "src/components/sales/lead-detail/register");
writeFileSync(entry, `
import { renderToStaticMarkup } from "react-dom/server";
import PromptRow, { RepeatRows } from ${JSON.stringify(join(REG, "PromptRow.jsx"))};
import { QUESTIONS, ANSWER_CONFIG } from ${JSON.stringify(join(REPO, "src/lib/registerQuestions.js"))};
import * as R from ${JSON.stringify(join(REPO, "src/lib/register.js"))};
export { QUESTIONS, ANSWER_CONFIG, R };
const noop = () => {};
export const row = (props) => renderToStaticMarkup(<PromptRow onChange={noop} {...props} />);
export const rows = (props) => renderToStaticMarkup(<RepeatRows upsertItem={noop} updateItem={noop} deleteItem={noop} {...props} />);
`);
await build({
  entryPoints: [entry], outfile: out, bundle: true, format: "esm", platform: "node", jsx: "automatic", logLevel: "silent",
  nodePaths: [join(REPO, "node_modules")], external: ["react", "react-dom", "react-dom/server", "react-router-dom"],
  define: { "import.meta.env": "{}" }, loader: { ".png": "empty", ".svg": "empty", ".css": "empty" },
});

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${String(detail).slice(0, 400)}` : ""}`); } };
const section = (t) => console.log(`\n▸ ${t}`);

try {
  const { row, rows, QUESTIONS, ANSWER_CONFIG, R } = await import(pathToFileURL(out).href);
  const q = (id) => QUESTIONS.find((x) => x.id === id);
  const c = (id) => ANSWER_CONFIG[id];
  const seed = (id, more = {}) => ({ itemKind: q(id).itemKind, category: q(id).category, promptKey: id, technicalStatus: q(id).technical, ...more });
  const item = (id, more = {}) => R.makeItem(seed(id, more));
  const pressedCount = (h) => (h.match(/aria-pressed="true"/g) || []).length;

  section("Every question the screens can show");
  const shown = QUESTIONS.filter((x) => x.itemKind && !["prefill", "folded", "context"].includes(c(x.id).handling));
  const genericDisposition = /Existing to Remain/;
  const offenders = { disp: [], chips: [], quick: [], typed: [] };
  for (const x of shown) {
    const h = row({ question: x, item: null, seed: seed(x.id) });
    if (genericDisposition.test(h)) offenders.disp.push(x.id);
    if (/>\+ [A-Z]/.test(h.replace(/\+ More detail|\+ Note|\+ Add another/g, ""))) offenders.chips.push(x.id);
    if (/>Undecided</.test(h)) offenders.quick.push(x.id);
    if (c(x.id).handling === "choice" && /Direction \/ product|What&#x27;s being done|Required outcome/.test(h)) offenders.typed.push(x.id);
  }
  ok(`all ${shown.length} render without the generic work dropdown`, offenders.disp.length === 0, offenders.disp.join(" "));
  ok("none still has + chips that add words to a sentence", offenders.chips.length === 0, offenders.chips.join(" "));
  ok("none shows the old N/A / Excluded / Undecided row", offenders.quick.length === 0, offenders.quick.join(" "));
  ok("no choice question opens on an empty sentence box", offenders.typed.length === 0, offenders.typed.join(" "));

  section("Whole House rows");
  {
    const floor = seed("W-017", { isDefault: true });
    const none = rows({ question: q("W-017"), items: [], seed: floor });
    ok("each zone is its own row with no zone to tap", ["main_floor", "bedroom_floor", "wet_area_floor"].every((z) => none.includes(`data-testid="slot-W-017-${z}"`)) && !/data-testid="zone-W-017-/.test(none));
    ok("the question is written once, not on every row", (none.match(/General interior floor palette/g) || []).length === 1);
    ok("the rarer zone is a button", /add-zone-W-017-other_zone/.test(none) && !/Add another/.test(none));
    const paint = rows({ question: q("W-019"), items: [], seed: seed("W-019", { isDefault: true }) });
    ok("every surface says what is usual, and no finish chip shows", (paint.match(/Usual finish for this surface/g) || []).length === 4 && !/choice-W-019-finish_level/.test(paint));
    const kit = rows({ question: q("K-005"), items: [], seed: seed("K-005", { isDefault: true, section: "project" }) });
    ok("a standard on Whole House lays out its zone and offers the rare one", /slot-K-005-kitchen/.test(kit) && /add-zone-K-005-scullery/.test(kit) && !/slot-K-005-scullery/.test(kit));
    const inARoom = row({ question: q("K-005"), item: null, seed: seed("K-005", { roomId: "room_1" }) });
    ok("the same question in a room has no zones", !/zone-K-005|slot-K-005|Applies to/.test(inARoom) && /card-K-005/.test(inARoom));
    const roof = item("W-014", { isDefault: true, answer: R.toggleOption(c("W-014"), null, ["metal_roofing"]) });
    const gutter = R.makeItem({ ...seed("W-014"), answer: { element: { key: "gutters", label: "Gutters" }, linkedItemIds: [roof.id], selected: [{ path: ["quad"], label: "Quad" }], state: "recorded", v: 1 } });
    const g = row({ question: q("W-014"), item: gutter });
    ok("a gutter row is titled and tested as gutters, and shows only gutter choices", />Gutters</.test(g) && /card-W-014-gutters/.test(g) && /choice-W-014-gutters-box_gutter/.test(g) && !/Metal roofing/.test(g));
    const asg = row({ question: q("W-017"), item: null, seed: seed("W-017"), assumptionOf: () => ({ tier: "upgraded", text: "Engineered timber." }) });
    ok("an assumption is labelled as Blue Leaf's, with what it isn't", /Blue Leaf pricing assumption \(Upgraded, draft wording\)/.test(asg) && /Not a client choice, an approval or a price/.test(asg));
    ok("and is only there when one applies", !/pricing assumption/.test(row({ question: q("W-017"), item: null, seed: seed("W-017"), assumptionOf: () => null })));
    const w22 = rows({ question: q("W-022"), items: [], seed: seed("W-022") });
    ok("an inclusion line has its owner on the card, and By others", /owner —/.test(w22) && />By others</.test(w22));
  }

  section("Site access");
  const blank = row({ question: q("W-001"), item: null, seed: seed("W-001") });
  ok("each option is a button with a pressed state", (blank.match(/aria-pressed="false"/g) || []).length >= 9 && /Steep access/.test(blank));
  ok("buttons stay buttons, so keyboard and touch work", /type="button"/.test(blank) && /focus-ring/.test(blank));
  ok("Not decided and N/A are there", /Not decided/.test(blank) && />N\/A</.test(blank));
  ok("By others is not offered on a fact", !/By others/.test(blank));
  const set = row({ question: q("W-001"), item: item("W-001", { answer: R.toggleOption(c("W-001"), null, ["steep_access"]) }) });
  ok("the chosen one is pressed, with a tick as well as colour", pressedCount(set) === 1 && /✓/.test(set));
  ok("what's recorded is written out", /Recorded: <span[^>]*>Steep access/.test(set));
  ok("the office fields offer no scope status, quantity or pricing on a fact", (() => { const h = row({ question: q("W-001"), item: item("W-001") }); return /Office fields/.test(h) && !/Quantity/.test(h); })());

  section("Conditional follow-ups");
  const yes = row({ question: q("W-007"), item: item("W-007", { answer: R.toggleOption(c("W-007"), null, ["yes"]) }) });
  ok("Yes shows only what follows from it", /Temporary kitchen/.test(yes));
  ok("nothing follows before it is chosen", !/Temporary kitchen/.test(row({ question: q("W-007"), item: null, seed: seed("W-007") })));
  const a = R.toggleOption(c("W-013"), R.toggleOption(c("W-013"), null, ["masonry"]), ["masonry", "face_brick"]);
  const moved = R.toggleOption(c("W-013"), a, ["render"]);
  const kept = row({ question: q("W-013"), item: item("W-013", { answer: moved, product: "Example" }) });
  ok("a changed branch shows what to check", /Check these/.test(kept) && /Masonry · Face brick/.test(kept) && /Use again/.test(kept));
  ok("and warns about product details entered before it", /entered before the change/.test(kept));

  section("Unresolved");
  const parked = row({ question: q("W-013"), item: item("W-013", { answer: R.toggleNotDecided(c("W-013"), null) }) });
  ok("all four reasons and Client unsure appear", ["Decide later", "Blue Leaf to advise", "Designer / consultant to confirm", "Awaiting drawings / info", "Client unsure"].every((t) => parked.includes(t)));
  ok("there is an owner control", /Who has it/.test(parked));
  ok("no note is demanded", !/required/i.test(parked.replace(/aria-[a-z]+/g, "")));
  ok("before Not decided, no reasons clutter the card", !/Decide later/.test(blank));

  section("Other forms");
  ok("an office note is text and an owner, no disposition", (() => { const h = row({ question: q("E-001"), item: null, seed: seed("E-001") }); return /owner/.test(h) && !genericDisposition.test(h) && !/aria-pressed/.test(h); })());
  ok("a technical requirement note has no client status", !/Client wants/.test(row({ question: q("R-015"), item: null, seed: seed("R-015") })));
  ok("an action on the card keeps its owner and Done", (() => { const h = row({ question: q("W-011"), item: null, seed: seed("W-011") }); return /owner —/.test(h) && /Done/.test(h); })());
  ok("a choice has no Done box", !/Done/.test(row({ question: q("K-005"), item: null, seed: seed("K-005") })));
  ok("a decision record asks what it is about", /What needs to happen/.test(row({ question: q("W-025"), item: null, seed: seed("W-025") })));
  const records = QUESTIONS.filter((x) => c(x.id).handling === "record");
  ok(`all ${records.length} typed records offer an owner on the card`, records.length === 9 && records.every((x) => /owner —/.test(row({ question: x, item: null, seed: seed(x.id) }))), records.filter((x) => !/owner —/.test(row({ question: x, item: null, seed: seed(x.id) }))).map((x) => x.id).join());
  ok("M-006 has the owner without an action's Done box", (() => { const h = row({ question: q("M-006"), item: null, seed: seed("M-006") }); return /owner —/.test(h) && !/Done/.test(h); })());
  const pri = row({ question: q("P-005"), item: null, seed: seed("P-005") });
  ok("priorities offer a note, and say the client reads it", /data-testid="client-note-P-005"/.test(pri) && /the client reads this/.test(pri));
  ok("no other card shows it", !/client-note/.test(row({ question: q("W-013"), item: null, seed: seed("W-013") })));
  ok("a locked record with no note shows no empty box", !/client-note/.test(row({ question: q("P-005"), item: item("P-005"), readOnlyReason: "Read-only" })));
  ok("a locked record with a note still shows it", /Growing family/.test(row({ question: q("P-005"), item: item("P-005", { answer: R.setClientNote(c("P-005"), null, "Growing family") }), readOnlyReason: "Read-only" })));
  ok("a choice shows the settle-outs", (() => { const h = row({ question: q("K-005"), item: null, seed: seed("K-005") }); return /By others/.test(h) && /Excluded/.test(h); })());

  section("Existing records");
  const legacy = row({ question: q("W-017"), item: item("W-017", { description: "Engineered oak, matt, living zones" }) });
  ok("typed text is shown, editable, and not read as a choice", /Written earlier/.test(legacy) && /value="Engineered oak, matt, living zones"/.test(legacy) && pressedCount(legacy) === 0);
  const custom = row({ question: null, item: R.makeItem({ itemKind: "scope", category: "scope", description: "Custom works" }) });
  ok("a custom item keeps its typed row and work status", genericDisposition.test(custom) && /value="Custom works"/.test(custom) && />Undecided</.test(custom) && !/aria-pressed/.test(custom));
  const byKey = row({ question: null, item: item("W-001", { answer: R.toggleOption(c("W-001"), null, ["steep_access"]) }) });
  ok("the office table's row finds its question from the item", /Site access/.test(byKey) && pressedCount(byKey) === 1 && !genericDisposition.test(byKey));
  const legacyKey = row({ question: null, item: R.makeItem({ itemKind: "selection", promptKey: "wh_flooring", description: "Oak" }) });
  ok("an R02 prompt key resolves to its question", /Floor palette by zone/.test(legacyKey) && /Written earlier/.test(legacyKey));
  const future = row({ question: q("W-001"), item: item("W-001", { answer: { v: 99, state: "recorded" } }) });
  ok("an answer from a newer version isn't edited here", !/card-W-001/.test(future));
  ok("and a site fact still gets no work dropdown", !genericDisposition.test(future));
  const locked = row({ question: q("K-005"), item: item("K-005", { sync: { table: "client_selections", locked: true, status: "approved" }, answer: R.toggleOption(c("K-005"), null, ["timber"]) }) });
  ok("a locked item shows its answer and can't be changed", pressedCount(locked) === 1 && /disabled=""/.test(locked) && !/Not decided/.test(locked));
  const inh = R.makeItem({ itemKind: "selection", promptKey: "W-017", isDefault: true, answer: R.toggleOption(c("W-017"), null, ["timber"]) });
  ok("an inherited default reads from its answer", /Whole-house default: <span[^>]*>Timber/.test(row({ question: q("R-005"), item: null, seed: seed("R-005"), inherited: inh, onMakeException: () => {} })));

  ok("an older N/A shows as N/A", /aria-pressed="true"[^>]*data-testid="na-W-017"|data-testid="na-W-017"[^>]*aria-pressed="true"/.test(row({ question: q("W-017"), item: item("W-017", { disposition: "na" }) })) || pressedCount(row({ question: q("W-017"), item: item("W-017", { disposition: "na" }) })) === 1);
  const pilot = row({ question: q("W-001"), item: item("W-001", { disposition: "included", description: "Tight access" }) });
  ok("an older work status on a site fact stays readable and can be cleared", /Earlier work status: <span[^>]*>Included/.test(pilot) && /Clear/.test(pilot));
  ok("a status the card shows doesn't repeat", !/Earlier work status/.test(row({ question: q("W-017"), item: item("W-017", { disposition: "by_others" }) })) && !/Earlier work status/.test(row({ question: q("K-001"), item: item("K-001", { disposition: "new", answer: R.toggleOption(c("K-001"), null, ["new_kitchen"]) }) })));
  ok("an older answer on a question that sets the disposition is still shown", /Earlier work status: <span[^>]*>New/.test(row({ question: q("K-001"), item: item("K-001", { disposition: "new" }) })));

  const pressedPill = (h, id) => new RegExp(`aria-pressed="true"[^>]*data-testid="${id}"`).test(h);
  const deferred = row({ question: q("K-005"), item: item("K-005", { disposition: "deferred", answer: { v: 1, state: "recorded", nature: "choice", selected: [] } }) });
  ok("a saved Deferred is on the card when it opens, with More detail still shut", pressedPill(deferred, "settle-K-005-deferred") && /aria-expanded="false"[^>]*data-testid="more-K-005"/.test(deferred));
  ok("without bringing the other rarer pill with it", !/settle-K-005-retain/.test(deferred));
  ok("nor a second copy of the status", !/earlier-status-K-005/.test(deferred));
  const retained = row({ question: q("K-005"), item: item("K-005", { disposition: "retain" }) });
  ok("so is a saved Existing to remain", pressedPill(retained, "settle-K-005-retain") && !/settle-K-005-deferred/.test(retained));
  ok("a card with neither shows neither until asked", !/settle-K-005-(deferred|retain)/.test(row({ question: q("K-005"), item: item("K-005") })));
  const suppliedRow = (more) => row({ question: q("K-008"), item: item("K-008", { supplyBy: "client", answer: R.toggleOption(c("K-008"), R.chooseElement(c("K-008"), null, "oven"), ["client"]), ...more }) });
  ok("a status the chosen who-supplies option doesn't say stays readable and can be cleared", /Earlier work status: <span[^>]*>Included/.test(suppliedRow({ disposition: "included" })) && /Clear/.test(suppliedRow({ disposition: "included" })));
  ok("with none recorded there is nothing extra", !/Earlier work status/.test(suppliedRow({})));
  const finishRow = row({ question: q("K-004"), item: item("K-004", { colour: "Dulux Natural White", product: "Polytec", manufacturer: "Laminex", model: "M1" }) });
  ok("finish and product recorded are on the card when it opens", /data-testid="details-K-004"/.test(finishRow) && /Laminex Polytec M1 · Dulux Natural White/.test(finishRow));
  ok("no line when there are none", !/data-testid="details-K-004"/.test(row({ question: q("K-004"), item: item("K-004") })));
  const noStair = row({ question: q("H-001"), item: item("H-001", { disposition: "na", answer: R.toggleOption(c("H-001"), null, ["no_stair"]) }) });
  ok("H-001 No stair shows once: no second N/A to light up", pressedCount(noStair) === 1 && !/data-testid="na-H-001"/.test(noStair) && /Not applicable/.test(noStair) && !/earlier-status-H-001/.test(noStair));
  ok("an older N/A on a question with its own N/A option stays readable", /Earlier work status: <span[^>]*>N\/A/.test(row({ question: q("H-001"), item: item("H-001", { disposition: "na" }) })));
  const lockedSettled = row({ question: q("K-005"), item: item("K-005", { disposition: "by_others", sync: { table: "client_selections", locked: true, status: "approved" } }) });
  ok("a locked card can't show the pills, so the status is written out, with no Clear", /Work status: <span[^>]*>By Others/.test(lockedSettled) && !/>Clear</.test(lockedSettled));
  const wordsKept = R.chooseZone(c("W-017"), R.setZoneWords(c("W-017"), R.chooseZone(c("W-017"), null, "other_zone"), "Rear gable"), "main_floor");
  const wordsRow = row({ question: q("W-017"), item: item("W-017", { answer: wordsKept }) });
  ok("words kept from an Other zone are listed to check, with Remove and no Use again", /Check these/.test(wordsRow) && /Rear gable/.test(wordsRow) && />Remove</.test(wordsRow) && !/Use again/.test(wordsRow));

  section("Repeating");
  const none = rows({ question: q("W-010"), items: [], seed: seed("W-010") });
  ok("with nothing recorded there is one open row and nothing to add yet", /card-W-010/.test(none) && !/add-another/.test(none) && !/Add another/.test(none));
  const one = rows({ question: q("W-010"), items: [item("W-010", { answer: R.chooseElement(c("W-010"), null, "driveway") })], seed: seed("W-010") });
  ok("once there is one, + Add another appears", /Add another/.test(one) && (one.match(/card-W-010/g) || []).length === 1);
  const ro = rows({ question: q("W-010"), items: [item("W-010")], seed: seed("W-010"), readOnly: true });
  ok("read-only can't add another", !/Add another/.test(ro));
  ok("elements come before actions and details wait", (() => { const h = rows({ question: q("W-010"), items: [], seed: seed("W-010") }); return h.indexOf("Driveway") < h.indexOf(">New<") && !/Exposed aggregate/.test(h); })());

  section("In the source");
  const prompt = readFileSync(join(REG, "PromptRow.jsx"), "utf8");
  ok("appendOption is gone", !/appendOption/.test(prompt));
  const context = readFileSync(join(REG, "ContextStep.jsx"), "utf8");
  ok("priorities are no longer a comma string", !/setPriorities/.test(context) && /renderPrompt\(q, "project"\)/.test(context));
  ok("the card has no way to approve, verify or price", !/client_approved|technicalStatus|technicalEvidence|pricingStatus|pricingRef/.test(readFileSync(join(REG, "ProgressiveChoiceCard.jsx"), "utf8")));
  ok("nor does the logic behind it", !/client_approved|technicalStatus|technicalEvidence|pricingStatus|pricingRef/.test(readFileSync(join(REPO, "src/lib/registerChoice.js"), "utf8").replace(/\/\*\*[\s\S]*?\*\//g, "")));
  const card = readFileSync(join(REG, "ProgressiveChoiceCard.jsx"), "utf8");
  ok("the card uses tokens, no raw colours", !/#[0-9a-fA-F]{3,6}\b/.test(card.replace(/\/\*\*[\s\S]*?\*\//g, "")));
} catch (e) {
  fail++; console.log(`  ✗ test stopped: ${String(e.stack || e).slice(0, 800)}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
  rmSync(out, { force: true });
}
console.log(`\nregister-progressive-render: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
