// real-extension-job.mjs — a REAL register, anonymised: the job the owner reviewed on 16 Nov 2026 (REGISTER_TO_DOCUMENTS_REVIEW.md),
// read-only from the Hub and rewritten compactly. Client, address, suburb, council and lead id are replaced with fictional ones;
// item and room ids are shortened (i01…i72). The typed words are kept exactly as staff typed them (typos included), because
// the point of this fixture is real data: every document is tested against it as well as against the tidy fictional projects.
// Omitted fields were the defaults listed in D (checked against the live JSON).
const D = { kind: "item", level: "", room: "", roomId: null, disposition: "undecided", description: "", product: "", manufacturer: "", model: "", colour: "",
  supplier: "", quantity: null, unit: "", certainty: "not_considered", responsibility: "", supplyBy: "", technicalStatus: "not_required", technicalEvidence: null,
  pricingStatus: "not_reviewed", pricingRef: "", source: "", sourceDocId: null, nextAction: "", resolved: false, isDefault: false, overridesDefaultId: null, evidence: null };
const ROOMS = [["e", "Entry", "hall", "renovated"], ["lv", "Living", "living", "new"], ["dn", "Dining", "dining", "new"], ["kt", "Kitchen", "kitchen", "renovated"],
  ["pn", "Pantry", "pantry", "renovated"], ["ld", "Laundry", "laundry", "renovated"], ["b1", "Bathroom", "bathroom", "new"], ["b2", "Bathroom 2", "bathroom", "renovated"],
  ["en", "Ensuite", "ensuite", "renovated"], ["bd1", "Bedroom", "bedroom", "renovated"], ["bd2", "Bedroom 2", "bedroom", "renovated"], ["bd3", "Bedroom 3", "bedroom", "new"],
  ["bd4", "Bedroom 4", "bedroom", "new"], ["wc1", "WC", "wc", "new"], ["wc2", "WC 2", "wc", "new"], ["lg", "Lounge", "living", "new"]];
const conf = (at, ids) => Object.fromEntries(ids.map(([id, fp, words]) => [id, { at, by: "Sam Morris", fingerprint: fp, words }]));
const WALLS = ["i32", "fp_uxvmnd", "Palette · Warm — Walls"], FLOOR = ["i28", "fp_1511u2e", "Timber · Engineered — Main floor"],
  CEIL = ["i33", "fp_2f5thq", "Ceiling · Square set, Finish level · Flat — Ceiling"];
const CONF = {
  e: conf("2026-11-15T22:07:50.891Z", [WALLS, FLOOR, CEIL]), lv: conf("2026-11-15T22:09:41.913Z", [WALLS, FLOOR, CEIL]), dn: conf("2026-11-15T22:09:50.749Z", [WALLS, FLOOR, CEIL]),
  kt: conf("2026-11-15T22:11:37.563Z", [WALLS, ["i36", "fp_1mlbvar", "Flat-panel · Laminate — Kitchen"], FLOOR, CEIL]),
  pn: conf("2026-11-15T22:13:35.794Z", [WALLS, FLOOR, CEIL, ["i37", "fp_tyf14d", "Flat-panel · Laminate — Scullery"]]),
  ld: conf("2026-11-15T22:14:58.597Z", [WALLS, ["i30", "fp_d0uyhz", "Tile · Porcelain — Wet-area floor"], CEIL, ["i35", "fp_18ansld", "Palette · Warm, Finish level · Low sheen — Wet area"],
    ["i44", "fp_9xg189", "Cabinetry, Bench, Splashback, Mixer, Trough — Laundry"]]),
};
const rooms = ROOMS.map(([id, name, roomType, scope], order) => ({ id, level: "Ground", name, roomType, scope, order, defaultConfirmations: CONF[id] || {} }));
const sel = (...pairs) => pairs.map(([label, optionId, ...path]) => ({ label, optionId, path: path.length ? path : [optionId] }));
const ans = (nature, selected, extra = {}) => ({ areaIds: [], assumption: null, delivery: null, element: null, linkedItemIds: [], nature, note: "", selected: selected || [],
  sourceQuestionIds: [], state: "recorded", unresolved: null, zone: null, v: 1, configVersion: "tab21-answer-map-v1.0", ...extra });
