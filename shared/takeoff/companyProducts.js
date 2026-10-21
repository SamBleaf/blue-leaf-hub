/**
 * Aluminium setups saved as company products (Hub review HUB 024). Pure rules shared by the screens (TakeoffApp's
 * "Add to company products") and the server (takeoffService saveCompanyProduct).
 *
 * A company product is found by its NAME on other jobs, so a name must never end up holding a different angle: a new
 * version of a same-named product is only offered (and only accepted) for the same profile. A job's own kerf
 * confirmation never travels with an aluminium company product (each job confirms its kerf, Recording review 06), so
 * that alone is never a difference between a job's copy and the company version.
 */
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const num = (v) => (v == null || v === "" ? null : Number(v));
const low = (v) => String(v ?? "").trim().toLowerCase();

/** "50 × 50 × 3" for a complete angle profile, else null. */
export function profileSizeText(spec) {
  const p = spec?.profile || {};
  const [a, b, t] = [num(p.aMm), num(p.bMm), num(p.tMm)];
  return [a, b, t].every((v) => isNum(v) && v > 0) ? `${a} × ${b} × ${t}` : null;
}

/** Same angle: the same legs and thickness (and the same shape when both say one). */
export function sameAluminiumProfile(a, b) {
  const pa = a?.profile || {}, pb = b?.profile || {};
  if (pa.shape && pb.shape && pa.shape !== pb.shape) return false;
  return ["aMm", "bMm", "tMm"].every((k) => num(pa[k]) === num(pb[k]));
}

/** The active aluminium company product with this name (any letter case), never a company default; or null. */
export function findAluminiumProduct(presets, name) {
  const want = low(name);
  if (!want) return null;
  return (presets || []).find((p) => p && p.isActive !== false && p.spec?.family === "aluminium" && p.rules?.companyDefault !== true && low(p.name) === want) || null;
}

// what a company product never carries from a job (the server drops these on save)
const JOB_ONLY_RULES = ["carried", "defaultsFrom", "companyDefault"];
/** Values only, in a stable order: null, undefined and "" are "not set" (as the update review reads them). */
function flat(o, prefix, out) {
  if (Array.isArray(o)) { out[prefix] = JSON.stringify(o); return out; }
  if (o && typeof o === "object") { for (const k of Object.keys(o)) flat(o[k], prefix ? `${prefix}.${k}` : k, out); return out; }
  if (o !== undefined && o !== null && o !== "") out[prefix] = String(o);
  return out;
}
function content(m, ignoreKerfConfirmed) {
  const spec = { ...(m?.spec || {}) };
  if (ignoreKerfConfirmed) delete spec.kerfConfirmed;
  const rules = { ...(m?.rules || {}) };
  for (const k of JOB_ONLY_RULES) delete rules[k];
  return flat({ name: m?.name, methodKey: m?.methodKey, spec, rules, profile: m?.profile ?? null }, "", {});
}

/**
 * Is there anything in this newer company version that this job's copy doesn't already hold? False when it is the
 * same setup, e.g. the version this job just saved itself with Add to company products. For an aluminium copy the
 * job's own kerf confirmation is left out of the comparison (it never travels with a company product).
 */
export function companyVersionDiffers(material, preset) {
  if (!material || !preset) return false;
  const alu = material.spec?.family === "aluminium";
  const a = content(material, alu), b = content(preset, alu);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (a[k] !== b[k]) return true;
  return false;
}
