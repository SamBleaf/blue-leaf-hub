import { authFetch } from "../lib/authFetch.js";
import { displayLeadName } from "../lib/leadUtils.js";
import { apiFetch, apiPost } from "../lib/apiFetch.js";
import { useAuth } from "../lib/useAuth.js";
import {
  LEAD_FIT_QUALITY_LABELS, LEAD_READINESS_LABELS,
  LEAD_ACTION_TYPE_LABELS,
  LEAD_SOURCE_CATEGORY_LABELS,
} from "../lib/constants.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { useBlueprintContext } from "../lib/BlueprintContext.jsx";
import StatusBadge from "../components/ui/StatusBadge.jsx";
import StickyActionBar from "../components/ui/StickyActionBar.jsx";
import SafeBottomSpacer from "../components/ui/SafeBottomSpacer.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import LeadCommandCentreLayout from "../components/sales/lead-detail/LeadCommandCentreLayout.jsx";
import LeadDetailHeader from "../components/sales/lead-detail/LeadDetailHeader.jsx";
import LeadStageStepper from "../components/sales/lead-detail/LeadStageStepper.jsx";
import LeadNextActionCard from "../components/sales/lead-detail/LeadNextActionCard.jsx";
import LeadMobileTabs from "../components/sales/lead-detail/LeadMobileTabs.jsx";
import LeadSummaryPanel from "../components/sales/lead-detail/LeadSummaryPanel.jsx";
import LeadUnifiedTimeline from "../components/sales/lead-detail/LeadUnifiedTimeline.jsx";
import LeadStageSection from "../components/sales/lead-detail/LeadStageSection.jsx";
import LeadAccordion from "../components/sales/lead-detail/LeadAccordion.jsx";
import EnquiryCallScript from "../components/sales/lead-detail/EnquiryCallScript.jsx";
import QualificationDropdowns from "../components/sales/lead-detail/QualificationDropdowns.jsx";
import QualifyActions from "../components/sales/lead-detail/QualifyActions.jsx";
import LeadMailbox from "../components/sales/lead-detail/LeadMailbox.jsx";
import DiscoveryMeetingScript from "../components/sales/lead-detail/DiscoveryMeetingScript.jsx";
import DesignerSelect from "../components/sales/lead-detail/DesignerSelect.jsx";
import DiscoveryActions from "../components/sales/lead-detail/DiscoveryActions.jsx";

const STAGES = [
  { id: "enquiry",       label: "Enquiry",       color: "bg-slate-100 text-slate-700" },
  { id: "qualify",       label: "Qualify",       color: "bg-blue-50 text-blue-800" },
  { id: "discovery",     label: "Discovery",     color: "bg-violet-50 text-violet-800" },
  { id: "winning_offer", label: "Winning Offer", color: "bg-amber-50 text-amber-800" },
  { id: "fee_proposal",  label: "Fee Proposal",  color: "bg-orange-50 text-orange-800" },
  { id: "accepted",      label: "Accepted",      color: "bg-emerald-50 text-emerald-800" },
  { id: "tender",        label: "Tender",        color: "bg-teal-50 text-teal-800" },
  { id: "won",           label: "Won",           color: "bg-green-100 text-green-800" },
  { id: "nurture",       label: "Nurture",       color: "bg-slate-100 text-slate-600" },
  { id: "lost",          label: "Lost",          color: "bg-red-50 text-red-800" },
];

const PROJECT_TYPES = [
  { value: "new_build",         label: "New Build" },
  { value: "extension",         label: "Extension" },
  { value: "renovation",        label: "Renovation" },
  { value: "knockdown_rebuild", label: "Knockdown Rebuild" },
];

const DESIGN_STAGES = [
  { value: "concept",                label: "Concept" },
  { value: "da_approved",            label: "DA Approved" },
  { value: "construction_drawings",  label: "Construction Drawings" },
];

// ACTIVITY_ICONS relocated into LeadActivityTimeline (Pass 3A).

const STAGE_ORDER = ["enquiry","qualify","discovery","winning_offer","fee_proposal","accepted","tender","won"];

const PTSA_SERVICES = [
  { value: "site_analysis",       label: "Site Analysis and Survey Review" },
  { value: "cost_planning",       label: "Detailed Preliminary Cost Planning by Trade Category" },
  { value: "design_coordination", label: "Design Coordination and Architectural Review" },
  { value: "engineering_review",  label: "Engineering Review and Certification Coordination" },
  { value: "specification_prep",  label: "Specification Preparation and Inclusion Schedule" },
  { value: "council_liaison",     label: "Council and Authority Liaison" },
  { value: "tender_report",       label: "Comprehensive Tender Report" },
];
const PTSA_DEFAULT_SERVICES = ["site_analysis","cost_planning","design_coordination","engineering_review","specification_prep"];
const PTSA_STATUS_COLORS = {
  draft:    "bg-slate-100 text-slate-600",
  sent:     "bg-amber-100 text-amber-700",
  signed:   "bg-green-100 text-green-700",
  declined: "bg-red-50 text-red-600",
};
const PTSA_STATUS_LABELS = {
  draft: "Draft", sent: "Sent to Client", signed: "Signed", declined: "Declined",
};
// 'signed' is NOT a selectable status — it is set only via "Mark PTSA as signed"
// (POST /api/sales/leads/:id/ptsa/mark-signed), which stores the signed PDF and
// provisions the job folder. The dropdown offers draft / sent / declined only.
const PTSA_SELECTABLE_STATUSES = ["draft", "sent", "declined"];

const GATE_REQUIREMENTS = {
  qualify:       [],
  discovery:     [
    { field: "qualify_score", label: "Qualifying score ≥ 5", check: l => (l.qualify_score || 0) >= 5 },
    // Sales OS Slice 1 hard gate — a booked build conversation. Only enforced once migration 174 is
    // applied (the column is present on the lead); pre-migration it passes so nothing is blocked early.
    { field: "discovery_meeting_booked_at", label: "Build conversation booked", check: l => !("discovery_meeting_booked_at" in l) || !!l.discovery_meeting_booked_at },
  ],
  winning_offer: [
    // Sales OS Discovery hard gate — only enforced once mig 179 is applied (column present); pre-mig it passes.
    { field: "concept_agreement_status", label: "Concept agreement accepted", check: l => !("concept_agreement_status" in l) || l.concept_agreement_status === "accepted" },
    { field: "discovery_notes",   label: "Discovery notes filled",  check: l => !!l.discovery_notes?.trim() },
    { field: "design_stage",      label: "Design stage set",        check: l => !!l.design_stage },
    { field: "desired_start_date",label: "Desired start date set",  check: l => !!l.desired_start_date },
  ],
  fee_proposal:  [{ field: "preconstruction_fee", label: "Pre-construction fee set", check: l => l.preconstruction_fee != null }],
  accepted:      [],
  tender:        [
    { field: "site_address", label: "Site address set", check: l => !!l.site_address?.trim() },
    { field: "job_id", label: "Job created from this lead", check: l => !!l.job_id },
  ],
  won:           [],
};

function nextStage(current) {
  const idx = STAGE_ORDER.indexOf(current);
  return idx >= 0 && idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1] : null;
}

