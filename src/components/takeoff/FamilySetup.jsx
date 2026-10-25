// =============================================================================
// FamilySetup — compact setup cards for the TC-R04 families (02 §2–3, 05, 11, 12; 07 UX03 / CL05):
//   * TimberSetup    — purpose → "Size and grade" list (HUB 027: the owner's sizes for that purpose + company timber
//                      products saved for it, or Custom) → section/grade/treatment (always shown, editable) →
//                      centres / length source / pitch → 1200 + 300n stock
//   * WallsSetup     — HUB 028 Walls item (studs, plates and noggins from one trace): the parts' needs and the notes
//                      (lintels note first), Name, Stud centres, Double top plate and the Walls line (why a wall isn't
//                      counted under it), then the closed "Studs, plates, noggins" fold (each part's HUB 027 Size and
//                      grade list through WallPartSizeChoice, filled with wallPartFill; Long plates after Plates). No
//                      Purpose chips, no company-product picker and no Save as company product (one tap there would
//                      turn the item into another timber purpose or replace its parts).
//   * CladdingSetup  — material → product (searchable catalogue; Walsc first for AAC) → orientation → assembly
//                      → stock / spares / supplier. Also hosts the support-batten layer and the accessory card.
//   * BattenSetup    — support layer: product/section, orientation, max spacing (required), offsets, existing
//   * AccessorySetup — "source-pending — manual quantities": edits the accessory_routes@1 recipe (rules.recipe) —
//                      items on real wall routes, Include / By others / Exclude (+ reason), reviewed yields with their
//                      source or entered quantities with their authority; never a default yield. AccessoryRecipeEditor
//                      is shared with the company catalogue editor.
//   * AluminiumSetup — profile → 6500 stock → kerf (must be confirmed to order) → window three-edge preset
//
// Every valid change AUTO-APPLIES to the job material (onChange, via useAutoApply) — no Save. Undo/redo is per card
// session. Pass `result` = ws.computed.materialResults[material.id] to show the engine's three statuses / problems.
// Product FACTS come from the catalogue snapshot (with their source refs). Installation stays "source-pending"
// and is shown, never hidden; nothing here invents a spacing, joint, cover or fixing value.
//
// UX03: changing product / material / orientation re-selects cover and assembly from the new product and
// moves every parameter that belonged to the old one into `rules.carried` — the engine never reads it, so an
// old value is never silently applied (a Matrix joint gap is not carried onto Axon). The card flags each one
// with "Use for <new product>" (only when it applies) or "Dismiss".
// =============================================================================
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { TIMBER_COVER_OPTIONS_MM, TIMBER_GRID_SOURCE, TIMBER_PURPOSES, WALL_FRAMING_RULES, WALL_LONG_PLATE_DEFAULT, WALL_PARTS, WALL_PART_LABELS, applyTimberPreset, describeFamilySpec,
  familyProblems, matchTimberChoice, methodFor, normaliseFamilySpec, onTimberGrid, timberPresetLabel, timberPresetMatches, timberPresetsFor, timberProductFill, timberProductMatches,
  wallPartFill, wallPartProducts } from "../../../shared/takeoff/index.js";
import { wallFramingText, wallFramingTotals, wallLongPlateOverText } from "./measure/tools.js";
import { assembliesFor, productGroups, rendexTemplate, specFromGroup } from "../../../shared/takeoff/products/index.js";
import { CATALOGUE_SEED } from "../../../shared/takeoff/products/seed.js";
import { FOAM_TAPE, H_FLASHING, followerRule, followerRuleText } from "../../../shared/takeoff/engine/followers.js";
import { applyCompanyDefault, defaultSummary, findCompanyDefault, isDefaulted, withoutDefaultsFrom } from "../../../shared/takeoff/companyDefaults.js";
import { Banner, Btn, TextField } from "./ui.jsx";

const PURPOSE_LABEL = { rafters: "Rafters", joists: "Joists", studs: "Studs", plates: "Plates", noggins: "Noggins", battens: "Battens", trim: "Trim", other: "Other member" };
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const fmt = (n) => (isNum(n) ? n.toLocaleString("en-AU", { maximumFractionDigits: 1 }) : "?");
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

// ── typed-but-not-applied fields (PH-03 / PH-04) ─────────────────────────────────────────────────────────────
// Every field below keeps its own text and applies it on Enter / blur (one change, one undo step). While a field has
// focus and the user has typed, a newer value from outside (server normalisation, recovery, a colleague) never
// overwrites the text; an untouched field follows it. A card shows "Not saved yet" while any field holds typed text
// that isn't applied, and typed text is applied when the page is hidden (useKeepFieldVisible).
const PendingContext = createContext(null);
function usePendingFields() {
  const [ids, setIds] = useState(() => new Set());
  const report = useCallback((id, on) => setIds((cur) => {
    if (cur.has(id) === on) return cur;
    const n = new Set(cur);
    if (on) n.add(id); else n.delete(id);
    return n;
  }), []);
  return { pending: ids.size > 0, report };
}
function useDraftText(shown, commitFn) {
  const [text, setText] = useState(shown);
  const [edited, setEdited] = useState(false);
  const st = useRef({ focused: false, edited: false });
  const report = useContext(PendingContext);
  const id = useId();
  useEffect(() => { if (!(st.current.focused && st.current.edited)) setText(shown); }, [shown]);
  const pending = edited && text.trim() !== shown;
  useEffect(() => { report?.(id, pending); }, [report, id, pending]);
  useEffect(() => () => report?.(id, false), [report, id]);
  // a field removed while it still holds typed text (the card closed under it) applies that text, never drops it
  const commitRef = useRef(commitFn);
  commitRef.current = commitFn;
  useEffect(() => () => { if (st.current.edited) { try { commitRef.current?.({ unmounting: true }); } catch { /* best effort */ } } }, []);
  return {
    text,
    isEdited: () => st.current.edited,
    type: (v) => { st.current.edited = true; setEdited(true); setText(v); },
    /** the typed text was applied (or matched the value): follow the value again */
    applied: (resync) => { st.current.edited = false; setEdited(false); if (resync) setText(shown); },
    focusProps: { onFocus: () => { st.current.focused = true; }, onBlurCapture: () => { st.current.focused = false; } },
  };
}

/**
 * Number input for values that may be NOT ENTERED. Emptying the field commits null — never 0 (a cleared adhesive
 * joint, kerf, joint gap or overlap must not silently become a real 0 mm value). Invalid text stays a draft with
 * its message; nothing is committed until it's valid. Same look as ui.jsx NumberField.
 */
export function NumberField({ label, value, unit = "mm", onCommit, min = 0, max = Infinity, integer = false, help, autoFocus = false }) {
  const id = useId();
  const shown = isNum(value) ? String(value) : "";
  const [err, setErr] = useState(null);
  const commit = (o = {}) => {
    if (!d.isEdited()) { if (!o.unmounting) { d.applied(true); setErr(null); } return; }
    const t = d.text.trim().replace(/,/g, "");
    // emptied: "not entered" (null). A field showing a default (e.g. centres 600) shows that default again.
    if (t === "") { if (!o.unmounting) { setErr(null); d.applied(true); } if (isNum(value)) onCommit(null); return; }
    const n = Number(t);
    if (!Number.isFinite(n) || n < min || (min > 0 && !integer && n <= 0) || (integer && !Number.isInteger(n))) {
      if (!o.unmounting) setErr(integer ? `Enter a whole number of ${min} or more.` : min > 0 ? "Enter a number greater than 0." : "Enter a number of 0 or more.");
      return;
    }
    if (n > max) { if (!o.unmounting) setErr(`That's more than ${max.toLocaleString("en-AU")}${unit ? ` ${unit}` : ""} — check the number.`); return; }
    if (!o.unmounting) { setErr(null); d.applied(n === value); }
    if (n !== value) onCommit(n);
  };
  const d = useDraftText(shown, commit);
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted">{label}</label>
      <div className="flex items-stretch rounded-lg border border-hairline bg-white focus-within:ring-2 focus-within:ring-primary">
        <input id={id} autoFocus={autoFocus} inputMode={integer ? "numeric" : "decimal"} value={d.text} onChange={(e) => d.type(e.target.value)} onBlur={() => commit()} {...d.focusProps}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} aria-invalid={!!err} aria-describedby={err ? `${id}-err` : undefined}
          className="min-h-[44px] w-full min-w-0 rounded-l-lg border-0 px-3 text-base text-ink focus:ring-0" />
        {unit ? <span className="flex items-center rounded-r-lg bg-page px-3 text-sm text-muted">{unit}</span> : null}
      </div>
      {help && <p className="mt-1 text-[11px] text-muted">{help}</p>}
      {err && <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-red-700">{err}</p>}
    </div>
  );
}

// ── source register (09) — titles for the refs a product / assembly carries ──────────────────────────────────
const SOURCES = Object.freeze({
  H01: ["James Hardie — Axon product page", "product", "https://www.jameshardie.com.au/products/scyon-axon-cladding"],
  H02: ["Axon installation guide (Sep 2026)", "guide", "https://res.cloudinary.com/james-hardie/image/upload/v1723779243/ContentfulCMS/Installation-Guide/Axon_Cladding_Installation_Guide.pdf"],
  H03: ["James Hardie — Linea product page", "product", "https://www.jameshardie.com.au/products/scyon-linea-weatherboard"],
  H04: ["Linea installation guide (Nov 2025)", "guide", "https://www.jameshardie.com.au/ContentfulCMS/Installation-Guide/Linea_weatherboard_Installation_Guide.pdf"],
  H05: ["James Hardie — Stria smooth product page", "product", "https://www.jameshardie.com.au/products/stria-cladding-smooth"],
  H06: ["Stria horizontal installation guide (Nov 2025)", "guide", "https://res.cloudinary.com/james-hardie/image/upload/v1743394864/ContentfulCMS/Installation-Guide/Stria_Cladding_Horizontal_Installation_Guide.pdf"],
  H07: ["Stria vertical installation guide (Nov 2025)", "guide", "https://res.cloudinary.com/james-hardie/image/upload/v1743741254/ContentfulCMS/Installation-Guide/Stria_Cladding_Vertical_Installation_Guide.pdf"],
  H08: ["Hardie Structural Batten — accessory page", "product", "https://www.jameshardie.com.au/accessory/hardie-structural-batten"],
  H09: ["James Hardie — Matrix product page", "product", "https://www.jameshardie.com.au/products/scyon-matrix-cladding"],
  H10: ["Matrix installation guide (Nov 2025)", "guide", "https://www.jameshardie.com.au/ContentfulCMS/Installation-Guide/Matrix_Cladding_Installation_Guide.pdf"],
  H11: ["James Hardie — Stria Fine Texture product page", "product", "https://www.jameshardie.com.au/products/stria-cladding-fine-texture"],
  A01: ["Hebel PowerPanel50 product page", "product", "https://hebel.com.au/products/panels/powerpanel50/"],
  A02: ["Hebel PowerPanelXL product page", "product", "https://hebel.com.au/products/panels/powerpanelxl/"],
  A03: ["Hebel top hats / battens catalogue", "product", "https://hebel.com.au/accessories/top-hats-battens/"],
  A04: ["Walsc External Wall System 50 product page", "product", "https://walsc.com.au/products/walsc-external-wall-system-50"],
  A05: ["Walsc technical library (current guide not readable yet)", "gap", "https://walsc.com.au/resources/technical-library"],
  A06: ["Hebel PowerPanel50 guide (edition not verified)", "gap", "https://hebel.com.au/wp-content/uploads/downloads/1985_yConnect_Document_Hebel-Design-and-Installation-Guide-Houses-and-Low-Rise-Multi-Residential-External-Walls-PowerPanel50-HELIT181.pdf"],
  A07: ["Hebel PowerPanelXL guide (edition not verified)", "gap", "https://hebel.com.au/wp-content/uploads/2025/12/Hebel-Houses-and-Low-Rise-Multi-Residential-External-Walls-PowerPanelXL-Design-and-Installation-Guide_HELIT016_MAY24-1.pdf"],
  T01: ["Pentarch hardwood cladding guide (Jul 2024)", "guide", "https://pentarchforestry.com.au/app/uploads/2024/07/0163_Pentarch_Forestry_Cladding_Installation_Guide_July_24_FINAL_v2.pdf"],
  T02: ["Mortlock Trendplank product page", "product", "https://www.mortlock.com.au/timber-cladding/trend-plank/"],
  T03: ["Trendplank design / install guide", "guide", "https://www.mortlock.com.au/wp-content/uploads/2026/06/Trendplank-Timber-Cladding-Design-Install-Guide-09-18-25-Low-Res_MASTER.pdf"],
  F01: ["Rendex external wall cladding page", "product", "https://www.rendex.com.au/external-wall-cladding"],
  F02: ["Rendex downloads (system + coating documents)", "guide", "https://www.rendex.com.au/downloads"],
  "OWNER-2026-10-14": ["Blue Leaf owner decision, 14 Oct 2026", "owner", null],
  "OWNER-2026-10-25": ["Blue Leaf owner decision, 25 Oct 2026 (timber in 300 mm steps)", "owner", null],
});
const KIND_TEXT = { product: "product facts", guide: "installation guide — rows not reviewed", gap: "not readable — not used as authority", owner: "company setting", other: "entered reference" };

/** Source references with the register title + what each one is evidence for. */
export function SourceRefs({ refs, label = "Sources" }) {
  const list = [...new Set((refs || []).filter(Boolean))];
  if (!list.length) return <p className="text-[11px] text-muted">{label}: none recorded — user-entered values.</p>;
  return (
    <details className="rounded-lg border border-hairline bg-white px-2" data-source-refs={list.join(",")}>
      <summary className="flex min-h-[44px] cursor-pointer items-center text-[11px] text-muted">{label}: <span className="ml-1 font-semibold text-ink">{list.join(", ")}</span></summary>
      <ul className="pb-2">
        {list.map((r) => {
          const [title, kind, url] = SOURCES[r] || [r, "other", null];
          return (
            <li key={r} className="text-[11px] text-ink">
              {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="flex min-h-[44px] items-center text-primary underline">{r} — {title}</a>
                : <span className="flex min-h-[44px] items-center">{r} — {title}</span>}
              <span className="-mt-2 block pb-1 text-muted">{KIND_TEXT[kind] || kind}</span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/** Pick source refs from the register (catalogue editor). */
export function SourcePicker({ value, onChange, label = "Source references" }) {
  const set = new Set(value || []);
  const [other, setOther] = useState("");
  const custom = [...set].filter((r) => !SOURCES[r]);
  const toggle = (r) => { const n = new Set(set); if (n.has(r)) n.delete(r); else n.add(r); onChange([...n]); };
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-medium text-muted">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {[...Object.keys(SOURCES), ...custom].map((r) => (
          <button key={r} type="button" aria-pressed={set.has(r)} title={SOURCES[r]?.[0] || r} onClick={() => toggle(r)}
            className={`min-h-[44px] rounded-lg border px-2 text-xs ${set.has(r) ? "border-primary bg-primary/10 font-semibold text-primary" : "border-hairline text-ink"}`}>{r}</button>
        ))}
      </div>
      <div className="mt-2 flex items-end gap-2">
        <div className="min-w-0 flex-1"><TextField label="Other reference (e.g. supplier data sheet code)" value={other} onChange={(v) => setOther(v.slice(0, 20))} /></div>
        <Btn disabled={!other.trim()} onClick={() => { onChange([...set, other.trim()]); setOther(""); }}>Add</Btn>
      </div>
    </fieldset>
  );
}

const REVIEW = {
  candidate: ["Candidate — not reviewed", "border-amber-200 bg-amber-50 text-amber-900"],
  checked: ["Transcription checked", "border-sky-200 bg-sky-50 text-sky-800"],
  reviewed: ["Reviewed", "border-emerald-200 bg-emerald-50 text-emerald-800"],
  "source-pending": ["Source-pending", "border-amber-200 bg-amber-50 text-amber-900"],
};
/** Review state pill (06 source-row procedure: candidate → checked transcription → reviewed). */
export function ReviewBadge({ state, prefix }) {
  const [label, cls] = REVIEW[state] || REVIEW.candidate;
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{prefix ? `${prefix}: ` : ""}{label}</span>;
}

const STATUS_TEXT = {
  quantity: { incomplete: "Incomplete", estimate: "Estimate", calculated: "Calculated", reviewed: "Reviewed", pending: "Not measured yet", schedule: "See the schedule" },
  installation: { unspecified: "Unspecified", "source-pending": "Source-pending", "supported-by-selected-rule": "Supported by selected rule", "project-detail-supplied": "Project detail supplied", "out-of-scope": "Out of scope" },
  procurement: { draft: "Draft", "missing-product": "Missing product", "unavailable-stock": "Unavailable stock", stale: "Stale", ready: "Ready", "kerf-unconfirmed": "Kerf not confirmed" },
};
const STATUS_TONE = { calculated: "ok", reviewed: "ok", ready: "ok", "supported-by-selected-rule": "ok", "project-detail-supplied": "ok", incomplete: "bad", "missing-product": "bad", "unavailable-stock": "bad", stale: "bad" };
/** The three independent statuses (06) — never collapsed into one. */
export function StatusRow({ status, note }) {
  const tone = { ok: "border-emerald-200 bg-emerald-50 text-emerald-800", bad: "border-red-200 bg-red-50 text-red-700", mid: "border-amber-200 bg-amber-50 text-amber-900" };
  return (
    <div className="space-y-1" data-status-row="">
      <div className="grid grid-cols-3 gap-1.5">
        {["quantity", "installation", "procurement"].map((k) => (
          <div key={k} data-status={k} data-value={status?.[k] || ""} className={`rounded-lg border px-2 py-1 ${tone[STATUS_TONE[status?.[k]] || "mid"]}`}>
            <p className="text-[10px] uppercase tracking-wide opacity-80">{k}</p>
            <p className="text-xs font-semibold leading-tight">{STATUS_TEXT[k][status?.[k]] || "—"}</p>
          </div>
        ))}
      </div>
      {note && <p className="text-[11px] text-muted">{note}</p>}
    </div>
  );
}

export function Chips({ label, value, options, onChange, name, compact = false }) {
  return (
    <fieldset data-chips={name || label}>
      <legend className="mb-1 text-xs font-medium text-muted">{label}</legend>
      <div className={compact ? "grid gap-1" : "flex flex-wrap gap-1.5"} style={compact ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}>
        {options.map(([v, text, disabled]) => (
          <button key={String(v)} type="button" aria-pressed={value === v} disabled={!!disabled} onClick={() => onChange(v)}
            className={`min-h-[44px] rounded-lg border disabled:opacity-40 ${compact ? "px-1 text-xs leading-tight" : "px-3 text-sm"} ${value === v ? "border-primary bg-primary/10 font-semibold text-primary" : "border-hairline text-ink"}`}>{text}</button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Text input that applies on blur / Enter (one change, not one per keystroke). `required` = the message shown when it
 * is emptied: an empty value is then never applied — it stays an inline draft until something is entered.
 */
export function CommitText({ label, value, onCommit, placeholder, maxLength = 80, help, required }) {
  const id = useId();
  const shown = value ?? "";
  const [err, setErr] = useState(null);
  const commit = (o = {}) => {
    if (!d.isEdited()) { if (!o.unmounting) { d.applied(true); setErr(null); } return; }
    const t = d.text.trim();
    if (!t && required) { if (!o.unmounting) setErr(required); return; }
    if (!o.unmounting) { setErr(null); d.applied(t === shown); }
    if (t !== shown) onCommit(t || null);
  };
  const d = useDraftText(shown, commit);
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted">{label}</label>
      <input id={id} value={d.text} placeholder={placeholder} maxLength={maxLength} onChange={(e) => d.type(e.target.value)} onBlur={() => commit()} {...d.focusProps}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} aria-invalid={!!err} aria-describedby={err ? `${id}-err` : undefined}
        className="min-h-[44px] w-full rounded-lg border border-hairline px-3 text-base text-ink focus-ring" />
      {help && <span className="mt-1 block text-[11px] text-muted">{help}</span>}
      {err && <span id={`${id}-err`} role="alert" className="mt-1 block text-xs text-red-700">{err}</span>}
    </div>
  );
}

/** Comma-separated list of lengths (mm). Applies on blur when every entry is a positive number. */
export function LengthList({ label, values, onCommit, help, placeholder = "e.g. 2700, 3000, 3600", validate, allowEmpty = true }) {
  const id = useId();
  const shown = (values || []).join(", ");
  const [err, setErr] = useState(null);
  const commit = (o = {}) => {
    if (!d.isEdited()) { if (!o.unmounting) { d.applied(true); setErr(null); } return; }
    const parts = d.text.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
    const nums = parts.map(Number);
    const fail = (m) => { if (!o.unmounting) setErr(m); };
    if (nums.some((n) => !Number.isFinite(n) || n <= 0 || n > 30000)) { fail("Enter lengths in mm separated by commas, e.g. 2700, 3000."); return; }
    if (!nums.length && !allowEmpty && (values || []).length) { fail("Enter at least one length."); return; }
    const next = [...new Set(nums)].sort((a, b) => a - b);
    const bad = validate ? validate(next) : null;
    if (bad) { fail(bad); return; }
    const same = next.join(",") === (values || []).join(",");
    if (!o.unmounting) { setErr(null); d.applied(same); }
    if (!same) onCommit(next);
  };
  const d = useDraftText(shown, commit);
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted">{label}</label>
      <div className="flex items-stretch rounded-lg border border-hairline bg-white focus-within:ring-2 focus-within:ring-primary">
        <input id={id} value={d.text} placeholder={placeholder} inputMode="decimal" onChange={(e) => d.type(e.target.value)} onBlur={() => commit()} {...d.focusProps}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} aria-invalid={!!err} aria-describedby={err ? `${id}-err` : undefined}
          className="min-h-[44px] w-full min-w-0 rounded-l-lg border-0 px-3 text-base text-ink focus:ring-0" />
        <span className="flex items-center rounded-r-lg bg-page px-3 text-sm text-muted">mm</span>
      </div>
      {help && <span className="mt-1 block text-[11px] text-muted">{help}</span>}
      {err && <span id={`${id}-err`} role="alert" className="mt-1 block text-xs text-red-700">{err}</span>}
    </div>
  );
}

// ── keyboard: keep the focused field (and its message) above the on-screen keyboard ─────────────────────────
function scrollParent(el) {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}
function useKeepFieldVisible() {
  const ref = useRef(null);
  const [pad, setPad] = useState(0);
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    let t = null;
    const reveal = () => {
      const el = document.activeElement;
      const vv = window.visualViewport;
      const kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      if (!el || !root.contains(el) || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) { setPad(0); return; }
      setPad(kb); // room to scroll the last field above the keyboard
      requestAnimationFrame(() => {
        const top = vv ? vv.offsetTop : 0, bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
        const r = el.getBoundingClientRect();
        // a sticky footer (e.g. the catalogue editor's Save bar) sits right above the keyboard — keep the field above it too
        const foot = root.querySelector("[data-sticky-footer]");
        const fr = foot ? foot.getBoundingClientRect() : null;
        const footH = fr && fr.top < bottom && fr.bottom > top ? Math.min(fr.height, bottom - fr.top) : 0;
        const below = r.bottom + 56 + footH - bottom; // the field + its help / error line
        const above = top + 8 - r.top;
        const delta = below > 0 ? below : above > 0 ? -above : 0;
        if (!delta) return;
        const sc = scrollParent(el);
        if (sc) sc.scrollTop += delta; else window.scrollBy(0, delta);
      });
    };
    const soon = () => { clearTimeout(t); t = setTimeout(reveal, 120); };
    const off = () => { clearTimeout(t); t = setTimeout(() => { if (!root.contains(document.activeElement)) setPad(0); }, 150); };
    // PH-04: a typed value counts once the page is hidden (app switch, reload, the phone locking): blur the field so it
    // applies — and reaches autosave / device recovery — instead of being lost. Capture phase, so it runs before the
    // workspace writes its recovery copy. Invalid text stays as typed, with its message.
    const commitTyped = () => {
      const el = document.activeElement;
      if (el && root.contains(el) && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) el.blur();
    };
    const vis = () => { if (document.visibilityState === "hidden") commitTyped(); };
    root.addEventListener("focusin", soon);
    root.addEventListener("focusout", off);
    window.visualViewport?.addEventListener("resize", soon);
    window.addEventListener("resize", soon);
    document.addEventListener("visibilitychange", vis, true);
    window.addEventListener("pagehide", commitTyped, true);
    return () => {
      clearTimeout(t); root.removeEventListener("focusin", soon); root.removeEventListener("focusout", off); window.visualViewport?.removeEventListener("resize", soon); window.removeEventListener("resize", soon);
      document.removeEventListener("visibilitychange", vis, true); window.removeEventListener("pagehide", commitTyped, true);
    };
  }, []);
  return { ref, pad };
}

/** A container that keeps its focused field above the on-screen keyboard (for screens outside the setup cards). */
export function KeyboardSafe({ children, className = "", ...rest }) {
  const kb = useKeepFieldVisible();
  return <div ref={kb.ref} className={className} style={{ paddingBottom: kb.pad }} {...rest}>{children}</div>;
}

// ── auto-apply + undo/redo for one job material ──────────────────────────────────────────────────────────────
const slim = (m) => ({ name: m?.name ?? "", spec: m?.spec ?? {}, rules: m?.rules ?? {} });
function useAutoApply(value, onChange) {
  const latest = useRef(value);
  const sent = useRef(JSON.stringify(slim(value)));
  const hist = useRef({ past: [], future: [] });
  const [, setTick] = useState(0);
  const [error, setError] = useState(null);
  const refresh = () => setTick((n) => n + 1);
  // adopt a newer version from outside (server normalisation, recovery) — never our own echo
  useEffect(() => {
    const j = JSON.stringify(slim(value));
    if (j !== sent.current) { latest.current = value; sent.current = j; refresh(); }
  }, [value]);
  const emit = (raw) => {
    let full;
    const next = syncConditions(raw); // installConditions follow the route / coating / orientation chosen (PH-11)
    try {
      normaliseFamilySpec(next.spec);
      const m = methodFor(next.spec);
      if (!m) throw new Error("Unknown material family.");
      full = { ...next, methodKey: m.key, methodVersion: m.version };
    } catch (e) { setError(e.message); refresh(); return null; }
    setError(null);
    latest.current = full;
    sent.current = JSON.stringify(slim(full));
    onChange(full);
    refresh();
    return full;
  };
  const update = (fn) => {
    const prev = latest.current;
    const full = emit(fn(prev));
    if (full) hist.current = { past: [...hist.current.past, prev].slice(-100), future: [] };
    return full;
  };
  const patch = (p) => update((c) => ({ ...c, ...p, spec: { ...c.spec, ...(p.spec || {}) }, rules: { ...(c.rules || {}), ...(p.rules || {}) } }));
  const undo = () => {
    const h = hist.current;
    if (!h.past.length) return;
    const cur = latest.current;
    if (emit(h.past[h.past.length - 1])) hist.current = { past: h.past.slice(0, -1), future: [cur, ...h.future] };
  };
  const redo = () => {
    const h = hist.current;
    if (!h.future.length) return;
    const cur = latest.current;
    if (emit(h.future[0])) hist.current = { past: [...h.past, cur], future: h.future.slice(1) };
  };
  return { cur: latest.current, update, patch, undo, redo, canUndo: hist.current.past.length > 0, canRedo: hist.current.future.length > 0, error };
}

function UndoBar({ d, pending = false, note = "Changes save automatically to this job only." }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-1 rounded-lg border border-hairline bg-page/95 px-2 shadow-[0_-12px_0_0_theme(colors.page)] backdrop-blur" data-undo-bar="" data-pending={pending ? "true" : "false"}>
      <p aria-live="polite" className={`min-w-0 flex-1 text-[11px] ${pending ? "font-semibold text-amber-800" : "text-muted"}`}>{pending ? "Not saved yet — press Enter or tap outside the field." : note}</p>
      <Btn kind="ghost" aria-label="Undo" title="Undo" disabled={!d.canUndo} onClick={d.undo} className="inline-flex min-w-[44px] items-center gap-1 px-2">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
        <span className="text-xs">Undo</span>
      </Btn>
      <Btn kind="ghost" aria-label="Redo" title="Redo" disabled={!d.canRedo} onClick={d.redo} className="inline-flex min-w-[44px] items-center gap-1 px-2">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></svg>
        <span className="text-xs">Redo</span>
      </Btn>
    </div>
  );
}

