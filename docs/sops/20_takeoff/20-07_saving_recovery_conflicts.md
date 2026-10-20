---
sop_version: 1.1
last_reviewed: 2026-10-20
app_version: takeoff-r03
screenshot_status: placeholders_only
owner: Admin / Director
test_status: untested  <!-- untested | passed | failed | partial -->
---

# SOP: Takeoff Saving, Recovery and Conflicts

**Module:** Takeoffs (flashing takeoff from plans)  
**SOP ID:** 20-07  
**Status:** Draft  
**Priority:** High

> **Feature status (2026-10-13):** Takeoffs ship **switched off** behind the server flag `TAKEOFF_ENABLED`, and **database migration 206 has not been applied in production**. Nothing in this SOP has been tested against the live app. See SOP 20-01 for switching it on.

---

## 1. Who uses this

- Everyone who edits takeoffs: **Admin (Director)**, **Supervisor** (Hub) and **Leading hands** (Worker app).
- View-only users and admins previewing a leading hand never have unsaved changes (they can't edit), so they won't see recovery or conflict banners.

---

## 2. When to use it

- To understand the save chip (**Saved / Saving… / Not synced / Conflict / Not saved**).
- When the signal drops on site while measuring.
- When the app was closed, crashed or reloaded before your changes saved, and it offers to restore them.
- When two people edit the same takeoff at the same time and you see **Conflict**.
- When the screen says **Recovery unavailable**.

---

## 3. What this does

Takeoffs save automatically about half a second after each change — there is no Save button. The chip only says **Saved** once the server has confirmed it. While a change is waiting it is also kept on **this device** (in the browser's storage, for this login and this takeoff), so a dropped signal, a crash or a reload doesn't lose it. If someone else saved the same takeoff first, your changes are **never** silently written over theirs — you choose what to do. This is **recovery, not offline mode**: plans are not stored on the phone, and exports and order records need a connection.

---

## 4. Before you start

- You are signed in and have edit access to the takeoff (SOP 20-01).
- Use a normal browser window or the installed Worker app. Private/incognito windows, blocked site storage or a full phone can stop recovery working ("Recovery unavailable").
- Recovery is per device and per browser: changes kept on your phone aren't visible on the office computer until they are saved.

---

## 5. Step-by-step process

### A. Read the save chip

The chip appears in the takeoff header, the Measure screen header and the Length schedule header.

| Chip | Meaning | What to do |
|---|---|---|
| **Saved** | The server has everything | Nothing |
| **Saving…** | Your latest change is being sent | Wait a moment |
| **Not synced** | Changes are waiting — usually no signal | Keep working; it saves when the connection is back. Don't close the app if you also see "Recovery unavailable" |
| **Conflict** | Someone else saved this takeoff first | Go to the overview and choose (Section E) |
| **Not saved** | The server refused the change for another reason | Read the message; tap **Try again** on the overview |

### B. Working normally

1. Make your change (a tap, a length, a rule). The chip shows **Saving…** then **Saved**.
2. You can leave the screen as soon as it says **Saved**.

### C. When the signal drops

1. The chip shows **Not synced** and the message "No connection — your changes are kept on this device and will save when you're back online."
2. Keep measuring on the plan that is already open. Your changes stay visible and are kept on the device.
3. You can't open a **different** plan, export a PDF or record an order until you're back online (those need the server).
4. When the connection returns the changes save by themselves and the chip goes to **Saved**.

> 💡 **Tip:** Plans aren't stored for offline use. Open the plan you need while you still have signal.

### D. Restore changes kept on this device

1. Reopen the takeoff on the same device and login.
2. If unsaved changes were kept, an amber banner says "Unsaved changes from <date and time> were found on this device."
3. Tap **Restore** to put them back — they then save normally. Tap **Discard** to throw them away.
4. If the banner adds "— made on an older version; you'll choose how to apply them.", someone has saved the takeoff since. Tap **Restore**: the chip shows **Conflict** and a message "These recovered changes were made on an older version. Review, then choose how to apply them." Then follow Section E.

[insert screenshot: overview banner "Unsaved changes from 13/10/2026, 2:41 pm were found on this device." with Discard / Restore]

### E. Resolve a conflict

1. If you are in the Measure or schedule screen, tap **Done** / **Back** to return to the overview (the choice is made there). While the chip says **Conflict**, new edits are held on the device but not sent.
2. The red banner reads "Someone else saved this takeoff first. Your changes are kept on this device — reload to compare." followed by "Your unsaved changes: …" (e.g. "2 measurement(s) added or changed; 1 material(s) added or changed").
3. Choose one:
   - **Apply my changes to latest** — loads the other person's version and then re-sends your changes on top of it. The server re-checks everything. Where you both changed the **same** item, your version of that item wins. Use this when your changes are additions (new runs, counts, materials) that don't clash.
   - **Load latest (keep mine as a copy)** — throws your changes off the screen and shows the other person's version. Your changes are put back in this device's recovery store and will be offered again (Section D) **the next time you open this takeoff — but only if you don't make and save any new changes first** (the device keeps one recovery copy per takeoff).
4. Check the result and that the chip returns to **Saved**.

[insert screenshot: overview conflict banner with "Load latest (keep mine as a copy)" and "Apply my changes to latest"]

### F. "Not saved" and other errors

1. A red banner on the overview shows the reason (for example "That material is not in this takeoff." if someone removed it).
2. If it looks temporary (server busy, a brief outage), tap **Try again** — the same change is sent again exactly as before.
3. If **Try again** keeps failing with the **same** message, the server is refusing that change itself (it will never be accepted as it is). Newer edits wait behind it and won't save either. To clear it:
   1. Write down what you changed since the last **Saved**.
   2. Tap **‹ Takeoffs** / **‹ Back to job** (Hub) or go back in the Worker app to leave the takeoff, then open it again.
   3. On the "Unsaved changes … were found on this device" banner tap **Discard** (this drops **all** unsaved changes on this device for this takeoff).
   4. Redo the work correctly.

### G. Recovery unavailable

1. An amber banner says "Recovery unavailable on this device (storage blocked or full). Your edits are kept while this screen stays open."
2. Your edits still save normally while you're online, but they are **not** protected against a crash or closing the app.
3. Stay on the screen until the chip says **Saved**. Then free up phone storage, leave private browsing, or allow site storage before the next session.

### H. Signing out and old drafts

1. In the Hub, **Sign out** deletes this device's unsaved takeoff drafts for the last person who used Takeoffs on it. Make sure the chip says **Saved** before signing out.
2. The Worker app has no sign-out; unsaved drafts stay on the phone until they are saved, discarded, or 7 days pass.
3. Drafts older than 7 days are deleted automatically and not offered.

---

### I. Unfinished drawings on this device (flashing drawings, HUB 018)

A flashing drawing saves itself as you draw — there is no Apply or Save step. The device also keeps a copy of a drawing **while it is open**, so a reload, a closed app or a dropped phone doesn't lose it.

1. **Close**, **Details** or **Lengths** in the drawing **finishes** it: the shape is already in the flashing, and the device copy goes. A size you typed that isn't valid yet, or a lone start point, is dropped; the last valid shape stays. **Done** on a size sheet puts the last valid size back.
2. An **"Unfinished drawing on this device: <name> …"** card appears in Flashings only when a drawing was interrupted (reload, app closed, back button) and still holds something the flashing doesn't: "(has a size that isn't valid yet).", "— newer than the saved drawing." or "— not in the takeoff yet." A drawing already saved exactly as it is never shows a card; old cards like that clear themselves.
3. **Continue drawing** reopens that exact drawing under its own name (e.g. "Flashing 3") — never a blank "New flashing".
4. **Discard** asks "Discard this unfinished drawing from this device?" and removes only that drawing's copy. Removing a flashing also removes its card.
5. A brand-new flashing that is cleared or undone back to nothing and closed is not kept in the takeoff. An existing flashing you clear saves as cleared (Undo brings it back).
6. "This flashing was changed elsewhere …" keeps your device copy until you choose **Use my drawing** or **Keep the saved one**.

## 6. What happens next

- Saved changes are visible to everyone who opens the takeoff (they see them when they next open or reload it — screens don't live-update).
- After a conflict is resolved the takeoff carries on saving automatically.
- Orders and exports always use the last **saved** version (SOP 20-06), never unsaved changes on someone's phone.
- No email or notification is sent when a save, conflict or recovery happens.

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Closing the app while it says **Not synced** with "Recovery unavailable" showing | Expecting the device to keep it | Wait for **Saved** |
| Tapping **Discard** on the recovery banner without reading it | It looks like a nuisance | Restore unless you know the changes are wrong |
| Choosing **Load latest** and then measuring straight away | Expecting the old changes to be kept | New saved edits replace the kept copy — restore it first, or use **Apply my changes to latest** |
| Two people measuring the same takeoff at once | Nobody knows the other is in | Agree who is measuring; use separate takeoffs for separate areas if needed |
| Signing out of the Hub with unsaved changes | Sign-out clears device drafts | Check the chip says **Saved** first |
| Expecting the takeoff to work fully offline | It's recovery only | Open plans while you have signal; export and record orders online |

---

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| "No connection — your changes are kept on this device and will save when you're back online." | No signal | Keep working; it saves when back online |
| Several "Unfinished drawing on this device" cards at once | Drawings interrupted by a reload or the app closing (before HUB 018, leaving by Details or Lengths also left one) | Tap **Continue drawing** to finish one (Close finishes it) or **Discard** to drop that copy; finished ones clear themselves |
| "Someone else saved this takeoff first. Your changes are kept on this device — reload to compare." | Another person saved first | Section E |
| "These recovered changes were made on an older version. Review, then choose how to apply them." | Restored changes from an older version | Section E |
| "Recovery unavailable on this device (storage blocked or full). Your edits are kept while this screen stays open." | Browser storage blocked or full | Section G |
| "You can view this takeoff but not change it." | Your access is view-only | Ask an Admin, Supervisor or leading hand |
| "The takeoff changed while loading — reload." / "The takeoff is busy — try again." | Someone saved while it was loading | Reload / **Try again** |
| "This takeoff is archived." | The takeoff has been archived | Use another takeoff |
| "That takeoff item was not found." | An item was removed by someone else | Reload the takeoff |
| "That item isn't part of this job's takeoff." | A change pointed at another job's item | Reload; report if it repeats |
| "That record is frozen and can't be changed." | Tried to change a scale, export or placed order | Make a new one instead (re-scale / new export / new order) |
| "That was already saved." | Duplicate save | Nothing to do — reload to check |
| "Missing takeoff revision." / "Invalid idempotency key." | App/API version mismatch | Reload the app (Hub: refresh; Worker app: close and reopen) |
| "Takeoffs aren't switched on yet." while saving | Feature switched off mid-session | Your changes stay in device recovery; ask the Director (SOP 20-01) |
| **Try again** keeps failing with the same message | The server refuses that particular change | Section 5F step 3 |

---

## 9. Related modules

- [20-01 Takeoff overview and access → roles and the feature switch](20-01_takeoff_overview.md)
- [20-03 Measure runs and count pieces → the edits being saved](20-03_measure_runs_and_count.md)
- [20-06 Export a supplier order → orders use the saved version only](20-06_export_and_record_orders.md)
- [00-01 Sign in to Blue Leaf Hub → signing out clears takeoff drafts](../00_getting_started/login_sign_in.md)

---

## 10. Screenshot placeholders

[insert screenshot: header save chip in each state — Saved, Saving…, Not synced, Conflict, Not saved]
[insert screenshot: Measure screen with "Not synced" chip and the "No connection…" message in the panel]
[insert screenshot: recovery banner — "made on an older version; you'll choose how to apply them."]
[insert screenshot: conflict banner listing "Your unsaved changes: …"]
[insert screenshot: "Recovery unavailable on this device" banner]

---

## 11. Automation notes

- **Autosave:** completed edits are merged into a pending change-set and committed ~500 ms after the last edit: `POST /api/takeoff/workspaces/:id/commit` (Worker app: `/api/worker/takeoff/workspaces/:id/commit`) with `{ expectedRevision, idempotencyKey: "c-<uuid>", changes }`. One key per batch; a retried batch with the same key returns the original result (`replayed: true`) and never applies twice.
- **Server:** recalculates everything from the saved data, then the `takeoff_commit` database function locks the takeoff row, checks `revision = expectedRevision` (compare-and-swap) and applies all changes in **one transaction**; `takeoff_workspaces.revision` + 1, `updated_by_type` / `updated_by_user_id` or `updated_by_employee_id` set; the key is recorded in `takeoff_idempotency` (`operation` 'commit').
- **Conflict:** revision mismatch → HTTP 409 `CONFLICT`. The app keeps every local edit and waits for the user's choice; it never overwrites automatically.
- **No answer (network drop or server error):** the batch is **held** and resent **unchanged** — same idempotency key, same base revision — so a save whose reply was lost is replayed (`replayed: true`) instead of looking like someone else's save. Newer edits queue behind it. Network → **Not synced** (the app keeps retrying roughly every half second and immediately when the browser reports it is back online); server error → **Not saved** until **Try again**.
- **Device recovery store:** IndexedDB database `blh-takeoff-recovery`, store `drafts`, one record per **actor + takeoff** (`key` = "<actorKey>|<workspaceId>"; actorKey = `staff:<user id>`, `employee:<employee id>` or `preview:<employee id>`) holding `baseRevision`, the pending `changes` and `savedAt`. Written immediately after every completed edit and when the app is hidden or closed (visibility change / page hide). Deleted when the server confirms everything is saved, on **Discard**, after 7 days, or on Hub sign-out (for the last actor remembered in `localStorage` key `blhub_takeoff_actor`). It never contains tokens, passwords or signed plan URLs.
- **Recovery offer:** only shown after the takeoff has loaded with your login and permissions; same base revision → plain Restore; different base → Restore leads to the Conflict choice.
- No email, notification or server-side draft is created by recovery.

---

## 12. Edge cases and limits

- **Known limit:** an edit made within a fraction of a second of the app being killed (before the device write finishes) may not be in recovery.
- Recovery is not offline sync: plans aren't cached on the device, there is no background sync, and exports / placements / opening a new plan need a connection.
- One recovery copy per takeoff per login per device — a newer unsaved edit replaces the previous copy (including a copy kept by **Load latest (keep mine as a copy)**).
- Recovery records expire after 7 days.
- Changes kept on one device or browser are invisible to other devices until saved.
- **Apply my changes to latest** re-sends your version of each changed item; if the other person changed the same item, yours replaces theirs for that item. Items only they changed are kept.
- Undo/redo history in the Measure screen is not part of recovery and is lost when you leave that screen.
- Other people's screens don't update live; they see your saved changes when they reopen/reload.
- A change the server refuses outright (HTTP 400, e.g. a manual length over 30 m, or a scale check that re-uses the scaling dimension) is resent unchanged by **Try again**, and blocks later edits from saving. There is no "drop just this change" button — leave and reopen the takeoff, then **Discard** on the recovery banner (Section 5F), which drops every unsaved change on that device.

---

## 13. Owner of the process

Admin / Director  
Next review date: 2027-04-13

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** This section contains every test that must be executed to verify this feature works correctly. Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] Local dev, isolated/test database **with migration 206 applied**, `TAKEOFF_ENABLED=true`.
- [ ] A `BLH TEST` carpentry job with a takeoff, a **Ready** scaled plan and one flashing material.
- [ ] Two browsers/profiles logged in as Admin (Session A) and Supervisor (Session B); a leading-hand Worker-app token.
- [ ] Devtools open: Network tab (with request blocking and offline mode) and Application › IndexedDB.

### Test cases

**TC-01 — Happy path (autosave)**
1. Session A: note the takeoff `revision` R. Add one manual length (1,000 × 1).
2. Expected result: chip **Saving…** then **Saved**; no banner.
3. Expected API: one `POST …/workspaces/<id>/commit` ~0.5 s after the edit, body `{ expectedRevision: R, idempotencyKey: "c-…", changes: { measurements: { upsert: [ … ] }, contributions: { upsert: [ … ] }, … } }` → `{ ok: true, commit: { revision: R+1, replayed: false }, snapshot, computed, orderStatus }`.
4. Expected DB record: `takeoff_workspaces.revision` = R+1, `updated_by_type` 'staff', `updated_by_user_id` = admin; new `takeoff_measurements` row (`kind` 'manual'); `takeoff_idempotency` row (`scope_id` = workspace id, `key` = the sent key, `operation` 'commit'). IndexedDB `blh-takeoff-recovery` › `drafts` has **no** record for "staff:<uid>|<workspace id>" after **Saved**.
- [ ] Pass  [ ] Fail

**TC-02 — Empty required field**
1. Send `POST …/commit` without `expectedRevision`.
2. Send it with `idempotencyKey: "abc"`.
3. Expected result: HTTP 400 "Missing takeoff revision."; HTTP 400 "Invalid idempotency key."
4. Expected DB: `revision` unchanged.
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission (A09)**
1. Re-send the exact TC-01 commit (same key and body).
2. Expected result: HTTP 200 `{ ok: true, commit: { revision: R+1, replayed: true } … }`.
3. Expected DB: still one manual measurement from TC-01; `revision` still R+1.
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role**
1. Admin preview of the leading hand: open the takeoff; confirm no recovery/conflict banners and no edit controls; call `POST /api/worker/takeoff/workspaces/<id>/commit` with the preview header.
2. Ordinary-worker token: call the same commit.
3. Expected result: step 1 → HTTP 403 "Read-only preview — you can't submit or complete work as a worker."; step 2 → HTTP 403 "Takeoffs are for leading hands and office staff."
4. Expected DB: `revision` unchanged; no IndexedDB draft written for "preview:<employee id>".
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification (device recovery record)**
1. Block `*/commit` in devtools. Add a run.
2. Inspect IndexedDB `blh-takeoff-recovery` › `drafts`.
3. Expected result: a record with `key` "staff:<uid>|<workspace id>", `actorKey`, `workspaceId`, `baseRevision` = current revision, `changes` containing the new run, `savedAt`. Searching the record shows **no** token, password, `http` URL or signed URL. Unblock: the chip goes **Saved** and the record is deleted.
- [ ] Pass  [ ] Fail

**TC-06 — Two writers (A08)**
1. Both sessions open the takeoff at revision R. Session B adds a count and saves (R+1).
2. Session A (still on R) adds a run.
3. Expected result: Session A chip **Conflict**; overview banner "Someone else saved this takeoff first. Your changes are kept on this device — reload to compare. Your unsaved changes: 1 measurement(s) added or changed; assignments / splits changed."; HTTP 409 `CONFLICT` in Network; DB shows only Session B's change (revision R+1).
4. Session A taps **Apply my changes to latest** → revision R+2 containing both the count and the run.
5. Repeat steps 1–2 and choose **Load latest (keep mine as a copy)** → Session A shows only Session B's version; the IndexedDB record still holds Session A's run; reopening the takeoff offers "… made on an older version …".
- [ ] Pass  [ ] Fail

**TC-07 — Short network loss (A18)**
1. Session A: devtools **Offline**. Add two runs.
2. Expected result: chip **Not synced** (never **Saved**); message "No connection — your changes are kept on this device and will save when you're back online."; runs remain visible; opening Orders/export fails with a network message.
3. Go back online.
4. Expected result: chip **Saved** without user action; DB has exactly two new run rows (no duplicates).
- [ ] Pass  [ ] Fail

**TC-08 — Reload recovery (A19)**
1. Block `*/commit`; add a run; close the tab. Unblock; reopen the takeoff.
2. Expected result: banner "Unsaved changes from <time> were found on this device." → **Restore** → **Saved**; run saved once.
3. Repeat step 1, but before reopening have Session B save a change. Reopen in Session A.
4. Expected result: banner adds "— made on an older version; you'll choose how to apply them."; **Restore** → chip **Conflict** with "These recovered changes were made on an older version. Review, then choose how to apply them."; nothing is written to the server until a choice is made.
5. Log in as a different user on the same browser and open the takeoff → no recovery banner (records are per actor).
- [ ] Pass  [ ] Fail

**TC-09 — Storage unavailable (A20)**
1. Make IndexedDB unavailable (e.g. Safari private window, or block site storage in Chrome settings, or the test hook `_setIndexedDbFactory` in `src/lib/takeoffRecovery.js` returning a failing factory). Open the takeoff and edit.
2. Expected result: banner "Recovery unavailable on this device (storage blocked or full). Your edits are kept while this screen stays open."; edits remain on screen and still save when online.
- [ ] Pass  [ ] Fail

**TC-10 — Sign-out clears drafts**
1. Hub Session A: block `*/commit`, add a run (draft written), keep commits blocked and click **Sign out**.
2. Expected result: IndexedDB record for "staff:<uid>|<workspace id>" deleted; `localStorage` key `blhub_takeoff_actor` removed; signing back in shows no recovery banner.
- [ ] Pass  [ ] Fail

**TC-11 — 7-day expiry**
1. Create a draft (blocked commit), close the tab, then edit the IndexedDB record's `savedAt` to 8 days ago.
2. Reopen the takeoff.
3. Expected result: no recovery banner; the record is deleted.
- [ ] Pass  [ ] Fail

**TC-12 — "Keep mine as a copy" is replaced by new edits (documents current behaviour)**
1. Create a conflict and choose **Load latest (keep mine as a copy)**.
2. Without reopening, add a new manual length and let it save.
3. Reopen the takeoff.
4. Expected result (current code): no recovery banner — the kept copy was overwritten by the newer edit and then cleared when it saved. Record the result; this is a known gap reported to the owner.
- [ ] Pass  [ ] Fail

**TC-13 — Lost response is replayed, not a false conflict (A09 / A18)**
1. Put a breakpoint in the commit route (`server/lib/takeoff/takeoffRoutes.mjs`, after `commitWorkspace` returns) or use a local proxy that drops the response. Add a run; let the server commit, then drop the connection before the reply reaches the browser. Release the breakpoint / restore the network.
2. Expected result: chip **Not synced** while the reply is missing, then **Saved**; the resend carries the **same** `idempotencyKey` and `expectedRevision` and gets `commit.replayed: true`; no **Conflict** banner; exactly one new run row; `revision` increased once.
- [ ] Pass  [ ] Fail

**TC-14 — A refused change blocks later saves until discarded (documents current behaviour)**
1. Make a change the screen allows but the server refuses: **Add lengths** with Finished length 31000 × 1 (server: HTTP 400 "Finished length looks too large (over 30 m)."). Then add a valid manual length (1,000 × 1).
2. Tap **Try again** on the overview.
3. Leave the takeoff, reopen it, tap **Discard** on the recovery banner.
4. Expected result: steps 1–2 — chip **Not saved**, the same message every time, and the manual length is **not** saved either; step 3 — after Discard the chip is **Saved**, the screen matches the server and neither change exists. Record the result; the lack of a "drop just this change" option is a known gap reported to the owner.
- [ ] Pass  [ ] Fail

**TC-15 — Unfinished drawings: Continue, finish, Discard (HUB 018, UI Review)**
1. Flashings → Apron flashing → **Profile**: tap L1, type "." and reload. Then **Add flashing** → **New flashing**, tap one point and reload. Expected: exactly two cards — "Apron flashing (has a size that isn't valid yet)." and "Flashing N — not in the takeoff yet." — and no "New flashing".
2. **Continue drawing** on Flashing N. Expected: the dialog is "Flashing N" with "Tap the end of the first leg."; tap two points → **Close**: its card goes, the Apron card stays, and Flashing N is in the takeoff with its legs. No Apply/Save button.
3. **Discard** on the Apron card → Cancel: the card stays; **Discard** → OK: it goes. Apron and Barge drawings are unchanged; no flashing has a blank shape. Reload: no cards.
4. Open a drawing and leave by **Lengths**; change another and leave by **Details**; draw a new one and **Close**. Expected: no card, and none after a reload. A new drawing cleared with **Clear drawing** and closed leaves no flashing. Node: scripts/tests/takeoff-tc-hub018.test.mjs.
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors (check browser devtools Network tab)
- [ ] Database records created with correct field values
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result
