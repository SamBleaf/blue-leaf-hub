// =============================================================================
// shared/takeoff/fixes.js — HUB 029: every order blocker as a one-tap fix row (Sam, 25 Oct 2026: "make each blocker
// or label something you can click so you can get past the blocker"). Plan: docs/hub_review/ORDER_BLOCKERS_PLAN.md
// part 3 ("The model"). Pure: the panel, Walls, Schedule, Orders and the server read the same rows.
//
// fixesFor(computed, snapshot, { section, materialId }) turns what holds an order up into rows:
//   - each measured generic item's own blocking problems (computeWorkspace → materialResults[id].problems);
//   - the problem text on every schedule line it lists, pooled tape and H-flashing included: a message is matched back
//     to the item that raised it, and a raw plan code (calibration_superseded …) through the line's contributionIds
//     (else the line's items' contributions) to the measurement that carries it, worded from PROBLEM_TEXT;
//   - the raw plan codes on each measured item's own measurements, and on flashing runs with no line;
//   - each flashing line's problems, routed the HUB 010 way (target kind "flashing", unchanged).
// Only a blocking problem becomes a row: a note (blocking: false, every NOTE_CODES code, installation notes included:
// isInstallationNote) never does, nor nothing_measured or opening_clipped in any case. An item with nothing measured
// has no rows (it is a muted note at Review order, never a fix).
// Rows are deduped by target (fixTargetKey): one tap that fixes many problems is one row (every wall too tall for the
// sheet → one "use a 10 mm joint" row; three Support battens walls with no spacing → one "enter the spacing" row).
//
// A row: { key, target, code, codes, count, materialId, materialIds, materialName, walls, wallId, wallIds, bucketKeys,
//   subject, action, short, text, reason }
//   subject  the bold part ("Wall 3", "Axon 400 smooth", "Studs", "Page 7")
//   action   what to do, plain ("enter the Wall height")
//   short    the row in its item's own context ("Wall 3: enter the Wall height")
//   text     the row naming its item, for lists that mix items or for a pooled line shown on another item ("Wall 3 on
//            Axon 400 smooth: enter the Wall height"); when two items share a name, the item's walls are named too
//            ("Wall 3 on Axon 400 smooth (Walls 1, 3–11): enter the Wall height")
//   reason   the line label's reason ("not orderable yet: Wall 3 has no Wall height ›")
//   walls    the item's walls ("Walls 1, 3–11"), null when it has none; wallId the wall the row is about
//   bucketKeys  the listed schedule lines the row's problems hold (a line reads its first row as its reason)
//
// Target kinds (FIX_TARGET_KINDS; the router in TakeoffApp opens them, build step 4):
//   { kind: "wall", materialId, measurementId, field?, openingId?, sheet? }   that wall's page; `field` (FIX_WALL_FIELDS)
//       focused, `openingId`'s form selected, or sheet "jointRow" (the material's joint row sheet)
//   { kind: "card", materialId, field, part?, group? }   the item's card at [data-fix-field=field] (FIX_CARD_FIELDS),
//       opening Edit or the fold when the field is hidden; `part` = a Walls part (studs …), `group` = an accessory group
//   { kind: "apply", materialId, action, … }   one tap here, with Undo (FIX_APPLY_ACTIONS): clearAssembly,
//       useSheetJoint (rules.jointRows = the `jointRows` it carries), removeContribution (contributionId)
//   { kind: "measure", materialId, documentId, pageIndex, measurementIds, tool? }   Measure on that page with these
//       highlighted (retrace them), or with `tool` ("distribution", "member") ready to draw what is missing
//   { kind: "scale", documentId, pageIndex, measurementIds }   scale (or re-check) that page
//   { kind: "rescale", documentId, pageIndex, measurementIds }   the rescale review with these ticked
//   { kind: "flashing", materialId, bucketKey, problems }   HUB 010's own route (fixFromOrder), unchanged
// =============================================================================
import { WALL_FIELD_LABELS, isGenericMaterial, wallTagsOf } from "./engine/dispatch.js";
import { FAMILY_NEED_FIELDS, WALL_PARTS, WALL_PART_LABELS } from "./engine/families.js";
import { BLUE_LEAF_SHEET_JOINT } from "./catalogue.js";
import { PROBLEM_TEXT } from "./schedule.js";
import { materialSection } from "./sections.js";
import { formatMm } from "./units.js";

export const FIX_TARGET_KINDS = Object.freeze(["wall", "card", "apply", "measure", "scale", "rescale", "flashing"]);
/** The wall page inputs a wall target can focus (the same keys as wall_incomplete's refs[0].missing). */
export const FIX_WALL_FIELDS = Object.freeze(["widthMm", "heightMm", "startHeightMm", "endHeightMm", "eavesHeightMm", "apexHeightMm", "apexXMm"]);
export const FIX_APPLY_ACTIONS = Object.freeze(["clearAssembly", "useSheetJoint", "removeContribution"]);
/** How a code's fix is reached (the code table's `to`); each resolves to a target of one of FIX_TARGET_KINDS. */
export const FIX_ROUTES = Object.freeze(["wallMissing", "wall", "opening", "jointRow", "sheetTooTall", "retrace", "scale", "rescale", "card", "need", "group",
  "wallOrCard", "clearAssembly", "removeContribution", "tool", "runs", "flashing"]);
/** The card fields a card target can name: familyProblems' own (FAMILY_NEED_FIELDS), then the card's other settings. */
export const FIX_CARD_FIELDS = Object.freeze([...FAMILY_NEED_FIELDS, "orientation", "spareRate", "stockLengthMm", "offcuts",
  "rules.heightAllowanceMm", "rules.datumMm", "rules.jointGapMm", "rules.boundaryGaps", "rules.minStripMm", "rules.adhesiveJointMm", "rules.controlJoints",
  "rules.joints", "rules.maxSpacingMm", "rules.startOffsetMm", "rules.fixing", "rules.fixingScope", "rules.manualLayout", "rules.nogginRows",
  "rules.bottomPlateMm", "rules.pitchDeg", "rules.centresMm", "rules.recipe"]);

/**
 * HUB 029: an installation note (e.g. "No reviewed installation row is active for axon-vertical …"). It never blocks
 * and can't be cleared from the app (no reviewed rows exist), so it is never a fix row and never reads as a fault.
 * The assembly MISMATCH codes are installation-axis too but block (B7): they are not notes.
 */
export const isInstallationNote = (p) => !!p && p.axis === "installation" && p.blocking === false;

