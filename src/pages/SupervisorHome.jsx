import { authFetch } from "../lib/authFetch.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getSupabase, supabaseConfigured } from "../lib/supabaseClient";
import { useRole } from "../lib/useRole.js";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function fmtDate(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
}

const WEATHER_OPTIONS = ["☀️ Sunny", "⛅ Cloudy", "🌧️ Rain", "💨 Windy", "⛈️ Storm", "🌫️ Fog"];

// ── Voice capture hook ───────────────────────────────────────────────────────
function useVoiceCapture() {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const recognizerRef = useRef(null);

  const start = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setError("Voice capture not supported in this browser."); return; }
    const r = new SpeechRecognition();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-AU";
    recognizerRef.current = r;
    let final = "";
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + " ";
        else interim += e.results[i][0].transcript;
      }
      setTranscript((final + interim).trim());
    };
    r.onerror = (e) => { setError(e.error); setListening(false); };
    r.onend = () => setListening(false);
    r.start();
    setListening(true);
    setError("");
  }, []);

  const stop = useCallback(() => {
    recognizerRef.current?.stop();
    setListening(false);
  }, []);

  const clear = useCallback(() => {
    setTranscript("");
    setError("");
  }, []);

  return { listening, transcript, error, start, stop, clear };
}

// ── Task row ─────────────────────────────────────────────────────────────────
function TaskRow({ task, onMarkDone, saving }) {
  const pct = task.percent_complete || 0;
  const done = pct >= 100;
  return (
    <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition ${done ? "border-success/20 bg-success/5 opacity-60" : "border-hairline bg-surface"}`}>
      <button
        type="button"
        disabled={saving || done}
        onClick={() => onMarkDone(task)}
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 transition ${
          done ? "border-success bg-success text-white" : "border-hairline bg-page hover:border-success hover:bg-success/10 active:scale-95"
        }`}
        aria-label="Mark done"
      >
        {done ? "✓" : saving ? "…" : "✓"}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold leading-tight ${done ? "line-through text-muted" : "text-ink"}`}>{task.name}</p>
        <p className="mt-0.5 text-xs text-muted">
          {task.trade || task.assignee_trade || "—"}
          {task.phase ? ` · ${task.phase.replace(/_/g, " ")}` : ""}
        </p>
        {pct > 0 && pct < 100 ? (
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-hairline">
            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
        ) : null}
      </div>
      <span className="flex-shrink-0 text-xs font-mono text-muted">{pct}%</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SupervisorHome() {
  const today = todayIso();
  const { setRole } = useRole();

  const [projects, setProjects] = useState([]);
  const [tasksByProject, setTasksByProject] = useState({});
  const [saving, setSaving] = useState({});
  const [loading, setLoading] = useState(true);

  // Diary state
  const [diaryProjectId, setDiaryProjectId] = useState("");
  const [diaryWeather, setDiaryWeather] = useState("");
  const [diaryNotes, setDiaryNotes] = useState("");
  const [diaryBusy, setDiaryBusy] = useState(false);
  const [diarySuccess, setDiarySuccess] = useState(false);

  // Voice state
  const { listening, transcript, error: voiceError, start: startVoice, stop: stopVoice, clear: clearVoice } = useVoiceCapture();
  const [voiceParsed, setVoiceParsed] = useState(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceProject, setVoiceProject] = useState("");
  const [voiceApplyMsg, setVoiceApplyMsg] = useState("");

  const load = useCallback(async () => {
    if (!supabaseConfigured) return;
    const sb = getSupabase();
    const { data: projs } = await sb.from("projects").select("id, address").order("created_at", { ascending: false }).limit(20);
    if (!projs?.length) { setLoading(false); return; }
    setProjects(projs);
    if (!diaryProjectId) setDiaryProjectId(projs[0].id);
    if (!voiceProject) setVoiceProject(projs[0].id);

    const { data: tasks } = await sb
      .from("schedule_tasks")
      .select("id, name, trade, assignee_trade, phase, percent_complete, status, project_id")
      .lte("start_date", today)
      .gte("end_date", today)
      .neq("status", "complete")
      .order("phase");

    const byProj = {};
    for (const t of tasks || []) {
      if (!byProj[t.project_id]) byProj[t.project_id] = [];
      byProj[t.project_id].push(t);
    }
    setTasksByProject(byProj);
    setLoading(false);
  }, [today, diaryProjectId, voiceProject]);

  useEffect(() => { load(); }, [load]);

  async function markDone(task) {
    setSaving((s) => ({ ...s, [task.id]: true }));
    try {
      const sb = getSupabase();
      await sb.from("schedule_tasks").update({ percent_complete: 100, status: "complete" }).eq("id", task.id);
      setTasksByProject((prev) => ({
        ...prev,
        [task.project_id]: (prev[task.project_id] || []).map((t) => t.id === task.id ? { ...t, percent_complete: 100, status: "complete" } : t)
      }));
    } finally {
      setSaving((s) => ({ ...s, [task.id]: false }));
    }
  }

  async function submitDiary() {
    if (!diaryProjectId || !diaryNotes.trim()) return;
    setDiaryBusy(true);
    try {
      const res = await authFetch(`/api/diary/${diaryProjectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry_date: today,
          weather: diaryWeather.replace(/^[^\s]+\s/, ""),
          trades_onsite: [],
          work_completed: diaryNotes.trim(),
          issues: "",
          next_steps: ""
        })
      });
      const j = await res.json();
      if (j.ok) { setDiarySuccess(true); setDiaryNotes(""); setDiaryWeather(""); setTimeout(() => setDiarySuccess(false), 3000); }
    } finally {
      setDiaryBusy(false);
    }
  }

  async function parseVoice() {
    if (!transcript.trim()) return;
    setVoiceBusy(true);
    setVoiceApplyMsg("");
    const proj = projects.find((p) => p.id === voiceProject);
    const todayTasks = tasksByProject[voiceProject] || [];
    try {
      const res = await authFetch("/api/supervisor/parse-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, projectAddress: proj?.address, tasks: todayTasks })
      });
      const j = await res.json();
      if (j.ok) setVoiceParsed(j.result);
    } finally {
      setVoiceBusy(false);
    }
  }

  async function applyVoiceParsed() {
    if (!voiceParsed || !voiceProject) return;
    setVoiceBusy(true);
    try {
      const sb = getSupabase();
      const actions = [];

      if (voiceParsed.type === "diary" || voiceParsed.type === "both") {
        const d = voiceParsed.type === "both" ? voiceParsed.data.diary : voiceParsed.data;
        const res = await authFetch(`/api/diary/${voiceProject}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entry_date: today,
            weather: d.weather || "",
            trades_onsite: d.tradesOnSite || [],
            work_completed: d.workCompleted || "",
            issues: d.issues || "",
            next_steps: d.nextSteps || ""
          })
        });
        const j = await res.json();
        if (j.ok) actions.push("diary entry saved");
      }

      if (voiceParsed.type === "task_update" || voiceParsed.type === "both") {
        const updates = voiceParsed.type === "both" ? voiceParsed.data.updates : voiceParsed.data.updates;
        const todayTasks = tasksByProject[voiceProject] || [];
        for (const upd of updates || []) {
          const task = todayTasks.find((t) => t.name.toLowerCase().includes(upd.taskName?.toLowerCase() || "NOMATCH"));
          if (task) {
            const pct = Math.max(0, Math.min(100, upd.percentComplete || 0));
            const status = pct >= 100 ? "complete" : pct > 0 ? "in_progress" : "planned";
            await sb.from("schedule_tasks").update({ percent_complete: pct, status, notes: upd.notes || task.notes || "" }).eq("id", task.id);
            actions.push(`"${task.name}" → ${pct}%`);
          }
        }
      }

      setVoiceApplyMsg(actions.length ? `✓ Applied: ${actions.join(", ")}` : "Nothing matched — check task names");
      clearVoice();
      setVoiceParsed(null);
      load();
    } finally {
      setVoiceBusy(false);
    }
  }

  const totalToday = Object.values(tasksByProject).flat().length;

  return (
    <div className="min-h-screen bg-page pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-hairline bg-surface px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted">Supervisor mode</p>
            <h1 className="text-base font-bold text-ink">{fmtDate(today)}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/operations" className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-muted">
              Full app
            </Link>
            <button
              type="button"
              onClick={() => setRole("director")}
              className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink"
            >
              Switch to Director
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-6 px-4 pt-5">

        {/* Today's tasks */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-label">Today on site</h2>
            <span className="text-xs text-muted">{totalToday} task{totalToday !== 1 ? "s" : ""}</span>
          </div>
          {loading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : totalToday === 0 ? (
            <p className="rounded-lg border border-hairline bg-surface px-4 py-6 text-center text-sm text-muted">
              No tasks scheduled for today across active projects.
            </p>
          ) : (
            <div className="space-y-4">
              {projects.filter((p) => tasksByProject[p.id]?.length).map((proj) => (
                <div key={proj.id}>
                  <p className="mb-2 text-xs font-semibold text-primary">{proj.address}</p>
                  <div className="space-y-2">
                    {tasksByProject[proj.id].map((task) => (
                      <TaskRow key={task.id} task={task} onMarkDone={markDone} saving={!!saving[task.id]} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Voice capture */}
        <section className="rounded-lg border border-hairline bg-surface p-4">
          <h2 className="section-label mb-3">Voice memo</h2>

          {projects.length > 1 ? (
            <select value={voiceProject} onChange={(e) => setVoiceProject(e.target.value)} className="mb-3 w-full rounded border border-hairline bg-page px-2 py-1.5 text-sm">
              {projects.map((p) => <option key={p.id} value={p.id}>{p.address}</option>)}
            </select>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={listening ? stopVoice : startVoice}
              className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full border-2 text-xl transition ${
                listening ? "animate-pulse border-danger bg-danger/10 text-danger" : "border-primary bg-primary/5 text-primary hover:bg-primary/10"
              }`}
            >
              🎤
            </button>
            <div className="flex-1 min-w-0">
              {listening ? <p className="text-sm font-semibold text-danger">Listening…</p> : <p className="text-xs text-muted">Tap to record. Describe site activity, task progress, or issues.</p>}
              {transcript ? <p className="mt-1 text-sm text-ink line-clamp-3">&ldquo;{transcript}&rdquo;</p> : null}
              {voiceError ? <p className="mt-1 text-xs text-danger">{voiceError}</p> : null}
            </div>
          </div>

          {transcript && !listening ? (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={parseVoice}
                disabled={voiceBusy}
                className="flex-1 rounded-lg bg-primary py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {voiceBusy ? "Parsing…" : "Parse with AI"}
              </button>
              <button type="button" onClick={clearVoice} className="rounded-lg border border-hairline px-3 py-2 text-sm text-muted">
                Clear
              </button>
            </div>
          ) : null}

          {/* Parsed result preview */}
          {voiceParsed ? (
            <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="mb-2 text-xs font-semibold text-primary uppercase tracking-wide">Parsed — review before saving</p>
              {(voiceParsed.type === "diary" || voiceParsed.type === "both") && (() => {
                const d = voiceParsed.type === "both" ? voiceParsed.data.diary : voiceParsed.data;
                return (
                  <div className="mb-2 text-xs text-ink space-y-1">
                    {d.weather ? <p><span className="font-semibold">Weather:</span> {d.weather}</p> : null}
                    {d.tradesOnSite?.length ? <p><span className="font-semibold">Trades:</span> {d.tradesOnSite.join(", ")}</p> : null}
                    {d.workCompleted ? <p><span className="font-semibold">Work:</span> {d.workCompleted}</p> : null}
                    {d.issues ? <p><span className="font-semibold">Issues:</span> {d.issues}</p> : null}
                  </div>
                );
              })()}
              {(voiceParsed.type === "task_update" || voiceParsed.type === "both") && (() => {
                const updates = voiceParsed.type === "both" ? voiceParsed.data.updates : voiceParsed.data.updates;
                return updates?.length ? (
                  <div className="mb-2 text-xs text-ink space-y-1">
                    {updates.map((u, i) => <p key={i}><span className="font-semibold">{u.taskName}</span> → {u.percentComplete}%{u.notes ? ` — ${u.notes}` : ""}</p>)}
                  </div>
                ) : null;
              })()}
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={applyVoiceParsed}
                  disabled={voiceBusy}
                  className="flex-1 rounded-lg bg-accent py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {voiceBusy ? "Saving…" : "Apply"}
                </button>
                <button type="button" onClick={() => setVoiceParsed(null)} className="rounded-lg border border-hairline px-3 py-2 text-sm text-muted">
                  Discard
                </button>
              </div>
            </div>
          ) : null}

          {voiceApplyMsg ? <p className="mt-2 text-sm font-semibold text-success">{voiceApplyMsg}</p> : null}
        </section>

        {/* Quick diary entry */}
        <section className="rounded-lg border border-hairline bg-surface p-4">
          <h2 className="section-label mb-3">Quick diary entry</h2>
          {projects.length > 1 ? (
            <select value={diaryProjectId} onChange={(e) => setDiaryProjectId(e.target.value)} className="mb-3 w-full rounded border border-hairline bg-page px-2 py-1.5 text-sm">
              {projects.map((p) => <option key={p.id} value={p.id}>{p.address}</option>)}
            </select>
          ) : null}
          <div className="mb-3 flex flex-wrap gap-2">
            {WEATHER_OPTIONS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setDiaryWeather(diaryWeather === w ? "" : w)}
                className={`rounded-full border px-3 py-1 text-sm transition ${diaryWeather === w ? "border-primary bg-primary/10 text-primary font-semibold" : "border-hairline text-muted hover:border-primary/40"}`}
              >
                {w}
              </button>
            ))}
          </div>
          <textarea
            value={diaryNotes}
            onChange={(e) => setDiaryNotes(e.target.value)}
            rows={3}
            placeholder="What happened on site today?"
            className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
          <button
            type="button"
            onClick={submitDiary}
            disabled={diaryBusy || !diaryNotes.trim()}
            className="mt-2 w-full rounded-lg bg-accent py-3 text-sm font-bold text-white disabled:opacity-50 active:scale-[0.98] transition"
          >
            {diaryBusy ? "Saving…" : diarySuccess ? "✓ Saved!" : "Save diary entry"}
          </button>
        </section>

        {/* Links */}
        <div className="grid grid-cols-2 gap-3">
          <Link to="/operations" className="flex flex-col items-center gap-1 rounded-lg border border-hairline bg-surface px-3 py-4 text-center">
            <span className="text-2xl">🏗️</span>
            <span className="text-xs font-semibold text-ink">Projects</span>
          </Link>
          <Link to="/tender-manager/rfq-engine" className="flex flex-col items-center gap-1 rounded-lg border border-hairline bg-surface px-3 py-4 text-center">
            <span className="text-2xl">📄</span>
            <span className="text-xs font-semibold text-ink">RFQ Engine</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
