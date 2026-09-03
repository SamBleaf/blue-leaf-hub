/**
 * PreconstructionPortalCard — CV-3b. Inducts the client into the portal EARLY (from PTSA-signed /
 * during Consultants) so the client↔consultant comms (CV-3a) have a home before the build starts.
 * It provisions a project row flagged is_preconstruction (hidden from Operations until Won, when
 * finalizeWonJob flips the flag and the same row becomes the live Ops project). Client invite + magic
 * link are done from the existing Portal admin — this card links straight there.
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
    setMsg({ type: "success", text: data.created ? "Pre-construction portal created." : "Portal already set up." });
  }

  const project = state?.project;
  const isLive = project && project.isPreconstruction === false;

  return (
    <div className="rounded-card border border-hairline bg-surface p-4">
      <h3 className="section-label mb-1">Client pre-construction portal</h3>
      <p className="text-[11px] text-muted mb-2">
        Bring the client into the portal now — their home for the design team, selections and every
        message with the consultants. It stays hidden from Operations until the job is won.
      </p>

      {state == null ? (
        <p className="text-xs text-muted">Loading…</p>
      ) : state.noJob ? (
        <p className="text-xs text-muted">The portal is keyed to the job — sign the PTSA / Plans stage first to create it.</p>
      ) : !project ? (
        <button type="button" onClick={provision} disabled={busy}
          className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? "Setting up…" : "Set up the client’s portal →"}
        </button>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm">
            <span className={isLive ? "text-green-700" : "text-primary"}>{isLive ? "✓ Portal live (build stage)" : "✓ Pre-construction portal active"}</span>
          </div>
          <p className="text-[11px] text-muted">{project.address}</p>
          {project.portalClientEmail
            ? <p className="text-[11px] text-green-700">Client invited: {project.portalClientEmail}</p>
            : <p className="text-[11px] text-amber-700">No client invited yet — invite them from the Portal admin.</p>}
          <Link to={`/portal-admin/${project.id}`} className="inline-block text-xs font-semibold text-primary hover:underline">
            Open Portal admin (invite client, manage access) ↗
          </Link>
          {!project.portalV2Enabled && <p className="text-[10px] text-amber-700">Portal v2 not enabled — enable it in Portal admin.</p>}
        </div>
      )}
      {msg && <p className={`mt-2 text-xs ${msg.type === "error" ? "text-red-600" : "text-green-600"}`}>{msg.text}</p>}
    </div>
  );
}
