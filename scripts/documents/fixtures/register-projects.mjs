// register-projects.mjs — fictional Master Register projects for rendering and testing the controlled documents.
//
// Each project is built from real register records (makeItem / makeRoom / the Tab 21 answer configs) and goes
// through the real fixture builder (buildRegisterFixture) and renderer. Nothing here is hand-written document
// prose, so the specimens show what the Hub would actually produce. All names, addresses and references are
// fictional. No prices, no quantities, and no engineered stone (prohibited in Australia from 1 July 2024).
//
//   kestrel  — 14 Kestrel Court, Stirling (ref 0417): renovation and two-storey rear extension (the specimen project)
//   powder   — 3 Aldgate Lane, Aldgate (ref 0608): a single powder-room renovation, minimal content
//   ridgeline — 27 Ridgeline Drive, Mount Barker (ref 0631): a large new home with many rooms and selections
import { makeItem, makeRoom, emptyMeta, toggleOption } from "../../../src/lib/register.js";
import { QUESTIONS, ANSWER_CONFIG } from "../../../src/lib/registerQuestions.js";

const q = (id) => QUESTIONS.find((x) => x.id === id);
// Stable item ids (CPB-05): every record gets an id from its project prefix and its position, so the same project
// rendered as a draft, R01 and R02 prints the same register references. makeItem would otherwise mint a random id.
let PREFIX = "x", SEQ = 0;
const startProject = (prefix) => { PREFIX = prefix; SEQ = 0; };
const nextId = () => `ri_${PREFIX}_${String(++SEQ).padStart(3, "0")}`;
const pick = (id, ...paths) => paths.reduce((a, p) => toggleOption(ANSWER_CONFIG[id], a, p), null);
/** A record for a question, with the question's own kind, category and section unless overridden. */
const rec = (id, more = {}) => makeItem({ id: nextId(), itemKind: q(id).itemKind, category: q(id).category, promptKey: id, section: q(id).section === "site" ? "site" : "project", technicalStatus: q(id).technical, ...more });
const inRoom = (room, id, more = {}) => rec(id, { roomId: room.id, room: room.name, section: "room", ...more });
const EVIDENCE = { at: "2026-11-04", by: "Sam (Blue Leaf)", method: "meeting", ref: "Concept presentation, 4 Nov 2026" };

