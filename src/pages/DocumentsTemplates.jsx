import { useEffect, useMemo, useState } from "react";
import { apiFetch, apiPost, apiPut } from "../lib/apiFetch.js";

const KIND_LABELS = {
  docx_template: "DOCX",
  pdf_generator: "App-generated PDF",
  email_md: "Email",
  whs_markdown: "WHS doc",
  reference_doc: "Reference",
};
const STATUS_STYLE = {
  active: "bg-emerald-100 text-emerald-700",
  planned: "bg-amber-100 text-amber-700",
  draft: "bg-slate-100 text-slate-600",
  archived: "bg-gray-100 text-gray-500",
};
const EDITABLE = new Set(["email_md", "whs_markdown"]);

export default function DocumentsTemplates() {
  const [templates, setTemplates] = useState([]);
  const [modules, setModules] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterModule, setFilterModule] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [editor, setEditor] = useState(null); // { template, content, loading, saving, exists }
  const [notice, setNotice] = useState(null);

  async function load() {
    setLoading(true);
    const { ok, data, error: e } = await apiFetch("/api/templates");
    setLoading(false);
    if (!ok) { setError(e || "Could not load templates."); return; }
    setTemplates(data?.templates || []);
    setModules(data?.modules || {});
  }
  useEffect(() => { load(); }, []);

  const counts = useMemo(() => {
    const planned = templates.filter((t) => t.status === "planned").length;
    const broken = templates.filter((t) => t.validationStatus === "broken").length;
    return { total: templates.length, planned, broken };
  }, [templates]);

  const visible = useMemo(() => templates.filter((t) =>
    (filterModule === "all" || t.module === filterModule) &&
    (filterStatus === "all" || t.status === filterStatus)
  ), [templates, filterModule, filterStatus]);

  const grouped = useMemo(() => {
    const g = {};
    for (const t of visible) (g[t.module] ||= []).push(t);
    return g;
  }, [visible]);

  async function openInDropbox(t) {
    setNotice(null);
    const { ok, data, error: e } = await apiFetch(`/api/templates/${t.key}/dropbox-link`);
    if (!ok || !data?.url) { setNotice(e || "Could not get a Dropbox link (is Dropbox connected?)."); return; }
    window.open(data.url, "_blank", "noopener");
  }

  async function openEditor(t) {
    setEditor({ template: t, content: "", loading: true, saving: false, exists: false });
    const { ok, data, error: e } = await apiFetch(`/api/templates/${t.key}/content`);
    if (!ok) { setEditor({ template: t, content: "", loading: false, saving: false, exists: false, error: e }); return; }
    setEditor({ template: t, content: data?.content || "", loading: false, saving: false, exists: !!data?.exists });
  }
  async function saveEditor() {
    setEditor((s) => ({ ...s, saving: true, error: null }));
    const { ok, error: e } = await apiPut(`/api/templates/${editor.template.key}/content`, { content: editor.content });
    if (!ok) { setEditor((s) => ({ ...s, saving: false, error: e || "Save failed." })); return; }
    setEditor(null);
    setNotice(`Saved “${editor.template.title}” to Dropbox.`);
    load();
  }

  async function setupFolders() {
    setNotice("Setting up Dropbox folders…");
    const { ok, data, error: e } = await apiPost("/api/templates/setup-folders", {});
    setNotice(ok ? `Set up ${data?.created?.length || 0} module folders + ${data?.files || 0} template masters in Dropbox.` : (e || "Folder setup failed."));
  }

  if (loading) return <div className="p-10 text-center text-muted text-sm">Loading templates…</div>;
  if (error) return <div className="p-10 text-center text-red-600 text-sm">{error}</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="text-xl font-semibold text-ink">Documents &amp; Templates</h1>
          <p className="text-sm text-muted mt-0.5">
            Every template across the Hub — {counts.total} items{counts.planned ? `, ${counts.planned} not built yet` : ""}.
            Edit masters in Dropbox; email/WHS text can be edited here.
          </p>
        </div>
        <button onClick={setupFolders} className="shrink-0 px-3 py-2 rounded-lg border border-hairline text-sm font-medium text-ink hover:bg-page transition-colors">
          Set up Dropbox folders
        </button>
      </div>

      {counts.broken > 0 && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          ⚠ {counts.broken} template{counts.broken > 1 ? "s have" : " has"} a broken merge field — fix before generating.
        </div>
      )}
      {notice && <div className="mt-3 rounded-lg border border-hairline bg-page px-4 py-2.5 text-sm text-ink">{notice}</div>}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mt-4 mb-5">
        <select value={filterModule} onChange={(e) => setFilterModule(e.target.value)} className="border border-hairline rounded-lg px-3 py-1.5 text-sm focus-ring">
          <option value="all">All modules</option>
          {Object.entries(modules).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="border border-hairline rounded-lg px-3 py-1.5 text-sm focus-ring">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="planned">Required (not built)</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {Object.keys(grouped).length === 0 && <p className="text-sm text-muted">No templates match these filters.</p>}

      {Object.entries(grouped).map(([modKey, items]) => (
        <div key={modKey} className="mb-6">
          <h2 className="text-sm font-semibold text-ink mb-2">{modules[modKey]?.label || modKey}</h2>
          <div className="rounded-card border border-hairline divide-y divide-hairline bg-white">
            {items.map((t) => (
              <div key={t.key} className="p-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-ink">{t.title}</span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{KIND_LABELS[t.kind] || t.kind}</span>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded ${STATUS_STYLE[t.status] || STATUS_STYLE.draft}`}>
                      {t.status === "planned" ? "Not built" : t.status}
                    </span>
                    {t.validationStatus === "broken" && <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">⚠ broken</span>}
                  </div>
                  {t.purpose && <p className="text-xs text-muted mt-1">{t.purpose}</p>}
                  <p className="text-[11px] text-muted/80 mt-1">{t.editMethod || ""}</p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1.5">
                  {EDITABLE.has(t.kind) && t.status !== "planned" && (
                    <button onClick={() => openEditor(t)} className="text-xs font-medium text-primary hover:underline">Edit in Hub</button>
                  )}
                  <button onClick={() => openInDropbox(t)} className="text-xs font-medium text-muted hover:text-ink">Open in Dropbox</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* In-Hub editor */}
      {editor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-hairline">
              <div>
                <h2 className="text-base font-semibold text-ink">{editor.template.title}</h2>
                <p className="text-xs text-muted mt-0.5">
                  {editor.exists ? "Editing the Dropbox master" : "No master yet — saving creates it in Dropbox"} · merge fields use {"{field}"} syntax
                </p>
              </div>
              <button onClick={() => setEditor(null)} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {editor.loading ? (
                <p className="text-sm text-muted">Loading…</p>
              ) : (
                <textarea
                  value={editor.content}
                  onChange={(e) => setEditor((s) => ({ ...s, content: e.target.value }))}
                  rows={16}
                  placeholder="Write the email/markdown body here. Use {client_name}, {quote_number} etc. for merge fields."
                  className="w-full border border-hairline rounded-lg px-3 py-2 text-sm font-mono focus-ring resize-y"
                />
              )}
              {editor.error && <p className="text-xs text-red-600 mt-2">{editor.error}</p>}
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-hairline">
              <button onClick={() => setEditor(null)} className="px-4 py-2 rounded-lg border border-hairline text-sm font-medium">Cancel</button>
              <button onClick={saveEditor} disabled={editor.loading || editor.saving} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-40">
                {editor.saving ? "Saving…" : "Save to Dropbox"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
