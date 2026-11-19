// Floor frame sheet, rendered without a browser, server or database (Sam: verify the UI without production). The real FloorPanel is bundled with
// esbuild and rendered to a string, so this proves which controls appear, their defaults, and that steps with nothing to ask are one summary line.
// Taps and saving go through MeasureScreen (record), covered by the engine tests and the ui-review run by hand.
//   node scripts/tests/takeoff-tc-floor-render.test.mjs
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dir = mkdtempSync(join(tmpdir(), "takeoff-floor-render-"));
mkdirSync(join(REPO, "node_modules", ".cache"), { recursive: true });
const out = join(REPO, "node_modules", ".cache", `takeoff-floor-render-${process.pid}.mjs`);
const entry = join(dir, "entry.jsx");
writeFileSync(entry, `
import { renderToStaticMarkup } from "react-dom/server";
import FloorPanel from ${JSON.stringify(join(REPO, "src/components/takeoff/measure/FloorPanel.jsx"))};
import { layoutFloor } from ${JSON.stringify(join(REPO, "shared/takeoff/engine/floor/geometry.js"))};
import FloorLayoutView from ${JSON.stringify(join(REPO, "src/components/takeoff/measure/FloorLayoutView.jsx"))};
import { FloorLayer } from ${JSON.stringify(join(REPO, "src/components/takeoff/measure/FloorLayer.jsx"))};
import { buildCalibration, buildSupplierGroups, floorFramingDefaults, FLOOR_FRAMING_RULES } from ${JSON.stringify(join(REPO, "shared/takeoff/index.js"))};
const rect = (w, h, x = 0, y = 0) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
export function layer(rules = {}) {
  const cal = { ...buildCalibration({ basisRotation: 0, horizontal: { p1: { x: 100, y: 60 }, p2: { x: 700, y: 60 }, knownMm: 12000 }, vertical: { p1: { x: 60, y: 100 }, p2: { x: 60, y: 500 }, knownMm: 8000 } }).calibration };
  const lay = { ...layoutFloor({ outline: rect(6000, 4200), rules: { ...FLOOR_FRAMING_RULES, ...rules } }), origin: { x: 100, y: 100 } };
  return renderToStaticMarkup(<svg><FloorLayer layout={lay} cal={cal} toScreen={(p) => p} /></svg>);
}
export function layoutView() {
  const lay = layoutFloor({ outline: rect(6000, 4200), voids: [{ id: "v", name: "Stair", stair: true, points: rect(1000, 2400, 2500, 600) }], wets: [{ id: "w", name: "Bath", points: rect(2400, 1800, 3000, 2400) }], rules: { ...FLOOR_FRAMING_RULES } });
  return renderToStaticMarkup(<FloorLayoutView layout={lay} name="Floor frame" onClose={() => {}} />);
}
export function panel({ rules = {}, withFloor = true, voids = [], problems = [], mode = "rect", floorDraw = null, orderGroups = [] } = {}) {
  const material = { id: "m", name: "Floor frame", methodKey: "floor_framing", spec: floorFramingDefaults(), rules: { ...FLOOR_FRAMING_RULES, ...rules } };
  const layout = withFloor ? layoutFloor({ outline: rect(6000, 4200), voids: voids.map((v) => ({ id: v.id, name: v.name, stair: v.stair, points: rect(1000, 2400, 2500, 900) })), rules: material.rules }) : null;
  return renderToStaticMarkup(<FloorPanel material={material} layout={layout} results={{ problems }} floor={withFloor ? { id: "f" } : null}
    voids={voids.map((v) => ({ m: { id: v.id }, name: v.name, stair: v.stair }))} canEdit canDraw mode={mode} floorDraw={floorDraw} drawing={false}
    onDraw={() => {}} onCancelDraw={() => {}} onRule={() => {}} onStrongbackSize={() => {}} onRemoveShape={() => {}} onRedrawFloor={() => {}} orderGroups={orderGroups} onDone={() => {}} needScale={false} onScale={null} />);
}
`);
await build({ entryPoints: [entry], outfile: out, bundle: true, format: "esm", platform: "node", jsx: "automatic", logLevel: "silent", nodePaths: [join(REPO, "node_modules")],
  external: ["react", "react-dom", "react-dom/server", "react-router-dom"], define: { "import.meta.env": "{}" }, loader: { ".png": "empty", ".svg": "empty", ".css": "empty" } });

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${detail ? `\n      ${String(detail).slice(0, 300)}` : ""}`); } };
const pressed = (html, label) => new RegExp(`aria-pressed="true"[^>]*>${label}<`).test(html);

try {
  const { panel, layer, layoutView } = await import(pathToFileURL(out).href);
  const svg = layer({ beams: { e0: "445x63" } });
  ok("plan overlay: 15 truss lines, 1 beam, 1 dashed end strongback, 1 mid-span run, numbered end edges", (svg.match(/data-floor-truss=/g) || []).length === 15 && (svg.match(/data-floor-beam=/g) || []).length === 1
    && (svg.match(/data-floor-end-strongback=/g) || []).length === 1 && (svg.match(/data-floor-mid-strongback=/g) || []).length === 1 && (svg.match(/data-floor-edge-number=/g) || []).length === 2, svg.slice(0, 200));
  ok("plan overlay: the beam is heavy and the lines carry real coordinates", /stroke-width="6"/.test(svg) && !/NaN/.test(svg));
  const lv = layoutView();
  ok("Layout view: a full-screen drawing with a Close button, the summary and the legend as text", /data-floor-layout=""/.test(lv) && /data-floor-layout-close/.test(lv) && /data-floor-layout-drawing/.test(lv) && /data-floor-layout-summary/.test(lv) && (lv.match(/data-legend=/g) || []).length >= 6 && !/NaN/.test(lv));
  ok("Layout view: every truss line is drawn", (lv.match(/data-fl="truss"/g) || []).length >= 15);
  const empty = panel({ withFloor: false });
  ok("one Layout button on the floor panel once a floor is drawn, none before", /data-floor-layout-open/.test(panel({})) && !/data-floor-layout-open/.test(empty));
  ok("no outline yet: only the outline step, with the Rectangle hint and nothing else to answer", /Floor outline/.test(empty) && /Tap one corner of the floor/.test(empty) && !/data-floor-step="trusses"/.test(empty) && !/data-floor-step="beams"/.test(empty));
  ok("outline step offers Outline for other shapes", /Outline for any other shape/.test(empty));
  const html = panel({});
  ok("direction chips: Span the short way is the default", pressed(html, "Span the short way") && !pressed(html, "Span the long way") && /Span the long way/.test(html));
  ok("centres chips: 450 is the default, 600 beside it, Other", pressed(html, "450 centres") && /600 centres/.test(html) && />Other</.test(html));
  ok("the truss count is said in one line", /15 trusses/.test(html) && /15 × 4,200/.test(html));
  ok("a normal job has an outline summary line with area and size", /25\.20 m²/.test(html) && /6\.00 × 4\.20 m/.test(html));
  ok("beams: one row per truss-end edge (2 on a rectangle), No beam by default, Select all ends offered", (html.match(/data-floor-edge-row="/g) || []).length === 2 && /No beam/.test(html) && /Select all ends/.test(html) && !/data-size-chips/.test(html));
  ok("beams: with no beam, the 120 x 35 strongback line is said", /A 120 × 35 strongback ties these truss ends/.test(html));
  ok("strongbacks are one summary line (More hides the rows and size)", /data-floor-strongback-summary/.test(html) && /18\.00 lm/.test(html) && !/data-floor-strongback-more/.test(html));
  ok("no stair void: no trimmer step", !/data-floor-step="trimmers"/.test(html));
  ok("no Add to order step to tap before the order exists: Done only", /data-floor-done/.test(html));
  const beam = panel({ rules: { beams: { e0: "445x63" }, lastBeamSize: "445x63" } });
  ok("a beam shows size chips 400 × 63 / 445 × 63 LVL / Other with the chosen size on", /data-size-chips="e0"/.test(beam) && pressed(beam, "445 × 63 LVL") && /400 × 63 LVL/.test(beam) && /Beam</.test(beam));
  const unsized = panel({ rules: { beams: { e0: "unsized" } }, problems: [{ code: "floor_beam_unsized", blocking: true, message: "Edge 1 has a beam with no size. Choose its size (400x63, 445x63, or type one)." }] });
  ok("a beam with no size says so and the order is Incomplete", /Choose this beam&#x27;s size/.test(unsized) && /data-floor-incomplete/.test(unsized) && /Edge 1 has a beam with no size/.test(unsized) && !pressed(unsized, "445 × 63 LVL"));
  const custom = panel({ rules: { beams: { e0: "360x63" } } });
  ok("a typed size shows as its own chip", pressed(custom, "360 × 63 LVL"));
  const stair = panel({ voids: [{ id: "v1", name: "Stair void 1", stair: true }] });
  ok("a stair void adds the trimmer step with 445 × 63 on by default and 400 × 63 beside it", /data-floor-step="trimmers"/.test(stair) && pressed(stair, "445 × 63 LVL") && /400 × 63 LVL/.test(stair) && /Stair void 1/.test(stair));
  ok("openings: + Stair void and + Opening, one at a time", /\+ Stair void/.test(stair) && /\+ Opening/.test(stair));
  const drawing = panel({ floorDraw: { stair: true } });
  ok("while a stair void is being drawn, its hint replaces the buttons", /Draw the stair void on the plan/.test(drawing) && !/\+ Stair void/.test(drawing));
  const wide = panel({ rules: { span: "long", centresMm: 600 } });
  ok("the other direction and centres are shown as set", pressed(wide, "Span the long way") && pressed(wide, "600 centres"));
} finally {
  console.log(`takeoff-tc-floor-render: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
