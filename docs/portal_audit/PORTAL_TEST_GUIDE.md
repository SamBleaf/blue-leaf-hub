# Client Portal v2 — Test Guide

A step-by-step plan to validate the portal end-to-end. Three layers:
1. **Automated** — one command, proves the whole Finance→Portal integration against real data.
2. **Client walkthrough** — log in as a test client, click every page + action.
3. **Staff walkthrough** — drive every entity from the admin console, then watch it appear for the client.

All migrations (103–105, 108, 110) are applied. Nothing here is destructive — the demo + the automated test clean up after themselves.

> ## ⚠️ TEST ON LOCALHOST, NOT THE LIVE SITE
> This work is **not deployed yet** — it's uncommitted, waiting on the architect agent to commit + deploy.
> **Do NOT test on `blueleafhub.com.au`** — that's the live, *old* app. A client account there lands in the
> staff shell with a role-picker and "Account inactive" (expected on old code, not a bug).
> **Test at the `http://localhost:5173` URL that `npm run dev` prints.** That's the only place the new portal exists.

---

## Part 0 — Setup (2 minutes)

```bash
cd ~/Desktop/blue-leaf-hub.nosync

# 1. Confirm migrations are live (expect 108 paid_to_date ✓; only pre-existing 101 may show missing)
node scripts/verify_migrations.mjs

# 2. Stand up a ready-to-walk demo project + test client (idempotent — re-run any time)
node scripts/test_client_setup.mjs
#    → creates project "__DEMO 21 Folkstone Rd, Brighton"
#    → test client:  testclient@example.test  /  BlueLeafTest1!

# 3. Start the app
npm run dev
#    → open the Vite URL it prints (http://localhost:5173)
```

Tip: log in as the test **client** in an **incognito / separate browser** so it doesn't collide with your staff session (one browser = one account).

When you're done with everything: `node scripts/test_client_setup.mjs --cleanup`

---

## Part 1 — Automated test (1 command, do this first)

```bash
node scripts/real_data_dryrun.mjs
```

**Expect: `27 passed  0 failed`.** This creates a real job + variation + progress claim, runs them through the real Finance→Portal integration, and verifies the client sees and can act on them — then cleans up. It covers: variation approve, claim issue + partial + full payment, **void** (variation + claim), **dispute**, **payment guard**, **claim_paid notification**, document signing, and server-side deactivation. If this is green, the integration spine works.

---

## Part 2 — Client walkthrough (log in as the test client)

Go to `/login`, sign in as `testclient@example.test`. You should land on **`/client-portal`** (not `/my-portal`).

| # | Do this | Expect |
|---|---|---|
| 1 | Land on **Home** | Greeting "Good … David", stage **Frame & Roof** on **watch** with the delay note, financial snapshot (contract + variations + claims, all **inc-GST**), "3 actions need attention", team, "Coming Up" |
| 2 | Click the **🔔 bell** (top of nav) | A notifications panel opens; unread count shows; clicking a notification marks it read |
| 3 | Open **My Actions** | 3 items: approve a variation, choose a tile, confirm a meeting |
| 4 | **Approve the variation** → confirm step | Card clears; Home's "approved variations" total goes up; you can't approve it twice (blocked) |
| 5 | **Choose a selection option** | Selection card resolves; action clears |
| 6 | **Confirm the meeting** | Meeting shows confirmed; action clears |
| 7 | Open **Project Journey** | Stages list; current stage shows the weekly update + "why we did it this way"; confidence note on the watch stage |
| 8 | Open **Selections** | Board with options + prices (inc-GST); **no internal notes / cost** visible |
| 9 | Open **Documents** | The contract/doc shows; **Download** works (or a friendly "temporarily unavailable" message — never a raw error) |
| 10 | Open **Messages** → send one | Message posts; 20s polling shows new replies |
| 11 | Open a **progress claim** (My Actions) | Amount **inc-GST**, payment instructions, "I've transferred payment" button. Tap it once → confirmation; tap again → no-op (idempotent) |

**Red flags to watch for:** any raw error/JSON on screen; any ex-GST / cost / margin / "internal notes" value; a 500/blank page; an action that stays after you complete it.

---

## Part 3 — Staff walkthrough (the admin console)

As **staff**, open the project's **Client Portal v2 — Admin** page. Drive each section and watch it show up for the client:

