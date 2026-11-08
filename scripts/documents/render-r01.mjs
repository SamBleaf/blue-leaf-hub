// render-r01.mjs — R01 Document Engine Proof harness.
// Fills the three R01 templates (public/templates/*.docx) from typed fixtures using the EXISTING
// renderer (docTemplates.renderDocxTemplate). Writes .docx outputs. PDF conversion is a separate
// step (LibreOffice soffice) in the shell. No DB, no network, no issue/send.
//
//   node scripts/documents/render-r01.mjs [outDir] [fixture1 fixture2 ...]
//   (defaults: all fixtures in scripts/documents/fixtures, outDir = ./scripts/documents/out)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderDocxTemplate } from "../../server/lib/docTemplates.mjs";
import { DOC_DEFS, validateFixture } from "../../server/lib/documents/documentPayloads.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../..");
const TEMPLATES = path.join(REPO, "public/templates");
const FIXTURE_DIR = path.join(__dirname, "fixtures");

const DOC_PREFIX = { client_brief: "BLB-BRIEF", architect_brief: "BLB-ADB", selections_schedule: "BLB-SEL" };

const args = process.argv.slice(2);
const outDir = args[0] || path.join(__dirname, "out");
const fixtureNames = args.slice(1).length ? args.slice(1) : fs.readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".json"));
fs.mkdirSync(outDir, { recursive: true });

let count = 0;
const summary = [];
for (const fname of fixtureNames) {
  const fx = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, fname), "utf8"));
  const base = fname.replace(/\.json$/, "");
  // validate once (draft mode surfaces issues as warnings without blocking the render)
  const v = validateFixture(fx, { mode: "draft" });
  if (v.warnings.length) summary.push(`  ⚠ ${fname}: ${v.warnings.length} validation warning(s): ${v.warnings.join(" | ")}`);
  const issueCheck = validateFixture(fx, { mode: "issue" });
  summary.push(`  ${issueCheck.ok ? "✓ issue-ready" : "✗ issue-BLOCKED"} ${fname}`);

  for (const [docType, def] of Object.entries(DOC_DEFS)) {
    const fxForDoc = { ...fx, meta: { ...fx.meta, docNumber: `${DOC_PREFIX[docType]}-${fx.meta.ref}` } };
    const payload = def.build(fxForDoc);
    const tplPath = path.join(TEMPLATES, def.templateFile);
    const tpl = fs.readFileSync(tplPath);
    let docx;
    try {
      docx = renderDocxTemplate(tpl, payload);
    } catch (e) {
      const detail = e?.properties?.errors ? JSON.stringify(e.properties.errors.map((x) => x.properties?.explanation || x.message)) : e.message;
      summary.push(`  ✗ RENDER FAILED ${base} · ${docType}: ${detail}`);
      continue;
    }
    const outName = `${base}__${docType}.docx`;
    fs.writeFileSync(path.join(outDir, outName), docx);
    count++;
    summary.push(`  ✓ rendered ${outName} (${docx.length} bytes)`);
  }
}
console.log(`\nR01 render — ${count} document(s) → ${outDir}\n`);
console.log(summary.join("\n"));
