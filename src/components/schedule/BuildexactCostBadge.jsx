export default function BuildexactCostBadge({ match, amount }) {
  const hasMatch = Boolean(match);
  const value = amount == null || amount === "" ? null : Number(amount);
  return (
    <span className="inline-flex items-center gap-1">
      {value != null && Number.isFinite(value) ? <span>${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span> : <span className="text-muted">-</span>}
      {hasMatch ? (
        <span
          className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary"
          title={`${match.description || "Buildexact line"}${match.score ? ` (${match.score}% match)` : ""}`}
        >
          BX
        </span>
      ) : null}
    </span>
  );
}
