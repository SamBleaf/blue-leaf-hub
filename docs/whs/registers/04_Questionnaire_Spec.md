# Questionnaire Redesign Spec — Site WHS Pack Builder

**Version:** 0.1 DRAFT · **Date:** 30/07/2026
**Reviewed against:** the pack builder UI as at 30/07/2026 (sections 1–3)

---

## 1. The problem, counted

| Section | Decisions asked of the supervisor |
|---|---|
| 1 · Which high-risk work applies | 10 module checkboxes + **~78 control tick boxes** |
| 2 · Task-control modules | 14 module checkboxes + **~88 control tick boxes** |
| 3 · Site details | 6 free-text fields |
| **Total** | **~196 decisions per job** |

That is not a questionnaire, it's a data-entry shift. Nobody completes it honestly on a Tuesday morning with a truss delivery arriving — they'll tick the module headers and skip the controls, which is exactly what the sample pack shows (every H module ticked, one control ticked across all of them).

**The diagnosis is not "too many controls."** The controls are right. The problem is that the same physical fact is being asked up to seven times, and standing rules are being asked at all.

Two structural changes cut ~196 decisions to roughly **30** without losing a single control from the output.

---

## 2. Change one — ask about the site, not about each module

Fourteen site facts resolve about 50 of the control tick boxes. Ask each once; propagate to every module that references it.

| ID | Question | Answer type | Resolves |
|---|---|---|---|
| **SF-01** | Perimeter scaffold on site? | `Yes — green tag + handover cert` / `Yes — not yet tagged` / `No` | H-01 L3 · H-02 L3 · H-03 L3 · H-04 L3 · H-05 L3 · T-13 L4 ×2 **(7 boxes)** |
| **SF-02** | Perimeter guardrail / edge protection installed? | `Yes` / `No` / `N/A` | H-01 L4 · H-02 L4 · H-04 L4 **(3)** |
| **SF-03** | How are openings and voids protected? | `Fixed load-rated covers` / `Guardrail` / `Temporary decking` / `No openings on this job` | H-01 L4 · H-03 L4 · H-06 L4 ×3 **(5)** |
| **SF-04** | Safety mesh or catch platform below the working level? | `Yes` / `No` | H-01 L4 · H-04 L4 **(2)** |
| **SF-05** | 1.5 m edge exclusion demarcated? | `Yes — physically demarcated` / `Not required, passive protection in place` | H-01 L5 · H-02 L5 · H-03 L4 · H-04 L5 **(4)** |
| **SF-06** | Stop-work limits | wind `__ km/h` · heat `__ °C` · `☑ no roof/joist work when wet or frosted` | H-02 L5 · H-03 L5 · H-04 L5 · H-05 L5 · H-07 L5 · T-11 L5 **(6)** |
| **SF-07** | Fall system beyond scaffold/guardrail | `None needed` / `Travel restraint` / `Fall arrest` / `EWP` | H-01 L6 ×2 · H-02 L6 · H-03 L6 · H-04 L6 · H-05 L4 **(6)** |
| **SF-08** | Powered mobile plant on site | multi: `crane` `truck-mounted crane` `telehandler` `EWP` `none` | triggers H-07 · H-12 · T-09 L3 |
| **SF-09** | Exclusion zone demarcated for lifting / overhead work? | `Yes — radius __ m` / `N/A` | H-05 L4 · H-07 L3 · T-09 L3 **(3)** |
| **SF-10** | Dust control available for cutting | `H-class on-tool extraction` / `Wet suppression` / `Neither` | T-01 L4 ×2 · T-02 L4 **(3)** |
| **SF-11** | Cutting station | `Ground level, outdoors, downwind` / `Other — describe` | T-01 L3 · T-02 L3 · H-05 L2 **(3)** |
| **SF-12** | Overhead electrical services on the frontage | `None` / `Present — clearances confirmed with network operator` / `Present — de-energised or relocated` / `Present — not yet addressed` | H-07 L4 · H-11 L1/L3 · H-12 **(4)** |
| **SF-13** | Mechanical aid nominated for this job | `Telehandler` / `Panel lifter` / `Sheet trolley` / `Beam dolly` / `Gin wheel` / `Team lift only — crew of __` | H-05 L5 · T-06 L4/L5 **(3)** |
| **SF-14** | Site access and egress to each work level | `Scaffold stairs` / `Secured ladder access` / `Ground level only` | T-10 L4 · T-08 trigger **(2)** |

