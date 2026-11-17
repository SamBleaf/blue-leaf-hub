// =============================================================================
// shared/takeoff/hoopIron.js — hoop iron (wall strapping) and the order's hand-added lines (Sam, 18 Nov 2026).
//
// Hoop iron: "every 1200mm you need 2 straps at 700mm long, or 0.7m per 600mm". Per wall, from the wall's length:
//   straps = 2 × ceil(length / 1200)        metres = straps × 0.7
// On by default for every wall of a Walls item, with a per-wall off switch (wall input noHoopIron). The product comes from the
// catalogue (HOOP_IRON_PRODUCTS: the seed is a DEFAULT to confirm with the supplier); an optional roll length turns metres into
// rolls (ceil(metres / roll)). It has its own HOOP IRON heading on the order (screen and PDF), counted in straps and metres.
//
// Hand-added lines ("+ Add member" / "+ Add bracing"): a heading, a product, and count/length entries ("4/3.6, 2/2.4", metres)
// or a plain number of EA. Marked "added by hand", kept with the order, never recalculated. Pure: no DB, no DOM, no clock.
// =============================================================================

/** Sam, 18 Nov 2026: 2 straps of 700 mm for every 1,200 mm of wall (0.7 m per 600 mm). */
export const HOOP_IRON_RULE = Object.freeze({ spanMm: 1200, strapsPerSpan: 2, strapMm: 700, source: "OWNER-2026-11-18" });

/**
 * The hoop iron products on offer (the catalogue). The seed is a default to confirm: Sam named no size or supplier code, so the
 * common 30 x 0.8 galvanised strap is offered and the order says it still needs confirming.
 */
export const HOOP_IRON_PRODUCTS = Object.freeze([
  Object.freeze({ id: "hoop-iron-30x0.8-galv", name: "Hoop iron strap 30 x 0.8 galvanised", widthMm: 30, thicknessMm: 0.8, finish: "galvanised", defaultToConfirm: true, source: "OWNER-2026-11-18 (default: confirm size with supplier)" }),
]);
export const DEFAULT_HOOP_IRON_PRODUCT_ID = HOOP_IRON_PRODUCTS[0].id;
export const hoopIronProduct = (id) => HOOP_IRON_PRODUCTS.find((p) => p.id === id) || HOOP_IRON_PRODUCTS[0];

/** Straps and metres for a wall of this length (mm). A wall with no length has none. */
export function hoopIronForWall(lengthMm) {
  const L = Number(lengthMm);
  if (!(L > 0)) return { straps: 0, metres: 0, strapMm: HOOP_IRON_RULE.strapMm };
  const straps = HOOP_IRON_RULE.strapsPerSpan * Math.ceil(L / HOOP_IRON_RULE.spanMm - 1e-9);
  return { straps, metres: Number(((straps * HOOP_IRON_RULE.strapMm) / 1000).toFixed(3)), strapMm: HOOP_IRON_RULE.strapMm };
}

/** Rolls for a metres total when the product has a roll length (else null). */
export const hoopIronRolls = (metres, rollM) => (Number(rollM) > 0 && Number(metres) > 0 ? Math.ceil(Number(metres) / Number(rollM) - 1e-9) : null);

// ── hand-added order lines ────────────────────────────────────────────────────────────────────────────────────

/** The headings a hand-added line can go under (key matches supplierOrder's groups); "bracing" is the one "+ Add bracing" uses. */
export const MANUAL_HEADINGS = Object.freeze([
  ["plates", "T&B plates"], ["studs", "Studs"], ["jambs", "Jamb studs"], ["junction", "Junction blocks"], ["trimmers", "Head & sill trimmers"],
  ["lintels", "Lintels"], ["noggins", "Noggins"], ["bracing", "Bracing"], ["hoop", "Hoop iron"], ["other", "Other"],
]);
/** What "+ Add bracing" offers as a quick pick for the product (any other name can be typed). */
export const BRACING_SUGGESTIONS = Object.freeze(["Sheet bracing", "Strap bracing", "Tension straps", "Let-in bracing", "Cross bracing"]);
export const MAX_MANUAL_LINES = 100;

