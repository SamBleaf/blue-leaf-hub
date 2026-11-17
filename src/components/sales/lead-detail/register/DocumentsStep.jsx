/**
 * DocumentsStep — controlled documents from the register (Tab 22 §A, D-031/D-035) + consultant/supplier
 * coordination (Tab 18 §1D, D-003). REGISTER_SCREENS_SPEC.md S5 (owner approval 17 Nov 2026).
 *
 *   • Preview renders the REAL document (existing engine → PDF) from the current register — no hand edits.
 *   • Two boxes: red "Can't issue yet" (the release blockers, each saying why) and amber "Before you send" (content
 *     checks that never block). Every entry has a Fix that opens what fixes it.
 *   • The architect's brief lists every line as it will print, beside the PDF; a line opens its source in the edit
 *     drawer, and "Not in this brief" reaches every record that didn't print, with the reason. The line list and the
 *     amber box recompute in the browser from the same shared modules the server uses (briefModel, registerQuality),
 *     so a fix shows at once; the red box is re-checked by the server on "Preview again". The readiness line and the
 *     red marks on the lines come from the same release-blocker rules (releaseBlockers), live.
 *   • Issue stores an immutable revision (R01, R02 …) only from a current preview; nothing is emailed from here.
 *   • "Check wording" asks Blueprint to proofread the draft just previewed: suggestions only, nothing is changed.
 *
 * Widths (spec S5): two panes from 1000 px of the step's own width; below that a "What will print | PDF" switch; on a
 * phone (the viewport under 640 px, not the column) the line list only, the red and amber boxes as two rows that open a
 * sheet, a sticky Download / Open PDF bar above the app nav, and the issue bar at the end of the list. The issue bar is
 * sticky only in the two-pane layout, where it is one row; in a narrower column it sits after the list too, so it never
 * covers the red box (review R12).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, apiPost, apiPatch } from "../../../../lib/apiFetch.js";
import { roomLabel, refCode, outstandingReasons, isClientSelection, itemTitle } from "../../../../lib/register.js";
import { architectBriefModel, architectBriefLines, briefSectionTitles, namedArchitect, placeOf, labelOf, deletableEmpty, clean } from "../../../../lib/briefModel.js";
import { contentChecks, releaseBlockers, roomsNeedingBrief } from "../../../../lib/registerQuality.js";
import { Chip, Mini, Section, Select } from "./ui.jsx";
import { Popover, Toast } from "./RoomUi.jsx";
import { useNarrow, useStageBarInset, useToast } from "./useRoomUi.js";
import EditDrawer from "./EditDrawer.jsx";

const DOCS = [
  { key: "client_brief", label: "Preliminary Client Project Brief", hint: "Concept presentation — issue record only, no signature.", stages: ["winning_offer", "discovery", "fee_proposal"] },
  { key: "architect_brief", label: "Architect Design Brief", hint: "The brief to design from, and what the next drawing issue needs.", stages: ["consultants", "fee_proposal", "winning_offer"] },
  // Two documents from the same register records (docs/documents/SELECTIONS_SPEC.md), each with its own revisions.
  { key: "selections_schedule", label: "Technical Selections Schedule", hint: "For the design team, estimator, suppliers and trades: the selections by trade, with codes, sources and open actions. No prices.", stages: ["consultants", "tender", "won"] },
  { key: "client_presentation", label: "Client Selections Presentation", hint: "For the client: their selections room by room, and what we need from them. No codes, references or prices.", stages: ["consultants", "tender", "won"] },
  { key: "tender_scope_notes", label: "Tender Scope & Pricing Notes", hint: "Internal, for the Blue Leaf estimator. Never goes to the client, consultants or trades. No amounts.", stages: ["consultants", "tender", "won"], internal: true },
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
const fmtTime = (d) => d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Adelaide" }).replace(/\s/g, " ").toLowerCase();
const rev = (n) => `R${String(n).padStart(2, "0")}`;
/** What the brief prints from, in one string: any change to it makes the preview stale. */
const printKey = (reg, context) => JSON.stringify([reg.items, reg.meta.rooms, reg.meta.planRev, reg.meta.occupancy, context?.goals, context?.budget, context?.consultants, context?.site, context?.identity, context?.projectType, context?.deliveryModel]);
/** The recipient the brief opens with: the named architect and firm (design-team order), else blank. */
function architectRecipient(context) {
  const a = namedArchitect(context);
  if (!a) return "";
  return [a.name, a.company && a.company !== a.name ? a.company : ""].filter(Boolean).join(", ");
}

