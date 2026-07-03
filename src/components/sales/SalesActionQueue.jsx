/**
 * SalesActionQueue — Pass 2B high-volume "Needs Action" working view.
 * Ranks active leads by urgency (overdue / due today / due soon / value / score /
 * stale stage / no contact / stage priority) and groups them into buckets so the
 * most urgent leads surface at the top without inspecting every kanban column.
 *
 * Desktop (lg+): dense table/list hybrid with global rank + bucket headers.
 * Tablet/mobile (< lg): stacked, action-first cards. No hover-only actions.
 * Behaviour reused (not changed): Open → /sales/:id, Note → quick-note modal,
 * Move → same stage-move handler (incl. Nurture / Mark Lost).
 */
import { useState } from "react";
import { displayLeadName } from "../../lib/leadUtils.js";
import {
  STAGES, formatValue, projectTypeLabel, daysInStage, daysSinceActivity,
  dueInfo, actionPriorityScore, actionBucket, ACTION_BUCKETS,
  LEAD_ACTION_TYPE_BUCKETS, isSnoozed, actionDueInfo,
} from "../../lib/salesPipeline.js";
import { RotDot, ScoreBadge, MoneyBadge, StagePill } from "./SalesBits.jsx";
import StatusBadge from "../ui/StatusBadge.jsx";
import EmptyState from "../ui/EmptyState.jsx";

const DUE_VARIANT = { overdue: "danger", today: "warning", soon: "info", later: "neutral", none: "neutral" };

function DueBadge({ due }) {
  return <StatusBadge variant={DUE_VARIANT[due.status] || "neutral"}>{due.label}</StatusBadge>;
}

