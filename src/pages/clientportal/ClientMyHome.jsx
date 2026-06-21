import { useEffect, useState } from "react";
import { useClientPortal } from "./clientPortalContext.js";
import { portalGet } from "../../lib/clientPortalApi.js";
import { Loading, ErrorBox, Empty, Card, PageTitle, fmtDate } from "./clientPortalUi.jsx";

export default function ClientMyHome() {
  const ctx = useClientPortal();
  const projectId = ctx?.projectId;
  const [state, setState] = useState({ loading: true, finishes: [], warranties: [], error: null });

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    portalGet(projectId, "my-home").then(({ ok, data, error }) => {
      if (cancelled) return;
      setState({ loading: false, finishes: data?.finishes || [], warranties: data?.warranties || [], error: ok ? null : error });
    });
    return () => { cancelled = true; };
  }, [projectId]);

  if (state.loading) return <Loading label="Loading your home…" />;
  if (state.error) return <ErrorBox error={state.error} />;

  // Group finishes by room.
  const byRoom = {};
  for (const f of state.finishes) (byRoom[f.room || "Throughout"] ||= []).push(f);

  return (
    <div className="space-y-5">
      <PageTitle sub="Everything that went into your finished home.">My Home</PageTitle>

      {state.finishes.length === 0 && state.warranties.length === 0 ? (
        <Empty title="Your home details are being compiled" hint="Finishes, appliances and warranty information will appear here at handover." />
      ) : null}

      {Object.keys(byRoom).map((room) => (
        <Card key={room} title={room}>
          <dl className="divide-y divide-hairline">
            {byRoom[room].map((f) => (
              <div key={f.id} className="flex items-start justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                <dt className="text-muted">{f.item}</dt>
                <dd className="text-right font-medium text-ink">
                  {f.value || "—"}
                  {f.supplier ? <span className="mt-0.5 block text-xs font-normal text-muted">{f.supplier}{f.productCode ? ` · ${f.productCode}` : ""}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      ))}

      {state.warranties.length ? (
        <Card title="Warranties">
          <ul className="divide-y divide-hairline">
            {state.warranties.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                <span className="font-medium text-ink">{w.label}</span>
                <span className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
                  {w.years} yr{w.expiresDate ? ` · to ${fmtDate(w.expiresDate)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Post-handover: referral + review (APB §0.12.6) */}
      <section className="rounded-2xl border border-accent/20 bg-accent/[0.06] p-5">
        <h2 className="text-sm font-semibold text-ink">Help us tell your story</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          We’d love to share your home with future clients considering building. Would you be open to a short case study or photos?
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href="mailto:admin@blueleafbuilding.com.au?subject=Happy%20to%20share%20our%20home"
            className="inline-flex min-h-[40px] items-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            I’d love that
          </a>
          <a
            href="https://www.google.com/search?q=Blue+Leaf+Building+Adelaide+reviews"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[44px] items-center rounded-lg border border-hairline bg-surface px-4 py-2 text-sm font-semibold text-primary hover:bg-page"
          >
            Leave a Google review
          </a>
        </div>
      </section>
    </div>
  );
}
