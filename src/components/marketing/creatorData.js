// creatorData.js — shared vocab, helpers and safe demo data for the media-first Content Creator (Run B).
//
// No live integrations. Angles are derived from the media asset's already-stored `analysis`
// (content_opportunities), so no new AI call is required to show "the asset → angles" flow.
// Demo data provides safe fallbacks when staging media / AI generation is unavailable.

// Audience vocabulary (UX redesign §11.1)
export const AUDIENCES = [
  { value: "homeowner", label: "Homeowners" },
  { value: "renovation_client", label: "High-end renovation clients" },
  { value: "custom_home_client", label: "Custom home clients" },
  { value: "architect_designer", label: "Architects & designers" },
  { value: "local_general", label: "Local audience" },
  { value: "passive_design", label: "Energy efficiency / passive design" },
];

// MVP platform set — Instagram + Facebook default; extras opt-in.
export const PLATFORMS = [
  { value: "instagram", label: "Instagram", default: true },
  { value: "facebook", label: "Facebook", default: true },
  { value: "website", label: "Website / FAQ", default: false },
  { value: "email", label: "Email", default: false },
  { value: "linkedin", label: "LinkedIn (copy)", default: false },
];

// Map a platform to the legacy /generate "channel" value.
export const PLATFORM_TO_CHANNEL = {
  instagram: "instagram",
  facebook: "facebook",
  website: "website",
  email: "email",
  linkedin: "website", // LinkedIn is copy-only in Stage 1 → reuse website channel for copy
};

// Derive selectable angle cards from an asset's stored analysis (no AI call).
export function deriveAnglesFromAnalysis(analysis) {
  const opps = Array.isArray(analysis?.content_opportunities) ? analysis.content_opportunities : [];
  const pillar = analysis?.suggested_pillar || "the_work";
  const hook = analysis?.suggested_caption_hook || "";
  return opps.slice(0, 6).map((opp, i) => ({
    id: `angle_${i + 1}`,
    title: typeof opp === "string" ? opp : opp.title || opp.angle || `Angle ${i + 1}`,
    subtitle: pillar.replace(/_/g, " "),
    why: hook || "Suggested from the photo analysis.",
    pillar,
    source: "analysis",
  }));
}

// Safe demo asset for when no staging media is reachable.
export const DEMO_ASSET = {
  id: "demo-asset",
  demo: true,
  preview_url: null,
  storage_path: null,
  thumbnail_path: null,
  stage_detected: "lock_up",
  capture_date: null,
  consent_for_marketing: true,
  analysis_status: "complete",
  analysis: {
    summary: "External wall wrap / weather membrane at the lock-up stage.",
    build_stage: "lock_up",
    visible_facts: ["Weather membrane visible over frame", "Battens fixed over the wrap", "Two-storey timber frame"],
    content_opportunities: [
      "Why we protect homes before cladding",
      "What weather-tightness means for comfort",
      "Behind the build: high-performance wall systems",
      "Detail matters: junctions before finishes",
    ],
    suggested_caption_hook: "The part of your home you will never see — but will always feel.",
    suggested_pillar: "how_we_build",
  },
};

export const DEMO_ANGLES = deriveAnglesFromAnalysis(DEMO_ASSET.analysis);

// Build a clearly-labelled demo draft when live AI generation is unavailable.
export function demoDraftFor(platform, angle) {
  return {
    demo: true,
    content: {
      title: angle?.title || "High-performance wall systems",
      body:
        `[DEMO DRAFT — AI generation is not available in this environment]\n\n` +
        `${angle?.why || ""}\n\n` +
        `Placeholder ${platform} draft built from the selected angle so the package and review UI ` +
        `can be reviewed without a live AI call. Real drafts appear once a staging/sandbox AI service exists.`,
      cta: "See how we build →",
      hashtags: platform === "instagram" ? ["blueleafbuilding", "highperformancehomes", "adelaidebuilder"] : [],
    },
    review_scores: {
      overall_pass: true,
      lead_quality: { score: 7 },
      apb_reference: { pass: true },
      demo: true,
    },
  };
}

// Derive Josh-facing operational labels from review scores + context (defensive on shape).
export function deriveJoshLabels({ reviewScores, hasMedia }) {
  const rs = reviewScores || {};
  const labels = [];
  if (!hasMedia) labels.push("Needs photo");
  const failed = rs.apb_reference?.pass === false || rs.overall_pass === false;
  labels.push(failed ? "Needs Sam approval" : "Ready for Josh review");
  const lq = typeof rs.lead_quality === "object" ? rs.lead_quality?.score : rs.lead_quality;
  if (typeof lq === "number" && lq >= 7) labels.push("Good lead quality topic");
  return labels;
}

// Derive a coarse risk level for the badge (defensive on shape).
export function deriveRiskLevel(reviewScores) {
  const rs = reviewScores || {};
  if (rs.apb_reference?.pass === false || rs.overpromise === true || rs.overall_pass === false) return "high";
  const weakSpecificity = typeof rs.specificity === "number" && rs.specificity < 5;
  const weakLocal = typeof rs.local_relevance === "number" && rs.local_relevance < 5;
  if (weakSpecificity || weakLocal) return "medium";
  return "low";
}
