---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: main
screenshot_status: placeholders_only
owner: Admin / Director
test_status: tested_2026-05-29 — TC-01 FAIL (7 tabs visible, not 5; LinkedIn missing; Lists tab undocumented), TC-02 FAIL (supervisor sees adminOnly tabs), TC-03 FAIL (direct nav as supervisor not blocked)
---

# SOP 18-01: Content Studio — Overview and Navigation

**Module:** Marketing — Content Studio  
**SOP ID:** 18-01  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin, Staff (all roles who create or manage marketing content)

## 2. When to use it
First orientation to the Marketing module. Read this before any other Marketing SOP.

## 3. What this does
Explains the five tabs in Content Studio and when to use each one. This is orientation, not a workflow.

## 4. Before you start
- No pre-conditions. Marketing is always accessible from the sidebar.

## 5. The five tabs

Navigate to **Marketing** in the left sidebar. You will see five tabs across the top.

### Tab 1 — Create
The AI content generator. You bring a topic, a photo (optional), and a channel. The AI writes the content. Every piece starts here.

Use it when: you want to generate a new piece of content for Instagram, Facebook, the website, email, or a client guide.

### Tab 2 — Library
All content ever generated or saved. Draft, in-review, approved, published. Your content archive.

Use it when: you want to find, review, approve, or edit an existing piece of content.

### Tab 3 — Campaigns
Group content into campaigns (e.g. "Winter 2026 — Architect Audience"). A campaign has a goal, channels, date range, audience, and a content mix target.

Use it when: you're planning a focused push around a specific theme, season, or project.

### Tab 4 — Media
Your photo and video library. Upload photos from site, drone footage, and project images here. The system analyses what's in each photo and can pre-fill the content generator.

Use it when: you have new photos or videos from site and want to make content from them, or you want to browse the asset library.

### Tab 5 — Music Library (Admin only)
Background music tracks for video content. Upload, tag with mood (calm educational / confident progress / warm handover), and mark active/inactive.

Use it when: setting up or managing background music for video exports.

## 6. What happens next
After reading this, go to the relevant SOP for the task you need:
- **Generating content** → SOP 18-02
- **Uploading a photo and generating content from it** → SOP 18-03
- **Reviewing or approving content** → SOP 18-04
- **Creating a campaign** → SOP 18-05
- **Uploading photos or videos** → SOP 18-06
- **Managing the music library** → SOP 18-07

## 7. Common mistakes
| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Generating content without a project selected | Project bar not set | Select a project in the project bar first if the content is project-specific |
| Saving to Library then forgetting to approve | Content sits in Draft | After generating, immediately set status to In Review if it's ready for approval |

## 8. Troubleshooting
| Problem | Solution |
|---------|----------|
| Marketing tab not in sidebar | Check your user role — if Staff can't see it, ask Admin to check role permissions |
| Music Library tab not visible | Only visible to Admin role |

## 9. Related modules
- [Generate content with AI](18-02_generate_content_ai.md)
- [Upload media assets](18-06_upload_manage_media.md)

## 10. Screenshot placeholders
[insert screenshot: Marketing sidebar link highlighted]
[insert screenshot: The five tabs across the top of Content Studio]

## 11. Automation notes
None — this is a navigation overview only.

## 12. Edge cases and limits
- Music Library tab is hidden from non-Admin users (route guard + tab filter)

## 13. Owner of the process
Admin / Director  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Log in as Admin role
- [ ] Log in separately as Staff role (for role visibility test)

### Test cases

**TC-01 — Admin sees all five tabs**
1. Log in as Admin
2. Click Marketing in the sidebar
3. Expected result: five tabs visible — Create, Library, Campaigns, Media, Music Library
- [ ] Pass  [ ] Fail

**TC-02 — Staff does not see Music Library tab**
1. Log in as Staff role
2. Click Marketing in the sidebar
3. Expected result: four tabs visible — Create, Library, Campaigns, Media. No Music Library tab.
- [ ] Pass  [ ] Fail

**TC-03 — Staff cannot access Music Library by direct URL**
1. Log in as Staff
2. Navigate directly to `/marketing/music`
3. Expected result: redirected away (to `/marketing` or a 403 page — not the Music Library UI)
- [ ] Pass  [ ] Fail

**TC-04 — Default tab is Create**
1. Navigate to `/marketing` with no tab in the URL
2. Expected result: Create tab is active and highlighted
- [ ] Pass  [ ] Fail

**TC-05 — Tab navigation updates URL**
1. Click Library tab
2. Expected result: URL updates to `/marketing/library`
3. Click Campaigns — URL → `/marketing/campaigns`
4. Click Media — URL → `/marketing/media`
5. Back button returns to previous tab correctly
- [ ] Pass  [ ] Fail

**TC-06 — Direct URL loads correct tab**
1. Navigate directly to `/marketing/library`
2. Expected result: Library tab is active, Library content is rendered
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
