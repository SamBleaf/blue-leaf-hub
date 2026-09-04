// =============================================================================
// ADVERSARIAL INTEGRATION E2E for the BL-INTERNAL cost-category feature.
//
//   node scripts/test/internalJobE2E.test.mjs
//
// Drives the REAL Express route handlers (registerWorkforceRoutes,
// registerInternalCategoryRoutes, registerCarpentryRoutes) against an in-memory
// mock Supabase — NO database, NO reimplementation of the money maths. The mock
// only implements the query chains these handlers actually use. Handlers are
// invoked by pulling the FINAL registered handler for a route and calling it with
// a fabricated req/res (auth middleware skipped; req.caller set directly).
//
// getServiceSupabase() is replaced, per module, via an ESM `load` hook that swaps
// server/lib/supabaseService.mjs for a shim returning globalThis.__MOCK_SB__ — so
// every handler transparently talks to the mock we install for that scenario.
//
// Scenarios (see the parent brief) — each genuinely exercises a real handler:
//   1  approve {annual,4h}  → RDO rows typed annual+4h; deriveLeaveCost costs it 4×base×1.175×(1+SG)
//   2  approve {rdo}        → typed rdo; costed hours×break_even (NO extra super)
//   3  approve {unpaid}     → costed $0 but hours still reported
//   4  record-sick 7.6h     → typed sick, base×(1+SG); dup→409; mig 201 absent→503
//   5  no double-count      → leave∩public-holiday excluded; half-day=4h + 4h worked = one paid day
//   6  worker tag guard     → leave-category id 400-rejects; worked id accepted (row carries the tag)
//   7  retro-assign guard   → leave target 400; worked target ok
//   8  internal-cost-summary→ BL-CHARGEUP byte-identical shape; BL-INTERNAL gains merged categories axis
// =============================================================================
import assert from "node:assert/strict";
import { register } from "node:module";

// ── Install the getServiceSupabase() shim BEFORE importing the route modules ──
const loaderSrc = `
export async function load(url, context, nextLoad) {
  if (url.endsWith("/server/lib/supabaseService.mjs")) {
    return { format: "module", shortCircuit: true,
      source: "export function getServiceSupabase(){ return globalThis.__MOCK_SB__ || null; }" };
  }
  return nextLoad(url, context);
}`;
register("data:text/javascript," + encodeURIComponent(loaderSrc), import.meta.url);

const { registerWorkforceRoutes } = await import("../../server/lib/workforceRoutes.mjs");
const { registerInternalCategoryRoutes } = await import("../../server/lib/internalCategoryRoutes.mjs");
const { registerCarpentryRoutes } = await import("../../server/lib/carpentryRoutes.mjs");

// =============================================================================
// In-memory mock Supabase — only the chains the handlers use, kept faithful.
// =============================================================================
let _idSeq = 1;
const newId = (p = "id") => `${p}_${_idSeq++}`;

