# WHS Outputs Matrix — Master Rulebook

> **This is the single source of truth for the risk engine.** Every rule lives here, not scattered in code.
> `whsRiskRules.mjs` is generated from this table. One trigger → its full output chain.
> **Do not invent legal requirements** — the Code column names the governing document; specific clause numbers are confirmed by Sam against the SA WHS Act/Regs + Model Codes (marked _TBC_).
> **Last updated:** 2026-05-30 · Status: for review

---

## Part A — Module 0 → M5 pre-selection map

Module 0 (Construction Method) is **read from existing data and confirmed**, not typed. These attributes auto-tick the matching High-Risk Construction Work in M5; the supervisor confirms rather than thinks.

| Construction attribute | Source (existing) | Auto pre-selects (HRCW) |
|---|---|---|
| 2+ storeys | `project_metrics.storeys` | Work at heights · Scaffold |
| Roof trusses / pitched roof | `project_metrics.roof_type` | Roof work · Work at heights · Mobile plant (truss lift) |
| Timber frame | `project_metrics.wall_type` / estimate | Structural carpentry |
| Steel frame / structural steel | `accepted_trades` (Structural Steel) | Structural steel erection · Crane / telehandler |
| Precast / tilt-up | estimate categories | Crane lifts · Structural |
| Suspended slab | `project_metrics.has_suspended_slab` | Formwork/falsework · Edge protection · Concrete pour |
| Basement | estimate / confirm | Excavation · Shoring · (possible confined space) · Dewatering |
| Retaining walls | `project_metrics.has_retaining_walls` | Excavation · Structural |
| Demolition scope | `accepted_trades` (Demolition / Civil) | Demolition · **Asbestos check** (pre-1990 reno) |
| Masonry / concrete cutting | `accepted_trades` (Masonry, Concrete) | Silica |
| Steep site | `project_metrics.site_slope` = steep/very_steep | Excavation · Plant stability → **also M4 hazard** |
| Bushfire zone | `project_metrics.bal_rating` | → **M4 hazard** (bushfire controls, hot-works caution) |

> Renovation flag (`project_type`) also triggers an **Asbestos** prompt — the biggest residential-reno legal trap.

---

## Part B — Master risk matrix (HRCW & activities)

One row per trigger. `—` = not applicable. SWMS rows write to `project_swms`; permits → `whs_permits`; inspections → `whs_inspections`; registers reuse/extend existing tables; toolbox → consultation module; board warning → Site Board; training → `whs_training`.

| Trigger | SWMS | Permit | Inspection | Register | Toolbox | Site-Board Warning | Training / Competency | Code (confirm clause) |
|---|---|---|---|---|---|---|---|---|
| Work at heights >2m | Working at Heights | Height work (per policy) | Fall-protection / harness check | Risk | Falls | "Fall risk — protection required" | Working-at-heights awareness | Managing the Risk of Falls COP _TBC_ |
| Roof work | Roof Work | — | Roof access / anchor check | Risk | Roof safety | "Roof work in progress" | Roof work | Falls COP · Construction Work COP _TBC_ |
| Scaffold use | Scaffold | — | Scaffold handover + 30-day re-inspect | Scaffold | Scaffold use | "Do not alter scaffold" | Scaffolder ticket (if >4m) | Scaffold guidance _TBC_ |
| Excavation / trenching | Excavation | — | Daily excavation inspection | Risk | Excavation | "Open excavation" | Excavation awareness | Excavation Work COP _TBC_ |
| Excavation >1.5m / near services / near structures | Excavation (+ shoring) | **Excavation Permit** (+ DBYD) | Daily + after rain | Risk · Inspection | Trench safety | "Deep excavation — no unauthorised entry" | Trench/shoring competency | Excavation Work COP _TBC_ |
| Demolition | Demolition | Demolition (notify if applicable) | Pre-demo hazard check | Risk | Demolition | "Demolition zone" | Demolition awareness | Demolition Work COP _TBC_ |
| Structural alterations | Structural Carpentry / Alterations | — | Temporary-support check | Risk | Structural | "Temporary supports in place" | — | Construction Work COP _TBC_ |
| Structural steel erection | Structural Steel | — | Lift / connection check | Risk · Plant | Steel erection | "Overhead steel work" | Rigging / dogging | Construction Work COP _TBC_ |
| Precast / tilt-up | Precast / Tilt-up | — | Brace / prop check | Risk · Plant | Precast | "Propped panels — do not remove" | Rigging / dogging | Tilt-up & Precast guidance _TBC_ |
| Crane lifts | Crane / Lifting | (high-risk lift plan) | Pre-lift + lift-study check | Plant | Crane lift | "Crane lifting — exclusion zone" | Crane operator + dogger/rigger | Cranes COP _TBC_ |
| Telehandler | Mobile Plant | — | Pre-start + daily | Plant | Mobile plant | "Mobile plant operating" | Telehandler / HRWL | Construction Work COP _TBC_ |
| Mobile plant (excavator/loader/EWP/forklift) | Mobile Plant | — | Pre-start + daily | Plant | Mobile plant | "Plant exclusion zone" | Plant ticket / HRWL (EWP, forklift) | Construction Work COP _TBC_ |
| Hot works | Hot Works | **Hot Works Permit** | Fire-watch + post-work check | Risk | Hot works | "Hot works — fire watch active" | Hot-works awareness | Welding / hot-work guidance _TBC_ |
| Silica (cut/grind/chase/core) | Silica / RCS | — | Dust-control / RPE check | Risk · Health monitoring | Silica dust | "Silica dust — RPE required" | Silica awareness + health monitoring | Crystalline Silica COP _TBC_ |
| Hazardous chemicals | Hazardous Chemicals | — | SDS / storage check | Hazardous chemicals + SDS | Chemical handling | "Hazardous chemicals stored here" | Chemical handling | Hazardous Chemicals COP _TBC_ |
| Confined space | Confined Space | **Confined Space Entry Permit** | Atmospheric test + standby | Risk | Confined space | "Confined space — permit only" | Confined-space entry | Confined Spaces COP _TBC_ |
| Suspended slab / formwork | Formwork / Falsework | — | Formwork pre-pour inspection | Risk | Formwork | "Formwork loaded — keep clear" | Formwork competency | Construction Work COP _TBC_ |
| Energised electrical (if any) | Electrical Work | (isolation permit) | Isolation / test-for-dead | Risk | Electrical safety | "Live electrical work" | Licensed electrician | Electrical guidance _TBC_ |
| Asbestos (pre-1990 reno) | Asbestos Removal (licensed) | (removal control plan) | Clearance inspection | Asbestos | Asbestos awareness | "Asbestos — do not disturb" | Asbestos awareness / licence | Asbestos COP _TBC_ |