**14 questions → ~51 control ticks resolved.** SF-12 in particular is currently buried inside three separate modules and is the single highest-consequence question on the form.

---

## 3. Change two — separate standing controls from site-variable controls

Not every control is a site question. Split them:

- **Site-variable** — a physical thing that either exists on this site or doesn't (scaffold, guardrail, mesh, extraction unit, exclusion zone, cover). **Must be ticked.** This is where reg 299(2)(c) bites.
- **Standing** — how Blue Leaf works on every job (guards never wedged, no freehand cutting, RCD tested at set-up, three points of contact, protruding nails bent over). **Pre-set, rendered in the pack, no tick required.**

A standing control is still a stated control in the SWMS. It just isn't a per-job decision, and asking about it every job trains the crew to tick without reading.

### Classification

| Module | Site-variable (tick) | Standing (no tick) |
|---|---|---|
| H-01 | via SF-01…SF-07 | — |
| H-02 | via SF-01, SF-02, SF-05, SF-06, SF-07 | temporary bracing as each frame is stood; erection sequence agreed at pre-start |
| H-03 | via SF-01, SF-03, SF-05, SF-06, SF-07 | no person on external top plate; planks supported/secured; braced to manufacturer's instructions; loaded in erection order; bottom chords checked; **no anchoring to unbraced trusses** |
| H-04 | via SF-01, SF-02, SF-04, SF-06, SF-07 | battens worked from completed area outward; walking route stated at pre-start; only fixed members walked on |
| H-05 | via SF-01, SF-07, SF-09, SF-11 | sheets raised mechanically or team lift, no single-person handling at height |
| H-06 | via SF-03 | covers installed at the moment the opening is created, by the person who created it; removal requires supervisor authorisation; documented pre-start walk |
| H-07 | via SF-08, SF-09, SF-12 · **licence numbers** | lift plan reviewed before lift; nominated spotter; no person under a suspended load |
| H-11 | via SF-12 | cable detection scan before drilling into existing structure; dedicated spotter in approach zone; Blue Leaf performs no electrical work |
| H-12 | permit ref, TMP ref | physical barriers not tape; deliveries outside peak pedestrian periods |
| H-14 | assessment outcome, training records, monitoring | assessment disregards PPE and admin controls |
| T-01 | via SF-10, SF-11 | no dry sweeping or blow-down; SDS held; P2 fit-tested; exposure duration limited |
| T-02 | via SF-10, SF-11 | vacuum clean-up; SDS for MDF |
| T-03 | sequential-trip fitted `Y/N` | **all others standing** |
| T-04 | — | **all standing** |
| T-05 | — | **all standing** |
| T-06 | via SF-13 | task rotation; workers trained for these loads; material stored at waist height |
| T-07 | — | **all standing** (audiometric testing tracked centrally, not per job) |
| T-08 | ladder in use `Y/N` | **all others standing** |
| T-09 | laydown area location | stacks restrained, height limited; sheets flat or racked; straps released clear of fall path; access ways clear |
| T-10 | via SF-14 | **all others standing** |
| T-11 | via SF-06 | shade and water provided; heat-illness buddy check |
| T-12 | chemicals on site `list` | SDS obtained; labelled containers; treated-timber rules; PPE per SDS |
| T-13 | via SF-01 · tag date | no alteration of scaffold by Blue Leaf crew; loading limits observed |
| T-14 | — | PPE matrix — **not a task-control module, should not appear in section 2** |

**Section 2 goes from 88 tick boxes to about 8 genuine questions.**

---

## 4. Change three — scope by plain-language job questions, not by module ID

Section 1 currently asks the supervisor to tick module names. That requires them to already know the taxonomy. Derive it instead:

| Q | Question | Derives |
|---|---|---|
| J-1 | Which stages on this job? `first fix` `cladding` `second fix` `roofing` `demo / propping` | H-01…H-05, T-01, T-02 |
| J-2 | Any work more than 2 m above the level below? `Y/N` | H-01…H-06 gate |
| J-3 | Openings, stair voids or penetrations in any working surface? `Y/N` | H-06 |
| J-4 | Removing or altering anything load-bearing? `Y/N` | **H-08, H-09** |
| J-5 | Structure built before 2004? `Y/N` | **H-10** |
| J-6 | Cutting or drilling fibre cement, AAC, masonry or tile on site? `Y/N` | T-01, H-14 gate |
| J-7 | Does any work, plant or exclusion zone extend onto a road or footpath? `Y/N` | H-12 |
| J-8 | Excavation deeper than 1.5 m in the work area? `Y/N` | **H-13** |

