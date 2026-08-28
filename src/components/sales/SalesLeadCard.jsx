/**
 * SalesLeadCard — compact pipeline lead card (Pass 2 redesign).
 * Behaviour preserved from the original LeadCard: click opens the lead, hover reveals
 * Note + Move on desktop; on touch (< lg) the actions are always visible (no hover-only).
 * Move targets = all other stages + Nurture + Mark Lost (unchanged).
 */
import { useState } from "react";
import { displayLeadName } from "../../lib/leadUtils.js";
import { STAGES, daysInStage, projectTypeLabel } from "../../lib/salesPipeline.js";
import { RotDot, ScoreBadge, MoneyBadge } from "./SalesBits.jsx";
import { APPROVAL_RISK, APPROVAL_RISK_COLORS } from "../../lib/constants.js";

function CardActions({ lead, onMoveStage, onQuickNote }) {
  const [moveOpen, setMoveOpen] = useState(false);
  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => onQuickNote(lead)}
        className="rounded border border-hairline bg-page px-2 py-0.5 text-[11px] font-medium text-ink hover:bg-surface"
      >
        Note
      </button>
      <div className="relative">
        <button
          onClick={() => setMoveOpen((v) => !v)}
          className="rounded border border-hairline bg-page px-2 py-0.5 text-[11px] font-medium text-ink hover:bg-surface"
        >
          Move ▾
        </button>
        {moveOpen && (
          <div className="absolute bottom-7 right-0 z-30 w-40 rounded-lg border border-hairline bg-surface py-1 shadow-lg">
            {STAGES.filter((s) => s.id !== lead.stage).map((s) => (
              <button key={s.id} className="block w-full px-3 py-1.5 text-left text-xs text-ink hover:bg-page" onClick={() => { setMoveOpen(false); onMoveStage(lead, s.id); }}>
                {s.label}
              </button>
            ))}
            <div className="mt-1 border-t border-hairline pt-1">
              <button className="block w-full px-3 py-1.5 text-left text-xs text-muted hover:bg-page" onClick={() => { setMoveOpen(false); onMoveStage(lead, "nurture"); }}>→ Nurture</button>
              <button className="block w-full px-3 py-1.5 text-left text-xs text-red-500 hover:bg-page" onClick={() => { setMoveOpen(false); onMoveStage(lead, "lost"); }}>Mark Lost</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SalesLeadCard({ lead, onMoveStage, onQuickNote, onClick }) {
  const days = daysInStage(lead);
  const dueDate = lead.next_action_date ? new Date(lead.next_action_date) : null;
  const validDue = dueDate && !isNaN(dueDate);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const overdueDue = validDue && dueDate < todayStart;
  const meta = [lead.suburb, lead.project_type && projectTypeLabel(lead.project_type)].filter(Boolean).join(" · ");
  const owner = lead.owner_name || lead.owner || null;

  return (
    <div
      className="group relative cursor-pointer rounded-lg border border-hairline bg-surface p-3 shadow-sm transition hover:border-primary/40 hover:shadow-md"
      style={lead.lead_type === "architect_tender" ? { borderTopColor: "#0d9488", borderTopWidth: 3 } : undefined}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <RotDot lead={lead} />
          <span className="truncate text-sm font-semibold text-ink">{displayLeadName(lead)}</span>
        </div>
        <ScoreBadge score={lead.qualify_score} />
      </div>

      {meta && <div className="mt-0.5 truncate text-xs text-muted">{meta}</div>}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {lead.lead_type === "architect_tender" && (
          <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: "#0d948815", color: "#0d9488", border: "1px solid #0d948835" }}>
            Arch Tender
          </span>
        )}
        <MoneyBadge value={lead.estimated_value} />
        {lead.stage === "consultants" && ["medium", "high"].includes(lead.approval_risk) && (
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${APPROVAL_RISK_COLORS[lead.approval_risk]}`}>
            {APPROVAL_RISK[lead.approval_risk]} approval risk
          </span>
        )}
        <span className="ml-auto text-[11px] text-muted">{days}d in stage</span>
      </div>

      {(lead.next_action || validDue) && (
        <div className={`mt-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium ${overdueDue ? "bg-red-50 text-red-700" : "bg-primary/5 text-primary"}`}>
          <span>→</span>
          <span className="truncate">{lead.next_action || "Follow up"}</span>
          {validDue && <span className="ml-auto shrink-0 opacity-80">{dueDate.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</span>}
        </div>
      )}

      {owner && <div className="mt-1.5 text-[11px] text-muted">Owner: {owner}</div>}

      {/* Desktop: hover-reveal overlay (kanban). */}
      <div className="absolute bottom-2 right-2 hidden opacity-0 transition-opacity group-hover:opacity-100 lg:block">
        <CardActions lead={lead} onMoveStage={onMoveStage} onQuickNote={onQuickNote} />
      </div>
      {/* Touch (< lg): always-visible actions row (no hover-only). */}
      <div className="mt-2 flex lg:hidden">
        <CardActions lead={lead} onMoveStage={onMoveStage} onQuickNote={onQuickNote} />
      </div>
    </div>
  );
}
