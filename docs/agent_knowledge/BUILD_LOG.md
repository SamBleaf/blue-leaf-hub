# Build Log

Running log of shipped changes + deferred follow-ups. Newest first.

---

## 2026-06-16 — Go-live day (worker app + supervisor logins + carpentry/Buildxact)

**Deploy mechanics (important):** Production (blueleafhub.com.au — Vercel frontend
+ Railway backend) deploys from the **`main`** branch. Work had been accumulating
on `carpentry-material-invoice-capture` (24 commits / 2 days), so none of it was
live. Resolved by fast-forward merging the branch into `main`; both branches are
now kept in sync on each push. **Going forward: commit to `main` (or merge to
`main`) for anything to actually deploy.**

**Shipped:**
- **Worker PWA** — mobile viewport fix, larger touch targets, timesheet site/job
  guard + timezone-tolerant date, carpentry-job task counts, "My week" calendar
  (green/red/amber dots), and the **dual-manifest split** (`worker.html` carries
  the Worker identity / blue icon / `start_url:/worker`; `index.html` keeps the
  Hub identity) with `/worker` excluded from the SW navigate-fallback.
- **iOS install hint** — iPhone Safari never fires `beforeinstallprompt`, so the
  worker app now shows manual "Share → Add to Home Screen" steps on iOS.
- **Supervisor app-login invite** — was using Supabase's own (unconfigured) email
  and silently "succeeding". Now routes through the proven `/api/auth/invite`
  (Gmail) **and** returns a copyable link; `accept-invite` tolerates an auth user
  already created by a failed attempt. Removed leftover `localhost:7509` debug
  instrumentation from the invite paths.
- **Tender → RFQ** — "Proceed to RFQ Engine & Estimate" now always shows at the
  tender stage and creates the job on the fly if needed (referrer credited).
- **Carpentry / Buildxact import** — accept a job **number** (e.g. "J1120"), not
  just a GUID (client-side match across job fields); page jobs at Buildxact's
  `$top`=100 cap; walk the **3-level** estimate hierarchy (category → sub-item →
  line) so items stop falling into a bogus "Buildexact" bucket; fix budget
  seeding (XLSX path read the wrong response key; both paths now seed
  labour/material from reviewed categories). Verified vs the real Q1120 export:
  **Labour $50,620.40 / Material $123,123.79 = $173,744.19**.
- **Carpentry Delete job** — `DELETE /api/carpentry/jobs/:id` + a Delete button on
  the job detail header (children cascade; timesheets/marketing SET NULL).

**DEFERRED — test-data cleanup (do when Sam tackles it):** Several modules hold
test records from the rollout (test workers, timesheets, leads, carpentry/other
jobs, etc.). Carpentry now has a self-serve Delete; the rest still need clean
delete/archive affordances before a bulk cleanup. Add per-module delete
affordances (don't bulk-delete blind) when the cleanup is scheduled.
