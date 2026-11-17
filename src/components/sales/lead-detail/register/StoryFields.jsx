/**
 * StoryFields — the client's story, budget and timing, saved straight to the lead (REGISTER_SCREENS_SPEC.md S1, R3).
 *
 * The lead is the only copy: every field writes its lead column through patchLead (PATCH /api/sales/leads/:id), and Sales
 * shows the same fields. Used on the Project step (all fields) and in the Documents step's edit drawer (`fields` limits them).
 *
 *   text      saves 1.2 s after the last keystroke, or on blur; "Saved ✓" for 2 s; on failure "Not saved — try again"
 *             under the field, and the typed words stay in the box
 *   budget    one tap on a band writes both figures (ex GST), a second tap clears both; "Exact…" opens From and To;
 *             a stored range that is no band shows as a chosen "Exact: $… – $…" chip
 *   confirmed "Confirmed with the client" writes "Yes" to the Sales field. Only a plain yes there reads as confirmed
 *             ("Pending bank approval" doesn't); any other words typed there show under the toggle, never rewritten
 *             unless the toggle is changed (and then only after asking)
 *   paying    one of LEAD_FINANCE_STATUS_LABELS; a second tap clears it
 *   start     month + year, stored as YYYY-MM-01
 *
 * patchLead(partial) takes snake_case lead columns. It may return the saved lead, or null/false when the save failed;
 * if it throws or returns null/false the field shows "Not saved — try again".
 */
import { useEffect, useId, useRef, useState } from "react";
import { BUDGET_BANDS, clean } from "../../../../lib/briefModel.js";
import { LEAD_FINANCE_STATUS_LABELS } from "../../../../lib/constants.js";
import {
  STORY_COLUMNS, budgetChoice, bandPatch, exactPatch, moneyText, budgetConfirmedOn, confirmedNoteOf, BUDGET_CONFIRMED_TEXT,
  MONTH_NAMES, startParts, startValue, startYears, BUDGET_FIELD_KEYS, STORY_FIELD_KEYS, PHONE_MORE_KEYS,
} from "../../../../lib/projectStory.js";

/** The fields of the "Budget and timing" group, in screen order (the build contract exports it from here). */
export { BUDGET_FIELD_KEYS };

const SAVE_DELAY = 1200;
const SAVED_FOR = 2000;
const chip = (on) => `focus-ring inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3.5 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
  on ? "border-primary bg-primary font-semibold text-white" : "border-hairline bg-surface text-ink hover:bg-page"}`;
const inputText = "text-[16px] leading-[22px] sm:text-[15px]";
const label = "text-[13px] text-muted";

export function Tick() {
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>;
}

/** The value a prop held last, and a local copy the screen can move ahead of it (reset whenever the prop changes). */
function useMirror(value) {
  const [local, setLocal] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) { setSeen(value); setLocal(value); }
  return [local, setLocal];
}

/** Per-field save state: "saving" | "saved" | "error", with "Saved ✓" cleared after 2 s. */
function useSaveStates() {
  const [states, setStates] = useState({});
  const timers = useRef({});
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);
  const set = (key, state) => {
    clearTimeout(timers.current[key]);
    setStates((s) => ({ ...s, [key]: state }));
    if (state === "saved") timers.current[key] = setTimeout(() => setStates((s) => ({ ...s, [key]: null })), SAVED_FOR);
  };
  return [states, set];
}

function SavedMark({ state }) {
  if (state === "saving") return <span className="text-[12px] text-muted">Saving…</span>;
  if (state === "saved") return <span className="text-[12px] text-accent" role="status">Saved ✓</span>;
  return null;
}
function NotSaved({ onRetry }) {
  return (
    <p className="mt-1 text-[12px] text-red-600" role="alert">
      Not saved — <button type="button" onClick={onRetry} className="inline-flex min-h-[44px] items-center font-semibold underline underline-offset-2">try again</button>
    </p>
  );
}
function FieldHead({ id, text, state }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <label htmlFor={id} className={label}>{text}</label>
      <SavedMark state={state} />
    </div>
  );
}

