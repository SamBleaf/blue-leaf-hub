/**
 * SalesLeadCard — compact pipeline lead card (Pass 2 redesign).
 * Behaviour preserved from the original LeadCard: click opens the lead, hover reveals
 * Note + Move on desktop; on touch (< lg) the actions are always visible (no hover-only).
 * Move targets = all other stages + Nurture + Mark Lost (unchanged).
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { resolveEngagementPathway, stageApplies } from "../../lib/stageGates.js";
import { displayLeadName } from "../../lib/leadUtils.js";
import { STAGES, daysInStage, projectTypeLabel } from "../../lib/salesPipeline.js";
import { RotDot, ScoreBadge, MoneyBadge } from "./SalesBits.jsx";
import { APPROVAL_RISK, APPROVAL_RISK_COLORS } from "../../lib/constants.js";

const MENU_WIDTH = 176;
const MENU_MAX_HEIGHT = 340;

/** The stage menu sits on the page, above the board, so a column's scroll area can't clip it. */
function CardActions({ lead, onMoveStage, onQuickNote }) {
  const [menuAt, setMenuAt] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const close = () => setMenuAt(null);
  useEffect(() => {
    if (!menuAt) return undefined;
    const shut = () => setMenuAt(null);
    const onKey = (e) => { if (e.key === "Escape") shut(); };
    document.addEventListener("mousedown", shut);
    document.addEventListener("keydown", onKey);
    const onScroll = (e) => { if (!menuRef.current?.contains(e.target)) shut(); };
    window.addEventListener("resize", shut);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", shut);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", shut);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [menuAt]);
  function toggle() {
    if (menuAt) return close();
    const r = buttonRef.current.getBoundingClientRect();
    const roomBelow = window.innerHeight - r.bottom;
    const height = Math.min(MENU_MAX_HEIGHT, Math.max(roomBelow, r.top) - 16);
    setMenuAt({ left: Math.max(8, r.right - MENU_WIDTH), height, ...(roomBelow >= r.top ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }) });
  }
  const pick = (stage) => { close(); onMoveStage(lead, stage); };
  // Only the stages this lead can actually go to: a plans-supplied lead has no Concept or PTSA.
  const stages = STAGES.filter((s) => s.id !== lead.stage && (resolveEngagementPathway(lead) !== "plans_supplied" || stageApplies(s.id, lead)));
  const item = "block w-full px-3 py-2 text-left text-xs hover:bg-page lg:py-1.5";
  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => onQuickNote(lead)}
        className="rounded border border-hairline bg-page px-2 py-0.5 text-[11px] font-medium text-ink hover:bg-surface"
      >
        Note
      </button>
      <button
        ref={buttonRef}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={toggle}
        aria-expanded={!!menuAt}
        className="rounded border border-hairline bg-page px-2 py-0.5 text-[11px] font-medium text-ink hover:bg-surface"
      >
        Move ▾
      </button>
      {menuAt && createPortal(
        <div ref={menuRef} role="menu" data-testid="board-move-menu" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
          style={{ position: "fixed", width: MENU_WIDTH, left: menuAt.left, top: menuAt.top, bottom: menuAt.bottom, maxHeight: menuAt.height }}
          className="z-50 overflow-y-auto rounded-lg border border-hairline bg-surface py-1 shadow-lg">
          {stages.map((s) => <button key={s.id} role="menuitem" className={`${item} text-ink`} onClick={() => pick(s.id)}>{s.label}</button>)}
          <div className="mt-1 border-t border-hairline pt-1">
            <button role="menuitem" className={`${item} text-muted`} onClick={() => pick("nurture")}>→ Nurture</button>
            <button role="menuitem" className={`${item} text-red-500`} onClick={() => pick("lost")}>Mark Lost</button>
          </div>
        </div>,
        document.body,
      )}
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
