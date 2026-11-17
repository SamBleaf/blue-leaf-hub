/**
 * EditDrawer — "Edit what prints" (REGISTER_SCREENS_SPEC.md S5 G; A2 click-a-line-to-edit). A printed line, a Fix, or a
 * record that didn't print opens its source here, beside the PDF, so staff fix it without leaving the document:
 *
 *   record     the record as a room shows it (ChoiceRow: label, chips, words, ⚑, ⋯ → Product details); a record with no
 *              guided card shows "What it says" and the ⚑. Product details is the office view (no codes, no record type
 *              or disposition: those stay in the Register table). The 11 px staff reference is the only code shown.
 *   room       the room: name, floor, Work, the earlier-answer banner, the room brief, Connects to, must-haves
 *   rooms      the Rooms list in tick mode (choose upstairs rooms)
 *   fact       the client's story and budget fields (saved to the client's details: Sales shows the same)
 *   architect  the named architect with Change, or "Name the architect" (the design-team contact)
 *   sales      a cover line from Sales (site, client, project): read only, with "Change in Sales ›" (decision D1)
 *   meta       the drawing basis, or During the works
 *   site       public mapping, read only, with Re-check (any staff member: POST /api/register/leads/:id/site/recheck)
 *   template   standard wording, read only
 *
 * A right panel (440 px) on desktop and tablet with the PDF still visible; a 90% bottom sheet on a phone. It renders
 * into document.body (so no parent's margin, overflow or stacking moves it), holds the "register-overlay-open" body class
 * while open, and is one Escape layer: Escape closes only the top layer. Saving rules are the same as everywhere: records
 * save through updateItem (an edit that outruns a client approval drops it back to Proposed, with a notice), rooms
 * through mutateMeta, facts through patchLead.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { questionById, resolvePromptId, refCode, configForRow, isGuidedConfig, answerIsEditable } from "../../../../lib/register.js";
import { HELD_BACK_WORDS, labelOf, placeOf, clean, namedArchitect } from "../../../../lib/briefModel.js";
import { contactLabel, SHOW_IN_SALES } from "../../../../lib/projectStory.js";
import { adelaideDay, contractFixed } from "../../../../lib/roomScreen.js";
import { apiPost } from "../../../../lib/apiFetch.js";
import { useBodyFlag, useEscapeLayer } from "../../../../lib/overlayFlag.js";
import ChoiceRow from "./ChoiceRow.jsx";
import PromptRow from "./PromptRow.jsx";
import RoomBriefCard from "./RoomBriefCard.jsx";
import RoomsList from "./RoomsList.jsx";
import StoryFields from "./StoryFields.jsx";
import { NameArchitectPanel } from "./DesignTeamCard.jsx";
import { NeedsActionFlag } from "./NeedsAction.jsx";
import { DraftInput } from "./RoomUi.jsx";
import { useDialogFocus, useNarrow } from "./useRoomUi.js";

const NOT_PRINTED_WORDS = {
  schedule: "Won't print here: it's in the Technical Selections Schedule.",
  client: "Won't print here: it's the client's choice, in the client's brief.",
  empty: "Won't print: it holds nothing yet.",
  office: "Won't print: it's kept for the office.",
};
/** Which story fields the drawer shows for a fact key (the rest stay on the Project step). */
const FACT_FIELDS = {
  vision: ["vision", "must_haves", "concern"], must_haves: ["vision", "must_haves", "concern"], concern: ["vision", "must_haves", "concern"],
  story: ["vision", "must_haves", "concern", "budget", "confirmed"], budget: ["budget", "confirmed"], funding: ["paying", "start"],
};
const SITE_WORDS = "From public mapping. It can't be edited here — re-check if the site or address changed.";
const MAPPING_DOWN = "Couldn't reach the mapping service. Nothing changed.";
const textBtn = "focus-ring inline-flex min-h-[44px] items-center rounded px-1 text-sm font-bold text-primary hover:underline";

/**
 * Why a record that didn't print is held, in one sentence with one colon (spec S5): "Won't print: unfinished — ends
 * with “-”." for a note that stops mid-thought, else the shared words ("Won't print: it disagrees with the room's Work.").
 */
function heldLine(reason, item) {
  if (reason === "unfinished") {
    const end = String(item?.description || "").replace(/\s+$/, "").slice(-1);
    if (end) return `Won't print: unfinished — ends with “${end}”.`;
  }
  const words = clean(HELD_BACK_WORDS[reason]).replace(/^([^:]+):\s+/, "$1 — ").replace(/[.:\s]+$/, "");
  return words ? `Won't print: ${words}.` : NOT_PRINTED_WORDS[reason] || "";
}

