# Job Records Filing — Hub-wide record-keeping into Dropbox `INTERNAL/`

**Date:** 2026-06-22
**Goal:** Every document, financial record, and piece of correspondence produced by ANY module, across the whole job lifecycle (lead → pre-construction → on-site → handover), is filed and sorted into the job's Dropbox `INTERNAL/` tree — so the job folder is a complete, audit-ready record archive.

**Canonical root:** `/BLUE LEAF BUILDING/PROJECTS/BLUE LEAF BUILDING/[JOB ADDRESS]/INTERNAL/<category>/`

---

## Architecture

One service decides WHERE every record lives; modules pass a **semantic category**, never a path.

- **`server/lib/jobRecordsFiler.mjs`** — `fileJobRecord({ jobAddress, jobId, category, fileName, buffer, register, title, documentType })`
  - Maps `category` → `INTERNAL/<folder>` via `RECORD_FOLDERS` (single source of truth).
  - Sequential upload, idempotent folder creation, **never throws** (Dropbox is a non-fatal mirror), honours the namespace/path-root conventions in `dropboxClient.mjs`.
  - `register: true` ALSO writes a canonical `job_documents` row → **the filed record becomes exposable to the client portal**. This is what makes a filed contract/variation/claim appear in the client's Documents tab — and it closes the "no contract-source writer" gap (audit task #30).
- **`dropboxClient.ensureExtendedJobFolders`** — scaffolds the full `INTERNAL/` taxonomy on job creation (idempotent). Legacy top-level folders (SITE DIARY/SCHEDULE/WHS/MARKETING) are kept during rollout for back-compat.

### The INTERNAL taxonomy (RECORD_FOLDERS)

| Category | Folder | Producer(s) |
|---|---|---|
| `contract` | `INTERNAL/CONTRACT` | signed contract, authority-to-proceed, addenda |
| `plans` | `INTERNAL/APPROVED PLANS` | architectural/structural drawings (record copy) |
| `permit` | `INTERNAL/PERMITS & APPROVALS` | building permit, dev approval, certifier |
| `engineering` | `INTERNAL/ENGINEERING & REPORTS` | geotech, energy/NatHERS, BAL, structural, survey |
| `selections` | `INTERNAL/SELECTIONS` | PC items, finishes schedule, client selections |
| `rfq` | `INTERNAL/RFQ` | RFQ packs sent *(existing)* |
| `quote` | `INTERNAL/QUOTES` | accepted/declined subbie quotes *(existing)* |
| `purchase_order` | `INTERNAL/P.O` | issued POs *(existing)* |
| `variation` | `INTERNAL/VARIATIONS` | variation PDFs |
| `progress_claim` | `INTERNAL/PROGRESS CLAIMS` | claim PDFs + remittances |
| `invoice` | `INTERNAL/INVOICES` | supplier invoices, financial docs *(existing)* |
| `site_diary` | `INTERNAL/SITE DIARY` | daily site diaries |
| `site_photo` | `INTERNAL/SITE PHOTOS` | progress photos |
| `schedule` | `INTERNAL/SCHEDULE` | schedule PDFs, baselines |
| `whs` | `INTERNAL/WHS` | SWMS, incident reports, compliance |
| `induction` | `INTERNAL/WHS/INDUCTIONS` | site inductions |
| `correspondence` | `INTERNAL/CORRESPONDENCE` | client emails, meeting minutes, RFIs |
| `certificate` | `INTERNAL/CERTIFICATES & HANDOVER` | occupancy/compliance certs, warranties, manuals |
| `presale` | `INTERNAL/PRESALE DOCS` | fee proposals, tender presale *(existing)* |
| `lead` | `INTERNAL/LEAD DOCS` | pre-job lead documents *(existing)* |
| `portal` | `INTERNAL/PORTAL` | portal-shared docs *(existing)* |

---

## Per-module wiring rollout

Each producer calls `fileJobRecord` with the right category. `register: true` only where the doc should be client-exposable (contract, variation, progress claim, certificate, plans).

| Module / file | Event | Category | register? | Status |
|---|---|---|---|---|
| `financeCCRoutes` variation send | variation PDF | `variation` | yes | **DONE** ✓ |
| `financeCCRoutes` claim send | claim PDF | `progress_claim` | yes | TODO |
| `financeRoutes:492` | supplier invoice | `invoice` | no | TODO (repoint to filer) |
| `module5Routes` fee proposal | proposal PDF/DOCX | `presale` | no | TODO (confirm/repoint) |
| `siteDiaryRoutes:124` | diary PDF | `site_diary` | no | TODO (repoint from top-level SITE DIARY) |
| `scheduleRoutes:1214` | schedule PDF | `schedule` | no | TODO (repoint) |
| `whsRoutes:117/200/244` | SWMS/incident/compliance | `whs` | no | TODO (repoint) |
| `inductionRoutes:141` | induction PDF | `induction` | no | TODO (repoint) |
| `module4Routes` win-finalize | accepted/declined quotes | `quote` | no | exists (copyDropboxFile) — migrate to filer |
| `module4Routes`/RFQ | RFQ pack | `rfq` | no | TODO |
| PO generation | PO PDF | `purchase_order` | no | TODO |
| **NEW** admin "file contract" | upload/register contract | `contract` | yes | TODO — **this is the explicit #30 closure for contracts** |
| **NEW** correspondence capture | client email/minutes | `correspondence` | no | TODO (needs a capture entry point) |
| Plans/engineering/permits/selections/certificates | record copies | resp. | plans/cert: yes | TODO |

### Contract capture (the #30 closure)

The building contract is produced externally. Two entry points (build both):
1. **Upload**: an admin endpoint (multer + `fileJobRecord({category:'contract', register:true})`) so staff upload the signed contract → filed in `INTERNAL/CONTRACT` + registered as a `job_document` → exposable to the portal.
2. **Register existing Dropbox file**: an endpoint that takes an existing Dropbox path → registers it as a `job_document` (for contracts already sitting in the job folder).

Once either lands, the portal's existing `expose-document` flow shares the contract — Documents is no longer hollow.

---

## Rollout order

1. **Foundation (DONE):** `jobRecordsFiler.mjs` + full `INTERNAL/` taxonomy + flagship wiring (variation send → file + register).
2. **Finance records:** claim send, supplier invoices, POs.
3. **Site records:** diary, schedule, WHS, inductions, photos (repoint from legacy top-level to `INTERNAL/`).
4. **Pre-construction:** contract (upload + register — closes #30), plans/engineering/permits/selections record copies.
5. **Correspondence:** capture client emails + meeting minutes into `INTERNAL/CORRESPONDENCE`.
6. **Backfill (optional):** a one-off to move existing top-level SITE DIARY/SCHEDULE/WHS records under `INTERNAL/` for in-flight jobs.

### Notes / refinements
- **Idempotency:** `fileJobRecord` uses Dropbox `autorename`; a re-send currently creates a new versioned file (correct for records) but can create a duplicate `job_documents` row — add a "skip register if one exists for this entity" guard in the finance wirings.
- **Privacy:** `INTERNAL/` is the private tree (never publicly shared — only `PLANS/` gets a public link). `fileJobRecord` only ever writes under `INTERNAL/`, so records are never exposed by a public link.
