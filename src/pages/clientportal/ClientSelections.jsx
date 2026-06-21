import { useCallback, useEffect, useMemo, useState } from "react";
import { useClientPortal } from "./clientPortalContext.js";
import { portalGet, portalPost } from "../../lib/clientPortalApi.js";
import { Loading, ErrorBox, Empty, Card, PageTitle, fmtAud, fmtDate, daysUntil } from "./clientPortalUi.jsx";

const STATUS_LABEL = {
  not_started: "Not started",
  awaiting_client: "Awaiting your decision",
  in_review: "With Blue Leaf",
  approved: "Approved",
  ordered: "Ordered",
  installed: "Installed",
  overdue: "Overdue",
};

export default function ClientSelections() {
  const ctx = useClientPortal();
  const projectId = ctx?.projectId;
  const [state, setState] = useState({ loading: true, selections: [], error: null });
  const [filter, setFilter] = useState("all");

  const load = useCallback(() => {
    if (!projectId) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    portalGet(projectId, "selections").then(({ ok, data, error }) => {
      setState({ loading: false, selections: data?.selections || [], error: ok ? null : error });
    });
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const categories = useMemo(() => {
    const set = new Set(state.selections.map((s) => s.category).filter(Boolean));
    return ["all", ...[...set]];
  }, [state.selections]);

  const shown = filter === "all" ? state.selections : state.selections.filter((s) => s.category === filter);

  if (state.loading) return <Loading label="Loading your selections…" />;
  if (state.error) return <ErrorBox error={state.error} onRetry={load} />;

  return (
    <div className="space-y-5">
      <PageTitle sub="Choose your finishes. We'll flag anything that affects cost or timing.">Selections</PageTitle>

      {state.selections.length === 0 ? (
        <Empty title="Your selections board is on the way" hint="Your selection items will appear here once Blue Leaf adds them." />
      ) : (
        <>
          {categories.length > 2 ? (
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setFilter(c)}
                  className={`min-h-[36px] rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${filter === c ? "bg-accent text-white" : "border border-hairline bg-surface text-muted hover:bg-page"}`}
                >
                  {c === "all" ? "All" : c}
                </button>
              ))}
            </div>
          ) : null}

          <div className="space-y-3">
            {shown.map((sel) => (
              <SelectionCard key={sel.id} projectId={projectId} selection={sel} onChange={load} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SelectionCard({ projectId, selection, onChange }) {
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const decided = ["approved", "ordered", "installed", "in_review"].includes(selection.status);
  const overdue = selection.status === "overdue";
  const orderBy = selection.orderByDate;
  const orderDays = daysUntil(orderBy);

  async function choose(optionId) {
    setBusy(optionId); setErr(null);
    const { ok, error } = await portalPost(projectId, `selections/${selection.id}/select`, { optionId });
    setBusy(null);
    if (!ok) { setErr(error); return; }
    onChange();
  }

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{selection.itemName}</p>
          <p className="mt-0.5 text-xs text-muted">
            {selection.roomArea ? `${selection.roomArea} · ` : ""}
            {selection.allowanceAmount != null ? `Allowance ${fmtAud(selection.allowanceAmount)}` : "No allowance set"}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${overdue ? "bg-red-50 text-red-700" : decided ? "bg-accent/10 text-accent" : "bg-amber-50 text-amber-700"}`}>
          {STATUS_LABEL[selection.status] || selection.status}
        </span>
      </div>

      {orderBy && !decided ? (
        <p className={`px-5 pb-3 text-xs ${overdue || (orderDays != null && orderDays < 0) ? "text-red-700" : (orderDays != null && orderDays <= 7) ? "text-amber-700" : "text-muted"}`}>
          Order by {fmtDate(orderBy)} to avoid a delay to the fixing stage.
        </p>
      ) : null}

      {decided ? (
        <div className="border-t border-hairline px-5 py-4 text-sm">
          <span className="text-muted">Chosen: </span>
          <span className="font-semibold text-ink">{selection.selectedProduct || "—"}</span>
          {selection.costImpact != null && selection.costImpact !== 0 ? (
            <span className={`ml-2 text-xs ${selection.costImpact > 0 ? "text-amber-700" : "text-accent"}`}>
              {selection.costImpact > 0 ? "+" : ""}{fmtAud(selection.costImpact)} vs allowance
            </span>
          ) : null}
        </div>
      ) : (
        <div className="border-t border-hairline px-5 py-4 space-y-2.5">
          {(selection.options || []).length === 0 ? (
            <p className="text-sm text-muted">Options are being prepared for this item.</p>
          ) : (
            (selection.options || []).map((opt) => {
              const over = opt.priceIncGst != null && selection.allowanceAmount != null ? Number(opt.priceIncGst) - Number(selection.allowanceAmount) : null;
              return (
                <div
                  key={opt.id}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 transition-colors ${opt.isRecommended ? "border-accent/30 bg-accent/[0.06]" : "border-hairline bg-page hover:border-hairline/80 hover:bg-page/60"}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {opt.label}{opt.productName ? ` — ${opt.productName}` : ""}
                      {opt.isRecommended ? <span className="ml-2 inline-block rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">Recommended</span> : null}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {opt.priceIncGst != null ? fmtAud(opt.priceIncGst) : "Price on request"}
                      {over != null && over > 0 ? ` · +${fmtAud(over)} over allowance` : ""}
                      {opt.leadTimeWeeks ? ` · ${opt.leadTimeWeeks} wk lead` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy === opt.id}
                    onClick={() => choose(opt.id)}
                    className="min-h-[40px] shrink-0 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {busy === opt.id ? "Saving…" : "Choose"}
                  </button>
                </div>
              );
            })
          )}
          {err ? <p className="text-xs text-red-700">{err}</p> : null}
        </div>
      )}
    </Card>
  );
}
