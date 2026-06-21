# Client Portal v2 — Hostile UX Review

**Reviewer stance:** Red-team. Assume a real $2m client (and a difficult one) is logging in for the first time. Every claim is grounded in the actual code (`file:component`). The 10-second test asks: within 10 seconds of landing, can a first-time client find **project status, next milestone, action required, latest photos, pending approvals?**

**Files reviewed:** `ClientPortalLayout.jsx`, `ClientHome.jsx`, `ClientActions.jsx`, `ClientJourney.jsx`, `ClientSelections.jsx`, `ClientDocuments.jsx`, `ClientMessages.jsx`, `ClientMyHome.jsx`, `clientPortalUi.jsx`, `clientPortalContext.js`, `clientPortalApi.js`, `PortalV2Admin.jsx`.

---

## Severity legend

- **S1 Critical** — money/legal/contract risk, data leakage, or a dead-end that strands a paying client.
- **S2 High** — a real client will be confused, blocked, or misled; fails the 10-second test.
- **S3 Medium** — friction, polish, responsive breakage on a real device.
- **S4 Low** — cosmetic / nice-to-have.

---

## Summary scorecard

| Screen | 10-sec test pass? | Top issues (device) | Worst severity |
|---|---|---|---|
| Home (`ClientHome.jsx`) | **PARTIAL** | Status buried below greeting; financial grid cramped on mobile; no pending-approval surfacing; photos not on Home | **S1** (financial leakage risk + approval ambiguity) |
| My Actions (`ClientActions.jsx`) | **FAIL** | Approve = contract-binding but framed casually; no confirm step; "I've transferred payment" self-attestation; decline has no reason capture | **S1** |
| Project Journey (`ClientJourney.jsx`) | **PARTIAL** | Photos hidden behind accordion; broken images vanish silently; no lightbox; no captions shown | **S2** |
| Selections (`ClientSelections.jsx`) | **FAIL** | One-tap irreversible "Choose" with cost impact, no confirm; "Price on request" dead-end; over-allowance framing | **S1** |
| Documents (`ClientDocuments.jsx`) | **PARTIAL** | "Signature required" is a dead label (no sign action); download UX inconsistent; no search/preview | **S2** |
| Messages (`ClientMessages.jsx`) | **FAIL** | `h-[calc(100vh-12rem)]` collides with mobile bottom nav; Enter-to-send eats multi-line; no delivery/read state; polling absent | **S2** |
| My Home (`ClientMyHome.jsx`) | **PARTIAL** | Broken Google review link (`placeid=` empty); referral ask can appear on a defects-laden handover | **S2** |
| Admin (`PortalV2Admin.jsx`) | n/a (internal) | Raw JSON textarea for team; no validation on selections/variations; builder-centric | **S2** |

**UX-FAILURE count (screens failing the 10-second test outright): 3** — My Actions, Selections, Messages. A further 5 screens score PARTIAL with at least one S1/S2 defect.

---

## Cross-cutting failures (hit every screen)

### X1 — No global "what needs me right now" surface above the fold. **S2**
The layout (`ClientPortalLayout.jsx`) renders only a nav + `<Outlet/>`. There is **no persistent action/approval badge** in the chrome. The mobile bottom nav (`ClientPortalLayout.jsx` bottom `<nav>`) shows "Actions" with no count bubble, even though `ClientHome` already knows `home.actionCount` and `home.unreadMessages`. A client with a pending $40k variation sees an unadorned "Actions" tab. The single most important number in the whole product is not in the chrome. **Fix:** badge the Actions and Messages nav items with counts from the session/home payload.

### X2 — Every page is an independent fetch with no shared cache; no optimistic state; no cross-tab refresh. **S3**
Each page calls `portalGet` in its own `useEffect` (`ClientHome:33`, `ClientActions:33`, `ClientJourney:21`, etc.). After a client approves a variation in `ClientActions`, the `home.actionCount` on Home is stale until a full reload. The `refreshSession` in context (`clientPortalContext.js`) is never called by any child page. **Fix:** invalidate Home/session after any mutating action.

