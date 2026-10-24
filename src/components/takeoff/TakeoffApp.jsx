// =============================================================================
// TakeoffApp — the ONE takeoff feature, mounted by the Hub (job context) and the Worker PWA
// (under /worker). It receives a job reference and an API adapter (src/lib/takeoffApi.js);
// there is no separate mobile implementation.
//
// Windows: Job takeoffs → Workspace overview → Plan setup / Scale / Measure / Choose material /
// Material rules / Flashing profile / Length schedule / Orders. Focused windows (scale, measure,
// profile) take the full screen and hide module navigation until closed.
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FLASHING_SPEC_DEFAULTS, GROUP_LABEL, NEW_FLASHING_RULES, SECTIONS, SECTION_LABEL, TIMBER_GRID, describeFamilySpec, indicativeGirthMm, latestPageCalibrations, materialGroup, materialSection, methodFor, normaliseSpec, rescaleCandidates } from "../../../shared/takeoff/index.js";
import { aluminiumPreset } from "../../../shared/takeoff/products/index.js";
import { companyDefaultContent, findCompanyDefault } from "../../../shared/takeoff/companyDefaults.js";
import { companyVersionDiffers, findAluminiumProduct, profileSizeText, sameAluminiumProfile } from "../../../shared/takeoff/companyProducts.js";
import { clearEditorDraft, listEditorDrafts } from "../../lib/takeoffRecovery.js";
import { draftCardText, editorDraftCard, materialForDraft } from "./editorDrafts.js";
import { newId } from "../../lib/takeoffApi.js";
import { describeChanges, nameChanges, partial } from "./changeset.js";
import { useTakeoffWorkspace } from "./useTakeoffWorkspace.js";
import { usePlanDocument } from "./usePlanDocument.js";
import CalibrationScreen from "./CalibrationScreen.jsx";
import MeasureScreen from "./MeasureScreen.jsx";
import MaterialPicker, { FamilyPresetPicker, PresetUpdateReview } from "./MaterialPicker.jsx";
import CatalogueEditor from "./CatalogueEditor.jsx";
import MaterialSheet from "./MaterialSheet.jsx";
import ProfileEditor from "./ProfileEditor.jsx";
import { AluminiumSetup, CladdingSetup, TimberSetup } from "./FamilySetup.jsx";
import ScheduleScreen from "./ScheduleScreen.jsx";
import WallsScreen from "./WallsScreen.jsx";
import { reviewWalls } from "./measure/tools.js";
import AluminiumScreen from "./AluminiumScreen.jsx";
import OrdersScreen from "./OrdersScreen.jsx";
import PlanSetup from "./PlanSetup.jsx";
import RescaleReview from "./RescaleReview.jsx";
import { AsyncState, Banner, Btn, FocusedWindow, FocusMode, NumberField, SaveChip, SaveProblem } from "./ui.jsx";
import { docLabel, fmtLm, fmtMm } from "./format.js";

// "return to where I was" applies to a real page RELOAD only, once per page load (not to a fresh visit or an in-app reopen)
let placeRestoreSpent = false;
let entryRestoreSpent = false;
const isReload = () => { try { return performance.getEntriesByType("navigation")[0]?.type === "reload"; } catch { return false; } };

// materials measured as walls (+ openings) rather than plan lines
const WALL_FAMILIES = new Set(["cladding", "aac", "foam", "timber-cladding", "batten", "accessory"]);
const usesWalls = (m) => WALL_FAMILIES.has(m?.spec?.family) || (m?.spec?.family === "timber" && ["studs", "plates", "noggins"].includes(m?.spec?.purpose));
const CLADDING_FAMILIES = new Set(["cladding", "aac", "foam", "timber-cladding"]);

const SECTION_HELP = {
  flashings: "Flashing profiles and lengths — ordered from the flashing supplier.",
  timber_cladding: "Timber, cladding, battens, accessories and aluminium — one order to the timber and cladding supplier.",
};

