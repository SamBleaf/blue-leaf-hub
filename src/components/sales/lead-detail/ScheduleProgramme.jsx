/**
 * ScheduleProgramme — SC-1 preview. Shows the canonical build programme derived from the estimate's
 * SCHED lines + the buffer scheme (time-based, weeks/months from site start). This is the data that
 * will render into the fee proposal's "Process and Timeline" page (SC-2, behind a sign-off gate).
 * Internal view — the buffers ("under-promise") are visible to staff here, never to the client.
 */
import { useEffect, useState } from "react";
import { apiFetch, apiPost } from "../../../lib/apiFetch.js";

export default function ScheduleProgramme({ lead }) {
  const [state, setState] = useState({ loading: true });
  const [busy, setBusy] = useState(false);
  const load = () => apiFetch(`/api/sales/leads/${lead.id}/schedule`).then(({ data }) => {
    setState({ loading: false, schedule: data?.schedule || null, hasEstimate: !!data?.hasEstimate, buffers: data?.buffers, signedOffAt: data?.signedOffAt || null });
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [lead.id]);

  async function signOff(revoke) {
    setBusy(true);
    await apiPost(`/api/sales/leads/${lead.id}/schedule/sign-off`, revoke ? { revoke: true } : {});
    await load();
    setBusy(false);
  }

  const { loading, schedule, hasEstimate, buffers, signedOffAt } = state;
  const maxWeek = schedule ? Math.max(...schedule.stages.map((s) => s.endWeek), 1) : 1;

  return (
    <div className="rounded-card border border-hairline bg-surface p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="section-label">Construction programme <span className="text-[10px] font-normal text-muted">(draft — from the estimate)</span></h3>
        {schedule && <span className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[11px] font-semibold">≈ {schedule.totalMonths} months</span>}
      </div>

      {loading && <p className="text-xs text-muted">Loading…</p>}

      {!loading && !schedule && (
        <p className="text-xs text-muted">
          {hasEstimate
            ? "No SCHED line items found in the estimate yet — add duration (SCHED) lines in Buildxact, then the programme builds automatically."
            : "No estimate linked yet — upload the Buildxact estimate, then the programme is derived from its SCHED lines."}
        </p>
      )}

      {!loading && schedule && (
        <>
          <div className="space-y-1.5">
            {schedule.stages.map((s) => (
              <div key={s.key} className="flex items-center gap-2">
                <span className="w-40 shrink-0 text-[11px] text-ink truncate">{s.label}</span>
                <div className="flex-1 h-4 rounded bg-page relative overflow-hidden">
                  <div className="absolute inset-y-0 rounded bg-primary/70"
                    style={{ left: `${((s.startWeek - 1) / maxWeek) * 100}%`, width: `${(s.weeks / maxWeek) * 100}%` }} />
                </div>
                <span className="w-16 shrink-0 text-right text-[10px] text-muted tabular-nums">{s.weeks}w</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[10px] text-muted">
            <span>Weeks from site start · {schedule.taskCount} SCHED line{schedule.taskCount === 1 ? "" : "s"}</span>
            <span>
              base {schedule.baseWeeks}w → <b className="text-ink">{schedule.totalWeeks}w</b> with buffers
              {buffers ? ` (stage +${Math.round(buffers.per_stage_pct * 100)}% · programme +${Math.round(buffers.programme_pct * 100)}% · +${buffers.calendar_weeks}w calendar)` : ""}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 pt-2 border-t border-hairline">
            <a href={`/api/sales/leads/${lead.id}/schedule/gantt.svg`} target="_blank" rel="noreferrer"
              className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-primary hover:bg-page">Preview client page ↗</a>
            {signedOffAt ? (
              <>
                <span className="text-[11px] font-semibold text-green-700">✓ Signed off</span>
                <button type="button" onClick={() => signOff(true)} disabled={busy} className="text-[11px] text-muted hover:text-red-600 underline underline-offset-2 disabled:opacity-50">revoke</button>
              </>
            ) : (
              <button type="button" onClick={() => signOff(false)} disabled={busy}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {busy ? "…" : "Sign off programme"}
              </button>
            )}
          </div>
          <p className="mt-2 text-[10px] text-muted">Buffers are internal — the client sees only the final rounded programme. It must be signed off before it renders into a client document.</p>
        </>
      )}
    </div>
  );
}
