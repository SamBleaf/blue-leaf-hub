# ADR-001 — Flashing takeoff (measurement, material calculation, order preparation) lives in the Hub

- **Status:** Accepted — 2026-10-13 (owner decision, Sam, in the build session)
- **Supersedes:** `MASTER_PLAN.md` § "Who owns what (locked 2026-06-03)" row *Quantity Intelligence (takeoff) → Bestimator / Buildxact*, **for the scope below only**.
- **Contract:** `docs/takeoff/R03/` (00 → 04)

## Context

The June 2026 allocation put all quantity work in Bestimator/Buildxact. In practice the crews need to
measure flashings off the issued plans on site, on a phone, and send a supplier a clear cut list with
profile drawings. The Hub already owns the issued plan set (`job_documents`, private `job-plans`
bucket, worker-scoped access), the job spines, suppliers and the Worker PWA. Building the flashing
takeoff anywhere else would duplicate plan issue, access control and the field app.

## Decision

The Hub owns, for release one:

1. **Plan measurement** — an in-app PDF viewer, two-axis calibration, measured runs and counted pieces,
   anchored to immutable `job_documents` IDs and content hashes.
2. **Material calculation for flashings** — code-owned methods (`flashing_runs@1`, `finished_piece_count@1`)
   with editable ordering parameters; company standards copied into jobs.
3. **Order preparation** — frozen supplier PDFs and a minimal record of orders placed externally.

Contract-only (tested, not shipped as working UI): `repeated_members@1`, `sheet_wall@1`, `area_to_linear@1`.

## Not authorised by this decision

- Rebuilding Bestimator, its scope/element engines or estimating.
- Structural sizing / span tables (no table cells are copied; Bestimator T48 `9005` stays flagged upstream).
- Pricing, supplier sending, Buildxact PO push or procurement automation.

## Consequences

- Bestimator remains the owner of scope → element → quantity for *estimating*. Hub takeoff is
  *field/ordering* measurement and must not be presented as an estimate.
- New Hub schema (migration 206) and a shared calculation package (`shared/takeoff/`).
- Feature ships dark behind `TAKEOFF_ENABLED`; rollback is disabling the flag (tables and evidence stay).
