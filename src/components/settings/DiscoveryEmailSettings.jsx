import { useEffect, useState } from "react";
import { apiFetch, apiPost } from "../../lib/apiFetch.js";

// Admin-editable copy for the two Discovery-stage client emails (intro + 7-day follow-up), stored
// server-side (user_settings/crm_discovery_email). Both fall back to the approved defaults. Merge
// tokens are literal. Keep the CONTENT.txt voice (warm, plain, no "dream home / seamless").
const SAMPLE = {
  "{{client_salutation}}": "Jenna and Adam",
  "{{designer_name}}": "Bart",
  "{{designer_company}}": "Orange Tree Design",
  "{{concept_fee}}": "$500",
  "{{design_package_fee}}": "$15,000",
  "{{meeting_attendees}}": "Bart, Sam, Nik and myself",
  "{{user_signature}}": "Kind regards,\nSam Morris\nDirector\n0434 046 399",
};
const applySample = (s) => Object.entries(SAMPLE).reduce((acc, [k, v]) => acc.split(k).join(v), s || "");

export default function DiscoveryEmailSettings() {
  const [tab, setTab] = useState("intro");
  const [tpl, setTpl] = useState({ intro: { subject: "", body: "" }, followup: { subject: "", body: "" } });
  const [defaults, setDefaults] = useState(null);
  const [placeholders, setPlaceholders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let stop = false;
    (async () => {
      const { ok, data } = await apiFetch("/api/sales/discovery-email-template");
      if (stop) return;
      if (ok) {
        setTpl({
          intro: { subject: data.template?.intro?.subject || "", body: data.template?.intro?.body || "" },
          followup: { subject: data.template?.followup?.subject || "", body: data.template?.followup?.body || "" },
        });
        setDefaults(data.defaults || null);
        setPlaceholders(data.placeholders || []);
      } else {
        setError("Couldn't load the current templates.");
      }
      setLoading(false);
    })();
    return () => { stop = true; };
  }, []);

  const cur = tpl[tab];
  const setCur = (patch) => setTpl((t) => ({ ...t, [tab]: { ...t[tab], ...patch } }));

  async function save() {
    setSaving(true); setError(""); setNote("");
    const payload = {
      intro: { subject: tpl.intro.subject.trim(), body: tpl.intro.body.trim() },
      followup: { subject: tpl.followup.subject.trim(), body: tpl.followup.body.trim() },
    };
    const { ok, error: e } = await apiPost("/api/sales/discovery-email-template", payload);
    setSaving(false);
    if (ok) setNote("Saved — the Discovery emails will use this copy.");
    else setError(e || "Could not save.");
  }
  function resetToDefault() {
    if (!defaults?.[tab]) return;
    setCur({ subject: defaults[tab].subject, body: defaults[tab].body });
    setNote(""); setError("");
  }

  if (loading) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <section id="discovery-email" className="scroll-mt-24 rounded-card border border-hairline bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-primary">Discovery emails</h2>
      <p className="mt-1 text-sm text-muted max-w-2xl">
        The two client emails at the Discovery stage: the <strong>introduction</strong> (process + fees + the chosen designer) and the
        <strong> follow-up</strong> (auto-sent 7 days later if they haven&apos;t responded). Merge tokens are literal:
        {placeholders.map((p) => <code key={p} className="mx-0.5 rounded bg-page px-1 text-xs">{p}</code>)}
      </p>

      <div className="mt-4 flex gap-2">
        {["intro", "followup"].map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === k ? "bg-primary text-white" : "border border-hairline text-ink hover:bg-page"}`}>
            {k === "intro" ? "Introduction" : "Follow-up (7-day)"}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Subject</label>
            <input value={cur.subject} onChange={(e) => setCur({ subject: e.target.value })}
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus-ring" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Message</label>
            <textarea value={cur.body} onChange={(e) => setCur({ body: e.target.value })} rows={18}
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus-ring font-mono leading-relaxed" />
          </div>
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={save} disabled={saving}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-40">
              {saving ? "Saving…" : "Save both templates"}
            </button>
            <button type="button" onClick={resetToDefault} disabled={!defaults?.[tab]}
              className="rounded-lg border border-hairline px-4 py-2 text-sm font-medium text-ink hover:bg-page disabled:opacity-40">
              Reset this one to default
            </button>
          </div>
          {note && <p className="text-xs font-medium text-accent">{note}</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Preview (sample lead)</p>
          <div className="rounded-lg border border-hairline bg-page p-4">
            <p className="text-xs text-muted">From: admin@blueleafbuilding.com.au</p>
            <p className="text-sm font-semibold text-ink mt-0.5">{applySample(cur.subject) || <span className="text-muted">(no subject)</span>}</p>
            <hr className="my-3 border-hairline" />
            <div className="text-sm text-ink whitespace-pre-wrap leading-relaxed">{applySample(cur.body) || <span className="text-muted">(empty)</span>}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
