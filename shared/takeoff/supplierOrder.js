// =============================================================================
// shared/takeoff/supplierOrder.js — the timber order laid out the way Blue Leaf's supplier take-offs are
// (Sam, 18 Nov 2026: "the way the information is laid out ... is how we usually organise a takeoff for a supplier").
//
// One group per MEMBER ROLE, in the supplier's own wording, one row per product inside it:
//
//   T&B PLATES
//     PINE 90x45 MGP10 P/M        12/6, 4/5.4, 9/4.8, 9/4.2, 8/3.6, 3/3.3, 6/3, 2/2.7, 8/2.4        255.90 LM
//     LVL SMART10 H2 90X45 P/M    7/8.4, 4/7.8, 6/7.2, 5/6.6                                        166.20 LM
//   STUDS
//     LVL STUD SMART10 H2 90X35 2.7M                                                                270 EA
//
// A cut list reads "count/length-in-metres", longest first, comma separated; the row's total is metres of STOCK bought
// (to 2 dp), unit LM ("P/M" = per metre). A precut stud (a stud bought at a standard stud length) is a
// fixed product: its row is a count, unit EA. Pure: no DB, no DOM, no clock. The order's identity is NOT touched — this
// only re-reads the frozen export lines (bucketKey, quantity, stock length) by the role each line was bought for.
// =============================================================================

/** Stamped on the frozen snapshot (snapshot.orderFormat) so an old export is never re-read as the new layout. */
export const SUPPLIER_ORDER_FORMAT = "supplier-takeoff@1";

/** Stock lengths a frame supplier sells as a fixed "precut stud" (Sam, 18 Nov 2026: 2.4, 2.7, 3.0, 3.3, 3.6, 4.2 m). A stud bought at one is an EA row. */
export const PRECUT_STUD_MM = Object.freeze([2400, 2700, 3000, 3300, 3600, 4200]);

/** Groups in the order Blue Leaf's supplier take-off lists them; anything else follows, alphabetically. */
const GROUPS = Object.freeze([
  ["plates", "T&B PLATES"], ["studs", "STUDS"], ["jambs", "JAMB STUDS"], ["junction", "JUNCT. BLK"],
  ["trimmers", "HD & SILL TR"], ["lintels", "LINTELS"], ["noggins", "NOGGINS"], ["bracing", "BRACING"], ["tempbr", "TEMP BR"], ["sbscrew", "SB SCREW"],
  // Floor frame (Sam, 18 Nov 2026): the floor roles are named "floor truss", "floor strongback", "floor beam", "floor trimmer" so they match here first
  // (the trimmer role is the stair beams, Sam 21 Nov 2026) and a floor beam never lands in LINTELS nor a floor trimmer in HD & SILL TR
  ["floortruss", "FLOOR TRUSSES"], ["floorsb", "STRONGBACKS"], ["floorbeam", "BEAMS"], ["floortrim", "STAIR BEAMS"], ["floorsheet", "FLOORING"], ["flooracc", "FLOORING ACCESSORIES"], ["floorfix", "FLOOR FIXINGS"],
]);
const OTHER_HEADING = { rafter: "RAFTERS", joist: "JOISTS", member: "MEMBERS", trim: "TRIM", other: "OTHER TIMBER" };

/**
 * The supplier group a member role belongs to. What a frame supplier expects: plates together (top and bottom, second top
 * plate), studs (cripples above and below openings are stud product cut from stud lengths, so they fold in here),
 * JAMB STUDS (kings and jacks), junction blocks, head and sill trimmers together, lintels, noggins.
 * @param {string} role  the demand role ("stud", "king", "jack", "below-sill", "head trimmer", "bottom-plate", "noggin" …)
 * @returns {{ key: string, heading: string, rank: number }}
 */
export function memberGroup(role) {
  const r = String(role || "other").toLowerCase().trim();
  const pick = (key) => ({ key, heading: GROUPS.find(([k]) => k === key)[1], rank: GROUPS.findIndex(([k]) => k === key) });
  if (/^floor /.test(r)) return pick(/accessor/.test(r) ? "flooracc" : /fixing/.test(r) ? "floorfix" : /truss/.test(r) ? "floortruss" : /sheet/.test(r) ? "floorsheet" : /strongback/.test(r) ? "floorsb" : /beam/.test(r) ? "floorbeam" : /trimmer/.test(r) ? "floortrim" : "floorsb");
  if (r === "tempbr") return pick("tempbr");
  if (r === "sbscrew") return pick("sbscrew");
  if (/hoop|brac|strap|tension/.test(r)) return pick("bracing");
  if (/plate/.test(r) || /^(bottom|top)\b/.test(r)) return pick("plates");
  if (/^(below-sill|above-head|cripple)/.test(r)) return pick("studs");
  if (/king|jack|jamb/.test(r)) return pick("jambs");
  if (/junct|corner|\bblk\b|block|packer/.test(r)) return pick("junction");
  if (/trimmer|^head$|^sill$/.test(r)) return pick("trimmers");
  if (/lintel|beam|header/.test(r)) return pick("lintels");
  if (/noggin/.test(r)) return pick("noggins");
  if (/^(stud|end stud|side stud|centre stud)/.test(r)) return pick("studs");
  const key = `other:${r}`;
  return { key, heading: OTHER_HEADING[r] || r.toUpperCase(), rank: GROUPS.length };
}

