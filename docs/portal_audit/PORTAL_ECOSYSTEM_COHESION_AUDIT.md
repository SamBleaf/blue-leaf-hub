# Portal Ecosystem Cohesion Audit — Blue Leaf Hub

**Audit date:** 2026-06-22
**Scope:** Is the Client Portal v2 *and everything connected to it* fully operational end-to-end for a real $1–3M client build?
**Method:** Nine connection lanes, each independently audited, then adversarially re-verified against source. This report uses the **VERIFIED/confirmed** scores, not the optimistic first-pass scores. A representative sample of the highest-stakes refutations was re-checked against the live source tree during synthesis (see "Ground-truth spot-checks" below).

---

## Verdict

| | |
|---|---|
| **Weighted ecosystem cohesion score** | **52 / 100** |
| **GO-LIVE (fully operational end-to-end)?** | **NO** |
| **Single biggest gate** | Migrations **103, 104, 108, 110** are not confirmed applied to the live database. 108 and 110 are explicitly "Manual-apply". Per persisted project memory, live migrations are applied only through **102**. Until they are pasted in, multiple critical write paths fail their DB CHECK and degrade *unsafely* (the client-visible queue clears while the underlying decision stays approvable). |

**Why not higher:** The happy path of each finance lane works, identity carries through on a client's first project, and the data-leak / field-allowlist discipline is genuinely strong (no ex-GST, cost_to_builder, or margin reaches the client on any verified path). That floor is real. But three structural facts cap the score hard:

1. **The Documents tab is hollow.** No business write path ever makes a variation or progress-claim PDF appear in the client's Documents tab automatically — the only automatic `portal_documents` writer is dead code, and the real path requires a human to click *expose-document* by hand.
2. **The site-diary → Journey pillar is a dead-end.** The diary seeds a `status:'draft'` portal_updates row that no admin UI or API ever loads, edits, or publishes; the builder publishes from a blank form that INSERTs a fresh row. Diary photos never reach the Journey at all.
3. **Critical safety is migration-contingent and unapplied.** Voided variations remain client-approvable, disputed claims still accept a "paid" notification, and partial payments show as plain "invoiced" — all pre-108/110, with no nightly self-heal for the disputed drift.

**Why not lower:** This is not vaporware. The finance happy paths fire the correct hooks, the nightly reconcile genuinely self-heals dropped sent/issued/void/sign/paid hooks, RLS migration 104 correctly walls clients off business tables, and the field allowlists are airtight. The bones are sound; the connective tissue and the live-DB migration state are not.

---

## Scoring method

Lanes are weighted by what would actually break a real $1–3M build if it failed. Money movement, contract changes, the documents of record, getting the client *into* the portal, and being told when something needs them are load-bearing. Schedule milestones, diary photos, admin-UI completeness, and CRM handover are real but peripheral to "can we run a build through this".

| Lane | Confirmed score /10 | Weight | Contribution |
|---|---|---|---|
| Finance variations → Portal | 8 | 3.0 | 24.0 |
| Finance progress claims → Portal | 6 | 3.0 | 18.0 |
| Jobs/Operations documents → Portal Documents | 5 | 2.5 | 12.5 |
| Client invite → login → Portal access | 5 | 2.5 | 12.5 |
| Notifications (in-app + email) cohesion | 7 | 2.0 | 14.0 |
| Data integrity, shadow tables, graceful degradation | 8 | 2.0 | 16.0 |
| CRM + lead→client identity → Portal | 6 | 1.5 | 9.0 |
| Schedule → Portal Journey milestones | 7 | 1.0 | 7.0 |
| Site diary + photos → Portal Journey | 2 | 1.0 | 2.0 |
| **Weighted total** | | **20.6** | **115.0** |

Raw weighted average = 115.0 / 20.6 = **55.8 / 100**.

**Ruthlessness adjustment (−4):** Two of the five heavily-weighted lanes are *not end-to-end safe without an unapplied manual migration*, and the Documents lane is a "works only when a human mirrors data by hand" lane — the prompt's own definition of PARTIAL, not operational. A straight weighted average would launder these into a passing-looking number. Capping for the hollow Documents tab and the migration-contingent finance safety brings the cohesion score to **52 / 100**.

