/**
 * KpiCard — a single compact metric tile (label · value · optional sub/trend).
 * Presentational. `tone` tints the value text only (light, never heavy fills).
 *
 * <KpiCard label="Pipeline" value="$4.9m" sub="weighted $2.1m" tone="primary" />
 */
const TONE = {
  default: "text-ink",
  primary: "text-primary",
  success: "text-accent",
  warning: "text-amber-700",
  danger: "text-red-700",
  muted: "text-muted",
};

export default function KpiCard({ label, value, sub, tone = "default", icon, onClick, className = "" }) {
  const Wrap = onClick ? "button" : "div";
  return (
    <Wrap
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`rounded-card border border-hairline bg-surface px-4 py-3 text-left ${onClick ? "transition hover:border-primary/40 focus-ring" : ""} ${className}`}
    >
      <div className="flex items-center gap-1.5">
        {icon ? <span className="text-muted">{icon}</span> : null}
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      </div>
      <div className={`mt-1 text-xl font-bold leading-tight ${TONE[tone] || TONE.default}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-muted">{sub}</div> : null}
    </Wrap>
  );
}