/** A record with no guided card: its words ("What it says") and the ⚑. */
function PlainRecordRow({ reg, context, item, actor, readOnly, updateItem, upsertItem }) {
  const locked = contractFixed(item);   // locked under the contract, or in the signed baseline: the server refuses both (N21)
  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 pt-2.5 text-[15px] font-bold leading-5 text-ink sm:text-sm">{labelOf(item)}</p>
        <NeedsActionFlag reg={reg} context={context} item={item} updateItem={updateItem} upsertItem={upsertItem} readOnly={readOnly} actor={actor} />
      </div>
      <label className="block text-[13px] text-muted">What it says
        <DraftInput value={item.description} disabled={readOnly || locked} onCommit={(v) => updateItem(item.id, { description: v })} placeholder="Say what…"
          className="inp mt-1 min-h-[44px] w-full px-3 text-[16px] text-ink sm:text-sm" />
      </label>
      {locked && <p className="text-[13px] text-muted">{item.sync?.locked ? "Approved under the contract" : "Part of the signed contract"} — change it through a variation.</p>}
    </div>
  );
}

/** One record in the drawer: where it is from, why it didn't print, the row, the guidance, Product details, the reference. */
function RecordBlock({ item: i, many, first, target, reg, context, actor, readOnly, saveStateOf, updateItem, upsertItem, deleteItem, onPortalItem }) {
  const [details, setDetails] = useState(!!target.details);
  const question = questionById(resolvePromptId(i.promptKey)) || null;
  const config = configForRow(question?.id || null, i);
  const guided = isGuidedConfig(config) && answerIsEditable(i.answer);
  const room = (reg.meta.rooms || []).find((r) => r.id === i.roomId) || null;
  const reason = target.reasons?.[i.id];
  const help = clean(target.helps?.[i.id] || (first ? target.help : ""));
  const locked = contractFixed(i);
  return (
    <div className="space-y-2 border-b border-hairline pb-3 last:border-0" data-testid={`drawer-record-${i.id}`}>
      {(many || reason) && <p className="text-[13px] text-muted">From {placeOf(reg, i).label}: {labelOf(i)}</p>}
      {reason && <p className="rounded-lg border border-warning/60 bg-warning/10 px-3 py-2 text-[13px] text-ink">{heldLine(reason, i)}</p>}
      {guided ? (
        <div className="-mx-4">
          <ChoiceRow reg={reg} context={context} question={question} item={i} seed={null} room={room} upsertItem={upsertItem} updateItem={updateItem} deleteItem={deleteItem}
            readOnly={readOnly} saveState={saveStateOf} actor={actor} onPortalItem={onPortalItem} />
        </div>
      ) : (
        <PlainRecordRow reg={reg} context={context} item={i} actor={actor} readOnly={readOnly} updateItem={updateItem} upsertItem={upsertItem} />
      )}
      {help && <p className="text-[13px] leading-snug text-muted" data-testid="drawer-help">{help}</p>}
      {details ? (
        <div className="rounded-lg border border-hairline bg-page p-2" data-testid={`drawer-details-${i.id}`}>
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Product details</p>
            <button type="button" onClick={() => setDetails(false)} className={textBtn}>Close</button>
          </div>
          <PromptRow office question={null} item={i} actor={actor} readOnlyReason={readOnly ? "Read-only" : null} saveState={saveStateOf(i.id)} actionFlag={false}
            onChange={(partial) => updateItem(i.id, partial)} onDelete={!guided && !readOnly && !locked ? () => deleteItem(i.id) : null}
            onPortal={onPortalItem ? (action, ev) => onPortalItem(i, action, ev) : null} />
        </div>
      ) : !guided && (
        <button type="button" onClick={() => setDetails(true)} className={textBtn}>Product details…</button>
      )}
      <p className="text-[11px] text-muted">Staff reference {refCode(i)}</p>
    </div>
  );
}

/**
 * The architect: once named, "<Name> — <Firm>" with Change (one architect, owner decision 6); otherwise the search. A
 * save shows the named row at once from the design team the server returns, with "Saved ✓" for 2 s, until the context
 * reloads, so the filled form never stays up for a second Save.
 */
