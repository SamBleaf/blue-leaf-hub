// carpentrySiteFactsClass.mjs — the remediation-brief §2 rule, ENCODED (Step 7). A site fact may auto-fill
// a control ONLY where the control asserts a state and nothing more. If the control text carries a
// sequencing clause, a dimension, a precondition, or a second independent obligation, the fact may
// highlight it — never tick it. This is the guardrail: scripts/tests/carpentry-sitefacts-class.test.mjs
// fails the build if any target the map marks auto-fill classifies as anything but A.
//
// Classes:  A = state only (auto-fillable)  ·  B = sequencing  ·  C = dimension  ·  D = precondition
//           E = two independent obligations in one control  (B–E are highlight-only)

const norm = (s) => String(s ?? "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim().toLowerCase();

export const NON_A_PATTERNS = {
  // WHEN / in what order — the fact can't establish timing.
  B_sequencing: /\b(before |at the moment|not progressively|each morning|in erection order|as each\b[^.]*\b(?:stood|created)|progressively\b[^.]*\boutward|walking route|erection sequence|loaded\b[^.]*\border|installed\b[^.]*\bbefore|deck set at the correct height|decked to a level)\b/i,
  // a measurement / dimension the fact doesn't carry.
  C_dimension: /(\d[\d.,]*\s?(?:mm|m\b|km\/h|°c|kg|%)|1\.5\s?m|900\s?[–-]\s?1100|≥\s?\d|>=\s?\d)/i,
  // "only where…", "installed by a competent person", "proved dead", "never to…" — a condition on the tick.
  D_precondition: /\b(only where|only once|only when|permitted only|installed by a competent person|by a competent person|by a licensed|proved dead|where required|never to|to any unbraced|once\b[^.]*\bbrac|until\b[^.]*\b(?:brac|cleared)|no person (?:stands|works|in the|shall))\b/i,
};

/** @returns {{cls:'A'|'B'|'C'|'D'|'E', reason:string, flags:string[]}} */
export function classifyTarget(controlText) {
  const t = norm(controlText);
  const flags = [];
  if (NON_A_PATTERNS.D_precondition.test(t)) flags.push("D:precondition");
  const sentences = t.split(/[.;]\s+/).map((x) => x.trim()).filter((x) => x.length > 18);
  const twoObligations = sentences.length >= 2;
  if (twoObligations) flags.push("E:two-obligations");
  if (NON_A_PATTERNS.C_dimension.test(t)) flags.push("C:dimension");
  if (NON_A_PATTERNS.B_sequencing.test(t)) flags.push("B:sequencing");
  // priority for the primary letter: D > E > C > B ; A only if nothing matched
  const cls = flags.length === 0 ? "A"
    : flags[0].startsWith("D") ? "D"
      : flags.find((f) => f.startsWith("E")) ? "E"
        : flags.find((f) => f.startsWith("C")) ? "C" : "B";
  return { cls, reason: flags.join(" · ") || "state only", flags };
}

export function isAutoFillable(controlText) { return classifyTarget(controlText).cls === "A"; }