Eight questions. Note J-4, J-5 and J-8 pull in **H-08, H-09, H-10 and H-13 — the four modules missing from the sample pack.** Asking the question is what stops them being silently dropped, and it produces the "considered and not applicable" record that was absent.

**Every J answer is recorded, including the negatives.** `H-10 — not applicable, structure post-2004` is a compliance artefact, not a blank.

---

## 5. Total load after redesign

| Block | Questions |
|---|---|
| Job scope (J-1…J-8) | 8 |
| Site facts (SF-01…SF-14) | 14, several conditional on J answers |
| Module-unique site-variable | ~8 |
| Site details (§6 below) | ~6 base + conditional |
| **Total** | **~30–36, most of them single-tap** |

Same output. Same legal content. Roughly one-sixth of the input.

---

## 6. Section 3 is too thin — grow it, but conditionally

Currently six fields. Ticked controls in the sample already reference Part 3 content that has nowhere to live. Make each field appear **only** when a selected control requires it.

### Always required

| Field | Currently present |
|---|---|
| Site address — **street, suburb, postcode** | partial — sample had `25 Mariner Ave SA`, no suburb, unusable for an ambulance |
| Site supervisor (named) | ✓ field exists |
| Principal contractor (if not Blue Leaf) | ✓ field exists |
| **PC's WHS Management Plan ref** | ✗ — reg 299 requires it be taken into account |
| **Other PCBUs on site + how coordinated** (Act s46) | ✗ |
| Nearest hospital | ✓ — **derive from site address, don't carry the last value** |
| First aider (named) + qualification expiry | ✓ name field only |
| First aid kit location · fire extinguisher location | ✗ |
| Muster point | ✓ |
| **Version · reviewer · reviewer approval date · scheduled review date** | ✗ — the 2022 document's worst failure was being four years out of review |
| **Consultation record** — names, date, method, input given | ✗ |
| **Sign-on** — name, date, version signed | ✗ (field app — needs the record ID at minimum) |

### Conditional — trigger → field

| If this is selected | Require these fields |
|---|---|
| SF-06 wind/heat limits referenced by any ticked control | the numeric limits |
| SF-07 = `Fall arrest` | **ground-clearance calculation (calculated vs available, in m)** · anchor type + rating · installer (competent person) · harness/lanyard inspection date · **rescue method** · **named rescuer on site** · rescue equipment + its location |
| SF-07 = `Travel restraint` | lanyard length · anchor position · confirmed-by name |
| SF-08 includes any plant | operator licence class + number · dogger/rigger licence · lift plan ref |
| SF-01 = `Yes` | scaffolder · handover cert ref · **tag date** |
| J-4 = `Y` | engineer's propping design ref · competent-person sign-off |
| J-5 = `Y` | asbestos register ref **or** clearance certificate ref |
| J-6 = `Y` | written CSS risk assessment outcome · silica training records · SRCP ref (Path A) or SWMS-carries-SRCP flag (Path B) |
| J-7 = `Y` | council permit ref · TMP ref |
| SF-09 = `Yes` | exclusion zone radius in m |
| SF-13 = `Team lift only` | crew number · load threshold |
| T-12 chemicals listed | SDS held ☑ per product |

### Site-specific conditions block — short, and this is what defeats "generic"

Six yes/no rows with a one-line detail box on Yes. This is the minimum that makes the pack site-specific rather than a template with an address on it:

| Condition | Y/N | Detail if Y |
|---|---|---|
| Overhead services on the frontage | ☐ | position + clearance |
| Underground services in the work path | ☐ | DBYD ref |
| Adjoining structures or tight boundary | ☐ | which side |
| Occupied dwelling or neighbours affected | ☐ | |
| Other trades working above or below | ☐ | which |
| Anything unusual about access, slope or ground | ☐ | |

---

## 7. Validation gates — cheaper than review

The sample pack was generated with every HRCW module ticked and essentially no controls ticked. That's a worse artefact than the 2022 document: it asserts high risk work is happening and states no controls. Hard-block it.

