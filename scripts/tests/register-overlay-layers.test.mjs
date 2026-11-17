/**
 * register-overlay-layers.test.mjs — src/lib/overlayFlag.js, the register's shared overlay plumbing (findings N1, N32, N7, M7):
 *   - Escape goes only to the top open layer (the most recently opened), and the event is stopped there;
 *   - a layer can leave Escape to a text box (the full-width workspace does, so Escape cancels a rename);
 *   - the body class and data flags are counted per holder, so one overlay closing never clears another's.
 * A small fake window and body stand in for the browser. Run: node scripts/tests/register-overlay-layers.test.mjs
 */
import {
  pushEscapeLayer, handleEscapeKey, escapeLayerCount, isEditableTarget, holdBodyFlag, holdBodyData,
} from "../../src/lib/overlayFlag.js";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n    ${String(detail).slice(0, 600)}` : ""}`); } };
const section = (t) => console.log(`\n${t}`);

function fakeWindow() {
  const listeners = [];
  return {
    listeners,
    addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }),
    removeEventListener: (type, fn, capture) => { const i = listeners.findIndex((l) => l.type === type && l.fn === fn && l.capture === capture); if (i >= 0) listeners.splice(i, 1); },
    press(key, target = { tagName: "BODY" }) { const e = keyEvent(key, target); for (const l of [...listeners]) if (l.type === "keydown") l.fn(e); return e; },
  };
}
function keyEvent(key, target = { tagName: "BODY" }) {
  return { key, target, isComposing: false, defaultPrevented: false, stopped: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } };
}
function fakeBody() {
  const classes = new Set(), attrs = new Map();
  return {
    classes, attrs,
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
    setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k),
  };
}

section("Only the top layer takes Escape (N1)");
{
  const win = fakeWindow();
  const closed = [];
  const releaseExpand = pushEscapeLayer({ current: () => { closed.push("expand"); } }, { yieldToFields: true }, win);
  ok("one capture-phase keydown listener on the window", win.listeners.length === 1 && win.listeners[0].capture === true && win.listeners[0].type === "keydown");
  const releaseDrawer = pushEscapeLayer({ current: () => { closed.push("drawer"); } }, {}, win);
  ok("still one listener with two layers", win.listeners.length === 1 && escapeLayerCount() === 2);
  const releaseMenu = pushEscapeLayer(() => { closed.push("menu"); }, {}, win);   // a plain function works too

  let e = win.press("Escape", { tagName: "BUTTON" });
  ok("Escape on a ⋯ menu inside the drawer closes the menu only", closed.join(",") === "menu", closed.join(","));
  ok("and the event is stopped there", e.stopped && e.defaultPrevented);
  releaseMenu();

  e = win.press("Escape", { tagName: "TEXTAREA" });
  ok("Escape in the drawer's text box closes the drawer, not full width", closed.join(",") === "menu,drawer", closed.join(","));
  releaseDrawer();

  e = win.press("Escape", { tagName: "INPUT", type: "text" });
  ok("with only full width open, Escape in a name box is left to the box", closed.join(",") === "menu,drawer" && !e.stopped && !e.defaultPrevented);
  e = win.press("Escape", { tagName: "BUTTON" });
  ok("Escape elsewhere leaves full width", closed.join(",") === "menu,drawer,expand" && e.stopped);

  e = win.press("Enter", { tagName: "BUTTON" });
  ok("other keys pass through untouched", !e.stopped && closed.length === 3);

  releaseExpand();
  ok("the listener goes when the last layer closes", win.listeners.length === 0 && escapeLayerCount() === 0);
  e = win.press("Escape");
  ok("with no layer open nothing is stopped", !e.stopped && !handleEscapeKey(keyEvent("Escape")));
}
{
  const win = fakeWindow();
  const seen = [];
  const r1 = pushEscapeLayer({ current: () => { seen.push("below"); } }, {}, win);
  const r2 = pushEscapeLayer({ current: () => { seen.push("top declines"); return false; } }, {}, win);
  const e = win.press("Escape");
  ok("a layer can decline (return false): the event isn't stopped and nothing underneath closes", seen.join(",") === "top declines" && !e.stopped);
  r2();
  const handler = { current: () => seen.push("first") };
  r1();
  const r3 = pushEscapeLayer(handler, {}, win);
  handler.current = () => seen.push("latest");
  win.press("Escape");
  ok("the latest callback runs without the layer moving", seen[seen.length - 1] === "latest");
  r3();
  r3();
  ok("releasing twice is harmless", escapeLayerCount() === 0 && win.listeners.length === 0);
  const composing = keyEvent("Escape"); composing.isComposing = true;
  const r4 = pushEscapeLayer({ current: () => seen.push("composing") }, {}, win);
  ok("Escape while typing with an input method is left alone", !handleEscapeKey(composing) && !seen.includes("composing"));
  r4();
}
{
  ok("text boxes count as fields", isEditableTarget({ tagName: "INPUT", type: "text" }) && isEditableTarget({ tagName: "INPUT" }) && isEditableTarget({ tagName: "TEXTAREA" }) && isEditableTarget({ tagName: "SELECT" }) && isEditableTarget({ tagName: "DIV", isContentEditable: true }));
  ok("buttons and ticks don't", !isEditableTarget({ tagName: "INPUT", type: "checkbox" }) && !isEditableTarget({ tagName: "BUTTON" }) && !isEditableTarget(null));
}

section("Body flags are counted per holder (N32, N7, M7)");
{
  const body = fakeBody();
  const doc = { body };
  const a = holdBodyFlag("register-overlay-open", doc);
  const b = holdBodyFlag("register-overlay-open", doc);
  ok("the class is on while an overlay holds it", body.classes.has("register-overlay-open"));
  a();
  ok("one overlay closing leaves it on for the other", body.classes.has("register-overlay-open"));
  a();
  ok("releasing twice doesn't take the other's hold", body.classes.has("register-overlay-open"));
  b();
  ok("it goes when the last one closes", !body.classes.has("register-overlay-open"));

  const list = holdBodyData("data-register-room", "tick", doc);
  ok("the data flag shows the holder's value", body.attrs.get("data-register-room") === "tick");
  const room = holdBodyData("data-register-room", "open", doc);
  ok("the latest holder's value shows", body.attrs.get("data-register-room") === "open");
  room();
  ok("when it lets go the earlier holder's value comes back", body.attrs.get("data-register-room") === "tick");
  list();
  ok("and the attribute goes with the last holder (a hidden copy can't clear the visible copy's flag)", !body.attrs.has("data-register-room"));
  ok("with no document nothing breaks", typeof holdBodyFlag("x", null) === "function" && typeof holdBodyData("data-x", "1", null) === "function");
}

console.log(`\nregister-overlay-layers: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
