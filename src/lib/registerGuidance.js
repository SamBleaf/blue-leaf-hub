/**
 * registerGuidance.js — what Blue Leaf maintains centrally for the Whole House step (R05 P4b, Tab 27 B04, B05, Gate 1.4).
 * Plain versioned config: edit it here and bump the version. There is no admin screen.
 *
 * BASELINE GUIDE. Standard / Upgraded / Premium wording, one set per category. A tier is a labelled pricing assumption
 * and nothing more. It is staff-only, chosen per category, and never fills in a choice, a preference, an approval or a
 * price. The wording is copied onto the record when a tier is chosen, so editing this file never rewrites what an
 * earlier estimate relied on. Keep it free of brands, amounts and promises: Tender Notes (P5) can't carry a currency sign.
 *
 * ENVELOPE REVIEW SUGGESTIONS. What a performance goal may prompt Blue Leaf or a consultant to review (DEC-MRUX-03).
 * Never a product, never a specification, never a certification claim. They are derived from the goals chosen and
 * are not stored, so there is no record for one to be approved or issued from.
 *
 * Waterproofing, insulation and the performance goals are deliberately not in the baseline guide (B04): an unreviewed
 * thermal or waterproofing solution must never become a pricing assumption.
 *
 * Pure config: no imports, safe in the browser and in Node.
 */

export const BASELINE_VERSION = "blue-leaf-baseline-v1.0";

/** "draft" until Blue Leaf confirms the wording below. The panel says so. Change to "confirmed" when they have. */
export const BASELINE_WORDING_STATUS = "draft";

/** Each category is independent. `questions` are the Tab 21 ids it covers. `pricedZones` are zones that each need pricing. */
export const BASELINE_CATEGORIES = [
  { key: "walls", label: "External walls", questions: ["W-013"], tiers: {
    standard: "Brick veneer or painted lightweight cladding from a standard range.",
    upgraded: "Rendered or mixed-material walls with one feature cladding zone.",
    premium: "Architectural wall systems with several feature zones, individually detailed.",
  } },
  { key: "roof", label: "Roof and gutters", questions: ["W-014"], tiers: {
    standard: "Corrugated metal roof, standard colour range, standard gutters.",
    upgraded: "Higher-grade metal profile or mid-range tile, with matched gutters.",
    premium: "Standing-seam metal or premium tile, with concealed or feature gutters.",
  } },
  { key: "windows", label: "Windows and glazing", questions: ["W-015"], tiers: {
    standard: "Aluminium frames from a standard range, glazing as the energy assessment requires.",
    upgraded: "Better-performing aluminium frames, double glazing to main living areas.",
    premium: "Thermally broken or timber frames, double glazing throughout.",
  } },
  { key: "floors", label: "Floors", questions: ["W-017", "R-005", "L-004"], pricedZones: ["main_floor", "bedroom_floor", "wet_area_floor"], tiers: {
    standard: "Hybrid or laminate to living areas, carpet to bedrooms, ceramic tile to wet areas.",
    upgraded: "Engineered timber to living areas, better carpet to bedrooms, porcelain tile to wet areas.",
    premium: "Wide-board engineered or solid timber, wool carpet, natural stone or large-format tile.",
  } },
  { key: "doors", label: "Doors, jambs and hardware", questions: ["W-018"], tiers: {
    standard: "2040 flush doors, standard architraves, standard hardware range.",
    upgraded: "2340 doors, simple square-edge trims, mid-range hardware.",
    premium: "Full-height doors, shadowline or flush jambs, designer hardware.",
  } },
  { key: "paint", label: "Paint and ceilings", questions: ["W-019", "R-006"], pricedZones: ["walls", "ceiling", "trim"], tiers: {
    standard: "One colour throughout, usual finish level per surface, standard cornice.",
    upgraded: "Up to three colours and a feature wall, square-set ceilings to main areas.",
    premium: "Designer colour schedule, square-set throughout, feature ceilings where shown.",
  } },
  { key: "kitchen", label: "Kitchen and joinery", questions: ["K-004", "K-005", "K-006"], tiers: {
    standard: "Laminate flat-panel cabinetry, laminate or entry-level engineered stone bench, tile splashback.",
    upgraded: "Painted or veneer cabinetry, engineered stone bench and splashback.",
    premium: "Custom cabinetry, natural stone or porcelain bench and splashback.",
  } },
  { key: "wet_areas", label: "Wet-area finishes and fixtures", questions: ["B-003", "B-004", "B-008", "B-009"], tiers: {
    standard: "Partial-height wall tile, standard vanity, toilet and tapware ranges.",
    upgraded: "Full-height wall tile, wall-hung vanity, mid-range tapware.",
    premium: "Feature and full-height tile, custom vanity, designer tapware.",
  } },
  { key: "laundry", label: "Laundry", questions: ["L-003"], tiers: {
    standard: "Standard trough and cabinet, laminate bench.",
    upgraded: "Built-in cabinetry with bench and undermount trough.",
    premium: "Custom joinery to match the kitchen standard.",
  } },
  { key: "hvac", label: "Heating, cooling and hot water", questions: ["W-020"], tiers: {
    standard: "Split systems to main areas, electric or gas hot water.",
    upgraded: "Ducted heating and cooling, heat pump hot water.",
    premium: "Zoned ducted or hydronic heating, heat pump hot water.",
  } },
  { key: "electrical", label: "Electrical and smart home", questions: ["W-021"], tiers: {
    standard: "Standard power, data and lighting allowance.",
    upgraded: "Additional data and lighting, provision for solar and EV charging.",
    premium: "Home automation, full lighting design, solar and EV charging.",
  } },
];

