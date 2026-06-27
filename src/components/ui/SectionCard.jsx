/**
 * SectionCard — one consistent card wrapper (radius / border / surface / padding).
 * Presentational. Optional title, description, and right-aligned actions slot.
 *
 * <SectionCard title="Contact" actions={<button…/>}>…</SectionCard>
 */
export default function SectionCard({ title, desc, actions, children, className = "", bodyClassName = "" }) {
  return (
    <section className={`rounded-card border border-hairline bg-surface p-5 ${className}`}>
      {(title || actions) ? (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h2 className="text-sm font-semibold text-ink">{title}</h2> : null}
            {desc ? <p className="mt-0.5 text-xs text-muted">{desc}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