/** Codes the engine only ever raises as notes (blocking: false): never a fix row. The guard test keeps this honest. */
export const NOTE_CODES = Object.freeze([
  "nothing_measured", "opening_clipped", "stock_max_unset", "final_bay_tiny", "opening_framing_incomplete", "opening_framing_not_counted",
  "framing_detail_members", "walls_counted_twice", "noggins_not_shared", "component_not_selected", "offcut_other_product", "followers_hand_made",
  "followers_pooled", "joint_product_missing", "auto_joint_lowered", "overlap_ignored", "component_unresolved", "component_not_applicable",
  "manual_component_invalid", "rails_layout_invalid", "rails_unresolved", "coating_yield_unresolved", "phase-not-preserved", "members-overlap",
  "edge-zone-unsourced", "override-difference",
  // installation notes (cladding.js inst(): axis installation, never blocking)
  "assembly_coverage_unstated", "installation_selectors_missing", "installation_rule_ambiguous", "installation_rule_missing",
  "project_detail_incomplete", "narrow_strip", "cut_panel_needs_review", "component_out_of_scope", "fixing_row_missing",
  "orientation_permission_unknown", "opening_panel_detail_required", "control_joints_not_entered",
]);
/** Never a row, even if a future rule made one blocking (the plan: these are notes, not faults). Any other NOTE_CODES
 *  code raised as blocking still gets a row (the card), so nothing ever holds an order without a tap. */
const NEVER_ROWS = new Set(["nothing_measured", "opening_clipped"]);

// ── the code-to-target table ─────────────────────────────────────────────────
// Each blocking code: `to` (how its fix is reached, a resolver below), a card `field` (string or (x) => string),
// a measuring `tool`, and the plain words: `say` (the action after "Subject: ") or `short` (the whole row, for a
// phrasing with no colon). Without words, the engine's own message is used (it already reads "Wall 3: enter …").

const cardField = (field, say) => ({ to: "card", field, ...(say ? { say } : {}) });
const group = (say) => ({ to: "group", ...(say ? { say } : {}) });
const opening = (say) => ({ to: "opening", say });
const ofOpening = (x) => x.openingLabel || "an opening";
const PRODUCT_LENGTHS = (x) => (x.family === "timber" ? "stock.maxMm" : x.family === "aluminium" ? "stockLengthMm" : "product.lengths");

