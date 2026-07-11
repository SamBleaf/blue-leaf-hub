import { useEffect, useState } from "react";
import { apiFetch, apiPost } from "../../lib/apiFetch.js";

// Admin-editable copy for the one client-facing auto-email: the acknowledgement sent the moment a
// new enquiry is captured. Stored server-side (user_settings/crm_enquiry_ack) so the sender reads
// it; falls back to the approved default if left blank. {name} → the enquirer's first name.
export default function EnquiryAckSettings() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [defaults, setDefaults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let stop = false;
    (async () => {
      const { ok, data } = await apiFetch("/api/sales/enquiry-ack-template");
      if (stop) return;
      if (ok) {
        setSubject(data.template?.subject || "");
        setBody(data.template?.body || "");
        setDefaults(data.defaults || null);
      } else {
        setError("Couldn't load the current reply.");
      }
      setLoading(false);
    })();
    return () => { stop = true; };
  }, []);

  async function save() {
    setSaving(true); setError(""); setNote("");
    const { ok, error: e } = await apiPost("/api/sales/enquiry-ack-template", { subject: subject.trim(), body: body.trim() });
    setSaving(false);
    if (ok) setNote("Saved — new enquiries will use this reply.");
    else setError(e || "Could not save.");
  }

  function resetToDefault() {
    if (!defaults) return;
    setSubject(defaults.subject);
    setBody(defaults.body);
    setNote(""); setError("");
  }

  const previewBody = body.replace(/\{name\}/g, "Jane");
  const dirty = defaults && (subject.trim() !== defaults.subject || body.trim() !== defaults.body);

  if (loading) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <section id="enquiry-ack" className="scroll-mt-24 rounded-card border border-hairline bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-primary">Enquiry auto-reply</h2>
      <p className="mt-1 text-sm text-muted max-w-2xl">
        The one automatic email a client receives — sent the instant a new enquiry comes in, so no lead
        goes unacknowledged. Keep it simple: it confirms receipt, and does not pitch or promise anything
        beyond a review. Use <code className="rounded bg-page px-1 text-xs">{"{name}"}</code> for their first name.
      </p>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* Editor */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus-ring"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={9}
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus-ring font-mono leading-relaxed"
            />
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={save}
              disabled={saving || !subject.trim() || !body.trim()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save reply"}
            </button>
            <button
              type="button"
              onClick={resetToDefault}
              disabled={!dirty}
              className="rounded-lg border border-hairline px-4 py-2 text-sm font-medium text-ink hover:bg-page disabled:opacity-40"
            >
              Reset to default
            </button>
          </div>
          {note && <p className="text-xs font-medium text-accent">{note}</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        {/* Live preview */}
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Preview (client sees)</p>
          <div className="rounded-lg border border-hairline bg-page p-4">
            <p className="text-xs text-muted">From: admin@blueleafbuilding.com.au</p>
            <p className="text-sm font-semibold text-ink mt-0.5">{subject || <span className="text-muted">(no subject)</span>}</p>
            <hr className="my-3 border-hairline" />
            <div className="text-sm text-ink whitespace-pre-wrap leading-relaxed">{previewBody || <span className="text-muted">(empty)</span>}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
