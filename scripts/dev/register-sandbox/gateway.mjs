#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// Blue Leaf Hub — LOCAL REGISTER SANDBOX — Supabase-compatible HTTP gateway
// DEV / TEST ONLY.  http://localhost:54321
// ════════════════════════════════════════════════════════════════════════════
//   /rest/v1/*     → reverse proxy to PostgREST 127.0.0.1:54330 (Kong-style apikey check,
//                    apikey → Authorization when no Authorization, pg-safeupdate emulation)
//   /auth/v1/*     → GoTrue subset backed by auth.users in the sandbox DB (HS256 JWTs)
//   /storage/v1/*  → storage-api subset; bytes on disk under ~/.blh-register-sandbox/storage,
//                    rows in storage.objects so the migrations' storage RLS policies apply
//   /realtime/v1, /functions/v1, /graphql/v1 → 404
// Talks ONLY to the sandbox Postgres (unix socket) and the local PostgREST. Sends no mail.
// ════════════════════════════════════════════════════════════════════════════
import http from "node:http";
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  RUN_DIR, PG_PORT, PGRST_PORT, GATEWAY_PORT, DB_NAME, DB_SUPERUSER, STORAGE_DIR, PUBLIC_URL,
  repoRequire, loadSecrets
} from "./lib.mjs";

const jwt = repoRequire("jsonwebtoken");
const pg = repoRequire("pg");

const secrets = loadSecrets();
const SECRET = secrets.jwt_secret;
const API_KEYS = new Set([secrets.anon_key, secrets.service_key]);
const SITE_URL = process.env.BLH_SANDBOX_SITE_URL || "http://localhost:5184"; // sandbox.mjs vite
const ACCESS_TTL = 3600;
const MAX_UPLOAD = 50 * 1024 * 1024; // Supabase default global file size limit
const MAX_JSON = 2 * 1024 * 1024;
const API_VERSION = "2024-01-01";

const pool = new pg.Pool({ host: RUN_DIR, port: PG_PORT, user: DB_SUPERUSER, database: DB_NAME, max: 10 });
pool.on("error", (e) => console.error("[gateway] pg pool error:", e.message));
const pgrstAgent = new http.Agent({ keepAlive: true, maxSockets: 64 });

const EXPOSE = "Content-Range, Content-Location, Location, Preference-Applied, Range-Unit, X-Total-Count, Link, " +
  "X-Supabase-Api-Version, Content-Disposition, Content-Length, Content-Type, ETag, Last-Modified, Accept-Ranges";

// ── small helpers ───────────────────────────────────────────────────────────
const q = (sql, params) => pool.query(sql, params);
const iso = (d) => (d ? new Date(d).toISOString() : null);

function send(res, status, body, headers = {}) {
  const buf = body === undefined || body === null ? null : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  res.writeHead(status, {
    ...(buf ? { "Content-Type": "application/json; charset=utf-8", "Content-Length": buf.length } : {}),
    ...headers
  });
  res.end(buf ?? undefined);
}
const json = (res, status, body, headers) => send(res, status, body, headers);

function bearer(req) {
  const m = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function verifyJwt(token) {
  try { return { claims: jwt.verify(token, SECRET, { algorithms: ["HS256"] }) }; }
  catch (e) { return { error: e }; }
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    let tooLarge = false;
    req.on("data", (c) => { n += c.length; if (n > limit) tooLarge = true; else chunks.push(c); });
    req.on("end", () => (tooLarge ? reject(Object.assign(new Error("payload too large"), { code: "TOO_LARGE" })) : resolve(Buffer.concat(chunks))));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req, MAX_JSON);
  if (!buf.length) return {};
  const ct = String(req.headers["content-type"] || "");
  if (ct.includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(buf.toString("utf8")));
  try { return JSON.parse(buf.toString("utf8")); } catch { return {}; }
}

function redactUrl(u) {
  return u.replace(/([?&](?:token|apikey|access_token|refresh_token)=)[^&]+/gi, "$1[redacted]");
}

function roleForLog(req, url) {
  const t = bearer(req) || req.headers.apikey || url.searchParams.get("apikey");
  if (!t) return "-";
  try { return jwt.decode(String(t))?.role || "?"; } catch { return "?"; }
}

