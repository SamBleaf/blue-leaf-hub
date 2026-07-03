import { useCallback, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useBlueprintContext } from "../lib/BlueprintContext.jsx";
import { authFetch } from "../lib/authFetch.js";
import { displayLeadName } from "../lib/leadUtils.js";
import { LEAD_STAGES } from "../lib/constants.js";
import {
  STAGES, PROJECT_TYPES, LEAD_SOURCES,
  formatValue, projectTypeLabel, relativeTime, weightedValue, matchesFilter,
} from "../lib/salesPipeline.js";
import { RotDot, ScoreBadge, StagePill, FitQualityBadge, ReadinessBadge } from "../components/sales/SalesBits.jsx";
import SalesScorecard from "../components/sales/SalesScorecard.jsx";
import SalesPipelineHeader from "../components/sales/SalesPipelineHeader.jsx";
import PipelineFilterBar from "../components/sales/PipelineFilterBar.jsx";
import SalesKanbanBoard from "../components/sales/SalesKanbanBoard.jsx";
import SalesMobileLeadList from "../components/sales/SalesMobileLeadList.jsx";
import SalesActionQueue from "../components/sales/SalesActionQueue.jsx";
import KpiCard from "../components/ui/KpiCard.jsx";
import SafeBottomSpacer from "../components/ui/SafeBottomSpacer.jsx";

const STAGE_IDS = new Set(STAGES.map((s) => s.id));

// localStorage key for the qualified-only pipeline toggle (CRM Batch 01A)
const QUALIFIED_ONLY_KEY = "blhub_pipeline_qualified_only";

