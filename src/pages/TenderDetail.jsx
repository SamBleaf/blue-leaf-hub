import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getSupabase, supabaseConfigured } from "../lib/supabaseClient";
import { formatSignatureFooter, loadEmailSignature } from "../lib/rfqSettings.js";
import { plainBodyToHtml } from "../lib/rfqComposer.js";
import { sharedJobDropboxRootPath } from "../lib/companySettings.js";
import { useBlueprintContext } from "../lib/BlueprintContext.jsx";
import { TRADE_LABEL } from "../lib/tradeTemplates.js";
import { bulletsFromTradeNote, coerceExtraction, RFQ_TRADE_ORDER } from "../lib/rfqExtraction.js";

const JOB_STATUS_BADGE = {
  tendering: { label: "Tendering", cls: "bg-[#FEF3C7] text-[#92400E]" },
  won: { label: "Won", cls: "bg-[#DCFCE7] text-[#166534]" },
  lost: { label: "Lost", cls: "bg-[#FEE2E2] text-[#991B1B]" },
  archived: { label: "Archived", cls: "bg-[#F1F5F9] text-[#475569]" }
};

const RFQ_STATUS_VIS = {
  queued: { label: "Queued", cls: "bg-zinc-200 text-zinc-800" },
  sent: { label: "Sent", cls: "bg-blue-100 text-blue-900" },
  reminded: { label: "Reminded", cls: "bg-amber-100 text-amber-900" },
  received: { label: "Received", cls: "bg-emerald-100 text-emerald-900" },
  accepted: { label: "Accepted", cls: "bg-emerald-900/90 text-white" },
  declined: { label: "Declined", cls: "bg-zinc-300 text-zinc-800" },
  not_required: { label: "Not required", cls: "bg-slate-200 text-slate-700" }
};

function isOverdue(deadline, status) {
  if (!deadline || ["received", "accepted", "declined", "not_required"].includes(status)) return false;
  const d = new Date(`${deadline}T00:00:00`);
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return d < t && ["sent", "reminded"].includes(status);
}

