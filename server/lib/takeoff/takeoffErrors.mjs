// =============================================================================
// takeoffErrors.mjs — map takeoff service/DB failures to plain-English API errors.
// RPCs raise 'TAKEOFF_<KIND>: detail'; everything else goes through translateDbError.
// Raw Postgres strings never reach the browser.
// =============================================================================
import { err, translateDbError } from "../apiResponse.mjs";
import { TakeoffValidationError } from "../../../shared/takeoff/index.js";

export class TakeoffHttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || null;
  }
}

/** Missing migration 206 objects (table/function/column) → feature unavailable. */
export function isTakeoffSchemaMissing(e) {
  const m = String(e?.message || e || "");
  return e?.code === "42P01" || e?.code === "42883" || e?.code === "PGRST202" || e?.code === "PGRST205"
    || /takeoff_[a-z_]+.*(does not exist|schema cache)|Could not find the function public\.takeoff_|relation "public\.takeoff_/i.test(m)
    || /column .*(revision_label|content_sha256|archived_at).* does not exist/i.test(m);
}

const KIND = {
  CONFLICT: [409, "CONFLICT"],
  SCOPE: [403, "FORBIDDEN"],
  NOT_FOUND: [404, "NOT_FOUND"],
  INVALID: [400, "INVALID"],
  LIMIT: [400, "LIMIT"],
  IMMUTABLE: [409, "IMMUTABLE"],
};

const SCOPE_TEXT = "That item isn't part of this job's takeoff.";

/** Convert any error into { status, message, code }. */
export function describeTakeoffError(e) {
  if (e instanceof TakeoffHttpError) return { status: e.status, message: e.message, code: e.code };
  if (e instanceof TakeoffValidationError) return { status: 400, message: e.message, code: "INVALID" };
  if (isTakeoffSchemaMissing(e)) return { status: 503, message: "Takeoffs need database migration 206 before they can be used.", code: "MIGRATION_PENDING" };
  const msg = String(e?.message || "");
  const m = /TAKEOFF_([A-Z_]+):\s*(.*)$/s.exec(msg);
  if (m && KIND[m[1]]) {
    const [status, code] = KIND[m[1]];
    let text = m[2].trim();
    if (m[1] === "SCOPE") text = /plan|calibration/.test(text) ? `${text.charAt(0).toUpperCase()}${text.slice(1)}.` : SCOPE_TEXT;
    if (m[1] === "CONFLICT" && /revision \d+ expected/.test(text)) text = "Someone else saved this takeoff first. Your changes are kept on this device — reload to compare.";
    if (m[1] === "NOT_FOUND") text = "That takeoff item was not found.";
    if (m[1] === "IMMUTABLE") text = "That record is frozen and can't be changed.";
    return { status, message: text.charAt(0).toUpperCase() + text.slice(1), code };
  }
  if (e?.code === "23505") return { status: 409, message: "That was already saved.", code: "DUPLICATE" };
  return { status: 500, message: translateDbError(e), code: null };
}

export function sendTakeoffError(res, e, logTag = "[takeoff]") {
  const d = describeTakeoffError(e);
  if (d.status >= 500 && d.code !== "MIGRATION_PENDING") console.error(logTag, e?.message || e);
  return err(res, d.status, d.message, d.code || undefined);
}
