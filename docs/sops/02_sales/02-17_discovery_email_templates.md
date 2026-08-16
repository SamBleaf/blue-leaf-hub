---
sop_version: 1.0
last_reviewed: 2026-08-16
app_version: main
screenshot_status: placeholders_only
owner: Admin / Director
test_status: untested
---

# SOP: Edit the Discovery email templates

**Module:** Sales
**SOP ID:** 02-17
**Status:** Draft
**Priority:** Medium

---

## 1. Who uses this
Admin.

## 2. When to use it
When you want to change the wording of the Discovery introduction or 7-day follow-up email that clients receive.

## 3. What this does
Lets you edit both Discovery email templates (subject + body) in your own voice, with a live preview against a sample lead. Merge tokens fill in the real client, designer and fees when sent.

## 4. Before you start
- You're an **Admin**.
- Go to **Settings → General → Discovery emails**.

## 5. Step-by-step process
1. Open **Settings → General → Discovery emails**.
2. Toggle **Introduction** / **Follow-up (7-day)**.
3. Edit the subject + message. Use the merge tokens shown (e.g. `{{designer_name}}`, `{{concept_fee}}`). Watch the live preview.
4. Click **Save both templates**. Use **Reset this one to default** to restore the built-in copy.

> 💡 **Tip:** Keep the brand voice — warm, plain, specific. Avoid "dream home / seamless / bespoke".

[insert screenshot: the Discovery emails editor with preview]

## 6. What happens next
New sends use your saved copy. Blank fields fall back to the approved defaults.

## 7. Common mistakes

| Mistake | Why | Avoid |
|---|---|---|
| Removing a token the email needs | Breaks the merge | Keep `{{designer_name}}` / fee tokens unless you mean to drop them. |
| Saving a blank template | Rejected | Both templates need a subject + message. |

## 8. Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| "Both templates need a subject and a message" | One field blank | Fill both, or reset to default. |
| Editor not visible | Not an admin | Templates are admin-only. |

## 9. Related modules
- [Send the Discovery email](02-15_discovery_email.md) → uses this copy

## 10. Screenshot placeholders
[insert screenshot: intro tab] [insert screenshot: follow-up tab + preview]

## 11. Automation notes
- Load → `GET /api/sales/discovery-email-template`. Save → `POST` upserts `user_settings/crm_discovery_email` as `{intro, followup}`.
- Send/cadence read these; missing fields fall back to `DISCOVERY_EMAIL_DEFAULTS`.

## 12. Edge cases and limits
- Saving stores both templates together.
- Tokens are literal text substitutions; unknown tokens are left as-is.

## 13. Owner of the process
Admin / Director. Next review: 2027-02-16

---

## 14. Troubleshoot Agent Test Script

> Admin session.

### Test cases
**TC-01 — Save + use** Edit intro subject → Save → send a discovery email → the new subject is used. [ ] Pass [ ] Fail
**TC-02 — Blank rejected** Clear the follow-up body → Save → 400. [ ] Pass [ ] Fail
**TC-03 — Reset** Reset intro to default → the default copy returns. [ ] Pass [ ] Fail
**TC-04 — Wrong role** Non-admin GET the template route → 403. [ ] Pass [ ] Fail
**TC-05 — Persistence** Save, reload the page → the saved copy loads (not defaults). [ ] Pass [ ] Fail
**TC-06 — Token preview** The preview substitutes the sample designer/fees for the tokens. [ ] Pass [ ] Fail

### Post-test checklist
- [ ] All passed · [ ] No console/network errors · [ ] DB values correct · [ ] Update test_status · [ ] Changelog entry
