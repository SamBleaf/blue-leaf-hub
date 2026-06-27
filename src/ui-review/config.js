/**
 * UI Review Mode — configuration + flag detection.
 *
 * ⚠️ NON-PRODUCTION. Everything under src/ui-review/ is review-only and removable.
 * It is dead code unless the app is built/run with VITE_UI_REVIEW_MODE=true, which is
 * NEVER set in production. No real credentials, no Supabase/Buildxact/Dropbox/Gmail calls.
 *
 * To remove entirely: delete src/ui-review/, the guarded block in src/main.jsx, and the
 * `VITE_UI_REVIEW_MODE` branches in src/lib/AuthContext.jsx (all clearly marked).
 */

export const UI_REVIEW = import.meta.env.VITE_UI_REVIEW_MODE === "true";

// Stable fake identities per role (UUID-shaped, obviously fake .local emails).
export const REVIEW_USERS = {
  admin:      { id: "00000000-0000-4000-8000-0000000000a1", email: "director@uireview.local",   full_name: "Dana Director",   role: "admin" },
  supervisor: { id: "00000000-0000-4000-8000-0000000000b2", email: "supervisor@uireview.local", full_name: "Sam Supervisor",  role: "supervisor" },
  employee:   { id: "00000000-0000-4000-8000-0000000000c3", email: "field@uireview.local",       full_name: "Will Worker",     role: "employee" },
  client:     { id: "00000000-0000-4000-8000-0000000000d4", email: "client@uireview.local",      full_name: "Casey Client",    role: "client" },
};

/** Read the desired role from ?reviewRole= (director is an alias for admin). Defaults to admin. */
export function reviewRole() {
  try {
    const p = new URLSearchParams(window.location.search).get("reviewRole");
    if (p === "director") return "admin";
    if (p && REVIEW_USERS[p]) return p;
  } catch { /* ignore */ }
  return "admin";
}

export function reviewUser() {
  return REVIEW_USERS[reviewRole()] || REVIEW_USERS.admin;
}
