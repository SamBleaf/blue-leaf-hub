# Client Portal v2 — Persona Walkthroughs (Red-Team Audit)

**Stance:** Hostile red-teamer. Every claim is grounded in the actual code (file:function/line). The job is to find what breaks when a real $2m client — or a difficult one — uses this portal, not to defend the design.

**Scope of code reviewed:** `server/lib/{requirePortalAuth,portalV2Routes,portalV2AdminRoutes,portalIntegration,portalSync,portalRoutes,authRoutes}.mjs`, `src/lib/clientPortalApi.js`, `src/pages/clientportal/*`, `supabase/migrations/103_client_portal_v2.sql`, cron wiring in `server/dev-api.mjs`.

---

## Severity legend
- **S1 — Blocker / data-loss / legal:** breaks the job for a real client, or creates contract/dispute exposure.
- **S2 — Major:** a persona hits a dead end, sees wrong/alarming data, or a core promise silently fails.
- **S3 — Minor:** confusing UX, polish, edge-case.

---

## CROSS-CUTTING BREAKS (hit by every persona — read first)

These are not persona-specific; they are foundational and every walkthrough below inherits them.

### X1 — There is NO client-facing notification of anything. The entire portal is silent and pull-only. **(S1)**
- `portal_notifications` is **read** by `portalV2Routes.mjs` `GET /notifications` (line 934) but **never inserted anywhere in the server** (grep for `portal_notifications` + `insert`/`upsert` across `server/` returns nothing). The in-app bell is permanently empty. The dedup index and `notification_type` CHECK in migration 103 (lines 211–322) decorate a table no code populates.
- Every `sendPlainMail(...)` call in the portal goes to `admin@blueleafbuilding.com.au` — `portalV2Routes.mjs:542` (payment notify), `:801` (meeting decline), `:902` (client message). **There is not one email path that targets `project.portal_client_email`.** When a variation is raised, a claim issued, a selection goes overdue, a meeting scheduled, or the builder replies to a message — the client is told **nothing**. They only find out by logging in and looking.
- `client_actions.notification_sent_at` / `notification_channel` columns (103 lines 71–72) are never written. The promised notification layer does not exist; the schema is aspirational.
- **Consequence:** the portal's core value proposition ("we'll let you know when something needs you" — `ClientHome.jsx:104`, `ClientActions.jsx:48`) is a **false promise written into the UI**. Personas B and E are defined by this gap.

### X2 — `runPortalNightlySync` (the only thing that flags overdue / advances stages) is gated behind a cron that defaults OFF. **(S1)**
- `server/dev-api.mjs:2240`: `if (envBool(process.env.REMINDER_CRON_ENABLED, false))` — **default `false`**. If that env var is unset on Railway, `runPortalNightlySync` (which lives inside that same `tick`, line 2254) **never runs**.
- `portalSync.mjs:runPortalNightlySync` is the **only** writer that: (a) sets `client_selections.status = 'overdue'` and the matching `client_actions.status = 'overdue'` (`syncProjectSelectionsOverdue`, lines 144–157), and (b) mirrors `schedule_tasks` → `portal_milestones` to advance the current stage and set confidence (`syncProjectMilestones`).
- **If the cron is off:** selections never turn red, the Home stage never advances, the confidence light is frozen on whatever it was last set to, and "X actions need your attention" undercounts because overdue items still read `pending`/`awaiting_client`. The portal silently lies about project state.
- Even when ON, it runs **once per 24h** (`setInterval(tick, dayMs)`), so "overdue" can lag reality by a full day.

### X3 — The whole feature is unreachable in production right now (operational, not code). **(S1, go-live)**
- Migration 103 is **not applied** to the one production DB (no staging). Until a human pastes 099→102 then 103 into the Supabase SQL editor, every table the v2 API touches (`project_client_users`, `client_actions`, `portal_documents`, `client_selections`, …) does not exist. `accept-invite` already swallows the missing-table case (`authRoutes.mjs:365` try/catch "link skipped") — so a client could accept an invite, log in, and get **403 on every route** (`requirePortalAuth.mjs:57`, no `project_client_users` row), landing on "No project linked yet" (`ClientPortalLayout.jsx:95`). Order of operations at go-live is load-bearing and undocumented in-app.