---

## Part C — Site-hazard triggers (Module 4) → outputs

| Hazard (M4) | SWMS / Control | Permit | Inspection | Register | Site-Board Warning |
|---|---|---|---|---|---|
| Overhead powerlines | Powerline clearance control + spotter | (SA Power Networks clearance) | Clearance check before plant | Risk · Controls | "Overhead powerlines — min clearance X" |
| Underground services | Forces DBYD before excavation | — | Service-location verify | Risk · Controls | "Underground services — locate before dig" |
| Public access / pedestrians / adjacent road | Traffic Management Plan | (council/road permit if needed) | Daily barricade/signage check | Controls | "Site boundary — no public entry" |
| Steep site | Plant-stability + access controls | — | Access/benching check | Risk | "Steep terrain — plant caution" |
| Bushfire (BAL) | Bushfire site controls + hot-works caution | — | Total-fire-ban check | Risk | "Fire danger — hot works restricted" |
| Flood risk | Weather watch + dewatering | — | Pre-rain check | Risk | — |
| Existing structures / retaining walls | Temporary-support / exclusion | — | Stability check | Risk | "Unstable structure — keep clear" |

---

## Part D — Weather-sensitive activities map

Each activity is tagged `weather_sensitive` with the condition that pauses it. Future scheduler integration (Programme → WHS) fires the alert automatically.

| Activity | Sensitive to | Auto-action when forecast breaches |
|---|---|---|
| Roof work / work at heights | High wind | Notify supervisor · flag Roof/Heights SWMS · board warning |
| Crane / telehandler lifts | High wind | Notify supervisor · hold lift plan |
| Concrete pour | Heat / heavy rain | Notify supervisor · curing note |
| Membrane / waterproofing | Rain / low temp | Notify supervisor · hold |
| Excavation | Heavy rain (collapse) | Notify supervisor · re-inspect before re-entry |

---

## How the engine consumes this
1. Module 0 + M4 + M5–M9 answers produce a set of **triggers**.
2. For each active trigger, the engine reads its row and **generates the full chain**: SWMS → Permit → Inspection → Register → Toolbox → Board Warning → Training.
3. Outputs land in: `project_swms`, `whs_permits`, `whs_inspections`, the registers, the Site Board, and `whs_training`.
4. The **Compliance Health Score** then reads across these (unsigned SWMS, overdue inspections, missing inductions/tickets) to produce the dashboard percentage.

> Adding a new risk = add a row here + a SWMS template. No scattered code changes.