/** Kong key-auth emulation: Supabase rejects requests without a valid project apikey. */
function apiKeyProblem(req, url) {
  const key = req.headers.apikey || url.searchParams.get("apikey");
  if (!key) return { message: "No API key found in request", hint: "No `apikey` request header or url param was found." };
  if (!API_KEYS.has(String(key))) return { message: "Invalid API key", hint: "Double check your Supabase `anon` or `service_role` API key." };
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// /rest/v1 → PostgREST
// ════════════════════════════════════════════════════════════════════════════
const NON_FILTER_PARAMS = new Set(["select", "columns", "order", "limit", "offset", "on_conflict", "apikey"]);

function restProxy(req, res, url) {
  const problem = apiKeyProblem(req, url);
  if (problem) return json(res, 401, problem);
  const upstreamPath = url.pathname.slice("/rest/v1".length) || "/";

  // Supabase loads pg-safeupdate for the API roles: UPDATE/DELETE without a WHERE clause fail.
  if ((req.method === "PATCH" || req.method === "DELETE") && !upstreamPath.startsWith("/rpc/") && upstreamPath !== "/") {
    const filters = [...url.searchParams.keys()].filter((k) => !NON_FILTER_PARAMS.has(k));
    if (!filters.length) {
      req.resume();
      return json(res, 400, { code: "21000", details: null, hint: null, message: `${req.method === "DELETE" ? "DELETE" : "UPDATE"} requires a WHERE clause` });
    }
  }

  const headers = { ...req.headers };
  for (const h of ["host", "connection", "keep-alive", "proxy-connection", "upgrade"]) delete headers[h];
  const apikey = headers.apikey || url.searchParams.get("apikey");
  if (!headers.authorization && apikey) headers.authorization = `Bearer ${apikey}`;
  delete headers.apikey; // Kong hide_credentials
  let search = url.search;
  if (url.searchParams.has("apikey")) {
    const sp = new URLSearchParams(url.search);
    sp.delete("apikey");
    search = sp.toString() ? `?${sp}` : "";
  }

  const up = http.request({ host: "127.0.0.1", port: PGRST_PORT, method: req.method, path: upstreamPath + search, headers, agent: pgrstAgent }, (ur) => {
    const out = {};
    for (const [k, v] of Object.entries(ur.headers)) {
      if (/^access-control-/i.test(k) || ["connection", "keep-alive", "transfer-encoding"].includes(k)) continue;
      out[k] = v;
    }
    res.writeHead(ur.statusCode, out);
    ur.pipe(res);
  });
  up.on("error", (e) => {
    if (!res.headersSent) json(res, 502, { message: `PostgREST unreachable on 127.0.0.1:${PGRST_PORT} — start it: node scripts/dev/register-sandbox/sandbox.mjs postgrest`, error: e.code || e.message });
    else res.destroy();
  });
  req.pipe(up);
}

// ════════════════════════════════════════════════════════════════════════════
// /auth/v1 → GoTrue emulation
// ════════════════════════════════════════════════════════════════════════════
function authErr(res, status, code, msg, extra = {}) {
  return json(res, status, { code, error_code: code, msg, message: msg, ...extra }, { "X-Supabase-Api-Version": API_VERSION });
}
function authOk(res, status, body, headers = {}) {
  return json(res, status, body, { "X-Supabase-Api-Version": API_VERSION, ...headers });
}

const USER_COLS = "id, aud, role, email, phone, email_confirmed_at, phone_confirmed_at, confirmed_at, invited_at, confirmation_sent_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, banned_until, deleted_at, is_anonymous";

function userJson(u) {
  const app = { provider: "email", providers: ["email"], ...(u.raw_app_meta_data || {}) };
  const out = {
    id: u.id,
    aud: u.aud || "authenticated",
    role: u.role || "authenticated",
    email: u.email || "",
    email_confirmed_at: iso(u.email_confirmed_at),
    phone: u.phone || "",
    confirmed_at: iso(u.confirmed_at),
    last_sign_in_at: iso(u.last_sign_in_at),
    app_metadata: app,
    user_metadata: u.raw_user_meta_data || {},
    identities: u.email ? [{
      identity_id: u.id, id: u.id, user_id: u.id,
      identity_data: { email: u.email, email_verified: !!u.email_confirmed_at, phone_verified: false, sub: u.id },
      provider: "email", last_sign_in_at: iso(u.last_sign_in_at), created_at: iso(u.created_at), updated_at: iso(u.updated_at), email: u.email
    }] : [],
    created_at: iso(u.created_at),
    updated_at: iso(u.updated_at),
    is_anonymous: !!u.is_anonymous
  };
  if (u.invited_at) out.invited_at = iso(u.invited_at);
  if (u.confirmation_sent_at) out.confirmation_sent_at = iso(u.confirmation_sent_at);
  if (u.recovery_sent_at) out.recovery_sent_at = iso(u.recovery_sent_at);
  if (u.banned_until) out.banned_until = iso(u.banned_until);
  if (u.deleted_at) out.deleted_at = iso(u.deleted_at);
  return out;
}

async function getUserById(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
  const { rows } = await q(`SELECT ${USER_COLS} FROM auth.users WHERE id = $1 AND deleted_at IS NULL`, [id]);
  return rows[0] || null;
}
async function getUserByEmail(email) {
  const { rows } = await q(`SELECT ${USER_COLS} FROM auth.users WHERE email = lower($1) AND deleted_at IS NULL`, [String(email || "").trim()]);
  return rows[0] || null;
}

function accessToken(u, sessionId, method) {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ACCESS_TTL;
  const token = jwt.sign({
    aud: "authenticated", exp, iat, iss: `${PUBLIC_URL}/auth/v1`, sub: u.id, email: u.email || "", phone: u.phone || "",
    app_metadata: { provider: "email", providers: ["email"], ...(u.raw_app_meta_data || {}) },
    user_metadata: u.raw_user_meta_data || {},
    role: u.role || "authenticated", aal: "aal1", amr: [{ method, timestamp: iat }], session_id: sessionId, is_anonymous: !!u.is_anonymous
  }, SECRET, { algorithm: "HS256", noTimestamp: true });
  return { token, exp };
}

async function newRefreshToken(userId, sessionId, parent = null) {
  const token = randomBytes(24).toString("base64url");
  await q("INSERT INTO auth.refresh_tokens (token, user_id, session_id, parent) VALUES ($1, $2, $3, $4)", [token, userId, sessionId, parent]);
  return token;
}

async function issueSession(u, method = "password") {
  const sessionId = randomUUID();
  await q("INSERT INTO auth.sessions (id, user_id) VALUES ($1, $2)", [sessionId, u.id]);
  await q("UPDATE auth.users SET last_sign_in_at = now(), updated_at = now() WHERE id = $1", [u.id]);
  const fresh = await getUserById(u.id);
  const refresh = await newRefreshToken(u.id, sessionId);
  return sessionJson(fresh, sessionId, refresh, method);
}

function sessionJson(u, sessionId, refresh, method) {
  const { token, exp } = accessToken(u, sessionId, method);
  return { access_token: token, token_type: "bearer", expires_in: ACCESS_TTL, expires_at: exp, refresh_token: refresh, user: userJson(u) };
}

/** Bearer JWT → { claims, user } or sends the GoTrue-style error and returns null. */
async function requireUser(req, res) {
  const tok = bearer(req);
  if (!tok) { authErr(res, 401, "no_authorization", "This endpoint requires a Bearer token"); return null; }
  const { claims, error } = verifyJwt(tok);
  if (error) { authErr(res, 401, "bad_jwt", `invalid JWT: unable to parse or verify signature, ${error.message}`); return null; }
  if (!claims.sub) { authErr(res, 401, "bad_jwt", "invalid claim: missing sub claim"); return null; }
  if (claims.session_id) {
    const { rowCount } = await q("SELECT 1 FROM auth.sessions WHERE id = $1", [claims.session_id]);
    if (!rowCount) { authErr(res, 403, "session_not_found", "Session from session_id claim in JWT does not exist"); return null; }
  }
  const user = await getUserById(claims.sub);
  if (!user) { authErr(res, 403, "user_not_found", "User from sub claim in JWT does not exist"); return null; }
  return { claims, user };
}

function requireServiceRole(req, res) {
  const tok = bearer(req) || req.headers.apikey;
  const { claims } = tok ? verifyJwt(String(tok)) : {};
  if (!claims || claims.role !== "service_role") { authErr(res, 403, "not_admin", "User not allowed"); return false; }
  return true;
}

function parseBanDuration(v) {
  if (v === undefined) return undefined;
  if (v === null || v === "none" || v === "") return null;
  const m = String(v).match(/^(\d+(?:\.\d+)?)(h|m|s|ms)$/);
  if (!m) return "invalid";
  const mult = { h: 3600e3, m: 60e3, s: 1e3, ms: 1 }[m[2]];
  return new Date(Date.now() + Number(m[1]) * mult).toISOString();
}

function weakPassword(res, pw) {
  if (pw !== undefined && pw !== null && String(pw).length < 6) {
    authErr(res, 422, "weak_password", "Password should be at least 6 characters.", { weak_password: { reasons: ["length"] } });
    return true;
  }
  return false;
}

function safeRedirect(r) {
  try {
    const u = new URL(String(r || SITE_URL));
    if (["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) && /^https?:$/.test(u.protocol)) return u.toString();
  } catch { /* fall through */ }
  return SITE_URL;
}

async function createUser({ email, password, emailConfirm, userMeta, appMeta, invited = false, phone = null, role = "authenticated", id = null }) {
  const { rows } = await q(
    `INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, invited_at,
                             raw_app_meta_data, raw_user_meta_data, phone, created_at, updated_at, is_sso_user, is_anonymous)
     VALUES ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', $2, lower($3),
             CASE WHEN $4::text IS NULL THEN '' ELSE extensions.crypt($4::text, extensions.gen_salt('bf', 10)) END,
             CASE WHEN $5 THEN now() END, CASE WHEN $6 THEN now() END,
             $7::jsonb, $8::jsonb, $9, now(), now(), false, false)
     RETURNING id`,
    [id || randomUUID(), role, email, password ?? null, !!emailConfirm, !!invited,
      JSON.stringify({ provider: "email", providers: ["email"], ...(appMeta || {}) }), JSON.stringify(userMeta || {}), phone || null]
  );
  return getUserById(rows[0].id);
}

async function authRoutes(req, res, url) {
  const p = url.pathname.slice("/auth/v1".length) || "/";
  const open = (req.method === "GET" && ["/verify", "/callback", "/authorize", "/health"].includes(p));
  if (!open) {
    const problem = apiKeyProblem(req, url);
    if (problem) { req.resume(); return json(res, 401, problem); }
  }

  // ── health / settings ──
  if (p === "/health" && req.method === "GET") return authOk(res, 200, { version: "blh-register-sandbox", name: "GoTrue", description: "Local GoTrue emulator (Blue Leaf register sandbox)" });
  if (p === "/settings" && req.method === "GET") {
    return authOk(res, 200, { external: { email: true, phone: false, anonymous_users: false }, disable_signup: true, mailer_autoconfirm: false, phone_autoconfirm: false, sms_provider: "", saml_enabled: false });
  }

  // ── token ──
  if (p === "/token" && req.method === "POST") {
    const grant = url.searchParams.get("grant_type");
    const body = await readJson(req);
    if (grant === "password") {
      if (!body.email || !body.password) return authErr(res, 400, "validation_failed", "missing email or phone");
      const { rows } = await q(
        `SELECT id, (encrypted_password <> '' AND encrypted_password = extensions.crypt($2, encrypted_password)) AS ok,
                email_confirmed_at, banned_until
           FROM auth.users WHERE email = lower($1) AND deleted_at IS NULL`, [String(body.email).trim(), String(body.password)]);
      const row = rows[0];
      if (!row || !row.ok) return authErr(res, 400, "invalid_credentials", "Invalid login credentials");
      if (!row.email_confirmed_at) return authErr(res, 400, "email_not_confirmed", "Email not confirmed");
      if (row.banned_until && new Date(row.banned_until) > new Date()) return authErr(res, 400, "user_banned", "User is banned");
      return authOk(res, 200, await issueSession(await getUserById(row.id), "password"));
    }
    if (grant === "refresh_token") {
      if (!body.refresh_token) return authErr(res, 400, "validation_failed", "Refresh Token is required");
      const { rows } = await q(
        `SELECT id, token, user_id, session_id, revoked, (updated_at > now() - interval '10 seconds') AS within_reuse
           FROM auth.refresh_tokens WHERE token = $1`, [String(body.refresh_token)]);
      const rt = rows[0];
      if (!rt) return authErr(res, 400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found");
      if (rt.revoked && !rt.within_reuse) return authErr(res, 400, "refresh_token_already_used", "Invalid Refresh Token: Already Used");
      const sess = await q("SELECT 1 FROM auth.sessions WHERE id = $1", [rt.session_id]);
      if (!sess.rowCount) return authErr(res, 400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found");
      const u = await getUserById(rt.user_id);
      if (!u) return authErr(res, 400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found");
      if (u.banned_until && new Date(u.banned_until) > new Date()) return authErr(res, 400, "user_banned", "User is banned");
      await q("UPDATE auth.refresh_tokens SET revoked = true, updated_at = now() WHERE id = $1", [rt.id]);
      await q("UPDATE auth.sessions SET updated_at = now() WHERE id = $1", [rt.session_id]);
      const refresh = await newRefreshToken(u.id, rt.session_id, rt.token);
      return authOk(res, 200, sessionJson(u, rt.session_id, refresh, "password"));
    }
    return authErr(res, 400, "unsupported_grant_type", "unsupported_grant_type: only password and refresh_token are emulated in the sandbox");
  }

  // ── current user ──
  if (p === "/user" && req.method === "GET") {
    const ctx = await requireUser(req, res);
    if (ctx) authOk(res, 200, userJson(ctx.user));
    return;
  }
  if (p === "/user" && req.method === "PUT") {
    const ctx = await requireUser(req, res);
    if (!ctx) return;
    const body = await readJson(req);
    if (weakPassword(res, body.password)) return;
    if (body.password) await q("UPDATE auth.users SET encrypted_password = extensions.crypt($2, extensions.gen_salt('bf', 10)), updated_at = now() WHERE id = $1", [ctx.user.id, String(body.password)]);
    if (body.data && typeof body.data === "object") await q("UPDATE auth.users SET raw_user_meta_data = jsonb_strip_nulls(coalesce(raw_user_meta_data, '{}'::jsonb) || $2::jsonb), updated_at = now() WHERE id = $1", [ctx.user.id, JSON.stringify(body.data)]);
    if (body.email && String(body.email).toLowerCase() !== ctx.user.email) {
      console.log("[gateway] auth: email change applied directly (no confirmation mail in the sandbox)");
      await q("UPDATE auth.users SET email = lower($2), updated_at = now() WHERE id = $1", [ctx.user.id, String(body.email)]);
    }
    return authOk(res, 200, userJson(await getUserById(ctx.user.id)));
  }

  // ── logout ──
  if (p === "/logout" && req.method === "POST") {
    req.resume();
    const tok = bearer(req);
    const { claims } = tok ? verifyJwt(tok) : {};
    if (!claims?.sub) return authErr(res, 401, "bad_jwt", "invalid JWT");
    const scope = url.searchParams.get("scope") || "global";
    if (scope === "local" && claims.session_id) await q("DELETE FROM auth.sessions WHERE id = $1", [claims.session_id]);
    else if (scope === "others") await q("DELETE FROM auth.sessions WHERE user_id = $1 AND id IS DISTINCT FROM $2", [claims.sub, claims.session_id || null]);
    else await q("DELETE FROM auth.sessions WHERE user_id = $1", [claims.sub]);
    await q("UPDATE auth.refresh_tokens SET revoked = true, updated_at = now() WHERE user_id = $1 AND session_id NOT IN (SELECT id FROM auth.sessions)", [claims.sub]);
    return send(res, 204, null, { "X-Supabase-Api-Version": API_VERSION });
  }

  // ── password recovery: never sends anything ──
  if (p === "/recover" && req.method === "POST") {
    await readJson(req);
    console.log("[gateway] auth: /recover requested — NO email sent (sandbox). Use admin generate_link for a recovery link.");
    return authOk(res, 200, {});
  }

  // ── verify (magic link / recovery / invite / signup / email change) ──
  if (p === "/verify" && (req.method === "GET" || req.method === "POST")) {
    const body = req.method === "POST" ? await readJson(req) : {};
    const type = String(body.type || url.searchParams.get("type") || "");
    const tokenHash = String(body.token_hash || url.searchParams.get("token") || "");
    const redirect = safeRedirect(body.redirect_to || url.searchParams.get("redirect_to"));
    let rows = [];
    if (tokenHash) ({ rows } = await q(
      `UPDATE auth.one_time_tokens SET used_at = now()
        WHERE token_hash = $1 AND used_at IS NULL AND created_at > now() - interval '24 hours'
        RETURNING user_id, token_type, redirect_to`, [tokenHash]));
    else if (body.token && body.email) ({ rows } = await q(
      `UPDATE auth.one_time_tokens t SET used_at = now() FROM auth.users u
        WHERE u.id = t.user_id AND u.email = lower($2) AND t.email_otp = $1 AND t.used_at IS NULL AND t.created_at > now() - interval '24 hours'
        RETURNING t.user_id, t.token_type, t.redirect_to`, [String(body.token), String(body.email)]));
    const tok = rows[0];
    if (!tok) {
      if (req.method === "GET") return send(res, 303, null, { Location: `${redirect}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired` });
      return authErr(res, 403, "otp_expired", "Token has expired or is invalid");
    }
    if (tok.token_type.startsWith("email_change:")) {
      await q("UPDATE auth.users SET email = lower($2), updated_at = now() WHERE id = $1", [tok.user_id, tok.token_type.slice("email_change:".length)]);
    }
    await q("UPDATE auth.users SET email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now() WHERE id = $1", [tok.user_id]);
    const session = await issueSession(await getUserById(tok.user_id), "otp");
    if (req.method === "GET") {
      const target = safeRedirect(url.searchParams.get("redirect_to") || tok.redirect_to);
      const frag = new URLSearchParams({ access_token: session.access_token, expires_at: String(session.expires_at), expires_in: String(session.expires_in), refresh_token: session.refresh_token, token_type: "bearer", type: type || tok.token_type });
      return send(res, 303, null, { Location: `${target}#${frag}` });
    }
    return authOk(res, 200, session);
  }

  // ── admin ──
  if (p.startsWith("/admin/")) {
    if (!requireServiceRole(req, res)) { req.resume(); return; }
    const m = p.match(/^\/admin\/users\/([^/]+)$/);

    if (p === "/admin/users" && req.method === "GET") {
      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
      const perPage = Math.min(1000, Math.max(1, parseInt(url.searchParams.get("per_page") || "50", 10) || 50));
      const { rows: [{ n }] } = await q("SELECT count(*)::int AS n FROM auth.users WHERE deleted_at IS NULL");
      const { rows } = await q(`SELECT ${USER_COLS} FROM auth.users WHERE deleted_at IS NULL ORDER BY created_at, id LIMIT $1 OFFSET $2`, [perPage, (page - 1) * perPage]);
      const last = Math.max(1, Math.ceil(n / perPage));
      const links = [];
      if (page < last) links.push(`</admin/users?page=${page + 1}&per_page=${perPage}>; rel="next"`);
      links.push(`</admin/users?page=${last}&per_page=${perPage}>; rel="last"`);
      return authOk(res, 200, { users: rows.map(userJson), aud: "authenticated" }, { "X-Total-Count": String(n), Link: links.join(", ") });
    }
    if (p === "/admin/users" && req.method === "POST") {
      const b = await readJson(req);
      if (!b.email && !b.phone) return authErr(res, 400, "validation_failed", "Unable to validate email address: invalid format");
      if (weakPassword(res, b.password)) return;
      if (b.email && await getUserByEmail(b.email)) return authErr(res, 422, "email_exists", "A user with this email address has already been registered");
      const ban = parseBanDuration(b.ban_duration);
      if (ban === "invalid") return authErr(res, 400, "validation_failed", "invalid format for ban duration");
      const u = await createUser({ email: b.email, password: b.password, emailConfirm: b.email_confirm, userMeta: b.user_metadata || b.data, appMeta: b.app_metadata, phone: b.phone, role: b.role || "authenticated", id: b.id });
      if (ban) await q("UPDATE auth.users SET banned_until = $2 WHERE id = $1", [u.id, ban]);
      return authOk(res, 200, userJson(await getUserById(u.id)));
    }
    if (m && req.method === "GET") {
      const u = await getUserById(m[1]);
      return u ? authOk(res, 200, userJson(u)) : authErr(res, 404, "user_not_found", "User not found");
    }
    if (m && req.method === "PUT") {
      const b = await readJson(req);
      const u = await getUserById(m[1]);
      if (!u) return authErr(res, 404, "user_not_found", "User not found");
      if (weakPassword(res, b.password)) return;
      if (b.email && String(b.email).toLowerCase() !== u.email) {
        const other = await getUserByEmail(b.email);
        if (other && other.id !== u.id) return authErr(res, 422, "email_exists", "A user with this email address has already been registered");
        await q("UPDATE auth.users SET email = lower($2) WHERE id = $1", [u.id, String(b.email)]);
      }
      if (b.password) await q("UPDATE auth.users SET encrypted_password = extensions.crypt($2, extensions.gen_salt('bf', 10)) WHERE id = $1", [u.id, String(b.password)]);
      if (b.email_confirm === true) await q("UPDATE auth.users SET email_confirmed_at = coalesce(email_confirmed_at, now()) WHERE id = $1", [u.id]);
      if (b.email_confirm === false) await q("UPDATE auth.users SET email_confirmed_at = NULL WHERE id = $1", [u.id]);
      const meta = b.user_metadata || b.data;
      if (meta && typeof meta === "object") await q("UPDATE auth.users SET raw_user_meta_data = jsonb_strip_nulls(coalesce(raw_user_meta_data, '{}'::jsonb) || $2::jsonb) WHERE id = $1", [u.id, JSON.stringify(meta)]);
      if (b.app_metadata && typeof b.app_metadata === "object") await q("UPDATE auth.users SET raw_app_meta_data = jsonb_strip_nulls(coalesce(raw_app_meta_data, '{}'::jsonb) || $2::jsonb) WHERE id = $1", [u.id, JSON.stringify(b.app_metadata)]);
      if (b.role) await q("UPDATE auth.users SET role = $2 WHERE id = $1", [u.id, String(b.role)]);
      const ban = parseBanDuration(b.ban_duration);
      if (ban === "invalid") return authErr(res, 400, "validation_failed", "invalid format for ban duration");
      if (ban !== undefined) await q("UPDATE auth.users SET banned_until = $2 WHERE id = $1", [u.id, ban]);
      await q("UPDATE auth.users SET updated_at = now() WHERE id = $1", [u.id]);
      return authOk(res, 200, userJson(await getUserById(u.id)));
    }
    if (m && req.method === "DELETE") {
      const b = await readJson(req);
      const u = await getUserById(m[1]);
      if (!u) return authErr(res, 404, "user_not_found", "User not found");
      try {
        if (b.should_soft_delete) {
          await q(`UPDATE auth.users SET deleted_at = now(), email = NULL, phone = NULL, encrypted_password = '',
                     raw_user_meta_data = '{}'::jsonb, updated_at = now() WHERE id = $1`, [u.id]);
          await q("DELETE FROM auth.sessions WHERE user_id = $1", [u.id]);
        } else {
          await q("DELETE FROM auth.users WHERE id = $1", [u.id]);
        }
      } catch (e) {
        console.error(`[gateway] auth: delete user failed: ${e.message}`);
        return authErr(res, 500, "unexpected_failure", "Database error deleting user");
      }
      return authOk(res, 200, {});
    }
    if (p === "/admin/generate_link" && req.method === "POST") {
      const b = await readJson(req);
      const type = String(b.type || "");
      if (!["signup", "invite", "magiclink", "recovery", "email_change_current", "email_change_new"].includes(type)) return authErr(res, 400, "validation_failed", "Invalid link type");
      if (!b.email) return authErr(res, 400, "validation_failed", "An email address is required");
      let u = await getUserByEmail(b.email);
      if (type === "signup") {
        if (u?.email_confirmed_at) return authErr(res, 422, "email_exists", "A user with this email address has already been registered");
        if (weakPassword(res, b.password)) return;
        if (!u) u = await createUser({ email: b.email, password: b.password, emailConfirm: false, userMeta: b.data });
      } else if (type === "invite") {
        if (u?.email_confirmed_at) return authErr(res, 422, "email_exists", "A user with this email address has already been registered");
        if (!u) u = await createUser({ email: b.email, password: null, emailConfirm: false, userMeta: b.data, invited: true });
      } else if (type === "magiclink") {
        if (!u) u = await createUser({ email: b.email, password: null, emailConfirm: false, userMeta: b.data });
      } else if (!u) {
        return authErr(res, 404, "user_not_found", "User with this email not found");
      }
      const tokenHash = createHash("sha256").update(randomBytes(32)).digest("hex");
      const otp = String(randomInt(0, 1e6)).padStart(6, "0");
      const redirect = safeRedirect(b.redirect_to || b.options?.redirectTo);
      const tokenType = type.startsWith("email_change") && b.new_email ? `email_change:${String(b.new_email).toLowerCase()}` : type;
      await q("INSERT INTO auth.one_time_tokens (user_id, token_type, token_hash, email_otp, redirect_to) VALUES ($1, $2, $3, $4, $5)", [u.id, tokenType, tokenHash, otp, redirect]);
      if (type === "recovery") await q("UPDATE auth.users SET recovery_sent_at = now() WHERE id = $1", [u.id]);
      const verification = type === "magiclink" ? "magiclink" : type;
      const action_link = `${PUBLIC_URL}/auth/v1/verify?token=${tokenHash}&type=${verification}&redirect_to=${encodeURIComponent(redirect)}`;
      console.log(`[gateway] auth: generate_link type=${type} — link returned to caller only, NO email sent`);
      return authOk(res, 200, { ...userJson(await getUserById(u.id)), action_link, email_otp: otp, hashed_token: tokenHash, redirect_to: redirect, verification_type: verification });
    }
    req.resume();
    return authErr(res, 404, "not_found", `Admin route ${req.method} ${p} is not emulated by the sandbox`);
  }

  req.resume();
  return authErr(res, 404, "not_found", `Auth route ${req.method} ${p} is not emulated by the sandbox`);
}

// ════════════════════════════════════════════════════════════════════════════
// /storage/v1 → storage-api emulation
// ════════════════════════════════════════════════════════════════════════════
function sErr(res, statusCode, error, message, http = 400) {
  return json(res, http, { statusCode: String(statusCode), error, message });
}

class StorageHttpError extends Error {
  constructor(statusCode, error, message) { super(message); this.statusCode = statusCode; this.error = error; }
}

/** JWT for storage: Authorization bearer, else apikey (Kong copies apikey → Authorization). */
function storageClaims(req, url) {
  const tok = bearer(req) || req.headers.apikey || url.searchParams.get("apikey");
  if (!tok) return { err: ["403", "Unauthorized", "headers must have required property 'authorization'"] };
  const { claims, error } = verifyJwt(String(tok));
  if (error) return { err: ["403", "Unauthorized", error.message] };
  if (!["anon", "authenticated", "service_role"].includes(claims.role)) return { err: ["403", "Unauthorized", `role ${claims.role} is not allowed to use storage`] };
  return { claims };
}

/** Run fn(client) in a transaction as the caller's role (RLS on storage.* applies) — or as the
 *  superuser for service_role (BYPASSRLS, like storage-api with the service key). */
async function asRole(claims, fn) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    if (claims.role !== "service_role") {
      await c.query("SELECT set_config('request.jwt.claims', $1, true), set_config('role', $2, true)", [JSON.stringify(claims), claims.role]);
    }
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    try { await c.query("ROLLBACK"); } catch { /* ignore */ }
    throw e;
  } finally {
    c.release();
  }
}

function validKey(name) {
  if (!name || name.length > 1024 || name.startsWith("/") || /[\0\\]/.test(name)) return false;
  return !name.split("/").some((seg) => seg === ".." || seg === "." || seg === "");
}

function objFile(bucket, name) {
  const root = path.join(STORAGE_DIR, bucket);
  const full = path.join(root, ...name.split("/"));
  if (!full.startsWith(root + path.sep)) throw new StorageHttpError("400", "InvalidKey", "Invalid key");
  return full;
}

function splitBucketKey(rest) {
  const parts = rest.split("/").map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
  const bucket = parts.shift() || "";
  return { bucket, name: parts.join("/") };
}

async function bucketRow(id) {
  const { rows } = await q("SELECT id, name, owner, public, file_size_limit, allowed_mime_types, type, created_at, updated_at FROM storage.buckets WHERE id = $1", [id]);
  return rows[0] || null;
}

function bucketJson(b) {
  return { id: b.id, name: b.name, owner: b.owner || "", public: !!b.public, file_size_limit: b.file_size_limit ?? null, allowed_mime_types: b.allowed_mime_types ?? null, type: b.type || "STANDARD", created_at: iso(b.created_at), updated_at: iso(b.updated_at) };
}

function objectJson(o) {
  return { name: o.name, id: o.id, updated_at: iso(o.updated_at), created_at: iso(o.created_at), last_accessed_at: iso(o.last_accessed_at), metadata: o.metadata };
}

async function parseUpload(req) {
  const buf = await readBody(req, MAX_UPLOAD);
  const ct = String(req.headers["content-type"] || "");
  let bytes = buf;
  let mimetype = ct.split(";")[0].trim() ? ct : "application/octet-stream";
  let cacheControl = (String(req.headers["cache-control"] || "").match(/max-age=(\d+)/) || [])[1] || "3600";
  let userMeta = null;
  if (/^multipart\/form-data/i.test(ct)) {
    const fd = await new Request("http://sandbox.local/", { method: "POST", headers: { "content-type": ct }, body: buf }).formData();
    let file = null;
    for (const [k, v] of fd.entries()) {
      if (typeof v !== "string" && !file) file = v;
      else if (k === "cacheControl") cacheControl = String(v);
      else if (k === "metadata") { try { userMeta = JSON.parse(String(v)); } catch { /* ignore */ } }
    }
    if (!file) throw new StorageHttpError("400", "InvalidRequest", "No file was provided in the multipart body");
    bytes = Buffer.from(await file.arrayBuffer());
    mimetype = file.type || "application/octet-stream";
  } else if (req.headers["x-metadata"]) {
    try { userMeta = JSON.parse(Buffer.from(String(req.headers["x-metadata"]), "base64").toString("utf8")); } catch { /* ignore */ }
  }
  return { bytes, mimetype, cacheControl, userMeta };
}

async function writeObjectFiles(file, bytes, meta) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.upload-${randomBytes(6).toString("hex")}`;
  await fsp.writeFile(tmp, bytes);
  return {
    tmp,
    commit: async () => {
      await fsp.rename(tmp, file);
      await fsp.writeFile(`${file}.meta.json`, JSON.stringify(meta, null, 2));
    },
    abort: async () => { await fsp.rm(tmp, { force: true }); }
  };
}

async function upload(req, res, bucket, name, claims, method) {
  if (!["authenticated", "service_role"].includes(claims.role)) { req.resume(); return sErr(res, "403", "Unauthorized", "An authenticated or service_role JWT is required to write objects"); }
  if (!validKey(name)) { req.resume(); return sErr(res, "400", "InvalidKey", `Invalid key: ${name}`); }
  if (!(await bucketRow(bucket))) { req.resume(); return sErr(res, "404", "Bucket not found", "Bucket not found"); }
  let parsed;
  try { parsed = await parseUpload(req); }
  catch (e) {
    if (e.code === "TOO_LARGE") return sErr(res, "413", "Payload too large", "The object exceeded the maximum allowed size", 413);
    if (e instanceof StorageHttpError) return sErr(res, e.statusCode, e.error, e.message);
    throw e;
  }
  const { bytes, mimetype, cacheControl, userMeta } = parsed;
  const etag = `"${createHash("md5").update(bytes).digest("hex")}"`;
  const now = new Date().toISOString();
  const metadata = { eTag: etag, size: bytes.length, mimetype, cacheControl: `max-age=${cacheControl}`, lastModified: now, contentLength: bytes.length, httpStatusCode: 200 };
  const upsert = method === "POST" && String(req.headers["x-upsert"] || "").toLowerCase() === "true";
  const owner = claims.role === "authenticated" ? claims.sub : null;
  const file = objFile(bucket, name);
  const staged = await writeObjectFiles(file, bytes, { bucket, name, contentType: mimetype, cacheControl: `max-age=${cacheControl}`, size: bytes.length, etag, lastModified: now });
  let id = randomUUID();
  try {
    await asRole(claims, async (c) => {
      if (method === "PUT") {
        const r = await c.query(
          `UPDATE storage.objects SET metadata = $3, user_metadata = coalesce($4, user_metadata), version = $5, updated_at = now(), last_accessed_at = now()
            WHERE bucket_id = $1 AND name = $2 RETURNING id`, [bucket, name, metadata, userMeta, randomUUID()]);
        if (!r.rowCount) throw new StorageHttpError("404", "not_found", "Object not found");
        id = r.rows[0].id;
      } else if (upsert) {
        const r = await c.query(
          `INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata, user_metadata, version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (bucket_id, name) DO UPDATE SET metadata = EXCLUDED.metadata, user_metadata = EXCLUDED.user_metadata,
             owner = EXCLUDED.owner, owner_id = EXCLUDED.owner_id, version = EXCLUDED.version, updated_at = now(), last_accessed_at = now()
           RETURNING id`, [id, bucket, name, owner, owner, metadata, userMeta, randomUUID()]);
        id = r.rows[0].id;
      } else {
        await c.query(
          `INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata, user_metadata, version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [id, bucket, name, owner, owner, metadata, userMeta, randomUUID()]);
      }
      await staged.commit();
    });
  } catch (e) {
    await staged.abort();
    if (e instanceof StorageHttpError) return sErr(res, e.statusCode, e.error, e.message);
    if (e.code === "23505") return sErr(res, "409", "Duplicate", "The resource already exists");
    if (e.code === "42501") return sErr(res, "403", "Unauthorized", "new row violates row-level security policy");
    throw e;
  }
  return json(res, 200, { Id: id, Key: `${bucket}/${name}` });
}

