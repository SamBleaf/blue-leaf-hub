/**
 * Blue Leaf Building — standard tender inclusions (master template).
 * Pre-fills the Fee Proposal Inclusions tab; Sam edits per job.
 */
export const DEFAULT_INCLUSION_SECTIONS = [
  {
    SECTION_HEADING: "Builders Warranty",
    SECTION_ITEMS: [
      { ITEM_TEXT: "5 Year builders warranty" },
      { ITEM_TEXT: "10 Year structural warranty" },
      { ITEM_TEXT: "6 month maintenance/defect period" }
    ]
  },
  {
    SECTION_HEADING: "Preliminaries",
    SECTION_ITEMS: [
      { ITEM_TEXT: "Builders indemnity insurance" },
      { ITEM_TEXT: "Contract works insurance" },
      { ITEM_TEXT: "Surveying" },
      { ITEM_TEXT: "Engineering fees" },
      { ITEM_TEXT: "Timber framing design" },
      { ITEM_TEXT: "Plans and documentation" }
    ]
  },
  {
    SECTION_HEADING: "Hire items & Site establishment",
    SECTION_ITEMS: [
      { ITEM_TEXT: "Site fencing - At entry points to site" },
      { ITEM_TEXT: "Site toilet" },
      { ITEM_TEXT: "WHS signage" },
      { ITEM_TEXT: "Scaffolding - To perimeter of second storey" }
    ]
  },
  {
    SECTION_HEADING: "Demolition and Civil",
    SECTION_ITEMS: [
      { ITEM_TEXT: "Removal of pergola" },
      { ITEM_TEXT: "Removal of windows and doors" },
      { ITEM_TEXT: "Demolition of existing bedroom roof" },
      { ITEM_TEXT: "Removal of services, paving and clearing work areas" },
      { ITEM_TEXT: "Removal of concrete slab and footings" },
      { ITEM_TEXT: "Demolition bin hire - PC SUM $2,028.97" },
      { ITEM_TEXT: "Laying of quarry rubble to working areas" }
    ]
  },
  {
    SECTION_HEADING: "Concrete and footings",
    SECTION_ITEMS: [
      { ITEM_TEXT: "Excavation for concrete footings - PC SUM $6,000" },
      { ITEM_TEXT: "Excavation of piers into rock - PC SUM $6,078" },
      { ITEM_TEXT: "Concrete slab including reinforcing rods and mesh" }
    ]
  },
  {
    SECTION_HEADING: "Termite protection",
    SECTION_ITEMS: [
      { ITEM_TEXT: "Perimeter sheet membrane" },
      { ITEM_TEXT: "Cold Joint/penetrations" }
    ]
  },
  {
    SECTION_HEADING: "Structural steel",
    SECTION_ITEMS: [
      { ITEM_TEXT: "Structural steel - Red oxide primed" },
      { ITEM_TEXT: "Genie lift for steel installation" }
    ]
  },
  {
    SECTION_HEADING: "First fix framing",
    SECTION_ITEMS: [
      { ITEM_TEXT: "Timber framing supply including LVL H2 studs" },
      { ITEM_TEXT: "Wall framing, floor framing and roof framing" }
    ]
  },
  {
    SECTION_HEADING: "Windows and Skylights",
    SECTION_ITEMS: [
      { ITEM_TEXT: "Windows and doors - Aluminum semi commercial" },
      { ITEM_TEXT: "Fixed skylight - Velux" },
      { ITEM_TEXT: "Window and skylight installation" },
      { ITEM_TEXT: "Double glazed windows" },
      { ITEM_TEXT: "See options page for alternative window/door options" }
    ]
  },
  {
    SECTION_HEADING: "Cladding and Soffit linings",
    SECTION_ITEMS: [
      { ITEM_TEXT: "Ventilated batten system" },
      { ITEM_TEXT: "Pro clima weathertight system including walls and roof" },
      { ITEM_TEXT: "Window sealing" },
      { ITEM_TEXT: "Aluminium wall cladding" },
      { ITEM_TEXT: "Cement sheet wall cladding" },
      { ITEM_TEXT: "Flashings - colorbond" },
      { ITEM_TEXT: "Heka Hood" }
    ]
  },
  {
    SECTION_HEADING: "Roofing",
    SECTION_ITEMS: [
      { ITEM_TEXT: "Box gutters" },
      { ITEM_TEXT: "Metal roof sheeting - Kingklip" },
      { ITEM_TEXT: "D gutter and rainwater head" },
      { ITEM_TEXT: "Downpipes - PVC" },
      { ITEM_TEXT: "Cappings and flashings" }
    ]
  },
  {
    SECTION_HEADING: "Electrical and Data",
    SECTION_ITEMS: [
      { ITEM_TEXT: "Clipsal iconic switches" },
      { ITEM_TEXT: "Power box - retain switch board location" },
      { ITEM_TEXT: "Downlight installation x 10 - Haneco viva" },
      { ITEM_TEXT: "Internal wall light x 1" },
      { ITEM_TEXT: "External downlights x 3" },
      { ITEM_TEXT: "LED strip with dimmers - 4 meters" },
      { ITEM_TEXT: "Internal double powerpoints x 7" },
      { ITEM_TEXT: "External double powerpoints x 2" },
      { ITEM_TEXT: "Smoke alarm x 1" },
      { ITEM_TEXT: "EV charger - See options in pricing" }
    ]
  },
  {
    SECTION_HEADING: "Plumbing",
    SECTION_ITEMS: [
      { ITEM_TEXT: "Underfloor to laundry" },
      { ITEM_TEXT: "First fix to bathroom and laundry" },
      { ITEM_TEXT: "Fit off to laundry and bath" },
      {
        ITEM_TEXT:
          "Supply items including solid bath, flex waste, freestanding bath filler, sink mixer, floor drain, robe hooks and WM cocks as per specification"
      },
      { ITEM_TEXT: "Stormwater to existing supply - 3 downpipes maximum" },
      { ITEM_TEXT: "COC on completion" }
    ]
  },
  {
    SECTION_HEADING: "Insulation",
    SECTION_ITEMS: [
      { ITEM_TEXT: "External walls - R2.5 HD wall batts" },
      { ITEM_TEXT: "Ceiling - R6.0 ceiling batts" },
      { ITEM_TEXT: "Under floor - R6.0 ceiling batts" },
      { ITEM_TEXT: "Internal walls - R2.0 wall batts" }
    ]
  },
  {
    SECTION_HEADING: "Internal linings",
    SECTION_ITEMS: [
      { ITEM_TEXT: "Walls - 10mm plasterboard" },
      { ITEM_TEXT: "Internal ceiling - 10mm plasterboard" },
      { ITEM_TEXT: "Wet areas - 6mm villaboard" }
    ]
  },
  {
    SECTION_HEADING: "Second fix carpentry",
    SECTION_ITEMS: [
      { ITEM_TEXT: "Doors - Solid core" },
      { ITEM_TEXT: "Door jambs - Primed pine" },
      { ITEM_TEXT: "Skirting - Primed pine" },
      { ITEM_TEXT: "Door hardware - Lemaar hardware supply" },
      { ITEM_TEXT: "Timber screen - 40 x 40 DAR Tasmanian oak" }
    ]
  },
  {
    SECTION_HEADING: "Stairs",
    SECTION_ITEMS: [
      { ITEM_TEXT: "Internal stairs - MDF stairs, no nosing and pine stringers" },
      { ITEM_TEXT: "Internal balustrade - Frameless glass balustrade with aluminum capping" },
      { ITEM_TEXT: "Wall rail - 50mm round pine dowel" }
    ]
  },
  {
    SECTION_HEADING: "Tiling",
    SECTION_ITEMS: [
      { ITEM_TEXT: "Screeding" },
      { ITEM_TEXT: "Waterproofing" },
      { ITEM_TEXT: "Tile corners - mitered" },
      { ITEM_TEXT: "Siliconing - colour to suit tile/joinery" }
    ]
  },
  {
    SECTION_HEADING: "Joinery",
    SECTION_ITEMS: [
      { ITEM_TEXT: "Laundry" },
      { ITEM_TEXT: "Mud nook" },
      { ITEM_TEXT: "Wardrobe - See optional extras" }
    ]
  },
  {
    SECTION_HEADING: "Painting",
    SECTION_ITEMS: [
      { ITEM_TEXT: "To new areas" },
      { ITEM_TEXT: "Internal paint - 3 coats to walls and ceilings" },
      { ITEM_TEXT: "External paint 3 coats to walls and ceilings" },
      { ITEM_TEXT: "Raw timber - Sealed with Cutek CD50" }
    ]
  },
  {
    SECTION_HEADING: "Plastering and Rendering",
    SECTION_ITEMS: [{ ITEM_TEXT: "External texture coat - To cement fibre sheet products only" }]
  },
  {
    SECTION_HEADING: "Flooring",
    SECTION_ITEMS: [{ ITEM_TEXT: "Hybrid flooring to entry" }]
  },
  {
    SECTION_HEADING: "Balustrades",
    SECTION_ITEMS: [{ ITEM_TEXT: "External balustrade - Included with stainless steel standoff pins and stainless steel top rail" }]
  },
  {
    SECTION_HEADING: "Remedial works",
    SECTION_ITEMS: [
      { ITEM_TEXT: "AC conduit against house - Allowance made to re run inside roof space" },
      { ITEM_TEXT: "Paving - Make good of paving using existing materials" }
    ]
  },
  {
    SECTION_HEADING: "Site Cleaning",
    SECTION_ITEMS: [{ ITEM_TEXT: "Rubbish removal" }, { ITEM_TEXT: "Glass cleaning" }]
  }
];

/** Deep clone for proposal state (avoid shared refs). */
export function cloneDefaultInclusionSections() {
  return DEFAULT_INCLUSION_SECTIONS.map((sec) => ({
    SECTION_HEADING: sec.SECTION_HEADING,
    SECTION_ITEMS: sec.SECTION_ITEMS.map((it) => ({ ITEM_TEXT: it.ITEM_TEXT }))
  }));
}