### X3 — Error copy leaks raw server strings. **S2 (borderline S1 data-leak)**
`ErrorBox` (`clientPortalUi.jsx:64`) renders `{error}` verbatim. `resolveClientProjectId` (`clientPortalApi.js:70`) returns `error.message` straight from Supabase/Postgres. A client can be shown a raw DB error (column names, RLS policy text). This violates the repo's own "Raw Postgres strings must never reach the browser" law (CLAUDE.md). **Fix:** map to plain-English copy before display.

### X4 — No loading skeleton on the layout's project resolve; full-screen takeover. **S3**
`ClientPortalLayout.jsx:91` shows a full-screen `BrandLoading` on every session resolve — including the `nonce`-driven refresh. If `refreshSession` is ever wired, the entire portal flashes to a loading screen. The per-page `Loading` (`clientPortalUi.jsx:52`) is fine, but the layout-level one is heavy-handed.

### X5 — `confidenceStyle` default is dangerously optimistic. **S2**
`confidenceStyle` (`clientPortalUi.jsx:40`) returns **green "On track"** for ANY value that isn't exactly `"delayed"` or `"watch"` — including `null`, `undefined`, `""`, or a typo. A milestone with no confidence set renders a reassuring green "On track" chip to the client. For a build that is actually slipping but un-tagged, this is a **client-dispute risk** ("your own portal said On Track"). **Fix:** default to a neutral "—"/grey state when confidence is absent.

### X6 — `fmtDate` silently coerces; `daysUntil` off-by-timezone. **S3**
`fmtDate` (`clientPortalUi.jsx:23`) returns `"—"` for bad input — so a malformed ETA shows as a dash with no explanation. `daysUntil` (`:31`) anchors to local noon but `new Date(\`${slice(0,10)}T12:00:00\`)` is parsed in local time while server dates may be UTC — "Due tomorrow" can be wrong by a day across the date line / DST. For a "order by X to avoid a delay" deadline (`ClientSelections.jsx:109`) that drives money, off-by-one is real.

### X7 — Builder-centric jargon throughout. **S3**
"Variations", "Progress claim", "EOT / days", "Practical Completion", "fixing stage" (`ClientSelections.jsx:109`), "Lock-up", "Rough-in" (folder/stage keys) all leak. A first-time owner-builder client does not know "variation" = "change to contract price" or "progress claim" = "invoice". No glossary, no tooltips. **Fix:** plain-English labels + one-line "what this means" helper text on first encounter.

---

## Screen-by-screen

### 1. Home — `ClientHome.jsx`

**10-sec test: PARTIAL.** Status is present but **below** a multi-line synthesized greeting (`greeting()` at `:8`), so on mobile the client scrolls past prose before seeing the progress bar. Pending approvals are **not** surfaced on Home at all — only a generic "{n} actions need your attention" (`:102`); a client cannot tell from Home that one of those is a contract-binding variation. Latest photos are **not on Home** — they live only inside the Journey accordion. So of the five 10-sec targets, Home delivers status + next milestone + action-count, and **fails** "latest photos" and "pending approvals" (specifically).

**S1 — Financial snapshot is a leakage + dispute surface.** The grid (`:113`-`:123`) shows Contract value, Approved/Pending variations, Claims paid/outstanding, Current total. The comment says "inc-GST only — never builder cost," but:
- `Money` (`:191`) renders whatever the API sends. There is **no client-side guard** that the API actually stripped cost/margin — the safety is entirely server-side and invisible here. If the aggregate ever regresses, margin leaks to the client with zero UI tripwire.
- "Pending variations" shown as a dollar figure (`:117`) implies a number the client may read as **owed or committed** before they've approved anything. A difficult client will screenshot "Pending variations +$38,000" and argue they never agreed to it.
- No "as at {date}" stamp on the financial card. A $2m client reconciling against their own spreadsheet has no idea how fresh these figures are. Money shown without an as-at date is a dispute waiting to happen.

