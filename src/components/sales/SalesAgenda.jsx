/**
 * SalesAgenda — upcoming sales meetings across ALL leads, grouped by day. The "adopt calendars"
 * surface: every scheduled pipeline meeting (enquiry call, build conversation, designer meeting,
 * winning-offer presentation) from lead_meetings, whichever way it was booked. Click a row → the lead.
 */
import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/apiFetch.js";
import { MEETING_TYPE_LABELS } from "../../lib/constants.js";

function leadName(l) {
  return l?.name || [l?.firstName, l?.lastName].filter(Boolean).join(" ") || "Lead";
}
function dayKey(iso) {
  try { return new Date(iso).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" }); } catch { return ""; }
}
function timeLabel(iso) {
  try { return new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }); } catch { return ""; }
}

export default function SalesAgenda({ onOpen }) {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(21);
  const [tableMissing, setTableMissing] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch(`/api/sales/meetings/upcoming?days=${days}`).then(({ ok, data }) => {
      if (!active) return;
      if (ok) { setMeetings(data.meetings || []); setTableMissing(!!data.tableMissing); }
      setLoading(false);
    });
    return () => { active = false; };
  }, [days]);

  // Group by day, preserving the API's ascending-time order.
  const groups = [];
  const byDay = new Map();
  for (const m of meetings) {
    const k = dayKey(m.scheduledAt);
    if (!byDay.has(k)) { byDay.set(k, []); groups.push(k); }
    byDay.get(k).push(m);
  }

  return (
    <div className="mt-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-medium text-muted">Next</span>
        {[7, 21, 60].map((d) => (
          <button key={d} type="button" onClick={() => setDays(d)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${days === d ? "bg-primary text-white" : "border border-hairline text-ink hover:bg-page"}`}>
            {d} days
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-8 text-sm text-muted">Loading…</div>
      ) : tableMissing ? (
        <div className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Meeting scheduling isn&apos;t live yet — migration 185 needs to be applied.
        </div>
      ) : meetings.length === 0 ? (
        <div className="rounded-card border border-hairline bg-surface px-4 py-10 text-center text-sm text-muted">
          No meetings scheduled in the next {days} days.
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((day) => (
            <div key={day}>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{day}</p>
              <div className="space-y-2">
                {byDay.get(day).map((m) => (
                  <button key={m.id} type="button" onClick={() => onOpen?.(m.leadId)}
                    className="flex w-full items-center gap-3 rounded-card border border-hairline bg-surface px-4 py-3 text-left transition hover:bg-page">
                    <div className="w-16 shrink-0 text-sm font-semibold text-ink">{timeLabel(m.scheduledAt)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {MEETING_TYPE_LABELS[m.meetingType] || "Meeting"} · {leadName(m.leads)}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {m.location || "—"}
                        {m.durationMins ? ` · ${m.durationMins} min` : ""}
                        {m.bookingSource === "manual" ? " · Hub record" : ""}
                      </p>
                    </div>
                    {m.status === "rescheduled" && (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Rescheduled</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
