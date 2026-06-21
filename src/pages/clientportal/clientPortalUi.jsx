/* eslint-disable react-refresh/only-export-components */
/**
 * Shared presentational helpers for the Client Portal v2.0 pages.
 * Keeps the 7 pages DRY and on-brand (tokens: rounded-2xl, border-hairline,
 * bg-surface, text-ink/muted, primary). No business logic here.
 * (Mixed component + helper exports are intentional for this shared-UI module —
 * same pattern as src/lib/*Context.jsx.)
 */

/** Editorial serif stack — high-end "quiet luxury" display type, no web-font dependency. */
export const SERIF = { fontFamily: "Georgia, 'Times New Roman', 'Hoefler Text', serif" };

const AUD = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

/** Format a number as inc-GST AUD (whole dollars). */
export function fmtAud(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return AUD.format(Number(n));
}

/** "21 Jun 2026" */
export function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(typeof d === "string" && d.length <= 10 ? `${d}T12:00:00` : d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

/** Whole days from today until a date (negative = past). */
export function daysUntil(d) {
  if (!d) return null;
  const target = new Date(`${String(d).slice(0, 10)}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

/** Traffic-light classes for a milestone confidence value. */
export function confidenceStyle(confidence) {
  switch (confidence) {
    case "delayed":
      return { dot: "bg-red-500", text: "text-red-700", chip: "bg-red-50 text-red-700", label: "Delayed" };
    case "watch":
      return { dot: "bg-amber-500", text: "text-amber-700", chip: "bg-amber-50 text-amber-700", label: "Watch" };
    default:
      return { dot: "bg-accent", text: "text-accent", chip: "bg-accent/10 text-accent", label: "On track" };
  }
}

/** Page-level loading skeleton. */
export function Loading({ label = "Loading…" }) {
  return (
    <div className="flex items-center justify-center rounded-2xl border border-hairline bg-surface/70 px-5 py-16">
      <div className="flex items-center gap-3 text-sm text-muted">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-hairline border-t-primary" />
        {label}
      </div>
    </div>
  );
}

/** Inline error box. */
export function ErrorBox({ error, onRetry }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-6 text-sm text-red-700">
      <p className="font-semibold">Something went wrong</p>
      <p className="mt-1 text-red-600">{error || "Please try again."}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

/** Friendly empty state (§0.11). */
export function Empty({ title, hint }) {
  return (
    <div className="rounded-2xl border border-dashed border-hairline bg-surface/70 px-5 py-12 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      {hint ? <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{hint}</p> : null}
    </div>
  );
}

/** Standard card wrapper. */
export function Card({ title, action, children, className = "" }) {
  return (
    <section className={`rounded-2xl border border-hairline bg-surface p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between">
          {title ? <h2 className="text-sm font-semibold text-ink">{title}</h2> : <span />}
          {action || null}
        </div>
      )}
      {children}
    </section>
  );
}

/** Page heading — clean Lato sans (Direction 2), calm and confident. */
export function PageTitle({ children, sub }) {
  return (
    <div className="pb-1">
      <h1 className="text-xl font-semibold tracking-tight text-ink">{children}</h1>
      {sub ? <p className="mt-1 text-sm leading-relaxed text-muted">{sub}</p> : null}
    </div>
  );
}
