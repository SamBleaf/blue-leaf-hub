// WHS / SWMS Library — Settings pane. The ONE place the WHS control modules are reviewed and edited,
// in plain-english fields (no raw HTML), with a live preview of the finished document. Content is
// authored by the WHS consultant/agent and stays DRAFT until a competent reviewer marks it reviewed.
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, apiPatch } from "../../lib/apiFetch.js";

const CATEGORY_LABELS = {
  first_fix_framing: "First fix / framing", cladding: "Cladding", second_fix: "Second fix",
  roofing: "Roofing", demolition: "Demolition", general: "General (all jobs)",
};
const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS);
const HOC = { 1: "Eliminate", 2: "Substitute", 3: "Isolate", 4: "Engineering", 5: "Administrative", 6: "PPE" };
const PPE_FLAG = { R: "mandatory", C: "conditional", S: "recommended", NA: "n/a" };

// ── Finished-document preview (mirrors server/lib/whs/swmsRender.mjs) ──────────────────────────
function SwmsPreview({ c }) {
  if (!c) return <p className="text-xs text-muted">No content.</p>;
  const controls = Array.isArray(c.controlOptions) ? c.controlOptions : [];
  const ppe = Array.isArray(c.ppeRules) ? c.ppeRules : [];
  const refs = Array.isArray(c.sourceRefs) ? c.sourceRefs.filter(Boolean) : [];
  return (
    <div className="prose prose-sm max-w-none text-sm">
      {c.activity && (<><h4 className="mb-0">Activity</h4><p>{c.activity}</p></>)}
      {c.hazard && (<><h4 className="mb-0">Key hazards</h4><p>{c.hazard}</p></>)}
      {c.trigger && (<><h4 className="mb-0">When this applies</h4><p>{c.trigger}</p></>)}
      {controls.length > 0 && (<>
        <h4 className="mb-0">Controls — select what is installed (hierarchy order)</h4>
        <ol className="mt-1">{controls.map((x, i) => <li key={i}><b>L{x.level} {HOC[x.level] || ""}:</b> {x.text}</li>)}</ol>
      </>)}
      {ppe.length > 0 && (<>
        <h4 className="mb-0">PPE</h4>
        <ul className="mt-1">{ppe.map((p, i) => <li key={i}>{p.item} — <b>{PPE_FLAG[p.flag] || p.flag}</b>{p.condition ? ` (${p.condition})` : ""}</li>)}</ul>
      </>)}
      {c.monitorReview && (<><h4 className="mb-0">Monitor &amp; review</h4><p>{c.monitorReview}</p></>)}
      {(c.responsibleInstall || c.responsibleUse) && (<p className="text-xs">{c.responsibleInstall && <><b>Install/verify:</b> {c.responsibleInstall} </>}{c.responsibleUse && <><b>Use:</b> {c.responsibleUse}</>}</p>)}
      {refs.length > 0 && <p className="text-xs text-muted">Sources: {refs.join(", ")}</p>}
      {c.note && <p className="text-xs text-muted">Note: {c.note}</p>}
    </div>
  );
}

const Field = ({ label, children }) => (
  <label className="block text-xs font-semibold text-muted">{label}<div className="mt-1">{children}</div></label>
);
const inputCls = "w-full rounded-md border border-hairline px-2 py-1 text-sm";

