import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiFetch, apiPut, apiPost } from "../lib/apiFetch.js";

const isYes = (v) => v === "yes" || v === true || v === "true";

function DerivedList({ title, items }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">{title}</p>
      <ul className="text-sm text-ink list-disc pl-5 space-y-0.5">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  );
}

export default function WhsEngine() {
  const { projectId } = useParams();
  const [questionnaire, setQuestionnaire] = useState([]);
  const [answers, setAnswers] = useState({});
  const [profile, setProfile] = useState(null);
  const [prefillKeys, setPrefillKeys] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [open, setOpen] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState(null);

  async function loadDocuments() {
    const { ok, data } = await apiFetch(`/api/whs/projects/${projectId}/documents`);
    if (ok) setDocuments(data.documents || []);
  }

  useEffect(() => {
    let stop = false;
    (async () => {
      const { ok, data } = await apiFetch(`/api/whs/projects/${projectId}/profile`);
      if (stop) return;
      if (ok) {
        setQuestionnaire(data.questionnaire || []);
        const savedAnswers = data.profile?.answers || {};
        const prefill = data.prefill || {};
        // Prefill fills any key that has no saved value — saved answers always win
        const blended = { ...prefill, ...savedAnswers };
        // Track which keys were actually applied from prefill (not overridden)
        const applied = Object.keys(prefill).filter((k) => !savedAnswers[k] && prefill[k]);
        setPrefillKeys(applied);
        if (data.profile) setProfile(data.profile);
        setAnswers(blended);
      }
      await loadDocuments();
      if (!stop) setLoading(false);
    })();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const setAnswer = (key, val) => setAnswers((a) => ({ ...a, [key]: val }));

  const moduleVisible = (m) =>
    !m.appliesWhen || (m.appliesWhen.anyOf || []).some((k) => isYes(answers[k]));

  const visibleModules = useMemo(
    () => questionnaire.filter(moduleVisible),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questionnaire, answers]
  );

  async function save() {
    setSaving(true);
    setMsg(null);
    const { ok, data, error } = await apiPut(`/api/whs/projects/${projectId}/profile`, { answers });
    setSaving(false);
    if (ok) {
      setProfile(data.profile);
      setMsg({ kind: "ok", text: "WHS profile saved. Risk outputs recalculated." });
    } else {
      setMsg({ kind: "err", text: error || "Save failed" });
    }
  }

  async function generatePlan() {
    setGenerating(true);
    setMsg(null);
    const { ok, data, error } = await apiPost(`/api/whs/projects/${projectId}/generate/project_whs_management_plan`);
    setGenerating(false);
    if (ok) {
      await loadDocuments();
      const mr = data.missingRequired || [];
      setMsg(mr.length
        ? { kind: "warn", text: `Generated, but ${mr.length} required field(s) still blank: ${mr.join(", ")}` }
        : { kind: "ok", text: "WHS Management Plan generated." });
    } else {
      setMsg({ kind: "err", text: error || "Generate failed" });
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function renderQuestion(q) {
    const val = answers[q.key];

    // Special rendering for induction URL — show as editable field + copy button
    if (q.key === "site_qr_induction_url") {
      return (
        <div className="flex gap-2 items-center">
          <input
            type="url"
            value={val || ""}
            onChange={(e) => setAnswer(q.key, e.target.value)}
            className="flex-1 rounded-lg border border-hairline px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono text-xs"
          />
          <button
            type="button"
            onClick={() => copyToClipboard(val || "")}
            disabled={!val}
            className="shrink-0 px-3 py-2 rounded-lg border border-hairline text-xs text-muted hover:bg-slate-50 disabled:opacity-40"
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>
      );
    }
    if (q.type === "yesno") {
      return (
        <div className="flex gap-2">
          {["yes", "no"].map((opt) => (
            <button key={opt} type="button" onClick={() => setAnswer(q.key, opt)}
              className={`px-3 py-1.5 rounded-lg text-sm border capitalize ${isYes(val) === (opt === "yes") && val != null ? "bg-primary text-white border-primary" : "bg-white text-ink border-hairline"}`}>
              {opt}
            </button>
          ))}
        </div>
      );
    }
    if (q.type === "select") {
      return (
        <select value={val || ""} onChange={(e) => setAnswer(q.key, e.target.value)}
          className="w-full rounded-lg border border-hairline px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
          <option value="" disabled>Select…</option>
          {q.options.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
        </select>
      );
    }
    if (q.type === "number") {
      return (
        <input type="number" value={val ?? ""} onChange={(e) => setAnswer(q.key, e.target.value)}
          className="w-32 rounded-lg border border-hairline px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
      );
    }
    if (q.type === "list") {
      return (
        <textarea rows={3} placeholder="One per line"
          value={Array.isArray(val) ? val.join("\n") : ""}
          onChange={(e) => setAnswer(q.key, e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
          className="w-full rounded-lg border border-hairline px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
      );
    }
    return (
      <input type="text" value={val || ""} onChange={(e) => setAnswer(q.key, e.target.value)}
        className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
    );
  }

  if (loading) return <div className="p-6 text-sm text-muted">Loading WHS setup…</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-28">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-primary">WHS Setup</h1>
        <Link to={`/operations/${projectId}/whs`} className="text-sm text-primary hover:underline">← WHS Manager</Link>
      </div>
      <p className="text-sm text-muted mb-5">
        Answer once. The risk engine generates the WHS documents, SWMS, permits, inspections and registers.
      </p>

      {prefillKeys.length > 0 && (
        <div className="mb-4 rounded-lg px-4 py-2.5 text-sm border bg-blue-50 border-blue-200 text-blue-800">
          ℹ️ Some fields were pre-filled from project data — review and adjust as needed.
        </div>
      )}

      {msg && (
        <div className={`mb-4 rounded-lg px-4 py-2.5 text-sm border ${
          msg.kind === "ok" ? "bg-green-50 border-green-200 text-green-800"
          : msg.kind === "warn" ? "bg-amber-50 border-amber-200 text-amber-800"
          : "bg-red-50 border-red-200 text-red-700"}`}>
          {msg.text}
        </div>
      )}

      {/* Modules */}
      <div className="space-y-3">
        {visibleModules.map((m) => {
          const isOpen = open[m.id] ?? (m.id === "m0" || m.id === "m5");
          return (
            <div key={m.id} className="rounded-card border border-hairline bg-surface">
              <button type="button" onClick={() => setOpen((o) => ({ ...o, [m.id]: !isOpen }))}
                className="w-full flex items-center justify-between px-4 py-3 text-left">
                <span className="text-sm font-semibold text-ink">{m.title}</span>
                <span className="text-muted text-xs">{isOpen ? "▲" : "▼"}</span>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 space-y-4 border-t border-hairline pt-3">
                  {m.note && <p className="text-xs text-muted">{m.note}</p>}
                  {m.questions.map((q) => (
                    <div key={q.key}>
                      <label className="block text-sm text-ink mb-1">{q.label}</label>
                      {renderQuestion(q)}
                      {q.codeRef && <p className="text-[11px] text-muted mt-0.5">{q.codeRef}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Derived outputs */}
      {profile && (
        <div className="mt-6 rounded-card border border-hairline bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink mb-3">Generated risk profile (v{profile.version})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DerivedList title="High-risk work" items={profile.highRiskActivities} />
            <DerivedList title="Applicable SWMS" items={profile.applicableSwms} />
            <DerivedList title="Permits" items={profile.applicablePermits} />
            <DerivedList title="Inspections" items={profile.requiredInspections} />
            <DerivedList title="Registers" items={profile.requiredRegisters} />
            <DerivedList title="Site hazards" items={profile.siteHazards} />
          </div>
          {!profile.highRiskActivities?.length && (
            <p className="text-sm text-muted">Save the questionnaire to calculate outputs.</p>
          )}
        </div>
      )}

      {/* Documents */}
      <div className="mt-6 rounded-card border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink mb-3">Generated documents</h2>
        {documents.length === 0 ? (
          <p className="text-sm text-muted">None yet.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink">{d.documentTitle}</span>
                <span className="flex items-center gap-2">
                  {d.isStale && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Stale</span>}
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-muted capitalize">{d.status?.replace(/_/g, " ")}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Sticky actions */}
      <div className="fixed inset-x-0 bottom-0 border-t border-hairline bg-page px-4 py-3">
        <div className="max-w-3xl mx-auto flex gap-3">
          <button type="button" onClick={save} disabled={saving}
            className="flex-1 py-3 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50">
            {saving ? "Saving…" : "Save WHS profile"}
          </button>
          <button type="button" onClick={generatePlan} disabled={generating || !profile}
            className="flex-1 py-3 rounded-lg border border-primary text-primary text-sm font-semibold disabled:opacity-50">
            {generating ? "Generating…" : "Generate WHS Plan"}
          </button>
        </div>
      </div>
    </div>
  );
}
