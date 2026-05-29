---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: placeholders_only
owner: Subcontractor
test_status: static_pass
---

# SOP 08-04: Complete a Site Induction

**Module:** Public Induction Form (`/induct/:projectId`)  
**SOP ID:** 08-04  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Anyone working on site — employees and subcontractors. No login required.

## 2. When to use it
On first arrival at a site, before starting any work. Scan the site induction QR code (SOP 08-03) and complete the form.

## 3. What this does
Captures a worker's details, emergency contact, and acknowledgement of the site rules and SWMS, with a signature. It produces a signed induction PDF and records the induction against the project so the builder has proof of who was inducted and when.

## 4. Before you start
- The site induction QR code or link (from SOP 08-03)
- Your details: name, company, trade, mobile, and an emergency contact

## 5. Step-by-step process

1. Scan the **site induction QR code** (or open the link) on your phone
2. The form shows the **site address** and the **SWMS** for your trade
3. Fill in:
   - **Your name**, **company**, **trade**, **mobile** (all required)
   - **Emergency contact name** and **phone** (both required)
4. Read and tick **I acknowledge the site rules** (required)
5. Read and tick **I acknowledge the SWMS** (required)
6. **Sign** in the signature box (required)
7. Tap **Submit induction**

You'll see a confirmation. A signed PDF is created and filed by the builder.

## 6. What happens next

- A signed induction PDF is generated and uploaded to the project's Dropbox `WHS/INDUCTIONS` folder
- A `site_inductions` row is recorded against the project with your details and timestamp
- The builder sees your induction in WHS → Inductions

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Skipping the signature | Missed the box | The signature is required — the form won't submit without it |
| Not ticking acknowledgements | Scrolled past | Both site-rules and SWMS acknowledgements are mandatory |
| Wrong trade selected | Quick tap | Your trade controls which SWMS you're shown — pick the right one |

## 8. Troubleshooting

| Problem the worker sees | Cause | Fix |
|----------------------|-------|-----|
| "All required fields must be provided." | A required field, acknowledgement, or signature is missing | Complete every field, tick both boxes, and sign |
| "Project not found." (404) | The QR/link points to a wrong or deleted project | Ask the supervisor for the correct QR |
| Form won't load | No internet on site | Move to where there's signal, or use the supervisor's connection |

## 9. Related modules
- [Set up a site induction QR code](whs_site_induction_setup.md) — SOP 08-03

## 10. Screenshot placeholders
[insert screenshot: induction form on a phone]
[insert screenshot: signature box]
[insert screenshot: submission confirmation]

## 11. Automation notes
- Form info: `GET /api/induction/:projectId/info` (public) → address + active SWMS for the project
- Submit: `POST /api/induction/:projectId/submit` (public) with `{ personName, company, trade, mobile, emergencyContactName, emergencyContactPhone, siteRulesAcknowledged, swmsAcknowledged, signatureDataUrl }`
- All of the above are required — returns 400 "All required fields must be provided." if any are missing or acknowledgements are false
- Generates a signed induction PDF → uploads to Dropbox `…/WHS/INDUCTIONS/[name]-[date].pdf`
- Inserts a `site_inductions` row with the worker details and `inducted_at`
- Builder views via `GET /api/whs/:projectId/inductions`

## 12. Edge cases and limits
- The route is public (no auth) — designed for workers without Hub accounts
- The signature can be supplied as `signatureDataUrl` or raw `signatureImageBase64` (converted server-side)
- Only SWMS matching the worker's trade are listed on the generated PDF
- Dropbox filing is best-effort; the induction record is still saved if Dropbox is unavailable

## 13. Owner of the process
Admin (process); Subcontractor/Employee (completes it)  
Next review: 2026-11-30

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] A project with the induction QR/link available
- [ ] A project with at least one active SWMS linked

### Test cases

**TC-01 — Complete induction (happy path)**
1. Open `/induct/:projectId`, fill all fields, tick both acknowledgements, sign, submit
2. Expected: success confirmation
3. Expected DB: `site_inductions` row with the person's details, `inducted_at` set
4. Expected: a signed induction PDF filed to Dropbox WHS/INDUCTIONS
- [ ] Pass  [ ] Fail

**TC-02 — Missing required field rejected**
1. Submit with the mobile number blank
2. Expected: HTTP 400 "All required fields must be provided."
3. Expected DB: no induction row
- [ ] Pass  [ ] Fail

**TC-03 — Acknowledgements required**
1. Fill all fields and sign, but leave the SWMS acknowledgement unticked
2. Expected: HTTP 400 "All required fields must be provided."
- [ ] Pass  [ ] Fail

**TC-04 — Signature required**
1. Fill all fields, tick both boxes, but provide no signature
2. Expected: HTTP 400 (signature is mandatory)
- [ ] Pass  [ ] Fail

**TC-05 — Unknown project**
1. Submit to a non-existent projectId
2. Expected: HTTP 404 "Project not found."
- [ ] Pass  [ ] Fail

**TC-06 — Builder sees the induction**
1. After a successful induction, open WHS → Inductions as the builder
2. Expected: the new induction appears, newest first
3. Expected: `GET /api/whs/:projectId/inductions` includes the row
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Induction submits and records correctly
- [ ] All required fields + acknowledgements + signature enforced
- [ ] Unknown project 404s
- [ ] Induction PDF filed; builder can see the record
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
