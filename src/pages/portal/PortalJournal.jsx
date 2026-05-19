import { getPortalJournal } from "../../lib/portalApi.js";
import { formatPortalDate, portalMediaUrl } from "../../lib/portalUtils.js";
import { usePortalData } from "../../hooks/usePortalData.js";
import { usePortal } from "./portalContext.js";
import PortalPageSkeleton from "../../components/portal/PortalPageSkeleton.jsx";
import PortalEmptyState from "../../components/portal/PortalEmptyState.jsx";

export default function PortalJournal() {
  const { token } = usePortal();
  const { data, loading, error } = usePortalData(() => getPortalJournal(token), [token]);

  if (loading) return <PortalPageSkeleton />;
  if (error) return <PortalEmptyState title="Could not load" message={error.message} />;

  const milestones = data.milestones || [];

  if (!milestones.length) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <PortalEmptyState
          icon="📷"
          title="Your story starts soon"
          message="Milestone moments and photos will appear here as your build progresses."
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 pb-24 md:pb-8 space-y-8">
      {milestones.map((m) => {
        const hero =
          m.heroPhoto?.publicUrl ||
          (m.photos?.[0] && portalMediaUrl(token, m.photos[0].id));
        return (
          <article key={m.id} className="bg-surface rounded-2xl border border-hairline shadow-sm overflow-hidden">
            {hero && <img src={hero} alt="" className="w-full aspect-video object-cover" />}
            <div className="p-6">
              <p className="text-xs uppercase tracking-widest text-muted mb-3">
                Milestone · {formatPortalDate(m.achievedAt)}
              </p>
              <h2 className="text-2xl font-bold text-ink mb-3">{m.label}</h2>
              {m.description && (
                <p className="text-base text-muted leading-relaxed mb-4">{m.description}</p>
              )}
              {m.photos?.length > 0 && (
                <div className="overflow-x-auto flex gap-2 pb-1">
                  {m.photos.map((p) => (
                    <img
                      key={p.id}
                      src={portalMediaUrl(token, p.id)}
                      alt=""
                      className="w-[100px] h-[100px] rounded-lg object-cover flex-shrink-0"
                    />
                  ))}
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
