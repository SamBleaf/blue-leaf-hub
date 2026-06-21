# Client Portal — Premium Experience Audit

**Question:** Would a client spending **$500k / $1m / $2m / $3m** on a custom home feel that this portal is **premium**?

**Short answer:** No — not yet. The information architecture is genuinely good and the financial-transparency model is ahead of most competitors. But the *felt experience* is MVP: the marquee emotional feature (watching your house get built in photos) **is broken in the logged-in portal**, selections — the single most important "premium" moment in a custom build — is a **text-only price list with no images**, there is **no native app, no push, no e-signature**, and onboarding drops a $2m client onto the same generic "Use your workspace credentials" login screen the office staff use. A discerning $2m client will perceive it as "a competent web tool," not "the bespoke experience that justifies the price."

**Stance:** Hostile red-team. Findings are grounded in the actual code. File refs are at audit time.

**Scope read:** `src/pages/clientportal/{ClientPortalLayout,ClientHome,ClientActions,ClientJourney,ClientSelections,ClientDocuments,ClientMessages,ClientMyHome,clientPortalUi}.jsx`, `clientPortalApi.js`, `Login.jsx`, `AcceptInvite.jsx`, brand components, `server/lib/portalV2Routes.mjs`, `portalRoutes.mjs`, `portalIntegration.mjs`, `requirePortalAuth.mjs`, PWA manifest.

---

## 1. The "first five minutes" — does it feel like a $2m experience?

A $2m client's perception is set in the first session. Here is what actually happens, in code:

1. **They receive an invite email** → `AcceptInvite.jsx`. The accept screen is clean but generic: an emoji (`🔒` / `✅` — `AcceptInvite.jsx:87,102`), "Set up your account", "Welcome to Blue Leaf Hub." It says **"Hub"** — the internal staff product name — to a client who has never heard of "the Hub." No "Welcome home," no project address, no builder photo, no warmth. It looks like onboarding to a SaaS dashboard.

2. **They log in** → `Login.jsx`. This is the **same screen staff use**. Copy: *"Sign in — Use your workspace credentials"* (`Login.jsx:92-93`) and *"Access is by invitation only. Contact admin"* (`Login.jsx:170`). A client paying $2m is told they have "workspace credentials" and should "contact admin." There is **zero client-specific framing** — no separate client login route, no "Your home at [address]" hero. First impression: corporate, not bespoke.

3. **They land on Home** → `ClientHome.jsx`. This is genuinely the strongest screen: a synthesised greeting ("Good morning, [name]…"), a stage + health card with a progress bar, financial snapshot, team chips. It reads well. **But there are no photos** (see §4), the greeting can contradict the health chip (it appends "On track for … around [eta]" whenever an eta exists, even if `confidence === "delayed"` — `ClientHome.jsx:20`), and the whole thing is a vertical stack of flat white cards (`Card` in `clientPortalUi.jsx:93`) constrained to `max-w-2xl` (`ClientPortalLayout.jsx:175`). It is *tidy*. It is not *impressive*. There is no hero image of their actual home, no large photo, no signature visual moment.

**Premium gap:** There is no "wow." Nothing on first load makes a $2m client lean in and think "this is special." The portal communicates competence, not craft. For comparison, the emotional hook competitors lead with — a big, beautiful, recent photo of *your* site — is exactly the thing this portal fetches from the API (`recentPhotos`, `portalV2Routes.mjs:213`) and then **never renders** (`ClientHome.jsx` has no photo block).

---

## 2. Onboarding

| Dimension | State in code | Premium verdict |
|---|---|---|
| Invite | `POST /api/auth/invite`, accepted via `AcceptInvite.jsx`. Generic, says "Blue Leaf Hub." | Thin. No project context, no warmth, no guided tour. |
| First login | Shared staff `Login.jsx`. "Use your workspace credentials." | **Fails the premium bar.** No client-distinct entry. |
| Guided first run | None. Client lands cold on Home with no tour, no "here's what you can do here," no checklist. | Missing. Competitors run a welcome flow. |
| Who can onboard a client | `/api/auth/invite` requires `caller.role === "admin"`, but the admin console is open to supervisors too. A supervisor clicking "Invite client" gets a silent 403. | **Operational risk** — the person running the project often can't invite their own client. |
| Multi-project clients | `resolveClientProjectId` picks "first v2-enabled, else most recent" (`clientPortalApi.js:74-77`). No project switcher. | A repeat $3m client with two builds sees only one, silently. |

