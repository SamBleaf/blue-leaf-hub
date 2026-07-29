// WHS / SWMS Library — Settings pane (Modules & templates). The ONE place SWMS are authored;
// they auto-attach to carpentry jobs by type and are signed on by workers in the field app.
import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiPatch } from "../../lib/apiFetch.js";

const CATEGORY_LABELS = {
  first_fix_framing: "First fix / framing", cladding: "Cladding", second_fix: "Second fix",
  roofing: "Roofing", demolition: "Demolition", general: "General (all jobs)",
};

export default function SwmsLibrarySettings() {
  const [templates, setTemplates] = useState(null);
  const [error, setError]   = useState("");
  const [openId, setOpenId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [form, setForm]     = useState(null);
  const [busy, setBusy]     = useState(false);

  const load = useCallback(async () => {
    const { ok, data, error } = await apiFetch("/api/whs/swms-library");
    if (!ok) { setError(error || "Could not load the SWMS library."); return; }
    setError(""); setTemplates(data?.templates || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const patch = async (id, body) => {
    setBusy(true);
    const { ok, error } = await apiPatch(`/api/whs/swms-library/${id}`, body);
    setBusy(false);
    if (!ok) { setError(error || "Update failed."); return false; }
    await load(); return true;
  };

  const startEdit = (t) => {
    setEditId(t.id); setOpenId(t.id);
    setForm({
      title: t.title || "", summary: t.summary || "", source: t.source || "",
      workCategory: (t.workCategory || []).join(", "), contentHtml: t.contentHtml || "",
      isHighRisk: !!t.isHighRisk, bumpVersion: false,
    });
  };
  const saveEdit = async () => {
    const ok = await patch(editId, {
      title: form.title, summary: form.summary, source: form.source,
      contentHtml: form.contentHtml, isHighRisk: form.isHighRisk,
      workCategory: form.workCategory.split(",").map((s) => s.trim()).filter(Boolean),
      bumpVersion: form.bumpVersion,
    });
    if (ok) { setEditId(null); setForm(null); }
  };

  if (error && templates === null) return <div className="text-sm text-red-600">{error}</div>;
  if (templates === null) return <div className="text-sm text-muted">Loading…</div>;

  const carpentry = templates.filter((t) => String(t.trade || "").toLowerCase() === "carpentry");

  return (
    <section className="rounded-card border border-hairline bg-surface p-6 shadow-sm space-y-4">
      <header>
        <h2 className="text-lg font-semibold text-primary">WHS / SWMS Library</h2>
        <p className="text-sm text-muted mt-1">Safe Work Method Statements — authored once here and shared across every carpentry job (auto-attached by job type; signed on by workers in the field app). Drafts show <b>DRAFT</b> until you mark them reviewed by a WHS professional.</p>
      </header>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

      <div className="space-y-2">
        {carpentry.length === 0 && <p className="text-sm text-muted">No carpentry SWMS yet — apply migration 163 to seed the library.</p>}
        {carpentry.map((t) => (
          <div key={t.id} className="rounded-lg border border-hairline">
            <div className="flex items-center gap-2 px-3 py-2">
              <button onClick={() => setOpenId(openId === t.id ? null : t.id)} className="flex-1 text-left">
                <div className="text-sm font-medium text-ink">{t.title} <span className="text-[10px] text-muted">v{t.version}</span></div>
                <div className="text-[11px] text-muted">{(t.workCategory || []).map((c) => CATEGORY_LABELS[c] || c).join(" · ") || "no categories"}</div>
              </button>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${t.reviewStatus === "reviewed" ? "bg-accent/15 text-accent" : "bg-warning/20 text-warning"}`}>{t.reviewStatus === "reviewed" ? "Reviewed" : "DRAFT"}</span>
              {t.isActive === false && <span className="text-[10px] text-muted">inactive</span>}
            </div>

            {openId === t.id && editId !== t.id && (
              <div className="border-t border-hairline px-3 py-3 space-y-3">
                <div className="prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: t.contentHtml || "<p>No content.</p>" }} />
                {t.source && <p className="text-[11px] text-muted">Source: {t.source}</p>}
                <div className="flex flex-wrap gap-2">
                  {t.reviewStatus === "reviewed"
                    ? <button disabled={busy} onClick={() => patch(t.id, { reviewStatus: "draft" })} className="rounded-md border border-hairline px-3 py-1 text-xs font-semibold">Mark as draft</button>
                    : <button disabled={busy} onClick={() => patch(t.id, { reviewStatus: "reviewed" })} className="rounded-md bg-accent px-3 py-1 text-xs font-semibold text-white">Mark reviewed</button>}
                  <button disabled={busy} onClick={() => patch(t.id, { isActive: t.isActive === false })} className="rounded-md border border-hairline px-3 py-1 text-xs font-semibold">{t.isActive === false ? "Reactivate" : "Deactivate"}</button>
                  <button onClick={() => startEdit(t)} className="rounded-md border border-primary px-3 py-1 text-xs font-semibold text-primary">Edit</button>
                </div>
              </div>
            )}

            {editId === t.id && form && (
              <div className="border-t border-hairline px-3 py-3 space-y-2">
                <label className="block text-xs font-semibold text-muted">Title<input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="mt-1 w-full rounded-md border border-hairline px-2 py-1 text-sm" /></label>
                <label className="block text-xs font-semibold text-muted">Summary<input value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} className="mt-1 w-full rounded-md border border-hairline px-2 py-1 text-sm" /></label>
                <label className="block text-xs font-semibold text-muted">Work categories (comma-separated: first_fix_framing, cladding, second_fix, roofing, demolition, general)<input value={form.workCategory} onChange={(e) => setForm((f) => ({ ...f, workCategory: e.target.value }))} className="mt-1 w-full rounded-md border border-hairline px-2 py-1 text-sm" /></label>
                <label className="block text-xs font-semibold text-muted">Content (HTML)<textarea rows={10} value={form.contentHtml} onChange={(e) => setForm((f) => ({ ...f, contentHtml: e.target.value }))} className="mt-1 w-full rounded-md border border-hairline px-2 py-1 text-xs font-mono" /></label>
                <label className="block text-xs font-semibold text-muted">Source<input value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} className="mt-1 w-full rounded-md border border-hairline px-2 py-1 text-sm" /></label>
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.isHighRisk} onChange={(e) => setForm((f) => ({ ...f, isHighRisk: e.target.checked }))} /> High-risk work</label>
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.bumpVersion} onChange={(e) => setForm((f) => ({ ...f, bumpVersion: e.target.checked }))} /> This is a revision — require all workers to re-sign (bumps the version)</label>
                <div className="flex gap-2 pt-1">
                  <button disabled={busy} onClick={saveEdit} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white disabled:opacity-40">Save</button>
                  <button onClick={() => { setEditId(null); setForm(null); }} className="rounded-md border border-hairline px-3 py-1 text-xs">Cancel</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