| # | Section | Do this | Expect (client side) |
|---|---|---|---|
| 1 | **Settings** | Toggle v2, set build phase, payment instructions, team | Home reflects it |
| 2 | **Weekly update** | Publish an update with "why we did it this way" | Appears on the client's Journey |
| 3 | **Draft updates** | If a site-diary draft exists, click **Publish** | Draft goes live on the Journey + client notified |
| 4 | **Milestones** | Set a stage's confidence to **delayed** + a note | Home build-health shows the reason |
| 5 | **Selections** | Add a selection + options; later mark approved | Client sees the board; action closes when approved |
| 6 | **Meetings** | Create a meeting | Appears in the client's My Actions |
| 7 | **Documents** | Expose an existing job document | Appears in client Documents (409 if the doc has no file) |
| 8 | **Register a contract** | Paste a Dropbox path of the signed contract → register | Becomes a job document you can then expose |
| 9 | **Photos** | Tag a photo to a stage + **Show client** | Photo appears on that Journey stage (defect photos stay hidden until shown) |
| 10 | **Awaiting your signature** | (read-only) | Lists variations the client approved but you haven't signed in Finance |
| 11 | **Client access** | **Revoke** the test client | Client immediately gets 403 / logged out. **Restore** to undo |
| 12 | **Invite** | Invite a second client to the same project | Existing client links to the project (no error) |

---

## Part 4 — Live integration tests (Finance → Portal)

The automated test (Part 1) already proves these against a throwaway job. To do it **by hand** on a real job, use a **won job whose project has portal v2 enabled** (the demo project is portal-native and has no Finance link, so use a real job for this part):

| # | In Finance, do… | Then in the client portal… |
|---|---|---|
| 1 | Create + **send** a variation | It appears in **My Actions** to approve; its PDF auto-appears in **Documents** |
| 2 | Issue a **progress claim** | It appears as a claim to review; the invoice PDF auto-appears in **Documents** |
| 3 | **Void** that variation | The Approve button is **gone** (no approving a cancelled variation) |
| 4 | **Void** the claim | The "I've transferred payment" button is **gone** |
| 5 | **Dispute** a claim | Claim shows under review; pay button gone |
| 6 | **Record a payment** (partial, then full) | Home shows paid-to-date + remaining; full payment fires a "payment received" notification |
| 7 | **Sign** the approved variation | Client gets "variation approved"; contract total updates; signed PDF in Documents |

---

## Part 5 — Test checklist

Tick these off:

**Onboarding & access**
- [ ] Clean invite → set password → login lands on `/client-portal`
- [ ] A client with no active project sees a graceful "no project linked" message
- [ ] Revoking a client (admin) blocks them server-side immediately (403)
- [ ] Inviting an existing client to a 2nd project links them (no 409)

**Security (the important one)**
- [ ] No ex-GST / cost_to_builder / margin / internal_notes anywhere in the client UI
- [ ] One client can't see another client's notifications
- [ ] Client can't reach another project (URL-swap a projectId → denied)

**Finance ↔ Portal**
- [ ] Variation: send → appears → approve → 409 on re-approve → sign → contract total updates
- [ ] Claim: issue → appears → partial pay (paid-to-date) → full pay (notification)
- [ ] **Void** variation/claim removes the live Approve/Pay button
- [ ] **Dispute** removes the pay button
- [ ] Voided/disputed claim rejects a payment notification

**Journey & content**
- [ ] Weekly update + "why we did it this way" render
- [ ] Site-diary draft can be published from admin → appears on Journey
- [ ] Confidence note shows on a watch/delayed stage
- [ ] Tagged + client-visible photos appear on their stage; untagged/hidden don't

**Documents**
- [ ] Variation/claim PDFs auto-appear in Documents
- [ ] A registered contract can be exposed and downloaded
- [ ] A signature-required doc prompts in My Actions and can be signed (409 on re-sign)

**Automated**
- [ ] `node scripts/real_data_dryrun.mjs` → **27 passed 0 failed**
- [ ] `node scripts/verify_migrations.mjs` → only pre-existing 101 missing

---

## Known non-blockers (don't fail the test on these)
- Photos are **tagged**, not uploaded, in the portal (a real upload pipeline is Phase 2)
- Site-diary/WHS/schedule producer records filing rollout is partial (variations/claims/diary done)
- Post-handover (practical_completion → past_client CRM) flow is Phase 2
- The nightly portal sync runs daily by default (`PORTAL_SYNC_ENABLED`); changes (milestone advance, reconciliation) appear within 24h, or immediately via `POST /api/cron/portal-sync`