// ── catalogue helpers ────────────────────────────────────────────────────────────────────────────────────────
const groupCache = new Map();
function groupsFor(family) {
  if (!groupCache.has(family)) groupCache.set(family, productGroups({ family }));
  return groupCache.get(family);
}
function groupOf(spec) {
  if (!spec?.product?.id || !["cladding", "aac", "batten"].includes(spec.family)) return null;
  return groupsFor(spec.family).find((g) => g.id === spec.product.id) || null;
}
const isGrid = (g) => g?.layout === "grid";
function optionTitle(g, sku) {
  if (isGrid(g)) { const k = g.skus.find((x) => x.sku === sku) || g.skus[0]; return `${g.name} ${fmt(k.lengthMm)} × ${fmt(g.widthMm)}`; }
  if (g.family === "aac" || g.family === "batten") return g.name.startsWith(g.manufacturer.split(" ").pop()) ? g.name : `${g.manufacturer} ${g.name}`;
  return g.layout === "course" ? `${g.name} ${fmt(g.widthMm)}` : g.name; // course profiles differ by width
}
/** One pickable option per product group (per SKU for a panel grid — a grid uses ONE panel format). */
function productOptions(family) {
  const pref = CATALOGUE_SEED.preferredSystems?.[family] || null;
  const out = [];
  for (const g of groupsFor(family)) {
    const preferred = !!pref && g.manufacturer === pref;
    const skus = isGrid(g) ? g.skus : [null];
    for (const k of skus) {
      const title = optionTitle(g, k?.sku);
      const lengths = k ? [k.lengthMm] : g.lengthsMm;
      const detail = [g.manufacturer, `${fmt(g.widthMm)} wide`, g.effectiveCoverMm ? `cover ${fmt(g.effectiveCoverMm)}` : null, `${fmt(g.thicknessMm)} thick`, `${lengths.map(fmt).join(" / ")} long`].filter(Boolean).join(" · ");
      out.push({ key: k ? `${g.id}#${k.sku}` : g.id, group: g, sku: k?.sku || null, title, detail, preferred, search: `${g.manufacturer} ${g.name} ${title} ${g.skus.map((x) => x.sku).join(" ")}`.toLowerCase() });
    }
  }
  return out;
}
function productLabel(spec) {
  const p = spec?.product || {};
  const g = groupOf(spec);
  if (g) return optionTitle(g, p.sku);
  if (spec?.family === "timber-cladding") return [p.name || "Timber cladding", spec.supplierName ? `from ${spec.supplierName}` : null].filter(Boolean).join(" ");
  if (p.manufacturer && p.name && !p.name.startsWith(p.manufacturer.split(" ").pop())) return `${p.manufacturer} ${p.name}`;
  return p.name || p.manufacturer || FAMILY_LABEL[spec?.family] || "the old product";
}

const ASSEMBLY_LABEL = {
  "axon-vertical": "Axon — vertical sheets, direct or cavity", "linea-horizontal": "Linea — horizontal weatherboards",
  "stria-smooth-horizontal": "Stria smooth — horizontal", "stria-smooth-vertical": "Stria smooth — vertical on Structural Batten",
  "stria-fine-texture": "Stria Fine Texture — guide applicability to confirm", "matrix-grid": "Matrix — expressed-joint grid on cavity battens",
  hebel50: "Hebel PowerPanel50 system", hebelxl: "Hebel PowerPanelXL system", walsc50: "Walsc External Wall System 50",
  "pentarch-horizontal": "Pentarch hardwood — horizontal on vertical cavity battens", "pentarch-vertical": "Pentarch hardwood — vertical boards",
  trendplank: "Mortlock Trendplank — end-matched, continuous cavity", "rendex-eps": "Rendex EPS — direct or cavity",
};
/** Readable name for a seeded assembly candidate id. */
export function AssemblyName({ id }) { return <>{ASSEMBLY_LABEL[id] || id}</>; }
const orientationOk = (a, o) => (/horizontal/.test(a.id) ? o === "horizontal" : /vertical/.test(a.id) ? o === "vertical" : true);
// which family / manufacturer each researched assembly belongs to (CL05: brands and wall systems are never mixed;
// 12: Rendex foam never takes a fibre-cement or AAC assembly). null maker = chosen per board by the user.
const ASSEMBLY_SCOPE = {
  "axon-vertical": ["cladding", "James Hardie"], "linea-horizontal": ["cladding", "James Hardie"], "stria-smooth-horizontal": ["cladding", "James Hardie"],
  "stria-smooth-vertical": ["cladding", "James Hardie"], "stria-fine-texture": ["cladding", "James Hardie"], "matrix-grid": ["cladding", "James Hardie"],
  hebel50: ["aac", "Hebel"], hebelxl: ["aac", "Hebel"], walsc50: ["aac", "Walsc"],
  "pentarch-horizontal": ["timber-cladding", null], "pentarch-vertical": ["timber-cladding", null], trendplank: ["timber-cladding", null], "rendex-eps": ["foam", "Rendex"],
};
/**
 * Candidate assemblies for this product + method (ignoring orientation when `anyOrientation`). A researched product
 * gets the assemblies that name it; a user-entered product only its own family's and manufacturer's ones.
 */
// eslint-disable-next-line react-refresh/only-export-components -- shared with CatalogueEditor (same rules for the company catalogue)
export function assemblyCandidates(spec, { anyOrientation = false } = {}) {
  const m = methodFor(spec);
  if (!m) return [];
  const method = `${m.key}@${m.version}`;
  const all = CATALOGUE_SEED.assemblyCandidates;
  const g = groupOf(spec);
  const maker = String(spec.product?.manufacturer || "").trim().toLowerCase();
  const list = g ? assembliesFor(g) : all.filter((a) => {
    const [fam, mk] = ASSEMBLY_SCOPE[a.id] || [];
    return fam === spec.family && (!mk || (!!maker && maker.startsWith(mk.toLowerCase())));
  });
  return list.filter((a) => (a.method === method || spec.family === "foam") && (anyOrientation || orientationOk(a, spec.orientation || "vertical")));
}
/**
 * Re-select: keep the current assembly when it still fits, else the first candidate for a researched product (or
 * Rendex foam). A user-entered product (custom fibre cement, a timber board) is never matched to a named
 * manufacturer's assembly automatically — the user chooses it.
 */
// eslint-disable-next-line react-refresh/only-export-components -- shared with CatalogueEditor (same rules for the company catalogue)
export function reselectAssembly(spec) {
  const c = assemblyCandidates(spec);
  if (c.some((a) => a.id === spec.assemblyId)) return spec.assemblyId;
  return spec.family === "foam" || groupOf(spec) ? c[0]?.id || null : null;
}
/** Orientations a course / board product has an assembly for (both when nothing is listed). */
// eslint-disable-next-line react-refresh/only-export-components -- shared with CatalogueEditor (same rules for the company catalogue)
export function orientationsFor(spec) {
  const all = assemblyCandidates(spec, { anyOrientation: true });
  const o = new Set(all.flatMap((a) => (/horizontal/.test(a.id) ? ["horizontal"] : /vertical/.test(a.id) ? ["vertical"] : ["horizontal", "vertical"])));
  return all.length ? o : new Set(["horizontal", "vertical"]);
}
const assemblyById = (id) => CATALOGUE_SEED.assemblyCandidates.find((a) => a.id === id) || null;

// ── installation conditions (PH-11): rules.installConditions = { <assembly selector>: value } ──────────────────
// The engine selects a guide rule row by these conditions (none is reviewed yet, so installation stays
// source-pending). Each is the user's own entry for THIS job — never inferred (02: no wind class from the suburb).
// Selectors already chosen elsewhere on the card are written from that choice: the fixing route (rules.route),
// the foam coating and the board orientation.
const WIND_CLASSES = ["N1", "N2", "N3", "N4", "N5", "N6", "C1", "C2", "C3", "C4"];
const CONDITION_FIELDS = {
  wind: { label: "Wind class", select: WIND_CLASSES.map((w) => [w, w]), help: "From this site's wind classification — never inferred from the suburb." },
  "on-or-off-stud": { label: "Fixed on or off the studs", chips: [["on-stud", "On studs"], ["off-stud", "Off studs"]] },
  "fixing-style": { label: "Fixing style", chips: [["face", "Face fixed"], ["concealed", "Concealed"]] },
  substrate: { label: "Substrate (what it fixes to)", placeholder: "e.g. timber frame, steel frame" },
  "fixing-family": { label: "Fastener type", placeholder: "e.g. nails, screws" },
  "edge-zone": { label: "Edge zone (from the wind detail)" },
  "profile-width": { label: "Profile width" },
  "small-wall": { label: "Narrow-wall detail" },
  "batten-joints": { label: "Batten joint detail" },
  "exact-guide-applicability": { label: "Guide that covers this exact product" },
  "support-detail": { label: "Support detail reference" },
  grid: { label: "Panel grid detail" },
  "joint-backing": { label: "Joint backing detail" },
  "current-guide": { label: "Current guide (title and edition)" },
  "storey-support": { label: "Storey / floor support detail" },
  "rail-system": { label: "Rail system" },
  "movement-joints": { label: "Movement joint detail" },
  "exact-profile": { label: "Exact profile" },
  "effective-cover": { label: "Effective cover source" },
  species: { label: "Species" },
  "butt-joints": { label: "Butt joint detail" },
  drainage: { label: "Drainage detail" },
  "exact-profile-cover": { label: "Exact profile and cover" },
  "end-matching": { label: "End matching" },
  "stock-policy": { label: "Stock length policy" },
  "exact-system": { label: "Exact system" },
  "panel-size": { label: "Panel size" },
  thickness: { label: "Thickness" },
  "joint-layout": { label: "Joint layout detail" },
  "coating-scope": { label: "Coating scope" },
  // written from another choice on the card
  "direct-or-cavity": { label: "Fixing route (direct fix or cavity)", from: "route" },
  cavity: { label: "Fixing route (direct fix or cavity)", from: "route" },
  "factory-or-applicator-coated": { label: "Coating (factory or applicator)", from: "coating" },
  orientation: { label: "Orientation", from: "orientation" },
};
const DERIVED_CONDITIONS = Object.keys(CONDITION_FIELDS).filter((k) => CONDITION_FIELDS[k].from);
const conditionLabel = (k) => CONDITION_FIELDS[k]?.label || k.replace(/-/g, " ");
const filled = (v) => v !== undefined && v !== null && v !== "";
const withoutDerived = (ic) => {
  if (!ic || typeof ic !== "object") return null;
  const out = Object.fromEntries(Object.entries(ic).filter(([k, v]) => !DERIVED_CONDITIONS.includes(k) && filled(v)));
  return Object.keys(out).length ? out : null;
};
/** The conditions written from other choices on the card, for the selected assembly's selectors only. */
function derivedConditions(m) {
  const req = new Set(assemblyById(m.spec?.assemblyId)?.requiredSelectors || []);
  const r = m.rules || {}, s = m.spec || {}, out = {};
  for (const k of ["direct-or-cavity", "cavity"]) if (req.has(k) && (r.route === "direct" || r.route === "cavity")) out[k] = r.route;
  if (req.has("factory-or-applicator-coated") && (s.coating === "factory" || s.coating === "applicator")) out["factory-or-applicator-coated"] = s.coating;
  if (req.has("orientation") && (s.orientation === "horizontal" || s.orientation === "vertical")) out.orientation = s.orientation;
  return out;
}
const sameFlat = (a, b) => { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every((k) => a[k] === b[k]); };
/** Keep rules.installConditions in step with the route / coating / orientation chosen on the card (never stale). */
function syncConditions(m) {
  if (!m?.rules && !m?.spec?.assemblyId) return m;
  const r = m.rules || {};
  const cur = r.installConditions && typeof r.installConditions === "object" ? r.installConditions : {};
  const next = { ...(withoutDerived(cur) || {}), ...derivedConditions(m) };
  if (sameFlat(cur, next)) return m;
  const rules = { ...r };
  if (Object.keys(next).length) rules.installConditions = next; else delete rules.installConditions;
  return { ...m, rules };
}

// ── UX03: parameters that belong to a product / orientation / method ───────────────────────────────────────
const PARAMS = {
  adhesiveJointMm: { label: "Adhesive joint", unit: "mm", methods: ["aac_panel_layout"], bound: "product" },
  minStripMm: { label: "Minimum cut strip", unit: "mm", methods: ["panel_grid", "aac_panel_layout"], bound: "product" },
  jointGapMm: { label: "Joint gap", unit: "mm", methods: ["panel_grid"], bound: "product" },
  productGapMm: { label: "Joint gap", unit: "mm", methods: ["panel_grid"], bound: "product", target: "gapMm" },
  jointRows: { label: "Sheet joint rows", methods: ["sheet_layout"], bound: "product" },
  jointRowsDraft: { label: "Unfinished sheet joint rows", methods: ["sheet_layout"], bound: "product" },
  heightAllowanceMm: { label: "Sheet height allowance", unit: "mm", methods: ["sheet_layout"], bound: null },
  joints: { label: "Board joint rule", methods: ["course_layout"], bound: "orientation" },
  jointsDraft: { label: "Unfinished board joint rule", methods: ["course_layout"], bound: "orientation" },
  panelOrientation: { label: "Panel orientation", methods: ["panel_grid"], bound: "product" },
  installConditions: { label: "Installation conditions", methods: ["sheet_layout", "course_layout", "panel_grid", "area_to_linear", "aac_panel_layout"], bound: "product" },
  fixing: { label: "Support fixing rule", methods: ["support_grid"], bound: "product" },
  fixingDraft: { label: "Unfinished support fixing rule", methods: ["support_grid"], bound: "product" },
  datumMm: { label: "Layout datum", unit: "mm", methods: ["sheet_layout", "course_layout"], bound: null },
  maxSpacingMm: { label: "Max support spacing", unit: "mm", methods: ["support_grid"], bound: "orientation" },
  spacingRef: { label: "Spacing authority", methods: ["support_grid"], bound: "orientation" },
  startOffsetMm: { label: "Start offset", unit: "mm", methods: ["support_grid"], bound: null },
  endOffsetMm: { label: "End offset", unit: "mm", methods: ["support_grid"], bound: null },
  existing: { label: "Existing supports", methods: ["support_grid"], bound: null },
  coverMm: { label: "Effective cover", unit: "mm", methods: ["course_layout", "area_to_linear"], bound: "supplier", target: "effectiveCoverMm" },
  recipe: { label: "Accessory items", methods: ["accessory_routes"], bound: null },
  scope: { label: "Accessory group decisions", methods: ["accessory_routes"], bound: null },
  route: { label: "Fixing route", methods: ["sheet_layout", "course_layout", "panel_grid", "area_to_linear", "aac_panel_layout"], bound: "product" },
  // a company assembly version is tied to the assembly it was duplicated from — handled after the loop in carry()
  assembly: { label: "Company assembly version", methods: [], bound: null, special: true },
};
const BOUND_BY = { product: ["product", "orientation"], family: ["product", "orientation"], orientation: ["orientation"], supplier: ["supplier"], method: [] };
const paramApplies = (key, methodKey) => !!PARAMS[key]?.methods.includes(methodKey);
const readParam = (mat, key) => {
  if (PARAMS[key].target) return mat.spec?.product?.[PARAMS[key].target] ?? null;
  // the route / coating / orientation conditions follow those choices — only the user's own entries are carried
  if (key === "installConditions") return withoutDerived(mat.rules?.installConditions);
  return mat.rules?.[key] ?? null;
};
function paramText(key, v) {
  const d = PARAMS[key];
  if ((key === "jointRows" || key === "jointRowsDraft") && v && typeof v === "object") return `at ${(v.atMm || []).map(fmt).join(", ") || "?"} mm, ${fmt(v.gapMm)} mm gap${v.detailRef ? ` (${v.detailRef})` : ""}`;
  if (key === "recipe" && v && typeof v === "object") return `(${(v.groups || []).length} item${(v.groups || []).length === 1 ? "" : "s"})`;
  if (key === "scope" && v && typeof v === "object") return `(${Object.keys(v).length} group${Object.keys(v).length === 1 ? "" : "s"})`;
  if (key === "route") return v === "cavity" ? "cavity" : "direct fix";
  if ((key === "joints" || key === "jointsDraft") && v && typeof v === "object") return `(${v.mode === "off-support" ? "between supports" : `over supports${isNum(v.centresMm) ? ` at ${fmt(v.centresMm)} mm` : ""}`}${v.detailRef ? `, ${v.detailRef}` : ""})`;
  if (key === "installConditions" && v && typeof v === "object") return `(${Object.entries(v).map(([k, x]) => `${conditionLabel(k).toLowerCase()} ${x}`).join("; ")})`;
  if ((key === "fixing" || key === "fixingDraft") && v && typeof v === "object") return `(${v.ruleRef || "entered rule"})`;
  if (key === "panelOrientation") return v === "landscape" ? "landscape" : "portrait";
  if (key === "assembly" && v && typeof v === "object") return `“${v.label || "Company version"}”${v.baseId ? ` (based on ${ASSEMBLY_LABEL[v.baseId] || v.baseId})` : ""}`;
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (v && typeof v === "object") return "set";
  return `${typeof v === "number" ? fmt(v) : v}${d?.unit ? ` ${d.unit}` : ""}`;
}
/**
 * Move every parameter of `prev` that the change makes incompatible out of the active rules / product into
 * rules.carried (flagged, never applied). `next` already has its new spec. Returns the adjusted material.
 */
