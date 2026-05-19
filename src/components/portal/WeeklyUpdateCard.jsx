import { formatWeekOf } from "../../lib/portalUtils.js";
export default function WeeklyUpdateCard({ update, photos = [], token }) {
  if (!update) return null;
  const hero = photos.find((p) => p.isHero) || photos[0];
  const rest = photos.filter((p) => p !== hero);

  return (
    <div className="bg-surface rounded-2xl border border-hairline shadow-sm overflow-hidden">
      {update.videoUrl ? (
        <div className="rounded-t-2xl overflow-hidden border-b border-hairline">
          <video controls className="w-full" src={update.videoUrl}>
            <track kind="captions" />
          </video>
        </div>
      ) : null}
      {hero && (
        <img
          src={token ? `/api/portal/media/${hero.id}?token=${encodeURIComponent(token)}` : hero.publicUrl}
          alt=""
          className="w-full aspect-video object-cover"
        />
      )}
      <div className="p-5">
        <p className="text-xs uppercase tracking-widest text-muted mb-3">{formatWeekOf(update.weekOf)}</p>
        <h2 className="text-xl font-bold text-ink mb-2">{update.headline}</h2>
        <p className="text-base text-muted leading-relaxed mb-4 whitespace-pre-wrap">{update.body}</p>
        <p className="text-sm text-muted italic text-right">— {update.authorName}, Site Manager</p>
        {rest.length > 0 && (
          <div className="overflow-x-auto flex gap-2 mt-4 pb-1">
            {rest.map((p) => (
              <img
                key={p.id}
                src={token ? `/api/portal/media/${p.id}?token=${encodeURIComponent(token)}` : p.publicUrl}
                alt=""
                className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