export const FIX_TARGETS = Object.freeze({
  // walls (HUB 029 step 1: refs [{ measurementId, missing }])
  wall_incomplete: { to: "wallMissing" },
  wall_dimension_invalid: { to: "wallMissing" },
  wall_polygon_invalid: { to: "retrace", say: "retrace the outline" },
  wall_self_intersecting: { to: "retrace", say: "retrace the outline (it crosses itself)" },
  wall_kind_unknown: { to: "wall", say: "choose the wall shape" },
  wall_invalid: { to: "wall", say: "check its length and heights" },
  wall_not_straight: { to: "wall", short: (x) => `${x.subject} is sloped or an outline: Walls takes straight walls only` },
  too_many_openings: { to: "wall", short: (x) => `${x.subject} has too many openings: split the wall` },
  too_many_elements: { to: "wall", short: (x) => `${x.subject} is too big to lay out in one go: split the wall` },
  grid_invalid: { to: "wall", say: "the panel grid leaves no panel area: check the wall" },
  // openings (refs openingId → the opening's wall)
  opening_invalid: opening((x) => `${ofOpening(x)} needs its position, sill, width and height`),
  opening_duplicate: opening((x) => `${ofOpening(x)} is listed twice`),
  opening_outside_wall: opening((x) => `${ofOpening(x)} is outside the wall`),
  opening_shape_unsupported: opening((x) => `${ofOpening(x)} is a traced shape: enter it as a rectangle`),
  "opening-invalid": opening((x) => `${ofOpening(x)} needs its position and size`),
  "opening-duplicate-id": opening((x) => `two openings share the name ${ofOpening(x)}`),
  "opening-outside-wall": opening((x) => `${ofOpening(x)} is outside the wall`),
  "opening-member-needs-detail": opening((x) => `${ofOpening(x)} isn't a rectangle: enter its supports from the detail`),
  "opening-not-rectangular": opening((x) => `${ofOpening(x)} isn't a rectangle: enter its flashings from the detail`),
  "openings-overlap": opening((x) => `${ofOpening(x)} overlaps another opening`),
  "wall-id-missing": opening((x) => `${ofOpening(x)} isn't on a wall`),
  // plan codes on a measurement (raw on the lines; mapped back through the contributions)
  calibration_missing: { to: "scale", short: (x) => `Page ${x.page} isn't scaled: scale it` },
  calibration_not_ready: { to: "scale", short: (x) => `Page ${x.page}'s scale isn't checked: check it` },
  calibration_superseded: { to: "rescale" },
  outside_region: { to: "retrace", short: (x) => `${x.subject} is outside the scaled area: retrace it` },
  plan_superseded: { to: "retrace", short: (x) => `${x.subject} is on a replaced plan: retrace it on the current plan` },
  measurement_invalid: { to: "retrace", short: (x) => `${x.subject} can't be worked out: retrace it` },
  measurement_unused: { to: "removeContribution", fromContributions: true, short: (x) => `${x.measuredAs} is on the wrong material: remove it from ${x.name}` },
  // the item's product and setup (familyProblems needs carry their own field)
  material_incomplete: { to: "need" },
  timber_identity_incomplete: { to: "card", field: (x) => ({ section: "section", grade: "grade", treatment: "treatment" })[x.p.refs?.[0]?.missing?.[0]] || "section",
    say: (x) => `choose the ${andList(x.p.refs?.[0]?.missing || ["section"])}` },
  product_missing: cardField("product", "choose the product"),
  wrong_family: cardField("product", "choose a product of the right kind"),
  mixed_product_variants: cardField("product", "choose one product (its stock lengths go together)"),
  product_parameter_missing: { to: "card", field: (x) => productField(x.p.refs?.[0]?.missing), say: (x) => `enter the product's ${missingWords(x.p.refs?.[0]?.missing)}` },
  product_parameter_invalid: cardField("product.cover", "check the effective cover (it is wider than the piece)"),
  cover_required: cardField("product.cover", "enter the effective cover"),
  cover_mismatch: cardField("product.cover", "use the product's effective cover"),
  "product-missing": { to: "group", fallbackField: "product", say: "choose the product" },
  "stock-policy-missing": { to: "group", fallbackField: "product.lengths", say: "enter the stock lengths" },
  panel_too_tall: cardField("product.lengths", "choose a longer listed panel"),
  "support-face-width-missing": cardField("product.size", "enter the batten size"),
  "joint-support-too-narrow": cardField("product.size", "a joint needs a wider batten: change the size"),
  orientation_invalid: cardField("orientation", "choose vertical or horizontal"),
  orientation_not_permitted: cardField("orientation", "isn't made for this orientation: change it"),
  orientation_required: cardField("orientation", "choose the orientation"),
  aac_orientation_requires_detail: cardField("orientation", "horizontal AAC needs the system's detail: choose vertical"),
  allowance_invalid: cardField("rules.heightAllowanceMm", "enter a height allowance of 0 mm or more"),
  datum_invalid: cardField("rules.datumMm", "enter the layout datum"),
  datum_above_base: cardField("rules.datumMm", "lower the course datum to the base"),
  joint_gap_required: cardField("rules.jointGapMm", "enter the joint gap"),
  boundary_gaps_invalid: cardField("rules.boundaryGaps", "choose the edge gaps"),
  min_strip_invalid: cardField("rules.minStripMm", "enter a minimum strip of 0 mm or more"),
  adhesive_joint_required: cardField("rules.adhesiveJointMm", "enter the adhesive joint"),
  control_joints_invalid: cardField("rules.controlJoints", "enter the control joints' positions and width"),
  joint_rule_orientation_mismatch: cardField("rules.joints", "the board joint rule is for the other orientation: change it"),
  joint_rule_unsupported: cardField("rules.joints", "check the board joint rule"),
  joint_rule_invalid: cardField("rules.joints", "set the board joint rule"),
  off_support_joint_not_permitted: cardField("rules.joints", "joint the boards over a support"),
  needs_layout: cardField("rules.joints", "boards longer than the stock need a joint rule"),
  spare_invalid: cardField("spareRate", "enter a spare of 0 or more"),
  order_increment_required: cardField("orderIncrementM", "enter the supplier's LM ordering step"),
  order_increment_invalid: cardField("orderIncrementM", "enter an LM ordering step over 0"),
  area_invalid: { to: "card", field: null, say: "a wall has no area left to clad: check its openings" },
  opening_policy_invalid: { to: "card", field: null, say: "check the opening setting" },
  kerf_unconfirmed: cardField("kerfMm", "confirm the saw kerf"),
  unavailable_stock: { to: "card", field: PRODUCT_LENGTHS, part: (x) => partFromLabel(x.p.message),
    say: (x) => `no stock length fits ${String(x.p.message || "").split(":")[0] || "a piece"}: raise the longest length` },
  offcut_too_long: cardField("offcuts", "check the offcut's length"),
  recipe_missing: cardField("rules.recipe", "add the accessory items"),
  method_unavailable: { to: "card", field: null, say: "this calculation isn't available: choose another product" },
  "invalid-input": { to: "card", field: null, say: (x) => cutAtDash(x.p.message) },
  invalid_input: { to: "wallOrCard", field: (x) => INPUT_FIELDS[x.p.refs?.[0]?.field] ?? null },
  // the assembly (B7: still blocks, one tap clears it)
  assembly_method_mismatch: { to: "clearAssembly", say: "the assembly doesn't match this product: clear it" },
  assembly_family_mismatch: { to: "clearAssembly", say: "the assembly doesn't match this product: clear it" },
  assembly_product_mismatch: { to: "clearAssembly", say: "the assembly doesn't match this product: clear it" },
  assembly_orientation_mismatch: { to: "clearAssembly", say: "the assembly is for the other orientation: clear it" },
  // sheet joints
  sheet_too_tall: { to: "sheetTooTall", say: (x) => (x.target?.kind === "apply"
    ? `walls taller than the sheet: use a ${BLUE_LEAF_SHEET_JOINT.gapMm} mm joint with an ${BLUE_LEAF_SHEET_JOINT.detailRef}` : "taller than the sheet: add a joint row") },
  joint_rows_invalid: { to: "jointRow", say: "the joint row needs its position inside the wall" },
  sheet_unplaced: { to: "jointRow", say: "a piece doesn't fit a listed sheet: add a joint row" },
  // timber
  member_missing: { to: "tool", tool: "member", say: "measure one member, or enter the cut length" },
  distribution_missing: { to: "tool", tool: "distribution", say: "draw the distribution run" },
  distribution_overlap: { to: "runs", say: "two runs lie on top of each other: remove one" },
  override_stale: { to: "runs", say: "a changed member no longer matches the run: review it" },
  plates_missing: cardField("rules.bottomPlateMm", "enter the bottom and top plate thickness"),
  noggin_rows_missing: cardField("rules.nogginRows", "enter the noggin rows"),
  member_incomplete: { to: "wall", say: "an added member needs its details" },
  plate_too_long: { to: "wall" },
  // support battens
  "support-spacing-unresolved": cardField("rules.maxSpacingMm", "enter the maximum spacing"),
  "too-many-elements": cardField("rules.maxSpacingMm", "too many battens: check the spacing"),
  "spacing-constraints-incompatible": cardField("rules.maxSpacingMm", "no spacing fits beside the joints: change it"),
  "required-station-outside": cardField("rules.startOffsetMm", "a joint batten is outside the batten range: check the offsets"),
  "required-stations-conflict": cardField("product.size", "two joint battens are too close: use a wider batten"),
  "fixings-not-quantified": cardField("rules.fixing", "choose how the fixings are counted"),
  "fixing-pack-missing": cardField("rules.fixing", "enter the fixings' box size and spare"),
  "scope-reason-missing": { to: "group", fallbackField: "rules.fixingScope", say: "give the reason" },
  "manual-layout-authority-missing": cardField("rules.manualLayout", "name who set the batten layout"),
  "manual-station-outside": cardField("rules.manualLayout", "a batten position is off the wall: correct it"),
  "zone-needs-stations": cardField("rules.manualLayout", "enter the batten positions"),
  "zone-tuple-incomplete": cardField("rules.fixing", "the edge zone needs its fixing"),
  "needs-joint-detail": { to: "group", fallbackField: "product.lengths", say: "a piece is longer than the stock: add a longer length" },
  "short-support-piece": { to: "card", field: null, say: "a batten piece is under the minimum length: check the detail" },
  "attachment-targets-missing": { to: "card", field: null, say: "enter the frame members the battens cross" },
  "too-few-attachments": { to: "card", field: null, say: "a batten has too few fixing points: check the detail" },
  "support-span-exceeded": { to: "card", field: null, say: "a batten spans too far between frame members: check the detail" },
  // accessory groups
  "flashing-length-kind-missing": group("say whether the flashings are tight or finished lengths"),
  "flashing-edges-invalid": group("choose the opening edges to flash"),
  "flashing-profile-missing": group("link the flashing profile"),
  "flashing-extension-ambiguous": group("say whether the extensions are in the allowance"),
  "flashing-possible-double-count": group("choose the drawn or the hand-measured flashing"),
  "roll-length-missing": group("enter the tape roll length"),
  "sealant-yield-missing": group("enter the cartridge size and yield"),
  "ventilation-spec-missing": group("enter the ventilation specification"),
  "shared-id-conflict": group("an item is measured differently on two walls: reconcile it"),
  // accessories.js ctx.unresolved(message, code): the group can't be worked out yet
  "routes-missing": group("choose where it runs"),
  "corner-height-missing": group("enter the corner's height"),
  "corner-conflict": group("a corner has two heights: correct it"),
  "membrane-roll-opening-policy": group("use estimate mode or a reviewed quantity for the membrane"),
  "membrane-roll-data-missing": group("enter the roll width and length"),
  "tape-seams-unknown": group("enter the membrane seam length"),
  "sealant-bead-missing": group("enter the bead count and size"),
  "mesh-double-count": group("the mesh is counted twice: remove one"),
  "cut-ends-unknown": group("enter the number of cut ends"),
  "manual-quantity-missing": group("enter the reviewed quantity"),
  "unknown-accessory-kind": group("choose what kind of item it is"),
  // flashing lines (HUB 010's own route)
  ceiling_exceeded: { to: "flashing" },
  ceiling_unknown: { to: "flashing" },
  split_stale: { to: "flashing" },
  split_invalid: { to: "flashing" },
  profile_invalid: { to: "flashing" },
  perforation_incomplete: { to: "flashing" },
  path_in_progress: { to: "flashing" },
});

