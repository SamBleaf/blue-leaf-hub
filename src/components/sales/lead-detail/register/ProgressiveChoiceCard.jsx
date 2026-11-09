/**
 * ProgressiveChoiceCard — the answer controls for one configured question (Tab 27 B02, B09, B11, Gate 2).
 *
 * Tap a choice, then only the choices that follow from it. Staff can stop at any level. "Not decided" records why and
 * who holds it, with no note required. Everything it writes goes through registerChoice.js: it holds no rules of its
 * own, and it has no control that can approve, verify or price anything.
 *
 * Plain <button>s with aria-pressed, so Tab, Enter, Space and touch all work without extra handling.
 */
import { useState } from "react";
import {
  choiceView, toggleOption, setOpenWords, removeChoice, reuseChoice, chooseZone, chooseElement, setZoneWords, setElementWords,
  toggleNotDecided, setClientUnsure, toggleNotApplicable, setAnswerNote, setClientNote, itemPatch, reasonPatch, settlePatch, settleOptions,
  statedText, dispositionLabel, UNRESOLVED_REASONS, RESPONSIBILITIES, toggleArea,
} from "../../../../lib/register.js";
import { Select } from "./ui.jsx";

const base = "focus-ring inline-flex min-h-[40px] items-center rounded-full border px-3 py-1 text-xs sm:min-h-[30px] sm:py-0.5 disabled:cursor-not-allowed disabled:opacity-40";
const pill = (on) => `${base} ${on ? "border-primary bg-primary font-semibold text-white" : "border-hairline bg-surface text-ink hover:bg-page"}`;
const quiet = (on) => `${base} ${on ? "border-amber-500 bg-amber-100 font-semibold text-amber-900" : "border-dashed border-hairline text-muted hover:text-ink"}`;
const textLink = "focus-ring inline-flex min-h-[40px] items-center rounded px-1 text-[11px] font-medium text-primary hover:underline sm:min-h-[30px]";

function Choice({ label, on, disabled, onClick, tone = pill, testId }) {
  return (
    <button type="button" aria-pressed={on} disabled={disabled} onClick={onClick} className={tone(on)} data-testid={testId}>
      {on && <span aria-hidden="true" className="mr-1">✓</span>}{label}
    </button>
  );
}

