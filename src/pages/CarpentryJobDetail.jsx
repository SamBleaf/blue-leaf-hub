import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { apiFetch, apiPatch, apiPost, apiDelete } from "../lib/apiFetch.js";
import { useAuth } from "../lib/useAuth.js";
import { can } from "../lib/roles.js";
import ChargeUpJobDetail from "./ChargeUpJobDetail.jsx";
import {
  CARPENTRY_JOB_STATUS_LABELS,
  CARPENTRY_PROJECT_TYPES,
  CARPENTRY_PROJECT_TYPE_LABELS,
  CARPENTRY_COST_TYPES,
  CARPENTRY_COST_TYPE_LABELS,
  CHARGE_UP_REFERENCE,
} from "../lib/constants.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt$(n) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
}
function fmtPct(n) { return n != null ? `${Number(n).toFixed(1)}%` : "—"; }
function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt) ? d : dt.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_BADGE = {
  active:    "bg-emerald-100 text-emerald-800",
  on_hold:   "bg-amber-100   text-amber-800",
  defects:   "bg-orange-100  text-orange-800",
  complete:  "bg-blue-100    text-blue-800",
  cancelled: "bg-gray-100    text-gray-500",
};

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted mb-0.5">{label}</p>
      <p className="text-sm text-ink">{value || <span className="text-muted">—</span>}</p>
    </div>
  );
}

// ── Closeout Modal ────────────────────────────────────────────────────────────

