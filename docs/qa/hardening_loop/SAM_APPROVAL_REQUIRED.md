---
active: false
---

# Sam Approval Required — (inactive)

**No approval is currently required.** This file is an inactive stub.

When an agent or the orchestrator hits an approval gate, it **overwrites** this file with
`active: true` and the details below. While `active: true` (or `approval_required: true` in
[CURRENT_STATE.md](./CURRENT_STATE.md)), **the orchestrator halts** and `next_agent` becomes `sam`.

## Template (fill when active)

- **Decision needed:** <one line>
- **Options:** <A / B / C>
- **Recommendation:** <which + why>
- **Risk:** <what could go wrong each way>
- **Exact blocked command/task:** <the precise step that cannot proceed without approval>
- **Raised by:** <agent> · **Date:** <date> · **Related bug IDs / wave:** <…>

## Approval gates (reminder)
Fixing Critical/High without an approved bug ID · production data · live integrations · sending
email · RFQ send · PO generation · Buildxact/Xero sync · Dropbox write flow · schema migration ·
auth/security logic change · finance calculations · payroll/timesheet approval logic ·
client-portal invite / real-client pilot · deploy · destructive command · broad refactor ·
route/table rename · accepted-gap closure · business-workflow decision · **starting UI Wave 01B
polish (needs the 01A module-polish plan approved).**
