import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useClientPortal } from "./clientPortalContext.js";
import { portalGet } from "../../lib/clientPortalApi.js";
import { Loading, ErrorBox, Card, fmtAud, fmtDate, confidenceStyle } from "./clientPortalUi.jsx";

/** Greeting paragraph synthesised from stage + update + next action. */
function greeting(home) {
  const name = home.clientName ? `, ${home.clientName.split(" ")[0]}` : "";
  const hour = new Date().getHours();
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const lines = [`${part}${name}.`];
  if (home.buildPhase === "pre_construction") {
    lines.push("Your build hasn't started on site yet — here's what's happening behind the scenes.");
  } else if (home.currentStage?.label) {
    lines.push(`${home.currentStage.label} is currently underway${home.address ? ` at ${home.address}` : ""}.`);
  }
  if (home.latestUpdate?.headline) lines.push(home.latestUpdate.headline);
  if (home.nextAction?.title) lines.push(`Your next step: ${home.nextAction.title}.`);
  if (home.currentStage?.eta) lines.push(`On track for ${home.currentStage.label || "the next stage"} around ${fmtDate(home.currentStage.eta)}.`);
  return lines;
}

export default function ClientHome() {
  const ctx = useClientPortal();
  const projectId = ctx?.projectId;
  const [state, setState] = useState({ loading: true, home: null, error: null });

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    portalGet(projectId, "home").then(({ ok, data, error }) => {
      if (cancelled) return;
      setState({ loading: false, home: ok ? data?.home ?? null : null, error: ok ? null : error });
    });
    return () => { cancelled = true; };
  }, [projectId]);

  if (state.loading) return <Loading label="Loading your home…" />;
  if (state.error) return <ErrorBox error={state.error} />;
  const home = state.home;
  if (!home) return <ErrorBox error="No project data yet." />;

  const conf = confidenceStyle(home.currentStage?.confidence);
  const fin = home.financial || {};
  const preConstruction = home.buildPhase === "pre_construction";

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <Card className="!px-6 !py-6">
        <div className="space-y-1.5">
          {greeting(home).map((line, i) => (
            <p key={i} className={i === 0 ? "text-xl font-semibold text-ink" : "max-w-[52ch] text-sm leading-relaxed text-muted"}>
              {line}
            </p>
          ))}
        </div>
      </Card>

      {/* Stage + health */}
      {!preConstruction && home.currentStage ? (
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">{home.currentStage.label}</p>
              {home.nextMilestone ? (
                <p className="mt-0.5 text-xs text-muted">Next: {home.nextMilestone}{home.currentStage.eta ? ` · ${fmtDate(home.currentStage.eta)}` : ""}</p>
              ) : null}
            </div>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${conf.chip}`}>
              <span className={`h-2 w-2 rounded-full ${conf.dot}`} /> {conf.label}
            </span>
          </div>
          <div
            className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-accent/10"
            role="progressbar"
            aria-valuenow={home.progressPct || 0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Build progress"
          >
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${home.progressPct || 0}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted">{home.progressPct || 0}% complete</p>
          {home.currentStage.confidenceNote ? (
            <p className={`mt-3 rounded-lg ${conf.chip} px-3 py-2 text-xs`}>{home.currentStage.confidenceNote}</p>
          ) : null}
        </Card>
      ) : null}

      {preConstruction ? (
        <Card title="Your build starts soon">
          <p className="text-sm leading-relaxed text-muted">
            We’re finalising approvals and pre-construction details. Updates and site photos will appear here as soon as work begins on site.
          </p>
          {home.comingUp?.length ? (
            <p className="mt-2 text-xs text-muted">You have {home.comingUp.length} selection{home.comingUp.length === 1 ? "" : "s"} to make before site start.</p>
          ) : null}
        </Card>
      ) : null}

      {/* Actions summary */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">
              {home.actionCount ? `${home.actionCount} action${home.actionCount === 1 ? "" : "s"} need your attention` : "You're all up to date"}
            </p>
            {!home.actionCount ? <p className="mt-0.5 text-xs text-muted">We’ll let you know when something needs you.</p> : null}
          </div>
          <Link to="/client-portal/actions" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
            View My Actions
          </Link>
        </div>
      </Card>

      {/* Financial snapshot (inc-GST only — never builder cost) */}
      <Card title="Your build, financially">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <Money label="Contract value" value={fin.contractValue} />
          <Money label="Approved variations" value={fin.approvedVariations} sign />
          <Money label="Pending variations" value={fin.pendingVariations} sign muted />
          <Money label="Claims paid" value={fin.claimsPaid} />
          <Money label="Claims outstanding" value={fin.claimsOutstanding} />
          <Money label="Current total" value={fin.currentContractTotal} strong />
        </dl>
        <p className="mt-3 text-[11px] text-muted/70">All figures include GST.</p>
      </Card>

      {/* Coming up */}
      {home.comingUp?.length ? (
        <Card title="Coming up">
          <ul className="space-y-2">
            {home.comingUp.map((s) => (
              <li key={s.id} className="flex items-center justify-between text-sm">
                <span className="text-ink">{s.itemName}</span>
                <span className="text-xs text-muted">{s.dueDate ? `due ${fmtDate(s.dueDate)}` : s.category}</span>
              </li>
            ))}
          </ul>
          <Link to="/client-portal/selections" className="mt-3 inline-block text-xs font-semibold text-primary hover:underline">
            Go to Selections →
          </Link>
        </Card>
      ) : null}

      {/* Latest update */}
      {home.latestUpdate ? (
        <Card title={`Latest update · ${fmtDate(home.latestUpdate.weekOf)}`}>
          <p className="text-sm font-semibold text-ink">{home.latestUpdate.headline}</p>
          {home.latestUpdate.body ? <p className="mt-1 text-sm leading-relaxed text-muted">{home.latestUpdate.body}</p> : null}
          {home.latestUpdate.builderReasoning ? (
            <div className="mt-3 rounded-lg bg-page px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Why we did it this way</p>
              <p className="mt-1 text-sm leading-relaxed text-ink">{home.latestUpdate.builderReasoning}</p>
            </div>
          ) : null}
          <Link to="/client-portal/journey" className="mt-3 inline-block text-xs font-semibold text-primary hover:underline">
            View Project Journey →
          </Link>
        </Card>
      ) : null}

      {/* Team directory */}
      {home.team?.length ? (
        <Card title="Your team">
          <ul className="flex flex-wrap gap-3">
            {home.team.map((m, i) => (
              <li key={i} className="flex items-center gap-2.5 rounded-lg border border-hairline bg-page px-3 py-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {(m.name || "?").split(" ").map((p) => p[0]).slice(0, 2).join("")}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-ink">{m.name}</span>
                  <span className="block text-[11px] text-muted">{m.role}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Messages link */}
      <Card>
        <Link to="/client-portal/messages" className="flex items-center justify-between text-sm">
          <span className="font-semibold text-ink">Messages</span>
          <span className="text-xs text-muted">
            {home.unreadMessages ? `${home.unreadMessages} unread →` : "Open conversation →"}
          </span>
        </Link>
      </Card>
    </div>
  );
}

function Money({ label, value, sign, strong, muted }) {
  const display = value == null ? "—" : `${sign && Number(value) > 0 ? "+" : ""}${fmtAud(value)}`;
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className={`mt-1 ${strong ? "text-lg font-bold text-ink" : muted ? "text-base font-medium text-muted" : "text-base font-semibold text-ink"}`}>
        {display}
      </dd>
    </div>
  );
}