### X4 — `resolveClientProjectId` leans on a wide-open `projects` RLS policy. **(S2, data-leak-adjacent)**
- `clientPortalApi.js:resolveClientProjectId` queries `projects` **directly via the anon Supabase client** (RLS-dependent), filtering `.eq("portal_client_email", email)`.
- Migration `006_module4_operations_buildexact.sql:109` sets `CREATE POLICY "Allow all anon projects" ON public.projects FOR ALL USING (true)`. The **entire projects table is readable by any anon key holder** — addresses, contract values, client emails, build phase, team. The portal's project resolution happens to work *because* of this hole. It is a pre-existing leak the portal now depends on; tightening RLS later will silently break login resolution. Either way it is wrong: a client's browser holds an anon key that can `select *` every project Blue Leaf has.

### X5 — "E-signature" is a timestamp, and the UI tells the client so — but the contract risk is unmanaged. **(S2, legal)**
- `VariationAction` in `ClientActions.jsx:164` prints: *"Your approval is recorded with a timestamp and your account details. Blue Leaf will issue a signed variation document separately."* Honest, but it means the **binding** artefact is generated off-portal. The portal records `portal_decisions.status='approved'` + an audit row (`portalV2Routes.mjs:407`), flips `job_variations.status='signed'` (line 427), and **archives the variation PDF to Documents as if executed** (line 437) — before any countersignature exists. If a dispute arises over a $40k variation, the "signed" status and the Documents entry imply execution that did not legally occur. See also F-D2.

---

## PERSONA A — Ideal client (tech-savvy, fast). Can they complete end-to-end smoothly?

**Verdict: Mostly yes on the happy path, but they hit two hard breaks (photos, message replies) and inherit all cross-cutting silence.**

1. **Accept invite.** `accept-invite/:token` → `authRoutes.mjs:248`. Creates auth user, `user_profiles` row (role `client`), sets `projects.portal_client_email/name`, upserts `project_client_users` (line 352). Clean — *provided 103 is applied* (else X3).
2. **Log in → land on Home.** `ClientPortalLayout` resolves project (X4), fetches `/session`, renders 6-nav. `ClientHome` calls `/home` (`portalV2Routes.mjs:146`): greeting, stage + confidence, financial snapshot, coming-up, latest update, team. Fast client reads it in 20 seconds. Good.
3. **Make a selection.** `ClientSelections` → `POST /selections/:id/select` (line 587). Computes `cost_impact = price_inc_gst − allowance` (line 617), status → `in_review`, audits, clears the action. Works.
4. **Approve a variation.** `My Actions` → expand → `VariationAction` → `POST /variations/:id/respond` (line 362). Approves, audits (with rollback-on-audit-failure — genuinely good, line 416), mirrors to finance, archives PDF, clears action. Works.
5. **Pay a claim.** `ClaimAction` → "I've transferred payment" → `POST /claims/:id/payment-notify` (line 505). Stamps `client_payment_notified_at`, emails **admin** (line 542), shows thank-you. Works.
6. **Watch the build via Journey.** **BREAK.**
7. **Message the builder.** **BREAK on the reply loop.**
8. **Handover → My Home.** When `build_phase='practical_completion'`, nav swaps Journey→My Home (`ClientPortalLayout.jsx:71`). Finishes + warranties + review CTA. Works (with A-B3 below).

**Break-points:**
- **A-B1 (S2):** **Journey photos are 100% broken for logged-in clients.** `ClientJourney.jsx:97` renders `<img src={`/api/portal/media/${p.id}`}>` with **no `token` query param**. The media endpoint `portalRoutes.mjs:145` *requires* `token`: line 149 returns 400 if absent, and it resolves the project **by token only** (`resolveProject(token)`, line 151) — it has no JWT path. So every site photo `onError`-hides itself (`ClientJourney.jsx:101`). Same bug affects `home.recentPhotos` if/when Home renders them. The "watch your build" emotional core silently shows nothing.
- **A-B2 (S2):** **Builder message replies never appear without a manual refresh.** `ClientMessages.jsx` has no polling, no Supabase realtime subscription (grep confirms none in `clientportal/*`). `load()` runs once on mount. The builder replies → the client sees it only on next manual reload. Combined with X1 (no email on reply), a fast client sends a question, sees silence, and assumes they were ignored.
- **A-B3 (S3):** `ClientMyHome.jsx:80` Google review link is `https://search.google.com/local/writereview?placeid=` — **`placeid` is empty**. The review button goes nowhere useful.
- **A-B4 (S3):** Even the ideal client gets no email when a new action lands (X1). A "fast" client is fast *when prompted*; nothing prompts them.

