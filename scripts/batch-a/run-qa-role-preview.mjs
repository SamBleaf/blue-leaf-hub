#!/usr/bin/env node
/**
 * HUB-QA-ROLE-PREVIEW — Role Preview Console (Developer Tools).
 * Self-contained: static wiring + the live role × access matrix logic (no server needed).
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { PERSONAS, gateFor } from "../../src/lib/roleAccess.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");
let pass = 0, fail = 0;
const ok = (n) => { console.log(`  ✓ ${n}`); pass++; };
const no = (n, r) => { console.log(`  ✗ ${n}${r ? " — " + r : ""}`); fail++; };

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║   HUB-QA-ROLE-PREVIEW — Role Preview Console                   ║");
console.log("╚══════════════════════════════════════════════════════════════╝");

// ── Static wiring ──
const comp = read("src/components/settings/RolePreviewConsole.jsx");
(comp.includes('role !== "admin"') && comp.includes("Read-only preview") && comp.includes("never uses a real worker/client token"))
  ? ok("QA-RP-01 console is admin-only + read-only + not-real-auth banner") : no("QA-RP-01 console gate/banner");
read("src/pages/Settings.jsx").includes("RolePreviewConsole")
  ? ok("QA-RP-02 Settings → Developer Tools renders the console") : no("QA-RP-02 Settings wiring");
(PERSONAS.length >= 9 && PERSONAS.some(p => p.tier === "data") && PERSONAS.some(p => p.tier === "partial"))
  ? ok(`QA-RP-03 roleAccess defines ${PERSONAS.length} personas (incl data-only + flag tiers)`) : no("QA-RP-03 personas");
(comp.includes("WorkerPreview") && comp.includes("ClientPreview") && comp.includes("/task-preview") && comp.includes("/overview"))
  ? ok("QA-RP-10 worker (P3) + client (P4) live previews wired, reusing read-only admin routes") : no("QA-RP-10 live previews");

// ── Live matrix logic (driven by the real roles.js can.*) ──
const P = (k) => PERSONAS.find(p => p.key === k);
const g = (k, gate) => gateFor(P(k), gate);
(g("admin", "accessFinance") === true && g("admin", "manageUsers") === true && g("admin", "accessSales") === true)
  ? ok("QA-RP-04 admin: finance + sales + manage-users allowed") : no("QA-RP-04 admin matrix");
(g("supervisor", "accessFinance") === false && g("supervisor", "accessWorkforce") === true && g("supervisor", "viewCostData") === false && g("supervisor", "accessSales") === false)
  ? ok("QA-RP-05 supervisor: workforce yes; finance/sales/$ blocked") : no("QA-RP-05 supervisor matrix");
(g("employee", "accessWorkforce") === false && g("employee", "accessOperations") === true && g("employee", "approveTimesheets") === false)
  ? ok("QA-RP-06 employee: operations yes; workforce/approve blocked") : no("QA-RP-06 employee matrix");
(g("client", "accessClientPortal") === true && g("client", "accessOperations") === false)
  ? ok("QA-RP-07 client: portal only, no staff modules") : no("QA-RP-07 client matrix");
(g("worker", "accessOperations") === null && g("subcontractor", "accessFinance") === null && g("supplier", "accessFinance") === null)
  ? ok("QA-RP-08 worker / subcontractor / supplier: n/a (no staff DB role)") : no("QA-RP-08 non-DB personas n/a");
(g("leading_hand", "accessWorkforce") === g("employee", "accessWorkforce"))
  ? ok("QA-RP-09 leading hand resolves via its employee DB role") : no("QA-RP-09 leading-hand mapping");

console.log(`\n  Passed: ${pass}  Failed: ${fail}`);
process.exit(fail ? 1 : 0);
