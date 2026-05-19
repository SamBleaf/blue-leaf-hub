import Anthropic from "@anthropic-ai/sdk";

const { parsed: _env = {} } = (await import("dotenv")).config();
const apiKey = process.env.ANTHROPIC_API_KEY?.trim() || _env.ANTHROPIC_API_KEY?.trim();

export function registerSupervisorRoutes(app) {
  app.post("/api/supervisor/parse-voice", async (req, res) => {
    const { transcript, projectAddress, tasks = [] } = req.body || {};
    if (!transcript?.trim()) return res.json({ ok: false, error: "No transcript" });
    if (!apiKey) return res.json({ ok: false, error: "ANTHROPIC_API_KEY not set" });

    const client = new Anthropic({ apiKey });
    const today = new Date().toISOString().slice(0, 10);
    const taskList = tasks.slice(0, 20).map((t) => `- ${t.name} (${t.trade || "—"}, ${t.phase || "—"})`).join("\n");

    const prompt = `You are a construction site assistant. A supervisor has just spoken a voice memo on site.

Today: ${today}
Project: ${projectAddress || "unknown"}
Today's active tasks:
${taskList || "(none provided)"}

Supervisor's transcript:
"${transcript}"

Parse this into a structured action. Return JSON only (no markdown), one of:

1. Diary entry:
{"type":"diary","data":{"weather":"sunny|cloudy|rainy|windy|","tradesOnSite":["Framing","Plumbing"],"workCompleted":"brief summary","issues":"any issues or empty string","nextSteps":"what happens tomorrow or empty string"}}

2. Task update(s):
{"type":"task_update","data":{"updates":[{"taskName":"matching task name from list","percentComplete":75,"notes":"optional note"}]}}

3. Both (diary entry with task updates embedded):
{"type":"both","data":{"diary":{"weather":"","tradesOnSite":[],"workCompleted":"","issues":"","nextSteps":""},"updates":[{"taskName":"","percentComplete":0,"notes":""}]}}

Rules:
- Prefer "diary" if the speech describes general site activity
- Prefer "task_update" if specific tasks and progress are mentioned
- Use "both" if both are clearly present
- tradesOnSite: extract trade names mentioned (Framing, Plumbing, Electrical, etc.)
- percentComplete: infer from language ("nearly done"=90, "halfway"=50, "just started"=10, "complete"=100)
- Keep workCompleted concise (1-2 sentences)
- Return valid JSON only`;

    try {
      const msg = await client.messages.create({
        model: process.env.CLAUDE_MODEL || "claude-sonnet-4-6",
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }]
      });
      const raw = msg.content[0]?.text?.trim() || "{}";
      const parsed = JSON.parse(raw);
      res.json({ ok: true, result: parsed });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });
}
