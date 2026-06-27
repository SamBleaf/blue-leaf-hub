# Test Artifact Cleanup Policy

**Status:** In force for 30-day hardening sprint (Batch C onward)  
**Last updated:** 2026-06-25 (prefix policy clarified)

---

## Approved vs legacy (read first)

| Rule | Detail |
|------|--------|
| **Current — all new write tests** | Use **`BLH TEST`** via `buildTestJobAddress()` in `scripts/lib/testArtifactPrefixes.mjs` |
| **Do not use for new tests** | `__BATCH_A__`, `BATCHA`, `BATCH A`, `__E2E__`, `DEBUG`, `DEBUG2`, `__DRYRUN`, `__DEMO`, or other underscore-based Dropbox markers |
| **Legacy names** | Detection / dry-run / review only — classified as **legacy review-only** cleanup candidates |
| **Legacy deletion** | Requires `--confirm --include-legacy-test-names --confirm-legacy "DELETE LEGACY TEST FOLDERS"` |
| **Underscore folders** | Do **not** create new underscore-based test job addresses — Dropbox sanitization strips `_` and breaks safe matching |

---

## Problem

Hardening and E2E tests create **real external artifacts** when Dropbox (and mail) are configured in dev:

- `POST /api/jobs` provisions a full job folder tree under `/BLUE LEAF BUILDING/PROJECTS/BLUE LEAF BUILDING/{address}/`
- Win-finalize may copy quote PDFs into `INTERNAL/QUOTES/`
- `POST /api/po/issue` may upload PO PDFs to `INTERNAL/P.O/`
- RFQ send / IMAP match paths may add correspondence-related files

Supabase test rows are cleaned by per-test `finally` blocks and `scripts/cleanup-test-data.mjs`, but **Dropbox folders persist** and accumulate alongside real client project folders.

---

## Current artifact sources (audit 2026-06-25)

| Source | Creates Dropbox? | Marker today | Status | Cleanup today |
|--------|------------------|--------------|--------|---------------|
| `scripts/batch-a/*` (`--write`) — W11, W12 | **Yes** — via `POST /api/jobs` | **`BLH TEST`** (`buildTestJobAddress()`) | **Approved** | Safe canonical tier |
| `scripts/batch-a/*` (`--write`) — older suites | **Yes** | **`__BATCH_A__`** → Dropbox `BATCHA …` | **Legacy — do not copy** | Legacy review-only tier |
| `e2e/` Playwright + `seed-e2e-suite.mjs` | **If** job created via API | `__E2E_`, `__P0A5_`, etc. | **Legacy — migrate to BLH TEST** | Legacy / Supabase only |
| `scripts/real_data_dryrun.mjs` | Possible | `__DRYRUN_{ts}` | **Legacy — do not use** | Legacy review-only |
| `scripts/test_client_setup.mjs` | Possible | `__DEMO …` | **Legacy — do not use** | Supabase manual only |
| `scripts/adversarial_e2e.mjs` | Possible | `__E2E_{ts}` | **Legacy — do not use** | Legacy review-only |
| Manual dev / QA sessions | Possible | Mixed | Unreliable | Manual review |

**Production Dropbox code paths are unchanged by this policy** — tests hit the same provisioning as real jobs when env is live.

---

## Naming convention

### Required (new tests from 2026-06-25)

All **new** hardening write tests and external artifacts **must** use the canonical marker:

```
BLH TEST
```

Use helper `buildTestJobAddress()` in `scripts/lib/testArtifactPrefixes.mjs` — do **not** hand-roll `__BATCH_A__`, `BATCHA`, `__E2E__`, `DEBUG`, or other legacy prefixes.

Example job address (flat string, as stored on `jobs.address`):

```
BLH TEST W11 PO 1782384723491 D8UA02, Adelaide SA 5000
```

Dropbox shared folder name (derived via `sanitizeJobFolderDisplayName`):

