import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors, useDraggable, useDroppable } from "@dnd-kit/core";
import { authFetch } from "../../lib/authFetch.js";
import { PLANNER_PALETTE, resolveJobColor } from "../../lib/plannerColors.js";

// W17-P4b — Planner drag-drop + colour redesign.
// Advisory only: calls the W16 allocation routes + the job-colour routes; never a
// timesheet / approve / sync / Buildxact path.

// ── Local-date helpers (AU-local week boundaries — no UTC slicing) ────────────
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d;
}
function addDays(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const longDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" });

function splitJobKey(k) { const i = k.indexOf(":"); return { type: k.slice(0, i), id: k.slice(i + 1) }; }
function jobBodyFromKey(k) { const { type, id } = splitJobKey(k); return type === "project" ? { projectId: id, carpentryJobId: null } : { carpentryJobId: id, projectId: null }; }
function allocJobKey(a) { return a?.projectId ? `project:${a.projectId}` : a?.carpentryJobId ? `carpentry:${a.carpentryJobId}` : null; }

// Phone-view abbreviation: first 4 letters of the street/name, skipping leading
// house/unit numbers. "54 Gladstone Rd" → "Glad", "25 Nilpinna St" → "Nilp", "5A Gibson St" → "Gibs".
function abbrevLabel(label) {
  if (!label) return "";
  const word = String(label).split(/[\s,—–-]+/).filter(Boolean).find((w) => /^[A-Za-z]/.test(w));
  return (word || String(label)).slice(0, 4);
}

const json = (r) => r.json().catch(() => ({}));

// ── Draggable legend job-chip (drag source for "assign") ─────────────────────
function LegendChip({ jKey, label, color, pinned, onPickColor, onRemove }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `legend:${jKey}`, data: { kind: "legend", jKey } });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
      className={`group flex items-center gap-1.5 border border-hairline rounded-full pl-1.5 pr-2 py-1 cursor-grab select-none ${isDragging ? "opacity-40" : ""}`}
      style={{ touchAction: "none", background: color.bg }}>
      <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onPickColor(jKey, e); }}
        className="w-4 h-4 rounded border border-black/10" style={{ background: color.dot }} title="Change colour" aria-label={`Change colour for ${label}`} />
      <span className="text-xs truncate max-w-[150px]" style={{ color: color.text }}>{label}</span>
      {pinned && onRemove && (
        <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="text-[12px] leading-none opacity-0 group-hover:opacity-100 focus:opacity-100" style={{ color: color.text }} title="Remove from board" aria-label={`Remove ${label} from board`}>×</button>
      )}
    </div>
  );
}

// ── Draggable allocation chip (drag source for "move"; click = notes) ─────────
function ShiftChip({ alloc, label, color, onClick, onFillStart, onFillDownStart }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `chip:${alloc.id}`, data: { kind: "chip", alloc } });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
      onClick={(e) => { e.stopPropagation(); onClick(alloc, e); }}
      className={`group relative w-full h-full rounded px-1.5 py-1 flex items-center gap-1 cursor-grab select-none ${isDragging ? "opacity-40" : ""}`}
      style={{ touchAction: "none", background: color.bg }}
      title={`${label}${alloc.notes ? ` · ${alloc.notes}` : ""} — click to edit, drag to move`}>
      <span className="w-1.5 h-1.5 rounded-sm shrink-0" style={{ background: color.dot }} />
      <span className="text-[11px] leading-tight truncate" style={{ color: color.text }}><span className="sm:hidden">{abbrevLabel(label)}</span><span className="hidden sm:inline">{label}</span></span>
      {alloc.notes ? <span className="w-1 h-1 rounded-full bg-black/30 shrink-0" title={alloc.notes} /> : null}
      <span onPointerDown={(e) => { e.stopPropagation(); onFillStart(alloc, e); }}
        className="absolute right-0 top-0 h-full w-2 cursor-ew-resize opacity-0 group-hover:opacity-100"
        style={{ touchAction: "none" }} title="Drag across days to fill / deduct" aria-hidden="true">
        <span className="absolute right-0.5 top-1/2 -translate-y-1/2 w-1 h-3 rounded-sm" style={{ background: color.dot }} />
      </span>
      <span onPointerDown={(e) => { e.stopPropagation(); onFillDownStart(alloc, e); }}
        className="absolute left-0 bottom-0 w-full h-2 cursor-ns-resize opacity-0 group-hover:opacity-100"
        style={{ touchAction: "none" }} title="Drag down to duplicate to other workers / deduct" aria-hidden="true">
        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-3 rounded-sm" style={{ background: color.dot }} />
      </span>
    </div>
  );
}