function CloseoutModal({ job, onClose, onConfirm }) {
  const [summary, setSummary]           = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [lessonsLearned, setLessonsLearned] = useState("");
  const [closing, setClosing]           = useState(false);
  const [error, setError]               = useState(null);

  useEffect(() => {
    apiFetch(`/api/carpentry/jobs/${job.id}/summary`).then(({ ok, data }) => {
      setLoadingSummary(false);
      if (ok) setSummary(data?.summary || null);
    });
  }, [job.id]);

  async function handleClose() {
    setClosing(true);
    setError(null);
    const { ok, error: e } = await apiPost(`/api/carpentry/jobs/${job.id}/closeout`, {
      lessonsLearned: lessonsLearned.trim() || null,
    });
    setClosing(false);
    if (!ok) { setError(e || "Could not close job."); return; }
    onConfirm();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
        <h3 className="text-base font-semibold text-ink mb-1">Close Job — {job.reference}</h3>
        <p className="text-sm text-muted mb-4">This will mark the job complete and lock editing. You cannot undo this without contacting an admin.</p>

        {loadingSummary ? (
          <div className="text-sm text-muted py-4 text-center">Loading summary…</div>
        ) : summary ? (
          <div className="bg-slate-50 rounded-lg border border-hairline p-4 mb-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted mb-0.5">Revenue</p>
              <p className="font-semibold text-ink">{summary.revenue ? new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(summary.revenue) : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted mb-0.5">Total Actual Cost</p>
              <p className="font-semibold text-ink">{summary.totalActual != null ? new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(summary.totalActual) : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted mb-0.5">Forecast Margin</p>
              <p className={`font-semibold ${summary.forecastMarginPct != null && summary.forecastMarginPct < 0 ? "text-red-600" : "text-emerald-700"}`}>
                {summary.forecastMarginPct != null ? `${Number(summary.forecastMarginPct).toFixed(1)}%` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted mb-0.5">vs Budget</p>
              <p className={`font-semibold ${summary.variance != null && summary.variance < 0 ? "text-red-600" : "text-emerald-700"}`}>
                {summary.variance != null ? `${summary.variance >= 0 ? "+" : ""}${Number(summary.variance).toFixed(1)}%` : "—"}
              </p>
            </div>
          </div>
        ) : null}

        <div className="mb-4">
          <label className="block text-xs font-medium text-ink mb-1">Lessons learned <span className="text-muted font-normal">(optional)</span></label>
          <textarea
            value={lessonsLearned}
            onChange={(e) => setLessonsLearned(e.target.value)}
            rows={2}
            placeholder="What went well? What would you do differently?"
            className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring resize-none"
          />
        </div>

        {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-3">{error}</div>}

        <div className="flex gap-2">
          <button
            onClick={handleClose}
            disabled={closing}
            className="flex-1 py-2.5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent/90 disabled:opacity-40 transition-colors"
          >
            {closing ? "Closing…" : "Confirm — Close Job"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg border border-hairline text-sm text-ink hover:bg-gray-50 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ job, performance, onUpdated, onStatusChange, onDeleted, showCost = true }) {
  const [editing, setEditing]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [closeoutOpen, setCloseoutOpen] = useState(false);
  const [form, setForm]         = useState(null);

  // Jobs can always be edited — completed/cancelled shows a warning banner only
  const isClosedStatus = job.status === "complete" || job.status === "cancelled";

  function startEdit() {
    setForm({
      clientName:    job.clientName    || "",
      clientContact: job.clientContact || "",
      clientPhone:   job.clientPhone   || "",
      clientEmail:   job.clientEmail   || "",
      address:       job.address       || "",
      description:   job.description   || "",
      projectType:   job.projectType   || CARPENTRY_PROJECT_TYPES.FULL_PACKAGE,
      quotedValue:   job.quotedValue   != null ? String(job.quotedValue)  : "",
      quotedCost:    job.quotedCost    != null ? String(job.quotedCost)   : "",
      quotedMarginPct: job.quotedMarginPct != null ? String(job.quotedMarginPct) : "",
      startDate:     job.startDate     || "",
      endDate:       job.endDate       || "",
      floorAreaM2:   job.floorAreaM2   != null ? String(job.floorAreaM2) : "",
      storeyCount:   job.storeyCount   != null ? String(job.storeyCount) : "1",
      notes:         job.notes         || "",
    });
    setEditing(true);
  }

  function cancelEdit() { setEditing(false); setError(null); setForm(null); }
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true);
    setError(null);
    const { ok, error: e } = await apiPatch(`/api/carpentry/jobs/${job.id}`, {
      ...form,
      quotedValue:     form.quotedValue     ? Number(form.quotedValue)    : null,
      quotedCost:      form.quotedCost      ? Number(form.quotedCost)     : null,
      quotedMarginPct: form.quotedMarginPct ? Number(form.quotedMarginPct): null,
      floorAreaM2:     form.floorAreaM2     ? Number(form.floorAreaM2)    : null,
      storeyCount:     form.storeyCount     ? Number(form.storeyCount)    : 1,
      startDate:       form.startDate       || null,
      endDate:         form.endDate         || null,
    });
    setSaving(false);
    if (!ok) { setError(e || "Save failed."); return; }
    onUpdated();
    setEditing(false);
  }

  async function changeStatus(newStatus) {
    setStatusSaving(true);
    const { ok, error: e } = await apiPatch(`/api/carpentry/jobs/${job.id}/status`, { status: newStatus });
    setStatusSaving(false);
    if (!ok) { setError(e || "Status change failed."); return; }
    onStatusChange(newStatus);
  }

  async function deleteJob() {
    if (!confirm(`Delete carpentry job "${job.reference || job.clientName}"?\n\nThis permanently removes the job and its budget, milestones, costs and diary. It cannot be undone.`)) return;
    setStatusSaving(true);
    const { ok, error: e } = await apiDelete(`/api/carpentry/jobs/${job.id}`);
    setStatusSaving(false);
    if (!ok) { setError(e || "Delete failed."); return; }
    onDeleted?.();
  }

  if (editing && form) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-ink">Edit Job Details</h3>
          <div className="flex gap-2">
            <button onClick={cancelEdit} className="px-3 py-1.5 text-xs border border-hairline rounded-lg text-muted hover:text-ink transition-colors">Cancel</button>
            <button onClick={save} disabled={saving} className="px-4 py-1.5 text-xs rounded-lg bg-accent text-white font-medium hover:bg-accent/90 disabled:opacity-40 transition-colors">
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
        {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Client name *</label>
            <input value={form.clientName} onChange={(e) => set("clientName", e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Contact person</label>
            <input value={form.clientContact} onChange={(e) => set("clientContact", e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Phone</label>
            <input value={form.clientPhone} onChange={(e) => set("clientPhone", e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Email</label>
            <input type="email" value={form.clientEmail} onChange={(e) => set("clientEmail", e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink mb-1">Address *</label>
          <input value={form.address} onChange={(e) => set("address", e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink mb-1">Description</label>
          <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring resize-none" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Project type</label>
            <select value={form.projectType} onChange={(e) => set("projectType", e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring bg-white">
              {Object.entries(CARPENTRY_PROJECT_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Storeys</label>
            <input type="number" min={1} value={form.storeyCount} onChange={(e) => set("storeyCount", e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {showCost && (
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Quoted value (ex GST)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
              <input type="number" min={0} step={0.01} value={form.quotedValue} onChange={(e) => set("quotedValue", e.target.value)} className="w-full border border-hairline rounded-lg pl-7 pr-3 py-2 text-sm focus-ring" />
            </div>
          </div>
          )}
          {showCost && (
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Budgeted cost (ex GST)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
              <input type="number" min={0} step={0.01} value={form.quotedCost} onChange={(e) => set("quotedCost", e.target.value)} className="w-full border border-hairline rounded-lg pl-7 pr-3 py-2 text-sm focus-ring" />
            </div>
          </div>
          )}
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Floor area (m²)</label>
            <input type="number" min={0} step={0.01} value={form.floorAreaM2} onChange={(e) => set("floorAreaM2", e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Planned start</label>
            <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Planned completion</label>
            <input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink mb-1">Notes</label>
          <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring resize-none" />
        </div>
      </div>
    );
  }

  const statusOptions = Object.entries(CARPENTRY_JOB_STATUS_LABELS).filter(([v]) => v !== job.status);

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-xl font-semibold text-ink">{job.clientName}</h2>
            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[job.status] || "bg-gray-100 text-gray-500"}`}>
              {CARPENTRY_JOB_STATUS_LABELS[job.status] || job.status}
            </span>
          </div>
          <p className="text-sm text-muted">{job.address}</p>
          {job.buildexactJobId && (
            <p className="text-xs text-muted mt-1">Buildexact Job ID: <span className="font-mono">{job.buildexactJobId}</span></p>
          )}
        </div>
        <div className="flex gap-2">
          {/* Close Job button — only for non-complete, non-cancelled jobs */}
          {!isClosedStatus && (
            <button
              onClick={() => setCloseoutOpen(true)}
              className="px-3 py-1.5 text-xs rounded-lg bg-accent text-white font-medium hover:bg-accent/90 transition-colors"
            >
              Close Job
            </button>
          )}
          {/* Status change dropdown — always available */}
          <div className="relative group">
            <button
              disabled={statusSaving}
              className="px-3 py-1.5 text-xs border border-hairline rounded-lg text-muted hover:text-ink disabled:opacity-40 transition-colors"
            >
              {statusSaving ? "Updating…" : "Change Status ▾"}
            </button>
            <div className="absolute right-0 top-full mt-1 bg-white border border-hairline rounded-lg shadow-lg py-1 z-10 hidden group-hover:block min-w-[140px]">
              {statusOptions.map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => changeStatus(v)}
                  className="block w-full text-left px-3 py-2 text-sm text-ink hover:bg-slate-50"
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={deleteJob}
            disabled={statusSaving}
            className="px-3 py-1.5 text-xs rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
          >
            Delete
          </button>
          <button
            onClick={startEdit}
            className="px-4 py-1.5 text-xs rounded-lg border border-hairline text-muted hover:text-ink transition-colors"
          >
            Edit
          </button>
        </div>
      </div>

      {/* Warning banner for completed / cancelled jobs */}
      {isClosedStatus && (
        <div className={`mb-4 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border ${job.status === "complete" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-gray-50 text-gray-500 border-hairline"}`}>
          <span>{job.status === "complete" ? "✓ Job closed" : "✗ Job cancelled"}</span>
          <span className="text-[11px] opacity-70">— edits are allowed but will not change the performance snapshot</span>
        </div>
      )}

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-4">{error}</div>}

      {/* Key details grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Field label="Reference"      value={job.reference} />
        <Field label="Project Type"   value={CARPENTRY_PROJECT_TYPE_LABELS[job.projectType] || job.projectType} />
        <Field label="Storeys"        value={job.storeyCount} />
        <Field label="Floor Area"     value={job.floorAreaM2 ? `${job.floorAreaM2} m²` : null} />
      </div>

      {/* Financials */}
      {(() => {
        // Derive margin when not explicitly stored but both value + cost are present.
        const displayMarginPct =
          job.quotedMarginPct != null
            ? job.quotedMarginPct
            : job.quotedValue && job.quotedCost
              ? Math.round(((job.quotedValue - job.quotedCost) / job.quotedValue) * 1000) / 10
              : null;
        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 p-4 bg-slate-50 rounded-card border border-hairline">
            <div>
              <p className="text-xs text-muted font-medium mb-0.5">Quoted Value</p>
              <p className="text-lg font-semibold text-ink">{fmt$(job.quotedValue)}</p>
              <p className="text-xs text-muted">ex GST</p>
            </div>
            <div>
              <p className="text-xs text-muted font-medium mb-0.5">Budgeted Cost</p>
              <p className="text-lg font-semibold text-ink">{fmt$(job.quotedCost)}</p>
              <p className="text-xs text-muted">ex GST</p>
            </div>
            <div>
              <p className="text-xs text-muted font-medium mb-0.5">Budget Margin</p>
              <p className="text-lg font-semibold text-ink">{fmtPct(displayMarginPct)}</p>
              <p className="text-xs text-muted">{job.quotedMarginPct != null ? "quoted" : "derived"}</p>
            </div>
            <div />
          </div>
        );
      })()}

      {/* Contact + dates */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Field label="Contact"    value={job.clientContact} />
        <Field label="Phone"      value={job.clientPhone} />
        <Field label="Email"      value={job.clientEmail} />
        <div />
        <Field label="Planned Start"      value={fmtDate(job.startDate)} />
        <Field label="Planned Completion" value={fmtDate(job.endDate)} />
        <Field label="Actual Start"       value={fmtDate(job.actualStart)} />
        <Field label="Actual End"         value={fmtDate(job.actualEnd)} />
      </div>

      {job.description && (
        <div className="mb-4">
          <p className="text-xs font-medium text-muted mb-1">Description</p>
          <p className="text-sm text-ink whitespace-pre-wrap">{job.description}</p>
        </div>
      )}
      {job.notes && (
        <div className="mb-4">
          <p className="text-xs font-medium text-muted mb-1">Notes</p>
          <p className="text-sm text-ink whitespace-pre-wrap">{job.notes}</p>
        </div>
      )}

      {/* Closeout performance snapshot (shown once job is complete) */}
      {job.status === "complete" && performance && (
        <div className="mt-2 p-4 bg-blue-50 rounded-card border border-blue-200">
          <p className="text-xs font-semibold text-blue-800 mb-2 uppercase tracking-wide">Closeout Performance</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-xs text-blue-700 mb-0.5">Final Margin</p>
              <p className="font-semibold text-ink">{performance.finalMarginPct != null ? `${Number(performance.finalMarginPct).toFixed(1)}%` : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-blue-700 mb-0.5">vs Budget</p>
              <p className={`font-semibold ${performance.variancePct != null && performance.variancePct < 0 ? "text-red-600" : "text-emerald-700"}`}>
                {performance.variancePct != null ? `${performance.variancePct >= 0 ? "+" : ""}${Number(performance.variancePct).toFixed(1)}%` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-blue-700 mb-0.5">Total Cost</p>
              <p className="font-semibold text-ink">{performance.finalTotalCost != null ? new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(performance.finalTotalCost) : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-blue-700 mb-0.5">Duration</p>
              <p className="font-semibold text-ink">{performance.durationDays != null ? `${performance.durationDays} days` : "—"}</p>
            </div>
          </div>
          {performance.hoursPerM2 != null && (
            <div className="mt-3 pt-3 border-t border-blue-200 flex gap-6 text-xs text-blue-800">
              <span>Labour hours: <strong>{performance.labourHours}</strong></span>
              {performance.floorAreaM2 && <span>Floor area: <strong>{performance.floorAreaM2} m²</strong></span>}
              {performance.hoursPerM2 && <span>Hours/m²: <strong>{performance.hoursPerM2}</strong></span>}
              {performance.costPerM2 && <span>Cost/m²: <strong>${performance.costPerM2}</strong></span>}
            </div>
          )}
        </div>
      )}

      {/* Closeout modal */}
      {closeoutOpen && (
        <CloseoutModal
          job={job}
          onClose={() => setCloseoutOpen(false)}
          onConfirm={() => { setCloseoutOpen(false); onUpdated(); }}
        />
      )}
    </div>
  );
}

// ── Schedule Tab (stage schedule) ─────────────────────────────────────────────
// Replaces the retired milestone list with the per-stage schedule (migration 144).
// Planned dates edited here write to carpentry_job_stage_schedule — the SAME store
// the Workforce → Pipeline calendar reads/writes, so edits sync both ways.

const STAGE_STATUS_NEXT = { planned: "in_progress", in_progress: "complete", complete: "planned" };
const STAGE_STATUS_STYLE = { planned: "border-slate-300", in_progress: "bg-blue-500 border-blue-500", complete: "bg-emerald-500 border-emerald-500" };

function ScheduleTab({ jobId, jobStartDate, onStartDateSaved }) {
  const [stages, setStages]                   = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [migrationPending, setMigrationPending] = useState(false);
  const [savingId, setSavingId]               = useState(null);
  const [seeding, setSeeding]                 = useState(false);
  const [error, setError]                     = useState(null);
  const [commence, setCommence]               = useState(jobStartDate || "");
  const [savingCommence, setSavingCommence]   = useState(false);
  const [expanded, setExpanded]               = useState(() => new Set());
  useEffect(() => { setCommence(jobStartDate || ""); }, [jobStartDate]);
  const toggleExpanded = (key) => setExpanded((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, data, error: e } = await apiFetch(`/api/carpentry/jobs/${jobId}/stage-schedule`);
    setLoading(false);
    if (!ok) { setError(e || "Could not load the stage schedule."); return; }
    setError(null);
    setMigrationPending(!!data?.migrationPending);
    setStages(data?.stages || []);
  }, [jobId]);
  useEffect(() => { load(); }, [load]);

  async function patchStage(row, patch) {
    setSavingId(row.id); setError(null);
    const { ok, data, error: e } = await apiPatch(`/api/carpentry/stage-schedule/${row.id}`, patch);
    setSavingId(null);
    if (!ok) { setError(e || "Update failed."); return; }
    // Keep the derived subsections (the PATCH response doesn't carry them) so the dropdown survives.
    setStages((s) => s.map((x) => (x.id === row.id ? { ...data.stage, subsections: x.subsections } : x)));
  }

  // Set the job's commencement (start_date) — the anchor auto-layout builds from — then re-seed.
  async function saveCommencement() {
    if (!commence) { setError("Pick a commencement date first."); return; }
    setSavingCommence(true); setError(null);
    const p = await apiPatch(`/api/carpentry/jobs/${jobId}`, { startDate: commence });
    if (!p.ok) { setSavingCommence(false); setError(p.error || "Could not set the commencement date."); return; }
    const { ok, data, error: e } = await apiPost(`/api/carpentry/jobs/${jobId}/stage-schedule/seed`, {});
    setSavingCommence(false);
    if (!ok) { setError(e || "Laid out the date but the schedule didn’t rebuild — try Re-auto-layout."); return; }
    setStages(data?.stages || []);
    onStartDateSaved?.(commence);
  }

  async function reseed() {
    if (!confirm("Re-lay out all unlocked stages from the commencement date? Locked stages stay put.")) return;
    setSeeding(true); setError(null);
    const { ok, data, error: e } = await apiPost(`/api/carpentry/jobs/${jobId}/stage-schedule/seed`, {});
    setSeeding(false);
    if (!ok) { setError(e || "Re-layout failed."); return; }
    setStages(data?.stages || []);
  }

  const noDates = stages.length > 0 && stages.every((s) => !s.plannedStart);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-ink">Stage schedule</h3>
        {!migrationPending && stages.length > 0 && (
          <button onClick={reseed} disabled={seeding} className="text-xs px-3 py-1.5 rounded-lg border border-hairline text-muted hover:text-ink disabled:opacity-40">
            {seeding ? "Laying out…" : "Re-auto-layout"}
          </button>
        )}
      </div>
      <p className="text-xs text-muted mb-4">Planned dates per stage. Edits sync to the Workforce &rarr; Pipeline calendar. Lock a stage to pin it against auto-layout &amp; ripple.</p>

      {/* Commencement — the anchor auto-layout builds from. Setting it lays out every stage. */}
      {!migrationPending && (
        <div className="mb-4 p-3 rounded-card border border-hairline bg-slate-50 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Commencement date</label>
            <input type="date" value={commence} onChange={(e) => setCommence(e.target.value)} className="border border-hairline rounded-lg px-3 py-2 text-sm focus-ring" />
          </div>
          <button onClick={saveCommencement} disabled={savingCommence || !commence} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-40">
            {savingCommence ? "Laying out…" : "Set & lay out stages"}
          </button>
          <p className="text-[11px] text-muted flex-1 min-w-[12rem]">Stage lengths come from each budget subsection’s labour value; setting this date cascades them all from here.</p>
        </div>
      )}

      {noDates && !savingCommence && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800 mb-4">
          Stages have no dates yet — set a <span className="font-medium">commencement date</span> above to lay them out.
        </div>
      )}

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-4">{error}</div>}
      {migrationPending && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800 mb-4">
          Stage schedule isn&rsquo;t enabled yet — apply <span className="font-mono">migration 144</span> in Supabase, then reload.
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="rounded-card border border-hairline divide-y divide-hairline overflow-hidden">
          {stages.length === 0 && !migrationPending && (
            <p className="p-4 text-sm text-muted">No stages yet — set the job start date and add its budget, then Re-auto-layout.</p>
          )}
          {stages.map((st) => {
            const subs = st.subsections || [];
            const open = expanded.has(st.stageKey);
            return (
            <div key={st.id} className={`${savingId === st.id ? "opacity-60" : ""} ${st.status === "complete" ? "bg-emerald-50" : "bg-white"}`}>
              <div className="flex items-center gap-3 p-3">
                <button
                  onClick={() => patchStage(st, { status: STAGE_STATUS_NEXT[st.status] })}
                  title={`Status: ${st.status} (click to advance)`}
                  className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${STAGE_STATUS_STYLE[st.status] || STAGE_STATUS_STYLE.planned}`}
                >
                  {st.status === "complete" && <span className="text-white text-xs">✓</span>}
                  {st.status === "in_progress" && <span className="w-2 h-2 rounded-full bg-white" />}
                </button>
                {subs.length > 0 ? (
                  <button type="button" onClick={() => toggleExpanded(st.stageKey)}
                    title="Show budget subsections"
                    className={`flex-1 flex items-center gap-1.5 text-left text-sm font-medium ${st.status === "complete" ? "text-muted" : "text-ink"}`}>
                    <span className="text-[10px] text-muted w-2">{open ? "▾" : "▸"}</span>{st.stageLabel}
                    <span className="text-[10px] text-muted font-normal">({subs.length})</span>
                  </button>
                ) : (
                  <span className={`flex-1 text-sm font-medium ${st.status === "complete" ? "text-muted" : "text-ink"}`}>{st.stageLabel}</span>
                )}
                {st.actualStart && (
                  <span className="text-[10px] text-emerald-600" title="Observed from approved timesheets">
                    actual {fmtDate(st.actualStart)}{st.actualEnd ? `–${fmtDate(st.actualEnd)}` : ""}
                  </span>
                )}
                <div className="flex items-center gap-1.5 text-xs text-muted">
                  <input type="date" value={st.plannedStart || ""} onChange={(e) => patchStage(st, { plannedStart: e.target.value })} className="border border-hairline rounded px-1.5 py-0.5 text-xs focus-ring" />
                  <span>→</span>
                  <input type="date" value={st.plannedEnd || ""} onChange={(e) => patchStage(st, { plannedEnd: e.target.value })} className="border border-hairline rounded px-1.5 py-0.5 text-xs focus-ring" />
                </div>
                <button
                  onClick={() => patchStage(st, { locked: !st.locked })}
                  title={st.locked ? "Locked — click to unlock" : "Unlocked — click to pin against auto-layout"}
                  className={`flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-medium rounded-full border px-2 py-0.5 ${st.locked ? "bg-primary/10 text-primary border-primary/30" : "text-muted border-hairline hover:text-ink hover:border-slate-300"}`}
                >
                  {st.locked ? "🔒 Locked" : "🔓 Lock"}
                </button>
              </div>
              {open && subs.length > 0 && (
                <div className="pl-11 pr-3 pb-3 space-y-1">
                  {subs.map((sub, i) => (
                    <div key={sub.canonicalKey || i} className="flex items-center justify-between text-xs border-t border-hairline/60 pt-1">
                      <span className="text-ink">{sub.label}</span>
                      <span className="text-muted tabular-nums">
                        {sub.days != null ? `${sub.days} day${sub.days === 1 ? "" : "s"}` : "—"}
                        {sub.sell ? <span className="text-muted/70"> · ${Math.round(sub.sell).toLocaleString()}</span> : null}
                      </span>
                    </div>
                  ))}
                  <p className="text-[10px] text-muted pt-1">Indicative durations — each subsection is rounded up from its budget labour value (they can total more than the stage).</p>
                </div>
              )}
            </div>
          );
          })}
        </div>
      )}
    </div>
  );
}

// ── Diary Tab ─────────────────────────────────────────────────────────────────

const TASK_PRIORITY_LABEL = {
  urgent: "Urgent",
  normal: "Normal",
  when_time_permits: "When time permits",
};
const TASK_PRIORITY_BADGE = {
  urgent: "bg-red-100 text-red-700",
  normal: "bg-gray-100 text-gray-600",
  when_time_permits: "bg-slate-50 text-slate-500",
};

// ── C1: Sortable task row wrapper (drag handle on right, mirrors WorkerTasks.jsx) ──

function SortableTaskRow({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 20 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-stretch gap-1">
      <div className="flex-1 min-w-0">{children}</div>
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        style={{ touchAction: "none" }}
        className="shrink-0 px-2 flex items-center justify-center text-slate-300 hover:text-primary active:text-primary cursor-grab touch-none rounded-lg"
      >
        <span className="text-lg leading-none select-none">⠿</span>
      </button>
    </div>
  );
}

function TasksPanel({ jobId }) {
  const [tasks, setTasks]         = useState([]);
  const [loadingT, setLoadingT]   = useState(true);
  const [showAddTask, setShowAddTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskPriority, setTaskPriority] = useState("normal");
  const [taskCategory, setTaskCategory] = useState("general");
  const [taskAudience, setTaskAudience] = useState("worker"); // D3: 'worker' | 'supervisor' (QC/order-ahead)
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskDesc, setTaskDesc]   = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [taskError, setTaskError] = useState(null);
  const [showDone, setShowDone]   = useState(false);
  const [employees, setEmployees] = useState([]);
  // D4: the job's labour budget categories drive the task-category dropdown, so a worker task's
  // category == the budget category == the timesheet task_category (the spine that accrues actuals).
  const [labourCats, setLabourCats] = useState([]);
  // Voice → tasks (paste a Plaud transcript → draft tasks for review)
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [drafts, setDrafts] = useState([]); // { title, priority, category, description, _keep }
  const [addingDrafts, setAddingDrafts] = useState(false);
  const [voiceError, setVoiceError] = useState(null);
  // Edit sheet state
  const [editTask, setEditTask]       = useState(null);  // task being edited
  const [editTitle, setEditTitle]     = useState("");
  const [editCategory, setEditCategory] = useState("general");
  const [editPriority, setEditPriority] = useState("normal");
  const [savingEdit, setSavingEdit]   = useState(false);
  const [editError, setEditError]     = useState(null);
  const [detailTask, setDetailTask]   = useState(null);  // sign-off task open in the detail modal

  const loadTasks = useCallback(async () => {
    setLoadingT(true);
    const { ok, data } = await apiFetch(`/api/carpentry/jobs/${jobId}/tasks`);
    setLoadingT(false);
    if (ok) setTasks(data?.tasks || []);
  }, [jobId]);

  useEffect(() => { loadTasks(); }, [loadTasks]);
  useEffect(() => {
    apiFetch("/api/workforce/employees")
      .then(({ ok, data }) => { if (ok) setEmployees((data?.employees || []).filter(e => e.is_active !== false)); })
      .catch(() => {});
  }, []);
  useEffect(() => {
    apiFetch(`/api/carpentry/jobs/${jobId}/budget`)
      .then(({ ok, data }) => { if (ok) setLabourCats((data?.lines || []).filter((l) => l.costType === "labour" && l.workforceTaskCategory)); })
      .catch(() => {});
  }, [jobId]);

  async function addTask() {
    if (!taskTitle.trim()) return;
    setAddingTask(true);
    setTaskError(null);
    const { ok, data, error: e } = await apiPost(`/api/carpentry/jobs/${jobId}/tasks`, {
      title: taskTitle.trim(),
      description: taskDesc.trim() || undefined,
      priority: taskPriority,
      category: taskCategory,
      assignedTo: taskAssignee || undefined,
      taskAudience,
    });
    setAddingTask(false);
    if (!ok) { setTaskError(e || "Failed to add task."); return; }
    setTasks((prev) => [data.task, ...prev]);
    setTaskTitle("");
    setTaskDesc("");
    setTaskPriority("normal");
    setTaskCategory("general");
    setTaskAudience("worker");
    setTaskAssignee("");
    setShowAddTask(false);
  }

  async function applyTemplate() {
    setTaskError(null);
    const { ok, data, error: e } = await apiPost(`/api/carpentry/jobs/${jobId}/tasks/apply-template`, {});
    if (!ok) { setTaskError(e || "Could not add the base checklist."); return; }
    if (data?.added > 0) await loadTasks();
    else setTaskError("Base checklist already added — nothing new to add.");
  }

  async function extractFromTranscript() {
    if (!transcript.trim()) return;
    setExtracting(true);
    setVoiceError(null);
    const { ok, data, error: e } = await apiPost(`/api/carpentry/jobs/${jobId}/tasks/from-transcript`, {
      transcript: transcript.trim(),
    });
    setExtracting(false);
    if (!ok) { setVoiceError(e || "Could not extract tasks."); return; }
    const list = (data?.tasks || []).map((t) => ({ ...t, _keep: true }));
    if (!list.length) { setVoiceError("No tasks found in that transcript."); return; }
    setDrafts(list);
  }

  async function addSelectedDrafts() {
    const keep = drafts.filter((d) => d._keep && d.title.trim());
    if (!keep.length) return;
    setAddingDrafts(true);
    setVoiceError(null);
    const created = [];
    const failed = [];
    for (const d of keep) {
      // Sequential, not Promise.all — keeps order and avoids hammering the API.
      const { ok, data } = await apiPost(`/api/carpentry/jobs/${jobId}/tasks`, {
        title: d.title.trim(),
        description: d.description?.trim() || undefined,
        priority: d.priority,
        category: d.category,
        createdVia: "ai_extraction",
      });
      if (ok && data?.task) created.push(data.task);
      else failed.push(d);
    }
    setAddingDrafts(false);
    if (created.length) setTasks((prev) => [...created, ...prev]);
    if (failed.length > 0) {
      // Don't silently drop failures — keep only the failed drafts on screen for retry.
      setVoiceError(`Added ${created.length} of ${keep.length}. ${failed.length} could not be added — still listed below, try again.`);
      setDrafts(failed.map((d) => ({ ...d, _keep: true })));
      return;
    }
    setDrafts([]);
    setTranscript("");
    setShowTranscript(false);
  }

  async function toggleDone(task) {
    // blocked → open, done → open, open/in_progress → done
    const newStatus = task.status === "done" || task.status === "blocked" ? "open" : "done";
    setTogglingId(task.id);
    const { ok, data } = await apiPatch(`/api/carpentry/tasks/${task.id}`, { status: newStatus });
    setTogglingId(null);
    if (ok) setTasks((prev) => prev.map((t) => t.id === task.id ? data.task : t));
  }

  async function deleteTask(task) {
    if (!confirm(`Remove task "${task.title}"?`)) return;
    const { ok } = await apiDelete(`/api/carpentry/tasks/${task.id}`);
    if (ok) setTasks((prev) => prev.filter((t) => t.id !== task.id));
  }

  function openEdit(task) {
    setEditTask(task);
    setEditTitle(task.title || "");
    setEditCategory(task.category || "general");
    setEditPriority(task.priority || "normal");
    setEditError(null);
  }
  function closeEdit() {
    setEditTask(null);
    setEditError(null);
  }
  async function saveEdit() {
    if (!editTitle.trim()) { setEditError("Title is required."); return; }
    setSavingEdit(true);
    setEditError(null);
    const { ok, data, error } = await apiPatch(`/api/carpentry/tasks/${editTask.id}`, {
      title: editTitle.trim(),
      category: editCategory,
      priority: editPriority,
    });
    setSavingEdit(false);
    if (!ok) { setEditError(error || "Could not save task."); return; }
    setTasks((prev) => prev.map((t) => t.id === editTask.id ? data.task : t));
    closeEdit();
  }

  // ── C1: DnD sensors for diary drag-reorder ──────────────────────────────────
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } })
  );

  async function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = tasks.findIndex((t) => t.id === active.id);
    const newIndex = tasks.findIndex((t) => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const prev = tasks;
    const next = arrayMove(tasks, oldIndex, newIndex);
    setTasks(next);
    // Persist the new sort_order for the moved row (index as sort_order value)
    const { ok } = await apiPatch(`/api/carpentry/tasks/${active.id}`, { sortOrder: newIndex });
    if (!ok) setTasks(prev); // roll back on error
  }

  const openTasks    = tasks.filter((t) => t.status !== "done" && t.status !== "wont_do");
  const doneTasks    = tasks.filter((t) => t.status === "done");
  const blockedTasks = tasks.filter((t) => t.status === "blocked");
  // D3: split worker tasks from supervisor/QC tasks.
  const openWorker = openTasks.filter((t) => t.task_audience !== "supervisor" && t.status !== "blocked");
  const openSup    = openTasks.filter((t) => t.task_audience === "supervisor" && t.status !== "blocked");

  // Group worker tasks by category for progress display.
  const workerByCategory = {};
  for (const t of openWorker) {
    const cat = t.category || "general";
    if (!workerByCategory[cat]) workerByCategory[cat] = [];
    workerByCategory[cat].push(t);
  }
  function catProgress(cat) {
    const all = tasks.filter((t) => (t.category || "general") === cat && t.status !== "wont_do");
    return { done: all.filter((t) => t.status === "done").length, total: all.length };
  }

  const CATEGORY_LABEL_MAP = {
    general: "General", defect: "Defect", safety: "Safety", materials: "Materials",
    inspection: "Inspection", first_fix_framing: "Framing", cladding: "Cladding",
    second_fix: "Second Fix", outdoor_works: "Outdoor Works",
    formwork_slab_prep: "Formwork / Slab Prep", site_labouring: "Site Labouring",
    site_cleanup: "Site Cleanup", supervision: "Supervision",
  };

  const renderOpenRow = (task) => (
    <div key={task.id} className="flex items-start gap-3 p-3 rounded-lg border border-hairline bg-white">
      <button
        onClick={() => toggleDone(task)}
        disabled={togglingId === task.id}
        className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 border-slate-300 hover:border-primary flex items-center justify-center transition-colors disabled:opacity-40"
        aria-label="Mark done"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink leading-snug">{task.title}</p>
        {task.description && <p className="text-xs text-muted mt-0.5">{task.description}</p>}
        {task.assigned?.name && <p className="text-xs text-muted mt-0.5">Assigned: {task.assigned.name}</p>}
      </div>
      <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${TASK_PRIORITY_BADGE[task.priority] || ""}`}>
        {TASK_PRIORITY_LABEL[task.priority] || task.priority}
      </span>
      <button
        onClick={() => openEdit(task)}
        className="shrink-0 text-muted hover:text-primary text-xs transition-colors px-1"
        title="Edit task"
        aria-label="Edit task"
      >✎</button>
      <button onClick={() => deleteTask(task)} className="shrink-0 text-muted hover:text-red-500 text-xs transition-colors px-1" title="Remove task">✕</button>
    </div>
  );

  return (
    <div className="mb-8">
      {/* ── Sign-off Detail ──────────────────────────────────────────────────── */}
      {detailTask && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDetailTask(null)} />
          <div className="relative bg-white rounded-t-xl sm:rounded-xl p-5 w-full max-w-md mx-0 sm:mx-4 shadow-xl space-y-3 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold text-ink leading-snug">{detailTask.title}</h3>
              <button onClick={() => setDetailTask(null)} className="shrink-0 text-muted hover:text-ink text-lg leading-none" aria-label="Close">✕</button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {detailTask.category && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-ink capitalize">{String(detailTask.category).replace(/_/g, " ")}</span>
              )}
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TASK_PRIORITY_BADGE[detailTask.priority] || ""}`}>
                {TASK_PRIORITY_LABEL[detailTask.priority] || detailTask.priority}
              </span>
            </div>

            <p className="text-xs text-muted">
              Signed off by{" "}
              <span className="font-medium text-emerald-700">{detailTask.completer?.name || "worker"}</span>
              {detailTask.completedAt && (
                <> — {new Date(detailTask.completedAt).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</>
              )}
            </p>

            {detailTask.description && (
              <div>
                <p className="text-xs font-medium text-ink mb-0.5">Task detail</p>
                <p className="text-sm text-muted whitespace-pre-wrap">{detailTask.description}</p>
              </div>
            )}

            {detailTask.completionNotes && (
              <div>
                <p className="text-xs font-medium text-ink mb-0.5">Sign-off note</p>
                <p className="text-sm text-muted whitespace-pre-wrap">{detailTask.completionNotes}</p>
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-ink mb-1">Completion photo</p>
              {detailTask.completionPhotoSignedUrl ? (
                <a href={detailTask.completionPhotoSignedUrl} target="_blank" rel="noreferrer" title="Open full photo">
                  <img
                    src={detailTask.completionPhotoSignedUrl}
                    alt="Completion photo"
                    className="w-full max-h-80 object-contain rounded-lg border border-hairline bg-gray-50"
                  />
                </a>
              ) : (
                <p className="text-sm text-muted italic">No photo uploaded for this sign-off.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Task Sheet ──────────────────────────────────────────────────── */}
      {editTask && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeEdit} />
          <div className="relative bg-white rounded-t-xl sm:rounded-xl p-5 w-full max-w-md mx-0 sm:mx-4 shadow-xl space-y-4">
            <h3 className="text-sm font-semibold text-ink">Edit Task</h3>
            {editError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{editError}</p>}
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Title *</label>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Priority</label>
                <select
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value)}
                  className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring bg-white"
                >
                  <option value="urgent">Urgent</option>
                  <option value="normal">Normal</option>
                  <option value="when_time_permits">When time permits</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Category</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring bg-white"
                >
                  {labourCats.length > 0 && (
                    <optgroup label="Work stream (labour)">
                      {labourCats.map((c) => (
                        <option key={c.id} value={c.workforceTaskCategory}>{c.categoryName}</option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Other">
                    <option value="general">General</option>
                    <option value="defect">Defect</option>
                    <option value="safety">Safety</option>
                    <option value="materials">Materials</option>
                    <option value="inspection">Inspection</option>
                  </optgroup>
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={saveEdit}
                disabled={savingEdit || !editTitle.trim()}
                className="flex-1 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors"
              >
                {savingEdit ? "Saving…" : "Save"}
              </button>
              <button
                onClick={closeEdit}
                className="px-4 py-2 rounded-lg border border-hairline text-ink text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-ink">Tasks for workers</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={applyTemplate}
            className="px-3 py-1.5 text-xs rounded-lg border border-hairline text-ink font-medium hover:bg-slate-50 transition-colors"
            title="Add the standard per-stage carpentry checklist to this job"
          >
            📋 Base checklist
          </button>
          <button
            onClick={() => { setShowTranscript((v) => !v); setDrafts([]); setVoiceError(null); }}
            className="px-3 py-1.5 text-xs rounded-lg border border-hairline text-ink font-medium hover:bg-slate-50 transition-colors"
            title="Paste a site walk-through transcript and turn it into tasks"
          >
            🎤 From transcript
          </button>
          <button
            onClick={() => setShowAddTask((v) => !v)}
            className="px-3 py-1.5 text-xs rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors"
          >
            {showAddTask ? "Cancel" : "+ Add Task"}
          </button>
        </div>
      </div>

      {showTranscript && (
        <div className="mb-4 p-4 bg-slate-50 rounded-card border border-hairline space-y-3">
          {voiceError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{voiceError}</div>}
          {drafts.length === 0 ? (
            <>
              <label className="block text-xs font-medium text-ink mb-1">Paste your walk-through transcript</label>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={5}
                placeholder="Paste the transcript from your Plaud recorder (or any notes). We'll turn it into a draft task list you can review before adding."
                className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring resize-none"
              />
              <button
                onClick={extractFromTranscript}
                disabled={extracting || !transcript.trim()}
                className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-40 transition-colors"
              >
                {extracting ? "Extracting…" : "Extract tasks"}
              </button>
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-ink">Review {drafts.length} draft task{drafts.length !== 1 ? "s" : ""} — untick any you do not want, then add.</p>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {drafts.map((d, i) => (
                  <div key={i} className="flex items-start gap-2 bg-white border border-hairline rounded-lg px-3 py-2">
                    <input
                      type="checkbox"
                      checked={d._keep}
                      onChange={(e) => setDrafts((prev) => prev.map((x, xi) => xi === i ? { ...x, _keep: e.target.checked } : x))}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <input
                        value={d.title}
                        onChange={(e) => setDrafts((prev) => prev.map((x, xi) => xi === i ? { ...x, title: e.target.value } : x))}
                        className="w-full border border-hairline rounded px-2 py-1 text-sm focus-ring"
                      />
                      {(d.description || "").trim() && (
                        <textarea
                          value={d.description}
                          onChange={(e) => setDrafts((prev) => prev.map((x, xi) => xi === i ? { ...x, description: e.target.value } : x))}
                          rows={2}
                          className="w-full border border-hairline rounded px-2 py-1 text-xs text-muted focus-ring mt-1 resize-none"
                        />
                      )}
                      {/* Category + priority are editable before adding — the AI's guess is a
                          starting point (e.g. reassign a "materials"/"defect" draft to the
                          Cladding/Soffit work stream). Mirrors the manual add-task selects. */}
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <select
                          value={d.category}
                          onChange={(e) => setDrafts((prev) => prev.map((x, xi) => xi === i ? { ...x, category: e.target.value } : x))}
                          aria-label="Category"
                          className="border border-hairline rounded px-1.5 py-1 text-xs focus-ring bg-white"
                        >
                          {/* Preserve an AI category that doesn't match any known option (never silently lost). */}
                          {![...labourCats.map((c) => c.workforceTaskCategory), "general", "defect", "safety", "materials", "inspection"].includes(d.category) && (
                            <option value={d.category}>{d.category}</option>
                          )}
                          {labourCats.length > 0 && (
                            <optgroup label="Work stream (labour)">
                              {labourCats.map((c) => (
                                <option key={c.id} value={c.workforceTaskCategory}>{c.categoryName}</option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup label="Other">
                            <option value="general">General</option>
                            <option value="defect">Defect</option>
                            <option value="safety">Safety</option>
                            <option value="materials">Materials</option>
                            <option value="inspection">Inspection</option>
                          </optgroup>
                        </select>
                        <select
                          value={d.priority}
                          onChange={(e) => setDrafts((prev) => prev.map((x, xi) => xi === i ? { ...x, priority: e.target.value } : x))}
                          aria-label="Priority"
                          className="border border-hairline rounded px-1.5 py-1 text-xs focus-ring bg-white"
                        >
                          <option value="urgent">Urgent</option>
                          <option value="normal">Normal</option>
                          <option value="when_time_permits">When time permits</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={addSelectedDrafts}
                  disabled={addingDrafts || !drafts.some((d) => d._keep)}
                  className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors"
                >
                  {addingDrafts ? "Adding…" : `Add ${drafts.filter((d) => d._keep).length} task(s)`}
                </button>
                <button
                  onClick={() => setDrafts([])}
                  className="px-3 py-2 rounded-lg border border-hairline text-ink text-sm font-medium"
                >
                  Back
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {taskError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-3">{taskError}</div>}

      {showAddTask && (
        <div className="mb-4 p-4 bg-slate-50 rounded-card border border-hairline space-y-3">
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Task *</label>
            <input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTask()}
              placeholder="e.g. Install LVL ridge beam"
              className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Details (optional)</label>
            <textarea
              value={taskDesc}
              onChange={(e) => setTaskDesc(e.target.value)}
              rows={2}
              placeholder="Any extra context for the worker…"
              className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink mb-1">For</label>
            <div className="flex gap-2">
              {[["worker", "Workers"], ["supervisor", "Supervisor (QC / order-ahead)"]].map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTaskAudience(v)}
                  className={`flex-1 min-h-[38px] rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                    taskAudience === v ? "bg-primary text-white" : "border border-hairline bg-white text-ink hover:bg-slate-50"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Priority</label>
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value)}
                className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring bg-white"
              >
                <option value="urgent">Urgent</option>
                <option value="normal">Normal</option>
                <option value="when_time_permits">When time permits</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Category</label>
              <select
                value={taskCategory}
                onChange={(e) => setTaskCategory(e.target.value)}
                className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring bg-white"
              >
                {labourCats.length > 0 && (
                  <optgroup label="Work stream (labour)">
                    {labourCats.map((c) => (
                      <option key={c.id} value={c.workforceTaskCategory}>{c.categoryName}</option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Other">
                  <option value="general">General</option>
                  <option value="defect">Defect</option>
                  <option value="safety">Safety</option>
                  <option value="materials">Materials</option>
                  <option value="inspection">Inspection</option>
                </optgroup>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Assign to (optional)</label>
              <select
                value={taskAssignee}
                onChange={(e) => setTaskAssignee(e.target.value)}
                className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring bg-white"
              >
                <option value="">Anyone on site</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={addTask}
                disabled={addingTask || !taskTitle.trim()}
                className="px-5 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-40 transition-colors"
              >
                {addingTask ? "Adding…" : "Add Task"}
              </button>
            </div>
          </div>
        </div>
      )}

      {loadingT ? (
        <p className="text-sm text-muted">Loading tasks…</p>
      ) : openTasks.length === 0 && doneTasks.length === 0 ? (
        <p className="text-sm text-muted">No tasks yet. Add tasks for your workers to tick off on-site.</p>
      ) : (
        <>
          {/* ── C1: Worker tasks grouped by category, wrapped in DndContext for drag-reorder ── */}
          {Object.keys(workerByCategory).length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              {Object.keys(workerByCategory).map((cat) => {
                const { done, total } = catProgress(cat);
                const label = CATEGORY_LABEL_MAP[cat] || cat;
                const catTasks = workerByCategory[cat];
                return (
                  <div key={cat} className="mb-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <p className="text-xs font-semibold text-muted uppercase tracking-wide flex-1">{label}</p>
                      <span className="text-xs text-muted tabular-nums">{done}/{total}</span>
                      {total > 0 && (
                        <div className="w-12 h-1 bg-gray-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${done === total ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${Math.round((done / total) * 100)}%` }} />
                        </div>
                      )}
                    </div>
                    <SortableContext items={catTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {catTasks.map((task) => (
                          <SortableTaskRow key={task.id} id={task.id}>
                            {renderOpenRow(task)}
                          </SortableTaskRow>
                        ))}
                      </div>
                    </SortableContext>
                  </div>
                );
              })}
            </DndContext>
          )}

          {/* Supervisor / QC tasks (no reorder — small set, office-only) */}
          {openSup.length > 0 && (
            <div className="mb-3">
              <h4 className="text-xs font-semibold text-muted mb-2 uppercase tracking-wide">Supervisor / QC</h4>
              <div className="space-y-2">{openSup.map(renderOpenRow)}</div>
            </div>
          )}

          {/* Blocked tasks surfaced */}
          {blockedTasks.length > 0 && (
            <div className="mb-3">
              <h4 className="text-xs font-semibold text-amber-700 mb-2 uppercase tracking-wide">Blocked ({blockedTasks.length})</h4>
              <div className="space-y-2">
                {blockedTasks.map((task) => (
                  <div key={task.id} className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50">
                    <span className="mt-0.5 shrink-0 text-amber-500 font-bold text-sm">!</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink leading-snug">{task.title}</p>
                      {task.completionNotes && <p className="text-xs text-amber-700 mt-0.5">{task.completionNotes}</p>}
                      {task.assigned?.name && <p className="text-xs text-muted mt-0.5">Assigned: {task.assigned.name}</p>}
                    </div>
                    <button onClick={() => toggleDone(task)} disabled={togglingId === task.id} className="shrink-0 text-xs text-muted hover:text-ink transition-colors px-1" title="Mark open">↺</button>
                    <button onClick={() => deleteTask(task)} className="shrink-0 text-muted hover:text-red-500 text-xs transition-colors px-1" title="Remove">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── C2: Sign-off review — completed tasks with worker name, time, photo, notes ── */}
          {doneTasks.length > 0 && (
            <div className="mt-5">
              <button
                type="button"
                onClick={() => setShowDone((v) => !v)}
                className="text-xs text-muted font-medium mb-3 flex items-center gap-1.5"
              >
                <span className="text-emerald-600 font-bold">✓</span>
                Sign-off Review ({doneTasks.length} completed) {showDone ? "▲" : "▼"}
              </button>
              {showDone && (
                <div className="space-y-3">
                  {doneTasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => setDetailTask(task)}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 cursor-pointer hover:bg-emerald-100/70 transition-colors"
                      title="View sign-off detail"
                    >
                      <div className="flex items-start gap-3">
                        {/* Undo-done button */}
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleDone(task); }}
                          disabled={togglingId === task.id}
                          className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500 border-2 border-emerald-500 flex items-center justify-center transition-colors disabled:opacity-40"
                          aria-label="Mark undone"
                        >
                          <span className="text-white text-xs leading-none">✓</span>
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-ink leading-snug">{task.title}</p>
                          {/* Completer + timestamp */}
                          <p className="text-xs text-muted mt-0.5">
                            {task.completer?.name ? (
                              <span className="font-medium text-emerald-700">{task.completer.name}</span>
                            ) : (
                              <span>Worker</span>
                            )}
                            {task.completedAt && (
                              <>
                                {" — "}
                                {new Date(task.completedAt).toLocaleDateString("en-AU", {
                                  day: "numeric", month: "short", year: "numeric",
                                })}
                                {" "}
                                {new Date(task.completedAt).toLocaleTimeString("en-AU", {
                                  hour: "2-digit", minute: "2-digit",
                                })}
                              </>
                            )}
                          </p>
                          {/* Completion note */}
                          {task.completionNotes && (
                            <p className="text-xs text-muted mt-1 italic">{task.completionNotes}</p>
                          )}
                          {/* Completion photo thumbnail → click for full view */}
                          {task.completionPhotoSignedUrl && (
                            <a
                              href={task.completionPhotoSignedUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-block mt-2"
                              title="View full photo"
                            >
                              <img
                                src={task.completionPhotoSignedUrl}
                                alt="Completion photo"
                                className="w-20 h-20 rounded-lg object-cover border border-emerald-200 hover:opacity-80 transition-opacity"
                              />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DiaryTab({ job }) {
  const [entries, setEntries]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);
  const [structuring, setStructuring] = useState(false);

  const [form, setForm] = useState({
    entryDate: new Date().toISOString().slice(0, 10),
    weather: "",
    tradesOnsite: "",
    workCompleted: "",
    issues: "",
    instructionsGiven: "",
    visitors: "",
    supervisor: "",
    rawVoiceTranscript: "",
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, data } = await apiFetch(`/api/carpentry/jobs/${job.id}/diary`);
    setLoading(false);
    if (ok) setEntries(data?.entries || []);
  }, [job.id]);

  useEffect(() => { load(); }, [load]);

  async function structureWithAi() {
    if (!form.rawVoiceTranscript.trim()) return;
    setStructuring(true);
    const { ok, data, error: e } = await apiPost("/api/diary/structure", {
      transcript: form.rawVoiceTranscript,
      projectAddress: job.address,
    });
    setStructuring(false);
    if (!ok) { setError(e || "AI structuring failed."); return; }
    const s = data?.structured || {};
    const hasContent = s.weather || s.work_completed || s.issues || (Array.isArray(s.trades_onsite) && s.trades_onsite.length > 0);
    if (!hasContent) {
      setError("AI couldn't extract structure from this transcript. Fill the fields below manually.");
      return;
    }
    if (s.weather)            set("weather", String(s.weather));
    if (s.trades_onsite?.length) set("tradesOnsite", Array.isArray(s.trades_onsite) ? s.trades_onsite.join(", ") : s.trades_onsite);
    if (s.work_completed)     set("workCompleted", String(s.work_completed));
    if (s.issues)             set("issues", String(s.issues));
    if (s.instructions_given) set("instructionsGiven", String(s.instructions_given));
    if (s.visitors)           set("visitors", String(s.visitors));
    setError(null);
  }

  async function saveEntry() {
    if (!form.entryDate) { setError("Entry date is required."); return; }
    setSaving(true);
    setError(null);
    const tradesOnsite = form.tradesOnsite
      ? form.tradesOnsite.split(",").map((t) => t.trim()).filter(Boolean)
      : [];
    const { ok, data, error: e } = await apiPost(`/api/carpentry/jobs/${job.id}/diary`, {
      ...form,
      tradesOnsite,
      structuredByAi: form.rawVoiceTranscript.trim().length > 0,
    });
    setSaving(false);
    if (!ok) { setError(e || "Failed to save diary entry."); return; }
    setEntries((es) => [data.entry, ...es]);
    setShowForm(false);
    setForm({
      entryDate: new Date().toISOString().slice(0, 10),
      weather: "", tradesOnsite: "", workCompleted: "",
      issues: "", instructionsGiven: "", visitors: "",
      supervisor: "", rawVoiceTranscript: "",
    });
  }

  return (
    <div className="p-6">
      {/* Tasks for workers — always visible at top */}
      <TasksPanel jobId={job.id} />

      <hr className="border-hairline -mx-6 mb-6" />

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-ink">Site Diary</h3>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-4 py-1.5 text-xs rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors"
        >
          {showForm ? "Cancel" : "+ New Entry"}
        </button>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-4">{error}</div>}

      {showForm && (
        <div className="mb-6 p-5 bg-slate-50 rounded-card border border-hairline space-y-4">
          <h4 className="text-sm font-semibold text-ink">New Diary Entry</h4>

          {/* Voice transcript + AI */}
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Voice transcript (optional)</label>
            <textarea
              value={form.rawVoiceTranscript}
              onChange={(e) => set("rawVoiceTranscript", e.target.value)}
              rows={4}
              className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring resize-none"
              placeholder="Paste or dictate a voice note — then click 'Structure with AI' to fill the fields below automatically…"
            />
            <button
              onClick={structureWithAi}
              disabled={structuring || !form.rawVoiceTranscript.trim()}
              className="mt-2 px-3 py-1.5 text-xs rounded-lg border border-primary text-primary font-medium hover:bg-primary/5 disabled:opacity-40 transition-colors"
            >
              {structuring ? "Structuring…" : "✦ Structure with AI"}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Date</label>
              <input type="date" value={form.entryDate} onChange={(e) => set("entryDate", e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Weather</label>
              <input value={form.weather} onChange={(e) => set("weather", e.target.value)} placeholder="e.g. Sunny 28°C" className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Trades on site</label>
              <input value={form.tradesOnsite} onChange={(e) => set("tradesOnsite", e.target.value)} placeholder="e.g. Framers, Concreters" className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Supervisor</label>
              <input value={form.supervisor} onChange={(e) => set("supervisor", e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Work completed</label>
            <textarea value={form.workCompleted} onChange={(e) => set("workCompleted", e.target.value)} rows={3} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Issues</label>
            <textarea value={form.issues} onChange={(e) => set("issues", e.target.value)} rows={2} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Instructions given</label>
              <textarea value={form.instructionsGiven} onChange={(e) => set("instructionsGiven", e.target.value)} rows={2} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring resize-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Visitors</label>
              <input value={form.visitors} onChange={(e) => set("visitors", e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring" />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={saveEntry}
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-40 transition-colors"
            >
              {saving ? "Saving…" : "Save Entry"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">Loading diary entries…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted">No diary entries yet.</p>
      ) : (
        <div className="space-y-4">
          {entries.map((e) => (
            <div key={e.id} className="bg-white rounded-card border border-hairline p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-ink">{new Date(e.entryDate).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}</span>
                <div className="flex items-center gap-2 text-xs text-muted">
                  {e.weather && <span>☁ {e.weather}</span>}
                  {e.structuredByAi && <span className="text-primary font-medium">✦ AI</span>}
                </div>
              </div>
              {e.tradesOnsite?.length > 0 && (
                <p className="text-xs text-muted mb-2">Trades: {Array.isArray(e.tradesOnsite) ? e.tradesOnsite.join(", ") : e.tradesOnsite}</p>
              )}
              {e.workCompleted && <p className="text-sm text-ink mb-1">{e.workCompleted}</p>}
              {e.issues && <p className="text-sm text-amber-700 mt-1">⚠ {e.issues}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Costs Tab ─────────────────────────────────────────────────────────────────

// Distinct sub-task options for a material budget line (one per canonical_key, tagged to a
// representative line item id) — for tagging a cost entry to a sub-task, not just the category.
function matSubtaskOptions(line) {
  if (!line) return [];
  const labelByKey = Object.fromEntries((line.subtaskOptions || []).map((o) => [o.key, o.label]));
  const byKey = new Map();
  for (const li of line.lineItems || []) {
    if (li.canonicalKey && !byKey.has(li.canonicalKey)) byKey.set(li.canonicalKey, li.id);
  }
  return [...byKey.entries()].map(([key, lineItemId]) => ({ key, label: labelByKey[key] || key, lineItemId }));
}

function CostsTab({ jobId }) {
  const [costs, setCosts]       = useState([]);
  const [summary, setSummary]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);
  const [materialLines, setMaterialLines] = useState([]); // D5: material budget lines to tag costs against
  const [form, setForm]         = useState({
    costType: CARPENTRY_COST_TYPES.MATERIAL,
    description: "",
    amount: "",
    costDate: new Date().toISOString().slice(0, 10),
    budgetLineId: "",
    budgetLineItemId: "",
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    const [costsRes, summaryRes, budgetRes] = await Promise.all([
      apiFetch(`/api/carpentry/jobs/${jobId}/costs`),
      apiFetch(`/api/carpentry/jobs/${jobId}/summary`),
      apiFetch(`/api/carpentry/jobs/${jobId}/budget`),
    ]);
    setLoading(false);
    if (costsRes.ok) setCosts(costsRes.data?.costs || []);
    if (summaryRes.ok) setSummary(summaryRes.data?.summary || null);
    if (budgetRes.ok) setMaterialLines((budgetRes.data?.lines || []).filter((l) => l.costType === "material"));
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  async function saveCost() {
    if (!form.description.trim()) { setError("Description is required."); return; }
    if (!form.amount || Number(form.amount) < 0) { setError("Amount must be a non-negative number."); return; }
    setSaving(true);
    setError(null);
    const { ok, data, error: e } = await apiPost(`/api/carpentry/jobs/${jobId}/costs`, {
      costType: form.costType,
      description: form.description.trim(),
      amount: Number(form.amount),
      costDate: form.costDate,
      carpentryJobBudgetId: form.budgetLineId || undefined,
      carpentryBudgetLineItemId: form.budgetLineItemId || undefined,
    });
    setSaving(false);
    if (!ok) { setError(e || "Failed to add cost."); return; }
    setCosts((cs) => [data.cost, ...cs]);
    setForm({ costType: CARPENTRY_COST_TYPES.MATERIAL, description: "", amount: "", costDate: new Date().toISOString().slice(0, 10), budgetLineId: "", budgetLineItemId: "" });
    setShowForm(false);
    // Reload summary
    const { ok: sOk, data: sData } = await apiFetch(`/api/carpentry/jobs/${jobId}/summary`);
    if (sOk) setSummary(sData?.summary || null);
  }

  async function deleteCost(c) {
    if (!confirm(`Delete cost entry "${c.description}"?`)) return;
    const { ok } = await apiDelete(`/api/carpentry/costs/${c.id}`);
    if (ok) {
      setCosts((cs) => cs.filter((x) => x.id !== c.id));
      const { ok: sOk, data: sData } = await apiFetch(`/api/carpentry/jobs/${jobId}/summary`);
      if (sOk) setSummary(sData?.summary || null);
    }
  }

  const varianceColor = (v) => {
    if (v == null) return "text-muted";
    return v >= 0 ? "text-emerald-700" : "text-red-600";
  };

  return (
    <div className="p-6">
      {/* Budget vs Actual card (CostsTab is already Director-only via the tab gate) */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 p-4 bg-slate-50 rounded-card border border-hairline">
          <div>
            <p className="text-xs text-muted font-medium mb-0.5">Revenue</p>
            <p className="text-lg font-semibold text-ink">{fmt$(summary.revenue)}</p>
            <p className="text-xs text-muted">quoted ex GST</p>
          </div>
          <div>
            <p className="text-xs text-muted font-medium mb-0.5">Total Actual Cost</p>
            <p className="text-lg font-semibold text-ink">{fmt$(summary.totalActual)}</p>
            <p className="text-xs text-muted">labour + materials</p>
          </div>
          <div>
            <p className="text-xs text-muted font-medium mb-0.5">Forecast Margin</p>
            <p className={`text-lg font-semibold ${summary.forecastMarginPct != null && summary.forecastMarginPct < 0 ? "text-red-600" : "text-ink"}`}>
              {fmtPct(summary.forecastMarginPct)}
            </p>
            <p className="text-xs text-muted">budget: {fmtPct(summary.budgetMarginPct)}</p>
          </div>
          <div>
            <p className="text-xs text-muted font-medium mb-0.5">Variance</p>
            <p className={`text-lg font-semibold ${varianceColor(summary.variance)}`}>
              {summary.variance != null ? (summary.variance >= 0 ? "+" : "") + fmtPct(summary.variance) : "—"}
            </p>
            <p className="text-xs text-muted">vs budget margin</p>
          </div>
        </div>
      )}

      {/* Labour breakdown */}
      {summary && (
        <div className="flex gap-6 mb-5 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
            <span className="text-muted">Labour actual:</span>
            <span className="font-medium text-ink">{fmt$(summary.labourActual)}</span>
            <span className="text-xs text-muted">({summary.timesheetCount} timesheet{summary.timesheetCount !== 1 ? "s" : ""})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
            <span className="text-muted">Materials + other:</span>
            <span className="font-medium text-ink">{fmt$(summary.otherActual)}</span>
            <span className="text-xs text-muted">({summary.costEntryCount} entr{summary.costEntryCount !== 1 ? "ies" : "y"})</span>
          </div>
        </div>
      )}

      {/* Cost entries */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-ink">Material &amp; Other Costs</h3>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-4 py-1.5 text-xs rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors"
        >
          {showForm ? "Cancel" : "+ Add Cost"}
        </button>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-4">{error}</div>}

      {showForm && (
        <div className="mb-4 p-4 bg-slate-50 rounded-card border border-hairline space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Type</label>
              <select value={form.costType} onChange={(e) => set("costType", e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring bg-white">
                {Object.entries(CARPENTRY_COST_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Amount (ex GST)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
                <input type="number" min={0} step={0.01} value={form.amount} onChange={(e) => set("amount", e.target.value)} className="w-full border border-hairline rounded-lg pl-7 pr-3 py-2 text-sm focus-ring" placeholder="0.00" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Description</label>
              <input value={form.description} onChange={(e) => set("description", e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring" placeholder="e.g. LVL beams from Bowens" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Date</label>
              <input type="date" value={form.costDate} onChange={(e) => set("costDate", e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring" />
            </div>
          </div>
          {materialLines.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Budget line (for per-category actuals)</label>
                <select value={form.budgetLineId} onChange={(e) => setForm((f) => ({ ...f, budgetLineId: e.target.value, budgetLineItemId: "" }))} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring bg-white">
                  <option value="">Unassigned (counts in material total only)</option>
                  {materialLines.map((l) => <option key={l.id} value={l.id}>{l.categoryName}</option>)}
                </select>
              </div>
              {(() => {
                const opts = matSubtaskOptions(materialLines.find((l) => l.id === form.budgetLineId));
                if (!opts.length) return null;
                return (
                  <div>
                    <label className="block text-xs font-medium text-ink mb-1">Sub-task (optional)</label>
                    <select value={form.budgetLineItemId} onChange={(e) => set("budgetLineItemId", e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring bg-white">
                      <option value="">Whole category</option>
                      {opts.map((o) => <option key={o.lineItemId} value={o.lineItemId}>{o.label}</option>)}
                    </select>
                  </div>
                );
              })()}
            </div>
          )}
          <div className="flex justify-end">
            <button
              onClick={saveCost}
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-40 transition-colors"
            >
              {saving ? "Saving…" : "Add Cost"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : costs.length === 0 ? (
        <p className="text-sm text-muted">No cost entries yet.</p>
      ) : (
        <div className="overflow-x-auto bg-white rounded-card border border-hairline">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline bg-slate-50 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-muted uppercase">Date</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted uppercase">Type</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted uppercase">Description</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted uppercase text-right">Amount</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {costs.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">{c.costDate}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                      {CARPENTRY_COST_TYPE_LABELS[c.costType] || c.costType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink">{c.description}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-ink">{fmt$(c.amount)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => deleteCost(c)} className="text-muted hover:text-red-500 text-xs transition-colors">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

// ── Margin gauge (labour 25% / material 20%) ───────────────────────────────────
// Margin-first view. The bar is what we CHARGE (sell ex-GST); the fill is what the
// work is really costing (real timesheets + real invoices — never the stale estimate
// line cost). The green tail is the margin we keep; the dashed line is where cost
// would start eating it. Targets: 25% labour, 20% material. Projected final margin
// (needs task-level % complete) is the next build — this shows spend-vs-allowable now.
const MARGIN_TARGET = { labour: 0.25, material: 0.20 };
const GAUGE_COLOR = { labour: "#006c9b", material: "#D4A24C", margin: "#2E6B4F", over: "#DC2626" };
const clampPct = (n) => Math.max(0, Math.min(100, n));

function MarginThermometer({ label, sell, actual, target, color, projectedCost = null, pctComplete = null }) {
  const s = Number(sell) || 0;
  const a = Number(actual) || 0;
  const allowable = s * (1 - target);
  const boundary = (1 - target) * 100;                 // where cost starts eating margin
  const costPct = clampPct(s > 0 ? (a / s) * 100 : 0);
  const onBudget = Math.min(costPct, boundary);
  const headroom = Math.max(0, boundary - costPct);
  const marginEaten = clampPct(Math.max(0, costPct - boundary));
  const marginLeft = Math.max(0, 100 - Math.max(costPct, boundary));
  const consumed = allowable > 0 ? a / allowable : 0;
  const state = a === 0 ? "idle" : consumed >= 1 ? "over" : consumed >= 0.9 ? "warn" : "ok";
  const spendBadge = {
    idle: { cls: "bg-page text-muted",       t: "Not started" },
    ok:   { cls: "bg-accent/10 text-accent", t: "Margin intact" },
    warn: { cls: "bg-warning/10 text-warning", t: "Approaching limit" },
    over: { cls: "bg-red-50 text-red-600",   t: "Eating margin" },
  }[state];

  // P1: projected final margin, from % work complete (projectedCost = actual ÷ %complete). Only when supplied.
  const hasProj = projectedCost != null && s > 0;
  const projPct = hasProj ? clampPct((projectedCost / s) * 100) : null;
  const projMarginPct = hasProj ? ((s - projectedCost) / s) * 100 : null;
  const projState = !hasProj ? null
    : projMarginPct >= target * 100 ? "ok"
    : projMarginPct >= target * 100 - 5 ? "warn" : "over";
  const projBadgeCls = { ok: "bg-accent/10 text-accent", warn: "bg-warning/10 text-warning", over: "bg-red-50 text-red-600" }[projState];
  const markerColor = hasProj && projPct > boundary ? GAUGE_COLOR.over : GAUGE_COLOR.margin;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
          <span className="text-sm font-semibold text-ink">{label}</span>
          <span className="text-xs text-muted">· target {Math.round(target * 100)}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          {hasProj && (
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${projBadgeCls}`} title="Projected final margin at current burn">
              Proj. {fmtPct(projMarginPct)}
            </span>
          )}
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${spendBadge.cls}`}>{spendBadge.t}</span>
        </div>
      </div>
      <div className="relative h-8 rounded-lg overflow-hidden border border-hairline flex">
        <div style={{ width: `${onBudget}%`, background: color }} />
        <div style={{ width: `${headroom}%`, background: `${color}22` }} />
        <div style={{ width: `${marginEaten}%`, background: GAUGE_COLOR.over }} />
        <div className="flex items-center justify-center" style={{ width: `${marginLeft}%`, background: `${GAUGE_COLOR.margin}33` }}>
          {marginLeft > 12 && <span className="text-[10px] font-bold" style={{ color: GAUGE_COLOR.margin }}>{Math.round(target * 100)}% margin</span>}
        </div>
        <div className="absolute top-0 bottom-0 border-l-2 border-dashed border-ink/40" style={{ left: `${boundary}%` }} />
        {hasProj && (
          <div className="absolute top-0 bottom-0" style={{ left: `${projPct}%` }} title={`Projected final cost ${fmt$(projectedCost)} → ${fmtPct(projMarginPct)} margin`}>
            <div className="w-0.5 h-full -ml-px" style={{ background: markerColor }} />
            <div className="absolute -top-1 -ml-1 w-2 h-2 rounded-full border border-white" style={{ background: markerColor, left: 0 }} />
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-[11px] text-muted">
        <span><span className="font-semibold text-ink">{fmt$(a)}</span> spent{allowable > 0 ? ` · ${Math.round((a / allowable) * 100)}% of allowable` : ""}</span>
        {pctComplete != null && <span><span className="font-semibold text-ink">{Math.round(pctComplete * 100)}%</span> work done</span>}
        {hasProj && <span>Projected final cost <span className="font-semibold" style={{ color: markerColor }}>{fmt$(projectedCost)}</span></span>}
        <span>Allowable <span className="font-semibold text-ink">{fmt$(allowable)}</span></span>
        <span>Charging <span className="font-semibold text-ink">{fmt$(s)}</span></span>
      </div>
    </div>
  );
}

function MarginGauge({ totals }) {
  const labourSell = Number(totals.labourBudget) || 0;
  const materialSell = Number(totals.materialBudget) || 0;
  const totalSell = labourSell + materialSell;
  const targetProfit = labourSell * MARGIN_TARGET.labour + materialSell * MARGIN_TARGET.material;
  const blendedPct = totalSell > 0 ? (targetProfit / totalSell) * 100 : null;
  const allowableTot = totalSell - targetProfit;
  const actualTot = Number(totals.totalActual) || 0;
  const over = actualTot > allowableTot;

  // P1: labour projection — prefer the task-derived %, fall back to a manual % where there's no task signal.
  const proj = totals.projection || {};
  const labourActual = Number(totals.labourActual) || 0;
  const [manualPct, setManualPct] = useState("");
  const manualNum = parseFloat(manualPct);
  const manualValid = manualNum > 0 && manualNum <= 100;
  const derivedProjCost = proj.labourProjectedCost != null ? Number(proj.labourProjectedCost) : null;
  const labourProjCost = derivedProjCost != null ? derivedProjCost
    : (manualValid ? labourActual / (manualNum / 100) : null);
  const labourPct = proj.labourPctComplete != null ? Number(proj.labourPctComplete)
    : (manualValid ? manualNum / 100 : null);
  const showManual = derivedProjCost == null;  // no task-derived projection yet

  return (
    <div className="rounded-lg border border-hairline bg-surface p-4 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted">Target margin (blended)</p>
          <p className="text-2xl font-bold text-ink leading-tight">{fmtPct(blendedPct)}</p>
          <p className="text-xs text-muted">{fmt$(targetProfit)} profit on {fmt$(totalSell)} charged</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted">Cost so far</p>
          <p className="text-lg font-bold text-ink">{fmt$(actualTot)}</p>
          <p className="text-xs text-muted">of {fmt$(allowableTot)} allowable</p>
        </div>
        <div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${over ? "bg-red-50 text-red-600" : "bg-accent/10 text-accent"}`}>
            {over ? "Over allowable — margin at risk" : "On target — margin protected"}
          </span>
        </div>
      </div>
      <div className="space-y-4">
        <MarginThermometer label="Labour" sell={labourSell} actual={labourActual} target={MARGIN_TARGET.labour} color={GAUGE_COLOR.labour} projectedCost={labourProjCost} pctComplete={labourPct} />
        <MarginThermometer label="Material" sell={materialSell} actual={Number(totals.materialActual) || 0} target={MARGIN_TARGET.material} color={GAUGE_COLOR.material} />
      </div>
      {showManual && (
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <span>No task completion logged yet — enter labour&nbsp;% complete to project final margin:</span>
          <input type="number" min="1" max="100" value={manualPct} onChange={(e) => setManualPct(e.target.value)}
            className="w-16 border border-hairline rounded px-2 py-1 text-xs text-ink focus-ring" placeholder="%" />
        </div>
      )}
      <p className="text-[11px] text-muted">Bar = what we charge · fill = real cost so far · <span style={{ color: GAUGE_COLOR.margin }}>●</span> projected final cost from % work done · dashed line = where cost starts eating margin.</p>
    </div>
  );
}

// ── Budget Tab ────────────────────────────────────────────────────────────────

// ── Sub-task sections (Phase 3 drill-down + confirm) ──────────────────────────
// A budget line's estimate leaves grouped into sub-task sections (by canonical_key).
// Move a leaf between sections, add / delete a section, confirm the mapping. Unmapped
// leaves roll up to the parent category. Editing here is the human-confirmed mapping.
function SubtaskSections({ line, jobId, onChanged }) {
  const options = line.subtaskOptions || [];
  const labelByKey = Object.fromEntries(options.map((o) => [o.key, o.label]));
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKey, setNewKey] = useState("");
  // Local working copy — moves/adds/deletes are instant (no reload); persisted only on Confirm.
  const [items, setItems] = useState(() => (line.lineItems || []).map((it) => ({ ...it, _key: it.id })));
  const [deletedIds, setDeletedIds] = useState([]);
  const [dirty, setDirty] = useState(false);

  // Re-sync when the server data changes (i.e. after a save + reload).
  useEffect(() => {
    setItems((line.lineItems || []).map((it) => ({ ...it, _key: it.id })));
    setDeletedIds([]);
    setDirty(false);
  }, [line.lineItems]);

  if (!items.length && !dirty) {
    return <div className="px-4 py-3 text-xs text-muted">No sub-tasks yet — re-import the estimate XLSX to split this category into sub-tasks.</div>;
  }

  const groups = {};
  for (const it of items) { const k = it.canonicalKey || ""; (groups[k] ||= []).push(it); }
  const keys = Object.keys(groups).sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b))); // unmapped last
  const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const anySuggested = items.some((it) => it.status === "suggested");
  const secLabel = (k) => (k === "" ? "Unmapped — rolls up to this category" : (labelByKey[k] || k));

  // ── Instant local edits (no network, no reload) ──
  const moveLocal = (localKey, canonicalKey) => {
    setItems((prev) => prev.map((it) => (it._key === localKey ? { ...it, canonicalKey: canonicalKey || null } : it)));
    setDirty(true);
  };
  const dissolveLocal = (k) => {
    setItems((prev) => prev.flatMap((it) => {
      if ((it.canonicalKey || "") !== k) return [it];
      if (it._new || it.source === "manual") { if (it.id) setDeletedIds((d) => [...d, it.id]); return []; }
      return [{ ...it, canonicalKey: null }]; // dissolve estimate leaves → unmapped (roll to parent)
    }));
    setDirty(true);
  };
  const addLocal = () => {
    const desc = newName.trim(); if (!desc) return;
    setItems((prev) => [...prev, { _key: crypto.randomUUID(), id: null, description: desc, canonicalKey: newKey || null, sellExGst: 0, costExGst: 0, status: "suggested", source: "manual", _new: true }]);
    setDirty(true); setNewName(""); setNewKey(""); setAdding(false);
  };

  // ── Persist all pending edits, then lock (confirm) + reload once ──
  async function saveAndConfirm() {
    setBusy(true);
    try {
      const originalKey = {};
      for (const it of (line.lineItems || [])) originalKey[it.id] = it.canonicalKey || "";
      for (const id of deletedIds) await apiDelete(`/api/carpentry/budget/line-items/${id}`);
      for (const it of items) {
        if (it._new) {
          await apiPost(`/api/carpentry/jobs/${jobId}/budget/line-items`, { budgetLineId: line.id, description: it.description, canonicalKey: it.canonicalKey || null });
        } else if ((it.canonicalKey || "") !== originalKey[it.id]) {
          await apiPatch(`/api/carpentry/budget/line-items/${it.id}`, { canonicalKey: it.canonicalKey || null });
        }
      }
      await apiPost(`/api/carpentry/jobs/${jobId}/budget/line-items/confirm`, {});
    } finally {
      setBusy(false);
      onChanged(); // single reload at the end — locks the confirmed mapping
    }
  }

  const canConfirm = dirty || anySuggested;

  return (
    <div className="px-4 py-3 bg-page space-y-2">
      {keys.map((k) => {
        const rows = groups[k];
        return (
          <div key={k || "__unmapped"} className="rounded-lg border border-hairline bg-surface">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-hairline">
              <span className="text-xs font-semibold text-ink">{secLabel(k)}<span className="text-muted font-normal"> · {rows.length} line{rows.length > 1 ? "s" : ""}</span></span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-ink tabular-nums">{fmt$(sum(rows, (x) => x.sellExGst))}</span>
                {k !== "" && <button type="button" disabled={busy} onClick={() => dissolveLocal(k)} title="Delete section — its lines roll up to the parent" className="text-red-600 border border-hairline rounded w-5 h-5 leading-none text-sm disabled:opacity-40">×</button>}
              </div>
            </div>
            <div className="divide-y divide-hairline">
              {rows.map((it) => (
                <div key={it._key} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="flex-1 min-w-0 text-xs text-muted truncate" title={it.description}>{it.description}</span>
                  <span className="text-xs text-ink tabular-nums whitespace-nowrap">{fmt$(it.sellExGst)}</span>
                  <select disabled={busy} value={it.canonicalKey || ""} onChange={(e) => moveLocal(it._key, e.target.value)}
                    className="text-xs border border-hairline rounded px-1 py-0.5 bg-white text-ink max-w-[140px]">
                    <option value="">— unmapped —</option>
                    {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                    {it.canonicalKey && !labelByKey[it.canonicalKey] && <option value={it.canonicalKey}>{it.canonicalKey}</option>}
                  </select>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="flex items-center justify-between pt-1 gap-2 flex-wrap">
        {adding ? (
          <div className="flex items-center gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Sub-task name" className="text-xs border border-hairline rounded px-2 py-1 text-ink" />
            <select value={newKey} onChange={(e) => setNewKey(e.target.value)} className="text-xs border border-hairline rounded px-1 py-1 bg-white text-ink">
              <option value="">custom (this job only)</option>
              {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <button type="button" onClick={addLocal} className="text-xs font-semibold text-white bg-accent rounded px-2 py-1">Add</button>
            <button type="button" onClick={() => { setAdding(false); setNewName(""); setNewKey(""); }} className="text-xs text-muted">Cancel</button>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="text-xs font-medium text-accent border border-dashed border-accent rounded px-2 py-1">＋ Add sub-task</button>
        )}
        <div className="flex items-center gap-2">
          {dirty && <span className="text-[11px] text-amber-600">Unsaved</span>}
          {canConfirm && (
            <button type="button" disabled={busy} onClick={saveAndConfirm} title="Save changes and lock the mapping as confirmed"
              className="text-xs font-semibold text-white bg-primary rounded px-3 py-1 disabled:opacity-40">
              {busy ? "Saving…" : dirty ? "Save & confirm ✓" : "Confirm mapping ✓"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function BudgetTab({ jobId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());
  const toggleExpand = (id) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Background refresh — keeps the current view rendered (no "Loading…" blank, no scroll jump).
  function reload() {
    apiFetch(`/api/carpentry/jobs/${jobId}/budget`).then(({ ok, data: d }) => {
      if (ok) setData(d);
    });
  }

  useEffect(() => {
    let stop = false;
    apiFetch(`/api/carpentry/jobs/${jobId}/budget`).then(({ ok, data: d }) => {
      if (stop) return;
      setLoading(false);
      if (ok) setData(d);
    });
    return () => { stop = true; };
  }, [jobId]);

  async function handleXlsx(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSeeding(true);
    setSeedError("");
    try {
      const dataBase64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onerror = () => reject(new Error("read failed"));
        r.onload = () => resolve(String(r.result).replace(/^data:.*;base64,/, ""));
        r.readAsDataURL(file);
      });
      const { ok: parsed, data: pd, error: pe } = await apiPost("/api/carpentry/estimate/parse-xlsx", { dataBase64, filename: file.name });
      if (!parsed) { setSeedError(pe || "Could not read the estimate file."); return; }
      const categories = Array.isArray(pd?.raw?.categories) ? pd.raw.categories : [];
      if (!categories.length) { setSeedError("No estimate categories found in that file."); return; }
      const { ok: seeded, error: se } = await apiPost(`/api/carpentry/jobs/${jobId}/budget/seed`, { categories });
      if (!seeded) { setSeedError(se || "Budget seed failed."); return; }
      reload();
    } catch {
      setSeedError("Could not read that file — make sure it is the Buildexact estimate XLSX.");
    } finally {
      setSeeding(false);
    }
  }

  if (loading) return <div className="p-6 text-sm text-muted">Loading budget…</div>;
  const lines = data?.lines || [];
  if (!lines.length) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm text-muted">No budget lines yet. Import the Buildexact estimate XLSX to seed them automatically.</p>
        <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition
          ${seeding ? "bg-gray-100 text-muted" : "bg-primary text-white hover:bg-primary/90"}`}>
          {seeding ? "Importing…" : "Import estimate XLSX"}
          <input type="file" accept=".xlsx" className="hidden" disabled={seeding} onChange={handleXlsx} />
        </label>
        {seedError && <p className="text-sm text-red-600">{seedError}</p>}
      </div>
    );
  }
  const t = data.totals || {};
  const labour = lines.filter((l) => l.costType === "labour");
  const material = lines.filter((l) => l.costType === "material");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">{seedError && <span className="text-sm text-red-600">{seedError}</span>}</div>
        <label className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap ${seeding ? "bg-gray-100 text-muted" : "border border-hairline text-ink hover:bg-page"}`}
          title="Re-import to refresh the budget and generate sub-tasks from the estimate leaf items">
          {seeding ? "Importing…" : "Re-import estimate XLSX"}
          <input type="file" accept=".xlsx" className="hidden" disabled={seeding} onChange={handleXlsx} />
        </label>
      </div>
      <MarginGauge totals={t} />

      {data.burn?.available ? (
        <div className="rounded-lg border border-hairline bg-page p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">Labour burn‑rate</p>
              <p className="text-xs text-muted">
                Full team ({data.burn.headcount} staff) · {fmt$(data.burn.teamBreakEvenPerDay)}/day cost · {fmt$(data.burn.teamChargeUpPerDay)}/day charge‑up
              </p>
            </div>
            <div className="flex gap-5 text-right">
              <div><p className="text-xs text-muted">Budget supports</p><p className="text-lg font-bold text-ink">{data.burn.atMarginDays ?? "—"}<span className="text-xs font-normal text-muted"> days @ margin</span></p></div>
              <div><p className="text-xs text-muted">Break‑even</p><p className="text-lg font-bold text-ink">{data.burn.breakEvenDays ?? "—"}<span className="text-xs font-normal text-muted"> days</span></p></div>
              <div><p className="text-xs text-muted">Labour margin left</p><p className={`text-lg font-bold ${data.burn.labourMarginRemaining < 0 ? "text-red-600" : "text-emerald-700"}`}>{fmt$(data.burn.labourMarginRemaining)}</p></div>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted">Sync the Company Cost Model (Settings → Company Cost Model) to see the labour burn‑rate — how many full‑team days this budget supports before it&apos;s unprofitable.</p>
      )}

      <div>
        <h3 className="text-sm font-semibold text-ink mb-2">Labour — actuals from workforce timesheets</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-muted border-b border-hairline">
            <th className="text-left py-2 pr-3 font-medium">Category</th>
            <th className="text-right py-2 px-3 font-medium">Budget</th>
            <th className="text-right py-2 px-3 font-medium">Actual</th>
            <th className="text-right py-2 px-3 font-medium">Variance</th>
            <th className="text-right py-2 px-3 font-medium" title="Task completion for this category (done ÷ counted site tasks)">% done</th>
            <th className="text-right py-2 px-3 font-medium" title="Projected final margin at current burn (actual ÷ % done, vs sell) — target 25%">Proj. margin</th>
            <th className="text-right py-2 pl-3 font-medium" title="Full-team days this category's budget supports at target margin">Days @ margin</th>
          </tr></thead>
          <tbody>
            {labour.map((l) => {
              const dot = l.burn?.status === "over" ? "text-red-600" : l.burn?.status === "warn" ? "text-amber-600" : "text-emerald-700";
              const projCls = l.projectedMarginPct == null ? "text-muted"
                : l.projectedMarginPct >= MARGIN_TARGET.labour * 100 ? "text-emerald-700"
                : l.projectedMarginPct >= MARGIN_TARGET.labour * 100 - 5 ? "text-amber-600" : "text-red-600";
              const canExpand = ((l.lineItems?.length || 0) + (l.subtaskOptions?.length || 0)) > 0;
              const isOpen = expanded.has(l.id);
              const needsReview = (l.lineItems || []).some((it) => it.status === "suggested");
              const rows = [(
                <tr key={l.id} className="border-b border-hairline last:border-0">
                  <td className="py-2 pr-3 text-ink">
                    {canExpand ? (
                      <button type="button" onClick={() => toggleExpand(l.id)} className="inline-flex items-center gap-1.5 hover:text-primary text-left">
                        <span className="text-[9px] text-muted w-2">{isOpen ? "▼" : "▶"}</span>
                        <span>{l.categoryName}</span>
                        {needsReview && <span className="text-[9px] font-semibold text-primary bg-primary/10 rounded px-1 py-0.5">review</span>}
                      </button>
                    ) : l.categoryName}
                  </td>
                  <td className="py-2 px-3 text-right text-muted">{fmt$(l.budget)}</td>
                  <td className="py-2 px-3 text-right text-ink">{fmt$(l.actual)}</td>
                  <td className={`py-2 px-3 text-right font-medium ${l.variance < 0 ? "text-red-600" : "text-emerald-700"}`}>{fmt$(l.variance)}</td>
                  <td className="py-2 px-3 text-right text-muted">{l.pctComplete != null ? `${Math.round(l.pctComplete * 100)}%` : "—"}</td>
                  <td className={`py-2 px-3 text-right font-semibold ${projCls}`}>{l.projectedMarginPct != null ? fmtPct(l.projectedMarginPct) : "—"}</td>
                  <td className={`py-2 pl-3 text-right font-semibold ${dot}`}>{l.burn?.atMarginDays != null ? `${l.burn.atMarginDays}d` : "—"}</td>
                </tr>
              )];
              if (canExpand && isOpen) rows.push(
                <tr key={l.id + "-sub"}><td colSpan={7} className="p-0"><SubtaskSections line={l} jobId={jobId} onChanged={reload} /></td></tr>
              );
              return rows;
            })}
          </tbody>
        </table>
        {labour.some((l) => !l.workforceTaskCategory) && (
          <p className="text-xs text-amber-600 mt-1">Some labour lines have no workforce task mapped — those actuals will not accrue until mapped.</p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-ink mb-2">Material / supply — budget vs actual</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-muted border-b border-hairline">
            <th className="text-left py-2 pr-3 font-medium">Category</th>
            <th className="text-right py-2 px-3 font-medium">Budget</th>
            <th className="text-right py-2 px-3 font-medium">Actual</th>
            <th className="text-right py-2 pl-3 font-medium">Variance</th>
          </tr></thead>
          <tbody>
            {material.map((l) => {
              const canExpand = ((l.lineItems?.length || 0) + (l.subtaskOptions?.length || 0)) > 0;
              const isOpen = expanded.has(l.id);
              const needsReview = (l.lineItems || []).some((it) => it.status === "suggested");
              const rows = [(
                <tr key={l.id} className="border-b border-hairline last:border-0">
                  <td className="py-2 pr-3 text-ink">
                    {canExpand ? (
                      <button type="button" onClick={() => toggleExpand(l.id)} className="inline-flex items-center gap-1.5 hover:text-primary text-left">
                        <span className="text-[9px] text-muted w-2">{isOpen ? "▼" : "▶"}</span>
                        <span>{l.categoryName}</span>
                        {needsReview && <span className="text-[9px] font-semibold text-primary bg-primary/10 rounded px-1 py-0.5">review</span>}
                      </button>
                    ) : l.categoryName}
                  </td>
                  <td className="py-2 px-3 text-right text-muted">{fmt$(l.budget)}</td>
                  <td className="py-2 px-3 text-right text-ink">{l.actual ? fmt$(l.actual) : "—"}</td>
                  <td className={`py-2 pl-3 text-right ${l.variance < 0 ? "text-red-600" : "text-muted"}`}>{fmt$(l.variance)}</td>
                </tr>
              )];
              if (canExpand && isOpen) rows.push(
                <tr key={l.id + "-sub"}><td colSpan={4} className="p-0"><SubtaskSections line={l} jobId={jobId} onChanged={reload} /></td></tr>
              );
              return rows;
            })}
          </tbody>
        </table>
        <p className="text-xs text-muted mt-1">Per-category actuals come from cost entries tagged to a budget line (Costs tab → Budget line). Untagged costs still count in the material total ({fmt$(t.materialActual)}).</p>
      </div>
    </div>
  );
}

const TABS = [
  { id: "overview",  label: "Overview" },
  { id: "schedule",  label: "Schedule" },
  { id: "diary",     label: "Diary" },
  { id: "costs",     label: "Costs" },
  { id: "budget",    label: "Budget" },
];

export default function CarpentryJobDetail() {
  const { jobId } = useParams();
  const navigate  = useNavigate();
  const { role } = useAuth();
  // Cost-stripped view for supervisors: they manage the build (schedule, tasks,
  // diary) but don't see Costs/Budget $ figures. Directors/admin see everything.
  const showCost = can.viewCostData(role);
  const visibleTabs = TABS.filter((t) => showCost || (t.id !== "budget" && t.id !== "costs"));
  const [tab, setTab]         = useState("overview");
  const [job, setJob]         = useState(null);
  const [performance, setPerformance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const loadJob = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { ok, data, error: e } = await apiFetch(`/api/carpentry/jobs/${jobId}`);
    setLoading(false);
    if (!ok) { setError(e || "Could not load job."); return; }
    setJob(data?.job || null);
    setPerformance(data?.performance || null);
  }, [jobId]);

  useEffect(() => { loadJob(); }, [loadJob]);

  if (loading) return <div className="p-10 text-center text-muted text-sm">Loading…</div>;
  if (error)   return <div className="p-10 text-center text-red-600 text-sm">{error}</div>;
  if (!job)    return <div className="p-10 text-center text-muted text-sm">Job not found.</div>;

  // BLB Charge Up gets its own layout (site list + per-site hours), not the standard tabs.
  // Branch on the reference specifically — BL-INTERNAL is also project_type='other' but keeps the tabs.
  if (job.reference === CHARGE_UP_REFERENCE) return <ChargeUpJobDetail job={job} />;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted mb-4">
        <button onClick={() => navigate("/carpentry")} className="hover:text-ink transition-colors">Carpentry</button>
        <span>›</span>
        <span className="text-ink font-medium">{job.reference}</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-hairline mb-0 -mb-px">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-white rounded-b-card border border-t-0 border-hairline">
        {tab === "overview" && (
          <OverviewTab
            job={job}
            performance={performance}
            onUpdated={loadJob}
            onStatusChange={(status) => setJob((j) => ({ ...j, status }))}
            onDeleted={() => navigate("/carpentry")}
            showCost={showCost}
          />
        )}
        {tab === "schedule" && <ScheduleTab jobId={job.id} jobStartDate={job.startDate} onStartDateSaved={(d) => setJob((j) => ({ ...j, startDate: d }))} />}
        {tab === "diary"    && <DiaryTab job={job} />}
        {tab === "costs"    && showCost && <CostsTab jobId={job.id} />}
        {tab === "budget"   && showCost && <BudgetTab jobId={job.id} />}
      </div>
    </div>
  );
}
