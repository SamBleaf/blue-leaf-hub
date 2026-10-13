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
import { FLASHING_SPEC_DEFAULTS, indicativeGirthMm, latestPageCalibrations, normaliseSpec, rescaleCandidates } from "../../../shared/takeoff/index.js";
import { clearEditorDraft, listEditorDrafts } from "../../lib/takeoffRecovery.js";
import { newId } from "../../lib/takeoffApi.js";
import { describeChanges, partial } from "./changeset.js";
import { useTakeoffWorkspace } from "./useTakeoffWorkspace.js";
import { usePlanDocument } from "./usePlanDocument.js";
import CalibrationScreen from "./CalibrationScreen.jsx";
import MeasureScreen from "./MeasureScreen.jsx";
import MaterialPicker from "./MaterialPicker.jsx";
import MaterialSheet from "./MaterialSheet.jsx";
import ProfileEditor from "./ProfileEditor.jsx";
import ScheduleScreen from "./ScheduleScreen.jsx";
import OrdersScreen from "./OrdersScreen.jsx";
import PlanSetup from "./PlanSetup.jsx";
import RescaleReview from "./RescaleReview.jsx";
import { AsyncState, Banner, Btn, FocusedWindow, FocusMode, NumberField, SaveChip } from "./ui.jsx";
import { docLabel, fmtLm, fmtMm } from "./format.js";

export default function TakeoffApp({ api, jobType, jobId, onExternalView }) {
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const [code, setCode] = useState(null);
  const [wsId, setWsId] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const r = await api.job(jobType, jobId);
    if (!r.ok) { setError(r.error); setCode(r.code || (r.status === 403 ? "FORBIDDEN" : null)); return; }
    setJob(r.data);
    if (r.data.workspaces.length === 1) setWsId((cur) => cur || r.data.workspaces[0].id);
  }, [api, jobType, jobId]);
  useEffect(() => { load(); }, [load]);

  async function create() {
    setBusy(true);
    const r = await api.createWorkspace(jobType, jobId, { id: newId(), name: "Flashings" });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    await load();
    setWsId(r.data.workspace.id);
  }

  if (wsId) return <WorkspaceView api={api} wsId={wsId} job={job} onBack={job?.workspaces?.length > 1 ? () => { setWsId(null); load(); } : null} onExternalView={onExternalView} />;

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-3">
      <h1 className="text-lg font-semibold text-ink">Takeoffs{job?.job?.label ? <span className="block text-sm font-normal text-muted">{job.job.label}</span> : null}</h1>
      <AsyncState loading={!job && !error} error={error} code={code} onRetry={load}>
        {job && (
          <>
            {!job.plans.length && <Banner tone="info">This job has no plans yet. Upload a plan to the job first, then come back to measure it.</Banner>}
            {job.workspaces.length === 0 ? (
              <div className="rounded-card border border-hairline bg-white p-4 text-center">
                <p className="text-sm text-muted">No takeoffs on this job yet.</p>
                {job.capabilities?.edit && <Btn kind="primary" className="mt-3" onClick={create} disabled={busy}>Start a flashing takeoff</Btn>}
              </div>
            ) : (
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
            )}
            {job.workspaces.length > 0 && job.capabilities?.edit && <Btn onClick={create} disabled={busy}>New takeoff</Btn>}
          </>
        )}
      </AsyncState>
    </div>
  );
}