A $2m client expects to be *welcomed*. Right now they're *provisioned*.

---

## 3. Visual polish

**What's good (briefly):** Consistent token system (`primary #006c9b`, `rounded-card`, hairline borders), a tasteful dark-navy chrome (`PORTAL_CHROME = "#1B2A3B"`, `ClientPortalLayout.jsx:60`), brand knockout logo in the sidebar, clean traffic-light confidence chips (`confidenceStyle`, `clientPortalUi.jsx:40`). It is coherent and uncluttered. This is a real strength — it doesn't look *cheap*.

**What undercuts premium:**
- **It's all flat white cards.** Every page is `space-y-5` of `Card` (white, hairline border, `p-5`). There is no photography, no texture, no hero, no depth, no signature graphic moment. It reads like a well-built admin panel, not a luxury client experience.
- **Emoji as iconography in the auth flow** (`🔒`, `✅`, `AcceptInvite.jsx:87,102`) — acceptable in a memo, cheap on a $2m onboarding screen.
- **Content width capped at `max-w-2xl`** (`ClientPortalLayout.jsx:175`) on every page including Journey. Photos can never go full-bleed or large — they're locked into a `grid-cols-3/4` of tiny `aspect-square` thumbnails (`ClientJourney.jsx:93`). The architecture itself prevents a cinematic photo presentation.
- **No motion, no celebration.** Approving a variation, choosing a finish, hitting a milestone — all just silently reload a list. No confirmation animation, no "milestone reached" moment. The team-member chips are initials in circles (`ClientHome.jsx:165`), not photos.
- **Typography is uniformly small** (`text-sm`, `text-xs`, `text-[11px]` everywhere). Dense and efficient — but dense reads as "tool," not "tailored." A premium client UI uses generous type and whitespace as a signal of care.

**Verdict:** Polished MVP. Clean enough to not embarrass, not distinctive enough to delight.

---

## 4. Photo presentation — **broken, and it's the worst failure for this audience**

This is the feature a $2m custom-home client cares about *most*: seeing their house get built. It is the single biggest reason clients log in weekly. In this portal it does not work.