const zone = (key, label) => ({ zone: { key, label } });
const el = (id, key, label) => ({ element: { id, key, label } });
const R = (roomId) => ({ section: "room", roomId, level: "Ground", room: ROOMS.find((r) => r[0] === roomId)[1] });
const P = { section: "project" }, SITE = { section: "site" };
let n = 0;
const it = (id, promptKey, itemKind, where, category, extra = {}) => ({ ...D, id, promptKey, itemKind, ...where, category, ...extra,
  sync: { version: `2026-11-15T10:${String(n++).padStart(2, "0")}:00.000Z` }, createdAt: "2026-11-09T03:00:00.000Z", updatedAt: "2026-11-15T10:00:00.000Z" });

const items = [
  it("i01", "W-018", "selection", P, "doors", { disposition: "new", description: "2340 x 870 solid core doors, DAR pine jambs", colour: "870mm wide doors Standard", certainty: "preference", isDefault: true,
    answer: ans("choice", sel(["Door height · 2340", "2340", "door_height", "2340"], ["Jamb or edge detail · Architrave", "architrave", "jamb_or_edge_detail", "architrave"], ["Hardware style · Standard", "standard", "hardware_style", "standard"],
      ["Skirting · Standard", "standard", "skirting", "standard"], ["Architraves · Standard", "standard", "architraves", "standard"], ["Cornice · No", "no", "cornice", "no"])) }),
  it("i02", "W-019", "selection", P, "paint", { description: "Warm palette, Square set, Sheen", certainty: "preference", isDefault: true, answer: ans("choice", sel(["Ceiling · Square set", "square_set", "ceiling", "square_set"])) }),
  it("i03", "W-022", "scope", P, "procurement", { disposition: "included", description: "floor to ceiling curtain - ", answer: ans("scope", sel(["Included", "included"]), el("el_curt", "window_furnishings", "Window furnishings")) }),
  it("i04", "W-013", "selection", P, "cladding", { disposition: "new", description: "Lightweight cladding - Linea weatherboard", colour: "Surfmist, (potentially hogs bristle QS)", certainty: "preference", isDefault: true,
    answer: ans("choice", [], { state: "not_discussed", ...zone("upper_level", "Upper level") }) }),
  it("i05", "W-014", "selection", P, "roof", { disposition: "by_others", description: "surfmist 27 deg on existing,  low pitch roof sheets in surfmist to new", certainty: "proposed", isDefault: true,
    answer: ans("choice", [], { state: "not_discussed", ...zone("main_roof", "Main roof") }) }),
  it("i06", "W-015", "requirement", P, "windows", { description: "double glazed aluminium - Jolong - white frames", certainty: "proposed", responsibility: "architect", technicalStatus: "needs_verification",
    answer: ans("requirement", sel(["Glazing · Double glazing", "double_glazing", "glazing", "double_glazing"], ["Frame · Aluminium", "aluminium", "frame", "aluminium"], ["Frame colour · Light", "light", "frame_colour", "light"])) }),
  it("i07", "W-016", "requirement", P, "insulation", { description: "weathertightness system - hd2.5 walls batts - ceiling batts 6.0", certainty: "client_approved", responsibility: "consultant", technicalStatus: "needs_verification",
    evidence: { at: "2026-11-15T10:54:00Z", by: "Sam Morris" }, answer: ans("requirement", sel(["Weather-tightness system", "weather_tightness_system"])) }),
  it("i08", "W-020", "requirement", P, "hvac", { description: "existing AC for whole house - linear grilles on ceiling", certainty: "client_approved", responsibility: "client", technicalStatus: "needs_verification",
    evidence: { at: "2026-11-15T11:07:00Z", by: "Sam Morris" } }),
  it("i09", "W-003", "scope", SITE, "external", { disposition: "new", description: "Retain" }),
  it("i10", "W-010", "scope", SITE, "external", { disposition: "new", answer: ans("scope", sel(["New · Exposed aggregate", "exposed_aggregate", "new", "exposed_aggregate"]), el("el_drv", "driveway", "Driveway")) }),
  it("i11", "W-009", "requirement", SITE, "notes", { description: "Upgraded", certainty: "preference" }),
  it("i12", "W-007", "scope", SITE, "site", { description: "not sure if they want to live in - shouldn't - " }),
  it("i13", "B-009", "selection", R("b1"), "tiling", { description: "Full height 600 x 1200 tile, travertine, Feature tile - micro cement ", colour: "600 x 1200 tile, travertine look", certainty: "preference", answer: ans("choice", sel(["Full height", "full_height"])) }),
  it("i14", "B-006", "selection", R("b1"), "sanitary", { description: "Walk-in, Niche", certainty: "preference", answer: ans("choice", sel(["Walk-in · Niche", "niche", "walk_in", "niche"], ["Walk-in · Hobless", "hobless", "walk_in", "hobless"])) }),
  it("i15", "B-003", "selection", R("b1"), "sanitary", { description: "Concealed cistern - caroma ", certainty: "preference", answer: ans("choice", sel(["Concealed cistern", "concealed_cistern"])) }),
  it("i16", "B-004", "selection", R("b1"), "sanitary", { description: "Wall-hung - supplied by samious  with mirror ", certainty: "preference", answer: ans("choice", sel(["Wall-hung", "wall_hung"])) }),
  it("i17", "B-005", "selection", R("b1"), "sanitary", { description: "Inset - built in ", certainty: "preference", answer: ans("choice", sel(["Inset", "inset"])) }),
  it("i18", "K-001", "scope", R("kt"), "scope", { disposition: "new", answer: ans("scope", sel(["New kitchen", "new_kitchen"])) }),
  it("i19", "R-003", "scope", R("bd1"), "scope", { description: "sliding doors to robe in bedrooms" }),
  it("i20", "K-002", "requirement", R("kt"), "layout", { certainty: "preference", answer: ans("requirement", sel(["Island", "island"])) }),
  it("i21", "K-003", "requirement", R("kt"), "joinery", { description: "Full-height, Walk-in, Drawers", certainty: "preference" }),
  it("i22", "R-004", "requirement", R("kt"), "layout", { description: "feature range hood - meditrean curved micro cement - love the curves " }),
  it("i23", "V-002", "requirement", R("lv"), "layout", { description: "gas fire place - in door out door living continuity " }),
  it("i24", "R-004", "requirement", R("lv"), "layout", { description: "stairs - " }),
  it("i25", "M-001", "scope", { section: "mgmt" }, "procurement", { description: "client architect - and blue leaf aid" }),
  it("i26", "P-005", "requirement", P, "notes", { description: "Natural light, Space", certainty: "preference" }),
  it("i27", "W-014", "selection", P, "roof", { certainty: "preference", technicalStatus: "needs_verification",
    answer: ans("choice", sel(["Half round", "half_round"]), { ...el("el_gutters_i05", "gutters", "Gutters"), linkedItemIds: ["i05"] }) }),
  it("i28", "W-017", "selection", P, "flooring", { certainty: "preference", isDefault: true, answer: ans("choice", sel(["Timber · Engineered", "engineered", "timber", "engineered"]), zone("main_floor", "Main floor")) }),
  it("i29", "W-017", "selection", P, "flooring", { certainty: "preference", responsibility: "client", isDefault: true,
    answer: ans("choice", sel(["Carpet", "carpet"]), { state: "unresolved", unresolved: { reason: "decide_later" }, ...zone("bedroom_floor", "Bedroom floor") }) }),
  it("i30", "W-017", "selection", P, "flooring", { colour: "Travertine look", certainty: "preference", isDefault: true, answer: ans("choice", sel(["Tile · Porcelain", "porcelain", "tile", "porcelain"]), zone("wet_area_floor", "Wet-area floor")) }),
  it("i31", "W-017", "selection", P, "flooring", { colour: "Travertine look, NON SlIP", certainty: "preference", isDefault: true,
    answer: ans("choice", sel(["Tile · Porcelain", "porcelain", "tile", "porcelain"]), zone("other_zone", "Outdoor entertaining/pool surround")) }),
  it("i32", "W-019", "selection", P, "paint", { certainty: "preference", isDefault: true, answer: ans("choice", sel(["Palette · Warm", "warm", "palette", "warm"]), zone("walls", "Walls")) }),
  it("i33", "W-019", "selection", P, "paint", { certainty: "preference", isDefault: true, answer: ans("choice", sel(["Ceiling · Square set", "square_set", "ceiling", "square_set"], ["Finish level · Flat", "flat", "finish_level", "flat"]), zone("ceiling", "Ceiling")) }),
  it("i34", "W-019", "selection", P, "paint", { certainty: "preference", isDefault: true, answer: ans("choice", sel(["Palette · Warm", "warm", "palette", "warm"]), zone("trim", "Trim")) }),
  it("i35", "W-019", "selection", P, "paint", { certainty: "preference", isDefault: true, answer: ans("choice", sel(["Palette · Warm", "warm", "palette", "warm"], ["Finish level · Low sheen", "low_sheen", "finish_level", "low_sheen"]), zone("wet_area", "Wet area")) }),
  it("i36", "K-004", "selection", P, "joinery", { certainty: "preference", isDefault: true, answer: ans("choice", sel(["Flat-panel · Laminate", "laminate", "flat_panel", "laminate"]), zone("kitchen", "Kitchen")) }),
  it("i37", "K-004", "selection", P, "joinery", { certainty: "preference", isDefault: true, answer: ans("choice", sel(["Flat-panel · Laminate", "laminate", "flat_panel", "laminate"]), zone("scullery", "Scullery")) }),
  it("i38", "K-005", "selection", P, "benchtop", { certainty: "preference", responsibility: "architect", isDefault: true,
    answer: ans("choice", sel(["Engineered stone", "engineered_stone"]), { state: "unresolved", unresolved: { reason: "designer_to_confirm" }, ...zone("kitchen", "Kitchen") }) }),
  it("i39", "K-006", "selection", P, "benchtop", { isDefault: true, answer: ans("choice", [], { note: "Tiles Allowed/ Client to decide", state: "unresolved", ...zone("kitchen", "Kitchen") }) }),
  it("i40", "B-008", "selection", P, "sanitary", { disposition: "deferred", certainty: "preference", isDefault: true, answer: ans("choice", sel(["Brushed Bronze", "other"]), zone("bathroom", "Bathroom")) }),
  it("i41", "B-009", "selection", P, "tiling", { certainty: "preference", isDefault: true, answer: ans("choice", sel(["Full height", "full_height"]), zone("bathroom", "Bathroom")) }),
  it("i42", "B-003", "selection", P, "sanitary", { certainty: "preference", isDefault: true, answer: ans("choice", sel(["Concealed cistern", "concealed_cistern"]), zone("bathroom", "Bathroom")) }),
  it("i43", "B-004", "selection", P, "sanitary", { certainty: "preference", isDefault: true, answer: ans("choice", sel(["Wall-hung · One basin", "one_basin", "wall_hung", "one_basin"]), zone("bathroom", "Bathroom")) }),
  it("i44", "L-003", "selection", P, "joinery", { certainty: "preference", isDefault: true,
    answer: ans("choice", sel(["Cabinetry", "cabinetry"], ["Bench", "bench"], ["Splashback", "splashback"], ["Mixer", "mixer"], ["Trough", "trough"]), zone("laundry", "Laundry")) }),
  it("i45", "W-021", "requirement", P, "electrical", { certainty: "client_approved", evidence: { at: "2026-11-15T11:07:00Z", by: "Sam Morris" }, answer: ans("requirement", [], { note: "Already complete", state: "not_discussed" }) }),
  it("i46", "W-025", "action", P, "notes", { description: "Curved micro cement feature rangehood ", responsibility: "client" }),
  it("i47", "W-013", "selection", P, "cladding", { certainty: "preference", technicalStatus: "needs_verification", isDefault: true, answer: ans("choice", sel(["Render · Rendered AAC", "rendered_aac", "render", "rendered_aac"]), zone("main_walls", "Main walls")) }),
  it("i48", "R-003", "scope", R("e"), "scope", { disposition: "alter", answer: ans("scope", sel(["Alter", "alter"])) }),
  it("i49", "V-004", "selection", R("lv"), "windows", { certainty: "preference", answer: ans("choice", sel(["Stacker", "stacker"])) }),
  it("i50", "V-005", "scope", R("lv"), "joinery", { supplyBy: "client", answer: ans("scope", sel(["By client", "by_client"]), el("el_fire", "fireplace", "Fireplace")) }),
  it("i51", "V-005", "scope", R("lv"), "joinery", { disposition: "included", answer: ans("scope", sel(["Included", "included"]), el("el_tv", "tv_wall", "TV wall")) }),
  it("i52", "V-001", "scope", R("lv"), "scope", { disposition: "new", answer: ans("scope", sel(["New", "new"])) }),
  it("i53", "R-003", "scope", R("kt"), "scope", { disposition: "alter", answer: ans("scope", sel(["Renovate", "renovate"])) }),
  it("i54", "K-009", "requirement", R("kt"), "hvac", { certainty: "preference", answer: ans("requirement", sel(["Induction", "induction"])) }),
  it("i55", "K-001", "scope", R("pn"), "scope", { disposition: "new", answer: ans("scope", sel(["New kitchen", "new_kitchen"])) }),
  it("i56", "R-003", "scope", R("pn"), "scope", { disposition: "alter", answer: ans("scope", sel(["Renovate", "renovate"])) }),
  it("i57", "K-002", "requirement", R("pn"), "layout", { certainty: "preference", answer: ans("requirement", sel(["Pantry", "pantry"])) }),
  it("i58", "K-003", "requirement", R("pn"), "joinery", { certainty: "preference", answer: ans("requirement", sel(["Walk-in", "walk_in"], ["Appliance garage", "appliance_garage"], ["Full-height", "full_height"])) }),
  it("i59", "L-001", "scope", R("ld"), "scope", { disposition: "new", answer: ans("scope", sel(["New", "new"])) }),
  it("i60", "R-003", "scope", R("ld"), "scope", { disposition: "alter", answer: ans("scope", sel(["Alter", "alter"])) }),
  it("i61", "L-002", "requirement", R("ld"), "layout", { answer: ans("requirement", [], { state: "unresolved" }) }),
  it("i62", "R-007", "selection", R("ld"), "doors"),
  it("i63", "R-014", "scope", R("ld"), "procurement"),
  it("i64", "L-006", "scope", R("ld"), "procurement"),
  it("i65", "B-001", "scope", R("b1"), "scope", { disposition: "new", answer: ans("scope", sel(["New", "new"])) }),
  it("i66", "R-003", "scope", R("b1"), "scope", { disposition: "new", answer: ans("scope", sel(["New", "new"])) }),
  it("i67", "B-002", "requirement", R("b1"), "layout", { certainty: "preference", answer: ans("requirement", sel(["Bath", "bath"])) }),
  it("i68", "B-007", "selection", R("b1"), "sanitary", { certainty: "preference", answer: ans("choice", sel(["Freestanding", "freestanding"])) }),
  it("i69", "W-001", "scope", SITE, "site", { answer: ans("fact", sel(["Standard driveway", "standard_driveway"])) }),
  it("i70", "W-010", "scope", SITE, "external", { disposition: "new", answer: ans("scope", sel(["Replace · Steel", "steel", "replace", "steel"]), el("el_fence", "fencing", "Fencing")) }),
  it("i71", "W-010", "scope", SITE, "external", { answer: ans("scope", [], el("el_ret", "retaining", "Retaining")) }),
  it("i72", "W-010", "scope", SITE, "external", { answer: ans("scope", [], el("el_pool", "pool", "Pool")) }),
];