function makeSb(store, opts = {}) {
  const missing = opts.missingColumns || {}; // { table: Set(col) }
  const uniques = opts.uniques || {};        // { table: [[col,col], ...] }
  const FK = { timesheets: "timesheet_id" }; // embed 'timesheets' joins on entry.timesheet_id

  const rowsOf = (t) => (store[t] ||= []);

  const getVal = (row, col) => {
    if (col.includes(".")) {
      const [a, b] = col.split(".");
      return row[a] ? row[a][b] : undefined;
    }
    return row[col];
  };
  const matchFilter = (row, f) => {
    const v = getVal(row, f.col);
    switch (f.op) {
      case "eq": return v === f.val;
      case "in": return Array.isArray(f.val) && f.val.includes(v);
      case "gte": return v != null && v >= f.val;
      case "lte": return v != null && v <= f.val;
      case "is": return f.val === null ? v == null : v === f.val;
      case "not_is": return f.val === null ? v != null : v !== f.val;
      default: return true;
    }
  };

  class QB {
    constructor(table) {
      this.table = table;
      this._f = [];
      this._order = [];
      this._limit = null;
      this._select = "*";
      this._mode = null;      // insert | update | delete
      this._payload = null;
      this._retSel = false;
      this._single = null;    // single | maybe
    }
    select(s = "*") { this._select = s; if (this._mode) this._retSel = true; return this; }
    eq(col, val) { this._f.push({ op: "eq", col, val }); return this; }
    in(col, val) { this._f.push({ op: "in", col, val }); return this; }
    gte(col, val) { this._f.push({ op: "gte", col, val }); return this; }
    lte(col, val) { this._f.push({ op: "lte", col, val }); return this; }
    is(col, val) { this._f.push({ op: "is", col, val }); return this; }
    not(col, op, val) { this._f.push({ op: "not_" + op, col, val }); return this; }
    order(col, o) { this._order.push({ col, asc: o?.ascending !== false }); return this; }
    limit(n) { this._limit = n; return this; }
    insert(p) { this._mode = "insert"; this._payload = p; return this; }
    update(p) { this._mode = "update"; this._payload = p; return this; }
    delete() { this._mode = "delete"; return this; }
    single() { this._single = "single"; return this._exec(); }
    maybeSingle() { this._single = "maybe"; return this._exec(); }
    then(res, rej) { return this._exec().then(res, rej); }

    _missingErr() {
      const set = missing[this.table];
      if (!set) return null;
      for (const c of String(this._select).split(",").map((s) => s.trim())) if (set.has(c)) return colErr(c);
      for (const f of this._f) { if (set.has(f.col)) return colErr(f.col); }
      if (this._payload && !Array.isArray(this._payload)) for (const k of Object.keys(this._payload)) if (set.has(k)) return colErr(k);
      return null;
    }
    _attachEmbeds(list) {
      const m = /(\w+)!inner\(/.exec(this._select) || /(\w+)\(/.exec(this._select);
      if (!m) return list;
      const embed = m[1];
      const fk = FK[embed];
      if (!fk) return list;
      const out = [];
      for (const r of list) {
        const parent = rowsOf(embed).find((p) => p.id === r[fk]);
        const inner = /!inner\(/.test(this._select);
        if (inner && !parent) continue;
        out.push({ ...r, [embed]: parent || null });
      }
      return out;
    }
    _read() {
      let list = rowsOf(this.table).map((r) => ({ ...r }));
      list = this._attachEmbeds(list);
      list = list.filter((r) => this._f.every((f) => matchFilter(r, f)));
      if (this._order.length) {
        list.sort((a, b) => {
          for (const o of this._order) {
            const av = a[o.col], bv = b[o.col];
            if (av < bv) return o.asc ? -1 : 1;
            if (av > bv) return o.asc ? 1 : -1;
          }
          return 0;
        });
      }
      if (this._limit != null) list = list.slice(0, this._limit);
      return list;
    }
    async _exec() {
      const me = this._missingErr();
      if (me) return { data: null, error: me };

      if (this._mode === "insert") {
        const incoming = Array.isArray(this._payload) ? this._payload : [this._payload];
        const inserted = [];
        for (const raw of incoming) {
          const row = { ...raw };
          if (row.id == null) row.id = newId("row");
          for (const u of uniques[this.table] || []) {
            if (rowsOf(this.table).some((ex) => u.every((c) => ex[c] === row[c]))) {
              return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
            }
          }
          rowsOf(this.table).push(row);
          inserted.push({ ...row });
        }
        return this._single ? { data: inserted[0] ?? null, error: null } : { data: inserted, error: null };
      }

      if (this._mode === "update") {
        const targets = rowsOf(this.table).filter((r) => this._f.every((f) => matchFilter(r, f)));
        for (const t of targets) Object.assign(t, this._payload);
        const copies = targets.map((t) => ({ ...t }));
        if (!this._retSel) return { data: null, error: null };
        return this._single ? { data: copies[0] ?? null, error: null } : { data: copies, error: null };
      }

      if (this._mode === "delete") {
        const keep = rowsOf(this.table).filter((r) => !this._f.every((f) => matchFilter(r, f)));
        store[this.table] = keep;
        return { data: null, error: null };
      }

      const list = this._read();
      if (this._single === "single") {
        return list.length ? { data: list[0], error: null } : { data: null, error: { code: "PGRST116", message: "no rows" } };
      }
      if (this._single === "maybe") return { data: list[0] ?? null, error: null };
      return { data: list, error: null };
    }
  }
  const colErr = (c) => ({ code: "42703", message: `column "${c}" does not exist` });

  return { from: (t) => new QB(t) };
}

// ── Fake Express app: capture routes; invoke the final handler directly ───────
function makeApp() {
  const routes = new Map();
  const reg = (method) => (path, ...hs) => { routes.set(`${method} ${path}`, hs); };
  return {
    get: reg("GET"), post: reg("POST"), put: reg("PUT"), patch: reg("PATCH"), delete: reg("DELETE"),
    use() {}, _routes: routes,
  };
}
const app = makeApp();
registerWorkforceRoutes(app);
registerInternalCategoryRoutes(app);
registerCarpentryRoutes(app);

function handlerFor(method, path) {
  const hs = app._routes.get(`${method} ${path}`);
  if (!hs) throw new Error(`route not registered: ${method} ${path}`);
  return hs[hs.length - 1];
}
function makeRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; } };
}
async function call(method, path, { params = {}, query = {}, body = {}, caller = { id: "admin1", role: "admin" }, workerEmployee } = {}, sb) {
  globalThis.__MOCK_SB__ = sb;
  const req = { params, query, body, caller, workerEmployee, headers: {} };
  const res = makeRes();
  await handlerFor(method, path)(req, res);
  return res;
}

