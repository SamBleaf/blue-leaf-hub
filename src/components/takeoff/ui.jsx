// =============================================================================
// Takeoff UI primitives — focused windows, bottom sheets, status chips, numeric fields.
// Phone: one focused window + a bottom sheet (no stacked modal wizards). Desktop (lg+): the
// same content with sheets docked as a right-hand panel. Minimum touch target 44 px.
// =============================================================================
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFocusMode } from "./focusMode.js";

export function FocusMode() { useFocusMode(); return null; }

/** Full-screen focused workspace (hides module nav underneath; AppShell edge swipe ignored). */
export function FocusedWindow({ title, subtitle, onClose, closeLabel = "Close", actions, children, footer }) {
  useFocusMode();
  // Portal to <body>: the AppShell content area forms its own stacking context, so a z-index
  // alone can't cover the global floating buttons / module nav.
  return createPortal(
    <div data-takeoff-focus="" className="fixed inset-0 z-[70] flex flex-col bg-page" role="dialog" aria-modal="true" aria-label={title}>
      <header className="flex items-center gap-2 border-b border-hairline bg-white px-2" style={{ paddingTop: "env(safe-area-inset-top)", minHeight: 52 }}>
        <button type="button" onClick={onClose} className="min-h-[44px] min-w-[44px] rounded-lg px-2 text-sm font-medium text-primary hover:bg-primary/5">{closeLabel}</button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-ink">{title}</h1>
          {subtitle && <p className="truncate text-[11px] text-muted">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      </header>
      <div className="relative flex min-h-0 flex-1 flex-col landscape:flex-row lg:flex-row">{children}</div>
      {footer}
    </div>,
    document.body,
  );
}

/** Bottom sheet on phone, right panel on desktop. Use inside FocusedWindow's body. */
export function Sheet({ title, children, onClose, className = "", initialFocus = true }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!initialFocus) return;
    const el = ref.current?.querySelector("input,select,textarea,button");
    el?.focus({ preventScroll: true });
  }, [initialFocus]);
  return (
    <section
      ref={ref}
      aria-label={title}
      className={`z-10 max-h-[60vh] overflow-y-auto rounded-t-2xl border-t border-hairline bg-white px-4 pb-4 pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] landscape:max-h-none landscape:w-[min(360px,42vw)] landscape:shrink-0 landscape:rounded-none landscape:border-l landscape:border-t-0 landscape:shadow-none lg:max-h-none lg:w-[360px] lg:shrink-0 lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none ${className}`}
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {onClose && <button type="button" onClick={onClose} aria-label="Close panel" className="min-h-[44px] min-w-[44px] text-xl leading-none text-muted hover:text-ink">✕</button>}
      </div>
      {children}
    </section>
  );
}

const STATUS = {
  saved: ["Saved", "bg-emerald-50 text-emerald-700 border-emerald-200"],
  saving: ["Saving…", "bg-sky-50 text-sky-700 border-sky-200"],
  unsynced: ["Not synced", "bg-amber-50 text-amber-800 border-amber-200"],
  conflict: ["Conflict", "bg-red-50 text-red-700 border-red-200"],
  error: ["Not saved", "bg-red-50 text-red-700 border-red-200"],
  // R04: held only in this device's recovery store (not on the server yet)
  local: ["On this device", "bg-slate-50 text-slate-700 border-slate-300"],
};
export function SaveChip({ status }) {
  const [label, cls] = STATUS[status] || STATUS.saved;
  return <span role="status" aria-live="polite" className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>;
}

export function Banner({ tone = "info", children, action }) {
  const cls = {
    info: "bg-sky-50 border-sky-200 text-sky-800",
    warn: "bg-amber-50 border-amber-200 text-amber-900",
    error: "bg-red-50 border-red-200 text-red-700",
    ok: "bg-emerald-50 border-emerald-200 text-emerald-800",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${cls}`}>
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

export function Btn({ kind = "secondary", className = "", ...p }) {
  const cls = {
    primary: "bg-primary text-white hover:bg-primary/90 disabled:opacity-40",
    secondary: "border border-hairline bg-white text-ink hover:bg-page disabled:opacity-40",
    danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:opacity-40",
    ghost: "text-primary hover:bg-primary/5 disabled:opacity-40",
  }[kind];
  return <button type="button" {...p} className={`min-h-[44px] rounded-lg px-3 text-sm font-medium ${cls} ${className}`} />;
}

/**
 * Direct numeric entry with a visible unit. Commits on Enter/blur (one undoable command);
 * invalid text shows an inline message and never commits.
 */
export function NumberField({ label, value, unit = "mm", onCommit, min = 0, max = Infinity, step = "any", integer = false, autoFocus = false, help, error: extError }) {
  const id = useId();
  const [text, setText] = useState(value == null ? "" : String(value));
  const [err, setErr] = useState(null);
  useEffect(() => { setText(value == null ? "" : String(value)); }, [value]);
  function commit() {
    if (text.trim() === "" && value == null) return;
    const n = Number(text.replace(/,/g, ""));
    if (!Number.isFinite(n) || n < min || (min > 0 && !integer && n <= 0) || (integer && !Number.isInteger(n))) {
      setErr(integer ? `Enter a whole number of ${min} or more.` : min > 0 ? "Enter a number greater than 0." : "Enter a number of 0 or more.");
      return;
    }
    if (n > max) { setErr(`That's more than ${max.toLocaleString("en-AU")} ${unit} — check the number.`); return; }
    setErr(null);
    if (n !== value) onCommit(n);
  }
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted">{label}</label>
      <div className="flex items-stretch rounded-lg border border-hairline bg-white focus-within:ring-2 focus-within:ring-primary">
        <input
          id={id} autoFocus={autoFocus} inputMode={integer ? "numeric" : "decimal"} step={step} value={text}
          onChange={(e) => setText(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
          aria-invalid={!!(err || extError)} aria-describedby={err || extError ? `${id}-err` : undefined}
          className="min-h-[44px] w-full min-w-0 rounded-l-lg border-0 px-3 text-base text-ink focus:ring-0"
        />
        <span className="flex items-center rounded-r-lg bg-page px-3 text-sm text-muted">{unit}</span>
      </div>
      {help && <p className="mt-1 text-[11px] text-muted">{help}</p>}
      {(err || extError) && <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-red-700">{err || extError}</p>}
    </div>
  );
}

export function TextField({ label, value, onChange, placeholder, list, autoFocus }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted">{label}</label>
      <input id={id} value={value ?? ""} placeholder={placeholder} list={list} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)}
        className="min-h-[44px] w-full rounded-lg border border-hairline px-3 text-base text-ink focus-ring" />
    </div>
  );
}

/** Loading / empty / retry / no-access block used by every async screen. */
export function AsyncState({ loading, error, code, onRetry, empty, emptyText, children }) {
  if (loading) return <p className="py-8 text-center text-sm text-muted" role="status">Loading…</p>;
  if (error) {
    const noAccess = code === "FORBIDDEN" || code === "PREVIEW";
    return (
      <div className="py-6">
        <Banner tone={noAccess ? "warn" : "error"} action={!noAccess && onRetry ? <Btn onClick={onRetry}>Try again</Btn> : null}>
          {noAccess ? "You don't have access to this." : ""} {error}
        </Banner>
      </div>
    );
  }
  if (empty) return <p className="py-8 text-center text-sm text-muted">{emptyText}</p>;
  return children;
}

