/**
 * FilterChips — controlled chip filter row. Presentational; state lives in the parent.
 * Single-select by default; `multi` toggles a Set-style multi-select (parent owns the value).
 *
 * options: [{ value, label, count? }]
 * single: value=string, onChange(value)
 * multi:  value=string[], onChange(nextArray)
 *
 * <FilterChips options={opts} value={filter} onChange={setFilter} />
 */
export default function FilterChips({ options = [], value, onChange, multi = false, className = "" }) {
  const selected = multi ? new Set(value || []) : null;
  function isOn(v) { return multi ? selected.has(v) : value === v; }
  function toggle(v) {
    if (!onChange) return;
    if (!multi) { onChange(v); return; }
    const next = new Set(selected);
    next.has(v) ? next.delete(v) : next.add(v);
    onChange([...next]);
  }
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {options.map((o) => {
        const on = isOn(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(o.value)}
            className={`focus-ring inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
              on
                ? "border-primary bg-primary/10 text-primary"
                : "border-hairline bg-surface text-muted hover:bg-page hover:text-ink"
            }`}
          >
            {o.label}
            {o.count != null ? (
              <span className={`rounded-full px-1.5 text-[10px] ${on ? "bg-primary/15 text-primary" : "bg-slate-100 text-slate-500"}`}>{o.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
