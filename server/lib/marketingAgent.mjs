/**
 * marketingAgent.mjs
 * Blue Leaf Building — Marketing Content Agent
 *
 * COMPLETELY SEPARATE from Blueprint (internal ops coach).
 * This agent writes for external audiences — people who have
 * never heard of Blue Leaf Building.
 *
 * Do not import from or share prompts with blueprintRoutes.mjs.
 */

import Anthropic from "@anthropic-ai/sdk";
import { callAI } from "./aiGateway.mjs";
import { config as dotenvConfig } from "dotenv";
import {
  BLUE_LEAF_IDENTITY,
  CONTENT_MODE_MODIFIERS,
  GENERATION_JSON_FORMAT,
  formatPhotoAnalysisForPrompt,
} from "./marketingPrompts.mjs";

const { parsed: _env = {} } = dotenvConfig();
const _apiKey = process.env.ANTHROPIC_API_KEY?.trim() || _env.ANTHROPIC_API_KEY?.trim();
export const MODEL = "claude-sonnet-4-5";

// ─── System Prompt ────────────────────────────────────────────────────────────

// DEPRECATED — use BLUE_LEAF_IDENTITY from marketingPrompts.mjs for all new generation.
// Kept here so existing callers don't break during migration.
export const MARKETING_SYSTEM_PROMPT = `You are the marketing writer for Blue Leaf Building — a high-end residential builder based in Adelaide, South Australia. You write all external-facing content: website copy, social media posts, email sequences, and client guides.

WHO BLUE LEAF IS:
Blue Leaf Building constructs custom homes and architecturally designed homes in Adelaide. The company's core message is: Blue Leaf builds better as standard. This means that the practices most builders charge extra for — correct weather-tightness detailing, passive design principles, quality control at frame stage — are how Blue Leaf builds every time. Director: Sam Morris.

VOICE PROFILE:
Write like a senior builder who is also genuinely interested in architecture and materials. Not a marketer. Not a salesperson. Explain decisions, not just outcomes. Restrained, specific, and confident. When there is nothing specific to say, say nothing — do not fill space with professional-sounding noise.

DO:
- Use specific construction details: material choices, brand decisions, method reasoning
- Reference Adelaide-specific conditions: summer temperatures, SA wind loads, clay soils, Hills Face Zone requirements where relevant
- Mention passive design principles with genuine explanation — orientation, thermal mass, cross-ventilation
- Use "we decided to use..." framing — shows reasoning, not just outcome
- Reference architect partnerships naturally — "working with the architect, we..."
- Acknowledge honest timelines and cost factors
- Explain why a method is better, not just that it is better
- Use suburb names and Adelaide-specific references to signal local knowledge

DO NOT:
- Use "quality" as a noun or adjective (say what specifically is better instead)
- Write "dream home", "stress-free experience", "trusted builder", "passion for building"
- Open with "At Blue Leaf Building, we..."
- Use urgency CTAs: "limited spots", "book now before it's too late", "don't miss out"
- Use fear-based copy of any kind
- Make claims any other builder could make without specific evidence
- Reference APB, Association of Professional Builders, or any APB course names — this is a hard rule and cannot be overridden
- Make fixed price guarantees or specific timeline promises you cannot keep
- Cite energy ratings without a specific source and project reference

DUAL JOB OF EVERY CONTENT PIECE:
Every piece of content must do two jobs simultaneously:
1. ATTRACT clients who value craftsmanship, work with architects, have realistic budget and timeline expectations, and are not shopping primarily on price.
2. REPEL clients who expect the cheapest quote, impossible timelines, or who want a production-line home. Content that gently filters the wrong client is more valuable than content that sounds broadly appealing.

CONTENT PILLARS:
how_we_build (40% of output): Construction methods, building envelope decisions, material choices, why we do it this particular way. This is where expertise is demonstrated.
what_to_expect (30%): Pre-construction process, key decisions, realistic timelines, honest cost factors. Clients need to know what they're signing up for.
the_work (20%): Project progress, completions, proof of work without hard sell. Let the work speak.
community_craft (10%): Adelaide-specific context, architect relationships, local materials, SA building conditions, community connections.

CLIENT STAGE RULES — strictly apply these:
awareness: No CTAs. Educational only. Demonstrate expertise. Never mention your internal process or pricing structure. The reader does not know you yet.
consideration: Gentle proof. Process transparency. What-to-expect framing. Light introduction to how you work.
enquiry/nurture: Direct. Address specific anxieties. Light CTA to continue the conversation only — never a hard close.
pre_construction/on_site: Practical client-facing guides. What is happening and why it is happening. Confidence-building.
post_handover: Review prompts, referral-ready content, testimonial seeding. Warm and resolved tone.

OUTPUT FORMAT — always return valid JSON in exactly this shape:
{
  "title": "Short descriptive title",
  "body": "Main content",
  "cta": "Call to action (empty string if client_stage is awareness)",
  "hashtags": ["array", "of", "hashtags"],
  "alt_text": "Image alt text suggestion for accessibility",
  "notes": "Brief internal note on approach or any caveats"
}

For email sequences, return an array of objects:
[{ "subject": "", "preview_text": "", "body": "", "cta": "" }]

Return only the JSON. No preamble, no explanation, no markdown fences.`;

