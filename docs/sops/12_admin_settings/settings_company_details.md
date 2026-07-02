---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: main
screenshot_status: placeholders_only
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
- When you want to update the company logo that appears on Purchase Order PDFs

## 3. What this does
Updates the company information used on outgoing Purchase Order PDFs and related documents. Details (name, ABN, address, phone, email, website, PO prefix, terms) are saved in this browser's local storage. The company logo is also stored locally as a base64 image in the browser. Changes take effect immediately on any document generated after saving.

## 4. Before you start
- You are logged in as Admin
- If updating the logo: have the logo file ready as a PNG or JPEG (recommended: square, at least 300×300px)
- Note: settings are stored in this browser only — if you use a different device or browser, you will need to re-enter them

## 5. Step-by-step process

### Update company details
1. Go to **Settings** in the sidebar
2. Scroll down to the **Company details** section
3. Update any of the following fields:
   - Company name
   - ABN
   - Address
   - Phone
   - Email
   - Website
4. Click **Save company details**
5. A confirmation note appears below the button: "Company details saved on this device."

### Upload a new logo
1. In the **Company details** section, find the **Company logo for PDFs** field
2. Click **Choose File** and select your PNG or JPEG file
3. The logo preview appears immediately below the file input
4. Click **Save company details** to persist
5. To remove the logo, click **Remove logo** (appears below the preview when a logo is set)

### Update PO prefix and terms
1. Scroll down to the **Purchase orders** section
2. Update the **PO prefix** field (e.g. "BLB") — automatically uppercased
3. Edit the **Default terms & conditions (page 2)** text area as needed
4. Click **Save PO settings**

## 6. What happens next
- Company details and logo are saved in this browser's localStorage under key `blue-leaf-hub.company-settings.v1`; the logo is stored separately under `blhub_company_logo`
- Changes take effect on all Purchase Order PDFs generated after saving
- Existing generated PDFs are not retroactively updated
- Settings do not sync to other browsers or devices automatically

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Uploading a low-resolution logo | Using a web-sized image | Use a PNG at least 300×300px — logos on printed PDFs need to be sharp |
| Leaving the ABN field blank | Skipping setup | ABN is required for Purchase Orders to be legally compliant |
| Saving without reviewing the preview | Clicking through quickly | Check the logo preview before saving to confirm it looks correct |
| Expecting settings to appear on another computer | Settings are local only | Re-enter on each device/browser you use to generate documents |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| Logo not updating on PO PDFs | Settings saved but PDF generated before saving | Regenerate the PDF after saving |
| "Save company details" note does not appear | localStorage write failed (private browsing / storage quota) | Switch to a normal browser window with storage enabled |
| Logo disappears after browser data cleared | Browser storage was wiped | Re-upload the logo and save again |
| ABN field shows red validation | Incorrect format | ABN should be 11 digits; spaces are stripped automatically |

## 9. Related modules
- [Invite a new staff member](settings_invite_user.md) — SOP 12-02 (same Settings area)
- [Connect Buildexact integration](settings_buildexact.md) — SOP 12-04 (Buildexact cost code mapping also in Settings)

## 10. Screenshot placeholders
[insert screenshot: Settings page scrolled to the Company details section showing all fields]
[insert screenshot: Logo upload — file selected and preview shown below the input]
[insert screenshot: Confirmation note "Company details saved on this device." after clicking Save]

## 11. Automation notes
- All data stored client-side in `localStorage` — no server API calls for company details or logo
- Logo stored as base64 data URL under key `blhub_company_logo` (separate from main settings JSON)
- Company settings JSON stored under key `blue-leaf-hub.company-settings.v1` (excludes logoDataUrl)
- Functions: `loadCompanySettings()`, `saveCompanySettings(patch)`, `persistCompanyLogoDataUrl(dataUrl)` in `src/lib/companySettings.js`
- PO sequence counter (read-only on Settings page) is fetched from Supabase `sequences` table where `id = 'po_number'`
- No email, no server record, no Supabase write triggered by saving company details

## 12. Edge cases and limits
- If the browser's localStorage quota is exceeded, the save silently fails — the app does not show an error; the logo (as a large base64 string) is most likely to hit quota first
- Clearing browser data / using Incognito mode will lose all saved settings
- The logo file must be `image/png` or `image/jpeg` — other file types are rejected with an alert before upload
- Removing the logo sets `blhub_company_logo` to empty string and removes it from localStorage
- PO prefix field is forced to uppercase on every keystroke
- The `website` field does not validate URL format — enter the full URL (e.g. `https://www.example.com.au`)

## 13. Owner of the process
Admin  
Next review: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** This section contains every test that must be executed to verify this feature works correctly. Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] Log in as Admin
- [ ] Note the current company name (to restore after testing)
- [ ] Have a test PNG logo file ready (at least 200×200px)
- [ ] Open browser DevTools → Application → Local Storage to inspect values

### Test cases

**TC-01 — Save company details (happy path)**
1. Go to Settings → scroll to the Company details section
2. Change the Company name to "Blue Leaf Test Co"
3. Click **Save company details**
4. Expected result: confirmation note "Company details saved on this device." appears below the button
5. Expected localStorage: `blue-leaf-hub.company-settings.v1` contains `companyName: "Blue Leaf Test Co"`
- [ ] Pass  [ ] Fail

**TC-02 — Company details persist after page reload**
1. After TC-01, reload the page
2. Navigate back to Settings → Company details section
3. Expected result: Company name still shows "Blue Leaf Test Co"
- [ ] Pass  [ ] Fail

**TC-03 — Upload company logo**
1. In the Company details section, click Choose File → select a PNG
2. Expected result: logo preview image appears immediately below the file input
3. Click Save company details
4. Expected localStorage: `blhub_company_logo` is set to a base64 data URL starting with `data:image/`
- [ ] Pass  [ ] Fail

**TC-04 — Non-image file rejected**
1. Attempt to upload a PDF file as the logo
2. Expected result: browser alert "Please upload a PNG or JPEG image." — no upload occurs
3. Expected localStorage: `blhub_company_logo` unchanged
- [ ] Pass  [ ] Fail

**TC-05 — Remove logo**
1. With a logo set (TC-03), click the **Remove logo** button
2. Expected result: logo preview disappears; Remove logo button disappears
3. Click Save company details
4. Expected localStorage: `blhub_company_logo` key is removed or empty
- [ ] Pass  [ ] Fail

**TC-06 — Settings not accessible by Staff role**
1. Log out and log in as a Staff-role user
2. Navigate to `/settings`
3. Expected result: Settings page is either inaccessible (redirect) or company detail fields are read-only — Staff cannot edit global settings
- [ ] Pass  [ ] Fail

**TC-07 — PO settings save**
1. Go to the Purchase orders section
2. Change PO prefix to "TEST"
3. Click Save PO settings
4. Expected result: confirmation note appears
5. Expected localStorage: `blue-leaf-hub.company-settings.v1` contains `poPrefix: "TEST"`
6. Restore prefix to "BLB" after the test
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] localStorage values confirmed in DevTools
- [ ] Company name restored to original value
- [ ] PO prefix restored to original value
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result
