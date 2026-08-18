/**
 * SlotPicker — pick a meeting time. If the cal.com API is connected it shows LIVE open slots (day
 * pills + clickable times) so you can book a real free slot while on a call; otherwise it falls back
 * to a manual date/time input so a time can always be set. Calls onPick(isoString) with the choice.
 */
import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/apiFetch.js";

function dayLabel(dateStr) {
  try {
    const d = new Date(`${dateStr}T00:00:00`);
    return { wd: d.toLocaleDateString("en-AU", { weekday: "short" }), dm: d.toLocaleDateString("en-AU", { day: "numeric", month: "short" }) };
  } catch { return { wd: "", dm: dateStr }; }
}
function timeLabel(iso) {
  try { return new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }); } catch { return iso; }
}

function ManualEntry({ onPick, busy }) {
  const [val, setVal] = useState("");
  return (
    <div className="space-y-2">
      <label className="block text-[11px] font-semibold text-muted mb-1">Date &amp; time</label>
      <div className="flex gap-2">
        <input type="datetime-local" value={val} onChange={(e) => setVal(e.target.value)} className="flex-1 rounded-lg border border-hairline px-2 py-1.5 text-sm focus-ring" />
        <button type="button" disabled={!val || busy} onClick={() => onPick(new Date(val).toISOString())}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? "…" : "Book this time"}
        </button>
      </div>
    </div>
  );
}

export default function SlotPicker({ meetingType, onPick, busy }) {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [slots, setSlots] = useState([]);
  const [error, setError] = useState("");
  const [activeDate, setActiveDate] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch(`/api/sales/meeting-slots?meetingType=${encodeURIComponent(meetingType)}&days=14`).then(({ ok, data }) => {
      if (!active) return;
      if (ok) {
        setConfigured(!!data.configured);
        setSlots(data.slots || []);
        setError(data.error || "");
        setActiveDate((data.slots || [])[0]?.date || "");
      } else {
        setError("Couldn't load times.");
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [meetingType]);

  if (loading) return <p className="text-xs text-muted">Loading open times…</p>;

  // No live availability (API off, or an error, or genuinely no slots) → manual entry always works.
  if (!configured || error || slots.length === 0) {
    return (
      <div className="space-y-2">
        {!configured ? (
          <p className="text-[11px] text-muted">Connect the cal.com API (CAL_API_KEY) to pick from live open times. For now, set a time manually:</p>
        ) : error ? (
          <p className="text-[11px] text-amber-700">{error} Set a time manually:</p>
        ) : (
          <p className="text-[11px] text-muted">No open times in the next 14 days — set a time manually:</p>
        )}
        <ManualEntry onPick={onPick} busy={busy} />
      </div>
    );
  }

  const active = slots.find((s) => s.date === activeDate) || slots[0];
  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {slots.map((s) => {
          const { wd, dm } = dayLabel(s.date);
          const on = s.date === active.date;
          return (
            <button key={s.date} type="button" onClick={() => setActiveDate(s.date)}
              className={`shrink-0 rounded-lg border px-2.5 py-1 text-center ${on ? "border-primary bg-primary text-white" : "border-hairline text-ink hover:bg-page"}`}>
              <div className="text-[10px] uppercase tracking-wide opacity-80">{wd}</div>
              <div className="text-xs font-semibold">{dm}</div>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {active.times.map((iso) => (
          <button key={iso} type="button" disabled={busy} onClick={() => onPick(iso)}
            className="rounded-lg border border-hairline px-2.5 py-1 text-xs font-medium text-ink hover:border-primary hover:bg-primary/5 disabled:opacity-50">
            {timeLabel(iso)}
          </button>
        ))}
      </div>
    </div>
  );
}
