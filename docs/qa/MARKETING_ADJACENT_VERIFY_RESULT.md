# Marketing-Adjacent Candidate Verification — Result

**Date:** 2026-06-27 · **Agent:** Hardening agent (audit-first) · **Mode:** AUDIT-FIRST / IMPLEMENTATION-PAUSED
**Scope:** Verify (promote→confirmed or dismiss) the four marketing-adjacent `◻ CANDIDATE` findings from
[ADVERSARIAL_AUDIT_2026-06-23.md](./ADVERSARIAL_AUDIT_2026-06-23.md), per the hardening-agent brief.
**Method:** read-only Explore-agent fan-out (4 verifiers, no code edits) **+ independent main-loop code
spot-check of each load-bearing claim**. No product code changed. No tests run that boot the API.

---

## 0. Brief-staleness findings (elevate first)

The hardening-agent brief was written against an earlier tree state. Two of its three streams are
already complete — acting on them would duplicate finished work:

| Brief stream | Brief premise | Actual state (verified) | Action |
|---|---|---|---|
| **P0 — commit dirty tree** | "~50 modified + ~190 untracked across agents" | **Working tree is CLEAN** (0 modified/0 untracked). The coordinated commit landed: HEAD `f656d63` "P1 external-seam live-fire… + cloud staging runbook", preceded by `8fe2603` "Stabilize 30-day hardening sprint". Program is now in **P1**. | **Nothing to do** — P0 done. |
| **RFQ Batch B — `/harden map W06` (then W07)** | map W06/W07; prove W06-DRIFT-001 | **W06 + W07 already mapped** (`docs/qa/workflows/06_…`, `07_…` exist); **Batch B 4/4 complete, P0-B1–B5 done**; **W06-DRIFT-001 CLOSED** (JOB-SPINE-01, accepted 2026-06-27); **SAM-W06-001 decided** ("Engine primary"). | **Do not re-map** — would be redundant documentation. |
| **Marketing-adjacent — verify candidates** | 4 `◻ CANDIDATE` findings unverified | Still unverified → **this is the live, owned, ungated stream.** | **Done — this doc.** |

RFQ `W07-DRIFT-005` (Resend strips custom Message-ID) remains an accepted/registered open drift with a
required test (W07-API-04); it is decision/test-gated, not a re-map or a fix-now item.

---

## 1. Verification results (calibrated severities)

> Severity is calibrated against the BUG_REGISTER bar (`Critical = data loss / wrong-job match /
> security exposure / blocked tender workflow`). The Haiku verifiers flagged MKT-MEDIA and MKT-INTEL
> `Critical`; I **downgrade both** with rationale below. All evidence re-checked in the main loop.

### W01-SEC-003 — Public enquiry anti-spam → **RESOLVED-BY-CODE** (was: open/Medium)
- **Verdict:** the protections the register says are "unconfirmed" **already exist and are correct.**
- **Evidence (verified from code):** `server/lib/marketingIntelligenceRoutes.mjs`
  - honeypot `website` field + silent skip — L274-288 (comment literally tags `W01-SEC-003 honeypot`)
  - per-IP rate limit (5 / 10 min) → 429 — L56-73, L289-291
  - field whitelist on `POST /api/public/enquiry` (L269-305) **and** `POST /api/public/attribution` (event-type allowlist + named fields, L234-258)
- **Residual:** no automated regression test of these controls; no CAPTCHA (optional). **Severity: Low.**
- **Governance:** endpoint is **public by design** — do NOT add staff auth. Acceptable closure = a regression test only.
- **Action:** update the BUG_REGISTER entry (open→protections-present, pending test `W01-SEC-03`).

### W22-SEC-001 — CRM bulk send ignores global unsubscribe + role-bypass → **CONFIRMED · High (Critical-candidate)**
- **Consequence tier:** consent / compliance + security exposure. **← ELEVATED.**
- **Evidence (verified from code):** `server/lib/crmRoutes.mjs`
  - `POST /api/crm/sends/:sid/send` is **`requireAuth` only** (no `requireRole("admin")`) — L1045. Any active staff incl. **employee** can fire bulk customer email. (`POST /api/crm/sends`, `PUT …/:sid`, `POST /api/crm/lists/:id/import` likewise.)
  - Smart-list recipients pulled from `crm_contacts` with **no `email_unsubscribes` / global `unsubscribed_at` check** — L1063-1072.
  - Manual-list filters `mailing_list_members.unsubscribed_at IS NULL` (**per-list only**) — L1073-1083; unsubscribe footer token is per-list — L1106-1119.
  - `increment_send_stat` RPC is non-idempotent (blind `+1`), called per webhook with no dedup — crmRoutes L1256-1279 + `supabase/migrations/073_increment_send_stat.sql`.
  - dev-api comment claims "/api/crm … its sensitive endpoints already carry requireRole(admin)" (`dev-api.mjs:879-901`) — **inaccurate for the send/import routes.**
- **Why elevate:** (a) AU **Spam Act 2003** requires global opt-out suppression across all lists — a globally-unsubscribed contact can still receive mail; (b) role-bypass = security exposure on customer-facing outbound. Exploitability is **gated on `RESEND_API_KEY` configured + CRM bulk email in active use** (latent if not yet live), but the consent gap is a real defect the moment it is used.
- **Smallest-safe fix (do NOT apply — Sam-gated):** enforce global suppression (`email_unsubscribes` + global `unsubscribed_at`) on **every** send path; make link-unsubscribe write global suppression (or check it at send); add `requireRole("admin")` **inline** to the CRM send/import routes (keep `/api/crm/unsubscribe` public — do NOT extend the prefix loop); make the stat increment idempotent.
- **Required test:** `W22-SEC-001` (employee→403 on send; globally-unsubscribed contact excluded; webhook-retry no double-count). Relates to Gate 8 role-matrix work (`test:role-matrix-gate`) — dedup there.