// eslint-disable-next-line react-refresh/only-export-components -- shared with CatalogueEditor (same rules for the company catalogue)
export function carry(prev, next, reason) {
  const newMethod = methodFor(next.spec)?.key;
  const bound = BOUND_BY[reason] || [];
  const from = `${productLabel(prev.spec)}${reason === "orientation" ? ` (${prev.spec?.orientation || "vertical"})` : ""}`.slice(0, 60);
  const rules = { ...(next.rules || {}) };
  const carried = { ...(rules.carried || {}) };
  const product = { ...(next.spec.product || {}) };
  // the product object itself is unchanged for these reasons, so an old product value is still in place
  const sameProduct = reason === "supplier" || reason === "orientation" || reason === "method";
  // values entered before ANY product was chosen were entered for this choice, not for another product
  const hadProduct = !!(prev.spec?.product?.id || prev.spec?.product?.name);
  for (const [key, def] of Object.entries(PARAMS)) {
    if (def.special) continue;
    const old = readParam(prev, key);
    if (old == null) continue;
    if (def.bound === "supplier" && reason !== "supplier") continue; // a product fact replaced with the product, not a user setting
    const used = def.methods.includes(newMethod);
    if (used && !(def.bound && bound.includes(def.bound))) continue; // compatible and not tied to what changed
    if (used && reason === "product" && !hadProduct) continue;
    if (def.target) {
      const now = product[def.target] ?? null;
      if (sameProduct) product[def.target] = null; // take the stale value out of the calculation
      else if (now != null && JSON.stringify(now) === JSON.stringify(old)) continue; // the new product has the same sourced value
    } else delete rules[key];
    carried[key] = { value: clone(old), from };
    if (key === "scope" && rules.scopeReasons) { carried.scope.reasons = clone(rules.scopeReasons); delete rules.scopeReasons; } // reasons travel with their decisions
  }
  // a company assembly version based on an assembly that is no longer selected is flagged, never kept silently
  if (rules.assembly && typeof rules.assembly === "object" && (rules.assembly.baseId || null) !== (next.spec.assemblyId || null)) {
    carried.assembly = { value: clone(rules.assembly), from };
    delete rules.assembly;
  }
  if (["product", "family", "supplier"].includes(reason)) delete rules.review; // review states belonged to the old product's facts
  if (Object.keys(carried).length) rules.carried = carried; else delete rules.carried;
  return { ...next, spec: { ...next.spec, product }, rules };
}
/** Only the product / method parameters carry() manages, plus any open "check these" flags (e.g. before starting a different kind of product). */
// eslint-disable-next-line react-refresh/only-export-components -- shared with CatalogueEditor (same rules for the company catalogue)
export const productParams = (rules) => Object.fromEntries(Object.entries(rules || {}).filter(([k]) => PARAMS[k] || k === "carried"));
const withoutCarried = (rules, key) => {
  const c = { ...(rules?.carried || {}) };
  delete c[key];
  const out = { ...(rules || {}) };
  if (Object.keys(c).length) out.carried = c; else delete out.carried;
  return out;
};

