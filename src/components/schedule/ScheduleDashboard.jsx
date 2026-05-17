import { calculateDashboard, phaseColor, procurementStatus } from "../../lib/scheduleUtils.js";

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-primary">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export default function ScheduleDashboard({ tasks = [], dashboard, phaseLabels = {}, analysisCards = [], dismissedCards = [], onDismissAnalysis, onOpenTask, onOrderNow }) {
  const data = dashboard || calculateDashboard(tasks, { phaseLabels });
  const visibleCards = analysisCards.filter((card) => !dismissedCards.includes(card.id));

  return (
    <div className="space-y-4">
      {visibleCards.length ? (
        <div className="grid gap-2 lg:grid-cols-3">
          {visibleCards.map((card) => (
            <div key={card.id} className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-ink">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{card.title || "Schedule insight"}</p>
                <button type="button" onClick={() => onDismissAnalysis(card.id)} className="text-muted hover:text-ink">x</button>
              </div>
              <p className="mt-1 text-xs text-muted">{card.body}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-card border border-hairline bg-page p-4">
          <h2 className="font-bold text-primary">Health</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stat label="Time" value={data.daysOffset >= 0 ? `${data.daysOffset}d ahead` : `${Math.abs(data.daysOffset)}d behind`} hint={`Planned ${data.plannedPercentByDate}% by date`} />
            <Stat label="Tasks" value={data.incomplete} hint="Remaining" />
            <Stat label="Overdue" value={data.overdue} hint="Needs attention" />
            <Stat label="Progress" value={`${data.overallPercent}%`} hint="Overall weighted" />
          </div>
          <div className="mt-3 rounded-lg border border-hairline bg-surface p-3 text-sm">
            <span className="font-semibold text-muted">Cost: </span>
            {data.cost?.hasBuildexact ? (
              <span className="text-ink">BX ${Number(data.cost.buildexactCost).toLocaleString()} / Planned ${Number(data.cost.plannedCost).toLocaleString()}</span>
            ) : (
              <span className="text-muted">No budget linked</span>
            )}
          </div>
        </section>

        <section className="rounded-card border border-hairline bg-page p-4">
          <h2 className="font-bold text-primary">Tasks</h2>
          <div className="mt-4 flex items-center gap-4">
            <div className="grid h-32 w-32 place-items-center rounded-full border-[18px] border-primary/20" style={{ borderTopColor: "#006c9b" }}>
              <span className="text-xl font-bold text-primary">{data.done}/{data.total}</span>
            </div>
            <div className="space-y-2 text-sm text-muted">
              <p><span className="font-semibold text-ink">{data.notStarted}</span> not started</p>
              <p><span className="font-semibold text-ink">{data.inProgress}</span> in progress</p>
              <p><span className="font-semibold text-ink">{data.done}</span> done</p>
            </div>
          </div>
        </section>

        <section className="rounded-card border border-hairline bg-page p-4">
          <h2 className="font-bold text-primary">Progress</h2>
          <div className="mt-3 space-y-3">
            {(data.phaseRows || []).map((row) => (
              <div key={row.phase}>
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-ink">{row.label}</span>
                  <span className="text-muted">{row.progress}%</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded bg-hairline">
                  <div className="h-full rounded" style={{ width: `${row.progress}%`, backgroundColor: row.progress > 80 ? "#16a34a" : row.progress >= 40 ? "#d97706" : "#dc2626" }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-card border border-hairline bg-page p-4">
          <h2 className="font-bold text-primary">Time</h2>
          <p className="mt-2 text-sm text-muted">Project window</p>
          <p className="mt-1 font-mono text-sm text-ink">{data.projectStart} to {data.projectEnd}</p>
          <div className="mt-4 h-3 overflow-hidden rounded bg-hairline">
            <div className="h-full rounded bg-accent" style={{ width: `${data.overallPercent}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted">Actual completion versus planned date progress.</p>
        </section>

        <section className="rounded-card border border-hairline bg-page p-4">
          <h2 className="font-bold text-primary">Procurement</h2>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {(data.procurement || []).slice(0, 8).map((task) => {
              const status = task.procurement_status || procurementStatus(task);
              const tone = status.tone === "red" ? "border-danger/40 bg-danger/10" : status.tone === "amber" ? "border-warning/40 bg-warning/10" : "border-hairline bg-surface";
              return (
                <button key={task.id} type="button" onClick={() => onOpenTask(task)} className={`w-full rounded-lg border p-2 text-left text-xs ${tone}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-ink">{task.procurement_item || task.name}</span>
                    <span className="shrink-0 text-muted">{status.label}</span>
                  </div>
                  <p className="mt-1 text-muted">Order by {status.orderBy || "not set"}</p>
                  {onOrderNow ? (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOrderNow(task);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onOrderNow(task);
                      }}
                      className="mt-2 inline-block rounded bg-primary px-2 py-1 font-semibold text-white"
                    >
                      Order now
                    </span>
                  ) : null}
                </button>
              );
            })}
            {!data.procurement?.length ? <p className="text-sm text-muted">No procurement tasks yet.</p> : null}
          </div>
        </section>

        <section className="rounded-card border border-hairline bg-page p-4">
          <h2 className="font-bold text-primary">Workload</h2>
          <div className="mt-3 space-y-2">
            {(data.workload || []).slice(0, 8).map((row) => (
              <div key={row.trade} className="rounded-lg border border-hairline bg-surface p-2 text-xs">
                <div className="flex justify-between">
                  <span className="font-semibold text-ink">{row.trade}</span>
                  <span className="text-muted">{row.hours || 0}h</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded bg-hairline">
                  <div className="h-full rounded" style={{ width: `${Math.min(100, row.count * 10)}%`, backgroundColor: phaseColor(row.trade) }} />
                </div>
                {row.overdue ? <p className="mt-1 text-danger">{row.overdue} overdue</p> : null}
              </div>
            ))}
          </div>
        </section>
      </div>

      {data.buildexactAlerts?.length ? (
        <section className="rounded-card border border-primary/20 bg-primary/5 p-4">
          <h2 className="font-bold text-primary">Buildexact alerts</h2>
          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            {data.buildexactAlerts.map((alert) => (
              <p key={alert.id} className="rounded-lg border border-hairline bg-surface p-2 text-xs text-ink">{alert.message}</p>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
