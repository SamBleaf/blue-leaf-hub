# Marketing Hardening Prep Batch 1 — Result

**Doc ID:** MARKETING-HARDENING-PREP-BATCH-1-RESULT
**Date:** 2026-06-28
**Branch:** `marketing-run-a` (isolated worktree `blh-marketing.nosync`)
**Scope:** Pre-deploy risk reduction without merge/boot/live-integration. Server guards + one safety flag + orphan removal + docs.

| Field | Value |
|---|---|
| Batch completed | **Yes** |
| Explicit admin guards added | **Yes** |
| Finance IMAP poller action | **Patched** (env flag, default ON) |
| Legacy `Marketing.jsx` audit | **Documented** (no in-file masking; deep legacy children deferred) |
| Orphan cleanup | **`ContentCreatorShell.jsx` removed** |
| Routes changed | **No** (same paths; middleware only) |
| Migrations changed | **No** |
| Runtime checks run | **No** (deferred) |
| Merged to main | **No** |

---

## Files changed

**Server (6):**
- `server/lib/marketingRoutes.mjs` — explicit `requireRole("admin")` on all endpoints (34 added; 4 music routes already had it → 38 total)
- `server/lib/marketingPackageRoutes.mjs` — `requireRole` import + guard on all 4 endpoints
- `server/lib/marketingScheduleRoutes.mjs` — `requireRole` import + guard on all 4 endpoints
- `server/lib/marketingLibraryRoutes.mjs` — `requireRole` import + guard on both endpoints
- `server/lib/marketingCampaignRoutes.mjs` — `requireRole` import + guard on all 3 endpoints
- `server/lib/financeRoutes.mjs` — invoice poller honours `INVOICE_IMAP_POLL_ENABLED` (default ON) + clearer log label

**Removed (1):**
- `src/components/marketing/ContentCreatorShell.jsx` — orphan Run A placeholder (zero references; superseded by `ContentCreator`)

**Docs (3):**
- `docs/planning/MARKETING_COMPLETION_CHECKLIST.md` — §3 marks guards/poller/orphan done; smoke-boot env line updated
- `docs/planning/MARKETING_DEEP_CHANGE_AUDIT.md` — §8 + §10 updated (P1 guards + poller done; P2 orphan done)
- `docs/sops/SOP_CHANGELOG.md` — security-posture entry (no step changes)

**APIs changed:** none (paths/contracts identical — middleware hardening only).

---

## 1. Explicit admin guards (defense-in-depth)

Every endpoint in the **5 mutation-bearing marketing route modules** now carries inline `requireAuth, requireRole("admin")`. Previously they relied solely on the blanket `/api/marketing` prefix gate (dev-api `:906`) for the admin check; reads/writes had inline `requireAuth` only. Now each route self-enforces admin, so an accidental edit to the prefix list at merge cannot silently drop sensitive writes to any-authenticated staff.

**Guarded write endpoint groups (all now explicit):**

| Group | Module | Writes guarded |
|---|---|---|
| Package create + approve/request/reject | marketingPackageRoutes | `POST /packages`, `PATCH /packages/:id/approve` |
| Schedule + publish-log | marketingScheduleRoutes | `POST /schedule`, `POST /publish-log` |
| Evergreen marking | marketingLibraryRoutes | `POST /content/:id/evergreen` |
| Campaign from template | marketingCampaignRoutes | `POST /campaigns/from-template` |
| Content create/update/delete | marketingRoutes | `POST/PUT/DELETE /content*` |
| Campaigns + slots (create/update/publish/auto-assign/preload) | marketingRoutes | `POST/PUT /campaigns*`, `/slots*` |
| Generate (+ stream/all-save/assemble) | marketingRoutes | `POST /generate*`, `/assemble` |
| Media upload/analyse/consent/export + analysis patch | marketingRoutes | `POST /media/*`, `PATCH /media/:id/analysis` |
| Music writes | marketingRoutes | already explicit (unchanged) |

Reads in these modules also self-assert admin now (no behaviour change — they were already admin-only via the blanket gate). Pure-read modules (`marketingBatch3Routes` = intelligence/attribution, `marketingCommandRoutes` = command-centre) were **not** touched; they remain covered by the blanket gate. **Public `/api/public/attribution` + `/api/public/enquiry` were not touched.** No gate was weakened.

