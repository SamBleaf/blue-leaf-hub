// =============================================================================
// pgSupabaseShim — a SMALL supabase-js lookalike over a real Postgres (node-pg), for takeoff
// integration tests. Real SQL, real constraints, real RPCs/triggers from migration 206; only the
// PostgREST transport is replaced. Implements exactly the query-builder chains the takeoff
// service + plan routes use (select/insert/update/delete, eq/neq/in/is, order/limit,
// single/maybeSingle, rpc) plus in-memory storage and token→user auth.
// Never pointed at a hosted database (see takeoffTestDb.mjs).
// =============================================================================
import pg from "pg";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// PostgREST returns timestamps/dates as ISO strings (microsecond precision) — not JS Dates.
for (const oid of [1082, 1114, 1184]) pg.types.setTypeParser(oid, (v) => v);

const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;
const toParam = (v) => (v !== null && typeof v === "object" && !(v instanceof Date) && !Buffer.isBuffer(v) ? JSON.stringify(v) : v);

function pgErr(e) {
  return { message: e.message, code: e.code, details: e.detail || null };
}

class Query {
  constructor(client, table) {
    this.client = client; this.table = table; this.op = "select"; this.cols = "*";
    this.filters = []; this.orders = []; this.lim = null; this.mode = "many"; this.payload = null; this.returning = false;
  }
  select(cols = "*") { if (this.op === "select") this.cols = cols; else { this.returning = true; this.cols = cols; } return this; }
  insert(rows) { this.op = "insert"; this.payload = Array.isArray(rows) ? rows : [rows]; return this; }
  update(obj) { this.op = "update"; this.payload = obj; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c, v) { this.filters.push(["=", c, v]); return this; }
  neq(c, v) { this.filters.push(["<>", c, v]); return this; }
  gte(c, v) { this.filters.push([">=", c, v]); return this; }
  lte(c, v) { this.filters.push(["<=", c, v]); return this; }
  in(c, arr) { this.filters.push(["in", c, arr]); return this; }
  is(c, v) { this.filters.push(["is", c, v]); return this; }
  order(c, o = {}) { this.orders.push(`${ident(c)} ${o.ascending === false ? "DESC" : "ASC"}`); return this; }
  limit(n) { this.lim = n; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }

  cols$() {
    if (!this.cols || this.cols.trim() === "*") return "*";
    return this.cols.split(",").map((c) => ident(c.trim())).join(", ");
  }
  where$(params) {
    const parts = [];
    for (const [op, c, v] of this.filters) {
      if (op === "in") {
        if (!v.length) { parts.push("false"); continue; }
        params.push(v.map(toParam)); parts.push(`${ident(c)}::text = ANY($${params.length}::text[])`);
      } else if (op === "is") {
        parts.push(`${ident(c)} IS ${v === null ? "NULL" : v ? "TRUE" : "FALSE"}`);
      } else {
        params.push(toParam(v)); parts.push(`${ident(c)}::text ${op} $${params.length}::text`);
      }
    }
    return parts.length ? ` WHERE ${parts.join(" AND ")}` : "";
  }
  async run() {
    const params = [];
    let sql;
    if (this.op === "select") {
      sql = `SELECT ${this.cols$()} FROM public.${ident(this.table)}${this.where$(params)}`;
      if (this.orders.length) sql += ` ORDER BY ${this.orders.join(", ")}`;
      if (this.lim != null) sql += ` LIMIT ${Number(this.lim)}`;
    } else if (this.op === "insert") {
      const keys = [...new Set(this.payload.flatMap((r) => Object.keys(r)))];
      const values = this.payload.map((r) => `(${keys.map((k) => { params.push(toParam(r[k] === undefined ? null : r[k])); return `$${params.length}`; }).join(", ")})`);
      sql = `INSERT INTO public.${ident(this.table)} (${keys.map(ident).join(", ")}) VALUES ${values.join(", ")} RETURNING ${this.returning ? this.cols$() : "*"}`;
    } else if (this.op === "update") {
      const sets = Object.entries(this.payload).map(([k, v]) => { params.push(toParam(v)); return `${ident(k)} = $${params.length}`; });
      sql = `UPDATE public.${ident(this.table)} SET ${sets.join(", ")}${this.where$(params)} RETURNING ${this.returning ? this.cols$() : "*"}`;
    } else {
      sql = `DELETE FROM public.${ident(this.table)}${this.where$(params)} RETURNING *`;
    }
    try {
      const r = await this.client.query(sql, params);
      let data = this.op === "select" || this.returning ? r.rows : null;
      if (this.mode === "single") {
        if (r.rows.length !== 1) return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } };
        data = r.rows[0];
      } else if (this.mode === "maybe") {
        if (r.rows.length > 1) return { data: null, error: { message: "multiple rows", code: "PGRST116" } };
        data = r.rows[0] || null;
      }
      return { data, error: null };
    } catch (e) {
      return { data: null, error: pgErr(e) };
    }
  }
  then(res, rej) { return this.run().then(res, rej); }
}

