/** Blue Leaf Building — standard tender exclusions (master template). */
export const DEFAULT_EXCLUSIONS_LIST = [
  "Not included is relocation of the existing meter box if required. Can provide PC sum if necessary",
  "Asbestos identification, testing, removal or remediation",
  "Rock excavation, hammering or blasting",
  "Removal, relocation or rectification of unknown or undocumented services",
  "Latent site conditions including unsuitable soil, groundwater or concealed structural defects",
  "Existing termite damage, treatment or rectification works",
  "Traffic control or council permits",
  "Authority fees, SA Water fees, service upgrade costs or utility provider charges",
  "Surveying, engineering redesign, architectural redesign or consultant variations after contract execution",
  "Client-requested design changes or variations after tender submission",
  "Landscaping, planting and irrigation unless noted",
  "Escalation in material pricing or supplier increases beyond tender validity period (30 days)",
  "Unforeseen structural rectification works to existing building elements"
];

export function cloneDefaultExclusions() {
  return [...DEFAULT_EXCLUSIONS_LIST];
}
