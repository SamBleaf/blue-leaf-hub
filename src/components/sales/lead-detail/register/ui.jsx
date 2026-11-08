/** Small shared presentational pieces for the Master Register (no state, no data access). */

export function Chip({ children, tone = "slate", title }) {
  const tones = {
    slate: "bg-page text-muted border-hairline",
    blue: "bg-primary/10 text-primary border-primary/20",
    green: "bg-green-50 text-green-700 border-green-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
    violet: "bg-violet-50 text-violet-700 border-violet-200",
  };
  return <span title={title} className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium leading-none ${tones[tone] || tones.slate}`}>{children}</span>;
}

export function Field({ label, hint, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted">{label}</label>
      {children}
      {hint && <p className="mt-0.5 text-[10px] text-muted">{hint}</p>}
    </div>
  );
}

export function Mini({ label, children, wide }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <label className="mb-0.5 block text-[10px] uppercase tracking-wide text-muted">{label}</label>
      {children}
    </div>
  );
}

export function Select({ value, onChange, options, placeholder, className = "", disabled, title }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} title={title} className={`inp text-[11px] ${className}`}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

export function Section({ title, count, children, defaultOpen = true, right }) {
  return (
    <details open={defaultOpen} className="group rounded-lg border border-hairline bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2">
        <span className="flex items-center gap-2 text-xs font-semibold text-ink">
          <span className="text-muted transition group-open:rotate-90">▸</span>{title}
          {count ? <span className="rounded-full bg-page px-1.5 text-[10px] font-medium text-muted">{count}</span> : null}
        </span>
        {right}
      </summary>
      <div className="space-y-2 border-t border-hairline px-3 py-2.5">{children}</div>
    </details>
  );
}
