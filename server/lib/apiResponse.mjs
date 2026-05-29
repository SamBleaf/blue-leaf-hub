/**
 * apiResponse.mjs — Blue Leaf Hub server response standard.
 *
 * EVERY route must use these helpers. Never call res.json() directly.
 * See CLAUDE.md § Standards for the full law.
 */

// ─── Response helpers ────────────────────────────────────────────────────────

/**
 * Send a successful JSON response.
 * @param {import('express').Response} res
 * @param {object} [data] — merged into { ok: true, ...data }
 */
export function ok(res, data = {}) {
  return res.json({ ok: true, ...data });
}

/**
 * Send an error JSON response.
 * @param {import('express').Response} res
 * @param {number} status — HTTP status code
 * @param {string} message — plain-English message for the client (never raw DB errors)
 * @param {string} [code] — optional machine-readable error code e.g. "NOT_FOUND"
 */
export function err(res, status, message, code) {
  return res.status(status).json({
    ok: false,
    error: message,
    ...(code ? { code } : {}),
  });
}

// ─── camelCase conversion ─────────────────────────────────────────────────────

/**
 * Convert a snake_case string to camelCase.
 */
export function toCamel(str) {
  return String(str).replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Recursively convert all snake_case keys in an object to camelCase.
 * Handles nested objects and arrays.
 */
export function rowToCamel(row) {
  if (!row || typeof row !== "object") return row;
  if (Array.isArray(row)) return row.map(rowToCamel);
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const key = toCamel(k);
    out[key] = v && typeof v === "object" ? rowToCamel(v) : v;
  }
  return out;
}

/**
 * Convert an array of DB rows to camelCase.
 */
export function rowsToCamel(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(rowToCamel);
}

// ─── Pagination ───────────────────────────────────────────────────────────────

/**
 * Apply standard pagination to a Supabase query.
 * Reads `limit` and `offset` from query params, caps limit at 200.
 *
 * Usage:
 *   const { data, error, count } = await paginate(
 *     sb.from("leads").select("*", { count: "exact" }),
 *     req.query
 *   );
 */
export function paginate(query, params) {
  const limit = Math.min(Number(params?.limit) || 50, 200);
  const offset = Number(params?.offset) || 0;
  return query.range(offset, offset + limit - 1);
}

// ─── Error translation ────────────────────────────────────────────────────────

/**
 * Translate a Supabase/Postgres error into a plain-English client message.
 * Never expose raw constraint names or DB internals.
 */
export function translateDbError(error) {
  if (!error) return "An unexpected error occurred.";
  const msg = String(error.message || error.details || error);

  // Unique constraint violations
  if (msg.includes("duplicate key") || msg.includes("unique constraint")) {
    if (msg.includes("email")) return "An account with this email already exists.";
    if (msg.includes("phone")) return "A record with this phone number already exists.";
    if (msg.includes("claim_number")) return "A claim with this number already exists on this job.";
    if (msg.includes("variation_number")) return "A variation with this number already exists on this job.";
    return "A duplicate record already exists.";
  }

  // FK violations
  if (msg.includes("foreign key") || msg.includes("violates foreign key")) {
    return "This record references data that no longer exists.";
  }

  // Not null violations
  if (msg.includes("not-null constraint") || msg.includes("null value in column")) {
    const col = msg.match(/column "([^"]+)"/)?.[1];
    return col
      ? `The field "${toCamel(col)}" is required.`
      : "A required field is missing.";
  }

  // Check constraint violations
  if (msg.includes("check constraint") || msg.includes("violates check")) {
    return "One or more values are not valid for this field.";
  }

  // Generic fallback — return a safe message, log the real one
  return "A database error occurred. Please try again.";
}
