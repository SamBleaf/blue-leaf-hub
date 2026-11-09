# R05 Build Log — Sales integrity and Master Register completion

Implements Tab 27's "R04 — Approved Business Direction" and the Sales blueprint. Branch `sales-register-r05`, cut from `origin/main` @ `759b8e7`. Nothing here is deployed.

Evidence levels: SOURCE (code read), AUTOMATED (named test ran), BROWSER (driven in a browser against the sandbox), DB (confirmed in the sandbox database), PRODUCTION (not available in this workflow).

---

## P1 — Sales integrity (2026-11-09)

**Outcome.** A lead can no longer reach a stage by asserting its own facts, jumping past a gate, or claiming a signed contract without the file. Moves are safe when two people act at once, and a failed Won hand-off can be finished afterwards.

**Commits.** `29bf551` (code and tests); the docs commit carrying this entry.

### What changed

| Area | Behaviour now |
|---|---|
| Hard gates (D2) | Read stored state only. Advisory warnings still use the merged view. |
| Forward jumps (D3) | Every hard gate crossed is checked. A jump is refused at the first unmet one, naming it. |
| Back from Nurture or Lost | Treated as starting at the beginning of the pipeline. Before, `isForwardMove` was false for these, so Nurture → Won had no gate at all. |
| Won gate (D5) | Two rows: "Building contract signed" and "Signed contract PDF on file", so each explains itself. |
| Contract writer (D5) | `POST /api/sales/leads/:id/contract/mark-signed`. File, then evidence row, then status; earlier steps undone on failure. Never overwrites earlier evidence. Attaches a PDF to a lead already signed and keeps its date. |
| Evidence flag (D5) | `withContractEvidence` attaches `contract_evidence_present` in GET and PATCH and before gates. A failed read counts as no evidence. |
| Tender UI (D5) | The Signed pill is replaced by a PDF upload. Shows the file once on file. Amber prompt for a lead signed with no file. |
| Blanket PATCH | Refuses `contract_status: signed`, `contract_signed_date` and a deny-list of server-owned fields. Unknown stages refused. `discovery_meeting_booked_at` stays writable. |
| Create | `POST /api/sales/leads` can't start a lead signed, accepted or (unless a test lead) won. |
| Un-sign | Director-only, logged, clears the signed date, keeps the PDF. Can't be combined with a stage move. |
| Concurrency | `UPDATE ... WHERE id AND stage = current`. A lost race returns 409 `STAGE_CONFLICT` and writes nothing. |
| Activity log | `stage_change` is written after the update lands. A failed insert can't fail a completed move. |
| Won recovery | The hand-off runs on every entry to Won and is reported as `wonHandoff`. `finalizeWonJob` no longer reports success when the job update failed. New `POST …/won/retry-handoff` with a small link on the Won panel. `convert-to-job` on a Won lead completes the hand-off. |

### Scope decisions beyond the literal brief

These close a second door to the same state. Each is small and can be reverted on its own.

- `POST /api/tender/win-finalize` sets the linked lead to Won, so it now applies the Won gate to a lead-linked job, before it writes anything. It checks the Won requirements only, not every stage crossed, because a job's lead may never have been walked through Sales.
- The generic Documents upload refuses `construction_contract`, and that option is gone from its dropdown. Otherwise a non-PDF could become evidence. Historical rows of that type still count.
- Removing a signed contract PDF is logged.
- The pipeline card's **Move ▾** now shows why a move was refused. It used to fail silently.

### Roles (D7): what the code shows

- `requireAuth` rejects inactive accounts and clients.
- The SPA opens every `/sales` route to `admin` only (`RoleRoute`, `can.accessSales`). `roles.js` says Supervisors have no Sales access.
- The server already gates `/api/sales` and `/api/tender` to `admin` at the prefix (`server/dev-api.mjs`, block "A4"). This runs before any route.
- So only a Director can reach any of these writes today, which is narrower than D7's admin + supervisor. The prefix gate was not changed. Widening it would add access nobody asked for.
- The route-level checks D7 lists are in place as the upper limit if Sales is ever opened to Supervisors. They can't be exercised through the API while the prefix gate runs first, so they are verified at SOURCE plus unit tests of the role predicates.
- D5 says un-signing is admin-only and D7 lists it under admin + supervisor. Admin-only satisfies both.
- SOPs 02-16, 02-20, 02-22 and 02-23 said Supervisors run these stages. Each now carries a note of the real access.

### Schema and API impact

No migration. Evidence uses `lead_documents` as allowed since mig 194.

New: `POST /api/sales/leads/:id/contract/mark-signed`, `POST /api/sales/leads/:id/won/retry-handoff`, `server/lib/leadContractEvidence.mjs`.

Changed responses: lead GET and PATCH carry `contract_evidence_present`. PATCH also carries `wonHandoff` on entry to Won, and now returns 404 for a missing lead, 400 for a server-owned field or unknown stage, and 409 `STAGE_CONFLICT`. `win-finalize` can return 422 `GATE_BLOCKED`.

`isForwardMove` is removed from `stageGates.js`; `stagesCrossed` replaces it.

### Tests

| Level | What | Result |
|---|---|---|
| AUTOMATED | `node scripts/tests/sandbox-sales-integrity.test.mjs` through the real API and sandbox Postgres | 99 passed, 0 failed |
| AUTOMATED | `node scripts/tests/sales-stage-gates.test.mjs` | 46 passed, 0 failed |
| AUTOMATED | `node scripts/tests/sales-tender-contract-render.test.mjs` (renders the contract panel to a string) | 14 passed, 0 failed |
| AUTOMATED | `bash SP/run-tests.sh all`: 17 suites | 531 checks, 0 failing |
| DB | Sandbox assertions on rows, stored files and one-project-per-job, with injected triggers for the race and failure paths | Within the 99 above |
| SOURCE | Route-level supervisor paths, unreachable behind the prefix gate | Read only |
| BROWSER | Not driven in P1. The upload, un-sign and retry clicks have been API-tested and the panel render-tested, but nobody has clicked them in a browser. Due in P7. | Not verified |
| PRODUCTION | Not available in this workflow | Not verified |

`npm run lint` and `npm run build` pass, and `node --check` passes on the changed server files. These say nothing about behaviour.

Existing tests changed deliberately: `register-e2e` (+1 check) and `register-handover-status` (+1 check) used to set `contract_status` directly and now go through the writer. No assertion was weakened.

### Caveats

- Staff with the Supabase client can still write to `leads` directly from the browser where RLS allows it (`RfqEngine.jsx` writes `job_id` this way). These protections are at the Hub API. Not changed in P1.
- PDF validation checks the header and end-of-file marker. It catches wrong and truncated files, not a forged PDF.
- PTSA mark-signed keeps its existing base64-only check; only its role changed.
- `register-handover-status` and `recordBaseline` still read `contract_status` alone. A Won lead with no PDF is left as it is, per D5.

### Next dependency

P2 makes the advisory wording explicit (D4) and consolidates progression controls. P6 adds `plans_supplied` to `resolveEngagementPathway` and the applicability table in `stageGates.js`, which is seeded with `design_build` and `architect_tender`.
