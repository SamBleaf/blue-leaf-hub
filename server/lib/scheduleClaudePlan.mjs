import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.CLAUDE_MODEL || process.env.MODEL || "claude-sonnet-4-5";

/**
 * @param {object} opts
 * @param {{ phase: string, phaseLabel: string, lineItems: string[] }[]} opts.categoryBlocks
 */
export async function generateSchedulePlanWithClaude(opts) {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY not configured.");
  }

  const categoriesPayload = (opts.categoryBlocks || []).map((b) => ({
    category: b.phaseLabel,
    category_key: b.phase,
    tasks: (b.lineItems || []).map((name) => ({ name, category: b.phaseLabel, category_key: b.phase }))
  }));

  const prompt = `You are a construction scheduling expert for residential building projects in South Australia.
Given these construction categories and line items, determine:
1. Which tasks MUST wait for a previous task to complete before starting (hard dependency)
2. Which tasks CAN run concurrently with others
3. Standard lead times for each category in residential construction (in weeks)
4. Key hold points requiring inspection before proceeding

Return ONLY valid JSON (no markdown fences) with this exact shape:
{
  "tasks": [{
    "id": "string (unique temp id, use prefix t1, t2, ...)",
    "name": "string",
    "category": "string (must match one of the category labels provided)",
    "duration_weeks": number,
    "depends_on": ["task_ids"],
    "can_run_concurrent_with": ["task_ids"],
    "lead_time_weeks": number,
    "is_hold_point": boolean,
    "hold_point_description": "string or empty",
    "notes": "string or empty"
  }]
}

Categories and items:
${JSON.stringify(categoriesPayload, null, 2)}

Rules:
- Every line item name should appear as at least one task "name" (merge duplicates within same category into one task if identical).
- Use realistic duration_weeks (fractions allowed as decimals).
- depends_on must only reference ids you define in this same tasks array.
- Milestones / inspections: is_hold_point true with duration_weeks 0 or very small.
- Lead time: weeks before install that procurement should start (e.g. joinery order).`;

  const client = new Anthropic({ apiKey: key, maxRetries: 0 });
  const completion = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    temperature: 0.2,
    messages: [{ role: "user", content: [{ type: "text", text: prompt }] }]
  });

  const text = completion.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  let jsonSlice = text;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) jsonSlice = fence[1].trim();
  const braceStart = jsonSlice.indexOf("{");
  const braceEnd = jsonSlice.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    jsonSlice = jsonSlice.slice(braceStart, braceEnd + 1);
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonSlice);
  } catch (e) {
    const err = new Error("Claude schedule response was not valid JSON.");
    err.cause = e;
    err.debugExcerpt = text.slice(0, 1200);
    throw err;
  }

  const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
  return { tasks, rawModelText: text };
}
