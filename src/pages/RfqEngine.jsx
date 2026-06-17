import { authFetch } from "../lib/authFetch.js";
import { apiPost, apiPatch } from "../lib/apiFetch.js";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { composeRfqEmail, plainBodyToHtml } from "../lib/rfqComposer";
import { getSupabase, supabaseConfigured } from "../lib/supabaseClient";
import {
  normalizeTradeKey,
  resolveTradeLabel,
  TRADE_ORDER,
  subcontractorsForTrade
} from "../lib/tradeTemplates";
import { fetchAndHydrateTradeRegistry, getTradeRegistry, registerAdHocTrade } from "../lib/rfqTradeRegistry.js";
import { validateRfqReadiness } from "../lib/rfqScopePipeline.js";
import { coerceExtraction, mergeExtractions, bulletsFromTradeNote, emptyTradeNote, RFQ_TRADE_ORDER } from "../lib/rfqExtraction.js";
import {
  defaultSelectedTradeIds,
  fetchMergedTradePlan,
  labelForTrade,
  sourceBadgeClass,
  sourceBadgeLabel
} from "../lib/rfqTradeIntelligence.js";
import { buildJobFieldsFromExtraction } from "../lib/extractionJobFields.js";
import { formatSignatureFooter, loadEmailSignature } from "../lib/rfqSettings.js";
import { jobProjectsInternalPath } from "../lib/jobFolderPath.js";
import { autoDetectDocTypeFromFileName, RFQ_DOC_TYPES } from "../lib/rfqPdfDocType.js";
import {
  deletePdfs,
  findDraftPdfByClientId,
  getPdfs,
  migrateLegacyRecords,
  RFQ_ENGINE_PDF_SCOPE,
  storePdfs
} from "../lib/rfqPdfStorage.js";
import RfqSettingsModal from "../components/RfqSettingsModal.jsx";
import { reviewDocument } from "../blueprint/api/chat";
import { QCBadge, QCResultView } from "../blueprint/components/BlueprintAgent";
import { useProject } from "../lib/ProjectContext.jsx";

/** Split Claude revised RFQ text into subject + body when Subject: line is present. */
function parseRevisedEmailDraft(revisedDocument) {
  const text = String(revisedDocument || "").trim();
  const subjMatch = text.match(/^Subject:\s*(.+?)(?:\r?\n\r?\n|\r?\n$)/im);
  if (subjMatch) {
    return {
      subject: subjMatch[1].trim(),
      body: text.slice(subjMatch[0].length).trim()
    };
  }
  return { subject: null, body: text };
}

const RFQ_SESSION_STORAGE_KEY = "blhub_rfq_session";
const LEGACY_RFQ_SESSION_KEYS = ["blue-leaf-hub.rfq-session.v4", "blue-leaf-hub.rfq-session.v3"];

/** Merge JSON blobs on server for Dropbox-connected jobs. */
async function mergeJobDataJsonRemote(jobAddress, patch) {
  const addr = String(jobAddress || "").trim();
  if (!addr || !patch || typeof patch !== "object") return;
  try {
    await authFetch("/api/jobs/merge-job-data-json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobAddress: addr, patch })
    });
  } catch {
    /* Dropbox optional */
  }
}

function pdfItemsToSessionMeta(items) {
  return (Array.isArray(items) ? items : []).map((it) => ({
    id: it.id,
    name: it.name || it.file?.name || "document.pdf",
    size: typeof it.size === "number" ? it.size : typeof it.file?.size === "number" ? it.file.size : 0,
    lastModified: typeof it.file?.lastModified === "number" ? it.file.lastModified : 0,
    docType: it.docType || "other"
  }));
}

/** True if this row can be written by `storePdfs` (non-empty buffer or legacy File/Blob). */
function pdfItemHasPersistableBytes(it) {
  if (!it) return false;
  if (it.buffer instanceof ArrayBuffer && it.buffer.byteLength > 0) return true;
  if (it instanceof File && it.size > 0) return true;
  if (it instanceof Blob && it.size > 0) return true;
  if (it.file instanceof File && it.file.size > 0) return true;
  if (it.file instanceof Blob && it.file.size > 0) return true;
  if (it.file instanceof ArrayBuffer && it.file.byteLength > 0) return true;
  return false;
}

const EXTRACT_MESSAGES_ROTATE = [
  "Architectural drawings — identifying floor plans…",
  "Engineering drawings — extracting footing details…",
  "Cross-referencing documents…",
  "Mapping notes to each trade scope…",
  "Checking for missing information…",
  "Finalising extraction…"
];

const TRADE_BADGE_HEX = {
  excavation: "#92400e",
  demolition: "#7c3aed",
  termite_protection: "#065f46",
  footings_concrete_formwork: "#1e40af",
  plumbing: "#0e7490",
  electrical: "#b45309",
  internal_linings: "#6d28d9",
  stairs: "#be185d",
  tiling: "#0f766e",
  flooring: "#78350f",
  metal_roofing: "#1f2937"
};

const LEGACY_TRADE_IDS = {
  concrete_formwork: "footings_concrete_formwork",
  electrical_solar: "electrical"
};

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result;
      if (typeof res !== "string") return reject(new Error("Unable to read file"));
      const base64 = res.split(",")[1];
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

/**
 * Parse `/api/rfq/extract` response (NDJSON stream or legacy JSON body).
 * @returns {Promise<{ ok: boolean, extraction?: object, model?: string, error?: string, warnings: string[] }>}
 */
async function parseRfqExtractNdjsonResponse(res) {
  const warnings = [];
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    const msg = json?.error || json?.detail || `Extraction failed (${res.status})`;
    return { ok: false, error: msg, warnings };
  }
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("ndjson") || !res.body) {
    const json = await res.json().catch(() => null);
    if (!json?.ok) {
      return {
        ok: false,
        error: json?.error || json?.detail || `Extraction failed (${res.status})`,
        warnings
      };
    }
    return {
      ok: true,
      extraction: json.extraction,
      model: typeof json.model === "string" ? json.model : "",
      warnings
    };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalEvent = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        return { ok: false, error: "Invalid extraction stream from API.", warnings };
      }
      if (obj.event === "warning" && obj.message) {
        warnings.push(String(obj.message));
      } else if (obj.event === "rate_limit" && obj.retryInSeconds != null) {
        const n = Number(obj.retryInSeconds);
        /* caller may set banner via outer state; here we only note */
        warnings.push(`Rate limited — retry in ${n}s`);
      } else if (obj.event === "result") {
        finalEvent = obj;
      }
    }
  }
  const tail = buffer.trim();
  if (tail) {
    try {
      const obj = JSON.parse(tail);
      if (obj.event === "result") finalEvent = obj;
    } catch {
      /* ignore trailing partial chunk */
    }
  }
  if (!finalEvent) {
    return { ok: false, error: `Extraction failed (${res.status})`, warnings };
  }
  if (!finalEvent.ok) {
    return { ok: false, error: finalEvent.error || "Extraction failed", warnings };
  }
  return {
    ok: true,
    extraction: finalEvent.extraction,
    model: typeof finalEvent.model === "string" ? finalEvent.model : "",
    warnings
  };
}

/**
 * Build a `File` for extract / Dropbox from queue state or IndexedDB.
 * @param {object} item — buffer-first `{ buffer, name, type, id }` or legacy `{ file, … }`
 * @param {string} rfqId
 * @param {File[] | null} [cachedFiles] — optional result of `getPdfs(rfqId)` to avoid extra reads
 * @returns {Promise<File>}
 */
async function resolvePdfItemFile(item, rfqId = RFQ_ENGINE_PDF_SCOPE, cachedFiles = null) {
  if (item?.buffer instanceof ArrayBuffer && item.buffer.byteLength > 0) {
    return new File([item.buffer], item.name || "document.pdf", {
      type: item.type || "application/pdf"
    });
  }

  if (item?.file instanceof File && item.file.size > 0) {
    return item.file;
  }

  if (item?.file instanceof ArrayBuffer && item.file.byteLength > 0) {
    return new File([item.file], item.name || "document.pdf", {
      type: item.type || "application/pdf"
    });
  }

  if (!rfqId) {
    throw new Error(`resolvePdfItemFile: no rfqId for "${item?.name}"`);
  }

  if (item?.id) {
    const byClient = await findDraftPdfByClientId(rfqId, item.id);
    if (byClient instanceof File && byClient.size > 0) return byClient;
  }

  const stored = Array.isArray(cachedFiles) ? cachedFiles : await getPdfs(rfqId);
  const nm = item?.name || item?.file?.name;
  const match = nm ? stored.find((f) => f instanceof File && f.size > 0 && f.name === nm) : null;

  if (!match) {
    throw new Error(
      `resolvePdfItemFile: "${item?.name}" not found in IndexedDB for RFQ ${rfqId}`
    );
  }
  return match;
}

