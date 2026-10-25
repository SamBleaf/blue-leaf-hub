// =============================================================================
// ScheduleScreen — the schedule: Qty × finished length per flashing material/profile, plus (TC-R04) one group
// per timber / cladding / batten / aluminium material with quantity × unit × what is bought.
//
// Flashing: lines only group when the full spec, profile and finished length match; different lengths are never
// merged into LM. A continuous flashing run (13) shows its resulting pieces — one schedule row per finished
// length, never one per plan segment; it is split on the plan (red line), not with the lap form below.
// Any other long piece — measured run, manual or counted finished length — can be split explicitly (R04 F07).
// The split replaces the pieces it splits (for N identical pieces, choose how many); the rest stay whole.
// Remove split restores the originals. A split made against a source that later changes is flagged stale.
//
// Generic groups (06): family + spec line, the three independent statuses (quantity / installation / ordering),
// blocking problems and advisory notes, rows = quantity × unit × item (stock length / sheet size / SKU). Units are
// never added together. Random-length timber is LM and labelled "estimate — not a piece count". Tapping a row
// lists the measurements it came from; "Show on plan/wall" calls the optional onShowSource prop:
//   onShowSource({ materialId, measurementIds })  — the shell opens the plan / wall with those sources selected.
// "Ordered" counts come ONLY from recorded placed orders (exports don't count). With the optional `api` prop the
// screen reads them fresh (GET …/orders) on open, so a placement recorded a moment ago shows without a reload.
// =============================================================================
import { useEffect, useMemo, useState } from "react";
import { describeFamilySpec, describeSpec, evaluateSplit, fixesFor, isInstallationNote, polylineLengthMm, PROBLEM_TEXT } from "../../../shared/takeoff/index.js";
import { partial } from "./changeset.js";
import { Banner, Btn, NumberField, Sheet } from "./ui.jsx";
import { fmtLm, fmtMm, fmtRaw } from "./format.js";
import { keepFieldInView, useKeyboardInset } from "./measure/useKeyboardInset.js";

const FAMILY_LABEL = { timber: "Timber", cladding: "Cladding", aac: "AAC panels", foam: "Foam cladding", "timber-cladding": "Timber cladding", batten: "Battens / supports", aluminium: "Aluminium", accessory: "Accessories" };
// [singular, plural] — a unit is a word the builder orders in; never "mm length" for sheets, boxes or LM
const UNIT_WORDS = { piece: ["piece", "pieces"], sheet: ["sheet", "sheets"], bar: ["bar", "bars"], lm: ["LM", "LM"], m2: ["m²", "m²"], box: ["box", "boxes"], bag: ["bag", "bags"],
  roll: ["roll", "rolls"], pack: ["pack", "packs"], cartridge: ["cartridge", "cartridges"], ml: ["mL", "mL"], length: ["length", "lengths"] };
const unitWord = (u, n) => { const w = UNIT_WORDS[u] || [u || "item", u || "items"]; return n === 1 ? w[0] : w[1]; };
// wall-by-wall step 4: the cladding's automatic battens / H-flashing / foam tape, named wherever their lines are summed
const FOLLOWER_NAME = { battens: "Battens", hflashing: "H-flashing", tape: "Foam tape" };
const FOLLOWER_WORDS = { battens: ["batten", "battens"], hflashing: ["H-flashing length", "H-flashing lengths"], tape: ["roll of foam tape", "rolls of foam tape"] };
const spareWord = (l, n) => (FOLLOWER_WORDS[l.follower] ? FOLLOWER_WORDS[l.follower][n === 1 ? 0 : 1] : unitWord(l.unit, n));
/** "battens" | "hflashing" | "" — which automatic follower an allocator group cuts (its identity names it). */
const groupFollower = (g) => /"follower":"(battens|hflashing)"/.exec(String(g?.identityKey || ""))?.[1] || "";
const lowerFirst = (t) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t);
const qtyText = (n, u) => `${Number(n).toLocaleString("en-AU")} ${unitWord(u, n)}`;
/** "18 pieces · 4 sheets" — one entry per unit, never summed across units. */
function byUnitText(lines, qty = (l) => l.quantity) {
  const m = new Map();
  for (const l of lines) m.set(l.unit || "piece", (m.get(l.unit || "piece") || 0) + qty(l));
  const order = Object.keys(UNIT_WORDS);
  const rank = (u) => (order.includes(u) ? order.indexOf(u) : 99);
  return [...m.entries()].filter(([, n]) => n > 0).sort(([a], [b]) => rank(a) - rank(b)).map(([u, n]) => qtyText(n, u)).join(" · ");
}

// Three independent statuses (06). Wording never claims an installation check the engine didn't make.
const QUANTITY = { incomplete: ["Incomplete", "bad"], estimate: ["Estimate", "warn"], calculated: ["Calculated", "ok"], reviewed: ["Reviewed", "ok"] };
const INSTALLATION = { unspecified: ["Not specified", "muted"], "source-pending": ["Not checked by the app", "muted"], "supported-by-selected-rule": ["Supported by the selected rule", "ok"],
  "project-detail-supplied": ["Project detail supplied", "ok"], "out-of-scope": ["By others / out of scope", "muted"] };
const PROCUREMENT = { draft: ["Draft", "muted"], "missing-product": ["Product details missing", "bad"], "unavailable-stock": ["Stock unavailable", "bad"], stale: ["Stale — review", "bad"], ready: ["Ready to order", "ok"],
  "line-problem": ["Not ready — a line needs attention", "bad"], "needs-detail": ["Not ready — see what it needs", "bad"] };
const TONE = { ok: "border-emerald-200 bg-emerald-50 text-emerald-800", warn: "border-amber-200 bg-amber-50 text-amber-900", bad: "border-red-200 bg-red-50 text-red-700", muted: "border-slate-200 bg-slate-50 text-slate-700" };

/**
 * The engine's statuses for display, except Ordering is never shown as "Ready" while one of the material's purchase
 * lines still carries a blocking problem (e.g. its page was re-scaled, its plan superseded): the supplier export
 * refuses those lines, so the chip must not claim otherwise.
 */
function shownStatus(status, lines, blocked) {
  if (!status || status.procurement !== "ready") return status;
  if ((lines || []).some((l) => l.problems?.length)) return { ...status, procurement: "line-problem" };
  return blocked ? { ...status, procurement: "needs-detail" } : status;
}

