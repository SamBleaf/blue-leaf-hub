/**
 * HandoverPanel — contract baseline + operations handover (D-028, Tab 22 D6).
 *
 * Signed building contract + an EXPLICIT staff action records the contract baseline (immutable, versioned).
 * The same project record carries on into Operations — no copy, no new project. Selections reach the client
 * portal only when staff release them here (or item by item); client invitations stay in Portal Admin and
 * are never sent by the register.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, apiPost } from "../../../../lib/apiFetch.js";
import { isClientSelection, outstandingItems, roomLabel } from "../../../../lib/register.js";
import { Chip, Section } from "./ui.jsx";

export default function HandoverPanel({ lead, reg, info, flush, portal, onBaseline }) {
  const [baseline, setBaseline] = useState(null);
  const [status, setStatus] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [picked, setPicked] = useState(null);
  const load = useCallback(async () => {
    const [b, s] = await Promise.all([
      apiFetch(`/api/register/leads/${lead.id}/baseline`),
      apiFetch(`/api/register/leads/${lead.id}/handover-status`),
    ]);
    if (b.ok) { setBaseline(b.data.baseline); onBaseline?.(b.data.baseline); }
    if (s.ok) setStatus(s.data.status);
    setLoaded(true);
  }, [lead.id, onBaseline]);
  useEffect(() => { load(); }, [load]);

  const staged = useMemo(() => reg.items.filter((i) => isClientSelection(i) && i.sync?.table === "client_selections" && !i.sync.clientVisible && !i.sync.locked), [reg]);
  const chosen = picked ?? staged.map((i) => i.id);
  const open = outstandingItems(reg);
  const contractSigned = lead.contract_status === "signed";
  const changed = baseline ? reg.items.filter((i) => baseline.itemVersions[i.id] && baseline.itemVersions[i.id] !== (i.sync?.version || i.updatedAt)).length : 0;
  const added = baseline ? reg.items.filter((i) => !baseline.itemVersions[i.id]).length : 0;

  async function record() {
    setBusy(true); setMsg(null);
    await flush();
    const r = await apiPost(`/api/register/leads/${lead.id}/baseline`, {});
    setBusy(false);
    if (!r.ok) { setMsg({ tone: "red", text: r.error }); return; }
    setMsg({ tone: "green", text: `Contract baseline ${r.data.baseline.revision} recorded — ${r.data.counts.scope} scope items, ${r.data.counts.selections} selections, ${r.data.counts.exclusions} exclusions, ${r.data.counts.open} open items carried forward.` });
    load();
  }
  async function release() {
    const items = staged.filter((i) => chosen.includes(i.id));
    if (!items.length) return;
    setBusy(true); setMsg(null);
    const r = await portal("issue", items);
    const heldN = (r.held || []).length;
    const releasedN = items.length - heldN;
    setBusy(false);
    setMsg(!r.ok ? { tone: "red", text: r.error }
      : heldN ? { tone: "green", text: `${releasedN} selection(s) released to the client portal. ${heldN} held — not ready to release yet (add an option or a specified product first).` }
      : { tone: "green", text: `${items.length} selection(s) are now on the client portal for the client to review.` });
    setPicked(null);
  }

  return (
    <div className="space-y-3">
      {msg && <p className={`rounded border p-2 text-[11px] ${msg.tone === "green" ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`} data-testid="handover-message">{msg.text}</p>}
      {!loaded ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          {["Building contract", "Project record", "Contract baseline", "Ops handover"].map((l) => <Tile key={l} label={l} value="Checking…" loading />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <Tile label="Building contract" value={status?.contract.signed ? "Signed" : (status?.contract.status || "Not signed")} ok={!!status?.contract.signed} />
            <Tile label="Project record"
              value={status?.project.status === "live" ? "Live (Operations)" : status?.project.status === "preconstruction" ? "Pre-construction" : "Not yet created"}
              ok={status?.project.status === "live"} />
            <Tile label="Contract baseline" value={status?.baseline.recorded ? `${status.baseline.revision} · ${new Date(status.baseline.at).toLocaleDateString("en-AU")}` : "Not recorded"} ok={!!status?.baseline.recorded} />
            <Tile label="Ops handover" value={status?.opsHandover.ready ? "Ops Ready" : status?.opsHandover.applicable ? `${status.opsHandover.done}/${status.opsHandover.total}` : "—"} ok={!!status?.opsHandover.ready} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            <span className="uppercase tracking-wide text-muted">Client portal:</span>
            <StateChip on={status?.portal.configured} label="configured" />
            <StateChip on={status?.portal.v2Enabled} label="v2 enabled" />
            <StateChip on={status?.portal.clientLinked} label={status?.portal.clientEmail ? `client linked (${status.portal.clientEmail})` : "client linked"} />
            <StateChip on={status?.portal.invited} label="invited" />
            <StateChip on={status?.portal.onboarded} label="onboarded" />
            <span className="ml-auto text-muted">{open.length} open item(s) carried forward</span>
          </div>
          {status?.nextAction && (
            <p className="rounded border border-primary/20 bg-primary/[0.04] px-2 py-1 text-[11px] text-primary" data-testid="handover-next">
              <span className="font-semibold">Next: </span>{status.nextAction.label} <span className="text-primary/70">({status.nextAction.owner})</span>
            </p>
          )}
        </>
      )}

      <Section title="1 · Record the contract baseline" defaultOpen>
        <p className="text-[11px] text-muted">Snapshots the agreed scope, applicable selections, exclusions, drawing basis, reviewed allowances and current issued documents. It is permanent; later changes go through variations and show here as changes since the baseline.</p>
        {baseline && (changed || added) ? <p className="text-[11px] text-amber-800">{changed} item(s) changed and {added} added since baseline {baseline.revision}.</p> : null}
        <button type="button" disabled={busy || !contractSigned || info.mode !== "project"} onClick={record} data-testid="record-baseline"
          className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">{baseline ? "Record a new baseline revision" : "Record contract baseline & hand over"}</button>
        {!contractSigned && <p className="text-[10px] text-muted">Available once the building contract is recorded as signed.</p>}
      </Section>

      <Section title="2 · Release selections to the client portal" count={staged.length || null} defaultOpen={staged.length > 0}>
        {info.mode !== "project" ? <p className="text-[11px] text-muted">Selections can be released once the brief is on the project record.</p> : staged.length === 0 ? (
          <p className="text-[11px] text-muted">No staged selections — everything relevant is already on the portal, or there are no client choices.</p>
        ) : (
          <>
            <p className="text-[11px] text-muted">Only genuine product / finish choices appear here — scope, requirements and actions can never be issued. The client reviews them in the existing portal; any change they ask for comes back to Blue Leaf for approval (and a variation where it affects cost).</p>
            <div className="max-h-56 space-y-0.5 overflow-auto">
              {staged.map((i) => (
                <label key={i.id} className="flex items-center gap-2 text-[11px]">
                  <input type="checkbox" className="h-3.5 w-3.5 accent-primary" checked={chosen.includes(i.id)} onChange={(e) => setPicked(e.target.checked ? [...chosen, i.id] : chosen.filter((x) => x !== i.id))} />
                  <span className="text-ink">{roomLabel(reg, i)} — {i.description || i.category}</span>
                  {i.certainty === "client_approved" && <Chip tone="green">approved</Chip>}
                </label>
              ))}
            </div>
            <button type="button" disabled={busy || !chosen.length} onClick={release} className="rounded border border-primary px-3 py-1.5 text-xs font-semibold text-primary disabled:opacity-40" data-testid="release-selections">Release {chosen.length} to the client portal</button>
          </>
        )}
        <p className="text-[10px] text-muted">Client portal invitations are sent from Portal Admin after staff approval — the register never invites.</p>
      </Section>
    </div>
  );
}

function Tile({ label, value, ok, loading }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${loading ? "border-hairline bg-page animate-pulse" : ok ? "border-hairline bg-page" : "border-amber-200 bg-amber-50"}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className={`text-xs font-semibold ${loading ? "text-muted" : "text-ink"}`}>{value}</p>
    </div>
  );
}

function StateChip({ on, label }) {
  return (
    <span className={`rounded-full px-1.5 py-0.5 font-semibold ${on ? "bg-green-100 text-green-700" : "border border-hairline bg-page text-muted"}`}>
      {on ? "✓ " : "○ "}{label}
    </span>
  );
}
