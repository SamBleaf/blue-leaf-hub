import { buildexactConfigured, getBuildexactToken } from "./buildexactClient.mjs";

/** Q1191-style default construction categories (display order). */
export const DEFAULT_SCHEDULE_CATEGORY_NAMES = [
  "Preliminaries",
  "Hire Items",
  "Site Establishment",
  "Demolition/civil",
  "Concrete & Footings",
  "Termite Protection",
  "Structural Steel",
  "First Fix Framing",
  "First Fix Supply",
  "Windows/skylights",
  "Cladding and Soffit Lining",
  "Cladding Supply",
  "Pro Clima weathertight system",
  "Roof Plumber",
  "Electrical & data",
  "Plumbing",
  "Second Fix",
  "Stairs",
  "Insulation",
  "Internal linings",
  "Tiling",
  "Joinery",
  "Painting",
  "Plastering",
  "Flooring",
  "Site Cleaning"
];

function env(name) {
  return process.env[name]?.trim() || "";
}

function apiBase() {
  return (env("BUILDEXACT_API_URL") || "https://api-v3.buildxact.com").replace(/\/$/, "");
}

export function slugPhase(name) {
  return String(name || "uncategorised")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "uncategorised";
}

/**
 * Normalise fee proposal categories jsonb into { phase, phaseLabel, lineItems[] }.
 * @param {unknown} categoriesJson
 */
function categoriesFromFeeProposal(categoriesJson) {
  const raw = Array.isArray(categoriesJson) ? categoriesJson : [];
  const out = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const name = String(c.name || c.title || "Category").trim();
    if (!name) continue;
    const phase = slugPhase(name);
    const items = Array.isArray(c.active_items) ? c.active_items : Array.isArray(c.items) ? c.items : [];
    const lineItems = [];
    for (const it of items) {
      const desc =
        typeof it === "string"
          ? it
          : String(it?.description || it?.name || it?.item || "").trim();
      if (desc) lineItems.push(desc);
    }
    out.push({ phase, phaseLabel: name, lineItems });
  }
  return out;
}

/**
 * Try Buildxact API for job cost / estimate breakdown (best-effort; API shape varies).
 * @param {string} buildexactJobId
 * @returns {Promise<{ phase: string, phaseLabel: string, lineItems: string[] }[]>}
 */
async function categoriesFromBuildexactJob(buildexactJobId) {
  if (!buildexactConfigured() || !buildexactJobId) return [];
  const token = await getBuildexactToken();
  const apiKey = env("BUILDEXACT_API_KEY");
  const base = apiBase();
  const paths = [
    `/jobs/${encodeURIComponent(buildexactJobId)}/estimate`,
    `/jobs/${encodeURIComponent(buildexactJobId)}/estimates`,
    `/jobs/${encodeURIComponent(buildexactJobId)}/cost_categories`
  ];
  for (const p of paths) {
    try {
      const res = await fetch(`${base}${p}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Ocp-Apim-Subscription-Key": apiKey,
          Authorization: `Bearer ${token}`
        }
      });
      const text = await res.text();
      let json = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        continue;
      }
      if (!res.ok) continue;
      const out = [];
      const list = Array.isArray(json) ? json : json?.items || json?.categories || json?.costCategories || json?.data || [];
      for (const row of list) {
        const name = String(row?.name || row?.categoryName || row?.title || "").trim();
        if (!name) continue;
        const phase = slugPhase(name);
        const lines = [];
        const subs = row?.lineItems || row?.items || row?.costs || [];
        if (Array.isArray(subs)) {
          for (const s of subs) {
            const d = String(s?.description || s?.name || s?.itemName || "").trim();
            if (d) lines.push(d);
          }
        }
        out.push({ phase, phaseLabel: name, lineItems: lines.length ? lines : [name] });
      }
      if (out.length) return out;
    } catch {
      /* try next path */
    }
  }
  return [];
}

function defaultCategoryBlocks() {
  return DEFAULT_SCHEDULE_CATEGORY_NAMES.map((phaseLabel) => ({
    phase: slugPhase(phaseLabel),
    phaseLabel,
    lineItems: [phaseLabel]
  }));
}

/**
 * Resolve schedule category blocks for a project.
 * Priority: fee proposal (via job) → Buildxact job → defaults.
 * @param {import("@supabase/supabase-js").SupabaseClient} sb
 * @param {{ id: string, job_id?: string | null, buildexact_job_id?: string | null }} project
 */
export async function resolveScheduleCategoryBlocks(sb, project) {
  const projectId = String(project?.id || "").trim();
  const jobId = project?.job_id ? String(project.job_id) : null;
  const beJobId = project?.buildexact_job_id ? String(project.buildexact_job_id).trim() : null;

  if (jobId) {
    const { data: fp } = await sb
      .from("fee_proposals")
      .select("id, categories, updated_at")
      .eq("job_id", jobId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fp?.categories) {
      const blocks = categoriesFromFeeProposal(fp.categories);
      if (blocks.length) {
        return {
          source: "fee_proposal",
          fee_proposal_id: fp.id,
          categories: blocks
        };
      }
    }
  }

  if (beJobId) {
    const beBlocks = await categoriesFromBuildexactJob(beJobId);
    if (beBlocks.length) {
      return { source: "buildexact", buildexact_job_id: beJobId, categories: beBlocks };
    }
  }

  return {
    source: "default",
    categories: defaultCategoryBlocks(),
    message: !jobId && !beJobId ? "No job or Buildxact link; using default category list." : undefined
  };
}
