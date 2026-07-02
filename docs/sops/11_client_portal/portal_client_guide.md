---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Client
test_status: static_pass
---

# SOP 11-09: Client Guide — Using Your Portal

> **LEGACY — v1 token portal (fallback only).** This guide is for clients using the original no-login share-link portal (`/portal/:token`). If your builder has invited you by email to set a password and log in, you are on the new v2 portal — refer to the v2 client onboarding (SOP 11-10) instead. See [00_PORTAL_STACK_MATRIX.md](00_PORTAL_STACK_MATRIX.md) for a full comparison.

**Module:** Client Portal — Client-facing guide  
**SOP ID:** 11-09  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
This guide is written for you — our client. It explains how to use your online project portal to follow the progress of your build.

## 2. When to use it
Any time you want to check in on your build — from your phone, tablet, or computer.

## 3. What this does
Your portal is your window into the project. You can see weekly progress updates, photos from site, your build timeline, decisions we need from you, your budget summary, and messages from us. You do not need a password — just use the link we sent you.

## 4. Getting started

### Opening your portal
We will send you a link by email when your portal is ready. It looks like:

`https://blueleafbuilding.com.au/portal/[your-unique-code]`

Just click the link — no login, no password needed. We recommend bookmarking it on your phone so you can check in any time.

**Tip:** If you lose the link, contact us and we will resend it.

## 5. What each section does

### Home
The first page you see. Shows:
- A summary of where the build is up to
- Your latest weekly update from us
- How far through the key milestones you are
- Any decisions we need from you (shown as an alert if outstanding)

### Timeline
Your build milestones — the big stages like Slab Pour, Frame, Lock-Up, and Handover. Each milestone shows:
- The target date
- Whether it has been completed (shown with a tick)

This is a high-level view — it will not show every task on site, just the key stages.

### Decisions
Things we need you to decide. This could be:
- Colour selections (paint, tiles, carpet)
- Fixture choices (taps, light fittings)
- Upgrades or changes to the original scope

Each decision item shows what is needed, any relevant options, and a deadline if applicable. Tap **Approve** or **Reject** to respond. You can add a note if you want to explain your choice.

**Please check this tab regularly** — some decisions are time-sensitive and delays can affect the build schedule.

### Budget
A summary of your contract value and any variations (changes to the original scope). Variations show a description, amount, and their status (Pending, Approved, or Rejected).

This is a summary view — your full contract is a separate document.

### Messages (Conversations)
Direct messages between you and the Blue Leaf Building team. Think of it like a project-specific chat.

**To send us a message:**
1. Tap the Messages tab
2. Type your message in the box at the bottom
3. Tap Send

We will see your message and reply as soon as we can. For urgent matters, please also call us directly.

## 6. Common questions

| Question | Answer |
|----------|--------|
| I lost my portal link — what do I do? | Contact us and we will resend it |
| Can I share the link with my partner or family? | Yes — anyone with the link can view the portal. Keep it private otherwise |
| The page looks wrong on my phone | Try refreshing the page; if it still looks wrong, try opening in Chrome or Safari |
| I approved a decision by mistake — can I change it? | Contact us immediately by phone or message and we will sort it out |
| Why can't I see any photos yet? | Photos are added by our team after site visits — check back after your next weekly update |
| The portal link is not working | The link may have changed — contact us for a new one |

## 7. Privacy
Your portal link is unique to your project. Only people you share the link with can see your project information. We recommend not posting the link publicly.

---

*This guide is for clients of Blue Leaf Building. If you are a staff member, refer to SOPs 11-01 through 11-08 for the admin workflows.*

---

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Portal link does not open | The link may have expired or the portal may not be enabled yet — contact your builder |
| Page looks broken on mobile | Try refreshing; if still broken, try Chrome or Safari |
| I accidentally approved something | Contact the builder immediately by phone or message — they can note the correction |
| I cannot see the Decisions tab | The builder may not have added any decisions yet — check back after your next update |
| Photos are not loading | Photos are added after each site visit — check again after the next weekly update |

## 9. Related SOPs
- [Enable the client portal for a project](portal_enable_for_client.md) — SOP 11-01 (admin)
- [View the portal as the client](portal_view_as_client.md) — SOP 11-02 (admin)
- [Add a weekly update](portal_add_weekly_update.md) — SOP 11-03 (admin)

## 10. Automation notes
- Client portal resolves by token: `GET /api/portal/:token/home`
- Tabs: `GET /api/portal/:token/timeline`, `/decisions`, `/budget`, `/conversations`
- The portal token is embedded in the link the builder sends — no separate login is required
- An invalid or revoked token returns a friendly error page

## 11. Screenshot placeholders
[insert screenshot: Client portal home page showing updates, milestones and decisions alert]
[insert screenshot: Decisions tab with a pending decision and Approve / Reject buttons]

## 12. Edge cases and limits
- The link is the only access control — anyone who has it can view the portal
- If the builder regenerates the token, the old link stops working; ask the builder for the new link
- Clients cannot edit or delete their own decisions after responding; contact the builder to resolve errors
- The portal is read-mostly; the only client writes are responding to decisions and sending messages
- There is no account, no password, and no login recovery — the link is the sole credential

## 13. Owner of the process
Client (document maintained by Admin)  
Next review: 2026-11-30

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] A client portal token exists for a test project
- [ ] At least one update, one milestone, one decision, and one message exist in the portal

### Test cases

**TC-01 — Client portal loads via token link (no login)**
1. Open the portal URL in a private browser window (to simulate a client with no session)
2. Expected: portal home page loads without any login prompt
3. Expected: project name and latest update visible
- [ ] Pass  [ ] Fail

**TC-02 — Timeline tab shows milestones**
1. Click the Timeline tab in the client portal
2. Expected: at least one milestone appears with a name and target date
3. Expected: completed milestones show a visual indicator (tick or similar)
- [ ] Pass  [ ] Fail

**TC-03 — Client can approve a decision**
1. Go to the Decisions tab
2. Find a pending decision and click Approve
3. Expected: decision status changes to Approved immediately in the UI
4. Expected: admin sees the updated status in Portal Admin
- [ ] Pass  [ ] Fail

**TC-04 — Client can send a message**
1. Go to the Messages tab
2. Type "When is the frame inspection?" and tap Send
3. Expected: message appears in the conversation immediately
4. Expected: admin sees the message in Portal Admin → Messages
- [ ] Pass  [ ] Fail

**TC-05 — Budget tab loads**
1. Click the Budget tab
2. Expected: contract value and any variations are displayed
3. Expected: no errors or blank page
- [ ] Pass  [ ] Fail

**TC-06 — Invalid token gives friendly error**
1. Open `https://[domain]/portal/invalid-token-here`
2. Expected: friendly error page (not a raw 404 or blank screen)
3. Expected: message suggests contacting the builder
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Portal loads without login
- [ ] All tabs functional
- [ ] Client can approve decisions
- [ ] Client can send messages
- [ ] Invalid token handled gracefully
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
