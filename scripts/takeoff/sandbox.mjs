// =============================================================================
// Takeoff LOCAL SANDBOX — try the real takeoff on your own drawings without touching the live Hub.
//
//   npm run takeoff:sandbox -- "/path/to/drawings"        (folder of PDFs, or individual PDF files)
//   npm run takeoff:sandbox -- --reset "/path/to/drawings" (start again from an empty takeoff)
//
// What runs (all on this Mac):
//   * a private Postgres 17 database `blh_takeoff_sandbox` with migrations 206 + 207 (persistent between runs; additive ones re-applied)
//   * the REAL takeoff + plan routes (server/lib/takeoff, workforceRoutes) on 127.0.0.1:8788 —
//     real calculations, database rules, supplier-PDF renderer; files kept in ~/Takeoff-Sandbox/storage
//   * the app in UI Review Mode on port 5181 (also on your Wi-Fi for an iPhone), with ONLY the
//     takeoff calls passed through to the sandbox server. Everything else in the app is demo data.
// Nothing is sent to Supabase, Railway, suppliers or anyone else. Drawings never leave this Mac.
// =============================================================================
import { register } from "node:module";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir, networkInterfaces } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import pg from "pg";
import { persistentTakeoffDb } from "../tests/lib/takeoffTestDb.mjs";
import { makePgSupabase } from "../tests/lib/pgSupabaseShim.mjs";

const args = process.argv.slice(2);
const reset = args.includes("--reset");
const inputs = args.filter((a) => !a.startsWith("--"));
// TAKEOFF_SANDBOX_DB / TAKEOFF_SANDBOX_HOME: an ISOLATED sandbox (e.g. automated evidence runs) that never touches
// the owner's own sandbox database or files
const DB_NAME = /^[a-z_][a-z0-9_]{0,62}$/.test(process.env.TAKEOFF_SANDBOX_DB || "") ? process.env.TAKEOFF_SANDBOX_DB : "blh_takeoff_sandbox";
const HOME = process.env.TAKEOFF_SANDBOX_HOME ? resolve(process.env.TAKEOFF_SANDBOX_HOME) : join(homedir(), "Takeoff-Sandbox");
const STORAGE = join(HOME, "storage");
const API_PORT = Number(process.env.TAKEOFF_SANDBOX_API_PORT || 8788);
const WEB_PORT = Number(process.env.TAKEOFF_SANDBOX_WEB_PORT || 5181);
mkdirSync(STORAGE, { recursive: true });

// Fixed sandbox identities (local only).
const IDS = {
  job: "5a4db0c5-0000-4000-8000-00000000a001",
  admin: "5a4db0c5-0000-4000-8000-00000000a0a1",
  leadingHand: "5a4db0c5-0000-4000-8000-00000000e001",
  supplier: "5a4db0c5-0000-4000-8000-00000000f001",
};
const TOKENS = { admin: "sandbox-admin", leadingHand: "sandbox-leading-hand" };

const db = await persistentTakeoffDb(DB_NAME, { reset });
if (db.skip) { console.error(`Sandbox needs local Postgres: ${db.skip}`); process.exit(1); }
const pool = new pg.Pool({ connectionString: db.url, max: 8 });
const sb = makePgSupabase(pool, { storageDir: STORAGE, signedUrlBase: "/api/sandbox-file" });
sb._tokens.set(TOKENS.admin, { id: IDS.admin, email: "director@sandbox.local" });
globalThis.__MOCK_SB__ = sb;
register("data:text/javascript," + encodeURIComponent(`
export async function load(url, context, nextLoad) {
  if (url.endsWith("/server/lib/supabaseService.mjs")) return { format: "module", shortCircuit: true, source: "export function getServiceSupabase(){ return globalThis.__MOCK_SB__ || null; }" };
  return nextLoad(url, context);
}`), import.meta.url);

// ── seed (idempotent) ─────────────────────────────────────────────────────────
const q = (sql, p) => pool.query(sql, p);
await q("INSERT INTO auth.users (id, email) VALUES ($1, 'director@sandbox.local') ON CONFLICT DO NOTHING", [IDS.admin]);
await q("INSERT INTO user_profiles (id, role, full_name) VALUES ($1, 'admin', 'Sandbox Director') ON CONFLICT DO NOTHING", [IDS.admin]);
await q("INSERT INTO carpentry_jobs (id, address, client_name, status) VALUES ($1, 'Sandbox job — your drawings', 'Takeoff test', 'active') ON CONFLICT DO NOTHING", [IDS.job]);
await q("INSERT INTO employees (id, name, is_leading_hand, is_active, worker_token) VALUES ($1, 'Sandbox Leading Hand', true, true, $2) ON CONFLICT DO NOTHING", [IDS.leadingHand, TOKENS.leadingHand]);
await q("INSERT INTO suppliers (id, name, email, phone, contact_name) VALUES ($1, 'Fielders (SANDBOX — not a real contact)', 'orders@example.invalid', '00 0000 0000', 'Sandbox orders') ON CONFLICT DO NOTHING", [IDS.supplier]);
if (!(await q("SELECT 1 FROM company_profile LIMIT 1")).rowCount) {
  await q("INSERT INTO company_profile (name, address, phone, email) VALUES ('Blue Leaf Building (sandbox)', 'Sandbox address', '00 0000 0000', 'office@example.invalid')");
}

