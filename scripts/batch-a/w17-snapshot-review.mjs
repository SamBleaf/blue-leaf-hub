/**
 * W17-P2 — Snapshot weekly review baseline
 *
 * Static checks (always): the completion-snapshot API returns the new per-day
 * { state, status, hours } shape, SnapshotTab tolerates string+object + previous-week
 * default, and protected/W16/tab surfaces are intact.
 * Write checks (--write): seed a full-time employee + a past week of timesheets
 * (approved / submitted / rejected / none) with entries, then assert the snapshot API
 * reports distinct states, hours, missing, and week navigation. All artifacts are
 * BLH TEST marked and removed in finally. The full W15/W16 :write regressions run
 * via the separate regression gate (package.json scripts).
 */
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { WRITE, get, serviceClient } from "./_helpers.mjs";
import { ensureE2EUsers } from "../create-e2e-users.mjs";

const E2E_PASSWORD = "BlueLeaf-E2E-2026!";
const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SB_ANON = process.env.VITE_SUPABASE_ANON_KEY;

async function getTokenForEmail(email, password = E2E_PASSWORD) {
  if (!SB_URL || !SB_ANON) throw new Error("Missing Supabase URL or anon key");
  const sb = createClient(SB_URL, SB_ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) throw new Error(error?.message || `No session for ${email}`);
  return data.session.access_token;
}

function root() { return join(dirname(fileURLToPath(import.meta.url)), "..", ".."); }
function readRootFile(relPath) { return readFileSync(join(root(), relPath), "utf8"); }
function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function mondayWeeksAgo(n) {
  const now = new Date();
  const dow = now.getDay(); // 0 Sun .. 6 Sat
  const offsetToMon = (dow === 0 ? -6 : 1 - dow);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetToMon - 7 * n);
}

// ── Static checks ───────────────────────────────────────────────────────────
function checkBackendShape(run) {
  run.section("W17-REQ-TS static — completion-snapshot API shape");
  const src = readRootFile("server/lib/workforceRoutes.mjs");
  if (src.includes("days[d] = { state, status: st, hours }")) run.pass("W17-REQ-TS-03 per-day { state, status, hours } object");
  else run.fail("W17-REQ-TS-03 per-day object", "per-day object marker missing");
  if (src.includes("timesheet_entries") && src.includes("hoursByKey")) run.pass("W17-REQ-TS-04 hours derived from timesheet_entries");
  else run.fail("W17-REQ-TS-04 hours source", "timesheet_entries / hoursByKey markers missing");
}

function checkFrontendShape(run) {
  run.section("W17-REQ-TS static — SnapshotTab UI");
  const wf = readRootFile("src/pages/Workforce.jsx");
  if (wf.includes('typeof value === "object"')) run.pass("W17-REQ-TS-03 SnapshotTab tolerates string + object day values");
  else run.fail("W17-REQ-TS-03 SnapshotTab compat", "object-tolerant cell missing");
  if (wf.includes("GLYPH_CH") && wf.includes("submitted")) run.pass("W17-REQ-TS-03 distinct approved/submitted/rejected/missing/na glyphs");
  else run.fail("W17-REQ-TS-03 state glyphs", "GLYPH_CH map missing");
  if (wf.includes("(1 - dow) - 7")) run.pass("W17-REQ-TS-01 previous-week default (Mon/Tue/Wed)");
  else run.fail("W17-REQ-TS-01 prev-week default", "previous-week computation missing");
}

function checkRegressionStatic(run) {
  run.section("W17-REG static guards (full W15/W16 :write suites run in the gate)");
  const wf = readRootFile("src/pages/Workforce.jsx");
  const tabs = (wf.match(/const TABS = \[([^\]]+)\]/) || [])[1] || "";
  if (tabs.includes('"Approvals"')) run.pass("W17-REG-01 Approvals tab preserved");
  else run.fail("W17-REG-01 Approvals tab", "missing from TABS");
  if (tabs.includes('"Team"')) run.pass("W17-REG-02 Team tab preserved");
  else run.fail("W17-REG-02 Team tab", "missing from TABS");
  const src = readRootFile("server/lib/workforceRoutes.mjs");
  const approveOk = src.includes("async function approveSingleTimesheet")
    && src.includes('app.post("/api/workforce/timesheets/:id/approve"');
  if (approveOk && existsSync(join(root(), "scripts/batch-a/run-w15-timesheet-auth.mjs"))) run.pass("W17-REG-03 W15 timesheet auth surface intact (approve route + suite present)");
  else run.fail("W17-REG-03 W15 surface", "approve route or w15 suite missing");
  if (src.includes("/api/workforce/allocations") && existsSync(join(root(), "scripts/batch-a/run-w16-allocation-baseline.mjs"))) run.pass("W17-REG-04 W16 allocation surface intact (routes + suite present)");
  else run.fail("W17-REG-04 W16 surface", "allocation routes or w16 suite missing");
  if (src.includes("export async function syncTimesheetToBuildexact")
    && src.includes('app.post("/api/workforce/timesheets/:id/sync"')
    && src.includes('app.post("/api/workforce/timesheets/sync-pending"')) run.pass("W17-REG-05 Buildxact sync static guard (functions + routes present)");
  else run.fail("W17-REG-05 Buildxact sync guard", "a protected sync marker is missing");
}

