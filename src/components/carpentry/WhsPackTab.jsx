// WhsPackTab — the carpentry job's WHS tab (Phase B). A short questionnaire (which HRCW/task applies,
// pre-ticked from the job type) → the supervisor selects the controls ACTUALLY used per module (from
// the reviewed register — never free text) → generates ONE composed 3-part site WHS pack. A competent
// reviewer approves it; the crew then signs that version in the field app (Phase C).
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, apiPut, apiPost, apiBlob } from "../../lib/apiFetch.js";
import { HOC, TIER_COLOR, hierarchyTier, needsJustification } from "../../lib/whsHierarchy.js";

const isPart1 = (m) => m.part === 1 || m.isHrcw === "yes" || m.isHrcw === "boundary";

const SITE_FIELDS = [["addressStreet", "Street address"], ["addressSuburb", "Suburb"], ["addressPostcode", "Postcode"], ["supervisor", "Site supervisor (installs/verifies)"], ["principalContractor", "Principal contractor (if not you)"], ["pcPlanRef", "PC's WHS management plan (ref)"], ["otherPcbus", "Other PCBUs on site + coordination"]];
const EMERG_FIELDS = [["hospital", "Nearest hospital / medical"], ["firstAider", "First aider on site"], ["firstAiderExpiry", "First-aid qual. expiry", "date"], ["firstAidKit", "First-aid kit location"], ["fireExtinguisher", "Fire extinguisher location"], ["musterPoint", "Muster point"]];
const ARREST_FIELDS = [["rescuer", "Nominated rescuer on site"], ["rescueMethod", "Rescue method"], ["groundClearance", "Ground-clearance calc (calc vs available)"], ["anchorType", "Anchor type + rating"], ["anchorInstaller", "Installed / verified by"], ["harnessInspection", "Harness / lanyard inspection", "date"], ["rescueEquipment", "Rescue equipment + location"]];
const SITE_CONDITIONS = [["overheadServices", "Overhead services on the frontage"], ["undergroundServices", "Underground services in the work path"], ["tightBoundary", "Adjoining structures / tight boundary"], ["occupiedDwelling", "Occupied dwelling or neighbours affected"], ["tradesAboveBelow", "Other trades working above or below"], ["unusualAccess", "Anything unusual about access, slope or ground"]];
const ARREST_LABEL = { rescuer: "named rescuer", rescueMethod: "rescue method", groundClearance: "ground-clearance calc" };

// The live hierarchy bar (Design §6.1) — 6 segments, filled at the selected levels, coloured by the tier.
function HBar({ levels }) {
  const { filled, tier, label } = hierarchyTier(levels);
  const on = TIER_COLOR[tier];
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <span className="inline-flex gap-[2px]">
        {[1, 2, 3, 4, 5, 6].map((l) => (
          <span key={l} style={{ width: 14, height: 7, borderRadius: 1, background: filled.includes(l) ? on : "#E3E7EB" }} />
        ))}
      </span>
      <span className="text-[10px] font-bold tracking-wide" style={{ color: on }}>{label}</span>
    </span>
  );
}