async function findObject(claims, bucket, name) {
  const sql = "SELECT id, name, bucket_id, metadata, user_metadata, version, created_at, updated_at, last_accessed_at FROM storage.objects WHERE bucket_id = $1 AND name = $2";
  if (!claims || claims.role === "service_role") return (await q(sql, [bucket, name])).rows[0] || null;
  return asRole(claims, async (c) => (await c.query(sql, [bucket, name])).rows[0] || null);
}

async function serveFile(req, res, url, bucket, name, row) {
  const file = objFile(bucket, name);
  let st;
  try { st = await fsp.stat(file); } catch { return sErr(res, "404", "not_found", "Object not found"); }
  let meta = {};
  try { meta = JSON.parse(await fsp.readFile(`${file}.meta.json`, "utf8")); } catch { /* fall back to DB metadata */ }
  const headers = {
    "Content-Type": meta.contentType || row?.metadata?.mimetype || "application/octet-stream",
    "Cache-Control": meta.cacheControl || row?.metadata?.cacheControl || "no-cache",
    ETag: meta.etag || row?.metadata?.eTag || `"${st.size}-${st.mtimeMs}"`,
    "Last-Modified": new Date(meta.lastModified || st.mtime).toUTCString(),
    "Accept-Ranges": "bytes"
  };
  if (url.searchParams.has("download")) {
    const fname = url.searchParams.get("download") || path.basename(name);
    headers["Content-Disposition"] = `attachment; filename="${fname.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(fname)}`;
  }
  let start = 0;
  let end = st.size - 1;
  let status = 200;
  const range = String(req.headers.range || "").match(/^bytes=(\d*)-(\d*)$/);
  if (range && st.size > 0) {
    if (range[1] === "" && range[2] !== "") { start = Math.max(0, st.size - Number(range[2])); }
    else { start = Number(range[1] || 0); if (range[2] !== "") end = Math.min(end, Number(range[2])); }
    if (start > end || start >= st.size) return send(res, 416, null, { "Content-Range": `bytes */${st.size}` });
    status = 206;
    headers["Content-Range"] = `bytes ${start}-${end}/${st.size}`;
  }
  headers["Content-Length"] = st.size === 0 ? 0 : end - start + 1;
  res.writeHead(status, headers);
  if (req.method === "HEAD" || st.size === 0) return res.end();
  fs.createReadStream(file, { start, end }).pipe(res);
}

