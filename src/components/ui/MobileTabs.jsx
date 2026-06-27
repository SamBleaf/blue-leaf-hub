/**
 * MobileTabs — controlled, horizontally-scrollable tab row for compact (mobile)
 * detail layouts. Presentational; state lives in the parent. Renders only the tab
 * STRIP — the parent renders the active panel.
 *
 * tabs: [{ value, label, badge? }]
 * <MobileTabs tabs={tabs} value={tab} onChange={setTab} />
 */
export default function MobileTabs({ tabs = [], value, onChange, className = "" }) {
  return (
    <div role="tablist" className={`flex gap-1 overflow-x-auto rounded-lg bg-page p-1 ${className}`}>
      {tabs.map((t) => {
        const on = value === t.value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={on}
            type="button"
            onClick={() => onChange && onChange(t.value)}
            className={`focus-ring flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition ${
              on ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            {t.label}
            {t.badge != null ? (
              <span className={`rounded-full px-1.5 text-[10px] ${on ? "bg-primary/10 text-primary" : "bg-slate-200 text-slate-600"}`}>{t.badge}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
