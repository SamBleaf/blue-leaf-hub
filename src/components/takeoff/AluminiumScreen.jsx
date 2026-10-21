// =============================================================================
// AluminiumScreen — openings → three-edge window cuts → shared 6500 bar cutting sheet (TC-R04 11, 02 §6).
// Props contract (fixed):
//   ws          useTakeoffWorkspace() result (view, computed, edit, capabilities, status)
//   materialId  the aluminium job material
//   onSetup(material)  open the material's setup card (profile, kerf, window preset); onClose()
//   onMeasure()  OPTIONAL — open the plan to measure straight runs for this material (hidden when absent, e.g. no plan)
//
// Builder workflow (11):
//   Measure      HUB 026: "Measure runs on the plan" is the FIRST thing on the screen (above the summary), so it is
//                reached without scrolling past the typed-size forms. It opens the plan's Run tool for this material
//                (tap each corner; the Page chip changes page; a page with no scale is refused). Each straight leg
//                is its own cut, never joined. Typing sizes (openings by size, straight cuts) stays below.
//   Openings     add by numbers — the opening exists as soon as its width and height are valid (no Add step,
//                like the wall editor); "How many of this size" then adds copies inside the same undo step —
//                or tick openings that already exist on walls (role "opening" contribution; the
//                wall keeps owning the opening). Each opening shows its NOMINAL size and its FINISHED cuts
//                separately. The cuts shown are the engine's own demands (materialResults.demands), so
//                what is listed is exactly what is allocated.
//   Extra cuts   manual measurements (finished length × quantity, role "primary"), added once the length is valid.
//   Cutting      materialResults[materialId].allocation: buy N × stock, required length, cut loss, reusable
//                remainder, scrap, objective, "minimum proven" vs "best plan found — minimum not proven",
//                lower bound. Each bar expands to its ordered cuts and its PLANNED remainder (never stock).
//                Tapping a cut highlights its opening. Pieces longer than stock block — never split.
//   Offcuts      only pieces the builder records (kind "offcut", inputs.materialId) are stock; they can be
//                marked consumed. A cutting plan never creates inventory. Each piece is stamped with the
//                profile + finish it was cut from (inputs.identityKey = stockIdentityKey(spec)); after the
//                material's finish or section changes the engine stops offering it and the list says why.
//   Ordered      bars already on PLACED orders (ws.server.orderStatus) are shown against the plan — still to
//                order / covered / surplus. Frozen orders are never changed here.
// Every valid edit auto-applies (ws.edit) with session undo/redo; invalid numbers stay in their field. A number still
// being typed is committed on Back / setup / app hide, never dropped. Undo clears what is still being typed first (an
// unfinished entry, an invalid number, a number typed but not yet applied) — never an earlier edit (wall-editor rule).
// View-only users (capabilities.edit false) see the same plan and exports, with no edit controls.
// =============================================================================
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { describeFamilySpec, normaliseFamilySpec } from "../../../shared/takeoff/index.js";
import { genericMaterialKey } from "../../../shared/takeoff/engine/dispatch.js";
import { stockIdentityKey } from "../../../shared/takeoff/engine/families.js";
import { newId } from "../../lib/takeoffApi.js";
import { partial } from "./changeset.js";
import { Banner, Btn, FocusedWindow, NumberField, SaveChip, SaveProblem, TextField } from "./ui.jsx";
import { fmtMm } from "./format.js";

