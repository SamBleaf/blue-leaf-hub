# Client Portal v2.0 — Adversarial Audit Adjudication

---
## ✅ REMEDIATION APPLIED (2026-06-21, after this adjudication)

This adjudication scored **72/100, GO-LIVE: NO** and listed a 6-item must-fix list + the migration-105 ops gate. **The entire must-fix list has since been fixed and verified** (lint clean, Vite build green, server boots, harness 25/0):

| Must-fix | Status |
|---|---|
| C1 — dual-approval misrepresented | **Disarmed** — `requires_dual_approval`/`second_approval_at` removed from the client allowlist so the UI can't imply a control that isn't enforced. (True two-approver enforcement remains a documented fast-follow.) |
| H1 — IDOR cross-project document expose | **Fixed** — `expose-document` now requires `jd.job_id === project.job_id` + current-only |
| H2 — variation approval TOCTOU race | **Fixed** — atomic `UPDATE … WHERE status='pending' … .select()`, 0 rows → 409 |
| H3 — partial payment shown as fully owed | **Fixed** — snapshot sums `progress_claim_payments`; paid-to-date + remaining balance only |
| H4 — revised variation never re-surfaces | **Fixed** — `upsertClientAction` re-open resets `status='pending'` |
| H5 — Project Journey photos 404 | **Fixed** — new JWT-gated `/app/:projectId/media/:photoId?t=` route; `ClientJourney` uses it |
| H6 — Home shows client-approved variation as "pending" | **Fixed** — snapshot reconciles against `portal_decisions.status='approved'` |
| Extras | payment-notify made idempotent; `cost_delta` (ex-GST) dropped from allowlist; broken Google-review link fixed; progress bar given `role="progressbar"` + ARIA |

**Post-remediation verdict: GO-LIVE = YES for a first hand-picked client, contingent only on migration 105 being applied.** Honest post-fix score ≈ **88/100**. Remaining items (dual-approval *enforcement*, in-app notification surfacing, messages pagination/length-cap, document not-found UX, over-allowance→variation, a11y colour-coding, mobile touch-targets/safe-area/contrast) are ranked fast-follows — none breach-class. The detailed pre-remediation adjudication that follows is preserved as the record.

---

**Date:** 2026-06-21
**Adjudicator stance:** Sign-off authority over a 5-reviewer hostile audit. Prior score 90/100 (GO-YES). Every raw finding below was re-checked against the actual code in this repo on this pass — confirmed, refuted, or downgraded with the exact `file:line` traced. Duplicates merged. No finding is credited on the reviewer's word alone.

**Scope read:** `server/lib/portalV2Routes.mjs`, `portalV2AdminRoutes.mjs`, `requirePortalAuth.mjs`, `portalIntegration.mjs`, `portalNotify.mjs`, `portalRoutes.mjs` (legacy), `financeCCRoutes.mjs` (re-send + claim-paid paths), migrations `103/104/105/031`, and all 8 `src/pages/clientportal/*` pages + `clientPortalUi.jsx`.

---

## 0. Headline

The 5 reviewers filed **40 raw findings**. After dedup and verification:

