import { useState, useEffect } from "react";
import { useAuth } from "../../lib/useAuth.js";
import { authFetch } from "../../lib/authFetch.js";
import { PERSONAS, MODULES, CAPABILITIES, CURATED_ROUTES, gateFor } from "../../lib/roleAccess.js";

// HUB-QA-ROLE-PREVIEW — Developer Tools → Role Preview Console (admin-only, read-only).
// Staff matrix is driven by the live roles.js can.* rules. Worker (P3) + Client (P4)
// previews reuse existing admin-authed read routes — never a real worker/client token.

const json = (r) => r.json().catch(() => ({}));

function Pill({ on, onText = "Visible", offText = "Hidden" }) {
  if (on === null || on === undefined) return <span className="text-[11px] text-muted">n/a</span>;
  return on
    ? <span className="text-[11px] font-medium bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{onText}</span>
    : <span className="text-[11px] font-medium bg-red-50 text-red-500 px-1.5 py-0.5 rounded">{offText}</span>;
}

function Rows({ items, valueFor, onText, offText }) {
  return (
    <div className="border border-hairline rounded-lg divide-y divide-hairline">
      {items.map((it, i) => (
        <div key={i} className="flex items-start justify-between gap-3 px-3 py-1.5">
          <div className="min-w-0">
            <span className="text-sm text-ink">{it.label}</span>
            {it.note && <span className="block text-[11px] text-muted">{it.note}</span>}
          </div>
          <Pill on={valueFor(it)} onText={onText} offText={offText} />
        </div>
      ))}
    </div>
  );
}