/** An accessory group's "<kind>-yield-unresolved" (a coating, primer … with no reviewed yield) is named by its kind. */
const YIELD_UNRESOLVED = group("enter the reviewed yield");
/** The table entry for a code (the one code the engine builds from a group's kind is matched by its ending). */
export const fixEntryFor = (code) => FIX_TARGETS[code] || (/^[a-z]+(-[a-z]+)*-yield-unresolved$/.test(String(code)) ? YIELD_UNRESOLVED : null);

/** timber.js invalid_input refs[0].field → the card field that fixes it (others open the card). */
const INPUT_FIELDS = { Pitch: "rules.pitchDeg", pitchDeg: "rules.pitchDeg", offsets: "rules.startOffsetMm", spacing: "rules.centresMm", stock: "stock.maxMm",
  unavailableMm: "stock.maxMm", "sizing.ref": "section", purpose: null };
/** Flashing codes that belong to the whole flashing (one row per flashing), the rest to a run (one row per length). */
const FLASHING_ITEM_CODES = new Set(["material_incomplete", "profile_invalid", "perforation_incomplete", "ceiling_unknown"]);
/** The plan codes a measurement carries (computed.contributions[].problems) that a measurement target fixes. */
const MEASUREMENT_CODES = new Set(["calibration_missing", "calibration_not_ready", "calibration_superseded", "outside_region", "plan_superseded",
  "measurement_invalid", "measurement_unused"]);

/** familyProblems' needs, in plain words (the engine message stays on the line and the card). */
const NEED_ACTION = {
  product: (x) => (x.family === "batten" ? "choose the batten product" : x.family === "accessory" ? "name this accessory set" : "choose the product"),
  "product.size": (x) => (x.family === "batten" ? "enter the batten size" : "enter the product's width and thickness"),
  "product.cover": () => "enter the effective cover",
  "product.lengths": (x) => (x.family === "batten" ? "enter the stock lengths" : "enter the stock lengths or sheet heights"),
  coating: () => "choose factory-coated or applicator-coated",
  orderIncrementM: () => "enter the supplier's LM ordering step",
  section: () => "enter the timber section",
  grade: () => "enter the grade or species",
  treatment: () => "enter the treatment",
  "stock.maxMm": () => "set the longest length (at least 1,200 mm)",
  profile: () => "enter the profile size",
  kerfMm: () => "confirm the saw kerf",
};

// ── small helpers ────────────────────────────────────────────────────────────

const andList = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const orList = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`);
const VERB = /^(Enter|Choose|Confirm|Select|Name|Add|Draw|Measure|Trace|Scale|Remove|Check|Set|Give|Link|Say|Keep|Record|Split|Use|Move|Lower|Correct|Review|Reconcile|Retrace)\b/;
const lowerFirst = (s) => (VERB.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const noStop = (s) => String(s ?? "").trim().replace(/\.$/, "");
/** The instruction before an engine message's explanation ("… — retrace it." keeps the part that says what to do). */
const cutAtDash = (s) => lowerFirst(noStop(String(s ?? "").split(" — ")[0]));
const wallName = (m) => m?.inputs?.name || m?.label || "Wall";
const isTraced = (m) => Array.isArray(m?.points) && m.points.length >= 2;

function productField(missing = []) {
  const ms = (missing || []).map(String);
  if (ms.includes("coating")) return "coating";
  if (ms.some((k) => /cover/.test(k))) return "product.cover";
  if (ms.some((k) => /width|thickness/.test(k))) return "product.size";
  if (ms.some((k) => /length/.test(k))) return "product.lengths";
  return "product";
}
const missingWords = (missing = []) => andList((missing || []).map((k) => String(k).replace(/ \(mm\)$/, "")));
/** A Walls item's part named by a piece label ("Wall 2 stud @ 1,177.5 …"), for its longest length. */
function partFromLabel(message) {
  const s = String(message || "").split(":")[0].toLowerCase();
  if (/\bnoggin/.test(s)) return "noggins";
  if (/\bplate/.test(s)) return "plates";
  if (/\bstud/.test(s)) return "studs";
  return undefined;
}

/**
 * The walls of an item, as one short phrase: numbered walls as ranges, then the others ("Walls 1, 3–11",
 * "Walls 12–13", "Wall 3", "Walls 1, 3, North", "North, South"). Four parts at most, then "+N more".
 */
export function wallsText(names) {
  const list = [...new Set((names || []).map((n) => String(n ?? "").trim()).filter(Boolean))];
  if (!list.length) return null;
  const nums = [], others = [];
  for (const n of list) { const m = /^Wall (\d+)$/i.exec(n); if (m) nums.push(Number(m[1])); else others.push(n); }
  nums.sort((a, b) => a - b);
  const runs = [];
  for (const v of nums) { const r = runs[runs.length - 1]; if (r && v === r[1] + 1) r[1] = v; else runs.push([v, v]); }
  const numbered = runs.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`));
  others.sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const parts = [...numbered, ...others];
  const shown = parts.length > 4 ? [...parts.slice(0, 4), `+${parts.length - 4} more`] : parts;
  if (!nums.length) return shown.join(", ");
  return `${nums.length === 1 ? "Wall" : "Walls"} ${shown.join(", ")}`;
}