// ── 0417 · Kestrel Court ─────────────────────────────────────────────────────────────────────────────
function kestrel() {
  startProject("kc");
  const R = {
    kitchen: makeRoom({ id: "k_kitchen", name: "Kitchen and living", roomType: "kitchen", level: "Ground", order: 0, sheet: "A101" }),
    entry: makeRoom({ id: "k_entry", name: "Entry", roomType: "hall", level: "Ground", order: 1 }),
    laundry: makeRoom({ id: "k_laundry", name: "Laundry and mudroom", roomType: "laundry", level: "Ground", order: 2 }),
    main: makeRoom({ id: "k_main", name: "Main bedroom", roomType: "bedroom", level: "Upper", order: 3, sheet: "A102" }),
    ensuite: makeRoom({ id: "k_ensuite", name: "Ensuite", roomType: "ensuite", level: "Upper", order: 4 }),
    wir: makeRoom({ id: "k_wir", name: "Walk-in robe", roomType: "wir", level: "Upper", order: 5 }),
    bed2: makeRoom({ id: "k_bed2", name: "Bedroom 2", roomType: "bedroom", level: "Ground", order: 6, scope: "existing" }),
  };
  const priorities = rec("P-005", { answer: { ...pick("P-005", ["natural_light"], ["entertaining"], ["storage"]), clientNote: "We want the kitchen, living and garden to feel like one space, and we need far better storage for two growing kids." } });
  const floorDefault = rec("W-017", { isDefault: true, certainty: "preference", description: "Engineered timber-look flooring through the main living areas" });
  const items = [
    priorities,
    // Scope of works
    inRoom(R.kitchen, "R-003", { disposition: "new", description: "New open-plan kitchen, living and dining in the ground-floor extension, opening to the rear garden" }),
    inRoom(R.main, "R-003", { disposition: "new", description: "New main bedroom in the upper-level extension, overlooking the garden" }),
    inRoom(R.ensuite, "B-001", { disposition: "new", description: "New ensuite with a walk-in shower and a freestanding bath" }),
    inRoom(R.wir, "R-003", { disposition: "new", description: "New walk-in robe between the main bedroom and the ensuite" }),
    inRoom(R.laundry, "R-003", { disposition: "alter", description: "Reconfigure the existing laundry as a laundry and mudroom with built-in storage and a bench for school bags" }),
    inRoom(R.entry, "R-003", { disposition: "alter", description: "Rework the entry so the existing hallway leads straight into the new living spaces" }),
    rec("W-004", { disposition: "remove", description: "Remove the rear wall and the existing lean-to laundry" }),
    rec("W-010", { disposition: "new", description: "New covered alfresco area connected to the rear living spaces" }),
    rec("W-006", { disposition: "make_good", description: "Make good existing floors and walls where they meet the extension" }),
    // Boundaries
    rec("W-004", { disposition: "retain", description: "Front bedrooms and the street-facing facade" }),
    rec("W-006", { disposition: "retain", description: "Existing jarrah floors in the front hall and bedrooms, protected during the works" }),
    inRoom(R.bed2, "R-002", { disposition: "retain", description: "No work planned in this room" }),
    rec("P-006", { disposition: "excluded", description: "Swimming pool" }),
    rec("W-010", { disposition: "excluded", description: "Detached studio at the rear of the block" }),
    rec("P-006", { disposition: "deferred", description: "Landscaping beyond the immediate alfresco area" }),
    rec("W-010", { disposition: "by_others", description: "Boundary fencing, being arranged with the neighbour" }),
    inRoom(R.kitchen, "K-008", { supplyBy: "client", description: "Fridge and coffee machine" }),
    rec("P-006", { disposition: "undecided", description: "Roof over the side path between the house and the garage" }),
    rec("W-005", { technicalStatus: "needs_verification", responsibility: "consultant", category: "existing", description: "Condition of the roof framing over the retained front rooms" }),
    rec("W-011", { technicalStatus: "needs_verification", responsibility: "consultant", category: "structure", description: "Footings under the rear wall, unknown until the wall is opened up" }),
    // Facts
    rec("W-001", { answer: pick("W-001", ["steep_access"], ["narrow_or_restricted_access"]) }),
    rec("W-007", { answer: pick("W-007", ["yes"]) }),
    // Preferences
    rec("W-013", { isDefault: true, certainty: "preference", description: "Horizontal fibre-cement cladding to the extension, with a timber-look batten feature at the entry" }),
    rec("W-014", { isDefault: true, certainty: "preference", description: "Light-grey metal roof to the extension, with matching gutters" }),
    inRoom(R.kitchen, "R-007", { certainty: "proposed", description: "Dark slimline window frames, with large north-facing glazing to the living area" }),
    floorDefault,
    inRoom(R.main, "R-005", { certainty: "preference", overridesDefaultId: floorDefault.id, description: "Wool carpet" }),
    rec("W-019", { isDefault: true, certainty: "preference", description: "Calm neutral walls with matte finishes" }),
    inRoom(R.kitchen, "K-004", { certainty: "preference", description: "Large central island and a walk-in butler's pantry, with cabinetry finishes still to be developed" }),
    inRoom(R.kitchen, "K-005", { certainty: "client_approved", evidence: EVIDENCE, description: "Porcelain benchtop with a waterfall end to the island" }),
    inRoom(R.ensuite, "B-007", { certainty: "preference", description: "Freestanding bath" }),
    inRoom(R.ensuite, "B-006", { certainty: "preference", description: "Walk-in shower with a frameless screen" }),
    inRoom(R.ensuite, "B-005", { certainty: "preference", description: "Above-counter basin", nextAction: "Confirm the basin style once the vanity is drawn", responsibility: "client" }),
    // Requirements and goals
    rec("W-015", { description: "Good daylight to the living areas, with glazing performance coordinated with the energy assessment" }),
    rec("W-016", { description: "An airtight, well-insulated extension that stays comfortable year-round" }),
    rec("W-020", { description: "Ducted heating and cooling with separate zones for upstairs and downstairs" }),
    // Decisions
    rec("P-009", { description: "Extension footprint", nextAction: "Confirm the extension footprint and how the new floor levels meet the existing house, after reviewing the concept drawings", responsibility: "client" }),
    rec("W-025", { description: "Ensuite heating", nextAction: "Decide whether underfloor heating in the ensuite is included in the developed scope", responsibility: "client" }),
    inRoom(R.kitchen, "K-012", { description: "Appliance package", nextAction: "Choose the appliance package so the kitchen joinery layout can be finalised", responsibility: "client" }),
    rec("W-025", { description: "Envelope review", nextAction: "Review the cladding and glazing direction against the energy assessment before design development", responsibility: "blue_leaf" }),
    rec("P-009", { description: "Alfresco timing", nextAction: "Confirm whether the alfresco works go ahead now or wait for the wider landscaping", responsibility: "client" }),
    rec("P-009", { description: "Stair options", nextAction: "Develop two stair location options for the extension", responsibility: "architect" }),
    rec("W-025", { description: "Site access", nextAction: "Agree the construction access route with the neighbour at 16 Kestrel Court" }),
  ];
  return {
    projectRef: "0417",
    lead: { id: "0f17c0de-0417-4000-8000-000000000417", stage: "winning_offer", job_id: null },
    context: {
      identity: { clientName: "Jordan & Mia Whitcombe", siteAddress: "14 Kestrel Court, Stirling SA 5152", suburb: "Stirling" },
      projectType: "renovation", deliveryModel: "design_build", engagementPathway: "design_build",
      goals: {
        description: "The proposed renovation will open the existing ground floor to the rear garden and add a two-storey extension, with connected family living below and a new main bedroom suite above. The aim is to keep the character of the existing home while making everyday spaces brighter, more practical and comfortable all year round.",
        vision: "A calm, contemporary addition with durable exterior materials, generous northern daylight, natural internal finishes and a practical kitchen at the centre of family life.",
      },
      commercial: { ptsaStatus: "draft" },
      consultants: [], drawings: [{ filename: "Concept Set C-02.pdf", revision: "C-02", issuer: "Studio Example" }],
    },
    register: { meta: emptyMeta({ planRev: "Concept Set C-02, 28 October 2026", occupancy: "partly", rooms: Object.values(R) }), items },
  };
}