---

## PERSONA B — Busy professional (logs in every few weeks, misses emails, skims). What falls through the cracks?

**Verdict: Catastrophic by design. This persona is the portal's worst case and nothing catches them.**

1. **Week 0:** invited, logs in once, glances at Home, leaves.
2. **Week 2:** builder raises a variation in Finance → `syncVariationSent` (`portalIntegration.mjs:71`) creates the `portal_decision` + `client_action`. **No email, no SMS, no push** (X1). The action sits in a feed the client isn't looking at.
3. **Week 3:** a selection's `order_by_date` passes. *If* the cron is on (X2), `syncProjectSelectionsOverdue` flips it to `overdue` and the action turns red — **but only inside the portal the client hasn't opened.** If the cron is off, it doesn't even turn red.
4. **Week 5:** client finally logs in. Home shows "3 actions need your attention" (`ClientHome.jsx:102`) — the first they've heard of any of it. One selection is now `overdue`; its lead-time window is blown.

**Break-points:**
- **B-B1 (S1):** **No reminder cadence whatsoever.** There is no "you have an unactioned variation from 18 days ago" email, no digest, no escalation. The only scheduled job (`portalSync`) flags state *in the DB*; it sends **zero** outbound to the client. A busy client can miss a binding $30k variation for a month and the system never nudges them. This is the single biggest operational hole in the portal.
- **B-B2 (S2):** **The Action feed has no aging or "how long has this been waiting" signal.** `client_actions` has `created_at` but `ClientActions.jsx:dueLabel` only renders due-date proximity. A skimming client sees "Approve Variation #7" with no indication it's been pending three weeks. `ActionDetail` for a variation that's already blown its (non-existent) deadline looks identical to a fresh one.
- **B-B3 (S2):** **"Overdue" depends entirely on someone setting `order_by_date`/`due_date` AND the cron running.** `syncProjectSelectionsOverdue` (`portalSync.mjs:144`) only flags rows where `deadline && deadline < today`. If staff create a selection via admin `POST /selections` without a `dueDate` (allowed — `portalV2AdminRoutes.mjs:116` requires only `category`+`itemName`), it can **never** go overdue and never turn red. The busy client's most dangerous items are exactly the ones nobody dated.
- **B-B4 (S2):** **Stale stage / confidence.** If the cron is off (X2), `is_current` and `confidence` on `portal_milestones` freeze. The week-5 client sees a Home stage and a green "On track" light that may be a month out of date, with no "last updated" timestamp anywhere on `ClientHome`.

---

## PERSONA C — Non-technical client (low tech literacy). Can they log in, find actions, approve? Where do they get stuck?

**Verdict: Login is the cliff. Past it, the UI is genuinely simple — but several dead-ends will generate support calls.**

1. **The invite email → set password.** `accept-invite` requires `password ≥ 8` + `fullName ≥ 2` (`authRoutes.mjs:255`). Fine, but if the email never arrives (a known historical issue — the recovery branch at line 283 exists *because* "the email never arrived"), a non-technical client has **no self-serve path** and must phone Sam.
2. **Log in.** Lands on Home. The greeting + single "View My Actions" button (`ClientHome.jsx:106`) is the one thing this persona needs. Good.
3. **Approve a variation.** Tap action → expand → read "Why this variation was raised" (`ClientActions.jsx:146`) → Approve. The reasoning block is the best thing in the portal for this persona. Good.
4. **Download a document.** **STUCK.**
5. **Find a reply.** **STUCK** (same as A-B2).