```
/BLUE LEAF BUILDING/PROJECTS/BLUE LEAF BUILDING/BLH TEST W11 PO 1782384723491 D8UA02, ADELAIDE SA 5000
```

**Important:** `sanitizeJobFolderDisplayName` strips `_` (underscore). Legacy underscore markers (`__BATCH_A__`, `__E2E_`, etc.) **must not be used for new tests** — they become unreliable Dropbox names like `BATCHA …`. The **`BLH TEST`** space-separated marker survives sanitization and matches the **safe canonical** cleanup tier.

### Legacy prefixes (legacy review-only — not approved for new tests)

Historical Dropbox folders from earlier hardening runs. **Do not create new test jobs with these markers.** They appear in dry-run as **legacy review-only** and require explicit legacy delete flags:

| Pattern | Historical source |
|---------|-------------------|
| `BATCHA` / `BATCH A` (sanitized from `__BATCH_A__`) | Pre-2026-06-25 batch-a `MARK` |
| `__BATCH_A__` / `__BATCH A` | Old `_helpers.mjs` marker (code migration pending) |
| `E2E` / `__E2E` (sanitized from `__E2E_`) | E2E seed + specs |
| `DEBUG` / `DEBUG2` | Ad-hoc debug job creation |
| `^\d{13} TEST STREET` (and similar) | Timestamp-prefixed test addresses |
| `__P0A5_` | Tender board E2E fixtures |
| `__DRYRUN_` | `real_data_dryrun.mjs` |
| `__DEMO` | Portal demo setup |
| `__RFQ TEST` | RFQ integration tests |

**When Dropbox is configured:** new write tests **must** use **`BLH TEST`** only.

---

## Cleanup tools

### 1. Dropbox — `scripts/cleanup-test-artifacts.mjs`

Two candidate categories:

| Category | Examples | Deletable with |
|----------|----------|----------------|
| **Safe canonical** | `BLH TEST …`, `__BLH TEST …`, `__BLH_TEST …`, `__HARDENING TEST …` | `--confirm` |
| **Legacy review-only** | `BATCHA …`, `BATCH A …`, `E2E …`, `DEBUG2 …`, `1782384426261 TEST STREET …` | `--confirm --include-legacy-test-names --confirm-legacy "DELETE LEGACY TEST FOLDERS"` |

```bash
# Dry-run (default) — lists safe + legacy + skipped; deletes nothing
npm run test:cleanup-artifacts

# Delete safe canonical candidates only
npm run test:cleanup-artifacts -- --confirm

# Delete safe + legacy (explicit phrase required)
npm run test:cleanup-artifacts -- --confirm --include-legacy-test-names --confirm-legacy "DELETE LEGACY TEST FOLDERS"

# Optional age filter (applies after classification match)
npm run test:cleanup-artifacts -- --confirm --older-than-days 1

# Matcher unit smoke (no Dropbox)
npm run test:cleanup-matchers

# Append run summary to log
npm run test:cleanup-artifacts -- --report
```

**Hard safety rules (enforced in code):**

- Default **dry-run** — no deletes without `--confirm`
- **Legacy folders never deleted** by `--confirm` alone — require `--include-legacy-test-names` **and** `--confirm-legacy "DELETE LEGACY TEST FOLDERS"`
- Only deletes **immediate child folders** under:
  - `/BLUE LEAF BUILDING/PROJECTS/BLUE LEAF BUILDING`
  - `/BLUE LEAF BUILDING/INTERNAL`
- Classification via `classifyTestArtifactName()` in `scripts/lib/testArtifactPrefixes.mjs`
- **Never** deletes by date, Adelaide, timestamp, or project name alone
- **Never** deletes real client folders (no marker match → skipped)
- **Not run automatically in CI** unless separately approved

Log file: `docs/qa/test-artifact-cleanup-log.md` (append on `--report` or after `--confirm`).

### 2. Supabase — `scripts/cleanup-test-data.mjs` (existing)

