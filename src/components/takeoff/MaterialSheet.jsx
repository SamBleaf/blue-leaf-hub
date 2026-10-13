// =============================================================================
// MaterialSheet — "Flashing details" for ONE material (job copy or company standard): spec + ordering rules.
// R04: dependent dropdowns (02-FIELDERS-DROPDOWNS) — construction (solid/perforated) → material/finish →
// thickness (BMT) → colour (painted finishes only) → perforation detail (perforated only).
// Job copies AUTO-APPLY: every valid change goes straight to the takeoff (autosave + device recovery) —
// no Save button. A company standard is published with an explicit "Save standard" (it affects other jobs).
// Options are published Fielders families/palettes, NOT confirmed stock: every combination says
// "Confirm availability with supplier" until someone ticks that the supplier confirmed it.
// =============================================================================
import { useMemo, useRef, useState } from "react";
import {
  FINISHES, FLASHING_RULE_DEFAULTS, FLASHING_SPEC_DEFAULTS, PERFORATION_PATTERNS, AVAILABILITY,
  colourOptions, computeWorkspace, finishInfo, normaliseFlashingRules, normaliseSpec, specProblems, thicknessOptions, PROBLEM_TEXT,
} from "../../../shared/takeoff/index.js";
import { Banner, Btn, NumberField, TextField } from "./ui.jsx";
import { fmtMm } from "./format.js";

/** Before/after schedule lines for this material when its rules change. */
function rulePreview(view, materialId, rules) {
  if (!view || !materialId) return [];
  try {
    const before = computeWorkspace(view).scheduleLines.filter((l) => l.jobMaterialIds.includes(materialId));
    const after = computeWorkspace({ ...view, materials: view.materials.map((m) => (m.id === materialId ? { ...m, rules } : m)) }).scheduleLines.filter((l) => l.jobMaterialIds.includes(materialId));
    const fmt = (ls) => ls.map((l) => `${l.quantity} × ${fmtMm(l.finishedLengthMm)}`).join(", ");
    const a = fmt(before), b = fmt(after);
    return a === b ? [] : [{ before: a || "—", after: b || "—" }];
  } catch { return []; }
}

const sel = "min-h-[44px] w-full rounded-lg border border-hairline bg-white px-2 text-base";
const CUSTOM = "__custom";