function signedUrlFor(bucket, name, expiresIn) {
  const token = jwt.sign({ url: `${bucket}/${name}` }, SECRET, { algorithm: "HS256", expiresIn: Number(expiresIn) });
  return `/object/sign/${bucket}/${name}?token=${token}`;
}

async function listObjects(claims, bucket, body) {
  let prefix = String(body.prefix || "");
  if (prefix && !prefix.endsWith("/")) prefix += "/";
  prefix = prefix.replace(/^\/+/, "");
  const limit = Math.max(1, Math.min(1000, Number(body.limit) || 100));
  const offset = Math.max(0, Number(body.offset) || 0);
  const search = String(body.search || "").toLowerCase();
  const sortCol = ["name", "updated_at", "created_at", "last_accessed_at"].includes(body.sortBy?.column) ? body.sortBy.column : "name";
  const desc = String(body.sortBy?.order || "asc").toLowerCase() === "desc";
  const like = prefix.replace(/[\\%_]/g, (c) => `\\${c}`) + "%";
  const sql = "SELECT id, name, metadata, created_at, updated_at, last_accessed_at FROM storage.objects WHERE bucket_id = $1 AND name LIKE $2";
  const rows = claims.role === "service_role"
    ? (await q(sql, [bucket, like])).rows
    : await asRole(claims, async (c) => (await c.query(sql, [bucket, like])).rows);
  const folders = new Map();
  const files = [];
  for (const r of rows) {
    const rest = r.name.slice(prefix.length);
    if (!rest) continue;
    const slash = rest.indexOf("/");
    if (slash >= 0) {
      const f = rest.slice(0, slash);
      if (!folders.has(f)) folders.set(f, { name: f, id: null, updated_at: null, created_at: null, last_accessed_at: null, metadata: null });
    } else {
      files.push({ ...objectJson(r), name: rest });
    }
  }
  let items = [...folders.values(), ...files];
  if (search) items = items.filter((i) => i.name.toLowerCase().startsWith(search));
  items.sort((a, b) => {
    const av = a[sortCol] ?? "";
    const bv = b[sortCol] ?? "";
    const c = av < bv ? -1 : av > bv ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    return desc ? -c : c;
  });
  return items.slice(offset, offset + limit);
}