// ── Droppable day cell ────────────────────────────────────────────────────────
function DayCell({ empId, day, dayIdx, fillActive, nonWork, children, className = "" }) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell:${empId}:${day}`, data: { kind: "cell", empId, day, dayIdx } });
  const filled = !!children;
  return (
    <td className={`py-1 px-1 align-top ${className}`}>
      <div ref={setNodeRef} data-cell data-empid={empId} data-dayidx={dayIdx}
        title={filled && nonWork ? `${nonWork.label} conflicts with allocation` : nonWork ? nonWork.label : undefined}
        className={`min-h-[34px] rounded transition ${filled ? (nonWork ? "ring-2 ring-amber-400" : "") : nonWork ? (nonWork.kind === "team" ? "bg-sky-100 border border-sky-200" : "bg-slate-100 border border-slate-200") : "border border-dashed border-hairline"} ${isOver ? "ring-2 ring-primary" : ""} ${fillActive ? "ring-2 ring-primary/60" : ""} ${!filled ? "flex items-center justify-center text-[10px] hover:bg-slate-50" : ""}`}>
        {filled ? children : (nonWork ? <span className={`leading-tight ${nonWork.kind === "team" ? "text-sky-600 font-medium" : "text-slate-400"}`}>{nonWork.kind === "holiday" ? "Hol" : nonWork.kind === "team" ? "Team RDO" : "RDO"}</span> : <span className="text-muted text-sm">+</span>)}
      </div>
    </td>
  );
}

export default function WorkforcePlannerTab() {
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [employees, setEmployees] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [projects, setProjects] = useState([]);
  const [carpJobs, setCarpJobs] = useState([]);
  const [settings, setSettings] = useState({}); // jobKey -> { color, onBoard }
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { type, text }
  const [activeDrag, setActiveDrag] = useState(null);
  const [notesPop, setNotesPop] = useState(null); // { alloc, x, y, value }
  const [colorPop, setColorPop] = useState(null); // { jKey, x, y }
  const [fill, setFill] = useState(null); // { empId, jKey, anchorIdx, endIdx, prevRightIdx } — across days
  const [fillDown, setFillDown] = useState(null); // { day, dayIdx, jKey, anchorRow, endRow, prevBottomRow } — down workers
  const [nonWorking, setNonWorking] = useState({ holidays: [], rdo: [], teamRdo: [] });
  const [daysOffOpen, setDaysOffOpen] = useState(false);
  const [dofEmp, setDofEmp] = useState("");
  const [holList, setHolList] = useState([]);   // public holidays with ids (panel)
  const [patList, setPatList] = useState([]);   // rdo patterns for the selected employee
  const [teamRdoList, setTeamRdoList] = useState([]); // whole-crew RDO dates (panel)
  const [dof, setDof] = useState({ holDate: "", holName: "", rdoDate: "", patWeekday: 1, patInterval: 2, patAnchor: "", teamDate: "" });
  const gridRef = useRef(null);
  const fillRef = useRef(null);
  fillRef.current = fill;
  const fillDownRef = useRef(null);
  fillDownRef.current = fillDown;

  // Mouse: 5px drag threshold (snappy on desktop). Touch: 400ms press-hold + 15px tolerance — a
  // horizontal swipe to scroll will travel >15px before 400ms elapses, cancelling drag activation.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 400, tolerance: 15 } })
  );

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => ymd(addDays(monday, i))), [monday]);
  const weekFrom = days[0], weekTo = days[6];

  useEffect(() => {
    authFetch("/api/workforce/employees").then(json).then((j) => { if (j.ok) setEmployees((j.employees || []).filter((e) => e.is_active)); }).catch(() => {});
    authFetch("/api/operations/projects").then(json).then((j) => { if (Array.isArray(j)) setProjects(j); else if (j.projects) setProjects(j.projects); }).catch(() => {});
    authFetch("/api/carpentry/jobs?status=active").then(json).then((j) => { if (j.ok) setCarpJobs(j.jobs || []); }).catch(() => {});
    authFetch("/api/workforce/planner-jobs").then(json).then((j) => {
      if (j.ok) {
        const m = {};
        for (const c of j.jobs || []) m[c.projectId ? `project:${c.projectId}` : `carpentry:${c.carpentryJobId}`] = { color: c.color, onBoard: c.onBoard };
        setSettings(m);
      }
    }).catch(() => {});
  }, []);

  const loadAllocations = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    authFetch(`/api/workforce/allocations?from=${weekFrom}&to=${weekTo}`).then(json)
      .then((j) => { if (j.ok) setAllocations(j.allocations || []); })
      .catch(() => {}).finally(() => { if (!silent) setLoading(false); });
  }, [weekFrom, weekTo]);
  useEffect(() => { loadAllocations(); }, [loadAllocations]);

  const loadNonWorking = useCallback(() => {
    authFetch(`/api/workforce/non-working-days?from=${weekFrom}&to=${weekTo}`).then(json)
      .then((j) => { if (j.ok) setNonWorking({ holidays: j.holidays || [], rdo: j.rdo || [], teamRdo: j.teamRdo || [] }); }).catch(() => {});
  }, [weekFrom, weekTo]);
  useEffect(() => { loadNonWorking(); }, [loadNonWorking]);

  const allocMap = useMemo(() => {
    const m = {};
    for (const a of allocations) m[`${a.employeeId}|${a.allocationDate}`] = a;
    return m;
  }, [allocations]);

  // active jobs (legend), ordered → drives auto colours
  const jobs = useMemo(() => {
    const list = [
      ...projects.map((p) => ({ jKey: `project:${p.id}`, label: p.address || p.name || "(untitled project)" })),
      ...carpJobs.map((c) => ({ jKey: `carpentry:${c.id}`, label: c.address || c.clientName || "(carpentry job)" })),
    ];
    return list;
  }, [projects, carpJobs]);
  // Board membership (W17-P4c, opt-in): a job is on the board if it's been added (onBoard)
  // OR it already has a shift this week (so nothing scheduled ever disappears).
  const allocKeys = useMemo(() => new Set(allocations.map((a) => allocJobKey(a)).filter(Boolean)), [allocations]);
  const boardJobs = useMemo(() => jobs.filter((j) => settings[j.jKey]?.onBoard || allocKeys.has(j.jKey)), [jobs, settings, allocKeys]);
  const orderedKeys = useMemo(() => boardJobs.map((j) => j.jKey), [boardJobs]);
  const colorMap = useMemo(() => { const m = {}; for (const k of Object.keys(settings)) if (settings[k]?.color) m[k] = settings[k].color; return m; }, [settings]);
  const colorFor = useCallback((jKey) => resolveJobColor(jKey, orderedKeys, colorMap), [orderedKeys, colorMap]);
  const labelFor = useCallback((jKey) => jobs.find((j) => j.jKey === jKey)?.label || "Job", [jobs]);
  const holidayMap = useMemo(() => { const m = {}; for (const h of nonWorking.holidays) m[h.date] = h.name; return m; }, [nonWorking]);
  const rdoSet = useMemo(() => new Set(nonWorking.rdo.map((r) => `${r.employeeId}|${r.date}`)), [nonWorking]);
  // Team RDOs apply to EVERY field worker on that date (whole-crew day off) → keyed by date only.
  const teamRdoSet = useMemo(() => new Set((nonWorking.teamRdo || []).map((r) => r.date)), [nonWorking]);
  const nonWorkFor = useCallback((empId, day) =>
    holidayMap[day] ? { kind: "holiday", label: holidayMap[day] }
    : teamRdoSet.has(day) ? { kind: "team", label: "Team RDO" }
    : rdoSet.has(`${empId}|${day}`) ? { kind: "rdo", label: "Rostered day off" }
    : null, [holidayMap, teamRdoSet, rdoSet]);

  const flash = (type, text) => setMsg({ type, text });

  // ── Mutations (advisory: allocation routes only) ───────────────────────────
  // Silent reconcile — never toggles the loading flag, so the grid stays mounted and the
  // page does NOT jump to the top after a move/assign/remove. Optimistic updates make the
  // chip move instantly; we only re-fetch silently to reconcile (or to revert on error).
  const reload = (m) => { if (m) setMsg(m); loadAllocations(true); };

  const create = (empId, day, jKey) =>
    authFetch("/api/workforce/allocations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allocationDate: day, employeeId: empId, ...jobBodyFromKey(jKey) }) }).then(json);
  const del = (id) => authFetch(`/api/workforce/allocations/${id}`, { method: "DELETE" }).then(json);

  async function assignFromLegend(jKey, empId, day) {
    const existing = allocMap[`${empId}|${day}`];
    if (existing && allocJobKey(existing) === jKey) return;
    setMsg(null); setBusy(true);
    const tmp = { id: `tmp-${empId}-${day}-${Date.now()}`, employeeId: empId, allocationDate: day, ...jobBodyFromKey(jKey), notes: null };
    setAllocations((prev) => [...prev.filter((a) => !(a.employeeId === empId && a.allocationDate === day)), tmp]); // optimistic
    try {
      if (existing) { const d = await del(existing.id); if (!d.ok) { setMsg({ type: "error", text: d.error || "Could not replace." }); loadAllocations(true); return; } }
      const r = await create(empId, day, jKey);
      if (!r.ok) { setMsg({ type: "error", text: r.error || "Could not assign." }); loadAllocations(true); return; }
      loadAllocations(true); // reconcile temp id → real id
    } catch { setMsg({ type: "error", text: "Network error." }); loadAllocations(true); } finally { setBusy(false); }
  }

  async function moveChip(alloc, empId, day) {
    if (alloc.employeeId === empId && alloc.allocationDate === day) return;
    const target = allocMap[`${empId}|${day}`];
    if (target) { setBusy(true); setMsg(null); try { await swap(alloc, target); } finally { setBusy(false); } return; }
    setMsg(null); setBusy(true);
    setAllocations((prev) => prev.map((a) => a.id === alloc.id ? { ...a, employeeId: empId, allocationDate: day } : a)); // optimistic instant move
    try {
      const r = await authFetch(`/api/workforce/allocations/${alloc.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allocationDate: day, employeeId: empId }) }).then(json);
      if (!r.ok) { setMsg({ type: "error", text: r.error || "Could not move." }); loadAllocations(true); }
    } catch { setMsg({ type: "error", text: "Network error." }); loadAllocations(true); } finally { setBusy(false); }
  }

  // Swap two cells' jobs. Delete both, recreate both swapped. Any partial failure → reload + clear error.
  async function swap(a, b) {
    const aKey = allocJobKey(a), bKey = allocJobKey(b);
    const da = await del(a.id); if (!da.ok) return reload({ type: "error", text: "Swap failed — nothing changed. Reloaded." });
    const db = await del(b.id); if (!db.ok) return reload({ type: "error", text: "Swap partially failed — reloaded current state." });
    const c1 = await create(b.employeeId, b.allocationDate, aKey); // a's job → b's cell
    const c2 = await create(a.employeeId, a.allocationDate, bKey); // b's job → a's cell
    if (!c1.ok || !c2.ok) return reload({ type: "error", text: "Swap partially failed — reloaded current state. Check the two cells." });
    reload();
  }

  // Fill / deduct across a row: days anchor..end get the job; days end+1..prevRight (this job) are removed.
  async function fillCommit(empId, jKey, anchorIdx, endIdx, prevRightIdx) {
    setBusy(true); setMsg(null);
    try {
      const ops = [];
      for (let i = anchorIdx; i <= endIdx; i++) {
        const cell = allocMap[`${empId}|${days[i]}`];
        if (!cell) ops.push(create(empId, days[i], jKey));
      }
      for (let i = endIdx + 1; i <= prevRightIdx; i++) {
        const cell = allocMap[`${empId}|${days[i]}`];
        if (cell && allocJobKey(cell) === jKey) ops.push(del(cell.id));
      }
      const results = await Promise.all(ops);
      const failed = results.some((r) => !r.ok);
      reload(failed ? { type: "error", text: "Some days could not be updated — reloaded." } : null);
    } catch { reload({ type: "error", text: "Network error during fill." }); } finally { setBusy(false); }
  }

  async function removeAlloc(alloc) {
    setMsg(null); setBusy(true); setNotesPop(null);
    setAllocations((prev) => prev.filter((a) => a.id !== alloc.id)); // optimistic
    try { const r = await del(alloc.id); if (!r.ok) { setMsg({ type: "error", text: r.error || "Could not remove." }); loadAllocations(true); } }
    catch { setMsg({ type: "error", text: "Network error." }); loadAllocations(true); } finally { setBusy(false); }
  }

  async function saveNotes(alloc, notes) {
    setBusy(true);
    try {
      const r = await authFetch(`/api/workforce/allocations/${alloc.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes: notes || null }) }).then(json);
      reload(r.ok ? null : { type: "error", text: r.error || "Could not save note." });
    } catch { reload({ type: "error", text: "Network error." }); } finally { setBusy(false); setNotesPop(null); }
  }

  async function saveColor(jKey, colorKey) {
    setSettings((m) => ({ ...m, [jKey]: { ...(m[jKey] || {}), color: colorKey } })); // optimistic
    setColorPop(null);
    const r = await authFetch("/api/workforce/planner-jobs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...jobBodyFromKey(jKey), color: colorKey }) }).then(json).catch(() => ({}));
    if (!r.ok) flash("error", r.code === "MIGRATION_PENDING" ? "Colour shown but not saved — migration 118 not applied yet." : (r.error || "Colour not saved."));
  }
  async function toggleBoard(jKey, onBoard) {
    setSettings((m) => ({ ...m, [jKey]: { ...(m[jKey] || {}), onBoard } })); // optimistic
    const r = await authFetch("/api/workforce/planner-jobs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...jobBodyFromKey(jKey), onBoard }) }).then(json).catch(() => ({}));
    if (!r.ok) flash("error", r.code === "MIGRATION_PENDING" ? "Board change shown but not saved — migration 118 not applied yet." : (r.error || "Board change not saved."));
  }

  // ── W17-P5: days off (public holidays + RDO) management ────────────────────
  const loadManagement = useCallback(() => {
    authFetch("/api/workforce/public-holidays").then(json).then((j) => { if (j.ok) setHolList(j.holidays || []); }).catch(() => {});
    authFetch("/api/workforce/team-rdo").then(json).then((j) => { if (j.ok) setTeamRdoList(j.teamRdo || []); }).catch(() => {});
    if (dofEmp) authFetch(`/api/workforce/rdo-patterns?employeeId=${dofEmp}`).then(json).then((j) => { if (j.ok) setPatList(j.patterns || []); }).catch(() => {});
    else setPatList([]);
  }, [dofEmp]);
  useEffect(() => { if (daysOffOpen) loadManagement(); }, [daysOffOpen, loadManagement]);

  const dofErr = (r) => flash("error", r.code === "MIGRATION_PENDING" ? "Apply migration 119 to save days off." : (r.error || "Could not save."));
  async function seedSA() {
    const r = await authFetch(`/api/workforce/public-holidays/seed-sa?year=${new Date().getFullYear()}`, { method: "POST" }).then(json).catch(() => ({}));
    if (!r.ok) { dofErr(r); return; }
    flash("success", `Seeded ${r.seeded} SA holidays`); loadManagement(); loadNonWorking();
  }
  async function addHoliday() {
    if (!dof.holDate || !dof.holName) return;
    const r = await authFetch("/api/workforce/public-holidays", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: dof.holDate, name: dof.holName }) }).then(json).catch(() => ({}));
    if (!r.ok) { dofErr(r); return; }
    setDof((s) => ({ ...s, holDate: "", holName: "" })); loadManagement(); loadNonWorking();
  }
  async function delHoliday(id) { await authFetch(`/api/workforce/public-holidays/${id}`, { method: "DELETE" }); loadManagement(); loadNonWorking(); }
  async function addRdoDate() {
    if (!dofEmp || !dof.rdoDate) return;
    const r = await authFetch("/api/workforce/employee-rdo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeId: dofEmp, rdoDate: dof.rdoDate }) }).then(json).catch(() => ({}));
    if (!r.ok) { dofErr(r); return; }
    setDof((s) => ({ ...s, rdoDate: "" })); loadNonWorking();
  }
  const teamErr = (r, verb) => flash("error", r.code === "MIGRATION_PENDING" ? `Apply migration 124 to ${verb} team RDOs.` : (r.error || "Could not save."));
  async function addTeamRdo() {
    if (!dof.teamDate) return;
    const r = await authFetch("/api/workforce/team-rdo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: dof.teamDate }) }).then(json).catch(() => ({}));
    if (!r.ok) { teamErr(r, "save"); return; }
    setDof((s) => ({ ...s, teamDate: "" })); loadManagement(); loadNonWorking();
  }
  async function delTeamRdo(id) { await authFetch(`/api/workforce/team-rdo/${id}`, { method: "DELETE" }); loadManagement(); loadNonWorking(); }
  async function moveTeamRdo(id, date) {
    if (!date) return;
    const r = await authFetch(`/api/workforce/team-rdo/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date }) }).then(json).catch(() => ({}));
    if (!r.ok) { flash("error", r.error || "Could not move."); return; }
    loadManagement(); loadNonWorking();
  }
  async function generateYearlyTeamRdo() {
    const r = await authFetch("/api/workforce/team-rdo/generate-yearly", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ year: new Date().getFullYear() }) }).then(json).catch(() => ({}));
    if (!r.ok) { teamErr(r, "generate"); return; }
    const near = (r.dates || []).filter((d) => d.nearHoliday).length;
    flash("success", `Generated ${r.generated} team RDOs${near ? ` — ${near} near a holiday, review below` : ""}`);
    loadManagement(); loadNonWorking();
  }
  async function addPattern() {
    if (!dofEmp || !dof.patAnchor) return;
    const r = await authFetch("/api/workforce/rdo-patterns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeId: dofEmp, weekday: Number(dof.patWeekday), intervalWeeks: Number(dof.patInterval), anchorDate: dof.patAnchor }) }).then(json).catch(() => ({}));
    if (!r.ok) { dofErr(r); return; }
    setDof((s) => ({ ...s, patAnchor: "" })); loadManagement(); loadNonWorking();
  }
  async function delPattern(id) { await authFetch(`/api/workforce/rdo-patterns/${id}`, { method: "DELETE" }); loadManagement(); loadNonWorking(); }

  // ── DnD wiring ─────────────────────────────────────────────────────────────
  function onDragEnd(evt) {
    const { active, over } = evt;
    setActiveDrag(null);
    if (!over) return;
    const a = active.data.current, o = over.data.current;
    if (!o || o.kind !== "cell") return;
    if (a.kind === "legend") assignFromLegend(a.jKey, o.empId, o.day);
    else if (a.kind === "chip") moveChip(a.alloc, o.empId, o.day);
  }

  // ── Fill-handle custom pointer session ─────────────────────────────────────
  function startFill(alloc, e) {
    const jKey = allocJobKey(alloc);
    const empId = alloc.employeeId;
    const dIdx = days.indexOf(alloc.allocationDate);
    let anchorIdx = dIdx, prevRightIdx = dIdx;
    while (anchorIdx > 0 && allocJobKey(allocMap[`${empId}|${days[anchorIdx - 1]}`]) === jKey) anchorIdx--;
    while (prevRightIdx < 6 && allocJobKey(allocMap[`${empId}|${days[prevRightIdx + 1]}`]) === jKey) prevRightIdx++;
    setFill({ empId, jKey, anchorIdx, endIdx: prevRightIdx, prevRightIdx });
    e.target.setPointerCapture?.(e.pointerId);
    const onMove = (ev) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-cell]");
      const f = fillRef.current; if (!f || !el) return;
      if (el.getAttribute("data-empid") !== f.empId) return;
      const idx = Number(el.getAttribute("data-dayidx"));
      const endIdx = Math.max(f.anchorIdx, idx);
      if (endIdx !== f.endIdx) setFill({ ...f, endIdx });
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      const f = fillRef.current;
      setFill(null);
      if (f) fillCommit(f.empId, f.jKey, f.anchorIdx, f.endIdx, f.prevRightIdx);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  // Duplicate downwards: copy a shift down the day-column to other workers (drag back up = deduct).
  async function fillDownCommit(day, jKey, anchorRow, endRow, prevBottomRow) {
    setBusy(true); setMsg(null);
    try {
      const ops = [];
      for (let r = anchorRow; r <= endRow; r++) {
        const emp = employees[r]; if (!emp) continue;
        if (!allocMap[`${emp.id}|${day}`]) ops.push(create(emp.id, day, jKey));
      }
      for (let r = endRow + 1; r <= prevBottomRow; r++) {
        const emp = employees[r]; if (!emp) continue;
        const cell = allocMap[`${emp.id}|${day}`];
        if (cell && allocJobKey(cell) === jKey) ops.push(del(cell.id));
      }
      const results = await Promise.all(ops);
      reload(results.some((r) => !r.ok) ? { type: "error", text: "Some workers could not be updated — reloaded." } : null);
    } catch { reload({ type: "error", text: "Network error during duplicate." }); } finally { setBusy(false); }
  }

  function startFillDown(alloc, e) {
    const jKey = allocJobKey(alloc), day = alloc.allocationDate, dayIdx = days.indexOf(day);
    let anchorRow = employees.findIndex((emp) => emp.id === alloc.employeeId);
    if (anchorRow < 0) return;
    let prevBottomRow = anchorRow;
    while (anchorRow > 0 && allocJobKey(allocMap[`${employees[anchorRow - 1].id}|${day}`]) === jKey) anchorRow--;
    while (prevBottomRow < employees.length - 1 && allocJobKey(allocMap[`${employees[prevBottomRow + 1].id}|${day}`]) === jKey) prevBottomRow++;
    setFillDown({ day, dayIdx, jKey, anchorRow, endRow: prevBottomRow, prevBottomRow });
    e.target.setPointerCapture?.(e.pointerId);
    const onMove = (ev) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-cell]");
      const f = fillDownRef.current; if (!f || !el) return;
      if (Number(el.getAttribute("data-dayidx")) !== f.dayIdx) return;
      const row = employees.findIndex((emp) => emp.id === el.getAttribute("data-empid"));
      if (row < 0) return;
      const endRow = Math.max(f.anchorRow, row);
      if (endRow !== f.endRow) setFillDown({ ...f, endRow });
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      const f = fillDownRef.current;
      setFillDown(null);
      if (f) fillDownCommit(f.day, f.jKey, f.anchorRow, f.endRow, f.prevBottomRow);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  function openNotes(alloc, e) {
    const wrap = gridRef.current?.getBoundingClientRect();
    const r = e.currentTarget.getBoundingClientRect();
    setNotesPop({ alloc, value: alloc.notes || "", x: r.left - (wrap?.left || 0), y: r.bottom - (wrap?.top || 0) + 4 });
  }
  function openColor(jKey, e) {
    const wrap = gridRef.current?.getBoundingClientRect();
    const r = e.currentTarget.getBoundingClientRect();
    setColorPop({ jKey, x: r.left - (wrap?.left || 0), y: r.bottom - (wrap?.top || 0) + 4 });
  }

  const weekLabel = `${new Date(`${weekFrom}T12:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" })} – ${new Date(`${weekTo}T12:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`;
  const fillCovers = (empId, idx) => fill && fill.empId === empId && idx >= fill.anchorIdx && idx <= fill.endIdx;
  const fillDownCovers = (empId, day) => {
    if (!fillDown || fillDown.day !== day) return false;
    const row = employees.findIndex((emp) => emp.id === empId);
    return row >= fillDown.anchorRow && row <= fillDown.endRow;
  };

  return (
    <DndContext sensors={sensors} onDragStart={(e) => setActiveDrag(e.active.data.current)} onDragEnd={onDragEnd} onDragCancel={() => setActiveDrag(null)}>
      <div ref={gridRef} className="relative" onClick={() => { setNotesPop(null); setColorPop(null); }}>
        <div className="bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded-lg px-3 py-2 mb-3">
          Planner is advisory only. It does not create timesheets, approve hours, or sync anything to Buildexact.
        </div>

        {/* Legend — only jobs on the board (opt-in) + any job allocated this week */}
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="text-xs text-muted mr-1">Jobs:</span>
          {boardJobs.length === 0 ? <span className="text-xs text-muted">No jobs on the board yet — add some.</span>
            : boardJobs.map((j) => <LegendChip key={j.jKey} jKey={j.jKey} label={j.label} color={colorFor(j.jKey)} pinned={!!settings[j.jKey]?.onBoard} onPickColor={openColor} onRemove={() => toggleBoard(j.jKey, false)} />)}
          <button type="button" onClick={(e) => { e.stopPropagation(); setAddOpen((v) => !v); }} className="text-xs text-primary border border-dashed border-primary/40 rounded-full px-2.5 py-1">+ Add jobs</button>
          <button type="button" onClick={(e) => { e.stopPropagation(); setDaysOffOpen((v) => !v); }} className="text-xs text-muted border border-dashed border-hairline rounded-full px-2.5 py-1">Days off</button>
        </div>
        {addOpen && (
          <div className="border border-hairline rounded-lg bg-white p-2 mb-3 max-w-md" onClick={(e) => e.stopPropagation()}>
            <input autoFocus value={addSearch} onChange={(e) => setAddSearch(e.target.value)} placeholder="Search jobs…" className="w-full border border-hairline rounded px-2 py-1 text-sm mb-2" />
            <div className="max-h-48 overflow-y-auto divide-y divide-hairline">
              {jobs.filter((j) => j.label.toLowerCase().includes(addSearch.toLowerCase())).slice(0, 200).map((j) => {
                const on = !!settings[j.jKey]?.onBoard;
                const allocated = allocKeys.has(j.jKey);
                return (
                  <label key={j.jKey} className="flex items-center gap-2 py-1.5 text-sm cursor-pointer">
                    <input type="checkbox" checked={on} onChange={(e) => toggleBoard(j.jKey, e.target.checked)} />
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: colorFor(j.jKey).dot }} />
                    <span className="truncate flex-1">{j.label}</span>
                    {allocated && !on && <span className="text-[10px] text-muted shrink-0">scheduled</span>}
                    <span className="text-[10px] text-muted shrink-0">{j.jKey.startsWith("carpentry") ? "Carpentry" : "Construction"}</span>
                  </label>
                );
              })}
              {jobs.length === 0 && <p className="text-xs text-muted py-2">No active jobs.</p>}
            </div>
            <p className="text-[10px] text-muted mt-1">Jobs with a shift this week always show on the board.</p>
          </div>
        )}
        {daysOffOpen && (
          <div className="border border-hairline rounded-lg bg-white p-3 mb-3 max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-6 flex-wrap">
              <div className="flex-1 min-w-[240px]">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-ink">Team RDOs <span className="font-normal text-muted">(whole crew)</span></p>
                  <button type="button" onClick={generateYearlyTeamRdo} className="text-[11px] text-primary underline">Generate {new Date().getFullYear()} · last Fri</button>
                </div>
                <div className="flex gap-1.5 mb-2">
                  <input type="date" value={dof.teamDate} onChange={(e) => setDof((s) => ({ ...s, teamDate: e.target.value }))} className="border border-hairline rounded px-2 py-1 text-xs" />
                  <button type="button" onClick={addTeamRdo} className="text-xs px-2 py-1 rounded bg-primary text-white">Add date</button>
                </div>
                <div className="max-h-32 overflow-y-auto text-xs divide-y divide-hairline">
                  {teamRdoList.length === 0 ? <p className="text-muted py-1">No team RDOs — add one or generate the year.</p>
                    : teamRdoList.map((t) => {
                      const near = holList.find((h) => Math.abs((new Date(`${t.date}T12:00:00`) - new Date(`${h.date}T12:00:00`)) / 86400000) <= 3);
                      return (
                        <div key={t.id} className="flex items-center justify-between py-1 gap-2">
                          <input type="date" value={t.date} onChange={(e) => moveTeamRdo(t.id, e.target.value)} className="border border-hairline rounded px-1.5 py-0.5 text-xs" title="Change the date to move this team RDO" />
                          {near ? <span className="text-[10px] text-amber-600 shrink-0" title={`Near ${near.name}`}>near {near.name}</span> : null}
                          <button type="button" onClick={() => delTeamRdo(t.id)} className="text-muted shrink-0">×</button>
                        </div>
                      );
                    })}
                </div>
              </div>
              <div className="flex-1 min-w-[240px]">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-ink">Public holidays</p>
                  <button type="button" onClick={seedSA} className="text-[11px] text-primary underline">Seed SA {new Date().getFullYear()}</button>
                </div>
                <div className="flex gap-1.5 mb-2">
                  <input type="date" value={dof.holDate} onChange={(e) => setDof((s) => ({ ...s, holDate: e.target.value }))} className="border border-hairline rounded px-2 py-1 text-xs" />
                  <input value={dof.holName} onChange={(e) => setDof((s) => ({ ...s, holName: e.target.value }))} placeholder="Name" className="border border-hairline rounded px-2 py-1 text-xs flex-1 min-w-0" />
                  <button type="button" onClick={addHoliday} className="text-xs px-2 py-1 rounded bg-primary text-white">Add</button>
                </div>
                <div className="max-h-32 overflow-y-auto text-xs divide-y divide-hairline">
                  {holList.length === 0 ? <p className="text-muted py-1">None yet — seed SA or add one.</p>
                    : holList.map((h) => <div key={h.id} className="flex items-center justify-between py-1 gap-2"><span className="truncate">{h.date} · {h.name}</span><button type="button" onClick={() => delHoliday(h.id)} className="text-muted shrink-0">×</button></div>)}
                </div>
              </div>
              <div className="flex-1 min-w-[260px]">
                <p className="text-xs font-semibold text-ink mb-1.5">Rostered days off</p>
                <select value={dofEmp} onChange={(e) => setDofEmp(e.target.value)} className="w-full border border-hairline rounded px-2 py-1 text-xs mb-2">
                  <option value="">Select an employee…</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                {dofEmp && (
                  <>
                    <div className="flex gap-1.5 mb-2 items-center">
                      <input type="date" value={dof.rdoDate} onChange={(e) => setDof((s) => ({ ...s, rdoDate: e.target.value }))} className="border border-hairline rounded px-2 py-1 text-xs" />
                      <button type="button" onClick={addRdoDate} className="text-xs px-2 py-1 rounded border border-hairline">Add one-off</button>
                    </div>
                    <div className="flex gap-1.5 mb-2 items-center flex-wrap">
                      <span className="text-[11px] text-muted">Every</span>
                      <select value={dof.patInterval} onChange={(e) => setDof((s) => ({ ...s, patInterval: e.target.value }))} className="border border-hairline rounded px-1.5 py-1 text-xs">{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select>
                      <span className="text-[11px] text-muted">wk(s) on</span>
                      <select value={dof.patWeekday} onChange={(e) => setDof((s) => ({ ...s, patWeekday: e.target.value }))} className="border border-hairline rounded px-1.5 py-1 text-xs">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w, i) => <option key={i} value={i}>{w}</option>)}</select>
                      <span className="text-[11px] text-muted">from</span>
                      <input type="date" value={dof.patAnchor} onChange={(e) => setDof((s) => ({ ...s, patAnchor: e.target.value }))} className="border border-hairline rounded px-2 py-1 text-xs" />
                      <button type="button" onClick={addPattern} className="text-xs px-2 py-1 rounded border border-hairline">Add pattern</button>
                    </div>
                    <div className="max-h-24 overflow-y-auto text-xs divide-y divide-hairline">
                      {patList.length === 0 ? <p className="text-muted py-1">No recurring RDO patterns.</p>
                        : patList.map((p) => <div key={p.id} className="flex items-center justify-between py-1 gap-2"><span>Every {p.intervalWeeks} wk(s) · {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][p.weekday]} · from {p.anchorDate}</span><button type="button" onClick={() => delPattern(p.id)} className="text-muted shrink-0">×</button></div>)}
                    </div>
                  </>
                )}
              </div>
            </div>
            <p className="text-[10px] text-muted mt-2">Display only — greyed cells do not block allocations or affect timesheets.</p>
          </div>
        )}

        {/* Week nav */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setMonday(addDays(monday, -7))} className="px-2.5 py-1 rounded border border-hairline text-sm">←</button>
            <span className="text-sm font-medium text-ink">Week of {weekLabel}</span>
            <button type="button" onClick={() => setMonday(addDays(monday, 7))} className="px-2.5 py-1 rounded border border-hairline text-sm">→</button>
            <button type="button" onClick={() => setMonday(mondayOf(new Date()))} className="text-xs text-primary underline ml-1">This week</button>
          </div>
          <span className="text-xs text-muted">{allocations.length} allocation(s){busy ? " · saving…" : ""}</span>
        </div>

        {msg && <p className={`text-xs mb-2 ${msg.type === "error" ? "text-red-600" : "text-green-600"}`}>{msg.text}</p>}

        {loading ? <p className="text-sm text-muted">Loading planner…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-2 pr-1 sm:pr-3 font-medium">Employee</th>
                  {days.map((d, i) => <th key={d} className={`py-2 px-1 font-medium text-center whitespace-nowrap ${i >= 5 ? "hidden sm:table-cell" : ""}`}><span className="sm:hidden">{DOW[i][0]} {new Date(`${d}T12:00:00`).getDate()}</span><span className="hidden sm:inline">{DOW[i]} {new Date(`${d}T12:00:00`).getDate()}</span></th>)}
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp.id} className="border-t border-hairline">
                    <td className="py-2 pr-1 sm:pr-3 text-ink max-w-[72px] sm:max-w-none truncate" title={emp.name}>{emp.name}{emp.is_leading_hand && <span className="ml-1 text-amber-500" title="Leading hand">⭐</span>}</td>
                    {days.map((d, i) => {
                      const a = allocMap[`${emp.id}|${d}`];
                      const jKey = a && allocJobKey(a);
                      return (
                        <DayCell key={d} empId={emp.id} day={d} dayIdx={i} fillActive={fillCovers(emp.id, i) || fillDownCovers(emp.id, d)} nonWork={nonWorkFor(emp.id, d)} className={i >= 5 ? "hidden sm:table-cell" : ""}>
                          {a ? (
                            <div className="relative w-full h-full">
                              <ShiftChip alloc={a} label={labelFor(jKey)} color={colorFor(jKey)} onClick={openNotes} onFillStart={startFill} onFillDownStart={startFillDown} />
                              <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); removeAlloc(a); }}
                                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white border border-hairline text-muted text-[10px] leading-none opacity-0 hover:opacity-100 focus:opacity-100" title="Remove" aria-label="Remove allocation">×</button>
                            </div>
                          ) : null}
                        </DayCell>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && employees.length === 0 && <p className="text-sm text-muted mt-4">No active employees.</p>}

        {/* Notes popover */}
        {notesPop && (
          <div className="absolute z-20 bg-white border border-hairline rounded-lg shadow-lg p-2 w-56" style={{ left: Math.max(0, notesPop.x), top: notesPop.y }} onClick={(e) => e.stopPropagation()}>
            <p className="text-[11px] text-muted mb-1">Notes · {notesPop.alloc.employeeName || ""} · {longDate(notesPop.alloc.allocationDate)}</p>
            <input autoFocus value={notesPop.value} onChange={(e) => setNotesPop({ ...notesPop, value: e.target.value })} className="w-full border border-hairline rounded px-2 py-1 text-sm" placeholder="e.g. AM only" />
            <div className="flex items-center gap-2 mt-2">
              <button type="button" onClick={() => saveNotes(notesPop.alloc, notesPop.value)} className="px-2.5 py-1 rounded bg-primary text-white text-xs">Save</button>
              <button type="button" onClick={() => removeAlloc(notesPop.alloc)} className="px-2.5 py-1 rounded border border-red-200 text-red-600 text-xs">Remove shift</button>
              <button type="button" onClick={() => setNotesPop(null)} className="text-xs text-muted ml-auto">Close</button>
            </div>
          </div>
        )}

        {/* Colour picker popover */}
        {colorPop && (
          <div className="absolute z-20 bg-white border border-hairline rounded-lg shadow-lg p-2" style={{ left: Math.max(0, colorPop.x), top: colorPop.y }} onClick={(e) => e.stopPropagation()}>
            <p className="text-[11px] text-muted mb-1.5">{labelFor(colorPop.jKey)} colour</p>
            <div className="grid grid-cols-5 gap-1.5">
              {PLANNER_PALETTE.map((p) => (
                <button key={p.key} type="button" onClick={() => saveColor(colorPop.jKey, p.key)} className="w-6 h-6 rounded border border-black/10" style={{ background: p.dot }} title={p.label} aria-label={p.label} />
              ))}
            </div>
          </div>
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDrag ? (() => {
          const k = activeDrag.kind === "legend" ? activeDrag.jKey : allocJobKey(activeDrag.alloc);
          const c = colorFor(k);
          return <div className="rounded px-2 py-1 text-[11px] flex items-center gap-1 shadow-lg border" style={{ background: c.bg, color: c.text, borderColor: c.dot }}><span className="w-1.5 h-1.5 rounded-sm" style={{ background: c.dot }} />{labelFor(k)}</div>;
        })() : null}
      </DragOverlay>
    </DndContext>
  );
}