export default function WhsPackTab({ jobId }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [preview, setPreview] = useState(null);
  // local editable selection state
  const [hrcw, setHrcw] = useState(() => new Set());
  const [task, setTask] = useState(() => new Set());
  const [controls, setControls] = useState({}); // { code: Set(control text) }
  const [answers, setAnswers] = useState({});
  const [just, setJust] = useState({}); // { code: justification } for G-2 (admin/PPE-led HRCW)
  const [rev, setRev] = useState({ reviewDueAt: "", reviewedBy: "", reviewedAt: "" }); // document control (pack columns)

  const load = useCallback(async () => {
    const { ok, data, error } = await apiFetch(`/api/carpentry/jobs/${jobId}/whs-pack`);
    if (!ok) { setMsg(error || "Could not load the WHS pack."); return; }
    setData(data);
    const p = data.pack || {};
    setHrcw(new Set(p.selectedHrcw || []));
    setTask(new Set(p.selectedTask || []));
    setControls(Object.fromEntries(Object.entries(p.selectedControls || {}).map(([k, v]) => [k, new Set(v)])));
    setAnswers(p.answers || {});
    setJust(p.answers?.justifications || {});
    setRev({ reviewDueAt: p.reviewDueAt || "", reviewedBy: p.reviewedBy || "", reviewedAt: p.reviewedAt || "" });
  }, [jobId]);
  useEffect(() => { load(); }, [load]);

  const modules = useMemo(() => data?.modules || [], [data]);
  const byCode = useMemo(() => Object.fromEntries(modules.map((m) => [m.moduleCode, m])), [modules]);
  const part1 = modules.filter(isPart1);
  const part2 = modules.filter((m) => !isPart1(m));

  // G-1: any selected module that HAS control options but none ticked can't be issued (the pack would
  // assert high-risk work with no controls). Surface it up front + block Approve, so the supervisor
  // isn't ambushed by the server's 409.
  const needControls = useMemo(() => {
    const codes = [...hrcw, ...task];
    return codes.map((code) => byCode[code]).filter(Boolean).filter((m) => {
      const opts = m.contentJson?.controlOptions || [];
      if (!opts.length) return false;
      const set = controls[m.moduleCode] || new Set();
      // Only ticks whose text still exists in the register count (mirrors the server) — a stale tick isn't a control.
      return opts.filter((o) => set.has(o.text)).length === 0;
    }).map((m) => m.moduleCode);
  }, [hrcw, task, controls, byCode]);

  // G-2: an HRCW module whose top ticked control is admin (L5) or PPE (L6) needs a written justification.
  const needJust = useMemo(() => {
    const codes = [...hrcw, ...task];
    return codes.map((c) => byCode[c]).filter(Boolean).filter((m) => {
      const sel = controls[m.moduleCode] || new Set();
      const levels = (m.contentJson?.controlOptions || []).filter((o) => sel.has(o.text)).map((o) => o.level);
      return needsJustification(levels, isPart1(m)) && !String(just[m.moduleCode] || "").trim();
    }).map((m) => m.moduleCode);
  }, [hrcw, task, controls, just, byCode]);

  const toggleMod = (code, set, setter) => { const n = new Set(set); n.has(code) ? n.delete(code) : n.add(code); setter(n); };
  // Controls are identified by their TEXT (stable), never an array index, so reordering/editing the
  // register can't silently remap a tick to a different control.
  const toggleCtrl = (code, key) => setControls((c) => {
    const n = { ...c }; const s = new Set(n[code] || []); s.has(key) ? s.delete(key) : s.add(key); n[code] = s; return n;
  });

  const isIssued = () => data?.pack?.reviewStatus === "issued";
  const payload = () => ({
    selectedHrcw: [...hrcw], selectedTask: [...task],
    selectedControls: Object.fromEntries(Object.entries(controls).map(([k, v]) => [k, [...v]])),
    answers: { ...answers, justifications: just },
    reviewDueAt: rev.reviewDueAt || null, reviewedBy: rev.reviewedBy || null, reviewedAt: rev.reviewedAt || null,
  });
  const save = async () => {
    setBusy(true); setMsg("");
    const { ok, error } = await apiPut(`/api/carpentry/jobs/${jobId}/whs-pack`, payload());
    setBusy(false); setMsg(ok ? "Saved." : (error || "Save failed.")); if (ok) load();
  };
  // Persist current on-screen selections first so the composed doc matches — but never PUT an issued
  // pack (the server rejects that; edits need a revision). Returns { html } or { error }.
  const fetchComposedHtml = async () => {
    if (!isIssued()) { const p = await apiPut(`/api/carpentry/jobs/${jobId}/whs-pack`, payload()); if (!p.ok) return { error: p.error || "Save failed." }; }
    const { ok, data, error } = await apiFetch(`/api/carpentry/jobs/${jobId}/whs-pack/compose`);
    return ok ? { html: data.html } : { error: error || "Could not compose." };
  };
  const compose = async () => {
    setBusy(true); setMsg("");
    const r = await fetchComposedHtml();
    setBusy(false); r.html ? setPreview(r.html) : setMsg(r.error);
  };
  // Official PDF: the server-rendered, branded, page-numbered A4 pack (the archival record). Persist the
  // current selections first (unless issued) so the PDF matches the screen, then stream + download it.
  const downloadPdf = async () => {
    setBusy(true); setMsg("");
    if (!isIssued()) { const p = await apiPut(`/api/carpentry/jobs/${jobId}/whs-pack`, payload()); if (!p.ok) { setBusy(false); setMsg(p.error || "Save failed."); return; } }
    const { ok, blob, error } = await apiBlob(`/api/carpentry/jobs/${jobId}/whs-pack/pdf`);
    setBusy(false);
    if (!ok) { setMsg(error || "Could not build the PDF."); return; }
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url; el.download = `WHS-Pack-${data?.job?.reference || "pack"}-v${data?.pack?.version || 1}.pdf`;
    document.body.appendChild(el); el.click(); el.remove(); URL.revokeObjectURL(url);
  };
  const act = async (action) => {
    setBusy(true); setMsg("");
    // Approve must issue the CURRENT on-screen selections, not stale saved state — persist first.
    if (action === "approve") { const p = await apiPut(`/api/carpentry/jobs/${jobId}/whs-pack`, payload()); if (!p.ok) { setBusy(false); setMsg(p.error || "Save failed."); return; } }
    const { ok, error } = await apiPost(`/api/carpentry/jobs/${jobId}/whs-pack/${action}`, {});
    setBusy(false); setMsg(ok ? (action === "approve" ? "Approved / issued." : "New version — everyone must re-sign.") : (error || "Failed.")); if (ok) load();
  };

  if (!data) return <div className="text-sm text-muted p-4">{msg || "Loading…"}</div>;
  const pack = data.pack || {};
  const issued = pack.reviewStatus === "issued";
  const crew = data.crew || [];
  const signedVersion = {}; // employeeId → highest signed pack version
  for (const s of (data.signons || [])) { const v = Number(s.packVersion); if (!signedVersion[s.employeeId] || v > signedVersion[s.employeeId]) signedVersion[s.employeeId] = v; }
  // G-3 (fall-arrest rescue plan) + the combined issue-gate mirroring the server.
  const arrestGaps = (!issued && answers.fallArrestInUse) ? ["rescuer", "rescueMethod", "groundClearance"].filter((k) => !String(answers[k] || "").trim()) : [];
  // Mirror the server's reviewed-module + missing-module gates so the button never enables into a 409.
  const selectedCodes = [...hrcw, ...task];
  const unreviewedSel = selectedCodes.filter((c) => byCode[c] && byCode[c].reviewStatus !== "reviewed");
  const missingSel = selectedCodes.filter((c) => !byCode[c]);
  const canIssue = needControls.length === 0 && needJust.length === 0 && !!rev.reviewDueAt && arrestGaps.length === 0 && unreviewedSel.length === 0 && missingSel.length === 0;

  const ModuleCard = ({ m, selected, onToggle }) => {
    const opts = m.contentJson?.controlOptions || [];
    const set = controls[m.moduleCode] || new Set();
    const levels = opts.filter((o) => set.has(o.text)).map((o) => o.level);
    const showJust = selected && needsJustification(levels, isPart1(m));
    return (
      <div className="rounded-lg border border-hairline">
        <label className="flex items-start gap-2 px-3 py-2 cursor-pointer">
          <input type="checkbox" checked={selected} onChange={onToggle} disabled={issued} className="mt-1 h-4 w-4" />
          <div className="flex-1">
            <div className="text-sm font-medium text-ink">{m.moduleCode} · {m.title} {m.reviewStatus !== "reviewed" && <span className="text-[10px] font-bold text-warning">DRAFT</span>}</div>
            {selected && <div className="mt-1"><HBar levels={levels} /></div>}
            {selected && m.trigger && <div className="text-[11px] text-muted mt-0.5">{m.trigger}</div>}
          </div>
        </label>
        {selected && (
          <div className="border-t border-hairline px-3 py-2">
            <div className="text-[11px] font-semibold text-muted mb-1">Tick the controls actually installed on this site (hierarchy order):</div>
            <div className="space-y-1">
              {opts.map((x, i) => (
                <label key={i} className="flex items-start gap-2 text-xs">
                  <input type="checkbox" checked={set.has(x.text)} onChange={() => toggleCtrl(m.moduleCode, x.text)} disabled={issued} className="mt-0.5 h-4 w-4" />
                  <span><b className="text-primary">L{x.level} {HOC[x.level]}:</b> {x.text}</span>
                </label>
              ))}
              {opts.length === 0 && <div className="text-[11px] text-muted">No control options (PPE-matrix module).</div>}
            </div>
            {showJust && (
              <div className="mt-2 rounded-md border border-red-300 bg-red-50 p-2">
                <div className="text-[11px] font-semibold text-red-800 mb-1">This HRCW is relying on admin / PPE as its top control. Justify why a higher control isn&apos;t reasonably practicable (required to issue — G-2):</div>
                <textarea value={just[m.moduleCode] || ""} onChange={(e) => setJust((j) => ({ ...j, [m.moduleCode]: e.target.value }))} disabled={issued} rows={2} className="w-full rounded border border-hairline px-2 py-1 text-xs" placeholder="e.g. silica processing — elimination not possible on a cut-to-fit job; wet-cut + H-class extraction + P2 fit-test in place" />
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Section-3 field render helpers (not components — called as functions, so no unstable-nested-component).
  const aField = ([k, label, type = "text"]) => (
    <label key={k} className="block text-xs font-semibold text-muted">{label}
      <input type={type} value={answers[k] || ""} onChange={(e) => setAnswers((a) => ({ ...a, [k]: e.target.value }))} disabled={issued} className="mt-1 w-full rounded-md border border-hairline px-2 py-1 text-sm" />
    </label>
  );
  const aChk = (k, label) => (
    <label key={k} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!answers[k]} onChange={(e) => setAnswers((a) => ({ ...a, [k]: e.target.checked }))} disabled={issued} /> {label}</label>
  );
  const setCond = (k, patch) => setAnswers((a) => ({ ...a, conditions: { ...(a.conditions || {}), [k]: { ...((a.conditions || {})[k] || {}), ...patch } } }));

  return (
    <div className="space-y-4">
      <div className={`rounded-lg border px-3 py-2 text-sm ${issued ? "border-accent/40 bg-accent/5" : "border-warning/40 bg-warning/5"}`}>
        <b>Site WHS pack</b> — v{pack.version} · {issued ? "Issued" : "Draft"}. {issued ? "Reviewed + approved; the crew signs this version in the field app." : "Select the HRCW and controls that apply, then a competent reviewer approves it. DRAFT until then — not for site use."}
      </div>
      {msg && <div className="rounded-lg border border-hairline bg-page px-3 py-2 text-xs">{msg}</div>}

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted mb-2">1 · Which high-risk work applies to this job?</h3>
        <div className="space-y-2">{part1.map((m) => <ModuleCard key={m.id} m={m} selected={hrcw.has(m.moduleCode)} onToggle={() => toggleMod(m.moduleCode, hrcw, setHrcw)} />)}</div>
      </div>
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted mb-2">2 · Task-control modules (not HRCW)</h3>
        <div className="space-y-2">{part2.map((m) => <ModuleCard key={m.id} m={m} selected={task.has(m.moduleCode)} onToggle={() => toggleMod(m.moduleCode, task, setTask)} />)}</div>
      </div>

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted mb-2">3 · Site &amp; parties</h3>
        <div className="grid gap-2 md:grid-cols-2">{SITE_FIELDS.map(aField)}</div>
      </div>

      <div>
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted mb-2">Stop-work limits (shown on the Site Card)</h4>
        <div className="grid gap-2 md:grid-cols-3">
          {aField(["stopWind", "Wind over (km/h)"])}
          {aField(["stopHeat", "Heat over (°C)"])}
          {aChk("noWetWork", "No roof/joist work when wet or frosted")}
        </div>
      </div>

      <div>
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted mb-2">Emergency</h4>
        <div className="grid gap-2 md:grid-cols-2">{EMERG_FIELDS.map(aField)}</div>
      </div>

      <div>
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted mb-2">On site</h4>
        <div className="grid gap-2 md:grid-cols-2">
          {aChk("craneOnSite", "Crane on site (→ hard hat mandatory)")}
          {aChk("plantOnSite", "Powered mobile plant on site (→ hi-vis mandatory)")}
          {aChk("fallArrestInUse", "Fall arrest in use (→ rescue plan required, G-3)")}
        </div>
        {answers.fallArrestInUse && (
          <div className="mt-2 rounded-md border border-red-300 bg-red-50 p-2">
            <div className="text-[11px] font-semibold text-red-800 mb-2">Fall-arrest rescue plan — all required before issue (G-3):</div>
            <div className="grid gap-2 md:grid-cols-2">{ARREST_FIELDS.map(aField)}</div>
          </div>
        )}
      </div>

      <div>
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted mb-2">Site-specific conditions</h4>
        <div className="space-y-1">
          {SITE_CONDITIONS.map(([k, label]) => {
            const c = (answers.conditions || {})[k] || {};
            return (
              <div key={k} className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={!!c.y} onChange={(e) => setCond(k, { y: e.target.checked })} disabled={issued} />
                <span className="w-52 shrink-0">{label}</span>
                {c.y && <input value={c.detail || ""} onChange={(e) => setCond(k, { detail: e.target.value })} disabled={issued} placeholder="detail" className="flex-1 rounded border border-hairline px-2 py-1" />}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted mb-2">Consultation with the workers</h4>
        <div className="grid gap-2 md:grid-cols-2">
          {aField(["consultationNames", "Workers consulted"])}
          {aField(["consultationDate", "Date / method"])}
        </div>
        <label className="block text-xs font-semibold text-muted mt-2">Toolbox discussion
          <textarea value={answers.consultationSummary || ""} onChange={(e) => setAnswers((a) => ({ ...a, consultationSummary: e.target.value }))} disabled={issued} rows={2} className="mt-1 w-full rounded-md border border-hairline px-2 py-1 text-sm" />
        </label>
      </div>

      <div>
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted mb-2">Document control</h4>
        <div className="grid gap-2 md:grid-cols-3">
          <label className="block text-xs font-semibold text-muted">Reviewer (competent person)<input value={rev.reviewedBy} onChange={(e) => setRev((r) => ({ ...r, reviewedBy: e.target.value }))} disabled={issued} className="mt-1 w-full rounded-md border border-hairline px-2 py-1 text-sm" /></label>
          <label className="block text-xs font-semibold text-muted">Reviewer sign-off date<input type="date" value={rev.reviewedAt} onChange={(e) => setRev((r) => ({ ...r, reviewedAt: e.target.value }))} disabled={issued} className="mt-1 w-full rounded-md border border-hairline px-2 py-1 text-sm" /></label>
          <label className="block text-xs font-semibold text-muted">Scheduled review due <span className="text-red-600">(required, G-8)</span><input type="date" value={rev.reviewDueAt} onChange={(e) => setRev((r) => ({ ...r, reviewDueAt: e.target.value }))} disabled={issued} className="mt-1 w-full rounded-md border border-hairline px-2 py-1 text-sm" /></label>
        </div>
      </div>

      {!issued && needControls.length > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          <b>Can&apos;t issue yet.</b> These selected modules have no controls ticked — a pack can&apos;t assert high-risk work with no controls in place: <b>{needControls.join(", ")}</b>. Tick the controls actually installed, or untick the module if it doesn&apos;t apply.
        </div>
      )}
      {!issued && needJust.length > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          <b>Justification needed (G-2).</b> These HRCW modules are relying on admin/PPE as the top control — add a written justification on each before issuing: <b>{needJust.join(", ")}</b>.
        </div>
      )}
      {!issued && !rev.reviewDueAt && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          <b>Review date needed (G-8).</b> Set a scheduled review due date (Document control) before issuing — a pack with no review date is how the last SWMS went four years stale.
        </div>
      )}
      {!issued && arrestGaps.length > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          <b>Rescue plan incomplete (G-3).</b> Fall arrest is in use — complete before issuing: <b>{arrestGaps.map((k) => ARREST_LABEL[k]).join(", ")}</b>.
        </div>
      )}
      {!issued && (unreviewedSel.length > 0 || missingSel.length > 0) && (
        <div className="rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-xs text-ink">
          <b>Not ready for issue.</b> {unreviewedSel.length > 0 && <>These selected modules aren&apos;t WHS-reviewed yet: <b>{unreviewedSel.join(", ")}</b> — a competent reviewer must mark each reviewed in Settings first. </>}{missingSel.length > 0 && <>Missing from the register: <b>{missingSel.join(", ")}</b>.</>}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2 border-t border-hairline">
        <button disabled={busy || issued} onClick={save} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40" title={issued ? "Issued — start a new revision to edit" : ""}>Save</button>
        <button disabled={busy} onClick={compose} className="rounded-md border border-primary px-3 py-1.5 text-xs font-semibold text-primary">Generate / preview pack</button>
        <button disabled={busy} onClick={downloadPdf} className="rounded-md border border-hairline px-3 py-1.5 text-xs font-semibold text-ink">Download PDF</button>
        {!issued
          ? <button disabled={busy || !canIssue} onClick={() => act("approve")} className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40" title={!canIssue ? "Resolve the red items above before issuing" : ""}>Approve &amp; issue</button>
          : <button disabled={busy} onClick={() => act("revise")} className="rounded-md border border-hairline px-3 py-1.5 text-xs font-semibold">New revision (re-sign)</button>}
      </div>

      {issued && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted mb-2">Crew sign-on <span className="normal-case font-normal">(pack v{pack.version})</span></h3>
          {crew.length === 0 ? (
            <p className="text-xs text-muted">No crew rostered to this job yet. Once workers are allocated on the Planner and sign the pack in the field app, they appear here.</p>
          ) : (
            <div className="rounded-lg border border-hairline divide-y divide-hairline">
              {crew.map((c) => {
                const v = signedVersion[c.id];
                return (
                  <div key={c.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
                    <span className="text-ink">{c.name}</span>
                    {v == null ? <span className="text-muted text-xs">Not signed</span>
                      : v === pack.version ? <span className="text-accent text-xs font-semibold">✓ Signed v{v}</span>
                      : <span className="text-warning text-xs font-semibold" title={`Signed v${v}, current is v${pack.version}`}>Re-sign (signed v{v})</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {preview && (
        <div className="rounded-lg border border-hairline bg-white p-4 overflow-x-auto">
          <div className="text-xs font-bold uppercase tracking-wide text-muted mb-2">Composed pack preview</div>
          <div dangerouslySetInnerHTML={{ __html: preview }} />
        </div>
      )}
    </div>
  );
}