function QuickActions({ lead, onMoveStage, onQuickNote, onOpen, onSnooze, onMarkDone }) {
  const [moveOpen, setMoveOpen] = useState(false);
  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => onOpen(lead.id)} className="rounded border border-hairline bg-primary px-2 py-0.5 text-[11px] font-semibold text-white hover:opacity-90">Open</button>
      <button onClick={() => onQuickNote(lead)} className="rounded border border-hairline bg-page px-2 py-0.5 text-[11px] font-medium text-ink hover:bg-surface">Note</button>
      {onMarkDone && lead.action_type && (
        <button onClick={() => onMarkDone(lead)} className="rounded border border-hairline bg-accent px-2 py-0.5 text-[11px] font-semibold text-white hover:opacity-90" title="Mark action done">Done</button>
      )}
      {onSnooze && (
        <button onClick={() => onSnooze(lead)} className="rounded border border-hairline bg-page px-2 py-0.5 text-[11px] font-medium text-ink hover:bg-surface" title="Snooze 7 days">Snooze</button>
      )}
      <div className="relative">
        <button onClick={() => setMoveOpen((v) => !v)} className="rounded border border-hairline bg-page px-2 py-0.5 text-[11px] font-medium text-ink hover:bg-surface">Move ▾</button>
        {moveOpen && (
          <div className="absolute right-0 top-7 z-30 w-40 rounded-lg border border-hairline bg-surface py-1 shadow-lg">
            {STAGES.filter((s) => s.id !== lead.stage).map((s) => (
              <button key={s.id} className="block w-full px-3 py-1.5 text-left text-xs text-ink hover:bg-page" onClick={() => { setMoveOpen(false); onMoveStage(lead, s.id); }}>{s.label}</button>
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

export default function SalesActionQueue({ leads = [], loading, onMoveStage, onQuickNote, onOpen, onSnooze, onMarkDone, mode = "urgency" }) {
  if (loading) {
    return <div className="mt-2 space-y-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-surface" />)}</div>;
  }
  if (!leads.length) {
    return <EmptyState title="You're all caught up" hint="No active leads need attention right now. New actions will appear here as they fall due." />;
  }

  // "actionType" mode: group by the explicit driven action_type (what kind of action is owed),
  // sorted by action_due_at, snoozed leads hidden. "urgency" mode (default) is unchanged.
  const visible = mode === "actionType" ? leads.filter((l) => !isSnoozed(l)) : leads;
  const buckets = mode === "actionType" ? LEAD_ACTION_TYPE_BUCKETS : ACTION_BUCKETS;
  const bucketOf = mode === "actionType" ? (l) => l.action_type : actionBucket;
  const dueOf = mode === "actionType" ? actionDueInfo : dueInfo;
  const scoreOf = mode === "actionType"
    ? (l) => -(l.action_due_at ? new Date(l.action_due_at).getTime() : Infinity) // soonest due first
    : actionPriorityScore;

  const ranked = visible
    .map((lead) => ({ lead, score: scoreOf(lead), bucket: bucketOf(lead), due: dueOf(lead) }))
    .filter((x) => mode !== "actionType" || x.bucket) // actionType mode: skip leads with no action_type set
    .sort((a, b) => b.score - a.score)
    .map((x, i) => ({ ...x, rank: i + 1 }));

  const grouped = buckets
    .map((b) => ({ ...b, items: ranked.filter((x) => x.bucket === b.id) }))
    .filter((g) => g.items.length);

  return (
    <div>
      {/* DESKTOP: dense table/list hybrid */}
      <div className="hidden overflow-hidden rounded-card border border-hairline bg-surface lg:block">
        <table className="w-full text-sm">
          <thead className="border-b border-hairline bg-page text-left">
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              <th className="w-10 px-3 py-2.5">#</th>
              <th className="px-3 py-2.5">Lead</th>
              <th className="px-3 py-2.5">Stage</th>
              <th className="px-3 py-2.5">Value</th>
              <th className="px-3 py-2.5">Score</th>
              <th className="px-3 py-2.5">Next action</th>
              <th className="px-3 py-2.5">Idle</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          {grouped.map((g) => (
            <tbody key={g.id} className="divide-y divide-hairline">
              <tr>
                <td colSpan={8} className="bg-page/70 px-3 py-1.5">
                  <span className="inline-flex items-center gap-2">
                    <StatusBadge variant={g.variant} dot>{g.label}</StatusBadge>
                    <span className="text-[11px] text-muted">{g.items.length}</span>
                  </span>
                </td>
              </tr>
              {g.items.map(({ lead, rank, due }) => (
                <tr key={lead.id} className="cursor-pointer transition-colors hover:bg-page" onClick={() => onOpen(lead.id)}>
                  <td className="px-3 py-2.5 text-xs font-semibold text-muted">{rank}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <RotDot lead={lead} />
                      <span className="font-medium text-ink">{displayLeadName(lead)}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      {[lead.suburb, lead.project_type && projectTypeLabel(lead.project_type), (lead.owner_name || lead.owner) && `Owner: ${lead.owner_name || lead.owner}`].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </td>
                  <td className="px-3 py-2.5"><StagePill stageId={lead.stage} /></td>
                  <td className="px-3 py-2.5">{formatValue(lead.estimated_value) ? <MoneyBadge value={lead.estimated_value} /> : <span className="text-muted">—</span>}</td>
                  <td className="px-3 py-2.5"><ScoreBadge score={lead.qualify_score} /></td>
                  <td className="px-3 py-2.5">
                    <div className="text-xs text-ink">{lead.next_action || (due.status !== "none" ? "Follow up" : <span className="text-muted">No action set</span>)}</div>
                    <div className="mt-0.5"><DueBadge due={due} /></div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted">{daysSinceActivity(lead)}d</td>
                  <td className="px-3 py-2.5 text-right"><QuickActions lead={lead} onMoveStage={onMoveStage} onQuickNote={onQuickNote} onOpen={onOpen} onSnooze={onSnooze} onMarkDone={onMarkDone} /></td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      {/* TABLET + MOBILE: stacked, action-first cards */}
      <div className="space-y-4 lg:hidden">
        {grouped.map((g) => (
          <div key={g.id}>
            <div className="mb-1.5 flex items-center gap-2">
              <StatusBadge variant={g.variant} dot>{g.label}</StatusBadge>
              <span className="text-[11px] text-muted">{g.items.length}</span>
            </div>
            <div className="space-y-2">
              {g.items.map(({ lead, rank, due }) => (
                <div key={lead.id} className="cursor-pointer rounded-lg border border-hairline bg-surface p-3 shadow-sm" onClick={() => onOpen(lead.id)}>
                  <div className="flex items-center justify-between gap-2">
                    <DueBadge due={due} />
                    <span className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-muted">#{rank}</span>
                      <ScoreBadge score={lead.qualify_score} />
                    </span>
                  </div>
                  <div className="mt-1.5 text-sm font-medium text-ink">{lead.next_action || (due.status !== "none" ? "Follow up" : "No next action set")}</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <RotDot lead={lead} />
                    <span className="truncate text-sm font-semibold text-ink">{displayLeadName(lead)}</span>
                    <StagePill stageId={lead.stage} />
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {[lead.suburb, lead.project_type && projectTypeLabel(lead.project_type), formatValue(lead.estimated_value), `${daysSinceActivity(lead)}d idle`, daysInStage(lead) + "d in stage"].filter(Boolean).join(" · ")}
                  </div>
                  {(lead.owner_name || lead.owner) && <div className="mt-0.5 text-[11px] text-muted">Owner: {lead.owner_name || lead.owner}</div>}
                  <div className="mt-2"><QuickActions lead={lead} onMoveStage={onMoveStage} onQuickNote={onQuickNote} onOpen={onOpen} onSnooze={onSnooze} onMarkDone={onMarkDone} /></div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
