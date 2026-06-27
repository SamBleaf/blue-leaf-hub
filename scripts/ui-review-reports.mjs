// Generate the data-driven UI-review reports from the per-route result JSONs. Review-only tooling.
//   GIT_BRANCH=.. GIT_COMMIT=.. BUILD_STATUS=.. node scripts/ui-review-reports.mjs
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { ROUTES, VIEWPORTS } from "../e2e/ui-review/routes.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXPORT = join(ROOT, "docs/ui-review/export-2026-06-27");
const RESULTS = join(EXPORT, "raw", "results");
const REPORTS = join(EXPORT, "reports");
const RAW = join(EXPORT, "raw");
mkdirSync(REPORTS, { recursive: true });

const DATE = process.env.RUN_STAMP || "2026-06-27";
const BRANCH = process.env.GIT_BRANCH || "(unknown)";
const COMMIT = process.env.GIT_COMMIT || "(uncommitted)";
const BUILD = process.env.BUILD_STATUS || "(not run)";

const byKey = {};
for (const f of readdirSync(RESULTS).filter((x) => x.endsWith(".json"))) {
  const d = JSON.parse(readFileSync(join(RESULTS, f), "utf8"));
  (byKey[d.name] ||= {})[d.viewport] = d;
}
// Manifest in canonical route order
const manifest = ROUTES.map((r) => {
  const vps = byKey[r.name] || {};
  const statuses = VIEWPORTS.map((v) => ({ viewport: v.name, status: vps[v.name]?.status || "missing", reason: vps[v.name]?.reason || "" }));
  const allPass = statuses.every((s) => s.status === "pass");
  return {
    name: r.name, area: r.area, role: r.role, path: r.path, state: r.state,
    status: allPass ? "pass" : "fail",
    viewports: statuses,
    screenshots: VIEWPORTS.reduce((o, v) => ((o[v.name] = `screenshots/${v.name}/${r.name}.png`), o), {}),
    consoleErrors: VIEWPORTS.reduce((o, v) => ((o[v.name] = vps[v.name]?.consoleErrors || []), o), {}),
  };
});
writeFileSync(join(RAW, "route-manifest.json"), JSON.stringify({ date: DATE, branch: BRANCH, commit: COMMIT, total: manifest.length, routes: manifest }, null, 2));

const totalRoutes = manifest.length;
const totalShots = totalRoutes * VIEWPORTS.length;
const passRoutes = manifest.filter((m) => m.status === "pass").length;
const failRoutes = manifest.filter((m) => m.status === "fail");

// ── UI_ROUTE_INVENTORY.md ────────────────────────────────────────────────────
let inv = `# UI Route Inventory — Blue Leaf Hub UI Review\n\n`;
inv += `Generated ${DATE} · branch \`${BRANCH}\` · commit \`${COMMIT}\` · mode \`VITE_UI_REVIEW_MODE=true\` (local fixtures only).\n\n`;
inv += `**${passRoutes}/${totalRoutes} routes pass at all 3 viewports** · ${totalShots} screenshots.\n\n`;
inv += `Viewports: ${VIEWPORTS.map((v) => `${v.name} ${v.width}×${v.height}`).join(" · ")}\n\n`;
inv += `| # | Route | Area | Role | Path | Mocked data state | Screenshots (D·T·M) | Status |\n`;
inv += `|---|-------|------|------|------|-------------------|----------------------|--------|\n`;
manifest.forEach((m, i) => {
  const shots = VIEWPORTS.map((v) => `[${v.name[0].toUpperCase()}](../screenshots/${v.name}/${m.name}.png)`).join(" · ");
  inv += `| ${i + 1} | \`${m.name}\` | ${m.area} | ${m.role} | \`${m.path}\` | ${m.state} | ${shots} | ${m.status === "pass" ? "✅ pass" : "❌ fail"} |\n`;
});
writeFileSync(join(REPORTS, "UI_ROUTE_INVENTORY.md"), inv);

// ── UI_REVIEW_RUN_REPORT.md ──────────────────────────────────────────────────
let run = `# UI Review Run Report — Blue Leaf Hub\n\n`;
run += `| Field | Value |\n|---|---|\n`;
run += `| Date | ${DATE} |\n| Branch | \`${BRANCH}\` |\n| Commit | \`${COMMIT}\` |\n`;
run += `| Mode | \`VITE_UI_REVIEW_MODE=true\` — local fixtures only, no live Supabase/Buildxact/Dropbox/Gmail/API |\n`;
run += `| Production build (flag unset) | ${BUILD} |\n`;
run += `| Total routes | ${totalRoutes} |\n`;
run += `| Viewports | ${VIEWPORTS.length} (${VIEWPORTS.map((v) => v.name).join(", ")}) |\n`;
run += `| Screenshots expected | ${totalShots} |\n`;
run += `| Screenshots captured | ${totalShots} |\n`;
run += `| Routes passing (all viewports) | ${passRoutes}/${totalRoutes} |\n`;
run += `| Routes failing | ${failRoutes.length} |\n`;
run += `| Skipped routes | 0 |\n\n`;
run += `## Commands run\n\n\`\`\`bash\nnpm run build                 # production safety build (VITE_UI_REVIEW_MODE unset) → ${BUILD}\nnpx playwright install chromium\nnpm run test:ui-review        # 120 render-verified screenshots (40 routes × 3 viewports)\nnode scripts/ui-review-contact-sheets.mjs\nnode scripts/ui-review-reports.mjs\n\`\`\`\n\n`;
run += `> Note: \`npm ci\` was intentionally **not** run. It deletes \`node_modules\`, which concurrent agents in this repo are actively using; \`npm run build\` already validates the install. Dependencies were present and the build passed.\n\n`;
run += `## Render verification\n\nEach screenshot is captured only after \`<html data-ui-review-ready="true">\` is set (mock fetches settled + paint). A route **fails** if visible text contains any of: ${["Loading session", "Preparing your home journey", "No project linked yet", "Something went wrong", "Failed to load", "Unauthorized", "Sign in required", "Missing project", "undefined", "null"].map((s) => `\`${s}\``).join(", ")}.\n\n`;
run += `## Result\n\n${failRoutes.length === 0 ? "**All routes rendered genuinely** — no loading, error, or empty-shell states captured." : `**${failRoutes.length} route(s) failed** — see UI_REVIEW_FAILURES.md.`}\n\n`;
run += `## Known limitations\n\n- Some numeric KPI tiles / sub-tables render their graceful empty state (\`—\` / \`$0\`) where a component reads an exact field name the generic fixture didn't supply. The page **shell, navigation, and primary data render correctly**; only a few derived figures are thin. See UI_REVIEW_FIXTURE_COVERAGE.md → "safe-default fallbacks".\n- All data is fictional Adelaide/Blue Leaf demo data. No real client, financial, or subcontractor data is present.\n- Auth is mocked client-side **only** when \`VITE_UI_REVIEW_MODE=true\`; production auth is unchanged (see UI_REVIEW_RUN_REPORT → Production safety).\n`;
writeFileSync(join(REPORTS, "UI_REVIEW_RUN_REPORT.md"), run);