export const REVIEW_DISCLAIMER = "Starting points for Blue Leaf or consultant review. Nothing here is selected, specified, priced or agreed. When a review settles something, record it on the card it belongs to. Nothing is copied across by itself.";
export const PASSIVE_HOUSE_NOTE = "A Passive House target is an intent. It doesn't mean the home will achieve certification.";

/** Every suggestion has to be confirmed against these, whichever goal raised it. */
export const PERFORMANCE_REVIEW_CHECKS = [
  "Climate zone", "Wall and roof build-up", "Vapour and condensation control", "Continuity of each layer",
  "Compliance and approvals", "Roof pitch", "Manufacturer details",
];

/** What a goal may prompt someone to review, by W-016 option id. Plain descriptions, no products. */
export const PERFORMANCE_SUGGESTIONS = {
  weather_tightness_system: [
    { id: "membranes", area: "Walls and roof", text: "Project-specific external wall and roof membranes, and how they are lapped and detailed." },
    { id: "junctions", area: "Openings and junctions", text: "Flashing and junction details at windows, roof-to-wall joints and penetrations." },
  ],
  airtightness: [
    { id: "air_control_layer", area: "Whole envelope", text: "A defined, continuous air-control layer across walls, roof and floor." },
    { id: "sealing_strategy", area: "Junctions and penetrations", text: "How that layer is sealed at junctions and penetrations, with compatible sealing products." },
    { id: "test_plan", area: "Verification", text: "Whether and when an air-leakage test is carried out." },
  ],
  comfort_and_energy_efficiency: [
    { id: "insulation_levels", area: "Walls, roof and floor", text: "Insulation levels, set by the energy assessment and the build-up." },
    { id: "glazing_shading", area: "Windows", text: "Glazing and shading for each orientation." },
    { id: "thermal_bridging", area: "Framing and slab edge", text: "Heat loss through framing and at the slab edge." },
  ],
  passive_house_target: [
    { id: "higher_insulation", area: "Whole envelope", text: "Higher insulation levels, reviewed against the climate zone." },
    { id: "glazing_bridges_ventilation", area: "Glazing and services", text: "Glazing, thermal-bridge and heat-recovery ventilation review." },
    { id: "independent_verification", area: "Verification", text: "Whether an independent assessment path is wanted, and who would carry it out." },
  ],
};
