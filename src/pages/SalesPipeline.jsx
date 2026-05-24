import { useCallback, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useBlueprintContext } from "../lib/BlueprintContext.jsx";
import { authFetch } from "../lib/authFetch.js";
import SalesScorecard from "../components/sales/SalesScorecard.jsx";

const STAGES = [
  { id: "enquiry",       label: "Enquiry",       color: "bg-slate-100 text-slate-700",    dot: "bg-slate-400" },
  { id: "qualify",       label: "Qualify",       color: "bg-blue-50 text-blue-800",       dot: "bg-blue-500" },
  { id: "discovery",     label: "Discovery",     color: "bg-violet-50 text-violet-800",   dot: "bg-violet-500" },
  { id: "winning_offer", label: "Winning Offer", color: "bg-amber-50 text-amber-800",     dot: "bg-amber-500" },
  { id: "fee_proposal",  label: "Fee Proposal",  color: "bg-orange-50 text-orange-800",   dot: "bg-orange-500" },
  { id: "accepted",      label: "Accepted",      color: "bg-emerald-50 text-emerald-800", dot: "bg-emerald-500" },
  { id: "tender",        label: "Tender",        color: "bg-teal-50 text-teal-800",       dot: "bg-teal-500" },
  { id: "won",           label: "Won",           color: "bg-green-100 text-green-800",    dot: "bg-green-600" },
];

const PROJECT_TYPES = [
  { value: "new_build",          label: "New Build" },
  { value: "extension",          label: "Extension" },
  { value: "renovation",         label: "Renovation" },
  { value: "knockdown_rebuild",  label: "Knockdown Rebuild" },
];

const LEAD_SOURCES = [
  { value: "referral",   label: "Referral" },
  { value: "website",    label: "Website" },
  { value: "social",     label: "Social Media" },
  { value: "exhibition", label: "Exhibition / Event" },
  { value: "buildexact", label: "Buildexact" },
  { value: "other",      label: "Other" },
];

function formatValue(v) {
  if (!v) return null;
  const n = Number(v);
  if (!n) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
}

function daysInStage(lead) {
  const entered = new Date(lead.stage_entered_at || lead.created_at);
  return Math.floor((Date.now() - entered.getTime()) / 86_400_000);
}

function daysSinceActivity(lead) {
  const t = new Date(lead.last_activity_at || lead.created_at);
  return Math.floor((Date.now() - t.getTime()) / 86_400_000);
}