// Where a printed line comes from, said in a few words beside it. Every lead fact (site, client, project, budget,
// funding, the client's story) is the client's details in Sales; the drawing basis and During the works are the project's.
function sourceTag(reg, line) {
  const k = line.source?.kind;
  if (k === "fact") return "Sales";
  if (k === "site") return "Public mapping";
  if (k === "meta") return "The project";
  if (k === "consultant") return "Design team";
  if (k === "room") {
    const ids = String(line.source.key || "").split(",").filter((x) => (reg.meta.rooms || []).some((r) => r.id === x));
    if (!ids.length) return "Rooms";
    if (ids.length > 1) return `${ids.length} rooms`;
    const extra = line.ids.length ? ` + ${line.ids.length} record${line.ids.length === 1 ? "" : "s"}` : "";
    return `${(reg.meta.rooms || []).find((r) => r.id === ids[0])?.name || "Room"}${extra}`;
  }
  const places = [...new Set(line.ids.map((id) => reg.items.find((i) => i.id === id)).filter(Boolean).map((i) => placeOf(reg, i).label))];
  return `${places.join(" · ") || "Record"}${line.ids.length > 1 ? ` · ${line.ids.length} records` : ""}`;
}
/** The drawer target a printed line opens. Computed lines (what's planned) open the Rooms list. */
function lineTarget(line) {
  const s = line.source || {};
  const base = { line: line.text, lineKey: `${line.section}|${line.label}` };
  if (s.kind === "record") return { ...base, kind: "record", ids: line.ids };
  if (s.kind === "room") {
    if (s.key === "rooms" || s.key === "not_in_scope") return { ...base, kind: "rooms" };
    return { ...base, kind: "room", roomIds: String(s.key || "").split(",").filter(Boolean) };
  }
  // The cover's Site, Client and Project lines stay read only here, changed in Sales (decision D1).
  if (s.kind === "fact") return ["site", "client", "project"].includes(s.key) ? { ...base, kind: "sales", label: line.label, text: line.text } : { ...base, kind: "fact", key: s.key };
  if (s.kind === "site") return { ...base, kind: "site", text: line.text };
  if (s.kind === "meta") return { ...base, kind: "meta", key: s.key };
  if (s.kind === "consultant") return { ...base, kind: "architect" };
  return { ...base, kind: "template" };
}
/** The drawer target a check's Fix opens. A target's help (the full guidance behind a short red line) rides along. */
function checkTarget(t, text, help) {
  if (!t) return null;
  const base = { line: text, ...(clean(t.help || help) ? { help: clean(t.help || help) } : {}) };
  if (t.kind === "record") return { ...base, kind: "record", ids: [t.id] };
  if (t.kind === "room") return { ...base, kind: "room", roomIds: [t.id] };
  if (t.kind === "rooms") return { ...base, kind: "rooms", key: t.key };
  if (t.kind === "fact") return { ...base, kind: "fact", key: t.key };
  if (t.kind === "architect") return { ...base, kind: "architect" };
  if (t.kind === "meta") return { ...base, kind: "meta", key: t.key };
  return null;
}
const FIX_WORDS = { story: "Add them", budget: "Confirm the budget", architect: "Name the architect", floors: "Choose upstairs rooms", actions: "Name who", delete_empty: "Review" };
/** The button on a red or amber entry: what it does, in its own words. */
function fixWord(c, tone) {
  const targets = c.targets || [];
  const kinds = new Set(targets.map((t) => t.kind));
  const n = (kind) => targets.filter((t) => t.kind === kind).length;
  if (tone === "red") {
    if (kinds.has("room")) return "Go room by room";
    if (kinds.has("architect")) return "Name the architect";
    return n("record") > 1 ? `Fix ${n("record")}` : "Fix";
  }
  if (c.key === "budget_confirmed") return "Confirm the budget";
  if (c.key === "budget_band") return "Check the budget";
  // Earlier answers that disagree with a room's work: one Fix per room, stepping through them ("Next room ›").
  if (c.key === "scope_clash" || c.action === "clash") return n("room") > 1 ? `Fix ${n("room")}` : "Fix";
  if (FIX_WORDS[c.action]) return FIX_WORDS[c.action];
  return n("record") > 1 ? `Fix ${n("record")}` : "Fix";
}
/** "Laundry", "whole-house", "Site & existing": where a group of empty answers sits, for the delete question. */
function placeWords(reg, item) {
  if (!item) return "";
  const p = placeOf(reg, item);
  return p.kind === "room" ? clean(p.label) : p.kind === "site" ? "Site & existing" : "whole-house";
}
/** "Delete 3 empty Laundry answers? They hold nothing." (spec S5). */
function deleteQuestion(reg, check) {
  const n = check.targets.length;
  const place = check.place ? (check.place === "Throughout" ? "whole-house" : clean(check.place)) : placeWords(reg, reg.items.find((i) => i.id === check.targets[0]?.id));
  return `Delete ${n} empty ${place ? `${place} ` : ""}answer${n === 1 ? "" : "s"}? They hold nothing.`;
}
const entryKey = (c) => c.key || c.text;
/** A check target as a line key (see marks): a record, a room, a fact, the architect (Prepared for), a meta field. */
function targetKey(t) {
  if (t.kind === "record") return `r:${t.id}`;
  if (t.kind === "room") return `m:${t.id}`;
  if (t.kind === "fact") return `f:${t.key}`;
  if (t.kind === "architect" || t.kind === "recipient") return "a";
  if (t.kind === "meta") return `x:${t.key}`;
  return null;
}
/** Every key a printed line answers to, so a check on any of its records, rooms or facts marks it. */
function lineKeys(l) {
  const s = l.source || {};
  return [...l.ids.map((id) => `r:${id}`), ...(s.kind === "room" ? String(s.key || "").split(",").map((id) => `m:${id}`) : []),
    ...(s.kind === "fact" ? [`f:${s.key}`, ...(s.key === "budget" ? ["f:story"] : [])] : []), ...(s.kind === "consultant" ? ["a"] : []), ...(s.kind === "meta" ? [`x:${s.key}`] : [])];
}

/**
 * The entries of a red ("Can't issue yet") or amber ("Before you send") box, each with its Fix. An empty-answers entry
 * also offers "Delete all n", which asks first, under the entry itself. Used in the boxes and, on a phone, in their sheets.
 */
