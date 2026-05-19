import { Link } from "react-router-dom";
import { getPortalHome } from "../../lib/portalApi.js";
import { formatPortalDate } from "../../lib/portalUtils.js";
import { usePortalData } from "../../hooks/usePortalData.js";
import { usePortal } from "./portalContext.js";
import PortalPageSkeleton from "../../components/portal/PortalPageSkeleton.jsx";
import PortalEmptyState from "../../components/portal/PortalEmptyState.jsx";
import PortalHomeHero from "../../components/portal/PortalHomeHero.jsx";
import WeeklyUpdateCard from "../../components/portal/WeeklyUpdateCard.jsx";
import PhotoGrid from "../../components/portal/PhotoGrid.jsx";
import TodaySummaryCard from "../../components/portal/TodaySummaryCard.jsx";
import ConfidenceCard from "../../components/portal/ConfidenceCard.jsx";

export default function PortalHome() {
  const { token, project } = usePortal();
  const { data, loading, error } = usePortalData(() => getPortalHome(token), [token]);

  if (loading) return <PortalPageSkeleton />;
  if (error) {
    return (
      <PortalEmptyState title="Could not load" message={error.message || "Please try again."} />
    );
  }

  const pct = data.completionPercent ?? data.completionPct ?? 0;
  const scheduleStatus =
    data.scheduleStatus ||
    (pct >= 90 ? "on_track" : pct >= 70 ? "attention" : "delayed");
  const showSummary =
    data.currentPhase != null || data.daysToCompletion != null || data.nextMilestone;

  const hasWeek = Boolean(data.weekUpdate);
  const hasDecisions = (data.pendingDecisions?.length || 0) > 0;
  const hasUpcoming =
    (data.upcomingMilestones?.length || 0) > 0 || (data.upcomingSiteWalks?.length || 0) > 0;
  const hasPhotos = (data.recentPhotos?.length || 0) > 0;
  const hasFeed = hasWeek || hasDecisions || hasUpcoming || hasPhotos;

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 pb-24 md:py-8 md:pb-8">
      <PortalHomeHero
        clientName={project?.clientName}
        address={project?.address}
        percent={pct}
        completionDateEst={project?.completionDateEst}
      />

      <ConfidenceCard status={scheduleStatus} />

      {showSummary ? (
        <TodaySummaryCard
          currentPhase={data.currentPhase}
          daysToCompletion={data.daysToCompletion}
          nextMilestoneLabel={data.nextMilestone}
          scheduleStatus={scheduleStatus}
        />
      ) : null}

      {!hasFeed ? (
        <section className="mt-8 rounded-2xl border border-dashed border-hairline bg-surface/80 px-5 py-6 text-center">
          <p className="text-sm font-semibold text-ink">Your portal is live</p>
          <p className="mt-2 text-sm text-muted leading-relaxed max-w-md mx-auto">
            Sam and the team will add weekly site updates, photos, and milestones here as your build
            progresses. Check back after the next site visit.
          </p>
        </section>
      ) : null}

      {data.weekUpdate && (
        <section className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">
            This week on site
          </p>
          <WeeklyUpdateCard update={data.weekUpdate} photos={data.weekUpdate.photos || []} token={token} />
          <Link to={`/portal/${token}/live`} className="text-sm text-primary mt-2 inline-block">
            View all updates →
          </Link>
        </section>
      )}

      {data.pendingDecisions?.length > 0 && (
        <section className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">
            Your next steps
          </p>
          <div className="space-y-2">
            {data.pendingDecisions.map((d) => (
              <Link
                key={d.id}
                to={`/portal/${token}/decisions`}
                className="flex items-center gap-3 bg-surface rounded-xl border border-hairline px-4 py-3"
              >
                <span>{d.type === "selection" ? "⚡" : "📋"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{d.title}</p>
                  <p className="text-xs text-muted capitalize">{d.type}</p>
                </div>
                {d.dueDate && (
                  <span className="text-xs text-muted shrink-0">{formatPortalDate(d.dueDate)}</span>
                )}
              </Link>
            ))}
          </div>
          <Link to={`/portal/${token}/decisions`} className="text-sm text-primary mt-2 inline-block">
            View all decisions →
          </Link>
        </section>
      )}

      {(data.upcomingMilestones?.length > 0 || data.upcomingSiteWalks?.length > 0) && (
        <section className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">Upcoming</p>
          {data.upcomingMilestones?.map((m) => (
            <div key={m.id} className="flex gap-3 py-2 border-b border-hairline last:border-0">
              <span className="text-sm text-muted w-28 shrink-0">
                {m.eta ? formatPortalDate(m.eta) : "—"}
              </span>
              <span className="text-sm text-ink">{m.label}</span>
            </div>
          ))}
          {data.upcomingSiteWalks?.map((w) => (
            <div key={w.id} className="flex gap-3 py-2 border-b border-hairline last:border-0">
              <span className="text-sm text-muted w-28 shrink-0">{formatPortalDate(w.availableDate)}</span>
              <span className="text-sm text-ink">Site walk{w.confirmed ? " (confirmed)" : ""}</span>
            </div>
          ))}
        </section>
      )}

      {data.recentPhotos?.length > 0 && (
        <section className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">
            Recent photos
          </p>
          <PhotoGrid photos={data.recentPhotos} columns={4} token={token} />
          <Link to={`/portal/${token}/journal`} className="text-sm text-primary mt-2 inline-block">
            View full journal →
          </Link>
        </section>
      )}
    </div>
  );
}