/** Why a wall is incomplete, as a line's reason ("Wall 3 has no Wall height"). */
function missingReason(tag, missing = []) {
  if (missing.includes("scale")) return `${tag} is on a plan page with no scale`;
  if (missing.includes("outline")) return `${tag} has no traced outline`;
  const fields = missing.filter((f) => WALL_FIELD_LABELS[f] && f !== "outline");
  if (!fields.length) return `${tag} is missing its size`;
  if (fields.length === 2 && fields.includes("startHeightMm") && fields.includes("endHeightMm")) return `${tag} has no Height at start or end`;
  return `${tag} has no ${orList(fields.map((f) => WALL_FIELD_LABELS[f]))}`;
}

/**
 * The identity of a fix, for dedupe: one tap is one row. A measurement's fix (wall, page, retrace) is the same tap
 * whichever item it holds up, so the item isn't part of its key; a card or an apply is the item's own.
 */
export function fixTargetKey(t) {
  if (!t) return "none";
  switch (t.kind) {
    case "wall": return `wall|${t.measurementId}|${t.field || ""}|${t.openingId || ""}|${t.sheet || ""}`;
    case "scale": case "rescale": return `${t.kind}|${t.documentId}|${t.pageIndex}`;
    case "measure": return `measure|${t.tool ? `${t.materialId}|${t.tool}` : `${t.documentId}|${t.pageIndex}|${[...(t.measurementIds || [])].sort().join(",")}`}`;
    case "card": return `card|${t.materialId}|${t.field || ""}|${t.part || ""}|${t.group || ""}`;
    case "apply": return `apply|${t.action}|${t.materialId}|${t.contributionId || ""}`;
    // a flashing's own codes (no colour …) are one fix for the whole flashing; a run's are per length
    case "flashing": return `flashing|${t.materialId}|${(t.problems || []).every((c) => FLASHING_ITEM_CODES.has(c)) ? "" : t.bucketKey || ""}|${(t.problems || []).join(",")}`;
    default: return `${t.kind}|${t.materialId || ""}`;
  }
}

// ── fixesFor ─────────────────────────────────────────────────────────────────

/**
 * Every fix that stands between this takeoff and a placeable order, as rows (see the header).
 * @param {object} computed  computeWorkspace(snapshot)
 * @param {{ materials: object[], measurements: object[], contributions: object[] }} snapshot  the workspace view
 * @param {{ section?: string, materialId?: string }} [opts]  one section's items; or the rows that hold up one item's
 *   panel (its own problems, plus those of the other items that feed a pooled line it lists)
 * @returns {object[]}
 */
