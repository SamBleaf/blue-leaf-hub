import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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

const GATE_REQUIREMENTS = {
  qualify:       [],
  discovery:     [{ field: "qualify_score", label: "Qualifying score ≥ 5", check: l => (l.qualify_score || 0) >= 5 }],
  winning_offer: [
    { field: "discovery_notes",   label: "Discovery notes filled",  check: l => !!l.discovery_notes?.trim() },
    { field: "design_stage",      label: "Design stage set",        check: l => !!l.design_stage },
    { field: "desired_start_date",label: "Desired start date set",  check: l => !!l.desired_start_date },
  ],
  fee_proposal:  [{ field: "preconstruction_fee", label: "Pre-construction fee set", check: l => l.preconstruction_fee != null }],
  accepted:      [{ field: "fee_proposal_id",     label: "Fee proposal linked",      check: l => !!l.fee_proposal_id }],
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

  const bpFetchedFor = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/sales/leads/${leadId}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      setLead(j.lead);
      setActivities(j.activities || []);
      setScreenContext?.({ page: "lead_detail", leadId, stage: j.lead.stage, name: `${j.lead.first_name} ${j.lead.last_name || ""}` });
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

  async function patch(updates) {
    const r = await fetch(`/api/sales/leads/${leadId}`, {
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
      await fetch(`/api/sales/leads/${leadId}/activities`, {
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
      const r = await fetch("/api/blueprint/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: msg }], hubContext: { page: "lead_detail", stage: l.stage } })
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
  const showDiscovery = ["discovery","winning_offer","fee_proposal","accepted","tender","won"].includes(lead.stage);
  const showWinningOffer = ["winning_offer","fee_proposal","accepted","tender","won"].includes(lead.stage);

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
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-3">Contact</h3>
              <InlineField label="First name" value={lead.first_name} onSave={v => patch({ first_name: v || "Unnamed" })} />
              <InlineField label="Last name" value={lead.last_name} onSave={v => patch({ last_name: v })} />
              <InlineField label="Email" value={lead.email} type="email" onSave={v => patch({ email: v })} />
              <InlineField label="Phone" value={lead.phone} type="tel" onSave={v => patch({ phone: v })} />
            </div>

            <div className="rounded-card border border-hairline bg-surface p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-3">Project</h3>
              <InlineField label="Project type" value={lead.project_type} options={PROJECT_TYPES} onSave={v => patch({ project_type: v })} />
              <InlineField label="Suburb" value={lead.suburb} onSave={v => patch({ suburb: v })} />
              <InlineField label="Site address" value={lead.site_address} onSave={v => patch({ site_address: v })} placeholder="Once known" />
              <InlineField label="Est. value ($)" value={lead.estimated_value ? String(lead.estimated_value) : ""} type="number" onSave={v => patch({ estimated_value: v ? parseFloat(v) : null })} />
              <InlineField label="Floor area (m²)" value={lead.floor_area_estimate ? String(lead.floor_area_estimate) : ""} type="number" onSave={v => patch({ floor_area_estimate: v ? parseFloat(v) : null })} />
              <InlineField label="Design stage" value={lead.design_stage} options={DESIGN_STAGES} onSave={v => patch({ design_stage: v })} />
              <InlineField label="Desired start" value={lead.desired_start_date || ""} type="date" onSave={v => patch({ desired_start_date: v })} />
            </div>

            <div className="rounded-card border border-hairline bg-surface p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Qualifying Scorecard</h3>
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
            </div>

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
                <p className="text-sm text-ink leading-relaxed">{bpInsight}</p>
              ) : (
                <p className="text-xs text-muted italic">Loading APB advice…</p>
              )}
            </div>
          </div>

          {/* CENTRE — Activities */}
          <div className="p-5 flex flex-col gap-4">
            <div className="rounded-card border border-hairline bg-surface p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-3">Log Activity</h3>
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
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Activity Timeline</h3>
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
            {showDiscovery && (
              <div className="rounded-card border border-hairline bg-surface p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-3">Discovery</h3>
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
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-3">Winning Offer</h3>
                <InlineField label="Pre-construction fee" value={lead.preconstruction_fee ? String(lead.preconstruction_fee) : ""} type="number" onSave={v => patch({ preconstruction_fee: v ? parseFloat(v) : null })} placeholder="e.g. 15000" />
                <InlineField label="Budget min ($)" value={lead.construction_budget_min ? String(lead.construction_budget_min) : ""} type="number" onSave={v => patch({ construction_budget_min: v ? parseFloat(v) : null })} />
                <InlineField label="Budget max ($)" value={lead.construction_budget_max ? String(lead.construction_budget_max) : ""} type="number" onSave={v => patch({ construction_budget_max: v ? parseFloat(v) : null })} />
                <div className="mt-2">
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
            )}

            {next && (
              <div className="rounded-card border border-hairline bg-surface p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-3">
                  Advance to {nextLabel}
                </h3>
                {gateChecks.length > 0 && (
                  <ul className="space-y-2 mb-4">
                    {gateChecks.map((g, i) => {
                      const pass = g.check(lead);
                      return (
                        <li key={i} className={`flex items-center gap-2 text-sm ${pass ? "text-green-700" : "text-muted"}`}>
                          <span className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-xs ${pass ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-400"}`}>
                            {pass ? "✓" : "○"}
                          </span>
                          {g.label}
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

            {!["won","lost"].includes(lead.stage) && (
              <div className="rounded-card border border-hairline bg-surface p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-3">Nurture</h3>
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
    </div>
  );
}