/** "Check these" flags for parameters moved out by carry(). `note` adds context (e.g. the catalogue editor). */
export function CarriedFlags({ cur, update, note }) {
  const carried = cur.rules?.carried || {};
  const keys = Object.keys(carried).filter((k) => PARAMS[k]);
  if (!keys.length) return null;
  const mk = methodFor(cur.spec)?.key;
  const now = productLabel(cur.spec);
  const use = (k) => update((c) => {
    const v = clone(c.rules.carried[k].value);
    const reasons = k === "scope" ? clone(c.rules.carried.scope.reasons) : null;
    const rules = withoutCarried(c.rules, k);
    if (PARAMS[k].target) return { ...c, rules, spec: { ...c.spec, product: { ...c.spec.product, [PARAMS[k].target]: v } } };
    if (k === "installConditions") return { ...c, rules: { ...rules, installConditions: { ...(rules.installConditions || {}), ...v } } };
    return { ...c, rules: { ...rules, [k]: v, ...(reasons ? { scopeReasons: reasons } : {}) } };
  });
  const dismiss = (k) => update((c) => ({ ...c, rules: withoutCarried(c.rules, k) }));
  return (
    <div role="status" data-carried="" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950">
      <p className="text-xs font-semibold">Check these — they belonged to the previous choice and are NOT being used:</p>
      {note && <p className="text-[11px]">{note}</p>}
      {keys.map((k) => {
        const { value, from } = carried[k];
        const otherOrientation = (k === "joints" || k === "jointsDraft") && value?.orientation && value.orientation !== (cur.spec?.orientation || null);
        const applies = paramApplies(k, mk) && !otherOrientation;
        return (
          <div key={k} data-carried-param={k} className="rounded-md bg-white/70 p-2">
            <p className="text-sm"><b>{PARAMS[k].label} {paramText(k, value)}</b> was set for {from}.{" "}
              {applies ? <>It&apos;s a product/system value — confirm it for {now} before using it.</> : <>It doesn&apos;t apply to {now}.</>}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {applies && <Btn onClick={() => use(k)}>Use {paramText(k, value)} for {now.length > 28 ? "this product" : now}</Btn>}
              <Btn kind="ghost" onClick={() => dismiss(k)}>{applies ? "Discard" : "Dismiss"}</Btn>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── shared card pieces ───────────────────────────────────────────────────────────────────────────────────────
function NeedsRow({ needs }) {
  if (!needs.length) return null;
  return (
    <div role="status" data-needs="" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <p className="text-xs font-semibold">Needs…</p>
      <ul className="ml-4 list-disc space-y-0.5">{needs.map((n) => <li key={n}>{n}</li>)}</ul>
      <p className="mt-1 text-[11px]">You can keep measuring — it just can&apos;t go on an order yet.</p>
    </div>
  );
}

const FOAM_PLACEHOLDER = "Rendex EPS (enter product)";
/** Panel size of a panel-grid product: { w, l, square } (null until both are known). */
function panelSize(spec) {
  const p = spec?.product || {};
  const w = p.widthMm, l = p.lengthMm ?? (p.lengthsMm || [])[0];
  return isNum(w) && isNum(l) ? { w, l, square: w === l } : null;
}
// ── support fixings (PH-02): rules.fixing = { identity, mode, pitchMm | countPerLine, edgeStartMm, edgeEndMm, ruleRef },
// rules.fixingScope = { status: "by-others" | "exclude", reason }. An unfinished rule is kept as rules.fixingDraft (the
// engine never reads it) so a half-entered rule is never quantified.
const FASTENER_FIELDS = [["material", "Fastener material", "e.g. galvanised steel"], ["corrosionClass", "Corrosion class", "e.g. C3"], ["head", "Head", "e.g. bugle, flat"], ["substrate", "Fixes into", "e.g. timber stud"]];
function fixingGaps(f) {
  const id = f?.identity || {}, gaps = [];
  if (!(FASTENER_FIELDS.every(([k]) => filled(id[k])) && isNum(id.lengthMm))) gaps.push("the fastener (material, corrosion class, length, head, what it fixes into)");
  if (f?.mode === "pitch") { if (!isNum(f.pitchMm) || f.pitchMm <= 0) gaps.push("the fixing spacing"); if (!isNum(f.edgeStartMm) || !isNum(f.edgeEndMm)) gaps.push("the first and last fixing distances"); }
  else if (f?.mode === "pattern") { if (!(Number.isInteger(f.countPerLine) && f.countPerLine >= 1)) gaps.push("the number of fixings per batten"); }
  else gaps.push("how they are spaced");
  if (!filled(f?.ruleRef)) gaps.push("the rule reference");
  return gaps;
}
function fixingNeeds(r) {
  if (r.existing === true) return []; // existing supports are not purchased or fixed
  const scope = r.fixingScope?.status || "include";
  if (scope !== "include") return filled(r.fixingScope?.reason) ? [] : [`Record why the support fixings are ${SCOPE_WHY[scope]}.`];
  if (r.fixing && !r.fixingDraft) return [];
  const gaps = fixingGaps(r.fixingDraft || r.fixing || {});
  return [`Support fixings: enter ${gaps.join(", ")} — or mark them by others / excluded.`];
}
function setupNeeds(cur, result) {
  const s = cur.spec || {}, r = cur.rules || {};
  const mk = methodFor(s)?.key;
  const out = [];
  if (s.family !== "accessory") {
    for (const p of familyProblems(s)) {
      if (s.family === "batten" && /Effective cover/.test(p.message)) continue; // a support batten has no cladding cover
      if (s.family === "foam" && p.message === "Choose the product.") { out.push("Enter the exact Rendex product / system name."); continue; }
      if (s.family === "timber-cladding" && s.supply === "random" && /stock length/.test(p.message)) { out.push("Enter the lengths in the supplier's random mix — recorded for the order, not used to count boards."); continue; }
      out.push(p.message);
    }
    if (s.family === "foam" && s.product?.name === FOAM_PLACEHOLDER) out.push("Enter the exact Rendex product / system name.");
  }
  if (mk === "aac_panel_layout" && !isNum(r.adhesiveJointMm)) out.push("Enter the system's approved adhesive joint from the current guide for this exact system — it is never defaulted.");
  if (mk === "panel_grid" && !isNum(s.product?.gapMm) && !isNum(r.jointGapMm)) out.push("Enter the expressed-joint gap from the selected assembly.");
  if (mk === "support_grid" && !isNum(r.maxSpacingMm)) out.push("Enter the maximum support spacing from the selected rule or project detail — no default spacing is assumed.");
  if (mk === "support_grid") out.push(...fixingNeeds(r));
  if (mk === "panel_grid" && panelSize(s) && !panelSize(s).square && !["portrait", "landscape"].includes(r.panelOrientation)) out.push("Choose portrait or landscape panels.");
  // 02 §2: projected rafter lengths need the roof pitch — it is never assumed (a cleared pitch is not 0°)
  if (s.family === "timber" && ["rafters", "joists", "battens"].includes(s.purpose) && (r.lengthSource || "projected") === "projected" && !isNum(r.pitchDeg)) out.push("Enter the roof pitch — projected rafter lengths need it.");
  if (mk === "course_layout" && !r.joints && (result?.problems || []).some((p) => p.code === "needs_layout")) out.push("Some runs are longer than the longest board — add the board joint rule (Board joints) from the detail.");
  if (s.family === "accessory") {
    const groups = Array.isArray(r.recipe?.groups) ? r.recipe.groups : [];
    if (!s.product?.name) out.push("Name the accessory set.");
    if (!groups.length) out.push("Add the accessory items this set includes.");
    const open = groups.filter((g) => accessoryGroupNeeds(g, groups).length);
    if (open.length) out.push(`Finish ${open.length === 1 ? "this item" : `these ${open.length} items`}: ${open.map(groupName).join(", ")}.`);
  }
  const pending = Object.keys(r.carried || {}).filter((k) => paramApplies(k, mk));
  if (pending.length) out.push(`Confirm or re-enter: ${pending.map((k) => PARAMS[k].label.toLowerCase()).join(", ")}.`);
  return [...new Set(out)];
}

/** Static component rows from the selected assembly: unresolved is shown, never zero (05 B4/B5, 04 C5, 12). */
function componentRows(s, r = {}) {
  const sys = productLabel(s);
  const a = assemblyById(s.assemblyId);
  const rows = (a?.activeInstallationRows || []).length;
  const fixings = rows ? ["Fixings", `${rows} reviewed rule row(s) selected`, "ok"] : ["Fixings", `No reviewed fixing row is active for ${sys} — fixings are unresolved (not zero).`, "open"];
  if (s.family === "aac") return [
    ["Panels", "From your walls: whole panels, shortest listed length per run, no offcut reuse, no inferred lintels.", "ok"],
    ["Rails", `${sys} rail spacing isn't seeded — enter a reviewed rail layout or quantity.`, "open"],
    fixings,
    ["Adhesive", "Bags need the system's reviewed yield — the joint width sets the layout only.", "open"],
    ["Mesh", "Needs the coating system's coverage policy.", "open"],
    ["Control joints", `Positions from the ${sys} guide — limits are never inferred.`, "open"],
    ["Cut-reinforcement treatment", "Needs the system's reviewed yield.", "open"],
    ["Coating", "Net finish area is shown; product quantity needs the reviewed yield.", "open"],
  ];
  if (s.family === "foam") {
    const factory = s.coating === "factory";
    return [
      ["Sheets", "From your walls: whole sheets per occupied cell (no AAC rails or adhesive — foam is its own family).", "ok"],
      fixings,
      ["Joint treatment", "Needs the system's joint detail and yield.", "open"],
      ["Mesh", factory ? "Factory-coated: only if the system's joint detail says so." : "Mesh coverage policy is not selected.", factory ? "na" : "open"],
      ["Basecoat / finish coat", factory ? "Factory-coated: not ordered again on site." : s.coating === "applicator" ? "Net finish area shown; yield unresolved." : "Choose factory- or applicator-coated first.", factory ? "na" : "open"],
    ];
  }
  if (s.family === "batten") {
    const scope = r.fixingScope?.status || "include";
    const fix = r.existing === true ? ["Fixings", "Existing supports — no fixings are ordered.", "na"]
      : scope !== "include" ? ["Fixings", `${SCOPE_TEXT[scope]}${filled(r.fixingScope?.reason) ? ` — ${r.fixingScope.reason}` : " — record why"}. Recorded as omitted, not as zero.`, filled(r.fixingScope?.reason) ? "na" : "open"]
        : r.fixing && !r.fixingDraft ? ["Fixings", `From ${r.fixing.ruleRef} — counted per batten on the order.`, "ok"]
          : ["Fixings", "Fixings not quantified — detail required.", "open"];
    return [["Supports", "From your walls once the maximum spacing is set: clipped at openings and rakes.", "ok"], fix];
  }
  if (s.family === "accessory") return [];
  // wall-by-wall step 4: Axon, Linea / Stria and timber cladding work out their own battens (and Axon its tape and H-flashing)
  // (a direct-fixed Linea / Stria / timber still reads "Direct fix: no battens" here, like a direct-fixed Axon)
  const own = followerRule({ methodKey: methodFor(s)?.key, rules: { ...r, route: undefined } }, { family: s.family, orientation: s.orientation || "vertical" });
  const auto = own ? { ...own, battens: r.route !== "direct" } : null;
  const supports = auto ? (!auto.battens ? ["Battens", "Direct fix: no battens.", "na"]
    // the route is still the user's choice (never stored for them): until it is chosen, the battens are counted as a cavity
    : !r.route ? ["Battens", `Counted as a cavity until you choose: ${followerRuleText(auto)}. Choose Direct fix if it's fixed straight to the frame.`, needsRoute(a) ? "open" : "ok"]
      : ["Battens", `Worked out from your walls: ${followerRuleText(auto)}. Hardie Cavity Batten, offcuts shared across the walls. Nothing to set up; fixings to the studs are not counted.`, "ok"])
    : !needsRoute(a) || !r.route ? ["Supports", `${needsRoute(a) ? "Choose direct fix or cavity, then a" : "A"}dd a Support battens material for any cavity / support layer (or record existing framing).`, "open"]
      : r.route === "cavity" ? ["Supports", "Cavity: add a Support battens material for the cavity battens — spacing from the reviewed rule or project detail.", "open"]
        : ["Supports", "Direct fix: no batten layer — fixes to the existing frame. Record the frame as existing supports for a fixing layout.", "open"];
  const out = [[s.family === "timber-cladding" ? (s.supply === "random" ? "Boards (LM estimate)" : "Boards") : s.layout === "grid" ? "Panels" : s.layout === "course" ? "Boards / courses" : "Sheets", "From your walls and openings (conservative — partly used cells still buy a whole piece).", "ok"],
    supports];
  if (auto?.extras) out.push(["Foam tape and H-flashing", `Worked out from the sheets: foam tape behind every vertical sheet join (${FOAM_TAPE.rollMm / 1000} m rolls, code ${FOAM_TAPE.code}) and H-flashing on every horizontal joint (${H_FLASHING.lengthMm.toLocaleString("en-AU")} mm lengths, code ${H_FLASHING.code}).`, "ok"]);
  out.push(fixings);
  if (s.layout === "grid") out.push(["Joint / backing strips", "From the layout's joints — strip product not selected.", "open"]);
  return out;
}
function ComponentRows({ spec, rules }) {
  const rows = componentRows(spec, rules);
  if (!rows.length) return null;
  return (
    <fieldset className="rounded-lg border border-hairline p-2" data-components="">
      <legend className="px-1 text-xs font-semibold text-ink">What the assembly needs</legend>
      <ul className="space-y-1">
        {rows.map(([name, text, tone]) => (
          <li key={name} data-component={name} className="flex gap-2 text-[12px]">
            <span className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${tone === "ok" ? "bg-emerald-500" : tone === "na" ? "bg-slate-300" : "bg-amber-500"}`} aria-hidden />
            <span><b className="text-ink">{name}:</b> <span className="text-muted">{text}</span></span>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

function ReviewSummary({ rules }) {
  const rv = rules?.review;
  if (!rv) return null;
  return (
    <div className="flex flex-wrap gap-1" data-review-summary="">
      {/* the installation review is of the source transcription — the engine's installation status is shown separately */}
      {["product", "ordering", "installation"].map((g) => rv[g] ? <ReviewBadge key={g} prefix={g === "installation" ? "Installation source" : g[0].toUpperCase() + g.slice(1)} state={rv[g].state} /> : null)}
    </div>
  );
}

/**
 * The engine's statuses as shown on a card. The engine reports quantity "calculated" for a material with nothing
 * measured (a calculation of nothing); the card says "Not measured yet" instead — it never shows more than the
 * engine gave, and never "Calculated" for an empty takeoff.
 */
function shownStatus(result) {
  if (!result?.status) return null;
  // nothing measured yet is "not measured", never "Calculated" — and not a red "Incomplete" either
  const empty = !(result.demands || []).length && !(result.layouts || []).length && (result.problems || []).some((p) => p.code === "nothing_measured");
  return empty && (result.status.quantity === "calculated" || result.status.quantity === "incomplete") ? { ...result.status, quantity: "pending" } : result.status;
}
const NO_RESULT_NOTE = "Quantities are worked out from this job's measurements and shown on the schedule.";

const UNIT_WORD = { piece: ["piece", "pieces"], sheet: ["sheet", "sheets"], bar: ["bar", "bars"], box: ["box", "boxes"], bag: ["bag", "bags"], roll: ["roll", "rolls"],
  pack: ["pack", "packs"], cartridge: ["cartridge", "cartridges"], lm: ["LM", "LM"], m2: ["m²", "m²"], ml: ["ml", "ml"] };
const qtyText = (l) => {
  const q = Math.round((l.quantity || 0) * 1000) / 1000;
  const [one, many] = UNIT_WORD[l.unit] || [l.unit || "", l.unit || ""];
  return `${q.toLocaleString("en-AU")} ${q === 1 ? one : many}`;
};
/**
 * What this material puts on the order right now — the schedule lines for it (pass `lines` = the generic schedule
 * lines of this material) plus the engine's own working for an LM estimate. After an edit (e.g. cover 120 → 90) the
 * previous quantity stays visible, so the effect of the change is seen before leaving the card.
 */
function QuantityPreview({ lines, result }) {
  const mine = (lines || []).filter((l) => l.generic);
  const text = mine.map((l) => `${qtyText(l)} · ${l.item?.description || ""}`).join("\n");
  const last = useRef(text);
  const [was, setWas] = useState(null);
  useEffect(() => {
    if (last.current !== text) { setWas(last.current || "nothing yet"); last.current = text; }
  }, [text]);
  if (!lines) return null;
  const lmWorking = (result?.layouts || []).some((l) => /^area_to_linear/.test(l.method || "")) ? (result.explain || []).slice(0, 3) : [];
  // measured, but a missing value stops the calculation (e.g. no pitch): say so — it isn't "add it to walls"
  const probs = result?.problems || [];
  const blocked = !probs.some((p) => p.code === "nothing_measured") && probs.some((p) => p.blocking !== false);
  return (
    <section className="rounded-lg border border-hairline bg-white px-3 py-2" data-quantity-preview="" aria-live="polite">
      <p className="text-xs font-semibold text-ink">On the order now (this job)</p>
      {mine.length ? (
        <ul className="mt-0.5 space-y-0.5 text-[12px] text-ink">
          {mine.map((l) => (
            <li key={l.bucketKey} data-preview-line={l.unit}><b>{qtyText(l)}</b>{l.spareQuantity ? <span data-preview-spare=""> (incl. {l.spareQuantity} spare)</span> : null} · {l.item?.description}
              {l.problems?.length ? <span className="text-amber-800"> · not orderable yet</span> : null}</li>
          ))}
        </ul>
      ) : blocked ? <p className="text-[12px] text-amber-900" data-preview-blocked="">No quantity yet — see why below.</p>
        : <p className="text-[12px] text-muted">Nothing yet — add this material to walls or measurements.</p>}
      {lmWorking.length > 0 && <ul className="mt-1 space-y-0.5 text-[11px] text-muted" data-preview-working="">{lmWorking.map((e) => <li key={e}>{e}</li>)}</ul>}
      {was && <p className="mt-1 text-[11px] text-muted" data-preview-was="">Changed from: {was.split("\n").map((x) => x.split(" · ")[0]).join(", ")}</p>}
    </section>
  );
}

/** An engine problem in plain words (the installation selectors are internal keys — say what they mean). */
function problemText(p) {
  const missing = p.code === "installation_selectors_missing" ? p.refs?.find((r) => Array.isArray(r?.missing))?.missing : null;
  if (missing?.length) return `Installation conditions still needed: ${[...new Set(missing.map((k) => conditionLabel(k).toLowerCase()))].join(", ")}.`;
  return p.message;
}
/** Problems the engine reported for this material (when the caller passes its materialResults entry). Blocking first. */
function EngineProblems({ result }) {
  const all = [...new Map((result?.problems || []).map((p) => [problemText(p), { text: problemText(p), blocking: p.blocking !== false }])).values()];
  const list = [...all.filter((p) => p.blocking), ...all.filter((p) => !p.blocking)];
  if (!list.length) return null;
  const shown = list.slice(0, 6), rest = list.slice(6);
  const item = (p) => <li key={p.text} className={p.blocking ? "" : "text-muted"}>{p.text}</li>;
  return (
    <div className="rounded-lg border border-hairline bg-white px-3 py-2" data-engine-problems="">
      <p className="text-xs font-semibold text-ink">From the calculation</p>
      <ul className="ml-4 list-disc space-y-0.5 text-[12px] text-ink">{shown.map(item)}</ul>
      {rest.length > 0 && (
        <details>
          <summary className="flex min-h-[44px] cursor-pointer items-center text-[12px] text-primary">Show {rest.length} more</summary>
          <ul className="ml-4 list-disc space-y-0.5 text-[12px] text-ink">{rest.map(item)}</ul>
        </details>
      )}
    </div>
  );
}

/** The aluminium kerf is its own state — a complete profile isn't a "missing product" (PH-18). */
function withKerfState(status, spec) {
  if (!status || spec?.family !== "aluminium" || spec.kerfConfirmed) return status;
  const other = familyProblems(spec).filter((p) => !/kerf/i.test(p.message));
  return !other.length && ["missing-product", "draft"].includes(status.procurement) ? { ...status, procurement: "kerf-unconfirmed" } : status;
}

function SetupStatus({ cur, result, needs }) {
  if (result?.status) return <><StatusRow status={shownStatus(result)} note="From the calculation for this job's walls." /><EngineProblems result={result} /></>;
  const a = assemblyById(cur.spec?.assemblyId);
  const installation = a && (a.activeInstallationRows || []).length ? "supported-by-selected-rule" : "source-pending";
  const productGaps = familyProblems(cur.spec || {}).filter((p) => !(cur.spec?.family === "batten" && /Effective cover/.test(p.message)));
  return <StatusRow status={{ quantity: needs.length ? "incomplete" : "schedule", installation, procurement: productGaps.length ? "missing-product" : "draft" }}
    note={`${NO_RESULT_NOTE} Installation stays source-pending until a guide row is reviewed.`} />;
}

function AvailabilityChips({ value, onChange }) {
  return <Chips label="Availability" name="availability" value={value || "confirm_with_supplier"} onChange={onChange}
    options={[["confirm_with_supplier", "Confirm with supplier"], ["supplier_confirmed", "Supplier confirmed"]]} />;
}

// ── Timber ───────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * HUB 027 "Size and grade": one list right after Purpose. Built-in rows are the owner's sizes for that purpose
 * (studs MGP10; the others size only, no treatment, no LVL); company rows are timber products saved for the same
 * purpose and fill their own section, grade, treatment, species and supplier exactly as saved. A built-in pick clears
 * a product's hidden supplier code and species. A pick is ONE change (one Undo step, autosaved). Custom changes
 * nothing: the fields below stay for an unusual size. The list shows the choice the saved fields match exactly
 * (nothing new is stored). Ordering setup only, never a structural size.
 */
function TimberSizeChoice({ d, presets, builtIn: ownBuiltIn = null, products: ownProducts = null, fillProduct = timberProductFill, lvlHint = true }) {
  const s = d.cur.spec || {};
  // HUB 028: a Walls part passes its own rows, products and fill (wallPartFill: the product's stock too); a Timber card
  // uses its purpose's rows and products, filled with timberProductFill (HUB 027, unchanged)
  const builtIn = ownBuiltIn || timberPresetsFor(s.purpose);
  const purposeProducts = useMemo(() => (presets || []).filter((p) => p?.isActive !== false && p?.spec?.family === "timber" && p.spec.purpose === s.purpose && p.rules?.companyDefault !== true), [presets, s.purpose]);
  const products = ownProducts || purposeProducts;
  // the row last picked here: shown while the fields still hold it (two choices can hold the same fields), "custom"
  // until another row is picked; otherwise the list shows what the saved fields match
  const [picked, setPicked] = useState(null);
  const id = useId();
  if (!builtIn.length && !products.length) return null;
  const match = matchTimberChoice(s, builtIn, products);
  const holds = picked === "custom" || builtIn.some((x) => x.id === picked && timberPresetMatches(s, x)) || products.some((x) => x.id === picked && timberProductMatches(s, x));
  const shown = holds ? picked : match || "";
  const pick = (v) => {
    setPicked(v);
    if (v === "custom") return;
    const preset = builtIn.find((x) => x.id === v);
    if (preset) { d.update((c) => ({ ...c, spec: applyTimberPreset(c.spec, preset) })); return; }
    const product = products.find((x) => x.id === v);
    if (product) d.update((c) => ({ ...c, spec: fillProduct(c.spec, product.spec) }));
  };
  return (
    <div data-timber-choice={shown || "none"}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted">Size and grade</label>
      <select id={id} value={shown} onChange={(e) => pick(e.target.value)}
        className="min-h-[44px] w-full min-w-0 rounded-lg border border-hairline bg-white px-3 text-base text-ink focus-ring">
        {!shown && <option value="" disabled>Choose a size…</option>}
        {builtIn.map((p) => <option key={p.id} value={p.id}>{timberPresetLabel(p)}</option>)}
        {products.length > 0 && (
          <optgroup label="Company products">
            {products.map((p) => <option key={p.id} value={p.id} data-company-product={p.id}>{`${p.name} — ${describeFamilySpec(p.spec).line}`}</option>)}
          </optgroup>
        )}
        <option value="custom">Custom (enter below)</option>
      </select>
      {lvlHint && s.purpose === "studs" && <p className="mt-1 text-[11px] text-muted" data-lvl-hint="">LVL: pick your supplier&apos;s LVL from the company products. The app doesn&apos;t assume an LVL grade or treatment.</p>}
    </div>
  );
}

export function TimberSetup({ value, onChange, result, lines, presets = null }) {
  const d = useAutoApply(value, onChange);
  const kb = useKeepFieldVisible();
  const pf = usePendingFields();
  const set = d.patch;
  const cur = d.cur, s = cur.spec || {}, r = cur.rules || {};
  const repeated = ["rafters", "joists", "battens"].includes(s.purpose);
  const studs = s.purpose === "studs";
  // 02 §2: pitch belongs to projected RAFTER lengths. Joists and battens measured on a plan are already their length.
  const source = r.lengthSource || "projected";
  const setPurpose = (v) => d.update((c) => {
    const rules = { ...(c.rules || {}) };
    if (["joists", "battens"].includes(v) && (rules.lengthSource || "projected") === "projected") rules.lengthSource = "true";
    return { ...c, spec: { ...c.spec, purpose: v }, rules };
  });
  const needs = setupNeeds(cur, result);
  return (
    <PendingContext.Provider value={pf.report}>
    <div ref={kb.ref} className="space-y-3" style={{ paddingBottom: kb.pad }} data-setup="timber">
      <UndoBar d={d} pending={pf.pending} />
      <CommitText label="Name" value={cur.name} required="Give the material a name." onCommit={(t) => set({ name: t })} placeholder="e.g. Rafters 90 × 45" />
      <Chips label="Purpose" name="purpose" value={s.purpose} options={TIMBER_PURPOSES.map((p) => [p, PURPOSE_LABEL[p]])} onChange={setPurpose} />
      <TimberSizeChoice key={s.purpose} d={d} presets={presets} />
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Section depth" value={s.section?.depthMm} onCommit={(n) => set({ spec: { section: { ...s.section, depthMm: n } } })} />
        <NumberField label="Section width" value={s.section?.widthMm} onCommit={(n) => set({ spec: { section: { ...s.section, widthMm: n } } })} />
        <CommitText label="Grade (e.g. MGP10)" value={s.grade} maxLength={40} onCommit={(t) => set({ spec: { grade: t } })} />
        <CommitText label="Treatment (e.g. H3)" value={s.treatment} maxLength={40} onCommit={(t) => set({ spec: { treatment: t } })} />
      </div>
      <p className="text-[11px] text-muted">Size: <b>manual selection</b>{s.sizing?.reference ? ` — ${s.sizing.reference}` : ""}. The app does not check structural adequacy.</p>
      {(repeated || studs) && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Centres" value={r.centresMm ?? 600} min={1} onCommit={(n) => set({ rules: { centresMm: n } })} />
          <Chips label="Spacing" value={r.spacing || "fixed"} options={[["fixed", "Fixed centres"], ["equal", "Equal spacing"]]} onChange={(v) => set({ rules: { spacing: v } })} />
        </div>
      )}
      {repeated && (
        <>
          <Chips label="Member length from" name="length-source" value={source} onChange={(v) => set({ rules: { lengthSource: v } })}
            options={s.purpose === "rafters" || source === "projected" ? [["projected", "Measure projection"], ["true", "Measure true length"], ["entered", "Enter cut length"]]
              : [["true", "Measure length"], ["entered", "Enter cut length"]]} />
          {source === "projected" && <NumberField label="Pitch" unit="°" value={r.pitchDeg} max={75} onCommit={(n) => set({ rules: { pitchDeg: n } })} help="Applies to projected lengths only — never to a true length." />}
          {r.lengthSource === "entered" && <NumberField label="Cut length" value={r.enteredLengthMm} onCommit={(n) => set({ rules: { enteredLengthMm: n } })} />}
        </>
      )}
      {studs && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Stud cut length (or frame height)" value={r.studHeightMm} onCommit={(n) => set({ rules: { studHeightMm: n } })} />
          <Chips label="That is" value={r.heightMode || "stud"} options={[["stud", "Stud cut"], ["frame", "Frame height"]]} onChange={(v) => set({ rules: { heightMode: v } })} />
          {r.heightMode === "frame" && <NumberField label="Bottom plate(s) thickness" value={r.bottomPlateMm} onCommit={(n) => set({ rules: { bottomPlateMm: n } })} />}
          {r.heightMode === "frame" && <NumberField label="Top plate(s) thickness" value={r.topPlateMm} onCommit={(n) => set({ rules: { topPlateMm: n } })} />}
          <p className="col-span-2 text-[11px] text-muted">Base studs only — kings, jacks, trimmers and lintels come from each opening&apos;s framing detail, never guessed.</p>
        </div>
      )}
      {s.purpose === "plates" && (
        <Chips label="Plates per wall" value={(r.plateLayers || ["bottom", "top"]).length === 3 ? 3 : 2} onChange={(v) => set({ rules: { plateLayers: v === 3 ? ["bottom", "top", "top-2"] : ["bottom", "top"] } })}
          options={[[2, "Bottom + top"], [3, "Bottom + double top"]]} />
      )}
      {s.purpose === "noggins" && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Stud centres" value={r.centresMm ?? 600} min={1} onCommit={(n) => set({ rules: { centresMm: n } })} />
          <NumberField label="Noggin rows" unit="" integer min={1} value={r.nogginRows} onCommit={(n) => set({ rules: { nogginRows: n } })} help="From the framing detail — never inferred." />
        </div>
      )}
      <fieldset className="rounded-lg border border-hairline p-2">
        <legend className="px-1 text-xs font-semibold text-ink">Stock</legend>
        <p className="text-sm text-ink">1200 mm, then every 300 mm (1500, 1800, 2100 …) — same at every supplier.</p>
        <NumberField label="Longest available length (optional)" value={s.stock?.maxMm} onCommit={(n) => set({ spec: { stock: { ...s.stock, maxMm: n } } })} help="Longer members are flagged unavailable — never clamped or joined." />
        <LengthList label="Grid lengths this supplier doesn't stock (optional)" values={s.stock?.unavailableMm} placeholder="e.g. 6600"
          validate={(v) => (v.some((l) => !onTimberGrid(l)) ? "Only grid lengths (1200, 1500, 1800 …) can be marked unavailable — off-grid sizes are never added." : null)}
          onCommit={(v) => set({ spec: { stock: { ...s.stock, unavailableMm: v } } })} help="A member that needs one of these moves up to the next available grid length." />
        <SourceRefs refs={["OWNER-2026-10-14", TIMBER_GRID_SOURCE]} label="Stock rule" />
      </fieldset>
      <details className="rounded-lg border border-hairline px-2 py-1">
        <summary className="min-h-[44px] cursor-pointer py-3 text-sm text-ink">More (offsets, allowance, ends, plies, supplier)</summary>
        <div className="grid grid-cols-2 gap-2 pb-2">
          <NumberField label="Start offset" value={r.startOffsetMm ?? 0} min={0} onCommit={(n) => set({ rules: { startOffsetMm: n } })} />
          <NumberField label="End offset" value={r.endOffsetMm ?? 0} min={0} onCommit={(n) => set({ rules: { endOffsetMm: n } })} />
          <NumberField label="End allowance (true length)" value={s.endAllowanceMm ?? 0} min={0} onCommit={(n) => set({ spec: { endAllowanceMm: n } })} help="0 unless you set one — no hidden allowance." />
          <NumberField label="Plies" unit="" integer min={1} value={s.plies ?? 1} onCommit={(n) => set({ spec: { plies: n } })} />
          <Chips label="First member" value={r.includeStart !== false} options={[[true, "Included"], [false, "Excluded"]]} onChange={(v) => set({ rules: { includeStart: v } })} />
          <Chips label="Last member" value={r.includeEnd !== false} options={[[true, "Included"], [false, "Excluded"]]} onChange={(v) => set({ rules: { includeEnd: v } })} />
          <CommitText label="Supplier" value={s.supplierName} onCommit={(t) => set({ spec: { supplierName: t } })} />
          <CommitText label="Size reference (schedule/drawing)" value={s.sizing?.reference} onCommit={(t) => set({ spec: { sizing: { provenance: t ? "engineer-schedule" : "manual", reference: t } } })} />
          <div className="col-span-2"><AvailabilityChips value={s.availability} onChange={(v) => set({ spec: { availability: v } })} /></div>
        </div>
      </details>
      {d.error && <Banner tone="error">{d.error}</Banner>}
      <NeedsRow needs={needs} />
      <QuantityPreview lines={lines} result={result} />
      <ReviewSummary rules={r} />
      <StatusRow status={shownStatus(result) || { quantity: needs.length ? "incomplete" : "schedule", installation: "unspecified", procurement: familyProblems(s).length ? "missing-product" : "draft" }}
        note={result?.status ? "From the calculation for this job. Timber size is a manual selection." : `Timber size is a manual selection. ${NO_RESULT_NOTE}`} />
      {result?.status && <EngineProblems result={result} />}
    </div>
    </PendingContext.Provider>
  );
}

// ── Walls (HUB 028) ──────────────────────────────────────────────────────────────────────────────────────────
/** Long plates' one built-in row: Sam's round 3 "90 × 45 LVL" (the other parts use their HUB 027 purpose rows). */
const LONG_PLATE_ROW = Object.freeze({ id: "longPlates-90x45-lvl", depthMm: WALL_LONG_PLATE_DEFAULT.depthMm, widthMm: WALL_LONG_PLATE_DEFAULT.widthMm, grade: WALL_LONG_PLATE_DEFAULT.grade });
/** The HUB 027 purpose a Walls part's built-in rows and company products come from (Long plates are plates). */
const partPurpose = (part) => (part === "longPlates" ? "plates" : part);

/**
 * One Walls part's "Size and grade" list: HUB 027's TimberSizeChoice through a small adaptor. It shows and edits
 * spec.components[part] (as if it were a timber spec of that part's purpose), lists that part's built-in rows and
 * the company products saved for it (wallPartProducts: pine plates for Plates, LVL plates for Long plates), and a
 * product pick fills the part with wallPartFill (the product's longest length and "not stocked" lengths too). A pick is
 * ONE change (one Undo step). Rendered with one key per part, so a pick can never show against another part.
 */
function WallPartSizeChoice({ d, part, presets }) {
  const purpose = partPurpose(part);
  const asSpec = (c) => ({ ...(c.spec?.components?.[part] || {}), purpose });
  const pd = {
    cur: { spec: asSpec(d.cur) },
    update: (fn) => d.update((c) => {
      const next = { ...fn({ ...c, spec: asSpec(c) }).spec };
      delete next.purpose;
      return { ...c, spec: { ...c.spec, components: { ...(c.spec?.components || {}), [part]: next } } };
    }),
  };
  return <TimberSizeChoice d={pd} presets={presets} builtIn={part === "longPlates" ? [LONG_PLATE_ROW] : timberPresetsFor(purpose)}
    products={wallPartProducts(presets, part)} fillProduct={(s, ps) => wallPartFill(s, ps, part)} lvlHint={false} />;
}

/** The normaliser's bounds for a part's lengths (over 0, up to 1,000,000 mm), so a refused value is said at the field. */
const PART_MM = Object.freeze({ min: 1, max: 1000000 });

/**
 * One part in the fold: its Size and grade list, then section, grade, treatment and longest length (always editable).
 * The "not stocked" lengths a saved product brought with it are shown (read only) under the longest length, because
 * they change what is bought (6,000 not stocked → "Long plates (over 5.7 m)").
 */
function WallPart({ d, part, presets }) {
  const p = d.cur.spec?.components?.[part] || {};
  const set = (patch) => d.update((c) => ({ ...c, spec: { ...c.spec, components: { ...(c.spec?.components || {}), [part]: { ...(c.spec?.components?.[part] || {}), ...patch } } } }));
  const over = part === "longPlates" ? wallLongPlateOverText(d.cur.spec) : "";
  const title = part === "longPlates" && over ? `${WALL_PART_LABELS[part]} (${over})` : WALL_PART_LABELS[part];
  const notStocked = Array.isArray(p.stock?.unavailableMm) ? p.stock.unavailableMm : [];
  return (
    <fieldset className="space-y-2 rounded-lg border border-hairline p-2" data-wall-part={part}>
      <legend className="px-1 text-xs font-semibold text-ink">{title}</legend>
      <WallPartSizeChoice key={part} d={d} part={part} presets={presets} />
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Section depth" value={p.section?.depthMm} {...PART_MM} onCommit={(n) => set({ section: { ...(p.section || {}), depthMm: n } })} />
        <NumberField label="Section width" value={p.section?.widthMm} {...PART_MM} onCommit={(n) => set({ section: { ...(p.section || {}), widthMm: n } })} />
        <CommitText label="Grade (e.g. MGP10)" value={p.grade} maxLength={40} onCommit={(t) => set({ grade: t })} />
        <CommitText label="Treatment (e.g. H3)" value={p.treatment} maxLength={40} onCommit={(t) => set({ treatment: t })} />
      </div>
      <NumberField label="Longest length" value={p.stock?.maxMm} {...PART_MM} onCommit={(n) => set({ stock: { ...(p.stock || {}), maxMm: n } })} />
      {notStocked.length > 0 && <p className="text-[11px] text-muted" data-wall-part-not-stocked="">Not stocked: {notStocked.map((l) => `${Math.round(l).toLocaleString("en-AU")}`).join(", ")} mm</p>}
    </fieldset>
  );
}

/**
 * The Walls card (the Line panel's "Details ›" and the overview row's Setup), title "Walls", header button "Trace
 * walls". At the top, what the parts still need before ordering (each need names its part, "Plates: enter the
 * treatment …", Long plates only once a plate uses them: the needs "Details: n to fix" counts) and the item's plain
 * notes (the lintels note first: "Lintels, jacks and trimmers at D1, W1 aren't counted."). Then Name, Stud centres,
 * Double top plate and the Walls line, with why any wall isn't counted straight under it (as on the Line panel). Then
 * the closed "Studs, plates, noggins" fold: each part's Size and grade list (the HUB 027 list through
 * WallPartSizeChoice), section, grade, treatment and longest length, Long plates after Plates.
 * No Purpose chips, no company-product picker and no Save as company product, so a Walls item stays a Walls item; no
 * offsets, plies or spares.
 */
export function WallsSetup({ value, onChange, result, presets = null, notCounted = [] }) {
  const d = useAutoApply(value, onChange);
  const kb = useKeepFieldVisible();
  const pf = usePendingFields();
  const cur = d.cur;
  const r = cur.rules || {};
  const problems = result?.problems || [];
  // the Needs are the parts' (what "Details: n to fix" counts); why a wall isn't counted sits under the Walls line,
  // as on the Line panel
  const needs = [...new Set((result ? problems.filter((p) => p.code === "material_incomplete" && p.part) : familyProblems(cur.spec || {})).map((p) => p.message))];
  const blocked = [...new Set(problems.filter((p) => p.blocking !== false && !(p.code === "material_incomplete" && p.part)).map((p) => p.message))];
  const notes = [...new Set([...problems.filter((p) => p.code === "opening_framing_not_counted"),
    ...problems.filter((p) => p.blocking === false && !["opening_framing_not_counted", "nothing_measured"].includes(p.code))].map((p) => p.message))];
  const line = wallFramingText(wallFramingTotals(result), cur.name, notCounted);
  const centres = r.centresMm ?? WALL_FRAMING_RULES.centresMm;
  return (
    <PendingContext.Provider value={pf.report}>
    <div ref={kb.ref} className="space-y-3" style={{ paddingBottom: kb.pad }} data-setup="walls">
      <UndoBar d={d} pending={pf.pending} />
      <NeedsRow needs={needs} />
      {notes.length > 0 && (
        <ul className="ml-4 list-disc space-y-0.5 text-xs text-ink" data-walls-notes="">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
      )}
      <CommitText label="Name" value={cur.name} required="Give the material a name." onCommit={(t) => d.patch({ name: t })} placeholder="e.g. Walls" />
      <div className="grid grid-cols-2 items-end gap-2">
        <NumberField label="Stud centres" value={centres} min={1} max={100000}
          onCommit={(n) => { const v = n ?? WALL_FRAMING_RULES.centresMm; if (v !== centres) d.patch({ rules: { centresMm: v } }); }} />
        <label className="flex min-h-[44px] items-center gap-2 text-sm font-medium text-ink" data-walls-card-double="">
          <input type="checkbox" className="h-5 w-5 rounded text-primary" checked={r.doubleTopPlate === true} onChange={(e) => d.patch({ rules: { doubleTopPlate: e.target.checked } })} />
          Double top plate
        </label>
      </div>
      {line && <p className="rounded-lg bg-page px-3 py-2 text-sm text-ink" data-walls-card-line="">{line}</p>}
      {blocked.length > 0 && <ul className="space-y-0.5 text-xs text-amber-800" data-walls-card-problems="">{blocked.map((m) => <li key={m}>{m}</li>)}</ul>}
      <details className="rounded-lg border border-hairline px-2 py-1" data-walls-parts="">
        <summary className="min-h-[44px] cursor-pointer py-3 text-sm text-ink">Studs, plates, noggins</summary>
        <div className="space-y-3 pb-2">
          <p className="text-[11px] text-muted">Size: <b>manual selection</b>. The app does not check structural adequacy.</p>
          {WALL_PARTS.map((part) => <WallPart key={part} d={d} part={part} presets={presets} />)}
        </div>
      </details>
      {d.error && <Banner tone="error">{d.error}</Banner>}
    </div>
    </PendingContext.Provider>
  );
}

// ── Cladding (fibre cement, AAC, Rendex foam, timber) + support battens + accessories ───────────────────────
const FAMILY_LABEL = { cladding: "Fibre cement", aac: "AAC panels", foam: "Rendex foam", "timber-cladding": "Timber cladding", batten: "Support battens", accessory: "Accessories", timber: "Timber", aluminium: "Aluminium" };
const CLADDING_FAMILIES = [["cladding", "Fibre cement"], ["aac", "AAC (Walsc first)"], ["foam", "Rendex foam"], ["timber-cladding", "Timber cladding"], ["batten", "Support battens"], ["accessory", "Accessories"]];
const DEFAULT_NAMES = new Set(["", "Cladding", ...Object.values(FAMILY_LABEL)]);

function freshSpec(family, prev) {
  const keep = { supplierName: prev?.supplierName ?? null, spareRate: prev?.spareRate ?? 0, notes: prev?.notes ?? null };
  if (family === "foam") return { ...keep, ...rendexTemplate(), product: { ...rendexTemplate().product, name: null } };
  if (family === "timber-cladding") return { ...keep, family, layout: "course", orientation: "horizontal", supply: "random", endCondition: "square", product: { name: null, effectiveCoverMm: null, sourceRefs: [] } };
  if (family === "aac") return { ...keep, family, product: {} };
  if (family === "batten") return { ...keep, family, orientation: "vertical", product: {} };
  if (family === "accessory") return { ...keep, family, product: { name: null } };
  return { ...keep, family: "cladding", layout: "sheet", product: {} };
}

/** Searchable catalogue product list for a family (Walsc first for AAC; one option per panel size for a grid). */
export function ProductPicker({ family, spec, onPick }) {
  const options = useMemo(() => productOptions(family), [family]);
  const chosen = options.find((o) => o.group.id === spec.product?.id && (!o.sku || o.sku === spec.product?.sku)) || null;
  // a company / entered product the researched catalogue doesn't list (CAT01) — shown as the product, not as "none"
  const p = spec.product || {};
  const custom = !chosen && spec.family === family && (p.name || p.manufacturer) && p.id !== "custom-batten"
    ? { title: productLabel(spec), detail: [p.manufacturer, isNum(p.widthMm) ? `${fmt(p.widthMm)} wide` : null, isNum(p.effectiveCoverMm) ? `cover ${fmt(p.effectiveCoverMm)}` : null,
      isNum(p.thicknessMm) ? `${fmt(p.thicknessMm)} thick` : null, (p.lengthsMm || []).length ? `${p.lengthsMm.map(fmt).join(" / ")} long` : null].filter(Boolean).join(" · ") } : null;
  const [open, setOpen] = useState(!chosen && !custom);
  const [q, setQ] = useState("");
  const shown = !!chosen || !!custom;
  useEffect(() => { if (!shown) setOpen(true); }, [shown]);
  const t = q.trim().toLowerCase();
  const list = options.filter((o) => !t || t.split(/\s+/).every((w) => o.search.includes(w)));
  return (
    <div className="space-y-2" data-product-picker={family}>
      <div className="flex items-center gap-2">
        <p className="flex-1 text-xs font-medium text-muted">Product</p>
        {shown && <Btn kind="ghost" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Done" : "Change product"}</Btn>}
      </div>
      {chosen && !open && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-2" data-chosen-product={chosen.key}>
          <p className="text-sm font-semibold text-ink">{chosen.title}{chosen.preferred ? <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">Company preference</span> : null}</p>
          <p className="text-[11px] text-muted">{chosen.detail}</p>
        </div>
      )}
      {custom && !open && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-2" data-chosen-product="custom">
          <p className="text-sm font-semibold text-ink">{custom.title}<span className="ml-2 rounded-full border border-primary/40 px-2 py-0.5 text-[10px] font-semibold text-primary">Company / entered product</span></p>
          {custom.detail && <p className="text-[11px] text-muted">{custom.detail}</p>}
        </div>
      )}
      {open && (
        <>
          <label className="block">
            <span className="sr-only">Search products</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products (name, SKU, size)" aria-label="Search products"
              className="min-h-[44px] w-full rounded-lg border border-hairline px-3 text-base focus-ring" />
          </label>
          {family === "aac" && <p className="text-[11px] text-muted">Walsc is the company&apos;s preferred AAC system. Choose the exact system and thickness — the brand alone doesn&apos;t approve a panel for this use.</p>}
          <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-white" aria-label="Products">
            {list.map((o) => (
              <li key={o.key}>
                <button type="button" aria-pressed={chosen?.key === o.key} data-product-option={o.key} onClick={() => { onPick(o); setOpen(false); setQ(""); }}
                  className={`flex min-h-[52px] w-full flex-col items-start px-3 py-2 text-left ${chosen?.key === o.key ? "bg-primary/10" : ""}`}>
                  <span className="text-sm font-medium text-ink">{o.title}{o.preferred ? <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">Company preference</span> : null}</span>
                  <span className="text-[11px] text-muted">{o.detail} · source {o.group.sourceRefs.join(", ")} · availability: confirm with supplier</span>
                </button>
              </li>
            ))}
            {!list.length && <li className="px-3 py-3 text-sm text-muted">No products match. Company products are added in the catalogue editor.</li>}
          </ul>
        </>
      )}
    </div>
  );
}

function StockLengths({ spec, onChange }) {
  const g = groupOf(spec);
  if (!g || isGrid(g) || g.lengthsMm.length < 2) return null;
  const on = new Set(spec.product?.lengthsMm || []);
  const toggle = (L) => {
    const n = new Set(on);
    if (n.has(L)) { if (n.size === 1) return; n.delete(L); } else n.add(L);
    const lengthsMm = g.lengthsMm.filter((x) => n.has(x));
    onChange({ lengthsMm, skus: g.skus.filter((k) => n.has(k.lengthMm)).map((k) => ({ sku: k.sku, lengthMm: k.lengthMm })), sku: lengthsMm.length === 1 ? g.skus.find((k) => k.lengthMm === lengthsMm[0])?.sku || null : null, lengthMm: lengthsMm.length === 1 ? lengthsMm[0] : null });
  };
  return (
    <fieldset data-stock-lengths="">
      <legend className="mb-1 text-xs font-medium text-muted">Lengths your supplier stocks</legend>
      <div className="flex flex-wrap gap-1.5">
        {g.lengthsMm.map((L) => (
          <button key={L} type="button" aria-pressed={on.has(L)} onClick={() => toggle(L)}
            className={`min-h-[44px] rounded-lg border px-3 text-sm ${on.has(L) ? "border-primary bg-primary/10 font-semibold text-primary" : "border-hairline text-muted line-through"}`}>{fmt(L)}</button>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-muted">The layout picks the shortest listed length that fits each piece. Untick lengths that aren&apos;t available.</p>
    </fieldset>
  );
}

const needsRoute = (a) => !!a && (a.requiredSelectors || []).some((x) => x === "direct-or-cavity" || x === "cavity");
function AssemblyPicker({ spec, onSelect, rules, onRoute, onCondition }) {
  const list = assemblyCandidates(spec);
  const autoBattens = !!followerRule({ methodKey: methodFor(spec)?.key, rules: {} }, { family: spec.family, orientation: spec.orientation || "vertical" })?.battens;
  const company = rules?.assembly;
  const selected = assemblyById(spec.assemblyId);
  return (
    <fieldset data-assembly-picker="">
      <legend className="mb-1 text-xs font-medium text-muted">Installation assembly</legend>
      {company?.label && (
        <p className="mb-1 text-[11px] text-ink">Company version: <b>{company.label}</b>{company.baseId ? ` (from ${company.baseId})` : ""}{company.detailRef ? ` · detail ${company.detailRef}` : ""}</p>
      )}
      {!list.length ? (
        <p className="rounded-lg border border-hairline bg-white px-3 py-2 text-[12px] text-muted">{!(spec.product?.id || spec.product?.name) ? "Choose a product to see its installation assemblies."
          : `No candidate assembly for this product${spec.orientation ? ` (${spec.orientation})` : ""} — supports and fixings need a reviewed project detail.`}</p>
      ) : (
        <div className="space-y-1.5">
          {list.map((a) => (
            <button key={a.id} type="button" aria-pressed={spec.assemblyId === a.id} data-assembly={a.id} onClick={() => onSelect(a.id)}
              className={`flex min-h-[52px] w-full flex-col items-start rounded-lg border px-3 py-2 text-left ${spec.assemblyId === a.id ? "border-primary bg-primary/5" : "border-hairline bg-white"}`}>
              <span className="text-sm font-medium text-ink">{ASSEMBLY_LABEL[a.id] || a.id}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-1"><ReviewBadge state={a.reviewState === "candidate" ? "candidate" : a.reviewState} />
                <span className="text-[11px] text-muted">{(a.activeInstallationRows || []).length} reviewed rule rows · automatic fixings {a.automaticFixingsEnabled ? "on" : "off"} · source {a.sourceRefs.join(", ")}</span></span>
              <span className="mt-0.5 text-[11px] text-muted">Needs: {a.requiredSelectors.map((x) => x.replace(/-/g, " ")).join(", ")}</span>
            </button>
          ))}
        </div>
      )}
      {selected && !list.some((a) => a.id === selected.id) && (
        <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-950" data-assembly-unlisted="">
          <p><b>{ASSEMBLY_LABEL[selected.id] || selected.id}</b> is selected but isn&apos;t listed for this product{spec.orientation ? ` (${spec.orientation})` : ""}. Check it against the product, or clear it.</p>
          <Btn kind="ghost" onClick={() => onSelect(null)}>Clear this assembly</Btn>
        </div>
      )}
      {(needsRoute(selected) || autoBattens) && onRoute && (
        // wall-by-wall step 4: a cladding that works out its own battens (Axon, Linea / Stria, timber cladding) always offers
        // the route — Direct fix means no battens; until it is chosen the battens are counted as a cavity
        <div className="mt-2"><Chips label={autoBattens ? "Fixing route (battens are counted as a cavity until you choose)" : "Fixing route (your choice — never assumed)"} name="route" value={rules?.route ?? null} onChange={onRoute} options={[["direct", "Direct fix"], ["cavity", "Cavity"]]} /></div>
      )}
      {selected && onCondition && <InstallConditions assembly={selected} spec={spec} rules={rules} onSet={onCondition} />}
      <p className="mt-1 text-[11px] text-muted">Installation rules are <b>source-pending</b>: supports and fixings stay a reviewed manual layout until a guide row is checked.</p>
      {spec.assemblyId && <div className="mt-1"><SourceRefs refs={assemblyById(spec.assemblyId)?.sourceRefs} label="Assembly sources" /></div>}
    </fieldset>
  );
}

const SPARES_HELP = "Added on top of the layout count and shown on each order line (rounded up per line) — don't add spares by hand. 0 doesn't mean no real waste.";

/**
 * The selected assembly's installation conditions (PH-11), in plain words. Each one is this job's own entry; the
 * route / coating / orientation are written from those choices on the card. Entering them never verifies
 * anything — with no reviewed guide row, installation stays source-pending.
 */
function InstallConditions({ assembly, spec, rules, onSet }) {
  const req = assembly.requiredSelectors || [];
  const ic = { ...(rules?.installConditions || {}), ...derivedConditions({ spec, rules }) };
  const own = req.filter((k) => !DERIVED_CONDITIONS.includes(k));
  const missing = req.filter((k) => !filled(ic[k]));
  const elsewhere = missing.filter((k) => DERIVED_CONDITIONS.includes(k));
  if (!req.length) return null;
  return (
    <details className="mt-2 rounded-lg border border-hairline bg-white px-2" data-install-conditions="" data-missing={missing.join(",")}>
      <summary className="flex min-h-[44px] cursor-pointer items-center text-sm text-ink">
        Installation conditions —&nbsp;<b className={missing.length ? "text-amber-800" : "text-emerald-700"}>{missing.length ? `${missing.length} still needed` : "All entered"}</b>
      </summary>
      <div className="space-y-2 pb-2">
        <p className="text-[11px] text-muted">{rules?.defaultsFrom
          ? <>Filled from the Blue Leaf company default (HUB 014) — change any that differ on this site. No guide row is reviewed yet, so installation stays source-pending.</>
          : <>This job&apos;s own site and drawing facts — never inferred. They pick the guide&apos;s rule row; no row is reviewed yet, so installation stays source-pending.</>}</p>
        {elsewhere.length > 0 && <p className="text-[12px] text-amber-900">Also needed above: {elsewhere.map((k) => conditionLabel(k).toLowerCase()).join(", ")}.</p>}
        {own.map((k) => {
          const f = CONDITION_FIELDS[k] || {};
          const label = conditionLabel(k);
          if (f.select) return <div key={k}><SelectField label={label} value={ic[k] ?? null} placeholder="Not entered" options={f.select} onChange={(v) => onSet(k, v)} />{f.help && <p className="mt-1 text-[11px] text-muted">{f.help}</p>}</div>;
          if (f.chips) return <Chips key={k} label={label} name={`cond-${k}`} compact value={ic[k] ?? null} options={f.chips} onChange={(v) => onSet(k, v === ic[k] ? null : v)} />;
          return <CommitText key={k} label={label} value={ic[k] ?? null} maxLength={60} placeholder={f.placeholder} onCommit={(t) => onSet(k, t)} />;
        })}
      </div>
    </details>
  );
}

/** Portrait / landscape for a non-square grid panel (QO-13): only what the product lists (unlisted = portrait only). */
function PanelOrientation({ spec, value, onChange }) {
  const size = panelSize(spec);
  if (!size) return null;
  if (size.square) return <p className="text-[11px] text-muted" data-panel-orientation="square">Square panel ({fmt(size.w)} × {fmt(size.l)}) — portrait and landscape lay out the same.</p>;
  const listed = Array.isArray(spec.product?.permittedOrientations) ? spec.product.permittedOrientations : ["portrait"];
  return (
    <div data-panel-orientation="">
      <Chips label="Panel orientation" name="panel-orientation" compact value={value ?? null} onChange={onChange}
        options={[["portrait", `Portrait (${fmt(size.w)} wide)`, !listed.includes("portrait")], ["landscape", `Landscape (${fmt(size.l)} wide)`, !listed.includes("landscape")]]} />
      <p className="mt-1 text-[11px] text-muted">
        {!listed.includes("landscape") ? `${productLabel(spec)} isn't listed for landscape installation — only portrait can be chosen.` : "Choose how the panels are laid — it is never assumed."}
      </p>
    </div>
  );
}

/**
 * Board joint rule for a course layout (F10): where a run longer than the longest board may be joined — over
 * supports at the given centres, or between supports for end-matched boards only — with the minimum piece, stagger,
 * opening clearance and the detail it comes from. Unfinished entries are kept as rules.jointsDraft (the engine never
 * reads it); only a complete rule becomes rules.joints, for the current orientation.
 */
function BoardJointsField({ spec, value, draft, needed, onApply, onDraft, onClear }) {
  const endMatched = spec.endCondition === "end-matched" || spec.product?.endMatched === true;
  const src = draft || value || {};
  const [open, setOpen] = useState(!!(needed || value || draft));
  useEffect(() => { if (needed) setOpen(true); }, [needed]);
  const set = (p) => {
    const next = { ...src, ...p };
    for (const [k, v] of Object.entries(p)) if (v == null || v === false || v === "") delete next[k];
    delete next.orientation;
    if (next.mode !== "on-support") { delete next.centresMm; delete next.originMm; }
    const complete = (next.mode === "off-support" || (next.mode === "on-support" && isNum(next.centresMm))) && filled(next.detailRef);
    if (complete) onApply({ orientation: spec.orientation || "horizontal", ...next });
    else onDraft(Object.keys(next).length ? next : null);
  };
  const incomplete = !!draft || !value;
  return (
    <details className="rounded-lg border border-hairline px-2 py-1" data-board-joints="" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="flex min-h-[44px] cursor-pointer items-center text-sm text-ink">Board joints (runs longer than the longest board)</summary>
      <div className="space-y-2 pb-2">
        <Chips label="Boards may join" name="joint-mode" compact value={src.mode ?? null} onChange={(v) => set({ mode: v })}
          options={[["on-support", "Over supports"], ["off-support", "Between supports (end-matched)", !endMatched && src.mode !== "off-support"]]} />
        {!endMatched && <p className="text-[11px] text-muted">Only end-matched boards may join between supports — ordinary boards join over a support.</p>}
        {src.mode === "on-support" && (
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Support centres" value={isNum(src.centresMm) ? src.centresMm : null} min={1} max={3000} onCommit={(n) => set({ centresMm: n })} help="From the support layout or detail." />
            <OptNumber label="First support from the wall start" value={src.originMm} max={3000} onCommit={(n) => set({ originMm: n })} help="Blank = at the wall start." />
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <OptNumber label="Shortest piece allowed" value={src.minPieceMm} max={6000} onCommit={(n) => set({ minPieceMm: n })} />
          <OptNumber label="Stagger from the next course" value={src.minStaggerMm} max={6000} onCommit={(n) => set({ minStaggerMm: n })} />
          <OptNumber label="Clear of openings" value={src.openingClearanceMm} max={3000} onCommit={(n) => set({ openingClearanceMm: n })} />
        </div>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5 rounded text-primary" checked={src.factoryEndsAtJoints === true} onChange={(e) => set({ factoryEndsAtJoints: e.target.checked })} />
          Factory ends at every joint (whole boards between joints)
        </label>
        <CommitText label="Joint detail reference" value={src.detailRef} maxLength={60} placeholder="e.g. H04 joint detail" onCommit={(t) => set({ detailRef: t })} />
        {incomplete ? <p className="text-[11px] text-amber-800">Kept as a draft until the joint type{src.mode === "on-support" ? ", support centres" : ""} and detail reference are entered — joints are never assumed.{value ? " The rule applied before stays in use until then." : ""}</p>
          : <p className="text-[11px] text-muted">Applied: long runs divide only at these joints ({spec.orientation || "horizontal"} boards).</p>}
        {(value || draft) && <Btn kind="ghost" onClick={onClear}>Remove joint rule</Btn>}
      </div>
    </details>
  );
}

/** Support-to-frame fixings for a batten layer (PH-02): a reviewed rule, or By others / Exclude with the reason. */
function SupportFixings({ rules, update }) {
  const r = rules || {};
  const scope = r.fixingScope?.status || "include";
  const src = r.fixingDraft || r.fixing || {};
  const id = src.identity || {};
  const setScope = (v) => update((c) => {
    const rr = withoutCarried(c.rules, "fixingScope");
    if (v === "include") delete rr.fixingScope;
    else rr.fixingScope = { status: v, ...(c.rules?.fixingScope?.reason ? { reason: c.rules.fixingScope.reason } : {}) };
    return { ...c, rules: rr };
  });
  const setReason = (t) => update((c) => ({ ...c, rules: { ...c.rules, fixingScope: { status: scope, ...(t ? { reason: t } : {}) } } }));
  const setRule = (p) => update((c) => {
    const cur = c.rules?.fixingDraft || c.rules?.fixing || {};
    const next = { ...cur, ...p, identity: { ...(cur.identity || {}), ...(p.identity || {}) } };
    for (const [k, v] of Object.entries(next.identity)) if (!filled(v)) delete next.identity[k];
    for (const [k, v] of Object.entries(next)) if (v == null) delete next[k];
    const rr = withoutCarried(withoutCarried(c.rules, "fixing"), "fixingDraft");
    if (!fixingGaps(next).length) { rr.fixing = next; delete rr.fixingDraft; } else rr.fixingDraft = next;
    return { ...c, rules: rr };
  });
  const clear = () => update((c) => { const rr = withoutCarried(withoutCarried(c.rules, "fixing"), "fixingDraft"); delete rr.fixing; delete rr.fixingDraft; return { ...c, rules: rr }; });
  if (r.existing === true) return <p className="rounded-lg border border-hairline bg-white px-3 py-2 text-[12px] text-muted" data-support-fixings="existing">Support fixings: none — these supports already exist.</p>;
  const gaps = fixingGaps(src);
  return (
    <fieldset className="space-y-2 rounded-lg border border-hairline p-2" data-support-fixings="">
      <legend className="px-1 text-xs font-semibold text-ink">Support fixings (batten to frame)</legend>
      <Chips label="Fixings" name="fixing-scope" compact value={scope} onChange={setScope} options={[["include", "From a rule"], ["by-others", "By others"], ["exclude", "Exclude"]]} />
      {scope !== "include" ? (
        <>
          <CommitText label={`Why they're ${SCOPE_WHY[scope]}`} value={r.fixingScope?.reason} maxLength={60} placeholder="e.g. Framer supplies and fixes them" onCommit={setReason} />
          <p className="text-[11px] text-muted">Recorded as omitted on the order — not as zero.</p>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {FASTENER_FIELDS.slice(0, 2).map(([k, label, ph]) => <CommitText key={k} label={label} value={id[k]} maxLength={40} placeholder={ph} onCommit={(t) => setRule({ identity: { [k]: t } })} />)}
            <NumberField label="Fastener length" value={isNum(id.lengthMm) ? id.lengthMm : null} min={1} max={500} onCommit={(n) => setRule({ identity: { lengthMm: n } })} />
            {FASTENER_FIELDS.slice(2).map(([k, label, ph]) => <CommitText key={k} label={label} value={id[k]} maxLength={40} placeholder={ph} onCommit={(t) => setRule({ identity: { [k]: t } })} />)}
          </div>
          <Chips label="Spaced" name="fixing-mode" compact value={src.mode ?? null} onChange={(v) => setRule({ mode: v })}
            options={[["pitch", "Spacing along each batten"], ["pattern", "Set number per batten"]]} />
          {src.mode === "pitch" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2"><NumberField label="Fixing spacing" value={isNum(src.pitchMm) ? src.pitchMm : null} min={1} max={3000} onCommit={(n) => setRule({ pitchMm: n })} /></div>
              <NumberField label="First fixing from the batten end" value={isNum(src.edgeStartMm) ? src.edgeStartMm : null} max={1000} onCommit={(n) => setRule({ edgeStartMm: n })} />
              <NumberField label="Last fixing from the batten end" value={isNum(src.edgeEndMm) ? src.edgeEndMm : null} max={1000} onCommit={(n) => setRule({ edgeEndMm: n })} />
            </div>
          )}
          {src.mode === "pattern" && <NumberField label="Fixings per batten" unit="" integer min={1} max={200} value={Number.isInteger(src.countPerLine) ? src.countPerLine : null} onCommit={(n) => setRule({ countPerLine: n })} />}
          <CommitText label="Rule reference (guide / table / row or detail)" value={src.ruleRef} maxLength={60} placeholder="e.g. H02 Table 2 — reviewer" onCommit={(t) => setRule({ ruleRef: t })} />
          {gaps.length ? <p className="text-[11px] text-amber-800">Not counted until you enter {gaps.join(", ")}.{r.fixing && r.fixingDraft ? " The rule applied before stays in use until then." : ""}</p>
            : <p className="text-[11px] text-muted">Counted per batten from this rule — not a default.</p>}
          {(r.fixing || r.fixingDraft) && <Btn kind="ghost" onClick={clear}>Remove fixing rule</Btn>}
        </>
      )}
    </fieldset>
  );
}

/** Joint rows for walls taller than the sheet (advanced): positions + gap + detail, or nothing. */
function JointRowsField({ value, draft, onChange, onDraft, onClear }) {
  // an unfinished entry is saved as rules.jointRowsDraft (the engine never reads it) so it survives closing the card
  // or a reload; only a complete row set (positions + gap + detail) becomes rules.jointRows
  const src = draft || value;
  const [at, setAt] = useState(src?.atMm || []);
  const [gap, setGap] = useState(src?.gapMm ?? null);
  const [ref, setRef] = useState(src?.detailRef || "");
  const srcKey = JSON.stringify(src || null);
  useEffect(() => { const x = JSON.parse(srcKey); setAt(x?.atMm || []); setGap(x?.gapMm ?? null); setRef(x?.detailRef || ""); }, [srcKey]);
  const tryCommit = (next) => {
    const v = { atMm: next.at ?? at, gapMm: next.gap !== undefined ? next.gap : gap, detailRef: (next.ref ?? ref).trim().slice(0, 60) };
    // HUB 015: gap + detail is a complete joint RULE — heights are optional (empty = joints placed at the sheet length)
    if (isNum(v.gapMm) && v.detailRef) onChange(v);
    else onDraft(v.atMm.length || isNum(v.gapMm) || v.detailRef ? { atMm: v.atMm, ...(isNum(v.gapMm) ? { gapMm: v.gapMm } : {}), ...(v.detailRef ? { detailRef: v.detailRef } : {}) } : null);
  };
  const incomplete = (at.length || isNum(gap) || ref) && !(isNum(gap) && ref.trim());
  return (
    <fieldset className="space-y-2 rounded-lg border border-hairline p-2" data-joint-rows="">
      <legend className="px-1 text-xs font-semibold text-ink">Horizontal joints (walls taller than the sheet)</legend>
      <LengthList label="Joint height(s) above the clad base (optional — empty = at the sheet length)" values={at} placeholder="e.g. 2400" onCommit={(v) => { setAt(v); tryCommit({ at: v }); }} />
      <NumberField label="Joint gap (from the detail)" value={gap} min={0} max={50} onCommit={(n) => { setGap(n); tryCommit({ gap: n }); }} />
      <CommitText label="Joint detail reference" value={ref} maxLength={60} placeholder="e.g. H02 horizontal joint detail" onCommit={(t) => { setRef(t || ""); tryCommit({ ref: t || "" }); }} />
      {incomplete ? <p className="text-[11px] text-amber-800">Kept as a draft until the gap and the joint detail are both entered — a &quot;joint allowed&quot; flag alone is never a layout.{value ? " The rows applied before stay in use until then." : ""}</p>
        : value ? <p className="text-[11px] text-muted">Applied: each band is its own course of sheets with its own cut.</p> : <p className="text-[11px] text-muted">Without joint rows, a wall taller than the longest sheet is blocked — never counted as one sheet.</p>}
      {(value || draft) && <Btn kind="ghost" onClick={onClear}>Remove joint rows</Btn>}
    </fieldset>
  );
}

// ── Accessories: the accessory_routes@1 recipe (rules.recipe = { authority?, groups: [{ id, kind, … }] }) ─────────
// Each item follows a real route on the SAME walls as the cladding (base, top, opening edges, the cladding's actual
// joints, wall area). Scope is explicit per item: Include / By others / Exclude (with a reason). Consumables are
// quantified ONLY from a reviewed yield with its source, or an entered quantity with its authority — never a default.
const ROUTE_OPTIONS = [["base", "Base"], ["top", "Top / rake"], ["opening-head", "Opening heads"], ["opening-sill", "Opening sills"], ["opening-jambs", "Opening jambs"], ["opening-perimeter", "Opening perimeters"]];
const SEALANT_SOURCES = [...ROUTE_OPTIONS, ["joints", "Cladding joints"], ["manual", "Entered length"]];
const ACCESSORY_KINDS = [
  ["starter", "Starter / base trim"], ["trim", "Trim (top, head, sill, jamb)"], ["closer", "Closer"], ["vent", "Vent strip"], ["joint-strip", "Joint strip / backing"],
  ["membrane", "Membrane / wrap"], ["tape", "Tape"], ["sealant", "Sealant"], ["mesh", "Mesh"], ["coating", "Coating / render"], ["primer", "Primer"],
  ["aac-adhesive", "AAC adhesive"], ["manual", "Other item (entered quantity)"],
];
const KIND_LABEL = Object.fromEntries(ACCESSORY_KINDS);
const LINEAR_ACC = ["starter", "trim", "closer", "vent"];
const YIELD_ACC = ["mesh", "coating", "primer", "aac-adhesive"];
const STOCKED_ACC = [...LINEAR_ACC, "joint-strip"];
const BUY_UNITS = [["piece", "pieces"], ["box", "boxes"], ["bag", "bags"], ["roll", "rolls"], ["pack", "packs"], ["cartridge", "cartridges"], ["lm", "LM"], ["m2", "m²"], ["ml", "ml"]];
const UNIT_TEXT = Object.fromEntries(BUY_UNITS);
const UNIT_ONE = { piece: "piece", box: "box", bag: "bag", roll: "roll", pack: "pack", cartridge: "cartridge", lm: "LM", m2: "m²", ml: "ml" };
const SCOPE_TEXT = { include: "Include", "by-others": "By others", exclude: "Exclude" };
const SCOPE_WHY = { "by-others": "by others", exclude: "excluded" };
const STATE_TEXT = { calculated: "Calculated", estimate: "Estimate", manual: "Entered quantity", unresolved: "Unresolved", omitted: "Not ordered" };
const pctOf = (rate) => (isNum(rate) ? Math.round(rate * 100000) / 1000 : null);
const groupName = (g) => g.label || KIND_LABEL[g.kind] || g.kind;

function newGroup(kind, groups) {
  let id = kind, i = 2;
  while (groups.some((x) => x.id === id)) id = `${kind}-${i++}`;
  const g = { id, kind, scope: { status: "include" } };
  if (kind === "starter") g.routes = ["base"]; // a starter runs along the base by definition; other routes are chosen
  else if (LINEAR_ACC.includes(kind) || kind === "tape" || kind === "sealant") g.routes = [];
  if (kind === "membrane") Object.assign(g, { mode: "estimate", openingPolicy: "none" });
  if (YIELD_ACC.includes(kind)) g.basis = "net-area";
  return g;
}

/** What one item still needs before it can be quantified / ordered (the engine has the final word per wall). */
function accessoryGroupNeeds(g, groups = []) {
  const out = [];
  const status = g.scope?.status || "include";
  if (status !== "include") { if (!g.scope?.reason) out.push(`Record why it's ${SCOPE_WHY[status]}.`); return out; }
  if (!g.label) out.push("Name the exact product.");
  if (LINEAR_ACC.includes(g.kind) && !(g.routes || []).length) out.push("Choose the edges it runs along.");
  if (STOCKED_ACC.includes(g.kind) && !(g.stockPolicy?.lengthsMm || []).length) out.push("Enter the stock length(s).");
  if ((g.kind === "vent" || g.kind === "closer") && !g.identity?.ventilationSpec) out.push("Enter the ventilation / insect / ember specification — it is never inferred.");
  if (g.kind === "membrane" && g.mode === "roll" && !(isNum(g.courseWidthMm) && isNum(g.rollLengthMm) && isNum(g.sideLapMm) && isNum(g.endLapMm))) out.push("Enter the roll width, roll length, side lap and end lap.");
  if (g.kind === "tape") {
    if (!(g.routes || []).length) out.push("Choose where the tape goes.");
    if ((g.routes || []).includes("membrane-seams") && !groups.some((m) => m.id === g.membraneGroupId && m.kind === "membrane" && m.mode === "roll")) out.push("Seams come from a roll-layout membrane item — choose it.");
    if (!isNum(g.rollLengthMm)) out.push("Enter the tape roll length (otherwise LM only).");
  }
  if (g.kind === "sealant") {
    const routes = g.routes || [];
    if (!routes.length) out.push("Add the bead routes.");
    if (routes.some((r) => !(Number.isInteger(r.beadCount) && r.beadCount >= 1) || !(isNum(r.crossSection?.diameterMm) || (isNum(r.crossSection?.widthMm) && isNum(r.crossSection?.depthMm))) || (r.source === "manual" && !isNum(r.lengthMm)))) out.push("Each bead route needs its bead count and bead size (and an entered length when it's entered).");
    if (!(isNum(g.cartridgeMl) && isNum(g.applicationYield))) out.push("Cartridge size and usable fraction from the product data — until then only ml is shown.");
  }
  const reviewed = g.yield?.reviewed === true && isNum(g.yield?.per) && g.yield?.unit && g.yield?.ref;
  const manual = isNum(g.manualQuantity?.quantity) && g.manualQuantity?.unit && g.manualQuantity?.authority;
  if (YIELD_ACC.includes(g.kind) && !reviewed && !manual) out.push("A reviewed yield with its source, or an entered quantity with its authority — no default usage is assumed.");
  if (g.kind === "manual" && !manual) out.push("Enter the quantity, its unit and where it comes from.");
  return out;
}

/** Optional number with a Clear button (blank and 0 can mean different things — e.g. no joint vs a butt joint). */
function OptNumber({ label, value, onCommit, unit = "mm", min = 0, max, integer, help }) {
  return (
    <div className="flex items-end gap-1">
      <div className="min-w-0 flex-1"><NumberField label={label} value={isNum(value) ? value : null} unit={unit} min={min} max={max ?? Infinity} integer={integer} onCommit={onCommit} help={help} /></div>
      {isNum(value) && <Btn kind="ghost" className={help ? "mb-5" : ""} aria-label={`Clear ${label}`} onClick={() => onCommit(null)}>Clear</Btn>}
    </div>
  );
}

function MultiChips({ label, name, value, options, onChange }) {
  const on = new Set(value || []);
  return (
    <fieldset data-chips={name}>
      <legend className="mb-1 text-xs font-medium text-muted">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([v, text]) => (
          <button key={v} type="button" aria-pressed={on.has(v)} onClick={() => onChange(on.has(v) ? [...on].filter((x) => x !== v) : [...on, v])}
            className={`min-h-[44px] rounded-lg border px-3 text-sm ${on.has(v) ? "border-primary bg-primary/10 font-semibold text-primary" : "border-hairline text-ink"}`}>{text}</button>
        ))}
      </div>
    </fieldset>
  );
}

function SelectField({ label, value, options, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className="min-h-[44px] w-full rounded-lg border border-hairline bg-white px-3 text-base text-ink">
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </label>
  );
}

/** Reviewed yield OR entered quantity for a consumable — both carry their source; neither is ever defaulted. */
function QuantitySource({ g, set, basisUnit, manualOnly = false }) {
  const mode = manualOnly || g.manualQuantity ? "manual" : "yield";
  const y = g.yield || {};
  const mq = g.manualQuantity || {};
  const setY = (p) => { const next = { ...y, ...p }; if (!("reviewed" in p)) next.reviewed = false; set({ yield: next }); }; // any change needs re-checking
  return (
    <div className="space-y-2" data-quantity-source={mode}>
      {!manualOnly && <Chips label="Quantity from" name={`qty-${g.id}`} value={mode} compact
        options={[["yield", "Reviewed yield"], ["manual", "Entered quantity"]]}
        onChange={(v) => set(v === "manual" ? { manualQuantity: { quantity: null, unit: null, authority: null }, yield: undefined } : { manualQuantity: undefined })} />}
      {mode === "yield" ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <SelectField label="Bought as" value={y.unit} placeholder="Choose…" options={BUY_UNITS.filter(([u]) => !["lm", "m2"].includes(u))} onChange={(u) => setY({ unit: u })} />
            <NumberField label={`Each ${y.unit ? UNIT_ONE[y.unit] : "unit"} covers`} unit={basisUnit} value={isNum(y.per) ? y.per : null} onCommit={(n) => setY({ per: n })} />
          </div>
          <CommitText label="Yield source (document, edition, page / table)" value={y.ref} maxLength={60} onCommit={(t) => setY({ ref: t })} />
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5 rounded text-primary" checked={y.reviewed === true} disabled={!(isNum(y.per) && y.unit && y.ref)}
              onChange={(e) => set({ yield: { ...y, reviewed: e.target.checked } })} />
            I&apos;ve checked this yield against that source
          </label>
          <p className="text-[11px] text-muted">Only a checked yield with its source is used. There is no default coverage.</p>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Quantity per wall" unit={mq.unit ? UNIT_TEXT[mq.unit] : ""} value={isNum(mq.quantity) ? mq.quantity : null} onCommit={(n) => set({ manualQuantity: { ...mq, quantity: n } })} />
            <SelectField label="Unit" value={mq.unit} placeholder="Choose…" options={BUY_UNITS} onChange={(u) => set({ manualQuantity: { ...mq, unit: u } })} />
          </div>
          <CommitText label="Quantity from (detail, schedule or reviewer)" value={mq.authority} maxLength={60} onCommit={(t) => set({ manualQuantity: { ...mq, authority: t } })} />
          <p className="text-[11px] text-muted">Applies to <b>each wall</b> this accessory set is linked to.</p>
        </>
      )}
    </div>
  );
}

function SealantRoutes({ g, set }) {
  const routes = g.routes || [];
  const put = (i, p) => set({ routes: routes.map((r, k) => (k === i ? { ...r, ...p } : r)) });
  return (
    <fieldset className="space-y-2 rounded-lg border border-hairline p-2" data-sealant-routes="">
      <legend className="px-1 text-xs font-semibold text-ink">Bead routes</legend>
      {routes.map((r, i) => {
        const cs = r.crossSection || {};
        const round = cs.shape ? cs.shape !== "rect" : !(isNum(cs.widthMm) || isNum(cs.depthMm));
        return (
          <div key={r.id || i} className="space-y-2 rounded-md bg-page p-2" data-sealant-route={i}>
            <SelectField label="Along" value={r.source} options={SEALANT_SOURCES} onChange={(v) => put(i, { source: v || "base" })} />
            {r.source === "manual" && <NumberField label="Entered route length" value={isNum(r.lengthMm) ? r.lengthMm : null} onCommit={(n) => put(i, { lengthMm: n })} />}
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Beads" unit="" integer min={1} value={Number.isInteger(r.beadCount) ? r.beadCount : null} onCommit={(n) => put(i, { beadCount: n })} />
              <Chips label="Bead size" name={`bead-${g.id}-${i}`} compact value={round ? "round" : "rect"} options={[["round", "Round"], ["rect", "W × D"]]}
                onChange={(v) => put(i, { crossSection: { shape: v } })} />
            </div>
            {round ? <NumberField label="Bead diameter" value={isNum(cs.diameterMm) ? cs.diameterMm : null} max={100} onCommit={(n) => put(i, { crossSection: { shape: "round", diameterMm: n } })} />
              : (
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="Joint width" value={isNum(cs.widthMm) ? cs.widthMm : null} max={100} onCommit={(n) => put(i, { crossSection: { ...cs, shape: "rect", widthMm: n } })} />
                  <NumberField label="Joint depth" value={isNum(cs.depthMm) ? cs.depthMm : null} max={100} onCommit={(n) => put(i, { crossSection: { ...cs, shape: "rect", depthMm: n } })} />
                </div>
              )}
            <Btn kind="ghost" onClick={() => set({ routes: routes.filter((_, k) => k !== i) })}>Remove this route</Btn>
          </div>
        );
      })}
      <Btn onClick={() => { let n = routes.length + 1; while (routes.some((r) => r.id === `r${n}`)) n++; set({ routes: [...routes, { id: `r${n}`, source: "opening-perimeter", crossSection: { shape: "round" } }] }); }}>Add a bead route</Btn>
    </fieldset>
  );
}

function GroupFields({ g, groups, set }) {
  const stock = g.stockPolicy?.lengthsMm || [];
  const setStock = (v) => set({ stockPolicy: v.length ? { kind: "list", lengthsMm: v } : undefined });
  const basisUnit = g.basis === "joint-lm" ? "LM" : "m²";
  return (
    <div className="space-y-2">
      {LINEAR_ACC.includes(g.kind) && (
        <>
          <MultiChips label="Runs along" name={`routes-${g.id}`} value={g.routes} options={ROUTE_OPTIONS} onChange={(v) => set({ routes: v })} />
          {(g.routes || []).some((r) => r === "base" || r === "opening-sill") && (
            <label className="flex min-h-[44px] items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5 rounded text-primary" checked={g.excludeDoors === true} onChange={(e) => set({ excludeDoors: e.target.checked })} />
              Leave out door openings (per the detail)
            </label>
          )}
        </>
      )}
      {(g.kind === "vent" || g.kind === "closer") && (
        <CommitText label="Ventilation / insect / ember specification" value={g.identity?.ventilationSpec} maxLength={60}
          onCommit={(t) => set({ identity: t ? { family: "accessory", item: g.id, kind: g.kind, ventilationSpec: t } : undefined })} />
      )}
      {g.kind === "joint-strip" && (
        <>
          <Chips label="Follows" name={`joint-orient-${g.id}`} compact value={g.orientation || "all"} options={[["all", "All joints"], ["horizontal", "Horizontal"], ["vertical", "Vertical"]]}
            onChange={(v) => set({ orientation: v === "all" ? undefined : v })} />
          <p className="text-[11px] text-muted">Follows the actual joints of the cladding laid out on the same wall — never grooves, never an assumed count.</p>
        </>
      )}
      {STOCKED_ACC.includes(g.kind) && (
        <>
          <LengthList label="Stock length(s)" values={stock} placeholder="e.g. 3000" onCommit={setStock} />
          <div className="grid grid-cols-2 gap-2">
            <OptNumber label="End gap (each end)" value={g.endGapMm} max={500} onCommit={(n) => set({ endGapMm: n ?? undefined })} />
            <OptNumber label="Joint overlap" value={g.jointOverlapMm} max={1000} onCommit={(n) => set({ jointOverlapMm: n ?? undefined })} />
          </div>
          <p className="text-[11px] text-muted">Leave the overlap blank unless the detail allows a joint — a run longer than the stock is then flagged, never spliced.</p>
        </>
      )}
      {g.kind === "membrane" && (
        <>
          <Chips label="Quantity by" name={`membrane-mode-${g.id}`} compact value={g.mode || "estimate"} options={[["estimate", "Area estimate"], ["roll", "Roll layout"]]}
            onChange={(v) => set(v === "roll" ? { mode: "roll", openingPolicy: "none", orientation: g.orientation || "horizontal" } : { mode: "estimate" })} />
          {(g.mode || "estimate") === "estimate" ? (
            <>
              <Chips label="Openings" name={`membrane-openings-${g.id}`} compact value={g.openingPolicy || "none"} options={[["none", "Not deducted"], ["deduct", "Deducted"]]} onChange={(v) => set({ openingPolicy: v })} />
              {g.openingPolicy === "deduct" && <OptNumber label="Reveal wrap (each opening edge)" value={g.revealWrapMm} max={1000} onCommit={(n) => set({ revealWrapMm: n ?? undefined })} />}
              <div className="grid grid-cols-2 gap-2">
                <OptNumber label="Roll width" value={g.rollWidthMm} max={10000} onCommit={(n) => set({ rollWidthMm: n ?? undefined })} />
                <OptNumber label="Roll length" value={g.rollLengthMm} max={500000} onCommit={(n) => set({ rollLengthMm: n ?? undefined })} />
              </div>
              <p className="text-[11px] text-muted">Gross wall area (the cladding&apos;s net area is never borrowed). Without a roll size the result stays in m².</p>
            </>
          ) : (
            <>
              <Chips label="Runs" name={`membrane-orient-${g.id}`} compact value={g.orientation || "horizontal"} options={[["horizontal", "Horizontal"], ["vertical", "Vertical"]]} onChange={(v) => set({ orientation: v })} />
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Roll width" value={isNum(g.courseWidthMm) ? g.courseWidthMm : null} max={10000} onCommit={(n) => set({ courseWidthMm: n })} />
                <NumberField label="Roll length" value={isNum(g.rollLengthMm) ? g.rollLengthMm : null} max={500000} onCommit={(n) => set({ rollLengthMm: n })} />
                <NumberField label="Side lap" value={isNum(g.sideLapMm) ? g.sideLapMm : null} max={1000} onCommit={(n) => set({ sideLapMm: n })} />
                <NumberField label="End lap" value={isNum(g.endLapMm) ? g.endLapMm : null} max={1000} onCommit={(n) => set({ endLapMm: n })} />
              </div>
              <OptNumber label="Return at each end" value={g.returnMm} max={1000} onCommit={(n) => set({ returnMm: n ?? undefined })} />
              <p className="text-[11px] text-muted">Laps come from the membrane&apos;s installation detail — none are assumed.</p>
            </>
          )}
          <OptNumber label="Allowance" unit="%" value={pctOf(g.allowanceRate)} max={100} onCommit={(n) => set({ allowanceRate: isNum(n) ? n / 100 : undefined })} help="Blank = 0 — no hidden allowance." />
        </>
      )}
      {g.kind === "tape" && (
        <>
          <MultiChips label="Goes on" name={`tape-routes-${g.id}`} value={g.routes} options={[["opening-perimeter", "Opening perimeters"], ["membrane-seams", "Membrane seams"]]} onChange={(v) => set({ routes: v })} />
          {(g.routes || []).includes("membrane-seams") && (
            <SelectField label="Membrane item" value={g.membraneGroupId} placeholder="Choose…" options={groups.filter((m) => m.kind === "membrane").map((m) => [m.id, groupName(m)])} onChange={(v) => set({ membraneGroupId: v || undefined })} />
          )}
          <div className="grid grid-cols-2 gap-2">
            <OptNumber label="Roll length" value={g.rollLengthMm} max={500000} onCommit={(n) => set({ rollLengthMm: n ?? undefined })} />
            {(g.routes || []).includes("opening-perimeter") && <OptNumber label="Extra per opening" value={g.returnPerOpeningMm} max={5000} onCommit={(n) => set({ returnPerOpeningMm: n ?? undefined })} />}
          </div>
          <OptNumber label="Allowance" unit="%" value={pctOf(g.allowanceRate)} max={100} onCommit={(n) => set({ allowanceRate: isNum(n) ? n / 100 : undefined })} help="Blank = 0." />
        </>
      )}
      {g.kind === "sealant" && (
        <>
          <SealantRoutes g={g} set={set} />
          <div className="grid grid-cols-2 gap-2">
            <OptNumber label="Cartridge size" unit="ml" value={g.cartridgeMl} max={5000} onCommit={(n) => set({ cartridgeMl: n ?? undefined })} />
            <OptNumber label="Usable per cartridge" unit="%" value={pctOf(g.applicationYield)} max={100} onCommit={(n) => set({ applicationYield: isNum(n) && n > 0 ? n / 100 : undefined })} />
          </div>
          <CommitText label="Cartridge / yield source" value={g.yieldRef} maxLength={60} onCommit={(t) => set({ yieldRef: t || undefined })} />
          <p className="text-[11px] text-muted">Volume = bead size × route length × beads. Cartridges need the product&apos;s own size and usable fraction — none are assumed.</p>
        </>
      )}
      {YIELD_ACC.includes(g.kind) && (
        <>
          <Chips label="Applied to" name={`basis-${g.id}`} compact value={g.basis || "net-area"} options={[["net-area", "Net area"], ["gross-area", "Gross area"], ["joint-lm", "Joints (LM)"]]} onChange={(v) => set({ basis: v })} />
          {g.kind === "mesh" && <CommitText label="Coating system" value={g.coatingSystem} maxLength={60} onCommit={(t) => set({ coatingSystem: t || undefined })} />}
          {g.kind === "mesh" && g.basis === "joint-lm" && (
            <label className="flex min-h-[44px] items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5 rounded text-primary" checked={g.additional === true} onChange={(e) => set({ additional: e.target.checked })} />
              Extra joint reinforcement on top of full-coverage mesh
            </label>
          )}
          <QuantitySource g={g} set={set} basisUnit={basisUnit} />
        </>
      )}
      {g.kind === "manual" && <QuantitySource g={g} set={set} basisUnit="" manualOnly />}
    </div>
  );
}

/** Per-item state across the walls the engine laid out (worst first). */
function engineGroupState(result, id) {
  const states = (result?.layouts || []).flatMap((l) => (l.groups || []).filter((x) => x.id === id).map((x) => x.state));
  if (!states.length) return null;
  for (const s of ["unresolved", "estimate", "manual", "omitted", "calculated"]) if (states.includes(s)) return s;
  return states[0];
}
function engineGroupProblems(result, id) {
  return [...new Set((result?.problems || []).filter((p) => (p.refs || []).some((r) => r.role === id)).map((p) => p.message))];
}

function AccessoryGroupCard({ g, groups, set, remove, open, toggle, result }) {
  const needs = accessoryGroupNeeds(g, groups);
  const status = g.scope?.status || "include";
  const state = engineGroupState(result, g.id);
  const problems = engineGroupProblems(result, g.id);
  return (
    <li className="rounded-lg border border-hairline bg-white" data-accessory-group={g.id} data-kind={g.kind}>
      <button type="button" aria-expanded={open} onClick={toggle} className="flex min-h-[52px] w-full items-center gap-2 px-3 py-2 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{groupName(g)}</span>
          <span className="block text-[11px] text-muted">{KIND_LABEL[g.kind] || g.kind} · {SCOPE_TEXT[status]}{state ? ` · ${STATE_TEXT[state] || state}` : ""}{needs.length ? ` · needs ${needs.length}` : ""}</span>
        </span>
        <span aria-hidden className="text-muted">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-hairline px-3 pb-3 pt-2">
          <CommitText label="Item (exact product)" value={g.label} maxLength={60} placeholder={`e.g. ${g.kind === "sealant" ? "Polyurethane sealant 600 ml" : g.kind === "membrane" ? "Wall wrap 2.7 × 30 m" : "Product name and size"}`} onCommit={(t) => set({ label: t || undefined })} />
          <Chips label="Scope" name={`scope-${g.id}`} compact value={status} options={[["include", "Include"], ["by-others", "By others"], ["exclude", "Exclude"]]}
            onChange={(v) => set({ scope: { status: v, ...(v !== "include" && g.scope?.reason ? { reason: g.scope.reason } : {}) } })} />
          {status !== "include" ? (
            <>
              <CommitText label={`Why it's ${SCOPE_WHY[status]}`} value={g.scope?.reason} maxLength={60} placeholder="e.g. Supplied by the window installer" onCommit={(t) => set({ scope: { status, ...(t ? { reason: t } : {}) } })} />
              <p className="text-[11px] text-muted">Recorded as omitted on the order review — not as zero.</p>
            </>
          ) : <GroupFields g={g} groups={groups} set={set} />}
          {needs.length > 0 && (
            <ul className="ml-4 list-disc space-y-0.5 text-[12px] text-amber-900" data-group-needs="">{needs.map((n) => <li key={n}>{n}</li>)}</ul>
          )}
          {problems.length > 0 && (
            <ul className="ml-4 list-disc space-y-0.5 text-[12px] text-ink" data-group-problems="">{problems.slice(0, 4).map((m) => <li key={m}>{m}</li>)}</ul>
          )}
          <Btn kind="ghost" onClick={remove}>Remove this item</Btn>
        </div>
      )}
    </li>
  );
}

/**
 * Editor for an accessory_routes@1 recipe (job setup card and the company catalogue editor).
 *   recipe   { authority?, groups: [] } (null = none yet)      onChange(nextRecipe)
 *   result   optional materialResults entry — per-item engine state and problems
 *   showAuthority  false in the company catalogue (a project detail belongs to one job)
 */
export function AccessoryRecipeEditor({ recipe, onChange, result, showAuthority = true }) {
  const groups = Array.isArray(recipe?.groups) ? recipe.groups : [];
  const [openIds, setOpenIds] = useState(() => new Set());
  const emit = (nextGroups, extra = {}) => onChange({ ...(recipe || {}), ...extra, groups: nextGroups });
  const setGroup = (id, p) => emit(groups.map((g) => {
    if (g.id !== id) return g;
    const next = { ...g, ...p };
    for (const [k, v] of Object.entries(p)) if (v === undefined) delete next[k];
    return next;
  }));
  const add = (kind) => {
    if (!kind) return;
    const g = newGroup(kind, groups);
    setOpenIds(new Set([...openIds, g.id]));
    emit([...groups, g]);
  };
  const auth = recipe?.authority;
  return (
    <div className="space-y-3" data-accessory-recipe="">
      {!groups.length && <p className="rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-muted">No items yet. Add each accessory this set includes — starters, trims, joint strips, membrane, tape, sealant, mesh, coatings.</p>}
      {groups.length > 0 && (
        <ul className="space-y-2" aria-label="Accessory items">
          {groups.map((g) => (
            <AccessoryGroupCard key={g.id} g={g} groups={groups} result={result} open={openIds.has(g.id)}
              toggle={() => { const n = new Set(openIds); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); setOpenIds(n); }}
              set={(p) => setGroup(g.id, p)} remove={() => emit(groups.filter((x) => x.id !== g.id))} />
          ))}
        </ul>
      )}
      <SelectField label="Add an item" value="" placeholder="Choose the kind of item…" options={ACCESSORY_KINDS} onChange={add} />
      <p className="text-[11px] text-muted">Corner trims: corners can&apos;t be tagged on walls yet, so add them as &quot;Other item (entered quantity)&quot; from the detail — never counted as 0. Opening flashings are added as a flashing material.</p>
      {showAuthority && <CommitText label="Project detail that specifies this set (optional)" value={auth?.kind === "project-detail" ? auth.ref : ""} maxLength={60} placeholder="e.g. BL-DET-07 rev B"
        onCommit={(t) => emit(groups, { authority: t ? { kind: "project-detail", ref: t } : undefined })}
        help="Recorded as a project detail. Without one, installation stays source-pending — nothing here is a reviewed guide rule." />}
    </div>
  );
}

// Standard accessory groups of an assembly (05 B5) — the same keys the schedule / wall screens read from rules.scope.
// A group the set has no item for is never silently omitted: it's "Not decided" until the user says By others /
// Exclude (with a reason) or that an entered item above covers it.
const STD_GROUPS = [["starter", "Starter / base trim", ["starter"]], ["corners", "Corner trims", []], ["joints", "Joint / backing strips", ["joint-strip"]],
  ["openings", "Opening head / sill / jamb", []], ["membrane", "Membrane / wrap", ["membrane"]], ["tape", "Tape", ["tape"]], ["sealant", "Sealant", ["sealant"]],
  ["fixings", "Fixings", []], ["mesh", "Mesh / render", ["mesh", "coating"]]];
const coveredBy = (key, kinds, groups) => (key === "openings"
  ? groups.find((g) => ["trim", "closer"].includes(g.kind) && (g.routes || []).some((r) => /^opening/.test(r)))
  : groups.find((g) => kinds.includes(g.kind)));

function OtherGroups({ rules, update }) {
  const groups = Array.isArray(rules.recipe?.groups) ? rules.recipe.groups : [];
  const scope = rules.scope && typeof rules.scope === "object" ? rules.scope : {};
  const reasons = rules.scopeReasons && typeof rules.scopeReasons === "object" ? rules.scopeReasons : {};
  const hasEntered = groups.some((g) => g.kind === "manual");
  const open = STD_GROUPS.filter(([k, , kinds]) => !coveredBy(k, kinds, groups));
  if (!open.length) return null;
  const put = (k, v) => update((c) => {
    const r = { ...(c.rules || {}) };
    const sc = { ...(r.scope || {}) }, rs = { ...(r.scopeReasons || {}) };
    if (v === "unresolved") delete sc[k]; else sc[k] = v;
    if (v !== "by-others" && v !== "exclude") delete rs[k];
    if (Object.keys(sc).length) r.scope = sc; else delete r.scope;
    if (Object.keys(rs).length) r.scopeReasons = rs; else delete r.scopeReasons;
    return { ...c, rules: r };
  });
  const why = (k, t) => update((c) => {
    const rs = { ...(c.rules?.scopeReasons || {}) };
    if (t) rs[k] = t; else delete rs[k];
    const r = { ...(c.rules || {}) };
    if (Object.keys(rs).length) r.scopeReasons = rs; else delete r.scopeReasons;
    return { ...c, rules: r };
  });
  return (
    <fieldset className="space-y-2 rounded-lg border border-hairline p-2" data-other-groups="">
      <legend className="px-1 text-xs font-semibold text-ink">Accessory groups with no item in this set</legend>
      <p className="text-[11px] text-muted">Decide each one: by others, excluded (with the reason), or covered by an entered item. &quot;Not decided&quot; is not the same as excluded.</p>
      {open.map(([k, label]) => {
        const v = scope[k] || "unresolved";
        const omitted = v === "by-others" || v === "exclude";
        return (
          <div key={k} className="space-y-1" data-other-group={k} data-value={v}>
            <Chips label={label} name={`other-${k}`} compact value={v} onChange={(x) => put(k, x)}
              options={[["unresolved", "Not decided"], ["by-others", "By others"], ["exclude", "Exclude"], ["include", "Entered item above", !hasEntered && v !== "include"]]} />
            {omitted && <CommitText label={`Why it's ${SCOPE_WHY[v]}`} value={reasons[k]} maxLength={60} placeholder="e.g. Supplied by the window installer" onCommit={(t) => why(k, t)} />}
            {omitted && !reasons[k] && <p className="text-[11px] text-amber-800">Record why — an omission is recorded with its reason.</p>}
          </div>
        );
      })}
    </fieldset>
  );
}

export function AccessorySetup({ value, onChange, result, lines }) {
  const d = useAutoApply(value, onChange);
  const kb = useKeepFieldVisible();
  const pf = usePendingFields();
  return <PendingContext.Provider value={pf.report}><div ref={kb.ref} style={{ paddingBottom: kb.pad }} className="space-y-3"><UndoBar d={d} pending={pf.pending} /><AccessoryFields d={d} result={result} lines={lines} /></div></PendingContext.Provider>;
}
function AccessoryFields({ d, result, lines }) {
  const cur = d.cur, s = cur.spec || {}, r = cur.rules || {};
  const setRecipe = (next) => d.update((c) => {
    const { authority, ...rest } = next;
    return { ...c, rules: { ...withoutCarried(c.rules, "recipe"), recipe: authority ? { ...rest, authority } : rest } };
  });
  const needs = setupNeeds(cur, result);
  const status = shownStatus(result) || { quantity: needs.length ? "incomplete" : "schedule", installation: r.recipe?.authority?.kind === "project-detail" ? "project-detail-supplied" : "unspecified", procurement: "draft" };
  return (
    <div className="space-y-3" data-setup="accessory">
      <Banner tone="warn"><b>Source-pending — manual quantities.</b> No accessory guide rows are reviewed, so nothing is assumed: each item follows its real route on the walls, and consumables need a reviewed yield or an entered quantity with its source.</Banner>
      <CommitText label="Accessory set (e.g. system or supplier pack)" value={s.product?.name} placeholder="e.g. Axon accessories — Supplier A"
        onCommit={(t) => d.update((c) => ({ ...c, spec: { ...c.spec, product: { ...(c.spec.product || {}), name: t } } }))} />
      <div className="grid grid-cols-2 gap-2">
        <CommitText label="Supplier" value={s.supplierName} onCommit={(t) => d.patch({ spec: { supplierName: t } })} />
        <CommitText label="Supplier code" value={s.productCode} maxLength={60} onCommit={(t) => d.patch({ spec: { productCode: t } })} />
      </div>
      <CarriedFlags cur={cur} update={d.update} />
      <AccessoryRecipeEditor recipe={r.recipe || null} onChange={setRecipe} result={result} />
      <OtherGroups rules={r} update={d.update} />
      <AvailabilityChips value={s.availability} onChange={(v) => d.patch({ spec: { availability: v } })} />
      {d.error && <Banner tone="error">{d.error}</Banner>}
      <NeedsRow needs={needs} />
      <QuantityPreview lines={lines} result={result} />
      <StatusRow status={status} note={result?.status ? "From the calculation for this job's walls." : "Quantities are worked out from the walls this set is linked to, and shown on the schedule."} />
      {result?.status && <EngineProblems result={result} />}
    </div>
  );
}

export function BattenSetup({ value, onChange, result, lines }) {
  const d = useAutoApply(value, onChange);
  const kb = useKeepFieldVisible();
  const pf = usePendingFields();
  return <PendingContext.Provider value={pf.report}><div ref={kb.ref} style={{ paddingBottom: kb.pad }} className="space-y-3"><UndoBar d={d} pending={pf.pending} /><BattenFields d={d} result={result} lines={lines} /></div></PendingContext.Provider>;
}
function BattenFields({ d, result, lines }) {
  const cur = d.cur, s = cur.spec || {}, r = cur.rules || {};
  const g = groupOf(s);
  const custom = !g && (s.product?.name || s.product?.widthMm || s.product?.id === "custom-batten");
  const setRule = (k, v) => d.update((c) => ({ ...c, rules: { ...withoutCarried(c.rules, k), [k]: v } }));
  const pick = (o) => d.update((c) => carry(c, { ...c, name: DEFAULT_NAMES.has(c.name) || c.name === productLabel(c.spec) ? o.title : c.name, spec: { ...freshSpec("batten", c.spec), ...specFromGroup(o.group), family: "batten", orientation: c.spec.orientation || "vertical" } }, "product"));
  const goCustom = () => d.update((c) => carry(c, { ...c, spec: { ...freshSpec("batten", c.spec), orientation: c.spec.orientation || "vertical", product: { id: "custom-batten", name: null, sourceRefs: [] } } }, "product"));
  const setP = (p) => d.update((c) => ({ ...c, spec: { ...c.spec, product: { ...(c.spec.product || {}), ...p } } }));
  const needs = setupNeeds(cur, result);
  return (
    <div className="space-y-3" data-setup="batten">
      <ProductPicker family="batten" spec={s} onPick={pick} />
      <Btn kind={custom ? "primary" : "secondary"} className="w-full" onClick={goCustom} aria-pressed={!!custom}>Timber or other batten (enter its size)</Btn>
      <CarriedFlags cur={cur} update={d.update} />
      {custom && (
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2"><CommitText label="Batten (section, grade, treatment)" value={s.product?.name} onCommit={(t) => setP({ name: t })} placeholder="e.g. 70 × 35 MGP10 H3 pine" /></div>
          <NumberField label="Width" value={s.product?.widthMm} onCommit={(n) => setP({ widthMm: n })} />
          <NumberField label="Thickness" value={s.product?.thicknessMm} onCommit={(n) => setP({ thicknessMm: n })} />
          <div className="col-span-2"><LengthList label="Stock lengths" values={s.product?.lengthsMm} onCommit={(v) => setP({ lengthsMm: v, lengthMm: v.length === 1 ? v[0] : null })}
            help="Timber stock is 1200 mm then every 300 mm at every supplier — enter the lengths your supplier actually has." /></div>
        </div>
      )}
      {g && <SourceRefs refs={s.product?.sourceRefs} label="Product sources" />}
      <Chips label="Batten direction" name="orientation" value={s.orientation || "vertical"} onChange={(v) => d.update((c) => carry(c, { ...c, spec: { ...c.spec, orientation: v } }, "orientation"))}
        options={[["vertical", "Vertical battens"], ["horizontal", "Horizontal battens"]]} />
      <fieldset className="space-y-2 rounded-lg border border-hairline p-2">
        <legend className="px-1 text-xs font-semibold text-ink">Spacing (from the selected rule or project detail)</legend>
        <NumberField label="Maximum support spacing" value={isNum(r.maxSpacingMm) ? r.maxSpacingMm : null} min={1} max={3000} onCommit={(n) => setRule("maxSpacingMm", n)}
          help="Required — never defaulted. It varies with wind class, product and fixing (e.g. Axon Table 1)." />
        <CommitText label="Spacing authority (guide / table / row or project detail, reviewer)" value={r.spacingRef} maxLength={60} onCommit={(t) => setRule("spacingRef", t)} />
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Start offset" value={isNum(r.startOffsetMm) ? r.startOffsetMm : null} min={0} onCommit={(n) => setRule("startOffsetMm", n)} help="Blank = 0 at the wall start." />
          <NumberField label="End offset" value={isNum(r.endOffsetMm) ? r.endOffsetMm : null} min={0} onCommit={(n) => setRule("endOffsetMm", n)} help="Blank = 0 at the wall end." />
        </div>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5 rounded text-primary" checked={r.existing === true} onChange={(e) => setRule("existing", e.target.checked)} />
          These supports already exist (layout only — not purchased)
        </label>
      </fieldset>
      <SupportFixings rules={r} update={d.update} />
      <CommitText label="Supplier" value={s.supplierName} onCommit={(t) => d.patch({ spec: { supplierName: t } })} />
      <AvailabilityChips value={s.availability} onChange={(v) => d.patch({ spec: { availability: v } })} />
      {d.error && <Banner tone="error">{d.error}</Banner>}
      <NeedsRow needs={needs} />
      <QuantityPreview lines={lines} result={result} />
      <ComponentRows spec={s} rules={r} />
      <SetupStatus cur={cur} result={result} needs={needs} />
    </div>
  );
}

export function CladdingSetup({ value, onChange, result, lines, presets = null, onSaveCompanyDefault = null }) {
  const d = useAutoApply(value, onChange);
  const kb = useKeepFieldVisible();
  const pf = usePendingFields();
  const cur = d.cur, s = cur.spec || {};
  const fam = s.family;
  const chooseFamily = (f) => {
    if (f === fam) return;
    d.update((c) => {
      const autoName = DEFAULT_NAMES.has(c.name) || c.name === productLabel(c.spec);
      return withoutDefaultsFrom(carry(c, { ...c, name: autoName ? FAMILY_LABEL[f] : c.name, spec: freshSpec(f, c.spec) }, "family"));
    });
  };
  return (
    <PendingContext.Provider value={pf.report}>
    <div ref={kb.ref} className="space-y-3" style={{ paddingBottom: kb.pad }} data-setup="cladding" data-family={fam}>
      <UndoBar d={d} pending={pf.pending} />
      <CommitText label="Name" value={cur.name} required="Give the material a name." onCommit={(t) => d.patch({ name: t })} />
      <Chips label="Material" name="family" value={fam} options={CLADDING_FAMILIES} onChange={chooseFamily} />
      {fam === "batten" ? <BattenFields d={d} result={result} lines={lines} /> : fam === "accessory" ? <AccessoryFields d={d} result={result} lines={lines} /> : <CladdingFields d={d} result={result} lines={lines} presets={presets} onSaveCompanyDefault={onSaveCompanyDefault} />}
    </div>
    </PendingContext.Provider>
  );
}

function CladdingFields({ d, result, lines, presets = null, onSaveCompanyDefault = null }) {
  const cur = d.cur, s = cur.spec || {}, r = cur.rules || {};
  const fam = s.family;
  const mk = methodFor(s)?.key;
  const g = groupOf(s);
  // HUB 014: a product picked with a company default opens as one summary; Edit shows the full form for exceptions (this job only)
  const companyDefault = g ? findCompanyDefault(presets, s) : null;
  const defaulted = !!g && isDefaulted(cur);
  const [editOpen, setEditOpen] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const full = !defaulted || editOpen;
  const setRule = (k, v) => d.update((c) => ({ ...c, rules: { ...withoutCarried(c.rules, k), [k]: v } }));
  const setP = (p) => d.update((c) => ({ ...c, spec: { ...c.spec, product: { ...(c.spec.product || {}), ...p } } }));
  const pick = (o) => { setEditOpen(false); d.update((c) => {
    const base = specFromGroup(o.group, { sku: o.sku || undefined });
    const keep = { supplierName: c.spec.supplierName ?? null, spareRate: c.spec.spareRate ?? 0, notes: c.spec.notes ?? null };
    const spec = { ...keep, ...base };
    spec.assemblyId = reselectAssembly(spec);
    const autoName = DEFAULT_NAMES.has(c.name) || c.name === productLabel(c.spec);
    const moved = carry(c, { ...c, name: autoName ? o.title : c.name, spec }, "product");
    const def = findCompanyDefault(presets, moved.spec);
    return def ? applyCompanyDefault(moved, def) : withoutDefaultsFrom(moved);
  }); };
  const setOrientation = (o) => d.update((c) => {
    const spec = { ...c.spec, orientation: o };
    spec.assemblyId = reselectAssembly(spec);
    return carry(c, { ...c, spec }, "orientation");
  });
  const setSupply = (v) => d.update((c) => { const spec = { ...c.spec, supply: v }; spec.assemblyId = reselectAssembly(spec); return carry(c, { ...c, spec }, "method"); });
  // timber cladding: a supplier/profile change must load or re-enter that product's cover (12) — never keep another's
  const setTimberIdentity = (field, v) => d.update((c) => {
    const spec = field === "supplierName" ? { ...c.spec, supplierName: v } : { ...c.spec, product: { ...c.spec.product, name: v } };
    const before = field === "supplierName" ? c.spec.supplierName : c.spec.product?.name;
    const next = { ...c, spec };
    if (before && before !== v && isNum(c.spec.product?.effectiveCoverMm)) return carry(c, next, "supplier");
    return next;
  });
  const setCover = (n) => d.update((c) => ({ ...c, rules: withoutCarried(c.rules, "coverMm"), spec: { ...c.spec, product: { ...c.spec.product, effectiveCoverMm: n } } }));
  const courseOrientations = orientationsFor(s);
  const showOrientation = s.layout === "course" || fam === "timber-cladding";
  const needs = setupNeeds(cur, result);
  const setCondition = (k, v) => d.update((c) => {
    const ic = { ...(c.rules?.installConditions || {}) };
    if (filled(v)) ic[k] = v; else delete ic[k];
    const rules = { ...withoutCarried(c.rules, "installConditions") };
    if (Object.keys(ic).length) rules.installConditions = ic; else delete rules.installConditions;
    return { ...c, rules };
  });
  const setJoints = (applied, draft) => d.update((c) => {
    const rules = withoutCarried(withoutCarried(c.rules, "joints"), "jointsDraft");
    if (applied !== undefined) { if (applied) rules.joints = applied; else delete rules.joints; }
    if (draft) rules.jointsDraft = draft; else delete rules.jointsDraft;
    return { ...c, rules };
  });
  return (
    <div className="space-y-3">
      {["cladding", "aac"].includes(fam) && <ProductPicker key={fam} family={fam} spec={s} onPick={pick} />}
      <CarriedFlags cur={cur} update={d.update} />
      {g && (defaulted || companyDefault || onSaveCompanyDefault) && (
        <CompanyDefaultSummary cur={cur} preset={companyDefault} defaulted={defaulted} editOpen={editOpen} onEdit={() => setEditOpen((v) => !v)}
          onUse={companyDefault && !defaulted ? () => { setEditOpen(false); d.update((c) => applyCompanyDefault(c, companyDefault)); } : null}
          onSave={onSaveCompanyDefault ? async () => { setSaveMsg(null); const m = await onSaveCompanyDefault(cur); if (m) { setSaveMsg(m); if (m.tone === "ok") setEditOpen(false); } } : null} />
      )}
      {saveMsg && (
        <div data-default-msg={saveMsg.tone}><Banner tone={saveMsg.tone === "ok" ? "ok" : "error"} action={<Btn kind="ghost" onClick={() => setSaveMsg(null)}>Dismiss</Btn>}>{saveMsg.text}</Banner></div>
      )}
      {fam === "aac" && g && <p className="text-[11px] text-muted" data-aac-system="">One system per material: <b>{productLabel(s)}</b> ({fmt(g.thicknessMm)} mm) only — brands and wall systems are never mixed. Add another material for a second system.</p>}
      {g && full && (
        <div className="rounded-lg border border-hairline bg-white px-3 py-2 text-[12px] text-ink" data-product-facts="">
          <p>{fmt(s.product?.widthMm)} wide · {fmt(s.product?.thicknessMm)} thick{isNum(s.product?.effectiveCoverMm) ? <> · effective cover <b>{fmt(s.product.effectiveCoverMm)} mm</b></> : null}
            {(() => { const skus = (s.product?.skus || []).map((k) => k.sku).filter(Boolean); return skus.length ? ` · SKU ${skus.join(", ")}` : " · no published SKU — use the supplier's code"; })()}</p>
          <p className="text-[11px] text-muted">Product dimensions are published facts for quantity only. Supplier availability: confirm with supplier.</p>
          <div className="mt-1"><SourceRefs refs={s.product?.sourceRefs} label="Product sources" /></div>
        </div>
      )}
      {!g && ["cladding", "aac"].includes(fam) && (s.product?.name || s.product?.manufacturer) && (
        <div className="rounded-lg border border-hairline bg-white px-3 py-2 text-[12px] text-ink" data-product-facts="custom">
          <p>{fmt(s.product?.widthMm)} wide · {fmt(s.product?.thicknessMm)} thick{isNum(s.product?.effectiveCoverMm) ? <> · effective cover <b>{fmt(s.product.effectiveCoverMm)} mm</b></> : null}
            {(s.product?.lengthsMm || []).length ? ` · ${s.product.lengthsMm.map(fmt).join(" / ")} long` : ""}{s.product?.sku ? ` · SKU ${s.product.sku}` : ""}</p>
          <p className="text-[11px] text-muted">Not in the researched catalogue — these values came from the company product or were entered, so check them against the source below. Supplier availability: confirm with supplier.</p>
          <div className="mt-1"><SourceRefs refs={s.product?.sourceRefs} label="Product sources" /></div>
        </div>
      )}
      {g && full && <StockLengths spec={s} onChange={setP} />}
      {mk === "panel_grid" && (full || !isNum(s.product?.gapMm)) && (
        <NumberField label="Expressed joint gap" value={isNum(s.product?.gapMm) ? s.product.gapMm : null} min={0} max={50}
          onCommit={(n) => d.update((c) => ({ ...c, rules: withoutCarried(c.rules, "productGapMm"), spec: { ...c.spec, product: { ...c.spec.product, gapMm: n } } }))}
          help={s.product?.gapMm === 10 && (s.product?.sourceRefs || []).includes("H09") ? "10 mm — sourced assembly parameter (H10), not added to the panel size." : "Entered — from the selected assembly detail."} />
      )}
      {fam === "aac" && g && (
        <NumberField label="Approved adhesive joint (system value)" value={isNum(r.adhesiveJointMm) ? r.adhesiveJointMm : null} min={0} max={30}
          onCommit={(n) => setRule("adhesiveJointMm", n)} help="Required — from the current guide for this exact system. Never defaulted, and not a 10 mm movement gap." />
      )}
      {fam === "foam" && (
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2"><CommitText label="Exact Rendex product / system" value={s.product?.name === FOAM_PLACEHOLDER ? "" : s.product?.name} onCommit={(t) => setP({ name: t })} placeholder="From the current Rendex system document" /></div>
          <NumberField label="Sheet length" value={s.product?.lengthMm} onCommit={(n) => setP({ lengthMm: n, lengthsMm: isNum(n) ? [n] : [] })} />
          <NumberField label="Sheet width" value={s.product?.widthMm} onCommit={(n) => setP({ widthMm: n, effectiveCoverMm: n })} />
          <NumberField label="Thickness" value={s.product?.thicknessMm} onCommit={(n) => setP({ thicknessMm: n })} />
          <div className="col-span-2"><Chips label="Coating" name="coating" value={s.coating} options={[["factory", "Factory-coated"], ["applicator", "Applicator-coated"]]} onChange={(v) => d.patch({ spec: { coating: v } })} /></div>
          <p className="col-span-2 text-[11px] text-muted">Take every value from the current Rendex system document — none are assumed. AAC rails/adhesive never apply to foam.</p>
          <div className="col-span-2"><SourceRefs refs={["F01", "F02"]} label="Product sources" /></div>
        </div>
      )}
      {fam === "timber-cladding" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <CommitText label="Species / profile" value={s.product?.name} onCommit={(t) => setTimberIdentity("name", t)} placeholder="e.g. Spotted gum shiplap" />
            <CommitText label="Supplier" value={s.supplierName} onCommit={(t) => setTimberIdentity("supplierName", t)} />
          </div>
          <Chips label="Effective cover (this supplier/product's value)" name="cover" value={s.product?.effectiveCoverMm} onChange={setCover}
            options={TIMBER_COVER_OPTIONS_MM.map((c) => [c, `${c} mm`])} />
          <NumberField label="Other effective cover" value={TIMBER_COVER_OPTIONS_MM.includes(s.product?.effectiveCoverMm) ? null : s.product?.effectiveCoverMm} max={1000} onCommit={setCover}
            help="Cover is already net of the overlap — nothing more is deducted. It's saved for this supplier/product only." />
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Nominal width" value={s.product?.widthMm} onCommit={(n) => setP({ widthMm: n })} help="Separate from cover." />
            <NumberField label="Thickness" value={s.product?.thicknessMm} onCommit={(n) => setP({ thicknessMm: n })} />
          </div>
          <Chips label="Supply" name="supply" value={s.supply} options={[["random", "Random lengths (LM)"], ["fixed", "Fixed lengths (boards)"]]} onChange={setSupply} />
          {s.supply === "random" ? (
            <>
              <NumberField label="Supplier ordering increment" unit="m" value={s.orderIncrementM} onCommit={(n) => d.patch({ spec: { orderIncrementM: n } })} help="Random lengths give a total LM estimate — never a piece count." />
              <LengthList label="Lengths in the supplier's random mix" values={s.product?.lengthsMm} placeholder="e.g. 1800, 2400, 3000, 5400" onCommit={(v) => setP({ lengthsMm: v, lengthMm: null })}
                help="Recorded with the order (shortest and longest you may receive). The LM estimate doesn't use them and never becomes a piece count." />
            </>
          ) : <LengthList label="Board length(s)" values={s.product?.lengthsMm} onCommit={(v) => setP({ lengthsMm: v, lengthMm: v.length === 1 ? v[0] : null })} />}
          <Chips label="Ends" name="ends" value={s.endCondition} options={[["square", "Square (butt joints on supports)"], ["end-matched", "End-matched"]]} onChange={(v) => d.patch({ spec: { endCondition: v } })} />
        </>
      )}
      {showOrientation && (
        <Chips label="Orientation" name="orientation" value={s.orientation} onChange={setOrientation}
          options={[["horizontal", "Horizontal courses", !courseOrientations.has("horizontal")], ["vertical", "Vertical boards", !courseOrientations.has("vertical")]]} />
      )}
      {showOrientation && courseOrientations.size === 1 && <p className="-mt-2 text-[11px] text-muted">{productLabel(s)} is listed for {[...courseOrientations][0]} installation only.</p>}
      {mk === "panel_grid" && <PanelOrientation spec={s} value={r.panelOrientation} onChange={(v) => setRule("panelOrientation", v)} />}
      {mk === "course_layout" && <BoardJointsField spec={s} value={r.joints || null} draft={r.jointsDraft || null} needed={(result?.problems || []).some((p) => p.code === "needs_layout")}
        onApply={(v) => setJoints(v, null)} onDraft={(v) => setJoints(undefined, v)} onClear={() => setJoints(null, null)} />}
      {full && (fam !== "timber-cladding" || s.product?.name) && <AssemblyPicker spec={s} rules={r} onSelect={(id) => d.update((c) => carry(c, { ...c, spec: { ...c.spec, assemblyId: id } }, "assembly"))} onRoute={(v) => setRule("route", v)} onCondition={setCondition} />}
      {full && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Spares" unit="%" value={s.spareRate ?? 0} min={0} max={100} onCommit={(n) => d.patch({ spec: { spareRate: n } })} help={mk === "area_to_linear" ? "Added on top of the LM estimate. 0 doesn't mean no real waste." : SPARES_HELP} />
          {fam !== "timber-cladding" && <CommitText label="Supplier" value={s.supplierName} onCommit={(t) => d.patch({ spec: { supplierName: t } })} />}
        </div>
      )}
      {full && <AvailabilityChips value={s.availability} onChange={(v) => d.patch({ spec: { availability: v } })} />}
      {full && ["sheet_layout", "panel_grid", "aac_panel_layout"].includes(mk) && (
        <details className="rounded-lg border border-hairline px-2 py-1" data-advanced="">
          <summary className="min-h-[44px] cursor-pointer py-3 text-sm text-ink">Advanced (joint rows, allowances, minimum strip)</summary>
          <div className="space-y-2 pb-2">
            {mk === "sheet_layout" && <JointRowsField value={r.jointRows || null} draft={r.jointRowsDraft || null}
              onChange={(v) => d.update((c) => { const rules = { ...withoutCarried(c.rules, "jointRows"), jointRows: v }; delete rules.jointRowsDraft; return { ...c, rules }; })}
              onDraft={(v) => d.update((c) => { const rules = { ...(c.rules || {}) }; if (v) rules.jointRowsDraft = v; else delete rules.jointRowsDraft; return { ...c, rules }; })}
              onClear={() => d.update((c) => { const rules = withoutCarried(withoutCarried(c.rules, "jointRows"), "jointRowsDraft"); delete rules.jointRows; delete rules.jointRowsDraft; return { ...c, rules }; })} />}
            {mk === "sheet_layout" && <NumberField label="Sheet height allowance (each cut)" value={isNum(r.heightAllowanceMm) ? r.heightAllowanceMm : null} min={0} max={500} onCommit={(n) => setRule("heightAllowanceMm", n)} help="Blank = 0 — no hidden allowance." />}
            {(mk === "panel_grid" || mk === "aac_panel_layout") && <NumberField label="Minimum cut strip (from the system detail)" value={isNum(r.minStripMm) ? r.minStripMm : null} min={0} max={2000} onCommit={(n) => setRule("minStripMm", n)}
              help="Blank = every cut strip is flagged for the minimum-piece / edge-fixing check." />}
          </div>
        </details>
      )}
      {d.error && <Banner tone="error">{d.error}</Banner>}
      <NeedsRow needs={needs} />
      <QuantityPreview lines={lines} result={result} />
      {!full && (() => {
        // wall-by-wall step 4: one line instead of a setup card for the cladding's own battens and extras
        const auto = followerRule({ methodKey: mk, rules: r }, { family: fam, orientation: s.orientation || "vertical" });
        return auto ? <p className="text-[11px] text-muted" data-followers-note="">{auto.battens ? (auto.extras ? "Battens, foam tape and H-flashing are" : "Battens are") : "Foam tape and H-flashing are"} worked out from your walls. Nothing to set up.</p> : null;
      })()}
      {full && <ComponentRows spec={s} rules={r} />}
      {full && <ReviewSummary rules={r} />}
      <SetupStatus cur={cur} result={result} needs={needs} />
    </div>
  );
}

/**
 * HUB 014: the company default as one line — Cavity · Wind N2 · Timber frame · On studs · ND nails · 10% spares … —
 * with Edit for this job's exceptions. "Save as company default" is explicit and office-only (the server checks too).
 */
function CompanyDefaultSummary({ cur, preset, defaulted, editOpen, onEdit, onUse, onSave }) {
  const { rows, missing } = defaultSummary(cur, preset);
  const changed = rows.some((x) => x.differs);
  if (!defaulted) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-white px-3 py-2 text-[12px] text-ink" data-company-defaults="off">
        <p className="min-w-0 flex-1">{onUse ? "This product has a Blue Leaf company default." : "No company default for this product yet."}</p>
        {onUse && <Btn kind="primary" onClick={onUse}>Use Blue Leaf defaults</Btn>}
        {onSave && <Btn kind="ghost" onClick={onSave}>Save as company default</Btn>}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-[12px] text-ink" data-company-defaults="">
      <p className="font-semibold">Blue Leaf defaults{changed ? " (changed for this job)" : ""}</p>
      <p data-default-values="">{rows.map((x, i) => (
        <span key={x.key} data-default={x.key} data-differs={x.differs ? "true" : undefined}>{i ? " · " : ""}{x.value}{x.differs ? <b className="text-amber-800"> (this job)</b> : null}</span>
      ))}</p>
      {missing.length > 0 && <p className="mt-1 font-medium text-amber-800" data-default-missing="">Still needed: {missing.map((k) => conditionLabel(k).toLowerCase()).join(", ")}.</p>}
      {rows.some((x) => x.key === "wind") && <p className="mt-1 text-[11px] text-muted">Wind class is the company default — check this site&apos;s wind classification.</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <Btn kind="ghost" aria-expanded={editOpen} onClick={onEdit}>{editOpen ? "Hide details" : "Edit"}</Btn>
        {onSave && (changed || editOpen) && <Btn kind="ghost" onClick={onSave}>Save as company default</Btn>}
      </div>
      {editOpen && <p className="mt-1 text-[11px] text-muted">Changes here are for this job only{onSave ? " unless you tap Save as company default" : ""}.</p>}
    </div>
  );
}

// ── Aluminium profiles ───────────────────────────────────────────────────────────────────────────────────────
export function AluminiumSetup({ value, onChange, result, lines }) {
  const d = useAutoApply(value, onChange);
  const kb = useKeepFieldVisible();
  const pf = usePendingFields();
  const set = d.patch;
  const cur = d.cur, s = cur.spec || {}, w = s.windowPreset || {};
  const needs = setupNeeds(cur, result);
  return (
    <PendingContext.Provider value={pf.report}>
    <div ref={kb.ref} className="space-y-3" style={{ paddingBottom: kb.pad }} data-setup="aluminium">
      <UndoBar d={d} pending={pf.pending} />
      <CommitText label="Name" value={cur.name} required="Give the material a name." onCommit={(t) => set({ name: t })} />
      <div className="grid grid-cols-3 gap-2">
        <NumberField label="Leg A" value={s.profile?.aMm} onCommit={(n) => set({ spec: { profile: { ...s.profile, aMm: n } } })} />
        <NumberField label="Leg B" value={s.profile?.bMm} onCommit={(n) => set({ spec: { profile: { ...s.profile, bMm: n } } })} />
        <NumberField label="Thickness" value={s.profile?.tMm} onCommit={(n) => set({ spec: { profile: { ...s.profile, tMm: n } } })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <CommitText label="Finish / colour" value={s.finish} maxLength={60} onCommit={(t) => set({ spec: { finish: t } })} />
        <NumberField label="Stock length" value={s.stockLengthMm} onCommit={(n) => set({ spec: { stockLengthMm: n } })} help="Each required piece is ONE continuous length — never joined." />
      </div>
      <fieldset className="rounded-lg border border-hairline p-2">
        <legend className="px-1 text-xs font-semibold text-ink">Cutting settings</legend>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Saw kerf" value={s.kerfMm} min={0} max={20} onCommit={(n) => set({ spec: { kerfMm: n, kerfConfirmed: false } })} help="Changing it needs confirming again." />
          <NumberField label="End trim" value={s.endTrimMm ?? 0} min={0} onCommit={(n) => set({ spec: { endTrimMm: n } })} />
          <NumberField label="Keep offcuts from" value={s.minRetainedOffcutMm ?? 300} min={0} onCommit={(n) => set({ spec: { minRetainedOffcutMm: n } })} />
        </div>
        <label className="mt-1 flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 rounded text-primary" checked={!!s.kerfConfirmed} disabled={!isNum(s.kerfMm) && !s.kerfConfirmed} onChange={(e) => set({ spec: { kerfConfirmed: e.target.checked } })} />The saw kerf above is confirmed for this job</label>
        {!s.kerfConfirmed && <p className="text-[11px] text-amber-800">{isNum(s.kerfMm) ? "An estimate can use the kerf as entered; an order needs it confirmed." : "Until the real saw kerf is entered and confirmed, the cutting plan is an estimate with no kerf and can't be ordered."}</p>}
      </fieldset>
      <fieldset className="rounded-lg border border-hairline p-2">
        <legend className="px-1 text-xs font-semibold text-ink">Window detail (per opening)</legend>
        <div className="flex flex-wrap gap-1.5">
          {[["left", "Left jamb"], ["right", "Right jamb"], ["bottom", "Bottom"], ["head", "Head"]].map(([k, l]) => (
            <button key={k} type="button" aria-pressed={!!w[k]} onClick={() => set({ spec: { windowPreset: { ...w, [k]: !w[k] } } })}
              className={`min-h-[44px] rounded-lg border px-3 text-sm ${w[k] ? "border-primary bg-primary/10 font-semibold text-primary" : "border-hairline text-ink"}`}>{l}</button>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <NumberField label="Jamb allowance (total per jamb)" value={w.jambAllowanceTotalMm ?? 100} min={0} onCommit={(n) => set({ spec: { windowPreset: { ...w, jambAllowanceTotalMm: n } } })} />
          <NumberField label="Bottom allowance" value={w.bottomAllowanceMm ?? 0} min={0} onCommit={(n) => set({ spec: { windowPreset: { ...w, bottomAllowanceMm: n } } })} />
        </div>
        <p className="text-[11px] text-muted">Example: a 600 × 2400 window → 2500 + 2500 + 600. Allowances are this job&apos;s detail, not a universal rule.</p>
      </fieldset>
      <CommitText label="Supplier" value={s.supplierName} onCommit={(t) => set({ spec: { supplierName: t } })} />
      <AvailabilityChips value={s.availability} onChange={(v) => set({ spec: { availability: v } })} />
      <SourceRefs refs={["OWNER-2026-10-14"]} label="Profile and stock source" />
      {d.error && <Banner tone="error">{d.error}</Banner>}
      <NeedsRow needs={needs} />
      <QuantityPreview lines={lines} result={result} />
      <StatusRow status={withKerfState(shownStatus(result) || { quantity: "schedule", installation: "unspecified", procurement: familyProblems(s).length ? "missing-product" : "draft" }, s)}
        note={result?.status ? "From the cutting plan for this job." : "The cutting plan is worked out from this job's openings and runs."} />
      {result?.status && <EngineProblems result={result} />}
    </div>
    </PendingContext.Provider>
  );
}