function relativeTime(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function InlineField({ label, value, type = "text", options, onSave, placeholder }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const ref = useRef();

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  useEffect(() => { setDraft(value || ""); }, [value]);

  function commit() {
    setEditing(false);
    const newVal = draft || null;
    const oldVal = value || null;
    if (newVal !== oldVal) onSave(newVal);
  }

  if (options) {
    return (
      <div className="flex items-center justify-between gap-2 py-1.5 border-b border-hairline last:border-0">
        <span className="text-xs text-muted w-36 flex-shrink-0">{label}</span>
        <select
          className="flex-1 text-sm text-ink bg-transparent border-0 focus:outline-none cursor-pointer"
          value={value || ""}
          onChange={e => onSave(e.target.value || null)}
        >
          <option value="">—</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-2 py-1.5 border-b border-hairline last:border-0">
      <span className="text-xs text-muted w-36 flex-shrink-0 pt-0.5">{label}</span>
      {editing ? (
        type === "textarea" ? (
          <textarea ref={ref} className="flex-1 text-sm text-ink bg-page border border-hairline rounded px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50" rows={3} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} />
        ) : (
          <input ref={ref} type={type} className="flex-1 text-sm text-ink bg-page border border-hairline rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/50" value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") { setEditing(false); setDraft(value || ""); } }} />
        )
      ) : (
        <button className="flex-1 text-left text-sm text-ink hover:bg-page rounded px-1 -mx-1 min-h-[20px]" onClick={() => { setDraft(value || ""); setEditing(true); }}>
          {value || <span className="text-muted/60 italic text-xs">{placeholder || "Click to edit"}</span>}
        </button>
      )}
    </div>
  );
}

function ScoreGate({ label, value, options, onChange }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="flex gap-1.5">
        {options.map((opt, i) => (
          <button
            key={i}
            onClick={() => onChange(i)}
            className={`flex-1 rounded px-2 py-1.5 text-xs font-medium border transition-colors ${value === i ? "bg-primary text-white border-primary" : "bg-page border-hairline text-ink hover:bg-surface"}`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

const QUALIFY_LABELS = {
  qualify_budget:        ["No budget", "Unsure", "Yes — clear budget"],
  qualify_timeframe:     ["18+ months", "6–18 months", "< 6 months"],
  qualify_site:          ["No site", "Under contract", "Owns site"],
  qualify_decision_maker:["Not DM", "One of two", "Sole DM"],
};

function fmt(key, val) {
  if (val == null) return "—";
  if (key === "estimated_value" || key === "preconstruction_fee")
    return `$${Number(val).toLocaleString("en-AU")}`;
  if (key === "floor_area_estimate") return `${val} m²`;
  if (key === "desired_start_date" || key === "next_action_date")
    return new Date(val).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  if (QUALIFY_LABELS[key]) return `${QUALIFY_LABELS[key][Number(val)]} (${val}/2)`;
  return String(val);
}

function SuggestionRow({ label, fieldKey, val, currentVal, checked, onChange }) {
  if (val == null) return null;
  return (
    <label className="flex items-start gap-3 py-1.5 cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="mt-0.5 rounded border-hairline text-primary focus-ring flex-shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xs font-medium text-ink">{label}</span>
          <span className="text-xs font-semibold text-accent">{fmt(fieldKey, val)}</span>
          {currentVal != null && currentVal !== "" && (
            <span className="text-xs text-muted line-through">{fmt(fieldKey, currentVal)}</span>
          )}
        </div>
      </div>
    </label>
  );
}

function SuggestionSection({ title, children }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : [children].filter(Boolean);
  if (!items.length) return null;
  return (
    <div className="border border-hairline rounded-lg p-3 space-y-1">
      <p className="section-label mb-2">{title}</p>
      {items}
    </div>
  );
}

// Read-only view of a saved conversation transcript
function ConversationViewPanel({ leadId, open, conv, onClose }) {
  const [full, setFull] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState("");

  useEffect(() => {
    if (!open || !conv) return;
    setFull(null); setLoadErr("");
    setLoading(true);
    authFetch(`/api/sales/leads/${leadId}/conversations/${conv.id}`)
      .then(r => r.json())
      .then(j => {
        if (!j.ok) throw new Error(j.error || "Failed to load");
        setFull(j.conversation);
      })
      .catch(e => setLoadErr(e.message))
      .finally(() => setLoading(false));
  }, [open, conv, leadId]);

  if (!open || !conv) return null;

  const displayConv = full || conv;
  const summary = displayConv.bp_suggestions?.summary;
  const appliedAt = displayConv.applied_at;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-lg bg-surface shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-hairline flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-ink truncate">
              {displayConv.title || "Meeting Transcript"}
            </h2>
            <p className="text-xs text-muted mt-0.5">
              {displayConv.created_at ? new Date(displayConv.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : ""}
              {appliedAt && <span className="ml-2 text-green-600 font-medium">✓ Applied</span>}
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink text-2xl leading-none ml-4">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {loading && (
            <div className="flex items-center justify-center py-10">
              <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            </div>
          )}
          {loadErr && <p className="text-sm text-red-600">{loadErr}</p>}

          {!loading && !loadErr && (
            <>
              {summary && (
                <div className="rounded-lg bg-primary/[0.05] border border-primary/20 px-4 py-3">
                  <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">Blueprint Summary</p>
                  <p className="text-sm text-ink">{summary}</p>
                </div>
              )}

              {displayConv.transcript_text ? (
                <div>
                  <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Transcript</p>
                  <pre className="whitespace-pre-wrap text-sm text-ink font-sans leading-relaxed bg-page rounded-lg border border-hairline px-4 py-3">
                    {displayConv.transcript_text}
                  </pre>
                </div>
              ) : !full ? (
                <p className="text-xs text-muted italic">Loading transcript…</p>
              ) : (
                <p className="text-xs text-muted italic">No transcript text stored.</p>
              )}

              {displayConv.bp_suggestions && Object.keys(displayConv.bp_suggestions).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Applied Suggestions</p>
                  <div className="rounded-lg border border-hairline bg-page px-4 py-3 space-y-1">
                    {Object.entries(displayConv.bp_suggestions)
                      .filter(([k, v]) => k !== "summary" && v != null && typeof v !== "object")
                      .map(([k, v]) => (
                        <div key={k} className="flex gap-2 text-xs">
                          <span className="text-muted w-36 flex-shrink-0 capitalize">{k.replace(/_/g, " ")}</span>
                          <span className="text-ink">{String(v)}</span>
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-hairline px-6 py-4">
          <button type="button" onClick={onClose} className="w-full rounded-lg border border-hairline px-4 py-2 text-sm text-ink hover:bg-page">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ConversationPanel({ leadId, lead, open, onClose, onSaved, conversations, onViewConv }) {
  const [step, setStep] = useState("input");
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [fileName, setFileName] = useState("");
  const [suggestions, setSuggestions] = useState(null);
  const [selected, setSelected] = useState({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef();

  function reset() {
    setStep("input"); setTitle(""); setTranscript(""); setFileName("");
    setSuggestions(null); setSelected({}); setErr("");
  }
  function close() { reset(); onClose(); }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = ev => setTranscript(String(ev.target.result || ""));
    reader.readAsText(file);
    e.target.value = "";
  }

  async function analyse() {
    if (!transcript.trim()) return;
    setStep("analysing"); setErr("");
    try {
      const r = await authFetch(`/api/sales/leads/${leadId}/conversations/analyse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: transcript.trim() })
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Analysis failed");
      const s = j.suggestions;
      setSuggestions(s);
      // Pre-select all non-null found values
      const init = {};
      [["lead", Object.keys(s?.lead || {})], ["project", Object.keys(s?.project || {})],
       ["qualifying", Object.keys(s?.qualifying || {})], ["winning_offer", Object.keys(s?.winning_offer || {})]
      ].forEach(([sec, keys]) => {
        keys.forEach(k => { if (s[sec][k] != null) init[`${sec}.${k}`] = true; });
      });
      if (s?.next_action != null) init.next_action = true;
      if (s?.next_action_date != null) init.next_action_date = true;
      init.activity = true;
      setSelected(init);
      setStep("review");
    } catch (e2) {
      setErr(e2.message); setStep("input");
    }
  }

  function toggleSec(sec, fields, on) {
    setSelected(prev => {
      const next = { ...prev };
      fields.forEach(k => { if (suggestions?.[sec]?.[k] != null) next[`${sec}.${k}`] = on; });
      return next;
    });
  }

  async function apply() {
    setSaving(true); setErr("");
    try {
      const applied = {};
      const s = suggestions || {};
      [["lead","first_name"],["lead","last_name"],["lead","email"],["lead","phone"],["lead","suburb"],
       ["project","project_type"],["project","estimated_value"],["project","floor_area_estimate"],
       ["project","design_stage"],["project","desired_start_date"],["project","discovery_notes"],
       ["qualifying","qualify_budget"],["qualifying","qualify_timeframe"],
       ["qualifying","qualify_site"],["qualifying","qualify_decision_maker"],
       ["winning_offer","preconstruction_fee"],["winning_offer","inclusions_summary"]
      ].forEach(([sec, k]) => {
        if (selected[`${sec}.${k}`] && s[sec]?.[k] != null) applied[k] = s[sec][k];
      });
      if (selected.next_action && s.next_action) applied.next_action = s.next_action;
      if (selected.next_action_date && s.next_action_date) applied.next_action_date = s.next_action_date;

      const r = await authFetch(`/api/sales/leads/${leadId}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || null,
          transcript: transcript.trim(),
          bp_suggestions: selected.activity ? suggestions : null,
          applied_fields: applied
        })
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Save failed");
      onSaved();
      close();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  const s = suggestions || {};
  const leadFields  = Object.keys(s?.lead || {}).filter(k => s.lead[k] != null);
  const projFields  = Object.keys(s?.project || {}).filter(k => s.project[k] != null);
  const qualFields  = Object.keys(s?.qualifying || {}).filter(k => s.qualifying[k] != null);
  const woFields    = Object.keys(s?.winning_offer || {}).filter(k => s.winning_offer[k] != null);
  const hasAnySugg  = leadFields.length || projFields.length || qualFields.length || woFields.length;
  const PROJECT_TYPE_LABEL = t => ({ new_build:"New Build", extension:"Extension", renovation:"Renovation", knockdown_rebuild:"Knockdown Rebuild" })[t] || t;
  const DESIGN_STAGE_LABEL = t => ({ concept:"Concept", da_approved:"DA Approved", construction_drawings:"Construction Drawings" })[t] || t;
  const fieldLabel = k => ({
    first_name:"First name", last_name:"Last name", email:"Email", phone:"Phone", suburb:"Suburb",
    project_type:"Project type", estimated_value:"Est. value", floor_area_estimate:"Floor area",
    design_stage:"Design stage", desired_start_date:"Desired start", discovery_notes:"Discovery notes",
    qualify_budget:"Budget", qualify_timeframe:"Timeframe", qualify_site:"Site", qualify_decision_maker:"Decision maker",
    preconstruction_fee:"Pre-construction fee", inclusions_summary:"Inclusions", next_action:"Next action", next_action_date:"Next action date"
  })[k] || k;
  const displayVal = (sec, k, v) => {
    if (k === "project_type") return PROJECT_TYPE_LABEL(v);
    if (k === "design_stage") return DESIGN_STAGE_LABEL(v);
    return fmt(k, v);
  };
  const currentVal = (sec, k) => {
    const map = { lead: lead, project: lead, qualifying: lead, winning_offer: lead };
    return map[sec]?.[k];
  };
  const anySelected = Object.values(selected).some(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={close} />
      <div className="w-full max-w-lg bg-surface shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-hairline flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-ink">
              {step === "review" ? "Review Suggestions" : "Add Meeting Transcript"}
            </h2>
            {step === "review" && s.summary && (
              <p className="text-xs text-muted mt-0.5 line-clamp-2">{s.summary}</p>
            )}
          </div>
          <button onClick={close} className="text-muted hover:text-ink text-2xl leading-none ml-4">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === "input" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Title (optional)</label>
                <input
                  className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink bg-page focus-ring"
                  placeholder="e.g. Initial discovery meeting"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-muted">Transcript</label>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="text-xs text-primary hover:opacity-70"
                  >
                    {fileName ? `📎 ${fileName}` : "Upload .txt file"}
                  </button>
                  <input ref={fileRef} type="file" accept=".txt,.md" className="hidden" onChange={handleFile} />
                </div>
                <textarea
                  className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink bg-page focus-ring resize-none"
                  rows={14}
                  placeholder={"Paste transcript here…\n\nWorks with Plaud exports, Otter.ai, Fireflies, or any plain text transcript. You can also type notes from memory."}
                  value={transcript}
                  onChange={e => setTranscript(e.target.value)}
                />
                <p className="text-xs text-muted mt-1">{transcript.length} characters</p>
              </div>
              {err && <p className="text-sm text-red-600">{err}</p>}
            </div>
          )}

          {step === "analysing" && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
              <p className="text-sm text-muted">Blueprint is reading your transcript…</p>
              <p className="text-xs text-muted/60">Extracting lead details, project info & qualifying scores</p>
            </div>
          )}

          {step === "review" && (
            <div className="space-y-4">
              {!hasAnySugg && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                  Blueprint couldn&apos;t extract specific details from this transcript. You can still save it to the conversation log.
                </div>
              )}

              {leadFields.length > 0 && (
                <SuggestionSection title={
                  <span className="flex items-center gap-2">Contact
                    <button className="text-xs font-normal text-primary hover:opacity-70" onClick={() => toggleSec("lead", leadFields, !leadFields.every(k => selected[`lead.${k}`]))}>
                      {leadFields.every(k => selected[`lead.${k}`]) ? "deselect all" : "select all"}
                    </button>
                  </span>
                }>
                  {leadFields.map(k => (
                    <SuggestionRow key={k} label={fieldLabel(k)} fieldKey={k}
                      val={s.lead[k]} currentVal={currentVal("lead", k)}
                      checked={!!selected[`lead.${k}`]}
                      onChange={v => setSelected(p => ({ ...p, [`lead.${k}`]: v }))} />
                  ))}
                </SuggestionSection>
              )}

              {projFields.length > 0 && (
                <SuggestionSection title={
                  <span className="flex items-center gap-2">Project
                    <button className="text-xs font-normal text-primary hover:opacity-70" onClick={() => toggleSec("project", projFields, !projFields.every(k => selected[`project.${k}`]))}>
                      {projFields.every(k => selected[`project.${k}`]) ? "deselect all" : "select all"}
                    </button>
                  </span>
                }>
                  {projFields.map(k => (
                    <SuggestionRow key={k} label={fieldLabel(k)} fieldKey={k}
                      val={displayVal("project", k, s.project[k])} currentVal={currentVal("project", k)}
                      checked={!!selected[`project.${k}`]}
                      onChange={v => setSelected(p => ({ ...p, [`project.${k}`]: v }))} />
                  ))}
                </SuggestionSection>
              )}

              {qualFields.length > 0 && (
                <SuggestionSection title={
                  <span className="flex items-center gap-2">Qualifying Score
                    <button className="text-xs font-normal text-primary hover:opacity-70" onClick={() => toggleSec("qualifying", qualFields, !qualFields.every(k => selected[`qualifying.${k}`]))}>
                      {qualFields.every(k => selected[`qualifying.${k}`]) ? "deselect all" : "select all"}
                    </button>
                  </span>
                }>
                  {qualFields.map(k => (
                    <SuggestionRow key={k} label={fieldLabel(k)} fieldKey={k}
                      val={s.qualifying[k]} currentVal={currentVal("qualifying", k)}
                      checked={!!selected[`qualifying.${k}`]}
                      onChange={v => setSelected(p => ({ ...p, [`qualifying.${k}`]: v }))} />
                  ))}
                </SuggestionSection>
              )}

              {woFields.length > 0 && (
                <SuggestionSection title="Winning Offer">
                  {woFields.map(k => (
                    <SuggestionRow key={k} label={fieldLabel(k)} fieldKey={k}
                      val={s.winning_offer[k]} currentVal={currentVal("winning_offer", k)}
                      checked={!!selected[`winning_offer.${k}`]}
                      onChange={v => setSelected(p => ({ ...p, [`winning_offer.${k}`]: v }))} />
                  ))}
                </SuggestionSection>
              )}

              {(s.next_action || s.next_action_date) && (
                <SuggestionSection title="Next Action">
                  {s.next_action && (
                    <SuggestionRow label="Next action" fieldKey="next_action"
                      val={s.next_action} currentVal={lead.next_action}
                      checked={!!selected.next_action}
                      onChange={v => setSelected(p => ({ ...p, next_action: v }))} />
                  )}
                  {s.next_action_date && (
                    <SuggestionRow label="Due date" fieldKey="next_action_date"
                      val={s.next_action_date} currentVal={lead.next_action_date}
                      checked={!!selected.next_action_date}
                      onChange={v => setSelected(p => ({ ...p, next_action_date: v }))} />
                  )}
                </SuggestionSection>
              )}

              <SuggestionSection title="Activity Log">
                <label className="flex items-start gap-3 py-1 cursor-pointer">
                  <input type="checkbox" checked={!!selected.activity}
                    onChange={e => setSelected(p => ({ ...p, activity: e.target.checked }))}
                    className="mt-0.5 rounded border-hairline text-primary focus-ring flex-shrink-0" />
                  <div>
                    <span className="text-xs font-medium text-ink">🤝 Log meeting to timeline</span>
                    {s.activity?.summary && <p className="text-xs text-muted mt-0.5">{s.activity.summary}</p>}
                  </div>
                </label>
              </SuggestionSection>

              {err && <p className="text-sm text-red-600">{err}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-hairline px-6 py-4 flex gap-3">
          {step === "input" && (
            <>
              <button type="button" onClick={close} className="flex-1 rounded-lg border border-hairline px-4 py-2 text-sm text-ink hover:bg-page">Cancel</button>
              <button
                type="button"
                onClick={analyse}
                disabled={!transcript.trim()}
                className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                Analyse with Blueprint ✦
              </button>
            </>
          )}
          {step === "review" && (
            <>
              <button type="button" onClick={() => setStep("input")} className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink hover:bg-page">← Edit</button>
              <button
                type="button"
                onClick={apply}
                disabled={saving || !anySelected}
                className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Applying…" : `Apply & Save`}
              </button>
            </>
          )}
        </div>

        {/* Past conversations list */}
        {conversations.length > 0 && step === "input" && (
          <div className="flex-shrink-0 border-t border-hairline px-6 pb-5">
            <p className="section-label my-3">Previous conversations</p>
            <div className="space-y-2">
              {conversations.map(c => (
                <button key={c.id} onClick={() => onViewConv(c)} className="w-full text-left rounded-lg border border-hairline bg-page px-3 py-2 hover:bg-surface text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink truncate">{c.title || "Meeting"}</span>
                    <span className="text-xs text-muted flex-shrink-0">{relativeTime(c.created_at)}</span>
                  </div>
                  {c.bp_suggestions?.summary && (
                    <p className="text-xs text-muted mt-0.5 line-clamp-1">{c.bp_suggestions.summary}</p>
                  )}
                  {c.applied_at && <span className="text-xs text-green-600 font-medium">✓ Applied</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// APB Pricing 4 Profit: margin % not markup.
// 33% margin on $100k cost = $149k sell price (cost ÷ (1 − margin))
function marginToMarkup(marginPct) {
  if (!marginPct || marginPct >= 100) return null;
  return (marginPct / (100 - marginPct)) * 100;
}


function MarginPanel({ lead, onSave }) {
  const gp = lead.target_gp_pct;
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(gp != null ? String(gp) : "");

  function handleSave() {
    const n = parseFloat(val);
    onSave(isNaN(n) ? null : n);
    setEditing(false);
  }

  const marginColor = gp == null ? "text-muted" : gp >= 40 ? "text-green-600" : gp >= 33 ? "text-amber-600" : "text-red-500";
  const markup = gp != null ? marginToMarkup(gp) : null;
  const estimatedCost = lead.estimated_value && gp != null ? lead.estimated_value * (1 - gp / 100) : null;

  return (
    <div className="rounded-card border border-hairline bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="section-label">Target Margin</h3>
        {gp != null && (
          <span className={`text-sm font-bold ${marginColor}`}>{gp}%</span>
        )}
      </div>

      {editing ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            type="number"
            min="0"
            max="99"
            step="0.5"
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
            className="flex-1 rounded-lg border border-hairline px-3 py-1.5 text-sm bg-page text-ink focus-ring"
            placeholder="e.g. 40"
          />
          <span className="text-sm text-muted">%</span>
          <button onClick={handleSave} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white">Set</button>
          <button onClick={() => setEditing(false)} className="text-xs text-muted hover:text-ink">✕</button>
        </div>
      ) : (
        <button
          onClick={() => { setVal(gp != null ? String(gp) : ""); setEditing(true); }}
          className="w-full text-left text-sm text-muted hover:text-ink"
        >
          {gp == null ? "Set target margin…" : `${gp}% gross margin`}
        </button>
      )}

      {gp != null && (
        <div className="mt-3 space-y-1 text-xs">
          <div className="flex justify-between text-muted">
            <span>Equivalent markup</span>
            <span className="font-medium text-ink">{markup != null ? `${markup.toFixed(1)}%` : "—"}</span>
          </div>
          {lead.estimated_value && (
            <div className="flex justify-between text-muted">
              <span>Implied cost (at {gp}% margin)</span>
              <span className="font-medium text-ink">
                {estimatedCost != null ? `$${Math.round(estimatedCost).toLocaleString()}` : "—"}
              </span>
            </div>
          )}
          <div className={`mt-2 rounded-lg px-3 py-2 text-xs font-medium ${gp >= 40 ? "bg-green-50 text-green-700" : gp >= 33 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-600"}`}>
            {gp >= 40
              ? `✓ At or above APB target (40%)`
              : gp >= 33
              ? `⚠ Above APB minimum (33%) but below 40% target`
              : `✗ Below APB minimum margin (33%) — review pricing`}
          </div>
        </div>
      )}

      {gp == null && (
        <p className="mt-2 text-xs text-muted">APB minimum 33%, target 40%. Always use margin %, not markup.</p>
      )}
    </div>
  );
}

const DOCUMENT_TYPE_LABELS = {
  brief: "Brief", blueprint: "Blueprint", survey: "Survey",
  quote: "Quote", contract: "Contract", other: "Other",
};
const DOCUMENT_TYPE_COLORS = {
  brief: "bg-blue-50 text-blue-700", blueprint: "bg-violet-50 text-violet-700",
  survey: "bg-amber-50 text-amber-700", quote: "bg-green-50 text-green-700",
  contract: "bg-teal-50 text-teal-700", other: "bg-slate-100 text-slate-600",
};

function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Batch 1B — trust-context rail: acquisition touch (first/last) + a structured
// objections / fears / priorities list (lead_signals) with add + resolve inline.
const SIGNAL_META = {
  objection: { label: "Objection", icon: "🚧" },
  fear:      { label: "Fear",      icon: "😟" },
  priority:  { label: "Priority",  icon: "⭐" },
};
function LeadTrustRail({ leadId, lead }) {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newKind, setNewKind] = useState("objection");
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const loadSignals = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authFetch(`/api/sales/leads/${leadId}/signals`).then(r => r.json());
      setSignals(r.signals || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [leadId]);
  useEffect(() => { loadSignals(); }, [loadSignals]);

  async function addSignal(e) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setSaving(true);
    try {
      const r = await authFetch(`/api/sales/leads/${leadId}/signals`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: newKind, label: newLabel.trim() }),
      }).then(r => r.json());
      if (r.ok) { setNewLabel(""); setAdding(false); await loadSignals(); }
    } finally { setSaving(false); }
  }
  async function toggleSignal(sig) {
    const next = sig.status === "open" ? "addressed" : "open";
    await authFetch(`/api/sales/leads/${leadId}/signals/${sig.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    await loadSignals();
  }
  async function removeSignal(sig) {
    await authFetch(`/api/sales/leads/${leadId}/signals/${sig.id}`, { method: "DELETE" });
    await loadSignals();
  }

  const firstTouch = lead?.first_touch_source
    ? `${lead.first_touch_source}${lead.first_touch_medium ? ` / ${lead.first_touch_medium}` : ""}`
    : (lead?.lead_source || "—");
  const lastTouch = lead?.last_touch_source
    ? `${lead.last_touch_source}${lead.last_touch_medium ? ` / ${lead.last_touch_medium}` : ""}`
    : "—";

  return (
    <div className="rounded-card border border-hairline bg-surface p-4">
      <h3 className="section-label mb-3">Trust &amp; context</h3>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-muted">First touch</p>
          <p className="mt-0.5 font-medium capitalize text-ink">{firstTouch}</p>
        </div>
        <div>
          <p className="text-muted">Last touch</p>
          <p className="mt-0.5 font-medium capitalize text-ink">{lastTouch}</p>
        </div>
        {lead?.lead_source_category && (
          <div>
            <p className="text-muted">Source category</p>
            <p className="mt-0.5 font-medium text-ink">{LEAD_SOURCE_CATEGORY_LABELS[lead.lead_source_category] || lead.lead_source_category}</p>
          </div>
        )}
        {(lead?.utm_campaign || lead?.first_touch_utm_campaign) && (
          <div>
            <p className="text-muted">Campaign</p>
            <p className="mt-0.5 font-medium text-ink">{lead.utm_campaign || lead.first_touch_utm_campaign}</p>
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-hairline pt-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-ink">Objections · Fears · Priorities</p>
          <button type="button" onClick={() => setAdding(a => !a)} className="text-xs text-primary hover:underline">
            {adding ? "Cancel" : "+ Add"}
          </button>
        </div>

        {adding && (
          <form onSubmit={addSignal} className="mt-2 space-y-2">
            <select value={newKind} onChange={(e) => setNewKind(e.target.value)} className="w-full rounded border border-hairline px-2 py-1 text-xs">
              {Object.entries(SIGNAL_META).map(([k, m]) => <option key={k} value={k}>{m.icon} {m.label}</option>)}
            </select>
            <input autoFocus value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Worried about budget blowout" className="w-full rounded border border-hairline px-2 py-1 text-xs" />
            <button type="submit" disabled={saving || !newLabel.trim()} className="rounded bg-primary px-3 py-1 text-xs font-medium text-white disabled:opacity-50">Add</button>
          </form>
        )}

        {loading ? (
          <p className="mt-2 text-xs italic text-muted">Loading…</p>
        ) : signals.length === 0 ? (
          <p className="mt-2 text-xs italic text-muted">None logged yet.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {signals.map((sig) => {
              const meta = SIGNAL_META[sig.kind] || { icon: "•", label: sig.kind };
              const done = sig.status === "addressed";
              return (
                <li key={sig.id} className="flex items-start gap-2 text-xs">
                  <span className="select-none">{meta.icon}</span>
                  <span className={`min-w-0 flex-1 ${done ? "text-muted line-through" : "text-ink"}`}>{sig.label}</span>
                  <button type="button" onClick={() => toggleSignal(sig)} title={done ? "Reopen" : "Mark addressed"} className="flex-shrink-0 text-muted hover:text-accent">{done ? "↺" : "✓"}</button>
                  <button type="button" onClick={() => removeSignal(sig)} title="Remove" className="flex-shrink-0 text-muted hover:text-red-500">×</button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function LeadNotesPanel({ leadId }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newBody, setNewBody] = useState("");
  const [newType, setNewType] = useState("internal");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState("");
  const [err, setErr] = useState("");

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authFetch(`/api/sales/leads/${leadId}/notes`).then(r => r.json());
      setNotes(r.notes || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [leadId]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  async function addNote(e) {
    e.preventDefault();
    if (!newBody.trim()) return;
    setSaving(true); setErr("");
    try {
      const r = await authFetch(`/api/sales/leads/${leadId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newBody, note_type: newType }),
      }).then(r => r.json());
      if (!r.ok) throw new Error(r.error);
      setNewBody(""); setNewType("internal");
      await loadNotes();
    } catch (e2) { setErr(e2.message); }
    finally { setSaving(false); }
  }

  async function saveEdit(noteId) {
    if (!editBody.trim()) return;
    try {
      const r = await authFetch(`/api/sales/leads/${leadId}/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: editBody }),
      }).then(r => r.json());
      if (!r.ok) throw new Error(r.error);
      setEditingId(null); setEditBody("");
      await loadNotes();
    } catch { /* silent */ }
  }

  async function deleteNote(noteId) {
    if (!confirm("Delete this note?")) return;
    await authFetch(`/api/sales/leads/${leadId}/notes/${noteId}`, { method: "DELETE" });
    await loadNotes();
  }

  return (
    <div className="rounded-card border border-hairline bg-surface p-4">
      <h3 className="section-label mb-3">Notes</h3>

      {/* Add note form */}
      <form onSubmit={addNote} className="space-y-2 mb-4">
        <textarea
          className="w-full rounded-lg border border-hairline px-3 py-2 text-sm bg-page text-ink resize-none focus-ring"
          rows={3}
          placeholder="Add an internal note about this lead…"
          value={newBody}
          onChange={e => setNewBody(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <select
            className="flex-1 rounded-lg border border-hairline px-3 py-1.5 text-sm bg-page text-ink"
            value={newType}
            onChange={e => setNewType(e.target.value)}
          >
            <option value="internal">Internal note</option>
            <option value="client_facing">Client-facing note</option>
          </select>
          <button
            type="submit"
            disabled={saving || !newBody.trim()}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Add"}
          </button>
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </form>

      {/* Notes list */}
      {loading ? (
        <p className="text-xs text-muted italic">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="text-xs text-muted italic">No notes yet.</p>
      ) : (
        <div className="space-y-3">
          {notes.map(note => (
            <div key={note.id} className="rounded-lg border border-hairline bg-page p-3">
              {editingId === note.id ? (
                <div className="space-y-2">
                  <textarea
                    autoFocus
                    className="w-full rounded border border-hairline px-2 py-1.5 text-sm bg-surface text-ink resize-none focus-ring"
                    rows={3}
                    value={editBody}
                    onChange={e => setEditBody(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(note.id)} className="text-xs font-semibold text-primary hover:opacity-70">Save</button>
                    <button onClick={() => { setEditingId(null); setEditBody(""); }} className="text-xs text-muted hover:text-ink">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-ink whitespace-pre-wrap flex-1">{note.body}</p>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => { setEditingId(note.id); setEditBody(note.body); }}
                        className="text-xs text-muted hover:text-ink"
                        title="Edit"
                      >✎</button>
                      <button
                        onClick={() => deleteNote(note.id)}
                        className="text-xs text-muted hover:text-red-500"
                        title="Delete"
                      >✕</button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${note.note_type === "client_facing" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                      {note.note_type === "client_facing" ? "Client-facing" : "Internal"}
                    </span>
                    <span className="text-[10px] text-muted">{note.author_name} · {relativeTime(note.created_at)}</span>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LeadDocumentsPanel({ leadId }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState("other");
  const [err, setErr] = useState("");
  const fileRef = useRef();

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authFetch(`/api/sales/leads/${leadId}/documents`).then(r => r.json());
      setDocuments(r.documents || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [leadId]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    uploadFile(file);
  }

  async function uploadFile(file) {
    setUploading(true); setErr("");
    try {
      const reader = new FileReader();
      const b64 = await new Promise((resolve, reject) => {
        reader.onload = ev => resolve(ev.target.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const r = await authFetch(`/api/sales/leads/${leadId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          data: b64,
          mime_type: file.type || "application/octet-stream",
          document_type: uploadType,
          file_size: file.size,
        }),
      }).then(r => r.json());
      if (!r.ok) throw new Error(r.error);
      await loadDocs();
    } catch (e2) { setErr(e2.message); }
    finally { setUploading(false); }
  }

  async function deleteDoc(docId) {
    if (!confirm("Remove this document?")) return;
    await authFetch(`/api/sales/leads/${leadId}/documents/${docId}`, { method: "DELETE" });
    await loadDocs();
  }

  return (
    <div className="rounded-card border border-hairline bg-surface p-4">
      <h3 className="section-label mb-3">Documents</h3>

      {/* Upload controls */}
      <div className="flex items-center gap-2 mb-4">
        <select
          className="flex-1 rounded-lg border border-hairline px-3 py-1.5 text-sm bg-page text-ink"
          value={uploadType}
          onChange={e => setUploadType(e.target.value)}
        >
          {Object.entries(DOCUMENT_TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
        >
          {uploading ? "Uploading…" : "⬆ Upload"}
        </button>
        <input ref={fileRef} type="file" className="hidden" onChange={handleFileSelect} />
      </div>
      {err && <p className="text-xs text-red-600 mb-2">{err}</p>}

      {/* Documents list */}
      {loading ? (
        <p className="text-xs text-muted italic">Loading…</p>
      ) : documents.length === 0 ? (
        <p className="text-xs text-muted italic">No documents attached yet. Upload blueprints, briefs, or site surveys.</p>
      ) : (
        <div className="space-y-2">
          {documents.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 rounded-lg border border-hairline bg-page px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${DOCUMENT_TYPE_COLORS[doc.document_type] || DOCUMENT_TYPE_COLORS.other}`}>
                    {DOCUMENT_TYPE_LABELS[doc.document_type] || "Other"}
                  </span>
                  <span className="text-sm font-medium text-ink truncate">{doc.filename}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {doc.file_size && <span className="text-[10px] text-muted">{formatFileSize(doc.file_size)}</span>}
                  <span className="text-[10px] text-muted">{relativeTime(doc.created_at)}</span>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {doc.download_url && (
                  <a
                    href={doc.download_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary hover:opacity-70"
                    title="Download"
                  >↓</a>
                )}
                <button
                  onClick={() => deleteDoc(doc.id)}
                  className="text-xs text-muted hover:text-red-500"
                  title="Remove"
                >✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Site Intelligence Panel (G1-C) ────────────────────────────────────────────
// Read-only. Signals are advisory — never authoritative compliance determinations.
function SiteIntelPanel({ lead, onEnriched }) {
  const [enriching, setEnriching] = useState(false);
  const [enrichErr, setEnrichErr] = useState("");

  const {
    siteCouncil,
    siteBushfireProne,
    siteBushfireDetail,
    siteZone,
    siteSlopeBand,
    siteSlopeDeg,
    siteComplexity,
    siteEnrichedAt,
  } = lead;

  const hasAnyData = siteEnrichedAt != null;

  async function handleEnrichNow() {
    setEnriching(true);
    setEnrichErr("");
    const { ok: success, error } = await apiPost(`/api/geo/enrich/leads/${lead.id}`, {});
    if (success) {
      onEnriched?.();
    } else {
      setEnrichErr(error || "Enrichment failed — try again.");
    }
    setEnriching(false);
  }

  // Empty state when no enrichment has run and no data present
  if (!hasAnyData) {
    return (
      <div className="rounded-card border border-hairline bg-surface p-4">
        <h3 className="section-label mb-2">Site intelligence</h3>
        <p className="text-xs text-muted italic">
          Site intelligence will appear once this lead is qualified.
        </p>
        <p className="mt-1 text-xs text-muted">
          Enrichment runs automatically when a lead advances to Qualify or later.
        </p>
      </div>
    );
  }

  // Bushfire three-state
  let bushfireEl;
  if (siteBushfireProne === true) {
    bushfireEl = (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
        &#9888; Bushfire overlay — confirm BAL
      </span>
    );
  } else if (siteBushfireProne === false) {
    bushfireEl = <span className="text-sm text-ink">No bushfire overlay found</span>;
  } else {
    // null / undefined — UNKNOWN state: do NOT imply safe
    bushfireEl = (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
        Bushfire: unknown — verify
      </span>
    );
  }

  // Complexity badge
  const complexityColors = {
    low:    "bg-green-100 text-green-700",
    medium: "bg-amber-100 text-amber-700",
    high:   "bg-red-100 text-red-700",
  };
  const complexityEl = siteComplexity ? (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${complexityColors[siteComplexity] || "bg-slate-100 text-slate-600"}`}>
      {siteComplexity}
    </span>
  ) : <span className="text-sm text-ink">—</span>;

  // Slope display
  let slopeText = "—";
  if (siteSlopeBand) {
    const bandLabel = { flat: "Flat", gentle: "Gentle", moderate: "Moderate", steep: "Steep" }[siteSlopeBand] || siteSlopeBand;
    slopeText = siteSlopeDeg != null ? `${bandLabel} (${siteSlopeDeg}°)` : bandLabel;
  }

  // Enriched-at footer
  const enrichedFooter = siteEnrichedAt ? (
    <p className="text-[10px] text-muted">
      Enriched {new Date(siteEnrichedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
    </p>
  ) : (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-[10px] text-muted">Not yet enriched — runs when the lead is qualified.</p>
      <button
        type="button"
        onClick={handleEnrichNow}
        disabled={enriching}
        className="rounded border border-hairline bg-page px-2 py-0.5 text-[10px] font-medium text-ink hover:bg-surface disabled:opacity-50"
      >
        {enriching ? "Enriching…" : "Enrich now"}
      </button>
    </div>
  );

  return (
    <div className="rounded-card border border-hairline bg-surface p-4">
      <h3 className="section-label mb-3">Site intelligence</h3>

      <div className="space-y-0">
        {/* Council */}
        <div className="flex items-start justify-between gap-2 py-1.5 border-b border-hairline">
          <span className="text-xs text-muted w-36 flex-shrink-0 pt-0.5">Council</span>
          <span className="flex-1 text-sm text-ink">{siteCouncil || "—"}</span>
        </div>

        {/* Bushfire */}
        <div className="flex items-start justify-between gap-2 py-1.5 border-b border-hairline">
          <span className="text-xs text-muted w-36 flex-shrink-0 pt-0.5">Bushfire</span>
          <span className="flex-1">{bushfireEl}</span>
        </div>
        {siteBushfireDetail && (
          <div className="flex items-start justify-between gap-2 py-1 border-b border-hairline">
            <span className="text-xs text-muted w-36 flex-shrink-0" />
            <span className="flex-1 text-xs text-muted">{siteBushfireDetail}</span>
          </div>
        )}

        {/* Zone (indicative) */}
        <div className="flex items-start justify-between gap-2 py-1.5 border-b border-hairline">
          <span className="text-xs text-muted w-36 flex-shrink-0 pt-0.5">Zone <span className="italic">(indicative)</span></span>
          <span className="flex-1 text-sm text-ink">{siteZone || "—"}</span>
        </div>

        {/* Slope */}
        <div className="flex items-start justify-between gap-2 py-1.5 border-b border-hairline">
          <span className="text-xs text-muted w-36 flex-shrink-0 pt-0.5">Slope</span>
          <span className="flex-1 text-sm text-ink">{slopeText}</span>
        </div>

        {/* Site complexity */}
        <div className="flex items-start justify-between gap-2 py-1.5">
          <span className="text-xs text-muted w-36 flex-shrink-0 pt-0.5">Site complexity</span>
          <span className="flex-1">{complexityEl}</span>
        </div>
      </div>

      {/* Advisory disclaimer */}
      <p className="mt-3 text-[10px] text-muted leading-relaxed border-t border-hairline pt-2">
        Indicative signals from public mapping — verify before relying on them.
      </p>

      {/* Footer: enriched timestamp or enrich-now button */}
      <div className="mt-1.5">
        {enrichedFooter}
        {enrichErr && <p className="mt-1 text-xs text-red-600">{enrichErr}</p>}
      </div>
    </div>
  );
}

export default function LeadDetail() {
  const { leadId } = useParams();
  const nav = useNavigate();
  const { setScreenContext } = useBlueprintContext() || {};
  const { role } = useAuth() || {};
  const isAdmin = role === "admin";

  const [lead, setLead] = useState(null);
  const [activities, setActivities] = useState([]);
  const [timeline, setTimeline] = useState(null);        // Batch 1B unified timeline (null until loaded / view missing)
  const [timelineViewMissing, setTimelineViewMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [actType, setActType] = useState("note");
  const [actSummary, setActSummary] = useState("");
  const [actNextAction, setActNextAction] = useState("");
  const [actNextDate, setActNextDate] = useState("");
  const [actBusy, setActBusy] = useState(false);

  const [bpInsight, setBpInsight] = useState("");
  const [bpLoading, setBpLoading] = useState(false);
  const [convOpen, setConvOpen] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [viewConvOpen, setViewConvOpen] = useState(false);
  const [viewConv, setViewConv] = useState(null);
  const [generatingPTSA, setGeneratingPTSA] = useState(false);
  const [ptsaError, setPtsaError] = useState("");
  const [refProjects, setRefProjects] = useState([]);
  const [markingSigned, setMarkingSigned] = useState(false);
  const [signedFile, setSignedFile] = useState(null);
  const [signedDateInput, setSignedDateInput] = useState("");
  const [signedDownloadUrl, setSignedDownloadUrl] = useState(null);
  const [ptsaSiteAddressWarning, setPtsaSiteAddressWarning] = useState(false);
  const [mobileTab, setMobileTab] = useState("action"); // "summary" | "action" | "activity" | "files" | "notes"
  const [ownerOptions, setOwnerOptions] = useState([]); // [{ value: userId, label: name }]

  const bpFetchedFor = useRef(null);

  // Load active staff for the Owner dropdown (runs once on mount).
  useEffect(() => {
    apiFetch("/api/workforce/employees")
      .then(({ ok: success, data }) => {
        if (!success) return;
        const employees = data?.employees || [];
        setOwnerOptions(
          employees
            .filter(e => e.userId) // only staff with a linked auth user
            .map(e => ({ value: e.userId, label: e.name }))
        );
      })
      .catch(() => {}); // non-fatal — Owner field degrades to UUID display
  }, []);

  const load = useCallback(async () => {
    try {
      const [lr, cr, tr] = await Promise.all([
        authFetch(`/api/sales/leads/${leadId}`).then(r => r.json()),
        authFetch(`/api/sales/leads/${leadId}/conversations`).then(r => r.json()).catch(() => ({ ok: true, conversations: [] })),
        authFetch(`/api/sales/leads/${leadId}/timeline`).then(r => r.json()).catch(() => ({ ok: true, timeline: [], viewMissing: true }))
      ]);
      if (!lr.ok) throw new Error(lr.error);
      setLead(lr.lead);
      setActivities(lr.activities || []);
      setConversations(cr.conversations || []);
      // On a hard timeline error (non-42P01, so no viewMissing flag), pass timeline=null so
      // LeadUnifiedTimeline degrades to the already-loaded activities list rather than showing
      // an empty "No history yet." Only a clean ok response yields a real (possibly empty) stream.
      setTimeline(tr.ok ? (tr.timeline || []) : null);
      setTimelineViewMissing(tr.ok ? !!tr.viewMissing : true);
      setScreenContext?.({ page: "lead_detail", leadId, stage: lr.lead.stage, name: displayLeadName(lr.lead) });
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [leadId, setScreenContext]);

  useEffect(() => {
    load();
    return () => setScreenContext?.(null);
  }, [load, setScreenContext]);

  useEffect(() => {
    if (!lead) return;
    const showWO = lead.lead_type !== "architect_tender"
      && ["winning_offer", "fee_proposal", "accepted", "tender", "won"].includes(lead.stage);
    if (!showWO) return;
    authFetch("/api/sales/reference-projects")
      .then((r) => r.json())
      .then((j) => { if (j.ok) setRefProjects(j.projects || []); })
      .catch(() => setRefProjects([]));
  }, [lead?.id, lead?.stage, lead?.lead_type]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve a short-lived signed-download URL for the stored signed PTSA PDF.
  useEffect(() => {
    if (lead?.ptsa_status !== "signed" || !lead?.ptsa_signed_document_path) {
      setSignedDownloadUrl(null);
      return;
    }
    let cancelled = false;
    authFetch(`/api/sales/leads/${leadId}/documents`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j.ok) return;
        const match = (j.documents || []).find(
          (d) => d.document_type === "ptsa_signed" || d.storage_path === lead.ptsa_signed_document_path
        );
        setSignedDownloadUrl(match?.download_url || null);
      })
      .catch(() => { if (!cancelled) setSignedDownloadUrl(null); });
    return () => { cancelled = true; };
  }, [leadId, lead?.ptsa_status, lead?.ptsa_signed_document_path]);

  async function patch(updates) {
    const r = await authFetch(`/api/sales/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates)
    });
    const j = await r.json();
    if (j.ok) setLead(j.lead);
    return j.lead;
  }

  async function logActivity(e) {
    e.preventDefault();
    if (!actSummary.trim()) return;
    setActBusy(true);
    try {
      await authFetch(`/api/sales/leads/${leadId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activity_type: actType, summary: actSummary, next_action: actNextAction || undefined, next_action_date: actNextDate || undefined })
      });
      setActSummary(""); setActNextAction(""); setActNextDate("");
      await load();
    } finally {
      setActBusy(false);
    }
  }

  async function fetchBlueprintInsight(leadData) {
    const l = leadData || lead;
    if (!l) return;
    const cacheKey = `${l.id}:${l.stage}`;
    if (bpFetchedFor.current === cacheKey && bpInsight) return;
    setBpLoading(true); setBpInsight("");
    const stageName = STAGES.find(s => s.id === l.stage)?.label || l.stage;
    const msg = `I have a sales lead named ${displayLeadName(l)} in the ${stageName} stage of my builder sales pipeline. Qualifying score: ${l.qualify_score ?? "not assessed"}/8. Project type: ${l.project_type || "unknown"}. Suburb: ${l.suburb || "unknown"}.${l.discovery_notes ? " Discovery: " + l.discovery_notes.slice(0, 200) : ""} Based on the APB sales framework, what should I do next with this lead? Give specific, actionable advice in 3-4 sentences.`;
    try {
      const r = await authFetch("/api/blueprint/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: msg }], hubContext: { page: "lead_detail", stage: l.stage, leadId: l.id } })
      });
      const j = await r.json();
      setBpInsight(j.reply || j.response || j.message || "No response.");
      bpFetchedFor.current = cacheKey;
    } catch {
      setBpInsight("Blueprint unavailable — check API configuration.");
    } finally {
      setBpLoading(false);
    }
  }

  useEffect(() => {
    if (lead) fetchBlueprintInsight(lead);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id, lead?.stage]);

  const [creatingJob, setCreatingJob] = useState(false);
  async function createJobFromLead() {
    if (creatingJob || lead.job_id) return;
    if (!lead.site_address?.trim()) {
      alert("Add a site address before creating a job.");
      return;
    }
    setCreatingJob(true);
    try {
      // Phase 2: server-side, non-lossy conversion. The endpoint creates the job,
      // stamps every carried lead fact via the facts service (provenance), links the
      // lead + CRM contact, and returns the new job in camelCase. UX unchanged.
      const { ok, data, error } = await apiPost(`/api/sales/leads/${lead.id}/convert-to-job`, {});
      if (ok && data?.job) {
        await load();
      } else {
        alert("Failed to create job: " + (error || "Unknown error"));
      }
    } finally {
      setCreatingJob(false);
    }
  }

  // From the tender stage: open the RFQ Engine pre-filled from this lead's
  // knowledge. The engine works against a job, so if the lead hasn't been
  // converted yet, create the job first (non-lossy convert) then hand off
  // with the new jobId. This means the tender button always works at tender
  // stage — even for leads that reached tender without a job.
  async function startTenderRfq() {
    if (lead.job_id) {
      nav(`/tender-manager/rfq-engine?leadId=${lead.id}&jobId=${lead.job_id}`);
      return;
    }
    if (creatingJob) return;
    if (!lead.site_address?.trim()) {
      alert("Add a site address before starting the tender.");
      return;
    }
    setCreatingJob(true);
    try {
      const { ok, data, error } = await apiPost(`/api/sales/leads/${lead.id}/convert-to-job`, {});
      if (ok && data?.job?.id) {
        nav(`/tender-manager/rfq-engine?leadId=${lead.id}&jobId=${data.job.id}`);
      } else {
        alert("Couldn't start the tender: " + (error || "job not created"));
      }
    } finally {
      setCreatingJob(false);
    }
  }

  async function generatePTSA() {
    setGeneratingPTSA(true);
    setPtsaError("");
    try {
      const r = await authFetch(`/api/sales/leads/${leadId}/ptsa/generate-docx`, { method: "POST" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `Server error ${r.status}`);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `PTSA-${(lead.first_name || "client").replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setPtsaError(e.message);
    } finally {
      setGeneratingPTSA(false);
    }
  }

  async function markPtsaSigned() {
    if (!signedFile) { setPtsaError("Choose the signed PDF first."); return; }
    setMarkingSigned(true);
    setPtsaError("");
    try {
      const b64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = ev => resolve(String(ev.target.result).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(signedFile);
      });
      const { ok, data, error } = await apiPost(`/api/sales/leads/${leadId}/ptsa/mark-signed`, {
        signedPdfBase64: b64,
        filename: signedFile.name,
        signedDate: signedDateInput || undefined,
      });
      if (!ok) throw new Error(error || "Failed to mark PTSA as signed.");
      if (data?.provisioning?.siteAddressWarning) setPtsaSiteAddressWarning(true);
      setSignedFile(null);
      setSignedDateInput("");
      await load();
    } catch (e) {
      setPtsaError(e.message);
    } finally {
      setMarkingSigned(false);
    }
  }

  async function advanceStage() {
    const next = nextStage(lead.stage);
    if (!next) return;
    // Surface the server hard gate (e.g. Discovery needs score ≥ 5 AND a booked build conversation).
    const r = await authFetch(`/api/sales/leads/${leadId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage: next }),
    });
    const j = await r.json();
    if (!j.ok) { alert(j.error || "Couldn't advance the stage yet."); return; }
    setLead(j.lead);
    bpFetchedFor.current = null;
    setBpInsight("");
    await load();
  }

  // Test/dev harness — jump to any stage from the stepper. Test leads move any direction; real leads
  // may only jump BACKWARD (corrective, with a confirm). The server bypasses hard gates for test
  // leads + backward moves; a blocked forward move surfaces its 422 via the alert.
  async function jumpToStage(stageId) {
    if (!stageId || stageId === lead.stage) return;
    const goingBack = STAGE_ORDER.indexOf(stageId) < STAGE_ORDER.indexOf(lead.stage);
    if (!lead.is_test && goingBack && !window.confirm(`Move this lead back to ${STAGES.find(s => s.id === stageId)?.label || stageId}?`)) return;
    const r = await authFetch(`/api/sales/leads/${leadId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage: stageId }),
    });
    const j = await r.json();
    if (!j.ok) { alert(j.error || "Couldn't change the stage."); return; }
    setLead(j.lead);
    bpFetchedFor.current = null;
    setBpInsight("");
    await load();
  }

  async function resetTestLead() {
    if (!window.confirm("Reset this test lead back to a clean Enquiry state?")) return;
    const { ok, data, error } = await apiPost(`/api/sales/leads/${leadId}/test-reset`, {});
    if (!ok) { alert(error || "Couldn't reset the test lead."); return; }
    if (data?.lead) setLead(data.lead);
    await load();
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-muted text-sm">Loading…</div>;
  if (err) return <div className="p-8 text-red-600 text-sm">{err}</div>;
  if (!lead) return null;

  const stageMeta = STAGES.find(s => s.id === lead.stage);
  const next = nextStage(lead.stage);
  const gateChecks = next ? (GATE_REQUIREMENTS[next] || []) : [];
  const gatePass = gateChecks.every(g => g.check(lead));
  const nextLabel = STAGES.find(s => s.id === next)?.label;
  // SAM-W03-001 Option B: PTSA signed but no job created yet (missing site_address)
  const showSiteAddressWarning = !lead.job_id && (ptsaSiteAddressWarning || lead.ptsa_status === "signed");
  const isArchTender = lead.lead_type === "architect_tender";
  const showDiscovery = !isArchTender && ["discovery","winning_offer","fee_proposal","accepted","tender","won"].includes(lead.stage);
  const showWinningOffer = !isArchTender && ["winning_offer","fee_proposal","accepted","tender","won"].includes(lead.stage);
  const showPreTender = ["winning_offer","fee_proposal","accepted","tender","won"].includes(lead.stage);

  // ── Option A refactor ──────────────────────────────────────────────
  // Each block below is the EXISTING JSX, copied verbatim (same handlers,
  // same classes). The new return composes these into a stage-focused
  // layout: sticky header → "Do this now" focus panel → "Lead file" drawer.

  const breadcrumbBlock = (
    <div className="flex items-center gap-2 text-sm min-w-0">
      <Link to="/sales" className="text-primary hover:underline flex-shrink-0">Sales Pipeline</Link>
      <span className="text-muted">/</span>
      <span className="text-ink font-medium truncate">{displayLeadName(lead)}</span>
      <span className={`ml-1 flex-shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${stageMeta?.color}`}>{stageMeta?.label}</span>
    </div>
  );

  const headerActionsBlock = (
    <div className="flex gap-2 flex-shrink-0">
      {lead.is_test && isAdmin && (
        <button onClick={resetTestLead} className="text-xs text-amber-700 hover:text-amber-900 px-3 py-1.5 rounded border border-amber-300 hover:border-amber-500">↺ Reset test lead</button>
      )}
      <button onClick={() => patch({ stage: "nurture" }).then(() => load())} className="text-xs text-muted hover:text-ink px-3 py-1.5 rounded border border-hairline">→ Nurture</button>
      <button onClick={() => patch({ stage: "lost" }).then(() => nav("/sales"))} className="text-xs text-red-500 hover:text-red-700 px-3 py-1.5 rounded border border-red-200 hover:border-red-400">Mark Lost</button>
    </div>
  );

  const contactBlock = (
    <div className="rounded-card border border-hairline bg-surface p-4">
      <h3 className="section-label mb-3">Contact</h3>
      <InlineField label="First name" value={lead.first_name} onSave={v => patch({ first_name: v || "Unnamed" })} />
      <InlineField label="Last name" value={lead.last_name} onSave={v => patch({ last_name: v })} />
      <InlineField label="Email" value={lead.email} type="email" onSave={v => patch({ email: v })} />
      <InlineField label="Phone" value={lead.phone} type="tel" onSave={v => patch({ phone: v })} />
      <InlineField
        label="Owner"
        value={lead.assigned_to || ""}
        options={ownerOptions.length ? ownerOptions : undefined}
        onSave={v => patch({ assigned_to: v || null })}
        placeholder="Unassigned"
      />
    </div>
  );

  const projectBlock = (
            <div className="rounded-card border border-hairline bg-surface p-4">
              <h3 className="section-label mb-3">Project</h3>
              <InlineField label="Project type" value={lead.project_type} options={PROJECT_TYPES} onSave={v => patch({ project_type: v })} />
              <InlineField label="Suburb" value={lead.suburb} onSave={v => patch({ suburb: v })} />
              <InlineField label="Site address" value={lead.site_address} onSave={v => patch({ site_address: v })} placeholder="Once known" />
              <InlineField label="Est. value ($)" value={lead.estimated_value ? String(lead.estimated_value) : ""} type="number" onSave={v => patch({ estimated_value: v ? parseFloat(v) : null })} />
              <InlineField label="Floor area (m²)" value={lead.floor_area_estimate ? String(lead.floor_area_estimate) : ""} type="number" onSave={v => patch({ floor_area_estimate: v ? parseFloat(v) : null })} />
              <InlineField label="Design stage" value={lead.design_stage} options={DESIGN_STAGES} onSave={v => patch({ design_stage: v })} />
              <InlineField label="Desired start" value={lead.desired_start_date || ""} type="date" onSave={v => patch({ desired_start_date: v })} />
            </div>
  );

  const marginBlock = (
            <MarginPanel lead={lead} onSave={v => patch({ target_gp_pct: v })} />
  );

  // CRM Control Spine (migration 127) — fit classification, two axes, manual only in this build.
  const fitBlock = (
            <div className="rounded-card border border-hairline bg-surface p-4">
              <h3 className="section-label mb-3">Fit</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Fit quality</label>
                  <select
                    className="focus-ring w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink"
                    value={lead.fit_quality || ""}
                    onChange={e => patch({ fit_quality: e.target.value || null })}
                  >
                    <option value="">Not set</option>
                    {Object.entries(LEAD_FIT_QUALITY_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Readiness</label>
                  <select
                    className="focus-ring w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink"
                    value={lead.readiness || ""}
                    onChange={e => patch({ readiness: e.target.value || null })}
                  >
                    <option value="">Not set</option>
                    {Object.entries(LEAD_READINESS_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                  </select>
                </div>
              </div>
              {lead.fit_set_at && (
                <p className="mt-2 text-xs text-muted">Last set {new Date(lead.fit_set_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</p>
              )}
            </div>
  );

  // CRM Control Spine — action queue card (action_type + action_due_at, human-set).
  // "Mark done" clears both fields; "Snooze" sets snoozed_until 7 days from now.
  const actionQueueBlock = (
    <div className="rounded-card border border-hairline bg-surface p-4">
      <h3 className="section-label mb-3">Next Action</h3>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Action type</label>
          <select
            className="focus-ring w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink"
            value={lead.action_type || ""}
            onChange={e => patch({ action_type: e.target.value || null })}
          >
            <option value="">Not set</option>
            {Object.entries(LEAD_ACTION_TYPE_LABELS).map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Due date</label>
          <input
            type="date"
            className="focus-ring w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink"
            value={lead.action_due_at ? lead.action_due_at.slice(0, 10) : ""}
            onChange={e => patch({ action_due_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
          />
        </div>
        {lead.snoozed_until && new Date(lead.snoozed_until) > new Date() && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            Snoozed until {new Date(lead.snoozed_until).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        )}
        {lead.action_type && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => patch({ action_type: null, action_due_at: null, snoozed_until: null })}
              className="flex-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            >
              Mark done
            </button>
            <button
              type="button"
              onClick={() => { const d = new Date(); d.setDate(d.getDate() + 7); patch({ snoozed_until: d.toISOString() }); }}
              className="rounded-lg border border-hairline bg-page px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface"
            >
              Snooze 7d
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // Unanswered qualifying gates — surfaced so it's clear what's blocking advance (S1).
  const qualifyMissing = [
    lead.qualify_budget == null && "Budget",
    lead.qualify_timeframe == null && "Timeframe",
    lead.qualify_site == null && "Site",
    lead.qualify_decision_maker == null && "Decision maker",
  ].filter(Boolean);

  const qualifyingBlock = !isArchTender && (
            <div className="rounded-card border border-hairline bg-surface p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="section-label">Qualifying Scorecard</h3>
                <span className={`text-sm font-bold ${(lead.qualify_score || 0) >= 7 ? "text-green-600" : (lead.qualify_score || 0) >= 5 ? "text-amber-600" : "text-red-500"}`}>
                  {lead.qualify_score ?? 0}/8
                </span>
              </div>
              <div className="space-y-3">
                <ScoreGate label="Budget" value={lead.qualify_budget} options={["No", "Unsure", "Yes"]} onChange={v => patch({ qualify_budget: v })} />
                <ScoreGate label="Timeframe" value={lead.qualify_timeframe} options={["18+ months", "6–18 months", "< 6 months"]} onChange={v => patch({ qualify_timeframe: v })} />
                <ScoreGate label="Site" value={lead.qualify_site} options={["No site", "Under contract", "Owns site"]} onChange={v => patch({ qualify_site: v })} />
                <ScoreGate label="Decision maker" value={lead.qualify_decision_maker} options={["No", "One of two", "Yes"]} onChange={v => patch({ qualify_decision_maker: v })} />
              </div>
              {qualifyMissing.length > 0 && (
                <p className="mt-3 text-xs text-muted bg-page rounded-lg px-3 py-2">
                  <span className="font-medium text-ink">Not yet scored:</span> {qualifyMissing.join(", ")}
                </p>
              )}
              {(lead.qualify_score || 0) < 5 && (
                <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  Qualifying score {lead.qualify_score ?? 0}/8 — a score of <span className="font-semibold">5+</span> is required to advance to Discovery.
                  {lead.qualify_budget != null && " APB recommends nurturing leads that stay under 5 rather than investing discovery time."}
                </p>
              )}
            </div>
  );

  const blueprintBlock = (
            <div className="rounded-card border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-primary">Blueprint Insight</h3>
                <button onClick={() => { bpFetchedFor.current = null; fetchBlueprintInsight(lead); }} disabled={bpLoading} className="text-xs text-primary hover:opacity-70 disabled:opacity-40">↺ Refresh</button>
              </div>
              {bpLoading ? (
                <div className="space-y-2">
                  {[55, 85, 65].map((w, i) => <div key={i} className="h-3 rounded bg-primary/10 animate-pulse" style={{ width: `${w}%` }} />)}
                </div>
              ) : bpInsight ? (
                <div className="text-sm text-ink leading-relaxed prose prose-sm max-w-none">
                  <ReactMarkdown>{bpInsight}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-xs text-muted italic">Loading APB advice…</p>
              )}
            </div>
  );

  const conversationsBlock = (
            <div className="rounded-card border border-primary/20 bg-primary/[0.03] p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-primary">Conversations</h3>
                  {conversations.length > 0 && (
                    <p className="text-xs text-muted mt-0.5">{conversations.length} transcript{conversations.length !== 1 ? "s" : ""} stored</p>
                  )}
                </div>
                <button
                  onClick={() => setConvOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                >
                  <span className="text-sm leading-none">+</span> Add Transcript
                </button>
              </div>
              {conversations.length === 0 ? (
                <p className="text-xs text-muted italic">Upload a Plaud transcript or paste meeting notes to auto-fill lead details with Blueprint.</p>
              ) : (
                <div className="space-y-2">
                  {conversations.slice(0, 3).map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setViewConv(c); setViewConvOpen(true); }}
                      className="w-full text-left rounded-lg border border-hairline bg-surface px-3 py-2 hover:bg-page text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-ink truncate">{c.title || "Meeting"}</span>
                        <span className="text-xs text-muted flex-shrink-0">{relativeTime(c.created_at)}</span>
                      </div>
                      {c.bp_suggestions?.summary && (
                        <p className="text-xs text-muted mt-0.5 line-clamp-1">{c.bp_suggestions.summary}</p>
                      )}
                      {c.applied_at && <span className="text-xs text-green-600">✓ Applied</span>}
                    </button>
                  ))}
                  {conversations.length > 3 && (
                    <button onClick={() => setConvOpen(true)} className="text-xs text-primary hover:opacity-70">
                      +{conversations.length - 3} more…
                    </button>
                  )}
                </div>
              )}
            </div>
  );

  const logActivityBlock = (
            <div className="rounded-card border border-hairline bg-surface p-4">
              <h3 className="section-label mb-3">Log Activity</h3>
              <form onSubmit={logActivity} className="space-y-2">
                <select className="w-full rounded-lg border border-hairline px-3 py-2 text-sm bg-page text-ink" value={actType} onChange={e => setActType(e.target.value)}>
                  <option value="note">Note</option>
                  <option value="call">Call</option>
                  <option value="email">Email</option>
                  <option value="meeting">Meeting</option>
                </select>
                <textarea className="w-full rounded-lg border border-hairline px-3 py-2 text-sm bg-page text-ink resize-none" rows={3} placeholder="What happened?" value={actSummary} onChange={e => setActSummary(e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <input className="rounded-lg border border-hairline px-3 py-1.5 text-sm bg-page text-ink" placeholder="Next action…" value={actNextAction} onChange={e => setActNextAction(e.target.value)} />
                  <input type="date" className="rounded-lg border border-hairline px-3 py-1.5 text-sm bg-page text-ink" value={actNextDate} onChange={e => setActNextDate(e.target.value)} />
                </div>
                <button type="submit" disabled={actBusy || !actSummary.trim()} className="w-full rounded-lg bg-primary py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                  {actBusy ? "Saving…" : "Save Activity"}
                </button>
              </form>
            </div>
  );

  const timelineBlock = <LeadUnifiedTimeline timeline={timeline} activities={activities} viewMissing={timelineViewMissing} />;
  const trustRailBlock = <LeadTrustRail leadId={leadId} lead={lead} />;

  const archTenderBlock = isArchTender && (
              <div className="rounded-card border border-primary/30 bg-primary/[0.04] px-4 py-3">
                <p className="text-xs font-bold text-primary uppercase tracking-wide">Architect Tender</p>
                <p className="text-xs text-muted mt-0.5">Fast-tracked to Accepted — qualifying and fee proposal skipped.</p>
              </div>
  );

  const tenderBlock = lead.stage === "tender" && (
              <div className="rounded-card border border-primary bg-primary/[0.06] p-4">
                <h3 className="section-label mb-1 text-primary">Tendering</h3>
                <p className="text-xs text-muted mb-3 leading-relaxed">
                  Open the RFQ Engine for this lead — it pre-fills the project, trades and documents from this lead&apos;s details.
                </p>
                <button
                  type="button"
                  onClick={startTenderRfq}
                  disabled={creatingJob || !lead.site_address?.trim()}
                  className="block w-full text-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-colors disabled:opacity-50"
                >
                  {creatingJob ? "Setting up…" : "Proceed to RFQ Engine & Estimate →"}
                </button>
                {!lead.site_address?.trim() && (
                  <p className="text-[11px] text-orange-600 text-center mt-2 font-medium">Add site address before starting tender.</p>
                )}
                {lead.site_address?.trim() && !lead.job_id && (
                  <p className="text-[11px] text-muted text-center mt-2">A job will be created from this lead first.</p>
                )}
              </div>
  );

  const discoveryBlock = showDiscovery && (
              <div className="rounded-card border border-hairline bg-surface p-4">
                <h3 className="section-label mb-3">Discovery</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-muted mb-1">Notes</label>
                    <textarea
                      className="w-full rounded-lg border border-hairline px-3 py-2 text-sm bg-page text-ink resize-none"
                      rows={4}
                      placeholder="What did you learn in the discovery meeting?"
                      defaultValue={lead.discovery_notes || ""}
                      onBlur={e => { if (e.target.value !== (lead.discovery_notes || "")) patch({ discovery_notes: e.target.value }); }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted mb-1">Key requirements</label>
                    <textarea
                      className="w-full rounded-lg border border-hairline px-3 py-2 text-sm bg-page text-ink resize-none"
                      rows={2}
                      placeholder="e.g. 4 bed, alfresco, butler's pantry…"
                      defaultValue={lead.key_requirements || ""}
                      onBlur={e => { if (e.target.value !== (lead.key_requirements || "")) patch({ key_requirements: e.target.value }); }}
                    />
                  </div>
                </div>
              </div>
  );

  const winningOfferBlock = showWinningOffer && (
              <div className="rounded-card border border-hairline bg-surface p-4">
                <h3 className="section-label mb-3">Winning Offer</h3>

                {/* APB Winning Offer preparation checklist */}
                <details className="mb-4 rounded-lg border border-amber-200 bg-amber-50/40">
                  <summary className="px-3 py-2 text-xs font-semibold text-amber-800 cursor-pointer select-none list-none flex items-center gap-1.5">
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                    </svg>
                    Preparation checklist — before you present
                  </summary>
                  <div className="px-3 pb-3 pt-1 space-y-1.5">
                    {[
                      "Can you repeat their brief back in their own words?",
                      "Selected 2–3 completed projects similar to theirs to reference",
                      "Prepared a personalised inclusions summary",
                      "Pre-construction fee confirmed and justified",
                      "Know who else they are getting quotes from",
                      "Confirmed all decision-makers will be at the presentation",
                      "PTSA drafted with project scope filled in (client-facing, not notes)",
                      "Presentation booked — in person or video call",
                    ].map((item, i) => (
                      <label key={i} className="flex items-start gap-2 text-xs text-amber-900 cursor-pointer">
                        <input type="checkbox" className="mt-0.5 accent-amber-600 flex-shrink-0" />
                        {item}
                      </label>
                    ))}
                  </div>
                </details>

                <p className="text-xs font-semibold text-ink mb-2">About their project</p>

                {!lead.wo_client_vision && lead.discovery_notes?.trim() && (
                  <div className="flex items-center justify-between gap-3 mb-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                    <span className="text-xs text-primary">Auto-fill from discovery notes?</span>
                    <button
                      type="button"
                      onClick={() => patch({ wo_client_vision: lead.discovery_notes.trim() })}
                      className="text-xs font-semibold text-primary hover:underline whitespace-nowrap"
                    >
                      Fill in →
                    </button>
                  </div>
                )}

                <div className="mb-2">
                  <label className="block text-xs text-muted mb-1">Their vision — in their own words</label>
                  <textarea
                    className="w-full rounded-lg border border-hairline px-3 py-2 text-sm bg-page text-ink resize-none"
                    rows={4}
                    placeholder="Describe their project the way they described it to you. This goes into the presentation."
                    defaultValue={lead.wo_client_vision || ""}
                    onBlur={e => { if (e.target.value !== (lead.wo_client_vision || "")) patch({ wo_client_vision: e.target.value || null }); }}
                  />
                </div>

                <InlineField label="Budget confirmed" value={lead.wo_budget_confirmed || ""} onSave={v => patch({ wo_budget_confirmed: v || null })} placeholder="e.g. $1.3M–$1.5M approved finance" />
                <InlineField label="Target timeline" value={lead.wo_timeline_confirmed || ""} onSave={v => patch({ wo_timeline_confirmed: v || null })} placeholder="e.g. Start March 2026, move-in by Christmas" />
                <InlineField label="Decision makers" value={lead.wo_decision_makers || ""} onSave={v => patch({ wo_decision_makers: v || null })} placeholder="e.g. Bill + Sarah — both need to sign off" />
                <InlineField label="Most excited about" value={lead.wo_most_excited_about || ""} onSave={v => patch({ wo_most_excited_about: v || null })} placeholder="e.g. The kitchen and outdoor entertaining area" />
                <InlineField label="Biggest concern" value={lead.wo_biggest_concern || ""} onSave={v => patch({ wo_biggest_concern: v || null })} placeholder="e.g. Budget blowout, had a bad experience with a previous builder" />

                <div className="mt-4 pt-3 border-t border-hairline space-y-2">
                  <InlineField label="Pre-construction fee" value={lead.preconstruction_fee ? String(lead.preconstruction_fee) : ""} type="number" onSave={v => patch({ preconstruction_fee: v ? parseFloat(v) : null })} placeholder="e.g. 15000" />
                  <InlineField label="Budget min ($)" value={lead.construction_budget_min ? String(lead.construction_budget_min) : ""} type="number" onSave={v => patch({ construction_budget_min: v ? parseFloat(v) : null })} />
                  <InlineField label="Budget max ($)" value={lead.construction_budget_max ? String(lead.construction_budget_max) : ""} type="number" onSave={v => patch({ construction_budget_max: v ? parseFloat(v) : null })} />
                  <div>
                    <label className="block text-xs text-muted mb-1">Inclusions summary</label>
                    <textarea
                      className="w-full rounded-lg border border-hairline px-3 py-2 text-sm bg-page text-ink resize-none"
                      rows={3}
                      placeholder="Key inclusions in the offer…"
                      defaultValue={lead.inclusions_summary || ""}
                      onBlur={e => { if (e.target.value !== (lead.inclusions_summary || "")) patch({ inclusions_summary: e.target.value }); }}
                    />
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-red-100 bg-red-50/60 p-3 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-red-700/80">Internal only — never shown to client</p>
                  <InlineField label="Other builders they're comparing" value={lead.wo_other_builders || ""} onSave={v => patch({ wo_other_builders: v || null })} placeholder="e.g. Rendition Homes, one other local custom builder" />
                  <div>
                    <label className="block text-xs text-muted mb-1">Why we win this</label>
                    <textarea
                      className="w-full rounded-lg border border-hairline px-3 py-2 text-sm bg-page text-ink resize-none"
                      rows={2}
                      placeholder="e.g. Sam supervised [similar project] — same brief, same budget range"
                      defaultValue={lead.wo_our_differentiator || ""}
                      onBlur={e => { if (e.target.value !== (lead.wo_our_differentiator || "")) patch({ wo_our_differentiator: e.target.value || null }); }}
                    />
                  </div>

                  <div>
                    <p className="text-xs font-medium text-ink mb-0.5">Reference projects for this presentation</p>
                    <p className="text-[10px] text-muted mb-2">Select 2–3 most relevant to this client&apos;s brief</p>
                    {refProjects.length === 0 ? (
                      <p className="text-xs text-muted">
                        No reference projects yet —{" "}
                        <Link to="/sales/reference-projects" className="underline text-primary">
                          add them here ↗
                        </Link>
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {refProjects.map((rp) => {
                          const selected = (lead.wo_reference_project_ids || []).includes(rp.id);
                          return (
                            <label
                              key={rp.id}
                              className={`flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-all ${
                                selected
                                  ? "border-primary bg-primary/5"
                                  : "border-hairline hover:border-primary/40 bg-surface"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={(e) => {
                                  const current = lead.wo_reference_project_ids || [];
                                  const updated = e.target.checked
                                    ? [...current, rp.id]
                                    : current.filter((id) => id !== rp.id);
                                  patch({ wo_reference_project_ids: updated });
                                }}
                                className="mt-0.5 accent-primary flex-shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-semibold text-ink">{rp.project_label}</span>
                                  {rp.suburb && <span className="text-xs text-muted">{rp.suburb}</span>}
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                                    rp.our_role === "supervised"
                                      ? "bg-blue-100 text-blue-700"
                                      : "bg-green-100 text-green-700"
                                  }`}>
                                    {rp.our_role}
                                  </span>
                                </div>
                                {rp.attribution_note && (
                                  <p className="text-xs text-muted mt-0.5 line-clamp-1">{rp.attribution_note}</p>
                                )}
                              </div>
                              {rp.approx_value && (
                                <span className="text-xs font-medium text-muted flex-shrink-0">
                                  ${(rp.approx_value / 1000000).toFixed(1)}M
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
  );

  // PTSA scan summaries (S1 accordion sections) — display only.
  const ptsaServiceCount = (lead.ptsa_services?.length > 0 ? lead.ptsa_services : PTSA_DEFAULT_SERVICES).length;
  const ptsaScopeSet = !!lead.ptsa_project_scope?.trim();
  const ptsaBlock = showPreTender && (
              <div className="rounded-card border border-amber-200 bg-amber-50/20 p-4">
                {/* Header + status (always visible) */}
                <div className="flex items-center justify-between mb-3">
                  <h3 className="section-label">Pre-Tender Service Agreement</h3>
                  {lead.ptsa_status === "signed" ? (
                    // Signed is terminal + set only via "Mark PTSA as signed" below — show a static badge.
                    <span className={`text-xs font-semibold rounded-full px-2.5 py-0.5 ${PTSA_STATUS_COLORS.signed}`}>
                      {PTSA_STATUS_LABELS.signed}
                    </span>
                  ) : (
                    <select
                      value={lead.ptsa_status || "draft"}
                      onChange={e => {
                        const updates = { ptsa_status: e.target.value };
                        if (e.target.value === "sent" && !lead.ptsa_sent_date) {
                          updates.ptsa_sent_date = new Date().toISOString().slice(0, 10);
                        }
                        patch(updates);
                      }}
                      className={`text-xs font-semibold rounded-full px-2.5 py-0.5 border-0 cursor-pointer focus:outline-none ${PTSA_STATUS_COLORS[lead.ptsa_status || "draft"]}`}
                    >
                      {PTSA_SELECTABLE_STATUSES.map(v => <option key={v} value={v}>{PTSA_STATUS_LABELS[v]}</option>)}
                    </select>
                  )}
                </div>

                {/* PTSA fee (read-only — set in Winning Offer section above), always visible */}
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-xs text-muted">PTSA fee</span>
                  {lead.preconstruction_fee
                    ? <span className="text-sm font-semibold text-ink">${Number(lead.preconstruction_fee).toLocaleString("en-AU")}</span>
                    : <span className="text-xs text-muted italic">Set &ldquo;Pre-construction fee&rdquo; above ↑</span>}
                </div>

                {/* ── Services ───────────────────────────────────────────── */}
                <LeadAccordion title="Services" summary={`${ptsaServiceCount} of ${PTSA_SERVICES.length} included`}>
                  <div className="space-y-2">
                    {PTSA_SERVICES.map(s => {
                      const activeServices = lead.ptsa_services?.length > 0 ? lead.ptsa_services : PTSA_DEFAULT_SERVICES;
                      const checked = activeServices.includes(s.value);
                      return (
                        <label key={s.value} className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={e => {
                              const current = lead.ptsa_services?.length > 0 ? lead.ptsa_services : PTSA_DEFAULT_SERVICES;
                              const updated = e.target.checked
                                ? [...current.filter(v => v !== s.value), s.value]
                                : current.filter(v => v !== s.value);
                              patch({ ptsa_services: updated });
                            }}
                            className="mt-0.5 w-3.5 h-3.5 rounded accent-primary flex-shrink-0"
                          />
                          <span className="text-xs text-ink leading-relaxed">{s.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </LeadAccordion>

                {/* ── Scope (client-facing; opens by default when unset) ──── */}
                <LeadAccordion title="Project scope" summary={ptsaScopeSet ? "Set" : "Not set"} defaultOpen={!ptsaScopeSet}>
                  <p className="text-xs text-muted mb-1">Appears verbatim in the PTSA — <span className="font-medium text-ink">client-facing</span>.</p>
                  {!lead.ptsa_project_scope && (
                    <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mb-1.5">
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                      <span>Scope not set — PTSA will show placeholder text</span>
                      {lead.wo_client_vision && (
                        <button
                          type="button"
                          onClick={() => patch({ ptsa_project_scope: lead.wo_client_vision })}
                          className="ml-auto text-xs font-medium text-amber-800 underline underline-offset-2 hover:text-amber-900 whitespace-nowrap"
                        >
                          Use client vision ↑
                        </button>
                      )}
                    </div>
                  )}
                  <textarea
                    className="w-full rounded-lg border border-hairline px-3 py-2 text-sm bg-page text-ink resize-none"
                    rows={3}
                    placeholder="e.g. 720m² block at Burnside. Single storey contemporary new build — 4 bed, study, open plan living/kitchen. Approx $1.4M budget."
                    defaultValue={lead.ptsa_project_scope || ""}
                    onBlur={e => { if (e.target.value !== (lead.ptsa_project_scope || "")) patch({ ptsa_project_scope: e.target.value || null }); }}
                  />
                </LeadAccordion>

                {/* ── Terms ──────────────────────────────────────────────── */}
                <LeadAccordion title="Terms" summary={`${lead.ptsa_validity_days || 14} days${lead.ptsa_credit_to_contract !== false ? " · credited" : ""}`}>
                  {/* Validity period */}
                  <div className="flex items-center justify-between py-1.5 border-b border-hairline">
                    <span className="text-xs text-muted">Agreement valid for</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="7"
                        max="90"
                        className="w-14 rounded border border-hairline px-2 py-1 text-xs text-right bg-page text-ink focus:outline-none focus:ring-1 focus:ring-primary/40"
                        defaultValue={lead.ptsa_validity_days || 14}
                        onBlur={e => {
                          const v = parseInt(e.target.value, 10);
                          if (!isNaN(v) && v !== (lead.ptsa_validity_days || 14)) patch({ ptsa_validity_days: v });
                        }}
                      />
                      <span className="text-xs text-muted">days</span>
                    </div>
                  </div>

                  {/* Credit to contract toggle */}
                  <div className="flex items-center justify-between py-1.5 border-b border-hairline">
                    <span className="text-xs text-muted">Fee credited back on contract signing</span>
                    <input
                      type="checkbox"
                      checked={lead.ptsa_credit_to_contract !== false}
                      onChange={e => patch({ ptsa_credit_to_contract: e.target.checked })}
                      className="w-4 h-4 rounded accent-primary"
                    />
                  </div>

                  {/* Special terms */}
                  <div className="mt-2 mb-2">
                    <label className="block text-xs text-muted mb-1">Special terms <span className="font-normal">(optional)</span></label>
                    <textarea
                      className="w-full rounded-lg border border-hairline px-3 py-2 text-sm bg-page text-ink resize-none"
                      rows={2}
                      placeholder="Additional conditions, exclusions, or notes for the agreement…"
                      defaultValue={lead.ptsa_special_terms || ""}
                      onBlur={e => { if (e.target.value !== (lead.ptsa_special_terms || "")) patch({ ptsa_special_terms: e.target.value || null }); }}
                    />
                  </div>

                  {/* Signed date */}
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-xs text-muted">Date signed by client</span>
                    <input
                      type="date"
                      className="rounded border border-hairline px-2 py-1 text-xs bg-page text-ink focus:outline-none focus:ring-1 focus:ring-primary/40"
                      value={lead.pretender_signed_date || ""}
                      onChange={e => patch({ pretender_signed_date: e.target.value || null })}
                    />
                  </div>
                </LeadAccordion>

                {/* ── Signing (open by default — the primary PTSA action) ─── */}
                <LeadAccordion title="Signing" summary={lead.ptsa_status === "signed" ? "Signed" : "Generate / mark signed"} defaultOpen>
                  {/* Generate button — behaviour unchanged */}
                  {ptsaError && <p className="text-xs text-red-600 mb-2">{ptsaError}</p>}
                  <button
                    onClick={generatePTSA}
                    disabled={generatingPTSA}
                    className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {generatingPTSA ? "Generating…" : "⬇ Generate PTSA Document"}
                  </button>
                  <p className="text-xs text-muted text-center mt-1.5">Downloads a branded DOCX ready to send to the client</p>

                  {/* Mark PTSA as signed — stores the signed PDF, stamps the lead, and
                      provisions the job + Dropbox folder tree (server-side, one event). */}
                  <div className="mt-4 pt-4 border-t border-amber-100">
                    {lead.ptsa_status === "signed" ? (
                      <div className="rounded-lg border border-green-200 bg-green-50/60 px-3 py-2.5">
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-green-800">
                          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                          PTSA signed{lead.pretender_signed_date ? ` on ${lead.pretender_signed_date}` : ""}
                        </div>
                        {signedDownloadUrl ? (
                          <a
                            href={signedDownloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1.5 inline-block text-xs font-medium text-primary underline underline-offset-2 hover:opacity-80"
                          >
                            View signed PTSA PDF ↗
                          </a>
                        ) : (
                          <p className="mt-1.5 text-xs text-muted">Signed PDF stored.</p>
                        )}
                      </div>
                    ) : (
                      <>
                        <p className="text-xs font-medium text-ink mb-2">Mark PTSA as signed</p>
                        <p className="text-xs text-muted mb-2">Upload the client-signed PDF. This stores the document, marks the lead signed, and creates the job folder.</p>
                        <input
                          type="file"
                          accept="application/pdf,.pdf"
                          onChange={e => { setSignedFile(e.target.files?.[0] || null); setPtsaError(""); }}
                          className="block w-full text-xs text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-page file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink hover:file:bg-hairline/40 mb-2"
                        />
                        <div className="flex items-center justify-between py-1.5 mb-2">
                          <span className="text-xs text-muted">Date signed <span className="font-normal">(optional)</span></span>
                          <input
                            type="date"
                            value={signedDateInput}
                            onChange={e => setSignedDateInput(e.target.value)}
                            className="rounded border border-hairline px-2 py-1 text-xs bg-page text-ink focus:outline-none focus:ring-1 focus:ring-primary/40"
                          />
                        </div>
                        <button
                          onClick={markPtsaSigned}
                          disabled={markingSigned || !signedFile}
                          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                        >
                          {markingSigned ? "Marking signed…" : "✓ Mark PTSA as signed"}
                        </button>
                      </>
                    )}
                  </div>
                </LeadAccordion>
              </div>
  );

  const advanceBlock = next && (
              <div className="rounded-card border border-hairline bg-surface p-4">
                <h3 className="section-label mb-3">
                  Advance to {nextLabel}
                </h3>
                {gateChecks.length > 0 && (
                  <ul className="space-y-2 mb-4">
                    {gateChecks.map((g, i) => {
                      const pass = g.check(lead);
                      return (
                        <li key={i} className={`flex items-center gap-2 text-sm ${pass ? "text-green-700" : "text-danger"}`}>
                          <span className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${pass ? "bg-green-100 text-green-600" : "bg-red-50 text-danger"}`}>
                            {pass ? "✓" : "✗"}
                          </span>
                          <span className={pass ? "" : "font-medium"}>{g.label}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {lead.stage === "fee_proposal" && !lead.fee_proposal_id && (
                  <Link
                    to="/tender-manager/fee-proposal/new"
                    className="block w-full text-center rounded-lg border border-primary text-primary px-4 py-2 text-sm font-medium hover:bg-primary hover:text-white transition-colors mb-3"
                  >
                    Create Fee Proposal →
                  </Link>
                )}
                {next === "tender" && !lead.job_id && (
                  <button
                    onClick={createJobFromLead}
                    disabled={creatingJob || !lead.site_address?.trim()}
                    className="w-full rounded-lg border border-primary text-primary px-4 py-2 text-sm font-medium hover:bg-primary hover:text-white transition-colors mb-3 disabled:opacity-50"
                  >
                    {creatingJob ? "Creating…" : "Create Job from Lead →"}
                  </button>
                )}
                {next === "tender" && !lead.job_id && !lead.site_address?.trim() && (
                  <p className="text-xs text-orange-600 text-center mb-3 font-medium">Add site address before creating a job.</p>
                )}
                {next === "tender" && lead.job_id && (
                  <p className="text-xs text-green-700 text-center mb-3">Job linked — ready to advance</p>
                )}
                <button
                  onClick={advanceStage}
                  disabled={!gatePass || (showSiteAddressWarning && next === "tender")}
                  className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Move to {nextLabel} →
                </button>
                {showSiteAddressWarning && next === "tender" && (
                  <p className="mt-2 text-xs text-orange-600 text-center font-medium">Add site address before advancing to Tender.</p>
                )}
                {!gatePass && !(showSiteAddressWarning && next === "tender") && (
                  <p className="mt-2 text-xs text-muted text-center">Complete the requirements above to advance.</p>
                )}
              </div>
  );

  const notesBlock = <LeadNotesPanel leadId={leadId} />;

  const documentsBlock = <LeadDocumentsPanel leadId={leadId} />;

  const nurtureBlock = !["won","lost"].includes(lead.stage) && (
              <div className="rounded-card border border-hairline bg-surface p-4">
                <h3 className="section-label mb-3">Nurture</h3>
                <InlineField label="Follow-up date" value={lead.nurture_follow_up_date || ""} type="date" onSave={v => patch({ nurture_follow_up_date: v })} />
                <div className="mt-2">
                  <label className="block text-xs text-muted mb-1">Nurture notes</label>
                  <textarea
                    className="w-full rounded-lg border border-hairline px-3 py-2 text-sm bg-page text-ink resize-none"
                    rows={2}
                    placeholder="Why are they not ready yet?"
                    defaultValue={lead.nurture_notes || ""}
                    onBlur={e => { if (e.target.value !== (lead.nurture_notes || "")) patch({ nurture_notes: e.target.value }); }}
                  />
                </div>
              </div>
  );

  // Stage stepper now rendered via <LeadStageStepper /> in the header (Pass 3A).

  // ── Key facts (header) ──────────────────────────────────────────────
  const keyFactsBlock = (
    <div className="flex items-center gap-4 flex-shrink-0">
      <div className="text-right">
        <p className="text-[10px] uppercase tracking-wide text-muted">Est. value</p>
        <p className="text-sm font-semibold text-ink">{lead.estimated_value ? `$${Number(lead.estimated_value).toLocaleString("en-AU")}` : "—"}</p>
      </div>
      {!isArchTender && (
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide text-muted">Qualifying</p>
          <p className={`text-sm font-bold ${(lead.qualify_score || 0) >= 7 ? "text-green-600" : (lead.qualify_score || 0) >= 5 ? "text-amber-600" : "text-red-500"}`}>
            {lead.qualify_score ?? 0}/8
          </p>
        </div>
      )}
    </div>
  );

  // ── "Do this now" focus — pick block(s) by stage ────────────────────
  let focusContent = null;
  let focusShown = true;
  if (lead.stage === "enquiry") {
    // Sales OS Slice 1 — Enquiry is a guided call-script (scorecard + client details + dispositions).
    focusContent = (
      <div className="space-y-4">
        <EnquiryCallScript lead={lead} patch={patch} reload={load} scorecard={qualifyingBlock} />
        <LeadMailbox lead={lead} />
      </div>
    );
  } else if (lead.stage === "qualify") {
    // Qualify — scorecard + the controlled-vocab client details + the Qualify action panel
    // (confirm web score, send the qualify email, build-conversation status, nurture prompt) + mailbox.
    focusContent = (
      <div className="space-y-4">
        {qualifyingBlock}
        <QualificationDropdowns lead={lead} patch={patch} />
        <QualifyActions lead={lead} patch={patch} reload={load} />
        <LeadMailbox lead={lead} />
      </div>
    );
  } else if (lead.stage === "discovery") {
    // Sales OS Discovery — the meeting script + designer/fees + the discovery actions (email,
    // concept agreement, accept → client folder), then the notes/transcript workspace + mailbox.
    focusContent = (
      <div className="space-y-4">
        <DiscoveryMeetingScript />
        <DesignerSelect lead={lead} patch={patch} reload={load} />
        <DiscoveryActions lead={lead} reload={load} />
        {discoveryBlock}
        {conversationsBlock}
        <LeadMailbox lead={lead} />
      </div>
    );
  } else if (lead.stage === "winning_offer") {
    focusContent = winningOfferBlock;
  } else if (lead.stage === "fee_proposal") {
    // advanceBlock moved to the single next-action slot (rail / Action tab).
    focusContent = ptsaBlock;
  } else if (lead.stage === "tender") {
    focusContent = tenderBlock;
  } else if (lead.stage === "accepted") {
    focusContent = (
      <div className="rounded-card border border-emerald-200 bg-emerald-50/40 p-4">
        <p className="text-sm font-medium text-ink">Offer accepted — proceed to tender.</p>
      </div>
    );
  } else {
    // won / nurture / lost — no focus panel
    focusShown = false;
  }

  // ── Pass 3A: one obvious primary action (reuses existing handlers) ──────────
  let primaryAction = null;
  if (lead.stage === "won") {
    primaryAction = lead.job_id
      ? { label: "View job dashboard →", onClick: () => nav(`/finance/jobs/${lead.job_id}`) }
      : { label: creatingJob ? "Creating…" : "Create Job from Lead →", onClick: createJobFromLead, disabled: creatingJob || !lead.site_address?.trim() };
  } else if (lead.stage === "tender") {
    primaryAction = { label: creatingJob ? "Setting up…" : "Proceed to RFQ Engine →", onClick: startTenderRfq, disabled: creatingJob || !lead.site_address?.trim() };
  } else if (next) {
    primaryAction = { label: `Move to ${nextLabel} →`, onClick: advanceStage, disabled: !gatePass || (showSiteAddressWarning && next === "tender") };
  }

  // ── WON special case — success marker + hand-off CTAs (no "Next: Won →") ────
  const wonCard = lead.stage === "won" ? (
    <div className="rounded-card border border-accent/30 bg-accent/[0.04] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xl leading-none">🎉</span>
        <span className="text-base font-bold text-ink">Lead won</span>
        <StatusBadge variant="success" dot>Won</StatusBadge>
      </div>
      <p className="mt-1 text-sm text-muted">{displayLeadName(lead)} is won — hand off to delivery.</p>
      <div className="mt-3 space-y-2">
        {lead.job_id ? (
          <button type="button" onClick={() => nav(`/finance/jobs/${lead.job_id}`)} className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">View job dashboard →</button>
        ) : (
          <button type="button" onClick={createJobFromLead} disabled={creatingJob || !lead.site_address?.trim()} className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">{creatingJob ? "Creating…" : "Create Job from Lead →"}</button>
        )}
        <button type="button" onClick={() => nav("/tender-manager/board")} className="w-full rounded-lg border border-hairline px-4 py-2 text-sm font-semibold text-ink hover:bg-page">Hand off to Tender Manager</button>
      </div>
      {!lead.job_id && !lead.site_address?.trim() && <p className="mt-2 text-center text-[11px] font-medium text-orange-600">Add site address before creating a job.</p>}
    </div>
  ) : null;

  // ── Pass 3A content slots (each existing block rendered once per tree) ──────
  const focusBlockId = { enquiry: "qualifying", qualify: "qualifying", discovery: "discovery", winning_offer: "winning_offer", fee_proposal: "ptsa" }[lead.stage] || null;
  const conversationsInFocus = lead.stage === "discovery"; // conversations live in the Discovery focus, not the Activity group
  const focusEl = focusShown ? (
    <LeadNextActionCard stageLabel={stageMeta?.label}>{archTenderBlock}{focusContent}</LeadNextActionCard>
  ) : null;
  const nextActionEl = lead.stage === "won" ? wonCard : advanceBlock;

  const samBanner = showSiteAddressWarning ? (
    <div className="mt-4 rounded-card border border-orange-400 bg-orange-50 px-4 py-3 flex items-start gap-3">
      <span className="text-orange-500 text-lg leading-none flex-shrink-0">⚠</span>
      <div>
        <p className="text-sm font-semibold text-orange-800">Job not created — site address is missing</p>
        <p className="text-xs text-orange-700 mt-0.5">The PTSA has been signed and stored, but no job could be created because this lead has no site address. Add a site address below, then this lead can proceed to Tender.</p>
      </div>
    </div>
  ) : null;

  // Deep stage-work blocks not currently in focus (so nothing renders twice in a tree).
  const qualifyingDeep   = qualifyingBlock   && focusBlockId !== "qualifying"     ? qualifyingBlock   : null;
  const discoveryDeep    = discoveryBlock    && focusBlockId !== "discovery"      ? discoveryBlock    : null;
  const winningOfferDeep = winningOfferBlock && focusBlockId !== "winning_offer"  ? winningOfferBlock : null;
  const ptsaDeep         = ptsaBlock         && focusBlockId !== "ptsa"           ? ptsaBlock         : null;
  // Pass 4A: prior/relevant stage work shown as COLLAPSED summaries (the current stage
  // is the expanded focus above; future stages stay hidden via the show-flags). Blocks
  // are unchanged — each is rendered verbatim inside its collapsed accordion.
  const priorStageSections = [
    qualifyingDeep   && { id: "qualifying",   title: "Qualifying",           summary: `${lead.qualify_score ?? 0}/8`, block: qualifyingDeep },
    discoveryDeep    && { id: "discovery",    title: "Discovery",            summary: lead.discovery_notes?.trim() ? "Notes captured" : "No notes yet", block: discoveryDeep },
    winningOfferDeep && { id: "winningOffer", title: "Winning Offer",        summary: lead.preconstruction_fee ? `Fee $${Number(lead.preconstruction_fee).toLocaleString("en-AU")}` : "In progress", block: winningOfferDeep },
    ptsaDeep         && { id: "ptsa",         title: "Pre-Tender Agreement", summary: PTSA_STATUS_LABELS[lead.ptsa_status || "draft"], block: ptsaDeep },
  ].filter(Boolean);
  const stageWorkDeep = priorStageSections.length ? (
    <div>
      <p className="section-label mb-2">Earlier stages</p>
      <div className="space-y-2">
        {priorStageSections.map((s) => (
          <LeadStageSection key={s.id} title={s.title} summary={s.summary}>{s.block}</LeadStageSection>
        ))}
      </div>
    </div>
  ) : null;

  const siteIntelBlock = (
    <SiteIntelPanel lead={lead} onEnriched={load} />
  );

  const detailsGroup = (
    <div>
      <p className="section-label mb-2">Lead details</p>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">{contactBlock}{projectBlock}{marginBlock}{fitBlock}{actionQueueBlock}{siteIntelBlock}</div>
    </div>
  );

  const activityGroup = (
    <div className="space-y-4">
      <p className="section-label">Conversations &amp; activity</p>
      <div className="grid grid-cols-1 gap-4">{!conversationsInFocus && conversationsBlock}{logActivityBlock}</div>
      {timelineBlock}
    </div>
  );

  const MOBILE_TABS = [
    { value: "summary", label: "Summary" },
    { value: "action", label: "Action" },
    { value: "activity", label: "Activity" },
    { value: "files", label: "Files" },
    { value: "notes", label: "Notes" },
  ];

  return (
    <div>
      <LeadDetailHeader
        breadcrumb={breadcrumbBlock}
        stepper={<LeadStageStepper stageOrder={STAGE_ORDER} stages={STAGES} current={lead.stage} isArchTender={isArchTender} onJump={isAdmin ? jumpToStage : undefined} isTest={!!lead.is_test} canManage={isAdmin} />}
        keyFacts={keyFactsBlock}
        primaryAction={primaryAction}
        secondaryActions={headerActionsBlock}
      />

      {samBanner}

      {/* DESKTOP command-centre (main workspace + sticky right rail) */}
      <LeadCommandCentreLayout
        className="hidden lg:grid"
        main={<>{focusEl}{stageWorkDeep}{detailsGroup}{activityGroup}</>}
        rightRail={<>
          {nextActionEl}
          <LeadSummaryPanel lead={lead} />
          {trustRailBlock}
          {blueprintBlock}
          {notesBlock}
          {documentsBlock}
          {nurtureBlock}
        </>}
      />

      {/* TABLET + MOBILE (tabs + sticky action bar) */}
      <div className="lg:hidden">
        <div className="mt-4"><LeadMobileTabs tabs={MOBILE_TABS} value={mobileTab} onChange={setMobileTab} /></div>
        <div className="mt-4 space-y-5">
          {mobileTab === "summary" && <><LeadSummaryPanel lead={lead} />{trustRailBlock}{detailsGroup}{stageWorkDeep}{nurtureBlock}</>}
          {mobileTab === "action" && (
            <div className="space-y-5">
              {focusEl}
              {nextActionEl}
              {blueprintBlock}
              {!focusEl && !nextActionEl && <EmptyState compact title="No current action" hint="See the Summary tab for details." />}
            </div>
          )}
          {mobileTab === "activity" && activityGroup}
          {mobileTab === "files" && documentsBlock}
          {mobileTab === "notes" && notesBlock}
        </div>
        {/* Sticky primary action — sits clearly above the mobile bottom nav (~75px);
            flush at md+ where the nav is hidden. AppShell collapses its FABs on this
            page so nothing overlaps. */}
        {primaryAction && (
          <StickyActionBar position="fixed" className="!bottom-[78px] md:!bottom-0">
            <button type="button" onClick={primaryAction.onClick} disabled={primaryAction.disabled} className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {primaryAction.label}
            </button>
          </StickyActionBar>
        )}
        {/* AppShell <main> already adds pb-24 (mobile) / pb-10 (tablet); this only needs
            to clear the sticky bar above that. */}
        <SafeBottomSpacer height={44} />
      </div>

      <ConversationViewPanel
        leadId={leadId}
        open={viewConvOpen}
        conv={viewConv}
        onClose={() => { setViewConvOpen(false); setViewConv(null); }}
      />
      <ConversationPanel
        leadId={leadId}
        lead={lead}
        open={convOpen}
        onClose={() => setConvOpen(false)}
        onSaved={() => { setConvOpen(false); load(); }}
        conversations={conversations}
        onViewConv={c => { setConvOpen(false); setViewConv(c); setViewConvOpen(true); }}
      />
    </div>
  );
}
