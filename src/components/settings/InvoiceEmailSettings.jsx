import { useEffect, useState } from "react";
import { apiFetch, apiPost } from "../../lib/apiFetch.js";

// Admin-editable copy for the client-facing invoice email (Xero AR). Stored server-side
// (user_settings/crm_invoice_email); falls back to the default. Merge tokens are literal.
const SAMPLE = {
  "{{client_salutation}}": "Jenna and Adam",
  "{{invoice_number}}": "INV-0042",
  "{{amount_inc}}": "$550.00",
  "{{pay_link}}": "https://in.xero.com/pay/abc123",
  "{{user_signature}}": "Kind regards,\nSam Morris\nDirector\n0434 046 399",
};
const applySample = (s) => Object.entries(SAMPLE).reduce((acc, [k, v]) => acc.split(k).join(v), s || "");

export default function InvoiceEmailSettings() {
  const [tpl, setTpl] = useState({ subject: "", body: "" });
  const [defaults, setDefaults] = useState(null);
  const [placeholders, setPlaceholders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let stop = false;
    (async () => {
      const { ok, data } = await apiFetch("/api/sales/invoice-email-template");
      if (stop) return;
      if (ok) {
        setTpl({ subject: data.template?.subject || "", body: data.template?.body || "" });
        setDefaults(data.defaults || null);
        setPlaceholders(data.placeholders || []);
      } else {
        setError("Couldn't load the current template.");
      }
      setLoading(false);
    })();
    return () => { stop = true; };
  }, []);

  async function save() {
    setSaving(true); setError(""); setNote("");
    const { ok, error: e } = await apiPost("/api/sales/invoice-email-template", { subject: tpl.subject.trim(), body: tpl.body.trim() });
    setSaving(false);
    if (ok) setNote("Saved — the invoice email will use this copy.");
    else setError(e || "Could not save.");
  }
  function resetToDefault() {
    if (!defaults) return;
    setTpl({ subject: defaults.subject, body: defaults.body });
    setNote(""); setError("");
  }

  if (loading) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <section id="invoice-email" className="scroll-mt-24 rounded-card border border-hairline bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-primary">Invoice email</h2>
      <p className="mt-1 text-sm text-muted max-w-2xl">
        The email sent to the client when you click <strong>Send to client</strong> on a Xero invoice. The official Xero PDF is
        always attached automatically. Merge tokens are literal:
        {placeholders.map((p) => <code key={p} className="mx-0.5 rounded bg-page px-1 text-xs">{p}</code>)}
      </p>

      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Subject</label>
            <input value={tpl.subject} onChange={(e) => setTpl((t) => ({ ...t, subject: e.target.value }))}
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus-ring" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Message</label>
            <textarea value={tpl.body} onChange={(e) => setTpl((t) => ({ ...t, body: e.target.value }))} rows={14}
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus-ring font-mono leading-relaxed" />
          </div>
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={save} disabled={saving}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-40">
              {saving ? "Saving…" : "Save template"}
            </button>
            <button type="button" onClick={resetToDefault} disabled={!defaults}
              className="rounded-lg border border-hairline px-4 py-2 text-sm font-medium text-ink hover:bg-page disabled:opacity-40">
              Reset to default
            </button>
          </div>
          {note && <p className="text-xs font-medium text-accent">{note}</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Preview (sample invoice)</p>
          <div className="rounded-lg border border-hairline bg-page p-4">
            <p className="text-xs text-muted">From: admin@blueleafbuilding.com.au</p>
            <p className="text-sm font-semibold text-ink mt-0.5">{applySample(tpl.subject) || <span className="text-muted">(no subject)</span>}</p>
            <hr className="my-3 border-hairline" />
            <div className="text-sm text-ink whitespace-pre-wrap leading-relaxed">{applySample(tpl.body) || <span className="text-muted">(empty)</span>}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