/** Metres as the supplier writes them: 6000 → "6", 5400 → "5.4", 2700 → "2.7". */
export const metres = (mm) => String(Number((Number(mm) / 1000).toFixed(3)));

/** "12/6, 4/5.4 …" — count/length in metres, longest first. */
export function formatCuts(cuts) {
  return [...cuts].sort((a, b) => b.lengthMm - a.lengthMm).map((c) => `${c.count}/${metres(c.lengthMm)}`).join(", ");
}

const isLvl = (p) => /\blvl/i.test(`${p?.grade || ""} ${p?.species || ""}`);

/**
 * The product as the supplier reads it: "PINE 90x45 MGP10 P/M", "LVL SMART10 H2 90X45 P/M", precut "LVL STUD SMART10 H2 90X35 2.7M".
 * Pine reads species, size, grade (the treatment only when it is not the usual H2); LVL reads grade, treatment, SIZE.
 * @param {{ section?:string|null, grade?:string|null, treatment?:string|null, species?:string|null }|null} product
 * @param {{ precutMm?: number|null }} [opts]  a precut stud's length (EA row); null = random lengths (P/M)
 */
export function productText(product, { precutMm = null } = {}) {
  const p = product || {};
  const sec = String(p.section || "").trim();
  const grade = String(p.grade || "").trim();
  const treat = String(p.treatment || "").trim();
  const tail = precutMm ? `${metres(precutMm)}M` : "P/M";
  if (isLvl(p)) {
    const g = (grade || "LVL").toUpperCase().replace(/^LVL\s+SMART\s*(\d+)/, "LVL SMART$1");
    const [first, ...rest] = g.split(/\s+/);
    return [first, precutMm ? "STUD" : null, ...rest, treat ? treat.toUpperCase() : null, sec ? sec.toUpperCase() : null, tail].filter(Boolean).join(" ");
  }
  const species = /\bMGP\b|^MGP/i.test(grade) || /pine/i.test(String(p.species || "")) ? "PINE" : String(p.species || "").trim().toUpperCase() || "TIMBER";
  const treatment = treat && !/^h2$/i.test(treat) ? treat.toUpperCase() : null;
  return [species, precutMm ? "STUD" : null, sec.toLowerCase() || null, grade.toUpperCase() || null, treatment, tail].filter(Boolean).join(" ");
}

/**
 * Split an ordered quantity over the roles the calculation bought the line for (largest remainder, so the parts always
 * add back to the ordered quantity — a line the user raised, lowered or spared is shared in proportion, never lost).
 * @param {Record<string, number>|null|undefined} roles  role → pieces (from the calculation)
 * @param {number} quantity  what is on the order
 * @returns {Array<[string, number]>} role → ordered pieces (zeros dropped)
 */
export function splitByRole(roles, quantity) {
  const entries = Object.entries(roles || {}).filter(([, n]) => n > 0).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const q = Math.max(0, Math.round(Number(quantity) || 0));
  if (!entries.length) return q ? [["other", q]] : [];
  const total = entries.reduce((a, [, n]) => a + n, 0);
  if (total === q) return entries;
  const parts = entries.map(([role, n]) => ({ role, raw: (q * n) / total }));
  let left = q;
  for (const x of parts) { x.n = Math.floor(x.raw + 1e-9); left -= x.n; }
  for (const x of [...parts].sort((a, b) => (b.raw - Math.floor(b.raw)) - (a.raw - Math.floor(a.raw)))) { if (left <= 0) break; x.n += 1; left -= 1; }
  return parts.filter((x) => x.n > 0).map((x) => [x.role, x.n]);
}

/**
 * The supplier take-off for a timber order.
 * @param {Array<{ lines: Array<{ unit:string, quantity:number, stockLengthMm:number|null, roles?:object, product?:object,
 *   description?:string, problem?:boolean }> }>} items  the snapshot's TIMBER items (one per job material)
 * @returns {Array<{ key:string, heading:string, rows: Array<{ product:string, unit:"LM"|"EA", cuts?:Array<{count:number,lengthMm:number}>,
 *   cutText?:string, totalLm?:number, quantity?:number, lengthMm?:number, problem?:boolean }>, totalLm:number, totalEa:number }>}
 */
