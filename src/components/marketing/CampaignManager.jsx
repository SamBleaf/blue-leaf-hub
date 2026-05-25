import { useState, useEffect, useCallback, useMemo } from "react";
import { authFetch } from "../../lib/authFetch.js";
import { toYmd } from "../../lib/dateYmd.js";

const STATUS_COLOURS = {
  active: "bg-emerald-100 text-emerald-700",
  paused: "bg-amber-100 text-amber-700",
  complete: "bg-blue-100 text-blue-700",
  archived: "bg-slate-100 text-slate-500",
};

const GOALS = [
  { value: "brand_awareness", label: "Brand Awareness" },
  { value: "generate_enquiries", label: "Generate Enquiries" },
  { value: "educate", label: "Educate" },
  { value: "build_authority", label: "Build Authority" },
  { value: "seo", label: "SEO" },
];

const TONES = [
  { value: "professional", label: "Professional" },
  { value: "educational", label: "Educational" },
  { value: "premium", label: "Premium" },
  { value: "technical", label: "Technical" },
  { value: "friendly", label: "Friendly" },
];

const AUDIENCES = [
  { value: "homeowners", label: "Homeowners" },
  { value: "architects", label: "Architects" },
  { value: "builders", label: "Builders" },
  { value: "developers", label: "Developers" },
];

const CHANNEL_OPTIONS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "website", label: "Website" },
  { value: "email", label: "Email" },
  { value: "client_guide", label: "Client Guide" },
  { value: "landing_page", label: "Landing Page" },
];

const CONTENT_MODES = [
  { value: "educational", label: "Educational" },
  { value: "opinion", label: "Opinion" },
  { value: "behind_scenes", label: "Behind the scenes" },
  { value: "client_focused", label: "Client focused" },
  { value: "story", label: "Story" },
  { value: "authority", label: "Authority" },
  { value: "vision", label: "Vision" },
];

const CONTENT_SOURCES = [
  { value: "site_photos", label: "Site Photos" },
  { value: "drone", label: "Drone Footage" },
  { value: "voice_notes", label: "Voice Notes" },
  { value: "buildxact", label: "Buildxact Data" },
  { value: "site_diary", label: "Site Diary" },
  { value: "meeting_notes", label: "Meeting Notes" },
  { value: "specs", label: "Specs" },
];

const MIX_KEYS = [
  { key: "educational", label: "Educational" },
  { key: "showcase", label: "Showcase" },
  { key: "behind_scenes", label: "Behind the scenes" },
  { key: "opinion", label: "Opinion" },
  { key: "authority", label: "Authority" },
];

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const CHANNEL_ICONS = {
  instagram: "📸",
  facebook: "👥",
  website: "🌐",
  email: "✉️",
  client_guide: "📖",
  landing_page: "🎯",
};

const DEFAULT_MIX = { educational: 35, showcase: 25, behind_scenes: 15, opinion: 15, authority: 10 };
const DEFAULT_RULES = { never_invent_specs: true, prioritise_performance: true, hook_first: true };

function goalLabel(value) {
  return GOALS.find((g) => g.value === value)?.label || value;
}

function mondayOfWeek(d = new Date()) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** Local calendar YYYY-MM-DD (avoids UTC shift from toISOString). */
function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtWeekLabel(start) {
  const end = addDays(start, 6);
  const opts = { day: "numeric", month: "short" };
  return `Week of ${start.toLocaleDateString("en-AU", opts)} – ${end.toLocaleDateString("en-AU", { ...opts, year: "numeric" })}`;
}

function emptyWeeklyPattern() {
  return Object.fromEntries(WEEK_DAYS.map((d) => [d, []]));
}