// ─── Content Pillar Definitions ───────────────────────────────────────────────

export const CONTENT_PILLARS = {
  how_we_build: {
    label: "How We Build",
    description: "Construction methods, envelope, materials, reasoning",
    target_pct: 40,
    colour: "bg-blue-100 text-blue-800",
  },
  what_to_expect: {
    label: "What to Expect",
    description: "Pre-construction, decisions, timelines, honest cost factors",
    target_pct: 30,
    colour: "bg-violet-100 text-violet-800",
  },
  the_work: {
    label: "The Work",
    description: "Project progress, completions, proof without hard sell",
    target_pct: 20,
    colour: "bg-emerald-100 text-emerald-800",
  },
  community_craft: {
    label: "Community & Craft",
    description: "Adelaide-specific, architect relationships, SA conditions",
    target_pct: 10,
    colour: "bg-amber-100 text-amber-800",
  },
};

// ─── Mode Prompts ─────────────────────────────────────────────────────────────

export const MODE_PROMPTS = {
  website: `CHANNEL: Website copy
Include Adelaide local SEO signals naturally — suburb names, "custom home builder Adelaide", "architecturally designed homes SA". Write for F-pattern scanning: the reader skims headers first. Hero headline 15 words maximum. One primary CTA only. Sections should be short with specific, scannable subheadings.
Every section should answer an implicit homeowner question: "What does this mean for me?" Convert builder reasoning into client outcomes.`,

  social_instagram: `CHANNEL: Instagram
150–200 words maximum. Single idea only — do not try to cover multiple topics. Strong specific opening hook that is not a question. The first line must earn the scroll. 5–8 hashtags: local-first (#adelaidehomes, #adelaidebuilder, #customhomesadelaide, #architecturallydesigned, #passivedesign as appropriate). No emoji overload.
Every post must translate one construction decision into a human outcome before the CTA. The reader is a potential client who cares about living in the home, not building it.`,

  social_facebook: `CHANNEL: Facebook
Slightly longer than Instagram — 200–300 words. More conversational register. Educational angle preferred. Facebook readers are more tolerant of detail. Avoid clickbait-style hooks. Write as if explaining something useful to a knowledgeable friend.
Facebook readers tolerate more detail but still need to understand why it matters to them. Ground one technical point in a consequence (comfort, cost, longevity) per post.`,

  email: `CHANNEL: Email sequence
Write 3–5 emails covering the full nurture journey. One email per client stage. Subject line under 50 characters. Single CTA per email. No hard sell at any stage. Return as a JSON array of { subject, preview_text, body, cta } objects. Email body prose only — no HTML tags.
Each email should leave the reader with one actionable understanding — something they know now that they didn't before, that makes them more likely to build well.`,

  client_guide: `CHANNEL: Client guide
Practical, educational sections. Write information a client genuinely needs, explained clearly. Not a sales brochure with a guide wrapper. Use numbered sections with specific, useful headings. Each section should answer a real question the client has at this stage of their project.
Practical sections should explain the WHY behind the process step, not just WHAT happens. A client who understands why feels in control.`,

  cta: `CHANNEL: Call to action copy
Low-pressure, filtering. The CTA should gently signal who this is for. Example register: "If you're working with an architect or considering one, we'd like to have a conversation." Never urgency-based. The right client is not in a rush, and neither are we.`,
};

