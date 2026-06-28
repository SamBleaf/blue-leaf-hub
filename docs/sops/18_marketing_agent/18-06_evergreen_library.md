---
sop_version: 1.0
last_reviewed: 2026-06-28
app_version: marketing-run-a
screenshot_status: placeholders_only
owner: Admin / Marketing Operator
test_status: untested
---

# SOP 18-06: Evergreen Library

**Module:** Marketing — Evergreen Library
**SOP ID:** 18-06
**Status:** Draft (Run A — runtime verification pending staging)
**Priority:** Medium

---

## 1. Who uses this
Admin (Sam) and marketing operator (Josh) to find high-quality content that can be reused or reshared.

## 2. When to use it
- When planning a week with no new site photos ready — pull from the Evergreen Library instead
- When a high-performing post should be reshared for a new audience
- When reviewing what content has proven long-term value

## 3. What this does
The Evergreen Library shows all content items with an `evergreen_score > 0`. A content item gets an evergreen score when it is explicitly marked as evergreen from the Content Studio or Library (using the **Mark as evergreen** action). Items are sorted highest score first, so the best content is always at the top.

## 4. Before you start
- Logged in as Admin.
- Migration 122 applied (`marketing_content_items.evergreen_score` column). Without it, the Evergreen Library cannot load real data.
- At least one content item must be marked as evergreen (see Step 5).

## 5. How to use the Evergreen Library

**Step 1 — Open the Evergreen Library**
Marketing → **Evergreen** (`/marketing/evergreen`).

**Step 2 — Browse evergreen content**
Each card shows:
- Channel
- Josh labels (quality signals)
- Body preview
- Evergreen score

**Step 3 — Pick a piece to reshare**
When resharing, go to the Marketing Calendar and create a new posting slot for that content item, or open it in the Legacy Studio to refresh the copy.

**Step 4 — Mark a new item as evergreen**
From any content item in the Library (`/marketing/library`):
1. Open the item
2. Click **Mark as evergreen** and set a score (1–10)
3. The item now appears in the Evergreen Library

You can also update the evergreen score (e.g. promote a 5 to an 8 if a reshare performed well).

## 6. Evergreen score guide
| Score | Meaning |
|---|---|
| 9–10 | Best of Blue Leaf — reshare quarterly |
| 7–8 | Strong performer — reshare every 6 months |
| 5–6 | Good content — reshare annually or when relevant |
| 1–4 | Low evergreen value — appears in library but deprioritise |

## 7. Screenshot placeholders
[insert screenshot: Evergreen Library card grid]
[insert screenshot: Individual card with evergreen score badge and Josh labels]

## 8. Troubleshooting
| Problem | Solution |
|---|---|
| Evergreen Library shows demo items | Migration 122 not applied or no staging DB — see SOP 18-08 |
| No items in the Evergreen Library | No items have been marked as evergreen yet — mark items via the Library |
| Evergreen score did not update | API error on `POST /api/marketing/content/:id/evergreen` — check console |

## 9. Related SOPs
- [Content Studio overview](18-01_content_studio_overview.md)
- [Calendar and publishing](18-05_calendar_scheduling_and_manual_publishing.md)

## 10. Automation notes
- The Evergreen Library is a read-only view. Evergreen scoring is done via `POST /api/marketing/content/:id/evergreen`.
- Evergreen items are not scheduled automatically. You decide when to reshare.
- The score filter (`evergreen_score > 0`) is applied server-side.

## 11. Edge cases and limits
- Items with `evergreen_score = 0` (or null) do not appear in the Evergreen Library — they remain in the main Library.
- A published item can be marked evergreen at any time.
- There is no current maximum evergreen score — the endpoint accepts any positive integer; convention is 1–10.

## 12. Owner of the process
Admin / Marketing Operator
Next review: after staging runtime verification

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Migration 122 applied; `marketing_content_items.evergreen_score` column exists
- [ ] At least one item with `evergreen_score > 0` in the DB
- [ ] Logged in as Admin
- [ ] Staging DB available

### Test cases

**TC-01 — Evergreen Library loads real items**
1. Open `/marketing/evergreen`
2. Expected: item cards render; no "Demo items" banner
- [ ] Pass  [ ] Fail

**TC-02 — Items sorted by evergreen_score descending**
1. Verify order: highest score items appear first
2. Expected: items ordered by `evergreen_score DESC`
- [ ] Pass  [ ] Fail

**TC-03 — Mark as evergreen updates the Library**
1. From the main Library, mark a published item with score 7
2. Open Evergreen Library
3. Expected: the item appears; score badge shows 7
- [ ] Pass  [ ] Fail

**TC-04 — Update evergreen score**
1. Call `POST /api/marketing/content/:id/evergreen` with `{ score: 9 }` on an existing evergreen item
2. Reload Evergreen Library
3. Expected: item shows updated score 9
- [ ] Pass  [ ] Fail

**TC-05 — Demo fallback shows without real data**
1. Open `/marketing/evergreen` with no staging DB
2. Expected: demo items shown; "Demo items" banner visible; no crash
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
