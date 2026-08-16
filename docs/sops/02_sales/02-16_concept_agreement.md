---
sop_version: 1.0
last_reviewed: 2026-08-16
app_version: main
screenshot_status: placeholders_only
owner: Sales (Admin / Director)
test_status: untested
---

# SOP: Generate and accept the concept agreement

**Module:** Sales
**SOP ID:** 02-16
**Status:** Draft
**Priority:** High

---

## 1. Who uses this
Admin, Supervisor.

## 2. When to use it
At Discovery, once the designer + fees are set — to produce the concept agreement (process, benefits, what to expect, fees) and record the client's acceptance, which is the blocker to advance past Discovery.

## 3. What this does
Generates a client-ready **concept agreement** from a DOCX template (the app's canonical document method), saved to the client's documents — **open it in Google Docs** for final edits, download it, or attach it to the discovery email. When the client accepts, you mark it accepted — which creates the client's Dropbox folder and files their documents into it, and unlocks advancing to the next stage.

> The layout comes from a DOCX **template** in the `templates` bucket (`concept-agreement-template.docx`). Design it once in Word/Docs; the merge fields (`{CLIENT_NAME}`, `{DESIGNER_NAME}`, `{CONCEPT_FEE}`, `{DESIGN_PACKAGE_FEE}`, …) fill automatically. A bundled starter template is used until yours is uploaded.

## 4. Before you start
- The lead is at **Discovery** with a designer + fees set.
- Migrations **179 + 181** applied. Dropbox configured (for the folder).

## 5. Step-by-step process
1. Open the Discovery lead → **Discovery — next steps** → **Generate** (concept agreement). It renders the DOCX from the template and saves it to the lead's Documents; use **Open in Google Docs** to tweak, or **Download DOCX**.
2. Share it as you prefer — show it in the meeting, or tick "Attach the concept agreement PDF" when sending the discovery email.
3. When the client confirms (email reply / verbal), click **Mark accepted** → confirm.
4. The **client folder** is created and their documents filed in; "Open client folder" appears.
5. You can now advance the lead to **Winning Offer**.

> 💡 **Tip:** The folder only appears once they've accepted — so Dropbox never fills with folders for leads that don't proceed.

[insert screenshot: concept agreement generated + Mark accepted]

## 6. What happens next
On acceptance the lead's `concept_agreement_status` becomes `accepted`, the client folder is created under `SALES/CLIENTS`, lead documents are backfilled, and the Winning-Offer hard gate opens.

## 7. Common mistakes

| Mistake | Why | Avoid |
|---|---|---|
| Trying to advance before accepting | The gate needs acceptance | Mark accepted first. |
| Marking accepted before generating | No document to file | Generate the agreement first. |

## 8. Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| Can't advance to Winning Offer | Not accepted | Mark the concept agreement accepted. |
| No client folder after accepting | Dropbox not configured | Configure `DROPBOX_*`; re-accept is idempotent. |
| Generate errors | Migration 179/181 not applied | Apply the migrations. |

## 9. Related modules
- [Select designer + fees](02-14_select_designer_and_fees.md) · [Discovery email](02-15_discovery_email.md) · [Move through stages](02-02_move_lead_through_stages.md)

## 10. Screenshot placeholders
[insert screenshot: Generate + Download] [insert screenshot: Accepted + Open client folder]

## 11. Automation notes
- Generate → `POST …/concept-agreement/generate` renders the DOCX via the canonical `salesDocuments`/`docTemplates` engine (template: `concept-agreement-template.docx`), uploads to `lead-documents`, inserts a `lead_documents` row (`concept_agreement`, DOCX), stamps `concept_agreement_status='generated'` + path, and (if Drive is configured) uploads to Google Docs and returns the edit URL. No folder yet.
- Accept → `POST …/concept-agreement/accept` (the only writer of `accepted`) stamps `accepted`, then creates the client folder (`ensureLeadClientFolder`) + backfills docs — non-fatal if Dropbox is down.
- Advance to Winning Offer → 422 `GATE_BLOCKED` unless accepted.

## 12. Edge cases and limits
- Re-generate overwrites the saved PDF; re-accept is a no-op (folder created once).
- Acceptance persists even if the folder step fails (Supabase-primary).
- The blanket lead PATCH cannot set `concept_agreement_status='accepted'` — it must go through the accept route.

## 13. Owner of the process
Sales (Admin / Director). Next review: 2027-02-16

---

## 14. Troubleshoot Agent Test Script

> Requires migs 179 + 181; Dropbox configured. Admin; a discovery lead with a designer + fees.

### Test cases
**TC-01 — Generate** Click Generate → a `concept_agreement` doc appears with a working signed URL; `concept_agreement_status='generated'`; **no** client folder yet. [ ] Pass [ ] Fail
**TC-02 — Guard** `PATCH /api/sales/leads/:id {concept_agreement_status:"accepted"}` → 400 "Use POST …/accept". [ ] Pass [ ] Fail
**TC-03 — Gate blocks** Advance to Winning Offer before accepting → 422 GATE_BLOCKED. [ ] Pass [ ] Fail
**TC-04 — Wrong role** Client token POST accept → 403. [ ] Pass [ ] Fail
**TC-05 — Accept automation** Mark accepted → status `accepted`; `client_folder_link` populates; docs backfilled to `SALES/CLIENTS/…`; advancing to Winning Offer now succeeds. [ ] Pass [ ] Fail
**TC-06 — Idempotent re-accept** Accept again → no duplicate folder, no error. [ ] Pass [ ] Fail

### Post-test checklist
- [ ] All passed · [ ] No console/network errors · [ ] DB + Dropbox correct · [ ] Update test_status · [ ] Changelog entry
