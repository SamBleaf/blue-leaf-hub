/**
 * XeroInvoiceCard — raise the concept fee as a real Xero invoice (Sales OS, Discovery).
 * Appears once the concept agreement is accepted. Creates an AUTHORISED Xero invoice
 * (GST added by Xero); sending the official PDF is a later phase. Idempotent server-side
 * (re-clicking never makes a duplicate). Fail-soft: shows a hint when Xero is off/not
 * connected instead of erroring.
 */
import { useEffect, useState } from "react";
import { apiFetch, apiPost } from "../../../lib/apiFetch.js";
import { incGst, XERO_INVOICE_STATUS_LABELS } from "../../../lib/constants.js";

const money = (n) =>
  n == null || n === "" ? "—" : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(n));
const fmtDate = (x) => { try { return new Date(x).toLocaleDateString("en-AU", { day: "numeric", month: "short" }); } catch { return ""; } };

function StatusBadge({ status }) {
  const tone = {
    paid: "bg-green-100 text-green-800",
    part_paid: "bg-amber-100 text-amber-800",
    authorised: "bg-sky-100 text-sky-800",
    sent: "bg-sky-100 text-sky-800",
    draft: "bg-gray-100 text-gray-700",
    void: "bg-gray-200 text-gray-600",
    error: "bg-red-100 text-red-700",
  }[status] || "bg-gray-100 text-gray-700";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>{XERO_INVOICE_STATUS_LABELS[status] || status}</span>;
}

export default function XeroInvoiceCard({ lead, reload }) {
  const [status, setStatus] = useState(null);   // xero connection status
  const [invoices, setInvoices] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const accepted = lead.concept_agreement_status === "accepted";
  const fee = Number(lead.concept_fee) || 0;

  async function loadAll() {
    const [s, inv] = await Promise.all([
      apiFetch("/api/finance/xero/status"),
      apiFetch(`/api/finance/leads/${lead.id}/xero-invoices`),
    ]);
    if (s.ok) setStatus(s.data);
    if (inv.ok) setInvoices(inv.data?.invoices || []);
  }
  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  const conceptInvoice = invoices.find((i) => i.invoiceType === "concept_fee");
  const canCreate = accepted && fee > 0 && status?.connected && status?.enabled && !conceptInvoice?.xeroInvoiceId;

  async function createConceptInvoice() {
    if (!window.confirm(`Create a Xero invoice for the concept fee (${money(fee)} ex GST, ${money(incGst(fee))} inc GST)?`)) return;
    setBusy(true); setMsg(null);
    const { ok, data, error } = await apiPost(`/api/finance/leads/${lead.id}/concept-fee/invoice`, {});
    setBusy(false);
    if (!ok) { setMsg({ type: "error", text: error || "Could not create the invoice." }); return; }
    setMsg({ type: "success", text: `Invoice ${data?.invoice?.xeroInvoiceNumber || ""} created in Xero.` });
    await loadAll();
    if (reload) await reload();
  }

  async function sync(id) {
    setBusy(true); setMsg(null);
    const { ok, error } = await apiPost(`/api/finance/xero-invoices/${id}/sync`, {});
    setBusy(false);
    if (!ok) { setMsg({ type: "error", text: error || "Could not sync." }); return; }
    await loadAll();
  }

  async function downloadPdf(id) {
    setBusy(true); setMsg(null);
    const { ok, data, error } = await apiFetch(`/api/finance/xero-invoices/${id}/pdf-url`);
    setBusy(false);
    if (!ok || !data?.url) { setMsg({ type: "error", text: error || "Could not get the invoice PDF." }); return; }
    window.open(data.url, "_blank", "noopener");
  }

  async function sendInvoice(inv) {
    if (!window.confirm(`Email invoice ${inv.xeroInvoiceNumber || ""} (with the PDF + pay link) to the client?`)) return;
    setBusy(true); setMsg(null);
    const { ok, error } = await apiPost(`/api/finance/xero-invoices/${inv.id}/send`, {});
    setBusy(false);
    if (!ok) { setMsg({ type: "error", text: error || "Could not send the invoice." }); return; }
    setMsg({ type: "success", text: "Invoice emailed to the client." });
    await loadAll();
  }

  return (
    <div className="rounded-card border border-hairline bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="section-label">Concept fee invoice (Xero)</h3>
        {status?.connected && <span className="text-[11px] text-muted">Xero: {status.tenant || "connected"}</span>}
      </div>

      {/* Gating hints */}
      {!accepted && (
        <p className="text-xs text-muted">Accept the concept agreement first — then you can raise the concept fee in Xero.</p>
      )}
      {accepted && status && !status.configured && (
        <p className="text-xs text-amber-700">Xero isn’t configured yet. Set it up in Settings → Integrations → Xero.</p>
      )}
      {accepted && status?.configured && !status.connected && (
        <p className="text-xs text-amber-700">Xero isn’t connected. Connect it in Settings → Integrations → Xero.</p>
      )}
      {accepted && status?.connected && !status.enabled && (
        <p className="text-xs text-amber-700">Xero invoicing is switched off (set <code>XERO_ENABLED=1</code> on the server).</p>
      )}
      {accepted && fee <= 0 && (
        <p className="text-xs text-amber-700">Set a concept fee above before raising the invoice.</p>
      )}

      {/* Create action */}
      {accepted && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={createConceptInvoice} disabled={busy || !canCreate}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {busy ? "Working…" : conceptInvoice?.xeroInvoiceId ? "Concept fee invoiced" : "Create invoice in Xero"}
          </button>
          {fee > 0 && !conceptInvoice?.xeroInvoiceId && (
            <span className="text-xs text-muted">{money(fee)} ex GST · {money(incGst(fee))} inc GST</span>
          )}
        </div>
      )}

      {/* Existing invoices */}
      {invoices.length > 0 && (
        <div className="space-y-2 pt-1">
          {invoices.map((inv) => (
            <div key={inv.id} className="rounded-lg border border-hairline bg-page px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink truncate">
                    {inv.xeroInvoiceNumber || "Draft"} · {money(inv.xeroTotal ?? incGst(inv.amountExGst))} inc GST
                  </div>
                  <div className="text-[11px] text-muted">
                    {inv.amountPaid > 0 && <>Paid {money(inv.amountPaid)} · </>}
                    {inv.amountDue != null && <>Due {money(inv.amountDue)}</>}
                  </div>
                </div>
                <StatusBadge status={inv.status} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                {inv.xeroInvoiceId && (
                  <button type="button" onClick={() => downloadPdf(inv.id)} disabled={busy} className="text-xs text-primary hover:underline disabled:opacity-50">Download PDF</button>
                )}
                {inv.onlineInvoiceUrl && (
                  <a href={inv.onlineInvoiceUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Pay link ↗</a>
                )}
                {inv.xeroInvoiceId && inv.status !== "void" && (
                  inv.sentAt
                    ? <span className="text-[11px] text-green-700">✓ Sent {fmtDate(inv.sentAt)}</span>
                    : <button type="button" onClick={() => sendInvoice(inv)} disabled={busy} className="text-xs font-medium text-accent hover:underline disabled:opacity-50">Send to client</button>
                )}
                {inv.xeroInvoiceId && (
                  <button type="button" onClick={() => sync(inv.id)} disabled={busy} className="text-xs text-muted hover:text-ink disabled:opacity-50">Sync status</button>
                )}
                {inv.errorMessage && <span className="text-[11px] text-red-600 w-full">{inv.errorMessage}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {msg && <p className={`text-xs ${msg.type === "error" ? "text-red-600" : "text-green-600"}`}>{msg.text}</p>}
    </div>
  );
}
