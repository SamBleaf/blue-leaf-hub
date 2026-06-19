# PLAN — Dropbox file structure, permissions & sales-pipeline saves

**Status:** planned (not started). Drafted 2026-06-19. Execute when ready (Fri+).
**Decisions locked:** (1) use the **PLANS-subfolder** approach (one job root, public link on `PLANS`, `INTERNAL` a sibling). (2) Drop "combine 2 RFQs into 1 email" (not worth it). (3) Add a **Tender-Board "Email all trade recipients"** feature as the stopgap for already-live jobs.

---

## 0. Root cause (verified in `server/lib/dropboxClient.mjs`)

- Every job's shared link is created on the **job root** `PROJECTS/BLUE LEAF BUILDING/[address]/` with `requested_visibility: team_only` (`getOrCreateSharedLinkForPath`, line ~496; `ensureJobFolderStructure`, line ~630).
- **`INTERNAL` is a child of that linked root** — `[address]/INTERNAL/{QUOTES, PRESALE DOCS, RFQ, INVOICES, P.O, PORTAL, job-data.json}`.
- ⇒ Bug A: `team_only` blocks external subbies from seeing plans. Bug B: the link's folder *contains* INTERNAL, so a naive flip to public exposes quotes/presales/invoices.

## 1. Complete Dropbox WRITE inventory (no stone unturned)

| # | What is saved | Helper (`dropboxClient.mjs`) | Path TODAY | Triggered by | New scheme |
|---|---|---|---|---|---|
| 1 | Job folder + shared link | `ensureJobFolderStructure` | copies template→`[addr]/`; **links root, team_only** | `/api/dropbox/ensure-job-folders` ← RfqEngine compose/send | **CHANGE → link `[addr]/PLANS`, public** |
| 2 | Tender/plan docs | `uploadTenderDocumentToJob` + `tenderSegmentsFromDocumentCategory` / `classifyTenderUploadSegments` | plan cats at **root** `[addr]/ARCHITECTURAL` etc.; `internal/other`→`[addr]/INTERNAL/PRESALE DOCS` | `/api/dropbox/upload-tender-document` ← RfqEngine | **CHANGE → plan cats `[addr]/PLANS/<cat>`; internal unchanged** |
| 3 | RFQ email copy (.txt) | `saveRfqEmailCopyToDropbox` | `[addr]/INTERNAL/RFQ/` | `/api/dropbox/save-rfq-email-copy` ← RfqEngine | INTERNAL — no change |
| 4 | Inbound quote PDF (manual) | `uploadReceivedQuotePdfToJob` | `[addr]/INTERNAL/QUOTES/` | `/api/dropbox/save-quote-pdf` | INTERNAL — no change |
| 5 | Inbound quote PDF (IMAP reply) | `uploadImapReplyQuotePdfToSharedQuotes` | `[addr]/INTERNAL/QUOTES/` | IMAP watcher | INTERNAL — no change |
| 6 | QUOTES/ACCEPTED + DECLINED | `ensureInternalQuoteSubfolders` | `[addr]/INTERNAL/QUOTES/*` | `module4Routes:282` | INTERNAL — no change |
| 7 | Win/lose/notify email copy | `saveOutcomeEmailTxtToRfqFolder` | `[addr]/INTERNAL/RFQ/` | `module4Routes:216/492/545` | INTERNAL — no change |
| 8 | Purchase-order PDF | `uploadPoPdfToJobFolder` + `ensureInternalPoFolder` | `[addr]/INTERNAL/P.O/` | `module4Routes:657` | INTERNAL — no change |
| 9 | Fee-proposal PDF | `uploadFeeProposalPdfToPresaleDocs` | `[addr]/INTERNAL/PRESALE DOCS/` | `module5Routes:513`, `jobsApiRoutes:233` | INTERNAL — no change |
| 10 | job-data.json | `mergeJobDataJsonFile` | `[addr]/INTERNAL/job-data.json` | `jobsApiRoutes:140` | INTERNAL — no change |
| 11 | Finance invoices | (financeRoutes) | `[addr]/INTERNAL/INVOICES/` | `financeRoutes:897` | INTERNAL — no change |
| 12 | Portal photos | `uploadPortalPhoto`/`portalPhotosFolderPath` | `[addr]/INTERNAL/PORTAL/` | `portalRoutes:406` | INTERNAL — ⚠ VERIFY (client-facing; must be served by the app, NOT via the public link) |

**Net effect of the lighter approach: only rows #1 and #2 change in code.** Everything internal already lives under `INTERNAL/` and becomes automatically protected once the public link sits on the sibling `PLANS/` folder instead of the root.

## 2. CRITICAL — the permissions fix (PLANS-nesting)

**Target structure:**
```
PROJECTS/BLUE LEAF BUILDING/[address]/
  PLANS/            ← public shared link lives HERE (anyone with URL, no account)
    ARCHITECTURAL/ ENGINEERING/ SURVEY/ ENERGY REPORT/ TIMBER FRAMING/ INTERIORS…
  INTERNAL/         ← sibling, NEVER linked; QUOTES, PRESALE DOCS, RFQ, INVOICES, P.O, PORTAL, job-data.json
```
A folder shared-link only grants its own subtree, so a `PLANS` link cannot reach the sibling `INTERNAL`. The job **root must not be separately shared.**

