import { useState } from "react";
import { getPortalLiveSite } from "../../lib/portalApi.js";
import { formatPortalDate } from "../../lib/portalUtils.js";
import { usePortalData } from "../../hooks/usePortalData.js";
import { usePortal } from "./portalContext.js";
import PortalPageSkeleton from "../../components/portal/PortalPageSkeleton.jsx";
import PortalEmptyState from "../../components/portal/PortalEmptyState.jsx";
import WeeklyUpdateCard from "../../components/portal/WeeklyUpdateCard.jsx";

export default function PortalLiveSite() {
  const { token } = usePortal();
  const { data, loading, error } = usePortalData(() => getPortalLiveSite(token), [token]);
  const [expandedId, setExpandedId] = useState(null);

  if (loading) return <PortalPageSkeleton />;
  if (error) return <PortalEmptyState title="Could not load" message={error.message} />;

  const log = data.activityLog || [];
  const skipFirst = data.weekUpdate?.id === log[0]?.id;

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 pb-24 md:pb-8">
      {data.weekUpdate ? (
        <WeeklyUpdateCard update={data.weekUpdate} photos={data.weekUpdate.photos || []} token={token} />
      ) : (
        <PortalEmptyState title="No updates yet" message="Sam will post the first update soon." />
      )}

      {log.length > 0 && (
        <section className="mt-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">
            Previous updates
          </p>
          {(skipFirst ? log.slice(1) : log).map((u) => (
            <div key={u.id} className="border-b border-hairline py-3">
              <button
                type="button"
                className="flex w-full items-start gap-4 text-left"
                onClick={() => setExpandedId(expandedId === u.id ? null : u.id)}
              >
                <span className="text-sm text-muted w-28 shrink-0">{formatPortalDate(u.weekOf)}</span>
                <span className="text-sm text-ink flex-1">{u.headline}</span>
              </button>
              {expandedId === u.id && (
                <div className="mt-2 pl-[7.5rem] space-y-3">
                  {u.videoUrl ? (
                    <div className="rounded-2xl overflow-hidden border border-hairline">
                      <video controls className="w-full" src={u.videoUrl}>
                        <track kind="captions" />
                      </video>
                    </div>
                  ) : null}
                  {u.body ? (
                    <p className="text-sm text-muted leading-relaxed">{u.body}</p>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
