import { authFetch } from "../lib/authFetch.js";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getSupabase, supabaseConfigured } from "../lib/supabaseClient";
import { loadEmailSignature } from "../lib/rfqSettings.js";

export default function SiteDiary() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [recording, setRecording] = useState(false);
  const [rec, setRec] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [structureBusy, setStructureBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);

  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [weather, setWeather] = useState("");
  const [tradesOnsite, setTradesOnsite] = useState([]);
  const [tradeInput, setTradeInput] = useState("");
  const [workCompleted, setWorkCompleted] = useState("");
  const [issues, setIssues] = useState("");
  const [instructions, setInstructions] = useState("");
  const [visitors, setVisitors] = useState("");
  const [supervisor, setSupervisor] = useState(() => loadEmailSignature().fullName || "Sam Morris");
  const [rawVoice, setRawVoice] = useState("");
  const [structuredFlag, setStructuredFlag] = useState(false);

  const SR = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

  const loadProject = useCallback(async () => {
    if (!supabaseConfigured || !projectId) return;
    const sb = getSupabase();
    const { data } = await sb.from("projects").select("id, address, accepted_trades").eq("id", projectId).single();
    setProject(data);
  }, [projectId]);

  const loadEntries = useCallback(async () => {
    const res = await authFetch(`/api/diary/${projectId}`);
    const j = await res.json();
    if (!res.ok || !j.ok) throw new Error(j.error || "Load failed");
    setEntries(j.entries || []);
  }, [projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  useEffect(() => {
    let stop = false;
    (async () => {
      setLoading(true);
      try {
        await loadEntries();
      } catch (e) {
        if (!stop) setError(e?.message || String(e));
      } finally {
        if (!stop) setLoading(false);
      }
    })();
    return () => {
      stop = true;
    };
  }, [loadEntries]);

  function startMic() {
    if (!SR) return;
    const r = new SR();
    r.lang = "en-AU";
    r.continuous = true;
    r.interimResults = true;
    let text = "";
    r.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
        text += ev.results[i][0].transcript;
      }
      setTranscript(text);
      setRawVoice(text);
    };
    r.onerror = () => setRecording(false);
    r.onend = () => setRecording(false);
    try {
      r.start();
      setRec(r);
      setRecording(true);
      setTranscript("");
    } catch {
      setError("Could not start microphone.");
    }
  }

  function stopMic() {
    if (rec) {
      try {
        rec.stop();
      } catch {
        /* */
      }
    }
    setRecording(false);
    setRec(null);
  }

  async function structureAi() {
    if (!transcript.trim()) return;
    setStructureBusy(true);
    setError("");
    try {
      const res = await authFetch("/api/diary/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, projectAddress: project?.address || "" })
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "Structure failed");
      const s = j.structured || {};
      // Guard: only apply AI result if it contains at least one non-empty field.
      // Prevents a silent empty response from wiping the user's manual input.
      const hasContent = s.weather || s.work_completed || s.issues ||
                         (Array.isArray(s.trades_onsite) && s.trades_onsite.length > 0);
      if (!hasContent) {
        setError("AI couldn't extract structure from this transcript. Fill the fields below manually.");
        return;
      }
      // Only overwrite fields the AI actually populated — don't blank fields AI left empty
      if (s.weather)              setWeather(String(s.weather));
      if (s.trades_onsite?.length) setTradesOnsite(s.trades_onsite);
      if (s.work_completed)       setWorkCompleted(String(s.work_completed));
      if (s.issues)               setIssues(String(s.issues));
      if (s.instructions_given)   setInstructions(String(s.instructions_given));
      if (s.visitors)             setVisitors(String(s.visitors));
      setStructuredFlag(true);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setStructureBusy(false);
    }
  }

  const accepted = Array.isArray(project?.accepted_trades) ? project.accepted_trades : [];

  function toggleTradeChip(label) {
    setTradesOnsite((prev) => (prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]));
  }

  function addFreeTrade() {
    const t = tradeInput.trim();
    if (!t) return;
    if (!tradesOnsite.includes(t)) setTradesOnsite((p) => [...p, t]);
    setTradeInput("");
  }

  async function saveEntry() {
    setSaveBusy(true);
    setError("");
    try {
      const res = await authFetch("/api/diary/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          entry: {
            entry_date: entryDate,
            weather,
            trades_onsite: tradesOnsite,
            work_completed: workCompleted,
            issues,
            instructions_given: instructions,
            visitors,
            supervisor,
            raw_voice_transcript: rawVoice || transcript,
            structured_by_ai: structuredFlag
          }
        })
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "Save failed");
      setToast("Saved. PDF filed to Dropbox.");
      setTimeout(() => setToast(""), 4000);
      setTranscript("");
      setRawVoice("");
      setStructuredFlag(false);
      setWeather("");
      setTradesOnsite([]);
      setWorkCompleted("");
      setIssues("");
      setInstructions("");
      setVisitors("");
      setEntryDate(new Date().toISOString().slice(0, 10));
      await loadEntries();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSaveBusy(false);
    }
  }

  return (
    <div className="space-y-6 pb-24">
      <Link to={`/operations/${projectId}`} className="text-sm font-semibold text-accent underline">
        ← Back to project
      </Link>
      <header className="rounded-card border border-hairline bg-surface p-4 shadow-sm">
        <h1 className="text-xl font-bold text-primary">{project?.address || "Project"}</h1>
        <p className="text-sm text-muted">Site Diary</p>
      </header>

      {toast ? <div className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm text-accent">{toast}</div> : null}
      {error ? <div className="text-sm text-danger">{error}</div> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6 rounded-card border border-hairline bg-surface p-4 shadow-sm">
          <h2 className="text-sm font-bold uppercase text-muted">New entry</h2>
          <div>
            <h3 className="text-sm font-semibold text-ink">1. Record</h3>
            {SR ? (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={recording ? stopMic : startMic}
                    className={`min-h-[48px] min-w-[48px] rounded-full px-6 py-4 text-sm font-bold text-white ${recording ? "bg-danger animate-pulse" : "bg-primary"}`}
                  >
                    {recording ? "Stop" : "Mic"}
                  </button>
                  {recording ? <span className="text-danger font-semibold">● Recording</span> : null}
                </div>
                <textarea readOnly value={transcript} rows={4} className="w-full rounded-lg border border-hairline bg-page p-3 text-sm" placeholder="Live transcript…" />
              </div>
            ) : (
              <label className="mt-2 block text-xs font-semibold text-muted">
                Type your entry manually
                <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={5} className="mt-1 w-full rounded-lg border border-hairline p-3 text-base" />
              </label>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink">2. Structure</h3>
            <button
              type="button"
              disabled={!transcript.trim() || structureBusy}
              onClick={structureAi}
              className="mt-2 min-h-[44px] rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {structureBusy ? "Loading…" : "Structure with AI"}
            </button>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink">3. Review</h3>
            <label className="mt-2 block text-xs font-semibold text-muted">
              Date
              <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="mt-1 w-full rounded-lg border border-hairline p-3 text-base" />
            </label>
            <label className="mt-2 block text-xs font-semibold text-muted">
              Weather
              <input value={weather} onChange={(e) => setWeather(e.target.value)} className="mt-1 w-full rounded-lg border border-hairline p-3 text-base" />
            </label>
            <div className="mt-2">
              <span className="text-xs font-semibold text-muted">Trades on site</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {accepted.map((t, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleTradeChip(t.trade)}
                    className={`rounded-full border px-3 py-2 text-sm ${tradesOnsite.includes(t.trade) ? "border-accent bg-accent/15 text-accent" : "border-hairline bg-page"}`}
                  >
                    {t.trade}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input value={tradeInput} onChange={(e) => setTradeInput(e.target.value)} placeholder="Add trade" className="flex-1 rounded-lg border border-hairline p-3 text-base" />
                <button type="button" onClick={addFreeTrade} className="rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white">
                  Add
                </button>
              </div>
            </div>
            <label className="mt-2 block text-xs font-semibold text-muted">
              Work completed
              <textarea value={workCompleted} onChange={(e) => setWorkCompleted(e.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-hairline p-3 text-base" />
            </label>
            <label className="mt-2 block text-xs font-semibold text-muted">
              Issues
              <textarea value={issues} onChange={(e) => setIssues(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-hairline p-3 text-base" />
            </label>
            <label className="mt-2 block text-xs font-semibold text-muted">
              Instructions given
              <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-hairline p-3 text-base" />
            </label>
            <label className="mt-2 block text-xs font-semibold text-muted">
              Visitors
              <input value={visitors} onChange={(e) => setVisitors(e.target.value)} className="mt-1 w-full rounded-lg border border-hairline p-3 text-base" />
            </label>
            <label className="mt-2 block text-xs font-semibold text-muted">
              Supervisor
              <input value={supervisor} onChange={(e) => setSupervisor(e.target.value)} className="mt-1 w-full rounded-lg border border-hairline p-3 text-base" />
            </label>
          </div>
          <button type="button" disabled={saveBusy} onClick={saveEntry} className="w-full min-h-[48px] rounded-lg bg-primary py-4 text-base font-semibold text-white">
            {saveBusy ? "Saving…" : "Save entry"}
          </button>
        </div>

        <div className="rounded-card border border-hairline bg-surface p-4 shadow-sm lg:max-h-[80vh] lg:overflow-y-auto">
          <h2 className="text-sm font-bold uppercase text-muted">Past entries</h2>
          {loading ? <p className="mt-4 text-sm text-muted">Loading…</p> : null}
          <ul className="mt-4 space-y-4">
            {entries.map((en) => (
              <DiaryRow key={en.id} en={en} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function DiaryRow({ en }) {
  const [open, setOpen] = useState(false);
  const trades = en.trades_onsite || [];
  const preview = String(en.work_completed || "").slice(0, 120);
  const rest = String(en.work_completed || "").length > 120;
  return (
    <li className="border-b border-hairline pb-3">
      <div className="font-bold text-ink">{en.entry_date}</div>
      <div className="text-xs text-muted">{en.weather || "—"}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {trades.map((t) => (
          <span key={t} className="rounded-full bg-page px-2 py-0.5 text-xs text-muted">
            {t}
          </span>
        ))}
      </div>
      <p className="mt-2 text-sm text-ink">
        {open ? en.work_completed : preview}
        {rest && !open ? (
          <button type="button" className="ml-1 text-primary underline" onClick={() => setOpen(true)}>
            read more
          </button>
        ) : null}
      </p>
      {en.dropbox_pdf_path ? <p className="mt-1 font-mono text-[10px] text-primary">{en.dropbox_pdf_path}</p> : null}
    </li>
  );
}