function WorkspaceView({ api, wsId, job, onBack, onExternalView }) {
  const ws = useTakeoffWorkspace(api, wsId);
  const view = ws.view;
  const caps = ws.capabilities || {};
  const [win, setWin] = useState("overview");
  const [docId, setDocId] = useState(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [activeMaterial, setActiveMaterial] = useState(null);
  const [editing, setEditing] = useState(null); // { material, isNew, next }
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
    const first = primaryDoc || plans.find((p) => p.status === "current")?.id || null;
    setDocId(first);
    setPageIndex(view.workspace.primaryPageIndex ?? 0);
  }, [view, docId, primaryDoc, plans, scalePlan, scaleHandled]);
  useEffect(() => { if (!activeMaterial && view?.materials?.length) setActiveMaterial(view.materials[0].id); }, [view, activeMaterial]);
  useEffect(() => { let stop = false; api.presets().then((r) => { if (!stop && r.ok) setPresets(r.data.presets || []); }); return () => { stop = true; }; }, [api]);

  const needsPdf = ["setup", "calibrate", "measure"].includes(win);
  // once opened, keep the plan loaded while in this takeoff — switching material / editing a flashing must not
  // re-download and re-parse the whole PDF on a phone (R04b R22)
  const [keepPlan, setKeepPlan] = useState(false);
  useEffect(() => { if (needsPdf) setKeepPlan(true); }, [needsPdf]);
  const plan = usePlanDocument(api, needsPdf || keepPlan ? docId : null);
  const planDoc = plans.find((p) => p.id === docId) || null;
  const pageCals = useMemo(() => (view ? latestPageCalibrations(view.calibrations, docId, pageIndex) : []), [view, docId, pageIndex]);
  const pageScale = !pageCals.length ? "Not scaled" : pageCals.every((c) => c.status === "ready") ? "Ready" : "Needs review";

  if (ws.loadState.loading || ws.loadState.error) {
    return <div className="p-3"><AsyncState loading={ws.loadState.loading} error={ws.loadState.error} code={ws.loadState.code} onRetry={ws.refreshServer} /></div>;
  }

  const contribCount = (mid) => view.contributions.filter((c) => c.jobMaterialId === mid).length;
  const linesFor = (mid) => (ws.computed?.scheduleLines || []).filter((l) => l.jobMaterialIds.includes(mid));

  const actorKey = ws.server?.capabilities?.actorKey || null;
  const matRec = (m) => ({ id: m.id, name: m.name, methodKey: m.methodKey, methodVersion: m.methodVersion || 1, spec: m.spec, rules: m.rules || {}, profile: m.profile || null, fromPresetId: m.fromPresetId || null, fromPresetRevision: m.fromPresetRevision || null });
  /** Job copies auto-apply: upsert straight into the takeoff (autosave + device recovery). */
  function upsertMaterial(m) {
    ws.edit(partial({ materials: [matRec(m)] }));
    setActiveMaterial(m.id);
  }
  const currentMat = (m) => view.materials.find((x) => x.id === m.id) || m;
  const newFlashing = () => ({ id: newId(), name: `Flashing ${view.materials.filter((x) => x.methodKey === "flashing_runs").length + 1}`, methodKey: "flashing_runs", methodVersion: 1, spec: { ...FLASHING_SPEC_DEFAULTS }, rules: {}, profile: null });
  const isPainted = (m) => { try { return normaliseSpec(m?.spec).colourApplicable !== false; } catch { return true; } };

  function useStandard(p) {
    const id = newId();
    ws.edit(partial({ materials: [{ id, fromPreset: { presetId: p.id, revision: p.revision }, name: p.name, methodKey: p.methodKey, methodVersion: p.methodVersion, spec: p.spec, rules: p.rules, profile: p.profile, fromPresetId: p.id, fromPresetRevision: p.revision }] }));
    setActiveMaterial(id);
    setWin(docId ? "measure" : "overview");
  }

  async function saveAsStandard(m) {
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

  const leaveEditor = () => { setEditing(null); setWin("overview"); setTimeout(refreshDrafts, 50); };
  const toLengths = (m) => { setActiveMaterial(m.id); setEditing(null); setWin(docId ? "measure" : "overview"); setTimeout(refreshDrafts, 50); };
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
        draftScope={actorKey && m?.id ? { actorKey, workspaceId: std ? "standards" : wsId, materialId: m.id } : null}
        onClose={leaveEditor}
        onChange={(profile) => { if (profile || view.materials.some((x) => x.id === m.id)) upsertMaterial({ ...currentMat(m), profile }); }}
        onDetails={() => { setEditing({ material: currentMat(m), stage: "details" }); setTimeout(refreshDrafts, 50); }}
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
  if (editing) {
    const std = !!editing.isStandard;
    const m = std ? editing.material : currentMat(editing.material);
    return (
      <FocusedWindow title={std ? editing.material.name : "Flashing details"} subtitle={std ? "Company standard" : `${m.name} · this job only`} onClose={leaveEditor} closeLabel={std ? "Cancel" : "Close"}
        actions={!std && m.methodKey === "flashing_runs" ? <SaveChip status={ws.status} /> : null}>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <MaterialSheet key={m.id} value={m} view={view} mode={std ? "standard" : "job"} canEditSourceReview={caps.editStandards}
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
            onPiecesOnly={() => { const m = { id: newId(), name: "Finished pieces", methodKey: "finished_piece_count", methodVersion: 1, spec: { ...FLASHING_SPEC_DEFAULTS }, rules: {}, profile: null }; upsertMaterial(m); setEditing({ material: m, stage: "details" }); }}
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
  if ((win === "calibrate" || win === "measure") && plan.status !== "ready") {
    return (
      <FocusedWindow title={planDoc?.title || "Plan"} onClose={() => setWin("overview")} closeLabel="Back">
        <div className="p-3">
          {plan.status === "loading" && <p className="text-sm text-muted" role="status">Downloading plan{plan.progress?.total ? ` — ${Math.round((plan.progress.loaded / plan.progress.total) * 100)}%` : "…"} <Btn kind="ghost" onClick={plan.cancel}>Cancel</Btn></p>}
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
      onClose={() => setWin("overview")}
      onSave={(rec, rot) => { setRotation(rot); ws.edit(partial({ calibrations: [rec] })); setWin("measure"); }} />;
  }
  if (win === "measure") {
    return <MeasureScreen ws={ws} doc={plan.doc} document={planDoc} pageIndex={pageIndex} displayRotation={rotation} materialId={activeMaterial}
      onChangeMaterial={() => setWin("materials")} onScale={caps.edit ? () => setWin("calibrate") : null} onClose={() => setWin("overview")} />;
  }
  if (win === "materials") {
    return (
      <FocusedWindow title="Measure with…" onClose={() => setWin("measure")} closeLabel="Back">
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {view.materials.map((m) => (
            <button key={m.id} type="button" onClick={() => { setActiveMaterial(m.id); setWin("measure"); }} aria-pressed={m.id === activeMaterial}
              className={`flex min-h-[52px] w-full items-center rounded-card border px-3 text-left text-sm ${m.id === activeMaterial ? "border-primary bg-primary/5" : "border-hairline bg-white"}`}>{m.name}</button>
          ))}
          {caps.edit && <Btn kind="primary" className="w-full" onClick={() => setWin("pick")}>Add flashing</Btn>}
        </div>
      </FocusedWindow>
    );
  }
  if (win === "schedule") {
    return <FocusedWindow title="Length schedule" onClose={() => setWin("overview")} closeLabel="Back" actions={<SaveChip status={ws.status} />}><div className="min-h-0 flex-1 overflow-y-auto p-3"><ScheduleScreen ws={ws} /></div></FocusedWindow>;
  }
  if (win === "rescale") {
    return <FocusedWindow title="Review with new scale" onClose={() => setWin("overview")} closeLabel="Back"><div className="min-h-0 flex-1 overflow-y-auto p-3"><RescaleReview ws={ws} onDone={() => setWin("overview")} /></div></FocusedWindow>;
  }
  if (win === "orders") {
    return <FocusedWindow title="Orders" onClose={() => setWin("overview")} closeLabel="Back"><div className="min-h-0 flex-1 overflow-y-auto p-3"><OrdersScreen api={api} ws={ws} jobAddress={ws.server?.jobAddress}
      deviceDrafts={editorDrafts.map((d) => ({ name: view.materials.find((x) => x.id === d.materialId)?.name || "A new flashing", invalid: Object.keys(d.draft?.drafts || {}).length }))} /></div></FocusedWindow>;
  }

  // ── overview ────────────────────────────────────────────────────────────────
  const offer = ws.recovery.offer;
  const lines = ws.computed?.scheduleLines || [];
  return (
    <div className="mx-auto max-w-3xl space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {onBack && <Btn kind="ghost" onClick={onBack}>‹ Takeoffs</Btn>}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold text-ink">{view.workspace.name}</h1>
          <p className="truncate text-xs text-muted">{ws.server?.jobLabel}</p>
        </div>
        <SaveChip status={ws.status} />
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
          {ws.saveError || "Someone else saved this takeoff first."} Your unsaved changes: {describeChanges(ws.pending).join("; ") || "none"}.
        </Banner>
      )}
      {ws.status === "error" && <Banner tone="error" action={<Btn onClick={ws.retry}>Try again</Btn>}>{ws.saveError}</Banner>}
      {ws.rejected && (
        <Banner tone="error" action={<div className="flex gap-1"><Btn onClick={ws.retryRejected}>Try again</Btn><Btn kind="ghost" onClick={ws.discardRejected}>Discard</Btn></div>}>
          Not saved: {ws.rejected.error} ({describeChanges(ws.rejected.changes).join("; ")}). It&apos;s kept on this device; your other edits keep saving.
        </Banner>
      )}
      {ws.status === "unsynced" && ws.saveError && <Banner tone="warn">{ws.saveError}</Banner>}
      {caps.edit && editorDrafts.map((d) => {
        const m = view.materials.find((x) => x.id === d.materialId);
        const empty = !d.draft?.hist?.present?.profile && !d.draft?.hist?.present?.first;
        if (empty) return null;
        return (
          <Banner key={d.key} tone="info" action={<div className="flex gap-1">
            <Btn onClick={() => setEditing({ material: m || { ...newFlashing(), id: d.materialId, name: "New flashing" }, isNew: !m, stage: "profile" })}>Continue drawing</Btn>
            <Btn kind="ghost" onClick={() => { if (window.confirm("Discard this unfinished drawing from this device?")) clearEditorDraft(draftActor, draftWs, d.materialId).then(refreshDrafts); }}>Discard</Btn>
          </div>}>
            Unfinished drawing on this device: <span className="font-semibold">{m ? m.name : "a new flashing"}</span>{Object.keys(d.draft?.drafts || {}).length ? " (has a size that isn't valid yet)" : ""}.
          </Banner>
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
              {caps.edit && <Btn onClick={() => setWin("calibrate")} disabled={!docId || planDoc?.status !== "current"}>Scale this page</Btn>}
              <Btn kind="primary" onClick={() => (view.materials.length ? setWin("measure") : setWin("pick"))} disabled={!docId}>{caps.edit ? "Measure" : "View plan"}</Btn>
            </div>
          </>
        )}
      </section>

      <section className="space-y-2 rounded-card border border-hairline bg-white p-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-sm font-semibold text-ink">Materials</h2>
          {caps.edit && <Btn onClick={() => setWin("pick")}>Add flashing</Btn>}
        </div>
        {!view.materials.length && <p className="text-sm text-muted">No materials yet. Add a flashing to start measuring.</p>}
        <ul className="divide-y divide-hairline">
          {view.materials.map((m) => {
            const std = m.fromPresetId ? presets.find((p) => p.id === m.fromPresetId) : null;
            const ls = linesFor(m.id);
            return (
              <li key={m.id} className="space-y-1 py-2">
                <div className="flex flex-wrap items-center gap-x-1 gap-y-0">
                  <p className="w-full min-w-0 text-sm font-medium text-ink sm:w-auto sm:flex-1">{m.name}
                    <span className="block text-[11px] font-normal text-muted">{[m.spec?.finish, m.spec?.colour, m.spec?.bmt != null ? `${m.spec.bmt} BMT` : null].filter(Boolean).join(" · ")}{m.profile ? ` · girth ${fmtMm(indicativeGirthMm(m.profile))} mm` : ""} · {contribCount(m.id)} item(s) · {ls.reduce((a, l) => a + l.quantity, 0)} pcs{m.pending ? " · unsaved" : ""}</span>
                  </p>
                  {(m.profile || m.methodKey === "flashing_runs") && <Btn kind="ghost" onClick={() => setEditing({ material: m, stage: "profile" })}>{caps.edit ? "Profile" : "View profile"}</Btn>}
                  {caps.edit && <Btn kind="ghost" onClick={() => setEditing({ material: m, stage: "details" })}>Details</Btn>}
                  {caps.edit && <Btn kind="ghost" onClick={() => setManualFor(manualFor === m.id ? null : m.id)}>Add lengths</Btn>}
                  {caps.editStandards && api.savePreset && <Btn kind="ghost" onClick={() => saveAsStandard(m)}>Save as standard</Btn>}
                  {caps.edit && <Btn kind="ghost" onClick={() => {
                    if (!window.confirm(`Remove ${m.name} and its measurements from this takeoff?`)) return;
                    // measurements used ONLY by this material go with it (none are left orphaned on the plan)
                    const mine = view.contributions.filter((c) => c.jobMaterialId === m.id).map((c) => c.measurementId);
                    const shared = new Set(view.contributions.filter((c) => c.jobMaterialId !== m.id).map((c) => c.measurementId));
                    ws.edit(partial({ archive: { materials: [m.id], measurements: mine.filter((id) => !shared.has(id)) } }));
                  }}>Remove</Btn>}
                </div>
                {std && std.revision > (m.fromPresetRevision || 0) && caps.edit && (
                  <Banner tone="info" action={<Btn onClick={() => ws.edit(partial({ materials: [{ ...m, fromPreset: { presetId: std.id, revision: std.revision }, name: std.name, spec: std.spec, rules: std.rules, profile: std.profile }] }))}>Update this job&apos;s copy</Btn>}>
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
                {manualFor === m.id && <ManualLengths onAdd={(len, qty) => {
                  const mid = newId();
                  ws.edit(partial({ measurements: [{ id: mid, kind: "manual", finishedLengthMm: len, quantity: qty }], contributions: [{ id: newId(), measurementId: mid, jobMaterialId: m.id }] }));
                }} />}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-2 rounded-card border border-hairline bg-white p-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-sm font-semibold text-ink">Length schedule</h2>
          <span className="text-xs text-muted">{lines.reduce((a, l) => a + l.quantity, 0)} pcs · {fmtLm(ws.computed?.totalLm)} LM</span>
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

function ManualLengths({ onAdd }) {
  const [len, setLen] = useState(null);
  const [qty, setQty] = useState(1);
  return (
    <div className="grid grid-cols-[1fr_7rem_auto] items-end gap-2 rounded-lg bg-page p-2">
      <NumberField label="Finished length" value={len} max={30000} onCommit={setLen} help="Entered lengths are used exactly — no allowance or rounding." />
      <NumberField label="Qty" unit="pcs" integer min={1} max={10000} value={qty} onCommit={setQty} />
      <Btn kind="primary" disabled={!len || !qty} onClick={() => { onAdd(len, qty); setLen(null); setQty(1); }}>Add</Btn>
    </div>
  );
}
