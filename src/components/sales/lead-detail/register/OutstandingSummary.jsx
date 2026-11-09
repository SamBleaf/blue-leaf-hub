/**
 * OutstandingSummary — what's still open, by where it can be dealt with, one tap from any part of the brief (Tab 27 B09, Gate 5).
 * Derived from the same outstanding rule the Register uses, so the two can't disagree. Collapsed until asked for.
 */
import { useState } from "react";
import { outstandingByPlace } from "../../../../lib/register.js";

const part = (n, one, many = `${one}s`) => (n ? `${n} ${n === 1 ? one : many}` : null);

export default function OutstandingSummary({ reg, onGo }) {
  const [open, setOpen] = useState(false);
  const places = outstandingByPlace(reg);
  if (!places.length) return null;
  const total = places.reduce((n, p) => n + p.count, 0);
  return (
    <div className="border-b border-hairline px-3 py-1 text-[11px]" data-testid="outstanding-summary">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="outstanding-toggle"
        className="focus-ring inline-flex min-h-[40px] items-center font-medium text-ink hover:underline sm:min-h-[26px]">
        {total} outstanding {open ? "▴" : "▾"}
      </button>
      {open && (
        <ul className="mb-1 space-y-1">
          {places.map((p) => (
            <li key={p.key} className="flex flex-wrap items-baseline gap-x-2">
              <button type="button" onClick={() => onGo(p)} data-testid={`outstanding-go-${p.key}`}
                className="focus-ring inline-flex min-h-[40px] items-center font-semibold text-primary hover:underline sm:min-h-[22px]">{p.label}</button>
              <span className="text-muted">{[part(p.decision, "decision"), part(p.verification, "to verify", "to verify"), part(p.action, "action")].filter(Boolean).join(" · ")}</span>
              <span className="min-w-0 flex-1 truncate text-muted">{p.titles.join(", ")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