// ─── Review Checks ────────────────────────────────────────────────────────────

const APB_PATTERNS = [
  /\bAPB\b/,
  /association of professional builders/i,
  /apb\s+system/i,
  /apb\s+framework/i,
  /apb\s+methodology/i,
  /apb\s+course/i,
  /apb\s+program/i,
  /apb\s+member/i,
  /apb\s+coach/i,
  /apb\s+training/i,
];

const BANNED_PHRASES = [
  { pattern: /\bquality\b/gi,               label: '"quality" as generic term' },
  { pattern: /dream home/gi,                label: '"dream home"' },
  { pattern: /stress.?free/gi,              label: '"stress-free"' },
  { pattern: /trusted builder/gi,           label: '"trusted builder"' },
  { pattern: /passion for build/gi,         label: '"passion for building"' },
  { pattern: /limited spots?/gi,            label: '"limited spots" urgency CTA' },
  { pattern: /book now/gi,                  label: '"book now" urgency CTA' },
  { pattern: /don.?t miss/gi,              label: 'fear-based "don\'t miss"' },
  { pattern: /^at blue leaf building,? we/im, label: 'opens with "At Blue Leaf Building, we..."' },
  { pattern: /\bluxurious\b/gi,             label: '"luxurious" — generic luxury signalling' },
  { pattern: /\bstunning\b/gi,              label: '"stunning" — vague superlative' },
  { pattern: /\bbespoke\b/gi,               label: '"bespoke" — overused agency word' },
  { pattern: /\bcurated\b/gi,               label: '"curated" — vague, not specific' },
  { pattern: /\belevated\b/gi,              label: '"elevated" — vague lifestyle language' },
  { pattern: /cutting.?edge/gi,             label: '"cutting-edge" — empty tech-signalling' },
  { pattern: /state.?of.?the.?art/gi,       label: '"state-of-the-art" — cliché superlative' },
  { pattern: /\bexquisite\b/gi,             label: '"exquisite" — vague superlative' },
  { pattern: /\bunparalleled\b/gi,          label: '"unparalleled" — unprovable claim' },
  { pattern: /\bmeticulous(ly)?\b/gi,       label: '"meticulous" — telling not showing' },
];

const OVERPROMISE_PATTERNS = [
  { pattern: /guaranteed?\s+(price|cost|timeline|delivery)/gi, label: "price/timeline guarantee" },
  { pattern: /fixed.?price guarantee/gi,                       label: "fixed price guarantee" },
  { pattern: /on time,? every time/gi,                         label: '"on time, every time" promise' },
  { pattern: /always on budget/gi,                             label: '"always on budget" promise' },
];

/**
 * Run all automated review checks against draft content.
 * @param {{ title?: string, body?: string, cta?: string }} draft
 * @param {string} channel
 * @param {object|null} photoAnalysis - structured photo analysis object (optional)
 * @returns {object} review result
 */