export default function SwmsLibrarySettings() {
  const [tab, setTab] = useState("modules");
  const [templates, setTemplates] = useState(null);
  const [sourcesData, setSourcesData] = useState(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { ok, data, error } = await apiFetch("/api/whs/swms-library");
    if (!ok) { setError(error || "Could not load the module library."); return; }
    setError(""); setTemplates(data?.templates || []);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (tab !== "sources" || sourcesData) return;
    apiFetch("/api/whs/sources").then(({ ok, data }) => ok && setSourcesData(data));
  }, [tab, sourcesData]);

  const patch = async (id, body) => {
    setBusy(true);
    const { ok, error } = await apiPatch(`/api/whs/swms-library/${id}`, body);
    setBusy(false);
    if (!ok) { setError(error || "Update failed."); return false; }
    await load(); return true;
  };

  const startEdit = (t) => {
    setEditId(t.id); setOpenId(t.id);
    const c = t.contentJson || {};
    setForm({
      title: t.title || "", isHrcw: t.isHrcw || "no",
      workCategory: Array.isArray(t.workCategory) ? [...t.workCategory] : [],
      bumpVersion: false,
      c: {
        activity: c.activity || "", hazard: c.hazard || "", trigger: c.trigger || "",
        controlOptions: Array.isArray(c.controlOptions) ? c.controlOptions.map((x) => ({ ...x })) : [],
        ppeRules: Array.isArray(c.ppeRules) ? c.ppeRules.map((x) => ({ ...x })) : [],
        monitorReview: c.monitorReview || "", responsibleInstall: c.responsibleInstall || "",
        responsibleUse: c.responsibleUse || "", sourceRefs: Array.isArray(c.sourceRefs) ? [...c.sourceRefs] : [], note: c.note || "",
      },
    });
  };
  const setC = (key, val) => setForm((f) => ({ ...f, c: { ...f.c, [key]: val } }));
  const saveEdit = async () => {
    const ok = await patch(editId, {
      title: form.title, isHrcw: form.isHrcw, workCategory: form.workCategory,
      contentJson: form.c, bumpVersion: form.bumpVersion,
    });
    if (ok) { setEditId(null); setForm(null); }
  };

  const carpentry = useMemo(
    () => (templates || [])
      .filter((t) => String(t.trade || "").toLowerCase() === "carpentry" && t.isActive !== false)
      .sort((a, b) => String(a.moduleCode || a.title).localeCompare(String(b.moduleCode || b.title))),
    [templates]);
  const part1 = carpentry.filter((t) => t.part === 1 || t.isHrcw === "yes" || t.isHrcw === "boundary");
  const part2 = carpentry.filter((t) => !(t.part === 1 || t.isHrcw === "yes" || t.isHrcw === "boundary"));

  if (error && templates === null) return <div className="text-sm text-red-600">{error}</div>;
  if (templates === null) return <div className="text-sm text-muted">Loading…</div>;

  return (
    <section className="rounded-card border border-hairline bg-surface p-6 shadow-sm space-y-4">
      <header>
        <h2 className="text-lg font-semibold text-primary">WHS / SWMS Library</h2>
        <p className="text-sm text-muted mt-1">The carpentry WHS control modules and their evidence sources. Authored by the WHS consultant; every module stays <b>DRAFT</b> (not usable on site) until a competent reviewer marks it reviewed. Edit in plain english — the finished document previews live.</p>
      </header>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

      <div className="flex gap-2 border-b border-hairline">
        {[["modules", `Control modules (${carpentry.length})`], ["sources", "Source register"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`px-3 py-1.5 text-sm font-semibold border-b-2 -mb-px ${tab === id ? "border-primary text-primary" : "border-transparent text-muted"}`}>{label}</button>
        ))}
      </div>

      {tab === "modules" && (
        <div className="space-y-4">
          {carpentry.length === 0 && <p className="text-sm text-muted">No modules yet — apply migration 165 and run the register seed.</p>}
          {[["Part 1 — HRCW (the SWMS)", part1], ["Part 2 — task-control modules", part2]].map(([heading, list]) => list.length > 0 && (
            <div key={heading}>
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted mb-2">{heading}</h3>
              <div className="space-y-2">
                {list.map((t) => (
                  <div key={t.id} className="rounded-lg border border-hairline">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <button onClick={() => setOpenId(openId === t.id ? null : t.id)} className="flex-1 text-left">
                        <div className="text-sm font-medium text-ink">{t.moduleCode ? <span className="text-muted">{t.moduleCode} · </span> : null}{t.title} <span className="text-[10px] text-muted">v{t.version}</span></div>
                        <div className="text-[11px] text-muted">{(t.workCategory || []).map((c) => CATEGORY_LABELS[c] || c).join(" · ") || "—"}</div>
                      </button>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${t.reviewStatus === "reviewed" ? "bg-accent/15 text-accent" : "bg-warning/20 text-warning"}`}>{t.reviewStatus === "reviewed" ? "Reviewed" : "DRAFT"}</span>
                      {t.isActive === false && <span className="text-[10px] text-muted">inactive</span>}
                    </div>

                    {openId === t.id && editId !== t.id && (
                      <div className="border-t border-hairline px-3 py-3 space-y-3">
                        <SwmsPreview c={t.contentJson} />
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
                      <div className="border-t border-hairline px-3 py-3 grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Field label="Title"><input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={inputCls} /></Field>
                          <div className="flex gap-2">
                            <Field label="Is this HRCW?"><select value={form.isHrcw} onChange={(e) => setForm((f) => ({ ...f, isHrcw: e.target.value }))} className={inputCls}><option value="yes">Yes (Part 1)</option><option value="no">No (Part 2)</option><option value="boundary">Boundary</option></select></Field>
                          </div>
                          <Field label="Activity"><textarea rows={2} value={form.c.activity} onChange={(e) => setC("activity", e.target.value)} className={inputCls} /></Field>
                          <Field label="Key hazards"><textarea rows={2} value={form.c.hazard} onChange={(e) => setC("hazard", e.target.value)} className={inputCls} /></Field>
                          <Field label="When it applies (trigger)"><textarea rows={2} value={form.c.trigger} onChange={(e) => setC("trigger", e.target.value)} className={inputCls} /></Field>

                          <div className="text-xs font-semibold text-muted">Controls (hierarchy order — select-only per job)</div>
                          {form.c.controlOptions.map((row, i) => (
                            <div key={i} className="flex gap-1 items-start">
                              <select value={row.level} onChange={(e) => setC("controlOptions", form.c.controlOptions.map((r, j) => j === i ? { ...r, level: Number(e.target.value) } : r))} className="rounded-md border border-hairline px-1 py-1 text-xs w-14">{[1, 2, 3, 4, 5, 6].map((l) => <option key={l} value={l}>L{l}</option>)}</select>
                              <textarea rows={2} value={row.text} onChange={(e) => setC("controlOptions", form.c.controlOptions.map((r, j) => j === i ? { ...r, text: e.target.value } : r))} className={inputCls} />
                              <button onClick={() => setC("controlOptions", form.c.controlOptions.filter((_, j) => j !== i))} className="text-danger px-1 text-sm">×</button>
                            </div>
                          ))}
                          <button onClick={() => setC("controlOptions", [...form.c.controlOptions, { level: 5, text: "" }])} className="text-xs font-semibold text-primary">+ control option</button>

                          <div className="text-xs font-semibold text-muted mt-2">PPE</div>
                          {form.c.ppeRules.map((row, i) => (
                            <div key={i} className="flex gap-1 items-center">
                              <input value={row.item} onChange={(e) => setC("ppeRules", form.c.ppeRules.map((r, j) => j === i ? { ...r, item: e.target.value } : r))} placeholder="item" className={inputCls} />
                              <select value={row.flag} onChange={(e) => setC("ppeRules", form.c.ppeRules.map((r, j) => j === i ? { ...r, flag: e.target.value } : r))} className="rounded-md border border-hairline px-1 py-1 text-xs w-16"><option value="R">R</option><option value="C">C</option><option value="S">S</option><option value="NA">NA</option></select>
                              <input value={row.condition || ""} onChange={(e) => setC("ppeRules", form.c.ppeRules.map((r, j) => j === i ? { ...r, condition: e.target.value } : r))} placeholder="condition (if C)" className={inputCls} />
                              <button onClick={() => setC("ppeRules", form.c.ppeRules.filter((_, j) => j !== i))} className="text-danger px-1 text-sm">×</button>
                            </div>
                          ))}
                          <button onClick={() => setC("ppeRules", [...form.c.ppeRules, { item: "", flag: "R", condition: "" }])} className="text-xs font-semibold text-primary">+ PPE item</button>

                          <Field label="Monitor &amp; review"><textarea rows={2} value={form.c.monitorReview} onChange={(e) => setC("monitorReview", e.target.value)} className={inputCls} /></Field>
                          <div className="flex gap-2">
                            <Field label="Install / verify (who)"><input value={form.c.responsibleInstall} onChange={(e) => setC("responsibleInstall", e.target.value)} className={inputCls} /></Field>
                            <Field label="Use (who)"><input value={form.c.responsibleUse} onChange={(e) => setC("responsibleUse", e.target.value)} className={inputCls} /></Field>
                          </div>
                          <Field label="Sources (comma-separated, e.g. S-02, S-03)"><input value={(form.c.sourceRefs || []).join(", ")} onChange={(e) => setC("sourceRefs", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} className={inputCls} /></Field>
                          <Field label="Work stages this applies to">
                            <div className="flex flex-wrap gap-2">{ALL_CATEGORIES.map((cat) => (
                              <label key={cat} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={form.workCategory.includes(cat)} onChange={(e) => setForm((f) => ({ ...f, workCategory: e.target.checked ? [...f.workCategory, cat] : f.workCategory.filter((x) => x !== cat) }))} />{CATEGORY_LABELS[cat]}</label>
                            ))}</div>
                          </Field>
                          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.bumpVersion} onChange={(e) => setForm((f) => ({ ...f, bumpVersion: e.target.checked }))} /> Revision — bump version &amp; require everyone to re-sign</label>
                          <div className="flex gap-2 pt-1">
                            <button disabled={busy} onClick={saveEdit} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white disabled:opacity-40">Save</button>
                            <button onClick={() => { setEditId(null); setForm(null); }} className="rounded-md border border-hairline px-3 py-1 text-xs">Cancel</button>
                          </div>
                        </div>
                        <div className="border-l border-hairline pl-4">
                          <div className="text-xs font-bold uppercase tracking-wide text-muted mb-2">Finished document (live)</div>
                          <SwmsPreview c={form.c} />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "sources" && (
        <div className="space-y-3">
          {!sourcesData ? <p className="text-sm text-muted">Loading…</p> : (<>
            {(sourcesData.conflicts || []).length > 0 && (
              <div className="rounded-lg border border-warning/40 bg-warning/5 p-3">
                <div className="text-xs font-bold uppercase text-warning mb-1">Conflict log</div>
                {sourcesData.conflicts.map((c) => (
                  <div key={c.id} className="text-xs mb-1"><b>{c.id}:</b> {c.conflict} → <span className="text-muted">{c.resolution}</span></div>
                ))}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-muted border-b border-hairline"><th className="py-1 pr-2">ID</th><th className="pr-2">Tier</th><th className="pr-2">Source</th><th className="pr-2">Status</th><th>Review</th></tr></thead>
                <tbody>
                  {(sourcesData.sources || []).map((s) => (
                    <tr key={s.id} className="border-b border-hairline/60 align-top">
                      <td className="py-1 pr-2 font-mono">{s.id}</td>
                      <td className="pr-2">{s.tier}</td>
                      <td className="pr-2">{s.title}{s.notes ? <span className="block text-muted">{s.notes}</span> : null}</td>
                      <td className="pr-2">{s.status === "superseded" ? <span className="text-danger font-semibold">superseded</span> : s.status}</td>
                      <td><span className={s.reviewStatus === "reviewed" ? "text-accent" : "text-warning"}>{s.reviewStatus || "draft"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>)}
        </div>
      )}
    </section>
  );
}
