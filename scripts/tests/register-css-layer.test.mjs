/**
 * register-css-layer.test.mjs — the register's global CSS rules in src/index.css (findings M1, M7, N7, N32):
 *   - .inp sits in @layer components, so an input's own classes (text-[16px] on a phone, px-3, the amber gap rule) win;
 *   - the stage bar hides on a phone while a room is open OR the Rooms list is in tick mode;
 *   - the Blueprint and Quick-add buttons hide while a register overlay covers the page;
 *   - the lead header and the project bar scroll away while the register is open on a capture tab;
 *   - in the full-width workspace the register's sticky bars sit under that workspace's own bar.
 * Reads the source only. Run: node scripts/tests/register-css-layer.test.mjs
 */
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 600)}` : ""}`); } };
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const css = read("src/index.css");
const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");

/** The body of the first `@layer <name> { … }` block (braces balanced), or null. */
function layerBody(src, name) {
  const at = src.search(new RegExp(`@layer\\s+${name}\\s*\\{`));
  if (at < 0) return null;
  let i = src.indexOf("{", at) + 1, depth = 1;
  const start = i;
  for (; i < src.length && depth; i++) { if (src[i] === "{") depth++; else if (src[i] === "}") depth--; }
  return src.slice(start, i - 1);
}

console.log("\n.inp in the components layer (M1)");
const components = layerBody(noComments, "components");
ok("index.css has an @layer components block", components != null);
ok(".inp is declared inside it", /\.inp\s*\{/.test(components || ""));
const outside = noComments.replace(/@layer\s+components\s*\{[\s\S]*?\n\}/, "");
ok(".inp is not also declared outside a layer (it would beat the utilities again)", !/(^|[\s,}])\.inp\s*\{/.test(outside));
ok("it still carries the focus ring and the compact defaults", /\.inp\s*\{\s*@apply[^;]*\bfocus-ring\b/.test(components || "") && /\.inp\s*\{\s*@apply[^;]*\btext-sm\b/.test(components || ""));
ok("the Tailwind layers are still declared in order", /@tailwind base;\s*@tailwind components;\s*@tailwind utilities;/.test(css));

console.log("\nThe stage bar, the floating buttons and the sticky chrome");
ok("the stage bar hides for any data-register-room value (a room open, or tick mode) (N7)", /body\[data-register-room\]\s+\[data-stage-bar\]\s*\{\s*display:\s*none\s*!important/.test(noComments) && !/data-register-room="open"\]/.test(noComments));
ok("the Blueprint and Quick-add buttons hide under register-overlay-open (N32)", /body\.register-overlay-open \.blueprint-fab,\s*body\.register-overlay-open \[data-quick-add\]\s*\{\s*display:\s*none\s*!important/.test(noComments));
ok("the lead header and the project bar scroll away while the register is open (M7)", /body\[data-register-open\] \[data-lead-header\],\s*body\[data-register-open\] \[data-project-bar\]\s*\{\s*position:\s*static/.test(noComments));
ok("the register frame's sticky offset: 65 px under the phone app header, 0 from 768 px", /\[data-register-frame\]\s*\{\s*--register-top:\s*65px/.test(noComments) && /@media \(min-width: 768px\)\s*\{\s*\[data-register-frame\]\s*\{\s*--register-top:\s*0px/.test(noComments));
ok("in the full-width workspace the register's sticky bars use that offset", /\[data-register-expanded\] \.sticky\[class~="md:top-0"\]\s*\{\s*top:\s*var\(--register-top/.test(noComments));

console.log("\nThe attributes those rules look for");
ok("the Quick-add wrapper carries data-quick-add", /<div data-quick-add="" className=\{`fixed bottom-20 right-4 z-50/.test(read("src/components/AppShell.jsx")));
ok("the lead header carries data-lead-header", /data-lead-header=""/.test(read("src/components/sales/lead-detail/LeadDetailHeader.jsx")));
ok("the project bar carries data-project-bar", /data-project-bar=""/.test(read("src/components/ProjectBar.jsx")));
const workshop = read("src/components/sales/lead-detail/register/RegisterWorkshop.jsx");
ok("RegisterWorkshop holds the flags (counted, so a hidden copy can't clear them)", /useBodyData\("data-register-room"/.test(workshop) && /useBodyData\("data-register-open"/.test(workshop) && /useBodyFlag\("register-overlay-open", expanded\)/.test(workshop));
ok("RegisterWorkshop sets --register-top to its own bar's height in full width, and that bar sits above the room bar", /"--register-top": `\$\{expandBarH\}px`/.test(workshop) && /ref=\{expandBarRef\} className="sticky top-0 z-30/.test(workshop));
ok("the full-width workspace's Escape goes through the shared layers", /useEscapeLayer\(expanded,/.test(workshop) && !/document\.addEventListener\("keydown"/.test(workshop));

console.log("\nOne offset for every register sticky bar that scrolls with the page (M7 step 3)");
const REG = "src/components/sales/lead-detail/register/";
const stickyClasses = (src) => (src.match(/className=(?:"|\{`)[^"`]*\bsticky\b[^"`]*/g) || []).map((c) => c.replace(/^className=(?:"|\{`)/, ""));
const pageBars = (file, pick) => stickyClasses(read(REG + file)).filter((c) => /\btop-/.test(c) && pick(c));
const offset = (c) => /(^|\s)top-\[65px\](\s|$)/.test(c) && /(^|\s)md:top-0(\s|$)/.test(c);
const roomBars = pageBars("RoomScreen.jsx", (c) => /\bz-20\b/.test(c) && !/\bbottom-/.test(c));
ok("both room-bar variants (phone and wide) sit under the app header below 768 px and at the top from md", roomBars.length === 2 && roomBars.every(offset), JSON.stringify(roomBars));
const gapLine = pageBars("ProjectStep.jsx", (c) => /sm:hidden/.test(c));
ok("the project step's phone gap line uses the same offset", gapLine.length === 1 && gapLine.every(offset), JSON.stringify(gapLine));
const printHeads = pageBars("DocumentsStep.jsx", (c) => /\bz-\[1\]/.test(c));
ok("the 'What will print' section headings use the same offset", printHeads.length === 1 && printHeads.every(offset), JSON.stringify(printHeads));

console.log(`\nregister-css-layer: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
