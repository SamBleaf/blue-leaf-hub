export default function Placeholder({
  title,
  moduleNumber,
  description,
  department = "Tender Manager"
}) {
  return (
    <div className="rounded-card border border-dashed border-hairline bg-surface p-8">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-accent">Module {moduleNumber}</span>
        <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
          {department}
        </span>
      </div>
      <h1 className="mt-2 text-2xl font-semibold text-primary">{title}</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted">{description}</p>
      <div className="mt-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-ink">
        Placeholder — this screen lives under <strong>{department}</strong> in the sidebar. Functionality ships in
        build order after the RFQ Engine.
      </div>
    </div>
  );
}