function deadlineLabel(deadline, status) {
  if (!deadline) return "—";
  const d = new Date(`${deadline}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((d - today) / (24 * 60 * 60 * 1000));
  if (isOverdue(deadline, status)) return <span className="font-semibold text-danger">{Math.abs(diff)} days overdue</span>;
  if (diff === 0) return "Due today";
  return `${diff} day(s) remaining`;
}

function CorrespondenceBlock({ rfq, rows, readOnly, onLog }) {
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState("");
  return (
    <div className="mt-4 border-t border-hairline pt-3">
      <button type="button" className="text-xs font-bold uppercase tracking-wide text-primary" onClick={() => setOpen(!open)}>
        Correspondence {open ? "▼" : "▶"}
      </button>
      {open ? (
        <div className="mt-2 space-y-2 text-xs">
          {rows.length === 0 ? <p className="text-muted">No logged messages yet.</p> : null}
          {rows.map((c) => {
            const atts = Array.isArray(c.attachments) ? c.attachments : [];
            return (
              <div key={c.id} className="rounded border border-hairline bg-page p-2">
                <div className="font-semibold text-ink">{c.subject}</div>
                <div className="text-muted">{new Date(c.sent_at).toLocaleString("en-AU")}</div>
                <pre className="mt-1 whitespace-pre-wrap font-sans text-[11px] text-ink">{c.body}</pre>
                {atts.length > 0 ? (
                  <div className="mt-2 border-t border-hairline pt-2">
                    <div className="font-semibold text-muted">Attachments</div>
                    <ul className="mt-1 list-inside list-disc space-y-1 text-[11px]">
                      {atts.map((a, i) => (
                        <li key={`${c.id}-att-${i}`}>
                          {a?.url && String(a.url).startsWith("http") ? (
                            <a href={a.url} target="_blank" rel="noreferrer" className="font-semibold text-accent underline">
                              {a.filename || "PDF"}
                            </a>
                          ) : (
                            <span>{a?.filename || "file"}</span>
                          )}
                          {typeof a?.size === "number" ? ` · ${(a.size / 1024).toFixed(1)} KB` : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            );
          })}
          {!readOnly ? (
            <div className="rounded border border-dashed border-hairline p-2">
              <div className="font-semibold text-ink">Log reply</div>
              <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} className="mt-1 w-full rounded border border-hairline p-1 text-sm" />
              <button
                type="button"
                className="mt-1 rounded bg-primary px-2 py-1 text-xs font-semibold text-white"
                onClick={() => {
                  if (!reply.trim()) return;
                  onLog(rfq.id, reply.trim());
                  setReply("");
                }}
              >
                Save
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function TenderDetail() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { setScreenContext } = useBlueprintContext() || {};
  const [searchParams, setSearchParams] = useSearchParams();
  const jobTab = searchParams.get("tab") || "tender";
  const [job, setJob] = useState(null);
  const [rfqs, setRfqs] = useState([]);
  const [corr, setCorr] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scopePanelOpen, setScopePanelOpen] = useState(false);
  const [expandedScopes, setExpandedScopes] = useState({});
  const [queryRfq, setQueryRfq] = useState(null);
  const [queryBody, setQueryBody] = useState("");
  const [queryBusy, setQueryBusy] = useState(false);
  const [winMessage, setWinMessage] = useState("");
  const [winOpen, setWinOpen] = useState(false);
  const [winStep, setWinStep] = useState(1);
  const [winRows, setWinRows] = useState([]);
  const [winCostIntel, setWinCostIntel] = useState({
    floor_area_m2: "",
    storeys: "",
    roof_area_m2: "",
    wall_area_m2: "",
    tile_area_floor_m2: "",
    tile_area_wall_m2: "",
    solar_system_kw: "",
    wet_areas: "",
    notes: ""
  });
  const [emailPreviews, setEmailPreviews] = useState([]);
  const [loseOpen, setLoseOpen] = useState(false);
  const [losePreviews, setLosePreviews] = useState([]);
  const [feeProposals, setFeeProposals] = useState([]);
  const [reextractBusy, setReextractBusy] = useState({});

  const readOnly = job?.status === "archived";

  const load = useCallback(async () => {
    if (!supabaseConfigured) {
      setError("Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see Settings / Tender Manager).");
      return;
    }
    if (!jobId) {
      setError("Missing tender ID.");
      return;
    }
    const sb = getSupabase();
    const { data: j, error: jErr } = await sb
      .from("jobs")
      .select(`*, rfqs ( *, subcontractors ( id, business_name, contact, email, mobile ) )`)
      .eq("id", jobId)
      .single();
    if (jErr) {
      setError(jErr.message);
      return;
    }
    setJob(j);
    setRfqs((j.rfqs || []).slice().sort((a, b) => String(a.trade).localeCompare(String(b.trade))));
    const { data: c } = await sb.from("correspondence").select("*").eq("job_id", jobId).order("sent_at", { ascending: false });
    setCorr(c || []);
    setError("");
    setScreenContext?.({
      page: "tender-detail",
      jobId: j.id,
      jobAddress: j.address || "",
      jobStatus: j.status || "",
      trades: (j.rfqs || []).map((r) => r.trade).filter(Boolean),
      clientName: j.client_name || "",
      archRef: j.arch_ref || "",
      engRef: j.eng_ref || ""
    });
  }, [jobId, setScreenContext]);

  useEffect(() => {
    load();
  }, [load]);

  const scanInbox = useCallback(async () => {
    setScanBusy(true);
    setScanResult(null);
    try {
      const res = await fetch("/api/imap/quote-poll", { method: "POST" });
      const json = await res.json();
      const matched = json.matched ?? 0;
      setScanResult(matched > 0 ? `${matched} new reply${matched > 1 ? "s" : ""} found` : "No new replies");
      if (matched > 0) load();
    } catch {
      setScanResult("Scan failed — check server logs");
    } finally {
      setScanBusy(false);
    }
  }, [load]);

  useEffect(() => {
    if (!job?.id || jobTab !== "fee-proposal") return;
    let stop = false;
    (async () => {
      const sb = getSupabase();
      const { data, error: fe } = await sb
        .from("fee_proposals")
        .select("id,status,quote_number,updated_at")
        .eq("job_id", job.id)
        .order("updated_at", { ascending: false });
      if (!stop && !fe) setFeeProposals(data || []);
      else if (!stop && fe) setFeeProposals([]);
    })();
    return () => {
      stop = true;
    };
  }, [job?.id, jobTab]);

  const dropboxUrl = useMemo(
    () => String(job?.dropbox_shared_link || job?.dropbox_link || "").trim(),
    [job]
  );

  const sigFooter = useMemo(() => formatSignatureFooter(loadEmailSignature()), []);

  function buildWinRowsFromRfqs(list) {
    return list.map((r) => ({
      id: r.id,
      trade: r.trade,
      sub: r.subcontractors,
      quote_pdf_path: r.quote_pdf_path || "",
      status:
        r.status === "received" || r.status === "accepted"
          ? "accepted"
          : r.status === "declined"
            ? "declined"
            : "declined",
      quote_amount: r.quote_amount ?? "",
      received: r.status === "received" || r.status === "accepted"
    }));
  }

  async function archiveJob() {
    if (!job || readOnly) return;
    if (!window.confirm("Archive this tender? It becomes read-only.")) return;
    const sb = getSupabase();
    setBusy(true);
    try {
      const { error: u } = await sb.from("jobs").update({ status: "archived" }).eq("id", job.id);
      if (u) throw new Error(u.message);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function updateRfq(id, patch) {
    if (readOnly) return;
    const sb = getSupabase();
    const { error: u } = await sb.from("rfqs").update(patch).eq("id", id);
    if (u) setError(u.message);
    else await load();
  }

  async function reextractAmount(rfqId) {
    setReextractBusy((p) => ({ ...p, [rfqId]: true }));
    try {
      const res = await fetch(`/api/rfq/${rfqId}/reextract-amount`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Re-extraction failed.");
      } else {
        await load();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setReextractBusy((p) => ({ ...p, [rfqId]: false }));
    }
  }

  async function logReply(rfqId, body) {
    const sb = getSupabase();
    const r = rfqs.find((x) => x.id === rfqId);
    const { error: ins } = await sb.from("correspondence").insert({
      job_id: jobId,
      rfq_id: rfqId,
      subcontractor_id: r?.subcontractor_id || null,
      direction: "inbound",
      subject: "Logged reply",
      body,
      logged_by: "sam"
    });
    if (ins) setError(ins.message);
    else await load();
  }

  function openWin() {
    setWinRows(buildWinRowsFromRfqs(rfqs));
    setWinCostIntel({
      floor_area_m2:
        job?.floor_area_m2 != null
          ? String(job.floor_area_m2)
          : job?.slab_area_m2 != null
            ? String(job.slab_area_m2)
            : "",
      storeys: job?.storeys != null ? String(job.storeys) : "",
      roof_area_m2: job?.roof_area_m2 != null ? String(job.roof_area_m2) : "",
      wall_area_m2: "",
      tile_area_floor_m2: "",
      tile_area_wall_m2: "",
      solar_system_kw: "",
      wet_areas: "",
      notes: ""
    });
    setWinStep(1);
    setWinOpen(true);
  }

  function selectAllReceived() {
    setWinRows((rows) => rows.map((row) => (row.received ? { ...row, status: "accepted" } : row)));
  }

  function winStep1Valid() {
    return winRows.every((w) => ["accepted", "declined", "not_required"].includes(w.status));
  }

  function buildEmailPreviewsAndGoStep3() {
    const addr = job?.address || "";
    const previews = [];
    const sig = loadEmailSignature();
    const logo = String(sig.logoDataUrl || "").trim();
    for (const w of winRows) {
      const sub = w.sub;
      const name = (sub?.contact || "there").trim();
      const trade = w.trade || "works";
      if (w.status === "accepted") {
        const body = `Hi ${name},\n\nGreat news — we've been awarded the project at ${addr} and we'd love to proceed with your quote for the ${trade} package.\n\nWe'll be in touch shortly with a formal Purchase Order along with a tentative commencement date for the project. Please note you'll be advised of specific dates closer to the start.\n\nReally looking forward to working together on this one.\n\n${sigFooter}`;
        previews.push({
          kind: "accepted",
          rfq_id: w.id,
          subcontractor_id: sub?.id,
          to: sub?.email,
          trade,
          businessName: sub?.business_name,
          subject: `Great news — ${addr} — ${trade}`,
          body,
          html: logo ? plainBodyToHtml(body, logo) : undefined
        });
      } else if (w.status === "declined") {
        const body = `Hi ${name},\n\nGood news on our end — we've been awarded ${addr}. On this occasion we've gone with another contractor for the ${trade} package, but I genuinely appreciate the time and effort that goes into pricing a job like this.\n\nWe've got more coming through the pipeline and you'll be hearing from us again.\n\n${sigFooter}`;
        previews.push({
          kind: "declined",
          rfq_id: w.id,
          subcontractor_id: sub?.id,
          to: sub?.email,
          trade,
          businessName: sub?.business_name,
          subject: `Update on ${addr} — ${trade}`,
          body,
          html: logo ? plainBodyToHtml(body, logo) : undefined
        });
      }
    }
    setEmailPreviews(previews);
    setWinStep(3);
  }

  async function executeWin() {
    setBusy(true);
    setError("");
    try {
      const rfqUpdates = winRows.map((w) => ({
        id: w.id,
        status: w.status,
        quote_amount: w.quote_amount === "" ? null : Number(w.quote_amount)
      }));
      const acceptedTrades = winRows
        .filter((w) => w.status === "accepted")
        .map((w) => ({
          trade: w.trade,
          subcontractor: w.sub?.business_name,
          contact: w.sub?.contact,
          email: w.sub?.email,
          phone: w.sub?.mobile,
          quote_amount: w.quote_amount === "" ? null : Number(w.quote_amount),
          subcontractor_id: w.sub?.id,
          rfq_id: w.id
        }));
      const quoteCopies = [];
      const root = sharedJobDropboxRootPath(job.address);
      for (const w of winRows) {
        const path = String(w.quote_pdf_path || "").trim();
        if (!path.startsWith("/")) continue;
        quoteCopies.push({
          fromPath: path,
          accepted: w.status === "accepted",
          trade: w.trade,
          businessName: w.sub?.business_name || "SUB",
          sharedJobRoot: root
        });
      }

      const mailPayload = emailPreviews
        .filter((m) => (m.to || "").trim())
        .map((m) => ({
          to: m.to.trim(),
          subject: m.subject,
          body: m.body,
          html: m.html,
          rfq_id: m.rfq_id,
          subcontractor_id: m.subcontractor_id,
          trade: m.trade,
          businessName: m.businessName || "SUB",
          tag: m.kind === "accepted" ? "WIN-ACCEPT" : "WIN-DECLINE"
        }));

      const fin = await fetch("/api/tender/win-finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.id,
          rfqUpdates,
          acceptedTrades,
          quoteCopies,
          tentative_start_date: null,
          emails: [],
          costIntel: winCostIntel
        })
      });
      const fj = await fin.json();
      if (!fin.ok || !fj.ok) throw new Error(fj.error || "Win finalize failed");

      if (mailPayload.length) {
        const mr = await fetch("/api/tender/outcome-mails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: job.id, jobAddress: job.address, entries: mailPayload })
        });
        const mj = await mr.json();
        if (!mr.ok || !mj.ok) throw new Error(mj.error || "Outcome emails failed");
      }

      setWinOpen(false);
      await load();
      if (fj.project?.id) {
        setWinMessage("Tender marked won. Project created in Operations.");
      }
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  function openLose() {
    const previews = [];
    const addr = job?.address || "";
    const sig = loadEmailSignature();
    const logo = String(sig.logoDataUrl || "").trim();
    for (const r of rfqs) {
      if (r.status !== "received" && r.status !== "accepted") continue;
      const sub = r.subcontractors;
      const name = (sub?.contact || "there").trim();
      const trade = r.trade || "works";
      const body = `Hi ${name},\n\nI wanted to reach out personally — unfortunately we were unsuccessful on the tender for ${addr}.\n\nI know how much time and effort goes into pricing a job properly, and I genuinely appreciate you taking the time to put a number together for us. It doesn't go unnoticed.\n\nWe've got more work coming and I'll be in touch when the next one lands.\n\nThanks again,\n${sigFooter}`;
      previews.push({
        rfq_id: r.id,
        subcontractor_id: sub?.id,
        to: sub?.email,
        trade,
        businessName: sub?.business_name,
        subject: `Tender outcome — ${addr}`,
        body,
        html: logo ? plainBodyToHtml(body, logo) : undefined
      });
    }
    setLosePreviews(previews);
    setLoseOpen(true);
  }

  async function executeLose() {
    setBusy(true);
    setError("");
    try {
      const entries = losePreviews
        .filter((m) => (m.to || "").trim())
        .map((m) => ({
          to: m.to.trim(),
          subject: m.subject,
          body: m.body,
          html: m.html,
          rfq_id: m.rfq_id,
          subcontractor_id: m.subcontractor_id,
          trade: m.trade,
          businessName: m.businessName || "SUB",
          tag: "LOST"
        }));
      if (entries.length) {
        const mr = await fetch("/api/tender/outcome-mails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: job.id, jobAddress: job.address, entries })
        });
        const mj = await mr.json();
        if (!mr.ok || !mj.ok) throw new Error(mj.error || "Mail failed");
      }
      const lr = await fetch("/api/tender/lose-finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, emails: [] })
      });
      const lj = await lr.json();
      if (!lr.ok || !lj.ok) throw new Error(lj.error || "Lose finalize failed");
      setLoseOpen(false);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function draftQuery() {
    if (!queryRfq) return;
    setQueryBusy(true);
    try {
      const res = await fetch("/api/tender/query-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: job?.address, trade: queryRfq.trade, context: "" })
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "Draft failed");
      setQueryBody(j.body || "");
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setQueryBusy(false);
    }
  }

  async function sendQuery() {
    if (!queryRfq) return;
    const sub = queryRfq.subcontractors;
    const to = (sub?.email || "").trim();
    if (!to) {
      setError("Subcontractor email missing.");
      return;
    }
    const subject = `RE: Quote Request – ${job?.address} – ${queryRfq.trade}`;
    setQueryBusy(true);
    try {
      const sig = loadEmailSignature();
      const footer = formatSignatureFooter(sig);
      const fullText = `${queryBody}\n\n${footer}`.trim();
      const html = sig.logoDataUrl ? plainBodyToHtml(fullText, sig.logoDataUrl) : undefined;
      const res = await fetch("/api/rfq/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              to,
              subject,
              body: fullText,
              html,
              rfqId: queryRfq.id,
              jobId,
              subcontractor_id: queryRfq.subcontractor_id
            }
          ]
        })
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "Send failed");
      const sb = getSupabase();
      await sb.from("correspondence").insert({
        job_id: jobId,
        rfq_id: queryRfq.id,
        subcontractor_id: queryRfq.subcontractor_id,
        direction: "outbound",
        subject,
        body: fullText,
        logged_by: "sam"
      });
      setQueryRfq(null);
      setQueryBody("");
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setQueryBusy(false);
    }
  }

  if (!job) {
    return (
      <div className="text-sm text-muted">
        {error || "Loading…"}{" "}
        <Link to="/tender-manager/board" className="font-semibold text-accent underline">
          Back
        </Link>
      </div>
    );
  }

  const badge = JOB_STATUS_BADGE[job.status] || JOB_STATUS_BADGE.tendering;
  const acceptedN = winRows.filter((w) => w.status === "accepted").length;
  const declinedN = winRows.filter((w) => w.status === "declined").length;
  const nrN = winRows.filter((w) => w.status === "not_required").length;

  return (
    <div className="space-y-8 pb-24">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link to="/tender-manager/board" className="font-semibold text-accent underline">
          ← Tenders
        </Link>
        <Link to="/tender-manager/rfq-engine" className="text-muted underline">
          RFQ Engine
        </Link>
      </div>

      <header className="space-y-4 rounded-card border border-hairline bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-primary md:text-3xl">{job.address}</h1>
            <p className="mt-1 text-xs text-muted">Created {new Date(job.created_at).toLocaleString("en-AU")}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${badge.cls}`}>{badge.label}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {dropboxUrl ? (
            <a
              href={dropboxUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-hairline bg-page px-4 py-2 text-sm font-semibold text-primary hover:bg-surface"
            >
              Dropbox folder
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => {
              const p = new URLSearchParams(searchParams);
              p.set("tab", "tender");
              setSearchParams(p, { replace: true });
            }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${jobTab === "tender" ? "bg-primary text-white" : "border border-hairline text-ink"}`}
          >
            Tender
          </button>
          <button
            type="button"
            onClick={() => {
              const p = new URLSearchParams(searchParams);
              p.set("tab", "fee-proposal");
              setSearchParams(p, { replace: true });
            }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${jobTab === "fee-proposal" ? "bg-primary text-white" : "border border-hairline text-ink"}`}
          >
            Fee Proposal
          </button>
          {!readOnly && job.status === "tendering" ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={openWin}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
              >
                Mark as won
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={openLose}
                className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
              >
                Mark as lost
              </button>
            </>
          ) : null}
          {!readOnly && (job.status === "won" || job.status === "lost") ? (
            <button
              type="button"
              disabled={busy}
              onClick={archiveJob}
              className="rounded-lg border border-hairline bg-page px-4 py-2 text-sm font-semibold text-ink"
            >
              Archive
            </button>
          ) : null}
        </div>
      </header>

      {/* Project summary strip */}
      {(() => {
        const ex = job.extracted_data || {};
        const pills = [
          ex.project_type && { label: ex.project_type },
          ex.storeys && { label: `${ex.storeys} ${Number(ex.storeys) === 1 ? "storey" : "storeys"}` },
          ex.floor_area_m2 && { label: `${ex.floor_area_m2} m² GFA` },
        ].filter(Boolean);
        if (!ex.key_project_notes?.trim() && !pills.length) return null;
        return (
          <div className="rounded-card border border-hairline bg-page px-5 py-4 shadow-sm">
            {ex.key_project_notes?.trim() ? (
              <p className="mb-2.5 text-sm leading-relaxed text-ink">{ex.key_project_notes.trim()}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              {pills.map((p, i) => (
                <span key={i} className="rounded-full border border-hairline bg-surface px-2.5 py-0.5 text-xs font-medium text-ink">
                  {p.label}
                </span>
              ))}
              <button
                type="button"
                onClick={() => setScopePanelOpen(true)}
                className="ml-auto text-xs font-semibold text-primary hover:underline"
              >
                Full scope →
              </button>
            </div>
          </div>
        );
      })()}

      {winMessage ? (
        <div className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm text-accent">
          {winMessage}{" "}
          <button type="button" className="font-semibold underline" onClick={() => setWinMessage("")}>
            Dismiss
          </button>
        </div>
      ) : null}

      {error ? <div className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-2 text-sm text-danger">{error}</div> : null}

      {jobTab === "fee-proposal" ? (
        <section className="space-y-4 rounded-card border border-hairline bg-surface p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Fee proposals</h2>
            <button
              type="button"
              onClick={() => navigate(`/tender-manager/fee-proposal/new?jobId=${jobId}`)}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
            >
              New fee proposal
            </button>
          </div>
          {feeProposals.length === 0 ? <p className="text-sm text-muted">No fee proposals for this job yet.</p> : null}
          <ul className="divide-y divide-hairline">
            {feeProposals.map((fp) => (
              <li key={fp.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <span className="font-mono text-xs text-muted">{fp.quote_number || fp.id.slice(0, 8)}</span>
                  <span className="ml-2 rounded-full bg-page px-2 py-0.5 text-[10px] font-bold uppercase text-muted">{fp.status || "draft"}</span>
                </div>
                <Link to={`/tender-manager/fee-proposal/${fp.id}`} className="text-sm font-semibold text-primary underline">
                  Edit
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {jobTab === "tender" ? (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Trades</h2>
          <div className="flex items-center gap-2">
            {scanResult && (
              <span className="text-xs text-muted">{scanResult}</span>
            )}
            <button
              type="button"
              onClick={scanInbox}
              disabled={scanBusy}
              className="flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-muted shadow-sm transition hover:border-primary/40 hover:text-primary disabled:opacity-50"
            >
              {scanBusy ? (
                <>
                  <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.3"/>
                    <path d="M12 3a9 9 0 019 9"/>
                  </svg>
                  Scanning…
                </>
              ) : (
                <>
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16v12H4z"/><path d="M8 20h8M12 16v4"/>
                  </svg>
                  Scan inbox
                </>
              )}
            </button>
          </div>
        </div>
        {rfqs.map((r) => {
          const sub = r.subcontractors;
          const vis = isOverdue(r.deadline, r.status)
            ? { label: "Overdue", cls: "bg-red-600 text-white" }
            : RFQ_STATUS_VIS[r.status] || RFQ_STATUS_VIS.sent;
          const pdfHref = String(r.quote_pdf_url || r.dropbox_pdf_url || "").trim();
          const pdfOpenUrl = pdfHref.startsWith("http") ? pdfHref : "";
          const canToggle = !readOnly && r.quote_amount != null && Number(r.quote_amount) > 0;
          return (
            <div key={r.id} className="rounded-card border border-hairline bg-surface p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">{r.trade}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${vis.cls}`}>{vis.label}</span>
                  </div>
                  <div className="text-sm font-semibold text-ink">{sub?.business_name || "—"}</div>
                  <div className="text-xs text-muted">{(sub?.contact || "—") + (sub?.email ? ` · ${sub.email}` : "")}</div>
                  <div className="grid gap-1 text-xs text-muted sm:grid-cols-2">
                    <div>Sent: {r.sent_at ? new Date(r.sent_at).toLocaleDateString("en-AU") : "—"}</div>
                    <div>Deadline: {r.deadline || "—"}</div>
                    <div>{deadlineLabel(r.deadline, r.status)}</div>
                  </div>
                </div>
                <div className="flex w-full max-w-md flex-col gap-2 border-t border-hairline pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                  <label className="text-xs font-semibold text-muted">
                    Quote amount (ex GST)
                    <input
                      type="number"
                      disabled={readOnly}
                      defaultValue={r.quote_amount ?? ""}
                      className="mt-1 w-full rounded-lg border border-hairline px-2 py-1 text-sm"
                      onBlur={(e) => {
                        if (readOnly) return;
                        const v = e.target.value;
                        if (v === String(r.quote_amount ?? "")) return;
                        updateRfq(r.id, { quote_amount: v === "" ? null : Number(v), manually_entered: true });
                      }}
                    />
                  </label>
                  {r.quoted_amount != null && Number(r.quoted_amount) > 0 && r.quote_amount == null && (
                    <button
                      type="button"
                      className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] font-semibold text-primary"
                      title="Auto-extracted from quote PDF — click to accept"
                      onClick={() => updateRfq(r.id, { quote_amount: Number(r.quoted_amount) })}
                    >
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                      Extracted: {new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(r.quoted_amount)} ex GST
                      {r.quote_extraction?.total_inc_gst && (
                        <span className="text-muted font-normal">
                          {" "}({new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(r.quote_extraction.total_inc_gst)} inc GST)
                        </span>
                      )}
                      {" "}— tap to use
                    </button>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {pdfOpenUrl ? (
                      <a
                        href={pdfOpenUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-accent underline"
                      >
                        View quote PDF
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        title="No quote PDF received yet"
                        className="cursor-not-allowed rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-muted opacity-50"
                      >
                        View quote PDF
                      </button>
                    )}
                    {pdfOpenUrl && (r.quoted_amount == null || r.quoted_amount === 0) && (
                      <button
                        type="button"
                        disabled={reextractBusy[r.id]}
                        onClick={() => reextractAmount(r.id)}
                        title="Extract quote total from PDF using AI"
                        className="rounded-lg border border-warning/50 bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning disabled:opacity-50"
                      >
                        {reextractBusy[r.id] ? "Extracting…" : "Extract amount"}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={readOnly || !canToggle}
                      onClick={() => updateRfq(r.id, { status: r.status === "accepted" ? "received" : "accepted" })}
                      className="rounded-lg border border-accent bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent disabled:opacity-40"
                    >
                      {r.status === "accepted" ? "Un-accept" : "Accept"}
                    </button>
                    <button
                      type="button"
                      disabled={readOnly || !canToggle}
                      onClick={() => updateRfq(r.id, { status: "declined" })}
                      className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-muted disabled:opacity-40"
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => {
                        setQueryRfq(r);
                        setQueryBody("");
                      }}
                      className="rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary"
                    >
                      Query
                    </button>
                  </div>
                </div>
              </div>
              <CorrespondenceBlock rfq={r} rows={corr.filter((c) => c.rfq_id === r.id)} readOnly={readOnly} onLog={logReply} />
              {(() => {
                const tradeKey = Object.keys(TRADE_LABEL).find((k) => TRADE_LABEL[k] === r.trade) || r.trade;
                const notes = coerceExtraction(job.extracted_data).trade_notes?.[tradeKey];
                const bullets = bulletsFromTradeNote(notes);
                if (!bullets.length) return null;
                const open = expandedScopes[r.id];
                return (
                  <div className="mt-3 border-t border-hairline pt-3">
                    <button
                      type="button"
                      onClick={() => setExpandedScopes((s) => ({ ...s, [r.id]: !s[r.id] }))}
                      className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                    >
                      <svg className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M9 18l6-6-6-6"/>
                      </svg>
                      {open ? "Hide" : "View"} extracted scope ({bullets.length} items)
                    </button>
                    {open && (
                      <ul className="mt-2 space-y-1 pl-4">
                        {bullets.map((b, i) => (
                          <li key={i} className="flex gap-2 text-xs text-ink">
                            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
                            {b}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </section>
      ) : null}

      {queryRfq ? (
        <div
          className="fixed inset-0 z-[90] flex justify-end bg-black/40"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && setQueryRfq(null)}
        >
          <div className="h-full w-full max-w-md overflow-y-auto bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-primary">Reply to subcontractor</h2>
              <button type="button" className="text-muted" onClick={() => setQueryRfq(null)}>
                Close
              </button>
            </div>
            <p className="mt-2 text-xs text-muted">To: {(queryRfq.subcontractors?.email || "").trim()}</p>
            <p className="text-xs text-muted">
              Subject: RE: Quote Request – {job.address} – {queryRfq.trade}
            </p>
            <textarea
              value={queryBody}
              onChange={(e) => setQueryBody(e.target.value)}
              rows={14}
              className="mt-4 w-full rounded-lg border border-hairline p-3 text-sm"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={queryBusy} onClick={draftQuery} className="rounded-lg bg-page px-3 py-2 text-sm font-semibold ring-1 ring-hairline">
                Draft with AI
              </button>
              <button
                type="button"
                disabled={queryBusy || !queryBody.trim()}
                onClick={sendQuery}
                className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {winOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" onClick={(e) => e.target === e.currentTarget && setWinOpen(false)}>
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-card border border-hairline bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            {winStep === 1 ? (
              <>
                <h2 className="text-lg font-bold text-primary">Step 1 — Quote review</h2>
                <p className="mt-1 text-sm text-muted">Set outcome for every trade before continuing.</p>
                <button type="button" className="mt-3 text-xs font-semibold text-accent underline" onClick={selectAllReceived}>
                  Select all received quotes
                </button>
                <div className="mt-4 space-y-2">
                  {winRows.map((w) => (
                    <div key={w.id} className="grid gap-2 rounded border border-hairline bg-page p-3 text-sm md:grid-cols-3">
                      <div>
                        <div className="font-semibold">{w.trade}</div>
                        <div className="text-xs text-muted">{w.sub?.business_name}</div>
                      </div>
                      <div>
                        <label className="text-xs text-muted">Quote $</label>
                        <input
                          type="number"
                          className="w-full rounded border px-2 py-1 text-sm"
                          value={w.quote_amount}
                          onChange={(e) =>
                            setWinRows((rows) => rows.map((r) => (r.id === w.id ? { ...r, quote_amount: e.target.value } : r)))
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1 text-xs">
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            checked={w.status === "accepted"}
                            onChange={() => setWinRows((rows) => rows.map((r) => (r.id === w.id ? { ...r, status: "accepted" } : r)))}
                          />
                          Accepted
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            checked={w.status === "declined"}
                            onChange={() => setWinRows((rows) => rows.map((r) => (r.id === w.id ? { ...r, status: "declined" } : r)))}
                          />
                          Declined
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            checked={w.status === "not_required"}
                            onChange={() => setWinRows((rows) => rows.map((r) => (r.id === w.id ? { ...r, status: "not_required" } : r)))}
                          />
                          No quote — not required
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 rounded-lg border border-dashed border-hairline bg-page/50 p-4">
                  <h3 className="text-xs font-bold uppercase text-muted">Cost Intelligence (optional)</h3>
                  <p className="mt-1 text-[11px] text-muted">Quantities stored with each accepted quote row for $/m² analytics.</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <label className="text-[11px] font-semibold text-ink">
                      Floor m²
                      <input
                        type="number"
                        className="mt-0.5 w-full rounded border px-2 py-1 text-sm"
                        value={winCostIntel.floor_area_m2}
                        onChange={(e) => setWinCostIntel((c) => ({ ...c, floor_area_m2: e.target.value }))}
                      />
                    </label>
                    <label className="text-[11px] font-semibold text-ink">
                      Storeys
                      <input
                        type="number"
                        className="mt-0.5 w-full rounded border px-2 py-1 text-sm"
                        value={winCostIntel.storeys}
                        onChange={(e) => setWinCostIntel((c) => ({ ...c, storeys: e.target.value }))}
                      />
                    </label>
                    <label className="text-[11px] font-semibold text-ink">
                      Roof m²
                      <input
                        type="number"
                        className="mt-0.5 w-full rounded border px-2 py-1 text-sm"
                        value={winCostIntel.roof_area_m2}
                        onChange={(e) => setWinCostIntel((c) => ({ ...c, roof_area_m2: e.target.value }))}
                      />
                    </label>
                    <label className="text-[11px] font-semibold text-ink">
                      Wall m²
                      <input
                        type="number"
                        className="mt-0.5 w-full rounded border px-2 py-1 text-sm"
                        value={winCostIntel.wall_area_m2}
                        onChange={(e) => setWinCostIntel((c) => ({ ...c, wall_area_m2: e.target.value }))}
                      />
                    </label>
                    <label className="text-[11px] font-semibold text-ink">
                      Tile floor m²
                      <input
                        type="number"
                        className="mt-0.5 w-full rounded border px-2 py-1 text-sm"
                        value={winCostIntel.tile_area_floor_m2}
                        onChange={(e) => setWinCostIntel((c) => ({ ...c, tile_area_floor_m2: e.target.value }))}
                      />
                    </label>
                    <label className="text-[11px] font-semibold text-ink">
                      Tile wall m²
                      <input
                        type="number"
                        className="mt-0.5 w-full rounded border px-2 py-1 text-sm"
                        value={winCostIntel.tile_area_wall_m2}
                        onChange={(e) => setWinCostIntel((c) => ({ ...c, tile_area_wall_m2: e.target.value }))}
                      />
                    </label>
                    <label className="text-[11px] font-semibold text-ink">
                      Solar kW
                      <input
                        type="number"
                        className="mt-0.5 w-full rounded border px-2 py-1 text-sm"
                        value={winCostIntel.solar_system_kw}
                        onChange={(e) => setWinCostIntel((c) => ({ ...c, solar_system_kw: e.target.value }))}
                      />
                    </label>
                    <label className="text-[11px] font-semibold text-ink">
                      Wet areas
                      <input
                        type="number"
                        className="mt-0.5 w-full rounded border px-2 py-1 text-sm"
                        value={winCostIntel.wet_areas}
                        onChange={(e) => setWinCostIntel((c) => ({ ...c, wet_areas: e.target.value }))}
                      />
                    </label>
                    <label className="text-[11px] font-semibold text-ink sm:col-span-3">
                      Notes
                      <input
                        className="mt-0.5 w-full rounded border px-2 py-1 text-sm"
                        value={winCostIntel.notes}
                        onChange={(e) => setWinCostIntel((c) => ({ ...c, notes: e.target.value }))}
                      />
                    </label>
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <button type="button" className="rounded-lg px-4 py-2 text-sm text-muted" onClick={() => setWinOpen(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                    disabled={!winStep1Valid()}
                    onClick={() => setWinStep(2)}
                  >
                    Continue
                  </button>
                </div>
              </>
            ) : null}
            {winStep === 2 ? (
              <>
                <h2 className="text-lg font-bold text-primary">Step 2 — Confirm</h2>
                <p className="mt-2 text-sm text-ink">
                  You are marking <strong>{job.address}</strong> as WON.
                  <br />
                  {acceptedN} accepted, {declinedN} declined, {nrN} not required.
                </p>
                <p className="mt-2 text-sm text-muted">Next: preview and send outcome emails, then create the Operations project.</p>
                <div className="mt-6 flex justify-end gap-2">
                  <button type="button" className="rounded-lg px-4 py-2 text-sm" onClick={() => setWinStep(1)}>
                    Back
                  </button>
                  <button type="button" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white" onClick={buildEmailPreviewsAndGoStep3}>
                    Continue to emails
                  </button>
                </div>
              </>
            ) : null}
            {winStep === 3 ? (
              <>
                <h2 className="text-lg font-bold text-primary">Step 3 — Email previews</h2>
                <p className="mt-1 text-sm text-muted">Edit any message, then send all and create the project.</p>
                {emailPreviews.length === 0 ? (
                  <p className="mt-4 text-sm text-muted">No outcome emails (no accepted/declined trades with addresses).</p>
                ) : (
                  emailPreviews.map((m, i) => (
                    <label key={i} className="mt-4 block text-xs font-semibold text-muted">
                      {m.kind} → {m.to}
                      <textarea
                        rows={10}
                        className="mt-1 w-full rounded-lg border border-hairline p-2 text-sm"
                        value={m.body}
                        onChange={(e) => {
                          const next = [...emailPreviews];
                          next[i] = { ...next[i], body: e.target.value };
                          setEmailPreviews(next);
                        }}
                      />
                    </label>
                  ))
                )}
                <div className="mt-6 flex justify-end gap-2">
                  <button type="button" className="rounded-lg px-4 py-2 text-sm" onClick={() => setWinStep(2)}>
                    Back
                  </button>
                  <button type="button" disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white" onClick={executeWin}>
                    Send all &amp; create project
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {loseOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" onClick={(e) => e.target === e.currentTarget && setLoseOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card border border-hairline bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-primary">Mark as lost</h2>
            <p className="mt-2 text-sm text-muted">Emails go to subcontractors who provided a quote.</p>
            {losePreviews.length === 0 ? (
              <p className="mt-4 text-sm text-muted">No received quotes — no emails.</p>
            ) : (
              losePreviews.map((p, i) => (
                <label key={i} className="mt-4 block text-xs font-semibold text-muted">
                  To {p.to}
                  <textarea
                    value={p.body}
                    rows={8}
                    className="mt-1 w-full rounded-lg border border-hairline p-2 text-sm text-ink"
                    onChange={(e) => {
                      const next = [...losePreviews];
                      next[i] = { ...next[i], body: e.target.value };
                      setLosePreviews(next);
                    }}
                  />
                </label>
              ))
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-4 py-2 text-sm text-muted" onClick={() => setLoseOpen(false)}>
                Cancel
              </button>
              <button type="button" disabled={busy} className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white" onClick={executeLose}>
                Confirm lost
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Full scope slide-over */}
      {scopePanelOpen ? (
        <div
          className="fixed inset-0 z-[90] flex justify-end bg-black/40"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && setScopePanelOpen(false)}
        >
          <div className="flex h-full w-full max-w-lg flex-col overflow-hidden bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-primary">Project scope</h2>
                <p className="text-xs text-muted">{job.address}</p>
              </div>
              <button type="button" className="text-sm text-muted hover:text-ink" onClick={() => setScopePanelOpen(false)}>
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {/* Project description + key details */}
              {(() => {
                const ex = job.extracted_data || {};
                const specs = ex.building_specs || {};
                const details = [
                  ["Type", ex.project_type],
                  ["Storeys", ex.storeys],
                  ["Floor area", ex.floor_area_m2 ? `${ex.floor_area_m2} m²` : null],
                  ["Arch ref", ex.arch_ref],
                  ["Eng ref", ex.eng_ref],
                  ["External walls", specs.external_walls],
                  ["Roof", specs.roof_type],
                ].filter(([, v]) => v != null && v !== "");
                if (!ex.key_project_notes?.trim() && !details.length) return null;
                return (
                  <section>
                    {ex.key_project_notes?.trim() ? (
                      <p className="mb-3 text-sm leading-relaxed text-ink">{ex.key_project_notes.trim()}</p>
                    ) : null}
                    {details.length > 0 && (
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                        {details.map(([label, val]) => (
                          <div key={label}>
                            <dt className="font-semibold text-muted">{label}</dt>
                            <dd className="text-ink">{val}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </section>
                );
              })()}

              {/* Per-trade scopes — scope_summary only */}
              <section>
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">Trade scopes</h3>
                <div className="space-y-2">
                  {RFQ_TRADE_ORDER.map((tradeKey) => {
                    const note = coerceExtraction(job.extracted_data).trade_notes?.[tradeKey];
                    const summary = note?.scope_summary?.trim();
                    if (!summary) return null;
                    const lines = summary.split(/\n|•/).map((l) => l.trim()).filter(Boolean);
                    return (
                      <div key={tradeKey} className="rounded-lg border border-hairline bg-page px-3 py-2.5">
                        <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                          {TRADE_LABEL[tradeKey] || tradeKey}
                        </div>
                        <ul className="space-y-0.5">
                          {lines.map((l, i) => (
                            <li key={i} className="flex gap-2 text-xs text-ink">
                              <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/40" />
                              {l}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
