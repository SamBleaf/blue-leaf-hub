import { useEffect, useState } from "react";
import { apiPost } from "../../lib/apiFetch.js";
import { useAuth } from "../../lib/useAuth.js";
import { can } from "../../lib/roles.js";
import { useVoiceCapture } from "../../lib/useVoiceCapture.js";
import { getSupabase, supabaseConfigured } from "../../lib/supabaseClient";
import { Card, Loading, Empty, PageTitle } from "../clientportal/clientPortalUi.jsx";

const WEATHER = ["☀️ Sunny", "⛅ Cloudy", "🌧️ Rain", "💨 Windy", "⛈️ Storm", "🌫️ Fog"];

export default function FieldDiary() {
  const { role } = useAuth();
  const canVoice = can.editSchedule(role); // admin/supervisor — parse-voice is gated to them
  const today = new Date().toLocaleDateString("en-CA");
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [weather, setWeather] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const { listening, transcript, error: voiceErr, start, stop, clear } = useVoiceCapture();
  const [voiceBusy, setVoiceBusy] = useState(false);

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

  const address = projects.find((p) => p.id === projectId)?.address || "";

  async function fillFromVoice() {
    if (!transcript.trim()) return;
    setVoiceBusy(true); setMsg(null);
    const { ok, data } = await apiPost("/api/supervisor/parse-voice", { transcript, projectAddress: address, tasks: [] });
    setVoiceBusy(false);
    if (!ok || !data?.result) { setMsg("Couldn't parse that — you can type the note instead."); return; }
    const r = data.result;
    const d = r.type === "both" ? (r.data?.diary || {}) : (r.type === "diary" ? r.data : null);
    if (d) {
      if (d.weather) {
        const chip = WEATHER.find((w) => w.toLowerCase().includes(String(d.weather).toLowerCase()));
        if (chip) setWeather(chip);
      }
      const body = [d.workCompleted, d.issues ? `Issues: ${d.issues}` : ""].filter(Boolean).join("\n");
      if (body) setNotes((n) => (n ? `${n}\n${body}` : body));
      setMsg("✓ Filled from your voice note — review and save.");
    } else {
      setNotes((n) => (n ? `${n}\n${transcript.trim()}` : transcript.trim()));
      setMsg("Added the transcript — review and save.");
    }
    clear();
  }

  async function save() {
    if (!projectId || !notes.trim()) { setMsg("Pick a site and write what happened."); return; }
    setBusy(true); setMsg(null);
    const { ok, error } = await apiPost("/api/diary/save", {
      projectId,
      entry: {
        entry_date: today,
        weather: weather.replace(/^[^\s]+\s/, ""),
        trades_onsite: [],
        work_completed: notes.trim(),
        issues: "",
        structured_by_ai: false,
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
        <>
          {projects.length > 1 && (
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2.5 text-sm focus-ring">
              <option value="">Select site…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.address}</option>)}
            </select>
          )}

          {canVoice && (
            <Card title="Voice note">
              <button
                onClick={listening ? stop : start}
                className={`w-full min-h-[48px] rounded-lg text-sm font-semibold transition-colors ${
                  listening ? "bg-red-500 text-white animate-pulse" : "border border-primary text-primary hover:bg-primary/5"
                }`}
              >
                {listening ? "● Recording — tap to stop" : "🎤 Record a voice note"}
              </button>
              {transcript && <p className="text-xs text-muted mt-2 whitespace-pre-line">{transcript}</p>}
              {voiceErr && <p className="text-xs text-amber-600 mt-2">{voiceErr}</p>}
              {transcript && !listening && (
                <button onClick={fillFromVoice} disabled={voiceBusy} className="mt-2 w-full min-h-[44px] rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-40">
                  {voiceBusy ? "Reading…" : "Fill diary from voice"}
                </button>
              )}
            </Card>
          )}

          <Card>
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

            <button onClick={save} disabled={busy} className="mt-3 w-full min-h-[48px] rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-40">
              {busy ? "Saving…" : "Save diary entry"}
            </button>
            {msg && <p className={`text-xs mt-2 ${msg.startsWith("✓") ? "text-emerald-700" : "text-red-600"}`}>{msg}</p>}
          </Card>
        </>
      )}
    </div>
  );
}
