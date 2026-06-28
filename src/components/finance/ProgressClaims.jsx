import { authFetch } from "../../lib/authFetch.js";
import { useCallback, useEffect, useState } from "react";
import StatusBadge from "../ui/StatusBadge.jsx";

const fmt = n => n == null ? "—" : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";

const STATUS_LABELS = {
  draft: "Draft", issued: "Issued", overdue: "Overdue",
  partially_paid: "Part paid", paid: "Paid", disputed: "Disputed", void: "Void"
};

// ── New claim modal ───────────────────────────────────────────────────────────

function NewClaimModal({ jobId, schedule, contractValue, onSaved, onClose }) {
  const [schedIdx, setSchedIdx] = useState(() => {
    const firstUnclaimed = schedule.findIndex(s => !s.fully_claimed);
    return firstUnclaimed >= 0 ? firstUnclaimed : 0;
  });
  const [amountStr, setAmountStr] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const selected = schedule[schedIdx];

  useEffect(() => {
    if (selected?.amount_ex_gst != null) {
      setAmountStr(String(Math.round(selected.amount_ex_gst)));
    } else {
      setAmountStr("");
    }
    setDescription(selected ? `${selected.stage_claim_label} — ${selected.milestone}` : "");
  }, [schedIdx, selected]);

  const amountEx = parseFloat(amountStr) || 0;
  const gst = Math.round(amountEx * 0.1 * 100) / 100;
  const total = Math.round(amountEx * 1.1 * 100) / 100;

  async function submit() {
    if (!amountEx || !selected) return;
    setSaving(true); setError(null);
    const r = await authFetch(`/api/finance/jobs/${jobId}/claims`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: selected.stage, description, amount_ex_gst: amountEx })
    });
    const j = await r.json();
    setSaving(false);
    if (j.ok) { onSaved(j.claim); onClose(); }
    else setError(j.error || "Failed to create claim");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-md rounded-xl border border-hairline bg-surface shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-hairline">
          <h2 className="text-base font-bold text-ink">New Progress Claim</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink transition">
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Stage selector */}
          <div>
            <label className="text-xs font-bold text-ink mb-1 block">Stage</label>
            <select
              value={schedIdx}
              onChange={e => setSchedIdx(Number(e.target.value))}
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {schedule.map((s, i) => (
                <option key={i} value={i} disabled={s.fully_claimed}>
                  {s.stage_claim_label} — {s.milestone} ({s.pct}%)
                  {s.fully_claimed ? " ✓ claimed" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div>
            <label className="text-xs font-bold text-ink mb-1 block">
              Amount (ex GST)
              {selected?.amount_ex_gst != null && contractValue > 0 && (
                <span className="text-muted font-normal ml-2">
                  ({selected.pct}% of {fmt(contractValue)})
                </span>
              )}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-sm text-muted">$</span>
              <input
                type="number"
                value={amountStr}
                onChange={e => setAmountStr(e.target.value)}
                className="w-full rounded-lg border border-hairline pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="0"
              />
            </div>
            {amountEx > 0 && (
              <p className="text-xs text-muted mt-1">
                GST {fmt(gst)} · Total inc GST <span className="font-semibold text-ink">{fmt(total)}</span>
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-bold text-ink mb-1 block">Description</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="e.g. Progress Payment 3 — Lock up stage"
            />
          </div>

          {error && <p className="text-xs text-danger font-medium">{error}</p>}
        </div>

        <div className="flex gap-2 px-5 pb-5">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-hairline py-2.5 text-sm font-semibold text-muted hover:text-ink transition">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || !amountEx}
            className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-bold text-white disabled:opacity-40 transition"
          >
            {saving ? "Creating…" : "Create draft claim"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Issue + email modal ───────────────────────────────────────────────────────

function IssueModal({ jobId, claim, onSent, onClose }) {
  const [emailTo, setEmailTo] = useState("");
  const [emailCc, setEmailCc] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);

  async function send() {
    setSending(true); setError(null);
    const r = await authFetch(`/api/finance/jobs/${jobId}/claims/${claim.id}/send`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email_to: emailTo || undefined, email_cc: emailCc || undefined })
    });
    const j = await r.json();
    setSending(false);
    if (j.ok) { setDone(j); onSent(j.claim); }
    else setError(j.error || "Failed to issue claim");
  }

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
        <div className="w-full max-w-sm rounded-xl border border-hairline bg-surface shadow-xl p-6 text-center space-y-3">
          <div className="text-3xl">✅</div>
          <p className="font-bold text-ink">Claim issued</p>
          {done.emailSent && <p className="text-sm text-muted">Email sent to {emailTo}</p>}
          {!done.emailSent && <p className="text-sm text-muted">Status updated — no email sent</p>}
          <div className="flex gap-2 justify-center">
            {done.pdf_b64 && (
              <a
                href={`data:application/pdf;base64,${done.pdf_b64}`}
                download={`Progress-Claim-${claim.claim_number}-Client.pdf`}
                className="rounded-lg border border-hairline bg-page px-4 py-2 text-sm font-semibold text-ink hover:bg-surface transition"
              >
                ↓ Client PDF
              </a>
            )}
            {done.internal_pdf_b64 && (
              <a
                href={`data:application/pdf;base64,${done.internal_pdf_b64}`}
                download={`Progress-Claim-${claim.claim_number}-Internal.pdf`}
                className="rounded-lg border border-hairline bg-page px-4 py-2 text-sm font-semibold text-ink hover:bg-surface transition"
              >
                ↓ Internal PDF
              </a>
            )}
          </div>
          <button type="button" onClick={onClose} className="block w-full rounded-lg bg-primary py-2 text-sm font-bold text-white mt-2">Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-md rounded-xl border border-hairline bg-surface shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-hairline">
          <h2 className="text-base font-bold text-ink">Issue Claim {claim.claim_number}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink">
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-muted">
            This will mark the claim as issued and generate a PDF.
            Optionally enter an email address to send it directly.
          </p>
          <div>
            <label className="text-xs font-bold text-ink mb-1 block">Send to (optional)</label>
            <input type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)}
              placeholder="client@email.com"
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-xs font-bold text-ink mb-1 block">CC (optional)</label>
            <input type="email" value={emailCc} onChange={e => setEmailCc(e.target.value)}
              placeholder="accounts@blueleafbuilding.com.au"
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          {error && <p className="text-xs text-danger font-medium">{error}</p>}
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-hairline py-2.5 text-sm font-semibold text-muted">Cancel</button>
          <button type="button" onClick={send} disabled={sending}
            className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-bold text-white disabled:opacity-40">
            {sending ? "Issuing…" : emailTo ? "Issue + email" : "Issue (no email)"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Payment modal ─────────────────────────────────────────────────────────────

function PaymentModal({ jobId, claim, onPaid, onClose }) {
  const remaining = Math.max(0, Number(claim.amount_ex_gst || 0) * 1.1 - (claim.amount_paid || 0));
  const [amount, setAmount] = useState(String(Math.round(remaining)));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    setSaving(true); setError(null);
    const r = await authFetch(`/api/finance/jobs/${jobId}/claims/${claim.id}/pay`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment_amount: Number(amount), payment_date: date, payment_reference: reference, payment_method: "eft" })
    });
    const j = await r.json();
    setSaving(false);
    if (j.ok) { onPaid(j.claim); onClose(); }
    else setError(j.error || "Failed to record payment");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-sm rounded-xl border border-hairline bg-surface shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-hairline">
          <h2 className="text-base font-bold text-ink">Record Payment</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink">
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs font-bold text-ink mb-1 block">Amount received (inc GST)</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-sm text-muted">$</span>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full rounded-lg border border-hairline pl-7 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-ink mb-1 block">Date received</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-xs font-bold text-ink mb-1 block">Reference (optional)</label>
            <input type="text" value={reference} onChange={e => setReference(e.target.value)}
              placeholder="EFT reference, cheque no…"
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          {error && <p className="text-xs text-danger font-medium">{error}</p>}
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-hairline py-2.5 text-sm font-semibold text-muted">Cancel</button>
          <button type="button" onClick={save} disabled={saving || !amount}
            className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-bold text-white disabled:opacity-40">
            {saving ? "Saving…" : "Record payment"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ProgressClaims({ jobId, onUpdate }) {
  const [claims, setClaims] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [contractValue, setContractValue] = useState(0);
  const [scheduleSource, setScheduleSource] = useState("default");
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [issuing, setIssuing] = useState(null);   // claim object
  const [paying, setPaying] = useState(null);      // claim object

  const load = useCallback(async () => {
    setLoading(true);
    const [cr, sr] = await Promise.all([
      authFetch(`/api/finance/jobs/${jobId}/claims`).then(r => r.json()),
      authFetch(`/api/finance/jobs/${jobId}/claims/schedule`).then(r => r.json())
    ]);
    if (cr.ok) setClaims(cr.claims);
    if (sr.ok) {
      setSchedule(sr.schedule);
      setContractValue(sr.contract_value);
      setScheduleSource(sr.source);
    }
    setLoading(false);
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  const totalIssued = claims.filter(c => !["draft","void"].includes(c.status)).reduce((s,c) => s + Number(c.amount_ex_gst||0), 0);
  const totalPaid = claims.reduce((s,c) => s + (c.amount_paid||0), 0);
  const hasOverdue = claims.some(c => c.status === "overdue");

  if (loading) return <div className="py-6 text-center text-sm text-muted">Loading…</div>;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span>Issued: <span className="font-semibold text-ink">{fmt(totalIssued)}</span></span>
            <span>Paid: <span className="font-semibold text-ink">{fmt(totalPaid)}</span></span>
            {scheduleSource === "fee_proposal" && (
              <span className="text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 font-semibold">
                Stages from fee proposal
              </span>
            )}
            {scheduleSource === "default" && (
              <span className="text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 font-semibold">
                Default APB stages
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-primary/90 transition"
        >
          + New claim
        </button>
      </div>

      {hasOverdue && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 font-medium">
          ⚠ You have overdue progress claims — follow up with the client.
        </div>
      )}

      {/* Claims list */}
      {claims.length === 0 ? (
        <div className="rounded-card border border-dashed border-hairline bg-page py-10 text-center">
          <p className="text-sm text-muted">No progress claims yet.</p>
        </div>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="md:hidden space-y-2">
            {claims.map(claim => (
              <div key={claim.id} className="rounded-card border border-hairline bg-surface p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-ink">
                      #{claim.claim_number} · {claim.description || (claim.stage ? claim.stage.replace(/_/g, " ") : "—")}
                    </div>
                    <div className="text-xs text-muted mt-0.5">
                      Issued {fmtDate(claim.issued_date)} · Due {fmtDate(claim.due_date)}
                    </div>
                  </div>
                  <StatusBadge status={claim.status} className={claim.status === "void" ? "line-through" : ""}>
                    {STATUS_LABELS[claim.status] || claim.status}
                  </StatusBadge>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span className="text-ink"><span className="text-muted text-xs">Ex GST </span>{fmt(claim.amount_ex_gst)}</span>
                  <span className="font-semibold text-ink"><span className="text-muted text-xs font-normal">Inc GST </span>{fmt(Number(claim.amount_ex_gst || 0) * 1.1)}</span>
                  {claim.amount_paid > 0 && (
                    <span className="text-xs text-muted">{fmt(claim.amount_paid)} paid</span>
                  )}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  {claim.status === "draft" && (
                    <button type="button" onClick={() => setIssuing(claim)}
                      className="text-xs text-primary hover:underline font-semibold">Issue</button>
                  )}
                  {["issued", "overdue", "partially_paid"].includes(claim.status) && (
                    <button type="button" onClick={() => setPaying(claim)}
                      className="text-xs text-accent hover:underline font-semibold">Record payment</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block rounded-card border border-hairline bg-surface overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-hairline bg-page">
                {["#", "Stage", "Ex GST", "Inc GST", "Issued", "Due", "Status", ""].map(h => (
                  <th key={h} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {claims.map(claim => (
                <tr key={claim.id} className="border-b border-hairline last:border-0 hover:bg-page transition">
                  <td className="px-3 py-2.5 text-sm font-semibold text-ink">{claim.claim_number}</td>
                  <td className="px-3 py-2.5 text-sm text-ink">
                    {claim.description || (claim.stage ? claim.stage.replace(/_/g," ") : "—")}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-ink">{fmt(claim.amount_ex_gst)}</td>
                  <td className="px-3 py-2.5 text-sm font-semibold text-ink">{fmt(Number(claim.amount_ex_gst||0) * 1.1)}</td>
                  <td className="px-3 py-2.5 text-sm text-muted">{fmtDate(claim.issued_date)}</td>
                  <td className="px-3 py-2.5 text-sm text-muted">{fmtDate(claim.due_date)}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={claim.status} className={claim.status === "void" ? "line-through" : ""}>
                      {STATUS_LABELS[claim.status] || claim.status}
                    </StatusBadge>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {claim.status === "draft" && (
                        <button type="button" onClick={() => setIssuing(claim)}
                          className="text-xs text-primary hover:underline font-semibold">Issue</button>
                      )}
                      {["issued","overdue","partially_paid"].includes(claim.status) && (
                        <button type="button" onClick={() => setPaying(claim)}
                          className="text-xs text-accent hover:underline font-semibold">Record payment</button>
                      )}
                      {claim.amount_paid > 0 && (
                        <span className="text-xs text-muted">{fmt(claim.amount_paid)} paid</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {/* Modals */}
      {showNew && (
        <NewClaimModal
          jobId={jobId}
          schedule={schedule}
          contractValue={contractValue}
          onSaved={newClaim => {
            setClaims(prev => [...prev, { ...newClaim, amount_paid: 0 }]);
            onUpdate?.();
          }}
          onClose={() => setShowNew(false)}
        />
      )}
      {issuing && (
        <IssueModal
          jobId={jobId}
          claim={issuing}
          onSent={updated => {
            setClaims(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
            onUpdate?.();
          }}
          onClose={() => setIssuing(null)}
        />
      )}
      {paying && (
        <PaymentModal
          jobId={jobId}
          claim={paying}
          onPaid={updated => {
            setClaims(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated, amount_paid: (updated.progress_claim_payments||[]).reduce((s,p) => s+Number(p.payment_amount||0),0) } : c));
            onUpdate?.();
          }}
          onClose={() => setPaying(null)}
        />
      )}
    </div>
  );
}
