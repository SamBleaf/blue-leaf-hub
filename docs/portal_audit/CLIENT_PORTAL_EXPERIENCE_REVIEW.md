# Client Portal v2 — Experience Review (Red-Team)

**Reviewer stance:** Hostile red-teamer, not the author. Every claim is grounded in code (`file:function`/line). The lens is the portal mission — a client must ALWAYS be able to answer:

- **Q1 — Where are we up to?**
- **Q2 — What happens next?**
- **Q3 — What do you need from me?**

Date: 2026-06-21. Migration 103 is **NOT yet applied** to the single production DB. Everything below assumes it eventually is; where the gate or schema bites, it's called out.

---

## 0. Verdict up front

The information architecture is genuinely good: six tabs, no builder jargon leaking into the client view, field allowlists that keep cost/margin out (`portalV2Routes.mjs` `PORTAL_DECISION_FIELDS`, `PROGRESS_CLAIM_JOIN_FIELDS`), and a single unified `client_actions` feed that all three modules write to. The *skeleton* answers all three questions. The mission is to know the answers **always** — and that's where it breaks. The portal is **passively correct and actively silent**: it shows the right thing if and only if the client opens the app on the right day, the nightly cron ran, and the photo/document/signature happy-path holds. For a busy or difficult $2m client, every one of those conditions fails silently.

**Top 10 issues, ranked by client/operational/legal impact:**

| # | Severity | Issue | Evidence |
|---|---|---|---|
| 1 | CRITICAL | **No outbound notifications at all.** `portal_notifications` is created + read, never written. No push, no SMS, no per-action email. Q3 only works if the client logs in unprompted. | `portalV2Routes.mjs:934` reads it; zero writers in repo (`grep portal_notifications server/lib` → 1 hit, the reader). |
| 2 | CRITICAL | **Dual approval is modelled but never enforced.** `requires_dual_approval`/`second_approval_at` are returned to the client but no route checks them. A single primary approves any-size variation alone. | `portalV2Routes.mjs:362 respond` — no dual-approval branch; `103…sql:249`. |
| 3 | CRITICAL | **"Signature required" is a dead end.** Documents render "Signature required"; no signing route or UI exists. `document_signature` action type is defined but never created/handled. | `ClientDocuments.jsx:95`; no signer in `portalV2Routes.mjs`; `ActionDetail` (`ClientActions.jsx:93`) has no `document_signature` case. |
| 4 | HIGH | **Journey photos are 100% broken for logged-in clients.** UI hits `/api/portal/media/:id` with no `?token`; that route hard-requires `token`. Every photo 400s and is hidden by `onError`. Q1/Q2 visual proof silently absent. | `ClientJourney.jsx:98` vs `portalRoutes.mjs:147`. |
| 5 | HIGH | **`/api/cron/portal-sync` is unauthenticated.** Anyone on the internet can POST it and rewrite `is_current`, `confidence`, and flip selections to `overdue` across every project. | `dev-api.mjs:1568` — no CRON_SECRET, no guard. |
| 6 | HIGH | **The whole experience is stale unless a human runs cron + posts updates.** "Current stage", confidence colour, overdue flags only move on the nightly job; updates/photos are 100% manual. A neglected project shows green + "on track" while late. | `portalSync.mjs:runPortalNightlySync`; Home reads `is_current`/`confidence` (`portalV2Routes.mjs:156`). |
| 7 | HIGH | **`resolveClientProjectId` silently picks ONE project.** A client with 2 builds (or a duplicate `portal_client_email`) is locked to the most-recent v2 project with no switcher. The other build is invisible. | `clientPortalApi.js:58`. |
| 8 | MED | **Ex-GST cost_delta written where inc-GST is implied.** `syncVariationSent` writes `amount_ex_gst` into `cost_delta`; the client UI reads inc-GST from the join, so the shadow value is a latent mislabel waiting for any consumer that trusts it. | `portalIntegration.mjs:92`. |
| 9 | MED | **Approve/decline is irreversible and one-shot.** 409 on any second attempt; no "I changed my mind", no info-requested path, no re-open. Client mis-taps Approve on a $40k variation → contractually recorded, no client-side undo. | `portalV2Routes.mjs:386`. |
| 10 | MED | **Messages: no realtime, no unread-for-builder signal to client, marks read on mere GET.** Opening the tab marks all builder messages read even if not seen; client can't tell if builder has read theirs. | `portalV2Routes.mjs:860 messages`. |

