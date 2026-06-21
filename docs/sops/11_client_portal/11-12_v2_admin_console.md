---
sop_version: 1.0
last_reviewed: 2026-06-21
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested  <!-- untested | passed | failed | partial -->
---

# SOP 11-12: Admin Console (Portal v2.0)

**Module:** Client Portal v2.0  
**SOP ID:** 11-12  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin and Supervisor (the v2 admin console, `PortalV2Admin`, is route-allowed to both). Employees can hit some of the underlying admin endpoints, but the console is intended for Admin/Supervisor. **Sending the client invite is Admin-only** (see SOP 11-10).

## 2. When to use it
This is the builder's control panel for everything the client sees in portal v2.0. Use it to turn the portal on, set the build phase, list the project team, manage journey milestones and their confidence/health, create selections, schedule meetings, and publish the weekly update with the builder's reasoning. Open it whenever you are setting up a project's portal or keeping it current.

## 3. What this does
Lets the builder configure and feed the client's portal without touching the database. Toggling v2 on makes the new portal live for the project. The build phase drives which navigation the client sees. The team list shows the client who is working on their home. Milestones with a confidence note power the journey timeline and the build-health indicator. Selections, meetings and the weekly update each create what the client acts on and reads.

## 4. Before you start
- The project exists
- You are logged in as **Admin** or **Supervisor**
- For the team list, have the names/roles of the people on the project ready
- For milestones, have the project schedule open (Operations → Schedule) so the dates and current phase are right
- To then invite the client, you must be an **Admin** (SOP 11-10)

## 5. Step-by-step process

### Enable portal v2 + set build phase + team (Settings)
1. Go to **Portal Admin** → select the project → open the **v2 admin console** (PortalV2Admin) → **Settings**
2. Toggle **Enable portal v2** on
3. Set the **Build phase** — `pre_construction`, `on_site`, or `practical_completion`. This controls the client's navigation (Journey vs My Home)
4. Add **Team members** — each entry needs a **name** and **role** (these render as initials chips to the client)
5. Click **Save**

### Milestones + confidence (Journey timeline + build health)
6. Open the **Milestones** section
7. Add or edit a milestone: **key** (e.g. `frame`), **label** (e.g. "Frame complete"), **ETA**, and the **stage preview** ("what to expect")
8. Mark the current milestone — setting one as current clears the flag on the others
9. Set the milestone **confidence** (`on_track` / `at_risk` / `delayed`) and a **confidence note** so the client's build-health reads honestly
10. Save

### Selections
11. Open **Selections** → **Add selection**
12. Enter the selection title/category and its options (the basic form supports two options A/B, each with cost and lead-time impact)
13. Save — this creates the selection and a client action

### Meetings
14. Open **Meetings** → **Add meeting**
15. Enter date/time, location or link, and agenda; tick **request confirmation** to create a client action
16. Save

### Weekly update (with builder reasoning)
17. Open **Updates** → write the weekly update: **headline**, **body**, **week of**, and the builder's **reasoning** for any schedule call
18. Publish — the update appears on the client's Home and Journey

> 💡 **Tip:** Set milestone confidence honestly. The client's build-health card and the "On track for ~[date]" line are driven by it — an over-optimistic confidence will contradict reality the moment a date slips.

[insert screenshot: v2 admin console Settings with enable toggle, build phase, team list]