/**
 * A text box over one lead column. Holds what is being typed, so a reload of the context never eats a keystroke; takes up
 * the stored value again only when nothing is waiting to save.
 */
function StoryText({ id, focusKey, heading, placeholder, rows, value, gap, readOnly, onSave, state, autoFocus }) {
  const stored = value || "";
  const [draft, setDraft] = useState(stored);
  const [seen, setSeen] = useState(stored);
  const [dirty, setDirty] = useState(false);
  const timer = useRef(null);
  const sent = useRef(null);
  const latest = useRef(stored);
  if (stored !== seen) { setSeen(stored); if (!dirty) setDraft(stored); }
  useEffect(() => () => clearTimeout(timer.current), []);

  // Saved as typed (a trailing space isn't trimmed away mid-sentence); a blank box clears the field.
  async function commit(text) {
    clearTimeout(timer.current);
    if (text === stored || (!text.trim() && !stored.trim())) { setDirty(false); return; }
    if (sent.current === text) return;
    sent.current = text;
    const ok = await onSave(text.trim() ? text : null);
    sent.current = null;
    if (ok && latest.current === text) setDirty(false);   // still typing: the next pause saves the rest
  }
  if (readOnly) {
    return (
      <div>
        <p className={`mb-1 ${label}`}>{heading}</p>
        {stored ? <p className="whitespace-pre-line text-[15px] text-ink">{stored}</p> : <p className="text-[15px] text-muted">Not recorded</p>}
      </div>
    );
  }
  const showGap = gap && !clean(draft);
  return (
    <div>
      <FieldHead id={id} text={heading} state={state} />
      <textarea id={id} data-focus-key={focusKey} rows={rows} value={draft} placeholder={placeholder} autoFocus={autoFocus}
        aria-describedby={showGap ? `${id}-gap` : undefined}
        onChange={(e) => {
          const t = e.target.value;
          latest.current = t;
          setDraft(t); setDirty(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => commit(t), SAVE_DELAY);
        }}
        onBlur={() => { if (dirty) commit(draft); }}
        className={`inp block w-full resize-y px-3 py-2.5 ${inputText} ${showGap ? "border-l-[3px] border-l-warning" : ""}`} />
      {showGap && <p id={`${id}-gap`} className="mt-1 text-[12px] leading-4 text-amber-800">{gap}</p>}
      {state === "error" && <NotSaved onRetry={() => commit(draft)} />}
    </div>
  );
}

