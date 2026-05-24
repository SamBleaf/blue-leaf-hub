import { authFetch } from "../lib/authFetch.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useBlueprintContext } from "../lib/BlueprintContext.jsx";
import { getSupabase, supabaseConfigured } from "../lib/supabaseClient";
import {
  cloneDefaultExclusions,
  cloneDefaultInclusionSections,
  DEFAULT_FEE_SCHEDULE,
  emptyProposal,
  mergeParsedToProposal,
  TEMPLATE_STORAGE_KEY
} from "../lib/feeProposalDefaults.js";
import { formatSignatureFooter, loadEmailSignature } from "../lib/rfqSettings.js";

const TABS = [
  { id: "cover", label: "Cover" },
  { id: "inclusions", label: "Inclusions" },
  { id: "pc", label: "PC sums" },
  { id: "optional", label: "Optional" },
  { id: "exclusions", label: "Exclusions" },
  { id: "summary", label: "Summary" },
  { id: "fee", label: "Fee schedule" },
  { id: "next", label: "Next steps" }
];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === "string" ? r.result.split(",")[1] || "" : "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function pickBuildexactClientName(job) {
  if (!job || typeof job !== "object") return "";
  return String(
    job.ClientName ||
      job.clientName ||
      job.CustomerName ||
      job.customerName ||
      job.Name ||
      job.Client?.Name ||
      job.client?.name ||
      ""
  ).trim();
}

/** Match a freeform address string against the loaded jobs list. Returns job ID or null. */
function fuzzyMatchJobId(rawAddress, jobs) {
  if (!rawAddress || !jobs?.length) return null;
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  const addr = norm(rawAddress);
  // Exact normalised match
  const exact = jobs.find((j) => norm(j.address) === addr);
  if (exact) return exact.id;
  // Match on first token (street number + name before comma/slash)
  const firstPart = norm(rawAddress.split(/[,/]/)[0]);
  if (firstPart.length >= 4) {
    const partial = jobs.find((j) => norm(j.address).startsWith(firstPart));
    if (partial) return partial.id;
    // Also check if any job address starts with the first part
    const contains = jobs.find((j) => norm(j.address).includes(firstPart));
    if (contains) return contains.id;
  }
  return null;
}

function proposalToDb(p, jobId) {
  const qn = String(p.quote_number || "").replace(/^Quote\s+/i, "").trim();
  return {
    job_id: jobId || null,
    quote_number: qn || null,
    address: p.address || null,
    client_name: p.client_name || null,
    client_salutation: p.client_salutation || null,
    architect_name: p.architect_name || null,
    building_type: p.building_type || null,
    arch_ref: p.arch_ref || null,
    eng_ref: p.eng_ref || null,
    spec_ref: p.spec_ref || null,
    categories: p.categories || [],
    optional_items: p.optional_items || [],
    exclusions: p.exclusions || [],
    inclusion_sections: p.inclusion_sections || [],
    pc_sums: p.pc_sums || [],
    fee_schedule: p.fee_schedule || [],
    net_total: p.net_total,
    markup_percent: p.markup_percent,
    markup_amount: p.markup_amount,
    tax_amount: p.tax_amount,
    total_inc_gst: p.total_inc_gst,
    signatories: p.signatories,
    opening_paragraph: p.opening_paragraph,
    next_steps: p.next_steps,
    updated_at: new Date().toISOString(),
    dropbox_pdf_path: p.dropbox_pdf_path || null
  };
}

function dbToProposal(row) {
  if (!row) return emptyProposal();
  const qn = row.quote_number ? `Quote ${row.quote_number}` : "";
  return {
    ...emptyProposal(),
    quote_number: qn,
    address: row.address || "",
    client_name: row.client_name || "",
    client_salutation: row.client_salutation || "",
    architect_name: row.architect_name || "",
    building_type: row.building_type || "",
    arch_ref: row.arch_ref || "",
    eng_ref: row.eng_ref || "",
    spec_ref: row.spec_ref || "TENDER",
    net_total: Number(row.net_total) || 0,
    markup_percent: Number(row.markup_percent) || 0,
    markup_amount: Number(row.markup_amount) || 0,
    tax_amount: Number(row.tax_amount) || 0,
    total_inc_gst: Number(row.total_inc_gst) || 0,
    signatories: row.signatories || "",
    opening_paragraph: row.opening_paragraph || "",
    next_steps: row.next_steps || "",
    categories: row.categories || [],
    SUMMARY_ROWS: [],
    inclusion_sections:
      Array.isArray(row.inclusion_sections) && row.inclusion_sections.length > 0
        ? row.inclusion_sections
        : cloneDefaultInclusionSections(),
    pc_sums: row.pc_sums || [],
    optional_items: row.optional_items || [],
    exclusions:
      Array.isArray(row.exclusions) && row.exclusions.length > 0 ? row.exclusions : cloneDefaultExclusions(),
    fee_schedule: row.fee_schedule?.length ? row.fee_schedule : DEFAULT_FEE_SCHEDULE.map((r) => ({ ...r })),
    dropbox_pdf_path: row.dropbox_pdf_path || "",
    floor_area_m2: "",
    buildexact_status: row.buildexact_status || ""
  };
}

