---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: untested
---

# SOP 12-05: Connect Xero Integration

**Module:** Admin Settings — Integrations  
**SOP ID:** 12-05  
**Status:** Draft  
**Priority:** Low

---

## 1. Who uses this
Admin only. This integration is not yet built — it is planned for Stage 3 of development.

## 2. When to use it
This SOP will be used when the Xero integration is built. It is documented now so the workflow is defined before development begins.

## 3. What this does (planned)
Will connect Blue Leaf Hub to your Xero accounting account. Once connected:
- Approved invoices from the Finance module will sync to Xero automatically
- Xero invoice status (paid/unpaid) will update in Blue Leaf Hub
- Progress claims and variations will be pushable to Xero as draft invoices
- Bank reconciliation data may be available for cashflow forecasting

**Current status: Not yet built — planned for Stage 3.**

## 4. Before you start (planned)
- You have a Xero account with admin access
- Blue Leaf Hub is set up and running
- You have a Xero API client ID and secret (from Xero Developer portal)

## 5. Step-by-step process (planned)

1. Go to **Settings** -> **Integrations** -> **Xero**
2. Click **Connect to Xero**
3. You will be redirected to Xero's login page — log in with your Xero credentials
4. Xero will ask you to authorise Blue Leaf Hub to access your account — click **Allow**
5. You are redirected back to Blue Leaf Hub
6. Expected: "Connected to Xero" confirmation with your organisation name shown
7. Select which Xero account codes map to which Blue Leaf cost categories
8. Click **Save configuration**

## 6. What happens after (planned)
- Xero OAuth tokens are stored securely in the app's environment
- Invoice sync runs automatically when invoices are approved
- A "Push to Xero" button will appear on relevant Finance screens

## 7. Common mistakes (planned)

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Authorising with the wrong Xero organisation | Multiple Xero orgs under one login | Check the organisation name shown in the Xero authorisation screen before clicking Allow |
| Not mapping account codes | Skipping the configuration step | Account code mapping is required for invoices to sync to the correct Xero accounts |

## 8. Troubleshooting (planned)

| Problem | Solution |
|---------|----------|
| OAuth redirect fails | Check that the redirect URL in the Xero Developer portal matches the Blue Leaf Hub URL |
| "Xero not configured" message | The integration is not yet built — refer to Finance module for manual invoice tracking in the interim |
| Token expired | Xero tokens expire after 60 days of inactivity — reconnect via Settings -> Integrations -> Xero |

## 9. Related SOPs
- [Connect Dropbox integration](settings_dropbox.md) — SOP 12-06
- Finance module SOPs (09_finance)

## 10. Automation notes
- **Not yet built — planned for Stage 3**
- Planned approach: Xero OAuth 2.0 flow; tokens stored as Railway environment variables or in Supabase
- Planned API: `POST /api/settings/xero/connect` (OAuth callback), `GET /api/settings/xero/status`
- When built: will use Xero API to create/update invoices and retrieve payment status
- No current DB effects — to be designed in Stage 3

## 11. Owner of the process
Admin  
Next review: 2026-11-30

---

## 12. Troubleshoot Agent Test Script

**Note: These test cases are written for when the Xero integration is built. They cannot be run until Stage 3 is complete.**

### Pre-test setup
- [ ] Xero integration has been built (Stage 3)
- [ ] A Xero sandbox account exists for testing
- [ ] Logged in as Admin

### Test cases

**TC-01 — Connect to Xero (OAuth flow)**
1. Settings -> Integrations -> Xero -> Connect to Xero
2. Expected: redirect to Xero login
3. Log in with test Xero credentials -> Allow
4. Expected: redirect back to Blue Leaf Hub with "Connected" confirmation
- [ ] Pass  [ ] Fail

**TC-02 — Xero organisation name shown after connection**
1. After TC-01, check the Integrations page
2. Expected: Xero section shows "Connected to [Organisation Name]"
- [ ] Pass  [ ] Fail

**TC-03 — Approved invoice syncs to Xero**
1. Approve an invoice in the Finance module
2. Check Xero sandbox account
3. Expected: invoice appears in Xero as a draft bill with matching amount, supplier, and date
- [ ] Pass  [ ] Fail

**TC-04 — Disconnecting Xero removes access**
1. Settings -> Integrations -> Xero -> Disconnect
2. Expected: tokens cleared
3. Expected: subsequent sync attempts fail gracefully with "Xero not connected" message
- [ ] Pass  [ ] Fail

**TC-05 — Non-admin cannot access Xero settings**
1. Log in as Staff role user
2. Navigate to Settings -> Integrations -> Xero
3. Expected: page is inaccessible or integration settings are read-only
- [ ] Pass  [ ] Fail

**TC-06 — Status endpoint returns correct connection state**
1. Call `GET /api/settings/xero/status` (when built)
2. If connected: expected `{ ok: true, connected: true, organisation: '...' }`
3. If not connected: expected `{ ok: true, connected: false }`
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] OAuth flow completes successfully
- [ ] Connected organisation name shown
- [ ] Invoice sync works end-to-end
- [ ] Disconnect clears access
- [ ] Non-admin cannot modify settings
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
