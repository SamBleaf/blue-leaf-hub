# Site WHS Pack — Unified Build Plan

**Version:** 0.1 · **Date:** 30/07/2026
**Merges:** `04_Questionnaire_Spec.md` (logic — what's asked, how controls resolve, gates) + `05_Design_Direction.md` (presentation across three surfaces). This is the working sequence; the two source specs are the detail.

---

## 0. Organising principle — three surfaces, not one document

From `05_Design_Direction.md` §0. Every task below moves one or more of these; they must **not** share a layout.

| | Surface | Reader | The instrument |
|---|---|---|---|
| **A** | The builder | Site supervisor, 5 min at a desk | the questionnaire → selections |
| **B** | The site pack | Carpenters, 30 s at 6:45am, gloves/glare | Site Card + branded pack |
| **C** | The evidence record | Reviewer / SafeWork / insurer, 2 years later | the archived, signed, page-numbered PDF |

The two specs are one program: the **hierarchy bar** is both a design element (B) and the **G-2** gate (A); the **Site Card** *reads* the site facts (§2) and conditional Part-3 fields (§6). So they build interleaved, not sequentially.

Legend: **[A]/[B]/[C]** = surface · **⚖︎** = needs competent-WHS-reviewer sign-off before it goes live (build the mechanism + load the safety agent's draft; nothing is usable on site until reviewed — the whole system is already DRAFT-gated).

---

## 1. Status

- **Phase 0 — SHIPPED** (`bfb621a`): Questionnaire §10 items 1–2 → **G-1** gate (block issue when an HRCW module has no controls ticked, surfaced inline) + **register text cleanup** (markdown stripped, editorial leaks removed, banned wording fixed, T-14 compound flags normalised, re-seeded) + **render hardening** (`stripMd`/`normFlag` so bad data can never leak or resolve to a silent n/a). Design anti-patterns #9/#10 closed.

---

## 2. The merged sequence

Each phase ships and is testable. Value is front-loaded; dependencies respected.

### Phase 1 — The two signature components  [A][B] · no reviewer
*The design spec's highest-value, lowest-dependency work; both read existing data.*
- **Hierarchy bar** (Design §6.1, build #2). Six-segment L1–L6 bar per module, filled to the highest *selected* level; colour by highest level (≤L4 green / L5 amber / L6 red = "PPE ONLY — JUSTIFY"); greyscale-safe (fill position, not hue). Live in the builder as feedback, rendered in the pack. **Doubles as gate G-2** (Questionnaire §7): L5/L6-highest → require a free-text justification that lands in the pack, block issue until entered.
- **Site Card** (Design §7.2, build #1). One page "TODAY ON THIS SITE": ≤3 kill risks (from the highest-consequence selected HRCW modules) · STOP WORK IF · IF SOMETHING HAPPENS · the stop-work statement. Page 1 of the pack **and** a standalone laminate (D-3). Renders from current data now; enriched by Phases 2 + 4.
- Files: `WhsPackTab.jsx` (live bar + G-2 field), `packCompose.mjs` (bar + Site Card block), new `whsHierarchyBar.mjs` helper.
- Ships: the two things that actually get read + the single most important safety glance.

### Phase 2 — Document control + conditional Part 3  [C][B] · no reviewer
*Closes real compliance gaps; feeds the Site Card, tag block, emergency page and footer.*
- **Conditional Part 3** (Questionnaire §6): address **street/suburb/postcode** (the ambulance gap), PC WHS-plan ref, other PCBUs + coordination (Act s46), first-aid/fire locations, first-aider name+expiry, **version · reviewer · approval date · scheduled review date**, consultation record, sign-on record (with record ID). Trigger→field conditionals: fall-arrest → clearance calc/anchor/rescuer (**G-3**), plant → licences, J-4 propping design, J-5 asbestos ref, J-6 silica assessment, J-7 permits, SF-09 radius, SF-13 crew/threshold, T-12 SDS.
- **Site-specific conditions block** — 6 Y/N rows (overhead/underground services, tight boundary, occupied dwelling, other trades above/below, unusual access) — the "defeats generic" minimum.
- **Tag block** (Design §6.2): scaffold-tag identity with REVIEW DUE (green in-date / amber draft / red overdue).
- Gates: **G-3**, **G-4** (dangling "recorded in Part 3"), **G-8** (review date required on approve), **G-9** (flag pack past review-due on open).
- Files: `WhsPackTab.jsx` (conditional field engine), `packCompose.mjs` (Part 3 + tag block + footer), `carpentryWhsPackRoutes.mjs` (G-3/G-4/G-8), **migration 168** (`review_due_at`, `reviewed_by`, `reviewed_at` on `carpentry_whs_packs`).
- Ships: the *two-year* and *inspector* acceptance tests start passing.

### Phase 3 — The printed artefact  [B][C] · no reviewer
*Fix every "old wins" regression: the pack becomes a branded, page-numbered, print-native document + the archival record.*
- Proper A4 multi-page PDF: **logo, footer, `Page N of M`, tag-block cover**; work-**stage-band grouping** above modules (Design §7.3; stages derived from J-1, D-2); **task-name-first** cards with module ID demoted to mono metadata (§7.4); IN PLACE / NOT USED split; **emergency page** at a fixed position (§7.5); the **colour+shape+word** state system (§5.3); 18-row **signature table** + **review-rounds table** + document-control footer (carried from the original).
- **Decision baked in:** server-side **pdfkit** PDF (matches the repo's PDF pattern; reliable page furniture; *is* the Surface-C archival record — storable to the job's Dropbox + emailable). Supersedes the current client-side print button for the record copy (keep print for a quick copy).
- Files: new `server/lib/whs/packPdfKit.mjs` + endpoint `GET …/whs-pack/pdf` (stream + optional Dropbox store), typography per Design §5.2 (Archivo Narrow / Inter / IBM Plex Mono, embedded).
- Ships: the *greyscale*, *arm's-length*, *shed-wall* acceptance tests target this.

### Phase 4 — The questionnaire logic — 196 → ~30  [A] · ⚖︎ heavy
*The supervisor-facing reduction. Where the reviewer sign-off concentrates.*
- **J-questions** (Questionnaire §4): 8 plain-language scope questions → module gating; recovers H-08/09/10/13; records negatives ("H-10 — not applicable, post-2004"). **G-6** (no blank J answers).
- **Shared site facts** SF-01…14 (§2) → an **SF→control resolution map** auto-resolves ~51 ticks. ⚖︎
- **Standing vs site-variable** (§3): a `kind` on every control → "HOW WE ALWAYS WORK" list (Design §7.4) + the IN PLACE/NOT USED split. ⚖︎
- **Mutual exclusion** map (§8) + **G-5**. ⚖︎
- **Progressive disclosure** builder (Design §8): collapsed module cards with the live hierarchy bar, grouped SF *before* module detail, section progress, inline validation in the interface's voice, buttons that say what they do (Send for review / Approve & issue).
- Register schema: control `kind` + `excludes` + SF/J resolution tables (in `whs_content.json` or a sibling map module); re-seed.
- Files: new `whsQuestionnaire.mjs` (SF+J definitions), `whsResolution.mjs` (SF/J→control maps, draft), `WhsPackTab.jsx` rebuild, `whs_content.json` schema + re-seed.
- Ships: the *5-second* and *glove* acceptance tests target this.

### Phase 5 — Site-specific evidence + QA  [C][B] · partial ⚖︎
- **Site photos / marked-up plan** (Design §7.6; D-4: required when scaffold or fall-arrest is selected) — camera field in the builder, stored on the job, printed with the module it evidences. The fastest route out of "generic".
- Consultation + sign-on printing completed (§7.7).
- Full **acceptance-test pass** (Design §10) as the release gate; resolve D-1 risk-rating display.

---

## 3. Reviewer-gated register (⚖︎ — the safety judgements)

I build the mechanism and load the safety agent's proposed tables as **DRAFT**; a competent WHS reviewer confirms each before the modules can be marked reviewed and packs can issue. I do **not** author these classifications.

1. **Standing vs site-variable** per control (Questionnaire §3 table).
2. **SF → control resolution** map (§2 — which control a site-fact answer satisfies).
3. **J → module** gating (§4 — mostly mechanical, confirm).
4. **Mutual exclusion** map (§8).
5. **G-2 justification** threshold + **D-1** risk-rating display.

---

## 4. Open decisions — adopted defaults (override any)

Adopting the design spec's own recommendations so the build can proceed; flag any you want changed.

| # | Decision | Adopted default |
|---|---|---|
| D-1 | Reinstate risk ratings? | **No 5×5 matrix** — the hierarchy bar + a single consequence flag on kill risks. (Reviewer may override.) |
| D-2 | Work-stage grouping | **Derived from J-1** (less to maintain). |
| D-3 | Site Card — page 1 or standalone? | **Both** — page 1 of the pack + a standalone laminate. |
| D-4 | Site photos required? | **Required** when scaffold or fall-arrest is selected; optional otherwise. |
| D-5 | Print NOT USED controls | **Compact** on the site copy, **full** on the archived evidence copy. |

---

## 5. Acceptance tests (the release gate)

From `05_Design_Direction.md` §10 — the pack isn't done until it passes: 5-second, glove, greyscale, arm's-length, shed-wall, cold-open, PPE-only, inspector, two-year. Each phase names which tests it targets.

---

*DRAFT plan. Everything stays DRAFT — NOT FOR SITE USE until the competent WHS reviewer signs off the register classifications in §3.*
