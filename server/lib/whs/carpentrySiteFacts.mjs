// carpentrySiteFacts.mjs — the shared SITE-FACTS layer (Questionnaire spec §2). Fourteen physical facts
// about THIS site, asked once, that resolve ~50 control tick-boxes by propagating each fact to every
// module that references it (a fact asked seven times → asked once). Pure; mirror of
// src/lib/carpentrySiteFacts.js (parity-tested).
//
// ⚠ SAFETY-JUDGEMENT DATA — DRAFT. Each entry in SF_RESOLVE asserts "this site-fact answer establishes
// this specific control in this module". That is a competent-WHS-reviewer decision, transcribed here from
// the safety agent's §2 mapping against the real register control texts. It is NOT usable on site until
// the reviewer confirms it (the whole pack is DRAFT-gated). Targets are keyed by a text PREFIX that must
// match exactly one control in the module — validated by scripts/tests/carpentry-sitefacts-resolve.test.mjs.

export const SF_QUESTIONS = [
  { key: "sf01Scaffold", q: "Perimeter scaffold on site?", options: [["green", "Yes — green tag + handover cert"], ["untagged", "Yes — not yet tagged"], ["no", "No"]] },
  { key: "sf02Guardrail", q: "Perimeter guardrail / edge protection installed?", options: [["yes", "Yes"], ["no", "No"], ["na", "N/A"]] },
  { key: "sf03Openings", q: "How are openings and voids protected?", options: [["covers", "Fixed load-rated covers"], ["guardrail", "Guardrail"], ["decking", "Temporary decking"], ["none", "No openings on this job"]] },
  { key: "sf04Mesh", q: "Safety mesh or catch platform below the working level?", options: [["yes", "Yes"], ["no", "No"]] },
  { key: "sf05Exclusion", q: "1.5 m edge exclusion demarcated?", options: [["yes", "Yes — physically demarcated"], ["passive", "Not required — passive protection in place"]] },
  { key: "sf07FallSystem", q: "Fall system beyond scaffold / guardrail?", options: [["none", "None needed"], ["restraint", "Travel restraint"], ["arrest", "Fall arrest"], ["ewp", "EWP"]] },
  { key: "sf10Dust", q: "Dust control available for cutting?", options: [["extraction", "H-class on-tool extraction"], ["wet", "Wet suppression"], ["neither", "Neither"]] },
  { key: "sf11CutStation", q: "Cutting station?", options: [["ground", "Ground level, outdoors, downwind"], ["other", "Other — describe in Part 3"]] },
  { key: "sf12Overhead", q: "Overhead electrical services on the frontage?", options: [["none", "None"], ["confirmed", "Present — clearances confirmed with network operator"], ["deenergised", "Present — de-energised or relocated"], ["notyet", "Present — not yet addressed"]] },
  { key: "sf14Access", q: "Site access and egress to each work level?", options: [["scaffold", "Scaffold stairs"], ["ladder", "Secured ladder access"], ["ground", "Ground level only"]] },
];

