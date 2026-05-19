import { getPortalTimeline } from "../../lib/portalApi.js";
import { formatPortalDate, portalMediaUrl } from "../../lib/portalUtils.js";
import { usePortalData } from "../../hooks/usePortalData.js";
import { usePortal } from "./portalContext.js";
import PortalPageSkeleton from "../../components/portal/PortalPageSkeleton.jsx";
import PortalEmptyState from "../../components/portal/PortalEmptyState.jsx";
import TimelineItem from "../../components/portal/TimelineItem.jsx";
import BeforeAfterSlider from "../../components/portal/BeforeAfterSlider.jsx";

export default function PortalTimeline() {
  const { token, project } = usePortal();
  const { data, loading, error } = usePortalData(() => getPortalTimeline(token), [token]);

  if (loading) return <PortalPageSkeleton />;
  if (error) return <PortalEmptyState title="Could not load" message={error.message} />;

  const milestones = data.milestones || [];
  const firstOpen = milestones.findIndex((m) => !m.achievedAt);
  const slab = milestones.find((m) => m.key === "slab");
  const frame = milestones.find((m) => m.key === "frame");
  const slabUrl = slab?.heroPhoto?.publicUrl || (slab?.heroPhotoId && portalMediaUrl(token, slab.heroPhotoId));
  const frameUrl = frame?.heroPhoto?.publicUrl || (frame?.heroPhotoId && portalMediaUrl(token, frame.heroPhotoId));

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 pb-24 md:pb-8">
      <div className="flex justify-between items-start">
        <h1 className="text-xl font-bold text-ink">The journey of your home</h1>
        {project?.completionDateEst && (
          <p className="text-sm text-muted">Est. {formatPortalDate(project.completionDateEst)}</p>
        )}
      </div>
      <div className="flex gap-2 mt-3 mb-8">
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${data.delayDays > 0 ? "bg-warning/10 text-warning" : "bg-page text-muted"}`}>
          Delays: {data.delayDays} days
        </span>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${data.onTrack ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
          {data.onTrack ? "On track" : "Delayed"}
        </span>
      </div>
      <div className="space-y-0">
        {milestones.map((m, i) => (
          <TimelineItem
            key={m.id || m.key}
            milestone={m}
            isAchieved={!!m.achievedAt}
            isNext={i === firstOpen}
            index={i}
            total={milestones.length}
          />
        ))}
      </div>
      {slabUrl && frameUrl && (
        <section className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">
            The before & after so far
          </p>
          <BeforeAfterSlider beforeUrl={slabUrl} afterUrl={frameUrl} beforeLabel="After slab" afterLabel="Frame complete" />
        </section>
      )}
    </div>
  );
}
