import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { authFetch } from "../../lib/authFetch.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLOURS = {
  active: "bg-emerald-100 text-emerald-700",
  paused: "bg-amber-100 text-amber-700",
  complete: "bg-blue-100 text-blue-700",
  archived: "bg-slate-100 text-slate-500",
};

const GOALS = [
  { value: "brand_awareness", label: "Build brand awareness" },
  { value: "generate_enquiries", label: "Generate enquiries" },
  { value: "educate", label: "Educate potential clients" },
  { value: "showcase", label: "Showcase current projects" },
  { value: "build_authority", label: "Build authority" },
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
  { value: "developers", label: "Developers" },
  { value: "builders", label: "Builders" },
];

const CHANNEL_OPTIONS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "website", label: "Website" },
  { value: "email", label: "Email" },
];

const CONTENT_TYPE_DAY_OPTIONS = [
  { value: "", label: "Auto (follow mix)" },
  { value: "educational", label: "Educational" },
  { value: "behind_scenes", label: "Behind it" },
  { value: "story", label: "Story" },
  { value: "opinion", label: "Opinion" },
  { value: "authority", label: "Authority" },
  { value: "vision", label: "Vision" },
  { value: "client_focused", label: "Client focused" },
];

const DURATION_OPTIONS = [
  { value: 4, label: "4 weeks" },
  { value: 8, label: "8 weeks" },
  { value: 12, label: "12 weeks" },
  { value: null, label: "Ongoing" },
];

const MIX_KEYS = [
  { key: "educational", label: "Educational" },
  { key: "showcase", label: "Showcase" },
  { key: "behind_scenes", label: "Behind the scenes" },
  { key: "opinion", label: "Opinion" },
  { key: "authority", label: "Authority" },
];

const AI_RULES_LABELS = {
  never_invent_specs:      "Never invent specifications or measurements",
  hook_first:              "Hook first — never start with project description",
  mention_passive_design:  "Mention passive design where relevant",
  mention_weather_tightness: "Mention weather-tightness where relevant",
  premium_tone:            "Maintain premium positioning",
  long_term_value:         "Focus on long-term value and performance",
  avoid_generic_language:  "Avoid generic marketing language",
  focus_on_consequences:   "Translate technical decisions into human consequences",
  prioritise_performance:  "Prioritise performance over appearance",
};

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const CHANNEL_ICONS = {
  instagram: "📸",
  facebook: "👥",
  website: "🌐",
  email: "✉️",
  client_guide: "📖",
  landing_page: "🎯",
};

const DEFAULT_MIX = { educational: 35, showcase: 25, behind_scenes: 20, opinion: 10, authority: 10 };

