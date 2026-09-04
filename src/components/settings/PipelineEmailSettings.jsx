import { useEffect, useState } from "react";
import { apiFetch, apiPost } from "../../lib/apiFetch.js";

// Admin-editable copy for the pipeline "gap" emails (the new crm_pipeline_email family) that show in
// the Stage-email dropdown: PTSA covering, contract-signed, ops-handoff, nurture, lost, tender-started.
// Multi-template, generic over the keys the API returns. Merge tokens are literal. Keeps the warm,
// plain house voice.
const LABELS = {
  ptsa_covering: "PTSA covering",
  contract_signed: "Contract signed",
  ops_handoff: "Ops handoff",
  nurture: "Nurture",
  lost: "Lost close-off",
  tender_started: "Tender started",
};
const SAMPLE = {
  "{{client_salutation}}": "Jenna and Adam",
  "{{ptsa_fee}}": "$16,500 incl. GST",
  "{{user_signature}}": "Kind regards,\nSam Morris\nDirector\n0434 046 399",
};
const applySample = (s) => Object.entries(SAMPLE).reduce((acc, [k, v]) => acc.split(k).join(v), s || "");

export default function PipelineEmailSettings() {
  const [keys, setKeys] = useState([]);
  const [tab, setTab] = useState("");
  const [tpl, setTpl] = useState({});
  const [defaults, setDefaults] = useState({});
  const [placeholders, setPlaceholders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let stop = false;
    (async () => {
      const { ok, data } = await apiFetch("/api/sales/pipeline-email-template");
      if (stop) return;
      if (ok) {
        const ks = data.keys || Object.keys(data.template || {});
        setKeys(ks);
        setTab(ks[0] || "");
        const t = {};
        ks.forEach((k) => { t[k] = { subject: data.template?.[k]?.subject || "", body: data.template?.[k]?.body || "" }; });
        setTpl(t);
        setDefaults(data.defaults || {});
        setPlaceholders(data.placeholders || []);
      } else {
        setError("Couldn't load the current templates.");
      }
      setLoading(false);
    })();
    return () => { stop = true; };
  }, []);

  const cur = tpl[tab] || { subject: "", body: "" };
  const setCur = (patch) => setTpl((t) => ({ ...t, [tab]: { ...t[tab], ...patch } }));

  async function save() {
    setSaving(true); setError(""); setNote("");
    const payload = {};
    keys.forEach((k) => { payload[k] = { subject: (tpl[k]?.subject || "").trim(), body: (tpl[k]?.body || "").trim() }; });
    const { ok, error: e } = await apiPost("/api/sales/pipeline-email-template", payload);
    setSaving(false);
    if (ok) setNote("Saved — these pipeline emails will use this copy."); else setError(e || "Could not save.");
  }
  function resetToDefault() {
    if (!defaults?.[tab]) return;
    setCur({ subject: defaults[tab].subject, body: defaults[tab].body });
    setNote(""); setError("");
  }

  if (loading) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <section id="pipeline-email" className="scroll-mt-24 rounded-card border border-hairline bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-primary">Pipeline emails (PTSA, Won, nurture &amp; lost)</h2>
      <p className="mt-1 text-sm text-muted max-w-2xl">
        The stage emails in the Stage-email dropdown: the <strong>PTSA covering</strong> email, the
        {" "}<strong>contract-signed welcome</strong> + <strong>Operations handoff</strong> (Won), the <strong>nurture</strong> check-in,
        the <strong>lost</strong> close-off and the <strong>tender-started</strong> update. Merge tokens are literal:
        {placeholders.map((p) => <code key={p} className="mx-0.5 rounded bg-page px-1 text-xs">{p}</code>)}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {keys.map((k) => (
          <button key={k} type="button" onClick={() => { setTab(k); setNote(""); setError(""); }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === k ? "bg-primary text-white" : "border border-hairline text-ink hover:bg-page"}`}>
            {LABELS[k] || k}
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
            <textarea value={cur.body} onChange={(e) => setCur({ body: e.target.value })} rows={16}
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus-ring font-mono leading-relaxed" />
          </div>
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={save} disabled={saving}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-40">
              {saving ? "Saving…" : "Save all templates"}
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
