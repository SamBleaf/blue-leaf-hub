# SOP Docs Wave 02 — Result (02A)

**Run ID:** `BLH-SOP-DOCS-W02A-2026-06-29` · **Agent:** Cursor (execution) · **Wave:** `SOP-DOCS-WAVE-02`
**Mode:** no-code docs · **No product code changed.** Governed by
[SOP_TO_MODULE_AUDIT_PLAN.md](./SOP_TO_MODULE_AUDIT_PLAN.md) + Sam decisions `SAM-SOP-001/002`.

## Outcome: split for size (sanctioned)
The approved scope (02_sales rewrite · 04_rfq nav · §14 backfill 07/10 · 11_portal v2 rewrite ·
08-07) is **too large to complete safely at quality in one pass** — and investigation showed it is
**larger than the Wave 01 summary implied** (see "Sharper diagnosis" below). Per the packet's
sanctioned split condition, **Wave 02A** delivered one complete, evidence-based artifact; the rest
is precisely re-scoped as **Wave 02B**.

## Wave 02A — delivered (this run)
| Item | Status |
|---|---|
| **SOP 08-07 — WHS Setup** (`docs/sops/08_whs/08-07_whs_setup.md`) | ✅ **created** — full 14-section template + §14 (TC-01..TC-06), grounded in `src/pages/WhsEngine.jsx` + `/api/whs/projects/:id/{profile,generate,documents}`; tables `whs_site_profiles`, `whs_documents`. Closes `SOP-GAP-WHS-SETUP` (`SAM-SOP-002`). |
| `SOP_INDEX.md` | ✅ 08-07 row added (WHS, Admin/Supervisor, untested, High) |
| `SOP_CHANGELOG.md` | ✅ Wave 02A row added |
| `BUG_REGISTER.md` | ✅ WHS gap closed; §14-07 diagnosis sharpened; 02B scoped |

## Sharper diagnosis (corrects the Wave 01 summary)
- **`SOP-DRIFT-SEC14-07` is not "missing §14".** The 3 site-diary SOPs already contain a
  Troubleshoot Agent Test Script — but **numbered §12** under an abbreviated 11-section template
  (no §12 Edge-cases / §13 Owner; test script at §12 not §14). Real fix = **renumber to §14 +
  add the two missing sections**. (Consistent with the 2026-05-30 changelog: "all SOPs have test
  scripts.")
- **`diary_view_entries.md` (07-03) has content drift:** it documents an **Edit entry** flow and a
  **date-range filter** that the app does **not** implement (read-only `DiaryRow`, no PATCH route) —
  this is the deferred **SOP-BUG-07-03**. The SOP must be corrected to current view-only reality and
  flag the gap (no app fix — bug stays deferred).
- Implication: the "§14 backfill" for 07 (and likely 10) is a **renumber + template-compliance +
  content-accuracy** task, not a simple append — heavier than the Wave 01 line item suggested.

## Wave 02B — split out (next, no-code) — packet in `hardening_loop/NEXT_CURSOR_TASK.md`
| Priority | Item | Closes |
|---|---|---|
| 1 | **11_client_portal** v2-canonical rewrite + v1/v2 matrix + §14 (v2 = canonical per `SAM-SOP-001`; v1 = legacy/fallback, labelled) | **High `SOP-DRIFT-SEC14-11`** (deploy-blocking) |
| 2 | **07_site_diary** §12→§14 renumber + §12/§13 sections; **07-03** content fix (view-only; flag SOP-BUG-07-03) | `SOP-DRIFT-SEC14-07` |
| 3 | **02_sales** 02-02..02-07 rewrite to Pass 3A Lead command-centre + mobile tabs + BlueprintAgent FAB | `SOP-DRIFT-02-SALES` (P0) |
| 4 | **04_rfq_engine** 04-02..04-09 nav: post-send work = Quote Tracker `/tender-manager/rfq-packages/:id` | `SOP-DRIFT-SEC14-04` / RFQ nav |
| 5 | **10_workforce** verify §14 section-number/compliance + backfill where genuinely missing | 10 §14 |

## Verification
- `git show --name-only` (this run) → docs/sops + docs/qa only; **no `src/**`/`server/**`/migrations**.
- 08-07 grounded in read-only code review of `WhsEngine.jsx` + route/table evidence.
- Deferred app bugs untouched (not fixed, not accepted).

## Next agent
**Cursor** — execute Wave 02B from `NEXT_CURSOR_TASK.md` (no-code; same Sam-approved wave family).
Claude reviews when 02B completes the wave.
