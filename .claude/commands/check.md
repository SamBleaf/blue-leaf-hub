# /check — Blue Leaf Hub health check

Run a full codebase health check and report results before any commit, sprint build, or production deploy.

## Steps

1. **ESLint** — run `npm run lint` (zero warnings policy). Report any violations with file + line.

2. **Vite build** — run `npx vite build`. Must succeed with no errors. Chunk size warnings are expected and can be ignored.

3. **Import consistency** — verify all recently modified schedule/sales files have valid imports:
   - `src/lib/scheduleUtils.js` exports: `getTaskGanttStyles`, `hexToTint`, `darkenHex`, `PHASE_COLOR_MAP`, `daysBetween`, `phaseColor`
   - `src/components/schedule/ScheduleGantt.jsx` — all scheduleUtils imports resolve
   - `src/pages/ScheduleManager.jsx` — `daysBetween` import resolves
   - `src/pages/LeadDetail.jsx` — no broken imports

4. **API route registration** — confirm in `server/dev-api.mjs` that all route registers are called:
   - `registerSalesRoutes` (includes conversations routes)
   - `registerModule4Routes`, `registerModule5Routes`, `registerModule6Routes`
   - Blueprint route at `/api/blueprint/chat` returns `{ reply }`

5. **Stale references** — grep for any old symbol names that were renamed:
   - `PHASE_PALETTE` (replaced by `PHASE_COLOR_MAP`) — should return zero results in `src/`
   - Any `j.response` or `j.message` used instead of `j.reply` for Blueprint API responses

6. **Git status** — report any uncommitted changes and which files Cursor or other tools may have modified outside this session.

## Output format

For each check: ✅ PASS or ❌ FAIL (with specific file + line if failing).

End with a one-line summary: either **"All clear — ready to build/ship"** or **"X issues need fixing before proceeding"**.