**Code changes (small):**
1. `getOrCreateSharedLinkForPath` → **parameterize visibility**: `(token, path, { visibility })`. Use `public` ONLY for the PLANS link; keep `team_only` for any internal file links (e.g. quote viewable links). Do NOT make it public globally.
2. `ensureJobFolderStructure` → after copy, `createFolderIfNotExists(.../PLANS)`, create the **public** link on `${sharedRoot}/PLANS`, return `{ plansRoot, plansLinkUrl, privateRoot }`. Stop linking the root.
3. `tenderSegmentsFromDocumentCategory` + `classifyTenderUploadSegments` → prefix plan categories with `PLANS` (e.g. `["PLANS","ARCHITECTURAL"]`); leave `internal`/`other` → `["INTERNAL","PRESALE DOCS"]`.
4. **Dropbox NEW JOB TEMPLATE folder** (`DROPBOX_TEMPLATE_PATH`) → nest the plan folders under a `PLANS/` subfolder; keep `INTERNAL/` at the job root. (No code copies folders per-loop — layout comes from the template, so the template MUST be reshaped.)
5. Persist/return the **plans link** as the "dropbox link" that goes into RFQ emails (replaces the current root link).

**Migration (existing jobs):** they have plan folders at root + a team_only root link. One-time per job: create `PLANS/`, move plan folders in, create public PLANS link, **revoke the root link**. Script it as `/api/dropbox/migrate-job-to-plans?jobAddress=` (idempotent). For the CURRENT live job we don't block on this — see §3.

## 3. NEW — Tender-Board "Email all trade recipients" (stopgap + ongoing util)

Button next to **Scan inbox** on `TenderDetail.jsx` (when `job.status==='tendering'`). Opens a panel:
- A **trade toggle bar** listing the trades that received an RFQ for this job (from the job's `rfqs`), each on/off; pre-selected = all sent.
- A short message + the (new, corrected) **PLANS link**.
- **Send** → emails each selected trade's sent recipients **as a reply to the original RFQ thread**: `In-Reply-To`/`References` = that rfq's `sent_message_id`, subject `Re: <original RFQ subject>`. Logs to `correspondence` (outbound).

**Server:** extend `/api/tender/prefill` (or a new `/api/rfq/recipients?jobId=`) to also return each rfq's `sent_message_id` + `subject` (currently returns trade/sub/status/sent_at/deadline). Reuse `sendPlainMail` + the correspondence insert.
**Threading caveat:** Resend manages its own `Message-ID` (we strip it), but `In-Reply-To`/`References` are different headers it MAY honor — TEST. If not honored, clients still thread on the `Re:` subject. Acceptable either way.

This lets us push the corrected plans link to everyone on the live job today, without first migrating its folder structure.

## 4. HIGH — Attach plans to RFQ emails (no-Dropbox-account path)

Transport already supports attachments (`resendSend`/`smtpSend`/`gmailSend` all map `attachments`); RFQ send just never sets them.
- **UI (Step 4):** a "📎 Attach plans to email" toggle, default ON for the **architectural** PDF(s), with an expandable per-document checklist (the PDFs uploaded at extraction, by `docType`).
- **Wire:** at send, read the selected PDF blobs from IndexedDB → `message.attachments` → `/api/rfq/send` → `sendPlainMail`. Cap total ~20 MB; if over, warn and rely on the PLANS link for the oversize ones.
- Combined with the public PLANS link, subbies can view docs with **or** without Dropbox.

## 5. MEDIUM — Correspondence cleanup

- **Attachments roll-up:** an "Attachments" box at the bottom of each trade (below *Log reply*) aggregating every inbound attachment (data already in `correspondence.attachments` + `INTERNAL/QUOTES`).
- **Stop double-printing:** trim quoted reply history (`On … wrote:` + `>`-prefixed blocks + signature) on **inbound ingest** (IMAP path) so each reply stores/shows only its new text; keep the raw in a collapsible "show full".

## 6. Sales-pipeline: create the folder earlier

Today the folder is only created at RFQ-compose. Presales docs (fee proposals, briefs, correspondence) happen earlier. **Create both trees (`PLANS/` empty + `INTERNAL/`) at tender entry / job creation** (tie to the auto-create-on-win trigger or tender stage) so every later stage has a home: fee proposal → `INTERNAL/PRESALE DOCS`; briefs/correspondence → `INTERNAL`; plans → `PLANS`; quotes/invoices/POs → `INTERNAL`.

## 7. Verify before/while building
- ⚠ **Portal photos** (#12): stored under `INTERNAL/PORTAL` but client-facing — confirm the client portal serves them through the app/API (server-side Dropbox download), NOT via the public PLANS link. If it relied on a shared link, rework.
- Resend honoring `In-Reply-To`/`References` (threading) — test.
- The Dropbox template reshape is a manual step (no code creates the plan subfolders).

## 8. Suggested execution order
1. §2 permissions/structure (CRITICAL; template reshape + 2 code spots + parameterized visibility)
2. §3 Tender-Board "Email recipients" (unblocks the live job immediately)
3. §4 email attachments (HIGH, independent)
4. §6 pipeline folder timing
5. §5 correspondence
6. §2 migration script for old jobs