### W23-DRIFT-001 — Marketing media pipeline (ffmpeg on storage path; streamed upload not persisted; consent gap) → **CONFIRMED · Medium**
- **Consequence tier:** functional (parked Marketing module). *Verifier said Critical/money — downgraded: broken feature in a parked area, no data loss / security / tender-block.*
- **Evidence (verified from code):**
  - `reexportAsset()` / `assembleExport()` call `applyLUTs(originalPath, …)` **directly on a Supabase storage key** with no prior download — `marketingMedia.mjs` L637-647, L672-687; `applyLUTs` runs `ffmpeg -i "${inputPath}"` (L259-276) → ffmpeg can't open a remote key → export fails at runtime. (Contrast: the drone pipeline downloads first.)
  - `POST /api/marketing/media/upload-video` creates the asset with `storage_path: null`, runs the pipeline on a temp file, then deletes it — `marketingRoutes.mjs` L862-944 + `videoIntelligence.mjs` L561-617 → later export can't find a `storage_path`.
  - `consent_for_marketing` enforced **only** on `/assemble` (L1454-1462), not on `/generate`, `/generate/stream`, `/preload`, `/export` (defense-in-depth gap; the final publish gate exists).
- **Smallest-safe fix (do NOT apply):** download-before-ffmpeg in reexport/assemble; persist streamed uploads to storage + write `storage_path`; add consent checks at all processing entry points.
- **Required test:** `W23-DRIFT-001` (export produces a stored output; consent enforced pre-processing). **Note:** part of the **parked Marketing Run A surface** — map W23 before fixing.

### W24-DRIFT-001 — Marketing Intelligence stale model + silent failure + Meta token-in-URL → **CONFIRMED · Medium**
- **Consequence tier:** functional + security-hygiene (admin-gated). *Verifier said High/Critical — downgraded: admin-gated, server↔Meta, own token, logs-only blast radius.*
- **Evidence (verified from code):** `server/lib/marketingIntelligenceRoutes.mjs`
  - `model: "claude-haiku-20240307"` (L577) — **malformed/retired id** (legacy was `claude-3-haiku-20240307`; current Haiku is `claude-haiku-4-5`) → the AI summary call always errors → swallowed by `} catch { /* non-fatal */ }` (L583) → dashboard `ai_summary: null` **silently** (contrast meta-sync which logs, L688).
  - Meta token in URL query string: `…/insights?metric=…&access_token=${accessToken}` (L632) — leaks to proxy/CDN/access logs. Route **is** `requireAuth, requireRole("admin")` (L603) → server-to-server, admin-gated.
- **Smallest-safe fix (do NOT apply):** use a current model id / `CLAUDE_MODEL` env; log the caught error; move the Meta token to the `Authorization: Bearer` header.
- **Required test:** `W24-DRIFT-001` (valid model id; error surfaced to logs; Meta call uses header not query). Map W24 before fixing.

---

## 2. Marketing / Intelligence admin-gating — confirmed intact (by code-read)

Per brief, `/api/marketing/*` and `/api/intelligence/*` must **not** be re-guarded. Confirmed the admin
prefix-gate loop still covers both: `server/dev-api.mjs:879-901` → `for (const prefix of ["/api/finance",
"/api/sales", "/api/marketing", "/api/intelligence", "/api/cost-intelligence", …]) app.use(prefix,
requireAuth, requireRole("admin"))`. QA-001 = CLOSED 2026-06-22 (`test:qa-sec-baseline` 23/23).
**`test:qa-sec-baseline` was NOT re-run here** — it boots the full `npm run dev` API (webServer), which in
audit mode risks real integration side-effects (IMAP poll/cron). **Recommend Sam/CI re-run it** to refresh
the badge; the code-read confirms the gate is present.

The W22 CRM finding is **outside** this gate by design (`/api/crm` is intentionally not in the prefix loop
because of the public `/unsubscribe` route) — which is exactly why the missing **inline** role check matters.

---

## 3. Ready-to-paste BUG_REGISTER entries

(Recorded additively in BUG_REGISTER under "Open — Batch E adversarial-audit verifications". Full text there.)

---

## Output (per `/harden` style)

**Source-of-truth check:**
- Expected (brief): P0 dirty-tree commit; map W06/W07; verify 4 marketing-adjacent candidates.
- Confirmed: P0 already committed (tree clean, HEAD f656d63); W06/W07 already mapped + Batch B P0 done + SAM-W06-001 decided; 4 candidates verified against current code.
- Mismatch: brief streams P0 + RFQ-B mapping are **stale/complete** — not re-executed.

**Next safe action:** Sam to (a) confirm redirection given staleness, and (b) decide whether to open a
Sam-approved fix batch for **W22-SEC-001** (CRM consent/role-bypass — the elevated High/Critical-candidate).
W23/W24 fixes require Batch E mapping first (parked Marketing surface).

**Blocked by:** Sam decision on W22-SEC-001 fix batch; Batch E (W22–W24) not yet mapped.

**Code changed:** no.  **Tests changed:** no.  **Docs changed:** yes (this file; BUG_REGISTER; tracker).
