// =============================================================================
// CatalogueEditor — the ADVANCED company catalogue editor (02 §5; 06 ProductDefinition / OrderingPolicy /
// InstallationAssembly; 07 CAT01).
//
//   Add product → choose an EXISTING method → define dimensions / cover / stock → choose or duplicate an
//   assembly → source / review per field group → Save company version (explicit — publishing a standard is
//   never automatic).
//
// Output is a company preset CONTENT: { name, methodKey, methodVersion, spec, rules, sourceReview } for an
// existing, code-owned method only. There are no formula / expression / code fields: a genuinely new
// calculation is a development change. Review state lives per field group in rules.review
// ({ product | ordering | installation: { state, ref, by, at, url } }); installation stays source-pending
// because no reviewed guide rows are loaded. Jobs that use a preset get a SNAPSHOT copy (CAT02).
//
// Props: { value, onChange, onSave, onCancel, canEditStandards }
//   value     existing preset content (or a preset) to edit; null/undefined = a new product
//   onChange  every valid edit (draft content)        onSave(content) — the caller saves a company version
// =============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { TIMBER_COVER_OPTIONS_MM, TIMBER_GRID, TIMBER_PURPOSES, describeFamilySpec, familyProblems, methodFor, normaliseFamilySpec, productionMethods } from "../../../shared/takeoff/index.js";
import { aluminiumPreset, specFromGroup } from "../../../shared/takeoff/products/index.js";
import { CATALOGUE_SEED } from "../../../shared/takeoff/products/seed.js";
import { AccessoryRecipeEditor, AssemblyName, CarriedFlags, Chips, CommitText, KeyboardSafe, LengthList, NumberField, ProductPicker, ReviewBadge, SourcePicker, SourceRefs, StatusRow,
  assemblyCandidates, carry, orientationsFor, productParams, reselectAssembly } from "./FamilySetup.jsx";
import { Banner, Btn, TextField } from "./ui.jsx";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

const FAMILIES = [
  ["cladding", "Fibre cement"], ["aac", "AAC panel"], ["foam", "Rendex foam"], ["timber-cladding", "Timber cladding"],
  ["batten", "Support batten"], ["timber", "Timber member"], ["aluminium", "Aluminium profile"], ["accessory", "Accessory"],
];
/** Existing methods a family can use, and the spec fields that select each one through methodFor(). */
const METHOD_CHOICES = {
  cladding: [["sheet_layout@2", { layout: "sheet" }, "Sheets"], ["course_layout@1", { layout: "course" }, "Courses / boards"], ["panel_grid@1", { layout: "grid" }, "Panel grid"]],
  foam: [["sheet_layout@2", { layout: "sheet" }, "Sheets"]],
  aac: [["aac_panel_layout@1", {}, "AAC panels"]],
  "timber-cladding": [["course_layout@1", { supply: "fixed" }, "Fixed-length boards"], ["area_to_linear@2", { supply: "random" }, "Random lengths (LM)"]],
  batten: [["support_grid@1", {}, "Support grid"]],
  timber: [["repeated_members@2", { purpose: "rafters" }, "Repeated members"], ["wall_frame@1", { purpose: "studs" }, "Stud wall"], ["linear_stock@1", { purpose: "plates" }, "Linear stock"]],
  aluminium: [["linear_stock@1", {}, "Cut from bars"]],
  accessory: [["accessory_routes@1", {}, "Accessory routes (source-pending)"]],
};
/** Timber centres are read by these methods only (product / system parameters go through carry() and are flagged — UX03). */
const CENTRES_METHODS = new Set(["repeated_members", "wall_frame"]);
const PURPOSES_FOR = { repeated_members: ["rafters", "joists", "battens"], wall_frame: ["studs"], linear_stock: ["plates", "noggins", "trim", "other"] };
const PURPOSE_LABEL = { rafters: "Rafters", joists: "Joists", studs: "Studs", plates: "Plates", noggins: "Noggins", battens: "Battens", trim: "Trim", other: "Other member" };
const GROUPS = [["product", "Product"], ["ordering", "Ordering"], ["installation", "Installation"]];
const REVIEW_STATES = [["candidate", "Candidate"], ["checked", "Transcription checked"], ["reviewed", "Reviewed"]];

function freshSpec(family) {
  if (family === "timber") return { family, purpose: "rafters", section: {}, stock: { ...TIMBER_GRID } };
  if (family === "aluminium") return aluminiumPreset();
  if (family === "foam") return { family, layout: "sheet", orientation: "vertical", assemblyId: "rendex-eps", coating: null, product: { manufacturer: "Rendex", name: null, sourceRefs: ["F01", "F02"] } };
  if (family === "timber-cladding") return { family, layout: "course", orientation: "horizontal", supply: "random", endCondition: "square", product: { name: null, effectiveCoverMm: null, sourceRefs: [] } };
  if (family === "aac") return { family, product: { manufacturer: CATALOGUE_SEED.preferredSystems?.aac || null, sourceRefs: [] } };
  if (family === "batten") return { family, orientation: "vertical", product: { sourceRefs: [] } };
  if (family === "accessory") return { family, product: { name: null, sourceRefs: [] } };
  return { family: "cladding", layout: "sheet", product: { sourceRefs: [] } };
}

