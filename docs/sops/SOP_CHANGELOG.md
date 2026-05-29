# SOP Changelog — Blue Leaf Hub

Track every SOP change here. One row per change.

---

| Date | App Section Changed | SOP Affected | Change Needed | Status | Reviewed By |
|------|---------------------|-------------|---------------|--------|-------------|
| 2026-05-29 | Marketing + Marketing Intelligence | 18-01 through 18-07, 19-01 through 19-08 | ADVERSARIAL AUDIT — all 15 SOPs tested against live code. 3 critical bugs found: CRIT-01 publish endpoint camelCase mismatch (ContentLibrary.jsx sends contentItemId, server reads content_item_id → HTTP 400 on every publish), CRIT-02 intelligence dashboard reads wrong API key paths (data?.thisMonth vs data?.dashboard?.this_month), CRIT-03 content-performance query selects non-existent columns (mode, content_pillar, engagement_rate). 5 API standards violations in marketingRoutes.mjs (no ok()/err() import, no rowsToCamel, raw Supabase errors). 5 banned phrases missing from automated checker (luxurious, stunning, bespoke, curated, elevated). All test_status fields updated in SOP frontmatter. Full report at docs/sops/AUDIT_MARKETING_2026-05-29.md | Done | Claude |
| 2026-05-29 | Finance | 09-01 through 09-12 | MODULE 1 Finance SOPs written — all 12 Finance SOPs created including 09-01 (Upload Invoice), 09-02 (AI Extraction Review), 09-03 (Job Match), 09-04 (Approve), 09-05 (Hold), 09-06 (Reject), 09-07 (Job Command Centre Overview), 09-08 (Progress Claims), 09-09 (Margin Risk Portfolio), 09-10 (Variations), 09-11 (WIPAA Review), 09-12 (Cashflow Forecast). All include Section 14 test scripts tied to actual API routes. SOP_INDEX.md updated — 09-10 filename corrected, 09-11 and 09-12 added, total updated to 105. | Done | Claude |
| 2026-05-29 | Marketing Intelligence | 19-01 through 19-08 | MODULE 5 Marketing Intelligence built — updated all 8 SOPs from "planned — not yet built" to "built 2026-05-29". Section 14 test scripts existed pre-build and are ready to run on deployment. SOP_INDEX.md updated — Section 14 column set to Yes for all 8. | Done | Claude |
| 2026-05-20 | All modules | All SOPs | Initial SOP inventory created (82 SOPs, all Draft) | Draft | Sam Morris |

---

*Add new rows at the top when changes are made.*  
*Format: YYYY-MM-DD | Section | SOP file name | Description | Done/In Progress/Pending | Name*