const mm = (n) => `${fmtMm(n)} mm`;
const EDGE = { "jamb-left": "Left jamb", "jamb-right": "Right jamb", sill: "Bottom", head: "Head", run: "Measured run", cut: "Straight cut" };
const EDGE_ORDER = { "jamb-left": 0, "jamb-right": 1, sill: 2, head: 3 };
const QTY_TEXT = { incomplete: "incomplete", estimate: "estimate", calculated: "calculated", reviewed: "reviewed" };
const INSTALL_TEXT = { unspecified: "not specified — not checked", "source-pending": "source pending — not checked", "supported-by-selected-rule": "supported by the selected rule", "project-detail-supplied": "project detail supplied", "out-of-scope": "out of scope" };
const PROC_TEXT = { draft: "draft — not ready to order", "missing-product": "product details missing", "unavailable-stock": "unavailable stock", stale: "stale", ready: "ready to order" };
const TONE = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warn: "border-amber-200 bg-amber-50 text-amber-900",
  bad: "border-red-200 bg-red-50 text-red-700",
  neutral: "border-hairline bg-page text-ink",
};
const plural = (k, one, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const matRec = (m) => ({ id: m.id, name: m.name, methodKey: m.methodKey, methodVersion: m.methodVersion || 1, spec: m.spec, rules: m.rules || {}, profile: m.profile || null, fromPresetId: m.fromPresetId || null, fromPresetRevision: m.fromPresetRevision || null });
const openingLabel = (m) => m?.inputs?.label || `Opening ${String(m?.id || "").slice(0, 4)}`;
const wallName = (w) => w?.inputs?.name || w?.label || "Wall";
const isDoor = (m) => m?.inputs?.type === "door";
/** Long unbroken labels (codes, no spaces) must wrap inside a 375 px phone, never push controls off screen. */
const WRAP = "[overflow-wrap:anywhere]";
/** A tap on a button can reach its click handler while a field is still focused (iOS keeps focus on the field):
 *  blur it first so the field's own blur commit lands before the form reads its values. */
const commitFocusedField = () => { const el = document.activeElement; if (el instanceof HTMLElement && el.matches("input, textarea")) el.blur(); };
const escapeRe = (t) => String(t ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Next free automatic opening number (W01, W02 …) after every W-number label already used. */
const nextOpeningNo = (labels) => labels.reduce((a, l) => { const m = /^W(\d+)$/i.exec(l || ""); return m ? Math.max(a, Number(m[1])) : a; }, 0) + 1;
const autoOpeningLabel = (k) => `W${String(k).padStart(2, "0")}`;
/** Labels of an addition, short enough for one line: "W01, W02" or "W01 … W12 (12)". */
const labelsText = (labels) => (labels.length <= 3 ? labels.join(", ") : `${labels[0]} … ${labels[labels.length - 1]} (${labels.length})`);

/** Why a piece can't be cut, from the allocator's reason — never "longer than stock" when it isn't. */
function unavailableText(u, n) {
  const stock = n?.stockLengthMm;
  if (u?.reason === "end-policy") {
    // the piece is no longer than the stock: the end trim (or a saw cut the bar's far end can't spare) is what stops it
    const trimmed = stock != null && n?.endTrimMm > 0 && u.lengthMm > stock - n.endTrimMm + 1e-6;
    const cause = trimmed ? `the ${mm(n.endTrimMm)} end trim` : "the saw cut its far end needs";
    return { short: trimmed ? "can't cut — end trim" : "can't cut — saw cut", long: `Fits the ${stock ? mm(stock) : "stock"} length only without ${cause}. Not split: change the end trim or detail, or choose a longer stock.` };
  }
  if (u?.reason === "offcuts-exhausted") return { short: "can't cut — offcut already used", long: u.message || "Longer than new stock; the offcut that could hold it is used by a longer piece." };
  if (u?.reason === "exceeds-stock" || u?.reason === "no-available-length" || !u?.message) {
    return { short: "can't cut — longer than stock", long: `Longer than the ${stock ? mm(stock) : "stock"} length — can't be cut, never joined.` };
  }
  return { short: "can't cut from stock", long: u.message };
}

/** True when every blocking problem is only the unconfirmed saw kerf (the plan is then an estimate). */
function onlyKerfMissing(problems) {
  const kerf = (p) => p.code === "kerf_unconfirmed" || (p.code === "material_incomplete" && /kerf/i.test(p.message || ""));
  const blocking = (problems || []).filter((p) => p.blocking !== false);
  return { all: blocking.length > 0 && blocking.every(kerf), material: blocking.filter((p) => p.code === "material_incomplete").every(kerf) };
}

/** Everything the screen shows, derived from the optimistic view + the engine result (pure). */
function derive(view, materialId, result) {
  const meas = new Map((view?.measurements || []).filter((m) => !m.archived).map((m) => [m.id, m]));
  const contribs = (view?.contributions || []).filter((c) => !c.archived);
  const items = contribs.filter((c) => c.jobMaterialId === materialId).map((c) => ({ c, m: meas.get(c.measurementId) })).filter((x) => x.m);
  const walls = new Map([...meas.values()].filter((m) => m.kind === "wall").map((m) => [m.id, m]));
  const openings = items.filter((x) => x.m.kind === "opening");
  const included = new Map(openings.map((x) => [x.m.id, x.c]));
  const demands = result?.demands || [];
  const demandById = new Map(demands.map((x) => [x.id, x]));
  const demandsByMeas = new Map();
  for (const x of demands) {
    const id = x.sourceRefs?.[0]?.measurementId;
    if (id) demandsByMeas.set(id, [...(demandsByMeas.get(id) || []), x]);
  }
  for (const list of demandsByMeas.values()) list.sort((a, b) => (EDGE_ORDER[a.role] ?? 9) - (EDGE_ORDER[b.role] ?? 9));
  const allocation = result?.allocation || null;
  const cutAt = new Map();       // demandId → { barId, barName, seq }
  const unavailable = new Map(); // demandId → allocator reason
  const offcutBar = new Map();   // offcut measurement id → bar
  let newNo = 0;
  const sheets = (allocation?.groups || []).map((g) => {
    const bars = (g.bars || []).map((b) => {
      const name = b.source === "offcut" ? `Offcut ${b.offcutLabel || ""}`.trim() : `Bar ${++newNo}`;
      const bar = { ...b, name };
      b.cuts.forEach((c, i) => cutAt.set(c.demandId, { barId: b.id, barName: name, seq: i + 1 }));
      if (b.source === "offcut" && b.offcutId) offcutBar.set(b.offcutId, bar);
      return bar;
    });
    for (const u of g.unavailable || []) unavailable.set(u.demandId, u);
    return { ...g, bars };
  });
  const rejected = new Map((allocation?.rejected || []).filter((r) => r.demandId).map((r) => [r.demandId, r]));
  // the same label on two openings makes the site sheet ambiguous — flag it on both
  const labelCount = new Map();
  for (const { m } of openings) labelCount.set(openingLabel(m).toLowerCase(), (labelCount.get(openingLabel(m).toLowerCase()) || 0) + 1);
  return {
    meas, walls, openings, included, demands, demandById, demandsByMeas, sheets, cutAt, unavailable, rejected, offcutBar, labelCount,
    cuts: items.filter((x) => x.m.kind === "manual"),
    wallOpenings: [...meas.values()].filter((m) => m.kind === "opening" && m.parentId && walls.has(m.parentId)),
    offcuts: [...meas.values()].filter((m) => m.kind === "offcut" && m.inputs?.materialId === materialId),
    offcutContrib: new Map(items.filter((x) => x.m.kind === "offcut").map((x) => [x.m.id, x.c])),
    runs: demands.filter((x) => x.role === "run"),
    allOpeningLabels: [...meas.values()].filter((m) => m.kind === "opening").map((m) => m.inputs?.label).filter(Boolean),
  };
}

/**
 * Placed orders against this plan (11 workflow 5, 02 §6): bars already on PLACED orders for this material's bar
 * buckets (server order status — refreshed on load and after every save) next to what the plan needs now.
 * Frozen orders are never changed here; a bucket the plan no longer uses (e.g. another stock length) counts as
 * surplus. Returns null when nothing has been ordered.
 */
function orderedVsPlan(material, materialId, lines, statusList) {
  if (!material || !statusList?.length) return null;
  let prefix;
  try { prefix = `${genericMaterialKey(material)}|`; } catch { return null; }
  // "<material key>|<material id>|bar|<stock length>|…" (older keys had no material id)
  const lengthOf = (bucketKey) => { const parts = bucketKey.slice(prefix.length).split("|"); const i = parts.indexOf("bar"); return i >= 0 ? Number(parts[i + 1]) || null : null; };
  const mine = (lines || []).filter((l) => l.generic && l.unit === "bar" && l.jobMaterialIds?.includes(materialId));
  const byKey = new Map(statusList.map((x) => [x.bucketKey, x]));
  const rows = mine.map((l) => ({ lengthMm: l.item?.stockLengthMm ?? lengthOf(l.bucketKey), need: l.quantity || 0, ordered: byKey.get(l.bucketKey)?.ordered || 0 }));
  const live = new Set(mine.map((l) => l.bucketKey));
  for (const x of statusList) {
    if (!live.has(x.bucketKey) && x.bucketKey.startsWith(prefix) && x.ordered > 0) rows.push({ lengthMm: lengthOf(x.bucketKey), need: 0, ordered: x.ordered });
  }
  const ordered = rows.filter((r) => r.ordered > 0);
  if (!ordered.length) return null;
  return {
    orderedText: ordered.map((r) => `${r.ordered} × ${r.lengthMm ? mm(r.lengthMm) : "stock length"}`).join(" + "),
    toOrder: rows.reduce((a, r) => a + Math.max(0, r.need - r.ordered), 0),
    surplus: rows.reduce((a, r) => a + Math.max(0, r.ordered - r.need), 0),
  };
}

/** Which opening / cut row a demand belongs to (for highlight + the cut-to-opening lookup). */
function sourceOf(d, demandId) {
  const dem = d.demandById.get(demandId);
  const m = d.meas.get(dem?.sourceRefs?.[0]?.measurementId);
  const wall = m?.kind === "opening" && m.parentId ? d.walls.get(m.parentId) : null;
  return { dem, m, opening: m?.kind === "opening" ? openingLabel(m) : null, wall: wall ? wallName(wall) : null };
}

/** One CSV cell. Typed labels that start like a spreadsheet formula (= + - @) are prefixed with ' so a
 *  spreadsheet shows them as text instead of running them; numbers are left as numbers. */
const csvCell = (v) => {
  let s = v == null ? "" : String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function buildCsv(d, n, estimate) {
  const kerfHead = estimate ? "Saw cut after (mm) — ESTIMATE: kerf not confirmed" : "Saw cut after (mm)";
  const rows = [["Bar", "Source", "Stock length (mm)", "Cut order", "Cut", "Opening", "Wall", "Edge", "Length (mm)", kerfHead, "Planned remainder (mm)", "Remainder"]];
  for (const s of d.sheets) {
    for (const b of s.bars) {
      const rem = b.residualMm > 0 ? (b.residualUsable === true ? "reusable (planned)" : b.residualUsable === false ? "scrap" : "planned") : "none";
      b.cuts.forEach((c, i) => {
        const src = sourceOf(d, c.demandId);
        const last = i === b.cuts.length - 1;
        rows.push([b.name, b.source === "offcut" ? "existing offcut" : "new", b.stockLengthMm, i + 1, c.label, src.opening || "", src.wall || "", EDGE[src.dem?.role] || "", c.lengthMm, c.kerfAfterMm ?? 0, last ? Math.round(b.residualMm * 10) / 10 : "", last ? rem : ""]);
      });
    }
    for (const u of s.unavailable || []) {
      const src = sourceOf(d, u.demandId);
      rows.push(["UNAVAILABLE", "", "", "", src.dem?.label || u.demandId, src.opening || "", src.wall || "", EDGE[src.dem?.role] || "", u.lengthMm, "", "", unavailableText(u, n).long]);
    }
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

function buildText(d, material, n, estimate) {
  const out = [`${material.name} — cutting sheet`, describeFamilySpec(material.spec).line];
  out.push(n ? `Saw kerf ${n.kerfMm == null ? "not entered (0 mm used)" : `${n.kerfMm} mm`}${n.kerfConfirmed ? " (confirmed)" : " (NOT confirmed — estimate)"} · end trim ${n.endTrimMm} mm` : "Material details incomplete");
  for (const s of d.sheets) {
    const buy = (s.purchase || []).map((p) => `${p.quantity} × ${mm(p.stockLengthMm)}`).join(", ") || "nothing new";
    out.push("", `Buy ${buy}${s.objective?.offcutsUsed ? ` (+ ${plural(s.objective.offcutsUsed, "existing offcut")})` : ""}.${estimate ? " ESTIMATE." : ""}`);
    out.push(`${s.proven ? "Minimum proven" : "Best plan found — minimum not proven"}${s.unavailable?.length ? " for the pieces that fit" : ""} (lower bound ${s.lowerBoundUnit === "bars" ? plural(s.lowerBound, "bar") : mm(s.lowerBound)}).`);
    const t = s.totals || {};
    out.push(`Required ${mm(t.requiredLengthMm)} · cut loss ${mm(t.cutLossMm)}${t.trimLossMm ? ` · end trim ${mm(t.trimLossMm)}` : ""} · reusable remainder ${t.reusableRemainderMm == null ? "—" : mm(t.reusableRemainderMm)} · scrap ${t.scrapMm == null ? "—" : mm(t.scrapMm)}`);
    for (const b of s.bars) {
      out.push("", `${b.name} — ${b.source === "offcut" ? "existing offcut" : "new"} ${mm(b.stockLengthMm)}`);
      b.cuts.forEach((c, i) => out.push(`  ${i + 1}. ${c.label} — ${mm(c.lengthMm)}`));
      out.push(`  Planned remainder ${mm(b.residualMm)}${b.residualMm > 0 ? (b.residualUsable === true ? " (reusable)" : b.residualUsable === false ? " (scrap)" : "") : ""} — not stock until cut`);
    }
    if (s.unavailable?.length) {
      out.push("", "Cannot be cut from stock (never joined):");
      for (const u of s.unavailable) out.push(`  ${sourceOf(d, u.demandId).dem?.label || u.demandId} — ${mm(u.lengthMm)}: ${unavailableText(u, n).long}`);
    }
  }
  out.push("", "Cut-to-opening lookup");
  for (const { m } of d.openings) {
    const list = (d.demandsByMeas.get(m.id) || []).map((x) => `${EDGE[x.role] || x.role} ${mm(x.lengthMm)} → ${d.cutAt.get(x.id)?.barName || (d.unavailable.has(x.id) ? "UNAVAILABLE" : "—")}`);
    const wall = m.parentId ? d.walls.get(m.parentId) : null;
    out.push(`  ${openingLabel(m)} (${fmtMm(m.inputs?.widthMm)} × ${fmtMm(m.inputs?.heightMm)}${wall ? `, wall ${wallName(wall)}` : ""}): ${list.join("; ") || "no cuts"}`);
  }
  return out.join("\n");
}

/**
 * Form values kept in a ref too, so a commit and the check that follows it in the same event see the same values.
 * `gen` changes on every reset: the number fields are keyed by it, so a reset gives them fresh, empty state in the
 * same render (see DraftNumber) — never a stale number left on screen that the form no longer holds. A commit from a
 * field of an EARLIER generation (a blur fired as the old field is removed) is ignored: `set` returns false.
 */
function useForm(initial) {
  const [vals, setVals] = useState(initial);
  const [gen, setGen] = useState(0);
  const ref = useRef(initial);
  const genRef = useRef(0);
  const set = (patch, g = genRef.current) => {
    if (g !== genRef.current) return false;
    ref.current = { ...ref.current, ...patch };
    setVals(ref.current);
    return true;
  };
  const reset = () => { ref.current = initial; genRef.current += 1; setVals(initial); setGen(genRef.current); };
  return [vals, set, ref, reset, gen];
}

/**
 * Number entry for the ADD forms (same look and checks as ui.jsx NumberField). It owns its text until the form
 * resets (new key → new field), with no value→text effect: NumberField re-syncs its text in a passive effect,
 * and after a reset that effect could land AFTER the next keystroke and wipe the number just typed into the
 * emptied form. Empty or invalid text commits null, so Add never uses a number the field no longer shows.
 */
function DraftNumber({ label, unit = "mm", integer = false, min = 1, max = 30000, initial = null, onCommit }) {
  const id = useId();
  const [text, setText] = useState(initial == null ? "" : String(initial));
  const [err, setErr] = useState(null);
  function commit() {
    const t = text.trim().replace(/,/g, "");
    if (t === "") { setErr(null); onCommit(null); return; }
    const n = Number(t);
    if (!Number.isFinite(n) || n < min || n <= 0 || (integer && !Number.isInteger(n))) {
      setErr(integer ? `Enter a whole number of ${min} or more.` : "Enter a number greater than 0.");
      onCommit(null);
      return;
    }
    if (n > max) { setErr(`That's more than ${max.toLocaleString("en-AU")} ${unit} — check the number.`); onCommit(null); return; }
    setErr(null);
    onCommit(n);
  }
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted">{label}</label>
      <div className="flex items-stretch rounded-lg border border-hairline bg-white focus-within:ring-2 focus-within:ring-primary">
        <input id={id} inputMode={integer ? "numeric" : "decimal"} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
          aria-invalid={!!err} aria-describedby={err ? `${id}-err` : undefined}
          className="min-h-[44px] w-full min-w-0 rounded-l-lg border-0 px-3 text-base text-ink focus:ring-0" />
        <span className="flex items-center rounded-r-lg bg-page px-3 text-sm text-muted">{unit}</span>
      </div>
      {err && <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-red-700">{err}</p>}
    </div>
  );
}

/** A text field that commits once (blur / Enter) — one undo step, not one per keystroke. */
function LabelField({ label, value, onCommit, placeholder, maxLength = 40 }) {
  const id = useId();
  const [text, setText] = useState(value ?? "");
  useEffect(() => { setText(value ?? ""); }, [value]);
  const commit = () => { const t = text.trim(); if (t !== (value ?? "")) onCommit(t); };
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted">{label}</label>
      <input id={id} value={text} placeholder={placeholder} maxLength={maxLength} onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
        className="min-h-[44px] w-full rounded-lg border border-hairline px-3 text-base text-ink focus-ring" />
    </div>
  );
}

function Chip({ tone = "neutral", children, ...p }) {
  return <span {...p} className={`inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${WRAP} ${TONE[tone]}`}>{children}</span>;
}

function Section({ id, title, aside, children }) {
  const hid = useId();
  return (
    <section id={id} aria-labelledby={hid} className="space-y-2 rounded-card border border-hairline bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={hid} className="flex-1 text-sm font-semibold text-ink">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * The last entry a form created, with how many of it there are. While the addition is still the last change the
 * count joins its undo step (one Undo takes the whole addition back). Edits to one piece happen in its list row.
 */
function JustAdded({ testId, verb = "Added", text, countLabel, count, max, onCount }) {
  return (
    <div data-testid={testId} className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2">
      <p className={`text-sm text-emerald-900 ${WRAP}`} aria-live="polite"><b>{verb}</b> {text}</p>
      <div className="grid grid-cols-2 items-end gap-2">
        {countLabel && <NumberField label={countLabel} unit="pcs" integer min={1} max={max} value={count} onCommit={onCount} />}
        <p className={`text-[11px] text-emerald-900 ${countLabel ? "" : "col-span-2"}`}>Change it in the list above. Undo takes {countLabel && count > 1 ? "them" : "it"} back.</p>
      </div>
    </div>
  );
}

/** New opening by size: it is added the moment width AND height are valid (wall-editor rule, no Add step). */
function AddOpeningForm({ onCreate }) {
  const [v, set, ref, reset, gen] = useForm({ label: "", widthMm: null, heightMm: null });
  const update = (patch, g) => {
    if (!set(patch, g)) return;
    const x = ref.current;
    if (x.widthMm > 0 && x.heightMm > 0) { reset(); onCreate(x); }
  };
  return (
    <fieldset data-alu-draft="" className="space-y-2 rounded-lg border border-dashed border-hairline p-2">
      <legend className="px-1 text-xs font-semibold text-ink">Add openings by size</legend>
      <TextField label="Opening label (optional)" value={v.label} onChange={(t) => set({ label: t.slice(0, 32) })} placeholder="Blank = W01, W02 …" />
      <div className="grid grid-cols-2 gap-2">
        <DraftNumber key={`w${gen}`} label="Opening width" onCommit={(x) => update({ widthMm: x }, gen)} />
        <DraftNumber key={`h${gen}`} label="Opening height" onCommit={(x) => update({ heightMm: x }, gen)} />
      </div>
      <p className="text-[11px] text-muted">Enter the window&apos;s nominal width × height. It&apos;s added as soon as both are in — the finished cuts from the window detail above appear straight away.</p>
    </fieldset>
  );
}

/** New straight cut: added the moment its length is valid; the quantity is set on the added cut. */
function AddCutForm({ onCreate }) {
  const [v, set, ref, reset, gen] = useForm({ label: "", lengthMm: null });
  const update = (patch, g) => {
    if (!set(patch, g)) return;
    const x = ref.current;
    if (x.lengthMm > 0) { reset(); onCreate(x); }
  };
  return (
    <fieldset data-alu-draft="" className="space-y-2 rounded-lg border border-dashed border-hairline p-2">
      <legend className="px-1 text-xs font-semibold text-ink">Add a straight cut</legend>
      <TextField label="Cut label (optional)" value={v.label} onChange={(t) => set({ label: t.slice(0, 60) })} placeholder="e.g. Garage door head" />
      <div className="grid grid-cols-2 items-end gap-2">
        <DraftNumber key={`l${gen}`} label="Finished cut length" onCommit={(x) => update({ lengthMm: x }, gen)} />
        <p className="text-[11px] text-muted">Added as soon as the length is in.</p>
      </div>
      <p className="text-[11px] text-muted">Square cut, used exactly as entered — no allowance added. Each piece is one continuous length.</p>
    </fieldset>
  );
}

/** Offcut on hand: recorded the moment its MEASURED length is valid (never taken from a plan). */
function OffcutForm({ seed, onCreate, onCancelSeed }) {
  const [v, set, ref, reset, gen] = useForm({ label: seed?.label || "", location: "", lengthMm: null });
  const update = (patch, g) => {
    if (!set(patch, g)) return;
    const x = ref.current;
    if (x.lengthMm > 0) { reset(); onCreate({ label: x.label.trim() || null, lengthMm: x.lengthMm, location: x.location.trim() || null, seeded: !!seed }); }
  };
  return (
    <fieldset id="alu-offcut-form" data-alu-draft="" className="space-y-2 rounded-lg border border-dashed border-hairline p-2">
      <legend className="px-1 text-xs font-semibold text-ink">{seed ? "Record remaining offcut" : "Add an offcut you have"}</legend>
      {seed && <p className="text-[11px] text-amber-900">{seed.name}: planned remainder {mm(seed.plannedMm)}. Only record it after the bar is actually cut — measure the real piece. It then counts as stock for this material; cuts already taken from {seed.name} stay in the takeoff until you remove them, so the plan may reuse this piece for them.</p>}
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Offcut label" value={v.label} onChange={(t) => set({ label: t.slice(0, 60) })} placeholder="e.g. Rack A" />
        <TextField label="Where it is (optional)" value={v.location} onChange={(t) => set({ location: t.slice(0, 80) })} placeholder="e.g. Ute" />
      </div>
      <div className="grid grid-cols-2 items-end gap-2">
        <DraftNumber key={`l${gen}`} label="Measured offcut length" onCommit={(x) => update({ lengthMm: x }, gen)} />
        {seed ? <Btn onClick={onCancelSeed}>Cancel</Btn> : <span />}
      </div>
      <p className="text-[11px] text-muted">Recorded as soon as you enter the measured length — never taken from the plan. It is kept for this profile and finish only.</p>
    </fieldset>
  );
}

/** Proportional strip of one bar: end trim, cuts, saw kerfs, planned remainder (decorative). */
function BarStrip({ bar }) {
  const L = bar.stockLengthMm || 1;
  const w = (x) => `${(Math.max(0, x) / L) * 100}%`;
  return (
    <div aria-hidden="true" className="flex h-6 overflow-hidden rounded bg-page">
      {bar.trimLossMm > 0 && <span className="bg-slate-400" style={{ width: w(bar.trimLossMm) }} />}
      {bar.cuts.map((c) => (
        <span key={c.cutId} className="contents">
          <span className="flex min-w-0 items-center justify-center overflow-hidden whitespace-nowrap bg-primary/80 text-[10px] font-semibold text-white" style={{ width: w(c.lengthMm) }}>{fmtMm(c.lengthMm)}</span>
          {c.kerfAfterMm > 0 && <span className="bg-ink" style={{ width: w(c.kerfAfterMm), minWidth: 1 }} />}
        </span>
      ))}
      {bar.residualMm > 0 && <span className={bar.residualUsable === true ? "bg-emerald-200" : "bg-red-100"} style={{ width: w(bar.residualMm) }} />}
    </div>
  );
}

export default function AluminiumScreen({ ws, materialId, onSetup, onClose, onMeasure }) {
  const view = ws.view;
  const material = view?.materials?.find((m) => m.id === materialId) || null;
  const canEdit = !!ws.capabilities?.edit;
  const result = ws.computed?.materialResults?.[materialId] || null;
  const n = useMemo(() => { if (!material) return null; try { return normaliseFamilySpec(material.spec); } catch { return null; } }, [material]);
  const d = useMemo(() => derive(view, materialId, result), [view, materialId, result]);
  const estimate = !n || n.kerfMm == null || !n.kerfConfirmed;
  // the profile + finish an offcut is stamped with when recorded (the engine offers it only to this same key)
  const stockKey = useMemo(() => (material ? stockIdentityKey(material.spec) : null), [material]);

  // Session undo/redo (MeasureScreen pattern): each op holds the partial to re-apply and the one to revert
  // (or a function building it from the latest record, so undoing one field never reverts someone else's).
  const histRef = useRef({ past: [], future: [] });
  const [hist, setHist] = useState({ past: 0, future: 0 });
  const latestMaterial = useRef(material);
  latestMaterial.current = material;
  const sync = () => setHist({ past: histRef.current.past.length, future: histRef.current.future.length });
  const run = (part) => ws.edit(typeof part === "function" ? part() : part);
  // Typing not yet applied: the input typed into since the last applied edit. While Undo discards it, `discarding`
  // is set so the field's own blur commit (fired as it lets go of focus) applies nothing.
  const typingRef = useRef(null);
  const discardingRef = useRef(false);
  const [draftReset, setDraftReset] = useState(0); // bumped by Undo to drop what is being typed (fields remount)
  function record(op) {
    if (!canEdit || discardingRef.current) return;
    typingRef.current = null;
    run(op.redo);
    histRef.current = { past: [...histRef.current.past, op].slice(-100), future: [] };
    sync();
  }
  /** Record an edit — or, while the addition `key` is still the last change, fold it into that addition's undo
   *  step (`merged` = the whole addition as it now stands), so one Undo takes the whole addition back. */
  function amend(key, op, merged) {
    if (!canEdit || discardingRef.current) return;
    typingRef.current = null;
    const h = histRef.current;
    if (!key || h.past[h.past.length - 1]?.group !== key) { record(op); return; }
    run(op.redo);
    histRef.current = { past: [...h.past.slice(0, -1), { ...merged, group: key }], future: [] };
    sync();
  }
  /** Something is still being typed: an unfinished entry in an add form (or a remainder being recorded), an invalid
   *  number, or a field typed into and still focused (iOS keeps focus on the field when Undo is tapped). */
  function typingInProgress() {
    const box = scrollRef.current;
    if (!box) return false;
    const el = document.activeElement;
    if (el instanceof HTMLInputElement && el.type !== "checkbox" && box.contains(el) && typingRef.current === el) return true;
    if (offcutSeed) return true;
    if (box.querySelector('input[aria-invalid="true"]')) return true;
    return [...box.querySelectorAll("[data-alu-draft] input")].some((i) => i.value.trim() !== "");
  }
  /** Drop what is being typed: nothing is applied, and every field shows what is stored again. */
  function discardTyping() {
    discardingRef.current = true;
    try { commitFocusedField(); } finally { discardingRef.current = false; }
    typingRef.current = null;
    setOffcutSeed(null);
    setDraftReset((x) => x + 1);
  }
  function undo() {
    // what is still being typed is cleared first — never an earlier edit (as the wall editor)
    if (typingInProgress()) { discardTyping(); return; }
    const h = histRef.current;
    if (!h.past.length) return;
    const op = h.past[h.past.length - 1];
    run(op.undo);
    histRef.current = { past: h.past.slice(0, -1), future: [op, ...h.future] };
    sync();
  }
  function redo() {
    const h = histRef.current;
    if (!h.future.length) return;
    const [op, ...rest] = h.future;
    run(op.redo);
    histRef.current = { past: [...h.past, op], future: rest };
    sync();
  }

  const [focus, setFocus] = useState(null);          // { measurementId, demandId } highlighted
  const [openBars, setOpenBars] = useState(() => new Set());
  const [editing, setEditing] = useState(null);       // measurement id with its editor open
  const [offcutSeed, setOffcutSeed] = useState(null); // { key, name, label, plannedMm } from a bar
  const [presetErr, setPresetErr] = useState(null);
  const [copyMsg, setCopyMsg] = useState(null);
  const [added, setAdded] = useState({});            // { opening | cut | offcut: { key, ids, base, seeded } } — last entry per form

  const scrollRef = useRef(null);
  // A number still being typed counts when the screen is left (Back, setup, the plan) or the page is hidden (app
  // switch, reload, the phone locking): blur the field so it commits — an opening / cut / offcut whose numbers are
  // valid is added and reaches autosave + device recovery instead of being lost. Invalid text stays as it is.
  const leave = (fn) => (...args) => { commitFocusedField(); fn?.(...args); };
  useEffect(() => {
    const commitTyped = () => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement && scrollRef.current?.contains(el)) el.blur();
    };
    const vis = () => { if (document.visibilityState === "hidden") commitTyped(); };
    document.addEventListener("visibilitychange", vis, true);
    window.addEventListener("pagehide", commitTyped, true);
    return () => { document.removeEventListener("visibilitychange", vis, true); window.removeEventListener("pagehide", commitTyped, true); };
  }, []);
  // the field typed into since the last applied edit (what Undo clears first while it is still focused)
  const noteTyping = (e) => { if (e.target instanceof HTMLInputElement && e.target.type !== "checkbox") typingRef.current = e.target; };
  const scrollTo = (id) => requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  // a tap already under way wins: never scroll the content out from under a finger that is pressing a button
  const fieldTimer = useRef(null);
  const cancelFieldScroll = () => { clearTimeout(fieldTimer.current); fieldTimer.current = null; };
  useEffect(() => cancelFieldScroll, []);
  /**
   * Phone keyboard: once it has opened, move the focused field into the upper part of what is still visible
   * (visualViewport), leaving room for the result under it. The bottom padding (coarse pointers only) lets
   * the last fields scroll that high. Never runs for mouse/desktop.
   */
  const keepFieldVisible = (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement) || el.type === "checkbox") return;
    if (!window.matchMedia?.("(pointer: coarse)").matches) return;
    cancelFieldScroll();
    fieldTimer.current = setTimeout(() => {
      fieldTimer.current = null;
      const box = scrollRef.current;
      if (!box || document.activeElement !== el) return;
      const vv = window.visualViewport;
      const top = Math.max(box.getBoundingClientRect().top, vv ? vv.offsetTop : 0);
      const bottom = Math.min(box.getBoundingClientRect().bottom, vv ? vv.offsetTop + vv.height : window.innerHeight);
      const r = el.getBoundingClientRect();
      const delta = r.top + r.height / 2 - (top + (bottom - top) * 0.4);
      if (r.top < top + 8 || r.bottom > bottom - 8 || Math.abs(delta) > (bottom - top) * 0.25) box.scrollBy({ top: delta, behavior: "smooth" });
    }, 350);
  };

  if (!view || !material) {
    return (
      <FocusedWindow title="Aluminium" onClose={onClose} closeLabel="Back">
        <div className="p-3"><Banner tone="warn">This aluminium material isn&apos;t in the takeoff any more.</Banner></div>
      </FocusedWindow>
    );
  }

  // ── edits (all auto-apply, all undoable) ───────────────────────────────────
  const contribsOf = (id) => view.contributions.filter((x) => x.measurementId === id && !x.archived);
  const liveOf = (g) => (g ? g.ids.map((id) => d.meas.get(id)).filter(Boolean) : []);
  /** A new opening by size (count 1 — "How many of this size" adds copies). One undo step. */
  function addOpening({ label, widthMm, heightMm }) {
    if (discardingRef.current) return;
    const base = label.trim() || null;
    const id = newId(), cid = newId();
    const m = { id, kind: "opening", parentId: null, inputs: { xMm: 0, sillMm: 0, widthMm, heightMm, label: base || autoOpeningLabel(nextOpeningNo(d.allOpeningLabels)), type: "window" } };
    record({ group: id, redo: partial({ measurements: [m], contributions: [{ id: cid, measurementId: id, jobMaterialId: materialId, role: "opening" }] }), undo: partial({ archive: { measurements: [id], contributions: [cid] } }) });
    setAdded((a) => ({ ...a, opening: { key: id, ids: [id], base } }));
  }
  /**
   * Change how many records the last entry made (openings of one size, identical offcut pieces): copies of the
   * first, or the last ones archived; labels that still follow the entry's pattern are renumbered.
   */
  function resizeGroup(kind, n, relabel, copy) {
    const g = added[kind];
    const live = liveOf(g);
    if (!canEdit || discardingRef.current || !live.length || !(n >= 1) || n === live.length) return;
    const keep = live.slice(0, Math.min(n, live.length));
    const relabelled = new Map();
    keep.forEach((m, i) => { const r = relabel(m, i, n); if (r) relabelled.set(m.id, r); });
    const addM = [], addC = [];
    for (let i = live.length; i < n; i++) {
      const m = copy(live[0], i, n);
      addM.push(m);
      addC.push({ id: newId(), measurementId: m.id, jobMaterialId: materialId, role: kind });
    }
    const gone = live.slice(n);
    const goneC = gone.flatMap((m) => contribsOf(m.id));
    const op = {
      redo: partial({ measurements: [...relabelled.values(), ...addM], contributions: addC, archive: { measurements: gone.map((m) => m.id), contributions: goneC.map((c) => c.id) } }),
      undo: partial({ measurements: [...keep.filter((m) => relabelled.has(m.id)), ...gone], contributions: goneC, archive: { measurements: addM.map((m) => m.id), contributions: addC.map((c) => c.id) } }),
    };
    const finalM = [...keep.map((m) => relabelled.get(m.id) || m), ...addM];
    const finalC = [...keep.flatMap((m) => contribsOf(m.id)), ...addC];
    amend(g.key, op, { redo: partial({ measurements: finalM, contributions: finalC }), undo: partial({ archive: { measurements: finalM.map((m) => m.id), contributions: finalC.map((c) => c.id) } }) });
    if (addM.length) setAdded((a) => ({ ...a, [kind]: { ...g, ids: [...g.ids, ...addM.map((m) => m.id)] } }));
  }
  function setOpeningCount(n) {
    const g = added.opening;
    if (!g) return;
    const own = (lab) => lab === g.base || new RegExp(`^${escapeRe(g.base)}-\\d+$`).test(lab || "");
    const want = (i, total) => (total > 1 ? `${g.base}-${i + 1}` : g.base);
    let next = nextOpeningNo(d.allOpeningLabels);
    resizeGroup("opening", n,
      (m, i, total) => (g.base && own(m.inputs?.label) && m.inputs.label !== want(i, total) ? { ...m, inputs: { ...m.inputs, label: want(i, total) } } : null),
      (proto, i, total) => ({ id: newId(), kind: "opening", parentId: null, inputs: { ...proto.inputs, label: g.base ? want(i, total) : autoOpeningLabel(next++) } }));
  }
  function setOffcutCount(n) {
    const g = added.offcut;
    if (!g) return;
    const stem = (g.base || "Offcut").slice(0, 48);
    const own = (lab) => (lab ?? null) === g.base || new RegExp(`^${escapeRe(stem)} \\(\\d+ of \\d+\\)$`).test(lab || "");
    const want = (i, total) => (total > 1 ? `${stem} (${i + 1} of ${total})` : g.base);
    resizeGroup("offcut", n,
      (m, i, total) => (own(m.inputs?.label) && (m.inputs?.label ?? null) !== want(i, total) ? { ...m, label: want(i, total), inputs: { ...m.inputs, label: want(i, total) } } : null),
      (proto, i, total) => ({ id: newId(), kind: "offcut", label: want(i, total), inputs: { ...proto.inputs, label: want(i, total), status: "available" } }));
  }
  function updateMeasurement(m, next) {
    record({ redo: partial({ measurements: [next] }), undo: partial({ measurements: [m] }) });
  }
  function removeOpening({ m, c }) {
    if (m.parentId) {
      // the wall owns the opening: only stop using it for this aluminium
      record({ redo: partial({ archive: { contributions: [c.id] } }), undo: partial({ contributions: [c] }) });
    } else {
      const all = view.contributions.filter((x) => x.measurementId === m.id && !x.archived);
      record({ redo: partial({ archive: { measurements: [m.id], contributions: all.map((x) => x.id) } }), undo: partial({ measurements: [m], contributions: all }) });
    }
    setEditing(null);
  }
  function includeWallOpenings(list) {
    const cs = list.filter((m) => !d.included.has(m.id)).map((m) => ({ id: newId(), measurementId: m.id, jobMaterialId: materialId, role: "opening" }));
    if (cs.length) record({ redo: partial({ contributions: cs }), undo: partial({ archive: { contributions: cs.map((c) => c.id) } }) });
  }
  function excludeWallOpening(m) {
    const c = d.included.get(m.id);
    if (c) record({ redo: partial({ archive: { contributions: [c.id] } }), undo: partial({ contributions: [c] }) });
  }
  /** A new straight cut (quantity 1 — set on the added cut, inside the same undo step). */
  function addCut({ label, lengthMm }) {
    if (discardingRef.current) return;
    const id = newId(), cid = newId();
    const meas = { id, kind: "manual", finishedLengthMm: lengthMm, quantity: 1, label: label.trim() || null };
    record({ group: id, redo: partial({ measurements: [meas], contributions: [{ id: cid, measurementId: id, jobMaterialId: materialId, role: "primary" }] }), undo: partial({ archive: { measurements: [id], contributions: [cid] } }) });
    setAdded((a) => ({ ...a, cut: { key: id, ids: [id] } }));
  }
  function setCutQuantity(q) {
    const g = added.cut;
    const m = liveOf(g)[0];
    if (!m || !(q >= 1) || m.quantity === q) return;
    const next = { ...m, quantity: q };
    const cs = contribsOf(m.id);
    amend(g.key, { redo: partial({ measurements: [next] }), undo: partial({ measurements: [m] }) },
      { redo: partial({ measurements: [next], contributions: cs }), undo: partial({ archive: { measurements: [m.id], contributions: cs.map((c) => c.id) } }) });
  }
  function removeMeasurement(m) {
    const all = view.contributions.filter((x) => x.measurementId === m.id && !x.archived);
    record({ redo: partial({ archive: { measurements: [m.id], contributions: all.map((x) => x.id) } }), undo: partial({ measurements: [m], contributions: all }) });
    setEditing(null);
  }
  /** One physical piece (each is used at most once by a plan; "Identical pieces" adds numbered copies). It is
   *  stamped with this material's profile + finish, so a later finish/section change never consumes it. */
  function addOffcut({ label, lengthMm, location, seeded }) {
    if (discardingRef.current) return;
    const id = newId(), cid = newId();
    const m = { id, kind: "offcut", label, inputs: { lengthMm, materialId, identityKey: stockKey, label, location, status: "available" } };
    record({ group: id, redo: partial({ measurements: [m], contributions: [{ id: cid, measurementId: id, jobMaterialId: materialId, role: "offcut" }] }), undo: partial({ archive: { measurements: [id], contributions: [cid] } }) });
    setAdded((a) => ({ ...a, offcut: { key: id, ids: [id], base: label, seeded } }));
    setOffcutSeed(null);
  }
  function setPreset(patch) {
    const before = material.spec?.windowPreset ?? null;
    const after = { ...(n?.windowPreset || before || {}), ...patch };
    try { normaliseFamilySpec({ ...material.spec, windowPreset: after }); } catch (e) { setPresetErr(e.message); return; }
    setPresetErr(null);
    // only the window detail changes (and is undone) — kerf, profile and name keep their latest values
    const withPreset = (wp) => () => {
      const cur = latestMaterial.current || material;
      const spec = { ...cur.spec };
      if (wp == null) delete spec.windowPreset; else spec.windowPreset = wp;
      return partial({ materials: [matRec({ ...cur, spec })] });
    };
    record({ redo: withPreset(after), undo: withPreset(before) });
  }

  // ── navigation between a cut and its opening ──────────────────────────────
  function showSource(demandId) {
    const src = sourceOf(d, demandId);
    if (!src.m) return;
    setFocus({ measurementId: src.m.id, demandId });
    scrollTo(src.m.kind === "opening" ? `alu-o-${src.m.id}` : `alu-c-${src.m.id}`);
  }
  function showBar(demandId) {
    const at = d.cutAt.get(demandId);
    const src = sourceOf(d, demandId);
    setFocus({ measurementId: src.m?.id || null, demandId });
    if (!at) return;
    setOpenBars((s) => new Set(s).add(at.barId));
    scrollTo(`alu-bar-${at.barId}`);
  }
  const toggleBar = (id) => setOpenBars((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });

  function download() {
    const blob = new Blob([buildCsv(d, n, estimate)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${material.name.replace(/[^\w-]+/g, "-").replace(/-+/g, "-").toLowerCase()}-cutting-sheet${estimate ? "-ESTIMATE" : ""}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function copySheet() {
    const text = buildText(d, material, n, estimate);
    if (!navigator.clipboard?.writeText) { setCopyMsg("Copying isn't available here — use Download instead."); return; }
    navigator.clipboard.writeText(text).then(() => setCopyMsg("Cutting sheet copied.")).catch(() => setCopyMsg("Couldn't copy — use Download instead."));
  }

  // ── derived display bits ───────────────────────────────────────────────────
  const justOpenings = liveOf(added.opening).filter((m) => d.included.has(m.id));
  const justCut = liveOf(added.cut).find((m) => m.kind === "manual") || null;
  const justOffcuts = liveOf(added.offcut).filter((m) => m.kind === "offcut");
  const status = result?.status || null;
  const wp = n?.windowPreset || null;
  const handled = new Set(["kerf_unconfirmed", "unavailable_stock", "nothing_measured"]);
  const otherProblems = [...new Set((result?.problems || [])
    .filter((p) => p.blocking !== false && !handled.has(p.code) && !(estimate && /kerf/i.test(p.message || "")))
    .map((p) => p.message))];
  const groupProblems = [...new Set(d.sheets.flatMap((s) => (s.problems || []).filter((p) => p.code === "allocation_internal").map((p) => p.message)))];
  const hasDemands = d.demands.length > 0;
  const buyText = d.sheets.length
    ? d.sheets.map((s) => (s.purchase || []).map((p) => `${p.quantity} × ${mm(p.stockLengthMm)}`).join(", ")).filter(Boolean).join(" + ") || "nothing new"
    : null;
  // pieces the plan could not place: the buy line alone ("nothing new") would hide them
  const unavailableCount = d.sheets.reduce((a, s) => a + (s.unavailable?.length || 0), 0);
  const blockedChip = (testId) => unavailableCount > 0 && <Chip tone="bad" data-testid={testId}>+ {plural(unavailableCount, "piece")} can&apos;t be cut from stock</Chip>;
  const kerfOnly = onlyKerfMissing(result?.problems);
  const placed = orderedVsPlan(material, materialId, ws.computed?.scheduleLines, ws.server?.orderStatus);
  const placedText = placed && [
    `Already ordered: ${placed.orderedText} on placed orders.`,
    placed.toOrder > 0 ? `Still to order: ${plural(placed.toOrder, "more bar")}.` : null,
    placed.surplus > 0 ? `${plural(placed.surplus, "bar")} more than this plan now needs — placed orders are not changed.` : null,
    !placed.toOrder && !placed.surplus ? "That covers this plan." : null,
  ].filter(Boolean).join(" ");
  const qtyText = status ? `${QTY_TEXT[status.quantity] || status.quantity}${status.quantity === "incomplete" && kerfOnly.all ? " — saw kerf not confirmed" : ""}` : "";
  const procText = !status ? "" : status.procurement === "missing-product" && kerfOnly.material
    ? (unavailableCount ? "unavailable stock · saw kerf not confirmed" : "not ready — saw kerf not confirmed")
    : PROC_TEXT[status.procurement] || status.procurement;
  const presetText = wp ? [
    wp.left || wp.right ? `${wp.left && wp.right ? "left + right jamb" : wp.left ? "left jamb" : "right jamb"} = height + ${mm(wp.jambAllowanceTotalMm)} total` : null,
    wp.bottom ? `bottom = width + ${mm(wp.bottomAllowanceMm)}` : null,
    wp.head ? `head = width + ${mm(wp.headAllowanceMm)}` : "head excluded",
  ].filter(Boolean).join(" · ") : "window detail incomplete";

  const statusChips = status && (
    <div className="flex flex-wrap gap-1.5" data-testid="alu-statuses">
      <Chip tone={status.quantity === "calculated" || status.quantity === "reviewed" ? "good" : "warn"} data-status="quantity">Quantity: {qtyText}</Chip>
      <Chip tone="neutral" data-status="installation">Installation: {INSTALL_TEXT[status.installation] || status.installation}</Chip>
      <Chip tone={status.procurement === "ready" ? "good" : ["unavailable-stock", "missing-product"].includes(status.procurement) ? "bad" : "warn"} data-status="procurement">Ordering: {procText}</Chip>
    </div>
  );

  const cutChip = (dem, m) => {
    const at = d.cutAt.get(dem.id);
    const un = d.unavailable.get(dem.id);
    const rej = d.rejected.get(dem.id);
    const hl = focus?.demandId === dem.id;
    const bad = !!(un || rej);
    return (
      <li key={dem.id} className="min-w-0 max-w-full">
        <button type="button" onClick={() => showBar(dem.id)} disabled={!at && !bad}
          aria-label={`${openingLabel(m)} ${EDGE[dem.role] || dem.role} ${fmtMm(dem.lengthMm)} mm${at ? ` — ${at.barName}` : un ? ` — ${unavailableText(un, n).short}` : rej ? " — invalid" : ""}`}
          className={`flex min-h-[44px] max-w-full flex-col items-start justify-center rounded-lg border px-2 text-left text-xs ${bad ? "border-red-300 bg-red-50 text-red-700" : hl ? "border-primary bg-primary/10 text-primary" : "border-hairline bg-white text-ink"}`}>
          <span>{EDGE[dem.role] || dem.role} <b className="text-sm">{Number.isFinite(dem.lengthMm) ? fmtMm(dem.lengthMm) : "—"}</b></span>
          <span className="block max-w-full truncate text-[10px] text-muted">{at ? at.barName : un ? unavailableText(un, n).short : rej ? "invalid size" : "not planned"}</span>
        </button>
      </li>
    );
  };

  return (
    <FocusedWindow
      title={material.name}
      subtitle={describeFamilySpec(material.spec).line}
      onClose={leave(onClose)} closeLabel="Back"
      actions={<>
        <SaveChip status={ws.status} />
        {canEdit && <Btn kind="ghost" className="min-w-[44px]" onClick={undo} disabled={!hist.past} aria-label="Undo">↶</Btn>}
        {canEdit && <Btn kind="ghost" className="min-w-[44px]" onClick={redo} disabled={!hist.future} aria-label="Redo">↷</Btn>}
      </>}
    >
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain" onFocus={keepFieldVisible} onPointerDown={cancelFieldScroll} onInput={noteTyping} data-testid="aluminium-screen">
        <div className="mx-auto grid w-full max-w-6xl gap-3 p-3 pb-32 lg:grid-cols-2 lg:items-start [@media(pointer:coarse)]:pb-[45vh]">
          <div className="min-w-0 space-y-3">
            {/* ── HUB 026: measuring on the plan comes first; typing sizes stays below ── */}
            {canEdit && onMeasure && (
              <div data-testid="alu-measure-first" className="space-y-1 rounded-card border border-primary/30 bg-primary/5 p-3">
                <Btn kind="primary" className="w-full" onClick={leave(() => onMeasure())}>Measure runs on the plan</Btn>
                <p className="text-[11px] text-muted">Tap each end of a side on a scaled plan, elevation or window schedule. Page not to scale? Type the sizes below.</p>
              </div>
            )}
            {/* ── summary ─────────────────────────────────────────── */}
            <Section title="Summary" aside={canEdit && onSetup ? <Btn kind="ghost" onClick={leave(() => onSetup(material))}>Profile &amp; cutting settings</Btn> : null}>
              {buyText ? (
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <p className="text-lg font-semibold text-ink" data-testid="alu-buy-summary">Buy {buyText}</p>
                  {blockedChip("alu-buy-summary-blocked")}
                  {placed && <p className="w-full text-sm text-ink" data-testid="alu-ordered-summary">{placedText}</p>}
                  {estimate && <Chip tone="warn">estimate</Chip>}
                  <a href="#alu-cutting-sheet" onClick={(e) => { e.preventDefault(); scrollTo("alu-cutting-sheet"); }} className="flex min-h-[44px] items-center text-sm font-medium text-primary lg:hidden">See cutting sheet</a>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted">Add openings or straight cuts — the bars to buy and the cutting plan appear here.</p>
                  {placed && <p className="text-sm text-amber-900" data-testid="alu-ordered-summary">{placedText}</p>}
                </>
              )}
              {statusChips}
              {estimate && n && (
                <div data-testid="alu-kerf-estimate">
                  <Banner tone="warn" action={canEdit && onSetup ? <Btn onClick={leave(() => onSetup(material))}>Confirm saw kerf</Btn> : null}>
                    <b>Estimate.</b> The saw kerf isn&apos;t confirmed{n?.kerfMm == null ? " — this plan uses 0 mm" : ` — this plan uses ${n.kerfMm} mm`}. Bars, cut loss and remainders can change. Confirm the real kerf before ordering.
                  </Banner>
                </div>
              )}
              {otherProblems.length > 0 && <Banner tone="error">{otherProblems.join(" ")}</Banner>}
              {ws.computed?.error && <Banner tone="error">{ws.computed.error}</Banner>}
              {/* HUB 025: a Conflict is explained here, with its choices, not only on the overview */}
              <SaveProblem ws={ws} />
              <p className="text-[11px] text-muted" data-testid="alu-footnote">Square cuts only. Fixing and installation of this profile are not checked by the app. {canEdit ? "Changes save automatically to this job." : "You can view this cutting plan but not change it."}</p>
            </Section>

            {/* ── openings ────────────────────────────────────────── */}
            <Section title={`Openings (${d.openings.length})`}>
              {!canEdit && <p className="rounded-lg border border-hairline bg-page p-2 text-xs text-ink" data-testid="alu-preset-readonly"><b>Window detail (all openings):</b> {presetText}</p>}
              {canEdit && <details className="rounded-lg border border-hairline bg-page px-2">
                <summary className="flex min-h-[44px] cursor-pointer items-center text-xs text-ink"><span><b>Window detail (all openings):</b> {presetText} <span className="font-semibold text-primary">Change</span></span></summary>
                {wp && (
                  <div className="space-y-2 pb-2">
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Edges cut for each opening">
                      {[["left", "Left jamb"], ["right", "Right jamb"], ["bottom", "Bottom"], ["head", "Head"]].map(([k, l]) => (
                        <button key={k} type="button" aria-pressed={!!wp[k]} disabled={!canEdit} onClick={() => setPreset({ [k]: !wp[k] })}
                          className={`min-h-[44px] rounded-lg border px-3 text-sm ${wp[k] ? "border-primary bg-primary/10 font-semibold text-primary" : "border-hairline bg-white text-ink"}`}>{l}</button>
                      ))}
                    </div>
                    <div key={`wp-${draftReset}`} className="grid grid-cols-2 gap-2">
                      <NumberField label="Jamb allowance (total per jamb)" value={wp.jambAllowanceTotalMm} min={0} max={2000} onCommit={(x) => setPreset({ jambAllowanceTotalMm: x })} />
                      <NumberField label="Bottom allowance" value={wp.bottomAllowanceMm} min={0} max={2000} onCommit={(x) => setPreset({ bottomAllowanceMm: x })} />
                      {wp.head && <NumberField label="Head allowance" value={wp.headAllowanceMm} min={0} max={2000} onCommit={(x) => setPreset({ headAllowanceMm: x })} />}
                    </div>
                    {presetErr && <Banner tone="error">{presetErr}</Banner>}
                    <p className="text-[11px] text-muted">This job&apos;s detail — not a universal rule. How the jamb allowance splits between top and bottom is still to be confirmed; it is entered as a total.</p>
                  </div>
                )}
              </details>}
              {d.openings.length === 0 && <p className="text-sm text-muted">No openings yet.</p>}
              <ul className="space-y-2">
                {d.openings.map(({ m, c }) => {
                  const i = m.inputs || {};
                  const wall = m.parentId ? d.walls.get(m.parentId) : null;
                  const dems = d.demandsByMeas.get(m.id) || [];
                  const hl = focus?.measurementId === m.id;
                  const dup = (d.labelCount.get(openingLabel(m).toLowerCase()) || 0) > 1;
                  return (
                    <li key={m.id} id={`alu-o-${m.id}`} data-testid="alu-opening" data-label={openingLabel(m)} data-highlight={hl ? "true" : "false"}
                      className={`rounded-lg border p-2 transition-colors ${hl ? "border-primary bg-primary/5 ring-2 ring-primary" : "border-hairline bg-white"}`}>
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="flex min-w-0 items-baseline gap-1 text-sm font-semibold text-ink"><span className="min-w-0 truncate">{openingLabel(m)}</span>{m.pending ? <span className="shrink-0 text-[11px] font-normal text-muted">· unsaved</span> : null}</p>
                          <p className={`text-xs text-muted ${WRAP}`} data-testid="alu-nominal">{isDoor(m) ? "Door" : "Opening"} {fmtMm(i.widthMm)} × {fmtMm(i.heightMm)} mm (nominal W × H) · {wall ? `on wall ${wallName(wall)}` : "standalone"}</p>
                          {dup && <p className="text-[11px] text-amber-900" data-testid="alu-duplicate-label">Another opening has the same label — rename one so the cutting sheet is clear.</p>}
                          {isDoor(m) && wp?.bottom && <p className="text-[11px] text-amber-900">This is a door: the window detail gives it a bottom cut too. Leave it out if the door has no bottom angle.</p>}
                        </div>
                        {canEdit && <Btn kind="ghost" aria-expanded={editing === m.id} aria-label={`Edit ${openingLabel(m)}`} onClick={() => setEditing(editing === m.id ? null : m.id)}>{editing === m.id ? "Hide" : "Edit"}</Btn>}
                      </div>
                      <p className="mt-1 text-[11px] font-medium text-muted">Finished cuts</p>
                      {dems.length ? <ul className="mt-1 flex flex-wrap gap-1.5" data-testid="alu-cuts">{dems.map((x) => cutChip(x, m))}</ul>
                        : <p className="text-xs text-muted">No edges selected in the window detail.</p>}
                      {editing === m.id && (
                        <div key={`ed-${draftReset}`} className="mt-2 space-y-2 border-t border-hairline pt-2">
                          {wall && <p className="text-[11px] text-amber-900">This opening belongs to wall {wallName(wall)} — size changes apply there too (other materials on that wall use it).</p>}
                          <LabelField label="Label" value={i.label || ""} onCommit={(t) => updateMeasurement(m, { ...m, inputs: { ...i, label: t || null } })} />
                          <div className="grid grid-cols-2 gap-2">
                            <NumberField label="Width" value={i.widthMm} min={1} max={30000} onCommit={(x) => updateMeasurement(m, { ...m, inputs: { ...i, widthMm: x } })} />
                            <NumberField label="Height" value={i.heightMm} min={1} max={30000} onCommit={(x) => updateMeasurement(m, { ...m, inputs: { ...i, heightMm: x } })} />
                          </div>
                          <Btn kind="danger" onClick={() => removeOpening({ m, c })}>{wall ? "Remove from this aluminium" : "Remove opening"}</Btn>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {canEdit && <AddOpeningForm key={`add-${draftReset}`} onCreate={addOpening} />}
              {canEdit && justOpenings.length > 0 && (
                <JustAdded key={`added-${draftReset}`} testId="alu-just-added-opening" text={`${labelsText(justOpenings.map(openingLabel))} · ${fmtMm(justOpenings[0].inputs?.widthMm)} × ${fmtMm(justOpenings[0].inputs?.heightMm)} mm`}
                  countLabel="How many of this size" count={justOpenings.length} max={50} onCount={setOpeningCount} />
              )}
              {d.wallOpenings.length > 0 && (
                <fieldset className="space-y-1 rounded-lg border border-hairline p-2" data-testid="alu-wall-openings">
                  <legend className="px-1 text-xs font-semibold text-ink">Openings already on walls</legend>
                  {canEdit && d.wallOpenings.filter((m) => !isDoor(m) && !d.included.has(m.id)).length > 1 && (
                    <Btn kind="ghost" onClick={() => includeWallOpenings(d.wallOpenings.filter((m) => !isDoor(m)))}>Include all windows</Btn>
                  )}
                  {d.wallOpenings.map((m) => (
                    <label key={m.id} className="flex min-h-[44px] items-center gap-2 rounded-lg px-1 text-sm text-ink">
                      <input type="checkbox" className="h-5 w-5 rounded border-hairline text-primary" disabled={!canEdit} checked={d.included.has(m.id)}
                        onChange={(e) => (e.target.checked ? includeWallOpenings([m]) : excludeWallOpening(m))} />
                      <span className={`min-w-0 flex-1 ${WRAP}`}><b>{openingLabel(m)}</b> · {isDoor(m) ? "door " : ""}{fmtMm(m.inputs?.widthMm)} × {fmtMm(m.inputs?.heightMm)} mm <span className="text-muted">· wall {wallName(d.walls.get(m.parentId))}</span></span>
                    </label>
                  ))}
                </fieldset>
              )}
            </Section>

            {/* ── straight cuts ───────────────────────────────────── */}
            <Section title={`Extra straight cuts (${d.cuts.length})`}>
              {d.cuts.length === 0 && d.runs.length === 0 && <p className="text-sm text-muted">None. Add a cut for anything that isn&apos;t a window edge.</p>}
              <ul className="space-y-2">
                {d.cuts.map(({ m }) => {
                  const hl = focus?.measurementId === m.id;
                  const dems = d.demandsByMeas.get(m.id) || [];
                  const bars = [...new Set(dems.map((x) => d.cutAt.get(x.id)?.barName).filter(Boolean))];
                  const unU = dems.map((x) => d.unavailable.get(x.id)).find(Boolean);
                  const un = !!unU;
                  return (
                    <li key={m.id} id={`alu-c-${m.id}`} data-testid="alu-extra-cut" data-highlight={hl ? "true" : "false"}
                      className={`rounded-lg border p-2 ${hl ? "border-primary bg-primary/5 ring-2 ring-primary" : un ? "border-red-300 bg-red-50" : "border-hairline bg-white"}`}>
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm text-ink ${WRAP}`}><b>{m.quantity} × {mm(m.finishedLengthMm)}</b>{m.label ? ` · ${m.label}` : ""}{m.pending ? <span className="text-[11px] text-muted"> · unsaved</span> : null}</p>
                          <p className="text-xs text-muted">{un ? <span className="font-semibold text-red-700" data-testid="alu-cut-unavailable">{unavailableText(unU, n).long}</span> : bars.length ? `On ${bars.join(", ")}` : "Not planned yet"}</p>
                        </div>
                        {canEdit && <Btn kind="ghost" aria-expanded={editing === m.id} aria-label={`Edit cut ${m.label || mm(m.finishedLengthMm)}`} onClick={() => setEditing(editing === m.id ? null : m.id)}>{editing === m.id ? "Hide" : "Edit"}</Btn>}
                      </div>
                      {editing === m.id && (
                        <div key={`ed-${draftReset}`} className="mt-2 space-y-2 border-t border-hairline pt-2">
                          <LabelField label="Label" maxLength={60} value={m.label || ""} onCommit={(t) => updateMeasurement(m, { ...m, label: t || null })} />
                          <div className="grid grid-cols-2 gap-2">
                            <NumberField label="Length" value={m.finishedLengthMm} min={1} max={30000} onCommit={(x) => updateMeasurement(m, { ...m, finishedLengthMm: x })} />
                            <NumberField label="Quantity" unit="pcs" integer min={1} max={500} value={m.quantity} onCommit={(x) => updateMeasurement(m, { ...m, quantity: x })} />
                          </div>
                          <Btn kind="danger" onClick={() => removeMeasurement(m)}>Remove cut</Btn>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {d.runs.length > 0 && (
                <div className="rounded-lg bg-page p-2 text-sm">
                  <p className="text-xs font-medium text-muted">Measured on the plan</p>
                  <ul className="space-y-1">{d.runs.map((x) => {
                    const mid = x.sourceRefs?.[0]?.measurementId;
                    const at = d.cutAt.get(x.id), un = d.unavailable.get(x.id);
                    const hl = focus?.demandId === x.id;
                    return (
                      <li key={x.id} id={mid ? `alu-c-${mid}` : undefined} data-testid="alu-run" data-highlight={hl ? "true" : "false"}>
                        <button type="button" onClick={() => showBar(x.id)} disabled={!at && !un}
                          className={`flex min-h-[44px] w-full items-center gap-2 rounded-lg border px-2 text-left ${WRAP} ${un ? "border-red-300 bg-red-50 text-red-700" : hl ? "border-primary bg-primary/10" : "border-hairline bg-white"}`}>
                          <span className="min-w-0 flex-1">{x.label} — <b>{mm(x.lengthMm)}</b></span>
                          <span className="shrink-0 text-xs text-muted">{at ? at.barName : un ? unavailableText(un, n).short : ""}</span>
                        </button>
                      </li>
                    );
                  })}</ul>
                </div>
              )}
              {canEdit && <AddCutForm key={`add-${draftReset}`} onCreate={addCut} />}
              {canEdit && justCut && (
                <JustAdded key={`added-${draftReset}`} testId="alu-just-added-cut" text={`${mm(justCut.finishedLengthMm)}${justCut.label ? ` · ${justCut.label}` : ""}`}
                  countLabel="Cut quantity" count={justCut.quantity} max={500} onCount={setCutQuantity} />
              )}
            </Section>
          </div>

          <div className="min-w-0 space-y-3">
            {/* ── cutting sheet ───────────────────────────────────── */}
            <Section id="alu-cutting-sheet" title="Cutting sheet" aside={estimate ? <Chip tone="warn">Estimate — kerf not confirmed</Chip> : n ? <Chip tone="good">Kerf {n.kerfMm} mm confirmed</Chip> : null}>
              {!hasDemands && <p className="text-sm text-muted">Nothing to cut yet.</p>}
              {groupProblems.length > 0 && <Banner tone="error">{groupProblems.join(" ")}</Banner>}
              {d.rejected.size > 0 && (
                <Banner tone="error">
                  <p className="font-semibold">These pieces have no valid length and can&apos;t be planned:</p>
                  <ul className="list-disc pl-4">{[...d.rejected.values()].map((r) => <li key={r.demandId}>{sourceOf(d, r.demandId).dem?.label || r.demandId}: {r.message}</li>)}</ul>
                </Banner>
              )}
              {d.sheets.map((s) => {
                const t = s.totals || {};
                const proven = !!s.proven;
                const offcutLen = t.offcutLengthUsedMm || 0;
                return (
                  <div key={s.id} className="space-y-2" data-testid="alu-sheet">
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-2">
                      <p className="text-lg font-semibold text-ink" data-testid="alu-buy">Buy {(s.purchase || []).map((p) => `${p.quantity} × ${mm(p.stockLengthMm)}`).join(", ") || "nothing new"}</p>
                      {s.objective?.offcutsUsed > 0 && <p className="text-sm text-ink" data-testid="alu-offcuts-used">+ uses {plural(s.objective.offcutsUsed, "existing offcut")}</p>}
                      {placed && <p className={`text-sm ${placed.surplus ? "text-amber-900" : "text-ink"}`} data-testid="alu-ordered">{placedText}</p>}
                      {s.unavailable?.length > 0 && <Chip tone="bad" data-testid="alu-buy-blocked">+ {plural(s.unavailable.length, "piece")} can&apos;t be cut from stock — not in this count</Chip>}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Chip tone={proven ? "good" : "warn"} data-testid="alu-proof">{proven ? "Minimum proven" : "Best plan found — minimum not proven"}{s.unavailable?.length ? " for the pieces that fit" : ""}</Chip>
                        <span className="text-xs text-muted" data-testid="alu-lower-bound">Lower bound: {s.lowerBoundUnit === "bars" ? plural(s.lowerBound, "bar") : mm(s.lowerBound)}</span>
                      </div>
                    </div>
                    {(s.unavailable || []).length > 0 && (
                      <div data-testid="alu-unavailable">
                        <Banner tone="error">
                          <p className="font-semibold">Can&apos;t be cut from the {mm(n?.stockLengthMm)} stock — pieces are never joined. Change the opening or detail, or choose a supplier-confirmed longer stock:</p>
                          <ul className="mt-1 space-y-1">
                            {s.unavailable.map((u) => (
                              <li key={u.cutId || u.demandId} className={WRAP}>
                                <button type="button" onClick={() => showSource(u.demandId)} className="min-h-[44px] max-w-full text-left underline">{sourceOf(d, u.demandId).dem?.label || u.demandId} — {mm(u.lengthMm)}</button>
                                <p className="text-xs" data-testid="alu-unavailable-reason">{unavailableText(u, n).long}</p>
                              </li>
                            ))}
                          </ul>
                        </Banner>
                      </div>
                    )}
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                      <dt className="text-muted">Total required length</dt><dd className="text-right font-semibold text-ink" data-testid="alu-required">{mm(t.requiredLengthMm)}</dd>
                      <dt className="text-muted">Cut loss (saw kerf{n?.kerfMm != null ? ` ${n.kerfMm} mm` : " 0 mm"})</dt><dd className="text-right font-semibold text-ink" data-testid="alu-cut-loss">{mm(t.cutLossMm)}</dd>
                      {t.trimLossMm > 0 && <><dt className="text-muted">End trim</dt><dd className="text-right font-semibold text-ink">{mm(t.trimLossMm)}</dd></>}
                      <dt className="text-muted">Reusable remainder{n ? ` (≥ ${mm(n.minRetainedOffcutMm)})` : ""}</dt><dd className="text-right font-semibold text-ink" data-testid="alu-reusable">{t.reusableRemainderMm == null ? "—" : mm(t.reusableRemainderMm)}</dd>
                      <dt className="text-muted">Scrap</dt><dd className="text-right font-semibold text-ink" data-testid="alu-scrap">{t.scrapMm == null ? "—" : mm(t.scrapMm)}</dd>
                    </dl>
                    <p className="text-[11px] text-muted" data-testid="alu-balance">
                      Check: {mm((t.purchasedLengthMm || 0) + offcutLen)} {offcutLen ? `(${mm(t.purchasedLengthMm || 0)} new + ${mm(offcutLen)} offcuts) ` : ""}= {mm(t.requiredLengthMm)} cuts + {mm(t.cutLossMm)} cut loss{t.trimLossMm ? ` + ${mm(t.trimLossMm)} end trim` : ""} + {mm(t.remainderMm)} remainder.
                    </p>
                    <p className="text-[11px] text-muted" data-testid="alu-objective">Objective: {s.objective?.text}</p>
                    <p className="text-[11px] text-muted" data-testid="alu-scope">Pooled: every opening, run and cut of this material on this job, plus the offcuts recorded below — one plan, not one per window.</p>
                    <ul className="space-y-2">
                      {s.bars.map((b) => {
                        const isOpen = openBars.has(b.id);
                        const rem = b.residualMm;
                        const remState = rem <= 0 ? "none — exact fit" : b.residualUsable === true ? "reusable" : b.residualUsable === false ? `scrap (under ${mm(n?.minRetainedOffcutMm)})` : "planned";
                        return (
                          <li key={b.id} id={`alu-bar-${b.id}`} data-testid="alu-bar" data-bar={b.name} className="rounded-lg border border-hairline bg-white">
                            <button type="button" aria-expanded={isOpen} onClick={() => toggleBar(b.id)} className="flex min-h-[44px] w-full items-center gap-2 px-2 py-1 text-left"
                              aria-label={`${b.name}: ${b.source === "offcut" ? "existing offcut" : "new"} ${fmtMm(b.stockLengthMm)} mm, ${plural(b.cuts.length, "cut")}, planned remainder ${fmtMm(rem)} mm`}>
                              <span className="min-w-0 max-w-[50%] truncate font-semibold text-ink">{b.name}</span>
                              <span className="min-w-0 flex-1 text-xs text-muted">{b.source === "offcut" ? "existing offcut" : "new"} {mm(b.stockLengthMm)} · {plural(b.cuts.length, "cut")} · remainder {mm(rem)}</span>
                              <span aria-hidden="true" className="text-muted">{isOpen ? "▴" : "▾"}</span>
                            </button>
                            <div className="px-2 pb-2"><BarStrip bar={b} /></div>
                            {isOpen && (
                              <div className="border-t border-hairline px-2 pb-2 pt-1">
                                <ol className="space-y-1" aria-label={`${b.name} cuts in order`}>
                                  {b.trimLossMm > 0 && <li className="text-xs text-muted">Square the end: {mm(b.trimLossMm)} trim</li>}
                                  {b.cuts.map((c, i) => {
                                    const hl = focus?.demandId === c.demandId;
                                    const wallOf = sourceOf(d, c.demandId).wall;
                                    return (
                                      <li key={c.cutId}>
                                        <button type="button" onClick={() => showSource(c.demandId)} aria-label={`Cut ${i + 1}: ${c.label} ${fmtMm(c.lengthMm)} mm${wallOf ? ` · wall ${wallOf}` : ""}`} data-highlight={hl ? "true" : "false"}
                                          className={`flex min-h-[44px] w-full items-center gap-2 rounded-lg border px-2 text-left text-sm ${hl ? "border-primary bg-primary/10" : "border-hairline"}`}>
                                          <span className="w-5 shrink-0 text-xs text-muted">{i + 1}.</span>
                                          <span className="min-w-0 flex-1"><span className="block truncate text-ink">{c.label}</span>{wallOf && <span className="block truncate text-[10px] text-muted">{wallOf}</span>}</span>
                                          <span className="shrink-0 font-semibold text-ink">{mm(c.lengthMm)}</span>
                                          <span className="w-16 shrink-0 text-right text-[10px] text-muted">{c.usesFinalEnd ? "uses bar end" : c.kerfAfterMm ? `+ ${fmtMm(c.kerfAfterMm)} saw` : ""}</span>
                                        </button>
                                      </li>
                                    );
                                  })}
                                </ol>
                                <div className={`mt-1 rounded-lg px-2 py-1 text-sm ${rem > 0 && b.residualUsable === true ? "bg-emerald-50 text-emerald-900" : "bg-page text-ink"}`} data-testid="alu-bar-remainder">
                                  Planned remainder <b>{mm(rem)}</b> — {remState}. <span className="text-[11px] text-muted">Not stock until this bar is actually cut.</span>
                                </div>
                                {canEdit && rem > 0 && (
                                  <Btn kind="ghost" onClick={() => { setOffcutSeed({ key: `${b.id}:${Date.now()}`, name: b.name, label: `${b.name} remainder`, plannedMm: rem }); scrollTo("alu-offcut-form"); }}>Record remaining offcut</Btn>
                                )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    <details className="rounded-lg border border-hairline px-2">
                      <summary className="flex min-h-[44px] cursor-pointer items-center text-sm text-ink">How this was worked out</summary>
                      <ul className="list-disc space-y-1 pb-2 pl-4 text-xs text-muted">{(s.explain || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
                    </details>
                  </div>
                );
              })}
              {d.sheets.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  <Btn onClick={copySheet}>Copy cutting sheet</Btn>
                  <Btn onClick={download}>Download CSV</Btn>
                </div>
              )}
              {copyMsg && <p role="status" className="text-xs text-muted">{copyMsg}</p>}
              {hasDemands && <p className="text-[11px] text-muted">The supplier order lists whole {n ? mm(n.stockLengthMm) : "stock"} lengths only; this sheet is for site. A cutting plan never adds offcuts to stock.</p>}
            </Section>

            {/* ── offcuts ─────────────────────────────────────────── */}
            <Section title={`Offcuts on hand (${d.offcuts.filter((m) => m.inputs?.status !== "consumed").length})`}>
              <p className="text-[11px] text-muted">Only offcuts you record here are used as stock for this material. Planned remainders are never added automatically.</p>
              {d.offcuts.length === 0 && <p className="text-sm text-muted">No offcuts recorded.</p>}
              <ul className="space-y-2">
                {d.offcuts.map((m) => {
                  const i = m.inputs || {};
                  const consumed = i.status === "consumed";
                  const bar = d.offcutBar.get(m.id);
                  // same test as the engine: a stamped piece is offered only to the profile + finish it was cut from
                  const otherProduct = !!i.identityKey && i.identityKey !== stockKey;
                  return (
                    <li key={m.id} data-testid="alu-offcut" data-offcut={i.label || ""} className={`rounded-lg border p-2 ${consumed ? "border-hairline bg-page" : "border-hairline bg-white"}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={`min-w-0 flex-1 text-sm text-ink ${WRAP}`}><b>{i.label || "Offcut"}</b> · {mm(i.lengthMm)}{i.location ? ` · ${i.location}` : ""}{m.pending ? <span className="text-[11px] text-muted"> · unsaved</span> : null}</p>
                        <Chip tone={consumed ? "neutral" : otherProduct ? "warn" : bar ? "good" : "neutral"} data-testid="alu-offcut-status">{consumed ? "Consumed" : otherProduct ? "Not used — recorded for a different profile or finish" : bar ? `In this plan: ${bar.cuts.map((c) => c.label).join(", ")}` : "Available — not used by this plan"}</Chip>
                      </div>
                      {otherProduct && !consumed && <p className="mt-1 text-[11px] text-amber-900" data-testid="alu-offcut-other">It was recorded for this material before its profile or finish changed, so it is never cut for {material.name} as it is now. Change the material back, or remove the offcut if it is gone.</p>}
                      {!i.identityKey && !consumed && <p className="mt-1 text-[11px] text-amber-900" data-testid="alu-offcut-unstamped">Recorded without its profile and finish — check it is {describeFamilySpec(material.spec).line || "this profile"} before cutting.</p>}
                      {canEdit && (
                        <div className="mt-1 flex flex-wrap gap-2">
                          <Btn onClick={() => updateMeasurement(m, { ...m, inputs: { ...i, status: consumed ? "available" : "consumed" } })}>{consumed ? "Mark available" : "Mark consumed"}</Btn>
                          <Btn kind="ghost" onClick={() => removeMeasurement(m)}>Remove</Btn>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {canEdit && <OffcutForm key={`${offcutSeed?.key || "blank"}-${draftReset}`} seed={offcutSeed} onCreate={addOffcut} onCancelSeed={() => setOffcutSeed(null)} />}
              {canEdit && justOffcuts.length > 0 && (
                <JustAdded key={`added-${draftReset}`} testId="alu-just-added-offcut" verb="Recorded" text={`${labelsText(justOffcuts.map((m) => m.inputs?.label || "Offcut"))} · ${mm(justOffcuts[0].inputs?.lengthMm)}`}
                  countLabel={added.offcut?.seeded ? null : "Identical pieces"} count={justOffcuts.length} max={50} onCount={setOffcutCount} />
              )}
            </Section>
          </div>
        </div>
      </div>
    </FocusedWindow>
  );
}