// ── 0608 · Aldgate powder room (short) ───────────────────────────────────────────────────────────────
function powder() {
  startProject("al");
  const pr = makeRoom({ id: "p_powder", name: "Powder room", roomType: "wc", level: "Ground", order: 0 });
  return {
    projectRef: "0608",
    lead: { id: "0f17c0de-0608-4000-8000-000000000608", stage: "winning_offer", job_id: null },
    context: {
      identity: { clientName: "Priya Raman", siteAddress: "3 Aldgate Lane, Aldgate SA 5154", suburb: "Aldgate" },
      projectType: "renovation", deliveryModel: "build_only", engagementPathway: "design_build",
      goals: { description: "Renovate the ground-floor powder room so it suits guests and is easier to clean." },
      commercial: { ptsaStatus: null }, consultants: [], drawings: [],
    },
    register: { meta: emptyMeta({ planRev: "Measured sketch, 6 November 2026", rooms: [pr] }), items: [
      rec("P-005", { answer: pick("P-005", ["low_maintenance"]) }),
      inRoom(pr, "B-001", { disposition: "new", description: "Full renovation of the powder room, keeping the existing door position" }),
      inRoom(pr, "B-003", { certainty: "preference", description: "Wall-hung toilet with a concealed cistern" }),
      inRoom(pr, "B-009", { certainty: "preference", description: "Large-format porcelain floor tiles in a warm grey" }),
      inRoom(pr, "B-015", { description: "Vanity size", nextAction: "Choose between a wall-hung vanity and a corner basin", responsibility: "client" }),
    ] },
  };
}

