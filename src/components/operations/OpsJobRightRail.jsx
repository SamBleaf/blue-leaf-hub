// Operations job command-centre right rail (presentational). Curated: next action, blockers,
// key details, client update, files. Dumb — receives derived data + a primaryAction node.
import { Link } from "react-router-dom";
import SectionCard from "../ui/SectionCard.jsx";
import EmptyState from "../ui/EmptyState.jsx";

const LEVEL_CLS = {
  danger: "bg-danger/5 text-danger",
  warning: "bg-warning/5 text-warning",
  info: "bg-primary/5 text-primary",
  success: "bg-success/5 text-success",
};

function AlertRow({ a }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${LEVEL_CLS[a.level] || LEVEL_CLS.info}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold">{a.title}</p>
        {a.linkTo ? <Link to={a.linkTo} className="shrink-0 text-[11px] font-semibold underline opacity-80 focus-ring">{a.linkLabel || "View"}</Link> : null}
      </div>
      {a.detail ? <p className="mt-0.5 text-[11px] opacity-80">{a.detail}</p> : null}
    </div>
  );
}

export default function OpsJobRightRail({ nextAction, primaryAction, blockers = [], keyDetails = [], clientUpdate, files = [] }) {
  return (
    <aside className="space-y-4 self-start lg:sticky lg:top-4">
      <SectionCard className="border-primary/30 bg-primary/[0.03]">
        <div className="text-xs font-semibold uppercase tracking-wide text-primary">Do this now</div>
        <p className="mt-1 text-sm font-semibold text-ink">{nextAction?.title || "On track"}</p>
        {nextAction?.detail ? <p className="mt-0.5 text-xs text-muted">{nextAction.detail}</p> : null}
        {primaryAction ? <div className="mt-3">{primaryAction}</div> : null}
      </SectionCard>

      <SectionCard title="Blockers">
        {blockers.length ? (
          <div className="space-y-2">{blockers.map((b, i) => <AlertRow key={i} a={b} />)}</div>
        ) : (
          <EmptyState compact title="No blockers" hint="Schedule, procurement and compliance look clear." />
        )}
      </SectionCard>

      <SectionCard title="Key details">
        {keyDetails.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 py-1.5 text-sm">
            <span className="text-muted">{k}</span>
            <span className="truncate text-right font-medium text-ink">{v}</span>
          </div>
        ))}
      </SectionCard>

      <SectionCard title="Client update">
        {clientUpdate?.portalUrl ? (
          <a href={clientUpdate.portalUrl} target="_blank" rel="noreferrer" className="inline-block rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary hover:text-white focus-ring">
            View as client →
          </a>
        ) : (
          <p className="text-sm text-muted">Client portal not enabled for this project.</p>
        )}
      </SectionCard>

      {files.length ? (
        <SectionCard title="Files">
          <div className="space-y-1.5">
            {files.map((f) => (
              <a key={f.label} href={f.href} target="_blank" rel="noreferrer" className="block truncate text-sm font-semibold text-primary hover:underline focus-ring">📎 {f.label}</a>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </aside>
  );
}