function formatDeadlineDisplay(isoDate) {
  if (!isoDate) return "";
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function updateRowBody(rows, key, field, value) {
  // Mark the row as edited so no auto-rebuild ever re-composes over the user's changes.
  return rows.map((row) => (row.key === key ? { ...row, [field]: value, edited: true } : row));
}

/**
 * Re-compose outbound rows (add/remove trades + recipients) WITHOUT clobbering any draft the
 * user has manually edited. Edited rows keep their subject/body/html by key. The single source
 * of truth for every rebuild path — only an explicit force (Regenerate button) bypasses it.
 */
function mergePreservingEdits(prevRows, freshRows) {
  const editedByKey = new Map(
    (Array.isArray(prevRows) ? prevRows : [])
      .filter((r) => r && r.edited && !r.blocked)
      .map((r) => [r.key, r])
  );
  if (editedByKey.size === 0) return freshRows;
  return freshRows.map((row) => {
    const kept = editedByKey.get(row.key);
    if (!kept || row.blocked) return row;
    return {
      ...row,
      subject: kept.subject,
      body: kept.body,
      html: kept.html,
      subjectVariant: kept.subjectVariant,
      edited: true
    };
  });
}

function normalizeTradeIdForSession(id) {
  if (!id) return id;
  return LEGACY_TRADE_IDS[id] || id;
}

function buildOutboundRows({
  selectedTrades,
  tradeRecipients,
  subcontractors,
  extraction,
  deadline,
  sharedDropboxUrl
}) {
  const sig = loadEmailSignature();
  const signatureFooter = formatSignatureFooter(sig);
  const rows = [];
  const dropboxLink = String(sharedDropboxUrl || "").trim();

  Array.from(selectedTrades).forEach((tradeId) => {
    const pool = subcontractorsForTrade(tradeId, subcontractors, 9999);
    const chosen = tradeRecipients[tradeId];
    const picks =
      Array.isArray(chosen) && chosen.length > 0
        ? pool.filter((s) => chosen.includes(s.id))
        : pool.filter((s) => s.email?.trim());

    picks.forEach((sub) => {
      if (!sub.email?.trim()) {
        rows.push({
          key: `${tradeId}:${sub.id}`,
          tradeId,
          subcontractor: sub,
          blocked: true,
          blockReason: "Missing email — update in Subcontractors."
        });
        return;
      }

      const contact = sub.contact?.trim?.() ? sub.contact : "";
      const note = extraction.trade_notes?.[tradeId] || emptyTradeNote();

      const composed = composeRfqEmail({
        contactName: contact,
        projectAddress: extraction.project_address,
        tradeId,
        tradeNote: note,
        dropboxLink,
        deadlineLabel: formatDeadlineDisplay(deadline),
        signatureFooter,
        logoDataUrl: sig.logoDataUrl
      });

      rows.push({
        key: `${tradeId}:${sub.id}`,
        tradeId,
        subcontractor: sub,
        blocked: false,
        to: sub.email.trim(),
        subject: composed.subject,
        subjectVariant: composed.subjectVariant,
        body: composed.body,
        html: composed.html,
        subcontractor_id: sub.id
      });
    });

    if (picks.length === 0) {
      rows.push({
        key: `${tradeId}:none`,
        tradeId,
        blocked: true,
        blockReason: "No contacts for this trade — add via Subcontractors.",
        subcontractor: null
      });
    }
  });

  return rows;
}

export default function RfqEngine() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefillDoneRef = useRef(false);
  const { project } = useProject();
  const skipNextAutoRebuildRef = useRef(false);
  /** After restoring saved email drafts, skip one rebuild when the subcontractor list finishes loading so drafts are not overwritten. */
  const suppressNextSubsRebuildRef = useRef(false);
  /** Incremented once after localStorage restore so the save effect never runs before hydrated state. */
  const [sessionStorageEpoch, setSessionStorageEpoch] = useState(0);
  const subcontractorsRef = useRef([]);
  const [activeStep, setActiveStep] = useState(1);
  /** @type {{ id: string, buffer: ArrayBuffer, name: string, size: number, type: string, docType: string, status: string, error: null|string }[]} */
  const [pdfItems, setPdfItems] = useState([]);
  /** Restored from IndexedDB after session load */
  const [pdfRestoreTask, setPdfRestoreTask] = useState(null);
  /** Legacy session: filenames only (no stored blobs) */
  const [legacyPdfQueueMeta, setLegacyPdfQueueMeta] = useState([]);
  const [extractBusy, setExtractBusy] = useState(false);
  const [extractMessageIndex, setExtractMessageIndex] = useState(0);
  /** `{ current, total }` while extracting (1-based current file). */
  const [extractProgress, setExtractProgress] = useState(null);
  const [sendBusy, setSendBusy] = useState(false);
  const [composeDropboxBusy, setComposeDropboxBusy] = useState(false);
  const [banner, setBanner] = useState(null);
  const [extraction, setExtraction] = useState(() => coerceExtraction(null));
  const [selectedTrades, setSelectedTrades] = useState(() => new Set());
  const [tradeRecipients, setTradeRecipients] = useState({});
  const [deadline, setDeadline] = useState("");
  const [sharedJobDropboxUrl, setSharedJobDropboxUrl] = useState("");
  const [subcontractors, setSubcontractors] = useState([]);
  const [subsLoadState, setSubsLoadState] = useState("idle");
  const [outbound, setOutbound] = useState([]);
  const [completionLog, setCompletionLog] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [rfqQC, setRfqQC] = useState({});
  const [rfqQCBusy, setRfqQCBusy] = useState({});
  const [rfqQCPanelKey, setRfqQCPanelKey] = useState(null);
  /** Draft job row created/updated when extraction completes (RFQs queued against it before send). */
  const [extractionJobId, setExtractionJobId] = useState("");
  const extractionJobIdRef = useRef("");
  /** Guards the building-facts prefill so it runs at most once per job. */
  const factsPrefillJobRef = useRef("");
  /** Merged trade plan (estimate baseline + AI enrichment). */
  const [tradePlan, setTradePlan] = useState([]);
  const [tradeIntelSummary, setTradeIntelSummary] = useState(null);
  const [tradeIntelBusy, setTradeIntelBusy] = useState(false);

  useEffect(() => {
    extractionJobIdRef.current = extractionJobId;
  }, [extractionJobId]);

  useEffect(() => {
    fetchAndHydrateTradeRegistry().catch((err) => console.warn("[trade-config]", err));
  }, []);

  useEffect(() => {
    if (!extractBusy) return;
    setExtractMessageIndex(0);
    const id = setInterval(() => {
      setExtractMessageIndex((i) => (i + 1) % EXTRACT_MESSAGES_ROTATE.length);
    }, 2500);
    return () => clearInterval(id);
  }, [extractBusy]);

  useEffect(() => {
    subcontractorsRef.current = subcontractors;
  }, [subcontractors]);

  useLayoutEffect(() => {
    void migrateLegacyRecords().catch((err) => console.warn("[rfq-pdf-migrate]", err));
    try {
      let raw = localStorage.getItem(RFQ_SESSION_STORAGE_KEY);
      let loadedFromLegacy = false;
      if (!raw) {
        for (const legacyKey of LEGACY_RFQ_SESSION_KEYS) {
          const leg = localStorage.getItem(legacyKey);
          if (leg) {
            raw = leg;
            loadedFromLegacy = true;
            break;
          }
        }
      }
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;

      if (typeof parsed.activeStep === "number") {
        setActiveStep(Math.min(4, Math.max(1, parsed.activeStep)));
      }

      if (parsed.extraction) {
        setExtraction(coerceExtraction(parsed.extraction));
      }

      if (Array.isArray(parsed.selectedTrades)) {
        const ids = parsed.selectedTrades
          .map(normalizeTradeIdForSession)
          .filter((slug) => RFQ_TRADE_ORDER.includes(slug));
        setSelectedTrades(new Set(ids));
      }

      if (parsed.tradeRecipients && typeof parsed.tradeRecipients === "object") {
        const next = {};
        for (const [k, v] of Object.entries(parsed.tradeRecipients)) {
          const nk = normalizeTradeIdForSession(k);
          if (!RFQ_TRADE_ORDER.includes(nk)) continue;
          next[nk] = Array.isArray(v) ? v : [];
        }
        setTradeRecipients(next);
      }

      if (typeof parsed.deadline === "string") setDeadline(parsed.deadline);
      if (typeof parsed.sharedJobDropboxUrl === "string") {
        setSharedJobDropboxUrl(parsed.sharedJobDropboxUrl);
      } else if (typeof parsed.dropboxLink === "string") {
        setSharedJobDropboxUrl(parsed.dropboxLink);
      }

      if (Array.isArray(parsed.pdfItemMeta) && parsed.pdfItemMeta.length) {
        const cleaned = parsed.pdfItemMeta
          .filter((m) => m && typeof m.id === "string" && typeof m.name === "string")
          .map((m) => ({
            id: m.id,
            name: m.name,
            size: typeof m.size === "number" ? m.size : 0,
            lastModified: typeof m.lastModified === "number" ? m.lastModified : 0,
            docType: typeof m.docType === "string" ? m.docType : "other"
          }));
        if (cleaned.length) setPdfRestoreTask(cleaned);
      } else if (Array.isArray(parsed.pdfQueueMeta) && parsed.pdfQueueMeta.length) {
        const cleaned = parsed.pdfQueueMeta
          .filter((m) => m && typeof m.name === "string")
          .map((m) => ({
            name: m.name,
            size: typeof m.size === "number" ? m.size : 0,
            lastModified: typeof m.lastModified === "number" ? m.lastModified : 0
          }));
        setLegacyPdfQueueMeta(cleaned);
      } else {
        setLegacyPdfQueueMeta([]);
      }
      setPdfItems([]);

      if (Array.isArray(parsed.outbound)) {
        setOutbound(parsed.outbound);
      }

      if (parsed.completionLog && typeof parsed.completionLog === "object") {
        setCompletionLog(parsed.completionLog);
      }

      if (Array.isArray(parsed.outbound) && parsed.outbound.length > 0) {
        skipNextAutoRebuildRef.current = true;
        suppressNextSubsRebuildRef.current = true;
      }

      if (typeof parsed.extractionJobId === "string" && parsed.extractionJobId) {
        setExtractionJobId(parsed.extractionJobId);
        extractionJobIdRef.current = parsed.extractionJobId;
      }

      if (loadedFromLegacy) {
        try {
          localStorage.setItem(RFQ_SESSION_STORAGE_KEY, JSON.stringify(parsed));
          for (const legacyKey of LEGACY_RFQ_SESSION_KEYS) {
            localStorage.removeItem(legacyKey);
          }
        } catch {
          /* ignore migration write */
        }
      }
    } catch (err) {
      console.warn("[rfq-session-restore]", err);
    } finally {
      setSessionStorageEpoch((n) => n + 1);
    }
  }, []);

  // Tender prefill — entered from a lead at the tender stage (?leadId=&jobId=).
  // Pulls the lead's knowledge and seeds the engine, filling EMPTY fields only so an
  // in-progress session is never clobbered. Runs once.
  useEffect(() => {
    if (prefillDoneRef.current) return;
    const leadId = searchParams.get("leadId");
    const jobId = searchParams.get("jobId");
    if (!leadId && !jobId) return;
    prefillDoneRef.current = true;
    const qs = new URLSearchParams();
    if (leadId) qs.set("leadId", leadId);
    if (jobId) qs.set("jobId", jobId);
    authFetch(`/api/tender/prefill?${qs.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        const p = j?.prefill;
        if (!p) return;
        setExtraction((prev) => ({
          ...prev,
          project_address: prev.project_address || p.projectAddress || "",
          project_type: prev.project_type || p.projectType || "",
          architect_name: prev.architect_name || p.architectClient || "",
          client_name: prev.client_name || p.clientName || "",
        }));
        if (p.jobId) {
          setExtractionJobId((cur) => cur || p.jobId);
          if (!extractionJobIdRef.current) extractionJobIdRef.current = p.jobId;
        }
        if (p.tenderDeadline) setDeadline((cur) => cur || p.tenderDeadline);
        if (p.dropboxUrl) setSharedJobDropboxUrl((cur) => cur || p.dropboxUrl);
        if (Array.isArray(p.suggestedTrades) && p.suggestedTrades.length) {
          const ids = p.suggestedTrades.filter((t) => RFQ_TRADE_ORDER.includes(t));
          setSelectedTrades((cur) => (cur && cur.size ? cur : new Set(ids)));
        }
        const who = [p.clientName, p.projectAddress].filter(Boolean).join(" — ");
        const extras = [
          p.documents?.length ? `${p.documents.length} lead document(s)` : null,
          p.buildexactLinked ? `Buildxact estimate linked (${p.estimateCategories.length} categories)` : null,
          p.estimatedValue ? `est. $${Number(p.estimatedValue).toLocaleString()}` : null,
        ].filter(Boolean).join(" · ");
        setBanner({
          variant: "success",
          title: `Pre-filled from lead${who ? `: ${who}` : ""}`,
          body: `${extras ? extras + ". " : ""}Address, type, client and suggested trades are filled in. Upload the tender PDF to extract detailed scope, then review and send your RFQs.`,
        });
      })
      .catch(() => {});
  }, [searchParams]);

  // Building-facts prefill — once a job is known, seed floor area / storeys /
  // building specs from the canonical project_metrics so they aren't re-keyed.
  // Fills EMPTY fields only (never clobbers what the user or PDF extraction set).
  useEffect(() => {
    const jid = extractionJobId;
    if (!jid || factsPrefillJobRef.current === jid) return;
    factsPrefillJobRef.current = jid;
    authFetch(`/api/cost-intelligence/jobs/${jid}/metrics`)
      .then((r) => r.json())
      .then((j) => {
        const m = j?.metrics;
        if (!j?.ok || !m) return;
        setExtraction((prev) => {
          const next = { ...prev };
          if ((next.storeys === "" || next.storeys == null) && m.storeys != null) {
            next.storeys = String(m.storeys);
          }
          if (next.floor_area_m2 == null && m.floor_area_m2 != null) {
            next.floor_area_m2 = Number(m.floor_area_m2);
          }
          // Merge a curated set of building specs, only for keys not already set.
          const specCandidates = {
            wall_type: m.wall_type,
            roof_type: m.roof_type,
            roof_complexity: m.roof_complexity,
            site_slope: m.site_slope,
            wet_areas: m.wet_areas,
          };
          const specs = { ...(next.building_specs || {}) };
          let added = false;
          for (const [k, v] of Object.entries(specCandidates)) {
            if (v == null || v === "") continue;
            if (specs[k] == null || specs[k] === "") { specs[k] = v; added = true; }
          }
          if (added) next.building_specs = specs;
          return next;
        });
      })
      .catch(() => {});
  }, [extractionJobId]);

  useEffect(() => {
    if (!pdfRestoreTask?.length) return;
    let cancelled = false;
    (async () => {
      let files = [];
      try {
        files = await getPdfs(RFQ_ENGINE_PDF_SCOPE);
      } catch (err) {
        console.warn("[rfq-pdf-restore]", err);
      }
      if (cancelled) return;
      // The localStorage meta and the IDB record were written together, so the
      // two arrays line up positionally. Truncate to the shorter of the two so
      // a partial save can't crash the queue.
      const len = Math.min(files.length, pdfRestoreTask.length);
      const loaded = [];
      for (let i = 0; i < len; i++) {
        const meta = pdfRestoreTask[i];
        const file = files[i];
        if (file instanceof File && file.size > 0) {
          try {
            const buffer = await file.arrayBuffer();
            loaded.push({
              id: meta.id,
              docType: meta.docType || "other",
              name: file.name,
              size: file.size,
              type: file.type || "application/pdf",
              buffer,
              status: "pending",
              error: null
            });
          } catch (readErr) {
            console.warn("[rfq-pdf-restore] buffer copy failed", meta?.name, readErr);
          }
        }
      }
      if (!cancelled) {
        setPdfItems(loaded);
        setPdfRestoreTask(null);
        setLegacyPdfQueueMeta([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfRestoreTask]);

  useEffect(() => {
    if (!supabaseConfigured) {
      setSubsLoadState("missing");
      return;
    }

    async function loadSubs() {
      setSubsLoadState("loading");
      const sb = getSupabase();
      try {
        const { data, error } = await sb
          .from("subcontractors")
          .select("*")
          .order("business_name", { ascending: true });
        if (error) throw error;
        const subs = data || [];
        for (const sub of subs) {
          const key = normalizeTradeKey(sub.trade);
          if (!key && sub.trade?.trim()) {
            registerAdHocTrade(
              sub.trade.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
              sub.trade
            );
          }
        }
        setSubcontractors(subs);
        setSubsLoadState("ready");
      } catch (err) {
        console.error("[subcontractors]", err);
        setBanner({
          variant: "error",
          title: "Could not load subcontractors",
          body: err?.message || String(err)
        });
        setSubsLoadState("error");
      }
    }

    loadSubs();
  }, []);

  // Pre-fill project address from global context when the extraction field is blank
  useEffect(() => {
    if (!project?.address) return;
    setExtraction((prev) => {
      if (prev.project_address) return prev;
      return { ...prev, project_address: project.address };
    });
  }, [project]);

  useEffect(() => {
    if (activeStep !== 3) return;
    setTradeRecipients((prev) => {
      const next = { ...prev };
      for (const tid of selectedTrades) {
        if (!(tid in next)) {
          const pool = subcontractorsForTrade(tid, subcontractors, 9999).filter((s) => s.email?.trim());
          next[tid] = pool.map((s) => s.id);
        }
      }
      for (const k of Object.keys(next)) {
        if (!selectedTrades.has(k)) delete next[k];
      }
      return next;
    });
  }, [activeStep, selectedTrades, subcontractors]);

  const toggleRecipient = (tradeId, subId) => {
    setTradeRecipients((prev) => {
      const cur = Array.isArray(prev[tradeId]) ? [...prev[tradeId]] : [];
      const i = cur.indexOf(subId);
      if (i >= 0) cur.splice(i, 1);
      else cur.push(subId);
      return { ...prev, [tradeId]: cur };
    });
    skipNextAutoRebuildRef.current = false;
  };

  const rebuildOutbound = useCallback((force = false) => {
    setOutbound((prev) => {
      const fresh = buildOutboundRows({
        selectedTrades,
        tradeRecipients,
        subcontractors: subcontractorsRef.current,
        extraction,
        deadline,
        sharedDropboxUrl: sharedJobDropboxUrl
      });
      // Auto-rebuilds (trade/recipient/deadline/contact changes) preserve edits; only the
      // explicit "Regenerate emails" button (force=true) wipes them.
      return force === true ? fresh : mergePreservingEdits(prev, fresh);
    });
  }, [selectedTrades, tradeRecipients, extraction, sharedJobDropboxUrl, deadline]);

  useEffect(() => {
    if (skipNextAutoRebuildRef.current) {
      skipNextAutoRebuildRef.current = false;
      return;
    }
    if (suppressNextSubsRebuildRef.current) {
      suppressNextSubsRebuildRef.current = false;
      return;
    }
    rebuildOutbound();
  }, [rebuildOutbound]);

  // IDB writes happen explicitly in each handler that mutates the file set
  // (handlePdfInput / removePdfItem / handleClearAllPdfs / resetRfqSession) so
  // that docType-only changes don't trigger redundant ArrayBuffer reads.

  useEffect(() => {
    if (sessionStorageEpoch === 0) return;
    try {
      const pdfItemMetaSnapshot =
        pdfItems.length > 0
          ? pdfItemsToSessionMeta(pdfItems)
          : pdfRestoreTask && pdfRestoreTask.length
            ? pdfRestoreTask
            : [];
      const snapshot = {
        version: 2,
        activeStep,
        extraction,
        selectedTrades: Array.from(selectedTrades),
        tradeRecipients,
        deadline,
        sharedJobDropboxUrl,
        dropboxLink: sharedJobDropboxUrl,
        pdfItemMeta: pdfItemMetaSnapshot,
        outbound,
        completionLog,
        extractionJobId
      };
      localStorage.setItem(RFQ_SESSION_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (err) {
      console.warn("[rfq-session-save]", err);
    }
  }, [
    sessionStorageEpoch,
    activeStep,
    extraction,
    selectedTrades,
    tradeRecipients,
    deadline,
    sharedJobDropboxUrl,
    pdfItems,
    pdfRestoreTask,
    outbound,
    completionLog,
    extractionJobId
  ]);

  const resetRfqSession = useCallback(() => {
    for (const key of [RFQ_SESSION_STORAGE_KEY, ...LEGACY_RFQ_SESSION_KEYS]) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
    setActiveStep(1);
    setPdfItems([]);
    setPdfRestoreTask(null);
    setLegacyPdfQueueMeta([]);
    setExtractBusy(false);
    setSendBusy(false);
    setComposeDropboxBusy(false);
    setBanner(null);
    setExtraction(coerceExtraction(null));
    setSelectedTrades(new Set());
    setTradeRecipients({});
    setDeadline("");
    setSharedJobDropboxUrl("");
    setOutbound([]);
    setCompletionLog(null);
    setExtractionJobId("");
    extractionJobIdRef.current = "";
    setTradePlan([]);
    setTradeIntelSummary(null);
    skipNextAutoRebuildRef.current = false;
    suppressNextSubsRebuildRef.current = false;
    void deletePdfs(RFQ_ENGINE_PDF_SCOPE).catch((err) =>
      console.warn("[rfq] failed to clear stored PDFs", err)
    );
  }, []);

  const confirmStartNewRfqJob = useCallback(() => {
    const ok = window.confirm("Start a new RFQ? This will clear the current session.");
    if (!ok) return;
    resetRfqSession();
  }, [resetRfqSession]);

  const toggleTrade = (slug) => {
    setSelectedTrades((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const removePdfItem = async (id) => {
    setBanner(null);
    const next = pdfItems.filter((x) => x.id !== id);
    const persistable = next.filter(pdfItemHasPersistableBytes);
    try {
      if (next.length === 0) {
        await deletePdfs(RFQ_ENGINE_PDF_SCOPE);
        setPdfItems([]);
        return;
      }
      if (!persistable.length) {
        await deletePdfs(RFQ_ENGINE_PDF_SCOPE);
        console.warn("[rfq] no persistable PDFs left — clearing queue");
        setPdfItems([]);
        return;
      }
      const written = await storePdfs(RFQ_ENGINE_PDF_SCOPE, persistable);
      if (written === 0) {
        console.warn("[rfq] storePdfs wrote 0 bytes — IndexedDB unchanged");
      }
      setPdfItems(persistable.length === next.length ? next : persistable);
    } catch (err) {
      console.warn("[rfq] failed to update stored PDFs", err);
    }
  };

  const setPdfItemDocType = (id, docType) => {
    setPdfItems((prev) => prev.map((x) => (x.id === id ? { ...x, docType } : x)));
  };

  const handlePdfInput = async (event) => {
    setBanner(null);
    setLegacyPdfQueueMeta([]);
    setPdfRestoreTask(null);
    const input = event.target;
    const list = Array.from(input.files || []);
    if (list.length === 0) {
      input.value = "";
      return;
    }

    // Read files sequentially — Dropbox Smart Sync online-only files need to download
    // one at a time; concurrent Promise.all triggers all downloads simultaneously and
    // most fail with a timeout or empty buffer.
    const readResults = [];
    const failedNames = [];
    for (const file of list) {
      try {
        const buffer = await file.arrayBuffer();
        const isPdf = (file.type || "").includes("pdf") || file.name.toLowerCase().endsWith(".pdf");
        readResults.push({
          id: crypto.randomUUID(),
          buffer,
          name: file.name,
          size: file.size,
          type: file.type || "application/octet-stream",
          docType: autoDetectDocTypeFromFileName(file.name),
          canExtract: isPdf,
          status: "pending",
          error: null
        });
      } catch (err) {
        console.error(`[rfq] Failed to read "${file.name}":`, err);
        failedNames.push(file.name);
      }
    }

    input.value = "";

    if (failedNames.length > 0) {
      setBanner({
        variant: "warning",
        title: `${failedNames.length} file${failedNames.length > 1 ? "s" : ""} could not be read`,
        body: `These files may be Dropbox online-only — open them in Dropbox to make them available offline, then re-add:\n${failedNames.join(", ")}`
      });
    }

    const validItems = readResults.filter(Boolean);
    if (!validItems.length) return;

    const next = [...pdfItems, ...validItems];
    if (!next.length) return;

    const persistable = next.filter(pdfItemHasPersistableBytes);
    if (!persistable.length) {
      console.warn("[rfq] nothing to persist — no rows with non-empty buffers or files");
      return;
    }

    try {
      const written = await storePdfs(RFQ_ENGINE_PDF_SCOPE, persistable);
      if (written === 0) {
        setBanner({
          variant: "error",
          title: "Could not save PDFs locally",
          body: "No valid PDF bytes could be stored."
        });
        return;
      }
    } catch (err) {
      console.error("[rfq] failed to persist PDF queue", err);
      setBanner({
        variant: "error",
        title: "Could not save PDFs locally",
        body: err?.message || String(err)
      });
      return;
    }
    setPdfItems(persistable.length === next.length ? next : persistable);
  };

  const handleClearAllPdfs = useCallback(async () => {
    if (pdfItems.length === 0 && !pdfRestoreTask?.length && legacyPdfQueueMeta.length === 0) {
      return;
    }
    const ok = window.confirm("Remove all queued PDFs?");
    if (!ok) return;
    setPdfItems([]);
    setPdfRestoreTask(null);
    setLegacyPdfQueueMeta([]);
    setBanner(null);
    try {
      await deletePdfs(RFQ_ENGINE_PDF_SCOPE);
    } catch (err) {
      console.warn("[rfq] failed to clear stored PDFs", err);
    }
  }, [pdfItems.length, pdfRestoreTask, legacyPdfQueueMeta.length]);

  const loadTradeIntelligence = useCallback(async (ext, jobId) => {
    setTradeIntelBusy(true);
    try {
      const json = await fetchMergedTradePlan({
        extraction: coerceExtraction(ext),
        job_id: jobId || extractionJobIdRef.current || undefined
      });
      if (json.extraction) setExtraction(coerceExtraction(json.extraction));
      const plan = json.merged_plan || [];
      setTradePlan(plan);
      setTradeIntelSummary(json.estimate_summary || null);
      setSelectedTrades(defaultSelectedTradeIds(plan));
      for (const row of plan) {
        if (row.trade_id) registerAdHocTrade(row.trade_id, row.trade_label);
      }
    } catch (err) {
      console.warn("[trade-intel]", err);
      setTradePlan([]);
      setTradeIntelSummary(null);
    } finally {
      setTradeIntelBusy(false);
    }
  }, []);

  const tradeIdsForUi =
    tradePlan.length > 0 ? tradePlan.map((t) => t.trade_id) : TRADE_ORDER;
  const tradeLabelUi = (tradeId) =>
    labelForTrade(tradeId, tradePlan, getTradeRegistry().labels) || resolveTradeLabel(tradeId);
  const tradePlanById = useMemo(
    () => new Map(tradePlan.map((t) => [t.trade_id, t])),
    [tradePlan]
  );

  const rfqReadiness = useMemo(() => {
    if (selectedTrades.size === 0) return null;
    return validateRfqReadiness({
      selectedTradeIds: [...selectedTrades],
      tradeRecipients,
      tradeNotes: extraction.trade_notes,
      tradeConfigById: getTradeRegistry().byId
    });
  }, [selectedTrades, tradeRecipients, extraction]);

  const persistJobFromExtraction = useCallback(
    async (extRaw) => {
      if (!supabaseConfigured) return;
      const ext = coerceExtraction(extRaw);
      const fields = buildJobFieldsFromExtraction(ext);
      const addr = String(fields.address || "").trim();
      try {
        const jid = extractionJobIdRef.current;
        if (jid) {
          // Existing extraction job — apply the latest extracted fields via the server,
          // which re-normalises the address and keeps address_normalised canonical.
          const { ok, error } = await apiPatch(`/api/jobs/${jid}`, fields);
          if (!ok) throw new Error(error || "Failed to update job");
        } else {
          // Create via the server so the address is normalised + deduped on address_normalised —
          // avoids duplicate jobs from formatting variants ("21 Folkestone Rd" vs "…Road") that
          // the old raw-ilike check missed. The server returns the existing job if one matches;
          // the "Address pending" placeholder is treated as a draft and never deduped.
          const { ok, data, error } = await apiPost("/api/jobs", {
            address: addr || "Address pending",
            client_name: fields.client_name || null,
            client_email: fields.client_email || null,
            client_phone: fields.client_phone || null,
            project_type: fields.project_type || null,
            arch_ref: fields.arch_ref || null,
          });
          const newId = data?.job?.id;
          if (!ok || !newId) throw new Error(error || "Failed to create job");
          extractionJobIdRef.current = newId;
          setExtractionJobId(newId);
          // Apply the remaining extracted fields to the new-or-matched job.
          const patchRes = await apiPatch(`/api/jobs/${newId}`, fields);
          if (!patchRes.ok) throw new Error(patchRes.error || "Failed to update job");
        }
        if (addr && addr !== "Address pending") {
          const jidNow = extractionJobIdRef.current;
          await mergeJobDataJsonRemote(addr, {
            ...fields,
            job_id: jidNow,
            source: "rfq_extraction",
            saved_at: new Date().toISOString()
          });
        }
      } catch (e) {
        console.warn("[rfq-job-sync]", e);
      }
    },
    []
  );

  const runExtract = async () => {
    setBanner(null);
    setCompletionLog(null);

    const extractableItems = pdfItems.filter((it) => it.canExtract !== false);
    if (pdfItems.length === 0 || extractableItems.length === 0) {
      setBanner({
        variant: "warning",
        title: "Add at least one PDF",
        body: "Upload at least one PDF (plans, specs, engineering pack) for scope extraction."
      });
      return;
    }

    setExtractMessageIndex(0);
    setExtractBusy(true);
    setExtractProgress(null);
    const allWarnings = [];

    try {
      let idbFiles = [];
      try {
        idbFiles = await getPdfs(RFQ_ENGINE_PDF_SCOPE);
      } catch (err) {
        console.warn("[rfq] getPdfs failed during extract", err);
      }

      const resolved = [];
      const missing = [];
      let totalBytes = 0;
      for (let i = 0; i < pdfItems.length; i++) {
        const it = pdfItems[i];
        // Only send PDFs to Claude for extraction — other file types are attachments only
        if (it.canExtract === false) continue;
        let file;
        try {
          file = await resolvePdfItemFile(it, RFQ_ENGINE_PDF_SCOPE, idbFiles);
        } catch (err) {
          console.warn(`[rfq] Could not resolve PDF "${it?.name}":`, err);
          missing.push(it?.name || it?.id || "(unknown)");
          continue;
        }
        const dataBase64 = await fileToBase64(file);
        if (!dataBase64 || !file.name) {
          missing.push(file.name || it?.name || it?.id || "(unknown)");
          continue;
        }
        totalBytes += file.size;
        resolved.push({ id: it.id, name: file.name, mimeType: "application/pdf", dataBase64, fileSize: file.size });
      }

      if (missing.length || resolved.length === 0) {
        setBanner({
          variant: "error",
          title: "Could not read some PDFs from local storage",
          body: missing.length
            ? `Re-add the following before retrying: ${missing.join(", ")}.`
            : "Re-add your PDFs and try again."
        });
        setExtractBusy(false);
        setExtractProgress(null);
        return;
      }

      const totalMb = totalBytes / (1024 * 1024);
      if (totalMb > 120) {
        setBanner({
          variant: "error",
          title: "Combined PDFs exceed safe upload limit",
          body: `Current selection ≈ ${totalMb.toFixed(1)} MB — remove or split files before retrying.`
        });
        setExtractBusy(false);
        setExtractProgress(null);
        return;
      }

      const MAX_SINGLE_EXTRACT_MB = 45;
      setPdfItems((prev) => prev.map((p) => ({ ...p, status: "pending", error: null })));

      const successes = [];
      const models = new Set();
      const total = resolved.length;
      setExtractProgress({ current: 0, total });

      for (let i = 0; i < resolved.length; i++) {
        const row = resolved[i];
        setExtractProgress({ current: i + 1, total });
        setPdfItems((prev) =>
          prev.map((p) => (p.id === row.id ? { ...p, status: "extracting", error: null } : p))
        );

        if (row.fileSize > MAX_SINGLE_EXTRACT_MB * 1024 * 1024) {
          const msg = `File exceeds ${MAX_SINGLE_EXTRACT_MB} MB client limit (${(row.fileSize / (1024 * 1024)).toFixed(1)} MB).`;
          setPdfItems((prev) =>
            prev.map((p) => (p.id === row.id ? { ...p, status: "error", error: msg } : p))
          );
          continue;
        }

        let res;
        try {
          res = await authFetch("/api/rfq/extract", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/x-ndjson"
            },
            body: JSON.stringify({
              files: [{ name: row.name, mimeType: row.mimeType, dataBase64: row.dataBase64 }]
            })
          });
        } catch (netErr) {
          const msg = netErr?.message || String(netErr);
          console.error("[extract]", row.name, netErr);
          setPdfItems((prev) =>
            prev.map((p) => (p.id === row.id ? { ...p, status: "error", error: msg } : p))
          );
          continue;
        }

        const parsed = await parseRfqExtractNdjsonResponse(res);
        for (const w of parsed.warnings || []) {
          if (!allWarnings.includes(w)) allWarnings.push(w);
        }

        if (!parsed.ok || !parsed.extraction) {
          const msg = parsed.error || "Extraction failed";
          console.error("[extract]", row.name, msg);
          setPdfItems((prev) =>
            prev.map((p) => (p.id === row.id ? { ...p, status: "error", error: msg } : p))
          );
          continue;
        }

        successes.push(parsed.extraction);
        if (parsed.model) models.add(parsed.model);
        setPdfItems((prev) =>
          prev.map((p) => (p.id === row.id ? { ...p, status: "done", error: null } : p))
        );
      }

      if (successes.length === 0) {
        setBanner({
          variant: "error",
          title: "Extraction failed",
          body: "No PDFs could be extracted. Check file sizes, format, and try again."
        });
        return;
      }

      const merged = mergeExtractions(successes);
      setExtraction(merged);
      await persistJobFromExtraction(merged);
      await loadTradeIntelligence(merged, extractionJobIdRef.current);

      const modelPart = models.size ? `${[...models].join(", ")} ` : "";
      const failedCount = resolved.length - successes.length;
      const warnBody =
        allWarnings.length > 0 ? ` ${allWarnings.join(" ")}` : "";
      if (failedCount > 0) {
        setBanner({
          variant: "warning",
          title: "Extraction partially complete",
          body: `${successes.length} of ${resolved.length} file(s) succeeded.${warnBody} Review merged facts; failed files are marked in the queue.`
        });
      } else {
        setBanner({
          variant: "success",
          title: "Extraction complete",
          body: `Model ${modelPart}processed ${successes.length} PDF(s) sequentially.${warnBody} Review before continuing.`
        });
      }
      setActiveStep(2);
    } catch (err) {
      console.error("[extract]", err);
      setBanner({
        variant: "error",
        title: "Extraction failed",
        body: err?.message || String(err)
      });
    } finally {
      setExtractBusy(false);
      setExtractProgress(null);
    }
  };

  const canContinueFromTrades =
    selectedTrades.size > 0 && Boolean(deadline) && subsLoadState !== "loading";

  const sendPayload = outbound.filter((row) => !row.blocked);

  async function persistRfqs(messages, dropboxMeta) {
    const sb = getSupabase();
    if (!sb) {
      throw new Error("Supabase client missing — configure VITE_SUPABASE_URL/_KEY.");
    }

    const exFields = buildJobFieldsFromExtraction(extraction);
    const sharedUrl = dropboxMeta?.dropboxSharedLinkUrl?.trim() || "";
    const internalPath =
      dropboxMeta?.privateRoot?.trim() ||
      (extraction.project_address ? jobProjectsInternalPath(extraction.project_address) : "");

    const jid = extractionJobIdRef.current;
    let job;
    if (jid) {
      const patch = { ...exFields };
      if (sharedUrl) {
        patch.dropbox_shared_link = sharedUrl;
        patch.dropbox_link = sharedUrl;
      }
      if (internalPath) patch.dropbox_internal_path = internalPath;
      const { data, error: jobErr } = await sb.from("jobs").update(patch).eq("id", jid).select("*").single();
      if (jobErr) throw jobErr;
      job = data;
    } else {
      const jobInsert = {
        ...exFields,
        dropbox_shared_link: sharedUrl,
        dropbox_internal_path: internalPath,
        dropbox_link: sharedUrl,
        status: "tendering"
      };
      const { data, error: jobErr } = await sb.from("jobs").insert(jobInsert).select("*").single();
      if (jobErr) throw jobErr;
      job = data;
      extractionJobIdRef.current = data.id;
      setExtractionJobId(data.id);
    }

    const rows = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const subj = String(msg.subject || "").trim();
      const bodyText = typeof msg.body === "string" ? msg.body : "";
      const email_body = `Subject: ${subj}\n\n${bodyText}`.trim();
      rows.push({
        job_id: job.id,
        subcontractor_id: msg.subcontractor_id,
        trade: resolveTradeLabel(msg.tradeId) || msg.tradeId,
        sent_at: null,
        deadline,
        status: "queued",
        quote_amount: null,
        quote_pdf_path: "",
        reminder_sent_at: null,
        email_body
      });
    }

    const { data: inserted, error: rfqErr } = await sb.from("rfqs").insert(rows).select("id");
    if (rfqErr) throw rfqErr;
    const rfqIds = (inserted || []).map((r) => r.id);

    const addr = String(job.address || "").trim();
    if (addr && addr !== "Address pending") {
      await mergeJobDataJsonRemote(addr, {
        ...exFields,
        job_id: job.id,
        phase: "pre_send",
        saved_at: new Date().toISOString()
      });
    }

    if (!dropboxMeta) {
      try {
        const trades = [...new Set(messages.map((m) => resolveTradeLabel(m.tradeId) || m.tradeId))];
        await authFetch("/api/dropbox/ensure-job-folders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobAddress: job.address, trades })
        });
      } catch {
        /* Dropbox optional — ignore network errors */
      }
    }

    return { job, count: rows.length, rfqIds };
  }

  async function prepareDropboxAndGoToCompose() {
    if (!canContinueFromTrades) return;
    setCompletionLog(null);
    setComposeDropboxBusy(true);
    setBanner(null);

    try {
      const addr = extraction.project_address?.trim();
      let dropboxUrl = sharedJobDropboxUrl.trim();

      if (addr) {
        try {
          const tradeLabels =
            selectedTrades.size > 0
              ? Array.from(selectedTrades).map((tid) => tradeLabelUi(tid))
              : tradeIdsForUi.map((tid) => tradeLabelUi(tid));
          const ensureRes = await authFetch("/api/dropbox/ensure-job-folders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobAddress: addr, trades: tradeLabels })
          });
          const ensureJson = await ensureRes.json().catch(() => null);
          if (!ensureRes.ok || !ensureJson?.ok) {
            const detail =
              typeof ensureJson?.error === "string" ? ensureJson.error : `Dropbox setup failed (${ensureRes.status})`;
            console.error("[dropbox] template copy / setup failed:", detail, ensureJson);
            setBanner({
              variant: "warning",
              title:
                "Dropbox folder could not be created automatically. Please create it manually from the template.",
              body: detail
            });
          } else {
            const url = ensureJson.dropboxSharedLinkUrl?.trim() || "";
            if (url) {
              dropboxUrl = url;
              setSharedJobDropboxUrl(url);
            }
            if (pdfItems.length > 0 && ensureRes.ok && ensureJson?.ok) {
              const hints = `${extraction.project_type || ""} ${extraction.key_project_notes || ""} ${JSON.stringify(extraction.building_specs || {})}`.slice(
                0,
                2000
              );
              let idbFilesForUpload = [];
              try {
                idbFilesForUpload = await getPdfs(RFQ_ENGINE_PDF_SCOPE);
              } catch (err) {
                console.warn("[dropbox upload] getPdfs failed", err);
              }
              for (let i = 0; i < pdfItems.length; i++) {
                const it = pdfItems[i];
                let fileForUpload;
                try {
                  fileForUpload = await resolvePdfItemFile(it, RFQ_ENGINE_PDF_SCOPE, idbFilesForUpload);
                } catch (err) {
                  console.warn("[dropbox upload] resolve failed", it?.id, it?.name, err);
                  continue;
                }
                if (!fileForUpload) {
                  console.warn("[dropbox upload] missing file blob for", it?.id, it?.name);
                  continue;
                }
                try {
                  const dataBase64 = await fileToBase64(fileForUpload);
                  if (!dataBase64) {
                    console.warn("[dropbox upload] empty base64 for", fileForUpload.name);
                    continue;
                  }
                  const upRes = await authFetch("/api/dropbox/upload-tender-document", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      jobAddress: addr,
                      fileName: fileForUpload.name,
                      dataBase64,
                      hints,
                      documentCategory: it.docType
                    })
                  });
                  const upJson = await upRes.json().catch(() => null);
                  if (!upRes.ok || !upJson?.ok) {
                    console.error("[dropbox upload]", fileForUpload.name, upJson);
                  }
                } catch (upErr) {
                  console.error("[dropbox upload]", fileForUpload?.name, upErr);
                }
              }
            }
          }
        } catch (err) {
          console.error("[dropbox] compose setup", err);
          setBanner({
            variant: "warning",
            title:
              "Dropbox folder could not be created automatically. Please create it manually from the template.",
            body: err?.message || String(err)
          });
        }
      }

      const finalUrl = dropboxUrl.trim();
      setOutbound((prev) =>
        mergePreservingEdits(
          prev,
          buildOutboundRows({
            selectedTrades,
            tradeRecipients,
            subcontractors: subcontractorsRef.current,
            extraction,
            deadline,
            sharedDropboxUrl: finalUrl
          })
        )
      );
      setActiveStep(4);
    } finally {
      setComposeDropboxBusy(false);
    }
  }

  const runRfqQC = async (key, subject, body) => {
    setRfqQCBusy(prev => ({ ...prev, [key]: true }));
    try {
      const text = `Subject: ${subject}\n\n${body}`;
      const result = await reviewDocument(text, 'rfq');
      setRfqQC(prev => ({ ...prev, [key]: result }));
      setRfqQCPanelKey(key);
    } catch (err) {
      setRfqQC(prev => ({ ...prev, [key]: { error: err.message } }));
    } finally {
      setRfqQCBusy(prev => ({ ...prev, [key]: false }));
    }
  };

  const applyRfqDraft = (rowKey, revisedDocument) => {
    const { subject, body } = parseRevisedEmailDraft(revisedDocument);
    setOutbound((prev) =>
      prev.map((row) => {
        if (row.key !== rowKey) return row;
        return {
          ...row,
          ...(subject ? { subject } : {}),
          body,
          edited: true
        };
      })
    );
    setBanner({
      variant: "success",
      title: "AI draft applied — review before sending.",
      body: ""
    });
  };

  const handleSend = async () => {
    setBanner(null);
    setCompletionLog(null);

    if (!deadline) {
      setBanner({ variant: "warning", title: "Pick a quote deadline first", body: "" });
      return;
    }

    const readyMessages = outbound.filter((row) => !row.blocked);
    const invalid = outbound.filter((row) => row.blocked);
    if (readyMessages.length === 0) {
      setBanner({
        variant: "error",
        title: "Nothing to send yet",
        body: invalid[0]?.blockReason || "Select trades with valid subcontractor contacts."
      });
      return;
    }

    if (!supabaseConfigured) {
      setBanner({
        variant: "error",
        title: "Supabase not configured",
        body: "Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY so RFQs can persist."
      });
      return;
    }

    setSendBusy(true);
    let persistence = null;
    const sb = getSupabase();
    try {
      const addr = extraction.project_address?.trim();
      if (!addr) {
        throw new Error("Set the project address before sending — it names the Dropbox job folder.");
      }

      let finalDropboxUrl = sharedJobDropboxUrl.trim();
      let ensureJson = null;
      if (!finalDropboxUrl) {
        try {
          const tradeLabels = [...new Set(readyMessages.map((row) => resolveTradeLabel(row.tradeId) || row.tradeId))];
          const ensureRes = await authFetch("/api/dropbox/ensure-job-folders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobAddress: addr, trades: tradeLabels })
          });
          ensureJson = await ensureRes.json().catch(() => null);
          if (ensureRes.ok && ensureJson?.ok && ensureJson.dropboxSharedLinkUrl?.trim()) {
            finalDropboxUrl = ensureJson.dropboxSharedLinkUrl.trim();
            setSharedJobDropboxUrl(finalDropboxUrl);
          } else {
            console.error("[dropbox send] optional setup failed:", ensureJson);
          }
        } catch (e) {
          console.error("[dropbox send]", e);
        }
      }

      if (!finalDropboxUrl) {
        setBanner({
          variant: "warning",
          title: "No Dropbox link in emails",
          body: "Dropbox was unavailable or not configured. RFQs will still send; add the tender folder link in the draft body if needed."
        });
      }

      // Send the user's EDITED drafts exactly as shown in the editor. Never re-compose from
      // scratch here — that silently discarded every manual edit (subject + body) the user made.
      // Regenerate the HTML part from the edited plain-text body so the HTML the server prefers
      // matches the edits (editing the body via the textarea does not touch row.html).
      const sigForSend = loadEmailSignature();
      const messages = readyMessages.map((row) => {
        const body = String(row.body || "");
        return {
          to: row.to,
          subject: String(row.subject || ""),
          subjectVariant: row.subjectVariant,
          body,
          html: body.trim() ? plainBodyToHtml(body, sigForSend.logoDataUrl) : row.html,
          tradeId: row.tradeId,
          subcontractor_id: row.subcontractor_id,
          businessName: row.subcontractor?.business_name?.trim() || "",
          tradeLabel: resolveTradeLabel(row.tradeId) || row.tradeId
        };
      });
      if (messages.length === 0) {
        throw new Error("No sendable messages — check recipients and project address.");
      }
      if (finalDropboxUrl && messages.some((m) => !m.body.includes(finalDropboxUrl))) {
        // Dropbox folder was (re)created at send time and a draft predates it — surface it
        // rather than silently sending a draft without the tender-documents link.
        setBanner({
          variant: "warning",
          title: "Some drafts may not contain the latest Dropbox link",
          body: "The tender folder link was created/updated after these drafts were composed. Re-check the drafts, or click Regenerate emails if you want them refreshed."
        });
      }

      const privateRootGuess = jobProjectsInternalPath(addr);
      persistence = await persistRfqs(messages, {
        dropboxSharedLinkUrl: finalDropboxUrl,
        privateRoot: ensureJson?.privateRoot?.trim() || privateRootGuess,
        sharedRoot: ensureJson?.sharedRoot?.trim() || ""
      });

      const messagesWithIds = messages.map((m, i) => ({
        ...m,
        jobId: persistence.job.id,
        rfqId: persistence.rfqIds[i]
      }));

      const res = await authFetch("/api/rfq/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: messagesWithIds })
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json) {
        const msg =
          typeof json?.error === "string" ? json.error : `Dispatch failed (${res.status})`;
        throw new Error(msg);
      }

      if (!json.mail_ready) {
        throw new Error(
          "Mail is not configured — add Gmail OAuth (GMAIL_*) or SMTP (SMTP_*) in `.env` and restart the API."
        );
      }

      if (!json.ok || json.partial) {
        const detail =
          typeof json.error === "string"
            ? json.error
            : json?.results?.filter((r) => !r.ok)?.[0]?.error || "Dispatch interrupted.";
        throw new Error(detail);
      }

      for (let i = 0; i < messages.length; i++) {
        const trade = resolveTradeLabel(messages[i].tradeId) || messages[i].tradeId;
        const subj = String(messages[i].subject || "").trim();
        const bodyText = typeof messages[i].body === "string" ? messages[i].body : "";
        const email_body = `Subject: ${subj}\n\n${bodyText}`.trim();
        const sentResult = json.results?.[i];
        const msgId = sentResult?.messageId ? String(sentResult.messageId).replace(/^<|>$/g, "") : null;

        // Update RFQ status + sent_message_id from the client — server-side update is
        // skipped when SUPABASE_SERVICE_ROLE_KEY isn't set. Without status="sent" the
        // IMAP reply matcher won't find the RFQ in its candidate query.
        const rfqId = messagesWithIds[i].rfqId;
        if (rfqId) {
          try {
            await sb.from("rfqs").update({
              status: "sent",
              sent_at: new Date().toISOString(),
              ...(msgId ? { sent_message_id: msgId } : {})
            }).eq("id", rfqId);
          } catch (rfqErr) {
            console.warn("[rfq-send] rfq status update", rfqErr?.message || rfqErr);
          }
        }

        // Log outbound correspondence from the client — server-side insert is skipped
        // when SUPABASE_SERVICE_ROLE_KEY isn't set and getServiceSupabase() returns null.
        try {
          await sb.from("correspondence").insert({
            job_id: persistence.job.id,
            rfq_id: rfqId || null,
            subcontractor_id: messages[i].subcontractor_id || null,
            direction: "outbound",
            subject: subj,
            body: bodyText,
            sent_at: new Date().toISOString(),
            message_id: msgId,
            logged_by: "rfq-send"
          });
        } catch (cErr) {
          console.warn("[rfq-send] correspondence insert", cErr?.message || cErr);
        }

        try {
          await authFetch("/api/dropbox/save-rfq-email-copy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jobAddress: persistence.job.address,
              trade,
              businessName: messages[i].businessName || "UNKNOWN",
              textBody: email_body
            })
          });
        } catch {
          /* optional */
        }
      }

      const sentCount = messages.length;
      const transport = json.transport || "mail";

      // Build RFQ package and navigate to it
      try {
        const tradeGroups = {};
        for (let i = 0; i < messages.length; i++) {
          const msg = messages[i];
          if (!tradeGroups[msg.tradeId]) {
            const note = extraction.trade_notes?.[msg.tradeId] || emptyTradeNote();
            const planRow = tradePlanById.get(msg.tradeId);
            const scopeFromPlan = planRow?.scope_bullets?.length ? planRow.scope_bullets : bulletsFromTradeNote(note);
            tradeGroups[msg.tradeId] = {
              trade_id: msg.tradeId,
              trade_label: tradeLabelUi(msg.tradeId),
              scope_bullets: scopeFromPlan,
              source: planRow?.source || "manual",
              ai_enrichment: planRow?.ai_enrichment || [],
              estimate_line_refs: planRow?.estimate_line_refs || [],
              due_date: deadline || "",
              recipients: []
            };
          }
          tradeGroups[msg.tradeId].recipients.push({
            subcontractor_id: msg.subcontractor_id || null,
            business_name: msg.businessName || msg.to,
            email: msg.to,
            status: "sent",
            sent_at: new Date().toISOString(),
            email_subject: String(msg.subject || ""),
            email_body: String(msg.body || ""),
            subject_variant: msg.subjectVariant || "",
            rfq_id: persistence.rfqIds[i] || null
          });
        }
        const pkgRes = await authFetch("/api/rfq-packages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            job_id: persistence.job.id,
            project_address: extraction.project_address || persistence.job.address || "",
            project_type: extraction.project_type || "",
            tender_deadline: deadline || "",
            architect_client: extraction.architect_name || extraction.client_name || "",
            dropbox_url: sharedJobDropboxUrl || "",
            extraction_data: extraction,
            pdf_meta: pdfItems.map((p) => ({ name: p.name, docType: p.docType })),
            trade_scopes: Object.values(tradeGroups)
          })
        });
        const pkgJson = await pkgRes.json().catch(() => null);
        resetRfqSession();
        if (pkgJson?.packageId) {
          navigate(`/tender-manager/rfq-packages/${pkgJson.packageId}`);
          return;
        }
      } catch (pkgErr) {
        console.warn("[rfq-package] create failed, continuing", pkgErr);
      }

      resetRfqSession();
      setBanner({
        variant: "success",
        title: "RFQs dispatched",
        body: `${sentCount} message(s) sent via ${transport} and logged in Supabase. Job ${persistence.job.id?.slice(0, 8) || ""}… — starting a fresh RFQ session.`
      });
    } catch (err) {
      console.error("[send]", err);
      if (sb && persistence?.rfqIds?.length) {
        try {
          await sb.from("rfqs").delete().in("id", persistence.rfqIds).eq("status", "queued");
        } catch (delErr) {
          console.warn("[send-cleanup]", delErr);
        }
      }
      setBanner({
        variant: "error",
        title: "Send failed",
        body: err?.message || String(err)
      });
    } finally {
      setSendBusy(false);
    }
  };

  const renderBanner = () => {
    if (!banner) return null;
    const palette = {
      error: "border-danger/40 bg-danger/10 text-ink",
      warning: "border-warning/60 bg-warning/15 text-ink",
      success: "border-success/40 bg-success/10 text-ink"
    };

    return (
      <div className={`mb-6 rounded-card border px-4 py-3 text-sm ${palette[banner.variant]}`}>
        <div className="font-semibold">{banner.title}</div>
        {banner.body ? <p className="mt-2 whitespace-pre-wrap text-muted">{banner.body}</p> : null}
      </div>
    );
  };

  const updateBuildingSpec = (key, value) => {
    setExtraction((prev) => ({
      ...prev,
      building_specs: { ...prev.building_specs, [key]: value }
    }));
  };

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Tender Manager · RFQ Engine</p>
            <h1 className="text-3xl font-semibold text-primary tracking-tight">RFQ Engine</h1>
            <p className="max-w-3xl text-sm text-muted">
              Upload tender PDFs, extract scope with Claude, choose recipients per trade, then send by email (SMTP) with your saved signature.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="rounded-lg border border-hairline bg-surface px-3 py-2 text-sm font-semibold text-primary shadow-sm hover:bg-page focus-visible:focus-ring"
              title="Email signature & settings"
            >
              ⚙ Settings
            </button>
            <button
              type="button"
              onClick={confirmStartNewRfqJob}
              className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-danger transition hover:bg-danger/10 focus-visible:focus-ring"
            >
              Clear / Start New Job
            </button>
          </div>
        </div>

        {!supabaseConfigured ? (
          <div className="rounded-lg border border-warning/70 bg-warning/10 px-4 py-3 text-sm text-ink">
            Supabase environment variables missing — subcontractors stay offline until configured.
          </div>
        ) : null}

        {subsLoadState === "missing" ? (
          <div className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-muted">
            Set <code>VITE_SUPABASE_URL</code> / <code>VITE_SUPABASE_ANON_KEY</code> to load contractors.
          </div>
        ) : null}

        <div className="mt-4 flex gap-3 overflow-x-auto pb-2 text-xs md:text-sm">
          {[
            { id: 1, label: "Upload PDFs" },
            { id: 2, label: "Review extraction" },
            { id: 3, label: "Recipients & packaging" },
            { id: 4, label: "Preview & send" }
          ].map((step, idx) => {
            const done = activeStep > step.id;
            const active = activeStep === step.id;
            return (
              <div
                key={step.id}
                className={`flex min-w-[8rem] flex-1 flex-col rounded-lg border px-3 py-2 ${
                  active
                    ? "border-accent bg-accent/10"
                    : done
                      ? "border-success/60 bg-success/5"
                      : "border-hairline bg-surface text-muted"
                }`}
              >
                <div className="text-[11px] font-semibold text-muted">{`Stage ${idx + 1}`}</div>
                <div className="font-semibold text-ink">{step.label}</div>
              </div>
            );
          })}
        </div>
      </header>

      {showSettings && (
        <RfqSettingsModal
          onClose={() => setShowSettings(false)}
          onApplied={() => {
            skipNextAutoRebuildRef.current = false;
            rebuildOutbound();
          }}
        />
      )}

      {renderBanner()}

      {activeStep === 1 ? (
        <section className="rounded-card border border-hairline bg-surface p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-xl space-y-2">
              <h2 className="text-xl font-semibold text-primary">1 · Upload tender PDFs</h2>
              <p className="text-sm text-muted">
                Select all tender documents — PDFs, DWGs, DOCXs, etc. PDFs are sent to Claude for scope extraction; all files are attached to RFQ emails.
                Files are stored in this browser so you can leave and return.
              </p>
              <label className="mt-6 inline-flex cursor-pointer items-center justify-center rounded-lg border border-primary bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#17324f] focus-within:focus-ring">
                Add tender documents
                <input
                  type="file"
                  accept=".pdf,.dwg,.dxf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                  multiple
                  className="sr-only"
                  onChange={handlePdfInput}
                  disabled={extractBusy}
                />
              </label>
            </div>
            <div className="w-full rounded-lg border border-hairline bg-page p-4 text-sm md:max-w-md">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Queue</div>
                <div className="flex items-center gap-3">
                  {pdfItems.length > 0 ? (
                    <div className="text-xs text-muted">
                      {pdfItems.length} file{pdfItems.length === 1 ? "" : "s"} ·{" "}
                      {(
                        pdfItems.reduce(
                          (a, it) =>
                            a +
                            (typeof it?.size === "number"
                              ? it.size
                              : typeof it?.file?.size === "number"
                                ? it.file.size
                                : 0),
                          0
                        ) /
                        (1024 * 1024)
                      ).toFixed(2)}{" "}
                      MB total
                    </div>
                  ) : null}
                  {pdfItems.length > 0 ||
                  legacyPdfQueueMeta.length > 0 ||
                  pdfRestoreTask?.length ? (
                    <button
                      type="button"
                      onClick={handleClearAllPdfs}
                      disabled={extractBusy}
                      className="rounded-md border border-hairline px-2 py-1 text-xs font-semibold text-muted hover:bg-page hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                      title="Remove all queued PDFs"
                    >
                      Clear all files
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {pdfItems.length === 0 && legacyPdfQueueMeta.length === 0 && !pdfRestoreTask ? (
                  <p className="text-muted">No files selected yet.</p>
                ) : pdfRestoreTask ? (
                  <p className="text-sm text-muted">Restoring PDFs from saved session…</p>
                ) : pdfItems.length === 0 && legacyPdfQueueMeta.length > 0 ? (
                  <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-ink">
                    <p className="font-semibold text-warning">Older session format</p>
                    <p className="text-muted">
                      This saved session predates stored PDFs. Re-add your PDFs below (filenames were kept for
                      reference).
                    </p>
                    <ul className="list-inside list-disc space-y-1 text-muted">
                      {legacyPdfQueueMeta.map((m) => (
                        <li key={`${m.name}-${m.lastModified}`}>
                          {m.name}
                          {m.size ? ` (${(m.size / (1024 * 1024)).toFixed(2)} MB)` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  pdfItems.map((it) => (
                    <div
                      key={it.id}
                      className="flex flex-col gap-2 rounded-lg border border-hairline bg-surface px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-2">
                        <span className="mt-0.5 shrink-0 text-lg" aria-hidden>
                          📄
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="truncate text-sm font-medium text-ink">{it.name || it.file?.name || "document"}</span>
                            {it.canExtract === false && (
                              <span className="shrink-0 rounded border border-muted/30 px-1 py-0.5 text-[10px] font-semibold uppercase text-muted">attachment only</span>
                            )}
                          </div>
                          <div className="text-xs text-muted">
                            {(
                              (typeof it.size === "number"
                                ? it.size
                                : typeof it.file?.size === "number"
                                  ? it.file.size
                                  : 0) /
                              (1024 * 1024)
                            ).toFixed(2)}{" "}
                            MB
                            {it.status === "done" ? (
                              <span className="ml-2 text-accent">· extracted</span>
                            ) : null}
                            {it.status === "error" ? (
                              <span className="ml-2 text-danger">· failed</span>
                            ) : null}
                          </div>
                          {it.status === "error" && it.error ? (
                            <div className="mt-1 text-xs text-danger">{it.error}</div>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        <label className="sr-only" htmlFor={`doc-type-${it.id}`}>
                          Document type for {it.name || it.file?.name || "document.pdf"}
                        </label>
                        <select
                          id={`doc-type-${it.id}`}
                          className="max-w-full rounded-lg border border-hairline bg-page px-2 py-1.5 text-xs text-ink"
                          value={it.docType}
                          onChange={(e) => setPdfItemDocType(it.id, e.target.value)}
                          disabled={extractBusy}
                        >
                          {RFQ_DOC_TYPES.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => removePdfItem(it.id)}
                          className="rounded-md border border-hairline px-2 py-1 text-sm font-semibold text-muted hover:bg-page hover:text-danger"
                          title="Remove"
                          disabled={extractBusy}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => runExtract()}
              disabled={extractBusy || pdfItems.length === 0}
              className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#25543d] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:focus-ring"
            >
              {extractBusy ? "Extracting…" : "Run Claude extraction"}
            </button>
            <button
              type="button"
              onClick={() => {
                setExtraction(coerceExtraction(null));
                setSelectedTrades(new Set());
                setTradeRecipients({});
                setCompletionLog(null);
                setBanner(null);
                setActiveStep(2);
              }}
              className="rounded-lg border border-hairline bg-surface px-4 py-2 text-sm font-semibold text-primary focus-visible:focus-ring"
            >
              Skip extraction (manual)
            </button>
          </div>

          {extractBusy ? (
            <div className="mt-6 rounded-lg border border-primary/30 bg-[#0f172a] px-5 py-4 font-mono text-sm text-slate-300">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-40" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-accent" />
                </span>
                <div>
                  {extractProgress ? (
                    <div className="font-semibold text-slate-200">
                      Extracting file {extractProgress.current} of {extractProgress.total}…
                    </div>
                  ) : (
                    <div>
                      Reading {pdfItems.length} document{pdfItems.length === 1 ? "" : "s"}…
                    </div>
                  )}
                  <div className="mt-1 text-slate-400">
                    {EXTRACT_MESSAGES_ROTATE[extractMessageIndex % EXTRACT_MESSAGES_ROTATE.length]}
                  </div>
                </div>
              </div>
              <div className="mt-3 text-[11px] text-slate-500">
                {extractProgress
                  ? `PDF ${extractProgress.current} / ${extractProgress.total}`
                  : `Step ${extractMessageIndex + 1} of ${EXTRACT_MESSAGES_ROTATE.length}`}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeStep === 2 && (
        <section className="space-y-6">
          {extraction.key_project_notes ? (
            <div className="rounded-card border border-accent/30 bg-accent/5 p-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-accent">Project summary (for RFQ intros)</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink">{extraction.key_project_notes}</p>
              <textarea
                className="mt-3 w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm"
                rows={3}
                value={extraction.key_project_notes}
                onChange={(e) => setExtraction((p) => ({ ...p, key_project_notes: e.target.value }))}
              />
            </div>
          ) : null}

          <div className="rounded-card border border-hairline bg-surface p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-primary">2 · Site &amp; building facts</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-ink">
                Project address
                <input
                  className="mt-2 w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm shadow-inner focus-visible:focus-ring"
                  value={extraction.project_address}
                  onChange={(e) => setExtraction((p) => ({ ...p, project_address: e.target.value }))}
                />
              </label>
              <label className="text-sm font-medium text-ink">
                Project type
                <input
                  className="mt-2 w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm shadow-inner focus-visible:focus-ring"
                  value={extraction.project_type}
                  onChange={(e) => setExtraction((p) => ({ ...p, project_type: e.target.value }))}
                />
              </label>
              <label className="text-sm font-medium text-ink">
                Storeys
                <input
                  className="mt-2 w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm shadow-inner focus-visible:focus-ring"
                  value={extraction.storeys}
                  onChange={(e) => setExtraction((p) => ({ ...p, storeys: e.target.value }))}
                />
              </label>
              <label className="text-sm font-medium text-ink">
                Floor area (m²)
                <input
                  type="number"
                  className="mt-2 w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm shadow-inner focus-visible:focus-ring"
                  value={extraction.floor_area_m2 ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setExtraction((p) => ({ ...p, floor_area_m2: v === "" ? null : Number(v) }));
                  }}
                />
              </label>
              <label className="text-sm font-medium text-ink">
                Site area (m²)
                <input
                  type="number"
                  className="mt-2 w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm shadow-inner focus-visible:focus-ring"
                  value={extraction.site_area_m2 ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setExtraction((p) => ({ ...p, site_area_m2: v === "" ? null : Number(v) }));
                  }}
                />
              </label>
            </div>
          </div>

          <div className="rounded-card border border-hairline bg-surface p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-primary">Building specs</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {Object.entries(extraction.building_specs || {}).map(([k, v]) => (
                <label key={k} className="text-xs font-semibold capitalize text-muted">
                  {k.replace(/_/g, " ")}
                  <textarea
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm font-normal text-ink"
                    value={v}
                    onChange={(e) => updateBuildingSpec(k, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </div>

          {extraction.coverage_gaps?.length ? (
            <div className="rounded-xl border border-warning/60 bg-warning/10 px-4 py-3 text-sm text-ink">
              <div className="font-semibold text-warning">Coverage gaps</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                {extraction.coverage_gaps.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {tradeIntelBusy ? (
            <p className="text-sm text-muted">Loading Buildxact estimate baseline and merging trades…</p>
          ) : null}
          {tradeIntelSummary?.quote_category_count > 0 ? (
            <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-ink">
              <span className="font-semibold text-primary">Estimate baseline:</span>{" "}
              {tradeIntelSummary.quote_category_count} quote-capable Buildxact categories merged with plan extraction.
              Trades from the estimate are pre-selected; AI only enriches scope.
            </div>
          ) : null}

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-primary">Trade scopes (estimate + documents)</h3>
            <div className="grid gap-4 md:grid-cols-2">
              {tradeIdsForUi.map((tradeId) => {
                const planRow = tradePlanById.get(tradeId);
                const note = extraction.trade_notes[tradeId] || emptyTradeNote();
                const bullets = planRow?.scope_bullets?.length
                  ? planRow.scope_bullets
                  : bulletsFromTradeNote(note);
                const hex = TRADE_BADGE_HEX[tradeId] || "#374151";
                return (
                  <div key={tradeId} className="rounded-card border border-hairline bg-surface p-4 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase text-white"
                        style={{ background: hex }}
                      >
                        {tradeLabelUi(tradeId)}
                      </span>
                      {planRow?.source ? (
                        <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${sourceBadgeClass(planRow.source)}`}>
                          {sourceBadgeLabel(planRow.source)}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-[10px] font-bold uppercase text-muted">Scope of works</p>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-ink">
                      {bullets.length ? (
                        bullets.map((b) => <li key={b}>{b}</li>)
                      ) : (
                        <li className="text-muted">No scope extracted — edit below.</li>
                      )}
                    </ul>
                    {note.assumptions?.length ? (
                      <>
                        <p className="mt-3 text-[10px] font-bold uppercase text-muted">Assumptions / site</p>
                        <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted">
                          {note.assumptions.map((a) => (
                            <li key={a}>{a}</li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                    {(note.missing_items?.length || note.missing_info) ? (
                      <div className="mt-3 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-xs text-ink">
                        <span className="font-bold text-warning">⚠ Missing information:</span>
                        <ul className="mt-1 list-disc pl-4">
                          {(note.missing_items?.length
                            ? note.missing_items
                            : note.missing_info.split(/[;]+/)
                          ).map((m) => (
                            <li key={m}>{m.trim()}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <label className="mt-3 block text-[10px] font-bold uppercase text-muted">Edit scope summary</label>
                    <textarea
                      rows={4}
                      className="mt-1 w-full rounded-lg border border-hairline bg-page px-3 py-2 text-xs font-mono leading-relaxed"
                      value={note.scope_summary}
                      onChange={(e) =>
                        setExtraction((prev) => ({
                          ...prev,
                          trade_notes: {
                            ...prev.trade_notes,
                            [tradeId]: { ...note, scope_summary: e.target.value }
                          }
                        }))
                      }
                    />
                    <label className="mt-2 block text-[10px] font-bold uppercase text-muted">Specific items (one per line)</label>
                    <textarea
                      rows={2}
                      className="mt-1 w-full rounded-lg border border-hairline bg-page px-3 py-2 text-xs"
                      value={(note.specific_items || []).join("\n")}
                      onChange={(e) =>
                        setExtraction((prev) => ({
                          ...prev,
                          trade_notes: {
                            ...prev.trade_notes,
                            [tradeId]: {
                              ...note,
                              specific_items: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean)
                            }
                          }
                        }))
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <button type="button" onClick={() => setActiveStep(1)} className="rounded-lg border border-hairline bg-surface px-4 py-2 text-sm font-semibold">
              ← Back
            </button>
            <button
              type="button"
              onClick={() => setActiveStep(3)}
              className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm"
            >
              Continue to recipients →
            </button>
          </div>
        </section>
      )}

      {activeStep === 3 && (
        <section className="rounded-card border border-hairline bg-surface p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-primary">3 · Recipients &amp; packaging</h2>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Select one or more subcontractors per trade. Signature and disclaimer come from Settings (gear).
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold text-ink">
              Quote deadline
              <input
                type="date"
                value={deadline}
                className="mt-2 w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm shadow-inner focus-visible:focus-ring"
                onChange={(e) => setDeadline(e.target.value)}
              />
            </label>
            <label className="text-sm font-semibold text-ink">
              Dropbox tender link (RFQ emails)
              <p className="mt-2 text-xs font-normal leading-relaxed text-muted">
                When you click <strong>Compose emails →</strong>, the app duplicates the Dropbox job template, creates a
                team shared link, uploads your Stage 1 PDFs into the right subfolders, and fills this field. You can
                edit or paste a link if Dropbox was unavailable.
              </p>
              <input
                type="url"
                className="mt-2 w-full rounded-lg border border-hairline bg-page px-3 py-2 font-mono text-[11px] text-ink shadow-inner focus-visible:focus-ring"
                value={sharedJobDropboxUrl}
                onChange={(e) => setSharedJobDropboxUrl(e.target.value)}
                placeholder="https://… (populated on compose from template)"
              />
            </label>
          </div>

          {rfqReadiness ? (
            <div
              className={`mt-6 rounded-xl border px-4 py-3 ${
                rfqReadiness.ready ? "border-green-200 bg-green-50" : "border-warning/50 bg-warning/10"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink">RFQ readiness</span>
                <span
                  className={`text-sm font-bold ${rfqReadiness.ready ? "text-green-700" : "text-amber-800"}`}
                >
                  {rfqReadiness.percent}%
                </span>
              </div>
              {!rfqReadiness.ready && rfqReadiness.trades?.length ? (
                <ul className="mt-2 space-y-1 text-xs text-ink">
                  {rfqReadiness.trades
                    .filter((t) => !t.ready)
                    .map((t) => (
                      <li key={t.trade_id}>
                        <strong>{t.trade_label}</strong>: {t.missing.join(", ")}
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-muted">All selected trades have scope, template, and recipients.</p>
              )}
            </div>
          ) : null}

          <div className="mt-8">
            <h3 className="text-sm font-bold text-primary">Trades to RFQ</h3>
            <p className="mt-1 text-xs text-muted">Tick each trade you are sending this round.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {tradeIdsForUi.map((tradeId) => {
                const planRow = tradePlanById.get(tradeId);
                return (
                <label
                  key={tradeId}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
                    selectedTrades.has(tradeId) ? "border-accent bg-accent/10 text-accent" : "border-hairline bg-surface"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedTrades.has(tradeId)}
                    onChange={() => toggleTrade(tradeId)}
                    className="rounded border-hairline text-accent focus:ring-accent"
                  />
                  {tradeLabelUi(tradeId)}
                  {planRow?.source?.includes("estimate") ? (
                    <span className="text-[9px] font-normal text-primary">(est.)</span>
                  ) : null}
                </label>
              );
              })}
            </div>
            {selectedTrades.size === 0 ? (
              <p className="mt-3 text-sm text-warning">Select at least one trade to choose recipients.</p>
            ) : null}
          </div>

          <div className="mt-10 space-y-8">
            {tradeIdsForUi.map((tradeId) => {
              if (!selectedTrades.has(tradeId)) return null;
              const pool = subcontractorsForTrade(tradeId, subcontractors, 9999);
              const selected = new Set(tradeRecipients[tradeId] || []);
              const withEmail = pool.filter((s) => s.email?.trim());

              return (
                <div key={tradeId} className="rounded-xl border border-hairline bg-page p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-bold text-primary">{tradeLabelUi(tradeId)}</span>
                    <span className="text-xs text-muted">Send to</span>
                  </div>
                  {withEmail.length === 0 ? (
                    <div className="mt-3 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-sm text-ink">
                      No contacts for this trade —{" "}
                      <Link to="/tender-manager/subcontractors" className="font-semibold text-primary underline">
                        add via Subcontractors
                      </Link>
                      .
                    </div>
                  ) : (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {withEmail.map((sub) => {
                        const on = selected.has(sub.id);
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => toggleRecipient(tradeId, sub.id)}
                            className={`rounded-lg border px-3 py-3 text-left text-sm transition ${
                              on ? "border-primary bg-primary text-white shadow-md" : "border-hairline bg-surface text-ink hover:border-primary/40"
                            }`}
                          >
                            <div className="font-bold">{sub.business_name}</div>
                            <div className={`mt-1 text-xs ${on ? "text-white/90" : "text-muted"}`}>
                              {[sub.contact, sub.email, sub.mobile].filter(Boolean).join(" · ")}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-8 flex flex-wrap gap-4">
            <button type="button" onClick={() => setActiveStep(2)} className="rounded-lg border border-hairline bg-surface px-4 py-2 text-sm font-semibold">
              ← Back
            </button>
            <button
              type="button"
              onClick={() => void prepareDropboxAndGoToCompose()}
              disabled={!canContinueFromTrades || composeDropboxBusy}
              className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              {composeDropboxBusy ? "Preparing Dropbox & drafts…" : "Compose emails →"}
            </button>
          </div>
        </section>
      )}

      {activeStep === 4 && (
        <section className="space-y-6">
          {completionLog ? (
            <div className="rounded-card border border-success/60 bg-success/10 p-6 text-sm text-ink">
              <div className="text-lg font-semibold text-success">{completionLog.headline}</div>
              <p className="mt-2">
                Linked job <span className="font-mono text-xs">{completionLog.jobId}</span> · {completionLog.address}
              </p>
              <p className="mt-1 text-muted">{completionLog.persisted} RFQ row(s) created.</p>
            </div>
          ) : null}

          <div className="rounded-card border border-hairline bg-surface p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-primary">4 · Review drafts &amp; dispatch</h2>
                <p className="mt-2 text-sm text-muted">Edit before send. Update signature under Settings if needed.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => setActiveStep(3)} className="rounded-lg border border-hairline bg-page px-4 py-2 text-sm font-semibold">
                  ← Recipients
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const hasDrafts = outbound.some((r) => !r.blocked);
                    if (
                      hasDrafts &&
                      !window.confirm(
                        "Regenerate all drafts from the current scope and the latest email template? This discards any manual edits you've made to the drafts below."
                      )
                    ) {
                      return;
                    }
                    skipNextAutoRebuildRef.current = false;
                    rebuildOutbound(true);
                  }}
                  disabled={completionLog || sendBusy}
                  className="rounded-lg border border-hairline bg-page px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                  title="Re-run the email composer on every draft using the current scope and template"
                >
                  ↻ Regenerate emails
                </button>
                <button
                  type="button"
                  onClick={() => handleSend()}
                  disabled={completionLog || sendBusy || sendPayload.length === 0 || !deadline.trim()}
                  className="rounded-lg bg-accent px-6 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {sendBusy ? "Sending…" : `Send ${sendPayload.length} RFQ emails`}
                </button>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {outbound.map((row) => (
                <div
                  key={row.key}
                  className={`rounded-xl border px-4 py-4 md:px-6 ${
                    row.blocked ? "border-danger/60 bg-danger/5" : "border-hairline bg-page"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    <span>{resolveTradeLabel(row.tradeId) || row.tradeId}</span>
                    {row.edited ? (
                      <span
                        className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal text-accent"
                        title="You've edited this draft. It auto-saves and will NOT be re-generated over when you change trades, recipients or contact details."
                      >
                        ✏️ Edited — saved
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 text-lg font-semibold text-primary">
                    {row.subcontractor?.business_name || row.blockReason || "—"}
                  </div>
                  {!row.blocked ? (
                    <>
                      <div className="mt-1 text-xs text-muted">
                        To: <span className="font-semibold text-ink">{row.to}</span>
                      </div>
                      <label className="mt-4 block text-xs font-semibold uppercase text-muted">Subject</label>
                      <input
                        className="mt-1 w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm"
                        value={row.subject}
                        onChange={(e) =>
                          setOutbound((prev) => updateRowBody(prev, row.key, "subject", e.target.value))
                        }
                      />
                      <label className="mt-3 block text-xs font-semibold uppercase text-muted">Body</label>
                      <textarea
                        rows={14}
                        className="mt-1 w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-xs font-mono leading-relaxed md:text-sm"
                        value={row.body}
                        onChange={(e) =>
                          setOutbound((prev) => updateRowBody(prev, row.key, "body", e.target.value))
                        }
                      />

                      {/* Blueprint QC */}
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          disabled={rfqQCBusy[row.key]}
                          onClick={() => runRfqQC(row.key, row.subject, row.body)}
                          className="rounded-lg border border-hairline bg-page px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-[#2E6B4F] hover:text-[#2E6B4F] disabled:opacity-40"
                        >
                          {rfqQCBusy[row.key] ? 'Checking…' : '🔍 Blueprint QC'}
                        </button>
                        {rfqQC[row.key] && !rfqQC[row.key].error && (
                          <QCBadge
                            score={rfqQC[row.key].score}
                            issueCount={rfqQC[row.key].issues?.length || 0}
                            highCount={rfqQC[row.key].issues?.filter(i => i.severity === 'HIGH').length || 0}
                            onClick={() => setRfqQCPanelKey((k) => (k === row.key ? null : row.key))}
                          />
                        )}
                        {rfqQC[row.key]?.error && (
                          <span className="text-xs text-red-600">QC error — {rfqQC[row.key].error}</span>
                        )}
                      </div>

                      {rfqQCPanelKey === row.key && rfqQC[row.key] && !rfqQC[row.key].error && (
                        <div className="mt-3 rounded-lg border border-hairline bg-page p-3">
                          <QCResultView
                            result={rfqQC[row.key]}
                            onUseDraft={(draft) => applyRfqDraft(row.key, draft)}
                          />
                        </div>
                      )}
                    </>
                  ) : row.blockReason?.includes("Subcontractors") ? (
                    <Link to="/tender-manager/subcontractors" className="mt-2 inline-block text-sm font-semibold text-primary underline">
                      Open Subcontractors
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