function ArchitectBody({ lead, context, reloadContext, readOnly }) {
  const [changing, setChanging] = useState(false);
  const [fresh, setFresh] = useState(null);           // { list, base }: what the save returned, for the context it was made on
  const [saved, setSaved] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const current = context?.consultants;
  const named = (fresh && fresh.base === current ? namedArchitect({ consultants: fresh.list }) : null) || namedArchitect(context);
  const onSaved = (list) => {
    setFresh({ list: Array.isArray(list) ? list : [], base: current });
    setChanging(false);
    setSaved(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 2000);
    reloadContext?.();
  };
  if (named && !changing) {
    return (
      <div className="space-y-2" data-testid="drawer-architect">
        <p className="text-[13px] text-muted">Architect</p>
        <div className="flex min-h-[56px] items-center gap-2 rounded-lg border border-hairline px-3">
          <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{contactLabel(named)}</span>
          {saved && <span className="shrink-0 text-[13px] font-semibold text-accent" role="status">Saved ✓</span>}
          {!readOnly && <button type="button" onClick={() => setChanging(true)} className={`${textBtn} shrink-0 px-2`}>Change</button>}
        </div>
        <p className="text-[12px] text-muted">Saved to the client&apos;s contacts — Sales shows the same.</p>
      </div>
    );
  }
  if (readOnly) return <p className="text-sm text-muted">No architect named yet.</p>;
  return (
    <NameArchitectPanel lead={lead} context={context} onSaved={onSaved} role="architect"
      replaces={named ? { roleId: named.roleId || null, contactId: named.contactId || null } : null} onCancel={named ? () => setChanging(false) : undefined} />
  );
}

/** Public mapping, read only. Re-check is open to every staff member; the server limits how often it runs per lead. */
function SiteBody({ target, lead, readOnly, reloadContext }) {
  const [msg, setMsg] = useState(null);
  const checking = msg === "Checking public mapping…";
  async function recheck() {
    setMsg("Checking public mapping…");
    const r = await apiPost(`/api/register/leads/${lead.id}/site/recheck`, {});
    if (r.ok) { setMsg(`Updated ${adelaideDay(new Date().toISOString())}`); reloadContext?.(); }
    else setMsg(!r.network && clean(r.body?.error) ? clean(r.body.error) : MAPPING_DOWN);
  }
  return (
    <div className="space-y-2" data-testid="drawer-site">
      <p className="text-sm text-ink">{target.text}</p>
      <p className="text-[13px] text-muted">{SITE_WORDS}</p>
      {!readOnly && (
        <button type="button" onClick={recheck} disabled={checking} className="min-h-[44px] rounded-lg border border-hairline px-3 text-sm font-semibold text-ink hover:bg-page disabled:opacity-50">Re-check</button>
      )}
      {msg && <p className="text-[12px] text-muted" role="status">{msg}</p>}
    </div>
  );
}

/** A cover line from Sales (site, client, project): read only here (decision D1), changed in Sales. */
function SalesBody({ target, onClose }) {
  const show = () => { onClose?.(); document.dispatchEvent(new CustomEvent(SHOW_IN_SALES, { detail: "details" })); };
  return (
    <div className="space-y-2" data-testid="drawer-sales">
      {target.text && (
        <div className="rounded-lg border border-hairline bg-page px-3 py-2">
          {target.label && <p className="text-[12px] text-muted">{target.label}</p>}
          <p className="text-[15px] text-ink">{target.text}</p>
        </div>
      )}
      <p className="text-[13px] text-muted">From the client&apos;s details in Sales. The brief reads it each time it&apos;s previewed.</p>
      <button type="button" onClick={show} className={textBtn}>Change in Sales ›</button>
    </div>
  );
}

