/**
 * EngagementPathwayCard — records that the client already has completed plans (Sales blueprint Tab 11).
 * Concept and PTSA then don't apply. Discovery, Consultants and Tender readiness and the signed-contract gate at Won stay.
 * The rule lives in stageGates.js. Only a director can change it, with a note, and it can be undone the same way.
 */
import { useState } from "react";
import { apiPost } from "../../../lib/apiFetch.js";
import { resolveEngagementPathway } from "../../../lib/stageGates.js";

const fmt = (d) => new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

export default function EngagementPathwayCard({ lead, canManage, reload }) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const supplied = resolveEngagementPathway(lead) === "plans_supplied";

  async function save() {
    setBusy(true); setError(null);
    const r = await apiPost(`/api/sales/leads/${lead.id}/plans-supplied`, { supplied: !supplied, note });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setEditing(false); setNote(""); reload?.();
  }
  if (!supplied && !canManage) return null;

  const form = editing && (
    <div className="mt-2 space-y-1.5">
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} data-testid="plans-supplied-note"
        placeholder={supplied ? "Why the design stages apply again…" : "What was supplied, by whom, and which revision…"} aria-label="Note" className="w-full rounded-lg border border-hairline px-2 py-1.5 text-xs" />
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={busy} data-testid="plans-supplied-save" className="focus-ring inline-flex min-h-[40px] items-center rounded-lg bg-primary px-3 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40 sm:min-h-[30px]">{supplied ? "Put the design stages back" : "Record plans supplied"}</button>
        <button type="button" onClick={() => { setEditing(false); setError(null); }} className="focus-ring inline-flex min-h-[40px] items-center rounded-lg border border-hairline px-3 text-xs text-ink sm:min-h-[30px]">Cancel</button>
      </div>
    </div>
  );

  if (supplied) {
    return (
      <div className="mb-3 rounded-lg border border-primary/30 bg-primary/[0.04] p-3 text-xs" data-testid="pathway-plans-supplied">
        <p className="font-semibold text-primary">Plans supplied by the client</p>
        <p className="mt-0.5 text-ink">{lead.plans_supplied_note} <span className="text-muted">Recorded {fmt(lead.plans_supplied_at)}.</span></p>
        <p className="mt-1 text-ink">Concept and PTSA / Plans don&apos;t apply to this lead, so they aren&apos;t in its stages. Discovery, Tender readiness and a signed contract still do.</p>
        <p className="mt-1 font-medium text-amber-800">Any pre-construction service Blue Leaf does perform still has to be separately agreed.</p>
        {canManage && !editing && <button type="button" onClick={() => setEditing(true)} className="mt-1 inline-flex min-h-[40px] items-center text-[11px] font-medium text-primary hover:underline sm:min-h-0" data-testid="plans-supplied-undo">Change this</button>}
        {form}
      </div>
    );
  }
  return (
    <div className="mb-3 rounded-lg border border-dashed border-hairline p-3 text-xs" data-testid="pathway-prompt">
      <span className="text-muted">Client already has completed plans? </span>
      {!editing && <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-[40px] items-center font-semibold text-primary hover:underline sm:min-h-0" data-testid="plans-supplied-open">Record plans supplied</button>}
      {form}
    </div>
  );
}
