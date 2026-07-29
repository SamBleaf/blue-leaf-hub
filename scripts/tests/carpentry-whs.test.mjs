// Carpentry WHS — unit tests. Run: node scripts/tests/carpentry-whs.test.mjs
// Covers the project_type → SWMS auto-attach mapping and the dual-FK spine XOR invariant.
import { workCategoriesForProjectType } from "../../server/lib/whs/carpentrySwmsMap.mjs";

let pass = 0, fail = 0;
const eq = (a, e, name) => { const A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) pass++; else { fail++; console.error(`  ✗ ${name}\n      expected ${E}\n      got      ${A}`); } };
const same = (a, e, name) => eq([...a].sort(), [...e].sort(), name);

// 1. project_type → the work categories a job of that type involves (+ always-on "general").
same(workCategoriesForProjectType("full_package"), ["first_fix_framing", "cladding", "second_fix", "roofing", "general"], "full_package = every stage + general");
same(workCategoriesForProjectType("frame"),        ["first_fix_framing", "roofing", "general"], "frame");
same(workCategoriesForProjectType("lockup"),       ["first_fix_framing", "cladding", "roofing", "general"], "lockup / cladding");
same(workCategoriesForProjectType("fitoff"),       ["second_fix", "general"], "fit-off only");
same(workCategoriesForProjectType("other"),        ["general"], "other = general only");
same(workCategoriesForProjectType(null),           ["general"], "unknown/null = general only");
same(workCategoriesForProjectType("FULL_PACKAGE"), ["first_fix_framing", "cladding", "second_fix", "roofing", "general"], "case-insensitive");

// 2. Auto-seed: which SWMS attach to a job — mirrors the DB `.overlaps(work_category, cats)`.
//    SEED categories track migration 163 so the mapping stays honest end-to-end.
const SEED = {
  "Working at Heights (>2 m)": ["first_fix_framing", "cladding", "roofing"],
  "Roof Work": ["roofing"],
  "Frame Erection, Temporary Bracing & Truss Handling": ["first_fix_framing"],
  "Temporary Propping & Load-bearing Demolition": ["demolition", "first_fix_framing"],
  "Power Tools — Silica (Fibre-Cement) & Timber Dust": ["cladding", "first_fix_framing", "second_fix"],
  "Nail Guns & Powder-actuated Tools": ["first_fix_framing", "cladding", "second_fix"],
  "Manual Handling": ["general"],
  "Electrical Leads, Test-and-Tag & Overhead Powerlines": ["general"],
};
const attach = (cats) => Object.entries(SEED).filter(([, wc]) => wc.some((c) => cats.includes(c))).map(([t]) => t).sort();

eq(attach(workCategoriesForProjectType("full_package")).length, 8, "full_package attaches all 8 SWMS");
eq(attach(workCategoriesForProjectType("fitoff")).includes("Working at Heights (>2 m)"), false, "fit-off does NOT get Working at Heights");
eq(attach(workCategoriesForProjectType("fitoff")).includes("Roof Work"), false, "fit-off does NOT get Roof Work");
same(attach(workCategoriesForProjectType("fitoff")),
  ["Electrical Leads, Test-and-Tag & Overhead Powerlines", "Manual Handling", "Nail Guns & Powder-actuated Tools", "Power Tools — Silica (Fibre-Cement) & Timber Dust"],
  "fit-off attaches only the interior/always-on set");
eq(attach(workCategoriesForProjectType("frame")).includes("Roof Work"), true, "frame gets Roof Work (roofing)");
eq(attach(["general"]).length, 2, "a bare general job attaches the 2 always-on SWMS (manual handling, electrical)");
eq(attach(workCategoriesForProjectType("full_package")).includes("Manual Handling"), true, "general SWMS attach to every job");

// 3. Dual-FK spine XOR invariant (mirrors the DB CHECK: exactly one of project/carpentry).
const xorOk = (p, c) => (!!p) !== (!!c);
eq(xorOk("proj", null), true, "one spine (project) ok");
eq(xorOk(null, "carp"), true, "one spine (carpentry) ok");
eq(xorOk("proj", "carp"), false, "both spines rejected");
eq(xorOk(null, null), false, "neither spine rejected");

console.log(`carpentry-whs: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