export default function StoryFields({ context, patchLead, readOnly = false, fields, renderPriorities, phoneCollapse = false, more: moreProp, onMore }) {
  const uid = useId();
  const show = new Set(fields?.length ? fields : STORY_FIELD_KEYS);
  const [moreOwn, setMoreOwn] = useState(false);
  const more = moreProp ?? moreOwn;
  const setMore = onMore || setMoreOwn;
  const [states, setState] = useSaveStates();
  const g = context?.goals || {}, b = context?.budget || {};

  async function save(key, partial) {
    setState(key, "saving");
    let r;
    try { r = await patchLead(partial); } catch { r = null; }
    const failed = r === null || r === false || (r && typeof r === "object" && r.ok === false);
    setState(key, failed ? "error" : "saved");
    return !failed;
  }

  // Chips move at once; a failed save puts them back to what is stored.
  const [budget, setBudget] = useMirror(`${b.min ?? ""}|${b.max ?? ""}`);
  const [lo, hi] = budget.split("|").map((v) => (v === "" ? null : Number(v)));
  const choice = budgetChoice(lo, hi);
  const [exactOpen, setExactOpen] = useState(false);
  const [confirmedOn, setConfirmedOn] = useMirror(budgetConfirmedOn(b.confirmed));
  const note = b.confirmedNote ?? confirmedNoteOf(b.confirmed);
  const [paying, setPaying] = useMirror(b.financeStatus || "");
  const [start, setStart] = useMirror(b.desiredStart || "");
  const [showExcited, setShowExcited] = useState(false);

  async function saveBudget(next, key = "budget") {
    const before = budget;
    setBudget(`${next.construction_budget_min ?? ""}|${next.construction_budget_max ?? ""}`);
    if (!(await save(key, next))) setBudget(before);
  }
  async function toggleConfirmed() {
    const on = !confirmedOn;
    if (!on && note && !window.confirm(`Turn this off? The note in Sales, “${note}”, will be cleared.`)) return;
    if (on && note && !window.confirm(`Confirmed with the client? The note in Sales, “${note}”, will read “${BUDGET_CONFIRMED_TEXT}”.`)) return;
    setConfirmedOn(on);
    if (!(await save("confirmed", { [STORY_COLUMNS.confirmed]: on ? BUDGET_CONFIRMED_TEXT : null }))) setConfirmedOn(!on);
  }
  async function choosePaying(k) {
    const next = paying === k ? "" : k;
    const before = paying;
    setPaying(next);
    if (!(await save("paying", { [STORY_COLUMNS.paying]: next || null }))) setPaying(before);
  }
  // Target start: nothing is written until both month and year are chosen; clearing either clears the date.
  const [startDraft, setStartDraft] = useState(null);
  async function writeStart(next) {
    const before = start;
    setStart(next || "");
    if (!(await save("start", { [STORY_COLUMNS.start]: next }))) setStart(before);
  }
  async function chooseStart(which, value) {
    const cur = startDraft || startParts(start);
    const month = which === "month" ? value : cur.month || "";
    const year = which === "year" ? value : cur.year || "";
    if (value === "") { setStartDraft(null); if (start) await writeStart(null); return; }
    const next = startValue(month, year);
    if (!next) { setStartDraft({ month: Number(month) || null, year: Number(year) || null }); return; }
    setStartDraft(null);
    await writeStart(next);
  }

  const ids = (k) => `${uid}-${k}`;
  const hiddenOnPhone = (k) => (phoneCollapse && !more && PHONE_MORE_KEYS.includes(k) ? "hidden sm:block" : "");
  const anyStory = ["vision", "must_haves", "concern", "priorities"].some((k) => show.has(k));
  const anyBudget = BUDGET_FIELD_KEYS.some((k) => show.has(k));
  const sp = startDraft || startParts(start);
  const excitedShown = show.has("excited") && (showExcited || !!clean(g.excitedAbout) || readOnly);
  // "More about the client (4)": what sits behind it on a phone (the excited line counts once it holds words).
  const moreCount = PHONE_MORE_KEYS.filter((k) => show.has(k) && (k !== "priorities" || renderPriorities) && (k !== "excited" || !!clean(g.excitedAbout))).length;

  const text = (key, heading, placeholder, rows, value, gap) => show.has(key) && (
    <div className={hiddenOnPhone(key)}>
      <StoryText id={ids(key)} focusKey={key} heading={heading} placeholder={placeholder} rows={rows} value={value} gap={gap} readOnly={readOnly}
        state={states[key]} onSave={(t) => save(key, { [STORY_COLUMNS[key]]: t })} autoFocus={key === "excited" && showExcited} />
    </div>
  );

  return (
    <div className="flex flex-col gap-3" data-testid="story-fields">
      {text("vision", "What they want, in their words", "Write it the way they said it.", 3, g.vision, "Not recorded — the architect's brief opens with this.")}
      {text("must_haves", "Must-haves", "One per line — what the design can't do without", 3, g.keyRequirements, "Not recorded.")}
      {text("concern", "What worries them", "Their biggest concern about the build", 2, g.concern, null)}
      {show.has("priorities") && renderPriorities && <div className={hiddenOnPhone("priorities")}>{renderPriorities()}</div>}

      {anyBudget && anyStory && (
        <>
          <div aria-hidden="true" className="my-1 h-px bg-hairline" />
          <h3 className="text-sm font-semibold text-ink">Budget and timing</h3>
        </>
      )}

      {show.has("budget") && (
        <div role="group" aria-labelledby={ids("budget-label")} aria-describedby={choice.kind === "none" ? ids("budget-gap") : undefined}>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span id={ids("budget-label")} className={label}>Construction budget (ex GST)</span>
            <SavedMark state={states.budget} />
          </div>
          {readOnly ? (
            <p className={`text-[15px] ${choice.kind === "none" ? "text-muted" : "text-ink"}`}>{choice.kind === "none" ? "Not recorded" : choice.label}</p>
          ) : (
            <>
              <div className={`flex flex-wrap gap-2 ${choice.kind === "none" ? "border-l-[3px] border-l-warning pl-3" : ""}`}>
                {BUDGET_BANDS.map((band, k) => (
                  <button key={band.key} type="button" aria-pressed={choice.key === band.key} data-focus-key={k === 0 ? "budget" : undefined}
                    onClick={() => { setExactOpen(false); saveBudget(bandPatch(band.key, lo, hi)); }} className={chip(choice.key === band.key)}>
                    {choice.key === band.key && <Tick />}{band.label}
                  </button>
                ))}
                <button type="button" aria-expanded={exactOpen} aria-pressed={choice.kind === "exact"} onClick={() => setExactOpen((o) => !o)} className={chip(choice.kind === "exact")}>
                  {choice.kind === "exact" ? <><Tick />{choice.label}</> : "Exact…"}
                </button>
              </div>
              {exactOpen && <ExactRange idBase={ids("exact")} min={lo} max={hi} onSave={(p) => saveBudget(p, "budget")} />}
              {choice.kind === "none" && <p id={ids("budget-gap")} className="mt-1 text-[12px] leading-4 text-amber-800">Not recorded — the brief will say “to be confirmed by Blue Leaf”.</p>}
              {states.budget === "error" && <p className="mt-1 text-[12px] text-red-600" role="alert">Not saved — try again.</p>}
            </>
          )}
        </div>
      )}

      {show.has("confirmed") && (
        <div className={hiddenOnPhone("confirmed")}>
          {readOnly ? (
            <p className="text-[15px] text-ink">{confirmedOn ? "Confirmed with the client" : <span className="text-muted">Not confirmed with the client</span>}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" aria-pressed={confirmedOn} onClick={toggleConfirmed} data-focus-key="confirmed" className={chip(confirmedOn)}>
                <span aria-hidden="true" className={`inline-flex h-4 w-4 items-center justify-center rounded border-2 ${confirmedOn ? "border-white" : "border-muted"}`}>
                  {confirmedOn && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>}
                </span>
                Confirmed with the client
              </button>
              <SavedMark state={states.confirmed} />
            </div>
          )}
          {note && (
            <p className="mt-1 text-[13px] text-muted">
              Noted in Sales: “{note}”.{!confirmedOn && !readOnly ? " Tick “Confirmed with the client” once they confirm." : ""}
            </p>
          )}
          {states.confirmed === "error" && <p className="mt-1 text-[12px] text-red-600" role="alert">Not saved — try again.</p>}
        </div>
      )}

      {show.has("paying") && (
        <div role="group" aria-labelledby={ids("paying-label")} className={hiddenOnPhone("paying")}>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span id={ids("paying-label")} className={label}>Paying by</span>
            <SavedMark state={states.paying} />
          </div>
          {readOnly ? (
            <p className={`text-[15px] ${paying ? "text-ink" : "text-muted"}`}>{LEAD_FINANCE_STATUS_LABELS[paying] || "Not recorded"}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {Object.entries(LEAD_FINANCE_STATUS_LABELS).map(([k, l], i) => (
                <button key={k} type="button" aria-pressed={paying === k} data-focus-key={i === 0 ? "paying" : undefined} onClick={() => choosePaying(k)} className={chip(paying === k)}>
                  {paying === k && <Tick />}{l}
                </button>
              ))}
            </div>
          )}
          {states.paying === "error" && <p className="mt-1 text-[12px] text-red-600" role="alert">Not saved — try again.</p>}
        </div>
      )}

      {show.has("start") && (
        <div role="group" aria-labelledby={ids("start-label")}>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span id={ids("start-label")} className={label}>Target start</span>
            <SavedMark state={states.start} />
          </div>
          {readOnly ? (
            <p className={`text-[15px] ${sp.month && sp.year ? "text-ink" : "text-muted"}`}>{sp.month && sp.year ? `${MONTH_NAMES[sp.month - 1]} ${sp.year}` : "Not recorded"}</p>
          ) : (
            <div className="flex gap-2">
              <select aria-label="Target start month" data-focus-key="start" value={sp.month || ""} onChange={(e) => chooseStart("month", e.target.value)}
                className={`inp h-11 w-[160px] max-w-[50%] px-3 ${inputText}`}>
                <option value="">Month</option>
                {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select aria-label="Target start year" value={sp.year || ""} onChange={(e) => chooseStart("year", e.target.value)}
                className={`inp h-11 w-[120px] max-w-[40%] px-3 ${inputText}`}>
                <option value="">Year</option>
                {startYears(new Date(), sp.year).map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          )}
          {states.start === "error" && <p className="mt-1 text-[12px] text-red-600" role="alert">Not saved — try again.</p>}
        </div>
      )}

      {show.has("excited") && (excitedShown
        ? text("excited", "What they're most excited about", "The part they keep coming back to", 2, g.excitedAbout, null)
        : !readOnly && (
          <div className={hiddenOnPhone("excited")}>
            <button type="button" data-focus-key="excited" onClick={() => setShowExcited(true)}
              className="focus-ring inline-flex min-h-[44px] items-center gap-1.5 text-sm font-bold text-primary">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              What they&apos;re most excited about
            </button>
          </div>
        ))}

      {phoneCollapse && !more && moreCount > 0 && (
        <button type="button" onClick={() => setMore(true)} className="focus-ring flex min-h-[44px] items-center gap-1.5 text-left text-sm font-bold text-primary sm:hidden" data-testid="story-more">
          More about the client ({moreCount}) <span aria-hidden="true">▸</span>
        </button>
      )}
    </div>
  );
}

/** "Exact…": From and To, ex GST, saved when either box is left. Blank is no figure. */
function ExactRange({ idBase, min, max, onSave }) {
  const [from, setFrom] = useMirror(min != null ? String(min) : "");
  const [to, setTo] = useMirror(max != null ? String(max) : "");
  const [error, setError] = useState(null);
  function commit() {
    const r = exactPatch(from, to);
    if (r.error) { setError(r.error); return; }
    setError(null);
    if (r.patch.construction_budget_min === (min ?? null) && r.patch.construction_budget_max === (max ?? null)) return;
    onSave(r.patch);
  }
  const box = `inp h-11 w-full px-3 ${inputText}`;
  return (
    <div className="mt-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="sr-only">From, ex GST</span>
          <input id={`${idBase}-from`} inputMode="numeric" value={from} placeholder="$ From" onChange={(e) => setFrom(e.target.value)} onBlur={commit} className={box} />
        </label>
        <label className="block">
          <span className="sr-only">To, ex GST</span>
          <input id={`${idBase}-to`} inputMode="numeric" value={to} placeholder="$ To" onChange={(e) => setTo(e.target.value)} onBlur={commit} className={box} />
        </label>
      </div>
      {(min != null || max != null) && !error && <p className="mt-1 text-[12px] text-muted">{[moneyText(min), moneyText(max)].filter(Boolean).join(" – ")} ex GST</p>}
      {error && <p className="mt-1 text-[12px] text-red-600" role="alert">{error}</p>}
    </div>
  );
}
