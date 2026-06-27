---
sop_version: 2.0-draft
last_reviewed: 2026-06-28
app_version: marketing-run-a
screenshot_status: placeholders_only
owner: Admin / Director
test_status: untested — DRAFT updated for Run A (Command Centre + Weekly Planner + Content Studio shell + Legacy Studio). Supersedes the 5-tab structure. Runtime verification pending staging + migration 122.
---

# SOP 18-01: Marketing — Overview and Navigation

**Module:** Marketing — Command Centre
**SOP ID:** 18-01
**Status:** Draft (Run A — Batch 1 + Batch 2)
**Priority:** High

> **Run A draft note.** The Marketing module is being rebuilt as a weekly operating system
> ("Command Centre"). Run A delivers the navigation shell, Weekly Planner, campaign templates,
> and a placeholder Content Studio; content is still created in **Legacy Studio** until the
> media-first Creator ships (Run B). Marketing is **admin-only** in Stage 1.

---

## 1. Who uses this
Admin (Sam) and the marketing operator (Josh, currently via an admin login). Marketing is
**admin-only** in Stage 1 — supervisors and employees cannot see or open it.

## 2. When to use it
First orientation to the Marketing module. Read this before any other Marketing SOP.

## 3. What this does
Explains the new Marketing navigation: the Command Centre home, the Weekly Planner, the Content
Studio (and temporary Legacy Studio), and the classic Library / Campaigns / Media / Lists tabs.

## 4. Before you start
- You must be logged in as **Admin**. Marketing is hidden from other roles.
- Marketing is reached from **Marketing** in the left sidebar.

## 5. The navigation

Open **Marketing** in the sidebar. The module entries are:

### Command Centre — `/marketing`
Your weekly home screen. Shows at a glance: how many drafts **need review**, how many social posts
**need a photo**, how many **slots are open this week**, how many posts were **published this
month**, and how much **new media** arrived this week. Primary buttons: **Create from media**
(opens Content Studio), **Plan this week** (opens Weekly Planner), **Upload media**.

Use it when: starting your weekly marketing session.

### Weekly Planner — `/marketing/planner`
Plan the week. **Start from a template** lays out a campaign and its empty slots. Each empty slot
has a **Create from media** button that opens the Content Studio with the campaign and week
pre-filled. Navigate weeks with **Prev / Next**.

Use it when: you want to set up the week's posting plan from a Blue Leaf campaign template.

### Content Studio — `/marketing/studio`
The home of content creation. In Run A this is a **placeholder** describing the coming media-first
Creator, with a button to **Open Legacy Studio**. (The full Creator arrives in Run B.)

Use it when: you want to create content. For now it routes you to Legacy Studio.

### Legacy Studio — `/marketing/studio/legacy`
The original prompt-first AI generator (unchanged). Pick a channel, pillar, and topic; attach a
photo; generate and save. Clearly labelled **temporary**. If you open it from a photo
(**Media → "Generate post from this photo"**), the photo is pre-filled automatically via the
`?asset_id=` link.

Use it when: you need to generate content today, before the new Creator ships.

### Library — `/marketing/library`
Every piece of content (draft / in-review / approved / published / archived). Your archive.

### Campaigns — `/marketing/campaigns`
Campaign records and their schedule slots. Campaigns can be created from templates in the Planner.

### Media — `/marketing/media`
Photo and video library. Upload site photos and drone footage; the system analyses each photo.
"Generate post from this photo" opens Legacy Studio with the photo attached.

### Lists — `/marketing/lists`
CRM mailing lists (email campaigns).

### Intelligence — `/marketing/intelligence` (Admin)
Marketing dashboard and external sync.

### Music Library — `/marketing/music` (Admin)
Background music tracks for video content.

## 6. What happens next
- **Plan the week** → Weekly Planner (this SOP), then SOP 18-05 (campaigns)
- **Generate content** → SOP 18-02 (via Legacy Studio in Run A)
- **Upload a photo and generate from it** → SOP 18-03
- **Review or approve content** → SOP 18-04
- **Upload photos or videos** → SOP 18-06
- **Manage the music library** → SOP 18-07