export function runReviewChecks(draft, channel, photoAnalysis = null) {
  const fullText = [draft.title, draft.body, draft.cta, ...(draft.hashtags || [])].filter(Boolean).join(" ");

  // APB reference — hard block
  const apbMatches = APB_PATTERNS.filter(p => p.test(fullText)).map(p => p.toString());
  const apbPass = apbMatches.length === 0;

  // Brand voice — banned phrases
  const voiceFlags = BANNED_PHRASES.filter(({ pattern }) => pattern.test(fullText)).map(({ label }) => label);
  const voicePass = voiceFlags.length === 0;

  // Overpromise
  const overpromiseFlags = OVERPROMISE_PATTERNS.filter(({ pattern }) => pattern.test(fullText)).map(({ label }) => label);
  const overpromisePass = overpromiseFlags.length === 0;

  // Specificity — penalise generic descriptors
  const genericWords = ["quality", "excellence", "great", "best", "premium", "luxury", "top-quality", "high-quality"];
  const genericCount = genericWords.filter(w => new RegExp(`\\b${w}\\b`, "gi").test(fullText)).length;
  const wordCount = fullText.split(/\s+/).filter(Boolean).length;
  // Check for specific signals: material names, suburb names, method names
  const specificSignals = [
    /\b(timber|steel|concrete|membrane|sarking|batts|EPS|XPS|AAC|CLT|LVL|fibre cement|Colorbond|James Hardie|Boral|CSR|Bradford|Knauf|Hebel)\b/i,
    /\b(Plympton|Glenelg|Unley|Burnside|Norwood|Prospect|Henley|Semaphore|Victor Harbor|Aldgate|Stirling|Crafers|Belair|Mitcham)\b/,
    /passive design|thermal mass|cross.ventilation|double.glazed|bulk insulation|air.tightness|vapour barrier|weather.tight/i,
  ].filter(p => p.test(fullText)).length;

  let specificityScore = 10 - genericCount * 2 + specificSignals;
  specificityScore = Math.max(1, Math.min(10, specificityScore));
  const specificityPass = specificityScore >= 7;

  // Local relevance
  const localSignals = [
    /adelaide/i, /south australia|SA\b/, /\bAdelaide\b/, /Hills Face Zone/i,
    /(Plympton|Glenelg|Unley|Burnside|Norwood|Prospect|Henley|Semaphore|Victor Harbor|Aldgate|Stirling|Crafers|Belair|Mitcham)/,
    /Clay soil|SA wind|summer heat|Mediterranean climate/i,
  ].filter(p => p.test(fullText)).length;
  const localScore = Math.min(10, localSignals * 3 + (channel === "social_instagram" ? 2 : 0));
  const localPass = channel === "email" || channel === "client_guide" ? true : localScore >= 4;

  // Educational value
  const educationalSignals = [
    /because\b|the reason|this means|what this means|why we|how this|the difference/i,
    /for example|specifically|in practice|in Adelaide/i,
    /\d+mm|\d+°|\d+%|\d+ weeks|\d+ days/,
  ].filter(p => p.test(fullText)).length;
  const educationalScore = Math.min(10, educationalSignals * 3 + (wordCount > 100 ? 1 : 0));
  const educationalPass = educationalScore >= 5;

  // Lead quality (composite)
  const leadScore = Math.round(
    (specificityScore * 0.4) +
    (educationalScore * 0.3) +
    (localScore * 0.2) +
    (voicePass ? 1 : 0) +
    (overpromisePass ? 1 : 0)
  );

  // Identity score — does this sound like Blue Leaf?
  const identitySignals = [
    /passive design|thermal mass|cross.ventilation|weather.tight|building envelope/i,
    /why we|the reason|what this means|because\b/i,
    /20.?30 years|long.?term performance|not just handover/i,
    /weather.tightness|moisture management|detailing/i,
    /architect|architecturally designed/i,
  ].filter(p => p.test(fullText)).length;
  const identityScore = Math.min(10, Math.max(1, identitySignals * 2 + 2));

  // Hook quality — does the opening line avoid flat openers?
  const firstLine = (draft.body || "").split("\n")[0].trim();
  const badHookPatterns = [
    /^nestled in/i, /^this stunning/i, /^beautiful /i,
    /^at blue leaf building/i, /^introducing /i, /^proud to present/i,
    /^welcome to /i, /^we are pleased/i,
  ];
  const hookScore = badHookPatterns.some(p => p.test(firstLine)) ? 2 : firstLine.length > 30 ? 7 : 5;

  // Philosophy present — references performance/detailing/long-term thinking?
  const philosophyPresent = [
    /performance|long.?term|20.?30 years/i,
    /weather.tight|moisture|thermal/i,
    /detailing|building envelope/i,
  ].some(p => p.test(fullText));

  // Accuracy check — flag invented specs
  const inventedSpecPatterns = [
    /\d+.?star\s+energy/gi,
    /R.?value\s+of\s+\d/gi,
    /\d+mm\s+(insulation|cavity|gap|spacing|wall)/gi,
  ];
  const accuracyCheck = inventedSpecPatterns.some(p => p.test(fullText))
    ? "WARN — specific measurements found; verify against project data before publishing"
    : "PASS";

  // Authority score — does the content explain WHY or name consequences?
  const authoritySignals = [
    /why (we|this|it|the|a)\b/i,
    /what (this|it|that) means/i,
    /the (reason|difference|consequence|result)/i,
    /when (this|it) (fails|goes wrong|isn.?t done|is ignored)/i,
    /in (10|20|thirty|twenty|ten) years/i,
    /most builders/i,
    /common (mistake|failure|approach|shortcut)/i,
  ].filter(p => p.test(fullText)).length;
  const authorityScore = Math.min(10, Math.max(1, authoritySignals * 2 + 2));
  const authorityPass = authorityScore >= 5;

  // Human translation score — does it land a technical point as a homeowner consequence?
  const humanTranslationSignals = [
    /comfort|comfortable/i,
    /lower (energy|power|cooling|heating)/i,
    /less (maintenance|work|cost|reliance)/i,
    /feel(s)? (better|comfortable|cool|warm)/i,
    /means (you|the|a|your)/i,
    /consequence|result in/i,
    /person living/i,
    /homeowner/i,
  ].filter(p => p.test(fullText)).length;
  const humanTranslationScore = Math.min(10, humanTranslationSignals * 2 + 2);
  const humanTranslationPass = humanTranslationScore >= 4;

  // Visual relevance score — is the content grounded in the specific image?
  const visualGroundingSignals = [
    /this (photo|image|project|site|home|build)/i,
    /you can see/i,
    /visible (here|in this)/i,
    /on this (project|site|job|build)/i,
    /in this (case|photo|image|home)/i,
  ].filter(p => p.test(fullText)).length;
  const visualRelevanceScore = Math.min(10, (visualGroundingSignals * 3) + (photoAnalysis ? 4 : 1));

  // Updated overall_pass gate — quality floor added
  const qualityPass = identityScore >= 5 && hookScore >= 3;
  const overallPass = apbPass && voicePass && overpromisePass && qualityPass;

  const blockReason = !apbPass
    ? "APB reference detected — must be removed before approval."
    : !qualityPass && identityScore < 5
    ? `Blue Leaf identity score too low (${identityScore}/10). Content could belong to any builder. Reinforce at least one Blue Leaf principle.`
    : !qualityPass && hookScore < 3
    ? "Hook too weak — opening line starts with a flat or banned opener. Rewrite the first sentence."
    : null;

  const reject_reasons = [
    ...(!apbPass ? apbMatches.map(m => `APB reference: ${m}`) : []),
    ...(!voicePass ? voiceFlags.map(f => `Brand voice violation: ${f}`) : []),
    ...(!overpromisePass ? overpromiseFlags.map(f => `Overpromise: ${f}`) : []),
    ...(identityScore < 5 ? [`Identity score ${identityScore}/10 — no Blue Leaf principles present`] : []),
    ...(hookScore < 3 ? [`Hook score ${hookScore}/10 — rewrite opening line`] : []),
  ].filter(Boolean);

  return {
    brand_voice:       { pass: voicePass,        flags: voiceFlags },
    apb_reference:     { pass: apbPass,          matches: apbMatches },
    overpromise:       { pass: overpromisePass,   flags: overpromiseFlags },
    lead_quality:      { score: Math.min(10, leadScore), notes: specificSignals > 1 ? "Good specificity signals" : "Add specific material or method details to improve" },
    specificity:       { score: specificityScore, pass: specificityPass },
    local_relevance:   { score: localScore,      pass: localPass },
    educational_value: { score: educationalScore, pass: educationalPass },
    identity_score:    identityScore,
    hook_quality:      hookScore,
    philosophy_present: philosophyPresent,
    accuracy_check:    accuracyCheck,
    authority_score:   { score: authorityScore,        pass: authorityPass },
    human_translation: { score: humanTranslationScore, pass: humanTranslationPass },
    visual_relevance:  { score: visualRelevanceScore },
    reject_reasons,
    overall_pass:      overallPass,
    block_reason:      blockReason,
  };
}

