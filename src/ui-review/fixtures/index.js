/**
 * UI Review Mode — fixture registry entry point (review-only).
 *
 * Imports each area's fixture module for its registration side-effects, then registers a few
 * cross-cutting/common handlers. Add a new area by creating ./<area>.js that calls route(...)
 * and importing it here. Unmatched endpoints fall back to safe defaults in install.js.
 */
import { route } from "../registry.js";
import { reviewUser } from "../config.js";

// ── Per-area fixtures (each self-registers via route(...)) ──────────────────────
import "./common.js";
import "./dashboard.js";
import "./sales.js";
import "./tender.js";
import "./operations.js";
import "./schedule.js";
import "./procurement.js";
import "./finance.js";
import "./workforce.js";
import "./worker.js";
import "./field.js";
import "./portal.js";

// ── Supabase auth/session shape (a few components read the user via supabase) ────
route("GET", "/rest/v1/user_profiles", () => {
  const u = reviewUser();
  return [{ id: u.id, email: u.email, full_name: u.full_name, role: u.role, is_active: true }];
});
