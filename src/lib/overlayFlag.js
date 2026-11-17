/**
 * overlayFlag.js — shared plumbing for the register's drawers, sheets, menus and the full-width workspace
 * (REGISTER_SCREENS_SPEC.md; findings N1 and N32). A view concern only: nothing here is stored.
 *
 * useEscapeLayer(active, onEscape, { yieldToFields })
 *   Every overlay registers its Escape here instead of listening itself. One window keydown listener (capture phase)
 *   hands Escape to the TOP active layer only (the most recently activated) and then stops the event
 *   (preventDefault + stopPropagation), so a ⋯ menu inside the edit drawer closes the menu, not the drawer, and the
 *   drawer closing never also leaves full width.
 *   - onEscape(event) may return false to leave the event alone; nothing else handles it then.
 *   - yieldToFields: while focus is in a text box, select or editable area, the layer leaves Escape to that field.
 *     The full-width workspace uses it, so Escape in a room-name box cancels the rename instead of leaving full width.
 *
 * useBodyFlag(className, on)
 *   A class on <body> while `on`, counted per holder, so several overlays can hold it at once and the class goes only
 *   when the last one lets go ("register-overlay-open" hides the Blueprint and Quick-add buttons, see index.css).
 *
 * useBodyData(attribute, value)
 *   The same for a data attribute on <body> (data-register-room, data-register-open): the latest holder's value shows,
 *   and the attribute goes when no one holds it. A hidden second copy of a screen can't clear the visible copy's flag.
 */
import { useEffect, useRef } from "react";

const docOf = () => (typeof document === "undefined" ? null : document);
const winOf = () => (typeof window === "undefined" ? null : window);

// ── Escape layers ───────────────────────────────────────────────────────────────────────────────────

const layers = [];          // bottom → top: { id, handler: { current }, yieldToFields }
let nextId = 0;
let listeningOn = null;     // the window the one listener is on

/** A text box, text area, select or editable area: somewhere Escape can mean "cancel this field". */
export function isEditableTarget(el) {
  if (!el || typeof el !== "object") return false;
  if (el.isContentEditable) return true;
  const tag = String(el.tagName || "").toLowerCase();
  if (tag === "textarea" || tag === "select") return true;
  if (tag !== "input") return false;
  const type = String(el.type || "text").toLowerCase();
  return !["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image"].includes(type);
}

/** The keydown rule. Returns true when a layer took the Escape (and the event was stopped). */
export function handleEscapeKey(e) {
  if (!e || (e.key !== "Escape" && e.key !== "Esc")) return false;
  if (e.isComposing || e.defaultPrevented) return false;
  const top = layers[layers.length - 1];
  if (!top) return false;
  if (top.yieldToFields && isEditableTarget(e.target)) return false;
  let taken;
  try { taken = top.handler.current ? top.handler.current(e) : undefined; } catch { taken = undefined; }
  if (taken === false) return false;
  try { e.preventDefault(); e.stopPropagation(); } catch { /* a plain object in a test */ }
  return true;
}
const onKeyDown = (e) => { handleEscapeKey(e); };

/**
 * Adds a layer on top and returns its release function. handler is a ref ({ current: fn }) so the latest callback runs
 * without the layer moving in the stack. Exported for tests; components use useEscapeLayer.
 */
export function pushEscapeLayer(handler, { yieldToFields = false } = {}, win = winOf()) {
  const entry = { id: ++nextId, handler: handler && "current" in handler ? handler : { current: handler }, yieldToFields: !!yieldToFields };
  layers.push(entry);
  if (!listeningOn && win?.addEventListener) { win.addEventListener("keydown", onKeyDown, true); listeningOn = win; }
  return () => {
    const i = layers.indexOf(entry);
    if (i >= 0) layers.splice(i, 1);
    if (!layers.length && listeningOn) { listeningOn.removeEventListener("keydown", onKeyDown, true); listeningOn = null; }
  };
}
/** How many layers are active (tests and debugging). */
export const escapeLayerCount = () => layers.length;

export function useEscapeLayer(active, onEscape, { yieldToFields = false } = {}) {
  const handler = useRef(onEscape);
  useEffect(() => { handler.current = onEscape; });
  useEffect(() => {
    if (!active) return undefined;
    return pushEscapeLayer(handler, { yieldToFields });
  }, [active, yieldToFields]);
}

// ── Body class and data flags ───────────────────────────────────────────────────────────────────────

const classHolds = new Map();   // className → count

/** Holds a body class; returns the release function. Exported for tests; components use useBodyFlag. */
export function holdBodyFlag(className, doc = docOf()) {
  const body = doc?.body;
  if (!className || !body) return () => {};
  classHolds.set(className, (classHolds.get(className) || 0) + 1);
  try { body.classList.add(className); } catch { /* no DOM */ }
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    const n = (classHolds.get(className) || 1) - 1;
    if (n > 0) { classHolds.set(className, n); return; }
    classHolds.delete(className);
    try { body.classList.remove(className); } catch { /* no DOM */ }
  };
}

export function useBodyFlag(className, on) {
  useEffect(() => {
    if (!on || !className) return undefined;
    return holdBodyFlag(className);
  }, [className, on]);
}

const dataHolds = new Map();    // attribute → [{ value }]

function applyBodyData(attribute, body) {
  const list = dataHolds.get(attribute) || [];
  try {
    if (list.length) body.setAttribute(attribute, list[list.length - 1].value);
    else body.removeAttribute(attribute);
  } catch { /* no DOM */ }
}

/** Holds a body data attribute at a value; returns the release function. Exported for tests; components use useBodyData. */
export function holdBodyData(attribute, value, doc = docOf()) {
  const body = doc?.body;
  if (!attribute || !body) return () => {};
  const entry = { value: String(value) };
  dataHolds.set(attribute, [...(dataHolds.get(attribute) || []), entry]);
  applyBodyData(attribute, body);
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    const rest = (dataHolds.get(attribute) || []).filter((x) => x !== entry);
    if (rest.length) dataHolds.set(attribute, rest); else dataHolds.delete(attribute);
    applyBodyData(attribute, body);
  };
}

/** value null, undefined, false or "" holds nothing. */
export function useBodyData(attribute, value) {
  const on = value != null && value !== false && value !== "";
  useEffect(() => {
    if (!on || !attribute) return undefined;
    return holdBodyData(attribute, value);
  }, [attribute, value, on]);
}
