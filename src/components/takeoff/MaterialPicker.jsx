// =============================================================================
// MaterialPicker — "Choose flashing": company standards (search), New flashing, or a
// finished-pieces material. Using a standard makes an independent FULL copy on the job (the
// server copies the exact standard revision) — later job edits never write back.
// =============================================================================
import { useEffect, useMemo, useState } from "react";
import { indicativeGirthMm, sourceReviewComplete } from "../../../shared/takeoff/index.js";
import { AsyncState, Banner, Btn } from "./ui.jsx";

export default function MaterialPicker({ api, onUseStandard, onDrawNew, onPiecesOnly, onEditStandard, onEditStandardProfile, onRetireStandard, canEditStandards, notice, onDismissNotice, reloadToken }) {
  const [presets, setPresets] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stop = false;
    setError(null);
    api.presets().then((r) => {
      if (stop) return;
      if (r.ok) setPresets(r.data.presets || []); else setError(r.error);
    });
    return () => { stop = true; };
  }, [api, attempt, reloadToken]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (presets || []).filter((p) => !t || `${p.name} ${p.spec?.colour || ""} ${p.spec?.finish || ""}`.toLowerCase().includes(t));
  }, [presets, q]);

  return (
    <div className="space-y-3">
      {notice && <Banner tone={notice.tone} action={<Btn kind="ghost" onClick={onDismissNotice}>Dismiss</Btn>}>{notice.text}</Banner>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Btn kind="primary" onClick={onDrawNew}>New flashing</Btn>
        <Btn onClick={onPiecesOnly}>Finished pieces only (no drawing)</Btn>
      </div>
      <div>
        <label htmlFor="std-search" className="mb-1 block text-xs font-medium text-muted">Company standards</label>
        <input id="std-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search standards" className="min-h-[44px] w-full rounded-lg border border-hairline px-3 text-base focus-ring" />
      </div>
      <AsyncState loading={presets === null && !error} error={error} onRetry={() => setAttempt((n) => n + 1)} empty={presets && !list.length}
        emptyText={presets?.length ? "No standards match." : "No company standards yet. Draw a flashing, then use “Save as standard”."}>
        <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-white">
          {list.map((p) => (
            <li key={p.id} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{p.name} <span className="text-[11px] text-muted">rev {p.revision}</span></p>
                <p className="truncate text-[11px] text-muted">
                  {[p.spec?.finish, p.spec?.colour, p.spec?.bmt != null ? `${p.spec.bmt} BMT` : null].filter(Boolean).join(" · ")}
                  {p.profile ? ` · girth ${Math.round(indicativeGirthMm(p.profile))} mm` : ""}
                  {sourceReviewComplete(p.sourceReview) ? " · source reviewed" : " · user-entered"}
                </p>
              </div>
              {canEditStandards && <Btn kind="ghost" onClick={() => onEditStandard(p)}>Edit</Btn>}
              {canEditStandards && p.profile && <Btn kind="ghost" onClick={() => onEditStandardProfile(p)}>Shape</Btn>}
              {canEditStandards && <Btn kind="ghost" onClick={() => onRetireStandard(p)}>Retire</Btn>}
              <Btn onClick={() => onUseStandard(p)}>Use on this job</Btn>
            </li>
          ))}
        </ul>
      </AsyncState>
    </div>
  );
}