export default function FeeProposalWizard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isNew = !id || id === "new";
  const [step, setStep] = useState(1);
  const [tab, setTab] = useState("cover");
  const [proposal, setProposal] = useState(() => emptyProposal());
  const [parseSummary, setParseSummary] = useState(null);
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState("");
  const [jobs, setJobs] = useState([]);
  const [emailComposerOpen, setEmailComposerOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState(null);
  const [driveFileId, setDriveFileId] = useState(null);
  const [driveEditUrl, setDriveEditUrl] = useState(null);
  const [estimateId, setEstimateId] = useState(null);
  const [buildexactJobId, setBuildexactJobId] = useState("");
  const [buildexactEstimateId, setBuildexactEstimateId] = useState("");
  const { setScreenContext } = useBlueprintContext() || {};
  const [templateLoaded, setTemplateLoaded] = useState(() => Boolean(localStorage.getItem(TEMPLATE_STORAGE_KEY)));

  // Load template: localStorage cache first, then server, then bundled fallback
  useEffect(() => {
    if (localStorage.getItem(TEMPLATE_STORAGE_KEY)) return; // already cached
    (async () => {
      // 1. Try server (Supabase Storage)
      try {
        const r = await authFetch("/api/settings/fee-proposal-template");
        if (r.ok) {
          const j = await r.json();
          if (j?.dataBase64) {
            localStorage.setItem(TEMPLATE_STORAGE_KEY, j.dataBase64);
            setTemplateLoaded(true);
            return;
          }
        }
      } catch { /* fall through */ }

      // 2. Fall back to bundled public file
      try {
        const res = await fetch("/BLB_TENDER_TEMPLATE.docx");
        if (!res.ok) return;
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        }
        const b64 = btoa(binary);
        localStorage.setItem(TEMPLATE_STORAGE_KEY, b64);
        setTemplateLoaded(true);
      } catch {
        // Will fall back to manual upload
      }
    })();
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) return;
    (async () => {
      const sb = getSupabase();
      const { data } = await sb
        .from("jobs")
        .select("id, address, client_name, architect_name, arch_ref, eng_ref, spec_ref, floor_area_m2, building_type, buildexact_job_id")
        .order("created_at", { ascending: false })
        .limit(100);
      setJobs(data || []);
    })();
  }, []);

  const loadRow = useCallback(async () => {
    if (!id || id === "new" || !supabaseConfigured) return;
    const sb = getSupabase();
    const { data, error } = await sb.from("fee_proposals").select("*").eq("id", id).single();
    if (error) {
      alert(error.message);
      return;
    }
    setProposal(dbToProposal(data));
    setJobId(data.job_id || "");
    setBuildexactJobId(String(data.buildexact_job_id || "").trim());
    setBuildexactEstimateId(String(data.buildexact_estimate_id || "").trim());
    setStep(2);
    setScreenContext?.({
      page: "fee-proposal",
      jobId: data.job_id || null,
      jobAddress: data.address || "",
      quoteNumber: data.quote_number || "",
      clientName: data.client_name || ""
    });
  }, [id, setScreenContext]);

  useEffect(() => {
    loadRow();
  }, [loadRow]);

  const hydrateFromJob = useCallback(async (jid) => {
    if (!supabaseConfigured || !jid) return;
    const sb = getSupabase();
    const { data: job } = await sb.from("jobs").select("*").eq("id", jid).maybeSingle();
    if (!job) return;

    // Pull values from extracted_data as fallback for columns that may be null
    const ex = job.extracted_data && typeof job.extracted_data === "object" ? job.extracted_data : {};
    const exBs = ex.building_specs && typeof ex.building_specs === "object" ? ex.building_specs : {};
    const exArchitect = String(ex.architect_name || "").trim();
    const exFloorArea = ex.floor_area_m2 != null ? Number(ex.floor_area_m2) : (exBs.floor_area_m2 != null ? Number(exBs.floor_area_m2) : null);
    const exClient = String(ex.client_name || "").trim();
    const exBuildingType = String(exBs.building_type || ex.building_type || "").trim();

    let beId = String(job.buildexact_job_id || "").trim();
    if (!beId) {
      const { data: proj } = await sb.from("projects").select("buildexact_job_id").eq("job_id", jid).maybeSingle();
      beId = String(proj?.buildexact_job_id || "").trim();
    }
    setBuildexactJobId(beId);
    let buildexactClient = "";
    if (beId) {
      try {
        const r = await authFetch(`/api/buildexact/job/${encodeURIComponent(beId)}`);
        const j = await r.json();
        if (r.ok && j?.ok && j.job) buildexactClient = pickBuildexactClientName(j.job);
      } catch {
        /* ignore */
      }
    }
    setProposal((p) => ({
      ...p,
      address: (p.address || "").trim() || job.address || "",
      client_name: (p.client_name || "").trim() || buildexactClient || job.client_name || exClient || "",
      architect_name: (p.architect_name || "").trim() || job.architect_name || exArchitect || "",
      arch_ref: (p.arch_ref || "").trim() || job.arch_ref || "",
      eng_ref: (p.eng_ref || "").trim() || job.eng_ref || "",
      spec_ref: (() => {
        const cur = (p.spec_ref || "").trim();
        if (cur && cur !== "TENDER") return cur;
        const jv = (job.spec_ref || "").trim();
        return jv || "TENDER";
      })(),
      building_type: (p.building_type || "").trim() || job.building_type || exBuildingType || "",
      floor_area_m2:
        p.floor_area_m2 !== "" && p.floor_area_m2 != null
          ? p.floor_area_m2
          : job.floor_area_m2 != null
            ? Number(job.floor_area_m2)
            : exFloorArea != null && Number.isFinite(exFloorArea)
              ? exFloorArea
              : ""
    }));
  }, []);

  useEffect(() => {
    if (!isNew) return;
    const qJobId = searchParams.get("jobId");
    if (!qJobId) return;
    setJobId(qJobId);
    void hydrateFromJob(qJobId);
  }, [isNew, searchParams, hydrateFromJob]);

  const selectedJob = useMemo(() => jobs.find((j) => j.id === jobId) || null, [jobs, jobId]);
  const selectedBuildexactJobId = String(buildexactJobId || selectedJob?.buildexact_job_id || "").trim();

  const summaryRows = useMemo(() => {
    const fmt = (n) =>
      new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(n) || 0);
    if (proposal.SUMMARY_ROWS?.length) return proposal.SUMMARY_ROWS;
    return (proposal.categories || []).map((c) => {
      const ex = Number(c.subtotal_ex_gst ?? c.subtotal ?? 0);
      const inc = Number(c.subtotal_inc_gst ?? Math.round(ex * 1.1 * 100) / 100);
      const name = c.name || String(c.number ?? "");
      return {
        name,
        subtotal_ex_gst: ex,
        subtotal_inc_gst: inc,
        CATEGORY_NAME: name,
        CATEGORY_SUBTOTAL_EX_GST: fmt(ex),
        CATEGORY_COST_GST: fmt(inc)
      };
    });
  }, [proposal]);

  async function handleParseFile(file) {
    if (!file) return;
    const ext = file.name.toLowerCase();
    setBusy(true);
    try {
      const b64 = await fileToBase64(file);
      const url = ext.endsWith(".pdf") ? "/api/fee-proposal/parse-pdf" : "/api/fee-proposal/parse-xlsx";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataBase64: b64, filename: file.name })
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "Parse failed");
      setParseSummary(j.parsed);
      if (j.estimate_id) setEstimateId(j.estimate_id);

      // Resolve job: prefer server match, then fuzzy-match against loaded jobs list
      let resolvedJobId = j.job_id || null;
      if (!resolvedJobId && j.parsed?.address) {
        resolvedJobId = fuzzyMatchJobId(j.parsed.address, jobs);
      }
      if (resolvedJobId) {
        setJobId(resolvedJobId);
        void hydrateFromJob(resolvedJobId);
      }
      setScreenContext?.({
        page: "fee-proposal",
        jobId: resolvedJobId || null,
        jobAddress: j.parsed?.address || "",
        estimateTotal: j.parsed?.estimate_total || null
      });
      const sb = getSupabase();
      const { data: seq, error: sErr } = await sb.rpc("alloc_proposal_sequence");
      if (sErr) throw new Error(sErr.message);
      setProposal(mergeParsedToProposal(j.parsed, seq));
    } catch (e) {
      alert(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function pullFromBuildexact() {
    const beJobId = selectedBuildexactJobId;
    if (!beJobId) return;
    setBusy(true);
    try {
      const res = await authFetch(`/api/buildexact/job/${encodeURIComponent(beJobId)}/estimate`);
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "Buildexact pull failed");
      setParseSummary({ ...j.estimate, scheduleHints: j.scheduleHints, costMetrics: j.costMetrics });
      if (j.estimate_id) setEstimateId(j.estimate_id);
      setBuildexactJobId(beJobId);
      if (j.buildexact_estimate_id) setBuildexactEstimateId(String(j.buildexact_estimate_id));
      if (j.job_id && !jobId) setJobId(j.job_id);
      // Only allocate a new sequence number for brand-new proposals
      let seq = null;
      if (isNew) {
        const sb = getSupabase();
        const { data: seqData, error: sErr } = await sb.rpc("alloc_proposal_sequence");
        if (sErr) throw new Error(sErr.message);
        seq = seqData;
      }
      setProposal((p) => ({
        ...mergeParsedToProposal(j.estimate, seq),
        architect_name: p.architect_name || "",
        arch_ref: p.arch_ref || "",
        eng_ref: p.eng_ref || "",
        spec_ref: p.spec_ref || "TENDER"
      }));
      alert(`Pulled Buildexact estimate: ${new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(j.estimate?.estimate_total || 0)}`);
    } catch (e) {
      alert(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!supabaseConfigured) return;
    const sb = getSupabase();
    setBusy(true);
    try {
      let row = {
        ...proposalToDb({ ...proposal, SUMMARY_ROWS: summaryRows }, jobId),
        ...(buildexactEstimateId || estimateId ? { buildexact_estimate_id: buildexactEstimateId || estimateId } : {}),
        ...(selectedBuildexactJobId ? { buildexact_job_id: selectedBuildexactJobId } : {})
      };
      if (isNew && !row.quote_number) {
        const { data: seq, error: sq } = await sb.rpc("alloc_proposal_sequence");
        if (sq) throw new Error(sq.message);
        const n = String(seq);
        row = { ...row, quote_number: n };
        setProposal((p) => ({ ...p, quote_number: `Quote ${n}` }));
      }
      if (isNew) {
        const { data, error } = await sb.from("fee_proposals").insert({ ...row, status: "draft" }).select("id").single();
        if (error) throw new Error(error.message);
        navigate(`/tender-manager/fee-proposal/${data.id}`, { replace: true });
      } else {
        const { error } = await sb.from("fee_proposals").update(row).eq("id", id);
        if (error) throw new Error(error.message);
        alert("Saved.");
      }
    } catch (e) {
      alert(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function generateDocx() {
    const tpl = localStorage.getItem(TEMPLATE_STORAGE_KEY)?.trim();
    if (!tpl) {
      alert("Upload a Word template in Step 3 first (or on Template setup).");
      return;
    }
    setBusy(true);
    try {
      const res = await authFetch("/api/fee-proposal/generate-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateBase64: tpl,
          proposalData: { ...proposal, SUMMARY_ROWS: summaryRows },
          filename: `Fee-${String(proposal.quote_number).replace(/\s+/g, "-")}.docx`
        })
      });
      const ct = res.headers.get("content-type") || "";
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Generate failed");
      }
      if (!ct.includes("wordprocessingml")) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Unexpected response");
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Fee-${String(proposal.quote_number).replace(/\s+/g, "-")}.docx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function openInGoogleDocs() {
    const tpl = localStorage.getItem(TEMPLATE_STORAGE_KEY)?.trim();
    if (!tpl) {
      alert("Upload a Word template first.");
      return;
    }
    setBusy(true);
    try {
      const res = await authFetch("/api/fee-proposal/upload-to-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateBase64: tpl,
          proposalData: { ...proposal, SUMMARY_ROWS: summaryRows },
          quoteNumber: proposal.quote_number
        })
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "Upload failed");
      setDriveFileId(j.fileId);
      setDriveEditUrl(j.editUrl);
      window.open(j.editUrl, "_blank", "noopener");
    } catch (e) {
      alert(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  function buildEmailBody() {
    const addr = proposal.address || "the project address";
    const clientName = proposal.client_salutation || proposal.client_name || "there";
    return `Hi ${clientName},

Please find attached our fee proposal for the proposed works at ${addr}.

Thank you for the opportunity to tender this project. We appreciate the time and effort that has gone into the design and documentation, and we are excited by the opportunity to potentially work together to deliver the project.

Our proposal outlines the scope of works, inclusions, allowances, and preliminary pricing based on the current documentation provided. Should there be any further information, revisions, or clarification required during the assessment process, please do not hesitate to contact us.

At Blue Leaf Building, we focus on delivering high-quality, architecturally driven projects with an emphasis on craftsmanship, communication, and attention to detail. We value working collaboratively with clients, architects, consultants, and suppliers to ensure the best possible outcome is achieved throughout the build process.

We appreciate your consideration and look forward to discussing the proposal further.

Kind regards,
Sam Morris & Josh Manning
Directors
Blue Leaf Building

0434 046 399
info@blueleafbuilding.com.au`;
  }

  function openEmailComposer() {
    if (!localStorage.getItem(TEMPLATE_STORAGE_KEY)?.trim()) {
      alert("Template missing — upload a Word template in Step 3 first.");
      return;
    }
    const addr = proposal.address || "";
    const qn = proposal.quote_number || "Draft";
    setEmailDraft({
      to: "",
      cc: "",
      bcc: "",
      subject: `Fee Proposal - ${addr || qn}`,
      body: buildEmailBody(),
      sendCopy: true
    });
    setEmailComposerOpen(true);
  }

  async function markProposalAccepted() {
    if (isNew) {
      alert("Save the proposal before marking it accepted.");
      return;
    }
    if (!window.confirm("Mark this fee proposal as accepted?")) return;
    setBusy(true);
    try {
      const res = await authFetch(`/api/fee-proposal/${encodeURIComponent(id)}/accept`, { method: "POST" });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "Could not mark accepted");
      setProposal((p) => ({ ...p, buildexact_status: "accepted" }));
      alert("Fee proposal marked as accepted.");
    } catch (e) {
      alert(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doSendEmail(draft) {
    const tpl = localStorage.getItem(TEMPLATE_STORAGE_KEY)?.trim();
    if (!tpl) { alert("Template missing."); return; }
    setBusy(true);
    try {
      // Step 1: generate DOCX
      const gen = await authFetch("/api/fee-proposal/generate-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateBase64: tpl,
          proposalData: { ...proposal, SUMMARY_ROWS: summaryRows },
          filename: "Fee-Proposal.docx"
        })
      });
      if (!gen.ok) { const j = await gen.json().catch(() => ({})); throw new Error(j.error || "Generate failed"); }
      const blob = await gen.blob();
      const docxBase64 = arrayBufferToBase64(await blob.arrayBuffer());

      // Step 2: convert to PDF
      const conv = await authFetch("/api/fee-proposal/docx-to-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(driveFileId ? { driveFileId } : { docxBase64 }),
          jobAddress: proposal.address,
          quoteNumber: proposal.quote_number,
          proposalId: isNew ? "" : id
        })
      });
      const cj = await conv.json();
      if (!conv.ok || !cj.ok) throw new Error(cj.error || "PDF conversion failed");

      // Step 3: send email
      const sig = loadEmailSignature();
      const res = await authFetch("/api/fee-proposal/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: draft.to,
          cc: draft.cc || "",
          bcc: draft.bcc || "",
          sendCopy: draft.sendCopy,
          proposalId: isNew ? "" : id,
          jobId: jobId || null,
          address: proposal.address,
          quoteNumber: proposal.quote_number,
          subject: draft.subject,
          pdfBase64: cj.pdfBase64,
          body: draft.body,
          signatureFooter: formatSignatureFooter(sig),
          signatureLogoDataUrl: String(sig.logoDataUrl || "").trim()
        })
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "Send failed");
      setEmailComposerOpen(false);
      const dropboxNote = cj.dropbox_pdf_path ? `\nPDF saved to Dropbox: ${cj.dropbox_pdf_path}` : "";
      alert(`Fee proposal sent to ${draft.to}.${dropboxNote}`);
    } catch (e) {
      alert(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {searchParams.get("jobId") ? (
          <Link to={`/tender-manager/board/${searchParams.get("jobId")}`} className="font-semibold text-accent underline">
            ← Back to tender
          </Link>
        ) : (
          <Link to="/tender-manager/fee-proposal" className="font-semibold text-accent underline">
            ← Fee proposals
          </Link>
        )}
      </div>
      <header>
        <h1 className="text-2xl font-bold text-primary">{isNew ? "New fee proposal" : "Edit fee proposal"}</h1>
        <div className="mt-3 flex gap-2 text-sm">
          {[1, 2, 3].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStep(s)}
              className={`rounded-full px-3 py-1 font-semibold ${step === s ? "bg-accent text-white" : "bg-page text-muted ring-1 ring-hairline"}`}
            >
              Step {s}
            </button>
          ))}
        </div>
      </header>

      {step === 1 ? (
        <section className="rounded-card border border-hairline bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-primary">Import Buildexact</h2>
          <p className="mt-1 text-sm text-muted">Upload XLSX (preferred) or PDF. PDF uses Claude on the server.</p>
          {selectedBuildexactJobId ? (
            <button
              type="button"
              disabled={busy}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              onClick={pullFromBuildexact}
            >
              <span aria-hidden="true">Sync</span>
              {busy ? "Pulling…" : "Pull from Buildexact"}
            </button>
          ) : null}
          <input
            type="file"
            accept=".xlsx,.xls,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf"
            disabled={busy}
            className="mt-4 block text-sm"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) handleParseFile(f);
            }}
          />
          <button type="button" className="mt-4 rounded-lg border border-hairline px-4 py-2 text-sm font-semibold" onClick={() => setStep(2)}>
            Skip import — manual entry
          </button>
          {parseSummary ? (
            <pre className="mt-4 max-h-48 overflow-auto rounded border border-hairline bg-page p-3 text-[11px] text-muted">{JSON.stringify(parseSummary, null, 2)}</pre>
          ) : null}
          <div className="mt-6 flex justify-end">
            <button type="button" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white" onClick={() => setStep(2)}>
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="space-y-4 rounded-card border border-hairline bg-surface p-6 shadow-sm">
          <div className="flex flex-wrap gap-2 border-b border-hairline pb-3">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === t.id ? "bg-accent text-white" : "bg-page text-ink ring-1 ring-hairline"}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "cover" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-ink sm:col-span-2">
                Quote number
                <input className="mt-1 w-full rounded border px-2 py-1 text-sm" value={proposal.quote_number} onChange={(e) => setProposal((p) => ({ ...p, quote_number: e.target.value }))} />
              </label>
              <label className="text-xs font-semibold text-ink sm:col-span-2">
                Project address
                <input
                  className="mt-1 w-full rounded border px-2 py-1 text-sm"
                  value={proposal.address}
                  onChange={(e) => setProposal((p) => ({ ...p, address: e.target.value }))}
                  onBlur={(e) => {
                    if (!jobId) {
                      const matched = fuzzyMatchJobId(e.target.value, jobs);
                      if (matched) { setJobId(matched); void hydrateFromJob(matched); }
                    }
                  }}
                />
              </label>
              <label className="text-xs font-semibold text-ink">
                Client name
                <input className="mt-1 w-full rounded border px-2 py-1 text-sm" value={proposal.client_name} onChange={(e) => setProposal((p) => ({ ...p, client_name: e.target.value }))} />
              </label>
              <label className="text-xs font-semibold text-ink">
                Salutation (Dear line)
                <input className="mt-1 w-full rounded border px-2 py-1 text-sm" value={proposal.client_salutation} onChange={(e) => setProposal((p) => ({ ...p, client_salutation: e.target.value }))} />
              </label>
              <label className="text-xs font-semibold text-ink">
                Architect
                <input className="mt-1 w-full rounded border px-2 py-1 text-sm" value={proposal.architect_name} onChange={(e) => setProposal((p) => ({ ...p, architect_name: e.target.value }))} />
              </label>
              <label className="text-xs font-semibold text-ink">
                Building type
                <input
                  className="mt-1 w-full rounded border px-2 py-1 text-sm"
                  value={proposal.building_type}
                  onChange={(e) => setProposal((p) => ({ ...p, building_type: e.target.value }))}
                />
              </label>
              <label className="text-xs font-semibold text-ink">
                Floor area (m²)
                <input
                  type="number"
                  className="mt-1 w-full rounded border px-2 py-1 text-sm"
                  value={proposal.floor_area_m2 === "" || proposal.floor_area_m2 == null ? "" : proposal.floor_area_m2}
                  onChange={(e) =>
                    setProposal((p) => ({
                      ...p,
                      floor_area_m2: e.target.value === "" ? "" : Number(e.target.value)
                    }))
                  }
                />
              </label>
              <label className="text-xs font-semibold text-ink">
                Date
                <input className="mt-1 w-full rounded border px-2 py-1 text-sm" value={proposal.date} onChange={(e) => setProposal((p) => ({ ...p, date: e.target.value }))} />
              </label>
              <label className="text-xs font-semibold text-ink">
                Arch ref
                <input className="mt-1 w-full rounded border px-2 py-1 text-sm" value={proposal.arch_ref} onChange={(e) => setProposal((p) => ({ ...p, arch_ref: e.target.value }))} />
              </label>
              <label className="text-xs font-semibold text-ink">
                Eng ref
                <input className="mt-1 w-full rounded border px-2 py-1 text-sm" value={proposal.eng_ref} onChange={(e) => setProposal((p) => ({ ...p, eng_ref: e.target.value }))} />
              </label>
              <label className="text-xs font-semibold text-ink">
                Spec ref
                <input className="mt-1 w-full rounded border px-2 py-1 text-sm" value={proposal.spec_ref} onChange={(e) => setProposal((p) => ({ ...p, spec_ref: e.target.value }))} />
              </label>
              <label className="text-xs font-semibold text-ink sm:col-span-2">
                Signatories
                <input className="mt-1 w-full rounded border px-2 py-1 text-sm" value={proposal.signatories} onChange={(e) => setProposal((p) => ({ ...p, signatories: e.target.value }))} />
              </label>
              <label className="text-xs font-semibold text-ink sm:col-span-2">
                Opening paragraph
                <textarea className="mt-1 w-full rounded border px-2 py-1 text-sm" rows={4} value={proposal.opening_paragraph} onChange={(e) => setProposal((p) => ({ ...p, opening_paragraph: e.target.value }))} />
              </label>
              <label className="text-xs font-semibold text-ink sm:col-span-2">
                Link job (optional)
                <select
                  className="mt-1 w-full rounded border px-2 py-1 text-sm"
                  value={jobId}
                  onChange={(e) => {
                    const v = e.target.value;
                    setJobId(v);
                    if (isNew && v) void hydrateFromJob(v);
                  }}
                >
                  <option value="">—</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.address}
                    </option>
                  ))}
                </select>
              </label>
              {selectedBuildexactJobId ? (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm sm:col-span-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-primary">Buildexact job linked</p>
                    <p className="truncate text-xs text-muted">{selectedBuildexactJobId}</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    onClick={pullFromBuildexact}
                  >
                    {busy ? "Pulling…" : "Pull from Buildexact"}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === "inclusions" ? (
            <div className="space-y-4">
              {(proposal.inclusion_sections || []).map((sec, si) => (
                <div key={si} className="rounded border border-hairline p-3">
                  <input
                    className="w-full font-semibold text-ink"
                    value={sec.SECTION_HEADING}
                    onChange={(e) =>
                      setProposal((p) => ({
                        ...p,
                        inclusion_sections: p.inclusion_sections.map((s, i) => (i === si ? { ...s, SECTION_HEADING: e.target.value } : s))
                      }))
                    }
                  />
                  {(sec.SECTION_ITEMS || []).map((it, ii) => (
                    <div key={ii} className="mt-2 flex gap-2">
                      <span className="text-muted">•</span>
                      <input
                        className="flex-1 rounded border px-2 py-1 text-sm"
                        value={it.ITEM_TEXT}
                        onChange={(e) =>
                          setProposal((p) => ({
                            ...p,
                            inclusion_sections: p.inclusion_sections.map((s, i) =>
                              i === si
                                ? {
                                    ...s,
                                    SECTION_ITEMS: s.SECTION_ITEMS.map((x, j) => (j === ii ? { ...x, ITEM_TEXT: e.target.value } : x))
                                  }
                                : s
                            )
                          }))
                        }
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    className="mt-2 text-xs font-semibold text-accent underline"
                    onClick={() =>
                      setProposal((p) => ({
                        ...p,
                        inclusion_sections: p.inclusion_sections.map((s, i) =>
                          i === si ? { ...s, SECTION_ITEMS: [...(s.SECTION_ITEMS || []), { ITEM_TEXT: "" }] } : s
                        )
                      }))
                    }
                  >
                    + Bullet
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="text-sm font-semibold text-accent underline"
                onClick={() =>
                  setProposal((p) => ({
                    ...p,
                    inclusion_sections: [...(p.inclusion_sections || []), { SECTION_HEADING: "New section", SECTION_ITEMS: [{ ITEM_TEXT: "" }] }]
                  }))
                }
              >
                + Section
              </button>
            </div>
          ) : null}

          {tab === "pc" ? (
            <div className="space-y-2">
              {(proposal.pc_sums || []).map((row, i) => (
                <div key={i} className="flex gap-2">
                  <input className="flex-1 rounded border px-2 py-1 text-sm" value={row.PC_DESCRIPTION} onChange={(e) => setProposal((p) => ({ ...p, pc_sums: p.pc_sums.map((x, j) => (j === i ? { ...x, PC_DESCRIPTION: e.target.value } : x)) }))} />
                  <input className="w-36 rounded border px-2 py-1 text-sm" value={row.PC_AMOUNT} onChange={(e) => setProposal((p) => ({ ...p, pc_sums: p.pc_sums.map((x, j) => (j === i ? { ...x, PC_AMOUNT: e.target.value } : x)) }))} />
                </div>
              ))}
              <button type="button" className="text-xs text-accent underline" onClick={() => setProposal((p) => ({ ...p, pc_sums: [...(p.pc_sums || []), { PC_DESCRIPTION: "", PC_AMOUNT: "" }] }))}>
                + Row
              </button>
            </div>
          ) : null}

          {tab === "optional" ? (
            <div className="space-y-2">
              {(proposal.optional_items || []).map((row, i) => (
                <div key={i} className="flex gap-2">
                  <input className="flex-1 rounded border px-2 py-1 text-sm" value={row.OPTION_DESCRIPTION || ""} onChange={(e) => setProposal((p) => ({ ...p, optional_items: p.optional_items.map((x, j) => (j === i ? { ...x, OPTION_DESCRIPTION: e.target.value } : x)) }))} />
                  <input className="w-36 rounded border px-2 py-1 text-sm" value={row.OPTION_PRICE || ""} onChange={(e) => setProposal((p) => ({ ...p, optional_items: p.optional_items.map((x, j) => (j === i ? { ...x, OPTION_PRICE: e.target.value } : x)) }))} />
                </div>
              ))}
              <button type="button" className="text-xs text-accent underline" onClick={() => setProposal((p) => ({ ...p, optional_items: [...(p.optional_items || []), { OPTION_DESCRIPTION: "", OPTION_PRICE: "" }] }))}>
                + Row
              </button>
            </div>
          ) : null}

          {tab === "exclusions" ? (
            <div className="space-y-2">
              {(proposal.exclusions || []).map((ex, i) => (
                <input key={i} className="w-full rounded border px-2 py-1 text-sm" value={typeof ex === "string" ? ex : ex.EXCLUSION_TEXT} onChange={(e) => setProposal((p) => ({ ...p, exclusions: p.exclusions.map((x, j) => (j === i ? e.target.value : x)) }))} />
              ))}
              <button type="button" className="text-xs text-accent underline" onClick={() => setProposal((p) => ({ ...p, exclusions: [...(p.exclusions || []), ""] }))}>
                + Line
              </button>
            </div>
          ) : null}

          {tab === "summary" ? (
            <div>
              <p className="text-sm text-muted">Per-category totals (inc GST) from Buildexact import.</p>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-xs uppercase text-muted">
                      <th className="py-2 pr-3">Category</th>
                      <th className="py-2">Total (inc GST)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRows.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="py-4 text-muted">
                          Import an XLSX or add categories to see summary lines.
                        </td>
                      </tr>
                    ) : (
                      summaryRows.map((r, i) => (
                        <tr key={i} className="border-b border-hairline/80">
                          <td className="py-2 pr-3 font-medium text-ink">{r.CATEGORY_NAME}</td>
                          <td className="py-2 font-semibold text-accent">{r.CATEGORY_COST_GST}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-lg font-bold text-primary">
                Total (inc GST):{" "}
                {new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(proposal.total_inc_gst || 0)}
              </p>
              <label className="mt-4 block text-xs font-semibold text-ink">
                Total inc GST (editable)
                <input
                  type="number"
                  className="mt-1 w-full rounded border px-2 py-1 text-sm"
                  value={proposal.total_inc_gst || ""}
                  onChange={(e) => setProposal((p) => ({ ...p, total_inc_gst: Number(e.target.value) || 0 }))}
                />
              </label>
            </div>
          ) : null}

          {tab === "fee" ? (
            <div className="space-y-2">
              {(proposal.fee_schedule || []).map((row, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-3">
                  <input className="rounded border px-2 py-1 text-sm" value={row.STAGE_CLAIM} onChange={(e) => setProposal((p) => ({ ...p, fee_schedule: p.fee_schedule.map((x, j) => (j === i ? { ...x, STAGE_CLAIM: e.target.value } : x)) }))} />
                  <input className="rounded border px-2 py-1 text-sm" value={row.MILESTONE} onChange={(e) => setProposal((p) => ({ ...p, fee_schedule: p.fee_schedule.map((x, j) => (j === i ? { ...x, MILESTONE: e.target.value } : x)) }))} />
                  <input className="rounded border px-2 py-1 text-sm" value={row.PERCENTAGE} onChange={(e) => setProposal((p) => ({ ...p, fee_schedule: p.fee_schedule.map((x, j) => (j === i ? { ...x, PERCENTAGE: e.target.value } : x)) }))} />
                </div>
              ))}
            </div>
          ) : null}

          {tab === "next" ? (
            <label className="text-xs font-semibold text-ink">
              Next steps
              <textarea className="mt-1 w-full rounded border px-2 py-1 text-sm" rows={8} value={proposal.next_steps} onChange={(e) => setProposal((p) => ({ ...p, next_steps: e.target.value }))} />
            </label>
          ) : null}

          <div className="mt-6 flex flex-wrap justify-between gap-2">
            <button type="button" className="rounded-lg border border-hairline px-4 py-2 text-sm" onClick={() => setStep(1)}>
              Back
            </button>
            <div className="flex gap-2">
              <button type="button" disabled={busy} className="rounded-lg bg-page px-4 py-2 text-sm font-semibold ring-1 ring-hairline" onClick={saveDraft}>
                Save draft
              </button>
              <button type="button" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white" onClick={() => setStep(3)}>
                Continue
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="space-y-4 rounded-card border border-hairline bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-primary">Generate & send</h2>

          <div className="rounded-lg border border-hairline bg-page p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-ink">Word template</p>
              {templateLoaded ? (
                <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent">
                  Template loaded
                </span>
              ) : (
                <span className="rounded-full border border-warning/50 bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-warning">
                  Loading…
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted">
              BLB_TENDER_TEMPLATE.docx is bundled with the app. To replace it, upload a new version below.
            </p>
            <input
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="mt-2 block text-xs text-muted"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                const b64 = await fileToBase64(f);
                localStorage.setItem(TEMPLATE_STORAGE_KEY, b64);
                setTemplateLoaded(true);
                // Push to server so it persists across browsers / devices
                try {
                  await authFetch("/api/settings/fee-proposal-template", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ dataBase64: b64 })
                  });
                } catch { /* non-fatal — still saved locally */ }
                alert("Template updated and saved to server.");
              }}
            />
          </div>

          <div className="rounded-lg border border-hairline bg-page p-4">
            <h3 className="text-sm font-bold text-ink">Review in Google Docs</h3>
            <p className="mt-1 text-xs text-muted">
              Merges the template and opens it in Google Docs for editing. Come back here when
              you&rsquo;re happy with the document and click <strong>Send PDF to client</strong>.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy || !templateLoaded}
                onClick={openInGoogleDocs}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {busy ? "Uploading…" : driveFileId ? "Re-open in Google Docs" : "Open in Google Docs"}
              </button>
              {driveEditUrl ? (
                <a
                  href={driveEditUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-[11px] font-semibold text-accent"
                >
                  Doc ready — click to open ↗
                </a>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !templateLoaded}
              onClick={generateDocx}
              className="rounded-lg border border-hairline px-4 py-2 text-sm font-semibold disabled:opacity-40"
            >
              Download DOCX
            </button>
            <button type="button" className="rounded-lg border border-hairline px-4 py-2 text-sm" onClick={() => setStep(2)}>
              Back to editor
            </button>
          </div>

          <div className="border-t border-hairline pt-4">
            <h3 className="text-sm font-bold text-primary">Send PDF to client</h3>
            <p className="mt-1 text-xs text-muted">
              {driveFileId
                ? "Exports the Google Doc you edited as PDF, saves to Dropbox, and emails it to the client."
                : "Opens in Google Docs first is recommended. Alternatively, converts via LibreOffice if installed."}
            </p>
            <button
              type="button"
              disabled={busy || !templateLoaded}
              className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              onClick={openEmailComposer}
            >
              Send PDF to client…
            </button>
          </div>

          <div className="border-t border-hairline pt-4">
            <h3 className="text-sm font-bold text-primary">Proposal outcome</h3>
            <p className="mt-1 text-xs text-muted">
              Mark the fee proposal accepted once the client has approved it. If a Buildexact estimate is linked, the API sync runs in the background.
            </p>
            <button
              type="button"
              disabled={busy || isNew || proposal.buildexact_status === "accepted"}
              className="mt-3 rounded-lg border border-accent bg-accent/10 px-4 py-2 text-sm font-semibold text-accent disabled:opacity-40"
              onClick={markProposalAccepted}
            >
              {proposal.buildexact_status === "accepted" ? "Accepted" : "Mark as Accepted"}
            </button>
          </div>
        </section>
      ) : null}

      {/* Email composer modal */}
      {emailComposerOpen && emailDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-card bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
              <h2 className="text-base font-bold text-primary">Send fee proposal</h2>
              <button type="button" onClick={() => setEmailComposerOpen(false)} className="text-muted hover:text-ink text-lg leading-none">✕</button>
            </div>
            <div className="space-y-3 px-6 py-4">
              <label className="block text-xs font-semibold text-ink">
                To
                <input
                  type="email"
                  className="mt-1 w-full rounded border border-hairline px-2 py-1.5 text-sm"
                  placeholder="client@email.com"
                  value={emailDraft.to}
                  onChange={(e) => setEmailDraft((d) => ({ ...d, to: e.target.value }))}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-ink">
                  CC
                  <input
                    type="text"
                    className="mt-1 w-full rounded border border-hairline px-2 py-1.5 text-sm"
                    placeholder="cc@email.com"
                    value={emailDraft.cc}
                    onChange={(e) => setEmailDraft((d) => ({ ...d, cc: e.target.value }))}
                  />
                </label>
                <label className="block text-xs font-semibold text-ink">
                  BCC
                  <input
                    type="text"
                    className="mt-1 w-full rounded border border-hairline px-2 py-1.5 text-sm"
                    placeholder="bcc@email.com"
                    value={emailDraft.bcc}
                    onChange={(e) => setEmailDraft((d) => ({ ...d, bcc: e.target.value }))}
                  />
                </label>
              </div>
              <label className="block text-xs font-semibold text-ink">
                Subject
                <input
                  type="text"
                  className="mt-1 w-full rounded border border-hairline px-2 py-1.5 text-sm"
                  value={emailDraft.subject}
                  onChange={(e) => setEmailDraft((d) => ({ ...d, subject: e.target.value }))}
                />
              </label>
              <label className="block text-xs font-semibold text-ink">
                Message
                <textarea
                  rows={12}
                  className="mt-1 w-full rounded border border-hairline px-2 py-1.5 text-sm font-mono leading-relaxed"
                  value={emailDraft.body}
                  onChange={(e) => setEmailDraft((d) => ({ ...d, body: e.target.value }))}
                />
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={emailDraft.sendCopy}
                  onChange={(e) => setEmailDraft((d) => ({ ...d, sendCopy: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-ink">Send me a copy (info@blueleafbuilding.com.au)</span>
              </label>
            </div>
            <div className="flex justify-end gap-3 border-t border-hairline px-6 py-4">
              <button
                type="button"
                onClick={() => setEmailComposerOpen(false)}
                className="rounded-lg border border-hairline px-4 py-2 text-sm font-semibold text-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !emailDraft.to.trim()}
                onClick={() => doSendEmail(emailDraft)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {busy ? "Sending…" : "Send fee proposal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