// ─── Content Generation ───────────────────────────────────────────────────────

/**
 * Build the system + user message for a marketing generation request.
 * Exported so streaming routes can call Claude directly without going through generateContent().
 */
export function buildMarketingPrompt(mode, context, userRequest, content_mode = "educational") {
  const modePrompt = MODE_PROMPTS[mode] || MODE_PROMPTS.social_instagram;
  const modeModifier = CONTENT_MODE_MODIFIERS[content_mode] || CONTENT_MODE_MODIFIERS.educational;
  const contextBlock = [
    context.pillar          && `Content pillar: ${CONTENT_PILLARS[context.pillar]?.label || context.pillar}`,
    context.client_stage    && `Client stage: ${context.client_stage}`,
    context.topic           && `Topic: ${context.topic}`,
    context.project_context && `Project context: ${context.project_context}`,
    context.photo_analysis  && formatPhotoAnalysisForPrompt(context.photo_analysis),
  ].filter(Boolean).join("\n");
  const userMessage = [modePrompt, modeModifier, "", contextBlock, "", `Request: ${userRequest}`].join("\n");
  return { systemPrompt: BLUE_LEAF_IDENTITY + GENERATION_JSON_FORMAT, userMessage };
}

/**
 * Parse raw LLM text (possibly with markdown fences) into a JS object.
 */
