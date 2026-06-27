// Build contact sheets (JPG) from the UI-review screenshot export. Review-only tooling.
// Renders an HTML thumbnail grid per viewport via Playwright chromium → JPG.
//   node scripts/ui-review-contact-sheets.mjs
import { chromium } from "@playwright/test";
import { readdirSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXPORT = join(ROOT, "docs/ui-review/export-2026-06-27");
const SHOTS = join(EXPORT, "screenshots");
const OUT = join(EXPORT, "contact-sheets");
const TMP = join(EXPORT, "raw");
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const VIEWPORTS = ["desktop", "tablet", "mobile"];
const names = readdirSync(join(SHOTS, "desktop")).filter((f) => f.endsWith(".png")).map((f) => f.replace(/\.png$/, "")).sort();

const css = `
  body{margin:0;background:#0f172a;color:#e2e8f0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:24px}
  h1{font-size:22px;margin:0 0 4px} .sub{color:#94a3b8;font-size:13px;margin:0 0 20px}
  .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:14px}
  .cell{background:#1e293b;border:1px solid #334155;border-radius:8px;overflow:hidden}
  .cap{font-size:11px;padding:6px 8px;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .thumb{width:100%;height:190px;object-fit:cover;object-position:top center;display:block;background:#fff;border-top:1px solid #334155}
  .rowgrid{display:grid;grid-template-columns:160px 1fr 1fr 1fr;gap:10px;align-items:center;margin-bottom:10px}
  .rowlbl{font-size:12px;color:#cbd5e1} .rowimg{width:100%;height:150px;object-fit:cover;object-position:top center;background:#fff;border:1px solid #334155;border-radius:6px}
  .vphdr{display:grid;grid-template-columns:160px 1fr 1fr 1fr;gap:10px;font-size:11px;color:#94a3b8;text-transform:uppercase;margin-bottom:6px}
`;

function gridHTML(vp) {
  const cells = names.map((n) => `<div class="cell"><img class="thumb" src="file://${join(SHOTS, vp, n + ".png")}"><div class="cap">${n}</div></div>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><h1>Blue Leaf Hub — UI Review · ${vp}</h1><p class="sub">${names.length} routes · ${vp} viewport · 2026-06-27 · mock data (VITE_UI_REVIEW_MODE)</p><div class="grid">${cells}</div></body></html>`;
}
function allRoutesHTML() {
  const rows = names.map((n) =>
    `<div class="rowgrid"><div class="rowlbl">${n}</div>` +
    VIEWPORTS.map((vp) => `<img class="rowimg" src="file://${join(SHOTS, vp, n + ".png")}">`).join("") + `</div>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><h1>Blue Leaf Hub — UI Review · all routes × all viewports</h1><p class="sub">${names.length} routes × 3 viewports · 2026-06-27</p><div class="vphdr"><div>Route</div><div>Desktop 1440×900</div><div>Tablet 834×1112</div><div>Mobile 390×844</div></div>${rows}</body></html>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
for (const vp of VIEWPORTS) {
  const html = join(TMP, `_cs-${vp}.html`);
  writeFileSync(html, gridHTML(vp));
  await page.goto("file://" + html, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(OUT, `${vp}-contact-sheet.jpg`), fullPage: true, type: "jpeg", quality: 78 });
  console.log("wrote", `${vp}-contact-sheet.jpg`);
}
const allHtml = join(TMP, "_cs-all.html");
writeFileSync(allHtml, allRoutesHTML());
await page.goto("file://" + allHtml, { waitUntil: "networkidle" });
await page.screenshot({ path: join(OUT, "all-routes-contact-sheet.jpg"), fullPage: true, type: "jpeg", quality: 75 });
console.log("wrote all-routes-contact-sheet.jpg");
await browser.close();