function scoreColor(score) {
  if (score == null || score === 0) return "bg-slate-100 text-slate-500";
  if (score >= 7) return "bg-green-100 text-green-700";
  if (score >= 5) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

function projectTypeLabel(v) {
  return PROJECT_TYPES.find(p => p.value === v)?.label || v || "—";
}

function RotDot({ lead }) {
  const days = daysSinceActivity(lead);
  if (days >= 30) return <span title={`No activity for ${days} days`} className="inline-block w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />;
  if (days >= 14) return <span title={`No activity for ${days} days`} className="inline-block w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />;
  return null;
}

function ScoreBadge({ score }) {
  if (score == null) return null;
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold ${scoreColor(score)}`}>
      {score}/8
    </span>
  );
}

function LeadCard({ lead, onMoveStage, onQuickNote, onClick }) {
  const [hovering, setHovering] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const days = daysInStage(lead);

  return (
    <div
      className="group relative rounded-lg border border-hairline bg-surface p-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
      style={lead.lead_type === 'architect_tender' ? { borderTopColor: '#0d9488', borderTopWidth: 3 } : undefined}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => { setHovering(false); setMoveOpen(false); }}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <RotDot lead={lead} />
            <span className="font-semibold text-ink text-sm truncate">
              {lead.first_name} {lead.last_name || ""}
            </span>
          </div>
          {lead.suburb && <div className="text-xs text-muted mt-0.5 truncate">{lead.suburb}</div>}
        </div>
        <ScoreBadge score={lead.qualify_score} />
      </div>

      <div className="mt-2 flex flex-wrap gap-1 items-center">
        {lead.lead_type === 'architect_tender' && (
          <span className="text-xs font-semibold rounded px-1.5 py-0.5" style={{ background: '#0d948815', color: '#0d9488', border: '1px solid #0d948835' }}>
            Arch Tender
          </span>
        )}
        {lead.project_type && (
          <span className="text-xs bg-page border border-hairline rounded px-1.5 py-0.5 text-muted">
            {projectTypeLabel(lead.project_type)}
          </span>
        )}
        {lead.estimated_value && (
          <span className="text-xs font-medium text-accent">{formatValue(lead.estimated_value)}</span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span>{days}d in stage</span>
        {lead.next_action_date && (
          <span className="text-primary truncate max-w-[120px]">
            ↪ {new Date(lead.next_action_date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
          </span>
        )}
      </div>

      {hovering && (
        <div className="absolute bottom-2 right-2 flex gap-1" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => onQuickNote(lead)}
            className="rounded bg-page border border-hairline px-2 py-0.5 text-xs text-ink hover:bg-surface shadow-sm"
          >
            Note
          </button>
          <div className="relative">
            <button
              onClick={() => setMoveOpen(v => !v)}
              className="rounded bg-page border border-hairline px-2 py-0.5 text-xs text-ink hover:bg-surface shadow-sm"
            >
              Move ▾
            </button>
            {moveOpen && (
              <div className="absolute bottom-7 right-0 z-30 w-40 rounded-lg border border-hairline bg-surface shadow-lg py-1">
                {STAGES.filter(s => s.id !== lead.stage).map(s => (
                  <button
                    key={s.id}
                    className="w-full text-left px-3 py-1.5 text-xs text-ink hover:bg-page"
                    onClick={() => { setMoveOpen(false); onMoveStage(lead, s.id); }}
                  >
                    {s.label}
                  </button>
                ))}
                <div className="border-t border-hairline mt-1 pt-1">
                  <button
                    className="w-full text-left px-3 py-1.5 text-xs text-muted hover:bg-page"
                    onClick={() => { setMoveOpen(false); onMoveStage(lead, "nurture"); }}
                  >
                    → Nurture
                  </button>
                  <button
                    className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-page"
                    onClick={() => { setMoveOpen(false); onMoveStage(lead, "lost"); }}
                  >
                    Mark Lost
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AddLeadDrawer({ open, onClose, onCreated }) {
  const EMPTY = { first_name: "", last_name: "", email: "", phone: "", suburb: "", project_type: "", lead_source: "", estimated_value: "" };
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    if (!form.first_name.trim()) { setErr("First name is required."); return; }
    setBusy(true); setErr("");
    try {
      const body = { ...form };
      if (body.estimated_value) body.estimated_value = parseFloat(body.estimated_value) || null;
      else delete body.estimated_value;
      const r = await authFetch("/api/sales/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
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
      <div className="w-full max-w-md bg-surface shadow-2xl flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-hairline">
          <h2 className="text-lg font-semibold text-ink">New Lead</h2>
          <button onClick={onClose} className="text-muted hover:text-ink text-2xl leading-none">×</button>
        </div>
        <form onSubmit={submit} className="flex-1 px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">First name *</label>
              <input className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink bg-page focus-ring" value={form.first_name} onChange={e => set("first_name", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Last name</label>
              <input className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink bg-page focus-ring" value={form.last_name} onChange={e => set("last_name", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Email</label>
            <input type="email" className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink bg-page focus-ring" value={form.email} onChange={e => set("email", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Phone</label>
            <input type="tel" className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink bg-page focus-ring" value={form.phone} onChange={e => set("phone", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Suburb</label>
            <input className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink bg-page focus-ring" value={form.suburb} onChange={e => set("suburb", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Project type</label>
            <select className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink bg-page focus-ring" value={form.project_type} onChange={e => set("project_type", e.target.value)}>
              <option value="">Select…</option>
              {PROJECT_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Estimated value ($)</label>
            <input type="number" min="0" step="1000" className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink bg-page focus-ring" value={form.estimated_value} onChange={e => set("estimated_value", e.target.value)} placeholder="e.g. 650000" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Lead source</label>
            <select className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink bg-page focus-ring" value={form.lead_source} onChange={e => set("lead_source", e.target.value)}>
              <option value="">Select…</option>
              {LEAD_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
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

function AddArchitectTenderDrawer({ open, onClose, onCreated }) {
  const EMPTY = { first_name: "", last_name: "", site_address: "", architect_name: "", project_type: "", estimated_value: "" };
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    if (!form.first_name.trim()) { setErr("Client first name is required."); return; }
    if (!form.site_address.trim()) { setErr("Site address is required."); return; }
    setBusy(true); setErr("");
    try {
      const body = {
        ...form,
        lead_type: "architect_tender",
        stage: "accepted",
        lead_source: "referral",
      };
      if (body.estimated_value) body.estimated_value = parseFloat(body.estimated_value) || null;
      else delete body.estimated_value;
      const r = await authFetch("/api/sales/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
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
      <div className="w-full max-w-md bg-surface shadow-2xl flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-hairline">
          <div>
            <h2 className="text-lg font-semibold text-ink">Architect Tender</h2>
            <p className="text-xs text-muted mt-0.5">Fast-tracked to Accepted — skips qualifying & fee proposal</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink text-2xl leading-none">×</button>
        </div>
        <form onSubmit={submit} className="flex-1 px-6 py-5 space-y-4">
          <div className="rounded-lg border border-primary/20 bg-primary/[0.03] px-4 py-3 text-xs text-primary">
            Use this for architect-issued tenders where the client has been pre-qualified by the architect.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Client first name *</label>
              <input className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink bg-page focus-ring" value={form.first_name} onChange={e => set("first_name", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Client last name</label>
              <input className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink bg-page focus-ring" value={form.last_name} onChange={e => set("last_name", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Site address *</label>
            <input className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink bg-page focus-ring" value={form.site_address} onChange={e => set("site_address", e.target.value)} placeholder="e.g. 25 Nilpinna Street, Burnside SA" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Architect / practice name</label>
            <input className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink bg-page focus-ring" value={form.architect_name} onChange={e => set("architect_name", e.target.value)} placeholder="e.g. Studio X Architects" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Project type</label>
            <select className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink bg-page focus-ring" value={form.project_type} onChange={e => set("project_type", e.target.value)}>
              <option value="">Select…</option>
              {PROJECT_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Estimated value ($)</label>
            <input type="number" min="0" step="1000" className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink bg-page focus-ring" value={form.estimated_value} onChange={e => set("estimated_value", e.target.value)} placeholder="e.g. 1200000" />
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
        body: JSON.stringify({ activity_type: type, summary, next_action: nextAction || undefined, next_action_date: nextDate || undefined })
      });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-card bg-surface shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-ink">Log Activity — {lead.first_name} {lead.last_name || ""}</h3>
          <button onClick={onClose} className="text-muted hover:text-ink text-2xl leading-none">×</button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Type</label>
            <select className="w-full rounded-lg border border-hairline px-3 py-2 text-sm bg-page text-ink" value={type} onChange={e => setType(e.target.value)}>
              <option value="note">Note</option>
              <option value="call">Call</option>
              <option value="email">Email</option>
              <option value="meeting">Meeting</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Summary *</label>
            <textarea className="w-full rounded-lg border border-hairline px-3 py-2 text-sm bg-page text-ink resize-none" rows={3} value={summary} onChange={e => setSummary(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Next action</label>
            <input className="w-full rounded-lg border border-hairline px-3 py-2 text-sm bg-page text-ink" value={nextAction} onChange={e => setNextAction(e.target.value)} placeholder="e.g. Send discovery questions" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Next action date</label>
            <input type="date" className="w-full rounded-lg border border-hairline px-3 py-2 text-sm bg-page text-ink" value={nextDate} onChange={e => setNextDate(e.target.value)} />
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

function relativeTime(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function StagePill({ stageId }) {
  const s = STAGES.find(x => x.id === stageId);
  if (!s) return <span className="text-muted text-xs">—</span>;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${s.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function ListView({ leads, onQuickNote, onNav }) {
  const [sortCol, setSortCol] = useState("last_activity_at");
  const [sortDir, setSortDir] = useState("desc");

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
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
      <th
        className="px-4 py-2.5 text-left section-label cursor-pointer select-none hover:text-ink whitespace-nowrap"
        onClick={() => toggleSort(col)}
      >
        {label}{active ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
      </th>
    );
  }

  if (sorted.length === 0) {
    return <div className="flex items-center justify-center py-20 text-sm text-muted">No leads yet — add one to get started.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-page border-b border-hairline sticky top-0">
          <tr>
            <Th col="first_name" label="Name" />
            <Th col="stage" label="Stage" />
            <Th col="estimated_value" label="Value" />
            <Th col="qualify_score" label="Score" />
            <th className="px-4 py-2.5 text-left section-label whitespace-nowrap">Suburb</th>
            <Th col="last_activity_at" label="Last Activity" />
            <th className="px-4 py-2.5 text-left section-label whitespace-nowrap">Next Action</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {sorted.map(lead => (
            <tr
              key={lead.id}
              className="group hover:bg-page cursor-pointer transition-colors"
              onClick={() => onNav(lead.id)}
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <RotDot lead={lead} />
                  <span className="font-medium text-ink">{lead.first_name} {lead.last_name || ""}</span>
                </div>
                {lead.project_type && <div className="text-xs text-muted mt-0.5">{projectTypeLabel(lead.project_type)}</div>}
              </td>
              <td className="px-4 py-3"><StagePill stageId={lead.stage} /></td>
              <td className="px-4 py-3 font-medium text-accent">{formatValue(lead.estimated_value) || <span className="text-muted">—</span>}</td>
              <td className="px-4 py-3"><ScoreBadge score={lead.qualify_score} /></td>
              <td className="px-4 py-3 text-muted">{lead.suburb || "—"}</td>
              <td className="px-4 py-3 text-muted">{relativeTime(lead.last_activity_at || lead.created_at)}</td>
              <td className="px-4 py-3">
                {lead.next_action ? (
                  <div>
                    <div className="text-ink text-xs">{lead.next_action}</div>
                    {lead.next_action_date && (
                      <div className="text-xs text-primary mt-0.5">
                        {new Date(lead.next_action_date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                      </div>
                    )}
                  </div>
                ) : <span className="text-muted">—</span>}
              </td>
              <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                <button
                  className="opacity-0 group-hover:opacity-100 rounded border border-hairline px-2 py-1 text-xs text-ink hover:bg-surface transition-opacity"
                  onClick={() => onQuickNote(lead)}
                >
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
  const [nurtureExpanded, setNurtureExpanded] = useState(false);
  const [view, setView] = useState("kanban"); // "kanban" | "list" | "scorecard"

  useEffect(() => {
    setScreenContext?.({ page: "sales_pipeline", description: "Sales pipeline board — all active leads by stage" });
    return () => setScreenContext?.(null);
  }, [setScreenContext]);

  useEffect(() => {
    if (location.state?.openNewLead) {
      setAddOpen(true);
      // Clear the state so refreshing doesn't reopen the modal
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
      body: JSON.stringify({ stage: newStage })
    });
    load();
  }

  const activeLeads = leads.filter(l => !["nurture", "lost"].includes(l.stage));
  const nurtureLeads = leads.filter(l => l.stage === "nurture");
  const wonLeads = leads.filter(l => l.stage === "won");
  const totalValue = activeLeads.reduce((s, l) => s + (Number(l.estimated_value) || 0), 0);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-hairline bg-surface">
        <div>
          <h1 className="page-title">Sales Pipeline</h1>
          <p className="text-sm text-muted mt-0.5">
            {activeLeads.length} active lead{activeLeads.length !== 1 ? "s" : ""}
            {totalValue > 0 && <span> · {formatValue(totalValue)} pipeline value</span>}
            {wonLeads.length > 0 && <span> · {wonLeads.length} won</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex rounded-lg border border-hairline overflow-hidden bg-page">
            <button
              onClick={() => setView("kanban")}
              title="Kanban board"
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === "kanban" ? "bg-primary text-white" : "text-muted hover:text-ink hover:bg-surface"}`}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/>
                <rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/>
              </svg>
            </button>
            <button
              onClick={() => setView("list")}
              title="List view"
              className={`px-3 py-1.5 text-xs font-medium border-l border-hairline transition-colors ${view === "list" ? "bg-primary text-white" : "text-muted hover:text-ink hover:bg-surface"}`}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <rect x="1" y="2" width="14" height="2" rx="1"/><rect x="1" y="7" width="14" height="2" rx="1"/>
                <rect x="1" y="12" width="14" height="2" rx="1"/>
              </svg>
            </button>
            <button
              onClick={() => setView("scorecard")}
              title="APB Scorecard"
              className={`px-3 py-1.5 text-xs font-medium border-l border-hairline transition-colors ${view === "scorecard" ? "bg-primary text-white" : "text-muted hover:text-ink hover:bg-surface"}`}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <rect x="1" y="9" width="3" height="6" rx="1"/><rect x="6" y="6" width="3" height="9" rx="1"/>
                <rect x="11" y="2" width="3" height="13" rx="1"/>
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setArchTenderOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-primary text-primary px-4 py-2 text-sm font-semibold hover:bg-primary hover:text-white transition-colors shadow-sm"
            >
              <span className="text-lg leading-none">+</span> Architect Tender
            </button>
            <button
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 shadow-sm"
            >
              <span className="text-lg leading-none">+</span> Add Lead
            </button>
          </div>
        </div>
      </div>

      {err && <div className="px-6 py-3 text-sm text-red-600 bg-red-50 border-b border-hairline">{err}</div>}

      {view === "list" && (
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-sm text-muted">Loading…</div>
          ) : (
            <ListView
              leads={leads.filter(l => !["lost"].includes(l.stage))}
              onQuickNote={setQuickNoteLead}
              onNav={id => nav(`/sales/${id}`)}
            />
          )}
        </div>
      )}

      {view === "scorecard" && (
        <div className="flex-1 overflow-y-auto">
          <SalesScorecard />
        </div>
      )}

      {view === "kanban" && <div className="flex-1 overflow-x-auto overflow-y-auto">
        <div className="flex gap-4 p-4 min-w-max items-start">
          {STAGES.map(stage => {
            const stageLeads = leads.filter(l => l.stage === stage.id);
            return (
              <div key={stage.id} className="w-64 flex-shrink-0 flex flex-col">
                <div className={`flex items-center gap-2 rounded-t-lg px-3 py-2 ${stage.color}`}>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${stage.dot}`} />
                  <span className="text-xs font-semibold uppercase tracking-wide flex-1">{stage.label}</span>
                  <span className="text-xs font-bold opacity-70">{stageLeads.length}</span>
                </div>
                <div className="bg-page rounded-b-lg border border-hairline border-t-0 p-2 space-y-2 min-h-[120px]">
                  {loading && stageLeads.length === 0 ? (
                    <div className="h-16 rounded-lg bg-surface animate-pulse" />
                  ) : stageLeads.length === 0 ? (
                    <div className="flex items-center justify-center h-16 text-xs text-muted/50 select-none">No leads</div>
                  ) : stageLeads.map(lead => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      onMoveStage={moveStage}
                      onQuickNote={setQuickNoteLead}
                      onClick={() => nav(`/sales/${lead.id}`)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {nurtureLeads.length > 0 && (
          <div className="px-4 pb-4">
            <button
              onClick={() => setNurtureExpanded(v => !v)}
              className="flex items-center gap-2 text-sm font-medium text-muted hover:text-ink mb-2"
            >
              <span className={`transition-transform duration-150 ${nurtureExpanded ? "rotate-90" : ""}`}>▶</span>
              Nurture ({nurtureLeads.length})
            </button>
            {nurtureExpanded && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                {nurtureLeads.map(lead => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    onMoveStage={moveStage}
                    onQuickNote={setQuickNoteLead}
                    onClick={() => nav(`/sales/${lead.id}`)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>}

      <AddLeadDrawer open={addOpen} onClose={() => setAddOpen(false)} onCreated={() => { setAddOpen(false); load(); }} />
      <AddArchitectTenderDrawer open={archTenderOpen} onClose={() => setArchTenderOpen(false)} onCreated={() => { setArchTenderOpen(false); load(); }} />
      <QuickNoteModal lead={quickNoteLead} onClose={() => setQuickNoteLead(null)} onSaved={() => { setQuickNoteLead(null); load(); }} />
    </div>
  );
}