export default function TakeoffApp({ api, jobType, jobId, onExternalView }) {
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const [code, setCode] = useState(null);
  const entryKey = `takeoff-entry:${jobType}:${jobId}`;
  // HUB 002: the first choice is Flashings or Timber and cladding. A real page reload returns to the section that was
  // open (read once per page load in an effect, so React's dev double-render can't spend it before it is used).
  const [wsId, setWsId] = useState(null);
  // ?section=flashings | timber_cladding links straight into a section
  const [section, setSection] = useState(() => {
    try { const q = new URLSearchParams(window.location.search).get("section"); return SECTION_VALUES_ORDER.includes(q) ? q : null; } catch { return null; }
  });
  const [entryChecked, setEntryChecked] = useState(false);
  useEffect(() => {
    if (entryRestoreSpent) { setEntryChecked(true); return; }
    entryRestoreSpent = true;
    let saved = null;
    if (isReload()) { try { saved = JSON.parse(sessionStorage.getItem(entryKey) || "null"); } catch { saved = null; } }
    if (saved?.wsId) setWsId((cur) => cur || saved.wsId);
    if (saved?.section && SECTION_VALUES_ORDER.includes(saved.section)) setSection((cur) => cur || saved.section);
    setEntryChecked(true);
  }, [entryKey]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const r = await api.job(jobType, jobId);
    if (!r.ok) { setError(r.error); setCode(r.code || (r.status === 403 ? "FORBIDDEN" : null)); return; }
    setJob(r.data);
    // one takeoff per job: it opens straight into the chosen section
    if (r.data.workspaces.length === 1) setWsId((cur) => cur || r.data.workspaces[0].id);
    else setWsId((cur) => (cur && r.data.workspaces.some((w) => w.id === cur) ? cur : null));
  }, [api, jobType, jobId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!entryChecked) return;   // never overwrite the saved place before it has been read
    try { sessionStorage.setItem(entryKey, JSON.stringify({ wsId, section })); } catch { /* private mode: nothing kept */ }
  }, [entryKey, wsId, section, entryChecked]);

  async function create(sec) {
    setBusy(true);
    const r = await api.createWorkspace(jobType, jobId, { id: newId(), name: "Takeoff" });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    await load();
    setWsId(r.data.workspace.id);
    setSection(sec);
  }
  function choose(sec) {
    if (!job.workspaces.length) { if (job.capabilities?.edit) create(sec); return; }
    if (job.workspaces.length === 1) setWsId(job.workspaces[0].id);
    setSection(sec);
  }

  if (wsId && section) {
    return <WorkspaceView key={wsId} api={api} wsId={wsId} job={job} section={section} onSection={setSection}
      onBack={() => { setSection(null); if (job?.workspaces?.length > 1) setWsId(null); load(); }} onExternalView={onExternalView} />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-3">
      <h1 className="text-lg font-semibold text-ink">Takeoff{job?.job?.label ? <span className="block text-sm font-normal text-muted">{job.job.label}</span> : null}</h1>
      <AsyncState loading={!job && !error} error={error} code={code} onRetry={load}>
        {job && (
          <>
            {!job.plans.length && <Banner tone="info">This job has no plans yet. Upload a plan to the job first, then come back to measure it.</Banner>}
            {(!section || !job.workspaces.length) && (
              <>
                <p className="text-sm text-muted">What are you measuring?</p>
                <div className="grid gap-2 sm:grid-cols-2" data-takeoff-sections="">
                  {SECTION_VALUES_ORDER.map((sec) => (
                    <button key={sec} type="button" onClick={() => choose(sec)} disabled={busy || (!job.workspaces.length && !job.capabilities?.edit)} data-section={sec}
                      className="flex min-h-[72px] w-full items-center gap-2 rounded-card border border-hairline bg-white px-3 py-2 text-left disabled:opacity-50">
                      <span className="flex-1"><span className="block text-base font-semibold text-ink">{SECTION_LABEL[sec]}</span>
                        <span className="block text-xs text-muted">{SECTION_HELP[sec]}</span></span>
                      <span className="text-muted" aria-hidden="true">›</span>
                    </button>
                  ))}
                </div>
                {!job.workspaces.length && !job.capabilities?.edit && <p className="text-sm text-muted">No takeoff on this job yet.</p>}
              </>
            )}
            {section && !wsId && job.workspaces.length > 1 && (
              <>
                <div className="flex items-center gap-2">
                  <Btn kind="ghost" onClick={() => setSection(null)}>‹ Back</Btn>
                  <p className="flex-1 text-sm font-medium text-ink">{SECTION_LABEL[section]} — choose the takeoff</p>
                </div>
                <ul className="divide-y divide-hairline rounded-card border border-hairline bg-white">
                  {job.workspaces.map((w) => (
                    <li key={w.id}>
                      <button type="button" onClick={() => setWsId(w.id)} className="flex min-h-[52px] w-full items-center gap-2 px-3 text-left">
                        <span className="flex-1 text-sm font-medium text-ink">{w.name}</span>
                        {w.state === "needs_review" && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Needs review</span>}
                        <span className="text-muted">›</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </AsyncState>
    </div>
  );
}

const SECTION_VALUES_ORDER = [SECTIONS.FLASHINGS, SECTIONS.TIMBER_CLADDING];

function WorkspaceView({ api, wsId, job, section, onSection, onBack, onExternalView }) {
  const ws = useTakeoffWorkspace(api, wsId);
  const view = ws.view;
  const caps = ws.capabilities || {};
  const [win, setWin] = useState("overview");
  const [docId, setDocId] = useState(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [rotation, setRotation] = useState(0);
  // HUB 023: scaling a page or choosing another page from Measure comes straight back to Measure, with the tool in use;
  // the page picker opened from Measure never changes the takeoff's main plan page
  const [measureTool, setMeasureTool] = useState(null);
  const [scaleFrom, setScaleFrom] = useState(null);     // "measure" when the scale was asked for from Measure
  const [pageFrom, setPageFrom] = useState(null);       // { docId, pageIndex } Measure was on when the page picker opened
  const [activeMaterial, setActiveMaterial] = useState(null);
  const [openWall, setOpenWall] = useState(null); // wall measurement open in the elevation editor
  const [openWallTab, setOpenWallTab] = useState(null); // the tab that wall opens on (a batten line's "Show on wall" → Supports)
  const [highlightIds, setHighlightIds] = useState(null); // schedule "show on plan" → measurements to select
  const [editing, setEditing] = useState(null); // { material, isNew, next }
  const [setupFrom, setSetupFrom] = useState(null); // window a family setup card was opened from (returns there)
  const [catalogue, setCatalogue] = useState(null); // company product editor: { preset|null, value }
  const [reviewUpdate, setReviewUpdate] = useState(null); // job material id whose newer company version is being reviewed
  const [presets, setPresets] = useState([]);
  const [manualFor, setManualFor] = useState(null);
  const [notice, setNotice] = useState(null);
  // unfinished drawings kept on this device (R04 F02) — offered after a reload / PWA restart
  const [editorDrafts, setEditorDrafts] = useState([]);
  const draftActor = ws.server?.capabilities?.actorKey || null;
  const draftWs = view?.workspace?.id || null;
  const refreshDrafts = useCallback(() => {
    if (!draftActor || !draftWs) return;
    listEditorDrafts(draftActor, draftWs).then(setEditorDrafts);
  }, [draftActor, draftWs]);
  useEffect(() => { refreshDrafts(); }, [refreshDrafts]);
  /** HUB 018: forget one drawing's device copy now (its card goes at once) — the list is re-read after the delete. */
  const dropDraft = useCallback((materialId) => {
    setEditorDrafts((ds) => ds.filter((d) => d.materialId !== materialId));
    if (draftActor && draftWs) clearEditorDraft(draftActor, draftWs, materialId).then(refreshDrafts);
  }, [draftActor, draftWs, refreshDrafts]);
  // HUB 018: only drafts with something to recover get a card — a drawing already saved as it is in its flashing doesn't
  const draftCards = useMemo(() => (view ? editorDrafts.map((d) => {
    const card = editorDraftCard(d, view.materials.find((x) => x.id === d.materialId));
    return card ? { ...card, key: d.key, record: d } : null;
  }).filter(Boolean) : []), [editorDrafts, view]);
  // … and the ones with nothing left to recover (finished drawings from older builds) are cleared quietly
  useEffect(() => {
    if (!view || !draftActor || !draftWs) return;
    const keep = new Set(draftCards.map((c) => c.key));
    const open = editing?.stage === "profile" ? editing.material?.id : null; // never under the drawing that is open now
    const stale = editorDrafts.filter((d) => !keep.has(d.key) && d.materialId !== open);
    if (stale.length) Promise.all(stale.map((d) => clearEditorDraft(draftActor, draftWs, d.materialId))).then(refreshDrafts);
  }, [draftCards, editorDrafts, view, draftActor, draftWs, refreshDrafts, editing]);

  const plans = useMemo(() => view?.documents || job?.plans || [], [view?.documents, job?.plans]);
  const primaryDoc = view?.workspace?.primaryDocumentId;
  // ?scalePlan=<docId> (from "Scale plans" after an upload): open that plan's page setup once
  const [scalePlan] = useState(() => { try { return new URLSearchParams(window.location.search).get("scalePlan"); } catch { return null; } });
  const [scaleHandled, setScaleHandled] = useState(false);
  useEffect(() => {
    if (!view) return;
    if (scalePlan && !scaleHandled && plans.some((p) => p.id === scalePlan && p.status === "current")) {
      setScaleHandled(true); setDocId(scalePlan); setPageIndex(0); setWin("setup"); return;
    }
    if (docId) return;
    // HUB 021: the page this device was last on — same plan, unchanged — else the takeoff's main plan page
    let mine = null;
    try { mine = JSON.parse(localStorage.getItem(`takeoff-plan-page:${view.workspace.id}`) || "null"); } catch { /* none */ }
    const same = mine && plans.find((p) => p.id === mine.docId && p.status === "current" && (p.contentSha256 || null) === (mine.contentSha256 || null));
    if (same && Number.isInteger(mine.pageIndex) && mine.pageIndex >= 0) { setDocId(same.id); setPageIndex(mine.pageIndex); return; }
    const first = primaryDoc || plans.find((p) => p.status === "current")?.id || null;
    setDocId(first);
    setPageIndex(view.workspace.primaryPageIndex ?? 0);
  }, [view, docId, primaryDoc, plans, scalePlan, scaleHandled]);
  // the material being measured always belongs to the open section (HUB 002)
  useEffect(() => {
    const own = (view?.materials || []).filter((m) => materialSection(m) === section);
    if (own.length && !own.some((m) => m.id === activeMaterial)) setActiveMaterial(own[0].id);
  }, [view, activeMaterial, section]);
  const [openRow, setOpenRow] = useState(null); // material row whose actions are showing ("" = all closed)
  const [orderFocus, setOrderFocus] = useState(null); // HUB 010: { orderId, bucketKey } to come back to after a fix
  useEffect(() => { if (win === "overview") setOrderFocus(null); }, [win]);
  const [moreFor, setMoreFor] = useState(null);
  // a reload (or a PWA restart) returns to the wall / cutting sheet / schedule the user had open, if it still exists
  const placeKey = wsId ? `takeoff-place:${wsId}` : null;
  const [placeRestored, setPlaceRestored] = useState(false);
  useEffect(() => {
    if (!view || placeRestored || !placeKey || !ws.recoveryChecked) return;
    setPlaceRestored(true);
    // never ahead of the "unsaved changes found on this device" offer — that decision comes first
    if (placeRestoreSpent || !isReload() || ws.recovery?.offer) { placeRestoreSpent = true; return; }
    placeRestoreSpent = true;
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(placeKey) || "null"); } catch { saved = null; }
    if (!saved || !["walls", "aluminium", "schedule", "orders"].includes(saved.win)) return;
    if (saved.activeMaterial && !view.materials.some((x) => x.id === saved.activeMaterial)) return;
    if (saved.activeMaterial) setActiveMaterial(saved.activeMaterial);
    if (saved.openWall && view.measurements.some((x) => x.id === saved.openWall && !x.archived)) setOpenWall(saved.openWall);
    setWin(saved.win);
  }, [view, placeRestored, placeKey, ws.recovery, ws.recoveryChecked]);
  useEffect(() => {
    if (!placeKey || !placeRestored) return;
    try { sessionStorage.setItem(placeKey, JSON.stringify({ win, activeMaterial, openWall })); } catch { /* private mode: nothing kept */ }
  }, [placeKey, placeRestored, win, activeMaterial, openWall]);
  useEffect(() => { let stop = false; api.presets().then((r) => { if (!stop && r.ok) setPresets(r.data.presets || []); }); return () => { stop = true; }; }, [api]);

  const needsPdf = ["setup", "pages", "calibrate", "measure"].includes(win);
  // the tool to come back to belongs to one trip out of Measure (scale / page) and back
  useEffect(() => { if (!["measure", "calibrate", "pages"].includes(win)) setMeasureTool(null); }, [win]);
  // once opened, keep the plan loaded while in this takeoff — switching material / editing a flashing must not
  // re-download and re-parse the whole PDF on a phone (R04b R22)
  const [keepPlan, setKeepPlan] = useState(false);
  useEffect(() => { if (needsPdf) setKeepPlan(true); }, [needsPdf]);
  const planDoc = plans.find((p) => p.id === docId) || null;
  // HUB 021: an unchanged plan already opened on this device reopens from its device copy (no download)
  const plan = usePlanDocument(api, needsPdf || keepPlan ? docId : null, planDoc);
  // … and opens on the page this device was last on; a page beyond a replaced plan's end falls back to the first
  useEffect(() => { if (plan.status === "ready" && pageIndex >= plan.numPages) setPageIndex(0); }, [plan.status, plan.numPages, pageIndex]);
  useEffect(() => {
    if (!docId || !view?.workspace?.id) return;
    try { localStorage.setItem(`takeoff-plan-page:${view.workspace.id}`, JSON.stringify({ docId, contentSha256: planDoc?.contentSha256 || null, pageIndex })); } catch { /* private mode */ }
  }, [docId, pageIndex, planDoc?.contentSha256, view?.workspace?.id]);
  const pageCals = useMemo(() => (view ? latestPageCalibrations(view.calibrations, docId, pageIndex) : []), [view, docId, pageIndex]);
  const pageScale = !pageCals.length ? "Not scaled" : pageCals.every((c) => c.status === "ready") ? "Ready" : "Needs review";

  if (ws.loadState.loading || ws.loadState.error) {
    return <div className="p-3"><AsyncState loading={ws.loadState.loading} error={ws.loadState.error} code={ws.loadState.code} onRetry={ws.refreshServer} /></div>;
  }

  const contribCount = (mid) => view.contributions.filter((c) => c.jobMaterialId === mid).length;
  const linesFor = (mid) => (ws.computed?.scheduleLines || []).filter((l) => l.jobMaterialIds.includes(mid));
  const secMats = view.materials.filter((m) => materialSection(m) === section);
  const startMeasuring = () => {
    if (secMats.length) setWin("measure");
    else if (section === SECTIONS.FLASHINGS) setWin("pick");
    else setNotice({ tone: "info", text: "Add a timber or cladding item first, then measure it on the plan." });
  };
  const removeMaterial = (m) => {
    if (!window.confirm(`Remove ${m.name} and its measurements from this takeoff?`)) return;
    // measurements used ONLY by this material go with it (none are left orphaned on the plan)
    const mine = view.contributions.filter((c) => c.jobMaterialId === m.id).map((c) => c.measurementId);
    const shared = new Set(view.contributions.filter((c) => c.jobMaterialId !== m.id).map((c) => c.measurementId));
    // wall-owned openings belong to their wall (and its cladding); recorded offcuts are physical stock
    const byId = new Map(view.measurements.map((x) => [x.id, x]));
    ws.edit(partial({ archive: { materials: [m.id], measurements: mine.filter((id) => !shared.has(id) && !byId.get(id)?.parentId && byId.get(id)?.kind !== "offcut") } }));
    dropDraft(m.id); // HUB 018: a removed flashing's unfinished drawing goes with it
  };
  /** HUB 002: a compact row — name and one summary line; its actions show when the row is tapped, Remove sits in More. */
  const materialRow = (m) => {
    const std = m.fromPresetId ? presets.find((p) => p.id === m.fromPresetId) : null;
    const ls = linesFor(m.id);
    const fam = m.spec?.family && m.spec.family !== "flashing" ? m.spec.family : null;
    const open = (openRow ?? (secMats.length === 1 ? m.id : null)) === m.id;
    const summary = fam ? `${describeFamilySpec(m.spec).line} · ${contribCount(m.id)} item(s)${m.pending ? " · unsaved" : ""}`
      : `${[m.spec?.finish, m.spec?.colour, m.spec?.bmt != null ? `${m.spec.bmt} BMT` : null].filter(Boolean).join(" · ")}${m.profile ? ` · girth ${fmtMm(indicativeGirthMm(m.profile))} mm` : ""} · ${contribCount(m.id)} item(s) · ${ls.reduce((a, l) => a + l.quantity, 0)} pcs${m.pending ? " · unsaved" : ""}`;
    const more = [
      ...(caps.editStandards && api.savePreset ? [["Save as standard", () => { setMoreFor(null); saveAsStandard(m); }]] : []),
      ...(caps.edit ? [["Remove", () => { setMoreFor(null); removeMaterial(m); }]] : []),
    ];
    return (
      <li key={m.id} className="py-1" data-material-row={m.id}>
        <button type="button" onClick={() => { setMoreFor(null); setOpenRow(open ? "" : m.id); }} aria-expanded={open}
          className="flex min-h-[48px] w-full items-center gap-2 text-left">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">{m.name}</span>
            <span className="block truncate text-[11px] text-muted">{summary}</span>
          </span>
          <span className="text-xs text-muted" aria-hidden="true">{open ? "▾" : "▸"}</span>
        </button>
        {open && (
          <div className="flex flex-wrap items-center gap-1 pb-1" data-material-actions="">
            {(m.profile || m.methodKey === "flashing_runs") && <Btn kind="ghost" onClick={() => setEditing({ material: m, stage: "profile" })}>{caps.edit ? "Profile" : "View profile"}</Btn>}
            {caps.edit && <Btn kind="ghost" onClick={() => setEditing({ material: m, stage: fam ? "family" : "details" })}>{fam ? "Setup" : "Details"}</Btn>}
            {usesWalls(m) && <Btn kind="ghost" onClick={() => { setActiveMaterial(m.id); setOpenWall(null); setWin("walls"); }}>Walls</Btn>}
            {fam === "aluminium" && <Btn kind="ghost" onClick={() => { setActiveMaterial(m.id); setWin("aluminium"); }}>Cutting</Btn>}
            {caps.edit && (!fam || fam === "timber") && <Btn kind="ghost" onClick={() => setManualFor(manualFor === m.id ? null : m.id)}>Add lengths</Btn>}
            {more.length > 0 && <Btn kind="ghost" aria-expanded={moreFor === m.id} onClick={() => setMoreFor(moreFor === m.id ? null : m.id)}>More</Btn>}
            {moreFor === m.id && (
              <div className="flex w-full flex-wrap gap-1 rounded-lg bg-page p-1" data-material-more="">
                {more.map(([label, fn]) => <Btn key={label} kind={label === "Remove" ? "danger" : "secondary"} onClick={fn}>{label}</Btn>)}
              </div>
            )}
          </div>
        )}
        {/* HUB 024: an aluminium copy that already holds that version (e.g. the one this job just saved) has nothing to update */}
        {std && std.revision > (m.fromPresetRevision || 0) && (fam !== "aluminium" || companyVersionDiffers(m, std)) && caps.edit && (
          <Banner tone="info" action={fam ? <Btn onClick={() => setReviewUpdate(m.id)}>Review update</Btn>
            : <Btn onClick={() => ws.edit(partial({ materials: [{ ...m, fromPreset: { presetId: std.id, revision: std.revision }, name: std.name, spec: std.spec, rules: std.rules, profile: std.profile }] }))}>Update this job&apos;s copy</Btn>}>
            The company standard was updated (rev {std.revision}). This job still uses rev {m.fromPresetRevision}.
          </Banner>
        )}
        {manualFor === m.id && (() => {
          const manual = view.contributions.filter((c) => c.jobMaterialId === m.id).map((c) => ({ c, meas: view.measurements.find((x) => x.id === c.measurementId) })).filter((x) => x.meas?.kind === "manual");
          return manual.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-page p-2 text-sm">
              {manual.map(({ c, meas }) => (
                <li key={meas.id} className="flex items-center gap-2">
                  <span className="flex-1">{meas.quantity} × {fmtMm(meas.finishedLengthMm)} mm{meas.pending ? " · unsaved" : ""}</span>
                  <Btn kind="ghost" onClick={() => ws.edit(partial({ archive: { measurements: [meas.id], contributions: [c.id] } }))}>Remove</Btn>
                        </li>
                      ))}
                    </ul>
                  );
                })()}
                {manualFor === m.id && <ManualLengths timber={fam === "timber"} onAdd={(len, qty) => {
                  const mid = newId();
                  ws.edit(partial({ measurements: [{ id: mid, kind: "manual", finishedLengthMm: len, quantity: qty }], contributions: [{ id: newId(), measurementId: mid, jobMaterialId: m.id }] }));
                }} />}
      </li>
    );
  };
  /**
   * HUB 012: what this flashing actually orders — each finished length × quantity, where it came from (plan / entered)
   * and whether it is ready. Tapping a plan-derived length opens the plan with its runs selected.
   */
  const FlashingLengths = ({ m }) => {
    const ls = linesFor(m.id).filter((l) => !l.generic);
    if (!ls.length) return <p className="mb-3 rounded-lg bg-page px-3 py-2 text-sm text-muted" data-flashing-lengths="">No lengths yet — measure runs on the plan or add lengths.</p>;
    const byContribution = new Map((ws.computed?.contributions || []).map((c) => [c.contributionId, c]));
    const measById = new Map(view.measurements.map((x) => [x.id, x]));
    return (
      <section className="mb-3 rounded-card border border-hairline bg-white" data-flashing-lengths="">
        <h2 className="border-b border-hairline px-3 py-2 text-sm font-semibold text-ink">Lengths · {ls.reduce((a, l) => a + l.quantity, 0)} pieces · {fmtLm(ls.reduce((a, l) => a + l.finishedLengthMm * l.quantity, 0) / 1000)} LM</h2>
        <ul className="divide-y divide-hairline">
          {[...ls].sort((a, b) => b.finishedLengthMm - a.finishedLengthMm).map((l) => {
            const srcIds = l.contributionIds.map((cid) => byContribution.get(cid)?.measurementId).filter(Boolean);
            const kinds = new Set(srcIds.map((id) => measById.get(id)?.kind));
            const fromPlan = kinds.has("run") || kinds.has("polyline") || kinds.has("count");
            const source = [fromPlan ? "plan" : null, kinds.has("manual") ? "entered" : null].filter(Boolean).join(" + ");
            const open = fromPlan ? () => { setActiveMaterial(m.id); setEditing(null); setHighlightIds(srcIds.filter((id) => measById.get(id)?.documentId)); setWin("measure"); } : null;
            return (
              <li key={l.bucketKey}>
                <button type="button" disabled={!open} onClick={open || undefined} className="flex min-h-[44px] w-full items-center gap-2 px-3 text-left text-sm disabled:cursor-default">
                  <span className="flex-1 font-medium text-ink">{fmtMm(l.finishedLengthMm)} mm</span>
                  <span className="text-ink">× {l.quantity}</span>
                  <span className="w-24 text-right text-[11px] text-muted">{source}</span>
                  {l.problems.length > 0 && <span className="rounded-full bg-amber-50 px-2 text-[11px] font-semibold text-amber-900">needs attention</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    );
  };

  const actorKey = ws.server?.capabilities?.actorKey || null;
  const matRec = (m) => ({ id: m.id, name: m.name, methodKey: m.methodKey, methodVersion: m.methodVersion || 1, spec: m.spec, rules: m.rules || {}, profile: m.profile || null, fromPresetId: m.fromPresetId || null, fromPresetRevision: m.fromPresetRevision || null });
  /** Job copies auto-apply: upsert straight into the takeoff (autosave + device recovery). */
  function upsertMaterial(m) {
    ws.edit(partial({ materials: [matRec(m)] }));
    setActiveMaterial(m.id);
  }
  const currentMat = (m) => view.materials.find((x) => x.id === m.id) || m;
  const newFlashing = () => ({ id: newId(), name: `Flashing ${view.materials.filter((x) => x.methodKey === "flashing_runs").length + 1}`, methodKey: "flashing_runs", methodVersion: 1, spec: { ...FLASHING_SPEC_DEFAULTS }, rules: { ...NEW_FLASHING_RULES }, profile: null });
  // TC-R04 families: create the job material at once (auto-apply), then open its setup card
  const addFamily = (spec, name, rules = {}) => {
    const mm = methodFor(spec);
    const m = { id: newId(), name, methodKey: mm.key, methodVersion: mm.version, spec, rules, profile: null };
    upsertMaterial(m);
    setOpenRow(m.id);
    setEditing({ material: m, stage: "family" });
  };
  const addTimber = () => addFamily({ family: "timber", purpose: "rafters", section: {}, stock: { ...TIMBER_GRID } }, "Timber", { centresMm: 600, lengthSource: "projected" });
  const addCladding = () => addFamily({ family: "cladding", layout: "sheet", product: {} }, "Cladding");
  const addAluminium = () => addFamily(aluminiumPreset(), "Aluminium angle 50 × 50 × 3");
  const isPainted = (m) => { try { return normaliseSpec(m?.spec).colourApplicable !== false; } catch { return true; } };

  function useStandard(p) {
    const id = newId();
    ws.edit(partial({ materials: [{ id, fromPreset: { presetId: p.id, revision: p.revision }, name: p.name, methodKey: p.methodKey, methodVersion: p.methodVersion, spec: p.spec, rules: p.rules, profile: p.profile, fromPresetId: p.id, fromPresetRevision: p.revision }] }));
    setActiveMaterial(id);
    setOpenRow(id);
    setWin(docId ? "measure" : "overview");
  }

  async function saveAsStandard(m) {
    // generic families go through the catalogue editor (Product / Ordering / Installation) — never posted raw,
    // so job-only facts, open flags and drafts don't leak into company data
    if (m.spec?.family) { setCatalogue({ preset: null, value: { name: m.name, methodKey: m.methodKey, methodVersion: m.methodVersion, spec: m.spec, rules: m.rules } }); return; }
    const same = presets.find((p) => p.name.trim().toLowerCase() === m.name.trim().toLowerCase());
    let body = { content: { name: m.name, methodKey: m.methodKey, methodVersion: m.methodVersion, spec: m.spec, rules: m.rules, profile: m.profile } };
    if (same) {
      if (!window.confirm(`A company standard called “${same.name}” already exists. OK = save this as its new revision. Cancel = keep the existing standard.`)) return;
      body = { ...body, presetId: same.id, expectedRevision: same.revision };
    }
    const r = await api.savePreset(body);
    if (r.ok) { const p = await api.presets(); if (p.ok) setPresets(p.data.presets || []); setNotice({ tone: "ok", text: `Saved “${m.name}” as a company standard. This job keeps its own copy.` }); }
    else setNotice({ tone: "error", text: r.error });
  }

  /** HUB 014: save this material's routine choices as its product's company default — only when asked, after a confirm. */
  async function saveCompanyDefault(m) {
    const label = m.spec?.product?.name || m.name;
    if (!window.confirm(`Save these as the Blue Leaf default for ${label}? New takeoffs will use them; jobs already set up keep their own.`)) return null;
    const existing = findCompanyDefault(presets, m.spec);
    const content = companyDefaultContent(m);
    const r = await api.saveCompanyDefault(existing ? { presetId: existing.id, expectedRevision: existing.revision, content } : { content });
    if (!r.ok) return { tone: "error", text: r.status === 409 ? "The company default was changed by someone else — close and reopen, then save again." : r.error };
    const x = await api.presets(); if (x.ok) setPresets(x.data.presets || []);
    const cur = currentMat(m);
    upsertMaterial({ ...cur, rules: { ...(cur.rules || {}), defaultsFrom: { presetId: r.data.preset?.presetId || existing?.id || null, revision: r.data.preset?.revision ?? null, productId: m.spec.product.id } } });
    return { tone: "ok", text: `Saved as the company default for ${label}. New takeoffs will use it; jobs already set up keep their own.` };
  }

  /**
   * HUB 024: add this job's aluminium setup (its settings, under a name that starts as the job item's) to the company
   * products. The job material is not changed or linked: it keeps its own copy and autosave carries on as before. The
   * kerf value goes with it; "confirmed for this job" does not (the server clears it, so each job still confirms its
   * kerf). Other jobs find a product by name, so a name never ends up holding a different angle: a same-named product
   * gets a new version only for the same profile; a different size is asked for its own name. The company list is
   * read fresh first (another office login may have saved since this takeoff opened), and again after a refusal.
   */
  async function addToCompanyProducts(m) {
    const cur = currentMat(m);
    const size = profileSizeText(cur.spec);
    if (!size) return { tone: "error", text: "Enter the profile size (e.g. 50 × 50 × 3) first. Nothing was saved." };
    const reload = async () => { const x = await api.presets(); if (x.ok) { setPresets(x.data.presets || []); return x.data.presets || []; } return null; };
    let name = window.prompt("Add this setup to company products? Other jobs find it by this name. This job keeps its own copy.", String(cur.name || "").trim());
    if (name == null) return null;
    const list = (await reload()) || presets;
    let same = null;
    for (;;) {
      name = String(name).trim();
      if (!name) return { tone: "error", text: "Give the company product a name. Nothing was saved." };
      same = findAluminiumProduct(list, name);
      if (!same || sameAluminiumProfile(same.spec, cur.spec)) break;
      // that name already belongs to another size: never save this angle under it
      const suggest = `Aluminium angle ${size}`;
      const taken = findAluminiumProduct(list, suggest);
      name = window.prompt(`“${same.name}” is already the company product for a ${profileSizeText(same.spec) || "different"} angle. This setup is ${size}, so give it its own name.`,
        taken && !sameAluminiumProfile(taken.spec, cur.spec) ? name : suggest);
      if (name == null) return null;
    }
    if (same && !window.confirm(`A company product called “${same.name}” already exists. OK = save this as its new version. Cancel = keep the existing one.`)) return null;
    const r = await api.saveCompanyProduct({ name, methodKey: cur.methodKey, methodVersion: cur.methodVersion || 1, spec: cur.spec, rules: cur.rules || {},
      ...(same ? { presetId: same.id, expectedRevision: same.revision } : {}) });
    if (!r.ok) {
      if (r.status !== 409) return { tone: "error", text: r.error };
      await reload(); // the next tap saves over the version just saved by someone else
      return { tone: "error", text: "Someone else saved that company product just now. Nothing was saved. Tap Add to company products again to save yours as its new version." };
    }
    await reload();
    return { tone: "ok", text: same ? `Saved a new version of “${name}”. This job and jobs already using it keep their own copy.`
      : `Added “${name}” to company products. Other jobs can use it; this job keeps its own copy.` };
  }

  const leaveEditor = (how) => {
    const m = editing?.material;
    // HUB 018: a brand-new flashing closed with no shape is not kept — never a blank flashing in the takeoff
    if (editing?.isNew && how?.empty && m && view.materials.some((x) => x.id === m.id)) ws.edit(partial({ archive: { materials: [m.id] } }));
    if (m?.id && editing?.stage === "profile") setEditorDrafts((ds) => ds.filter((d) => d.materialId !== m.id));
    setEditing(null); setWin(setupFrom || "overview"); setSetupFrom(null); refreshDrafts();
  };
  /**
   * HUB 010: an order line's problem opens its fix — the flashing's details at the missing field, its drawing, the
   * material setup, or the run itself on the plan (over the maximum → split it). Close returns to the same order line.
   */
  function fixFromOrder({ orderId, bucketKey, materialId, problems }) {
    const m = view.materials.find((x) => x.id === materialId);
    if (!m) return;
    setOrderFocus({ orderId, bucketKey, materialId });
    const runIssue = problems.find((p) => ["ceiling_exceeded", "split_stale", "split_invalid", "calibration_missing", "calibration_not_ready", "calibration_superseded", "plan_superseded", "outside_region", "path_in_progress"].includes(p));
    const fam = m.spec?.family && m.spec.family !== "flashing";
    if (runIssue && !fam) {
      const line = (ws.computed?.scheduleLines || []).find((l) => l.bucketKey === bucketKey);
      const byContrib = new Map((ws.computed?.contributions || []).map((c) => [c.contributionId, c.measurementId]));
      const ids = [...new Set((line?.contributionIds || []).map((c) => byContrib.get(c)).filter(Boolean))];
      const onPlan = view.measurements.find((x) => ids.includes(x.id) && x.documentId && x.points?.length);
      if (onPlan) {
        setActiveMaterial(m.id); setDocId(onPlan.documentId); setPageIndex(onPlan.pageIndex ?? 0);
        setHighlightIds(ids); setWin("measure");
        return;
      }
    }
    setSetupFrom("orders");
    if (fam) { setEditing({ material: m, stage: "family" }); return; }
    if (problems.includes("profile_invalid") && !problems.includes("material_incomplete")) { setEditing({ material: m, stage: "profile" }); return; }
    let focusField = null, reason = "check its details";
    if (problems.includes("perforation_incomplete")) { focusField = "perforation"; reason = "the perforation isn't specified"; }
    if (problems.includes("material_incomplete")) {
      let n = null; try { n = normaliseSpec(m.spec); } catch { n = null; }
      const fin = !n?.finishId || !n.finish || /^other( \/ custom)?$/i.test(n.finish.trim());
      focusField = fin ? "finish" : n.bmt == null ? "bmt" : n.colourApplicable == null ? "painted" : n.colourApplicable && !n.colour ? "colour" : "finish";
      reason = { finish: "choose the material / finish", bmt: "choose the thickness (BMT)", painted: "say whether it is painted", colour: "choose the colour" }[focusField];
    }
    setEditing({ material: m, stage: "details", focusField, fromOrder: reason });
  }
  const toLengths = (m) => {
    setActiveMaterial(m.id); setEditing(null);
    setWin(m.spec?.family === "aluminium" ? "aluminium" : usesWalls(m) ? "walls" : docId ? "measure" : "overview");
    setEditorDrafts((ds) => ds.filter((d) => d.materialId !== m.id)); refreshDrafts();
  };
  /** The editor's status for THIS flashing: Saved only when the server holds exactly this shape (R04b R20). */
  const materialSync = (m, shownProfile) => {
    if (ws.status === "rejected" || ws.status === "conflict" || ws.status === "error") return ws.status;
    const onServer = ws.server?.snapshot?.materials?.find((x) => x.id === m.id);
    if (!onServer) return ws.status === "saving" ? "saving" : "unsynced";
    if (shownProfile !== undefined && JSON.stringify(onServer.profile ?? null) !== JSON.stringify(shownProfile ?? null)) return ws.status === "saving" ? "saving" : "unsynced";
    return ws.status === "saving" ? "saving" : ws.dirty ? "unsynced" : "saved";
  };

  // ── focused windows ─────────────────────────────────────────────────────────
  if (editing?.stage === "profile" || win === "profile") {
    const m = editing?.material;
    const std = !!editing?.isStandard;
    const cur = std ? m : currentMat(m);
    // Portal like FocusedWindow so the editor covers the AppShell's floating buttons.
    // key = the flashing id ONLY: saves / server revisions never remount the editor (focus, keyboard, history kept).
    return createPortal(
      <><FocusMode /><ProfileEditor key={`${std ? "std" : "job"}:${m?.id}`} value={cur?.profile || null} title={cur?.name || "Flashing"} readOnly={std ? !caps.editStandards : !caps.edit}
        mode={std ? "standard" : "job"} painted={isPainted(cur)} syncStatus={std ? null : materialSync(m, currentMat(m).profile)}
        draftScope={actorKey && m?.id ? { actorKey, workspaceId: std ? "standards" : wsId, materialId: m.id, meta: { name: cur?.name || null, isNew: !!editing?.isNew } } : null}
        isNew={!!editing?.isNew}
        onClose={leaveEditor}
        // HUB 018: a brand-new flashing undone / cleared to nothing writes nothing (no blank flashing); an existing one saves as cleared
        onChange={(profile) => { if (profile) upsertMaterial({ ...currentMat(m), profile }); else if (!editing?.isNew && view.materials.some((x) => x.id === m.id)) upsertMaterial({ ...currentMat(m), profile: null }); }}
        onDetails={() => { setEditing({ material: currentMat(m), stage: "details" }); setEditorDrafts((ds) => ds.filter((d) => d.materialId !== m.id)); refreshDrafts(); }}
        onSaveAsStandard={!std && caps.editStandards && api.savePreset ? () => saveAsStandard(currentMat(m)) : null}
        onLengths={() => toLengths(m)}
        onSave={(profile) => {
          api.savePreset({ presetId: m.id, expectedRevision: m.revision, content: { ...m, profile } }).then(async (r) => {
            setNotice(r.ok ? { tone: "ok", text: `Saved a new revision of “${m.name}”. Jobs keep their own copies until you update them.` } : { tone: "error", text: r.error });
            const x = await api.presets(); if (x.ok) setPresets(x.data.presets || []);
            setEditing(null); setWin("pick");
          });
        }} /></>,
      document.body,
    );
  }
  if (catalogue) {
    return (
      <FocusedWindow title={catalogue.preset ? `Company product — ${catalogue.preset.name}` : "New company product"} onClose={() => setCatalogue(null)} closeLabel="Cancel">
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <CatalogueEditor value={catalogue.value} canEditStandards={caps.editStandards}
            onChange={(v) => setCatalogue((c) => ({ ...c, value: v }))} onCancel={() => setCatalogue(null)}
            onSave={async (content) => {
              const r = await api.savePreset(catalogue.preset ? { presetId: catalogue.preset.id, expectedRevision: catalogue.preset.revision, content } : { content });
              if (!r.ok) { setNotice({ tone: "error", text: r.error }); return; }
              const x = await api.presets(); if (x.ok) setPresets(x.data.presets || []);
              setNotice({ tone: "ok", text: `Saved “${content.name}” to the company catalogue. Jobs keep their own copies until you update them.` });
              setCatalogue(null);
            }} />
        </div>
      </FocusedWindow>
    );
  }
  if (reviewUpdate) {
    const m = view.materials.find((x) => x.id === reviewUpdate);
    const std = m && presets.find((p) => p.id === m.fromPresetId);
    if (m && std) {
      const close = () => setReviewUpdate(null);
      return (
        <FocusedWindow title="Company product updated" subtitle={m.name} onClose={close} closeLabel="Back">
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <PresetUpdateReview material={m} preset={std} snapshot={view} onUpdate={(rec) => { ws.edit(partial({ materials: [rec] })); close(); }} onKeep={close} />
          </div>
        </FocusedWindow>
      );
    }
  }
  if (editing?.stage === "family") {
    const m = currentMat(editing.material);
    const fam = m.spec?.family;
    const Setup = fam === "timber" ? TimberSetup : fam === "aluminium" ? AluminiumSetup : CladdingSetup;
    const title = fam === "timber" ? "Timber" : fam === "aluminium" ? "Aluminium" : fam === "batten" ? "Support battens" : fam === "accessory" ? "Accessories" : "Cladding";
    const families = fam === "timber" ? ["timber"] : fam === "aluminium" ? ["aluminium"] : ["cladding", "aac", "foam", "timber-cladding", "batten", "accessory"];
    return (
      // the next step sits in the header: a field saving on blur can reflow the card, never move this button
      <FocusedWindow title={title} subtitle={`${m.name} · this job only`} onClose={leaveEditor} closeLabel="Close"
        actions={<><SaveChip status={ws.status} /><Btn kind="primary" onClick={() => toLengths(m)}>{fam === "timber" ? "Measure members" : fam === "aluminium" ? "Openings & cutting" : "Walls"}</Btn></>}>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {/* HUB 025: the aluminium setup explains its save chip (a Conflict names the edit and offers both choices here) */}
          {fam === "aluminium" && <SaveProblem ws={ws} className="mb-3" />}
          {caps.edit && (
            <div className="mb-3">
              <FamilyPresetPicker api={api} families={families} canEditStandards={caps.editStandards} reloadToken={presets}
                // a company product is COPIED onto this job material (same id: its measurements stay attached)
                onUse={(rec) => { const next = { ...rec, id: m.id }; ws.edit(partial({ materials: [next] })); setEditing({ material: next, stage: "family" }); }}
                onEdit={(pr) => setCatalogue({ preset: pr, value: pr })}
                onNew={(f) => setCatalogue({ preset: null, value: { spec: { family: f } } })}
                onAdd={fam === "aluminium" && caps.addCompanyProducts && api.saveCompanyProduct ? () => addToCompanyProducts(m) : undefined} />
            </div>
          )}
          <Setup key={m.id} value={m} result={ws.computed?.materialResults?.[m.id]} lines={linesFor(m.id)}
            {...(Setup === CladdingSetup ? { presets, onSaveCompanyDefault: caps.saveCompanyDefaults && api.saveCompanyDefault ? saveCompanyDefault : null } : Setup === TimberSetup ? { presets } : {})}
            onChange={(next) => upsertMaterial({ ...currentMat(m), name: next.name, spec: next.spec, rules: next.rules, methodKey: next.methodKey, methodVersion: next.methodVersion })} />
        </div>
      </FocusedWindow>
    );
  }
  if (editing) {
    const std = !!editing.isStandard;
    const m = std ? editing.material : currentMat(editing.material);
    return (
      <FocusedWindow title={std ? editing.material.name : "Flashing details"} subtitle={std ? "Company standard" : `${m.name} · this job only`} onClose={leaveEditor} closeLabel={std ? "Cancel" : "Close"}
        actions={!std && m.methodKey === "flashing_runs" ? <SaveChip status={ws.status} /> : null}>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {editing.fromOrder && <div className="mb-3"><Banner tone="warn">Fix this to clear the order warning — {editing.fromOrder}. Close takes you back to the order.</Banner></div>}
          {!std && <FlashingLengths m={m} />}
          <MaterialSheet key={m.id} value={m} view={view} mode={std ? "standard" : "job"} canEditSourceReview={caps.editStandards} focusField={editing.focusField || null}
            onChange={(next) => upsertMaterial({ ...currentMat(m), name: next.name, spec: next.spec, rules: next.rules })}
            onCancel={leaveEditor}
            onSave={async (x) => {
              const r = await api.savePreset({ presetId: x.id, expectedRevision: x.revision, content: { ...x } });
              if (!r.ok) { setNotice({ tone: "error", text: r.error }); setEditing(null); setWin("pick"); return; }
              const p = await api.presets(); if (p.ok) setPresets(p.data.presets || []);
              setEditing(null); setWin("pick");
            }} />
          {!std && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {m.methodKey === "flashing_runs" && <Btn onClick={() => setEditing({ material: m, stage: "profile" })}>Drawing</Btn>}
              <Btn kind="primary" className={m.methodKey === "flashing_runs" ? "" : "col-span-2"} onClick={() => toLengths(m)}>Lengths</Btn>
            </div>
          )}
        </div>
      </FocusedWindow>
    );
  }
  if (win === "pick") {
    return (
      <FocusedWindow title="Choose flashing" onClose={() => setWin("overview")} closeLabel="Back">
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <MaterialPicker api={api} canEditStandards={caps.editStandards}
            onUseStandard={useStandard}
            onDrawNew={() => setEditing({ material: newFlashing(), isNew: true, stage: "profile" })}
            onPiecesOnly={() => { const m = { id: newId(), name: "Finished pieces", methodKey: "finished_piece_count", methodVersion: 1, spec: { ...FLASHING_SPEC_DEFAULTS }, rules: { ...NEW_FLASHING_RULES }, profile: null }; upsertMaterial(m); setEditing({ material: m, stage: "details" }); }}
            onEditStandard={(p) => setEditing({ material: p, isStandard: true })}
            onEditStandardProfile={(p) => setEditing({ material: p, isStandard: true, stage: "profile" })}
            onRetireStandard={async (p) => {
              if (!window.confirm(`Retire “${p.name}”? Jobs that already use it keep their copies.`)) return;
              const r = await api.savePreset({ presetId: p.id, expectedRevision: p.revision, isActive: false });
              setNotice(r.ok ? { tone: "ok", text: `Retired “${p.name}”.` } : { tone: "error", text: r.error });
              const x = await api.presets(); if (x.ok) setPresets(x.data.presets || []);
            }}
            notice={notice} onDismissNotice={() => setNotice(null)} reloadToken={presets} />
        </div>
      </FocusedWindow>
    );
  }
  if (win === "setup") {
    return <PlanSetup plans={plans} planState={plan} selectedDocId={docId} onSelectDoc={(id) => { setDocId(id); setPageIndex(0); }} calibrations={view.calibrations}
      primary={{ documentId: primaryDoc, pageIndex: view.workspace.primaryPageIndex }} onClose={() => setWin("overview")} onExternalView={onExternalView}
      onChoosePage={(id, pi) => { setPageIndex(pi); if (caps.edit && planDoc?.status === "current") ws.edit(partial({ workspace: { primaryDocumentId: id, primaryPageIndex: pi } })); setWin("overview"); }} />;
  }
  if (win === "pages") {
    // HUB 023: the same page picker, for measuring on another page — tap a page to go straight back to Measure
    return <PlanSetup purpose="measure" plans={plans} planState={plan} selectedDocId={docId} onSelectDoc={(id) => { setDocId(id); setPageIndex(0); }} calibrations={view.calibrations}
      primary={{ documentId: primaryDoc, pageIndex: view.workspace.primaryPageIndex }} current={pageFrom ? { documentId: pageFrom.docId, pageIndex: pageFrom.pageIndex } : null}
      onExternalView={onExternalView}
      onClose={() => { if (pageFrom) { setDocId(pageFrom.docId); setPageIndex(pageFrom.pageIndex); } setWin("measure"); }}
      onChoosePage={(id, pi) => { setDocId(id); setPageIndex(pi); setWin("measure"); }} />;
  }
  if ((win === "calibrate" || win === "measure") && plan.status !== "ready") {
    return (
      <FocusedWindow title={planDoc?.title || "Plan"} onClose={() => setWin("overview")} closeLabel="Back">
        <div className="p-3">
          {plan.status === "loading" && (plan.progress
            ? <p className="text-sm text-muted" role="status">Downloading plan{plan.progress.total ? ` — ${Math.round((plan.progress.loaded / plan.progress.total) * 100)}%` : "…"} <Btn kind="ghost" onClick={plan.cancel}>Cancel</Btn></p>
            : <p className="text-sm text-muted" role="status">Opening plan…</p>)}
          {plan.status === "too_large" && <Banner tone="warn" action={onExternalView && <Btn onClick={() => onExternalView(docId)}>Open in device viewer</Btn>}>{plan.error}</Banner>}
          {(plan.status === "error" || plan.status === "cancelled") && <AsyncState error={plan.error} onRetry={plan.retry} />}
          {plan.status === "idle" && <Banner tone="info">Choose a plan first.</Banner>}
        </div>
      </FocusedWindow>
    );
  }
  if (win === "calibrate") {
    return <CalibrationScreen doc={plan.doc} documentId={docId} pageIndex={pageIndex} displayRotation={rotation} docTitle={planDoc?.title}
      existing={pageCals}
      onClose={() => setWin(scaleFrom === "measure" ? "measure" : "overview")}
      onSave={(rec, rot) => { setRotation(rot); ws.edit(partial({ calibrations: [rec] })); setWin("measure"); }} />;
  }
  if (win === "walls") {
    // the last wall's Review order › follows the overview's Review & export order: only once this section has lines
    const orderReady = (ws.computed?.scheduleLines || []).some((l) => (section === SECTIONS.FLASHINGS ? !l.generic : !!l.generic));
    return <WallsScreen ws={ws} materialId={activeMaterial} wallId={openWall} wallTab={openWallTab} onOpenWall={(id) => { setOpenWallTab(null); setOpenWall(id); }}
      onTrace={docId ? () => setWin("measure") : null} onSetup={(m) => { setSetupFrom("walls"); setEditing({ material: m, stage: "family" }); }} onClose={() => { setOpenWall(null); setWin("overview"); }}
      onReviewOrder={() => { setOpenWall(null); setOpenWallTab(null); setWin("orders"); }} orderReady={orderReady} />;
  }
  if (win === "aluminium") {
    return <AluminiumScreen ws={ws} materialId={activeMaterial} onSetup={(m) => { setSetupFrom("aluminium"); setEditing({ material: m, stage: "family" }); }}
      onMeasure={docId ? () => setWin("measure") : null} onClose={() => setWin("overview")} />;
  }
  if (win === "measure") {
    return <MeasureScreen ws={ws} doc={plan.doc} document={planDoc} pageIndex={pageIndex} displayRotation={rotation} materialId={activeMaterial}
      onChangeMaterial={() => { setHighlightIds(null); setWin("materials"); }}
      onScale={caps.edit ? (tool) => { setMeasureTool(tool || null); setScaleFrom("measure"); setWin("calibrate"); } : null}
      onPage={plans.length > 1 || plan.numPages > 1 ? (tool) => { setMeasureTool(tool || null); setHighlightIds(null); setPageFrom({ docId, pageIndex }); setWin("pages"); } : null}
      initialTool={measureTool}
      onOpenWall={(id) => {
        // wall-by-wall step 5: Select → Open elevation on a wall the material you are measuring with isn't on opens it
        // under its own material (a cladding first), so it has that material's wall-to-wall buttons — never an offer
        // to put the wrong cladding on it
        const on = view.contributions.filter((c) => c.measurementId === id && !c.archived).map((c) => view.materials.find((m) => m.id === c.jobMaterialId))
          .filter((m) => m && usesWalls(m) && materialSection(m) === section);
        if (on.length && !on.some((m) => m.id === activeMaterial)) setActiveMaterial((on.find((m) => CLADDING_FAMILIES.has(m.spec?.family)) || on[0]).id);
        setHighlightIds(null); setOpenWallTab(null); setOpenWall(id); setWin("walls");
      }}
      onReviewWalls={() => {
        // wall-by-wall step 5: the first wall of this material in run order; each wall page steps on from there
        const first = reviewWalls(view.measurements, view.contributions, activeMaterial)[0];
        if (!first) return;
        setHighlightIds(null); setOpenWallTab(null); setOpenWall(first.id); setWin("walls");
      }}
      highlightIds={highlightIds}
      onClose={() => { setHighlightIds(null); const m = view.materials.find((x) => x.id === activeMaterial); setWin(orderFocus ? "orders" : usesWalls(m) ? "walls" : m?.spec?.family === "aluminium" ? "aluminium" : "overview"); }} />;
  }
  if (win === "materials") {
    return (
      <FocusedWindow title="Measure with…" onClose={() => setWin("measure")} closeLabel="Back">
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {secMats.map((m) => (
            <button key={m.id} type="button" onClick={() => { setActiveMaterial(m.id); setWin("measure"); }} aria-pressed={m.id === activeMaterial}
              className={`flex min-h-[52px] w-full items-center rounded-card border px-3 text-left text-sm ${m.id === activeMaterial ? "border-primary bg-primary/5" : "border-hairline bg-white"}`}>{m.name}</button>
          ))}
          {caps.edit && (section === SECTIONS.FLASHINGS
            ? <Btn kind="primary" className="w-full" onClick={() => setWin("pick")}>Add flashing</Btn>
            : (
              <div className="grid grid-cols-3 gap-2">
                <Btn onClick={addTimber}>Add timber</Btn>
                <Btn onClick={addCladding}>Add cladding</Btn>
                <Btn onClick={addAluminium}>Add aluminium</Btn>
              </div>
            ))}
        </div>
      </FocusedWindow>
    );
  }
  if (win === "schedule") {
    return <FocusedWindow title="Length schedule" onClose={() => setWin("overview")} closeLabel="Back" actions={<SaveChip status={ws.status} />}><div className="min-h-0 flex-1 overflow-y-auto p-3"><ScheduleScreen ws={ws} api={api} section={section}
      onShowSource={({ materialId, measurementIds, tab = null }) => {
        // a wall (or its openings) opens the elevation; plan-traced lines open the plan with them selected
        setActiveMaterial(materialId);
        const ms = view.measurements.filter((x) => measurementIds.includes(x.id));
        const wall = ms.find((x) => x.kind === "wall") || view.measurements.find((x) => x.id === ms.find((y) => y.kind === "opening")?.parentId);
        if (wall && !ms.some((x) => x.documentId && x.kind !== "wall")) { setOpenWallTab(tab); setOpenWall(wall.id); setWin("walls"); }
        else {
          const onPlan = ms.find((x) => x.documentId && x.points?.length);
          if (onPlan) { setDocId(onPlan.documentId); setPageIndex(onPlan.pageIndex ?? 0); }
          setHighlightIds(measurementIds); setWin("measure");
        }
      }} /></div></FocusedWindow>;
  }
  if (win === "rescale") {
    return <FocusedWindow title="Review with new scale" onClose={() => setWin("overview")} closeLabel="Back"><div className="min-h-0 flex-1 overflow-y-auto p-3"><RescaleReview ws={ws} onDone={() => setWin("overview")} /></div></FocusedWindow>;
  }
  if (win === "orders") {
    return <FocusedWindow title="Orders" onClose={() => setWin("overview")} closeLabel="Back"><div className="min-h-0 flex-1 overflow-y-auto p-3"><OrdersScreen api={api} ws={ws} section={section} jobAddress={ws.server?.jobAddress}
      onFix={fixFromOrder} focus={orderFocus} onFocusDone={() => setOrderFocus(null)}
      deviceDrafts={draftCards.map((c) => ({ name: c.name || "A new flashing", invalid: c.reason === "invalid" ? 1 : 0 }))} /></div></FocusedWindow>;
  }

  // ── overview ────────────────────────────────────────────────────────────────
  const offer = ws.recovery.offer;
  // HUB 002: this section's lines only — flashing lengths, or timber / cladding purchase lines
  const lines = (ws.computed?.scheduleLines || []).filter((l) => (section === SECTIONS.FLASHINGS ? !l.generic : !!l.generic));
  return (
    <div className="mx-auto max-w-3xl space-y-3 p-3 pb-28">
      <div className="flex flex-wrap items-center gap-2">
        {onBack && <Btn kind="ghost" onClick={onBack}>‹ Back</Btn>}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold text-ink">{SECTION_LABEL[section]}</h1>
          <p className="truncate text-xs text-muted">{[ws.server?.jobLabel, view.workspace.name !== "Takeoff" ? view.workspace.name : null].filter(Boolean).join(" · ")}</p>
        </div>
        <SaveChip status={ws.status} />
      </div>
      {/* HUB 002: one takeoff, two sections — switching keeps every saved quantity and unfinished drawing */}
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="Takeoff section">
        {SECTION_VALUES_ORDER.map((sec) => (
          <button key={sec} type="button" aria-pressed={sec === section} onClick={() => { setOpenRow(null); setMoreFor(null); onSection(sec); }}
            className={`min-h-[44px] rounded-md px-2 text-sm font-medium ${sec === section ? "bg-white text-primary shadow-sm" : "text-muted"}`}>{SECTION_LABEL[sec]}</button>
        ))}
      </div>

      {notice && <Banner tone={notice.tone} action={<Btn kind="ghost" onClick={() => setNotice(null)}>Dismiss</Btn>}>{notice.text}</Banner>}
      {caps.isPreview && <Banner tone="info">Preview — read-only. You can look, but nothing can be changed as this worker.</Banner>}
      {!caps.edit && !caps.isPreview && <Banner tone="info">You can view this takeoff but not change it.</Banner>}
      {offer && (
        <Banner tone="warn" action={<div className="flex gap-2"><Btn onClick={ws.discardRecovery}>Discard</Btn><Btn kind="primary" onClick={ws.restoreRecovery}>Restore</Btn></div>}>
          Unsaved changes from {new Date(offer.savedAt).toLocaleString("en-AU")} were found on this device{offer.sameBase ? "." : " — made on an older version; you'll choose how to apply them."}
        </Banner>
      )}
      {!ws.recovery.available && <Banner tone="warn">Recovery unavailable on this device (storage blocked or full). Your edits are kept while this screen stays open.</Banner>}
      {ws.status === "conflict" && (
        <Banner tone="error" action={<div className="flex flex-wrap gap-2"><Btn onClick={ws.reloadFromServer}>Discard mine and load latest</Btn><Btn kind="primary" onClick={ws.applyMineOnLatest}>Apply my changes to latest</Btn></div>}>
          {ws.saveError || "Someone else saved this takeoff first."} Your unsaved changes: {nameChanges(ws.pending, ws.view, ws.server?.snapshot).join("; ") || "none"}.
        </Banner>
      )}
      {ws.status === "error" && <Banner tone="error" action={<Btn onClick={ws.retry}>Try again</Btn>}>{ws.saveError}</Banner>}
      {ws.rejected && (
        <Banner tone="error" action={<div className="flex gap-1"><Btn onClick={ws.retryRejected}>Try again</Btn><Btn kind="ghost" onClick={ws.discardRejected}>Discard</Btn></div>}>
          Not saved: {ws.rejected.error} ({describeChanges(ws.rejected.changes).join("; ")}). It&apos;s kept on this device; your other edits keep saving.
        </Banner>
      )}
      {ws.status === "unsynced" && ws.saveError && <Banner tone="warn">{ws.saveError}</Banner>}
      {caps.edit && section === SECTIONS.FLASHINGS && draftCards.map((c) => {
        const m = view.materials.find((x) => x.id === c.materialId);
        return (
          <div key={c.key} data-draft-card={c.reason}><Banner tone="info" action={<div className="flex gap-1">
            <Btn onClick={() => setEditing({ material: m || materialForDraft(c.record, newFlashing()), isNew: !m, stage: "profile" })}>Continue drawing</Btn>
            <Btn kind="ghost" onClick={() => { if (window.confirm("Discard this unfinished drawing from this device?")) dropDraft(c.materialId); }}>Discard</Btn>
          </div>}>
            Unfinished drawing on this device: <span className="font-semibold">{c.name || "a new flashing"}</span>{draftCardText(c)}
          </Banner></div>
        );
      })}
      {(() => { const n = rescaleCandidates(view).length; return n > 0 && (
        <Banner tone="warn" action={<Btn onClick={() => setWin("rescale")}>Review with new scale</Btn>}>
          {n} run(s) were measured before the page was re-scaled. They can&apos;t be ordered until you review them.
        </Banner>
      ); })()}
      {view.workspace.state === "needs_review" && (
        <Banner tone="warn" action={caps.edit && <Btn onClick={() => ws.edit(partial({ workspace: { acknowledgeReview: true } }))}>Mark reviewed</Btn>}>
          A plan used by this takeoff was replaced or removed. Existing measurements are kept and flagged; scale and measure on the current plan, then mark it reviewed.
        </Banner>
      )}

      <section className="space-y-2 rounded-card border border-hairline bg-white p-3">
        <h2 className="text-sm font-semibold text-ink">Plan</h2>
        {plans.length === 0 ? <p className="text-sm text-muted">No plans on this job yet.</p> : (
          <>
            <p className="text-sm text-ink">{planDoc ? docLabel(planDoc) : "Choose a plan"} · page {pageIndex + 1}
              <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${pageScale === "Ready" ? "bg-emerald-50 text-emerald-700" : pageScale === "Needs review" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-muted"}`}>{pageScale}</span>
              {planDoc && planDoc.status !== "current" && <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">Replaced</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              <Btn onClick={() => setWin("setup")}>Set up plans</Btn>
              {caps.edit && <Btn onClick={() => { setScaleFrom(null); setWin("calibrate"); }} disabled={!docId || planDoc?.status !== "current"}>Scale this page</Btn>}
              <Btn kind="primary" onClick={startMeasuring} disabled={!docId}>{caps.edit ? "Measure" : "View plan"}</Btn>
            </div>
          </>
        )}
      </section>

      {(section === SECTIONS.FLASHINGS ? ["flashings"] : ["timber", "cladding"]).map((grp) => {
        const list = secMats.filter((m) => materialGroup(m) === grp);
        const adds = grp === "flashings" ? [["Add flashing", () => setWin("pick")]] : grp === "timber" ? [["Add timber", addTimber]] : [["Add cladding", addCladding], ["Add aluminium", addAluminium]];
        return (
          <section key={grp} className="space-y-1 rounded-card border border-hairline bg-white p-3" data-material-group={grp}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="flex-1 text-sm font-semibold text-ink">{GROUP_LABEL[grp]}</h2>
              {caps.edit && adds.map(([label, fn]) => <Btn key={label} onClick={fn}>{label}</Btn>)}
            </div>
            {!list.length && <p className="text-sm text-muted">{grp === "flashings" ? "No flashings yet — add one to start measuring." : grp === "timber" ? "No timber yet." : "No cladding yet. Aluminium used with the cladding goes here too."}</p>}
            <ul className="divide-y divide-hairline">{list.map(materialRow)}</ul>
          </section>
        );
      })}

      <section className="space-y-2 rounded-card border border-hairline bg-white p-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-sm font-semibold text-ink">Length schedule</h2>
          <span className="text-xs text-muted" data-overview-totals="">{unitTotals(lines, ws.computed?.totalLm)}</span>
        </div>
        {lines.some((l) => l.problems.length) && <Banner tone="warn">Some lengths need attention before they can be ordered.</Banner>}
        <div className="flex flex-wrap gap-2">
          <Btn onClick={() => setWin("schedule")}>Open schedule</Btn>
          <Btn onClick={() => setWin("orders")} disabled={!lines.length}>{caps.export ? "Review & export order" : "Orders"}</Btn>
        </div>
      </section>
    </div>
  );
}

const UNIT_TEXT = { piece: ["piece", "pieces"], sheet: ["sheet", "sheets"], bar: ["bar", "bars"], box: ["box", "boxes"], bag: ["bag", "bags"], roll: ["roll", "rolls"],
  pack: ["pack", "packs"], cartridge: ["cartridge", "cartridges"], lm: ["LM", "LM"], m2: ["m²", "m²"], ml: ["ml", "ml"] };
/** "6 flashing pieces · 22.600 LM · 18 pieces · 4 sheets · 1 bar" — units are never added together. */
function unitTotals(lines, flashingLm) {
  const flash = lines.filter((l) => !l.generic);
  const parts = flash.length ? [`${flash.reduce((a, l) => a + l.quantity, 0)} flashing pieces · ${fmtLm(flashingLm)} LM`] : [];
  const byUnit = new Map();
  for (const l of lines.filter((x) => x.generic)) byUnit.set(l.unit, (byUnit.get(l.unit) || 0) + l.quantity);
  for (const [u, n] of byUnit) { const [one, many] = UNIT_TEXT[u] || [u, u]; parts.push(`${n.toLocaleString("en-AU")} ${n === 1 ? one : many}`); }
  return parts.join(" · ") || "Nothing measured yet";
}

function ManualLengths({ onAdd, timber = false }) {
  const [len, setLen] = useState(null);
  const [qty, setQty] = useState(1);
  return (
    <div className="grid grid-cols-[1fr_7rem_auto] items-end gap-2 rounded-lg bg-page p-2">
      <NumberField label={timber ? "Cut length" : "Finished length"} value={len} max={30000} onCommit={setLen}
        help={timber ? "Each cut is bought as the next stock length (1200, 1500, 1800 …) — the cut itself isn't changed." : "Entered lengths are used exactly — no allowance or rounding."} />
      <NumberField label="Qty" unit="pcs" integer min={1} max={10000} value={qty} onCommit={setQty} />
      <Btn kind="primary" disabled={!len || !qty} onClick={() => { onAdd(len, qty); setLen(null); setQty(1); }}>Add</Btn>
    </div>
  );
}
