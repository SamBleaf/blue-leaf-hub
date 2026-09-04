---
sop_version: 1.0
last_reviewed: 2026-09-04
app_version: main
screenshot_status: placeholders_only
owner: Admin / Supervisor
test_status: untested
---

# SOP: Consultant comms & the client’s pre-construction portal

**Module:** Sales
**SOP ID:** 02-27
**Status:** Draft
**Priority:** High

---

## 1. Who uses this

Admin and Supervisor staff who coordinate a job’s design team in the **Consultants** stage — the person who talks to the architect, interior designer, engineer, lighting and sanitary consultants, and who keeps the client in the loop. No technical knowledge is needed. Blue Leaf sits in the middle of every conversation: the consultants are on email / in the Hub, the client is in their portal, and you relay between them.

## 2. When to use it

Use it from the Consultants stage onward, whenever:

- You send a consultant a brief, a question or a document by email, or take a reply from them by phone.
- The client says something about the design that a consultant needs to hear (or vice-versa).
- You want the client to be able to see the design team and message you about it — set up their **pre-construction portal**.
- You need one place that shows the full history of who said what to whom, per consultant.

It runs the whole time the design is being coordinated, before the build starts.

## 3. What this does

Three connected pieces:

1. **Consultant comms (the Hub thread).** Every message about a consultant is logged in one thread per consultant — a note you type (a phone reply, an internal remark, something the client relayed) or an email you send the consultant directly. Each message records **who** it’s from (Client / Blue Leaf / Consultant), **how** it travelled (note / email / phone / portal), and whether it is **shared with the client**. This is the single source of truth — nothing about the design lives only in someone’s inbox.
2. **The client’s pre-construction portal.** Normally the client’s portal only exists once the job is Won. This lets you open it **early**, during design, so the client has a home for the design team and the messages you choose to share. Operations never sees this project until the job is Won (it stays hidden until then).
3. **The client’s Design Team page.** In the portal the client sees the design disciplines on their job, reads the messages you shared, and can send you a message (optionally about a specific discipline). Their reply lands straight back in the same Hub thread and emails the office. The client never emails the consultants directly — you broker every exchange.

**Sending real emails to consultants is OFF by default.** Logging a note always works. Actually emailing a consultant only sends when `CONSULTANT_EMAIL_ENABLED` is set — otherwise you get a clear message and can log the note instead.

## 4. Before you start

- The lead is at the **Consultants** stage (or later) and has a **consultant roster** — add the consultants first (see [02-24](02-24_consultants_stage_roster_deliverables.md)).
- To **email** a consultant: that consultant has a **CRM contact selected** on the roster row, and that contact has a valid email address (add it in the CRM). Real sending also needs `CONSULTANT_EMAIL_ENABLED=true` in the environment — otherwise logging still works.
- To set up the **pre-construction portal**: the lead has a **linked job** (created when the PTSA / Plans stage is signed).
- Migrations **198** (`consultant_messages`) and **199** (`projects.is_preconstruction`) are applied. Before 198, logging a note returns “Consultant comms need migration 198”. Before 199, setting up the portal returns “Apply migration 199 first”.
- To invite the client into the portal you (or an admin) use the existing **Portal admin** screen — this SOP links straight to it.

## 5. Step-by-step process

### A. Log or send a consultant message

1. Open the lead → **Consultants** stage.
2. Find the consultant’s row in **Consultants & deliverables**. Under the row, click **▸ Comms (N)** to open their thread.
   [insert screenshot: a consultant roster row with the “Comms” thread expanded]
3. In the composer, choose the type:
   - **Log a note** — then pick who it’s **from** (From consultant / From client / Internal note) and **how** it came in (Phone / Note / Portal). Type what was said.
   - **Email the consultant** — type a **Subject** and the message. (Requires a CRM contact with an email on the row.)
4. If the client should see this message in their portal, tick **Share with client (portal)**.
5. Click **Log** (for a note) or **Send + log** (for an email). The message appears in the thread with a coloured badge for who it’s from.
6. To share or unshare a message later, click the **hidden / 👁 shared** pill on that message. To delete a message, click the **×**.
   [insert screenshot: composer with “Email the consultant” selected + the Share-with-client toggle]

### B. Set up the client’s pre-construction portal

7. At the top of the Consultants stage, find **Client pre-construction portal**.
8. If it says the job isn’t created yet, finish the **PTSA / Plans** stage first (that creates the job).
9. Click **Set up the client’s portal →**. The card confirms the portal is active and shows the address.
   [insert screenshot: “Client pre-construction portal” card after set-up, showing the address + Open Portal admin link]
10. Click **Open Portal admin (invite client, manage access) ↗** to go to the Portal admin, where you invite the client and manage their login (admin only).

### C. What the client does (Design Team page)

11. Once invited, the client signs in to their portal and opens **Design Team**.
12. They see the design disciplines on their job (chips), read the messages you shared, and can send a message — optionally tagged “About: [discipline]”.
13. Their message arrives back in the matching Hub thread as a **Client** message, and the office gets an email prompting a reply. Reply from the Hub (Consultants → the consultant’s **Comms** thread), sharing your reply with the client if appropriate.