**Break-points:**
- **C-B1 (S2):** **No password reset / "forgot password" surfaced in the portal.** `ClientPortalLayout.jsx:88` redirects to `/login` if `!user`. There is no portal-specific reset affordance. A non-technical client who forgets their password is dead in the water until staff intervene. (Not in the reviewed portal code at all.)
- **C-B2 (S2):** **Document "Download" behaviour is unpredictable and can fail silently for this persona.** `ClientDocuments.jsx:downloadDoc` either `window.open(signedUrl)` (Supabase, 60s expiry — `portalV2Routes.mjs:711`) or builds a Blob and synthesises an `<a>.click()` (Dropbox stream). On mobile Safari, programmatic `a.click()` to open a blob is frequently blocked or opens a blank tab. The button label flips "Download"→"Opening…"→"Download" with the error shown only in a top-of-page `ErrorBox` (`ClientDocuments.jsx:81`) the user may have scrolled past. A non-technical client taps, nothing visible happens, they tap again. Also: **legacy `public_url` docs** (`portalV2Routes.mjs:725`) return `{signedUrl: public_url, expiresIn: 0}` — a permanent link, contradicting the migration's stated "never a permanent public link" promise (103 line 79).
- **C-B3 (S2):** **The `selection_decision` action is a dead-end redirect, not an action.** `ClientActions.jsx:101` renders only *"Make this choice on the Selections board"* with a link. A literal-minded client expanded the action expecting to choose there; instead they're bounced to another tab. Two-step where one-step was promised ("everything that needs a decision from you, in one place" — `ClientActions.jsx:45`).
- **C-B4 (S3):** **Empty allowance reads ambiguously.** `ClientSelections.jsx:99` shows "No allowance set" — a non-technical client may read this as "this is free" rather than "price unknown / TBC."
- **C-B5 (S3):** **Enter-to-send in Messages.** `ClientMessages.jsx:68` sends on Enter (no Shift). A non-technical client typing a multi-line message will fire half-finished messages repeatedly. Each one emails admin (line 902), so Sam gets three fragments.

---

## PERSONA D — Anxious client (daily logins, scrutinises every variation/cost). Trust or anxiety?

**Verdict: The financial snapshot is a net anxiety-generator, not reassurance. Several numbers are misleading or alarming without context.**

1. **Logs in daily, goes straight to "Your build, financially"** (`ClientHome.jsx:113`).
2. **Reads six figures** rendered by `buildFinancialSnapshot` (`portalV2Routes.mjs:957`).
3. **Scrutinises every variation** in My Actions, reads "Why this variation was raised."
4. **Refreshes Messages all day** waiting for a reply that, per A-B2/X1, won't surface live.

**Break-points:**
- **D-B1 (S2):** **"Pending variations" is presented as a live dollar liability and will alarm.** `ClientHome.jsx:117` renders `pendingVariations` with a `+` sign next to approved ones. `buildFinancialSnapshot` sums `job_variations` with `status='sent_to_client'` (line 975). To an anxious client this reads as *"I already owe an extra $X"* for things they **haven't approved and might decline**. There is no copy distinguishing "proposed, not yet yours to pay" from committed cost. Daily, they watch a scary number.
- **D-B2 (S2):** **`currentContractTotal` excludes pending variations but the layout implies completeness, while "Claims outstanding" can exceed what's been approved → apparent contradiction.** `currentContractTotal = contractValue + approvedVariations` (line 990). But claims (`claimsOutstanding`, line 985) are summed independently from `progress_claims` and can reflect amounts the client hasn't reconciled against the contract total shown. An anxious client doing arithmetic across the six tiles will find they don't obviously sum, and there's no explanation. No "as at <date>" stamp either — they can't tell if it's stale.
- **D-B3 (S2):** **"Why we did it this way" is present in some places and conspicuously absent where it matters most for this persona.** It renders for updates (`ClientHome.jsx:147`, `ClientJourney.jsx:83`) and variations (`ClientActions.jsx:146`) — **but only if staff populated `builder_reasoning`.** It's a free-text field staff can leave null (`portalV2AdminRoutes.mjs:288` only sets it if provided). For an anxious client, a variation with a blank reasoning block is *more* alarming than no block at all — it looks like an unexplained charge. **There is no reasoning anywhere on the financial snapshot, claims, or selections cost-impact.** When a selection blows the allowance by +$4,000 (`ClientSelections.jsx:118`), there is zero "here's why this option costs more" copy.
- **D-B4 (S2):** **Confidence light has no provenance and can contradict reality.** `confidenceStyle` shows a green "On track" by default (`clientPortalUi.jsx:46`, the `default` case) — i.e. **absence of data renders as reassurance.** A project with no schedule sync (cron off, X2) shows green. An anxious client trusts green, then a delay blindsides them. Worse: confidence is set by `syncProjectMilestones` purely from task end-dates (`portalSync.mjs:74`); a single mis-dated task flips the whole stage to "Delayed" red with no note, spiking anxiety with no explanation.
- **D-B5 (S3):** **No read-receipt that the builder saw their message.** They send a worried question (emails admin), see no delivery/seen state, and refresh compulsively. The portal gives them nothing to hold onto.
- **Good (brief):** the variation detail correctly hides builder cost/margin (field allowlists `PORTAL_VARIATION_JOIN_FIELDS`, `portalV2Routes.mjs:46`) and shows inc-GST only. The rollback-on-failed-audit (line 416) protects the anxious client from a phantom approval. These are real and worth keeping.

