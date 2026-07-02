---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: marketing-run-a
screenshot_status: placeholders_only
owner: Admin / Marketing Operator
test_status: untested
---

# SOP 18-02: Weekly Marketing Planning

**Module:** Marketing — Weekly Planner
**SOP ID:** 18-02
**Status:** Draft (Run A — runtime verification pending staging)
**Priority:** High

---

## 1. Who uses this
Admin (Sam) and the marketing operator (Josh). Marketing is admin-only in Stage 1.

## 2. When to use it
At the start of each week to plan what content Blue Leaf will post. Use it to assign a campaign template, see what slots are open, and queue up content creation tasks.

## 3. What this does
The Weekly Planner lets you choose a campaign template (e.g. "How We Build — Week"), which creates a campaign and its empty posting slots for the selected week. Each slot shows what channel and theme is needed and has a **Create from media** button that opens the Content Studio pre-loaded with that campaign and week.

## 4. Before you start
- Logged in as Admin.
- Migration `122_marketing_command_centre_mvp.sql` applied (7 templates seeded). Without it, the template picker shows empty and the planner cannot create slots.
- At least one week of media assets uploaded (optional — you can still create a plan and fill media later).

## 5. How to plan the week

**Step 1 — Open the Weekly Planner**
Marketing → **Weekly Planner** (`/marketing/planner`).

**Step 2 — Navigate to the correct week**
Use **← Prev** and **Next →** buttons at the top to move to the week you want to plan. The week label shows "Mon DD MMM → Sun DD MMM".

**Step 3 — Choose a campaign template**
Click **Start from a template**. The template picker slides out showing the 7 Blue Leaf campaign templates:

| Template key | Cadence | Best for |
|---|---|---|
| `how_we_build` | 3 posts/wk | Educational — process and craft |
| `client_results` | 2 posts/wk | Social proof — completed builds |
| `why_blue_leaf` | 2 posts/wk | Brand — values and differentiators |
| `blue_leaf_life` | 3 posts/wk | Culture — team and behind the scenes |
| `project_deep_dive` | 2 posts/wk | Long-form — one project per week |
| `suburb_focus` | 2 posts/wk | Local — suburb-specific content |
| `renovation_season` | 3 posts/wk | Seasonal — renovation-ready messaging |

Pick the one that fits your content direction for the week.

**Step 4 — Apply the template**
Click **Use this template**. This creates a campaign record and the week's empty posting slots (e.g. 3 slots: Mon IG, Wed FB, Fri IG).

**Step 5 — Review the slot grid**
Each empty slot shows:
- Day of the week
- Channel (Instagram / Facebook)
- A **Create from media** button

**Step 6 — Start creating content**
Click **Create from media** on a slot to open the Content Studio (`/marketing/studio?campaign_id=<id>&week_start=<date>`). The campaign and week are pre-filled in the Creator.

**Step 7 — Repeat for remaining slots**
Return to the Planner and fill the next slot. The plan is complete when all slots have content.

## 6. What happens next
- Content creation → Media Vault (SOP 18-03) then Content Studio (SOP 18-01)
- Review created packages → Approval Queue (SOP 18-04)
- Schedule and publish → Calendar (SOP 18-05)

## 7. Common mistakes
| Mistake | Why it happens | How to avoid it |
|---|---|---|
| Applying two templates to the same week | Indecision between themes | Choose one template per week. Applying a second creates a second campaign and its own slots — the Planner does not prevent this. |
| Leaving slots empty by end of week | Created the plan but did not fill all slots | Treat empty slots as a to-do. If a slot cannot be filled with new content, pull a high-scoring item from the Evergreen Library instead. |
| Opening Content Studio without selecting a slot CTA | Going directly to `/marketing/studio` | Always click **Create from media** on the slot so the campaign and week are pre-filled. A direct Studio visit will not link content to the plan. |

## 8. Troubleshooting
| Problem | Solution |
|---|---|
| Template picker empty | Migration 122 not applied — apply in Supabase SQL editor |
| "Use this template" does nothing | No staging DB — see staging setup SOP 18-08 |
| Slots not appearing after template applied | Reload the page; if still missing, check DB for the new campaign record |
| Wrong week showing | Use ← / → navigation — the Planner defaults to the current week |

## 9. Related modules
- [Content Studio overview](18-01_content_studio_overview.md)
- [Media capture and upload](18-03_media_capture_and_upload.md)
- [Content package review](18-04_content_package_review_and_approval.md)

## 10. Screenshot placeholders
[insert screenshot: Weekly Planner header with week navigation]
[insert screenshot: Template picker modal with 7 templates]
[insert screenshot: Slot grid after template applied — empty slots with Create from media buttons]

## 11. Automation notes
- Templates create slots automatically when applied. No manual slot creation needed.
- The slot count depends on the template's `weekly_target_posts` value (seeded in migration 122).
- Slots are deleted if the campaign is deleted.

## 12. Edge cases and limits
- Only one template should be applied per week. Applying a second creates a second campaign and its own slots.
- The Planner does not prevent multiple campaigns on the same week — Josh should choose one.
- `campaign_schedule_slots` requires migration 122. Without it the endpoint returns an error and the Planner shows an empty state.

## 13. Owner of the process
Admin / Marketing Operator (Josh)
Next review: after staging runtime verification

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Migration 122 applied; 7 templates seeded in `marketing_campaign_templates`
- [ ] Logged in as Admin
- [ ] Staging DB available

### Test cases

**TC-01 — Planner loads the current week**
1. Open `/marketing/planner`
2. Expected: week label shows current Mon–Sun range; no JS error
- [ ] Pass  [ ] Fail

**TC-02 — Week navigation works**
1. Click **← Prev** — verify week moves back 7 days
2. Click **Next →** — verify week advances 7 days
- [ ] Pass  [ ] Fail

**TC-03 — Template picker lists 7 templates**
1. Click **Start from a template**
2. Expected: 7 templates listed with names matching the seed data from migration 122
- [ ] Pass  [ ] Fail

**TC-04 — Apply template creates campaign + slots**
1. Select "How We Build" template → **Use this template**
2. Expected: `marketing_campaigns` has a new row; `campaign_schedule_slots` has rows for this week; Planner slot grid renders them
- [ ] Pass  [ ] Fail

**TC-05 — Create from media CTA passes campaign context**
1. Click **Create from media** on an empty slot
2. Expected: navigates to `/marketing/studio?campaign_id=<uuid>&week_start=<YYYY-MM-DD>`
- [ ] Pass  [ ] Fail

**TC-06 — Non-admin cannot access Planner**
1. Log in as supervisor/employee → navigate to `/marketing/planner`
2. Expected: redirected (route guard blocks non-admin)
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add entry to SOP_CHANGELOG.md
