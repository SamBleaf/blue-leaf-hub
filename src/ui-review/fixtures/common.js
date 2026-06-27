/** UI Review fixtures — cross-cutting/global (review-only). */
import { route } from "../registry.js";

// Integrations status badge (Settings + shell). Everything "configured" so badges look healthy.
route("GET", "/api/integrations/status", () => ({
  ok: true,
  integrations: {
    anthropic: { configured: true }, gmail: { configured: true }, drive: { configured: true },
    dropbox: { configured: true }, buildexact: { configured: true },
    resend: { configured: true }, smtp: { configured: true }, imap: { configured: true },
  },
  mail: { ready: true, transport: "resend" },
  buildexact: { configured: true },
}));

// Generic notification/badge endpoints — empty but OK.
route("GET", "/api/notifications", () => ({ ok: true, notifications: [] }));
route("ANY", "/api/auth/me", () => ({ ok: true, user: { id: "00000000-0000-4000-8000-0000000000a1", role: "admin", email: "director@uireview.local" } }));