/**
 * Values that describe ONE job's site, never a company product: a project detail recorded for an accessory set, and
 * supports marked as already existing on that job's walls. Dropped when a job material is made a company product
 * (02: never silently reuse another job's approvals). Returns the readable list of what was dropped.
 */
function dropJobOnly(rules) {
  const out = [];
  if (rules?.recipe && typeof rules.recipe === "object" && rules.recipe.authority) {
    out.push(`project detail ${rules.recipe.authority.ref || ""}`.trim());
    const recipe = { ...rules.recipe };
    delete recipe.authority;
    rules.recipe = recipe;
  }
  if (rules && "existing" in rules) { if (rules.existing === true) out.push("supports marked as already existing"); delete rules.existing; }
  // the site's installation conditions (wind class, substrate …) and a job's "fixings by others / excluded" decision
  if (rules?.installConditions && typeof rules.installConditions === "object") { if (Object.keys(rules.installConditions).length) out.push("installation conditions (wind class, substrate …)"); delete rules.installConditions; }
  if (rules?.fixingScope) { out.push(`support fixings marked ${rules.fixingScope.status === "exclude" ? "excluded" : "by others"}`); delete rules.fixingScope; }
  return out;
}

function initial(value) {
  const v = clone(value) || {};
  // { spec: { family } } alone = "new product of this kind" (e.g. from Add timber → New company product)
  const spec = v.spec?.family ? (Object.keys(v.spec).length === 1 ? freshSpec(v.spec.family) : v.spec) : freshSpec("cladding");
  const m = methodFor(spec);
  const rules = { ...(v.rules || {}) };
  delete rules.carried; // a job's "check these" flags never become company data
  dropJobOnly(rules);
  // the long source link lives on the preset's sourceReview (300 chars); show it in the product review group
  if (v.sourceReview?.sourceUrl && rules.review?.product && !rules.review.product.url) rules.review.product.url = v.sourceReview.sourceUrl;
  return { name: v.name || "", methodKey: m?.key || v.methodKey, methodVersion: m?.version || v.methodVersion, spec, rules, sourceReview: v.sourceReview || null };
}

/** Validation: blocking errors (can't save) + warnings (jobs can measure, not order). Pure. */
function check(content) {
  const errors = [], warnings = [];
  if (!content.name?.trim()) errors.push("Give the product a name.");
  let m = null;
  try { normaliseFamilySpec(content.spec); m = methodFor(content.spec); } catch (e) { errors.push(e.message); }
  const method = m && productionMethods().find((x) => x.key === m.key && x.version === m.version);
  if (!method || !method.generic || !method.families.includes(content.spec?.family)) errors.push("Choose one of the existing calculation methods for this kind of product.");
  for (const [g, label] of GROUPS) {
    const r = content.rules?.review?.[g];
    if (r && r.state !== "candidate" && !(r.ref && r.by && r.at)) errors.push(`${label} review: add the source reference, who checked it and the date — or leave it as a candidate.`);
  }
  if (!errors.length) {
    for (const p of familyProblems(content.spec)) {
      if (content.spec.family === "accessory" && p.message !== "Choose the product.") continue; // dimensions live on each item
      if (content.spec.family === "batten" && /Effective cover/.test(p.message)) continue;
      if (content.spec.family === "timber-cladding" && content.spec.supply === "random" && /stock length/.test(p.message)) { warnings.push("Enter the lengths in the supplier's random mix."); continue; }
      warnings.push(content.spec.family === "accessory" ? "Name the accessory set." : p.message);
    }
    if (m?.key === "accessory_routes" && !(content.rules?.recipe?.groups || []).length) warnings.push("No accessory items yet — each job would have to add them.");
    if (m?.key === "aac_panel_layout" && !isNum(content.rules?.adhesiveJointMm)) warnings.push("The system's approved adhesive joint isn't entered — each job will have to enter it before AAC panels calculate.");
    if (m?.key === "support_grid" && !isNum(content.rules?.maxSpacingMm)) warnings.push("No maximum support spacing — each job will have to enter it from its rule or project detail.");
    if (m?.key === "panel_grid" && !isNum(content.spec?.product?.gapMm)) warnings.push("No expressed-joint gap — each job will have to enter it.");
  }
  return { errors, warnings, methodLabel: method?.label || null };
}

// ── unsaved-draft recovery: a company product being edited survives a reload / closed tab on this device ─────────
const draftKey = (v) => `blh:takeoff:catalogue-draft:${v?.id ? `${v.id}@${v.revision ?? ""}` : `new:${v?.spec?.family || "cladding"}`}`;
const local = {
  get(k) { try { return JSON.parse(window.localStorage.getItem(k) || "null"); } catch { return null; } },
  set(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable — editing still works */ } },
  del(k) { try { window.localStorage.removeItem(k); } catch { /* storage unavailable */ } },
};

