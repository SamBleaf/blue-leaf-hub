/**
 * build-question-library.mjs — generates src/lib/registerQuestions.js from the APPROVED Blue Leaf
 * question library (Master Register doc, Tab 21) + the applicability metadata below.
 *
 * The question WORDING is never typed here: it is read verbatim from the parsed Tab 21 export
 * (docs/master_register/question-library/tab21-parsed-<version>.json). This file only adds the
 * implementation metadata Tab 22 §D asks for — section, room relevance, register category, topic
 * group, default technical status / owner, coordination discipline, default inheritance and quick-pick
 * options (options are taken from the question's own wording, never invented).
 *
 * When Blue Leaf revises Tab 21: export the tab, re-parse to a new tab21-parsed-<v>.json, bump VERSION,
 * adjust META for any new / removed IDs, and re-run:  node scripts/register/build-question-library.mjs
 * Stable question IDs are the join key stored on every register item (item.promptKey), so a re-wording
 * never orphans captured data.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERSION = "tab21-v1.0";
const SRC = join(__dirname, "../../docs/master_register/question-library/tab21-parsed-v1.0.json");
const OUT = join(__dirname, "../../src/lib/registerQuestions.js");

// ── room-type sets (src/lib/register.js ROOM_TYPES) ─────────────────────────────────────────────
const KITCHEN = ["kitchen", "scullery"];
const BATH = ["bathroom", "ensuite"];
const WET = ["bathroom", "ensuite", "wc"];
const LAUNDRY = ["laundry", "mudroom"];
const LIVING = ["living", "dining", "family", "theatre"];
const BED = ["bedroom"];
const OUTDOOR = ["alfresco", "balcony", "external"];
const INTERNAL = ["kitchen", "scullery", "pantry", "bathroom", "ensuite", "wc", "laundry", "mudroom", "living", "dining",
  "family", "theatre", "bedroom", "wir", "study", "stairs", "hall", "garage", "generic"];
const ALL_ROOMS = null; // null ⇒ every room type
const without = (set, ...ex) => set.filter((t) => !ex.includes(t));

// ── metadata per question ID ─────────────────────────────────────────────────────────────────────
// short: heading shown in the room card (the approved question text is shown with it, verbatim).
// section: project | site | room | tech | mgmt.  topic: grouping inside a step.  cat: register category.
// rooms: room types (room section only).  tech: default technical status.  owner: default responsibility.
// coord: supplier/consultant pack the item feeds (architect | routleys | tli | windows | engineer | energy | joiner).
// inherits: whole-house default question this room prompt inherits from (Tab 21 R-005 / R-006).
// render: special renderer.  opts: quick-pick chips lifted from the question text.  prefill: FACT source.
const META = {
  // 1 | ENTRY: PROJECT CONTEXT (mostly prefilled from Sales)
  "P-001": { short: "Client & site", section: "project", topic: "context", prefill: "identity" },
  "P-002": { short: "Drawings & revision", section: "project", topic: "context", prefill: "drawings" },
  "P-003": { short: "Concept meetings", section: "project", topic: "context", prefill: "meetings" },
  "P-004": { short: "Budget, timing & priorities", section: "project", topic: "context", prefill: "budget" },
  "P-005": { short: "Top priorities", section: "project", topic: "brief", cat: "notes", render: "priorities",
    opts: ["Space", "Natural light", "Comfort", "Privacy", "Entertaining", "Storage", "Accessibility", "Low maintenance", "Energy use"] },
  "P-006": { short: "Areas in the project", section: "project", topic: "brief", cat: "scope", render: "areas" },
  "P-007": { short: "Project type & delivery", section: "project", topic: "context", prefill: "type_delivery" },
  "P-008": { short: "Occupied during works?", section: "project", topic: "brief", cat: "site", render: "occupancy" },
  "P-009": { short: "Decisions before next milestone", section: "project", topic: "brief", cat: "notes" },
  "P-010": { short: "Consultants & suppliers on file", section: "project", topic: "context", prefill: "consultants" },

  // 2 | WHOLE-PROJECT SITE / EXISTING CONDITIONS
  "W-001": { short: "Site access", section: "site", topic: "access", cat: "site" },
  "W-002": { short: "Survey, services & geotech", section: "site", topic: "consultants", cat: "consultants", owner: "consultant", coord: "engineer" },
  "W-003": { short: "Trees, retaining & external structures", section: "site", topic: "external", cat: "external",
    opts: ["Include", "Retain", "Protect", "Remove", "By others"] },
  "W-004": { short: "Demolish / retain / alter / make good", section: "site", topic: "existing", cat: "demolition", coord: "architect" },
  "W-005": { short: "Existing condition risks", section: "site", topic: "existing", cat: "existing", owner: "consultant", coord: "engineer",
    opts: ["Inspected", "Assumed", "Needs test"] },
  "W-006": { short: "Protect / match existing finishes", section: "site", topic: "existing", cat: "existing" },
  "W-007": { short: "Living on site during works", section: "site", topic: "access", cat: "site" },
  "W-008": { short: "New-to-existing connections", section: "site", topic: "existing", cat: "existing", owner: "architect", coord: "architect" },
  "W-009": { short: "Quality priorities", section: "site", topic: "quality", cat: "notes", opts: ["Standard", "Upgraded", "Individually specified"] },
  "W-010": { short: "External works scope", section: "site", topic: "external", cat: "external",
    opts: ["Driveway", "Landscaping", "Paths", "Fencing", "Retaining", "Pergola", "Pool", "Boundary work"] },
  "W-011": { short: "Unknown conditions (cost/design risk)", section: "site", topic: "existing", cat: "existing", owner: "blue_leaf" },
  "W-012": { short: "Approvals & consultant responsibilities", section: "site", topic: "consultants", cat: "consultants", owner: "architect", coord: "architect" },

  // 3 | WHOLE-HOUSE GENERAL INCLUSIONS AND MATERIAL STANDARDS
  "W-013": { short: "Architectural material direction", section: "project", topic: "envelope", cat: "cladding", isDefault: true, coord: "architect",
    opts: ["Masonry", "Render", "Lightweight cladding", "Timber feature", "Metal roof"] },
  "W-014": { short: "Roof & gutter colour / material", section: "project", topic: "envelope", cat: "roof", isDefault: true, coord: "architect" },
  "W-015": { short: "Windows & glazing priorities", section: "project", topic: "envelope", cat: "windows", tech: "needs_verification", owner: "architect", coord: "windows" },
  "W-016": { short: "Envelope quality (comfort, energy, moisture)", section: "project", topic: "envelope", cat: "insulation", tech: "needs_verification", owner: "consultant", coord: "energy" },
  "W-017": { short: "Floor palette by zone", section: "project", topic: "internal", cat: "flooring", isDefault: true,
    opts: ["Timber", "Laminate", "Hybrid", "Tile", "Carpet", "Polished concrete"] },
  "W-018": { short: "Internal doors, trims & hardware", section: "project", topic: "internal", cat: "doors", isDefault: true },
  "W-019": { short: "Paint & ceiling direction", section: "project", topic: "internal", cat: "paint", isDefault: true,
    opts: ["Warm palette", "Cool palette", "Matte", "Sheen", "Square set", "Cornice"] },
  "W-020": { short: "Heating, cooling, ventilation & hot water", section: "project", topic: "services", cat: "hvac", tech: "needs_verification", owner: "trade" },
  "W-021": { short: "Electrical, smart home, solar & EV", section: "project", topic: "services", cat: "electrical", coord: "tli",
    opts: ["Smart home", "Data", "Solar", "Battery", "EV charging"] },
  "W-022": { short: "Furnishings, appliances & extras — who?", section: "project", topic: "inclusions", cat: "procurement",
    opts: ["Included", "By client", "Excluded", "Future"] },
  "W-023": { short: "Supply & install responsibilities", section: "project", topic: "inclusions", cat: "procurement", stageDetail: true },
  "W-024": { short: "Performance goal & consultant checks", section: "project", topic: "services", cat: "consultants", owner: "consultant", coord: "energy" },
  "W-025": { short: "Outstanding whole-house decision", section: "project", topic: "inclusions", cat: "notes" },

  // 4 | SHARED ROOM CARD
  "R-001": { short: "Room, level & drawing", section: "room", topic: "header", prefill: "room" },
  "R-002": { short: "Scope for this room", section: "room", topic: "scope", render: "disposition_of:R-003", rooms: ALL_ROOMS },
  "R-003": { short: "What is being done here?", section: "room", topic: "scope", cat: "scope", rooms: ALL_ROOMS, coord: "architect" },
  "R-004": { short: "How the room must work", section: "room", topic: "layout", cat: "layout", rooms: without(INTERNAL, "garage") },
  "R-005": { short: "Floor finish", section: "room", topic: "finishes", cat: "flooring", inherits: "W-017",
    rooms: without(INTERNAL, "bathroom", "ensuite", "wc", "laundry", "mudroom") },
  "R-006": { short: "Wall, ceiling & feature finish", section: "room", topic: "finishes", cat: "walls_ceiling", inherits: "W-019",
    rooms: without(INTERNAL, "bathroom", "ensuite", "wc") },
  "R-007": { short: "Doors, windows & openings", section: "room", topic: "finishes", cat: "doors", rooms: INTERNAL, coord: "windows" },
  "R-008": { short: "Lighting, power & comfort", section: "room", topic: "services", cat: "electrical", coord: "tli",
    rooms: ["hall", "stairs", "laundry", "mudroom", "pantry", "generic"] },
  "R-009": { short: "Joinery, fixtures & equipment — who?", section: "room", topic: "fixtures", cat: "joinery",
    rooms: ["study", "hall", "generic"], opts: ["Included", "Owner supplied", "By others"] },
  "R-010": { short: "Undecided / follow-up", section: "room", topic: "decisions", cat: "notes", rooms: ALL_ROOMS },
  "R-011": { short: "Source document", section: "room", topic: "header", prefill: "source" },
  "R-012": { short: "Detail, price & documentation status", section: "room", topic: "technical", cat: "notes", owner: "blue_leaf", rooms: ALL_ROOMS },
  "R-013": { short: "Existing-to-new junctions & make good", section: "room", topic: "scope", cat: "existing", rooms: INTERNAL, coord: "architect" },
  "R-014": { short: "Supplied / installed by others?", section: "room", topic: "fixtures", cat: "procurement", rooms: ALL_ROOMS },
  "R-015": { short: "Tolerances & installation constraints", section: "room", topic: "technical", cat: "structure", tech: "needs_verification",
    owner: "architect", rooms: ["kitchen", "scullery", "bathroom", "ensuite", "laundry", "stairs"] },

  // 5 | KITCHEN / SCULLERY / PANTRY
  "K-001": { short: "New kitchen or retrofit?", section: "room", topic: "scope", cat: "scope", rooms: [...KITCHEN, "pantry"],
    opts: ["New kitchen", "Replace fronts", "Partial retrofit"] },
  "K-002": { short: "Layout & family use", section: "room", topic: "layout", cat: "layout", rooms: [...KITCHEN, "pantry"], coord: "joiner",
    opts: ["Island", "Peninsula", "Scullery", "Pantry"] },
  "K-003": { short: "Storage", section: "room", topic: "layout", cat: "joinery", rooms: [...KITCHEN, "pantry"], coord: "joiner",
    opts: ["Full-height", "Walk-in", "Drawers", "Appliance garage", "Bins", "Pantry shelving", "Integrated appliances"] },
  "K-004": { short: "Cabinetry look", section: "room", topic: "finishes", cat: "joinery", rooms: [...KITCHEN, "pantry"], coord: "joiner",
    opts: ["Flat-panel", "Profile", "Timber veneer", "Laminate", "Paint"] },
  "K-005": { short: "Benchtop", section: "room", topic: "finishes", cat: "benchtop", rooms: KITCHEN, coord: "joiner" },
  "K-006": { short: "Splashback", section: "room", topic: "finishes", cat: "benchtop", rooms: KITCHEN,
    opts: ["Tile", "Stone", "Glass"] },
  "K-007": { short: "Sink & mixer", section: "room", topic: "fixtures", cat: "sanitary", rooms: KITCHEN, coord: "routleys",
    opts: ["Undermount", "Topmount", "Water filter", "Hot tap"] },
  "K-008": { short: "Appliances — who supplies?", section: "room", topic: "fixtures", cat: "appliances", rooms: KITCHEN,
    opts: ["Cooktop", "Oven", "Rangehood", "Dishwasher", "Fridge", "Microwave", "Wine storage"] },
  "K-009": { short: "Cooking & exhaust", section: "room", topic: "services", cat: "hvac", rooms: KITCHEN, opts: ["Induction", "Gas"] },
  "K-010": { short: "Power, lighting & data", section: "room", topic: "services", cat: "electrical", rooms: [...KITCHEN, "pantry"], coord: "tli" },
  "K-011": { short: "Joinery hardware & setouts", section: "room", topic: "technical", cat: "joinery", rooms: KITCHEN, owner: "trade", coord: "joiner" },
  "K-012": { short: "Budget drivers & unresolved choices", section: "room", topic: "decisions", cat: "notes", rooms: KITCHEN },
  "K-013": { short: "Appliance procurement & warranty", section: "room", topic: "fixtures", cat: "procurement", rooms: KITCHEN },
  "K-014": { short: "Coordinate product dimensions", section: "room", topic: "technical", cat: "joinery", rooms: KITCHEN, owner: "blue_leaf", coord: "joiner" },

  // 6 | BATHROOM / ENSUITE / WC / POWDER
  "B-001": { short: "Retain, renovate or new?", section: "room", topic: "scope", cat: "scope", rooms: WET,
    opts: ["Retained", "Full renovation", "New"] },
  "B-002": { short: "Layout & priorities", section: "room", topic: "layout", cat: "layout", rooms: WET,
    opts: ["Shower only", "Bath", "Double vanity", "Separate WC", "Storage", "Accessibility"] },
  "B-003": { short: "Toilet", section: "room", topic: "fixtures", cat: "sanitary", rooms: WET, coord: "routleys",
    opts: ["Back-to-wall", "Wall-hung", "Concealed cistern", "Existing retained"] },
  "B-004": { short: "Vanity", section: "room", topic: "fixtures", cat: "sanitary", rooms: WET, coord: "routleys",
    opts: ["Wall-hung", "Floorstanding"] },
  "B-005": { short: "Basin", section: "room", topic: "fixtures", cat: "sanitary", rooms: WET, coord: "routleys",
    opts: ["Inset", "Above-counter", "Undermount"] },
  "B-006": { short: "Shower", section: "room", topic: "fixtures", cat: "sanitary", rooms: BATH, coord: "routleys",
    opts: ["Walk-in", "Enclosed", "Niche", "Seat", "Hobless"] },
  "B-007": { short: "Bath", section: "room", topic: "fixtures", cat: "sanitary", rooms: BATH, coord: "routleys",
    opts: ["Built-in", "Freestanding", "None"] },
  "B-008": { short: "Tapware & accessories", section: "room", topic: "fixtures", cat: "sanitary", rooms: WET, coord: "routleys" },
  "B-009": { short: "Wall & floor tiles", section: "room", topic: "finishes", cat: "tiling", rooms: WET,
    opts: ["Full height", "Partial height", "Feature tile"] },
  "B-010": { short: "Heating & ventilation", section: "room", topic: "services", cat: "hvac", rooms: WET,
    opts: ["Exhaust fan", "Window", "Underfloor heating", "Heated towel rail"] },
  "B-011": { short: "Mirror, lighting & power", section: "room", topic: "services", cat: "electrical", rooms: WET, coord: "tli" },
  "B-012": { short: "Waterproofing, falls & setouts", section: "room", topic: "technical", cat: "tiling", rooms: WET, owner: "architect", coord: "architect" },
  "B-013": { short: "Rough-in vs Routleys pack", section: "room", topic: "technical", cat: "plumbing", rooms: WET, owner: "trade", coord: "routleys" },
  "B-014": { short: "Client-supplied vs Blue Leaf supply", section: "room", topic: "fixtures", cat: "procurement", rooms: WET },
  "B-015": { short: "Unresolved before setout", section: "room", topic: "decisions", cat: "notes", rooms: WET },

  // 7 | LAUNDRY / MUDROOM
  "L-001": { short: "New or retained laundry?", section: "room", topic: "scope", cat: "scope", rooms: LAUNDRY },
  "L-002": { short: "Washer / dryer layout", section: "room", topic: "layout", cat: "layout", rooms: ["laundry"],
    opts: ["Stacked", "Side-by-side", "Underbench"] },
  "L-003": { short: "Cabinetry, bench & trough", section: "room", topic: "fixtures", cat: "joinery", rooms: LAUNDRY, coord: "routleys" },
  "L-004": { short: "Flooring & splash protection", section: "room", topic: "finishes", cat: "flooring", rooms: LAUNDRY },
  "L-005": { short: "Waste, taps, hot water & power", section: "room", topic: "technical", cat: "plumbing", rooms: ["laundry"], owner: "trade" },
  "L-006": { short: "Appliance supply responsibility", section: "room", topic: "fixtures", cat: "procurement", rooms: ["laundry"] },
  "L-007": { short: "Unknowns & retained services", section: "room", topic: "decisions", cat: "notes", rooms: LAUNDRY },

  // 8 | LIVING / DINING / FAMILY / THEATRE
  "V-001": { short: "New, altered or retained?", section: "room", topic: "scope", cat: "scope", rooms: LIVING },
  "V-002": { short: "Layout, outlook & acoustics", section: "room", topic: "layout", cat: "layout", rooms: LIVING },
  "V-003": { short: "Floor, feature wall & ceiling", section: "room", topic: "finishes", cat: "walls_ceiling", rooms: LIVING },
  "V-004": { short: "Windows, sliders & coverings", section: "room", topic: "finishes", cat: "windows", rooms: LIVING, coord: "windows",
    opts: ["Slider", "Stacker", "Flyscreens", "Window coverings"] },
  "V-005": { short: "Fireplace, built-ins & TV wall", section: "room", topic: "fixtures", cat: "joinery", rooms: LIVING },
  "V-006": { short: "Lighting, AV & comfort", section: "room", topic: "services", cat: "electrical", rooms: LIVING, coord: "tli" },
  "V-007": { short: "Structural openings & glazing coordination", section: "room", topic: "technical", cat: "structure", rooms: LIVING,
    owner: "consultant", coord: "engineer" },
  "V-008": { short: "Furniture-driven decisions", section: "room", topic: "decisions", cat: "notes", rooms: LIVING },

  // 9 | BEDROOM / WIR / STUDY / NURSERY
  "D-001": { short: "New, retained or refurbished?", section: "room", topic: "scope", cat: "scope", rooms: [...BED, "wir", "study"] },
  "D-002": { short: "Furniture, access & storage", section: "room", topic: "layout", cat: "layout", rooms: [...BED, "study"] },
  "D-003": { short: "Floor, paint, trim & doors", section: "room", topic: "finishes", cat: "flooring", rooms: [...BED, "wir", "study"] },
  "D-004": { short: "Wardrobe layout", section: "room", topic: "fixtures", cat: "joinery", rooms: [...BED, "wir"], coord: "joiner",
    opts: ["Standard", "Custom"] },
  "D-005": { short: "Windows, coverings & privacy", section: "room", topic: "finishes", cat: "windows", rooms: [...BED, "study"], coord: "windows" },
  "D-006": { short: "Fan, AC, power & lighting", section: "room", topic: "services", cat: "electrical", rooms: [...BED, "wir", "study"], coord: "tli" },
  "D-007": { short: "Outstanding robe / electrical decisions", section: "room", topic: "decisions", cat: "notes", rooms: [...BED, "wir", "study"] },

  // 10 | STAIRS / HALLS / ENTRY / GARAGE
  "H-001": { short: "Stair type & responsibility", section: "room", topic: "scope", cat: "stairs", rooms: ["stairs"] },
  "H-002": { short: "Treads, balustrade & handrail", section: "room", topic: "finishes", cat: "stairs", rooms: ["stairs"] },
  "H-003": { short: "Hall / entry finishes & joinery", section: "room", topic: "finishes", cat: "flooring", rooms: ["hall"] },
  "H-004": { short: "Front entry door", section: "room", topic: "finishes", cat: "doors", rooms: ["hall"],
    opts: ["Pivot", "Hinged"] },
  "H-005": { short: "Entry storage & lighting", section: "room", topic: "layout", cat: "layout", rooms: ["hall"] },
  "H-006": { short: "Garage scope", section: "room", topic: "scope", cat: "scope", rooms: ["garage"] },
  "H-007": { short: "Garage services & EV", section: "room", topic: "services", cat: "electrical", rooms: ["garage"] },
  "H-008": { short: "Stair compliance & structure", section: "room", topic: "technical", cat: "structure", rooms: ["stairs"], owner: "consultant", coord: "engineer" },

  // 11 | OUTDOOR / ALFRESCO / PERGOLA / BALCONY / SITE
  "O-001": { short: "Outdoor area in scope?", section: "room", topic: "scope", cat: "scope", rooms: OUTDOOR,
    opts: ["Included", "Future", "By client", "Excluded"] },
  "O-002": { short: "How it will be used", section: "room", topic: "layout", cat: "layout", rooms: ["alfresco", "balcony"] },
  "O-003": { short: "External flooring", section: "room", topic: "finishes", cat: "external", rooms: OUTDOOR,
    opts: ["Concrete", "Pavers", "Deck", "Tiles"] },
  "O-004": { short: "Roof, posts, screens & cladding", section: "room", topic: "finishes", cat: "roof", rooms: ["alfresco", "balcony"] },
  "O-005": { short: "Outdoor services & connections", section: "room", topic: "services", cat: "electrical", rooms: ["alfresco", "balcony"], coord: "tli" },
  "O-006": { short: "Driveway, paths, fences & landscaping", section: "room", topic: "scope", cat: "external", rooms: ["external"] },
  "O-007": { short: "Pool, shed or future additions", section: "room", topic: "scope", cat: "external", rooms: ["external"] },
  "O-008": { short: "Balustrades, waterproofing & spans", section: "room", topic: "technical", cat: "structure", rooms: OUTDOOR, owner: "consultant", coord: "engineer" },
  "O-009": { short: "Boundary, drainage & staging issues", section: "room", topic: "decisions", cat: "external", rooms: OUTDOOR },

  // 12 | ELEMENT-BASED TECHNICAL / WORK PACKAGE PROMPTS — office coordination, never an onsite questionnaire
  "E-001": { short: "Siteworks", section: "tech", topic: "site", cat: "site", owner: "consultant", coord: "engineer" },
  "E-002": { short: "Foundations", section: "tech", topic: "structure", cat: "structure", owner: "consultant", coord: "engineer" },
  "E-003": { short: "Structure", section: "tech", topic: "structure", cat: "structure", owner: "consultant", coord: "engineer" },
  "E-004": { short: "Walls", section: "tech", topic: "envelope", cat: "cladding", owner: "architect", coord: "architect" },
  "E-005": { short: "Roofs", section: "tech", topic: "envelope", cat: "roof", owner: "architect", coord: "architect" },
  "E-006": { short: "Windows", section: "tech", topic: "envelope", cat: "windows", owner: "trade", coord: "windows" },
  "E-007": { short: "Doors", section: "tech", topic: "internal", cat: "doors", owner: "architect", coord: "architect" },
  "E-008": { short: "Envelope", section: "tech", topic: "envelope", cat: "insulation", owner: "consultant", coord: "energy" },
  "E-009": { short: "Internal linings", section: "tech", topic: "internal", cat: "walls_ceiling", owner: "architect", coord: "architect" },
  "E-010": { short: "Waterproofing", section: "tech", topic: "internal", cat: "tiling", owner: "architect", coord: "architect" },
  "E-011": { short: "Floor finishes", section: "tech", topic: "internal", cat: "flooring", owner: "trade" },
  "E-012": { short: "Paint / finishes", section: "tech", topic: "internal", cat: "paint", owner: "blue_leaf" },
  "E-013": { short: "Joinery", section: "tech", topic: "internal", cat: "joinery", owner: "trade", coord: "joiner" },
  "E-014": { short: "Plumbing", section: "tech", topic: "services", cat: "plumbing", owner: "trade", coord: "routleys" },
  "E-015": { short: "Electrical", section: "tech", topic: "services", cat: "electrical", owner: "trade", coord: "tli" },
  "E-016": { short: "HVAC / ventilation", section: "tech", topic: "services", cat: "hvac", owner: "trade" },
  "E-017": { short: "Energy / compliance", section: "tech", topic: "services", cat: "consultants", owner: "consultant", coord: "energy" },
  "E-018": { short: "External works", section: "tech", topic: "site", cat: "external", owner: "architect", coord: "architect" },
  "E-019": { short: "Demolition", section: "tech", topic: "site", cat: "demolition", owner: "blue_leaf" },
  "E-020": { short: "Existing-to-new", section: "tech", topic: "structure", cat: "existing", owner: "architect", coord: "architect" },
  "E-021": { short: "Procurement", section: "tech", topic: "commercial", cat: "procurement", owner: "blue_leaf", priceRef: true },
  "E-022": { short: "Cost", section: "tech", topic: "commercial", cat: "procurement", owner: "blue_leaf", priceRef: true },
  "E-023": { short: "Document control", section: "tech", topic: "commercial", cat: "consultants", owner: "blue_leaf" },

  // 13 | MANAGEMENT-ONLY / THIRD-PARTY RESPONSIBILITY OVERLAY (activated by delivery model)
  "M-001": { short: "Design coordination owner", section: "mgmt", topic: "responsibilities", cat: "procurement" },
  "M-002": { short: "Who engages & pays consultants", section: "mgmt", topic: "responsibilities", cat: "consultants" },
  "M-003": { short: "Who sources, orders & installs", section: "mgmt", topic: "responsibilities", cat: "procurement" },
  "M-004": { short: "Direct costs, fees & packages", section: "mgmt", topic: "responsibilities", cat: "procurement", priceRef: true },
  "M-005": { short: "Who can approve what", section: "mgmt", topic: "responsibilities", cat: "procurement" },
  "M-006": { short: "Programme & interface responsibility", section: "mgmt", topic: "responsibilities", cat: "procurement" },
};

const KIND_TO_ITEM = { FACT: null, SCOPE: "scope", REQUIREMENT: "requirement", SELECTION: "selection", TECH: "action", ACTION: "action" };

const parsed = JSON.parse(readFileSync(SRC, "utf8"));
const seen = new Set();
const out = [];
for (const q of parsed) {
  const m = META[q.id];
  if (!m) throw new Error(`No metadata for ${q.id} — add it to META before regenerating.`);
  seen.add(q.id);
  const [kindStage, ...flags] = q.tags.split(/\s+/);
  const [kind, stage] = kindStage.split("/");
  if (!(kind in KIND_TO_ITEM)) throw new Error(`${q.id}: unknown kind ${kind}`);
  const scopeFlag = flags.find((f) => ["CORE", "NEW", "RENO", "OPT"].includes(f)) || null;
  const entry = {
    id: q.id,
    group: q.group,
    kind,                                   // Tab 21 KIND (FACT/SCOPE/REQUIREMENT/SELECTION/TECH/ACTION)
    stage: stage || "C",                    // C concept · D detailed after PTSA · T tender/contract
    projects: scopeFlag === "NEW" ? "new" : scopeFlag === "RENO" ? "reno" : "all",
    optional: scopeFlag === "OPT",
    itemKind: m.itemKind !== undefined ? m.itemKind : KIND_TO_ITEM[kind],
    section: m.section,
    topic: m.topic,
    category: m.cat || null,
    short: m.short,
    text: (q.pre ? `${q.pre}: ` : "") + q.text,          // VERBATIM approved wording (element name prefix for E-*)
    rooms: m.section === "room" ? (m.rooms === undefined ? null : m.rooms) : undefined,
    technical: m.tech || (kind === "TECH" ? "needs_verification" : "not_required"),
    owner: m.owner || null,
    coord: m.coord || null,
    inherits: m.inherits || null,
    isDefault: !!m.isDefault,
    render: m.render || null,
    prefill: m.prefill || null,
    options: m.opts || null,
    priceRef: !!m.priceRef,
    detail: (stage && stage !== "C") || !!m.stageDetail,   // hidden by default at Concept (staff can work ahead)
  };
  for (const k of Object.keys(entry)) if (entry[k] === undefined) delete entry[k];
  out.push(entry);
}
for (const id of Object.keys(META)) if (!seen.has(id)) throw new Error(`META has ${id} but Tab 21 does not — remove or re-parse.`);

const header = `/**
 * registerQuestions.js — GENERATED by scripts/register/build-question-library.mjs. DO NOT EDIT BY HAND.
 *
 * The Blue Leaf Master Register question library (Tab 21, ${VERSION}) as a compact, versioned
 * configuration (Tab 22 §D). Question wording is the approved Tab 21 text, verbatim. Each entry maps a
 * stable question ID to the register record it creates (itemKind) — answers are stored in existing project
 * records (the lead register before promotion, then client_selections / room_scope_items), never in a
 * column per question. FACT questions are read-only Sales context, never re-asked.
 */
`;
const body = `export const QUESTION_LIBRARY_VERSION = ${JSON.stringify(VERSION)};

/** @type {Array<{id:string,group:string,kind:string,stage:string,projects:string,optional:boolean,itemKind:(string|null),section:string,topic:string,category:(string|null),short:string,text:string,rooms?:(string[]|null),technical:string,owner:(string|null),coord:(string|null),inherits:(string|null),isDefault:boolean,render:(string|null),prefill:(string|null),options:(string[]|null),priceRef:boolean,detail:boolean}>} */
export const QUESTIONS = ${JSON.stringify(out, null, 1)};
`;
writeFileSync(OUT, header + body);
console.log(`wrote ${OUT} — ${out.length} questions (${VERSION})`);