/**
 * Read what was typed for a hand-added line. "4/3.6, 2/2.4" = 4 at 3.6 m and 2 at 2.4 m (lengths in metres, longest first on the
 * order); a plain number ("10" or "10 EA") = that many each. Nothing is guessed: anything else is refused in plain words.
 * @returns {{ ok:true, unit:"LM", cuts:Array<{count:number,lengthMm:number}> } | { ok:true, unit:"EA", quantity:number } | { ok:false, error:string }}
 */
export function parseManualEntry(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return { ok: false, error: "Enter the counts and lengths, like 4/3.6 (4 pieces at 3.6 m), or a number of EA." };
  const each = raw.match(/^(\d+)\s*(?:ea|each)?$/i);
  if (each) {
    const quantity = Number(each[1]);
    return quantity >= 1 && quantity <= 99999 ? { ok: true, unit: "EA", quantity } : { ok: false, error: "The number of EA must be 1 or more." };
  }
  const byLength = new Map();
  for (const tok of raw.split(/[,;\n]+/).map((t) => t.trim()).filter(Boolean)) {
    const m = tok.match(/^(\d+)\s*\/\s*(\d+(?:\.\d+)?)\s*m?$/i);
    if (!m) return { ok: false, error: `"${tok}" isn't a count/length. Write it like 4/3.6 (4 pieces at 3.6 m), or just a number of EA.` };
    const count = Number(m[1]);
    const lengthMm = Math.round(Number(m[2]) * 1000);
    if (!(count >= 1 && count <= 99999)) return { ok: false, error: `"${tok}": the count must be 1 or more.` };
    if (!(lengthMm >= 50 && lengthMm <= 30000)) return { ok: false, error: `"${tok}": the length must be between 0.05 m and 30 m (metres, like 3.6).` };
    byLength.set(lengthMm, (byLength.get(lengthMm) || 0) + count);
  }
  const cuts = [...byLength.entries()].map(([lengthMm, count]) => ({ count, lengthMm })).sort((a, b) => b.lengthMm - a.lengthMm);
  return cuts.length ? { ok: true, unit: "LM", cuts } : { ok: false, error: "Enter the counts and lengths, like 4/3.6, or a number of EA." };
}

// eslint-disable-next-line no-control-regex -- strip control characters from free text
const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

/**
 * Validate and normalise the hand-added lines of an order (the client sends them, the server re-checks them with this same function).
 * A line is { id, heading, product, entry }; the stored form also carries the parsed result so every reader agrees.
 * @returns {{ ok:true, lines:Array<object> } | { ok:false, error:string }}
 */
export function normaliseManualLines(list) {
  if (list == null) return { ok: true, lines: [] };
  if (!Array.isArray(list)) return { ok: false, error: "The added lines are invalid." };
  if (list.length > MAX_MANUAL_LINES) return { ok: false, error: `An order can have at most ${MAX_MANUAL_LINES} added lines.` };
  const keys = new Set(MANUAL_HEADINGS.map(([k]) => k));
  const ids = new Set();
  const lines = [];
  for (const x of list) {
    if (!x || typeof x !== "object") return { ok: false, error: "An added line is invalid." };
    const id = clean(x.id, 60);
    if (!id || ids.has(id)) return { ok: false, error: "An added line has no id, or two share one." };
    ids.add(id);
    if (!keys.has(x.heading)) return { ok: false, error: "Choose which heading the added line goes under." };
    const product = clean(x.product, 120);
    if (!product) return { ok: false, error: "Choose or type the product for the added line." };
    const entry = clean(x.entry, 300);
    const p = parseManualEntry(entry);
    if (!p.ok) return { ok: false, error: `${product}: ${p.error}` };
    lines.push({ id, heading: x.heading, product, entry, manual: true, unit: p.unit, ...(p.unit === "LM" ? { cuts: p.cuts } : { quantity: p.quantity }) });
  }
  return { ok: true, lines };
}
