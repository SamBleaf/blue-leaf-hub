import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.CLAUDE_MODEL || process.env.MODEL || "claude-sonnet-4-5";

const CANONICAL_REF = `
## Canonical SA residential build reference
Use this as your dependency template. Wire tasks to this pattern wherever your line items correspond.

### A. Physical build dependencies (Predecessor → Successor | Type | Lag days)
Site survey → Engineering drawings | FS | 0
Engineering drawings → Building permit | FS | 0
Engineering drawings approved → Truss design/shop drawings | FS | 0
Engineering drawings approved → Steel shop drawings/order | FS | 0
Building permit → all site work | FS | 0  [GATE — nothing starts without permit]
Site clearing → Excavation | FS | 0
Excavation → Termite treatment | FS | 0
Termite treatment → Footings/formwork | FS | 3  [treatment cure]
Footings/formwork → Slab pour | FS | 0
Slab pour → Wall frame | FS | 7  [concrete cure]
Truss delivery → Roof trusses install | FS | 0
Wall frame complete → Frame/bracing/tie-down inspection | FS | 0  [hold point]
Frame/bracing/tie-down inspection passed → Roof trusses install | FS | 0
Wall frame substantially complete → Plumbing rough-in | FS | 0
Wall frame substantially complete → Electrical rough-in | FS | 0
Roof frame complete → HVAC rough-in | FS | 0
Window delivery + Wall frame complete → Window/door install | FF | 0
Roof trusses install → Roofing/sarking | FS | 0
Roofing complete + Windows/doors installed → Lock-up milestone | FF | 0
Lock-up milestone → rough-in continuation | FS | 0  [hold point gate]
Roofing complete → External cladding/render | FS | 0
External cladding → External painting | FS | 0
External painting → Scaffold removed | FS | 0
Scaffold removed → Driveway/paths/landscaping | FS | 0
Plumbing rough-in → Plumbing inspection | FS | 0  [hold point]
Electrical rough-in → Electrical inspection | FS | 0  [hold point]
HVAC rough-in → HVAC inspection | FS | 0  [hold point]
All rough-in inspections passed + air sealing passed → Insulation | FF | 0
Insulation → Pre-lining inspection | FS | 0  [hold point]
Pre-lining inspection passed → Wall lining/plasterboard | FS | 0
Wall lining → Cornice/architraves | FS | 0
Wall lining → Internal painting (prime coat) | FS | 1  [plaster dry]
Painting prime → Cabinetry install | FS | 1
Painting prime → Tiling | SS | 2
Waterproofing → Waterproofing inspection | FS | 0  [hold point]
Waterproofing inspection passed → Tiling (wet areas) | FS | 3  [cure after inspection]
Cabinetry install → Stone benchtop template | FS | 0
Stone benchtop template → Stone fabrication | FS | 0
Stone fabrication → Stone/benchtop install | FS | 0
Stone install → Plumbing fit-off (kitchen/laundry) | FS | 0
Tiling complete → Plumbing fit-off (bathrooms) | FS | 0
Painting prime complete + Wall lining complete → Electrical fit-off | FF | 0
Tiling → Flooring install | FS | 3  [grout cure]
Flooring → Skirting boards | FS | 0
Skirting → Painting second coat | FS | 1
Meter box installed → Electrical connection (power on) | FS | 0
Plumbing fit-off → Hot water system commissioning | FS | 0
Power connected + Water connected → Systems testing/commissioning | FF | 0
All fit-off + external works + commissioning → Pre-handover QA | FF | 0  [hold point]
Pre-handover QA → Defects rectification | FS | 0
Defects rectification → Practical completion | FS | 0
Practical completion → Client handover | FS | 0

### B. Procurement tasks (task_type="procurement", set lead_time_days)
Truss order placed | lead_time_days=14 | after: Truss design approved
Steel order placed | lead_time_days=21 | after: Steel shop drawings approved
Window order placed | lead_time_days=35 | after: Client window schedule approved [order before frame starts]
Window delivery | lead_time_days=0 | 35 days after window order
Joinery/cabinetry order placed | lead_time_days=56 | after: Joinery design approved + check measure [CRITICAL PATH RISK]
Flooring order placed | lead_time_days=28 | after: Client flooring selection approved
Tile order placed | lead_time_days=14 | after: Client tile selection approved
Shower screen order | lead_time_days=21 | after: Shower screen check measure
Hot water system order | lead_time_days=14 | pre rough-in

### C. Approval/inspection gates (task_type="approval" or "inspection", duration_days=0)
Building permit issued | approval | blocks: all site work
Engineering drawings approved | approval | blocks: truss design, steel order
Client window schedule approved | approval | blocks: window order
Client joinery selections approved | approval | blocks: joinery design
Client flooring selection approved | approval | blocks: flooring order
Truss design approved | approval | blocks: truss order
Frame/bracing/tie-down inspection passed | inspection | blocks: roof trusses install
Plumbing inspection passed | inspection | blocks: insulation gate
Electrical inspection passed | inspection | blocks: insulation gate
HVAC inspection passed | inspection | blocks: insulation gate
Pre-lining inspection passed | inspection | blocks: wall lining
Waterproofing inspection passed | inspection | blocks: tiling (wet areas)
Pre-handover QA passed | inspection | blocks: defects rectification
`;

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
Given these construction categories and line items, generate a complete, realistic schedule with properly typed task dependencies.

Return ONLY valid JSON (no markdown fences) with this exact shape:
{
  "tasks": [{
    "id": "t1",
    "name": "string",
    "category": "string (must match one of the category labels provided)",
    "task_type": "build|procurement|approval|inspection|milestone",
    "duration_days": number,
    "lead_time_days": number,
    "task_dependencies": [
      { "taskId": "t2", "type": "FS|SS|FF", "lag": 0 }
    ],
    "notes": "string or empty"
  }]
}

## Dependency types
- FS (Finish-to-Start, default): successor starts after predecessor finishes. Add lag for cure/dry times.
- SS (Start-to-Start): successor starts lag days after predecessor starts. Use for parallel work that can begin partway through.
- FF (Finish-to-Finish): successor finishes lag days after predecessor finishes. Use when two tasks must both be done before a milestone.
- Do NOT use SF.

## Task types
- build: physical construction work
- procurement: ordering/delivery (always set lead_time_days = days before install that order must be placed)
- approval: client or authority sign-off (duration_days=0, ticked manually as done)
- inspection: hold point requiring inspector sign-off (duration_days=0, ticked manually)
- milestone: key date marker (duration_days=0)

${CANONICAL_REF}

## Rules
- Every line item name should appear as at least one task name (merge duplicates within same category).
- Use realistic duration_days for South Australia residential builds (1–30 days for build tasks, 0 for gates).
- task_dependencies must only reference ids you define in this same tasks array.
- Procurement tasks: set lead_time_days. Order-by date = start_date − lead_time_days.
- Approval/inspection tasks: duration_days=0.
- Milestone tasks: duration_days=0.
- Use SS+lag and FF relationships from the canonical reference — don't force everything to FS.
- Trusses, steel, windows, joinery: these have long lead times and often control the critical path.
- Building permit is a hard gate: no site work until permit issued.

Categories and items:
${JSON.stringify(categoriesPayload, null, 2)}`;

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
