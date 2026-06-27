# Portal Ecosystem — Fix Plan (path 34 → >90)

**Date:** 2026-06-22
**Source audit:** `docs/portal_audit/PORTAL_ECOSYSTEM_COHESION_AUDIT.md` (34/100, GO-LIVE: NO)
**Goal:** Make every connection feeding the Client Portal v2 operational end-to-end, ≥90/100.

This plan is sequenced in three waves matching the audit's "path to >90". Each work package (WP) lists
the blocker(s) it closes, the exact files, whether it needs the new migration, collision risk with the
**system-architect agent** (who owns commits + migrations 106/107 and edits Finance/auth files), and how it's verified.

---

## Coordination & migration reality (read first)

- **Migrations are manual Supabase-dashboard paste only** (one prod DB, no CLI). Every schema change below is bundled
  into **ONE new migration** to minimise paste friction. The architect agent owns 106/107, so this is **migration 108**
  — but BEFORE writing it, confirm 106/107 do NOT already widen `portal_decisions`/`portal_claims` status CHECKs
  (audit says 103's CHECKs are on new tables, not an 027 widening — but 106/107 are unknown).
- **Collision-risk files** (architect may be editing): `financeCCRoutes.mjs`, `authRoutes.mjs`, `module4Routes.mjs`,
  `costIntelligenceRoutes.mjs`. I flag every edit to these so they can reconcile at commit. **Portal-owned files**
  (`portal*.mjs`, `requirePortalAuth.mjs`, `src/pages/clientportal/*`, `PortalV2Admin.jsx`) are safe to edit solo.
- **Verification:** extend `scripts/real_data_dryrun.mjs` with cases per WP; re-run the full adversarial cohesion
  workflow after Wave 1 and Wave 2 for an independent re-score (don't trust self-assessment — that's how 90 became 34).

---

## Migration 108 (write once, paste once) — unblocks WP-C and WP-H

```sql
-- 108_portal_ecosystem_cohesion.sql  (idempotent)
-- Widen portal_decisions status so a voided variation can be withdrawn from the client.
ALTER TABLE portal_decisions DROP CONSTRAINT IF EXISTS portal_decisions_status_check;
ALTER TABLE portal_decisions ADD CONSTRAINT portal_decisions_status_check
  CHECK (status IN ('pending','approved','declined','info_requested','withdrawn'));
-- Widen portal_claims status + carry paid-to-date for partial payments.
ALTER TABLE portal_claims DROP CONSTRAINT IF EXISTS portal_claims_status_check;
ALTER TABLE portal_claims ADD CONSTRAINT portal_claims_status_check
  CHECK (status IN ('upcoming','invoiced','partially_paid','paid','void'));
ALTER TABLE portal_claims ADD COLUMN IF NOT EXISTS paid_to_date numeric(12,2);
```
> All code that writes these new states must degrade gracefully if 108 isn't applied yet (wrap in the existing
> try/catch; the write no-ops rather than 500s — same pattern as the 103-deferred handling).

---

## WAVE 1 — THE GATE (blockers 1–6) → high-70s. Required before any go-live.

