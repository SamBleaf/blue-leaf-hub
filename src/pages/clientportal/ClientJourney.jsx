import { useEffect, useState } from "react";
import { useClientPortal } from "./clientPortalContext.js";
import { portalGet } from "../../lib/clientPortalApi.js";
import { getSupabase } from "../../lib/supabaseClient.js";
import { Loading, ErrorBox, Empty, PageTitle, fmtDate, confidenceStyle } from "./clientPortalUi.jsx";

function stageStatus(stage) {
  if (stage.achievedAt) return "complete";
  if (stage.isCurrent) return "current";
  return "upcoming";
}

export default function ClientJourney() {
  const ctx = useClientPortal();
  const projectId = ctx?.projectId;
  const [state, setState] = useState({ loading: true, stages: [], error: null });
  const [open, setOpen] = useState(null);
  const [mediaToken, setMediaToken] = useState("");

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => setMediaToken(data?.session?.access_token || ""));
  }, []);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    portalGet(projectId, "journey").then(({ ok, data, error }) => {
      if (cancelled) return;
      const stages = data?.stages || [];
      setState({ loading: false, stages, error: ok ? null : error });
      setOpen(stages.find((s) => s.isCurrent)?.id ?? stages[0]?.id ?? null);
    });
    return () => { cancelled = true; };
  }, [projectId]);

  if (state.loading) return <Loading label="Loading your journey…" />;
  if (state.error) return <ErrorBox error={state.error} />;
  if (!state.stages.length) {
    return (
      <div className="space-y-5">
        <PageTitle sub="Your build, stage by stage.">Project Journey</PageTitle>
        <Empty title="Your journey is being prepared" hint="Photos and updates will appear here as each stage progresses." />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageTitle sub="Your build, stage by stage.">Project Journey</PageTitle>
      <ol className="space-y-3">
        {state.stages.map((stage) => {
          const status = stageStatus(stage);
          const conf = confidenceStyle(stage.confidence);
          const isOpen = open === stage.id;
          return (
            <li
              key={stage.id}
              className={`overflow-hidden rounded-2xl border bg-surface ${status === "current" ? "border-accent/40 ring-1 ring-accent/20" : "border-hairline"}`}
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : stage.id)}
                className="flex min-h-[40px] w-full items-center gap-3 px-5 py-4 text-left hover:bg-page/50"
              >
                <StageDot status={status} confDot={conf.dot} />
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-semibold ${status === "upcoming" ? "text-muted" : "text-ink"}`}>{stage.label}</span>
                  <span className="block text-xs text-muted">
                    {status === "complete" ? `Complete · ${fmtDate(stage.achievedAt)}` : status === "current" ? "In progress" : stage.eta ? `Upcoming · ${fmtDate(stage.eta)}` : "Upcoming"}
                  </span>
                </span>
                {status === "current" ? (
                  <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${conf.chip}`}>
                    <span className={`h-2 w-2 rounded-full ${conf.dot}`} /> {conf.label}
                  </span>
                ) : null}
              </button>

              {isOpen ? (
                <div className="space-y-4 border-t border-hairline px-5 py-4">
                  {status === "upcoming" && stage.stagePreview ? (
                    <p className="rounded-xl bg-page px-4 py-3 text-sm leading-relaxed text-ink">{stage.stagePreview}</p>
                  ) : null}

                  {(stage.updates || []).length === 0 && (stage.photos || []).length === 0 ? (
                    <p className="text-sm text-muted">No updates for this stage yet.</p>
                  ) : null}

                  {(stage.updates || []).map((u, i) => (
                    <div key={i} className="space-y-2">
                      <p className="text-xs font-semibold text-muted">{fmtDate(u.weekOf)}</p>
                      {u.headline ? <p className="text-sm font-semibold text-ink">{u.headline}</p> : null}
                      {u.body ? <p className="text-sm leading-relaxed text-muted">{u.body}</p> : null}
                      {u.builderReasoning ? (
                        <div className="rounded-xl border border-accent/15 bg-accent/[0.06] px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">Why we did it this way</p>
                          <p className="mt-1 text-sm leading-relaxed text-ink">{u.builderReasoning}</p>
                        </div>
                      ) : null}
                    </div>
                  ))}

                  {(stage.photos || []).length ? (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {stage.photos.map((p) => (
                        <div key={p.id} className="aspect-square overflow-hidden rounded-2xl bg-page">
                          {mediaToken ? (
                            <img
                              src={`/api/portal/app/${projectId}/media/${p.id}?t=${encodeURIComponent(mediaToken)}`}
                              alt={p.caption || "Site photo"}
                              loading="lazy"
                              className="h-full w-full object-cover"
                              onError={(e) => { e.currentTarget.style.display = "none"; }}
                            />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StageDot({ status, confDot }) {
  if (status === "complete") {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">✓</span>
    );
  }
  if (status === "current") {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 ring-2 ring-accent/30">
        <span className={`h-2.5 w-2.5 rounded-full ${confDot}`} />
      </span>
    );
  }
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-hairline bg-page">
      <span className="h-2 w-2 rounded-full bg-slate-300" />
    </span>
  );
}