// SF answer → the controls it establishes, as { code, p: <unique text prefix within that module> }.
export const SF_RESOLVE = {
  sf01Scaffold: {
    green: [
      { code: "H-01", p: "Perimeter scaffold erected to AS/NZS 1576" },
      { code: "H-02", p: "Perimeter scaffold with green tag in place" },
      { code: "H-03", p: "Perimeter scaffold with green tag, decked to a level" },
      { code: "H-04", p: "Perimeter scaffold with green tag, deck set at the correct height" },
      { code: "H-05", p: "Perimeter scaffold with green tag, decked at working height" },
      { code: "T-13", p: "Handover certificate received and scaffold tag inspected" },
      { code: "T-13", p: "Deck complete, guardrails and toeboards in place" },
    ],
  },
  sf02Guardrail: {
    yes: [
      { code: "H-01", p: "Guardrail system to the full open perimeter" },
      { code: "H-02", p: "Guardrail to the full open perimeter" },
      { code: "H-04", p: "Perimeter guardrail / edge protection to the roof perimeter" },
    ],
  },
  sf03Openings: {
    covers: [
      { code: "H-06", p: "Load-rated cover, mechanically fixed" },
      { code: "H-01", p: "All stair voids, lift shafts and penetrations covered" },
      { code: "H-03", p: "All stair voids and openings within the working area covered" },
    ],
    guardrail: [{ code: "H-06", p: "Guardrail to full perimeter of the opening" }],
    decking: [{ code: "H-06", p: "Opening infilled with temporary structural decking" }],
  },
  sf04Mesh: {
    yes: [
      { code: "H-01", p: "Catch platform / perimeter containment scaffold" },
      { code: "H-04", p: "Safety mesh or catch platform installed beneath" },
    ],
  },
  sf05Exclusion: {
    yes: [
      { code: "H-01", p: "1.5 m exclusion from any unprotected edge" },
      { code: "H-02", p: "1.5 m exclusion from unprotected edges" },
      { code: "H-03", p: "Guardrail or edge protection to the external perimeter where work within 1.5 m" },
      { code: "H-04", p: "Workers do not stand on or work closer than 1.5 m" },
    ],
  },
  sf07FallSystem: {
    restraint: [
      { code: "H-01", p: "Travel-restraint system: full-body harness" },
      { code: "H-02", p: "Travel restraint as per H-01" },
      { code: "H-03", p: "Travel restraint anchored to a rated anchor" },
      { code: "H-04", p: "Travel restraint to a rated anchor" },
    ],
    arrest: [{ code: "H-01", p: "Fall-arrest system" }],
    ewp: [
      { code: "H-05", p: "EWP with operator holding the appropriate high risk work licence" },
      { code: "H-04", p: "Fascia and barge fixed from an EWP" },
    ],
  },
  sf10Dust: {
    extraction: [
      { code: "T-01", p: "On-tool dust extraction with an H-class vacuum" },
      { code: "T-02", p: "On-tool dust extraction fitted to saws" },
    ],
    wet: [{ code: "T-01", p: "Wet suppression / water-fed cutting" }],
  },
  sf11CutStation: {
    ground: [
      { code: "T-01", p: "Designated outdoor cutting station, downwind" },
      { code: "T-02", p: "Cutting station located outdoors and downwind" },
      { code: "H-05", p: "Sheets cut to size at ground level in a designated cutting station" },
    ],
  },
  sf12Overhead: {
    confirmed: [
      { code: "H-07", p: "Overhead electrical services identified and no-go clearances confirmed" },
      { code: "H-11", p: "Overhead lines insulated/tiger-tailed by the network operator" },
    ],
    deenergised: [
      { code: "H-11", p: "Supply de-energised, isolated, locked and tagged" },
      { code: "H-11", p: "Overhead service relocated or undergrounded" },
    ],
  },
  sf14Access: {
    scaffold: [{ code: "T-10", p: "Defined, maintained access and egress route to every work level" }],
    ladder: [{ code: "T-10", p: "Defined, maintained access and egress route to every work level" }],
  },
};

// SF-06 (stop-work) lives in the existing Part-3 fields (answers.stopWind/stopHeat). When a limit is set,
// it establishes the "stop-work limit stated in Part 3" control in every module that references it.
export const STOPWORK_TARGETS = [
  { code: "H-02", p: "Stop-work wind limit stated in Part 3" },
  { code: "H-03", p: "Stop-work wind limit stated in Part 3" },
  { code: "H-04", p: "Stop-work limits for wind and rain stated in Part 3" },
  { code: "H-05", p: "Stop-work wind limit for sheet handling stated in Part 3" },
  { code: "H-07", p: "Stop-work wind limit per the crane operator's stated limit" },
];

const norm = (s) => String(s ?? "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Resolve site-facts + stop-work answers into the controls they establish.
 * @returns {{ byCode: Record<string,string[]>, targeted: number, unmatched: {code:string,p:string}[] }}
 *   byCode = { moduleCode: [exact control texts to tick] }. unmatched = targets whose prefix matched no
 *   control (a mapping/register drift — surfaced, never silently dropped).
 */
export function resolveSiteFacts(sf = {}, answers = {}, modulesByCode = {}) {
  const targets = [];
  for (const [key, byAnswer] of Object.entries(SF_RESOLVE)) {
    const ans = sf[key];
    if (ans && byAnswer[ans]) targets.push(...byAnswer[ans]);
  }
  if (answers.stopWind || answers.stopHeat) targets.push(...STOPWORK_TARGETS);

  const byCode = {}; const unmatched = []; let targeted = 0;
  for (const t of targets) {
    const m = modulesByCode[t.code];
    const opts = m?.content_json?.controlOptions || m?.contentJson?.controlOptions || [];
    const hit = opts.find((o) => norm(o.text).startsWith(norm(t.p)));
    if (!hit) { unmatched.push(t); continue; }
    (byCode[t.code] ||= []);
    if (!byCode[t.code].includes(hit.text)) { byCode[t.code].push(hit.text); targeted++; }
  }
  return { byCode, targeted, unmatched };
}
