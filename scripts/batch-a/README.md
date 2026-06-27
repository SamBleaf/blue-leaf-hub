# Batch A test skeletons (W01–W05)

Days 6–8 hardening — **skeletons only** until P0 fixes land.

## Run

```bash
npm run dev   # port 8787 required
node scripts/create-test-user.mjs   # once

npm run test:batch-a              # read-only + gap-documented baselines
npm run test:batch-a:write        # + create/delete fixtures

npm run test:e2e -- e2e/tests/workflows/batch-a
```

## P0 fix order (after skeletons)

1. P0-A5 — TenderBoard rfqs-only limitation
2. P0-A6 — job-delete + rfq_packages rule
3. P0-A3 — Address pending RFQ guard
4. P0-A4 — RFQ extraction lead linkage
5. P0-A1 — displayLeadName
6. P0-A2 — unified lead_activities

See [docs/qa/BATCH_A_REVIEW_PACK.md](../../docs/qa/BATCH_A_REVIEW_PACK.md).
