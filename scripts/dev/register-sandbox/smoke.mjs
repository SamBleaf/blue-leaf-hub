#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// Blue Leaf Hub — LOCAL REGISTER SANDBOX — smoke test (DEV / TEST ONLY)
// Starts PostgREST + the gateway as child processes, exercises them with
// @supabase/supabase-js against http://localhost:54321, then stops them.
// Requires the sandbox Postgres to be running (sandbox.mjs start).
// Touches ONLY the sandbox: localhost:54321 / 127.0.0.1:54330 / the pg socket.
// ════════════════════════════════════════════════════════════════════════════
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import net from "node:net";
import { join } from "node:path";
import {
  HERE, LOG_DIR, RUN_DIR, PG_PORT, PGRST_PORT, GATEWAY_PORT, DB_NAME, DB_SUPERUSER, PG_BIN, POSTGREST_BIN, PGRST_CONF,
  CREDS_FILE, PUBLIC_URL, repoRequire, loadSecrets, readJson, scrubbedEnv
} from "./lib.mjs";

const { createClient } = repoRequire("@supabase/supabase-js");
const secrets = loadSecrets();
const creds = readJson(CREDS_FILE);
const URL_ = PUBLIC_URL;
const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

const results = [];
const record = (id, name, pass, detail) => {
  results.push({ id, name, pass, detail });
  console.log(`${pass === null ? "INFO" : pass ? "PASS" : "FAIL"}  ${id}  ${name}${detail ? `  — ${detail}` : ""}`);
};
async function check(id, name, fn) {
  try {
    const detail = await fn();
    record(id, name, true, detail);
  } catch (e) {
    record(id, name, false, e.message);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

function portOpen(port, host = "127.0.0.1") {
  return new Promise((res) => {
    const s = net.connect({ port, host });
    s.once("connect", () => { s.destroy(); res(true); });
    s.once("error", () => res(false));
    s.setTimeout(800, () => { s.destroy(); res(false); });
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function psql(sql) {
  const r = spawnSync(join(PG_BIN, "psql"), ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-h", RUN_DIR, "-p", String(PG_PORT), "-U", DB_SUPERUSER, "-d", DB_NAME, "-At", "-c", sql],
    { env: scrubbedEnv(), encoding: "utf8" });
  if (r.status !== 0) throw new Error(`psql: ${r.stderr}`);
  return r.stdout.trim();
}

// ── child processes ─────────────────────────────────────────────────────────
const children = [];
function startChild(name, cmd, args) {
  const logFile = join(LOG_DIR, `smoke-${name}.log`);
  const out = createWriteStream(logFile, { flags: "w" });
  const child = spawn(cmd, args, { env: scrubbedEnv(), stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  child.on("exit", (code, sig) => { child.exited = { code, sig }; });
  children.push({ name, child, logFile });
  return child;
}
async function stopChildren() {
  for (const { child } of children) if (!child.exited) child.kill("SIGTERM");
  for (const { child } of children) {
    for (let i = 0; i < 40 && !child.exited; i++) await sleep(100);
    if (!child.exited) child.kill("SIGKILL");
  }
}
async function waitFor(desc, fn, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (await fn()) return; } catch { /* retry */ }
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${desc}`);
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  psql("SELECT 1"); // pg must be up
  for (const port of [PGRST_PORT, GATEWAY_PORT]) {
    if (await portOpen(port)) throw new Error(`port ${port} is already in use — stop the running PostgREST/gateway first (the smoke test starts its own)`);
  }
  if (!existsSync(POSTGREST_BIN)) throw new Error(`postgrest not found at ${POSTGREST_BIN}`);
  startChild("postgrest", POSTGREST_BIN, [PGRST_CONF]);
  startChild("gateway", process.execPath, [join(HERE, "gateway.mjs")]);
  await waitFor("PostgREST schema cache", async () => (await fetch(`http://127.0.0.1:${PGRST_PORT}/`)).status === 200);
  await waitFor("gateway", async () => (await fetch(`${URL_}/health`)).ok);
  console.log(`children up: postgrest :${PGRST_PORT}, gateway ${URL_}\n`);

  const service = createClient(URL_, secrets.service_key, opts);
  const anon = createClient(URL_, secrets.anon_key, opts);

  // (a) REST via service role ────────────────────────────────────────────────
  await check("a1", "service: select leads (expect [])", async () => {
    const { data, error } = await service.from("leads").select("*").limit(5);
    if (error) throw new Error(JSON.stringify(error));
    assert(Array.isArray(data) && data.length === 0, `expected [], got ${data.length} row(s)`);
    return "[]";
  });
  let leadId;
  await check("a2", "service: insert lead + read back + delete", async () => {
    const ins = await service.from("leads").insert({ first_name: "Smoke", last_name: "Test", stage: "enquiry" }).select().single();
    if (ins.error) throw new Error(`insert: ${JSON.stringify(ins.error)}`);
    leadId = ins.data.id;
    const back = await service.from("leads").select("id, first_name, last_name, stage").eq("id", leadId).single();
    if (back.error) throw new Error(`read: ${JSON.stringify(back.error)}`);
    assert(back.data.first_name === "Smoke" && back.data.last_name === "Test" && back.data.stage === "enquiry", `readback mismatch ${JSON.stringify(back.data)}`);
    const del = await service.from("leads").delete().eq("id", leadId);
    if (del.error) throw new Error(`delete: ${JSON.stringify(del.error)}`);
    const gone = await service.from("leads").select("id").eq("id", leadId);
    assert(gone.data.length === 0, "lead still present after delete");
    return `id ${leadId} inserted, read back, deleted`;
  });
  await check("a3", "service: count=exact + Content-Range passthrough", async () => {
    const { count, error } = await service.from("user_profiles").select("*", { count: "exact", head: true });
    if (error) throw new Error(JSON.stringify(error));
    assert(count === 2, `expected 2 seeded profiles, got ${count}`);
    return `count=${count}`;
  });
  await check("a4", "pg-safeupdate emulation: unfiltered DELETE rejected", async () => {
    const { error } = await service.from("leads").delete();
    assert(error && error.code === "21000", `expected code 21000, got ${JSON.stringify(error)}`);
    return error.message;
  });

  // (b) RPC ───────────────────────────────────────────────────────────────────
  await check("b1", "rpc increment_send_stat (unknown id → no-op)", async () => {
    const { data, error } = await service.rpc("increment_send_stat", { p_resend_email_id: "smoke-does-not-exist", p_field: "delivered_count" });
    if (error) throw new Error(JSON.stringify(error));
    return `ok (data=${JSON.stringify(data)})`;
  });

  // (c) Storage ───────────────────────────────────────────────────────────────
  const bucket = service.storage.from("lead-documents");
  await check("c1", "storage: upload lead-documents/smoke/a.txt", async () => {
    await bucket.remove(["smoke/a.txt"]);
    const { data, error } = await bucket.upload("smoke/a.txt", Buffer.from("hello sandbox"), { contentType: "text/plain" });
    if (error) throw new Error(JSON.stringify(error));
    assert(data.path === "smoke/a.txt" && data.fullPath === "lead-documents/smoke/a.txt", JSON.stringify(data));
    return `path=${data.path} id=${data.id}`;
  });
  await check("c2", "storage: re-upload without upsert → error", async () => {
    const { data, error } = await bucket.upload("smoke/a.txt", Buffer.from("again"), { contentType: "text/plain" });
    assert(!data && error, "expected an error");
    assert(/already exists/i.test(error.message) && String(error.statusCode) === "409", `got ${JSON.stringify(error)}`);
    return `${error.status} statusCode=${error.statusCode} "${error.message}"`;
  });
  await check("c3", "storage: download", async () => {
    const { data, error } = await bucket.download("smoke/a.txt");
    if (error) throw new Error(JSON.stringify(error));
    const text = await data.text();
    assert(text === "hello sandbox", `got "${text}"`);
    return `"${text}" (${data.type})`;
  });
  await check("c4", "storage: createSignedUrl + plain HTTP fetch", async () => {
    const { data, error } = await bucket.createSignedUrl("smoke/a.txt", 60);
    if (error) throw new Error(JSON.stringify(error));
    const r = await fetch(data.signedUrl);
    const text = await r.text();
    assert(r.status === 200 && text === "hello sandbox", `HTTP ${r.status} "${text}"`);
    const tampered = await fetch(data.signedUrl.replace("smoke/a.txt", "smoke/b.txt"));
    assert(tampered.status === 400, `tampered path should be rejected, got ${tampered.status}`);
    return `HTTP 200 via ${data.signedUrl.replace(/token=.*/, "token=…")}; tampered path → 400`;
  });
  await check("c5", "storage: list + upsert + Blob(multipart) upload + remove", async () => {
    const up = await bucket.upload("smoke/a.txt", Buffer.from("v2"), { contentType: "text/plain", upsert: true });
    if (up.error) throw new Error(`upsert: ${JSON.stringify(up.error)}`);
    const blob = await bucket.upload("smoke/sub/b.json", new Blob([JSON.stringify({ ok: 1 })], { type: "application/json" }));
    if (blob.error) throw new Error(`blob upload: ${JSON.stringify(blob.error)}`);
    const dl = await bucket.download("smoke/sub/b.json");
    assert(dl.data?.type?.startsWith("application/json"), `multipart content-type not kept: ${dl.data?.type}`);
    const { data: items, error } = await bucket.list("smoke");
    if (error) throw new Error(`list: ${JSON.stringify(error)}`);
    const names = items.map((i) => i.name).sort().join(",");
    assert(names === "a.txt,sub", `list returned ${names}`);
    const rm = await bucket.remove(["smoke/a.txt", "smoke/sub/b.json"]);
    if (rm.error) throw new Error(`remove: ${JSON.stringify(rm.error)}`);
    assert(rm.data.length === 2, `removed ${rm.data.length}`);
    const after = await bucket.download("smoke/a.txt");
    assert(after.error, "download after remove should fail");
    return `list=[${names}], removed 2, download-after-remove → error`;
  });

  // (d) Auth ──────────────────────────────────────────────────────────────────
  let staffToken;
  await check("d1", "auth: signInWithPassword (staff) via anon client", async () => {
    const c = createClient(URL_, secrets.anon_key, opts);
    const { data, error } = await c.auth.signInWithPassword({ email: creds.staff.email, password: creds.staff.password });
    if (error) throw new Error(JSON.stringify(error));
    assert(data.session?.access_token && data.session.refresh_token, "no session");
    staffToken = data.session.access_token;
    const bad = await c.auth.signInWithPassword({ email: creds.staff.email, password: "wrong-password" });
    assert(bad.error && bad.error.code === "invalid_credentials", `bad password should fail with invalid_credentials, got ${JSON.stringify(bad.error)}`);
    const ref = await c.auth.refreshSession({ refresh_token: data.session.refresh_token });
    if (ref.error) throw new Error(`refresh: ${JSON.stringify(ref.error)}`);
    assert(ref.data.session.access_token, "refresh gave no token");
    return `session ok (expires_in ${data.session.expires_in}s), wrong password → ${bad.error.code}, refresh ok`;
  });
  await check("d2", "auth: service.auth.getUser(access_token) → staff id", async () => {
    const { data, error } = await service.auth.getUser(staffToken);
    if (error) throw new Error(JSON.stringify(error));
    assert(data.user.id === creds.staff.id, `got ${data.user.id}`);
    const bad = await service.auth.getUser(staffToken.slice(0, -4) + "AAAA");
    assert(bad.error && bad.error.status === 401, `tampered token should be 401, got ${JSON.stringify(bad.error)}`);
    return `user.id=${data.user.id}; tampered token → 401`;
  });
  await check("d3", "auth: admin createUser/listUsers/deleteUser", async () => {
    const email = `smoke.${Date.now()}@blueleaf.test`;
    const cr = await service.auth.admin.createUser({ email, password: "Smoke-Pass-123", email_confirm: true, user_metadata: { full_name: "Smoke" } });
    if (cr.error) throw new Error(`create: ${JSON.stringify(cr.error)}`);
    const dup = await service.auth.admin.createUser({ email, password: "Smoke-Pass-123", email_confirm: true });
    assert(dup.error?.code === "email_exists", `duplicate should be email_exists, got ${JSON.stringify(dup.error)}`);
    const ls = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
    assert(ls.data.users.some((u) => u.email === email), "created user not listed");
    const del = await service.auth.admin.deleteUser(cr.data.user.id);
    if (del.error) throw new Error(`delete: ${JSON.stringify(del.error)}`);
    const viaAnon = await anon.auth.admin.listUsers();
    assert(viaAnon.error, "anon key must not reach admin API");
    return `create → duplicate email_exists → listed (${ls.data.users.length}) → deleted; anon admin → ${viaAnon.error.status}`;
  });

  // (e) RLS isolation ─────────────────────────────────────────────────────────
  const ids = {};
  try {
    const job = await service.from("jobs").insert({ address: "BLH TEST smoke job (register sandbox)" }).select("id").single();
    if (job.error) throw new Error(`seed job: ${JSON.stringify(job.error)}`);
    ids.job = job.data.id;
    const proj = await service.from("projects").insert({ address: "BLH TEST smoke project (register sandbox)", job_id: ids.job }).select("id").single();
    if (proj.error) throw new Error(`seed project: ${JSON.stringify(proj.error)}`);
    ids.project = proj.data.id;
    const sel = await service.from("client_selections").insert({ project_id: ids.project, category: "Smoke", item_name: "Smoke selection" }).select("id").single();
    if (sel.error) throw new Error(`seed selection: ${JSON.stringify(sel.error)}`);
    ids.selection = sel.data.id;
    const link = await service.from("project_client_users").insert({ project_id: ids.project, user_id: creds.client.id }).select("id").single();
    if (link.error) throw new Error(`link client: ${JSON.stringify(link.error)}`);
    ids.link = link.data.id;
  } catch (e) {
    record("e0", "RLS fixtures (service role)", false, e.message);
  }
  if (ids.selection) {
    const clientSb = createClient(URL_, secrets.anon_key, opts);
    const staffSb = createClient(URL_, secrets.anon_key, opts);
    const cs = await clientSb.auth.signInWithPassword({ email: creds.client.email, password: creds.client.password });
    const ss = await staffSb.auth.signInWithPassword({ email: creds.staff.email, password: creds.staff.password });
    const describe = (r) => (r.error ? `error ${r.error.code}: ${r.error.message}` : `${r.data.length} row(s)`);
    await check("e1", "RLS: CLIENT JWT (linked to the project) cannot read jobs / client_selections / projects", async () => {
      if (cs.error) throw new Error(`client login: ${JSON.stringify(cs.error)}`);
      const j = await clientSb.from("jobs").select("id").eq("id", ids.job);
      const s = await clientSb.from("client_selections").select("id").eq("id", ids.selection);
      const p = await clientSb.from("projects").select("id").eq("id", ids.project);
      const all = await clientSb.from("jobs").select("id").limit(50);
      for (const [n, r] of [["jobs", j], ["client_selections", s], ["projects", p], ["jobs(all)", all]]) {
        assert(r.error || r.data.length === 0, `client can read ${n}: ${describe(r)}`);
      }
      return `jobs → ${describe(j)}; client_selections → ${describe(s)}; projects → ${describe(p)}`;
    });
    await check("e2", "RLS: CLIENT JWT can write nothing (insert job denied)", async () => {
      const w = await clientSb.from("jobs").insert({ address: "BLH TEST client write attempt" }).select("id");
      assert(w.error, `client insert succeeded: ${JSON.stringify(w.data)}`);
      return `error ${w.error.code}: ${w.error.message}`;
    });
    await check("e3", "RLS: CLIENT JWT reads only its OWN user_profiles row; auth_is_staff() = false", async () => {
      const up = await clientSb.from("user_profiles").select("id, role");
      if (up.error) throw new Error(JSON.stringify(up.error));
      assert(up.data.length === 1 && up.data[0].id === creds.client.id, `got ${JSON.stringify(up.data)}`);
      const r = await clientSb.rpc("auth_is_staff");
      assert(r.data === false, `auth_is_staff → ${JSON.stringify(r)}`);
      return `user_profiles → 1 row (self, role=${up.data[0].role}); auth_is_staff() → false`;
    });
    await check("e4", "RLS: STAFF JWT can read the same rows; auth_is_staff() = true", async () => {
      if (ss.error) throw new Error(`staff login: ${JSON.stringify(ss.error)}`);
      const j = await staffSb.from("jobs").select("id").eq("id", ids.job);
      const s = await staffSb.from("client_selections").select("id").eq("id", ids.selection);
      assert(!j.error && j.data.length === 1, `jobs → ${describe(j)}`);
      assert(!s.error && s.data.length === 1, `client_selections → ${describe(s)}`);
      const r = await staffSb.rpc("auth_is_staff");
      assert(r.data === true, `auth_is_staff → ${JSON.stringify(r)}`);
      return `jobs → 1 row; client_selections → 1 row; auth_is_staff() → true`;
    });
    await check("e5", "RLS: bare ANON key reads nothing", async () => {
      const j = await anon.from("jobs").select("id").eq("id", ids.job);
      assert(j.error || j.data.length === 0, `anon can read jobs: ${describe(j)}`);
      return `jobs → ${describe(j)}`;
    });
    await check("e6", "storage RLS: staff JWT may write lead-documents, client JWT may not", async () => {
      const st = await staffSb.storage.from("lead-documents").upload("smoke/staff.txt", Buffer.from("staff"), { contentType: "text/plain", upsert: true });
      if (st.error) throw new Error(`staff upload: ${JSON.stringify(st.error)}`);
      const cl = await clientSb.storage.from("lead-documents").upload("smoke/client.txt", Buffer.from("client"), { contentType: "text/plain" });
      assert(cl.error, "client upload succeeded");
      const cr = await clientSb.storage.from("lead-documents").download("smoke/staff.txt");
      assert(cr.error, "client download of staff object succeeded");
      await service.storage.from("lead-documents").remove(["smoke/staff.txt"]);
      return `staff upload ok; client upload → "${cl.error.message}"; client download → "${cr.error.message}"`;
    });
    // Informational sweep (does not fail the run): every public table read with the CLIENT JWT.
    // Tables are mostly empty in a fresh sandbox, so only tables with seed rows can show a leak.
    try {
      const tables = psql("SELECT string_agg(tablename, ',' ORDER BY tablename) FROM pg_tables WHERE schemaname = 'public'").split(",");
      const visible = [];
      for (const t of tables) {
        const r = await clientSb.from(t).select("*").limit(1);
        if (!r.error && r.data.length) visible.push(t);
      }
      const openPolicies = psql(`SELECT coalesce(string_agg(DISTINCT p.tablename, ',' ORDER BY p.tablename), '')
        FROM pg_policies p WHERE p.schemaname = 'public' AND p.permissive = 'PERMISSIVE' AND p.cmd IN ('SELECT','ALL')
         AND 'authenticated' = ANY(p.roles) AND p.qual IN ('true', '(auth.uid() IS NOT NULL)')
         AND NOT EXISTS (SELECT 1 FROM pg_policies r WHERE r.schemaname = 'public' AND r.tablename = p.tablename AND r.permissive = 'RESTRICTIVE')`);
      const others = visible.filter((t) => t !== "user_profiles");
      record("e7", "portal sweep: public tables a CLIENT JWT can read rows from", null,
        `${others.length ? `READABLE BY CLIENT: ${others.join(", ")}` : "none (besides own user_profiles row)"}; ` +
        `tables with an open authenticated policy and NO restrictive deny_clients: ${openPolicies || "none"}`);
    } catch (e) {
      record("e7", "portal sweep", null, `sweep skipped: ${e.message}`);
    }
  }
  if (ids.link) await service.from("project_client_users").delete().eq("id", ids.link);
  if (ids.selection) await service.from("client_selections").delete().eq("id", ids.selection);
  if (ids.project) await service.from("projects").delete().eq("id", ids.project);
  if (ids.job) await service.from("jobs").delete().eq("id", ids.job);

  // (f) NOTIFY pgrst reload ───────────────────────────────────────────────────
  await check("f1", "NOTIFY pgrst, 'reload schema' picks up new DDL", async () => {
    psql("DROP TABLE IF EXISTS public.zz_smoke_reload; NOTIFY pgrst, 'reload schema';");
    await sleep(800);
    // session_replication_role=replica disables the DDL-watch event trigger, so only the explicit NOTIFY can reload.
    psql("SET session_replication_role = replica; CREATE TABLE public.zz_smoke_reload (id int); INSERT INTO public.zz_smoke_reload VALUES (42);");
    await sleep(800);
    const before = await service.from("zz_smoke_reload").select("id");
    assert(before.error, `table visible before NOTIFY (cache already reloaded?): ${JSON.stringify(before.data)}`);
    psql("NOTIFY pgrst, 'reload schema';");
    let after;
    await waitFor("schema reload", async () => { after = await service.from("zz_smoke_reload").select("id"); return !after.error; }, 10000);
    assert(after.data[0]?.id === 42, JSON.stringify(after.data));
    psql("DROP TABLE public.zz_smoke_reload;"); // drop-watch event trigger NOTIFYs automatically
    return `before NOTIFY → ${before.error.code}; after NOTIFY → [{"id":42}]`;
  });

  // (g) gateway surface ───────────────────────────────────────────────────────
  await check("g1", "gateway: Kong-style apikey check + CORS preflight + realtime 404", async () => {
    const noKey = await fetch(`${URL_}/rest/v1/leads`);
    assert(noKey.status === 401, `no apikey → ${noKey.status}`);
    const pre = await fetch(`${URL_}/rest/v1/leads`, { method: "OPTIONS", headers: { Origin: "http://localhost:5174", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "apikey,authorization,x-client-info,content-type,prefer" } });
    assert(pre.status === 204 && pre.headers.get("access-control-allow-origin") === "*", `preflight ${pre.status}`);
    const one = await fetch(`${URL_}/rest/v1/leads?select=id&limit=1`, { headers: { apikey: secrets.anon_key, Origin: "http://localhost:5174" } });
    assert(one.headers.get("access-control-allow-origin") === "*", `ACAO on proxied response = ${one.headers.get("access-control-allow-origin")}`);
    const rt = await fetch(`${URL_}/realtime/v1/websocket`);
    assert(rt.status === 404, `realtime → ${rt.status}`);
    return "no apikey → 401; OPTIONS → 204 ACAO *; single ACAO on proxied response; /realtime/v1 → 404";
  });
}

let fatal = null;
try { await main(); } catch (e) { fatal = e; console.error(`FATAL: ${e.message}`); }
await stopChildren();
const failed = results.filter((r) => r.pass === false);
const info = results.filter((r) => r.pass === null).length;
console.log(`\n${results.length - failed.length - info}/${results.length - info} checks passed (+${info} info)${fatal ? " (aborted: " + fatal.message + ")" : ""}`);
console.log(`child logs: ${children.map((c) => c.logFile).join(", ")}`);
process.exit(fatal || failed.length ? 1 : 0);
