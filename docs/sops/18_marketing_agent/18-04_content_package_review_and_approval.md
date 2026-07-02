---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: marketing-run-a
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP 18-04: Content Package Review and Approval

**Module:** Marketing — Approval Queue
**SOP ID:** 18-04
**Status:** Draft (Run A — runtime verification pending staging)
**Priority:** High

---

## 1. Who uses this
Admin (Sam) as the approver. Josh (operator) is the creator who sends packages for review. Both are currently on admin logins.

## 2. When to use it
Josh creates a content package in the Content Studio and clicks **Send package to Approval Queue**. Sam then opens the Approval Queue to review, approve, or send it back.

## 3. What this does
The Approval Queue lists all content packages with status `in_review`. Each package shows all draft posts (Instagram, Facebook, etc.) with their Josh labels and risk level. Sam approves the whole package (making slots schedule-ready), requests changes (sends it back), or rejects it. **Nothing is published from here.**

## 4. Before you start
- Logged in as Admin.
- Migration 122 applied (`marketing_content_packages` table). Without it, the queue cannot save or load real packages and will show a demo package.
- At least one package must be submitted (Josh uses Content Studio → **Send package to Approval Queue**).

## 5. How to review a package

**Step 1 — Open the Approval Queue**
Marketing → **Approval Queue** (`/marketing/approval`).

**Step 2 — Read the package**
Each card shows:
- **Topic** — what the package is about (from the Creator's angle/topic)
- **Recommended platforms** — which channels the package covers
- **Risk level** — Low / Medium / High (derived automatically from draft quality)
- **Draft previews** — each post per channel, with Josh labels and body text

**Step 3 — Read the Josh labels**
Each draft shows labels like "Ready for Josh review", "Needs photo", "Check language". These are automated quality signals from the Creator. If a label says "Needs photo", the post was created without a media asset and should not go live without one.

**Step 4 — Check risk level**

| Risk | Meaning |
|---|---|
| **Low** | Clean copy, good photo, no red flags |
| **Medium** | Missing photo, or copy needs minor polish |
| **High** | Flagged for language, missing context, or no media |

Always review **High** risk packages carefully before approving.

**Step 5 — Make a decision**

| Decision | When to use | What it does |
|---|---|---|
| **Approve** | Package is good to go | Status → `approved`; child items become schedule-ready |
| **Request changes** | Needs a tweak before posting | Status → `changes_requested`; Josh re-opens in Creator |
| **Reject** | Wrong direction or quality | Status → `rejected`; package archived |

## 6. What happens next
- Approved packages appear in the Calendar (`/marketing/calendar`) ready to be scheduled and posted.
- `request_changes` packages return to Josh — send a message manually to explain what needs to change.
- Rejected packages are archived; they do not appear in the queue again.

## 7. Common mistakes
| Mistake | Why it happens | How to avoid it |
|---|---|---|
| Approving a "Needs photo" package | Risk badge is Medium not High | Check every Josh label before approving — if any item says "Needs photo", source the photo first |
| Requesting changes without explaining why | No message sent to Josh | After setting "Request changes", message Josh directly with the specific changes needed |
| Rejecting instead of requesting changes | Package is almost right | Use "Request changes" for minor issues; "Reject" only for content that is wrong in direction or quality |

## 8. Troubleshooting
| Problem | Solution |
|---|---|
| Approval Queue shows demo package only | Migration 122 not applied or no staging DB — see SOP 18-08 |
| Approve/Reject buttons are greyed out | Buttons are disabled on demo packages — they only work with real data |
| Package does not appear after Josh submitted it | Check that Josh clicked "Send package to Approval Queue" in the Creator; verify `marketing_content_packages` table has the row with `status = in_review` |
| Status did not update after Approve | API error — check console; retry |

## 9. Related modules
- [Calendar and publishing](18-05_calendar_scheduling_and_manual_publishing.md)
- [Marketing Intelligence](18-07_marketing_intelligence_and_attribution.md)

## 10. Screenshot placeholders
[insert screenshot: Approval Queue with a package card]
[insert screenshot: Package card with Josh labels and risk badge]
[insert screenshot: Approve / Request changes / Reject buttons]

## 11. Automation notes
- Approval cascades: approving a package updates all child `marketing_content_items` to `approved` status.
- `request_changes` sets the package status but does not automatically notify Josh — send a message manually.
- No external publishing happens from the Approval Queue. Posts go through the Calendar.

## 12. Edge cases and limits
- Packages with `status = approved/rejected/changes_requested` do not appear in the queue (filter is `in_review` only).
- Each package can only be in one status at a time.
- Approving a package with a "Needs photo" item will make those items schedule-ready but they still cannot be published without media.

## 13. Owner of the process
Admin (Sam)
Next review: after staging runtime verification

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Migration 122 applied; `marketing_content_packages` table exists
- [ ] At least one package submitted via Content Studio (status = `in_review`)
- [ ] Logged in as Admin
- [ ] Staging DB available

### Test cases

**TC-01 — Approval Queue loads real packages**
1. Open `/marketing/approval`
2. Expected: package card shows; no "Demo package" banner
- [ ] Pass  [ ] Fail

**TC-02 — Package card shows Josh labels and risk**
1. Inspect a package card
2. Expected: Josh labels rendered as badges; risk level chip visible
- [ ] Pass  [ ] Fail

**TC-03 — Approve updates package and child items**
1. Click **Approve** on a package
2. Expected: package card disappears from the queue; in DB, `marketing_content_packages.status = approved` and all child `marketing_content_items.status = approved`
- [ ] Pass  [ ] Fail

**TC-04 — Request changes updates status**
1. Click **Request changes** on a package
2. Expected: package removed from queue; DB `status = changes_requested`
- [ ] Pass  [ ] Fail

**TC-05 — Reject updates status**
1. Click **Reject** on a package
2. Expected: package removed from queue; DB `status = rejected`
- [ ] Pass  [ ] Fail

**TC-06 — Demo fallback works without real data**
1. Open `/marketing/approval` with no packages in the queue
2. Expected: demo package shown with "Demo package — actions disabled" label; approve buttons disabled
- [ ] Pass  [ ] Fail

**TC-07 — Calendar link in header works**
1. Click the Calendar link in the Approval Queue header
2. Expected: navigates to `/marketing/calendar`
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
