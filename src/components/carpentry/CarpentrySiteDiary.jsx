// =============================================================================
// CarpentrySiteDiary — the dated site-diary form + list. Shared by a carpentry job's
// Diary tab and a BLB Charge Up site detail (SAME carpentry_site_diary table, scoped by
// the base URL). Extracted from CarpentryJobDetail's DiaryTab so both surfaces render the
// identical diary — "lean on the carpentry job code".
//   diaryBase : "/api/carpentry/jobs/:id"  |  "/api/carpentry/charge-up-jobs/:id"
//   address   : the site address, passed to the AI voice-structuring endpoint
// =============================================================================
import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiPost } from "../../lib/apiFetch.js";

const EMPTY_FORM = {
  entryDate: new Date().toISOString().slice(0, 10),
  weather: "", tradesOnsite: "", workCompleted: "",
  issues: "", instructionsGiven: "", visitors: "",
  supervisor: "", rawVoiceTranscript: "",
};

export default function CarpentrySiteDiary({ diaryBase, address }) {
  const [entries, setEntries]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);
  const [structuring, setStructuring] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM, entryDate: new Date().toISOString().slice(0, 10) });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, data } = await apiFetch(`${diaryBase}/diary`);
    setLoading(false);
    if (ok) setEntries(data?.entries || []);
  }, [diaryBase]);

  useEffect(() => { load(); }, [load]);

  async function structureWithAi() {
    if (!form.rawVoiceTranscript.trim()) return;
    setStructuring(true);
    const { ok, data, error: e } = await apiPost("/api/diary/structure", {
      transcript: form.rawVoiceTranscript,
      projectAddress: address,
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
    const { ok, data, error: e } = await apiPost(`${diaryBase}/diary`, {
      ...form,
      tradesOnsite,
      structuredByAi: form.rawVoiceTranscript.trim().length > 0,
    });
    setSaving(false);
    if (!ok) { setError(e || "Failed to save diary entry."); return; }
    setEntries((es) => [data.entry, ...es]);
    setShowForm(false);
    setForm({ ...EMPTY_FORM, entryDate: new Date().toISOString().slice(0, 10) });
  }

  return (
    <div>
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
