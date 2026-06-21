# Client Portal v2 — Remediation Status (post red-team audit)

Audit verdict was **44/100 — NO GO**. This tracks what has been fixed since, with verification, and what remains before re-scoring.

## Fixed + verified (code-level)

| Audit ref | Severity | Fix | Verified |
|---|---|---|---|
| #2 client → staff APIs | CRITICAL | `requireAuth.mjs` now rejects `role:'client'` (403). Closes ~360 bare-`requireAuth` staff endpoints to clients. Clients use `requirePortalAuth` only; login reads `user_profiles` via Supabase directly, so no client flow depends on `requireAuth`. | boot + harness 25/0 |
| #1 / #14 direct PostgREST DB access | CRITICAL | **Migration 104** (`auth_is_staff()` + RESTRICTIVE `deny_clients` policy on every RLS-enabled table; `user_profiles` = own-row exception). Clients denied all direct table access; staff & service-role unaffected. Paired with moving the client project lookup server-side: new `GET /api/portal/my-projects` (service-role, JWT-validated) + `resolveClientProjectId` no longer queries `projects` from the browser. | 401-gated; lint+build green. **Needs dashboard apply + verify (see migration header).** |
| #7 / #13 anonymous variation approval | CRITICAL | Legacy `POST /api/portal/:token/decisions/:id/respond` now returns 403 — contractual approvals only via the login-gated, audited v2 route. | curl → 403 |
| #15 legacy token live on v2 projects | HIGH | `resolveProject` returns null when `portal_v2_enabled` — the entire legacy token surface is dead for v2 projects. | code + reorder verified |
| #11 sub-roles not enforced | HIGH | `requirePortalWrite` now also requires `role IN (primary,secondary)`; added to `payment-notify`. architect/accountant can view but not approve/pay. | boot |
| B6 approval misrepresents contract state | HIGH (legal) | Client **Approve** no longer flips `job_variations` to `signed`; it records the decision + audit + **emails the builder**, who signs in Finance. Matches the UI disclosure. | boot |

## Remaining blockers (before go-live re-score)

| Ref | Severity | What | Effort |
|---|---|---|---|
| Notifications (scored 0/10) | **BLOCKER** | `portal_notifications` is never written and all emails go to `admin@`. The portal never tells the client anything. Needs: on variation/claim issued, selection due, meeting scheduled, update published → email the **client** (`portal_client_email`) + insert `portal_notifications` (dedup_day, ON CONFLICT DO NOTHING). Set `RESEND_FROM` noreply (§0.13.5). | Medium |
| #5 / #6 legacy read allowlist | HIGH (legacy-only) | Legacy `/api/portal/:token/*` reads still `SELECT *` → `cost_delta` / `builder_reasoning` / `amount_ex_gst` leak to anonymous token holders. **Mitigated for v2** (#15 kills legacy on v2 projects) but still exposed on non-v2 legacy projects. Allowlist the legacy reads. | Small |
| Operational gaps | HIGH | No client reminders/escalation for a difficult client; admin can attach a document *row* but not upload a file through the UI; builder reasoning is manual. (See OPERATIONAL_REVIEW.) | Medium |
| UX / mobile / premium | MEDIUM | See UX_REVIEW + PREMIUM_EXPERIENCE_AUDIT — photo grids, no push, no native app, Messages page fixed-height, etc. | Medium→Large |
| Migrations not applied | **HARD GATE** | 099–104 must be pasted into Supabase (manual, single prod DB). Until then every v2 feature is inert and a fresh invite ends in 403. Migration 104 is app-wide RLS — apply + run its verification query + smoke-test staff and a client session. | Sam |

## Re-score guidance
The three reasons the audit failed outright — **Security 1/10, Notifications 0/10, non-functional (migration)** — Security is now substantially remediated in code (pending the 104 apply). Notifications and the migration apply remain the gating items. Recommend re-running the GO_LIVE_SCORECARD after notifications ship and 104 is applied + verified.