| ID | Gate | Behaviour |
|---|---|---|
| **G-1** | HRCW module ticked with **zero** controls ticked | **BLOCK.** Cannot save or generate. |
| **G-2** | HRCW module where the highest ticked level is L5 or L6 | **BLOCK until justification entered.** Free text, lands in the pack for the reviewer. This is the "PPE doing an engineering control's job" trap. |
| **G-3** | SF-07 = `Fall arrest` and any conditional field in §6 blank | **BLOCK.** No arrest without clearance, anchor, rescue method and named rescuer. |
| **G-4** | Any ticked control containing "stated in Part 3" / "recorded in Part 3" with its Part 3 field blank | **BLOCK.** Kills the dangling-reference defect. |
| **G-5** | Mutually exclusive controls both ticked | **BLOCK** with the conflict named (see §8). |
| **G-6** | J-question left unanswered | **BLOCK.** No blanks — a negative is an answer and gets recorded. |
| **G-7** | Generate requested with no reviewer approval | Allow, but stamp **DRAFT — NOT FOR SITE USE** and disable sign-on. Current behaviour is correct; keep it. |
| **G-8** | Scheduled review date not set | **BLOCK** on approval. |
| **G-9** | Pack older than its scheduled review date | Flag on open; require new version before reissue. |

---

## 8. Mutual exclusion map

Ticking the L1 that removes the exposure should grey out the controls that assume the exposure still exists. Otherwise the pack claims the floor was craned in as a completed cassette *and* that scaffold and guardrail protect the workers at the edge.

| Module | If this is ticked | Grey out / warn |
|---|---|---|
| H-01 | L1 *cassette craned in, no person at open edge* | all remaining H-01 controls |
| H-02 | L1 *ground level only, no upper-storey frame work* | L3 scaffold, L4 guardrail (both premised on upper storey) |
| H-04 | L1 *fascia from EWP/scaffold, no person on roof frame* | L4 safety mesh, L5 batten walking route |
| H-05 | L2 *sheets cut at ground level* | conflicts with T-01 controls premised on cutting at height |
| H-06 | L1 *opening not formed until protection ready* | the three L4 protection options become "and", not "or" — allow |
| H-11 | L1 *supply de-energised and proved dead* | L3 insulated/tiger-tailed (alternative, not additive) |
| H-12 | L1 *all deliveries staged within site boundary* | L3 council permit, L4 public barriers, L5 traffic controller |
| T-01 | L1 *components ordered pre-cut, no site processing* | all remaining T-01 controls |

---

## 9. Register text cleanup — my defects, not yours

Several strings I wrote are doing double duty as instruction-to-you and control-text-for-site. They're rendering literally in the UI.

| Location | Problem | Fix |
|---|---|---|
| T-12 L5 | *"— the "nil" entry on the superseded SWMS is not acceptable"* | Editorial note to you. **Delete from control text.** |
| T-06 L5 | *"not left to judgement"* | Editorial. Delete. |
| T-08 L5 | *"(A harness is **not** a point of contact.)"* | Useful for the crew — promote to its own standing control line. |
| T-14 | renders *"No control options (PPE-matrix module)."* | Remove T-14 from section 2 entirely; it drives the PPE block in section 3. |
| T-04 L2 | *"Battery tools used in place of leads **where practical**"* | **Banned wording — my leak.** Replace: *"Battery tools used in place of 240 V leads for all tasks where a battery equivalent is available on site."* |
| Throughout | literal `**bold**` asterisks in H-11, H-14, T-01, T-06, T-08, T-12, T-13 | Strip markdown from register; carry emphasis as a field, not inline syntax. |
| T-14 PPE flags | `C → R` and `R / N/A` | Single-value flags only: `R` `C` `S` `NA`, with the condition in a separate `condition` field. This is what flipped P2 fit-tested to n/a in the earlier sample. |
| H-01, H-03, H-05 monitor lines | placeholder `[Site Supervisor name]` | Bind to the section 3 supervisor field. |

---

## 10. Build order

1. **G-1 and G-4.** One afternoon's work, and they stop the pack generating an artefact that's worse than the document it replaces.
2. **Register text cleanup** (§9). Mechanical, removes all literal asterisks and the editorial asides.
3. **Standing vs site-variable split** (§3). Biggest single reduction — section 2 drops from 88 ticks to ~8.
4. **Shared site facts** (§2). Section 1 drops from 78 ticks to ~14 answers.
5. **J-questions** (§4). Recovers H-08, H-09, H-10, H-13 and produces the not-applicable record.
6. **Conditional section 3** (§6). Closes every dangling "recorded in Part 3".
7. **Mutual exclusion** (§8), then G-2, G-3, G-5.

---

*DRAFT. All classifications in §3 require competent WHS reviewer sign-off — the standing/site-variable line is a safety judgement, not a UX one.*