---

## 1. Page → Question mapping + verdict

| Page (`file`) | Q1 Where? | Q2 Next? | Q3 From me? | Verdict |
|---|:---:|:---:|:---:|---|
| **Home** `ClientHome.jsx` | ◑ | ◑ | ◑ | **Keep, but over-stuffed.** Tries to answer all three on one screen (greeting+stage+health+actions+financial+coming-up+update+team+messages = 8 cards). Genuinely good greeting synthesis. But every signal is only as fresh as the last cron+manual update; "On track" is asserted, not earned. |
| **My Actions** `ClientActions.jsx` | ✗ | ◑ | ●| **Keep — the heart of Q3.** Best page. But it's a *pull* surface with no push (see #1), no sort by urgency beyond a dot, and `document_signature`/`client_rfi`/`colour_approval`/`handover_item`/`weekly_update` action types have no handler — they hit the `default` "Open this item for details" dead branch. |
| **Project Journey** `ClientJourney.jsx` | ● | ◑ | ✗ | **Keep for Q1/Q2, but photos broken (#4) and `what_comes_next` is fetched but never rendered.** Stage previews only show for `upcoming` stages, so the *current* stage gives no "what happens next" — the exact moment the client wants it. |
| **Selections** `ClientSelections.jsx` | ✗ | ◑ | ● | **Keep.** Clear Q3 surface with cost-vs-allowance and order-by-date risk. But "in_review/With Blue Leaf" is a terminal-looking state with no further signal — client doesn't know if/when it's approved. |
| **Documents** `ClientDocuments.jsx` | ◑ | ✗ | ◑ | **Keep, but "Signature required" lies (#3)** and there's no "new since last visit" marker. Pure archive — answers none of the 3 questions directly, which is fine for a reference tab. |
| **Messages** `ClientMessages.jsx` | ✗ | ✗ | ◑ | **Keep.** Necessary escape hatch. But no realtime, marks-read-on-GET (#10), and `100vh-12rem` height math will clip on mobile with the bottom nav. |
| **My Home** `ClientMyHome.jsx` (post-handover) | ● | n/a | ◑ | **Keep.** Good closeout. Review CTA `placeid=` is empty (`ClientMyHome.jsx:81`) → broken Google review link ships. |

● answers it · ◑ partial · ✗ doesn't (and shouldn't be expected to)

**Navigation verdict:** Six tabs is right; no duplicate nav; the Journey→My Home swap at `practical_completion` is clean (`ClientPortalLayout.jsx:52`). No page is gratuitous. The problem is **depth, not breadth** — each tab is a thin read over a data source that nothing keeps current.

---

## 2. Does Q1 "Where are we up to?" actually hold?

**Home greeting + health + financial snapshot — partial.**

- The greeting (`ClientHome.jsx:greeting`) is the strongest single thing in the build — it composes phase + stage + latest update + next action into plain English. Good.
- **But "On track" is a default, not a fact.** `confidenceStyle` returns On-track green for *any* unknown/null value (`clientPortalUi.jsx:46 default:`). A brand-new project with no schedule, or one the cron hasn't touched, shows **green "On track"** to a $2m client. That is the single most dangerous UX lie in the build — it manufactures false confidence.
- **Confidence is cron-derived and coarse.** `portalSync.mjs:syncProjectMilestones` sets `delayed` only if a task `end_date < today` and not complete. A project that's about to blow its date but has no granular task end dates reads green. There is no human override visible to the client beyond `confidence_note`.
- **Progress % is milestone-count, not weighted.** `progressPct = achieved/total` (`portalV2Routes.mjs:182`) — 1 of 8 milestones done = 12% even if that milestone was 60% of the contract value/time. Clients will anchor on this number and feel cheated.
- **Financial snapshot is solid and safe.** Inc-GST only, generated columns, no margin. The one real risk: `pendingVariations` counts `status === 'sent_to_client'` only (`buildFinancialSnapshot:975`) — a variation `pending` in the portal but not yet `sent_to_client` in finance shows in neither bucket, so "Current total" can understate what's coming. Also `contractValue` falls back to `null` → renders "—", leaving a client with no contract figure at all if `projects.contract_value` was never set.

**Net:** Q1 is answered *only if* someone has been diligently feeding the portal. The system has no "we don't actually know" state — it defaults to reassuring.

---

## 3. Does Q2 "What happens next?" hold?

**Project Journey + stage previews — partial, with a self-inflicted gap.**

- `portal_milestones.what_comes_next` is **selected in the journey query** (`portalV2Routes.mjs:822`) and **never rendered** in `ClientJourney.jsx`. The one field literally named "what comes next" is dropped on the floor.
- `stage_preview` renders **only for `upcoming` stages** (`ClientJourney.jsx:70`). For the *current* stage — where "what happens next" is most acute — the client sees updates/photos (often empty) but no forward-looking preview.
- Home's `nextMilestone` is just the next milestone's *label* (`portalV2Routes.mjs:183`), no date unless `currentStage.eta` exists. "Next: Lock-up" with no when is half an answer.
- The `next_week_preview` field on `portal_updates` is captured by admin (`portalV2AdminRoutes.mjs:266`) but **never surfaced** in any client page. Another "what's next" field collected and hidden.

**Net:** Q2 is the weakest of the three. The data model anticipated it (`what_comes_next`, `stage_preview`, `next_week_preview`) and the UI renders almost none of it for the current moment.

---

## 4. Does Q3 "What do you need from me?" hold?

**My Actions — answers it on the surface; fails the "always" test.**

The unified feed is correct and de-duplicated (`portalIntegration.mjs:upsertClientAction`). When a client opens the app, they see what's needed. The failures are all about **reaching a client who isn't looking**, and about **action types with no handler**:

1. **No notifications (#1).** This is the headline. `client_actions.notification_sent_at` / `notification_channel` columns exist; nothing sets them. `portal_notifications` is a read-only ghost table. A variation issued Monday sits unseen until the client happens to log in. For a difficult client, "you never told me" is a winnable dispute against the builder.
2. **Dead action types.** `ActionDetail` (`ClientActions.jsx:93`) handles `variation_approval`, `progress_claim_review`, `meeting_confirmation`, `selection_decision`. The schema allows `document_signature`, `client_rfi`, `colour_approval`, `handover_item`, `weekly_update` (`103…sql:57`). Any of those → `default:` branch shows the bare description with no way to act. A "Sign your contract" action is unactionable.
3. **Overdue depends entirely on cron.** `client_actions.status='overdue'` is set only by `portalSync.syncProjectSelectionsOverdue` and only for selections — a variation/claim/meeting past due **never flips to overdue** in the feed. The red dot logic in `ClientActions.urgencyDot` re-derives urgency client-side from `dueDate`, so it partly compensates, but the backend counter (`actionCount` on Home) and "Overdue" labels won't reflect overdue variations.
4. **Selection actions punt.** `selection_decision` in My Actions just links to the Selections tab (`ClientActions.jsx:101`) — an extra hop for the highest-volume action type.

**Net:** Q3 is answered for the engaged client and only for 4 of 9 action types, with zero outreach to the disengaged client.

---

## 5. Operational / legal / data-leakage risk

### 5.1 Contract & approval risk (the expensive ones)
- **Timestamped-account approval is sold as binding but dual approval isn't enforced (#2).** `ActionDetail` tells the client "Your approval is recorded with a timestamp and your account details" (`ClientActions.jsx:164`). For a $2m job with two owners, `requires_dual_approval` exists in schema and is returned to the client, but `respond` (`portalV2Routes.mjs:362`) approves on the first click and writes `status='signed'` to canonical `job_variations`. If the partner disputes, there is no second-signatory record despite the system claiming to model one. **This is the highest legal exposure in the build.**
- **Irreversible one-shot approve (#9).** No undo, no info-requested, no "ask a question before deciding" that holds the decision open. A mis-tap is contractually logged. The `info_requested` decision status exists in schema (`103…sql:24`) but no route ever sets it.
- **Audit rollback is good but narrow.** `respond` rolls back the decision if the audit insert fails (`portalV2Routes.mjs:416`) — genuinely careful. But the *finance mirror* (`job_variations.status='signed'`) happens **after** the audit and is **not** rolled back if step 3 throws. A partial failure can leave `portal_decisions=approved`, audit written, but the variation un-signed (or vice-versa on the next sync) — divergent contractual state.
- **Approve archives a PDF that may not exist / may be wrong.** On approve it inserts a `portal_documents` row pointing at `signed_document_url || document_url` (`portalV2Routes.mjs:435`). If only an unsigned `document_url` exists, the client's Documents tab now shows a "signed" variation that isn't signed.

### 5.2 Auth / access-control
- **Service-role everywhere; middleware is the only boundary.** Correct and clearly documented (`requirePortalAuth.mjs` header). The `is_active !== true` fail-safe is good. **But** `resolveClientProjectId` runs on the **anon client against `projects`** (`clientPortalApi.js:63`) and depends entirely on RLS scoping `projects` by `portal_client_email`. If that RLS policy is missing/loose on the single prod DB, a client could enumerate other projects by email. The server middleware would still block API calls, but the *project picker* leaks `id`/`address`. Not verified here — **must be checked before go-live.**
- **Unauthenticated cron (#5).** `/api/cron/portal-sync` (and siblings) have no secret. A malicious POST flips selections to `overdue` and recomputes `is_current` for all projects. Low payoff but trivially abusable and it mutates client-facing state.
- **Photo media route is token-only.** `/api/portal/media/:id` (`portalRoutes.mjs:145`) authenticates via the **legacy share token in query**, not the JWT. So logged-in v2 clients have no working path to photos (#4), *and* the route is a different, weaker auth model than the rest of v2 — anyone with a leaked share token can pull any photo by id within that project.

### 5.3 Data leakage — mostly well-handled
- Field allowlists are real and enforced (`portalV2Routes.mjs:36-66`). `internal_notes`, `cost_to_builder`, `amount_ex_gst` are never selected on client routes. **Good.**
- `team_members` is returned wholesale from `projects.team_members` jsonb (`portalV2Routes.mjs:264`) — if staff put internal phone/email/notes in that blob, it ships to the client. No allowlist on its shape.
- `portal_meetings` returns `attendees`, `agenda`, `minutes`, `action_items`, `decisions_made` for any `client_visible` meeting. `minutes`/`decisions_made` are free text authored by staff (`portalV2AdminRoutes.mjs:236`) — one careless internal minute on a client-visible meeting leaks. The visibility flag is the only gate and it defaults **visible** (`client_visible !== false`).

### 5.4 Idempotency / sync correctness
- `syncClaimIssued` recomputes inc-GST as `amount_ex_gst * 1.1` if the generated column is null (`portalIntegration.mjs:218`) — a hardcoded `* 1.1`, violating the repo's own "never hardcode GST" law and silently wrong if GST rate ever changes or the claim is GST-free.
- `cost_delta` mislabel (#8) — ex-GST written, inc-GST implied by the column's role.
- Nightly sync's "current phase" heuristic (`portalSync.mjs:68`) is fragile: it picks the first not-fully-complete phase that has started *or* the first incomplete by `findIndex`. Phases with no `start_date` sort to `Infinity` and can scramble order; a project where work runs out-of-phase-order will show the wrong "current stage."

---

## 6. Builder-centric thinking that leaked into the client view

- **"Why we did it this way" / "Why this variation was raised"** (`ClientHome.jsx:149`, `ClientActions.jsx:148`) is builder-voiced justification surfaced to the client. Well-intentioned (transparency) but it frames the portal around the *builder explaining themselves* rather than the client deciding. For a difficult client it reads as pre-emptive defensiveness on every variation.
- **`schedule_phase` keys leak as stage identity.** Journey stages are keyed on raw schedule phase keys (`portalSync.phaseLabel` just title-cases `lock_up` → "Lock Up"). The client sees the builder's internal phase taxonomy, not a client-friendly journey narrative.
- **Confidence vocabulary** (`on_track`/`watch`/`delayed`) is a builder/PM construct. "Watch" means nothing to a homeowner.
- The financial snapshot label "Your build, financially" with six raw line items (`ClientHome.jsx:113`) is an accountant's view. A client wants "you've paid X of Y, Z remaining" — the data is there but presented as a ledger, not a story.

---

## 7. What breaks when a *difficult* $2m client uses it

1. Approves a variation, partner objects → no dual-approval record exists despite the schema implying one (#2). Dispute.
2. "You never notified me about the colour deadline" → true; there are no notifications (#1), and the only nudge is a cron flag they had to log in to see.
3. Opens Journey to check progress → photos all silently missing (#4); "On track" green despite a 3-week slip the cron didn't catch because tasks lack end dates (#6, §2).
4. Mis-taps Approve → no undo (#9); now contractually on the hook with only a Messages plea as recourse.
5. Has two Blue Leaf builds → can only ever see one (#7), assumes the other doesn't exist or isn't being tracked.
6. Clicks "Leave a Google review" at handover → broken link (`ClientMyHome.jsx:81`).
7. Sends an urgent message → no realtime, no read receipt, builder only finds out via a best-effort email to `admin@` that may silently fail (`portalV2Routes.mjs:901` swallows errors).

---

## 8. Recommendations (ranked, do these before a real client touches it)

**Must-fix before go-live:**
1. **Wire notifications.** Write `portal_notifications` + send email (Resend per memory) on every `client_actions` insert and on overdue flip. Without this, Q3 fundamentally fails. Set `notification_sent_at`.
2. **Enforce or remove dual approval.** Either block `respond` when `requires_dual_approval` and `second_approval_at IS NULL`, or strip the columns and the implied promise. Do not ship a half-modelled signature.
3. **Fix Journey photos.** Add a JWT-authed media route under `/api/portal/app/:projectId/photos/:id` (sequential Dropbox read) and point the UI at it. Delete the token-query path from the v2 client.
4. **Authenticate cron.** Add a `CRON_SECRET` header check to `/api/cron/portal-sync` and siblings.
5. **Kill the false-green.** `confidenceStyle` must have an explicit "unknown / not yet scheduled" neutral state; never default to "On track."
6. **Either build the signing flow or stop saying "Signature required."** A document that demands signature with no way to sign is worse than silence.

**Should-fix:**
7. Render `what_comes_next` and `next_week_preview` (the Q2 fields you already collect) on the current stage.
8. Multi-project switcher in the layout; stop silently picking one.
9. Add an "Ask a question / I'm not sure" path on variations that creates a `client_rfi` action instead of forcing approve/decline.
10. Make `overdue` apply to variations/claims/meetings, not just selections; or compute it server-side at read time.
11. Roll back (or transactionally couple) the finance mirror with the portal decision in `respond`.
12. Default `client_visible` to **false** for meetings and gate `minutes`/`decisions_made` behind an explicit client-safe field.

**Nice-to-have:** weighted progress %, realtime messages + read receipts, reframe the financial ledger as a payment-progress story, fix the empty `placeid=` review link.

---

## 9. One-paragraph bottom line

The portal's bones are right — clean six-tab IA, disciplined field allowlists, a unified action feed, and a genuinely good plain-English Home greeting. But the mission is that a client **always** knows the three answers, and this build only delivers them to a client who logs in unprompted, on a day after the cron ran, on a project a human has been manually feeding. There is **no outbound notification of any kind**, "On track" green is a default rather than a fact, the Q2 "what's next" fields are collected and never shown, Journey photos are 100% broken for logged-in clients, dual approval is promised in schema and unenforced in code, and "Signature required" leads nowhere. It is a competent read-only viewer wearing the costume of an interactive client experience. Fix notifications, the false-green, the broken photos, and the dual-approval gap before any real $2m client — especially a difficult one — is given the link.
