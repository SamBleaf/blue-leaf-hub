/**
 * register-documents-ui.test.mjs — the Documents step and its edit drawer, rendered (esbuild → string, no browser), on the
 * anonymised REAL job (scripts/documents/fixtures/real-extension-job.mjs). REGISTER_SCREENS_SPEC.md S5. No database, no
 * network. Findings covered: M13 (no codes in the drawer, office Product details), M6 (the named architect with Change),
 * N2 (readiness counts the release blockers), N11 (marked lines say so in words), N12 (Mini labels its field), N14
 * ("Fix n" on the earlier-answer entry), N15 (the long guidance shows in the drawer), N16 (Re-check for every staff
 * member), N19 (section titles from briefSectionTitles), P3 (the delete question names the place; "Confirm the budget"),
 * P5 (only "Brief to follow." greys a room line; the budget line isn't grey), M1 (selects are 16 px on a phone), D1 (Sales
 * lines read only with "Change in Sales ›").
 *
 *   node scripts/tests/register-documents-ui.test.mjs
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { makeItem, emptyMeta } from "../../src/lib/register.js";
import { architectBriefModel, architectBriefLines, briefSectionTitles } from "../../src/lib/briefModel.js";
import { contentChecks, releaseBlockers } from "../../src/lib/registerQuality.js";
import { realJob } from "../documents/fixtures/real-extension-job.mjs";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 700)}` : ""}`); } };
const section = (t) => console.log(`\n${t}`);
const load = (tweak) => { const j = realJob(); tweak?.(j); return { ...j, register: { meta: emptyMeta(j.register.meta), items: j.register.items.map((i) => makeItem(i)) } }; };
const { lead, register, context } = load();

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REG = join(REPO, "src/components/sales/lead-detail/register");
const dir = mkdtempSync(join(tmpdir(), "register-documents-ui-"));
const out = join(REPO, "node_modules", ".cache", `register-documents-ui-${process.pid}.mjs`);
const entry = join(dir, "entry.jsx");
writeFileSync(entry, `
import { renderToStaticMarkup } from "react-dom/server";
import EditDrawer from ${JSON.stringify(join(REG, "EditDrawer.jsx"))};
import DocumentsStep, { PrintList, CheckEntries } from ${JSON.stringify(join(REG, "DocumentsStep.jsx"))};
import { Mini, Select } from ${JSON.stringify(join(REG, "ui.jsx"))};
const noop = () => {};
const store = { mutateMeta: noop, replaceItems: noop, upsertItem: noop, updateItem: noop, deleteItem: noop, addItem: noop, patchLead: async () => true, reloadContext: noop, onPortalItem: noop };
export const drawer = (props) => renderToStaticMarkup(<EditDrawer actor={{ id: "u1", role: "staff" }} readOnly={false} saveStateOf={() => "saved"} onClose={noop} onPreview={noop} saveText="Saved ✓" {...store} {...props} />);
export const step = (props) => renderToStaticMarkup(<DocumentsStep stage="consultants" info={{}} flush={async () => true} saveStateOf={() => "saved"} actor={{ id: "u1" }} saveText="" {...store} {...props} />);
export const list = (props) => renderToStaticMarkup(<PrintList onlyWarned={false} setOnlyWarned={noop} onOpen={noop} previewLines={null} {...props} />);
export const entries = (props) => renderToStaticMarkup(<CheckEntries onFix={noop} onReview={noop} onAskDelete={noop} onDelete={noop} onCancelDelete={noop} {...props} />);
export const mini = () => renderToStaticMarkup(<Mini label="Issue to"><input data-x="1" /></Mini>);
export const select = (className) => renderToStaticMarkup(<Select value="" onChange={noop} options={[["a", "A"]]} className={className} />);
`);

try {
  await build({
    entryPoints: [entry], outfile: out, bundle: true, format: "esm", platform: "node", jsx: "automatic", logLevel: "silent",
    nodePaths: [join(REPO, "node_modules")], external: ["react", "react-dom", "react-dom/server", "react-router-dom"],
    define: { "import.meta.env": "{}" }, loader: { ".png": "empty", ".svg": "empty", ".css": "empty" },
  });
  const R = await import(pathToFileURL(out).href);
  const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  const codes = (t) => t.match(/\b[A-Z]-\d{3}\b/g) || [];

  section("The edit drawer: a record (M13)");
  const k5 = register.items.find((i) => i.promptKey === "K-005");
  const dh = R.drawer({ target: { kind: "record", ids: [k5.id], line: "Kitchen benchtop: still to be chosen" }, lead, reg: register, context });
  const dt = text(dh);
  const beforeRef = dt.split("Staff reference")[0];
  ok("the K-005 benchtop opens as its room row: no question code anywhere outside the staff reference", dt.includes("Staff reference") && !codes(beforeRef).length && !codes(dt).length, codes(dt).join(", ") || dt.slice(0, 400));
  ok("no kind or category chips, no record type, no disposition select, no 'Office fields'", !/Record type|Scope \/ disposition|Office fields|\bSelection\b/.test(dt), dt.slice(0, 500));
  ok("the staff reference is the 11 px line", /<p class="text-\[11px\] text-muted">Staff reference K005-[A-Z0-9]{3}<\/p>/.test(dh));
  ok("the row has its ⚑ and ⋯ (the ChoiceRow), and the drawer's footer", /aria-label="More for /.test(dh) && dt.includes("Edit what prints") && dt.includes("Preview again"));
  const dd = R.drawer({ target: { kind: "record", ids: [k5.id], line: "Kitchen benchtop", details: true }, lead, reg: register, context });
  const ddt = text(dd);
  ok("opened for Product details: the office fields, still no code, record type or disposition", ddt.includes("Product details") && /Product|Manufacturer|Supplier/.test(ddt)
    && !codes(ddt.split("Staff reference")[0]).length && !/Record type|Scope \/ disposition/.test(ddt), ddt.slice(0, 600));
  const plain = makeItem({ id: "x1", itemKind: "scope", description: "Retain", disposition: "new", section: "site", category: "external" });   // a custom record: no guided card
  const withPlain = { ...register, items: [...register.items, plain] };
  const ph = text(R.drawer({ target: { kind: "record", ids: [plain.id], reasons: { [plain.id]: "contradicts" }, line: "External works" }, lead, reg: withPlain, context }));
  ok("a record without a guided card: 'What it says', Product details…, its reason in one sentence", ph.includes("What it says") && ph.includes("Product details…") && /Won't print: [^.:]+\./.test(ph) && !/Won't print: [^.]*: /.test(ph), ph.slice(0, 400));
  // N21: a record in the signed baseline (not locked) can't be reworded here either; the server refuses it.
  const based = makeItem({ ...plain, id: "x2", sync: { mode: "project", table: "room_scope_items", rowId: "r2", baselined: true } });
  const bh = R.drawer({ target: { kind: "record", ids: [based.id], line: "External works" }, lead, reg: { ...register, items: [...register.items, based] }, context });
  ok("a baselined record: 'What it says' is disabled and says it is part of the signed contract (N21)", /<input[^>]*disabled=""[^>]*placeholder="Say what…"|<input[^>]*placeholder="Say what…"[^>]*disabled=""/.test(bh)
    && text(bh).includes("Part of the signed contract — change it through a variation."), text(bh).slice(0, 400));
  const unf = register.items.find((i) => i.id === "i12");
  const uh = text(R.drawer({ target: { kind: "record", ids: [unf.id], reasons: { [unf.id]: "unfinished" }, line: "living on site" }, lead, reg: register, context }));
  ok("an unfinished note: 'Won't print: unfinished — ends with “-”.' (one colon)", uh.includes("Won't print: unfinished — ends with “-”."), uh.slice(0, 300));
  const help = "Engineered stone can't be supplied or installed in Australia. A selection names only what will be supplied.";
  const hh = text(R.drawer({ target: { kind: "record", ids: [k5.id], line: "Kitchen benchtop names engineered stone.", help }, lead, reg: register, context }));
  ok("the long guidance behind a short red line shows under the record (N15)", hh.includes(help));

  section("The edit drawer: architect, site, Sales (M6, N16, D1)");
  const ah = text(R.drawer({ target: { kind: "architect", line: "Prepared for: The design team" }, lead, reg: register, context }));
  ok("no architect named: the search", ah.includes("Name the architect") && ah.includes("Add someone new"), ah.slice(0, 300));
  const withArch = { ...context, consultants: [{ role: "architect", status: "active", name: "Jo Archer", company: "Archer Studio", contactId: "c1", roleId: "r1" }] };
  const nh = R.drawer({ target: { kind: "architect", line: "Prepared for: Jo Archer" }, lead, reg: register, context: withArch });
  const nt = text(nh);
  ok("an architect named: '<Name> — <Firm>' with Change, and no search box", nt.includes("Jo Archer — Archer Studio") && nt.includes("Change") && !/design-team-search|type="search"/.test(nh), nt.slice(0, 300));
  const sh = text(R.drawer({ target: { kind: "site", text: "Council and zone: City of Seaview.", line: "City of Seaview." }, lead, reg: register, context }));
  ok("public mapping: read only, with Re-check for a staff member (not only an admin)", sh.includes("From public mapping") && sh.includes("Re-check"));
  const salesH = R.drawer({ target: { kind: "sales", label: "Site", text: "Site address, Seaview Park", line: "Site address, Seaview Park" }, lead, reg: register, context });
  ok("a Sales cover line: read only, with 'Change in Sales ›' (D1)", text(salesH).includes("Change in Sales ›") && text(salesH).includes("Site address, Seaview Park") && !/<input|<textarea/.test(salesH));

  section("Shared pieces (N12, M1)");
  const mh = R.mini();
  ok("Mini's caption is the label that wraps its field", /^<label class="block ?"><span class="[^"]*">Issue to<\/span><input data-x="1"\/><\/label>$/.test(mh), mh);
  ok("Select is 16 px on a phone and 11 px from 640 px up", /class="inp text-\[16px\] sm:text-\[11px\]/.test(R.select("w-36")), R.select("w-36"));
  ok("…unless the caller sizes it", !/text-\[16px\]/.test(R.select("text-xs")) && /text-xs/.test(R.select("text-xs")));

  section("The Documents step before a preview (N2)");
  const blockers = releaseBlockers("architect_brief", register, { recipientName: "", drawingBasis: register.meta.planRev });
  const content = contentChecks("architect_brief", register, context);
  const st = text(R.step({ lead, reg: register, context }));
  ok(`the readiness line counts every release blocker the browser can check (${blockers.length}), as the preview's red box will`,
    st.includes(`Draft — not issued · ${blockers.length} to fix before issuing · ${content.length} worth checking`), st.slice(0, 400));
  ok("…on the real job that is 3 (engineered stone, the room briefs, who it's going to)", blockers.length === 3, blockers.map((b) => b.key).join(", "));

  section("What will print (N19, N11, P5, P3)");
  const model = architectBriefModel(register, context, {});
  const lines = architectBriefLines(model, { siteAddress: "Site address, Seaview Park", clientName: "Client", drawingBasis: register.meta.planRev });
  const titles = briefSectionTitles(model);
  const red = new Set(lines.filter((l) => l.section === "rooms" && l.placeholder).map((l) => l.label));
  const marks = (l) => (red.has(l.label) ? "red" : l.gap ? "amber" : "");
  const lh = R.list({ reg: register, lines, notPrinted: model.notPrinted, marks, titles, defaultOpenNot: true });
  const lt = text(lh);
  const heads = [...lh.matchAll(/data-testid="print-section">([^<]*)</g)].map((x) => x[1]);
  ok("section headings are the PDF's numbered titles", heads.length > 3 && heads.every((h) => Object.values(titles).includes(h)) && heads.includes(titles.points), heads.join(" | "));
  const noSite = load((j) => { j.context.site = {}; j.register.items = j.register.items.filter((i) => !["W-001"].includes(i.promptKey)); j.register.meta.occupancy = null; });
  const t2 = briefSectionTitles(architectBriefModel(noSite.register, noSite.context, {}));
  ok("with nothing in 02, 'Needed for the next drawing issue' is 02", t2.points === "02 Needed for the next drawing issue", JSON.stringify(t2));
  ok("a red line says 'Blocks issue: ' to a screen reader, an amber one 'Worth checking: ', with a visible '!'", lh.includes('<span class="sr-only">Blocks issue: </span>') && lh.includes('<span class="sr-only">Worth checking: </span>') && />!<\/span>/.test(lh));
  const roomBtn = lh.split('data-testid="print-line"').find((b) => b.includes(">Living: <"));
  ok("a room with no brief greys only 'Brief to follow.', not its whole line", !!roomBtn && roomBtn.includes('<span class="italic text-muted">Brief to follow.</span>') && /line-clamp-2 text-\[14px\] text-ink/.test(roomBtn), roomBtn?.slice(0, 600));
  const budgetBtn = lh.split('data-testid="print-line"').find((b) => b.includes(">Budget: <"));
  ok("the budget 'To be confirmed by Blue Leaf' is marked amber, not greyed", !!budgetBtn && /data-mark="amber"/.test(budgetBtn) && !/italic text-muted/.test(budgetBtn.split("Budget: ")[0] + budgetBtn), budgetBtn?.slice(0, 500));
  ok("every lead fact is tagged Sales (funding, budget), the drawing basis The project", /Funding and timing: <\/span>[^]*?Sales ›/.test(lh) && /Drawing basis: <\/span>[^]*?The project ›/.test(lh));
  ok("'Not in this brief' names the place and record as the boxes do ('Site & existing · …', 'Throughout · …')", lt.includes("Site & existing · ") && lt.includes("Throughout · ") && !lt.includes("Site / existing"), lt.slice(lt.indexOf("Not in this brief"), lt.indexOf("Not in this brief") + 400));

  section("The boxes' entries (N14, P3, B1)");
  const clash = content.find((c) => c.key === "scope_clash");
  const empty = content.find((c) => c.action === "delete_empty");
  const budget = { key: "budget_confirmed", action: "story", text: "The budget isn't marked “Confirmed with the client”.", targets: [{ kind: "fact", key: "budget" }] };
  const eh = text(R.entries({ entries: [clash, budget, empty], tone: "amber", reg: register, confirmKey: empty?.key }));
  ok(`the earlier-answer entry reads 'Fix ${clash?.targets.length}', not 'Go room by room'`, !!clash && eh.includes(`Fix ${clash.targets.length}`) && !eh.includes("Go room by room"), eh.slice(0, 500));
  ok("the budget-not-confirmed entry reads 'Confirm the budget'", eh.includes("Confirm the budget"));
  ok(`the delete question names the place: 'Delete ${empty?.targets.length} empty Laundry answers? They hold nothing.'`, !!empty && eh.includes(`Delete ${empty.targets.length} empty Laundry answer${empty.targets.length === 1 ? "" : "s"}? They hold nothing.`), eh.slice(-400));
  const rh = text(R.entries({ entries: blockers, tone: "red", reg: register }));
  ok("red: the room-brief rule reads 'Go room by room', the recipient 'Name the architect', the stone 'Fix'", rh.includes("Go room by room") && rh.includes("Name the architect") && /Fix/.test(rh), rh.slice(0, 600));
} finally {
  rmSync(dir, { recursive: true, force: true });
  try { rmSync(out, { force: true }); } catch { /* gone */ }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