// ── Common fixtures ───────────────────────────────────────────────────────────
const INTERNAL_JOB = "carp_internal";
const CHARGEUP_JOB = "carp_chargeup";
const SG = 0.12; // FY 2025-26
const annualRate = 40 * 1.175 * (1 + SG); // 52.64
const sickRate = 40 * (1 + SG);           // 44.8
const round2 = (n) => Math.round(n * 100) / 100;

// Seed a fresh store wired for the leave/internal feature (mig 200/201 applied).
function seedBase({ standardHours = 7.6 } = {}) {
  return {
    carpentry_jobs: [
      { id: INTERNAL_JOB, reference: "BL-INTERNAL", address: "Office / internal", status: "active", client_name: null },
      { id: CHARGEUP_JOB, reference: "BL-CHARGEUP", address: "Charge up", status: "active", client_name: null },
    ],
    internal_categories: [
      { id: "cat_logistics", carpentry_job_id: INTERNAL_JOB, category_label: "Logistics", slug: "logistics", cost_source: "timesheet", leave_type: null, status: "active", sort_order: 10, created_at: "2025-01-01", notes: null },
      { id: "cat_annual", carpentry_job_id: INTERNAL_JOB, category_label: "Annual leave", slug: "annual_leave", cost_source: "leave", leave_type: "annual", status: "active", sort_order: 40, created_at: "2025-01-02", notes: null },
      { id: "cat_sick", carpentry_job_id: INTERNAL_JOB, category_label: "Sick leave", slug: "sick_leave", cost_source: "leave", leave_type: "sick", status: "active", sort_order: 50, created_at: "2025-01-03", notes: null },
      { id: "cat_rdo", carpentry_job_id: INTERNAL_JOB, category_label: "RDO", slug: "rdo", cost_source: "leave", leave_type: "rdo", status: "active", sort_order: 60, created_at: "2025-01-04", notes: null },
      { id: "cat_unpaid", carpentry_job_id: INTERNAL_JOB, category_label: "Unpaid", slug: "unpaid", cost_source: "leave", leave_type: "unpaid", status: "active", sort_order: 70, created_at: "2025-01-05", notes: null },
    ],
    employees: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01", name: "Erin One", hourly_rate: 40, is_active: true }],
    employee_cost_rates: [{ employee_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01", base_hourly: 40, true_hourly: 55, break_even_hourly: 60, charge_up_hourly: 90 }],
    company_cost_model: [{ hours_per_day: 8, margin_pct: 20 }],
    workforce_settings: [{ standard_hours: standardHours }],
    timesheets: [],
    timesheet_entries: [],
    workforce_day_off_requests: [],
    workforce_employee_rdo_dates: [],
    workforce_team_rdo_dates: [],
    workforce_rdo_patterns: [],
    workforce_public_holidays: [],
    projects: [],
    charge_up_jobs: [],
    carpentry_job_budgets: [],
    carpentry_budget_line_items: [],
    user_profiles: [],
  };
}
const RDO_UNIQUE = { workforce_employee_rdo_dates: [["employee_id", "rdo_date"]] };

// Import the pure engine to cost the rows the handlers wrote (same code the report uses).
const { deriveLeaveCost, listCategories } = await import("../../server/lib/internalCategoryService.mjs");
const { getCostModel } = await import("../../server/lib/costModelService.mjs");

async function costWindow(sb, from, to) {
  const costModel = await getCostModel(sb);
  const cats = await listCategories(sb, INTERNAL_JOB, { includeArchived: true });
  return deriveLeaveCost(sb, { from, to, costModel, categories: cats });
}

// ── Test harness scaffolding ──────────────────────────────────────────────────
const results = [];
const bugs = [];
async function scenario(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  PASS  ${name}`);
  } catch (e) {
    results.push({ name, ok: false, err: e });
    console.log(`  FAIL  ${name}\n        ${e.message.split("\n")[0]}`);
  }
}

// =============================================================================
// SCENARIO 1 — approve {annual, 4h}
// =============================================================================
await scenario("1 approve {annual,4h} → rows typed annual+4h; costed 4×base×1.175×(1+SG)", async () => {
  const store = seedBase();
  const reqId = "11111111-1111-4111-8111-111111111101";
  store.workforce_day_off_requests.push({ id: reqId, employee_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01", date_from: "2025-09-15", date_to: "2025-09-15", status: "submitted", reason: "AL", applied_rdo_ids: [], leave_type: null });
  const sb = makeSb(store, { uniques: RDO_UNIQUE });

  const res = await call("POST", "/api/workforce/day-off-requests/:id/approve",
    { params: { id: reqId }, body: { leaveType: "annual", hours: 4 } }, sb);
  assert.equal(res.statusCode, 200, `approve returned ${res.statusCode}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.request.leaveType, "annual", "request row mirrors leave_type");

  const rows = store.workforce_employee_rdo_dates.filter((r) => r.rdo_date === "2025-09-15" && r.employee_id === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01");
  assert.equal(rows.length, 1, "one RDO row generated");
  assert.equal(rows[0].leave_type, "annual", "generated row carries leave_type=annual");
  assert.equal(rows[0].hours, 4, "generated row carries hours=4");

  const { rows: costRows, days } = await costWindow(sb, "2025-07-01", "2026-06-30");
  const a = costRows.find((r) => r.leaveType === "annual" && r.fy === "2025-26" && r.quarter === 1);
  assert.ok(a, "annual cost row present");
  assert.equal(a.cost, round2(4 * annualRate), `annual cost = 4×${annualRate} = ${round2(4 * annualRate)}, got ${a.cost}`);
  assert.equal(a.cost, 210.56);
  assert.equal(a.estimated, true, "leave cost is estimated:true");
  const d = days.find((x) => x.date === "2025-09-15");
  assert.equal(d.hours, 4);
});

// =============================================================================
// SCENARIO 2 — approve {rdo} no hours → hours×break_even, no extra super
// =============================================================================
await scenario("2 approve {rdo} → typed rdo; costed hours×break_even (no re-super)", async () => {
  const store = seedBase({ standardHours: 7.6 });
  const reqId = "11111111-1111-4111-8111-111111111102";
  store.workforce_day_off_requests.push({ id: reqId, employee_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01", date_from: "2025-09-16", date_to: "2025-09-16", status: "submitted", applied_rdo_ids: [], leave_type: null });
  const sb = makeSb(store, { uniques: RDO_UNIQUE });

  const res = await call("POST", "/api/workforce/day-off-requests/:id/approve",
    { params: { id: reqId }, body: { leaveType: "rdo" } }, sb);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const row = store.workforce_employee_rdo_dates.find((r) => r.rdo_date === "2025-09-16");
  assert.equal(row.leave_type, "rdo");
  assert.equal(row.hours, undefined, "no hours set → falls back to standard day at cost time");

  const { rows } = await costWindow(sb, "2025-07-01", "2026-06-30");
  const r = rows.find((x) => x.leaveType === "rdo" && x.fy === "2025-26" && x.quarter === 1);
  assert.ok(r, "rdo cost row present");
  assert.equal(r.hours, 7.6, "standard-day hours");
  assert.equal(r.cost, round2(7.6 * 60), `rdo cost = 7.6×break_even(60) = 456, got ${r.cost}`);
  assert.equal(r.cost, 456);
  assert.notEqual(r.cost, round2(7.6 * 60 * (1 + SG)), "RDO must NOT be multiplied by (1+SG) again");
});

// =============================================================================
// SCENARIO 3 — approve {unpaid} → $0 cost, hours still reported
// =============================================================================
await scenario("3 approve {unpaid} → costed $0 but hours reported", async () => {
  const store = seedBase({ standardHours: 7.6 });
  const reqId = "11111111-1111-4111-8111-111111111103";
  store.workforce_day_off_requests.push({ id: reqId, employee_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01", date_from: "2025-09-17", date_to: "2025-09-17", status: "submitted", applied_rdo_ids: [], leave_type: null });
  const sb = makeSb(store, { uniques: RDO_UNIQUE });

  const res = await call("POST", "/api/workforce/day-off-requests/:id/approve",
    { params: { id: reqId }, body: { leaveType: "unpaid" } }, sb);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(store.workforce_employee_rdo_dates.find((r) => r.rdo_date === "2025-09-17").leave_type, "unpaid");

  const { rows } = await costWindow(sb, "2025-07-01", "2026-06-30");
  const r = rows.find((x) => x.leaveType === "unpaid");
  assert.ok(r, "unpaid row present (never dropped)");
  assert.equal(r.cost, 0, "unpaid cost is $0");
  assert.equal(r.hours, 7.6, "unpaid still reports the hours");
});

// =============================================================================
// SCENARIO 4 — record-sick-day: write, dup→409, mig 201 absent→503
// =============================================================================
await scenario("4 record-sick-day 7.6h → sick row base×(1+SG); dup→409; mig201 absent→503", async () => {
  const store = seedBase();
  const sb = makeSb(store, { uniques: RDO_UNIQUE });

  const res = await call("POST", "/api/workforce/record-sick-day",
    { body: { employeeId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01", date: "2025-09-18", hours: 7.6 } }, sb);
  assert.equal(res.statusCode, 200, `expected 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
  const row = store.workforce_employee_rdo_dates.find((r) => r.rdo_date === "2025-09-18");
  assert.equal(row.leave_type, "sick");
  assert.equal(row.hours, 7.6);

  const { rows } = await costWindow(sb, "2025-07-01", "2026-06-30");
  const s = rows.find((x) => x.leaveType === "sick" && x.fy === "2025-26" && x.quarter === 1);
  assert.ok(s, "sick cost row present");
  assert.equal(s.cost, round2(7.6 * sickRate), `sick cost = 7.6×${sickRate} = 340.48, got ${s.cost}`);
  assert.equal(s.cost, 340.48);

  // Duplicate same (employee,date) → 409
  const dup = await call("POST", "/api/workforce/record-sick-day",
    { body: { employeeId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01", date: "2025-09-18", hours: 7.6 } }, sb);
  assert.equal(dup.statusCode, 409, `duplicate expected 409, got ${dup.statusCode}: ${JSON.stringify(dup.body)}`);
  assert.equal(dup.body.code, "DUPLICATE");

  // mig 201 columns absent → 503 MIGRATION_PENDING
  const store2 = seedBase();
  const sbNoMig = makeSb(store2, { uniques: RDO_UNIQUE, missingColumns: { workforce_employee_rdo_dates: new Set(["leave_type", "hours"]) } });
  const noMig = await call("POST", "/api/workforce/record-sick-day",
    { body: { employeeId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01", date: "2025-09-19", hours: 7.6 } }, sbNoMig);
  assert.equal(noMig.statusCode, 503, `mig absent expected 503, got ${noMig.statusCode}: ${JSON.stringify(noMig.body)}`);
  assert.equal(noMig.body.code, "MIGRATION_PENDING");
  assert.equal(store2.workforce_employee_rdo_dates.length, 0, "no sick row written when mig 201 absent");
});

// =============================================================================
// SCENARIO 5 — no double count: PH∩leave excluded; half-day + worked = one paid day
// =============================================================================
await scenario("5 no double-count: leave∩PH excluded; half-day 4h + 4h worked = one paid day", async () => {
  const store = seedBase({ standardHours: 8 }); // 8h standard so half-day = 4h
  // (a) PH collision — approve annual on a date that is also a public holiday.
  store.workforce_public_holidays.push({ holiday_date: "2025-11-25" });
  store.workforce_day_off_requests.push({ id: "11111111-1111-4111-8111-11111111115a", employee_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01", date_from: "2025-11-25", date_to: "2025-11-25", status: "submitted", applied_rdo_ids: [], leave_type: null });
  // (b) half-day — approve annual 4h on 2025-10-06 (an 8h standard day).
  store.workforce_day_off_requests.push({ id: "11111111-1111-4111-8111-11111111115b", employee_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01", date_from: "2025-10-06", date_to: "2025-10-06", status: "submitted", applied_rdo_ids: [], leave_type: null });
  const sb = makeSb(store, { uniques: RDO_UNIQUE });

  const a = await call("POST", "/api/workforce/day-off-requests/:id/approve",
    { params: { id: "11111111-1111-4111-8111-11111111115a" }, body: { leaveType: "annual" } }, sb);
  assert.equal(a.statusCode, 200, JSON.stringify(a.body));
  const b = await call("POST", "/api/workforce/day-off-requests/:id/approve",
    { params: { id: "11111111-1111-4111-8111-11111111115b" }, body: { leaveType: "annual", hours: 4 } }, sb);
  assert.equal(b.statusCode, 200, JSON.stringify(b.body));

  // A genuine 4h Logistics WORKED entry on the same half-day date (a timesheet row, not a leave row).
  const tsId = "ts5";
  store.timesheets.push({ id: tsId, employee_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01", date: "2025-10-06", carpentry_job_id: INTERNAL_JOB, status: "approved" });
  store.timesheet_entries.push({ id: "e5", timesheet_id: tsId, employee_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01", task_category: "site_labouring", hours: 4, cost_amount: 200, internal_category_id: "cat_logistics" });

  const { days } = await costWindow(sb, "2025-07-01", "2026-06-30");
  // PH∩leave excluded — costed once (as a holiday), never as a leave day.
  assert.equal(days.find((d) => d.date === "2025-11-25"), undefined, "PH-collision leave day excluded from costed leave");
  // Half-day leave contributes exactly 4h (not the 8h standard day).
  const half = days.find((d) => d.date === "2025-10-06");
  assert.ok(half, "half-day leave day present");
  assert.equal(half.hours, 4, "leave side contributes 4h (half-day), not 8");
  // Leave + worked = one paid day (4 + 4 = 8) on that date.
  const worked = store.timesheet_entries.filter((e) => store.timesheets.find((t) => t.id === e.timesheet_id)?.date === "2025-10-06");
  const workedHours = worked.reduce((s, e) => s + e.hours, 0);
  assert.equal(half.hours + workedHours, 8, "half-day leave (4) + worked (4) = one 8h paid day");
  // No leave day is ever a timesheet row.
  const leaveDates = new Set(days.map((d) => d.date));
  for (const e of store.timesheet_entries) assert.ok(!("leave_type" in e), "timesheet_entries never carry a leave_type");
  // The only timesheet_entries on a leave date is the genuine worked one (leave itself wrote none).
  assert.equal(store.timesheet_entries.filter((e) => leaveDates.has(store.timesheets.find((t) => t.id === e.timesheet_id)?.date)).length, 1,
    "only the genuine worked entry sits on a leave date; leave wrote no timesheet rows");
});

// =============================================================================
// SCENARIO 6 — worker timesheet tag guard (POST /api/worker/timesheets)
// =============================================================================
await scenario("6 worker tag: leave-category id 400-rejects; worked id accepted + row tagged", async () => {
  // Reject: worker supplies a leave-source category id.
  {
    const store = seedBase();
    const sb = makeSb(store);
    const res = await call("POST", "/api/worker/timesheets",
      { caller: { id: "w1", role: "worker" }, workerEmployee: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01" },
        body: { date: "2025-09-01", carpentry_job_id: INTERNAL_JOB, internal_category_id: "cat_annual",
                entries: [{ task_category: "site_labouring", hours: 5 }] } }, sb);
    assert.equal(res.statusCode, 400, `leave-category tag expected 400, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    assert.match(res.body.error, /internal category/i);
    assert.equal(store.timesheet_entries.length, 0, "no entry written on rejection");
  }
  // Accept: worker supplies a valid worked (timesheet-source) category on the job.
  {
    const store = seedBase();
    const sb = makeSb(store);
    const res = await call("POST", "/api/worker/timesheets",
      { caller: { id: "w1", role: "worker" }, workerEmployee: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01" },
        body: { date: "2025-09-01", carpentry_job_id: INTERNAL_JOB, internal_category_id: "cat_logistics",
                entries: [{ task_category: "site_labouring", hours: 5 }] } }, sb);
    assert.equal(res.statusCode, 200, `worked-category tag expected 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    assert.equal(store.timesheet_entries.length, 1, "one entry written");
    assert.equal(store.timesheet_entries[0].internal_category_id, "cat_logistics", "entry carries the worked category tag");
  }
});

// =============================================================================
// SCENARIO 7 — retro-assign guard (POST /api/carpentry/jobs/:id/internal-assign)
// =============================================================================
await scenario("7 retro-assign: leave target 400; worked target ok", async () => {
  const store = seedBase();
  const tsId = "ts7";
  store.timesheets.push({ id: tsId, employee_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01", date: "2025-09-20", carpentry_job_id: INTERNAL_JOB, status: "approved" });
  store.timesheet_entries.push({ id: "e7", timesheet_id: tsId, employee_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01", task_category: "site_labouring", hours: 6, cost_amount: 300, internal_category_id: null });
  const sb = makeSb(store);

  const leave = await call("POST", "/api/carpentry/jobs/:id/internal-assign",
    { params: { id: INTERNAL_JOB }, body: { internalCategoryId: "cat_annual", entryIds: ["e7"] } }, sb);
  assert.equal(leave.statusCode, 400, `leave target expected 400, got ${leave.statusCode}: ${JSON.stringify(leave.body)}`);
  assert.equal(store.timesheet_entries[0].internal_category_id, null, "entry not tagged to a leave category");

  const worked = await call("POST", "/api/carpentry/jobs/:id/internal-assign",
    { params: { id: INTERNAL_JOB }, body: { internalCategoryId: "cat_logistics", entryIds: ["e7"] } }, sb);
  assert.equal(worked.statusCode, 200, `worked target expected 200, got ${worked.statusCode}: ${JSON.stringify(worked.body)}`);
  assert.equal(worked.body.assigned, 1, "one entry assigned");
  assert.equal(store.timesheet_entries[0].internal_category_id, "cat_logistics", "entry now tagged to the worked category");
});

// =============================================================================
// SCENARIO 8 — internal-cost-summary: BL-CHARGEUP byte-identical; BL-INTERNAL merged axis
// =============================================================================
await scenario("8 internal-cost-summary: BL-CHARGEUP shape unchanged; BL-INTERNAL gains categories", async () => {
  const store = seedBase();
  // BL-CHARGEUP worked entry
  store.timesheets.push({ id: "tsC1", employee_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01", date: "2025-09-12", carpentry_job_id: CHARGEUP_JOB, status: "approved" });
  store.timesheet_entries.push({ id: "eC1", timesheet_id: "tsC1", employee_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01", task_category: "site_labouring", hours: 6, cost_amount: 300, internal_category_id: null });
  // BL-INTERNAL worked entry tagged Logistics
  store.timesheets.push({ id: "tsI1", employee_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01", date: "2025-09-10", carpentry_job_id: INTERNAL_JOB, status: "approved" });
  store.timesheet_entries.push({ id: "eI1", timesheet_id: "tsI1", employee_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01", task_category: "site_labouring", hours: 10, cost_amount: 500, internal_category_id: "cat_logistics" });
  // BL-INTERNAL derived leave — an approved annual leave row 4h
  store.workforce_employee_rdo_dates.push({ id: "rd1", employee_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01", rdo_date: "2025-09-15", leave_type: "annual", hours: 4, note: "AL" });
  const sb = makeSb(store, { uniques: RDO_UNIQUE });

  const res = await call("GET", "/api/carpentry/internal-cost-summary",
    { query: { from: "2025-07-01", to: "2026-06-30" }, caller: { id: "admin1", role: "admin" } }, sb);
  assert.equal(res.statusCode, 200, `expected 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
  const jobs = res.body.jobs;
  const chargeup = jobs.find((j) => j.reference === "BL-CHARGEUP");
  const internal = jobs.find((j) => j.reference === "BL-INTERNAL");

  // BL-CHARGEUP: byte-identical pre-feature shape — exactly { reference, address, fyTotals, periods }.
  assert.deepEqual(Object.keys(chargeup).sort(), ["address", "fyTotals", "periods", "reference"],
    `BL-CHARGEUP element must keep the original 4-key shape; got ${Object.keys(chargeup).sort().join(",")}`);
  assert.equal(chargeup.fyTotals[0].cost, 300);
  assert.equal(chargeup.fyTotals[0].hours, 6);
  assert.equal(chargeup.periods[0].fy, "2025-26");
  assert.equal(chargeup.periods[0].quarter, 1);

  // BL-INTERNAL: same job-level totals PLUS the categories axis.
  assert.ok(internal.categories, "BL-INTERNAL gains a categories axis");
  assert.equal(internal.categoriesAvailable, true);
  assert.equal(internal.canViewCost, true);
  assert.equal(internal.fyTotals[0].cost, 500, "job-level worked total unchanged (Logistics 500)");

  const logistics = internal.categories.find((c) => c.internalCategoryId === "cat_logistics");
  assert.ok(logistics, "Logistics category present");
  assert.equal(logistics.cost, 500, "Logistics worked cost = 500");
  assert.equal(logistics.hours, 10);
  assert.equal(logistics.costSource, "timesheet");
  const lp = logistics.periods.find((p) => p.fy === "2025-26" && p.quarter === 1);
  assert.ok(lp, "Logistics has a 2025-26 Q1 period");
  assert.equal(lp.cost, 500);
  assert.equal(lp.estimated, false, "worked rows are booked, not estimated");

  const annual = internal.categories.find((c) => c.internalCategoryId === "cat_annual");
  assert.ok(annual, "Annual leave category present");
  assert.equal(annual.costSource, "leave");
  assert.equal(annual.cost, round2(4 * annualRate), `Annual derived leave cost = 4×${annualRate} = 210.56, got ${annual.cost}`);
  assert.equal(annual.cost, 210.56);
  const ap = annual.periods.find((p) => p.fy === "2025-26" && p.quarter === 1);
  assert.ok(ap, "Annual has a 2025-26 Q1 period");
  assert.equal(ap.estimated, true, "leave rows are modelled/estimated");
});

// =============================================================================
// SCENARIO 9 — approve over a PRE-EXISTING RDO date re-types it (money-bug fix)
// Regression guard for the low-severity bug the critic found: a 23505 conflict on
// UNIQUE(employee_id, rdo_date) must UPDATE the existing row to the approved
// leave_type/hours (not silently skip → leave the day mis-costed as its old value).
// =============================================================================
await scenario("9 approve annual over a pre-existing RDO date → row re-typed to annual (not skipped)", async () => {
  const store = seedBase();
  const emp = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01";
  const date = "2025-11-10"; // FY 2025-26 Q2, ordinary weekday (not a public holiday)
  // A row already exists for that date, wrongly typed 'rdo' (or a bare untyped RDO).
  store.workforce_employee_rdo_dates.push({ id: "pre_existing_rdo_1", employee_id: emp, rdo_date: date, leave_type: "rdo", note: "pattern RDO", created_by: "system" });
  const reqId = "11111111-1111-4111-8111-111111111109";
  store.workforce_day_off_requests.push({ id: reqId, employee_id: emp, date_from: date, date_to: date, status: "submitted", reason: "AL over an RDO", applied_rdo_ids: [], leave_type: null });
  const sb = makeSb(store, { uniques: RDO_UNIQUE });

  const res = await call("POST", "/api/workforce/day-off-requests/:id/approve",
    { params: { id: reqId }, body: { leaveType: "annual", hours: 8 } }, sb);
  assert.equal(res.statusCode, 200, `approve returned ${res.statusCode}: ${JSON.stringify(res.body)}`);

  // Still exactly one row for that date — the pre-existing one, now RE-TYPED (not a duplicate, not skipped).
  const rows = store.workforce_employee_rdo_dates.filter((r) => r.rdo_date === date && r.employee_id === emp);
  assert.equal(rows.length, 1, "no duplicate row — the existing one was updated in place");
  assert.equal(rows[0].leave_type, "annual", "existing row re-typed rdo→annual (bug fix: not silently skipped)");
  assert.equal(rows[0].hours, 8, "existing row hours updated to the approved 8");
  // The re-typed row id is recorded so a later reject still reverts this date.
  assert.ok((res.body.request.appliedRdoIds || []).includes("pre_existing_rdo_1"), "appliedRdoIds records the updated row for reject-reversal");

  // And it now costs as ANNUAL (base×1.175×(1+SG)), not the old RDO break-even bucket.
  const { rows: costRows } = await costWindow(sb, "2025-07-01", "2026-06-30");
  const a = costRows.find((r) => r.leaveType === "annual" && r.fy === "2025-26" && r.quarter === 2);
  assert.ok(a, "annual cost row present for Q2");
  assert.equal(a.cost, round2(8 * annualRate), `re-typed day costed as annual 8×${annualRate}=${round2(8 * annualRate)}, got ${a.cost}`);
  const rdoRow = costRows.find((r) => r.leaveType === "rdo" && r.fy === "2025-26" && r.quarter === 2);
  assert.ok(!rdoRow, "the date is NOT costed as rdo any more (no mis-costing)");
});

// =============================================================================
// Report
// =============================================================================
console.log("\n──────────────────────────────────────────────");
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} scenarios passed.`);
if (failed.length) {
  console.log("\nFAILURES:");
  for (const f of failed) console.log(`  ✗ ${f.name}\n    ${f.err.stack.split("\n").slice(0, 4).join("\n    ")}`);
}
if (bugs.length) { console.log("\nPRODUCT BUGS:"); for (const b of bugs) console.log("  - " + b); }
process.exit(failed.length ? 1 : 0);