---

## PERSONA E — Difficult client (never approves, misses meetings, ignores notifications). What visibility/escalation does the BUILDER get?

**Verdict: Almost none. The builder is flying blind. This is the most dangerous gap for Blue Leaf's commercial position.**

1. **Builder raises variation** → action created, **no client email** (X1). Client ignores it.
2. **Builder schedules a meeting** with `requestConfirmation` (`portalV2AdminRoutes.mjs:210`) → client action. Client ignores it. Meeting day passes with status still `scheduled` — **nobody is told the client never confirmed.**
3. **Selection goes overdue** → cron (if on) flags it red *in the client's view*. **The builder gets no alert.**
4. **Weeks pass. The build is now blocked on client inaction and the builder finds out by manually opening the admin overview — if they remember to.**

**Break-points:**
- **E-B1 (S1):** **There is NO escalation or reminder to the builder for an unactioned client.** Searched the server exhaustively: the only builder-facing emails are **reactive** — fired when the client *does* something (payment-notify `:542`, meeting *decline* `:801`, new message `:902`). There is **no job that detects "variation pending > N days," "selection overdue," or "meeting unconfirmed and date approaching" and emails the builder.** `portalSync` flags DB state but sends nothing to anyone. A difficult client can stall a project indefinitely and Blue Leaf's only signal is a human remembering to check `GET /overview` (`portalV2AdminRoutes.mjs:328`).
- **E-B2 (S1):** **An unconfirmed meeting is invisible.** A client who simply never taps "Confirm" leaves `portal_meetings.status='scheduled'` forever. Only an explicit **decline** emails admin (`portalV2Routes.mjs:801`). Silence (the difficult client's whole MO) produces no signal. The builder shows up to a site meeting the client never confirmed and may not attend.
- **E-B3 (S2):** **`GET /overview` shows open actions but not age or "stuck."** `portalV2AdminRoutes.mjs:339` returns `client_actions` in `('pending','viewed','overdue')` but the admin UI has no "oldest unactioned" sort, no per-client SLA, no "this client has 6 items pending for 30+ days" rollup. Even a diligent builder can't triage difficulty at a glance.
- **E-B4 (S2):** **No way to see whether the client has even logged in / viewed the item.** `portal_audit_logs` records `variation.viewed` (`portalV2Routes.mjs:346`) and `client_actions.status='viewed'` exists (set by `/actions/:id/view`, line 301) — but **no admin surface reads it back.** The builder can't distinguish "client saw the variation and is stalling" from "client never opened the portal." That distinction is everything when chasing a difficult client or building a paper trail for a dispute.
- **E-B5 (S2):** **Audit trail is one-sided and can't prove the client was given the chance to act.** Because no notification is ever sent to the client (X1), there is **no auditable record that the client was notified** of a variation/claim/meeting — only that the builder created it and (maybe) that the client viewed it. In a payment or delay dispute with a difficult client, Blue Leaf cannot evidence "we notified you on date X and you failed to respond." The audit log proves Blue Leaf's actions, not the client's notification.

---

## Quick-reference defect table

| ID | Persona(s) | Severity | One-liner | Anchor |
|----|-----------|----------|-----------|--------|
| X1 | All | S1 | No client notification of anything; `portal_notifications` never written; all emails go to admin | `portalV2Routes.mjs:542/801/902`, grep |
| X2 | All / B / D | S1 | Overdue-flagging + stage advance gated behind cron defaulting OFF, runs 1×/day | `dev-api.mjs:2240`, `portalSync.mjs:144` |
| X3 | All | S1 | Migration 103 not applied to sole prod DB; invite succeeds but every route 403s | `authRoutes.mjs:365`, `requirePortalAuth.mjs:57` |
| X4 | All | S2 | Project resolution depends on wide-open anon RLS on `projects` | `clientPortalApi.js:58`, `006_*.sql:109` |
| X5 | A / D | S2 | "Signed"/archived variation before any real signature exists | `portalV2Routes.mjs:427/437` |
| A-B1 | A / all | S2 | Journey/Home photos 100% broken for JWT clients (media endpoint is token-only) | `ClientJourney.jsx:97`, `portalRoutes.mjs:145` |
| A-B2 | A / C / D | S2 | Builder replies never appear without manual refresh; no polling/realtime | `ClientMessages.jsx`, grep |
| A-B3 | A | S3 | Google review link has empty `placeid` | `ClientMyHome.jsx:80` |
| B-B1 | B / E | S1 | Zero reminder cadence to client; binding items can rot for weeks | server-wide absence |
| B-B2 | B | S2 | Action feed shows no age/"waiting since" signal | `ClientActions.jsx:14` |
| B-B3 | B | S2 | Undated selections can never go overdue | `portalSync.mjs:144`, `portalV2AdminRoutes.mjs:116` |
| B-B4 | B / D | S2 | Stage/confidence freeze silently when cron off; no "last updated" | `ClientHome.jsx`, `portalSync.mjs` |
| C-B1 | C | S2 | No password-reset path in portal | `ClientPortalLayout.jsx:88` |
| C-B2 | C | S2 | Document download flaky on mobile; legacy `public_url` is permanent link | `ClientDocuments.jsx:25`, `portalV2Routes.mjs:725` |
| C-B3 | C | S2 | Selection action is a redirect dead-end, not an inline action | `ClientActions.jsx:101` |
| D-B1 | D | S2 | "Pending variations" shown as live liability; alarms anxious clients | `portalV2Routes.mjs:975`, `ClientHome.jsx:117` |
| D-B2 | D | S2 | Snapshot tiles don't reconcile; no "as at" date | `portalV2Routes.mjs:990` |
| D-B3 | D | S2 | `builder_reasoning` optional/null where it matters; none on $ snapshot | `portalV2AdminRoutes.mjs:288` |
| D-B4 | D / B | S2 | Confidence defaults to green "On track" on absence of data | `clientPortalUi.jsx:46` |
| E-B1 | E | S1 | No builder escalation/reminder for unactioned clients | server-wide absence |
| E-B2 | E | S1 | Unconfirmed (vs declined) meeting is invisible to builder | `portalV2Routes.mjs:781` only on decline |
| E-B3 | E | S2 | Admin overview has no action-age / stuck-client triage | `portalV2AdminRoutes.mjs:328` |
| E-B4 | E | S2 | View/login telemetry recorded but never surfaced to builder | `portalV2Routes.mjs:346` |
| E-B5 | E | S2 | Audit proves builder action, not client notification (dispute exposure) | `portal_audit_logs` usage |

## The two things to fix before any $2m client touches this
1. **Wire outbound notifications + a builder-side escalation/reminder job** (kills X1, B-B1, E-B1, E-B2). Without it the portal is a passive noticeboard that neither prompts the client nor protects the builder.
2. **Guarantee the sync cron is ON and verify the go-live migration order** (X2, X3), then **fix Journey/Home photos** (A-B1) so the emotional core actually renders.