---

## Per-lane scorecard

| # | Lane | Score | End-to-end? | One-line state |
|---|---|---|---|---|
| 1 | Finance variations → Portal | **8/10** | NO | Happy path solid; **void block is contingent on unapplied migration 108** — pre-108 a client can approve a voided variation. |
| 2 | Finance progress claims → Portal | **6/10** | NO | Full-pay works; **partial/void/disputed/paid-to-date all need migrations 108/110** (unapplied); client can never re-notify a 2nd instalment. |
| 3 | Jobs/Ops documents → Portal Documents | **5/10** | NO | **No automatic path puts a PDF in the client's Documents tab**; auto-path is dead code; manual *expose-document* is the only route. |
| 4 | Client invite → login → access | **5/10** | NO | First-project happy path works; **repeat client cannot be onboarded (hard 409)**; whole chain needs migrations 103+104 (unapplied). |
| 5 | Notifications (in-app + email) | **7/10** | NO | Pipeline strong & deduped; **claim_paid + variation-approved never notify**; admin/builder notify paths skip the v2 gate. |
| 6 | Data integrity / shadow / degradation | **8/10** | NO | Self-healing nightly reconcile is real; **disputed drift has no reconcile branch**; one 503 guard misses the membership table. |
| 7 | CRM + lead→client identity → Portal | **6/10** | NO | Identity carries through; **practical_completion → past_client is entirely unbuilt**; reverse approval signal is email-to-inbox only. |
| 8 | Schedule → Portal Journey milestones | **7/10** | YES | Works but **batch-only (≤24h latency)**; confidenceNote fetched but not rendered on Journey. |
| 9 | Site diary + photos → Portal Journey | **2/10** | NO | **Diary draft is an orphaned row no UI publishes; diary photos never reach the Journey.** |

---

## Lane-by-lane confirmed findings (with file:line evidence)

### Lane 1 — Finance variations → Portal (8/10, not end-to-end)

**Operational (verified):**
- Variation send/sign/reject/void all fire the correct portal hook — `financeCCRoutes.mjs:1956` (`syncVariationSent`), `:2039` (`syncVariationSigned`), `:2055` (`syncVariationRejected`), `:2070` (`syncVariationVoided`).
- Rejected variations can be re-sent and re-open the client action — `financeCCRoutes.mjs:1941` allows `['draft','rejected']`; `upsertClientAction` re-opens at `portalIntegration.mjs:48-54`.
- No builder cost data leaks: `PORTAL_DECISION_FIELDS` / `PORTAL_VARIATION_JOIN_FIELDS` allowlists exclude `cost_delta`, `cost_to_builder`, `amount_ex_gst` — `portalV2Routes.mjs:36-49`. inc-GST sourced from GENERATED column (`migration 031:149-150`), never recomputed.
- Financial snapshot returns inc-GST only, skips voided/rejected — `portalV2Routes.mjs:1142-1217`.

**CONFIRMED DOWNGRADE — void safety is contingent, not guaranteed (critical):**
- Base `portal_decisions` CHECK lacks `withdrawn` — `027_client_portal.sql:60` = `CHECK (status IN ('pending','approved','declined','info_requested'))`. **Verified.**
- `syncVariationVoided` writes `status:'withdrawn'` — `portalIntegration.mjs:387`. **Verified.** Pre-108 this **violates the CHECK**; the error is only `console.warn`'d (`portalIntegration.mjs:389`) and the decision row stays `status='pending'`.
- The respond guard `if (decision.status !== 'pending')` (`portalV2Routes.mjs:458`, **verified**) plus the atomic `WHERE status='pending'` (`:481`) both **PASS** while the row is still pending → approval of a voided variation proceeds. The handler never re-checks canonical `job_variations.status`; no DB trigger syncs the two.
- Migration 108 is **"Manual-apply"** (`108:3`, **verified**); its own header admits the pre-108 behaviour leaves "a live Approve button on a cancelled variation".
- Worse than no-op: the client_actions card is cleared (`status='completed'`, `portalIntegration.mjs:392`) **even when the status write failed** — the My Actions queue *looks* resolved while the endpoint stays live. Unsafe degradation, not graceful.

