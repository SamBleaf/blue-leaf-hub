/**
 * crm-people-view-221.test.mjs — migration 221 (v_crm_people: a contact with no person's name goes by its firm).
 *
 * 1 · The SQL, parsed (always runs): the view is 131's definition word for word except the contacts half's name, whose
 *     COALESCE is first + last, then the firm, then the email; the same 15 columns in the same order; every column the
 *     app reads (CRM People screen, GET /api/crm/people filters, search and order) is still there; the view's options
 *     are read before the replace and set again after; nothing is dropped.
 * 2 · On a DISPOSABLE Postgres (initdb + pg_ctl in the OS temp dir, socket only, no TCP; skipped when initdb isn't on
 *     PATH): a firm-only contact is named by its firm and found by the name search; people, emails and leads read as
 *     before; security_invoker (186) and the grants are kept, and not added where 186 isn't applied; the column names and
 *     types are unchanged; it re-runs cleanly; without 131 or 180 it stops in plain words and changes nothing; the
 *     documented rollback works. The cluster is removed at the end. No Hub database is touched; nothing is applied
 *     anywhere else.
 *
 *   node scripts/tests/crm-people-view-221.test.mjs
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");
const SQL_221 = read("supabase/migrations/221_crm_people_firm_name.sql");
const SQL_131 = read("supabase/migrations/131_v_crm_people.sql");

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 700)}` : ""}`); } };
const section = (t) => console.log(`\n${t}`);
const flat = (o) => JSON.stringify(o);

// ── SQL helpers ─────────────────────────────────────────────────────────────────────────────────────
const stripComments = (sql) => sql.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");
const squash = (s) => s.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();
/** Split on commas at paren depth 0, outside quotes. */
function topLevelSplit(s) {
  const parts = []; let depth = 0, q = false, cur = "";
  for (const ch of s) {
    if (ch === "'") q = !q;
    if (!q && ch === "(") depth++;
    if (!q && ch === ")") depth--;
    if (!q && depth === 0 && ch === ",") { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map(squash);
}
/** The view's body: { halves: [{ items: [{ expr, alias }], from }] }. */
function parseView(sql) {
  const body0 = stripComments(sql);
  const m = body0.match(/CREATE OR REPLACE VIEW\s+(?:public\.)?v_crm_people\s+AS\s+([\s\S]*?);/i);
  if (!m) return null;
  const halves = m[1].split(/\bUNION ALL\b/i).map((h) => {
    const sel = h.match(/SELECT\s+([\s\S]*?)\s+FROM\s+([\s\S]*)$/i);
    const items = topLevelSplit(sel[1]).map((it) => { const a = it.match(/^([\s\S]*)\s+AS\s+(\w+)$/i); return { expr: squash(a[1]), alias: a[2] }; });
    return { items, from: squash(sel[2]) };
  });
  return { halves };
}
/** COALESCE(a, b, c) → [a, b, c]. */
const coalesceArgs = (expr) => { const m = expr.match(/^COALESCE\(([\s\S]*)\)$/i); return m ? topLevelSplit(m[1]) : null; };

// ── 1 · The SQL ─────────────────────────────────────────────────────────────────────────────────────
section("Migration 221, parsed: 131's view with the firm before the email");
const v131 = parseView(SQL_131), v221 = parseView(SQL_221);
ok("both views parse into a leads half and a contacts half", v131?.halves.length === 2 && v221?.halves.length === 2);
const [leads131, contacts131] = v131.halves, [leads221, contacts221] = v221.halves;
const FIRST_LAST = "NULLIF(TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), '')";
const nameOf = (half) => half.items.find((i) => i.alias === "name")?.expr || "";
const args221 = coalesceArgs(nameOf(contacts221));
ok("the contacts' name: first + last, then the firm, then the email (in that order)", flat(args221) === flat([FIRST_LAST, "NULLIF(TRIM(c.company), '')", "c.email"]), flat(args221));
ok("…131 had first + last, then the email (the firm is the only addition)", flat(coalesceArgs(nameOf(contacts131))) === flat([FIRST_LAST, "c.email"]));
ok("the leads half is 131's, word for word", flat(leads221) === flat(leads131));
ok("every other contacts column is 131's, word for word", flat(contacts221.items.filter((i) => i.alias !== "name")) === flat(contacts131.items.filter((i) => i.alias !== "name"))
  && contacts221.from === contacts131.from);
const cols = (half) => half.items.map((i) => i.alias);
const COLUMNS = ["person_id", "kind", "name", "type", "source", "suburb", "project_type", "budget", "fit", "readiness", "next_step", "due_date", "owner", "status", "last_contact"];
ok("the same 15 columns, in the same order, in both halves", flat(cols(leads221)) === flat(COLUMNS) && flat(cols(contacts221)) === flat(COLUMNS) && flat(cols(contacts131)) === flat(COLUMNS));

// Every column the app reads from the view: the CRM People screen (person.fooBar) and the route's filters, search, order.
const snake = (k) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const screen = read("src/components/crm/CrmPeople.jsx");
const screenCols = [...new Set([...screen.matchAll(/\bperson\.(\w+)/g)].map((m) => snake(m[1])))];
const crm = read("server/lib/crmRoutes.mjs");
const route = crm.slice(crm.indexOf('app.get("/api/crm/people"'), crm.indexOf('app.get("/api/crm/contacts"'));
const routeCols = [...new Set([
  ...[...route.matchAll(/\.(?:eq|in|lte|not|order)\("(\w+)"/g)].map((m) => m[1]),
  ...[...route.matchAll(/[`",](\w+)\.(?:eq|ilike)\./g)].map((m) => m[1]),
])];
ok("the screen and the route were read (the check isn't empty)", screenCols.length >= 14 && routeCols.includes("name") && routeCols.includes("suburb") && routeCols.includes("due_date"), flat({ screenCols, routeCols }));
const missing = [...screenCols, ...routeCols].filter((c) => !COLUMNS.includes(c));
ok("every column the app reads is in the view", missing.length === 0, `missing: ${missing.join(", ")}`);
ok("the route still reads the view (select *, name and suburb search)", /\.from\("v_crm_people"\)/.test(route) && /name\.ilike\./.test(route));

const body = stripComments(SQL_221);
const statements = body.replace(/ON COMMIT DROP/i, "");   // the options' temp table goes at COMMIT
ok("additive: no DROP, no data change", !/\bDROP\b/i.test(statements) && !/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(statements));
ok("one transaction, and PostgREST is told to reload", /^\s*BEGIN;/m.test(body) && /^\s*COMMIT;/m.test(body) && /NOTIFY pgrst, 'reload schema';/.test(body));
const optsAt = body.indexOf("_m221_view_options"), viewAt = body.indexOf("CREATE OR REPLACE VIEW"), setAt = body.indexOf("ALTER VIEW public.v_crm_people SET");
ok("the view's options are read before the replace and set again after (security_invoker is kept, never added)", optsAt > -1 && optsAt < viewAt && viewAt < setAt
  && /SELECT reloptions FROM pg_class WHERE oid = 'public\.v_crm_people'::regclass/.test(body) && !/security_invoker\s*=\s*on/i.test(body));
ok("it stops in plain words without 131 or 180, before changing anything", body.indexOf("Apply 131_v_crm_people.sql first") > -1 && body.indexOf("Apply 180_crm_contacts_designer_fees.sql first") > -1
  && body.indexOf("RAISE EXCEPTION") < optsAt);

// ── 2 · On a disposable Postgres ─────────────────────────────────────────────────────────────────────
const SCHEMA = `
  CREATE TABLE leads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, first_name text, last_name text, email text,
    lead_source_category text, lead_source text, suburb text, project_type text, estimated_value numeric,
    fit_quality text, readiness text, action_type text, next_action text, action_due_at timestamptz, next_action_date date,
    assigned_to text, stage text, last_activity_at timestamptz, updated_at timestamptz DEFAULT now(), archived boolean DEFAULT false
  );
  CREATE TABLE crm_contacts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), first_name text, last_name text, email text, %COMPANY%
    contact_type text, lead_source text, suburb text, project_type text, next_action_type text, next_action_due_date date,
    status text, last_contact_date date, updated_at timestamptz DEFAULT now(), is_archived boolean DEFAULT false
  );`;
const schema = ({ company = true } = {}) => SCHEMA.replace("%COMPANY%", company ? "company text," : "");

const hasPg = spawnSync("initdb", ["--version"], { stdio: "pipe" }).status === 0;
if (!hasPg) {
  console.log("\n  (skipped: no local Postgres on PATH — the SQL checks above still ran)");
} else {
  const { default: pg } = await import("pg");
  const dataDir = mkdtempSync(join(tmpdir(), "m221-pg-"));
  const PORT = "5447";
  const PG_ENV = { ...process.env, LC_ALL: "C", LANG: "C" };   // LC_ALL=C: macOS "postmaster became multithreaded"
  const pgctl = (args) => execFileSync("pg_ctl", ["-D", dataDir, ...args], { stdio: "pipe", env: PG_ENV });
  let started = false;
  const connect = async (database) => { const c = new pg.Client({ host: dataDir, port: PORT, user: "postgres", database }); await c.connect(); return c; };
  const rows = async (c, q, p) => (await c.query(q, p)).rows;
  const shape = (c) => rows(c, "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'v_crm_people' ORDER BY ordinal_position");
  const options = async (c) => (await rows(c, "SELECT reloptions FROM pg_class WHERE oid = 'public.v_crm_people'::regclass"))[0]?.reloptions ?? null;
  const nameFor = async (c, id) => (await rows(c, "SELECT name FROM public.v_crm_people WHERE person_id = $1", [id]))[0]?.name;
  const tryApply = async (c) => { try { await c.query(SQL_221); return null; } catch (e) { await c.query("ROLLBACK").catch(() => {}); return e; } };
  try {
    execFileSync("initdb", ["-D", dataDir, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--locale=C"], { stdio: "pipe", env: PG_ENV });
    const logFile = join(dataDir, "server.log");
    try { pgctl(["-l", logFile, "-o", `-p ${PORT} -k ${dataDir} -c listen_addresses=`, "-w", "start"]); }
    catch (e) { let log = ""; try { log = readFileSync(logFile, "utf8"); } catch { /* none */ } throw new Error(`pg_ctl start failed: ${e.message}\n${log}`); }
    started = true;
    const admin = await connect("postgres");
    await admin.query("CREATE ROLE anon; CREATE ROLE authenticated;");
    for (const db of ["m221_with186", "m221_no186", "m221_no131", "m221_no180"]) await admin.query(`CREATE DATABASE ${db}`);
    await admin.end();

    section("With 186 applied (security_invoker on, anon and authenticated revoked)");
    {
      const c = await connect("m221_with186");
      await c.query(schema());
      await c.query(SQL_131);
      await c.query("ALTER VIEW public.v_crm_people SET (security_invoker = on); REVOKE ALL ON public.v_crm_people FROM anon, authenticated;");
      const ids = Object.fromEntries((await rows(c, `INSERT INTO crm_contacts (first_name, last_name, email, company, contact_type, status, is_archived) VALUES
        ('', NULL, NULL, 'Studio X Architects', 'architect', 'active', false),
        ('', NULL, 'info@studiox.test', 'Studio Y Architects', 'architect', 'active', false),
        ('Ava', 'Arch', 'ava@arch.test', 'Arch Studio', 'architect', 'active', false),
        ('', NULL, 'only@mail.test', NULL, 'referrer', 'active', false),
        ('', NULL, 'blank@firm.test', '   ', 'referrer', 'active', false),
        ('', NULL, NULL, NULL, 'referrer', 'active', false),
        ('', NULL, NULL, 'Gone Studio', 'architect', 'active', true)
        RETURNING id, coalesce(company, email, 'none') AS k`)).map((r) => [r.k, r.id]));
      const lead = (await rows(c, "INSERT INTO leads (name, first_name, last_name, email, stage) VALUES (NULL, 'Bill', 'Client', 'bill@client.test', 'enquiry') RETURNING id"))[0].id;
      const before = await shape(c);
      ok("before 221: the firm-only contact has no name (the defect)", (await nameFor(c, ids["Studio X Architects"])) === null);
      const e = await tryApply(c);
      ok("221 applies", !e, e?.message);
      ok("a firm-only contact is named by its firm", (await nameFor(c, ids["Studio X Architects"])) === "Studio X Architects");
      ok("…the firm, not its email", (await nameFor(c, ids["Studio Y Architects"])) === "Studio Y Architects");
      ok("a person is named as before (not by their firm)", (await nameFor(c, ids["Arch Studio"])) === "Ava Arch");
      ok("no name and no firm → the email, as before (a blank firm doesn't count)", (await nameFor(c, ids["only@mail.test"])) === "only@mail.test" && (await nameFor(c, ids["   "])) === "blank@firm.test");
      ok("nothing at all → no name, as before", (await nameFor(c, ids.none)) === null);
      ok("an archived contact is still left out", (await rows(c, "SELECT 1 FROM public.v_crm_people WHERE person_id = $1", [ids["Gone Studio"]])).length === 0);
      ok("a lead reads as before", (await nameFor(c, lead)) === "Bill Client");
      const found = await rows(c, "SELECT name FROM public.v_crm_people WHERE name ILIKE '%studio x%' OR suburb ILIKE '%studio x%'");
      ok("the CRM People name search finds the practice", found.length === 1 && found[0].name === "Studio X Architects", flat(found));
      ok("the same column names and types, in the same order", flat(await shape(c)) === flat(before), flat(await shape(c)));
      ok("security_invoker is kept", flat(await options(c)) === flat(["security_invoker=on"]), flat(await options(c)));
      const priv = (await rows(c, "SELECT has_table_privilege('anon', 'public.v_crm_people', 'SELECT') AS a, has_table_privilege('authenticated', 'public.v_crm_people', 'SELECT') AS b"))[0];
      ok("…and anon and authenticated still can't read it", priv.a === false && priv.b === false, flat(priv));
      const again = await tryApply(c);
      ok("re-running 221 is clean and changes nothing more", !again && flat(await options(c)) === flat(["security_invoker=on"]) && (await nameFor(c, ids["Studio X Architects"])) === "Studio X Architects", again?.message);
      ok("no temp table is left behind", (await rows(c, "SELECT 1 FROM pg_class WHERE relname = '_m221_view_options'")).length === 0);
      // The documented rollback: 131's view again, then 186's option.
      await c.query(SQL_131);
      ok("(why 221 sets the options again: a plain CREATE OR REPLACE VIEW clears security_invoker)", (await options(c)) === null, flat(await options(c)));
      await c.query("ALTER VIEW public.v_crm_people SET (security_invoker = on);");
      ok("the rollback in the header restores 131's view and 186's option", (await nameFor(c, ids["Studio X Architects"])) === null && flat(await options(c)) === flat(["security_invoker=on"]));
      await c.end();
    }

    section("Without 186 (no options): 221 adds none, and keeps the grants");
    {
      const c = await connect("m221_no186");
      await c.query(schema());
      await c.query(SQL_131);
      await c.query("GRANT SELECT ON public.v_crm_people TO authenticated;");
      const e = await tryApply(c);
      ok("221 applies", !e, e?.message);
      ok("no options before, none after (186 is neither applied nor undone)", (await options(c)) === null, flat(await options(c)));
      ok("a grant made before is still there", (await rows(c, "SELECT has_table_privilege('authenticated', 'public.v_crm_people', 'SELECT') AS g"))[0].g === true);
      await c.end();
    }

    section("Missing 131 or 180: stops in plain words, nothing changed");
    {
      const c = await connect("m221_no131");
      await c.query(schema());
      const e = await tryApply(c);
      ok("no view → stops, naming 131", /Apply 131_v_crm_people\.sql first\. Nothing was changed\./.test(e?.message || ""), e?.message);
      ok("…and no view was made", (await rows(c, "SELECT to_regclass('public.v_crm_people') AS v"))[0].v === null);
      await c.end();
    }
    {
      const c = await connect("m221_no180");
      await c.query(schema({ company: false }));
      await c.query(SQL_131);
      const before = (await rows(c, "SELECT pg_get_viewdef('public.v_crm_people'::regclass) AS d"))[0].d;
      const e = await tryApply(c);
      ok("no crm_contacts.company → stops, naming 180", /Apply 180_crm_contacts_designer_fees\.sql first\. Nothing was changed\./.test(e?.message || ""), e?.message);
      ok("…and 131's view is as it was", (await rows(c, "SELECT pg_get_viewdef('public.v_crm_people'::regclass) AS d"))[0].d === before);
      await c.end();
    }
  } catch (e) {
    ok("the disposable Postgres ran", false, e?.stack || e);
  } finally {
    if (started) { try { pgctl(["-m", "immediate", "-w", "stop"]); } catch { /* already stopped */ } }
    try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* gone */ }
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