// ── 0631 · Ridgeline Drive new home (long) ───────────────────────────────────────────────────────────
function ridgeline() {
  startProject("rd");
  const names = [["Kitchen", "kitchen"], ["Scullery", "scullery"], ["Living", "living"], ["Dining", "dining"], ["Family", "family"], ["Study", "study"], ["Main bedroom", "bedroom"],
    ["Ensuite", "ensuite"], ["Walk-in robe", "wir"], ["Bedroom 2", "bedroom"], ["Bedroom 3", "bedroom"], ["Bedroom 4", "bedroom"], ["Bathroom", "bathroom"], ["Laundry", "laundry"], ["Garage", "garage"]];
  const rooms = names.map(([name, roomType], i) => makeRoom({ id: `r_${i}`, name, roomType, level: i < 6 || i > 12 ? "Ground" : "Upper", order: i }));
  const by = Object.fromEntries(rooms.map((r) => [r.name, r]));
  const items = [
    rec("P-005", { answer: { ...pick("P-005", ["comfort"], ["natural_light"], ["low_maintenance"]), clientNote: "A home that is warm in winter, cool in summer and simple to look after as we get older." } }),
    rec("P-006", { disposition: "included", description: "New two-storey home with a double garage on a sloping block" }),
    ...rooms.map((r) => inRoom(r, "R-003", { disposition: "new", description: `New ${r.name.toLowerCase()} as shown on the concept plans` })),
    rec("W-010", { disposition: "new", description: "Driveway, paths and a covered outdoor living area off the family room" }),
    rec("W-010", { disposition: "excluded", description: "Pool and pool fencing" }),
    rec("W-010", { disposition: "by_others", description: "Landscaping and irrigation, by the client's landscaper" }),
    rec("W-022", { supplyBy: "client", description: "Loose furniture, window furnishings and the home theatre system" }),
    rec("W-005", { technicalStatus: "needs_verification", responsibility: "consultant", category: "site", description: "Soil classification and the retaining needed on the sloping block" }),
    rec("W-001", { answer: pick("W-001", ["steep_access"], ["crane_or_plant_access"]) }),
    rec("W-013", { isDefault: true, certainty: "preference", description: "Face brick to the lower level with lightweight cladding above" }),
    rec("W-013", { isDefault: true, certainty: "preference", description: "Vertical timber-look feature cladding at the entry" }),
    rec("W-014", { isDefault: true, certainty: "proposed", description: "Dark metal roof with concealed gutters" }),
    rec("W-017", { isDefault: true, certainty: "preference", description: "Engineered oak flooring to the living areas, carpet to the bedrooms" }),
    rec("W-019", { isDefault: true, certainty: "preference", description: "Warm white walls with a soft feature colour in the study" }),
    inRoom(by.Kitchen, "K-004", { certainty: "preference", description: "Two-tone cabinetry with timber-look uppers and painted lowers" }),
    inRoom(by.Kitchen, "K-005", { certainty: "client_approved", evidence: EVIDENCE, description: "Granite benchtops with a 40 mm edge" }),
    inRoom(by.Kitchen, "K-006", { certainty: "preference", description: "Handmade-look tile splashback" }),
    inRoom(by.Kitchen, "K-007", { certainty: "proposed", description: "Undermount sink with a matte black mixer" }),
    inRoom(by.Scullery, "K-004", { certainty: "preference", description: "Open shelving and a second sink in the scullery" }),
    ...["Ensuite", "Bathroom"].flatMap((rn) => [
      inRoom(by[rn], "B-003", { certainty: "preference", description: "Wall-hung toilet" }),
      inRoom(by[rn], "B-004", { certainty: "preference", description: "Floating timber-look vanity with a porcelain top" }),
      inRoom(by[rn], "B-006", { certainty: "preference", description: "Walk-in shower with a linear floor waste" }),
      inRoom(by[rn], "B-008", { certainty: "preference", description: "Brushed nickel tapware" }),
      inRoom(by[rn], "B-009", { certainty: "preference", description: "Matte porcelain floor tiles with a feature wall behind the vanity" }),
    ]),
    inRoom(by.Ensuite, "B-007", { certainty: "preference", description: "Freestanding bath under the window" }),
    inRoom(by.Laundry, "R-009", { certainty: "preference", description: "Full-height laundry cabinetry with a hanging space" }),
    inRoom(by.Study, "R-006", { certainty: "preference", description: "Built-in desk and shelving along one wall" }),
    inRoom(by.Family, "R-007", { certainty: "proposed", description: "Stacking doors to the outdoor living area" }),
    inRoom(by.Garage, "R-007", { certainty: "preference", description: "Sectional garage door in a colour to match the roof" }),
    rec("W-015", { description: "Double glazing throughout, with larger openings facing north" }),
    rec("W-016", { description: "Airtight building envelope with high-performance insulation" }),
    rec("W-020", { description: "Ducted reverse-cycle heating and cooling, zoned by level" }),
    inRoom(by.Kitchen, "K-002", { description: "Island seating for four, and the cooktop facing the family room" }),
    rec("P-009", { description: "Driveway gradient", nextAction: "Confirm the driveway gradient and garage floor level once the site survey is complete", responsibility: "blue_leaf" }),
    rec("P-009", { description: "Study use", nextAction: "Confirm whether the study needs to work as a fifth bedroom later, which affects the window and robe", responsibility: "client" }),
    inRoom(by.Kitchen, "K-012", { description: "Appliances", nextAction: "Choose the appliance brand so the kitchen and scullery joinery can be drawn", responsibility: "client" }),
    rec("W-025", { description: "Solar", nextAction: "Decide whether solar panels and a battery are included now or allowed for later", responsibility: "client" }),
    rec("W-025", { description: "Ceiling height", nextAction: "Confirm the upper-level ceiling height, which affects the roof form and the stair", responsibility: "client" }),
    rec("W-025", { description: "Retaining", nextAction: "Agree the extent of retaining walls with the engineer's site classification", responsibility: "blue_leaf" }),
    rec("P-009", { description: "Colour palette", nextAction: "Confirm the exterior colour palette after seeing samples on site", responsibility: "client" }),
  ];
  return {
    projectRef: "0631",
    lead: { id: "0f17c0de-0631-4000-8000-000000000631", stage: "winning_offer", job_id: null },
    context: {
      identity: { clientName: "Alexander and Catherine Montgomery-Hargreaves", siteAddress: "27 Ridgeline Drive, Mount Barker SA 5251", suburb: "Mount Barker" },
      projectType: "new_build", deliveryModel: "design_build", engagementPathway: "design_build",
      goals: {
        description: "A new two-storey family home on a north-facing sloping block, with living areas that open to the garden and views, four bedrooms, a study and a double garage. The family wants a home built to a high standard of comfort and energy performance that will suit them for the long term.",
        vision: "Warm, natural materials, a strong connection to the outdoors and a simple, low-maintenance exterior.",
      },
      commercial: { ptsaStatus: "draft" }, consultants: [], drawings: [],
    },
    register: { meta: emptyMeta({ planRev: "Concept plans Rev B, 30 October 2026", rooms }), items },
  };
}

