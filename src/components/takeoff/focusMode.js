// Focus mode for takeoff full-screen windows (scroll lock + hide global floating buttons).
//
// ONE reference-counted lock for every takeoff overlay (focused windows, the flashing editor, sheets).
// The page's original overflow is saved when the FIRST lock is taken and restored when the LAST is
// released — whatever order React unmounts them in. (Each overlay saving/restoring "its" previous value
// left the PWA page stuck at overflow:hidden after closing the editor — nothing would scroll.)
import { useEffect } from "react";

let depth = 0;
let saved = { body: "", html: "" };

export function acquireScrollLock() {
  if (typeof document === "undefined") return () => {};
  if (depth === 0) {
    saved = { body: document.body.style.overflow, html: document.documentElement.style.overflow };
    document.body.style.overflow = "hidden";
    document.body.classList.add("takeoff-focus-open");
  }
  depth += 1;
  let released = false;
  return () => {
    if (released) return; // idempotent: a double release never unlocks someone else's overlay
    released = true;
    depth = Math.max(0, depth - 1);
    if (depth === 0) {
      document.body.style.overflow = saved.body;
      document.documentElement.style.overflow = saved.html;
      document.body.classList.remove("takeoff-focus-open");
    }
  };
}

/** While mounted: lock page scroll and hide global floating buttons (body.takeoff-focus-open). */
export function useFocusMode() {
  useEffect(() => acquireScrollLock(), []);
}

/** Test/route-exit safety valve: drop every lock (e.g. leaving the takeoff route mid-overlay). */
export function resetScrollLocks() {
  if (depth === 0 || typeof document === "undefined") return;
  depth = 0;
  document.body.style.overflow = saved.body;
  document.documentElement.style.overflow = saved.html;
  document.body.classList.remove("takeoff-focus-open");
}