function ReviewGroup({ group, label, review, sourceRefs, onChange }) {
  const r = review || { state: "candidate" };
  const set = (p) => onChange({ ...r, ...p });
  return (
    <fieldset className="space-y-2 rounded-lg border border-hairline bg-page p-2" data-review-group={group}>
      <legend className="px-1 text-xs font-semibold text-ink">{label} — source and review</legend>
      <div className="flex flex-wrap items-center gap-1"><ReviewBadge state={r.state} /></div>
      <Chips label="Review state" name={`review-${group}`} value={r.state} options={REVIEW_STATES}
        onChange={(v) => set({ state: v, ...(v !== "candidate" && !r.ref && (sourceRefs || []).length ? { ref: sourceRefs.join(", ").slice(0, 60) } : {}) })} />
      {r.state !== "candidate" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <CommitText label="Checked against (document, edition, page / table / row)" value={r.ref} maxLength={60} onCommit={(t) => set({ ref: t })} />
          <CommitText label="Checked by" value={r.by} maxLength={60} onCommit={(t) => set({ by: t })} />
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Date checked</span>
            <input type="date" value={r.at || ""} onChange={(e) => set({ at: e.target.value || null })} className="min-h-[44px] w-full rounded-lg border border-hairline bg-white px-3 text-base" />
          </label>
          {group === "product" && <CommitText label="Source link (optional)" value={r.url} maxLength={300} onCommit={(t) => set({ url: t })} />}
        </div>
      )}
      <p className="text-[11px] text-muted">
        {group === "installation" ? "Quantity checks are separate from installation suitability — a reviewed transcription here does not activate automatic fixings."
          : "Candidate → transcription checked → independently reviewed against the full table and notes (06)."}
      </p>
    </fieldset>
  );
}

