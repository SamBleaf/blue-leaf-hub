/**
 * PreconstructionPortalCard — CV-3b. Sets the portal up EARLY (from PTSA-signed / during
 * Consultants) so the client↔consultant comms (CV-3a) have a home before the build starts.
 * It provisions a project row flagged is_preconstruction (hidden from Operations until Won, when
 * finalizeWonJob flips the flag and the same row becomes the live Ops project). Setting up never
 * invites the client: an admin invites them deliberately from the v2 Portal Admin console, either
 * early (owner-approved for the pilot, 10 Nov 2026) or once the building contract is signed.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch, apiPost } from "../../../lib/apiFetch.js";

export default function PreconstructionPortalCard({ lead }) {
  const [state, setState] = useState(null); // { project, noJob }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = () => apiFetch(`/api/sales/leads/${lead.id}/preconstruction-portal`)
    .then(({ ok, data }) => { if (ok) setState(data); });
  useEffect(() => { load(); }, [lead.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function provision() {
    setBusy(true); setMsg(null);
    const { ok, data, error } = await apiPost(`/api/sales/leads/${lead.id}/preconstruction-portal`, {});
    setBusy(false);
    if (!ok) { setMsg({ type: "error", text: error || "Could not set up the portal." }); return; }
    setState((s) => ({ ...(s || {}), project: data.project, noJob: false }));
    setMsg({ type: "success", text: data.created ? "Portal set up. The client hasn't been invited." : "Portal already set up. The client hasn't been invited." });
  }

  const project = state?.project;
  const isLive = project && project.isPreconstruction === false;

  return (
    <div className="rounded-card border border-hairline bg-surface p-4">
      <h3 className="section-label mb-1">Client pre-construction portal</h3>
      <p className="text-[11px] text-muted mb-2">
        Set the portal up now so the design team, selections and messages with the consultants have a
        home. Setting it up doesn’t invite the client, and Operations can’t see it until the job is won.
      </p>

      {state == null ? (
        <p className="text-xs text-muted">Loading…</p>
      ) : state.noJob ? (
        <p className="text-xs text-muted">The portal is set up against the job, so the job needs to exist first (it’s created when the PTSA / Plans stage is signed).</p>
      ) : !project ? (
        <button type="button" onClick={provision} disabled={busy}
          className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? "Setting up…" : "Set up the client’s portal →"}
        </button>
      ) : (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-primary">{isLive ? "✓ Live Operations project" : "✓ Pre-construction project"}</span>
            <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${project.portalV2Enabled ? "border-hairline bg-page text-muted" : "border-amber-200 bg-amber-50 text-amber-700"}`}>{project.portalV2Enabled ? "portal v2 enabled" : "portal v2 off"}</span>
          </div>
          <p className="text-[11px] text-muted">{project.address}</p>
          {project.portalClientEmail
            ? <p className="text-[11px] text-ink">Client linked: {project.portalClientEmail}
                {state.clientOnboarded ? <span className="text-green-700"> · onboarded</span>
                  : state.clientInvited ? <span className="text-amber-700"> · invited (awaiting sign-in)</span>
                  : <span className="text-muted"> · not invited yet</span>}
              </p>
            : <p className="text-[11px] text-amber-700">No client linked yet.</p>}
          <p className="text-[10px] text-muted">Inviting the client is a deliberate admin step in Portal Admin. It can happen early, during design, or once the building contract is signed. Invitations are never sent automatically.</p>
          <Link to={`/portal-admin/${project.id}/v2`} className="inline-block text-xs font-semibold text-primary hover:underline">
            Open Portal admin (access and invitations) ↗
          </Link>
        </div>
      )}
      {msg && <p className={`mt-2 text-xs ${msg.type === "error" ? "text-red-600" : "text-green-600"}`}>{msg.text}</p>}
    </div>
  );
}