### WP-1 · Notifications: stop the leak + make them visible  *(blocker 4)*  — PORTAL-OWNED
- **Security fix:** `portalV2Routes.mjs:1029` notifications SELECT — add `.eq('target_user_id', req.portalSession.userId)`.
  (Today any client user reads every other user's notifications.)
- Add `PATCH /api/portal/app/:projectId/notifications/:id/read` → writes `read_at` (scoped to the user).
- Frontend: `NotificationBell` + dropdown panel in `ClientPortalLayout.jsx` (unread count, mark-as-read).
- **Verify:** dry-run case — two client users on one project; user A can't see user B's notifications; bell unread count correct.

### WP-2 · Enforce `portal_v2_enabled` on every boundary  *(blocker 5)*  — PORTAL-OWNED
- `requirePortalAuth.mjs:61-65` — on v2 routes, 403 if `!project.portal_v2_enabled`.
- `portalV2AdminRoutes.mjs` — same guard at the top of the admin namespace.
- `portalIntegration.mjs:24` `projectForJob` — also select `portal_v2_enabled`; early-return from all 5 sync fns + `notifyClient` when false.
- **Verify:** dry-run — disabled-portal project gets no shadow rows, no email; JWT client 403s on a non-v2 project.

### WP-3 · Migration-presence guard (no more 500s)  *(blocker 6, code half)*  — PORTAL-OWNED
- `requirePortalAuth.mjs` / `/home` — detect missing 103 columns and return **503 "Portal v2 requires migration 103"**
  instead of a raw 500. (The deploy step — applying 103+104 together — is an ops action, documented below.)
- **Ops action (not code):** apply **103 + 104 atomically**; confirm `deny_clients` covers `portal_decisions`/`portal_claims`
  BEFORE any client login (closes the ex-GST `cost_delta` leak window).

### WP-4 · Dual `is_current` crash guard  *(blocker 10 — pulled into Wave 1, it's a live 500)*  — PORTAL-OWNED
- `portalSync.mjs` — reset `is_current=false` for all project milestones before flagging the current phase (mirror `portalV2AdminRoutes.mjs:83-86`).
- `portalV2Routes.mjs:223-228` Home — change `.maybeSingle()` to `.order(...).limit(1)` so two `true` rows can never 500.
- **Verify:** dry-run — seed two `is_current=true` rows; Home returns 200.

### WP-5 · Documents: close the dead path + wire expose-document properly  *(blocker 1c + 4 partial)*  — PORTAL-OWNED
- `portalV2AdminRoutes.mjs:410` expose-document — reject NULL storage: `if (!jd.storage_path || !jd.storage_provider) return err(res,409,'Document has no storage location attached')`.
- expose-document — write a `client_actions` row (if `signature_required`), `writePortalAudit`, and `notifyClient('document_ready')` (matches sibling admin routes).
- **Verify:** dry-run — exposing a NULL-path doc 409s; exposing a real-path doc creates an action + audit + notification.

### WP-6 · Migration 108 authored + WP-C/H schema unblocked  — NEW MIGRATION (coordinate number)
- Write `supabase/migrations/108_portal_ecosystem_cohesion.sql` (above). Flag to architect for the manual-apply batch.

> **End of Wave 1:** the security leak, the crash, the flag-gating spec gap, and the document dead-end are closed;
> the schema for void/partial states exists. Re-run the cohesion workflow → expected high-70s. **CHECKPOINT — report to Sam.**

---

## WAVE 2 — END-TO-END CLOSE (blockers 2, 3, 7, 8, 9) → ~90

### WP-7 · Void fires a portal hook  *(blocker 2)*  — needs 108 · CROSS-MODULE (financeCCRoutes)
- `portalIntegration.mjs` — add `syncVariationVoided` (set `portal_decisions.status='withdrawn'`, close `client_actions`→`cancelled`)
  and `syncClaimVoided` (set `portal_claims.status='void'`, close action). Both `.catch(()=>{})`.
- `financeCCRoutes.mjs:2002-2011` (variation void) + `:1356-1368` (claim void) — call the hooks. **[architect collision — flag]**
- **Verify:** dry-run — void a sent variation → client action gone, Approve button gone; void an issued claim → "I've paid" button gone.

### WP-8 · Invite → login actually works  *(blocker 3)*  — CROSS-MODULE (authRoutes)
- `authRoutes.mjs` accept-invite — when `role='client'` and link succeeds, set `projects.portal_enabled=true` (+ `portal_v2_enabled=true`). **[collision — flag]**
- `authRoutes.mjs:91` invite — `if (role==='client' && !projectId) return 400`.
- accept-invite — destructure + handle the `project_client_users` upsert `error` (today it's silently dropped).
- **Verify:** dry-run — full invite→accept→`my-projects` resolves the project (no "No project linked").

### WP-9 · Portal client identity auto-synced on win  *(blocker 8)*  — CROSS-MODULE (module4Routes)
- `module4Routes.mjs` win-finalize `projectPatch` — set `portal_client_name: leads.name` (canonical, preserves "A & B"), `portal_client_email: job.client_email`. **[collision — flag]**
- **Verify:** dry-run — simulate win → project has client name/email → notifyClient email leg fires.

### WP-10 · Reverse path: portal approval → tracked Finance action  *(blocker 7)*  — CROSS-MODULE
- `portalV2Routes.mjs:499-513` — on approval, in addition to the admin email, write a builder-side tracked item
  (a `client_actions`-style "Sign variation #X in Finance" row or a finance queue flag) so the sign step can't be silently dropped.
- **Verify:** dry-run — client approves → builder queue item exists; signing it advances `job_variations` + contract value.

### WP-11 · Site diary → portal updates + photos  *(blocker 9)*  — CROSS-MODULE (siteDiaryRoutes)
- `siteDiaryRoutes.mjs` post-insert — `syncDiarySent`: upsert a draft `portal_updates` (keyed `entry_date`+project), transform
  `photo_paths`→`project_photos` with `milestone_key` auto-set from the active schedule phase, `notifyClient` on first create.
- Normalise `milestone_key` casing on read so `'Frame'` vs `'frame'` can't silently drop photos.
- **Verify:** dry-run — create a diary entry with a photo → it appears in the Journey under the right stage.

> **End of Wave 2:** every critical lane is end-to-end; no stranded actions; onboarding works cold. Re-run cohesion workflow → expected ~90. **CHECKPOINT — report to Sam.**

---

## WAVE 3 — POLISH OVER THE LINE (blockers 11, 12, + admin UI) → >90

### WP-12 · Documents writers — the real contract capture  *(blocker 1a/1b)*  — CROSS-MODULE
- `costIntelligenceRoutes.mjs:193` — persist the plan PDF to Dropbox/Supabase, write `storage_path`+`storage_provider`. **[collision — flag]**
- Add `job_documents` registration writers: contract on win-finalize, variation/claim PDFs on issue/sign (the Finance PDFs already generate — just register + store them).
- `POST .../documents/:id/sign` — write `signed_at` + audit + close the action (closes the signature dead-end).

### WP-13 · Confidence note + Journey rendering  *(blocker 6 schedule half)*  — PORTAL-OWNED
- `portalSync.mjs:92-102` — populate `confidence_note` on auto-synced rows.
- `portalV2Routes.mjs:911` Journey SELECT + `ClientJourney.jsx` — add + render `confidence_note`.

### WP-14 · Claim partial/dispute states + admin selection action close  *(blocker 11)*  — needs 108
- `syncClaimPaid` — write `partially_paid` + `paid_to_date` (108) instead of mapping to `invoiced`.
- Add a dispute endpoint + `syncClaimDisputed`.
- `portalV2AdminRoutes.mjs:185-204` admin selection approve — close the matching `client_action`.

### WP-15 · Admin v2 UI gaps + server-side deactivation  *(blocker 12 + lane 9)*  — PORTAL-OWNED
- Admin UI: milestone/meeting edit, weekly-update lifecycle (list/edit/delete), selection status controls, read-only variation/claim/photo panels.
- `project_client_users.is_active=false` admin route; `requirePortalAuth` already honours the column.
- Default `REMINDER_CRON_ENABLED=true` in prod (or document it) so schedule→portal sync isn't dark.

> **End of Wave 3:** re-run cohesion workflow → target >90, GO-LIVE: YES for a hand-picked first client.

---

## Execution order summary

| Wave | WPs | Migration? | Cross-module? | Expected score |
|---|---|---|---|---|
| 1 — Gate | WP-1…6 | 108 authored | mostly portal-owned | 34 → high-70s |
| 2 — Close | WP-7…11 | uses 108 | yes (finance/auth/ops) | → ~90 |
| 3 — Polish | WP-12…15 | uses 108 | partly | → >90 |

**Checkpoints:** stop + report after Wave 1 and Wave 2. Migration 108 is the only manual-apply step.
**Independent re-score** (cohesion workflow) after Waves 1 and 2 — never self-certify the number.
