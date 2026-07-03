# Marketing Inbox / Triage — Build Plan

_Draft 2026-07-04. Option A (Dropbox INBOX + Hub triage board) + auto-sort, approved by Sam. Build in batches; Sonnet builds, Claude reviews + E2E. No deploy without Sam._

## Purpose
Give the marketing library a **front door for bulk images**: dump hundreds of photos in one place, cull to the best, and file them correctly (category + job) in seconds. Today assets can only enter one-at-a-time already-categorised — there's nowhere to triage a 300-photo site dump.

## Baseline decisions (locked unless Sam changes)
1. **One physical file, dual-indexed — NO duplication.** A file lives in exactly one Dropbox location (a category folder). Its `marketing_library` row carries the **job link** (`project_id → jobs`). "By category" and "by job" are both index views over the same file + same shared link. A job's marketing is a Hub view, not a second physical copy. (Optional future: a Dropbox *shortcut* — not a copy — in `PROJECTS/[job]/MARKETING/` if physical presence is ever needed.)
2. **Job linking:** explicit assignment (triage picker / upload / backfill `job_id`) is authoritative and reliable. AI **location guess** (EXIF GPS, capture-date vs schedule, source folder) is a *confirm-me suggestion* — GPS matching needs job addresses geocoded to lat/long (not stored yet; small add).
3. **Auto-sort cost:** the heavy signals (quality, dedupe, job-hint) are **free local compute**. Only category classification hits an API — a cheap Haiku pass that first reuses the existing `analysis` jsonb; run on-demand/batched. ~$0.50–$1 per 300-photo dump, one-time per image.

## Dropbox structure (adds to the existing library)
```
/BLUE LEAF BUILDING/MARKETING/LIBRARY/
  00 INBOX/        ← bulk drop, unsorted (the dump zone)
  01 … 07 …        ← category folders (files MOVE here when filed)
  _REJECTED/       ← culled shots, archived (never hard-deleted)
```
Filing/rejecting **moves** the one physical file; nothing is copied or deleted.

## Data model — migration 133 (additive, non-destructive)
Add to `marketing_library`:
- `status text default 'filed'` — `inbox | filed | rejected` (existing rows default `filed`, so nothing changes for them).
- `quality_score numeric` — 0–1 composite (sharpness/exposure/resolution).
- `starred boolean default false`.
- `dup_group text` — near-duplicate cluster id (pHash).
- `review_notes text` (or reuse existing `notes`).
Indexes: `status`, `dup_group`. `project_id` (job) already exists.

## Image lifecycle
`inbox` → **keep** → `filed` (category + job set, file moved INBOX→category) · or **cull** → `rejected` (file moved INBOX→_REJECTED). Backfill "needs-review" assets land in the same inbox queue.

## Intake paths (into `00 INBOX/`)
- Phone camera auto-upload (Dropbox mobile app) into INBOX.
- Drag-drop in the Hub triage screen.
- Field app upload.
- A shared upload link handed to a photographer/subbie.
A scan/ingest picks up new INBOX files → creates `status='inbox'` rows → runs the free sorters.

## Auto-sort (the sorters)
| Signal | Method | Cost |
|---|---|---|
| `quality_score` | Laplacian variance (blur) + histogram (exposure) + resolution | free (local) |
| `dup_group` | perceptual hash (pHash) clustering | free (local) |
| job hint | EXIF GPS → geocoded job match; else capture-date vs active/scheduled job; else source folder | free; best-effort, human-confirm |
| category | reuse existing `analysis`; else Haiku vision → 1 of 7 buckets | ~$0.002/img, on-demand |

## Triage UI (new "Inbox" tab in the marketing library)
- Photo **grid + lightbox**; keyboard cull (e.g. `P` keep / `X` reject / `1–5` star).
- Each tile shows AI **category + job guess**, quality score, dup-group badge, needs-review flag.
- **Bulk-assign** category & job across a selection; "File selected" / "Reject selected".
- Filtered views: needs-review, by dup-group (pick one of a burst), lowest-quality-first, by job.

## Server pieces
- Dropbox **move** helper (`moveFile` INBOX→category and INBOX→_REJECTED) in `dropboxClient.mjs`.
- `POST /api/marketing/library/inbox/scan` — ingest new INBOX files → `inbox` rows + run free sorters.
- `POST /api/marketing/library/:id/file { category, projectId }`, `POST …/:id/reject`, + **bulk** variants — set fields + move the Dropbox file + update `status`.
- `POST …/suggest-categories` — on-demand Haiku pass (reuse `analysis` first).
All `apiResponse.mjs`-compliant; sequential Dropbox ops (never Promise.all).

## Build batches (each: Sonnet build → Claude review → live E2E)
- **INBOX-BATCH-A (backend):** migration 133 + Dropbox move helper + file/reject/bulk endpoints + inbox scan/ingest. No live Dropbox during build.
- **INBOX-BATCH-B (triage UI):** the grid/lightbox cull + bulk-file screen wired to A.
- **INBOX-BATCH-C (auto-sort):** free sorters (quality/dedupe/job-hint) + optional Haiku category pass; needs a job-geocode add for GPS matching (small).

## Out of scope (for now)
Physical duplication into per-job folders (index view instead); geocoding all jobs (only needed for GPS auto-match); auto-filing without human confirm (system suggests, human files — same rule as CRM).

## Verification (per batch)
Boot API (pollers off), seed a few `BLH TEST` images into INBOX, run scan → rows appear as `inbox` with quality/dup/category/job guesses; file one → Dropbox file moves INBOX→category, row `status=filed` with job set; reject one → moves to _REJECTED, `status=rejected`; originals never deleted; `/check` clean; remove test fixtures.