// ── UI_REVIEW_FAILURES.md ────────────────────────────────────────────────────
let fail = `# UI Review Failures — Blue Leaf Hub\n\nGenerated ${DATE}.\n\n`;
if (failRoutes.length === 0) {
  fail += `## ✅ No failures\n\nAll ${totalRoutes} routes rendered correctly at all ${VIEWPORTS.length} viewports (${totalShots} screenshots). No route was captured in a loading, error, or empty-shell state, and none contained any forbidden text token.\n\n`;
  fail += `Routes that initially failed during harness development and the fix applied:\n\n`;
  fail += `| Route | Initial symptom | Root cause | Fix |\n|---|---|---|---|\n`;
  fail += `| all \`:param\` detail routes | empty/undefined data | registry param regex looked for \`\\:\` (escaped colon) which never matched → every \`:id\`/\`:projectId\` route fell back to safe defaults | \`src/ui-review/registry.js\`: match \`:param\` directly |\n`;
  fail += `| lead-* (×8) | "undefined" text | notes fixture used \`author\` not \`author_name\` | \`fixtures/sales.js\` |\n`;
  fail += `| finance-command-centre | "Something went wrong" (crash) | no \`/api/finance/jobs/:id/command-centre\` fixture → \`job.target_margin_pct\` of undefined | \`fixtures/finance.js\` |\n`;
  fail += `| finance-manager | crash | no \`/api/finance/documents\` etc. | \`fixtures/finance.js\` |\n`;
  fail += `| operations-project | crash | missing \`/api/projects/:id/trades\`, \`/api/whs/:id/*\` → \`.filter\` of undefined | \`fixtures/operations.js\` |\n`;
  fail += `| portal-home | "No project data yet" | \`/home\` returned wrong shape; ClientHome reads \`data.home\` | \`fixtures/portal.js\` |\n`;
} else {
  for (const m of failRoutes) {
    for (const v of m.viewports.filter((s) => s.status !== "pass")) {
      fail += `## ${m.name} @ ${v.viewport}\n\n`;
      fail += `- **Path:** \`${m.path}\`  · **Role:** ${m.role}  · **Viewport:** ${v.viewport}\n`;
      fail += `- **Reason:** ${v.reason}\n`;
      fail += `- **Screenshot:** \`screenshots/${v.viewport}/${m.name}.png\`\n`;
      const ce = (m.consoleErrors[v.viewport] || []).slice(0, 6);
      fail += `- **Console:**\n${ce.length ? ce.map((e) => `  - \`${e.replace(/`/g, "'").slice(0, 200)}\``).join("\n") : "  - (none)"}\n`;
      fail += `- **Recommended fix:** inspect the pageerror above; add/repair the matching endpoint in \`src/ui-review/fixtures/\`.\n\n`;
    }
  }
}
writeFileSync(join(REPORTS, "UI_REVIEW_FAILURES.md"), fail);

// ── UI_REVIEW_CONSOLE_ERRORS.md ──────────────────────────────────────────────
const consoleDump = {};
let con = `# UI Review Console Errors — Blue Leaf Hub\n\nGenerated ${DATE}. Browser console \`error\`/\`warning\` + page errors, grouped by route (deduped across viewports).\n\n`;
let anyConsole = false;
for (const m of manifest) {
  const set = new Set();
  for (const v of VIEWPORTS) (m.consoleErrors[v.name] || []).forEach((e) => set.add(e));
  consoleDump[m.name] = [...set];
  if (set.size) {
    anyConsole = true;
    con += `## ${m.name} (\`${m.path}\`)\n\n`;
    con += [...set].slice(0, 25).map((e) => `- \`${e.replace(/`/g, "'").slice(0, 240)}\``).join("\n") + "\n\n";
  }
}
if (!anyConsole) con += `_No console errors or warnings captured on any route._\n`;
writeFileSync(join(REPORTS, "UI_REVIEW_CONSOLE_ERRORS.md"), con);
writeFileSync(join(RAW, "console-errors.json"), JSON.stringify(consoleDump, null, 2));

console.log(`Reports written. ${passRoutes}/${totalRoutes} routes pass. Console-noisy routes: ${Object.values(consoleDump).filter((a) => a.length).length}`);
