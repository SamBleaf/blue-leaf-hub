import Anthropic from "@anthropic-ai/sdk";
import { callAI } from "./aiGateway.mjs";
import { getServiceSupabase } from "./supabaseService.mjs";
import { fileJobRecord } from "./jobRecordsFiler.mjs";
import { buildSiteDiaryPdfBuffer } from "./module6PdfKit.mjs";
import { requireAuth } from "./requireAuth.mjs";
import { syncDiaryToPortalUpdate } from "./portalIntegration.mjs";

const MODEL = process.env.CLAUDE_MODEL || process.env.MODEL || "claude-haiku-4-5-20251001";

// ── Pure helpers ──────────────────────────────────────────────────────────────

async function claudeText(prompt) {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new Error("ANTHROPIC_API_KEY not configured.");
  const client = new Anthropic({ apiKey: key, maxRetries: 0 });
  const completion = await callAI(client, {
    model: MODEL,
    max_tokens: 512,
    temperature: 0.2,
    messages: [{ role: "user", content: [{ type: "text", text: prompt }] }]
  }, { module: "siteDiaryRoutes" });
  return completion.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * @param {import("express").Express} app
 */
export function registerSiteDiaryRoutes(app) {
  app.post("/api/diary/structure", requireAuth, async (req, res) => {
    try {
      const transcript = String(req.body?.transcript || "").trim();
      const projectAddress = String(req.body?.projectAddress || "").trim();
      if (!transcript) return res.status(400).json({ ok: false, error: "transcript required." });
      const prompt = `Extract and structure this site diary transcript for ${projectAddress || "the site"}.
Return JSON with these exact keys:
{ "weather", "trades_onsite": [], "work_completed", "issues", "instructions_given", "visitors" }
trades_onsite should be an array of trade name strings.
Be concise and factual. Australian English.

Transcript:
${transcript}`;
      const raw = await claudeText(prompt + "\n\nReturn only valid JSON, no markdown.");
      let structured;
      try {
        structured = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "").trim());
      } catch {
        structured = {
          weather: "",
          trades_onsite: [],
          work_completed: raw,
          issues: "",
          instructions_given: "",
          visitors: ""
        };
      }
      return res.json({ ok: true, structured });
    } catch (e) {
      console.error("[diary/structure]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/diary/save", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const projectId = String(req.body?.projectId || "").trim();
      const entry = req.body?.entry && typeof req.body.entry === "object" ? req.body.entry : {};
      if (!projectId) return res.status(400).json({ ok: false, error: "projectId required." });

      const { data: proj, error: pe } = await sb.from("projects").select("address").eq("id", projectId).single();
      if (pe || !proj) return res.status(404).json({ ok: false, error: "Project not found." });

      const row = {
        project_id: projectId,
        entry_date: entry.entry_date || new Date().toISOString().slice(0, 10),
        weather: entry.weather ?? null,
        trades_onsite: Array.isArray(entry.trades_onsite) ? entry.trades_onsite : [],
        work_completed: entry.work_completed ?? null,
        issues: entry.issues ?? null,
        instructions_given: entry.instructions_given ?? null,
        visitors: entry.visitors ?? null,
        raw_voice_transcript: entry.raw_voice_transcript ?? null,
        structured_by_ai: Boolean(entry.structured_by_ai),
        supervisor: entry.supervisor ?? null
      };

      const { data: saved, error: se } = await sb.from("site_diary").insert(row).select("*").single();
      if (se) throw se;

      // Portal v2: pre-fill a DRAFT weekly update from this diary (work_completed
      // only — internal fields stay internal). Best-effort; never blocks the save.
      await syncDiaryToPortalUpdate({ projectId, entry: row }).catch(() => {});

      let dropbox_pdf_path = null;
      try {
        const pdfBuf = await buildSiteDiaryPdfBuffer({
          projectAddress: proj.address,
          entryDate: row.entry_date,
          weather: row.weather,
          tradesOnsite: row.trades_onsite,
          workCompleted: row.work_completed,
          issues: row.issues,
          instructionsGiven: row.instructions_given,
          visitors: row.visitors,
          supervisor: row.supervisor,
          generatedAt: new Date().toISOString()
        });
        // Records: file into INTERNAL/SITE DIARY via the central filer.
        const filed = await fileJobRecord({
          jobAddress: proj.address, category: "site_diary",
          fileName: `Site-Diary-${row.entry_date}.pdf`, buffer: pdfBuf,
        });
        if (filed?.ok && filed.storagePath) {
          dropbox_pdf_path = filed.storagePath;
          await sb.from("site_diary").update({ dropbox_pdf_path }).eq("id", saved.id);
        }
      } catch (err) {
        console.warn("[diary/save] records filing:", err?.message || err);
      }

      const { data: entryOut } = await sb.from("site_diary").select("*").eq("id", saved.id).single();
      return res.json({ ok: true, entry: entryOut, dropbox_pdf_path: entryOut?.dropbox_pdf_path || null });
    } catch (e) {
      console.error("[diary/save]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get("/api/diary/:projectId", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const projectId = String(req.params.projectId || "").trim();
      const limit = req.query.limit ? Math.min(100, Math.max(1, Number(req.query.limit))) : null;
      const from = req.query.from ? String(req.query.from).trim() : null;
      const to = req.query.to ? String(req.query.to).trim() : null;
      let q = sb.from("site_diary").select("*").eq("project_id", projectId).order("entry_date", { ascending: false });
      if (from) q = q.gte("entry_date", from);
      if (to) q = q.lte("entry_date", to);
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return res.json({ ok: true, entries: data || [] });
    } catch (e) {
      console.error("[diary/get]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.patch("/api/diary/:id", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ ok: false, error: "Entry id required." });

      // Only allow editing the content fields — never project_id or created_at
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const patch = {};
      if (body.entry_date !== undefined)      patch.entry_date = body.entry_date;
      if (body.weather !== undefined)         patch.weather = body.weather;
      if (body.trades_onsite !== undefined)   patch.trades_onsite = Array.isArray(body.trades_onsite) ? body.trades_onsite : [];
      if (body.work_completed !== undefined)  patch.work_completed = body.work_completed;
      if (body.issues !== undefined)          patch.issues = body.issues;
      if (body.instructions_given !== undefined) patch.instructions_given = body.instructions_given;
      if (body.visitors !== undefined)        patch.visitors = body.visitors;
      if (body.supervisor !== undefined)      patch.supervisor = body.supervisor;

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ ok: false, error: "No editable fields provided." });
      }

      const { data: updated, error: ue } = await sb
        .from("site_diary")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (ue) throw ue;
      if (!updated) return res.status(404).json({ ok: false, error: "Diary entry not found." });

      return res.json({ ok: true, entry: updated });
    } catch (e) {
      console.error("[diary/patch]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