```bash
node scripts/cleanup-test-data.mjs --audit      # read-only counts
node scripts/cleanup-test-data.mjs --dry-run    # show DB rows to delete
node scripts/cleanup-test-data.mjs              # interactive DB cleanup
```

Address patterns: `__E2E_%`, `__DEMO%`, `__DRYRUN_%` — legacy DB rows only. **New write tests must use `BLH TEST`**, not these patterns. `__BATCH_A__` / `BLH TEST` not yet in `cleanup-test-data.mjs` (gap).

E2E teardown: `E2E_CLEANUP=true` + Playwright global teardown → `cleanupE2ESuite()` (fixed UUIDs only).

---

## Manual cleanup still required

| Artifact | Why manual |
|----------|------------|
| Dropbox files **inside** a mis-named real project folder | Cleanup refuses non-prefixed paths |
| Gmail / SMTP sent mail | Outbound guardrail — tests should use test inboxes |
| Buildxact remote objects | No test prefix convention yet |
| Supabase legacy `__BATCH_A__` / `__E2E_*` rows | Extend `cleanup-test-data.mjs` or rely on per-test finally |
| Shared links / permissions | Delete folder removes content; link cleanup is best-effort |

---

## Known limitations

1. **Legacy batch-a `MARK` in code** — `scripts/batch-a/_helpers.mjs` still exports `MARK = "__BATCH_A__"` for older suites; **new and touched write tests must use `buildTestJobAddress()` (`BLH TEST`)** — W11/W12 already migrated. Full MARK removal is a separate approved pass.
2. **Dropbox folder = job address** — test folders live under the **same team tree** as production jobs; **`BLH TEST` prefix discipline** is the guardrail for new tests.
3. **Private INTERNAL path shape differs** — hyphenated segment from `sanitizeJobAddressPathSegment`; cleanup scans both shared + private bases.
4. **Age filter is optional** — `--older-than-days` applies **after** prefix match only.
5. **Historical underscore artifacts:** Pre-2026-06-25 runs used `__BATCH_A__` / `__E2E_` — Dropbox names became `BATCHA …`, etc. Legacy matchers surface these as **legacy review-only**; deletion requires explicit legacy flags. **Do not create new underscore-based test folders.**
6. **PO PDF / win-finalize copies** — deleted when parent job folder is deleted; individual files are not scanned at namespace root.

---

## Migration plan (not implemented yet)

1. **Phase 1:** Policy + dry-run cleanup utility + legacy matchers — **done**
2. **Phase 2:** Migrate remaining `scripts/batch-a/*` from `MARK` (`__BATCH_A__`) to `buildTestJobAddress()` (`BLH TEST`) — separate approved pass; W11/W12 done
3. **Phase 3:** Add `BLH TEST` / legacy patterns to `cleanup-test-data.mjs`
4. **Phase 4:** Optional post-suite hook — **manual only until proven safe**

---

## Safe to continue Batch C testing?

**Yes**, with discipline:

1. All **new** hardening write tests must use **`BLH TEST`** marker via `buildTestJobAddress()`.
2. After write suites, run `npm run test:cleanup-artifacts` (dry-run) and review safe + legacy lists.
3. Safe canonical only: `npm run test:cleanup-artifacts -- --confirm` when approved.
4. Legacy folders: `--confirm --include-legacy-test-names --confirm-legacy "DELETE LEGACY TEST FOLDERS"`.

---

## Related docs

- [30_DAY_HARDENING_TRACKER.md](./30_DAY_HARDENING_TRACKER.md)
- [E2E_TESTING_MASTER_PLAN.md](./E2E_TESTING_MASTER_PLAN.md) — `E2E_CLEANUP`
- [WORKFLOW_TEST_PLAN.md](../agent_knowledge/WORKFLOW_TEST_PLAN.md) — outbound guardrail (live Gmail/Dropbox in dev)
