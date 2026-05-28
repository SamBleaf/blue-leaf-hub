import { authFetch } from "../lib/authFetch.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { useBlueprintContext } from "../lib/BlueprintContext.jsx";

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

const ACTIVITY_ICONS = {
  call: "📞", email: "✉️", meeting: "🤝", note: "📝",
  stage_change: "→", blueprint_prompt: "🤖"
};

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

const GATE_REQUIREMENTS = {
  qualify:       [],
  discovery:     [{ field: "qualify_score", label: "Qualifying score ≥ 5", check: l => (l.qualify_score || 0) >= 5 }],
  winning_offer: [
    { field: "discovery_notes",   label: "Discovery notes filled",  check: l => !!l.discovery_notes?.trim() },
    { field: "design_stage",      label: "Design stage set",        check: l => !!l.design_stage },
    { field: "desired_start_date",label: "Desired start date set",  check: l => !!l.desired_start_date },
  ],
  fee_proposal:  [{ field: "preconstruction_fee", label: "Pre-construction fee set", check: l => l.preconstruction_fee != null }],
  accepted:      [],
  tender:        [{ field: "job_id",              label: "Job created from this lead",check: l => !!l.job_id }],
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
  if (key === "floor_area_m2") return `${val} m²`;
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
       ["project","project_type"],["project","estimated_value"],["project","floor_area_m2"],
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
    project_type:"Project type", estimated_value:"Est. value", floor_area_m2:"Floor area",
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

export default function LeadDetail() {
  const { leadId } = useParams();
  const nav = useNavigate();
  const { setScreenContext } = useBlueprintContext() || {};

  const [lead, setLead] = useState(null);
  const [activities, setActivities] = useState([]);
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
  const [generatingPTSA, setGeneratingPTSA] = useState(false);
  const [ptsaError, setPtsaError] = useState("");
  const [refProjects, setRefProjects] = useState([]);

  const bpFetchedFor = useRef(null);

  const load = useCallback(async () => {
    try {
      const [lr, cr] = await Promise.all([
        authFetch(`/api/sales/leads/${leadId}`).then(r => r.json()),
        authFetch(`/api/sales/leads/${leadId}/conversations`).then(r => r.json()).catch(() => ({ ok: true, conversations: [] }))
      ]);
      if (!lr.ok) throw new Error(lr.error);
      setLead(lr.lead);
      setActivities(lr.activities || []);
      setConversations(cr.conversations || []);
      setScreenContext?.({ page: "lead_detail", leadId, stage: lr.lead.stage, name: `${lr.lead.first_name} ${lr.lead.last_name || ""}` });
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
    const msg = `I have a sales lead named ${l.first_name} ${l.last_name || ""} in the ${stageName} stage of my builder sales pipeline. Qualifying score: ${l.qualify_score ?? "not assessed"}/8. Project type: ${l.project_type || "unknown"}. Suburb: ${l.suburb || "unknown"}.${l.discovery_notes ? " Discovery: " + l.discovery_notes.slice(0, 200) : ""} Based on the APB sales framework, what should I do next with this lead? Give specific, actionable advice in 3-4 sentences.`;
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
    setCreatingJob(true);
    try {
      const r = await authFetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: lead.site_address || `${lead.first_name} ${lead.last_name} — ${lead.suburb || ""}`.trim(),
          client_name: `${lead.first_name || ""} ${lead.last_name || ""}`.trim(),
          project_type: lead.project_type || null,
        }),
      }).then(r => r.json());
      if (r.ok) {
        await patch({ job_id: r.job.id });
        await load();
      } else {
        alert("Failed to create job: " + r.error);
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

  async function advanceStage() {
    const next = nextStage(lead.stage);
    if (!next) return;
    const updated = await patch({ stage: next });
    if (updated) {
      bpFetchedFor.current = null;
      setBpInsight("");
    }
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
  const isArchTender = lead.lead_type === "architect_tender";
  const showDiscovery = !isArchTender && ["discovery","winning_offer","fee_proposal","accepted","tender","won"].includes(lead.stage);
  const showWinningOffer = !isArchTender && ["winning_offer","fee_proposal","accepted","tender","won"].includes(lead.stage);
  const showPreTender = ["winning_offer","accepted","tender","won"].includes(lead.stage);

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center justify-between pb-4 mb-2 border-b border-hairline">
        <div className="flex items-center gap-2 text-sm min-w-0">
          <Link to="/sales" className="text-primary hover:underline flex-shrink-0">Sales Pipeline</Link>
          <span className="text-muted">/</span>
          <span className="text-ink font-medium truncate">{lead.first_name} {lead.last_name || ""}</span>
          <span className={`ml-1 flex-shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${stageMeta?.color}`}>{stageMeta?.label}</span>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => patch({ stage: "nurture" }).then(() => load())} className="text-xs text-muted hover:text-ink px-3 py-1.5 rounded border border-hairline">→ Nurture</button>
          <button onClick={() => patch({ stage: "lost" }).then(() => nav("/sales"))} className="text-xs text-red-500 hover:text-red-700 px-3 py-1.5 rounded border border-red-200 hover:border-red-400">Mark Lost</button>
        </div>
      </div>

      {/* 3-column body */}
      <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-hairline">

          {/* LEFT */}
          <div className="p-5 space-y-5">
            <div className="rounded-card border border-hairline bg-surface p-4">
              <h3 className="section-label mb-3">Contact</h3>
              <InlineField label="First name" value={lead.first_name} onSave={v => patch({ first_name: v || "Unnamed" })} />
              <InlineField label="Last name" value={lead.last_name} onSave={v => patch({ last_name: v })} />
              <InlineField label="Email" value={lead.email} type="email" onSave={v => patch({ email: v })} />
              <InlineField label="Phone" value={lead.phone} type="tel" onSave={v => patch({ phone: v })} />
            </div>

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

            <MarginPanel lead={lead} onSave={v => patch({ target_gp_pct: v })} />

            {!isArchTender && <div className="rounded-card border border-hairline bg-surface p-4">
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
              {(lead.qualify_score || 0) < 5 && lead.qualify_budget != null && (
                <p className="mt-3 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  Score under 5 — APB recommends nurturing this lead rather than investing discovery time.
                </p>
              )}
            </div>}

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
          </div>

          {/* CENTRE — Conversations + Activities */}
          <div className="p-5 flex flex-col gap-4">

            {/* Conversations */}
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
                      onClick={() => setConvOpen(true)}
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

            <div className="space-y-3">
              <h3 className="section-label">Activity Timeline</h3>
              {activities.length === 0 ? (
                <p className="text-sm text-muted italic">No activities yet.</p>
              ) : activities.map(act => (
                <div key={act.id} className="flex gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-page border border-hairline flex items-center justify-center text-sm select-none">
                    {ACTIVITY_ICONS[act.activity_type] || "📝"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-ink capitalize">{(act.activity_type || "").replace("_", " ")}</span>
                      <span className="text-xs text-muted flex-shrink-0">{relativeTime(act.created_at)}</span>
                    </div>
                    <p className="text-sm text-ink mt-0.5">{act.summary}</p>
                    {act.next_action && (
                      <p className="text-xs text-primary mt-1">
                        ↪ {act.next_action}
                        {act.next_action_date && ` · ${new Date(act.next_action_date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT — Stage checklist + advance */}
          <div className="p-5 space-y-5">
            {isArchTender && (
              <div className="rounded-card border border-primary/30 bg-primary/[0.04] px-4 py-3">
                <p className="text-xs font-bold text-primary uppercase tracking-wide">Architect Tender</p>
                <p className="text-xs text-muted mt-0.5">Fast-tracked to Accepted — qualifying and fee proposal skipped.</p>
              </div>
            )}
            {showDiscovery && (
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
            )}

            {showWinningOffer && (
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
            )}

            {showPreTender && (
              <div className="rounded-card border border-amber-200 bg-amber-50/20 p-4">
                {/* Header + status */}
                <div className="flex items-center justify-between mb-3">
                  <h3 className="section-label">Pre-Tender Service Agreement</h3>
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
                    {Object.entries(PTSA_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>

                {/* PTSA fee (read-only — set in Winning Offer section above) */}
                <div className="flex items-center justify-between py-1.5 border-b border-amber-100 mb-3">
                  <span className="text-xs text-muted">PTSA fee</span>
                  {lead.preconstruction_fee
                    ? <span className="text-sm font-semibold text-ink">${Number(lead.preconstruction_fee).toLocaleString("en-AU")}</span>
                    : <span className="text-xs text-muted italic">Set &ldquo;Pre-construction fee&rdquo; above ↑</span>}
                </div>

                {/* Services checklist */}
                <div className="mb-3">
                  <p className="text-xs font-medium text-ink mb-2">Pre-tender services included:</p>
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
                </div>

                {/* Project scope — client-facing, appears verbatim in PTSA document */}
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-muted">Project scope <span className="font-medium text-ink">(appears in PTSA — client-facing)</span></label>
                  </div>
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
                </div>

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
                <div className="flex items-center justify-between py-1.5 border-b border-hairline mb-3">
                  <span className="text-xs text-muted">Date signed by client</span>
                  <input
                    type="date"
                    className="rounded border border-hairline px-2 py-1 text-xs bg-page text-ink focus:outline-none focus:ring-1 focus:ring-primary/40"
                    value={lead.pretender_signed_date || ""}
                    onChange={e => patch({ pretender_signed_date: e.target.value || null })}
                  />
                </div>

                {/* Generate button */}
                {ptsaError && <p className="text-xs text-red-600 mb-2">{ptsaError}</p>}
                <button
                  onClick={generatePTSA}
                  disabled={generatingPTSA}
                  className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {generatingPTSA ? "Generating…" : "⬇ Generate PTSA Document"}
                </button>
                <p className="text-xs text-muted text-center mt-1.5">Downloads a branded DOCX ready to send to the client</p>
              </div>
            )}

            {next && (
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
                    disabled={creatingJob}
                    className="w-full rounded-lg border border-primary text-primary px-4 py-2 text-sm font-medium hover:bg-primary hover:text-white transition-colors mb-3 disabled:opacity-50"
                  >
                    {creatingJob ? "Creating…" : "Create Job from Lead →"}
                  </button>
                )}
                {next === "tender" && lead.job_id && (
                  <p className="text-xs text-green-700 text-center mb-3">Job linked — ready to advance</p>
                )}
                <button
                  onClick={advanceStage}
                  disabled={!gatePass}
                  className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Move to {nextLabel} →
                </button>
                {!gatePass && (
                  <p className="mt-2 text-xs text-muted text-center">Complete the requirements above to advance.</p>
                )}
              </div>
            )}

            <LeadNotesPanel leadId={leadId} />

            <LeadDocumentsPanel leadId={leadId} />

            {!["won","lost"].includes(lead.stage) && (
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
            )}
          </div>
        </div>

      <ConversationPanel
        leadId={leadId}
        lead={lead}
        open={convOpen}
        onClose={() => setConvOpen(false)}
        onSaved={() => { setConvOpen(false); load(); }}
        conversations={conversations}
        onViewConv={() => {}}
      />
    </div>
  );
}