export function CheckEntries({ entries, tone, reg, start = 0, onFix, onReview, confirmKey, onAskDelete, onDelete, onCancelDelete }) {
  const red = tone === "red";
  const btn = `min-h-[44px] shrink-0 rounded-lg border bg-surface px-3 text-[13px] font-semibold ${red ? "border-red-300 text-red-700 hover:bg-red-100" : "border-hairline text-ink hover:bg-page"}`;
  return (
    <ol className="mt-1 space-y-1">
      {entries.map((c, k) => (
        <li key={entryKey(c)} className={`text-[13px] ${red ? "text-red-700" : "text-ink"}`} data-testid={`check-${tone}`}>
          <div className="flex min-h-[44px] flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-2">
            <p className="flex min-w-0 flex-1 gap-2 pt-1"><span className="font-semibold">{start + k + 1}.</span><span className="min-w-0 flex-1">{c.text}</span></p>
            {c.targets?.length > 0 && (
              <span className="flex shrink-0 flex-wrap gap-1 pl-5 sm:pl-0">
                {c.action === "delete_empty" && <button type="button" onClick={() => onAskDelete?.(c)} className={btn}>Delete all {c.targets.length}</button>}
                <button type="button" onClick={() => (c.action === "delete_empty" ? onReview?.(c) : onFix?.(c))} className={btn}>{fixWord(c, tone)}</button>
              </span>
            )}
          </div>
          {confirmKey != null && confirmKey === entryKey(c) && (
            <div className="mb-1 mt-1 rounded-card border border-hairline bg-surface p-3 text-[13px]" role="alertdialog" aria-label="Delete empty answers">
              <p className="text-ink">{deleteQuestion(reg, c)}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => onDelete?.(c)} className="min-h-[44px] rounded-lg bg-red-600 px-4 font-semibold text-white hover:bg-red-700">Delete</button>
                {/* The question was just asked: focus goes to the safe answer. */}
                <button type="button" autoFocus onClick={() => onCancelDelete?.()} className="min-h-[44px] rounded-lg border border-hairline px-4 font-semibold text-ink hover:bg-page">Cancel</button>
              </div>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

function useWidth(ref) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(([e]) => setW(e.contentRect.width)) : null;
    ro?.observe(el); setW(el.getBoundingClientRect().width);
    return () => ro?.disconnect();
  }, [ref]);
  return w;
}

export default function DocumentsStep({
  lead, reg, info, context, stage, flush, updateItem, deleteItem, undeleteItem, upsertItem, addItem, mutateMeta, replaceItems, patchLead, reloadContext, saveStateOf, actor,
  onPortalItem, onOpenRoom, onOpenActions, saveText,
}) {
  const [docs, setDocs] = useState({ issued: [], sources: [], schemaReady: true });
  const [active, setActive] = useState(null);           // doc key being previewed
  const [preview, setPreview] = useState(null);         // { url, checks, revision, lines, notPrinted, key, at }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [recipient, setRecipient] = useState({ name: "", email: "" });
  const [proof, setProof] = useState(null);             // Blueprint's wording check: { url, issues, model, truncated }
  const [proofView, setProofView] = useState("marked");  // which copy the preview shows: "marked" | "clean"
  const [proofBusy, setProofBusy] = useState(false);
  const proofSeq = useRef(0);                           // a check's answer is shown only if it's still for this preview
  const [drawer, setDrawer] = useState(null);           // the edit drawer's target
  const [pane, setPane] = useState("lines");            // narrow column: "lines" | "pdf"
  const [onlyWarned, setOnlyWarned] = useState(false);
  const [moreAmber, setMoreAmber] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);   // the key of the empty-answers entry being asked about
  const [sheet, setSheet] = useState(null);                   // phone: "red" | "amber", the box open as a sheet
  const box = useRef(null);
  const width = useWidth(box);
  // Two panes from the step's own width; "phone" is the viewport (390 pt), never a narrow Hub column (finding M10).
  const wide = width >= 1000;
  const phone = useNarrow();
  const stageInset = useStageBarInset();
  const toast = useToast();

  const load = useCallback(async () => {
    const r = await apiFetch(`/api/register/leads/${lead.id}/documents`);
    if (r.ok) setDocs(r.data.documents);
  }, [lead.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview]);
  // Keyed on the URL itself, so switching between the copies never revokes the highlighted one (review PROOF-01).
  const proofUrl = proof?.url;
  useEffect(() => () => { if (proofUrl) URL.revokeObjectURL(proofUrl); }, [proofUrl]);
  const dropProof = () => { proofSeq.current += 1; setProof(null); setProofBusy(false); };

  function defaultRecipient(key) {
    if (DOCS.find((d) => d.key === key)?.internal) return { name: "Blue Leaf estimating", email: "" };
    if (key === "architect_brief" || key === "selections_schedule") return { name: architectRecipient(context), email: "" };
    return { name: context?.identity?.clientName || "", email: context?.identity?.email || "" };
  }

  async function openPreview(key, { keepDrawer = false } = {}) {
    setMsg(null); setBusy(true); setActive(key); dropProof(); setSheet(null); setConfirmDelete(null);
    if (!keepDrawer) setDrawer(null);
    const rec = recipient.name && active === key ? recipient : defaultRecipient(key);
    setRecipient(rec);
    // Render from what is on screen — but SAVE it first. If the save does not land (conflict / guard / offline)
    // the preview would show stale data, so stop and tell the employee; their edits are kept for a retry.
    const saved = await flush();
    if (!saved) { setBusy(false); setMsg({ tone: "red", text: "Your latest changes haven’t saved yet, so there’s nothing new to preview. Check the save status above the register (a conflict or a failed save), then preview again — your edits are kept." }); return; }
    const r = await apiPost(`/api/register/leads/${lead.id}/documents/${key}/preview`, { recipientName: rec.name });
    setBusy(false);
    if (!r.ok) { setMsg({ tone: "red", text: r.error }); return; }
    if (preview?.url) URL.revokeObjectURL(preview.url);
    dropProof();   // a wording check belongs to the draft it read
    setPreview({ key, url: b64ToBlobUrl(r.data.pdf), checks: r.data.checks, revision: r.data.revision, previewedFor: rec.name, itemVersions: r.data.itemVersions,
      lines: r.data.lines || null, notPrinted: r.data.notPrinted || null, at: new Date(), printKey: printKey(reg, context) });
  }

  // Blueprint proofreads the draft just previewed (spelling, grammar, wording a reader would stumble on). It reads the
  // same register version as the preview, or says to preview again. Suggestions only: nothing is changed.
  async function checkWording() {
    if (!active || !preview?.itemVersions) return;
    const seq = ++proofSeq.current;
    setProofBusy(true); setMsg(null);
    const r = await apiPost(`/api/register/leads/${lead.id}/documents/${active}/proofread`, { recipientName: preview.previewedFor, expectedVersions: preview.itemVersions });
    // A newer preview, a close or an issue since then: this answer is for a draft no longer on screen (review PROOF-04).
    if (seq !== proofSeq.current) return;
    setProofBusy(false);
    if (!r.ok) { setMsg({ tone: "red", text: r.error }); return; }
    const p = r.data.proofread;
    setProof({ url: p.pdf ? b64ToBlobUrl(p.pdf) : null, issues: p.issues || [], model: p.model, truncated: !!p.truncated });
    setProofView(p.pdf ? "marked" : "clean");
  }

  async function issue() {
    if (!active) return;
    // You must have a current preview to issue: it carries the content fingerprint the server re-checks, so an
    // issue can never record a controlled document from data that changed (or never saved) since the preview.
    if (!preview?.itemVersions) { setMsg({ tone: "red", text: "Preview the document first — issuing records the exact version you previewed." }); return; }
    setBusy(true); setMsg(null);
    const saved = await flush();
    if (!saved) { setBusy(false); setMsg({ tone: "red", text: "Your latest changes haven’t saved yet — the document was NOT issued. Resolve the save status above the register (a conflict or a failed save), then preview and issue again. Your edits are kept." }); return; }
    const r = await apiPost(`/api/register/leads/${lead.id}/documents/${active}/issue`, { recipientName: recipient.name, recipientEmail: recipient.email, expectedVersions: preview.itemVersions });
    setBusy(false);
    if (!r.ok) {
      const checks = r.body?.checks;
      const stale = r.code === "ISSUE_STALE";
      setMsg({ tone: "red", text: checks?.errors?.length ? `${r.error} ${checks.errors.join(" ")}` : r.error });
      if (stale) { setPreview(null); dropProof(); }      // force a fresh preview of the current version before re-issuing
      return;
    }
    setMsg({ tone: "green", text: DOCS.find((d) => d.key === active)?.internal
      ? `Recorded ${r.data.document.revision_label} for ${recipient.name}. It's stored permanently for internal pricing. Don't send it to the client, consultants or trades.`
      : `Recorded ${r.data.document.revision_label} for ${recipient.name} — not emailed. The controlled PDF is stored permanently; download it below to send.` });
    setPreview(null); setActive(null); dropProof();
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

  // The architect's brief, live: the same model and checks the server uses, recomputed on every change.
  const liveModel = useMemo(() => (context ? architectBriefModel(reg, context, { recipientName: recipient.name }) : null), [reg, context, recipient.name]);
  const liveLines = useMemo(() => (liveModel ? architectBriefLines(liveModel, { siteAddress: [context?.identity?.siteAddress, context?.identity?.suburb].filter(Boolean).join(", "), clientName: context?.identity?.clientName, drawingBasis: reg.meta.planRev }) : []), [liveModel, context, reg.meta.planRev]);
  // Records a received document is linked to are never offered as "empty" for deletion (review R6).
  const keepIds = useMemo(() => [...new Set((docs.sources || []).flatMap((d) => (Array.isArray(d.register_item_ids) ? d.register_item_ids : [])))], [docs.sources]);
  const liveContent = useMemo(() => (context ? contentChecks("architect_brief", reg, context, liveModel, { keepIds }) : []), [reg, context, liveModel, keepIds]);
  const titles = useMemo(() => briefSectionTitles(liveModel), [liveModel]);
  const needBrief = useMemo(() => roomsNeedingBrief(reg), [reg]);
  // The release blockers, live from the same rules the server checks (finding N2): with the name under "Issue to" for the
  // red marks on the lines, and with the named architect for the readiness line before a preview.
  const liveBlockers = useMemo(() => (context ? releaseBlockers("architect_brief", reg, { recipientName: recipient.name, drawingBasis: reg.meta.planRev }) : []), [reg, context, recipient.name]);
  const readyBlockers = useMemo(() => (context ? releaseBlockers("architect_brief", reg, { recipientName: architectRecipient(context), drawingBasis: reg.meta.planRev }) : []), [reg, context]);
  const stale = !!preview && preview.printKey !== printKey(reg, context);

  // Lines that carry a check: red where a release blocker targets them (live, so a fixed line loses its red at once,
  // finding P1), amber where a content check does or where the line is a gap that doesn't block (the budget). The red box
  // itself keeps the server's list until "Preview again".
  const marks = useMemo(() => {
    const red = new Set(), amber = new Set();
    for (const b of liveBlockers) for (const t of b.targets || []) { const k = targetKey(t); if (k) red.add(k); }
    for (const c of liveContent) for (const t of c.targets || []) { const k = targetKey(t); if (k) amber.add(k); }
    return (l) => {
      const k = lineKeys(l);
      if (k.some((x) => red.has(x))) return "red";
      return k.some((x) => amber.has(x)) || l.gap || (l.placeholder && l.source?.kind !== "room") ? "amber" : "";
    };
  }, [liveBlockers, liveContent]);

  const roomsCount = reg.meta.rooms?.length || 0;
  function scopeSummary(key) {
    if (key === "selections_schedule" || key === "client_presentation") {
      const n = reg.items.filter((i) => isClientSelection(i)).length;
      return key === "selections_schedule"
        ? `${n} client selection${n === 1 ? "" : "s"} by trade, with the requirements they must meet, open actions and source documents. No prices.`
        : `${n} client selection${n === 1 ? "" : "s"} room by room, and the decisions we need from the client. No codes, references, technical states or prices.`;
    }
    if (DOCS.find((d) => d.key === key)?.internal) return `Internal. Scope, systems, risks, Blue Leaf assumptions and staff notes across ${roomsCount} room${roomsCount === 1 ? "" : "s"}. No prices or quantities.`;
    return `Scope and client preferences across ${roomsCount} room${roomsCount === 1 ? "" : "s"}. No internal notes or prices.`;
  }
  // The architect's brief's readiness before a preview: the release blockers we can check in the browser (all but the
  // dollar-figure and rendering checks, which need the PDF), and the content checks.
  function readiness(key) {
    if (key !== "architect_brief" || !context) return "";
    const red = readyBlockers.length;
    return [red ? `${red} to fix before issuing` : "", liveContent.length ? `${liveContent.length} worth checking` : ""].filter(Boolean).join(" · ");
  }

  // The edit drawer: next warning, the next room in the queue a Fix came from ("Next room ›", finding N14), and the next
  // room without a brief.
  const warnedLines = liveLines.filter((l) => marks(l));
  const roomById = (id) => (reg.meta.rooms || []).find((r) => r.id === id) || null;
  const roomLine = (id) => {
    const l = liveLines.find((x) => x.source?.kind === "room" && String(x.source.key || "").split(",").includes(id));
    return l ? `${l.label}: ${l.text}` : `${roomById(id)?.name || "Room"}: brief to follow`;
  };
  function nextAfter(current) {
    if (current?.kind === "room") {
      const here = current.roomIds?.[0];
      const queue = (current.queue || []).filter((id) => roomById(id));
      const at = queue.indexOf(here);
      if (at >= 0 && at < queue.length - 1) {
        const id = queue[at + 1];
        return { label: "Next room ›", go: () => setDrawer({ ...current, roomIds: [id], line: roomLine(id) }) };
      }
      const rest = needBrief.filter((r) => r.id !== here);
      if (rest.length) {
        const k = needBrief.findIndex((r) => r.id === here);
        const next = (k >= 0 ? [...needBrief.slice(k + 1), ...needBrief.slice(0, k)] : needBrief).find((r) => r.id !== here);
        return { label: "Next room without a brief ›", go: () => setDrawer({ kind: "room", roomIds: [next.id], line: roomLine(next.id) }) };
      }
    }
    if (!warnedLines.length) return null;
    const at = warnedLines.findIndex((l) => `${l.section}|${l.label}` === current?.lineKey);
    const next = warnedLines[(at + 1) % warnedLines.length];
    if (at >= 0 && warnedLines.length === 1) return null;
    return { label: "Next warning ›", go: () => setDrawer(lineTarget(next)) };
  }
  function fix(check) {
    setSheet(null);
    const targets = check.targets || [];
    if (check.action === "actions") { onOpenActions?.("unnamed"); return; }
    if (check.action === "delete_empty") { setConfirmDelete(entryKey(check)); return; }
    // Rooms: open the first; "Next room ›" steps through the rest of this entry's rooms, then the rooms without a brief.
    const roomIds = targets.filter((t) => t.kind === "room").map((t) => t.id);
    if (roomIds.length) { setDrawer({ kind: "room", roomIds: [roomIds[0]], line: check.text, ...(check.key === "room_briefs" ? {} : { queue: roomIds }) }); return; }
    // Several records ("3 notes look unfinished"): all of them, one under the other.
    const recs = targets.filter((t) => t.kind === "record");
    if (recs.length > 1) {
      const helps = Object.fromEntries(recs.filter((t) => clean(t.help)).map((t) => [t.id, clean(t.help)]));
      setDrawer({ kind: "record", ids: recs.map((t) => t.id), line: check.text, ...(Object.keys(helps).length ? { helps } : {}) });
      return;
    }
    const t = targets.find((x) => x.kind !== "actions");
    if (t?.kind === "recipient") { document.querySelector("[data-testid=issue-to]")?.focus(); return; }
    setDrawer(checkTarget(t, check.text, check.help));
  }
  // "Delete all n": each record through deleteItem, so the server's guards still apply, then 6 s to undo (finding B1).
  // Only records that may still go are deleted (deletableEmpty): anything typed or chosen on one since the check, or a
  // link to it from another record or a received document, keeps it. Undo puts back the very records, under their own
  // ids (the store's undeleteItem, review R6), so nothing that pointed at them is left hanging.
  function deleteEmpty(check) {
    const may = new Set(deletableEmpty(reg, { keep: keepIds }).map((i) => i.id));
    const gone = check.targets.map((t) => reg.items.find((i) => i.id === t.id)).filter((i) => i && may.has(i.id));
    setConfirmDelete(null);
    setSheet(null);                                              // a phone sheet's scrim would cover the Undo
    if (!gone.length) return;
    gone.forEach((i) => deleteItem(i.id));
    const n = gone.length;
    toast.show(`Deleted ${n} empty answer${n === 1 ? "" : "s"}.`, undeleteItem ? () => gone.forEach((i) => undeleteItem(i)) : null);
  }
  const reviewEmpty = (check) => { setSheet(null); setDrawer({ kind: "record", ids: check.targets.map((t) => t.id), line: check.text }); };

  // The server's red list as at the preview; a room target is the room-brief rule (its Fix walks the rooms without a brief).
  const red = preview ? preview.checks.errors.map((text) => {
    const e = (preview.checks.errorTargets || []).find((x) => x.text === text) || {};
    return { ...e, text, key: e.key || ((e.targets || []).some((t) => t.kind === "room") ? "room_briefs" : `error:${text}`) };
  }) : [];
  const amber = preview ? [
    ...(preview.key === "architect_brief" ? liveContent : (preview.checks.content || [])),
    ...preview.checks.warnings.map((text) => ({ key: text, text, targets: [] })),
  ] : [];
  const recipientChanged = !!preview && preview.previewedFor != null && recipient.name.trim() !== (preview.previewedFor || "").trim();
  const blockReason = !preview ? "" : stale ? "Preview again to issue what you see." : red.length ? `Fix the ${red.length === 1 ? "item" : `${red.length} items`} in red first.` : !recipient.name.trim() ? "Say who it's going to." : "";
  const canIssue = !!preview && !busy && !blockReason && !recipientChanged;
  const entryProps = { reg, onFix: fix, onReview: reviewEmpty, confirmKey: confirmDelete, onAskDelete: (c) => setConfirmDelete(entryKey(c)), onDelete: deleteEmpty, onCancelDelete: () => setConfirmDelete(null) };

  return (
    <div ref={box} className="space-y-3">
      {!docs.schemaReady && <p className="rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">Document issuing needs migration 213 — drafts still preview.</p>}
      {msg && <p className={`rounded border p-2 text-[12px] ${msg.tone === "green" ? "border-green-200 bg-green-50 text-green-800" : msg.tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-700"}`} data-testid="doc-message">{msg.text}</p>}

      {DOCS.map((d) => {
        const history = byType[d.key] || [];
        const current = history.find((h) => h.status === "current");
        const isActive = active === d.key && preview;
        return (
          <div key={d.key} className={`rounded-card border p-3 ${d.stages[0] === stage ? "border-primary/40 bg-primary/[0.03]" : "border-hairline bg-surface"}`} data-testid={`doc-card-${d.key}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-ink">{d.label} {d.stages[0] === stage && <Chip tone="blue">This stage</Chip>} {d.internal && <Chip tone="amber">Internal only</Chip>}</p>
                <p className="text-[12px] text-muted">
                  {current ? `Issued ${current.revision_label} · ${fmtDate(current.issued_at)} · to ${current.recipient_name || "—"} · not emailed` : "Draft — not issued"}
                  {!isActive && readiness(d.key) ? ` · ${readiness(d.key)}` : ""}
                </p>
                {!isActive && <p className="text-[11px] text-muted">{d.hint}</p>}
              </div>
              {!isActive && <button type="button" disabled={busy} onClick={() => openPreview(d.key)} className="min-h-[44px] rounded-lg border border-hairline px-4 text-sm font-semibold text-ink hover:bg-page disabled:opacity-40" data-testid={`preview-${d.key}`}>{busy && active === d.key ? "Previewing…" : "Preview"}</button>}
            </div>

            {isActive && (
              <div className="mt-3 space-y-3">
                {/* B · Title bar. The muted line takes its own row on a phone and at least 14 rem beside the buttons. */}
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 basis-full text-[12px] text-muted sm:min-w-[14rem] sm:flex-1 sm:basis-0">Draft {rev(preview.revision)} · from the register as it is now · previewed {fmtTime(preview.at)}</p>
                  <button type="button" disabled={busy} onClick={() => openPreview(d.key)} className={`min-h-[44px] rounded-lg px-3 text-sm font-semibold disabled:opacity-40 ${stale ? "bg-primary text-white" : "border border-hairline text-ink hover:bg-page"}`} data-testid={`preview-again-${d.key}`}>{busy ? "Previewing…" : "Preview again"}</button>
                  {!phone && (stale ? <span className="text-[12px] text-muted">Preview again to download</span> : (
                    <a href={preview.url} download={`${d.label} - DRAFT (not issued) - ${new Date().toISOString().slice(0, 10)}.pdf`}
                      className="flex min-h-[44px] items-center rounded-lg border border-hairline px-3 text-sm font-semibold text-ink hover:bg-page" data-testid={`download-draft-${d.key}`}>Download draft PDF</a>
                  ))}
                  {/* Safari shows a PDF in a frame with no toolbar, so the draft can't be saved from the frame itself. */}
                  {!phone && <a href={preview.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center px-2 text-[13px] text-primary hover:underline">Open in new tab</a>}
                  <button type="button" disabled={busy || proofBusy || stale} onClick={checkWording} title="Blueprint proofreads this draft for spelling, grammar and wording. Nothing is changed."
                    className="min-h-[44px] rounded-lg border border-primary/40 px-3 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-40" data-testid={`proofread-${d.key}`}>{proofBusy ? "Checking the wording…" : proof ? "Check wording again" : "Check wording"}</button>
                  <button type="button" onClick={() => { setActive(null); setPreview(null); setDrawer(null); setSheet(null); dropProof(); }} className="min-h-[44px] px-2 text-[13px] text-muted hover:text-ink">Close</button>
                </div>

                {/* C · Can't issue yet, and D · Before you send. On a phone: two rows, each opening its list as a sheet. */}
                {phone ? (
                  (red.length > 0 || amber.length > 0) && (
                    <div className="space-y-2">
                      {red.length > 0 && (
                        <button type="button" aria-haspopup="dialog" onClick={() => setSheet("red")} data-testid={`cant-issue-${d.key}`}
                          className="flex min-h-[52px] w-full items-center justify-between rounded-card border border-red-200 bg-red-50 px-3 text-left text-[15px] font-semibold text-red-700">
                          <span>Can&apos;t issue yet · {red.length}</span><span aria-hidden="true">›</span>
                        </button>
                      )}
                      {amber.length > 0 && (
                        <button type="button" aria-haspopup="dialog" onClick={() => setSheet("amber")} data-testid={`before-send-${d.key}`}
                          className="flex min-h-[52px] w-full items-center justify-between rounded-card border border-warning bg-warning/10 px-3 text-left text-[15px] font-semibold text-ink">
                          <span>Before you send · {amber.length}</span><span aria-hidden="true">›</span>
                        </button>
                      )}
                      <Popover open={sheet === "red" && red.length > 0} narrow onClose={() => setSheet(null)} title={`Can't issue yet (${red.length})`}>
                        <div className="pb-2"><CheckEntries entries={red} tone="red" {...entryProps} /></div>
                      </Popover>
                      <Popover open={sheet === "amber" && amber.length > 0} narrow onClose={() => setSheet(null)} title={`Before you send (${amber.length})`}>
                        <div className="pb-2">
                          <p className="px-1 text-[13px] text-muted">These don&apos;t stop you issuing.</p>
                          <CheckEntries entries={amber} tone="amber" {...entryProps} />
                        </div>
                      </Popover>
                    </div>
                  )
                ) : (
                  <>
                    {red.length > 0 && (
                      <div className="rounded-card border border-red-200 bg-red-50 p-3" data-testid={`cant-issue-${d.key}`}>
                        <p className="text-[14px] font-semibold text-red-700">Can&apos;t issue yet ({red.length})</p>
                        <CheckEntries entries={red} tone="red" {...entryProps} />
                      </div>
                    )}
                    {amber.length > 0 && (
                      <div className="rounded-card border border-warning bg-warning/10 p-3" data-testid={`before-send-${d.key}`}>
                        <p className="text-[14px] font-semibold text-ink">Before you send ({amber.length})</p>
                        <p className="text-[12px] text-muted">These don&apos;t stop you issuing.</p>
                        <CheckEntries entries={moreAmber ? amber : amber.slice(0, 5)} tone="amber" {...entryProps} />
                        {amber.length > 5 && <button type="button" onClick={() => setMoreAmber((v) => !v)} className="mt-1 min-h-[44px] text-[13px] font-semibold text-primary hover:underline">{moreAmber ? "Show fewer" : `Show ${amber.length - 5} more`}</button>}
                      </div>
                    )}
                  </>
                )}

                {proof && <ProofList proof={proof} proofView={proofView} setProofView={setProofView} docKey={d.key} />}

                {/* E · What will print, beside the PDF (architect's brief); the PDF alone for the other documents. */}
                {d.key === "architect_brief" && preview.lines ? (
                  <>
                    {!wide && !phone && (
                      <div className="grid grid-cols-2 gap-1 rounded-lg bg-page p-1" role="group" aria-label="Show">
                        {[["lines", "What will print"], ["pdf", "PDF"]].map(([k, l]) => (
                          <button key={k} type="button" aria-pressed={pane === k} onClick={() => setPane(k)} className={`min-h-[44px] rounded-md text-sm font-semibold ${pane === k ? "bg-surface text-ink shadow-sm" : "text-muted"}`}>{l}</button>
                        ))}
                      </div>
                    )}
                    <div className={wide ? "grid grid-cols-[58fr_42fr] gap-3" : ""}>
                      {!phone && (wide || pane === "pdf") && (
                        <div className="relative">
                          {stale && (
                            <div className="absolute inset-x-0 top-0 z-10 flex min-h-[56px] items-center justify-between gap-2 rounded-t border-b border-hairline bg-white/90 px-3">
                              <span className="text-[13px] text-ink">Changed since this preview</span>
                              {!drawer && <button type="button" onClick={() => openPreview(d.key)} className="min-h-[44px] rounded-lg bg-primary px-3 text-sm font-semibold text-white">Preview again</button>}
                            </div>
                          )}
                          <iframe title={`${d.label} draft`} src={proof?.url && proofView === "marked" ? proof.url : preview.url} className="h-[calc(100vh-14rem)] min-h-[28rem] w-full rounded border border-hairline bg-white" />
                        </div>
                      )}
                      {(wide || phone || pane === "lines") && (
                        <PrintList reg={reg} lines={liveLines} previewLines={preview.lines} notPrinted={liveModel?.notPrinted || []} marks={marks} titles={titles} onlyWarned={onlyWarned} setOnlyWarned={setOnlyWarned}
                          onOpen={(t) => setDrawer(t)} />
                      )}
                    </div>
                  </>
                ) : (
                  <div className="relative">
                    {!phone && stale && <div className="absolute inset-x-0 top-0 z-10 flex min-h-[48px] items-center justify-between gap-2 rounded-t bg-white/90 px-3 text-[13px]"><span>Changed since this preview</span><button type="button" onClick={() => openPreview(d.key)} className="min-h-[44px] rounded-lg bg-primary px-3 font-semibold text-white">Preview again</button></div>}
                    {!phone && <iframe title={`${d.label} draft`} src={proof?.url && proofView === "marked" ? proof.url : preview.url} className="h-[28rem] w-full rounded border border-hairline bg-white" />}
                    <p className="mt-1 text-[11px] text-muted">Includes: {scopeSummary(d.key)}</p>
                  </div>
                )}

                {/* F · Issue bar: sticky (one row) only beside the two panes; after the list otherwise (review R12). */}
                <IssueBar docKey={d.key} sticky={wide && !phone} stageInset={stageInset} recipient={recipient} setRecipient={setRecipient}
                  placeholder={d.key === "architect_brief" ? "Name of the architect or firm" : "Name"} canIssue={canIssue} onIssue={issue} label={`Issue ${rev(preview.revision)}`}
                  reason={blockReason || (recipientChanged ? "Recipient changed since this preview — preview again to re-check before issuing." : "")} />

                {/* Phone: the draft PDF itself, in a sticky bar above the app nav (no frame on a phone). */}
                {phone && (
                  <div className="sticky bottom-[76px] z-20 -mx-3 flex min-h-[56px] items-center gap-2 border-t border-hairline bg-surface px-3 py-1.5"
                    style={stageInset ? { bottom: stageInset } : undefined} data-testid={`pdf-bar-${d.key}`}>
                    {stale ? (
                      <button type="button" disabled={busy} onClick={() => openPreview(d.key)} className="min-h-[44px] flex-1 rounded-lg bg-primary px-3 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Previewing…" : "Preview again to download"}</button>
                    ) : (
                      <>
                        <a href={preview.url} download={`${d.label} - DRAFT (not issued) - ${new Date().toISOString().slice(0, 10)}.pdf`}
                          className="flex min-h-[44px] flex-1 items-center justify-center rounded-lg border border-hairline px-3 text-sm font-semibold text-ink" data-testid={`download-draft-${d.key}`}>Download draft PDF</a>
                        <a href={preview.url} target="_blank" rel="noopener noreferrer" className="flex min-h-[44px] flex-1 items-center justify-center rounded-lg border border-hairline px-3 text-sm font-semibold text-primary">Open PDF</a>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {history.length > 0 && (
              <div className="mt-2 overflow-x-auto"><table className="w-full text-[11px]" data-testid={`history-${d.key}`}>
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
              </table></div>
            )}
          </div>
        );
      })}

      {drawer && (() => {
        const next = nextAfter(drawer);
        return (
          <EditDrawer target={drawer} lead={lead} reg={reg} context={context} actor={actor} readOnly={false} saveStateOf={saveStateOf} updateItem={updateItem} deleteItem={deleteItem}
            upsertItem={upsertItem} addItem={addItem} undeleteItem={undeleteItem} mutateMeta={mutateMeta} replaceItems={replaceItems} patchLead={patchLead} reloadContext={reloadContext} onPortalItem={onPortalItem}
            onClose={() => setDrawer(null)} onPreview={() => openPreview(active || "architect_brief", { keepDrawer: true })} onNext={next?.go} nextLabel={next?.label}
            onOpenRoom={onOpenRoom ? (id) => { if (window.confirm(`This closes the preview — open the ${(reg.meta.rooms || []).find((r) => r.id === id)?.name || "room"}?`)) { setDrawer(null); onOpenRoom(id); } } : undefined}
            saveText={saveText} />
        );
      })()}
      <Toast toast={toast.toast} onClose={toast.clear} />

      <Section title="Coordination requests (draft packs from the same register)" defaultOpen={false}>
        <p className="text-[11px] text-muted">A filtered schedule of the items tagged for each consultant or supplier — current drawings, room, product direction, status and open questions. A working document, not an issued record.</p>
        <div className="flex flex-wrap gap-2">
          {PACKS.map(([k, l]) => <button key={k} type="button" disabled={busy} onClick={() => openPack(k)} className="min-h-[44px] rounded-full border border-hairline px-4 text-[13px] font-semibold text-ink hover:bg-page disabled:opacity-40" data-testid={`pack-${k}`}>{l} pack</button>)}
        </div>
      </Section>

      <SourceDocuments lead={lead} reg={reg} info={info} sources={docs.sources} reload={load} openFile={openFile} updateItem={updateItem} />
    </div>
  );
}

/**
 * F · The issue bar: Issue to, Email (kept on the record, nothing is sent) and Issue Rnn, with why it can't issue yet beside
 * the button. sticky: beside the two panes it stays above the app nav and the stage bar, in one row; in a narrower column
 * (the Hub column at 1280, a tablet) and on a phone it sits after the line list, so it never covers the red box (review
 * R12: at two rows it hid an entry and its Fix).
 */
export function IssueBar({ docKey, sticky = false, stageInset = 0, recipient, setRecipient, placeholder = "Name", canIssue, onIssue, label, reason = "" }) {
  return (
    <div className={sticky ? "sticky bottom-[76px] z-20 -mx-3 border-t border-hairline bg-surface px-3 py-2 md:bottom-0" : "border-t border-hairline pt-3"}
      style={sticky && stageInset ? { bottom: stageInset } : undefined} data-testid={`issue-bar-${docKey}`} data-sticky={sticky ? "true" : "false"}>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <Mini label="Issue to"><input value={recipient.name} onChange={(e) => setRecipient((r) => ({ ...r, name: e.target.value }))} placeholder={placeholder}
          autoComplete="off" className="inp min-h-[44px] w-full px-3 text-[16px] sm:w-56 sm:text-[13px]" data-testid="issue-to" /></Mini>
        <Mini label="Email (kept on the record — nothing is sent)"><input value={recipient.email} onChange={(e) => setRecipient((r) => ({ ...r, email: e.target.value }))} inputMode="email" autoComplete="off"
          className="inp min-h-[44px] w-full px-3 text-[16px] sm:w-60 sm:text-[13px]" /></Mini>
        {/* The button and its reason share one 44 px band, so the bar stays one row wherever it fits. */}
        <div className="flex flex-col gap-1 sm:min-w-[16rem] sm:flex-1 sm:flex-row sm:items-center sm:gap-2">
          <button type="button" disabled={!canIssue} onClick={onIssue} className="min-h-[44px] w-full shrink-0 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-40 sm:w-auto" data-testid={`issue-${docKey}`}>{label}</button>
          {reason && <p className="text-[12px] leading-snug text-muted sm:min-w-0 sm:flex-1" data-testid="issue-reason">{reason}</p>}
        </div>
      </div>
    </div>
  );
}

/** Blueprint's wording check, under the boxes. */
function ProofList({ proof, proofView, setProofView, docKey }) {
  return (
    <div className="rounded-card border border-hairline bg-page p-3 text-[12px]" data-testid={`proof-issues-${docKey}`}>
      {proof.url && (
        <div className="mb-1 flex items-center gap-1" role="group" aria-label="Which copy to show">
          {[["marked", "Highlighted copy"], ["clean", "Clean draft"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setProofView(k)} aria-pressed={proofView === k}
              className={`rounded border px-2 py-0.5 font-semibold ${proofView === k ? "border-primary bg-primary/10 text-primary" : "border-hairline text-muted hover:text-ink"}`}>{l}</button>
          ))}
        </div>
      )}
      <p className="font-semibold text-ink">{proof.issues.length ? `Blueprint's wording check: ${proof.issues.length} suggestion${proof.issues.length === 1 ? "" : "s"}` : "Blueprint's wording check found nothing to fix."}</p>
      <p className="text-muted">Suggestions only — nothing has been changed. Fix the wording in the register (fixed template wording: tell the office), then preview again. The issued document is never marked{proof.issues.length ? "; the highlighted copy's page breaks can shift slightly" : ""}.</p>
      {proof.truncated && <p className="text-amber-700">This document is very long: only the first part of its text was checked.</p>}
      {proof.issues.length > 0 && (
        <ol className="mt-1 space-y-1">
          {proof.issues.map((i) => (
            <li key={i.n} className="flex gap-2">
              <span className="mt-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{i.n}</span>
              <span>
                <span className="text-ink">“{i.text}” → <span className="font-semibold">“{i.suggestion}”</span></span>
                <span className="text-muted"> — {i.reason} <Chip tone="slate">{i.kind}</Chip>{!i.marked && " (not marked on the page)"}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const NOT_PRINTED_GROUPS = [
  ["schedule", "In the Technical Selections Schedule instead"],
  ["client", "The client's choices (in the client's brief)"],
  ["waiting", "Still open, with no one named (in the Actions list)"],
  ["held", "Held back until fixed"],
  ["empty", "Empty"],
  ["office", "Kept for the office"],
];
/** The groups "Not in this brief" lists, in order: the known ones, then any other a newer model sends (nothing hidden). */
const notPrintedGroups = (notPrinted) => [...NOT_PRINTED_GROUPS,
  ...[...new Set(notPrinted.map((x) => x.group))].filter((g) => !NOT_PRINTED_GROUPS.some(([k]) => k === g)).map((g) => [g, "Other records"])];
const HELD_SHORT = { unfinished: "unfinished", disagrees: "disagrees with the room", contradicts: "contradicts its status", no_ask: "doesn't say what's needed" };

/** A printed line's words. A room's "Brief to follow." is the only greyed part of its line (spec S6: only the gap). */
function LineWords({ line }) {
  const segs = Array.isArray(line.segments) && line.segments.length ? line.segments
    : line.source?.kind === "room" && line.placeholder && line.text.includes("Brief to follow.")
      ? (() => { const at = line.text.indexOf("Brief to follow."); return [{ text: line.text.slice(0, at), muted: false }, { text: "Brief to follow.", muted: true }, { text: line.text.slice(at + 16), muted: false }]; })()
      : null;
  if (!segs) return line.text;
  return segs.filter((s) => s.text).map((s, k) => (s.muted ? <span key={k} className="italic text-muted">{s.text}</span> : <span key={k}>{s.text}</span>));
}
const clip = (t, n = 48) => { const x = clean(t); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };

/**
 * The architect's brief, line by line as it will print; each line opens its source. titles: briefSectionTitles(model),
 * numbered as the PDF numbers them. A marked line says so in words too (for a screen reader) and with a small "!" by its
 * source, not by colour alone.
 */
export function PrintList({ reg, lines, previewLines, notPrinted, marks, titles = {}, onlyWarned, setOnlyWarned, onOpen, defaultOpenNot = false }) {
  const [openNot, setOpenNot] = useState(defaultOpenNot);
  const before = useMemo(() => new Set((previewLines || []).map((l) => `${l.section}|${l.label}|${l.text}`)), [previewLines]);
  const shown = onlyWarned ? lines.filter((l) => marks(l)) : lines;
  const sections = [...new Set(shown.map((l) => l.section))];
  return (
    <div className="rounded-card border border-hairline bg-surface" data-testid="what-will-print">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-3 py-2">
        <p className="text-[14px] font-semibold text-ink">What will print · {lines.length} lines</p>
        <button type="button" aria-pressed={onlyWarned} onClick={() => setOnlyWarned((v) => !v)}
          className={`min-h-[44px] rounded-full border px-3 text-[12px] font-semibold ${onlyWarned ? "border-warning bg-warning/15 text-ink" : "border-hairline text-muted"}`}>Only lines with a warning</button>
      </div>
      {sections.map((sec) => (
        <div key={sec}>
          <p className="sticky top-[65px] z-[1] bg-page px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted md:top-0" data-testid="print-section">{titles[sec] || sec}</p>
          {shown.filter((l) => l.section === sec).map((l, k) => {
            const mark = marks(l);
            const changed = previewLines && !before.has(`${l.section}|${l.label}|${l.text}`);
            const t = lineTarget(l);
            // Grey only for a gap that blocks issue (Prepared for, Drawing basis); a room greys only "Brief to follow.".
            const grey = l.placeholder && !l.gap && l.source?.kind !== "room";
            return (
              <button key={`${sec}-${k}-${l.label}`} type="button" onClick={() => onOpen(t)} data-testid="print-line" data-mark={mark || undefined}
                className={`flex min-h-[44px] w-full items-start gap-2 border-b border-hairline/70 px-3 py-2 text-left hover:bg-page ${mark === "red" ? "border-l-[3px] border-l-red-500" : mark === "amber" ? "border-l-[3px] border-l-warning" : "border-l-[3px] border-l-transparent"}`}>
                <span className="min-w-0 flex-1">
                  {l.group && <span className="block text-[11px] uppercase tracking-wide text-muted">{l.group}</span>}
                  <span className={`line-clamp-2 text-[14px] ${grey ? "italic text-muted" : "text-ink"}`}>
                    {mark && <span className="sr-only">{mark === "red" ? "Blocks issue: " : "Worth checking: "}</span>}
                    {grey && <span aria-hidden="true">○ </span>}{l.label && <span className="font-semibold">{l.label}{/^\d+$/.test(l.label) ? ". " : ": "}</span>}<LineWords line={l} />
                  </span>
                </span>
                <span className="flex shrink-0 items-start gap-1 pt-0.5 text-right text-[12px] text-muted">
                  {mark && <span aria-hidden="true" className={`mt-0.5 inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-full text-[9px] font-bold leading-none text-white ${mark === "red" ? "bg-red-600" : "bg-warning"}`}>!</span>}
                  <span>{sourceTag(reg, l)}{changed && <span className="ml-1 rounded bg-accent/10 px-1 text-accent">changed</span>} ›</span>
                </span>
              </button>
            );
          })}
        </div>
      ))}
      <div className="border-t border-hairline">
        <button type="button" onClick={() => setOpenNot((v) => !v)} className="flex min-h-[48px] w-full items-center justify-between px-3 text-[14px] font-semibold text-ink hover:bg-page" aria-expanded={openNot}>
          <span>Not in this brief ({notPrinted.length})</span><span aria-hidden="true">{openNot ? "▾" : "▸"}</span>
        </button>
        {openNot && notPrintedGroups(notPrinted).map(([g, title]) => {
          const list = notPrinted.filter((x) => x.group === g);
          if (!list.length) return null;
          return (
            <div key={g}>
              <p className="bg-page px-3 py-1.5 text-[12px] font-semibold text-muted">{title} ({list.length})</p>
              {list.map((x) => {
                const i = reg.items.find((it) => it.id === x.id);
                if (!i) return null;
                // The same place and name the boxes use (placeOf, labelOf), then what it says.
                const place = placeOf(reg, i).label, name = labelOf(i), words = clean(i.description);
                return (
                  <button key={x.id} type="button" onClick={() => onOpen({ kind: "record", ids: [x.id], reasons: { [x.id]: x.reason }, line: `${place}: ${name}` })}
                    className="flex min-h-[44px] w-full items-center gap-2 border-b border-hairline/70 px-3 text-left text-[13px] hover:bg-page" data-testid="not-printed">
                    <span className="min-w-0 flex-1 truncate text-ink">{place} · {name}{words ? <span className="text-muted"> “{clip(words)}”</span> : null}</span>
                    {g === "held" && <span className="shrink-0 text-[12px] text-muted">{HELD_SHORT[x.reason] || ""}</span>}
                    <span className="text-muted" aria-hidden="true">›</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
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
        <Mini label="Issuer"><input value={form.issuer} onChange={(e) => set("issuer", e.target.value)} placeholder="e.g. Routleys" className="inp text-[16px] sm:text-[11px]" /></Mini>
        <Mini label="Document no."><input value={form.docNumber} onChange={(e) => set("docNumber", e.target.value)} className="inp text-[16px] sm:text-[11px]" /></Mini>
        <Mini label="Revision"><input value={form.revisionLabel} onChange={(e) => set("revisionLabel", e.target.value)} placeholder="Rev B" className="inp text-[16px] sm:text-[11px]" /></Mini>
        <Mini label="Received"><input type="date" value={form.receivedAt} onChange={(e) => set("receivedAt", e.target.value)} className="inp text-[16px] sm:text-[11px]" /></Mini>
        <Mini label="Outstanding question"><input value={form.outstandingQuestion} onChange={(e) => set("outstandingQuestion", e.target.value)} className="inp text-[16px] sm:text-[11px]" /></Mini>
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
                <select multiple value={d.register_item_ids || []} onChange={(e) => patch(d, { itemIds: [...e.target.selectedOptions].map((o) => o.value) })} className="inp h-28 w-full text-[16px] sm:text-[11px]">
                  {reg.items.map((i) => <option key={i.id} value={i.id}>{refCode(i)} · {roomLabel(reg, i)} · {itemTitle(i) || i.category}</option>)}
                </select>
                {linked.map((i) => (
                  <div key={i.id} className="flex flex-wrap items-center gap-2 rounded bg-page px-2 py-1">
                    <span className="font-mono text-[10px] text-muted">{refCode(i)}</span>
                    <span className="text-ink">{roomLabel(reg, i)} — {itemTitle(i)}</span>
                    {i.product && <span className="text-muted">{[i.manufacturer, i.product, i.model].filter(Boolean).join(" ")}</span>}
                    {outstandingReasons(i).includes("verification") && <Chip tone="amber">needs verification</Chip>}
                    {i.technicalStatus === "verified" && <Chip tone="green">verified</Chip>}
                    <span className="ml-auto flex gap-2">
                      <button type="button" onClick={() => updateItem(i.id, { source: ref(d), sourceDocId: d.id })} className="text-primary hover:underline">Set as source</button>
                      {/* Verification needs a consultant's document Blue Leaf has reviewed: a supplier's quote or selection is
                          their own information, never technical verification (SELECTIONS_SPEC.md §6; MR Tab 15:51). */}
                      {i.technicalStatus !== "verified" && d.document_type === "consultant_document" && d.review_status === "reconciled" && <button type="button" onClick={() => updateItem(i.id, { technicalStatus: "verified", technicalEvidence: { at: new Date().toISOString(), by: "Blue Leaf review", ref: ref(d) }, source: i.source || ref(d), sourceDocId: d.id })} className="text-green-700 hover:underline">Mark verified by this document</button>}
                      {i.technicalStatus !== "verified" && d.document_type === "consultant_document" && d.review_status !== "reconciled" && <span className="text-muted">Mark the document reconciled to verify against it</span>}
                    </span>
                  </div>
                ))}
                <input defaultValue={d.review_notes || ""} onBlur={(e) => e.target.value !== (d.review_notes || "") && patch(d, { reviewNotes: e.target.value })} placeholder="Review notes (what changed, what was accepted / rejected)…" className="inp w-full text-[16px] sm:text-[11px]" />
              </div>
            )}
          </div>
        );
      })}
    </Section>
  );
}
