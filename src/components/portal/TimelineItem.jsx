import { formatPortalDate } from "../../lib/portalUtils.js";

export default function TimelineItem({ milestone, isAchieved, isNext, index, total }) {
  return (
    <div className="flex items-start gap-4 relative">
      <div className="w-8 flex flex-col items-center">
        {isAchieved ? (
          <div className="w-3 h-3 rounded-full bg-success mt-1" />
        ) : isNext ? (
          <div className="w-4 h-4 rounded-full border-4 border-primary bg-white mt-0.5 ring-2 ring-primary ring-offset-2" />
        ) : (
          <div className="w-3 h-3 rounded-full border-2 border-gray-300 bg-white mt-1" />
        )}
        {index < total - 1 && <div className="flex-1 w-0.5 bg-gray-200 mt-1 min-h-[2rem]" />}
      </div>
      <div className="flex-1 pb-8">
        {isAchieved && (
          <>
            <p className="text-ink font-medium text-sm">{milestone.label}</p>
            <p className="text-xs text-muted">{formatPortalDate(milestone.achievedAt)}</p>
          </>
        )}
        {isNext && (
          <>
            <p className="text-primary font-semibold text-sm">→ {milestone.label}</p>
            {milestone.eta && (
              <p className="text-sm text-muted mt-0.5">ETA: {formatPortalDate(milestone.eta)}</p>
            )}
            {milestone.description && (
              <p className="italic text-sm text-muted mt-2">{milestone.description}</p>
            )}
            {milestone.whatComesNext && (
              <div className="mt-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 text-sm text-primary">
                After this: {milestone.whatComesNext}
              </div>
            )}
          </>
        )}
        {!isAchieved && !isNext && (
          <>
            <p className="text-gray-400 text-sm">{milestone.label}</p>
            {milestone.eta && (
              <p className="text-xs text-gray-300">ETA: {formatPortalDate(milestone.eta)}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