export function buildSupplierGroups(items, manualLines = []) {
  const groups = new Map();
  for (const item of items || []) for (const l of item.lines || []) {
    // an LM quantity is metres, not a piece count: shared out in proportion, never rounded to whole metres
    const roleParts = l.unit === "lm"
      ? (() => { const e = Object.entries(l.roles || {}).filter(([, v]) => v > 0); const tot = e.reduce((a, [, v]) => a + v, 0); return e.length && tot > 0 ? e.map(([r, v]) => [r, (Number(l.quantity) * v) / tot]) : (Number(l.quantity) > 0 ? [["other", Number(l.quantity)]] : []); })()
      : splitByRole(l.roles, l.quantity);
    for (const [role, n] of roleParts) {
      const g = memberGroup(role);
      // hoop iron rolls, brace sheets and tensioners (Sam, 18 Nov 2026): the supplier's own wording, counted EA under BRACING
      if (l.hoop || l.bracing) {
        const name = (l.hoop || l.bracing).name;
        const grp = groups.get(g.key) || { key: g.key, heading: g.heading, rank: g.rank, rows: new Map() };
        groups.set(g.key, grp);
        const row = grp.rows.get(`ea|${name}`) || { product: name, unit: "EA", supplierEa: true, order: l.hoop ? 0 : /^TENSIONER/.test(name) ? 1 : 2, quantity: 0, problem: false, lvl: false, stock: null, cutsByLength: new Map(), lmDirect: 0 };
        grp.rows.set(`ea|${name}`, row);
        row.quantity += n; row.problem = row.problem || !!l.problem;
        continue;
      }
      // floor trusses (supplier-made): one EA row per length, "FLOOR TRUSS 4200 mm", counted each
      if (g.key === "floortruss") {
        const L = Number(l.stockLengthMm) || 0;
        const grp = groups.get(g.key) || { key: g.key, heading: g.heading, rank: g.rank, rows: new Map() };
        groups.set(g.key, grp);
        const rowKey = `ea|truss|${L}`;
        const row = grp.rows.get(rowKey) || { product: `FLOOR TRUSS ${L ? `${L} mm` : ""}`.trim(), unit: "EA", order: -L, quantity: 0, problem: false, lvl: false, stock: L || null, cutsByLength: new Map(), lmDirect: 0 };
        grp.rows.set(rowKey, row);
        row.quantity += n; row.problem = row.problem || !!l.problem;
        if (l.note && !grp.note) grp.note = l.note;   // Sam 21 Nov 2026: the wet-area set-down note rides on the truss heading
        continue;
      }
      // floor sheets (Sam, 18 Nov 2026): one EA row per sheet product, "STRUCTAFLOR 3600x800x19", counted in sheets
      if (g.key === "floorsheet") {
        const name = String(l.description || "FLOOR SHEET");
        const grp = groups.get(g.key) || { key: g.key, heading: g.heading, rank: g.rank, rows: new Map() };
        groups.set(g.key, grp);
        const row = grp.rows.get(`ea|sheet|${name}`) || { product: name, unit: "EA", order: 0, quantity: 0, problem: false, lvl: false, stock: null, cutsByLength: new Map(), lmDirect: 0 };
        grp.rows.set(`ea|sheet|${name}`, row);
        row.quantity += n; row.problem = row.problem || !!l.problem;
        continue;
      }
      // floor accessories (Sam, 19 Nov 2026): screws, adhesive, sealant, nails, backing rod: one row per product, its own unit (EA or LM) and a short basis note
      if (g.key === "flooracc" || g.key === "floorfix") {
        const name = String(l.description || "FLOOR ACCESSORY");
        const grp = groups.get(g.key) || { key: g.key, heading: g.heading, rank: g.rank, rows: new Map() };
        groups.set(g.key, grp);
        const row = grp.rows.get(`acc|${name}`) || { product: name, unit: l.acc === "lm" ? "LM" : "EA", accessory: true, note: l.note || null, order: 0, quantity: 0, problem: false, lvl: false, stock: null, cutsByLength: new Map(), lmDirect: 0 };
        grp.rows.set(`acc|${name}`, row);
        row.quantity += n; row.problem = row.problem || !!l.problem;
        continue;
      }
      const stud = g.key === "studs" && /^(stud|end stud|side stud|centre stud)/i.test(role);
      const lm = l.unit === "lm";
      const precutMm = stud && l.unit === "piece" && PRECUT_STUD_MM.includes(Number(l.stockLengthMm)) ? Number(l.stockLengthMm) : null;
      const product = productText(l.product, { precutMm }) || l.description || "Timber";
      const text = product;
      const grp = groups.get(g.key) || { key: g.key, heading: g.heading, rank: g.rank, rows: new Map() };
      groups.set(g.key, grp);
      const rowKey = `${text}|${precutMm ? "ea" : "lm"}`;
      const row = grp.rows.get(rowKey) || { product: text, unit: precutMm ? "EA" : "LM", cutsByLength: new Map(), quantity: 0, lmDirect: 0, problem: false, lvl: isLvl(l.product), stock: precutMm };
      grp.rows.set(rowKey, row);
      row.problem = row.problem || !!l.problem;
      if (precutMm) row.quantity += n;
      else if (lm) row.lmDirect += n;
      else if (Number(l.stockLengthMm) > 0) row.cutsByLength.set(Number(l.stockLengthMm), (row.cutsByLength.get(Number(l.stockLengthMm)) || 0) + n);
      else row.quantity += n;   // a piece with no stock length: counted and shown on the row ("3 with no stock length"), never dropped or given an invented length
    }
  }
  // hand-added lines (Sam, 18 Nov 2026): under their chosen heading, never merged with a calculated row
  for (const x of manualLines || []) {
    const g = x.heading === "other" ? { key: "other:manual", heading: "OTHER", rank: GROUPS.length + 1 } : memberGroup(x.heading === "hoop" ? "hoop iron" : x.heading === "jambs" ? "jamb" : x.heading === "trimmers" ? "trimmer" : x.heading === "lintels" ? "lintel" : x.heading === "junction" ? "junction" : x.heading);
    const grp = groups.get(g.key) || { key: g.key, heading: g.heading, rank: g.rank, rows: new Map() };
    groups.set(g.key, grp);
    grp.rows.set(`manual|${x.id}`, { manual: true, id: x.id, product: x.product, unit: x.unit === "EA" ? "EA" : "LM", quantity: x.quantity, cuts: x.cuts || [], problem: false, lvl: false, stock: null, cutsByLength: new Map(), lmDirect: 0 });
  }
  return [...groups.values()].sort((a, b) => a.rank - b.rank || (a.heading < b.heading ? -1 : a.heading > b.heading ? 1 : 0)).map((g) => {
    const rows = [...g.rows.values()].sort((a, b) => Number(!!a.manual) - Number(!!b.manual) || (a.order ?? 5) - (b.order ?? 5) || Number(a.lvl) - Number(b.lvl) || Number(a.unit === "EA") - Number(b.unit === "EA") || (a.product < b.product ? -1 : a.product > b.product ? 1 : 0)).map((r) => {
      if (r.manual) {
        if (r.unit === "EA") return { product: r.product, unit: "EA", quantity: r.quantity, lengthMm: null, problem: false, manual: true, id: r.id };
        const mm = r.cuts.reduce((a, c) => a + c.count * c.lengthMm, 0);
        return { product: r.product, unit: "LM", cuts: r.cuts, cutText: formatCuts(r.cuts), totalLm: Number((mm / 1000).toFixed(2)), problem: false, manual: true, id: r.id };
      }
      if (r.accessory) return r.unit === "LM" ? { product: r.product, unit: "LM", cuts: [], cutText: "", totalLm: Number(r.quantity.toFixed(2)), note: r.note, accessory: true, problem: r.problem } : { product: r.product, unit: "EA", quantity: r.quantity, lengthMm: null, note: r.note, accessory: true, problem: r.problem };
      // the supplier's own layout for bracing: count, then the same as EA with two decimals ("5 ... 5.00 EA")
      if (r.unit === "EA") return { product: r.product, unit: "EA", quantity: r.quantity, lengthMm: r.stock, problem: r.problem, ...(r.supplierEa ? { cutText: String(r.quantity), totalText: `${r.quantity.toFixed(2)} EA` } : {}) };
      const cuts = [...r.cutsByLength.entries()].map(([lengthMm, count]) => ({ count, lengthMm })).sort((a, b) => b.lengthMm - a.lengthMm);
      const mm = cuts.reduce((a, c) => a + c.count * c.lengthMm, 0);
      const totalLm = Number((mm / 1000 + r.lmDirect).toFixed(2));
      return { product: r.product, unit: "LM", cuts, cutText: [cuts.length ? formatCuts(cuts) : "", r.quantity ? `${r.quantity} with no stock length` : ""].filter(Boolean).join(", "), totalLm, ...(r.quantity ? { uncounted: r.quantity } : {}), problem: r.problem };
    });
    return { key: g.key, heading: g.heading, rows, ...(g.note ? { note: g.note } : {}),
      totalLm: Number(rows.reduce((a, r) => a + (r.unit === "LM" ? r.totalLm : 0), 0).toFixed(2)), totalEa: rows.reduce((a, r) => a + (r.unit === "EA" ? r.quantity : 0), 0) };
  });
}
