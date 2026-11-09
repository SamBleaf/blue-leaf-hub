/**
 * LeadStageAdvance — the single stage-completion area, at the bottom of the workflow. It says what is required,
 * what is recommended, and holds the only button that moves the lead forward. The header and the mobile sticky bar
 * only point here. `gates` is the result of gateRows() in stageGates.js, the same definitions the server enforces.
 */
import { ADVANCE_TARGET } from "../../../lib/leadNextAction.js";

function GateRow({ row, recommended }) {
  const missTone = recommended ? "text-amber-700" : "text-danger";
  const missBadge = recommended ? "bg-amber-50 text-amber-700" : "bg-red-50 text-danger";
  return (
    <li className={`text-sm ${row.met ? "text-green-700" : missTone}`}>
      <div className="flex items-center gap-2">
        <span className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${row.met ? "bg-green-100 text-green-600" : missBadge}`}>
          {row.met ? "✓" : recommended ? "!" : "✗"}
        </span>
        <span className={row.met ? "" : "font-medium"}>{row.label}</span>
      </div>
      {!row.met && row.hint && <p className="ml-7 mt-0.5 text-[11px] font-normal text-muted">{row.hint}</p>}
    </li>
  );
}

function GateGroup({ title, note, rows, recommended = false }) {
  if (!rows.length) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-ink">{title}</p>
      <p className="mb-2 text-[11px] text-muted">{note}</p>
      <ul className="space-y-2">{rows.map((r) => <GateRow key={r.field} row={r} recommended={recommended} />)}</ul>
    </div>
  );
}

export default function LeadStageAdvance({ nextLabel, gates, guidance, canAdvance, advancing = false, blockedNote, onAdvance, children }) {
  return (
    <div data-next-target={ADVANCE_TARGET} className="rounded-card border border-hairline bg-surface p-4 space-y-4 transition-shadow">
      <h3 className="section-label">Move to {nextLabel}</h3>
      {guidance && <p className="text-xs leading-relaxed text-muted">{guidance}</p>}
      <GateGroup title="Required" note="The Hub won't allow this move until these are done." rows={gates.required} />
      <GateGroup title="Recommended" recommended rows={gates.recommended}
        note="This button waits for these too. A Director can skip them with Move ▾ on the pipeline board, and the skip is logged." />
      {children}
      <div>
        <button type="button" onClick={onAdvance} disabled={!canAdvance || advancing}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed">
          {advancing ? "Moving…" : `Move to ${nextLabel} →`}
        </button>
        {!canAdvance && blockedNote && <p className="mt-2 text-center text-xs text-muted">{blockedNote}</p>}
      </div>
    </div>
  );
}