export default function CatalogueEditor({ value, onChange, onSave, onCancel, canEditStandards }) {
  const [draft, setDraft] = useState(() => initial(value));
  // job-only values the source record carried (e.g. "Save as standard" from a job material) — shown, never saved
  const [jobOnly] = useState(() => dropJobOnly(clone(value?.rules) || {}));
  const [key] = useState(() => draftKey(value));
  const [recovered, setRecovered] = useState(() => {
    const d = local.get(key);
    return d?.draft && JSON.stringify(content(d.draft)) !== JSON.stringify(content(initial(value))) ? d : null;
  });
  const [tab, setTab] = useState("product");
  const [tried, setTried] = useState(false);
  const sent = useRef(JSON.stringify(initial(value)));
  useEffect(() => {
    const next = initial(value);
    const j = JSON.stringify(next);
    if (value && j !== sent.current) { sent.current = j; setDraft(next); }
  }, [value]);
  const status = useMemo(() => check(draft), [draft]);
  const s = draft.spec || {}, r = draft.rules || {};
  const fam = s.family;
  const mk = draft.methodKey;

  const commit = (next) => {
    let m = null;
    try { normaliseFamilySpec(next.spec); m = methodFor(next.spec); } catch { /* invalid stays a draft; check() reports it */ }
    const full = { ...next, methodKey: m?.key || next.methodKey, methodVersion: m?.version || next.methodVersion };
    setDraft(full);
    sent.current = JSON.stringify(initial(content(full))); // the echo of this edit from a controlled parent is ignored
    local.set(key, { draft: full, at: new Date().toISOString() });
    setRecovered(null);
    if (m) onChange?.(content(full));
  };
  const setSpec = (p) => commit({ ...draft, spec: { ...draft.spec, ...p } });
  const setProduct = (p) => setSpec({ product: { ...(draft.spec.product || {}), ...p } });
  const setRule = (k, v) => commit({ ...draft, rules: { ...draft.rules, [k]: v } });
  const setReview = (g, v) => commit({ ...draft, rules: { ...draft.rules, review: { ...(draft.rules.review || {}), [g]: v } } });

  if (!canEditStandards) {
    return (
      <div className="space-y-3" data-catalogue-editor="read-only">
        <Banner tone="info">Only office staff can change company standards. You can use this product on a job; the job keeps its own copy.</Banner>
        <p className="text-sm font-semibold text-ink">{draft.name}</p>
        <p className="text-[12px] text-muted">{describeFamilySpec(draft.spec).line}</p>
        <div className="flex flex-wrap gap-1">{GROUPS.map(([g, l]) => <ReviewBadge key={g} prefix={l} state={r.review?.[g]?.state || "candidate"} />)}</div>
        <Btn onClick={onCancel}>Close</Btn>
      </div>
    );
  }

  // UX03 in the catalogue too: a change of kind / product / method / orientation re-selects the assembly and moves
  // every parameter that belonged to the old choice into rules.carried — flagged below, never saved, never applied.
  const chooseFamily = (f) => {
    if (f === fam) return;
    commit(carry(draft, { ...draft, spec: freshSpec(f), rules: productParams(draft.rules) }, "family"));
  };
  const chooseMethod = (key) => {
    const choice = (METHOD_CHOICES[fam] || []).find(([k]) => k === key);
    if (!choice) return;
    const mkey = key.split("@")[0];
    const keepPurpose = fam === "timber" && PURPOSES_FOR[mkey]?.includes(s.purpose);
    const rules = { ...(draft.rules || {}) };
    if (!CENTRES_METHODS.has(mkey)) delete rules.centresMm;
    const spec = { ...draft.spec, ...choice[1], ...(keepPurpose ? { purpose: s.purpose } : {}) };
    if (spec.family !== "timber" && spec.family !== "aluminium") spec.assemblyId = reselectAssembly(spec);
    commit(carry(draft, { ...draft, spec, rules }, "method"));
  };
  const startFrom = (o) => {
    const base = specFromGroup(o.group, { sku: o.sku || undefined });
    const spec = { ...draft.spec, ...base, family: fam };
    spec.assemblyId = reselectAssembly(spec); // the product's own assembly for its listed orientation
    commit(carry(draft, { ...draft, name: draft.name || o.title, spec }, "product"));
  };
  const setOrientation = (o) => {
    const spec = { ...draft.spec, orientation: o };
    spec.assemblyId = reselectAssembly(spec);
    commit(carry(draft, { ...draft, spec }, "orientation"));
  };
  const selectAssembly = (id) => commit(carry(draft, { ...draft, spec: { ...draft.spec, assemblyId: id } }, "assembly"));
  // timber cladding (12): another supplier / profile must bring its own cover — the old one is flagged, never kept
  const setTimberIdentity = (field, v) => {
    const before = field === "supplierName" ? draft.spec.supplierName : draft.spec.product?.name;
    const spec = field === "supplierName" ? { ...draft.spec, supplierName: v } : { ...draft.spec, product: { ...(draft.spec.product || {}), name: v } };
    const next = { ...draft, spec };
    commit(before && before !== v && isNum(draft.spec.product?.effectiveCoverMm) ? carry(draft, next, "supplier") : next);
  };
  const currentMethod = `${draft.methodKey}@${draft.methodVersion}`;
  const methodLabel = status.methodLabel;
  const canSave = !status.errors.length;
  // only this product's family / manufacturer / orientation (CL05: AAC systems never mixed; 12: foam never takes a
  // fibre-cement or AAC assembly)
  const assemblies = assemblyCandidates(s);
  const unlisted = s.assemblyId && !assemblies.some((a) => a.id === s.assemblyId) ? s.assemblyId : null;
  const showOrientation = (fam === "cladding" && s.layout === "course") || fam === "timber-cladding" || fam === "batten";
  const orientationsOk = fam === "batten" ? new Set(["horizontal", "vertical"]) : orientationsFor(s);
  const company = r.assembly || null;

  return (
    <KeyboardSafe className="space-y-3" data-catalogue-editor="">
      {recovered && (
        <Banner tone="warn" action={<div className="flex flex-wrap gap-2"><Btn onClick={() => commit(recovered.draft)}>Restore</Btn><Btn kind="ghost" onClick={() => { local.del(key); setRecovered(null); }}>Discard</Btn></div>}>
          <span data-draft-recovery="">Unsaved changes to this product from {new Date(recovered.at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })} were kept on this device.</span>
        </Banner>
      )}
      <TextField label="Product name (as the crew will see it)" value={draft.name} onChange={(v) => commit({ ...draft, name: v })} placeholder="e.g. Spotted gum shiplap 135 — Supplier A" />
      <Chips label="What is it?" name="family" value={fam} options={FAMILIES} onChange={chooseFamily} />
      <fieldset data-method-choice="">
        <Chips label="Calculation method (existing methods only)" name="method" value={currentMethod} options={(METHOD_CHOICES[fam] || []).map(([k, , text]) => [k, text])} onChange={chooseMethod} />
        <p className="mt-1 text-[11px] text-muted">Uses <b>{methodLabel || "—"}</b> ({currentMethod}). There are no formula fields: a new kind of calculation is a development change, not a catalogue setting.</p>
      </fieldset>
      <CarriedFlags cur={draft} update={(fn) => commit(fn(draft))} note="These are not saved with the company product unless you choose Use." />
      {jobOnly.length > 0 && (
        <Banner tone="info"><span data-job-only="">Left out of the company product — they belong to the job they were entered on: {jobOnly.join("; ")}.</span></Banner>
      )}

      <div role="tablist" aria-label="Catalogue sections" className="grid grid-cols-3 gap-1 rounded-lg border border-hairline bg-white p-1">
        {GROUPS.map(([g, label]) => (
          <button key={g} type="button" role="tab" aria-selected={tab === g} onClick={() => setTab(g)}
            className={`min-h-[44px] rounded-md px-2 text-sm font-medium ${tab === g ? "bg-primary text-white" : "text-ink"}`}>
            {label}{r.review?.[g]?.state && r.review[g].state !== "candidate" ? " ✓" : ""}
          </button>
        ))}
      </div>

      {tab === "product" && (
        <section role="tabpanel" aria-label="Product" className="space-y-3">
          {["cladding", "aac", "batten"].includes(fam) && (
            <details className="rounded-lg border border-hairline bg-white px-2">
              <summary className="flex min-h-[44px] cursor-pointer items-center text-sm text-ink">Start from a researched product (optional)</summary>
              <div className="pb-2"><ProductPicker family={fam} spec={s} onPick={startFrom} /></div>
            </details>
          )}
          {fam === "timber" ? (
            <>
              <Chips label="Purpose" name="purpose" value={s.purpose} onChange={(v) => setSpec({ purpose: v })}
                options={(PURPOSES_FOR[mk] || TIMBER_PURPOSES).map((p) => [p, PURPOSE_LABEL[p]])} />
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Section depth" value={s.section?.depthMm} onCommit={(n) => setSpec({ section: { ...s.section, depthMm: n } })} />
                <NumberField label="Section width" value={s.section?.widthMm} onCommit={(n) => setSpec({ section: { ...s.section, widthMm: n } })} />
                <TextField label="Grade" value={s.grade} onChange={(v) => setSpec({ grade: v })} placeholder="e.g. MGP10" />
                <TextField label="Species" value={s.species} onChange={(v) => setSpec({ species: v })} />
                <TextField label="Treatment" value={s.treatment} onChange={(v) => setSpec({ treatment: v })} placeholder="e.g. H3" />
                <NumberField label="Plies" unit="" integer min={1} value={s.plies ?? 1} onCommit={(n) => setSpec({ plies: n })} />
              </div>
              <p className="text-[11px] text-muted">Size: manual selection — the app does not check structural adequacy.</p>
            </>
          ) : fam === "aluminium" ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                <NumberField label="Leg A" value={s.profile?.aMm} onCommit={(n) => setSpec({ profile: { ...s.profile, aMm: n } })} />
                <NumberField label="Leg B" value={s.profile?.bMm} onCommit={(n) => setSpec({ profile: { ...s.profile, bMm: n } })} />
                <NumberField label="Thickness" value={s.profile?.tMm} onCommit={(n) => setSpec({ profile: { ...s.profile, tMm: n } })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <TextField label="Alloy / temper" value={s.alloyTemper} onChange={(v) => setSpec({ alloyTemper: v })} />
                <TextField label="Finish" value={s.finish} onChange={(v) => setSpec({ finish: v })} />
                <TextField label="Colour" value={s.colour} onChange={(v) => setSpec({ colour: v })} />
              </div>
            </>
          ) : (
            <>
              {fam === "accessory" ? (
                <div className="grid grid-cols-2 gap-2">
                  <TextField label="Manufacturer / system (optional)" value={s.product?.manufacturer} onChange={(v) => setProduct({ manufacturer: v })} />
                  <TextField label="Accessory set" value={s.product?.name} onChange={(v) => setProduct({ name: v })} />
                  <p className="col-span-2 text-[11px] text-muted">Each item&apos;s exact product, stock lengths, roll or cartridge size and reviewed yield are set with the item in Installation.</p>
                </div>
              ) : (
              <div className="grid grid-cols-2 gap-2">
                <TextField label="Manufacturer" value={s.product?.manufacturer} onChange={(v) => setProduct({ manufacturer: v })} />
                {fam === "timber-cladding" ? <CommitText label="Species / profile" value={s.product?.name} onCommit={(t) => setTimberIdentity("name", t)} />
                  : <TextField label={fam === "aac" ? "System" : "Product"} value={s.product?.name} onChange={(v) => setProduct({ name: v })} />}
                <NumberField label={fam === "timber-cladding" ? "Nominal width" : "Width"} value={s.product?.widthMm} onCommit={(n) => setProduct(fam === "foam" ? { widthMm: n, effectiveCoverMm: n } : { widthMm: n })} />
                <NumberField label="Thickness" value={s.product?.thicknessMm} onCommit={(n) => setProduct({ thicknessMm: n })} />
                <TextField label="Finish / texture" value={s.product?.finish} onChange={(v) => setProduct({ finish: v })} />
                {fam !== "timber-cladding" && <TextField label="Manufacturer SKU (single size)" value={s.product?.sku} onChange={(v) => setProduct({ sku: v })} />}
              </div>
              )}
              {(fam === "cladding" && s.layout !== "grid") || fam === "timber-cladding" ? (
                <>
                  {fam === "timber-cladding" && <Chips label="Effective cover (this supplier/product)" name="cover" value={s.product?.effectiveCoverMm} onChange={(v) => setProduct({ effectiveCoverMm: v })} options={TIMBER_COVER_OPTIONS_MM.map((c) => [c, `${c} mm`])} />}
                  <NumberField label={fam === "timber-cladding" ? "Other effective cover" : "Effective cover"} max={3000}
                    value={fam === "timber-cladding" && TIMBER_COVER_OPTIONS_MM.includes(s.product?.effectiveCoverMm) ? null : s.product?.effectiveCoverMm}
                    onCommit={(n) => setProduct({ effectiveCoverMm: n })} help="The product's published / supplier cover — never the nominal width; no further overlap is deducted." />
                </>
              ) : null}
              {fam === "timber-cladding" && <Chips label="Ends" name="ends" value={s.endCondition} options={[["square", "Square"], ["end-matched", "End-matched"]]} onChange={(v) => setSpec({ endCondition: v })} />}
              {fam === "foam" && <Chips label="Coating" name="coating" value={s.coating} options={[["factory", "Factory-coated"], ["applicator", "Applicator-coated"]]} onChange={(v) => setSpec({ coating: v })} />}
              {fam === "aac" && <p className="text-[11px] text-muted">One manufacturer and wall system per product — AAC brands are never mixed. Walsc is the company preference.</p>}
              <SourcePicker value={s.product?.sourceRefs || []} onChange={(v) => setProduct({ sourceRefs: v })} />
              <SourceRefs refs={s.product?.sourceRefs} label="Product sources" />
            </>
          )}
          <ReviewGroup group="product" label="Product facts" review={r.review?.product} sourceRefs={s.product?.sourceRefs} onChange={(v) => setReview("product", v)} />
        </section>
      )}

      {tab === "ordering" && (
        <section role="tabpanel" aria-label="Ordering" className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {fam === "timber-cladding" ? <CommitText label="Supplier" value={s.supplierName} onCommit={(t) => setTimberIdentity("supplierName", t)} />
              : <TextField label="Supplier" value={s.supplierName} onChange={(v) => setSpec({ supplierName: v })} />}
            <TextField label="Supplier code" value={s.productCode} onChange={(v) => setSpec({ productCode: v })} />
          </div>
          <Chips label="Availability" name="availability" value={s.availability || "confirm_with_supplier"} onChange={(v) => setSpec({ availability: v })}
            options={[["confirm_with_supplier", "Confirm with supplier"], ["supplier_confirmed", "Supplier confirmed"]]} />
          {fam === "timber" ? (
            <fieldset className="space-y-2 rounded-lg border border-hairline p-2">
              <legend className="px-1 text-xs font-semibold text-ink">Stock</legend>
              <p className="text-sm text-ink">1200 mm, then every 300 mm — the same grid at every supplier (owner setting).</p>
              <NumberField label="Longest available length" value={s.stock?.maxMm} onCommit={(n) => setSpec({ stock: { ...s.stock, maxMm: n } })} />
              <LengthList label="Grid lengths this supplier doesn't stock" values={s.stock?.unavailableMm} placeholder="e.g. 6600" onCommit={(v) => setSpec({ stock: { ...s.stock, unavailableMm: v } })}
                help="Availability can only remove grid lengths — never add off-grid ones." />
              <NumberField label="End allowance" value={s.endAllowanceMm ?? 0} min={0} onCommit={(n) => setSpec({ endAllowanceMm: n })} help="0 unless the company sets one." />
            </fieldset>
          ) : fam === "aluminium" ? (
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Stock length" value={s.stockLengthMm} onCommit={(n) => setSpec({ stockLengthMm: n })} />
              <NumberField label="Saw kerf" value={s.kerfMm} min={0} max={20} onCommit={(n) => setSpec({ kerfMm: n })} help="Each job still confirms it before ordering." />
              <NumberField label="End trim" value={s.endTrimMm ?? 0} min={0} onCommit={(n) => setSpec({ endTrimMm: n })} />
              <NumberField label="Keep offcuts from" value={s.minRetainedOffcutMm ?? 300} min={0} onCommit={(n) => setSpec({ minRetainedOffcutMm: n })} />
            </div>
          ) : fam === "timber-cladding" && s.supply === "random" ? (
            <>
              <NumberField label="Supplier ordering increment" unit="m" value={s.orderIncrementM} onCommit={(n) => setSpec({ orderIncrementM: n })} help="Random lengths are ordered as total LM — never a piece count." />
              <LengthList label="Lengths in the supplier's random mix" values={s.product?.lengthsMm} placeholder="e.g. 1800, 2400, 3000, 5400" onCommit={(v) => setProduct({ lengthsMm: v, lengthMm: null })}
                help="Recorded with the order (shortest and longest a job may receive). The LM estimate doesn't use them and never becomes a piece count." />
            </>
          ) : fam !== "accessory" ? (
            <>
              <LengthList label={fam === "aac" || fam === "foam" || fam === "cladding" ? "Listed lengths / heights" : "Stock lengths"} values={s.product?.lengthsMm}
                onCommit={(v) => setProduct({ lengthsMm: v, lengthMm: v.length === 1 ? v[0] : null, skus: (s.product?.skus || []).filter((k) => v.includes(k.lengthMm)) })}
                help={`Manufactured boards keep their product sizes. The timber grid (${TIMBER_GRID.minMm} mm, then every ${TIMBER_GRID.incrementMm} mm) does not apply.`} />
              {(s.product?.lengthsMm || []).length > 1 && (
                <div className="grid grid-cols-2 gap-2" data-sku-per-length="">
                  {(s.product.lengthsMm || []).map((L) => (
                    <TextField key={L} label={`SKU for ${L} mm`} value={(s.product.skus || []).find((k) => k.lengthMm === L)?.sku || ""}
                      onChange={(v) => setProduct({ skus: [...(s.product.skus || []).filter((k) => k.lengthMm !== L), ...(v ? [{ sku: v, lengthMm: L }] : [])].sort((a, b) => a.lengthMm - b.lengthMm) })} />
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Pack quantity (published)" unit="pcs" integer min={1} value={s.product?.packQuantity} onCommit={(n) => setProduct({ packQuantity: n })} />
                <label className="flex min-h-[44px] items-center gap-2 self-end text-sm">
                  <input type="checkbox" className="h-5 w-5 rounded text-primary" checked={!!s.product?.fullPackRequired} onChange={(e) => setProduct({ fullPackRequired: e.target.checked })} />
                  Supplier sells full packs only
                </label>
              </div>
              <p className="text-[11px] text-muted">A published pack size doesn&apos;t mean full packs are required — tick it only when the supplier says so.</p>
            </>
          ) : <p className="text-sm text-muted">Each accessory item keeps its own stock lengths, roll or cartridge size — set them with the item in Installation.</p>}
          <NumberField label="Spares" unit="%" value={s.spareRate ?? 0} min={0} max={100} onCommit={(n) => setSpec({ spareRate: n })} help={mk === "area_to_linear" ? "Added on top of the LM estimate. 0 doesn't mean no real waste." : "Added on top of each job's layout count and shown on its order lines (rounded up per line) — don't add spares by hand. 0 doesn't mean no real waste."} />
          <ReviewGroup group="ordering" label="Ordering" review={r.review?.ordering} sourceRefs={[s.supplierName].filter(Boolean)} onChange={(v) => setReview("ordering", v)} />
        </section>
      )}

      {tab === "installation" && (
        <section role="tabpanel" aria-label="Installation" className="space-y-3">
          {showOrientation && (
            <Chips label="Orientation" name="orientation" value={s.orientation || "vertical"} onChange={setOrientation}
              options={[["vertical", "Vertical", !orientationsOk.has("vertical")], ["horizontal", "Horizontal", !orientationsOk.has("horizontal")]]} />
          )}
          {!["timber", "aluminium", "accessory"].includes(fam) && (
            <fieldset className="space-y-2" data-editor-assembly="">
              <legend className="mb-1 text-xs font-medium text-muted">Installation assembly (choose or duplicate)</legend>
              {!assemblies.length && <p className="text-[12px] text-muted" data-no-assembly="">{fam === "aac" && !s.product?.manufacturer ? "Enter the manufacturer (Product tab) to see its own system's assembly — AAC systems are never mixed."
                : "No researched assembly lists this product, method and orientation — supports and fixings need a reviewed project detail."}</p>}
              {unlisted && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-950" data-assembly-unlisted="">
                  <p><b><AssemblyName id={unlisted} /></b> is selected but isn&apos;t listed for this product{showOrientation ? ` (${s.orientation || "vertical"})` : ""}. Check it against the product, or clear it.</p>
                  <Btn kind="ghost" onClick={() => selectAssembly(null)}>Clear this assembly</Btn>
                </div>
              )}
              {assemblies.map((a) => (
                <button key={a.id} type="button" aria-pressed={s.assemblyId === a.id} data-assembly={a.id} onClick={() => selectAssembly(a.id)}
                  className={`flex min-h-[52px] w-full flex-col items-start rounded-lg border px-3 py-2 text-left ${s.assemblyId === a.id ? "border-primary bg-primary/5" : "border-hairline bg-white"}`}>
                  <span className="text-sm font-medium text-ink"><AssemblyName id={a.id} /></span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1"><ReviewBadge state="candidate" /><span className="text-[11px] text-muted">source {a.sourceRefs.join(", ")} · needs {a.requiredSelectors.join(", ")}</span></span>
                </button>
              ))}
              <Btn kind="ghost" disabled={!s.assemblyId} onClick={() => setRule("assembly", { baseId: s.assemblyId, label: `${(company?.label || "Company version").slice(0, 40)}`, detailRef: company?.detailRef || "" })}>Duplicate as a company version</Btn>
              {company && (
                <div className="grid grid-cols-1 gap-2 rounded-lg border border-hairline bg-white p-2 sm:grid-cols-2" data-company-assembly="">
                  <CommitText label="Company assembly name" value={company.label} maxLength={60} onCommit={(t) => setRule("assembly", { ...company, label: t || "Company version" })} />
                  <CommitText label="Detail / drawing reference" value={company.detailRef} maxLength={60} onCommit={(t) => setRule("assembly", { ...company, detailRef: t || "" })} />
                  <p className="text-[11px] text-muted sm:col-span-2">Based on {company.baseId || "—"}. It stays source-pending until its rule rows are reviewed — duplicating never approves it.</p>
                  <Btn kind="ghost" onClick={() => { const rules = { ...draft.rules }; delete rules.assembly; commit({ ...draft, rules }); }}>Remove company version</Btn>
                </div>
              )}
              <p className="text-[11px] text-muted">Assemblies name specific products. A product the assembly doesn&apos;t list needs its own reviewed detail.</p>
            </fieldset>
          )}
          {mk === "aac_panel_layout" && (
            <NumberField label="Approved adhesive joint (system value)" value={isNum(r.adhesiveJointMm) ? r.adhesiveJointMm : null} min={0} max={30} onCommit={(n) => setRule("adhesiveJointMm", n)}
              help="From the current guide for this exact system — never defaulted, and not a movement gap." />
          )}
          {mk === "panel_grid" && (
            <NumberField label="Expressed joint gap" value={isNum(s.product?.gapMm) ? s.product.gapMm : null} min={0} max={50} onCommit={(n) => setProduct({ gapMm: n })} help="An assembly parameter (e.g. H10) — not added to the panel size." />
          )}
          {(mk === "panel_grid" || mk === "aac_panel_layout") && (
            <NumberField label="Minimum cut strip" value={isNum(r.minStripMm) ? r.minStripMm : null} min={0} max={2000} onCommit={(n) => setRule("minStripMm", n)} help="Blank = every cut strip is flagged for review on the job." />
          )}
          {mk === "support_grid" && (
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Maximum support spacing" value={isNum(r.maxSpacingMm) ? r.maxSpacingMm : null} min={1} max={3000} onCommit={(n) => setRule("maxSpacingMm", n)} help="From a reviewed rule row or detail — never defaulted." />
              <CommitText label="Spacing authority" value={r.spacingRef} maxLength={60} onCommit={(t) => setRule("spacingRef", t)} />
            </div>
          )}
          {fam === "accessory" && (
            <fieldset className="space-y-2" data-editor-recipe="">
              <legend className="mb-1 text-xs font-medium text-muted">Accessory items (routes, scope, reviewed yields)</legend>
              <AccessoryRecipeEditor recipe={r.recipe || null} showAuthority={false} onChange={(next) => { const recipe = { ...next }; delete recipe.authority; setRule("recipe", recipe); }} />
            </fieldset>
          )}
          {fam === "timber" && ["repeated_members", "wall_frame"].includes(mk) && (
            <NumberField label="Centres" value={r.centresMm ?? 600} min={1} max={6000} onCommit={(n) => setRule("centresMm", n)} />
          )}
          <div className="rounded-lg border border-hairline bg-white px-3 py-2" data-installation-state="">
            <p className="text-xs font-semibold text-ink">Installation state</p>
            <div className="mt-1"><ReviewBadge state="source-pending" /></div>
            <p className="mt-1 text-[11px] text-muted">No reviewed guide rows are loaded, so automatic fixings stay off and jobs show installation as source-pending. Measuring and quantities still work.</p>
          </div>
          <ReviewGroup group="installation" label="Installation" review={r.review?.installation} sourceRefs={CATALOGUE_SEED.assemblyCandidates.find((a) => a.id === s.assemblyId)?.sourceRefs} onChange={(v) => setReview("installation", v)} />
        </section>
      )}

      <StatusRow status={{ quantity: status.warnings.length ? "incomplete" : "pending", installation: "source-pending", procurement: status.warnings.length ? "missing-product" : "draft" }}
        note="What a job gets from this product before anything is measured — quantities come from each job's walls." />
      {status.warnings.length > 0 && (
        <Banner tone="warn"><span className="font-semibold">Jobs can measure with this, but can&apos;t order until:</span> {status.warnings.join(" ")}</Banner>
      )}
      {tried && status.errors.length > 0 && <Banner tone="error"><span data-editor-errors="">{status.errors.join(" ")}</span></Banner>}
      <div className="sticky bottom-0 grid grid-cols-2 gap-2 border-t border-hairline bg-page py-2" data-sticky-footer="">
        <Btn onClick={() => { local.del(key); onCancel?.(); }}>Cancel</Btn>
        <Btn kind="primary" onClick={() => { setTried(true); if (canSave) { local.del(key); onSave?.(content(draft)); } }}>Save company version</Btn>
      </div>
      <p className="text-[11px] text-muted">Saving makes a new company version. Jobs keep their own copies until someone chooses to update them.</p>
    </KeyboardSafe>
  );
}

/** The preset content the server stores (06): no ids, no job state, no code. */
function content(d) {
  const rules = clone(d.rules) || {};
  delete rules.carried;
  delete rules.jointRowsDraft; // an unfinished entry is never company data
  delete rules.jointsDraft;
  delete rules.fixingDraft;
  delete rules.defaultsFrom; delete rules.companyDefault; // HUB 014: a company default is saved only from the cladding card
  dropJobOnly(rules);
  if (rules.review) for (const g of Object.keys(rules.review)) if (!rules.review[g]) delete rules.review[g];
  const pr = rules.review?.product;
  const sourceReview = pr && pr.state !== "candidate"
    ? { sourceUrl: pr.url || null, title: pr.ref || null, checkedAt: pr.at || null, reviewedBy: pr.by || null, status: pr.state === "reviewed" ? "reviewed" : "user_entered" }
    : { status: "user_entered" };
  if (pr) delete pr.url; // rules strings are capped at 60 server-side; the link is kept on sourceReview
  return { name: (d.name || "").trim(), methodKey: d.methodKey, methodVersion: d.methodVersion, spec: clone(d.spec), rules, sourceReview };
}