// ── Write check ─────────────────────────────────────────────────────────────
async function checkSnapshotApi(run, adminToken, svc) {
  run.section("W17-REQ-TS-02..06 — completion-snapshot API (write)");
  const mon = mondayWeeksAgo(2);
  const dates = [0, 1, 2, 3, 4].map((i) => ymd(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i)));
  const weekStart = dates[0];
  const stamp = Date.now();
  const { data: emp, error: empErr } = await svc.from("employees").insert({
    name: `BLH TEST W17 SNAPSHOT ${stamp}`, trade: "carpenter", employment_type: "full_time", is_active: true,
  }).select("id").single();
  if (empErr || !emp?.id) { run.fail("seed employee", empErr?.message || "no id"); return; }
  const empId = emp.id;
  const tsIds = [];
  try {
    const seed = [
      { date: dates[0], status: "approved", hours: 8 },
      { date: dates[1], status: "submitted", hours: 7.5 },
      { date: dates[2], status: "rejected", hours: 8 },
    ];
    for (const s of seed) {
      const { data: t, error: te } = await svc.from("timesheets")
        .insert({ employee_id: empId, date: s.date, status: s.status }).select("id").single();
      if (te || !t?.id) { run.fail("seed timesheet", te?.message || "no id"); return; }
      tsIds.push(t.id);
      const { error: ee } = await svc.from("timesheet_entries")
        .insert({ timesheet_id: t.id, employee_id: empId, task_category: "first_fix_framing", hours: s.hours });
      if (ee) { run.fail("seed timesheet entry", ee.message); return; }
    }

    const { status, body } = await get(`/api/workforce/completion-snapshot?weekStart=${weekStart}`, adminToken);
    if (status !== 200 || !body.ok) { run.fail("GET completion-snapshot", `status=${status} ok=${body.ok}`); return; }

    // W17-REQ-TS-06 working_days controls the visible days (Mon–Fri default = 5)
    if (Array.isArray(body.dates) && body.dates.length === 5 && body.dates[0] === weekStart) run.pass("W17-REQ-TS-06 working_days controls visible days (5)");
    else run.fail("W17-REQ-TS-06 dates", `dates=${JSON.stringify(body.dates)}`);

    const me = (body.employees || []).find((e) => e.id === empId);
    if (!me) { run.fail("employee in snapshot", "seeded employee not returned"); return; }
    const dMon = me.days[dates[0]], dTue = me.days[dates[1]], dWed = me.days[dates[2]], dThu = me.days[dates[3]];

    // W17-REQ-TS-03 distinct states + raw status preserved
    if (dMon?.state === "approved" && dTue?.state === "submitted" && dWed?.state === "rejected" && dThu?.state === "missing") run.pass("W17-REQ-TS-03 approved/submitted/rejected/missing distinct");
    else run.fail("W17-REQ-TS-03 states", `mon=${dMon?.state} tue=${dTue?.state} wed=${dWed?.state} thu=${dThu?.state}`);
    if (dMon?.status === "approved" && dWed?.status === "rejected") run.pass("W17-REQ-TS-03 raw timesheet status preserved");
    else run.fail("W17-REQ-TS-03 raw status", `mon=${dMon?.status} wed=${dWed?.status}`);

    // W17-REQ-TS-04 hours per day from entries
    if (Number(dMon?.hours) === 8 && Number(dTue?.hours) === 7.5) run.pass("W17-REQ-TS-04 hours per day from timesheet_entries");
    else run.fail("W17-REQ-TS-04 hours", `mon=${dMon?.hours} tue=${dTue?.hours}`);

    // W17-REQ-TS-02 missing days visible (Wed rejected + Thu + Fri none → ≥3)
    if (me.missing >= 3 && dThu?.state === "missing") run.pass("W17-REQ-TS-02 missing days visible (count + state)");
    else run.fail("W17-REQ-TS-02 missing", `missing=${me.missing} thu=${dThu?.state}`);

    // W17-REQ-TS-05 week navigation → different week returned
    const nextMon = ymd(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 7));
    const r2 = await get(`/api/workforce/completion-snapshot?weekStart=${nextMon}`, adminToken);
    if (r2.status === 200 && r2.body.week_start === nextMon && r2.body.week_start !== body.week_start) run.pass("W17-REQ-TS-05 week navigation changes the week");
    else run.fail("W17-REQ-TS-05 week nav", `w1=${body.week_start} w2=${r2.body?.week_start}`);
  } finally {
    for (const id of tsIds) await svc.from("timesheets").delete().eq("id", id);
    await svc.from("employees").delete().eq("id", empId);
  }
}

export async function runW17SnapshotReview(run) {
  run.section("W17-P2 — Snapshot weekly review baseline");
  checkBackendShape(run);
  checkFrontendShape(run);
  checkRegressionStatic(run);

  if (!WRITE) {
    run.gap("W17-REQ-TS-02..06 completion-snapshot API", "requires --write");
    return;
  }

  const users = await ensureE2EUsers();
  const adminToken = await getTokenForEmail(users.admin.email);
  const svc = serviceClient();
  await checkSnapshotApi(run, adminToken, svc);
}