## 7. Common mistakes
| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Looking for "Create" tab | Replaced by Command Centre + Content Studio | Use **Content Studio** (or Command Centre → Create from media) |
| Generating in Legacy Studio without attaching a photo | Habit | Attach a photo for proof-based posts before approving |
| Planner slot created but not filled | Slot left "empty" | Use the slot's **Create from media** button |

## 8. Troubleshooting
| Problem | Solution |
|---------|----------|
| Marketing not in sidebar | Marketing is admin-only — log in as Admin |
| `/marketing/studio/legacy` shows blank generator | No `?asset_id=` was passed, or the photo could not be loaded — write the post manually, or re-open from Media |
| Templates / Planner empty or error | Migration `122_marketing_command_centre_mvp.sql` must be applied (Supabase SQL editor) and 7 templates seeded |

## 9. Related modules
- [Generate content with AI](18-02_generate_content_ai.md)
- [Create & manage campaigns](18-05_create_manage_campaigns.md)
- [Upload media assets](18-06_upload_manage_media.md)

## 10. Screenshot placeholders
[insert screenshot: Marketing sidebar — Command Centre first]
[insert screenshot: Command Centre weekly snapshot tiles]
[insert screenshot: Weekly Planner with template picker]
[insert screenshot: Content Studio shell with "Open Legacy Studio"]

## 11. Automation notes
None in Run A. Command Centre counts are read-only aggregates; nothing posts automatically.

## 12. Edge cases and limits
- Marketing is admin-only (route guard `allowed={["admin"]}` + `can.accessMarketing`).
- Command Centre works without migration 122; Templates / Planner require 122 applied.
- Content creation is via Legacy Studio until Run B; Legacy route remains until Run B is proven.

## 13. Owner of the process
Admin / Director
Next review: after Run B (media-first Creator)

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Migration `122_marketing_command_centre_mvp.sql` applied; 7 templates seeded
- [ ] Logged in as Admin
- [ ] A second login as a non-admin (supervisor/employee) for the access test

### Test cases

**TC-01 — Command Centre is the Marketing home**
1. Log in as Admin, click **Marketing** in the sidebar
2. Expected: `/marketing` loads the **Command Centre** with weekly snapshot tiles (not the old Create form)
- [ ] Pass  [ ] Fail

**TC-02 — Content Studio shell, not the legacy form**
1. Open **Content Studio** (`/marketing/studio`)
2. Expected: the media-first placeholder with **Open Legacy Studio** button — NOT the prompt-first form
- [ ] Pass  [ ] Fail

**TC-03 — Legacy Studio loads and still generates/saves**
1. Open `/marketing/studio/legacy`
2. Expected: "Legacy Studio (temporary)" banner + the original generator; generate + save still work
- [ ] Pass  [ ] Fail

**TC-04 — Media CTA seeds Legacy Studio via `?asset_id=`**
1. Marketing → Media → open a photo with consent → **Generate post from this photo**
2. Expected: routes to `/marketing/studio/legacy?asset_id=<id>` and the generator pre-fills from the photo
- [ ] Pass  [ ] Fail

**TC-05 — Non-admin cannot access Marketing**
1. Log in as supervisor/employee
2. Expected: Marketing hidden in sidebar; direct nav to `/marketing` redirects to `/home`
- [ ] Pass  [ ] Fail

**TC-06 — Weekly Planner + templates**
1. Open `/marketing/planner` → **Start from a template** → pick one → **Use this template**
2. Expected: a campaign + empty slots are created; empty slots show **Create from media**
3. Click an empty slot's CTA → opens `/marketing/studio?campaign_id=<id>&week_start=<date>`
- [ ] Pass  [ ] Fail

**TC-07 — Command Centre snapshot loads**
1. On `/marketing`, confirm the five tiles render counts without error
2. Expected: `GET /api/marketing/command-centre` returns a snapshot; retry works on error
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
