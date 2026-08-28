/**
 * LeadManagementStrip — the operator management chips at the top of the lead focus panel:
 * temperature, stuck reason, and risk flags. Visible + one-click editable, never buried in notes.
 * Saves via the lead's optimistic patch(); values are controlled vocabs from constants.js.
 */
import { useState } from "react";
import { LEAD_TEMPERATURE, LEAD_STUCK_REASONS, LEAD_RISK_FLAGS } from "../../../lib/constants.js";

const TEMP_COLORS = {
  hot:      "bg-red-500 text-white",
  warm:     "bg-orange-400 text-white",
  cooling:  "bg-sky-500 text-white",
  ghosting: "bg-slate-500 text-white",
  nurture:  "bg-violet-500 text-white",
};

export default function LeadManagementStrip({ lead, patch }) {
  const [riskOpen, setRiskOpen] = useState(false);
  const flags = Array.isArray(lead.risk_flags) ? lead.risk_flags : [];

  const setTemp = (t) => patch({ lead_temperature: lead.lead_temperature === t ? null : t });
  const setStuck = (v) => patch({ stuck_reason: v || null });
  const toggleRisk = (k) => {
    const next = flags.includes(k) ? flags.filter((f) => f !== k) : [...flags, k];
    patch({ risk_flags: next });
  };

  return (
    <div className="mb-3 rounded-card border border-hairline bg-page/60 px-3 py-2.5 space-y-2">
      {/* Temperature */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted mr-1">Temp</span>
        {Object.entries(LEAD_TEMPERATURE).map(([k, label]) => {
          const on = lead.lead_temperature === k;
          return (
            <button key={k} type="button" onClick={() => setTemp(k)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition ${on ? TEMP_COLORS[k] : "bg-surface text-muted border border-hairline hover:bg-page"}`}>
              {label}
            </button>
          );
        })}
      </div>

      {/* Stuck reason + risk flags */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Stuck</span>
        <select value={lead.stuck_reason || ""} onChange={(e) => setStuck(e.target.value)}
          className="rounded-lg border border-hairline bg-surface px-2 py-1 text-xs text-ink focus-ring">
          <option value="">— not stuck —</option>
          {Object.entries(LEAD_STUCK_REASONS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>

        <span className="ml-1 text-[10px] font-bold uppercase tracking-wide text-muted">Risks</span>
        {flags.length > 0 && flags.map((k) => (
          <button key={k} type="button" onClick={() => toggleRisk(k)}
            className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 hover:bg-amber-200">
            {LEAD_RISK_FLAGS[k] || k} ×
          </button>
        ))}
        <button type="button" onClick={() => setRiskOpen((o) => !o)}
          className="rounded-full border border-dashed border-hairline px-2 py-0.5 text-[11px] font-semibold text-muted hover:bg-page">
          {riskOpen ? "Done" : "+ Risk"}
        </button>
      </div>

      {riskOpen && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {Object.entries(LEAD_RISK_FLAGS).map(([k, label]) => {
            const on = flags.includes(k);
            return (
              <button key={k} type="button" onClick={() => toggleRisk(k)}
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition ${on ? "bg-amber-500 text-white" : "bg-surface text-muted border border-hairline hover:bg-page"}`}>
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