**S2 — Financial grid breaks on narrow screens.** `grid-cols-2 ... sm:grid-cols-3` (`:114`). At `<640px` it's 2 columns. "Approved variations" with a value like `+$128,500` plus the `sign`/`strong` styling will wrap awkwardly; `Current total` uses `text-base font-bold` (`:197`) — on a 320px iPhone SE the 2-col layout with six rows is cramped and the bold total doesn't visually separate from the rest. There is no responsive reflow to a single-column definition list.

**S2 — Greeting can produce a wall of text or a bare line.** `greeting()` (`:8`) concatenates up to 5 lines. In pre-construction with no `latestUpdate`/`nextAction`, it can be a single generic sentence; mid-build it can be 5 stacked paragraphs pushing everything below the fold on mobile. It also assumes `clientName.split(" ")[0]` is a first name (`:9`) — for a compound client ("John & Mary Smith", which MEMORY notes is the canonical name form) this greets "Good morning, John" and silently erases Mary. **Personalization that drops a co-owner is worse than none.**

**S3 — "Why we did it this way" is builder-voice.** `:147` surfaces `builderReasoning` under an uppercase label. Good intent (transparency) but the framing is internal-ops language.

**S3 — Team directory has no contact affordance.** `:160` renders initials + name + role but **no phone/email/message link**. A client who wants to reach their Site Supervisor sees a name and a dead avatar. Contrast with `ClientMyHome` which does expose mailto. Dead-end.

**S4 — Empty financial values render "—".** Fine, but six dashes in pre-construction looks broken rather than "not yet". An explicit "Set at contract signing" would read better.

---

### 2. My Actions — `ClientActions.jsx` — **UX FAILURE**

**10-sec test: FAIL.** The list is scannable, but the **actions themselves are contract-grade decisions wrapped in lightweight UI**, and a first-timer cannot tell a reversible task ("confirm a meeting") from an irreversible binding one ("approve a $40k variation") — they look identical (same card, same accordion).