// ── load drawings (and keep watching the folders: drop PDFs in, refresh the page) ─────
const sources = (inputs.length ? inputs : [join(HOME, "drawings")]).map((i) => resolve(i.replace(/^~(?=\/)/, homedir())));
mkdirSync(join(HOME, "drawings"), { recursive: true });
function listPdfs() {
  const out = [];
  for (const p of sources) {
    if (!existsSync(p)) continue;
    if (statSync(p).isDirectory()) for (const f of readdirSync(p).sort()) { if (extname(f).toLowerCase() === ".pdf") out.push(join(p, f)); }
    else if (extname(p).toLowerCase() === ".pdf") out.push(p);
  }
  return out;
}
async function loadDrawings() {
  let n = 0;
  for (const file of listPdfs()) {
    let bytes;
    try { bytes = readFileSync(file); } catch { continue; } // still being copied — next scan
    const sha = createHash("sha256").update(bytes).digest("hex");
    if ((await q("SELECT 1 FROM job_documents WHERE content_sha256=$1 AND carpentry_job_id=$2", [sha, IDS.job])).rowCount) continue;
    const id = randomUUID();
    const name = basename(file).toLowerCase().replace(/[^a-z0-9.\-]+/g, "-").replace(/-+/g, "-");
    const path = `carpentry/${IDS.job}/${id.slice(0, 8)}-${name}`;
    sb._buckets.get("job-plans").set(path, bytes);
    await q(`INSERT INTO job_documents (id, carpentry_job_id, document_type, title, status, storage_provider, storage_path, audience_layer, content_sha256, byte_size, uploaded_by)
             VALUES ($1,$2,'architectural',$3,'current','supabase',$4,'worker',$5,$6,$7)`, [id, IDS.job, basename(file), `job-plans/${path}`, sha, bytes.length, IDS.admin]);
    n++;
  }
  return n;
}
const added = await loadDrawings();
const pdfs = listPdfs();
const total = (await q("SELECT count(*)::int n FROM job_documents WHERE carpentry_job_id=$1 AND status='current'", [IDS.job])).rows[0].n;
setInterval(async () => { const n = await loadDrawings().catch(() => 0); if (n) process.stdout.write(`  + ${n} new drawing(s) loaded — refresh the page.\n`); }, 4000);

// ── API server ────────────────────────────────────────────────────────────────
process.env.TAKEOFF_ENABLED = "true";
const { default: express } = await import("express");
const { registerWorkforceRoutes } = await import("../../server/lib/workforceRoutes.mjs");
const { registerTakeoffRoutes } = await import("../../server/lib/takeoff/takeoffRoutes.mjs");
const app = express();
app.use(express.json({ limit: "100mb" }));
// "Open in device viewer" for files over the in-app limit: serve the stored bytes locally.
app.get("/api/sandbox-file/:bucket/*", (req, res) => {
  const buf = sb._buckets.get(req.params.bucket).get(req.params[0]);
  if (!buf) return res.status(404).end();
  res.setHeader("Content-Type", "application/pdf"); res.end(buf);
});
const quiet = console.log; console.log = () => {};
registerWorkforceRoutes(app);
registerTakeoffRoutes(app);
console.log = quiet;
app.listen(API_PORT, "127.0.0.1");

// ── web (Vite, UI Review Mode + sandbox passthrough) ─────────────────────────
const vite = spawn("npx", ["vite", "--port", String(WEB_PORT), "--strictPort", "--host"], {
  cwd: new URL("../../", import.meta.url).pathname,
  env: { ...process.env, VITE_UI_REVIEW_MODE: "true", VITE_TAKEOFF_SANDBOX: "true", VITE_TAKEOFF_SANDBOX_JOB: IDS.job, PORT_API: String(API_PORT) },
  stdio: ["ignore", "pipe", "pipe"],
});
vite.stderr.on("data", (d) => { const t = String(d); if (/error/i.test(t)) process.stderr.write(t); });
const lan = Object.values(networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal)?.address;
await new Promise((r) => vite.stdout.on("data", (d) => { if (/ready in/i.test(String(d))) r(); }));

console.log(`
  Takeoff sandbox is running (local only — nothing leaves this Mac).
  Drawings: ${added} added this run, ${total} plan file(s) in the sandbox job.
  Watching: ${sources.join(", ")} — drop more PDFs in and refresh the page.${pdfs.length ? "" : `
  (No PDFs yet — copy drawings into ${sources[0]}.)`}

  On this Mac (director view):  http://localhost:${WEB_PORT}/carpentry/${IDS.job}/takeoff?reviewRole=admin
  Worker app view (leading hand): http://localhost:${WEB_PORT}/worker/takeoff/carpentry/${IDS.job}${lan ? `
  iPhone on the same Wi-Fi:       http://${lan}:${WEB_PORT}/worker/takeoff/carpentry/${IDS.job}` : ""}

  Data + files: ${HOME}   ·   Start fresh: add --reset   ·   Stop: Ctrl+C
`);
const stop = () => { vite.kill(); pool.end().finally(() => process.exit(0)); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