export function fixesFor(computed, snapshot, { section = null, materialId = null } = {}) {
  if (!computed || !snapshot) return [];
  const mats = (snapshot.materials || []).filter((m) => !m.archived);
  const matById = new Map(mats.map((m) => [m.id, m]));
  const order = new Map(mats.map((m, i) => [m.id, i]));
  const meas = new Map((snapshot.measurements || []).filter((m) => !m.archived).map((m) => [m.id, m]));
  const live = (snapshot.contributions || []).filter((c) => !c.archived);
  const results = computed.materialResults || {};
  const computedContribs = computed.contributions || [];
  const lines = computed.scheduleLines || [];
  const inScope = (m) => !!m && (!section || materialSection(m) === section);
  const measured = new Set(computedContribs.map((c) => c.jobMaterialId));
  const nameCount = new Map();
  for (const m of mats) { const k = String(m.name || "").trim().toLowerCase(); nameCount.set(k, (nameCount.get(k) || 0) + 1); }

  // each item's walls (one per live contribution, as dispatch.js sees them), their tags and the item's walls phrase
  const infoCache = new Map();
  const info = (mat) => {
    if (infoCache.has(mat.id)) return infoCache.get(mat.id);
    const walls = live.filter((c) => c.jobMaterialId === mat.id).map((c) => meas.get(c.measurementId)).filter((m) => m?.kind === "wall");
    const tags = wallTagsOf(walls.map((m) => ({ id: m.id, name: wallName(m) })));
    const unique = [...new Map(walls.map((m) => [m.id, m])).values()];
    const same = (nameCount.get(String(mat.name || "").trim().toLowerCase()) || 0) > 1;
    const wallsPhrase = wallsText(unique.map(wallName));
    const groups = Array.isArray(mat.rules?.recipe?.groups) ? mat.rules.recipe.groups : [];
    const it = { walls: unique, tags, same, wallsPhrase, groups, family: mat.spec?.family || "flashing",
      displayName: same && wallsPhrase ? `${mat.name || "Item"} (${wallsPhrase})` : mat.name || "Item" };
    infoCache.set(mat.id, it);
    return it;
  };
  const tagOf = (mat, m) => info(mat).tags.get(m.id) || wallName(m);

  /** The wall (and opening) a material problem is about: by its refs, else by the wall tag that starts its message. */
  const attribute = (mat, p) => {
    const it = info(mat);
    const byId = new Map(it.walls.map((w) => [w.id, w]));
    const byTag = new Map(it.walls.map((w) => [tagOf(mat, w), w]));
    for (const r of p.refs || []) {
      if (!r || typeof r !== "object") continue;
      if (r.openingId) {
        const o = meas.get(r.openingId);
        const w = (r.measurementId && byId.get(r.measurementId)) || (o?.kind === "opening" ? byId.get(o.parentId) : null);
        if (w) return { wall: w, openingId: o?.kind === "opening" ? o.id : null };
      }
      if (r.measurementId && byId.has(r.measurementId)) return { wall: byId.get(r.measurementId), openingId: null };
      if (r.wallId && (byId.has(r.wallId) || byTag.has(r.wallId))) return { wall: byId.get(r.wallId) || byTag.get(r.wallId), openingId: null };
    }
    const msg = String(p.message || "");
    let best = null, len = 0;
    for (const w of it.walls) {
      for (const k of new Set([tagOf(mat, w), wallName(w)])) {
        if (k.length > len && (msg.startsWith(`${k}:`) || msg.startsWith(`${k} `))) { best = w; len = k.length; }
      }
    }
    return { wall: best, openingId: null };
  };

  /** The accessory group a problem names (refs role, or its label or id starting the message). */
  const groupOf = (mat, p) => {
    const gs = info(mat).groups;
    const role = (p.refs || []).map((r) => r?.role).find(Boolean);
    const msg = String(p.message || "");
    return gs.find((g) => g.id === role) || gs.find((g) => [g.label, g.id].some((k) => k && (msg.startsWith(`${k}:`) || msg.startsWith(`${k} `)))) || null;
  };

  /** The wall a joint row doesn't fit (its layout's height, or length for horizontal sheets), else the first wall. */
  const jointRowWall = (mat, x) => {
    if (x.wall) return x.wall;
    const jr = mat.rules?.jointRows;
    const horizontal = mat.spec?.orientation === "horizontal";
    const lays = (results[mat.id]?.layouts || []).filter((l) => l?.wallMeasurementId && l.wall?.bbox);
    if (jr && Array.isArray(jr.atMm) && jr.atMm.length && Number.isFinite(jr.gapMm)) {
      const lo = Math.min(...jr.atMm), hi = Math.max(...jr.atMm) + jr.gapMm;
      const misfit = lays.find((l) => { const b = l.wall.bbox; const [a, z] = horizontal ? [b.x0, b.x1] : [b.y0, b.y1]; return !(lo > a + 0.001 && hi < z - 0.001); });
      if (misfit && meas.get(misfit.wallMeasurementId)) return meas.get(misfit.wallMeasurementId);
    }
    return info(mat).walls[0] || null;
  };

  const toCard = (x, field, extra = {}) => ({ kind: "card", materialId: x.mat.id, field: field ?? null, ...extra });
  const toWall = (x, extra = {}) => (x.wall ? { kind: "wall", materialId: x.mat.id, measurementId: x.wall.id, ...extra } : toCard(x, null));
  const toRetrace = (x) => {
    const m = x.m || x.wall;
    return m && isTraced(m) && m.documentId != null ? { kind: "measure", materialId: x.mat.id, documentId: m.documentId, pageIndex: m.pageIndex ?? 0, measurementIds: [m.id] } : toWall(x);
  };
  const toPage = (kind, x) => {
    const m = x.m || x.wall;
    return m && m.documentId != null ? { kind, documentId: m.documentId, pageIndex: m.pageIndex ?? 0, measurementIds: [m.id] } : toWall(x);
  };
  const toJointRow = (x) => { const w = jointRowWall(x.mat, x); return w ? { kind: "wall", materialId: x.mat.id, measurementId: w.id, sheet: "jointRow" } : toCard(x, null); };
  const fieldOf = (entry, x) => (typeof entry.field === "function" ? entry.field(x) : entry.field);

  /** code-table resolver → the concrete target */
  const resolve = (entry, x) => {
    switch (entry.to) {
      case "wallMissing": {
        const missing = x.p.refs?.[0]?.missing || [];
        if (missing.includes("scale")) return toPage("scale", x);
        if (missing.includes("outline")) return toRetrace(x);
        const f = missing.find((k) => FIX_WALL_FIELDS.includes(k));
        return toWall(x, f ? { field: f } : {});
      }
      case "wall": {
        const f = (x.p.refs?.[0]?.missing || []).find((k) => FIX_WALL_FIELDS.includes(k));
        return toWall(x, f ? { field: f } : {});
      }
      case "opening": return toWall(x, x.openingId ? { openingId: x.openingId } : {});
      case "sheetTooTall":
        // no joint rule yet: the wall page's own one tap, Blue Leaf's 10 mm joint with an H-flashing (HUB 015), for every wall
        if (!x.mat.rules?.jointRows) return { kind: "apply", materialId: x.mat.id, action: "useSheetJoint", jointRows: { atMm: [], ...BLUE_LEAF_SHEET_JOINT } };
        return toJointRow(x);
      case "jointRow": return toJointRow(x);
      case "retrace": return toRetrace(x);
      case "scale": return toPage("scale", x);
      case "rescale": return toPage("rescale", x);
      case "card": {
        const part = typeof entry.part === "function" ? entry.part(x) : entry.part;
        return toCard(x, fieldOf(entry, x), part ? { part } : {});
      }
      case "need": return toCard(x, x.p.field ?? null, x.p.part ? { part: x.p.part } : {});
      case "group": {
        const g = groupOf(x.mat, x.p);
        return g ? toCard(x, "rules.recipe", { group: g.id }) : toCard(x, x.family === "accessory" ? "rules.recipe" : entry.fallbackField ?? null);
      }
      case "wallOrCard": return x.wall ? toWall(x) : toCard(x, fieldOf(entry, x));
      case "clearAssembly": return { kind: "apply", materialId: x.mat.id, action: "clearAssembly" };
      case "removeContribution": return x.contribution
        ? { kind: "apply", materialId: x.mat.id, action: "removeContribution", contributionId: x.contribution.contributionId, measurementId: x.contribution.measurementId }
        : toCard(x, null);
      case "tool": return { kind: "measure", materialId: x.mat.id, tool: entry.tool, documentId: null, pageIndex: null, measurementIds: [] };
      case "runs": {
        const runs = live.filter((c) => c.jobMaterialId === x.mat.id).map((c) => meas.get(c.measurementId)).filter((m) => m && isTraced(m) && m.kind !== "wall");
        const first = runs[0];
        return first ? { kind: "measure", materialId: x.mat.id, documentId: first.documentId ?? null, pageIndex: first.pageIndex ?? 0,
          measurementIds: runs.filter((m) => m.documentId === first.documentId && (m.pageIndex ?? 0) === (first.pageIndex ?? 0)).map((m) => m.id) } : toCard(x, null);
      }
      case "flashing": return { kind: "flashing", materialId: x.mat.id, bucketKey: x.bucketKey ?? null, problems: [x.p.code] };
      default: return toCard(x, null);
    }
  };

  /** The words of a row: subject + action (+ short, text, reason). */
  const words = (entry, x) => {
    const msg = noStop(x.p.message);
    // the engine already says "Wall 3: enter …" / "Studs: enter …" / "Trims: …": keep its subject and action
    let subject = x.subject, action = null;
    for (const s of [x.tag, x.wall ? wallName(x.wall) : null, x.partLabel, x.groupLabel, x.groupId].filter(Boolean)) {
      if (msg.startsWith(`${s}: `)) { action = lowerFirst(msg.slice(s.length + 2)); if (s === x.partLabel || s === x.groupLabel || s === x.groupId) subject = x.groupLabel && s === x.groupId ? x.groupLabel : s; break; }
    }
    if (entry.to === "need") {
      action = (NEED_ACTION[x.p.field] || (() => cutAtDash(action ?? msg)))(x);
      subject = x.partLabel || x.name;
    } else if (typeof entry.say === "function") action = entry.say(x);
    else if (typeof entry.say === "string") action = entry.say;
    else if (action == null) action = cutAtDash(msg);
    const short = entry.short ? entry.short({ ...x, subject }) : `${subject}: ${action}`;
    const reason = x.p.code === "wall_incomplete" && x.wall ? missingReason(subject, x.p.refs?.[0]?.missing || []) : short;
    return { subject, action, short, reason };
  };

  const rows = new Map();
  const put = (target, x, w, extra = {}) => {
    const key = fixTargetKey(target);
    const it = info(x.mat);
    const text = w.subject === x.name ? `${it.displayName}: ${w.action}` : entry2text(w, it.displayName, x.name);
    const cur = rows.get(key);
    // the problems a row stands for, each once (the same problem said on every line is one)
    const source = `${x.mat.id}|${x.p.code}|${x.p.message}|${x.m?.id || x.wall?.id || ""}`;
    if (cur) {
      if (!cur.codes.includes(x.p.code)) cur.codes.push(x.p.code);
      cur.sources.add(source);
      cur.count = cur.sources.size;
      if (!cur.materialIds.includes(x.mat.id)) cur.materialIds.push(x.mat.id);
      if (x.wall && !cur.wallIds.includes(x.wall.id)) cur.wallIds.push(x.wall.id);
      for (const id of target.measurementIds || []) if (!cur.target.measurementIds.includes(id)) cur.target.measurementIds.push(id);
      if (extra.bucketKey && !cur.bucketKeys.includes(extra.bucketKey)) cur.bucketKeys.push(extra.bucketKey);
      return cur;
    }
    const row = { key, target: { ...target, ...(target.measurementIds ? { measurementIds: [...target.measurementIds] } : {}) }, code: x.p.code, codes: [x.p.code], count: 1, sources: new Set([source]),
      materialId: x.mat.id, materialIds: [x.mat.id], materialName: x.mat.name || "Item", walls: it.wallsPhrase, wallId: x.wall?.id ?? null,
      wallIds: x.wall ? [x.wall.id] : [], bucketKeys: extra.bucketKey ? [extra.bucketKey] : [], subject: w.subject, action: w.action, short: w.short, text, reason: w.reason,
      order: [order.get(x.mat.id) ?? 1e9, rows.size] };
    rows.set(key, row);
    return row;
  };
  // "Wall 3 on Axon 400 smooth: enter …"; a phrase with no colon ("Wall 4 is sloped …") names the item after it
  // (a row that already names its item, "… remove it from Axon 400 smooth", is its own text)
  const entry2text = (w, item, name) => (w.short.startsWith(`${w.subject}: `) ? `${w.subject} on ${item}: ${w.action}` : w.short.includes(name) ? w.short : `${w.short} (${item})`);

  /** One blocking problem of an item → its row. */
  const fromProblem = (mat, p, extra = {}) => {
    if (!p || p.blocking === false || isInstallationNote(p) || NEVER_ROWS.has(p.code)) return;
    const entry = fixEntryFor(p.code) || { to: "card", field: p.field ?? null, fallback: true };
    if (entry.fromContributions) {
      // the item's own copy says "a run is assigned …": each measurement that carries the code is its own row
      for (const c of computedContribs.filter((k) => k.jobMaterialId === mat.id && (k.problems || []).includes(p.code))) fromCode(mat, c, p.code, extra);
      return;
    }
    const it = info(mat);
    const { wall, openingId } = attribute(mat, p);
    const op = openingId ? meas.get(openingId) : null;
    const g = entry.to === "group" ? groupOf(mat, p) : null;
    const part = p.part && WALL_PARTS.includes(p.part) ? WALL_PART_LABELS[p.part] : null;
    const tag = wall ? tagOf(mat, wall) : null;
    const x = { mat, p, name: mat.name || "Item", family: it.family, wall, m: wall, tag, openingId, openingLabel: op?.inputs?.label || null,
      partLabel: part, groupLabel: g ? g.label || g.id : null, groupId: g?.id ?? null, subject: tag || (g ? g.label || g.id : null) || part || mat.name || "Item",
      page: wall?.pageIndex != null ? wall.pageIndex + 1 : 1, bucketKey: extra.bucketKey ?? null };
    const target = resolve(entry, x);
    x.target = target;
    // a card or a one-tap fix belongs to the item (or its part / accessory group), never to the one wall that said it
    if (target.kind === "card" || target.kind === "apply") x.subject = x.groupLabel || x.partLabel || x.name;
    const row = put(target, x, words(entry, x), extra);
    if (entry.fallback) row.fallback = true;
  };

  /** A raw plan code on one measurement (contribution) → its row. */
  const fromCode = (mat, c, code, extra = {}) => {
    const m = meas.get(c.measurementId);
    if (!m) return;
    const entry = fixEntryFor(code) || { to: "retrace", fallback: true };
    const isWall = m.kind === "wall";
    const tag = isWall ? tagOf(mat, m) : null;
    const label = tag || m.label || m.inputs?.name || null;
    const x = { mat, p: { code, message: PROBLEM_TEXT[code] || code, blocking: true }, name: mat.name || "Item", family: info(mat).family, wall: isWall ? m : null, m, tag,
      contribution: c, subject: label || `A ${m.kind || "measurement"}`, measuredAs: label || `A ${m.kind || "measurement"}`, page: (m.pageIndex ?? 0) + 1,
      bucketKey: extra.bucketKey ?? null };
    const target = resolve(entry, x);
    x.target = target;
    const w = words(entry.say || entry.short ? entry : { ...entry, say: lowerFirst(noStop(PROBLEM_TEXT[code] || code)) }, x);
    const row = put(target, x, w, extra);
    if (entry.fallback) row.fallback = true;
  };

  /** A problem on a line that no item's problems explain (e.g. "A timber line has no stock length.") → the item's card. */
  const fromLineText = (mat, s, extra) => fromProblem(mat, { code: "line_problem", message: s, blocking: true }, extra);

  /** A flashing line → HUB 010's route: one row per flashing for its own codes, one per length for a run's. */
  const fromFlashingLine = (l) => {
    const mat = matById.get(l.jobMaterialIds?.[0]);
    if (!mat || !(l.problems || []).length) return;
    const own = l.problems.filter((c) => FLASHING_ITEM_CODES.has(c));
    const run = l.problems.filter((c) => !FLASHING_ITEM_CODES.has(c));
    const len = Number.isFinite(l.finishedLengthMm) ? `${formatMm(l.finishedLengthMm)} mm` : null;
    for (const code of own) {
      const target = { kind: "flashing", materialId: mat.id, bucketKey: l.bucketKey, problems: [code] };
      const key = fixTargetKey(target);
      const action = lowerFirst(noStop(PROBLEM_TEXT[code] || code));
      const prev = rows.get(key);
      if (prev) { if (!prev.bucketKeys.includes(l.bucketKey)) prev.bucketKeys.push(l.bucketKey); prev.count += 1; continue; }
      rows.set(key, { key, target, code, codes: [code], count: 1, materialId: mat.id, materialIds: [mat.id], materialName: mat.name || "Flashing", walls: null, wallId: null, wallIds: [],
        bucketKeys: [l.bucketKey], subject: mat.name || "Flashing", action, short: `${mat.name || "Flashing"}: ${action}`, text: `${mat.name || "Flashing"}: ${action}`,
        reason: action, order: [order.get(mat.id) ?? 1e9, rows.size] });
    }
    if (run.length) {
      const target = { kind: "flashing", materialId: mat.id, bucketKey: l.bucketKey, problems: run };
      const key = fixTargetKey(target);
      if (rows.has(key)) return;
      const subject = `${mat.name || "Flashing"}${len ? ` ${len}` : ""}`;
      const action = lowerFirst(noStop(PROBLEM_TEXT[run[0]] || run[0]));
      rows.set(key, { key, target, code: run[0], codes: [...run], count: 1, materialId: mat.id, materialIds: [mat.id], materialName: mat.name || "Flashing", walls: null, wallId: null,
        wallIds: [], bucketKeys: [l.bucketKey], subject, action, short: `${subject}: ${action}`, text: `${subject}: ${action}`, reason: action, order: [order.get(mat.id) ?? 1e9, rows.size] });
    }
  };

  // 1. each measured generic item's own blocking problems
  const own = mats.filter((m) => isGenericMaterial(m) && inScope(m) && measured.has(m.id) && (!materialId || m.id === materialId));
  for (const mat of own) for (const p of results[mat.id]?.problems || []) fromProblem(mat, p);
  // 2. the raw plan codes on its measurements (a wall re-scaled, outside the scaled area, on the wrong material …)
  const ownIds = new Set(own.map((m) => m.id));
  for (const c of computedContribs) {
    const mat = matById.get(c.jobMaterialId);
    if (!mat || !ownIds.has(mat.id)) continue;
    for (const code of c.problems || []) if (MEASUREMENT_CODES.has(code)) fromCode(mat, c, code);
  }
  // 3. every listed line's problems, pooled lines included: matched back to the item (and measurement) they came from
  const lineInScope = (l) => (materialId ? (l.jobMaterialIds || []).includes(materialId) : (l.jobMaterialIds || []).some((id) => inScope(matById.get(id))));
  const blockingByMessage = new Map();
  const byMessage = (id) => {
    if (!blockingByMessage.has(id)) blockingByMessage.set(id, new Map((results[id]?.problems || []).filter((p) => p.blocking !== false).map((p) => [p.message, p])));
    return blockingByMessage.get(id);
  };
  for (const l of lines) {
    if (!lineInScope(l) || !(l.problems || []).length) continue;
    if (!l.generic) { fromFlashingLine(l); continue; }
    const ext = { bucketKey: l.bucketKey };
    for (const s of l.problems) {
      const src = (l.jobMaterialIds || []).map((id) => [id, byMessage(id).get(s)]).find(([, p]) => p);
      if (src) { const mat = matById.get(src[0]); if (mat) fromProblem(mat, src[1], ext); continue; }
      if (PROBLEM_TEXT[s]) {
        // a raw plan code: the measurements of this line that carry it, else any of its items' measurements (the code
        // is said on every line of the item)
        let cs = computedContribs.filter((c) => (l.contributionIds || []).includes(c.contributionId) && (c.problems || []).includes(s));
        if (!cs.length) cs = computedContribs.filter((c) => (l.jobMaterialIds || []).includes(c.jobMaterialId) && (c.problems || []).includes(s));
        for (const c of cs) { const mat = matById.get(c.jobMaterialId); if (mat) fromCode(mat, c, s, ext); }
        if (cs.length) continue;
      }
      const mat = matById.get(l.jobMaterialIds?.[0]);
      if (mat) fromLineText(mat, s, ext);
    }
  }
  // 4. a flashing run with no line at all (no scale, invalid …): its own measurement fix, else HUB 010's route
  for (const u of computed.unplaced || []) {
    const mat = matById.get(u.jobMaterialId);
    if (!mat || isGenericMaterial(mat) || !inScope(mat) || (materialId && mat.id !== materialId)) continue;
    const c = computedContribs.find((k) => k.contributionId === u.contributionId) || { contributionId: u.contributionId, measurementId: null, jobMaterialId: mat.id };
    for (const code of u.problems || []) {
      if (MEASUREMENT_CODES.has(code) && code !== "measurement_unused" && meas.get(c.measurementId)) fromCode(mat, c, code);
      else {
        const target = { kind: "flashing", materialId: mat.id, bucketKey: null, problems: [code] };
        const key = fixTargetKey(target);
        if (rows.has(key)) continue;
        const action = lowerFirst(noStop(PROBLEM_TEXT[code] || code));
        rows.set(key, { key, target, code, codes: [code], count: 1, materialId: mat.id, materialIds: [mat.id], materialName: mat.name || "Flashing", walls: null, wallId: null, wallIds: [],
          bucketKeys: [], subject: mat.name || "Flashing", action, short: `${mat.name || "Flashing"}: ${action}`, text: `${mat.name || "Flashing"}: ${action}`, reason: action,
          order: [order.get(mat.id) ?? 1e9, rows.size] });
      }
    }
  }

  // a page's rows name every wall they cover ("Page 7 was re-scaled: use the new scale for Wall 3 and Wall 5")
  for (const r of rows.values()) {
    if (r.target.kind !== "rescale" && r.target.kind !== "scale") continue;
    const mat = matById.get(r.materialId);
    const names = r.target.measurementIds.map((id) => meas.get(id)).filter(Boolean).map((m) => (m.kind === "wall" && mat ? tagOf(mat, m) : m.label || m.inputs?.name || `a ${m.kind}`));
    const page = (r.target.pageIndex ?? 0) + 1;
    if (r.target.kind === "rescale") {
      r.subject = `Page ${page}`;
      r.action = `was re-scaled: use the new scale for ${andList(names)}`;
      r.short = r.reason = `Page ${page} was re-scaled: use the new scale for ${andList(names)}`;
      r.text = r.short;
    } else if (r.code !== "wall_incomplete") {
      r.subject = `Page ${page}`;
      r.text = r.short;
    }
  }
  return [...rows.values()].sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1]).map(({ order: _o, sources: _s, ...r }) => r);
}