export const REGISTER_PROJECTS = { kestrel, powder, ridgeline };

/**
 * Kestrel Court's R02 (independent review CPB2-04): the clients have since had their own plans prepared, so the
 * pathway becomes plans supplied and the brief is reissued against the supplied set. The drawing basis is the recorded
 * set, printed as recorded; it is never inferred from the stage. R01 keeps the concept set it was issued against.
 */
export const KESTREL_SUPPLIED_PLANS = "Supplied plans A-100 Rev D, 10 November 2026";
export function plansSuppliedRevision(p) {
  p.context.engagementPathway = "plans_supplied";
  p.lead.stage = "consultants";
  p.register.meta.planRev = KESTREL_SUPPLIED_PLANS;
  p.context.drawings = [{ filename: "Supplied plans A-100 Rev D.pdf", revision: "Rev D", issuer: "Studio Example" }];
  // The decisions recorded at concept are brought up to date against the supplied plans (review CPB3-H01): the same
  // records (same ids and references), with next actions that no longer point at concept drawings or design development.
  const next = { "Extension footprint": "Confirm how the new floor levels meet the existing house, using the supplied plans",
    "Ensuite heating": "Decide whether underfloor heating in the ensuite is included in the scope for pricing",
    "Envelope review": "Check the cladding and glazing on the supplied plans against the energy assessment before pricing" };
  for (const i of p.register.items) if (next[i.description]) i.nextAction = next[i.description];
  return p;
}