## 6. What happens next
- Saving Settings updates `projects` (`portal_v2_enabled`, `build_phase`, `team_members`)
- The client's navigation switches automatically when `build_phase = practical_completion` (Journey → My Home)
- Milestones upsert into `portal_milestones`; setting current clears `is_current` on siblings; confidence/notes feed the Journey and build-health
- A new selection creates a `client_selections` row (`status = 'awaiting_client'`) **and** a `client_actions` row, so it appears on the client's My Actions
- A meeting creates a `portal_meetings` row, and with "request confirmation" a `client_actions` row
- Publishing an update inserts a `portal_updates` row with `status` published; it shows on Home/Journey
- The **Overview** read shows a snapshot: milestones, selections, meetings, clients and open actions

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Leaving build phase wrong | Defaults not changed | Set it to match reality — it controls the client's nav (Journey vs My Home) |
| Team member missing a name | Free-text team JSON | Give every team entry a name and role — a missing name renders a blank chip |
| Setting milestone confidence then letting the nightly sync overwrite it | Admin and cron both write `is_current`/`confidence` | After a manual confidence change, re-check it the next day; if the sync keeps overwriting a manual note, flag it |
| Publishing an update with no reasoning | The form publishes immediately | Add the builder's reasoning — it is the whole point of the update and there is no draft/review step |
| Expecting an update to notify the client | No notification fires on publish | Tell the client to check the portal, or message them separately — publishing alone sends nothing |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| Client sees nothing new after enabling | Portal v2 toggle not saved, or client not invited | Confirm `portal_v2_enabled = true` saved; invite the client (SOP 11-10) |
| Build-health note doesn't show | Confidence note only renders for the current stage in build phase | Mark the milestone current and set its confidence note |
| Team chip is blank | A team entry has no `name` | Edit the team list and add the missing name |
| Milestone confidence keeps reverting overnight | The nightly sync re-writes `is_current`/`confidence` on matching schedule phases | Re-apply the manual value; if it persists, the milestone key collides with a schedule phase — rename the key or flag the contention |
| Update published but client unaware | No notification is sent on publish | Message the client separately; this is a known gap |
| Can't publish a document / set variation reasoning from the console | Those surfaces are not in `PortalV2Admin` | Variation `builder_reasoning` and document publishing are backend-only at present — set via API or finance auto-archive |

## 9. Related modules
- [Client Login & Invite](11-10_v2_client_login_and_invite.md) — SOP 11-10 (enable v2 here, then invite)
- [My Actions & Approvals](11-11_v2_my_actions_approvals.md) — SOP 11-11 (what the selections/meetings/variations you create become for the client)
- [Project Journey & Documents](11-13_v2_project_journey_and_documents.md) — SOP 11-13 (milestones + updates + photos the client reads)
- [Update portal milestones (legacy)](portal_update_milestones.md) — SOP 11-08 (the older token-portal milestone flow)

## 10. Screenshot placeholders
[insert screenshot: Settings panel — enable toggle, build phase selector, team list]
[insert screenshot: Milestones section with confidence and stage preview]
[insert screenshot: Weekly update form with headline, body and builder reasoning]

## 11. Automation notes
- All v2 admin endpoints are mounted under `/api/portal/admin/v2/:projectId/*` and gated by `requireRole(admin, supervisor, employee)` (`portalV2AdminRoutes.mjs`)
- API (settings): `PATCH /api/portal/admin/v2/:projectId/settings` — updates `projects` (`portal_v2_enabled`, `build_phase`, `team_members`); team validated as `Array.isArray`
- API (milestones): `POST` / `PATCH /api/portal/admin/v2/:projectId/milestones` — upsert into `portal_milestones`; setting `is_current` clears it on other rows; `confidence` + `confidence_note` settable
- API (selections): `POST` / `PATCH /api/portal/admin/v2/:projectId/selections` — creates `client_selections` (`status = 'awaiting_client'`) + a `client_actions` row
- API (meetings): `POST` / `PATCH /api/portal/admin/v2/:projectId/meetings` — creates `portal_meetings`; `requestConfirmation` also creates a `client_actions` row
- API (updates): `POST /api/portal/admin/v2/:projectId/updates` — inserts `portal_updates` (UI always publishes); author defaults to the caller's full name, else "Sam"
- API (decision reasoning): `PATCH /api/portal/admin/v2/:projectId/decisions/:id` — sets `builder_reasoning` / `requires_photo_evidence` (no UI surface — API only)
- API (overview): `GET /api/portal/admin/v2/:projectId/overview` — projects, milestones, selections, meetings, clients, open actions
- Records created/updated in: `projects`, `portal_milestones`, `client_selections` + `selection_options`, `portal_meetings`, `portal_updates`, `client_actions`
- Note: admin/console actions are **not** written to `portal_audit_logs` (only client actions are)