## 6. What happens next

- Every message is stored in `consultant_messages` against the lead, so the whole history survives stage changes and is there at handoff.
- When the job is **Won**, the pre-construction project **graduates** into the live Operations project automatically (the same row — the portal, its comms and the client’s login all carry over), and it appears on the Operations board.
- Messages you marked **shared** remain visible to the client in the portal; internal ones never are.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---|---|---|
| Emailing a consultant with no contact selected | The row has a role but no CRM contact | Select the consultant’s CRM contact on the roster row first; add their email in the CRM |
| Expecting the email to send with the flag off | Sending is OFF by default | Set `CONSULTANT_EMAIL_ENABLED` to send; otherwise log the note instead |
| Sharing an internal remark with the client by accident | The Share toggle was left on | Check the **Share with client** toggle before you log; unshare with the pill afterwards if needed |
| Setting up the portal before the job exists | The portal is keyed to the job | Sign the PTSA / Plans stage first, then set up the portal |
| Telling the client to email the consultant directly | Skipping the broker model | All client↔consultant messages go through you — keep them in the portal / Hub threads |
| Thinking Operations can see the pre-con project | It looks like a normal project | It’s hidden from Operations until Won — that’s intended |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|---|---|---|
| “Consultant comms need migration 198” when logging a note | Migration 198 not applied | Apply `198_consultant_comms.sql`, then `NOTIFY pgrst, 'reload schema';` |
| “Apply migration 199 first (pre-construction portal)” | Migration 199 not applied | Apply `199_preconstruction_portal.sql`, then reload the schema |
| “Consultant email sending is turned off…” | `CONSULTANT_EMAIL_ENABLED` not set | Set it to `true` to send, or click **Log a note** instead |
| “That consultant contact has no valid email address” | The CRM contact has no email | Add the email to the contact in the CRM |
| “Create the job first (at PTSA signing)…” | The lead has no linked job | Complete the PTSA / Plans stage to create the job |
| Client can’t see a message you sent | It wasn’t shared | Open the consultant’s Comms thread and click the message’s **hidden** pill so it reads **👁 shared** |
| Client’s Design Team page is empty | No client-facing consultants on the roster, or nothing shared yet | Add client-facing consultants (architect / interior / lighting / sanitary) and share at least one message |

## 9. Related modules

- [02-24 Run the Consultants stage — roster, deliverables & dependency schedule](02-24_consultants_stage_roster_deliverables.md) — the roster these comms hang off.
- [02-25 Track planning & building consent (the PlanSA consent spine)](02-25_consent_spine.md) — the other Consultants/Won tracker.
- [02-23 Complete a Won lead and hand off to Operations](02-23_won_ops_handoff.md) — where the pre-con project graduates to a live project.
- Client Portal SOPs (folder `11_client_portal`) — inviting the client and managing portal access.

## 10. Screenshot placeholders

- [insert screenshot: Consultants stage — a roster row with the “Comms” thread open, showing messages with Client / Blue Leaf / Consultant badges]
- [insert screenshot: the comms composer set to “Email the consultant” with a subject + the Share-with-client toggle]
- [insert screenshot: a message’s hidden ↔ 👁 shared pill]
- [insert screenshot: “Client pre-construction portal” card before set-up (Set up the client’s portal button)]
- [insert screenshot: the same card after set-up (active + Open Portal admin link)]
- [insert screenshot: client’s Design Team page — discipline chips + shared thread + composer with the discipline picker]

## 11. Automation notes

- **Log / send a consultant message** — `POST /api/sales/leads/:id/consultant-comms`. Body `{ role, contactId, kind, subject, body, clientVisible, participant, channel }`. `kind:"note"` inserts a `consultant_messages` row (participant = client|blue_leaf|consultant, channel = note|phone|portal, direction = internal|inbound). `kind:"email"` — **gated by `CONSULTANT_EMAIL_ENABLED`** (503 when off) — looks up the CRM contact’s email, sends via `sendPlainMail` with the caller’s signature, then inserts the row (channel `email`, direction `outbound`, `message_id` stamped) and logs a `lead_activities` row `Consultant email sent (role): subject`.
- **View the thread** — `GET /api/sales/leads/:id/consultant-comms` → `{ messages }` (all rows for the lead, ascending). Returns `{ messages: [], tableMissing: true }` before migration 198.
- **Toggle sharing** — `PATCH /api/sales/leads/:leadId/consultant-comms/:msgId` with `{ clientVisible }` updates `consultant_messages.client_visible`. **Delete** — `DELETE …/:msgId`.
- **Set up / check the pre-con portal** — `POST /api/sales/leads/:id/preconstruction-portal` creates (or reuses) the job’s `projects` row with `is_preconstruction=true`, `build_phase='pre_construction'`, `portal_v2_enabled=true`, and logs a `lead_activities` note “Pre-construction client portal set up”. `GET …/preconstruction-portal` returns the current project state. Both 503 before migration 199.
- **On win** — `finalizeWonJob` sets `projects.is_preconstruction=false` for the job, so the pre-con project becomes the live Operations project (trigger 096 does not create a duplicate).
- **Ops board** — `GET /api/operations/projects` hides `is_preconstruction=true` projects (soft-degrades on a pre-migration DB).
- **Client side (portal, JWT surface)** — `GET /api/portal/app/:projectId/design-team` returns the client-facing disciplines + `client_visible` messages (resolved project → `job_id` → lead → `consultant_messages`). `POST /api/portal/app/:projectId/design-team/messages` (login required) inserts a client-authored, portal-channel, `client_visible` message into the same thread and emails `admin@blueleafbuilding.com.au`.

