// Turn a site walk-through transcript (Plaud paste OR in-app recording → Whisper)
// into a DRAFT list of site tasks. The model is pinned to Haiku regardless of
// CLAUDE_MODEL — this is high-volume, low-complexity extraction where the cheap
// model is the right call, and the output is reviewed by a human before any task
// is created, so we never auto-commit model output.

import Anthropic from "@anthropic-ai/sdk";
import { callAI } from "./aiGateway.mjs";

const SPLIT_MODEL = "claude-haiku-4-5-20251001"; // pinned — do NOT read CLAUDE_MODEL here
const VALID_PRIORITY = ["urgent", "normal", "when_time_permits"];
const VALID_CATEGORY = ["general", "defect", "safety", "materials", "inspection"];

// Rough token budget: ~1.3 tokens/word; cap input so a very long transcript is
// chunked by the caller rather than silently truncated by the model.
// `workStreams` (optional) are the job's labour budget categories — [{ value, label }].
// When supplied, the model may tag a task with a work-stream `value` so drafts land in
// the right stream (e.g. Cladding, Soffit linings) instead of always the generic set.
export function buildSplitPrompt(transcript, jobLabel, workStreams = []) {
  const streams = (workStreams || []).filter((s) => s && s.value && s.label);
  const streamBlock = streams.length
    ? `\n- This job has these work streams — prefer the matching value (left side) when a task clearly belongs to one:\n${streams.map((s) => `    "${s.value}" — ${s.label}`).join("\n")}\n  If a task fits none of them, use one of: "general","defect","safety","materials","inspection".`
    : "";
  const categoryChoices = streams.length
    ? `${streams.map((s) => `"${s.value}"`).join("|")}|"general"|"defect"|"safety"|"materials"|"inspection"`
    : `"general"|"defect"|"safety"|"materials"|"inspection"`;
  return `You are turning a builder's spoken site walk-through into a clean list of site tasks for ${jobLabel || "the job"}.

Rules:
- Output ONLY a JSON array, no prose, no markdown fences.
- Each element: { "title": string (short, imperative, e.g. "Install LVL ridge beam"), "priority": "urgent"|"normal"|"when_time_permits", "category": ${categoryChoices}, "description": string (optional extra context, or "") }.
- One task per discrete action. Merge duplicates. Drop chit-chat and anything that isn't an actionable task.
- Infer priority from wording (e.g. "make safe", "trip hazard" → urgent; default "normal").
- Infer category from wording (e.g. "make safe"/"trip hazard" → safety; "order"/"pick up" → materials; "fix"/"redo" → defect; "check"/"inspect" → inspection). Default category "general".${streamBlock}
- Australian English. Be concise and factual.

Transcript:
${transcript}`;
}

// Normalise + validate one raw task object from the model. Returns null if unusable.
// `allowedCategories` extends the fixed set with the job's work-stream values.
export function normalizeTask(raw, allowedCategories = []) {
  if (!raw || typeof raw !== "object") return null;
  const title = String(raw.title || "").trim();
  if (!title) return null;
  const priority = VALID_PRIORITY.includes(raw.priority) ? raw.priority : "normal";
  const allowed = new Set([...VALID_CATEGORY, ...allowedCategories]);
  const category = allowed.has(raw.category) ? raw.category : "general";
  const description = String(raw.description || "").trim();
  return { title: title.slice(0, 300), priority, category, description: description.slice(0, 1000) };
}

// Parse the model's text output into normalised tasks. Strict: throws if no JSON
// array can be found (never falls back to dumping raw text as a single task).
export function parseTasksFromModelText(text, allowedCategories = []) {
  let cleaned = String(text || "").trim().replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  // Tolerate the model wrapping the array in prose by extracting the first [...] block.
  if (!cleaned.startsWith("[")) {
    const m = cleaned.match(/\[[\s\S]*\]/);
    if (!m) throw new Error("Could not parse tasks from the transcript.");
    cleaned = m[0];
  }
  const arr = JSON.parse(cleaned);
  if (!Array.isArray(arr)) throw new Error("Expected a list of tasks.");
  return arr.map((r) => normalizeTask(r, allowedCategories)).filter(Boolean);
}

/**
 * Split a transcript into draft tasks via Haiku.
 * @param {string} transcript
 * @param {{ jobLabel?:string, workStreams?:Array<{value:string,label:string}> }} [opts]
 * @returns {Promise<Array<{title,priority,category,description}>>}
 */
export async function splitTranscriptToTasks(transcript, opts = {}) {
  const text = String(transcript || "").trim();
  if (!text) return [];
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new Error("ANTHROPIC_API_KEY not configured.");
  const client = new Anthropic({ apiKey: key, maxRetries: 1 });
  const workStreams = Array.isArray(opts.workStreams) ? opts.workStreams : [];
  const allowedCategories = workStreams.map((s) => s.value).filter(Boolean);
  // max_tokens scales with transcript length (more tasks possible), capped.
  const maxTokens = Math.min(4096, 512 + Math.ceil(text.length / 4));
  const completion = await callAI(client, {
    model: SPLIT_MODEL,
    max_tokens: maxTokens,
    temperature: 0,
    messages: [{ role: "user", content: [{ type: "text", text: buildSplitPrompt(text, opts.jobLabel, workStreams) }] }],
  }, { module: "voiceTasks" });
  const out = completion.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
  return parseTasksFromModelText(out, allowedCategories);
}