---

### Lane 2 — Finance progress claims → Portal (6/10, not end-to-end)

**Operational (verified):** All four finance write paths fire the right hook — `financeCCRoutes.mjs:1270` (`syncClaimIssued`), `:1372` (paid), `:1393` (voided), `:1411` (disputed). Partial-payment SUM math correct (`portalIntegration.mjs:334-338`; snapshot caps paid, `portalV2Routes.mjs:1200-1209`). No cost leak.

**CONFIRMED DOWNGRADES:**
- **Everything beyond full-payment needs unapplied migrations.** Base claims CHECK = `status IN ('paid','invoiced','upcoming')` — `027:75-76` (**verified**). Pre-108, `syncClaimPaid` writing `status:'partially_paid'` (`portalIntegration.mjs:341`, **verified**) violates the CHECK; the write fails, is logged, claim stranded at `invoiced` with action still `pending`.
- **Client can never re-notify a second instalment.** `client_payment_notified_at` set once (`portalV2Routes.mjs:600`), never reset anywhere; payment-notify returns `alreadyNotified:true` (`:590-591`).
- **Payment-notify button has zero status awareness.** Button renders unconditionally (`ClientActions.jsx:250`); endpoint blocks only `status==='paid'` (`portalV2Routes.mjs:593`), not `void`/`disputed`. Normally the action card disappears on dispute/void (`portalIntegration.mjs:455-460`, `:423-428`) — defence-in-depth, but if that clear races/fails the locked claim still accepts a payment notification.
- **Disputed drift has no nightly recovery.** Reconcile (`portalSync.mjs:208-269`) re-fires sent/issued/void/signed/paid but **has no `disputed` branch** (grep confirmed). A dropped or pre-110 dispute leaves the claim at its prior status with no self-heal.

---

### Lane 3 — Jobs/Operations documents → Portal Documents (5/10, not end-to-end)

**CONFIRMED — the lane is PARTIAL, not operational:**
- **No automatic path puts a PDF in the client's Documents tab.** The client Documents tab reads only `portal_documents` (`portalV2Routes.mjs:747-760`). Finance writes the client PDF into `job_documents` (STAFF record) via `fileJobRecord register:true` — `financeCCRoutes.mjs:1275-1280` (claim), `:1960-1968` (variation) — never `portal_documents`. Getting it visible requires a human to click *expose-document* (`PortalV2Admin.jsx:212`).
- **The "automatic" archive path is DEAD CODE.** `syncVariationSigned` inserts a `portal_documents` row only if `jv.signed_document_url || jv.document_url` is set (`portalIntegration.mjs:165-166`, **verified**); `syncClaimIssued` only if `claim.document_url` is set (`:290`, **verified**). But `financeCCRoutes.mjs` writes those columns **zero times** — `grep document_url financeCCRoutes.mjs` = **0** (**verified**). The guards are always false; the inserts never run.
- **Manual registration is Dropbox-dependent and silent.** `fileJobRecord` early-returns `{skipped:'dropbox-not-configured'}` if Dropbox is off (`jobRecordsFiler.mjs:125`); the `job_documents` insert only runs after a successful upload (`:133-155`); the caller swallows failures with `.catch(()=>{})` (`financeCCRoutes.mjs:1968`). Dropbox is optional per CLAUDE.md.
- **Plan-extraction PDFs are NEVER auto-exposable.** Insert has no `storage_path` (`costIntelligenceRoutes.mjs:305-312`); *expose-document* always rejects them (`portalV2AdminRoutes.mjs:423`).
- **Contract is manual-only** by design (`portalV2AdminRoutes.mjs:475-497` register-document).
- **Second `portal_documents` writer lacks a tenant check** (latent, staff-only, currently unused by UI): `POST .../documents` (`portalV2AdminRoutes.mjs:344-368`) accepts a `jobDocumentId` and inserts with **no** `jd.job_id === project.job_id` check, allowing `storage_path: null` + `client_visible:true` — the exact cross-project leak / undownloadable-card *expose-document* (`:411-425`) was hardened against.