---

## 2. Finance IMAP poller safety

`financeRoutes.mjs` invoice poller previously started whenever `invoiceImapConfigs().length` was truthy — it **ignored** the quote-poller's `IMAP_POLL_ENABLED` flag, so a full boot on a live `.env` connected to the live invoice inbox ~10s in (root cause noted in the schema-verification result).

**Patched (small, default-preserving):**
```js
const invoicePollEnabled = String(process.env.INVOICE_IMAP_POLL_ENABLED ?? "true").toLowerCase() !== "false";
if (invoiceImapConfigs().length && invoicePollEnabled) { … }
```
- **Default ON** — production behaviour unchanged.
- **To disable for a smoke boot:** `INVOICE_IMAP_POLL_ENABLED=false` (no credential changes).
- Log label corrected (`INVOICE_IMAP_POLL_ENABLED` — was a confusing duplicate of the quote poller's message).
- Poller not removed, not run, credentials untouched.

**Full safe-boot incantation on a shared `.env`:** `PORTAL_SYNC_ENABLED=false IMAP_POLL_ENABLED=false INVOICE_IMAP_POLL_ENABLED=false`.

---

## 3. Legacy `Marketing.jsx` demo-masking audit

`src/pages/Marketing.jsx` is a thin tab container (Library/Campaigns/Media/Lists/Intelligence/Music). **It contains no demo/live masking logic itself** and already admin-gates the Intelligence + Music tabs (filter + redirect). No safe in-file fix needed.

Any masking would live in the large legacy child components (`ContentLibrary` ~660, `CampaignManager` ~1400, `MediaUpload` ~1035, `MarketingIntelligence` ~645 lines). Auditing/refactoring those is **broad and risky** — **documented as a P2 cleanup item**, not fixed here (per the batch's "document if risky" rule). Legacy tabs left in place.

---

## 4. Orphan cleanup

`ContentCreatorShell.jsx` — confirmed **zero references** (only its own definition); superseded by `ContentCreator` (Run B). **Removed.** Old-name SOP files (18-02..18-07 pre-rebuild) left in place — deferred to the SOP audit (removal not yet clearly safe without index cross-check).

---

## Static checks

| Check | Result |
|---|---|
| `node --check` (6 edited server modules) | **Pass** (all 6) |
| `npm run lint` | **Pass** (0 warnings, `--max-warnings 0`) |
| `npm run build` | **Pass** (pre-existing main-bundle size warning only) |

`requireRole` is now imported and used in all 5 marketing modules (no unused-import lint error).

---

## Runtime checks — deferred (reason)

Not run. The batch forbids booting / runtime smoke, and a live `.env` boot would start background jobs. Auth-guard behaviour (403 for non-admin on writes) is a **must-verify at the runtime smoke** — the guards are correct by construction (same `requireRole` used across the app) but unproven at runtime here.

---

## Blockers

None. The guards + poller flag are static-safe. The non-admin 403 path and write flows remain to be confirmed at the staging runtime smoke.

---

## Remaining P0 / P1 / P2

**P0 (before merge)** — unchanged: rebase onto settled main; resolve `App.jsx` + `AppShell.jsx`; re-confirm migration 122 number; lint/build green on merged tree.

**P1 (before deploy)** — runtime smoke (auth 401/403, 10 routes real data, write flows, legacy Studio no-regression); **RLS spot-check on new 122 tables** (service client bypasses RLS). *(Finance poller + explicit admin guards now done.)*

**P2 (after deploy)** — audit/retire legacy tab children (`ContentLibrary`/`CampaignManager`/`MediaUpload`/`MarketingIntelligence`) for demo masking; retire legacy nav tabs; remove old-name SOP files; gate/remove demo constants; address bundle-size warning. *(Orphan `ContentCreatorShell` now done.)*

---

## Recommended next action

Hold for the main-tree redesign to settle, then begin **P0 merge prep**. No further pre-merge hardening is required on `marketing-run-a` — the two substantive items the audit flagged (role guards, finance poller) are now done. Remaining risk is runtime-only and belongs to the staging smoke.

---

Next safe action: Sam reviews `MARKETING_HARDENING_PREP_BATCH_1_RESULT.md`, then waits for main-tree redesign to settle before merge prep.

Code changed: yes
Tests changed: no
Docs changed: yes