## 12. Edge cases and limits
- Build phase CHECK is limited to `pre_construction` / `on_site` / `practical_completion`
- Team members are free-text JSON; the only server validation is `Array.isArray` — a malformed entry renders a blank chip
- The selections form caps at two options (A/B) and has no image upload, no `lead_time_weeks`/`order_by_date` field in the basic form
- The updates form has no draft/review workflow — it always publishes, and publishing sends no notification
- Variation `builder_reasoning` and document publishing have endpoints but **no console UI** — they cannot be done from `PortalV2Admin`
- Toggling v2 off does not sign the client out or revoke membership
- The nightly sync also writes `is_current`/`confidence` and can overwrite a manual milestone value whose key matches a schedule phase

## 13. Owner of the process
Admin  
Next review date: 2026-12-21

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] Migration 103 applied
- [ ] Logged in as **Admin** (Supervisor used for the wrong-role test)
- [ ] A project selected in the project bar / open in Portal Admin

### Test cases

**TC-01 — Happy path (standard use): enable v2 + set phase + team**
1. Open the v2 admin console → Settings
2. Toggle **Enable portal v2** on, set **Build phase** to `on_site`, add one team member (name + role), Save
3. Expected result: the console shows v2 enabled and the team chip rendered
4. Expected DB record: `projects.portal_v2_enabled = true`, `build_phase = 'on_site'`, `team_members` JSON contains the entry with a name
- [ ] Pass  [ ] Fail

**TC-02 — Empty required field**
1. In the Milestones section, add a milestone leaving **label** (or **key**) blank
2. Save
3. Expected result: validation error (key and label are required); document the exact message
4. Expected DB: no new `portal_milestones` row
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission**
1. Create a selection with a title and two options, Save (TC happy path for selection)
2. Immediately submit the same selection again
3. Expected result: document whether a second `client_selections` row + `client_actions` row is created (a duplicate) or de-duped — record the actual behaviour
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role**
1. Log out and log in as a role that should not reach the console (e.g. a field **Employee** with no portal-admin access, or test the staff gate directly)
2. Attempt `PATCH /api/portal/admin/v2/:projectId/settings`
3. Expected result: blocked by `requireRole(admin, supervisor, employee)` — a non-staff caller gets 403; confirm a plain client JWT cannot reach the v2 admin namespace
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification**
1. Create a meeting with **request confirmation** ticked, and publish a weekly update
2. Check DB: a `portal_meetings` row exists and a linked `client_actions` row was created for the meeting
3. Check DB: a `portal_updates` row exists with the headline/body/reasoning and a published status
4. Check: `GET /api/portal/admin/v2/:projectId/overview` returns the new milestone, selection, meeting and open-action counts
- [ ] Pass  [ ] Fail

**TC-06 — Milestone is_current is exclusive + confidence (feature-specific)**
1. Add two milestones, mark the first as **current** with confidence `at_risk` and a confidence note
2. Then mark the second as current
3. Expected result: only the second is `is_current = true`; the first cleared
4. Expected DB: exactly one `portal_milestones` row with `is_current = true`; the confidence note persisted on its row
5. As the logged-in client, confirm the Journey/build-health shows the confidence note for the current stage
- [ ] Pass  [ ] Fail

**TC-07 — Update publishes but sends no notification (feature-specific)**
1. Publish a weekly update from the console
2. Check: the update appears on the client's Home/Journey
3. Expected result: **no** client notification email or in-app notification fires (`notification_sent_at` remains unset, `portal_notifications` has no new row) — document this confirmed gap
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors (check browser devtools Network tab)
- [ ] Database records created/updated with correct field values (`projects`, `portal_milestones`, `client_selections`, `portal_meetings`, `portal_updates`, `client_actions`)
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result
