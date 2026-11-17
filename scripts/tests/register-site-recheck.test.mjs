/**
 * register-site-recheck.test.mjs — "Re-check" public mapping on The project and the Documents edit drawer
 * (POST /api/register/leads/:leadId/site/recheck, open to every staff member). The rule: a mapping service that is down
 * never wipes the stored council, zone, bushfire or slope values, and never says "Updated".
 *   - recheckUpdates: what a Re-check writes from the stored row and a look-only lookup;
 *   - runSiteRecheck: the route's work (stored values read first, the lookup look-only, skips and failures reported,
 *     failed lookups rate-limited too, per address: one corrected in Sales is tried at once), on a stand-in database;
 *   - enrichSite's opt-in look-only mode and per-layer status, with fetch stubbed (ArcGIS / Mapbox never called), and
 *     its default mode unchanged for the other callers.
 * No database, no network.
 *
 *   node scripts/tests/register-site-recheck.test.mjs
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Never let a transitive dotenv read the repo's .env (production credentials): import from an empty cwd.
process.chdir(mkdtempSync(join(tmpdir(), "register-site-recheck-")));
for (const k of ["SUPABASE_URL", "VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "MAPBOX_TOKEN", "REGISTER_ENABLED", "REGISTER_PILOT_LEADS"]) delete process.env[k];
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("network is off in this test"); };

const { recheckUpdates, runSiteRecheck, recheckFailureWords, recheckSkipWords, recheckWhere, RECHECK_RETRY_MS } = await import("../../server/lib/registerRoutes.mjs");
const { enrichSite, arcgisPointQuery, arcgisPointQueryResult } = await import("../../server/lib/siteEnrichmentService.mjs");
const { RECHECK_MIN_MS } = await import("../../server/lib/registerContext.mjs");

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 700)}` : ""}`); } };
const section = (t) => console.log(`\n${t}`);
const flat = (o) => JSON.stringify(o);

const NOW = Date.parse("2026-11-17T10:00:00Z");
const NOW_ISO = new Date(NOW).toISOString();
const DAYS_AGO = new Date(NOW - 2 * 86400000).toISOString();

/** A stand-in Supabase client: select/eq/maybeSingle/single and update/eq over in-memory rows; every update is recorded. */
function fakeDb(tables, { failWrite = false } = {}) {
  const writes = [];
  const sb = {
    writes,
    from(table) {
      const filters = {};
      let values = null;
      const find = () => (tables[table] || []).find((r) => Object.entries(filters).every(([k, v]) => r[k] === v)) || null;
      const api = {
        select() { return api; },
        eq(col, val) { filters[col] = val; return api; },
        maybeSingle: async () => ({ data: find() ? { ...find() } : null, error: null }),
        single: async () => (find() ? { data: { ...find() }, error: null } : { data: null, error: { message: "0 rows" } }),
        update(v) { values = v; return api; },
        then(resolve, reject) {
          if (values) {
            if (failWrite) return Promise.resolve({ error: { message: "column \"site_zone\" does not exist", code: "42703" } }).then(resolve, reject);
            writes.push({ table, id: filters.id, values });
            const row = find(); if (row) Object.assign(row, values);
            return Promise.resolve({ error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: find(), error: null }).then(resolve, reject);
        },
      };
      return api;
    },
  };
  return sb;
}

const GOOD = {
  site_council: "CITY OF MARION", site_zone: "Hills Neighbourhood", site_bushfire_prone: true, site_bushfire_detail: "Medium risk",
  site_slope_deg: 7.5, site_slope_band: "moderate", site_complexity: "high", site_enriched_at: DAYS_AGO,
  site_intel: { lga: { lga: "CITY OF MARION" }, bushfire: { name: "Medium risk" }, zone: { name: "Hills Neighbourhood" }, slope: { slopeDeg: 7.5, slopeBand: "moderate" } },
};
const leadRow = (extra = {}) => ({ id: "lead-1", job_id: null, geo_lat: -35.01, geo_lng: 138.55, site_address: "1 Test St", ...GOOD, ...extra });
const nulls = { site_council: null, site_bushfire_prone: null, site_bushfire_detail: "layer unverified — treat as unknown", site_zone: null, site_slope_deg: null, site_slope_band: null, site_complexity: "low", site_enriched_at: NOW_ISO, site_intel: { lga: null, bushfire: null, zone: null, slope: null } };
const DOWN = { ok: true, updates: nulls, layers: { council: "error", bushfire: "error", zone: "error", slope: "error" } };
const FRESH = {
  ok: true,
  updates: { site_council: "CITY OF HOLDFAST BAY", site_bushfire_prone: null, site_bushfire_detail: "layer unverified — treat as unknown", site_zone: "General Neighbourhood",
    site_slope_deg: 1.2, site_slope_band: "flat", site_complexity: "low", site_enriched_at: "2020-01-01T00:00:00Z",
    site_intel: { lga: { lga: "CITY OF HOLDFAST BAY" }, bushfire: null, zone: { name: "General Neighbourhood" }, slope: { slopeDeg: 1.2, slopeBand: "flat" } } },
  layers: { council: "ok", bushfire: "ok", zone: "ok", slope: "ok" },
};
const stub = (result) => { const calls = []; const fn = async (...a) => { calls.push(a); if (result instanceof Error) throw result; return typeof result === "function" ? result(...a) : result; }; fn.calls = calls; return fn; };

// ── 1 · recheckUpdates ────────────────────────────────────────────────────────────────────────────────
section("What a Re-check writes (recheckUpdates)");
ok("every layer errored → nothing written", flat(recheckUpdates(GOOD, DOWN, NOW_ISO)) === flat({ failed: true }));
ok("…also on a lead never looked up (nothing to keep, still not 'Updated')", recheckUpdates({}, DOWN, NOW_ISO).failed === true);
ok("ArcGIS down and Mapbox not set up → nothing written", recheckUpdates({}, { ...DOWN, layers: { council: "error", bushfire: "error", zone: "error", slope: "skipped" } }, NOW_ISO).failed === true);
ok("no lookup result → nothing written", recheckUpdates(GOOD, null, NOW_ISO).failed === true && recheckUpdates(GOOD, { ok: true }, NOW_ISO).failed === true);
const zoneDown = { ...FRESH, layers: { ...FRESH.layers, zone: "error" }, updates: { ...FRESH.updates, site_zone: null } };
ok("one layer errored while its value is stored → nothing written (the stored zone is never wiped)", recheckUpdates(GOOD, zoneDown, NOW_ISO).failed === true);
ok("slope errored while a slope is stored → nothing written", recheckUpdates(GOOD, { ...FRESH, layers: { ...FRESH.layers, slope: "error" } }, NOW_ISO).failed === true);
const partial = recheckUpdates({ ...GOOD, site_zone: null }, zoneDown, NOW_ISO);
ok("a layer that errored with nothing stored keeps nothing; the others are written", !partial.failed && partial.updates.site_zone === null && partial.updates.site_council === "CITY OF HOLDFAST BAY" && partial.updates.site_slope_band === "flat", flat(partial));
ok("…its site_intel entry is the stored one, not the failed lookup's", partial.updates.site_intel.zone === GOOD.site_intel.zone && partial.updates.site_intel.lga.lga === "CITY OF HOLDFAST BAY");
const all = recheckUpdates(GOOD, FRESH, NOW_ISO);
ok("every layer answered → the new values, stamped now", !all.failed && all.updates.site_council === "CITY OF HOLDFAST BAY" && all.updates.site_zone === "General Neighbourhood" && all.updates.site_enriched_at === NOW_ISO, flat(all));
ok("…a real 'nothing there' answer is written (bushfire not found is unknown, not kept)", all.updates.site_bushfire_prone === null);
const noToken = recheckUpdates(GOOD, { ...FRESH, layers: { ...FRESH.layers, slope: "skipped" }, updates: { ...FRESH.updates, site_slope_deg: null, site_slope_band: null, site_intel: { ...FRESH.updates.site_intel, slope: { slopeDeg: null, slopeBand: null } } } }, NOW_ISO);
ok("Mapbox not set up → the stored slope stays", !noToken.failed && noToken.updates.site_slope_deg === 7.5 && noToken.updates.site_slope_band === "moderate" && noToken.updates.site_intel.slope === GOOD.site_intel.slope, flat(noToken));
ok("…and complexity is worked out from what is kept (moderate slope + General Neighbourhood → medium)", noToken.updates.site_complexity === "medium", noToken.updates.site_complexity);
ok("complexity is worked out again, never the lookup's own figure", recheckUpdates(GOOD, { ...FRESH, updates: { ...FRESH.updates, site_complexity: "high" } }, NOW_ISO).updates.site_complexity === "low");

// ── 2 · runSiteRecheck ───────────────────────────────────────────────────────────────────────────────
section("Re-check with the mapping service down: nothing changes, and it says so");
{
  const db = fakeDb({ leads: [leadRow()] });
  const enrich = stub(DOWN);
  const out = await runSiteRecheck(db, "lead-1", { enrich, clock: () => NOW });
  ok("→ failed, never 'updated'", out.status === "failed" && out.reason === "layers_down", flat(out));
  ok("…nothing was written", db.writes.length === 0, flat(db.writes));
  const stored = (await db.from("leads").select("*").eq("id", "lead-1").maybeSingle()).data;
  ok("…the stored values are as they were", stored.site_council === "CITY OF MARION" && stored.site_zone === "Hills Neighbourhood" && stored.site_bushfire_prone === true && stored.site_enriched_at === DAYS_AGO);
  ok("…and the screen reads the plain line", recheckFailureWords(out.reason) === "Couldn't reach the mapping service. Nothing changed.");
  ok("the lookup ran look-only, on this database", enrich.calls.length === 1 && enrich.calls[0][0] === "leads" && enrich.calls[0][1] === "lead-1" && enrich.calls[0][2].write === false && enrich.calls[0][2].sb === db);
}
{
  const db = fakeDb({ leads: [leadRow()] });
  const out = await runSiteRecheck(db, "lead-1", { enrich: stub(zoneDown), clock: () => NOW });
  ok("one layer down with its value stored → failed, nothing written", out.status === "failed" && db.writes.length === 0);
}
{
  const db = fakeDb({ leads: [leadRow()] });
  const out = await runSiteRecheck(db, "lead-1", { enrich: stub({ ok: true, council: null }), clock: () => NOW });
  ok("a lookup that could not say how its layers went (an old enrichSite) → failed, nothing written", out.status === "failed" && db.writes.length === 0);
}
{
  const db = fakeDb({ leads: [leadRow()] });
  const running = new Set();
  const out = await runSiteRecheck(db, "lead-1", { running, enrich: stub(new Error("socket hang up")), clock: () => NOW });
  ok("a lookup that throws → failed, nothing written, the lead free for the next try", out.status === "failed" && out.reason === "lookup_failed" && db.writes.length === 0 && !running.has("lead-1"));
}
{
  const db = fakeDb({ leads: [leadRow()] }, { failWrite: true });
  const out = await runSiteRecheck(db, "lead-1", { enrich: stub(FRESH), clock: () => NOW });
  ok("a write that fails → failed, in plain words (never the database's)", out.status === "failed" && out.reason === "write_error" && !/column|42703/.test(recheckFailureWords(out.reason)) && /Nothing changed\.$/.test(recheckFailureWords(out.reason)));
}

section("Re-check that runs: the job once there is one, else the lead");
{
  const db = fakeDb({ leads: [leadRow()] });
  const out = await runSiteRecheck(db, "lead-1", { enrich: stub(FRESH), clock: () => NOW });
  ok("→ updated, one write to the lead", out.status === "updated" && db.writes.length === 1 && db.writes[0].table === "leads" && db.writes[0].id === "lead-1", flat(out));
  ok("…with the new values, stamped now", db.writes[0].values.site_council === "CITY OF HOLDFAST BAY" && db.writes[0].values.site_enriched_at === NOW_ISO);
}
{
  const db = fakeDb({ leads: [leadRow({ job_id: "job-1", site_enriched_at: NOW_ISO })], jobs: [{ id: "job-1", address: "1 Test St", geo_lat: -35.01, geo_lng: 138.55, ...GOOD }] });
  const enrich = stub(FRESH);
  const out = await runSiteRecheck(db, "lead-1", { enrich, clock: () => NOW });
  ok("after conversion the job is looked up and written, not the lead (the lead's own recent stamp doesn't block it)", out.status === "updated" && enrich.calls[0][0] === "jobs" && enrich.calls[0][1] === "job-1" && db.writes.every((w) => w.table === "jobs"));
}
{
  const db = fakeDb({ leads: [leadRow({ job_id: "job-1" })], jobs: [{ id: "job-1", ...GOOD }] });
  const out = await runSiteRecheck(db, "lead-1", { enrich: stub(DOWN), clock: () => NOW });
  ok("…and the job's good values survive the mapping service being down", out.status === "failed" && db.writes.length === 0);
}
{
  const out = await runSiteRecheck(fakeDb({ leads: [] }), "nope", { enrich: stub(FRESH), clock: () => NOW });
  ok("no such lead → not_found", out.status === "not_found");
}

section("Skips are reported, never 'Updated'");
{
  const db = fakeDb({ leads: [leadRow()] });
  const enrich = stub(FRESH);
  const out = await runSiteRecheck(db, "lead-1", { running: new Set(["lead-1"]), enrich, clock: () => NOW });
  ok("a lookup still running for this lead → skipped 'running', nothing run or written", out.status === "skipped" && out.reason === "running" && enrich.calls.length === 0 && db.writes.length === 0);
  ok("…in plain words", recheckSkipWords("running") === "Public mapping is already being checked for this project. Try again in a minute.");
}
{
  const db = fakeDb({ leads: [leadRow({ site_enriched_at: new Date(NOW - 5 * 60000).toISOString() })] });
  const enrich = stub(FRESH);
  const out = await runSiteRecheck(db, "lead-1", { enrich, clock: () => NOW });
  ok("looked up 5 minutes ago → skipped 'recent', nothing run or written", out.status === "skipped" && out.reason === "recent" && enrich.calls.length === 0 && db.writes.length === 0);
  ok("…in plain words", recheckSkipWords("recent") === "Checked less than 10 minutes ago, so it wasn't run again.");
  const later = await runSiteRecheck(db, "lead-1", { enrich, clock: () => NOW + RECHECK_MIN_MS });
  ok("…and runs once 10 minutes have passed", later.status === "updated" && enrich.calls.length === 1);
}
{
  // Two presses at once: the second sees the first still running.
  const db = fakeDb({ leads: [leadRow()] });
  const running = new Set();
  let release; const gate = new Promise((r) => { release = r; });
  const enrich = stub(async () => { await gate; return FRESH; });
  const first = runSiteRecheck(db, "lead-1", { running, enrich, clock: () => NOW });
  await new Promise((r) => setImmediate(r));
  const second = await runSiteRecheck(db, "lead-1", { running, enrich, clock: () => NOW });
  release();
  const firstOut = await first;
  ok("two presses at once: one lookup; the second is skipped 'running'", second.status === "skipped" && second.reason === "running" && firstOut.status === "updated" && enrich.calls.length === 1 && !running.has("lead-1"));
}

section("Failed lookups are rate-limited too (a minute per lead)");
{
  const db = fakeDb({ leads: [leadRow()] });
  const failedAt = new Map();
  const enrich = stub(DOWN);
  await runSiteRecheck(db, "lead-1", { failedAt, enrich, clock: () => NOW });
  const again = await runSiteRecheck(db, "lead-1", { failedAt, enrich, clock: () => NOW + 20000 });
  ok("a second press 20 s after a failure → not run again", again.status === "failed" && again.retrySoon === true && again.reason === "retry_soon" && enrich.calls.length === 1);
  ok("…in plain words, nothing changed", recheckFailureWords(again.reason) === "Couldn't reach the mapping service a moment ago. Try again in a minute. Nothing changed.");
  const other = await runSiteRecheck(fakeDb({ leads: [leadRow({ id: "lead-2" })] }), "lead-2", { failedAt, enrich, clock: () => NOW + 20000 });
  ok("…another lead is not held up", other.status === "failed" && !other.retrySoon && enrich.calls.length === 2);
  const after = await runSiteRecheck(db, "lead-1", { failedAt, enrich: stub(FRESH), clock: () => NOW + RECHECK_RETRY_MS });
  ok("…a minute later it runs, and a success clears the hold", after.status === "updated" && !failedAt.has("lead-1"));
}
{
  const db = fakeDb({ leads: [leadRow({ geo_lat: null, geo_lng: null, site_enriched_at: null })] });
  const failedAt = new Map();
  const enrich = stub({ ok: false, reason: "no_coords" });
  const first = await runSiteRecheck(db, "lead-1", { failedAt, enrich, clock: () => NOW });
  const again = await runSiteRecheck(db, "lead-1", { failedAt, enrich, clock: () => NOW + 1000 });
  ok("an address not on the map is not looked up again each press (the geocoder is not hammered)", first.reason === "no_coords" && again.retrySoon && enrich.calls.length === 1 && db.writes.length === 0);
  ok("…and keeps its own words", recheckFailureWords(again.reason) === "Couldn't find the site address on the map. Check the address in Sales. Nothing changed.");
}

section("The address corrected in Sales: Re-check runs at once (P1)");
{
  // The memo is per lead AND per address: the words ask for the address to be checked, so a corrected one is tried.
  const tables = { leads: [leadRow({ geo_lat: null, geo_lng: null, site_enriched_at: null, site_address: "1 Tset St", suburb: "Glenelg" })] };
  const db = fakeDb(tables);
  const failedAt = new Map();
  const enrich = stub(async () => (tables.leads[0].site_address === "1 Test St" ? FRESH : { ok: false, reason: "no_coords" }));
  const first = await runSiteRecheck(db, "lead-1", { failedAt, enrich, clock: () => NOW });
  ok("a typo in the address → not on the map", first.status === "failed" && first.reason === "no_coords" && enrich.calls.length === 1);
  tables.leads[0].site_address = "  1 TSET st ";
  const retyped = await runSiteRecheck(db, "lead-1", { failedAt, enrich, clock: () => NOW + 5000 });
  ok("the same address retyped (case, spaces) → still waits, the geocoder is not asked again", retyped.retrySoon === true && retyped.reason === "no_coords" && enrich.calls.length === 1);
  tables.leads[0].site_address = "1 Test St";
  const fixed = await runSiteRecheck(db, "lead-1", { failedAt, enrich, clock: () => NOW + 20000 });
  ok("the address corrected 20 s later → looked up at once (no 429, no 'Check the address' again)", fixed.status === "updated" && !fixed.retrySoon && enrich.calls.length === 2, flat(fixed));
  ok("…written, and the hold cleared", db.writes.length === 1 && !failedAt.has("lead-1"));
}
{
  const tables = { leads: [leadRow({ geo_lat: null, geo_lng: null, site_enriched_at: null, suburb: "Glenelg" })] };
  const db = fakeDb(tables);
  const failedAt = new Map();
  const enrich = stub({ ok: false, reason: "no_coords" });
  await runSiteRecheck(db, "lead-1", { failedAt, enrich, clock: () => NOW });
  tables.leads[0].suburb = "Glenelg North";
  const out = await runSiteRecheck(db, "lead-1", { failedAt, enrich, clock: () => NOW + 1000 });
  ok("the suburb corrected → tried again at once", enrich.calls.length === 2 && out.reason === "no_coords" && !out.retrySoon);
  const third = await runSiteRecheck(db, "lead-1", { failedAt, enrich, clock: () => NOW + 2000 });
  ok("…and that address in turn waits its minute", third.retrySoon === true && enrich.calls.length === 2);
}
{
  const tables = { leads: [leadRow({ job_id: "job-1" })], jobs: [{ id: "job-1", address: "9 Wrong Rd", geo_lat: null, geo_lng: null, ...GOOD, site_enriched_at: null }] };
  const db = fakeDb(tables);
  const failedAt = new Map();
  const enrich = stub({ ok: false, reason: "no_coords" });
  await runSiteRecheck(db, "lead-1", { failedAt, enrich, clock: () => NOW });
  tables.jobs[0].address = "9 Right Rd";
  await runSiteRecheck(db, "lead-1", { failedAt, enrich, clock: () => NOW + 1000 });
  ok("after conversion: the job's address corrected → tried again at once", enrich.calls.length === 2 && enrich.calls.every((c) => c[0] === "jobs"));
  tables.jobs[0].geo_lat = -35.01; tables.jobs[0].geo_lng = 138.55;
  await runSiteRecheck(db, "lead-1", { failedAt, enrich, clock: () => NOW + 2000 });
  ok("…and a map point set meanwhile → tried again at once", enrich.calls.length === 3);
}
{
  const db = fakeDb({ leads: [leadRow()] });
  const failedAt = new Map();
  const enrich = stub(DOWN);
  await runSiteRecheck(db, "lead-1", { failedAt, enrich, clock: () => NOW });
  const again = await runSiteRecheck(db, "lead-1", { failedAt, enrich, clock: () => NOW + 1000 });
  ok("the mapping service down, address unchanged → still waits its minute", again.retrySoon === true && again.reason === "retry_soon" && enrich.calls.length === 1);
}
ok("recheckWhere: the row, the lead's address and suburb, the job's address, the map point; case and spaces ignored",
  recheckWhere({ site_address: " 1 Test  St", suburb: "GLENELG" }, "leads", { id: "lead-1", geo_lat: null, geo_lng: null })
    === recheckWhere({ site_address: "1 test st", suburb: "glenelg " }, "leads", { id: "lead-1", geo_lat: null, geo_lng: null })
  && recheckWhere({ site_address: "1 Test St" }, "leads", { id: "lead-1" }) !== recheckWhere({ site_address: "2 Test St" }, "leads", { id: "lead-1" })
  && recheckWhere({ site_address: "1 Test St" }, "jobs", { id: "job-1", address: "1 Test St" }) !== recheckWhere({ site_address: "1 Test St" }, "jobs", { id: "job-1", address: "3 Test St" })
  && recheckWhere({}, "leads", { id: "lead-1", geo_lat: -35 }) !== recheckWhere({}, "leads", { id: "lead-1", geo_lat: null }));
ok("no failure or skip line carries a code or a system word", ["no_coords", "row_not_found", "retry_soon", "write_error", "layers_down", "lookup_failed", undefined].map(recheckFailureWords).concat(["running", "recent"].map(recheckSkipWords))
  .every((w) => /^[A-Z][^_]*\.$/.test(w) && !/\b(enrich|ArcGIS|Mapbox|site_|layer)\b/i.test(w)));

// ── 3 · enrichSite: look-only mode and per-layer status ─────────────────────────────────────────────
const arcgis = (handler) => { globalThis.fetch = async (url) => handler(String(url)); };
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

section("arcgisPointQueryResult: answered vs could not be reached");
arcgis(() => json({ features: [] }));
ok("no matching feature → answered, nothing there", flat(await arcgisPointQueryResult("https://x.test/q", -35, 138)) === flat({ attrs: null, error: false }));
arcgis(() => json({ features: [{ attributes: { lga: "CITY OF MARION" } }] }));
ok("a feature → its attributes", (await arcgisPointQueryResult("https://x.test/q", -35, 138)).attrs?.lga === "CITY OF MARION");
arcgis(() => json({ error: { code: 499 } }));
ok("an ArcGIS error body on HTTP 200 → could not be reached", (await arcgisPointQueryResult("https://x.test/q", -35, 138)).error === true);
arcgis(() => json({}, 503));
ok("HTTP 5xx (after its one retry) → could not be reached", (await arcgisPointQueryResult("https://x.test/q", -35, 138)).error === true);
arcgis(() => json({ nope: true }));
ok("an answer with no feature list → could not be reached", (await arcgisPointQueryResult("https://x.test/q", -35, 138)).error === true);
arcgis(() => { throw new Error("timeout"); });
ok("a timeout or network error → could not be reached", (await arcgisPointQueryResult("https://x.test/q", -35, 138)).error === true);
ok("arcgisPointQuery still answers attributes or null (other callers unchanged)", (await arcgisPointQuery("https://x.test/q", -35, 138)) === null);

section("enrichSite look-only (the Re-check): nothing written, each layer's status returned");
{
  arcgis(() => json({}, 503));
  const db = fakeDb({ leads: [leadRow()] });
  const r = await enrichSite("leads", "lead-1", { write: false, sb: db });
  ok("ArcGIS down, no Mapbox token → ok, every ArcGIS layer 'error', slope 'skipped'", r.ok && flat(r.layers) === flat({ council: "error", bushfire: "error", zone: "error", slope: "skipped" }), flat(r.layers));
  ok("…nothing written", db.writes.length === 0);
  ok("…and a Re-check on that result changes nothing", recheckUpdates(GOOD, r, NOW_ISO).failed === true);
}
{
  arcgis((url) => {
    if (url.includes("GrowthManagementData")) return json({ features: [{ attributes: { lga: "CITY OF HOLDFAST BAY" } }] });
    if (url.includes("Bushfire")) return json({ features: [] });
    if (url.includes("CodeAmendments")) return json({}, 500);
    return json({}, 500);
  });
  const db = fakeDb({ leads: [leadRow({ site_zone: null })] });
  const r = await enrichSite("leads", "lead-1", { write: false, sb: db });
  ok("council found, bushfire answered with nothing, zone down → ok / ok / error", r.layers.council === "ok" && r.layers.bushfire === "ok" && r.layers.zone === "error" && r.updates.site_council === "CITY OF HOLDFAST BAY", flat(r.layers));
  ok("…look-only writes nothing", db.writes.length === 0);
}
{
  process.env.MAPBOX_TOKEN = "test-token";
  arcgis((url) => {
    if (url.includes("api.mapbox.com")) return json({}, 500);
    return json({ features: [{ attributes: { lga: "CITY OF MARION", name: "Hills Neighbourhood" } }] });
  });
  const r = await enrichSite("leads", "lead-1", { write: false, sb: fakeDb({ leads: [leadRow()] }) });
  ok("Mapbox down → slope 'error' (so a stored slope is never wiped)", r.layers.slope === "error" && recheckUpdates(GOOD, r, NOW_ISO).failed === true, flat(r.layers));
  let n = 0;
  arcgis((url) => {
    if (url.includes("api.mapbox.com")) { n++; return json({ features: [{ properties: { layer: "contour", ele: 100 + n } }] }); }
    return json({ features: [{ attributes: { lga: "CITY OF MARION", name: "Hills Neighbourhood" } }] });
  });
  const r2 = await enrichSite("leads", "lead-1", { write: false, sb: fakeDb({ leads: [leadRow()] }) });
  ok("Mapbox answering → slope 'ok' with a figure", r2.layers.slope === "ok" && typeof r2.updates.site_slope_deg === "number", flat(r2.updates));
  delete process.env.MAPBOX_TOKEN;
}
{
  arcgis(() => json({}, 503));
  const db = fakeDb({ leads: [leadRow()] });
  const r = await enrichSite("leads", "lead-1", { sb: db });
  ok("the default mode is unchanged for its other callers: it writes the lookup (and carries no layer report)", r.ok && db.writes.length === 1 && !("layers" in r) && !("updates" in r));
}
{
  arcgis(() => json({}, 503));
  const db = fakeDb({ leads: [leadRow()] });
  const out = await runSiteRecheck(db, "lead-1", { clock: () => NOW });
  ok("end to end (real enrichSite, ArcGIS down): the stored values survive and the answer is a failure", out.status === "failed" && db.writes.length === 0
    && (await db.from("leads").select("*").eq("id", "lead-1").maybeSingle()).data.site_zone === "Hills Neighbourhood");
}

globalThis.fetch = realFetch;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
