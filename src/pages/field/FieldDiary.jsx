import { useEffect, useState } from "react";
import { apiPost } from "../../lib/apiFetch.js";
import { getSupabase, supabaseConfigured } from "../../lib/supabaseClient";
import { Card, Loading, Empty, PageTitle } from "../clientportal/clientPortalUi.jsx";

const WEATHER = ["☀️ Sunny", "⛅ Cloudy", "🌧️ Rain", "💨 Windy", "⛈️ Storm", "🌫️ Fog"];

export default function FieldDiary() {
  const today = new Date().toLocaleDateString("en-CA");
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [weather, setWeather] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (!supabaseConfigured()) { setLoading(false); return; }
    getSupabase().from("projects").select("id, address").order("created_at", { ascending: false }).limit(50)
      .then(({ data }) => {
        const ps = data || [];
        setProjects(ps);
        if (ps.length === 1) setProjectId(ps[0].id);
        setLoading(false);
      });
  }, []);

  async function save() {
    if (!projectId || !notes.trim()) { setMsg("Pick a site and write what happened."); return; }
    setBusy(true); setMsg(null);
    const { ok, error } = await apiPost("/api/diary/save", {
      projectId,
      entry: {
        entry_date: today,
        weather: weather.replace(/^[^\s]+\s/, ""), // drop the emoji prefix
        trades_onsite: [],
        work_completed: notes.trim(),
        issues: "",
      },
    });
    setBusy(false);
    if (ok) { setMsg("✓ Saved"); setNotes(""); setWeather(""); }
    else setMsg(error || "Could not save the entry.");
  }

  if (loading) return <div className="space-y-4"><PageTitle>Site diary</PageTitle><Loading label="Loading…" /></div>;

  return (
    <div className="space-y-4">
      <PageTitle sub={new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" })}>Site diary</PageTitle>

      {projects.length === 0 ? (
        <Empty title="No projects yet" />
      ) : (
        <Card>
          {projects.length > 1 && (
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2.5 text-sm focus-ring mb-3">
              <option value="">Select site…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.address}</option>)}
            </select>
          )}

          <p className="text-xs font-medium text-muted mb-1.5">Weather</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {WEATHER.map((w) => (
              <button
                key={w}
                onClick={() => setWeather(weather === w ? "" : w)}
                className={`min-h-[40px] rounded-lg px-3 py-2 text-sm transition-colors ${
                  weather === w ? "bg-primary text-white" : "border border-hairline bg-surface text-ink hover:bg-page"
                }`}
              >
                {w}
              </button>
            ))}
          </div>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            placeholder="What happened on site today?"
            className="w-full border border-hairline rounded-lg px-3 py-2.5 text-sm focus-ring resize-y"
          />

          <button
            onClick={save}
            disabled={busy}
            className="mt-3 w-full min-h-[48px] rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save diary entry"}
          </button>
          {msg && <p className={`text-xs mt-2 ${msg.startsWith("✓") ? "text-emerald-700" : "text-red-600"}`}>{msg}</p>}
        </Card>
      )}
    </div>
  );
}