function configFromCampaign(c) {
  return {
    name: c?.name || "",
    objective: c?.objective || "",
    channels: c?.channels || [],
    start_at: toYmd(c?.start_at),
    end_at: toYmd(c?.end_at),
    status: c?.status || "active",
    goal: c?.goal || "brand_awareness",
    audience: c?.audience || [],
    tone: c?.tone || "professional",
    content_sources: c?.content_sources || [],
    content_mix: { ...DEFAULT_MIX, ...(c?.content_mix || {}) },
    ai_rules: { ...DEFAULT_RULES, ...(c?.ai_rules || {}) },
    approval_mode: c?.approval_mode || "manual_all",
    weeklyPattern: c?.posting_schedule?.weeklyPattern || emptyWeeklyPattern(),
  };
}

export default function CampaignManager({ onGoCreate }) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [view, setView] = useState("list");
  const [showNewForm, setShowNewForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", objective: "", channels: [], start_at: "", end_at: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authFetch("/api/marketing/campaigns");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to load");
      setCampaigns(j.campaigns || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadCampaign(id) {
    const r = await authFetch(`/api/marketing/campaigns/${id}`);
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Failed to load campaign");
    return j.campaign;
  }

  async function selectCampaign(c) {
    try {
      const full = await loadCampaign(c.id);
      setSelectedCampaign(full);
      setView("detail");
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }

  function toggleCreateChannel(ch) {
    setCreateForm((f) => ({
      ...f,
      channels: f.channels.includes(ch) ? f.channels.filter((c) => c !== ch) : [...f.channels, ch],
    }));
  }

  async function createCampaign(e) {
    e.preventDefault();
    if (!createForm.name.trim()) return;
    setCreating(true);
    setError("");
    try {
      const r = await authFetch("/api/marketing/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...createForm,
          start_at: toYmd(createForm.start_at) || null,
          end_at: toYmd(createForm.end_at) || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to create");
      const created = j.campaign || j;
      setCampaigns((prev) => [{ ...created, content_count: 0 }, ...prev]);
      setShowNewForm(false);
      setCreateForm({ name: "", objective: "", channels: [], start_at: "", end_at: "" });
      setSelectedCampaign(created);
      setView("setup");
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  function refreshCampaignInList(updated) {
    setCampaigns((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
    setSelectedCampaign((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
  }

  if (loading) {
    return <div className="flex items-center justify-center h-48 text-muted text-sm">Loading campaigns…</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink">Campaigns</h2>
          <button
            type="button"
            onClick={() => setShowNewForm((v) => !v)}
            className="bg-primary text-white text-sm px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
          >
            + New Campaign
          </button>
        </div>

        {error && view === "list" && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
        )}

        {showNewForm && (
          <form onSubmit={createCampaign} noValidate className="bg-surface border border-hairline rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-ink">New Campaign</h3>
            <input
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              required
              placeholder="Campaign name *"
              className="w-full border border-hairline rounded-lg px-3 py-2 text-sm"
            />
            <textarea
              value={createForm.objective}
              onChange={(e) => setCreateForm((f) => ({ ...f, objective: e.target.value }))}
              rows={2}
              placeholder="Objective"
              className="w-full border border-hairline rounded-lg px-3 py-2 text-sm resize-none"
            />
            <div className="flex flex-wrap gap-2">
              {CHANNEL_OPTIONS.map((ch) => (
                <button
                  key={ch.value}
                  type="button"
                  onClick={() => toggleCreateChannel(ch.value)}
                  className={`text-xs px-3 py-1.5 rounded-lg border ${createForm.channels.includes(ch.value) ? "border-primary bg-primary/10 text-primary" : "border-hairline text-muted"}`}
                >
                  {ch.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={toYmd(createForm.start_at)} onChange={(e) => setCreateForm((f) => ({ ...f, start_at: e.target.value }))} className="border border-hairline rounded-lg px-3 py-2 text-sm" />
              <input type="date" value={toYmd(createForm.end_at)} onChange={(e) => setCreateForm((f) => ({ ...f, end_at: e.target.value }))} className="border border-hairline rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={creating} className="bg-primary text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50">
                {creating ? "Creating…" : "Create & configure →"}
              </button>
              <button type="button" onClick={() => setShowNewForm(false)} className="text-sm border border-hairline px-4 py-2 rounded-lg text-muted">
                Cancel
              </button>
            </div>
          </form>
        )}

        {campaigns.length === 0 ? (
          <div className="flex items-center justify-center h-36 text-muted text-sm border-2 border-dashed border-hairline rounded-xl">
            No campaigns yet
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {campaigns.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => selectCampaign(c)}
                className={[
                  "w-full text-left bg-surface border rounded-xl p-4 space-y-2 transition-all hover:border-primary/40",
                  selectedCampaign?.id === c.id && view !== "list" ? "border-primary shadow-sm ring-2 ring-primary/20" : "border-hairline",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ink">{c.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLOURS[c.status] || ""}`}>{c.status}</span>
                </div>
                {c.goal && (
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{goalLabel(c.goal)}</span>
                )}
                {c.channels?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {c.channels.map((ch) => (
                      <span key={ch} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{ch.replace("_", " ")}</span>
                    ))}
                  </div>
                )}
                {(c.start_at || c.end_at) && (
                  <p className="text-xs text-muted">
                    {c.start_at ? new Date(c.start_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—"}
                    {" → "}
                    {c.end_at ? new Date(c.end_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "ongoing"}
                  </p>
                )}
                {c.content_count != null && (
                  <p className="text-xs text-muted">{c.content_count} content piece{c.content_count !== 1 ? "s" : ""}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        {!selectedCampaign ? (
          <div className="flex items-center justify-center h-full text-muted text-sm border-2 border-dashed border-hairline rounded-xl p-6 min-h-[200px]">
            Select a campaign to view details
          </div>
        ) : view === "setup" ? (
          <SetupWizard
            campaign={selectedCampaign}
            error={error}
            setError={setError}
            onCancel={() => setView("detail")}
            onSaved={(updated) => {
              refreshCampaignInList(updated);
              setView("detail");
            }}
          />
        ) : (
          <CampaignDetail
            campaign={selectedCampaign}
            error={error}
            setError={setError}
            onEdit={() => setView("setup")}
            onGoCreate={onGoCreate}
            onRefresh={async () => {
              const full = await loadCampaign(selectedCampaign.id);
              refreshCampaignInList(full);
            }}
          />
        )}
      </div>
    </div>
  );
}

function SetupWizard({ campaign, error, setError, onCancel, onSaved }) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState(() => configFromCampaign(campaign));

  useEffect(() => {
    setConfig(configFromCampaign(campaign));
    setStep(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when switching campaigns
  }, [campaign.id]);

  const patternPreview = useMemo(() => {
    const lines = [];
    for (const day of WEEK_DAYS) {
      const slots = config.weeklyPattern[day] || [];
      if (slots.length) {
        lines.push(`${day}: ${slots.map((s) => `${s.channel} (${CONTENT_MODES.find((m) => m.value === s.content_mode)?.label || s.content_mode})`).join(", ")}`);
      }
    }
    return lines;
  }, [config.weeklyPattern]);

  const mixTotal = MIX_KEYS.reduce((n, { key }) => n + (Number(config.content_mix[key]) || 0), 0);

  function toggleArr(field, value) {
    setConfig((c) => ({
      ...c,
      [field]: c[field].includes(value) ? c[field].filter((v) => v !== value) : [...c[field], value],
    }));
  }

  function addSlot(day) {
    setConfig((c) => ({
      ...c,
      weeklyPattern: {
        ...c.weeklyPattern,
        [day]: [...(c.weeklyPattern[day] || []), { channel: c.channels[0] || "instagram", content_mode: "educational" }],
      },
    }));
  }

  function removeSlot(day, idx) {
    setConfig((c) => ({
      ...c,
      weeklyPattern: {
        ...c.weeklyPattern,
        [day]: c.weeklyPattern[day].filter((_, i) => i !== idx),
      },
    }));
  }

  function updateSlot(day, idx, field, value) {
    setConfig((c) => ({
      ...c,
      weeklyPattern: {
        ...c.weeklyPattern,
        [day]: c.weeklyPattern[day].map((s, i) => (i === idx ? { ...s, [field]: value } : s)),
      },
    }));
  }

  async function saveAll() {
    setSaving(true);
    setError("");
    try {
      const pattern = [];
      for (const day of WEEK_DAYS) {
        for (const slot of config.weeklyPattern[day] || []) {
          pattern.push({ day, channel: slot.channel, content_mode: slot.content_mode });
        }
      }

      const body = {
        name: config.name || campaign.name,
        objective: config.objective,
        channels: config.channels,
        start_at: toYmd(config.start_at) || null,
        end_at: toYmd(config.end_at) || null,
        goal: config.goal,
        audience: config.audience,
        tone: config.tone,
        content_sources: config.content_sources,
        content_mix: config.content_mix,
        ai_rules: config.ai_rules,
        approval_mode: config.approval_mode,
        posting_schedule: { weeklyPattern: config.weeklyPattern },
      };

      const r = await authFetch(`/api/marketing/campaigns/${campaign.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Save failed");

      if (pattern.length > 0) {
        const r2 = await authFetch(`/api/marketing/campaigns/${campaign.id}/slots`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pattern }),
        });
        const j2 = await r2.json();
        if (!r2.ok) throw new Error(j2.error || "Could not generate schedule slots");
      }

      onSaved(j.campaign);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const steps = ["Goal", "Audience", "Schedule", "Sources", "Rules"];

  return (
    <div className="bg-surface border border-hairline rounded-xl p-4 space-y-4 sticky top-4 max-h-[calc(100vh-8rem)] overflow-y-auto">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Campaign setup</h3>
        <button type="button" onClick={onCancel} className="text-xs text-muted hover:text-ink">Cancel</button>
      </div>

      <div className="flex gap-1">
        {steps.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(i + 1)}
            className={`flex-1 text-center text-[10px] py-1 rounded ${step === i + 1 ? "bg-primary text-white" : "bg-slate-100 text-muted"}`}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {step === 1 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted">Goal</p>
          <div className="space-y-2">
            {GOALS.map((g) => (
              <label key={g.value} className={`flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer ${config.goal === g.value ? "border-primary bg-primary/5" : "border-hairline"}`}>
                <input type="radio" name="goal" checked={config.goal === g.value} onChange={() => setConfig((c) => ({ ...c, goal: g.value }))} />
                <span className="text-sm text-ink">{g.label}</span>
              </label>
            ))}
          </div>
          <p className="text-xs font-medium text-muted mt-2">Tone</p>
          <div className="flex flex-wrap gap-1.5">
            {TONES.map((t) => (
              <button key={t.value} type="button" onClick={() => setConfig((c) => ({ ...c, tone: t.value }))} className={`text-xs px-3 py-1.5 rounded-lg border ${config.tone === t.value ? "border-primary bg-primary/10 text-primary" : "border-hairline text-muted"}`}>
                {t.label}
              </button>
            ))}
          </div>
          <textarea value={config.objective} onChange={(e) => setConfig((c) => ({ ...c, objective: e.target.value }))} rows={3} placeholder="Campaign objective" className="w-full border border-hairline rounded-lg px-3 py-2 text-sm resize-none" />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted">Audience</p>
          <div className="flex flex-wrap gap-1.5">
            {AUDIENCES.map((a) => (
              <button key={a.value} type="button" onClick={() => toggleArr("audience", a.value)} className={`text-xs px-3 py-1.5 rounded-lg border ${config.audience.includes(a.value) ? "border-primary bg-primary/10 text-primary" : "border-hairline text-muted"}`}>
                {a.label}
              </button>
            ))}
          </div>
          <p className="text-xs font-medium text-muted mt-2">Channels</p>
          <div className="flex flex-wrap gap-1.5">
            {CHANNEL_OPTIONS.map((ch) => (
              <button key={ch.value} type="button" onClick={() => toggleArr("channels", ch.value)} className={`text-xs px-3 py-1.5 rounded-lg border ${config.channels.includes(ch.value) ? "border-primary bg-primary/10 text-primary" : "border-hairline text-muted"}`}>
                {ch.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted">Start</label>
              <input type="date" value={toYmd(config.start_at)} onChange={(e) => setConfig((c) => ({ ...c, start_at: e.target.value }))} className="w-full border border-hairline rounded-lg px-2 py-1.5 text-sm mt-0.5" />
            </div>
            <div>
              <label className="text-xs text-muted">End</label>
              <input type="date" value={toYmd(config.end_at)} onChange={(e) => setConfig((c) => ({ ...c, end_at: e.target.value }))} className="w-full border border-hairline rounded-lg px-2 py-1.5 text-sm mt-0.5" />
            </div>
          </div>
          <p className="text-xs text-muted">Weekly posting pattern</p>
          <div className="space-y-3">
            {WEEK_DAYS.map((day) => (
              <div key={day} className="border border-hairline rounded-lg p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-ink">{day}</span>
                  <button type="button" onClick={() => addSlot(day)} className="text-[10px] text-primary">+ slot</button>
                </div>
                {(config.weeklyPattern[day] || []).map((slot, idx) => (
                  <div key={idx} className="flex gap-1 mt-1 items-center">
                    <select value={slot.channel} onChange={(e) => updateSlot(day, idx, "channel", e.target.value)} className="text-xs border border-hairline rounded px-1 py-0.5 flex-1">
                      {CHANNEL_OPTIONS.map((ch) => <option key={ch.value} value={ch.value}>{ch.label}</option>)}
                    </select>
                    <select value={slot.content_mode} onChange={(e) => updateSlot(day, idx, "content_mode", e.target.value)} className="text-xs border border-hairline rounded px-1 py-0.5 flex-1">
                      {CONTENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    <button type="button" onClick={() => removeSlot(day, idx)} className="text-xs text-red-500">×</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {patternPreview.length > 0 && (
            <div className="bg-slate-50 rounded-lg p-2 text-xs text-muted space-y-0.5">
              {patternPreview.map((line) => <p key={line}>{line}</p>)}
            </div>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          <p className="text-xs text-muted">We&apos;ll suggest content prompts based on these sources.</p>
          <div className="grid grid-cols-2 gap-2">
            {CONTENT_SOURCES.map((s) => (
              <label key={s.value} className={`flex items-center gap-2 border rounded-lg px-2 py-2 text-xs cursor-pointer ${config.content_sources.includes(s.value) ? "border-primary bg-primary/5" : "border-hairline"}`}>
                <input type="checkbox" checked={config.content_sources.includes(s.value)} onChange={() => toggleArr("content_sources", s.value)} />
                {s.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted">Content mix ({mixTotal}%)</p>
          {MIX_KEYS.map(({ key, label }) => (
            <div key={key}>
              <div className="flex justify-between text-xs mb-0.5">
                <span>{label}</span>
                <span>{config.content_mix[key]}%</span>
              </div>
              <input type="range" min={0} max={100} value={config.content_mix[key] || 0} onChange={(e) => setConfig((c) => ({ ...c, content_mix: { ...c.content_mix, [key]: Number(e.target.value) } }))} className="w-full" />
            </div>
          ))}
          {mixTotal !== 100 && <p className="text-xs text-amber-700">Mix should total 100% (currently {mixTotal}%)</p>}
          <p className="text-xs font-medium text-muted mt-2">Approval mode</p>
          {[
            { value: "manual_all", label: "Manual — review all" },
            { value: "auto_low_risk", label: "Auto — low-risk only" },
            { value: "manual_high_risk", label: "Review high-risk" },
          ].map((opt) => (
            <label key={opt.value} className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-xs cursor-pointer ${config.approval_mode === opt.value ? "border-primary bg-primary/5" : "border-hairline"}`}>
              <input type="radio" name="approval" checked={config.approval_mode === opt.value} onChange={() => setConfig((c) => ({ ...c, approval_mode: opt.value }))} />
              {opt.label}
            </label>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-2 border-t border-hairline">
        {step > 1 && (
          <button type="button" onClick={() => setStep((s) => s - 1)} className="text-sm border border-hairline px-3 py-2 rounded-lg text-muted">
            Back
          </button>
        )}
        {step < 5 ? (
          <button type="button" onClick={() => setStep((s) => s + 1)} className="flex-1 bg-primary text-white text-sm py-2 rounded-lg">
            Next
          </button>
        ) : (
          <button type="button" onClick={saveAll} disabled={saving} className="flex-1 bg-primary text-white text-sm py-2 rounded-lg disabled:opacity-50">
            {saving ? "Saving…" : "Save campaign"}
          </button>
        )}
      </div>
    </div>
  );
}

function CampaignDetail({ campaign, error, setError, onEdit, onGoCreate, onRefresh }) {
  const [weekStart, setWeekStart] = useState(() => mondayOfWeek());
  const [slots, setSlots] = useState([]);
  const [queue, setQueue] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [assignSlot, setAssignSlot] = useState(null);
  const [assignItems, setAssignItems] = useState([]);

  const weekEndStr = useMemo(() => fmtDate(addDays(weekStart, 6)), [weekStart]);

  const loadSlots = useCallback(async () => {
    setLoadingSlots(true);
    try {
      const r = await authFetch(
        `/api/marketing/campaigns/${campaign.id}/slots?from=${fmtDate(weekStart)}&to=${weekEndStr}`,
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to load slots");
      setSlots(j.slots || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingSlots(false);
    }
  }, [campaign.id, weekStart, weekEndStr, setError]);

  const loadQueue = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      const r = await authFetch(`/api/marketing/content?${params}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to load content");
      const channels = campaign.channels || [];
      const items = (j.items || []).filter(
        (item) =>
          ["draft", "approved"].includes(item.status) &&
          (!channels.length || channels.includes(item.channel)) &&
          !item.campaign_id,
      );
      setQueue(items.slice(0, 5));
    } catch {
      setQueue([]);
    }
  }, [campaign.channels]);

  useEffect(() => { loadSlots(); }, [loadSlots]);
  useEffect(() => { loadQueue(); }, [loadQueue]);

  async function openAssign(slot) {
    setAssignSlot(slot);
    setError("");
    try {
      const params = new URLSearchParams();
      if (slot.channel) params.set("channel", slot.channel);
      const r = await authFetch(`/api/marketing/content?${params}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to load content");
      setAssignItems((j.items || []).filter((i) => ["draft", "approved"].includes(i.status)));
    } catch (e) {
      setError(e.message);
      setAssignItems([]);
    }
  }

  async function assignContent(itemId) {
    if (!assignSlot) return;
    try {
      const r = await authFetch(`/api/marketing/campaigns/${campaign.id}/slots/${assignSlot.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_item_id: itemId, status: "assigned" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Assign failed");
      await authFetch(`/api/marketing/campaigns/${campaign.id}/content/${itemId}`, { method: "POST" });
      setAssignSlot(null);
      loadSlots();
      loadQueue();
      onRefresh();
    } catch (e) {
      setError(e.message);
    }
  }

  const slotsByDate = useMemo(() => {
    const map = {};
    for (const s of slots) {
      if (!map[s.slot_date]) map[s.slot_date] = [];
      map[s.slot_date].push(s);
    }
    return map;
  }, [slots]);

  return (
    <div className="bg-surface border border-hairline rounded-xl p-4 space-y-4 sticky top-4 max-h-[calc(100vh-8rem)] overflow-y-auto">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">{campaign.name}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOURS[campaign.status] || ""}`}>{campaign.status}</span>
        </div>
        <button type="button" onClick={onEdit} className="text-xs text-primary hover:underline shrink-0">Edit →</button>
      </div>

      <p className="text-xs text-muted">
        {campaign.goal ? <>Goal: {goalLabel(campaign.goal)} · </> : null}
        Tone: {campaign.tone || "—"} · Approval: {(campaign.approval_mode || "manual_all").replace(/_/g, " ")}
      </p>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <section className="border-t border-hairline pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-ink">Content Calendar</p>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setWeekStart((d) => addDays(d, -7))} className="text-xs text-muted px-1">←</button>
            <span className="text-[10px] text-muted max-w-[120px] truncate">{fmtWeekLabel(weekStart)}</span>
            <button type="button" onClick={() => setWeekStart((d) => addDays(d, 7))} className="text-xs text-muted px-1">→</button>
          </div>
        </div>
        {loadingSlots ? (
          <p className="text-xs text-muted">Loading…</p>
        ) : slots.length === 0 ? (
          <p className="text-xs text-muted">No slots this week — complete setup to generate a posting pattern.</p>
        ) : (
          <div className="space-y-2">
            {Array.from({ length: 7 }, (_, i) => {
              const d = addDays(weekStart, i);
              const key = fmtDate(d);
              const daySlots = slotsByDate[key] || [];
              if (!daySlots.length) return null;
              return (
                <div key={key} className="text-xs border border-hairline rounded-lg p-2 space-y-1">
                  <p className="font-medium text-ink">
                    {d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
                  </p>
                  {daySlots.map((slot) => {
                    const item = slot.marketing_content_items;
                    const chIcon = CHANNEL_ICONS[slot.channel] || "📄";
                    return (
                      <div key={slot.id} className="flex items-center justify-between gap-2 pl-1">
                        <span className="text-muted truncate flex-1">
                          {chIcon} {slot.channel?.replace("_", " ") || "—"}
                          {slot.content_mode ? ` — ${slot.content_mode.replace(/_/g, " ")}` : ""}
                        </span>
                        {item ? (
                          <span className="text-emerald-700 truncate max-w-[100px]" title={item.title || item.topic}>
                            {(item.title || item.topic || "").slice(0, 24)} ✓
                          </span>
                        ) : (
                          <button type="button" onClick={() => openAssign(slot)} className="text-primary shrink-0">
                            Assign →
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="border-t border-hairline pt-3 space-y-2">
        <p className="text-xs font-semibold text-ink">Content Queue</p>
        {queue.length === 0 ? (
          <p className="text-xs text-muted">No unassigned draft content for this campaign&apos;s channels.</p>
        ) : (
          queue.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 text-xs border border-hairline rounded-lg px-2 py-1.5">
              <div className="min-w-0">
                <span className="text-muted">{item.channel} · {item.status}</span>
                <p className="text-ink truncate">{item.title || item.topic}</p>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="border-t border-hairline pt-3">
        <p className="text-xs font-semibold text-ink mb-1">Performance</p>
        <p className="text-xs text-muted">No performance data yet — mark posts as published to start tracking.</p>
      </section>

      <section className="border-t border-hairline pt-3 flex flex-col gap-2">
        <button type="button" onClick={onGoCreate} className="w-full bg-primary text-white text-sm py-2 rounded-lg font-medium hover:bg-primary/90">
          Generate content for this week →
        </button>
      </section>

      {assignSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAssignSlot(null)}>
          <div className="bg-surface rounded-xl border border-hairline p-4 max-w-md w-full max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-ink mb-2">Assign content</p>
            <p className="text-xs text-muted mb-3">
              {assignSlot.slot_date} · {assignSlot.channel} · {assignSlot.content_mode}
            </p>
            {assignItems.length === 0 ? (
              <p className="text-xs text-muted">No matching content items.</p>
            ) : (
              <div className="space-y-2">
                {assignItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => assignContent(item.id)}
                    className="w-full text-left border border-hairline rounded-lg px-3 py-2 hover:border-primary/40 text-xs"
                  >
                    <span className="text-muted">{item.channel}</span>
                    <p className="text-ink font-medium truncate">{item.title || item.topic}</p>
                  </button>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setAssignSlot(null)} className="mt-3 text-xs text-muted w-full py-2 border border-hairline rounded-lg">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
