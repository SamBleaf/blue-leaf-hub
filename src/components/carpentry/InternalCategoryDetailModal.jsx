// =============================================================================
// InternalCategoryDetailModal — the per-category drill-in for a BL-INTERNAL cost
// category. Cost-only sibling of ChargeUpSiteDetailModal, deliberately trimmed to a
// SHIFTS view only (no Tasks / Diary / Plans tabs, no charge-out / margin — plan §10 /
// critique B3). Two flavours by cost source:
//   • timesheet (worked)  → ATEC / Logistics / Personal work: the list of approved shifts
//                           tagged to this category (date · worker · task · notes · hours · $).
//   • leave    (derived)  → Annual / Sick / RDO: no worker-logged shifts exist; the figures
//                           are MODELLED from the leave / RDO spine, so we show a modelled
//                           banner + the FY/quarter breakdown instead of a shift list.
// Headline totals come from the report row (authoritative, includes derived leave); the shift
// list is fetched lazily from /internal-categories/:id/shifts (worked only).
// =============================================================================
import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../../lib/apiFetch.js";
import { TASK_LABELS } from "../../lib/taskCategories.js";
import { mediaUrl } from "../../lib/media.js";
import KpiCard from "../ui/KpiCard.jsx";

const fmt$ = (n) => (n == null ? "—" : `$${Math.round(Number(n)).toLocaleString()}`);
const fmtH = (n) => (n == null ? "0" : `${Math.round((Number(n) || 0) * 10) / 10}`);

// category = the report row: { id, categoryLabel, costSource, leaveType, estimated,
//   rateMissing, hours, cost, fyTotals:[{fy,hours,cost,rateMissing}], periods:[...] }
export default function InternalCategoryDetailModal({ category, showCost, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [enlarged, setEnlarged] = useState(null);

  const isLeave = category?.costSource === "leave" || category?.estimated;

  const load = useCallback(async () => {
    if (!category?.id) { setLoading(false); return; }   // hard-deleted leave rows carry no id
    setLoading(true);
    const { ok, data, error: e } = await apiFetch(`/api/carpentry/internal-categories/${category.id}/shifts`);
    setLoading(false);
    if (!ok) { setError(e || "Could not load this category."); return; }
    setError(null); setDetail(data);
  }, [category?.id]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onKey = (ev) => { if (ev.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shifts = detail?.shifts || [];
  // Headline totals: the report row is authoritative (worked + derived leave). Fall back to the
  // shifts-endpoint totals for worked categories if the row didn't carry them.
  const hours = category?.hours != null ? category.hours : (detail?.totals?.hours ?? 0);
  const cost = category?.cost != null ? category.cost : (detail?.totals?.cost ?? null);
  const fyTotals = category?.fyTotals || [];

  return (
    <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-xl sm:rounded-card w-full max-w-3xl shadow-xl max-h-[92vh] overflow-y-auto">
        {/* header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-hairline sticky top-0 bg-white z-10">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">Internal category</p>
            <h2 className="text-lg font-semibold text-ink flex items-center gap-2 flex-wrap">
              {category?.categoryLabel || "Category"}
              {isLeave
                ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">Estimated</span>
                : <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 font-medium">Booked</span>}
              {category?.status === "archived" && <span className="text-[10px] uppercase tracking-wide text-muted">Archived</span>}
            </h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none" aria-label="Close">✕</button>
        </div>

        {error && <div className="mx-5 mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}

        {loading && !detail && category?.id ? (
          <p className="p-6 text-sm text-muted">Loading…</p>
        ) : (
          <div className="p-5 space-y-5">
            {isLeave && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                These figures are <strong>modelled</strong> from the leave &amp; RDO spine — never worker-logged, so there are no
                individual shifts. The cost is a report computation over approved leave / RDO days at the correct pay basis.
              </div>
            )}
            {category?.rateMissing && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                Some days couldn&rsquo;t be costed — a worker has no base pay rate on file. Those hours are counted but their
                cost is understated. Set the rate in the Team directory to fix the figure.
              </div>
            )}

            {/* totals */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <KpiCard label="Hours" value={fmtH(hours)} />
              {showCost && <KpiCard label="Cost" value={fmt$(cost)} tone={isLeave ? "warning" : "default"} />}
              <KpiCard label="Type" value={isLeave ? "Leave (modelled)" : "Worked (booked)"} tone="muted" />
            </div>

            {/* per-FY / quarter breakdown */}
            {fyTotals.length > 0 && (
              <div className="rounded-card border border-hairline overflow-hidden">
                <h3 className="text-sm font-semibold text-ink px-4 py-2 border-b border-hairline">By financial year</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-hairline">
                        <th className="px-4 py-2">Financial year</th>
                        <th className="px-2 py-2 text-right">Hours</th>
                        {showCost && <th className="px-4 py-2 text-right">Cost</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {fyTotals.map((f) => (
                        <tr key={f.fy} className="border-b border-hairline/60 last:border-0">
                          <td className="px-4 py-2 font-medium text-ink">FY {f.fy}</td>
                          <td className="px-2 py-2 text-right">{fmtH(f.hours)}</td>
                          {showCost && <td className="px-4 py-2 text-right text-muted">{fmt$(f.cost)}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* shift list (worked categories only) */}
            {!isLeave && (
              <div>
                <h3 className="text-sm font-semibold text-ink mb-2">Shifts</h3>
                {shifts.length === 0 ? (
                  <p className="text-sm text-muted">No approved shifts tagged to this category yet.</p>
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
                              <p className="text-sm text-ink mt-0.5">{sh.notes || <span className="italic text-muted">Internal task</span>}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-sm font-semibold text-ink">{sh.hours}h</div>
                              {showCost && sh.cost != null && <div className="text-xs text-muted">{fmt$(sh.cost)}</div>}
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
