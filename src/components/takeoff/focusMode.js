// Focus mode for takeoff full-screen windows (scroll lock + hide global floating buttons).
import { useEffect } from "react";

let focusDepth = 0;
/** While mounted: lock page scroll and hide global floating buttons (body.takeoff-focus-open). */
export function useFocusMode() {
  useEffect(() => {
    focusDepth += 1;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("takeoff-focus-open");
    return () => {
      focusDepth -= 1;
      document.body.style.overflow = prev;
      if (focusDepth <= 0) { focusDepth = 0; document.body.classList.remove("takeoff-focus-open"); }
    };
  }, []);
}