**Operational (verified):** Project-job bridge auto-created on win (`migration 096:50-52` unique index + trigger). *expose-document* tenant + storage validation correct (`portalV2AdminRoutes.mjs:411-425`). Dropbox download degrades to plain-English 502 (`portalV2Routes.mjs:793-807`). Field allowlists hold.

---

### Lane 4 — Client invite → login → Portal access (5/10, not end-to-end)

**CONFIRMED DOWNGRADES:**
- **Repeat clients cannot be onboarded — structural.** `/api/auth/invite` hard-409s on an existing `user_profiles` row (`authRoutes.mjs:116`, **verified** "A user with this email already exists"); accept-invite 409s likewise (`:274`, **verified**). No admin route creates a `project_client_users` link for an existing client — `portalV2AdminRoutes.mjs` has activate (`:545`) and read (`:619`) but **no create-link route** (**verified**). The multi-project design (`my-projects` returns an array, `resolveClientProjectId` picks among many) is dead code for the invite path. Repeat owners are common in construction.
- **Whole chain hard-depends on unapplied migrations 103 + 104.** 103 defines `project_client_users` / `portal_v2_enabled` / `portal_client_email`; 104 is the `user_profiles` self-read RLS exception that lets AuthContext resolve `role='client'`. Per persisted memory live migrations stop at 102. With 103 absent, accept-invite creates the auth user then the `project_client_users` upsert errors → 500 **after** the user exists (half-provisioned account, `authRoutes.mjs:362-378`). With 104 absent, business tables are anon-readable by the client's JWT.
- **Empty-state is a swallowed-error trap.** `/api/portal/my-projects` destructures only `data`, never `error` (`portalV2Routes.mjs:139`). A missing table or any DB error yields `200 {projects:[]}` — identical to a genuinely project-less client. No operator signal. Contrast `requirePortalAuth.mjs:69` which has an explicit pre-migration 503.

**Severity-corrected:** the unchecked `projects.update()` (`authRoutes.mjs:347-355`) is a real bug but **recoverable** via the admin settings PATCH (`portalV2AdminRoutes.mjs:31`) — medium, not the binding constraint. **NEW (minor):** invite never verifies the target project carries a non-null `job_id` bridge, so a client can log into a project whose finance reads all return empty.

**Operational (verified, clean security surface):** `is_active` enforcement (`requirePortalAuth.mjs:57`, `portalV2Routes.mjs:143`); branded Resend→Gmail→SMTP mail (`notifyMail.mjs:5-10`); absolute invite URL with localhost guard (`appUrl.mjs:20-27`); session endpoint whitelisted (`portalV2Routes.mjs:196-208`); migration 104 preserves the client's own-row read (`104:50-56`).

---

### Lane 5 — Notifications, in-app + email (7/10, not end-to-end)

**Operational (verified):** In-app writes one-per-day per user/type/entity via UNIQUE `dedup_day` (`migration 103:321-322`); read scoped to `target_user_id` (`portalV2Routes.mjs:1101-1107`); bell polls 30s + mark-read (`NotificationBell.jsx`). Resend→Gmail→SMTP transport. No cost leak in bodies. Nightly reconcile re-fires dropped sent/issued hooks.

