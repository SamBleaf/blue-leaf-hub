# EXTERNAL-SANDBOX-LIVE-FIRE-01 + Staging Runbook

**Date:** 2026-06-27 · **Owner:** Claude (local tier) + Sam (cloud tier) · **Branch:** `portal-v2`
**Goal (P1):** prove the external integration seams fire safely — not just "API returns 200".

---

## Verdict: **PARTIAL PASS (local tier)** — mail seam proven; Buildxact/Dropbox graceful; full cloud live-fire pending test creds

I stood up a **local sandbox** (no cloud creds needed): the app forced onto **SMTP → a nodemailer Ethereal sink** (captures mail, never delivers to anyone) with **empty Buildxact/Dropbox** creds so those calls no-op. This proves the most-used seam end-to-end and that the journey degrades gracefully without the others. The remaining seams (real Dropbox folder creation, real Buildxact sync, IMAP quote reply) need a **non-prod cloud sandbox** — runbook below.

### Seam results (local tier)
| Seam | Method | Result |
|------|--------|--------|
| **Mail send** | App's own `sendPlainMail()` → SMTP → Ethereal sink | ✅ **`{transport:"smtp"}` success** — real email accepted by the sink, zero real recipients. The app's transport selection (Resend→Gmail→SMTP) works. |
| **Buildxact** | `buildexactConfigured()` with empty creds | ✅ **false → no-op** — win/sync paths skip BX cleanly (no crash). |
| **Dropbox** | `dropboxConfigured()` with empty creds | ✅ **false → no-op** — folder/file writes guarded (this is also why the win-finalize prod-Dropbox 502 disappears under sandbox). |
| **DOCX/PTSA generation** | docxtemplater (local, no external) | ✅ verified earlier in E2E (Generate-PTSA-Document present; renders DOCX). |

### Gap-documented — needs the cloud sandbox (Sam test creds)
| Seam | Why it needs cloud | Success criteria |
|------|--------------------|------------------|
| RFQ **send** through the real endpoint (`/api/rfq-packages/:pkg/scopes/:trade/send`) with recipients | needs full package/scope/recipient fixtures + transport | email **arrives** in the sink with correct RFQ content + correspondence row + message-id |
| **IMAP** quote reply match | needs a test IMAP mailbox | reply lands → matcher links it to the RFQ |
| **Dropbox** folder/file create | needs a test Dropbox app + scratch folder | job folder + TENDER DOCS/QUOTES files actually created |
| **Buildxact** job/estimate sync + PO | needs a BX test tenant | sync succeeds **or fails safely**; PO issue emails + writes |
| **convert→job** Dropbox provisioning | needs test Dropbox | folder created on convert |

---

## Staging runbook (cloud tier — turnkey for Sam)

### Tier-1 — local sandbox (DONE, repeatable)
A `.env.sandbox` with these overrides reproduces the local tier:
```
# Mail → Ethereal/Mailtrap sink (never delivers to real people)
RESEND_API_KEY=            # blank → skip Resend
GMAIL_REFRESH_TOKEN=       # blank → skip Gmail
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<ethereal user>  # from nodemailer.createTestAccount()
SMTP_PASS=<ethereal pass>
SMTP_FROM=BLH SANDBOX TEST <sandbox@blueleaf.test>
# External → blank = graceful no-op
BUILDEXACT_API_KEY=
DROPBOX_REFRESH_TOKEN=
# Supabase → keep current (test-tagged rows, cleaned) OR point at a dedicated test project (Tier-2)
```
Run: `node --env-file=.env.sandbox server/dev-api.mjs` (or set the env and start).

### Tier-2 — cloud staging (Sam provisions; then Claude runs the full live-fire)
1. **Dedicated test Supabase project** — apply `supabase/migrations/*` in order (clean schema, no prod data). Set `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`VITE_SUPABASE_*` to it.
2. **Railway staging service** — deploy the API from `portal-v2` with the sandbox env: Mailtrap/Ethereal SMTP, a **Buildxact test tenant**, a **Dropbox test app + scratch team folder**, the test Supabase.
3. **Vercel preview** — build the SPA from `portal-v2`, point its `/api/*` rewrite at the Railway **staging** API (not prod).
4. **Full live-fire** (Claude): one Norwood test job through lead → RFQ **send** → IMAP reply → accept → **win-finalize** (BX+Dropbox) → **PO issue** → PTSA DOCX → convert. Assert every seam actually fires (email arrives, folder created, BX sync result, no real client/supplier touched).
5. **Smoke + cleanup** — `BLH SANDBOX TEST` prefix; delete run-tagged rows; `test:cleanup-artifacts` dry-run.

### Pre-prod gate
Promote `portal-v2 → main` (prod) only after Tier-2 full live-fire is green **and** the supervised pilot (P4) passes.

---
**Next safe action:** Sam provisions Tier-2 creds (test Supabase + Railway staging + sandbox mail/BX/Dropbox) → Claude runs the full cloud live-fire and flips the conditional gates to PASS.
**Code changed:** no. **Docs changed:** yes (this report). **Test data:** none persisted (local sandbox, mail to sink).