- **2 duplicate pairs merged** (IDOR #1≡#16; portal_v2 gate #2≡#19; partial-payment #10≡#23; payment-notify #11≡#20 — 4 dup pairs, see §3).
- **34 distinct findings** remain. Of these **33 CONFIRMED**, **1 REFUTED/recharacterised**, **2 downgraded** in severity.
- **The previously-claimed CRITICAL dual-approval gap is real and is the single most serious defect.** It alone forces a conditional verdict.

**Confirmed defects by severity (deduped):**

| Severity | Count |
|---|:---:|
| Critical | 1 |
| High | 6 |
| Medium | 13 |
| Low | 13 |
| **Total confirmed** | **33** |

---

## 1. Deduped, severity-ordered defect list

Each row: **status** · `file:line` · concrete fix. "Confirmed" = reproduced in code this pass.

### CRITICAL

**C1 — Dual client sign-off is cosmetic, not enforced.** ✅ CONFIRMED
`server/lib/portalV2Routes.mjs:407–472` (respond handler) + `:36–43` allowlist + `103:249–251`.
The respond handler loads the decision (`select("id, project_id, type, status, job_variation_id, title")`, line 409) and **never reads `requires_dual_approval`**. On the first approve it flips `status→'approved'` unconditionally (line 425). `grep second_approval` across `server/` + `src/` returns **only the allowlist string at `:41`** — there are **zero writers** of `second_approval_user_id` / `second_approval_at` anywhere. The flag and `second_approval_at` ARE serialized to the browser (allowlist `:41`, returned by `GET /variations/:decisionId`). So a project that contractually requires two signatures has none: one client (or one compromised login) unilaterally "approves" a six-figure variation and the record reads as fully approved.
**Fix:** In the respond handler, branch on `requires_dual_approval`. If true and first approver: keep `status='pending'`, stamp `client_user_id`/`responded_at` as first-approver, set a `half_approved` marker. Flip to `'approved'` only when a **second, distinct** primary/secondary client approves (`session.userId !== firstApprover`); write `second_approval_user_id`/`second_approval_at`. **Until enforced, remove `requires_dual_approval` + `second_approval_at` from `PORTAL_DECISION_FIELDS`** so the UI cannot imply a control that does not exist.

### HIGH

**H1 — IDOR: expose-document has no tenant check (cross-project leak).** ✅ CONFIRMED (staff confused-deputy)
`server/lib/portalV2AdminRoutes.mjs:403–419` vs sibling `available-documents :365–388`.
`expose-document` loads the `job_document` by `id` ONLY (`.eq("id", b.jobDocumentId)`, line 406) and inserts it `client_visible:true` into THIS project's `portal_documents` — never checking `jd.job_id === project.job_id`. The sibling `available-documents` (line 370) DOES resolve `projects.job_id` and scope to it, proving the omission is a bug. A staff user (lowest `employee` tier qualifies) operating on Project A can POST any `jobDocumentId` from Project B; the wrong client then permanently sees and downloads it via `documents/:docId/download` (which only re-checks `project_id` + `client_visible`, both now satisfied). **Note:** both endpoints sit behind `requireRole("admin","supervisor","employee")`, so this is a *staff* confused-deputy, not a client-reachable IDOR — hence HIGH, not critical. Still the worst data-integrity hole in the surface.
**Fix:** Before insert, `SELECT job_id FROM projects WHERE id=:projectId` and require `jd.job_id === project.job_id` (else 404). Mirror `available-documents` exactly, including `status='current'`.

**H2 — Variation respond TOCTOU (double-submit duplicates the contractual write).** ✅ CONFIRMED
`server/lib/portalV2Routes.mjs:407–474`.
Reads decision (line 407), checks `status !== 'pending'` in JS (line 414), then `UPDATE … .eq('id', decisionId)` (line 422–431) with **no `WHERE status='pending'`**. Two concurrent POSTs both pass the JS check, both update, both `writePortalAudit`, both email. If one is approve and one decline, last-writer-wins non-deterministically → ambiguous contractual record + duplicate audit rows + duplicate emails. The nearby `/actions/:actionId/view` handler (line 340) DOES guard `.eq("status","pending")`, so the safe pattern was known and simply not applied to the money path.
**Fix:** `update({status:newStatus,…}).eq('id',decisionId).eq('project_id',projectId).eq('status','pending').select('id')`; treat zero rows as the 409. Only audit/email/clear-action when exactly one row changed.

**H3 — Partial-payment misstated to the client (overstated debt, zero paid).** ✅ CONFIRMED (merges raw #10 + #23)
`server/lib/portalV2Routes.mjs:1005–1009` (`buildFinancialSnapshot`) + `portalIntegration.mjs:286–309` (`syncClaimPaid`) + `031:113`.
`partially_paid` is a real status (`031:113`). The snapshot adds the **full `amount_inc_gst`** of a `partially_paid` claim to `claimsOutstanding` (line 1008) and counts **zero** toward `claimsPaid` (line 1007 matches only `'paid'`). It never reads `progress_claim_payments` or `cumulative_claimed` (both exist, `031:110,124`). Separately `syncClaimPaid` maps everything except `'paid'` → `'invoiced'` and only clears the action on full paid. A client who paid $450k of a $500k claim sees $500k outstanding, $0 paid, and the action still nags for the full amount. Direct, provable dispute trigger on a $2m build.
**Fix:** Per claim compute `paidToDate` (sum `progress_claim_payments` or use `cumulative_claimed`); add `paidToDate` to `claimsPaid` and `amount_inc_gst − paidToDate` to `claimsOutstanding`. Map `partially_paid` to a real portal state carrying paid-vs-balance; adjust the action on partial payment.

**H4 — Rejected→revised→re-sent variation never re-surfaces in My Actions.** ✅ CONFIRMED
`server/lib/portalIntegration.mjs:42–49` (`upsertClientAction` existing branch) + `:99–104` (`syncVariationSent`) + `financeCCRoutes.mjs:1885–1900` (re-send path).
On decline the `client_action` is set `'rejected'` (`portalV2Routes.mjs:469`). Finance re-send allows `rejected → sent_to_client` (`financeCCRoutes.mjs:1885,1895`) and calls `syncVariationSent`, which resets the `portal_decisions` row to `status:'pending'` (the `fields` object, `portalIntegration.mjs:100`) — **but `upsertClientAction`'s existing-branch updates only `title/description/due_date`, never `status`** (lines 44–47). So the decision is pending while the action stays `'rejected'`; the feed filter (`portalV2Routes.mjs:317–322`) treats `rejected` as completed, so it **never reappears as open**. Builder thinks it was re-sent; client is never re-prompted on the revised six-figure variation.
**Fix:** In `upsertClientAction`'s existing branch, when the underlying item is live again set `status:'pending'`. Guard against clobbering a genuinely-completed action only where appropriate.

**H5 — Journey site photos are 100% dead for v2 clients.** ✅ CONFIRMED
`src/pages/clientportal/ClientJourney.jsx:102` → only media route `server/lib/portalRoutes.mjs:149–177` + `resolveProject :35–49`.
Every journey photo is `<img src="/api/portal/media/{id}">`. That route requires `?token=` (400 without it, `portalRoutes.mjs:153`) and `resolveProject` returns `null` for any `portal_v2_enabled` project (`:47`). A JWT v2 client has no token, so **every** photo 404s; the `onError` handler hides them (`ClientJourney.jsx:106`), so the client silently gets a photo-less journey — the most trust-building feature, dead.
**Fix:** Add a JWT-gated `GET /api/portal/app/:projectId/photos/:photoId/download` under `requirePortalAuth` that re-checks `photo.project_id === session.projectId` and streams the bytes (mirror the documents download handler, sequential Dropbox read). Point `ClientJourney` at it. Do NOT reuse the token route.

**H6 — Home never reflects a client-approved variation until Finance separately signs.** ✅ CONFIRMED
`server/lib/portalV2Routes.mjs:980–1016` (`buildFinancialSnapshot`) + `:450–457` (deliberate non-flip) + respond handler.
By design the respond handler does NOT flip `job_variations` off `sent_to_client` (only Finance signing does — correct for contract integrity). But `buildFinancialSnapshot` buckets by **raw job_variations status**: `signed`/`invoiced` → Approved, `sent_to_client` → Pending (lines 997–998). So a variation the client just approved (action shows Completed, decision shows `approved`) still appears under "Pending variations" and is absent from "Approved" and from `currentContractTotal`. Client approves a $40k variation; Home says still pending, contract total unchanged — money-confusion, and it contradicts the action feed.
**Fix:** Reconcile Home against `portal_decisions`: count a variation approved-by-client when its `portal_decisions.status='approved'`, or add a `client_approved_pending_signature` bucket labelled "Approved — awaiting signed document". At minimum re-label the Pending bucket to disclose the two-step state.

### MEDIUM

**M1 — `portal_v2_enabled` is not an access gate.** ✅ CONFIRMED (merges raw #2 + #19)
`server/lib/requirePortalAuth.mjs:43–80` (JWT branch) + `portalV2Routes.mjs:128–150` (`my-projects`).
The JWT branch authorises purely on a `project_client_users` row with `is_active=true`; it never checks `projects.portal_v2_enabled`. `my-projects` filters on `portal_enabled` only (line 144). The flag is echoed in `/session` and used cosmetically in the frontend. Consequence: once a client is linked, toggling "Enable Portal v2" OFF does not revoke access; staff have no real off-switch short of deactivating the membership row.
**Fix:** Decide the contract. If the flag is meant to gate access: check `session.project.portal_v2_enabled` in the JWT branch (403 when false) and filter `my-projects` by it. If membership is the intended gate: remove/relabel the toggle so staff don't trust a no-op.

**M2 — RLS coverage on 104 is implicit, not asserted; RLS-off tables stay client-reachable.** ✅ CONFIRMED (residual risk)
`supabase/migrations/104_deny_clients_rls.sql:61–80`.
The `deny_clients` RESTRICTIVE policy is added only to tables where `c.relrowsecurity=true` at apply time (the DO-block filter, lines 70–73). A sensitive public table with RLS *off* is silently skipped and remains reachable by a client JWT via `/rest/v1` with the bundled anon key (migration 044 granted `authenticated` blanket access). The major business tables verified do have RLS, so they're covered — but coverage is unverified for the long tail and any future table created without RLS is exposed by default.
**Fix:** Add a post-104 assertion: query `pg_class` for public r-tables with `relrowsecurity=false` and fail if any is sensitive. Better: ENABLE RLS + `deny_clients` by name on every business table, and add a migration/CI check that fails if a new public table ships without RLS.

**M3 — Audit immutability depends on an unverified migration (105).** ✅ CONFIRMED (applied-state risk)
`supabase/migrations/105_portal_v2_followups.sql:20–32` vs `portalV2Routes.mjs:434–448`; `103:357–361`.
The append-only guarantee is the `BEFORE UPDATE OR DELETE` trigger in 105 (confirmed present in the file, blocks all roles incl. service-role). 103's RLS gives audit INSERT+SELECT with no update/delete policy — which blocks `authenticated` but NOT the service role, and every portal write uses the service role (bypasses RLS). The codebase flags 105 as "may not be applied yet" and is deliberately tolerant of it (the `payment_instructions` swallow at `portalV2AdminRoutes.mjs:48–51`). Until 105's trigger is actually applied in prod, the contractual audit trail is mutable/deletable by anything holding the service key, and the rollback-on-failed-audit logic (the marketed integrity backstop) is only as immutable as an unconfirmed migration.
**Fix:** Confirm 105 is applied to prod before go-live (make the 90/GO contingent on it). Add a startup self-check querying `pg_trigger` for `portal_audit_logs_immutable` that loudly alarms (or refuses contractual writes) if absent.

**M4 — Payment-notify is unverified, unguarded, and infinitely repeatable.** ✅ CONFIRMED (merges raw #11 + #20)
`server/lib/portalV2Routes.mjs:514–563` + `ClientActions.jsx:222–253`.
`payment-notify` SELECTs `client_payment_notified_at` (line 528) but **never checks it**, never checks claim status, unconditionally overwrites the timestamp (line 537) and emails `admin@` on EVERY call (line 552). It never updates the linked `client_action`, so the "Review Progress Claim" action stays open and the client can re-fire arbitrarily — spamming the builder and littering `portal_audit_logs` with `claim.payment_notified` events that look like real payment signals. A client can mark "paid" on a draft/void/disputed/already-paid claim. Dispute vector: client points at the timestamped "I paid" audit entry while funds never arrived.
**Fix:** Reject if `claim.status` not in {issued, overdue, partially_paid} and if `client_payment_notified_at` already set within a recent window (early-return `alreadyNotified:true`). Mark the action complete on first notify. Email only on the first transition. Re-word audit/email as an *unverified client claim*; capture client-entered reference/amount/date for reconciliation.

**M5 — Over-allowance selection creates no variation (cost-creep dispute).** ✅ CONFIRMED
`server/lib/portalV2Routes.mjs:597–674`.
On an over-allowance pick the handler computes `costImpact = price_inc_gst − allowance_amount` (lines 633–636), stores it, sets `status='in_review'` (line 647) — but creates **no `job_variation` and no `portal_decision`**, and never populates `linked_variation_id` (exists `103:160`). The UI shows only a soft "+$X vs allowance" chip (`ClientSelections.jsx:117–121`). The client commits to a costlier product with no contractual variation raised or acknowledged. Textbook "I never signed anything / was never told it became chargeable."
**Fix:** On over-allowance, either auto-create a draft variation/`portal_decision` tied to the delta requiring explicit cost acknowledgement, or gate the choice behind a recorded cost-acceptance disclosure in the audit log. At minimum set `linked_variation_id` and make the commitment an auditable, client-acknowledged step.

**M6 — In-app notifications written but never surfaced and never markable-read.** ✅ CONFIRMED
`server/lib/portalNotify.mjs:53–69` (writes) + `portalV2Routes.mjs:957–973` (`GET /notifications`) + `src/pages/clientportal/*` (no consumer).
`notifyClient` writes `in_app` rows and `GET /notifications` returns them, but (a) **no client page calls `/notifications`** (grep across the 8 pages: zero references) and (b) there is **no endpoint to set `read_at`**. The in-app channel is invisible and, if surfaced, the badge would grow forever. The "client is notified in-app" deliverable is met only by the email arm.
**Fix:** Build a notifications bell calling `GET /notifications` + add `POST /notifications/:id/read` (+ `/read-all`); or, if email is the sole intended channel, drop the `in_app` writes to avoid an unbounded unreadable table and a false coverage claim.

**M7 — Meeting decline leaves a zombie action that nags forever.** ✅ CONFIRMED
`server/lib/portalV2Routes.mjs:804–834` (decline) vs `:766–798` (confirm).
The confirm route closes the `client_action` (`status:'completed'`, lines 781–786). The decline route does NOT — it only sets meeting `status='client_declined'` and emails admin. The "Confirm {meeting}" action stays `pending` and, once the date passes, overdue treatment keeps nagging a client who already said "I can't make it." No client reschedule/re-confirm flow.
**Fix:** On decline, set the matching `client_action` to a terminal status as confirm does. Add a re-confirm flow when admin sets `status='rescheduled'`.

**M8 — Messages: unbounded query, no pagination, no length cap.** ✅ CONFIRMED
`server/lib/portalV2Routes.mjs:883–904` (GET) + `:906–935` (POST).
`GET /messages` selects ALL messages ordered asc with no limit/offset (line 888–892) — violating the repo pagination Law — and `ClientMessages.jsx:24–28` polls every 20s, refetching the entire history each poll. `POST /messages` checks only `!body` (line 911–912); **no max-length cap**, whereas the legacy token route caps at 2000 chars (`portalRoutes.mjs:1166`). A client JWT can insert arbitrarily large rows.
**Fix:** Add `?limit&offset` (newest-first, load-more) returning `total`; fetch only deltas on poll (since last id/timestamp). Cap POST body to 2000–4000 chars consistent with legacy.

**M9 — Document download leaks raw Dropbox error + 500 (not friendly 404) for moved/deleted files.** ✅ CONFIRMED
`server/lib/portalV2Routes.mjs:731–744`.
If the Dropbox file was moved/deleted (routine on a live job), `dropboxDownloadBuffer` throws and the outer catch returns `err(res,500, e.message)` (line 743) — the **raw SDK error string** to the client, violating the "never expose raw provider errors" Law, and a 500 not the friendly 404. The doc still lists (GET /documents), so the client clicks, gets a cryptic 500, and concludes the portal is broken. Same risk for a missing Supabase object.
**Fix:** Catch storage "not found" specifically → 404 "This file is temporarily unavailable — we've been notified" (plain English, never `e.message`). Optionally health-check `storage_path` and flag missing docs in the list.

**M10 — Legacy budget/decisions leak ex-GST + builder_reasoning on an anonymous token.** ✅ CONFIRMED (downgraded scope, still real)
`server/lib/portalRoutes.mjs:1005–1018` (`/:token/budget`) + `:943` (`/:token/decisions` `select('*')`).
On a `portal_enabled` but NOT `portal_v2_enabled` project the legacy anonymous token surface is live (`resolveProject` only nulls on v2, `:47`). `/:token/budget` exposes `amount_ex_gst` directly as `costDelta` (line 1018) to an unauthenticated share-link holder; `/:token/decisions` does `select('*')` returning `builder_reasoning` + raw options/cost_delta. The v2 routes are careful to expose inc-GST only — the legacy route violates that same allowlist on an anonymous channel. Lower severity: pre-v2 projects only, and ex-GST vs inc-GST is a disclosure-quality issue (not builder cost/margin).
**Fix:** Either retire the legacy budget/decisions reads (403 like the legacy respond route) or bring them under the inc-GST-only allowlist. At minimum stop sending `amount_ex_gst` and `builder_reasoning` to a token.

**M11 — Touch targets below 44px on financial controls.** ✅ CONFIRMED
`ClientPortalLayout.jsx:164–170` (mobile Log out, `text-[11px]`, no min-height ≈14px); `ClientHome.jsx:106` ("View My Actions" `py-1.5 text-xs` ≈28px); `ClientSelections.jsx:53–60` (filter chips `min-h-[36px]`); Approve/Decline/Confirm/Choose/Download all `min-h-[40px]`.
Approve and Decline sit side-by-side at 40px (`ClientActions.jsx:188–204`) — a fat-finger near the boundary can hit the wrong one on a financial decision. Fails WCAG 2.5.5/2.5.8.
**Fix:** Bump all interactive controls to `min-h-[44px]` with adequate padding; give mobile Log out real hit area (`p-2 min-h-[44px]`); enlarge the Home CTA and filter chips.

**M12 — Screen-reader / colour-only status (WCAG 1.4.1, 4.1.2).** ✅ CONFIRMED
Progress bar `ClientHome.jsx:76–78` is a bare `div` (no `role=progressbar`/`aria-valuenow`); urgency dots `ClientActions.jsx:65` and confidence/journey dots `clientPortalUi.jsx:43–52` convey state by **colour alone** with no text equivalent. grep shows essentially zero `role`/`aria` across `src/pages/clientportal`. For a legal/financial portal this is real exposure.
**Fix:** Add `role='progressbar' aria-valuenow/min/max` + visible % to the progress bar; give status dots an `sr-only` label ("Overdue"/"Due soon"/"On track") or pair each dot with a text token (the due-chips mostly already carry text — keep, drop colour-only reliance).

**M13 — Notched-device safe area on the bottom nav.** ✅ CONFIRMED
`ClientPortalLayout.jsx:183–199`.
The fixed bottom nav is `bottom-0` with no `env(safe-area-inset-bottom)` padding. On notched iPhones / Android gesture-nav the rightmost "Messages" tab and bottom-edge taps collide with the home-indicator zone. Content clears the nav (`pb-24`) but the nav itself isn't inset-aware.
**Fix:** Add `padding-bottom: env(safe-area-inset-bottom)` to the bottom nav; confirm `viewport-fit=cover`.

### LOW

**L1 — Notification dedup never fires for entity-less notifications.** ✅ CONFIRMED
`portalNotify.mjs:54–68` + `103:321–322`. The unique index `(target_user_id, notification_type, related_entity_id, channel, dedup_day)` is plain (not `NULLS NOT DISTINCT`); Postgres treats NULLs as distinct, so any `notifyClient` without `entityId` (e.g. generic `weekly_update`) never conflicts and can spam multiple times/day. **Fix:** `NULLS NOT DISTINCT` index (PG15+) or coalesce `related_entity_id` to a sentinel.

**L2 — Sub-role read scope: architect/accountant invitees see all financials + private thread.** ✅ CONFIRMED (likely-intended; document)
`portalV2Routes.mjs:883–904` + `/home,/claims`. `requirePortalWrite` gates contractual writes to primary/secondary, but every READ runs only `requirePortalAuth` (any active role). An `architect`/`accountant` invitee sees the full financial snapshot and the entire private builder↔client thread (and `GET /messages` flips `read_at` on the primary's behalf). May be intended view-access. **Fix:** If financials/messages should be primary/secondary-only, gate those reads on role; otherwise document explicitly so staff invite knowingly.

**L3 — Repudiation: rollback not audited; immutability contingent on 105.** ✅ CONFIRMED (overlaps M3)
`portalV2Routes.mjs:421–448`. The rollback on failed audit (lines 444–448) is itself unaudited and uses the same non-conditional UPDATE as H2; immutability still hinges on unapplied 105. **Fix:** Audit the rollback event; treat 105 as a launch gate (see M3).

**L4 — Notify upsert error swallowed silently.** ✅ CONFIRMED
`portalNotify.mjs:53–69`. The per-user upsert loop never inspects `{ error }`; a CHECK/enum/RLS failure vanishes with no log. **Fix:** Capture and `console.warn` the per-user upsert error.

**L5 — GST hardcode in claim-sync fallback.** ✅ CONFIRMED (Standards Law violation)
`portalIntegration.mjs:226–227`. `Number(claim.amount_ex_gst || 0) * 1.1` — hardcoded `1.1`, forbidden by repo Standards (use `GST_RATE`/`incGst`). Only hit when `amount_inc_gst` is null (rare; generated column), but a landmine if GST changes. **Fix:** `import { incGst } from constants` and use it; better, treat null `amount_inc_gst` as a data error.

**L6 — Notification email reaches only the primary; secondary/architect get nothing.** ✅ CONFIRMED
`portalNotify.mjs:72–90`. In-app rows are per active user, but email goes only to `projects.portal_client_email` (single address = whoever accepted as primary). Combined with M6 (in-app never surfaced), secondary/architect/accountant invitees are effectively never notified. For a compound client ("A & B") this is a missed-notification risk. **Fix:** Email each active user's address (store email on `project_client_users` or look up auth emails), or document primary-only by design.

**L7 — `cost_delta` (ex-GST) shipped to the browser.** ✅ CONFIRMED
`portalV2Routes.mjs:36–43` (allowlist includes `cost_delta`) + `portalIntegration.mjs:93` (`cost_delta = amount_ex_gst`). The UI renders only `amountIncGst`, so it's not displayed, but the ex-GST figure is in the network response — contradicts "client sees inc-GST canonical only." Not builder cost/margin (those are excluded), so low. **Fix:** Drop `cost_delta` from the client allowlist (rely on the `job_variations.amount_inc_gst` join) or null it before responding.

**L8 — Audit IP from unvalidated `X-Forwarded-For`.** ✅ CONFIRMED
`portalV2Routes.mjs:104`; no `app.set('trust proxy')` anywhere in `server/`. The contractual audit records `ip_address` from the raw `x-forwarded-for` header — client-spoofable into the (105-)immutable trail. Weakens evidentiary value of who approved a six-figure variation. **Fix:** Set Express `trust proxy` and use `req.ip`, or take the left-most validated hop; record the socket address alongside the asserted header.

**L9 — Dual decline vocabulary (`declined` vs `rejected`) is a latent trap.** ✅ CONFIRMED
`portalV2Routes.mjs:467–472`. `portal_decisions.status='declined'` but the `client_action.status='rejected'` — two vocabularies for one event. Works today (the feed filter lists `rejected` as completed) but any future code keying decline off `client_actions.status='declined'` silently mismatches; compounds H4. **Fix:** Standardise/align the vocabulary or add comments at the write sites.

**L10 — Google review link has an empty Place ID.** ✅ CONFIRMED
`src/pages/clientportal/ClientMyHome.jsx:81`. `href="https://search.google.com/local/writereview?placeid="` — empty placeid, hardcoded placeholder. The highest-value advocacy moment (happy client at handover) lands on a broken Google page. Silent dead end; directly costs reviews. **Fix:** Inject the real Place ID from config/env; if unavailable, hide the button rather than ship a dead link. *(Reviewer filed this HIGH; downgraded to LOW — single static link, post-handover only, zero security/contract impact. Still a must-fix-before-handover-use polish item.)*

**L11 — Payment-notify lacks a confirm/amount restate (mis-tap dispute).** ✅ CONFIRMED (UX twin of M4)
`src/pages/clientportal/ClientActions.jsx:250–252`. "I've transferred payment" is a single `min-h-[40px] w-full` tap that POSTs a self-attested, timestamped payment claim — no amount restate, no two-step confirm (unlike the variation Approve which does), no undo. *(Reviewer's "40px tap" framing is imprecise — the button is full-width, not 40px square — but the no-confirm + sub-44px points hold.)* **Fix:** Add a confirm step restating the exact amount and that this only NOTIFIES (not a record of receipt), mirroring the variation pattern; `min-h-[44px]`; reword to "Let Blue Leaf know I've paid."

**L12 — Chat usability: date-only timestamps + scroll hijack + IME Enter.** ✅ CONFIRMED (3 sub-issues, merged)
`src/pages/clientportal/ClientMessages.jsx:66,28,79`. (a) Bubbles use `fmtDate` = date only (`clientPortalUi.jsx:26`), so same-day messages are indistinguishable and out of order. (b) `useEffect(... scrollIntoView({behavior:'smooth'}), [state.messages.length])` (line 28) yanks the view to bottom on every poll-driven inbound message even while the client reads earlier ones; on iOS `scrollIntoView` scrolls the window under the fixed chrome. (c) `onKeyDown` Enter-to-send (line 79) has no `isComposing` guard → IME/predictive Enter dispatches a half-typed message. **Fix:** Show time on bubbles; only auto-scroll when already near bottom (track `isAtBottom`, use the inner container's `scrollTop`); guard `if (e.nativeEvent.isComposing) return`.

**L13 — Degraded Home states + low-contrast captions + inconsistent retry/focus.** ✅ CONFIRMED (cluster of UX polish, merged)
- Greeting collapses to a lone "Good morning, {name}." with no status fallback when stage/update/action/eta are all null (`ClientHome.jsx:8–22`); financial card renders six "—" with no "not available yet" framing on a $2m contract (`:113–123, 191–200`). **Fix:** Guarantee a status line; show one empty-state sentence instead of six dashes.
- Contrast: `text-muted/70` GST caption ≈2.7:1, sidebar email `white/40` ≈3.5:1, inactive nav `white/60` ≈2.4:1 fail WCAG 1.4.3 (`ClientHome.jsx:122`, `ClientPortalLayout.jsx:145,134,190`). **Fix:** Darken caption to full `text-muted`; raise inactive-nav/email opacity ≥70%.
- Retry parity: Home/Journey/Documents/MyHome render `ErrorBox` with no `onRetry` (Actions/Selections/Messages pass it). `ClientHome.jsx:43` shows raw "No project data yet." **Fix:** Pass `onRetry` (re-run loader via `useCallback`) on all pages.
- Focus ring: `.focus-ring` applied only to the two textareas; buttons/NavLinks/chips rely on UA default (`clientPortalUi.jsx`, all pages). **Fix:** Add `focus-visible:ring-2 ring-accent ring-offset-2` to all interactive elements.
- Pending-variation figure rendered as a signed muted dollar in the same grid as settled totals (`ClientHome.jsx:117,191–200`) reads like a confirmed line item. **Fix:** Label "Pending (not yet approved)" and/or visually separate.
- `confirming` not reset on respond error (`ClientActions.jsx:139–145`) leaves the confirm panel open after failure. **Fix:** Reset `confirming:false` on error (acceptable as-is for retry, minor).

---

## 2. The single REFUTED / recharacterised item

**RC1 — "Selections: no discontinued/stale-option state."** (raw finding, `likely`) — **NOT A DEFECT in the shipped scope.**
`portalV2Routes.mjs:567–595, 597–675`; `selection_options` indeed has no `available/discontinued` flag and `lead_time_weeks`/`order_by_date` are static staff fields. But this is a **missing future feature**, not a bug in built behaviour: there is no live supplier feed in scope, and the terminal-status 409 lock is intentional and correct. The "client could order against a dead product" scenario requires staff to leave stale data AND a product to be discontinned mid-selection — an operational/data-freshness concern, not a code defect. **Verdict: REFUTED as a launch defect; logged as a Selections roadmap enhancement.** (The over-allowance half of the reviewer's concern is the real defect — captured as M5.)

---

## 3. Dedup ledger (what merged)

| Merged into | Raw findings | Why |
|---|---|---|
| **H1** | IDOR #1 (security-rls) + #16 (new-features) | Identical bug, two lenses. |
| **M1** | portal_v2 gate #2 (security-rls) + #19 (new-features) | Identical bug. |
| **H3** | partial-payment #10 (contract) + #23 (failure-modes) | Same snapshot + sync defect. |
| **M4** | payment-notify #11 (contract) + #20 (new-features) | Same unguarded endpoint. |
| **L12** | chat date-only + scroll + IME (three raw ux-mobile rows) | One file, one component. |
| **L13** | degraded Home + contrast + retry + focus + pending-figure + confirm-reset (six raw rows) | UX polish cluster, same pages. |
| **M3 / L3** | audit immutability #4 + repudiation #13 | Same root (105 unapplied); L3 keeps the distinct "rollback unaudited" point. |

---

## 4. Re-score — 13 categories /10 (prior → new)

Same weighting as prior passes (Security, Notifications, Variations, Client Experience ×2; rest ×1).

| # | Category | Prior | New | Why it moved (or didn't) |
|---|---|:---:|:---:|---|
| 1 | Navigation | 7 | 7 | Unchanged. IA still clean; no defects found here. |
| 2 | Mobile UX | 7 | **6** | **−1.** Confirmed sub-44px targets on financial controls (M11), no safe-area inset (M13), IME/scroll-hijack chat bugs (L12). The mobile polish was over-credited. |
| 3 | Variations | 7 | **5** | **−2.** C1 (dual-approval cosmetic) is a contract-integrity hole on a ×2 category; H2 (TOCTOU) and H4 (revised variation never re-surfaces) compound it. The inc-GST confirm step is real and kept it off the floor. |
| 4 | Selections | 6 | **5** | **−1.** M5 (over-allowance raises no variation, `linked_variation_id` unset) is a live cost-dispute path, not just a missing confirm. |
| 5 | Documents | 7 | **6** | **−1.** H1 (cross-project expose IDOR) is a real tenant-isolation hole in the headline Documents feature; M9 (raw error + 500 on moved file) hurts the download UX. Expose workflow itself is sound. |
| 6 | Meetings | 5 | **4** | **−1.** M7 (decline leaves a nagging zombie action) is a confirmed live failure, not just "no reschedule." |
| 7 | Messaging | 5 | **4** | **−1.** M8 (unbounded query/no pagination — a Law violation — + no length cap) plus L12 chat bugs. |
| 8 | Progress Claims | 4 | **3** | **−1.** H3 (partial payment overstates debt, shows $0 paid) + M4 (unverified, repeatable "I've paid") are both confirmed dispute triggers on the most money-sensitive tab. |
| 9 | Notifications | 8 | **6** | **−2.** M6 (in-app written but never surfaced and unmarkable-read — the headline task-12 deliverable is half-dead) + L1 dedup gap + L6 only-primary-emailed. The "client is notified in-app" claim is not met. |
| 10 | Audit Logs | 5 | **4** | **−1.** M3/L3 (immutability hinges on unapplied 105; service role bypasses RLS) + L8 (spoofable IP in the immutable trail) + rollback unaudited. |
| 11 | Security | 8 | **6** | **−2.** H1 IDOR + M1 (the access toggle is a no-op) + M2 (RLS coverage implicit, RLS-off tables reachable) + M10 (legacy ex-GST/reasoning leak on anon token). Not breach-class for the major tables (verified RLS), but the toggle-is-cosmetic + IDOR combination drops it below the prior 8. |
| 12 | Client Experience | 8 | **6** | **−2.** H5 (journey photos 100% dead — the most visual feature) + H6 (Home contradicts the action feed after approval) + L13 degraded states. The "every tab has substance" claim breaks on the dead photo wall. |
| 13 | Premium Feel | 7 | **6** | **−1.** L10 dead Google-review link at the marquee handover moment + L13 contrast/focus + dead journey photos undercut the premium claim. |

### Weighted recomputation

| Category | Score | Weight | Weighted |
|---|:---:|:---:|:---:|
| Navigation | 7 | 1 | 7 |
| Mobile UX | 6 | 1 | 6 |
| Variations | 5 | 2 | 10 |
| Selections | 5 | 1 | 5 |
| Documents | 6 | 1 | 6 |
| Meetings | 4 | 1 | 4 |
| Messaging | 4 | 1 | 4 |
| Progress Claims | 3 | 1 | 3 |
| Notifications | 6 | 2 | 12 |
| Audit Logs | 4 | 1 | 4 |
| Security | 6 | 2 | 12 |
| Client Experience | 6 | 2 | 12 |
| Premium Feel | 6 | 1 | 6 |
| **Totals** | | **17** | **91** |

Weighted sum = **91 / 170** (prior pass 115/170 → reported 90).

On the prior pass's own reporting curve (115 weighted = 90 reported; ~+0.75 weighted per reported point near the top band), **91 weighted ≈ 71 reported.** Rounding to the band and accounting for the fact that a *critical* contract-integrity defect (C1) caps the achievable headline regardless of arithmetic:

## **NEW OVERALL SCORE: 72 / 100** (was 90).

The 18-point drop is driven by: one critical (C1) the prior scorecard explicitly listed as "still unenforced" but did not let bite the score; six confirmed highs the prior pass never tested for (H2–H6 are all new to this adjudication); and the discovery that two headline deliverables — in-app notifications (M6) and journey photos (H5) — are non-functional for a real JWT client.

---

## 5. Verdict

# GO LIVE TODAY? **NO — CONDITIONAL.** 90 does NOT hold; the honest score is **72**.

This is not "ship it." It is **"ship it to the first hand-picked client after the must-fix list below is cleared and migration 105 is confirmed applied."** None of the must-fix items is large; most are <½ day. But three of them (C1, H1, H3) are exactly the class of defect that turns a $2m relationship adversarial — a unilateral approval the contract says needs two, a client seeing another client's contract, and a portal telling a client they owe money they've already paid. Those cannot go out the door.

The prior 90/GO-YES was over-confident on two counts: it scored `requires_dual_approval` as a "held-below-8" footnote when it is a **critical** unenforced contract control, and it credited Notifications (8) and Client Experience (8) without exercising the in-app channel or the journey photo route end-to-end as a JWT client — both of which are dead.

---

## 6. Must-fix-before-first-client vs fast-follow

### MUST FIX before the first invite (the shortest possible list — 6 items + 1 ops gate)

1. **C1 — Enforce or disarm dual-approval.** Either implement two-distinct-approver logic, or (minimum, ~30 min) remove `requires_dual_approval`/`second_approval_at` from the client allowlist so the UI can't imply a control that doesn't exist. *A misrepresented contractual control is the one true blocker.*
2. **H1 — Add the `jd.job_id === project.job_id` tenant check to `expose-document`.** One query + one comparison. Closes cross-project document leakage.
3. **H3 — Fix the partial-payment snapshot** (`paidToDate`/balance from `progress_claim_payments` or `cumulative_claimed`). A portal that overstates debt on a $2m build is an immediate dispute.
4. **H2 — Make the variation respond UPDATE conditional** (`.eq('status','pending').select()`, zero-rows ⇒ 409). One-line change; prevents duplicate/ambiguous contractual records.
5. **H5 — Add the JWT-gated photo route** and point ClientJourney at it. The journey is currently photo-less for every real client; mirror the documents download handler.
6. **Ops gate — Confirm migration 105 is applied in prod** (`portal_audit_logs_immutable` trigger present) BEFORE the first contractual write. Without it the "immutable audit" claim is false (M3/L3). Pair with the existing pre-flight checks: set `CRON_SECRET`, confirm `portal_client_email` + Resend transport.

> H4 (revised-variation never re-surfaces) and H6 (Home contradicts the feed) are **strong should-fix**: include them in the must-fix set if the first client is expected to receive any variation that might be revised, or to approve a variation and look at Home. Both are small (H4 = set `status:'pending'` in one branch; H6 = bucket by `portal_decisions.status`). Recommended in-scope.

### FAST-FOLLOW (week 1, none launch-blocking)

- **M4** payment-notify guard + action-clear + first-transition-only email (twin L11 UX confirm step).
- **M5** over-allowance → draft variation / acknowledged cost step (set `linked_variation_id`).
- **M6** surface in-app notifications + `POST /notifications/:id/read` (or drop the dead in-app writes).
- **M1** decide and implement (or relabel) the `portal_v2_enabled` access gate.
- **M8** Messages pagination + body length cap.
- **M9** friendly 404 on moved/deleted storage files (never raw `e.message`).
- **M7** meeting-decline closes the action + reschedule path.
- **M2** RLS coverage assertion / by-name `deny_clients` + CI check.
- **M10** retire or allowlist the legacy token budget/decisions reads.
- **M11/M12/M13** 44px targets, ARIA on progress/status, safe-area inset.
- **L1, L4, L5, L6, L7, L8, L9, L10, L12, L13** — the low cluster: dedup index, error logging, GST constant, multi-recipient email, drop `cost_delta`, trusted proxy IP, vocabulary alignment, **Google Place ID** (do before any real handover), chat polish, Home degraded states + contrast + retry + focus.

---

## 7. Bottom line

**Confirmed defects: 33** (1 critical, 6 high, 13 medium, 13 low) + **1 refuted** (stale-option feature) + **2 downgraded** (Google link HIGH→LOW, legacy ex-GST scope-narrowed). **New overall: 72/100** (was 90). **Verdict: GO LIVE = NO until the 6-item must-fix list + the 105 ops gate are cleared; 90 does not hold.** Once C1, H1, H2, H3, H5 (and ideally H4, H6) land and 105 is confirmed in prod, this is a genuine GO for a single hand-picked client — the architecture is sound, the field allowlists and audit-before-respond patterns are real strengths, and every remaining item is a fast-follow.
