/**
 * LeadDetailHeader — Pass 3A compact sticky header.
 * Slot-based + presentational: breadcrumb (name + stage badge), lighter stepper,
 * key facts, the single next-action pointer (desktop), and secondary actions. The pointer jumps to the
 * control that needs attention; it never moves the stage. On mobile it lives in a StickyActionBar (rendered by the page).
 */
export default function LeadDetailHeader({ breadcrumb, stepper, keyFacts, primaryAction, secondaryActions }) {
  return (
    <div className="sticky top-0 z-10 -mx-4 border-b border-hairline bg-page/95 px-4 pb-3 pt-2 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-2">
        {breadcrumb}
        {secondaryActions}
      </div>
      <div className="mt-2">{stepper}</div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        {keyFacts}
        {primaryAction && (
          <button
            type="button"
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled}
            className="hidden max-w-md truncate rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 lg:block"
          >
            {primaryAction.label}
          </button>
        )}
      </div>
    </div>
  );
}
