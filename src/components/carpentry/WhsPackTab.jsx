// WhsPackTab — the carpentry job's WHS tab (Phase B). A short questionnaire (which HRCW/task applies,
// pre-ticked from the job type) → the supervisor selects the controls ACTUALLY used per module (from
// the reviewed register — never free text) → generates ONE composed 3-part site WHS pack. A competent
// reviewer approves it; the crew then signs that version in the field app (Phase C).
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, apiPut, apiPost } from "../../lib/apiFetch.js";

const HOC = { 1: "Eliminate", 2: "Substitute", 3: "Isolate", 4: "Engineering", 5: "Administrative", 6: "PPE" };
const isPart1 = (m) => m.part === 1 || m.isHrcw === "yes" || m.isHrcw === "boundary";

export default function WhsPackTab({ jobId }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [preview, setPreview] = useState(null);
  // local editable selection state
  const [hrcw, setHrcw] = useState(() => new Set());
  const [task, setTask] = useState(() => new Set());
  const [controls, setControls] = useState({}); // { code: Set(indexes) }
  const [answers, setAnswers] = useState({});

  const load = useCallback(async () => {
    const { ok, data, error } = await apiFetch(`/api/carpentry/jobs/${jobId}/whs-pack`);
    if (!ok) { setMsg(error || "Could not load the WHS pack."); return; }
    setData(data);
    const p = data.pack || {};
    setHrcw(new Set(p.selectedHrcw || []));
    setTask(new Set(p.selectedTask || []));
    setControls(Object.fromEntries(Object.entries(p.selectedControls || {}).map(([k, v]) => [k, new Set(v)])));
    setAnswers(p.answers || {});
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
    return codes
      .map((code) => byCode[code])
      .filter((m) => m && (m.contentJson?.controlOptions?.length > 0) && !((controls[m.moduleCode]?.size) > 0))
      .map((m) => m.moduleCode);
  }, [hrcw, task, controls, byCode]);

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
    answers,
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
  // Client-side PDF: open the composed pack in a print window → the browser's native "Save as PDF".
  // No server/headless dependency; produces the same document as the preview.
  const downloadPdf = async () => {
    setBusy(true); setMsg("");
    const r = await fetchComposedHtml();
    setBusy(false);
    if (!r.html) { setMsg(r.error); return; }
    const ref = data?.job?.reference || "pack";
    const w = window.open("", "_blank");
    if (!w) { setMsg("Allow pop-ups for this site to download the PDF."); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Site WHS Pack — ${ref}</title><style>@page{size:A4;margin:14mm}body{font-family:Lato,Arial,sans-serif;margin:0;color:#111}</style></head><body>${r.html}<scr${""}ipt>window.onload=function(){setTimeout(function(){window.print()},300)}</scr${""}ipt></body></html>`);
    w.document.close();
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

  const ModuleCard = ({ m, selected, onToggle }) => (
    <div className="rounded-lg border border-hairline">
      <label className="flex items-start gap-2 px-3 py-2 cursor-pointer">
        <input type="checkbox" checked={selected} onChange={onToggle} disabled={issued} className="mt-1 h-4 w-4" />
        <div className="flex-1">
          <div className="text-sm font-medium text-ink">{m.moduleCode} · {m.title} {m.reviewStatus !== "reviewed" && <span className="text-[10px] font-bold text-warning">DRAFT</span>}</div>
          {selected && m.trigger && <div className="text-[11px] text-muted">{m.trigger}</div>}
        </div>
      </label>
      {selected && (
        <div className="border-t border-hairline px-3 py-2">
          <div className="text-[11px] font-semibold text-muted mb-1">Tick the controls actually installed on this site (hierarchy order):</div>
          <div className="space-y-1">
            {(m.contentJson?.controlOptions || []).map((x, i) => (
              <label key={i} className="flex items-start gap-2 text-xs">
                <input type="checkbox" checked={(controls[m.moduleCode] || new Set()).has(x.text)} onChange={() => toggleCtrl(m.moduleCode, x.text)} disabled={issued} className="mt-0.5 h-4 w-4" />
                <span><b className="text-primary">L{x.level} {HOC[x.level]}:</b> {x.text}</span>
              </label>
            ))}
            {(m.contentJson?.controlOptions || []).length === 0 && <div className="text-[11px] text-muted">No control options (PPE-matrix module).</div>}
          </div>
        </div>
      )}
    </div>
  );

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
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted mb-2">3 · Site details</h3>
        <div className="grid gap-2 md:grid-cols-2">
          {[["supervisor", "Site supervisor (installs/verifies controls)"], ["principalContractor", "Principal contractor (if not you)"], ["hospital", "Nearest hospital / medical"], ["firstAider", "First aider on site"], ["musterPoint", "Muster point"], ["rescuer", "Nominated rescuer (if fall-arrest used)"]].map(([k, label]) => (
            <label key={k} className="block text-xs font-semibold text-muted">{label}<input value={answers[k] || ""} onChange={(e) => setAnswers((a) => ({ ...a, [k]: e.target.value }))} className="mt-1 w-full rounded-md border border-hairline px-2 py-1 text-sm" /></label>
          ))}
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!answers.craneOnSite} onChange={(e) => setAnswers((a) => ({ ...a, craneOnSite: e.target.checked }))} /> Crane on site (→ hard hat mandatory)</label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!answers.plantOnSite} onChange={(e) => setAnswers((a) => ({ ...a, plantOnSite: e.target.checked }))} /> Powered mobile plant on site (→ hi-vis mandatory)</label>
        </div>
      </div>

      {!issued && needControls.length > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          <b>Can&apos;t issue yet.</b> These selected modules have no controls ticked — a pack can&apos;t assert high-risk work with no controls in place: <b>{needControls.join(", ")}</b>. Tick the controls actually installed, or untick the module if it doesn&apos;t apply.
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2 border-t border-hairline">
        <button disabled={busy || issued} onClick={save} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40" title={issued ? "Issued — start a new revision to edit" : ""}>Save</button>
        <button disabled={busy} onClick={compose} className="rounded-md border border-primary px-3 py-1.5 text-xs font-semibold text-primary">Generate / preview pack</button>
        <button disabled={busy} onClick={downloadPdf} className="rounded-md border border-hairline px-3 py-1.5 text-xs font-semibold text-ink">Download PDF</button>
        {!issued
          ? <button disabled={busy || needControls.length > 0} onClick={() => act("approve")} className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40" title={needControls.length ? `Tick controls for: ${needControls.join(", ")}` : ""}>Approve &amp; issue</button>
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
