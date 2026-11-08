/**
 * DocumentsStep — controlled documents from the register (Tab 22 §A, D-031/D-035) + consultant/supplier
 * coordination (Tab 18 §1D, D-003).
 *
 *   • Preview renders the REAL document (existing engine → PDF) from the current register — no hand edits.
 *   • Issue stores an immutable revision (P01, P02 …); earlier revisions stay retrievable.
 *   • Pre-issue checks block missing identity / drawing revision / recipient, unevidenced approvals and any
 *     dollar figure. Nothing is emailed from here — download the issued PDF and send it yourself.
 *   • Received consultant / supplier PDFs are kept intact, linked to register items and reconciled by staff;
 *     nothing in them is applied to an approved item automatically.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, apiPost, apiPatch } from "../../../../lib/apiFetch.js";
import { roomLabel, refCode, outstandingReasons, isClientSelection } from "../../../../lib/register.js";
import { Chip, Mini, Section, Select } from "./ui.jsx";

const DOCS = [
  { key: "client_brief", label: "Preliminary Client Project Brief", hint: "Concept presentation — issue record only, no signature.", stages: ["winning_offer", "discovery", "fee_proposal"] },
  { key: "architect_brief", label: "Architect Design Brief", hint: "Design coordination — client intent vs technical items to verify.", stages: ["consultants", "fee_proposal", "winning_offer"] },
  { key: "selections_schedule", label: "Selections & Finishes Schedule", hint: "Consultants / tender — choices only, never scope or prices.", stages: ["consultants", "tender", "won"] },
];
const PACKS = [["architect", "Architect"], ["routleys", "Routleys"], ["tli", "TLI lighting"], ["windows", "Windows"], ["engineer", "Engineer"], ["joiner", "Joiner"], ["energy", "Energy"]];
const DISCIPLINES = [["architect", "Architect / designer"], ["routleys", "Routleys"], ["tli", "TLI"], ["windows", "Window supplier"], ["engineer", "Engineer"], ["energy", "Energy assessor"], ["joiner", "Joiner"], ["other", "Other"]];
const REVIEW = [["received", "Received"], ["under_review", "Under review"], ["reconciled", "Reconciled"], ["superseded", "Superseded"]];

function b64ToBlobUrl(b64, type = "application/pdf") {
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type }));
}
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—");

export default function DocumentsStep({ lead, reg, info, context, stage, flush, updateItem }) {
  const [docs, setDocs] = useState({ issued: [], sources: [], schemaReady: true });
  const [active, setActive] = useState(null);           // doc key being previewed
  const [preview, setPreview] = useState(null);         // { url, checks, revision }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [layout, setLayout] = useState("technical");
  const [recipient, setRecipient] = useState({ name: "", email: "" });

  const load = useCallback(async () => {
    const r = await apiFetch(`/api/register/leads/${lead.id}/documents`);
    if (r.ok) setDocs(r.data.documents);
  }, [lead.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview]);

  function defaultRecipient(key) {
    if (key === "architect_brief") {
      const a = (context?.consultants || []).find((c) => ["architect", "designer"].includes(c.role));
      return { name: a?.name || "", email: "" };
    }
    return { name: context?.identity?.clientName || "", email: context?.identity?.email || "" };
  }

  async function openPreview(key) {
    setMsg(null); setBusy(true); setActive(key);
    const rec = recipient.name && active === key ? recipient : defaultRecipient(key);
    setRecipient(rec);
    // Render from what is on screen — but SAVE it first. If the save does not land (conflict / guard / offline)
    // the preview would show stale data, so stop and tell the employee; their edits are kept for a retry.
    const saved = await flush();
    if (!saved) { setBusy(false); setMsg({ tone: "red", text: "Your latest changes haven’t saved yet, so there’s nothing new to preview. Check the save status above the register (a conflict or a failed save), then preview again — your edits are kept." }); return; }
    const r = await apiPost(`/api/register/leads/${lead.id}/documents/${key}/preview`, { layout: key === "selections_schedule" ? layout : undefined, recipientName: rec.name });
    setBusy(false);
    if (!r.ok) { setMsg({ tone: "red", text: r.error }); return; }
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview({ url: b64ToBlobUrl(r.data.pdf), checks: r.data.checks, revision: r.data.revision, previewedFor: rec.name, itemVersions: r.data.itemVersions });
  }

  async function issue() {
    if (!active) return;
    // You must have a current preview to issue: it carries the content fingerprint the server re-checks, so an
    // issue can never record a controlled document from data that changed (or never saved) since the preview.
    if (!preview?.itemVersions) { setMsg({ tone: "red", text: "Preview the document first — issuing records the exact version you previewed." }); return; }
    setBusy(true); setMsg(null);
    const saved = await flush();
    if (!saved) { setBusy(false); setMsg({ tone: "red", text: "Your latest changes haven’t saved yet — the document was NOT issued. Resolve the save status above the register (a conflict or a failed save), then preview and issue again. Your edits are kept." }); return; }
    const r = await apiPost(`/api/register/leads/${lead.id}/documents/${active}/issue`, { recipientName: recipient.name, recipientEmail: recipient.email, layout: active === "selections_schedule" ? layout : undefined, expectedVersions: preview.itemVersions });
    setBusy(false);
    if (!r.ok) {
      const checks = r.body?.checks;
      const stale = r.code === "ISSUE_STALE";
      setMsg({ tone: "red", text: checks?.errors?.length ? `${r.error} ${checks.errors.join(" ")}` : r.error });
      if (stale) { setPreview(null); }      // force a fresh preview of the current version before re-issuing
      return;
    }
    setMsg({ tone: "green", text: `Recorded ${r.data.document.revision_label} for ${recipient.name} — not emailed. The controlled PDF is stored permanently; download it below to send.` });
    setPreview(null); setActive(null);
    load();
  }

  async function openFile(id, exportDocx) {
    // Reserve the tab synchronously (popup-safe) BEFORE the await, then root the signed URL at the ORIGIN
    // (not the current /sales/leads/<id> route) so a root-relative storage path resolves to https://host/sb/…
    // and never falls into the SPA catch-all that would show Hub Home. An absolute URL passes through unchanged.
    // NB: do NOT pass "noopener" to this pre-reservation open — per the HTML spec that makes window.open()
    // return null, which would kill the reservation and force the open to after the await (popup-blocked on
    // Safari). Keep a real handle and sever the opener manually for tab-nabbing safety.
    const win = window.open("about:blank", "_blank");
    if (win) win.opener = null;
    const r = await apiFetch(`/api/register/leads/${lead.id}/documents/${id}/url${exportDocx ? "?export=docx" : ""}`);
    if (!r.ok) { win?.close(); setMsg({ tone: "red", text: r.error || "Could not open the document." }); return; }
    let href; try { href = new URL(r.data.url, window.location.origin).href; } catch { href = r.data.url; }
    if (win) win.location.href = href; else window.open(href, "_blank");
  }
  async function openPack(discipline) {
    // Same popup-safe pattern as openFile: reserve the tab on the click BEFORE the flush/fetch awaits, or
    // Safari's popup blocker suppresses the post-await open and the pack silently never appears.
    const win = window.open("about:blank", "_blank");
    if (win) win.opener = null;
    setBusy(true); setMsg(null);
    // The pack is built from the register, so persist it first — a coordination pack must not be generated
    // from data that failed to save.
    const saved = await flush();
    if (!saved) { win?.close(); setBusy(false); setMsg({ tone: "red", text: "Your latest changes haven’t saved yet — the pack was not generated. Resolve the save status above the register, then try again." }); return; }
    const r = await apiFetch(`/api/register/leads/${lead.id}/packs/${discipline}`);
    setBusy(false);
    if (!r.ok) { win?.close(); setMsg({ tone: "amber", text: r.error }); return; }
    const url = b64ToBlobUrl(r.data.pdf);
    if (win) win.location.href = url; else window.open(url, "_blank");
  }

  const byType = useMemo(() => {
    const m = {};
    for (const d of docs.issued) (m[d.document_type] ||= []).push(d);
    for (const k of Object.keys(m)) m[k].sort((a, b) => (b.version || 0) - (a.version || 0));
    return m;
  }, [docs]);

  const roomsCount = reg.meta.rooms?.length || 0;
  function scopeSummary(key) {
    if (key === "selections_schedule") {
      const n = reg.items.filter((i) => isClientSelection(i)).length;
      return `${n} client selection${n === 1 ? "" : "s"} across ${roomsCount} room${roomsCount === 1 ? "" : "s"}. Scope, requirements and prices are excluded.`;
    }
    if (key === "architect_brief") {
      const tech = reg.items.filter((i) => i.itemKind === "action" || i.technicalStatus === "needs_verification").length;
      return `Client intent and scope plus ${tech} technical item${tech === 1 ? "" : "s"} to verify, across ${roomsCount} room${roomsCount === 1 ? "" : "s"}. No prices.`;
    }
    return `Scope and client preferences across ${roomsCount} room${roomsCount === 1 ? "" : "s"}. No internal notes or prices.`;
  }

  return (
    <div className="space-y-3">
      {!docs.schemaReady && <p className="rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">Document issuing needs migration 213 — drafts still preview.</p>}
      {msg && <p className={`rounded border p-2 text-[11px] ${msg.tone === "green" ? "border-green-200 bg-green-50 text-green-800" : msg.tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-700"}`} data-testid="doc-message">{msg.text}</p>}

      {DOCS.map((d) => {
        const history = byType[d.key] || [];
        const current = history.find((h) => h.status === "current");
        return (
          <div key={d.key} className={`rounded-lg border p-3 ${d.stages[0] === stage ? "border-primary/40 bg-primary/[0.03]" : "border-hairline bg-surface"}`} data-testid={`doc-card-${d.key}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-ink">{d.label} {d.stages[0] === stage && <Chip tone="blue">This stage</Chip>}</p>
                <p className="text-[11px] text-muted">{d.hint} {current ? `Issued: ${current.revision_label} (current) · ${fmtDate(current.issued_at)} · to ${current.recipient_name || "—"}` : "Draft — not issued yet."}</p>
              </div>
              <div className="flex items-center gap-2">
                {d.key === "selections_schedule" && <Select value={layout} onChange={setLayout} options={[["technical", "Technical register"], ["client", "Client presentation"]]} className="w-40" />}
                <button type="button" disabled={busy} onClick={() => openPreview(d.key)} className="rounded border border-hairline px-3 py-1.5 text-xs font-semibold text-ink hover:bg-page disabled:opacity-40" data-testid={`preview-${d.key}`}>Preview draft</button>
              </div>
            </div>

            {active === d.key && preview && (
              <div className="mt-2 space-y-2">
                <div className="rounded border border-primary/30 bg-primary/[0.04] p-2 text-[11px]" data-testid={`pre-issue-${d.key}`}>
                  <p className="font-semibold text-primary">Preview of the draft — not a controlled record until you issue it as P{String(preview.revision).padStart(2, "0")}.</p>
                  <dl className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
                    <div><span className="text-muted">Project: </span><span className="text-ink">{[context?.identity?.clientName, context?.identity?.siteAddress].filter(Boolean).join(" — ") || "—"}</span></div>
                    <div><span className="text-muted">Recipient: </span><span className="text-ink">{recipient.name || "— enter below"}</span></div>
                    <div><span className="text-muted">Drawing basis: </span><span className="text-ink">{reg.meta.planRev || "— not set"}</span></div>
                    <div><span className="text-muted">Document: </span><span className="text-ink">{d.label} · P{String(preview.revision).padStart(2, "0")}</span></div>
                    <div className="sm:col-span-2"><span className="text-muted">Includes: </span><span className="text-ink">{scopeSummary(d.key)}</span></div>
                  </dl>
                </div>
                {(preview.checks.errors.length > 0 || preview.checks.warnings.length > 0) && (
                  <ul className="space-y-0.5 text-[11px]">
                    {preview.checks.errors.map((e) => <li key={e} className="text-red-700">✕ {e}</li>)}
                    {preview.checks.warnings.map((w) => <li key={w} className="text-amber-700">! {w}</li>)}
                  </ul>
                )}
                <iframe title={`${d.label} draft`} src={preview.url} className="h-[28rem] w-full rounded border border-hairline bg-white" />
                <div className="flex flex-wrap items-end gap-2">
                  <Mini label="Issue to (name)"><input value={recipient.name} onChange={(e) => setRecipient((r) => ({ ...r, name: e.target.value }))} className="inp w-48 text-[11px]" /></Mini>
                  <Mini label="Email (record only — nothing is sent)"><input value={recipient.email} onChange={(e) => setRecipient((r) => ({ ...r, email: e.target.value }))} className="inp w-56 text-[11px]" /></Mini>
                  <button type="button" disabled={busy || preview.checks.errors.length > 0 || !recipient.name.trim() || (preview.previewedFor != null && recipient.name.trim() !== (preview.previewedFor || "").trim())} onClick={issue}
                    className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40" data-testid={`issue-${d.key}`}>Issue revision P{String(preview.revision).padStart(2, "0")}</button>
                  <button type="button" onClick={() => { setActive(null); setPreview(null); }} className="text-[11px] text-muted hover:text-ink">Close preview</button>
                </div>
                {preview.previewedFor != null && recipient.name.trim() !== (preview.previewedFor || "").trim() && (
                  <p className="text-[11px] text-amber-700">Recipient changed since this preview — <button type="button" onClick={() => openPreview(d.key)} className="font-semibold underline">preview again</button> to re-check the release blockers before issuing.</p>
                )}
              </div>
            )}

            {history.length > 0 && (
              <table className="mt-2 w-full text-[11px]" data-testid={`history-${d.key}`}>
                <thead><tr className="text-left text-muted"><th className="pr-2">Rev</th><th className="pr-2">Issued</th><th className="pr-2">To</th><th className="pr-2">By</th><th className="pr-2">Status</th><th className="pr-2">Checksum</th><th></th></tr></thead>
                <tbody>{history.map((h) => (
                  <tr key={h.id} className="border-t border-hairline/60">
                    <td className="pr-2 font-semibold text-ink">{h.revision_label}</td><td className="pr-2">{fmtDate(h.issued_at)}</td>
                    <td className="pr-2">{h.recipient_name || "—"}</td><td className="pr-2">{h.issued_by_name || "—"}</td>
                    <td className="pr-2">{h.status === "current" ? <Chip tone="green">Current</Chip> : <Chip>Superseded</Chip>}</td>
                    <td className="pr-2 font-mono text-[10px] text-muted">{(h.content_sha256 || "").slice(0, 10)}</td>
                    <td className="text-right whitespace-nowrap">
                      <button type="button" onClick={() => openFile(h.id)} className="px-1 text-primary hover:underline">PDF</button>
                      <button type="button" onClick={() => openFile(h.id, true)} className="px-1 text-muted hover:underline" title="Controlled editable export">DOCX</button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        );
      })}

      <Section title="Coordination requests (draft packs from the same register)" defaultOpen={false}>
        <p className="text-[11px] text-muted">A filtered schedule of the items tagged for each consultant or supplier — current drawings, room, product direction, status and open questions. A working document, not an issued record.</p>
        <div className="flex flex-wrap gap-1.5">
          {PACKS.map(([k, l]) => <button key={k} type="button" disabled={busy} onClick={() => openPack(k)} className="rounded-full border border-hairline px-2.5 py-1 text-[11px] text-ink hover:bg-page disabled:opacity-40">{l} pack</button>)}
        </div>
      </Section>

      <SourceDocuments lead={lead} reg={reg} info={info} sources={docs.sources} reload={load} openFile={openFile} updateItem={updateItem} />
    </div>
  );
}

function SourceDocuments({ lead, reg, sources, reload, openFile, updateItem }) {
  const [form, setForm] = useState({ file: null, documentType: "consultant_document", discipline: "architect", issuer: "", docNumber: "", revisionLabel: "", receivedAt: new Date().toISOString().slice(0, 10), outstandingQuestion: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function upload() {
    if (!form.file) return;
    setBusy(true); setErr(null);
    const data = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
      fr.onerror = reject;
      fr.readAsDataURL(form.file);
    });
    const r = await apiPost(`/api/register/leads/${lead.id}/sources`, { ...form, file: undefined, filename: form.file.name, mimeType: form.file.type, data });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setForm((f) => ({ ...f, file: null, docNumber: "", revisionLabel: "", outstandingQuestion: "" }));
    reload();
  }
  async function patch(doc, partial) {
    const r = await apiPatch(`/api/register/leads/${lead.id}/sources/${doc.id}`, partial);
    if (!r.ok) setErr(r.error); else reload();
  }
  const ref = (d) => [d.issuer, d.doc_number, d.revision_label].filter(Boolean).join(" ") || d.filename;

  return (
    <Section title="Received consultant & supplier documents" count={sources.length || null} defaultOpen={sources.length > 0}>
      <p className="text-[11px] text-muted">The original file is kept exactly as received. Link it to the register items it affects, then review each one — nothing is changed automatically, and an approved selection is never overwritten.</p>
      {err && <p className="text-[11px] text-red-700">{err}</p>}
      <div className="grid grid-cols-1 gap-2 rounded border border-hairline bg-page p-2 sm:grid-cols-4">
        <Mini label="File (PDF)"><input type="file" accept="application/pdf,image/*" onChange={(e) => set("file", e.target.files?.[0] || null)} className="text-[11px]" /></Mini>
        <Mini label="Type"><Select value={form.documentType} onChange={(v) => set("documentType", v)} options={[["consultant_document", "Consultant document"], ["supplier_document", "Supplier schedule / quote"]]} /></Mini>
        <Mini label="Discipline"><Select value={form.discipline} onChange={(v) => set("discipline", v)} options={DISCIPLINES} /></Mini>
        <Mini label="Issuer"><input value={form.issuer} onChange={(e) => set("issuer", e.target.value)} placeholder="e.g. Routleys" className="inp text-[11px]" /></Mini>
        <Mini label="Document no."><input value={form.docNumber} onChange={(e) => set("docNumber", e.target.value)} className="inp text-[11px]" /></Mini>
        <Mini label="Revision"><input value={form.revisionLabel} onChange={(e) => set("revisionLabel", e.target.value)} placeholder="Rev B" className="inp text-[11px]" /></Mini>
        <Mini label="Received"><input type="date" value={form.receivedAt} onChange={(e) => set("receivedAt", e.target.value)} className="inp text-[11px]" /></Mini>
        <Mini label="Outstanding question"><input value={form.outstandingQuestion} onChange={(e) => set("outstandingQuestion", e.target.value)} className="inp text-[11px]" /></Mini>
        <div className="sm:col-span-4"><button type="button" disabled={busy || !form.file} onClick={upload} className="rounded bg-primary px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-40">Add received document</button></div>
      </div>

      {sources.map((d) => {
        const linked = reg.items.filter((i) => (d.register_item_ids || []).includes(i.id));
        return (
          <div key={d.id} className="rounded border border-hairline p-2 text-[11px]" data-testid={`source-${d.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <Chip tone={d.document_type === "supplier_document" ? "blue" : "violet"}>{d.discipline || "other"}</Chip>
                <span className="font-semibold text-ink">{ref(d)}</span>
                <span className="text-muted">received {fmtDate(d.received_at)} · {linked.length} linked item(s)</span>
                {d.outstanding_question && <Chip tone="amber">Q: {d.outstanding_question}</Chip>}
              </div>
              <div className="flex items-center gap-2">
                <Select value={d.review_status || "received"} onChange={(v) => patch(d, { reviewStatus: v })} options={REVIEW} className="w-32" />
                <button type="button" onClick={() => openFile(d.id)} className="text-primary hover:underline">Open original</button>
                <button type="button" onClick={() => setOpen(open === d.id ? null : d.id)} className="text-primary hover:underline">{open === d.id ? "Close" : "Review & link"}</button>
              </div>
            </div>
            {open === d.id && (
              <div className="mt-2 space-y-1.5 border-t border-hairline pt-2">
                <select multiple value={d.register_item_ids || []} onChange={(e) => patch(d, { itemIds: [...e.target.selectedOptions].map((o) => o.value) })} className="inp h-28 w-full text-[11px]">
                  {reg.items.map((i) => <option key={i.id} value={i.id}>{refCode(i)} · {roomLabel(reg, i)} · {i.description || i.category}</option>)}
                </select>
                {linked.map((i) => (
                  <div key={i.id} className="flex flex-wrap items-center gap-2 rounded bg-page px-2 py-1">
                    <span className="font-mono text-[10px] text-muted">{refCode(i)}</span>
                    <span className="text-ink">{roomLabel(reg, i)} — {i.description || i.category}</span>
                    {i.product && <span className="text-muted">{[i.manufacturer, i.product, i.model].filter(Boolean).join(" ")}</span>}
                    {outstandingReasons(i).includes("verification") && <Chip tone="amber">needs verification</Chip>}
                    {i.technicalStatus === "verified" && <Chip tone="green">verified</Chip>}
                    <span className="ml-auto flex gap-2">
                      <button type="button" onClick={() => updateItem(i.id, { source: ref(d), sourceDocId: d.id })} className="text-primary hover:underline">Set as source</button>
                      {i.technicalStatus !== "verified" && <button type="button" onClick={() => updateItem(i.id, { technicalStatus: "verified", technicalEvidence: { at: new Date().toISOString(), by: "Blue Leaf review", ref: ref(d) }, source: i.source || ref(d), sourceDocId: d.id })} className="text-green-700 hover:underline">Mark verified by this document</button>}
                    </span>
                  </div>
                ))}
                <input defaultValue={d.review_notes || ""} onBlur={(e) => e.target.value !== (d.review_notes || "") && patch(d, { reviewNotes: e.target.value })} placeholder="Review notes (what changed, what was accepted / rejected)…" className="inp w-full text-[11px]" />
              </div>
            )}
          </div>
        );
      })}
    </Section>
  );
}