function Choice({ label, value, options, onChange, name }) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-medium text-muted">{label}</legend>
      <div className="flex gap-2">
        {options.map(([v, text]) => (
          <label key={v} className={`flex min-h-[44px] flex-1 cursor-pointer items-center justify-center rounded-lg border text-sm ${value === v ? "border-primary bg-primary/5 font-semibold text-primary" : "border-hairline"}`}>
            <input type="radio" name={name} className="sr-only" checked={value === v} onChange={() => onChange(v)} />{text}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function MaterialSheet({ value, view, profile = null, mode = "job", onChange, onSave, onCancel, canEditSourceReview = false }) {
  const job = mode === "job";
  const [name, setName] = useState(value?.name || "Flashing");
  const [spec, setSpec] = useState(() => { try { return normaliseSpec({ ...FLASHING_SPEC_DEFAULTS, ...(value?.spec || {}) }); } catch { return normaliseSpec(FLASHING_SPEC_DEFAULTS); } });
  const [rules, setRules] = useState({ ...FLASHING_RULE_DEFAULTS, ...(value?.rules || {}) });
  const [review, setReview] = useState(value?.sourceReview || { status: "user_entered" });
  const [error, setError] = useState(null);
  const [customColour, setCustomColour] = useState(() => !!spec.colour && !(colourOptions(spec.finishId) || []).includes(spec.colour));
  const [customBmt, setCustomBmt] = useState(() => spec.bmt != null && !thicknessOptions(spec.finishId).some((o) => o.value === spec.bmt));
  const latest = useRef({ name, spec, rules, review });
  const shape = profile || value?.profile || null;
  const preview = useMemo(() => (job ? rulePreview(view, value?.id, rules) : []), [job, view, value?.id, rules]);
  const problems = useMemo(() => { try { return specProblems(spec, shape); } catch { return ["material_incomplete"]; } }, [spec, shape]);
  const info = finishInfo(spec.finishId);
  const palette = colourOptions(spec.finishId);

  /** Job copy: every valid change is applied at once (no Save). */
  function emit(next) {
    latest.current = { ...latest.current, ...next };
    const cur = latest.current;
    if (!job) return;
    let cleanRules, cleanSpec;
    try { cleanRules = normaliseFlashingRules(cur.rules); } catch (e) { setError(e.message); return; }
    try { cleanSpec = normaliseSpec(cur.spec); } catch (e) { setError(e.message); return; }
    if (!cur.name.trim()) { setError("Give the flashing a name."); return; }
    setError(null);
    onChange?.({ ...value, name: cur.name.trim(), spec: cleanSpec, rules: cleanRules });
  }
  const setS = (patch) => { const next = { ...latest.current.spec, ...patch }; setSpec(next); emit({ spec: next }); };
  const setP = (patch) => setS({ perforation: { ...(latest.current.spec.perforation || {}), ...patch } });
  const setRule = (k) => (v) => { const next = { ...latest.current.rules, [k]: v }; setRules(next); emit({ rules: next }); };

  function chooseFinish(id) {
    const f = finishInfo(id);
    const keepColour = f.palette && (colourOptions(id) || []).includes(latest.current.spec.colour);
    setCustomColour(false);
    setS({ finishId: id, finish: f.label, colourApplicable: f.painted === null ? latest.current.spec.colourApplicable : f.painted, colour: keepColour ? latest.current.spec.colour : f.painted === false ? null : "" });
  }

  function saveStandard() {
    setError(null);
    let cleanRules, cleanSpec;
    try { cleanRules = normaliseFlashingRules(rules); cleanSpec = normaliseSpec(spec); } catch (e) { setError(e.message); return; }
    if (!name.trim()) { setError("Give the flashing a name."); return; }
    onSave?.({ ...value, name: name.trim(), spec: cleanSpec, rules: cleanRules, sourceReview: review });
  }

  const legs = (shape?.segments || []).map((s, i) => ({ id: String(s.id), label: `L${i + 1}` }));
  const perf = spec.perforation || {};

  return (
    <div className="space-y-3">
      <TextField label="Name" value={name} onChange={(v) => { setName(v); emit({ name: v }); }} placeholder="e.g. Barge flashing" />
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-wide text-muted">Material</legend>
        <Choice name={`cons-${value?.id}`} label="Construction" value={spec.construction} onChange={(v) => setS({ construction: v, perforation: v === "perforated" ? latest.current.spec.perforation || { extent: "all" } : null })}
          options={[["solid", "Solid"], ["perforated", "Perforated"]]} />
        <div>
          <label htmlFor={`fin-${value?.id}`} className="mb-1 block text-xs font-medium text-muted">Material / finish</label>
          <select id={`fin-${value?.id}`} className={sel} value={spec.finishId || ""} onChange={(e) => chooseFinish(e.target.value)}>
            {!spec.finishId && <option value="">Choose…</option>}
            {["Painted", "Unpainted", "Other"].map((g) => (
              <optgroup key={g} label={g}>{FINISHES.filter((f) => f.group === g).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</optgroup>
            ))}
          </select>
          {spec.finishId === "other" && <div className="mt-2"><TextField label="Describe the material / finish" value={spec.finish} onChange={(v) => setS({ finish: v })} /></div>}
        </div>
        <div>
          <label htmlFor={`bmt-${value?.id}`} className="mb-1 block text-xs font-medium text-muted">Thickness (BMT)</label>
          <select id={`bmt-${value?.id}`} className={sel} value={customBmt ? CUSTOM : spec.bmt ?? ""} onChange={(e) => {
            if (e.target.value === CUSTOM) { setCustomBmt(true); return; }
            setCustomBmt(false); setS({ bmt: Number(e.target.value) });
          }}>
            {spec.bmt == null && !customBmt && <option value="">Choose…</option>}
            {thicknessOptions(spec.finishId).map((o) => <option key={o.value} value={o.value}>{o.value} mm — {o.note}</option>)}
            <option value={CUSTOM}>Other thickness…</option>
          </select>
          {customBmt && <div className="mt-2"><NumberField label="BMT" unit="mm" value={spec.bmt} onCommit={(n) => setS({ bmt: n })} help="Confirm this thickness with the supplier." /></div>}
        </div>
        {spec.finishId === "other" && (
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5 rounded text-primary" checked={!!spec.colourApplicable} onChange={(e) => setS({ colourApplicable: e.target.checked, colour: e.target.checked ? "" : null })} />
            This material is painted (has a colour)
          </label>
        )}
        {spec.colourApplicable ? (
          <div>
            <label htmlFor={`col-${value?.id}`} className="mb-1 block text-xs font-medium text-muted">Colour</label>
            {palette ? (
              <select id={`col-${value?.id}`} className={sel} value={customColour ? CUSTOM : spec.colour || ""} onChange={(e) => {
                if (e.target.value === CUSTOM) { setCustomColour(true); return; }
                setCustomColour(false); setS({ colour: e.target.value });
              }}>
                <option value="">Choose a colour…</option>
                {palette.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value={CUSTOM}>Other / legacy colour…</option>
              </select>
            ) : null}
            {(customColour || !palette) && <div className={palette ? "mt-2" : ""}><TextField label={palette ? "Colour name" : "Colour (confirm with supplier)"} value={spec.colour} onChange={(v) => setS({ colour: v })} /></div>}
            <p className="mt-1 text-[11px] text-muted">{info.label} published palette — swatch names only; check the colour is made in this product.</p>
          </div>
        ) : (
          <p className="rounded-lg bg-page px-3 py-2 text-sm text-ink">Colour: <span className="font-semibold">natural — not applicable</span> ({info.label} is unpainted).</p>
        )}
        {spec.construction === "perforated" && (
          <fieldset className="space-y-2 rounded-lg border border-hairline p-2">
            <legend className="px-1 text-xs font-semibold text-ink">Perforation</legend>
            <TextField label="Supplier product code (if the supplier has one)" value={perf.supplierProductCode} onChange={(v) => setP({ supplierProductCode: v })} />
            <p className="text-[11px] text-muted">Or describe the pattern so the supplier can quote it:</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor={`pat-${value?.id}`} className="mb-1 block text-xs font-medium text-muted">Pattern</label>
                <select id={`pat-${value?.id}`} className={sel} value={perf.pattern || ""} onChange={(e) => setP({ pattern: e.target.value || null })}>
                  <option value="">Choose…</option>
                  {PERFORATION_PATTERNS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
              <NumberField label="Hole size" unit="mm" value={perf.holeSizeMm} onCommit={(n) => setP({ holeSizeMm: n })} />
              <NumberField label="Pitch (centres)" unit="mm" value={perf.pitchMm} onCommit={(n) => setP({ pitchMm: n })} />
              <NumberField label="Open area (optional)" unit="%" value={perf.openAreaPct} onCommit={(n) => setP({ openAreaPct: n })} />
            </div>
            {perf.pattern === "other" && <TextField label="Describe the pattern" value={perf.description} onChange={(v) => setP({ description: v })} />}
            <Choice name={`ext-${value?.id}`} label="Where" value={perf.extent || "all"} onChange={(v) => setP({ extent: v, legIds: v === "all" ? [] : perf.legIds || [] })}
              options={[["all", "All legs"], ["selected_legs", "Selected legs"]]} />
            {perf.extent === "selected_legs" && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Perforated legs">
                {legs.length ? legs.map((l) => {
                  const on = (perf.legIds || []).includes(l.id);
                  return (
                    <label key={l.id} className={`flex min-h-[44px] min-w-[52px] cursor-pointer items-center justify-center rounded-lg border px-2 text-sm ${on ? "border-primary bg-primary/5 font-semibold text-primary" : "border-hairline"}`}>
                      <input type="checkbox" className="sr-only" checked={on} onChange={() => setP({ legIds: on ? perf.legIds.filter((x) => x !== l.id) : [...(perf.legIds || []), l.id] })} />{l.label}
                    </label>
                  );
                }) : <p className="text-xs text-muted">Draw the flashing first, then choose its legs.</p>}
              </div>
            )}
            <NumberField label="Solid margin at edges (optional)" unit="mm" value={perf.solidMarginMm} onCommit={(n) => setP({ solidMarginMm: n })} />
            <p className="text-[11px] text-muted">Perforated describes the sheet only — it is not a ventilation or bushfire rating.</p>
          </fieldset>
        )}
        <details className="rounded-lg border border-hairline px-2 py-1">
          <summary className="min-h-[40px] cursor-pointer py-2 text-sm text-ink">More (codes, supplier confirmation)</summary>
          <div className="grid grid-cols-2 gap-2 pb-2">
            <TextField label="Colour code (optional)" value={spec.colourCode} onChange={(v) => setS({ colourCode: v })} />
            <TextField label="Product code (optional)" value={spec.productCode} onChange={(v) => setS({ productCode: v })} />
          </div>
          <label className="flex min-h-[44px] items-center gap-2 pb-2 text-sm">
            <input type="checkbox" className="h-5 w-5 rounded text-primary" checked={spec.availability === AVAILABILITY.CONFIRMED} onChange={(e) => setS({ availability: e.target.checked ? AVAILABILITY.CONFIRMED : AVAILABILITY.CONFIRM })} />
            The supplier has confirmed this material, thickness and colour
          </label>
        </details>
        {spec.availability !== AVAILABILITY.CONFIRMED && <p className="text-[11px] text-muted">0.55 BMT is Blue Leaf&apos;s default for flashings. Published options aren&apos;t a stock list — confirm availability with the supplier.</p>}
        {problems.length > 0 && <Banner tone="warn">{problems.map((p) => PROBLEM_TEXT[p] || p).join(" ")} You can keep going — it just can&apos;t go on an order yet.</Banner>}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wide text-muted">Ordering rules</legend>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Measured allowance (total per run)" value={rules.allowanceMm} min={0} onCommit={setRule("allowanceMm")} />
          <NumberField label="Round measured runs up to" value={rules.incrementMm} onCommit={setRule("incrementMm")} />
          <NumberField label="Handling flag above" value={rules.handlingThresholdMm} onCommit={setRule("handlingThresholdMm")} help="Long pieces are kept whole and flagged." />
          <NumberField label="Order ceiling (longest piece)" value={rules.orderCeilingMm} onCommit={setRule("orderCeilingMm")} help="Longer pieces block ordering until split." />
        </div>
        <p className="text-[11px] text-muted">Manual and counted lengths are finished order lengths — the allowance and rounding never apply to them.</p>
      </fieldset>
      {preview.length > 0 && (
        <Banner tone="info">
          <p className="font-medium">These draft lengths change:</p>
          {preview.map((p, i) => <p key={i} className="text-xs">Before: {p.before}<br />After: {p.after}</p>)}
          <p className="mt-1 text-[11px]">Measurements, frozen exports and placed orders are not changed.</p>
        </Banner>
      )}
      {!job && canEditSourceReview && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold uppercase tracking-wide text-muted">Source review (optional)</legend>
          <TextField label="Source URL" value={review.sourceUrl} onChange={(v) => setReview((r) => ({ ...r, sourceUrl: v }))} />
          <TextField label="Document title / edition" value={review.title} onChange={(v) => setReview((r) => ({ ...r, title: v }))} />
          <div className="grid grid-cols-2 gap-2">
            <TextField label="Page / section" value={review.page} onChange={(v) => setReview((r) => ({ ...r, page: v }))} />
            <TextField label="Checked (YYYY-MM-DD)" value={review.checkedAt} onChange={(v) => setReview((r) => ({ ...r, checkedAt: v }))} />
          </div>
          <TextField label="Reviewed by" value={review.reviewedBy} onChange={(v) => setReview((r) => ({ ...r, reviewedBy: v }))} />
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5 rounded text-primary" checked={review.status === "reviewed"} onChange={(e) => setReview((r) => ({ ...r, status: e.target.checked ? "reviewed" : "user_entered" }))} />
            I checked this against the cited source
          </label>
        </fieldset>
      )}
      {error && <Banner tone="error">{error}</Banner>}
      {job ? (
        <p className="text-[11px] text-muted">Changes save automatically to this job only.</p>
      ) : (
        <div className="flex gap-2">
          <Btn onClick={onCancel}>Cancel</Btn>
          <Btn kind="primary" className="flex-1" onClick={saveStandard}>Save standard</Btn>
        </div>
      )}
    </div>
  );
}
