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
 * user has manually EDITED or already SENT. Such rows win by key over the fresh row — even when
 * the fresh row came back blocked (subs still loading) or the fresh set dropped the row entirely
 * (a transient filter). A typed or sent draft must NEVER be silently lost. The single source of
 * truth for every non-force rebuild path; only an explicit force (Regenerate) bypasses it.
 */
function mergePreservingEdits(prevRows, freshRows) {
  const keepByKey = new Map(
    (Array.isArray(prevRows) ? prevRows : [])
      .filter((r) => r && r.blocked !== true && (r.edited || r.sent))
      .map((r) => [r.key, r])
  );
  if (keepByKey.size === 0) return Array.isArray(freshRows) ? freshRows : [];

  const seen = new Set();
  const merged = (Array.isArray(freshRows) ? freshRows : []).map((row) => {
    const kept = keepByKey.get(row.key);
    if (!kept) return row;
    seen.add(row.key);
    if (kept.sent) return kept; // a sent row is immutable — return it verbatim
    return {
      ...row,
      to: kept.to ?? row.to,
      subcontractor: kept.subcontractor ?? row.subcontractor,
      subcontractor_id: kept.subcontractor_id ?? row.subcontractor_id,
      subject: kept.subject,
      body: kept.body,
      html: kept.html,
      subjectVariant: kept.subjectVariant,
      blocked: false,
      edited: true
    };
  });

  // Re-append a kept row the fresh set dropped ONLY if it was already SENT (a sent email is
  // immutable). An edited-but-unsent row that the fresh set no longer contains means the user
  // genuinely deselected that trade/recipient — honour the removal and drop it; otherwise a
  // deselected trade's edited draft would be resurrected and emailed to that subcontractor.
  for (const [key, kept] of keepByKey) {
    if (!seen.has(key) && kept.sent) merged.push(kept);
  }
  return merged;
}

/**
 * Force-regenerate path (the explicit "Regenerate emails" button): manual edits ARE discarded,
 * but a row already SENT is immutable — its email has gone out, so it must never revert to an
 * unsent, editable draft. Keep sent rows by key, take fresh for everything else.
 */
function mergeKeepingSent(prevRows, freshRows) {
  const sentByKey = new Map(
    (Array.isArray(prevRows) ? prevRows : [])
      .filter((r) => r && r.sent)
      .map((r) => [r.key, r])
  );
  const fresh = Array.isArray(freshRows) ? freshRows : [];
  if (sentByKey.size === 0) return fresh;
  const seen = new Set();
  const merged = fresh.map((row) => {
    const kept = sentByKey.get(row.key);
    if (!kept) return row;
    seen.add(row.key);
    return kept; // sent row verbatim
  });
  for (const [key, kept] of sentByKey) {
    if (!seen.has(key)) merged.push(kept);
  }
  return merged;
}

/**
 * Shrink an outbound row before it goes into the localStorage session snapshot.
 * `html` is regenerated from `body` (plainBodyToHtml) at send time, and with a signature logo it
 * embeds a base64 data-URL PER ROW — on a 20+ trade job that alone blows the ~5MB localStorage
 * quota, which makes setItem throw and silently freezes the whole session at its last good save.
 * Transient send flags aren't persisted either (they're recomputed/sanitized on restore).
 */
function stripRowForPersist(r) {
  if (!r || typeof r !== "object") return r;
  const { html, sending, sendError, ...rest } = r;
  void html;
  void sending;
  void sendError;
  return rest;
}

