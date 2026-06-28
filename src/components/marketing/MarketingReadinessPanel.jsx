import { useState } from "react";

// Marketing readiness / completion panel (Completion Batch 1).
// A lightweight, self-contained status board for the Command Centre. Static content — it
// reflects the build/verification state recorded in docs/planning, not a live health probe,
// so it makes no API calls and never implies a runtime check has passed.

const STATUS_STYLE = {
  done:    { dot: "bg-accent", pill: "bg-accent/10 text-accent", label: "Done" },
  pending: { dot: "bg-warning", pill: "bg-warning/15 text-ink", label: "Pending" },
  info:    { dot: "bg-muted", pill: "bg-page text-muted border border-hairline", label: "Info" },
};

const ITEMS = [
  { status: "done",    title: "Migration 122 applied", detail: "Applied to the main Supabase (2026-06-28)." },
  { status: "done",    title: "Live schema verified", detail: "Read-only check passed 8/8 — endpoint queries match the schema." },
  { status: "done",    title: "Legacy Studio preserved", detail: "Original prompt-first generator still available at /marketing/studio/legacy." },
  { status: "info",    title: "External integrations", detail: "Not used by marketing — no posting, email, Buildxact, Dropbox, or Gmail." },
  { status: "pending", title: "Runtime smoke", detail: "Auth gate, UI render & write flows — deferred to staging or explicit approval." },
  { status: "pending", title: "Write flows", detail: "Package · Approval · Calendar · Publish-log — pending the runtime smoke." },
  { status: "pending", title: "Merge to main", detail: "Not yet — finishing the module on marketing-run-a first." },
  { status: "pending", title: "Hardening", detail: "Pre-deploy hardening pass — pending after merge." },
];

function StatusPill({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.info;
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.pill}`}>{s.label}</span>;
}

export default function MarketingReadinessPanel() {
  const [open, setOpen] = useState(false);
  const doneCount = ITEMS.filter((i) => i.status === "done").length;

  return (
    <section className="rounded-card border border-hairline bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Module readiness</span>
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
            {doneCount}/{ITEMS.length} done
          </span>
        </span>
        <span className="text-xs font-semibold text-primary">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="border-t border-hairline px-4 py-3">
          <ul className="space-y-2">
            {ITEMS.map((it) => {
              const s = STATUS_STYLE[it.status] || STATUS_STYLE.info;
              return (
                <li key={it.title} className="flex items-start gap-3">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ink">{it.title}</p>
                      <StatusPill status={it.status} />
                    </div>
                    <p className="text-xs text-muted">{it.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[11px] text-muted">
            Reflects the recorded build &amp; verification state — not a live health probe.
          </p>
        </div>
      )}
    </section>
  );
}