/* ─────────────────────────── Add Lead drawer (unchanged) ─────────────────────────── */
function AddLeadDrawer({ open, onClose, onCreated }) {
  const EMPTY = { first_name: "", last_name: "", email: "", phone: "", suburb: "", project_type: "", lead_source: "", estimated_value: "" };
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    if (!form.first_name.trim()) { setErr("First name is required."); return; }
    if (!form.lead_source) { setErr("Lead source is required — it's how we track which marketing produces good leads."); return; }
    setBusy(true); setErr("");
    try {
      const body = { ...form };
      if (body.estimated_value) body.estimated_value = parseFloat(body.estimated_value) || null;
      else delete body.estimated_value;
      const r = await authFetch("/api/sales/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Failed to create lead");
      setForm(EMPTY);
      onCreated(j.lead);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="flex w-full max-w-md flex-col overflow-y-auto bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
          <h2 className="text-lg font-semibold text-ink">New Lead</h2>
          <button onClick={onClose} className="text-2xl leading-none text-muted hover:text-ink">×</button>
        </div>
        <form onSubmit={submit} className="flex-1 space-y-4 px-6 py-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">First name *</label>
              <input className="focus-ring w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink" value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Last name</label>
              <input className="focus-ring w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink" value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Email</label>
            <input type="email" className="focus-ring w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Phone</label>
            <input type="tel" className="focus-ring w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Suburb</label>
            <input className="focus-ring w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink" value={form.suburb} onChange={(e) => set("suburb", e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Project type</label>
            <select className="focus-ring w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink" value={form.project_type} onChange={(e) => set("project_type", e.target.value)}>
              <option value="">Select…</option>
              {PROJECT_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Estimated value ($)</label>
            <input type="number" min="0" step="1000" className="focus-ring w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink" value={form.estimated_value} onChange={(e) => set("estimated_value", e.target.value)} placeholder="e.g. 650000" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Lead source *</label>
            <select className="focus-ring w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink" value={form.lead_source} onChange={(e) => set("lead_source", e.target.value)}>
              <option value="">Select…</option>
              {LEAD_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-hairline px-4 py-2 text-sm text-ink hover:bg-page">Cancel</button>
            <button type="submit" disabled={busy} className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {busy ? "Adding…" : "Add Lead"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─────────────────────────── Architect Tender drawer (unchanged) ─────────────────────────── */
function AddArchitectTenderDrawer({ open, onClose, onCreated }) {
  const EMPTY = { first_name: "", last_name: "", site_address: "", architect_name: "", project_type: "", estimated_value: "" };
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    if (!form.first_name.trim()) { setErr("Client first name is required."); return; }
    if (!form.site_address.trim()) { setErr("Site address is required."); return; }
    setBusy(true); setErr("");
    try {
      const body = { ...form, lead_type: "architect_tender", stage: "accepted", lead_source: "referral" };
      if (body.estimated_value) body.estimated_value = parseFloat(body.estimated_value) || null;
      else delete body.estimated_value;
      const r = await authFetch("/api/sales/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Failed to create lead");
      setForm(EMPTY);
      onCreated(j.lead);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="flex w-full max-w-md flex-col overflow-y-auto bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">Architect Tender</h2>
            <p className="mt-0.5 text-xs text-muted">Fast-tracked to Accepted — skips qualifying &amp; fee proposal</p>
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-muted hover:text-ink">×</button>
        </div>
        <form onSubmit={submit} className="flex-1 space-y-4 px-6 py-5">
          <div className="rounded-lg border border-primary/20 bg-primary/[0.03] px-4 py-3 text-xs text-primary">
            Use this for architect-issued tenders where the client has been pre-qualified by the architect.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Client first name *</label>
              <input className="focus-ring w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink" value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Client last name</label>
              <input className="focus-ring w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink" value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Site address *</label>
            <input className="focus-ring w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink" value={form.site_address} onChange={(e) => set("site_address", e.target.value)} placeholder="e.g. 25 Nilpinna Street, Burnside SA" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Architect / practice name</label>
            <input className="focus-ring w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink" value={form.architect_name} onChange={(e) => set("architect_name", e.target.value)} placeholder="e.g. Studio X Architects" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Project type</label>
            <select className="focus-ring w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink" value={form.project_type} onChange={(e) => set("project_type", e.target.value)}>
              <option value="">Select…</option>
              {PROJECT_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Estimated value ($)</label>
            <input type="number" min="0" step="1000" className="focus-ring w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink" value={form.estimated_value} onChange={(e) => set("estimated_value", e.target.value)} placeholder="e.g. 1200000" />
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-hairline px-4 py-2 text-sm text-ink hover:bg-page">Cancel</button>
            <button type="submit" disabled={busy} className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {busy ? "Creating…" : "Create Architect Tender"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─────────────────────────── Quick note modal (unchanged) ─────────────────────────── */
function QuickNoteModal({ lead, onClose, onSaved }) {
  const [summary, setSummary] = useState("");
  const [type, setType] = useState("note");
  const [nextAction, setNextAction] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [busy, setBusy] = useState(false);

  if (!lead) return null;

  async function submit(e) {
    e.preventDefault();
    if (!summary.trim()) return;
    setBusy(true);
    try {
      await authFetch(`/api/sales/leads/${lead.id}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activity_type: type, summary, next_action: nextAction || undefined, next_action_date: nextDate || undefined }),
      });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-card bg-surface p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-ink">Log Activity — {displayLeadName(lead)}</h3>
          <button onClick={onClose} className="text-2xl leading-none text-muted hover:text-ink">×</button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Type</label>
            <select className="w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="note">Note</option>
              <option value="call">Call</option>
              <option value="email">Email</option>
              <option value="meeting">Meeting</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Summary *</label>
            <textarea className="w-full resize-none rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Next action</label>
            <input className="w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink" value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="e.g. Send discovery questions" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Next action date</label>
            <input type="date" className="w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-hairline px-4 py-2 text-sm text-ink hover:bg-page">Cancel</button>
            <button type="submit" disabled={busy || !summary.trim()} className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─────────────────────────── List view (unchanged behaviour) ─────────────────────────── */
function ListView({ leads, onQuickNote, onNav }) {
  const [sortCol, setSortCol] = useState("last_activity_at");
  const [sortDir, setSortDir] = useState("desc");

  function toggleSort(col) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  const sorted = [...leads].sort((a, b) => {
    let av = a[sortCol], bv = b[sortCol];
    if (sortCol === "qualify_score") { av = av ?? -1; bv = bv ?? -1; }
    if (sortCol === "estimated_value") { av = Number(av) || 0; bv = Number(bv) || 0; }
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  function Th({ col, label }) {
    const active = sortCol === col;
    return (
      <th className="section-label cursor-pointer select-none whitespace-nowrap px-4 py-2.5 text-left hover:text-ink" onClick={() => toggleSort(col)}>
        {label}{active ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
      </th>
    );
  }

  if (sorted.length === 0) {
    return <div className="flex items-center justify-center py-20 text-sm text-muted">No leads yet — add one to get started.</div>;
  }

  return (
    <div className="overflow-x-auto rounded-card border border-hairline bg-surface">
      <table className="w-full text-sm">
        <thead className="sticky top-0 border-b border-hairline bg-page">
          <tr>
            <Th col="first_name" label="Name" />
            <Th col="stage" label="Stage" />
            <Th col="estimated_value" label="Value" />
            <Th col="qualify_score" label="Score" />
            <th className="section-label whitespace-nowrap px-4 py-2.5 text-left">Fit</th>
            <th className="section-label whitespace-nowrap px-4 py-2.5 text-left">Suburb</th>
            <Th col="last_activity_at" label="Last Activity" />
            <th className="section-label whitespace-nowrap px-4 py-2.5 text-left">Next Action</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {sorted.map((lead) => (
            <tr key={lead.id} className="group cursor-pointer transition-colors hover:bg-page" onClick={() => onNav(lead.id)}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <RotDot lead={lead} />
                  <span className="font-medium text-ink">{displayLeadName(lead)}</span>
                </div>
                {lead.project_type && <div className="mt-0.5 text-xs text-muted">{projectTypeLabel(lead.project_type)}</div>}
              </td>
              <td className="px-4 py-3"><StagePill stageId={lead.stage} /></td>
              <td className="px-4 py-3 font-medium text-accent">{formatValue(lead.estimated_value) || <span className="text-muted">—</span>}</td>
              <td className="px-4 py-3"><ScoreBadge score={lead.qualify_score} /></td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-1">
                  <FitQualityBadge value={lead.fit_quality} />
                  <ReadinessBadge value={lead.readiness} />
                  {!lead.fit_quality && !lead.readiness && <span className="text-muted">—</span>}
                </div>
              </td>
              <td className="px-4 py-3 text-muted">{lead.suburb || "—"}</td>
              <td className="px-4 py-3 text-muted">{relativeTime(lead.last_activity_at || lead.created_at)}</td>
              <td className="px-4 py-3">
                {lead.next_action ? (
                  <div>
                    <div className="text-xs text-ink">{lead.next_action}</div>
                    {lead.next_action_date && (
                      <div className="mt-0.5 text-xs text-primary">
                        {new Date(lead.next_action_date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                      </div>
                    )}
                  </div>
                ) : <span className="text-muted">—</span>}
              </td>
              <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                <button className="rounded border border-hairline px-2 py-1 text-xs text-ink opacity-0 transition-opacity hover:bg-surface group-hover:opacity-100" onClick={() => onQuickNote(lead)}>
                  Note
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────── Page ─────────────────────────── */
export default function SalesPipeline() {
  const nav = useNavigate();
  const location = useLocation();
  const { setScreenContext } = useBlueprintContext() || {};
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [archTenderOpen, setArchTenderOpen] = useState(false);
  const [quickNoteLead, setQuickNoteLead] = useState(null);
  const initialView = (() => {
    const v = new URLSearchParams(location.search).get("view");
    return ["board", "actions", "list", "scorecard"].includes(v) ? v : "board";
  })();
  const [view, setView] = useState(initialView); // "board" | "actions" | "list" | "scorecard"
  const [filter, setFilter] = useState("all");
  const [queueMode, setQueueMode] = useState("urgency"); // "urgency" | "actionType" — CRM Control Spine (127)

  // Qualified-only toggle: default ON (hides enquiry-stage leads from the board).
  // Persisted in localStorage so the user's choice survives navigation.
  const [qualifiedOnly, setQualifiedOnly] = useState(() => {
    try {
      const stored = localStorage.getItem(QUALIFIED_ONLY_KEY);
      // Default ON (null means not set yet → true)
      return stored === null ? true : stored === "true";
    } catch {
      return true;
    }
  });

  function toggleQualifiedOnly() {
    setQualifiedOnly(prev => {
      const next = !prev;
      try { localStorage.setItem(QUALIFIED_ONLY_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }

  useEffect(() => {
    setScreenContext?.({ page: "sales_pipeline", description: "Sales pipeline board — all active leads by stage" });
    return () => setScreenContext?.(null);
  }, [setScreenContext]);

  useEffect(() => {
    if (location.state?.openNewLead) {
      setAddOpen(true);
      nav(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, nav]);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await authFetch("/api/sales/leads");
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      setLeads(j.leads || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function moveStage(lead, newStage) {
    await authFetch(`/api/sales/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: newStage }),
    });
    load();
  }

  async function snoozeLead(lead) {
    const until = new Date(); until.setDate(until.getDate() + 7);
    await authFetch(`/api/sales/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snoozed_until: until.toISOString() }),
    });
    load();
  }

  async function markActionDone(lead) {
    await authFetch(`/api/sales/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action_type: null, action_due_at: null, snoozed_until: null }),
    });
    load();
  }

  function openLead(id) { nav(`/sales/${id}`); }

  // Active pipeline excludes won (a job now) + nurture/lost — matches the server scorecard.
  const activeLeads = leads.filter((l) => !["nurture", "lost", "won"].includes(l.stage));
  const wonLeads = leads.filter((l) => l.stage === "won");
  const nurtureLeads = leads.filter((l) => l.stage === "nurture");
  const lostLeads = leads.filter((l) => l.stage === "lost");
  // boardLeads: all leads with a valid stage. When qualifiedOnly=true, exclude enquiry-stage
  // leads (they live in the CRM spreadsheet until promoted). Already-qualified leads are unaffected.
  const allBoardLeads = leads.filter((l) => STAGE_IDS.has(l.stage)); // active + won (8 board columns)
  const boardLeads = qualifiedOnly
    ? allBoardLeads.filter((l) => l.stage !== LEAD_STAGES.ENQUIRY)
    : allBoardLeads;
  const totalValue = activeLeads.reduce((s, l) => s + (Number(l.estimated_value) || 0), 0);
  const weighted = weightedValue(activeLeads);
  const needsActionCount = activeLeads.filter((l) => matchesFilter(l, "needs")).length;
  const overdueCount = activeLeads.filter((l) => matchesFilter(l, "overdue")).length;

  const filteredBoard = boardLeads.filter((l) => matchesFilter(l, filter));
  const leadsByStage = Object.fromEntries(STAGES.map((s) => [s.id, filteredBoard.filter((l) => l.stage === s.id)]));

  return (
    <div>
      <SalesPipelineHeader
        activeCount={activeLeads.length}
        totalValue={totalValue}
        wonCount={wonLeads.length}
        view={view}
        onView={setView}
        onAddLead={() => setAddOpen(true)}
        onArchTender={() => setArchTenderOpen(true)}
      />

      {err && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{err}</div>}

      {(view === "board" || view === "actions") && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <KpiCard label="Pipeline value" value={formatValue(totalValue) || "$0"} sub={`${activeLeads.length} active`} tone="primary" />
            <KpiCard label="Weighted" value={formatValue(weighted) || "$0"} sub="stage-probability" />
            <KpiCard label="Needs action" value={String(needsActionCount)} sub="next action date due" tone="warning" />
            <KpiCard label="Overdue" value={String(overdueCount)} sub="14d+ no activity" tone="danger" />
            <KpiCard label="Won / lost" value={`${wonLeads.length} / ${lostLeads.length}`} sub="won / lost" tone="success" />
          </div>

          <PipelineFilterBar className="mt-3" leads={boardLeads} value={filter} onChange={setFilter} />

          {/* Qualified-only toggle — CRM Batch 01A */}
          <div className="mt-2 flex items-center gap-2">
            <div className="flex rounded-lg border border-hairline overflow-hidden text-xs font-semibold">
              <button
                type="button"
                onClick={() => { if (!qualifiedOnly) toggleQualifiedOnly(); }}
                className={`px-3 py-1.5 transition ${qualifiedOnly ? "bg-primary text-white" : "bg-surface text-muted hover:bg-page"}`}
              >
                Qualified only
              </button>
              <button
                type="button"
                onClick={() => { if (qualifiedOnly) toggleQualifiedOnly(); }}
                className={`px-3 py-1.5 transition border-l border-hairline ${!qualifiedOnly ? "bg-primary text-white" : "bg-surface text-muted hover:bg-page"}`}
              >
                Show all leads
              </button>
            </div>
            {qualifiedOnly && (
              <span className="text-xs text-muted">
                Enquiry-stage leads live in{" "}
                <a href="/sales/dashboard" className="text-primary hover:underline">CRM</a>.
              </span>
            )}
          </div>
        </>
      )}

      {view === "board" && (
        <>
          <SalesKanbanBoard
            className="mt-4 hidden lg:block"
            stages={STAGES}
            leadsByStage={leadsByStage}
            loading={loading}
            nurtureLeads={nurtureLeads}
            lostLeads={lostLeads}
            onMoveStage={moveStage}
            onQuickNote={setQuickNoteLead}
            onOpen={openLead}
          />
          <SalesMobileLeadList
            className="mt-4 lg:hidden"
            stages={STAGES}
            leadsByStage={leadsByStage}
            loading={loading}
            nurtureLeads={nurtureLeads}
            lostLeads={lostLeads}
            onMoveStage={moveStage}
            onQuickNote={setQuickNoteLead}
            onOpen={openLead}
          />
        </>
      )}

      {view === "actions" && (
        <div className="mt-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs font-medium text-muted">Group by:</span>
            <button type="button" onClick={() => setQueueMode("urgency")} className={`rounded-full px-3 py-1 text-xs font-semibold ${queueMode === "urgency" ? "bg-primary text-white" : "border border-hairline text-ink"}`}>Urgency</button>
            <button type="button" onClick={() => setQueueMode("actionType")} className={`rounded-full px-3 py-1 text-xs font-semibold ${queueMode === "actionType" ? "bg-primary text-white" : "border border-hairline text-ink"}`}>Action type</button>
          </div>
          <SalesActionQueue
            leads={activeLeads.filter((l) => matchesFilter(l, filter))}
            loading={loading}
            onMoveStage={moveStage}
            onQuickNote={setQuickNoteLead}
            onOpen={openLead}
            onSnooze={queueMode === "actionType" ? snoozeLead : undefined}
            onMarkDone={queueMode === "actionType" ? markActionDone : undefined}
            mode={queueMode}
          />
        </div>
      )}

      {view === "list" && (
        <div className="mt-4">
          {loading ? (
            <div className="p-8 text-sm text-muted">Loading…</div>
          ) : (
            <ListView leads={leads.filter((l) => !["lost"].includes(l.stage))} onQuickNote={setQuickNoteLead} onNav={openLead} />
          )}
        </div>
      )}

      {view === "scorecard" && (
        <div className="mt-4"><SalesScorecard /></div>
      )}

      <AddLeadDrawer open={addOpen} onClose={() => setAddOpen(false)} onCreated={() => { setAddOpen(false); load(); }} />
      <AddArchitectTenderDrawer open={archTenderOpen} onClose={() => setArchTenderOpen(false)} onCreated={() => { setArchTenderOpen(false); load(); }} />
      <QuickNoteModal lead={quickNoteLead} onClose={() => setQuickNoteLead(null)} onSaved={() => { setQuickNoteLead(null); load(); }} />

      <div className="lg:hidden"><SafeBottomSpacer /></div>
    </div>
  );
}
