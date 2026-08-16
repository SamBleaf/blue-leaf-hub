import { useEffect, useState } from "react";
import { apiFetch, apiPost } from "../../lib/apiFetch.js";

// Xero integration pane (Settings → Integrations → Xero). Connects Xero as the
// accounts-receivable / client-invoice source of truth: the Hub creates + sends
// invoices, Xero renders the official PDF (via its Branding Themes) and tracks payment.
// The connect flow is OAuth2 — this button opens Xero's authorize page; Xero redirects
// back to /api/public/xero/callback which stores the tokens and returns here with a flag.
export default function XeroPane() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState(null); // { type, text }

  async function load() {
    const { ok, data } = await apiFetch("/api/finance/xero/status");
    if (ok) setStatus(data);
  }

  useEffect(() => {
    // Surface the outcome of the OAuth round-trip (and clean the flags off the URL).
    const params = new URLSearchParams(window.location.search);
    if (params.get("xero_connected")) {
      setBanner({ type: "success", text: "Xero connected." });
    } else if (params.get("xero_error")) {
      setBanner({ type: "error", text: `Xero connection failed: ${params.get("xero_error")}` });
    }
    if (params.has("xero_connected") || params.has("xero_error")) {
      params.delete("xero_connected"); params.delete("xero_error");
      const qs = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
    }
    load();
  }, []);

  async function connect() {
    setBusy(true); setBanner(null);
    const { ok, data, error } = await apiFetch("/api/finance/xero/connect");
    setBusy(false);
    if (!ok || !data?.url) { setBanner({ type: "error", text: error || "Could not start the Xero connection." }); return; }
    window.location.href = data.url; // hand off to Xero's authorize page
  }

  async function disconnect() {
    if (!window.confirm("Disconnect Xero? The Hub will stop creating and syncing invoices until you reconnect.")) return;
    setBusy(true); setBanner(null);
    const { ok, error } = await apiPost("/api/finance/xero/disconnect", {});
    setBusy(false);
    if (!ok) { setBanner({ type: "error", text: error || "Could not disconnect." }); return; }
    setBanner({ type: "success", text: "Xero disconnected." });
    await load();
  }

  const configured = status?.configured;
  const connected = status?.connected;

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h3 className="text-sm font-bold text-ink mb-1">Xero</h3>
        <p className="text-xs text-muted mb-4">
          Connect Xero to raise client invoices (concept fees, design packages, progress claims) as real
          Xero invoices — with GST, the official branded PDF, a pay link, and live paid/unpaid status.
          The Hub sends and files them; Xero remains the accounting source of truth.
        </p>

        {banner && (
          <div className={`mb-3 rounded-lg px-3 py-2 text-xs ${banner.type === "error" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
            {banner.text}
          </div>
        )}

        <div className="rounded-card border border-hairline bg-surface p-4">
          {status == null ? (
            <div className="text-sm text-muted">Loading…</div>
          ) : !configured ? (
            <div className="text-sm">
              <div className="font-semibold text-ink">Not configured</div>
              <p className="text-xs text-muted mt-1">
                Set <code>XERO_CLIENT_ID</code> and <code>XERO_CLIENT_SECRET</code> on the server (from a Xero
                app at developer.xero.com), with the redirect URI below, then reload.
              </p>
              {status.redirectUri && (
                <p className="text-[11px] text-muted mt-2">Redirect URI: <code className="break-all">{status.redirectUri}</code></p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink">
                  {connected ? `Connected — ${status.tenant || "Xero organisation"}` : "Not connected"}
                </div>
                <div className="text-xs text-muted mt-0.5">
                  {connected
                    ? (status.tokenFresh ? "Token healthy" : "Token will refresh on next use")
                    : "Connect your Xero organisation to enable invoicing."}
                  {!status.enabled && connected ? " · invoicing is OFF (set XERO_ENABLED=1 to switch on)" : ""}
                </div>
              </div>
              {connected ? (
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={connect} disabled={busy}
                    className="rounded-lg border border-hairline bg-page px-3 py-2 text-xs font-semibold text-ink hover:bg-surface disabled:opacity-50">
                    Reconnect
                  </button>
                  <button type="button" onClick={disconnect} disabled={busy}
                    className="rounded-lg border border-hairline bg-page px-3 py-2 text-xs font-semibold text-muted hover:bg-surface disabled:opacity-50">
                    Disconnect
                  </button>
                </div>
              ) : (
                <button type="button" onClick={connect} disabled={busy}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 shrink-0">
                  {busy ? "Working…" : "Connect Xero"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-ink mb-1">Approval thresholds</h3>
        <p className="text-xs text-muted">Set <code>FINANCE_AUTO_APPROVE_BELOW</code> on the server to auto-approve exact-matched invoices under a dollar amount. Currently disabled — all invoices go to the approval queue.</p>
      </div>
    </div>
  );
}
