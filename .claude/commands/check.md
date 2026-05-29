# /check — Blue Leaf Hub health check

Run a full codebase health check and report results before any commit, sprint build, or production deploy.

## Steps

1. **ESLint** — run `npm run lint` (zero warnings policy). Report any violations with file + line.

2. **Vite build** — run `npx vite build`. Must succeed with no errors. Chunk size warnings are expected and can be ignored.

3. **Standards audit — server responses** (see CLAUDE.md § Standards for the law)
   Grep for non-conforming patterns. Flag with file + line:
   ```bash
   grep -rn "success: true" server/lib/ --include="*.mjs"
   grep -rn "\.json({ error:" server/lib/ --include="*.mjs"
   grep -rn "res\.json({ reply" server/lib/ --include="*.mjs"
   ```
   Target = zero in any file created/modified this session. Legacy violations tracked but non-blocking.

4. **Standards audit — frontend fetch**
   Direct `authFetch` in page/component files (new files must use `apiFetch` from `src/lib/apiFetch.js`):
   ```bash
   grep -rn "authFetch(" src/pages/ src/components/ --include="*.jsx" --include="*.js" | grep -v "apiFetch\|authFetch\.js"
   ```

5. **Standards audit — hardcoded status strings**
   Status strings that must come from `src/lib/constants.js` in new files:
   ```bash
   grep -rn '"enquiry"\|"approved"\|"submitted"\|"rejected"\|"winning_offer"' src/pages/ src/components/ --include="*.jsx" | grep -v "//\|constants\|placeholder\|label\|toast\|aria"
   ```

6. **Import consistency** — verify recently modified schedule/sales files have valid imports:
   - `src/lib/scheduleUtils.js` exports: `getTaskGanttStyles`, `hexToTint`, `darkenHex`, `PHASE_COLOR_MAP`, `daysBetween`, `phaseColor`
   - `src/pages/LeadDetail.jsx` — no broken imports

7. **API route registration** — confirm in `server/dev-api.mjs` that all route registers are called:
   - `registerSalesRoutes`, `registerModule4Routes`, `registerModule5Routes`, `registerModule6Routes`
   - Blueprint route at `/api/blueprint/chat` returns `{ reply }`

8. **Stale references** — grep for renamed symbols:
   - `PHASE_PALETTE` — zero results in `src/`
   - `j.response` / `j.message` for Blueprint (must be `j.reply`)

9. **Git status** — report uncommitted changes.

## Output format

For each check: ✅ PASS or ❌ FAIL (with file + line if failing).

Standards violations output as:
```
Standards — server responses:   N violations (new files: X ← blocking | legacy: Y ← tracked)
Standards — frontend fetch:     N direct authFetch in pages (tracked)
Standards — hardcoded statuses: N matches (tracked)
```

End with: **"All clear — ready to build/ship"** or **"X issues need fixing before proceeding"**.
