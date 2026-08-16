---
sop_version: 1.0
last_reviewed: 2026-08-16
app_version: main
screenshot_status: placeholders_only
owner: Sales (Admin / Director)
test_status: untested
---

# SOP: Send the Discovery email and the 7-day follow-up

**Module:** Sales
**SOP ID:** 02-15
**Status:** Draft
**Priority:** High

---

## 1. Who uses this
Admin, Supervisor.

## 2. When to use it
After the Discovery meeting and once a designer + fees are set — to send the client the process, the fees, and the introduction to their designer.

## 3. What this does
Sends a warm, on-brand email outlining the whole design-and-build process (Concept Design Package → Full Design Package → Fixed Price Building Proposal), the fees, and the recommended designer. A follow-up sends automatically after 7 days if they don't respond.

## 4. Before you start
- The lead is at **Discovery** with a designer + fees set (SOP 02-14) and a valid email.
- Migrations 174–179 applied; `DISCOVERY_EMAIL_ENABLED=true` to send (preview works without it). `DISCOVERY_FOLLOWUP_ENABLED=true` for the auto follow-up.
- Templates read fine in **Settings → General → Discovery emails**.

## 5. Step-by-step process
1. Open the Discovery lead → **Discovery — next steps** → **Preview & send discovery email**.
2. Read the assembled preview (designer, fees inc-GST, process). Optionally tick **Attach the concept agreement PDF** (generate it first — SOP 02-16).
3. Click **Send email**.

> 💡 **Tip:** If they go quiet, the 7-day follow-up sends on its own — you don't have to chase manually.

[insert screenshot: discovery email preview modal]

## 6. What happens next
The email logs to the lead mailbox/timeline; `discovery_email_sent_at` is stamped. If no reply/booking in 7 days, the follow-up sends once. After two contacts over ~3 weeks with no acceptance, the lead shows a **Nurture** recommendation.

## 7. Common mistakes

| Mistake | Why | Avoid |
|---|---|---|
| Sending with no designer selected | The email introduces the designer | Select a designer first (SOP 02-14). |
| "Sending is turned off" | `DISCOVERY_EMAIL_ENABLED` unset | Preview works; set the flag to send. |

## 8. Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| Send blocked "turned off" | Flag unset | Set `DISCOVERY_EMAIL_ENABLED=true`. |
| "no designer selected" | No designer on the lead | Set one (SOP 02-14). |
| Fees show "[fee to be confirmed]" | Fees not set | Enter the concept/design fees. |

## 9. Related modules
- [Select the designer + fees](02-14_select_designer_and_fees.md) · [Concept agreement](02-16_concept_agreement.md) · [Edit the templates](02-17_discovery_email_templates.md)

## 10. Screenshot placeholders
[insert screenshot: Discovery actions panel] [insert screenshot: sent confirmation]

## 11. Automation notes
- Send → `POST /api/sales/leads/:id/discovery-email/send` → SMTP (mirrors to Sent), stamps `discovery_email_sent_at`, logs outbound `correspondence` + `lead_activities`. Optional attach = the generated concept agreement, **converted to PDF before sending** (the DOCX is uploaded to Google Docs and exported as PDF via `exportDriveFileAsPdf`, so the client never receives an editable DOCX; falls back to the DOCX only if Drive is unconfigured or the conversion fails).
- Follow-up (`DISCOVERY_FOLLOWUP_ENABLED`) → `runDiscoveryFollowups` sends once at intro+7d when still discovery / not accepted / no reply; stamps `discovery_followup_sent_at`.
- Test leads are excluded from the follow-up cadence.

## 12. Edge cases and limits
- Preview works with sending off, so you can review copy first.
- A client reply (inbound correspondence) suppresses the follow-up.
- Before migration 179 the send route can't stamp — enable after applying migs.

## 13. Owner of the process
Sales (Admin / Director). Next review: 2027-02-16

---

## 14. Troubleshoot Agent Test Script

> Requires migs 174–179 + `DISCOVERY_EMAIL_ENABLED=true`. Admin session; a discovery lead with a designer + fees + test-safe email.

### Test cases
**TC-01 — Happy path** Preview → Send → success; `discovery_email_sent_at` set; outbound `correspondence` logged. [ ] Pass [ ] Fail
**TC-02 — Empty template** Clear the intro subject in Settings → Save → 400 "Both templates need a subject and a message." [ ] Pass [ ] Fail
**TC-03 — Duplicate** Send twice → second email sends + a second correspondence row; no crash. [ ] Pass [ ] Fail
**TC-04 — Wrong role** Client token POST send → 403. [ ] Pass [ ] Fail
**TC-05 — Automation (follow-up)** Set `discovery_email_sent_at` 8 days ago, no reply, run the cadence → one follow-up, `discovery_followup_sent_at` set; run again → no resend. [ ] Pass [ ] Fail
**TC-06 — No designer** Send on a lead with no designer → 400 "no designer selected". [ ] Pass [ ] Fail

### Post-test checklist
- [ ] All passed · [ ] No console/network errors · [ ] DB values correct · [ ] Update test_status · [ ] Changelog entry
