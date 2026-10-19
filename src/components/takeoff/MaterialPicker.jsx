// =============================================================================
// MaterialPicker — company presets, listed where they belong:
//   * default export  "Choose flashing": FLASHING standards only (search), New flashing, or a finished-pieces
//                     material. Timber / cladding / aluminium products never appear here (02 §1).
//   * FamilyPresetPicker  company products by family (timber, cladding, AAC, foam, timber cladding, battens,
//                     aluminium, accessories) for Add timber / Add cladding / Add aluminium.
//   * PresetUpdateReview  a newer company version vs this job's copy: field diff + quantity impact on THIS job,
//                     then an explicit Update or Keep (06 catalogue versioning, 10 "explicit job update with impact").
// Using a preset makes an independent SNAPSHOT copy on the job (CAT02): the record handed to onUse carries
// deep-cloned spec/rules plus fromPreset { presetId, revision } so the server copies that exact revision.
// Later job edits never write back, and a new company version never changes a job until someone updates it.
// =============================================================================
import { useEffect, useMemo, useState } from "react";
import { computeWorkspace, describeFamilySpec, indicativeGirthMm, sourceReviewComplete } from "../../../shared/takeoff/index.js";
import { newId } from "../../lib/takeoffApi.js";
import { ReviewBadge } from "./FamilySetup.jsx";
import { AsyncState, Banner, Btn } from "./ui.jsx";

const GENERIC = new Set(["timber", "cladding", "aac", "foam", "timber-cladding", "batten", "aluminium", "accessory"]);
const isGenericPreset = (p) => GENERIC.has(p?.spec?.family);
const FAMILY_TITLE = { timber: "Timber", cladding: "Fibre cement cladding", aac: "AAC panels", foam: "Rendex foam", "timber-cladding": "Timber cladding", batten: "Support battens", aluminium: "Aluminium profiles", accessory: "Accessories" };
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

/** Load company presets once per reloadToken. */
function usePresets(api, reloadToken) {
  const [presets, setPresets] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let stop = false;
    setError(null);
    api.presets().then((r) => {
      if (stop) return;
      if (r.ok) setPresets(r.data.presets || []); else setError(r.error);
    });
    return () => { stop = true; };
  }, [api, attempt, reloadToken]);
  return { presets, error, retry: () => setAttempt((n) => n + 1) };
}

export default function MaterialPicker({ api, onUseStandard, onDrawNew, onPiecesOnly, onEditStandard, onEditStandardProfile, onRetireStandard, canEditStandards, notice, onDismissNotice, reloadToken }) {
  const { presets: all, error, retry } = usePresets(api, reloadToken);
  const [q, setQ] = useState("");
  // flashing standards only — generic (timber / cladding / aluminium …) products live under their own family
  const presets = useMemo(() => (all ? all.filter((p) => !isGenericPreset(p)) : null), [all]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (presets || []).filter((p) => !t || `${p.name} ${p.spec?.colour || ""} ${p.spec?.finish || ""}`.toLowerCase().includes(t));
  }, [presets, q]);

  return (
    <div className="space-y-3" data-flashing-picker="">
      {notice && <Banner tone={notice.tone} action={<Btn kind="ghost" onClick={onDismissNotice}>Dismiss</Btn>}>{notice.text}</Banner>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Btn kind="primary" onClick={onDrawNew}>New flashing</Btn>
        <Btn onClick={onPiecesOnly}>Finished pieces only (no drawing)</Btn>
      </div>
      <div>
        <label htmlFor="std-search" className="mb-1 block text-xs font-medium text-muted">Company standards</label>
        <input id="std-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search standards" className="min-h-[44px] w-full rounded-lg border border-hairline px-3 text-base focus-ring" />
      </div>
      <AsyncState loading={presets === null && !error} error={error} onRetry={retry} empty={presets && !list.length}
        emptyText={presets?.length ? "No standards match." : "No company standards yet. Draw a flashing, then choose More › “Save as company standard” in the drawing."}>
        <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-white">
          {list.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2" data-preset={p.id}>
              <div className="min-w-0 flex-1 basis-40">
                <p className="truncate text-sm font-medium text-ink">{p.name} <span className="text-[11px] text-muted">rev {p.revision}</span></p>
                <p className="truncate text-[11px] text-muted">
                  {[p.spec?.finish, p.spec?.colour, p.spec?.bmt != null ? `${p.spec.bmt} BMT` : null].filter(Boolean).join(" · ")}
                  {p.profile ? ` · girth ${Math.round(indicativeGirthMm(p.profile))} mm` : ""}
                  {sourceReviewComplete(p.sourceReview) ? " · source reviewed" : " · user-entered"}
                </p>
              </div>
              {canEditStandards && <Btn kind="ghost" onClick={() => onEditStandard(p)}>Edit</Btn>}
              {canEditStandards && p.profile && <Btn kind="ghost" onClick={() => onEditStandardProfile(p)}>Shape</Btn>}
              {canEditStandards && <Btn kind="ghost" onClick={() => onRetireStandard(p)}>Retire</Btn>}
              <Btn onClick={() => onUseStandard(p)}>Use on this job</Btn>
            </li>
          ))}
        </ul>
      </AsyncState>
      {all && all.length > (presets || []).length && (
        <p className="text-[11px] text-muted">Timber, cladding and aluminium products are under Add timber / Add cladding / Add aluminium.</p>
      )}
    </div>
  );
}

