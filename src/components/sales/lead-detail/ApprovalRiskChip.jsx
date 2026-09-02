/**
 * ApprovalRiskChip — the council/certifier approval-risk selector. Advisory only (never blocks a
 * stage move). Lives in the WON stage (CW-2): it follows the private certifier, which is lodged in
 * Won, not Consultants. Low / Medium / High / Unknown on lead.approval_risk.
 */
import { APPROVAL_RISK, APPROVAL_RISK_STEPS, APPROVAL_RISK_COLORS } from "../../../lib/constants.js";

export default function ApprovalRiskChip({ lead, patch }) {
  const risk = lead.approval_risk || "unknown";
  return (
    <div className="rounded-card border border-hairline bg-surface p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="section-label">Council / certifier approval risk</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${APPROVAL_RISK_COLORS[risk]}`}>{APPROVAL_RISK[risk]}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {APPROVAL_RISK_STEPS.map((r) => (
          <button key={r} type="button" onClick={() => patch({ approval_risk: r })}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${risk === r ? "bg-primary text-white" : "border border-hairline text-ink hover:bg-page"}`}>
            {APPROVAL_RISK[r]}
          </button>
        ))}
      </div>
      {risk === "high" && <p className="mt-2 text-[11px] text-red-600">High approval risk — flag it in the proposal and manage the client&rsquo;s expectations on the approval timeline.</p>}
    </div>
  );
}
