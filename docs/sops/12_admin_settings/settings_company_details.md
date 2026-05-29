---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: untested
---

# SOP 12-01: Update Company Details and Logo

**Module:** Admin Settings — Company  
**SOP ID:** 12-01  
**Status:** Draft  
**Priority:** Medium

---

## 1. Who uses this
Admin only. Only update these settings when your company details change or when setting up the app for the first time.

## 2. When to use it
- When setting up the app for the first time (enter ABN, address, phone)
- When your address, phone number, or email changes
- When you want to update the company logo that appears on documents and the portal

## 3. What this does
Updates the company information that appears on outgoing documents (fee proposals, purchase orders) and the client portal. Changing the logo updates it across all documents generated after the change.

## 4. Before you start
- You are logged in as Admin
- If updating the logo: have the logo file ready as a PNG or JPG (recommended: square, at least 300×300px)

## 5. Step-by-step process

### Update company details
1. Go to **Settings** → **Company**
2. Update any of the following:
   - Company name
   - ABN
   - Street address
   - Phone number
   - Email address
3. Click **Save**

### Upload a new logo
1. Go to **Settings** → **Company** → find the Logo section
2. Click **Upload Logo**
3. Select your PNG or JPG file
4. Click **Save**
5. The new logo appears in the preview — it will be used on all new documents

## 6. What happens after
- Company details are stored and used in all outgoing documents and the portal header
- Logo changes take effect on documents generated after the save — existing PDFs are not updated

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Uploading a low-resolution logo | Using a web-sized image | Use a PNG file at least 300x300px — logos on printed documents need to be sharp |
| Leaving the ABN field blank | Skipping setup | ABN is required for fee proposals and purchase orders to be legally compliant |
| Saving without reviewing the preview | Clicking through quickly | Check the logo preview before saving to confirm it looks correct |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Logo not updating on documents | New logo only applies to documents generated after the save — regenerate any affected documents |
| ABN rejected | Confirm the ABN is correct (11 digits, no spaces) |
| Save fails silently | Check your internet connection and try again; refresh the page and re-enter |

## 9. Related SOPs
- [Invite a new staff member](settings_invite_user.md) — SOP 12-02

## 10. Automation notes
- API: `POST /api/settings/branding-logo` — multipart/form-data with `file` field — uploads and stores the logo
- API: `GET /api/settings/branding-logo` — returns the current logo URL
- Company text details stored in a settings table or environment config
- DB effects: updates company settings row; logo stored in Supabase Storage under `branding/logo.[ext]`

## 11. Owner of the process
Admin  
Next review: 2026-11-30

---

## 12. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin
- [ ] A test PNG logo file ready (at least 200x200px)
- [ ] Current company details noted (to restore after testing)

### Test cases

**TC-01 — Upload a company logo (happy path)**
1. Settings -> Company -> Upload Logo -> select test PNG -> Save
2. Expected: success message shown
3. Expected: logo preview updates to show the new logo
4. Expected API: `POST /api/settings/branding-logo` returns `{ ok: true, logoUrl: '...' }`
- [ ] Pass  [ ] Fail

**TC-02 — Logo retrievable via GET**
1. Call `GET /api/settings/branding-logo`
2. Expected: returns current logo URL
3. Expected: URL is publicly accessible (opens in browser)
- [ ] Pass  [ ] Fail

**TC-03 — Company details save**
1. Update company name to "Blue Leaf Building Test" -> Save
2. Expected: success message
3. Expected: name reflects in any page header or document preview
- [ ] Pass  [ ] Fail

**TC-04 — Logo upload without auth rejected**
1. Call `POST /api/settings/branding-logo` with no auth header
2. Expected: HTTP 401 Unauthorized
- [ ] Pass  [ ] Fail

**TC-05 — Non-image file rejected**
1. Attempt to upload a PDF as the logo
2. Expected: HTTP 400 or front-end validation error (image files only)
- [ ] Pass  [ ] Fail

**TC-06 — New logo appears on generated documents**
1. Upload a new distinct logo
2. Generate a document (e.g. a fee proposal preview)
3. Expected: new logo appears on the document, not the old one
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Logo upload succeeds and is retrievable
- [ ] Company details save persists
- [ ] Unauthenticated upload rejected
- [ ] File type validation works
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
