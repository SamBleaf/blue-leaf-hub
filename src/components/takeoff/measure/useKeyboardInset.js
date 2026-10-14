// =============================================================================
// useKeyboardInset — how much of the fixed full-screen layout an on-screen keyboard covers (02 "Phone quality":
// the keyboard never covers the active numeric field or its result). iOS/Android shrink the VISUAL viewport, not
// the layout one, so a fixed bottom sheet would sit under the keyboard. MeasureScreen puts this inset below its whole
// focused window (FocusedWindow footer — a column in portrait AND landscape), so the plan and the sheet / side panel
// shrink above the keyboard, and scrolls a focused field into view inside the sheet.
// =============================================================================
import { useEffect, useState } from "react";

export function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const v = typeof window !== "undefined" ? window.visualViewport : null;
    if (!v) return undefined;
    const on = () => {
      const covered = Math.max(0, Math.round(window.innerHeight - (v.height + v.offsetTop)));
      setInset(covered > 80 ? covered : 0); // ignore toolbars collapsing; a keyboard is much taller
    };
    on();
    v.addEventListener("resize", on); v.addEventListener("scroll", on);
    return () => { v.removeEventListener("resize", on); v.removeEventListener("scroll", on); };
  }, []);
  return inset;
}

/** focusin handler: keep the focused number field (and the result line under it) in view above the keyboard. */
export function keepFieldInView(e) {
  const el = e.target;
  if (!(el instanceof HTMLElement) || !el.matches("input,select,textarea")) return;
  setTimeout(() => el.scrollIntoView?.({ block: "center", behavior: "smooth" }), 320);
}