/** A job material that is an independent snapshot of one preset revision (CAT02). */
function jobCopy(p) {
  const rules = clone(p.rules) || {};
  delete rules.carried; // another job's "check these" flags never travel
  return {
    id: newId(), fromPreset: { presetId: p.id, revision: p.revision },
    name: p.name, methodKey: p.methodKey, methodVersion: p.methodVersion,
    spec: clone(p.spec) || {}, rules, profile: null,
    fromPresetId: p.id, fromPresetRevision: p.revision,
  };
}

/** Values in a company product that depend on THIS job's conditions — shown so they're checked, never silently trusted. */
function conditionNotes(p) {
  const r = p.rules || {}, out = [];
  if (typeof r.maxSpacingMm === "number") out.push(`max support spacing ${r.maxSpacingMm} mm${r.spacingRef ? ` (${r.spacingRef})` : ""} — check it suits this job's wind class and substrate`);
  if (typeof r.adhesiveJointMm === "number") out.push(`adhesive joint ${r.adhesiveJointMm} mm — check it is the current guide value for this exact system`);
  if (r.jointRows?.atMm?.length) out.push(`sheet joint rows at ${r.jointRows.atMm.join(", ")} mm — check against this job's wall heights`);
  if (typeof r.datumMm === "number") out.push(`layout datum ${r.datumMm} mm — check against this job's walls`);
  // site facts of the job a product was saved from (older products saved straight from a job) — never trusted here
  if (r.existing === true) out.push("supports marked as already existing (not purchased) — that was another job's site; check this job's walls");
  if (r.recipe?.authority?.ref) out.push(`project detail ${r.recipe.authority.ref} — recorded for another job; check it applies to this one`);
  if (r.installConditions && typeof r.installConditions === "object" && Object.keys(r.installConditions).length) out.push("installation conditions (wind class, substrate …) from another job — check them against this site");
  if (r.fixingScope?.status === "by-others" || r.fixingScope?.status === "exclude") out.push(`support fixings marked ${r.fixingScope.status === "exclude" ? "excluded" : "by others"} — that was another job's decision`);
  if (r.joints && typeof r.joints === "object") out.push(`a board joint rule${r.joints.detailRef ? ` (${r.joints.detailRef})` : ""} — check it suits this job's supports`);
  if (r.fixing && typeof r.fixing === "object") out.push(`a support fixing rule${r.fixing.ruleRef ? ` (${r.fixing.ruleRef})` : ""} — check it suits this job's wind class and frame`);
  return out;
}

