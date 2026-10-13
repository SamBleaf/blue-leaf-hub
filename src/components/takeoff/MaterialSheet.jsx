// =============================================================================
// MaterialSheet — material specification + ordering rules for ONE material (job copy or
// company standard). Rules are parameters of the code-owned method; there is no formula entry.
// Changing rules previews the affected DRAFT schedule lines (before → after). It never changes
// measurements, frozen exports or placed orders.
// Defaults are suggestions (Fielders / COLORBOND / 0.55 BMT for flashings); nothing here is a
// verified supplier catalogue unless a sourced review is recorded on a company standard.
// =============================================================================
import { useMemo, useState } from "react";
import {
  COLOUR_NAME_SUGGESTIONS, FINISH_SUGGESTIONS, FLASHING_RULE_DEFAULTS, FLASHING_SPEC_DEFAULTS, computeWorkspace, normaliseFlashingRules,
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

export default function MaterialSheet({ value, view, mode = "job", onSave, onCancel, canEditSourceReview = false }) {
  const [name, setName] = useState(value?.name || "Flashing");
  const [spec, setSpec] = useState({ ...FLASHING_SPEC_DEFAULTS, ...(value?.spec || {}) });
  const [rules, setRules] = useState({ ...FLASHING_RULE_DEFAULTS, ...(value?.rules || {}) });
  const [review, setReview] = useState(value?.sourceReview || { status: "user_entered" });
  const [error, setError] = useState(null);
  const set = (k) => (v) => setSpec((s) => ({ ...s, [k]: v }));
  const setRule = (k) => (v) => setRules((r) => ({ ...r, [k]: v }));
  const preview = useMemo(() => (mode === "job" ? rulePreview(view, value?.id, rules) : []), [mode, view, value?.id, rules]);

  function save() {
    setError(null);
    let clean;
    try { clean = normaliseFlashingRules(rules); } catch (e) { setError(e.message); return; }
    if (!name.trim()) { setError("Give the material a name."); return; }
    onSave({ ...value, name: name.trim(), spec: { ...spec, bmt: spec.bmt === "" || spec.bmt == null ? null : Number(spec.bmt) }, rules: clean, sourceReview: review });
  }

  return (
    <div className="space-y-3">
      <datalist id="takeoff-colours">{COLOUR_NAME_SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="takeoff-finishes">{FINISH_SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist>
      <TextField label="Name" value={name} onChange={setName} placeholder="e.g. Barge flashing" />
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wide text-muted">Material</legend>
        <div className="grid grid-cols-2 gap-2">
          <TextField label="Product" value={spec.product} onChange={set("product")} />
          <TextField label="Finish" value={spec.finish} onChange={set("finish")} list="takeoff-finishes" />
          <TextField label="Colour" value={spec.colour} onChange={set("colour")} list="takeoff-colours" placeholder="e.g. Monument" />
          <TextField label="Colour code (optional)" value={spec.colourCode} onChange={set("colourCode")} />
          <NumberField label="BMT" unit="mm" value={spec.bmt} onCommit={(n) => set("bmt")(n)} />
          <TextField label="Product code (optional)" value={spec.productCode} onChange={set("productCode")} />
        </div>
        <p className="text-[11px] text-muted">Colour names are suggestions only — check availability and codes with the supplier. Custom entries are fine.</p>
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
      {mode === "standard" && canEditSourceReview && (
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
      <div className="flex gap-2">
        <Btn onClick={onCancel}>Cancel</Btn>
        <Btn kind="primary" className="flex-1" onClick={save}>{mode === "standard" ? "Save standard" : "Save material"}</Btn>
      </div>
    </div>
  );
}
