// register-flag.test.mjs — Master Register feature switch (REGISTER_ENABLED / REGISTER_PILOT_LEADS).
// Pure + a loopback HTTP check of the route gate. No database, no network beyond 127.0.0.1.
// Run: npm run test:register-flag

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";

// Never let a transitive dotenv read the repo's .env (production credentials): import from an empty cwd.
process.chdir(mkdtempSync(join(tmpdir(), "register-flag-")));
for (const k of ["REGISTER_ENABLED", "REGISTER_PILOT_LEADS", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
const { registerEnabledFor } = await import("../../server/lib/registerStore.mjs");
const { registerRegisterRoutes } = await import("../../server/lib/registerRoutes.mjs");

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${detail}` : ""}`); } };
const PILOT = "35368915-B8DD-4B02-82F2-A9FBC37D5413";
const OTHER = "11111111-2222-3333-4444-555555555555";

ok("switch: off by default", !registerEnabledFor(PILOT) && !registerEnabledFor(OTHER));
process.env.REGISTER_PILOT_LEADS = ` ${PILOT.toLowerCase()} , `;
ok("switch: pilot list turns it on for listed leads only (case/whitespace tolerant)", registerEnabledFor(PILOT) && !registerEnabledFor(OTHER) && !registerEnabledFor(""));
process.env.REGISTER_ENABLED = "TRUE";
ok("switch: REGISTER_ENABLED=true turns it on for every lead", registerEnabledFor(OTHER));
process.env.REGISTER_ENABLED = "1";
ok("switch: anything but 'true' leaves the global switch off", !registerEnabledFor(OTHER) && registerEnabledFor(PILOT));
delete process.env.REGISTER_ENABLED;

const app = express();
app.use(express.json());
registerRegisterRoutes(app);
const server = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
const url = (id, path = "") => `http://127.0.0.1:${server.address().port}/api/register/leads/${id}${path}`;
try {
  const off = await fetch(url(OTHER));
  const offBody = await off.json();
  ok("gate: a lead outside the pilot gets 404 REGISTER_DISABLED (before auth, nothing else runs)", off.status === 404 && offBody.code === "REGISTER_DISABLED" && offBody.ok === false);
  const offPut = await fetch(url(OTHER), { method: "PUT", headers: { "content-type": "application/json" }, body: "{}" });
  const offDoc = await fetch(url(OTHER, "/documents/client_brief/issue"), { method: "POST" });
  ok("gate: writes and document issues are refused the same way", offPut.status === 404 && offDoc.status === 404);
  const on = await fetch(url(PILOT));
  ok("gate: a pilot lead passes the switch and reaches the staff auth check (401 without a session)", on.status === 401);
} finally {
  server.close();
}

console.log(`\nregister-flag: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