**S1 — Variation approval is legally binding with no confirmation step and ambiguous authority.** `VariationAction` (`:113`):
- Clicking **Approve** (`:172`) fires `respond("approve")` immediately — **no "Are you sure?" modal, no typed confirmation, no checkbox "I understand this changes my contract price by $X".** One stray tap on mobile commits the client to a cost + time change.
- The disclaimer (`:164`) — "Your approval is recorded with a timestamp and your account details. Blue Leaf will issue a signed variation document separately." — is doing enormous legal work in 11pt muted text **below** the buttons (it's at `:164`, buttons at `:168`). A difficult client will argue the portal click was not informed consent. For a $2m contract this is the single highest legal-risk control in the app and it has the weakest UI.
- **Authority ambiguity:** any logged-in client account can approve. If "John & Mary" share a login, or if an assistant has access, there's no record of *which human* approved, only "account details." No re-auth, no signature.
- The note field (`:157`) is optional and **shared between approve and decline** — a client who declines with a note expects a conversation, but decline just records and closes (`onDone`). No guarantee the builder sees the note as a message.

**S1 — "I've transferred payment" is unverified self-attestation that closes a financial action.** `ClaimAction.notifyPaid` (`:192`) posts `payment-notify` and shows "Thanks — we've been notified and will confirm receipt" (`:218`), then the action disappears (`setTimeout(onDone, 1200)`). Problems:
- The client can tap "I've transferred payment" **without having paid**; the action clears from their list, so they lose their own reminder. The builder gets a notification that may be false. This creates a reconciliation gap on a progress claim — i.e. real money.
- The invoice download (`:213`) is optional (`c.documentUrl` may be absent) — a client may be asked to pay a "progress claim" with **no invoice document and only `paymentInstructions` free-text** (`:210`). Paying bank details rendered from a free-text field is a textbook payment-redirection-fraud surface; there's no verified-payee control.

**S2 — Decline paths capture no structured reason and risk a silent dead-end.** Both `VariationAction` decline (`:169`) and `MeetingAction` decline (`:249` "I can't make it") record and close. Meeting decline shows "Sam has been notified" (`:238`, hardcoded name fallback) — but if the client *can't* make it, there's **no reschedule flow, no propose-new-time**. It's a dead-end: the client said no and now nothing happens on their screen.

**S2 — `selection_decision` action is a redirect, not an action.** `:101` just links to the Selections board. So an item in "My Actions" (the place "everything that needs a decision from you") bounces the client to another tab — breaking the page's own promise of "in one place" (`PageTitle sub`, `:45`).

**S3 — Completed list capped at 12 with no "show more".** `:80` `.slice(0, 12)`. A long build's audit trail of past approvals is truncated with no way to see the rest — and this is exactly the history a disputing client wants.

**S3 — No per-action error recovery on the accordion.** If `portalGet variations/:id` fails (`:120`), `VariationAction` shows `ErrorBox` with no retry (`:135`) — the outer list has retry, the inner detail does not.

---

### 3. Project Journey — `ClientJourney.jsx`

**10-sec test: PARTIAL.** The timeline reads well and the current stage auto-opens (`:25`). But **photos — one of the five 10-sec targets — are buried**: they only render inside an expanded stage (`:92`), and only the current stage is open by default. A client wanting "latest photos" must know to tap the right stage. There's no "all photos" or "latest photos" view anywhere in the portal.

**S2 — Broken images vanish with zero feedback.** `:101` `onError` sets `display:none`. A failed signed-URL or deleted media just **disappears** — the grid silently shrinks. The client never knows a photo was meant to be there; the builder never learns the link is broken. For a portal whose emotional payoff is "watch your home being built," silently eating photos is a real letdown and a support-ticket generator.

**S2 — No lightbox / full-size view / captions.** Photos are `aspect-square object-cover` thumbnails (`:95`) with the caption only as `alt` text (`:98`) — never visible. A client cannot tap to enlarge, cannot read what they're looking at, cannot download. `object-cover` crops; a proud "here's your kitchen" shot gets center-cropped to a square with no escape.

**S3 — `/api/portal/media/:id` is an unauthenticated-looking `<img src>`.** `:97` uses a bare `src` with no token. Either the endpoint is public (data-exposure risk if IDs are guessable) or it relies on cookies — but the rest of the portal uses Bearer tokens (`clientPortalApi.js`). This is an auth inconsistency worth confirming server-side; if media IDs are sequential UUIv... or integers, that's a leak.

**S3 — Mobile photo grid is `grid-cols-3`.** `:93` `grid-cols-3 sm:grid-cols-4`. On a 320px screen, 3 columns with `gap-2` makes each thumbnail ~95px — too small to make out detail, and no tap-to-zoom (see above) means they're effectively decorative.

**S4 — "Upcoming" with no ETA reads as "Upcoming" twice.** `:60` falls back to bare "Upcoming" when no `eta` — fine, but combined with `stagePreview` only showing when expanded, an upcoming stage is information-thin.

---

### 4. Selections — `ClientSelections.jsx` — **UX FAILURE**

**10-sec test: FAIL.** A client cannot tell, at a glance, which selections are **urgent/overdue and cost money** vs. informational. Worse, the core interaction is irreversible and unconfirmed.

**S1 — One-tap "Choose" is irreversible, money-moving, and unconfirmed.** `choose(optionId)` (`:84`) fires on tap of the "Choose" button (`:143`) — **no confirmation, no review-before-commit.** The option may be **over allowance** (the UI even computes `+$X over allowance`, `:139`), so a single tap can add thousands to the contract. After choosing, the card flips to "decided" (`:113`) and **the client can no longer change it from the portal** — there is no "change my selection" path. A fat-fingered tap on mobile permanently picks the wrong tile and silently increases cost. This is the same class of risk as the variation approve, with even less ceremony.

**S1 — Cost impact of a choice is not summarized before commit.** When a client picks an over-allowance option, nothing says "this will add $X to your contract — confirm?" The `costImpact` (`:117`) is only shown *after* the decision. The client commits blind to the contract-level consequence.

**S2 — "Price on request" is a dead-end.** `:138` renders "Price on request" with a live **"Choose"** button next to it (`:143`). A client can select an option **with no price**, committing to an unknown cost. There is no "request a quote" flow — just a Choose button on a priceless option. Either disable Choose or route to a quote request.

**S2 — Status taxonomy is builder-internal.** `STATUS_LABEL` (`:6`) maps `in_review → "With Blue Leaf"`, `awaiting_client → "Awaiting your decision"`, plus `ordered`/`installed`. But the **"decided" grouping** (`:79`) lumps `in_review` with `approved/ordered/installed` — so an item the builder is still reviewing shows the client a locked "Chosen: X" card as if final. Confusing: did I decide, or is it still pending?

**S2 — Deadline copy is alarmist and jargon-laden.** `:109` "Order by {date} to avoid a delay to the fixing stage." "Fixing stage" is jargon; "avoid a delay" is a pressure tactic with no detail on *how much* delay or cost. And it relies on `daysUntil`/`fmtDate` which (X6) can be off by a day.

**S3 — Category filter only appears with >2 categories.** `:50` `categories.length > 2`. With exactly 2 categories there's no filter and no category headers in the list either — items from different rooms are an undifferentiated stack.

**S3 — No per-option imagery.** Choosing a "Splashback Tile" by text label + price only (`:133`), with no swatch/photo, is a poor selections experience for a premium client. Real selection tools show the product.

---

### 5. Documents — `ClientDocuments.jsx`

**10-sec test: PARTIAL (it's a reference screen, not a status screen).** Folders are clear. But it fails its own implied promise around signatures and search.

**S1/S2 — "Signature required" is a dead label.** `:95` renders "· Signature required" when `doc.signatureRequired && !doc.signedAt`, but the **only action is "Download"** (`:98`). There is **no way to sign** in the portal. A client is told a document needs their signature, downloads it, and then... has to print/scan/email out-of-band? For a building **contract** this is the critical path of the whole engagement and the portal dead-ends it. If e-sign is handled elsewhere, the label is misleading; if it's meant to be here, it's missing.

**S2 — Download UX is opaque and inconsistent.** `downloadDoc` (`:25`) either opens a signed URL in a new tab OR force-downloads a blob (`:38`). The button says "Download" but for JSON+signedUrl it actually *opens* (`window.open`, `:35`). On mobile Safari, programmatic `a.click()` blob downloads (`:43`) frequently fail / open a blank tab. The button label ("Opening…" vs "Download", `:104`) doesn't match the two behaviors. A client on an iPhone may tap "Download" and get nothing.

**S2 — Pop-up blockers will eat the signed URL.** `window.open(body.signedUrl, ...)` (`:35`) happens **after an `await fetch`** — i.e. outside the original user-gesture tick. Mobile/desktop pop-up blockers commonly block this. The repo even documents the fix pattern elsewhere ("`window.open('about:blank')` before async fetch") but it's not applied here. Result: client taps Download, browser silently blocks, nothing opens, `dlErr` is null → **silent failure**.

**S3 — No search, no sort, no recency.** Folders render in a fixed order (`:75`) and docs within them in API order (`:89`). A 60-document handover pack has no search and no "newest first." Finding "the variation I signed in March" is a scroll-hunt.

**S3 — `dlErr` shown as a page-top `ErrorBox`** (`:81`) detached from the row that failed — the client doesn't know *which* download failed.

**S4 — Folder labels are decent**, but `whs` → "WHS" (`:17`) is jargon a client won't parse; "Site Safety" would be clearer.

---

### 6. Messages — `ClientMessages.jsx` — **UX FAILURE**

**10-sec test: FAIL on mobile due to a layout bug (below); the chat itself is otherwise simple.**

**S2 — Fixed-height container collides with mobile bottom nav.** `:41` `h-[calc(100vh-12rem)]`. The layout adds a **sticky mobile header** (`ClientPortalLayout.jsx:157`) AND a **fixed bottom nav** (`:181`), neither of which is accounted for in `12rem`. On mobile the message list + composer get pushed under the bottom nav; the Send button and the latest messages can sit **behind** the fixed bottom nav (`z-40`), making the composer partially unreachable. The main content already has `pb-24` (`ClientPortalLayout.jsx:175`) for the nav, but this page's `100vh` calc ignores that and overflows. **This is a concrete mobile breakage.**

**S2 — `100vh` is the wrong unit on mobile.** iOS Safari `100vh` includes the URL bar; the container will be taller than the visible viewport, again hiding the composer. Should use `100dvh` / `svh` or a flex layout that respects the nav.

**S2 — Enter-to-send destroys multi-line intent.** `:68` sends on Enter unless Shift held. A client typing a careful multi-paragraph question to their builder will fire it off half-written on the first Enter. No "are you sure", no edit, no delete-message. For an anxious client mid-build this is a frequent, embarrassing misfire.

**S2 — No delivery / read / "builder is typing" state, no polling.** Messages load once (`load()` on mount, `:22`) and only re-fetch after the client sends (`:34`). A builder reply **never appears** unless the client sends another message or reloads the page. "We usually reply the same day" (`:46`) sets an expectation the UI can't show being met. A client will think they were ignored.

**S3 — No timestamps grouping / day separators.** Every bubble shows a full `fmtDate` (`:55`) with **date only, no time** — so two messages 4 hours apart both say "21 Jun 2026". A client can't tell message order/timing within a day.

**S3 — `senderName` only shown on builder messages** (`:53`); fine, but there's no avatar, and "client" bubbles are unattributed — in a shared-login household you can't tell who sent what.

**S3 — Send failure leaves the draft but the textarea may have cleared.** On `!ok` (`:32`) the draft is preserved (good), but there's no retry button — the client must re-press Send, and the error is a small red line (`:81`) that scrolls with the form.

---

### 7. My Home — `ClientMyHome.jsx`

**10-sec test: PARTIAL.** This is a post-handover reference screen; reasonable. But it has two real defects.

**S2 — Broken Google review link.** `:80` `href="https://search.google.com/local/writereview?placeid="` — **the `placeid` is empty.** Every client who taps "Leave a Google review" lands on a broken/blank Google page. This is a shipped, visible bug on a money-adjacent CTA (reviews drive sales per the APB references in MEMORY). The placeid must be populated (and ideally from config, not hardcoded).

**S2 — Referral / review ask is unconditional and emotionally tone-deaf.** The "Help us tell your story" card (`:68`) renders **always**, regardless of whether the handover had defects, disputes, or an unhappy client. Asking a client who is fighting over a defects list to "leave a Google review" / "share your home" is the single fastest way to earn a 1-star review. There's no gating on satisfaction (e.g. only after a defects-clear or a positive NPS). **High reputational risk.**

**S3 — `byRoom` grouping default "Throughout" can swallow everything.** `:26` buckets any finish without a `room` into "Throughout." If the data lacks rooms, the whole home collapses into one giant "Throughout" card — defeating the room-by-room story.

**S3 — Warranties show years but no claim path.** `:52` lists warranty label + years + expiry, but no "how to claim" / contact / document link. At the moment a client needs a warranty (something broke), the screen is a dead reference with no next step.

**S4 — `mailto:` referral** (`:74`) is fine but opens the client's mail app with a canned subject; many users have no configured mail client and get nothing.

---

### 8. Admin — `PortalV2Admin.jsx` (internal-facing, but it shapes client experience)

Internal tool, so the 10-sec test doesn't apply, but defects here directly cause client-facing breakage:

**S2 — Team directory is a raw JSON textarea.** `:108` the supervisor edits `teamMembers` as hand-typed JSON (`JSON.parse`, `:89`). One missing comma → "Team members must be valid JSON" and the save is blocked; worse, a wrong shape (e.g. `role` misspelled) silently produces a broken "Your team" card on Home (`ClientHome.jsx:160`). **Non-technical staff will break the client's Home screen.** Needs a structured row editor.

**S2 — No validation / preview on selections & variations before they hit the client.** `SelectionsSection.create` (`:243`) posts an "Option A/Option B" with prices and **immediately makes it client-choosable** with real cost impact — no preview of how it renders, no confirm. Same for milestones/updates: `UpdateSection.publish` (`:163`) publishes straight to the client Journey with no preview. A typo'd headline or a wrong price goes live to a $2m client instantly.

**S2 — Confidence can be left blank → green "On track" to client.** Admin lets you add a milestone with `confidence: ""` (`:190` default empty) and "set current." Combined with X5, that milestone shows the client a green "On track" chip the builder never affirmed. The admin UI should force a confidence choice on the current stage.

**S3 — Invite uses client email as the join key with no de-dup/typo guard.** `InviteSection.invite` (`:126`) sends to whatever email is typed; `resolveClientProjectId` (`clientPortalApi.js:63`) matches `portal_client_email` exactly. A typo in the invite email → the invited person logs in and hits "No project linked yet" (`ClientPortalLayout.jsx:99`) with no self-service fix. For a single-project-per-client model, a mismatched email is a hard lockout.

**S3 — Build-phase toggle is a blunt instrument with client-visible consequences.** Flipping `buildPhase` to `practical_completion` (`:104`) swaps the **entire client nav** (`ClientPortalLayout.jsx:71` `COMPLETION_NAV`) — Journey & Selections **disappear**, My Home appears. If a supervisor flips this early, the client suddenly loses access to their Selections and Journey mid-build with no warning. No confirm, no "this changes what the client sees."

---

## The 10-second test, consolidated

| Target | Where a first-timer finds it | Verdict |
|---|---|---|
| **Project status** | Home stage card (below greeting) | OK-ish; buried below prose on mobile |
| **Next milestone** | Home "Next: …" (`ClientHome.jsx:68`) | OK when data present |
| **Action required** | Home shows a **count only**, not the items; nav tab has no badge | **WEAK** — count without identity; can't tell a binding approval from a chore |
| **Latest photos** | Only inside Journey → expand current stage | **FAIL** — not on Home, no "latest photos" view |
| **Pending approvals** | Folded into generic "actions" count | **FAIL** — approvals not distinguished from tasks anywhere |

**Two of the five core targets fail outright for a first-time client.**

---

## Highest-priority fixes (ranked)

1. **(S1) Gate every binding action behind explicit confirmation.** Variation approve (`ClientActions.jsx:172`), over-allowance Selection choose (`ClientSelections.jsx:143`), and "I've transferred payment" (`:220`) all need a confirm step that restates the dollar/time/contract consequence *before* commit, with the legal disclaimer *above* the button. These are contract-level acts.
2. **(S1) Make selections reversible until locked, and block Choose on price-less options.** Add "change selection" before `in_review`; disable Choose when `priceIncGst == null`.
3. **(S1) Verified-payee + invoice-required on progress claims.** Don't let "I've transferred payment" clear an action without an attached invoice; never render free-text bank details as the payment source of truth.
4. **(S2) Fix the Messages mobile layout** (`100dvh`/flex, account for header + `pb-24` bottom nav) and stop Enter-to-send from firing half-written messages; add polling for builder replies.
5. **(S2) Fix the empty Google `placeid`** (`ClientMyHome.jsx:80`) and gate the review/referral ask on client satisfaction.
6. **(S2) Default `confidenceStyle` to neutral, not green** (`clientPortalUi.jsx:46`), and force a confidence on the current milestone in admin.
7. **(S2) Resolve the "Signature required" dead-end** in Documents — either wire e-sign or change the label.
8. **(S2) Surface photos and pending approvals on Home**, badge the nav, and stop silently eating broken images in Journey.
9. **(S2) Sanitize all client-facing errors** (`ErrorBox`/`resolveClientProjectId`) — no raw DB strings.
10. **(S2) Replace the admin raw-JSON team editor** with a structured form and add a client-side preview before publishing updates/selections.

---

## What's genuinely good (briefly)

- Consistent token-based design system (`clientPortalUi.jsx`) — cards, empty states, loading all exist per page (loading/empty/error states **do** exist on every screen; that part passes).
- Empty states are friendly and on-brand (`Empty`, used in Actions/Selections/Documents/Journey/MyHome).
- The inc-GST-only intent and the "Why we did it this way" transparency notes are a strong, client-trust-building idea — the execution just needs the guardrails above.
- Auth guard and role redirect in the layout (`ClientPortalLayout.jsx:88`) are clean.