function Row({ heading, children }) {
  return (
    <div role="group" aria-label={heading || "Choices"}>
      {heading && <p className="mb-0.5 text-[10px] uppercase tracking-wide text-muted">{heading}</p>}
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/**
 * A short text box over a value that gets tidied when stored (trimmed, "Other" treated as blank). It holds what is being
 * typed, so a space between two words isn't eaten, and takes up the stored value only when that really changes.
 */
function DraftInput({ value, onCommit, tidy = (v) => v.trim(), ...rest }) {
  const [draft, setDraft] = useState(value);
  if (tidy(draft) !== tidy(value)) setDraft(value);
  return <input {...rest} value={draft} onChange={(e) => { setDraft(e.target.value); onCommit(e.target.value); }} />;
}
const tidyWords = (v) => statedText(v.trim());

const SAVE_TEXT = { dirty: "Saving…", saving: "Saving…", saved: "Saved", error: "Not saved", rejected: "Not saved", conflict: "Changed elsewhere" };

export default function ProgressiveChoiceCard({ question, config, item, disabled, onPatch, saveState, fixedZone, usedZones, areaOptions }) {
  const [more, setMore] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  const view = choiceView(config, item.answer, { showDetail: more, usedZones });
  const qid = config.linkedKey ? `${question?.id}-${config.linkedKey}` : question?.id || item.id;
  const send = (patch) => { setTouched(true); onPatch(patch); };
  const write = (next, extra) => send(itemPatch(item, config, next, extra));
  const settle = settleOptions(config, { showDetail: more, current: item.disposition });
  const canDetail = config.nature === "choice" && item.itemKind === "selection";
  const hasMore = view.hidden || more || canDetail || settleOptions(config, { showDetail: true }).length > settle.length;
  const showNote = noteOpen || !!view.note;
  const details = [[item.manufacturer, item.product, item.model].filter(Boolean).join(" "), item.colour].filter(Boolean).join(" · ");
  const hasDetails = !!details;
  const saveText = touched ? SAVE_TEXT[saveState?.(item.id)] : "";
  // An older record can hold a disposition this question doesn't show. It stays readable and can be cleared.
  const legacyNa = item.disposition === "na" && !view.notApplicable;
  const pillShows = !disabled && (item.disposition === "na" ? !view.ownNotApplicable : settleOptions(config, { showDetail: true }).some(([d]) => d === item.disposition));
  const shownOnCard = item.disposition === "undecided" || (item.disposition === "na" && view.notApplicable) || pillShows || view.chosenDisposition === item.disposition;

  return (
    <div className="mt-1.5 space-y-1.5" data-testid={`card-${qid}`}>
      {config.asksWhat && (
        <input value={item.description} disabled={disabled} onChange={(e) => send({ description: e.target.value })} aria-label="What is this about"
          placeholder={item.itemKind === "action" ? "What needs to happen…" : "What item…"} className="inp w-full text-[11px]" />
      )}

      {view.zone && !fixedZone && (
        <Row heading="Applies to">
          {view.zone.options.map((o) => <Choice key={o.id} label={o.label} on={o.on} disabled={disabled || o.disabled} testId={`zone-${qid}-${o.id}`} onClick={() => write(chooseZone(config, item.answer, o.id))} />)}
          {view.zone.open && <DraftInput value={view.zone.words} tidy={tidyWords} disabled={disabled} onCommit={(v) => write(setZoneWords(config, item.answer, v))} placeholder="Which area…" aria-label="Which area" className="inp min-w-[9rem] flex-1 text-[11px]" />}
        </Row>
      )}
      {view.zone?.open && fixedZone && (
        <DraftInput value={view.zone.words} tidy={tidyWords} disabled={disabled} onCommit={(v) => write(setZoneWords(config, item.answer, v))} placeholder="Which area…" aria-label="Which area" className="inp w-full text-[11px]" />
      )}

      {config.flow?.includes("area") && areaOptions?.length > 0 && (
        <Row heading="Where">
          {areaOptions.map((o) => <Choice key={o.id} label={o.label} on={(item.answer?.areaIds || []).includes(o.id)} disabled={disabled} testId={`area-${qid}-${o.id}`} onClick={() => write(toggleArea(config, item.answer, o.id))} />)}
        </Row>
      )}

      {view.element && (
        <Row heading="Which">
          {view.element.options.map((o) => <Choice key={o.id} label={o.label} on={o.on} disabled={disabled} testId={`element-${qid}-${o.id}`} onClick={() => write(chooseElement(config, item.answer, o.id))} />)}
          {view.element.open && <DraftInput value={view.element.words} tidy={tidyWords} disabled={disabled} onCommit={(v) => write(setElementWords(config, item.answer, v))} placeholder="Which one…" aria-label="Which one" className="inp min-w-[9rem] flex-1 text-[11px]" />}
        </Row>
      )}

      {view.levels.map((level) => (
        <Row key={level.key} heading={level.heading}>
          {level.options.map((o) => (
            <Choice key={o.id} label={o.label} on={o.on} disabled={disabled || o.disabled} testId={`choice-${qid}-${o.path.join("-")}`}
              onClick={() => write(toggleOption(config, item.answer, o.path, { keepReplaced: hasDetails }))} />
          ))}
          {level.options.filter((o) => o.openRows.length).flatMap((o) => o.openRows.map((row, i) => (
            <span key={`${o.id}-${i}`} className="flex min-w-[10rem] flex-1 items-center gap-1">
              <DraftInput value={row.words} tidy={tidyWords} disabled={disabled} placeholder="Say what…" aria-label={`${o.label}: say what`} className="inp w-full text-[11px]" data-testid={`other-${qid}-${o.path.join("-")}`}
                onCommit={(v) => write(setOpenWords(config, item.answer, o.path, row.label, v))} />
              {row.words && !disabled && <button type="button" onClick={() => write(removeChoice(config, item.answer, { path: o.path, label: row.label }))} className={textLink} aria-label={`Remove ${row.words}`}>Remove</button>}
            </span>
          )))}
        </Row>
      ))}

      {view.usual && <p className="text-[11px] text-muted" data-testid={`usual-${qid}`}>Usual finish for this surface: <span className="font-medium text-ink">{view.usual}</span>. Change it under + More detail.</p>}

      {config.clientNote && (!disabled || view.clientNote) && (
        <DraftInput value={view.clientNote} disabled={disabled} onCommit={(v) => write(setClientNote(config, item.answer, v))} placeholder="Note for the client brief (the client reads this)…" aria-label="Note for the client brief. The client reads this" className="inp w-full text-[11px]" data-testid={`client-note-${qid}`} />
      )}

      {view.kept.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900" data-testid={`kept-${qid}`}>
          <p className="font-semibold">Check these. They were chosen before an earlier answer changed.</p>
          <ul className="mt-0.5 space-y-0.5">
            {view.kept.map((k) => (
              <li key={k.key} className="flex flex-wrap items-center gap-x-2">
                <span>{k.label}</span>
                {k.canReuse && !disabled && <button type="button" className={textLink} onClick={() => write(reuseChoice(config, item.answer, k))}>Use again</button>}
                {!disabled && <button type="button" className={textLink} onClick={() => write(removeChoice(config, item.answer, k))}>Remove</button>}
              </li>
            ))}
          </ul>
          {(item.product || item.model || item.colour) && <p className="mt-0.5 text-[10px]">Product and finish details on this item were entered before the change. Check they still apply.</p>}
        </div>
      )}

      {(view.summary || view.notApplicable || saveText) && (
        <p className="text-[11px] text-muted" aria-live="polite" data-testid={`summary-${qid}`}>
          {view.notApplicable ? <span className="font-medium text-ink">Not applicable</span> : view.summary ? <>Recorded: <span className="font-medium text-ink">{view.summary}</span></> : null}
          {saveText && <span className="ml-2">{saveText}</span>}
        </p>
      )}

      {!disabled && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="No answer yet">
          <Choice label="Not decided" on={view.notDecided} tone={quiet} testId={`notdecided-${qid}`} onClick={() => write(toggleNotDecided(config, item.answer))} />
          {!view.ownNotApplicable && <Choice label="N/A" on={view.notApplicable || legacyNa} tone={quiet} testId={`na-${qid}`} onClick={() => (legacyNa ? send({ disposition: "undecided" }) : write(toggleNotApplicable(config, item.answer)))} />}
          {settle.map(([d, label]) => <Choice key={d} label={label} on={item.disposition === d} tone={quiet} testId={`settle-${qid}-${d}`} onClick={() => send(settlePatch(item, config, d))} />)}
          {hasMore && <button type="button" aria-expanded={more} onClick={() => setMore((m) => !m)} className={textLink} data-testid={`more-${qid}`}>{more ? "− Less detail" : "+ More detail"}</button>}
          {!showNote && <button type="button" onClick={() => setNoteOpen(true)} className={textLink} data-testid={`note-${qid}`}>+ Note</button>}
        </div>
      )}

      {details && !(more && canDetail) && (
        <p className="text-[11px] text-muted" data-testid={`details-${qid}`}>Product / finish: <span className="font-medium text-ink">{details}</span></p>
      )}

      {view.notDecided && !disabled && (
        <div className="rounded border border-hairline bg-surface p-1.5" data-testid={`reasons-${qid}`}>
          <Row heading="Why? (optional)">
            <Choice label="Client unsure" on={view.clientUnsure} tone={quiet} onClick={() => write(setClientUnsure(config, item.answer))} />
            {Object.entries(UNRESOLVED_REASONS).map(([key, r]) => <Choice key={key} label={r.label} on={view.reason === key} tone={quiet} testId={`reason-${qid}-${key}`} onClick={() => send(reasonPatch(item, config, key))} />)}
          </Row>
          <label className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted">
            Who has it
            <Select value={item.responsibility} onChange={(v) => send({ responsibility: v })} options={Object.entries(RESPONSIBILITIES)} placeholder="Nobody yet" className="w-40 normal-case tracking-normal" />
          </label>
        </div>
      )}

      {showNote && (
        <DraftInput value={view.note} disabled={disabled} onCommit={(v) => write(setAnswerNote(config, item.answer, v))} placeholder="Short note, staff only…" aria-label="Short note, staff only" className="inp w-full text-[11px]" data-testid={`note-input-${qid}`} />
      )}

      {more && canDetail && (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <input value={item.colour} disabled={disabled} onChange={(e) => send({ colour: e.target.value })} placeholder="Finish / colour, if known" aria-label="Finish or colour" className="inp text-[11px]" />
          <input value={item.product} disabled={disabled} onChange={(e) => send({ product: e.target.value })} placeholder="Product / model, if known" aria-label="Product or model" className="inp text-[11px]" />
        </div>
      )}

      {!shownOnCard && (
        <p className="text-[11px] text-muted" data-testid={`earlier-status-${qid}`}>
          {disabled ? "Work status" : "Earlier work status"}: <span className="font-medium text-ink">{dispositionLabel(item.disposition)}</span>
          {!disabled && <button type="button" className={`${textLink} ml-1`} onClick={() => send({ disposition: "undecided" })}>Clear</button>}
        </p>
      )}

      {!config.asksWhat && item.description && (
        <label className="block text-[10px] text-muted">Written earlier
          <input value={item.description} disabled={disabled} onChange={(e) => send({ description: e.target.value })} className="inp mt-0.5 w-full text-[11px]" />
        </label>
      )}
    </div>
  );
}