export const lead = { id: "00000000-0000-4000-8000-000000000417", name: "Client", stage: "consultants", job_id: null, project_type: "extension" };
export const register = { meta: { kind: "meta", version: 2, rev: 101, planRev: "DA rev 3", occupancy: "partly", renovationOverlay: false, rooms, lastRoomId: "b1", lastStep: "documents",
  baseline: { projectTier: null, categories: {} } }, items };
export const context = { owner: "lead", identity: { clientName: "Client", partnerName: null, siteAddress: "Site address", suburb: "Seaview Park", landStatus: "own_home" },
  projectType: "extension", deliveryModel: "construction_management", deliveryModelSource: "lead", stage: "consultants", stageEnteredAt: "2026-11-15T11:53:14.687+00:00",
  budget: { min: null, max: null, estimatedValue: null, financeStatus: "cash", confirmed: null, desiredStart: "2027-04-01" },
  goals: { keyRequirements: null, vision: null, excitedAbout: null, concern: null, description: null, riskFlags: [] },
  commercial: { ptsaStatus: "draft", contractStatus: null, feeProposal: null, wonSubstatus: null }, consultants: [], meetings: [], drawings: [],
  site: { council: "CITY OF SEAVIEW", zone: "Hills Neighbourhood", bushfire: true, slopeBand: null, complexity: "high", whsProfileId: null } };

/** A fresh, independent copy (tests change it freely). Items and meta go through makeItem / emptyMeta in the test. */
export const realJob = () => JSON.parse(JSON.stringify({ lead, register, context }));
