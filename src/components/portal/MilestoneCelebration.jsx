export default function MilestoneCelebration({ milestone }) {
  if (!milestone) return null;
  const heroUrl = milestone.heroPhotoUrl || milestone.heroPhoto?.publicUrl;

  return (
    <div className="bg-surface rounded-2xl overflow-hidden border border-hairline shadow-sm">
      {heroUrl ? (
        <img src={heroUrl} alt="" className="w-full aspect-video object-cover" />
      ) : (
        <div className="w-full aspect-video bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-4xl">
          🏗️
        </div>
      )}
      <div className="p-6">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-emerald-700 bg-emerald-50 rounded-full px-3 py-1 mb-4">
          MILESTONE REACHED
        </span>
        <h2 className="text-2xl font-bold text-ink mb-3">{milestone.label}</h2>
        {milestone.description && (
          <p className="text-base text-muted leading-relaxed mb-4">{milestone.description}</p>
        )}
        {milestone.whatComesNext && (
          <p className="text-sm text-muted border-t border-hairline pt-4 mt-2">
            Next: {milestone.whatComesNext}
          </p>
        )}
      </div>
    </div>
  );
}