// ── Phase 3: live "preview as worker" — reuses the W17-P3 read routes ──────────
function WorkerPreview() {
  const [emps, setEmps] = useState([]);
  const [empId, setEmpId] = useState("");
  const [jobs, setJobs] = useState([]);
  const [jobKey, setJobKey] = useState("");
  const [tasks, setTasks] = useState([]);
  const [today, setToday] = useState(null);

  useEffect(() => {
    authFetch("/api/workforce/employees").then(json).then((j) => { if (j.ok) setEmps((j.employees || []).filter((e) => e.is_active)); }).catch(() => {});
  }, []);
  useEffect(() => {
    setJobKey(""); setTasks([]); setToday(null); setJobs([]);
    if (!empId) return;
    authFetch(`/api/workforce/employees/${empId}/task-preview`).then(json).then((j) => { if (j.ok) setJobs(j.jobs || []); }).catch(() => {});
    authFetch(`/api/workforce/employees/${empId}/preview`).then(json).then((j) => { if (j.ok) setToday(j.today_timesheet || null); }).catch(() => {});
  }, [empId]);
  useEffect(() => {
    if (!empId || !jobKey) { setTasks([]); return; }
    const [type, id] = jobKey.split(":");
    authFetch(`/api/workforce/employees/${empId}/task-preview?jobId=${encodeURIComponent(id)}&jobType=${encodeURIComponent(type)}`).then(json).then((j) => { if (j.ok) setTasks(j.tasks || []); }).catch(() => {});
  }, [empId, jobKey]);

  return (
    <div className="mt-4 border-t border-hairline pt-4">
      <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Live preview as worker <span className="normal-case font-normal">(reuses the read-only Workforce preview — no token)</span></p>
      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        <select value={empId} onChange={(e) => setEmpId(e.target.value)} className="flex-1 border border-hairline rounded-lg px-3 py-2 text-sm">
          <option value="">Pick a worker…</option>
          {emps.map((e) => <option key={e.id} value={e.id}>{e.name}{e.is_leading_hand ? " ⭐" : ""}</option>)}
        </select>
        <select value={jobKey} onChange={(e) => setJobKey(e.target.value)} disabled={!empId || !jobs.length} className="flex-1 border border-hairline rounded-lg px-3 py-2 text-sm disabled:opacity-50">
          <option value="">{empId ? (jobs.length ? "Pick a job…" : "No visible jobs") : "Pick a worker first"}</option>
          {jobs.map((j) => <option key={`${j.type}:${j.id}`} value={`${j.type}:${j.id}`}>{j.address} ({j.type === "carpentry" ? "Carpentry" : "Construction"})</option>)}
        </select>
      </div>
      {empId && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="border border-hairline rounded-lg p-3">
            <p className="text-xs text-muted mb-1">Today</p>
            {today ? <p className="text-ink capitalize">{(today.status || "—").replace(/_/g, " ")}</p> : <p className="text-muted">No timesheet today</p>}
          </div>
          <div className="md:col-span-2 border border-hairline rounded-lg p-3">
            <p className="text-xs text-muted mb-1">Tasks they would see{jobKey ? ` · ${tasks.length}` : ""}</p>
            {!jobKey ? <p className="text-muted">Pick a job.</p>
              : tasks.length === 0 ? <p className="text-muted">No tasks for this worker on this job.</p>
                : <ul className="space-y-0.5">{tasks.map((t) => <li key={t.id} className="text-ink truncate">• {t.title}{t.task_audience === "supervisor" ? <span className="ml-1 text-[9px] bg-amber-100 text-amber-700 px-1 rounded">QC</span> : null}</li>)}</ul>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Phase 4: live "preview as client" — reuses the portal admin overview read ──
function ClientPreview() {
  const [projects, setProjects] = useState([]);
  const [pid, setPid] = useState("");
  const [ov, setOv] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    authFetch("/api/operations/projects").then(json).then((j) => { if (Array.isArray(j)) setProjects(j); else if (j.projects) setProjects(j.projects); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!pid) { setOv(null); return; }
    setLoading(true);
    authFetch(`/api/portal/admin/v2/${pid}/overview`).then(json).then((j) => { if (j.ok) setOv(j); else setOv(null); }).catch(() => {}).finally(() => setLoading(false));
  }, [pid]);

  const Count = ({ label, n }) => <div className="border border-hairline rounded-lg p-2 text-center"><p className="text-base font-semibold text-ink">{n}</p><p className="text-[11px] text-muted">{label}</p></div>;

  return (
    <div className="mt-4 border-t border-hairline pt-4">
      <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Live preview as client <span className="normal-case font-normal">(reuses the portal admin overview — read-only, no client token)</span></p>
      <select value={pid} onChange={(e) => setPid(e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm mb-3">
        <option value="">Pick a project…</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.address || p.name || p.id}</option>)}
      </select>
      {loading ? <p className="text-sm text-muted">Loading…</p> : ov && (
        <div className="space-y-3 text-sm">
          <div className="border border-hairline rounded-lg p-3">
            <p className="text-ink">{ov.project?.address || "—"}</p>
            <p className="text-xs text-muted">Portal: {ov.project?.portalV2Enabled ? "v2 enabled" : ov.project?.portalEnabled ? "enabled" : "off"} · build phase: {ov.project?.buildPhase || "—"} · client: {ov.project?.portalClientName || ov.project?.portalClientEmail || "—"}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Count label="Milestones" n={(ov.milestones || []).length} />
            <Count label="Selections" n={(ov.selections || []).length} />
            <Count label="Meetings" n={(ov.meetings || []).length} />
            <Count label="Open actions" n={(ov.openActions || []).length} />
            <Count label="Client users" n={(ov.clients || []).length} />
          </div>
          {(ov.openActions || []).length > 0 && (
            <div className="border border-hairline rounded-lg p-3">
              <p className="text-xs text-muted mb-1">Actions awaiting the client</p>
              <ul className="space-y-0.5">{ov.openActions.map((a) => <li key={a.id} className="text-ink truncate">• {a.title} <span className="text-[10px] text-muted">({a.status})</span></li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RolePreviewConsole() {
  const { role } = useAuth();
  const [sel, setSel] = useState("supervisor");
  if (role !== "admin") return null; // admin / developer only

  const persona = PERSONAS.find((p) => p.key === sel) || PERSONAS[0];
  const dbRole = persona.dbRole;
  const isWorker = persona.key === "worker" || persona.key === "leading_hand";
  const isClient = persona.key === "client" || persona.key === "client_rep";

  return (
    <section className="rounded-card border border-hairline bg-surface p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-base font-semibold text-ink">Developer Tools — Role Preview Console</h2>
        <span className="text-[10px] uppercase tracking-wide bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">Admin</span>
      </div>
      <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2 my-3">
        Read-only preview · not real auth. Shows what a role can see and do across the Hub. It does not log you in as that role, never uses a real worker/client token, and changes nothing.
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1">
          <label className="text-xs text-muted block mb-1">Role / persona</label>
          <select value={sel} onChange={(e) => setSel(e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm">
            {PERSONAS.map((p) => (
              <option key={p.key} value={p.key}>{p.label}{p.tier === "data" ? " — data only" : p.tier === "partial" ? " — flag" : ""}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="border border-hairline rounded-lg p-3 mb-4 text-sm">
        <p className="text-xs text-muted">Auth model</p>
        <p className="text-ink">{persona.auth} · <span className="text-muted">{persona.identity}</span></p>
        <p className="text-muted text-xs mt-1">{persona.note}</p>
      </div>

      {dbRole ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Modules <span className="normal-case font-normal">(live from roles.js)</span></p>
            <Rows items={MODULES} valueFor={(m) => gateFor(persona, m.gate)} onText="Visible" offText="Hidden" />
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Actions <span className="normal-case font-normal">(live)</span></p>
              <Rows items={CAPABILITIES} valueFor={(c) => gateFor(persona, c.gate)} onText="Allowed" offText="Blocked" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Route gating <span className="normal-case font-normal">(documented)</span></p>
              <Rows items={CURATED_ROUTES} valueFor={(r) => r.allow.includes(dbRole)} onText="Allowed" offText="Blocked" />
            </div>
          </div>
        </div>
      ) : persona.tier === "data" ? (
        <div className="border border-hairline rounded-lg p-3 text-sm text-muted">
          This persona is data-only — it has no login/auth path yet, so there is nothing to preview. It would need a real auth path before it can be modelled here.
        </div>
      ) : null}

      {isWorker && <WorkerPreview />}
      {isClient && <ClientPreview />}

      <p className="text-[11px] text-muted mt-3">
        Phases 1–6 shipped: inventory, Developer Tools shell, live access matrix, worker preview, client-portal preview, and drift/authz tests (<code>test:qa-role-preview</code> + <code>test:qa-role-preview-drift</code>). See <code>docs/qa/HUB_QA_ROLE_PREVIEW_CONSOLE.md</code>.
      </p>
    </section>
  );
}
