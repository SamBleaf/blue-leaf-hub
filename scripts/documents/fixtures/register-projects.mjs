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
  // The floor default covers the main living areas: the main-floor zone, as its words say, so a bedroom doesn't read it.
  const floorDefault = rec("W-017", { isDefault: true, certainty: "preference", description: "Engineered timber-look flooring through the main living areas", answer: { zone: { key: "main_floor", label: "Main floor" } } });
  const items = [
    priorities,
    // Scope of works
    inRoom(R.kitchen, "R-003", { disposition: "new", description: "New open-plan kitchen, living and dining in the ground-floor extension, opening to the rear garden" }),
    inRoom(R.main, "R-003", { disposition: "new", description: "New main bedroom in the upper-level extension, overlooking the garden" }),
    inRoom(R.ensuite, "B-001", { disposition: "new", description: "New ensuite with a walk-in shower and a freestanding bath" }),
    inRoom(R.wir, "R-003", { disposition: "new", description: "New walk-in robe between the main bedroom and the ensuite" }),
    inRoom(R.laundry, "R-003", { disposition: "alter", description: "Reconfigure the existing laundry as a laundry and mudroom with built-in storage and a bench for school bags" }),
    inRoom(R.entry, "R-003", { disposition: "alter", description: "Rework the entry so the existing hallway leads straight into the new living spaces" }),
    rec("W-004", { disposition: "remove", description: "Remove the rear wall and the existing lean-to" }),
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
      inRoom(pr, "B-001", { disposition: "new", description: "Full renovation, keeping the existing door position" }),
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
    rec("W-010", { disposition: "by_others", description: "Landscaping and irrigation, by a separate landscaper" }),
    rec("W-022", { supplyBy: "client", description: "Loose furniture, window furnishings and the home theatre system" }),
    rec("W-005", { technicalStatus: "needs_verification", responsibility: "consultant", category: "site", description: "Soil classification and the retaining needed on the sloping block" }),
    rec("W-001", { answer: pick("W-001", ["steep_access"], ["crane_or_plant_access"]) }),
    rec("W-013", { isDefault: true, certainty: "preference", description: "Face brick to the lower level with lightweight cladding above" }),
    rec("W-013", { isDefault: true, certainty: "preference", description: "Vertical timber-look feature cladding at the entry" }),
    rec("W-014", { isDefault: true, certainty: "proposed", description: "Dark metal roof with concealed gutters" }),
    rec("W-017", { isDefault: true, certainty: "preference", description: "Engineered oak flooring to the living areas, carpet to the bedrooms" }),
    rec("W-019", { isDefault: true, certainty: "preference", description: "Warm white walls throughout" }),
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
    // The study's built-ins are joinery work in the study (R-009 is scope, not a finish); its feature colour is the
    // study's own wall finish (owner, ADB-03).
    inRoom(by.Study, "R-009", { disposition: "new", description: "Built-in desk and shelving along one wall" }),
    inRoom(by.Study, "R-006", { certainty: "preference", description: "Soft feature colour to one wall" }),
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
        description: "A new two-storey family home on a north-facing sloping block, with living areas that open to the garden and views, four bedrooms, a study and a double garage. The aim is a home built to a high standard of comfort and energy performance that will suit the family for the long term.",
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

/**
 * Kestrel Court at design coordination, for the Architect Design Brief: the PTSA is signed and the design team is
 * engaged (architect, engineer, energy assessor, all fictional), and the register carries what the Consultants stage
 * records: the design team's open requests, an approved glazing requirement, and the documents on file. The same
 * records as the client brief (same ids and references), brought forward; nothing here is prose for the document.
 */
export const KESTREL_DESIGN_TEAM = [
  { role: "architect", status: "engaged", name: "Mara Ellison", company: "Ellison Architecture" },
  { role: "engineer", status: "engaged", name: "Dev Corbett", company: "Corbett Structural" },
  { role: "consultant", status: "engaged", name: "Lena Ruiz", company: "Hills Energy Rating" },
];
export function designCoordination(p) {
  p.lead.stage = "consultants";
  p.context.commercial = { ...(p.context.commercial || {}), ptsaStatus: "signed" };
  p.context.consultants = KESTREL_DESIGN_TEAM;
  // In the shape the register context gives them (revision, reviewStatus: registerContext.mjs).
  p.context.drawings = [
    { filename: "Concept Set C-02.pdf", revision: "C-02", issuer: "Ellison Architecture", reviewStatus: "reconciled" },
    { filename: "Feature and level survey SV-14.pdf", revision: "A", issuer: "Hills Surveying", reviewStatus: "reconciled" },
    { filename: "Structural advice S-01.pdf", revision: "1", issuer: "Corbett Structural", reviewStatus: "under_review" },
    { filename: "Concept Set C-01.pdf", revision: "C-01", issuer: "Ellison Architecture", reviewStatus: "superseded" },
  ];
  const by = (desc) => p.register.items.find((i) => i.description === desc);
  const set = (desc, fields) => { const i = by(desc); if (!i) throw new Error(`designCoordination: no record "${desc}"`); Object.assign(i, fields); return i; };
  // The concept presentation settled the glazing intent; the client approved it at the PTSA meeting.
  set("Good daylight to the living areas, with glazing performance coordinated with the energy assessment",
    { certainty: "client_approved", evidence: { at: "2026-11-11", by: "Sam (Blue Leaf)", method: "meeting", ref: "PTSA meeting, 11 Nov 2026" }, technicalStatus: "needs_verification", responsibility: "consultant" });
  // The design team's open items, on the records they belong to.
  set("Stair options", { nextAction: "Develop two stair location options for the extension, showing how each meets the existing hallway" });
  set("Dark slimline window frames, with large north-facing glazing to the living area",
    { responsibility: "architect", nextAction: "Size the north-facing glazing once the energy model is back, and show the frame colour on the elevations" });
  set("Large central island and a walk-in butler's pantry, with cabinetry finishes still to be developed",
    { responsibility: "architect", nextAction: "Show the island, the butler's pantry and the appliance positions on the next kitchen plan" });
  set("Condition of the roof framing over the retained front rooms",
    { nextAction: "Inspect the roof framing over the retained front rooms and advise on any strengthening before the new roof ties in" });
  set("Footings under the rear wall, unknown until the wall is opened up",
    { nextAction: "Confirm the footing design under the new rear opening; allow for a hold point once the wall is opened up" });
  set("An airtight, well-insulated extension that stays comfortable year-round",
    { responsibility: "consultant", nextAction: "Model the extension's walls, roof and glazing for the energy assessment, and advise on insulation and airtightness" });
  set("Make good existing floors and walls where they meet the extension",
    { responsibility: "architect", nextAction: "Detail how the new floor level meets the existing jarrah floors at the extension junction" });
  // Decided at the PTSA meeting, so no longer open; Blue Leaf's envelope review is now the energy assessor's model.
  set("Extension footprint", { resolved: true, nextAction: "" });
  set("Envelope review", { resolved: true, nextAction: "" });
  return p;
}

// ── Supplier evidence (Pair 2: Technical Selections Schedule + Client Selections Presentation) ──────────
// FIXTURE POLICY (docs/documents/SELECTIONS_SPEC.md §8). The product data below is copied from the ZJ example documents
// in Dropbox (SALES/ZJ EXAMPLE MATERIAL): Rylock quotation RM-6403 Ver 1, the TLI lighting legend and Routleys product
// selection 452499. A product line is the supplier's words exactly as printed (truncation "..." kept), with its
// labelled sizes; the only change is a finish split from the end of a Routleys line ("… in Brushed Nickel"). What a
// person had to decide is marked "staff:" beside it: which room a supplier's line belongs to, a manufacturer read from
// the warranty web address printed on the line, a plain description for the client where the supplier wrote only
// capitals or codes, and a client label and description (owner decision 8) for what the presentation prints. One record
// per product the client chooses, including the visible accessories they choose (towel rails, roll holders, flush
// buttons, wastes, grates: owner decision 6); concealed rough-in parts (isolating cocks, isolation stops) stay in the
// supplier's document, which the record cites.
// Approvals, dates and recipients are this fictional project's, like every other record in this file.
const custom = (id, fields) => makeItem({ id, itemKind: "selection", section: "project", category: "notes", ...fields });   // the register's "Add item"
const X = " × ";   // a size never breaks across lines

/** Kestrel Court at design coordination, with the Rylock quote and the TLI legend received (after designCoordination). */
export const KESTREL_SOURCES = {
  rylock: { id: "doc_kc_rylock", filename: "Rylock quotation RM-6403 Ver 1.pdf", type: "supplier_document", discipline: "windows", issuer: "Rylock", docNumber: "RM-6403", revision: "Ver 1", receivedAt: "2026-11-12", reviewStatus: "under_review" },
  // The legend prints no job, date, number or revision; "TLI" only as its codes' prefix (staff: issuer entered at upload).
  tli: { id: "doc_kc_tli", filename: "TLI lighting legend.pdf", type: "supplier_document", discipline: "tli", issuer: "TLI", docNumber: null, revision: null, receivedAt: "2026-11-13", reviewStatus: "received" },
};
export function kestrelSupplierEvidence(p) {
  const S = KESTREL_SOURCES;
  // Ids on the documents on file, so a record can cite one (sourceDocId), as the Documents step does.
  const ids = { "Concept Set C-02.pdf": "doc_kc_c02", "Feature and level survey SV-14.pdf": "doc_kc_sv14", "Structural advice S-01.pdf": "doc_kc_s01", "Concept Set C-01.pdf": "doc_kc_c01" };
  p.context.drawings = [...p.context.drawings.map((d) => ({ ...d, id: ids[d.filename] || d.id, docNumber: d.docNumber || null })), S.rylock, S.tli];
  const R = Object.fromEntries((p.register.meta.rooms || []).map((r) => [r.id, r]));
  const by = (desc) => p.register.items.find((i) => i.description === desc);
  const cite = (doc) => ({ sourceDocId: doc.id, source: [doc.issuer, doc.docNumber, doc.revision].filter(Boolean).join(" ") || doc.filename.replace(/\.pdf$/i, "") });
  // Rylock item 2 (COMMENTS "LIVING"; staff: the kitchen and living room): the corner window the record proposes.
  // The quote's frame colour is "CHOOSE FINISH", so no finish is recorded; choosing it is the client's (ri_kc_s03).
  Object.assign(by("Dark slimline window frames, with large north-facing glazing to the living area"), {
    product: "CS DESIGN FIXED LIGHT BUTT JOIN 90 DEG EXTERNAL, Height 2700" + X + "Width 1950, Depth 165MM", supplier: "Rylock", model: "quote item 2", ...cite(S.rylock),
    clientLabel: "Corner window", clientDescription: "Fixed glass corner window to the living area, 2.7 m high" });   // staff: client wording
  // The cabinetry still cites the superseded concept set: the draft flags it and issue is refused until it is relinked.
  Object.assign(by("Large central island and a walk-in butler's pantry, with cabinetry finishes still to be developed"), { sourceDocId: "doc_kc_c01", source: "Concept Set C-01" });
  p.register.items.push(
    // Rylock item 1 (COMMENTS "PANTRY - OPEN IN DOOR"; staff: the kitchen's butler's pantry). Handing as the quote states
    // it, with its viewpoint ("displayed from the outside, looking inwards").
    makeItem({ id: "ri_kc_s01", itemKind: "selection", category: "doors", promptKey: "R-007", section: "room", roomId: R.k_kitchen.id, room: R.k_kitchen.name, certainty: "proposed",
      description: "Door from the butler's pantry",
      clientLabel: "Pantry door", clientDescription: "Glazed hinged door from the butler's pantry, opening in",   // staff: client wording
      product: "CS Hinged Door Open In LHH (Lock on Right, Hinges Left, viewed from outside), Height 2400" + X + "Width 935, Depth 165, Tapered Lever BLACK (935MM FRAME SUITS 820MM DOOR)",
      supplier: "Rylock", model: "quote item 1", responsibility: "blue_leaf", nextAction: "Confirm the overall frame depth with Rylock: the quote leaves it to the builder (\"TBA ...Builder to confirm Overall Frame Depth\")", ...cite(S.rylock) }),
    // Rylock item 4 (COMMENTS "ENSUITE").
    makeItem({ id: "ri_kc_s02", itemKind: "selection", category: "doors", promptKey: "R-007", section: "room", roomId: R.k_ensuite.id, room: R.k_ensuite.name, certainty: "proposed",
      description: "Ensuite window, with privacy glass",
      clientLabel: "Ensuite window", clientDescription: "Awning window with privacy glass and a black winder",   // staff: client wording
      product: "AA 65 SERIES CHAINWINDER AWNING OVO, Height 600" + X + "Width 2400, Depth 165MM, SAFETY TOUGHENED PRIVACY 4/12/4mm, Operator Colour BLACK",
      supplier: "Rylock", model: "quote item 4", ...cite(S.rylock) }),
    // Quote-wide points, as action records citing the quote (the register gives a W-025 action no trade category).
    makeItem({ id: "ri_kc_s03", itemKind: "action", category: "notes", promptKey: "W-025", section: "project", description: "Window frame colour",
      responsibility: "client", nextAction: "Choose the frame colour for the new windows and doors", ...cite(S.rylock) }),
    makeItem({ id: "ri_kc_s04", itemKind: "action", category: "notes", promptKey: "W-025", section: "project", description: "Glazing performance",
      responsibility: "trade", nextAction: "Provide the glazing U-value and SHGC for each item: the quote gives none, and says the energy report wasn't sighted", ...cite(S.rylock) }),
    makeItem({ id: "ri_kc_s05", itemKind: "action", category: "notes", promptKey: "W-025", section: "project", description: "Rylock quote note",
      responsibility: "trade", nextAction: "Explain what \"BUILDER TO C.O.S\" on quote item 2 requires", ...cite(S.rylock) }),
    // TLI legend: one record per legend line, added by hand (no library question covers lighting). The legend has no
    // rooms (only the pendants name one) and keys a lighting plan not yet received, so a fitting's room isn't known; its
    // quantity is TLI's whole-plan total. The legend line is the product; its key is the code.
    // staff: client wording read from the code (WH white, 3K warm white), to confirm with TLI before it is shown.
    custom("ri_kc_s06", { certainty: "proposed", description: "Downlights", product: "TLI-D700+-10.6W-WH-3K", model: "DL.2", supplier: "TLI", quantity: 46, unit: "EA", ...cite(S.tli),
      clientDescription: "Recessed LED downlights, white, warm-white light" }),
    custom("ri_kc_s07", { certainty: "proposed", description: "Wall lights", product: "TLI-ORB-B-3W-WH-3K", model: "WL.1", supplier: "TLI", quantity: 5, unit: "EA", ...cite(S.tli),
      clientDescription: "Round LED wall lights, white, warm-white light" }),
    // "( PL.1 ) - ( Entrance / Entry Hall ) TBC by Designer" (staff: the Entry; the designer is the architect on file).
    // TLI isn't their supplier: the legend leaves them to the designer and the electrician (QA K-01).
    custom("ri_kc_s08", { roomId: R.k_entry.id, room: R.k_entry.name, section: "room", description: "Entry pendants", model: "PL.1", quantity: 3, unit: "EA",
      responsibility: "architect", nextAction: "Select the entry pendants: TLI's legend leaves them to the designer (\"( PL.1 ) - ( Entrance / Entry Hall ) TBC by Designer\")", ...cite(S.tli) }),
    custom("ri_kc_s09", { description: "Exhaust fans", quantity: 5, unit: "EA",
      responsibility: "trade", nextAction: "Select the exhaust fans: TLI's legend leaves them to the electrician (\"Exhaust Fan TBC by Electrician\")", ...cite(S.tli) }),
  );
  return p;
}

/** Ridgeline Drive at tender, with Routleys selection 452499 reconciled to the register. */
export const RIDGELINE_SOURCES = {
  // Routleys prints no revision; the selection number identifies it (staff: entered at upload).
  routleys: { id: "doc_rd_routleys", filename: "Routleys product selection 452499.pdf", type: "supplier_document", discipline: "routleys", issuer: "Routleys", docNumber: "452499", revision: null, receivedAt: "2026-11-14", reviewStatus: "reconciled" },
  plans: { id: "doc_rd_dd02", filename: "Developed design DD-02.pdf", type: "working_drawings", discipline: "architect", issuer: "Studio Example", docNumber: "DD-02", revision: "B", receivedAt: "2026-11-10", reviewStatus: "reconciled" },
};
export function ridgelineTender(p) {
  const S = RIDGELINE_SOURCES;
  p.lead.stage = "tender";
  p.context.commercial = { ...(p.context.commercial || {}), ptsaStatus: "signed" };
  p.register.meta.planRev = "Developed design DD-02 Rev B, 10 November 2026";
  p.context.drawings = [S.plans, S.routleys];
  const R = Object.fromEntries((p.register.meta.rooms || []).map((r) => [r.name, r]));
  const find = (room, promptKey) => p.register.items.find((i) => i.roomId === R[room]?.id && i.promptKey === promptKey);
  const set = (room, promptKey, fields) => { const i = find(room, promptKey); if (!i) throw new Error("ridgelineTender: no " + promptKey + " in " + room); Object.assign(i, fields); return i; };
  const routleys = { supplier: "Routleys", supplyBy: "blue_leaf", sourceDocId: S.routleys.id, source: "Routleys 452499" };
  const meeting = { at: "2026-11-14", by: "Sam (Blue Leaf)", method: "meeting", ref: "Selections meeting, 14 Nov 2026" };
  // staff: the maker, read from the warranty web address printed on the line ("visit caroma.com.au", "visit greenstapware.com.au").
  const CAROMA = "Caroma", GREENS = "Greens Tapware";
  let n = 0;
  const line = (room, promptKey, fields) => makeItem({ id: "ri_rd_s" + String(++n).padStart(2, "0"), itemKind: "selection", category: "sanitary", promptKey, section: "room", roomId: R[room].id, room, ...routleys, ...fields });
  // KITCHEN (staff: Routleys' KITCHEN is the kitchen). 65821 sink and 68845 mixer. The record's earlier direction was an
  // undermount sink and a matte black mixer: both stay on the record, and the change is the client's to confirm.
  // staff: every client label and description below is Blue Leaf's wording of the supplier's line.
  set("Kitchen", "K-007", { ...routleys, product: "Acero+ 860 Single Bowl Inset Sink 1 Tap Hole Left Hand End Bowl", colour: "Stainless Steel", model: "65821", quantity: 1,
    clientLabel: "Kitchen sink", clientDescription: "Acero+ single-bowl inset sink, stainless steel",
    responsibility: "client", nextAction: "Confirm the inset sink and brushed nickel mixer Routleys selected, in place of the undermount sink and matte black mixer recorded earlier" });
  // ENSUITE and BATHROOM (staff: Routleys' rooms of the same names).
  set("Ensuite", "B-008", { ...routleys, certainty: "client_approved", evidence: meeting, manufacturer: GREENS, product: "Maci Wall Bath / Basin Mixer Set with 180mm Spout", colour: "Brushed Nickel", model: "62397", quantity: 2,
    clientLabel: "Basin mixers", clientDescription: "Maci wall-mounted basin mixers with a 180 mm spout" });
  set("Bathroom", "B-008", { ...routleys, certainty: "client_approved", evidence: meeting, manufacturer: GREENS, product: "Maci Wall Bath / Basin Mixer Set with 180mm Spout", colour: "Brushed Nickel", model: "62397", quantity: 1,
    clientLabel: "Basin mixer", clientDescription: "Maci wall-mounted basin mixer with a 180 mm spout" });
  // 57525: the line is cut off on the page ("...Vogue Soft Close Seat..."), and the suite is back-to-wall where the
  // record's direction was wall-hung.
  set("Ensuite", "B-003", { ...routleys, certainty: "proposed", manufacturer: CAROMA, product: "Urbane II Cleanflush Back To Wall Toilet Suite Back inlet with Vogue Soft Close Seat...", model: "57525", quantity: 1,
    clientDescription: "Caroma Urbane II back-to-wall toilet suite with a soft-close seat",
    responsibility: "client", nextAction: "Confirm the back-to-wall toilet Routleys selected for the ensuite, in place of the wall-hung toilet recorded earlier" });
  p.register.items.push(
    line("Kitchen", "K-007", { certainty: "proposed", product: "Luxe LF Pull Down Sink Mixer", colour: "Brushed Nickel", model: "68845", quantity: 1,   // staff: finish split without "in"
      clientLabel: "Kitchen mixer", clientDescription: "Luxe pull-down sink mixer" }),
    line("Ensuite", "B-008", { certainty: "client_approved", evidence: meeting, manufacturer: GREENS, product: "Maci Bath Shower Mixer Mini Plate", colour: "Brushed Nickel", model: "62412", quantity: 1,
      clientLabel: "Shower mixer", clientDescription: "Maci wall mixer for the shower" }),
    line("Ensuite", "B-008", { certainty: "client_approved", evidence: meeting, manufacturer: GREENS, product: "Glide Twin Rail Shower System with Rain Boost", colour: "Brushed Nickel", model: "58127", quantity: 1,
      clientLabel: "Shower rail and head", clientDescription: "Glide twin-rail shower with a rain head" }),
    line("Ensuite", "B-005", { certainty: "proposed", manufacturer: CAROMA, product: "Liano II 530 Pill Oval Inset Basin No Tap Hole", colour: "White", model: "63633", quantity: 2,
      clientLabel: "Basins", clientDescription: "Caroma Liano II oval inset basins" }),
    // ENSUITE visible accessories (owner decision 6): what the client sees and chooses has its own record.
    line("Ensuite", "B-008", { certainty: "proposed", manufacturer: CAROMA, product: "Urbane II Flush Button only for Wall faced Close Coupled Suite", colour: "Brushed Nickel", model: "58296", quantity: 1,
      clientLabel: "Flush button", clientDescription: "Urbane II flush button" }),
    line("Ensuite", "B-008", { certainty: "proposed", product: "V & B Soho / Architectura Toilet Roll Holder Right Hand Face", colour: "Brushed Nickel", model: "60818", quantity: 1,
      clientLabel: "Toilet roll holder", clientDescription: "Soho toilet roll holder" }),
    line("Ensuite", "B-008", { certainty: "proposed", product: "V & B Soho / Architectura Double Towel Rail 800mm", colour: "Brushed Nickel", model: "60815", quantity: 1,
      clientLabel: "Towel rails", clientDescription: "Soho double towel rail, 800 mm" }),
    line("Ensuite", "B-008", { certainty: "proposed", product: "V & B Soho / Architectura Single Towel Rail 300mm", colour: "Brushed Nickel", model: "60799", quantity: 1,
      clientLabel: "Hand towel rail", clientDescription: "Soho single towel rail, 300 mm" }),
    line("Ensuite", "B-008", { certainty: "proposed", product: "Basin 4 in1 Pop Down Waste 32x40mm", colour: "Brushed Nickel", model: "53395", quantity: 2,
      clientLabel: "Basin wastes", clientDescription: "Pop-down basin wastes" }),
    // The square grates don't match the linear floor waste recorded earlier: raised with the client.
    line("Ensuite", "B-008", { certainty: "proposed", product: "Bermuda Square Tile Grate 80mm", colour: "Chrome", model: "30411", quantity: 2,
      clientLabel: "Floor grates", clientDescription: "Square tile floor grates, 80 mm", responsibility: "client",
      nextAction: "Confirm the square floor grates Routleys selected for the ensuite, in place of the linear floor waste recorded earlier" }),
    // BATHROOM: the shower system is settled; the bath's spout and mixers wait on where the bath goes (QA R04).
    line("Bathroom", "B-008", { certainty: "client_approved", evidence: meeting, manufacturer: GREENS, product: "Glide Twin Rail Shower System with Rain Boost", colour: "Brushed Nickel", model: "58127", quantity: 1,
      clientLabel: "Shower rail and head", clientDescription: "Glide twin-rail shower with a rain head" }),
    // Routleys lists 62412 twice, 1 each, with nothing between them; the room has a bath and a shower, so one is the
    // bath's and one the shower's (staff: reconciled by location, each labelled for the client).
    line("Bathroom", "B-008", { certainty: "proposed", manufacturer: GREENS, product: "Maci Bath Shower Mixer Mini Plate", colour: "Brushed Nickel", model: "62412", quantity: 1,
      clientLabel: "Bath mixer", clientDescription: "Maci wall mixer for the bath" }),
    line("Bathroom", "B-008", { certainty: "proposed", manufacturer: GREENS, product: "Maci Bath Shower Mixer Mini Plate", colour: "Brushed Nickel", model: "62412", quantity: 1,
      clientLabel: "Shower mixer", clientDescription: "Maci wall mixer for the shower" }),
    line("Bathroom", "B-008", { certainty: "proposed", manufacturer: GREENS, product: "Maci / Mika Bath Spout 180mm", colour: "Brushed Nickel", model: "62417", quantity: 1,
      clientLabel: "Bath spout", clientDescription: "Maci wall bath spout, 180 mm" }),
    line("Bathroom", "B-005", { certainty: "proposed", manufacturer: CAROMA, product: "Liano II 530 Pill Oval Inset Basin No Tap Hole", colour: "White", model: "63633", quantity: 1,
      clientLabel: "Basin", clientDescription: "Caroma Liano II oval inset basin" }),
    line("Bathroom", "B-008", { certainty: "proposed", product: "V & B Soho / Architectura Double Towel Rail 800mm", colour: "Brushed Nickel", model: "60815", quantity: 1,
      clientLabel: "Towel rails", clientDescription: "Soho double towel rail, 800 mm" }),
    line("Bathroom", "B-008", { certainty: "proposed", product: "V & B Soho / Architectura Single Towel Rail 300mm", colour: "Brushed Nickel", model: "60799", quantity: 1,
      clientLabel: "Hand towel rail", clientDescription: "Soho single towel rail, 300 mm" }),
    // LAUNDRY: 53012 trough, its finish cut off on the page ("1 Tap Hole in..."), and 68713 mixer.
    line("Laundry", "L-003", { category: "joinery", certainty: "proposed", product: "Kubic Deep Galley Undermount / Overmount Sink 35 Ltr with Tap Landing 1 Tap Hole in...", model: "53012", quantity: 1,
      clientLabel: "Laundry sink", clientDescription: "Kubic deep laundry sink with a tap landing",
      responsibility: "trade", nextAction: "Confirm the laundry sink's finish: its line is cut off in selection 452499 (\"1 Tap Hole in...\")" }),
    line("Laundry", "L-003", { category: "joinery", certainty: "proposed", product: "Astro II LF Pull Down Sink Mixer", colour: "Brushed Nickel", model: "68713", quantity: 1,
      clientLabel: "Laundry mixer", clientDescription: "Astro II pull-down sink mixer" }),
    // Actions citing the selection (the register gives a W-025 action no trade category).
    makeItem({ id: "ri_rd_a01", itemKind: "action", category: "notes", promptKey: "W-025", section: "project", description: "Bath location",
      responsibility: "blue_leaf", nextAction: "Routleys lists a freestanding bath (49905) in the bathroom, with its spout (62417) and bath/shower mixers (62412); the plans show the bath in the ensuite. Confirm the room with the client and Routleys", ...routleys }),
    makeItem({ id: "ri_rd_a02", itemKind: "action", category: "notes", promptKey: "W-025", section: "project", description: "Routleys WC room",
      responsibility: "blue_leaf", nextAction: "Routleys' selection 452499 includes a WC'S room (toilet suite 57525, basin 63633, mixer 62397); the plans have no separate WC. Confirm with the client and Routleys whether it is withdrawn or belongs to another room", ...routleys }),
    makeItem({ id: "ri_rd_a03", itemKind: "action", category: "notes", promptKey: "W-025", section: "project", description: "Toilet suite description",
      responsibility: "trade", nextAction: "Confirm the toilet suite's full description (57525): its line is cut off in selection 452499", ...routleys }),
  );
  return p;
}