/** Quantity / Installation / Ordering chips. Pass the material's purchase `lines` so Ordering is shown honestly. */
export function StatusChips({ status: raw, lines, blocked = false }) {
  const status = shownStatus(raw, lines, blocked);
  if (!status) return null;
  const chip = (key, label, map, v) => {
    const [text, tone] = map[v] || [v || "Unknown", "muted"];
    return <span key={key} data-status={key} data-value={v} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE[tone]}`}>{label}: {text}</span>;
  };
  return (
    <div className="flex flex-wrap gap-1" aria-label="Statuses">
      {chip("quantity", "Quantity", QUANTITY, status.quantity)}
      {chip("installation", "Installation", INSTALLATION, status.installation)}
      {chip("procurement", "Ordering", PROCUREMENT, status.procurement)}
    </div>
  );
}

// the accessory groups the setup screen records a scope for (rules.scope) — same keys and words as FamilySetup
const ACCESSORY_SCOPE_LABEL = { starter: "Starter / base trim", corners: "Corner trims", joints: "Joint / backing strips", openings: "Opening head / sill / jamb",
  membrane: "Membrane / wrap", tape: "Tape", sealant: "Sealant", fixings: "Fixings", mesh: "Mesh / render" };
const SCOPE_WORD = { include: "Included", "by-others": "By others", exclude: "Excluded", unresolved: "Not decided" };

/**
 * Accessory scope for the schedule and the order review (02 §6: omitted / by-others scopes are shown, never hidden).
 * The engine's recipe groups (result.layouts[].groups) come first; the per-group scope recorded on the setup screen
 * (rules.scope) fills in the rest. With no recipe every standard group is listed, and one that was never decided says
 * "Not decided" — unknown is not the same as excluded. Returns null for any other family.
 * @returns {null | { include: object[], "by-others": object[], exclude: object[], unresolved: object[] }}  items { id, label, reason }
 */
function accessoryScopes(mat, result) {
  if (mat?.spec?.family !== "accessory") return null;
  const recipe = Array.isArray(mat.rules?.recipe?.groups) ? mat.rules.recipe.groups : [];
  const ui = mat.rules?.scope && typeof mat.rules.scope === "object" ? mat.rules.scope : {};
  const seen = new Map();
  const put = (id, label, scope, reason) => { if (id != null && !seen.has(id)) seen.set(id, { id, label, scope: SCOPE_WORD[scope] ? scope : "unresolved", reason: reason || null }); };
  for (const lay of result?.layouts || []) for (const g of lay.groups || []) {
    put(g.id, recipe.find((x) => x.id === g.id)?.label || ACCESSORY_SCOPE_LABEL[g.id] || g.kind || g.id, g.scope, g.reason);
  }
  for (const g of recipe) put(g.id, g.label || ACCESSORY_SCOPE_LABEL[g.id] || g.kind || g.id, g.scope?.status ?? "include", g.scope?.reason);
  for (const [id, label] of Object.entries(ACCESSORY_SCOPE_LABEL)) if (!recipe.length || ui[id]) put(id, label, ui[id] || "unresolved", null);
  const out = { include: [], "by-others": [], exclude: [], unresolved: [] };
  for (const x of seen.values()) out[x.scope].push(x);
  return out;
}

/** "By others: Membrane / wrap (Wrap by the framer), Tape" — one line per scope that has groups. */
function AccessoryScopeList({ scopes, testId }) {
  if (!scopes) return null;
  const rows = ["by-others", "exclude", "unresolved", "include"].filter((k) => scopes[k].length);
  if (!rows.length) return null;
  return (
    <ul className="space-y-0.5 text-xs" data-testid={testId} data-accessory-scopes="">
      {rows.map((k) => (
        <li key={k} data-scope={k} className={k === "unresolved" ? "text-amber-900" : "text-ink"}>
          <span className="font-semibold">{SCOPE_WORD[k]}:</span> {scopes[k].map((x) => `${x.label}${x.reason ? ` (${x.reason})` : ""}`).join(", ")}
        </li>
      ))}
    </ul>
  );
}

/**
 * Order review block (02 §6): every accessory material's groups that are by others, excluded or not decided — so a
 * subset order never hides an omitted scope. Renders nothing when there is none.
 */
export function AccessoryScopeReview({ materials, results }) {
  const rows = (materials || []).map((m) => {
    const s = accessoryScopes(m, results?.[m.id]);
    return s && (s["by-others"].length || s.exclude.length || s.unresolved.length) ? { mat: m, scopes: { ...s, include: [] } } : null;
  }).filter(Boolean);
  if (!rows.length) return null;
  return (
    <div className="space-y-1 rounded-lg border border-hairline bg-page px-3 py-2 text-xs text-ink" data-testid="accessory-scope-review">
      <p className="font-medium">Accessories not supplied on this order:</p>
      {rows.map(({ mat, scopes }) => (
        <div key={mat.id} data-scope-material={mat.id}>
          <p className="font-medium">{mat.name}</p>
          <AccessoryScopeList scopes={scopes} />
        </div>
      ))}
      <p className="text-[11px] text-muted">&ldquo;Not decided&rdquo; is not the same as excluded — decide it in the accessory setup before relying on this order.</p>
    </div>
  );
}

const KIND_LABEL = { wall: "Wall", opening: "Opening", distribution: "Distribution run", member: "Member line", polyline: "Flashing run", run: "Straight run",
  manual: "Entered lengths", count: "Counted pieces", offcut: "Offcut", area: "Area" };
const runRef = (id) => `R-${String(id).slice(0, 8)}`; // same reference the site appendix prints

/** Bucket key → its leading JSON (generic: { identity, method }; flashing: the spec key) + the "|"-separated rest. */
function parseBucketKey(key) {
  const s = String(key || "");
  if (s[0] !== "{") return null;
  let depth = 0, str = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (str) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === "\"") str = false; continue; }
    if (ch === "\"") str = true;
    else if (ch === "{" || ch === "[") depth++;
    else if ((ch === "}" || ch === "]") && --depth === 0) {
      try { return { head: JSON.parse(s.slice(0, i + 1)), rest: s.slice(i + 2).split("|") }; } catch { return null; }
    }
  }
  return null;
}
const upper = (t) => (t ? String(t).toUpperCase() : null);
/**
 * A placed quantity whose bucket is no longer in the takeoff (its product, stock or measurements changed): what it
 * was, in plain words — what was BOUGHT, never the material's current name or colour (a renamed / recoloured material
 * would describe something else). A purchase line's frozen item description is used when the orders were read; a
 * flashing bucket key carries the colour / BMT that was placed. Plus the order it was placed on. A reconciliation
 * hint only — the placed order is never rewritten.
 */
function describeSurplus(s, placed) {
  const base = describeBucket(s.bucketKey);
  const p = placed?.get(s.bucketKey);
  if (!p) return base;
  return { unit: p.unit || base.unit, text: [p.item || base.text, p.refs.length ? `placed on ${p.refs.join(", ")}` : null].filter(Boolean).join(" · ") };
}
function describeBucket(bucketKey) {
  const k = parseBucketKey(bucketKey);
  const id = k?.head?.identity;
  if (id) {
    // keys carry the material id after the material key (one bucket per material) — older keys don't
    const rest = /^(piece|sheet|bar|lm|m2|box|bag|roll|pack|cartridge|ml)$/.test(k.rest[0]) ? k.rest : k.rest.slice(1);
    const [unit, a, b] = rest;
    const what = id.family === "timber" ? [id.section?.depthMm && id.section?.widthMm ? `${id.section.depthMm} × ${id.section.widthMm}` : null, upper(id.grade), id.species, upper(id.treatment)].filter(Boolean).join(" ")
      : id.family === "aluminium" ? `${id.profile?.shape || "profile"} ${id.profile?.aMm} × ${id.profile?.bMm} × ${id.profile?.tMm}`
        : [id.manufacturer, id.name, id.sku ? `SKU ${id.sku}` : null].filter(Boolean).join(" ") || "Material";
    const size = unit === "sheet" && Number(a) ? ` — ${fmtMm(Number(a))}${Number(b) ? ` × ${fmtMm(Number(b))}` : ""} mm` : (unit === "piece" || unit === "bar") && Number(a) ? ` — ${fmtMm(Number(a))} mm length` : "";
    return { unit: unit || "piece", text: `${what}${size}` };
  }
  const spec = k?.head?.spec;
  const len = Number(k?.rest?.[0]);
  const colour = spec?.colour && spec.colour !== "n/a" ? spec.colour.replace(/^./, (c) => c.toUpperCase()) : null;
  return { unit: "piece", text: [`${Number.isFinite(len) ? `${fmtMm(len)} mm ` : ""}flashing`, k?.head?.item || null, colour, spec?.bmt ? `${spec.bmt} BMT` : null].filter(Boolean).join(" · ") };
}

/** The allocator's NEW stock pieces that one purchase line buys (same material, unit, stock length and identity). */
function barsForLine(l, alloc) {
  if (!alloc || (l.unit !== "piece" && l.unit !== "bar")) return [];
  const out = [];
  for (const g of alloc.groups || []) for (const b of g.bars || []) {
    if (b.source === "new" && `${l.materialKey}|${l.jobMaterialIds?.[0]}|${l.unit}|${b.stockLengthMm}|${g.identityKey}` === l.bucketKey) out.push(b);
  }
  return out;
}

/** Needed cuts → selected stock for one purchase line (02 §6). One cut per length is summarised; shared bars are listed. */
function CutList({ bars, unit }) {
  if (!bars.length) return null;
  if (bars.every((b) => b.cuts.length === 1)) {
    const rows = new Map();
    for (const b of bars) rows.set(b.cuts[0].lengthMm, (rows.get(b.cuts[0].lengthMm) || 0) + 1);
    return (
      <p className="text-ink" data-cut-list="">
        <span className="font-semibold">Cuts:</span> {[...rows].sort((a, b) => b[0] - a[0]).map(([L, n]) => `${n} × ${fmtRaw(L)} mm`).join(" · ")} — one cut from each {fmtMm(bars[0].stockLengthMm)} mm {unitWord(unit, 1)}
      </p>
    );
  }
  const shown = bars.slice(0, 12);
  return (
    <div className="text-ink" data-cut-list="">
      <p className="font-semibold">Cut plan (planned — not cut yet):</p>
      <ul className="space-y-0.5">
        {shown.map((b, i) => (
          <li key={b.id || i}>{unitWord(unit, 1).replace(/^./, (c) => c.toUpperCase())} {i + 1}: {b.cuts.map((c) => `${c.label ? `${c.label} ` : ""}${fmtRaw(c.lengthMm)}`).join(" + ")} mm → left over {fmtRaw(b.residualMm)} mm{b.residualUsable === true ? " (keep)" : b.residualUsable === false ? " (scrap)" : ""}</li>
        ))}
      </ul>
      {bars.length > shown.length && <p className="text-muted">+ {bars.length - shown.length} more — every cut is in the site appendix.</p>}
    </div>
  );
}

/** Plain name / kind / size for one source measurement (display only). */
function describeMeasurement(m, measById, calById) {
  const x = m.inputs || {};
  const mm = (n) => (Number.isFinite(n) ? fmtMm(Math.round(n)) : "?");
  const traced = () => {
    const cal = calById.get(m.calibrationId);
    return cal && Array.isArray(m.points) && m.points.length >= 2 ? `${mm(polylineLengthMm(cal, m.points))} mm` : "no plan scale";
  };
  if (m.kind === "wall") {
    const k = x.kind || "rect";
    const w = x.widthMm ? mm(x.widthMm) : Array.isArray(m.points) && m.points.length >= 2 ? traced().replace(" mm", "") : "?";
    const detail = k === "rake" ? `${w} mm long · ${mm(x.startHeightMm)} → ${mm(x.endHeightMm)} mm high`
      : k === "gable" ? `${w} mm long · eaves ${mm(x.eavesHeightMm)} / apex ${mm(x.apexHeightMm)} mm`
        : k === "polygon" ? "traced elevation outline" : `${w} × ${x.heightMm ? mm(x.heightMm) : "?"} mm`;
    return { name: x.name || m.label || "Wall", kind: "Wall", detail, onPlan: !!m.documentId };
  }
  if (m.kind === "opening") {
    const kind = x.type === "door" ? "Door" : x.type === "window" ? "Window" : "Opening";
    const parent = m.parentId ? measById.get(m.parentId) : null;
    return { name: x.label || kind, kind, detail: `${mm(x.widthMm)} × ${mm(x.heightMm)} mm${parent ? ` in ${parent.inputs?.name || parent.label || "wall"}` : ""}`, onPlan: !!m.documentId };
  }
  if (m.kind === "manual") return { name: m.label || "Entered lengths", kind: "Entered", detail: `${m.quantity} × ${mm(m.finishedLengthMm)} mm`, onPlan: false };
  if (m.kind === "count") return { name: m.label || "Counted pieces", kind: "Count", detail: `${(m.points || []).length} × ${mm(m.finishedLengthMm)} mm`, onPlan: !!m.documentId };
  if (m.kind === "offcut") return { name: x.label || "Offcut", kind: "Offcut", detail: `${mm(x.lengthMm)} mm${x.location ? ` at ${x.location}` : ""}`, onPlan: false };
  const kind = KIND_LABEL[m.kind] || "Measurement";
  const extra = m.kind === "member" ? (x.mode === "true" ? " · true length" : " · projected") : m.kind === "polyline" && x.splitsMm?.length ? ` · ${x.splitsMm.length} split(s)` : "";
  return { name: m.label || (m.kind === "polyline" || m.kind === "run" ? `${kind} ${runRef(m.id)}` : kind), kind, detail: `${traced()}${extra}`, onPlan: true };
}

// onFix (HUB 029): a blocker row opens its fix (TakeoffApp openFix); without it the needs read as text, as before
export default function ScheduleScreen({ ws, api, onBack, onShowSource, section = null, onFix = null }) {
  const view = ws.view, computed = ws.computed;
  const [open, setOpen] = useState(null);
  const [splitFor, setSplitFor] = useState(null);
  const kbInset = useKeyboardInset(); // the split sheet rises above an on-screen keyboard (02 phone quality)
  // split edits apply at once (auto-apply); the curved arrows undo / redo them like the measure screen's history
  const [hist, setHist] = useState({ past: [], future: [] });
  const record = (op) => { ws.edit(op.redo); setHist((h) => ({ past: [...h.past, op].slice(-50), future: [] })); };
  const undo = () => { const op = hist.past.at(-1); if (!op) return; ws.edit(op.undo); setHist((h) => ({ past: h.past.slice(0, -1), future: [op, ...h.future] })); };
  const redo = () => { const op = hist.future[0]; if (!op) return; ws.edit(op.redo); setHist((h) => ({ past: [...h.past, op], future: h.future.slice(1) })); };
  /** Replace one contribution's split (null removes it) as one undoable step. */
  const setSplit = (raw, split) => record({ redo: partial({ contributions: [{ ...raw, split }] }), undo: partial({ contributions: [{ ...raw, split: raw.split ?? null }] }) });
  const mats = useMemo(() => new Map(view.materials.map((m) => [m.id, m])), [view.materials]);
  const contribs = useMemo(() => new Map((computed?.contributions || []).map((c) => [c.contributionId, c])), [computed]);
  const measById = useMemo(() => new Map((view.measurements || []).map((m) => [m.id, m])), [view.measurements]);
  const calById = useMemo(() => new Map((view.calibrations || []).map((c) => [c.id, c])), [view.calibrations]);
  // placed quantities: fresh from the orders endpoint when the shell passes `api`, until the next save brings newer ones
  const wsId = view.workspace?.id;
  const [fresh, setFresh] = useState(null);
  useEffect(() => {
    if (!api?.orders || !wsId) return undefined;
    let stop = false;
    const server = ws.server;
    api.orders(wsId).then((r) => { if (!stop && r.ok && Array.isArray(r.data?.orderStatus)) setFresh({ server, list: r.data.orderStatus, orders: r.data.orders || [] }); });
    return () => { stop = true; };
    // only on open — later saves return their own order status
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, wsId]);
  const statusList = useMemo(() => (fresh && fresh.server === ws.server ? fresh.list : ws.server?.orderStatus || []), [fresh, ws.server]);
  const status = useMemo(() => new Map(statusList.map((s) => [s.bucketKey, s])), [statusList]);
  // HUB 002: the Flashings section lists flashing lengths only; Timber and cladding lists its materials only
  const groups = useMemo(() => {
    const g = new Map();
    if (section === "timber_cladding") return [];
    for (const l of computed?.scheduleLines || []) {
      if (l.generic) continue;
      const m = mats.get(l.jobMaterialIds[0]);
      const name = m?.name || "Material";
      let spec = ""; try { spec = m ? describeSpec(m.spec, m.profile).line : ""; } catch { /* legacy */ }
      if (!g.has(l.specKey)) g.set(l.specKey, { name, spec, lines: [] });
      g.get(l.specKey).lines.push(l);
    }
    return [...g.values()];
  }, [computed, mats, section]);
  // one group per TC-R04 material, in the job's material order — shown even with no lines (its problems explain why)
  const generic = useMemo(() => {
    if (section === "flashings") return [];
    const results = computed?.materialResults || {};
    const byMat = new Map();
    for (const l of computed?.scheduleLines || []) {
      if (!l.generic) continue;
      const id = l.jobMaterialIds[0];
      if (!byMat.has(id)) byMat.set(id, []);
      byMat.get(id).push(l);
    }
    return view.materials.filter((m) => results[m.id] || byMat.has(m.id)).map((m) => ({ mat: m, result: results[m.id] || null, lines: byMat.get(m.id) || [] }));
  }, [computed, view.materials, section]);
  const surplus = statusList.filter((s) => s.reconcile);
  // what each placed bucket was, from the placed order lines (only when the orders were read on open)
  const placed = useMemo(() => {
    if (!fresh?.orders) return null;
    const m = new Map();
    for (const o of fresh.orders) {
      if (!(o.placements || []).some((p) => p.status === "placed")) continue;
      for (const l of o.lines || []) {
        const e = m.get(l.bucketKey) || { unit: l.unit || "piece", item: l.item?.description || null, refs: [] };
        if (!e.refs.includes(o.orderRef)) e.refs.push(o.orderRef);
        m.set(l.bucketKey, e);
      }
    }
    return m;
  }, [fresh]);

  /** The measurements a line came from: the contributions it is attributed to, the material's inputs that own no
   *  purchase units themselves (e.g. the member line that sets a rafter length) and openings inside a source wall. */
  const sourcesOf = (l) => {
    const ids = [];
    const add = (id) => { if (id && !ids.includes(id) && measById.has(id)) ids.push(id); };
    for (const cid of l.contributionIds) add(contribs.get(cid)?.measurementId);
    if (l.generic) {
      for (const c of computed?.contributions || []) if (c.generic && l.jobMaterialIds.includes(c.jobMaterialId) && !c.pieces.length) add(c.measurementId);
      for (const m of view.measurements || []) if (m.kind === "opening" && ids.includes(m.parentId)) add(m.id);
    }
    return ids.map((id) => ({ id, ...describeMeasurement(measById.get(id), measById, calById) }));
  };
  const showButton = (l, sources) => {
    if (!onShowSource || !sources.length) return null;
    // the label says where the shell goes: a wall (even one traced on the plan) and its openings open the wall's
    // elevation; any other plan-traced line opens the plan. Typed-in lengths / offcuts have nowhere to show.
    const wallish = (s) => ["Wall", "Window", "Door", "Opening"].includes(s.kind);
    const planLine = sources.some((s) => s.onPlan && s.kind !== "Wall");
    if (!planLine && !sources.some(wallish)) return null;
    const al = mats.get(l.jobMaterialIds[0])?.spec?.family === "aluminium";
    return <Btn kind="secondary" onClick={() => onShowSource({ materialId: l.jobMaterialIds[0], measurementIds: sources.map((s) => s.id), tab: l.follower === "battens" ? "supports" : null })}>{planLine ? "Show on plan" : al ? "Show openings" : "Show on wall"}</Btn>;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {onBack && <Btn kind="ghost" onClick={onBack}>‹ Back</Btn>}
        {/* flashing-only jobs keep the R04 "Length schedule"; with timber / sheets / bars / LM it is more than lengths */}
        <h2 className="flex-1 text-base font-semibold text-ink">{generic.length ? (groups.length ? "Flashing lengths and materials" : "Materials to order") : "Length schedule"}</h2>
        {(hist.past.length > 0 || hist.future.length > 0) && (
          <>
            <Btn kind="ghost" onClick={undo} disabled={!hist.past.length} aria-label="Undo">↶</Btn>
            <Btn kind="ghost" onClick={redo} disabled={!hist.future.length} aria-label="Redo">↷</Btn>
          </>
        )}
        {groups.length > 0 && <span className="text-sm text-muted">{fmtLm(computed?.totalLm)} LM {generic.length ? "flashing" : "total"}</span>}
      </div>
      {computed?.error && <Banner tone="error">The schedule couldn&apos;t be worked out: {computed.error}</Banner>}
      {!groups.length && !generic.length && <p className="py-6 text-center text-sm text-muted">No lengths yet — measure runs or walls, count pieces or add manual lengths.</p>}
      {surplus.length > 0 && (
        <section className="rounded-card border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900" data-testid="placed-surplus" aria-label="Placed, no longer in the takeoff">
          <p className="text-sm font-semibold">Placed, but no longer in the takeoff</p>
          <p className="text-xs">A measurement, product or stock changed after these were ordered. The placed orders are unchanged — check whether these can still be used before ordering more.</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {surplus.map((s) => { const d = describeSurplus(s, placed); return <li key={s.bucketKey}><span className="font-semibold">{qtyText(s.ordered, d.unit)}</span> · {d.text}</li>; })}
          </ul>
        </section>
      )}
      {groups.map((g) => (
        <section key={g.name + g.lines[0].specKey} className="rounded-card border border-hairline bg-white">
          <h3 className="border-b border-hairline px-3 py-2 text-sm font-semibold text-ink">{g.name}{g.spec && <span className="block text-[11px] font-normal text-muted">{g.spec}</span>}</h3>
          <ul className="divide-y divide-hairline">
            {g.lines.map((l) => {
              const st = status.get(l.bucketKey);
              const isOpen = open === l.bucketKey;
              return (
                <li key={l.bucketKey}>
                  <button type="button" onClick={() => setOpen(isOpen ? null : l.bucketKey)} aria-expanded={isOpen}
                    className="flex min-h-[48px] w-full items-center gap-3 px-3 py-2 text-left">
                    <span className="w-16 shrink-0 text-sm font-semibold text-ink">{l.quantity} ×</span>
                    <span className="flex-1 text-sm text-ink">{fmtMm(l.finishedLengthMm)} mm
                      {l.ceilingExceeded ? <span className="ml-2 rounded bg-red-50 px-1.5 text-[11px] font-semibold text-red-700">over ceiling</span>
                        : l.handlingFlag ? <span className="ml-2 rounded bg-amber-50 px-1.5 text-[11px] font-semibold text-amber-800">long piece</span> : null}
                      {l.problems.length > 0 && !l.ceilingExceeded && <span className="ml-2 rounded bg-red-50 px-1.5 text-[11px] font-semibold text-red-700">needs attention</span>}
                    </span>
                    {st && <span className="shrink-0 text-[11px] text-muted">{st.ordered ? `${st.ordered} ordered · ${st.remaining} left${st.surplus ? ` · ${st.surplus} surplus` : ""}` : "not ordered"}</span>}
                    <span aria-hidden="true" className="text-muted">{isOpen ? "▾" : "▸"}</span>
                  </button>
                  {isOpen && (
                    <div className="space-y-1 bg-page px-3 py-2 text-xs">
                      {l.problems.map((p) => <p key={p} className="text-red-700">{PROBLEM_TEXT[p] || p}</p>)}
                      {l.contributionIds.map((cid) => {
                        const c = contribs.get(cid);
                        if (!c) return null;
                        // a continuous run is split on the plan (red line / split handle), never with the lap form
                        const canSplit = !!c.result && !c.path && ws.capabilities?.edit;
                        return (
                          <div key={cid} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-2 py-1.5">
                            {c.path ? <PathPieces path={c.path} runId={c.measurementId} highlightMm={l.finishedLengthMm} />
                              : <span className="flex-1 text-ink">{c.split ? `${c.result.quantity > 1 ? `${c.split.originals || 1} of ${c.result.quantity} × ` : ""}${fmtMm(c.result.finishedLengthMm)} mm split into ${c.split.children.map((x) => fmtMm(x.finishedLengthMm)).join(" + ")} (laps ${c.split.laps.join(", ")} mm)${c.result.quantity - (c.split.originals || 1) > 0 ? ` · ${c.result.quantity - (c.split.originals || 1)} kept whole` : ""}${c.split.stale ? " — source changed, review" : ""}` : c.explanation}</span>}
                            {canSplit && <Btn kind="ghost" onClick={() => setSplitFor(cid)}>{c.split ? (c.split.stale ? "Review split" : "Edit split") : "Split"}</Btn>}
                            {c.split && ws.capabilities?.edit && (
                              <Btn kind="ghost" onClick={() => { const raw = view.contributions.find((x) => x.id === cid); if (raw) setSplit(raw, null); }}>Remove split</Btn>
                            )}
                          </div>
                        );
                      })}
                      {showButton(l, sourcesOf(l))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="px-3 py-2 text-right text-xs text-muted">{g.lines.reduce((a, l) => a + l.quantity, 0)} pieces · {fmtLm(g.lines.reduce((a, l) => a + l.finishedLengthMm * l.quantity, 0) / 1000)} LM</p>
        </section>
      ))}
      {generic.map((g) => (
        <GenericGroup key={g.mat.id} {...g} status={status} open={open} setOpen={setOpen} sourcesOf={sourcesOf} showButton={showButton} measById={measById}
          fixRows={onFix && ws.computed ? fixesFor(ws.computed, ws.view, { materialId: g.mat.id }) : null} onFix={onFix} />
      ))}
      {splitFor && (() => {
        const c = contribs.get(splitFor);
        const raw = view.contributions.find((x) => x.id === splitFor);
        const mat = mats.get(raw?.jobMaterialId);
        if (!c || !raw) return null;
        // the sheet sits ABOVE an on-screen keyboard (padding = covered height) and never taller than what is left of
        // the screen: in phone landscape its title and fields stay reachable (the wrapper scrolls), and a focused
        // field scrolls clear of the keyboard
        return (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-end bg-black/40 lg:justify-center" role="dialog" aria-modal="true" aria-label="Split piece"
            style={{ paddingBottom: kbInset, paddingTop: "env(safe-area-inset-top)" }} onFocus={keepFieldInView}>
            <div className="max-h-full w-full max-w-lg overflow-y-auto overscroll-contain" data-split-sheet=""><Sheet className="landscape:!w-full" title={c.kind === "run" ? "Split this run" : "Split these pieces"} onClose={() => setSplitFor(null)}>
              <SplitForm required={c.result.finishedLengthMm} rules={mat?.rules} initial={raw.split} quantity={c.result.quantity} measured={c.kind === "run"}
                onApply={(sp) => { setSplit(raw, { ...sp, sourceFinishedMm: c.result.finishedLengthMm, version: (raw.split?.version || 0) + 1 }); setSplitFor(null); }}
                onCancel={() => setSplitFor(null)} />
            </Sheet></div>
          </div>
        );
      })()}
    </div>
  );
}

/** Continuous flashing run: the ordered pieces it resolves to (one per explicit split), never its plan legs. */
function PathPieces({ path, runId, highlightMm }) {
  const corners = path.cornersMm || [];
  return (
    <div className="min-w-0 flex-1 space-y-0.5 text-ink" data-path-run={runId}>
      <p>Run {runRef(runId)}: {fmtMm(Math.round(path.tightTotalMm))} mm tight along the path{corners.length ? ` · ${corners.length} corner(s) at ${corners.map((c) => fmtMm(Math.round(c))).join(", ")} mm — cut/folded on site, no extra pieces` : ""}</p>
      <ul className="space-y-0.5">
        {(path.pieces || []).map((p, i) => (
          <li key={i} className={p.orderMm === highlightMm ? "font-semibold" : ""}>
            Piece {i + 1}: {fmtMm(Math.round(p.fromMm))} → {fmtMm(Math.round(p.toMm))} mm, tight {fmtMm(Math.round(p.tightMm))} → order {fmtMm(p.orderMm)} mm
            {p.overMax && <span className="ml-1 rounded bg-red-50 px-1 font-semibold text-red-700">over the maximum — split it on the plan</span>}
            {!p.overMax && p.handlingFlag && <span className="ml-1 rounded bg-amber-50 px-1 font-semibold text-amber-800">long piece</span>}
          </li>
        ))}
      </ul>
      {(path.pieces || []).length > 1 && <p className="text-muted">Each piece has its own allowance; joints are site joints you chose on the plan.</p>}
    </div>
  );
}

/** One TC-R04 material: family, spec, statuses, problems / notes, rows by unit, sources on tap. */
// allocator findings the material result doesn't already carry: blocking ones (a cut plan that failed its own check)
// and these advisories; "unavailable" is already listed per piece and "not proven" is in the plan label
const ALLOC_ADVISORY = new Set(["allocation_stock_stepped", "allocation_offcut_invalid", "allocation_identity_split"]);
function allocationProblems(alloc, known) {
  if (!alloc) return [];
  const seen = new Set(known.map((p) => p.message));
  const out = [];
  for (const p of [...(alloc.problems || []), ...(alloc.groups || []).flatMap((g) => g.problems || [])]) {
    if (p.code === "allocation_unavailable" || p.code === "allocation_not_proven" || seen.has(p.message)) continue;
    if (p.blocking === false && !ALLOC_ADVISORY.has(p.code)) continue;
    seen.add(p.message);
    out.push(p);
  }
  return out;
}

function GenericGroup({ mat, result, lines, status, open, setOpen, sourcesOf, showButton, measById, fixRows = null, onFix = null }) {
  const spec = describeFamilySpec(mat.spec);
  const fam = FAMILY_LABEL[mat.spec?.family] || "Material";
  const alloc = result?.allocation;
  const problems = [...(result?.problems || []), ...allocationProblems(alloc, result?.problems || [])];
  const blocking = problems.filter((p) => p.blocking !== false);
  // HUB 029: installation notes are one plain line, never listed as notes to act on
  const installNotes = problems.filter((p) => isInstallationNote(p));
  const advisory = problems.filter((p) => p.blocking === false && !isInstallationNote(p));
  const st = result?.status || null;
  const verified = st && ["supported-by-selected-rule", "project-detail-supplied"].includes(st.installation);
  const plans = [...new Set((alloc?.groups || []).filter((g) => g.planLabel).map((g) => (groupFollower(g) ? `${FOLLOWER_NAME[groupFollower(g)]}: ${lowerFirst(g.planLabel)}` : g.planLabel)))];
  const offcutBars = (alloc?.groups || []).flatMap((g) => (g.bars || []).filter((b) => b.source === "offcut"));
  const walls = (result?.layouts || []).filter((x) => x.areas);
  // shared-bar cutting (aluminium, trims with cut allocation): what the bars carry, and what is lost / left over (11)
  const shared = (alloc?.groups || []).filter((g) => g.mode !== "one-per-piece" && g.totals);
  // one "Cuts need" line for the material's own pieces and one each for its automatic battens and H-flashing
  const cutLines = [...new Set(shared.map(groupFollower))].sort().map((k) => {
    const gs = shared.filter((g) => groupFollower(g) === k);
    const sum = (f) => gs.reduce((a, g) => a + (f(g.totals) || 0), 0);
    return { k, sum, keepKnown: gs.every((g) => g.totals.reusableRemainderMm != null) };
  });
  const explain = [...(result?.explain || []), ...(alloc?.groups || []).flatMap((g) => g.explain || [])];
  const scopes = accessoryScopes(mat, result);
  const spareRate = Number(mat.spec?.spareRate) > 0 ? Number(mat.spec.spareRate) : 0;
  const spareLm = (result?.layouts || []).reduce((a, x) => a + (Number(x.spareLm) > 0 ? Number(x.spareLm) : 0), 0);
  return (
    <section className="rounded-card border border-hairline bg-white" data-generic-group={mat.id} aria-label={mat.name}>
      <div className="space-y-1.5 border-b border-hairline px-3 py-2">
        <h3 className="text-sm font-semibold text-ink">{mat.name}
          <span className="block text-[11px] font-normal text-muted">{fam} · {spec.line}</span>
          {/* sizing provenance (timber) / cutting policy (aluminium) — never an engineering claim */}
          {(mat.spec?.family === "timber" || mat.spec?.family === "aluminium") && spec.installation && <span className="block text-[11px] font-normal text-muted" data-provenance="">{spec.installation}</span>}
        </h3>
        <StatusChips status={st} lines={lines} blocked={blocking.length > 0} />
        {st && !verified && <p className="text-[11px] text-muted">Quantities only — installation details are not verified by the app.</p>}
        {blocking.length > 0 && (fixRows?.length ? (
          // HUB 029: each thing it needs is one tap to its fix
          <div className="space-y-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700" role="alert">
            <p className="font-semibold">Needs before ordering:</p>
            {fixRows.map((r) => (
              <button key={r.key} type="button" data-fix-key={r.key} onClick={() => onFix(r)}
                className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-md border border-red-200 bg-white px-2 text-left text-[13px] text-ink focus-ring">
                <span><b>{r.subject}</b>: {r.action}</span><span aria-hidden="true" className="text-primary">›</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700" role="alert">
            <p className="font-semibold">Needs before ordering:</p>
            <ul className="ml-4 list-disc">{blocking.map((p, i) => <li key={`${p.code}-${i}`}>{p.message || PROBLEM_TEXT[p.code] || p.code}</li>)}</ul>
          </div>
        ))}
        {advisory.length > 0 && (
          <ul className="space-y-0.5 text-xs text-amber-900">{advisory.map((p, i) => <li key={`${p.code}-${i}`}>Note: {p.message}</li>)}</ul>
        )}
        {installNotes.length > 0 && <p className="text-[11px] text-muted" data-install-note="">Installation isn&apos;t checked by the app.</p>}
        {scopes && (
          <div className="rounded-lg bg-page px-2 py-1">
            <p className="text-[11px] font-semibold text-muted">Accessory scope</p>
            <AccessoryScopeList scopes={scopes} />
          </div>
        )}
        {walls.map((w, i) => {
          // where the elevation came from, said plainly (the same wording as the wall editor) — never "surveyed"
          const m = measById.get(w.wallId);
          const traced = Array.isArray(m?.points) && m.points.length >= 2;
          const source = m?.inputs?.kind === "polygon" && traced ? "Traced elevation outline" : traced ? "Derived from plan + entered heights" : "Entered length and heights";
          return (
            <p key={`${w.wallId}-${i}`} className="text-[11px] text-muted" data-wall-area={w.wallId}>
              {w.wallLabel}: net {w.areas.netM2?.toFixed(2)} m² (gross {w.areas.grossM2?.toFixed(2)} − openings {w.areas.openingM2?.toFixed(2)}) · {source}
            </p>
          );
        })}
        {/* added spares (02 §6): only what the engine actually added — a recorded spare % it doesn't apply is said so */}
        {spareLm > 0 ? <p className="text-[11px] text-ink" data-spares="">Spare included: {spareLm.toFixed(2)} LM ({fmtRaw(spareRate)}%) — already in the LM above.</p>
          : spareRate > 0 && lines.some((l) => l.spareQuantity > 0) ? (
            <p className="text-[11px] text-ink" data-spares="">Spares added: {lines.filter((l) => l.spareQuantity > 0).map((l) => `${l.spareQuantity} ${spareWord(l, l.spareQuantity)}`).join(", ")} ({fmtRaw(spareRate)}%) — included in the quantities above, on top of the layout.</p>
          ) : null}
        {plans.length > 0 && <p className="text-[11px] text-muted">{plans.join(" · ")}</p>}
        {cutLines.map(({ k, sum, keepKnown }) => (
          <p key={k || "own"} className="text-[11px] text-muted" data-alloc-summary={k}>
            {k ? `${FOLLOWER_NAME[k]}: cuts` : "Cuts"} need {fmtMm(Math.round(sum((t) => t.requiredLengthMm)))} mm · saw loss {fmtMm(Math.round(sum((t) => t.cutLossMm) + sum((t) => t.trimLossMm)))} mm
            {" "}· left over {fmtMm(Math.round(sum((t) => t.remainderMm)))} mm{keepKnown ? ` (keep ${fmtMm(Math.round(sum((t) => t.reusableRemainderMm)))} · scrap ${fmtMm(Math.round(sum((t) => t.scrapMm)))})` : ""} — planned, not cut yet
          </p>
        ))}
        {offcutBars.length > 0 && (
          <div className="text-[11px] text-ink" data-offcuts-used="">
            <p className="font-semibold">Existing offcuts used — not re-ordered:</p>
            <ul className="ml-4 list-disc">
              {offcutBars.map((b, i) => <li key={b.id || i}>{b.offcutLabel || "Offcut"} {fmtMm(b.stockLengthMm)} mm → {b.cuts.map((c) => `${c.label ? `${c.label} ` : ""}${fmtRaw(c.lengthMm)}`).join(" + ")} mm</li>)}
            </ul>
          </div>
        )}
      </div>
      {!lines.length && <p className="px-3 py-3 text-sm text-muted">Nothing to order yet{blocking.length ? " — see what it needs above" : ""}.</p>}
      <ul className="divide-y divide-hairline">
        {lines.map((l) => {
          const s = status.get(l.bucketKey);
          const isOpen = open === l.bucketKey;
          const lm = l.unit === "lm";
          const note = l.item?.note && !/^Estimate — total LM/.test(l.item.note) ? l.item.note : null;
          return (
            <li key={l.bucketKey} data-line-unit={l.unit}>
              <button type="button" onClick={() => setOpen(isOpen ? null : l.bucketKey)} aria-expanded={isOpen}
                className={`flex min-h-[48px] w-full items-start gap-3 px-3 py-2 text-left ${isOpen ? "bg-primary/5" : ""}`}>
                <span className="w-20 shrink-0 text-sm font-semibold text-ink">{qtyText(l.quantity, l.unit)}</span>
                <span className="min-w-0 flex-1 break-words text-sm text-ink">{l.item?.description || unitWord(l.unit, 2)}
                  {lm && <span className="ml-1 inline-block rounded bg-amber-50 px-1.5 text-[11px] font-semibold text-amber-800">estimate — not a piece count</span>}
                  {l.problems.length > 0 && <span className="ml-1 inline-block rounded bg-red-50 px-1.5 text-[11px] font-semibold text-red-700">needs attention</span>}
                  <span className="block text-[11px] text-muted">{s ? (s.ordered ? `${qtyText(s.ordered, l.unit)} ordered · ${s.remaining} left${s.surplus ? ` · ${s.surplus} surplus` : ""}` : "not ordered") : ""}</span>
                </span>
                <span aria-hidden="true" className="pt-0.5 text-muted">{isOpen ? "▾" : "▸"}</span>
              </button>
              {isOpen && (() => {
                const sources = sourcesOf(l);
                return (
                  <div className="space-y-1.5 bg-page px-3 py-2 text-xs" data-sources-for={l.bucketKey}>
                    {note && <p className="text-ink">{note}</p>}
                    {lm && <p className="text-amber-900">Random lengths: this is total linear metres. The supplier picks the lengths — no piece count is claimed.
                      {" "}Minimum board length, end-joint and stagger rules aren&apos;t set in the app — agree them with the supplier and installer and put them on the order notes.</p>}
                    <CutList bars={barsForLine(l, alloc)} unit={l.unit === "bar" ? "bar" : "length"} />
                    {l.problems.filter((p) => PROBLEM_TEXT[p]).map((p) => <p key={p} className="text-red-700">{PROBLEM_TEXT[p]}</p>)}
                    <p className="font-semibold text-ink">{sources.length ? "Comes from" : "No measurement is linked to this line."}</p>
                    {sources.length > 0 && (
                      <ul className="space-y-1">
                        {sources.map((x) => (
                          <li key={x.id} className="rounded-lg bg-white px-2 py-1.5 text-ink" data-source-id={x.id}>
                            <span className="font-medium">{x.name}</span> <span className="text-muted">— {x.kind} · {x.detail}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {showButton(l, sources)}
                  </div>
                );
              })()}
            </li>
          );
        })}
      </ul>
      {lines.length > 0 && <p className="px-3 py-2 text-right text-xs text-muted">{byUnitText(lines)}</p>}
      {explain.length > 0 && (
        <details className="border-t border-hairline px-3">
          <summary className="flex min-h-[44px] cursor-pointer items-center text-xs font-medium text-primary">How this was worked out</summary>
          <ul className="ml-4 list-disc pb-2 text-[11px] text-muted">{explain.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </details>
      )}
    </section>
  );
}

/** Explicit split: child lengths + a lap per joint; coverage must reach the run's finished length. */
export function SplitForm({ required, rules, initial, onApply, onCancel, quantity = 1, measured = true }) {
  const [originals, setOriginals] = useState(Math.min(initial?.originals || 1, quantity));
  const [pieces, setPieces] = useState(initial?.pieces?.length ? initial.pieces : [null, null]);
  const [laps, setLaps] = useState(initial?.laps?.length ? initial.laps : [null]);
  const ready = pieces.every((p) => p > 0) && laps.every((l) => l != null && l >= 0);
  let ev = null, err = null;
  if (ready) { try { ev = evaluateSplit({ requiredFinishedMm: required, pieces, laps }, rules); } catch (e) { err = e.message; } }
  const setP = (i) => (n) => setPieces((a) => a.map((x, j) => (j === i ? n : x)));
  const setL = (i) => (n) => setLaps((a) => a.map((x, j) => (j === i ? n : x)));
  return (
    <div className="space-y-2 text-sm">
      <p className="text-muted">{measured
        ? <>This run needs <b className="text-ink">{fmtMm(required)} mm</b> of coverage (its allowance is already included — pieces don&apos;t get another one).</>
        : <>Each piece is a finished <b className="text-ink">{fmtMm(required)} mm</b> length — the split pieces must cover it (no allowance is added).</>} Enter each piece and the lap at each joint.</p>
      {quantity > 1 && (
        <NumberField label={`How many of the ${quantity} pieces to split`} unit="pcs" integer min={1} max={quantity} value={originals} onCommit={(n) => setOriginals(n)}
          help={`${quantity - originals} stay whole at ${fmtMm(required)} mm.`} />
      )}
      {pieces.map((p, i) => (
        <div key={i} className="space-y-2">
          <NumberField label={`Piece ${i + 1} length`} value={p} onCommit={setP(i)} />
          {i < pieces.length - 1 && <NumberField label={`Lap at joint ${i + 1}`} value={laps[i]} min={0} onCommit={setL(i)} help="Ask the supplier or use the product's installation instructions — there is no default lap." />}
        </div>
      ))}
      <div className="flex gap-2">
        <Btn onClick={() => { setPieces((a) => [...a, null]); setLaps((a) => [...a, null]); }} disabled={pieces.length >= 20}>Add piece</Btn>
        <Btn onClick={() => { setPieces((a) => a.slice(0, -1)); setLaps((a) => a.slice(0, -1)); }} disabled={pieces.length <= 2}>Remove piece</Btn>
      </div>
      {err && <Banner tone="error">{err}</Banner>}
      {ev && (
        <Banner tone={ev.valid ? "ok" : "error"}>
          Pieces {ev.children.map((c) => `${fmtMm(c.finishedLengthMm)}${c.handlingFlag ? " (long)" : ""}`).join(" + ")} − laps {ev.laps.join(" + ")} = coverage <b>{fmtMm(ev.coverageMm)} mm</b>
          {ev.valid ? (ev.overcoverageMm > 0 ? ` (${fmtMm(ev.overcoverageMm)} mm over)` : " — exact") : `. ${ev.problems.join(" ")}`}
        </Banner>
      )}
      <div className="flex gap-2">
        <Btn onClick={onCancel}>Cancel</Btn>
        <Btn kind="primary" className="flex-1" disabled={!ev?.valid} onClick={() => onApply({ pieces: ev.children.map((c) => c.finishedLengthMm), laps: ev.laps, originals })}>Apply split</Btn>
      </div>
    </div>
  );
}
