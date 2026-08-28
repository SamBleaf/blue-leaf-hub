/**
 * WonStage — the Won dual-state panel. A won lead is "Contract Secured" until the 8-item Ops Ready
 * handoff checklist is complete, at which point it becomes "Ops Ready" — genuinely ready to build.
 * Two items are auto-derived (job/project created, signed contract); the rest are operator
 * confirmations stored in leads.ops_ready_checklist. Deposit + council approval are advisory only.
 * The job→live-project handoff itself is done server-side at the WIN transition (finalizeWonJob +
 * trigger 096) — this panel is the human confirmation layer on top of that automation.
 */
import { WON_SUBSTATUS, OPS_READY_ITEMS } from "../../../lib/constants.js";

export default function WonStage({ lead, patch }) {
  const checklist = lead.ops_ready_checklist && typeof lead.ops_ready_checklist === "object" ? lead.ops_ready_checklist : {};
  const autoState = {
    job_created: !!lead.job_id,
    contract_signed: lead.contract_status === "signed",
  };
  const isDone = (it) => (it.auto ? !!autoState[it.auto] : !!checklist[it.key]);
  const doneCount = OPS_READY_ITEMS.filter(isDone).length;
  const allDone = doneCount === OPS_READY_ITEMS.length;
  const opsReady = lead.won_substatus === "ops_ready";

  function toggle(it) { if (!it.auto) patch({ ops_ready_checklist: { ...checklist, [it.key]: !checklist[it.key] } }); }

  return (
    <div className="space-y-4">
      {/* Dual-state banner */}
      <div className={`rounded-card border p-4 ${opsReady ? "border-green-300 bg-green-50/50" : "border-accent/30 bg-accent/[0.04]"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg leading-none">{opsReady ? "🚀" : "🎉"}</span>
          <span className="text-base font-bold text-ink">{opsReady ? "Ops ready — ready to build" : "Won — contract secured"}</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${opsReady ? "bg-green-100 text-green-700" : "bg-accent/15 text-accent"}`}>
            {WON_SUBSTATUS[lead.won_substatus || "contract_secured"]}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted">
          {opsReady
            ? "Everything's transferred — Operations can start."
            : "Complete the handoff checklist below, then mark it Ops Ready to hand over to Operations."}
        </p>
      </div>

      {/* Ops Ready checklist */}
      <div className="rounded-card border border-hairline bg-surface p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="section-label">Ops Ready handoff</h3>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${allDone ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"}`}>
            {doneCount}/{OPS_READY_ITEMS.length}
          </span>
        </div>
        <div className="space-y-1.5">
          {OPS_READY_ITEMS.map((it) => {
            const done = isDone(it);
            return (
              <label key={it.key} className={`flex items-center gap-2 text-xs ${it.auto ? "text-muted" : "text-ink cursor-pointer"}`}>
                <input type="checkbox" className="w-3.5 h-3.5 accent-primary" checked={done} disabled={!!it.auto} onChange={() => toggle(it)} />
                <span className={done ? "" : "font-medium"}>{it.label}</span>
                {it.auto && <span className="text-[10px] text-muted/70">(auto)</span>}
              </label>
            );
          })}
        </div>
        {!opsReady && (
          <button type="button" disabled={!allDone} onClick={() => patch({ won_substatus: "ops_ready" })}
            className="mt-3 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {allDone ? "✓ Mark Ops Ready — hand over to Operations" : `Complete all ${OPS_READY_ITEMS.length} items to hand over`}
          </button>
        )}
      </div>

      {/* Advisory (never blocks) */}
      <div className="rounded-card border border-hairline bg-page/60 p-4">
        <h3 className="section-label mb-1">Also track (advisory)</h3>
        <p className="text-xs text-muted">Deposit invoice raised &amp; council/development approval — track these here, but they don&rsquo;t block the Operations handoff unless the project flags them.</p>
      </div>
    </div>
  );
}
