// HUB 031 screens, rendered without a browser, server or database (Sam: verify the UI without production). The real
// components (the Walls card's Roof and openings section, the opening sheet's fields, Full height / Cavity slider chips
// and the lintel row) are bundled with esbuild and rendered to a string, so this proves which controls appear and what
// they say. Taps and saving are in the ui-review spec (e2e/ui-review/tc-hub031.spec.js, run by hand).
//   node scripts/tests/takeoff-tc-hub031-render.test.mjs
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dir = mkdtempSync(join(tmpdir(), "takeoff-render-"));
mkdirSync(join(REPO, "node_modules", ".cache"), { recursive: true });
const out = join(REPO, "node_modules", ".cache", `takeoff-hub031-render-${process.pid}.mjs`);
const entry = join(dir, "entry.jsx");
writeFileSync(entry, `
import { renderToStaticMarkup } from "react-dom/server";
import { WallsSetup } from ${JSON.stringify(join(REPO, "src/components/takeoff/FamilySetup.jsx"))};
import { OpeningForm, OpeningFlags, LintelLoad } from ${JSON.stringify(join(REPO, "src/components/takeoff/WallsScreen.jsx"))};
import { wallFramingDefaults, WALL_FRAMING_RULES } from ${JSON.stringify(join(REPO, "shared/takeoff/index.js"))};
export const card = (rules = {}) => renderToStaticMarkup(<WallsSetup value={{ name: "Walls", methodKey: "wall_framing", methodVersion: 1, spec: wallFramingDefaults([]), rules: { ...WALL_FRAMING_RULES, ...rules } }} onChange={() => {}} result={null} />);
export const form = (value) => renderToStaticMarkup(<OpeningForm value={value} canEdit onField={() => {}} focusToken={0} />);
export const flags = (opening, timberWalls = true, wallHeightOk = true) => renderToStaticMarkup(<OpeningFlags opening={opening} timberWalls={timberWalls} wallHeightOk={wallHeightOk} onFlag={() => {}} />);
export const lintel = (opening, rule) => renderToStaticMarkup(<LintelLoad opening={opening} rule={rule} onSet={() => {}} />);
`);
await build({ entryPoints: [entry], outfile: out, bundle: true, format: "esm", platform: "node", jsx: "automatic", logLevel: "silent", nodePaths: [join(REPO, "node_modules")],
  external: ["react", "react-dom", "react-dom/server", "react-router-dom"], define: { "import.meta.env": "{}" }, loader: { ".png": "empty", ".svg": "empty", ".css": "empty" } });

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${detail ? `\n      ${String(detail).slice(0, 300)}` : ""}`); } };
const pressed = (html, label) => new RegExp(`aria-pressed="true"[^>]*>${label}<`).test(html);

try {
  const { card, form, flags, lintel } = await import(pathToFileURL(out).href);
  // the Walls card: Roof and openings, closed by default, with plain words and only the table's own columns
  const c = card({ carriesRoof: true, roofMass: "sheet", rlwMm: 3000, rafterSpacingMm: 600, windClass: "N2" });
  ok("card: Roof and openings fold says the walls carry the roof", /Roof and openings · walls carry the roof/.test(c), c.slice(0, 300));
  ok("card: the switch is on by default", /data-walls-opening-framing[^>]*>[\s\S]*?checked/.test(c));
  ok("card: roof width chips are the tables' own columns plus Not sure", ["1500", "3000", "4500", "6000", "7500", "Not sure"].every((x) => c.includes(`>${x}<`)));
  ok("card: spacing chips 600 and 1200", c.includes(">600<") && c.includes(">1200<"));
  ok("card: the chosen answers are pressed", pressed(c, "Yes") && pressed(c, "Sheet") && pressed(c, "3000") && pressed(c, "N2"));
  ok("card: lintels default to SmartLVL 13", pressed(c, "SmartLVL 13 \\(LVL\\)"));
  ok("card: says lower storey and N5/C need an engineer", /lower storey, N5 and C wind classes need an engineer/.test(c));
  const blank = card();
  ok("card: nothing answered reads 'Not set' and 'Not sure', never a default", pressed(blank, "Not set") && /Roof and openings<\/summary>/.test(blank));
  const off = card({ openingFraming: false });
  ok("card: switched off the box is unchecked", !/data-walls-opening-framing[^>]*>\s*<input[^>]*checked/.test(off));

  // the opening sheet
  const door = { label: "D1", type: "door", widthMm: 920, heightMm: 2040, sillMm: 0, xMm: 600, fullHeight: false, cavityLeafMm: null, cavityPocket: null };
  const f1 = form(door);
  ok("opening form: a plain door has Width and Height", f1.includes("Width") && f1.includes("Height") && !f1.includes("Door width"));
  const slider = { ...door, widthMm: 1860, cavityLeafMm: 920, cavityPocket: "right" };
  const f2 = form(slider);
  ok("opening form: a slider shows Door width with '2 × 920 + 20' and no Width field", f2.includes("Door width") && /Opening 1,860 \(2 × 920 \+ 20\)/.test(f2) && !/data-field="widthMm"/.test(f2));
  const f3 = form({ ...door, heightMm: 2700, fullHeight: true });
  ok("opening form: full height replaces Height by the wall's height in words", /Height: to the top of the wall \(2,700\)/.test(f3) && !/data-field="heightMm"/.test(f3));
  const fl = flags({ ...door, fullHeight: false, cavityLeafMm: null }, true, true);
  ok("flags: a door on a timber walls item offers Full height and Cavity slider, 44 px high", fl.includes(">Full height<") && fl.includes(">Cavity slider<") && (fl.match(/min-h-\[44px\]/g) || []).length >= 2);
  ok("flags: a window offers Full height only", !flags({ ...door, type: "window" }).includes("Cavity slider") && flags({ ...door, type: "window" }).includes("Full height"));
  ok("flags: no Cavity slider off a timber walls item", !flags(door, false, true).includes("Cavity slider"));
  ok("flags: a wall of no single height disables Full height and says so", /disabled=""[^>]*>Full height/.test(flags(door, true, false)) || /disabled/.test(flags(door, true, false)) && /Full height only works on a wall of one height/.test(flags(door, true, false)));
  ok("flags: a slider says nothing stands in the pocket, and Pocket left / Pocket right sit under the toggle with the current side pressed", /No studs or noggins in the pocket/.test(flags({ ...slider }, true, true)) && /aria-pressed="true"[^>]*data-pocket="right"|data-pocket="right"[^>]*aria-pressed="true"/.test(flags({ ...slider }, true, true)) && /Pocket left/.test(flags(slider)) && /Pocket right/.test(flags(slider)));
  ok("flags: a plain door shows no pocket chips", !flags(door).includes("Pocket left"));
  ok("flags: Cavity slider reads pressed on a slider", pressed(flags(slider), "Cavity slider"));

  // the lintel row
  const rec = { inputs: { xMm: 600, widthMm: 3430 } };
  const op = { type: "window", rec };
  const sized = lintel(op, { lintel: { status: "sized", section: "240x45", grade: "LVL13", plies: 1, basis: "SmartLVL 13 Design Guide (E1 2021), L13-LINTEL, page 22 and 23", noFit: { neededMm: 240, freeMm: 145 } } });
  ok("lintel row: size, grade and the table it came from", /240 × 45 LVL13/.test(sized) && /SmartLVL 13 Design Guide \(E1 2021\)/.test(sized));
  ok("lintel row: a lintel that won't fit says how much", /Won&#x27;t fit: it is 240 deep and only 145 mm is free above the head/.test(sized), sized);
  const un = lintel(op, { lintel: { status: "unsized", reason: "the wind class isn't set" } });
  ok("lintel row: not sized says why in plain words", /not sized \(the wind class isn&#x27;t set\)/.test(un), un);
  const nn = lintel(op, { lintel: { status: "not_needed" } });
  ok("lintel row: a wall that doesn't carry the roof has none", /none \(this wall doesn&#x27;t carry the roof/.test(nn), nn);
  ok("lintel row: a button at least 44 px high", /min-h-\[44px\]/.test(un));
} finally {
  try { rmSync(dir, { recursive: true, force: true }); rmSync(out, { force: true }); } catch { /* temp */ }
}
console.log(`takeoff-tc-hub031-render: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