**CONFIRMED DOWNGRADES:**
- **Admin/builder notify paths skip the v2 gate.** `notifyClient()` itself has no `portal_v2_enabled` check — it emails whenever `portal_client_email` is set (`portalNotify.mjs:31-94`). Admin v2 routes call it directly with **no gate**: `portalV2AdminRoutes.mjs:172/249/309/456` and `portalRoutes.mjs:740`. `grep portal_v2_enabled portalV2AdminRoutes.mjs` → only `31/52/615`, **none in a notify path** (**verified**). A staff member acting on a `portal_v2_enabled=false` project WILL email that client. (Task #16 "Enforce portal_v2_enabled on every boundary" is marked completed but is **not** enforced here.)
- **Two silent client-facing holes.** `syncClaimPaid` never calls `notifyClient` — grep over `portalIntegration.mjs:317-364` = **0** (**verified**): the client is never told their payment was received. And the `notification_type` CHECK (`103:215-218`, **verified**) omits `claim_paid`, so adding the call without widening the CHECK would silently fail the insert. `syncVariationSigned` (`portalIntegration.mjs:135-191`) approves the decision but never notifies — when the builder signs on the client's behalf, the client gets no confirmation.
- **Reconcile re-fire can duplicate.** A next-day re-fire produces a fresh `dedup_day` key (`portalNotify.mjs:43,64`), so a transiently-failed "issued" notification can appear twice.

---

### Lane 6 — Data integrity, shadow tables, graceful degradation (8/10, not end-to-end)

**Two prior "broken" findings were FABRICATED and are dismissed:** the variation **reject endpoint exists** — `financeCCRoutes.mjs:2045` `POST .../variations/:vid/reject` updates `status='rejected'` and calls `syncVariationRejected` (`:2055`, **verified**). Void/reject are symmetric. The "client sees it pending forever" scenario cannot occur.

**Operational (verified):** Field allowlists prevent cost leak (`portalV2Routes.mjs:36-68`). Self-healing nightly reconcile re-fires missing/drifted hooks (`portalSync.mjs:208-269`), wired live at `dev-api.mjs:2281` (`setInterval(portalTick, …)`) + manual trigger `:1580` (**verified**). RLS 104 gates clients off business tables (key tables verified RLS-enabled).

**CONFIRMED DOWNGRADES:**
- **503 degradation is incomplete.** `requirePortalAuth.mjs:49-54` destructures only `{data: pcu}` (no error) on the `project_client_users` read; a missing table (pre-103) returns **403 "No access"**, not the friendly 503 (which only covers the later projects SELECT, `:69-71`).
- **RLS protection is conditional, not absolute.** The deny-clients loop touches only tables with `relrowsecurity=true` (`104:65-79`); any sensitive table created without `ENABLE ROW LEVEL SECURITY` is silently skipped. Live risk contained (key tables verified enabled) but the guarantee is conditional.
- **syncClaimDisputed torn state pre-110.** Combined `status='disputed'` + `dispute_reason` update fails (CHECK + missing column), is swallowed, yet the client_actions clear still succeeds (`portalIntegration.mjs:455-460`) → action cleared but claim still shows `invoiced`, payment-notify still open, and **no reconcile branch** heals it.

---

### Lane 7 — CRM + lead→client identity → Portal (6/10, not end-to-end)

**Operational (verified):** Identity carries lead→job→project on conversion (`salesRoutes.mjs:274-275`) and win-finalize (`module4Routes.mjs:327-328`); invite-login backfills name/email (`authRoutes.mjs:350-351`). No cost leak (the real vector — `portal_decisions.cost_delta` carries ex-GST, `portalIntegration.mjs:99` — is contained only because the allowlist omits it; **allowlist-fragile**).

**CONFIRMED DOWNGRADES:**
- **Practical-completion → past_client handover is ENTIRELY UNBUILT.** `grep past_client server/lib/` = **0** (**verified**). `build_phase='practical_completion'` is reachable only via a bare admin PATCH (`portalV2AdminRoutes.mjs:32-37`) that fires no notify, no milestone, no CRM contact. No "Your home is complete" notification, no My Home routing, no `past_client` row, no 3-/12-month follow-up seed. (Migration 061 defines the enum + smart-list but nothing populates it.)
- **Nightly backfill always-on path exists but identity can still be NULL.** An in-process `setInterval` exists (`dev-api.mjs:2281`), plus the cron endpoint (`:1573-1585`). A leadless/emailless client (`salesRoutes.mjs:250,274` allow null) leaves identity NULL forever and gets in-app but **no email** nudges (`portalNotify.mjs:72`).
- **Reverse approval signal is inbox-only.** Client approve/decline emails `admin@blueleafbuilding.com.au` (`portalV2Routes.mjs:512-518`) — no finance action-queue row, no builder task. A human must read the inbox and remember to go sign in Finance. (Task #24 "Reverse path → tracked Finance action" is marked completed but the tracked-action write does not exist.)

---

### Lane 8 — Schedule → Portal Journey milestones (7/10, end-to-end on its batch path)

**Operational (verified):** Phase→milestone mapping, confidence computation, is_current dedup guard, overdue-selection flagging, finance reconcile, portal_v2 gate, no cost leak — all correct (`portalSync.mjs:40-298`).

**CONFIRMED DOWNGRADES:**
- **Batch-only, ≤24h latency.** No schedule write path is event-driven; `module6Routes.mjs` never touches portal milestones (grep empty). The client sees a day-stale Journey by design.
- **confidenceNote rendered on Home but NOT on Journey.** Backend returns it (`portalV2Routes.mjs:972`); Home renders it (`ClientHome.jsx:87-89`); Journey shows only the colour chip (`ClientJourney.jsx:74-78`), no reason text. (Task #27 "Confidence note populate + Journey rendering" is marked completed but the Journey-rendering half was never done.)
- **Journey photos depend on unapplied migration 110.** `.eq('client_visible', true)` on `project_photos` (`portalV2Routes.mjs:993`); the column is added by manual-apply 110 (`110:24`). Degrades to empty (not 500) only because the supabase-js error is discarded in-band.

---

### Lane 9 — Site diary + photos → Portal Journey (2/10, broken end-to-end)

**CONFIRMED — the one prior "operational" pillar is a dead-end:**
- **Diary draft → /dev/null.** `syncDiaryToPortalUpdate` inserts `{published:false, status:'draft'}` (`portalIntegration.mjs:510-518`, **verified** `status:"draft"` at `:517`). The only v2 write to `portal_updates` is an INSERT of a fresh row (`portalV2AdminRoutes.mjs:293`, **verified** — the sole occurrence). There is **no PATCH/publish-by-id** endpoint; the admin "Weekly update" form initialises blank and posts a new insert (`PortalV2Admin.jsx:342-365`); the admin overview never SELECTs `portal_updates`, so existing drafts are never fetched. The seeded draft is an orphaned row no human or API ever publishes.
- **Diary photos never reach the Journey.** `site_diary.photo_paths` is never populated by the diary routes (`siteDiaryRoutes.mjs:70-135`); no pipeline converts those paths into `project_photos` rows with a `milestone_key`. Photos appear on a stage only after a TWO-step manual admin gate (tag `milestone_key` + flip `client_visible=true`), with zero derivation from diary context.

**Corrections to prior over-statements:** Pre-110 the Journey does **not** 500 — the photos query discards the error and yields `[]` (`portalV2Routes.mjs:989-996`). Migration 110 `client_visible DEFAULT false` is genuinely safe (project_photos had no such column pre-110). The media route validates membership but **not** `client_visible` (`portalV2Routes.mjs:174-179`) — a client can stream any photo in their own project by UUID, bounded LOW (random UUIDs, Journey only returns visible ids).

---

## Ground-truth spot-checks performed during synthesis

| Claim | Result |
|---|---|
| `027:60` portal_decisions CHECK lacks `withdrawn` | Confirmed |
| `syncVariationVoided` writes `withdrawn`; respond guard is `!== 'pending'` | Confirmed (`portalIntegration.mjs:387`, `portalV2Routes.mjs:458`) |
| Migration 108 + 110 are "Manual-apply" | Confirmed (108:3, 110 header) |
| `financeCCRoutes.mjs` writes `document_url`/`signed_document_url` 0 times (dead doc auto-path) | Confirmed (grep = 0) |
| Diary seeds `status:"draft"`; only v2 `portal_updates` write is a fresh INSERT | Confirmed (`:517`, `portalV2AdminRoutes.mjs:293`) |
| Invite/accept hard-409 on existing user | Confirmed (`authRoutes.mjs:116,274`) |
| `syncClaimPaid` calls `notifyClient` 0 times; CHECK omits `claim_paid` | Confirmed |
| `027:75-76` claims CHECK lacks `partially_paid`/`disputed` | Confirmed |
| Admin v2 notify paths have no `portal_v2_enabled` gate | Confirmed (refs only at 31/52/615) |
| `past_client` absent from server/lib | Confirmed (grep = 0) |
| No `project_client_users` create-link route in admin v2 | Confirmed |
| Variation reject endpoint EXISTS (prior "broken" finding fabricated) | Confirmed (`financeCCRoutes.mjs:2045`) |
| In-process nightly `setInterval` exists (not cron-only) | Confirmed (`dev-api.mjs:2281`) |
| Migration files 103/103b/104/108/110 all present on disk | Confirmed |

**Task-tracking integrity note:** tasks #16, #24, #27 are marked *completed* but the code refutes each (v2 gate not on notify paths; reverse-path finance action not written; Journey confidenceNote not rendered). The task list overstates done-ness on these three.

---

## Ranked blocker list (deduped cross-lane) — what stands between today and >90/100

> Ordered by what most blocks "fully operational end-to-end". Each is a real, verified gap with a concrete fix.

### B1 — CRITICAL · Apply migrations 103, 104, 108, 110 to the live database
**Lanes:** all finance, invite/auth, data-integrity, journey-photos.
**What breaks:** Pre-103/104 the entire portal-v2 auth chain half-provisions accounts and leaves business tables anon-readable. Pre-108 voided variations stay client-approvable and partial/paid-to-date writes fail. Pre-110 disputed claims and `client_visible` photos error/silently-fail. 108 and 110 are flagged "Manual-apply"; live DB is at 102.
**Fix:** Paste 103, 103b, 104, 108, 110 into the Supabase SQL editor (idempotent, safe to re-run). Then run a live E2E pass. This single gate unblocks four heavily-weighted lanes at once. **Do this first.**

### B2 — CRITICAL · Wire variations & claims into the client Documents tab automatically
**Lanes:** Documents (3), variations (1), claims (2).
**What breaks:** No business write path makes a variation/claim PDF appear in the client's Documents tab; the auto-path is dead code (`document_url` never written); the documents of record only appear if a human clicks *expose-document*.
**Fix:** Either (a) have Finance write the filed PDF's storage path onto `job_variations.signed_document_url` / `progress_claims.document_url` so the existing `portal_documents` inserts (`portalIntegration.mjs:166,290`) actually fire; or (b) call an `exposeDocument`-equivalent inside those sync functions to insert a `portal_documents` row directly. Then close the second-writer hole: add `jd.job_id === project.job_id` + non-null `storage_path` checks to `POST .../documents` (`portalV2AdminRoutes.mjs:344-368`).

### B3 — CRITICAL · Build the site-diary → Journey publish + photo pipeline (or cut the feature)
**Lane:** 9.
**What breaks:** The diary-seeded draft update is never publishable (no PATCH/publish-by-id; admin publishes a fresh blank insert). Diary photos never reach the Journey.
**Fix:** Add `PATCH /api/portal/admin/v2/:projectId/updates/:id` (set `published=true`) and have the admin overview SELECT + render existing `portal_updates` drafts for edit/publish. Add `syncDiaryPhotosToJourney` that reads `site_diary.photo_paths`, creates `project_photos` rows with `milestone_key` from the current milestone and `client_visible=false`, called after diary save. If neither is in launch scope, **remove the diary→portal seed** so it doesn't imply a feature that doesn't work.

### B4 — HIGH · Support repeat-client onboarding (second project)
**Lane:** 4.
**What breaks:** A returning owner hard-409s at invite/accept; no route links an existing client to a new project. The multi-project portal design is unreachable.
**Fix:** Add `POST /api/portal/admin/v2/:projectId/client-users` that, given an existing user's email, creates an active `project_client_users` link (and sets `portal_client_name/email` on the project) **without** going through user creation. Branch `/api/auth/invite`: if `user_profiles` already exists, create the link instead of 409.

### B5 — HIGH · Block payment-notify / approval on void & disputed states (app-level defence-in-depth)
**Lanes:** claims (2), variations (1), data-integrity (6).
**What breaks:** The "I've transferred payment" button is status-blind; payment-notify blocks only `paid`; the variation respond guard never re-checks canonical `job_variations.status`. These are the app-level backstops that should hold *even if* B1's migrations lag.
**Fix:** In `portalV2Routes.mjs:593` change to `if (['paid','disputed','void'].includes(claim.status))`. In the variation respond handler, join and re-check `job_variations.status NOT IN ('void','rejected')` before accepting an approval. Gate the `ClientActions.jsx` button on `claim.status`.

### B6 — HIGH · Fire client notifications on payment-received and variation-approved
**Lane:** 5.
**What breaks:** Client is never told a payment was received or a variation approved (when builder signs on their behalf) — asymmetric pipeline.
**Fix:** Add `'claim_paid'` (and `'variation_approved'`) to the `notification_type` CHECK (`103:215-218`, ship in the 108/110 paste), then call `notifyClient` in `syncClaimPaid` (after the `paid` branch) and `syncVariationSigned`.

### B7 — HIGH · Enforce portal_v2_enabled on the admin/builder notify boundary
**Lane:** 5.
**What breaks:** Staff actions on a non-v2 project email the client and write `portal_notifications`, bypassing the gate task #16 claims is enforced.
**Fix:** Add a `portal_v2_enabled` guard inside `notifyClient()` itself (single chokepoint), or at each admin caller (`portalV2AdminRoutes.mjs:172/249/309/456`, `portalRoutes.mjs:740`). Re-verify task #16.

### B8 — MEDIUM · Build practical-completion → past_client handover orchestration
**Lane:** 7.
**What breaks:** No "your home is complete" notification, no My Home routing, no `past_client` CRM row, no follow-up seed — the entire post-handover lane is absent.
**Fix:** On `build_phase → 'practical_completion'`: insert a `crm_contacts` row (`status='past_client'`, name/email from `portal_client_*`, `linked_job_id`), send a `notifyClient` completion message, mark a completion milestone, route the client to My Home. Add `past_client_since` to drive 3-/12-month check-ins.

### B9 — MEDIUM · Add a disputed branch to the nightly reconcile + fix the membership 503 guard
**Lanes:** 6, 2.
**What breaks:** A dropped/pre-110 dispute is the one drift the safety net never heals; a pre-103 missing membership table returns 403 instead of the friendly 503.
**Fix:** Add a `disputed` re-fire branch to `syncProjectFinanceReconcile` (`portalSync.mjs:208-269`). Capture and inspect the `error` on the `project_client_users` read in `requirePortalAuth.mjs:49-54` and return 503 on `42P01`/`42703`.

### B10 — LOW · Render confidenceNote on Journey; reset re-notify; admin v2 edit/create UIs
**Lanes:** 8, 2, admin-v2.
**What breaks:** Journey shows a colour with no reason; client can't re-notify a 2nd instalment; staff can't edit milestones/selections/meetings/builder_reasoning post-create from the v2 tab.
**Fix:** Add `stage.confidenceNote` render to `ClientJourney.jsx`. Reset `client_payment_notified_at` to null when a new instalment is recorded. Wire the existing PATCH endpoints (`milestones:93`, `selections:185`, `meetings:263`, `decisions:324`) to edit controls in `PortalV2Admin.jsx`; add a `POST .../selections/:id/options` route.

---

## What's genuinely solid (keep)

- **Field-allowlist discipline** — no `cost_to_builder`, `amount_ex_gst`, `cost_delta`, or margin reaches the client on any verified read path. inc-GST always from the GENERATED column.
- **Finance happy-path hooks** — send/sign/reject/void variations and issue/pay/void/dispute claims all fire the correct sync with `.catch` isolation so Finance never 500s on a portal failure.
- **Self-healing nightly reconcile** — genuinely re-creates dropped sent/issued/void/sign/paid shadows (its one blind spot is `disputed`, see B9).
- **RLS migration 104** — correctly walls clients off business tables (conditional on RLS-enablement, verified for the key tables).
- **Variation reject path** — exists and is symmetric with void (two prior "broken" findings were fabricated).

---

## Bottom line

The portal's **security and data-leak posture is launch-grade**, and the finance **happy paths work**. But "fully operational end-to-end" is **NO**: the documents of record never reach the client automatically, the diary→Journey feature is a dead-end, repeat clients can't be onboarded, and the critical contract/payment safety depends on **four migrations not confirmed applied to the live DB — two of them manual-apply**. Clear B1 (apply migrations) and B2–B3 (Documents + diary) and the cohesion score moves from **52** toward the high-70s; B4–B7 take it past 90.