/** Minimal subcontractor projection for the slim (quota-pressed) snapshot tier. */
function minimalSubForPersist(sub) {
  if (!sub || typeof sub !== "object") return sub;
  return { id: sub.id, business_name: sub.business_name, email: sub.email, contact: sub.contact };
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
  // Lead identity (name/email/phone/leadId) from /api/tender/prefill — stamped onto the job at
  // create/update time in persistRfqs so the RFQ-created 'tendering' job carries the client.
  const prefillLeadRef = useRef(null);
  const { project } = useProject();
  const skipNextAutoRebuildRef = useRef(false);
  /** After restoring saved email drafts, skip one rebuild when the subcontractor list finishes loading so drafts are not overwritten. */
  const suppressNextSubsRebuildRef = useRef(false);
  /** Incremented once after localStorage restore so the save effect never runs before hydrated state. */
  const [sessionStorageEpoch, setSessionStorageEpoch] = useState(0);
  const subcontractorsRef = useRef([]);
  /** Mirrors of state read inside rebuildOutbound / sendOneRow (which must not re-create on every change). */
  const activeStepRef = useRef(1);
  const outboundRef = useRef([]);
  /** Highest wizard step reached — persisted so restore lands the user back there regardless of
   *  whether the saved outbound snapshot was momentarily blocked/empty. */
  const highestStepRef = useRef(1);
  /** Cached job/Dropbox context so per-row sends create the folder + job row only once. */
  const jobContextRef = useRef(null);
  const jobContextPromiseRef = useRef(null);
  /** Serializes sends — only one persist+dispatch in flight at a time, so two quick per-row
   *  clicks can never each insert a job (duplicate-job race) before the first sets the job id. */
  const sendInFlightRef = useRef(false);
  /** True once at least one row has actually been sent this session — gates the all-sent package build. */
  const sendHappenedRef = useRef(false);
  /** Guards the all-sent package build so it fires exactly once. */
  const packageFinalizingRef = useRef(false);
  /** When true, auto-finalize is blocked until staff clicks Retry (W06-DRIFT-006). */
  const packageFinalizeFailedRef = useRef(false);
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
  const [packageFinalizeBusy, setPackageFinalizeBusy] = useState(false);
  /** Warning + retry when emails sent but POST /api/rfq-packages failed. */
  const [packageSnapshotFailed, setPackageSnapshotFailed] = useState(false);
  const [banner, setBanner] = useState(null);
  const [extraction, setExtraction] = useState(() => coerceExtraction(null));
  const [selectedTrades, setSelectedTrades] = useState(() => new Set());
  const [tradeRecipients, setTradeRecipients] = useState({});
  const [deadline, setDeadline] = useState("");
  const [sharedJobDropboxUrl, setSharedJobDropboxUrl] = useState("");
  const [subcontractors, setSubcontractors] = useState([]);
  const [subsLoadState, setSubsLoadState] = useState("idle");
  const [outbound, setOutbound] = useState([]);
  /** Attach plan PDFs to each RFQ email (for subbies who don't use Dropbox). */
  const [attachPlans, setAttachPlans] = useState(false);
  const [attachDocIds, setAttachDocIds] = useState(() => new Set());
  const planAttachmentsRef = useRef(null); // cached base64 attachments; cleared when the selection changes
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
  /** Set when entered with ?jobId=&resume= — rehydrate the whole session from the job's saved
   *  scope + RFQs once subcontractors have loaded, then jump to dispatch. */
  const [pendingResume, setPendingResume] = useState(null);
  const resumeAppliedRef = useRef(false);

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

      // Land the user back on the furthest step they reached, from an EXPLICIT persisted flag —
      // never inferred from outbound contents (a save that captured a momentarily blocked/empty
      // outbound must not bounce a returning step-4 user back to step 3).
      const restoredHasDrafts =
        Array.isArray(parsed.outbound) && parsed.outbound.some((r) => r && !r.blocked);
      const savedHighest = typeof parsed.highestStep === "number" ? parsed.highestStep : 0;
      const savedActive = typeof parsed.activeStep === "number" ? parsed.activeStep : 1;
      let landStep = Math.max(savedHighest, savedActive);
      if (restoredHasDrafts) landStep = Math.max(landStep, 4); // legacy v2 fallback
      // Never land on the dispatch step (4) with no drafts — the edit-lock blocks an auto-recompose
      // there, which would strand the user on an empty screen. Drop to recipients so Compose rebuilds.
      if (landStep >= 4 && !restoredHasDrafts) landStep = 3;
      landStep = Math.min(4, Math.max(1, landStep));
      setActiveStep(landStep);
      highestStepRef.current = landStep;

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
        // Sanitize transient per-send flags: a reload that happened mid-send must not restore a
        // row stuck on "Sending…" (its in-flight promise died with the old page). `sent`/`sentAt`/
        // `rfqId`/`edited` ARE kept — those are durable.
        const sanitizedOutbound = parsed.outbound.map((r) =>
          r && typeof r === "object" ? { ...r, sending: false, sendError: null } : r
        );
        setOutbound(sanitizedOutbound);
        // If the page was reloaded AFTER every row was sent but BEFORE the package finished
        // building, arm the all-sent effect so it completes the build + reset — otherwise the
        // session is stuck on a fully-sent screen with no way to finalize.
        const nonBlocked = sanitizedOutbound.filter((r) => r && !r.blocked);
        if (nonBlocked.length > 0 && nonBlocked.every((r) => r.sent)) {
          sendHappenedRef.current = true;
        }
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
        // Resume path (?resume=4 from the job's "Resume RFQ Engine" button): rehydrate the whole
        // session from the job's saved scope + RFQs rather than doing a shallow empty-field prefill.
        // Deferred to a dedicated effect so it can wait for the subcontractor list to load.
        const wantResume = searchParams.get("resume");
        if (wantResume && p.extractedData) {
          setPendingResume({
            extractedData: p.extractedData,
            existingRfqs: Array.isArray(p.existingRfqs) ? p.existingRfqs : [],
            jobId: p.jobId || jobId,
            deadline: p.tenderDeadline || "",
            dropboxUrl: p.dropboxUrl || "",
            landStep: wantResume === "3" ? 3 : 4,
          });
          return;
        }
        setExtraction((prev) => ({
          ...prev,
          project_address: prev.project_address || p.projectAddress || "",
          project_type: prev.project_type || p.projectType || "",
          architect_name: prev.architect_name || p.architectClient || "",
          client_name: prev.client_name || p.clientName || "",
        }));
        // Keep the lead's contact identity OUT of extraction (that's PDF scope) but available to
        // persistRfqs so the job carries client name/email/phone + lead_id. Otherwise it's discarded.
        prefillLeadRef.current = {
          leadId: leadId || p.leadId || null,
          clientName: p.clientName || "",
          clientEmail: p.clientEmail || "",
          clientPhone: p.clientPhone || "",
        };
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

  // Apply a DB-sourced resume once subcontractors are loaded: seed extraction, trades, recipients
  // and pre-built drafts, lock already-sent trades so they can never be re-emailed, then land on
  // the dispatch step. Mirrors the localStorage restore path but sources state from the job row.
  useEffect(() => {
    if (!pendingResume || resumeAppliedRef.current) return;
    if (subsLoadState !== "ready") return; // need the contact pool before building recipients/drafts
    resumeAppliedRef.current = true;

    const { extractedData, existingRfqs, jobId: rJobId, deadline: rDeadline, dropboxUrl, landStep } = pendingResume;
    const ext = coerceExtraction(extractedData);
    setExtraction(ext);
    if (rJobId) {
      setExtractionJobId(rJobId);
      extractionJobIdRef.current = rJobId;
    }

    // Map persisted RFQ trade labels back to canonical slugs.
    const labelToSlug = new Map(RFQ_TRADE_ORDER.map((slug) => [resolveTradeLabel(slug).toLowerCase(), slug]));
    const rfqSlug = (label) => {
      const s = String(label || "").toLowerCase().trim();
      return labelToSlug.get(s) || (RFQ_TRADE_ORDER.includes(s) ? s : null);
    };
    const rfqByTrade = new Map(); // slug -> [{ subId, sent }]
    for (const r of existingRfqs) {
      const slug = rfqSlug(r.trade);
      if (!slug) continue;
      if (!rfqByTrade.has(slug)) rfqByTrade.set(slug, []);
      rfqByTrade.get(slug).push({ subId: r.subcontractorId || null, sent: r.status === "sent" || !!r.sentAt });
    }

    // Trades to work: anything with scope in the saved extraction, plus anything already RFQ'd.
    const scoped = RFQ_TRADE_ORDER.filter((id) => bulletsFromTradeNote(ext.trade_notes?.[id]).length > 0);
    const trades = new Set([...scoped, ...rfqByTrade.keys()]);
    setSelectedTrades(new Set(trades));

    // Recipients: existing RFQ recipients first, then auto-suggested contacts with an email.
    const recips = {};
    for (const tid of trades) {
      const existing = (rfqByTrade.get(tid) || []).map((x) => x.subId).filter(Boolean);
      const pool = subcontractorsForTrade(tid, subcontractorsRef.current, 9999)
        .filter((sub) => sub.email?.trim())
        .map((sub) => sub.id);
      recips[tid] = [...new Set([...existing, ...pool])];
    }
    setTradeRecipients(recips);

    if (rDeadline) setDeadline((cur) => cur || rDeadline);
    if (dropboxUrl) setSharedJobDropboxUrl((cur) => cur || dropboxUrl);

    // Pre-build drafts now — the step-4 edit-lock blocks the auto-rebuild effect, so nothing else
    // will compose them. Then lock rows whose (trade, subcontractor) already has a sent RFQ.
    const fresh = buildOutboundRows({
      selectedTrades: trades,
      tradeRecipients: recips,
      subcontractors: subcontractorsRef.current,
      extraction: ext,
      deadline: rDeadline || "",
      sharedDropboxUrl: dropboxUrl || ""
    });
    const sentKeys = new Set();
    for (const [slug, list] of rfqByTrade) {
      for (const x of list) if (x.sent && x.subId) sentKeys.add(`${slug}:${x.subId}`);
    }
    const marked = fresh.map((row) =>
      sentKeys.has(row.key)
        ? { ...row, sent: true, sending: false, sendError: null, edited: true, sentAt: row.sentAt || new Date().toISOString() }
        : row
    );
    setOutbound(marked);

    // Land on the requested step, but never strand the user on an empty dispatch screen.
    const hasDraftable = marked.some((r) => !r.blocked && !r.sent);
    const land = landStep >= 4 && !hasDraftable ? 3 : landStep;
    setActiveStep(land);
    highestStepRef.current = Math.max(highestStepRef.current, land);
    // Stop the auto-rebuild + subs-load effects from overwriting the drafts we just built.
    skipNextAutoRebuildRef.current = true;
    suppressNextSubsRebuildRef.current = true;
    // Deliberately NOT setting sendHappenedRef — keeps the all-sent finalizer from firing on load.

    setBanner({
      variant: "success",
      title: "Resumed from saved tender data",
      body: hasDraftable
        ? `Loaded scope for ${trades.size} trade(s). Already-sent RFQs are locked — review the remaining drafts and send.`
        : "Every trade for this job has already been sent — nothing remaining to dispatch."
    });
    setPendingResume(null);
  }, [pendingResume, subsLoadState]);

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
    // EDIT-LOCK: once composed drafts exist on the dispatch step (4), ONLY the explicit
    // "Regenerate emails" button (force=true) may rewrite them. No dep change, async
    // subcontractor load, settings-apply, or remount may revert/reload a draft being edited.
    if (
      !force &&
      activeStepRef.current === 4 &&
      outboundRef.current.some((r) => r && !r.blocked)
    ) {
      return;
    }
    setOutbound((prev) => {
      const fresh = buildOutboundRows({
        selectedTrades,
        tradeRecipients,
        subcontractors: subcontractorsRef.current,
        extraction,
        deadline,
        sharedDropboxUrl: sharedJobDropboxUrl
      });
      // Auto-rebuilds (trade/recipient/deadline/contact changes) preserve edits AND sent rows;
      // the explicit "Regenerate emails" button (force=true) discards edits but still keeps any
      // already-sent row immutable.
      return force === true ? mergeKeepingSent(prev, fresh) : mergePreservingEdits(prev, fresh);
    });
  }, [selectedTrades, tradeRecipients, extraction, sharedJobDropboxUrl, deadline]);

  useEffect(() => {
    // EDIT-LOCK: step 4 is the dispatch step. Nothing automatic may regenerate drafts here.
    if (activeStep === 4) return;
    if (skipNextAutoRebuildRef.current) {
      skipNextAutoRebuildRef.current = false;
      return;
    }
    if (suppressNextSubsRebuildRef.current) {
      suppressNextSubsRebuildRef.current = false;
      return;
    }
    rebuildOutbound();
  }, [rebuildOutbound, activeStep]);

  // Keep the mirror refs in sync; highestStepRef only ever climbs (the persisted landing step).
  useEffect(() => {
    activeStepRef.current = activeStep;
    if (activeStep > highestStepRef.current) highestStepRef.current = activeStep;
  }, [activeStep]);

  useEffect(() => {
    outboundRef.current = outbound;
  }, [outbound]);

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
      const base = {
        version: 3,
        activeStep,
        highestStep: highestStepRef.current,
        extraction,
        selectedTrades: Array.from(selectedTrades),
        tradeRecipients,
        deadline,
        sharedJobDropboxUrl,
        dropboxLink: sharedJobDropboxUrl,
        pdfItemMeta: pdfItemMetaSnapshot,
        completionLog,
        extractionJobId
      };
      const slimOutbound = Array.isArray(outbound) ? outbound.map(stripRowForPersist) : [];

      const trySave = (snap) => {
        try {
          localStorage.setItem(RFQ_SESSION_STORAGE_KEY, JSON.stringify(snap));
          return true;
        } catch (err) {
          // QuotaExceededError (or any storage failure) — caller falls back to a slimmer payload.
          console.warn("[rfq-session-save] tier failed:", err?.name || err);
          return false;
        }
      };

      // Tier 1: full state, html stripped from rows. Tier 2: also minimise the subcontractor object
      // and drop pdf meta. Tier 3: keep the wizard state (step/trades/deadline) but drop the drafts —
      // they recompose on return; the user's step/trade/deadline edits must persist no matter what.
      if (trySave({ ...base, outbound: slimOutbound })) {
        // saved
      } else if (
        trySave({
          ...base,
          pdfItemMeta: [],
          outbound: slimOutbound.map((r) =>
            r && typeof r === "object" ? { ...r, subcontractor: minimalSubForPersist(r.subcontractor) } : r
          )
        })
      ) {
        // saved slim
      } else if (trySave({ ...base, pdfItemMeta: [], outbound: [] })) {
        // saved wizard-state only (drafts will recompose)
      } else {
        setBanner({
          variant: "warning",
          title: "This RFQ session is too large to auto-save",
          body: "Your latest changes might not be remembered if you leave this page. Send the RFQs from here without navigating away, or remove some attached PDFs."
        });
      }
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
    prefillLeadRef.current = null; // don't let a prior lead's identity contaminate the next job
    setTradePlan([]);
    setTradeIntelSummary(null);
    skipNextAutoRebuildRef.current = false;
    suppressNextSubsRebuildRef.current = false;
    highestStepRef.current = 1;
    jobContextRef.current = null;
    jobContextPromiseRef.current = null;
    sendInFlightRef.current = false;
    sendHappenedRef.current = false;
    packageFinalizingRef.current = false;
    packageFinalizeFailedRef.current = false;
    setPackageSnapshotFailed(false);
    setPackageFinalizeBusy(false);
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
      // Only auto-select on the FIRST extraction. A re-extract must NOT wipe a selection the
      // user has already curated.
      setSelectedTrades((prev) => (prev && prev.size > 0 ? prev : defaultSelectedTradeIds(plan)));
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
      const lead = prefillLeadRef.current || {};
      // Fill-when-blank: a tender PDF rarely carries the client/architect, and the builder returns ""
      // for those. Don't PATCH a blank over a name already on the job — it's stamped/healed from the
      // source lead in persistRfqs. (Mirrors the persistRfqs heal so neither path can wipe identity.)
      for (const k of ["client_name", "architect_name"]) {
        if (!String(fields[k] || "").trim()) delete fields[k];
      }
      const addr = String(fields.address || "").trim();
      const stampLeadJobLink = async (jobId) => {
        if (!jobId || !lead.leadId) return;
        const sb = getSupabase();
        if (!sb) return;
        const { data: jobRow } = await sb.from("jobs").select("lead_id").eq("id", jobId).maybeSingle();
        if (!jobRow?.lead_id) {
          await sb.from("jobs").update({ lead_id: lead.leadId }).eq("id", jobId);
        }
        await sb.from("leads").update({ job_id: jobId }).eq("id", lead.leadId).is("job_id", null);
      };
      try {
        const jid = extractionJobIdRef.current;
        if (jid) {
          // Existing extraction job — apply the latest extracted fields via the server,
          // which re-normalises the address and keeps address_normalised canonical.
          const { ok, error } = await apiPatch(`/api/jobs/${jid}`, fields);
          if (!ok) throw new Error(error || "Failed to update job");
          await stampLeadJobLink(jid);
        } else {
          // Create via the server so the address is normalised + deduped on address_normalised —
          // avoids duplicate jobs from formatting variants ("21 Folkestone Rd" vs "…Road") that
          // the old raw-ilike check missed. The server returns the existing job if one matches;
          // the "Address pending" placeholder is treated as a draft and never deduped.
          const { ok, data, error } = await apiPost("/api/jobs", {
            address: addr || "Address pending",
            client_name: fields.client_name || lead.clientName || null,
            client_email: lead.clientEmail || null,
            client_phone: lead.clientPhone || null,
            project_type: fields.project_type || null,
            arch_ref: fields.arch_ref || null,
            lead_id: lead.leadId || null,
          });
          const newId = data?.job?.id;
          if (!ok || !newId) throw new Error(error || "Failed to create job");
          extractionJobIdRef.current = newId;
          setExtractionJobId(newId);
          await stampLeadJobLink(newId);
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
  const unsentPayload = outbound.filter((row) => !row.blocked && !row.sent);
  /** True while any row is mid-send — disables every Send button so per-row sends stay serialized. */
  const anySending = outbound.some((row) => row && row.sending);

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
    const lead = prefillLeadRef.current || {};
    let job;
    if (jid) {
      const patch = { ...exFields };
      if (sharedUrl) {
        patch.dropbox_shared_link = sharedUrl;
        patch.dropbox_link = sharedUrl;
      }
      if (internalPath) patch.dropbox_internal_path = internalPath;
      // Identity heal, fill-when-blank: read the current row so a blank extraction never WIPES a
      // client_name (exFields.client_name is "" when unknown) and an admin-set name is never clobbered.
      const { data: existing } = await sb
        .from("jobs")
        .select("client_name,client_email,client_phone,lead_id")
        .eq("id", jid)
        .maybeSingle();
      if (!(patch.client_name || "").trim()) {
        delete patch.client_name; // don't overwrite with a blank extraction
        if (!(existing?.client_name || "").trim() && lead.clientName) patch.client_name = lead.clientName;
      }
      if (!(existing?.client_email || "").trim() && lead.clientEmail) patch.client_email = lead.clientEmail;
      if (!(existing?.client_phone || "").trim() && lead.clientPhone) patch.client_phone = lead.clientPhone;
      if (!existing?.lead_id && lead.leadId) patch.lead_id = lead.leadId;
      const { data, error: jobErr } = await sb.from("jobs").update(patch).eq("id", jid).select("*").single();
      if (jobErr) throw jobErr;
      job = data;
    } else {
      const addr = String(exFields.address || "").trim() || "Address pending";
      // Create via server spine — dedup + address_normalised (mirrors persistJobFromExtraction).
      const { ok, data, error } = await apiPost("/api/jobs", {
        address: addr,
        client_name: (exFields.client_name || "").trim() || lead.clientName || null,
        client_email: lead.clientEmail || null,
        client_phone: lead.clientPhone || null,
        project_type: exFields.project_type || null,
        arch_ref: exFields.arch_ref || null,
        lead_id: lead.leadId || null,
        status: "tendering",
      });
      const newId = data?.job?.id;
      if (!ok || !newId) throw new Error(error || "Failed to create job");
      extractionJobIdRef.current = newId;
      setExtractionJobId(newId);

      const patch = { ...exFields };
      for (const k of ["client_name", "architect_name"]) {
        if (!String(patch[k] || "").trim()) delete patch[k];
      }
      const patchRes = await apiPatch(`/api/jobs/${newId}`, patch);
      if (!patchRes.ok) throw new Error(patchRes.error || "Failed to update job");
      job = patchRes.data?.job || data.job;
      // Dropbox columns are not in JOB_PATCHABLE_FIELDS — stamp via client update (same as jid branch).
      if (sharedUrl || internalPath) {
        const dropboxPatch = {};
        if (sharedUrl) {
          dropboxPatch.dropbox_shared_link = sharedUrl;
          dropboxPatch.dropbox_link = sharedUrl;
        }
        if (internalPath) dropboxPatch.dropbox_internal_path = internalPath;
        const { data: refreshed, error: dbErr } = await sb
          .from("jobs")
          .update(dropboxPatch)
          .eq("id", newId)
          .select("*")
          .single();
        if (dbErr) throw dbErr;
        if (refreshed) job = refreshed;
      }
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
        if (row.sent) return row; // a sent row is immutable — never overwrite an emailed draft
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

  // Create the Dropbox job folder + cache it so every per-row send (and the batch) reuses the
  // same context. Single-flight via the promise ref so concurrent first sends share one ensure.
  const ensureJobContext = useCallback(async () => {
    // Cache on the context's existence, not on a truthy URL — when Dropbox returns no link the
    // first call still caches an empty-URL ctx so the remaining rows of a big batch don't each
    // re-POST ensure-job-folders.
    if (jobContextRef.current) return jobContextRef.current;
    if (jobContextPromiseRef.current) return jobContextPromiseRef.current;
    jobContextPromiseRef.current = (async () => {
      const addr = extraction.project_address?.trim();
      if (!addr) {
        throw new Error("Set the project address before sending — it names the Dropbox job folder.");
      }
      let finalDropboxUrl = sharedJobDropboxUrl.trim();
      let ensureJson = null;
      if (!finalDropboxUrl) {
        try {
          const tradeLabels = [
            ...new Set(
              outboundRef.current
                .filter((r) => r && !r.blocked)
                .map((row) => resolveTradeLabel(row.tradeId) || row.tradeId)
            )
          ];
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
      const ctx = {
        finalDropboxUrl,
        privateRoot: ensureJson?.privateRoot?.trim() || jobProjectsInternalPath(addr),
        sharedRoot: ensureJson?.sharedRoot?.trim() || ""
      };
      jobContextRef.current = ctx;
      return ctx;
    })();
    try {
      return await jobContextPromiseRef.current;
    } finally {
      jobContextPromiseRef.current = null;
    }
  }, [extraction, sharedJobDropboxUrl]);

  // Build the RFQ package + reset the session. Called from the all-sent effect (which guarantees
  // every non-blocked row is sent), so finishing the last row individually OR via the batch both
  // produce the package exactly once. Reads current `outbound` state, never the lagging ref.
  const finalizeAllSentPackage = useCallback(async () => {
    const rows = outbound.filter((r) => r && !r.blocked);
    if (rows.length === 0 || !rows.every((r) => r.sent)) {
      packageFinalizingRef.current = false; // defensive: condition no longer holds
      return;
    }
    setPackageFinalizeBusy(true);
    try {
      // Model B packages retired (mig 155): the sent RFQs ARE the source of truth (Model A `rfqs`,
      // written by /api/rfq/send). Finalize no longer snapshots a package — it just resets the
      // session and lands on the Tender Board for the job, where the quotes come back.
      packageFinalizeFailedRef.current = false;
      setPackageSnapshotFailed(false);
      const jobId = extractionJobIdRef.current;
      resetRfqSession();
      navigate(jobId ? `/tender-manager/board/${jobId}` : "/tender-manager/board");
    } finally {
      setPackageFinalizeBusy(false);
    }
  }, [outbound, resetRfqSession, navigate]);

  const retryPackageSnapshot = useCallback(() => {
    if (packageFinalizeBusy) return;
    packageFinalizeFailedRef.current = false;
    packageFinalizingRef.current = true;
    void finalizeAllSentPackage();
  }, [finalizeAllSentPackage, packageFinalizeBusy]);

  // Build the base64-encoded PDF attachments (selected plan documents) once per send batch.
  // Cached in planAttachmentsRef so a 20-recipient send doesn't re-read + re-encode the same
  // files 20×; the cache is cleared whenever the toggle or selection changes. Returns undefined
  // when nothing is selected so the dispatch payload simply omits `attachments`.
  const getPlanAttachments = useCallback(async () => {
    if (!attachPlans || attachDocIds.size === 0) return undefined;
    if (planAttachmentsRef.current) return planAttachmentsRef.current;
    const items = pdfItems.filter((it) => attachDocIds.has(it.id));
    if (items.length === 0) return undefined;
    const out = [];
    try {
      const stored = await getPdfs(RFQ_ENGINE_PDF_SCOPE);
      // Sequential — IndexedDB + base64 of large PDFs is CPU-heavy; don't Promise.all.
      for (const it of items) {
        let file = null;
        try {
          file = await resolvePdfItemFile(it, RFQ_ENGINE_PDF_SCOPE, stored);
        } catch (e) {
          console.warn("[rfq attach] missing file", it?.name, e?.message || e);
          continue;
        }
        if (!file) continue;
        const contentBase64 = await fileToBase64(file);
        if (!contentBase64) continue;
        out.push({
          filename: it.name || file.name || "document.pdf",
          contentBase64,
          mimeType: file.type || "application/pdf"
        });
      }
    } catch (e) {
      console.warn("[rfq attach]", e?.message || e);
    }
    planAttachmentsRef.current = out.length ? out : undefined;
    return planAttachmentsRef.current;
  }, [attachPlans, attachDocIds, pdfItems]);

  // Send ONE row. Reuses the exact persist + dispatch pipeline as the batch for a 1-element
  // messages array, and mutates ONLY this row's status — siblings are never rebuilt or reloaded.
  const sendOneRow = useCallback(async (rowKey) => {
    const row = outboundRef.current.find((r) => r && r.key === rowKey);
    if (!row || row.blocked || row.sent || row.sending) return { ok: false };
    if (sendInFlightRef.current) return { ok: false }; // serialize — never two persists at once
    if (!deadline) {
      setBanner({ variant: "warning", title: "Pick a quote deadline first", body: "" });
      return { ok: false };
    }
    if (!supabaseConfigured) {
      setBanner({
        variant: "error",
        title: "Supabase not configured",
        body: "Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY so RFQs can persist."
      });
      return { ok: false };
    }
    sendInFlightRef.current = true;
    setOutbound((prev) => prev.map((r) => (r.key === rowKey ? { ...r, sending: true, sendError: null } : r)));
    const sb = getSupabase();
    let persistence = null;
    try {
      const ctx = await ensureJobContext();
      const finalDropboxUrl = ctx.finalDropboxUrl;
      const sigForSend = loadEmailSignature();
      let body = String(row.body || "");
      // The composer leaves a literal "[add Dropbox link]" placeholder when no folder URL existed
      // at compose time. If a real URL is now available, inject it; otherwise warn rather than ship
      // a broken documentation link silently (restores a guard the old batch handleSend had).
      if (body.includes("[add Dropbox link]")) {
        if (finalDropboxUrl) {
          body = body.split("[add Dropbox link]").join(finalDropboxUrl);
        } else {
          setBanner({
            variant: "warning",
            title: "No Dropbox link in this RFQ",
            body: "Dropbox was unavailable, so this draft still has a placeholder where the tender-documents link should be. Add the link to the body (or set up Dropbox) before sending if the subcontractor needs the documents."
          });
        }
      }
      const message = {
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
      persistence = await persistRfqs([message], {
        dropboxSharedLinkUrl: finalDropboxUrl,
        privateRoot: ctx.privateRoot,
        sharedRoot: ctx.sharedRoot
      });
      const rfqId = persistence.rfqIds[0];
      const attachments = await getPlanAttachments();
      const res = await authFetch("/api/rfq/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ ...message, jobId: persistence.job.id, rfqId, ...(attachments ? { attachments } : {}) }]
        })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) {
        throw new Error(typeof json?.error === "string" ? json.error : `Dispatch failed (${res.status})`);
      }
      if (!json.mail_ready) {
        throw new Error("Mail is not configured — add Gmail OAuth (GMAIL_*) or SMTP (SMTP_*) in `.env` and restart the API.");
      }
      if (!json.ok || json.partial) {
        const detail =
          typeof json.error === "string"
            ? json.error
            : json?.results?.filter((r) => !r.ok)?.[0]?.error || "Dispatch interrupted.";
        throw new Error(detail);
      }
      const sentResult = json.results?.[0];
      const subj = String(message.subject || "").trim();
      const bodyText = String(message.body || "");
      if (sentResult?.skipped) {
        // Server found this (job, subcontractor) was ALREADY sent — no email went out this attempt.
        // The queued rfq we just inserted is a redundant duplicate: delete it and do NOT log
        // correspondence again. Mark the row sent so the UI reflects reality (it WAS emailed before).
        if (rfqId) {
          try {
            await sb.from("rfqs").delete().eq("id", rfqId).eq("status", "queued");
          } catch (e) {
            console.warn("[rfq-send-one] skip-cleanup", e?.message || e);
          }
        }
        sendHappenedRef.current = true;
        setOutbound((prev) =>
          prev.map((r) =>
            r.key === rowKey
              ? { ...r, sent: true, sending: false, sendError: null, edited: true, sentAt: new Date().toISOString(), rfqId: null }
              : r
          )
        );
        setBanner({
          variant: "success",
          title: `Already sent to ${row.subcontractor?.business_name || row.to}`,
          body: ""
        });
        return { ok: true };
      }
      const msgId = sentResult?.messageId ? String(sentResult.messageId).replace(/^<|>$/g, "") : null;
      if (rfqId) {
        try {
          await sb.from("rfqs").update({
            status: "sent",
            sent_at: new Date().toISOString(),
            ...(msgId ? { sent_message_id: msgId } : {})
          }).eq("id", rfqId);
        } catch (e) {
          console.warn("[rfq-send-one] status", e?.message || e);
        }
      }
      if (!sentResult?.serverLogged) {
        try {
          await sb.from("correspondence").insert({
            job_id: persistence.job.id,
            rfq_id: rfqId || null,
            subcontractor_id: message.subcontractor_id || null,
            direction: "outbound",
            subject: subj,
            body: bodyText,
            sent_at: new Date().toISOString(),
            message_id: msgId,
            logged_by: "rfq-send"
          });
        } catch (e) {
          console.warn("[rfq-send-one] correspondence", e?.message || e);
        }
      }
      try {
        await authFetch("/api/dropbox/save-rfq-email-copy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobAddress: persistence.job.address,
            trade: message.tradeLabel,
            businessName: message.businessName || "UNKNOWN",
            textBody: `Subject: ${subj}\n\n${bodyText}`.trim()
          })
        });
      } catch {
        /* optional */
      }
      sendHappenedRef.current = true;
      setOutbound((prev) =>
        prev.map((r) =>
          r.key === rowKey
            ? { ...r, sent: true, sending: false, sendError: null, edited: true, sentAt: new Date().toISOString(), rfqId }
            : r
        )
      );
      setBanner({
        variant: "success",
        title: `Sent to ${row.subcontractor?.business_name || row.to}`,
        body: ""
      });
      return { ok: true };
    } catch (err) {
      console.error("[send-one]", err);
      // Roll back the queued RFQ this attempt created so failed retries don't accumulate orphans.
      if (sb && persistence?.rfqIds?.length) {
        try {
          await sb.from("rfqs").delete().in("id", persistence.rfqIds).eq("status", "queued");
        } catch (delErr) {
          console.warn("[send-one-cleanup]", delErr);
        }
      }
      setOutbound((prev) => prev.map((r) => (r.key === rowKey ? { ...r, sending: false, sendError: err?.message || String(err) } : r)));
      setBanner({
        variant: "error",
        title: `Send failed for ${row.subcontractor?.business_name || row.to}`,
        body: err?.message || String(err)
      });
      return { ok: false };
    } finally {
      sendInFlightRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persistRfqs is stable; adding it would re-create send on every render
  }, [deadline, supabaseConfigured, ensureJobContext, getPlanAttachments]);

  // When every non-blocked row is sent (after a real send), build the package + reset — exactly
  // once. Reads `outbound` state so it is immune to the mirror-ref's render-lag.
  useEffect(() => {
    if (!sendHappenedRef.current) return;
    if (packageFinalizingRef.current) return;
    if (packageFinalizeFailedRef.current) return;
    if (sendInFlightRef.current) return;
    const rows = outbound.filter((r) => r && !r.blocked);
    if (rows.length === 0 || !rows.every((r) => r.sent)) return;
    packageFinalizingRef.current = true;
    void finalizeAllSentPackage();
  }, [outbound, finalizeAllSentPackage]);

  const handleSend = async () => {
    setBanner(null);
    setCompletionLog(null);
    if (!deadline) {
      setBanner({ variant: "warning", title: "Pick a quote deadline first", body: "" });
      return;
    }
    const rows = outbound.filter((row) => !row.blocked && !row.sent);
    if (rows.length === 0) {
      setBanner({
        variant: "error",
        title: "Nothing to send yet",
        body: "Select trades with valid subcontractor contacts, or all drafts are already sent."
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
    try {
      let okCount = 0;
      // Sequential — matches the server transport and the project's no-Promise.all convention.
      // The all-sent effect builds the package + resets once every row has gone.
      for (const row of rows) {
        const r = await sendOneRow(row.key);
        if (r?.ok) okCount += 1;
      }
      if (okCount === 0) {
        setBanner({
          variant: "error",
          title: "No RFQs were sent",
          body: "Every attempt failed — check the error shown on each draft and try again."
        });
      }
    } finally {
      setSendBusy(false);
    }
  };

  const renderBanner = () => {
    if (!banner && !packageSnapshotFailed) return null;
    const palette = {
      error: "border-danger/40 bg-danger/10 text-ink",
      warning: "border-warning/60 bg-warning/15 text-ink",
      success: "border-success/40 bg-success/10 text-ink"
    };
    const variant = banner?.variant || "warning";

    return (
      <div className={`mb-6 rounded-card border px-4 py-3 text-sm ${palette[variant]}`}>
        <div className="font-semibold">{banner?.title || "RFQs sent — package snapshot failed"}</div>
        {banner?.body ? <p className="mt-2 whitespace-pre-wrap text-muted">{banner.body}</p> : null}
        {packageSnapshotFailed ? (
          <button
            type="button"
            onClick={retryPackageSnapshot}
            disabled={packageFinalizeBusy}
            className="mt-3 rounded-lg border border-warning bg-surface px-4 py-2 text-sm font-semibold text-primary shadow-sm hover:bg-page focus-visible:focus-ring disabled:opacity-60"
          >
            {packageFinalizeBusy ? "Creating package…" : "Retry package creation"}
          </button>
        ) : null}
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
            { id: 3, label: "Recipients & send" },
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
                const hasWork =
                  selectedTrades.size > 0 ||
                  outbound.some((r) => r && r.edited) ||
                  Object.values(extraction?.trade_notes || {}).some(
                    (n) => n && ((n.scope_summary || "").trim() || (n.specific_items || []).length)
                  );
                if (
                  hasWork &&
                  !window.confirm(
                    "Skip extraction and start manual entry?\n\nThis clears the current extracted scope, your trade selection and recipients — and any drafts you've edited will be lost. Continue?"
                  )
                ) {
                  return;
                }
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
          <h2 className="text-xl font-semibold text-primary">3 · Recipients &amp; send</h2>
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
                  disabled={completionLog || sendBusy || anySending}
                  className="rounded-lg border border-hairline bg-page px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                  title="Re-run the email composer on every draft using the current scope and template"
                >
                  ↻ Regenerate emails
                </button>
                <button
                  type="button"
                  onClick={() => handleSend()}
                  disabled={completionLog || sendBusy || anySending || unsentPayload.length === 0 || !deadline.trim()}
                  className="rounded-lg bg-accent px-6 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {sendBusy
                    ? "Sending…"
                    : unsentPayload.length === 0
                      ? "All RFQs sent"
                      : unsentPayload.length < sendPayload.length
                        ? `Send remaining ${unsentPayload.length}`
                        : `Send ${unsentPayload.length} RFQ email${unsentPayload.length === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>

            {pdfItems.length > 0 ? (
              <div className="mt-6 rounded-xl border border-hairline bg-page p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={attachPlans}
                    onChange={(e) => {
                      const on = e.target.checked;
                      planAttachmentsRef.current = null;
                      setAttachPlans(on);
                      // First time on, default to attaching every uploaded plan PDF.
                      if (on && attachDocIds.size === 0) {
                        setAttachDocIds(new Set(pdfItems.map((it) => it.id)));
                      }
                    }}
                    className="mt-0.5 rounded border-hairline text-accent focus:ring-accent"
                  />
                  <span>
                    <span className="text-sm font-bold text-primary">Attach plans to each email</span>
                    <span className="mt-1 block text-xs text-muted">
                      Sends the selected PDFs as attachments so subbies who don&apos;t use Dropbox can open the plans
                      directly. The Dropbox link is still included. Keep the total under ~22&nbsp;MB.
                    </span>
                  </span>
                </label>

                {attachPlans ? (
                  <>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {pdfItems.map((it) => {
                        const on = attachDocIds.has(it.id);
                        const mb = (it.size || 0) / (1024 * 1024);
                        return (
                          <label
                            key={it.id}
                            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                              on ? "border-accent bg-accent/10" : "border-hairline bg-surface"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => {
                                planAttachmentsRef.current = null;
                                setAttachDocIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(it.id)) next.delete(it.id);
                                  else next.add(it.id);
                                  return next;
                                });
                              }}
                              className="rounded border-hairline text-accent focus:ring-accent"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-semibold text-ink">{it.name}</span>
                              <span className="text-[10px] uppercase tracking-wide text-muted">
                                {(it.docType || "other").replace(/_/g, " ")} · {mb < 0.1 ? "<0.1" : mb.toFixed(1)} MB
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    {(() => {
                      const bytes = pdfItems
                        .filter((it) => attachDocIds.has(it.id))
                        .reduce((s, it) => s + (it.size || 0), 0);
                      const mb = bytes / (1024 * 1024);
                      const over = mb > 22;
                      return (
                        <p className={`mt-3 text-xs font-semibold ${over ? "text-danger" : "text-muted"}`}>
                          {attachDocIds.size} file{attachDocIds.size === 1 ? "" : "s"} selected · {mb.toFixed(1)} MB
                          {over ? " — over the 22 MB limit; deselect some files or rely on the Dropbox link." : ""}
                        </p>
                      );
                    })()}
                  </>
                ) : null}
              </div>
            ) : null}

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
                        disabled={row.sent}
                        className="mt-1 w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-page disabled:opacity-60"
                        value={row.subject}
                        onChange={(e) =>
                          setOutbound((prev) => updateRowBody(prev, row.key, "subject", e.target.value))
                        }
                      />
                      <label className="mt-3 block text-xs font-semibold uppercase text-muted">Body</label>
                      <textarea
                        rows={14}
                        disabled={row.sent}
                        className="mt-1 w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-xs font-mono leading-relaxed md:text-sm disabled:cursor-not-allowed disabled:bg-page disabled:opacity-60"
                        value={row.body}
                        onChange={(e) =>
                          setOutbound((prev) => updateRowBody(prev, row.key, "body", e.target.value))
                        }
                      />

                      {/* Blueprint QC */}
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          disabled={rfqQCBusy[row.key] || row.sent}
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

                      <div className="mt-4 flex items-center justify-end gap-3 border-t border-hairline pt-3">
                        {row.sendError ? <span className="text-xs text-danger">{row.sendError}</span> : null}
                        {row.sent ? (
                          <span className="text-xs font-semibold text-success" title={row.sentAt || ""}>
                            ✓ Sent
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={row.sending || sendBusy || anySending || !deadline.trim()}
                            onClick={() => void sendOneRow(row.key)}
                            className="rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {row.sending ? "Sending…" : "Send this RFQ"}
                          </button>
                        )}
                      </div>
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
