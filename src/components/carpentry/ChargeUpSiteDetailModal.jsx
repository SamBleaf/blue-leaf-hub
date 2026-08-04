// =============================================================================
// ChargeUpSiteDetailModal — the per-site "job detail" pop-up for a BLB Charge Up site.
// A charge-up site isn't a carpentry_jobs row, so it can't use the standard job tabs; this
// gives it the job-like surface it can have: editable details + totals, then tabs —
//   • Shifts — every approved shift (date · worker · task · notes · hours · $ · photo)
//   • Tasks  — the SAME site_tasks table + endpoints as a job (lean charge-up UI)
//   • Diary  — the SAME carpentry_site_diary component a job uses
// Reuses shared primitives: KpiCard, MobileTabs, CarpentrySiteDiary, mediaUrl.
// =============================================================================
import { useEffect, useState, useCallback } from "react";
import { apiFetch, apiPatch } from "../../lib/apiFetch.js";
import { TASK_LABELS } from "../../lib/taskCategories.js";
import { mediaUrl } from "../../lib/media.js";
import KpiCard from "../ui/KpiCard.jsx";
import MobileTabs from "../ui/MobileTabs.jsx";
import CarpentrySiteDiary from "./CarpentrySiteDiary.jsx";
import ChargeUpTasksPanel from "./ChargeUpTasksPanel.jsx";
import JobPlansCard from "../JobPlansCard.jsx";

const fmt$ = (n) => (n == null ? "—" : `$${Math.round(Number(n)).toLocaleString()}`);

export default function ChargeUpSiteDetailModal({ site, showCost, canModerate = false, onClose, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("shifts");
  const [enlarged, setEnlarged] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, data, error: e } = await apiFetch(`/api/carpentry/charge-up-jobs/${site.id}/shifts`);
    setLoading(false);
    if (!ok) { setError(e || "Could not load this site."); return; }
    setError(null); setDetail(data);
  }, [site.id]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onKey = (ev) => { if (ev.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function saveField(patch) {
    setError(null);
    const { ok, error: e } = await apiPatch(`/api/carpentry/charge-up-jobs/${site.id}`, patch);
    if (!ok) { setError(e || "Update failed."); return; }
    onChanged?.();
    load();
  }

  const s = detail?.site;
  const shifts = detail?.shifts || [];
  const totals = detail?.totals;
  const mp = s?.marginPct;
  const realisedMargin = totals && totals.chargeOut > 0 && totals.cost != null
    ? Math.round(((totals.chargeOut - totals.cost) / totals.chargeOut) * 100)
    : null;
  const address = s?.address || site.address || "";

  const tabs = [
    { value: "shifts", label: "Shifts", badge: shifts.length || undefined },
    { value: "tasks", label: "Tasks" },
    { value: "diary", label: "Diary" },
    { value: "plans", label: "Plans" },
  ];

  return (
    <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-xl sm:rounded-card w-full max-w-3xl shadow-xl max-h-[92vh] overflow-y-auto">
        {/* header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-hairline sticky top-0 bg-white z-10">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">Charge-up site</p>
            <h2 className="text-lg font-semibold text-ink">{site.siteLabel}{s?.status === "archived" && <span className="ml-2 text-[10px] uppercase tracking-wide text-muted">Archived</span>}</h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none" aria-label="Close">✕</button>
        </div>

        {error && <div className="mx-5 mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}

        {loading && !detail ? (
          <p className="p-6 text-sm text-muted">Loading…</p>
        ) : (
          <div className="p-5 space-y-5">
            {/* editable details */}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-ink">Site / location</span>
                <input defaultValue={s?.siteLabel || ""} disabled={!canModerate} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s?.siteLabel) saveField({ siteLabel: v }); }}
                  className="mt-1 w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring disabled:bg-slate-50" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-ink">Address / info</span>
                <input defaultValue={s?.address || ""} disabled={!canModerate} onBlur={(e) => { if (e.target.value !== (s?.address || "")) saveField({ address: e.target.value }); }}
                  placeholder="Full address or a note the boys see" className="mt-1 w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring disabled:bg-slate-50" />
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-ink">Notes</span>
              <textarea defaultValue={s?.notes || ""} rows={2} disabled={!canModerate} onBlur={(e) => { if (e.target.value !== (s?.notes || "")) saveField({ notes: e.target.value }); }}
                placeholder="Anything worth recording about this site" className="mt-1 w-full border border-hairline rounded-lg px-3 py-2 text-sm resize-none focus-ring disabled:bg-slate-50" />
            </label>

            {/* totals */}
            {totals && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <KpiCard label="Hours" value={totals.hours} />
                  <KpiCard label="Charge-out" value={fmt$(totals.chargeOut)} />
                  {showCost && <KpiCard label="Margin" value={realisedMargin != null ? `${realisedMargin}%` : "—"} tone="success" />}
                  {showCost && <KpiCard label="Cost" value={fmt$(totals.cost)} tone="muted" />}
                </div>
                {showCost && mp != null && <p className="text-[11px] text-muted -mt-2">Priced at a {Number(mp)}% target margin — edit the margin in the sites list.</p>}
              </>
            )}

            {/* tabs */}
            <MobileTabs tabs={tabs} value={tab} onChange={setTab} />

            {tab === "shifts" && (
              <div>
                {shifts.length === 0 ? (
                  <p className="text-sm text-muted">No approved shifts logged against this site yet.</p>
                ) : (
                  <div className="space-y-2">
                    {shifts.map((sh) => {
                      const photo = mediaUrl(sh);
                      return (
                        <div key={sh.entryId || `${sh.date}-${sh.employeeName}`} className="rounded-lg border border-hairline p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 text-sm flex-wrap">
                                <span className="text-muted tabular-nums">{sh.date || "—"}</span>
                                <span className="font-medium text-ink">{sh.employeeName}</span>
                                {sh.taskCategory && sh.taskCategory !== "other" && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-page text-muted">{TASK_LABELS[sh.taskCategory] || sh.taskCategory}</span>
                                )}
                              </div>
                              <p className="text-sm text-ink mt-0.5">{sh.notes || <span className="italic text-muted">Charge-up task</span>}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-sm font-semibold text-ink">{sh.hours}h</div>
                              <div className="text-xs text-muted">{fmt$(sh.chargeOut)}{showCost && sh.cost != null && <> · cost {fmt$(sh.cost)}</>}</div>
                            </div>
                          </div>
                          {photo && (
                            <button type="button" onClick={() => setEnlarged(photo)} className="mt-2 block" title="View photo">
                              <img src={photo} alt="Completed work" className="w-20 h-20 rounded-lg object-cover border border-hairline" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {tab === "tasks" && <ChargeUpTasksPanel siteId={site.id} canModerate={canModerate} />}

            {tab === "diary" && <CarpentrySiteDiary diaryBase={`/api/carpentry/charge-up-jobs/${site.id}`} address={address} />}

            {tab === "plans" && <div className="mt-3"><JobPlansCard base={`/api/charge-up/sites/${site.id}`} /></div>}
          </div>
        )}

        <div className="px-5 py-3 border-t border-hairline sticky bottom-0 bg-white flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-hairline text-sm font-medium text-muted">Close</button>
        </div>
      </div>

      {/* shift-photo lightbox */}
      {enlarged && (
        <div className="absolute inset-0 z-[10001] bg-black/80 flex items-center justify-center p-6" onClick={() => setEnlarged(null)}>
          <img src={enlarged} alt="Completed work" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