const DEFAULT_AI_RULES = {
  never_invent_specs: true,
  prioritise_performance: true,
  hook_first: true,
  mention_passive_design: true,
  mention_weather_tightness: true,
  premium_tone: true,
  long_term_value: true,
  avoid_generic_language: true,
  focus_on_consequences: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function todayYmd() {
  return fmtDate(new Date());
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CampaignManager({ onGoCreate }) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [showCreateSheet, setShowCreateSheet] = useState(false);

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
      setError("");
    } catch (e) {
      setError(e.message);
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
      {/* Campaign list */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink">Campaigns</h2>
          <button
            type="button"
            onClick={() => setShowCreateSheet(true)}
            className="bg-primary text-white text-sm px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
          >
            + New Campaign
          </button>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
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
                  selectedCampaign?.id === c.id ? "border-primary shadow-sm ring-2 ring-primary/20" : "border-hairline",
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

      {/* Detail panel */}
      <div>
        {!selectedCampaign ? (
          <div className="flex items-center justify-center h-full text-muted text-sm border-2 border-dashed border-hairline rounded-xl p-6 min-h-[200px]">
            Select a campaign to view details
          </div>
        ) : (
          <CampaignDetail
            campaign={selectedCampaign}
            error={error}
            setError={setError}
            onGoCreate={onGoCreate}
            onRefresh={async () => {
              const full = await loadCampaign(selectedCampaign.id);
              refreshCampaignInList(full);
            }}
          />
        )}
      </div>

      {/* Create sheet overlay */}
      {showCreateSheet && (
        <CampaignCreateSheet
          onClose={() => setShowCreateSheet(false)}
          onCreated={(created) => {
            setCampaigns((prev) => [{ ...created, content_count: 0 }, ...prev]);
            setSelectedCampaign(created);
            setShowCreateSheet(false);
          }}
        />
      )}
    </div>
  );
}

// ─── CampaignCreateSheet ──────────────────────────────────────────────────────

function CampaignCreateSheet({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: "",
    goal: "",
    audience: ["homeowners", "architects"],
    posting_days: [],
    channel_per_day: {},
    content_type_per_day: {},
    duration_weeks: 8,
    start_date: todayYmd(),
    // Advanced
    tone: "professional",
    content_mix: { ...DEFAULT_MIX },
    ai_rules: { ...DEFAULT_AI_RULES },
    approval_mode: "manual_all",
    content_sources: ["site_photos", "voice_notes"],
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const mixTotal = MIX_KEYS.reduce((n, { key }) => n + (Number(form.content_mix[key]) || 0), 0);

  function toggleArr(field, value) {
    setForm((f) => ({
      ...f,
      [field]: f[field].includes(value) ? f[field].filter((v) => v !== value) : [...f[field], value],
    }));
  }

  function toggleDay(day) {
    setForm((f) => {
      const active = f.posting_days.includes(day);
      if (active) {
        const channel_per_day = { ...f.channel_per_day };
        const content_type_per_day = { ...f.content_type_per_day };
        delete channel_per_day[day];
        delete content_type_per_day[day];
        return { ...f, posting_days: f.posting_days.filter((d) => d !== day), channel_per_day, content_type_per_day };
      }
      return {
        ...f,
        posting_days: [...f.posting_days, day],
        channel_per_day: { ...f.channel_per_day, [day]: "instagram" },
        content_type_per_day: { ...f.content_type_per_day, [day]: "" },
      };
    });
  }

  async function handleCreate() {
    if (!form.name.trim()) { setError("Campaign name is required"); return; }
    setSaving(true);
    setError("");
    try {
      // Compute start / end dates
      const startAt = form.start_date || todayYmd();
      let endAt = null;
      if (form.duration_weeks) {
        const endDate = addDays(new Date(startAt + "T12:00:00"), form.duration_weeks * 7);
        endAt = fmtDate(endDate);
      }

      // Channels derived from per-day selections
      const channels = [...new Set(Object.values(form.channel_per_day))];

      // 1. Create campaign
      const r1 = await authFetch("/api/marketing/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), channels, start_at: startAt, end_at: endAt }),
      });
      const j1 = await r1.json();
      if (!r1.ok) throw new Error(j1.error || "Failed to create");
      const campaign = j1.campaign;

      // 2. Update with advanced fields
      await authFetch(`/api/marketing/campaigns/${campaign.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: form.goal || null,
          audience: form.audience,
          tone: form.tone,
          content_sources: form.content_sources,
          content_mix: form.content_mix,
          ai_rules: form.ai_rules,
          approval_mode: form.approval_mode,
          posting_schedule: {
            weeklyPattern: Object.fromEntries(
              form.posting_days.map((day) => [
                day,
                [{ channel: form.channel_per_day[day] || "instagram", content_mode: form.content_type_per_day[day] || "educational" }],
              ]),
            ),
          },
        }),
      });

      // 3. Generate schedule slots if posting days are set
      if (form.posting_days.length > 0) {
        const pattern = form.posting_days.map((day) => ({
          day,
          channel: form.channel_per_day[day] || "instagram",
          content_mode: form.content_type_per_day[day] || "educational",
        }));
        await authFetch(`/api/marketing/campaigns/${campaign.id}/slots`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pattern }),
        });
      }

      onCreated({ ...campaign, goal: form.goal || null, channels });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-surface w-full max-w-2xl rounded-t-2xl border-t border-hairline max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        <div className="px-6 pb-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-ink">New campaign</h3>
            <button type="button" onClick={onClose} className="text-muted hover:text-ink text-sm">Cancel</button>
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          {/* Name */}
          <div>
            <label className="text-xs font-medium text-muted block mb-1">Campaign name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. May — Passive Design Series"
              className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Goal */}
          <div>
            <label className="text-xs font-medium text-muted block mb-2">Goal</label>
            <div className="space-y-1.5">
              {GOALS.map((g) => (
                <label key={g.value} className={`flex items-center gap-2.5 border rounded-lg px-3 py-2 cursor-pointer text-sm transition-colors ${form.goal === g.value ? "border-primary bg-primary/5 text-ink" : "border-hairline text-muted"}`}>
                  <input type="radio" name="goal" checked={form.goal === g.value} onChange={() => setForm((f) => ({ ...f, goal: g.value }))} className="accent-primary" />
                  {g.label}
                </label>
              ))}
            </div>
          </div>

          {/* Audience */}
          <div>
            <label className="text-xs font-medium text-muted block mb-2">Audience</label>
            <div className="flex flex-wrap gap-2">
              {AUDIENCES.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => toggleArr("audience", a.value)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${form.audience.includes(a.value) ? "border-primary bg-primary/10 text-primary" : "border-hairline text-muted"}`}
                >
                  {form.audience.includes(a.value) ? "✓ " : ""}{a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Posting days */}
          <div>
            <label className="text-xs font-medium text-muted block mb-2">Post on these days — tap to select, then set channel + content type</label>
            <div className="flex gap-2 flex-wrap mb-3">
              {WEEK_DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`text-sm px-3 py-1.5 rounded-lg border font-medium transition-colors ${form.posting_days.includes(day) ? "border-primary bg-primary text-white" : "border-hairline text-muted"}`}
                >
                  {day}
                </button>
              ))}
            </div>
            {form.posting_days.length > 0 && (
              <div className="space-y-2">
                {form.posting_days.map((day) => (
                  <div key={day} className="flex items-center gap-2 text-sm">
                    <span className="w-8 text-xs font-medium text-ink">{day}</span>
                    <select
                      value={form.channel_per_day[day] || "instagram"}
                      onChange={(e) => setForm((f) => ({ ...f, channel_per_day: { ...f.channel_per_day, [day]: e.target.value } }))}
                      className="flex-1 border border-hairline rounded-lg px-2 py-1.5 text-xs"
                    >
                      {CHANNEL_OPTIONS.map((ch) => <option key={ch.value} value={ch.value}>{ch.label}</option>)}
                    </select>
                    <select
                      value={form.content_type_per_day[day] || ""}
                      onChange={(e) => setForm((f) => ({ ...f, content_type_per_day: { ...f.content_type_per_day, [day]: e.target.value } }))}
                      className="flex-1 border border-hairline rounded-lg px-2 py-1.5 text-xs"
                    >
                      {CONTENT_TYPE_DAY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Duration */}
          <div>
            <label className="text-xs font-medium text-muted block mb-2">Duration</label>
            <div className="flex gap-2 flex-wrap">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={String(opt.value)}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, duration_weeks: opt.value }))}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${form.duration_weeks === opt.value ? "border-primary bg-primary/10 text-primary" : "border-hairline text-muted"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Start date */}
          <div>
            <label className="text-xs font-medium text-muted block mb-1">Start date</label>
            <input
              type="date"
              value={form.start_date}
              onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
              className="border border-hairline rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Advanced toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-2 text-xs text-muted hover:text-ink w-full"
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`transition-transform ${showAdvanced ? "rotate-90" : ""}`}>
              <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Advanced settings
          </button>

          {showAdvanced && (
            <div className="space-y-5 border-t border-hairline pt-4">
              {/* Tone */}
              <div>
                <label className="text-xs font-medium text-muted block mb-2">Tone</label>
                <div className="flex flex-wrap gap-1.5">
                  {TONES.map((t) => (
                    <button key={t.value} type="button" onClick={() => setForm((f) => ({ ...f, tone: t.value }))} className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${form.tone === t.value ? "border-primary bg-primary/10 text-primary" : "border-hairline text-muted"}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Content mix */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-muted">Content mix</label>
                  <span className={`text-xs font-medium ${mixTotal === 100 ? "text-emerald-600" : "text-amber-600"}`}>{mixTotal}% {mixTotal === 100 ? "✓" : ""}</span>
                </div>
                <div className="space-y-2">
                  {MIX_KEYS.map(({ key, label }) => (
                    <div key={key}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="text-muted">{label}</span>
                        <span className="font-medium">{form.content_mix[key] || 0}%</span>
                      </div>
                      <input
                        type="range" min={0} max={100}
                        value={form.content_mix[key] || 0}
                        onChange={(e) => setForm((f) => ({ ...f, content_mix: { ...f.content_mix, [key]: Number(e.target.value) } }))}
                        className="w-full accent-primary"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* AI rules */}
              <div>
                <label className="text-xs font-medium text-muted block mb-2">AI behaviour rules (Blue Leaf identity)</label>
                <div className="space-y-1.5">
                  {Object.entries(AI_RULES_LABELS).map(([key, label]) => (
                    <label key={key} className="flex items-start gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.ai_rules[key] !== false}
                        onChange={(e) => setForm((f) => ({ ...f, ai_rules: { ...f.ai_rules, [key]: e.target.checked } }))}
                        className="mt-0.5 accent-primary"
                      />
                      <span className={form.ai_rules[key] !== false ? "text-ink" : "text-muted"}>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Content sources */}
              <div>
                <label className="text-xs font-medium text-muted block mb-2">Content sources</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: "site_photos", label: "Site photos (library)" },
                    { value: "voice_notes", label: "Voice notes" },
                  ].map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => toggleArr("content_sources", s.value)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${form.content_sources.includes(s.value) ? "border-primary bg-primary/10 text-primary" : "border-hairline text-muted"}`}
                    >
                      {form.content_sources.includes(s.value) ? "✓ " : ""}{s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Approval */}
              <div>
                <label className="text-xs font-medium text-muted block mb-2">Approval</label>
                <div className="space-y-1.5">
                  {[
                    { value: "manual_all", label: "Require approval before scheduling" },
                    { value: "auto_low_risk", label: "Auto-approve to queue, I’ll review later" },
                  ].map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="radio" name="approval_mode" checked={form.approval_mode === opt.value} onChange={() => setForm((f) => ({ ...f, approval_mode: opt.value }))} className="accent-primary" />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2 border-t border-hairline">
            <button type="button" onClick={onClose} className="text-sm border border-hairline px-4 py-2.5 rounded-lg text-muted hover:text-ink transition-colors">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving || !form.name.trim()}
              className="flex-1 bg-primary text-white text-sm py-2.5 rounded-lg font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {saving ? "Creating…" : "Create campaign →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CampaignDetail ───────────────────────────────────────────────────────────

function CampaignDetail({ campaign, error, setError, onGoCreate, onRefresh }) {
  const [weekStart, setWeekStart] = useState(() => mondayOfWeek());
  const [slots, setSlots] = useState([]);
  const [queue, setQueue] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [assignSlot, setAssignSlot] = useState(null);
  const [assignItems, setAssignItems] = useState([]);
  const [publishSlot, setPublishSlot] = useState(null);
  const [showPreload, setShowPreload] = useState(false);
  const [activeTab, setActiveTab] = useState("calendar");

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
    setLoadingQueue(true);
    try {
      const r = await authFetch(`/api/marketing/campaigns/${campaign.id}/content`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to load content");
      setQueue(j.items || []);
    } catch {
      setQueue([]);
    } finally {
      setLoadingQueue(false);
    }
  }, [campaign.id]);

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
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">{campaign.name}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOURS[campaign.status] || ""}`}>{campaign.status}</span>
        </div>
      </div>

      <p className="text-xs text-muted">
        {campaign.goal ? <>{goalLabel(campaign.goal)} · </> : null}
        {campaign.tone ? <>{campaign.tone} tone</> : null}
      </p>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-hairline pb-0">
        {[{ key: "calendar", label: "Calendar" }, { key: "queue", label: "Queue" }].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`text-xs px-3 py-1.5 rounded-t-lg border-b-2 transition-colors ${activeTab === tab.key ? "border-primary text-primary font-medium" : "border-transparent text-muted hover:text-ink"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Calendar tab */}
      {activeTab === "calendar" && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-ink">Content calendar</p>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setWeekStart((d) => addDays(d, -7))} className="text-xs text-muted px-1">←</button>
              <span className="text-[10px] text-muted max-w-[120px] truncate">{fmtWeekLabel(weekStart)}</span>
              <button type="button" onClick={() => setWeekStart((d) => addDays(d, 7))} className="text-xs text-muted px-1">→</button>
            </div>
          </div>
          {loadingSlots ? (
            <p className="text-xs text-muted">Loading…</p>
          ) : slots.length === 0 ? (
            <p className="text-xs text-muted">No slots this week — set posting days when creating or editing the campaign.</p>
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
                      const isPublished = slot.status === "published";
                      const isAssigned = slot.status === "assigned" && item;
                      return (
                        <div
                          key={slot.id}
                          className={`flex items-center justify-between gap-2 pl-1 rounded ${isPublished ? "bg-slate-50" : ""}`}
                        >
                          <span className="text-muted truncate flex-1">
                            {chIcon} {slot.channel?.replace("_", " ") || "—"}
                            {slot.content_mode ? ` — ${slot.content_mode.replace(/_/g, " ")}` : ""}
                          </span>
                          {isPublished ? (
                            <span className="text-slate-400 shrink-0 flex items-center gap-1">
                              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                              Published
                            </span>
                          ) : isAssigned ? (
                            <button
                              type="button"
                              onClick={() => setPublishSlot(slot)}
                              className="text-emerald-700 truncate max-w-[100px] hover:underline"
                              title="Mark as published"
                            >
                              {(item.title || item.topic || "").slice(0, 20)} ✓
                            </button>
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
          <button type="button" onClick={onGoCreate} className="w-full bg-primary text-white text-sm py-2 rounded-lg font-medium hover:bg-primary/90 mt-2">
            Generate content for this week →
          </button>
        </section>
      )}

      {/* Queue tab */}
      {activeTab === "queue" && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-ink">Staged content</p>
            <button
              type="button"
              onClick={() => setShowPreload(true)}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              + Pre-load content ↓
            </button>
          </div>
          <p className="text-xs text-muted">Items assigned to this campaign, not yet scheduled.</p>
          {loadingQueue ? (
            <p className="text-xs text-muted">Loading…</p>
          ) : queue.length === 0 ? (
            <p className="text-xs text-muted">No content yet. Use pre-load to generate posts in bulk.</p>
          ) : (
            <div className="space-y-2">
              {queue.map((item) => {
                const passed = item.review_scores?.overall_pass;
                return (
                  <div key={item.id} className="border border-hairline rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted">{CHANNEL_ICONS[item.channel] || "📄"} {item.channel} · {(item.content_mode || item.topic || "").replace(/_/g, " ")}</span>
                      {item.publish_date && (
                        <span className="text-[10px] text-muted ml-auto">{new Date(item.publish_date).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}</span>
                      )}
                    </div>
                    <p className="text-xs text-ink line-clamp-2">{item.body?.slice(0, 100) || item.title || item.topic}</p>
                    <div className="flex items-center gap-2 pt-0.5">
                      {passed === true ? (
                        <span className="text-[10px] text-emerald-600">✓ Approved</span>
                      ) : passed === false ? (
                        <span className="text-[10px] text-amber-600">⚠ Review flags</span>
                      ) : null}
                      <button
                        type="button"
                        onClick={async () => {
                          const nextEmpty = slots.find((s) => s.status === "empty");
                          if (!nextEmpty) { setError("No empty calendar slots — generate a posting schedule first."); return; }
                          try {
                            await authFetch(`/api/marketing/campaigns/${campaign.id}/slots/${nextEmpty.id}`, {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ content_item_id: item.id, status: "assigned" }),
                            });
                            loadSlots();
                            loadQueue();
                          } catch (e) {
                            setError(e.message);
                          }
                        }}
                        className="ml-auto text-[10px] text-primary hover:underline"
                      >
                        Assign to next slot
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await authFetch(`/api/marketing/content/${item.id}`, { method: "DELETE" });
                            loadQueue();
                          } catch (e) {
                            setError(e.message);
                          }
                        }}
                        className="text-[10px] text-red-400 hover:text-red-600"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Assign modal */}
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

      {/* Publish modal */}
      {publishSlot && (
        <PublishModal
          slot={publishSlot}
          campaignId={campaign.id}
          onClose={() => setPublishSlot(null)}
          onPublished={() => {
            setPublishSlot(null);
            loadSlots();
          }}
        />
      )}

      {/* Preload panel */}
      {showPreload && (
        <PreloadPanel
          campaignId={campaign.id}
          onClose={() => setShowPreload(false)}
          onScheduled={() => {
            setShowPreload(false);
            loadSlots();
            loadQueue();
          }}
        />
      )}
    </div>
  );
}

// ─── PreloadPanel ─────────────────────────────────────────────────────────────

const PRELOAD_MODES = [
  { value: "educational", label: "Educate" },
  { value: "story", label: "Story" },
  { value: "behind_scenes", label: "Behind it" },
  { value: "authority", label: "Authority" },
  { value: "opinion", label: "Opinion" },
  { value: "vision", label: "Vision" },
];

function PreloadPanel({ campaignId, onClose, onScheduled }) {
  const [phase, setPhase] = useState("config"); // 'config'|'generating'|'review'
  const [count, setCount] = useState(8);
  const [selectedModes, setSelectedModes] = useState(["educational", "story", "behind_scenes", "authority"]);
  const [previews, setPreviews] = useState([]);
  const [approved, setApproved] = useState(new Set());
  const [editingIdx, setEditingIdx] = useState(null);
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const panelRef = useRef(null);

  function toggleMode(mode) {
    setSelectedModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode],
    );
  }

  async function generate() {
    if (!selectedModes.length) { setError("Select at least one content type"); return; }
    setPhase("generating");
    setError("");
    try {
      const r = await authFetch(`/api/marketing/campaigns/${campaignId}/preload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count, content_modes: selectedModes }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Generation failed");
      const validPreviews = (j.previews || []).filter((p) => !p.error);
      setPreviews(j.previews || []);
      // Auto-approve passing items
      const autoApproved = new Set();
      validPreviews.forEach((p, i) => {
        if (p.review_scores?.overall_pass) autoApproved.add(i);
      });
      setApproved(autoApproved);
      setPhase("review");
    } catch (e) {
      setError(e.message);
      setPhase("config");
    }
  }

  async function scheduleApproved() {
    const approvedPreviews = previews.filter((_, i) => approved.has(i) && !previews[i].error);
    if (!approvedPreviews.length) { setError("No approved posts to schedule"); return; }
    setSaving(true);
    setError("");
    try {
      // Save as content items with campaign_id
      const items = approvedPreviews.map((p) => ({
        channel: p.channel,
        topic: p.topic || "",
        content: p.content,
        review_scores: p.review_scores,
        campaign_id: campaignId,
      }));
      const r1 = await authFetch("/api/marketing/generate/all-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const j1 = await r1.json();
      if (!r1.ok) throw new Error(j1.error || "Save failed");

      const savedIds = (j1.saved || []).map((s) => s.id).filter(Boolean);
      if (savedIds.length) {
        await authFetch(`/api/marketing/campaigns/${campaignId}/slots/auto-assign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content_item_ids: savedIds }),
        });
      }
      onScheduled();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(idx) {
    setEditingIdx(idx);
    setEditBody(previews[idx]?.content?.body || "");
  }

  function saveEdit(idx) {
    setPreviews((prev) => prev.map((p, i) => i === idx ? { ...p, content: { ...p.content, body: editBody } } : p));
    setEditingIdx(null);
  }

  const approvedCount = [...approved].filter((i) => previews[i] && !previews[i].error).length;

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      {/* Backdrop */}
      <div className="flex-1" />
      {/* Panel */}
      <div
        ref={panelRef}
        className="w-full max-w-[480px] bg-surface border-l border-hairline h-full overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Pre-load campaign content</h3>
            <button type="button" onClick={onClose} className="text-muted hover:text-ink">
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
            </button>
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          {phase === "config" && (
            <div className="space-y-4">
              <p className="text-xs text-muted">Generate posts ready to schedule. The system rotates through selected content types automatically.</p>

              <div>
                <label className="text-xs font-medium text-muted block mb-2">Content types to rotate</label>
                <div className="flex flex-wrap gap-2">
                  {PRELOAD_MODES.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => toggleMode(m.value)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${selectedModes.includes(m.value) ? "border-primary bg-primary/10 text-primary" : "border-hairline text-muted"}`}
                    >
                      {selectedModes.includes(m.value) ? "✓ " : "✗ "}{m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted block mb-1">Number of posts</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={count}
                    onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value))))}
                    className="w-20 border border-hairline rounded-lg px-3 py-2 text-sm text-center"
                  />
                  <p className="text-xs text-muted">Tip: aim for 2× your weekly post count × 2 weeks ahead</p>
                </div>
              </div>

              <button
                type="button"
                onClick={generate}
                disabled={!selectedModes.length}
                className="w-full bg-primary text-white text-sm py-2.5 rounded-lg font-medium disabled:opacity-50 hover:bg-primary/90"
              >
                Generate {count} posts →
              </button>
            </div>
          )}

          {phase === "generating" && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted text-center">Generating {count} posts from your photo library…</p>
              <p className="text-xs text-muted text-center">This takes about 30–60 seconds</p>
            </div>
          )}

          {phase === "review" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-ink">{previews.filter((p) => !p.error).length} posts generated — review and approve</p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setApproved(new Set(previews.map((_, i) => i).filter((i) => !previews[i].error)))}
                  className="flex-1 text-xs border border-emerald-300 text-emerald-700 bg-emerald-50 rounded-lg py-2 hover:bg-emerald-100"
                >
                  ✓ Approve all
                </button>
                <button
                  type="button"
                  onClick={() => setApproved(new Set())}
                  className="flex-1 text-xs border border-slate-300 text-muted rounded-lg py-2 hover:bg-slate-50"
                >
                  ✗ Discard all
                </button>
              </div>

              <div className="space-y-3 divide-y divide-hairline">
                {previews.map((preview, idx) => {
                  if (preview.error) {
                    return (
                      <div key={idx} className="pt-3 text-xs text-red-500">
                        {CHANNEL_ICONS[preview.channel] || "📄"} {preview.channel} — Error: {preview.error}
                      </div>
                    );
                  }
                  const isApproved = approved.has(idx);
                  const scores = preview.review_scores || {};
                  const identityScore = scores.identity_score ?? 0;
                  const hookScore = scores.hook_quality ?? 0;
                  const pass = scores.overall_pass;
                  const isEditing = editingIdx === idx;
                  return (
                    <div key={idx} className={`pt-3 space-y-2 rounded-lg ${isApproved ? "" : "opacity-60"}`}>
                      <div className="flex items-center gap-2 text-xs">
                        <span>{CHANNEL_ICONS[preview.channel] || "📄"}</span>
                        <span className="font-medium text-ink capitalize">{preview.channel} · {(preview.content_mode || "").replace(/_/g, " ")}</span>
                        {preview.slot_date && (
                          <span className="text-muted ml-auto">
                            {new Date(preview.slot_date + "T12:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
                          </span>
                        )}
                      </div>
                      {isEditing ? (
                        <div className="space-y-2">
                          <textarea
                            value={editBody}
                            onChange={(e) => setEditBody(e.target.value)}
                            rows={5}
                            className="w-full border border-primary rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                          <div className="flex gap-2">
                            <button type="button" onClick={() => saveEdit(idx)} className="text-xs bg-primary text-white px-3 py-1.5 rounded-lg">Save</button>
                            <button type="button" onClick={() => setEditingIdx(null)} className="text-xs text-muted border border-hairline px-3 py-1.5 rounded-lg">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-ink line-clamp-3">&ldquo;{preview.content?.body?.slice(0, 120) || preview.topic}&rdquo;</p>
                      )}
                      <div className="flex items-center gap-3 text-[10px] text-muted">
                        <span>Identity: {identityScore}/10</span>
                        <span>Hook: {hookScore}/10</span>
                        {pass === true ? (
                          <span className="text-emerald-600">✓ Pass</span>
                        ) : pass === false ? (
                          <span className="text-amber-600">⚠ Review flag</span>
                        ) : null}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setApproved((prev) => { const next = new Set(prev); isApproved ? next.delete(idx) : next.add(idx); return next; })}
                          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${isApproved ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-hairline text-muted"}`}
                        >
                          {isApproved ? "✓ Approved" : "✓ Approve"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setApproved((prev) => { const next = new Set(prev); next.delete(idx); return next; })}
                          className="text-xs px-3 py-1.5 rounded-lg border border-hairline text-muted"
                        >
                          ✗ Discard
                        </button>
                        {!isEditing && (
                          <button type="button" onClick={() => startEdit(idx)} className="text-xs px-3 py-1.5 rounded-lg border border-hairline text-muted">
                            ✏ Edit
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-4 border-t border-hairline">
                <button
                  type="button"
                  onClick={scheduleApproved}
                  disabled={saving || approvedCount === 0}
                  className="w-full bg-primary text-white text-sm py-2.5 rounded-lg font-medium disabled:opacity-50 hover:bg-primary/90"
                >
                  {saving ? "Scheduling…" : `Schedule ${approvedCount} approved post${approvedCount !== 1 ? "s" : ""} →`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── PublishModal ─────────────────────────────────────────────────────────────

function PublishModal({ slot, campaignId, onClose, onPublished }) {
  const [metrics, setMetrics] = useState({ reach: "", saves: "", comments: "", shares: "", clicks: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const item = slot.marketing_content_items;

  async function publish(withMetrics) {
    setSaving(true);
    setError("");
    try {
      const body = withMetrics
        ? { metrics: Object.fromEntries(Object.entries(metrics).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)])) }
        : { metrics: {} };
      const r = await authFetch(`/api/marketing/campaigns/${campaignId}/slots/${slot.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to mark published");
      onPublished();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-surface rounded-xl border border-hairline p-5 max-w-sm w-full space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-ink">Post published?</h3>

        {item && (
          <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs space-y-0.5">
            <p className="text-ink font-medium line-clamp-2">{CHANNEL_ICONS[slot.channel] || "📄"} &ldquo;{(item.title || item.body || "").slice(0, 80)}&rdquo;</p>
            <p className="text-muted capitalize">{slot.channel} · {slot.slot_date ? new Date(slot.slot_date + "T12:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }) : ""}</p>
          </div>
        )}

        <div>
          <p className="text-xs text-muted mb-3">Enter post metrics (optional — helps improve future recommendations)</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: "reach", label: "Reach" },
              { key: "saves", label: "Saves" },
              { key: "comments", label: "Comments" },
              { key: "shares", label: "Shares" },
              { key: "clicks", label: "Clicks" },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="text-[10px] text-muted block mb-0.5">{label}</label>
                <input
                  type="number"
                  min={0}
                  value={metrics[key]}
                  onChange={(e) => setMetrics((m) => ({ ...m, [key]: e.target.value }))}
                  className="w-full border border-hairline rounded px-2 py-1.5 text-xs"
                  placeholder="—"
                />
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => publish(false)}
            disabled={saving}
            className="flex-1 text-xs border border-hairline px-3 py-2 rounded-lg text-muted hover:text-ink disabled:opacity-50"
          >
            Skip — mark published
          </button>
          <button
            type="button"
            onClick={() => publish(true)}
            disabled={saving}
            className="flex-1 text-xs bg-primary text-white px-3 py-2 rounded-lg font-medium disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save with metrics"}
          </button>
        </div>
      </div>
    </div>
  );
}
