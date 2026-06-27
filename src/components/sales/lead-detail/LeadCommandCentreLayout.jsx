/**
 * LeadCommandCentreLayout — Pass 3A desktop command-centre shell.
 * Two zones: main workspace (left, scrolls) + a sticky right rail. Presentational —
 * receives rendered `main` and `rightRail` slots. The parent gates display
 * (`hidden lg:grid`) so this is the desktop layout; mobile uses tabs instead.
 */
export default function LeadCommandCentreLayout({ main, rightRail, className = "" }) {
  return (
    <div className={`mt-4 gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] ${className}`}>
      <div className="min-w-0 space-y-5">{main}</div>
      <div className="space-y-5 self-start lg:sticky lg:top-28">{rightRail}</div>
    </div>
  );
}