/** Disk-backed bucket store (sandbox) with the same Map-like API the tests use. */
function diskBucket(root) {
  const full = (p) => join(root, p);
  return {
    has: (p) => existsSync(full(p)),
    get: (p) => (existsSync(full(p)) ? readFileSync(full(p)) : undefined),
    set: (p, buf) => { mkdirSync(dirname(full(p)), { recursive: true }); writeFileSync(full(p), buf); },
    delete: (p) => { if (existsSync(full(p))) unlinkSync(full(p)); },
    keys: () => { const out = []; const walk = (d, pre) => { if (!existsSync(d)) return; for (const f of readdirSync(d)) { const fp = join(d, f); if (statSync(fp).isDirectory()) walk(fp, `${pre}${f}/`); else out.push(`${pre}${f}`); } }; walk(root, ""); return out[Symbol.iterator](); },
    get size() { return [...this.keys()].length; },
  };
}

/**
 * @param {pg.Client|pg.Pool} client
 * @param {{ storageDir?: string, signedUrlBase?: string }} [opts]  storageDir → persist objects on disk (sandbox)
 */
export function makePgSupabase(client, opts = {}) {
  const buckets = new Map();
  const bucket = (b) => { if (!buckets.has(b)) buckets.set(b, opts.storageDir ? diskBucket(join(opts.storageDir, b)) : new Map()); return buckets.get(b); };
  const tokens = new Map(); // token → { id, email }
  const failures = { upload: 0 };
  return {
    _buckets: { get: (b) => bucket(b) },
    _tokens: tokens,
    _failures: failures,
    from: (t) => new Query(client, t),
    async rpc(fn, args = {}) {
      const keys = Object.keys(args);
      const sql = `SELECT public.${ident(fn)}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) AS r`;
      try {
        const r = await client.query(sql, keys.map((k) => toParam(args[k])));
        return { data: r.rows[0]?.r ?? null, error: null };
      } catch (e) {
        if (e.code === "42883") return { data: null, error: { message: `Could not find the function public.${fn}`, code: "PGRST202" } };
        return { data: null, error: pgErr(e) };
      }
    },
    storage: {
      from: (b) => ({
        async upload(path, buf, opts = {}) {
          if (failures.upload > 0) { failures.upload--; return { data: null, error: { message: "simulated storage failure" } }; }
          const m = bucket(b);
          if (m.has(path) && !opts.upsert) return { data: null, error: { message: "The resource already exists" } };
          m.set(path, Buffer.from(buf)); return { data: { path }, error: null };
        },
        async download(path) {
          const v = bucket(b).get(path);
          if (!v) return { data: null, error: { message: "Object not found" } };
          return { data: new Blob([v]), error: null };
        },
        async remove(paths) { for (const p of paths) bucket(b).delete(p); return { data: paths, error: null }; },
        async createSignedUrl(path, ttl) { return { data: { signedUrl: `${opts.signedUrlBase || "https://storage.test"}/${b}/${path}?ttl=${ttl}` }, error: null }; },
        async list() { return { data: [], error: null }; },
      }),
    },
    auth: {
      async getUser(token) {
        const u = tokens.get(token);
        return u ? { data: { user: u }, error: null } : { data: { user: null }, error: { message: "invalid" } };
      },
      admin: { async getUserById() { return { data: { user: null }, error: null }; } },
    },
  };
}
