import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useClientPortal } from "./clientPortalContext.js";
import { portalGet, portalPost } from "../../lib/clientPortalApi.js";
import { Loading, ErrorBox, Empty, Card, PageTitle, fmtAud, fmtDate, daysUntil } from "./clientPortalUi.jsx";

function urgencyDot(action) {
  if (action.status === "overdue") return "bg-red-500";
  const d = daysUntil(action.dueDate);
  if (d != null && d <= 1) return "bg-amber-500";
  return "bg-accent";
}

function dueChipClass(action) {
  if (action.status === "overdue") return "bg-red-50 text-red-700";
  const d = daysUntil(action.dueDate);
  if (d != null && d <= 1) return "bg-amber-50 text-amber-700";
  return "bg-accent/10 text-accent";
}

function dueLabel(action) {
  if (action.status === "overdue") return "Overdue";
  const d = daysUntil(action.dueDate);
  if (d == null) return null;
  if (d < 0) return "Overdue";
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  return `Due ${fmtDate(action.dueDate)}`;
}

export default function ClientActions() {
  const ctx = useClientPortal();
  const projectId = ctx?.projectId;
  const [state, setState] = useState({ loading: true, open: [], completed: [], error: null });
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(() => {
    if (!projectId) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    portalGet(projectId, "actions").then(({ ok, data, error }) => {
      setState({ loading: false, open: data?.open || [], completed: data?.completed || [], error: ok ? null : error });
    });
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  if (state.loading) return <Loading label="Loading your actions…" />;
  if (state.error) return <ErrorBox error={state.error} onRetry={load} />;

  return (
    <div className="space-y-5">
      <PageTitle sub="Everything that needs a decision from you, in one place.">My Actions</PageTitle>

      {state.open.length === 0 ? (
        <Empty title="You're all up to date" hint="We'll let you know here when something needs your attention." />
      ) : (
        <div className="space-y-3">
          {state.open.map((a) => (
            <Card key={a.id} className="!p-0 overflow-hidden">
              <button
                type="button"
                onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                className="flex min-h-[56px] w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-page/60"
              >
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${urgencyDot(a)}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-ink">{a.title}</span>
                    {dueLabel(a) ? (
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${dueChipClass(a)}`}>
                        {dueLabel(a)}
                      </span>
                    ) : null}
                  </span>
                  {a.description ? <span className="mt-1 block truncate text-xs leading-relaxed text-muted">{a.description}</span> : null}
                </span>
                <span className={`mt-0.5 shrink-0 text-muted transition-transform ${expanded === a.id ? "rotate-90" : ""}`} aria-hidden="true">›</span>
              </button>
              {expanded === a.id ? (
                <div className="border-t border-hairline px-5 py-4">
                  <ActionDetail projectId={projectId} action={a} onDone={() => { setExpanded(null); load(); }} />
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      {state.completed.length > 0 ? (
        <Card title="Completed">
          <ul className="space-y-2.5">
            {state.completed.slice(0, 12).map((a) => (
              <li key={a.id} className="flex items-center gap-2.5 text-sm text-muted">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[11px] font-bold text-accent">✓</span>
                <span className="truncate">{a.title}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function ActionDetail({ projectId, action, onDone }) {
  switch (action.actionType) {
    case "variation_approval":
      return <VariationAction projectId={projectId} action={action} onDone={onDone} />;
    case "progress_claim_review":
      return <ClaimAction projectId={projectId} action={action} onDone={onDone} />;
    case "meeting_confirmation":
      return <MeetingAction projectId={projectId} action={action} onDone={onDone} />;
    case "selection_decision":
      return (
        <p className="text-sm text-muted">
          Make this choice on the{" "}
          <Link to="/client-portal/selections" className="font-semibold text-primary hover:underline">Selections</Link> board.
        </p>
      );
    default:
      return <p className="text-sm text-muted">{action.description || "Open this item for details."}</p>;
  }
}

function VariationAction({ projectId, action, onDone }) {
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    portalGet(projectId, `variations/${action.relatedEntityId}`).then(({ ok, data, error }) => {
      setDetail(ok ? data : null);
      if (!ok) setErr(error);
    });
  }, [projectId, action.relatedEntityId]);

  async function respond(decision) {
    setBusy(true); setErr(null);
    const { ok, error } = await portalPost(projectId, `variations/${action.relatedEntityId}/respond`, { action: decision, note: note || undefined });
    setBusy(false);
    if (!ok) { setErr(error); return; }
    onDone();
  }

  if (!detail && !err) return <p className="text-sm text-muted">Loading variation…</p>;
  if (err && !detail) return <ErrorBox error={err} />;
  const v = detail.variation || {};
  const d = detail.decision || {};

  return (
    <div className="space-y-3 text-sm">
      {d.description ? <p className="leading-relaxed text-ink">{d.description}</p> : null}
      <dl className="grid grid-cols-2 gap-2">
        <div><dt className="text-xs text-muted">Cost impact</dt><dd className="font-semibold text-ink">{fmtAud(v.amountIncGst)} inc GST</dd></div>
        <div><dt className="text-xs text-muted">Time impact</dt><dd className="font-semibold text-ink">{v.eotDays ? `${v.eotDays} days` : "No delay"}</dd></div>
      </dl>
      {d.builderReasoning ? (
        <div className="rounded-xl bg-page px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Why this variation was raised</p>
          <p className="mt-1 leading-relaxed text-ink">{d.builderReasoning}</p>
        </div>
      ) : null}
      {v.documentUrl || v.signedDocumentUrl ? (
        <a href={v.signedDocumentUrl || v.documentUrl} target="_blank" rel="noreferrer" className="inline-block text-xs font-semibold text-primary hover:underline">
          View variation PDF →
        </a>
      ) : null}
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note or question (optional)"
        rows={2}
        className="w-full rounded-xl border border-hairline bg-surface px-3 py-2 text-sm focus-ring"
      />
      <p className="text-[11px] leading-relaxed text-muted">
        Your approval is recorded with a timestamp and your account details. Blue Leaf will issue a signed variation document separately.
      </p>
      {err ? <p className="text-xs text-red-600">{err}</p> : null}
      {confirming ? (
        <div className="space-y-2 rounded-xl border border-accent/30 bg-accent/[0.06] p-3">
          <p className="text-xs leading-relaxed text-ink">
            Approve this variation for <span className="font-semibold">{fmtAud(v.amountIncGst)} inc GST</span>
            {v.eotDays ? ` and ${v.eotDays} days added to the schedule` : ""}? This is recorded against your account.
          </p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="min-h-[40px] flex-1 rounded-xl border border-hairline px-3 py-2 text-xs font-semibold text-ink hover:bg-page disabled:opacity-50">
              Cancel
            </button>
            <button type="button" disabled={busy} onClick={() => respond("approve")} className="min-h-[40px] flex-1 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {busy ? "Saving…" : "Confirm approval"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => respond("decline")} className="min-h-[40px] flex-1 rounded-xl border border-hairline px-3 py-2 text-xs font-semibold text-ink hover:bg-page disabled:opacity-50">
            Decline
          </button>
          <button type="button" disabled={busy} onClick={() => setConfirming(true)} className="min-h-[40px] flex-1 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
            Approve
          </button>
        </div>
      )}
    </div>
  );
}

function ClaimAction({ projectId, action, onDone }) {
  const [claim, setClaim] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    portalGet(projectId, "claims").then(({ ok, data }) => {
      if (ok) setClaim((data?.claims || []).find((c) => c.id === action.relatedEntityId) || null);
    });
  }, [projectId, action.relatedEntityId]);

  async function notifyPaid() {
    setBusy(true); setErr(null);
    const { ok, error } = await portalPost(projectId, `claims/${action.relatedEntityId}/payment-notify`, {});
    setBusy(false);
    if (!ok) { setErr(error); return; }
    setDone(true);
    setTimeout(onDone, 1200);
  }

  if (!claim) return <p className="text-sm text-muted">Loading claim…</p>;
  const c = claim.canonical || {};
  return (
    <div className="space-y-3 text-sm">
      <dl className="grid grid-cols-2 gap-2">
        <div><dt className="text-xs text-muted">Stage</dt><dd className="font-semibold text-ink">{claim.stageName}</dd></div>
        <div><dt className="text-xs text-muted">Amount</dt><dd className="font-semibold text-ink">{fmtAud(c.amountIncGst ?? claim.amount)} inc GST</dd></div>
        {c.dueDate ? <div><dt className="text-xs text-muted">Due</dt><dd className="font-semibold text-ink">{fmtDate(c.dueDate)}</dd></div> : null}
      </dl>
      {claim.paymentInstructions ? (
        <div className="rounded-xl bg-page px-3 py-2.5 text-xs leading-relaxed text-ink whitespace-pre-line">{claim.paymentInstructions}</div>
      ) : null}
      {c.documentUrl ? (
        <a href={c.documentUrl} target="_blank" rel="noreferrer" className="inline-block text-xs font-semibold text-primary hover:underline">Download invoice →</a>
      ) : null}
      {err ? <p className="text-xs text-red-600">{err}</p> : null}
      {done ? (
        <p className="rounded-xl bg-accent/10 px-3 py-2 text-xs font-semibold text-accent">Thanks — we’ve been notified and will confirm receipt.</p>
      ) : (
        <button type="button" disabled={busy} onClick={notifyPaid} className="min-h-[40px] w-full rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? "Saving…" : "I've transferred payment"}
        </button>
      )}
    </div>
  );
}

function MeetingAction({ projectId, action, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  async function act(kind) {
    setBusy(true); setErr(null);
    const { ok, data, error } = await portalPost(projectId, `meetings/${action.relatedEntityId}/${kind}`, {});
    setBusy(false);
    if (!ok) { setErr(error); return; }
    if (kind === "decline") { setMsg(data?.message || "Sam has been notified."); setTimeout(onDone, 1400); }
    else onDone();
  }

  return (
    <div className="space-y-3 text-sm">
      {action.description ? <p className="text-ink">{action.description}</p> : null}
      {action.dueDate ? <p className="text-xs text-muted">{fmtDate(action.dueDate)}</p> : null}
      {err ? <p className="text-xs text-red-600">{err}</p> : null}
      {msg ? <p className="rounded-xl bg-accent/10 px-3 py-2 text-xs font-semibold text-accent">{msg}</p> : (
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => act("decline")} className="min-h-[40px] flex-1 rounded-xl border border-hairline px-3 py-2 text-xs font-semibold text-ink hover:bg-page disabled:opacity-50">
            I can’t make it
          </button>
          <button type="button" disabled={busy} onClick={() => act("confirm")} className="min-h-[40px] flex-1 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {busy ? "Saving…" : "Confirm"}
          </button>
        </div>
      )}
    </div>
  );
}