- **Journey photos never load.** `ClientJourney.jsx:97` renders `<img src={`/api/portal/media/${p.id}`} … onError={hide} />`. The **only** handler for `/api/portal/media/:photoId` is the **legacy token endpoint** (`portalRoutes.mjs:145-173`), which **requires `?token=` in the query string** and returns HTTP 400 / 404 without it. The logged-in v2 portal sends **no token** (and an `<img>` tag can't send the `Authorization: Bearer` header anyway). Result: **every site photo silently fails**, and the `onError` handler *hides the broken image so no one even notices*. The Journey accordion shows updates with empty photo space.
- **Home photos don't exist in the UI.** The Home API returns `recentPhotos` (`portalV2Routes.mjs:213,261`) but `ClientHome.jsx` has **no photo grid at all**. The data is fetched and thrown away.
- **Even if it worked, the presentation is weak.** Tiny square thumbnails in a 3-4 column grid, no lightbox, no captions surfaced prominently, no full-screen viewer, no swipeable gallery, no chronological reel, no "this week on site." `caption` is fetched (`portalV2Routes.mjs:834`) but only used as `alt` text (`ClientJourney.jsx:98`), never displayed.

**Premium verdict:** This alone disqualifies "premium" today. A client paying $2m who logs in to watch their home being built sees **no photos**. Every competitor below does this well, with native apps and push-on-new-photo. This is the highest-leverage fix in the entire portal.

---

## 5. Selections experience — text-only price list, no images

For a custom home, **selections are the experience**. Tile, tapware, stone, joinery, flooring — choosing them is the emotional core of building, and it's where premium builders differentiate hardest. Here:

- `ClientSelections.jsx` renders each item as a card with a name, allowance, status chip, and a list of options showing **label, price, lead time** — **and nothing else.** There are **no product images.**
- The backend literally selects `image_url` on options (`portalV2Routes.mjs:62`) and `inspiration_photos`, `attachments` on the selection (`portalV2Routes.mjs:66`). **The UI renders none of them.** `grep` for `image`/`photo`/`inspiration` in `ClientSelections.jsx` returns zero matches. The data is there; the experience isn't.
- **"Choose" is irreversible and unconfirmed.** Tapping "Choose" (`ClientSelections.jsx:84`) immediately POSTs and flips the card to "Chosen: X" with **no confirmation dialog and no client-side undo** (the `decided` branch, `ClientSelections.jsx:113`). A client who mis-taps a $4k stone upgrade must phone in. For a high-value, taste-driven decision this is the wrong interaction model.
- No mood-board, no room visualisation, no comparison view, no "save for later," no ability to attach their own inspiration images, no designer commentary per option beyond a flat `Recommended` pill.

**Premium verdict:** This is the second-biggest gap after photos. A selections module with **no images** is, to a $2m client choosing finishes, almost insulting. It's a spreadsheet with buttons.

---

## 6. Financial transparency — **genuinely strong, a real differentiator**

This is where the portal is actually *ahead* of the market.

- `ClientHome.jsx:113` "Your build, financially" shows contract value, approved variations (signed), pending variations, claims paid, claims outstanding, and current total — **all inc-GST**, sourced from canonical generated columns, with a hard rule that builder cost / margin / ex-GST are **never** exposed (`buildFinancialSnapshot`, `portalV2Routes.mjs:956`, explicit comment). Clean, honest, real-time.
- Variations show cost impact **and** time impact (EOT days) plus a "Why this variation was raised" reasoning block (`ClientActions.jsx:143-151`) — excellent, client-respectful transparency.
- Progress claims surface stage, amount, due date, payment instructions, invoice download, and an "I've transferred payment" notify button (`ClientActions.jsx:204-223`).

**Caveats for premium:**
- It's a flat `dl` of six numbers. No payment schedule timeline, no visual "where your money has gone" breakdown, no claim history chart, no forecast-to-complete. Functional, not beautiful.
- "Pending variations" and "Approved variations" sit in the same grid with subtle `+`/muted styling (`Money`, `ClientHome.jsx:191`) — a difficult client could misread what they've actually committed to.

**Verdict:** The *substance* of financial transparency beats most competitors. The *presentation* is plain. This is the area where a little visual investment yields a big premium signal.

---

## 7. Document handling

- Folder-grouped archive (Contract, Approved Plans, Engineering, Variations, Progress Claims, Warranty…) with authenticated download via short-lived signed URLs or streamed bytes (`ClientDocuments.jsx`, `portalV2Routes.mjs:687`). Solid, sensible IA.
- **No e-signature anywhere.** `grep` for docusign/esign/signature-pad across `src/` and `server/` returns nothing. Yet documents render **"Signature required"** when `signatureRequired && !signedAt` (`ClientDocuments.jsx:95`) — a status with **no action to satisfy it.** The client sees "Signature required," and there is literally no way to sign. They must print, sign, scan, email — in 2026, on a $2m contract.
- **The variation approval disclaimer contradicts itself.** `ClientActions.jsx:164` tells the client "Your approval is recorded with a timestamp and your account details. Blue Leaf will issue a signed variation document separately." Meanwhile the server flips the canonical `job_variations.status` to **`"signed"`** on approve (`portalV2Routes.mjs:427`). So internally it's "signed," externally the client is told it isn't. For a $50k variation this is a **contract-risk ambiguity**: what exactly did the client agree to, and is a timestamped button-click enforceable as a variation under the building contract? No formal signature, no PDF of *what they approved* captured at approval time.
- Archived signed variation/claim PDFs are stored with only `public_url` and **no `storage_path`**, and the download route returns that raw URL with **`expiresIn: 0`** (`portalV2Routes.mjs:437,725`) — i.e. a **permanent, non-expiring link**, contradicting the "short-lived signed URL so revocation is honoured" design. Potential **data-leakage / contract-document exposure** if that URL is reachable.

**Premium verdict:** Adequate as a file cabinet, deficient as a contract surface. No e-sig is a hard miss for this price point.

---

## 8. Notifications — **the whole channel is dead, and that's an operational risk**

- There is an in-app `portal_notifications` table and a `GET /notifications` endpoint (`portalV2Routes.mjs:933`), but **no page or nav item ever renders it.** No bell, no badge, no unread count in the layout (`grep` for "notification/bell/badge" in `src/pages/clientportal/` returns only the Home "unread messages" string). The notifications table is fetched by nothing.
- **No push notifications.** No web-push, FCM, OneSignal, or service-worker push anywhere (`grep` confirms). The PWA manifest is the **internal staff app** ("Blue Leaf Hub … RFQs, tenders, cost intelligence" — `public/manifest.webmanifest`), not a client install target.
- **Email is the only outbound channel, and only in three places:** a client message notifies `admin@` (`portalV2Routes.mjs:902`), a claim payment-notify emails the builder (`:542`), a meeting decline emails the builder (`:801`). **Every notification flows client → builder. The client is never proactively notified of anything** — not a new variation to approve, not a new photo, not a new document, not a milestone, not a builder reply to their message.

**Premium verdict:** This is the quiet killer. A $2m client's experience of a portal *is* its notifications — "your slab was poured today," "a variation needs your approval," "Sam replied." None of that exists. The client must **remember to log in and check.** That is the opposite of premium, and it's an engagement risk: an un-notified portal goes unused, and an unused portal makes the client feel *less* informed than a simple email would.

---

## 9. Mobile app feel

- **There is no native app.** It's a responsive web SPA with a mobile bottom nav (`ClientPortalLayout.jsx:181`) and a sticky mobile header. The PWA install target is the staff Hub, not a client home app.
- No push (see §8), no offline, no camera integration, no home-screen client app, no app-store presence.
- The responsive layout is competent — bottom tab bar, readable cards — but it's a *website on a phone*, not an *app*. Messages uses a fixed-height scroll region computed as `h-[calc(100vh-12rem)]` (`ClientMessages.jsx:41`), a brittle viewport hack that will fight mobile browser chrome.

**Premium verdict:** Every major competitor ships a native iOS/Android app with push. A $2m client who's been told "we have a portal" and then bookmarks a website will feel the difference immediately.

---

## 10. "Wow" moments — essentially none today

Inventory of what *could* delight, and its actual state:
- **Watching your home being built (photos):** broken (§4).
- **Choosing finishes (selections):** text-only, no images (§5).
- **A beautiful "My Home" handover record:** exists (`ClientMyHome.jsx`) — room-by-room finishes, warranties — but it's the same flat `dl` of text rows, no photos of the finished rooms, no celebration. The post-handover ask ("Help us tell your story," `ClientMyHome.jsx:68`) has a **broken Google review link** — `writereview?placeid=` with an **empty placeid** (`ClientMyHome.jsx:80`).
- **Milestone celebration:** none. Stages just tick to a green ✓ (`ClientJourney.jsx:118`).
- **Personal touch:** team shown as initials, not photos; greeting is templated.

**There is currently no single moment in this portal that a $2m client would screenshot and send to their partner.** That is the definition of the premium gap.

---

## 11. Competitor benchmark

Marks are **Blue Leaf vs. competitor**, grounded in the actual UI above. "Better / Equal / Worse" = how a $2m client would rate Blue Leaf relative to that product.

### Buildertrend
| Dimension | Verdict | Reasoning |
|---|---|---|
| Onboarding | **Worse** | BT has client-specific onboarding + welcome; BL drops client on staff login ("workspace credentials"). |
| Visual polish | **Equal** | BT is dated/utilitarian; BL is cleaner but flatter. A wash. |
| Mobile app feel | **Worse** | BT ships native iOS/Android + push; BL is a responsive website, no app. |
| Photo presentation | **Worse** | BT photo feeds work and notify; BL Journey photos are broken (§4). |
| Selections | **Worse** | BT selections show images, approvals, e-sign; BL is text-only, no images, irreversible. |
| Financial transparency | **Better** | BL's inc-GST contract/variation/claim snapshot with "why this variation" reasoning is cleaner and more client-respectful than BT's invoice-heavy view. |
| Document handling | **Worse** | BT has e-signature; BL shows "Signature required" with no way to sign. |
| Notifications | **Worse** | BT push + email on every event; BL never notifies the client. |
| "Wow" | **Worse** | BT's daily logs + photo push create habit; BL has no hook. |

### CoConstruct (now part of Buildertrend)
| Dimension | Verdict | Reasoning |
|---|---|---|
| Onboarding | **Worse** | CoConstruct built its reputation on a warm, guided client experience. |
| Visual polish | **Equal/Better** | BL's design tokens are arguably more modern than CoConstruct's legacy UI. |
| Mobile app feel | **Worse** | Native app + push vs. BL website. |
| Photo presentation | **Worse** | CoConstruct's photo/comment threads are a core loved feature; BL's are broken. |
| Selections | **Worse** | CoConstruct's selections-with-approvals is its flagship; BL has no images and no approval/e-sign. |
| Financial transparency | **Better** | BL's single honest inc-GST view beats CoConstruct's busier financial tabs for clarity. |
| Document handling | **Worse** | E-sign + approvals vs. none. |
| Notifications | **Worse** | Per-event client notifications vs. none. |
| "Wow" | **Worse** | CoConstruct's selection sign-off moment is the wow; BL lacks it. |

### Buildxact
| Dimension | Verdict | Reasoning |
|---|---|---|
| Onboarding | **Equal** | Buildxact's client portal is thin too; neither wows. |
| Visual polish | **Equal/Better** | BL's chrome is cleaner; Buildxact is estimator-first. |
| Mobile app feel | **Worse** | Buildxact has a mobile app (builder-side strong); client mobile parity edges BL's no-app. |
| Photo presentation | **Worse** | BL's are broken; any working gallery beats broken. |
| Selections | **Worse** | Buildxact ties selections to live estimate/quote; BL has no images. |
| Financial transparency | **Equal/Better** | This is Buildxact's home turf (estimating), but for the *client-facing* inc-GST contract view BL is comparable and cleaner. Genuinely close. |
| Document handling | **Worse** | No e-sign in BL. |
| Notifications | **Worse** | BL never notifies the client. |
| "Wow" | **Equal** | Neither is a wow product for clients; Buildxact's strength is internal. |

### JobTread
| Dimension | Verdict | Reasoning |
|---|---|---|
| Onboarding | **Worse** | JobTread's customer portal is configurable and branded per client. |
| Visual polish | **Worse** | JobTread is modern, dashboard-rich, customisable; BL is flat single-column. |
| Mobile app feel | **Worse** | Native app + push vs. BL website. |
| Photo presentation | **Worse** | JobTread galleries work and notify; BL's broken. |
| Selections | **Worse** | JobTread selections with images + approvals vs. BL text-only. |
| Financial transparency | **Better** | BL's deliberately client-safe inc-GST-only model (never exposes cost/margin) is a sharper, more trustworthy *client* view than JobTread's more builder-centric financials. |
| Document handling | **Worse** | E-sign vs. none. |
| Notifications | **Worse** | Per-event notifications vs. none. |
| "Wow" | **Worse** | JobTread's polished dashboards read as premium; BL doesn't yet. |

**Net:** Blue Leaf wins on **one** dimension — *financial transparency* (the inc-GST-only, never-expose-margin, with-reasoning model is genuinely best-in-class and on-brand for a trust-led premium builder). It is **equal** on raw visual cleanliness against the older competitors. It is **worse** on every experiential dimension that a $2m client actually feels day-to-day: onboarding, mobile/app, photos, selections, e-sign, notifications, and wow.

---

## 12. The difficult-client / risk lens (what breaks under a real $2m client)

- **"Where are my photos?"** — Journey shows none; the failure is silent (`onError` hides it). The client thinks the builder isn't photographing their site. Trust damage.
- **"I clicked the wrong tile."** — Selection choice is irreversible client-side with no confirm. Now a phone call and a manual fix. Looks amateur on a taste decision.
- **"I never knew there was a variation to approve."** — No client notification of new variations; pending variations sit until the client happens to log in. On a $50k variation with an EOT, that's a programme + cost dispute waiting to happen.
- **"What did I actually sign?"** — Variation approve = a button click; the disclaimer says it's *not* signed but the system marks it `signed`. No captured PDF of the approved state, no e-signature. Contract-enforceability ambiguity on six-figure changes.
- **"I declined and you didn't ask why."** — Decline reason is optional (`ClientActions.jsx:128`); a client can reject a variation with no explanation and the builder only learns via a cleared counter.
- **"This is the same login as your office."** — Generic "workspace credentials" framing erodes the bespoke feeling on day one.
- **Permanent document URLs** (`expiresIn:0`, §7) — a forwarded contract link could be a confidentiality breach with no revocation.
- **A delayed project still says "on track."** — The greeting appends "On track for … around [eta]" even when `confidence === delayed` (§1). A difficult client will quote that line back to you.

---

## 13. Recommendations to reach a $2m premium bar

**P0 — fix the things that are broken or actively harmful (days, not weeks):**
1. **Fix Journey/Home photos.** Add an authenticated v2 media route (`/api/portal/app/:projectId/media/:id`) that streams via the JWT/membership check, and serve image bytes via a short-lived signed URL the `<img>` tag can use, or proxy with a one-time signed token. Render `recentPhotos` on Home. This is the highest-leverage single fix.
2. **Add product/inspiration images to Selections.** The data (`image_url`, `inspiration_photos`) is already fetched — render it. Add a confirm step before committing a paid choice, and a "request a change" path post-choice.
3. **Resolve the e-signature / "signed" contradiction.** Either ship real e-signature (capture a signed PDF of exactly what was approved) or stop marking variations `signed` and stop telling clients "Signature required" with no way to sign. This is contract risk, not polish.
4. **Stop emitting permanent document URLs** — store `storage_path` and always serve via short-lived signed URLs.
5. Fix the empty Google review `placeid`, the delayed-but-"on track" greeting, and let supervisors invite clients.

**P1 — make it feel premium (the experiential gap):**
6. **Client-distinct onboarding + login.** A branded "Welcome to your home at [address]" entry, a short guided first-run, the builder's photo and name — not "workspace credentials."
7. **Photo experience worthy of the moment.** Full-bleed hero of the latest site photo on Home, a swipeable chronological gallery with captions and a lightbox, "this week on site." Break out of `max-w-2xl` for media.
8. **Per-event client notifications.** At minimum email-on-new-{photo, variation, document, message-reply, milestone}; ideally PWA/web-push. Surface the existing `portal_notifications` table with a bell + unread badge in the nav.
9. **Make the financial transparency *beautiful*.** Turn the six-number `dl` into a payment-schedule timeline + "where your money has gone" visual. You already have the best *data* model — invest in the *presentation* and it becomes a genuine wow.

**P2 — the differentiators that justify the price:**
10. **A native (or installable, client-branded PWA) app with push** — this is table stakes vs. every competitor.
11. **A real selections studio** — mood-boards, room context images, designer commentary, e-sign sign-off. This is where a premium builder out-experiences Buildertrend/CoConstruct.
12. **Milestone celebration moments** — a designed "Your frame is up" card with a hero photo the client wants to share. Manufacture the screenshot moment.
13. **Team as people** — photos and short bios, not initials.

**Bottom line:** The bones are good and the financial-trust model is best-in-class. But on the experiential axes a $2m client lives in — photos, selections, notifications, mobile app, e-sign, and the felt warmth of onboarding — this portal is currently **worse than every named competitor**, and two of its hero features (site photos and selections imagery) are **broken or absent despite the data being right there in the API**. Fix P0, then invest in P1, and it moves from "competent web tool" to "premium." Today, it is not premium.
