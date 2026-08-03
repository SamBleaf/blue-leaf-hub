// WhsPackTab — the carpentry job's WHS tab (Phase B). A short questionnaire (which HRCW/task applies,
// pre-ticked from the job type) → the supervisor selects the controls ACTUALLY used per module (from
// the reviewed register — never free text) → generates ONE composed 3-part site WHS pack. A competent
// reviewer approves it; the crew then signs that version in the field app (Phase C).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, apiPut, apiPost, apiBlob } from "../../lib/apiFetch.js";
import { HOC, TIER_COLOR, hierarchyTier, needsJustification } from "../../lib/whsHierarchy.js";
import { J_QUESTIONS, JOB_STAGES, deriveModulesFromScope, jScopeMissing } from "../../lib/carpentryScope.js";

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
  const [controls, setControls] = useState({}); // { code: Set(control text) } — CONFIRMED (the assertion: composes + satisfies G-1)
  const [suggested, setSuggested] = useState({}); // { code: Set(control text) } — house-standard SUGGESTIONS, unconfirmed (assert nothing)
  const [answers, setAnswers] = useState({});
  const [just, setJust] = useState({}); // { code: justification } for G-2 (admin/PPE-led HRCW)
  const [rev, setRev] = useState({ reviewDueAt: "", reviewedBy: "", reviewedAt: "" }); // document control (pack columns)
  const [jScope, setJScope] = useState({ j1Stages: [] }); // job-scope questions (§4) — stored in answers.jScope
  // §1→§2: the module set section-1 last derived. Seeded on load so opening a saved pack never re-adds a
  // module the supervisor had removed; the reactive effect adds only what's NEWLY derived since this.
  const prevDerived = useRef(new Set());
  // Modules already OFFERED the house standard (persisted in answers.seededModules). Each in-scope module is
  // pre-filled with the standard as suggestions exactly once — so a dismissed suggestion never silently
  // returns, and it works regardless of the server's project-type scaffold (which makes every pack "non-fresh").
  const seeded = useRef(new Set());

  const load = useCallback(async () => {
    const { ok, data, error } = await apiFetch(`/api/carpentry/jobs/${jobId}/whs-pack`);
    if (!ok) { setMsg(error || "Could not load the WHS pack."); return; }
    setData(data);
    const p = data.pack || {};
    setHrcw(new Set(p.selectedHrcw || []));
    setTask(new Set(p.selectedTask || []));
    setControls(Object.fromEntries(Object.entries(p.selectedControls || {}).map(([k, v]) => [k, new Set(v)])));
    setSuggested(Object.fromEntries(Object.entries(p.answers?.suggestedControls || {}).map(([k, v]) => [k, new Set(v)])));
    setAnswers(p.answers || {});
    setJust(p.answers?.justifications || {});
    setRev({ reviewDueAt: p.reviewDueAt || "", reviewedBy: p.reviewedBy || "", reviewedAt: p.reviewedAt || "" });
    const loadedScope = p.answers?.jScope || { j1Stages: [] };
    setJScope(loadedScope);
    // Seed the §1→§2 baseline. Any pack that has EVER been saved (payload() always writes answers.jScope)
    // seeds with what section-1 currently derives, so opening it makes no changes and respects manual unticks
    // — including a pack deliberately curated down to zero modules. Only a never-saved pack seeds empty, so
    // the reactive effect populates §2 from section-1 the first time — incl. the always-on modules.
    const curated = !!(p.answers?.jScope || p.selectedHrcw?.length || p.selectedTask?.length || p.reviewDueAt || p.reviewedBy);
    prevDerived.current = curated ? new Set(deriveModulesFromScope(loadedScope)) : new Set();
    seeded.current = new Set(p.answers?.seededModules || []);
  }, [jobId]);
  useEffect(() => { load(); }, [load]);

  const modules = useMemo(() => data?.modules || [], [data]);
  const byCode = useMemo(() => Object.fromEntries(modules.map((m) => [m.moduleCode, m])), [modules]);
  const part1 = modules.filter(isPart1);
  const part2 = modules.filter((m) => !isPart1(m));

  // The module set section-1 currently derives (full stage + gate + always + J-yes/no logic).
  const derivedSet = useMemo(() => new Set(deriveModulesFromScope(jScope)), [jScope]);
  // Reactive §1→§2: auto-tick modules NEWLY derived since the last section-1 change. Non-destructive —
  // manual unticks and prior curation survive, nothing is auto-removed. Skips issued (immutable) packs.
  useEffect(() => {
    if (!modules.length || data?.pack?.reviewStatus === "issued") return;
    const added = [...derivedSet].filter((c) => byCode[c] && !prevDerived.current.has(c));
    // Grow-only: a module that leaves scope (e.g. a gate toggled off) stays remembered, so toggling the
    // gate back on doesn't count it as "newly derived" and re-add a module the supervisor had unticked.
    for (const c of derivedSet) prevDerived.current.add(c);
    if (!added.length) return;
    setHrcw((h) => { const n = new Set(h); added.forEach((c) => isPart1(byCode[c]) && n.add(c)); return n; });
    setTask((t) => { const n = new Set(t); added.forEach((c) => !isPart1(byCode[c]) && n.add(c)); return n; });
  }, [derivedSet, modules, byCode, data]);

  // Pre-fill the house standard as SUGGESTIONS (never ticks) the first time each selected module is offered
  // it — once per module (tracked in `seeded`, persisted in answers.seededModules), so a dismissed suggestion
  // never returns. Touches ONLY selected modules and skips already-confirmed controls. Skips issued packs.
  useEffect(() => {
    const tpl = data?.standardControls || {};
    if (data?.pack?.reviewStatus === "issued" || !Object.keys(tpl).length) return;
    const fresh = [...hrcw, ...task].filter((c) => !seeded.current.has(c) && Array.isArray(tpl[c]) && tpl[c].length);
    if (!fresh.length) return;
    fresh.forEach((c) => seeded.current.add(c));
    setSuggested((sg) => {
      const n = { ...sg };
      for (const c of fresh) { const conf = controls[c] || new Set(); const s = new Set(n[c] || []); for (const t of tpl[c]) if (!conf.has(t)) s.add(t); n[c] = s; }
      return n;
    });
  }, [hrcw, task, controls, data]);

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
  // A control has three states: suggested (template-proposed, unconfirmed) → confirmed (supervisor tapped
  // it: the assertion it's in place) → not used. A tap CONFIRMS a suggested/unused control, or un-confirms
  // a confirmed one back to "not used" (considered, not selected — a resolved suggestion never returns).
  const toggleCtrl = (code, key) => {
    setControls((c) => { const n = { ...c }; const s = new Set(n[code] || []); s.has(key) ? s.delete(key) : s.add(key); n[code] = s; return n; });
    setSuggested((sg) => { if (!sg[code]?.has(key)) return sg; const n = { ...sg }; const s = new Set(n[code]); s.delete(key); n[code] = s; return n; }); // resolve the suggestion on any tap
  };

  const isIssued = () => data?.pack?.reviewStatus === "issued";
  const payload = () => ({
    selectedHrcw: [...hrcw], selectedTask: [...task],
    // selected_controls carries ONLY confirmed controls (the assertion that composes + satisfies G-1);
    // suggestions live in answers.suggestedControls and never reach selected_controls.
    selectedControls: Object.fromEntries(Object.entries(controls).map(([k, v]) => [k, [...v]])),
    answers: {
      ...answers, justifications: just, jScope,
      suggestedControls: Object.fromEntries(Object.entries(suggested).map(([k, v]) => [k, [...v]]).filter(([, v]) => v.length)),
      seededModules: [...seeded.current], // modules already offered the house standard — never re-offer
    },
    reviewDueAt: rev.reviewDueAt || null, reviewedBy: rev.reviewedBy || null, reviewedAt: rev.reviewedAt || null,
  });
  // "Select all from section 1" — union every module section-1 derives into the selection (additive/safe).
  const applyScope = () => {
    const nH = new Set(hrcw); const nT = new Set(task); let added = 0;
    for (const c of derivedSet) { const m = byCode[c]; if (!m) continue; const set = isPart1(m) ? nH : nT; if (!set.has(c)) { set.add(c); added++; } }
    prevDerived.current = new Set(derivedSet);
    setHrcw(nH); setTask(nT);
    setMsg(added ? `Added ${added} module(s) from section 1.` : "Section 1 is already reflected in the selection.");
  };
  // "Reset to section 1" — make the selection exactly what section-1 derives (drops manual extras).
  const resetToScope = () => {
    const nH = new Set(); const nT = new Set();
    for (const c of derivedSet) { const m = byCode[c]; if (!m) continue; (isPart1(m) ? nH : nT).add(c); }
    prevDerived.current = new Set(derivedSet);
    setHrcw(nH); setTask(nT);
    setMsg("Selection reset to exactly what section 1 derives.");
  };
  const save = async () => {
    setBusy(true); setMsg("");
    const { ok, error } = await apiPut(`/api/carpentry/jobs/${jobId}/whs-pack`, payload());
    setBusy(false); setMsg(ok ? "Saved." : (error || "Save failed.")); if (ok) load();
  };
  // House template — SAVE the current CONFIRMED controls as "Blue Leaf standard controls" (never suggestions).
  const saveStandard = async () => {
    const controlsObj = Object.fromEntries(Object.entries(controls).map(([k, v]) => [k, [...v]]).filter(([, v]) => v.length));
    if (!Object.keys(controlsObj).length) { setMsg("No confirmed controls to save as the standard — tick some controls first."); return; }
    if (!window.confirm("Overwrite the Blue Leaf standard controls with the confirmed controls on this pack? Future jobs will pre-fill these as suggestions (not ticks).")) return;
    setBusy(true); setMsg("");
    const { ok, error } = await apiPut("/api/carpentry/whs-control-template", { controls: controlsObj });
    setBusy(false); setMsg(ok ? "Saved as the Blue Leaf standard — future jobs will suggest these." : (error || "Could not save the standard."));
    if (ok) load();
  };
  // House template — PRE-FILL the standard as SUGGESTIONS for every in-scope selected module (skip already-
  // confirmed). Touches only selected modules — never out-of-scope ones. Explicit re-apply for saved packs.
  const prefillStandard = () => {
    const tpl = data?.standardControls || {};
    const codes = [...hrcw, ...task];
    let added = 0;
    setSuggested((sg) => {
      const n = { ...sg };
      for (const c of codes) {
        const texts = tpl[c]; if (!Array.isArray(texts) || !texts.length) continue;
        const conf = controls[c] || new Set(); const s = new Set(n[c] || []);
        for (const t of texts) if (!conf.has(t) && !s.has(t)) { s.add(t); added++; }
        n[c] = s;
      }
      return n;
    });
    setMsg(added ? `Pre-filled ${added} standard control(s) as suggestions — confirm each on site.` : "No new standard controls to suggest for the in-scope modules.");
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
  const scopeMissing = jScopeMissing(jScope); // G-6
  const canIssue = needControls.length === 0 && needJust.length === 0 && !!rev.reviewDueAt && arrestGaps.length === 0 && unreviewedSel.length === 0 && missingSel.length === 0 && scopeMissing.length === 0;
  // §1→§2 relationship, for the scope banner + card badges.
  const derivedInReg = [...derivedSet].filter((c) => byCode[c]);
  const scopeNotSelected = derivedInReg.filter((c) => !hrcw.has(c) && !task.has(c)); // in section 1, not ticked
  const selectedBeyondScope = [...hrcw, ...task].filter((c) => byCode[c] && !derivedSet.has(c)); // ticked, not in section 1
  const hasStandard = Object.keys(data.standardControls || {}).length > 0; // a house template exists

  // Invoked as a FUNCTION (like aField/aChk below), not rendered as <ModuleCard/> — a nested component
  // would get a new identity each render and remount every card, losing focus in the G-2 textarea.
  const ModuleCard = ({ m, selected, onToggle, fromScope }) => {
    const opts = m.contentJson?.controlOptions || [];
    const set = controls[m.moduleCode] || new Set();       // CONFIRMED
    const sug = suggested[m.moduleCode] || new Set();       // SUGGESTED (unconfirmed)
    const levels = opts.filter((o) => set.has(o.text)).map((o) => o.level); // bar + G-2 reflect CONFIRMED only
    const showJust = selected && needsJustification(levels, isPart1(m));
    return (
      <div key={m.id} className={`rounded-lg border ${fromScope && !selected ? "border-primary/40 bg-primary/[0.03]" : "border-hairline"}`}>
        <label className="flex items-start gap-2 px-3 py-2 cursor-pointer">
          <input type="checkbox" checked={selected} onChange={onToggle} disabled={issued} className="mt-1 h-4 w-4" />
          <div className="flex-1">
            <div className="text-sm font-medium text-ink">{m.moduleCode} · {m.title} {fromScope && <span className="ml-0.5 rounded bg-primary/10 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary align-middle">§1</span>} {m.reviewStatus !== "reviewed" && <span className="text-[10px] font-bold text-warning">DRAFT</span>}</div>
            {selected && <div className="mt-1"><HBar levels={levels} /></div>}
            {selected && m.trigger && <div className="text-[11px] text-muted mt-0.5">{m.trigger}</div>}
          </div>
        </label>
        {selected && (
          <div className="border-t border-hairline px-3 py-2">
            <div className="text-[11px] font-semibold text-muted mb-1">Tap each control that&apos;s actually in place to confirm it (hierarchy order). <span className="font-normal">Dashed = Blue Leaf suggestion — a suggestion asserts nothing until you confirm it on site.</span>{sug.size > 0 && <span className="text-warning"> · {sug.size} suggested to confirm</span>}</div>
            <div className="space-y-1">
              {opts.map((x, i) => {
                const isConf = set.has(x.text);
                const isSugg = !isConf && sug.has(x.text);
                return (
                  <button key={i} type="button" disabled={issued} onClick={() => toggleCtrl(m.moduleCode, x.text)}
                    title={`${x.text} — ${isConf ? "confirmed (in place)" : isSugg ? "suggested — tap to confirm it is in place on site" : "not used"}`}
                    aria-pressed={isConf} className="flex w-full items-start gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-page disabled:opacity-100 disabled:cursor-default">
                    <span className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] text-[10px] font-bold leading-none ${isConf ? "border border-primary bg-primary text-white" : isSugg ? "border border-dashed border-warning bg-warning/10 text-warning" : "border border-hairline text-transparent"}`}>{isConf ? "✓" : isSugg ? "?" : ""}</span>
                    <span className={isConf ? "text-ink" : "text-muted"}>
                      <b className={isConf ? "text-primary" : "text-muted"}>L{x.level} {HOC[x.level]}:</b> {x.text}
                      {isSugg && <span className="ml-1 rounded bg-warning/15 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-warning">suggested · confirm on site</span>}
                    </span>
                  </button>
                );
              })}
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
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted mb-2">1 · What&apos;s on this job? <span className="normal-case font-normal text-[10px]">(every answer is recorded — a &quot;no&quot; is the &quot;considered, not applicable&quot; record)</span></h3>
        <div className="rounded-lg border border-hairline p-3 space-y-2">
          <div>
            <div className="text-xs font-semibold text-muted mb-1">Which stages are on this job?</div>
            <div className="flex flex-wrap gap-1.5">
              {JOB_STAGES.map(([k, label]) => {
                const on = (jScope.j1Stages || []).includes(k);
                return (
                  <button key={k} type="button" disabled={issued} onClick={() => setJScope((s) => ({ ...s, j1Stages: on ? (s.j1Stages || []).filter((x) => x !== k) : [...(s.j1Stages || []), k] }))}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${on ? "border-primary bg-primary text-white" : "border-hairline text-ink"}`}>{label}</button>
                );
              })}
            </div>
          </div>
          {J_QUESTIONS.filter((q) => q.type === "yesno").map((q) => (
            <div key={q.key} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex-1">{q.q}</span>
              <div className="flex gap-1 shrink-0">
                {["yes", "no"].map((v) => (
                  <button key={v} type="button" disabled={issued} onClick={() => setJScope((s) => ({ ...s, [q.key]: v }))}
                    className={`rounded-md border px-2.5 py-1 font-semibold ${jScope[q.key] === v ? (v === "yes" ? "border-primary bg-primary text-white" : "border-ink bg-ink text-white") : "border-hairline text-ink"}`}>{v === "yes" ? "Yes" : "No"}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {!issued && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-ink">Section 1 selects {derivedInReg.length} module{derivedInReg.length === 1 ? "" : "s"}.</span>
            {scopeNotSelected.length > 0 && <span className="text-warning">· {scopeNotSelected.length} not ticked ({scopeNotSelected.join(", ")})</span>}
            {selectedBeyondScope.length > 0 && <span className="text-muted">· {selectedBeyondScope.length} added beyond section 1 ({selectedBeyondScope.join(", ")})</span>}
            {scopeNotSelected.length === 0 && selectedBeyondScope.length === 0 && derivedInReg.length > 0 && <span className="text-accent">· all applied ✓</span>}
            <span className="ml-auto flex gap-1.5">
              <button type="button" onClick={applyScope} className="rounded-md border border-primary px-2.5 py-1 font-semibold text-primary">Select all from section 1</button>
              <button type="button" onClick={resetToScope} className="rounded-md border border-hairline px-2.5 py-1 font-semibold text-ink">Reset to section 1</button>
            </span>
          </div>
          <div className="text-[10px] text-muted mt-1">Answering section 1 ticks the matching modules automatically (marked <span className="font-bold text-primary">§1</span>). Confirm each — add or remove any. Section 1 never ticks a <b>control</b>: those are set by hand (or pre-filled as suggestions from the house standard). DRAFT until a competent reviewer approves.</div>
        </div>
      )}

      {!issued && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-page px-3 py-2 text-xs">
          <span className="font-semibold text-ink">Blue Leaf standard controls</span>
          <span className="text-[10px] text-muted">{hasStandard ? "Pre-fill the standard as suggestions (dashed) for the in-scope modules — confirm each on site." : "No house standard saved yet. Select your standard control per module, then save it below."}</span>
          <span className="ml-auto flex gap-1.5">
            <button type="button" disabled={!hasStandard} onClick={prefillStandard} className="rounded-md border border-warning px-2.5 py-1 font-semibold text-warning disabled:opacity-40" title={hasStandard ? "" : "No house standard saved yet"}>Pre-fill standard (as suggestions)</button>
            <button type="button" disabled={busy} onClick={saveStandard} className="rounded-md border border-hairline px-2.5 py-1 font-semibold text-ink">Save confirmed as standard</button>
          </span>
        </div>
      )}

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted mb-2">2 · Which high-risk work applies to this job?</h3>
        <div className="space-y-2">{part1.map((m) => ModuleCard({ m, selected: hrcw.has(m.moduleCode), fromScope: derivedSet.has(m.moduleCode), onToggle: () => toggleMod(m.moduleCode, hrcw, setHrcw) }))}</div>
      </div>
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted mb-2">3 · Task-control modules (not HRCW)</h3>
        <div className="space-y-2">{part2.map((m) => ModuleCard({ m, selected: task.has(m.moduleCode), fromScope: derivedSet.has(m.moduleCode), onToggle: () => toggleMod(m.moduleCode, task, setTask) }))}</div>
      </div>

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted mb-2">4 · Site &amp; parties</h3>
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
      {!issued && scopeMissing.length > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          <b>Answer the job scope (G-6).</b> Every question in section 1 must be answered before issuing — a blank isn&apos;t an answer. {scopeMissing.length} left.
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
