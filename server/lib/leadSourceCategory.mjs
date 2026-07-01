/**
 * leadSourceCategory.mjs — CRM Control Spine (Batch 1A, migration 127).
 * Normalises the free-text/picklist `lead_source` into the mandatory
 * `lead_source_category` enum so every lead has a reportable source category,
 * without requiring a new field on every capture path.
 */

export const VALID_LEAD_SOURCE_CATEGORIES = [
  "website", "referral", "repeat", "social", "search", "advertising", "walk_in", "other",
];

// Keyword → category. Checked in order; first match wins. Covers the existing
// LEAD_SOURCES picklist (src/lib/salesPipeline.js) plus common free-text variants.
const KEYWORD_MAP = [
  { category: "referral",    re: /referral|architect|word of mouth|recommend/i },
  { category: "repeat",      re: /repeat|past client|existing client/i },
  { category: "website",     re: /website|web enquiry|enquiry form/i },
  { category: "social",      re: /social|instagram|facebook|tiktok/i },
  { category: "search",      re: /search|google(?! ads)|seo|organic/i },
  { category: "advertising", re: /advertis|google ads|meta ads|ppc|campaign|buildexact/i },
  { category: "walk_in",     re: /walk.?in|display home|show ?home/i },
  { category: "other",       re: /exhibition|event|other/i },
];

/** Best-effort mapping from free text (lead_source, utm_source, etc.) to a category, or null. */
export function normalizeLeadSourceCategory(text) {
  const s = String(text || "").trim();
  if (!s) return null;
  for (const { category, re } of KEYWORD_MAP) if (re.test(s)) return category;
  return null;
}

export function isValidLeadSourceCategory(v) {
  return VALID_LEAD_SOURCE_CATEGORIES.includes(v);
}
