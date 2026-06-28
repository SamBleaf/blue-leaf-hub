# UI/UX Discovery — Wave 01A Result

**Status:** TEMPLATE — *Wave 01A fills this.* · Governed by
[../FULL_E2E_HARDENING_STRATEGY.md](../FULL_E2E_HARDENING_STRATEGY.md) +
[../COMPREHENSIVE_HARDENING_MASTER_PLAN.md](../COMPREHENSIVE_HARDENING_MASTER_PLAN.md).

**Wave:** `UI-UX-USABILITY-WAVE-01A` · **Mode:** no-code discovery (audit + safe screenshots) ·
**Reference standard:** Sales · **No fixes in this wave.**

> The UI/UX Usability Agent (Mode 01A) overwrites the placeholders below. Findings go to
> [../BUG_REGISTER.md](../BUG_REGISTER.md) (IDs `UI-<MODULE>-###`, with a `Type:` token + a
> `blocks-deployability` flag). Lock statuses go to
> [UI_MODULE_LOCK_MATRIX.md](./UI_MODULE_LOCK_MATRIX.md); screenshots to
> [UI_SCREEN_EVIDENCE_INDEX.md](./UI_SCREEN_EVIDENCE_INDEX.md).

---

## 1. Summary

- Run ID: `BLH-UIUX-01A-<date>-<n>`
- Modules assessed: `__ / 11` (Marketing excluded — paused until merge)
- Findings logged: `__` (blocking `__` / non-blocking `__`)
- Lock outcomes: LOCKED `__` · CONDITIONAL `__` · NO-GO `__` · NOT ASSESSED `__`

## 2. Method (as run)

- Screenshots via `npm run test:ui-review` + `chromium-mobile` / `chromium-tablet`
  (viewports desktop 1440×900 · tablet 834×1112 · mobile 390×844).
- Each module scored against the **first-viewport rubric** (*Where am I? · What matters now? ·
  What is blocked? · What needs action? · What happens next?*) and the **Sales-standard
  scorecard**.
- No product code touched. No fixes.

## 3. Per-module findings (template — repeat per module, priority order)

### <Module> — <route>
- **Lock status:** UI NOT ASSESSED → `<LOCKED|CONDITIONAL|NO-GO>`
- **First-viewport rubric:** Where am I `✓/✗` · What matters `✓/✗` · Blocked `✓/✗` · Needs action `✓/✗` · Next `✓/✗`
- **Sales-standard gaps:** `<list>`
- **Mobile/tablet:** `<usable? squeezed tables? sticky issues?>`
- **Demo/live masking risk:** `<any demo data hiding a live-empty state?>`
- **Findings:** `UI-<MODULE>-### (Type, severity, blocks?)` …
- **Evidence:** see [UI_SCREEN_EVIDENCE_INDEX.md](./UI_SCREEN_EVIDENCE_INDEX.md) rows for `<Module>`.

> Modules, in order: Sales (reference check only) · Tender/RFQ · Operations · Schedule ·
> Procurement · Finance · Workforce · Field/Worker · WHS · Client Portal · CRM ·
> Marketing (`PAUSED UNTIL MERGE`).

## 4. Proposed module-polish plan (for Sam approval → unlocks Wave 01B)

| Module | Blocking issues (IDs) | Proposed presentational fixes | Est. risk |
|---|---|---|---|
| … | … | … | low |

**Wave 01B does not start until Sam approves this plan.** 01B is presentational-only; any change
needing behaviour/API/auth/calc/schema/integration stops + logs.

## 5. Handoff

- BUG_REGISTER updated: `y/n`
- [UI_MODULE_LOCK_MATRIX.md](./UI_MODULE_LOCK_MATRIX.md) updated: `y/n`
- [UI_SCREEN_EVIDENCE_INDEX.md](./UI_SCREEN_EVIDENCE_INDEX.md) updated: `y/n`
- `../hardening_loop/CURRENT_STATE.md` + `NEXT_CLAUDE_REVIEW.md` + `AGENT_HANDOFF_LOG.md`: `y/n`
- Next agent: `claude` (assemble module-polish plan for Sam).
