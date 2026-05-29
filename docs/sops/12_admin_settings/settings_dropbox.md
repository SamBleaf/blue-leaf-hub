---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: untested
---

# SOP 12-06: Connect Dropbox Integration

**Module:** Admin Settings — Integrations  
**SOP ID:** 12-06  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin only. This is a one-time setup task done when the app is first deployed — and again if the Dropbox token expires or is revoked.

## 2. When to use it
- When setting up Blue Leaf Hub for the first time
- When the Dropbox refresh token expires or is revoked (Dropbox tokens can expire after 90 days of inactivity or if permissions are changed)
- When troubleshooting Dropbox file upload failures

## 3. What this does
Connects Blue Leaf Hub to your Dropbox Business account. Once connected, the app can:
- Create project folders automatically when a new job is set up
- Upload compliance documents, fee proposals, and RFQ files to the correct folder
- Read files from Dropbox folders for processing

## 4. Before you start
- You have admin access to the Dropbox Business account
- You have access to the Railway deployment dashboard
- Node.js is installed on your local computer (to run the auth script)
- You have the Dropbox app credentials: `DROPBOX_APP_KEY` and `DROPBOX_APP_SECRET`

## 5. Step-by-step process

### Step 1 — Run the OAuth flow locally
1. On your local computer, open a terminal in the Blue Leaf Hub project folder
2. Make sure `.env` has `DROPBOX_APP_KEY` and `DROPBOX_APP_SECRET` set
3. Run:
   ```
   npm run auth:dropbox
   ```
4. The script opens a browser window — log in to Dropbox with the company Dropbox account
5. Click **Allow** to authorise the app
6. The script prints a `DROPBOX_REFRESH_TOKEN` — copy this value

### Step 2 — Add the token to Railway
1. Log in to Railway -> your project service -> **Variables**
2. Add or update:
   - `DROPBOX_APP_KEY` = your app key
   - `DROPBOX_APP_SECRET` = your app secret
   - `DROPBOX_REFRESH_TOKEN` = the token from Step 1
   - `DROPBOX_NAMESPACE_ID` = your Dropbox Business team namespace ID (from Dropbox admin)
3. Railway redeploys the service

### Step 3 — Verify the connection
1. In Blue Leaf Hub, go to **Settings** -> **Integrations** -> **Dropbox**
2. Click **Test Connection**
3. Expected: "Connected" message

## 6. What happens after
- Dropbox file operations work across the app
- New jobs automatically get a Dropbox folder created
- Compliance documents, fee proposals, and quotes are filed to Dropbox

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Running auth:dropbox logged in to a personal Dropbox | Browser has personal account logged in | Log out of personal Dropbox before running the auth script, then log in with the company account |
| Losing the refresh token before adding to Railway | Terminal closed before copying | The script prints the token clearly — copy it immediately |
| Wrong namespace ID | Dropbox Business has team and personal namespaces | Get the namespace ID from Dropbox Business admin panel -> Members -> Team folder settings |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| "Dropbox upload failed" on file uploads | Token may be expired — re-run `npm run auth:dropbox` and update the token in Railway |
| Files upload but appear in wrong folder | Check `DROPBOX_NAMESPACE_ID` is set correctly — this routes files to the team folder |
| "Invalid refresh token" error in logs | Token was revoked in Dropbox — re-run the auth flow |
| Sequential file read errors | This is expected for Dropbox Smart Sync files — the app uses sequential reads (not concurrent) to handle online-only files |

## 9. Related SOPs
- [Connect Buildexact integration](settings_buildexact.md) — SOP 12-04

## 10. Automation notes
- Run `npm run auth:dropbox` locally to generate `DROPBOX_REFRESH_TOKEN`
- Environment variables required: `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, `DROPBOX_REFRESH_TOKEN`, `DROPBOX_NAMESPACE_ID`
- Used by: `server/lib/dropboxClient.mjs` — handles token refresh and namespace routing
- Important: Dropbox file reads must use sequential for-loops, NOT `Promise.all` — concurrent reads fail for Smart Sync (online-only) files
- Dropbox path structure: `/BLUE LEAF BUILDING/PROJECTS/[job address]/`

## 11. Owner of the process
Admin  
Next review: 2026-11-30

---

## 12. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Valid Dropbox credentials available (DROPBOX_APP_KEY, DROPBOX_APP_SECRET)
- [ ] Access to Railway dashboard
- [ ] Node.js installed locally
- [ ] A test project exists in the app

### Test cases

**TC-01 — auth:dropbox script runs and produces a token**
1. Run `npm run auth:dropbox` in the project terminal
2. Expected: browser opens and prompts Dropbox login
3. After authorising: terminal prints `DROPBOX_REFRESH_TOKEN=...`
- [ ] Pass  [ ] Fail

**TC-02 — Token set in Railway and service redeploys**
1. Add DROPBOX_REFRESH_TOKEN to Railway variables
2. Expected: service redeploys and starts healthy
- [ ] Pass  [ ] Fail

**TC-03 — Dropbox connection test passes**
1. Settings -> Integrations -> Dropbox -> Test Connection
2. Expected: "Connected" message with account name
- [ ] Pass  [ ] Fail

**TC-04 — File upload to Dropbox works**
1. Upload a compliance document (SOP 08-01) or fee proposal
2. Expected: file appears in Dropbox under the correct project folder path
3. Expected: no upload error in the app
- [ ] Pass  [ ] Fail

**TC-05 — Invalid token produces informative error**
1. Temporarily set DROPBOX_REFRESH_TOKEN to "invalid" in Railway -> redeploy
2. Attempt a file upload
3. Expected: clear "Dropbox upload failed" message in the app, not a raw API error
4. Restore the correct token
- [ ] Pass  [ ] Fail

**TC-06 — Sequential file reads work for Smart Sync files**
1. Upload a file to Dropbox using Smart Sync (online-only)
2. Trigger a file read operation in the app that reads from that folder
3. Expected: file is read successfully (sequential for-loop handles it)
4. Expected: no timeout or concurrent-read error
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] auth:dropbox script generates a valid token
- [ ] Token set in Railway and service healthy
- [ ] Test connection confirms connected status
- [ ] File upload goes to correct Dropbox path
- [ ] Invalid token handled with plain English error
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
