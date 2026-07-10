# CRM Phase 1 — Action Engine (Batch 1)

**Status:** approved direction, build-gated on review. **Scope:** Phase 1 ONLY.
**Principle:** the system *reminds internally* and *sends one acknowledgement*. Everything else becomes a **recommendation in the digest** for Sam/Josh to send by hand.
**No migration** — reuses the existing `leads.action_type` / `leads.action_due_at` model.

## Guardrails (hard limits)
- No auto-nurture · no auto-chase · no post-no-reply emails · no lost-lead / referral emails.
- No system email that reads as Sam/Josh speaking, except the single enquiry acknowledgement.
- No Phase 2 capture fields · no marketing-spend work.
- **No deploy without review. No live send until templates + recipients are reviewed.**
- Phase 1 must NOT depend on where the public website form lives (that's a Phase 2 gate).

---

## 1A — Daily internal action digest (internal control, first priority)
One morning email to Sam + Josh = the "recommended actions to review and send manually" queue.

- **Source:** `leads` where `stage ∉ {won, lost}` AND `action_due_at ≤ end-of-today`, plus 1C reactivation items.
- **Grouped by urgency:**
  - ⚡ **Urgent** — speed-to-lead breaches (new enquiry whose 1-day `response_due` has lapsed).
  - 🔴 **Overdue** — any other action past due.
  - 🟡 **Due today** — actions due today.
  - ♻️ **Reactivation** — 3/6/12-month idle items (from 1C).
- **Per line:** lead name · source · stage/status · next action · due date · **why it's listed** · **Lead Detail link**.
- **Covers:** speed-to-lead breaches, follow-ups due, proposal chases, plans-received reminders, reactivation.
- **Delivery:** one combined digest to both (owner shown per line); skips send if nothing is due; via existing `sendPlainMail`.
- **Config:** `LEAD_DIGEST_RECIPIENTS` (default Sam + Josh), prod link base, send-hour (cron).

## 1B — New-enquiry auto-acknowledgement (the one client send, second priority)
- **Trigger:** server-side in `POST /api/public/enquiry`, right after the lead row is created — tied to the Hub endpoint, not the form's location.
- **Copy (verbatim):** "Thanks, we've received your enquiry. Sam or Josh will review it and be in touch within 1 business day." Personalised with name, from `admin@blueleafbuilding.com.au`. No pitch, no promise beyond the review.
- **Log** on the lead timeline (`lead_activities`).
- **Fail-soft:** never blocks the enquiry; skips if no valid email.

## 1C — Reactivation sweep
- **Idle rule:** no activity in 3 / 6 / 12 months, stage open or nurture, AND no live action already pending (never clobbers a real chase).
- **Action:** set `action_type = reactivation`, `action_due_at = today` → surfaces in the digest ♻️ section with the tier.
- **No client email.**

---

## Build shape
- **New** `server/lib/leadReminders.mjs` — `runLeadActionDigest({ dryRun })` (digest builder + reactivation sweep).
- **Edit** `server/dev-api.mjs` — `/api/cron/lead-actions` (live, cron-secret guarded), `/api/sales/action-digest/preview` (admin dry-run, never sends), and the digest on its OWN daily timer gated by `LEAD_DIGEST_ENABLED` (decoupled from `REMINDER_CRON_ENABLED` so it stays dormant on deploy).
- **Edit** `server/lib/marketingIntelligenceRoutes.mjs` — the 1B ack hook.
- **New env, all default OFF until approved:** `LEAD_DIGEST_ENABLED` (daily digest auto-send), `ENQUIRY_AUTOACK_ENABLED` (client ack), `LEAD_DIGEST_RECIPIENTS` (who gets the digest; default sam@).

## Review gate (before anything sends)
1. Dry-run the digest against the live DB → show the exact email it *would* send with real leads. Zero sends.
2. Render the ack template for sign-off. No send.
3. Only after Sam approves templates + recipients → flip toggles / enable cron. Claude builds + proves; **Sam owns the go-live switch.**

## Sam owns
Confirm Josh's email (`LEAD_DIGEST_RECIPIENTS`) · review the two templates · flip `LEAD_DIGEST_ENABLED=true` (daily digest) and `ENQUIRY_AUTOACK_ENABLED=true` (client ack). Optional: point an external scheduler at `POST /api/cron/lead-actions` if you prefer that over the in-process timer.
