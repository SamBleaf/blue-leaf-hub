/**
 * BookMeetingModal — the on-a-call quick-action. Find the lead, pick the meeting type, pick a live
 * open slot, book — without opening the lead first. Filters the leads already loaded by the pipeline
 * (no extra fetch). For someone not yet in the system, add the lead first (＋ Add Lead), then book.
 */
import { useMemo, useState } from "react";
import { apiPost } from "../../lib/apiFetch.js";
import { MEETING_TYPE_LABELS } from "../../lib/constants.js";
import SlotPicker from "./SlotPicker.jsx";

function leadName(l) {
  return l?.name || [l?.firstName, l?.lastName].filter(Boolean).join(" ") || l?.email || "Lead";
}

export default function BookMeetingModal({ leads = [], onClose, onBooked }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [meetingType, setMeetingType] = useState("build_conversation");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return leads
      .filter((l) => leadName(l).toLowerCase().includes(q) || String(l.email || "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, leads]);

  async function book(iso) {
    if (!selected) return;
    setBusy(true); setMsg(null);
    const { ok, data, error } = await apiPost(`/api/sales/leads/${selected.id}/meetings/schedule`, {
      meetingType, startAt: iso, location: location || null,
    });
    setBusy(false);
    if (!ok) { setMsg({ type: "error", text: error || "Couldn't book the meeting." }); return; }
    onBooked?.(data?.bookedViaCalcom);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[85vh] overflow-auto rounded-card bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-ink">Book a meeting</h3>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">×</button>
        </div>

        {!selected ? (
          <div>
            <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Who is it with?</label>
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a lead by name or email…"
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus-ring" />
            <div className="mt-2 divide-y divide-hairline rounded-lg border border-hairline">
              {matches.length === 0 ? (
                <p className="px-3 py-3 text-xs text-muted">
                  {query.trim() ? "No matching lead. Add them via ＋ Add Lead, then book." : "Start typing to find the lead."}
                </p>
              ) : matches.map((l) => (
                <button key={l.id} type="button" onClick={() => setSelected(l)}
                  className="block w-full px-3 py-2 text-left hover:bg-page">
                  <div className="text-sm font-medium text-ink">{leadName(l)}</div>
                  <div className="text-xs text-muted">{l.email || "—"}{l.stage ? ` · ${l.stage.replace(/_/g, " ")}` : ""}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-page px-3 py-2">
              <div>
                <div className="text-sm font-medium text-ink">{leadName(selected)}</div>
                <div className="text-xs text-muted">{selected.email || "—"}</div>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-xs text-primary hover:underline">Change</button>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Meeting</label>
              <select value={meetingType} onChange={(e) => setMeetingType(e.target.value)} className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus-ring">
                {Object.entries(MEETING_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Location (optional)</label>
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Phone / video / site address"
                className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus-ring" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Pick a time</label>
              <SlotPicker meetingType={meetingType} onPick={book} busy={busy} />
            </div>
            {msg && <p className={`text-xs ${msg.type === "error" ? "text-red-600" : "text-green-600"}`}>{msg.text}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
