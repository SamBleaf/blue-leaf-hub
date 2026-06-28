// Decision-first schedule lookahead / action list (presentational, review-safe).
// Replaces the squeezed Gantt on mobile and provides the desktop "focused lens" list.
// Display-only: it reuses the passed tasks + criticalIds (computeCriticalPath) — no schedule
// maths here, no mutations. Clicking a row calls onOpenTask (same TaskDetailPanel flow).
import SectionCard from "../ui/SectionCard.jsx";
import StatusBadge from "../ui/StatusBadge.jsx";
import EmptyState from "../ui/EmptyState.jsx";
import { phaseLabel } from "../../lib/scheduleUtils.js";

function taskBadge(t, today) {
  if (t.status === "complete") return { v: "success", label: "Done" };
  if (t.end_date && t.end_date < today) return { v: "danger", label: "Overdue" };
  if (t.status === "in_progress") return { v: "info", label: "In progress" };
  return { v: "neutral", label: "Planned" };
}

function TaskRow({ t, phaseLabels, today, onOpenTask }) {
  const b = taskBadge(t, today);
  return (
    <button
      type="button"
      onClick={() => onOpenTask?.(t)}
      className="flex w-full items-center gap-3 rounded-lg border border-hairline bg-surface px-3 py-2.5 text-left transition hover:border-primary/40 focus-ring"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{t.name}</p>
        <p className="truncate text-xs text-muted">
          {phaseLabel(t.phase, phaseLabels)}{t.start_date ? ` · ${t.start_date}` : ""}{t.end_date && t.end_date !== t.start_date ? `–${t.end_date}` : ""}
        </p>
      </div>
      <StatusBadge variant={b.v}>{b.label}</StatusBadge>
    </button>
  );
}

export default function ScheduleLookahead({ tasks = [], criticalIds, lens = "all", phaseLabels = {}, onOpenTask }) {
  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })();
  const critical = criticalIds instanceof Set ? criticalIds : new Set(criticalIds || []);
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
  const active = (t) => t.status !== "complete";

  const GROUPS = [
    { key: "delayed", label: "Overdue", variant: "danger", items: tasks.filter((t) => active(t) && t.end_date && t.end_date < today) },
    { key: "today", label: "Today", variant: "info", items: tasks.filter((t) => active(t) && t.start_date && t.end_date && t.start_date <= today && t.end_date >= today) },
    { key: "week", label: "This week", variant: "primary", items: tasks.filter((t) => active(t) && t.start_date && t.start_date > today && t.start_date <= weekEnd) },
    { key: "blocked", label: "Blocked", variant: "blocked", items: tasks.filter((t) => active(t) && (t.depends_on || []).some((pid) => byId[pid] && byId[pid].status !== "complete")) },
    { key: "critical", label: "Critical path", variant: "warning", items: tasks.filter((t) => active(t) && critical.has(t.id)) },
    { key: "procurement", label: "Procurement / order-by", variant: "neutral", items: tasks.filter((t) => active(t) && (t.task_type === "procurement" || t.order_by_date)) },
    { key: "milestones", label: "Upcoming milestones", variant: "stage", items: tasks.filter((t) => active(t) && (t.task_type === "milestone" || t.is_hold_point) && t.start_date >= today) },
  ];

  const shown = lens === "all" ? GROUPS.filter((g) => g.items.length) : GROUPS.filter((g) => g.key === lens);

  if (!shown.length) {
    return <EmptyState title="Nothing in this view" hint="No tasks match the selected lens." />;
  }

  return (
    <div className="space-y-4">
      {shown.map((g) => (
        <SectionCard key={g.key} title={<span className="flex items-center gap-2">{g.label}<StatusBadge variant={g.variant}>{g.items.length}</StatusBadge></span>}>
          {g.items.length ? (
            <div className="space-y-2">
              {g.items.map((t) => <TaskRow key={t.id} t={t} phaseLabels={phaseLabels} today={today} onOpenTask={onOpenTask} />)}
            </div>
          ) : (
            <EmptyState compact title={`No ${g.label.toLowerCase()} tasks`} hint="Nothing needs attention here." />
          )}
        </SectionCard>
      ))}
    </div>
  );
}