export function parseMarketingResponse(rawText) {
  const jsonStr = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(jsonStr);
  } catch {
    const match = jsonStr.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`Model returned non-JSON response: ${rawText.slice(0, 300)}`);
  }
}

/**
 * Generate marketing content via Claude.
 * @param {string} mode - one of the MODE_PROMPTS keys
 * @param {object} context - { pillar, client_stage, topic, project_context, job_context }
 * @param {string} userRequest - the user's plain-text request
 */
export async function generateContent(mode, context, userRequest, content_mode = "educational") {
  if (!_apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const { systemPrompt, userMessage } = buildMarketingPrompt(mode, context, userRequest, content_mode);
  const client = new Anthropic({ apiKey: _apiKey, maxRetries: 1 });
  const response = await callAI(client,
    {
      model: MODEL,
      max_tokens: 2048,
      temperature: 0.7,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage }],
    },
    { module: "marketingAgent" },
    { headers: { "anthropic-beta": "prompt-caching-2024-07-31" } },
  );
  const raw = response.content.find(b => b.type === "text")?.text?.trim() || "";
  return parseMarketingResponse(raw);
}

// ─── Photo Analysis Prompt ────────────────────────────────────────────────────

export const PHOTO_ANALYSIS_SYSTEM_PROMPT = `You are a construction analyst for Blue Leaf Building, a high-end custom home builder in Adelaide.

Analyse this image and return ONLY what is directly visible. Do not invent materials, finishes, or design intent — if you cannot confirm it visually, note it as a probable assumption or unknown. Be specific about construction details: name materials, methods, and stages where you can see them.`;

export const PHOTO_ANALYSIS_USER_PROMPT = `Analyse this construction site photo for Blue Leaf Building's marketing use.

Return ONLY valid JSON in exactly this shape:
{
  "visible_facts": ["specific, confirmed observations about what is directly visible — materials, methods, stage, workmanship, site conditions"],
  "design_principles": ["visible design intent — passive solar cues, eaves depth, glazing placement, thermal mass, roof pitch, spatial relationships"],
  "probable_assumptions": ["educated inferences where the image strongly suggests but does not confirm — e.g. 'likely double-glazed given frame profile'"],
  "unknowns": ["what cannot be determined from this image alone"],
  "build_stage": "pre_construction|site_prep|slab|frame|lock_up|fitout|completion|landscaping|null",
  "content_opportunities": ["2-4 marketing angles this photo supports — be specific about what story it tells"],
  "summary": "1-2 sentence plain description of what is shown, suitable for an internal caption",
  "suggested_caption_hook": "one strong opening line for a social post — present tense, no hashtags, no emojis",
  "suggested_pillar": "how_we_build|the_work|what_to_expect|community_craft"
}`;