async function storageRoutes(req, res, url) {
  const p = url.pathname.slice("/storage/v1".length) || "/";

  // ── open routes (no JWT): public objects, signed-URL downloads ──
  let m = p.match(/^\/(?:object|render\/image)\/public\/(.+)$/);
  if (m && (req.method === "GET" || req.method === "HEAD")) {
    const { bucket, name } = splitBucketKey(m[1]);
    const b = await bucketRow(bucket);
    if (!b || !b.public) return sErr(res, "404", "Bucket not found", "Bucket not found");
    const row = await findObject(null, bucket, name);
    if (!row) return sErr(res, "404", "not_found", "Object not found");
    return serveFile(req, res, url, bucket, name, row);
  }
  m = p.match(/^\/object\/sign\/(.+)$/);
  if (m && (req.method === "GET" || req.method === "HEAD")) {
    const { bucket, name } = splitBucketKey(m[1]);
    const token = url.searchParams.get("token");
    if (!token) return sErr(res, "400", "InvalidJWT", "querystring must have required property 'token'");
    const { claims, error } = verifyJwt(token);
    if (error) return sErr(res, "400", "InvalidJWT", error.message);
    if (claims.url !== `${bucket}/${name}`) return sErr(res, "400", "InvalidSignature", "The url do not match the signature");
    const row = await findObject(null, bucket, name);
    if (!row) return sErr(res, "404", "not_found", "Object not found");
    return serveFile(req, res, url, bucket, name, row);
  }

  // ── everything else needs a valid JWT ──
  const { claims, err } = storageClaims(req, url);
  if (err) { req.resume(); return sErr(res, ...err); }

  // buckets
  if (p === "/bucket" && req.method === "GET") {
    const sql = "SELECT id, name, owner, public, file_size_limit, allowed_mime_types, type, created_at, updated_at FROM storage.buckets ORDER BY name";
    const rows = claims.role === "service_role" ? (await q(sql)).rows : await asRole(claims, async (c) => (await c.query(sql)).rows);
    return json(res, 200, rows.map(bucketJson));
  }
  if (p === "/bucket" && req.method === "POST") {
    const b = await readJson(req);
    const id = String(b.id || b.name || "");
    if (!/^[A-Za-z0-9_.-]+$/.test(id)) return sErr(res, "400", "InvalidBucketName", "Bucket name invalid");
    try {
      await asRole(claims, (c) => c.query("INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types, owner) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, String(b.name || id), !!b.public, b.file_size_limit ?? null, b.allowed_mime_types ?? null, claims.role === "authenticated" ? claims.sub : null]));
    } catch (e) {
      if (e.code === "23505") return sErr(res, "409", "Duplicate", "The resource already exists");
      if (e.code === "42501") return sErr(res, "403", "Unauthorized", "new row violates row-level security policy");
      throw e;
    }
    await fsp.mkdir(path.join(STORAGE_DIR, id), { recursive: true });
    return json(res, 200, { name: id });
  }
  m = p.match(/^\/bucket\/([^/]+)(\/empty)?$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    const b = await bucketRow(id);
    if (!b) { req.resume(); return sErr(res, "404", "Bucket not found", "Bucket not found"); }
    if (!m[2] && req.method === "GET") return json(res, 200, bucketJson(b));
    if (claims.role !== "service_role") { req.resume(); return sErr(res, "403", "Unauthorized", "Bucket management requires the service_role key in the sandbox"); }
    if (!m[2] && req.method === "PUT") {
      const body = await readJson(req);
      await q("UPDATE storage.buckets SET public = coalesce($2, public), file_size_limit = $3, allowed_mime_types = $4, updated_at = now() WHERE id = $1",
        [id, typeof body.public === "boolean" ? body.public : null, body.file_size_limit ?? null, body.allowed_mime_types ?? null]);
      return json(res, 200, { message: "Successfully updated" });
    }
    if (!m[2] && req.method === "DELETE") {
      const { rowCount } = await q("SELECT 1 FROM storage.objects WHERE bucket_id = $1 LIMIT 1", [id]);
      if (rowCount) return sErr(res, "409", "InvalidRequest", "The bucket you tried to delete is not empty");
      await q("DELETE FROM storage.buckets WHERE id = $1", [id]);
      await fsp.rm(path.join(STORAGE_DIR, id), { recursive: true, force: true });
      return json(res, 200, { message: "Successfully deleted" });
    }
    if (m[2] && req.method === "POST") {
      req.resume();
      await q("DELETE FROM storage.objects WHERE bucket_id = $1", [id]);
      await fsp.rm(path.join(STORAGE_DIR, id), { recursive: true, force: true });
      await fsp.mkdir(path.join(STORAGE_DIR, id), { recursive: true });
      return json(res, 200, { message: "Successfully emptied" });
    }
  }

  // list
  m = p.match(/^\/object\/list\/([^/]+)$/);
  if (m && req.method === "POST") {
    const bucket = decodeURIComponent(m[1]);
    if (!(await bucketRow(bucket))) { req.resume(); return sErr(res, "404", "Bucket not found", "Bucket not found"); }
    return json(res, 200, await listObjects(claims, bucket, await readJson(req)));
  }

  // signed URLs (create)
  m = p.match(/^\/object\/sign\/(.+)$/);
  if (m && req.method === "POST") {
    const body = await readJson(req);
    const { bucket, name } = splitBucketKey(m[1]);
    const expiresIn = Number(body.expiresIn);
    if (!Number.isFinite(expiresIn) || expiresIn < 1) return sErr(res, "400", "InvalidRequest", "body/expiresIn must be >= 1");
    if (!name) { // batch: POST /object/sign/<bucket> {expiresIn, paths}
      const out = [];
      for (const pth of Array.isArray(body.paths) ? body.paths : []) {
        const row = validKey(String(pth)) ? await findObject(claims, bucket, String(pth)) : null;
        out.push(row ? { error: null, path: pth, signedURL: signedUrlFor(bucket, String(pth), expiresIn) }
          : { error: "Either the object does not exist or you do not have access to it", path: pth, signedURL: null });
      }
      return json(res, 200, out);
    }
    const row = await findObject(claims, bucket, name);
    if (!row) return sErr(res, "404", "not_found", "Object not found");
    return json(res, 200, { signedURL: signedUrlFor(bucket, name, expiresIn) });
  }

  // info
  m = p.match(/^\/object\/info\/(?:authenticated\/|public\/)?(.+)$/);
  if (m && req.method === "GET") {
    const { bucket, name } = splitBucketKey(m[1]);
    const row = await findObject(claims, bucket, name);
    if (!row) return sErr(res, "404", "not_found", "Object not found");
    return json(res, 200, {
      id: row.id, name: row.name, version: row.version, bucket_id: row.bucket_id, size: row.metadata?.size ?? null,
      content_type: row.metadata?.mimetype ?? null, cache_control: row.metadata?.cacheControl ?? null, etag: row.metadata?.eTag ?? null,
      metadata: row.user_metadata ?? null, last_modified: row.metadata?.lastModified ?? iso(row.updated_at), created_at: iso(row.created_at)
    });
  }

  // remove many: DELETE /object/<bucket> {prefixes}
  m = p.match(/^\/object\/([^/]+)$/);
  if (m && req.method === "DELETE") {
    if (!["authenticated", "service_role"].includes(claims.role)) { req.resume(); return sErr(res, "403", "Unauthorized", "An authenticated or service_role JWT is required to delete objects"); }
    const bucket = decodeURIComponent(m[1]);
    const body = await readJson(req);
    const names = (Array.isArray(body.prefixes) ? body.prefixes : []).map(String).filter(validKey);
    if (!names.length) return json(res, 200, []);
    const rows = await asRole(claims, async (c) => (await c.query(
      "DELETE FROM storage.objects WHERE bucket_id = $1 AND name = ANY($2::text[]) RETURNING id, bucket_id, name, owner, owner_id, metadata, user_metadata, version, created_at, updated_at, last_accessed_at",
      [bucket, names])).rows);
    for (const r of rows) {
      const f = objFile(bucket, r.name);
      await fsp.rm(f, { force: true });
      await fsp.rm(`${f}.meta.json`, { force: true });
    }
    return json(res, 200, rows.map((r) => ({ ...r, created_at: iso(r.created_at), updated_at: iso(r.updated_at), last_accessed_at: iso(r.last_accessed_at) })));
  }

  // single object: upload / update / download / delete
  m = p.match(/^\/object\/(?:(authenticated)\/)?([^/]+)\/(.+)$/);
  if (m) {
    const { bucket, name } = splitBucketKey(`${m[2]}/${m[3]}`);
    if ((req.method === "POST" || req.method === "PUT") && !m[1]) return upload(req, res, bucket, name, claims, req.method);
    if (req.method === "GET" || req.method === "HEAD") {
      if (!validKey(name)) return sErr(res, "400", "InvalidKey", `Invalid key: ${name}`);
      const row = await findObject(claims, bucket, name);
      if (!row) return sErr(res, "404", "not_found", "Object not found");
      return serveFile(req, res, url, bucket, name, row);
    }
    if (req.method === "DELETE" && !m[1]) {
      req.resume();
      if (!["authenticated", "service_role"].includes(claims.role)) return sErr(res, "403", "Unauthorized", "An authenticated or service_role JWT is required to delete objects");
      const rows = await asRole(claims, async (c) => (await c.query("DELETE FROM storage.objects WHERE bucket_id = $1 AND name = $2 RETURNING name", [bucket, name])).rows);
      if (!rows.length) return sErr(res, "404", "not_found", "Object not found");
      const f = objFile(bucket, name);
      await fsp.rm(f, { force: true });
      await fsp.rm(`${f}.meta.json`, { force: true });
      return json(res, 200, { message: "Successfully deleted" });
    }
  }

  req.resume();
  return sErr(res, "404", "not_found", `Storage route ${req.method} ${p} is not emulated by the sandbox`, 404);
}

// ════════════════════════════════════════════════════════════════════════════
// server
// ════════════════════════════════════════════════════════════════════════════
async function handler(req, res) {
  const t0 = Date.now();
  const url = new URL(req.url, PUBLIC_URL);
  res.on("finish", () => {
    console.log(`${new Date().toISOString()} ${req.method} ${redactUrl(req.url)} ${res.statusCode} ${Date.now() - t0}ms role=${roleForLog(req, url)}`);
  });
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Expose-Headers", EXPOSE);
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD",
      "Access-Control-Allow-Headers": req.headers["access-control-request-headers"] ||
        "apikey, authorization, x-client-info, content-type, prefer, range, x-upsert, accept-profile, content-profile, x-supabase-api-version, cache-control, x-metadata",
      "Access-Control-Max-Age": "86400"
    });
    return res.end();
  }
  const p = url.pathname;
  try {
    if (p === "/" || p === "/health") return json(res, 200, { ok: true, service: "blh-register-sandbox-gateway", sandbox: true });
    if (p === "/rest/v1" || p.startsWith("/rest/v1/")) return restProxy(req, res, url);
    if (p.startsWith("/auth/v1")) return await authRoutes(req, res, url);
    if (p.startsWith("/storage/v1")) return await storageRoutes(req, res, url);
    req.resume();
    if (/^\/(realtime|functions|graphql)\/v1/.test(p)) return json(res, 404, { message: `${p.split("/")[1]} is not available in the local register sandbox` });
    return json(res, 404, { message: "no Route matched with those values" });
  } catch (e) {
    console.error(`[gateway] ${req.method} ${redactUrl(req.url)} failed:`, e.stack || e);
    if (!res.headersSent) json(res, 500, { message: "sandbox gateway error", error: e.message });
    else res.destroy();
  }
}

function rejectUpgrade(req, socket) {
  socket.end("HTTP/1.1 404 Not Found\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{\"message\":\"realtime is not available in the local register sandbox\"}");
}

const servers = [];
for (const host of ["127.0.0.1", "::1"]) {
  const s = http.createServer(handler);
  s.on("upgrade", rejectUpgrade);
  s.on("error", (e) => {
    if (host === "::1" && (e.code === "EADDRNOTAVAIL" || e.code === "EAFNOSUPPORT")) return;
    console.error(`[gateway] listen ${host}:${GATEWAY_PORT} failed: ${e.message}`);
    process.exit(1);
  });
  s.listen(GATEWAY_PORT, host, () => console.log(`[gateway] listening on http://${host.includes(":") ? `[${host}]` : host}:${GATEWAY_PORT} → PostgREST 127.0.0.1:${PGRST_PORT}, Postgres socket ${RUN_DIR}`));
  servers.push(s);
}

function shutdown() {
  for (const s of servers) s.close();
  pool.end().finally(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