export default function EditDrawer({
  target, lead, reg, context, actor, readOnly, saveStateOf, updateItem, deleteItem, upsertItem, addItem, mutateMeta, replaceItems, patchLead, reloadContext,
  onPortalItem, onClose, onPreview, onNext, nextLabel, onOpenRoom, saveText,
}) {
  const phone = useNarrow();
  const panel = useRef(null);
  const open = !!target;
  useBodyFlag("register-overlay-open", open);
  useEscapeLayer(open, onClose);
  useDialogFocus(panel, open);
  const items = useMemo(() => (target?.ids || []).map((id) => reg.items.find((i) => i.id === id)).filter(Boolean), [target, reg.items]);
  if (!target) return null;
  const rooms = (target.roomIds || []).map((id) => (reg.meta.rooms || []).find((r) => r.id === id)).filter(Boolean);
  const recordProps = { target, reg, context, actor, readOnly, saveStateOf, updateItem, upsertItem, deleteItem, onPortalItem };

  const body = (() => {
    switch (target.kind) {
      case "record":
        if (!items.length) return <p className="text-sm text-muted">This record has been removed.</p>;
        return items.map((i, k) => <RecordBlock key={i.id} item={i} many={items.length > 1} first={k === 0} {...recordProps} />);
      case "room":
        if (!rooms.length) return <p className="text-sm text-muted">This room has been removed.</p>;
        return rooms.map((room) => (
          <div key={room.id} className="space-y-2 border-b border-hairline pb-3 last:border-0">
            <RoomBriefCard reg={reg} room={room} context={context} upsertItem={upsertItem} updateItem={updateItem} deleteItem={deleteItem} addItem={addItem} mutateMeta={mutateMeta}
              readOnly={readOnly} compact onOpenRoom={onOpenRoom ? () => onOpenRoom(room.id) : undefined} />
          </div>
        ));
      case "rooms":
        return <RoomsList reg={reg} context={context} mutateMeta={mutateMeta} replaceItems={replaceItems} openRoom={(id) => onOpenRoom?.(id)} readOnly={readOnly} startTickMode={target.key === "floors"} />;
      case "fact":
        return (
          <div className="space-y-2">
            <StoryFields context={context} patchLead={patchLead} readOnly={readOnly} fields={FACT_FIELDS[target.key] || FACT_FIELDS.story} />
            <p className="text-[12px] text-muted">Saved to the client&apos;s details — Sales shows the same.</p>
          </div>
        );
      case "architect":
        return <ArchitectBody lead={lead} context={context} reloadContext={reloadContext} readOnly={readOnly} />;
      case "meta":
        if (target.key === "occupancy") return (
          <div className="space-y-1">
            <span className="text-[13px] text-muted">During the works</span>
            <div className="grid grid-cols-3 gap-1" role="group" aria-label="During the works">
              {[["vacant", "Moving out"], ["partly", "Partly lived in"], ["occupied", "Living there"]].map(([k, l]) => (
                <button key={k} type="button" disabled={readOnly} aria-pressed={reg.meta.occupancy === k} onClick={() => mutateMeta({ occupancy: k })}
                  className={`min-h-[44px] rounded-lg border px-1 text-[15px] font-semibold leading-tight sm:text-sm ${reg.meta.occupancy === k ? "border-primary bg-primary text-white" : "border-hairline text-ink hover:bg-page"}`}>{l}</button>
              ))}
            </div>
          </div>
        );
        return (
          <label className="block space-y-1">
            <span className="text-[13px] text-muted">Drawings this brief is based on</span>
            <input defaultValue={reg.meta.planRev || ""} disabled={readOnly} onBlur={(e) => clean(e.target.value) !== (reg.meta.planRev || "") && mutateMeta({ planRev: clean(e.target.value) })}
              placeholder="e.g. DA rev 3" className="inp min-h-[44px] w-full px-3 text-[16px] sm:text-[15px]" data-testid="drawer-planrev" />
          </label>
        );
      case "site":
        return <SiteBody key={target.line || target.text || "site"} target={target} lead={lead} readOnly={readOnly} reloadContext={reloadContext} />;
      case "sales":
        return <SalesBody target={target} onClose={onClose} />;
      default:
        return <p className="text-sm text-muted">Standard wording in every architect&apos;s brief. It can&apos;t be changed here.</p>;
    }
  })();

  const node = (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Edit what prints">
      <button type="button" aria-label="Close" onClick={onClose} className={`absolute inset-0 ${phone ? "bg-black/30" : "bg-transparent"} cursor-default`} />
      <div ref={panel} tabIndex={-1}
        className={`relative flex flex-col bg-surface shadow-2xl outline-none ${phone ? "mt-auto h-[90vh] w-full rounded-t-2xl" : "h-full w-[440px] max-w-full border-l border-hairline"}`}
        data-testid="edit-drawer">
        {phone && <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-hairline" aria-hidden="true" />}
        <div className="flex items-start gap-2 border-b border-hairline px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-ink">Edit what prints</p>
            {target.line && <p className="line-clamp-2 text-[13px] text-muted">“{target.line}”</p>}
          </div>
          <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-lg text-xl text-muted hover:bg-page hover:text-ink" aria-label="Close">×</button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">{body}</div>
        <div className="flex min-h-[64px] items-center gap-2 border-t border-hairline px-4 py-2 pb-[max(8px,env(safe-area-inset-bottom))]">
          <span className="min-w-0 flex-1 truncate text-[12px] text-muted" data-testid="drawer-save-state">{saveText}</span>
          {onNext && <button type="button" onClick={onNext} className="min-h-[44px] px-2 text-[13px] font-semibold text-primary hover:underline" data-testid="drawer-next">{nextLabel || "Next warning ›"}</button>}
          <button type="button" onClick={onPreview} className="min-h-[44px] rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:opacity-90" data-testid="drawer-preview-again">Preview again</button>
        </div>
      </div>
    </div>
  );
  // Into document.body (finding P2): no parent's space-y margin, overflow or stacking can move or clip it. Server
  // rendering (the node tests) has no document, so it renders in place there.
  return typeof document === "undefined" ? node : createPortal(node, document.body);
}