/**
 * Company products for one or more families (Add timber → ["timber"]; Add cladding → cladding, aac, foam,
 * timber-cladding, batten, accessory; Add aluminium → ["aluminium"]).
 *   onUse(record)   record = a ready job material (new id, fromPreset, deep-cloned spec/rules) — upsert it as is
 *   onEdit(preset)  open the catalogue editor on a company product (office staff)
 *   onNew(family)   start a new company product in the catalogue editor (office staff)
 *   onRetire(preset) optional
 */
export function FamilyPresetPicker({ api, families, onUse, onEdit, onNew, onRetire, canEditStandards, reloadToken, notice, onDismissNotice }) {
  const { presets, error, retry } = usePresets(api, reloadToken);
  const [q, setQ] = useState("");
  const famKey = (families && families.length ? families : [...GENERIC]).join(",");
  const fams = useMemo(() => famKey.split(","), [famKey]);
  const groups = useMemo(() => {
    const t = q.trim().toLowerCase();
    const out = new Map(fams.map((f) => [f, []]));
    for (const p of presets || []) {
      const f = p?.spec?.family;
      if (!out.has(f)) continue;
      const line = describeFamilySpec(p.spec).line;
      if (t && !`${p.name} ${line} ${p.spec?.supplierName || ""}`.toLowerCase().includes(t)) continue;
      out.get(f).push({ p, line });
    }
    return [...out.entries()].filter(([, l]) => l.length);
  }, [presets, q, fams]);
  const total = (presets || []).filter((p) => fams.includes(p?.spec?.family)).length;

  return (
    <div className="space-y-3" data-family-presets={fams.join(",")}>
      {notice && <Banner tone={notice.tone} action={<Btn kind="ghost" onClick={onDismissNotice}>Dismiss</Btn>}>{notice.text}</Banner>}
      <div>
        <label htmlFor="fam-preset-search" className="mb-1 block text-xs font-medium text-muted">Company products</label>
        <input id="fam-preset-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company products"
          className="min-h-[44px] w-full rounded-lg border border-hairline px-3 text-base focus-ring" />
      </div>
      <AsyncState loading={presets === null && !error} error={error} onRetry={retry} empty={presets && !groups.length}
        emptyText={total ? "No company products match." : "No company products for this yet. Set one up here, or add it from the researched catalogue in the setup card."}>
        <div className="space-y-3">
          {groups.map(([f, list]) => (
            <section key={f} aria-label={FAMILY_TITLE[f] || f} data-preset-family={f}>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{FAMILY_TITLE[f] || f}</h3>
              <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-white">
                {list.map(({ p, line }) => {
                  const rv = p.rules?.review || {};
                  return (
                    <li key={p.id} className="space-y-1 px-3 py-2" data-preset={p.id}>
                      <p className="text-sm font-medium text-ink">{p.name} <span className="text-[11px] text-muted">rev {p.revision}</span></p>
                      <p className="text-[11px] text-muted">{line}{p.spec?.supplierName ? ` · ${p.spec.supplierName}` : ""} · {p.spec?.availability === "supplier_confirmed" ? "supplier confirmed" : "confirm with supplier"}</p>
                      <div className="flex flex-wrap gap-1">
                        <ReviewBadge prefix="Product" state={rv.product?.state || "candidate"} />
                        <ReviewBadge prefix="Ordering" state={rv.ordering?.state || "candidate"} />
                        <ReviewBadge prefix="Installation" state="source-pending" />
                      </div>
                      {(p.spec?.product?.sourceRefs || []).length > 0 && <p className="text-[11px] text-muted">Sources: {p.spec.product.sourceRefs.join(", ")}</p>}
                      {conditionNotes(p).length > 0 && (
                        <p className="text-[11px] text-amber-900" data-condition-notes="">Brings {conditionNotes(p).join("; ")}.</p>
                      )}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Btn kind="primary" onClick={() => onUse?.(jobCopy(p))}>Use on this job</Btn>
                        {canEditStandards && onEdit && <Btn kind="ghost" onClick={() => onEdit(p)}>Edit company product</Btn>}
                        {canEditStandards && onRetire && <Btn kind="ghost" onClick={() => onRetire(p)}>Retire</Btn>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </AsyncState>
      {canEditStandards && onNew && (
        <div className="flex flex-wrap gap-2">
          {fams.length === 1 ? <Btn onClick={() => onNew(fams[0])}>New company product</Btn>
            : <Btn onClick={() => onNew(fams[0])}>New company product…</Btn>}
        </div>
      )}
      <p className="text-[11px] text-muted">The job gets its own copy. Changing it on this job never changes the company product or another job.</p>
    </div>
  );
}

// ── catalogue versioning: review a newer company version before updating this job's copy ───────────────────────
const FIELD_LABEL = {
  "name": "Name", "spec.product.name": "Product", "spec.product.manufacturer": "Manufacturer", "spec.product.sku": "SKU", "spec.product.widthMm": "Width (mm)",
  "spec.product.thicknessMm": "Thickness (mm)", "spec.product.lengthsMm": "Stock lengths (mm)", "spec.product.lengthMm": "Length (mm)", "spec.product.effectiveCoverMm": "Effective cover (mm)",
  "spec.product.gapMm": "Joint gap (mm)", "spec.product.sourceRefs": "Product sources", "spec.product.packQuantity": "Pack quantity", "spec.product.fullPackRequired": "Full packs only",
  "spec.supplierName": "Supplier", "spec.productCode": "Supplier code", "spec.availability": "Availability", "spec.spareRate": "Spares (%)", "spec.assemblyId": "Installation assembly",
  "spec.orientation": "Orientation", "spec.supply": "Supply", "spec.orderIncrementM": "Ordering increment (m)", "spec.endCondition": "Ends", "spec.coating": "Coating",
  "spec.section.depthMm": "Section depth (mm)", "spec.section.widthMm": "Section width (mm)", "spec.grade": "Grade", "spec.treatment": "Treatment", "spec.species": "Species",
  "spec.stock.maxMm": "Longest stock (mm)", "spec.stock.unavailableMm": "Unavailable lengths (mm)", "spec.stockLengthMm": "Stock length (mm)", "spec.kerfMm": "Saw kerf (mm)",
  "spec.kerfConfirmed": "Kerf confirmed", "spec.endTrimMm": "End trim (mm)", "spec.finish": "Finish", "spec.colour": "Colour", "spec.bmt": "BMT",
  "rules.maxSpacingMm": "Max support spacing (mm)", "rules.spacingRef": "Spacing authority", "rules.adhesiveJointMm": "Adhesive joint (mm)", "rules.minStripMm": "Minimum cut strip (mm)",
  "rules.centresMm": "Centres (mm)", "rules.pitchDeg": "Pitch (°)", "rules.heightAllowanceMm": "Sheet height allowance (mm)", "rules.datumMm": "Layout datum (mm)",
  "rules.review.product.state": "Product review", "rules.review.ordering.state": "Ordering review", "rules.review.installation.state": "Installation review", "rules.assembly.label": "Company assembly",
  "rules.route": "Fixing route", "rules.panelOrientation": "Panel orientation", "rules.joints.mode": "Board joints", "rules.joints.centresMm": "Board joint support centres (mm)",
  "rules.joints.detailRef": "Board joint detail", "rules.fixing.ruleRef": "Support fixing rule", "rules.fixing.pitchMm": "Support fixing spacing (mm)", "rules.fixingScope.status": "Support fixings",
};
const SKIP = new Set(["spec.v", "rules.carried", "spec.product.id", "spec.product.skus", "spec.product.installationState"]);
const flat = (o, prefix, out) => {
  if (Array.isArray(o) && o.every((x) => x == null || typeof x !== "object")) { out[prefix] = o.join(", "); return out; }
  if (o && typeof o === "object") { for (const [k, v] of Object.entries(o)) { const path = prefix ? `${prefix}.${k}` : k; if (!SKIP.has(path)) flat(v, path, out); } return out; }
  if (o !== undefined && o !== null && o !== "") out[prefix] = typeof o === "boolean" ? (o ? "yes" : "no") : String(o);
  return out;
};
const humanPath = (p) => FIELD_LABEL[p] || p.replace(/^rules\.recipe\.groups\.(\d+)/, (_, i) => `accessory item ${Number(i) + 1}`)
  .replace(/^(spec|rules)\./, "").replace(/\./g, " › ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
/** Changed fields between the job copy and a company version (pure). */
function diffMaterial(job, preset) {
  const a = flat({ name: job.name, spec: job.spec, rules: job.rules }, "", {});
  const b = flat({ name: preset.name, spec: preset.spec, rules: preset.rules }, "", {});
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]);
  const rows = keys.map((k) => ({ path: k, label: humanPath(k), job: a[k] ?? null, company: b[k] ?? null }));
  if (JSON.stringify(job.profile ?? null) !== JSON.stringify(preset.profile ?? null)) rows.push({ path: "profile", label: "Flashing shape", job: job.profile ? "this job's shape" : null, company: preset.profile ? "company shape" : null });
  return rows;
}
const lineText = (l) => (l.generic ? (l.item?.description || "item") : `${l.finishedLengthMm} mm lengths`);
const UNIT_NAMES = { piece: ["pc", "pcs"], sheet: ["sheet", "sheets"], bar: ["bar", "bars"], box: ["box", "boxes"], bag: ["bag", "bags"], roll: ["roll", "rolls"], pack: ["pack", "packs"], cartridge: ["cartridge", "cartridges"], lm: ["LM", "LM"], m2: ["m²", "m²"], ml: ["ml", "ml"] };
const lineQty = (l) => {
  const q = Math.round(l.quantity * 1000) / 1000;
  const [one, many] = UNIT_NAMES[l.generic ? l.unit : "piece"] || [l.unit, l.unit];
  return `${q.toLocaleString("en-AU")} ${q === 1 ? one : many}`;
};
function impactFor(snapshot, materialId, replacement) {
  try {
    const before = computeWorkspace(snapshot);
    const after = computeWorkspace({ ...snapshot, materials: (snapshot.materials || []).map((m) => (m.id === materialId ? { ...m, ...replacement } : m)) });
    const mine = (r) => (r.scheduleLines || []).filter((l) => l.jobMaterialIds.includes(materialId)).map((l) => ({ text: lineText(l), qty: lineQty(l), problems: l.problems.length }));
    return { before: mine(before), after: mine(after), statusBefore: before.materialResults?.[materialId]?.status || null, statusAfter: after.materialResults?.[materialId]?.status || null, error: null };
  } catch (e) { return { before: [], after: [], statusBefore: null, statusAfter: null, error: e.message }; }
}
const STATUS_WORD = { incomplete: "incomplete", estimate: "estimate", calculated: "calculated", reviewed: "reviewed", unspecified: "unspecified", "source-pending": "source-pending",
  "supported-by-selected-rule": "supported by selected rule", "project-detail-supplied": "project detail supplied", "out-of-scope": "out of scope", draft: "draft", "missing-product": "missing product",
  "unavailable-stock": "unavailable stock", stale: "stale", ready: "ready" };
const statusLine = (s) => (s ? ["quantity", "installation", "procurement"].map((k) => `${k} ${STATUS_WORD[s[k]] || s[k]}`).join(" · ") : "—");

/**
 * A newer company version of the product this job copied. Shows exactly what would change on THIS job — fields and
 * quantities — and updates only on an explicit tap. Nothing changes until then; frozen orders never change.
 *   material  the job copy (fromPresetId / fromPresetRevision)      preset  the company product (newer revision)
 *   snapshot  the job's workspace view (ws.view) — for the quantity impact
 *   onUpdate(record)  upsert this record as the job material (a snapshot of the new revision)      onKeep()
 */
export function PresetUpdateReview({ material, preset, snapshot, onUpdate, onKeep }) {
  const replacement = useMemo(() => ({
    name: preset.name, methodKey: preset.methodKey, methodVersion: preset.methodVersion, spec: clone(preset.spec) || {}, rules: clone(preset.rules) || {}, profile: clone(preset.profile) ?? null,
    fromPresetId: preset.id, fromPresetRevision: preset.revision,
  }), [preset]);
  const rows = useMemo(() => diffMaterial(material, replacement), [material, replacement]);
  const impact = useMemo(() => (snapshot ? impactFor(snapshot, material.id, replacement) : null), [snapshot, material.id, replacement]);
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 12);
  const jobOnly = rows.filter((r) => r.job != null && r.company == null);
  return (
    <div className="space-y-3" data-preset-update={preset.id}>
      <p className="text-sm text-ink">The company updated <b>{preset.name}</b> to rev {preset.revision}. This job still uses its own copy of rev {material.fromPresetRevision ?? "—"}{rows.length ? ", with the differences below" : ""}.</p>
      {!rows.length ? <p className="text-sm text-muted">No field differs from this job&apos;s copy.</p> : (
        <div className="overflow-hidden rounded-lg border border-hairline bg-white">
          <table className="w-full table-fixed text-left text-[12px]" data-preset-diff="">
            <thead className="bg-page text-[11px] text-muted"><tr><th className="w-[34%] px-2 py-1 font-medium">Field</th><th className="px-2 py-1 font-medium">This job now</th><th className="px-2 py-1 font-medium">Company rev {preset.revision}</th></tr></thead>
            <tbody className="divide-y divide-hairline">
              {shown.map((r) => (
                <tr key={r.path} data-diff-path={r.path}>
                  <td className="break-words px-2 py-1 text-muted">{r.label}</td>
                  <td className="break-words px-2 py-1 text-ink">{r.job ?? <span className="text-muted">not set</span>}</td>
                  <td className="break-words px-2 py-1 font-semibold text-ink">{r.company ?? <span className="font-normal text-muted">not set</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > shown.length && <Btn kind="ghost" className="w-full" onClick={() => setAll(true)}>Show all {rows.length} differences</Btn>}
        </div>
      )}
      {jobOnly.length > 0 && (
        <Banner tone="warn">Updating removes {jobOnly.length === 1 ? "a value" : `${jobOnly.length} values`} entered on this job ({jobOnly.slice(0, 4).map((r) => r.label.toLowerCase()).join(", ")}{jobOnly.length > 4 ? " …" : ""}). Re-enter {jobOnly.length === 1 ? "it afterwards if it still applies" : "them afterwards if they still apply"}.</Banner>
      )}
      {impact && (
        <section className="space-y-2 rounded-lg border border-hairline bg-white p-2" data-preset-impact="">
          <h3 className="text-xs font-semibold text-ink">Quantity impact on this job</h3>
          {impact.error ? <p className="text-[12px] text-red-700">Can&apos;t preview: {impact.error}</p> : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[["Now", impact.before, impact.statusBefore, "before"], [`With rev ${preset.revision}`, impact.after, impact.statusAfter, "after"]].map(([title, list, st, key]) => (
                <div key={key} data-impact={key}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</p>
                  {list.length ? (
                    <ul className="space-y-0.5 text-[12px] text-ink">{list.map((l, i) => <li key={i}>{l.qty} · {l.text}{l.problems ? <span className="text-amber-800"> · needs attention</span> : null}</li>)}</ul>
                  ) : <p className="text-[12px] text-muted">Nothing to order yet.</p>}
                  <p className="mt-0.5 text-[11px] text-muted">{statusLine(st)}</p>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted">Draft order lines are recalculated; orders already exported or placed never change.</p>
        </section>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Btn kind="primary" onClick={() => onUpdate?.({ ...material, ...replacement, fromPreset: { presetId: preset.id, revision: preset.revision } })}>Update this job&apos;s copy to rev {preset.revision}</Btn>
        <Btn onClick={onKeep}>Keep this job&apos;s copy</Btn>
      </div>
    </div>
  );
}
