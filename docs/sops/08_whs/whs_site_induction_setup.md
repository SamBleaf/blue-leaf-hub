---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: placeholders_only
owner: Admin
test_status: static_pass
---

# SOP 08-03: Set Up a Site Induction QR Code

**Module:** Operations → WHS Manager → Inductions  
**SOP ID:** 08-03  
**Status:** Draft  
**Priority:** Medium

---

## 1. Who uses this
Admin, Supervisor

## 2. When to use it
Before workers arrive on a new site. Generate and print the induction QR code so anyone working on site can scan it and complete their induction on their phone.

## 3. What this does
Produces a QR code that links to the project's public induction form. The form shows the site address and the relevant SWMS (Safe Work Method Statements), and captures each worker's details, acknowledgements, and signature. The QR needs no login — anyone with a phone camera can complete it on site.

## 4. Before you start
- The project exists in the system
- Any project-specific SWMS have been linked to the project (so they appear on the induction form)

## 5. Step-by-step process

1. Open the project in Operations, then open **WHS → Inductions**
2. The induction **QR code** is generated automatically for this project
3. It encodes the URL `[your-hub-domain]/induct/[projectId]`
4. Click **Download QR code** to save the image
5. Print it and display it at the site entry (or in the site shed)
6. Alternatively, click **Copy link** to share the induction URL directly (e.g. via text message)

Workers scan the QR (or open the link) and complete the induction (SOP 08-04).

## 6. What happens next

- The QR is generated client-side and points to the public route `/induct/:projectId`
- The public induction form loads the project address and linked SWMS via the info endpoint
- No data is created until a worker submits their induction

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Printing the wrong project's QR | Multiple projects open | Confirm the site address on the QR screen before printing |
| No SWMS showing on the form | Not linked to the project | Link the relevant SWMS to the project so they appear for acknowledgement |
| QR not scanning | Printed too small | Print at a readable size; the generated image is 300px — scale up cleanly |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| "Generating QR…" never resolves | The page couldn't build the QR — reload the WHS Inductions tab |
| Induction form shows "Project not found" (404) | The projectId in the URL is wrong — regenerate the QR from the correct project |
| SWMS list empty on the form | No active SWMS linked to this project via `project_swms` |

## 9. Related modules
- [Complete a site induction](whs_complete_induction.md) — SOP 08-04

## 10. Screenshot placeholders
[insert screenshot: induction QR code with download button]
[insert screenshot: the public induction form a worker sees]

## 11. Automation notes
- QR generated client-side: `QRCode.toDataURL("[origin]/induct/[projectId]")` (300px, in `WhsManager.jsx`)
- "Copy link" copies `[origin]/induct/[projectId]` to the clipboard
- Form info: `GET /api/induction/:projectId/info` (public, no auth) → `{ ok, address, swms: [...] }`
- SWMS come from `project_swms` joined to active `swms_templates`

## 12. Edge cases and limits
- The induction route is public (no login) by design — anyone with the link can induct
- Only active SWMS (`is_active = true`) linked to the project appear on the form
- The QR encodes the current browser origin — generate it from the production domain, not localhost, for site use

## 13. Owner of the process
Admin  
Next review: 2026-11-30

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in
- [ ] A project with at least one active SWMS linked via `project_swms`

### Test cases

**TC-01 — QR generates (happy path)**
1. Open WHS → Inductions for the project
2. Expected: a QR code image renders
3. Expected: the encoded URL is `[origin]/induct/[projectId]`
- [ ] Pass  [ ] Fail

**TC-02 — Induction info endpoint returns address + SWMS**
1. Call `GET /api/induction/:projectId/info`
2. Expected: `{ ok: true, address, swms: [...] }` with the project address and linked active SWMS
- [ ] Pass  [ ] Fail

**TC-03 — Unknown project**
1. Call the info endpoint with a non-existent projectId
2. Expected: HTTP 404 "Project not found."
- [ ] Pass  [ ] Fail

**TC-04 — Copy link**
1. Click Copy link
2. Expected: clipboard contains `[origin]/induct/[projectId]`
- [ ] Pass  [ ] Fail

**TC-05 — Public access (no auth)**
1. Open `/induct/:projectId` in a logged-out browser
2. Expected: the induction form loads (no login required)
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] QR generates with correct URL
- [ ] Info endpoint returns address + SWMS
- [ ] Unknown project 404s
- [ ] Form is publicly accessible
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