## 12. Edge cases and limits

- **No API into consultants’ inboxes.** Inbound consultant email replies are captured **manually** (log a note) for now — automatic capture via the mailbox poller is a planned follow-on.
- **Client-facing disciplines only.** The client’s Design Team page shows architect / interior designer / lighting / sanitary; internal-only disciplines (engineer, surveyor, soil, energy) never appear to the client even if a message about them is shared.
- **One thread per role.** Messages are grouped by the consultant’s role; if two consultants share a role their messages share a thread.
- **Pre-con project is invisible to Operations/field** until Won — deliberately. Don’t look for it on the Operations board before then.
- **Deleting a message is permanent** — there is no undo.

## 13. Owner of the process

**Owner:** Admin / Supervisor (Sales). **Next review:** 2027-03-04 (6 months from last_reviewed).

## 14. Troubleshoot Agent Test Script

**Pre-test setup:** Use a test lead at the **Consultants** stage with at least one client-facing consultant on the roster (e.g. an **interior designer**) that has a CRM contact selected, and a linked **job** (sign the PTSA / Plans stage). Ensure migrations 198 + 199 are applied. Keep `CONSULTANT_EMAIL_ENABLED` **unset** for the send-gate test.

**TC-01 — Happy path: log a note in a consultant thread**
1. Open the test lead → Consultants → expand the interior designer’s **Comms** thread.
2. Composer: **Log a note**, from **From consultant**, how **Phone**; type “Confirmed the kitchen joinery drawings by Friday.”; click **Log**.
- Expected UI: the message appears with a **Consultant** badge, channel **📞 phone**, today’s date.
- Expected DB: a `consultant_messages` row — `lead_id` = this lead, `consultant_role` = `interior_designer`, `participant` = `consultant`, `channel` = `phone`, `direction` = `inbound`, `body` = the text, `client_visible` = `false`.
- [ ] Pass  [ ] Fail

**TC-02 — Empty required field: blank body is rejected**
1. In the composer, leave the message empty and click **Log**.
- Expected UI: “Write a message first.” No row is created.
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission: two identical notes both record**
1. Log the same note text twice.
- Expected: two distinct `consultant_messages` rows (each message is its own record — there is no dedupe; the thread shows both).
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role: a portal client cannot reach the staff endpoint**
1. With a portal client’s token, call `GET /api/sales/leads/:id/consultant-comms`.
- Expected: HTTP 403 (staff-only; `requireAuth` blocks role `client`). The client’s own view is the portal Design Team page, not this endpoint.
- [ ] Pass  [ ] Fail

**TC-05 — Send gate: emailing a consultant with the flag off**
1. Composer: **Email the consultant**, subject “Brief”, body “Please confirm scope.”; click **Send + log**.
- Expected UI (flag unset): “Consultant email sending is turned off…”. **No** email is sent and **no** row is created.
- Expected UI (flag set to `true`, and the contact has an email): success; a `consultant_messages` row with `channel='email'`, `direction='outbound'`, a stamped `message_id`, and a `lead_activities` row “Consultant email sent (interior_designer): Brief”.
- [ ] Pass  [ ] Fail

**TC-06 — Feature edge: set up the pre-construction portal + share a message**
1. Top of Consultants → **Set up the client’s portal →**.
2. In the interior designer’s thread, on the TC-01 note, click the **hidden** pill so it reads **👁 shared**.
- Expected DB: a `projects` row for the lead’s `job_id` with `is_preconstruction=true`, `portal_v2_enabled=true`; the message’s `client_visible=true`.
- Expected: the project does **not** appear on `GET /api/operations/projects`.
- [ ] Pass  [ ] Fail

**TC-07 — Feature edge: client sees + replies on the Design Team page**
1. As the invited portal client, open **Design Team**.
- Expected UI: the **Interior Designer** chip shows; the shared TC-01 note appears (left-aligned, “Blue Leaf” / consultant label); internal-only disciplines do not appear.
2. Send a message “Can we look at a darker benchtop?” tagged “About: Interior Designer”.
- Expected DB: a `consultant_messages` row — `participant='client'`, `channel='portal'`, `direction='inbound'`, `client_visible=true`, `consultant_role='interior_designer'`; it appears in the Hub thread; an email is sent to `admin@blueleafbuilding.com.au`.
- [ ] Pass  [ ] Fail

**TC-08 — Win graduates the pre-con project**
1. Win the test lead (signed contract + value).
- Expected DB: the same `projects` row now has `is_preconstruction=false`; it appears on the Operations board; the client’s login + shared comms are unchanged.
- [ ] Pass  [ ] Fail
