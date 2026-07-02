---
sop_version: 1.0
last_reviewed: 2026-07-02
app_version: 1.0 — built (Batch 1B, migration 128)
screenshot_status: pending
owner: Admin / Staff
test_status: untested
---

# SOP 02-09: Lead Trust Rail & Unified Timeline

**Module:** Sales Manager — Lead Detail + CRM Contact Drawer
**SOP ID:** 02-09
**Status:** Draft
**Priority:** Medium

---

## 1. Who uses this
Admin, Staff (sales)

## 2. When to use it
- **Trust rail:** during and after client conversations, to record and track their objections, fears and priorities, and to see at a glance where the lead came from.
- **Unified timeline:** any time you want the full history of a lead in one place — activities, notes, conversations, CRM interactions and email opens/clicks — without hunting across tabs.

## 3. What this does
- **Trust & context rail** (Lead Detail, right side / mobile Summary): shows first touch, last touch, source category and campaign, plus a structured **objections / fears / priorities** list you can add to and mark addressed.
- **Unified timeline** (`v_lead_timeline`): one merged, time-ordered stream across `lead_activities`, `lead_notes`, `lead_conversations`, `crm_interactions` (matched directly or via the converted contact), and email opens/clicks.
- **CRM contact drawer:** for a converted contact, shows the same full history so nothing is hidden after conversion.

## 4. Before you start
- The lead must exist (SOP 02-01)
- Migration 128 must be applied (the `v_lead_timeline` view). If not applied, the timeline gracefully falls back to the activities-only view and the trust-rail signals list is empty — nothing breaks.

## 5. Step-by-step — log a trust signal

1. Open the lead detail
2. In the **Trust & context** rail, under "Objections · Fears · Priorities", click **+ Add**
3. Choose the kind: Objection / Fear / Priority
4. Type a short label, e.g. "Worried about budget blowout"
5. Click **Add** — it appears in the list
6. When you've dealt with it, click **✓** to mark it addressed (it shows struck-through); **↺** reopens it; **×** removes it

## 6. Reading the trust rail

| Field | Where it comes from |
|-------|--------------------|
| First touch | `first_touch_source` / medium (falls back to lead source) |
| Last touch | `last_touch_source` / medium |
| Source category | `lead_source_category` (SOP 02-08) |
| Campaign | `utm_campaign` or first-touch campaign |
| Objections/Fears/Priorities | `lead_signals` table |

Signals seeded from the winning-offer fields (`wo_biggest_concern` → objection, `wo_most_excited_about` → priority) are marked `[seeded from winning-offer]` in their detail — review and refine them.

## 7. Reading the unified timeline

The timeline merges every history source into one stream, newest first. Each row shows an icon for its kind:

| Kind | Icon | Source |
|------|------|--------|
| Activity | 📝 | lead_activities (incl. stage changes) |
| Note | 🗒️ | lead_notes |
| Conversation | 💬 | lead_conversations |
| CRM | 🤝 | crm_interactions |
| Email opened | 📧 | email_send_recipients.opened_at |
| Link clicked | 🔗 | email_send_recipients.clicked_at |

Email events only appear for a lead that was converted from a CRM contact (they link via the contact).

## 8. What happens on convert (backfill)

When you convert a CRM contact to a lead (SOP 17-xx), the contact's interactions are stamped with the new `lead_id` so they immediately join the lead's unified timeline. For contacts converted *before* this feature, run the one-time backfill:

```
node scripts/backfill-crm-timeline.mjs           # dry-run, reports counts
node scripts/backfill-crm-timeline.mjs --write    # applies
```

It also seeds `lead_signals` from winning-offer fields. It is idempotent — safe to re-run.

## 9. Common mistakes

| Mistake | How to avoid it |
|---------|-----------------|
| Logging objections in free-text notes only | Use the structured signals list — it aggregates and can be marked addressed |
| Expecting email events on a lead created directly | Email open/click events only flow through a converted CRM contact |

## 10. Troubleshooting

| Problem | Solution |
|---------|----------|
| Timeline shows only activities | Migration 128 not applied — the endpoint soft-falls-back to activities. Apply 128. |
| Converted contact's old interactions missing from timeline | Run `scripts/backfill-crm-timeline.mjs --write` |
| Signals list empty | None logged yet, or migration 127 (lead_signals) not applied |

## 11. Related SOPs
- [Classify fit & work the action queue](02-08_classify_fit_and_action_queue.md) — SOP 02-08
- [Log a call, meeting or note](02-03_log_activity.md) — SOP 02-03

## 12. Screenshot placeholders
[insert screenshot: Lead detail trust rail with signals]
[insert screenshot: Unified timeline stream]
[insert screenshot: Contact drawer full history for a converted contact]

## 13. Automation notes
- Timeline: `GET /api/sales/leads/:id/timeline` → `{ timeline: [...] }` (camelCase) from `v_lead_timeline`; returns `{ timeline: [], viewMissing: true }` if migration 128 unapplied.
- Signals: `GET/POST/PATCH/DELETE /api/sales/leads/:id/signals` — kind ∈ objection|fear|priority, status ∈ open|addressed.
- Convert backfill: `POST /api/crm/contacts/:id/convert` stamps `crm_interactions.lead_id` (idempotent, only null rows).
- One-time backfill: `scripts/backfill-crm-timeline.mjs`.

## 14. Owner of the process
Admin / Sales
Next review: 2026-12-02

---

## 15. Troubleshoot Agent Test Script

Automated: `npm run test:w1b-timeline-signals:write` (requires migrations 127+128 + server). Gap-documents if 128 not applied.

### Pre-test setup
- [ ] Migrations 127 + 128 applied
- [ ] Logged in as Admin

### Test cases

**TC-01 — Signals CRUD round-trip**
1. POST a signal (objection), GET list, PATCH to addressed, DELETE
2. Expected: all four succeed; addressed status persists
- [ ] Pass  [ ] Fail

**TC-02 — Invalid signal kind rejected**
1. POST signal with kind "nonsense"
2. Expected: 400
- [ ] Pass  [ ] Fail

**TC-03 — Timeline surfaces lead activity**
1. Create a lead (auto "Lead created" activity)
2. GET /timeline
3. Expected: at least one row with kind "activity"
- [ ] Pass  [ ] Fail

**TC-04 — Convert backfills crm_interactions.lead_id**
1. Create a contact + one interaction
2. Convert the contact
3. Expected: the interaction now has `lead_id` = new lead id
- [ ] Pass  [ ] Fail

**TC-05 — Soft-degrade when view missing**
1. (If 128 not applied) GET /timeline
2. Expected: 200 with `{ timeline: [], viewMissing: true }` — NOT 500
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Timeline unions all sources; signals CRUD works; convert backfill works
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
